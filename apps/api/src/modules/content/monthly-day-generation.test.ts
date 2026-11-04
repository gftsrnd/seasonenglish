import { describe, expect, it } from "vitest";
import type { MonthlyCurriculumContract } from "@e4s/domain";
import { generateMonthlyDay, generateMonthlyDayWithAi, monthlyCheckpointKey } from "./monthly-day-generation.js";

const components = ["objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"];

describe("monthly day generation", () => {
  it("passes only locked DaySpec data to AI and retries the failed component without replacing valid parts", async () => {
    const calls: string[][] = [];
    const result = await generateMonthlyDay({
      contract: contract(), dayNumber: 1,
      generate: async (input) => {
        calls.push([...input.components]);
        expect(input.coreTerms.map((term) => term.word)).toEqual(["budget", "cost", "forecast"]);
        expect(input.grammarStep.formula).toBe("The cost is + adjective");
        expect(input.sound.ipa).toBe("/k/");
        return { title: "The cost is high", parts: input.components.filter((component) => component !== "speaking").map(part) };
      }
    });

    expect(result.status).toBe("failed");
    expect(calls).toEqual([components, ["speaking"], ["speaking"]]);

    let retry = 0;
    const repairedCalls: string[][] = [];
    const repaired = await generateMonthlyDay({
      contract: contract(), dayNumber: 1,
      generate: async (input) => {
        retry += 1;
        repairedCalls.push([...input.components]);
        return retry === 1
          ? { title: "The cost is high", parts: input.components.filter((component) => component !== "speaking").map(part) }
          : { title: "The cost is high", parts: [part("speaking")] };
      }
    });
    expect(repaired.status).toBe("ready");
    expect(repaired.lesson?.parts).toHaveLength(11);
    expect(repaired.attempts).toBe(2);
    expect(repairedCalls).toEqual([components, ["speaking"]]);
    expect(monthlyCheckpointKey(repaired.scopeHash, 1, "speaking")).toContain(":day1:speaking");
  });

  it("returns a diagnostic failure rather than a template lesson when a severe error remains", async () => {
    const result = await generateMonthlyDay({
      contract: contract(), dayNumber: 1,
      generate: async () => ({ title: "Bad", parts: [] }), maxAttempts: 2
    });
    expect(result).toMatchObject({ status: "failed", lesson: null, attempts: 2 });
    expect(result.report.severe).not.toEqual([]);
  });

  it("calls the monthly AI task with the locked theme, scope and DaySpec", async () => {
    const runner = { runTask: async (taskId: string, input: Record<string, any>) => {
      expect(taskId).toBe("monthly_lesson_day");
      expect(input.month).toBe("2026-11");
      expect(input.cefr).toBe("A1");
      expect(input.daySpec).toMatchObject({ lessonNumber: 1, coreTermIds: ["budget", "cost", "forecast"] });
      expect(input.lockedScope.coreTerms.map((term: { id: string }) => term.id)).toEqual(["budget", "cost", "forecast"]);
      expect(input.lockedScope.grammarStep.id).toBe("step");
      expect(input.lockedScope.sound.id).toBe("sound");
      expect(input.lockedScope.supportTerms.map((term: { id: string }) => term.id)).toEqual(["support-1", "support-2", "support-3"]);
      return { output: { lesson: { ...lessonCandidate(), title: "Budget lesson" } }, metadata: {} };
    } } as unknown as import("@e4s/ai").AiTaskRunner;
    const result = await generateMonthlyDayWithAi(contract(), 1, runner, "Test monthly lesson prompt");
    expect(result.status).toBe("ready");
    expect(result.lesson?.title).toBe("Budget lesson");
  });

  it("loads review support terms by explicit weekly IDs instead of the review calendar day", async () => {
    const reviewContract = contract();
    reviewContract.daySpecs.push({ lessonNumber: 5, date: "2026-11-06", kind: "review", coreTermIds: [], expandedTermIds: [], reviewTermIds: ["budget", "cost", "forecast"], reviewExpandedTermIds: ["support-1", "support-2", "support-3"], skillExercises: monthlyExercises(["budget", "cost", "forecast", "support-1", "support-2", "support-3"]), grammarStepId: "step", soundId: "sound", pronunciationExampleIds: ["cost", "can", "key"] });
    const runner = { runTask: async (_taskId: string, input: Record<string, any>) => {
      expect(input.daySpec.kind).toBe("review");
      expect(input.lockedScope.supportTerms.map((term: { id: string }) => term.id)).toEqual(["support-1", "support-2", "support-3"]);
      return { output: { lesson: { ...lessonCandidate(), title: "Budget review" } }, metadata: {} };
    } } as unknown as import("@e4s/ai").AiTaskRunner;

    const result = await generateMonthlyDayWithAi(reviewContract, 5, runner, "Test monthly lesson prompt");
    expect(result.status).toBe("ready");
  });
});

