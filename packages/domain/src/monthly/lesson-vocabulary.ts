/**
 * Attaches a day's planned expanded terms to the lesson's vocabulary cards.
 * The approved plan already decides which synonyms, antonyms, word-family
 * members, umbrella words and collocations belong to each core word, so the
 * lesson shows them deterministically instead of relying on the model to copy
 * them. AI output also uses plain strings for synonyms; cards need { word }.
 */
import { monthlyRegisterLexicalDetails, monthlyRegisterTermsApply, validMonthlyRegisterTerms, type MonthlyRegisterTerm } from "./register-terms.js";
import { checkMonthlyGrammarStep, monthlyGrammarFormulaRows } from "./grammar-formula-examples.js";

export interface MonthlyVocabularyCore {
  id: string; word: string; meaning?: string; type?: string; ipa?: string; imageUrl?: string;
  /** L-042, B1–C1: audited slang / formal-register alternatives, shown as lexical details ("Khẩu ngữ" / "Văn phong"). */
  registerTerms?: readonly MonthlyRegisterTerm[] | undefined;
}
export interface MonthlyVocabularySupport {
  id: string; word: string; meaning?: string; type?: string; relation: string; relatedCoreTermId?: string;
  /** B1–C1 synonym/antonym (required) and umbrella/word-family (when the plan has it): a short simple-English definition shown instead of the Vietnamese meaning. */
  definition?: string;
  /** British IPA of the support word when the plan has it (plans before 13/11 carry none). */
  ipa?: string;
}

type Item = Record<string, unknown>;

function asWordEntries(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => typeof entry === "string"
    ? (entry.trim() ? [{ word: entry.trim() }] : [])
    : entry && typeof entry === "object" && typeof (entry as Item).word === "string" ? [entry as Item] : []);
}

function mergeEntries(
  existing: unknown,
  planned: Array<Record<string, unknown>>,
  /** Synonym/antonym lists with a level: an unplanned model entry is kept only with the level's meaning (see {@link modelRelationEntry}). */
  unplanned?: (entry: Record<string, unknown>) => Record<string, unknown> | undefined
): Array<Record<string, unknown>> {
  const plannedKeys = new Set(planned.map((entry) => String(entry.word).toLocaleLowerCase()));
  const result = asWordEntries(existing).flatMap((entry) => {
    if (!unplanned || plannedKeys.has(String(entry.word).toLocaleLowerCase())) return [{ ...entry }];
    const kept = unplanned(entry);
    return kept ? [kept] : [];
  });
  const byKey = new Map(result.map((entry) => [String(entry.word).toLocaleLowerCase(), entry]));
  for (const entry of planned) {
    const key = String(entry.word).toLocaleLowerCase();
    const current = byKey.get(key);
    if (!current) { byKey.set(key, entry); result.push(entry); continue; }
    // The model may list a planned word itself (as a plain string): keep its
    // entry but add the plan's meaning/definition it lacks.
    for (const [field, value] of Object.entries(entry)) if (current[field] === undefined) current[field] = value;
  }
  return result;
}

/**
 * The meaning a synonym/antonym card entry carries (product decision 12/11):
 * A1–A2 the plan's Vietnamese meaning as `note`; B1–C1 only the plan's short
 * English `definition` (no Vietnamese from B1). Without a level (older callers)
 * the Vietnamese meaning is kept as before.
 */
function relationEntry(term: MonthlyVocabularySupport, cefr: string | undefined): Record<string, unknown> {
  const englishOnly = cefr === "B1" || cefr === "B2" || cefr === "C1";
  const definition = term.definition?.trim();
  const ipa = term.ipa?.trim();
  if (englishOnly) return { word: term.word, ...(definition ? { definition } : {}), ...(ipa ? { pronunciation: ipa } : {}) };
  return { word: term.word, ...(term.meaning ? { note: term.meaning } : {}), ...(ipa ? { pronunciation: ipa } : {}) };
}

