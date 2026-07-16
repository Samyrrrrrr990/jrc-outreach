import { describe, it, expect } from "vitest";
import { dedupeAgainst } from "../src/scrape/dedup";
import type { ScrapedContact } from "../src/core/types";

function s(email: string): ScrapedContact {
  return { email, name: "N", org: "O", field: "F", source_url: "https://s" };
}

describe("dedupeAgainst", () => {
  it("drops candidates already in the tab (case-insensitive)", () => {
    const out = dedupeAgainst(["A@X.com"], [s("a@x.com"), s("b@x.com")]);
    expect(out.map((c) => c.email)).toEqual(["b@x.com"]);
  });
  it("drops duplicates within the batch", () => {
    const out = dedupeAgainst([], [s("a@x.com"), s("A@X.com"), s("c@x.com")]);
    expect(out.map((c) => c.email)).toEqual(["a@x.com", "c@x.com"]);
  });
  it("normalises emails on the way out", () => {
    const out = dedupeAgainst([], [s(" Mixed@Case.COM ")]);
    expect(out[0]!.email).toBe("mixed@case.com");
  });
  it("skips empty emails", () => {
    const out = dedupeAgainst([], [s("")]);
    expect(out).toEqual([]);
  });
});
