import { describe, it, expect } from "vitest";
import { domainOf, generateMessageId, listUnsubscribe } from "../src/mail/headers";

describe("domainOf", () => {
  it("returns the domain part", () => {
    expect(domainOf("me@jrc.org")).toBe("jrc.org");
    expect(domainOf("bad")).toBe("localhost");
  });
});

describe("generateMessageId", () => {
  it("produces a unique, well-formed Message-ID on the sender domain", () => {
    const a = generateMessageId("me@jrc.org");
    const b = generateMessageId("me@jrc.org");
    expect(a).toMatch(/^<[a-z0-9]+\.[a-f0-9]+@jrc\.org>$/);
    expect(a).not.toBe(b);
  });
});

describe("listUnsubscribe", () => {
  it("always offers a mailto unsubscribe", () => {
    expect(listUnsubscribe("me@jrc.org")).toBe("<mailto:me@jrc.org?subject=unsubscribe>");
  });
  it("prepends an HTTPS endpoint when configured", () => {
    expect(listUnsubscribe("me@jrc.org", "https://jrc.org/u")).toBe(
      "<https://jrc.org/u>, <mailto:me@jrc.org?subject=unsubscribe>",
    );
  });
});
