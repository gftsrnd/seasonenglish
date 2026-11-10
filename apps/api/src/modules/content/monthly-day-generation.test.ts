import { describe, expect, it } from "vitest";
import type { MonthlyCurriculumContract } from "@e4s/domain";
import { generateMonthlyDay, generateMonthlyDayWithAi, generateMonthlyReviewWithAi, monthlyCheckpointKey } from "./monthly-day-generation.js";

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
        return { title: "The cost is high", parts: input.components.filter((component) => component !== "speaking").map(part) };
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
          ? { title: "The cost is high", parts: input.components.filter((component) => component !== "speaking").map(part) }
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
    const candidate=reviewLessonCandidate();
    const choice=(word:string)=>({id:word,prompt:`Choose ${word}`,options:[word,"other","different","unrelated"],answer:word,explanation:"Vì đúng nghĩa.",audioText:word});
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

function reviewLessonCandidate() {
  const choice = (id: string, prompt: string, answer: string, others: string[]) => ({ id, prompt, options: [answer, ...others], answer, explanation: "Vì đúng nghĩa.", variants: [{ prompt: `${prompt}?`, options: [answer, ...others], answer, explanation: "Giải thích." }] });
  const sections: Record<string, Record<string, unknown>> = {
    listening: { items: [["budget", "ngân sách"], ["cost", "chi phí"], ["forecast", "dự báo"]].map(([word, meaning], index) => ({ ...choice(`l${index}`, "Nghe và chọn nghĩa đúng", meaning!, ["phòng", "ngày", "kế hoạch"]), audioText: word })) },
    word_use: { items: [choice("u1", "Pick the synonym of cost", "expense", ["room", "date", "plan"]), choice("u2", "Our ____ is small.", "budget", ["cost", "forecast", "room"])] },
    word_class: { items: [choice("f1", "We ____ sales every month.", "forecast", ["forecasts", "forecasting", "forecaster"]), choice("f2", "The ____ are high.", "costs", ["cost", "costing", "costed"])] },
    reading: { passage: "Hi team, the budget for next month is small. The cost of travel is high, so the forecast shows a small profit.", items: [choice("r1", "What is small?", "The budget", ["The cost", "The team", "The trip"]), choice("r2", "What is high?", "The cost of travel", ["The budget", "The profit", "The team"]), choice("r3", "What does the forecast show?", "A small profit", ["A big loss", "No change", "A new team"])] },
    speaking: { items: [
      { prompt: "Nghe và chọn từ", audioText: "cost", options: ["cost", "coast"], answer: "cost", explanation: "Âm /ɒ/ ngắn." },
      { prompt: "Nghe và chọn từ", audioText: "see", options: ["see", "she"], answer: "see", explanation: "Âm /s/." },
      { prompt: "Đọc to câu sau", passage: "The key cost is in the sales plan." },
      { prompt: "Tell your manager about next month.", requiredWords: ["budget", "cost", "forecast"], minRequiredWords: 2 }
    ] }
  };
  return { parts: components.filter((code) => code !== "writing").map((code) => code === "grammar"
    ? { code, content: { formula: "The cost is + adjective; There is + adjective", items: [choice("g1", "The cost ____ high.", "is", ["are", "be", "am"]), choice("g2", "There ____ a report.", "is", ["are", "be", "am"])] } }
    : sections[code] ? { code, content: sections[code]! }
    : code === "pronunciation"
      ? { code, content: { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }], reviewTargets: [
        { soundId: "sound", focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] },
        { soundId: "sound-2", focus: "/s/", words: [{ word: "see", ipa: "/siː/" }, { word: "soon", ipa: "/suːn/" }, { word: "sales", ipa: "/seɪlz/" }] }
      ] } }
      : part(code)) };
}

function part(code: string) {
  if (code === "objective") return { code, content: { text: "Identify three budget words." } };
  if (code === "instruction") return { code, content: { steps: ["Read the example.", "Answer the question."] } };
  if (code === "vocabulary") return { code, content: { items: [
    { word: "budget", synonyms: ["plan"], antonyms: [], collocations: ["a small budget", "budget plan", "set a budget"] }, { word: "cost", synonyms: ["expense"], antonyms: [], collocations: ["high cost", "cost of travel", "cut the cost"] }, { word: "forecast", synonyms: ["estimate"], antonyms: [], collocations: ["sales forecast", "a weather forecast", "forecast growth"] }
  ] } };
  if (code === "grammar") return { code, content: { formula: "The cost is + adjective" } };
  if (code === "pronunciation") return { code, content: { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] } };
  if (["listening", "reading", "word_class", "word_use"].includes(code)) return { code, content: {
    ...(code === "listening" ? { script: "The cost is high." } : code === "reading" ? { text: "The cost is high." } : {}),
    prompt: "What is high?", options: ["The cost", "The room", "The plan", "The date"], answer: "The cost"
  } };
  if (code === "writing") return { code, content: { prompt: "Write one sentence about cost.", answer: "The cost is high." } };
  if (code === "speaking") return { code, content: { prompt: "Say a sentence about cost.", sample: "The cost is high." } };
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
