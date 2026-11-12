/**
 * Attaches a day's planned expanded terms to the lesson's vocabulary cards.
 * The approved plan already decides which synonyms, antonyms, word-family
 * members, umbrella words and collocations belong to each core word, so the
 * lesson shows them deterministically instead of relying on the model to copy
 * them. AI output also uses plain strings for synonyms; cards need { word }.
 */
export interface MonthlyVocabularyCore { id: string; word: string; meaning?: string; type?: string; ipa?: string; imageUrl?: string }
export interface MonthlyVocabularySupport {
  id: string; word: string; meaning?: string; type?: string; relation: string; relatedCoreTermId?: string;
  /** B1–C1 synonym/antonym only: a short simple-English definition shown on the card instead of the Vietnamese meaning. */
  definition?: string;
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
  if (englishOnly) return { word: term.word, ...(definition ? { definition } : {}) };
  return { word: term.word, ...(term.meaning ? { note: term.meaning } : {}) };
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
    const siblings = Array.isArray(umbrella.siblings) && umbrella.siblings.length ? umbrella.siblings : enriched
      .filter((other) => other !== item && other && typeof other.umbrella === "object" && String((other.umbrella as Item | null)?.word ?? "").toLocaleLowerCase() === umbrellaWord)
      .map((other) => ({ word: other.word, ...(other.meaning ? { meaning: other.meaning } : {}) }));
    return { ...item, umbrella: { ...umbrella, siblings } };
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
    item.family = mergeEntries(item.family, linked("word_family").map((term) => ({ word: term.word, ...(term.type ? { type: term.type } : {}), ...(term.meaning ? { meaning: term.meaning } : {}) })));
    const collocations = linked("collocation").map((term) => term.word);
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
      // Extra entries in `examples` render as separate "Ví dụ" rows; keep them aligned with the 3 phrases.
      if (!Array.isArray(item.examples) || !item.examples.length || item.examples.length <= 3) item.examples = item.collocations;
    }
    const umbrella = linked("umbrella")[0];
    if (umbrella && !(item.umbrella && typeof item.umbrella === "object")) item.umbrella = { word: umbrella.word, ...(umbrella.meaning ? { meaning: umbrella.meaning } : {}) };
    if (core) {
      // The month's frozen illustration (AI or uploaded) replaces any searched photo.
      if (core.imageUrl) {
        item.imageUrl = core.imageUrl;
        item.imageAttribution = { creator: "E4S (AI minh họa)", licence: "Nội dung nội bộ", licenceUrl: "", sourceUrl: core.imageUrl };
      }
      if (!item.type && core.type) item.type = core.type;
      if (!item.pronunciation && (item.ipa || core.ipa)) item.pronunciation = item.ipa ?? core.ipa;
    }
    return item;
  });
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

/**
 * Review days teach several grammar steps. Each step is shown as its own block,
 * so the grammar part carries `steps: [{ formula, text, examples }]`. When the
 * model did not return them, they are rebuilt from the approved plan.
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
    return { ...part, content: { ...part.content, steps: steps.map((step, index) => {
      const own = fromModel ? existing[index]! : {};
      const ownExamples = list(own.examples);
      return {
        formula: step.formula,
        text: text(own.text) || text(own.usage) || step.usage || step.focus || "",
        examples: (ownExamples.length ? ownExamples : [...(step.examples ?? [])]).slice(0, 2)
      };
    }) } };
  });
}
