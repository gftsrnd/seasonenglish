import type { MonthlyCurriculumContract } from "@e4s/domain";
import { validateLessonPublication } from "@e4s/domain";
import type { LessonPart } from "@e4s/contracts";
import { evaluateMonthlyReviewSections, MONTHLY_REVIEW_COMPONENTS, MONTHLY_REVIEW_SECTIONS } from "./monthly-review-quality.js";

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
  const review = day.kind === "review";
  for (const code of review ? MONTHLY_REVIEW_COMPONENTS : REQUIRED_COMPONENTS) {
    if (!parts.has(code)) severe.push(finding("MONTHLY_COMPONENT_MISSING", `Missing required ${code} component`, dayNumber, code));
  }

  const contentValidation = validateLessonPublication([{
    dayNumber,
    title: lesson.title,
    durationMinutes: 15,
    parts: lesson.parts as unknown as LessonPart[]
  }], undefined, contract.cefr);
  for (const issue of contentValidation.issues) {
    // Review exercises use `items` per section (checked below), not the single daily question shape.
    // The daily part order also expects a writing part, which a review folds into speaking.
    if (review && ((MONTHLY_REVIEW_SECTIONS as readonly string[]).includes(issue.code) || issue.code === "writing" || issue.code === "order")) continue;
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
    // Each vocabulary card shows three common phrases ("Cụm từ thường dùng"), as in the weekly lessons.
    const phrases = (Array.isArray(item.collocations) ? item.collocations : Array.isArray(item.examples) ? item.examples : []).filter((phrase) => typeof phrase === "string" && phrase.trim());
    if (phrases.length < 3) severe.push(finding("MONTHLY_VOCABULARY_PHRASES_MISSING", `${word} needs 3 common phrases (collocations) containing the word; it has ${phrases.length}`, dayNumber, "vocabulary"));
    if (hasNoLexicalRelation(item)) light.push({ severity: "light", code: "MONTHLY_SYNONYM_OR_ANTONYM_MISSING", message: `${word} is missing a synonym or antonym`, dayNumber, component: "vocabulary" });
  }

  const grammarIds = day.kind === "review" ? day.reviewGrammarStepIds ?? [] : day.grammarStepIds ?? [day.grammarStepId];
  const grammarSteps = grammarIds.map((id) => contract.grammarTopics.flatMap((topic) => topic.steps).find((step) => step.id === id)).filter((step): step is NonNullable<typeof step> => Boolean(step));
  // Review days may split the formula into grammar.steps (one block per step); accept either place.
  const grammarContent = parts.get("grammar")?.content;
  const stepFormulas = Array.isArray(grammarContent?.steps) ? grammarContent.steps.map((step) => step && typeof step === "object" ? asString((step as Record<string, unknown>).formula) : "") : [];
  const formula = [asString(grammarContent?.formula), ...stepFormulas].join("\n");
  if (!grammarIds.length || grammarSteps.length !== grammarIds.length || grammarSteps.some((step) => !formula.includes(step.formula))) severe.push(finding("MONTHLY_GRAMMAR_SCOPE_MISMATCH", "Grammar formula does not match every locked grammar step", dayNumber, "grammar"));

  const soundIds = day.kind === "review" ? day.reviewSoundIds ?? [] : [day.soundId];
  const exampleIds = day.kind === "review" ? day.reviewPronunciationExampleIds ?? [] : day.pronunciationExampleIds;
  const sounds = soundIds.map((soundId) => contract.sounds.find((candidate) => candidate.id === soundId)).filter((sound): sound is NonNullable<typeof sound> => Boolean(sound));
  const soundByExampleId = new Map(sounds.flatMap((sound) => sound.examples.map((example) => [example.id, { sound, example }] as const)));
  const expectedExamples = exampleIds.map((id) => soundByExampleId.get(id)?.example);
  const primarySound = sounds[0];
  const primaryExamples = primarySound ? exampleIds.map((id) => soundByExampleId.get(id)).filter((entry): entry is NonNullable<typeof entry> => entry !== undefined && entry.sound.id === primarySound.id).map((entry) => entry.example) : [];
  const pronunciation = parts.get("pronunciation")?.content;
  const focus = asString(pronunciation?.focus);
  const words = items(pronunciation).map((item) => ({ word: asString(item.word), ipa: asString(item.ipa) }));
  const reviewTargets = Array.isArray(pronunciation?.reviewTargets) ? pronunciation.reviewTargets.filter(isRecord) : [];
  const expectedReviewTargets = sounds.map((sound) => ({
    soundId: sound.id,
    focus: sound.ipa,
    words: exampleIds.map((id) => soundByExampleId.get(id)).filter((entry): entry is NonNullable<typeof entry> => entry !== undefined && entry.sound.id === sound.id).map((entry) => entry.example)
  }));
  const reviewTargetsMatch = day.kind !== "review" || (reviewTargets.length === expectedReviewTargets.length && reviewTargets.every((target, index) => {
    const expected = expectedReviewTargets[index];
    if (!expected) return false;
    const actualWords = items(target).map((item) => ({ word: asString(item.word), ipa: asString(item.ipa) }));
    return target.soundId === expected.soundId && target.focus === expected.focus && actualWords.length === expected.words.length && samePronunciationExamples(actualWords, expected.words);
  }));
  if (!sounds.length || sounds.length !== soundIds.length || !exampleIds.length || expectedExamples.some((example) => !example) || !primarySound || focus !== primarySound.ipa || words.length !== primaryExamples.length || !samePronunciationExamples(words, primaryExamples) || !reviewTargetsMatch) {
    severe.push(finding("MONTHLY_SOUND_SCOPE_MISMATCH", "Pronunciation focus or examples do not match the locked day specification", dayNumber, "pronunciation"));
  }
  if (review) {
    const sections = evaluateMonthlyReviewSections(contract, day, dayNumber, parts);
    severe.push(...sections.severe);
    light.push(...sections.light);
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
