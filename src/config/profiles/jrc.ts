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
    // Used in the signature ("The founder, {{orgName}}") and the From line —
    // outgoing mail is signed by the org, never by an individual's name.
    orgName: "Join Research Canada",
    oneLiner:
      "a completely free, fully online workshop series that teaches high school students how real research works - from finding a research question to presenting findings - with university mentors and guest researchers along the way",
    studentsServed: "150+",
    // Reach descriptor for the current, global online cohort.
    schoolsReached: "5 continents",
    headlineOutcome:
      "150 high school students are already registered for the current cohort, and we're projecting 300 across 5 continents by the end of the term - every one of them attending free, fully online",
    website: "https://joinresearch.ca",
    // Follows the "The founder, Join Research Canada" signature line, so it
    // describes the org rather than repeating the founder title.
    senderBlurb:
      "A student-led nonprofit helping students everywhere get real research experience through free, mentor-led online programs.",
    // ---- extra merge keys used by the jrc templates (update as numbers move) --
    cohortSize: "150",
    cohortReach:
      "150 students already registered, and we're projecting 300 across 5 continents this cohort, all attending free",
    recentMomentum: "new registrations now arriving from 5 continents",
    pastGuests: "MIT PhD candidates and TMU professors",
    symposiumPitch:
      "the biggest, most accessible online research symposium yet - open to both university and high school students, with cash prizes, internship opportunities, and one-of-a-kind workshops",
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
        dailyQuota: 10,
        initialTemplate: "sponsors.initial.md",
        followUpTemplate: "sponsors.followup.md",
      },
      students: {
        tab: "Students",
        dailyQuota: 20,
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
        // Each faculty row is a <tr>: an <a> with the person's name, a separate
        // mailto <a>, then a "<b>Research Areas:</b> ..." cell. Without these
        // selectors the generic parser grabbed the "Research Areas:" label as
        // the name for EVERY prof. Pull the real name + real research area.
        selectors: {
          item: "table.blueTable tr",
          name: 'a:not([href^="mailto:"])',
          email: 'a[href^="mailto:"]',
          fieldFromLabel: "Research Areas:",
        },
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
      // REMOVED 2026-07-22: York "search all profiles" is a form-driven portal
      // (single-page scrape yields nothing) and the flat faculty listing 404s.
      // TMU/Queen's/UTSU-style directory pages that only publish office
      // inboxes are also not useful for the profs channel.

      // ----------------------------- STUDENTS -------------------------------
      // Club/association pages with a PUBLIC general inbox (verified present
      // in the page HTML on 2026-07-22). `orgContact: true` means: take the
      // published inbox(es), label the row with the club in `org`, and greet
      // "Hi {{org}} team," — never an individual student's address. Keep
      // `org` short; it is the greeting.
      {
        category: "students",
        label: "UofT — Undergraduate Research Students' Association (URSA)",
        url: "https://sop.utoronto.ca/group/uoft-undergraduate-research-students-association-uoft-ursa/",
        org: "UofT URSA",
        defaultField: "undergraduate research",
        orgContact: true,
      },
      {
        category: "students",
        label: "UofT — Arts & Science Students' Union (ASSU)",
        url: "https://assu.ca/wp/contact/",
        org: "UofT ASSU",
        defaultField: "arts and science",
        orgContact: true,
      },
      {
        category: "students",
        label: "Waterloo — Science Society club directory (many club inboxes)",
        url: "https://scisoc.uwaterloo.ca/contact/",
        org: "Waterloo Science Society",
        defaultField: "science",
        orgContact: true,
      },
      {
        category: "students",
        label: "Queen's — Arts & Science Undergraduate Society (ASUS)",
        url: "https://www.queensasus.com/",
        org: "Queen's ASUS",
        defaultField: "arts and science",
        orgContact: true,
      },
      {
        category: "students",
        label: "UofT — Engineering Society (Skule)",
        url: "https://skule.ca/",
        org: "UofT Engineering Society",
        defaultField: "engineering",
        orgContact: true,
      },
      {
        category: "students",
        label: "UofT — Students' Union (UTSU)",
        url: "https://www.utsu.ca/contact/",
        org: "UTSU",
        defaultField: "student leadership",
        orgContact: true,
      },
    ],
    // The sponsors channel is journals-first: the Symposium's prizes include
    // publication opportunities, so student research journals are the partners
    // that matter most. Every `email` below was verified PUBLISHED on the page
    // in `source_url` on 2026-07-22 — never hand-enter an address you have not
    // seen on the org's own public page. `name` doubles as the greeting
    // ("Hi {{name}},"), so keep it team-shaped.
    sponsorSeeds: [
      {
        name: "Journal of High School Science team",
        org: "The Journal of High School Science",
        field: "publishing peer-reviewed high school research",
        email: "journalofhighschoolscience@gmail.com",
        source_url: "https://jhss.scholasticahq.com/",
      },
      {
        name: "IJHSR editorial team",
        org: "International Journal of High School Research",
        field: "publishing high school research across the sciences",
        email: "info@geniusolympiad.org",
        source_url: "https://ijhighschoolresearch.org/",
      },
      {
        name: "Curieux editorial team",
        org: "Curieux Academic Journal",
        field: "publishing work by middle and high school researchers",
        email: "cajjournal@gmail.com",
        source_url: "https://www.curieuxacademicjournal.com/",
      },
      {
        name: "NHSJS editorial team",
        org: "National High School Journal of Science",
        field: "peer-reviewed publishing for high school scientists",
        email: "submissions@nhsjs.com",
        source_url: "https://nhsjs.com/contact/",
      },
      {
        name: "Young Scientists Journal team",
        org: "Young Scientists Journal",
        field: "student-run science publishing for 12-20 year olds",
        email: "chief.editor@ysjournal.com",
        source_url: "https://www.youngscientistsjournal.com/contact",
      },
      // Already contacted manually or by earlier runs — do not re-seed:
      //   Shad Canada (mary@shad.ca, emailed + followed up 2026-07).
      // Form-only contact pages (no published inbox; reach out manually):
      //   Actua, Let's Talk Science (403s our bot), Youth Science Canada,
      //   Journal of Emerging Investigators, Journal of Student Research,
      //   Journal of Young Investigators, URNCST Journal, McMaster Science
      //   Society, Canadian Science Fair Journal.
    ],
  },
};
