/**
 * Single shared "proof points" data module (SKILLS.md §5). Every template
 * pulls its stats from here so they are consistent and edited in one place.
 *
 * SAFETY GATE: real numbers must replace every «placeholder» below. Any value
 * still containing the sentinel character « will cause assertProofPointsReady()
 * to throw before a live send — so you can never accidentally email a
 * fabricated statistic. Dry-runs are allowed through so you can preview merges.
 */

export const PLACEHOLDER_SENTINEL = "«";

export const PROOF_POINTS = {
  /** Public-facing program name used in the emails. */
  programName: "Research 101",
  /** One-line description of what the program does. */
  oneLiner:
    "A free, mentor-led program that gives students real research experience — from finding a research question to working alongside university mentors on real problems, with feedback along the way.",
  /** e.g. "300+" — total students served historically, across all programs. */
  studentsServed: "150+",
  /**
   * NOTE: repurposed from "schools reached" to "provinces reached this
   * cohort" — we don't have a verified schools-reached count yet, but we do
   * have a verified provinces count for the current signed-up cohort. Update
   * the label in templates if you add a real schools-reached figure later.
   */
  schoolsReached: "5",
  /** A concrete, verifiable outcome. */
  headlineOutcome:
    "55 students already signed up across 5 provinces for this cohort, on top of 150+ students helped since we started — plus a 40+ member research club we built that became the fastest-growing club at our founder's school.",
  /** Where a curious reader can verify the above. */
  website: "https://joinresearch.ca",
  /** Short sign-off line describing who you are. */
  senderBlurb:
    "Founder of Join Research Canada, a student-led nonprofit helping Canadian students get real research experience through free, mentor-led programs.",
} as const;

export type ProofPoints = Record<keyof typeof PROOF_POINTS, string>;

/**
 * Throws if any proof point is still a placeholder. Called before live sends.
 * Returns the list of unfilled keys in the thrown message for a fast fix.
 */
export function assertProofPointsReady(pp: ProofPoints = PROOF_POINTS): void {
  const unfilled = (Object.keys(pp) as Array<keyof ProofPoints>).filter((k) =>
    String(pp[k]).includes(PLACEHOLDER_SENTINEL),
  );
  if (unfilled.length > 0) {
    throw new Error(
      "Refusing to send: proof points still contain placeholders. " +
        `Fill these in src/config/proofPoints.ts: ${unfilled.join(", ")}`,
    );
  }
}

/** Whether the proof points are fully configured (no throw). */
export function proofPointsReady(pp: ProofPoints = PROOF_POINTS): boolean {
  return !(Object.keys(pp) as Array<keyof ProofPoints>).some((k) =>
    String(pp[k]).includes(PLACEHOLDER_SENTINEL),
  );
}