export type PronunciationAssetKind = "phoneme" | "word";

export interface PronunciationAssetRecord {
  kind: PronunciationAssetKind;
  key: string;
  id: string;
  url: string;
  localPath?: string;
}

export interface PronunciationAssetRegistry {
  phonemes: Readonly<Record<string, PronunciationAssetRecord>>;
  words: Readonly<Record<string, PronunciationAssetRecord>>;
}

export const DEFAULT_PRONUNCIATION_ASSET_REGISTRY: PronunciationAssetRegistry = {
  phonemes: {},
  words: {}
};

export function createPronunciationAssetRegistry(
  entries: readonly PronunciationAssetRecord[]
): PronunciationAssetRegistry {
  const phonemes: Record<string, PronunciationAssetRecord> = {};
  const words: Record<string, PronunciationAssetRecord> = {};
  for (const entry of entries) {
    if (!entry.key.trim() || !entry.id.trim() || !entry.url.trim()) {
      throw new Error("Pronunciation asset registry entries require key, id, and url");
    }
    const collection = entry.kind === "phoneme" ? phonemes : words;
    if (collection[entry.key]) throw new Error(`Duplicate pronunciation asset: ${entry.kind}:${entry.key}`);
    collection[entry.key] = { ...entry };
  }
  return { phonemes, words };
}

export function isRegisteredPronunciationAssetUrl(
  url: string,
  registry: PronunciationAssetRegistry = DEFAULT_PRONUNCIATION_ASSET_REGISTRY
): boolean {
  return Object.values(registry.phonemes).some((entry) => entry.url === url)
    || Object.values(registry.words).some((entry) => entry.url === url);
}
