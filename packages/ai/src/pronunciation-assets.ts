export type PronunciationAssetKind = "phoneme" | "word";

export interface PronunciationAssetRecord {
  kind: PronunciationAssetKind;
  key: string;
  id: string;
  url: string;
  localPath?: string;
  sha256?: string;
  licence?: string;
  sourceUrl?: string;
}

export interface PronunciationAssetRegistry {
  phonemes: Readonly<Record<string, PronunciationAssetRecord>>;
  words: Readonly<Record<string, PronunciationAssetRecord>>;
}

export const EMPTY_PRONUNCIATION_ASSET_REGISTRY: PronunciationAssetRegistry = {
  phonemes: {},
  words: {}
};

const VERIFIED_PHONEME_ASSETS: readonly PronunciationAssetRecord[] = [
  { kind: "phoneme", key: "æ", id: "phoneme-ae-v1", url: "/media/audio/phonemes/ae.ogg", localPath: "apps/web/public/media/audio/phonemes/ae.ogg", sha256: "f95bf6b3f9ad1daba7c056d46e5fb1920885ddccb68cb4af19eb19ca36d033d7", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Near-open_front_unrounded_vowel.ogg" },
  { kind: "phoneme", key: "aɪ", id: "phoneme-ai-v2", url: "/media/audio/phonemes/ai.ogg", localPath: "apps/web/public/media/audio/phonemes/ai.ogg", sha256: "7a3a70a505356fd642b866f7c9fb69c28b1861a0242a2b385f6fe36c89f78720", licence: "Public domain (PD-self)", sourceUrl: "https://commons.wikimedia.org/wiki/File:En-us-I.ogg" },
  { kind: "phoneme", key: "d", id: "phoneme-d-v1", url: "/media/audio/phonemes/d.ogg", localPath: "apps/web/public/media/audio/phonemes/d.ogg", sha256: "9d833251f2ae491d1173bfa432eb591e998879e84cd2043d4eb6158fcec99269", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Voiced_alveolar_plosive.ogg" },
  { kind: "phoneme", key: "eɪ", id: "phoneme-ei-v1", url: "/media/audio/phonemes/eɪ.ogg", localPath: "apps/web/public/media/audio/phonemes/eɪ.ogg", sha256: "9421662073d8e879c6140d89bd1b496e5a9cbb4c92cebde05b0cc1301923c284", licence: "Public domain (PD-self)", sourceUrl: "https://commons.wikimedia.org/wiki/File:En-us-A.ogg" },
  { kind: "phoneme", key: "f", id: "phoneme-f-v1", url: "/media/audio/phonemes/f.ogg", localPath: "apps/web/public/media/audio/phonemes/f.ogg", sha256: "f1d51888dce8007ca947ce0b66e864c83680dce3d79df93c140dc548c892442a", licence: "CC0 1.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Voiceless_labio-dental_fricative.ogg" },
  { kind: "phoneme", key: "iː", id: "phoneme-i-long-v2", url: "/media/audio/phonemes/i-long.ogg", localPath: "apps/web/public/media/audio/phonemes/i-long.ogg", sha256: "b56dd3aaa59b5a7b1dc61892d1386652d5937fb0eccca8fe8e7faaea6b90b69d", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Close_front_unrounded_vowel.ogg" },
  { kind: "phoneme", key: "ɪ", id: "phoneme-i-short-v1", url: "/media/audio/phonemes/i-short.ogg", localPath: "apps/web/public/media/audio/phonemes/i-short.ogg", sha256: "3c07d0a3b413821a926d46286c7631de22119e5dff24f1971bb46b577cb5cbee", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Near-close_near-front_unrounded_vowel.ogg" },
  { kind: "phoneme", key: "k", id: "phoneme-k-v1", url: "/media/audio/phonemes/k.ogg", localPath: "apps/web/public/media/audio/phonemes/k.ogg", sha256: "5285ace1a53693315f32ad2c5faa9f87efe8690396685562877309a93dd9ecec", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Voiceless_velar_plosive.ogg" },
  { kind: "phoneme", key: "p", id: "phoneme-p-v1", url: "/media/audio/phonemes/p.ogg", localPath: "apps/web/public/media/audio/phonemes/p.ogg", sha256: "576ae283995962f746a390fbc4461c01f6ce1e296c831d7beb9e1907acffa936", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Voiceless_bilabial_plosive.ogg" },
  { kind: "phoneme", key: "r", id: "phoneme-r-v2", url: "/media/audio/phonemes/r.ogg", localPath: "apps/web/public/media/audio/phonemes/r.ogg", sha256: "5b2ba4d556fae42c294ab8e74a3a6076bb477d32eb29b3f96b340d2e88cabef1", licence: "CC BY-SA 3.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Postalveolar_approximant.ogg" },
  { kind: "phoneme", key: "s", id: "phoneme-s-v1", url: "/media/audio/phonemes/s.ogg", localPath: "apps/web/public/media/audio/phonemes/s.ogg", sha256: "8e2922dcfaa4c99bd613fbba331398f696d42ae2b774a7f7deccb9903a5ad580", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Voiceless_alveolar_sibilant.ogg" },
  { kind: "phoneme", key: "t", id: "phoneme-t-v1", url: "/media/audio/phonemes/t.ogg", localPath: "apps/web/public/media/audio/phonemes/t.ogg", sha256: "b67b7ae2c801ce37bc399c68473341ba6eba1e92e9a828a40583c46594f3d0c6", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Voiceless_alveolar_plosive.ogg" },
  { kind: "phoneme", key: "w", id: "phoneme-w-v1", url: "/media/audio/phonemes/w.ogg", localPath: "apps/web/public/media/audio/phonemes/w.ogg", sha256: "070046d6e0b65cb956fc104b294c0abff3004333c1fc1012dcca60c7f77f8fc8", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Voiced_labio-velar_approximant.ogg" },
  { kind: "phoneme", key: "ʃ", id: "phoneme-sh-v1", url: "/media/audio/phonemes/sh.ogg", localPath: "apps/web/public/media/audio/phonemes/sh.ogg", sha256: "4fa609472644ce9cde1722fad82c8caba50f525a235bba6b597aadf83b3a7dd5", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Voiceless_palato-alveolar_sibilant.ogg" },
  { kind: "phoneme", key: "ʌ", id: "phoneme-uh-v1", url: "/media/audio/phonemes/uh.ogg", localPath: "apps/web/public/media/audio/phonemes/uh.ogg", sha256: "db5ef1628a816d4ed2b5a8b7770e443cbcf2736f0ac9268ec5df3043dc9de5b3", licence: "CC BY-SA 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:PR-open-mid_back_unrounded_vowel2.ogg" },
  { kind: "phoneme", key: "θ", id: "phoneme-th-v1", url: "/media/audio/phonemes/th.ogg", localPath: "apps/web/public/media/audio/phonemes/th.ogg", sha256: "4b26723abc71bf8905e0f5b2414f1abc0233f7edf968a095b04a7320fa119b10", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Voiceless_dental_fricative.ogg" },
  { kind: "phoneme", key: "ð", id: "phoneme-dh-v1", url: "/media/audio/phonemes/dh.ogg", localPath: "apps/web/public/media/audio/phonemes/dh.ogg", sha256: "e89b3ec56d6476975aa5ffe7c7c47931e51f3c4cd3ff4b72fb2f76587bfdf058", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Voiced_dental_fricative.ogg" },
  { kind: "phoneme", key: "ɜː", id: "phoneme-er-v1", url: "/media/audio/phonemes/er.ogg", localPath: "apps/web/public/media/audio/phonemes/er.ogg", sha256: "61ef6ef9a16f9b24a3238e13a06d38292bf07b32d8845f962ae5e8480de3e6e3", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:Open-mid_central_unrounded_vowel.ogg" },
  { kind: "phoneme", key: "juː", id: "phoneme-ju-v1", url: "/media/audio/phonemes/ju.ogg", localPath: "apps/web/public/media/audio/phonemes/ju.ogg", sha256: "6ee6fc95197fef69cefae722236ebabd84b4aa6dbe0360fb0f4e820544cfc559", licence: "CC BY-SA 3.0 + GFDL", sourceUrl: "https://commons.wikimedia.org/wiki/File:En-us-u.ogg" }
];

export const DEFAULT_PRONUNCIATION_ASSET_REGISTRY: PronunciationAssetRegistry = createPronunciationAssetRegistry(VERIFIED_PHONEME_ASSETS);

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
