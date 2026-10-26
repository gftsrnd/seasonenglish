import { describe, expect, it, vi } from "vitest";
import type { ContentWeekInput } from "@e4s/contracts";
import type { AiTaskRunner } from "@e4s/ai";
import { generateWeeklyLessons } from "./weekly-generation.js";

vi.mock("@e4s/ai", async () => await import("../../../../../packages/ai/src/index.js"));

const metadata = {
  traceId: "trace-1", taskId: "component", provider: "anthropic", model: "claude-haiku-5-5",
  attempts: 1, latencyMs: 10, inputHash: "hash", schemaValid: true,
  usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 }
};

const foundation = {
  title: "I give + feedback",
  durationMinutes: 10,
  objective: { title: "Mục tiêu", explanationLanguage: "vi", items: [
    { type: "content", text: "SWBAT identify two feedback details after listening.", condition: "after listening", criterion: "two details", assessmentCode: "listening" },
    { type: "language", text: "SWBAT give one clear feedback sentence in a role-play.", condition: "in a role-play", criterion: "one complete sentence", assessmentCode: "speaking" }
  ] },
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
const grammarClassification = {
  status: "classified", contentType: "sentence_pattern", targetName: "S + V + O", scope: "Giving clear feedback",
  support: "explicit", confidence: "high", evidence: [{ sourceRef: "lessonFocus", quote: "give clear feedback" }], rejectedCandidates: []
};

const vocabularyItem = (word: string) => ({
  word, partOfSpeech: word === "feedback" ? "noun" : "adjective",
  pronunciation: `/${word}/`, stress: "first syllable", ttsText: word, ssml: `<speak>${word}</speak>`,
  meaning: `nghĩa của ${word}`, imageQuery: `${word} workplace photo`,
  collocation1: `${word} clearly`, collocation2: `${word} at work`, collocation3: `use ${word}`,
  family1: { word: `${word}ly`, type: "adverb", meaning: `họ từ của ${word}` }, family2: null,
  umbrellaWord: "work communication", umbrellaMeaning: "giao tiếp công việc",
  sibling1: { word: "email", meaning: "thư điện tử" }, sibling2: null, sibling3: null,
  synonym1: { word: `${word}-similar`, level: "A2", note: "nghĩa gần", partOfSpeech: word === "feedback" ? "noun" : "adjective", sense: `same sense as ${word}`, example: `Use ${word}-similar here.` }, synonym2: null, antonym1: null
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
  option3: "A meeting", option4: "A phone", answer: "Clear feedback", hint: "Think about helpful workplace communication.",
  questionTranslation: "Lan đưa ra điều gì?", answerTranslation: "Phản hồi rõ ràng"
});

const skills = {
  listening: choice("Nghe", "Lan gives clear feedback to her teammate after the meeting today."),
  reading: choice("Đọc", "Lan gives clear feedback after the meeting. Her teammate thanks her and improves the report."),
  writing: { title: "Viết", type: "fill", prompt: "I ___ clear feedback.", option1: null, option2: null, option3: null, option4: null, answer: "give", hint: "Use a common action verb.", questionTranslation: "Tôi đưa ra phản hồi rõ ràng.", answerTranslation: "đưa ra" },
  wordClass: { ...choice("Từ loại", ""), body: undefined },
  wordUse: { ...choice("Dùng từ", ""), body: undefined },
  speaking: { title: "Nói", prompt: "Nói một câu góp ý bằng tiếng Anh.", answer: "I give clear feedback.", hint: "Bắt đầu bằng chủ ngữ I.", questionTranslation: "Nói một câu góp ý bằng tiếng Anh.", answerTranslation: "Tôi đưa ra phản hồi rõ ràng." }
};

describe("weekly lesson generation orchestration", () => {
  it("generates the five independent vocabulary drafts concurrently", async () => {
    let activeVocabularyCalls = 0;
    let maxActiveVocabularyCalls = 0;
    const runTask = vi.fn(async (
      taskId: string,
      input: unknown,
      _options?: { systemPrompt?: string; maxOutputTokens?: number }
    ) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") {
        activeVocabularyCalls += 1;
        maxActiveVocabularyCalls = Math.max(maxActiveVocabularyCalls, activeVocabularyCalls);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeVocabularyCalls -= 1;
        return { output: vocabularyForDay(dayNumber), metadata };
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

    expect(generated.lessons).toHaveLength(5);
    expect(maxActiveVocabularyCalls).toBe(5);
  });

  it("decomposes one level into three small strict calls per day and merges all learner sections", async () => {
    const runTask = vi.fn(async (
      taskId: string,
      _input: unknown,
      _options?: { systemPrompt?: string; maxOutputTokens?: number }
    ) => {
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
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

    expect(runTask).toHaveBeenCalledTimes(20);
    expect(runTask.mock.calls.map((call) => call[0])).toEqual([
      ...Array(5).fill("weekly_lesson_grammar_classifier"),
      ...Array(5).fill("weekly_lesson_foundation"),
      ...Array(5).fill("weekly_lesson_vocabulary"),
      ...Array(5).fill("weekly_lesson_skills")
    ]);
    expect(runTask.mock.calls.slice(0, 5).every((call) => call[2]?.maxOutputTokens === 1_000)).toBe(true);
    expect(runTask.mock.calls.slice(0, 5).every((call) => call[2]?.systemPrompt?.includes("incidental"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.maxOutputTokens === 1_500)).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("objective.items must contain 2-4 measurable objectives"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("For B2 objectives, use only"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("grammar.usage must be exactly one short Vietnamese sentence"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("title must name the concrete sentence frame"))).toBe(true);
    expect(runTask.mock.calls.slice(10, 15).every((call) => call[2]?.maxOutputTokens === 2_500)).toBe(true);
    expect(runTask.mock.calls.slice(15, 20).every((call) => call[2]?.maxOutputTokens === 2_000)).toBe(true);
    expect(runTask.mock.calls.slice(15, 20).every((call) => call[2]?.systemPrompt?.includes("Speaking prompt must be one short Vietnamese instruction"))).toBe(true);
    expect(runTask.mock.calls.slice(15, 20).every((call) => call[2]?.systemPrompt?.includes("one easy English model sentence of no more than 10 words"))).toBe(true);
    expect(runTask.mock.calls.slice(15, 20).every((call) => call[2]?.systemPrompt?.includes("questionTranslation and answerTranslation"))).toBe(true);
    expect(runTask.mock.calls.slice(10, 15).every((call) => call[2]?.systemPrompt?.includes("partOfSpeech"))).toBe(true);
    expect(runTask.mock.calls.slice(10, 15).every((call) => call[2]?.systemPrompt?.includes("no icons, logos, diagrams, screenshots, charts, or text-heavy images"))).toBe(true);
    expect(runTask.mock.calls.slice(10, 15).every((call) =>
      (call[1] as { excludedVocabulary: string[] }).excludedVocabulary.length === 0
    )).toBe(true);
    expect(generated.lessons).toHaveLength(5);
    expect(generated.lessons.every((lesson) => lesson.title === "I give + feedback")).toBe(true);
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
    expect(generated.lessons[0]?.parts.find((part) => part.code === "listening")?.content).toMatchObject({
      hint: "Think about helpful workplace communication.",
      questionTranslation: "Lan đưa ra điều gì?",
      answerTranslation: "Phản hồi rõ ràng"
    });
    expect(generated.result.metadata.usage).toEqual({ inputTokens: 2_000, outputTokens: 4_000, totalTokens: 6_000 });
  });

  it("marks grammar unavailable when the classifier abstains instead of fabricating a sentence frame", async () => {
    const insufficientEvidence = {
      status: "insufficient_evidence", contentType: null, targetName: null, scope: null,
      support: "none", confidence: "low", evidence: [], rejectedCandidates: []
    };
    const noSuitableContent = {
      status: "no_suitable_content", contentType: null, targetName: null, scope: null,
      support: "none", confidence: "high", evidence: [], rejectedCandidates: []
    };
    const runTask = vi.fn(async (
      taskId: string,
      input: unknown,
      _options?: { systemPrompt?: string; maxOutputTokens?: number }
    ) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") {
        return { output: dayNumber === 1 ? insufficientEvidence : dayNumber === 5 ? noSuitableContent : grammarClassification, metadata };
      }
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const runner = { runTask } as unknown as AiTaskRunner;
    const week = {
      weekNumber: 2,
      topic: "Scheduling meetings",
      description: "Arrange and reschedule workplace meetings",
      objectives: "Use useful meeting phrases",
      keyVocabHint: "available, calendar, reschedule",
      plan: { A1: ["meeting vocabulary", "Are you free on Monday?", "Can we meet at 10?", "Let me check my calendar.", "review vocabulary"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(week, "A1", { prompt: "Generate lessons." }, runner);

    expect(generated.lessons).toHaveLength(5);
    const foundationCalls = runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_foundation");
    expect((foundationCalls[0]?.[1] as { grammarClassification: { status: string } }).grammarClassification.status).toBe("insufficient_evidence");
    expect((foundationCalls[4]?.[1] as { grammarClassification: { status: string } }).grammarClassification.status).toBe("no_suitable_content");
    expect(foundationCalls.every((call) => call[2]?.systemPrompt?.includes("do not invent a grammar target"))).toBe(true);
    expect(generated.lessons[0]?.title).toBe("meeting vocabulary");
    expect(generated.lessons[0]?.parts.find((part) => part.code === "grammar")?.content).toEqual({
      status: "unavailable", hidden: true, reason: "insufficient_evidence"
    });
    expect(generated.lessons[4]?.parts.find((part) => part.code === "grammar")?.content).toEqual({
      status: "unavailable", hidden: true, reason: "no_suitable_content"
    });
  });

  it("does not require or invent grammar fields after the classifier abstains", async () => {
    const noSuitableContent = {
      status: "no_suitable_content", contentType: null, targetName: null, scope: null,
      support: "none", confidence: "high", evidence: [], rejectedCandidates: []
    };
    const grammarFreeFoundation = {
      ...foundation,
      title: null,
      grammar: null,
      objective: {
        ...foundation.objective,
        explanationLanguage: "en",
        items: [
          { ...foundation.objective.items[0]!, text: "SWBAT compare two meeting details when listening." },
          { ...foundation.objective.items[1]!, text: "SWBAT propose one meeting time when speaking." }
        ]
      }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: noSuitableContent, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: grammarFreeFoundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") {
        expect(input).toMatchObject({ grammarFormula: null, grammarExamples: null });
        return { output: vocabularyForDay(dayNumber), metadata };
      }
      if (taskId === "weekly_lesson_skills") {
        expect(input).toMatchObject({ grammarFormula: null, grammarExamples: null });
        return { output: skills, metadata };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 2,
      topic: "Scheduling meetings",
      description: "Arrange and reschedule workplace meetings",
      objectives: "Propose times and confirm next steps",
      keyVocabHint: "available, calendar, reschedule",
      plan: {
        B2: [
          "Proposing a meeting time politely",
          "Checking availability across time zones",
          "Rescheduling and explaining a conflict",
          "Confirming decisions and next steps",
          "Following up with a calendar invitation"
        ]
      }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(
      week, "B2", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner
    );

    expect(generated.lessons).toHaveLength(5);
    expect(generated.lessons.map((lesson) => lesson.title)).toEqual(week.plan!.B2);
    expect(generated.lessons.every((lesson) => {
      const grammar = lesson.parts.find((part) => part.code === "grammar");
      return grammar?.content.status === "unavailable" && grammar.content.reason === "no_suitable_content";
    })).toBe(true);
  });

  it("repairs an unobservable B2 objective with the exact verb bank from the prompt", async () => {
    const noSuitableContent = {
      status: "no_suitable_content", contentType: null, targetName: null, scope: null,
      support: "none", confidence: "high", evidence: [], rejectedCandidates: []
    };
    const b2Foundation = {
      ...foundation,
      title: null,
      grammar: null,
      objective: {
        ...foundation.objective,
        explanationLanguage: "en",
        items: [
          { ...foundation.objective.items[0]!, text: "SWBAT understand one calendar invitation after the meeting." },
          { ...foundation.objective.items[1]!, text: "SWBAT compare two meeting details when listening." }
        ]
      }
    };
    const repaired = {
      ...b2Foundation,
      objective: {
        ...b2Foundation.objective,
        items: [
          { ...b2Foundation.objective.items[0]!, text: "SWBAT propose one follow-up action after the meeting." },
          b2Foundation.objective.items[1]!
        ]
      }
    };
    let foundationAttempts = 0;
    const runTask = vi.fn(async (
      taskId: string,
      input: unknown,
      _options?: { systemPrompt?: string; maxOutputTokens?: number }
    ) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: noSuitableContent, metadata };
      if (taskId === "weekly_lesson_foundation") {
        foundationAttempts += 1;
        return { output: foundationAttempts === 1 ? b2Foundation : repaired, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 2,
      topic: "Scheduling meetings",
      description: "Arrange and reschedule workplace meetings",
      objectives: "Propose times and confirm next steps",
      keyVocabHint: "available, calendar, reschedule",
      plan: { B2: ["one", "two", "three", "four", "Following up with a calendar invitation"] }
    } as ContentWeekInput;

    await generateWeeklyLessons(
      week, "B2", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner, { dayNumbers: [5] }
    );

    expect(foundationAttempts).toBe(2);
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_foundation" && call[2]?.systemPrompt?.includes("REPAIR REQUIRED"))?.[2]?.systemPrompt)
      .toContain("justify, negotiate, handle, propose");
  });

  it("retries a vocabulary component rejected by the AI service without failing the lesson set", async () => {
    let vocabularyAttempts = 0;
    const runTask = vi.fn(async (
      taskId: string,
      input: unknown,
      _options?: { systemPrompt?: string; maxOutputTokens?: number }
    ) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") {
        vocabularyAttempts += 1;
        if (vocabularyAttempts === 1) {
          throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
            code: "AI_OUTPUT_INVALID",
            details: { issues: [{ path: "word3.synonym1.partOfSpeech", message: "synonym must have the same part of speech" }] }
          });
        }
        return { output: vocabularyForDay(dayNumber), metadata };
      }
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 2, topic: "Scheduling meetings", description: "Arrange meetings",
      objectives: "Propose a time", keyVocabHint: "available, calendar",
      plan: { A1: ["one", "two", "three", "four", "five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(
      week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner, { dayNumbers: [1] }
    );

    expect(generated.lessons).toHaveLength(1);
    expect(vocabularyAttempts).toBe(2);
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_vocabulary" && call[2]?.systemPrompt?.includes("REPAIR REQUIRED"))?.[2]?.systemPrompt)
      .toContain("synonym must have the same part of speech");
  });

  it("normalizes the prompt-approved B1+ objective opener into the internal SWBAT format", async () => {
    const noSuitableContent = {
      status: "no_suitable_content", contentType: null, targetName: null, scope: null,
      support: "none", confidence: "high", evidence: [], rejectedCandidates: []
    };
    const promptCompliantFoundation = {
      ...foundation,
      title: null,
      grammar: null,
      objective: {
        ...foundation.objective,
        explanationLanguage: "en",
        items: [
          {
            ...foundation.objective.items[0]!,
            text: "By the end of this lesson, you will be able to propose one meeting time after checking both calendars."
          },
          {
            ...foundation.objective.items[1]!,
            text: "By the end of this lesson, you will be able to confirm one next step in the follow-up conversation."
          }
        ]
      }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: noSuitableContent, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: promptCompliantFoundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 2, topic: "Scheduling meetings", description: "Arrange meetings",
      objectives: "Propose a time", keyVocabHint: "available, calendar",
      plan: { B2: ["one", "two", "three", "four", "five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(
      week, "B2", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner, { dayNumbers: [1] }
    );

    const objective = generated.lessons[0]!.parts.find((part) => part.code === "objective");
    expect(objective?.content.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "SWBAT propose one meeting time after checking both calendars." }),
      expect.objectContaining({ text: "SWBAT confirm one next step in the follow-up conversation." })
    ]));
  });

  it("retries duplicate vocabulary for different days in parallel", async () => {
    const attempts = new Map<number, number>();
    let runningRetries = 0;
    let maxRunningRetries = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      if (taskId === "weekly_lesson_vocabulary") {
        const attempt = (attempts.get(dayNumber) ?? 0) + 1;
        attempts.set(dayNumber, attempt);
        if (attempt === 1) return { output: vocabularyForDay(1), metadata };
        runningRetries += 1;
        maxRunningRetries = Math.max(maxRunningRetries, runningRetries);
        await Promise.resolve();
        runningRetries -= 1;
        return { output: vocabularyForDay(dayNumber), metadata };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 1, topic: "Giving project updates", description: "Report progress",
      objectives: "Report progress and risks", keyVocabHint: "status, blocker, deadline",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    await generateWeeklyLessons(week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner);

    expect(maxRunningRetries).toBe(4);
    expect([...attempts.values()]).toEqual([1, 2, 2, 2, 2]);
  });

  it("generates only the requested missing days during enrichment", async () => {
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 1, topic: "Giving project updates", description: "Report progress",
      objectives: "Report progress and risks", keyVocabHint: "status, blocker, deadline",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(
      week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner, { dayNumbers: [2, 4] }
    );

    expect(generated.lessons.map((lesson) => lesson.dayNumber)).toEqual([2, 4]);
    expect(runTask).toHaveBeenCalledTimes(8);
    expect(new Set(runTask.mock.calls.map((call) => (call[1] as { dayNumber: number }).dayNumber))).toEqual(new Set([2, 4]));
  });

  it("retries invalid objectives instead of semantically patching forbidden verbs", async () => {
    const foundationWithUnobservableVerbs = {
      ...foundation,
      objective: {
        ...foundation.objective,
        explanationLanguage: "en",
        items: [
          { ...foundation.objective.items[0]!, type: "language", text: "SWBAT understand two feedback details after listening.", assessmentCode: "reading" },
          { ...foundation.objective.items[1]!, type: "language", text: "SWBAT communicate one feedback sentence in a role-play.", assessmentCode: "writing" }
        ]
      }
    };
    const attempts = new Map<number, number>();
    const runTask = vi.fn(async (
      taskId: string,
      input: unknown,
      _options?: { systemPrompt?: string; maxOutputTokens?: number }
    ) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        const attempt = (attempts.get(dayNumber) ?? 0) + 1;
        attempts.set(dayNumber, attempt);
        return { output: attempt === 1 ? foundationWithUnobservableVerbs : foundation, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 1,
      topic: "Giving project updates",
      description: "Report progress in a weekly meeting",
      objectives: "Report progress and risks",
      keyVocabHint: "on track, blocker, next steps",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner);
    const objectives = generated.lessons[0]?.parts.find((part) => part.code === "objective")?.content.items as Array<{ type: string; text: string; assessmentCode: string }>;

    expect(generated.lessons).toHaveLength(5);
    expect(objectives).toEqual([
      expect.objectContaining({ type: "content", assessmentCode: "listening", text: "SWBAT identify two feedback details after listening." }),
      expect.objectContaining({ type: "language", assessmentCode: "speaking", text: "SWBAT give one clear feedback sentence in a role-play." })
    ]);
    expect([...attempts.values()]).toEqual([2, 2, 2, 2, 2]);
    expect(runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_foundation" && call[2]?.systemPrompt?.includes("REPAIR REQUIRED"))).toHaveLength(5);
  });

  it("retries repeated SWBAT clauses instead of truncating or persisting them", async () => {
    const repeated = {
      ...foundation,
      objective: {
        ...foundation.objective,
        items: foundation.objective.items.map((item, index) => ({
          ...item,
          text: index === 0
            ? "SWBAT identify two feedback details. SWBAT use English to identify two feedback details."
            : "SWBAT say one feedback sentence. SWBAT use English to say one feedback sentence."
        }))
      }
    };
    const attempts = new Map<number, number>();
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        const attempt = (attempts.get(dayNumber) ?? 0) + 1;
        attempts.set(dayNumber, attempt);
        return { output: attempt === 1 ? repeated : foundation, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 1, topic: "Giving project updates", description: "Report progress",
      objectives: "Report progress and risks", keyVocabHint: "status, blocker, deadline",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner);
    const objective = generated.lessons[0]?.parts.find((part) => part.code === "objective")?.content as { text: string; items: Array<{ text: string }> };

    expect(objective.items.map((item) => item.text)).toEqual([
      "SWBAT identify two feedback details after listening.",
      "SWBAT give one clear feedback sentence in a role-play."
    ]);
    expect(objective.text).toBe("SWBAT identify two feedback details after listening.\nSWBAT give one clear feedback sentence in a role-play.");
    expect([...attempts.values()]).toEqual([2, 2, 2, 2, 2]);
  });

  it("retries missing instruction steps instead of silently inventing them", async () => {
    const foundationWithMissingSteps = {
      ...foundation,
      instruction: { title: "Hướng dẫn", step3: "Hoàn thành bài tập và kiểm tra đáp án." }
    };
    const attempts = new Map<number, number>();
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        const attempt = (attempts.get(dayNumber) ?? 0) + 1;
        attempts.set(dayNumber, attempt);
        return { output: attempt === 1 ? foundationWithMissingSteps : foundation, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 1,
      topic: "Giving project updates",
      description: "Report progress in a weekly meeting",
      objectives: "Report progress and risks",
      keyVocabHint: "on track, blocker, next steps",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner);
    const steps = generated.lessons[0]?.parts.find((part) => part.code === "instruction")?.content.steps;

    expect(steps).toEqual([
      "Đọc mẫu câu.",
      "Ôn từ vựng.",
      "Làm bài tập."
    ]);
    expect([...attempts.values()]).toEqual([2, 2, 2, 2, 2]);
  });
});
