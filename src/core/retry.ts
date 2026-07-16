/**
 * Retry with exponential backoff + jitter for TRANSIENT failures only:
 * Sheets API rate limits, SMTP connection verification, IMAP reads, flaky
 * scrape fetches.
 *
 * HARD RULE: an email send is NEVER wrapped in withRetry. Sends must stay
 * exactly-once — a timeout after the server accepted the message would
 * otherwise double-send. Only the read/write/fetch operations around a send
 * may retry (the CRM row write is idempotent: it re-writes the same values).
 */

export interface RetryOptions {
  /** Total attempts including the first one. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Decide whether an error is worth retrying. Default: isTransientError. */
  isRetryable?: (err: unknown) => boolean;
  /** Called before each sleep, for logging. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  /** Test seams. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Run `fn`, retrying transient failures with exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8000;
  const retryable = opts.isRetryable ?? isTransientError;
  const sleep = opts.sleep ?? realSleep;
  const random = opts.random ?? Math.random;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !retryable(err)) throw err;
      // Full delay at random()=1, half at 0 — spreads concurrent retries out.
      const exp = Math.min(max, base * 2 ** (attempt - 1));
      const delayMs = Math.round(exp * (0.5 + 0.5 * random()));
      opts.onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "ENOTFOUND",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "ABORT_ERR",
]);

const TRANSIENT_MESSAGE = /rate limit|quota exceeded|timed? ?out|socket hang up|network|fetch failed|temporarily unavailable|econnreset/i;

/**
 * Heuristic over the error shapes we actually see: googleapis/gaxios attach a
 * numeric `code` or `response.status`; Node network errors use string codes;
 * undici's fetch throws TypeError("fetch failed").
 */
export function isTransientError(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  const e = err as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
    message?: unknown;
  };
  for (const status of [e.code, e.status, e.response?.status]) {
    if (typeof status === "number") {
      if (status === 429 || status >= 500) return true;
      if (status >= 400) return false; // explicit client error -> permanent
    }
  }
  if (typeof e.code === "string" && TRANSIENT_CODES.has(e.code)) return true;
  if (typeof e.message === "string" && TRANSIENT_MESSAGE.test(e.message)) return true;
  return false;
}
