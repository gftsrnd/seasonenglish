import { describe, expect, it, vi } from "vitest";
import type { AiTaskRunner } from "@e4s/ai";
import { LESSON_INSTRUCTION_STEP_MAX_WORDS, standardLessonInstruction, weeklyLessonFoundationBodyOutputJsonSchema } from "@e4s/ai";
import {
  assembleAndValidateWeeklyLesson,
  boundedVocabularyHistory,
  buildPartialLessonFromPipelineState,
  deterministicSkillsFindings,
  generateWeeklyLessonFoundation,
  generateWeeklyLessonDayPipeline,
  generateWeeklyLessonLevelPipeline,
  generateWeeklyLessons,
  generateWeeklyLessonGrammarClassification,
  generateWeeklyLessonObjectives,
  generateWeeklyLessonSkillGroup,
  generateWeeklyLessonVocabulary,
  isVietnameseVocabularyMeaning,
  isProviderUnavailableFailure,
  objectiveAssessmentShapeMismatch,
  objectiveIdsFromIssues,
  reviewWeeklyLessonSkills,
  runWeeklyLessonLevelBatch,
  validateWeeklyLessonPipelineState,
  validateWeeklyVocabularyCrossDayUniqueness,
  validateWeeklyVocabularyLexicalCoverage,
  preservedWeeklyVocabulary,
  weeklyLessonRunMetadataSeed,
  weeklyLessonSkillsGenerationConstraints,
  type WeeklyLessonComponentInput,
  type WeeklyLessonObjectivesInput,
  type WeeklyLessonPipelineCheckpoint,
  type WeeklyLessonSkillsInput
} from "./weekly-generation.js";
import { lessonComponentsNeedingRepair } from "./enrichment.js";
import { curatedRelationEvidence } from "./lexical-relations.js";

vi.mock("@e4s/ai", async () => await import("../../../../../packages/ai/src/index.js"));

const metadata = {
  traceId: "trace-component", taskId: "component", provider: "anthropic", model: "test-model",
  attempts: 1, latencyMs: 10, inputHash: "hash", schemaValid: true,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
};

const levelCases = [
  { cefr: "A1", language: "vi", writingType: "mcq", contentVerb: "chọn", languageVerbs: ["nói"], objectiveCount: 2 },
  { cefr: "A2", language: "vi", writingType: "mcq", contentVerb: "mô tả", languageVerbs: ["dùng"], objectiveCount: 2 },
  { cefr: "B1", language: "en", writingType: "write", contentVerb: "summarize", languageVerbs: ["report", "suggest"], objectiveCount: 3 },
  { cefr: "B2", language: "en", writingType: "write", contentVerb: "summarize", languageVerbs: ["propose", "justify"], objectiveCount: 3 },
  { cefr: "C1", language: "en", writingType: "write", contentVerb: "mediate", languageVerbs: ["reframe", "tailor"], objectiveCount: 3 }
] as const;

type LevelCase = (typeof levelCases)[number];

const pronunciationPlan = {
  focus: "/aɪ/",
  word1: { word: "might", ipa: "/maɪt/" },
  word2: { word: "time", ipa: "/taɪm/" },
  word3: { word: "clarify", ipa: "/ˈklærɪfaɪ/" }
};

const grammarClassification = {
  status: "classified" as const,
  contentType: "sentence_pattern" as const,
  targetName: "Could you confirm + noun?",
  scope: "Could you confirm + noun?",
  support: "explicit" as const,
  confidence: "high" as const,
  evidence: [{ sourceRef: "lessonFocus", quote: "Could you confirm + noun?" }],
  rejectedCandidates: []
};

function inputFor(level: LevelCase): WeeklyLessonComponentInput {
  return {
    weekNumber: 1,
    topic: "Confirming a deadline",
    description: "Confirm a workplace deadline with a colleague.",
    objectives: "Confirm the deadline and next action.",
    keyVocabHint: "confirm, clarify, approve",
    cefr: level.cefr,
    dayNumber: 1,
    lessonFocus: "Could you confirm + noun?",
    allLessonFocuses: [
      "Could you confirm + noun?", "The deadline is + date", "I need to clarify + noun",
      "Could you approve + noun?", "We agreed to + verb"
    ]
  };
}

function objectiveFor(level: LevelCase): NonNullable<WeeklyLessonSkillsInput["lessonObjectives"]> {
  const vietnamese = level.language === "vi";
  const opener = vietnamese ? "Sau bài học, bạn có thể" : "By the end of this lesson, you will be able to";
  const items: NonNullable<WeeklyLessonSkillsInput["lessonObjectives"]>["items"] = [
    {
      id: "C1", type: "content",
      text: `${opener} ${level.contentVerb} ${vietnamese ? "thông tin về hạn chót" : "the confirmation details clearly"}.`,
      action_verb: level.contentVerb, target_language: null,
      condition: vietnamese ? "sau khi nghe thông báo" : "after hearing a confirmation request",
      criterion: vietnamese ? "một câu trả lời đúng" : "one accurate response",
      assessed_by: "listening",
      success_evidence: vietnamese ? "Câu trả lời xác định đúng hạn chót." : "The response identifies the confirmed information.",
      assessmentCode: "listening"
    },
    ...level.languageVerbs.map((verb, index) => ({
      id: `L${index + 1}`, type: "language" as const,
      text: `${opener} ${verb} ${vietnamese ? "một yêu cầu xác nhận rõ ràng" : "a clear confirmation request"}.`,
      action_verb: verb, target_language: ["Could you confirm the deadline?"],
      condition: vietnamese ? "khi trao đổi với đồng nghiệp" : "when speaking with a colleague",
      criterion: vietnamese ? "một câu hoàn chỉnh" : "one complete sentence",
      assessed_by: "speaking",
      success_evidence: vietnamese ? "Câu trả lời dùng mẫu câu mục tiêu." : "The response uses the target frame.",
      assessmentCode: "speaking" as const
    }))
  ];
  return {
    title: vietnamese ? "Mục tiêu bài học" : "Learning objectives",
    explanationLanguage: level.language,
    lesson_goal: vietnamese ? "Xác nhận hạn chót trong công việc." : "Confirm a workplace deadline clearly.",
    assessment_gap: null,
    items
  };
}

function foundationFor(level: LevelCase) {
  const vietnamese = level.language === "vi";
  return {
    title: "Could you confirm + noun?",
    durationMinutes: 10,
    instruction: vietnamese
      ? { title: "Hướng dẫn làm bài", step1: "Nghe câu mẫu.", step2: "Đọc mẫu câu.", step3: "Nói câu trả lời." }
      : { title: "Instructions", step1: "Listen to the model.", step2: "Read the sentence frame.", step3: "Give your response." },
    grammar: {
      title: "Could you confirm + noun?", contentType: "sentence_pattern", targetName: "Could you confirm + noun?",
      scope: "Could you confirm + noun?", formula: "Could you confirm + noun?",
      usage: vietnamese ? "Dùng mẫu câu này để xác nhận thông tin." : "Use this frame to confirm workplace information.",
      example1: "Could you confirm the deadline?", example2: "Could you confirm the meeting?"
    },
    pronunciation: {
      title: vietnamese ? "Phát âm" : "Pronunciation", focus: pronunciationPlan.focus,
      tip: vietnamese ? "Mở miệng rồi lướt âm lên nhẹ nhàng." : "Open the mouth and glide the sound upward.",
      word1: pronunciationPlan.word1, word2: pronunciationPlan.word2, word3: pronunciationPlan.word3
    }
  };
}

function vocabularyItem(
  word: "confirm" | "clarify" | "approve",
  pronunciation: string,
  meaning: string,
  family: string,
  synonym: string
) {
  const sibling = ({ confirm: "meeting", clarify: "question", approve: "decision" } as const)[word];
  return {
    word, partOfSpeech: "verb", pronunciation, stress: "first syllable", ttsText: word,
    ssml: `<speak>${word}</speak>`, meaning, imageQuery: `${word} workplace conversation photo`,
    collocation1: `${word} details`, collocation2: `${word} a request`, collocation3: `${word} today`,
    family1: { word: family, type: "noun", meaning: `danh từ của ${word}` }, family2: null,
    umbrellaWord: "workplace communication", umbrellaMeaning: "giao tiếp công việc",
    sibling1: { word: sibling, meaning: "từ cùng nhóm" }, sibling2: null, sibling3: null,
    synonym1: {
      word: synonym, level: "A2", note: "same workplace sense", partOfSpeech: "verb",
      sense: `to ${word} information`, example: `We ${synonym} the details today.`
    },
    synonym2: null, antonym1: null
  };
}

function vocabularyFor(level: LevelCase) {
  const approve = vocabularyItem("approve", "/əˈpruːv/", "phê duyệt", "approval", "authorize");
  return {
    title: level.language === "vi" ? "Từ vựng" : "Vocabulary",
    word1: vocabularyItem("confirm", "/kənˈfɜːm/", "xác nhận", "confirmation", "verify"),
    word2: vocabularyItem("clarify", "/ˈklærɪfaɪ/", "làm rõ", "clarification", "explain"),
    word3: {
      ...approve,
      antonym1: {
        word: "reject", level: "A2", note: "opposite decision in the same workplace sense", partOfSpeech: "verb",
        sense: "refuse to approve", example: "The manager may reject the request."
      }
    }
  };
}

/** Gives sequence tests distinct learner-facing cards without changing their focus assertions. */
function vocabularyForDay(level: LevelCase, dayNumber: number) {
  const base = vocabularyFor(level);
  if (dayNumber === 1) return base;
  const marker = ["alpha", "bravo", "charlie", "delta", "echo"][dayNumber - 1]!;
  const mark = (word: string) => `${word}-${marker}`;
  const item = (source: typeof base.word1 | typeof base.word3) => ({
    ...source,
    word: mark(source.word),
    ttsText: mark(source.word),
    ssml: `<speak>${mark(source.word)}</speak>`,
    family1: source.family1 ? { ...source.family1, word: mark(source.family1.word) } : null,
    synonym1: source.synonym1 ? { ...source.synonym1, word: mark(source.synonym1.word), example: `We use ${mark(source.synonym1.word)} today.` } : null,
    antonym1: source.antonym1 ? { ...source.antonym1, word: mark(source.antonym1.word), example: `We avoid ${mark(source.antonym1.word)} today.` } : null,
    sibling1: source.sibling1 ? { ...source.sibling1, word: mark(source.sibling1.word) } : null
  });
  return { ...base, word1: item(base.word1), word2: item(base.word2), word3: item(base.word3) };
}

function choice(level: LevelCase, title: string, body: string, prompt: string, answer: string, options: string[]) {
  const vietnamese = level.language === "vi";
  return {
    title, body, prompt,
    option1: options[0]!, option2: options[1]!, option3: options[2]!, option4: options[3]!, answer,
    hint: vietnamese ? "Nghe hoặc đọc để tìm thông tin chính." : "Use the context to identify the key detail.",
    questionTranslation: vietnamese ? "Thông tin chính là gì?" : prompt,
    answerTranslation: vietnamese ? "Câu trả lời đúng." : answer
  };
}

function skillsFor(level: LevelCase) {
  const vietnamese = level.language === "vi";
  const constraints = weeklyLessonSkillsGenerationConstraints(level.cefr);
  const padTo = (value: string, minimum: number) => {
    const words = value.trim().split(/\s+/);
    while (words.length < minimum) words.push("today");
    return words.join(" ");
  };
  const comprehension = {
    listening: choice(
      level, vietnamese ? "Nghe" : "Listening",
      padTo("Mina confirms the project deadline with her colleague before the client meeting on Friday.", constraints.listeningWordMin),
      "When is the client meeting?", "Friday", ["Friday", "Monday", "Tuesday", "Thursday"]
    ),
    reading: choice(
      level, vietnamese ? "Đọc" : "Reading",
      padTo("After checking the calendar, Mina sends an update and asks the team to approve the revised schedule.", constraints.readingWordMin),
      "What does Mina send?", "An update", ["An update", "An invoice", "A contract", "A map"]
    )
  };
  const writing = level.writingType === "mcq"
    ? {
        title: "Viết", type: "mcq", prompt: "Which sentence confirms the deadline?",
        option1: "I can confirm Friday.", option2: "Please open the window.", option3: "The room is upstairs.", option4: "Call the supplier.",
        answer: "I can confirm Friday.", hint: "Chọn câu xác nhận thời gian.",
        questionTranslation: "Câu nào xác nhận hạn chót?", answerTranslation: "Tôi có thể xác nhận thứ Sáu."
      }
    : {
        title: "Writing", type: "write", prompt: "Confirm the deadline and state one next action.",
        option1: null, option2: null, option3: null, option4: null,
        answer: "I can confirm Friday, and I will update the client.",
        hint: "Include the date and one clear next action.",
        questionTranslation: "Confirm the deadline and state one next action.",
        answerTranslation: "I can confirm Friday, and I will update the client."
      };
  const languagePractice = {
    writing,
    wordClass: {
      ...choice(level, vietnamese ? "Từ loại" : "Word class", "", "What word class is confirm?", "verb", ["verb", "noun", "adjective", "adverb"]),
      body: undefined
    },
    wordUse: {
      ...choice(level, vietnamese ? "Dùng từ" : "Word use", "", "Which phrase uses confirm naturally?", "confirm the deadline", ["confirm the deadline", "confirm loudly blue", "confirm under quickly", "confirm very desk"]),
      body: undefined
    }
  };
  const speaking = {
    speaking: {
      title: vietnamese ? "Nói" : "Speaking",
      prompt: vietnamese ? "Xác nhận hạn chót bằng một câu tiếng Anh." : "Confirm the deadline and give one next action.",
      answer: "Could you confirm the deadline? I will update the client.",
      hint: vietnamese ? "Bắt đầu bằng I can confirm." : "State the date before the next action.",
      questionTranslation: vietnamese ? "Xác nhận hạn chót." : "Confirm the deadline and give one next action.",
      answerTranslation: vietnamese ? "Tôi có thể xác nhận thứ Sáu." : "I can confirm Friday and update the client."
    }
  };
  return { comprehension, languagePractice, speaking };
}

const approvedReview = {
  status: "approved" as const,
  findings: [],
  solvedAnswers: {
    listening: "Friday", reading: "An update", writing: "I can confirm Friday.",
    wordClass: "verb", wordUse: "confirm the deadline"
  }
};

function objectivesInput(level: LevelCase) {
  return { ...inputFor(level), grammarClassification, pronunciationPlan };
}

function skillsInput(level: LevelCase): WeeklyLessonSkillsInput {
  return {
    ...inputFor(level), grammarFormula: "Could you confirm + noun?",
    grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"],
    vocabularyWords: ["confirm", "clarify", "approve"],
    generationConstraints: weeklyLessonSkillsGenerationConstraints(level.cefr)
  };
}

function runnerWith(outputs: Record<string, unknown>, calls: string[] = []) {
  const runTask = vi.fn(async (taskId: string, _input?: unknown, _options?: { systemPrompt?: string }) => {
    calls.push(taskId);
    if (!(taskId in outputs)) throw new Error(`UNEXPECTED_TASK:${taskId}`);
    return { output: outputs[taskId], metadata: { ...metadata, taskId } };
  });
  return { runner: { runTask } as unknown as AiTaskRunner, runTask };
}

function sequencedRunner(taskId: string, outputs: unknown[]) {
  let index = 0;
  const runTask = vi.fn(async (receivedTaskId: string) => {
    if (receivedTaskId !== taskId) throw new Error(`UNEXPECTED_TASK:${receivedTaskId}`);
    const output = outputs[Math.min(index, outputs.length - 1)];
    index += 1;
    return { output, metadata: { ...metadata, taskId } };
  });
  return { runner: { runTask } as unknown as AiTaskRunner, runTask };
}

