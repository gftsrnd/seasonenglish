import type { MonthlyFinalExamMeta, MonthlyFinalGrammarTarget, MonthlyFinalMappingRow, MonthlyFinalPronunciationTarget } from "@e4s/contracts";
import type { MonthlyFinalGenerationInput, MonthlyFinalProductiveOutput, MonthlyFinalReceptiveOutput } from "@e4s/ai";
import type { CoreTerm, GrammarStep, MonthlyCurriculumContract, PronunciationExample } from "@e4s/domain/monthly";
import { buildMonthlyExamScope } from "@e4s/domain/monthly";
import type { StoredAssessmentDefinition, StoredAssessmentTask } from "@e4s/database";
import {
  MONTHLY_FINAL_LEVEL_PROFILES, MONTHLY_FINAL_OPTION_COUNT, MONTHLY_FINAL_SECTION_MINUTES, MONTHLY_FINAL_SECTION_SCORE,
  MONTHLY_FINAL_SPEAKING_A_SCORE, MONTHLY_FINAL_SPEAKING_B_SCORE, MONTHLY_FINAL_SPEC_VERSION, MONTHLY_FINAL_TOTAL_MINUTES,
  MONTHLY_FINAL_TOTAL_SCORE, monthlyFinalAllocation, monthlyFinalChrome, monthlyFinalFormCode, monthlyFinalRubric,
  positionCode, termCode, type MonthlyFinalAllocation
} from "./monthly-final-spec.js";
import { evaluateMonthlyFinal } from "./monthly-final-checks.js";

/** The approved plan this exam is traceable to (phase hand-off). */
export interface MonthlyFinalFrameworkRef {
  id: string;
  version: number;
  scopeHash: string;
  examDate: string;
}

const LETTERS = ["A", "B", "C"] as const;
const P_CODES = ["P1", "P2", "P3", "P4"] as const;
const G_CODES = ["GA", "GB"] as const;

export class MonthlyFinalInputError extends Error {
  constructor(readonly missing: string[]) {
    super("MONTHLY_FINAL_INPUT_ERROR");
  }
}

/** Steps of a grammar topic that daily lessons actually taught this month. */
export function taughtGrammarSteps(contract: MonthlyCurriculumContract, topicIndex: number): GrammarStep[] {
  const topic = contract.grammarTopics[topicIndex];
  if (!topic) return [];
  const taught = new Set(contract.daySpecs.filter((day) => day.kind === "new").flatMap((day) => day.grammarStepIds ?? [day.grammarStepId]));
  return topic.steps.filter((step) => taught.has(step.id));
}

/** The month's pronunciation example sets for one sound (words learners heard and practised). */
export function taughtPronunciationExamples(contract: MonthlyCurriculumContract, soundIndex: number): PronunciationExample[] {
  const sound = contract.sounds[soundIndex];
  if (!sound) return [];
  const taught = new Set(contract.daySpecs.filter((day) => day.kind === "new" && day.soundId === sound.id).flatMap((day) => day.pronunciationExampleIds));
  return sound.examples.filter((example) => taught.has(example.id));
}