/**
 * A planned word-family / umbrella word for the shared slang-style modal card
 * (13/11): word, part of speech, IPA and the Vietnamese meaning; B1–C1 also the
 * plan's English definition (learners from B1 read only that, never the
 * Vietnamese meaning). Plans without IPA / definition simply leave them out.
 */
function relationWordEntry(term: MonthlyVocabularySupport, cefr: string | undefined): Record<string, unknown> {
  const englishOnly = cefr === "B1" || cefr === "B2" || cefr === "C1";
  const definition = term.definition?.trim();
  const ipa = term.ipa?.trim();
  return { word: term.word, ...(term.type ? { type: term.type } : {}), ...(ipa ? { pronunciation: ipa } : {}), ...(term.meaning ? { meaning: term.meaning } : {}), ...(englishOnly && definition ? { definition } : {}) };
}

/**
 * A synonym/antonym the lesson model added beyond the plan (12/11): the card
 * shows a meaning next to every such chip, so the entry is kept only when the
 * model gave the level's meaning — A1–A2 a Vietnamese `note` (or `meaning`),
 * B1–C1 a short simple-English `definition` that passes
 * {@link monthlyRelationMeaningIssue} (its Vietnamese note is dropped). An entry
 * without one is removed rather than shown without a meaning.
 */
export function monthlyModelRelationEntry(entry: Record<string, unknown>, relation: "synonym" | "antonym", cefr: string): Record<string, unknown> | undefined {
  const word = typeof entry.word === "string" ? entry.word.trim() : "";
  if (!word) return undefined;
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  if (cefr === "A1" || cefr === "A2") {
    const note = text(entry.note) || text(entry.meaning);
    if (monthlyRelationMeaningIssue(cefr, { word, relation, meaning: note })) return undefined;
    const { meaning: _meaning, ...rest } = entry;
    return { ...rest, word, note };
  }
  const definition = text(entry.definition);
  if (monthlyRelationMeaningIssue(cefr, { word, relation, definition })) return undefined;
  const { note: _note, meaning: _meaning, ...rest } = entry;
  return { ...rest, word, definition };
}

const MONTHLY_CARD_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1"]);

/** Longest synonym/antonym definition (B1–C1), in words and characters. */
export const MONTHLY_RELATION_DEFINITION_MAX_WORDS = 14;
export const MONTHLY_RELATION_DEFINITION_MAX_CHARS = 100;
const VIETNAMESE_MEANING_LETTER = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹàáèéìíòóùúý]/iu;

/**
 * Gate for the meaning a synonym/antonym support carries (12/11). A1–A2: the
 * `meaning` is a Vietnamese gloss. B1–C1: a short `definition` in simple
 * English (no Vietnamese) is required as well; the Vietnamese `meaning` stays
 * for staff screens only. Other relations are not checked. Returns the
 * problem, or undefined when the support is fine.
 */
export function monthlyRelationMeaningIssue(
  cefr: string,
  support: { word: string; relation: string; meaning?: string | undefined; definition?: string | undefined }
): string | undefined {
  if (support.relation !== "synonym" && support.relation !== "antonym") return undefined;
  if (cefr === "A1" || cefr === "A2") {
    // Some Vietnamese glosses carry no diacritic (nhanh, tin), so only a missing meaning fails here.
    return support.meaning?.trim() ? undefined : `the ${support.relation} needs a short Vietnamese meaning at ${cefr}`;
  }
  const definition = support.definition?.trim() ?? "";
  if (!definition) return `the ${support.relation} needs a short simple-English definition at ${cefr}`;
  if (VIETNAMESE_MEANING_LETTER.test(definition)) return `the ${support.relation} definition must be simple English with no Vietnamese at ${cefr}`;
  const words = definition.split(/\s+/u).filter(Boolean).length;
  if (words < 2 || words > MONTHLY_RELATION_DEFINITION_MAX_WORDS || definition.length > MONTHLY_RELATION_DEFINITION_MAX_CHARS) return `the ${support.relation} definition must be 2–${MONTHLY_RELATION_DEFINITION_MAX_WORDS} words (at most ${MONTHLY_RELATION_DEFINITION_MAX_CHARS} characters)`;
  const own = support.word.trim().toLocaleLowerCase("en-US");
  if (own && ` ${definition.toLocaleLowerCase("en-US").replace(/[^\p{L}\s'-]/gu, " ")} `.includes(` ${own} `)) return `the ${support.relation} definition must not use the word "${support.word}" itself`;
  return undefined;
}

