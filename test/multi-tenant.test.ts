import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { activeProfile, profileById, PROFILES } from "../src/config/profiles";
import { proofPointsReady } from "../src/config/proofPoints";
import { CATEGORIES } from "../src/core/types";

const SRC = join(__dirname, "..", "src");
const TEMPLATES = join(__dirname, "..", "templates");

function walk(dir: string, skip: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (skip.some((s) => p.includes(s))) continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, skip));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("the core engine has zero hardcoded org references", () => {
  it("no file outside config/profiles mentions the org", () => {
    const files = walk(SRC, [join("config", "profiles")]);
    const offenders: string[] = [];
    for (const f of files) {
      const body = readFileSync(f, "utf8");
      if (/jrc|joinresearch|research 101/i.test(body)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

describe("profile registry", () => {
  it("defaults to the jrc profile", () => {
    expect(activeProfile().id).toBe("jrc");
  });

  it("resolves profiles by id and rejects unknown ids loudly", () => {
    expect(profileById("demo").id).toBe("demo");
    expect(() => profileById("nope")).toThrow(/nope/);
  });

  it("every profile has a template file for every category (initial + follow-up)", () => {
    for (const profile of Object.values(PROFILES)) {
      for (const cat of CATEGORIES) {
        const cfg = profile.campaign.categories[cat];
        for (const f of [cfg.initialTemplate, cfg.followUpTemplate]) {
          const path = join(TEMPLATES, profile.templatesDir, f);
          expect(existsSync(path), `${profile.id}: missing ${path}`).toBe(true);
        }
      }
    }
  });

  it("the demo profile ships with unfilled placeholders so it can never live-send", () => {
    expect(proofPointsReady(profileById("demo").proofPoints)).toBe(false);
    expect(profileById("demo").production).toBe(false);
  });

  it("the jrc profile is production-ready (no placeholders)", () => {
    expect(proofPointsReady(profileById("jrc").proofPoints)).toBe(true);
    expect(profileById("jrc").production).toBe(true);
  });

  it("every PRODUCTION profile has real proof points — CI fails otherwise", () => {
    for (const p of Object.values(PROFILES)) {
      if (p.production) {
        expect(
          proofPointsReady(p.proofPoints),
          `production profile "${p.id}" still contains «placeholder» proof points`,
        ).toBe(true);
      }
    }
  });

  it("every profile respects the hard invariants: cap <= 50, quotas sum sanely", () => {
    for (const profile of Object.values(PROFILES)) {
      expect(profile.campaign.dailyCap).toBeLessThanOrEqual(50);
      const quotaSum = CATEGORIES.reduce(
        (a, c) => a + profile.campaign.categories[c].dailyQuota,
        0,
      );
      expect(quotaSum).toBeGreaterThan(0);
    }
  });
});
