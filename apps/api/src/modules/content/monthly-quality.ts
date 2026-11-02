import type { MonthlyCurriculumContract } from "@e4s/domain";
import { validateLessonPublication } from "@e4s/domain";
import type { LessonPart } from "@e4s/contracts";

const REQUIRED_COMPONENTS = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
] as const;

export interface MonthlyQualityFinding {
  severity: "severe" | "light";
  code: string;
  message: string;
  dayNumber: number;
  component: string;
}

export interface MonthlyQualityReport {
  severe: MonthlyQualityFinding[];
  light: MonthlyQualityFinding[];
  contractVersion: number;
}

export interface MonthlyLessonCandidate {
  title: string;
  parts: Array<{ code: string; content: Record<string, unknown> }>;
}

/**
 * Enforces the curriculum boundary independently of the AI prompt. A generator
 * may add sentences and activities, but it cannot introduce a new vocabulary
 * card, grammar step, or sound outside the locked MonthlyDaySpec.
 */
export function evaluateMonthlyLessonQuality(
  contract: MonthlyCurriculumContract,
  dayNumber: number,
  lesson: MonthlyLessonCandidate
): MonthlyQualityReport {
  const day = contract.daySpecs.find((candidate) => candidate.lessonNumber === dayNumber);
  if (!day) throw new Error(`Monthly day ${dayNumber} is not in the curriculum contract`);
  const severe: MonthlyQualityFinding[] = [];
  const light: MonthlyQualityFinding[] = [];
  const parts = new Map(lesson.parts.map((part) => [part.code, part]));
  for (const code of REQUIRED_COMPONENTS) {
    if (!parts.has(code)) severe.push(finding("MONTHLY_COMPONENT_MISSING", `Missing required ${code} component`, dayNumber, code));
  }

  const contentValidation = validateLessonPublication([{
    dayNumber,
    title: lesson.title,
    durationMinutes: 15,
    parts: lesson.parts as unknown as LessonPart[]
  }], undefined, contract.cefr);
  for (const issue of contentValidation.issues) {
    severe.push(finding("MONTHLY_CONTENT_INVALID", issue.message, dayNumber, issue.code));
  }

  const coreById = new Map(contract.coreTerms.map((term) => [term.id, term]));
  const coreByWord = new Map(contract.coreTerms.map((term) => [normalize(term.word), term]));
  const supportWords = new Set(contract.supportTerms.map((term) => normalize(term.word)));
  const vocabulary = items(parts.get("vocabulary")?.content);
  const scheduledTermIds = day.kind === "new" ? day.coreTermIds : day.reviewTermIds;
  const scheduledWords = new Set(scheduledTermIds.map((id) => normalize(coreById.get(id)?.word ?? "")));
  const actualWords = new Set(vocabulary.map((item) => normalize(asString(item.word))));

  if (day.kind === "new") {
    for (const termId of day.coreTermIds) {
      const term = coreById.get(termId);
      if (term && !actualWords.has(normalize(term.word))) severe.push(finding("MONTHLY_CORE_TERM_MISSING", `${term.word} is required by the locked day specification`, dayNumber, "vocabulary"));
    }
  }
  for (const word of actualWords) {
    const core = coreByWord.get(word);
    if (core && !scheduledWords.has(word)) {
      severe.push(finding(
        day.kind === "review" ? "MONTHLY_REVIEW_INTRODUCES_CORE_TERM" : "MONTHLY_CORE_TERM_SCOPE_MISMATCH",
        `${core.word} is outside this day's locked vocabulary scope`, dayNumber, "vocabulary"
      ));
    }
    if (supportWords.has(word)) severe.push(finding("MONTHLY_SUPPORT_TERM_AS_CORE_CARD", `${word} is a support term and cannot become a vocabulary card`, dayNumber, "vocabulary"));
  }
  for (const item of vocabulary) {
    const word = asString(item.word);
    if (!word || !coreByWord.has(normalize(word))) continue;
    if (hasNoLexicalRelation(item)) light.push({ severity: "light", code: "MONTHLY_SYNONYM_OR_ANTONYM_MISSING", message: `${word} is missing a synonym or antonym`, dayNumber, component: "vocabulary" });
  }

  const grammarStep = contract.grammarTopics.flatMap((topic) => topic.steps).find((step) => step.id === day.grammarStepId);
  const formula = asString(parts.get("grammar")?.content.formula);
  if (!grammarStep || formula !== grammarStep.formula) severe.push(finding("MONTHLY_GRAMMAR_SCOPE_MISMATCH", "Grammar formula does not match the locked grammar step", dayNumber, "grammar"));

  const sound = contract.sounds.find((candidate) => candidate.id === day.soundId);
  const pronunciation = parts.get("pronunciation")?.content;
  const focus = asString(pronunciation?.focus);
  const words = items(pronunciation).map((item) => ({ word: asString(item.word), ipa: asString(item.ipa) }));
  const expectedExamples = sound?.examples.filter((example) => day.pronunciationExampleIds.includes(example.id)) ?? [];
  if (!sound || focus !== sound.ipa || words.length !== 3 || !samePronunciationExamples(words, expectedExamples)) {
    severe.push(finding("MONTHLY_SOUND_SCOPE_MISMATCH", "Pronunciation focus or examples do not match the locked day specification", dayNumber, "pronunciation"));
  }
  return { severe, light, contractVersion: contract.version };
}

function finding(code: string, message: string, dayNumber: number, component: string): MonthlyQualityFinding {
  return { severity: "severe", code, message, dayNumber, component };
}

function items(content: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  const value = content?.items ?? content?.words;
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasNoLexicalRelation(item: Record<string, unknown>): boolean {
  return arrayLength(item.synonyms) === 0 && arrayLength(item.antonyms) === 0;
}

function arrayLength(value: unknown): number { return Array.isArray(value) ? value.length : 0; }
function asString(value: unknown): string { return typeof value === "string" ? value : ""; }
function normalize(value: string): string { return value.trim().toLocaleLowerCase("en-US"); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

function samePronunciationExamples(
  actual: ReadonlyArray<{ word: string; ipa: string }>,
  expected: ReadonlyArray<{ word: string; ipa: string }>
): boolean {
  if (actual.length !== expected.length) return false;
  return actual.every((item, index) => normalize(item.word) === normalize(expected[index]?.word ?? "") && item.ipa === expected[index]?.ipa);
}
