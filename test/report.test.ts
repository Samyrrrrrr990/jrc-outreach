import { describe, it, expect } from "vitest";
import { compareVariants, renderWeeklyReport } from "../src/analytics/report";
import { computeMetrics, type MetricsRow } from "../src/analytics/metrics";
import type { Contact } from "../src/core/types";

function contact(over: Partial<Contact>): Contact {
  return {
    email: `x${Math.random()}@x.ca`, name: "N", org: "O", field: "F",
    source_url: "https://s", status: "emailed", date_scraped: "2026-07-01",
    date_emailed: "2026-07-10", replied_at: "", last_followup: "",
    date_cold: "", message_id: "", notes: "", variant: "", bounced_at: "",
    ...over,
  };
}

function batch(n: number, replied: number, variant: string): MetricsRow[] {
  return Array.from({ length: n }, (_, i) => ({
    category: "profs" as const,
    contact: contact({
      variant,
      status: i < replied ? "replied" : "emailed",
      replied_at: i < replied ? "2026-07-12T00:00:00Z" : "",
    }),
  }));
}

describe("compareVariants (two-proportion z)", () => {
  it("calls a big, well-sampled gap significant", () => {
    const r = compareVariants({ sent: 100, replied: 30 }, { sent: 100, replied: 10 });
    expect(r.significant).toBe(true);
  });

  it("refuses significance on tiny samples even with a big rate gap", () => {
    const r = compareVariants({ sent: 5, replied: 3 }, { sent: 5, replied: 0 });
    expect(r.significant).toBe(false);
  });
});

describe("renderWeeklyReport", () => {
  it("summarises the week and flags a leading variant when the data supports it", () => {
    const rows = [...batch(100, 30, "control"), ...batch(100, 10, "b")];
    const md = renderWeeklyReport(computeMetrics(rows, { now: new Date("2026-07-15T12:00:00Z") }));
    expect(md).toContain("# Weekly outreach report");
    expect(md).toMatch(/control.*ahead|ahead.*control/i);
    expect(md).toMatch(/decide|manually|informational/i); // informs, never auto-switches
  });

  it("says 'not enough data' instead of over-reading small samples", () => {
    const rows = [...batch(6, 2, "control"), ...batch(5, 0, "b")];
    const md = renderWeeklyReport(computeMetrics(rows, { now: new Date("2026-07-15T12:00:00Z") }));
    expect(md).toMatch(/not enough data/i);
  });
});
