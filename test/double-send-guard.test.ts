import { describe, it, expect } from "vitest";
import type { Contact } from "../src/core/types";
import { selectForInitial } from "../src/core/status";

function row(email: string, status: Contact["status"], rowNum: number): Contact {
  return {
    email,
    name: "N",
    org: "O",
    field: "F",
    source_url: "https://src",
    status,
    date_scraped: "2026-07-01",
    date_emailed: status === "new" ? "" : "2026-07-02",
    replied_at: "",
    last_followup: "",
    date_cold: "",
    message_id: "",
    notes: "",
    _row: rowNum,
  };
}

describe("double-send guards in selectForInitial", () => {
  it("selects only the first of duplicate `new` rows sharing an email", () => {
    const rows = [row("a@x.ca", "new", 2), row("a@x.ca", "new", 3), row("b@x.ca", "new", 4)];
    const picked = selectForInitial(rows, 10);
    expect(picked.map((c) => c._row)).toEqual([2, 4]);
  });

  it("never selects a `new` row whose email was already contacted in another row", () => {
    const rows = [row("a@x.ca", "emailed", 2), row("a@x.ca", "new", 3), row("b@x.ca", "new", 4)];
    const picked = selectForInitial(rows, 10);
    expect(picked.map((c) => c.email)).toEqual(["b@x.ca"]);
  });

  it("treats duplicate emails case-insensitively", () => {
    const rows = [row("A@X.ca", "replied", 2), row("a@x.ca", "new", 3)];
    expect(selectForInitial(rows, 10)).toEqual([]);
  });
});
