/**
 * Subject-line / opening-line A/B variants — pure logic + one readdir.
 *
 * Convention: the base template (e.g. `profs.initial.md`) is the "control"
 * variant. Additional variants are sibling files named
 * `profs.initial.variant-<id>.md` (id: lowercase letters/digits/hyphens).
 * Dropping a file in /templates adds a variant; deleting it removes it —
 * no code change either way.
 *
 * Selection is uniform random per send; the chosen id is recorded in the
 * row's `variant` column so analytics can compare reply rates per variant.
 * Nothing here ever auto-switches templates — the weekly report only
 * INFORMS the operator (see analytics/report.ts).
 */
import { readdirSync } from "node:fs";

export const CONTROL_VARIANT = "control";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse `<base-stem>.variant-<id>.md` for the given base; null otherwise. */
export function variantIdFromFilename(filename: string, base: string): string | null {
  const stem = base.replace(/\.md$/, "");
  const re = new RegExp(`^${escapeRegex(stem)}\\.variant-([a-z0-9][a-z0-9-]*)\\.md$`);
  const m = filename.match(re);
  return m ? m[1]! : null;
}

/** The template file that implements a variant of `base`. */
export function templateForVariant(base: string, variantId: string): string {
  if (variantId === CONTROL_VARIANT) return base;
  return base.replace(/\.md$/, `.variant-${variantId}.md`);
}

/** All variant ids available for a base template (control not included). */
export function listVariantIds(dir: string, base: string): string[] {
  return readdirSync(dir)
    .map((f) => variantIdFromFilename(f, base))
    .filter((id): id is string => id !== null)
    .sort();
}

/** Uniform random assignment across control + variants. */
export function pickVariant(
  variantIds: string[],
  rand: () => number = Math.random,
): string {
  const pool = [CONTROL_VARIANT, ...variantIds];
  const i = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
  return pool[i]!;
}

/**
 * Subject for the single follow-up. When the initial email used a non-control
 * variant, the follow-up threads under THAT subject ("Re: <variant subject>")
 * so the pair reads as one conversation; otherwise (control, untracked, or
 * the variant file has since been deleted) the follow-up template's own
 * subject is kept.
 */
export function resolveFollowUpSubject(opts: {
  variant: string | undefined;
  followUpSubject: string;
  /** Returns the rendered subject of the variant's initial template; may throw. */
  loadInitialVariantSubject: (variantId: string) => string;
}): string {
  const { variant } = opts;
  if (!variant || variant === CONTROL_VARIANT) return opts.followUpSubject;
  try {
    return `Re: ${opts.loadInitialVariantSubject(variant)}`;
  } catch {
    return opts.followUpSubject;
  }
}
