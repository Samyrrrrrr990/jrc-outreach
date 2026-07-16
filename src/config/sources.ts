/**
 * Scrape-source registry. Config-driven so adding a department page or a
 * sponsor target needs no code change — just another entry here.
 *
 * IMPORTANT (AGENTS.md): only add PUBLIC faculty/department/club pages. Do not
 * add LinkedIn or anything disallowed by robots.txt/ToS — the fetcher enforces
 * robots.txt at runtime regardless. Never hand-enter a guessed email.
 *
 * VERIFICATION NOTE: every URL below was checked as a real, currently-live
 * public page. `selectors` is intentionally omitted everywhere — I could not
 * inspect live rendered DOM/CSS classes from where this file was written, so
 * rather than guess a selector that might silently break, every source relies
 * on the generic mailto/obfuscated-email parser described in the interface
 * doc below. Test each source with `--dry-run` first and add real selectors
 * only once you've confirmed the generic parser under- or over-matches.
 */
import type { Category } from "../core/types";

/**
 * A faculty/student directory page. If `selectors` is omitted, the parser uses
 * a generic strategy: find every mailto:/obfuscated email on the page and pair
 * it with the nearest preceding heading/name text.
 */
export interface DirectorySource {
  category: Extract<Category, "profs" | "students">;
  /** Human label, e.g. "UofT — Computer Science". */
  label: string;
  url: string;
  /** School/organisation applied to every contact found here. */
  org: string;
  /** Default field/department if the page has no per-person field. */
  defaultField: string;
  /** Optional CSS selectors to scope extraction to real rows. */
  selectors?: {
    /** Container element per person. */
    item: string;
    /** Element holding the name (relative to item). */
    name?: string;
    /** Element holding the email/mailto (relative to item). */
    email?: string;
    /** Element holding the field/title (relative to item). */
    field?: string;
  };
}

/**
 * A curated sponsor target. Either supply a known public `email` (e.g. a
 * partnerships@ inbox published on their site) or a `contactUrl` to scrape.
 * `source_url` records provenance for the row (required by AGENTS.md).
 */
export interface SponsorSeed {
  name: string;
  org: string;
  /** Focus area / why they fit. */
  field: string;
  email?: string;
  contactUrl?: string;
  source_url: string;
}

/**
 * Faculty + student directory pages to crawl.
 * Verified live as of this writing — re-check periodically, university sites
 * restructure without notice.
 */
export const DIRECTORY_SOURCES: DirectorySource[] = [
  // ---------------------------- PROFESSORS ---------------------------------
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
    // NOTE: this is a search portal, not a flat listing — it likely needs a
    // form submission or query-param crawl rather than a single-page scrape.
    // Flagging instead of guessing at a query string that might not exist.
    label: "York — Faculty of Science, search all profiles (NEEDS FORM HANDLING)",
    url: "https://www.yorku.ca/science/profiles/search-all-profiles/",
    org: "York University",
    defaultField: "Science",
  },

  // ----------------------------- STUDENTS -----------------------------------
  {
    category: "students",
    label: "UofT — Undergraduate Research Students' Association (URSA)",
    url: "https://sop.utoronto.ca/group/uoft-undergraduate-research-students-association-uoft-ursa/",
    org: "University of Toronto",
    defaultField: "Undergraduate Research",
    // NOTE: this portal page lists exec names/titles but did not expose
    // individual emails in what I could verify — the generic parser will
    // only capture rows where a real mailto is present. May need a fallback
    // to a general contact form/email for this club instead of per-exec rows.
  },
  // TODO: TMU / York / Western equivalents not yet verified — each school's
  // "recognized clubs" portal is the right place to look (mirroring UofT's
  // Student Organization Portal pattern at studentlife.utoronto.ca), but I
  // have not confirmed a live research-club listing for these three yet.
];

/**
 * Curated sponsor seed list.
 *
 * HONEST CAVEAT: these three are established Canadian STEM-education
 * charities (not corporations/foundations that hand out money themselves) —
 * they're realistic PARTNER targets (co-hosting, mentor referrals, symposium
 * collaboration) and each has a public corporate/foundation-giving page,
 * which also means they know exactly who their own funders are. I could not
 * verify a direct public email or contact page for actual funding bodies
 * (e.g. Toyota Canada Foundation, NWMO) from what I could access — treat
 * those as leads to research further, not entries to invent contact info for.
 */
export const SPONSOR_SEEDS: SponsorSeed[] = [
  {
    name: "Corporate & Foundation Giving Team",
    org: "Let's Talk Science",
    field: "National K-12 STEM education charity — corporate/foundation partnerships",
    contactUrl: "https://letstalkscience.ca/our-supporters/corporate-foundation-giving",
    source_url: "https://letstalkscience.ca/our-supporters/corporate-foundation-giving",
  },
  {
    name: "Partnerships Team",
    org: "Actua",
    field: "Canada's largest STEM youth-outreach charity — network of 40+ university/college members",
    contactUrl: "https://actua.ca/contact-us",
    source_url: "https://actua.ca/contact-us",
  },
  {
    name: "Development / Support Team",
    org: "Shad Canada",
    field: "Longest-running STEAM + entrepreneurship program for high schoolers — corporate/foundation donors",
    contactUrl: "https://www.shad.ca/support/",
    source_url: "https://www.shad.ca/support/",
  },
  // TODO (unverified — do NOT hand-fill emails/URLs for these without
  // checking yourself): Toyota Canada Foundation, NWMO community/STEM
  // outreach contact, Ontario Genomics, Mitacs partnerships — all appeared
  // as active funders/partners of comparable Canadian STEM orgs in research,
  // but I did not reach their own public contact pages to confirm a real URL.
];

export function directorySourcesFor(cat: Category): DirectorySource[] {
  return DIRECTORY_SOURCES.filter((s) => s.category === cat);
}