import { describe, expect, it } from "vitest";
import type { MonthlyCurriculumContract } from "@e4s/domain";
import { evaluateMonthlyLessonQuality } from "./monthly-quality.js";
import { evaluateMonthlyReviewSections } from "./monthly-review-quality.js";

const requiredCodes = ["objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"];

describe("monthly lesson quality", () => {
  it("gates the Vietnamese question/answer translation of every exercise, daily and review (12/11)", () => {
    const untranslate = (content: Record<string, unknown>): Record<string, unknown> => JSON.parse(JSON.stringify(content, (key, value) => key === "questionTranslation" || key === "answerTranslation" ? undefined : value));
    const daily = lesson();
    daily.parts = daily.parts.map((item) => item.code === "reading" ? { code: item.code, content: untranslate(item.content) } : item);
    const dailyFindings = evaluateMonthlyLessonQuality(contract(), 1, daily).severe.filter((row) => row.code === "MONTHLY_EXERCISE_TRANSLATION");
    expect(dailyFindings.map((row) => row.component)).toEqual(["reading"]);
    expect(dailyFindings[0]!.message).toContain("reading.questionTranslation");
    expect(evaluateMonthlyLessonQuality(contract(), 1, lesson()).severe.map((row) => row.code)).not.toContain("MONTHLY_EXERCISE_TRANSLATION");
    const plan = contract(); plan.planSchemaVersion = 2;
    const day = plan.daySpecs[1]!; day.reviewSoundIds = ["sound-1"];
    const review = lesson({ parts: reviewParts().map((item) => item.code === "word_use" ? { code: item.code, content: untranslate(item.content) } : item) });
    const reviewFindings = evaluateMonthlyLessonQuality(plan, 2, review).severe.filter((row) => row.code === "MONTHLY_EXERCISE_TRANSLATION");
    expect(reviewFindings.map((row) => row.component)).toEqual(["word_use"]);
    expect(reviewFindings[0]!.message).toContain("word_use.items[0].variants[0]");
  });
  it("requires exercise translations at A1 only; B1 and B2 never raise MONTHLY_EXERCISE_TRANSLATION (13/11)", () => {
    const untranslated = (content: Record<string, unknown>): Record<string, unknown> => JSON.parse(JSON.stringify(content, (key, value) => key === "questionTranslation" || key === "answerTranslation" ? undefined : value));
    const daily = lesson();
    daily.parts = daily.parts.map((item) => ({ code: item.code, content: untranslated(item.content) }));
    const translationCodes = (cefr: "A1" | "B1" | "B2", dayNumber: number, candidate: ReturnType<typeof lesson>) => {
      const plan = contract(); plan.cefr = cefr;
      return evaluateMonthlyLessonQuality(plan, dayNumber, candidate).severe.filter((row) => row.code === "MONTHLY_EXERCISE_TRANSLATION").map((row) => row.component);
    };
    expect(translationCodes("A1", 1, daily)).toEqual(["listening", "reading", "writing", "word_class", "word_use"]);
    expect(translationCodes("B1", 1, daily)).toEqual([]);
    expect(translationCodes("B2", 1, daily)).toEqual([]);
    const review = lesson({ parts: reviewParts().map((item) => ({ code: item.code, content: untranslated(item.content) })) });
    expect(translationCodes("A1", 2, review).length).toBeGreaterThan(0);
    expect(translationCodes("B1", 2, review)).toEqual([]);
    expect(translationCodes("B2", 2, review)).toEqual([]);
  });
  it("supports a v2 combined review whose first target has only two assigned examples", () => {
    const plan = contract(); plan.planSchemaVersion = 2;
    const day = plan.daySpecs[1]!;
    day.reviewSoundIds = ["sound-1"];
    day.reviewPronunciationExampleIds = ["sound-example-1","sound-example-2"];
    const candidate = lesson({parts:reviewParts()});
    const pron = candidate.parts.find(part => part.code === "pronunciation")!.content;
    pron.words = (pron.words as unknown[]).slice(0,2);
    pron.reviewTargets = [{soundId:"sound-1",focus:"/k/",words:pron.words}];
    expect(evaluateMonthlyLessonQuality(plan,2,candidate).severe).toEqual([]);
  });
  it("enforces daily objectives, contextual examples and the grammar practice contract in v2", () => {
    const plan = contract(); plan.planSchemaVersion = 2;
    const day = plan.daySpecs[0]!;
    day.newLessonNumber = 1;
    day.grammarPlan = {code:"A1",objective:"Identify facts in a workplace update",mode:"recognize",milestoneIds:["grammar-step"],recallMilestoneIds:[]};
    day.pronunciationPlan = {slot:"P1",stage:"recognize",objective:"Identify and repeat the target",targetIds:["sound-1"],exampleIds:day.pronunciationExampleIds,exampleSet:1};
    const candidate = lesson();
    const grammar = candidate.parts.find(part => part.code === "grammar")!.content;
    Object.assign(grammar, {dailyCode:"A1",objective:day.grammarPlan.objective,examples:["We use core-one in our report.","She sends core-two today.","They review the plan every week."],items:[1,2,3].map(i => ({id:"q"+i,prompt:"Chọn dạng đúng " + i,options:["send","sends","sending","sent"],answer:"send",explanation:"The plural subject uses the base form.",milestoneId:"grammar-step"}))});
    Object.assign(candidate.parts.find(part => part.code === "pronunciation")!.content, {stage:"recognize",objective:day.pronunciationPlan.objective});
    expect(evaluateMonthlyLessonQuality(plan,1,candidate).severe).toEqual([]);
    expect(evaluateMonthlyLessonQuality(plan,1,candidate,["We use core-one in our report."]).severe.map(row => row.code)).toContain("MONTHLY_DAILY_GRAMMAR_REPEATED");
    grammar.objective = "Another objective"; grammar.items = [];
    expect(evaluateMonthlyLessonQuality(plan,1,candidate).severe.map(row => row.code)).toEqual(expect.arrayContaining(["MONTHLY_DAILY_GRAMMAR_OBJECTIVE","MONTHLY_DAILY_GRAMMAR_PRACTICE"]));
  });
  it("marks missing learner components and scope drift as severe", () => {
    const report = evaluateMonthlyLessonQuality(contract(), 1, lesson({
      parts: requiredCodes.filter((code) => code !== "speaking").map((code) => part(code))
    }));

    expect(report.severe.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "MONTHLY_COMPONENT_MISSING",
      "MONTHLY_CORE_TERM_MISSING",
      "MONTHLY_GRAMMAR_SCOPE_MISMATCH",
      "MONTHLY_SOUND_SCOPE_MISMATCH"
    ]));
    expect(report.light).toEqual([]);
  });

  it("permits only the scheduled core terms and classifies a missing lexical relation as light", () => {
    const result = evaluateMonthlyLessonQuality(contract(), 1, lesson());
    expect(result.severe).toEqual([]);
    expect(result.light).toEqual([{ severity: "light", code: "MONTHLY_SYNONYM_OR_ANTONYM_MISSING", message: "core-one is missing a synonym or antonym", dayNumber: 1, component: "vocabulary" }]);
  });

  it("does not let a review day introduce a new core term or a support term as a card", () => {
    const result = evaluateMonthlyLessonQuality(contract(), 2, lesson({
      parts: requiredCodes.map((code) => code === "vocabulary"
        ? part(code, { items: [{ word: "core-four", synonyms: ["fourth"], antonyms: ["first"] }, { word: "support-one", synonyms: ["helper"], antonyms: ["blocker"] }] })
        : code === "grammar" ? part(code, { formula: "Core formula" })
          : code === "pronunciation" ? part(code, { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] })
            : part(code))
    }));

    expect(result.severe.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "MONTHLY_REVIEW_INTRODUCES_CORE_TERM",
      "MONTHLY_SUPPORT_TERM_AS_CORE_CARD"
    ]));
  });

  it("validates review grammar and pronunciation against review allocations, not the calendar day's new allocation", () => {
    const review = contract();
    review.grammarTopics[0]!.steps.push({ id: "review-grammar", focus: "review", formula: "Review formula", usage: "Review usage", examples: ["Review example."] });
    review.sounds.push({ id: "review-sound", ipa: "/s/", label: "S", examples: [{ id: "review-1", word: "see", ipa: "/siː/" }, { id: "review-2", word: "soon", ipa: "/suːn/" }, { id: "review-3", word: "sales", ipa: "/seɪlz/" }] });
    const spec = review.daySpecs[1]!;
    spec.grammarStepIds = ["grammar-step"];
    spec.soundId = "sound-1";
    spec.pronunciationExampleIds = ["sound-example-1", "sound-example-2", "sound-example-3"];
    spec.reviewGrammarStepIds = ["review-grammar"];
    spec.reviewSoundIds = ["review-sound"];
    spec.reviewPronunciationExampleIds = ["review-1", "review-2", "review-3"];
    const candidate = lesson({ parts: reviewParts() });
    candidate.parts = candidate.parts.map((item) => item.code === "grammar" ? part(item.code, { ...item.content, formula: "Review formula" }) : item.code === "pronunciation" ? part(item.code, { focus: "/s/", words: [{ word: "see", ipa: "/siː/" }, { word: "soon", ipa: "/suːn/" }, { word: "sales", ipa: "/seɪlz/" }], reviewTargets: [{ soundId: "review-sound", focus: "/s/", words: [{ word: "see", ipa: "/siː/" }, { word: "soon", ipa: "/suːn/" }, { word: "sales", ipa: "/seɪlz/" }] }] }) : item.code === "speaking" ? part(item.code, { items: [
      { id: "s1", prompt: "Nghe và chọn từ", audioText: "see", options: ["see", "she"], answer: "see", explanation: "Âm /s/." },
      { id: "s2", prompt: "Nghe và chọn từ", audioText: "soon", options: ["soon", "noon"], answer: "soon", explanation: "Âm /s/." },
      { id: "s3", prompt: "Đọc to câu sau", passage: "We will see the sales report soon." },
      (item.content.items as unknown[])[3]
    ] }) : item);

    expect(evaluateMonthlyLessonQuality(review, 2, candidate).severe).toEqual([]);
    candidate.parts = candidate.parts.map((item) => item.code === "pronunciation" ? part(item.code, { ...item.content, reviewTargets: [] }) : item);
    expect(evaluateMonthlyLessonQuality(review, 2, candidate).severe.map((item) => item.code)).toContain("MONTHLY_SOUND_SCOPE_MISMATCH");
    candidate.parts = candidate.parts.map((item) => item.code === "pronunciation" ? part(item.code, { focus: "/s/", words: [{ word: "see", ipa: "/siː/" }, { word: "soon", ipa: "/suːn/" }, { word: "sales", ipa: "/seɪlz/" }], reviewTargets: [{ soundId: "review-sound", focus: "/s/", words: [{ word: "see", ipa: "/siː/" }, { word: "soon", ipa: "/suːn/" }, { word: "sales", ipa: "/seɪlz/" }] }] }) : item);
    candidate.parts = candidate.parts.map((item) => item.code === "grammar" ? part(item.code, { ...item.content, formula: "Core formula" }) : item);
    expect(evaluateMonthlyLessonQuality(review, 2, candidate).severe.map((item) => item.code)).toContain("MONTHLY_GRAMMAR_SCOPE_MISMATCH");
  });

  it("requires the six Friday review sections with items, explanations and the spec counts", () => {
    const valid = lesson({ parts: reviewParts() });
    expect(evaluateMonthlyLessonQuality(contract(), 2, valid).severe).toEqual([]);
    const dailyShape = lesson({ parts: reviewParts().map((item) => ["listening", "speaking"].includes(item.code) ? part(item.code, { prompt: "One question", options: ["a", "b", "c", "d"], answer: "a" }) : item) });
    const codes = evaluateMonthlyLessonQuality(contract(), 2, dailyShape).severe.map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(["MONTHLY_REVIEW_COUNT", "MONTHLY_REVIEW_WORD_NOT_COVERED", "MONTHLY_REVIEW_MINIMAL_PAIRS", "MONTHLY_REVIEW_READ_ALOUD_MISSING", "MONTHLY_REVIEW_FREE_RESPONSE_MISSING"]));
    const noExplanation = lesson({ parts: reviewParts().map((item) => item.code === "word_use" ? part(item.code, { items: (item.content.items as Array<Record<string, unknown>>).map(({ explanation: _drop, ...rest }) => rest) }) : item) });
    expect(evaluateMonthlyLessonQuality(contract(), 2, noExplanation).severe.map((item) => item.code)).toContain("MONTHLY_REVIEW_EXPLANATION_MISSING");
  });

  it("marks malformed assessment shapes and missing listening content as severe", () => {
    const result = evaluateMonthlyLessonQuality(contract(), 1, lesson({
      parts: requiredCodes.map((code) => code === "listening"
        ? part(code, { prompt: "What is the amount?", options: ["A", "B", "C", "D"], answer: "E" })
        : code === "reading" ? part(code, { text: "A short passage.", prompt: "What is it?", options: ["A", "B", "C", "D"], answer: "A" })
          : code === "vocabulary" ? part(code, { items: [
            { word: "core-one", synonyms: ["first"], antonyms: ["last"] },
            { word: "core-two", synonyms: ["second"], antonyms: ["last"] },
            { word: "core-three", synonyms: ["third"], antonyms: ["last"] }
          ] })
            : part(code))
    }));

    expect(result.severe.map((finding) => finding.code)).toContain("MONTHLY_CONTENT_INVALID");
  });
});

