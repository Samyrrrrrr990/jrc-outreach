import { describe, it, expect } from "vitest";
import { isPersonName, firstNameOf } from "../src/core/names";

describe("isPersonName", () => {
  it("accepts ordinary human names", () => {
    for (const n of [
      "Ishtiaque Ahmed",
      "Ada Lovelace",
      "Dr. Ada Lovelace",
      "Anne-Marie O'Neil",
      "Sheila McIlraith",
      "Jean-Luc Picard",
    ]) {
      expect(isPersonName(n), n).toBe(true);
    }
  });

  it("rejects the exact junk that leaked into the sheet", () => {
    // Every prof row had name "Research Areas:"; the student row had "Socials".
    for (const junk of [
      "Research Areas:",
      "Research Interests:",
      "Socials",
      "General Inquiry",
      "Campus Location",
      "Contact",
      "Email",
      "",
      "   ",
    ]) {
      expect(isPersonName(junk), junk).toBe(false);
    }
  });

  it("rejects addresses, room numbers, and team labels with symbols", () => {
    expect(isPersonName("ada@example.edu")).toBe(false);
    expect(isPersonName("Room BA 5262")).toBe(false);
    expect(isPersonName("Development / Support Team")).toBe(false);
    expect(isPersonName("Dr.")).toBe(false);
    expect(isPersonName("STEM")).toBe(false);
  });
});

describe("firstNameOf", () => {
  it("returns the given name, honorifics stripped", () => {
    expect(firstNameOf("Ishtiaque Ahmed")).toBe("Ishtiaque");
    expect(firstNameOf("Dr. Ada Lovelace")).toBe("Ada");
    expect(firstNameOf("Prof. Sheila McIlraith")).toBe("Sheila");
  });

  it("handles 'Last, First' ordering", () => {
    expect(firstNameOf("Ahmed, Ishtiaque")).toBe("Ishtiaque");
  });

  it("returns empty string for non-person names (so the send is skipped)", () => {
    expect(firstNameOf("Research Areas:")).toBe("");
    expect(firstNameOf("Socials")).toBe("");
    expect(firstNameOf("")).toBe("");
  });

  it("falls back to the fuller name when the first token is a bare initial", () => {
    expect(firstNameOf("J. Smith")).toBe("J. Smith");
  });
});