/** "a quick check" and "quick check" are the same phrase. */
function collocationKey(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/^(?:a|an|the)\s+/u, "").replace(/\s+/gu, " ");
}

/** Longest Vietnamese line for one collocation (A1–A2 popup). */
export const MONTHLY_COLLOCATION_TRANSLATION_MAX_CHARS = 80;

/**
 * Gate for a vocabulary card's collocation translations (12/11): A1–A2 cards
 * show a translate icon on each common phrase, so `collocationTranslations`
 * holds one short Vietnamese line per `collocations` entry, same order; the
 * phrases stay English (audio reads them). B1+ cards carry none. Returns the
 * problems (empty when fine).
 */
export function monthlyCollocationTranslationIssues(cefr: string, collocations: readonly unknown[], translations: unknown): string[] {
  const phrases = collocations.filter((phrase): phrase is string => typeof phrase === "string" && Boolean(phrase.trim()));
  const list = Array.isArray(translations) ? translations : undefined;
  if (cefr !== "A1" && cefr !== "A2") {
    return list?.some((line) => typeof line === "string" && line.trim()) ? [`collocationTranslations must be omitted at ${cefr} (no Vietnamese translations from B1)`] : [];
  }
  if (!phrases.length) return [];
  if (!list || list.length !== phrases.length) return [`collocationTranslations must give one short Vietnamese meaning per collocation, same order (${phrases.length} expected, received ${list?.length ?? 0})`];
  const issues: string[] = [];
  list.forEach((line, index) => {
    const value = typeof line === "string" ? line.trim() : "";
    if (!value || value.toLocaleLowerCase("en-US") === phrases[index]!.trim().toLocaleLowerCase("en-US")) issues.push(`collocationTranslations[${index}] must be the Vietnamese meaning of "${phrases[index]}"`);
    else if (value.length > MONTHLY_COLLOCATION_TRANSLATION_MAX_CHARS) issues.push(`collocationTranslations[${index}] must be short (at most ${MONTHLY_COLLOCATION_TRANSLATION_MAX_CHARS} characters)`);
  });
  return issues;
}

export function attachMonthlyExpandedTerms(
  items: readonly unknown[],
  cores: readonly MonthlyVocabularyCore[],
  supports: readonly MonthlyVocabularySupport[],
  /** Month level: decides whether synonym/antonym entries carry the Vietnamese meaning (A1–A2) or the English definition (B1+). */
  cefr?: string
): Item[] {
  const enriched = attachTerms(items, cores, supports, cefr);
  // Umbrella cards list the other words under the same umbrella; the modal needs a siblings array.
  return enriched.map((item) => {
    const umbrella = item && typeof item.umbrella === "object" && item.umbrella ? item.umbrella as Item : null;
    if (!umbrella) return item;
    const umbrellaWord = String(umbrella.word ?? "").toLocaleLowerCase();
    const siblings = Array.isArray(umbrella.siblings) && umbrella.siblings.length ? withCoreIpa(asWordEntries(umbrella.siblings), cores) : enriched
      .filter((other) => other !== item && other && typeof other.umbrella === "object" && String((other.umbrella as Item | null)?.word ?? "").toLocaleLowerCase() === umbrellaWord)
      .map((other) => ({ word: other.word, ...(other.type ? { type: other.type } : {}), ...(other.pronunciation ? { pronunciation: other.pronunciation } : {}), ...(other.meaning ? { meaning: other.meaning } : {}), ...(typeof other.definition === "string" && other.definition.trim() ? { definition: other.definition.trim() } : {}) }));
    return { ...item, umbrella: { ...umbrella, siblings } };
  });
}

/**
 * Family / umbrella words have no IPA of their own (support terms carry none);
 * when such a word is also one of the month's core words, its audited IPA is
 * shown. Nothing is invented: other words stay without IPA.
 */
