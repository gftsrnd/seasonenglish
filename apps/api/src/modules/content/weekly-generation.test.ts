import { describe, expect, it, vi } from "vitest";
import type { ContentLessonDraftInput, ContentWeekInput } from "@e4s/contracts";
import { createPronunciationAssetRegistry, type AiTaskRunner } from "@e4s/ai";
import { buildPronunciationLessonContent, generateWeeklyLessons as generateWeeklyLessonsImpl, learnerFacingLanguageFindings, lessonQualityProfileFromEnv } from "./weekly-generation.js";

vi.mock("@e4s/ai", async () => await import("../../../../../packages/ai/src/index.js"));

const metadata = {
  traceId: "trace-1", taskId: "component", provider: "anthropic", model: "claude-haiku-5-5",
  attempts: 1, latencyMs: 10, inputHash: "hash", schemaValid: true,
  usage: {
    inputTokens: 100, outputTokens: 200, totalTokens: 300,
    cacheCreationInputTokens: 10, cacheReadInputTokens: 20
  }
};

function legacyRunner(runTask: (taskId: string, input: unknown, options?: any) => Promise<any>): AiTaskRunner {
  const foundationByDay = new Map<number, any>();
  const skillsByDay = new Map<number, Promise<any>>();
  const groupCalls = new Map<string, number>();
  return {
    runTask: async (taskId: string, input: unknown, options?: any) => {
      const dayNumber = (input as { dayNumber?: number }).dayNumber ?? 0;
      if (taskId === "weekly_lesson_objectives") {
        const result = await runTask("weekly_lesson_foundation", input, options);
        foundationByDay.set(dayNumber, result);
        return { ...result, output: { objective: result.output.objective } };
      }
      if (taskId === "weekly_lesson_foundation" && foundationByDay.has(dayNumber)) {
        const result = foundationByDay.get(dayNumber);
        foundationByDay.delete(dayNumber);
        return result;
      }
      if (taskId === "weekly_lesson_comprehension") {
        const pending = runTask("weekly_lesson_skills", input, options);
        skillsByDay.set(dayNumber, pending);
        const result = await pending;
        return { ...result, output: { listening: result.output.listening, reading: result.output.reading } };
      }
      if (taskId === "weekly_lesson_language_practice" || taskId === "weekly_lesson_speaking") {
        const key = `${taskId}:${dayNumber}`;
        const calls = (groupCalls.get(key) ?? 0) + 1;
        groupCalls.set(key, calls);
        let pending = skillsByDay.get(dayNumber);
        if (!pending || calls > 1) {
          pending = runTask("weekly_lesson_skills", input, options);
          skillsByDay.set(dayNumber, pending);
        }
        const result = await pending;
        return taskId === "weekly_lesson_language_practice"
          ? { ...result, output: { writing: result.output.writing, wordClass: result.output.wordClass, wordUse: result.output.wordUse } }
          : { ...result, output: { speaking: result.output.speaking } };
      }
      return runTask(taskId, input, options);
    }
  } as unknown as AiTaskRunner;
}

function generateWeeklyLessons(...args: Parameters<typeof generateWeeklyLessonsImpl>) {
  return generateWeeklyLessonsImpl(args[0], args[1], args[2], legacyRunner((args[3] as any).runTask), args[4]);
}

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

function withEnglishFoundationCopy<T extends Record<string, any>>(value: T): T {
  return {
    ...value,
    objective: value.objective ? {
      ...value.objective,
      items: value.objective.items?.map((item: Record<string, unknown>) => ({
        ...item,
        condition: "in the stated workplace situation",
        criterion: "one accurate response",
        success_evidence: "The response meets the stated task."
      }))
    } : value.objective,
    instruction: { ...value.instruction, title: "Instructions", step1: "Read the model.", step2: "Review the vocabulary.", step3: "Complete the exercises." },
    grammar: value.grammar ? { ...value.grammar, title: "Grammar", usage: "Use this pattern to give clear workplace feedback." } : value.grammar,
    pronunciation: { ...value.pronunciation, title: "Pronunciation", tip: "Touch your upper teeth gently to your lower lip." }
  };
}

function withEnglishSkillsCopy<T extends Record<string, any>>(value: T): T {
  const titles: Record<string, string> = { listening: "Listening", reading: "Reading", writing: "Writing", wordClass: "Word class", wordUse: "Word use", speaking: "Speaking" };
  return Object.fromEntries(Object.entries(value).map(([code, exercise]) => {
    const current = exercise as Record<string, unknown>;
    const rawPrompt = typeof current.prompt === "string" ? current.prompt : "";
    const prompt = code === "speaking" && /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]|\b(?:hãy|nói|viết)\b/iu.test(rawPrompt)
      ? "Give one clear and polite workplace response."
      : rawPrompt;
    const answer = typeof current.answer === "string" ? current.answer : "";
    return [code, {
      ...current,
      title: titles[code],
      prompt,
      hint: "Use the workplace context and the taught language.",
      questionTranslation: prompt,
      answerTranslation: answer
    }];
  })) as T;
}

function withEnglishVocabularyCopy<T extends Record<string, any>>(value: T): T {
  const cleanWord = (word: Record<string, any>) => ({
    ...word,
    ...(word.synonym1 ? { synonym1: { ...word.synonym1, note: "same workplace sense" } } : {}),
    ...(word.synonym2 ? { synonym2: { ...word.synonym2, note: "same workplace sense" } } : {}),
    ...(word.antonym1 ? { antonym1: { ...word.antonym1, note: "opposite workplace sense" } } : {})
  });
  return { ...value, title: "Vocabulary", word1: cleanWord(value.word1), word2: cleanWord(value.word2), word3: cleanWord(value.word3) };
}

