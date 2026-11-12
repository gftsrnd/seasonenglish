import { describe, expect, it } from "vitest";
import type { MonthlyCurriculumContract } from "@e4s/domain";
import { applyMonthlyLockedPlanFields, dropSupportTermVocabularyCards, generateMonthlyDay, generateMonthlyDayWithAi, generateMonthlyReviewWithAi, monthlyCheckpointKey, monthlyDailyTeachingContract, monthlyLearnerLanguageContract, monthlyReviewExerciseContract, monthlyReviewWordFormCandidates } from "./monthly-day-generation.js";

const components = ["objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"];

describe("monthly day generation", () => {
  it("passes only locked DaySpec data to AI and retries the failed component without replacing valid parts", async () => {
    const calls: string[][] = [];
    const result = await generateMonthlyDay({
      contract: contract(), dayNumber: 1,
      generate: async (input) => {
        calls.push([...input.components]);
        expect(input.coreTerms.map((term) => term.word)).toEqual(["budget", "cost", "forecast"]);
        expect(input.grammarStep.formula).toBe("The cost is + adjective");
        expect(input.sound.ipa).toBe("/k/");
        return { title: "The cost is high", parts: input.components.filter((component) => component !== "speaking").map((code) => part(code)) };
      }
    });

    expect(result.status).toBe("failed");
    expect(calls).toEqual([components, ["speaking"], ["speaking"]]);

    let retry = 0;
    const repairedCalls: string[][] = [];
    const repaired = await generateMonthlyDay({
      contract: contract(), dayNumber: 1,
      generate: async (input) => {
        retry += 1;
        repairedCalls.push([...input.components]);
        if (retry > 1) expect(input.repairFindings).toEqual(expect.arrayContaining([expect.objectContaining({ component: "speaking" })]));
        return retry === 1
          ? { title: "The cost is high", parts: input.components.filter((component) => component !== "speaking").map((code) => part(code)) }
          : { title: "The cost is high", parts: [part("speaking")] };
      }
    });
    expect(repaired.status).toBe("ready");
    expect(repaired.lesson?.parts).toHaveLength(11);
    expect(repaired.attempts).toBe(2);
    expect(repairedCalls).toEqual([components, ["speaking"]]);
    expect(monthlyCheckpointKey(repaired.scopeHash, 1, "speaking")).toContain(":day1:speaking");
  });

  it("returns a diagnostic failure rather than a template lesson when a severe error remains", async () => {
    const result = await generateMonthlyDay({
      contract: contract(), dayNumber: 1,
      generate: async () => ({ title: "Bad", parts: [] }), maxAttempts: 2
    });
    expect(result).toMatchObject({ status: "failed", lesson: null, attempts: 2 });
    expect(result.report.severe).not.toEqual([]);
  });

  it("calls the monthly AI task with the locked theme, scope and DaySpec", async () => {
    const runner = { runTask: async (taskId: string, input: Record<string, any>) => {
      expect(taskId).toBe("monthly_lesson_day");
      expect(input.month).toBe("2026-11");
      expect(input.cefr).toBe("A1");
      expect(input.daySpec).toMatchObject({ lessonNumber: 1, coreTermIds: ["budget", "cost", "forecast"] });
      expect(input.lockedScope.coreTerms.map((term: { id: string }) => term.id)).toEqual(["budget", "cost", "forecast"]);
      expect(input.lockedScope.grammarStep.id).toBe("step");
      expect(input.lockedScope.sound.id).toBe("sound");
      expect(input.lockedScope.supportTerms.map((term: { id: string }) => term.id)).toEqual(["support-1", "support-2", "support-3"]);
      return { output: { lesson: { ...lessonCandidate(), title: "Budget lesson" } }, metadata: {} };
    } } as unknown as import("@e4s/ai").AiTaskRunner;
    const result = await generateMonthlyDayWithAi(contract(), 1, runner, "Test monthly lesson prompt");
    expect(result.status).toBe("ready");
    expect(result.lesson?.title).toBe("Budget lesson");
  });

  it("loads review support terms by explicit weekly IDs instead of the review calendar day", async () => {
    const reviewContract = contract();
    reviewContract.grammarTopics[0]!.steps.push({ id: "step-2", focus: "another focus", formula: "There is + adjective", usage: "Describe another fact", examples: ["There is a report."] });
    reviewContract.sounds.push({ id: "sound-2", ipa: "/s/", label: "S", examples: [{ id: "cost-2", word: "see", ipa: "/siː/" }, { id: "can-2", word: "soon", ipa: "/suːn/" }, { id: "key-2", word: "sales", ipa: "/seɪlz/" }] });
    reviewContract.daySpecs.push({ lessonNumber: 5, date: "2026-11-06", kind: "review", coreTermIds: [], expandedTermIds: [], reviewTermIds: ["budget", "cost", "forecast"], reviewExpandedTermIds: ["support-1", "support-2", "support-3"], reviewGrammarStepIds: ["step", "step-2"], reviewSoundIds: ["sound", "sound-2"], reviewPronunciationExampleIds: ["cost", "can", "key", "cost-2", "can-2", "key-2"], skillExercises: monthlyExercises(["budget", "cost", "forecast", "support-1", "support-2", "support-3"]), grammarStepId: "step-2", grammarStepIds: ["step-2"], soundId: "sound-2", pronunciationExampleIds: ["cost-2", "can-2", "key-2"] });
    const runner = { runTask: async (_taskId: string, input: Record<string, any>, options: Record<string, any>) => {
      expect(input.daySpec.kind).toBe("review");
      expect(input.lockedScope.supportTerms.map((term: { id: string }) => term.id)).toEqual(["support-1", "support-2", "support-3"]);
      expect(input.lockedScope.grammarSteps.map((step: { id: string }) => step.id)).toEqual(["step", "step-2"]);
      expect(input.lockedScope.sounds.map((sound: { id: string }) => sound.id)).toEqual(["sound", "sound-2"]);
      expect(input.lockedScope.pronunciationExamples.map((example: { id: string }) => example.id)).toEqual(["cost", "can", "key", "cost-2", "can-2", "key-2"]);
      expect(options.systemPrompt).toContain("pronunciation.reviewTargets");
      expect(options.systemPrompt).toContain("Friday review exercise contract");
      expect([10_000, 14_000]).toContain(options.maxOutputTokens);
      expect(input.reviewListeningChecklist.map((term: { audioText: string }) => term.audioText)).toEqual(["budget", "cost", "forecast"]);
      const candidate = reviewLessonCandidate();
      if (input.repairIssues.length) {
        expect(input.repairIssues).toEqual(expect.arrayContaining([expect.objectContaining({ component: "listening", message: expect.stringContaining("forecast") })]));
        expect(options.systemPrompt).toContain("REPAIR REQUIRED FOR REQUESTED COMPONENTS");
        expect(options.systemPrompt).toContain("forecast");
      } else if (input.components.includes("listening")) {
        candidate.parts = candidate.parts.map(part => part.code === "listening" ? { ...part, content: { ...part.content, items: (part.content.items as unknown[]).slice(0, 2) } } : part);
      }
      return { output: { lesson: { ...candidate, title: "Budget review" } }, metadata: {} };
    } } as unknown as import("@e4s/ai").AiTaskRunner;

    await expect(generateMonthlyDayWithAi(reviewContract, 5, runner, "Test monthly lesson prompt")).rejects.toThrow("ordinary generation requires a new DaySpec");
    const result = await generateMonthlyReviewWithAi(reviewContract, 5, runner, "Test monthly lesson prompt");
    expect(result.status, JSON.stringify(result.report.severe)).toBe("ready");
    expect(result.attempts).toBe(2);
  });

  it.each(["A1", "A2", "B1", "B2", "C1"] as const)("assembles a full v2 %s review from separate study and exercise calls", async (cefr) => {
    const scope=contract();
    scope.planSchemaVersion=2; scope.cefr=cefr;
    for (const word of ["report","client","meeting","team","deadline","email","plan","step","update"]) scope.coreTerms.push({...scope.coreTerms[0]!,id:word,word});
    const first=scope.sounds[0]!;
    first.examples.push(...["cup","car","call","come","case","cake"].map(word=>({id:word,word,ipa:"/k/"})));
    scope.grammarTopics[0]!.steps.push({id:"step-2",focus:"another focus",formula:"There is + adjective",usage:"Describe a fact",examples:["There is a report."]});
    scope.sounds.push({id:"sound-2",ipa:"/s/",label:"S",examples:[{id:"see",word:"see",ipa:"/siː/"},{id:"soon",word:"soon",ipa:"/suːn/"},{id:"sales",word:"sales",ipa:"/seɪlz/"}]});
    scope.daySpecs.push({...scope.daySpecs[0]!,lessonNumber:5,date:"2026-11-06",kind:"review",coreTermIds:[],expandedTermIds:[],reviewTermIds:scope.coreTerms.map(term=>term.id),reviewGrammarStepIds:["step","step-2"],reviewSoundIds:["sound","sound-2"],reviewPronunciationExampleIds:scope.sounds.flatMap(sound=>sound.examples.map(example=>example.id))});
    const vi=cefr==="A1"||cefr==="A2";
    const candidate=reviewLessonCandidate(vi);
    const choice=(word:string)=>translated({id:word,prompt:vi?`Chọn ${word}`:`Choose ${word}`,options:[word,"other","different","unrelated"],answer:word,explanation:vi?"Vì đúng nghĩa.":"It fits.",audioText:word});
    candidate.parts=candidate.parts.map(part=>part.code==="vocabulary" ? {code:part.code,content:{items:scope.coreTerms.map(term=>({word:term.word,collocations:[`our ${term.word}`,`the ${term.word}`,`a ${term.word}`]}))}} : part.code==="listening" ? {code:part.code,content:{items:scope.coreTerms.map(term=>choice(term.word))}} : part.code==="word_use" ? {code:part.code,content:{items:scope.coreTerms.slice(0,4).map(term=>choice(term.word))}} : part.code==="word_class" ? {code:part.code,content:{items:scope.coreTerms.slice(0,3).map(term=>choice(term.word))}} : part.code==="reading" ? {code:part.code,content:{...part.content,passage:`Our team discusses ${scope.coreTerms.map(term=>term.word).join(", ")}.`}} : part.code==="pronunciation" ? {code:part.code,content:{focus:first.ipa,words:first.examples.slice(0,3),reviewTargets:scope.sounds.map(sound=>({soundId:sound.id,focus:sound.ipa,words:sound.examples}))}} : part);
    const calls:string[][]=[];
    const runner={runTask:async (_task:string,input:Record<string,any>)=>{
      calls.push(input.components);
      return {output:{lesson:{title:"Weekly review",parts:candidate.parts.filter(part=>input.components.includes(part.code)).map(part=>part.code==="grammar" ? {code:part.code,content:input.components.includes("listening") ? {items:part.content.items} : {formula:part.content.formula}} : part)}},metadata:{}};
    }} as unknown as import("@e4s/ai").AiTaskRunner;
    const result=await generateMonthlyReviewWithAi(scope,5,runner,"Review prompt");
    expect(result.status,JSON.stringify(result.report.severe)).toBe("ready");
    expect(calls).toHaveLength(2);
    const grammar=result.lesson!.parts.find(part=>part.code==="grammar")!;
    expect(grammar.content.items).toHaveLength(2);
    expect(grammar.content.steps).toHaveLength(2);
  });
});

