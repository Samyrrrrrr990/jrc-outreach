/**
 * Polite HTTP fetcher: enforces one request per domain per
 * CAMPAIGN.scrapePerDomainMs, checks robots.txt first, sets a truthful
 * User-Agent, and times out. Returns HTML text or null on any skip/failure
 * (callers treat null as "no contacts from here" and move on).
 */
import { CAMPAIGN } from "../config/campaign";
import { log } from "../core/logger";
import { isAllowed } from "./robots";

/** Per-host timestamp of the last request, for rate limiting. */
const lastHit = new Map<string, number>();

function hostOf(url: string): string {
  return new URL(url).host;
}

async function throttle(host: string): Promise<void> {
  const now = Date.now();
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + CAMPAIGN.scrapePerDomainMs - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastHit.set(host, Date.now());
}

export interface FetchResult {
  url: string;
  html: string;
}

/**
 * Fetch a page's HTML, respecting robots.txt and the per-domain rate limit.
 * Returns null (and logs why) if disallowed, non-HTML, or errored.
 */
export async function fetchPage(
  url: string,
  timeoutMs = 15000,
): Promise<FetchResult | null> {
  let host: string;
  try {
    host = hostOf(url);
  } catch {
    log.warn(`Skipping malformed URL: ${url}`);
    return null;
  }

  if (!(await isAllowed(url))) {
    log.warn(`robots.txt disallows crawling; skipping ${url}`);
    return null;
  }

  await throttle(host);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": CAMPAIGN.userAgent,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn(`Fetch ${url} -> HTTP ${res.status}; skipping`);
      return null;
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html")) {
      log.warn(`Fetch ${url} -> non-HTML (${ctype}); skipping`);
      return null;
    }
    const html = await res.text();
    return { url, html };
  } catch (err) {
    log.warn(`Fetch ${url} failed; skipping`, { err: String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam. */
export function clearRateLimitState(): void {
  lastHit.clear();
}
