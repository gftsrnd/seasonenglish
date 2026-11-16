import { containsVietnameseLearnerText, isExerciseTranslationKey, isVietnameseTranslationKey, monthlyMinimalPairPartners, monthlyMinimalPairRepairAdvice, monthlyPronunciationContrastIssue, monthlyPronunciationContrastRule, monthlyPronunciationExampleText, type MonthlyCurriculumContract, type MonthlyDaySpec, type MonthlyPronunciationContrastRule } from "@e4s/domain";
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
  // Listen-and-choose items are recognised by their options (any count), so an
  // item with 4 options is reported as such instead of as "0 minimal pairs".
  const minimalPairs = speaking.filter((item) => strings(item.options).length > 0);
  const readAloud = speaking.filter((item) => !strings(item.options).length && text(item.passage) && !strings(item.requiredWords).length);
  const freeResponse = speaking.filter((item) => strings(item.requiredWords).length >= 2);
  const speakingDetail = `speaking.items must contain exactly 4 items in this order: 2 minimal pairs, 1 read-aloud, 1 free response; it has ${minimalPairs.length} minimal pair(s), ${readAloud.length} read-aloud, ${freeResponse.length} free response`;
  if (minimalPairs.length < 2) add("severe", "speaking", "MONTHLY_REVIEW_MINIMAL_PAIRS", `Speaking needs 2 minimal-pair listening items, each { audioText, prompt, options: [exactly 2 strings], answer, explanation }; it has ${minimalPairs.length} (${2 - minimalPairs.length} missing). ${speakingDetail}`);
  // WP8: pronunciation items must practise this week's taught example words;
  // what the pair contrasts depends on the roadmap item (pronunciation-contrast).
  const weekExamples = weekPronunciationExamples(contract, day);
  const exampleWords = [...new Set(weekExamples.map((example) => example.text))];
  const ipaByWord = new Map<string, string>([
    ...contract.coreTerms.map((term) => [normalize(term.word), term.ipa] as const),
    ...contract.sounds.flatMap((sound) => sound.examples.map((example) => [spoken(example.word), example.ipa] as const))
  ].filter(([word, ipa]) => Boolean(word) && typeof ipa === "string" && /\p{L}/u.test(ipa) && !/X/u.test(ipa)));
  for (const [index, item] of minimalPairs.entries()) {
    const label = `speaking item ${text(item.id) || index + 1}`;
    const options = strings(item.options);
    if (options.length !== 2) {
      const example = options.map((option) => weekExamples.find((candidate) => candidate.text === spoken(option))).find(Boolean);
      add("severe", "speaking", "MONTHLY_REVIEW_MINIMAL_PAIR_OPTIONS", `${label} has ${options.length} options (${options.join(", ")}); a minimal-pair item has exactly 2 options: ${example ? `the week example "${example.text}" and its partner (${example.rule.guidance})` : "one of this week's pronunciation examples and its partner"}. Remove the other options and rewrite the explanation for the 2 options`);
      continue;
    }
    if (!text(item.audioText) || !options.some((option) => normalize(option) === normalize(text(item.answer)))) add("severe", "speaking", "MONTHLY_REVIEW_MINIMAL_PAIR_INVALID", `${label} needs audioText and an answer that is one of its 2 options`);
    if (!text(item.explanation)) add("severe", "speaking", "MONTHLY_REVIEW_EXPLANATION_MISSING", "Minimal-pair items need a short explanation");
    const [first, second] = options as [string, string];
    const taught = weekExamples.find((example) => example.text === spoken(first)) ?? weekExamples.find((example) => example.text === spoken(second));
    if (!taught) {
      if (exampleWords.length) {
        const byGuidance = new Map<string, string[]>();
        for (const example of weekExamples) byGuidance.set(example.rule.guidance, [...new Set([...(byGuidance.get(example.rule.guidance) ?? []), example.soundLabel])]);
        const guidance = [...byGuidance].map(([rule, labels]) => `${labels.join(" and ")}: use ${rule}`).join("; ");
        add("severe", "speaking", "MONTHLY_REVIEW_MINIMAL_PAIR_SCOPE", `Minimal pair "${options.join(" / ")}" must contain one of this week's pronunciation examples copied exactly (${exampleWords.map((word) => `"${word}"`).join(", ")}) with its partner. ${guidance}`);
      }
      continue;
    }
    // Round 2: A1–A2 pairs differ by exactly one sound (IPA when both are known,
    // else spelling); B1+ phenomena use the contrast their roadmap item implies.
    const partner = taught.text === spoken(first) ? second : first;
    const issue = monthlyPronunciationContrastIssue(taught.rule, taught.text, partner, { first: ipaByWord.get(taught.text), second: ipaByWord.get(spoken(partner)) });
    if (issue) {
      // December 2026: "team / teem" came back six times on a generic message. Name the item, say why,
      // and give real partners (or another taught example of the same sound when the word has none).
      const sound = contract.sounds.find((candidate) => candidate.id === taught.soundId);
      const advice = sound ? monthlyMinimalPairRepairAdvice(contract.cefr, sound, taught.text, weekExamples.filter((example) => example.soundId === taught.soundId).map((example) => example.text)) : "";
      add("severe", "speaking", "MONTHLY_REVIEW_MINIMAL_PAIR_NOT_MINIMAL", taught.rule.kind === "minimal_pair"
        ? `${label}: "${first} / ${second}" is not a minimal pair${/homophones/u.test(issue) ? ` (${issue})` : ""}: the two words must sound exactly the same except for the week's target sound ${taught.soundLabel}, replaced by one neighbouring sound (e.g. ship / sheep, think / sink, fan / van; never homophones such as team / teem or week / weak). Keep the week example word when it has a real partner and replace the partner word with a real, common English word. ${advice} Update options, answer, audioText and explanation together`.trim()
        : `${label}: "${first} / ${second}" is not a valid contrast for ${taught.soundLabel}: ${issue}. Keep the week example "${taught.text}" and use as partner ${taught.rule.guidance}`);
    }
  }
  if (readAloud.length < 1) add("severe", "speaking", "MONTHLY_REVIEW_READ_ALOUD_MISSING", `Speaking needs 1 read-aloud sentence (passage, no options). ${speakingDetail}`);
  for (const item of readAloud) {
    const used = exampleWords.filter((word) => containsWordForm(spokenPassage(text(item.passage)), word));
    if (exampleWords.length >= 2 && used.length < 2) add("severe", "speaking", "MONTHLY_REVIEW_READ_ALOUD_WORDS", `The read-aloud sentence must be one natural workplace sentence containing at least 2 of this week's pronunciation example words (${exampleWords.join(", ")}); it uses ${used.length ? used.join(", ") : "none"}`);
  }
  if (freeResponse.length < 1) add("severe", "speaking", "MONTHLY_REVIEW_FREE_RESPONSE_MISSING", `Speaking needs 1 free response with requiredWords (week words) and minRequiredWords 2. ${speakingDetail}`);
  for (const item of freeResponse) {
    const required = strings(item.requiredWords).map(normalize);
    const outside = required.filter((word) => !coreWords.map(normalize).includes(word));
    if (outside.length) add("severe", "speaking", "MONTHLY_REVIEW_REQUIRED_WORD_SCOPE", `Free-response requiredWords must only list this week's core words, copied exactly (${coreWords.join(", ")}); remove: ${outside.join(", ")}`);
  }
  // B1+ review sections are English-only (16/11: the listening options/answers too: from B1 they are
  // short English definitions, never Vietnamese meanings). The publication check skips review sections
  // (they use items), so check them here, options and answers included.
  if (!["A1", "A2"].includes(contract.cefr)) {
    for (const code of MONTHLY_REVIEW_SECTIONS) {
      const content = parts.get(code)?.content;
      if (!content) continue;
      const vietnamese = monthlyReviewVietnameseStrings(content);
      if (!vietnamese.length) continue;
      const meaning = code === "listening" ? " Listening options and answers are short simple-English definitions of the week words (e.g. client: \"a person or company that pays for your work\"), never Vietnamese meanings." : "";
      add("severe", code, "MONTHLY_REVIEW_INSTRUCTION_LANGUAGE", `${contract.cefr} review sections must be written in English (prompts, questions, options, answers, explanations, passages).${meaning} Rewrite in English: ${vietnamese.slice(0, 3).map((value) => `"${value.length > 80 ? `${value.slice(0, 80)}…` : value}"`).join("; ")}`);
    }
  }
  return { severe, light };
}

