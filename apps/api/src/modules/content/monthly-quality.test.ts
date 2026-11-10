import { describe, expect, it } from "vitest";
import type { MonthlyCurriculumContract } from "@e4s/domain";
import { evaluateMonthlyLessonQuality } from "./monthly-quality.js";

const requiredCodes = ["objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"];

describe("monthly lesson quality", () => {
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
    Object.assign(grammar, {dailyCode:"A1",objective:day.grammarPlan.objective,examples:["We use core-one in our report.","She sends core-two today.","They review the plan every week."],items:[1,2,3].map(i => ({id:"q"+i,prompt:"Choose the form " + i,options:["send","sends","sending","sent"],answer:"send",explanation:"The plural subject uses the base form.",milestoneId:"grammar-step"}))});
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
    candidate.parts = candidate.parts.map((item) => item.code === "grammar" ? part(item.code, { ...item.content, formula: "Review formula" }) : item.code === "pronunciation" ? part(item.code, { focus: "/s/", words: [{ word: "see", ipa: "/siː/" }, { word: "soon", ipa: "/suːn/" }, { word: "sales", ipa: "/seɪlz/" }], reviewTargets: [{ soundId: "review-sound", focus: "/s/", words: [{ word: "see", ipa: "/siː/" }, { word: "soon", ipa: "/suːn/" }, { word: "sales", ipa: "/seɪlz/" }] }] }) : item);

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
    if (code === "objective") return part(code, { text: "Identify three budget words." });
    if (code === "instruction") return part(code, { steps: ["Read the example.", "Answer the question."] });
    if (code === "vocabulary") return part(code, { items: [
      { word: "core-one", synonyms: [], antonyms: [], collocations: ["core-one plan", "a core-one", "core-one cost"] },
      { word: "core-two", synonyms: ["second"], antonyms: [], collocations: ["core-two plan", "a core-two", "core-two cost"] },
      { word: "core-three", synonyms: ["third"], antonyms: [], collocations: ["core-three plan", "a core-three", "core-three cost"] }
    ] });
    if (code === "grammar") return part(code, { formula: "Core formula" });
    if (code === "pronunciation") return part(code, { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] });
    if (["listening", "reading", "word_class", "word_use"].includes(code)) return part(code, {
      ...(code === "listening" ? { script: "The cost is high." } : code === "reading" ? { text: "The cost is high." } : {}),
      prompt: "What is high?", options: ["The cost", "The room", "The plan", "The date"], answer: "The cost"
    });
    if (code === "writing") return part(code, { prompt: "Write one sentence about cost.", answer: "The cost is high." });
    if (code === "speaking") return part(code, { prompt: "Say a sentence about cost.", sample: "The cost is high." });
    return part(code);
  }) };
}

function part(code: string, content: Record<string, unknown> = {}) { return { code, content }; }

/** A valid Friday review: study parts plus the six item sections (3 core words, 1 grammar step). */
function reviewParts() {
  const choice = (id: string, prompt: string, answer: string, others: string[]) => ({ id, prompt, options: [answer, ...others], answer, explanation: "Vì câu này đúng nghĩa.", variants: [{ id: `${id}-v1`, prompt: `${prompt} (again)`, options: [answer, ...others], answer, explanation: "Giải thích." }] });
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
      { id: "s4", prompt: "Tell your manager about the plan.", requiredWords: ["core-one", "core-two", "core-three"], minRequiredWords: 2 }
    ] })
  ].map((item) => item.code === "grammar" ? part("grammar", { ...item.content, items: [choice("g1", "She ____ every day.", "works", ["work", "working", "worked"])] })
    : item.code === "pronunciation" ? part("pronunciation", { ...item.content, reviewTargets: [{ soundId: "sound-1", focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] }] })
      : item);
}

function exercises(resourceIds: string[]) {
  return ["listening", "reading", "writing", "word_class", "word_use", "speaking"].map((exerciseCode) => ({ exerciseCode: exerciseCode as "listening" | "reading" | "writing" | "word_class" | "word_use" | "speaking", focus: "Use assigned materials.", resourceIds }));
}
