import { containsVietnameseLearnerText, isPlausibleMinimalPair, type MonthlyCurriculumContract, type MonthlyDaySpec } from "@e4s/domain";
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

  // Round 2: a repair message names the section, the exact count and how many are missing.
  const countMessage = (section: string, wanted: string, have: number, missing: number, detail = "") =>
    `${section}.items must contain ${wanted}; it has ${have} (${missing} missing)${detail}. Return the complete ${section} section with every item, not only the new ones`;

  const listening = sectionItems("listening");
  if (listening.length < target.listening) add("severe", "listening", "MONTHLY_REVIEW_COUNT", countMessage("listening", `exactly ${target.listening} items, one word-recognition item per core word (${coreWords.join(", ")})`, listening.length, target.listening - listening.length));
  const heard = new Set(listening.map((item) => normalize(text(item.audioText) || text(item.script))));
  const unheard = coreWords.filter((word) => !heard.has(normalize(word)));
  if (unheard.length) add("severe", "listening", "MONTHLY_REVIEW_WORD_NOT_COVERED", `Listening must play every core word (audioText); missing: ${unheard.join(", ")}`);
  checkChoices("listening", listening, 4);

  const wordUse = sectionItems("word_use");
  if (wordUse.length < target.wordUse) add("severe", "word_use", "MONTHLY_REVIEW_COUNT", countMessage("word_use", `exactly ${target.wordUse} items`, wordUse.length, target.wordUse - wordUse.length));
  checkChoices("word_use", wordUse, 4);

  const wordForm = sectionItems("word_class");
  if (wordForm.length < target.wordForm) add("severe", "word_class", "MONTHLY_REVIEW_COUNT", countMessage("word_class", `exactly ${target.wordForm} Word form items`, wordForm.length, target.wordForm - wordForm.length, "; use only verbs or words with a real word family, never invented forms"));
  checkChoices("word_class", wordForm, 4);
  for (const item of wordForm) if (/-{3,}/u.test(text(item.prompt))) add("severe", "word_class", "MONTHLY_REVIEW_BLANK_DASHES", "Word form blanks must be a solid line (____), never dashes");

  const grammar = sectionItems("grammar");
  if (grammar.length < target.grammar) add("severe", "grammar", "MONTHLY_REVIEW_COUNT", countMessage("grammar", `${target.grammar} items, one per grammar step learnt this week, in grammar.items`, grammar.length, target.grammar - grammar.length));
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
  if (readingItems.length !== target.reading) add("severe", "reading", "MONTHLY_REVIEW_COUNT", readingItems.length < target.reading
    ? countMessage("reading", `exactly ${target.reading} comprehension questions about the passage`, readingItems.length, target.reading - readingItems.length)
    : `reading.items must contain exactly ${target.reading} comprehension questions; it has ${readingItems.length} (remove ${readingItems.length - target.reading})`);
  checkChoices("reading", readingItems, 4);

  const speaking = sectionItems("speaking");
  const minimalPairs = speaking.filter((item) => strings(item.options).length === 2);
  const readAloud = speaking.filter((item) => !strings(item.options).length && text(item.passage) && !strings(item.requiredWords).length);
  const freeResponse = speaking.filter((item) => strings(item.requiredWords).length >= 2);
  const speakingDetail = `speaking.items must contain exactly 4 items in this order: 2 minimal pairs, 1 read-aloud, 1 free response; it has ${minimalPairs.length} minimal pair(s), ${readAloud.length} read-aloud, ${freeResponse.length} free response`;
  if (minimalPairs.length < 2) add("severe", "speaking", "MONTHLY_REVIEW_MINIMAL_PAIRS", `Speaking needs 2 minimal-pair listening items (2 options); it has ${minimalPairs.length} (${2 - minimalPairs.length} missing). ${speakingDetail}`);
  // WP8: pronunciation items must practise this week's taught example words.
  const exampleWords = weekPronunciationExampleWords(contract, day);
  const ipaByWord = new Map<string, string>([
    ...contract.coreTerms.map((term) => [normalize(term.word), term.ipa] as const),
    ...contract.sounds.flatMap((sound) => sound.examples.map((example) => [normalize(example.word), example.ipa] as const))
  ].filter(([word, ipa]) => Boolean(word) && typeof ipa === "string" && /\p{L}/u.test(ipa) && !/X/u.test(ipa)));
  const weekWords = new Set([...exampleWords, ...coreWords.map(normalize)]);
  for (const item of minimalPairs) {
    if (!text(item.audioText) || !strings(item.options).some((option) => normalize(option) === normalize(text(item.answer)))) add("severe", "speaking", "MONTHLY_REVIEW_MINIMAL_PAIR_INVALID", "A minimal-pair item needs audioText and an answer that is one of its 2 options");
    if (!text(item.explanation)) add("severe", "speaking", "MONTHLY_REVIEW_EXPLANATION_MISSING", "Minimal-pair items need a short explanation");
    if (exampleWords.length && !strings(item.options).some((option) => weekWords.has(normalize(option)))) add("severe", "speaking", "MONTHLY_REVIEW_MINIMAL_PAIR_SCOPE", `Minimal pair "${strings(item.options).join(" / ")}" must contain one of this week's pronunciation example words (${exampleWords.join(", ")}) paired with a real, common word that differs by one sound`);
    // Round 2: the two words must differ by exactly one sound (IPA when both are known, else spelling heuristic).
    const [first, second] = strings(item.options);
    if (first && second && !isPlausibleMinimalPair(first, second, { first: ipaByWord.get(normalize(first)), second: ipaByWord.get(normalize(second)) })) {
      add("severe", "speaking", "MONTHLY_REVIEW_MINIMAL_PAIR_NOT_MINIMAL", `"${first} / ${second}" is not a minimal pair: the two words must sound exactly the same except for the week's target sound, replaced by one neighbouring sound (e.g. ship / sheep, think / sink, fan / van). Keep the week example word and replace the partner word`);
    }
  }
  if (readAloud.length < 1) add("severe", "speaking", "MONTHLY_REVIEW_READ_ALOUD_MISSING", `Speaking needs 1 read-aloud sentence (passage, no options). ${speakingDetail}`);
  for (const item of readAloud) {
    const used = exampleWords.filter((word) => containsWordForm(text(item.passage), word));
    if (exampleWords.length >= 2 && used.length < 2) add("severe", "speaking", "MONTHLY_REVIEW_READ_ALOUD_WORDS", `The read-aloud sentence must be one natural workplace sentence containing at least 2 of this week's pronunciation example words (${exampleWords.join(", ")}); it uses ${used.length ? used.join(", ") : "none"}`);
  }
  if (freeResponse.length < 1) add("severe", "speaking", "MONTHLY_REVIEW_FREE_RESPONSE_MISSING", `Speaking needs 1 free response with requiredWords (week words) and minRequiredWords 2. ${speakingDetail}`);
  for (const item of freeResponse) {
    const required = strings(item.requiredWords).map(normalize);
    const outside = required.filter((word) => !coreWords.map(normalize).includes(word));
    if (outside.length) add("severe", "speaking", "MONTHLY_REVIEW_REQUIRED_WORD_SCOPE", `Free-response requiredWords must only list this week's core words, copied exactly (${coreWords.join(", ")}); remove: ${outside.join(", ")}`);
  }
  // Round 2: B1+ review sections are English-only. The publication check skips review
  // sections (they use items), so check them here; listening options/answers are the
  // Vietnamese word meanings and stay allowed.
  if (!["A1", "A2"].includes(contract.cefr)) {
    for (const code of MONTHLY_REVIEW_SECTIONS) {
      const content = parts.get(code)?.content;
      if (!content) continue;
      const vietnamese = vietnameseStrings(content, code === "listening");
      if (vietnamese.length) add("severe", code, "MONTHLY_REVIEW_INSTRUCTION_LANGUAGE", `${contract.cefr} review sections must be written in English (prompts, questions, explanations, passages; only listening options/answers, the word meanings, may be Vietnamese). Rewrite in English: ${vietnamese.slice(0, 3).map((value) => `"${value.length > 80 ? `${value.slice(0, 80)}…` : value}"`).join("; ")}`);
    }
  }
  return { severe, light };
}

