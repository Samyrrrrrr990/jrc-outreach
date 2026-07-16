/**
 * Join Research Canada — the original org profile. Everything org-specific
 * lives HERE (proof points, quotas, scrape sources, templates folder); the
 * engine itself never mentions this org.
 */
import type { OrgProfile } from "../profile";

export const jrc: OrgProfile = {
  id: "jrc",
  displayName: "JRC Outreach",
  production: true,
  templatesDir: "jrc",

  /**
   * SAFETY GATE: real numbers only. Any value still containing the sentinel
   * character « blocks every live send (assertProofPointsReady).
   */
  proofPoints: {
    programName: "Research 101",
    oneLiner:
      "A free, mentor-led program that gives students real research experience — from finding a research question to working alongside university mentors on real problems, with feedback along the way.",
    studentsServed: "150+",
    /**
     * NOTE: repurposed from "schools reached" to "provinces reached this
     * cohort" — we don't have a verified schools-reached count yet, but we do
     * have a verified provinces count for the current signed-up cohort.
     */
    schoolsReached: "5",
    headlineOutcome:
      "55 students already signed up across 5 provinces for this cohort, on top of 150+ students helped since we started — plus a 40+ member research club we built that became the fastest-growing club at our founder's school.",
    website: "https://joinresearch.ca",
    senderBlurb:
      "Founder of Join Research Canada, a student-led nonprofit helping Canadian students get real research experience through free, mentor-led programs.",
  },

  campaign: {
    dailyCap: 50,
    followUpAfterDays: 3,
    coldAfterDays: 5,
    scrapePerDomainMs: 1000,
    userAgent: "JRC-OutreachBot/1.0 (+academic outreach; contact via site owner)",
    logTab: "Log",
    categories: {
      profs: {
        tab: "Profs",
        dailyQuota: 20,
        initialTemplate: "profs.initial.md",
        followUpTemplate: "profs.followup.md",
      },
      sponsors: {
        tab: "Sponsors",
        dailyQuota: 20,
        initialTemplate: "sponsors.initial.md",
        followUpTemplate: "sponsors.followup.md",
      },
      students: {
        tab: "Students",
        dailyQuota: 10,
        initialTemplate: "students.initial.md",
        followUpTemplate: "students.followup.md",
      },
    },
  },

  /**
   * IMPORTANT: only PUBLIC faculty/department/club pages. No LinkedIn, nothing
   * disallowed by robots.txt/ToS — the fetcher enforces robots.txt at runtime
   * regardless. Never hand-enter a guessed email.
   */
  sources: {
    directories: [
      // ---------------------------- PROFESSORS ------------------------------
      {
        category: "profs",
        label: "UofT — Computer Science faculty directory",
        url: "https://web.cs.toronto.edu/people/faculty-directory",
        org: "University of Toronto",
        defaultField: "Computer Science",
      },
      {
        category: "profs",
        label: "TMU — Computer Science, Our People",
        url: "https://www.torontomu.ca/cs/our-people/",
        org: "Toronto Metropolitan University",
        defaultField: "Computer Science",
      },
      {
        category: "profs",
        label: "Western — Computer Science, full-time faculty",
        url: "https://www.csd.uwo.ca/people/faculty/index.html",
        org: "Western University",
        defaultField: "Computer Science",
      },
      {
        category: "profs",
        label: "Western — Biology faculty",
        url: "https://www.uwo.ca/biology/people/faculty.html",
        org: "Western University",
        defaultField: "Biology",
      },
      {
        category: "profs",
        // NOTE: this is a search portal, not a flat listing — it likely needs
        // form handling rather than a single-page scrape. Kept for visibility.
        label: "York — Faculty of Science, search all profiles (NEEDS FORM HANDLING)",
        url: "https://www.yorku.ca/science/profiles/search-all-profiles/",
        org: "York University",
        defaultField: "Science",
      },

      // ----------------------------- STUDENTS -------------------------------
      {
        category: "students",
        label: "UofT — Undergraduate Research Students' Association (URSA)",
        url: "https://sop.utoronto.ca/group/uoft-undergraduate-research-students-association-uoft-ursa/",
        org: "University of Toronto",
        defaultField: "Undergraduate Research",
        // NOTE: lists exec names/titles; the generic parser only captures rows
        // with a real mailto. May need the club's general contact instead.
      },
    ],
    sponsorSeeds: [
      // DISABLED 2026-07-15: letstalkscience.ca returns HTTP 403 to our bot
      // User-Agent (found by `cli.ts verify`) — it refuses automated access.
      // Respect that; reach out manually instead.
      {
        name: "Partnerships Team",
        org: "Actua",
        field:
          "Canada's largest STEM youth-outreach charity — network of 40+ university/college members",
        contactUrl: "https://actua.ca/contact-us",
        source_url: "https://actua.ca/contact-us",
      },
      {
        name: "Development / Support Team",
        org: "Shad Canada",
        field:
          "Longest-running STEAM + entrepreneurship program for high schoolers — corporate/foundation donors",
        contactUrl: "https://www.shad.ca/support/",
        source_url: "https://www.shad.ca/support/",
      },
      // TODO (unverified — do NOT hand-fill emails/URLs without checking):
      // Toyota Canada Foundation, NWMO outreach, Ontario Genomics, Mitacs.
    ],
  },
};
