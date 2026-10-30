import { describe, expect, it, vi } from "vitest";
import type { AiTaskRunner } from "@e4s/ai";
import type { ContentWeekInput } from "@e4s/contracts";
import {
  generateWeeklyLessons,
  learnerFacingLanguageFindings,
  runWeeklyLessonLevelBatch
} from "./weekly-generation.js";

/**
 * Regression coverage for the public orchestration boundary.
 *
 * Component validity, checkpointed day sequencing, three-attempt repair and
 * partial-result recovery are exercised in weekly-generation-components.test.
 * Database persistence and the UI batch route are exercised in
 * content.integration.test. This file keeps only behaviour owned by this
 * module's public boundary; the retired aggregate-pipeline fixtures duplicated
 * a pre-checkpoint implementation and contradicted the current contract.
 */
describe("weekly lesson generation public contract", () => {
  it("requires an accepted five-day plan before the provider is called", async () => {
    const runTask = vi.fn();
    const week = {
      weekNumber: 2,
      topic: "Ordering office supplies",
      description: "Order supplies with a deadline",
      objectives: "Place and confirm an order",
      keyVocabHint: "order, quantity, deadline"
    } as ContentWeekInput;

    await expect(generateWeeklyLessons(
      week,
      "B2",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner
    )).rejects.toMatchObject({
      code: "CONTENT_WEEK_PLAN_REQUIRED",
      issues: [expect.objectContaining({
        code: "CONTENT_WEEK_PLAN_REQUIRED",
        component: "plan",
        dayNumber: null,
        repairAction: "regenerate_plan"
      })]
    });
    expect(runTask).not.toHaveBeenCalled();
  });

  it("rejects mixed learner-facing B1+ fields while retaining Vietnamese vocabulary meanings", () => {
    expect(learnerFacingLanguageFindings("foundation", {
      title: "Polite clarification",
      objective: { items: [{ text: "By the end, you can hỏi lại lịch sự." }] },
      instruction: { step1: "Read the example.", step2: "Làm bài tập.", step3: "Review your answer." },
      grammar: { usage: "Use this pattern to clarify a request." },
      pronunciation: { tip: "Keep your voice calm." }
    }, "B1")).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["objective", "items", 0, "text"] }),
      expect.objectContaining({ path: ["instruction", "step2"] })
    ]));

    expect(learnerFacingLanguageFindings("vocabulary", {
      title: "Vocabulary",
      word1: {
        word: "clarify",
        meaning: "làm rõ",
        partOfSpeech: "verb",
        collocation1: "clarify a request",
        collocation2: "clarify the issue",
        collocation3: "clarify expectations"
      }
    }, "B1")).toEqual([]);
  });

  it("allows Vietnamese learner guidance at A1-A2", () => {
    expect(learnerFacingLanguageFindings("skills", {
      writing: { prompt: "Chọn câu trả lời đúng." },
      speaking: { prompt: "Nói một câu ngắn." }
    }, "A2")).toEqual([]);
  });

  it("isolates one failed level and preserves the successful level results", async () => {
    let caught: unknown;
    try {
      await runWeeklyLessonLevelBatch(["A1", "A2", "B1", "B2", "C1"], async (level) => {
        if (level === "B1") throw Object.assign(new Error("provider unavailable"), { code: "AI_PROVIDER_RATE_LIMIT" });
        return `${level}-saved`;
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "AI_LEVEL_BATCH_FAILED",
      failures: [expect.objectContaining({ level: "B1", code: "AI_PROVIDER_RATE_LIMIT" })],
      partialResults: { A1: "A1-saved", A2: "A2-saved", B2: "B2-saved", C1: "C1-saved" }
    });
  });
});
