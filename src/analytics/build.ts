/**
 * build-dashboard — the only I/O in the analytics layer. Reads every CRM tab,
 * computes metrics (pure), renders the static page (pure), and writes
 * docs/index.html + docs/data.json for GitHub Pages (free; served from the
 * repo's /docs folder — no hosted app platform, no database).
 *
 * PRIVACY: the page and data.json contain AGGREGATES ONLY — counts, rates,
 * variant ids. No contact emails, names, or rows ever leave the Sheet.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CATEGORY_ORDER } from "../config/campaign";
import { log, setLogPhase } from "../core/logger";
import { readTab } from "../sheets/crm";
import { computeMetrics, type MetricsRow } from "./metrics";
import { renderDashboardHtml } from "./dashboard";

export async function buildDashboard(outDir = "docs"): Promise<void> {
  setLogPhase("dashboard");
  const rows: MetricsRow[] = [];
  for (const cat of CATEGORY_ORDER) {
    const { contacts } = await readTab(cat);
    for (const contact of contacts) rows.push({ category: cat, contact });
  }

  const metrics = computeMetrics(rows);
  const html = renderDashboardHtml(metrics, { title: "JRC Outreach — dashboard" });

  const htmlPath = join(outDir, "index.html");
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html);
  writeFileSync(join(outDir, "data.json"), JSON.stringify(metrics, null, 2));

  log.info(`Dashboard written`, {
    action: "build-dashboard",
    result: "ok",
    out: htmlPath,
    contacts: metrics.totals.contacts,
    sent: metrics.totals.sent,
    replied: metrics.totals.replied,
  });
  setLogPhase(null);
}