/** Learner strings containing Vietnamese prose, at any depth; `meaningsAllowed` skips options/answer (listening meanings). */
function vietnameseStrings(content: Content, meaningsAllowed: boolean): string[] {
  const found: string[] = [];
  const visit = (value: unknown, key: string) => {
    if (/meaning$/iu.test(key) || key === "id" || (meaningsAllowed && (key === "options" || key === "answer"))) return;
    if (typeof value === "string") { if (containsVietnameseLearnerText(value)) found.push(value.trim()); return; }
    if (Array.isArray(value)) { for (const item of value) visit(item, key === "items" || key === "variants" ? "" : key); return; }
    if (isRecord(value)) for (const [childKey, item] of Object.entries(value)) visit(item, childKey);
  };
  visit(content, "");
  return [...new Set(found)];
}

/** Words of the week's locked pronunciation examples (reviewPronunciationExampleIds), normalised and de-duplicated. */
export function weekPronunciationExampleWords(contract: MonthlyCurriculumContract, day: MonthlyDaySpec): string[] {
  const examples = new Map(contract.sounds.flatMap((sound) => sound.examples.map((example) => [example.id, example.word] as const)));
  return [...new Set((day.reviewPronunciationExampleIds ?? []).map((id) => normalize(examples.get(id) ?? "")).filter(Boolean))];
}

/** Whole-word match that also accepts a simple inflection (list → lists, test → tested). */
function containsWordForm(passage: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\p{L}])${escaped}(?:s|es|ed|d|ing)?(?![\\p{L}])`, "iu").test(passage);
}

function isRecord(value: unknown): value is Content { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []; }
function normalize(value: string): string { return value.trim().toLocaleLowerCase("en-US").replace(/[.!?]+$/u, ""); }
