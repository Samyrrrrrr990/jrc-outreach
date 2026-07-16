/**
 * Small structured logger with a run-summary accumulator. Kept dependency-free
 * so it works identically in CI and locally. Never logs secrets — callers pass
 * plain values only.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let threshold: LogLevel = "info";
let dryRun = false;

export function configureLogger(opts: { level?: LogLevel; dryRun?: boolean }): void {
  if (opts.level) threshold = opts.level;
  if (typeof opts.dryRun === "boolean") dryRun = opts.dryRun;
}

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[threshold]) return;
  const prefix = dryRun ? "[DRY-RUN]" : "";
  const time = new Date().toISOString();
  const tag = `${time} ${level.toUpperCase().padEnd(5)}${prefix}`;
  if (meta && Object.keys(meta).length > 0) {
    // eslint-disable-next-line no-console
    console.log(`${tag} ${msg}`, JSON.stringify(meta));
  } else {
    // eslint-disable-next-line no-console
    console.log(`${tag} ${msg}`);
  }
}

export const log = {
  debug: (m: string, meta?: Record<string, unknown>) => emit("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
};

/**
 * Accumulates the numbers AGENTS.md requires every run to report, so the day's
 * work can be audited from one line of output (and optionally a Log tab).
 */
export class RunSummary {
  readonly job: string;
  readonly startedAt = new Date();
  scraped: Record<string, number> = {};
  sent: Record<string, number> = {};
  followUps: Record<string, number> = {};
  repliesDetected = 0;
  wentCold = 0;
  skipped: Record<string, number> = {};
  errors: string[] = [];

  constructor(job: string) {
    this.job = job;
  }

  add(bucket: Record<string, number>, key: string, n = 1): void {
    bucket[key] = (bucket[key] ?? 0) + n;
  }

  addScraped(cat: string, n = 1) { this.add(this.scraped, cat, n); }
  addSent(cat: string, n = 1) { this.add(this.sent, cat, n); }
  addFollowUp(cat: string, n = 1) { this.add(this.followUps, cat, n); }
  addSkipped(reason: string, n = 1) { this.add(this.skipped, reason, n); }
  addError(msg: string) { this.errors.push(msg); }

  private total(bucket: Record<string, number>): number {
    return Object.values(bucket).reduce((a, b) => a + b, 0);
  }

  /** One-line, human-readable summary. */
  toLine(): string {
    const secs = ((Date.now() - this.startedAt.getTime()) / 1000).toFixed(1);
    const parts = [
      `job=${this.job}`,
      `scraped=${this.total(this.scraped)}${fmt(this.scraped)}`,
      `sent=${this.total(this.sent)}${fmt(this.sent)}`,
      `followups=${this.total(this.followUps)}${fmt(this.followUps)}`,
      `replies=${this.repliesDetected}`,
      `cold=${this.wentCold}`,
      `skipped=${this.total(this.skipped)}${fmt(this.skipped)}`,
      `errors=${this.errors.length}`,
      `dur=${secs}s`,
    ];
    return parts.join(" ");
  }

  /** Row for the Sheet "Log" tab. */
  toSheetRow(): string[] {
    return [
      new Date().toISOString(),
      this.job,
      String(this.total(this.scraped)),
      String(this.total(this.sent)),
      String(this.total(this.followUps)),
      String(this.repliesDetected),
      String(this.wentCold),
      String(this.total(this.skipped)),
      String(this.errors.length),
      this.errors.slice(0, 5).join(" | "),
    ];
  }
}

function fmt(bucket: Record<string, number>): string {
  const keys = Object.keys(bucket);
  if (keys.length === 0) return "";
  const inner = keys.map((k) => `${k}:${bucket[k]}`).join(",");
  return `(${inner})`;
}