/** Max words of a B1+ listening definition option ("a person or company that pays for your work"). */
export const MONTHLY_REVIEW_DEFINITION_MAX_WORDS = 12;

/**
 * Learner strings of a B1+ review section containing Vietnamese, at any depth, options and answers
 * included. Translation fields (question/answer translations, grammar exampleTranslations) and staff
 * `meaning` fields are Vietnamese by design and never shown at B1+ (13/11: a B1 review failed on
 * grammar.exampleTranslations[1]).
 */
export function monthlyReviewVietnameseStrings(content: Content): string[] {
  const found: string[] = [];
  const visit = (value: unknown, key: string) => {
    if (/meaning$/iu.test(key) || key === "id" || isExerciseTranslationKey(key) || isVietnameseTranslationKey(key)) return;
    // Options and answers are checked by their letters too (a short meaning such as "khách hàng" has no
    // instruction word); prose only by its words, so a Vietnamese name in a passage ("Hương") stays allowed.
    if (typeof value === "string") { if (key === "options" || key === "answer" ? isVietnameseReviewText(value) : containsVietnameseLearnerText(value)) found.push(value.trim()); return; }
    if (Array.isArray(value)) { for (const item of value) visit(item, key === "items" || key === "variants" ? "" : key); return; }
    if (isRecord(value)) for (const [childKey, item] of Object.entries(value)) visit(item, childKey);
  };
  visit(content, "");
  return [...new Set(found)];
}

