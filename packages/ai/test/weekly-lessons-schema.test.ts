import { describe, expect, it } from "vitest";
import {
  weeklyLessonFoundationOutputJsonSchema,
  weeklyLessonFoundationOutputSchema,
  weeklyLessonGrammarClassificationOutputSchema,
  weeklyLessonSkillsReviewOutputSchema,
  weeklyLessonSkillsOutputJsonSchema,
  weeklyLessonSkillsOutputSchema,
  weeklyLessonVocabularyOutputJsonSchema,
  weeklyLessonVocabularyOutputSchema,
  weeklyLessonDayOutputJsonSchema,
  weeklyLessonDayOutputSchema,
  weeklyLessonsOutputJsonSchema,
  weeklyLessonsOutputSchema
} from "../src/schemas.js";

const legacyCodes = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "speaking"
];

const enrichedCodes = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
];

function lesson(codes: string[]) {
  return {
    dayNumber: 1,
    title: "S + V + O",
    durationMinutes: 10,
    parts: codes.map((code) => ({ code, title: code, content: { text: "Concrete material" } }))
  };
}

function output(codes: string[]) {
  return { lessons: Array.from({ length: 5 }, (_, index) => ({ ...lesson(codes), dayNumber: index + 1 })) };
}

function completeEnrichedLesson() {
  return {
    dayNumber: 1,
    title: "S + V + O",
    durationMinutes: 10,
    parts: [
      { code: "objective", title: "Mục tiêu", content: { text: "Nói được ba câu về công việc hằng ngày." } },
      { code: "instruction", title: "Hướng dẫn", content: { steps: ["Đọc mẫu câu.", "Ôn từ vựng.", "Làm bài tập."] } },
      { code: "vocabulary", title: "Từ vựng", content: { items: [{
        word: "report", pronunciation: "/rɪˈpɔːrt/", meaning: "báo cáo", imageQuery: "office report document",
        collocations: ["write a report", "weekly report", "send the report"],
        family: [{ word: "reporting", type: "verb", meaning: "báo cáo" }],
        umbrella: { word: "work document", meaning: "tài liệu công việc", siblings: [{ word: "email", meaning: "thư điện tử" }] },
        synonyms: [{ word: "record", level: "B1", note: "ghi lại thông tin" }],
        antonyms: [{ word: "silence", level: "B1", note: "không thông báo" }]
      }, { word: "send", pronunciation: "/send/", meaning: "gửi", imageQuery: "person sending email", collocations: ["send an email", "send a report", "send the file"], family: [], umbrella: { word: "communication", meaning: "giao tiếp", siblings: [] }, synonyms: [], antonyms: [] }, { word: "file", pronunciation: "/faɪl/", meaning: "tệp", imageQuery: "computer file folder", collocations: ["open a file", "share a file", "save the file"], family: [], umbrella: { word: "work document", meaning: "tài liệu công việc", siblings: [] }, synonyms: [], antonyms: [] }] } },
      { code: "grammar", title: "Ngữ pháp", content: { formula: "S + V + O", usage: "Dùng để nói ai làm gì với cái gì.", examples: ["I send the report.", "She opens the file."] } },
      { code: "pronunciation", title: "Phát âm", content: { focus: "/r/", tip: "Rung nhẹ đầu lưỡi.", words: [{ word: "report", ipa: "/rɪˈpɔːrt/" }, { word: "read", ipa: "/riːd/" }, { word: "right", ipa: "/raɪt/" }] } },
      { code: "listening", title: "Nghe", content: { audio: "I send the weekly report to my manager every Friday.", prompt: "What does the speaker send?", options: ["A report", "A meeting", "A phone", "A folder"], answer: "A report" } },
      { code: "reading", title: "Đọc", content: { text: "Lan sends a report every Friday. Her manager reads it before the team meeting.", prompt: "When does Lan send the report?", options: ["Every Friday", "Every Monday", "At lunch", "After the meeting"], answer: "Every Friday" } },
      { code: "writing", title: "Viết", content: { type: "fill", prompt: "I ___ the report. (gửi)", options: [], answer: "send" } },
      { code: "word_class", title: "Từ loại", content: { prompt: "What part of speech is 'report' in 'I send the report.'?", options: ["noun", "verb", "adjective", "adverb"], answer: "noun" } },
      { code: "word_use", title: "Dùng từ", content: { prompt: "Which sentence uses 'report' correctly?", options: ["I send the report.", "I report the a.", "I report happy.", "I a report send."], answer: "I send the report." } },
      { code: "speaking", title: "Nói", content: { prompt: "Nói một câu về việc bạn gửi.", answer: "I send the weekly report." } }
    ]
  };
}