/** Section 10 "Đầu vào phải có": a missing target is an INPUT_ERROR, never invented. */
export function monthlyFinalInputErrors(contract: MonthlyCurriculumContract): string[] {
  const missing: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(contract.month ?? "")) missing.push("month");
  if (!contract.cefr || !MONTHLY_FINAL_LEVEL_PROFILES[contract.cefr]) missing.push("cefr");
  if (!contract.theme?.title?.trim()) missing.push("theme.title");
  if (!contract.coreTerms?.length) missing.push("coreTerms");
  else {
    contract.coreTerms.forEach((term, index) => {
      for (const field of ["id", "word", "meaning", "type"] as const) if (!term[field]?.trim()) missing.push(`coreTerms[${termCode(index)}].${field}`);
    });
    if (contract.cefr && MONTHLY_FINAL_LEVEL_PROFILES[contract.cefr]) {
      try { monthlyFinalAllocation(contract.coreTerms.length, contract.cefr); } catch { missing.push("coreTerms (N quá nhỏ để phân bổ L/R/W/S)"); }
    }
  }
  if (contract.grammarTopics?.length !== 2) missing.push("grammarTopics (GA, GB)");
  else G_CODES.forEach((code, index) => {
    if (!contract.grammarTopics[index]?.title?.trim()) missing.push(`grammarTopics.${code}.title`);
    if (taughtGrammarSteps(contract, index).length < 2) missing.push(`grammarTopics.${code}.taughtSteps (cần ≥ 2 bước đã dạy để chọn thành phần chính/phụ)`);
  });
  if (contract.sounds?.length !== 4) missing.push("sounds (P1–P4)");
  else P_CODES.forEach((code, index) => {
    if (taughtPronunciationExamples(contract, index).length < 2) missing.push(`sounds.${code}.taughtExamples (cần ≥ 2 từ ví dụ đã học)`);
  });
  return missing;
}

export interface MonthlyFinalTermAllocation {
  allocation: MonthlyFinalAllocation;
  listening: CoreTerm[];
  reading: CoreTerm[];
  writing: CoreTerm[];
  speaking: CoreTerm[];
  codeById: Map<string, string>;
}

/**
 * Deterministic primary positions: plan order V01…VN fills L, then R, then W,
 * then S (the order the v2.0 sample form uses). Every core term gets exactly
 * one position (GEN03); support/expanded terms are never assessed.
 */
export function allocateMonthlyFinalTerms(contract: MonthlyCurriculumContract): MonthlyFinalTermAllocation {
  const allocation = monthlyFinalAllocation(contract.coreTerms.length, contract.cefr);
  const terms = contract.coreTerms;
  const codeById = new Map(terms.map((term, index) => [term.id, termCode(index)]));
  return {
    allocation,
    listening: terms.slice(0, allocation.l),
    reading: terms.slice(allocation.l, allocation.l + allocation.r),
    writing: terms.slice(allocation.l + allocation.r, allocation.l + allocation.r + allocation.w),
    speaking: terms.slice(allocation.l + allocation.r + allocation.w),
    codeById
  };
}

export function buildMonthlyFinalGenerationInput(contract: MonthlyCurriculumContract, framework: MonthlyFinalFrameworkRef): MonthlyFinalGenerationInput {
  const missing = monthlyFinalInputErrors(contract);
  if (missing.length) throw new MonthlyFinalInputError(missing);
  const allocated = allocateMonthlyFinalTerms(contract);
  const term = (item: CoreTerm) => ({ id: item.id, code: allocated.codeById.get(item.id)!, word: item.word, type: item.type, meaning: item.meaning });
  return {
    month: contract.month,
    cefr: contract.cefr,
    formCode: monthlyFinalFormCode(contract.cefr, contract.month),
    frameworkVersion: framework.version,
    theme: { title: contract.theme.title, brief: contract.theme.brief ?? "", context: contract.theme.context ?? "", communicationGoal: contract.theme.communicationGoal ?? "" },
    levelProfile: { ...MONTHLY_FINAL_LEVEL_PROFILES[contract.cefr] },
    allocation: allocated.allocation,
    targets: { listening: allocated.listening.map(term), reading: allocated.reading.map(term), writing: allocated.writing.map(term), speaking: allocated.speaking.map(term) },
    grammar: G_CODES.map((code, index) => ({
      code, topicId: contract.grammarTopics[index]!.id, topicTitle: contract.grammarTopics[index]!.title,
      taughtSteps: taughtGrammarSteps(contract, index).map((step) => ({ stepId: step.id, focus: step.focus, formula: step.formula, usage: step.usage, examples: step.examples.slice(0, 3) }))
    })),
    pronunciation: P_CODES.map((code, index) => ({
      code, soundId: contract.sounds[index]!.id, ipa: contract.sounds[index]!.ipa, label: contract.sounds[index]!.label,
      taughtExamples: taughtPronunciationExamples(contract, index).map((example) => ({ exampleId: example.id, word: example.word, ipa: example.ipa }))
    })),
    backgroundWords: [...new Set(contract.supportTerms.map((item) => item.word))].slice(0, 1_000)
  };
}