const VIETNAMESE_LETTERS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu;
/** English words written with accents ("café", "résumé"): never a reason to call a definition Vietnamese. */
const ACCENTED_ENGLISH = /(?<![\p{L}])(?:caf[ée]s?|r[ée]sum[ée]s?|clich[ée]s?|fianc[ée]e?s?|d[ée]j[àa]|prot[ée]g[ée]s?|soir[ée]es?|entr[ée]es?|d[ée]cor|fa[çc]ade|na[ïi]ve|r[ôo]le|cr[êe]pes?|d[ée]but|[àa] la)(?![\p{L}])/giu;

/**
 * Vietnamese in a review option or answer: Vietnamese instruction words, or Vietnamese letters (a short
 * meaning such as "khách hàng" or "mục tiêu" has no instruction word, so word lists alone miss it).
 */
export function isVietnameseReviewText(value: string): boolean {
  return containsVietnameseLearnerText(value) || VIETNAMESE_LETTERS.test(value.normalize("NFC").replace(ACCENTED_ENGLISH, " "));
}

export interface WeekPronunciationExample {
  soundId: string;
  soundLabel: string;
  /** Spoken, normalised text of the example (no "(noun)" notes, lower case). */
  text: string;
  rule: MonthlyPronunciationContrastRule;
}

/** The week's locked pronunciation examples (reviewPronunciationExampleIds) with the contrast rule of their roadmap item. */
export function weekPronunciationExamples(contract: MonthlyCurriculumContract, day: MonthlyDaySpec): WeekPronunciationExample[] {
  const ids = new Set(day.reviewPronunciationExampleIds ?? []);
  return contract.sounds.flatMap((sound) => {
    const examples = sound.examples.filter((example) => ids.has(example.id));
    if (!examples.length) return [];
    const rule = monthlyPronunciationContrastRule(contract.cefr, sound);
    const soundLabel = `${sound.label} ${sound.ipa}`.trim();
    return examples.map((example) => ({ soundId: sound.id, soundLabel, text: spoken(example.word), rule })).filter((example) => Boolean(example.text));
  });
}

/**
 * Prompt text for the two listen-and-choose speaking items: per week sound, the
 * examples to copy and what the partner option must be (A1–A2 minimal pairs,
 * B1+ the contrast the roadmap item implies).
 */
export function monthlyReviewSpeakingContrastGuidance(contract: MonthlyCurriculumContract, day: MonthlyDaySpec): string {
  const bySound = new Map<string, WeekPronunciationExample[]>();
  for (const example of weekPronunciationExamples(contract, day)) bySound.set(example.soundId, [...(bySound.get(example.soundId) ?? []), example]);
  return [...bySound.values()].map((examples) => {
    const base = `${examples[0]!.soundLabel}: one option is one of [${examples.map((example) => `"${example.text}"`).join(", ")}] copied exactly; the other option is ${examples[0]!.rule.guidance}`;
    if (examples[0]!.rule.kind !== "minimal_pair") return base;
    // Name the real partners up front so the model does not reach for a homophone (team / teem).
    const sound = contract.sounds.find((candidate) => candidate.id === examples[0]!.soundId);
    const known = sound ? monthlyMinimalPairPartners(contract.cefr, sound, examples.map((example) => example.text)) : [];
    return known.length ? `${base}; real pairs from these examples: ${known.join(", ")}` : base;
  }).join(". ");
}

/** Words of the week's locked pronunciation examples (reviewPronunciationExampleIds), spoken form, normalised and de-duplicated. */
export function weekPronunciationExampleWords(contract: MonthlyCurriculumContract, day: MonthlyDaySpec): string[] {
  return [...new Set(weekPronunciationExamples(contract, day).map((example) => example.text))];
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
/** Spoken form of an example or option for comparison: no "(noun)" notes, straight apostrophes, normalised. */
function spoken(value: string): string { return normalize(monthlyPronunciationExampleText(value)); }
function spokenPassage(value: string): string { return value.replace(/[’‘]/gu, "'"); }
