/**
 * Daily job: scrape to restock the CRM, then send exactly today's quota of
 * initial emails (AGENTS.md Agents 1 & 2, one GitHub Actions job).
 *
 * Idempotency (SKILLS.md §7): quotas are measured against how many were already
 * emailed TODAY, so running the job twice in a day never exceeds the quota or
 * double-sends — the second run simply finds nothing left to do.
 */
import type { Category, Contact } from "../core/types";
import { CAMPAIGN, CATEGORY_ORDER, categoryConfig } from "../config/campaign";
import { todayISO } from "../core/dates";
import { log, RunSummary } from "../core/logger";
import { loadEnv } from "../config/env";
import { assertProofPointsReady } from "../config/proofPoints";
import { selectForInitial } from "../core/status";
import { ensureSchema, readTab, appendLogRow } from "../sheets/crm";
import { scrapeCategory } from "../scrape/scraper";
import { sendInitial } from "./sender";

/** Scrape phase: restock every category up to its quota. */
export async function scrapePhase(summary: RunSummary, dryRun: boolean): Promise<void> {
  for (const cat of CATEGORY_ORDER) {
    try {
      await scrapeCategory(cat, summary, dryRun);
    } catch (err) {
      const msg = `scrape ${cat} failed: ${String(err)}`;
      log.error(msg);
      summary.addError(msg);
    }
  }
}

/** Send phase: initial emails, honouring per-day quotas and the daily cap. */
export async function sendInitialsPhase(
  summary: RunSummary,
  dryRun: boolean,
): Promise<void> {
  const today = todayISO();
  let capRemaining: number = CAMPAIGN.dailyCap;

  const perCat: Array<{ cat: Category; selected: Contact[] }> = [];
  for (const cat of CATEGORY_ORDER) {
    const { contacts } = await readTab(cat);
    const emailedToday = contacts.filter((c) => c.date_emailed === today).length;
    capRemaining -= emailedToday; // re-run safety: today's sends count to the cap
    const quotaRemaining = Math.max(0, categoryConfig(cat).dailyQuota - emailedToday);
    perCat.push({ cat, selected: selectForInitial(contacts, quotaRemaining) });
  }
  capRemaining = Math.max(0, capRemaining);

  for (const { cat, selected } of perCat) {
    for (const contact of selected) {
      if (capRemaining <= 0) {
        log.warn(`Daily cap of ${CAMPAIGN.dailyCap} reached; stopping sends`);
        break;
      }
      try {
        const sent = await sendInitial(cat, contact, dryRun);
        if (sent) {
          summary.addSent(cat);
          capRemaining--;
        } else {
          summary.addSkipped("status-changed");
        }
      } catch (err) {
        // A single bad merge/contact must not abort the whole run.
        const msg = `send ${cat} ${contact.email} failed: ${String(err)}`;
        log.error(msg);
        summary.addError(msg);
        summary.addSkipped("send-error");
      }
    }
    if (capRemaining <= 0) break;
  }
}

/** Full daily job: scrape, then send. */
export async function runDaily(dryRun: boolean): Promise<RunSummary> {
  const summary = new RunSummary("scrape+send");
  if (!dryRun) assertProofPointsReady();
  await ensureSchema();
  await scrapePhase(summary, dryRun);
  await sendInitialsPhase(summary, dryRun);
  await finalize(summary, dryRun);
  return summary;
}

/** Scrape only. */
export async function runScrape(dryRun: boolean): Promise<RunSummary> {
  const summary = new RunSummary("scrape");
  await ensureSchema();
  await scrapePhase(summary, dryRun);
  await finalize(summary, dryRun);
  return summary;
}

/** Send only. */
export async function runSend(dryRun: boolean): Promise<RunSummary> {
  const summary = new RunSummary("send");
  if (!dryRun) assertProofPointsReady();
  await ensureSchema();
  await sendInitialsPhase(summary, dryRun);
  await finalize(summary, dryRun);
  return summary;
}

export async function finalize(summary: RunSummary, dryRun: boolean): Promise<void> {
  log.info(`RUN SUMMARY ${summary.toLine()}`);
  if (summary.errors.length > 0) {
    log.error(`Run completed with ${summary.errors.length} error(s)`);
  }
  const env = loadEnv();
  if (env.LOG_TO_SHEET && !dryRun) {
    await appendLogRow(summary.toSheetRow()).catch((err) =>
      log.warn("Failed to append Log row", { err: String(err) }),
    );
  }
}
