import { describe, expect, it, vi } from "vitest";
import type { AiTaskRunner } from "@e4s/ai";
import { generateWeekSuggestionBatches, generateWeekSuggestions } from "./week-suggestion-generation.js";

vi.mock("@e4s/ai", async () => await import("../../../../../packages/ai/src/index.js"));

const metadata = {
  traceId: "trace-week", taskId: "week_suggestions", provider: "fixture", model: "fixture",
  attempts: 1, latencyMs: 1, inputHash: "hash", schemaValid: true as const, usage: {}
};

function option(topic: string) {
  const plan = [1, 2, 3, 4, 5].map((day) => `Outcome: complete workplace task ${day} | Vocabulary: update, deadline, blocker | Frame: Could you + base verb? | Skill emphasis: speaking`);
  return {
    topic,
    description: `${topic} at work`,
    objectives: `Use English for ${topic}`,
    keyVocabHint: "update, deadline, blocker",
    plan: {
      A1: plan,
      A2: plan,
      B1: plan,
      B2: plan
    }
  };
}

const validOutput = {
  weeks: [{
    weekNumber: 1,
    levels: ["A1", "A2", "B1", "B2"],
    options: [option("Project updates"), option("Meeting changes"), option("Customer feedback")]
  }]
};

describe("week suggestion generation", () => {
  it("generates a four-week pilot one week at a time and carries forward topics", async () => {
    const outputFor = (weekNumber: number) => {
      const topics = [
        ["Project kickoff", "Meeting agenda", "Customer feedback"],
        ["Supplier delays", "Safety incident", "Invoice queries"],
        ["Team onboarding", "Stock delivery", "Travel booking"],
        ["Performance review", "System outage", "Contract renewal"]
      ][weekNumber - 1]!;
      return ({
      weeks: [{
        ...validOutput.weeks[0],
        weekNumber,
        options: topics.map(option)
      }]
      });
    };
    const runTask = vi.fn(async (
      _task: string,
      input: { weekNumbers: number[]; usedTopics: string[] },
      _options?: { maxOutputTokens?: number }
    ) => ({
      output: outputFor(input.weekNumbers[0]!), metadata
    }));

    const generated = await generateWeekSuggestionBatches(
      { weekNumbers: [1, 2, 3, 4], levels: ["A1", "A2", "B1", "B2"], usedTopics: ["Existing topic"] },
      { prompt: "Suggest workplace topics." },
      { runTask } as unknown as AiTaskRunner
    );

    expect(generated.output.weeks.map((week) => week.weekNumber)).toEqual([1, 2, 3, 4]);
    expect(runTask).toHaveBeenCalledTimes(4);
    expect(runTask.mock.calls[1]?.[1]).toMatchObject({ weekNumbers: [2], usedTopics: expect.arrayContaining(["Project kickoff"]) });
    expect(runTask.mock.calls[3]?.[1]).toMatchObject({ weekNumbers: [4], usedTopics: expect.arrayContaining(["Travel booking"]) });
  });

  it("keeps carried topics within the 52-item schema limit across sequential weeks", async () => {
    const topicsByWeek: Record<number, string[]> = {
      3: ["Negotiating deadlines", "Escalating blockers", "Redesigning approvals"],
      4: ["Recording meeting minutes", "Planning client visits", "Reviewing safety incidents"]
    };
    const runTask = vi.fn(async (
      _task: string,
      input: { weekNumbers: number[]; usedTopics: string[] },
      _options?: { maxOutputTokens?: number }
    ) => ({
      output: {
        weeks: [{
          ...validOutput.weeks[0],
          weekNumber: input.weekNumbers[0],
          options: topicsByWeek[input.weekNumbers[0]!]!.map(option)
        }]
      },
      metadata
    }));

    const generated = await generateWeekSuggestionBatches(
      {
        weekNumbers: [3, 4],
        levels: ["A1", "A2", "B1", "B2"],
        usedTopics: Array.from({ length: 52 }, (_, index) => `Historical topic ${index + 1}`)
      },
      { prompt: "Suggest workplace topics." },
      { runTask } as unknown as AiTaskRunner
    );

    expect(generated.output.weeks.map((week) => week.weekNumber)).toEqual([3, 4]);
    expect(runTask).toHaveBeenCalledTimes(2);
    expect(runTask.mock.calls[1]?.[1].usedTopics).toHaveLength(52);
    expect(runTask.mock.calls[1]?.[1].usedTopics).toEqual(expect.arrayContaining([
      "Negotiating deadlines", "Escalating blockers", "Redesigning approvals"
    ]));
    expect(runTask.mock.calls[0]?.[2]).toMatchObject({ maxOutputTokens: 12_000 });
  });

  it("repairs a malformed first provider result internally instead of returning a format error", async () => {
    const runTask = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("AI_OUTPUT_INVALID"), {
        code: "AI_OUTPUT_INVALID",
        details: { issues: [{ path: "weeks.0.options", message: "Expected exactly 3 options" }] }
      }))
      .mockResolvedValueOnce({ output: validOutput, metadata });

    const generated = await generateWeekSuggestions(
      { weekNumbers: [1], levels: ["A1", "A2", "B1", "B2"], usedTopics: [] },
      { prompt: "Suggest workplace topics." },
      { runTask } as unknown as AiTaskRunner
    );

    expect(generated.output).toEqual(validOutput);
    expect(runTask).toHaveBeenCalledTimes(2);
    expect(runTask.mock.calls[1]?.[2]?.systemPrompt).toContain("REPAIR REQUIRED");
    expect(runTask.mock.calls[1]?.[2]?.systemPrompt).toContain("weeks.0.options");
  });

  it("repairs legacy single-skill or Vietnamese day plans into complete English blueprints", async () => {
    const legacy = structuredClone(validOutput);
    legacy.weeks[0]!.options[0]!.plan.B1 = [
      "Từ vựng: variance, forecast",
      "Ngữ pháp: so sánh hơn",
      "Đọc báo cáo ngân sách",
      "Viết giải thích chênh lệch",
      "Đóng vai trình bày kết quả"
    ];
    const runTask = vi.fn()
      .mockResolvedValueOnce({ output: legacy, metadata })
      .mockResolvedValueOnce({ output: validOutput, metadata });

    const generated = await generateWeekSuggestions(
      { weekNumbers: [1], levels: ["A1", "A2", "B1", "B2"], usedTopics: [] },
      { prompt: "Suggest workplace topics." },
      { runTask } as unknown as AiTaskRunner
    );

    expect(generated.output).toEqual(validOutput);
    expect(runTask).toHaveBeenCalledTimes(2);
    expect(runTask.mock.calls[1]?.[2]?.systemPrompt).toContain("Day-plan blueprints must be fully in English");
    expect(runTask.mock.calls[1]?.[2]?.systemPrompt).toContain("Day-plan blueprint is missing Outcome:");
  });

  it("stops after one repair instead of hiding an unstable provider behind repeated retries", async () => {
    const invalid = Object.assign(new Error("AI_OUTPUT_INVALID"), {
      code: "AI_OUTPUT_INVALID",
      details: { issues: [{ path: "weeks.0.options", message: "Expected exactly 3 options" }] }
    });
    const runTask = vi.fn().mockRejectedValue(invalid);

    await expect(generateWeekSuggestions(
      { weekNumbers: [1], levels: ["A1", "A2", "B1", "B2"], usedTopics: [] },
      { prompt: "Suggest workplace topics." },
      { runTask } as unknown as AiTaskRunner
    )).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });

    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("retries duplicate/used topics and remains stable across repeated generations", async () => {
    const duplicate = {
      weeks: [{
        ...validOutput.weeks[0],
        options: [option("Existing topic"), option("Fresh topic"), option("Fresh topic")]
      }]
    };
    const runTask = vi.fn()
      .mockResolvedValueOnce({ output: duplicate, metadata })
      .mockResolvedValueOnce({ output: validOutput, metadata })
      .mockResolvedValueOnce({ output: validOutput, metadata });
    const runner = { runTask } as unknown as AiTaskRunner;

    const first = await generateWeekSuggestions(
      { weekNumbers: [1], levels: ["A1", "A2", "B1", "B2"], usedTopics: ["Existing topic"] },
      { prompt: "Suggest workplace topics." }, runner
    );
    const second = await generateWeekSuggestions(
      { weekNumbers: [1], levels: ["A1", "A2", "B1", "B2"], usedTopics: [] },
      { prompt: "Suggest workplace topics." }, runner
    );

    expect(first.output.weeks[0]?.options).toHaveLength(3);
    expect(second.output.weeks[0]?.options).toHaveLength(3);
    expect(runTask).toHaveBeenCalledTimes(3);
  });

  it("rejects semantically near-duplicate topics from lesson history", async () => {
    const nearDuplicate = {
      weeks: [{
        ...validOutput.weeks[0],
        options: [option("Giving project updates"), option("Meeting changes"), option("Customer feedback")]
      }]
    };
    const repaired = {
      weeks: [{
        ...validOutput.weeks[0],
        options: [option("Handling supplier delays"), option("Meeting changes"), option("Customer feedback")]
      }]
    };
    const runTask = vi.fn()
      .mockResolvedValueOnce({ output: nearDuplicate, metadata })
      .mockResolvedValueOnce({ output: repaired, metadata });

    const generated = await generateWeekSuggestions(
      { weekNumbers: [1], levels: ["A1", "A2", "B1", "B2"], usedTopics: ["Project updates"] },
      { prompt: "Suggest workplace topics." },
      { runTask } as unknown as AiTaskRunner
    );

    expect(generated.output).toEqual(repaired);
    expect(runTask).toHaveBeenCalledTimes(2);
    expect(runTask.mock.calls[1]?.[2]?.systemPrompt).toContain("near-duplicate");
    expect(runTask.mock.calls[1]?.[2]?.systemPrompt).toContain("Project updates");
  });

  it("rejects near-duplicate options across requested weeks", async () => {
    const twoWeeks = {
      weeks: [
        validOutput.weeks[0],
        {
          weekNumber: 2,
          levels: validOutput.weeks[0]!.levels,
          options: [option("Giving project updates"), option("Supplier delays"), option("Writing incident reports")]
        }
      ]
    };
    const runTask = vi.fn().mockResolvedValue({ output: twoWeeks, metadata });

    await expect(generateWeekSuggestions(
      { weekNumbers: [1, 2], levels: ["A1", "A2", "B1", "B2"], usedTopics: [] },
      { prompt: "Suggest workplace topics." },
      { runTask } as unknown as AiTaskRunner
    )).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });

    expect(runTask).toHaveBeenCalledTimes(2);
  });
});
