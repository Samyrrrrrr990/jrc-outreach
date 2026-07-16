/**
 * Data retention — pure selection of rows old enough to purge from the CRM
 * (see DATA_RETENTION.md for the policy).
 *
 * Rules:
 *   - Only `cold` rows (dead leads, incl. bounced) are ever candidates.
 *   - `do_not_contact` rows are NEVER purged — they are the permanent
 *     suppression list; deleting one could let the address be re-scraped
 *     and re-emailed.
 *   - `replied` rows are never auto-purged (active relationships).
 *   - Age comes from date_cold (falling back to bounced_at); a cold row
 *     with no usable date is skipped, never guessed at.
 */
import type { Category, Contact } from "../core/types";
import { daysSince } from "../core/dates";

export interface RetentionCandidate {
  category: Category;
  contact: Contact;
  ageDays: number;
}

export function retentionCandidates(
  rows: Array<{ category: Category; contact: Contact }>,
  retainDays: number,
  now: Date = new Date(),
): RetentionCandidate[] {
  const out: RetentionCandidate[] = [];
  for (const { category, contact } of rows) {
    if (contact.status !== "cold") continue;
    const basis = contact.date_cold || contact.bounced_at || "";
    const age = daysSince(basis, now);
    if (age === null) continue;
    if (age > retainDays) out.push({ category, contact, ageDays: age });
  }
  return out;
}
