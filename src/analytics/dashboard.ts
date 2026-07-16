/**
 * Dashboard generator — pure. Renders Metrics into ONE self-contained static
 * HTML page (inline CSS/SVG/JS, zero external requests) suitable for GitHub
 * Pages (free) or opening from disk. No hosted app platform, no database.
 *
 * Chart design follows a validated palette: categorical hues in fixed order
 * for the three categories, a single sequential hue for magnitude charts,
 * thin marks with rounded data-ends, 2px surface gaps between stacked
 * segments, hover tooltips, and a plain-table fallback for every number.
 */
import type { Category } from "../core/types";
import { CATEGORIES } from "../core/types";
import type { DailyRow, Metrics } from "./metrics";

/** Escape untrusted Sheet-derived strings before they enter the HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const esc = escapeHtml;

/** Categorical slots (fixed order — identity, never re-ranked). */
const SERIES: Record<Category, { light: string; dark: string; label: string }> = {
  profs: { light: "#2a78d6", dark: "#3987e5", label: "Profs" },
  sponsors: { light: "#008300", dark: "#008300", label: "Sponsors" },
  students: { light: "#e87ba4", dark: "#d55181", label: "Students" },
};

function fmtRate(pct: number | null): string {
  return pct === null ? "—" : `${pct}%`;
}

/** Round a max up to a clean axis ceiling (1/2/5 × 10^k). */
function niceCeil(n: number): number {
  if (n <= 4) return Math.max(4, n);
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= n) return m * pow;
  }
  return 10 * pow;
}

function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

const W = 660;
const H = 230;
const PAD = { top: 12, right: 8, bottom: 26, left: 34 };

function yTicks(max: number): number[] {
  return [0, max / 2, max].map((v) => Math.round(v));
}

function gridAndAxis(max: number): string {
  const plotH = H - PAD.top - PAD.bottom;
  return yTicks(max)
    .map((v) => {
      const y = PAD.top + plotH - (v / max) * plotH;
      return (
        `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" class="grid"/>` +
        `<text x="${PAD.left - 6}" y="${y + 3.5}" class="axis" text-anchor="end">${v}</text>`
      );
    })
    .join("");
}

