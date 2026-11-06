import type { MonthlyCurriculumContract, MonthlyDaySpec } from "@e4s/domain";
import type { MonthlyQualityFinding } from "./monthly-quality.js";

/**
 * Friday review exercises (e4s_cau_truc_bai_on_cuoi_tuan, 03/11): six sections
 * of `items`, review-until-correct. Counts scale with the week's core words N
 * (12 for a full week) but all six sections are always present.
 *
 * 1 listening   – hear a word, choose its meaning: one item per core word
 * 2 word_use    – synonyms/antonyms, umbrella groups, fill a word in context: 4–5
 * 3 word_class  – word form in a sentence: 3–4
 * 4 grammar     – one item per grammar step learnt this week (+1 previous week)
 * 5 reading     – one 60–120 word workplace message with ≥5 week words, 3 questions
 * 6 speaking    – 2 minimal pairs, 1 read-aloud sentence, 1 free response (≥2 week words)
 */
export const MONTHLY_REVIEW_SECTIONS = ["listening", "word_use", "word_class", "grammar", "reading", "speaking"] as const;

/** Study tab (objective, instruction, vocabulary, grammar, pronunciation) plus the review sections. */
export const MONTHLY_REVIEW_COMPONENTS = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "word_class", "word_use", "speaking"
] as const;

export function monthlyReviewTargets(coreCount: number, grammarStepCount: number) {
  const full = coreCount >= 8;
  return {
    listening: Math.max(1, coreCount),
    wordUse: full ? 4 : 2,
    wordForm: full ? 3 : 2,
    grammar: Math.max(1, grammarStepCount),
    reading: 3,
    readingWords: { min: 60, max: 120 },
    readingWeekWords: Math.min(5, coreCount)
  };
}

type Content = Record<string, unknown>;

