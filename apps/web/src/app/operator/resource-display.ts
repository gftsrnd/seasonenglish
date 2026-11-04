export type VocabularyDisplayItem = {
  id: string;
  word: string;
  meaning: string;
  type?: string;
  ipa?: string;
};

export function groupVocabularyForDisplay<T extends VocabularyDisplayItem>(items: readonly T[]): { standalone: T[]; phrases: T[] } {
  const standalone: T[] = [];
  const phrases: T[] = [];
  for (const item of items) {
    if (isStandaloneWord(item.word)) standalone.push(item);
    else phrases.push(item);
  }
  return { standalone, phrases };
}

export function isStandaloneWord(value: string): boolean {
  return /^[a-z]+(?:-[a-z]+)?$/i.test(value.trim());
}
