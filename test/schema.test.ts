import { describe, it, expect } from "vitest";
import {
  HEADERS,
  applyPatch,
  contactToRow,
  rowToContact,
} from "../src/sheets/schema";
import type { Contact } from "../src/core/types";

const sampleRow = [
  "Jane@UofT.CA",
  "Jane Doe",
  "University of Toronto",
  "Computer Science",
  "https://cs.utoronto.ca/people",
  "emailed",
  "2026-07-10",
  "2026-07-11",
  "",
  "",
  "",
  "<abc@uoft.ca>",
  "note",
];

describe("rowToContact", () => {
  it("maps a well-formed row and normalises the email", () => {
    const p = rowToContact(sampleRow, 5);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.contact.email).toBe("jane@uoft.ca");
      expect(p.contact.status).toBe("emailed");
      expect(p.contact._row).toBe(5);
      expect(p.contact.message_id).toBe("<abc@uoft.ca>");
    }
  });
  it("rejects rows with no email", () => {
    const p = rowToContact(["", "No Email"], 7);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toMatch(/missing email/);
  });
  it("defaults an empty status to new", () => {
    const p = rowToContact(["a@x.com", "A"], 2);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.contact.status).toBe("new");
  });
  it("rejects an invalid non-empty status (a typo can't get emailed)", () => {
    const row = [...sampleRow];
    row[5] = "emailedd";
    const p = rowToContact(row, 3);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toMatch(/invalid status/);
  });
});

describe("contactToRow / HEADERS", () => {
  it("round-trips through the header order", () => {
    const p = rowToContact(sampleRow, 5);
    if (!p.ok) throw new Error("expected ok");
    const row = contactToRow(p.contact);
    expect(row.length).toBe(HEADERS.length);
    expect(row[0]).toBe("jane@uoft.ca");
    expect(row[5]).toBe("emailed");
  });
});

describe("applyPatch", () => {
  it("changes only the patched fields, preserving the rest", () => {
    const patched = applyPatch(sampleRow, { status: "replied", replied_at: "2026-07-14T00:00:00Z" } as Partial<Contact>);
    // status column changed
    expect(patched[5]).toBe("replied");
    expect(patched[8]).toBe("2026-07-14T00:00:00Z");
    // untouched columns preserved
    expect(patched[1]).toBe("Jane Doe");
    expect(patched[3]).toBe("Computer Science");
    expect(patched[11]).toBe("<abc@uoft.ca>");
  });
});
