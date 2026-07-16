import { describe, it, expect } from "vitest";
import {
  HEADERS,
  LAST_COL,
  compareHeaders,
  contactToRow,
  rowToContact,
} from "../src/sheets/schema";
import type { Contact } from "../src/core/types";

describe("schema v2: variant + bounced_at columns", () => {
  it("appends the new columns AFTER notes so v1 column indices are unchanged", () => {
    expect(HEADERS[12]).toBe("notes");
    expect(HEADERS[13]).toBe("variant");
    expect(HEADERS[14]).toBe("bounced_at");
    expect(LAST_COL).toBe("O");
  });

  it("parses variant and bounced_at from a full row", () => {
    const row = [
      "a@x.ca", "Ada", "UofT", "CS", "https://src", "emailed",
      "2026-07-01", "2026-07-02", "", "", "", "<id@x>", "note",
      "control", "2026-07-03T00:00:00.000Z",
    ];
    const parsed = rowToContact(row, 2);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.contact.variant).toBe("control");
      expect(parsed.contact.bounced_at).toBe("2026-07-03T00:00:00.000Z");
    }
  });

  it("round-trips a contact including the new columns", () => {
    const c: Contact = {
      email: "a@x.ca", name: "Ada", org: "UofT", field: "CS",
      source_url: "https://src", status: "emailed", date_scraped: "2026-07-01",
      date_emailed: "2026-07-02", replied_at: "", last_followup: "",
      date_cold: "", message_id: "<id@x>", notes: "",
      variant: "b", bounced_at: "",
    };
    const row = contactToRow(c);
    expect(row).toHaveLength(HEADERS.length);
    expect(row[13]).toBe("b");
    const back = rowToContact(row, 2);
    expect(back.ok && back.contact.variant).toBe("b");
  });

  it("still parses short v1 rows (13 columns) with empty variant/bounced_at", () => {
    const v1 = ["a@x.ca", "Ada", "UofT", "CS", "https://src", "new", "2026-07-01"];
    const parsed = rowToContact(v1, 2);
    expect(parsed.ok && parsed.contact.variant).toBe("");
    expect(parsed.ok && parsed.contact.bounced_at).toBe("");
  });
});

describe("compareHeaders (header-row migration safety)", () => {
  const v2 = [...HEADERS];

  it("ok when the sheet already matches", () => {
    expect(compareHeaders(v2, v2)).toBe("ok");
  });

  it("upgrade when the sheet has a strict prefix (v1 headers)", () => {
    expect(compareHeaders(v2.slice(0, 13), v2)).toBe("upgrade");
  });

  it("mismatch when any existing column is named differently — never overwrite", () => {
    const renamed = [...v2.slice(0, 12), "remarks"];
    expect(compareHeaders(renamed, v2)).toBe("mismatch");
    expect(compareHeaders(["email", "status"], v2)).toBe("mismatch");
  });
});
