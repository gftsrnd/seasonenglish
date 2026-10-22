import { describe, expect, it } from "vitest";
import {
  vocabularyOutputJsonSchema,
  vocabularyOutputSchema,
  weekSuggestionsOutputSchema
} from "../src/schemas.js";

const option = {
  topic: "Meetings",
  description: "Lịch họp và cập nhật tiến độ.",
  objectives: "Xác nhận lịch và báo cáo ngắn.",
  keyVocabHint: "agenda, deadline",
  plan: { A2: ["Warm-up", "Vocabulary", "Listening", "Roleplay", "Review"] }
};

describe("operator AI parity schemas", () => {
  it("requires three options and an active CEFR × Monday-Friday plan", () => {
    const parsed = weekSuggestionsOutputSchema.safeParse({
      weeks: [{ weekNumber: 1, levels: ["A2"], options: [option, option, option] }]
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.weeks[0]?.options[0]?.plan.A2).toHaveLength(5);
  });

  it("rejects the legacy topic-only response instead of silently rendering empty plans", () => {
    const parsed = weekSuggestionsOutputSchema.safeParse({
      weeks: [{ weekNumber: 1, options: [{ ...option, plan: undefined }, { ...option, plan: undefined }, { ...option, plan: undefined }] }]
    });
    expect(parsed.success).toBe(false);
  });

  it("keeps week topics as concise learning titles instead of long descriptions", () => {
    const concise = weekSuggestionsOutputSchema.safeParse({
      weeks: [{ weekNumber: 1, levels: ["A2"], options: [{ ...option, topic: "Introducing yourself & your job" }, { ...option, topic: "Introducing yourself & your job" }, { ...option, topic: "Introducing yourself & your job" }] }]
    });
    const long = weekSuggestionsOutputSchema.safeParse({
      weeks: [{ weekNumber: 1, levels: ["A2"], options: [{ ...option, topic: "Introducing yourself and your job at work" }, { ...option, topic: "Introducing yourself and your job at work" }, { ...option, topic: "Introducing yourself and your job at work" }] }]
    });
    expect(concise.success).toBe(true);
    expect(long.success).toBe(false);
  });
});

const vocabularyWord = {
  id: "word-1",
  english: "notebook",
  vietnamese: "sổ tay",
  definition: "A small book for writing notes.",
  partOfSpeech: "noun" as const
};

const vocabularyOutput = (firstWord: Record<string, unknown>) => ({
  topic: "Office supplies",
  words: Array.from({ length: 15 }, (_, index) => index === 0
    ? { ...vocabularyWord, ...firstWord }
    : { ...vocabularyWord, id: `word-${index + 1}`, english: `notebook ${index + 1}` })
});

describe("vocabulary media schema", () => {
  it("accepts a curated image query and publishes it in the provider JSON schema", () => {
    const parsed = vocabularyOutputSchema.safeParse(vocabularyOutput({ imageQuery: "paper notebook on desk" }));

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.words[0]?.imageQuery).toBe("paper notebook on desk");
    expect(vocabularyOutputJsonSchema.properties.words.items.properties).toHaveProperty("imageQuery");
    expect(vocabularyOutputJsonSchema.properties.words.items.properties).not.toHaveProperty("imageUrl");
  });

  it("rejects an AI-generated image URL", () => {
    const parsed = vocabularyOutputSchema.safeParse(vocabularyOutput({ imageUrl: "https://images.example/notebook.jpg" }));

    expect(parsed.success).toBe(false);
  });

  it("keeps image guidance optional", () => {
    expect(vocabularyOutputSchema.safeParse(vocabularyOutput({})).success).toBe(true);
  });
});
