import { describe, expect, it, vi } from "vitest";
import type { ContentLessonDraftInput, ContentWeekInput } from "@e4s/contracts";
import { createPronunciationAssetRegistry, type AiTaskRunner } from "@e4s/ai";
import { generateWeeklyLessons, lessonQualityProfileFromEnv } from "./weekly-generation.js";

vi.mock("@e4s/ai", async () => await import("../../../../../packages/ai/src/index.js"));

const metadata = {
  traceId: "trace-1", taskId: "component", provider: "anthropic", model: "claude-haiku-5-5",
  attempts: 1, latencyMs: 10, inputHash: "hash", schemaValid: true,
  usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 }
};

const foundation = {
  title: "I give + feedback",
  durationMinutes: 10,
  objective: { title: "Mục tiêu", explanationLanguage: "vi", lesson_goal: "Nhận ra và đưa ra phản hồi rõ ràng.", assessment_gap: null, items: [
    { id: "C1", type: "content", text: "Sau bài học, bạn có thể chọn hai chi tiết phản hồi đúng sau khi nghe.", action_verb: "chọn", target_language: null, condition: "sau khi nghe", criterion: "đúng 2 chi tiết", assessed_by: "listening", success_evidence: "Chọn đúng hai chi tiết", assessmentCode: "listening" },
    { id: "L1", type: "language", text: "Sau bài học, bạn có thể nói một câu có cụm \"clear feedback\" khi nhập vai.", action_verb: "nói", target_language: ["clear feedback"], condition: "khi nhập vai", criterion: "1 câu hoàn chỉnh", assessed_by: "speaking", success_evidence: "Transcript có cụm từ mục tiêu", assessmentCode: "speaking" }
  ] },
  instruction: { title: "Hướng dẫn", step1: "Đọc mẫu câu.", step2: "Ôn từ vựng.", step3: "Làm bài tập." },
  grammar: {
    title: "Ngữ pháp", contentType: "sentence_pattern", targetName: "S + V + O", scope: "Giving clear feedback",
    formula: "S + V + O", usage: "Dùng để đưa ra góp ý trong công việc.",
    example1: "I give clear feedback.", example2: "I give helpful feedback."
  },
  pronunciation: {
    title: "Phát âm", focus: "/f/", tip: "Chạm răng trên vào môi dưới.",
    word1: { word: "feedback", ipa: "/ˈfiːdbæk/" },
    word2: { word: "fine", ipa: "/faɪn/" },
    word3: { word: "helpful", ipa: "/ˈhelpfəl/" }
  }
};
const approvedSkillsReview = {
  status: "approved", findings: [],
  solvedAnswers: { listening: "Clear feedback", reading: "Clear feedback", writing: "give", wordClass: "Clear feedback", wordUse: "Clear feedback" }
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
  listening: choice("Nghe", "Lan gives clear and helpful feedback to her teammate after the weekly project meeting today."),
  reading: choice("Đọc", "Lan gives clear feedback after the weekly meeting. Her teammate thanks her, updates the customer report, and sends the improved version today."),
  writing: { title: "Viết", type: "mcq", prompt: "Which sentence gives clear feedback?", option1: "Your report is clear.", option2: "Open the window.", option3: "Call me tomorrow.", option4: "The room is upstairs.", answer: "Your report is clear.", hint: "Choose the sentence about work quality.", questionTranslation: "Câu nào đưa ra phản hồi rõ ràng?", answerTranslation: "Báo cáo của bạn rõ ràng." },
  wordClass: { ...choice("Từ loại", ""), body: undefined },
  wordUse: { ...choice("Dùng từ", ""), body: undefined },
  speaking: { title: "Nói", prompt: "Nói một câu góp ý bằng tiếng Anh.", answer: "I give clear feedback.", hint: "Bắt đầu bằng chủ ngữ I.", questionTranslation: "Nói một câu góp ý bằng tiếng Anh.", answerTranslation: "Tôi đưa ra phản hồi rõ ràng." }
};

