import { describe, it, expect } from "vitest";
import { computeSendPlan } from "../src/core/plan";
import type { Contact } from "../src/core/types";

const TODAY = "2026-07-15";

function row(email: string, status: Contact["status"], dateEmailed = ""): Contact {
  return {
    email, name: "N", org: "O", field: "F", source_url: "https://s",
    status, date_scraped: "2026-07-01", date_emailed: dateEmailed,
    replied_at: "", last_followup: "", date_cold: "", message_id: "",
    notes: "", variant: "", bounced_at: "",
  };
}

function newRows(n: number, prefix: string): Contact[] {
  return Array.from({ length: n }, (_, i) => row(`${prefix}${i}@x.ca`, "new"));
}

describe("computeSendPlan — the invariants that must survive any refactor", () => {
  it("respects each category's quota", () => {
    const plan = computeSendPlan(
      [
        { cat: "sponsors", contacts: newRows(30, "s"), quota: 20 },
        { cat: "profs", contacts: newRows(30, "p"), quota: 20 },
        { cat: "students", contacts: newRows(30, "u"), quota: 10 },
      ],
      50,
      TODAY,
    );
    expect(plan.map(({ selected }) => selected.length)).toEqual([20, 20, 10]);
  });

  it("never exceeds the daily cap, draining in the given order", () => {
    const plan = computeSendPlan(
      [
        { cat: "sponsors", contacts: newRows(30, "s"), quota: 30 },
        { cat: "profs", contacts: newRows(30, "p"), quota: 30 },
      ],
      50,
      TODAY,
    );
    const total = plan.reduce((a, { selected }) => a + selected.length, 0);
    expect(total).toBe(50);
    expect(plan[0]!.selected.length).toBe(30);
    expect(plan[1]!.selected.length).toBe(20);
  });

  it("re-running the same day finds nothing to do (idempotency)", () => {
    const alreadySent = Array.from({ length: 20 }, (_, i) =>
      row(`done${i}@x.ca`, "emailed", TODAY),
    );
    const plan = computeSendPlan(
      [{ cat: "profs", contacts: alreadySent, quota: 20 }],
      50,
      TODAY,
    );
    expect(plan[0]!.selected).toEqual([]);
  });

  it("counts today's earlier sends against BOTH the quota and the cap", () => {
    const contacts = [
      ...Array.from({ length: 15 }, (_, i) => row(`done${i}@x.ca`, "emailed", TODAY)),
      ...newRows(20, "fresh"),
    ];
    const plan = computeSendPlan([{ cat: "profs", contacts, quota: 20 }], 18, TODAY);
    // Quota leaves 5; cap leaves 3 -> 3.
    expect(plan[0]!.selected.length).toBe(3);
  });

  it("does not count YESTERDAY's sends against today's quota", () => {
    const contacts = [
      ...Array.from({ length: 15 }, (_, i) => row(`old${i}@x.ca`, "emailed", "2026-07-14")),
      ...newRows(20, "fresh"),
    ];
    const plan = computeSendPlan([{ cat: "profs", contacts, quota: 20 }], 50, TODAY);
    expect(plan[0]!.selected.length).toBe(20);
  });

  it("never plans a send to a duplicate or already-contacted address", () => {
    const contacts = [
      row("dup@x.ca", "emailed", "2026-07-10"),
      row("dup@x.ca", "new"),
      row("ok@x.ca", "new"),
    ];
    const plan = computeSendPlan([{ cat: "profs", contacts, quota: 20 }], 50, TODAY);
    expect(plan[0]!.selected.map((c) => c.email)).toEqual(["ok@x.ca"]);
  });
});
