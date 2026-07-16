/**
 * "Demo Chapter" — a second, fictitious org profile. It exists to prove the
 * engine is org-agnostic (run anything with ORG_PROFILE=demo) and to serve
 * as the copy-me starting point for a real new chapter (MULTI_TENANT.md).
 *
 * Every proof point ships as a «placeholder», so this profile can NEVER send
 * a live email until a real operator fills in real numbers — the same gate
 * that protects the original org.
 */
import type { OrgProfile } from "../profile";

export const demo: OrgProfile = {
  id: "demo",
  displayName: "Demo Chapter Outreach",
  production: false,
  templatesDir: "demo",

  proofPoints: {
    programName: "«your program name»",
    oneLiner: "«one sentence on what your program does»",
    studentsServed: "«e.g. 100+»",
    schoolsReached: "«e.g. 8»",
    headlineOutcome: "«one concrete, verifiable outcome»",
    website: "«https://your-site.example»",
    senderBlurb: "«one line on who you are»",
  },

  campaign: {
    // Deliberately smaller than the flagship org — a new chapter should ramp
    // up. The 50/day hard cap is an engine-wide invariant; profiles may only
    // go lower, never higher (enforced by tests and the CI profile check).
    dailyCap: 15,
    followUpAfterDays: 3,
    coldAfterDays: 5,
    scrapePerDomainMs: 1000,
    userAgent: "DemoChapterBot/1.0 (+academic outreach; contact via site owner)",
    logTab: "Log",
    categories: {
      profs: {
        tab: "Profs",
        dailyQuota: 5,
        initialTemplate: "profs.initial.md",
        followUpTemplate: "profs.followup.md",
      },
      sponsors: {
        tab: "Sponsors",
        dailyQuota: 5,
        initialTemplate: "sponsors.initial.md",
        followUpTemplate: "sponsors.followup.md",
      },
      students: {
        tab: "Students",
        dailyQuota: 5,
        initialTemplate: "students.initial.md",
        followUpTemplate: "students.followup.md",
      },
    },
  },

  sources: {
    // example.org placeholders — replace with YOUR public directory pages.
    directories: [
      {
        category: "profs",
        label: "Example U — faculty directory (REPLACE ME)",
        url: "https://www.example.org/faculty",
        org: "Example University",
        defaultField: "Science",
      },
    ],
    sponsorSeeds: [
      {
        name: "Partnerships Team (REPLACE ME)",
        org: "Example Sponsor Org",
        field: "STEM education",
        contactUrl: "https://www.example.org/contact",
        source_url: "https://www.example.org/contact",
      },
    ],
  },
};
