import { describe, expect, it } from "vitest";
import {
  calculateAutomaticSectionScore,
  calculatePlacementResult,
  calculateSpeakingScore,
  calculateWritingScore,
  mapPlacementCefr,
  placementManualReviewReasons,
  passesLevelUp
} from "../src/assessment/index.js";

describe("assessment scoring follows the approved evidence rules", () => {
  it.each([
    [0, "A1"], [24.99, "A1"], [25, "A2"], [44.99, "A2"],
    [45, "B1"], [64.99, "B1"], [65, "B2"], [84.99, "B2"], [85, "C1"], [100, "C1"]
  ] as const)("maps %s to %s without rounding up", (score, expected) => {
    expect(mapPlacementCefr(score)).toBe(expected);
  });

  it("scores objective items from their explicit point values", () => {
    expect(calculateAutomaticSectionScore([
      { taskKey: "L1", answer: "B", correctAnswer: "B", maxScore: 1 },
      { taskKey: "L2", answer: "A", correctAnswer: "B", maxScore: 1 },
      { taskKey: "L11", answer: "C", correctAnswer: "C", maxScore: 2 }
    ])).toEqual({ score: 3, maxScore: 4, answered: 3, total: 3 });
  });

  it("weights the two Writing tasks as 7 and 13 points", () => {
    expect(calculateWritingScore([
      { taskKey: "W1", criterionScores: [3, 3, 2, 4, 3], weight: 7 },
      { taskKey: "W2", criterionScores: [4, 3, 3, 3, 4], weight: 13 }
    ])).toEqual({ score: 16.3, maxScore: 20, status: "scored" });
  });

  it("scales four Speaking task rubrics to 5 points each", () => {
    expect(calculateSpeakingScore([
      { taskKey: "S1", criterionScores: [4, 3, 3, 2], evidenceType: "audio" },
      { taskKey: "S2", criterionScores: [4, 3, 4, 3], evidenceType: "audio" },
      { taskKey: "S3", criterionScores: [4, 3, 4, 4], evidenceType: "audio" },
      { taskKey: "S4", criterionScores: [4, 3, 5, 3], evidenceType: "audio" }
    ])).toEqual({ score: 14, maxScore: 20, status: "scored" });
  });

  it("does not turn a technical Speaking failure into zero", () => {
    expect(calculateSpeakingScore([
      { taskKey: "S1", criterionScores: [4, 3, 3, 2], evidenceType: "audio" },
      { taskKey: "S2", criterionScores: null, evidenceType: "technical_failure" }
    ])).toEqual({ score: null, maxScore: 20, status: "pending_evidence" });
  });

  it("does not finalize placement while a productive section is unscored", () => {
    expect(calculatePlacementResult({ listening: 18, reading: 32, writing: 16.3, speaking: null }))
      .toEqual({ status: "pending_review", totalScore: null, cefr: null });
  });

  it("requires explicit review for missing evidence, proxy evidence, material skill gaps and CEFR boundaries", () => {
    expect(placementManualReviewReasons({
      scores: { listening: 18, reading: 36, writing: null, speaking: 14 },
      speakingEvidence: ["audio", "typed_proxy", "technical_failure", "audio"]
    })).toEqual(expect.arrayContaining(["missing_productive_score", "typed_proxy", "technical_failure"]));

    expect(placementManualReviewReasons({
      scores: { listening: 20, reading: 18, writing: 18, speaking: 18 },
      speakingEvidence: ["audio", "audio", "audio", "audio"]
    })).toContain("material_skill_gap");

    expect(placementManualReviewReasons({
      scores: { listening: 15, reading: 30, writing: 10, speaking: 9.6 },
      speakingEvidence: ["audio", "audio", "audio", "audio"]
    })).toContain("cefr_boundary");
  });

  it("uses the total and every-skill minimum for level-up", () => {
    expect(passesLevelUp({ listening: 20, reading: 20, writing: 20, speaking: 15 })).toBe(true);
    expect(passesLevelUp({ listening: 25, reading: 25, writing: 21, speaking: 9 })).toBe(false);
  });
});
