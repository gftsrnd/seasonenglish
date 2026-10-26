import { AI_TASKS } from "@e4s/ai";
import { prototypePromptDefaults } from "../../../packages/database/src/prototype-prompts.js";
import { describe, expect, it } from "vitest";

describe("AI prompt and output schema contracts", () => {
  it("keeps micro grading output keys owned by the canonical task schema", () => {
    const task = AI_TASKS.get("micro_grading");

    expect(task.outputSchema.safeParse({
      correct: false,
      score: 3,
      feedback: "Use joined instead of join.",
      citedError: "join"
    }).success).toBe(true);
    expect(task.outputSchema.safeParse({
      ok: false,
      score: 3,
      feedback: "Use joined instead of join.",
      fix: "joined"
    }).success).toBe(false);
    expect(prototypePromptDefaults.mgrade).toContain("exact JSON schema supplied by the task");
    expect(prototypePromptDefaults.mgrade).not.toContain('"ok"');
    expect(prototypePromptDefaults.mgrade).not.toContain('"fix"');
  });
});
