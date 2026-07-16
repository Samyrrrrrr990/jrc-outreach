/**
 * Thin wrapper over the Google Sheets v4 API using a service account (JWT).
 * Batches reads/writes where the callers allow (SKILLS.md §1: Sheets has
 * quotas). No business logic here — see crm.ts.
 */
import { google, type sheets_v4 } from "googleapis";
import { loadEnv } from "../config/env";
import { log } from "../core/logger";
import { withRetry } from "../core/retry";

/**
 * Sheets API calls retry transient failures (429 rate limits, 5xx). Safe:
 * reads are idempotent, and update/append here rewrite the same values —
 * these are CRM writes, never email sends (sends are never retried).
 */
function retried<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    onRetry: ({ attempt, delayMs, error }) =>
      log.warn(`Sheets ${label} failed; retrying`, {
        action: "sheets-retry",
        attempt,
        delayMs,
        err: String(error),
      }),
  });
}

let cached: { sheets: sheets_v4.Sheets; spreadsheetId: string } | null = null;

export function sheetsClient(): { sheets: sheets_v4.Sheets; spreadsheetId: string } {
  if (cached) return cached;
  const env = loadEnv();
  const auth = new google.auth.JWT({
    email: env.serviceAccount.client_email,
    key: env.serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  cached = { sheets, spreadsheetId: env.SHEET_ID };
  return cached;
}

/** Read a single A1 range's values (rows of strings). */
export async function getValues(range: string): Promise<string[][]> {
  const { sheets, spreadsheetId } = sheetsClient();
  const res = await retried(`get ${range}`, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: "UNFORMATTED_VALUE",
    }),
  );
  return (res.data.values as string[][] | undefined) ?? [];
}

/** Overwrite a single A1 range with the given rows. */
export async function updateValues(range: string, values: string[][]): Promise<void> {
  const { sheets, spreadsheetId } = sheetsClient();
  await retried(`update ${range}`, () =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values },
    }),
  );
}

/** Append rows after the last used row of a tab. */
export async function appendValues(range: string, values: string[][]): Promise<void> {
  if (values.length === 0) return;
  const { sheets, spreadsheetId } = sheetsClient();
  // DELIBERATELY NOT RETRIED: if the server committed an append but the
  // response was lost, a retry would duplicate the rows — and two `new` rows
  // for the same address could each pass the per-row status guard and
  // double-send. A transiently failed append just means fewer rows this run;
  // the next scheduled scrape restocks. (Send-time selection additionally
  // dedupes by email as defense-in-depth — see core/status.ts.)
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

/** List existing tab titles. */
export async function listTabs(): Promise<string[]> {
  const { sheets, spreadsheetId } = sheetsClient();
  const res = await retried("listTabs", () =>
    sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" }),
  );
  return (res.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));
}

/** Create a tab if it does not already exist. Returns true if created. */
export async function ensureTab(title: string): Promise<boolean> {
  const existing = await listTabs();
  if (existing.includes(title)) return false;
  const { sheets, spreadsheetId } = sheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  return true;
}

/**
 * Delete whole rows (1-based row numbers) from a tab. Deletions are applied
 * bottom-up in ONE batchUpdate so earlier deletions can't shift the indices
 * of later ones. Used only by the retention purge.
 */
export async function deleteRows(title: string, rowNumbers: number[]): Promise<void> {
  if (rowNumbers.length === 0) return;
  const { sheets, spreadsheetId } = sheetsClient();
  const res = await retried("sheetId lookup", () =>
    sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" }),
  );
  const sheet = (res.data.sheets ?? []).find((s) => s.properties?.title === title);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error(`Tab "${title}" not found; cannot delete rows`);
  }
  const requests = [...rowNumbers]
    .sort((a, b) => b - a)
    .map((row) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: "ROWS" as const,
          startIndex: row - 1,
          endIndex: row,
        },
      },
    }));
  // DELIBERATELY NOT RETRIED: replaying a row deletion after a lost response
  // would delete whichever row slid into that index. A failed purge is safe
  // to re-run from scratch (it re-reads the sheet first).
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

/** Test seam. */
export function resetSheetsClient(): void {
  cached = null;
}
