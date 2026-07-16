/**
 * Reply-check + follow-up job (AGENTS.md Agents 3 & 4). Runs more often than
 * the daily job.
 *
 * Order matters: detect replies FIRST (so a contact who replied is excluded
 * from follow-up), then send follow-ups, then retire stale rows to `cold`.
 * do_not_contact and replied are never touched — the pure status helpers
 * enforce that.
 */
import type { Category, Contact } from "../core/types";
import { CAMPAIGN, CATEGORY_ORDER } from "../config/campaign";
import { log, RunSummary, setLogPhase } from "../core/logger";
import { assertProofPointsReady } from "../config/proofPoints";
import { dueForCold, dueForFollowUp, isContactable } from "../core/status";
import { ensureSchema, readTab } from "../sheets/crm";
import { fetchRecentInbox } from "../mail/imap";
import {
  buildSentIndex,
  isBounceSender,
  matchReplies,
  type SentRef,
} from "../mail/reply-match";
import { markBounced, markCold, markReplied, sendFollowUp } from "./sender";
import { finalize } from "./scrapeAndSend";

export async function runReplies(dryRun: boolean): Promise<RunSummary> {
  const summary = new RunSummary("reply+followup");
  if (!dryRun) assertProofPointsReady();
  await ensureSchema();

  // Load every tab once; keep a category tag alongside each contact.
  const all: Array<{ cat: Category; contact: Contact }> = [];
  for (const cat of CATEGORY_ORDER) {
    const { contacts } = await readTab(cat);
    for (const contact of contacts) all.push({ cat, contact });
  }

  setLogPhase("replies");
  await detectReplies(all, summary, dryRun);
  setLogPhase("followup");
  await sendFollowUps(all, summary, dryRun);
  setLogPhase("cold");
  await retireCold(all, summary, dryRun);
  setLogPhase(null);

  await finalize(summary, dryRun);
  return summary;
}

/** Match inbox mail to sent Message-IDs; mark replied. Header-based only. */
async function detectReplies(
  all: Array<{ cat: Category; contact: Contact }>,
  summary: RunSummary,
  dryRun: boolean,
): Promise<void> {
  const refs: SentRef[] = all
    .filter(({ contact }) => contact.message_id && isContactable(contact))
    .map(({ cat, contact }) => ({
      category: cat,
      email: contact.email,
      row: contact._row!,
      messageId: contact.message_id,
    }));

  if (refs.length === 0) {
    log.info("No sent messages to match replies against yet");
    return;
  }

  let incoming;
  try {
    incoming = await fetchRecentInbox(14);
  } catch (err) {
    const msg = `inbox fetch failed: ${String(err)}`;
    log.error(msg, { action: "inbox-fetch", result: "error" });
    summary.addError(msg, "inbox");
    return;
  }

  const index = buildSentIndex(refs);
  const { matches, unmatched } = matchReplies(index, incoming);

  const byRow = new Map<number, { cat: Category; contact: Contact }>();
  for (const item of all) byRow.set(item.contact._row!, item);

  for (const { ref, incoming: msg } of matches) {
    // A delivery-failure robot echoing our Message-ID is a BOUNCE, not a
    // reply — count it separately and retire the dead address to cold.
    const bounce = isBounceSender(msg.from);
    if (dryRun) {
      if (bounce) {
        summary.addSkipped("bounce");
        log.info(`[dry-run] would mark bounced: ${ref.email} (from "${msg.from}")`);
      } else {
        summary.repliesDetected++;
        log.info(`[dry-run] would mark replied: ${ref.email} (from "${msg.from}")`);
      }
      continue;
    }
    const found = byRow.get(ref.row);
    if (!found) continue;
    if (bounce) {
      const ok = await markBounced(found.cat, found.contact);
      if (ok) {
        found.contact.status = "cold";
        found.contact.bounced_at = new Date().toISOString();
        summary.addSkipped("bounce");
        log.warn(`Bounce detected: ${ref.email} -> status=cold (bounced)`, {
          category: found.cat,
          action: "bounce",
          result: "marked",
        });
      }
    } else {
      summary.repliesDetected++;
      await markReplied(found.cat, found.contact);
      // Reflect the change in our in-memory copy so follow-up skips it.
      found.contact.status = "replied";
      log.info(`Reply detected: ${ref.email} -> status=replied`, {
        category: found.cat,
        action: "reply",
        result: "marked",
      });
    }
  }

  // Corroboration only: mail from a known contact that we couldn't match by
  // headers is flagged for a human, never auto-marked (AGENTS.md).
  const known = new Set(refs.map((r) => r.email));
  for (const msg of unmatched) {
    if (msg.from && known.has(msg.from)) {
      log.warn(
        `Possible reply from known contact ${msg.from} with no matching ` +
          `header; flagged for manual review (subject: "${msg.subject}")`,
      );
      summary.addSkipped("manual-review");
    }
  }
}

/** Send the one permitted follow-up to rows that are due. */
async function sendFollowUps(
  all: Array<{ cat: Category; contact: Contact }>,
  summary: RunSummary,
  dryRun: boolean,
): Promise<void> {
  let capRemaining: number = CAMPAIGN.dailyCap;
  for (const { cat, contact } of all) {
    if (capRemaining <= 0) break;
    if (!dueForFollowUp(contact, CAMPAIGN.followUpAfterDays)) continue;
    try {
      const sent = await sendFollowUp(cat, contact, dryRun);
      if (sent) {
        summary.addFollowUp(cat);
        capRemaining--;
      } else {
        summary.addSkipped("status-changed");
      }
    } catch (err) {
      const msg = `follow-up ${cat} ${contact.email} failed: ${String(err)}`;
      log.error(msg, { category: cat, action: "followup", result: "error" });
      summary.addError(msg, cat);
      summary.addSkipped("followup-error");
    }
  }
}

/** Retire rows that waited out the follow-up window with no reply. */
async function retireCold(
  all: Array<{ cat: Category; contact: Contact }>,
  summary: RunSummary,
  dryRun: boolean,
): Promise<void> {
  for (const { cat, contact } of all) {
    if (!dueForCold(contact, CAMPAIGN.coldAfterDays)) continue;
    if (dryRun) {
      log.info(`[dry-run] would mark cold: ${contact.email}`);
      summary.wentCold++;
      continue;
    }
    const ok = await markCold(cat, contact);
    if (ok) {
      summary.wentCold++;
      log.info(`No reply after follow-up: ${contact.email} -> status=cold`);
    }
  }
}
