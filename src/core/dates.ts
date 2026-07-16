/**
 * Date helpers. Everything is handled as UTC calendar dates so a run at
 * 23:00 in one timezone and 01:00 in another agree on "today".
 */

/** ISO date, e.g. "2026-07-14" (UTC). */
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Full ISO timestamp, e.g. "2026-07-14T09:30:00.000Z". */
export function nowISO(now: Date = new Date()): string {
  return now.toISOString();
}

/**
 * Whole days between an ISO date/timestamp and `now`. Returns the number of
 * full 24h periods elapsed. Empty/invalid input returns null.
 */
export function daysSince(
  iso: string | undefined | null,
  now: Date = new Date(),
): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const ms = now.getTime() - then.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
