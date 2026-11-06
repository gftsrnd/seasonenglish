/**
 * Attaches a day's planned expanded terms to the lesson's vocabulary cards.
 * The approved plan already decides which synonyms, antonyms, word-family
 * members, umbrella words and collocations belong to each core word, so the
 * lesson shows them deterministically instead of relying on the model to copy
 * them. AI output also uses plain strings for synonyms; cards need { word }.
 */
export interface MonthlyVocabularyCore { id: string; word: string; meaning?: string; type?: string; ipa?: string; imageUrl?: string }
export interface MonthlyVocabularySupport { id: string; word: string; meaning?: string; type?: string; relation: string; relatedCoreTermId?: string }

type Item = Record<string, unknown>;

function asWordEntries(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => typeof entry === "string"
    ? (entry.trim() ? [{ word: entry.trim() }] : [])
    : entry && typeof entry === "object" && typeof (entry as Item).word === "string" ? [entry as Item] : []);
}

function mergeEntries(existing: unknown, planned: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const result = asWordEntries(existing);
  const seen = new Set(result.map((entry) => String(entry.word).toLocaleLowerCase()));
  for (const entry of planned) {
    const key = String(entry.word).toLocaleLowerCase();
    if (!seen.has(key)) { seen.add(key); result.push(entry); }
  }
  return result;
}

export function attachMonthlyExpandedTerms(
  items: readonly unknown[],
  cores: readonly MonthlyVocabularyCore[],
  supports: readonly MonthlyVocabularySupport[]
): Item[] {
  const enriched = attachTerms(items, cores, supports);
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
  supports: readonly MonthlyVocabularySupport[]
): Item[] {
  return items.map((raw) => {
    if (!raw || typeof raw !== "object") return raw as Item;
    const item = { ...(raw as Item) };
    const word = String(item.word ?? "").trim().toLocaleLowerCase();
    const core = cores.find((candidate) => candidate.word.trim().toLocaleLowerCase() === word);
    const linked = (relation: string) => core ? supports.filter((term) => term.relatedCoreTermId === core.id && term.relation === relation) : [];
    item.synonyms = mergeEntries(item.synonyms, linked("synonym").map((term) => ({ word: term.word, ...(term.meaning ? { note: term.meaning } : {}) })));
    item.antonyms = mergeEntries(item.antonyms, linked("antonym").map((term) => ({ word: term.word, ...(term.meaning ? { note: term.meaning } : {}) })));
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
  supports: readonly MonthlyVocabularySupport[]
): T[] {
  return parts.map((part) => part.code === "vocabulary" && Array.isArray(part.content?.items)
    ? { ...part, content: { ...part.content, items: attachMonthlyExpandedTerms(part.content.items as unknown[], cores, supports) } }
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