function contract(): MonthlyCurriculumContract {
  return {
    month: "2026-11", cefr: "A1", version: 1,
    theme: { version: 1, title: "Budget", brief: "Brief", context: "Context", communicationGoal: "Goal" },
    coreTerms: [
      { id: "core-1", word: "core-one", meaning: "một", type: "noun", ipa: "/kɔːr/", source: "core_registry", component: "core", dayNumber: 1 },
      { id: "core-2", word: "core-two", meaning: "hai", type: "noun", ipa: "/tuː/", source: "core_registry", component: "core", dayNumber: 1 },
      { id: "core-3", word: "core-three", meaning: "ba", type: "noun", ipa: "/θriː/", source: "core_registry", component: "core", dayNumber: 1 },
      { id: "core-4", word: "core-four", meaning: "bốn", type: "noun", ipa: "/fɔːr/", source: "core_registry", component: "core", dayNumber: 3 }
    ],
    supportTerms: [{ id: "support-1", word: "support-one", meaning: "hỗ trợ", type: "noun", relation: "collocation", source: "example", component: "expanded", dayNumber: 1, relatedCoreTermId: "core-1" }],
    grammarTopics: [{ id: "grammar-1", title: "Grammar", steps: [{ id: "grammar-step", focus: "focus", formula: "Core formula", usage: "usage", examples: ["Example."] }] }],
    sounds: [{ id: "sound-1", ipa: "/k/", label: "K", examples: [{ id: "sound-example-1", word: "cost", ipa: "/kɒst/" }, { id: "sound-example-2", word: "can", ipa: "/kæn/" }, { id: "sound-example-3", word: "key", ipa: "/kiː/" }] }],
    daySpecs: [
      { lessonNumber: 1, date: "2026-11-02", kind: "new", coreTermIds: ["core-1", "core-2", "core-3"], expandedTermIds: ["support-1"], reviewTermIds: [], reviewExpandedTermIds: [], skillExercises: exercises(["core-1", "core-2", "core-3", "support-1"]), grammarStepId: "grammar-step", soundId: "sound-1", pronunciationExampleIds: ["sound-example-1", "sound-example-2", "sound-example-3"] },
      { lessonNumber: 2, date: "2026-11-06", kind: "review", coreTermIds: [], expandedTermIds: [], reviewTermIds: ["core-1", "core-2", "core-3"], reviewExpandedTermIds: ["support-1"], reviewGrammarStepIds: ["grammar-step"], reviewSoundIds: ["sound-1"], reviewPronunciationExampleIds: ["sound-example-1", "sound-example-2", "sound-example-3"], skillExercises: exercises(["core-1", "core-2", "core-3", "support-1"]), grammarStepId: "grammar-step", soundId: "sound-1", pronunciationExampleIds: ["sound-example-1", "sound-example-2", "sound-example-3"] }
    ]
  };
}