function withCoreIpa(entries: Item[], cores: readonly MonthlyVocabularyCore[]): Item[] {
  return entries.map((entry) => {
    if (typeof entry.pronunciation === "string" && entry.pronunciation.trim()) return entry;
    const key = String(entry.word ?? "").trim().toLocaleLowerCase();
    const type = typeof entry.type === "string" ? entry.type.trim().toLocaleLowerCase() : "";
    // Same spelling and, when both say it, the same part of speech (a homograph may sound different).
    const ipa = cores.find((core) => core.word.trim().toLocaleLowerCase() === key && (!type || !core.type?.trim() || core.type.trim().toLocaleLowerCase() === type))?.ipa?.trim();
    return ipa ? { ...entry, pronunciation: ipa } : entry;
  });
}

function attachTerms(
  items: readonly unknown[],
  cores: readonly MonthlyVocabularyCore[],
  supports: readonly MonthlyVocabularySupport[],
  cefr: string | undefined
): Item[] {
  return items.map((raw) => {
    if (!raw || typeof raw !== "object") return raw as Item;
    const item = { ...(raw as Item) };
    const word = String(item.word ?? "").trim().toLocaleLowerCase();
    const core = cores.find((candidate) => candidate.word.trim().toLocaleLowerCase() === word);
    const linked = (relation: string) => core ? supports.filter((term) => term.relatedCoreTermId === core.id && term.relation === relation) : [];
    // With a month level, a synonym/antonym the model added beyond the plan stays only with its level meaning.
    const unplanned = (relation: "synonym" | "antonym") => core && cefr && MONTHLY_CARD_LEVELS.has(cefr) ? (entry: Item) => monthlyModelRelationEntry(entry, relation, cefr) : undefined;
    item.synonyms = mergeEntries(item.synonyms, linked("synonym").map((term) => relationEntry(term, cefr)), unplanned("synonym"));
    item.antonyms = mergeEntries(item.antonyms, linked("antonym").map((term) => relationEntry(term, cefr)), unplanned("antonym"));
    item.family = withCoreIpa(mergeEntries(item.family, linked("word_family").map((term) => relationWordEntry(term, cefr))), cores);
    const plannedCollocations = linked("collocation");
    const collocations = plannedCollocations.map((term) => term.word);
    // A1–A2: one Vietnamese line per phrase, aligned with collocations (planned phrases take the plan's meaning).
    const modelTranslations = new Map<string, string>();
    {
      const modelPhrases = Array.isArray(item.collocations) ? item.collocations : [];
      const modelLines = Array.isArray(item.collocationTranslations) ? item.collocationTranslations : [];
      modelPhrases.forEach((phrase, index) => {
        const line = modelLines[index];
        if (typeof phrase === "string" && typeof line === "string" && line.trim()) modelTranslations.set(collocationKey(phrase), line.trim());
      });
    }
    if (collocations.length) {
      // Cards show exactly 3 phrases: planned collocations first, then the model's,
      // treating "a quick check" and "quick check" as the same phrase.
      const current = Array.isArray(item.collocations) ? item.collocations.filter((value): value is string => typeof value === "string") : [];
      const phraseKey = (value: string) => value.trim().toLocaleLowerCase().replace(/^(?:a|an|the)\s+/u, "").replace(/\s+/gu, " ");
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const phrase of [...collocations, ...current]) {
        const key = phraseKey(phrase);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(phrase.trim());
      }
      item.collocations = merged.slice(0, 3);
      for (const term of plannedCollocations) if (term.meaning?.trim()) modelTranslations.set(collocationKey(term.word), term.meaning.trim());
      // Extra entries in `examples` render as separate "Ví dụ" rows; keep them aligned with the 3 phrases.
      if (!Array.isArray(item.examples) || !item.examples.length || item.examples.length <= 3) item.examples = item.collocations;
    }
    if (cefr && MONTHLY_CARD_LEVELS.has(cefr)) {
      const phrases = Array.isArray(item.collocations) ? item.collocations.filter((value): value is string => typeof value === "string") : [];
      const lines = phrases.map((phrase) => modelTranslations.get(collocationKey(phrase)) ?? "");
      // Collocation translations are A1–A2 only and complete (one per phrase); otherwise the card shows none.
      if ((cefr === "A1" || cefr === "A2") && phrases.length && lines.every(Boolean)) item.collocationTranslations = lines;
      else delete item.collocationTranslations;
    }
    const umbrella = linked("umbrella")[0];
    if (umbrella && !(item.umbrella && typeof item.umbrella === "object")) item.umbrella = relationWordEntry(umbrella, cefr);
    else if (umbrella && item.umbrella && typeof item.umbrella === "object") {
      // The model wrote its own umbrella: keep it, add the plan's type / IPA / definition it lacks.
      const current = item.umbrella as Item;
      if (String(current.word ?? "").trim().toLocaleLowerCase() === umbrella.word.trim().toLocaleLowerCase()) {
        const planned = relationWordEntry(umbrella, cefr);
        item.umbrella = { ...current, ...Object.fromEntries(Object.entries(planned).filter(([field]) => current[field] === undefined)) };
      }
    }
    if (item.umbrella && typeof item.umbrella === "object") item.umbrella = withCoreIpa([item.umbrella as Item], cores)[0];
    if (core) {
      // The month's frozen illustration (AI or uploaded) replaces any searched photo.
      if (core.imageUrl) {
        item.imageUrl = core.imageUrl;
        item.imageAttribution = { creator: "E4S (AI minh họa)", licence: "Nội dung nội bộ", licenceUrl: "", sourceUrl: core.imageUrl };
      }
      if (!item.type && core.type) item.type = core.type;
      if (!item.pronunciation && (item.ipa || core.ipa)) item.pronunciation = item.ipa ?? core.ipa;
      if (cefr && monthlyRegisterTermsApply(cefr)) attachRegisterDetails(item, core, cefr);
    }
    return item;
  });
}