function lessonCandidate() {
  return { parts: components.map((code) => part(code)) };
}

function reviewLessonCandidate(vi = true) {
  const q = (prompt: string) => vi ? `Chọn đáp án đúng: ${prompt}` : prompt;
  const why = vi ? "Vì đúng nghĩa." : "It fits the meaning.";
  const choice = (id: string, prompt: string, answer: string, others: string[]) => translated({ id, prompt: q(prompt), options: [answer, ...others], answer, explanation: why, variants: [{ prompt: q(`${prompt}?`), options: [answer, ...others], answer, explanation: vi ? "Giải thích." : "Short reason." }] });
  const sections: Record<string, Record<string, unknown>> = {
    listening: { items: [["budget", "ngân sách"], ["cost", "chi phí"], ["forecast", "dự báo"]].map(([word, meaning], index) => ({ ...choice(`l${index}`, vi ? "Nghe và chọn nghĩa đúng" : "Listen and choose the meaning", meaning!, ["phòng", "ngày", "kế hoạch"]), audioText: word })) },
    word_use: { items: [choice("u1", "Pick the synonym of cost", "expense", ["room", "date", "plan"]), choice("u2", "Our ____ is small.", "budget", ["cost", "forecast", "room"])] },
    word_class: { items: [choice("f1", "We ____ sales every month.", "forecast", ["forecasts", "forecasting", "forecaster"]), choice("f2", "The ____ are high.", "costs", ["cost", "costing", "costed"])] },
    reading: { passage: "Hi team, the budget for next month is small. The cost of travel is high, so the forecast shows a small profit.", items: [choice("r1", "What is small?", "The budget", ["The cost", "The team", "The trip"]), choice("r2", "What is high?", "The cost of travel", ["The budget", "The profit", "The team"]), choice("r3", "What does the forecast show?", "A small profit", ["A big loss", "No change", "A new team"])] },
    speaking: { items: translated([
      { prompt: vi ? "Nghe và chọn từ" : "Listen and choose the word", audioText: "cost", options: ["cost", "coast"], answer: "cost", explanation: vi ? "Âm /ɒ/ ngắn." : "Short /ɒ/." },
      { prompt: vi ? "Nghe và chọn từ" : "Listen and choose the word", audioText: "see", options: ["see", "she"], answer: "see", explanation: vi ? "Âm /s/." : "The /s/ sound." },
      { prompt: vi ? "Đọc to câu sau" : "Read this sentence aloud", passage: "The key cost is in the sales plan." },
      { prompt: vi ? "Hãy nói với quản lý về tháng sau." : "Tell your manager about next month.", requiredWords: ["budget", "cost", "forecast"], minRequiredWords: 2 }
    ]) }
  };
  return { parts: components.filter((code) => code !== "writing").map((code) => code === "grammar"
    ? { code, content: { formula: "The cost is + adjective; There is + adjective", items: [choice("g1", "The cost ____ high.", "is", ["are", "be", "am"]), choice("g2", "There ____ a report.", "is", ["are", "be", "am"])] } }
    : sections[code] ? { code, content: sections[code]! }
    : code === "pronunciation"
      ? { code, content: { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }], reviewTargets: [
        { soundId: "sound", focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] },
        { soundId: "sound-2", focus: "/s/", words: [{ word: "see", ipa: "/siː/" }, { word: "soon", ipa: "/suːn/" }, { word: "sales", ipa: "/seɪlz/" }] }
      ] } }
      : part(code, vi)) };
}