function lesson(overrides: { parts?: Array<{ code: string; content: Record<string, unknown> }> } = {}) {
  return { title: "A usable title", parts: overrides.parts ?? requiredCodes.map((code) => {
    if (code === "objective") return part(code, { text: "Identify three budget words.", items: ["Nhận biết ba từ về ngân sách trong email công việc.", "Dùng cấu trúc mới để nói về chi phí dự án."] });
    if (code === "instruction") return part(code, { steps: ["Đọc ví dụ.", "Trả lời câu hỏi."] });
    if (code === "vocabulary") return part(code, { items: [
      { word: "core-one", synonyms: [], antonyms: [], collocations: ["core-one plan", "a core-one", "core-one cost"], collocationTranslations: ["kế hoạch core-one", "một core-one", "chi phí core-one"] },
      // Unplanned synonyms carry both level meanings, so the fixture passes at A1 (note) and B1 (definition).
      { word: "core-two", synonyms: [{ word: "second", note: "thứ hai", definition: "the one after the first" }], antonyms: [], collocations: ["core-two plan", "a core-two", "core-two cost"], collocationTranslations: ["kế hoạch core-two", "một core-two", "chi phí core-two"] },
      { word: "core-three", synonyms: [{ word: "third", note: "thứ ba", definition: "the one after the second" }], antonyms: [], collocations: ["core-three plan", "a core-three", "core-three cost"], collocationTranslations: ["kế hoạch core-three", "một core-three", "chi phí core-three"] }
    ] });
    if (code === "grammar") return part(code, { formula: "Core formula" });
    if (code === "pronunciation") return part(code, { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] });
    if (["listening", "reading", "word_class", "word_use"].includes(code)) return part(code, {
      ...(code === "listening" ? { script: "The cost is high." } : code === "reading" ? { text: "The cost is high." } : {}),
      prompt: "Chọn đáp án đúng: What is high?", options: ["The cost", "The room", "The plan", "The date"], answer: "The cost"
    });
    if (code === "writing") return part(code, { prompt: "Viết một câu về cost.", answer: "The cost is high." });
    if (code === "speaking") return part(code, { prompt: "Nói một câu về cost.", sample: "The cost is high." });
    return part(code);
  }) };
}

function part(code: string, content: Record<string, unknown> = {}) { return { code, content: translated(content) }; }

/** Adds the 12/11 Vietnamese question/answer translations to every question that has a prompt and an answer (items and variants too). */
function translated<T>(value: T): T {
  if (Array.isArray(value)) return value.map(translated) as T;
  if (!value || typeof value !== "object") return value;
  const record = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, key === "items" || key === "variants" ? translated(item) : item]));
  if (typeof record.prompt === "string" && (typeof record.answer === "string" || Array.isArray(record.answer))) {
    return { questionTranslation: "Câu hỏi đã dịch sang tiếng Việt.", answerTranslation: "Đáp án đúng bằng tiếng Việt.", ...record } as T;
  }
  return record as T;
}