/**
 * L-042 (B1–C1): the card's slang/formal lexical details come only from the
 * approved plan's audited register alternatives. A slang/poetic detail the
 * lesson model wrote itself was never audited and is removed; synonym/antonym
 * details are untouched. No register alternative means no such detail.
 */
function attachRegisterDetails(item: Item, core: MonthlyVocabularyCore, cefr: string): void {
  const hadDetails = Array.isArray(item.lexicalDetails);
  const own = hadDetails ? (item.lexicalDetails as unknown[]).filter((detail) => !(detail && typeof detail === "object" && ["slang", "poetic"].includes(String((detail as Item).kind)))) : [];
  const details = [...own, ...monthlyRegisterLexicalDetails(validMonthlyRegisterTerms(core, cefr), core)];
  if (details.length) item.lexicalDetails = details;
  else if (hadDetails && (item.lexicalDetails as unknown[]).length) delete item.lexicalDetails;
}

/** Applies {@link attachMonthlyExpandedTerms} to a lesson's vocabulary part, leaving other parts untouched. */
export function withMonthlyExpandedTerms<T extends { code?: string; content?: Record<string, unknown> }>(
  parts: readonly T[],
  cores: readonly MonthlyVocabularyCore[],
  supports: readonly MonthlyVocabularySupport[],
  cefr?: string
): T[] {
  return parts.map((part) => part.code === "vocabulary" && Array.isArray(part.content?.items)
    ? { ...part, content: { ...part.content, items: attachMonthlyExpandedTerms(part.content.items as unknown[], cores, supports, cefr) } }
    : part);
}

export interface MonthlyGrammarStepSource { formula: string; usage?: string; focus?: string; examples?: readonly string[] }

/** The model's top-level grammar examples that use a readable row of a step formula (in order), with their indexes. */
function topLevelExamplesForStep(formula: string, examples: readonly string[]): Array<{ example: string; index: number }> {
  if (!examples.length) return [];
  const used = new Set(checkMonthlyGrammarStep(formula, examples).rows.flatMap((row) => row.exampleIndexes));
  return examples.flatMap((example, index) => used.has(index) ? [{ example, index }] : []);
}

