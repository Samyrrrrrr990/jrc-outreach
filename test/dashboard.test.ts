import { describe, it, expect } from "vitest";
import { renderDashboardHtml, escapeHtml } from "../src/analytics/dashboard";
import { computeMetrics, type MetricsRow } from "../src/analytics/metrics";
import type { Contact } from "../src/core/types";

function contact(over: Partial<Contact>): Contact {
  return {
    email: "a@x.ca", name: "N", org: "O", field: "F", source_url: "https://s",
    status: "new", date_scraped: "2026-07-01", date_emailed: "", replied_at: "",
    last_followup: "", date_cold: "", message_id: "", notes: "",
    variant: "", bounced_at: "",
    ...over,
  };
}

const rows: MetricsRow[] = [
  { category: "profs", contact: contact({ status: "replied", date_emailed: "2026-07-10", replied_at: "2026-07-12T00:00:00Z", variant: "<script>alert(1)</script>" }) },
  { category: "sponsors", contact: contact({ email: "b@y.ca", status: "emailed", date_emailed: "2026-07-11" }) },
];

const metrics = computeMetrics(rows, { now: new Date("2026-07-15T12:00:00Z"), days: 30 });

describe("renderDashboardHtml", () => {
  const html = renderDashboardHtml(metrics, { title: "JRC Outreach" });

  it("is a self-contained page: no external scripts, styles, or images", () => {
    expect(html).not.toMatch(/src\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/<link[^>]+href\s*=\s*["']https?:/i);
    expect(html).toContain("<svg");
  });

  it("shows the headline numbers", () => {
    expect(html).toContain("Reply rate");
    expect(html).toContain("Sent");
  });

  it("escapes untrusted strings from the Sheet (variant names, etc.)", () => {
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes a table view of the data (accessibility fallback)", () => {
    expect(html).toContain("<table");
  });
});

describe("escapeHtml", () => {
  it("escapes the five significant characters", () => {
    expect(escapeHtml(`<a href="x" & 'y'>`)).toBe(
      "&lt;a href=&quot;x&quot; &amp; &#39;y&#39;&gt;",
    );
  });
});
