import { describe, expect, it } from "vitest";
import { AI_TASKS, vocabularyExamplesInputSchema, vocabularyOutputJsonSchema, vocabularyOutputSchema } from "../src/index.js";

const word = (id: string, extra: Record<string, unknown> = {}) => ({
  id, english: id, vietnamese: `nghĩa ${id}`, definition: `definition ${id}`, partOfSpeech: "noun", ...extra
});

describe("Word sort context sentences in vocabulary AI tasks", () => {
  it("asks the custom-topic generation for one example per target word, not per distractor", () => {
    const target = vocabularyOutputJsonSchema.properties.words.items;
    const distractor = vocabularyOutputJsonSchema.properties.distractors.items;
    expect(target.required).toContain("example");
    expect(target.properties.example.description).toMatch(/partOfSpeech/);
    expect(distractor.required).not.toContain("example");
  });

  it("accepts generated sets with or without examples (the API validates each sentence)", () => {
    const words = Array.from({ length: 12 }, (_, index) => word(`w${index}`, { example: `I see the w${index} today.` }));
    const distractors = Array.from({ length: 8 }, (_, index) => word(`d${index}`));
    expect(vocabularyOutputSchema.safeParse({ topic: "office", words, distractors }).success).toBe(true);
    expect(vocabularyOutputSchema.safeParse({ topic: "office", words: Array.from({ length: 12 }, (_, index) => word(`w${index}`)), distractors }).success).toBe(true);
  });

  it("registers one batched backfill task for a stored set", () => {
    const task = AI_TASKS.get("vocabulary_examples");
    expect(task.promptKey).toBe("vocabulary_generation");
    expect(vocabularyExamplesInputSchema.safeParse({ cefr: "A1", words: [{ id: "w1", english: "change", partOfSpeech: "noun", vietnamese: "sự thay đổi" }] }).success).toBe(true);
    expect(vocabularyExamplesInputSchema.safeParse({ cefr: "A1", words: [] }).success).toBe(false);
    expect(task.outputSchema.safeParse({ examples: [{ id: "w1", example: "We need a change." }] }).success).toBe(true);
    expect(task.outputSchema.safeParse({ examples: [{ id: "w1" }] }).success).toBe(false);
  });
});
