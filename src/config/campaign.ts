/**
 * Campaign-wide constants: quotas, the daily cap, follow-up cadence, and the
 * mapping from category -> Sheet tab -> template files — all derived from the
 * ACTIVE ORG PROFILE (selected by the ORG_PROFILE env var; see ./profiles/).
 * Tune an org in its profile file, never here: this module is engine plumbing.
 */
import type { Category } from "../core/types";
import type { CampaignConfig, CategoryConfig } from "./profile";
import { activeProfile } from "./profiles";

export type { CampaignConfig, CategoryConfig } from "./profile";

export const CAMPAIGN: CampaignConfig = activeProfile().campaign;

export function categoryConfig(cat: Category): CategoryConfig {
  return CAMPAIGN.categories[cat];
}

/** Categories in the order the daily cap should drain them. */
export const CATEGORY_ORDER: Category[] = ["sponsors", "profs", "students"];
