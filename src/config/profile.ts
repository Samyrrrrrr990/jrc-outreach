/**
 * Org profile — the ONE place everything org-specific lives. The core engine
 * (scrape/dedup/send/reply/follow-up/analytics) reads all org data through
 * the active profile, so onboarding another chapter/org is: add a profile
 * file + a templates folder + its own deployment secrets. No engine changes.
 * See MULTI_TENANT.md for the onboarding checklist.
 *
 * Types only in this module — the registry lives in ./profiles/index.ts.
 */
import type { Category } from "../core/types";

/** Shared stats the templates merge in. Keys are fixed; values are per-org. */
export interface ProofPoints {
  programName: string;
  oneLiner: string;
  studentsServed: string;
  schoolsReached: string;
  headlineOutcome: string;
  website: string;
  senderBlurb: string;
  [extra: string]: string;
}

export interface CategoryConfig {
  /** Exact Sheet tab name for this category. */
  tab: string;
  /** Max initial emails to send for this category per day. */
  dailyQuota: number;
  /** Template basenames under templates/<templatesDir>/. */
  initialTemplate: string;
  followUpTemplate: string;
}

export interface CampaignConfig {
  /** Hard ceiling on total initial emails per day, across all categories. */
  dailyCap: number;
  /** Wait this many days after `emailed` before the single follow-up. */
  followUpAfterDays: number;
  /** Wait this many days after `followed_up` before marking `cold`. */
  coldAfterDays: number;
  /** Be a good citizen: one request per domain per this many ms. */
  scrapePerDomainMs: number;
  /** User-Agent used for all scrape requests. Identify yourself truthfully. */
  userAgent: string;
  /** The Sheet tab that receives run summaries. */
  logTab: string;
  categories: Record<Category, CategoryConfig>;
}

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
    item: string;
    name?: string;
    email?: string;
    field?: string;
  };
}

/**
 * A curated sponsor target. Either supply a known public `email` (published
 * on their site) or a `contactUrl` to scrape. `source_url` records
 * provenance for the row. NEVER hand-enter a guessed email.
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

export interface OrgProfile {
  /** Short id, used in ORG_PROFILE env and log/alert tags. */
  id: string;
  /** Human name, used in the dashboard title and reports. */
  displayName: string;
  /**
   * true for profiles meant to send real email. CI enforces that a
   * production profile has no «placeholder» proof points; a non-production
   * profile is additionally blocked from live sends by the same gate.
   */
  production: boolean;
  /** Folder under /templates holding this org's email templates. */
  templatesDir: string;
  proofPoints: ProofPoints;
  campaign: CampaignConfig;
  sources: {
    directories: DirectorySource[];
    sponsorSeeds: SponsorSeed[];
  };
}
