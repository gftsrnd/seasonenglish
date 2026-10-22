import { describe, expect, it, vi } from "vitest";
import type { ContentWeekInput } from "@e4s/contracts";
import type { AiTaskRunner } from "../coach/index.js";
import { generateWeeklyLessons } from "./weekly-generation.js";

vi.mock("@e4s/ai", async () => await import("../../../../../packages/ai/src/index.js"));

const metadata = {
  traceId: "trace-1", taskId: "component", provider: "anthropic", model: "claude-haiku-5-5",
  attempts: 1, latencyMs: 10, inputHash: "hash", schemaValid: true,
  usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 }
};

const foundation = {
  title: "S + V + O",
  durationMinutes: 10,
  objective: { title: "Mục tiêu", text: "Nói được một câu góp ý rõ ràng." },
  instruction: { title: "Hướng dẫn", step1: "Đọc mẫu câu.", step2: "Ôn từ vựng.", step3: "Làm bài tập." },
  grammar: {
    title: "Ngữ pháp", formula: "S + V + O", usage: "Dùng để đưa ra góp ý trong công việc.",
    example1: "I give clear feedback.", example2: "I give helpful feedback."
  },
  pronunciation: {
    title: "Phát âm", focus: "/f/", tip: "Chạm răng trên vào môi dưới.",
    word1: { word: "feedback", ipa: "/ˈfiːdbæk/" },
    word2: { word: "fine", ipa: "/faɪn/" },
    word3: { word: "helpful", ipa: "/ˈhelpfəl/" }
  }
};

const vocabularyItem = (word: string) => ({
  word, partOfSpeech: word === "feedback" ? "noun" : "adjective",
  pronunciation: `/${word}/`, meaning: `nghĩa của ${word}`, imageQuery: `${word} workplace photo`,
  collocation1: `${word} clearly`, collocation2: `${word} at work`, collocation3: `use ${word}`,
  family1: { word: `${word}ly`, type: "adverb", meaning: `họ từ của ${word}` }, family2: null,
  umbrellaWord: "work communication", umbrellaMeaning: "giao tiếp công việc",
  sibling1: { word: "email", meaning: "thư điện tử" }, sibling2: null, sibling3: null,
  synonym1: { word: `${word}-similar`, level: "A2", note: "nghĩa gần" }, synonym2: null, antonym1: null
});

const vocabulary = {
  title: "Từ vựng",
  word1: vocabularyItem("feedback"),
  word2: vocabularyItem("clear"),
  word3: vocabularyItem("helpful")
};

function vocabularyForDay(dayNumber: number) {
  if (dayNumber === 1) return vocabulary;
  return {
    ...vocabulary,
    word1: vocabularyItem(`feedback-${dayNumber}`),
    word2: vocabularyItem(`clear-${dayNumber}`),
    word3: vocabularyItem(`helpful-${dayNumber}`)
  };
}

const choice = (title: string, body: string) => ({
  title, body, prompt: "What does Lan give?", option1: "Clear feedback", option2: "A file",
  option3: "A meeting", option4: "A phone", answer: "Clear feedback"
});

const skills = {
  listening: choice("Nghe", "Lan gives clear feedback to her teammate after the meeting today."),
  reading: choice("Đọc", "Lan gives clear feedback after the meeting. Her teammate thanks her and improves the report."),
  writing: { title: "Viết", type: "fill", prompt: "I ___ clear feedback.", option1: null, option2: null, option3: null, option4: null, answer: "give" },
  wordClass: { ...choice("Từ loại", ""), body: undefined },
  wordUse: { ...choice("Dùng từ", ""), body: undefined },
  speaking: { title: "Nói", prompt: "Nói một câu góp ý bằng tiếng Anh.", answer: "I give clear feedback." }
};

describe("weekly lesson generation orchestration", () => {
  it("decomposes one level into three small strict calls per day and merges all learner sections", async () => {
    const runTask = vi.fn(async (
      taskId: string,
      _input: unknown,
      _options?: { systemPrompt?: string; maxOutputTokens?: number }
    ) => {
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") {
        return { output: vocabularyForDay((_input as { dayNumber: number }).dayNumber), metadata };
      }
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const runner = { runTask } as unknown as AiTaskRunner;
    const week = {
      weekNumber: 1,
      topic: "Giving feedback",
      description: "Workplace feedback",
      objectives: "Give clear feedback",
      keyVocabHint: "feedback, improve",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(week, "A1", { prompt: "Generate lessons." }, runner);

    expect(runTask).toHaveBeenCalledTimes(15);
    expect(runTask.mock.calls.map((call) => call[0])).toEqual([
      ...Array(5).fill("weekly_lesson_foundation"),
      ...Array(5).fill("weekly_lesson_vocabulary"),
      ...Array(5).fill("weekly_lesson_skills")
    ]);
    expect(runTask.mock.calls.slice(0, 5).every((call) => call[2]?.maxOutputTokens === 1_500)).toBe(true);
    expect(runTask.mock.calls.slice(0, 5).every((call) => call[2]?.systemPrompt?.includes("objective.text must be one focused Vietnamese sentence of at most 12 words"))).toBe(true);
    expect(runTask.mock.calls.slice(0, 5).every((call) => call[2]?.systemPrompt?.includes("grammar.usage must be exactly one short Vietnamese sentence"))).toBe(true);
    expect(runTask.mock.calls.slice(0, 5).every((call) => call[2]?.systemPrompt?.includes("title must name the concrete sentence frame"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.maxOutputTokens === 2_500)).toBe(true);
    expect(runTask.mock.calls.slice(10, 15).every((call) => call[2]?.maxOutputTokens === 2_000)).toBe(true);
    expect(runTask.mock.calls.slice(10, 15).every((call) => call[2]?.systemPrompt?.includes("Speaking prompt must be one short Vietnamese instruction"))).toBe(true);
    expect(runTask.mock.calls.slice(10, 15).every((call) => call[2]?.systemPrompt?.includes("one easy English model sentence of no more than 10 words"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("partOfSpeech"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("no icons, logos, diagrams, screenshots, charts, or text-heavy images"))).toBe(true);
    expect((runTask.mock.calls[6]?.[1] as { excludedVocabulary: string[] }).excludedVocabulary).toEqual(
      expect.arrayContaining(["feedback", "clear", "helpful"])
    );
    expect(generated.lessons).toHaveLength(5);
    expect(generated.lessons.every((lesson) => lesson.title === "I give clear feedback")).toBe(true);
    expect(generated.lessons.every((lesson) => lesson.title !== "S + V + O")).toBe(true);
    expect(generated.lessons[0]?.parts.map((part) => part.code)).toEqual([
      "objective", "instruction", "vocabulary", "grammar", "pronunciation",
      "listening", "reading", "writing", "word_class", "word_use", "speaking"
    ]);
    expect(generated.lessons[0]?.parts.find((part) => part.code === "vocabulary")?.content).toMatchObject({
      items: [
        expect.objectContaining({ word: "feedback", type: "noun" }),
        expect.objectContaining({ word: "clear", type: "adjective" }),
        expect.objectContaining({ word: "helpful", type: "adjective" })
      ]
    });
    expect(generated.result.metadata.usage).toEqual({ inputTokens: 1_500, outputTokens: 3_000, totalTokens: 4_500 });
  });
});
