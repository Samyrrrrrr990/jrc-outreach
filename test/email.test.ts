import { describe, it, expect } from "vitest";
import {
  extractEmails,
  extractMailto,
  firstEmail,
  looksLikeEmail,
  normalizeEmail,
} from "../src/scrape/email";

describe("looksLikeEmail", () => {
  it("accepts normal addresses", () => {
    expect(looksLikeEmail("jane.doe@utoronto.ca")).toBe(true);
    expect(looksLikeEmail("a_b+c@sub.example.co.uk")).toBe(true);
  });
  it("rejects junk", () => {
    expect(looksLikeEmail("nope")).toBe(false);
    expect(looksLikeEmail("a@b")).toBe(false);
    expect(looksLikeEmail("@example.com")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lowercases, trims, strips mailto: and query", () => {
    expect(normalizeEmail("  MAILTO:Jane.Doe@UofT.CA?subject=hi ")).toBe(
      "jane.doe@uoft.ca",
    );
  });
});

describe("extractMailto", () => {
  it("reads href mailto links", () => {
    expect(extractMailto("mailto:prof@york.ca")).toBe("prof@york.ca");
    expect(extractMailto("https://x")).toBeNull();
    expect(extractMailto(undefined)).toBeNull();
  });
});

describe("extractEmails — real obfuscation", () => {
  it("plain", () => {
    expect(extractEmails("Contact: john.smith@example.com.")).toEqual([
      "john.smith@example.com",
    ]);
  });
  it("bracketed [at]/[dot] (the spec example)", () => {
    expect(firstEmail("name [at] utoronto [dot] ca")).toBe("name@utoronto.ca");
  });
  it("parenthesised (at)/(dot)", () => {
    expect(firstEmail("jane (at) tmu (dot) ca")).toBe("jane@tmu.ca");
  });
  it("spelled at/dot", () => {
    expect(firstEmail("bob at western dot ca")).toBe("bob@western.ca");
  });
  it("spaced symbols", () => {
    expect(firstEmail("bob @ example . com")).toBe("bob@example.com");
  });
  it("dedupes and finds multiples", () => {
    const got = extractEmails("a@x.com and a@x.com and b@y.org");
    expect(got).toEqual(["a@x.com", "b@y.org"]);
  });
});

describe("extractEmails — never invents addresses", () => {
  it("ignores prose with spelled 'at' and a real period", () => {
    // "data at rest. The" must NOT become data@rest.the
    expect(extractEmails("We encrypt data at rest. The system is secure.")).toEqual(
      [],
    );
  });
  it("ignores 'meet at the office'", () => {
    expect(extractEmails("Let's meet at the office soon.")).toEqual([]);
  });
  it("ignores a bare 'at' with no dotted domain", () => {
    expect(extractEmails("Reach me at reception please")).toEqual([]);
  });
});

describe("looksLikeEmail — rejects glued page-formatting junk", () => {
  it("rejects local parts with leading, trailing, or doubled dots", () => {
    expect(looksLikeEmail("..layla@assu.ca")).toBe(false);
    expect(looksLikeEmail(".president@assu.ca")).toBe(false);
    expect(looksLikeEmail("dean.@assu.ca")).toBe(false);
    expect(looksLikeEmail("liu.....................quintina@assu.ca")).toBe(false);
  });
  it("still accepts ordinary dotted locals", () => {
    expect(looksLikeEmail("first.last@example.ca")).toBe(true);
  });
});
