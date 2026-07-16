/**
 * robots.txt gate. Checked before crawling any new domain (SKILLS.md §2). One
 * fetch per origin, cached for the process. If robots.txt is missing or
 * unreachable we default to ALLOW (standard convention); if it is present and
 * disallows the path for our agent, we skip.
 */
import robotsParser from "robots-parser";
import { CAMPAIGN } from "../config/campaign";
import { log } from "../core/logger";

interface Robots {
  isAllowed(url: string, ua?: string): boolean | undefined;
}

const cache = new Map<string, Robots | null>();

async function getRobots(origin: string): Promise<Robots | null> {
  if (cache.has(origin)) return cache.get(origin) ?? null;
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": CAMPAIGN.userAgent },
      redirect: "follow",
    });
    if (!res.ok) {
      // No robots.txt (404) or server error -> convention is allow-all.
      cache.set(origin, null);
      return null;
    }
    const body = await res.text();
    const robots = robotsParser(robotsUrl, body) as Robots;
    cache.set(origin, robots);
    return robots;
  } catch (err) {
    log.warn(`robots.txt unreachable for ${origin}; defaulting to allow`, {
      err: String(err),
    });
    cache.set(origin, null);
    return null;
  }
}

/** True if our agent may fetch `url` per that origin's robots.txt. */
export async function isAllowed(url: string): Promise<boolean> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }
  const robots = await getRobots(origin);
  if (!robots) return true; // no robots.txt -> allowed
  const verdict = robots.isAllowed(url, CAMPAIGN.userAgent);
  // `undefined` means no matching rule -> allowed.
  return verdict !== false;
}

/** Test seam. */
export function clearRobotsCache(): void {
  cache.clear();
}
