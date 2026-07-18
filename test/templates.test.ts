import { describe, it, expect } from "vitest";
import { asciiDashes, findPlaceholders, merge, render } from "../src/mail/templates";

describe("findPlaceholders", () => {
  it("lists distinct placeholder names", () => {
    expect(findPlaceholders("Hi {{name}}, from {{org}} and {{ name }}")).toEqual([
      "name",
      "org",
    ]);
  });
});

describe("merge — fails loud", () => {
  it("substitutes provided values", () => {
    expect(merge("Hi {{name}} at {{org}}", { name: "Jane", org: "UofT" })).toBe(
      "Hi Jane at UofT",
    );
  });
  it("tolerates whitespace in braces", () => {
    expect(merge("Hi {{ name }}", { name: "Jane" })).toBe("Hi Jane");
  });
  it("throws when a placeholder has no value", () => {
    expect(() => merge("Hi {{name}} from {{org}}", { name: "Jane" })).toThrow(
      /Unfilled merge placeholders: org/,
    );
  });
  it("treats empty/whitespace values as unfilled (no 'Dear ,')", () => {
    expect(() => merge("Dear {{name}}", { name: "   " })).toThrow(/name/);
  });
  it("reports every unfilled field", () => {
    expect(() => merge("{{a}} {{b}} {{c}}", { b: "x" })).toThrow(/a, c|c, a/);
  });
});

describe("asciiDashes — no em/en dashes in outgoing mail", () => {
  it("turns a spaced em dash into a spaced hyphen", () => {
    expect(asciiDashes("no prep needed — I'll work around you")).toBe(
      "no prep needed - I'll work around you",
    );
  });
  it("turns a tight em dash into a spaced hyphen", () => {
    expect(asciiDashes("free—forever")).toBe("free - forever");
  });
  it("keeps digit ranges tight", () => {
    expect(asciiDashes("open 9–5 daily")).toBe("open 9-5 daily");
  });
  it("turns a dash-only line into a -- signature separator", () => {
    expect(asciiDashes("Best,\nSam\n—\nunsubscribe note")).toBe(
      "Best,\nSam\n--\nunsubscribe note",
    );
  });
  it("leaves dash-free text untouched", () => {
    expect(asciiDashes("plain text, hyphen-ated, --\n")).toBe(
      "plain text, hyphen-ated, --\n",
    );
  });
});

describe("render", () => {
  it("normalizes em dashes arriving via merge vars in subject and body", () => {
    const tpl = "Subject: {{s}}\n\nWe run {{p}}.\n";
    const out = render(tpl, { s: "quick ask — 15 min", p: "JRC — a collective" });
    expect(out.subject).toBe("quick ask - 15 min");
    expect(out.text).toBe("We run JRC - a collective.\n");
  });
  it("splits Subject line from body and merges both", () => {
    const tpl = "Subject: Hi {{name}}\n\nBody for {{org}}.\n";
    const out = render(tpl, { name: "Jane", org: "UofT" });
    expect(out.subject).toBe("Hi Jane");
    expect(out.text).toBe("Body for UofT.\n");
  });
  it("throws if the template lacks a Subject line", () => {
    expect(() => render("No subject here", {})).toThrow(/Subject/);
  });
  it("propagates unfilled-placeholder failures (never sends broken mail)", () => {
    expect(() => render("Subject: {{s}}\n\nHi {{name}}", { s: "x" })).toThrow(
      /name/,
    );
  });
});
