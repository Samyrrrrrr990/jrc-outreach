import { describe, it, expect } from "vitest";
import {
  PROOF_POINTS,
  assertProofPointsReady,
  proofPointsReady,
} from "../src/config/proofPoints";

describe("proof-points safety gate", () => {
  it("the live config contains no unfilled «placeholders»", () => {
    // The operator has filled in real stats; a regression back to a
    // «placeholder» in any value must block live sends again.
    expect(proofPointsReady(PROOF_POINTS)).toBe(true);
    expect(() => assertProofPointsReady(PROOF_POINTS)).not.toThrow();
  });

  it("is ready only once every placeholder is replaced", () => {
    const filled = {
      programName: "JRC",
      oneLiner: "a real one-liner",
      studentsServed: "300+",
      schoolsReached: "12",
      headlineOutcome: "a real outcome",
      website: "https://jrc.example",
      senderBlurb: "who I am",
    };
    expect(proofPointsReady(filled)).toBe(true);
    expect(() => assertProofPointsReady(filled)).not.toThrow();
  });

  it("catches a single missed placeholder", () => {
    const almost = {
      programName: "JRC",
      oneLiner: "a real one-liner",
      studentsServed: "«N»", // still a placeholder
      schoolsReached: "12",
      headlineOutcome: "a real outcome",
      website: "https://jrc.example",
      senderBlurb: "who I am",
    };
    expect(() => assertProofPointsReady(almost)).toThrow(/studentsServed/);
  });
});