/** A valid Friday review: study parts plus the six item sections (3 core words, 1 grammar step). */
function reviewParts() {
  const choice = (id: string, prompt: string, answer: string, others: string[]) => ({ id, prompt: `Chọn đáp án đúng: ${prompt}`, options: [answer, ...others], answer, explanation: "Vì câu này đúng nghĩa.", variants: [{ id: `${id}-v1`, prompt: `Chọn lại: ${prompt}`, options: [answer, ...others], answer, explanation: "Giải thích." }] });
  const base = lesson().parts.filter((item) => ["objective", "instruction", "vocabulary", "grammar", "pronunciation"].includes(item.code));
  return [
    ...base,
    part("listening", { items: ["core-one", "core-two", "core-three"].map((word, index) => ({ ...choice(`l${index}`, "Nghe và chọn nghĩa đúng", ["một", "hai", "ba"][index]!, ["bốn", "năm", "sáu"]), audioText: word })) }),
    part("word_use", { items: [choice("u1", "Pick the synonym of core-two", "second", ["first", "third", "fourth"]), choice("u2", "The ____ is due.", "core-one", ["core-two", "core-three", "room"])] }),
    part("word_class", { items: [choice("f1", "We ____ it yesterday.", "planned", ["plan", "plans", "planning"]), choice("f2", "Two ____ arrived.", "reports", ["report", "reporting", "reported"])] }),
    part("reading", { passage: "The core-one is ready. The core-two is late. The core-three is new.", items: [choice("r1", "What is ready?", "core-one", ["core-two", "core-three", "room"]), choice("r2", "What is late?", "core-two", ["core-one", "core-three", "room"]), choice("r3", "What is new?", "core-three", ["core-one", "core-two", "room"])] }),
    part("speaking", { items: [
      { id: "s1", prompt: "Nghe và chọn từ", audioText: "cost", options: ["cost", "coast"], answer: "cost", explanation: "Âm /ɒ/." },
      { id: "s2", prompt: "Nghe và chọn từ", audioText: "can", options: ["can", "cane"], answer: "can", explanation: "Âm /æ/." },
      { id: "s3", prompt: "Đọc to câu sau", passage: "The key cost can change." },
      { id: "s4", prompt: "Hãy nói với quản lý về kế hoạch.", requiredWords: ["core-one", "core-two", "core-three"], minRequiredWords: 2 }
    ] })
  ].map((item) => item.code === "grammar" ? part("grammar", { ...item.content, items: [choice("g1", "She ____ every day.", "works", ["work", "working", "worked"])] })
    : item.code === "pronunciation" ? part("pronunciation", { ...item.content, reviewTargets: [{ soundId: "sound-1", focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] }] })
      : item);
}

function exercises(resourceIds: string[]) {
  return ["listening", "reading", "writing", "word_class", "word_use", "speaking"].map((exerciseCode) => ({ exerciseCode: exerciseCode as "listening" | "reading" | "writing" | "word_class" | "word_use" | "speaking", focus: "Use assigned materials.", resourceIds }));
}