function part(code: string, vi = true) {
  const built = untranslatedPart(code, vi);
  return { code: built.code, content: translated(built.content as Record<string, unknown>) };
}

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

function untranslatedPart(code: string, vi = true) {
  if (code === "objective") return { code, content: { text: "Identify three budget words." } };
  if (code === "instruction") return { code, content: { steps: vi ? ["Đọc ví dụ.", "Trả lời câu hỏi."] : ["Read the example.", "Answer the question."] } };
  if (code === "vocabulary") return { code, content: { items: [
    { word: "budget", synonyms: ["plan"], antonyms: [], collocations: ["a small budget", "budget plan", "set a budget"] }, { word: "cost", synonyms: ["expense"], antonyms: [], collocations: ["high cost", "cost of travel", "cut the cost"] }, { word: "forecast", synonyms: ["estimate"], antonyms: [], collocations: ["sales forecast", "a weather forecast", "forecast growth"] }
  ] } };
  if (code === "grammar") return { code, content: { formula: "The cost is + adjective" } };
  if (code === "pronunciation") return { code, content: { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] } };
  if (["listening", "reading", "word_class", "word_use"].includes(code)) return { code, content: {
    ...(code === "listening" ? { script: "The cost is high." } : code === "reading" ? { text: "The cost is high." } : {}),
    prompt: vi ? "Chọn đáp án đúng: What is high?" : "What is high?", options: ["The cost", "The room", "The plan", "The date"], answer: "The cost"
  } };
  if (code === "writing") return { code, content: { prompt: vi ? "Viết một câu về cost." : "Write one sentence about cost.", answer: "The cost is high." } };
  if (code === "speaking") return { code, content: { prompt: vi ? "Nói một câu về cost." : "Say a sentence about cost.", sample: "The cost is high." } };
  return { code, content: {} };
}

