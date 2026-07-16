/**
 * CRM operations over the Sheet — the only module that treats the Sheet as the
 * source of truth. Reads whole tabs (filtering by status happens in code, per
 * SKILLS.md §1), appends deduped rows, and updates a single row atomically
 * (re-reading its status immediately before writing to avoid clobbering a
 * concurrent job — AGENTS.md shared invariants).
 */
import type { Category, Contact, ScrapedContact } from "../core/types";
import { CAMPAIGN, categoryConfig } from "../config/campaign";
import { todayISO } from "../core/dates";
import { log } from "../core/logger";
import {
  HEADERS,
  LAST_COL,
  LOG_HEADERS,
  applyPatch,
  compareHeaders,
  contactToRow,
  rowToContact,
} from "./schema";
import {
  appendValues,
  deleteRows,
  ensureTab,
  getValues,
  listTabs,
  updateValues,
} from "./client";

export interface ReadResult {
  contacts: Contact[];
  malformed: number;
}

/**
 * Ensure every tab exists and has the correct header row. When the code adds
 * new trailing columns (e.g. variant/bounced_at), an existing sheet whose
 * headers are a strict prefix is upgraded in place; a header row that
 * DIFFERS (renamed/reordered columns) throws loudly instead of being
 * overwritten — the data under it no longer means what the code assumes.
 */
export async function ensureSchema(): Promise<void> {
  const tabs = [
    ...Object.values(CAMPAIGN.categories).map((c) => c.tab),
    CAMPAIGN.logTab,
  ];
  const existing = await listTabs();
  for (const tab of tabs) {
    if (!existing.includes(tab)) {
      await ensureTab(tab);
      log.info(`Created missing tab "${tab}"`);
    }
    const headers = tab === CAMPAIGN.logTab ? LOG_HEADERS : HEADERS;
    const firstRow = await getValues(`${tab}!A1:${colFor(headers.length)}1`);
    const current = (firstRow[0] ?? []).map((v) => String(v));
    if (current.length === 0) {
      await updateValues(`${tab}!A1`, [headers as unknown as string[]]);
      log.info(`Wrote header row for "${tab}"`);
      continue;
    }
    const verdict = compareHeaders(current, headers);
    if (verdict === "upgrade") {
      await updateValues(`${tab}!A1`, [headers as unknown as string[]]);
      log.info(`Upgraded header row for "${tab}" (+${headers.length - current.length} column(s))`);
    } else if (verdict === "mismatch") {
      throw new Error(
        `Header row of tab "${tab}" does not match the expected schema ` +
          `(found: ${current.join(", ")}). Refusing to write — fix the sheet ` +
          `or the code so they agree.`,
      );
    }
  }
}

function colFor(count: number): string {
  return String.fromCharCode(64 + count);
}

/** Read all contacts in a category's tab, skipping (and counting) malformed rows. */
export async function readTab(cat: Category): Promise<ReadResult> {
  const tab = categoryConfig(cat).tab;
  const rows = await getValues(`${tab}!A1:${LAST_COL}`);
  const contacts: Contact[] = [];
  let malformed = 0;
  // Row 1 is the header; data starts at sheet row 2.
  for (let i = 1; i < rows.length; i++) {
    const sheetRow = i + 1;
    const parsed = rowToContact(rows[i] ?? [], sheetRow);
    if (parsed.ok) {
      contacts.push(parsed.contact);
    } else {
      malformed++;
      log.warn(`Skipping malformed row ${sheetRow} in ${tab}: ${parsed.reason}`);
    }
  }
  return { contacts, malformed };
}

/** Current set of emails already present in a tab (for dedup). */
export async function existingEmails(cat: Category): Promise<Set<string>> {
  const { contacts } = await readTab(cat);
  return new Set(contacts.map((c) => c.email));
}

/**
 * Append newly scraped contacts as `new` rows. Assumes the caller already
 * deduped against existing rows; this is a batched single append call.
 */
export async function appendContacts(
  cat: Category,
  scraped: ScrapedContact[],
): Promise<number> {
  if (scraped.length === 0) return 0;
  const tab = categoryConfig(cat).tab;
  const today = todayISO();
  const rows = scraped.map((s) =>
    contactToRow({
      email: s.email,
      name: s.name,
      org: s.org,
      field: s.field,
      source_url: s.source_url,
      status: "new",
      date_scraped: today,
      date_emailed: "",
      replied_at: "",
      last_followup: "",
      date_cold: "",
      message_id: "",
      notes: "",
    }),
  );
  await appendValues(`${tab}!A1`, rows);
  return rows.length;
}

/**
 * Atomically patch one row. Re-reads the row first; if `expectStatus` is given
 * and the live status differs, the write is skipped and false is returned
 * (another job already moved it).
 */
export async function patchContact(
  cat: Category,
  rowNumber: number,
  patch: Partial<Contact>,
  expectStatus?: Contact["status"],
): Promise<boolean> {
  const tab = categoryConfig(cat).tab;
  const range = `${tab}!A${rowNumber}:${LAST_COL}${rowNumber}`;
  const current = (await getValues(range))[0] ?? [];
  if (expectStatus !== undefined) {
    const liveStatus = (current[5] ?? "").toString().trim();
    if (liveStatus !== expectStatus) {
      log.warn(
        `Row ${rowNumber} in ${tab} is "${liveStatus}", expected "${expectStatus}"; skipping write`,
      );
      return false;
    }
  }
  const updated = applyPatch(current, patch);
  await updateValues(range, [updated]);
  return true;
}

/** Append one run-summary row to the Log tab. */
export async function appendLogRow(row: string[]): Promise<void> {
  await appendValues(`${CAMPAIGN.logTab}!A1`, [row]);
}

/** Delete contact rows (retention purge only). */
export async function deleteContactRows(cat: Category, rowNumbers: number[]): Promise<void> {
  await deleteRows(categoryConfig(cat).tab, rowNumbers);
}
