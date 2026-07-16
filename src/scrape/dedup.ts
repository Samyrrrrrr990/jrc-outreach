/**
 * Deduplication — pure. AGENTS.md: never insert a duplicate email into a tab.
 * Matching is case-insensitive on the normalised address.
 */
import type { ScrapedContact } from "../core/types";
import { normalizeEmail } from "./email";

/**
 * Filter `candidates` down to those whose email is not already in
 * `existingEmails` and not repeated within the batch. Preserves input order.
 */
export function dedupeAgainst(
  existingEmails: Iterable<string>,
  candidates: ScrapedContact[],
): ScrapedContact[] {
  const seen = new Set<string>();
  for (const e of existingEmails) seen.add(normalizeEmail(e));

  const out: ScrapedContact[] = [];
  for (const c of candidates) {
    const key = normalizeEmail(c.email);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, email: key });
  }
  return out;
}