describe("direct weekly-generation component contracts", () => {
  it("treats a fully resumed checkpoint set as a successful zero-provider run", () => {
    expect(weeklyLessonRunMetadataSeed([], 3, "A1")).toMatchObject({
      taskId: "weekly_lessons",
      provider: "checkpoint",
      attempts: 0,
      schemaValid: true,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    });
  });
  it("bounds vocabulary history below the AI input schema limit", () => {
    const history = Array.from({ length: 140 }, (_, index) => `word-${index + 1}`);

    const bounded = boundedVocabularyHistory(history);

    expect(bounded).toHaveLength(80);
    expect(bounded[0]).toBe("word-61");
    expect(bounded.at(-1)).toBe("word-140");
  });
  it("scopes grammar classification to the current day instead of borrowing another day", async () => {
    const level = levelCases[1];
    const input = inputFor(level);
    const runTask = vi.fn(async (taskId: string, received: WeeklyLessonComponentInput) => {
      expect(taskId).toBe("weekly_lesson_grammar_classifier");
      expect(received.topic).toBe(input.lessonFocus);
      expect(new Set(received.allLessonFocuses)).toEqual(new Set([input.lessonFocus]));
      return { output: grammarClassification, metadata: { ...metadata, taskId } };
    });

    await generateWeeklyLessonGrammarClassification(input, { runTask } as unknown as AiTaskRunner, { qualityReview: true });
  });

  it("rejects disjoint language objectives mapped to the same single exercise", async () => {
    const level = levelCases[4];
    const objective = objectiveFor(level);
    objective.items[2] = {
      ...objective.items[2]!,
      target_language: ["Thanks for joining us, Maria, from Finance."],
      assessmentCode: objective.items[1]!.assessmentCode
    };
    const { runner } = runnerWith({ weekly_lesson_objectives: { objective } });

    await expect(generateWeeklyLessonObjectives(
      objectivesInput(level),
      "Generate objectives.",
      runner
    )).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
      issues: [expect.objectContaining({ message: expect.stringContaining("objective_conflicting_assessment_targets") })]
    });
  });

  it("does not treat one generic shared word as compatible objectives for one exercise", async () => {
    const level = levelCases[4];
    const objective = objectiveFor(level);
    objective.items[1] = {
      ...objective.items[1]!,
      target_language: ["If I may come back to that point"],
      assessmentCode: "word_use"
    };
    objective.items[2] = {
      ...objective.items[2]!,
      target_language: ["Let's hold that point until after the update"],
      assessmentCode: "word_use"
    };
    const { runner } = runnerWith({ weekly_lesson_objectives: { objective } });

    await expect(generateWeeklyLessonObjectives(
      objectivesInput(level),
      "Generate objectives.",
      runner
    )).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
      issues: [expect.objectContaining({ message: expect.stringContaining("objective_conflicting_assessment_targets") })]
    });
  });

  it("accepts one realized modal-perfect alternative without requiring placeholder words", async () => {
    const level = levelCases[3];
    const base = skillsFor(level).languagePractice;
    const output = {
      ...base,
      wordUse: {
        ...base.wordUse,
        prompt: "The router updated during the call. Which sentence gives a cautious past cause?",
        option1: "The router might have restarted during the update.",
        option2: "The router is restarting tomorrow.",
        option3: "The router restarts every day.",
        option4: "The router will restart next week.",
        answer: "The router might have restarted during the update."
      }
    };
    const lessonObjectives = {
      ...objectiveFor(level),
      items: [{
        ...objectiveFor(level).items[1]!,
        id: "L1",
        assessmentCode: "word_use" as const,
        target_language: [
          "may have + past participle",
          "might have + past participle",
          "could have + past participle"
        ]
      }]
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_language_practice: output });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.languagePractice",
      { ...skillsInput(level), lessonObjectives },
      runner
    );

    expect(result.output.wordUse?.answer).toBe("The router might have restarted during the update.");
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("accepts a realized reporting-passive alternative without the clause placeholder", async () => {
    const level = levelCases[3];
    const base = skillsFor(level).languagePractice;
    const output = {
      ...base,
      wordUse: {
        ...base.wordUse,
        prompt: "The team decided to move the launch to May. Which sentence reports that decision correctly?",
        option1: "It was decided that the launch will move to May.",
        option2: "It decided the launch to May.",
        option3: "The launch deciding May.",
        option4: "It was decide that May.",
        answer: "It was decided that the launch will move to May."
      }
    };
    const lessonObjectives = {
      ...objectiveFor(level),
      items: [{
        ...objectiveFor(level).items[1]!,
        id: "L1",
        assessmentCode: "word_use" as const,
        target_language: [
          "It was decided that + clause",
          "It has been agreed that + clause"
        ]
      }]
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_language_practice: output });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.languagePractice",
      { ...skillsInput(level), lessonObjectives },
      runner
    );

    expect(result.output.wordUse?.answer).toBe("It was decided that the launch will move to May.");
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("uses a distinct progressive skill policy for every CEFR level", () => {
    const policies = levelCases.map((level) => weeklyLessonSkillsGenerationConstraints(level.cefr));

    expect(policies.map((policy) => policy.readingWordMax)).toEqual([30, 40, 70, 100, 140]);
    expect(policies.map((policy) => policy.inferenceRequired)).toEqual([false, false, false, true, true]);
    expect(policies.map((policy) => policy.speakingConstraintCount)).toEqual([0, 1, 1, 2, 3]);
  });

  it("recognizes compact Vietnamese dictionary meanings", () => {
    expect(isVietnameseVocabularyMeaning("tên")).toBe(true);
    expect(isVietnameseVocabularyMeaning("nhóm, đội")).toBe(true);
    expect(isVietnameseVocabularyMeaning("tham gia")).toBe(true);
    expect(isVietnameseVocabularyMeaning("loa")).toBe(true);
    expect(isVietnameseVocabularyMeaning("xin lỗi, xin nhắc lại (dùng khi chưa nghe rõ)")).toBe(true);
    expect(isVietnameseVocabularyMeaning("to confirm")).toBe(false);
    expect(isVietnameseVocabularyMeaning("a telephone conversation")).toBe(false);
  });

  it.each(levelCases)("revalidates every persisted $cefr component with the current policy", (level) => {
    const generated = skillsFor(level);
    const findings = validateWeeklyLessonPipelineState(inputFor(level), {
      grammarClassification,
      objectives: { objective: objectiveFor(level) },
      foundation: foundationFor(level),
      vocabulary: vocabularyFor(level),
      skills: { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking } as never,
      reviewer: approvedReview
    });

    expect(findings).toEqual([]);
  });

  it("rewinds every downstream checkpoint when resumed grammar is no longer semantically valid", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const unavailableGrammar = {
      status: "no_suitable_content" as const,
      contentType: null,
      targetName: null,
      scope: null,
      support: "none" as const,
      confidence: "low" as const,
      evidence: [],
      rejectedCandidates: []
    };
    const unavailableFoundation = {
      ...foundationFor(level),
      title: null,
      grammar: null
    };
    const calls: string[] = [];
    const { runner, runTask } = runnerWith({
      weekly_lesson_grammar_classifier: grammarClassification,
      weekly_lesson_objectives: { objective: objectiveFor(level) },
      weekly_lesson_foundation: foundationFor(level),
      weekly_lesson_vocabulary: vocabularyFor(level),
      weekly_lesson_comprehension: generated.comprehension,
      weekly_lesson_language_practice: generated.languagePractice,
      weekly_lesson_speaking: generated.speaking,
      weekly_lesson_skills_reviewer: approvedReview
    }, calls);

    const result = await generateWeeklyLessonDayPipeline(
      inputFor(level),
      "Generate one complete lesson.",
      runner,
      {
        resumeState: {
          grammarClassification: unavailableGrammar,
          objectives: { objective: objectiveFor(level) },
          foundation: unavailableFoundation,
          vocabulary: vocabularyFor(level),
          skills: { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking } as never,
          reviewer: approvedReview
        }
      }
    );

    expect(result.lesson.parts.find((part) => part.code === "grammar")?.content).toMatchObject({
      targetName: grammarClassification.targetName,
      formula: foundationFor(level).grammar?.formula
    });
    expect(calls).toEqual([
      "weekly_lesson_grammar_classifier",
      "weekly_lesson_objectives",
      "weekly_lesson_foundation",
      "weekly_lesson_vocabulary",
      "weekly_lesson_comprehension",
      "weekly_lesson_language_practice",
      "weekly_lesson_speaking",
      "weekly_lesson_skills_reviewer"
    ]);
    const comprehensionCall = runTask.mock.calls.find(([taskId]) => taskId === "weekly_lesson_comprehension");
    const reviewerCall = runTask.mock.calls.find(([taskId]) => taskId === "weekly_lesson_skills_reviewer");
    expect(comprehensionCall?.[1]).toMatchObject({
      lessonObjectives: objectiveFor(level), objectives: objectiveFor(level).lesson_goal
    });
    expect(reviewerCall?.[1]).toMatchObject({
      lessonObjectives: objectiveFor(level), objectives: objectiveFor(level).lesson_goal
    });
  });

  it("rejects a resumed grammar classification that borrowed evidence from another day", () => {
    const level = levelCases[1];
    const input = {
      ...inputFor(level),
      lessonFocus: "Join the video call, greet the team, and introduce your role",
      keyVocabHint: "join, greet, role",
      allLessonFocuses: [
        "Join the video call, greet the team, and introduce your role",
        "Check sound and video using can and cannot",
        "Ask a colleague to repeat information",
        "Share an update",
        "Close the call"
      ]
    };
    const staleClassification = {
      ...grammarClassification,
      targetName: "can / cannot for checking sound and video",
      scope: "Use can and cannot to check sound and video.",
      evidence: [{ sourceRef: "allLessonFocuses", quote: "Check sound and video using can and cannot" }]
    };

    const findings = validateWeeklyLessonPipelineState(input, {
      grammarClassification: staleClassification
    });

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "grammarClassification", path: ["evidence"] })
    ]));
  });

  it("applies reviewer repair only to the flagged atomic exercise", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const originalSkills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const repairedListening = {
      ...generated.comprehension.listening,
      title: "Nghe: Hạn chót đã sửa"
    };
    let reviewerAttempt = 0;
    const runTask = vi.fn(async (taskId: string, _input?: unknown, _options?: { systemPrompt?: string }) => {
      if (taskId === "weekly_lesson_listening_repair") {
        return {
          output: { listening: repairedListening },
          metadata: { ...metadata, taskId }
        };
      }
      if (taskId === "weekly_lesson_skills_reviewer") {
        reviewerAttempt += 1;
        return {
          output: reviewerAttempt === 1
            ? {
                status: "needs_revision",
                findings: [{ exerciseCode: "listening", reasonCode: "insufficient_context", message: "Listening needs a clearer context." }],
                solvedAnswers: approvedReview.solvedAnswers
              }
            : approvedReview,
          metadata: { ...metadata, taskId }
        };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonDayPipeline(
      inputFor(level),
      "Generate one complete lesson.",
      { runTask } as unknown as AiTaskRunner,
      {
        resumeState: {
          grammarClassification,
          objectives: { objective: objectiveFor(level) },
          foundation: foundationFor(level),
          vocabulary: vocabularyFor(level),
          skills: originalSkills as never
        }
      }
    );

    expect(result.lesson.parts.find((part) => part.code === "listening")?.title).toBe(repairedListening.title);
    expect(result.lesson.parts.find((part) => part.code === "reading")?.title).toBe(generated.comprehension.reading.title);
    expect(runTask.mock.calls.filter(([taskId]) => taskId === "weekly_lesson_listening_repair")).toHaveLength(1);
    expect(runTask.mock.calls.some(([taskId]) => taskId === "weekly_lesson_comprehension")).toBe(false);
    const completedState = result.checkpoints.findLast((checkpoint) => checkpoint.component === "assemble")!.state;
    expect(completedState.attemptsByComponent?.["skills.comprehension"]).toEqual({
      attempts: 2,
      semanticAttempts: 2
    });

    const resumedRunTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_skills_reviewer") {
        return {
          output: {
            status: "needs_revision",
            findings: [{ exerciseCode: "listening", reasonCode: "insufficient_context", message: "Listening still needs revision." }],
            solvedAnswers: approvedReview.solvedAnswers
          },
          metadata: { ...metadata, taskId }
        };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    completedState.reviewerRepairAttemptsByExercise = { listening: 3 };
    completedState.reviewerRepairPolicyVersion = "reviewer-repair-v29-alternative-target-wording";
    completedState.reviewer = undefined;

    await expect(generateWeeklyLessonDayPipeline(
      inputFor(level),
      "Generate one complete lesson.",
      { runTask: resumedRunTask } as unknown as AiTaskRunner,
      { resumeState: completedState }
    )).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
      details: expect.objectContaining({ reason: "exercise_attempt_limit_reached", semanticAttempts: 3 })
    });
    expect(resumedRunTask.mock.calls.filter(([taskId]) => taskId === "weekly_lesson_comprehension")).toHaveLength(0);
  });

  it("repairs multiple flagged exercises through separate provider schemas", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const repairedListening = { ...generated.comprehension.listening, title: "Nghe đã sửa" };
    const repairedReading = { ...generated.comprehension.reading, title: "Đọc đã sửa" };
    const runTask = vi.fn(async (taskId: string, _input: unknown, options?: { systemPrompt?: string }) => {
      if (taskId === "weekly_lesson_listening_repair") return { output: { listening: repairedListening }, metadata: { ...metadata, taskId } };
      if (taskId === "weekly_lesson_reading_repair") return { output: { reading: repairedReading }, metadata: { ...metadata, taskId } };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.comprehension",
      skillsInput(level),
      { runTask } as unknown as AiTaskRunner,
      {
        maxAttempts: 1,
        baseOutput: generated.comprehension,
        reviewerFindings: [
          { path: ["listening"], message: "Listening needs clearer evidence." },
          { path: ["reading"], message: "Reading needs clearer evidence." }
        ]
      }
    );

    expect(result.output).toEqual({ listening: repairedListening, reading: repairedReading });
    expect(runTask.mock.calls.map(([taskId]) => taskId)).toEqual([
      "weekly_lesson_listening_repair",
      "weekly_lesson_reading_repair"
    ]);
    for (const [, , options] of runTask.mock.calls) {
      expect(options?.systemPrompt).toContain("Return only the top-level field");
      expect(options?.systemPrompt).toContain("Do not return, copy, or rewrite any other exercise.");
      expect(options?.systemPrompt).toContain("copy the exact keyed answer text into the body");
      expect(options?.systemPrompt).toContain("never quote wording in the hint unless that exact wording exists in the body");
    }
  });

  it("discards a newly broken unrequested field from an atomic repair candidate", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const previous = generated.languagePractice;
    const candidateWordUse = {
      ...previous.wordUse,
      title: "Dùng từ đã sửa",
      hint: previous.wordUse.answer
    };
    const runTask = vi.fn(async (taskId: string, _input?: unknown, _options?: unknown) => {
      if (taskId === "weekly_lesson_word_use_repair") return {
        output: { wordUse: candidateWordUse },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.languagePractice",
      skillsInput(level),
      { runTask } as unknown as AiTaskRunner,
      {
        maxAttempts: 1,
        baseOutput: previous as never,
        reviewerFindings: [{ path: ["wordUse"], message: "feedback_mismatch: Repair the word-use item." }]
      }
    );

    expect(result.output.wordUse?.title).toBe(candidateWordUse.title);
    expect(result.output.wordUse?.hint).toBe(previous.wordUse.hint);
    expect(result.output.wordUse?.hint).not.toContain(previous.wordUse.answer);
  });

  it("includes the exact mapped target-language alternatives in an atomic repair prompt", async () => {
    const level = levelCases[2];
    const previous = skillsFor(level).languagePractice;
    const target = "confirm the deadline";
    const lessonObjectives = {
      ...objectiveFor(level),
      items: objectiveFor(level).items.map((item, index) => index === 1
        ? { ...item, assessmentCode: "word_use" as const, target_language: [target] }
        : item)
    };
    const runTask = vi.fn(async (taskId: string, _input?: unknown, _options?: { systemPrompt?: string }) => {
      if (taskId === "weekly_lesson_word_use_repair") return {
        output: { wordUse: previous.wordUse },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    await generateWeeklyLessonSkillGroup(
      "skills.languagePractice",
      { ...skillsInput(level), lessonObjectives },
      { runTask } as unknown as AiTaskRunner,
      {
        maxAttempts: 1,
        baseOutput: previous as never,
        reviewerFindings: [{ path: ["wordUse"], message: "The mapped target language is missing." }]
      }
    );

    const options = runTask.mock.calls[0]?.[2];
    expect(options?.systemPrompt).toContain("TARGET-LANGUAGE REQUIREMENT");
    expect(options?.systemPrompt).toContain(target);
    expect(options?.systemPrompt).toContain("Mapped objective contract for this exercise");
    expect(options?.systemPrompt).toContain("three distractors must each be grammatical");
  });

  it("recovers an atomic exercise that the provider wrapped in a malformed JSON string", async () => {
    const level = levelCases[3];
    const previous = skillsFor(level).languagePractice;
    const repaired = {
      ...previous.wordUse,
      title: "Recovered word use"
    };
    const malformed = JSON.stringify(repaired)
      .replace(/,"answer"/u, "},\"answer\"");
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_word_use_repair") return {
        output: { wordUse: malformed },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.languagePractice",
      skillsInput(level),
      { runTask } as unknown as AiTaskRunner,
      {
        maxAttempts: 1,
        baseOutput: previous as never,
        reviewerFindings: [{ path: ["wordUse", "title"], message: "Repair this word-use item." }]
      }
    );

    expect(result.output.wordUse?.title).toBe("Recovered word use");
  });

  it("salvages a structurally complete initial group and repairs only its semantic defect", async () => {
    const level = levelCases[1];
    const initial = skillsFor(level).languagePractice;
    const broken = {
      ...initial,
      wordUse: { ...initial.wordUse, hint: initial.wordUse.answer }
    };
    let repairCalls = 0;
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_language_practice") return {
        output: broken,
        metadata: { ...metadata, taskId }
      };
      if (taskId === "weekly_lesson_word_use_repair") {
        repairCalls += 1;
        return {
          output: { wordUse: initial.wordUse },
          metadata: { ...metadata, taskId }
        };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.languagePractice",
      skillsInput(level),
      { runTask } as unknown as AiTaskRunner
    );

    expect(repairCalls).toBe(1);
    expect(result.output.wordUse?.hint).toBe(initial.wordUse.hint);
    expect(result.output.writing).toEqual(initial.writing);
  });

  it("salvages valid siblings when one initial exercise is structurally invalid", async () => {
    const level = levelCases[4];
    const valid = skillsFor(level).comprehension;
    const broken = {
      ...valid,
      listening: {
        title: "Listening: not applicable",
        body: "Not applicable for this subgroup.",
        prompt: "Not applicable.",
        option1: "Not applicable",
        option2: "Not applicable",
        option3: "Not applicable",
        option4: "Not applicable"
      }
    };
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_comprehension") return {
        output: broken,
        metadata: { ...metadata, taskId }
      };
      if (taskId === "weekly_lesson_listening_repair") return {
        output: { listening: valid.listening },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.comprehension",
      skillsInput(level),
      { runTask } as unknown as AiTaskRunner
    );

    expect(result.output.listening).toEqual(valid.listening);
    expect(result.output.reading).toEqual(valid.reading);
    expect(runTask.mock.calls.map(([taskId]) => taskId)).toEqual([
      "weekly_lesson_comprehension",
      "weekly_lesson_listening_repair"
    ]);
  });

  it("uses the second attempt to repair only the invalid exercise from an initial skill group", async () => {
    const level = levelCases[2];
    const valid = skillsFor(level).languagePractice;
    const invalid = {
      ...valid,
      wordUse: {
        ...valid.wordUse,
        prompt: "Which phrase is natural?",
        option1: "clarify the issue",
        option2: "clarify the question",
        option3: "clarify the request",
        option4: "clarify the result",
        answer: "clarify the issue"
      }
    };
    const lessonObjectives = {
      ...objectiveFor(level),
      items: objectiveFor(level).items.map((item, index) => index === 1
        ? { ...item, assessmentCode: "word_use" as const, target_language: ["confirm the deadline"] }
        : item)
    };
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_language_practice") return {
        output: invalid,
        metadata: { ...metadata, taskId }
      };
      if (taskId === "weekly_lesson_word_use_repair") return {
        output: { wordUse: valid.wordUse },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.languagePractice",
      { ...skillsInput(level), lessonObjectives },
      { runTask } as unknown as AiTaskRunner
    );

    expect(runTask.mock.calls.map(([taskId]) => taskId)).toEqual([
      "weekly_lesson_language_practice",
      "weekly_lesson_word_use_repair"
    ]);
    expect(result.output.writing).toEqual(invalid.writing);
    expect(result.output.wordClass).toEqual(invalid.wordClass);
    expect(result.output.wordUse).toEqual(valid.wordUse);
  });

  it("gives speaking repair a participant and punctuation preflight", async () => {
    const level = levelCases[4];
    const previous = skillsFor(level).speaking;
    const runTask = vi.fn(async (taskId: string, _input?: unknown, _options?: unknown) => {
      if (taskId === "weekly_lesson_speaking_repair") return {
        output: { speaking: previous.speaking },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    await generateWeeklyLessonSkillGroup(
      "skills.speaking",
      skillsInput(level),
      { runTask } as unknown as AiTaskRunner,
      {
        maxAttempts: 1,
        baseOutput: previous,
        reviewerFindings: [{ path: ["speaking"], message: "The participant list is malformed." }]
      }
    );

    const options = runTask.mock.calls[0]?.[2] as { systemPrompt?: string; maxOutputTokens?: number } | undefined;
    expect(options?.systemPrompt).toContain("Count every named participant in the prompt and answer");
    expect(options?.systemPrompt).toContain("never place a semicolon inside a simple list of names");
    expect(options?.systemPrompt).toContain("Every cause, reason, review, decision basis, and background fact");
    expect(options?.maxOutputTokens).toBeGreaterThanOrEqual(1_500);
  });

  it("unwraps a duplicated exercise envelope from an atomic speaking repair", async () => {
    const level = levelCases[4];
    const previous = skillsFor(level).speaking;
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_speaking_repair") return {
        output: { speaking: { speaking: previous.speaking } },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.speaking",
      skillsInput(level),
      { runTask } as unknown as AiTaskRunner,
      {
        maxAttempts: 1,
        baseOutput: previous,
        reviewerFindings: [{ path: ["speaking"], message: "Repair the speaking exercise." }]
      }
    );

    expect(result.output.speaking).toMatchObject({
      title: previous.speaking.title,
      prompt: previous.speaking.prompt,
      answer: previous.speaking.answer
    });
    expect((result.output.speaking as { speaking?: unknown }).speaking).toBeUndefined();
  });

  it("accepts realized Should inversion and while contrast for notation-style speaking targets", async () => {
    const level = levelCases[4];
    const output = {
      speaking: {
        ...skillsFor(level).speaking.speaking,
        prompt: "Mediate between Maria and Tom. Use Should inversion and while or whereas.",
        answer: "While Maria wants speed, Tom needs more testing. Should testing run late, we could launch a limited beta."
      }
    };
    const lessonObjectives = {
      ...objectiveFor(level),
      items: [{
        ...objectiveFor(level).items[1]!,
        assessmentCode: "speaking" as const,
        text: "By the end of this lesson, you will be able to mediate using Should inversion and while or whereas.",
        target_language: [
          "Should + subject + verb (e.g., \"Should the client delay the launch, ...\")",
          "while / whereas (e.g., \"While the sales team wants speed, the engineers need more testing.\")"
        ],
        criterion: "Uses Should inversion and while or whereas accurately."
      }]
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_speaking: output });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.speaking",
      { ...skillsInput(level), lessonObjectives },
      runner
    );

    expect(result.output.speaking?.answer).toContain("Should testing run late");
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("accepts a realized reporting clause for notation-style word-use targets", async () => {
    const level = levelCases[4];
    const base = skillsFor(level).languagePractice;
    const output = {
      ...base,
      wordUse: {
        ...base.wordUse,
        prompt: "Which sentence correctly reports the decision?",
        option1: "It was agreed that we will cut travel costs.",
        option2: "It agreed that cutting travel costs.",
        option3: "It was agree that costs travel.",
        option4: "It was agreeing that travel costs.",
        answer: "It was agreed that we will cut travel costs."
      }
    };
    const lessonObjectives = {
      ...objectiveFor(level),
      items: [{
        ...objectiveFor(level).items[1]!,
        assessmentCode: "word_use" as const,
        text: "By the end of this lesson, you will be able to paraphrase decisions using a reporting frame or participle clause.",
        target_language: ["It was agreed that + clause", "Having + past participle, + clause", "Given + noun, + clause"],
        criterion: "Selects It was agreed that or a participle clause accurately."
      }]
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_language_practice: output });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.languagePractice",
      { ...skillsInput(level), lessonObjectives },
      runner
    );

    expect(result.output.wordUse?.answer).toBe("It was agreed that we will cut travel costs.");
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("does not restore a reviewer-rejected root exercise field during atomic repair", async () => {
    const level = levelCases[2];
    const previous = skillsFor(level).comprehension;
    const truncated = {
      ...previous,
      listening: { ...previous.listening, body: "Mina confirms the deadline. Tom replies, \"Not yet." }
    };
    const candidate = {
      ...previous.listening,
      body: "During an online team meeting, Tom says to Mina, \"Your microphone looks muted.\" Mina replies, \"Thanks, Tom. I'm trying to fix it now. Can you hear me?\" Tom answers, \"Not yet. Please turn on your microphone and try again.\" Mina is working on the problem right now.",
      prompt: "What is Mina doing right now?",
      option1: "Turning off her camera",
      option2: "Trying to fix her microphone",
      option3: "Leaving the meeting",
      option4: "Sharing her screen",
      answer: "Trying to fix her microphone"
    };
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_listening_repair") return {
        output: { listening: candidate },
        metadata: { ...metadata, taskId }
      };
      if (taskId === "weekly_lesson_length_repair") return {
        output: { listeningBody: candidate.body.split(" "), readingBody: null, speakingAnswer: null },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.comprehension",
      skillsInput(level),
      { runTask } as unknown as AiTaskRunner,
      {
        maxAttempts: 1,
        baseOutput: truncated,
        reviewerFindings: [{ path: ["listening"], message: "insufficient_context: the transcript is truncated." }]
      }
    );

    expect(result.output.listening?.body.split(/\s+/u).length).toBeGreaterThanOrEqual(21);
    expect(result.output.listening?.body.split(/\s+/u).length).toBeLessThanOrEqual(37);
    expect(result.output.listening?.body.match(/"/gu)).toHaveLength(4);
    expect(result.output.listening?.body).not.toBe(truncated.listening.body);
    expect(runTask.mock.calls.map(([taskId]) => taskId)).toEqual(["weekly_lesson_listening_repair", "weekly_lesson_length_repair"]);
  });

  it("checkpoints each successful atomic repair before starting the next flagged exercise", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const originalSkills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const repairedListening = { ...generated.comprehension.listening, title: "Nghe đã lưu riêng" };
    const checkpoints: WeeklyLessonPipelineCheckpoint[] = [];
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_skills_reviewer") return {
        output: {
          status: "needs_revision",
          findings: [
            { exerciseCode: "listening", reasonCode: "insufficient_context", message: "Listening needs clearer evidence." },
            { exerciseCode: "reading", reasonCode: "insufficient_context", message: "Reading needs clearer evidence." }
          ],
          solvedAnswers: approvedReview.solvedAnswers
        },
        metadata: { ...metadata, taskId }
      };
      if (taskId === "weekly_lesson_listening_repair") return {
        output: { listening: repairedListening },
        metadata: { ...metadata, taskId }
      };
      if (taskId === "weekly_lesson_reading_repair") throw new Error("READING_REPAIR_FAILED");
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    await expect(generateWeeklyLessonDayPipeline(
      inputFor(level),
      "Generate one complete lesson.",
      { runTask } as unknown as AiTaskRunner,
      {
        resumeState: {
          grammarClassification,
          objectives: { objective: objectiveFor(level) },
          foundation: foundationFor(level),
          vocabulary: vocabularyFor(level),
          skills: originalSkills as never
        },
        onCheckpoint: (checkpoint) => { checkpoints.push(checkpoint); }
      }
    )).rejects.toThrow("READING_REPAIR_FAILED");

    const savedListening = checkpoints.findLast((checkpoint) => checkpoint.component === "skills.comprehension");
    expect(savedListening?.state.skills?.listening?.title).toBe(repairedListening.title);
    expect(savedListening?.state.skills?.reading?.title).toBe(generated.comprehension.reading.title);
    expect(savedListening?.state.attemptsByExercise).toMatchObject({
      listening: { attempts: 2, semanticAttempts: 2 },
      reading: { attempts: 2, semanticAttempts: 2 }
    });

    const resumedRunTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_skills_reviewer") return {
        output: {
          status: "needs_revision",
          findings: [{ exerciseCode: "reading", reasonCode: "insufficient_context", message: "Reading still needs clearer evidence." }],
          solvedAnswers: approvedReview.solvedAnswers
        },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    savedListening!.state.reviewerRepairAttemptsByExercise = { reading: 3 };
    savedListening!.state.reviewerRepairPolicyVersion = "reviewer-repair-v29-alternative-target-wording";
    savedListening!.state.reviewer = undefined;
    await expect(generateWeeklyLessonDayPipeline(
      inputFor(level),
      "Generate one complete lesson.",
      { runTask: resumedRunTask } as unknown as AiTaskRunner,
      { resumeState: savedListening!.state }
    )).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
      details: expect.objectContaining({ reason: "exercise_attempt_limit_reached", semanticAttempts: 3 })
    });
    expect(resumedRunTask.mock.calls.some(([taskId]) => taskId === "weekly_lesson_reading_repair")).toBe(false);
  });

  it("allows a second reviewer-guided repair of the same exercise", async () => {
    const level = levelCases[2];
    const generated = skillsFor(level);
    const originalSkills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const incompleteListening = {
      ...generated.comprehension.listening,
      body: "Mina confirms the project deadline before Friday's client meeting. Tom replies, \"Not yet."
    };
    let reviewCalls = 0;
    let repairCalls = 0;
    let readingRepairCalls = 0;
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_skills_reviewer") {
        reviewCalls += 1;
        if (reviewCalls <= 2) return {
          output: {
            status: "needs_revision",
            findings: [{ exerciseCode: "listening", reasonCode: "insufficient_context", message: reviewCalls === 1 ? "Listening needs clearer evidence." : "Listening ends inside an unfinished quotation." }],
            solvedAnswers: approvedReview.solvedAnswers
          },
          metadata: { ...metadata, taskId }
        };
        if (reviewCalls === 3) return {
          output: {
            status: "needs_revision",
            findings: [{ exerciseCode: "reading", reasonCode: "insufficient_context", message: "Reading needs one clearer source sentence." }],
            solvedAnswers: approvedReview.solvedAnswers
          },
          metadata: { ...metadata, taskId }
        };
        return { output: approvedReview, metadata: { ...metadata, taskId } };
      }
      if (taskId === "weekly_lesson_listening_repair") {
        repairCalls += 1;
        return {
          output: { listening: repairCalls === 1 ? incompleteListening : generated.comprehension.listening },
          metadata: { ...metadata, taskId }
        };
      }
      if (taskId === "weekly_lesson_reading_repair") {
        readingRepairCalls += 1;
        return { output: { reading: generated.comprehension.reading }, metadata: { ...metadata, taskId } };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonDayPipeline(
      inputFor(level),
      "Generate one complete lesson.",
      { runTask } as unknown as AiTaskRunner,
      {
        resumeState: {
          grammarClassification,
          objectives: { objective: objectiveFor(level) },
          foundation: foundationFor(level),
          vocabulary: vocabularyFor(level),
          skills: originalSkills as never
        }
      }
    );

    expect(result.lesson.dayNumber).toBe(1);
    expect(reviewCalls).toBe(4);
    expect(repairCalls).toBe(2);
    expect(readingRepairCalls).toBe(1);
  });

  it("stops an unresolved reviewer loop after three targeted repair rounds", async () => {
    const level = levelCases[2];
    const generated = skillsFor(level);
    const originalSkills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    let reviewCalls = 0;
    let repairCalls = 0;
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_skills_reviewer") {
        reviewCalls += 1;
        return {
          output: {
            status: "needs_revision",
            findings: [{ exerciseCode: "listening", reasonCode: "insufficient_context", message: "Listening still needs clearer evidence." }],
            solvedAnswers: approvedReview.solvedAnswers
          },
          metadata: { ...metadata, taskId }
        };
      }
      if (taskId === "weekly_lesson_listening_repair") {
        repairCalls += 1;
        return {
          output: { listening: generated.comprehension.listening },
          metadata: { ...metadata, taskId }
        };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    await expect(generateWeeklyLessonDayPipeline(
      inputFor(level),
      "Generate one complete lesson.",
      { runTask } as unknown as AiTaskRunner,
      {
        resumeState: {
          grammarClassification,
          objectives: { objective: objectiveFor(level) },
          foundation: foundationFor(level),
          vocabulary: vocabularyFor(level),
          skills: originalSkills as never
        }
      }
    )).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
      details: expect.objectContaining({ repairRounds: 3 })
    });
    expect(repairCalls).toBe(3);
    expect(reviewCalls).toBe(4);
  });

  it("rejects a persisted B1+ skill checkpoint that still contains Vietnamese", () => {
    const level = levelCases[2];
    const generated = skillsFor(level);
    const findings = validateWeeklyLessonPipelineState(inputFor(level), {
      skills: {
        ...generated.comprehension,
        listening: { ...generated.comprehension.listening, questionTranslation: "Câu hỏi chính là gì?" }
      }
    });

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "skills.comprehension", path: ["listening", "questionTranslation"] })
    ]));
  });

  it("rejects persisted skill passages and model answers outside the active CEFR limits", () => {
    const level = levelCases[1];
    const generated = skillsFor(level);
    const findings = validateWeeklyLessonPipelineState(inputFor(level), {
      skills: {
        ...generated.comprehension,
        ...generated.speaking,
        listening: { ...generated.comprehension.listening, body: Array(30).fill("word").join(" ") },
        speaking: { ...generated.speaking.speaking, answer: Array(20).fill("word").join(" ") }
      }
    });

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "skills.comprehension", path: ["listening", "body"] }),
      expect.objectContaining({ component: "skills.speaking", path: ["speaking", "answer"] })
    ]));
  });

  it("repairs only overlong fields with exact token arrays on the second component attempt", async () => {
    const level = levelCases[0];
    const valid = skillsFor(level).comprehension;
    const invalid = {
      ...valid,
      listening: { ...valid.listening, body: Array(30).fill("word").join(" ") },
      reading: { ...valid.reading, body: Array(40).fill("word").join(" ") }
    };
    const taskIds: string[] = [];
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      taskIds.push(taskId);
      if (taskId === "weekly_lesson_comprehension") {
        return { output: invalid, metadata: { ...metadata, taskId } };
      }
      if (taskId === "weekly_lesson_length_repair") {
        expect(input).toMatchObject({
          cefr: "A1",
          repairs: [
            { path: "listening.body", targetWordCount: 15 },
            { path: "reading.body", targetWordCount: 25 }
          ]
        });
        return {
          output: {
            listeningBody: "Mina confirms the project deadline before the client meeting on Friday with her colleague today during the morning call".split(" "),
            readingBody: "After checking the calendar Mina sends an update and asks the team to approve the revised schedule before Friday client meeting today at work with her colleague during the morning call".split(" "),
            speakingAnswer: null
          },
          metadata: { ...metadata, taskId }
        };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const runner = { runTask } as unknown as AiTaskRunner;

    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner);

    expect(result.attempts).toBe(2);
    expect(result.semanticAttempts).toBe(1);
    expect(taskIds).toEqual(["weekly_lesson_comprehension", "weekly_lesson_length_repair"]);
    expect(result.output.listening?.body.trim().split(/\s+/u)).toHaveLength(19);
    expect(result.output.reading?.body.trim().split(/\s+/u)).toHaveLength(31);
    expect(result.output.listening?.answer).toBe(valid.listening.answer);
    expect(result.output.reading?.answer).toBe(valid.reading.answer);
  });

  it("counts the atomic listening candidate instead of the stale body before length repair", async () => {
    const level = levelCases[4];
    const valid = skillsFor(level).comprehension;
    const stale = {
      ...valid,
      listening: { ...valid.listening, body: "Not applicable for this lesson." }
    };
    const validWords = valid.listening.body.trim().split(/\s+/u);
    const longBody = [...validWords, ...Array(83 - validWords.length).fill("today")].join(" ");
    const candidate = {
      ...valid.listening,
      body: longBody,
      hint: "Use the context to identify the relevant consequence."
    };
    const runTask = vi.fn(async (taskId: string, input: unknown) => {
      if (taskId === "weekly_lesson_listening_repair") {
        return { output: { listening: candidate }, metadata: { ...metadata, taskId } };
      }
      if (taskId === "weekly_lesson_length_repair") {
        expect(input).toMatchObject({
          cefr: "C1",
          repairs: [expect.objectContaining({ path: "listening.body", originalText: longBody })]
        });
        return {
          output: { listeningBody: validWords, readingBody: null, speakingAnswer: null },
          metadata: { ...metadata, taskId }
        };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.comprehension",
      skillsInput(level),
      { runTask } as unknown as AiTaskRunner,
      {
        maxAttempts: 1,
        baseOutput: stale,
        reviewerFindings: [{ path: ["listening", "hint"], message: "Hint must not reveal the answer." }]
      }
    );

    expect(longBody.split(/\s+/u)).toHaveLength(83);
    expect(result.output.listening?.body).toBe(valid.listening.body);
    expect(runTask.mock.calls.map(([taskId]) => taskId)).toEqual([
      "weekly_lesson_listening_repair",
      "weekly_lesson_length_repair"
    ]);
  });

  it("requires a numeric-largest atomic repair to name the winning option explicitly", async () => {
    const level = levelCases[2];
    const previous = skillsFor(level).comprehension;
    const repairedListening = {
      ...previous.listening,
      body: "The marketing cost was higher than the forecast by 4,000 dollars this quarter. The travel cost was lower than the forecast by 500 dollars. The office supplies cost was close to the forecast. The equipment cost was higher than the forecast by 1,200 dollars. Marketing cost had the largest variance.",
      prompt: "Which cost category has the largest variance from the forecast?",
      option1: "Marketing cost",
      option2: "Travel cost",
      option3: "Office supplies cost",
      option4: "Equipment cost",
      answer: "Marketing cost"
    };
    const runTask = vi.fn(async (taskId: string, _input: unknown, options?: { systemPrompt?: string }) => {
      expect(taskId).toBe("weekly_lesson_listening_repair");
      expect(options?.systemPrompt).toContain("explicit source sentence naming the keyed option");
      return { output: { listening: repairedListening }, metadata: { ...metadata, taskId } };
    });

    const result = await generateWeeklyLessonSkillGroup(
      "skills.comprehension",
      skillsInput(level),
      { runTask } as unknown as AiTaskRunner,
      {
        maxAttempts: 3,
        baseOutput: previous,
        reviewerFindings: [{ path: ["listening", "body"], message: "The question asks for a numeric largest/smallest comparison, but the source lacks comparable figures for every option." }]
      }
    );

    expect(result.output.listening?.body).toBe(repairedListening.body);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("falls back to evidence-preserving sentence selection when token repair misses its range", async () => {
    const level = levelCases[1];
    const valid = skillsFor(level).comprehension;
    const invalid = {
      ...valid,
      listening: {
        ...valid.listening,
        body: `${valid.listening.body} The team waits quietly for another update. Everyone checks the agenda before leaving.`
      },
      reading: {
        ...valid.reading,
        body: "During our video call, Tom's voice was unclear. He said, \"Sorry, my connection is unstable. There is also an echo on my side.\" Lisa replied, \"Could you repeat that, please? I did not hear the deadline.\" Tom then turned off his camera to improve the signal and spoke again. Everyone waited silently.",
        prompt: "Listen and answer: Why did Lisa ask Tom to repeat something?",
        option1: "She missed the due date",
        option2: "She wanted to share her screen",
        option3: "Tom's camera was off",
        option4: "There was no echo",
        answer: "She missed the due date"
      }
    };
    let call = 0;
    const runTask = vi.fn(async (taskId: string) => {
      call += 1;
      if (taskId === "weekly_lesson_comprehension") return { output: invalid, metadata: { ...metadata, taskId } };
      if (taskId === "weekly_lesson_length_repair") {
        return {
          output: {
            listeningBody: invalid.listening.body.split(/\s+/u),
            readingBody: "Later, she replied, \"Could you repeat that, please? I did not hear the deadline.\" The speaker then turned off the camera and spoke again with the team.".split(/\s+/u),
            speakingAnswer: null
          },
          metadata: { ...metadata, taskId }
        };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const runner = { runTask } as unknown as AiTaskRunner;

    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner);

    expect(call).toBe(2);
    expect(result.output.listening?.body.split(/\s+/u).length).toBeGreaterThanOrEqual(15);
    expect(result.output.listening?.body.split(/\s+/u).length).toBeLessThanOrEqual(30);
    expect(result.output.reading?.body.split(/\s+/u).length).toBeGreaterThanOrEqual(23);
    expect(result.output.reading?.body.split(/\s+/u).length).toBeLessThanOrEqual(48);
    expect(result.output.listening?.body).toContain("Friday");
    expect(result.output.reading?.body).toContain("deadline");
    expect(result.output.reading?.body).toContain("Lisa");
    expect(result.output.reading?.body).toContain("Tom");
    expect(result.output.reading?.body).not.toMatch(/^(?:There is also|Later, she)/u);
  });

  it("falls back to complete source sentences when the bounded length formatter returns invalid schema", async () => {
    const level = levelCases[4];
    const valid = skillsFor(level).comprehension;
    const extra = "The coordinator acknowledged the concern and invited the regional lead to finish the point. The group then agreed on a clear speaking order for the rest of the call.";
    const invalid = {
      ...valid,
      listening: { ...valid.listening, body: `${valid.listening.body} ${extra} ${extra}` },
      reading: { ...valid.reading, body: `${valid.reading.body} ${extra} ${extra} ${extra} ${extra} ${extra}` }
    };
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_comprehension") return { output: invalid, metadata: { ...metadata, taskId } };
      if (taskId === "weekly_lesson_length_repair") throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
        code: "AI_OUTPUT_INVALID",
        details: { issues: [{ path: ["readingBody"], message: "Too big: expected array to have <=160 items" }] }
      });
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), { runTask } as unknown as AiTaskRunner);

    expect(result.output.listening?.body.split(/\s+/u).length).toBeGreaterThanOrEqual(39);
    expect(result.output.listening?.body.split(/\s+/u).length).toBeLessThanOrEqual(66);
    expect(result.output.reading?.body.split(/\s+/u).length).toBeGreaterThanOrEqual(89);
    expect(result.output.reading?.body.split(/\s+/u).length).toBeLessThanOrEqual(141);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("uses the second semantic attempt when mechanical length repair cannot preserve prompt entities", async () => {
    const level = levelCases[0];
    const valid = skillsFor(level).comprehension;
    const invalid = {
      ...valid,
      listening: {
        ...valid.listening,
        body: "Mina joins the weekly client meeting from the sales office and confirms the Friday deadline with her colleague before sharing the revised project schedule with everyone on the call today.",
        prompt: "When does Mina confirm the deadline?"
      }
    };
    const runTask = vi.fn(async (taskId: string) => {
      const comprehensionCalls = runTask.mock.calls.filter(([id]) => id === "weekly_lesson_comprehension").length;
      if (taskId === "weekly_lesson_comprehension") {
        return { output: comprehensionCalls === 1 ? invalid : valid, metadata: { ...metadata, taskId } };
      }
      if (taskId === "weekly_lesson_length_repair") {
        return {
          output: { listeningBody: "The deadline is Friday during the weekly client call today with everyone attending from the office".split(" "), readingBody: null, speakingAnswer: null },
          metadata: { ...metadata, taskId }
        };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), { runTask } as unknown as AiTaskRunner);

    expect(result.semanticAttempts).toBe(2);
    expect(runTask.mock.calls.map(([taskId]) => taskId)).toEqual([
      "weekly_lesson_comprehension", "weekly_lesson_length_repair", "weekly_lesson_comprehension"
    ]);
  });

  it.each(levelCases)("accepts $cefr grammar evidence as the first checkpoint", async (level) => {
    const { runner, runTask } = runnerWith({ weekly_lesson_grammar_classifier: grammarClassification });
    const result = await generateWeeklyLessonGrammarClassification(inputFor(level), runner, { qualityReview: true });

    expect(result.output).toEqual(grammarClassification);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("repairs a Vietnamese C1 grammar scope instead of silently replacing it", async () => {
    const level = levelCases[4];
    const invalid = { ...grammarClassification, scope: "Dạy cách ngắt lời lịch sự trong cuộc họp." };
    const { runner, runTask } = sequencedRunner("weekly_lesson_grammar_classifier", [invalid, grammarClassification]);

    const result = await generateWeeklyLessonGrammarClassification(inputFor(level), runner, { qualityReview: true });

    expect(result.output.scope).toBe(grammarClassification.scope);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("uses the third attempt for an invalid grammar classifier component", async () => {
    const level = levelCases[4];
    const invalid = { ...grammarClassification, scope: "Dạy cách ngắt lời lịch sự trong cuộc họp." };
    const { runner, runTask } = sequencedRunner("weekly_lesson_grammar_classifier", [invalid, invalid, grammarClassification]);

    const result = await generateWeeklyLessonGrammarClassification(inputFor(level), runner, { qualityReview: true });

    expect(result.output).toEqual(grammarClassification);
    expect(result.attempts).toBe(3);
    expect(runTask).toHaveBeenCalledTimes(3);
  });

  it("rejects a generic S + V classifier when the lesson focus supplies a concrete frame", async () => {
    const level = levelCases[2];
    const invalid = { ...grammarClassification, targetName: "S + V", scope: inputFor(level).lessonFocus };
    const { runner, runTask } = sequencedRunner("weekly_lesson_grammar_classifier", [invalid, grammarClassification]);

    const result = await generateWeeklyLessonGrammarClassification(inputFor(level), runner, { qualityReview: true });

    expect(result.output.targetName).toBe(grammarClassification.targetName);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("rejects classifier abstention when lessonFocus contains an explicit sentence frame", async () => {
    const level = levelCases[0];
    const abstained = {
      status: "no_suitable_content" as const,
      contentType: null,
      targetName: null,
      scope: null,
      support: "none" as const,
      confidence: "low" as const,
      evidence: [],
      rejectedCandidates: []
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_grammar_classifier", [abstained, grammarClassification]);

    const result = await generateWeeklyLessonGrammarClassification(inputFor(level), runner, { qualityReview: true });

    expect(result.output.status).toBe("classified");
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("allows classifier abstention for a communicative topic without an explicit sentence frame", async () => {
    const level = levelCases[0];
    const input = { ...inputFor(level), lessonFocus: "Confirming a deadline" };
    const abstained = {
      status: "no_suitable_content" as const,
      contentType: null,
      targetName: null,
      scope: null,
      support: "none" as const,
      confidence: "low" as const,
      evidence: [],
      rejectedCandidates: []
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_grammar_classifier: abstained });

    const result = await generateWeeklyLessonGrammarClassification(input, runner, { qualityReview: true });

    expect(result.output).toEqual(abstained);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it.each(levelCases)("enforces the $cefr objective language, count, opener and verb bank", async (level) => {
    const objective = objectiveFor(level);
    const { runner } = runnerWith({ weekly_lesson_objectives: { objective } });
    const result = await generateWeeklyLessonObjectives(objectivesInput(level), "Generate objectives.", runner);

    expect(result.output.objective.explanationLanguage).toBe(level.language);
    expect(result.output.objective.items).toHaveLength(level.objectiveCount);
    expect(result.output.objective.items.map((item) => item.action_verb)).toEqual([level.contentVerb, ...level.languageVerbs]);
  });

  it("rejects A1 objectives that require aggregate performances or unrelated pronunciation assessment", async () => {
    const level = levelCases[0];
    const valid = { objective: objectiveFor(level) };
    const invalid = {
      objective: {
        ...objectiveFor(level),
        items: objectiveFor(level).items.map((item, index) => index === 0
          ? {
              ...item,
              text: "Sau bài học, bạn có thể xử lý 3 tình huống và phát âm /ʊ/ trong could, good, should.",
              criterion: "đúng ít nhất 2 trong 3 tình huống"
            }
          : item)
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_objectives", [invalid, valid]);

    const result = await generateWeeklyLessonObjectives(objectivesInput(level), "Generate objectives.", runner);

    expect(result.output).toEqual(valid);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("accepts a concise 16-word A1-A2 objective ability instead of exhausting retries over two words", async () => {
    const level = levelCases[0];
    const objective = {
      ...objectiveFor(level),
      items: objectiveFor(level).items.map((item, index) => index === 0
        ? {
            ...item,
            text: "Sau bài học, bạn có thể chọn thông tin về ngày làm việc tại nhà trong thông báo chính thức hôm nay."
          }
        : item)
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_objectives: { objective } });

    await expect(generateWeeklyLessonObjectives(objectivesInput(level), "Generate objectives.", runner))
      .resolves.toMatchObject({ output: { objective } });
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("rejects Vietnamese target_language values even when A1 objective explanations are Vietnamese", async () => {
    const level = levelCases[0];
    const valid = { objective: objectiveFor(level) };
    const invalid = {
      objective: {
        ...objectiveFor(level),
        items: objectiveFor(level).items.map((item) => item.type === "language"
          ? { ...item, target_language: ["tháng", "số tiền", "tháng Một", "tháng Hai"] }
          : item)
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_objectives", [invalid, valid]);

    const result = await generateWeeklyLessonObjectives(objectivesInput(level), "Generate objectives.", runner);

    expect(result.output).toEqual(valid);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("rejects objectives that borrow target language from another day", async () => {
    const level = levelCases[2];
    const valid = { objective: objectiveFor(level) };
    const invalid = {
      objective: {
        ...objectiveFor(level),
        items: objectiveFor(level).items.map((item) => item.type === "language"
          ? {
              ...item,
              text: "By the end of this lesson, you will be able to respond to an unstable connection.",
              target_language: ["Sorry, my connection is unstable"],
              condition: "during an audio problem"
            }
          : item)
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_objectives", [invalid, valid]);

    const result = await generateWeeklyLessonObjectives(objectivesInput(level), "Generate objectives.", runner);

    expect(result.output).toEqual(valid);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("repairs learner-facing objective text that is too long to scan", async () => {
    const level = levelCases[1];
    const valid = { objective: objectiveFor(level) };
    const invalid = {
      objective: {
        ...objectiveFor(level),
        items: objectiveFor(level).items.map((item) => ({
          ...item,
          text: `${item.text.replace(/[.]$/u, "")} trong một tình huống công việc rất chi tiết với nhiều số liệu và nhiều bước giải thích liên tiếp.`
        }))
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_objectives", [invalid, valid]);

    const result = await generateWeeklyLessonObjectives(objectivesInput(level), "Generate objectives.", runner);

    expect(result.output).toEqual(valid);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("rejects a B1 writing objective that asks for a four-option choice", async () => {
    const level = levelCases[2];
    const valid = { objective: objectiveFor(level) };
    const invalid = {
      objective: {
        ...objectiveFor(level),
        items: objectiveFor(level).items.map((item, index) => index === 1
          ? {
              ...item,
              action_verb: "choose",
              text: "By the end of this lesson, you will be able to choose a polite closing phrase.",
              assessed_by: "Four-option MCQ completing the closing line.",
              criterion: "Selects the correct closing phrase.",
              success_evidence: "The learner chooses the correct option.",
              assessmentCode: "writing" as const
            }
          : item)
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_objectives", [invalid, valid]);

    const result = await generateWeeklyLessonObjectives(objectivesInput(level), "Generate objectives.", runner);

    expect(result.output).toEqual(valid);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("rejects a written free response mislabeled as a listening objective", async () => {
    const level = levelCases[2];
    const valid = { objective: objectiveFor(level) };
    const invalid = {
      objective: {
        ...objectiveFor(level),
        items: objectiveFor(level).items.map((item, index) => index === 0
          ? {
              ...item,
              assessed_by: "Written free response of 3-4 sentences.",
              criterion: "The written summary includes all three action points.",
              success_evidence: "The response is a complete paragraph.",
              assessmentCode: "listening" as const
            }
          : item)
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_objectives", [invalid, valid]);

    const result = await generateWeeklyLessonObjectives(objectivesInput(level), "Generate objectives.", runner);

    expect(result.output).toEqual(valid);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("accepts a summary ability assessed by an explicit four-option reading check", async () => {
    const level = levelCases[3];
    const objective = {
      ...objectiveFor(level),
      items: objectiveFor(level).items.map((item, index) => index === 0
        ? {
            ...item,
            action_verb: "summarise",
            text: "By the end of this lesson, you will be able to summarise meeting decisions in a concise update.",
            assessed_by: "Four-option reading comprehension check identifying the most accurate summary.",
            criterion: "The summary states each decision and follow-up task accurately.",
            success_evidence: "Learner selects the option with the correct decisions and no invented information.",
            assessmentCode: "reading" as const
          }
        : item)
    };
    const output = { objective };
    const { runner, runTask } = runnerWith({ weekly_lesson_objectives: output });

    const result = await generateWeeklyLessonObjectives(objectivesInput(level), "Generate objectives.", runner);

    expect(result.output).toEqual(output);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("accepts A1-A2 writing objectives that explicitly use a four-option writing MCQ or cloze", async () => {
    const level = levelCases[1];
    const objective = {
      ...objectiveFor(level),
      items: objectiveFor(level).items.map((item, index) => index === 1
        ? {
            ...item,
            action_verb: "chọn",
            text: "Sau bài học, bạn có thể chọn câu tóm tắt đúng nhất về tình trạng ngân sách quý.",
            assessed_by: "Câu hỏi chọn một trong bốn đáp án (writing MCQ).",
            criterion: "Chọn đúng câu tiếng Anh phù hợp với số liệu.",
            success_evidence: "Học viên chọn đúng một trong bốn lựa chọn.",
            assessmentCode: "writing" as const
          }
        : item)
    };
    const output = { objective };
    const { runner, runTask } = runnerWith({ weekly_lesson_objectives: output });

    await expect(generateWeeklyLessonObjectives(objectivesInput(level), "Generate objectives.", runner))
      .resolves.toMatchObject({ output });
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("isolates objective generation from broader weekly context", async () => {
    const level = levelCases[2];
    const input = {
      ...objectivesInput(level),
      topic: "Video-call troubleshooting for the whole week",
      description: "Handle microphones, unstable connections, attendance, and follow-up actions.",
      objectives: "Solve audio and video problems across the week.",
      keyVocabHint: "microphone, unstable, reconnect, repeat",
      lessonFocus: "Join a video call, greet colleagues, and confirm who is present",
      allLessonFocuses: [
        "Join a video call, greet colleagues, and confirm who is present",
        "Report an unstable connection",
        "Ask a colleague to repeat information",
        "Summarize agreed actions",
        "Close a video call professionally"
      ]
    };
    const output = { objective: objectiveFor(level) };
    const { runner, runTask } = runnerWith({ weekly_lesson_objectives: output });

    await generateWeeklyLessonObjectives(input, "Generate objectives.", runner);

    const receivedInput = runTask.mock.calls[0]?.[1] as WeeklyLessonObjectivesInput;
    expect(receivedInput.topic).toBe(input.lessonFocus);
    expect(receivedInput.description).toContain(input.lessonFocus);
    expect(receivedInput.objectives).toBe(input.lessonFocus);
    expect(receivedInput.keyVocabHint).toBe(input.lessonFocus);
    expect(new Set(receivedInput.allLessonFocuses)).toEqual(new Set([input.lessonFocus]));
  });

  it("rejects content objectives borrowed from another day", async () => {
    const level = levelCases[2];
    const valid = { objective: objectiveFor(level) };
    const invalid = {
      objective: {
        ...objectiveFor(level),
        items: objectiveFor(level).items.map((item) => item.type === "content"
          ? {
              ...item,
              text: "By the end of this lesson, you will be able to summarize an unstable connection problem.",
              condition: "after hearing an audio failure report",
              success_evidence: "The response identifies the connection problem."
            }
          : item)
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_objectives", [invalid, valid]);
    const input = {
      ...objectivesInput(level),
      allLessonFocuses: [
        objectivesInput(level).lessonFocus,
        "Report an unstable connection problem",
        "Ask a colleague to repeat information",
        "Summarize agreed actions",
        "Close a meeting professionally"
      ]
    };

    const result = await generateWeeklyLessonObjectives(input, "Generate objectives.", runner);

    expect(result.output).toEqual(valid);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("does not mistake Vietnamese alternatives written with a slash for an IPA objective", async () => {
    const level = levelCases[0];
    const objective = objectiveFor(level);
    const output = {
      objective: {
        ...objective,
        items: objective.items.map((item) => ({
          ...item,
          text: item.text.replace("thông tin về hạn chót", "tình huống bật/tắt micro"),
          condition: "khi cần bật/tắt micro trong cuộc họp",
          criterion: "chọn đúng thao tác bật/tắt micro trong hai tình huống đối lập",
          success_evidence: "Một đáp án dạng cặp xác định đúng cả hai nhánh bật/tắt."
        }))
      }
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_objectives: output });

    await expect(generateWeeklyLessonObjectives(objectivesInput(level), "Generate objectives.", runner)).resolves.toMatchObject({ output });
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it.each(levelCases)("enforces the $cefr foundation language and authoritative pronunciation", async (level) => {
    const { runner } = runnerWith({ weekly_lesson_foundation: foundationFor(level) });
    const result = await generateWeeklyLessonFoundation(objectivesInput(level), "Generate foundation.", runner, { qualityProfile: "strict" });

    expect(result.output.instruction.title).toBe(level.language === "vi" ? "Hướng dẫn làm bài" : "Lesson instructions");
    expect(result.output.pronunciation).toMatchObject(pronunciationPlan);
    expect(result.output.grammar).toMatchObject({ targetName: grammarClassification.targetName, scope: grammarClassification.scope });
  });

  it.each(levelCases)("replaces verbose $cefr lesson instructions with the concise product guidance", async (level) => {
    const output = {
      ...foundationFor(level),
      instruction: level.language === "vi"
        ? {
            title: "Hướng dẫn làm bài",
            step1: "Đọc thật kỹ toàn bộ nội dung bài học và ghi chú đầy đủ mọi điểm quan trọng trước khi chuyển sang phần bài tập.",
            step2: "Hoàn thành tất cả bài tập theo đúng thứ tự và liên tục kiểm tra lại từng phần giải thích cùng ví dụ trước đó.",
            step3: "Đọc toàn bộ phản hồi, so sánh với từng câu trả lời trước đó rồi làm lại tất cả những phần chưa chính xác."
          }
        : {
            title: "Lesson instructions",
            step1: "Read every part of the lesson very carefully and make detailed notes before you continue to the exercises.",
            step2: "Complete all exercises in sequence while repeatedly checking every earlier explanation and example for supporting evidence.",
            step3: "Review every feedback message in full, compare it with all previous answers, and then complete each incorrect exercise again."
          }
    };
    const { runner } = runnerWith({ weekly_lesson_foundation: output });

    const result = await generateWeeklyLessonFoundation(objectivesInput(level), "Generate foundation.", runner, { qualityProfile: "strict" });

    const expected = level.language === "vi"
      ? ["Học nội dung và nghe các câu mẫu.", "Làm lần lượt các bài tập.", "Xem phản hồi và làm lại phần chưa đúng."]
      : ["Study the lesson content and listen to the model sentences.", "Complete each practice task in order.", "Review the feedback and retry any incorrect task."];
    expect([result.output.instruction.step1, result.output.instruction.step2, result.output.instruction.step3]).toEqual(expected);
  });

  it("normalizes an overlong foundation title from the valid compact grammar title", async () => {
    const level = levelCases[3];
    const valid = foundationFor(level);
    const output = {
      ...valid,
      title: `${valid.grammar!.title} / ${valid.grammar!.formula} for workplace contingency planning`
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_foundation: output });

    const result = await generateWeeklyLessonFoundation(objectivesInput(level), "Generate foundation.", runner, { qualityProfile: "strict" });

    expect(output.title.length).toBeGreaterThan(60);
    expect(result.output.title).toBe(valid.grammar!.title);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("does not create a dangling connector when shortening a long foundation title", async () => {
    const level = levelCases[3];
    const valid = foundationFor(level);
    const output = {
      ...valid,
      title: "Should + subject + be + past participle, we would need to reallocate funds",
      grammar: {
        ...valid.grammar!,
        title: "Should + subject + be + past participle, we would need to reallocate funds"
      }
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_foundation: output });

    const result = await generateWeeklyLessonFoundation(objectivesInput(level), "Generate foundation.", runner, { qualityProfile: "strict" });

    expect(result.output.title).not.toMatch(/\b(?:and|or|to|of|for|with|if|that)$/iu);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("rejects a generic foundation formula and keeps the concrete classified frame", async () => {
    const level = levelCases[2];
    const valid = foundationFor(level);
    const invalid = { ...valid, grammar: { ...valid.grammar!, formula: "S + V" } };
    const { runner, runTask } = sequencedRunner("weekly_lesson_foundation", [invalid, valid]);

    const result = await generateWeeklyLessonFoundation(objectivesInput(level), "Generate foundation.", runner, { qualityProfile: "strict" });

    expect(result.output.grammar?.formula).not.toBe("S + V");
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it.each(levelCases)("enforces the $cefr vocabulary shape and language boundary", async (level) => {
    const output = vocabularyFor(level);
    const { runner } = runnerWith({ weekly_lesson_vocabulary: output });
    const result = await generateWeeklyLessonVocabulary({
      ...inputFor(level), grammarFormula: "Could you confirm + noun?",
      grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"], excludedVocabulary: []
    }, runner);

    expect([result.output.word1, result.output.word2, result.output.word3].map((item) => item.meaning))
      .toEqual(["xác nhận", "làm rõ", "phê duyệt"]);
    expect(result.output.title).toBe(level.language === "vi" ? "Từ vựng" : "Vocabulary");
  });

  it("allows a core vocabulary word to repeat from an earlier lesson or level", async () => {
    const level = levelCases[2];
    const valid = vocabularyFor(level);
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [valid]);

    const result = await generateWeeklyLessonVocabulary({
      ...inputFor(level), grammarFormula: "Could you confirm + noun?",
      grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"],
      excludedVocabulary: [valid.word1.word]
    }, runner);

    expect(result.output.word1.word).toBe(valid.word1.word);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("keeps up to two missing relations as light gaps", async () => {
    const level = levelCases[1];
    const valid = vocabularyFor(level);
    const invalid = {
      ...valid,
      word1: { ...valid.word1, synonym1: null },
      word2: { ...valid.word2, synonym1: null },
      word3: { ...valid.word3, antonym1: null }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [invalid]);

    const result = await generateWeeklyLessonVocabulary({
      ...inputFor(level), grammarFormula: "Could you confirm + noun?",
      grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"], excludedVocabulary: []
    }, runner);

    expect(result.output.word1.relationStatus).toBe("generation_missed");
    expect(result.output.word2.relationStatus).toBe("generation_missed");
    expect(result.output.word3.synonym1).toEqual(valid.word3.synonym1);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("uses the third vocabulary attempt when an internal duplicate survives the first repair", async () => {
    const level = levelCases[0];
    const valid = vocabularyFor(level);
    const invalid = {
      ...valid,
      word2: { ...valid.word2, word: valid.word1.word, ttsText: valid.word1.word, ssml: `<speak>${valid.word1.word}</speak>` }
    };
    const stillInvalid = {
      ...valid,
      word2: { ...valid.word2, word: valid.word1.word, ttsText: valid.word1.word, ssml: `<speak>${valid.word1.word}</speak>` }
    };
    const prompts: string[] = [];
    const outputs = [invalid, stillInvalid, valid];
    let index = 0;
    const runTask = vi.fn(async (taskId: string, _input: unknown, options?: { systemPrompt?: string }) => {
      expect(taskId).toBe("weekly_lesson_vocabulary");
      prompts.push(options?.systemPrompt ?? "");
      const output = outputs[Math.min(index, outputs.length - 1)];
      index += 1;
      return { output, metadata: { ...metadata, taskId } };
    });

    const result = await generateWeeklyLessonVocabulary({
      ...inputFor(level), grammarFormula: "The cost is + adjective.",
      grammarExamples: ["The cost is high.", "The cost is low."], excludedVocabulary: []
    }, { runTask } as unknown as AiTaskRunner);

    expect(result.output).toEqual(valid);
    expect(runTask).toHaveBeenCalledTimes(3);
    expect(prompts[1]).toContain("duplicated inside this vocabulary component");
  });

  it("keeps valid vocabulary entries while replacing only the duplicated word", async () => {
    const level = levelCases[4];
    const base = vocabularyFor(level);
    const invalid = {
      ...base,
      word3: { ...base.word3, word: base.word1.word, ttsText: base.word1.word, ssml: `<speak>${base.word1.word}</speak>` }
    };
    const replacement = {
      ...invalid,
      word1: { ...invalid.word1, meaning: "nội dung không được phép ghi đè" },
      word3: {
        ...invalid.word3,
        word: "authorize",
        ttsText: "authorize",
        ssml: "<speak>authorize</speak>"
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [invalid, replacement]);

    const result = await generateWeeklyLessonVocabulary({
      ...inputFor(level), grammarFormula: "Could you confirm + noun?",
      grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"],
      excludedVocabulary: []
    }, runner);

    expect(result.output.word1).toEqual(invalid.word1);
    expect(result.output.word2).toEqual(invalid.word2);
    expect(result.output.word3.word).toBe("authorize");
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("drops a lexical relation that repeats its own target word", async () => {
    const level = levelCases[4];
    const output = vocabularyFor(level);
    const duplicatedRelation = {
      ...output,
      word2: {
        ...output.word2,
        synonym1: {
          ...output.word2.synonym1!,
          word: output.word2.word
        }
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [duplicatedRelation]);

    const result = await generateWeeklyLessonVocabulary({
      ...inputFor(level), grammarFormula: "Could you confirm + noun?",
      grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"], excludedVocabulary: []
    }, runner);

    expect(result.output.word2.synonym1).toBeNull();
    expect(result.output.word2.relationStatus).toBe("generation_missed");
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("repairs a learner-facing relation that repeats another card in the same day", async () => {
    const level = levelCases[2];
    const output = vocabularyFor(level);
    const duplicatedRelation = {
      ...output,
      word2: {
        ...output.word2,
        synonym1: { ...output.word2.synonym1!, word: output.word1.word }
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [duplicatedRelation]);

    const result = await generateWeeklyLessonVocabulary({
      ...inputFor(level), grammarFormula: "Could you confirm + noun?",
      grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"], excludedVocabulary: []
    }, runner);

    expect(result.output.word2.synonym1).toBeNull();
    expect(result.output.word2.relationStatus).toBe("generation_missed");
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("repairs B1+ lexical relation notes instead of silently replacing them", async () => {
    const level = levelCases[2];
    const output = vocabularyFor(level);
    const withVietnameseNote = {
      ...output,
      word1: { ...output.word1, synonym1: { ...output.word1.synonym1!, note: "giải thích bằng tiếng Việt" } }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [withVietnameseNote, output]);

    const result = await generateWeeklyLessonVocabulary({
      ...inputFor(level), grammarFormula: "Could you confirm + noun?",
      grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"], excludedVocabulary: []
    }, runner);

    expect(result.output.word1.synonym1?.note).toBe(output.word1.synonym1?.note);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it.each(levelCases)("enforces the $cefr comprehension contract", async (level) => {
    const output = skillsFor(level).comprehension;
    const { runner } = runnerWith({ weekly_lesson_comprehension: output });
    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner);

    expect(result.output.listening?.answer).toBe("Friday");
    expect(result.output.reading?.answer).toBe("An update");
  });

  it("accepts check-the-sound as direct evidence for an explicit can-you-hear-me exchange", async () => {
    const level = levelCases[0];
    const base = skillsFor(level).comprehension;
    const output = {
      ...base,
      reading: {
        ...base.reading,
        body: "Tom joins the call with his team. His microphone is muted, so his teammate asks, \"Can you hear me?\" Tom answers no.",
        prompt: "Why does the teammate ask whether Tom can hear him?",
        option1: "To check the sound",
        option2: "To ask for lunch",
        option3: "To change the date",
        option4: "To end the call",
        answer: "To check the sound"
      }
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_comprehension: output });

    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner);

    expect(result.output.reading?.answer).toBe("To check the sound");
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("routes visual distractors in a sound-only comprehension check to that exercise repair", async () => {
    const level = levelCases[0];
    const base = skillsFor(level).comprehension;
    const invalid = {
      ...base,
      listening: {
        ...base.listening,
        body: "Lan asks Minh, 'Can you hear me?' Minh hears Lan clearly and answers yes during their call today.",
        prompt: "Can Minh hear Lan?",
        option1: "Minh hears Lan clearly",
        option2: "No, I cannot",
        option3: "Yes, I can see",
        option4: "No, I cannot see",
        answer: "Minh hears Lan clearly"
      }
    };
    const valid = {
      listening: {
        ...invalid.listening,
        option1: "Minh hears Lan clearly",
        option2: "Minh cannot hear Lan",
        option3: "He hears only music",
        option4: "The call has no sound",
        answer: "Minh hears Lan clearly"
      }
    };
    let repairCalls = 0;
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_comprehension") return {
        output: invalid,
        metadata: { ...metadata, taskId }
      };
      if (taskId === "weekly_lesson_listening_repair") {
        repairCalls += 1;
        return {
          output: repairCalls === 1 ? { listening: invalid.listening } : valid,
          metadata: { ...metadata, taskId }
        };
      }
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });
    const runner = { runTask } as unknown as AiTaskRunner;

    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner);

    expect(result.output.listening?.option3).toBe("He hears only music");
    expect(result.output.reading).toEqual(base.reading);
    expect(runTask.mock.calls.map(([taskId]) => taskId)).toEqual([
      "weekly_lesson_comprehension",
      "weekly_lesson_listening_repair",
      "weekly_lesson_listening_repair"
    ]);
  });

  it("repairs a multi-word comprehension answer when only a generic word appears in the passage", async () => {
    const level = levelCases[4];
    const base = skillsFor(level).comprehension;
    const genericMeetingContext = "The leadership meeting opens with a budget review, staffing constraints, and the launch timeline. Participants compare risks, clarify priorities, question assumptions, and agree the agenda before discussing each operational concern in depth.";
    const invalid = {
      ...base,
      reading: {
        ...base.reading,
        body: Array(3).fill(genericMeetingContext).join(" "),
        prompt: "What will determine the board paper?",
        option1: "The decisions made in the meeting",
        option2: "Last year's staffing plan",
        option3: "The office location",
        option4: "The catering budget",
        answer: "The decisions made in the meeting"
      }
    };
    const repaired = {
      reading: {
        ...invalid.reading,
        body: `${invalid.reading.body} The board paper will reflect the decisions made in the meeting.`
      }
    };
    const { runner, runTask } = runnerWith({
      weekly_lesson_comprehension: invalid,
      weekly_lesson_reading_repair: repaired
    });

    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner);

    expect(result.output.reading?.body).toContain("board paper will reflect");
    expect(runTask.mock.calls.map(([taskId]) => taskId)).toEqual([
      "weekly_lesson_comprehension",
      "weekly_lesson_reading_repair"
    ]);
  });

  it("repairs a largest-variance question when the source lacks comparable figures for distractors", async () => {
    const level = levelCases[2];
    const base = skillsFor(level).comprehension;
    const invalidListening = {
      ...base.listening,
      body: "The report has four lines. Travel spent 22,000 dollars against a forecast of 18,000 dollars, a variance of 4,000. Events spent 9,000 dollars. Marketing spent 12,000 dollars. Office supplies spent 3,100 dollars.",
      prompt: "Which budget line has the largest variance?",
      option1: "Travel",
      option2: "Events",
      option3: "Marketing",
      option4: "Office supplies",
      answer: "Travel"
    };
    const repairedListening = {
      ...invalidListening,
      body: "The report has four lines. Travel has a variance of 4,000 dollars. Events has a variance of 500 dollars. Marketing has a variance of 2,000 dollars. Office supplies has no variance."
    };
    const invalid = { ...base, listening: invalidListening };
    const { runner, runTask } = runnerWith({
      weekly_lesson_comprehension: invalid,
      weekly_lesson_listening_repair: { listening: repairedListening }
    });

    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner);

    expect(result.output.listening?.body).toContain("Events has a variance");
    expect(runTask.mock.calls.map(([taskId]) => taskId)).toEqual([
      "weekly_lesson_comprehension",
      "weekly_lesson_listening_repair"
    ]);
  });

  it("rejects a comprehension question that names a person absent from its source passage", async () => {
    const level = levelCases[0];
    const valid = skillsFor(level).comprehension;
    const invalid = {
      ...valid,
      reading: {
        ...valid.reading,
        body: "I work with the sales team. The team helps customers every day at our office and discusses new orders during the morning meeting today.",
        prompt: "Minh works with which team?",
        questionTranslation: "Minh làm việc với đội nào?"
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_comprehension", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner);

    expect(result.output).toEqual(valid);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("does not mistake a sentence-initial Vietnamese common noun for a named entity", async () => {
    const level = levelCases[0];
    const valid = skillsFor(level).comprehension;
    const output = {
      ...valid,
      reading: {
        ...valid.reading,
        prompt: `Việc: ${valid.reading.prompt}`
      }
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_comprehension: output });

    await expect(generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner))
      .resolves.toMatchObject({ output });
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("accepts possessive names grounded in the source and ignores all-caps instruction words", async () => {
    const level = levelCases[0];
    const valid = skillsFor(level).comprehension;
    const output = {
      ...valid,
      reading: {
        ...valid.reading,
        body: "Tom works with the sales team every day. His team helps customers and reviews new orders during the Monday morning meeting at work.",
        prompt: "Which statement is NOT true about Tom's team?",
        option1: "It helps customers",
        option2: "It reviews orders",
        option3: "It meets Monday",
        option4: "It designs houses",
        answer: "It designs houses",
        hint: "Tìm thông tin không xuất hiện trong đoạn đọc.",
        questionTranslation: "Thông tin nào không đúng về đội của Tom?",
        answerTranslation: "Đội không thiết kế nhà."
      }
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_comprehension: output });

    await expect(generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner)).resolves.toMatchObject({ output });
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("does not mistake a Vietnamese question word for an ungrounded proper name", async () => {
    const level = levelCases[0];
    const valid = skillsFor(level).comprehension;
    const output = {
      ...valid,
      reading: {
        ...valid.reading,
        prompt: "Vì sao người viết xin mọi người nhắc lại?".normalize("NFD"),
        questionTranslation: "Vì sao người viết xin mọi người nhắc lại?"
      }
    };
    const { runner } = runnerWith({ weekly_lesson_comprehension: output });

    await expect(generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner)).resolves.toMatchObject({ output });
  });

  it("does not mistake sentence-initial Khi for an ungrounded proper name", async () => {
    const level = levelCases[0];
    const valid = skillsFor(level).comprehension;
    const output = {
      ...valid,
      reading: {
        ...valid.reading,
        body: "Minh joins a video call with his team. He hears the sound clearly and answers the question before the meeting starts today.",
        prompt: "Khi Minh nghe rõ âm thanh, anh ấy làm gì?",
        option1: "He answers the question",
        option2: "He leaves the call",
        option3: "He turns off the computer",
        option4: "He writes an email",
        answer: "He answers the question",
        questionTranslation: "Khi Minh nghe rõ âm thanh, anh ấy làm gì?",
        answerTranslation: "Anh ấy trả lời câu hỏi."
      }
    };
    const { runner } = runnerWith({ weekly_lesson_comprehension: output });

    await expect(generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner)).resolves.toMatchObject({ output });
  });

  it.each(levelCases)("enforces the $cefr language-practice writing mode and exact keys", async (level) => {
    const output = skillsFor(level).languagePractice;
    const { runner } = runnerWith({ weekly_lesson_language_practice: output });
    const result = await generateWeeklyLessonSkillGroup("skills.languagePractice", skillsInput(level), runner);

    expect(result.output.writing?.type).toBe(level.writingType);
    expect(result.output.wordClass?.answer).toBe("verb");
    expect(result.output.wordUse?.answer).toBe("confirm the deadline");
  });

  it("rejects a mapped word-use exercise that omits the objective target language", async () => {
    const level = levelCases[0];
    const invalidBase = skillsFor(level).languagePractice;
    const invalid = {
      ...invalidBase,
      wordUse: {
        ...invalidBase.wordUse,
        title: "Dùng từ: Please mute your microphone / Please unmute your microphone"
      }
    };
    const valid = {
      ...invalid,
      wordUse: {
        ...invalid.wordUse,
        prompt: "Noise is coming from Lan's mic. Which request is correct?",
        option1: "Please mute your microphone.",
        option2: "Please unmute your microphone.",
        option3: "Please camera your microphone.",
        option4: "Please speaker your microphone.",
        answer: "Please mute your microphone.",
        hint: "Chọn yêu cầu phù hợp với tiếng ồn từ micro.",
        questionTranslation: "Tiếng ồn phát ra từ micro của Lan. Yêu cầu nào đúng?",
        answerTranslation: "Vui lòng tắt micro của bạn."
      }
    };
    const lessonObjectives = {
      ...objectiveFor(level),
      items: objectiveFor(level).items.map((item, index) => index === 1
        ? {
            ...item,
            assessmentCode: "word_use" as const,
            target_language: ["Please mute your microphone.", "Please unmute your microphone."]
          }
        : item)
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_language_practice", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.languagePractice", {
      ...skillsInput(level), lessonFocus: "Please mute or unmute your microphone", lessonObjectives
    }, runner);

    expect(result.output.wordUse).toEqual(valid.wordUse);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("accepts one complete target-language option when the objective explicitly says or", async () => {
    const level = levelCases[0];
    const output = skillsFor(level).languagePractice;
    const writing = {
      ...output.writing,
      prompt: "A: Can you hear me? B: ____ Choose the correct response.",
      option1: "Yes, I can.",
      option2: "Yes, I cannot.",
      option3: "No, I can.",
      option4: "Hear me, yes.",
      answer: "Yes, I can."
    };
    const lessonObjectives = {
      ...objectiveFor(level),
      items: objectiveFor(level).items.map((item, index) => index === 1
        ? {
            ...item,
            assessmentCode: "writing" as const,
            text: "Điền Yes, I can hoặc No, I cannot vào hội thoại.",
            criterion: "Dùng đúng một câu trả lời phù hợp.",
            success_evidence: "Câu trả lời là Yes, I can hoặc No, I cannot.",
            target_language: ["Can you hear me?", "Yes, I can", "No, I cannot"]
          }
        : item)
    };
    const candidate = { ...output, writing };
    const { runner, runTask } = runnerWith({ weekly_lesson_language_practice: candidate });

    const result = await generateWeeklyLessonSkillGroup("skills.languagePractice", {
      ...skillsInput(level), lessonFocus: "Can you hear me? Yes, I can / No, I cannot", lessonObjectives
    }, runner);

    expect(result.output.writing).toEqual(writing);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("accepts a concrete modal deduction that realizes abstract target pattern notation", async () => {
    const level = levelCases[3];
    const output = skillsFor(level).languagePractice;
    const wordUse = {
      ...output.wordUse,
      prompt: "Our router was old, so the audio drop ___ during the update.",
      option1: "might have interrupted the call",
      option2: "might has interrupted the call",
      option3: "might interrupted the call",
      option4: "might interrupt the call",
      answer: "might have interrupted the call"
    };
    const lessonObjectives = {
      ...objectiveFor(level),
      items: objectiveFor(level).items.map((item, index) => index === 1
        ? {
            ...item,
            assessmentCode: "word_use" as const,
            text: "By the end of this lesson, you will be able to explain a possible past cause using may have, might have, or could have + past participle.",
            criterion: "Use may have, might have, or could have plus a past participle.",
            success_evidence: "The response uses one correct modal deduction pattern.",
            target_language: ["may have + past participle", "might have + past participle", "could have + past participle"]
          }
        : item)
    };
    const candidate = { ...output, wordUse };
    const { runner, runTask } = runnerWith({ weekly_lesson_language_practice: candidate });

    const result = await generateWeeklyLessonSkillGroup("skills.languagePractice", {
      ...skillsInput(level), lessonObjectives
    }, runner);

    expect(result.output.wordUse?.answer).toBe(wordUse.answer);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("accepts a concrete second conditional that realizes plus-sign pattern notation", async () => {
    const level = levelCases[3];
    const output = skillsFor(level).languagePractice;
    const sentence = "If the supplier were to delay the parts, Ana would arrange a fallback order.";
    const wordUse = {
      ...output.wordUse,
      prompt: "Which sentence correctly proposes a contingency?",
      option1: sentence,
      option2: "If the supplier delay the parts, Ana will arranging an order.",
      option3: "The supplier were delay, Ana would arranges an order.",
      option4: "If delayed the supplier, Ana arrange an order.",
      answer: sentence
    };
    const lessonObjectives = {
      ...objectiveFor(level),
      items: objectiveFor(level).items.map((item, index) => index === 1
        ? {
            ...item,
            assessmentCode: "word_use" as const,
            text: "By the end of this lesson, you will be able to propose a contingency using second conditional or if + were to.",
            criterion: "Select the second conditional or if + were to frame.",
            success_evidence: "The response realizes one correct conditional frame.",
            target_language: ["If + past simple, would + base verb", "If + were to + base verb, would + base verb"]
          }
        : item)
    };
    const candidate = { ...output, wordUse };
    const { runner, runTask } = runnerWith({ weekly_lesson_language_practice: candidate });

    const result = await generateWeeklyLessonSkillGroup("skills.languagePractice", { ...skillsInput(level), lessonObjectives }, runner);

    expect(result.output.wordUse?.answer).toBe(sentence);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("uses canonical English support text for Vietnamese B1+ legacy translation fields", async () => {
    const level = levelCases[3];
    const output = skillsFor(level).languagePractice;
    const withVietnameseTranslations = {
      ...output,
      writing: { ...output.writing, questionTranslation: "Viết câu trả lời.", answerTranslation: "Câu trả lời mẫu." }
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_language_practice: withVietnameseTranslations });

    const result = await generateWeeklyLessonSkillGroup("skills.languagePractice", skillsInput(level), runner);

    expect(result.output.writing?.questionTranslation).toBe(result.output.writing?.prompt);
    expect(result.output.writing?.answerTranslation).toBe(result.output.writing?.answer);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("keeps the B1+ writing mode deterministic when a repair candidate drifts to mcq", async () => {
    const level = levelCases[2];
    const output = skillsFor(level).languagePractice;
    const drifted = {
      ...output,
      writing: {
        ...output.writing,
        type: "mcq" as const,
        option1: "Can you hear me?",
        option2: "Your mic is muted.",
        option3: "Please share your screen.",
        option4: "The call starts soon."
      }
    };
    const { runner } = runnerWith({ weekly_lesson_language_practice: drifted });

    const result = await generateWeeklyLessonSkillGroup("skills.languagePractice", skillsInput(level), runner);

    expect(result.output.writing).toMatchObject({
      type: "write",
      option1: null,
      option2: null,
      option3: null,
      option4: null
    });
  });

  it("canonicalizes B1+ legacy support fields to the English prompt and answer", async () => {
    const level = levelCases[4];
    const output = skillsFor(level).comprehension;
    const paraphrased = {
      ...output,
      listening: {
        ...output.listening,
        questionTranslation: "State the main purpose of the call.",
        answerTranslation: "The team will review the timeline."
      }
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_comprehension: paraphrased });

    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner);

    expect(result.output.listening?.questionTranslation).toBe(result.output.listening?.prompt);
    expect(result.output.listening?.answerTranslation).toBe(result.output.listening?.answer);
    expect(result.attempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("rejects a direct B1 comprehension key with no evidence in the passage", async () => {
    const level = levelCases[2];
    const valid = skillsFor(level).comprehension;
    const invalid = {
      ...valid,
      listening: {
        ...valid.listening,
        body: "Maria cannot use her microphone, so she writes in the chat while she tries to fix it before the meeting starts.",
        prompt: "What does Maria ask colleagues to turn on?",
        option1: "The captions",
        option2: "The camera",
        option3: "The speaker",
        option4: "The recording",
        answer: "The captions"
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_comprehension", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(level), runner);

    expect(result.output.listening).toEqual(valid.listening);
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it.each(levelCases)("enforces the $cefr speaking language and scoped model answer", async (level) => {
    const output = skillsFor(level).speaking;
    const { runner, runTask } = runnerWith({ weekly_lesson_speaking: output });
    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), runner);

    expect(result.output.speaking?.answer).toBe("Could you confirm the deadline? I will update the client.");
    expect(runTask.mock.calls[0]?.[2]).toMatchObject({
      systemPrompt: expect.stringContaining("model answer may use only actors, actions, quantities, dates, deadlines, reasons and outcomes stated in that item's own prompt")
    });
    expect(runTask.mock.calls[0]?.[2]).toMatchObject({
      systemPrompt: expect.stringContaining("Never ask the learner to justify a quantity, timing, or total against a numeric constraint unless the prompt supplies every value needed to demonstrate that claim")
    });
  });

  it("rejects a dual-act speaking answer that combines opposite requests unnaturally", async () => {
    const level = levelCases[0];
    const validBase = skillsFor(level).speaking;
    const invalid = {
      speaking: {
        ...validBase.speaking,
        prompt: "Hãy yêu cầu đồng nghiệp bật hoặc tắt micro.",
        answer: "Please unmute or mute your microphone."
      }
    };
    const valid = {
      speaking: {
        ...validBase.speaking,
        prompt: "Hãy nói hai câu: một câu khi đồng nghiệp cần bật micro và một câu khi họ cần tắt micro.",
        answer: "Please unmute your microphone. Please mute your microphone."
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_speaking", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", {
      ...skillsInput(level), lessonFocus: "Please mute or unmute your microphone"
    }, runner);

    expect(result.output.speaking).toMatchObject({ prompt: valid.speaking.prompt, answer: valid.speaking.answer });
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("accepts one natural mute request when the focus lists mute and unmute alternatives", async () => {
    const level = levelCases[0];
    const validBase = skillsFor(level).speaking;
    const output = {
      speaking: {
        ...validBase.speaking,
        prompt: "Đồng nghiệp đang gây tiếng ồn. Hãy nhờ họ tắt micro.",
        answer: "Please mute your microphone."
      }
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_speaking: output });

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", {
      ...skillsInput(level), lessonFocus: "Please mute or unmute your microphone"
    }, runner);

    expect(result.output.speaking).toEqual(output.speaking);
    expect(result.semanticAttempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("requires separate contexts for affirmative and negative speaking alternatives", async () => {
    const level = levelCases[0];
    const validBase = skillsFor(level).speaking;
    const invalid = {
      speaking: {
        ...validBase.speaking,
        prompt: "Hãy hỏi người khác có nghe bạn không, rồi trả lời Yes, I can và No, I cannot.",
        answer: "Can you hear me? Yes, I can. No, I cannot."
      }
    };
    const valid = {
      speaking: {
        ...validBase.speaking,
        prompt: "Hãy trả lời trong hai tình huống: khi bạn nghe rõ và khi bạn không nghe được.",
        answer: "Yes, I can. No, I cannot."
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_speaking", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", {
      ...skillsInput(level), lessonFocus: "Can you hear me? Yes, I can / No, I cannot"
    }, runner);

    expect(result.output.speaking).toEqual(valid.speaking);
    expect(result.semanticAttempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("accepts one natural speaking reply when the focus lists affirmative and negative alternatives", async () => {
    const level = levelCases[0];
    const validBase = skillsFor(level).speaking;
    const output = {
      speaking: {
        ...validBase.speaking,
        prompt: "Đồng nghiệp hỏi bạn có nghe rõ không. Hãy trả lời rằng bạn nghe được.",
        answer: "Yes, I can."
      }
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_speaking: output });

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", {
      ...skillsInput(level), lessonFocus: "Can you hear me? Yes, I can / No, I cannot"
    }, runner);

    expect(result.output.speaking).toEqual(output.speaking);
    expect(result.semanticAttempts).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("scopes speaking to the current day and forbids extra scenario requirements", async () => {
    const level = levelCases[2];
    const input = {
      ...skillsInput(level),
      topic: "Video-call troubleshooting for the whole week",
      description: "Handle microphones, unstable connections, attendance, and follow-up actions.",
      objectives: "Solve audio and video problems across the week.",
      keyVocabHint: "microphone, unstable, reconnect, repeat",
      lessonFocus: "Join a video call, greet colleagues, and confirm who is present",
      allLessonFocuses: [
        "Join a video call, greet colleagues, and confirm who is present",
        "Report an unstable connection",
        "Ask a colleague to repeat information",
        "Summarize agreed actions",
        "Close a video call professionally"
      ],
      lessonObjectives: objectiveFor(level)
    };
    const output = skillsFor(level).speaking;
    const runTask = vi.fn(async (taskId: string, receivedInput: unknown, options?: { systemPrompt?: string }) => {
      expect(taskId).toBe("weekly_lesson_speaking");
      const scoped = receivedInput as WeeklyLessonSkillsInput;
      expect(scoped.topic).toBe(input.lessonFocus);
      expect(scoped.description).toContain(input.lessonFocus);
      expect(scoped.objectives).toBe(input.lessonObjectives.lesson_goal);
      expect(scoped.keyVocabHint).toBe(input.lessonFocus);
      expect(new Set(scoped.allLessonFocuses)).toEqual(new Set([input.lessonFocus]));
      expect(options?.systemPrompt).toContain("Do not add unrelated scenario requirements beyond lessonFocus");
      expect(options?.systemPrompt).not.toContain("at least two concrete constraints");
      return { output, metadata: { ...metadata, taskId } };
    });

    await generateWeeklyLessonSkillGroup("skills.speaking", input, { runTask } as unknown as AiTaskRunner);

    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("rejects a chart answer whose month is absent from the speaking prompt", async () => {
    const level = levelCases[2];
    const base = skillsFor(level).speaking.speaking;
    const invalid = {
      speaking: {
        ...base,
        prompt: "Explain the monthly sales chart, then say which month had the highest sales.",
        answer: "The highest sales were in March."
      }
    };
    const valid = {
      speaking: {
        ...base,
        prompt: "The chart shows January at 10, February at 12, and March at 18. Explain it, then say which month had the highest sales.",
        answer: "The highest sales were in March."
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_speaking", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), runner);

    expect(result.output.speaking).toMatchObject({ prompt: valid.speaking.prompt, answer: valid.speaking.answer });
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("accepts a final speaking generation within the configured word-count tolerance", async () => {
    const level = levelCases[3];
    const valid = skillsFor(level).speaking;
    const overlong = {
      speaking: {
        ...valid.speaking,
        answer: "It was decided that the rollout would move from June to September. It was agreed that Maria will send the revised plan by Friday. The training budget remains open, so Tom will check it with finance by next Tuesday before confirming the final schedule."
      }
    };
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_speaking") return { output: overlong, metadata: { ...metadata, taskId } };
      if (taskId === "weekly_lesson_length_repair") return {
        output: { listeningBody: null, readingBody: null, speakingAnswer: overlong.speaking.answer.split(" ") },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), { runTask } as unknown as AiTaskRunner, {
      maxAttempts: 1,
      reviewerFindings: [{ path: ["speaking"], message: "The open point must be explicit." }]
    });

    expect(result.output.speaking?.answer).toBe(overlong.speaking.answer);
    expect(runTask.mock.calls.map(([taskId]) => taskId)).toEqual(["weekly_lesson_speaking"]);
  });

  it("compacts an overlong grounded speaking summary without dropping the required polite close", async () => {
    const level = levelCases[2];
    const valid = skillsFor(level).speaking;
    const answer = "So, to summarise: Sara sends the report by Friday, Tom follows up with the client by Friday, and Lee books the meeting by Thursday. Please remember every deadline and keep the whole team informed after this call. Thanks everyone. Have a good day!";
    const compact = "Recap: Sara sends the report by Friday, Tom follows up with the client by Friday; Lee books the meeting by Thursday. Thanks—speak soon.";
    const overlong = {
      speaking: {
        ...valid.speaking,
        prompt: "You are finishing a team call. Summarise the three action points: Sara sends the report by Friday, Tom follows up by Friday, and Lee books the meeting by Thursday. Then close the call politely.",
        answer,
        questionTranslation: "You are finishing a team call. Summarise the three action points and close the call politely.",
        answerTranslation: answer
      }
    };
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_speaking") return { output: overlong, metadata: { ...metadata, taskId } };
      if (taskId === "weekly_lesson_length_repair") return {
        output: { listeningBody: null, readingBody: null, speakingAnswer: compact.split(" ") },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), { runTask } as unknown as AiTaskRunner, {
      maxAttempts: 1,
      reviewerFindings: [{ path: ["speaking"], message: "Keep every owner and deadline, then close politely." }]
    });

    expect(result.output.speaking?.answer).toBe(compact);
    expect(result.output.speaking?.answer.split(/\s+/u).length).toBeLessThanOrEqual(24);
  });

  it("keeps a complete speaking answer when it remains within the configured tolerance", async () => {
    const level = levelCases[4];
    const base = skillsFor(level).speaking.speaking;
    const required = "Both of your concerns are valid. While Maria needs to respond to the market window, Tom needs full testing to protect quality. Should the testing run past Friday, we will hold a limited beta with a small group of customers, while the full release waits until testing is complete.";
    const redundant = "Neither side gives up its priority under this plan.";
    const overlong = {
      speaking: {
        ...base,
        prompt: "Maria wants speed and Tom wants full testing. Use while and Should inversion, then name a limited beta fallback.",
        answer: `${required} ${redundant}`
      }
    };
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_speaking") return { output: overlong, metadata: { ...metadata, taskId } };
      if (taskId === "weekly_lesson_length_repair") return {
        output: { listeningBody: null, readingBody: null, speakingAnswer: overlong.speaking.answer.split(" ") },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), { runTask } as unknown as AiTaskRunner, { maxAttempts: 1 });

    expect(result.output.speaking?.answer).toBe(`${required} ${redundant}`);
  });

  it("rejects a B1 speaking answer that drops the required polite close", async () => {
    const level = levelCases[2];
    const base = skillsFor(level).speaking.speaking;
    const invalid = {
      speaking: {
        ...base,
        prompt: "Summarise the action points and close the call politely by thanking everyone and saying goodbye.",
        answer: "Sara sends the report Friday; Tom follows up Friday; Lee books the meeting Thursday."
      }
    };
    const valid = {
      speaking: {
        ...invalid.speaking,
        answer: "Sara sends the report Friday; Tom follows up Friday; Lee books the meeting Thursday. Thanks, everyone. Goodbye."
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_speaking", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), runner);

    expect(result.output.speaking).toMatchObject({
      prompt: valid.speaking.prompt,
      answer: valid.speaking.answer,
      questionTranslation: valid.speaking.prompt,
      answerTranslation: valid.speaking.answer
    });
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("preserves an explicitly assigned actor action in the speaking answer", async () => {
    const level = levelCases[3];
    const base = skillsFor(level).speaking.speaking;
    const prompt = "Summarise the meeting. Say that Anna will update the schedule by Friday. Use a participle clause and close politely.";
    const invalid = {
      speaking: {
        ...base,
        prompt,
        answer: "To summarise, updating the schedule by Friday, Anna will keep the team on track. Thanks, goodbye.",
        questionTranslation: prompt,
        answerTranslation: "To summarise, updating the schedule by Friday, Anna will keep the team on track. Thanks, goodbye."
      }
    };
    const valid = {
      speaking: {
        ...invalid.speaking,
        answer: "To summarise, Anna will update the schedule by Friday, keeping the team on track. Thanks, goodbye.",
        answerTranslation: "To summarise, Anna will update the schedule by Friday, keeping the team on track. Thanks, goodbye."
      }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_speaking", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), runner);

    expect(result.output.speaking?.answer).toContain("Anna will update the schedule by Friday");
    expect(result.attempts).toBe(2);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("accepts compact present-tense summaries that preserve every assigned actor action and deadline", async () => {
    const level = levelCases[2];
    const base = skillsFor(level).speaking.speaking;
    const prompt = "Maria will send the budget by Friday. Tom will book the room by Wednesday. Priya will update the timeline by Monday. Summarise and close politely.";
    const answer = "Maria sends the budget Friday; Tom books the room Wednesday; Priya updates the timeline Monday. Thanks, everyone. Goodbye.";
    const output = {
      speaking: {
        ...base,
        prompt,
        answer,
        questionTranslation: prompt,
        answerTranslation: answer
      }
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_speaking: output });

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), runner);

    expect(result.output.speaking?.answer).toBe(answer);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("preserves explicitly required closing phrases while compacting a B1 answer", async () => {
    const level = levelCases[2];
    const base = skillsFor(level).speaking.speaking;
    const answer = "So, to recap: Anna will update the design by Monday, Ben will test the checkout by Wednesday, and I'll send the notes by Friday. Please keep the full team informed after the call. Thanks for your time. Speak to you soon.";
    const overlong = {
      speaking: {
        ...base,
        prompt: "Summarise all three actions. Then close using the phrases \"Thanks for your time\" and \"Speak to you soon\".",
        answer
      }
    };
    const runTask = vi.fn(async (taskId: string) => {
      if (taskId === "weekly_lesson_speaking") return { output: overlong, metadata: { ...metadata, taskId } };
      if (taskId === "weekly_lesson_length_repair") return {
        output: { listeningBody: null, readingBody: null, speakingAnswer: answer.split(" ") },
        metadata: { ...metadata, taskId }
      };
      throw new Error(`UNEXPECTED_TASK:${taskId}`);
    });

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), { runTask } as unknown as AiTaskRunner, { maxAttempts: 1 });

    expect(result.output.speaking?.answer).toContain("Thanks for your time");
    expect(result.output.speaking?.answer).toContain("Speak to you soon");
    expect(result.output.speaking?.answer.split(/\s+/u).length).toBeLessThanOrEqual(35);
  });

  it("accepts one quoted signposting phrase when the prompt presents alternatives", async () => {
    const level = levelCases[4];
    const base = skillsFor(level).speaking.speaking;
    const prompt = "Open the meeting using a signposting phrase such as \"The purpose of today's meeting is to...\" or \"Our primary objective is to...\". Then begin the agenda.";
    const answer = "Good morning. The purpose of today's meeting is to review progress and agree next steps. First, let's review the budget.";
    const output = {
      speaking: {
        ...base,
        prompt,
        answer,
        questionTranslation: prompt,
        answerTranslation: answer
      }
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_speaking: output });

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), runner, { maxAttempts: 1 });

    expect(result.output.speaking?.answer).toBe(answer);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("requires the speaking frame but does not force the learner to echo a manager question", async () => {
    const level = levelCases[2];
    const base = skillsFor(level).speaking.speaking;
    const prompt = "Your manager asks: \"Why did maintenance expenditure go over plan this month?\" Reply directly. Use the frame \"The overspend was caused by urgent repairs that we had not forecast.\" Also use one of these words: justify, variance, approve. Include the affected area.";
    const answer = "The overspend was caused by urgent repairs that we had not forecast. This variance affected maintenance, which justifies the request.";
    const output = { speaking: { ...base, prompt, answer, questionTranslation: prompt, answerTranslation: answer } };
    const { runner, runTask } = runnerWith({ weekly_lesson_speaking: output });

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), runner, { maxAttempts: 1 });

    expect(result.output.speaking?.answer).toBe(answer);
    expect(result.output.speaking?.answer).not.toContain("Why did maintenance");
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("accepts a natural completion of a placeholder slot in a required speaking frame", () => {
    const findings = deterministicSkillsFindings({
      speaking: {
        prompt: "Explain the trade-off. Use the frame \"Although the cost is higher, expediting the order would mitigate + risk.\"",
        answer: "Although the cost is higher, expediting the order would mitigate delivery risk."
      }
    } as any, "C1");

    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["speaking", "answer"], message: expect.stringContaining("exact phrases") })
    ]));
  });

  it("repairs a speaking answer that omits an explicitly required polite approval request", async () => {
    const level = levelCases[3];
    const base = skillsFor(level).speaking.speaking;
    const prompt = "Explain the $5,000 cost overrun. End by politely asking Mr. Hale to approve the adjustment.";
    const invalid = { speaking: { ...base, prompt, answer: "The project has a $5,000 cost overrun.", questionTranslation: prompt, answerTranslation: "The project has a $5,000 cost overrun." } };
    const validAnswer = "The project has a $5,000 cost overrun. Could you please approve this adjustment, Mr. Hale?";
    const valid = { speaking: { ...base, prompt, answer: validAnswer, questionTranslation: prompt, answerTranslation: validAnswer } };
    const { runner, runTask } = sequencedRunner("weekly_lesson_speaking", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), runner);

    expect(result.output.speaking?.answer).toBe(validAnswer);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("repairs a conditional approval phrase when the prompt requires an actual approval request", async () => {
    const level = levelCases[3];
    const base = skillsFor(level).speaking.speaking;
    const prompt = "Justify the extra work and ask Mr. Hale to approve the adjustment.";
    const invalidAnswer = "The extra work is justified. If the adjustment is approved, we will reallocate the funds.";
    const validAnswer = "The extra work is justified. Mr. Hale, could you please approve this adjustment?";
    const invalid = { speaking: { ...base, prompt, answer: invalidAnswer, questionTranslation: prompt, answerTranslation: invalidAnswer } };
    const valid = { speaking: { ...base, prompt, answer: validAnswer, questionTranslation: prompt, answerTranslation: validAnswer } };
    const { runner, runTask } = sequencedRunner("weekly_lesson_speaking", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), runner);

    expect(result.output.speaking?.answer).toBe(validAnswer);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("repairs a speaking answer that omits a mandatory if-condition from its prompt", async () => {
    const level = levelCases[4];
    const base = skillsFor(level).speaking.speaking;
    const prompt = "Present two options and their trade-offs. If the overrun continues, rethink the timeline for the warehouse. Use the frame: 'Deferring the expansion would ease pressure on cash, although it would delay the planned returns.'";
    const incompleteAnswer = "Deferring the expansion would ease pressure on cash, although it would delay the planned returns. Consolidating suppliers would save money, although it would reduce flexibility.";
    const completeAnswer = `${incompleteAnswer} If the overrun continues, we should rethink the warehouse timeline.`;
    const invalid = { speaking: { ...base, prompt, answer: incompleteAnswer, questionTranslation: prompt, answerTranslation: incompleteAnswer } };
    const valid = { speaking: { ...base, prompt, answer: completeAnswer, questionTranslation: prompt, answerTranslation: completeAnswer } };
    const { runner, runTask } = sequencedRunner("weekly_lesson_speaking", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), runner);

    expect(result.output.speaking?.answer).toContain("If the overrun continues");
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it("counts a multi-word target phrase as one requested speaking item", async () => {
    const level = levelCases[4];
    const base = skillsFor(level).speaking.speaking;
    const prompt = "Defend the proposal. Use at least two of these words: justification, sensitivity analysis, fiscal discipline, variance, approve.";
    const answer = "The savings support fiscal discipline, so I ask the board to approve the proposal.";
    const output = { speaking: { ...base, prompt, answer, questionTranslation: prompt, answerTranslation: answer } };
    const { runner, runTask } = runnerWith({ weekly_lesson_speaking: output });

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(level), runner, { maxAttempts: 1 });

    expect(result.output.speaking?.answer).toBe(answer);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("repairs speaking figures that contradict a required percentage frame", async () => {
    const level = levelCases[2];
    const base = skillsFor(level).speaking.speaking;
    const objective = objectiveFor(level);
    const percentageObjective = {
      ...objective.items[1]!,
      assessmentCode: "speaking" as const,
      target_language: ["Our total spending was higher than planned by ten percent."],
      text: "Present total spending using the required ten percent comparison.",
      condition: "Given planned and actual totals",
      criterion: "State that actual spending was ten percent higher than planned",
      success_evidence: "The figures and sentence agree"
    };
    const lessonObjectives = {
      ...objective,
      items: [objective.items[0]!, percentageObjective]
    };
    const invalidPrompt = "Table: Total planned $30,000, total actual $30,000. Present the result.";
    const invalid = { speaking: { ...base, prompt: invalidPrompt, answer: "Our total spending was on plan at $30,000.", questionTranslation: invalidPrompt, answerTranslation: "Our total spending was on plan at $30,000." } };
    const validPrompt = "Table: Total planned $30,000, total actual $33,000. Present the result.";
    const validAnswer = "Our total spending was higher than planned by ten percent.";
    const valid = { speaking: { ...base, prompt: validPrompt, answer: validAnswer, questionTranslation: validPrompt, answerTranslation: validAnswer } };
    const { runner, runTask } = sequencedRunner("weekly_lesson_speaking", [invalid, valid]);

    const result = await generateWeeklyLessonSkillGroup("skills.speaking", { ...skillsInput(level), lessonObjectives }, runner);

    expect(result.output.speaking?.prompt).toContain("$33,000");
    expect(result.output.speaking?.answer).toBe(validAnswer);
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it.each(levelCases)("accepts an approved $cefr independent skills review", async (level) => {
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: approvedReview });
    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never, { rejectFindings: true });

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("ignores reviewer prose that is not one of the closed exercise options", async () => {
    const level = levelCases[2];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const review = {
      ...approvedReview,
      solvedAnswers: { ...approvedReview.solvedAnswers, listening: "Listening is not assessed in this lesson" }
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: review });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("drops a reviewer finding that explicitly says it is only a note and the exercise is usable", async () => {
    const level = levelCases[3];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const review = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "speaking" as const,
        reasonCode: "insufficient_context" as const,
        message: "This finding is only a note; the speaking exercise is otherwise usable."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: review });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("drops a false reviewer complaint when the required passive actions are already joined by and", async () => {
    const level = levelCases[3];
    const generated = skillsFor(level);
    const prompt = "In one spoken sentence joined by 'and', describe the two actions: the additional funds were approved and the project was rescheduled. If the schedule proves unrealistic, rethink the timeline.";
    const answer = "The additional funds were approved and the project was rescheduled. If the schedule proves unrealistic, we would rethink the timeline.";
    const speaking = { ...generated.speaking.speaking, prompt, answer, questionTranslation: prompt, answerTranslation: answer };
    const skills = { ...generated.comprehension, ...generated.languagePractice, speaking };
    const review = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "speaking" as const,
        reasonCode: "feedback_mismatch" as const,
        message: "The model answer gives three separate sentences and omits the 'joined by and' structure."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: review });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("does not demand every target-language alternative in one mapped MCQ", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const writing = {
      ...generated.languagePractice.writing,
      prompt: "The ___ this month is high.",
      option1: "cost", option2: "money", option3: "month", option4: "office", answer: "cost"
    };
    const skills = { ...generated.comprehension, ...generated.languagePractice, writing, ...generated.speaking };
    const objective = objectiveFor(level);
    const lessonObjectives = {
      ...objective,
      items: objective.items.map((item, index) => index === 1 ? {
        ...item,
        id: "L1",
        assessmentCode: "writing" as const,
        text: "Sau bài học, bạn có thể điền đúng từ cost, high hoặc low.",
        criterion: "Chọn đúng cost, high hoặc low.",
        success_evidence: "Một lựa chọn đúng trong các từ thay thế.",
        target_language: ["cost", "high", "low"]
      } : item)
    };
    const review = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "writing" as const,
        reasonCode: "feedback_mismatch" as const,
        message: "Objective L1 requires filling cost, high, or low, but the item only tests the word cost. It does not measure high or low."
      }],
      solvedAnswers: { ...approvedReview.solvedAnswers, writing: "cost" }
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: review });

    const result = await reviewWeeklyLessonSkills(runner, { ...skillsInput(level), lessonObjectives }, skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("normalizes an off-target reviewer finding that was mislabeled as key_mismatch", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const mislabeled = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "wordUse" as const,
        reasonCode: "key_mismatch" as const,
        message: "The solved answer is correct, but the item title and prompt do not test the stated target, so the feedback is off-target."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: mislabeled });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), {
      ...generated.comprehension, ...generated.languagePractice, ...generated.speaking
    } as never);

    expect(result.output.findings).toEqual([
      expect.objectContaining({ exerciseCode: "wordUse", reasonCode: "feedback_mismatch" })
    ]);
  });

  it("normalizes an open speaking key mismatch into a repairable evidence finding", async () => {
    const level = levelCases[2];
    const generated = skillsFor(level);
    const review = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "speaking" as const,
        reasonCode: "key_mismatch" as const,
        message: "The main variance is defensible, but the forecast claim is unsupported by the table."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: review });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), {
      ...generated.comprehension, ...generated.languagePractice, ...generated.speaking
    } as never);

    expect(result.output.findings).toEqual([
      expect.objectContaining({ exerciseCode: "speaking", reasonCode: "insufficient_context" })
    ]);
  });

  it("normalizes an unsupported-evidence finding mislabeled as key_mismatch", async () => {
    const level = levelCases[3];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const mislabeled = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "listening" as const,
        reasonCode: "key_mismatch" as const,
        message: "The body never states this cause, so the keyed claim goes beyond the evidence."
      }],
      solvedAnswers: { ...approvedReview.solvedAnswers, listening: skills.listening.answer }
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: mislabeled });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.findings).toEqual([
      expect.objectContaining({ exerciseCode: "listening", reasonCode: "insufficient_context" })
    ]);
  });

  it("normalizes a reviewer saying the audio never says the keyed claim", async () => {
    const level = levelCases[3];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const mislabeled = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "listening" as const,
        reasonCode: "key_mismatch" as const,
        message: "The audio never says Priya must confirm she can take the role. Tom only suggests she be accountable."
      }],
      solvedAnswers: { ...approvedReview.solvedAnswers, listening: skills.listening.answer }
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: mislabeled });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.findings).toEqual([
      expect.objectContaining({ exerciseCode: "listening", reasonCode: "insufficient_context" })
    ]);
  });

  it("drops a self-withdrawn key mismatch when the reviewer solved the same key", async () => {
    const level = levelCases[3];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const selfWithdrawn = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "listening" as const,
        reasonCode: "key_mismatch" as const,
        message: "The body supports the key. No defect in key; review confirmed only if other exercises are fixed."
      }],
      solvedAnswers: { ...approvedReview.solvedAnswers, listening: skills.listening.answer }
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: selfWithdrawn });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.output.findings).toEqual([]);
  });

  it("drops a reviewer note that explicitly says the key is consistent and withdraws itself", async () => {
    const level = levelCases[2];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const review = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "reading" as const,
        reasonCode: "feedback_mismatch" as const,
        message: "The key is consistent with the text. Withdrawn on closer review; see another exercise instead."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: review });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.output.findings).toEqual([]);
  });

  it("accepts a named direct address as clear evidence for who cannot be heard", async () => {
    const level = levelCases[1];
    const generated = skillsFor(level);
    const listening = {
      ...generated.comprehension.listening,
      body: "Maria, I can see you on the camera, but I cannot hear you clearly today. Please check your connection.",
      prompt: "Người nói không nghe rõ ai?",
      option1: "Maria",
      option2: "The manager",
      option3: "The camera",
      option4: "Everyone",
      answer: "Maria"
    };
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking, listening };
    const review = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "listening" as const,
        reasonCode: "insufficient_context" as const,
        message: "The answer Maria is uncertain because it is unclear who 'you' refers to."
      }],
      solvedAnswers: { ...approvedReview.solvedAnswers, listening: "Maria" }
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: review });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.output.findings).toEqual([]);
  });

  it("drops an insufficient-context note that explicitly accepts the model answer", async () => {
    const level = levelCases[3];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const accepted = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "writing" as const,
        reasonCode: "insufficient_context" as const,
        message: "The model answer adds a detail, but the answer is acceptable for the open prompt. Consider aligning the hint."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: accepted });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.output.findings).toEqual([]);
  });

  it("normalizes a Vietnamese context mismatch mislabeled as key_mismatch", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const mislabeled = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "writing" as const,
        reasonCode: "key_mismatch" as const,
        message: "Khóa đáp án Yes, I can đúng, nhưng không khớp với tình huống; ngữ cảnh cần đổi."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: mislabeled });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), {
      ...generated.comprehension, ...generated.languagePractice, ...generated.speaking
    } as never);

    expect(result.output.findings).toEqual([
      expect.objectContaining({ exerciseCode: "writing", reasonCode: "feedback_mismatch" })
    ]);
  });

  it("normalizes missing direct evidence mislabeled as key_mismatch", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const mislabeled = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "listening" as const,
        reasonCode: "key_mismatch" as const,
        message: "Đáp án hiện khớp key nhưng văn bản chưa nêu rõ yêu cầu; cần bổ sung câu trực tiếp."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: mislabeled });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), {
      ...generated.comprehension, ...generated.languagePractice, ...generated.speaking
    } as never);

    expect(result.output.findings).toEqual([
      expect.objectContaining({ exerciseCode: "listening", reasonCode: "insufficient_context" })
    ]);
  });

  it("discards a reviewer finding that applies an objective to the wrong exercise", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const objective = objectiveFor(level);
    const lessonObjectives = {
      ...objective,
      items: objective.items.map((item, index) => index === 0
        ? { ...item, id: "C1", assessmentCode: "writing" as const }
        : item)
    };
    const wrongMapping = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "speaking" as const,
        reasonCode: "feedback_mismatch" as const,
        message: "Mục tiêu C1 yêu cầu chào hỏi, nhưng speaking không đo mục tiêu C1."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: wrongMapping });

    const result = await reviewWeeklyLessonSkills(runner, {
      ...skillsInput(level), lessonObjectives
    }, {
      ...generated.comprehension, ...generated.languagePractice, ...generated.speaking
    } as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("does not reject an A1 writing MCQ only because the reviewer expected free writing", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const formatOnlyReview = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "writing" as const,
        reasonCode: "feedback_mismatch" as const,
        message: "Bài writing chỉ là trắc nghiệm và không đo việc viết câu hỏi; cần đổi thành free-response."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: formatOnlyReview });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), {
      ...generated.comprehension, ...generated.languagePractice, ...generated.speaking
    } as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("normalizes a hint disclosure that was mislabeled as key_mismatch", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const mislabeled = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "wordUse" as const,
        reasonCode: "key_mismatch" as const,
        message: "Đáp án Goodbye là đúng, nhưng hint làm lộ đáp án trực tiếp."
      }]
    };
    const skills = {
      ...generated.comprehension,
      ...generated.languagePractice,
      ...generated.speaking,
      wordUse: { ...generated.languagePractice.wordUse, answer: "Goodbye", hint: "Đây là lời Goodbye khi kết thúc." }
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: {
      ...mislabeled,
      solvedAnswers: { ...mislabeled.solvedAnswers, wordUse: "Goodbye" }
    } });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.findings).toEqual([
      expect.objectContaining({ exerciseCode: "wordUse", reasonCode: "hint_reveals_answer" })
    ]);
  });

  it("tells the reviewer to treat the daily lesson focus as the exact scope", async () => {
    const level = levelCases[3];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const { runner, runTask } = runnerWith({ weekly_lesson_skills_reviewer: approvedReview });

    await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never, { rejectFindings: true });

    expect(JSON.stringify(runTask.mock.calls[0])).toContain("lessonFocus is the exact scope for this day");
    expect(JSON.stringify(runTask.mock.calls[0])).toContain("keyVocabHint are broader week context only");
  });

  it("filters self-contradictory reviewer findings without wasting a retry", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const contradictoryReview = {
      ...approvedReview,
      status: "needs_revision",
      findings: [
        { exerciseCode: "writing", reasonCode: "feedback_mismatch", message: "The model answer is accurate; no revision needed on accuracy." },
        { exerciseCode: "speaking", reasonCode: "insufficient_context", message: "The answer is 19 words, exceeding speakingAnswerWordMax of 16; use 16 words or fewer." },
        { exerciseCode: "reading", reasonCode: "multiple_valid_answers", message: "The explanation is clear. No real defect found; reconsider only if another option is plausible." },
        { exerciseCode: "writing", reasonCode: "multiple_valid_answers", message: "Đáp án Yes, I can là đáp án duy nhất đúng; các phương án còn lại đều sai. Không có vấn đề về key." },
        { exerciseCode: "speaking", reasonCode: "feedback_mismatch", message: "The model answer does not add another consequence beyond the missed deadline; this is acceptable. Objective C1 requires a stated consequence, which is present." },
        { exerciseCode: "speaking", reasonCode: "feedback_mismatch", message: "The model uses the required frame and target words. No further defect here; retain only the other finding if revision is requested." },
        { exerciseCode: "writing", reasonCode: "insufficient_context", message: "The figure is consistent with the reading and the answer is acceptable. However, no writing lessonObjective exists, so this support exercise is outside the approved assessed scope." }
      ]
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_skills_reviewer", [contradictoryReview, approvedReview]);

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("does not treat a navigation-only hint as revealing the answer", async () => {
    const level = levelCases[2];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const navigationHintReview = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "reading" as const,
        reasonCode: "hint_reveals_answer" as const,
        message: "The hint tells the learner to look at the email after the call. Use a less direct hint."
      }]
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_skills_reviewer: navigationHintReview });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("does not reject an exercise as out of scope when it uses the exact lesson action", async () => {
    const level = levelCases[2];
    const generated = skillsFor(level);
    const reading = {
      ...generated.comprehension.reading,
      body: `${generated.comprehension.reading.body} Could you clarify the deadline in the document?`,
      prompt: "What should the colleague clarify?",
      option1: "The deadline",
      option2: "The camera",
      option3: "The room",
      option4: "The invoice",
      answer: "The deadline"
    };
    const skills = { ...generated.comprehension, reading, ...generated.languagePractice, ...generated.speaking };
    const scopedReview = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "reading" as const,
        reasonCode: "outside_taught_scope" as const,
        message: "The passage is mostly about another detail and is slightly off-focus; consider centring it on clarification."
      }],
      solvedAnswers: { ...approvedReview.solvedAnswers, reading: "The deadline" }
    };
    const scopedInput = { ...skillsInput(level), lessonFocus: "Explain a connection problem and ask someone to repeat or clarify information" };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: scopedReview });

    const result = await reviewWeeklyLessonSkills(runner, scopedInput, skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("drops a scope-only table complaint when the answer is explicitly stated", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const review = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "listening" as const,
        reasonCode: "insufficient_context" as const,
        message: "The answer is stated in the body. However, no table is presented, so the item does not test table reading in the lesson focus."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: review });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("does not require the word-class support exercise to test the day's grammar focus", async () => {
    const level = levelCases[3];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const supportExerciseReview = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "wordClass" as const,
        reasonCode: "outside_taught_scope" as const,
        message: "The word-class item is a basic noun identification task and does not target reporting passives or participle clauses."
      }]
    };
    const scopedInput = { ...skillsInput(level), lessonFocus: "Use reporting passives and participle clauses to summarise a decision" };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: supportExerciseReview });

    const result = await reviewWeeklyLessonSkills(runner, scopedInput, skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("does not require a legacy answer support field to contain a grammar rationale", async () => {
    const level = levelCases[2];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const rationaleReview = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "wordClass" as const,
        reasonCode: "feedback_mismatch" as const,
        message: "The answerTranslation is only a definition and does not explain why the answer is a noun after 'the'."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: rationaleReview });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("does not reject a required B2 inference as a multiple-answer defect", async () => {
    const level = levelCases[3];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const inferenceReview = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "reading" as const,
        reasonCode: "multiple_valid_answers" as const,
        message: "The answer is defensible but is supported only by inference; phrase the question to state the context directly."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: inferenceReview });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("rejects a self-contradictory multiple-answer finding when the reviewer says every other option is wrong", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const contradictoryReview = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "wordClass" as const,
        reasonCode: "multiple_valid_answers" as const,
        message: "Câu hỏi có hai đáp án đúng. Tuy nhiên, các đáp án khác cũng không đúng ngữ pháp nên chỉ có đáp án hear là phù hợp."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: contradictoryReview });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("does not treat a C1 inferred answer as multiple-valid when no second option is identified", async () => {
    const level = levelCases[4];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const inferenceReview = {
      ...approvedReview,
      status: "needs_revision" as const,
      findings: [{
        exerciseCode: "reading" as const,
        reasonCode: "multiple_valid_answers" as const,
        message: "The keyed answer is inferred from the passage, but the hint makes that inference easier and the key is weakly distinct from other inferences; consider a sharper distractor-based check."
      }]
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: inferenceReview });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("keeps a real defect whose Vietnamese explanation starts with 'Đáp án đúng'", async () => {
    const level = levelCases[1];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const realFindingReview = {
      ...approvedReview,
      status: "needs_revision",
      findings: [
        {
          exerciseCode: "writing",
          reasonCode: "invalid_distractor",
          message: "Đáp án đúng 'Could you unmute, please?' thiếu tân ngữ và cần được viết rõ hơn."
        }
      ]
    };
    const { runner, runTask } = runnerWith({ weekly_lesson_skills_reviewer: realFindingReview });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("needs_revision");
    expect(result.findings).toEqual([
      {
        path: ["writing"],
        message: "invalid_distractor: Đáp án đúng 'Could you unmute, please?' thiếu tân ngữ và cần được viết rõ hơn."
      }
    ]);
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("retries a reviewer response with an extra solved-answer field", async () => {
    const level = levelCases[4];
    const generated = skillsFor(level);
    const skills = { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
    const reviewWithOpenAnswer = {
      ...approvedReview,
      solvedAnswers: { ...approvedReview.solvedAnswers, speaking: "An optional model answer." }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_skills_reviewer", [reviewWithOpenAnswer, approvedReview]);

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(level), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.output.solvedAnswers).not.toHaveProperty("speaking");
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it.each(levelCases)("runs the canonical component order for $cefr without legacy task aliases", async (level) => {
    const calls: string[] = [];
    const generated = skillsFor(level);
    const outputs = {
      weekly_lesson_grammar_classifier: grammarClassification,
      weekly_lesson_objectives: { objective: objectiveFor(level) },
      weekly_lesson_foundation: foundationFor(level),
      weekly_lesson_vocabulary: vocabularyFor(level),
      weekly_lesson_comprehension: generated.comprehension,
      weekly_lesson_language_practice: generated.languagePractice,
      weekly_lesson_speaking: generated.speaking,
      weekly_lesson_skills_reviewer: approvedReview
    };
    const { runner } = runnerWith(outputs, calls);

    const grammar = await generateWeeklyLessonGrammarClassification(inputFor(level), runner, { qualityReview: true });
    await generateWeeklyLessonObjectives({ ...inputFor(level), grammarClassification: grammar.output, pronunciationPlan }, "Generate objectives.", runner);
    const foundation = await generateWeeklyLessonFoundation({ ...inputFor(level), grammarClassification: grammar.output, pronunciationPlan }, "Generate foundation.", runner, { qualityProfile: "strict" });
    const vocabulary = await generateWeeklyLessonVocabulary({
      ...inputFor(level), grammarFormula: foundation.output.grammar?.formula ?? null,
      grammarExamples: foundation.output.grammar ? [foundation.output.grammar.example1, foundation.output.grammar.example2] : null,
      excludedVocabulary: []
    }, runner);
    const downstreamInput = {
      ...skillsInput(level),
      vocabularyWords: [vocabulary.output.word1.word, vocabulary.output.word2.word, vocabulary.output.word3.word]
    };
    const comprehension = await generateWeeklyLessonSkillGroup("skills.comprehension", downstreamInput, runner);
    const languagePractice = await generateWeeklyLessonSkillGroup("skills.languagePractice", downstreamInput, runner);
    const speaking = await generateWeeklyLessonSkillGroup("skills.speaking", downstreamInput, runner);
    await reviewWeeklyLessonSkills(runner, downstreamInput, {
      ...comprehension.output, ...languagePractice.output, ...speaking.output
    } as never, { rejectFindings: true });

    expect(calls).toEqual([
      "weekly_lesson_grammar_classifier", "weekly_lesson_objectives", "weekly_lesson_foundation",
      "weekly_lesson_vocabulary", "weekly_lesson_comprehension", "weekly_lesson_language_practice",
      "weekly_lesson_speaking", "weekly_lesson_skills_reviewer"
    ]);
  });

  it.each(levelCases)("completes the current vertical day pipeline for $cefr", async (level) => {
    const calls: string[] = [];
    const generated = skillsFor(level);
    const { runner } = runnerWith({
      weekly_lesson_grammar_classifier: grammarClassification,
      weekly_lesson_objectives: { objective: objectiveFor(level) },
      weekly_lesson_foundation: foundationFor(level),
      weekly_lesson_vocabulary: vocabularyFor(level),
      weekly_lesson_comprehension: generated.comprehension,
      weekly_lesson_language_practice: generated.languagePractice,
      weekly_lesson_speaking: generated.speaking,
      weekly_lesson_skills_reviewer: approvedReview
    }, calls);

    const result = await generateWeeklyLessonDayPipeline(
      inputFor(level),
      "Generate one complete lesson.",
      runner
    );

    expect(calls).toEqual([
      "weekly_lesson_grammar_classifier", "weekly_lesson_objectives", "weekly_lesson_foundation",
      "weekly_lesson_vocabulary", "weekly_lesson_comprehension", "weekly_lesson_language_practice",
      "weekly_lesson_speaking", "weekly_lesson_skills_reviewer"
    ]);
    expect(result.lesson.parts.map((part) => part.code)).toEqual(expect.arrayContaining([
      "objective", "instruction", "vocabulary", "grammar", "pronunciation",
      "listening", "reading", "writing", "word_class", "word_use", "speaking"
    ]));
    expect(result.checkpoints.map((checkpoint) => checkpoint.component)).toEqual([
      "grammarClassification", "objectives", "foundation", "vocabulary",
      "skills.comprehension", "skills.languagePractice", "skills.speaking", "skills.reviewer", "assemble"
    ]);
    expect(result.checkpoints.every((checkpoint) => checkpoint.cefr === level.cefr)).toBe(true);
  });

  it("does not silently approve a structurally valid skill group that still violates hard component rules", async () => {
    const level = levelCases[0];
    const generated = skillsFor(level);
    const invalidComprehension = {
      ...generated.comprehension,
      listening: {
        ...generated.comprehension.listening,
        body: "Hi, I am Minh."
      }
    };
    const { runner } = runnerWith({
      weekly_lesson_grammar_classifier: grammarClassification,
      weekly_lesson_objectives: { objective: objectiveFor(level) },
      weekly_lesson_foundation: foundationFor(level),
      weekly_lesson_vocabulary: vocabularyFor(level),
      weekly_lesson_comprehension: invalidComprehension,
      weekly_lesson_language_practice: generated.languagePractice,
      weekly_lesson_speaking: generated.speaking,
      weekly_lesson_skills_reviewer: approvedReview
    });

    await expect(generateWeeklyLessonDayPipeline(
      inputFor(level),
      "Generate one complete lesson.",
      runner
    )).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
      issues: [expect.objectContaining({
        message: expect.stringContaining("listening body must contain")
      })]
    });
  });

  it("does not salvage a structurally valid objective that still violates semantic rules", async () => {
    const level = levelCases[0];
    const invalidObjective = {
      ...objectiveFor(level),
      items: objectiveFor(level).items.map((item) => item.type === "language"
        ? { ...item, target_language: ["tháng", "số tiền"] }
        : item)
    };
    const { runner } = runnerWith({
      weekly_lesson_grammar_classifier: grammarClassification,
      weekly_lesson_objectives: { objective: invalidObjective }
    });

    await expect(generateWeeklyLessonDayPipeline(
      inputFor(level),
      "Generate one complete lesson.",
      runner
    )).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
      issues: [expect.objectContaining({
        message: expect.stringContaining("objective_target_language_must_be_English")
      })]
    });
  });
});

describe("direct component repair budgets", () => {
  const a1 = levelCases[0];
  const validSkills = skillsFor(a1);
  const englishA1Foundation = {
    ...foundationFor(a1),
    instruction: { title: "Instructions", step1: "Listen.", step2: "Read.", step3: "Speak." },
    grammar: { ...foundationFor(a1).grammar, usage: "Use this frame to confirm information." },
    pronunciation: { ...foundationFor(a1).pronunciation, tip: "Open the mouth and glide upward." }
  };
  const invalidA1Vocabulary = {
    ...vocabularyFor(a1),
    word1: { ...vocabularyFor(a1).word1, meaning: "to confirm" },
    word2: { ...vocabularyFor(a1).word2, meaning: "to clarify" },
    word3: { ...vocabularyFor(a1).word3, meaning: "to approve" }
  };
  const invalidReview = {
    ...approvedReview,
    findings: [{ exerciseCode: "listening", reasonCode: "key_mismatch", message: "The key is unsupported." }]
  };

  const componentCases = [
    {
      component: "grammarClassification", taskId: "weekly_lesson_grammar_classifier",
      invalid: { ...grammarClassification, evidence: [{ sourceRef: "lessonFocus", quote: "invented evidence" }] }, valid: grammarClassification,
      invoke: (runner: AiTaskRunner) => generateWeeklyLessonGrammarClassification(inputFor(a1), runner, { qualityReview: true })
    },
    {
      component: "objectives", taskId: "weekly_lesson_objectives",
      invalid: { objective: { ...objectiveFor(a1), explanationLanguage: "en" } }, valid: { objective: objectiveFor(a1) },
      invoke: (runner: AiTaskRunner) => generateWeeklyLessonObjectives(objectivesInput(a1), "Generate objectives.", runner)
    },
    {
      component: "foundation", taskId: "weekly_lesson_foundation",
      invalid: englishA1Foundation, valid: foundationFor(a1),
      invoke: (runner: AiTaskRunner) => generateWeeklyLessonFoundation(objectivesInput(a1), "Generate foundation.", runner, { qualityProfile: "strict" })
    },
    {
      component: "vocabulary", taskId: "weekly_lesson_vocabulary",
      invalid: invalidA1Vocabulary, valid: vocabularyFor(a1),
      invoke: (runner: AiTaskRunner) => generateWeeklyLessonVocabulary({
        ...inputFor(a1), grammarFormula: "Could you confirm + noun?",
        grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"], excludedVocabulary: []
      }, runner)
    },
    {
      component: "skills.comprehension", taskId: "weekly_lesson_comprehension",
      invalid: { ...validSkills.comprehension, listening: { ...validSkills.comprehension.listening, prompt: "When is the meeting" } },
      valid: validSkills.comprehension,
      invoke: (runner: AiTaskRunner) => generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(a1), runner)
    },
    {
      component: "skills.languagePractice", taskId: "weekly_lesson_language_practice",
      invalid: { ...validSkills.languagePractice, writing: { ...validSkills.languagePractice.writing, type: "write" } },
      valid: validSkills.languagePractice,
      invoke: (runner: AiTaskRunner) => generateWeeklyLessonSkillGroup("skills.languagePractice", skillsInput(a1), runner)
    },
    {
      component: "skills.speaking", taskId: "weekly_lesson_speaking",
      invalid: { speaking: { ...validSkills.speaking.speaking, answer: "" } },
      valid: validSkills.speaking,
      invoke: (runner: AiTaskRunner) => generateWeeklyLessonSkillGroup("skills.speaking", skillsInput(a1), runner)
    },
    {
      component: "skills.reviewer", taskId: "weekly_lesson_skills_reviewer",
      invalid: invalidReview, valid: approvedReview,
      invoke: (runner: AiTaskRunner) => reviewWeeklyLessonSkills(runner, skillsInput(a1), {
        ...validSkills.comprehension, ...validSkills.languagePractice, ...validSkills.speaking
      } as never, { rejectFindings: true })
    }
  ];

  it.each(componentCases)("repairs $component once and returns the validated checkpoint", async ({ taskId, invalid, valid, invoke }) => {
    const { runner, runTask } = sequencedRunner(taskId, [invalid, valid]);

    await expect(invoke(runner)).resolves.toBeDefined();
    expect(runTask).toHaveBeenCalledTimes(2);
  });

  it.each(componentCases)("rejects $component after its invalid-attempt budget", async ({ taskId, invalid, invoke }) => {
    const expectedAttempts = 3;
    const { runner, runTask } = sequencedRunner(taskId, Array(expectedAttempts).fill(invalid));

    await expect(invoke(runner)).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
    expect(runTask).toHaveBeenCalledTimes(expectedAttempts);
  });

  it("rejects a vocabulary component after 3 attempts when all three words still miss relations", async () => {
    const a1 = levelCases[0];
    const baseVocab = vocabularyFor(a1);
    const noRelationsMissed = {
      ...baseVocab,
      word1: { ...baseVocab.word1, synonym1: null, synonym2: null, antonym1: null },
      word2: { ...baseVocab.word2, synonym1: null, synonym2: null, antonym1: null },
      word3: { ...baseVocab.word3, synonym1: null, synonym2: null, antonym1: null }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [
      noRelationsMissed,
      noRelationsMissed,
      noRelationsMissed
    ]);

    await expect(generateWeeklyLessonVocabulary(
      { ...inputFor(a1), grammarFormula: "Could you confirm + noun?", grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"] },
      runner
    )).rejects.toBeDefined();

    expect(runTask).toHaveBeenCalledTimes(3);
  });

  it("accepts calendar labels and identifiers without relations in one attempt", async () => {
    const a1 = levelCases[0];
    const baseVocab = vocabularyFor(a1);
    const justifiedNoRelations = {
      ...baseVocab,
      word1: { ...baseVocab.word1, word: "Monday", ttsText: "Monday", ssml: "<speak>Monday</speak>", meaning: "thứ Hai", synonym1: null, synonym2: null, antonym1: null, relationStatus: "no_natural_relation" as const },
      word2: { ...baseVocab.word2, word: "hour", ttsText: "hour", ssml: "<speak>hour</speak>", meaning: "giờ", synonym1: null, synonym2: null, antonym1: null, relationStatus: undefined },
      word3: { ...baseVocab.word3, word: "ID-42", ttsText: "ID-42", ssml: "<speak>ID-42</speak>", meaning: "mã số", synonym1: null, synonym2: null, antonym1: null, relationStatus: "no_natural_relation" as const }
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [justifiedNoRelations]);

    const result = await generateWeeklyLessonVocabulary(
      { ...inputFor(a1), grammarFormula: "Could you confirm + noun?", grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"] },
      runner
    );

    expect(runTask).toHaveBeenCalledTimes(1);
    expect(result.output.word1.word).toBe("Monday");
    expect(result.output.word2.relationStatus).toBe("no_natural_relation");
  });

  it("emits a repair finding when a level exceeds the two-light-gap lexical limit", () => {
    const a1 = levelCases[0];
    const partial = buildPartialLessonFromPipelineState(inputFor(a1), {
      vocabulary: {
        ...vocabularyFor(a1),
        word1: { ...vocabularyFor(a1).word1, synonym1: null, synonym2: null, antonym1: null, relationStatus: "no_natural_relation" },
        word2: { ...vocabularyFor(a1).word2, synonym1: null, synonym2: null, antonym1: null, relationStatus: "generation_missed" },
        word3: { ...vocabularyFor(a1).word3, synonym1: null, synonym2: null, antonym1: null, relationStatus: "above_cefr_level" }
      }
    });
    expect(partial).not.toBeNull();
    // Partial draft without foundation must NOT include a fake or unavailable grammar section
    expect(partial!.parts.find((part) => part.code === "grammar")).toBeUndefined();

    const warnings = validateWeeklyVocabularyLexicalCoverage([partial!], "A1");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      component: "vocabulary",
      code: "VOCABULARY_LEXICAL_GAPS_EXCEEDED",
      severity: "warning",
      repairAction: "regenerate_component"
    });
    expect(warnings[0]!.issues).toEqual([
      { dayNumber: 1, word: "confirm", relationStatus: "no_natural_relation" },
      { dayNumber: 1, word: "clarify", relationStatus: "generation_missed" },
      { dayNumber: 1, word: "approve", relationStatus: "above_cefr_level" }
    ]);
  });

  it("keeps a missing word family missing instead of synthesizing an inflection", () => {
    const a1 = levelCases[0];
    const vocabulary = vocabularyFor(a1);
    const partial = buildPartialLessonFromPipelineState(inputFor(a1), {
      vocabulary: {
        ...vocabulary,
        word1: { ...vocabulary.word1, family1: null, family2: null }
      }
    });

    const items = (partial!.parts.find((part) => part.code === "vocabulary")!.content as { items: Array<{ family?: unknown[] }> }).items;
    expect(items[0]!.family).toEqual([]);
  });

  it("isolates component repair so vocabulary, foundation, and skills repairs only call their respective AI tasks", async () => {
    const a1 = levelCases[0];
    const generatedSkills = skillsFor(a1);
    const fullDay = await generateWeeklyLessonDayPipeline(
      inputFor(a1),
      "Generate one complete lesson.",
      runnerWith({
        weekly_lesson_grammar_classifier: grammarClassification,
        weekly_lesson_objectives: { objective: objectiveFor(a1) },
        weekly_lesson_foundation: foundationFor(a1),
        weekly_lesson_vocabulary: vocabularyFor(a1),
        weekly_lesson_comprehension: generatedSkills.comprehension,
        weekly_lesson_language_practice: generatedSkills.languagePractice,
        weekly_lesson_speaking: generatedSkills.speaking,
        weekly_lesson_skills_reviewer: approvedReview
      }).runner
    );
    const primaryTargetsByDay = [
      ["confirm", "clarify", "approve"],
      ["date", "schedule", "calendar"],
      ["detail", "note", "check"],
      ["request", "manager", "team"],
      ["agree", "action", "update"]
    ];
    const validFiveDays = [1, 2, 3, 4, 5].map((dayNumber, index) => ({
      ...fullDay.lesson,
      dayNumber,
      title: `Day ${dayNumber}: ${fullDay.lesson.title}`,
      parts: fullDay.lesson.parts.map((part) => part.code !== "vocabulary" ? part : {
        ...part,
        content: {
          ...part.content,
          items: (part.content.items as Array<Record<string, unknown>>).map((item, itemIndex) => {
            // A valid retained lesson must have distinct learner-facing
            // relations too, not merely a different primary target. This
            // mirrors the level registry used by production generation.
            if (dayNumber === 1) {
              return { ...item, word: primaryTargetsByDay[index]![itemIndex] };
            }
            const suffix = `${dayNumber}-${itemIndex + 1}`;
            const renameRelations = (value: unknown, prefix: string) => Array.isArray(value)
              ? value.map((relation, relationIndex) => ({
                ...(relation as Record<string, unknown>),
                word: `${prefix}-${suffix}-${relationIndex + 1}`
              }))
              : value;
            const umbrella = item.umbrella as Record<string, unknown>;
            return {
              ...item,
              word: primaryTargetsByDay[index]![itemIndex],
              family: renameRelations(item.family, "family"),
              synonyms: renameRelations(item.synonyms, "synonym"),
              antonyms: renameRelations(item.antonyms, "antonym"),
              lexicalDetails: renameRelations(item.lexicalDetails, "detail"),
              umbrella: {
                ...umbrella,
                word: `umbrella-${dayNumber}`,
                siblings: renameRelations(umbrella.siblings, "sibling")
              }
            };
          })
        }
      })
    }));
    const weekInput = {
      weekNumber: 1,
      topic: "Confirming a deadline",
      description: "Confirm a workplace deadline.",
      objectives: "Confirm deadlines.",
      keyVocabHint: "confirm, clarify, approve",
      plan: {
        A1: [
          "Outcome: Confirm a deadline | Vocabulary: confirm, clarify, approve | Frame: Could you confirm + noun? | Skill emphasis: speaking",
          "Outcome: State a date | Vocabulary: date, schedule, calendar | Frame: The deadline is + date | Skill emphasis: listening",
          "Outcome: Clarify a detail | Vocabulary: detail, note, check | Frame: I need to clarify + noun | Skill emphasis: reading",
          "Outcome: Request approval | Vocabulary: request, manager, team | Frame: Could you approve + noun? | Skill emphasis: writing",
          "Outcome: Agree on next action | Vocabulary: agree, action, update | Frame: We agreed to + verb | Skill emphasis: speaking"
        ]
      }
    };

    // 1. Vocabulary-only repair
    const vocabCalls: string[] = [];
    await generateWeeklyLessons(
      weekInput,
      "A1",
      { prompt: "Repair lesson." },
      runnerWith({ weekly_lesson_vocabulary: vocabularyFor(a1) }, vocabCalls).runner,
      {
        dayNumbers: [1],
        existingLessons: validFiveDays,
        repairMode: "enrich",
        forcedComponentsByDay: { 1: ["vocabulary"] }
      }
    );
    expect(vocabCalls).toEqual(["weekly_lesson_vocabulary"]);

    // 2. Foundation-only repair
    const foundationCalls: string[] = [];
    await generateWeeklyLessons(
      weekInput,
      "A1",
      { prompt: "Repair lesson." },
      runnerWith({
        weekly_lesson_grammar_classifier: grammarClassification,
        weekly_lesson_objectives: { objective: objectiveFor(a1) },
        weekly_lesson_foundation: foundationFor(a1)
      }, foundationCalls).runner,
      {
        dayNumbers: [1],
        existingLessons: validFiveDays,
        repairMode: "enrich",
        forcedComponentsByDay: { 1: ["foundation"] }
      }
    );
    expect(foundationCalls).toEqual([
      "weekly_lesson_grammar_classifier",
      "weekly_lesson_objectives",
      "weekly_lesson_foundation"
    ]);

    // 3. Skills-only repair
    const skillsCalls: string[] = [];
    await generateWeeklyLessons(
      weekInput,
      "A1",
      { prompt: "Repair lesson." },
      runnerWith({
        weekly_lesson_comprehension: generatedSkills.comprehension,
        weekly_lesson_language_practice: generatedSkills.languagePractice,
        weekly_lesson_speaking: generatedSkills.speaking,
        weekly_lesson_skills_reviewer: approvedReview
      }, skillsCalls).runner,
      {
        dayNumbers: [1],
        existingLessons: validFiveDays,
        repairMode: "enrich",
        forcedComponentsByDay: { 1: ["skills"] }
      }
    );
    expect(skillsCalls).toEqual([
      "weekly_lesson_comprehension",
      "weekly_lesson_language_practice",
      "weekly_lesson_speaking"
    ]);

    // A targeted repair must not also regenerate an unrelated vocabulary
    // metadata gap simply because that day has one.
    const skillsCallsWithLightVocabularyGap: string[] = [];
    const existingWithVocabularyGap = validFiveDays.map((lesson) => lesson.dayNumber !== 1 ? lesson : {
      ...lesson,
      parts: lesson.parts.map((part) => part.code !== "vocabulary" ? part : {
        ...part,
        content: {
          ...part.content,
          items: (part.content.items as Array<Record<string, unknown>>).map((item) => ({
            ...item,
            family: [],
            synonyms: [],
            antonyms: []
          }))
        }
      })
    });
    await generateWeeklyLessons(
      weekInput,
      "A1",
      { prompt: "Repair lesson." },
      runnerWith({
        weekly_lesson_comprehension: generatedSkills.comprehension,
        weekly_lesson_language_practice: generatedSkills.languagePractice,
        weekly_lesson_speaking: generatedSkills.speaking,
        weekly_lesson_skills_reviewer: approvedReview
      }, skillsCallsWithLightVocabularyGap).runner,
      {
        dayNumbers: [1],
        existingLessons: existingWithVocabularyGap,
        repairMode: "enrich",
        forcedComponentsByDay: { 1: ["skills"] },
        targetOnlyComponentsByDay: true
      }
    );
    expect(skillsCallsWithLightVocabularyGap).toEqual([
      "weekly_lesson_comprehension",
      "weekly_lesson_language_practice",
      "weekly_lesson_speaking"
    ]);
  });
});

describe("meaningful skills length boundaries", () => {
  it("does not reject otherwise usable A2 reading and B1 speaking for a one-to-three-word target overrun", () => {
    const a2Reading = Array.from({ length: 49 }, (_, index) => `detail${index + 1}`).join(" ");
    const b1Speaking = Array.from({ length: 35 }, (_, index) => `detail${index + 1}`).join(" ");
    expect(a2Reading.trim().split(/\s+/u)).toHaveLength(49);
    expect(b1Speaking.trim().split(/\s+/u)).toHaveLength(35);

    const a2Findings = deterministicSkillsFindings({ reading: { body: a2Reading, prompt: "Why does Mia need approval?", answer: "Her internet service will be repaired.", option1: "Her internet service will be repaired.", option2: "She has a meeting.", option3: "She is sick.", option4: "She is travelling.", hint: "Read the reason." } } as any, "A2");
    const b1Findings = deterministicSkillsFindings({ speaking: { prompt: "Request a remote working day.", answer: b1Speaking } } as any, "B1");

    expect(a2Findings).not.toEqual(expect.arrayContaining([expect.objectContaining({ path: ["reading", "body"] })]));
    expect(b1Findings).not.toEqual(expect.arrayContaining([expect.objectContaining({ path: ["speaking", "answer"] })]));
  });
});

describe("partial lesson vs final lesson grammar contract", () => {
  const a1 = levelCases[0];
  const allSkills = () => {
    const generated = skillsFor(a1);
    return { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
  };
  const dayOutputs = (foundation: unknown = foundationFor(a1)) => {
    const generatedSkills = skillsFor(a1);
    return {
      weekly_lesson_grammar_classifier: grammarClassification,
      weekly_lesson_objectives: { objective: objectiveFor(a1) },
      weekly_lesson_foundation: foundation,
      weekly_lesson_vocabulary: vocabularyFor(a1),
      weekly_lesson_comprehension: generatedSkills.comprehension,
      weekly_lesson_language_practice: generatedSkills.languagePractice,
      weekly_lesson_speaking: generatedSkills.speaking,
      weekly_lesson_skills_reviewer: approvedReview
    } as Record<string, unknown>;
  };

  it("restores a partial checkpoint without grammar, never treats it as complete, and resumes only from foundation", async () => {
    const state: WeeklyLessonPipelineCheckpoint["state"] = {
      grammarClassification,
      objectives: { objective: objectiveFor(a1) }
    };
    const partial = buildPartialLessonFromPipelineState(inputFor(a1), state);
    expect(partial).not.toBeNull();
    expect(partial!.parts.find((part) => part.code === "grammar")).toBeUndefined();
    expect(JSON.stringify(partial)).not.toContain("unavailable");
    expect(lessonComponentsNeedingRepair(partial!, "enrich", "A1").has("foundation")).toBe(true);

    const calls: string[] = [];
    const resumed = await generateWeeklyLessonDayPipeline(
      inputFor(a1), "Generate one complete lesson.", runnerWith(dayOutputs(), calls).runner, { resumeState: state }
    );
    expect(calls).not.toContain("weekly_lesson_grammar_classifier");
    expect(calls).not.toContain("weekly_lesson_objectives");
    expect(calls[0]).toBe("weekly_lesson_foundation");
    expect(resumed.lesson.parts.find((part) => part.code === "grammar")).toBeDefined();
  });

  it("fails final assembly at foundation.grammar when the grammar body is missing", () => {
    let thrown: unknown;
    try {
      assembleAndValidateWeeklyLesson({
        componentInput: inputFor(a1),
        grammarClassification,
        objectives: { objective: objectiveFor(a1) },
        foundation: { ...foundationFor(a1), grammar: null } as never,
        vocabulary: vocabularyFor(a1) as never,
        skills: allSkills() as never,
        reviewer: approvedReview as never
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: "AI_OUTPUT_INVALID",
      details: { component: "foundation", dayNumber: 1 },
      issues: [{ path: "day1.foundation.grammar" }]
    });
  });

  it("uses the fallback classification when the classifier fails and still assembles a validated grammar body", async () => {
    const outputs = dayOutputs();
    const calls: string[] = [];
    const runTask = vi.fn(async (taskId: string) => {
      calls.push(taskId);
      if (taskId === "weekly_lesson_grammar_classifier") {
        throw Object.assign(new Error("AI_OUTPUT_INVALID"), { code: "AI_OUTPUT_INVALID", issues: [{ path: ["status"], message: "invalid" }] });
      }
      if (!(taskId in outputs)) throw new Error(`UNEXPECTED_TASK:${taskId}`);
      return { output: outputs[taskId], metadata: { ...metadata, taskId } };
    });
    const day = await generateWeeklyLessonDayPipeline(
      inputFor(a1), "Generate one complete lesson.", { runTask } as unknown as AiTaskRunner
    );
    const grammarPart = day.lesson.parts.find((part) => part.code === "grammar");
    expect(grammarPart?.content).toMatchObject({ formula: "Could you confirm + noun?", targetName: "Could you confirm + noun?" });
    expect(calls.filter((taskId) => taskId === "weekly_lesson_foundation")).toHaveLength(1);
  });

  it("continues the other days when one day cannot produce grammar and attributes the failure to foundation", async () => {
    const outputs = dayOutputs();
    const foundationCallsByDay: Record<number, number> = {};
    const runTask = vi.fn(async (taskId: string, input?: unknown) => {
      const dayNumber = Number((input as { dayNumber?: unknown } | undefined)?.dayNumber ?? 0);
      if (taskId === "weekly_lesson_foundation") {
        foundationCallsByDay[dayNumber] = (foundationCallsByDay[dayNumber] ?? 0) + 1;
        if (dayNumber === 2) return { output: { ...foundationFor(a1), grammar: null }, metadata: { ...metadata, taskId } };
      }
      if (!(taskId in outputs)) throw new Error(`UNEXPECTED_TASK:${taskId}`);
      return { output: taskId === "weekly_lesson_vocabulary" ? vocabularyForDay(a1, dayNumber) : outputs[taskId], metadata: { ...metadata, taskId } };
    });
    const focus = "Could you confirm + noun?";
    const generated = await generateWeeklyLessonLevelPipeline({
      weekNumber: 1,
      topic: "Confirming a deadline",
      description: "Confirm a workplace deadline with a colleague.",
      objectives: "Confirm the deadline and next action.",
      keyVocabHint: "confirm, clarify, approve",
      plan: { A1: [focus, focus, focus, focus, focus] }
    } as never, "A1", { prompt: "Generate one complete lesson." }, { runTask } as unknown as AiTaskRunner);

    expect(generated.lessons.map((lesson) => lesson.dayNumber)).toEqual([1, 3, 4, 5]);
    expect(generated.lessons.every((lesson) => lesson.parts.some((part) => part.code === "grammar"))).toBe(true);
    expect(generated.failures).toHaveLength(1);
    expect(generated.failures[0]).toMatchObject({ dayNumber: 2, component: "foundation", code: "AI_OUTPUT_INVALID" });
    expect(generated.failures[0]!.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: "day2.foundation.grammar" })]));
    expect(foundationCallsByDay[2]).toBe(3);
    expect(foundationCallsByDay[1]).toBe(1);
  });

});

describe("deterministic lesson instructions", () => {
  const stepsOf = (instruction: { step1: string; step2: string; step3: string }) => [instruction.step1, instruction.step2, instruction.step3];

  it.each(levelCases)("gives $cefr exactly three short one-sentence steps in the learner-facing language", (level) => {
    const instruction = standardLessonInstruction(level.cefr);
    const steps = stepsOf(instruction);
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step.trim().split(/\s+/u).length).toBeLessThanOrEqual(LESSON_INSTRUCTION_STEP_MAX_WORDS);
      expect(step.split(/[.!?]/u).filter((part) => part.trim()).length).toBe(1);
      expect(/[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/iu.test(step)).toBe(level.language === "vi");
    }
  });

  it.each(levelCases)("replaces a long AI instruction for $cefr without spending an extra AI call", async (level) => {
    const longInstruction = {
      title: "A very long custom title",
      step1: "First, carefully read every single part of the lesson, then listen to all of the examples twice, and then write notes.",
      step2: "Second, complete all tasks.",
      step3: "Third, review."
    };
    const { runner, runTask } = sequencedRunner("weekly_lesson_foundation", [{ ...foundationFor(level), instruction: longInstruction }]);
    const result = await generateWeeklyLessonFoundation(objectivesInput(level), "Generate the foundation.", runner);
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(result.output.instruction).toEqual(standardLessonInstruction(level.cefr));
  });

  it("does not ask the provider to generate instructions", () => {
    expect(weeklyLessonFoundationBodyOutputJsonSchema.properties).not.toHaveProperty("instruction");
    expect(weeklyLessonFoundationBodyOutputJsonSchema.required).not.toContain("instruction");
  });
});

describe("AI_UNAVAILABLE classification", () => {
  const a1 = levelCases[0];
  const focus = "Could you confirm + noun?";
  const week = {
    weekNumber: 1,
    topic: "Confirming a deadline",
    description: "Confirm a workplace deadline with a colleague.",
    objectives: "Confirm the deadline and next action.",
    keyVocabHint: "confirm, clarify, approve",
    plan: { A1: [focus, focus, focus, focus, focus] }
  } as never;
  const providerError = (code: string, details?: unknown) => Object.assign(new Error(code), { code, retryable: true, ...(details ? { details } : {}) });

  function runnerFailing(failDay: (dayNumber: number) => Error | "semantic" | undefined) {
    const generatedSkills = skillsFor(a1);
    const outputs: Record<string, unknown> = {
      weekly_lesson_grammar_classifier: grammarClassification,
      weekly_lesson_objectives: { objective: objectiveFor(a1) },
      weekly_lesson_foundation: foundationFor(a1),
      weekly_lesson_vocabulary: vocabularyFor(a1),
      weekly_lesson_comprehension: generatedSkills.comprehension,
      weekly_lesson_language_practice: generatedSkills.languagePractice,
      weekly_lesson_speaking: generatedSkills.speaking,
      weekly_lesson_skills_reviewer: approvedReview
    };
    const runTask = vi.fn(async (taskId: string, input?: unknown) => {
      const dayNumber = Number((input as { dayNumber?: unknown } | undefined)?.dayNumber ?? 0);
      const failure = failDay(dayNumber);
      if (failure instanceof Error && taskId === "weekly_lesson_grammar_classifier") throw failure;
      if (failure === "semantic" && taskId === "weekly_lesson_foundation") {
        return { output: { ...foundationFor(a1), grammar: null }, metadata: { ...metadata, taskId } };
      }
      if (!(taskId in outputs)) throw new Error(`UNEXPECTED_TASK:${taskId}`);
      return { output: taskId === "weekly_lesson_vocabulary" ? vocabularyForDay(a1, dayNumber) : outputs[taskId], metadata: { ...metadata, taskId } };
    });
    return { runTask } as unknown as AiTaskRunner;
  }

  async function failureOf(runner: AiTaskRunner) {
    try {
      await generateWeeklyLessons(week, "A1", { prompt: "Generate one complete lesson." }, runner, { sequentialPipeline: true });
    } catch (error) {
      return error as { code: string; partialResult?: { lessons: Array<{ dayNumber: number }>; failures: Array<{ dayNumber: number; code: string }> } };
    }
    throw new Error("expected generation to fail");
  }

  it("returns AI_UNAVAILABLE only when every day fails for provider reasons", async () => {
    const error = await failureOf(runnerFailing(() => providerError("AI_PROVIDER_RATE_LIMIT")));
    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(error.partialResult?.failures.map((failure) => failure.code)).toEqual(Array(5).fill("AI_PROVIDER_RATE_LIMIT"));
  });

  it("treats authentication rejections as unavailable but other provider rejections as real failures", () => {
    expect(isProviderUnavailableFailure({ code: "AI_PROVIDER_REJECTED", details: { status: 401 } })).toBe(true);
    expect(isProviderUnavailableFailure({ code: "AI_PROVIDER_REJECTED", details: { status: 403 } })).toBe(true);
    expect(isProviderUnavailableFailure({ code: "AI_PROVIDER_REJECTED", details: { status: 400 } })).toBe(false);
    for (const code of ["AI_OUTPUT_INVALID", "AI_OUTPUT_TRUNCATED", "AI_INPUT_INVALID", "AI_LESSON_SET_INVALID"]) {
      expect(isProviderUnavailableFailure({ code })).toBe(false);
    }
  });

  it("reports a semantic day failure as a semantic diagnostic, not unavailable, and keeps the other days", async () => {
    const error = await failureOf(runnerFailing((dayNumber) => dayNumber === 2 ? "semantic" : undefined));
    expect(error.code).toBe("AI_LEVEL_GENERATION_INCOMPLETE");
    expect(error.partialResult?.failures).toEqual([expect.objectContaining({ dayNumber: 2, code: "AI_OUTPUT_INVALID" })]);
    expect(error.partialResult?.lessons.map((lesson) => lesson.dayNumber)).toEqual([1, 3, 4, 5]);
  });

  it("keeps successful days when only some days hit provider errors", async () => {
    const error = await failureOf(runnerFailing((dayNumber) => dayNumber === 3 ? providerError("AI_PROVIDER_UNAVAILABLE") : undefined));
    expect(error.code).toBe("AI_LEVEL_GENERATION_INCOMPLETE");
    expect(error.partialResult?.lessons.map((lesson) => lesson.dayNumber)).toEqual([1, 2, 4, 5]);
  });

  it("does not call a mix of provider and semantic failures unavailable", async () => {
    const error = await failureOf(runnerFailing((dayNumber) => dayNumber === 1 ? "semantic" : providerError("AI_PROVIDER_NETWORK")));
    expect(error.code).toBe("AI_LEVEL_GENERATION_INCOMPLETE");
  });

  it("isolates a provider failure in one level from the other levels", async () => {
    let caught: unknown;
    try {
      await runWeeklyLessonLevelBatch(["A1", "A2", "B1", "B2", "C1"], async (level) => {
        if (level === "B1") throw providerError("AI_PROVIDER_RATE_LIMIT");
        return `${level}-saved`;
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: "AI_LEVEL_BATCH_FAILED",
      failures: [expect.objectContaining({ level: "B1", code: "AI_PROVIDER_RATE_LIMIT" })],
      partialResults: { A1: "A1-saved", A2: "A2-saved", B2: "B2-saved", C1: "C1-saved" }
    });
  });
});

describe("lexical relation self-exemption", () => {
  const relationFree = (item: Record<string, unknown>, status: "no_natural_relation" | "above_cefr_level" | "generation_missed") => ({
    ...item, synonym1: null, synonym2: null, antonym1: null, relationStatus: status
  });
  const withWord1 = (level: LevelCase, word1: Record<string, unknown>) => ({ ...vocabularyFor(level), word1 });
  const sendItem = (level: LevelCase) => ({
    ...vocabularyFor(level).word1,
    word: "send", partOfSpeech: "verb", pronunciation: "/send/", ttsText: "send", ssml: "<speak>send</speak>",
    meaning: "gửi", imageQuery: "person sending an email at an office desk photo",
    collocation1: "send an email", collocation2: "send a file", collocation3: "send a reminder",
    family1: { word: "sender", type: "noun", meaning: "người gửi" }
  });
  const vocabularyInput = (level: LevelCase) => ({
    ...inputFor(level), grammarFormula: "Could you confirm + noun?", grammarExamples: ["Could you confirm the deadline?", "Could you confirm the meeting?"] as [string, string]
  });

  it("rejects an exemption when curated evidence shows a level-appropriate relation and repairs only that word", async () => {
    const a2 = levelCases[1];
    const exempt = withWord1(a2, relationFree(sendItem(a2), "no_natural_relation"));
    const repaired = withWord1(a2, {
      ...sendItem(a2),
      antonym1: { word: "receive", level: "A2", note: "opposite direction", partOfSpeech: "verb", sense: "get something sent", example: "I receive the file today." },
      relationStatus: "provided"
    });
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [exempt, repaired]);
    const result = await generateWeeklyLessonVocabulary(vocabularyInput(a2), runner);
    expect(runTask).toHaveBeenCalledTimes(2);
    expect(result.output.word1.word).toBe("send");
    expect(result.output.word1.antonym1?.word).toBe("receive");
    expect(result.output.word2).toEqual(exempt.word2);
    const repairPrompt = String((runTask.mock.calls[1] as unknown as [string, unknown, { systemPrompt?: string }])[2].systemPrompt);
    expect(repairPrompt).toContain("send has no credible same-level synonym or antonym");
    expect(repairPrompt).not.toContain("MANDATORY ANTONYM REPLACEMENT");
  });

  it("does not exempt ordinary vocabulary merely because the curated dictionary lacks a same-level entry", async () => {
    const a1 = levelCases[0];
    // approve/reject is curated from B1, so an A1 above_cefr_level claim is credible.
    const approveAboveLevel = { ...vocabularyFor(a1), word3: relationFree(vocabularyFor(a1).word3, "above_cefr_level") };
    const first = sequencedRunner("weekly_lesson_vocabulary", [approveAboveLevel]);
    await expect(generateWeeklyLessonVocabulary(vocabularyInput(a1), first.runner)).rejects.toBeDefined();
    expect(first.runTask).toHaveBeenCalledTimes(3);

    expect(curatedRelationEvidence({ word: "close", partOfSpeech: "verb", meaning: "đóng" }, "A1")?.antonyms).toContain("open");
    expect(curatedRelationEvidence({ word: "close", partOfSpeech: "adjective", meaning: "gần gũi" }, "C1")).toBeUndefined();
    expect(curatedRelationEvidence({ word: "close", partOfSpeech: "verb", meaning: "kết thân" }, "C1")).toBeUndefined();
    expect(curatedRelationEvidence({ word: "approve", partOfSpeech: "verb", meaning: "phê duyệt" }, "A2")).toBeUndefined();
    expect(curatedRelationEvidence({ word: "approve", partOfSpeech: "verb", meaning: "phê duyệt" }, "B1")?.antonyms).toContain("reject");
  });

  it("rejects an arbitrary relation exemption instead of silently accepting it", async () => {
    const b1 = levelCases[2];
    const clarifyExempt = { ...vocabularyFor(b1), word2: relationFree(vocabularyFor(b1).word2, "no_natural_relation") };
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [clarifyExempt, clarifyExempt, clarifyExempt]);

    await expect(generateWeeklyLessonVocabulary(vocabularyInput(b1), runner)).rejects.toBeDefined();

    expect(runTask).toHaveBeenCalledTimes(3);
  });

  it("repairs a word family that merely repeats its vocabulary target", async () => {
    const a2 = levelCases[1];
    const invalid = withWord1(a2, {
      ...sendItem(a2),
      family1: { word: "send", type: "verb", meaning: "gửi" }
    });
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [invalid]);

    const result = await generateWeeklyLessonVocabulary(vocabularyInput(a2), runner);

    expect(runTask).toHaveBeenCalledTimes(1);
    expect(result.output.word1.family1).toBeNull();
  });

  it("rejects a primary target forbidden by vocabulary already retained in the same level", async () => {
    const a2 = levelCases[1];
    const output = vocabularyFor(a2);
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [output, output, output]);

    await expect(generateWeeklyLessonVocabulary({
      ...vocabularyInput(a2),
      forbiddenVocabulary: ["confirm"]
    } as never, runner)).rejects.toBeDefined();

    expect(runTask).toHaveBeenCalledTimes(3);
  });

  it("reserves other days' primary terms from learner-facing lexical relations", async () => {
    const a2 = levelCases[1];
    const output = vocabularyFor(a2);
    const { runner, runTask } = sequencedRunner("weekly_lesson_vocabulary", [output, output, output]);

    await expect(generateWeeklyLessonVocabulary({
      ...vocabularyInput(a2),
      reservedVocabulary: ["confirmation"]
    } as never, runner)).rejects.toBeDefined();

    expect(runTask).toHaveBeenCalledTimes(3);
  });

  it("invalidates a resumed vocabulary checkpoint when an ordinary word has no credible relation", () => {
    const a2 = levelCases[1];
    const staleVocabulary = withWord1(a2, relationFree(sendItem(a2), "no_natural_relation"));

    const findings = validateWeeklyLessonPipelineState(inputFor(a2), {
      vocabulary: staleVocabulary
    });

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        component: "vocabulary",
        path: ["word1", "synonym1"],
        message: expect.stringContaining("send has no credible same-level synonym or antonym")
      })
    ]));
  });

  it("flags a level once more than two individual vocabulary relations are missing", () => {
    const a1 = levelCases[0];
    const lessons = [1, 2, 3, 4, 5].map((dayNumber) => buildPartialLessonFromPipelineState({ ...inputFor(a1), dayNumber }, {
      vocabulary: {
        ...vocabularyFor(a1),
        ...(dayNumber <= 3 ? { word2: relationFree(vocabularyFor(a1).word2, "generation_missed") } : {})
      }
    })!);

    const warnings = validateWeeklyVocabularyLexicalCoverage(lessons, "A1");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.issues).toHaveLength(3);
  });

  it("warns when all 15 weekly words declare no natural relation", () => {
    const a1 = levelCases[0];
    const lessons = [1, 2, 3, 4, 5].map((dayNumber) => buildPartialLessonFromPipelineState({ ...inputFor(a1), dayNumber }, {
      vocabulary: {
        ...vocabularyFor(a1),
        word1: relationFree(vocabularyFor(a1).word1, "no_natural_relation"),
        word2: relationFree(vocabularyFor(a1).word2, "no_natural_relation"),
        word3: relationFree(vocabularyFor(a1).word3, "no_natural_relation")
      }
    })!);
    const warnings = validateWeeklyVocabularyLexicalCoverage(lessons, "A1");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: "VOCABULARY_LEXICAL_GAPS_EXCEEDED", severity: "warning", repairAction: "regenerate_component" });
    expect(warnings[0]!.issues).toHaveLength(15);
    expect(warnings[0]!.message).toContain("15 từ thiếu");
  });

  it("flags a repeated vocabulary target across two days", () => {
    const a1 = levelCases[0];
    const first = buildPartialLessonFromPipelineState({ ...inputFor(a1), dayNumber: 1 }, { vocabulary: vocabularyFor(a1) })!;
    const repeated = buildPartialLessonFromPipelineState({ ...inputFor(a1), dayNumber: 2 }, { vocabulary: vocabularyFor(a1) })!;

    const findings = validateWeeklyVocabularyCrossDayUniqueness([first, repeated]);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ dayNumber: 2, component: "vocabulary", code: "DUPLICATE_WEEKLY_VOCABULARY" }),
      expect.objectContaining({
        issues: expect.arrayContaining([expect.objectContaining({ word: "confirmation", kind: "family" })])
      })
    ]));
  });

  it("keeps primary vocabulary from unchanged days forbidden during a targeted repair", () => {
    const a1 = levelCases[0];
    const retained = buildPartialLessonFromPipelineState({ ...inputFor(a1), dayNumber: 1 }, { vocabulary: vocabularyFor(a1) })!;
    const repaired = buildPartialLessonFromPipelineState({ ...inputFor(a1), dayNumber: 2 }, { vocabulary: vocabularyFor(a1) })!;

    expect(preservedWeeklyVocabulary([retained, repaired], [2])).toEqual(expect.arrayContaining([
      "confirm", "clarify", "approve"
    ]));
  });

  it("persists one umbrella group for vocabulary targets that share a category", () => {
    const a1 = levelCases[0];
    const lesson = buildPartialLessonFromPipelineState(inputFor(a1), { vocabulary: vocabularyFor(a1) })!;
    const content = lesson.parts.find((part) => part.code === "vocabulary")!.content as {
      groups?: Array<{ umbrella: { word: string; meaning: string }; itemWords: string[] }>;
    };

    expect(content.groups).toEqual([
      {
        umbrella: { word: "workplace communication", meaning: "giao tiếp công việc" },
        itemWords: ["confirm", "clarify", "approve"]
      }
    ]);
  });
});

describe("repair-mode lexical exemption", () => {
  it("reopens vocabulary repair when the only relation evidence is an exemption contradicted by curated data", async () => {
    const a2 = levelCases[1];
    const generatedSkills = skillsFor(a2);
    const day = await generateWeeklyLessonDayPipeline(inputFor(a2), "Generate one complete lesson.", runnerWith({
      weekly_lesson_grammar_classifier: grammarClassification,
      weekly_lesson_objectives: { objective: objectiveFor(a2) },
      weekly_lesson_foundation: foundationFor(a2),
      weekly_lesson_vocabulary: vocabularyFor(a2),
      weekly_lesson_comprehension: generatedSkills.comprehension,
      weekly_lesson_language_practice: generatedSkills.languagePractice,
      weekly_lesson_speaking: generatedSkills.speaking,
      weekly_lesson_skills_reviewer: approvedReview
    }).runner);
    const withItems = (mapItem: (item: Record<string, unknown>, index: number) => Record<string, unknown>) => ({
      ...day.lesson,
      parts: day.lesson.parts.map((part) => part.code !== "vocabulary" ? part : {
        ...part,
        content: { ...(part.content as Record<string, unknown>), items: ((part.content as { items: Array<Record<string, unknown>> }).items).map(mapItem) }
      })
    });
    const exempt = (item: Record<string, unknown>) => ({ ...item, synonyms: [], antonyms: [], relationStatus: "no_natural_relation" });

    const ungroundedExemptions = withItems((item) => exempt(item));
    expect(lessonComponentsNeedingRepair(ungroundedExemptions, "enrich", "A2").has("vocabulary")).toBe(true);

    const contradicted = withItems((item, index) => index === 0
      ? exempt({ ...item, word: "send", type: "verb", meaning: "gửi", collocations: ["send an email", "send a file", "send a reminder"] })
      : exempt(item));
    expect(lessonComponentsNeedingRepair(contradicted, "enrich", "A2").has("vocabulary")).toBe(true);
  });
});

describe("comprehension entity grounding in the skills validator", () => {
  it("accepts a Vietnamese question opener and rejects a name missing from the passage", async () => {
    const a1 = levelCases[0];
    const base = skillsFor(a1).comprehension;
    const grounded = { ...base, listening: { ...base.listening, prompt: "Khi nào Mina có cuộc họp với khách hàng?" } };
    const ungrounded = { ...base, listening: { ...base.listening, prompt: "Khi nào Lan có cuộc họp với khách hàng?" } };

    const accepted = sequencedRunner("weekly_lesson_comprehension", [grounded]);
    await generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(a1), accepted.runner, { maxAttempts: 1 });
    expect(accepted.runTask).toHaveBeenCalledTimes(1);

    const rejected = sequencedRunner("weekly_lesson_comprehension", [ungrounded]);
    await expect(generateWeeklyLessonSkillGroup("skills.comprehension", skillsInput(a1), rejected.runner, { maxAttempts: 1 }))
      .rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining("names Lan") })]) });
  });
});

