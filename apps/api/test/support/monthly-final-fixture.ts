import type { CefrLevel } from "@e4s/contracts";
import type { MonthlyFinalGenerationInput, MonthlyFinalProductiveOutput, MonthlyFinalReceptiveOutput } from "@e4s/ai";
import { buildMonthlyCurriculum, type MonthlyCurriculumContract } from "@e4s/domain/monthly";
import { MONTHLY_FINAL_LEVEL_PROFILES } from "../../src/modules/assessment/monthly-final-spec.js";

const CORE_WORDS = [
  "deadline", "draft", "client", "feedback", "budget", "delay", "supplier", "delivery", "progress", "priority", "reschedule", "available",
  "confirm", "agenda", "colleague", "online", "allocate", "attach", "book", "cancel", "clarify", "collect", "compare", "complete",
  "contact", "discuss", "estimate", "explain", "prepare", "print", "reduce", "remind", "repair", "replace", "request", "share",
  "accurate", "brief", "update", "report", "data", "missing", "extend", "approval", "propose", "alternative", "suitable", "confirmation"
];
const SOUND_WORDS = [
  ["client", "attend", "rent", "want", "paint", "sent", "tent", "bend", "send"],
  ["tasks", "desks", "risks", "asks", "masks", "disks", "kiosks", "flasks", "husks"],
  ["list", "cost", "last", "first", "most", "past", "test", "rest", "best"],
  ["hold", "old", "told", "cold", "fold", "gold", "sold", "bold", "mild"]
];

/** A valid approved-plan contract for November 2026 (16 new days → N = 48). */
export function monthlyFinalContract(cefr: CefrLevel = "B1"): MonthlyCurriculumContract {
  const letters = "abcdef";
  const supportTerms = CORE_WORDS.flatMap((word, coreIndex) => Array.from({ length: 6 }, (_, index) => ({
    id: `support-${coreIndex}-${index}`, word: `${word}${letters[index]}`, meaning: "nghĩa mở rộng", type: "noun",
    relation: (["umbrella", "synonym", "word_family"] as const)[index % 3]!, source: "family" as const, dayNumber: 1, relatedCoreTermId: `core-${coreIndex}`
  })));
  const contract = buildMonthlyCurriculum({
    month: "2026-11", cefr,
    theme: { version: 1, title: "Project updates and rescheduling meetings", brief: "Cập nhật tiến độ và dời lịch họp.", context: "Văn phòng dự án", communicationGoal: "Báo tiến độ và đề nghị lịch sự." },
    coreTerms: CORE_WORDS.map((word, index) => ({ id: `core-${index}`, word, meaning: `nghĩa ${word}`, type: "noun", ipa: "/x/" })),
    supportTerms,
    grammarTopics: [
      { id: "topic-a", title: "Polite requests and obligations", steps: [
        { id: "ga-1", focus: "Polite requests", formula: "Could you (please) + V?", usage: "Ask politely.", examples: ["Could you send it?", "Could you check it?", "Could you call me?"] },
        { id: "ga-2", focus: "Obligation with have to", formula: "have to / need to + V", usage: "Say what is necessary.", examples: ["I have to wait.", "We need to check.", "You have to sign."] },
        { id: "ga-3", focus: "Advice with should", formula: "should + V", usage: "Give advice.", examples: ["You should ask.", "We should start.", "They should wait."] }
      ] },
      { id: "topic-b", title: "Conditionals and wishes", steps: [
        { id: "gb-1", focus: "Real conditions", formula: "If + present simple, will + V", usage: "Talk about likely results.", examples: ["If it rains, we will stay.", "If you call, I will answer.", "If they agree, we will start."] },
        { id: "gb-2", focus: "Unreal conditions", formula: "If + past simple, would + V", usage: "Talk about unreal results.", examples: ["If I had time, I would help.", "If we knew, we would say.", "If she came, we would meet."] },
        { id: "gb-3", focus: "Wishes about now", formula: "I wish + past simple", usage: "Say what you want to be different.", examples: ["I wish I had more time.", "I wish it was ready.", "I wish we knew."] }
      ] }
    ],
    sounds: SOUND_WORDS.map((words, index) => ({ id: `sound-${index + 1}`, ipa: ["/nt/", "/ks/", "/st/", "/ld/"][index]!, label: `Final cluster ${index + 1}`, examples: words.map((word, example) => ({ id: `sound-${index + 1}-ex-${example}`, word, ipa: "/x/" })) }))
  });
  const dayByCore = new Map(contract.coreTerms.map((term) => [term.id, term.dayNumber]));
  return { ...contract, supportTerms: contract.supportTerms.map((term) => ({ ...term, dayNumber: dayByCore.get(term.relatedCoreTermId)! })) };
}

