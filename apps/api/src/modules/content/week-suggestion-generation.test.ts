import { describe, expect, it, vi } from "vitest";
import type { AiTaskRunner } from "@e4s/ai";
import { generateWeekSuggestions } from "./week-suggestion-generation.js";

vi.mock("@e4s/ai", async () => await import("../../../../../packages/ai/src/index.js"));

const metadata = {
  traceId: "trace-week", taskId: "week_suggestions", provider: "fixture", model: "fixture",
  attempts: 1, latencyMs: 1, inputHash: "hash", schemaValid: true as const, usage: {}
};

function option(topic: string) {
  return {
    topic,
    description: `${topic} at work`,
    objectives: `Use English for ${topic}`,
    keyVocabHint: "update, deadline, blocker",
    plan: {
      A1: ["one", "two", "three", "four", "five"],
      A2: ["one", "two", "three", "four", "five"],
      B1: ["one", "two", "three", "four", "five"],
      B2: ["one", "two", "three", "four", "five"]
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