export function evaluateMonthlyReviewSections(
  contract: MonthlyCurriculumContract,
  day: MonthlyDaySpec,
  dayNumber: number,
  parts: ReadonlyMap<string, { content: Content }>
): { severe: MonthlyQualityFinding[]; light: MonthlyQualityFinding[] } {
  const severe: MonthlyQualityFinding[] = [];
  const light: MonthlyQualityFinding[] = [];
  const add = (level: "severe" | "light", component: string, code: string, message: string) =>
    (level === "severe" ? severe : light).push({ severity: level, code, message, dayNumber, component });

  const coreWords = (day.reviewTermIds ?? []).map((id) => contract.coreTerms.find((term) => term.id === id)?.word ?? "").filter(Boolean);
  const target = monthlyReviewTargets(coreWords.length, (day.reviewGrammarStepIds ?? []).length);
  const sectionItems = (code: string) => {
    const value = parts.get(code)?.content.items;
    return Array.isArray(value) ? value.filter(isRecord) : [];
  };

  // Every graded choice item needs a prompt, distinct options containing the answer, and an explanation.
  const checkChoices = (code: string, list: Content[], optionCount: number) => {
    list.forEach((item, index) => {
      const label = `${code} item ${index + 1}`;
      if (!text(item.prompt)) add("severe", code, "MONTHLY_REVIEW_ITEM_PROMPT_MISSING", `${label} has no prompt`);
      const options = strings(item.options);
      const answer = text(item.answer);
      if (options.length !== optionCount || new Set(options.map(normalize)).size !== options.length || !options.some((option) => normalize(option) === normalize(answer))) {
        add("severe", code, "MONTHLY_REVIEW_ITEM_CHOICES_INVALID", `${label} needs ${optionCount} different options and an answer copied from them`);
      }
      if (!text(item.explanation)) add("severe", code, "MONTHLY_REVIEW_EXPLANATION_MISSING", `${label} needs a short explanation shown after a wrong answer`);
      if (!Array.isArray(item.variants) || !item.variants.length) add("light", code, "MONTHLY_REVIEW_VARIANT_MISSING", `${label} has no alternative-context variant for the retry`);
    });
  };

  const listening = sectionItems("listening");
  if (listening.length < target.listening) add("severe", "listening", "MONTHLY_REVIEW_COUNT", `Listening needs one word-recognition item per core word (${target.listening}); it has ${listening.length}`);
  const heard = new Set(listening.map((item) => normalize(text(item.audioText) || text(item.script))));
  const unheard = coreWords.filter((word) => !heard.has(normalize(word)));
  if (unheard.length) add("severe", "listening", "MONTHLY_REVIEW_WORD_NOT_COVERED", `Listening must play every core word (audioText); missing: ${unheard.join(", ")}`);
  checkChoices("listening", listening, 4);

  const wordUse = sectionItems("word_use");
  if (wordUse.length < target.wordUse) add("severe", "word_use", "MONTHLY_REVIEW_COUNT", `Word use needs at least ${target.wordUse} items; it has ${wordUse.length}`);
  checkChoices("word_use", wordUse, 4);

  const wordForm = sectionItems("word_class");
  if (wordForm.length < target.wordForm) add("severe", "word_class", "MONTHLY_REVIEW_COUNT", `Word form needs at least ${target.wordForm} items; it has ${wordForm.length}`);
  checkChoices("word_class", wordForm, 4);
  for (const item of wordForm) if (/-{3,}/u.test(text(item.prompt))) add("severe", "word_class", "MONTHLY_REVIEW_BLANK_DASHES", "Word form blanks must be a solid line (____), never dashes");

  const grammar = sectionItems("grammar");
  if (grammar.length < target.grammar) add("severe", "grammar", "MONTHLY_REVIEW_COUNT", `Grammar needs one item per grammar step learnt this week (${target.grammar}); it has ${grammar.length}`);
  checkChoices("grammar", grammar, 4);

  const reading = parts.get("reading")?.content;
  const passage = text(reading?.passage) || text(reading?.text);
  const passageWords = passage.split(/\s+/u).filter(Boolean).length;
  if (!passage) add("severe", "reading", "MONTHLY_REVIEW_PASSAGE_MISSING", "Reading needs one workplace message or email (passage)");
  else if (passageWords < target.readingWords.min || passageWords > target.readingWords.max) add("light", "reading", "MONTHLY_REVIEW_PASSAGE_LENGTH", `Reading passage should be ${target.readingWords.min}–${target.readingWords.max} words; it has ${passageWords}`);
  const passageLower = ` ${passage.toLocaleLowerCase("en-US")} `;
  const usedWeekWords = coreWords.filter((word) => passageLower.includes(word.toLocaleLowerCase("en-US")));
  if (passage && usedWeekWords.length < target.readingWeekWords) add("severe", "reading", "MONTHLY_REVIEW_PASSAGE_WORDS", `Reading passage must use at least ${target.readingWeekWords} week words; it uses ${usedWeekWords.length}`);
  const readingItems = sectionItems("reading");
  if (readingItems.length !== target.reading) add("severe", "reading", "MONTHLY_REVIEW_COUNT", `Reading needs exactly ${target.reading} comprehension questions; it has ${readingItems.length}`);
  checkChoices("reading", readingItems, 4);

  const speaking = sectionItems("speaking");
  const minimalPairs = speaking.filter((item) => strings(item.options).length === 2);
  const readAloud = speaking.filter((item) => !strings(item.options).length && text(item.passage) && !strings(item.requiredWords).length);
  const freeResponse = speaking.filter((item) => strings(item.requiredWords).length >= 2);
  if (minimalPairs.length < 2) add("severe", "speaking", "MONTHLY_REVIEW_MINIMAL_PAIRS", `Speaking needs 2 minimal-pair listening items (2 options); it has ${minimalPairs.length}`);
  for (const item of minimalPairs) {
    if (!text(item.audioText) || !strings(item.options).some((option) => normalize(option) === normalize(text(item.answer)))) add("severe", "speaking", "MONTHLY_REVIEW_MINIMAL_PAIR_INVALID", "A minimal-pair item needs audioText and an answer that is one of its 2 options");
    if (!text(item.explanation)) add("severe", "speaking", "MONTHLY_REVIEW_EXPLANATION_MISSING", "Minimal-pair items need a short explanation");
  }
  if (readAloud.length < 1) add("severe", "speaking", "MONTHLY_REVIEW_READ_ALOUD_MISSING", "Speaking needs 1 read-aloud sentence (passage, no options)");
  if (freeResponse.length < 1) add("severe", "speaking", "MONTHLY_REVIEW_FREE_RESPONSE_MISSING", "Speaking needs 1 free response with requiredWords (week words) and minRequiredWords 2");
  for (const item of freeResponse) {
    const required = strings(item.requiredWords).map(normalize);
    if (required.some((word) => !coreWords.map(normalize).includes(word))) add("light", "speaking", "MONTHLY_REVIEW_REQUIRED_WORD_SCOPE", "Free-response requiredWords should only list this week's core words");
  }
  return { severe, light };
}

function isRecord(value: unknown): value is Content { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []; }
function normalize(value: string): string { return value.trim().toLocaleLowerCase("en-US").replace(/[.!?]+$/u, ""); }