describe("objective assessment shape and item-level repair", () => {
  const a2 = levelCases[1];
  const objectiveItem = (overrides: Record<string, unknown>) => ({ ...objectiveFor(a2).items[0]!, ...overrides });

  it("distinguishes reading a passage from writing one", () => {
    const reading = objectiveItem({ assessmentCode: "reading", assessed_by: "reading", action_verb: "chọn", criterion: "chọn ý chính trong đoạn văn", success_evidence: "Đọc đoạn văn và chọn đáp án đúng." });
    expect(objectiveAssessmentShapeMismatch(reading, "A2")).toBeUndefined();
    const readingNoChoiceWord = objectiveItem({ assessmentCode: "reading", assessed_by: "reading", action_verb: "xác định", criterion: "xác định mục đích của đoạn văn", success_evidence: "Nhận ra mục đích được nêu trong đoạn văn." });
    expect(objectiveAssessmentShapeMismatch(readingNoChoiceWord, "A2")).toBeUndefined();
    const writesParagraph = objectiveItem({ assessmentCode: "reading", assessed_by: "reading", action_verb: "viết", criterion: "viết một đoạn văn ngắn", success_evidence: "Viết câu trả lời tự do." });
    expect(objectiveAssessmentShapeMismatch(writesParagraph, "A2")).toContain("four-option comprehension check");
    const b1WritingChoice = objectiveItem({ assessmentCode: "writing", assessed_by: "writing", action_verb: "choose", criterion: "choose the correct closing", success_evidence: "Selects one of four options." });
    expect(objectiveAssessmentShapeMismatch(b1WritingChoice, "B1")).toContain("scoped written response");
  });

  it("puts the assessment shape of every code into the objectives prompt", async () => {
    const { runner, runTask } = sequencedRunner("weekly_lesson_objectives", [{ objective: objectiveFor(a2) }]);
    await generateWeeklyLessonObjectives(objectivesInput(a2), "", runner);
    const prompt = (runTask.mock.calls[0] as unknown as [string, unknown, { systemPrompt: string }])[2].systemPrompt;
    for (const code of ["listening", "reading", "writing", "word_class", "word_use", "speaking"]) expect(prompt).toContain(`- ${code}:`);
    expect(prompt).toContain("writing at A1-A2 is a four-option MCQ or cloze selection");
  });

  it("repairs only the mismatched objective ID, keeps valid items and revalidates the merged set", async () => {
    const valid = objectiveFor(a2);
    const brokenC1 = { ...valid.items[0]!, action_verb: "viết", criterion: "viết một đoạn văn trả lời", success_evidence: "Viết câu trả lời tự do." };
    const first = { objective: { ...valid, items: [brokenC1, ...valid.items.slice(1)] } };
    const changedL1 = { ...valid.items[1]!, text: "Sau bài học, bạn có thể dùng một câu khác hẳn." };
    const repair = { objective: { ...valid, items: [valid.items[0]!, changedL1] } };
    const { runner, runTask } = sequencedRunner("weekly_lesson_objectives", [first, repair]);
    const result = await generateWeeklyLessonObjectives(objectivesInput(a2), "", runner);
    expect(runTask).toHaveBeenCalledTimes(2);
    expect(result.output.objective.items[0]).toEqual(valid.items[0]);
    // L1 was valid, so its original wording is kept even though the repair output changed it.
    expect(result.output.objective.items[1]).toEqual(valid.items[1]);
    const repairPrompt = (runTask.mock.calls[1] as unknown as [string, unknown, { systemPrompt: string }])[2].systemPrompt;
    expect(repairPrompt).toContain("rewrite only objective ID(s) C1");
    expect(repairPrompt).toContain("objective_assessment_shape_mismatch (objective ID C1)");
  });

  it("labels objective IDs unambiguously in diagnostics", () => {
    expect(objectiveIdsFromIssues([
      "objective_assessment_shape_mismatch (objective ID C1). reading is a four-option comprehension check",
      "objective_conflicting_assessment_targets (objective ID L1, L2). One speaking exercise",
      "missing_language_objective (CEFR C1)"
    ])).toEqual(["C1", "L1", "L2"]);
  });
});

