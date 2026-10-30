import { describe, expect, it } from "vitest";
import {
  approveContentVersion,
  containsVietnameseLearnerText,
  retirePublishedContent,
  lexicalRelationCoverageSatisfied,
  submitContentForReview,
  evaluateGeneratedLessonQuality,
  validateLessonDraft,
  validateGenerationFindingsForPublication,
  validateLessonPublication
} from "../src/content/index.js";

const completeLesson = {
  dayNumber: 1,
  title: "I work in… as…",
  durationMinutes: 10,
  parts: [
    { code: "objective", title: "Mục tiêu", content: { text: "Tự giới thiệu công việc." } },
    { code: "instruction", title: "Hướng dẫn", content: { steps: ["Học nội dung", "Làm bài tập"] } },
    { code: "vocabulary", title: "Từ vựng", content: { items: ["department", "role", "project"].map((word) => ({ word, meaning: "từ công việc", collocations: [`my ${word}`, `new ${word}`, `work ${word}`] })) } },
    { code: "grammar", title: "Ngữ pháp", content: { formula: "I work in [team] as [role].", examples: ["I work in AI as an intern."] } },
    { code: "pronunciation", title: "Phát âm", content: { focus: "/w/", words: [{ word: "work", ipa: "/wɜːk/" }, { word: "week", ipa: "/wiːk/" }, { word: "well", ipa: "/wel/" }], instruction: "Round your lips." } },
    { code: "listening", title: "Nghe", content: { script: "I work in AI as an intern.", prompt: "Where does she work?", options: ["AI", "HR", "Sales", "Finance"], answer: "AI" } },
    { code: "reading", title: "Đọc", content: { text: "I work in AI as an intern.", prompt: "Where does she work?", options: ["AI", "HR", "Sales", "Finance"], answer: "AI" } },
    { code: "writing", title: "Viết", content: { type: "fill", prompt: "I work in ___.", answer: "AI" } },
    { code: "word_class", title: "Từ loại", content: { prompt: "What is role?", options: ["noun", "verb", "adjective", "adverb"], answer: "noun" } },
    { code: "word_use", title: "Dùng từ", content: { prompt: "Which sentence is correct?", options: ["I work in AI.", "I works AI.", "I working AI.", "I work AI yesterday."], answer: "I work in AI." } },
    { code: "speaking", title: "Nói", content: { prompt: "Introduce your role.", sample: "I work in AI as an intern." } }
  ]
} as const;

function englishLesson(dayNumber = 1) {
  const lesson = structuredClone(completeLesson) as any;
  lesson.dayNumber = dayNumber;
  const titles: Record<string, string> = {
    objective: "Lesson objectives", instruction: "Instructions", vocabulary: "Vocabulary",
    grammar: "Grammar", pronunciation: "Pronunciation", listening: "Listening",
    reading: "Reading", writing: "Writing", word_class: "Word class",
    word_use: "Word use", speaking: "Speaking"
  };
  for (const part of lesson.parts) part.title = titles[part.code];
  lesson.parts.find((part: any) => part.code === "objective").content = {
    text: "By the end of this lesson, you will be able to introduce your role."
  };
  lesson.parts.find((part: any) => part.code === "instruction").content = {
    steps: ["Study the lesson content.", "Complete each practice task.", "Review the feedback and try again."]
  };
  lesson.parts.find((part: any) => part.code === "grammar").content.usage = "Use this pattern to introduce your role at work.";
  lesson.parts.find((part: any) => part.code === "pronunciation").content.instruction = "Round your lips and release the sound clearly.";
  return lesson;
}