/**
 * The top-level marks of examples moved into a step, renumbered to the step formula's rows (a row is
 * matched by its text). Undefined unless every moved example keeps a mark whose row the step has.
 */
function stepMarksFromTopLevel(topFormula: unknown, stepFormula: string, marks: unknown, indexes: readonly number[]): unknown[] | undefined {
  if (!Array.isArray(marks) || typeof topFormula !== "string" || !indexes.length) return undefined;
  const topRows = monthlyGrammarFormulaRows(topFormula);
  const stepRows = monthlyGrammarFormulaRows(stepFormula);
  const moved = indexes.map((index) => {
    const entry = marks[index] as { row?: unknown; marks?: unknown } | undefined;
    const row = entry && typeof entry.row === "number" ? stepRows.indexOf(topRows[entry.row - 1] ?? "\u0000") + 1 : 0;
    return row > 0 ? { ...entry, row } : undefined;
  });
  return moved.every(Boolean) ? moved : undefined;
}

/**
 * Review days teach several grammar steps. Each step is shown as its own block,
 * so the grammar part carries `steps: [{ formula, text, examples }]`.
 *
 * The approved plan (month resources) locks only each step's formula and the
 * step structure. The examples are the lesson model's own (B1 2026-12: copying
 * the first two resource examples left a 2–3-row formula with examples for
 * row 1 only): every example the model wrote for the step is kept; when it
 * wrote none for a step, the step takes the model's top-level grammar.examples
 * that use a row of that step's formula. The resource examples are style
 * references for the model only and are never copied into the lesson, so a
 * step can stay without examples (the formula/example check then asks for a
 * grammar repair).
 */
export function withMonthlyGrammarSteps<T extends { code?: string; content?: Record<string, unknown> }>(parts: readonly T[], steps: readonly MonthlyGrammarStepSource[]): T[] {
  if (steps.length < 2) return [...parts];
  return parts.map((part) => {
    if (part.code !== "grammar" || !part.content) return part;
    // Formulas always come verbatim from the plan (the quality gate checks them);
    // the model contributes the per-step explanation and examples when it returned one entry per step.
    const existing = Array.isArray(part.content.steps)
      ? part.content.steps.filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === "object")
      : [];
    const fromModel = existing.length === steps.length;
    const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
    const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
    const topLevel = list(part.content.examples);
    // Marks are index-aligned with the raw top-level list, blanks included.
    const rawTopLevel = Array.isArray(part.content.examples) ? part.content.examples : [];
    const rawIndex = rawTopLevel.flatMap((item, index) => typeof item === "string" && item.trim() ? [index] : []);
    return { ...part, content: { ...part.content, steps: steps.map((step, index) => {
      const own = fromModel ? existing[index]! : {};
      const ownExamples = list(own.examples);
      const fromTopLevel = ownExamples.length ? [] : topLevelExamplesForStep(step.formula, topLevel);
      // The model's row/word marks (13/11) travel with its examples; plan reference examples carry none.
      const marks = ownExamples.length ? (Array.isArray(own.exampleMarks) && Array.isArray(own.examples) ? own.examples.flatMap((item, at) => typeof item === "string" && item.trim() ? [(own.exampleMarks as unknown[])[at] ?? null] : []) : undefined)
        : fromTopLevel.length ? stepMarksFromTopLevel(part.content!.formula, step.formula, part.content!.exampleMarks, fromTopLevel.map((item) => rawIndex[item.index]!)) : undefined;
      // Last resort (13/11, B1 24/12): a step must never render with no example at all, so when the model
      // gave none for it, the plan's reference examples (which cover every row) are shown instead.
      return {
        formula: step.formula,
        text: text(own.text) || text(own.usage) || step.usage || step.focus || "",
        examples: ownExamples.length ? ownExamples : fromTopLevel.length ? fromTopLevel.map((item) => item.example) : [...(step.examples ?? [])],
        ...(marks ? { exampleMarks: marks } : {})
      };
    }) } };
  });
}
