import { describe, expect, it } from "vitest";
import type { MonthlyCurriculumContract } from "@e4s/domain";
import { generateMonthlyDay, monthlyCheckpointKey } from "./monthly-day-generation.js";

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
});

function part(code: string) {
  if (code === "vocabulary") return { code, content: { items: [
    { word: "budget", synonyms: ["plan"], antonyms: [] }, { word: "cost", synonyms: ["expense"], antonyms: [] }, { word: "forecast", synonyms: ["estimate"], antonyms: [] }
  ] } };
  if (code === "grammar") return { code, content: { formula: "The cost is + adjective" } };
  if (code === "pronunciation") return { code, content: { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] } };
  return { code, content: {} };
}

function contract(): MonthlyCurriculumContract {
  return {
    month: "2026-11", cefr: "A1", version: 1, theme: { version: 1, title: "Budget", brief: "Brief", context: "Context", communicationGoal: "Goal" },
    coreTerms: [{ id: "budget", word: "budget", meaning: "ngân sách", type: "noun", ipa: "/ˈbʌdʒɪt/" }, { id: "cost", word: "cost", meaning: "chi phí", type: "noun", ipa: "/kɒst/" }, { id: "forecast", word: "forecast", meaning: "dự báo", type: "noun", ipa: "/ˈfɔːkɑːst/" }], supportTerms: [],
    grammarTopics: [{ id: "grammar", title: "Cost", steps: [{ id: "step", focus: "cost", formula: "The cost is + adjective", usage: "Describe cost", examples: ["The cost is high."] }] }],
    sounds: [{ id: "sound", ipa: "/k/", label: "K", examples: [{ id: "cost", word: "cost", ipa: "/kɒst/" }, { id: "can", word: "can", ipa: "/kæn/" }, { id: "key", word: "key", ipa: "/kiː/" }] }],
    daySpecs: [{ lessonNumber: 1, date: "2026-11-02", kind: "new", coreTermIds: ["budget", "cost", "forecast"], reviewTermIds: [], grammarStepId: "step", soundId: "sound", pronunciationExampleIds: ["cost", "can", "key"] }]
  };
}