/** Stacked columns: sends per day, one segment per category, 2px gaps. */
function sendsChart(daily: DailyRow[]): string {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = niceCeil(Math.max(1, ...daily.map((d) => CATEGORIES.reduce((a, c) => a + d.sent[c], 0))));
  const band = plotW / daily.length;
  const barW = Math.min(24, Math.max(3, band - 6));

  let marks = "";
  daily.forEach((d, i) => {
    const x = PAD.left + i * band + (band - barW) / 2;
    const total = CATEGORIES.reduce((a, c) => a + d.sent[c], 0);
    let yCursor = PAD.top + plotH;
    const segs = CATEGORIES.filter((c) => d.sent[c] > 0);
    segs.forEach((c, si) => {
      const h = (d.sent[c] / max) * plotH;
      const gap = si < segs.length - 1 ? 2 : 0; // 2px surface gap between segments
      yCursor -= h;
      const isTop = si === segs.length - 1;
      const segH = Math.max(0, h - gap);
      marks += isTop
        ? `<path d="${roundedTopRect(x, yCursor, barW, segH, 4)}" fill="var(--cat-${c})"/>`
        : `<rect x="${x}" y="${yCursor}" width="${barW}" height="${segH}" fill="var(--cat-${c})"/>`;
    });
    // Hit target: full band, bigger than the marks; tooltip lists every series.
    marks +=
      `<rect x="${PAD.left + i * band}" y="${PAD.top}" width="${band}" height="${plotH}" ` +
      `class="hit" data-date="${d.date}" data-profs="${d.sent.profs}" ` +
      `data-sponsors="${d.sent.sponsors}" data-students="${d.sent.students}" ` +
      `data-total="${total}" tabindex="0" role="img" ` +
      `aria-label="${d.date}: ${total} sent"/>`;
  });

  const xLabels = daily
    .filter((_, i) => i % 5 === 0 || i === daily.length - 1)
    .map((d) => {
      const i = daily.indexOf(d);
      const x = PAD.left + i * band + band / 2;
      return `<text x="${x}" y="${H - 8}" class="axis" text-anchor="middle">${d.date.slice(5)}</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Initial emails sent per day, stacked by category">${gridAndAxis(max)}${marks}${xLabels}</svg>`;
}

/** Single-series columns (replies per day / time-to-reply histogram). */
function columnsChart(
  points: Array<{ label: string; value: number; sub?: string }>,
  ariaLabel: string,
  labelEvery = 1,
): string {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = niceCeil(Math.max(1, ...points.map((p) => p.value)));
  const band = plotW / points.length;
  const barW = Math.min(24, Math.max(3, band - 6));

  let marks = "";
  points.forEach((p, i) => {
    const x = PAD.left + i * band + (band - barW) / 2;
    const h = (p.value / max) * plotH;
    const y = PAD.top + plotH - h;
    marks += `<path d="${roundedTopRect(x, y, barW, h, 4)}" fill="var(--seq)"/>`;
    if (points.length <= 8 && p.value > 0) {
      marks += `<text x="${x + barW / 2}" y="${y - 4}" class="val" text-anchor="middle">${p.value}</text>`;
    }
    marks +=
      `<rect x="${PAD.left + i * band}" y="${PAD.top}" width="${band}" height="${plotH}" ` +
      `class="hit" data-date="${esc(p.label)}" data-total="${p.value}" tabindex="0" role="img" ` +
      `aria-label="${esc(p.label)}: ${p.value}"/>`;
  });

  const xLabels = points
    .filter((_, i) => i % labelEvery === 0 || i === points.length - 1)
    .map((p) => {
      const i = points.indexOf(p);
      const x = PAD.left + i * band + band / 2;
      return `<text x="${x}" y="${H - 8}" class="axis" text-anchor="middle">${esc(p.sub ?? p.label)}</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">${gridAndAxis(max)}${marks}${xLabels}</svg>`;
}

/** Horizontal bars: reply rate per category, one hue (magnitude, not identity). */
function replyRateBars(m: Metrics): string {
  const rows = CATEGORIES.map((c) => ({
    label: SERIES[c].label,
    pct: m.byCategory[c].replyRatePct,
    detail: `${m.byCategory[c].replied}/${m.byCategory[c].sent}`,
  }));
  const bw = 420;
  const rowH = 34;
  const h = rows.length * rowH + 8;
  const max = Math.max(10, ...rows.map((r) => r.pct ?? 0));
  let out = "";
  rows.forEach((r, i) => {
    const y = 8 + i * rowH;
    const w = r.pct === null ? 0 : Math.max(2, (r.pct / max) * (bw - 150));
    out += `<text x="0" y="${y + 15}" class="lbl">${esc(r.label)}</text>`;
    out += `<rect x="90" y="${y + 4}" width="${w}" height="16" rx="4" fill="var(--seq)"/>`;
    out += `<text x="${96 + w}" y="${y + 16.5}" class="val">${fmtRate(r.pct)} <tspan class="axis">(${esc(r.detail)})</tspan></text>`;
  });
  return `<svg viewBox="0 0 ${bw + 60} ${h + 8}" role="img" aria-label="Reply rate by category">${out}</svg>`;
}

function legend(): string {
  return (
    `<div class="legend">` +
    CATEGORIES.map(
      (c) => `<span class="key"><span class="swatch" style="background:var(--cat-${c})"></span>${SERIES[c].label}</span>`,
    ).join("") +
    `</div>`
  );
}

function statusTable(m: Metrics): string {
  const cols = ["new", "emailed", "followed_up", "replied", "cold", "bounced"] as const;
  const head = `<tr><th>Category</th>${cols.map((c) => `<th>${c}</th>`).join("")}<th>reply rate</th></tr>`;
  const body = CATEGORIES.map((cat) => {
    const c = m.byCategory[cat];
    const cells = [c.pendingNew, c.sent - c.followedUp - c.replied - c.cold, c.followedUp, c.replied, c.cold, c.bounced];
    return `<tr><td>${SERIES[cat].label}</td>${cells.map((v) => `<td>${Math.max(0, v)}</td>`).join("")}<td>${fmtRate(c.replyRatePct)}</td></tr>`;
  }).join("");
  return `<table>${head}${body}</table>`;
}

function variantTable(m: Metrics): string {
  if (m.variants.length === 0) return `<p class="muted">No sends recorded yet.</p>`;
  const rows = m.variants
    .map(
      (v) =>
        `<tr><td>${SERIES[v.category].label}</td><td>${esc(v.variant)}</td>` +
        `<td>${v.sent}</td><td>${v.replied}</td><td>${fmtRate(v.replyRatePct)}</td></tr>`,
    )
    .join("");
  return `<table><tr><th>Category</th><th>Variant</th><th>Sent</th><th>Replied</th><th>Reply rate</th></tr>${rows}</table>`;
}

function dailyTable(daily: DailyRow[]): string {
  const rows = daily
    .filter((d) => CATEGORIES.some((c) => d.sent[c] > 0) || d.replied > 0 || d.bounced > 0)
    .map(
      (d) =>
        `<tr><td>${d.date}</td><td>${d.sent.profs}</td><td>${d.sent.sponsors}</td>` +
        `<td>${d.sent.students}</td><td>${d.replied}</td><td>${d.bounced}</td></tr>`,
    )
    .join("");
  return (
    `<details><summary>Data table (per day)</summary><table>` +
    `<tr><th>Date</th><th>Profs</th><th>Sponsors</th><th>Students</th><th>Replied</th><th>Bounced</th></tr>` +
    (rows || `<tr><td colspan="6">No activity in the window.</td></tr>`) +
    `</table></details>`
  );
}

function statTile(label: string, value: string, sub?: string): string {
  return (
    `<div class="tile"><div class="tile-label">${esc(label)}</div>` +
    `<div class="tile-value">${esc(value)}</div>` +
    (sub ? `<div class="tile-sub">${esc(sub)}</div>` : "") +
    `</div>`
  );
}

export function renderDashboardHtml(m: Metrics, opts: { title?: string } = {}): string {
  const title = opts.title ?? "Outreach dashboard";
  const t = m.totals;
  const repliesDaily = m.daily.map((d) => ({ label: d.date, value: d.replied, sub: d.date.slice(5) }));
  const ttr = m.timeToReply.buckets.map((b) => ({ label: b.bucket, value: b.count }));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e;
  --muted: #898781; --grid: #e1e0d9; --border: rgba(11,11,11,0.10);
  --seq: #2a78d6;
  --cat-profs: #2a78d6; --cat-sponsors: #008300; --cat-students: #e87ba4;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7;
    --muted: #898781; --grid: #2c2c2a; --border: rgba(255,255,255,0.10);
    --seq: #3987e5;
    --cat-profs: #3987e5; --cat-sponsors: #008300; --cat-students: #d55181;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7;
  --muted: #898781; --grid: #2c2c2a; --border: rgba(255,255,255,0.10);
  --seq: #3987e5;
  --cat-profs: #3987e5; --cat-sponsors: #008300; --cat-students: #d55181;
}
* { box-sizing: border-box; margin: 0; }
body {
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--page); color: var(--ink); padding: 24px;
}
main { max-width: 1080px; margin: 0 auto; display: grid; gap: 16px; }
h1 { font-size: 20px; font-weight: 650; }
h2 { font-size: 14px; font-weight: 600; color: var(--ink-2); margin-bottom: 10px; }
.sub { color: var(--muted); font-size: 12px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tile, .card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 14px 16px;
}
.tile-label { font-size: 12px; color: var(--ink-2); }
.tile-value { font-size: 30px; font-weight: 650; margin-top: 2px; }
.tile-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
.card { overflow-x: auto; }
svg { display: block; width: 100%; height: auto; }
.grid { stroke: var(--grid); stroke-width: 1; }
.axis { fill: var(--muted); font-size: 10px; }
.lbl { fill: var(--ink-2); font-size: 12px; }
.val { fill: var(--ink); font-size: 11px; font-variant-numeric: tabular-nums; }
.hit { fill: transparent; cursor: default; }
.hit:hover, .hit:focus { fill: color-mix(in srgb, var(--ink) 6%, transparent); outline: none; }
.legend { display: flex; gap: 14px; margin-top: 8px; flex-wrap: wrap; }
.key { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-2); }
.swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--grid); font-size: 13px; }
th { color: var(--ink-2); font-weight: 600; }
details summary { cursor: pointer; color: var(--ink-2); font-size: 13px; margin-bottom: 8px; }
.muted { color: var(--muted); }
#tip {
  position: fixed; pointer-events: none; display: none; z-index: 10;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 10px; font-size: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.15);
}
#tip .t-date { color: var(--ink-2); margin-bottom: 4px; }
#tip .t-row { display: flex; align-items: center; gap: 6px; }
#tip .t-key { width: 10px; height: 2px; display: inline-block; }
#tip .t-val { font-weight: 650; }
footer { color: var(--muted); font-size: 12px; padding-bottom: 12px; }
</style>
</head>
<body>
<main>
  <div>
    <h1>${esc(title)}</h1>
    <div class="sub">Generated ${esc(m.generatedAt)} · window: last ${m.windowDays} days · data source: the CRM Sheet</div>
  </div>

  <div class="tiles">
    ${statTile("Sent", String(t.sent), "initial emails, all time")}
    ${statTile("Replied", String(t.replied), "header-matched real replies")}
    ${statTile("Reply rate", fmtRate(t.replyRatePct), "replies / sent")}
    ${statTile("Bounced", String(t.bounced), "delivery failures")}
    ${statTile("In queue", String(t.pendingNew), "status = new")}
  </div>

  <div class="card">
    <h2>Initial emails sent per day</h2>
    ${sendsChart(m.daily)}
    ${legend()}
  </div>

  <div class="card">
    <h2>Replies detected per day</h2>
    ${columnsChart(repliesDaily, "Replies detected per day", 5)}
  </div>

  <div class="card">
    <h2>Reply rate by category</h2>
    ${replyRateBars(m)}
  </div>

  <div class="card">
    <h2>Time to reply${m.timeToReply.medianDays !== null ? ` <span class="sub">(median ${m.timeToReply.medianDays} day${m.timeToReply.medianDays === 1 ? "" : "s"})</span>` : ""}</h2>
    ${columnsChart(ttr, "Days from initial email to reply")}
  </div>

  <div class="card">
    <h2>Pipeline by category</h2>
    ${statusTable(m)}
  </div>

  <div class="card">
    <h2>Template variants</h2>
    ${variantTable(m)}
  </div>

  <div class="card">
    ${dailyTable(m.daily)}
  </div>

  <footer>Static page generated by <code>cli.ts build-dashboard</code> — no tracking, no external requests, no personal contact data (aggregates only).</footer>
