import { describe, expect, it } from "vitest";
import {
  canonicalLessonPartOrder,
  isLearnerProfileComplete,
  mergeLessonProgress,
  validateLessonPartOrder
} from "../src/learning/index.js";
import type { LearnerProfileData } from "@e4s/contracts";

describe("learner flow rules", () => {
  it("keeps the approved lesson sequence and allows optional word exercises in place", () => {
    expect(canonicalLessonPartOrder).toEqual([
      "objective", "instruction", "vocabulary", "grammar", "pronunciation",
      "listening", "reading", "writing", "word_class", "word_use", "speaking"
    ]);
    expect(validateLessonPartOrder(canonicalLessonPartOrder)).toEqual({ valid: true, misplaced: [] });
    expect(validateLessonPartOrder([
      "objective", "instruction", "vocabulary", "grammar", "pronunciation",
      "reading", "listening", "writing", "speaking"
    ])).toEqual({ valid: false, misplaced: ["listening"] });
  });

  it("gates home only while the mandatory fields from the existing onboarding screen are incomplete", () => {
    const completeProfile = {
      fullName: "Học viên Demo",
      email: "learner@e4s.local",
      goals: ["meeting"],
      environmentUse: "weekly",
      familyUse: "none",
      habits: ["podcast"],
      learningStyles: ["speaking"],
      persona: "informal",
      durationMinutes: 10,
      device: "both",
      selfLevel: "A2"
    } satisfies LearnerProfileData;

    expect(isLearnerProfileComplete(completeProfile)).toBe(true);
    expect(isLearnerProfileComplete({ ...completeProfile, goals: [] })).toBe(false);
    expect(isLearnerProfileComplete({ ...completeProfile, email: "not-an-email" })).toBe(false);
  });

  it("merges saved parts monotonically and completes only when every required exercise has evidence", () => {
    const required = ["listening", "reading", "writing", "speaking"] as const;
    const first = mergeLessonProgress(null, {
      completedPartCodes: ["reading"],
      evidence: { reading: { attempts: 1, answer: "A" } }
    }, required);
    const resumed = mergeLessonProgress(first, {
      completedPartCodes: ["listening"],
      evidence: { listening: { attempts: 1, answer: "B" } }
    }, required);

    expect(resumed.status).toBe("in_progress");
    expect(resumed.completedPartCodes).toEqual(["listening", "reading"]);
    expect(resumed.evidence).toMatchObject({ reading: { answer: "A" }, listening: { answer: "B" } });

    const completed = mergeLessonProgress(resumed, {
      completedPartCodes: ["writing", "speaking"],
      evidence: {
        writing: { attempts: 1, answer: "Hello team" },
        speaking: { attempts: 2, answer: "audio-object-key" }
      },
      markComplete: true
    }, required);
    expect(completed.status).toBe("completed");
  });
});
