export interface PersistedVocabularyGroup {
  umbrella: { word: string; meaning?: string };
  itemWords: string[];
}

export type VocabularyPresentationBlock<T> =
  | { kind: "group"; umbrella: { word: string; meaning?: string }; items: T[] }
  | { kind: "item"; item: T };

/**
 * Turns the API's persisted umbrella projection into render blocks. Older
 * lessons lack `groups`, so their shared umbrella values are grouped here too.
 */
export function vocabularyPresentationBlocks<T extends { word: string; umbrella?: unknown }>(
  items: readonly T[],
  persistedGroups?: unknown
): Array<VocabularyPresentationBlock<T>> {
  const groups = validGroups(persistedGroups, items);
  const byWord = new Map<string, PersistedVocabularyGroup>();
  for (const group of groups) for (const word of group.itemWords) byWord.set(normalize(word), group);
  const emitted = new Set<PersistedVocabularyGroup>();
  const blocks: Array<VocabularyPresentationBlock<T>> = [];
  for (const item of items) {
    const group = byWord.get(normalize(item.word));
    if (!group) {
      blocks.push({ kind: "item", item });
      continue;
    }
    if (emitted.has(group)) continue;
    emitted.add(group);
    const memberWords = new Set(group.itemWords.map(normalize));
    blocks.push({ kind: "group", umbrella: group.umbrella, items: items.filter((candidate) => memberWords.has(normalize(candidate.word))) });
  }
  return blocks;
}

function validGroups<T extends { word: string; umbrella?: unknown }>(persistedGroups: unknown, items: readonly T[]): PersistedVocabularyGroup[] {
  const knownWords = new Set(items.map((item) => normalize(item.word)));
  const stored = Array.isArray(persistedGroups)
    ? persistedGroups.flatMap((value) => parseGroup(value, knownWords))
    : [];
  if (stored.length > 0) return stored;
  const grouped = new Map<string, PersistedVocabularyGroup>();
  for (const item of items) {
    const umbrella = record(item.umbrella);
    const word = text(umbrella?.word);
    if (!word) continue;
    const key = normalize(word);
    const group = grouped.get(key) ?? { umbrella: { word, ...(text(umbrella?.meaning) ? { meaning: text(umbrella?.meaning) } : {}) }, itemWords: [] };
    group.itemWords.push(item.word);
    grouped.set(key, group);
  }
  return [...grouped.values()].filter((group) => group.itemWords.length > 1);
}

function parseGroup(value: unknown, knownWords: ReadonlySet<string>): PersistedVocabularyGroup[] {
  const group = record(value);
  const umbrella = record(group?.umbrella);
  const word = text(umbrella?.word);
  const itemWords = Array.isArray(group?.itemWords)
    ? group.itemWords.filter((item): item is string => typeof item === "string" && knownWords.has(normalize(item)))
    : [];
  return word && itemWords.length > 1
    ? [{ umbrella: { word, ...(text(umbrella?.meaning) ? { meaning: text(umbrella?.meaning) } : {}) }, itemWords }]
    : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}