</main>
<div id="tip" role="status"></div>
<script>
(function () {
  var tip = document.getElementById("tip");
  var KEYS = [["profs", "Profs"], ["sponsors", "Sponsors"], ["students", "Students"]];
  function row(label, value, cssVar) {
    var r = document.createElement("div"); r.className = "t-row";
    if (cssVar) { var k = document.createElement("span"); k.className = "t-key"; k.style.background = "var(--cat-" + cssVar + ")"; r.appendChild(k); }
    var v = document.createElement("span"); v.className = "t-val"; v.textContent = value; r.appendChild(v);
    var l = document.createElement("span"); l.textContent = label; r.appendChild(l);
    return r;
  }
  function show(el, x, y) {
    tip.textContent = "";
    var d = document.createElement("div"); d.className = "t-date";
    d.textContent = el.dataset.date || ""; tip.appendChild(d);
    var any = false;
    KEYS.forEach(function (k) {
      if (el.dataset[k[0]] !== undefined) { any = true; tip.appendChild(row(k[1], el.dataset[k[0]], k[0])); }
    });
    if (!any && el.dataset.total !== undefined) tip.appendChild(row("", el.dataset.total, null));
    else if (el.dataset.total !== undefined) tip.appendChild(row("total", el.dataset.total, null));
    tip.style.display = "block";
    var pad = 12, w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(x + pad, window.innerWidth - w - pad) + "px";
    tip.style.top = Math.max(pad, y - h - pad) + "px";
  }
  document.addEventListener("pointermove", function (e) {
    var el = e.target.closest ? e.target.closest(".hit") : null;
    if (el) show(el, e.clientX, e.clientY); else tip.style.display = "none";
  });
  document.addEventListener("focusin", function (e) {
    var el = e.target.closest ? e.target.closest(".hit") : null;
    if (el) { var r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); }
  });
  document.addEventListener("focusout", function () { tip.style.display = "none"; });
})();
</script>
</body>
</html>
`;
}