interface ChoiceDraft { termId: string; prompt: string; options: string[]; correctIndex: number; explanation: string; evidence?: string }

/**
 * Balanced, non-patterned answer positions (GEN17): letter counts differ by at
 * most one, no letter repeats more than twice in a row, and the order is a
 * seeded shuffle rather than an A-B-C cycle. Distractors keep their order.
 */
export function rebalanceAnswerPositions<T extends ChoiceDraft>(items: T[], seed: string): T[] {
  const n = items.length;
  const letters: number[] = Array.from({ length: n }, (_, index) => index % MONTHLY_FINAL_OPTION_COUNT);
  const random = seededRandom(seed);
  for (let index = letters.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [letters[index], letters[swap]] = [letters[swap]!, letters[index]!];
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (let index = 2; index < letters.length; index += 1) {
      if (letters[index] === letters[index - 1] && letters[index] === letters[index - 2]) {
        const swapWith = letters.findIndex((value, candidate) => candidate > index && value !== letters[index]);
        const target = swapWith >= 0 ? swapWith : letters.findIndex((value, candidate) => candidate < index - 2 && value !== letters[index] && letters[candidate - 1] !== letters[index] && letters[candidate + 1] !== letters[index]);
        if (target >= 0) [letters[index], letters[target]] = [letters[target]!, letters[index]!];
      }
    }
  }
  return items.map((item, index) => {
    const correct = item.options[item.correctIndex]!;
    const distractors = item.options.filter((_, optionIndex) => optionIndex !== item.correctIndex);
    const targetIndex = letters[index]!;
    const options = [...distractors];
    options.splice(targetIndex, 0, correct);
    return { ...item, options, correctIndex: targetIndex };
  });
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function choiceTask(key: string, item: ChoiceDraft, maxScore: number): StoredAssessmentTask {
  return {
    key, prompt: item.prompt, responseType: "single_choice", maxScore,
    options: item.options.map((label, index) => ({ value: LETTERS[index]!, label })),
    correctAnswer: LETTERS[item.correctIndex]!
  };
}

function productionPrompt(cefr: MonthlyCurriculumContract["cefr"], kind: "writing" | "speaking", task: string, facts: string, requirements: string[], words: string[]): string {
  const vi = MONTHLY_FINAL_LEVEL_PROFILES[cefr].instructionLanguage === "vi";
  const labels = vi
    ? { facts: "Dữ kiện", must: kind === "writing" ? "Bài viết cần" : "Tin nhắn thoại cần", words: `Dùng đủ ${words.length} từ sau` }
    : { facts: "Facts", must: kind === "writing" ? "Your message must" : "Your voice note must", words: `Use these ${words.length} words` };
  return [task.trim(), `${labels.facts}: ${facts.trim()}`, `${labels.must}:\n${requirements.map((item) => `- ${item.trim()}`).join("\n")}`, `${labels.words}: ${words.join(", ")}.`].join("\n\n");
}

interface AssemblyParts {
  title: string;
  listening: Array<{ label: "A" | "B"; speaker: string; script: string; gaSentence: string; gbSentence: string; questions: ChoiceDraft[] }>;
  reading: ChoiceDraft[];
  grammar: Array<{ code: "GA" | "GB"; mainStepId: string; mainLabel: string; mainPatterns: string[]; secondaryStepId: string; secondaryLabel: string; secondaryPatterns: string[] }>;
  writing: { task: string; facts: string; requirements: string[]; sample: string; evidence: MonthlyFinalExamMeta["grader"]["writingGrammarEvidence"] };
  speakingA: { text: string; positions: Array<{ code: (typeof P_CODES)[number]; exampleId: string; word: string; target: string }> };
  speakingB: { task: string; facts: string; requirements: string[]; sample: string; evidence: MonthlyFinalExamMeta["grader"]["speakingGrammarEvidence"] };
}

function assemble(contract: MonthlyCurriculumContract, framework: MonthlyFinalFrameworkRef, parts: AssemblyParts, source: "ai" | "manual", now: Date): StoredAssessmentDefinition {
  const allocated = allocateMonthlyFinalTerms(contract);
  const { allocation } = allocated;
  const profile = MONTHLY_FINAL_LEVEL_PROFILES[contract.cefr];
  const chrome = monthlyFinalChrome(contract.cefr);
  const termById = new Map(contract.coreTerms.map((term) => [term.id, term]));
  const mapping: MonthlyFinalMappingRow[] = [];
  const graderItems: MonthlyFinalExamMeta["grader"]["items"] = {};
  const mapRow = (termId: string, skill: MonthlyFinalMappingRow["skill"], position: string, taskKey: string) => {
    const term = termById.get(termId);
    mapping.push({ code: allocated.codeById.get(termId) ?? "?", termId, word: term?.word ?? termId, type: term?.type ?? "", meaning: term?.meaning ?? "", skill, position, taskKey });
  };

  // Answer positions are balanced across the whole Listening section (both messages).
  const listeningFlat = rebalanceAnswerPositions(parts.listening.flatMap((message) => message.questions), `${framework.scopeHash}:L`);
  let cursor = 0;
  const listeningGroups = parts.listening.map((message) => {
    const questions = listeningFlat.slice(cursor, cursor + message.questions.length);
    const first = cursor;
    cursor += message.questions.length;
    const labels = chrome.listeningGroup(message.label, positionCode("L", first), positionCode("L", cursor - 1));
    return {
      key: `L${message.label}`, title: labels.title, instruction: labels.instruction, maxPlays: 2,
      stimulus: { type: "audio_script" as const, lines: [{ speaker: message.speaker, text: message.script }] },
      tasks: questions.map((question, index) => {
        const key = positionCode("L", first + index);
        mapRow(question.termId, "listening", key, key);
        graderItems[key] = { explanation: question.explanation, ...(question.evidence ? { evidence: question.evidence } : {}) };
        return choiceTask(key, question, MONTHLY_FINAL_SECTION_SCORE / allocation.l);
      })
    };
  });
  const readingItems = rebalanceAnswerPositions(parts.reading, `${framework.scopeHash}:R`);
  const readingTasks = readingItems.map((question, index) => {
    const key = positionCode("R", index);
    mapRow(question.termId, "reading", key, key);
    graderItems[key] = { explanation: question.explanation };
    return choiceTask(key, question, MONTHLY_FINAL_SECTION_SCORE / allocation.r);
  });
  for (const term of allocated.writing) mapRow(term.id, "writing", "W2", "W");
  for (const term of allocated.speaking) mapRow(term.id, "speaking", "S3", "SB");

  const grammar: MonthlyFinalGrammarTarget[] = G_CODES.map((code, index) => {
    const topic = contract.grammarTopics[index]!;
    const taught = taughtGrammarSteps(contract, index);
    const chosen = parts.grammar.find((item) => item.code === code);
    const step = (id: string | undefined, fallback: number) => taught.find((item) => item.id === id) ?? taught[fallback] ?? topic.steps[fallback]!;
    const main = step(chosen?.mainStepId, 0);
    const secondary = step(chosen?.secondaryStepId, 1);
    return {
      code, topicId: topic.id, topicTitle: topic.title,
      main: { stepId: main.id, label: chosen?.mainLabel ?? main.focus, acceptedPatterns: chosen?.mainPatterns?.length ? chosen.mainPatterns : [main.formula] },
      secondary: { stepId: secondary.id, label: chosen?.secondaryLabel ?? secondary.focus, acceptedPatterns: chosen?.secondaryPatterns?.length ? chosen.secondaryPatterns : [secondary.formula] },
      taughtSteps: taught.map((item) => ({ stepId: item.id, focus: item.focus, formula: item.formula }))
    };
  });
  const pronunciation: MonthlyFinalPronunciationTarget[] = P_CODES.map((code, index) => {
    const sound = contract.sounds[index]!;
    return {
      code, soundId: sound.id, ipa: sound.ipa, label: sound.label,
      positions: parts.speakingA.positions.filter((position) => position.code === code).map(({ word, exampleId, target }) => ({ word, exampleId, target })),
      taughtExamples: taughtPronunciationExamples(contract, index).map((example) => ({ exampleId: example.id, word: example.word }))
    };
  });

  const exam: MonthlyFinalExamMeta = {
    specVersion: MONTHLY_FINAL_SPEC_VERSION,
    status: "DRAFT",
    source,
    framework: { id: framework.id, version: framework.version, scopeHash: framework.scopeHash, month: contract.month, cefr: contract.cefr, examDate: framework.examDate },
    formCode: monthlyFinalFormCode(contract.cefr, contract.month),
    allocation,
    instructionLanguage: profile.instructionLanguage,
    grammar,
    pronunciation,
    mapping,
    grader: {
      listening: parts.listening.map((message) => ({ groupKey: `L${message.label}`, gaSentence: message.gaSentence, gbSentence: message.gbSentence })),
      items: graderItems,
      writingSample: parts.writing.sample,
      writingGrammarEvidence: parts.writing.evidence,
      speakingSample: parts.speakingB.sample,
      speakingGrammarEvidence: parts.speakingB.evidence,
      rubric: monthlyFinalRubric()
    },
    audio: { status: "SCRIPT_ONLY", reviewedAt: null, reviewedBy: null },
    manualConfirmations: [],
    checks: [],
    generatedAt: now.toISOString()
  };

  const blueprint: StoredAssessmentDefinition = {
    key: `monthly-final-${contract.month}-${contract.cefr.toLowerCase()}`,
    kind: "final",
    title: parts.title.trim() || chrome.title(contract.month),
    version: 1,
    totalMinutes: MONTHLY_FINAL_TOTAL_MINUTES,
    totalScore: MONTHLY_FINAL_TOTAL_SCORE,
    monthlyScope: buildMonthlyExamScope(contract),
    monthlyExam: exam,
    sections: [
      { code: "listening", title: chrome.listening.title, durationMinutes: MONTHLY_FINAL_SECTION_MINUTES.listening, maxScore: MONTHLY_FINAL_SECTION_SCORE, instructions: [chrome.listening.instruction(allocation.l)], groups: listeningGroups },
      { code: "reading", title: chrome.reading.title, durationMinutes: MONTHLY_FINAL_SECTION_MINUTES.reading, maxScore: MONTHLY_FINAL_SECTION_SCORE, instructions: [chrome.reading.instruction(allocation.r)], groups: [{ key: "R", title: chrome.reading.group, instruction: chrome.reading.instruction(allocation.r), tasks: readingTasks }] },
      { code: "writing", title: chrome.writing.title, durationMinutes: MONTHLY_FINAL_SECTION_MINUTES.writing, maxScore: MONTHLY_FINAL_SECTION_SCORE, instructions: [chrome.writing.instruction], groups: [{
        key: "W", title: chrome.writing.group, instruction: chrome.writing.instruction,
        tasks: [{ key: "W", prompt: productionPrompt(contract.cefr, "writing", parts.writing.task, parts.writing.facts, parts.writing.requirements, allocated.writing.map((term) => term.word)), responseType: "long_text", maxScore: MONTHLY_FINAL_SECTION_SCORE, minWords: profile.writing.minWords, maxWords: profile.writing.maxWords }]
      }] },
      { code: "speaking", title: chrome.speaking.title, durationMinutes: MONTHLY_FINAL_SECTION_MINUTES.speaking, maxScore: MONTHLY_FINAL_SECTION_SCORE, instructions: [chrome.speaking.instruction], groups: [
        { key: "SA", title: chrome.speaking.groupA, instruction: chrome.speaking.instructionA, tasks: [{ key: "SA", prompt: parts.speakingA.text, responseType: "speaking_evidence", maxScore: MONTHLY_FINAL_SPEAKING_A_SCORE }] },
        { key: "SB", title: chrome.speaking.groupB, instruction: chrome.speaking.instructionB(profile.speakingB.minSeconds, profile.speakingB.maxSeconds, profile.speakingB.limitSeconds), tasks: [{ key: "SB", prompt: productionPrompt(contract.cefr, "speaking", parts.speakingB.task, parts.speakingB.facts, parts.speakingB.requirements, allocated.speaking.map((term) => term.word)), responseType: "speaking_evidence", maxScore: MONTHLY_FINAL_SPEAKING_B_SCORE }] }
      ] }
    ]
  };
  return withEvaluation(blueprint, contract);
}

/** Re-runs every GEN check and stores the results and the derived status on the blueprint. */
export function withEvaluation(blueprint: StoredAssessmentDefinition, contract: MonthlyCurriculumContract): StoredAssessmentDefinition {
  if (!blueprint.monthlyExam) return blueprint;
  const evaluation = evaluateMonthlyFinal(blueprint, contract);
  return { ...blueprint, monthlyExam: { ...blueprint.monthlyExam, checks: evaluation.checks, status: evaluation.status } };
}

/** AI output (already zod-validated) → stored definition shared by the level editor and learner runtime. */
export function assembleMonthlyFinalFromAi(
  contract: MonthlyCurriculumContract, framework: MonthlyFinalFrameworkRef,
  receptive: MonthlyFinalReceptiveOutput, productive: MonthlyFinalProductiveOutput, now = new Date()
): StoredAssessmentDefinition {
  const messages = [...receptive.listening.messages].sort((left, right) => left.label.localeCompare(right.label));
  return assemble(contract, framework, {
    title: productive.title,
    listening: messages,
    reading: receptive.reading.questions,
    grammar: productive.grammarComponents,
    writing: productive.writing,
    speakingA: productive.speakingA,
    speakingB: productive.speakingB
  }, "ai", now);
}

/**
 * Non-AI fallback for "Soạn tay": the full v2.0 frame (allocation, mapping,
 * pronunciation positions from taught example words, default GA/GB components)
 * with empty learner-facing text for the Operator to write. It stays DRAFT
 * until the GEN checks pass.
 */
export function buildManualMonthlyFinalDraft(contract: MonthlyCurriculumContract, framework: MonthlyFinalFrameworkRef, now = new Date()): StoredAssessmentDefinition {
  const missing = monthlyFinalInputErrors(contract);
  if (missing.length) throw new MonthlyFinalInputError(missing);
  const allocated = allocateMonthlyFinalTerms(contract);
  const emptyChoice = (termId: string): ChoiceDraft => ({ termId, prompt: "", options: ["", "", ""], correctIndex: 0, explanation: "", evidence: "" });
  const half = Math.ceil(allocated.listening.length * 0.6);
  return assemble(contract, framework, {
    title: monthlyFinalChrome(contract.cefr).title(contract.month),
    listening: [
      { label: "A", speaker: "Manager", script: "", gaSentence: "", gbSentence: "", questions: allocated.listening.slice(0, half).map((term) => emptyChoice(term.id)) },
      { label: "B", speaker: "Colleague", script: "", gaSentence: "", gbSentence: "", questions: allocated.listening.slice(half).map((term) => emptyChoice(term.id)) }
    ],
    reading: allocated.reading.map((term) => emptyChoice(term.id)),
    grammar: [],
    writing: { task: "", facts: "", requirements: [], sample: "", evidence: { gaMain: "", gaSecondary: "", gbMain: "", gbSecondary: "" } },
    speakingA: { text: "", positions: P_CODES.flatMap((code, index) => taughtPronunciationExamples(contract, index).slice(0, 2).map((example) => ({ code, exampleId: example.id, word: example.word, target: contract.sounds[index]!.ipa }))) },
    speakingB: { task: "", facts: "", requirements: [], sample: "", evidence: { gaMain: "", gbMain: "" } }
  }, "manual", now);
}
