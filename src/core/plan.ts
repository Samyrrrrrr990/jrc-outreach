/**
 * Send planning — pure. Exactly which `new` rows get today's initial emails,
 * given what already happened today. Extracted from the pipeline so the
 * invariants that prevent double-sending are locked by unit tests
 * (test/send-plan.test.ts) and survive any future refactor:
 *
 *   - per-category quota, measured against sends already made TODAY
 *   - the global daily cap, also net of today's sends (re-run safe)
 *   - one send per address, ever (duplicates/contacted rows excluded)
 */
import type { Category, Contact } from "./types";
import { applyDailyCap, selectForInitial } from "./status";

export interface CategoryPlanInput {
  cat: Category;
  contacts: Contact[];
  quota: number;
}

export interface CategoryPlan {
  cat: Category;
  selected: Contact[];
}

export function computeSendPlan(
  inputs: CategoryPlanInput[],
  cap: number,
  today: string,
): CategoryPlan[] {
  let capRemaining = cap;
  const selections: Array<[Category, Contact[]]> = [];

  for (const { cat, contacts, quota } of inputs) {
    const emailedToday = contacts.filter((c) => c.date_emailed === today).length;
    capRemaining -= emailedToday; // re-run safety: today's sends count to the cap
    const quotaRemaining = Math.max(0, quota - emailedToday);
    selections.push([cat, selectForInitial(contacts, quotaRemaining)]);
  }

  const capped = applyDailyCap(selections, Math.max(0, capRemaining));
  return capped.map(([cat, selected]) => ({ cat, selected }));
}