function lessonCandidate() {
  return { parts: components.map((code) => part(code)) };
}

function part(code: string) {
  if (code === "objective") return { code, content: { text: "Identify three budget words." } };
  if (code === "instruction") return { code, content: { steps: ["Read the example.", "Answer the question."] } };
  if (code === "vocabulary") return { code, content: { items: [
    { word: "budget", synonyms: ["plan"], antonyms: [] }, { word: "cost", synonyms: ["expense"], antonyms: [] }, { word: "forecast", synonyms: ["estimate"], antonyms: [] }
  ] } };
  if (code === "grammar") return { code, content: { formula: "The cost is + adjective" } };
  if (code === "pronunciation") return { code, content: { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] } };
  if (["listening", "reading", "word_class", "word_use"].includes(code)) return { code, content: {
    ...(code === "listening" ? { script: "The cost is high." } : code === "reading" ? { text: "The cost is high." } : {}),
    prompt: "What is high?", options: ["The cost", "The room", "The plan", "The date"], answer: "The cost"
  } };
  if (code === "writing") return { code, content: { prompt: "Write one sentence about cost.", answer: "The cost is high." } };
  if (code === "speaking") return { code, content: { prompt: "Say a sentence about cost.", sample: "The cost is high." } };
  return { code, content: {} };
}

function contract(): MonthlyCurriculumContract {
  return {
    month: "2026-11", cefr: "A1", version: 1, theme: { version: 1, title: "Budget", brief: "Brief", context: "Context", communicationGoal: "Goal" },
    coreTerms: [{ id: "budget", word: "budget", meaning: "ngân sách", type: "noun", ipa: "/ˈbʌdʒɪt/", source: "core_registry", component: "core", dayNumber: 1 }, { id: "cost", word: "cost", meaning: "chi phí", type: "noun", ipa: "/kɒst/", source: "core_registry", component: "core", dayNumber: 1 }, { id: "forecast", word: "forecast", meaning: "dự báo", type: "noun", ipa: "/ˈfɔːkɑːst/", source: "core_registry", component: "core", dayNumber: 1 }], supportTerms: [{ id: "support-1", word: "budgetary", meaning: "thuộc ngân sách", type: "adjective", relation: "word_family", source: "family", component: "expanded", dayNumber: 1, relatedCoreTermId: "budget" }, { id: "support-2", word: "expense", meaning: "chi phí", type: "noun", relation: "synonym", source: "synonym", component: "expanded", dayNumber: 1, relatedCoreTermId: "cost" }, { id: "support-3", word: "projection", meaning: "dự báo", type: "noun", relation: "synonym", source: "synonym", component: "expanded", dayNumber: 1, relatedCoreTermId: "forecast" }],
    grammarTopics: [{ id: "grammar", title: "Cost", steps: [{ id: "step", focus: "cost", formula: "The cost is + adjective", usage: "Describe cost", examples: ["The cost is high."] }] }],
    sounds: [{ id: "sound", ipa: "/k/", label: "K", examples: [{ id: "cost", word: "cost", ipa: "/kɒst/" }, { id: "can", word: "can", ipa: "/kæn/" }, { id: "key", word: "key", ipa: "/kiː/" }] }],
    daySpecs: [{ lessonNumber: 1, date: "2026-11-02", kind: "new", coreTermIds: ["budget", "cost", "forecast"], expandedTermIds: ["support-1", "support-2", "support-3"], reviewTermIds: [], reviewExpandedTermIds: [], skillExercises: monthlyExercises(["budget", "cost", "forecast", "support-1", "support-2", "support-3"]), grammarStepId: "step", soundId: "sound", pronunciationExampleIds: ["cost", "can", "key"] }]
  };
}

function monthlyExercises(resourceIds: string[]) {
  return ["listening", "reading", "writing", "word_class", "word_use", "speaking"].map((exerciseCode) => ({ exerciseCode: exerciseCode as "listening" | "reading" | "writing" | "word_class" | "word_use" | "speaking", focus: "Use the monthly resources in this exercise.", resourceIds }));
}
