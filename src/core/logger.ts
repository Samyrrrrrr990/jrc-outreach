/**
 * Structured logger with a run-summary accumulator. Dependency-free so it
 * works identically in CI and locally. Never logs secrets — callers pass
 * plain values only.
 *
 * Two output formats:
 *   - "json"   one JSON object per line: {ts, level, msg, phase?, dryRun?, ...meta}
 *     — the default on GitHub Actions, so a failure is diagnosable from the
 *     run output alone (grep for "level":"error").
 *   - "pretty" the original human-readable line, the default locally.
 *
 * Callers attach structure via `meta` ({category, action, result, ...}) and
 * the pipeline sets the current phase with setLogPhase().
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "json" | "pretty";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

type Sink = (line: string) => void;

// eslint-disable-next-line no-console
const consoleSink: Sink = (line) => console.log(line);

const DEFAULTS = {
  threshold: "info" as LogLevel,
  dryRun: false,
  format: "pretty" as LogFormat,
  sink: consoleSink,
  phase: null as string | null,
};

let threshold = DEFAULTS.threshold;
let dryRun = DEFAULTS.dryRun;
let format = DEFAULTS.format;
let sink = DEFAULTS.sink;
let phase = DEFAULTS.phase;

export function configureLogger(opts: {
  level?: LogLevel;
  dryRun?: boolean;
  format?: LogFormat;
  sink?: Sink;
}): void {
  if (opts.level) threshold = opts.level;
  if (typeof opts.dryRun === "boolean") dryRun = opts.dryRun;
  if (opts.format) format = opts.format;
  if (opts.sink) sink = opts.sink;
}

/** Tag every subsequent line with the pipeline phase (null to clear). */
export function setLogPhase(p: string | null): void {
  phase = p;
}

/** Test seam: restore all defaults (console sink, pretty, info, no phase). */
export function resetLogger(): void {
  threshold = DEFAULTS.threshold;
  dryRun = DEFAULTS.dryRun;
  format = DEFAULTS.format;
  sink = DEFAULTS.sink;
  phase = DEFAULTS.phase;
}

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[threshold]) return;
  const time = new Date().toISOString();

  if (format === "json") {
    const record: Record<string, unknown> = { ts: time, level, msg };
    if (phase) record.phase = phase;
    if (dryRun) record.dryRun = true;
    if (meta) Object.assign(record, meta);
    sink(JSON.stringify(record));
    return;
  }

  const prefix = dryRun ? "[DRY-RUN]" : "";
  const tag = `${time} ${level.toUpperCase().padEnd(5)}${prefix}`;
  const phaseTag = phase ? ` [${phase}]` : "";
  if (meta && Object.keys(meta).length > 0) {
    sink(`${tag}${phaseTag} ${msg} ${JSON.stringify(meta)}`);
  } else {
    sink(`${tag}${phaseTag} ${msg}`);
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
  errorsByCategory: Record<string, number> = {};

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

  addError(msg: string, category = "general") {
    this.errors.push(msg);
    this.add(this.errorsByCategory, category);
  }

  /** Highest per-category error count — what the alert threshold compares to. */
  maxCategoryErrors(): number {
    return Math.max(0, ...Object.values(this.errorsByCategory));
  }

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

  /** Structured counterpart of toLine(), for the JSON log stream. */
  toMeta(): Record<string, unknown> {
    return {
      job: this.job,
      scraped: this.total(this.scraped),
      sent: this.total(this.sent),
      followups: this.total(this.followUps),
      replies: this.repliesDetected,
      cold: this.wentCold,
      skipped: this.total(this.skipped),
      errors: this.errors.length,
    };
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
