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
import { log, RunSummary, setLogPhase } from "../core/logger";
import { loadEnv } from "../config/env";
import {
  alertErrorThreshold,
  alertsEnabled,
  shouldSendAlert,
  trySendAlert,
} from "../mail/alerts";
import { assertProofPointsReady } from "../config/proofPoints";
import { selectForInitial } from "../core/status";
import { ensureSchema, readTab, appendLogRow } from "../sheets/crm";
import { scrapeCategory } from "../scrape/scraper";
import { sendInitial } from "./sender";

/** Scrape phase: restock every category up to its quota. */
export async function scrapePhase(summary: RunSummary, dryRun: boolean): Promise<void> {
  setLogPhase("scrape");
  for (const cat of CATEGORY_ORDER) {
    try {
      await scrapeCategory(cat, summary, dryRun);
    } catch (err) {
      const msg = `scrape ${cat} failed: ${String(err)}`;
      log.error(msg, { category: cat, action: "scrape", result: "error" });
      summary.addError(msg, cat);
    }
  }
  setLogPhase(null);
}

/** Send phase: initial emails, honouring per-day quotas and the daily cap. */
export async function sendInitialsPhase(
  summary: RunSummary,
  dryRun: boolean,
): Promise<void> {
  setLogPhase("send");
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
        log.error(msg, { category: cat, action: "send", result: "error" });
        summary.addError(msg, cat);
        summary.addSkipped("send-error");
      }
    }
    if (capRemaining <= 0) break;
  }
  setLogPhase(null);
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
  setLogPhase("finalize");
  log.info(`RUN SUMMARY ${summary.toLine()}`, summary.toMeta());
  if (summary.errors.length > 0) {
    log.error(`Run completed with ${summary.errors.length} error(s)`, {
      action: "summary",
      result: "errors",
      errors: summary.errors.length,
    });
  }
  const env = loadEnv();
  if (env.LOG_TO_SHEET && !dryRun) {
    await appendLogRow(summary.toSheetRow()).catch((err) =>
      log.warn("Failed to append Log row", { err: String(err) }),
    );
  }

  // A run that completed but hit too many errors in one category is a
  // failure the operator should hear about without checking Actions.
  const decision = {
    enabled: alertsEnabled(),
    dryRun,
    fatal: false,
    errorCount: summary.maxCategoryErrors(),
    threshold: alertErrorThreshold(),
  };
  if (shouldSendAlert(decision)) {
    await trySendAlert({
      job: summary.job,
      kind: "errors",
      errors: summary.errors,
      summaryLine: summary.toLine(),
    });
  }
  setLogPhase(null);
}
