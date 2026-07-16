import { describe, it, expect } from "vitest";
import { collectTargets, summarize, type TargetResult } from "../src/pipeline/verify";
import type { DirectorySource, SponsorSeed } from "../src/config/sources";

const dirs: DirectorySource[] = [
  {
    category: "profs",
    label: "UofT CS",
    url: "https://example.edu/people",
    org: "UofT",
    defaultField: "CS",
  },
  {
    category: "students",
    label: "Same URL twice",
    url: "https://example.edu/people",
    org: "UofT",
    defaultField: "clubs",
  },
];

const seeds: SponsorSeed[] = [
  {
    name: "Partnerships",
    org: "Acme",
    field: "STEM",
    contactUrl: "https://acme.example/contact",
    source_url: "https://acme.example/contact",
  },
  {
    name: "Known Email",
    org: "DirectCo",
    field: "STEM",
    email: "partners@directco.example",
    source_url: "https://directco.example",
  },
];

describe("collectTargets", () => {
  it("collects directory pages and sponsor contact pages, deduped by URL", () => {
    const targets = collectTargets(dirs, seeds);
    const urls = targets.filter((t) => t.kind !== "email").map((t) => t.url);
    expect(urls).toEqual(["https://example.edu/people", "https://acme.example/contact"]);
  });

  it("keeps email-only sponsor seeds as offline email checks", () => {
    const targets = collectTargets(dirs, seeds);
    const emailTargets = targets.filter((t) => t.kind === "email");
    expect(emailTargets).toHaveLength(1);
    expect(emailTargets[0]!.url).toBe("partners@directco.example");
  });
});

describe("summarize", () => {
  const ok = (label: string): TargetResult => ({
    target: { label, url: "https://x", kind: "directory" },
    ok: true,
  });
  const bad = (label: string, error: string): TargetResult => ({
    target: { label, url: "https://x", kind: "directory" },
    ok: false,
    error,
  });

  it("reports success when every target passes", () => {
    const s = summarize([ok("a"), ok("b")]);
    expect(s.ok).toBe(true);
    expect(s.failures).toHaveLength(0);
    expect(s.line).toContain("2 ok");
  });

  it("collects failures with their reasons", () => {
    const s = summarize([ok("a"), bad("b", "HTTP 404"), bad("c", "robots.txt disallows")]);
    expect(s.ok).toBe(false);
    expect(s.failures.map((f) => f.error)).toEqual(["HTTP 404", "robots.txt disallows"]);
    expect(s.line).toContain("1 ok");
    expect(s.line).toContain("2 failed");
  });
});
