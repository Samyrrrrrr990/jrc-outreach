/**
 * Campaign-wide constants: quotas, the daily cap, follow-up cadence, and the
 * mapping from category -> Sheet tab -> template files. Everything a human
 * would tune lives here, in one place.
 */
import type { Category } from "../core/types";

export interface CategoryConfig {
  /** Exact Sheet tab name for this category. */
  tab: string;
  /** Max initial emails to send for this category per day. */
  dailyQuota: number;
  /** Template basenames under /templates. */
  initialTemplate: string;
  followUpTemplate: string;
}

export const CAMPAIGN = {
  /** Hard ceiling on total initial emails per day, across all categories. */
  dailyCap: 50,

  /** Wait this many days after `emailed` before the single follow-up. */
  followUpAfterDays: 3,

  /** Wait this many days after `followed_up` before marking `cold`. */
  coldAfterDays: 5,

  /** Be a good citizen: one request per domain per this many ms. */
  scrapePerDomainMs: 1000,

  /** User-Agent used for all scrape requests. */
  userAgent:
    "JRC-OutreachBot/1.0 (+academic outreach; contact via site owner)",

  /** The Sheet tab that receives daily run summaries. */
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
  } satisfies Record<Category, CategoryConfig>,
} as const;

export function categoryConfig(cat: Category): CategoryConfig {
  return CAMPAIGN.categories[cat];
}

/** Categories in the order the daily cap should drain them. */
export const CATEGORY_ORDER: Category[] = ["sponsors", "profs", "students"];
