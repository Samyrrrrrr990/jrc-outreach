import { describe, it, expect } from "vitest";
import { parseDirectory } from "../src/scrape/parse";
import type { DirectorySource } from "../src/config/sources";

// Faithful excerpt of the real UofT CS faculty-directory markup: each prof is a
// <tr> with a name anchor, a separate mailto anchor, then a cell whose <b>
// labels ("Research Areas:", "Research Interests:") previously leaked in as the
// name for EVERY professor.
const UOFT_HTML = `
<table class="blueTable"><tbody>
  <tr>
    <td><a href="https://www.ishtiaque.net/">Ishtiaque Ahmed</a><br>Associate Professor</td>
    <td><a href="mailto:ishtiaque@cs.toronto.edu" title="ishtiaque@cs.toronto.edu">ishtiaque@cs.toronto.edu</a><br>416-946-8528 <br> Room: BA 5262</td>
    <td><b>Research Areas:</b> human-computer interaction, ICTD <br> <b>Research Interests:</b> critical computing, social justice</td>
  </tr>
  <tr>
    <td><a href="https://example.edu/hopper">Grace Hopper</a><br>Professor</td>
    <td><a href="mailto:grace@cs.toronto.edu">grace@cs.toronto.edu</a></td>
    <td><b>Research Areas:</b> compilers, programming languages</td>
  </tr>
  <tr>
    <td><a href="https://example.edu/nemo">Captain Nemo</a></td>
    <td><a href="mailto:nemo@cs.toronto.edu">nemo@cs.toronto.edu</a></td>
    <td>&nbsp;</td>
  </tr>
  <tr>
    <td><a href="https://example.edu/emeritus">John Mylopoulos</a><br>Professor Emeritus</td>
    <td><a href="mailto:jm@cs.toronto.edu">jm@cs.toronto.edu</a></td>
    <td><b>Research Areas:</b> software engineering Professor Mylopoulos is not accepting any new graduate students.</td>
  </tr>
  <tr>
    <td><a href="https://example.edu/systems">Radia Perlman</a></td>
    <td><a href="mailto:radia@cs.toronto.edu">radia@cs.toronto.edu</a></td>
    <td><b>Research Areas:</b> Systems <b>Research Interests:</b> Parallel systems (e.g., routing at scale)</td>
  </tr>
  <tr>
    <td><a href="https://example.edu/glued">Ed Catmull</a></td>
    <td><a href="mailto:ed@cs.toronto.edu">ed@cs.toronto.edu</a></td>
    <td><b>Research Areas:</b> computer graphics<b>Research Interests:</b> discrete differential geometry</td>
  </tr>
</tbody></table>`;

const source: DirectorySource = {
  category: "profs",
  label: "UofT — Computer Science faculty directory",
  url: "https://web.cs.toronto.edu/people/faculty-directory",
  org: "University of Toronto",
  defaultField: "Computer Science",
  selectors: {
    item: "table.blueTable tr",
    name: 'a:not([href^="mailto:"])',
    email: 'a[href^="mailto:"]',
    fieldFromLabel: "Research Areas:",
  },
};

describe("UofT CS faculty directory selectors", () => {
  const out = parseDirectory(UOFT_HTML, source);

  it("extracts the real professor name, never the 'Research Areas:' label", () => {
    const names = out.map((c) => c.name);
    expect(names).toContain("Ishtiaque Ahmed");
    expect(names).toContain("Grace Hopper");
    expect(names).not.toContain("Research Areas:");
    expect(names.every((n) => !/research areas/i.test(n))).toBe(true);
  });

  it("pairs each name with the right mailto address", () => {
    expect(out.find((c) => c.email === "ishtiaque@cs.toronto.edu")?.name).toBe(
      "Ishtiaque Ahmed",
    );
  });

  it("personalizes on the real research area, first clause only", () => {
    const ish = out.find((c) => c.email === "ishtiaque@cs.toronto.edu");
    expect(ish?.field).toBe("human-computer interaction");
    const grace = out.find((c) => c.email === "grace@cs.toronto.edu");
    expect(grace?.field).toBe("compilers");
  });

  it("falls back to the default field when a row has no research-areas label", () => {
    const nemo = out.find((c) => c.email === "nemo@cs.toronto.edu");
    expect(nemo?.field).toBe("Computer Science");
  });

  it("cuts an emeritus 'not accepting students' note out of the field", () => {
    const jm = out.find((c) => c.email === "jm@cs.toronto.edu");
    expect(jm?.field).toBe("software engineering");
  });

  it("stops a capitalized field before a following sub-label", () => {
    const radia = out.find((c) => c.email === "radia@cs.toronto.edu");
    expect(radia?.field).toBe("Systems");
  });

  it("stops at a sub-label even when tags collapse to glued text", () => {
    const ed = out.find((c) => c.email === "ed@cs.toronto.edu");
    expect(ed?.field).toBe("computer graphics");
  });
});
