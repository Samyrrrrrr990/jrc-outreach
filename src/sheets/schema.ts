/**
 * The Sheet's column layout and the pure row <-> Contact mapping. All three
 * contact tabs (Profs/Sponsors/Students) share this schema, so one CRM module
 * serves them all.
 */
import type { Contact } from "../core/types";
import { isStatus } from "../core/types";
import { normalizeEmail } from "../scrape/email";

/**
 * Column order, left to right. The header row must match this exactly.
 * NEW COLUMNS ARE ONLY EVER APPENDED — v1 rows/indices stay valid, and
 * ensureSchema() extends an existing sheet's header row in place (see
 * compareHeaders below for the safety rule).
 */
export const HEADERS = [
  "email",
  "name",
  "org",
  "field",
  "source_url",
  "status",
  "date_scraped",
  "date_emailed",
  "replied_at",
  "last_followup",
  "date_cold",
  "message_id",
  "notes",
  "variant",
  "bounced_at",
] as const;

/** Last column letter for the schema (13 cols -> "M"). */
export const LAST_COL = String.fromCharCode(64 + HEADERS.length);

export const LOG_HEADERS = [
  "timestamp",
  "job",
  "scraped",
  "sent",
  "followups",
  "replies",
  "cold",
  "skipped",
  "errors",
  "error_detail",
] as const;

export type RowParse =
  | { ok: true; contact: Contact }
  | { ok: false; reason: string; row: number };

export type HeaderComparison = "ok" | "upgrade" | "mismatch";

/**
 * Decide whether an existing header row can be safely upgraded in place.
 * "upgrade" only when the existing row is a strict PREFIX of the expected
 * headers (i.e. we are only appending columns). Any renamed/reordered column
 * is "mismatch" — the caller must fail loudly rather than overwrite a header
 * whose data no longer means what the code thinks it means.
 */
export function compareHeaders(
  existing: readonly string[],
  expected: readonly string[],
): HeaderComparison {
  if (existing.length > expected.length) return "mismatch";
  for (let i = 0; i < existing.length; i++) {
    if ((existing[i] ?? "").trim() !== expected[i]) return "mismatch";
  }
  return existing.length === expected.length ? "ok" : "upgrade";
}

function cell(row: string[], i: number): string {
  return (row[i] ?? "").toString().trim();
}

/**
 * Parse one sheet row (already excluding the header) into a Contact.
 * Malformed rows are reported, never silently coerced into something sendable:
 *   - missing email        -> not ok
 *   - non-empty bad status -> not ok (so a typo can't get emailed)
 *   - empty status         -> treated as "new" (lenient first-run)
 */
export function rowToContact(row: string[], rowNumber: number): RowParse {
  const email = normalizeEmail(cell(row, 0));
  if (!email) {
    return { ok: false, reason: "missing email", row: rowNumber };
  }
  const rawStatus = cell(row, 5);
  let status: Contact["status"];
  if (rawStatus === "") {
    status = "new";
  } else if (isStatus(rawStatus)) {
    status = rawStatus;
  } else {
    return { ok: false, reason: `invalid status "${rawStatus}"`, row: rowNumber };
  }

  return {
    ok: true,
    contact: {
      email,
      name: cell(row, 1),
      org: cell(row, 2),
      field: cell(row, 3),
      source_url: cell(row, 4),
      status,
      date_scraped: cell(row, 6),
      date_emailed: cell(row, 7),
      replied_at: cell(row, 8),
      last_followup: cell(row, 9),
      date_cold: cell(row, 10),
      message_id: cell(row, 11),
      notes: cell(row, 12),
      variant: cell(row, 13),
      bounced_at: cell(row, 14),
      _row: rowNumber,
    },
  };
}

/** Serialise a Contact into a full row in HEADER order. */
export function contactToRow(c: Contact): string[] {
  return [
    c.email,
    c.name,
    c.org,
    c.field,
    c.source_url,
    c.status,
    c.date_scraped,
    c.date_emailed,
    c.replied_at,
    c.last_followup,
    c.date_cold,
    c.message_id,
    c.notes,
    c.variant ?? "",
    c.bounced_at ?? "",
  ];
}

/** Apply a patch to an existing row's values without disturbing other cells. */
export function applyPatch(existingRow: string[], patch: Partial<Contact>): string[] {
  const parsed = rowToContact(existingRow, 0);
  const base: Contact = parsed.ok
    ? parsed.contact
    : ({
        email: normalizeEmail(existingRow[0] ?? ""),
        name: existingRow[1] ?? "",
        org: existingRow[2] ?? "",
        field: existingRow[3] ?? "",
        source_url: existingRow[4] ?? "",
        status: "new",
        date_scraped: existingRow[6] ?? "",
        date_emailed: existingRow[7] ?? "",
        replied_at: existingRow[8] ?? "",
        last_followup: existingRow[9] ?? "",
        date_cold: existingRow[10] ?? "",
        message_id: existingRow[11] ?? "",
        notes: existingRow[12] ?? "",
        variant: existingRow[13] ?? "",
        bounced_at: existingRow[14] ?? "",
      } as Contact);
  return contactToRow({ ...base, ...patch });
}