const slots = (values: unknown[], names: string[], fill: unknown = undefined) => Object.fromEntries(
  names.map((name, index) => [name, values[index] ?? fill])
);

function strictLessonPayload() {
  const lesson = structuredClone(completeEnrichedLesson()) as ReturnType<typeof completeEnrichedLesson>;
  const parts = Object.fromEntries(lesson.parts.map((part) => {
    const content = structuredClone(part.content) as Record<string, any>;
    if (part.code === "instruction") content.steps = slots(content.steps, ["step1", "step2", "step3"]);
    if (part.code === "vocabulary") {
      content.items = slots(content.items.map((item: Record<string, any>) => ({
        ...item,
        collocations: slots(item.collocations, ["collocation1", "collocation2", "collocation3"]),
        family: slots(item.family, ["item1", "item2"], null),
        synonyms: slots(item.synonyms, ["item1", "item2"], null),
        antonyms: slots(item.antonyms, ["item1"], null),
        umbrella: { ...item.umbrella, siblings: slots(item.umbrella.siblings, ["item1", "item2", "item3"], null) }
      })), ["word1", "word2", "word3"]);
    }
    if (part.code === "grammar") content.examples = slots(content.examples, ["example1", "example2"]);
    if (part.code === "pronunciation") content.words = slots(content.words, ["word1", "word2", "word3"]);
    if (["listening", "reading", "writing", "word_class", "word_use"].includes(part.code)) {
      content.options = slots(content.options ?? [], ["option1", "option2", "option3", "option4"], null);
    }
    return [part.code, { title: part.title, content }];
  }));
  return { title: lesson.title, durationMinutes: lesson.durationMinutes, parts };
}

function strictVocabularyItem(partOfSpeech?: string) {
  return {
    word: "report",
    ...(partOfSpeech ? { partOfSpeech } : {}),
    pronunciation: "/rɪˈpɔːrt/", stress: "second syllable", ttsText: "report", ssml: "<speak>report</speak>",
    meaning: "báo cáo",
    imageQuery: "office report document",
    collocation1: "write a report",
    collocation2: "weekly report",
    collocation3: "send the report",
    family1: { word: "reporting", type: "noun", meaning: "việc báo cáo" },
    family2: null,
    umbrellaWord: "work document",
    umbrellaMeaning: "tài liệu công việc",
    sibling1: null,
    sibling2: null,
    sibling3: null,
    synonym1: { word: "account", level: "B1", note: "nghĩa gần trong ngữ cảnh báo cáo", partOfSpeech: "noun", sense: "a written work summary", example: "Read the account." },
    synonym2: null,
    antonym1: null
  };
}