describe("monthly lesson quality – AI quality plan 11/11 (WP1, WP3, WP7, WP8)", () => {
  const codes = (report: ReturnType<typeof evaluateMonthlyLessonQuality>) => report.severe.map((row) => row.code);
  const withPart = (candidate: ReturnType<typeof lesson>, code: string, content: Record<string, unknown>) => ({ ...candidate, parts: candidate.parts.map((item) => item.code === code ? part(code, content) : item) });
  const v2Day = (cefr: "A1" | "B1" = "A1") => {
    const plan = contract(); plan.planSchemaVersion = 2; plan.cefr = cefr;
    const day = plan.daySpecs[0]!;
    day.newLessonNumber = 1;
    day.grammarPlan = { code: "A1", objective: "Dùng quá khứ đơn để kể lại việc đã làm.", mode: "recognize", milestoneIds: ["grammar-step"], recallMilestoneIds: [] };
    day.pronunciationPlan = { slot: "P1", stage: "recognize", objective: "Hear, identify and produce the target sound", targetIds: ["sound-1"], exampleIds: day.pronunciationExampleIds, exampleSet: 1 };
    const candidate = lesson();
    const grammar = candidate.parts.find((item) => item.code === "grammar")!.content;
    Object.assign(grammar, { dailyCode: "A1", objective: day.grammarPlan.objective, examples: ["We use core-one in our report.", "She sends core-two today.", "They review the plan every week."], items: [1, 2, 3].map((i) => ({ id: `q${i}`, prompt: `Chọn dạng đúng ${i}: They ____ the plan.`, options: ["send", "sends", "sending", "sent"], answer: "send", explanation: "Chủ ngữ số nhiều dùng động từ nguyên mẫu.", milestoneId: "grammar-step" })) });
    Object.assign(candidate.parts.find((item) => item.code === "pronunciation")!.content, { stage: "recognize", objective: day.pronunciationPlan.objective });
    return { plan, day, candidate };
  };
  const englishB1 = (candidate: ReturnType<typeof lesson>) => ({ ...candidate, parts: candidate.parts.map((item) => {
    if (item.code === "instruction") return part("instruction", { steps: ["Read the example.", "Answer the question."] });
    if (item.code === "objective") return part("objective", { ...item.content, items: ["Identify three budget words in a work email.", "Use the new structure to describe a project cost."] });
    // B1+ cards carry no collocation translations (generation drops them).
    if (item.code === "vocabulary") return part("vocabulary", { ...item.content, items: (item.content.items as Array<Record<string, unknown>>).map(({ collocationTranslations: _lines, ...card }) => card) });
    if (item.code === "grammar") return part("grammar", { ...item.content, items: (item.content.items as Array<Record<string, unknown>>).map((question) => ({ ...question, prompt: "Choose the correct form: They ____ the plan.", explanation: "A plural subject takes the base form." })) });
    if (typeof item.content.prompt === "string") return part(item.code, { ...item.content, prompt: "What is high?" });
    return item;
  }) });

  it("1a: a B1 grammar.objective copied verbatim from the Vietnamese plan is exempt from the English-only check", () => {
    const { plan, candidate } = v2Day("B1");
    const b1 = englishB1(candidate);
    expect(evaluateMonthlyLessonQuality(plan, 1, b1).severe).toEqual([]);
    const grammar = b1.parts.find((item) => item.code === "grammar")!.content;
    const vietnameseNote = withPart(b1, "grammar", { ...grammar, text: "Dùng quá khứ đơn cho việc đã xong." });
    expect(evaluateMonthlyLessonQuality(plan, 1, vietnameseNote).severe).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MONTHLY_CONTENT_INVALID", component: "grammar" })]));
    const drifted = withPart(b1, "grammar", { ...grammar, objective: "Dùng quá khứ đơn để kể việc." });
    expect(codes(evaluateMonthlyLessonQuality(plan, 1, drifted))).toEqual(expect.arrayContaining(["MONTHLY_CONTENT_INVALID", "MONTHLY_DAILY_GRAMMAR_OBJECTIVE"]));
  });

  it("1a: accepts a grammar objective saved with the pre-13/11 wording (word list in brackets) and its readable form", () => {
    const { plan, day, candidate } = v2Day();
    const words = plan.coreTerms.filter((term) => day.coreTermIds.includes(term.id)).map((term) => term.word).join(", ");
    const grammar = candidate.parts.find((item) => item.code === "grammar")!.content;
    const objectiveCodes = (value: ReturnType<typeof lesson>) => codes(evaluateMonthlyLessonQuality(plan, 1, value)).filter((code) => code === "MONTHLY_DAILY_GRAMMAR_OBJECTIVE");
    // Plan stored with the old wording, lesson saved with the same old text.
    day.grammarPlan!.objective = `Dùng quá khứ đơn để kể lại việc đã làm (${words}).`;
    expect(objectiveCodes(withPart(candidate, "grammar", { ...grammar, objective: day.grammarPlan!.objective }))).toEqual([]);
    // Plan stored with the old wording, lesson written with the readable wording.
    expect(objectiveCodes(withPart(candidate, "grammar", { ...grammar, objective: "Dùng quá khứ đơn để kể lại việc đã làm." }))).toEqual([]);
    // A different objective still fails, and the repair message gives the readable wording.
    const drifted = evaluateMonthlyLessonQuality(plan, 1, withPart(candidate, "grammar", { ...grammar, objective: "Paraphrased" }));
    expect(drifted.severe.find((row) => row.code === "MONTHLY_DAILY_GRAMMAR_OBJECTIVE")?.message).toContain("\"Dùng quá khứ đơn để kể lại việc đã làm.\"");
  });

  it("1b: repair messages state the exact expected plan strings", () => {
    const { plan, candidate } = v2Day();
    const grammar = candidate.parts.find((item) => item.code === "grammar")!.content;
    const broken = withPart(withPart(candidate, "grammar", { ...grammar, formula: "Something else", dailyCode: "B9", objective: "Paraphrased" }), "pronunciation", { focus: "/g/", words: [{ word: "cost", ipa: "/kɒst/" }], stage: "sentence", objective: "Other" });
    const messages = Object.fromEntries(evaluateMonthlyLessonQuality(plan, 1, broken).severe.map((row) => [row.code, row.message]));
    expect(messages.MONTHLY_GRAMMAR_SCOPE_MISMATCH).toContain("\"Core formula\"");
    expect(messages.MONTHLY_DAILY_GRAMMAR_OBJECTIVE).toContain("grammar.dailyCode to \"A1\"");
    expect(messages.MONTHLY_DAILY_GRAMMAR_OBJECTIVE).toContain("\"Dùng quá khứ đơn để kể lại việc đã làm.\"");
    expect(messages.MONTHLY_DAILY_PRONUNCIATION_STAGE).toContain("pronunciation.stage to \"recognize\"");
    expect(messages.MONTHLY_DAILY_PRONUNCIATION_STAGE).toContain("\"Hear, identify and produce the target sound\"");
    expect(messages.MONTHLY_SOUND_SCOPE_MISMATCH).toContain("pronunciation.focus to \"/k/\"");
    expect(messages.MONTHLY_SOUND_SCOPE_MISMATCH).toContain("cost /kɒst/, can /kæn/, key /kiː/");
  });

  it("1b: the read-aloud position message lists the exact positions and word counts", () => {
    const { plan, day, candidate } = v2Day();
    day.pronunciationPlan = { ...day.pronunciationPlan!, stage: "read_aloud", requiredPositions: [{ soundId: "sound-1", exampleId: "sound-example-1" }, { soundId: "sound-1", exampleId: "sound-example-2" }] };
    const pron = candidate.parts.find((item) => item.code === "pronunciation")!.content;
    const report = evaluateMonthlyLessonQuality(plan, 1, withPart(candidate, "pronunciation", { ...pron, stage: "read_aloud", passage: "The cost is high.", targetPositions: [] }));
    const message = report.severe.find((row) => row.code === "MONTHLY_COMBINED_PRONUNCIATION_POSITIONS")?.message ?? "";
    expect(message).toContain("{soundId \"sound-1\", exampleId \"sound-example-2\"}");
    expect(message).toContain("\"can\" ×1");
  });

  it("1c: formulas match after normalising spaces, ellipsis, quote style and case", () => {
    const plan = contract();
    plan.grammarTopics[0]!.steps[0]!.formula = "Can / Could + subject + base verb …? (‘please’)";
    const ok = withPart(lesson(), "grammar", { formula: "can/could +  Subject + base verb ...? ('please')" });
    expect(codes(evaluateMonthlyLessonQuality(plan, 1, ok))).not.toContain("MONTHLY_GRAMMAR_SCOPE_MISMATCH");
    const paraphrased = withPart(lesson(), "grammar", { formula: "Could you + verb?" });
    expect(codes(evaluateMonthlyLessonQuality(plan, 1, paraphrased))).toContain("MONTHLY_GRAMMAR_SCOPE_MISMATCH");
  });

  it("WP3: a Word form that asks for the word class with label options is severe (real sample a1-L4)", () => {
    const asksClass = withPart(lesson(), "word_class", { prompt: "Từ 'quick' trong câu 'The client gave us quick feedback' thuộc từ loại nào?", options: ["noun", "verb", "adjective", "adverb"], answer: "adjective" });
    expect(codes(evaluateMonthlyLessonQuality(contract(), 1, asksClass))).toEqual(expect.arrayContaining(["MONTHLY_WORD_FORM_ASKS_WORD_CLASS", "MONTHLY_WORD_FORM_LABEL_OPTIONS"]));
    const english = withPart(lesson(), "word_class", { prompt: "Chọn đáp án: What is the word class of 'video' in the sentence 'We will update the video before Friday.'?", options: ["noun", "verb", "adjective", "adverb"], answer: "noun" });
    expect(codes(evaluateMonthlyLessonQuality(contract(), 1, english))).toContain("MONTHLY_WORD_FORM_ASKS_WORD_CLASS");
    // Real sample b1-L5: choose the right form in a sentence.
    const wordForm = withPart(lesson(), "word_class", { prompt: "Chọn dạng đúng của từ: Please send the updated ____ to the client before Friday's meeting.", options: ["document", "documented", "documenting", "documentary"], answer: "document" });
    expect(codes(evaluateMonthlyLessonQuality(contract(), 1, wordForm)).filter((code) => code.startsWith("MONTHLY_WORD_FORM"))).toEqual([]);
  });

  it("WP3: the Word form answer must not repeat the bracketed hint word", () => {
    const hint = withPart(lesson(), "word_class", { prompt: "Chọn dạng đúng: Please send the ____ (document) today.", options: ["document", "documents", "documented", "documenting"], answer: "document" });
    expect(codes(evaluateMonthlyLessonQuality(contract(), 1, hint))).toContain("MONTHLY_WORD_FORM_ANSWER_IS_HINT");
    const changed = withPart(lesson(), "word_class", { prompt: "Chọn dạng đúng: We need a quick ____ (decide) today.", options: ["decide", "decision", "decisive", "decisively"], answer: "decision" });
    expect(codes(evaluateMonthlyLessonQuality(contract(), 1, changed))).not.toContain("MONTHLY_WORD_FORM_ANSWER_IS_HINT");
  });

  it("WP3: invented verb forms and nonsense suffixes in options are severe, real forms pass", () => {
    const invented = withPart(lesson(), "grammar", { formula: "Core formula", items: [{ id: "g1", prompt: "Chọn dạng đúng: Yesterday we ____ the file.", options: ["sent", "sended", "maked", "send"], answer: "sent", explanation: "Quá khứ của send là sent." }] });
    expect(evaluateMonthlyLessonQuality(contract(), 1, invented).severe.find((row) => row.code === "MONTHLY_INVENTED_WORD_FORM")?.message).toContain("sended, maked");
    const suffix = withPart(lesson(), "word_use", { prompt: "Chọn từ đúng: The client ____ on the design.", options: ["feedbacked", "colleagued", "commented", "accurating"], answer: "commented" });
    expect(codes(evaluateMonthlyLessonQuality(contract(), 1, suffix))).toContain("MONTHLY_INVENTED_WORD_FORM");
    const real = withPart(lesson(), "grammar", { formula: "Core formula", items: [{ id: "g1", prompt: "Chọn dạng đúng: Yesterday we ____ the file.", options: ["sent", "send", "sends", "sending"], answer: "sent", explanation: "Quá khứ của send là sent." }] });
    expect(codes(evaluateMonthlyLessonQuality(contract(), 1, real))).not.toContain("MONTHLY_INVENTED_WORD_FORM");
  });

  it("an answer that is the longest option is not flagged (answer-length rule removed 13/11)", () => {
    const modal = (index: number) => ({ id: `r${index}`, prompt: "____ you send the report today?", options: ["Can", "Will", "Must", "Could"], answer: "Could", explanation: "Lời đề nghị lịch sự." });
    const long = (answer: string, index: number) => ({ id: `l${index}`, prompt: "Chọn đáp án đúng", options: [answer, "No.", "Yes.", "Maybe."], answer, explanation: "Vì đúng." });
    const cued = lesson({ parts: reviewParts().map((item) => item.code === "grammar" ? part("grammar", { ...item.content, items: [0, 1, 2].map(modal) }) : item.code === "reading" ? part("reading", { ...item.content, items: ["The budget is ready now.", "The team is late again.", "The plan changed today."].map(long) }) : item) });
    const report = evaluateMonthlyLessonQuality(contract(), 2, cued);
    expect([...report.light, ...report.severe].map((row) => row.code)).not.toContain("MONTHLY_ANSWER_LONGEST_OPTION");
  });

  it("WP7: A1–A2 prompts must contain Vietnamese (real sample r1-a1-n8), B1 is unaffected", () => {
    const english = withPart(lesson(), "word_use", { prompt: "Which sentence uses 'learn' correctly in a workplace meeting?", options: ["We learn from the client feedback every week.", "We learn the feedback every week to the client.", "We learn feedback the client every week.", "We learns from the client feedback every week."], answer: "We learn from the client feedback every week." });
    expect(evaluateMonthlyLessonQuality(contract(), 1, english).severe).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MONTHLY_A1A2_INSTRUCTION_LANGUAGE", component: "word_use" })]));
    const englishInstruction = withPart(lesson(), "instruction", { text: "Review today's study tab first.", steps: ["Read each word card."] });
    expect(codes(evaluateMonthlyLessonQuality(contract(), 1, englishInstruction))).toContain("MONTHLY_A1A2_INSTRUCTION_LANGUAGE");
    const reviewEnglish = lesson({ parts: reviewParts().map((item) => item.code === "word_class" ? part("word_class", { items: (item.content.items as Array<Record<string, unknown>>).map((row) => ({ ...row, prompt: "Read the message and choose the best answer." })) }) : item) });
    expect(evaluateMonthlyLessonQuality(contract(), 2, reviewEnglish).severe).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MONTHLY_A1A2_INSTRUCTION_LANGUAGE", component: "word_class" })]));
    const { plan, candidate } = v2Day("B1");
    expect(codes(evaluateMonthlyLessonQuality(plan, 1, englishB1(candidate)))).not.toContain("MONTHLY_A1A2_INSTRUCTION_LANGUAGE");
  });

  it("WP7: internal planning terms and a pasted communicationGoal are blocked; a vocabulary meaning is not", () => {
    const plan = contract();
    plan.theme.communicationGoal = "Trong tháng 11, người học có thể cập nhật tiến độ dự án với khách hàng.";
    const internal = withPart(lesson(), "speaking", { prompt: "Nói 2 câu, dùng one core term và one expanded term.", sample: "The cost is high." });
    expect(evaluateMonthlyLessonQuality(plan, 1, internal).severe.find((row) => row.code === "MONTHLY_INTERNAL_TERM_EXPOSED")?.message).toContain("core term");
    const pasted = withPart(lesson(), "speaking", { prompt: "Hãy nói về 'Trong tháng 11, người học có thể cập nhật tiến độ dự án'", sample: "The cost is high." });
    expect(codes(evaluateMonthlyLessonQuality(plan, 1, pasted))).toContain("MONTHLY_INTERNAL_TERM_EXPOSED");
    const vocabulary = lesson().parts.find((item) => item.code === "vocabulary")!.content;
    const meaning = withPart(lesson(), "vocabulary", { items: (vocabulary.items as Array<Record<string, unknown>>).map((row, index) => index === 0 ? { ...row, meaning: "người học" } : row) });
    expect(codes(evaluateMonthlyLessonQuality(plan, 1, meaning))).not.toContain("MONTHLY_INTERNAL_TERM_EXPOSED");
  });

  it("WP8: review minimal pairs need a week example word and no offensive word (real sample sheet/shit)", () => {
    const base = reviewParts().find((item) => item.code === "speaking")!.content.items as unknown[];
    const speaking = (items: unknown[]) => lesson({ parts: reviewParts().map((item) => item.code === "speaking" ? part("speaking", { items }) : item) });
    const offensive = speaking([{ id: "s1", prompt: "Nghe và chọn từ", audioText: "sheet", options: ["sheet", "shit"], answer: "sheet", explanation: "Âm /iː/ dài." }, ...base.slice(1)]);
    expect(evaluateMonthlyLessonQuality(contract(), 2, offensive).severe).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MONTHLY_OFFENSIVE_WORD", component: "speaking" }), expect.objectContaining({ code: "MONTHLY_REVIEW_MINIMAL_PAIR_SCOPE" })]));
    const outside = speaking([{ id: "s1", prompt: "Nghe và chọn từ", audioText: "team", options: ["team", "tim"], answer: "team", explanation: "Âm /iː/." }, ...base.slice(1)]);
    expect(codes(evaluateMonthlyLessonQuality(contract(), 2, outside))).toContain("MONTHLY_REVIEW_MINIMAL_PAIR_SCOPE");
    expect(codes(evaluateMonthlyLessonQuality(contract(), 2, speaking(base)))).toEqual([]);
  });

  it("WP8: the read-aloud needs ≥2 week example words and requiredWords outside the week are severe", () => {
    const base = reviewParts().find((item) => item.code === "speaking")!.content.items as Array<Record<string, unknown>>;
    const speaking = (items: unknown[]) => lesson({ parts: reviewParts().map((item) => item.code === "speaking" ? part("speaking", { items }) : item) });
    const weak = speaking([base[0], base[1], { id: "s3", prompt: "Đọc to câu sau", passage: "The project manager will learn the work problem." }, base[3]]);
    expect(codes(evaluateMonthlyLessonQuality(contract(), 2, weak))).toContain("MONTHLY_REVIEW_READ_ALOUD_WORDS");
    const inflected = speaking([base[0], base[1], { id: "s3", prompt: "Đọc to câu sau", passage: "The costs can change soon." }, base[3]]);
    expect(codes(evaluateMonthlyLessonQuality(contract(), 2, inflected))).not.toContain("MONTHLY_REVIEW_READ_ALOUD_WORDS");
    const required = speaking([base[0], base[1], base[2], { ...base[3], requiredWords: ["core-one", "could", "already"] }]);
    expect(evaluateMonthlyLessonQuality(contract(), 2, required).severe.find((row) => row.code === "MONTHLY_REVIEW_REQUIRED_WORD_SCOPE")?.message).toContain("could, already");
  });
});