function contract(): MonthlyCurriculumContract {
  return {
    month: "2026-11", cefr: "A1", version: 1, theme: { version: 1, title: "Budget", brief: "Brief", context: "Context", communicationGoal: "Goal" },
    coreTerms: [{ id: "budget", word: "budget", meaning: "ngân sách", type: "noun", ipa: "/ˈbʌdʒɪt/", source: "core_registry", component: "core", dayNumber: 1 }, { id: "cost", word: "cost", meaning: "chi phí", type: "noun", ipa: "/kɒst/", source: "core_registry", component: "core", dayNumber: 1 }, { id: "forecast", word: "forecast", meaning: "dự báo", type: "noun", ipa: "/ˈfɔːkɑːst/", source: "core_registry", component: "core", dayNumber: 1 }], supportTerms: [{ id: "support-1", word: "budgetary", meaning: "thuộc ngân sách", type: "adjective", relation: "word_family", source: "family", component: "expanded", dayNumber: 1, relatedCoreTermId: "budget" }, { id: "support-2", word: "expense", meaning: "chi phí", type: "noun", relation: "synonym", source: "synonym", component: "expanded", dayNumber: 1, relatedCoreTermId: "cost" }, { id: "support-3", word: "projection", meaning: "dự báo", type: "noun", relation: "synonym", source: "synonym", component: "expanded", dayNumber: 1, relatedCoreTermId: "forecast" }],
    grammarTopics: [{ id: "grammar", title: "Cost", steps: [{ id: "step", focus: "cost", formula: "The cost is + adjective", usage: "Describe cost", examples: ["The cost is high."] }] }],
    sounds: [{ id: "sound", ipa: "/k/", label: "K", examples: [{ id: "cost", word: "cost", ipa: "/kɒst/" }, { id: "can", word: "can", ipa: "/kæn/" }, { id: "key", word: "key", ipa: "/kiː/" }] }],
    daySpecs: [{ lessonNumber: 1, date: "2026-11-02", kind: "new", coreTermIds: ["budget", "cost", "forecast"], expandedTermIds: ["support-1", "support-2", "support-3"], reviewTermIds: [], reviewExpandedTermIds: [], skillExercises: monthlyExercises(["budget", "cost", "forecast", "support-1", "support-2", "support-3"]), grammarStepId: "step", soundId: "sound", pronunciationExampleIds: ["cost", "can", "key"] }]
  };
}