describe("weekly lesson generation orchestration", () => {
  it("retries only the invalid strict subgroup and preserves valid sibling groups", async () => {
    const b2Foundation = withEnglishFoundationCopy({
      ...foundation,
      objective: {
        ...foundation.objective,
        explanationLanguage: "en",
        lesson_goal: "Handle a project update and propose the next action.",
        items: [
          { ...foundation.objective.items[0]!, text: "By the end of this lesson, you will be able to soften one project update appropriately.", action_verb: "soften", condition: "after reading the update", criterion: "one diplomatic response", assessed_by: "reading", success_evidence: "The response reduces force appropriately.", assessmentCode: "reading" },
          { ...foundation.objective.items[1]!, text: "By the end of this lesson, you will be able to propose one next action using a deadline.", action_verb: "propose", target_language: ["by Friday"], condition: "during a project discussion", criterion: "one action and deadline", assessed_by: "speaking", success_evidence: "The response includes an action and deadline.", assessmentCode: "speaking" },
          { ...foundation.objective.items[1]!, id: "L2", text: "By the end of this lesson, you will be able to justify one recommendation using because.", action_verb: "justify", target_language: ["because"], condition: "after comparing the options", criterion: "one reason", assessed_by: "writing", success_evidence: "The response gives one reason.", assessmentCode: "writing" }
        ]
      }
    });
    const b2Skills = withEnglishSkillsCopy({
      ...skills,
      listening: { ...skills.listening, body: "The client postponed the review because two figures were missing, so the team will verify the report before Friday morning.", prompt: "Why will the team most likely verify the report?" },
      reading: { ...skills.reading, body: "Mina found conflicting totals in the monthly report. She asked finance to confirm the source before recommending a revised delivery date to the client. She then documented the evidence and scheduled a review before sending any update.", prompt: "What does Mina's action suggest about her priority?" },
      writing: { ...skills.writing, type: "write", prompt: "Propose one next action and justify it.", answer: "We should verify the totals because accuracy matters." },
      speaking: { ...skills.speaking, prompt: "Propose a diplomatic next step, give a reason, and set a Friday deadline.", answer: "We should verify it because the client needs an answer by Friday." }
    });
    let comprehensionAttempts = 0;
    const progress: Array<{ dayNumber: number; component: string; status: string; attempt: number }> = [];
    const runTask = vi.fn(async (taskId: string, input: unknown, _options?: { systemPrompt?: string; maxOutputTokens?: number }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_objectives") return { output: { objective: b2Foundation.objective }, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: b2Foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: withEnglishVocabularyCopy(vocabularyForDay(dayNumber)), metadata };
      if (taskId === "weekly_lesson_comprehension") {
        comprehensionAttempts += 1;
        return { output: comprehensionAttempts === 1
          ? { listening: { ...b2Skills.listening, prompt: "Hãy chọn lý do phù hợp." }, reading: b2Skills.reading }
          : { listening: b2Skills.listening, reading: b2Skills.reading }, metadata };
      }
      if (taskId === "weekly_lesson_language_practice") return { output: { writing: b2Skills.writing, wordClass: b2Skills.wordClass, wordUse: b2Skills.wordUse }, metadata };
      if (taskId === "weekly_lesson_speaking") return { output: { speaking: b2Skills.speaking }, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessonsImpl(
      { weekNumber: 1, topic: "Project updates", description: "Handle a delayed report", objectives: "Propose and justify a next action", keyVocabHint: "report, verify, deadline", plan: { B2: ["handle a delayed project update", "two", "three", "four", "five"] } } as ContentWeekInput,
      "B2", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: false, onProgress: (event) => progress.push(event) }
    );

    expect(comprehensionAttempts).toBe(2);
    expect(runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_language_practice")).toHaveLength(1);
    expect(runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_speaking")).toHaveLength(1);
    expect(progress).toEqual(expect.arrayContaining([
      expect.objectContaining({ dayNumber: 1, component: "skills.comprehension", status: "retrying", attempt: 2 }),
      expect.objectContaining({ dayNumber: 1, component: "skills.languagePractice", status: "completed", attempt: 1 }),
      expect.objectContaining({ dayNumber: 1, component: "skills.speaking", status: "completed", attempt: 1 })
    ]));
    expect(generated.lessons[0]?.parts.map((part) => part.code)).toEqual(expect.arrayContaining(["listening", "reading", "writing", "word_class", "word_use", "speaking"]));
  });

  it("keeps valid skill subgroups and blocks completion when one subgroup fails twice", async () => {
    let speakingAttempts = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_objectives") return { output: { objective: foundation.objective }, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_comprehension") return { output: { listening: skills.listening, reading: skills.reading }, metadata };
      if (taskId === "weekly_lesson_language_practice") return { output: { writing: skills.writing, wordClass: skills.wordClass, wordUse: skills.wordUse }, metadata };
      if (taskId === "weekly_lesson_speaking") {
        speakingAttempts += 1;
        throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
          code: "AI_OUTPUT_INVALID",
          details: { issues: [{ path: "speaking.prompt", message: "missing required task constraints" }] }
        });
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessonsImpl(
      { weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback", objectives: "Give clear feedback", keyVocabHint: "feedback, clear", plan: { A1: ["give clear feedback", "two", "three", "four", "five"] } } as ContentWeekInput,
      "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(speakingAttempts).toBe(2);
    expect(generated.lessons[0]?.parts.map((part) => part.code)).toEqual(expect.arrayContaining(["listening", "reading", "writing", "word_class", "word_use"]));
    expect(generated.lessons[0]?.parts.some((part) => part.code === "speaking")).toBe(false);
    expect(generated.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "skills.speaking", severity: "error", repairAction: "regenerate_component" })
    ]));
    expect(generated.output.qualityMetrics.partialSuccess).toBe(true);
  });

  it("retries a truncated long subgroup once with a targeted larger token budget", async () => {
    let comprehensionAttempts = 0;
    const comprehensionBudgets: number[] = [];
    const runTask = vi.fn(async (taskId: string, input: unknown, options?: { maxOutputTokens?: number }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_objectives") return { output: { objective: foundation.objective }, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_comprehension") {
        comprehensionAttempts += 1;
        comprehensionBudgets.push(options?.maxOutputTokens ?? 0);
        if (comprehensionAttempts === 1) {
          throw Object.assign(new Error("AI_OUTPUT_TRUNCATED"), {
            code: "AI_OUTPUT_TRUNCATED",
            details: { stopReason: "max_tokens", maxOutputTokens: 1800, usage: { inputTokens: 600, outputTokens: 1800, totalTokens: 2400 } }
          });
        }
        return { output: { listening: skills.listening, reading: skills.reading }, metadata };
      }
      if (taskId === "weekly_lesson_language_practice") return { output: { writing: skills.writing, wordClass: skills.wordClass, wordUse: skills.wordUse }, metadata };
      if (taskId === "weekly_lesson_speaking") return { output: { speaking: skills.speaking }, metadata };
      if (taskId === "weekly_lesson_skills_reviewer") return { output: approvedSkillsReview, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessonsImpl(
      { weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback", objectives: "Give clear feedback", keyVocabHint: "feedback, clear", plan: { A1: ["give clear feedback", "two", "three", "four", "five"] } } as ContentWeekInput,
      "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(generated.lessons).toHaveLength(1);
    expect(comprehensionAttempts).toBe(2);
    expect(comprehensionBudgets).toEqual([1_800, 3_600]);
    expect(runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_language_practice")).toHaveLength(1);
    expect(runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_speaking")).toHaveLength(1);
  });

  it("routes an AI reviewer finding only to its owning subgroup within two attempts", async () => {
    let reviewAttempts = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_objectives") return { output: { objective: foundation.objective }, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_comprehension") return { output: { listening: skills.listening, reading: skills.reading }, metadata };
      if (taskId === "weekly_lesson_language_practice") return { output: { writing: skills.writing, wordClass: skills.wordClass, wordUse: skills.wordUse }, metadata };
      if (taskId === "weekly_lesson_speaking") return { output: { speaking: skills.speaking }, metadata };
      if (taskId === "weekly_lesson_skills_reviewer") {
        reviewAttempts += 1;
        return reviewAttempts === 1
          ? { output: { ...approvedSkillsReview, status: "needs_revision", findings: [{ exerciseCode: "writing", reasonCode: "key_mismatch", message: "The model answer does not satisfy the writing instruction." }] }, metadata }
          : { output: approvedSkillsReview, metadata };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessonsImpl(
      { weekNumber: 1, topic: "Giving feedback", description: "Give clear feedback", objectives: "Give clear feedback", keyVocabHint: "feedback, clear", plan: { A1: ["give clear feedback", "two", "three", "four", "five"] } } as ContentWeekInput,
      "A1", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(reviewAttempts).toBe(2);
    expect(runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_comprehension")).toHaveLength(1);
    expect(runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_language_practice")).toHaveLength(2);
    expect(runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_speaking")).toHaveLength(1);
    expect(generated.lessons).toHaveLength(1);
  });

  it("reports every mixed-language B1+ field while allowing Vietnamese vocabulary meanings", () => {
    expect(learnerFacingLanguageFindings("foundation", {
      title: "Polite clarification",
      objective: { items: [{ text: "By the end, you can hỏi lại lịch sự." }] },
      instruction: { step1: "Read the example.", step2: "Làm bài tập.", step3: "Review your answer." },
      grammar: { usage: "Use this pattern to clarify a request." },
      pronunciation: { tip: "Keep your voice calm." }
    }, "B1")).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["objective", "items", 0, "text"] }),
      expect.objectContaining({ path: ["instruction", "step2"] })
    ]));

    expect(learnerFacingLanguageFindings("vocabulary", {
      title: "Vocabulary",
      word1: { word: "clarify", meaning: "làm rõ", partOfSpeech: "verb", collocation1: "clarify a request", collocation2: "clarify the issue", collocation3: "clarify expectations" }
    }, "B1")).toEqual([]);
    expect(learnerFacingLanguageFindings("skills", {
      writing: { prompt: "Report the Đà Nẵng travel expense in one sentence." }
    }, "B1")).toEqual([]);
  });

  it("allows Vietnamese learner guidance for A1-A2", () => {
    expect(learnerFacingLanguageFindings("skills", skills, "A2")).toEqual([]);
  });

  it("constructs canonical B2 headings and passes explicit skill constraints", async () => {
    const b2Foundation = withEnglishFoundationCopy({
      ...foundation,
      title: null,
      grammar: null,
      objective: {
        ...foundation.objective,
        title: "Mục tiêu",
        explanationLanguage: "en",
        lesson_goal: "Summarise the issue and propose a practical follow-up.",
        items: [
          { ...foundation.objective.items[0]!, text: "By the end of this lesson, you will be able to summarize the issue in one sentence.", action_verb: "summarize", condition: "after reading the update", criterion: "one accurate summary", assessed_by: "reading", success_evidence: "The summary states the main issue.", assessmentCode: "reading" },
          { ...foundation.objective.items[1]!, text: "By the end of this lesson, you will be able to report one likely cause using cautious language.", action_verb: "report", target_language: ["may have"], condition: "after hearing the update", criterion: "one cautious report", assessed_by: "listening", success_evidence: "The report uses cautious language.", assessmentCode: "listening" },
          { ...foundation.objective.items[1]!, id: "L2", text: "By the end of this lesson, you will be able to propose one follow-up with a deadline.", action_verb: "propose", target_language: ["Could we...?"], condition: "during a workplace discussion", criterion: "one proposal and deadline", assessed_by: "speaking", success_evidence: "The response includes a proposal and deadline.", assessmentCode: "speaking" }
        ]
      },
      instruction: { title: "Hướng dẫn", step1: "Read the update.", step2: "Review the target language.", step3: "Complete each workplace task." },
      pronunciation: { ...foundation.pronunciation, title: "Phát âm", tip: "Keep the target sound clear and steady." }
    });
    const noSuitable = {
      status: "no_suitable_content", contentType: null, targetName: null, scope: null,
      support: "none", confidence: "high", evidence: [], rejectedCandidates: []
    };
    const b2Skills = withEnglishSkillsCopy({
      ...skills,
      writing: { ...skills.writing, type: "write", prompt: "Summarise the issue and propose one action.", answer: "The connection may have failed, so we should retry." },
      speaking: { ...skills.speaking, prompt: "Propose one diplomatic follow-up, give a reason, and set a Friday deadline.", answer: "We should retry because the client needs an update by Friday." }
    });
    const runTask = vi.fn(async (taskId: string, input: unknown, _options?: { systemPrompt?: string; maxOutputTokens?: number }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: noSuitable, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: b2Foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: withEnglishVocabularyCopy(vocabularyForDay(dayNumber)), metadata };
      if (taskId === "weekly_lesson_skills") return { output: b2Skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      { weekNumber: 1, topic: "Connection recovery", description: "Handle a failed client call", objectives: "Summarise and propose a follow-up", keyVocabHint: "connection, retry, deadline", plan: { B2: ["summarise a failed call", "two", "three", "four", "five"] } } as ContentWeekInput,
      "B2", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: false }
    );

    expect(generated.lessons[0]?.parts.filter((part) => ["objective", "instruction", "pronunciation"].includes(part.code)).map((part) => part.title))
      .toEqual(["Learning objectives", "Lesson instructions", "Pronunciation"]);
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_skills")?.[1]).toMatchObject({
      generationConstraints: {
        learnerLanguage: "en", writingType: "write",
        listeningWordMin: 18, listeningWordMax: 30,
        readingWordMin: 30, readingWordMax: 60,
        speakingAnswerWordMax: 16, inferenceRequired: false, speakingConstraintCount: 0
      }
    });
    const renderedSkillsPrompt = runTask.mock.calls.find((call) => call[0] === "weekly_lesson_skills")?.[2]?.systemPrompt as string;
    expect(renderedSkillsPrompt).toContain("Listening target length: 18-30 words");
    expect(renderedSkillsPrompt).toContain("Reading target length: 30-60 words");
    expect(renderedSkillsPrompt).toContain("Targets guide concision but are not reasons to truncate a complete sentence");
    expect(renderedSkillsPrompt).not.toContain("12-18 word");
    expect(renderedSkillsPrompt).not.toContain("reading body must be a coherent 18-30");
  });

  it("requires an accepted five-day CEFR plan instead of inventing topic-day focuses", async () => {
    const runTask = vi.fn();

    await expect(generateWeeklyLessons(
      {
        weekNumber: 2,
        topic: "Ordering office supplies",
        description: "Order supplies with a deadline",
        objectives: "Place and confirm an order",
        keyVocabHint: "order, quantity, deadline"
      } as ContentWeekInput,
      "B2",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner
    )).rejects.toMatchObject({
      code: "CONTENT_WEEK_PLAN_REQUIRED",
      issues: [expect.objectContaining({ component: "plan", repairAction: "regenerate_plan" })]
    });
    expect(runTask).not.toHaveBeenCalled();
  });

  it("retries only a duplicate grammar frame and keeps the corrected foundation", async () => {
    let foundationAttempts = 0;
    const duplicateFoundation = {
      ...foundation,
      title: "I need + quantity + item by + date",
      grammar: {
        ...foundation.grammar,
        targetName: "I need + [quantity] + [item] by + [date]",
        scope: "Ordering office supplies",
        formula: "I need + [quantity] + [item] by + [date]"
      }
    };
    const correctedFoundation = {
      ...duplicateFoundation,
      title: "Could you confirm + order + deadline?",
      grammar: {
        ...duplicateFoundation.grammar,
        targetName: "Could you confirm + [order] + by + [deadline]?",
        formula: "Could you confirm + [order] + by + [deadline]?"
      }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown, options?: { systemPrompt?: string }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        foundationAttempts += 1;
        return { output: foundationAttempts === 1 ? duplicateFoundation : correctedFoundation, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      {
        weekNumber: 2,
        topic: "Ordering office supplies",
        description: "Order supplies with a deadline",
        objectives: "Place and confirm an order",
        keyVocabHint: "order, quantity, deadline",
        plan: { A1: ["request an order", "confirm quantity", "check timing", "report a delay", "confirm delivery"] }
      } as ContentWeekInput,
      "A1",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner,
      {
        dayNumbers: [1],
        qualityReview: true,
        excludedGrammarFrames: ["I need quantity item by date"]
      }
    );

    expect(foundationAttempts).toBe(2);
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_foundation" && call[2]?.systemPrompt?.includes("DUPLICATE FRAME"))?.[2]?.systemPrompt)
      .toContain("Preserve every valid non-grammar field");
    expect(generated.lessons[0]?.parts.find((part) => part.code === "grammar")?.content)
      .toMatchObject({ formula: "Could you confirm + [order] + by + [deadline]?" });
    expect(generated.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DUPLICATE_GRAMMAR_FRAME" })
    ]));
  });

  it("deduplicates normalized grammar frames between days without regenerating the accepted day", async () => {
    const attempts = new Map<number, number>();
    const repeated = {
      ...foundation,
      grammar: { ...foundation.grammar, formula: "Could you approve + [item]?", targetName: "Could you approve + item?" }
    };
    const distinct = {
      ...foundation,
      title: "Would you confirm + deadline?",
      grammar: { ...foundation.grammar, formula: "Would you confirm + [deadline]?", targetName: "Would you confirm + deadline?" }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        const attempt = (attempts.get(dayNumber) ?? 0) + 1;
        attempts.set(dayNumber, attempt);
        return { output: dayNumber === 2 && attempt > 1 ? distinct : repeated, metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      {
        weekNumber: 2,
        topic: "Ordering office supplies",
        description: "Request and confirm office supplies",
        objectives: "Request approval and confirm delivery",
        keyVocabHint: "approve, item, deadline",
        plan: { A1: ["request approval", "confirm a deadline", "check quantity", "report a delay", "confirm delivery"] }
      } as ContentWeekInput,
      "A1",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1, 2], qualityReview: true }
    );

    expect(attempts).toEqual(new Map([[1, 1], [2, 2]]));
    expect(generated.lessons.map((lesson) => lesson.parts.find((part) => part.code === "grammar")?.content.formula))
      .toEqual(["Could you approve + [item]?", "Would you confirm + [deadline]?"]);
  });

  it("keeps an exhausted duplicate foundation as a partial draft with an actionable finding", async () => {
    const c1Objective = {
      title: "Objectives",
      explanationLanguage: "en",
      lesson_goal: "Mediate an office-supply order dispute.",
      assessment_gap: null,
      items: [
        { ...foundation.objective.items[0]!, id: "C1", type: "content", text: "By the end of this lesson, you will be able to mediate an order dispute.", action_verb: "mediate", target_language: null },
        { ...foundation.objective.items[1]!, id: "L1", type: "language", text: "By the end of this lesson, you will be able to reframe two constraints.", action_verb: "reframe", target_language: ["reframe constraints"] },
        { ...foundation.objective.items[1]!, id: "L2", type: "language", text: "By the end of this lesson, you will be able to tailor a diplomatic response.", action_verb: "tailor", target_language: ["tailor a response"] }
      ]
    };
    const duplicateFoundation = {
      ...foundation,
      objective: c1Objective,
      grammar: {
        ...foundation.grammar,
        targetName: "I need + [quantity] + [item] by + [date]",
        formula: "I need + [quantity] + [item] by + [date]"
      }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: duplicateFoundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") return { output: skills, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      {
        weekNumber: 2,
        topic: "Ordering office supplies",
        description: "Order supplies with a deadline",
        objectives: "Place and confirm an order",
        keyVocabHint: "order, quantity, deadline",
        plan: { C1: ["mediate an order dispute", "reframe constraints", "negotiate alternatives", "tailor a response", "confirm resolution"] }
      } as ContentWeekInput,
      "C1",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true, excludedGrammarFrames: ["I need quantity item by date"] }
    );

    expect(generated.lessons).toHaveLength(1);
    expect(generated.lessons[0]?.parts.some((part) => part.code === "grammar")).toBe(true);
    expect(generated.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dayNumber: 1,
        component: "foundation",
        code: "DUPLICATE_GRAMMAR_FRAME",
        severity: "error",
        repairAction: "regenerate_component"
      })
    ]));
  });

  it("accepts a cumulative explain content objective when the language objectives are C1", async () => {
    const c1FoundationWithB1Verb = {
      ...foundation,
      objective: {
        title: "Objectives",
        explanationLanguage: "en",
        lesson_goal: "Mediate an office-supply order dispute.",
        assessment_gap: null,
        items: [
          { ...foundation.objective.items[0]!, id: "C1", type: "content", text: "By the end of this lesson, you will be able to explain an order dispute.", action_verb: "explain", target_language: null },
          { ...foundation.objective.items[1]!, id: "L1", type: "language", text: "By the end of this lesson, you will be able to reframe two constraints.", action_verb: "reframe", target_language: ["reframe constraints"] },
          { ...foundation.objective.items[1]!, id: "L2", type: "language", text: "By the end of this lesson, you will be able to tailor a diplomatic response.", action_verb: "tailor", target_language: ["tailor a response"] }
        ]
      }
    };
    let foundationAttempts = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        foundationAttempts += 1;
        return { output: withEnglishFoundationCopy(c1FoundationWithB1Verb), metadata };
      }
      if (taskId === "weekly_lesson_vocabulary") return { output: withEnglishVocabularyCopy(vocabularyForDay(dayNumber)), metadata };
      if (taskId === "weekly_lesson_skills") return { output: withEnglishSkillsCopy(skills), metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      {
        weekNumber: 2,
        topic: "Ordering office supplies",
        description: "Mediate a disputed order",
        objectives: "Mediate, reframe and resolve the dispute",
        keyVocabHint: "constraint, concession, resolution",
        plan: { C1: ["mediate an order dispute", "reframe constraints", "negotiate alternatives", "tailor a response", "confirm resolution"] }
      } as ContentWeekInput,
      "C1",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(foundationAttempts).toBe(1);
    expect(generated.lessons[0]?.parts.some((part) => part.code === "objective")).toBe(true);
    expect(generated.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ dayNumber: 1, component: "foundation", code: "CEFR_FOUNDATION_CONSTRAINT" })
    ]));
  });

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

  it("uses the curated pronunciation plan instead of retrying an invalid model selection", async () => {
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

    expect(foundationAttempts).toBe(1);
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_foundation")?.[1]).toMatchObject({
      pronunciationPlan: {
        focus: "/aɪ/",
        word1: { word: "might", ipa: "/maɪt/" },
        word2: { word: "time", ipa: "/taɪm/" },
        word3: { word: "clarify", ipa: "/ˈklærɪfaɪ/" }
      }
    });
    expect(generated.lessons[0]?.parts.find((part) => part.code === "grammar")?.content).toMatchObject({
      title: "Ngữ pháp",
      contentType: "sentence_pattern",
      targetName: "S + V + O",
      scope: "Giving clear feedback",
      formula: "S + V + O",
      usage: "Dùng để đưa ra góp ý trong công việc.",
      examples: ["I give clear feedback.", "I give helpful feedback."]
    });
    expect(generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content).toMatchObject({
      focus: "/aɪ/",
      words: [{ word: "might", ipa: "/maɪt/" }, { word: "time", ipa: "/taɪm/" }, { word: "clarify", ipa: "/ˈklærɪfaɪ/" }]
    });
    const pronunciation = generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content;
    expect(pronunciation).not.toHaveProperty("phonemeAudioId");
    expect(pronunciation).not.toHaveProperty("phonemeAudioUrl");
  });

  it("retries a composite pronunciation focus outside the supported 44 sounds", async () => {
    const compositeFocus = {
      ...foundation,
      pronunciation: {
        ...foundation.pronunciation,
        focus: "/wɜː/",
        word1: { word: "work", ipa: "/wɜːk/" },
        word2: { word: "worker", ipa: "/ˈwɜːkə/" },
        word3: { word: "working", ipa: "/ˈwɜːkɪŋ/" }
      }
    };
    let foundationAttempts = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown, options?: { systemPrompt?: string }) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") {
        foundationAttempts += 1;
        return { output: foundationAttempts === 1 ? compositeFocus : foundation, metadata };
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

    expect(foundationAttempts).toBe(1);
    const pronunciation = generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content;
    expect(pronunciation).toMatchObject({ focus: "/aɪ/" });
    expect(pronunciation).not.toHaveProperty("phonemeAudioId");
    expect(pronunciation).not.toHaveProperty("phonemeAudioUrl");
  });

  it("keeps the required pronunciation part valid when the model repeatedly proposes invalid words", async () => {
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

    expect(foundationAttempts).toBe(1);
    expect(generated.lessons[0]?.parts.some((part) => part.code === "objective")).toBe(true);
    expect(generated.lessons[0]?.parts.some((part) => part.code === "grammar")).toBe(true);
    expect(generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content).toMatchObject({
      focus: "/aɪ/",
      words: [{ word: "might", ipa: "/maɪt/" }, { word: "time", ipa: "/taɪm/" }, { word: "clarify", ipa: "/ˈklærɪfaɪ/" }]
    });
    expect(generated.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "foundation", severity: "error" })
    ]));
  });

  it("adds word audio URLs without assembling target-phoneme audio", async () => {
    const pronunciationAssetRegistry = createPronunciationAssetRegistry([
      { kind: "phoneme", key: "f", id: "phoneme-f", url: "/media/audio/phonemes/f.wav" },
      { kind: "word", key: "feedback", id: "word-feedback", url: "/media/audio/words/feedback.mp3" },
      { kind: "word", key: "fine", id: "word-fine", url: "/media/audio/words/fine.mp3" },
      { kind: "word", key: "helpful", id: "word-helpful", url: "/media/audio/words/helpful.mp3" }
    ]);
    const pronunciation = buildPronunciationLessonContent(foundation.pronunciation, true, pronunciationAssetRegistry);
    expect(pronunciation).toMatchObject({
      wordAudioUrls: [
        "/media/audio/words/feedback.mp3",
        "/media/audio/words/fine.mp3",
        "/media/audio/words/helpful.mp3"
      ]
    });
    expect(pronunciation).not.toHaveProperty("phonemeAudioId");
    expect(pronunciation).not.toHaveProperty("phonemeAudioUrl");
  });

  it("uses the same reviewed pronunciation data in baseline and strict modes", async () => {
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
    expect(baseline.generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content).toMatchObject({
      focus: "/aɪ/", words: [{ word: "might", ipa: "/maɪt/" }, { word: "time", ipa: "/taɪm/" }, { word: "clarify", ipa: "/ˈklærɪfaɪ/" }]
    });

    const strict = await run("strict");
    expect(strict.foundationAttempts).toBe(1);
    const strictPronunciation = strict.generated.lessons[0]?.parts.find((part) => part.code === "pronunciation")?.content;
    expect(strictPronunciation).toMatchObject({ focus: "/aɪ/" });
    expect(strictPronunciation).not.toHaveProperty("phonemeAudioId");
    expect(strictPronunciation).not.toHaveProperty("phonemeAudioUrl");
    expect(strict.generated.output).toHaveProperty("qualityMetrics.componentRetryCount", 0);
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

  it("preserves prompt-native A2 objectives within the two-attempt skill budget", async () => {
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
    expect(skillAttempts).toBe(2);
    expect(reviewAttempts).toBe(1);
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
    expect(generated.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "skills.reviewer", code: "AI_REVIEW_UNAVAILABLE" })
    ]));
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

  it("accepts a complete natural passage outside the former narrow word target", async () => {
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

    expect(skillAttempts).toBe(1);
    expect(generated.failures).toEqual([]);
    expect(generated.lessons[0]?.parts.filter((part) => ["listening", "reading", "writing", "word_class", "word_use", "speaking"].includes(part.code))).toHaveLength(6);
  });

  it("keeps complete B1 passages that are longer than the beginner brevity target", async () => {
    let skillAttempts = 0;
    const b1Skills = {
      ...skills,
      writing: { ...skills.writing, type: "write", prompt: "Explain the invoice discrepancy.", answer: "The invoice quantity differs from the signed order." },
      speaking: { ...skills.speaking, prompt: "Explain the invoice discrepancy to the supplier." },
      listening: {
        ...skills.listening,
        body: "The client called accounts this morning because the invoice showed one hundred units, but their signed purchase order clearly showed only eighty units.",
        prompt: "What can we infer accounts should verify?",
        option1: "The invoice quantity", option2: "The office address", option3: "The meeting room", option4: "The delivery colour",
        answer: "The invoice quantity"
      },
      reading: {
        ...skills.reading,
        body: "Our records show eighty units on the signed purchase order, while the supplier invoice lists one hundred units. The accounts assistant checked both documents and asked the supplier to confirm the correct quantity before payment.",
        prompt: "Why did the assistant most likely contact the supplier?",
        option1: "To resolve a mismatch before payment", option2: "To reserve a meeting room", option3: "To change the office address", option4: "To choose a delivery colour",
        answer: "To resolve a mismatch before payment"
      }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
      if (taskId === "weekly_lesson_skills") {
        skillAttempts += 1;
        return { output: withEnglishSkillsCopy(b1Skills), metadata };
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

  it("allows a clear direct-detail comprehension question at B1+", async () => {
    let skillAttempts = 0;
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
          { ...foundation.objective.items[0]!, text: "By the end of this lesson, you will be able to propose one response to a connection failure.", action_verb: "propose", condition: "during a video call", criterion: "one workable response", assessed_by: "speaking", success_evidence: "The response includes one workable action", assessmentCode: "speaking" },
          { ...foundation.objective.items[1]!, text: "By the end of this lesson, you will be able to paraphrase one technical update using cautious language.", action_verb: "paraphrase", target_language: ["may have"], condition: "after hearing an update", criterion: "one accurate paraphrase", assessed_by: "listening", success_evidence: "The answer restates the update accurately", assessmentCode: "listening" },
          { ...foundation.objective.items[1]!, id: "L2", text: "By the end of this lesson, you will be able to adapt one follow-up request for a client call.", action_verb: "adapt", target_language: ["Could we...?"], condition: "when the connection fails", criterion: "one diplomatic request", assessed_by: "speaking", success_evidence: "The response includes a diplomatic request", assessmentCode: "speaking" }
        ]
      }
    };
    const directDetailSkills = {
      ...skills,
      listening: { ...skills.listening, body: "During the client call, Minh restarted the office router after the video froze twice. The connection returned, but he asked IT to investigate the underlying fault.", prompt: "Who restarted the router?" },
      reading: { ...skills.reading, body: "Lan completed the revised report after checking the figures with finance. She sent it to the project manager on Tuesday morning, then asked the client to confirm whether the updated totals matched their records before the next review meeting.", prompt: "When did Lan send the report?" },
      writing: { ...skills.writing, type: "write", prompt: "Explain the likely connection problem.", answer: "The router may have restarted." },
      speaking: { ...skills.speaking, prompt: "Present the diagnosis, give one reason, name a deadline, and propose a follow-up.", answer: "The router may have failed, so I will follow up by Friday." }
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      if (taskId === "weekly_lesson_grammar_classifier") return { output: noSuitableContent, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: withEnglishFoundationCopy(b2Foundation), metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: withEnglishVocabularyCopy(vocabularyForDay(dayNumber)), metadata };
      if (taskId === "weekly_lesson_skills") {
        skillAttempts += 1;
        return { output: withEnglishSkillsCopy(directDetailSkills), metadata };
      }
      if (taskId === "weekly_lesson_skills_reviewer") return { output: approvedSkillsReview, metadata };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const generated = await generateWeeklyLessons(
      {
        weekNumber: 1, topic: "Joining a video call", description: "Handle a connection problem",
        objectives: "Explain a likely cause and agree a follow-up", keyVocabHint: "router, connection, follow-up",
        plan: { B2: ["diagnose a connection problem", "two", "three", "four", "five"] }
      } as ContentWeekInput,
      "B2", { prompt: "Generate lessons." }, { runTask } as unknown as AiTaskRunner,
      { dayNumbers: [1], qualityReview: true }
    );

    expect(skillAttempts).toBe(1);
    expect(generated.failures.some((failure) => failure.component === "skills.comprehension")).toBe(false);
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
      if (taskId === "weekly_lesson_foundation") return { output: withEnglishFoundationCopy(foundation), metadata };
      if (taskId === "weekly_lesson_vocabulary") return { output: withEnglishVocabularyCopy(vocabularyForDay(dayNumber)), metadata };
      if (taskId === "weekly_lesson_skills") return { output: withEnglishSkillsCopy(b1Skills), metadata };
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

    expect(foundationAttempts).toBe(2);
    expect(generated.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ dayNumber: 1, component: "objectives", code: "AI_OUTPUT_INVALID" })
    ]));
    expect(generated.lessons[0]?.parts.some((part) => part.code === "vocabulary")).toBe(true);
    expect(generated.lessons[0]?.parts.some((part) => part.code === "objective")).toBe(false);
  });


  it("generates the five vocabulary drafts sequentially inside one level job", async () => {
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
    expect(maxActiveVocabularyCalls).toBe(1);
  });

  it("decomposes one level into three small strict calls per day and merges all learner sections", async () => {
    let activeSkillCalls = 0;
    let maxActiveSkillCalls = 0;
    const runTask = vi.fn(async (
      taskId: string,
      _input: unknown,
      _options?: { systemPrompt?: string; maxOutputTokens?: number }
    ) => {
      if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
      if (taskId === "weekly_lesson_objectives") return { output: { objective: foundation.objective }, metadata };
      if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
      if (taskId === "weekly_lesson_vocabulary") {
        return { output: vocabularyForDay((_input as { dayNumber: number }).dayNumber), metadata };
      }
      if (["weekly_lesson_comprehension", "weekly_lesson_language_practice", "weekly_lesson_speaking"].includes(taskId)) {
        activeSkillCalls += 1;
        maxActiveSkillCalls = Math.max(maxActiveSkillCalls, activeSkillCalls);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeSkillCalls -= 1;
        if (taskId === "weekly_lesson_comprehension") return { output: { listening: skills.listening, reading: skills.reading }, metadata };
        if (taskId === "weekly_lesson_language_practice") return { output: { writing: skills.writing, wordClass: skills.wordClass, wordUse: skills.wordUse }, metadata };
        return { output: { speaking: skills.speaking }, metadata };
      }
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

    const generated = await generateWeeklyLessonsImpl(week, "A1", { prompt: "Generate lessons." }, runner);

    expect(runTask).toHaveBeenCalledTimes(35);
    expect(maxActiveSkillCalls).toBe(2);
    expect(runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_comprehension")).toHaveLength(5);
    expect(runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_language_practice")).toHaveLength(5);
    expect(runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_speaking")).toHaveLength(5);
    expect(runTask.mock.calls.slice(0, 5).every((call) => call[2]?.maxOutputTokens === 1_000)).toBe(true);
    expect(runTask.mock.calls.slice(0, 5).every((call) => call[2]?.systemPrompt?.includes("incidental"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.maxOutputTokens === 1_800)).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("objective.items must contain 2-4 measurable objectives"))).toBe(true);
    expect(runTask.mock.calls.slice(5, 10).every((call) => call[2]?.systemPrompt?.includes("action_verb must be exactly one of: nói"))).toBe(true);
    expect(runTask.mock.calls.slice(10, 15).every((call) => call[2]?.maxOutputTokens === 2_200)).toBe(true);
    expect(runTask.mock.calls.slice(10, 15).every((call) => call[2]?.systemPrompt?.includes("grammar.usage must be exactly one short sentence"))).toBe(true);
    expect(runTask.mock.calls.slice(10, 15).every((call) => call[2]?.systemPrompt?.includes("title must name the concrete sentence frame"))).toBe(true);
    const comprehensionCalls = runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_comprehension");
    const languagePracticeCalls = runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_language_practice");
    const speakingCalls = runTask.mock.calls.filter((call) => call[0] === "weekly_lesson_speaking");
    expect(comprehensionCalls.every((call) => call[2]?.maxOutputTokens === 1_800)).toBe(true);
    expect(languagePracticeCalls.every((call) => call[2]?.maxOutputTokens === 2_200)).toBe(true);
    expect(speakingCalls.every((call) => call[2]?.maxOutputTokens === 900)).toBe(true);
    expect(comprehensionCalls.every((call) => call[2]?.systemPrompt?.includes("Listening body:"))).toBe(true);
    expect(comprehensionCalls.every((call) => !call[2]?.systemPrompt?.includes("writing.type"))).toBe(true);
    expect(comprehensionCalls.every((call) => !call[2]?.systemPrompt?.includes("Speaking prompt"))).toBe(true);
    expect(languagePracticeCalls.every((call) => call[2]?.systemPrompt?.includes("writing.type"))).toBe(true);
    expect(languagePracticeCalls.every((call) => !call[2]?.systemPrompt?.includes("Listening body:"))).toBe(true);
    expect(languagePracticeCalls.every((call) => !call[2]?.systemPrompt?.includes("Speaking prompt"))).toBe(true);
    expect(speakingCalls.every((call) => call[2]?.systemPrompt?.includes("Speaking prompt"))).toBe(true);
    expect(speakingCalls.every((call) => !call[2]?.systemPrompt?.includes("reading body"))).toBe(true);
    expect(speakingCalls.every((call) => !call[2]?.systemPrompt?.includes("four short English options"))).toBe(true);
    expect(runTask.mock.calls.slice(15, 20).every((call) => call[2]?.systemPrompt?.includes("partOfSpeech"))).toBe(true);
    expect(runTask.mock.calls.slice(15, 20).every((call) => call[2]?.systemPrompt?.includes("no icons, logos, diagrams, screenshots, charts, or text-heavy images"))).toBe(true);
    expect(runTask.mock.calls.slice(15, 20).every((call) =>
      (call[1] as { excludedVocabulary: string[] }).excludedVocabulary.length === 0
    )).toBe(true);
    expect(generated.lessons).toHaveLength(5);
    expect(generated.lessons.map((lesson) => lesson.dayNumber)).toEqual([1, 2, 3, 4, 5]);
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
    expect(generated.result.metadata.usage).toEqual({
      inputTokens: 3_500, outputTokens: 7_000, totalTokens: 10_500,
      cacheCreationInputTokens: 350, cacheReadInputTokens: 700
    });
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

    expect(foundationAttempts).toBeGreaterThanOrEqual(2);
    expect(runTask.mock.calls.find((call) => call[0] === "weekly_lesson_foundation" && call[2]?.systemPrompt?.includes("REPAIR REQUIRED"))?.[2]?.systemPrompt)
      .toContain("justify, negotiate, handle, propose");
  });

  it("uses one targeted repair for a vocabulary component before preserving the partial lesson", async () => {
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
    expect(vocabularyAttempts).toBe(2);
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

  it("retries duplicate vocabulary for different days sequentially", async () => {
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

    expect(maxRunningRetries).toBe(1);
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

  it("keeps all five days in one level job while bounding independent subgroup calls to two", async () => {
    let active = 0;
    let peak = 0;
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      const dayNumber = (input as { dayNumber: number }).dayNumber;
      active += 1;
      peak = Math.max(peak, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (taskId === "weekly_lesson_grammar_classifier") return { output: grammarClassification, metadata };
        if (taskId === "weekly_lesson_objectives") return { output: { objective: foundation.objective }, metadata };
        if (taskId === "weekly_lesson_foundation") return { output: foundation, metadata };
        if (taskId === "weekly_lesson_vocabulary") return { output: vocabularyForDay(dayNumber), metadata };
        if (taskId === "weekly_lesson_comprehension") return { output: { listening: skills.listening, reading: skills.reading }, metadata };
        if (taskId === "weekly_lesson_language_practice") return { output: { writing: skills.writing, wordClass: skills.wordClass, wordUse: skills.wordUse }, metadata };
        if (taskId === "weekly_lesson_speaking") return { output: { speaking: skills.speaking }, metadata };
        throw new Error(`UNEXPECTED_TASK:${taskId}`);
      } finally {
        active -= 1;
      }
    });
    const week = {
      weekNumber: 1,
      topic: "Giving project updates",
      description: "Report progress",
      objectives: "Report progress and risks",
      keyVocabHint: "status, blocker, deadline",
      plan: { A1: ["day one", "day two", "day three", "day four", "day five"] }
    } as ContentWeekInput;

    const generated = await generateWeeklyLessonsImpl(
      week,
      "A1",
      { prompt: "Generate lessons." },
      { runTask } as unknown as AiTaskRunner,
      { qualityReview: false }
    );

    expect(generated.lessons).toHaveLength(5);
    expect(generated.lessons.map((lesson) => lesson.dayNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
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