describe("Friday review gate (AI quality round 2, 11/11)", () => {
  const sections = (overrides: Record<string, Record<string, unknown>> = {}) => new Map(reviewParts().map((item) => [item.code, { content: overrides[item.code] ?? item.content }] as const));
  const english = (cefr: "B1" | "C1") => {
    const plan = contract(); plan.cefr = cefr;
    const choice = (id: string, prompt: string, answer: string, others: string[]) => ({ id, prompt, options: [answer, ...others], answer, explanation: "It fits the sentence.", variants: [{ id: `${id}-v1`, prompt: `${prompt}?`, options: [answer, ...others], answer, explanation: "Same reason." }] });
    const listening = { items: ["core-one", "core-two", "core-three"].map((word, index) => ({ ...choice(`l${index}`, "Listen and choose the meaning", ["một", "hai", "ba"][index]!, ["bốn", "năm", "sáu"]), audioText: word })) };
    const speaking = { items: [
      { id: "s1", prompt: "Listen and choose the word", audioText: "cost", options: ["cost", "coast"], answer: "cost", explanation: "Short /ɒ/." },
      { id: "s2", prompt: "Listen and choose the word", audioText: "can", options: ["can", "cane"], answer: "can", explanation: "Short /æ/." },
      { id: "s3", prompt: "Read this sentence aloud", passage: "The key cost can change." },
      { id: "s4", prompt: "Tell your manager about the plan.", requiredWords: ["core-one", "core-two", "core-three"], minRequiredWords: 2 }
    ] };
    const parts = new Map([...sections()].map(([code, value]) => [code, { content: code === "listening" ? listening : code === "speaking" ? speaking : !["word_use", "word_class", "grammar", "reading"].includes(code) ? value.content : { ...value.content, items: (value.content.items as Array<Record<string, unknown>>).map((item, index) => choice(`${code}${index}`, String(item.prompt).replace(/^Chọn đáp án đúng: /u, ""), String(item.answer), (item.options as string[]).slice(1))) } }] as const));
    return { plan, parts };
  };
  const codes = (result: { severe: Array<{ code: string }> }) => result.severe.map((item) => item.code);

  it("B1+: accepts English sections with Vietnamese listening meanings, rejects Vietnamese prompts (\"Nghe và chọn nghĩa đúng\" at B1, C1)", () => {
    for (const cefr of ["B1", "C1"] as const) {
      const { plan, parts } = english(cefr);
      expect(evaluateMonthlyReviewSections(plan, plan.daySpecs[1]!, 2, parts).severe).toEqual([]);
      const listening = parts.get("listening")!.content as { items: Array<Record<string, unknown>> };
      parts.set("listening", { content: { items: listening.items.map((item) => ({ ...item, prompt: "Nghe và chọn nghĩa đúng" })) } });
      parts.set("word_class", { content: { items: [{ ...(parts.get("word_class")!.content.items as Array<Record<string, unknown>>)[0]!, prompt: "Chọn dạng đúng của từ để điền vào chỗ trống: We ____ it yesterday." }, ...(parts.get("word_class")!.content.items as unknown[]).slice(1)] } });
      const result = evaluateMonthlyReviewSections(plan, plan.daySpecs[1]!, 2, parts);
      expect(result.severe.filter((item) => item.code === "MONTHLY_REVIEW_INSTRUCTION_LANGUAGE").map((item) => item.component).sort()).toEqual(["listening", "word_class"]);
      expect(result.severe.find((item) => item.component === "listening")!.message).toContain("Nghe và chọn nghĩa đúng");
    }
  });

  it("B1+: translation fields (grammar exampleTranslations, question/answer translations) are not English-only prose (13/11 B1 review)", () => {
    for (const cefr of ["B1", "C1"] as const) {
      const { plan, parts } = english(cefr);
      const grammar = parts.get("grammar")!.content;
      parts.set("grammar", { content: { ...grammar, examples: ["We were discussing the budget when the client called."], exampleTranslations: ["Chúng tôi đang thảo luận ngân sách thì khách hàng gọi.", "Trong khi các lập trình viên đang kiểm thử ứng dụng, nhà thiết kế cập nhật màn hình."], steps: [{ formula: "S + was/were + V-ing", examples: ["We were testing it."], exampleTranslations: ["Chúng tôi đang kiểm thử nó."] }], items: (grammar.items as Array<Record<string, unknown>>).map((item) => ({ ...item, questionTranslation: "Trong khi cả nhóm ____ báo cáo mới, quản lý đã gọi.", answerTranslation: "đang xem xét" })) } });
      expect(codes(evaluateMonthlyReviewSections(plan, plan.daySpecs[1]!, 2, parts))).not.toContain("MONTHLY_REVIEW_INSTRUCTION_LANGUAGE");
      // Real Vietnamese prose in a learner field is still flagged.
      parts.set("grammar", { content: { ...parts.get("grammar")!.content, text: "Trong khi các lập trình viên đang kiểm thử ứng dụng, nhà thiết kế cập nhật màn hình." } });
      expect(codes(evaluateMonthlyReviewSections(plan, plan.daySpecs[1]!, 2, parts))).toContain("MONTHLY_REVIEW_INSTRUCTION_LANGUAGE");
    }
  });

  it("A1-A2 reviews keep their Vietnamese prompts (the English-only check does not apply)", () => {
    const plan = contract();
    expect(codes(evaluateMonthlyReviewSections(plan, plan.daySpecs[1]!, 2, sections()))).not.toContain("MONTHLY_REVIEW_INSTRUCTION_LANGUAGE");
  });

  it("rejects non-minimal pairs from the remeasure and keeps real ones", () => {
    const plan = contract();
    plan.sounds[0]!.examples.push({ id: "sound-example-4", word: "event", ipa: "/ɪˈvent/" }, { id: "sound-example-5", word: "bat", ipa: "/bæt/" });
    plan.daySpecs[1]!.reviewPronunciationExampleIds = [...plan.daySpecs[1]!.reviewPronunciationExampleIds!, "sound-example-4", "sound-example-5"];
    const speaking = (first: string[], second: string[]) => sections({ speaking: { items: [
      { id: "s1", prompt: "Nghe và chọn từ", audioText: first[0], options: first, answer: first[0], explanation: "Âm." },
      { id: "s2", prompt: "Nghe và chọn từ", audioText: second[0], options: second, answer: second[0], explanation: "Âm." },
      { id: "s3", prompt: "Đọc to câu sau", passage: "The key cost can change." },
      { id: "s4", prompt: "Hãy nói với quản lý về kế hoạch.", requiredWords: ["core-one", "core-two", "core-three"], minRequiredWords: 2 }
    ] } });
    expect(codes(evaluateMonthlyReviewSections(plan, plan.daySpecs[1]!, 2, speaking(["cost", "coast"], ["can", "cane"])))).not.toContain("MONTHLY_REVIEW_MINIMAL_PAIR_NOT_MINIMAL");
    const bad = evaluateMonthlyReviewSections(plan, plan.daySpecs[1]!, 2, speaking(["event", "segment"], ["bat", "box"])).severe.filter((item) => item.code === "MONTHLY_REVIEW_MINIMAL_PAIR_NOT_MINIMAL");
    // The repair message names the item first (December 2026 A1 L4).
    expect(bad.map((item) => item.message.split(" is not")[0])).toEqual(["speaking item s1: \"event / segment\"", "speaking item s2: \"bat / box\""]);
  });

  it("names the section, the exact count and how many items are missing (MONTHLY_REVIEW_COUNT, A1 W2 returned 1 item per section)", () => {
    const plan = contract();
    const one = (code: string) => ({ ...reviewParts().find((item) => item.code === code)!.content, items: [(reviewParts().find((item) => item.code === code)!.content.items as unknown[])[0]] });
    const result = evaluateMonthlyReviewSections(plan, plan.daySpecs[1]!, 2, sections({ listening: one("listening"), reading: one("reading"), word_use: one("word_use"), word_class: one("word_class"), speaking: { items: [] } }));
    const message = (component: string, code: string) => result.severe.find((item) => item.component === component && item.code === code)?.message ?? "";
    expect(message("listening", "MONTHLY_REVIEW_COUNT")).toContain("listening.items must contain exactly 3 items, one word-recognition item per core word (core-one, core-two, core-three); it has 1 (2 missing)");
    expect(message("reading", "MONTHLY_REVIEW_COUNT")).toContain("reading.items must contain exactly 3 comprehension questions about the passage; it has 1 (2 missing)");
    expect(message("word_use", "MONTHLY_REVIEW_COUNT")).toContain("word_use.items must contain exactly 2 items; it has 1 (1 missing)");
    expect(message("word_class", "MONTHLY_REVIEW_COUNT")).toContain("word_class.items must contain exactly 2 Word form items; it has 1 (1 missing)");
    expect(message("speaking", "MONTHLY_REVIEW_MINIMAL_PAIRS")).toContain("it has 0 minimal pair(s), 0 read-aloud, 0 free response");
  });
});

