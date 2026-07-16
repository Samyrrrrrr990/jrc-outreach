import { describe, it, expect } from "vitest";
import { parseDirectory } from "../src/scrape/parse";
import type { DirectorySource } from "../src/config/sources";

const base: DirectorySource = {
  category: "profs",
  label: "Test",
  url: "https://example.edu/people",
  org: "Example University",
  defaultField: "Physics",
};

describe("parseDirectory — selector strategy", () => {
  const html = `
    <ul>
      <li class="person">
        <span class="name">Dr. Ada Lovelace</span>
        <span class="title">Professor of Computing</span>
        <a href="mailto:ada@example.edu">email</a>
      </li>
      <li class="person">
        <span class="name">Alan Turing</span>
        <span class="title">Reader</span>
        <a href="mailto:alan@example.edu">email</a>
      </li>
    </ul>`;
  const source: DirectorySource = {
    ...base,
    selectors: { item: "li.person", name: ".name", email: "a[href^=mailto]", field: ".title" },
  };

  it("extracts name, email, and field per item", () => {
    const out = parseDirectory(html, source);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      email: "ada@example.edu",
      name: "Dr. Ada Lovelace",
      field: "Professor of Computing",
      org: "Example University",
      source_url: "https://example.edu/people",
    });
  });
});

describe("parseDirectory — generic strategy", () => {
  it("pairs mailto anchors with nearby names", () => {
    const html = `
      <div class="card"><h3>Grace Hopper</h3>
        <a href="mailto:grace@example.edu">Contact</a></div>`;
    const out = parseDirectory(html, base);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Grace Hopper", email: "grace@example.edu" });
  });

  it("decodes obfuscated emails in text and uses the default field", () => {
    const html = `
      <li><strong>Katherine Johnson</strong>
        <span>katherine [at] example [dot] edu</span></li>`;
    const out = parseDirectory(html, base);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: "Katherine Johnson",
      email: "katherine@example.edu",
      field: "Physics",
    });
  });

  it("does not emit a contact when no plausible name is present", () => {
    const html = `<div><a href="mailto:anon@example.edu">x</a></div>`;
    const out = parseDirectory(html, base);
    expect(out).toEqual([]);
  });

  it("dedupes repeated emails within a page", () => {
    const html = `
      <div class="card"><h3>Dup One</h3><a href="mailto:dup@example.edu">a</a></div>
      <div class="card"><h3>Dup Two</h3><a href="mailto:dup@example.edu">b</a></div>`;
    const out = parseDirectory(html, base);
    expect(out).toHaveLength(1);
  });
});