describe("reviewer finding classification", () => {
  const b2 = levelCases[3];
  const allSkills = () => {
    const generated = skillsFor(b2);
    return { ...generated.comprehension, ...generated.languagePractice, ...generated.speaking };
  };
  const reviewWith = (findings: unknown[]) => ({ ...approvedReview, status: "needs_revision" as const, findings });
  const speakingAnswer = () => allSkills().speaking.answer;

  it("discards self-withdrawn findings and records style or cross-exercise notes as warnings", async () => {
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: reviewWith([
      { exerciseCode: "reading", reasonCode: "feedback_mismatch", category: "self_withdrawn", message: "On reflection the item is fine.", evidence: { path: "reading.prompt", actual: "What does Mina send?", expected: "unchanged" } },
      { exerciseCode: "speaking", reasonCode: "feedback_mismatch", category: "style_preference", message: "Could sound more formal.", evidence: { path: "speaking.answer", actual: speakingAnswer(), expected: "more formal" } },
      { exerciseCode: "speaking", reasonCode: "feedback_mismatch", category: "cross_exercise_mismatch", message: "Proposes a different plan from the reading.", evidence: { path: "speaking.answer", actual: speakingAnswer(), expected: "same plan as reading" } }
    ]) });
    const result = await reviewWeeklyLessonSkills(runner, skillsInput(b2), allSkills() as never);
    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
    expect(result.warnings.map((warning) => warning.category)).toEqual(["style_preference", "cross_exercise_mismatch"]);
  });

  it("keeps a verified objective mismatch even when deterministic validation passes", async () => {
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: reviewWith([
      { exerciseCode: "speaking", reasonCode: "feedback_mismatch", category: "objective_mismatch", message: "The mapped objective requires naming the team as the responsible group.", evidence: { path: "speaking.answer", actual: speakingAnswer(), expected: "names the team as the responsible group" } }
    ]) });
    const result = await reviewWeeklyLessonSkills(runner, skillsInput(b2), allSkills() as never);
    expect(result.output.status).toBe("needs_revision");
    expect(result.findings).toEqual([{ path: ["speaking"], message: expect.stringContaining("responsible group") }]);
  });

  it("discards a writing-review demand that contradicts an MCQ assessment shape", async () => {
    const a1 = levelCases[0];
    const skills = {
      ...skillsFor(a1).comprehension,
      ...skillsFor(a1).languagePractice,
      ...skillsFor(a1).speaking
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: reviewWith([{
      exerciseCode: "writing", reasonCode: "feedback_mismatch", category: "objective_mismatch",
      message: "Objective C1 accepts choosing a complete memo, but objective L2 requires completing a missing final line. The exercise cannot be both shapes.",
      evidence: { path: "writing.answer", actual: skills.writing.answer, expected: "a missing final line" }
    }]) });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(a1), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("discards a reviewer complaint when a concrete outcome completes a placeholder frame", async () => {
    const skills = allSkills();
    const answer = "I would appreciate your decision on the printer order by Wednesday so that the office can receive it before Friday.";
    skills.speaking = {
      ...skills.speaking,
      prompt: "Ask for a decision by Wednesday so that the office can receive the printer before Friday. Use the frame 'I would appreciate your decision on + item by + date so that we can + outcome.'",
      answer,
      answerTranslation: answer,
      questionTranslation: "Ask for a decision by Wednesday."
    };
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: reviewWith([{
      exerciseCode: "speaking", reasonCode: "feedback_mismatch", category: "objective_mismatch",
      message: "The model answer omits the required outcome clause 'so that we can [outcome]' and reinterprets the decision request.",
      evidence: { path: "speaking.answer", actual: answer, expected: "so that we can [outcome]" }
    }]) });

    const result = await reviewWeeklyLessonSkills(runner, skillsInput(b2), skills as never);

    expect(result.output.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("drops a finding whose quoted evidence is not in the exercise, and routes a verified one to the exercise that must change", async () => {
    const { runner } = runnerWith({ weekly_lesson_skills_reviewer: reviewWith([
      { exerciseCode: "reading", reasonCode: "insufficient_context", category: "source_contradiction", message: "The passage says the meeting is on Monday.", evidence: { path: "reading.body", actual: "the meeting is on Monday", expected: "consistent day" } },
      { exerciseCode: "reading", reasonCode: "feedback_mismatch", category: "translation_mismatch", message: "The speaking answer translation does not match the answer.", evidence: { path: "speaking.answerTranslation", actual: allSkills().speaking.answerTranslation, expected: "a faithful restatement of the answer" } }
    ]) });
    const result = await reviewWeeklyLessonSkills(runner, skillsInput(b2), allSkills() as never);
    expect(result.findings).toEqual([{ path: ["speaking"], message: expect.stringContaining("translation does not match") }]);
  });

  it("asks the reviewer again when a blocking finding gives no evidence", async () => {
    const withoutEvidence = reviewWith([{ exerciseCode: "speaking", reasonCode: "feedback_mismatch", category: "objective_mismatch", message: "Missing the required frame." }]);
    const { runner, runTask } = sequencedRunner("weekly_lesson_skills_reviewer", [withoutEvidence, approvedReview]);
    const result = await reviewWeeklyLessonSkills(runner, skillsInput(b2), allSkills() as never);
    expect(runTask).toHaveBeenCalledTimes(2);
    expect(result.output.status).toBe("approved");
  });

  it("keeps the day and reports reviewer style notes as warnings", async () => {
    const a1 = levelCases[0];
    const generatedSkills = skillsFor(a1);
    const day = await generateWeeklyLessonDayPipeline(inputFor(a1), "Generate one complete lesson.", runnerWith({
      weekly_lesson_grammar_classifier: grammarClassification,
      weekly_lesson_objectives: { objective: objectiveFor(a1) },
      weekly_lesson_foundation: foundationFor(a1),
      weekly_lesson_vocabulary: vocabularyFor(a1),
      weekly_lesson_comprehension: generatedSkills.comprehension,
      weekly_lesson_language_practice: generatedSkills.languagePractice,
      weekly_lesson_speaking: generatedSkills.speaking,
      weekly_lesson_skills_reviewer: reviewWith([
        { exerciseCode: "speaking", reasonCode: "feedback_mismatch", category: "style_preference", message: "A warmer greeting would be nicer.", evidence: { path: "speaking.answer", actual: generatedSkills.speaking.speaking.answer, expected: "warmer greeting" } }
      ])
    }).runner);
    expect(day.lesson.parts.some((part) => part.code === "speaking")).toBe(true);
    expect(day.warnings).toEqual([expect.objectContaining({ component: "skills.reviewer", code: "REVIEWER_STYLE_PREFERENCE", severity: "warning" })]);
  });
});