describe("content publishing policy", () => {
  it("permits at most two isolated lexical metadata gaps but blocks every missing learning component", () => {
    const vocabularyLightGaps = structuredClone(completeLesson) as any;
    const items = vocabularyLightGaps.parts.find((part: any) => part.code === "vocabulary").content.items;
    for (const item of items) {
      item.family = [{ word: `${item.word}s`, type: "noun" }];
      item.umbrella = { word: "work word" };
      item.synonyms = [{ word: `related ${item.word}` }];
      item.antonyms = [];
      item.relationStatus = "provided";
    }
    const cleanVocabularyLesson = structuredClone(vocabularyLightGaps);
    items[0].synonyms = [];
    items[0].antonyms = [];
    items[0].relationStatus = "generation_missed";
    items[1].umbrella = null;
    const fiveLessonsWithTwoLightGaps = [vocabularyLightGaps, ...[2, 3, 4, 5].map((dayNumber) => ({ ...structuredClone(cleanVocabularyLesson), dayNumber }))];

    expect(evaluateGeneratedLessonQuality({
      cefr: "A1",
      lessons: fiveLessonsWithTwoLightGaps,
      findings: []
    })).toMatchObject({ ready: true, blockingIssues: [], lightIssues: expect.any(Array) });

    const oneDayWithTwoLightGaps = evaluateGeneratedLessonQuality({
      cefr: "A1",
      lessons: [vocabularyLightGaps],
      findings: []
    });
    expect(oneDayWithTwoLightGaps.lightIssues).toHaveLength(2);

    const blankUmbrella = structuredClone(vocabularyLightGaps);
    blankUmbrella.parts.find((part: any) => part.code === "vocabulary").content.items[1].umbrella = { word: " ", meaning: "", siblings: [] };
    expect(evaluateGeneratedLessonQuality({ cefr: "A1", lessons: [blankUmbrella], findings: [] }).lightIssues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining("thiếu từ bao trùm") })]));

    const threeGaps = structuredClone(fiveLessonsWithTwoLightGaps);
    threeGaps[0].parts.find((part: any) => part.code === "vocabulary").content.items[2].family = [];
    expect(evaluateGeneratedLessonQuality({ cefr: "A1", lessons: threeGaps, findings: [] }).ready).toBe(false);

    const missingSpeaking = structuredClone(vocabularyLightGaps) as any;
    missingSpeaking.parts = missingSpeaking.parts.filter((part: any) => part.code !== "speaking");
    expect(evaluateGeneratedLessonQuality({ cefr: "A1", lessons: [missingSpeaking], findings: [] }).blockingIssues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "speaking" })]));
  });

  it("treats a usable relation or a credible CEFR exemption as complete lexical coverage", () => {
    expect(lexicalRelationCoverageSatisfied({
      word: "Monday", type: "noun", meaning: "thứ Hai", synonyms: [], antonyms: [], relationStatus: "no_natural_relation"
    }, "A1")).toBe(true);
    expect(lexicalRelationCoverageSatisfied({
      word: "send", type: "verb", meaning: "gửi", synonyms: [], antonyms: [], relationStatus: "no_natural_relation"
    }, "A2")).toBe(false);
    expect(lexicalRelationCoverageSatisfied({
      word: "send", type: "verb", meaning: "gửi", synonyms: [], antonyms: [{ word: "receive" }], relationStatus: "provided"
    }, "A2")).toBe(true);
  });

  it("allows an accented Vietnamese proper noun inside otherwise English B1+ guidance", () => {
    expect(containsVietnameseLearnerText("Report the Đà Nẵng travel expense in one sentence.")).toBe(false);
    expect(containsVietnameseLearnerText("Hãy báo cáo chi phí đi Đà Nẵng trong một câu.")).toBe(true);
  });

  it("blocks publication when pronunciation focus or any of the three word IPAs is invalid", () => {
    const invalid = {
      ...structuredClone(completeLesson),
      parts: completeLesson.parts.map((part) => part.code === "pronunciation"
        ? { ...part, content: { focus: "/p/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "deadline", ipa: "/ˈdedlaɪn/" }, { word: "planned", ipa: "/plænd/" }] } }
        : structuredClone(part))
    };
    const result = validateLessonPublication([invalid]);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "pronunciation", message: expect.stringContaining("không chứa âm mục tiêu /p/") })
    ]));

    const tooManyWords = structuredClone(completeLesson) as any;
    tooManyWords.parts.find((part: any) => part.code === "pronunciation").content.words.push({ word: "window", ipa: "/ˈwɪndəʊ/" });
    expect(validateLessonPublication([tooManyWords]).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "pronunciation", message: "Phát âm cần đúng 3 từ luyện." })
    ]));
  });
  it("blocks serious unresolved generation findings but allows warnings to stay draft metadata", () => {
    const result = validateGenerationFindingsForPublication([
      { dayNumber: 2, component: "skills", code: "CEFR_OR_SKILL_CONSTRAINT", severity: "error", message: "B2 speaking needs two constraints.", issues: [], repairAction: "regenerate_component" },
      { dayNumber: 3, component: "vocabulary", code: "DIVERSITY_NOTE", severity: "warning", message: "Core word repeated.", issues: [], repairAction: "regenerate_component" }
    ]);

    expect(result).toEqual({
      valid: false,
      issues: [{ dayNumber: 2, code: "generation", message: "B2 speaking needs two constraints." }]
    });
  });

  it("rejects a lesson draft that is missing a required learning part", () => {
    const incomplete = {
      ...completeLesson,
      parts: completeLesson.parts.filter((part) => part.code !== "speaking")
    };

    expect(validateLessonDraft([incomplete])).toEqual({
      valid: false,
      issues: [{ dayNumber: 1, code: "speaking", message: "Thiếu phần Nói." }]
    });
  });

  it("moves a valid draft to review and allows the maker to approve it", () => {
    expect(() => submitContentForReview({ status: "draft", lessons: [completeLesson] }))
      .toThrowError("CONTENT_LESSON_SET_INCOMPLETE");
    const fiveLessons = [1, 2, 3, 4, 5].map((dayNumber) => ({ ...completeLesson, dayNumber }));
    expect(submitContentForReview({ status: "draft", lessons: fiveLessons, weeklyPractice: { task: "Write four sentences about work.", guidance: "Use this week's vocabulary.", requiredVocabulary: ["work"] } })).toEqual({ status: "review" });

    expect(approveContentVersion({ status: "review", createdBy: "operator-a", checkerId: "operator-a" }))
      .toEqual({ status: "published", approvedBy: "operator-a" });
    expect(approveContentVersion({ status: "review", createdBy: "operator-a", checkerId: "operator-b" }))
      .toEqual({ status: "published", approvedBy: "operator-b" });
  });

  it("blocks review when manual listening, speaking, answers, or weekly practice cannot be used by a learner", () => {
    const invalid = structuredClone(completeLesson) as any;
    invalid.parts.find((part: any) => part.code === "listening").content.script = "";
    invalid.parts.find((part: any) => part.code === "speaking").content.sample = "";
    invalid.parts.find((part: any) => part.code === "reading").content.answer = "Unknown";
    const fiveLessons = [1, 2, 3, 4, 5].map((dayNumber) => ({ ...invalid, dayNumber }));

    const result = validateLessonPublication(fiveLessons, { task: "", guidance: "", requiredVocabulary: [] });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "listening", message: expect.stringContaining("nguồn âm thanh") }),
      expect.objectContaining({ code: "speaking", message: expect.stringContaining("câu mẫu") }),
      expect.objectContaining({ code: "reading", message: expect.stringContaining("trùng nguyên văn") }),
      expect.objectContaining({ code: "weekly_practice", message: expect.stringContaining("đề bài") })
    ]));
    expect(() => submitContentForReview({ status: "draft", lessons: fiveLessons, weeklyPractice: { task: "", guidance: "", requiredVocabulary: [] } }))
      .toThrowError("CONTENT_VALIDATION_FAILED");
  });

  it("accepts an explicitly unavailable grammar section and does not require invented lexical relations", () => {
    const manual = structuredClone(completeLesson) as any;
    manual.parts.find((part: any) => part.code === "grammar").content = {
      status: "unavailable", hidden: true, reason: "no_suitable_content"
    };
    for (const item of manual.parts.find((part: any) => part.code === "vocabulary").content.items) {
      item.family = [];
      item.synonyms = [];
      item.antonyms = [];
      item.umbrella = null;
    }
    const result = validateLessonPublication(
      [1, 2, 3, 4, 5].map((dayNumber) => ({ ...manual, dayNumber })),
      { task: "Write about work.", guidance: "Use the lesson.", requiredVocabulary: ["work"] }
    );
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("rejects Vietnamese learner-facing content for B1+ across lessons and weekly practice", () => {
    const mixed = englishLesson();
    mixed.parts.find((part: any) => part.code === "objective").content.text = "By the end of this lesson, you will be able to hỏi lại lịch sự.";
    mixed.parts.find((part: any) => part.code === "instruction").content.steps[1] = "Làm lần lượt các bài tập.";
    mixed.parts.find((part: any) => part.code === "grammar").content.usage = "Dùng cấu trúc này để giới thiệu vai trò.";
    mixed.parts.find((part: any) => part.code === "listening").content.prompt = "Người nói làm việc ở đâu?";

    const result = validateLessonPublication(
      [1, 2, 3, 4, 5].map((dayNumber) => ({ ...mixed, dayNumber })),
      { task: "Write about your role.", guidance: "Viết bằng tiếng Anh về công việc.", requiredVocabulary: ["role"] },
      "B1"
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "objective", message: expect.stringContaining("English") }),
      expect.objectContaining({ code: "instruction", message: expect.stringContaining("English") }),
      expect.objectContaining({ code: "grammar", message: expect.stringContaining("English") }),
      expect.objectContaining({ code: "listening", message: expect.stringContaining("English") }),
      expect.objectContaining({ code: "weekly_practice", message: expect.stringContaining("English") })
    ]));
  });

  it("allows Vietnamese guidance for A1-A2", () => {
    const result = validateLessonPublication(
      [1, 2, 3, 4, 5].map((dayNumber) => ({ ...completeLesson, dayNumber })),
      { task: "Write three sentences about your role.", guidance: "Viết ba câu tiếng Anh về công việc.", requiredVocabulary: ["role"] },
      "A2"
    );

    expect(result.valid).toBe(true);
  });

  it("allows Vietnamese vocabulary meanings while all other B1+ learner-facing content is English", () => {
    const lessons = [1, 2, 3, 4, 5].map(englishLesson);

    const result = validateLessonPublication(
      lessons,
      { task: "Write a short workplace update.", guidance: "Use three words from this week's lessons.", requiredVocabulary: ["role"] },
      "C1"
    );

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("retires a publication without changing its content payload", () => {
    const payload = { lessons: [completeLesson] };
    expect(retirePublishedContent({ status: "published", payload })).toEqual({ status: "retired", payload });
  });
});
