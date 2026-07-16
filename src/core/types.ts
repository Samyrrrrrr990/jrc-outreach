/**
 * Core domain types. The Google Sheet is the single source of truth; these
 * types describe one row of it in memory.
 */

/**
 * Canonical contact lifecycle. Taken verbatim from AGENTS.md so the values a
 * human sees in the Sheet match the spec exactly.
 *
 *   new           - scraped, never contacted
 *   emailed       - initial email sent
 *   followed_up   - the single permitted follow-up has been sent
 *   cold          - no reply after the follow-up window; stop forever
 *   replied       - a real reply was detected; terminal, never followed up
 *   do_not_contact- permanent opt-out; checked before any other logic
 */
export const STATUSES = [
  "new",
  "emailed",
  "followed_up",
  "cold",
  "replied",
  "do_not_contact",
] as const;

export type Status = (typeof STATUSES)[number];

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

/** The three outreach categories, one Sheet tab each. */
export const CATEGORIES = ["profs", "sponsors", "students"] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * One CRM row in memory. All persisted fields are strings (that is how Sheets
 * stores them); `_row` is the 1-based sheet row and is never written back.
 */
export interface Contact {
  /** Lowercased, trimmed primary key. */
  email: string;
  name: string;
  /** Organisation / company / school. */
  org: string;
  /** Department, research field, or focus area. */
  field: string;
  /** Where this contact was scraped from. Required for every row (AGENTS.md). */
  source_url: string;
  status: Status;
  date_scraped: string;
  date_emailed: string;
  replied_at: string;
  last_followup: string;
  date_cold: string;
  /** Message-ID of the initial email we sent, used for reply matching. */
  message_id: string;
  /** Freeform notes / manual-review flags. */
  notes: string;
  /**
   * Template variant used for the initial send (e.g. "control", "b") so
   * analytics can compare reply rates per variant. Empty on v1 rows.
   */
  variant?: string;
  /** When a delivery bounce was detected for the initial/follow-up email. */
  bounced_at?: string;
  /** In-memory only: 1-based row number in the sheet. */
  _row?: number;
}

/** A newly scraped contact, before it is assigned a status/timestamps. */
export interface ScrapedContact {
  email: string;
  name: string;
  org: string;
  field: string;
  source_url: string;
}
