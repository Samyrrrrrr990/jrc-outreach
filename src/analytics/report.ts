/**
 * Weekly report — pure. Renders Metrics into a short markdown summary: the
 * week's activity plus per-variant performance with an honest statistical
 * read. It INFORMS ONLY — nothing here (or anywhere) switches templates
 * automatically; the operator decides and edits /templates by hand.
 */
import { CATEGORIES } from "../core/types";
import type { Metrics, VariantStat } from "./metrics";

export interface VariantSample {
  sent: number;
  replied: number;
}

export interface VariantComparison {
  z: number;
  significant: boolean;
}

/** Minimum sends per variant before we're willing to call a winner. */
export const MIN_SAMPLE = 20;

/**
 * Two-proportion z-test on reply rates. `significant` requires BOTH a
 * |z| >= 1.96 (~95%) and a minimum sample per arm — a big rate gap on five
 * sends is noise, not signal.
 */
export function compareVariants(
  a: VariantSample,
  b: VariantSample,
  minSample: number = MIN_SAMPLE,
): VariantComparison {
  if (a.sent === 0 || b.sent === 0) return { z: 0, significant: false };
  const p1 = a.replied / a.sent;
  const p2 = b.replied / b.sent;
  const pooled = (a.replied + b.replied) / (a.sent + b.sent);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.sent + 1 / b.sent));
  const z = se === 0 ? 0 : (p1 - p2) / se;
  const significant = Math.abs(z) >= 1.96 && a.sent >= minSample && b.sent >= minSample;
  return { z, significant };
}

function pct(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

function variantSection(variants: VariantStat[], minSample: number): string[] {
  const lines: string[] = ["## Variant performance", ""];
  const tracked = variants.filter((v) => v.variant !== "(untracked)");
  if (tracked.length === 0) {
    lines.push("_No variant-tagged sends yet._", "");
    return lines;
  }

  lines.push("| Category | Variant | Sent | Replied | Reply rate |");
  lines.push("|---|---|---|---|---|");
  for (const v of variants) {
    lines.push(`| ${v.category} | ${v.variant} | ${v.sent} | ${v.replied} | ${pct(v.replyRatePct)} |`);
  }
  lines.push("");

  for (const cat of CATEGORIES) {
    const inCat = tracked
      .filter((v) => v.category === cat && v.replyRatePct !== null)
      .sort((a, b) => (b.replyRatePct ?? 0) - (a.replyRatePct ?? 0));
    if (inCat.length < 2) continue;
    const [top, second] = [inCat[0]!, inCat[1]!];
    if (top.sent < minSample || second.sent < minSample) {
      lines.push(
        `- **${cat}**: not enough data yet to compare variants ` +
          `(need ≥${minSample} sends per variant; ` +
          `${top.variant} has ${top.sent}, ${second.variant} has ${second.sent}).`,
      );
      continue;
    }
    const cmp = compareVariants(top, second, minSample);
    if (cmp.significant) {
      lines.push(
        `- **${cat}**: **${top.variant}** is ahead of ${second.variant} ` +
          `(${pct(top.replyRatePct)} vs ${pct(second.replyRatePct)}, z=${cmp.z.toFixed(2)}). ` +
          `Consider adopting it — your call; nothing switches automatically.`,
      );
    } else {
      lines.push(
        `- **${cat}**: the gap between ${top.variant} and ${second.variant} ` +
          `(${pct(top.replyRatePct)} vs ${pct(second.replyRatePct)}) is within noise so far.`,
      );
    }
  }
  lines.push("");
  return lines;
}

export function renderWeeklyReport(m: Metrics, minSample: number = MIN_SAMPLE): string {
  const week = m.daily.slice(-7);
  const sentWeek = week.reduce(
    (a, d) => a + CATEGORIES.reduce((x, c) => x + d.sent[c], 0),
    0,
  );
  const repliedWeek = week.reduce((a, d) => a + d.replied, 0);
  const bouncedWeek = week.reduce((a, d) => a + d.bounced, 0);

  const lines: string[] = [
    "# Weekly outreach report",
    "",
    `_Generated ${m.generatedAt}_`,
    "",
    "## Last 7 days",
    "",
    `- Initial emails sent: **${sentWeek}**`,
    `- Replies detected: **${repliedWeek}**`,
    `- Bounces: **${bouncedWeek}**`,
    "",
    "## All-time by category",
    "",
    "| Category | Sent | Replied | Reply rate | Bounced | In queue |",
    "|---|---|---|---|---|---|",
    ...CATEGORIES.map((c) => {
      const x = m.byCategory[c];
      return `| ${c} | ${x.sent} | ${x.replied} | ${pct(x.replyRatePct)} | ${x.bounced} | ${x.pendingNew} |`;
    }),
    "",
    ...variantSection(m.variants, minSample),
    "---",
    "",
    "_This report is informational. Template changes are always made manually_",
    "_by editing `/templates` — the system never adopts a variant on its own._",
    "",
  ];
  return lines.join("\n");
}