export const frameworkRef = { id: "11111111-1111-4111-8111-111111111111", version: 3, scopeHash: "monthly-abc123", examDate: "2026-11-30" };

/** A deterministic, rule-abiding stand-in for the two AI slices. */
export function fakeMonthlyFinalAiOutput(input: MonthlyFinalGenerationInput): { receptive: MonthlyFinalReceptiveOutput; productive: MonthlyFinalProductiveOutput } {
  const profile = MONTHLY_FINAL_LEVEL_PROFILES[input.cefr];
  const listening = input.targets.listening;
  const split = Math.ceil(listening.length * 0.6);
  const ga = "Could you send me the numbers today?";
  const gb = "If you call me this afternoon, I will answer at once.";
  const message = (label: "A" | "B", terms: typeof listening) => {
    const lines = terms.map((term) => `The ${term.word} is ready.`);
    const fillers = ["Thanks for your help this week.", "We meet again next Monday morning.", "Lunch is at noon in the small room.", "The printer on floor two works again."];
    let script = [`Hello team, this is message ${label}.`, ...lines, ga, gb].join(" ");
    let filler = 0;
    while (script.split(/\s+/u).length < profile.listeningScriptWords.min) script = `${script} ${fillers[filler++ % fillers.length]}`;
    return {
      label, speaker: label === "A" ? "Anna" : "Sam", script, gaSentence: ga, gbSentence: gb,
      questions: terms.map((term, index) => ({
        termId: term.id, prompt: `Which item is ready, according to sentence ${index + 1}?`,
        options: [`The ${term.word} item`, `The ${term.word} memo`, `The ${term.word} card`], correctIndex: 0,
        explanation: `The note names the ${term.word}.`, evidence: lines[index]!
      }))
    };
  };
  const receptive: MonthlyFinalReceptiveOutput = {
    listening: { messages: [message("A", listening.slice(0, split)), message("B", listening.slice(split))] },
    reading: { questions: input.targets.reading.map((term) => ({
      termId: term.id, prompt: `Please check the ${term.word} before noon.`,
      options: [`The ${term.word} item`, `The ${term.word} memo`, `The ${term.word} card`], correctIndex: 0, explanation: `It means ${term.meaning}.`
    })) }
  };
  const words = input.pronunciation.flatMap((target) => target.taughtExamples.slice(0, 2).map((example) => ({ code: target.code, exampleId: example.exampleId, word: example.word, target: `${target.ipa} at the end` })));
  let writingSample = "Hi Anna, could you extend the deadline? I have to wait for data. If HR sends it, I will finish. I wish I had it now. I propose an update report with missing data for approval.";
  while((writingSample.match(/\p{L}+(?:[-'’]\p{L}+)*/gu)??[]).length<profile.writing.minWords)writingSample+=" Please contact me tomorrow if you need more details.";
  const speakingSample = "Hi Anna, the slides are ready. Could you send me your answer? If you agree, I will send the invitation. Please propose a suitable alternative and request confirmation.";
  const productive: MonthlyFinalProductiveOutput = {
    title: input.cefr === "A1" || input.cefr === "A2" ? "Bài thi tháng 11 – Cập nhật dự án" : "Monthly Test – Project updates",
    grammarComponents: input.grammar.map((topic) => ({
      code: topic.code, mainStepId: topic.taughtSteps[0]!.stepId, mainLabel: `${topic.code} core component`, mainPatterns: [topic.taughtSteps[0]!.formula],
      secondaryStepId: topic.taughtSteps[1]!.stepId, secondaryLabel: `${topic.code} variant component`, secondaryPatterns: [topic.taughtSteps[1]!.formula]
    })),
    writing: {
      task: input.cefr === "A1" ? 'Write a short message to your manager, Anna. Bắt đầu bằng câu gợi ý: "Hi Anna, could you extend the deadline?"' : "Write a short message to your manager, Anna.", facts: "The weekly draft is ready. Two teams have not sent their numbers. You want one more day.",
      requirements: ["Say what is ready and what is still open.", "Ask Anna for one more day.", "Explain your plan for tomorrow."], sample: writingSample,
      evidence: { gaMain: "Could you extend the deadline?", gaSecondary: "I have to wait for data.", gbMain: "If HR sends it, I will finish.", gbSecondary: "I wish I had it now." }
    },
    speakingA: { text: `Please read: ${words.map((item) => item.word).join(", ")}.`, positions: words },
    speakingB: {
      task: "Leave a voice note for your manager.", facts: "The slides are ready. The client cannot join at 3 p.m.",
      requirements: ["Say the slides are ready.", "Suggest a new time and ask for an answer."], sample: speakingSample,
      evidence: { gaMain: "Could you send me your answer?", gbMain: "If you agree, I will send the invitation." }
    }
  };
  return { receptive, productive };
}
