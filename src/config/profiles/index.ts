/**
 * Profile registry + active-profile resolution. The active org is selected
 * by the ORG_PROFILE env var (default: "jrc") — the engine never hardcodes
 * an org. Unknown ids fail loudly, listing what exists.
 */
import type { OrgProfile } from "../profile";
import { jrc } from "./jrc";
import { demo } from "./demo";

export const PROFILES: Record<string, OrgProfile> = { jrc, demo };

export function profileById(id: string): OrgProfile {
  const profile = PROFILES[id];
  if (!profile) {
    throw new Error(
      `Unknown ORG_PROFILE "${id}". Available profiles: ${Object.keys(PROFILES).join(", ")}`,
    );
  }
  return profile;
}

/** The org this process is running as. Reads ORG_PROFILE on every call. */
export function activeProfile(env: NodeJS.ProcessEnv = process.env): OrgProfile {
  return profileById(env.ORG_PROFILE?.trim() || "jrc");
}
