/**
 * Scraper orchestration (AGENTS.md Agent 1). Keeps the CRM stocked with fresh,
 * real, deduped, provenance-tagged contacts — and stops early once a category
 * has enough `new` rows to fill its daily quota, so we never over-scrape.
 */
import type { Category, Contact, ScrapedContact } from "../core/types";
import { categoryConfig } from "../config/campaign";
import {
  SPONSOR_SEEDS,
  directorySourcesFor,
  type SponsorSeed,
} from "../config/sources";
import { log, type RunSummary } from "../core/logger";
import { fetchPage } from "./fetcher";
import { parseDirectory } from "./parse";
import { extractEmails, looksLikeEmail, normalizeEmail } from "./email";
import { dedupeAgainst } from "./dedup";
import { appendContacts, readTab } from "../sheets/crm";

/** How many more `new` rows this category needs to hit its quota today. */
function shortfall(contacts: Contact[], quota: number): number {
  const currentNew = contacts.filter((c) => c.status === "new").length;
  return Math.max(0, quota - currentNew);
}

/** Scrape profs/students directory pages until `needed` fresh contacts found. */
async function collectDirectory(
  cat: Extract<Category, "profs" | "students">,
  needed: number,
): Promise<ScrapedContact[]> {
  const found: ScrapedContact[] = [];
  for (const source of directorySourcesFor(cat)) {
    if (found.length >= needed) break;
    const page = await fetchPage(source.url);
    if (!page) continue;
    const contacts = parseDirectory(page.html, source);
    log.info(`Scraped ${contacts.length} candidate(s) from ${source.label}`);
    found.push(...contacts);
  }
  return found;
}

/** Turn sponsor seeds into candidates (known email, or scrape a contact page). */
async function collectSponsors(needed: number): Promise<ScrapedContact[]> {
  const found: ScrapedContact[] = [];
  for (const seed of SPONSOR_SEEDS) {
    if (found.length >= needed) break;
    const candidate = await sponsorToCandidate(seed);
    if (candidate) found.push(candidate);
  }
  return found;
}

async function sponsorToCandidate(seed: SponsorSeed): Promise<ScrapedContact | null> {
  let email = seed.email ? normalizeEmail(seed.email) : "";
  if (email && !looksLikeEmail(email)) {
    log.warn(`Sponsor "${seed.org}" has an invalid seed email; skipping`);
    return null;
  }
  if (!email && seed.contactUrl) {
    const page = await fetchPage(seed.contactUrl);
    if (page) email = extractEmails(page.html)[0] ?? "";
  }
  if (!email) {
    log.warn(`No usable email for sponsor "${seed.org}"; skipping`);
    return null;
  }
  return {
    email,
    name: seed.name,
    org: seed.org,
    field: seed.field,
    source_url: seed.source_url,
  };
}

/**
 * Scrape one category up to its quota, dedupe against the tab, and append the
 * new rows. Returns the number of rows inserted. Respects dry-run by logging
 * intended inserts without writing.
 */
export async function scrapeCategory(
  cat: Category,
  summary: RunSummary,
  dryRun: boolean,
): Promise<number> {
  const quota = categoryConfig(cat).dailyQuota;
  const { contacts } = await readTab(cat);
  const needed = shortfall(contacts, quota);
  if (needed === 0) {
    log.info(`${cat}: already has >= ${quota} new rows; skipping scrape`);
    return 0;
  }

  const raw =
    cat === "sponsors"
      ? await collectSponsors(needed * 2)
      : await collectDirectory(cat, needed * 2);

  const fresh = dedupeAgainst(
    contacts.map((c) => c.email),
    raw,
  ).slice(0, needed);

  if (fresh.length === 0) {
    log.info(`${cat}: no new deduped contacts found this run`);
    return 0;
  }

  if (dryRun) {
    for (const f of fresh) {
      log.info(`[dry-run] would insert ${cat}: ${f.name} <${f.email}> (${f.source_url})`);
    }
    summary.addScraped(cat, fresh.length);
    return fresh.length;
  }

  const inserted = await appendContacts(cat, fresh);
  summary.addScraped(cat, inserted);
  log.info(`${cat}: inserted ${inserted} new contact(s)`);
  return inserted;
}
