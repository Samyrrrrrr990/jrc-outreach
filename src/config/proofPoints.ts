/**
 * Shared "proof points" — the stats every template merges in, sourced from
 * the ACTIVE ORG PROFILE (edit them in ./profiles/<org>.ts, not here).
 *
 * SAFETY GATE: any value still containing the sentinel character « causes
 * assertProofPointsReady() to throw before a live send — so an org can never
 * accidentally email a fabricated statistic. Dry-runs are allowed through so
 * merges stay previewable.
 */
import type { ProofPoints } from "./profile";
import { activeProfile } from "./profiles";

export type { ProofPoints } from "./profile";

export const PLACEHOLDER_SENTINEL = "«";

export const PROOF_POINTS: ProofPoints = activeProfile().proofPoints;

/**
 * Throws if any proof point is still a placeholder. Called before live sends.
 * Returns the list of unfilled keys in the thrown message for a fast fix.
 */
export function assertProofPointsReady(pp: ProofPoints = PROOF_POINTS): void {
  const unfilled = Object.keys(pp).filter((k) =>
    String(pp[k]).includes(PLACEHOLDER_SENTINEL),
  );
  if (unfilled.length > 0) {
    throw new Error(
      "Refusing to send: proof points still contain placeholders. " +
        `Fill these in the org profile (src/config/profiles/): ${unfilled.join(", ")}`,
    );
  }
}

/** Whether the proof points are fully configured (no throw). */
export function proofPointsReady(pp: ProofPoints = PROOF_POINTS): boolean {
  return !Object.keys(pp).some((k) => String(pp[k]).includes(PLACEHOLDER_SENTINEL));
}
