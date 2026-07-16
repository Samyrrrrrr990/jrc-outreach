/**
 * weekly-report — reads the Sheet, renders the markdown report (pure), prints
 * it, and (with --email) mails it to the operator via the existing SMTP
 * account. Informational only: adopting a winning variant is always a manual
 * edit to /templates.
 */
import { CATEGORY_ORDER } from "../config/campaign";
import { todayISO } from "../core/dates";
import { log, setLogPhase } from "../core/logger";
import { sendAlertEmail } from "../mail/alerts";
import { readTab } from "../sheets/crm";
import { computeMetrics, type MetricsRow } from "./metrics";
import { renderWeeklyReport } from "./report";

export async function runWeeklyReport(email: boolean): Promise<void> {
  setLogPhase("weekly-report");
  const rows: MetricsRow[] = [];
  for (const cat of CATEGORY_ORDER) {
    const { contacts } = await readTab(cat);
    for (const contact of contacts) rows.push({ category: cat, contact });
  }

  const markdown = renderWeeklyReport(computeMetrics(rows));
  // The report goes to stdout in full so it's always in the Actions log.
  // eslint-disable-next-line no-console
  console.log(markdown);

  if (email) {
    await sendAlertEmail(`[outreach] Weekly report ${todayISO()}`, markdown);
    log.info("Weekly report emailed", { action: "weekly-report", result: "sent" });
  }
  setLogPhase(null);
}