describe("weekly lesson output contract", () => {
  it.each([
    "grammar_rule", "sentence_pattern", "usage_rule", "word_formation", "pronunciation_rule"
  ])("accepts the supported grammar classifier category %s", (contentType) => {
    expect(weeklyLessonGrammarClassificationOutputSchema.safeParse({
      status: "classified", contentType, targetName: "Target", scope: "Only the explicitly taught target",
      support: "explicit", confidence: "high", evidence: [{ sourceRef: "objective", quote: "explicit target" }], rejectedCandidates: []
    }).success).toBe(true);
  });

  it("accepts no-suitable content but rejects a classified incidental target", () => {
    expect(weeklyLessonGrammarClassificationOutputSchema.safeParse({
      status: "no_suitable_content", contentType: null, targetName: null, scope: null,
      support: "none", confidence: "high", evidence: [], rejectedCandidates: [{ candidate: "Present continuous", reason: "incidental_language" }]
    }).success).toBe(true);
    expect(weeklyLessonGrammarClassificationOutputSchema.safeParse({
      status: "classified", contentType: "grammar_rule", targetName: "Present continuous", scope: "One incidental sentence",
      support: "incidental", confidence: "low", evidence: [{ sourceRef: "dialogue", quote: "We're meeting." }], rejectedCandidates: []
    }).success).toBe(false);
  });

  it("requires 2-4 structured foundation objectives", () => {
    const base = {
      title: "Give clear feedback", durationMinutes: 10,
      objective: { title: "Mục tiêu", explanationLanguage: "vi", lesson_goal: "Nhận ra và đưa ra phản hồi rõ ràng.", assessment_gap: null, items: [
        { id: "C1", type: "content", text: "Sau bài học, bạn có thể chọn hai chi tiết phản hồi đúng sau khi nghe.", action_verb: "chọn", target_language: null, condition: "sau khi nghe", criterion: "đúng 2 chi tiết", assessed_by: "listening", success_evidence: "Chọn đúng 2 chi tiết", assessmentCode: "listening" },
        { id: "L1", type: "language", text: "Sau bài học, bạn có thể dùng \"clear feedback\" trong một câu khi nhập vai.", action_verb: "dùng", target_language: ["clear feedback"], condition: "khi nhập vai", criterion: "1 câu hoàn chỉnh", assessed_by: "speaking", success_evidence: "Transcript có cụm từ mục tiêu", assessmentCode: "speaking" }
      ] },
      instruction: { title: "Hướng dẫn", step1: "Đọc mẫu.", step2: "Ôn từ.", step3: "Làm bài." },
      grammar: { title: "Ngữ pháp", contentType: "sentence_pattern", targetName: "S + V + O", scope: "Giving feedback", formula: "S + V + O", usage: "Dùng để góp ý.", example1: "I give feedback.", example2: "We share feedback." },
      pronunciation: { title: "Phát âm", focus: "/f/", tip: "Thổi hơi nhẹ.", word1: { word: "feedback", ipa: "/ˈfiːdbæk/" }, word2: { word: "fine", ipa: "/faɪn/" }, word3: { word: "helpful", ipa: "/ˈhelpfəl/" } }
    };
    expect(weeklyLessonFoundationOutputSchema.safeParse(base).success).toBe(true);
    expect(weeklyLessonFoundationOutputSchema.safeParse({ ...base, objective: { ...base.objective, items: base.objective.items.slice(0, 1) } }).success).toBe(false);
    expect(weeklyLessonFoundationOutputSchema.safeParse({ ...base, title: "S + V + O" }).success).toBe(false);
    const longExample = weeklyLessonFoundationOutputSchema.safeParse({
      ...base,
      grammar: { ...base.grammar, example1: "Maybe you could add a detailed chart to the important weekly project report." }
    });
    expect(longExample.success).toBe(true);
    if (longExample.success) expect(longExample.data.grammar?.example1).toBe("Maybe you could add a detailed chart to the important weekly project report.");
    const parentheticalExample = weeklyLessonFoundationOutputSchema.safeParse({
      ...base,
      grammar: { ...base.grammar, example1: "I give feedback. (Tôi góp ý.)" }
    });
    expect(parentheticalExample.success).toBe(true);
    if (parentheticalExample.success) expect(parentheticalExample.data.grammar?.example1).toBe("I give feedback. (Tôi góp ý.)");
  });

  it("keeps the prompt-required objective evidence and grammar classification metadata", () => {
    const result = weeklyLessonFoundationOutputSchema.safeParse({
      title: "Could you please + V?", durationMinutes: 10,
      objective: {
        title: "Mục tiêu", explanationLanguage: "vi", lesson_goal: "Đề nghị đồng nghiệp hỗ trợ một việc cụ thể.", assessment_gap: null,
        items: [
          {
            id: "C1", type: "content",
            text: "Sau bài học, bạn có thể đề nghị đồng nghiệp hỗ trợ một việc cụ thể bằng 2 câu khi trao đổi công việc.",
            action_verb: "đề nghị", target_language: null, condition: "khi trao đổi công việc", criterion: "2 câu rõ ràng",
            assessed_by: "speaking", success_evidence: "Câu trả lời có yêu cầu cụ thể và lịch sự", assessmentCode: "speaking"
          },
          {
            id: "L1", type: "language",
            text: "Sau bài học, bạn có thể dùng mẫu câu \"Could you please + V?\" đúng 1 lần khi nhập vai.",
            action_verb: "dùng", target_language: ["Could you please + V?"], condition: "khi nhập vai",
            criterion: "dùng đúng mẫu câu 1 lần", assessed_by: "speaking", success_evidence: "Transcript có đúng mẫu câu",
            assessmentCode: "speaking"
          }
        ]
      },
      instruction: { title: "Hướng dẫn", step1: "Đọc mẫu.", step2: "Ôn từ.", step3: "Làm bài." },
      grammar: {
        title: "Mẫu câu", contentType: "sentence_pattern", targetName: "Could you please + V?",
        scope: "Polite requests only", formula: "Could you please + V?", usage: "Dùng để nhờ đồng nghiệp làm một việc cụ thể.",
        example1: "Could you please send the file?", example2: "Could you please check this report?"
      },
      pronunciation: { title: "Phát âm", focus: "/k/", tip: "Bật âm nhẹ.", word1: { word: "could", ipa: "/kʊd/" }, word2: { word: "check", ipa: "/tʃek/" }, word3: { word: "copy", ipa: "/ˈkɒpi/" } }
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.objective).toMatchObject({
      lesson_goal: "Đề nghị đồng nghiệp hỗ trợ một việc cụ thể.", assessment_gap: null,
      items: [
        expect.objectContaining({ id: "C1", action_verb: "đề nghị", assessed_by: "speaking", success_evidence: expect.any(String) }),
        expect.objectContaining({ id: "L1", target_language: ["Could you please + V?"] })
      ]
    });
    expect(result.data.grammar).toMatchObject({
      contentType: "sentence_pattern", targetName: "Could you please + V?", scope: "Polite requests only"
    });
  });

  it("rejects omitted foundation instruction steps instead of fabricating them", () => {
    const base = {
      title: "Give clear feedback", durationMinutes: 10,
      objective: { title: "Mục tiêu", explanationLanguage: "vi", items: [
        { type: "content", text: "Identify two details.", condition: "after listening", criterion: "two details", assessmentCode: "listening" },
        { type: "language", text: "Give one sentence.", condition: "in a role-play", criterion: "one sentence", assessmentCode: "speaking" }
      ] },
      instruction: { title: "Hướng dẫn", step3: "Hoàn thành bài tập." },
      grammar: { title: "Ngữ pháp", formula: "S + V + O", usage: "Dùng để góp ý.", example1: "I give feedback.", example2: "We share feedback." },
      pronunciation: { title: "Phát âm", focus: "/f/", tip: "Thổi hơi nhẹ.", word1: { word: "feedback", ipa: "/ˈfiːdbæk/" }, word2: { word: "fine", ipa: "/faɪn/" }, word3: { word: "helpful", ipa: "/ˈhelpfəl/" } }
    };

    expect(weeklyLessonFoundationOutputSchema.safeParse(base).success).toBe(false);
  });

  it("publishes three small strict schemas instead of compiling the full lesson grammar", () => {
    const schemas = [
      weeklyLessonFoundationOutputJsonSchema,
      weeklyLessonVocabularyOutputJsonSchema,
      weeklyLessonSkillsOutputJsonSchema
    ];
    for (const schema of schemas) {
      expect(schema).toMatchObject({ type: "object", additionalProperties: false });
      const serialized = JSON.stringify(schema);
      for (const unsupported of ["maxItems", "minLength", "maxLength", "minimum", "maximum", "oneOf"]) {
        expect(serialized).not.toContain(`\"${unsupported}\"`);
      }
      expect(serialized).not.toContain("day1");
      expect(serialized).not.toContain("parts");
    }
    expect(weeklyLessonFoundationOutputSchema.safeParse({}).success).toBe(false);
    expect(weeklyLessonVocabularyOutputSchema.safeParse({}).success).toBe(false);
    expect(weeklyLessonSkillsOutputSchema.safeParse({}).success).toBe(false);
  });

  it("requires and preserves a concise part of speech in each strict vocabulary item", () => {
    const item = strictVocabularyItem("noun");
    const parsed = weeklyLessonVocabularyOutputSchema.safeParse({
      title: "Từ vựng",
      word1: item,
      word2: item,
      word3: item
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.word1).toMatchObject({ partOfSpeech: "noun" });
    expect(weeklyLessonVocabularyOutputSchema.safeParse({
      title: "Từ vựng",
      word1: strictVocabularyItem(),
      word2: item,
      word3: item
    }).success).toBe(false);
    expect(weeklyLessonVocabularyOutputSchema.safeParse({
      title: "Từ vựng",
      word1: strictVocabularyItem("x".repeat(41)),
      word2: item,
      word3: item
    }).success).toBe(false);
    expect(weeklyLessonVocabularyOutputJsonSchema.$defs.item).toMatchObject({
      required: expect.arrayContaining(["partOfSpeech"]),
      properties: { partOfSpeech: { type: "string" } }
    });
  });

  it("requires exactly three collocations and complete extended lexical data for every generated word", () => {
    const item = strictVocabularyItem("noun");
    const output = (word1: Record<string, unknown>) => ({ title: "Vocabulary", word1, word2: item, word3: item });

    expect(weeklyLessonVocabularyOutputSchema.safeParse(output({ ...item, collocation3: undefined })).success).toBe(false);
    expect(weeklyLessonVocabularyOutputSchema.safeParse(output({ ...item, family1: null, family2: null })).success).toBe(false);
    expect(weeklyLessonVocabularyOutputSchema.safeParse(output({ ...item, synonym1: null, synonym2: null })).success).toBe(false);
    expect(weeklyLessonVocabularyOutputSchema.safeParse(output({ ...item, umbrellaWord: "" })).success).toBe(false);
    expect(weeklyLessonVocabularyOutputSchema.safeParse(output(item)).success).toBe(true);
  });

  it("does not retain slang or poetic details from AI output without an explicit PO decision", () => {
    const item = {
      ...strictVocabularyItem("noun"),
      slang: { word: "reporting gig", definition: "an informal reporting task" },
      poetic: { word: "chronicle", definition: "a literary report" }
    };

    const parsed = weeklyLessonVocabularyOutputSchema.safeParse({
      title: "Vocabulary", word1: item, word2: strictVocabularyItem("noun"), word3: strictVocabularyItem("noun")
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.word1).not.toHaveProperty("slang");
      expect(parsed.data.word1).not.toHaveProperty("poetic");
    }
  });

  it("accepts SSML that wraps each word of a phrase in separate pronunciation tags", () => {
    const item = {
      ...strictVocabularyItem("noun"),
      word: "time zone",
      pronunciation: "/\u02c8ta\u026am zo\u028an/",
      ttsText: "time zone",
      ssml: '<speak><phoneme alphabet="ipa" ph="ta\u026am">time</phoneme> <phoneme alphabet="ipa" ph="zo\u028an">zone</phoneme></speak>',
      collocation1: "check the time zone",
      collocation2: "different time zone",
      collocation3: "confirm the time zone"
    };

    expect(weeklyLessonVocabularyOutputSchema.safeParse({
      title: "Vocabulary", word1: item, word2: item, word3: item
    }).success).toBe(true);
  });

  it("rejects a synonym with another part of speech or unusable contextual evidence", () => {
    const item = strictVocabularyItem("noun");
    expect(weeklyLessonVocabularyOutputSchema.safeParse({
      title: "Từ vựng", word1: { ...item, synonym1: { ...item.synonym1!, partOfSpeech: "verb" } }, word2: item, word3: item
    }).success).toBe(false);
    expect(weeklyLessonVocabularyOutputSchema.safeParse({
      title: "Từ vựng", word1: { ...item, synonym1: { ...item.synonym1!, example: "This sentence omits it." } }, word2: item, word3: item
    }).success).toBe(false);
  });

  it("rejects ambiguous skill options and answer keys not present in the options", () => {
    const choice = { title: "Nghe", body: "The meeting starts at nine.", prompt: "When?", option1: "Nine", option2: "Ten", option3: "Eleven", option4: "Noon", answer: "Nine", hint: "Think about the stated time.", questionTranslation: "Khi nào?", answerTranslation: "Chín giờ" };
    const skills = {
      listening: choice,
      reading: { ...choice, title: "Đọc", body: "The report is ready at noon.", prompt: "What is ready?", option1: "Report", answer: "Report" },
      writing: { title: "Viết", type: "fill", prompt: "It ___ at nine.", option1: null, option2: null, option3: null, option4: null, answer: "starts", hint: "Use a present-tense verb.", questionTranslation: "Nó bắt đầu lúc chín giờ.", answerTranslation: "bắt đầu" },
      wordClass: { title: "Từ loại", prompt: "What is report?", option1: "noun", option2: "verb", option3: "adjective", option4: "adverb", answer: "noun", hint: "Name a person, place, or thing.", questionTranslation: "Report là từ loại gì?", answerTranslation: "danh từ" },
      wordUse: { title: "Dùng từ", prompt: "Which is correct?", option1: "Send the report.", option2: "Report the a.", option3: "A report send.", option4: "Report blue.", answer: "Send the report.", hint: "Look for a natural command.", questionTranslation: "Câu nào đúng?", answerTranslation: "Gửi báo cáo." },
      speaking: { title: "Nói", prompt: "Nói giờ họp.", answer: "The meeting starts at nine.", hint: "Dùng starts at.", questionTranslation: "Nói giờ họp.", answerTranslation: "Cuộc họp bắt đầu lúc chín giờ." }
    };
    expect(weeklyLessonSkillsOutputSchema.safeParse(skills).success).toBe(true);
    expect(weeklyLessonSkillsOutputSchema.safeParse({ ...skills, listening: { ...choice, option2: "Nine" } }).success).toBe(false);
    expect(weeklyLessonSkillsOutputSchema.safeParse({ ...skills, listening: { ...choice, answer: "Eight" } }).success).toBe(false);
    expect(weeklyLessonSkillsOutputSchema.safeParse({ ...skills, writing: { ...skills.writing, prompt: "It ___ at ___." } }).success).toBe(false);
  });

  it("requires an independent exercise review to name every blocking ambiguity", () => {
    expect(weeklyLessonSkillsReviewOutputSchema.safeParse({
      status: "approved",
      findings: [],
      solvedAnswers: {
        listening: "Nine", reading: "Report", writing: "starts",
        wordClass: "noun", wordUse: "Send the report."
      }
    }).success).toBe(true);

    expect(weeklyLessonSkillsReviewOutputSchema.safeParse({
      status: "needs_revision",
      findings: [{ exerciseCode: "writing", reasonCode: "multiple_valid_answers", message: "Both go and drive fit without context." }],
      solvedAnswers: {
        listening: "Nine", reading: "Report", writing: "go",
        wordClass: "noun", wordUse: "Send the report."
      }
    }).success).toBe(true);

    expect(weeklyLessonSkillsReviewOutputSchema.safeParse({
      status: "approved",
      findings: [{ exerciseCode: "writing", reasonCode: "multiple_valid_answers", message: "Ambiguous." }],
      solvedAnswers: { listening: "Nine", reading: "Report", writing: "go", wordClass: "noun", wordUse: "Send the report." }
    }).success).toBe(false);
  });

  it("publishes an Anthropic strict-compatible schema with five required day slots", () => {
    const serialized = JSON.stringify(weeklyLessonsOutputJsonSchema);
    for (const unsupported of ["maxItems", "minLength", "maxLength", "minimum", "maximum", "oneOf"]) {
      expect(serialized).not.toContain(`\"${unsupported}\"`);
    }
    const lessons = (weeklyLessonsOutputJsonSchema.properties.lessons as Record<string, any>);
    expect(lessons).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["day1", "day2", "day3", "day4", "day5"]
    });
  });

  it("normalizes the five strict day slots into the canonical five-lesson array", () => {
    const lesson = strictLessonPayload();
    const result = weeklyLessonsOutputSchema.safeParse({
      lessons: { day1: lesson, day2: lesson, day3: lesson, day4: lesson, day5: lesson }
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lessons.map((item) => item.dayNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it("publishes and normalizes a one-day strict schema for decomposed generation", () => {
    expect(weeklyLessonDayOutputJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["lesson"],
      properties: { lesson: { $ref: "#/$defs/lesson" } }
    });
    const result = weeklyLessonDayOutputSchema.safeParse({ lesson: strictLessonPayload() });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lesson.dayNumber).toBe(1);
  });

  it("rejects the legacy nine-part payload and accepts only the enriched eleven-part lesson shape", () => {
    expect(weeklyLessonsOutputSchema.safeParse(output(legacyCodes)).success).toBe(false);
    const enriched = completeEnrichedLesson();
    expect(weeklyLessonsOutputSchema.safeParse({ lessons: Array.from({ length: 5 }, (_, index) => ({ ...enriched, dayNumber: index + 1 })) }).success).toBe(true);
  });

  it("rejects a partially enriched lesson instead of silently dropping a required word part", () => {
    expect(weeklyLessonsOutputSchema.safeParse(output([...legacyCodes.slice(0, -1), "word_class", "speaking"])).success).toBe(false);
  });

  it("rejects lesson parts in an order the learner screen does not support", () => {
    const reordered = [...enrichedCodes.slice(0, 7), enrichedCodes[8]!, enrichedCodes[7]!, enrichedCodes[9]!, enrichedCodes[10]!];
    expect(weeklyLessonsOutputSchema.safeParse(output(reordered)).success).toBe(false);
  });

  it("derives a valid grammar-pattern title from examples when both model titles are descriptive", () => {
    const base = completeEnrichedLesson();
    base.parts.find((part) => part.code === "grammar")!.content.formula = "Use this tense for daily routines";
    const result = weeklyLessonsOutputSchema.safeParse({
      lessons: Array.from({ length: 5 }, (_, index) => ({ ...base, dayNumber: index + 1, title: "Present simple for routines" }))
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lessons.every((item) => item.title === "S + V + O")).toBe(true);
  });

  it("accepts sentence-frame titles that contain a real grammar pattern", () => {
    const result = weeklyLessonsOutputSchema.safeParse({
      lessons: Array.from({ length: 5 }, (_, index) => ({ ...completeEnrichedLesson(), dayNumber: index + 1, title: "I work for + company" }))
    });
    expect(result.success).toBe(true);
  });

  it("normalizes descriptive model titles from the grammar formula before runner validation", () => {
    const source = {
      lessons: Array.from({ length: 5 }, (_, index) => ({
        ...completeEnrichedLesson(), dayNumber: index + 1, title: "Present simple for routines"
      }))
    };
    const parsed = weeklyLessonsOutputSchema.safeParse(source);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.lessons.every((item) => item.title === "S + V + O")).toBe(true);
  });

  it("decodes lessons returned as a JSON string and normalizes their titles", () => {
    const source = {
      lessons: JSON.stringify(Array.from({ length: 5 }, (_, index) => ({
        ...completeEnrichedLesson(), dayNumber: index + 1, title: "Present simple for routines"
      })))
    };
    const parsed = weeklyLessonsOutputSchema.safeParse(source);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.lessons).toHaveLength(5);
      expect(parsed.data.lessons.every((item) => item.title === "S + V + O")).toBe(true);
    }
  });

  it("requires learner-facing content for every generated part", () => {
    const base = completeEnrichedLesson();
    expect(weeklyLessonsOutputSchema.safeParse({ lessons: Array.from({ length: 5 }, (_, index) => ({ ...base, dayNumber: index + 1 })) }).success).toBe(true);
    const missingAudio = structuredClone(base);
    const listening = missingAudio.parts.find((part) => part.code === "listening")!;
    listening.content = { prompt: "What?", options: ["A", "B", "C", "D"], answer: "A" };
    expect(weeklyLessonsOutputSchema.safeParse({ lessons: Array.from({ length: 5 }, (_, index) => ({ ...missingAudio, dayNumber: index + 1 })) }).success).toBe(false);
  });
});
