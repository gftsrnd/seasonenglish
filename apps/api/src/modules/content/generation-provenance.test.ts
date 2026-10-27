import { describe, expect, it } from "vitest";
import { buildGenerationProvenance } from "./generation-provenance.js";

describe("AI lesson generation provenance", () => {
  it("A-006 records the exact prompt version, generation input, validated output, and timestamp", () => {
    const provenance = buildGenerationProvenance({
      promptVersionId: "prompt-version-7",
      prompt: "Generate measurable objectives.",
      week: {
        weekNumber: 3,
        topic: "Handling customer requests",
        description: "Respond professionally.",
        objectives: "Ask for clarification.",
        keyVocabHint: "request, clarify",
        plan: { A2: ["Could you clarify?", "two", "three", "four", "five"] }
      },
      cefr: "A2",
      output: { lessons: [{ dayNumber: 1, title: "Could you clarify?" }], failures: [] },
      validation: { valid: true, issues: [] },
      generatedAt: new Date("2026-10-27T09:00:00.000Z")
    });

    expect(provenance).toEqual({
      schemaVersion: 1,
      generatedAt: "2026-10-27T09:00:00.000Z",
      prompt: {
        versionId: "prompt-version-7",
        content: "Generate measurable objectives."
      },
      input: {
        weekNumber: 3,
        topic: "Handling customer requests",
        description: "Respond professionally.",
        objectives: "Ask for clarification.",
        keyVocabHint: "request, clarify",
        plan: { A2: ["Could you clarify?", "two", "three", "four", "five"] },
        cefr: "A2"
      },
      output: { lessons: [{ dayNumber: 1, title: "Could you clarify?" }], failures: [] },
      validation: { valid: true, issues: [] }
    });
  });
});