function monthlyExercises(resourceIds: string[]) {
  return ["listening", "reading", "writing", "word_class", "word_use", "speaking"].map((exerciseCode) => ({ exerciseCode: exerciseCode as "listening" | "reading" | "writing" | "word_class" | "word_use" | "speaking", focus: "Use the monthly resources in this exercise.", resourceIds }));
}

describe("exercise translations in the generation prompts (12/11)", () => {
  it("asks every level for questionTranslation/answerTranslation and allows them as the only extra Vietnamese from B1", () => {
    expect(monthlyReviewExerciseContract(3, 1, "B2")).toContain("questionTranslation / answerTranslation (every level)");
    expect(monthlyReviewExerciseContract(3, 1, "A1")).toContain("items: [{ id, prompt, options, answer, explanation, questionTranslation, answerTranslation, variants }]");
    expect(monthlyLearnerLanguageContract("C1")).toContain("questionTranslation / answerTranslation fields");
    expect(monthlyLearnerLanguageContract("A2")).toContain("goes only in questionTranslation / answerTranslation");
  });
});

describe("monthly day generation – AI quality plan 11/11 (WP1/D1, WP2)", () => {
  const v2 = () => {
    const scope = contract(); scope.planSchemaVersion = 2;
    const day = scope.daySpecs[0]!;
    day.newLessonNumber = 1;
    day.grammarPlan = { code: "A1", objective: "Dùng cấu trúc để nói về chi phí.", mode: "recognize", milestoneIds: ["step"], recallMilestoneIds: [] };
    day.pronunciationPlan = { slot: "P1", stage: "recognize", objective: "Nghe, nhận diện âm /k/", targetIds: ["sound"], exampleIds: ["cost", "can", "key"], exampleSet: 1 };
    return scope;
  };
  const v2Parts = (components: readonly string[]) => components.map((code) => code === "grammar"
    ? { code, content: { formula: "The cost is high + adj", dailyCode: "X9", objective: "Paraphrased objective", text: "Dùng để mô tả chi phí.", examples: ["Our budget is small this month.", "The cost of the forecast is high.", "This budget is new."], items: [1, 2, 3].map((i) => ({ id: `g${i}`, prompt: `Chọn đáp án đúng ${i}: The cost ____ high.`, options: ["is", "are", "be", "am"], answer: "is", explanation: "Chủ ngữ số ít dùng is.", milestoneId: "step" })) } }
    : code === "pronunciation" ? { code, content: { focus: "k", stage: "sentence", objective: "Other", words: [{ word: "Cost", ipa: "/kost/", tip: "Bật hơi" }, { word: "car", ipa: "/kɑː/" }, { word: "key", ipa: "/kiː/" }] } }
      : part(code));

  it("D1: fills locked grammar and pronunciation fields before the gate so a drifting model output passes first time", async () => {
    const result = await generateMonthlyDay({ contract: v2(), dayNumber: 1, generate: async (input) => ({ title: "Cost", parts: v2Parts(input.components) }) });
    expect(result.status, JSON.stringify(result.report.severe)).toBe("ready");
    expect(result.attempts).toBe(1);
    const grammar = result.lesson!.parts.find((item) => item.code === "grammar")!.content;
    expect(grammar).toMatchObject({ dailyCode: "A1", objective: "Dùng cấu trúc để nói về chi phí.", formula: "The cost is + adjective", text: "Dùng để mô tả chi phí." });
    const pronunciation = result.lesson!.parts.find((item) => item.code === "pronunciation")!.content;
    expect(pronunciation).toMatchObject({ stage: "recognize", objective: "Nghe, nhận diện âm /k/", focus: "/k/" });
    expect(pronunciation.words).toEqual([{ word: "cost", ipa: "/kɒst/", tip: "Bật hơi" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }]);
  });

  it("D1: fills multi-target reviewTargets and targetPositions from the plan and never creates a missing part", () => {
    const scope = v2();
    scope.sounds.push({ id: "sound-2", ipa: "/s/", label: "S", examples: [{ id: "see", word: "see", ipa: "/siː/" }, { id: "soon", word: "soon", ipa: "/suːn/" }, { id: "sales", word: "sales", ipa: "/seɪlz/" }] });
    const day = scope.daySpecs[0]!;
    day.pronunciationPlan = { slot: "K2", stage: "read_aloud", objective: "Read eight positions", targetIds: ["sound", "sound-2"], exampleIds: ["cost", "can", "see", "soon"], requiredPositions: [{ soundId: "sound", exampleId: "cost" }, { soundId: "sound", exampleId: "can" }, { soundId: "sound-2", exampleId: "see" }, { soundId: "sound-2", exampleId: "soon" }] };
    const filled = applyMonthlyLockedPlanFields(scope, day, [{ code: "pronunciation", content: { reviewTargets: [{ soundId: "sound-2", focus: "/z/", words: [], note: "keep" }] } }]);
    expect(filled[0]!.content.reviewTargets).toEqual([
      { soundId: "sound", focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }] },
      { soundId: "sound-2", focus: "/s/", words: [{ word: "see", ipa: "/siː/" }, { word: "soon", ipa: "/suːn/" }], note: "keep" }
    ]);
    expect((filled[0]!.content as Record<string, unknown>).targetPositions).toEqual(day.pronunciationPlan.requiredPositions);
    expect(applyMonthlyLockedPlanFields(scope, day, [{ code: "speaking", content: {} }]).map((item) => item.code)).toEqual(["speaking"]);
  });

  it("1b: the repair prompt carries the exact expected strings", async () => {
    const prompts: string[] = [];
    const runner = { runTask: async (_task: string, input: Record<string, any>, options: Record<string, any>) => {
      prompts.push(options.systemPrompt);
      const parts = v2Parts(input.components).map((item) => item.code === "pronunciation" && prompts.length === 1 ? { ...item, content: { ...item.content, passage: "x" } } : item);
      return { output: { lesson: { title: "Cost", parts: prompts.length === 1 ? parts.filter((item) => item.code !== "grammar") : parts } }, metadata: {} };
    } } as unknown as import("@e4s/ai").AiTaskRunner;
    const result = await generateMonthlyDayWithAi(v2(), 1, runner, "Prompt");
    expect(result.status, JSON.stringify(result.report.severe)).toBe("ready");
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("Use at least these keys per code");
    expect(prompts[0]).not.toContain("Use exactly these keys");
    expect(prompts[1]).toContain("REPAIR REQUIRED FOR REQUESTED COMPONENTS");
    expect(prompts[1]).toContain("\"The cost is + adjective\"");
    expect(prompts[1]).toContain("grammar.objective to exactly \"Dùng cấu trúc để nói về chi phí.\"");
  });

  it("WP2: shuffles answers after the gate deterministically, keeping each answer inside its options", async () => {
    const scope = contract();
    for (const word of ["report", "client", "meeting", "team", "deadline", "email", "plan", "step", "update"]) scope.coreTerms.push({ ...scope.coreTerms[0]!, id: word, word });
    scope.grammarTopics[0]!.steps.push({ id: "step-2", focus: "another focus", formula: "There is + adjective", usage: "Describe a fact", examples: ["There is a report."] });
    scope.sounds.push({ id: "sound-2", ipa: "/s/", label: "S", examples: [{ id: "see", word: "see", ipa: "/siː/" }, { id: "soon", word: "soon", ipa: "/suːn/" }, { id: "sales", word: "sales", ipa: "/seɪlz/" }] });
    scope.daySpecs.push({ ...scope.daySpecs[0]!, lessonNumber: 5, date: "2026-11-06", kind: "review", coreTermIds: [], expandedTermIds: [], reviewTermIds: scope.coreTerms.map((term) => term.id), reviewGrammarStepIds: ["step", "step-2"], reviewSoundIds: ["sound", "sound-2"], reviewPronunciationExampleIds: ["cost", "can", "key", "see", "soon", "sales"] });
    const candidate = reviewLessonCandidate();
    const choice = (word: string) => translated({ id: word, prompt: `Chọn ${word}`, options: [word, "other", "different", "unrelated"], answer: word, explanation: "Vì đúng nghĩa.", audioText: word, variants: [{ id: `${word}-v`, prompt: `Chọn lại ${word}`, options: [word, "other", "different", "unrelated"], answer: word, explanation: "Vì đúng." }] });
    candidate.parts = candidate.parts.map((item) => item.code === "vocabulary" ? { code: item.code, content: { items: scope.coreTerms.map((term) => ({ word: term.word, collocations: [`our ${term.word}`, `the ${term.word}`, `a ${term.word}`] })) } } : item.code === "listening" ? { code: item.code, content: { items: scope.coreTerms.map((term) => choice(term.word)) } } : item.code === "word_use" ? { code: item.code, content: { items: scope.coreTerms.slice(0, 4).map((term) => choice(term.word)) } } : item.code === "word_class" ? { code: item.code, content: { items: scope.coreTerms.slice(0, 3).map((term) => choice(term.word)) } } : item.code === "reading" ? { code: item.code, content: { ...item.content, passage: `Our team discusses ${scope.coreTerms.map((term) => term.word).join(", ")}.` } } : item);
    const run = () => generateMonthlyDay({ contract: scope, dayNumber: 5, kind: "review", generate: async (input) => ({ title: "Review", parts: candidate.parts.filter((item) => input.components.includes(item.code as never)) }) });
    const first = await run();
    expect(first.status, JSON.stringify(first.report.severe)).toBe("ready");
    const listening = first.lesson!.parts.find((item) => item.code === "listening")!.content.items as Array<{ options: string[]; answer: string; variants: Array<{ options: string[]; answer: string }> }>;
    expect(listening.every((item) => item.options.includes(item.answer) && [...item.options].sort().join() === [item.answer, "other", "different", "unrelated"].sort().join())).toBe(true);
    const positions = listening.map((item) => item.options.indexOf(item.answer));
    expect(new Set(positions).size).toBeGreaterThan(2);
    expect(Math.max(...[0, 1, 2, 3].map((slot) => positions.filter((value) => value === slot).length)) / positions.length).toBeLessThanOrEqual(0.35);
    expect(listening.map((item) => item.variants[0]!.options.indexOf(item.variants[0]!.answer))).not.toEqual(listening.map(() => 0));
    const pairs = first.lesson!.parts.find((item) => item.code === "speaking")!.content.items as Array<{ options?: string[]; answer?: string }>;
    expect(pairs.filter((item) => item.options).every((item) => item.options!.includes(item.answer!))).toBe(true);
    expect((await run()).lesson).toEqual(first.lesson);
  });
});