describe("weekly lesson generation orchestration", () => {
  it("keeps baseline as the rollback profile and accepts only strict as the opt-in", () => {
    expect(lessonQualityProfileFromEnv(undefined)).toBe("baseline");
    expect(lessonQualityProfileFromEnv("strict")).toBe("strict");
    expect(lessonQualityProfileFromEnv("unexpected-value")).toBe("baseline");
  });

  it("keeps the foundation pass valid when a grammar-classifier evidence check exhausts", async () => {
    const invalidEvidence = {
      ...grammarClassification,
      evidence: [{ sourceRef: "lessonFocus", quote: "text that is not in the focus" }]
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: invalidEvidence, metadata };
      if (taskId === "weekly_lesson_foundation") {
        const classification = (input as { grammarClassification: typeof grammarClassification }).grammarClassification;
        expect(classification).toMatchObject({ status: "classified", confidence: "medium" });
        return {
          output: {
            ...foundation,
            grammar: {
              ...foundation.grammar,
              contentType: classification.contentType,
              targetName: classification.targetName,
              scope: classification.scope
            }
          },
          metadata
        };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      { weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback", objectives: "Give clear feedback", keyVocabHint: "feedback", plan: { A1: ["give clear feedback", "two", "three", "four", "five"] } } as ContentWeekInput,
      "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(generated.lessons[0]?.parts.find((part) => part.code === "grammar")?.content).toMatchObject({
      targetName: "give clear feedback"
    });
  });

  it("retries a foundation whose pronunciation words do not contain the target sound", async () => {
    const invalidPronunciation = {
      ...foundation,
      pronunciation: {
        title: "Phát âm", focus: "/p/", tip: "Bật nhẹ luồng hơi ở môi.",
        word1: { word: "cost", ipa: "/kɒst/" },
        word2: { word: "deadline", ipa: "/ˈdedlaɪn/" },
        word3: { word: "planned", ipa: "/plænd/" }
      }
    };
    let foundationAttempts = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown, options?: { systemPrompt?: string }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        foundationAttempts += 1;
        return { output: foundationAttempts === 1 ? invalidPronunciation : foundation, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      { weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback", objectives: "Give clear feedback", keyVocabHint: "feedback", plan: { A1: ["give clear feedback", "two", "three", "four", "five"] } } as ContentWeekInput,
      "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(foundationAttempts).toBe(2);
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_foundation")?.[2]?.systemPrompt)
      .toContain("word1.ipa, word2.ipa, and word3.ipa");
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_foundation")?.[2]?.systemPrompt)
      .toContain("never alter or invent an IPA spelling");
    const repairPrompt = runTask.mock.calls.find((call) => call[0] === "weekly_lesson_foundation" && call[2]?.systemPrompt?.includes("REPAIR REQUIRED"))?.[2]?.systemPrompt;
    expect(repairPrompt).toContain("pronunciation.word1.ipa");
    expect(repairPrompt).toContain("The fixed target sound is /p/");
    expect(repairPrompt).toContain("Replace only word1 and word2");
    expect(generated.lessons[0]?.parts.find((part) => part.code === "grammar")?.content).toMatchObject({
      title: "Ngữ pháp",
      contentType: "sentence_pattern",
      targetName: "S + V + O",
      scope: "Giving clear feedback",
      formula: "S + V + O",
      usage: "Dùng để đưa ra góp ý trong công việc.",
      examples: ["I give clear feedback.", "I give helpful feedback."]
    });
    expect(generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content).toMatchObject({ focus: "/f/" });
    expect(generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content).toMatchObject({
      phonemeAudioId: "phoneme-f-v1",
      phonemeAudioUrl: "/media/audio/phonemes/f.ogg"
    });
  });

  it("keeps valid foundation sections but hides pronunciation after three failed sound repairs", async () => {
    let foundationAttempts = 0;
    const invalidPronunciation = {
      ...foundation,
      pronunciation: {
        ...foundation.pronunciation,
        focus: "/p/",
        word1: { word: "cost", ipa: "/kɒst/" },
        word2: { word: "deadline", ipa: "/ˈdedlaɪn/" },
        word3: { word: "planned", ipa: "/plænd/" }
      }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        foundationAttempts += 1;
        return { output: invalidPronunciation, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      { weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback", objectives: "Give clear feedback", keyVocabHint: "feedback", plan: { A1: ["give clear feedback", "two", "three", "four", "five"] } } as ContentWeekInput,
      "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1] }
    );

    expect(foundationAttempts).toBe(3);
    expect(generated.lessons[0]?.parts.some((part) => part.code === "objective")).toBe(true);
    expect(generated.lessons[0]?.parts.some((part) => part.code === "grammar")).toBe(true);
    expect(generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content).toMatchObject({
      status: "unavailable", hidden: true, reason: "invalid_pronunciation_target"
    });
  });

  it("adds a stable phoneme-only audio reference and separate word audio URLs", async () => {
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const pronunciationAssetRegistry = createPronunciationAssetRegistry([
      { kind: "phoneme", key: "f", id: "phoneme-f", url: "/media/audio/phonemes/f.wav" },
      { kind: "word", key: "feedback", id: "word-feedback", url: "/media/audio/words/feedback.mp3" },
      { kind: "word", key: "fine", id: "word-fine", url: "/media/audio/words/fine.mp3" },
      { kind: "word", key: "helpful", id: "word-helpful", url: "/media/audio/words/helpful.mp3" }
    ]);
    const generated = await generateWeeklyLessons(
      { weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback", objectives: "Give clear feedback", keyVocabHint: "feedback", plan: { A1: ["give clear feedback", "two", "three", "four", "five"] } } as ContentWeekInput,
      "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true, qualityProfile: "strict", pronunciationAssetRegistry }
    );

    const pronunciation = generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content;
    expect(pronunciation).toMatchObject({
      phonemeAudioId: "phoneme-f",
      phonemeAudioUrl: "/media/audio/phonemes/f.wav",
      wordAudioUrls: [
        "/media/audio/words/feedback.mp3",
        "/media/audio/words/fine.mp3",
        "/media/audio/words/helpful.mp3"
      ]
    });
    expect(pronunciation).not.toHaveProperty("audioUrl", "/media/audio/phonemes/f.wav");
    expect(generated.output).toHaveProperty("qualityMetrics.profile", "strict");
  });

  it("strict mode retries a known wrong IPA spelling while baseline preserves the accepted output", async () => {
    const wrongFoundation = {
      ...foundation,
      pronunciation: {
        title: "Phát âm", focus: "/d/", tip: "Chạm nhẹ đầu lưỡi.",
        word1: { word: "called", ipa: "/kɔːld/" },
        word2: { word: "slipped", ipa: "/slɪpd/" },
        word3: { word: "needed", ipa: "/ˈniːdɪd/" }
      }
    };
    const run = (qualityProfile: "baseline" | "strict") => {
      let foundationAttempts = 0;
      const runTask = vi.fn(async (taskId: string, input: unknown) => {
        const dayNumber = (input as { dayNumber: number }).dayNumber;
        if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
        if (taskId === "weekly_lesson_foundation") {
          foundationAttempts += 1;
          return { output: foundationAttempts === 1 ? wrongFoundation : foundation, metadata };
        }
        if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
        if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
        throw new Error(`UNEXPECTED_TASK:${taskId}`);
      });
      return generateWeeklyLessons(
        { weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback", objectives: "Give clear feedback", keyVocabHint: "feedback", plan: { A1: ["give clear feedback", "two", "three", "four", "five"] } } as ContentWeekInput,
        "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
        { dayNumbers: [1], qualityProfile }
      ).then((generated) => ({ generated, foundationAttempts }));
    };

    const baseline = await run("baseline");
    expect(baseline.foundationAttempts).toBe(1);
    expect(baseline.generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content).not.toHaveProperty("phonemeAudioUrl");

    const strict = await run("strict");
    expect(strict.foundationAttempts).toBe(2);
    expect(strict.generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content).toMatchObject({
      phonemeAudioId: "phoneme-f-v1",
      phonemeAudioUrl: "/media/audio/phonemes/f.ogg"
    });
    expect(strict.generated.output).toHaveProperty("qualityMetrics.componentRetryCount", 1);
  });

  it("retries an abstaining grammar classifier when the lesson focus declares a sentence frame", async () => {
    const abstained = {
      status: "no_suitable_content", contentType: null, targetName: null, scope: null,
      support: "none", confidence: "high", evidence: [], rejectedCandidates: []
    };
    let classifierAttempts = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown, options?: { systemPrompt?: string }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") {
        classifierAttempts += 1;
        return { output: classifierAttempts === 1 ? abstained : { ...grammarClassification, targetName: "The cost is + amount", scope: "The cost is + amount", evidence: [{ sourceRef: "lessonFocus", quote: "The cost is + amount" }] }, metadata };
      }
      if (taskId === "weekly_lesson_foundation") return { output: { ...foundation, grammar: { ...foundation.grammar, targetName: "The cost is + amount", scope: "The cost is + amount" } }, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    await generateWeeklyLessons(
      { weekNumber: 1, topic: "Project costs", description: "Discuss project costs", objectives: "State a project cost", keyVocabHint: "cost", plan: { A1: ["The cost is + amount", "two", "three", "four", "five"] } } as ContentWeekInput,
      "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(classifierAttempts).toBe(2);
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_grammar_classifier" && call[2]?.systemPrompt?.includes("REPAIR REQUIRED"))?.[2]?.systemPrompt)
      .toContain("every planned lesson requires one narrow grammar rule or sentence pattern");
  });

  it("retries an abstaining grammar classifier for every planned lesson focus", async () => {
    const abstained = {
      status: "no_suitable_content", contentType: null, targetName: null, scope: null,
      support: "none", confidence: "high", evidence: [], rejectedCandidates: []
    };
    let classifierAttempts = 0;
    const classifiedGreeting = {
      ...grammarClassification,
      targetName: "I am + name",
      scope: "Greetings and names",
      evidence: [{ sourceRef: "lessonFocus", quote: "Greetings and names" }]
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") {
        classifierAttempts += 1;
        return { output: classifierAttempts === 1 ? abstained : classifiedGreeting, metadata };
      }
      if (taskId === "weekly_lesson_foundation") return { output: { ...foundation, grammar: { ...foundation.grammar, targetName: "I am + name", scope: "Greetings and names" } }, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    await generateWeeklyLessons(
      { weekNumber: 1, topic: "Meeting a new colleague", description: "Introduce yourself", objectives: "Greet a colleague", keyVocabHint: "hello, name", plan: { A1: ["Greetings and names", "two", "three", "four", "five"] } } as ContentWeekInput,
      "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(classifierAttempts).toBe(2);
  });

  it("uses the declared lesson focus when the grammar classifier abstains twice", async () => {
    const abstained = {
      status: "no_suitable_content", contentType: null, targetName: null, scope: null,
      support: "none", confidence: "high", evidence: [], rejectedCandidates: []
    };
    const focus = "Can I have a copy, please?";
    const fallbackFoundation = {
      ...foundation,
      title: focus,
      grammar: {
        ...foundation.grammar,
        contentType: "sentence_pattern",
        targetName: focus,
        scope: focus
      }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: abstained, metadata };
      if (taskId === "weekly_lesson_foundation") {
        expect(input).toMatchObject({
          grammarClassification: {
            status: "classified", contentType: "sentence_pattern", targetName: focus, scope: focus,
            evidence: [{ sourceRef: "lessonFocus", quote: focus }]
          }
        });
        return { output: fallbackFoundation, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      { weekNumber: 3, topic: "Requesting a document copy", description: "Ask a colleague for a copy.", objectives: "Request one document politely.", keyVocabHint: "copy, document", plan: { A1: [focus, "two", "three", "four", "five"] } } as ContentWeekInput,
      "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(generated.lessons[0]?.parts.find((part) => part.code === "grammar")?.content).toMatchObject({
      targetName: focus, scope: focus, formula: "S + V + O", examples: ["I give clear feedback.", "I give helpful feedback."]
    });
  });

  it("rejects fabricated grammar evidence and retries with a verbatim source quote", async () => {
    const week = {
      weekNumber: 1,
      topic: "Handling customer complaints",
      description: "Use I give clear feedback in a short workplace response.",
      objectives: "Give clear feedback to a colleague.",
      keyVocabHint: "feedback, clear, helpful",
      plan: { A2: ["give clear feedback", "two", "three", "four", "five"] }
    } as ContentWeekInput;
    const a2Foundation = {
      ...foundation,
      objective: {
        ...foundation.objective,
        items: [
          { ...foundation.objective.items[0]!, text: "Sau bài học, bạn có thể mô tả hai chi tiết phản hồi sau khi nghe.", action_verb: "mô tả" },
          { ...foundation.objective.items[1]!, text: "Sau bài học, bạn có thể dùng \"I give clear feedback\" đúng một lần khi nhập vai.", action_verb: "dùng", target_language: ["I give clear feedback"] }
        ]
      }
    };
    let classifierAttempts = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown, options?: { systemPrompt?: string }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") {
        classifierAttempts += 1;
        return {
          output: {
            ...grammarClassification,
            evidence: [{
              sourceRef: classifierAttempts === 1 ? "lessonFocus" : "description",
              quote: classifierAttempts === 1 ? "fabricated grammar evidence" : "I give clear feedback"
            }]
          },
          metadata
        };
      }
      if (taskId === "weekly_lesson_foundation") return { output: a2Foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      if (taskId === "weekly_lesson_skills_reviewer") return { output: approvedSkillsReview, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    await generateWeeklyLessons(
      week,
      "A2",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(classifierAttempts).toBe(2);
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_grammar_classifier" && call[2]?.systemPrompt?.includes("REPAIR REQUIRED"))?.[2]?.systemPrompt)
      .toContain("evidence quote must appear verbatim");
  });

  it("preserves prompt-native A2 objectives and uses the semantic reviewer without exceeding three skill attempts", async () => {
    const a2Foundation = {
      ...foundation,
      objective: {
        ...foundation.objective,
        items: [
          { ...foundation.objective.items[0]!, text: "Sau bài học, bạn có thể đề nghị đồng nghiệp hỗ trợ bằng 2 câu khi nhập vai.", action_verb: "đề nghị", condition: "khi nhập vai", criterion: "2 câu rõ ràng", assessed_by: "speaking", success_evidence: "Câu trả lời có yêu cầu cụ thể", assessmentCode: "speaking" },
          { ...foundation.objective.items[1]!, text: "Sau bài học, bạn có thể dùng \"Could you please + V?\" đúng 1 lần khi nhập vai.", action_verb: "dùng", target_language: ["Could you please + V?"], condition: "khi nhập vai", criterion: "dùng đúng 1 lần", assessed_by: "speaking", success_evidence: "Transcript có đúng mẫu câu", assessmentCode: "speaking" }
        ]
      }
    };
    const ambiguousSkills = {
      ...skills,
      writing: { ...skills.writing, type: "fill", prompt: "I ___ to work every day.", option1: null, option2: null, option3: null, option4: null, answer: "go" }
    };
    let skillAttempts = 0;
    let reviewAttempts = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown, options?: { systemPrompt?: string }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return {
        output: { ...grammarClassification, evidence: [{ sourceRef: "topic", quote: "Asking for help" }] },
        metadata
      };
      if (taskId === "weekly_lesson_foundation") return { output: a2Foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") {
        skillAttempts += 1;
        if (skillAttempts === 2) {
          expect(options?.systemPrompt).toContain("writing.type");
          expect(options?.systemPrompt).toContain("I ___ to work every day.");
        }
        return { output: skillAttempts === 1 ? ambiguousSkills : skills, metadata };
      }
      if (taskId === "weekly_lesson_skills_reviewer") {
        reviewAttempts += 1;
        return {
          output: reviewAttempts === 1
            ? { ...approvedSkillsReview, status: "needs_revision", findings: [{ exerciseCode: "writing", reasonCode: "multiple_valid_answers", message: "Several travel verbs fit without context." }] }
            : approvedSkillsReview,
          metadata
        };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 1, topic: "Asking for help", description: "Ask a colleague for help",
      objectives: "Make a polite request", keyVocabHint: "please, help, send",
      plan: { A2: ["Could you please help?", "two", "three", "four", "five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(
      week, "A2", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    const objective = generated.lessons[0]!.parts.find((part) => part.code === "objective")!.content as { items: Array<Record<string, unknown>> };
    expect(objective.items[0]?.text).toBe("Sau bài học, bạn có thể đề nghị đồng nghiệp hỗ trợ bằng 2 câu khi nhập vai.");
    expect(objective.items[1]).toMatchObject({ action_verb: "dùng", target_language: ["Could you please + V?"], assessed_by: "speaking" });
    expect(skillAttempts).toBe(3);
    expect(reviewAttempts).toBe(2);
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_skills_reviewer")?.[2]?.systemPrompt)
      .toContain("sentence fragment");
  });

  it("keeps grammar when a B1 target phrase contains an otherwise unobservable word", async () => {
    const focus = "I'd appreciate it if you could send it.";
    const b1Foundation = {
      ...foundation,
      title: "I'd appreciate it if you could + verb",
      objective: {
        ...foundation.objective,
        explanationLanguage: "en",
        items: [
          { ...foundation.objective.items[0]!, text: "By the end of this lesson, you will be able to write a polite email request.", action_verb: "write" },
          { ...foundation.objective.items[1]!, text: "By the end of this lesson, you will be able to explain a polite request using \"I'd appreciate it if you could...\".", action_verb: "explain", target_language: [focus] },
          { ...foundation.objective.items[1]!, id: "L2", text: "By the end of this lesson, you will be able to write one clear follow-up request.", action_verb: "write", target_language: ["follow-up request"] }
        ]
      },
      grammar: { ...foundation.grammar, targetName: focus, scope: focus }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return {
        output: { ...grammarClassification, targetName: focus, scope: focus, evidence: [{ sourceRef: "lessonFocus", quote: focus }] }, metadata
      };
      if (taskId === "weekly_lesson_foundation") return { output: b1Foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      { weekNumber: 3, topic: "Requesting a document copy", description: "Send a document request.", objectives: "Write a polite request.", keyVocabHint: "request", plan: { B1: [focus, "two", "three", "four", "five"] } } as ContentWeekInput,
      "B1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(generated.lessons[0]?.parts.find((part) => part.code === "grammar")?.content).toMatchObject({ targetName: focus, scope: focus });
  });

  it("accepts a reviewer response whose findings explicitly say they are non-blocking", async () => {
    let skillAttempts = 0;
    let reviewAttempts = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown, _options?: { systemPrompt?: string }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") {
        skillAttempts += 1;
        return { output: skills, metadata };
      }
      if (taskId === "weekly_lesson_skills_reviewer") {
        reviewAttempts += 1;
        return {
        output: {
          ...approvedSkillsReview,
          status: "needs_revision",
          findings: [
            { exerciseCode: "writing", reasonCode: "key_mismatch", message: "The generated key matches; no blocking issue." },
            { exerciseCode: "reading", reasonCode: "hint_reveals_answer", message: "The hint is acceptable but flagged; no blocking finding." },
            { exerciseCode: "wordUse", reasonCode: "invalid_distractor", message: "Đáp án đúng theo từ vựng đã học, nên không cần thay đổi." },
            { exerciseCode: "speaking", reasonCode: "feedback_mismatch", message: "Câu mẫu đáp ứng đúng yêu cầu và bản dịch khớp." }
          ]
        },
        metadata
        };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback",
      objectives: "Give clear feedback", keyVocabHint: "feedback, clear",
      plan: { A1: ["give clear feedback", "two", "three", "four", "five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(
      week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(generated.lessons).toHaveLength(1);
    expect(skillAttempts).toBe(1);
    expect(reviewAttempts).toBe(1);
  });

  it("keeps deterministically valid exercises when the semantic reviewer is unavailable", async () => {
    let skillAttempts = 0;
    let reviewAttempts = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") {
        skillAttempts += 1;
        return { output: skills, metadata };
      }
      if (taskId === "weekly_lesson_skills_reviewer") {
        reviewAttempts += 1;
        throw Object.assign(new Error("AI_UNAVAILABLE"), { code: "AI_UNAVAILABLE" });
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      {
        weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback",
        objectives: "Give clear feedback", keyVocabHint: "feedback, clear",
        plan: { A1: ["give clear feedback", "two", "three", "four", "five"] }
      } as ContentWeekInput,
      "A1",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(generated.lessons).toHaveLength(1);
    expect(generated.lessons[0]?.parts.some((part) => part.code === "listening")).toBe(true);
    expect(skillAttempts).toBe(1);
    expect(reviewAttempts).toBe(1);
  });

  it("regenerates an overlong listening script instead of cutting it into a sentence fragment", async () => {
    let skillAttempts = 0;
    const overlongSkills = {
      ...skills,
      listening: {
        ...skills.listening,
        body: "The invoice shows one hundred units, but we ordered only eighty units, so could you check the original purchase order today?"
      }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") {
        skillAttempts += 1;
        return { output: skillAttempts === 1 ? overlongSkills : skills, metadata };
      }
      if (taskId === "weekly_lesson_skills_reviewer") return { output: approvedSkillsReview, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      {
        weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback",
        objectives: "Give clear feedback", keyVocabHint: "feedback, clear",
        plan: { A1: ["give clear feedback", "two", "three", "four", "five"] }
      } as ContentWeekInput,
      "A1",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(skillAttempts).toBe(2);
    expect(generated.lessons[0]?.parts.find((part) => part.code === "listening")?.content).toMatchObject({
      audio: skills.listening.body
    });
  });

  it("keeps the final schema-valid exercise block when only soft quality limits remain after three repairs", async () => {
    let skillAttempts = 0;
    const overlongSkills = {
      ...skills,
      listening: {
        ...skills.listening,
        body: "The invoice shows one hundred units, but we ordered only eighty units, so could you check the original purchase order today?"
      }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") {
        skillAttempts += 1;
        return { output: overlongSkills, metadata };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      {
        weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback",
        objectives: "Give clear feedback", keyVocabHint: "feedback, clear",
        plan: { A2: ["give clear feedback", "two", "three", "four", "five"] }
      } as ContentWeekInput,
      "A2",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(skillAttempts).toBe(3);
    expect(generated.failures).toEqual([]);
    expect(generated.lessons[0]?.parts.filter((part) => ["listening", "reading", "writing", "word_class", "word_use", "speaking"].includes(part.code))).toHaveLength(6);
  });

  it("keeps complete B1 passages that are longer than the beginner brevity target", async () => {
    let skillAttempts = 0;
    const b1Skills = {
      ...skills,
      listening: {
        ...skills.listening,
        body: "The client called accounts this morning because the invoice showed one hundred units, but their signed purchase order clearly showed only eighty units."
      },
      reading: {
        ...skills.reading,
        body: "Our records show eighty units on the signed purchase order, while the supplier invoice lists one hundred units. The accounts assistant checked both documents and asked the supplier to confirm the correct quantity before payment."
      }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") {
        skillAttempts += 1;
        return { output: b1Skills, metadata };
      }
      if (taskId === "weekly_lesson_skills_reviewer") return { output: approvedSkillsReview, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      {
        weekNumber: 2, topic: "Invoice discrepancies", description: "Clarify a mismatch",
        objectives: "Explain a discrepancy", keyVocabHint: "invoice, quantity",
        plan: { B1: ["describe an invoice mismatch", "two", "three", "four", "five"] }
      } as ContentWeekInput,
      "B1",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(skillAttempts).toBe(1);
    expect(generated.lessons[0]?.parts.some((part) => part.code === "reading")).toBe(true);
  });

  it("keeps a concise B1 speaking model answer longer than the beginner limit", async () => {
    const b1Skills = {
      ...skills,
      speaking: { ...skills.speaking, answer: "The remaining balance will be paid in two instalments next Friday." }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: b1Skills, metadata };
      if (taskId === "weekly_lesson_skills_reviewer") return { output: approvedSkillsReview, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      { weekNumber: 2, topic: "Invoice discrepancies", description: "Clarify a mismatch", objectives: "Explain a discrepancy", keyVocabHint: "invoice, quantity", plan: { B1: ["describe an invoice mismatch", "two", "three", "four", "five"] } } as ContentWeekInput,
      "B1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(generated.lessons[0]?.parts.some((part) => part.code === "speaking")).toBe(true);
  });

  it("normalizes grammar metadata to the independent classifier without discarding valid content", async () => {
    let foundationAttempts = 0;
    const mismatched = { ...foundation, grammar: { ...foundation.grammar, contentType: "grammar_rule" } };
    const runTask = vi.fn(async (taskId: string, input: unknown, options?: { systemPrompt?: string }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        foundationAttempts += 1;
        return { output: mismatched, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback",
      objectives: "Give clear feedback", keyVocabHint: "feedback, clear",
      plan: { A1: ["give clear feedback", "two", "three", "four", "five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner, { dayNumbers: [1] });
    expect(foundationAttempts).toBe(1);
    expect(generated.lessons[0]?.parts.find((part) => part.code === "grammar")?.content).toMatchObject({
      contentType: grammarClassification.contentType,
      targetName: grammarClassification.targetName,
      scope: grammarClassification.scope
    });
  });

  it("stops foundation generation after its repair budget and retains the other valid components", async () => {
    let foundationAttempts = 0;
    const invalidFoundation = {
      ...foundation,
      objective: { ...foundation.objective, items: [] }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        foundationAttempts += 1;
        return { output: invalidFoundation, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback",
      objectives: "Give clear feedback", keyVocabHint: "feedback, clear",
      plan: { A1: ["give clear feedback", "two", "three", "four", "five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(
      week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(foundationAttempts).toBe(3);
    expect(generated.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ dayNumber: 1, component: "foundation", code: "AI_OUTPUT_INVALID" })
    ]));
    expect(generated.lessons[0]?.parts.some((part) => part.code === "vocabulary")).toBe(true);
    expect(generated.lessons[0]?.parts.some((part) => part.code === "objective")).toBe(false);
  });


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
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.maxOutputTokens === 3_500)).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("objective.items must contain 2-4 measurable objectives"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("B2 justify/negotiate/handle/propose"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("grammar.usage must be exactly one short sentence"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("title must name the concrete sentence frame"))).toBe(true);
    expect(runTask.mock.calls.slice(10, 15).every((call) => call[2]?.maxOutputTokens === 3_500)).toBe(true);
    expect(runTask.mock.calls.slice(15, 20).every((call) => call[2]?.maxOutputTokens === 2_500)).toBe(true);
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
          { ...foundation.objective.items[0]!, text: "By the end of this lesson, you will be able to propose one meeting time during a scheduling call.", action_verb: "propose", condition: "during a scheduling call", criterion: "one workable time", assessed_by: "speaking", success_evidence: "The response includes one workable time", assessmentCode: "speaking" },
          { ...foundation.objective.items[1]!, text: "By the end of this lesson, you will be able to paraphrase one meeting request after checking both calendars.", action_verb: "paraphrase", target_language: ["available", "time zone"], condition: "after checking both calendars", criterion: "one accurate request", assessed_by: "listening", success_evidence: "The answer restates the request accurately", assessmentCode: "listening" },
          { ...foundation.objective.items[1]!, id: "L2", text: "By the end of this lesson, you will be able to adapt a meeting request for a senior colleague in one response.", action_verb: "adapt", target_language: ["Would you be available...?"], condition: "when speaking to a senior colleague", criterion: "one polite request", assessed_by: "speaking", success_evidence: "The response uses the polite frame", assessmentCode: "speaking" }
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
          { ...foundation.objective.items[0]!, text: "By the end of this lesson, you will be able to understand one calendar invitation after the meeting.", action_verb: "understand", condition: "after the meeting", criterion: "one accurate response" },
          { ...foundation.objective.items[1]!, text: "By the end of this lesson, you will be able to paraphrase one meeting request when listening.", action_verb: "paraphrase", target_language: ["available", "time zone"], condition: "when listening", criterion: "one accurate request" },
          { ...foundation.objective.items[1]!, id: "L2", text: "By the end of this lesson, you will be able to adapt one request for a senior colleague.", action_verb: "adapt", target_language: ["Would you be available...?"], condition: "with a senior colleague", criterion: "one polite request" }
        ]
      }
    };
    const repaired = {
      ...b2Foundation,
      objective: {
        ...b2Foundation.objective,
        items: [
          { ...b2Foundation.objective.items[0]!, text: "By the end of this lesson, you will be able to propose one follow-up action after the meeting.", action_verb: "propose" },
          b2Foundation.objective.items[1]!,
          b2Foundation.objective.items[2]!
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

  it("uses two internal repairs for a vocabulary component before preserving the partial lesson", async () => {
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
        if (vocabularyAttempts <= 2) {
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
    expect(vocabularyAttempts).toBe(3);
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_vocabulary")?.[2]?.systemPrompt)
      .toContain("Do not mechanically attach a suffix");
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_vocabulary" && call[2]?.systemPrompt?.includes("REPAIR REQUIRED"))?.[2]?.systemPrompt)
      .toContain("synonym must have the same part of speech");
  });

  it("gives a component repair the previous invalid output so valid fields can be preserved", async () => {
    let vocabularyAttempts = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown, _options?: { systemPrompt?: string }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") {
        vocabularyAttempts += 1;
        const valid = vocabularyForDay(dayNumber);
        if (vocabularyAttempts === 1) {
          return {
            output: {
              ...valid,
              word1: { ...valid.word1, collocation1: "context without the vocabulary term" }
            },
            metadata
          };
        }
        return { output: valid, metadata };
      }
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    await generateWeeklyLessons(
      { weekNumber: 2, topic: "Scheduling meetings", description: "Arrange meetings", objectives: "Propose a time", keyVocabHint: "available", plan: { A1: ["one", "two", "three", "four", "five"] } } as ContentWeekInput,
      "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner, { dayNumbers: [1] }
    );

    const repairPrompt = runTask.mock.calls.find((call) => call[0] === "weekly_lesson_vocabulary" && call[2]?.systemPrompt?.includes("REPAIR REQUIRED"))?.[2]?.systemPrompt;
    expect(repairPrompt).toContain("PREVIOUS INVALID OUTPUT:");
    expect(repairPrompt).toContain("context without the vocabulary term");
  });

  it("preserves the prompt-approved B1+ objective opener", async () => {
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
            text: "By the end of this lesson, you will be able to propose one meeting time after checking both calendars.",
            action_verb: "propose", condition: "after checking both calendars", criterion: "one workable time"
          },
          {
            ...foundation.objective.items[1]!,
            text: "By the end of this lesson, you will be able to paraphrase one meeting request in the follow-up conversation.",
            action_verb: "paraphrase", target_language: ["available", "time zone"], condition: "in the follow-up conversation", criterion: "one accurate request"
          },
          {
            ...foundation.objective.items[1]!, id: "L2",
            text: "By the end of this lesson, you will be able to adapt one meeting request for a senior colleague.",
            action_verb: "adapt", target_language: ["Would you be available...?"], condition: "with a senior colleague", criterion: "one polite request"
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
      expect.objectContaining({ text: "By the end of this lesson, you will be able to propose one meeting time after checking both calendars." }),
      expect.objectContaining({ text: "By the end of this lesson, you will be able to paraphrase one meeting request in the follow-up conversation." })
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

  it("treats vocabulary from earlier lesson sets as guidance instead of a fatal duplicate", async () => {
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
      week,
      "A1",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner,
      { excludedVocabulary: ["feedback", "clear", "helpful"] }
    );

    expect(generated.lessons).toHaveLength(5);
    expect((runTask.mock.calls.find((call) => call[0] === "weekly_lesson_vocabulary")?.[1] as { excludedVocabulary: string[] }).excludedVocabulary)
      .toEqual(expect.arrayContaining(["feedback", "clear", "helpful"]));
  });

  it("retries a component after the AI gateway exhausts its schema repair attempts", async () => {
    const foundationAttempts = new Map<number, number>();
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        const attempt = (foundationAttempts.get(dayNumber) ?? 0) + 1;
        foundationAttempts.set(dayNumber, attempt);
        if (dayNumber === 3 && attempt === 1) {
          throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
            code: "AI_OUTPUT_INVALID",
            details: { issues: [{ path: "objective.items.1.target_language", message: "Too big: expected array to have <=5 items" }] }
          });
        }
        return { output: foundation, metadata };
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

    await expect(generateWeeklyLessons(
      week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner
    )).resolves.toMatchObject({ lessons: expect.any(Array) });
    expect(foundationAttempts.get(3)).toBe(2);
  });

  it("keeps every valid component when one component stays invalid", async () => {
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") {
        throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
          code: "AI_OUTPUT_INVALID",
          details: { issues: [{ path: "word1.synonym1.example", message: "invalid contextual evidence" }] }
        });
      }
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 1, topic: "Giving project updates", description: "Report progress",
      objectives: "Report progress and risks", keyVocabHint: "status, blocker, deadline",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(
      week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner, { dayNumbers: [1] }
    );

    expect(generated.lessons).toHaveLength(1);
    expect(generated.lessons[0]?.parts.map((part) => part.code)).toEqual(expect.arrayContaining([
      "objective", "instruction", "grammar", "pronunciation", "listening", "reading", "writing", "speaking"
    ]));
    expect(generated.lessons[0]?.parts.some((part) => part.code === "vocabulary")).toBe(false);
    expect(generated.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ dayNumber: 1, component: "vocabulary" })
    ]));
  });

  it("keeps grammar visible when classification fails while retaining the classifier failure", async () => {
    const focus = "day one";
    const fallbackFoundation = {
      ...foundation,
      title: focus,
      grammar: { ...foundation.grammar, contentType: "sentence_pattern", targetName: focus, scope: focus }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      if (taskId === "weekly_lesson_grammar_classifier") {
        throw Object.assign(new Error("AI_OUTPUT_INVALID"), { code: "AI_OUTPUT_INVALID", details: { issues: [] } });
      }
      if (taskId === "weekly_lesson_foundation") {
        expect(input).toMatchObject({ grammarClassification: { status: "classified", targetName: focus, scope: focus } });
        return { output: fallbackFoundation, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabulary, metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const week = {
      weekNumber: 1, topic: "Giving project updates", description: "Report progress",
      objectives: "Report progress and risks", keyVocabHint: "status, blocker, deadline",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(
      week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner, { dayNumbers: [1] }
    );

    expect(generated.lessons[0]?.parts.some((part) => part.code === "objective")).toBe(true);
    expect(generated.lessons[0]?.parts.find((part) => part.code === "grammar")?.content).toMatchObject({
      targetName: focus, scope: focus, formula: "S + V + O"
    });
    expect(generated.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ dayNumber: 1, component: "grammarClassification" })
    ]));
  });

  it("generates only the missing component during AI supplementation", async () => {
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabulary, metadata };
      throw new Error(`SHOULD_NOT_REGENERATE:${taskId}`);
    });
    const existingLesson = {
      dayNumber: 1,
      title: "Tiêu đề sửa tay",
      durationMinutes: 10,
      parts: [
        { code: "objective", title: "Mục tiêu", content: { text: "Giữ nguyên" } },
        { code: "instruction", title: "Hướng dẫn", content: { steps: ["Một", "Hai", "Ba"] } },
        { code: "grammar", title: "Ngữ pháp", content: { formula: "S + V", examples: ["I work.", "We work."] } },
        { code: "pronunciation", title: "Phát âm", content: { words: ["work", "week", "well"] } },
        { code: "listening", title: "Nghe", content: { options: ["A", "B", "C", "D"] } },
        { code: "reading", title: "Đọc", content: { options: ["A", "B", "C", "D"] } },
        { code: "writing", title: "Viết", content: { prompt: "Write" } },
        { code: "word_class", title: "Từ loại", content: { options: ["A", "B", "C", "D"] } },
        { code: "word_use", title: "Dùng từ", content: { options: ["A", "B", "C", "D"] } },
        { code: "speaking", title: "Nói", content: { prompt: "Speak" } }
      ]
    } as ContentLessonDraftInput;
    const week = {
      weekNumber: 1, topic: "Giving project updates", description: "Report progress",
      objectives: "Report progress and risks", keyVocabHint: "status, blocker, deadline",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessons(
      week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], existingLessons: [existingLesson] }
    );

    expect(runTask.mock.calls.map((call) => call[0])).toEqual(["weekly_lesson_vocabulary"]);
    expect(generated.lessons[0]?.parts.map((part) => part.code)).toEqual(["vocabulary"]);
  });

  it("limits phrase supplementation to vocabulary even when another component is absent", async () => {
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabulary, metadata };
      throw new Error(`SHOULD_NOT_REGENERATE:${taskId}`);
    });
    const existingLesson = {
      dayNumber: 1,
      title: "Tiêu đề sửa tay",
      durationMinutes: 10,
      parts: [
        { code: "vocabulary", title: "Từ vựng", content: { items: [{ ...vocabularyItem("feedback"), collocations: ["clear feedback"] }] } },
        { code: "instruction", title: "Hướng dẫn", content: { steps: ["Một", "Hai", "Ba"] } },
        { code: "grammar", title: "Ngữ pháp", content: { formula: "S + V", examples: ["I work.", "We work."] } },
        { code: "pronunciation", title: "Phát âm", content: { words: ["work", "week", "well"] } },
        { code: "listening", title: "Nghe", content: { options: ["A", "B", "C", "D"] } },
        { code: "reading", title: "Đọc", content: { options: ["A", "B", "C", "D"] } },
        { code: "writing", title: "Viết", content: { prompt: "Write" } },
        { code: "word_class", title: "Từ loại", content: { options: ["A", "B", "C", "D"] } },
        { code: "word_use", title: "Dùng từ", content: { options: ["A", "B", "C", "D"] } },
        { code: "speaking", title: "Nói", content: { prompt: "Speak" } }
      ]
    } as ContentLessonDraftInput;
    const week = {
      weekNumber: 1, topic: "Giving project updates", description: "Report progress",
      objectives: "Report progress and risks", keyVocabHint: "status, blocker, deadline",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    await generateWeeklyLessons(
      week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], existingLessons: [existingLesson], repairMode: "fill-phrases" }
    );

    expect(runTask.mock.calls.map((call) => call[0])).toEqual(["weekly_lesson_vocabulary"]);
  });

  it("reports a full failure only when no useful lesson component survives", async () => {
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
        code: "AI_OUTPUT_INVALID",
        details: { issues: [{ path: "output", message: `${taskId} invalid` }] }
      });
    });
    const week = {
      weekNumber: 1, topic: "Giving project updates", description: "Report progress",
      objectives: "Report progress and risks", keyVocabHint: "status, blocker, deadline",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    await expect(generateWeeklyLessons(
      week, "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner, { dayNumbers: [1] }
    )).rejects.toMatchObject({ code: "AI_LESSON_GENERATION_FAILED" });
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
      expect.objectContaining({ type: "content", assessmentCode: "listening", text: "Sau bài học, bạn có thể chọn hai chi tiết phản hồi đúng sau khi nghe." }),
      expect.objectContaining({ type: "language", assessmentCode: "speaking", text: "Sau bài học, bạn có thể nói một câu có cụm \"clear feedback\" khi nhập vai." })
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
      "Sau bài học, bạn có thể chọn hai chi tiết phản hồi đúng sau khi nghe.",
      "Sau bài học, bạn có thể nói một câu có cụm \"clear feedback\" khi nhập vai."
    ]);
    expect(objective.text).toBe("Sau bài học, bạn có thể chọn hai chi tiết phản hồi đúng sau khi nghe.\nSau bài học, bạn có thể nói một câu có cụm \"clear feedback\" khi nhập vai.");
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