describe("monthly lesson objective (12/11: core words shown as objectives)", () => {
  const withObjective = (content: Record<string, unknown>) => {
    const candidate = lesson();
    return { ...candidate, parts: candidate.parts.map((item) => item.code === "objective" ? part("objective", content) : item) };
  };
  const objectiveFinding = (content: Record<string, unknown>) => evaluateMonthlyLessonQuality(contract(), 1, withObjective(content)).severe.find((item) => item.code === "MONTHLY_OBJECTIVE_CAN_DO");

  it("passes 2-3 can-do statements", () => {
    expect(objectiveFinding({ text: "Nói về chi phí dự án.", items: ["Nhận biết ba từ về ngân sách trong email.", "Dùng cấu trúc mới để nói về chi phí dự án."] })).toBeUndefined();
  });

  it("rejects the day's core words stored as objective items (real 4300 lesson a50bf937: partner / discuss / agree) and sends objective to repair", () => {
    const found = objectiveFinding({ text: "Nói về chi phí dự án.", items: ["core-one", "core-two", "core-three"] });
    expect(found?.component).toBe("objective");
    expect(found?.message).toContain("is a word or heading, not a can-do statement");
    expect(found?.message).toContain("2-3 short Vietnamese can-do statements");
  });

  it("rejects missing items, vocabulary cards, too many items and an internal step label", () => {
    expect(objectiveFinding({ text: "Nói về chi phí dự án." })?.message).toContain("must hold 2-3 can-do statements; it has 0");
    expect(objectiveFinding({ text: "Nói về chi phí.", items: [{ word: "client", meaning: "khách hàng" }, { word: "report", meaning: "báo cáo" }] })?.message).toContain("vocabulary cards");
    const twelve = Array.from({ length: 12 }, (_, index) => `Ôn lại từ số ${index + 1} trong bài.`);
    expect(objectiveFinding({ text: "Ôn tập tuần.", items: twelve })?.message).toContain("it has 12");
    expect(objectiveFinding({ text: "Step B1 (Identify): Notice past simple in a meeting summary.", items: ["Nhận biết ba từ về ngân sách trong email.", "Dùng cấu trúc mới để nói về chi phí dự án."] })?.message).toContain("internal step label");
  });

  it("applies the level language: Vietnamese at A1-A2, English from B1", () => {
    expect(objectiveFinding({ text: "Nói về chi phí.", items: ["Identify three budget words in an email.", "Use the new structure to describe a cost."] })?.message).toContain("must be written in Vietnamese for A1");
    const b1 = contract(); b1.cefr = "B1";
    const english = withObjective({ text: "Describe a project cost.", items: ["Identify three budget words in an email.", "Use the new structure to describe a cost."] });
    expect(evaluateMonthlyLessonQuality(b1, 1, english).severe.map((item) => item.code)).not.toContain("MONTHLY_OBJECTIVE_CAN_DO");
    const words = withObjective({ text: "Describe a project cost.", items: ["Partner", "Discuss", "Agree"] });
    expect(evaluateMonthlyLessonQuality(b1, 1, words).severe.find((item) => item.code === "MONTHLY_OBJECTIVE_CAN_DO")?.message).toContain("2-3 short English can-do statements");
  });
});