describe("monthly day generation - AI quality round 2 (11/11)", () => {
  it("states the learner language per level in every lesson and review request", async () => {
    const prompts: string[] = [];
    const runner = { runTask: async (_task: string, input: Record<string, any>, options: { systemPrompt: string }) => {
      prompts.push(options.systemPrompt);
      return { output: { lesson: { title: "Cost", parts: input.components.map((code: string) => part(code)) } }, metadata: {} };
    } } as unknown as import("@e4s/ai").AiTaskRunner;
    await generateMonthlyDayWithAi(contract(), 1, runner, "Prompt");
    expect(prompts[0]).toContain("LEARNER LANGUAGE (A1)");
    // A1 N1 first attempt: "Our ____ meets every Monday to check the project progress." was the whole prompt.
    expect(prompts[0]).toContain("Chọn dạng đúng của từ để điền vào chỗ trống: Our ____ meets every Monday.");
    const b1 = monthlyLearnerLanguageContract("B1");
    expect(b1).toContain("daySpec.skillExercises[].focus");
    expect(b1).not.toMatch(/Chọn|Nghe/u);
  });

  it("names today's core words for grammar examples and keeps a Vietnamese B1 objective out of learner text", () => {
    const day = { ...contract().daySpecs[0]!, newLessonNumber: 7, grammarPlan: { code: "B1", objective: "Nhận biết cấu trúc could/would + you + V1.", mode: "recognize" as const, milestoneIds: ["step"], recallMilestoneIds: [] } };
    const text = monthlyDailyTeachingContract(day, "B1", ["budget", "cost", "forecast"]);
    expect(text).toContain("at least two of today's core words (budget, cost, forecast)");
    expect(text).toContain("copy it verbatim only into grammar.objective");
    expect(monthlyDailyTeachingContract(day, "A1", ["budget"])).not.toContain("copy it verbatim only into grammar.objective");
  });

  it("review contract: exact counts, level-language prompts, real-family Word form words (feedback/deadline excluded)", () => {
    const cores = [
      { id: "c1", word: "feedback", type: "noun" }, { id: "c2", word: "deadline", type: "noun" },
      { id: "c3", word: "send", type: "verb" }, { id: "c4", word: "decision", type: "noun" }
    ];
    const supports = [{ word: "decide", relation: "word_family", relatedCoreTermId: "c4" }, { word: "decisive", relation: "word_family", relatedCoreTermId: "c4" }, { word: "comments", relation: "synonym", relatedCoreTermId: "c1" }];
    const candidates = monthlyReviewWordFormCandidates(cores, supports);
    expect(candidates.suitable.map((item) => item.word)).toEqual(["send", "decision"]);
    expect(candidates.unsuitable).toEqual(["feedback", "deadline"]);
    const b1 = monthlyReviewExerciseContract(12, 2, "B1", candidates);
    expect(b1).toContain("EXACT ITEM COUNTS");
    expect(b1).toContain("listening 12, word_use 4, word_class 3, grammar 2");
    expect(b1).toContain("prompt \"Listen and choose the meaning\"");
    expect(b1).not.toContain("Nghe và chọn nghĩa đúng");
    expect(b1).toContain("decision (family: decide, decisive)");
    expect(b1).toContain("Never build Word form items on feedback, deadline");
    expect(b1).toContain("never pairs such as event / segment, bat / box or sheet / shift");
    const a1 = monthlyReviewExerciseContract(12, 2, "A1");
    expect(a1).toContain("prompt \"Nghe và chọn nghĩa đúng\"");
    expect(a1).toContain("prompt \"Đọc to câu sau\"");
    expect(a1).not.toContain("Listen and choose the meaning");
    expect(a1).not.toMatch(/word class(?! or part of speech)/iu);
  });

  it("drops a support term returned as its own vocabulary card (A2 N1: \"comments\") and keeps core cards", () => {
    const scope = contract();
    scope.supportTerms.push({ id: "support-4", word: "comments", meaning: "bình luận", type: "noun", relation: "synonym", source: "synonym", component: "expanded", dayNumber: 1, relatedCoreTermId: "budget" });
    const parts = [{ code: "vocabulary", content: { items: [{ word: "budget" }, { word: "Comments" }, { word: "cost" }, { word: "expense" }, { word: "forecast" }] } }, { code: "reading", content: { text: "comments" } }];
    const result = dropSupportTermVocabularyCards(scope, parts);
    expect((result[0]!.content.items as Array<{ word: string }>).map((item) => item.word)).toEqual(["budget", "cost", "forecast"]);
    expect(result[1]).toBe(parts[1]);
  });

  it("a repair answer that re-sends an accepted part does not overwrite it (C1 W2: grammar items wiped by an objective repair)", async () => {
    const first = lessonCandidate();
    first.parts = first.parts.map((item) => item.code === "objective" ? { code: "objective", content: {} } : item);
    let call = 0;
    const result = await generateMonthlyDay({ contract: contract(), dayNumber: 1, generate: async (input) => {
      call += 1;
      if (call === 1) return { title: "Cost", parts: first.parts };
      expect(input.components).toEqual(["objective"]);
      return { title: "Cost", parts: [part("objective"), { code: "grammar", content: {} }, { code: "speaking", content: {} }] };
    } });
    expect(result.status, JSON.stringify(result.report.severe)).toBe("ready");
    expect(result.attempts).toBe(2);
    expect(result.lesson!.parts.find((item) => item.code === "grammar")!.content.formula).toBe("The cost is + adjective");
    expect(result.lesson!.parts.find((item) => item.code === "speaking")!.content.sample).toBe("The cost is high.");
  });
});
