import { describe, it, expect } from "vitest";
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

const NOW = new Date("2026-07-15T12:00:00Z");

describe("computeMetrics", () => {
  const rows: MetricsRow[] = [
    { category: "profs", contact: contact({ status: "emailed", date_emailed: "2026-07-10", variant: "control" }) },
    { category: "profs", contact: contact({ email: "b@x.ca", status: "replied", date_emailed: "2026-07-10", replied_at: "2026-07-12T09:00:00Z", variant: "control" }) },
    { category: "profs", contact: contact({ email: "c@x.ca", status: "cold", date_emailed: "2026-07-01", bounced_at: "2026-07-02T00:00:00Z", variant: "b" }) },
    { category: "sponsors", contact: contact({ email: "d@y.ca", status: "new" }) },
    { category: "students", contact: contact({ email: "e@z.ca", status: "replied", date_emailed: "2026-07-14", replied_at: "2026-07-14T18:00:00Z" }) },
  ];

  const m = computeMetrics(rows, { now: NOW, days: 30 });

  it("totals count sent (ever emailed), replied, and bounced", () => {
    expect(m.totals.sent).toBe(4);
    expect(m.totals.replied).toBe(2);
    expect(m.totals.bounced).toBe(1);
    expect(m.totals.contacts).toBe(5);
  });

  it("computes per-category reply rate over sent, null when nothing sent", () => {
    expect(m.byCategory.profs.sent).toBe(3);
    expect(m.byCategory.profs.replied).toBe(1);
    expect(m.byCategory.profs.replyRatePct).toBeCloseTo(33.3, 1);
    expect(m.byCategory.sponsors.sent).toBe(0);
    expect(m.byCategory.sponsors.replyRatePct).toBeNull();
  });

  it("builds a daily series covering the window, keyed by send date", () => {
    expect(m.daily).toHaveLength(30);
    expect(m.daily[m.daily.length - 1]!.date).toBe("2026-07-15");
    const july10 = m.daily.find((d) => d.date === "2026-07-10")!;
    expect(july10.sent.profs).toBe(2);
    expect(july10.sent.sponsors).toBe(0);
    const july12 = m.daily.find((d) => d.date === "2026-07-12")!;
    expect(july12.replied).toBe(1);
  });

  it("buckets time-to-reply and reports the median", () => {
    // b@x.ca replied after 2 days; e@z.ca same day.
    const buckets = Object.fromEntries(m.timeToReply.buckets.map((b) => [b.bucket, b.count]));
    expect(buckets["same day"]).toBe(1);
    expect(buckets["2–3 days"]).toBe(1);
    expect(m.timeToReply.medianDays).toBe(1);
  });

  it("aggregates per-variant stats, labelling pre-tracking sends", () => {
    const control = m.variants.find((v) => v.category === "profs" && v.variant === "control")!;
    expect(control.sent).toBe(2);
    expect(control.replied).toBe(1);
    const untracked = m.variants.find((v) => v.category === "students")!;
    expect(untracked.variant).toBe("(untracked)");
  });
});
