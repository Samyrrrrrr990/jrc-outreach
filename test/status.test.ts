import { describe, it, expect } from "vitest";
import type { Contact } from "../src/core/types";
import {
  applyDailyCap,
  dueForCold,
  dueForFollowUp,
  eligibleForInitial,
  isContactable,
  selectForInitial,
} from "../src/core/status";

function contact(p: Partial<Contact>): Contact {
  return {
    email: "x@example.com",
    name: "X",
    org: "Org",
    field: "Field",
    source_url: "https://s",
    status: "new",
    date_scraped: "",
    date_emailed: "",
    replied_at: "",
    last_followup: "",
    date_cold: "",
    message_id: "",
    notes: "",
    ...p,
  };
}

const NOW = new Date("2026-07-14T12:00:00Z");

describe("isContactable", () => {
  it("blocks do_not_contact and replied first", () => {
    expect(isContactable(contact({ status: "do_not_contact" }))).toBe(false);
    expect(isContactable(contact({ status: "replied" }))).toBe(false);
    expect(isContactable(contact({ status: "emailed" }))).toBe(true);
  });
});

describe("selectForInitial", () => {
  it("only picks new rows, up to the quota, in order", () => {
    const rows = [
      contact({ email: "a@x.com", status: "new" }),
      contact({ email: "b@x.com", status: "emailed" }),
      contact({ email: "c@x.com", status: "new" }),
      contact({ email: "d@x.com", status: "new" }),
    ];
    const picked = selectForInitial(rows, 2).map((c) => c.email);
    expect(picked).toEqual(["a@x.com", "c@x.com"]);
  });
  it("returns nothing for a zero quota", () => {
    expect(selectForInitial([contact({})], 0)).toEqual([]);
  });
  it("never selects do_not_contact even if labelled new elsewhere", () => {
    expect(eligibleForInitial(contact({ status: "do_not_contact" }))).toBe(false);
  });
});

describe("applyDailyCap", () => {
  it("trims total across categories, draining in order", () => {
    const out = applyDailyCap(
      [
        ["sponsors", [contact({}), contact({}), contact({})]],
        ["profs", [contact({}), contact({})]],
      ],
      4,
    );
    expect(out[0]![1].length).toBe(3);
    expect(out[1]![1].length).toBe(1);
  });
});

describe("dueForFollowUp", () => {
  it("true only for emailed rows past the wait window", () => {
    const c = contact({ status: "emailed", date_emailed: "2026-07-10" });
    expect(dueForFollowUp(c, 3, NOW)).toBe(true);
  });
  it("false before the window", () => {
    const c = contact({ status: "emailed", date_emailed: "2026-07-13" });
    expect(dueForFollowUp(c, 3, NOW)).toBe(false);
  });
  it("never follows up replied/do_not_contact", () => {
    expect(
      dueForFollowUp(contact({ status: "replied", date_emailed: "2026-01-01" }), 3, NOW),
    ).toBe(false);
  });
  it("never follows up an already followed_up row (one nudge, ever)", () => {
    expect(
      dueForFollowUp(
        contact({ status: "followed_up", date_emailed: "2026-01-01" }),
        3,
        NOW,
      ),
    ).toBe(false);
  });
});

describe("dueForCold", () => {
  it("true only for followed_up rows past the cold window", () => {
    const c = contact({ status: "followed_up", last_followup: "2026-07-08" });
    expect(dueForCold(c, 5, NOW)).toBe(true);
  });
  it("false before the window", () => {
    const c = contact({ status: "followed_up", last_followup: "2026-07-12" });
    expect(dueForCold(c, 5, NOW)).toBe(false);
  });
});
