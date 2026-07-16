/**
 * Thin wrapper over the Google Sheets v4 API using a service account (JWT).
 * Batches reads/writes where the callers allow (SKILLS.md §1: Sheets has
 * quotas). No business logic here — see crm.ts.
 */
import { google, type sheets_v4 } from "googleapis";
import { loadEnv } from "../config/env";

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
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return (res.data.values as string[][] | undefined) ?? [];
}

/** Overwrite a single A1 range with the given rows. */
export async function updateValues(range: string, values: string[][]): Promise<void> {
  const { sheets, spreadsheetId } = sheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

/** Append rows after the last used row of a tab. */
export async function appendValues(range: string, values: string[][]): Promise<void> {
  if (values.length === 0) return;
  const { sheets, spreadsheetId } = sheetsClient();
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
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
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

/** Test seam. */
export function resetSheetsClient(): void {
  cached = null;
}
