import { describe, it, expect } from "vitest";
import { retentionCandidates } from "../src/analytics/retention";
import type { Contact } from "../src/core/types";

const NOW = new Date("2026-07-15T12:00:00Z");

function contact(over: Partial<Contact>): Contact {
  return {
    email: "a@x.ca", name: "N", org: "O", field: "F", source_url: "https://s",
    status: "cold", date_scraped: "2025-01-01", date_emailed: "2025-01-02",
    replied_at: "", last_followup: "", date_cold: "2025-01-10",
    message_id: "", notes: "", variant: "", bounced_at: "", _row: 5,
    ...over,
  };
}

describe("retentionCandidates", () => {
  it("selects cold rows older than the retention window", () => {
    const rows = [
      { category: "profs" as const, contact: contact({ date_cold: "2025-01-10" }) },
      { category: "profs" as const, contact: contact({ email: "b@x.ca", date_cold: "2026-07-01" }) },
    ];
    const out = retentionCandidates(rows, 365, NOW);
    expect(out.map((c) => c.contact.email)).toEqual(["a@x.ca"]);
  });

  it("NEVER selects do_not_contact rows — they are the permanent suppression list", () => {
    const rows = [
      {
        category: "profs" as const,
        contact: contact({ status: "do_not_contact" as const, date_cold: "2020-01-01" }),
      },
    ];
    expect(retentionCandidates(rows, 365, NOW)).toEqual([]);
  });

  it("never selects replied rows or anything still in flight", () => {
    const rows = (["new", "emailed", "followed_up", "replied"] as const).map((status, i) => ({
      category: "profs" as const,
      contact: contact({ email: `s${i}@x.ca`, status, date_cold: "2020-01-01" }),
    }));
    expect(retentionCandidates(rows, 365, NOW)).toEqual([]);
  });

  it("skips cold rows with no usable date rather than guessing their age", () => {
    const rows = [
      { category: "profs" as const, contact: contact({ date_cold: "", bounced_at: "" }) },
    ];
    expect(retentionCandidates(rows, 365, NOW)).toEqual([]);
  });

  it("uses bounced_at when date_cold is missing", () => {
    const rows = [
      {
        category: "profs" as const,
        contact: contact({ date_cold: "", bounced_at: "2025-01-10T00:00:00Z" }),
      },
    ];
    expect(retentionCandidates(rows, 365, NOW)).toHaveLength(1);
  });
});
