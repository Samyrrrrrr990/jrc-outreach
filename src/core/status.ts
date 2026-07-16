/**
 * Pure lifecycle logic. No I/O — every function here is a deterministic
 * decision over a Contact plus configuration, which makes the invariants in
 * AGENTS.md ("one follow-up ever", "never touch replied/do_not_contact",
 * "respect quotas and the daily cap") unit-testable in isolation.
 */
import type { Category, Contact } from "./types";
import { daysSince } from "./dates";

/**
 * May we contact this row at all? do_not_contact is checked first and always
 * wins; replied is terminal too.
 */
export function isContactable(c: Contact): boolean {
  return c.status !== "do_not_contact" && c.status !== "replied";
}

/** Rows eligible for the initial send: exactly `new`, and contactable. */
export function eligibleForInitial(c: Contact): boolean {
  return c.status === "new" && isContactable(c);
}

/**
 * Select which `new` rows to email this run. Honours the per-category quota
 * and preserves sheet order (oldest-scraped first, since we append). Pure:
 * the caller decides what "already sent today" means.
 */
export function selectForInitial(rows: Contact[], quota: number): Contact[] {
  if (quota <= 0) return [];
  return rows.filter(eligibleForInitial).slice(0, quota);
}

/**
 * Enforce the global daily cap across categories after per-category selection.
 * Takes an ordered list of [category, selected[]] and trims so the total never
 * exceeds `cap`, draining categories in the given order.
 */
export function applyDailyCap(
  selections: Array<[Category, Contact[]]>,
  cap: number,
): Array<[Category, Contact[]]> {
  let remaining = Math.max(0, cap);
  const out: Array<[Category, Contact[]]> = [];
  for (const [cat, rows] of selections) {
    const take = rows.slice(0, remaining);
    remaining -= take.length;
    out.push([cat, take]);
  }
  return out;
}

/**
 * Is this row due for its single follow-up? Only `emailed` rows that have
 * waited long enough, and are still contactable, qualify.
 */
export function dueForFollowUp(
  c: Contact,
  followUpAfterDays: number,
  now: Date = new Date(),
): boolean {
  if (c.status !== "emailed" || !isContactable(c)) return false;
  const elapsed = daysSince(c.date_emailed, now);
  return elapsed !== null && elapsed >= followUpAfterDays;
}

/**
 * Is this row due to go cold? Only `followed_up` rows whose follow-up is old
 * enough, still contactable, and never replied.
 */
export function dueForCold(
  c: Contact,
  coldAfterDays: number,
  now: Date = new Date(),
): boolean {
  if (c.status !== "followed_up" || !isContactable(c)) return false;
  const elapsed = daysSince(c.last_followup, now);
  return elapsed !== null && elapsed >= coldAfterDays;
}
