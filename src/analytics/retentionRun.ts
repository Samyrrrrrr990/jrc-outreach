/**
 * retention — report (and, only with --purge, delete) cold rows past the
 * retention window. Policy in DATA_RETENTION.md. do_not_contact rows are
 * never touched: they are the permanent suppression list.
 */
import { CATEGORY_ORDER } from "../config/campaign";
import { loadEnv } from "../config/env";
import { todayISO } from "../core/dates";
import { log, setLogPhase } from "../core/logger";
import type { Category, Contact } from "../core/types";
import { sendAlertEmail } from "../mail/alerts";
import { deleteContactRows, readTab } from "../sheets/crm";
import { retentionCandidates, type RetentionCandidate } from "./retention";

function report(candidates: RetentionCandidate[], retainDays: number): string {
  const lines = [
    `Retention report ${todayISO()} — cold rows older than ${retainDays} days: ${candidates.length}`,
  ];
  for (const cat of CATEGORY_ORDER) {
    const inCat = candidates.filter((c) => c.category === cat);
    if (inCat.length === 0) continue;
    const oldest = Math.max(...inCat.map((c) => c.ageDays));
    lines.push(`- ${cat}: ${inCat.length} row(s), oldest ${oldest} days`);
  }
  if (candidates.length > 0) {
    lines.push(
      "",
      "Purge with: npx tsx src/cli.ts retention --purge",
      "(do_not_contact and replied rows are never purged — see DATA_RETENTION.md)",
    );
  }
  return lines.join("\n");
}

export async function runRetention(opts: {
  purge: boolean;
  email: boolean;
  dryRun: boolean;
}): Promise<void> {
  setLogPhase("retention");
  const retainDays = loadEnv().RETENTION_DAYS;

  const rows: Array<{ category: Category; contact: Contact }> = [];
  for (const cat of CATEGORY_ORDER) {
    const { contacts } = await readTab(cat);
    for (const contact of contacts) rows.push({ category: cat, contact });
  }

  const candidates = retentionCandidates(rows, retainDays);
  const text = report(candidates, retainDays);
  log.info(text, {
    action: "retention",
    result: "report",
    candidates: candidates.length,
  });
  if (opts.email) {
    await sendAlertEmail(`[outreach] Retention report ${todayISO()}`, text);
  }

  if (!opts.purge || candidates.length === 0) {
    setLogPhase(null);
    return;
  }

  for (const cat of CATEGORY_ORDER) {
    const rowNumbers = candidates
      .filter((c) => c.category === cat && c.contact._row)
      .map((c) => c.contact._row!);
    if (rowNumbers.length === 0) continue;
    if (opts.dryRun) {
      log.info(`[dry-run] would delete ${rowNumbers.length} ${cat} row(s)`, {
        category: cat,
        action: "purge",
        result: "dry-run",
      });
      continue;
    }
    await deleteContactRows(cat, rowNumbers);
    log.info(`Purged ${rowNumbers.length} ${cat} row(s) past retention`, {
      category: cat,
      action: "purge",
      result: "deleted",
      rows: rowNumbers.length,
    });
  }
  setLogPhase(null);
}
