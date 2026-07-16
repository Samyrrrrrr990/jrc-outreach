/**
 * Scrape-source registry — derived from the ACTIVE ORG PROFILE. Add or edit
 * sources in ./profiles/<org>.ts; this module is engine plumbing.
 *
 * IMPORTANT: only add PUBLIC faculty/department/club pages. Do not add
 * LinkedIn or anything disallowed by robots.txt/ToS — the fetcher enforces
 * robots.txt at runtime regardless. Never hand-enter a guessed email.
 * Run `npx tsx src/cli.ts verify` after editing to catch dead sources.
 */
import type { Category } from "../core/types";
import type { DirectorySource, SponsorSeed } from "./profile";
import { activeProfile } from "./profiles";

export type { DirectorySource, SponsorSeed } from "./profile";

export const DIRECTORY_SOURCES: DirectorySource[] = activeProfile().sources.directories;

export const SPONSOR_SEEDS: SponsorSeed[] = activeProfile().sources.sponsorSeeds;

export function directorySourcesFor(cat: Category): DirectorySource[] {
  return DIRECTORY_SOURCES.filter((s) => s.category === cat);
}
