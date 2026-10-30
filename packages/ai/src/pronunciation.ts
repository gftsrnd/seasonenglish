import {
  DEFAULT_PRONUNCIATION_ASSET_REGISTRY,
  type PronunciationAssetRegistry
} from "./pronunciation-assets.js";
export { createPronunciationAssetRegistry, isRegisteredPronunciationAssetUrl } from "./pronunciation-assets.js";

export interface PronunciationWordInput {
  word: string;
  ipa: string;
}

export interface CuratedPronunciationPlan {
  focus: string;
  word1: PronunciationWordInput;
  word2: PronunciationWordInput;
  word3: PronunciationWordInput;
}

export interface PronunciationAssets {
  wordAudioUrls: string[];
  warnings: string[];
}

export const CURATED_PHONEME_TARGETS = [
  "p", "b", "t", "d", "k", "g", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "tʃ", "dʒ", "m", "n", "ŋ", "l", "r", "j", "w",
  "ɪ", "iː", "ʊ", "uː", "e", "ə", "ɜː", "ɔː", "æ", "ʌ", "ɑː", "ɒ",
  "eɪ", "aɪ", "ɔɪ", "aʊ", "əʊ", "ɪə", "eə", "ʊə"
] as const;
const CURATED_PHONEME_TARGET_SET: ReadonlySet<string> = new Set(CURATED_PHONEME_TARGETS);

const CURATED_PRONUNCIATION_PLANS: readonly CuratedPronunciationPlan[] = [
  { focus: "/aɪ/", word1: { word: "might", ipa: "/maɪt/" }, word2: { word: "time", ipa: "/taɪm/" }, word3: { word: "clarify", ipa: "/ˈklærɪfaɪ/" } },
  { focus: "/ʊ/", word1: { word: "could", ipa: "/kʊd/" }, word2: { word: "good", ipa: "/ɡʊd/" }, word3: { word: "should", ipa: "/ʃʊd/" } },
  { focus: "/ɪ/", word1: { word: "still", ipa: "/stɪl/" }, word2: { word: "quick", ipa: "/kwɪk/" }, word3: { word: "limit", ipa: "/ˈlɪmɪt/" } },
  { focus: "/w/", word1: { word: "work", ipa: "/wɜːk/" }, word2: { word: "would", ipa: "/wʊd/" }, word3: { word: "week", ipa: "/wiːk/" } },
  { focus: "/ʃ/", word1: { word: "action", ipa: "/ˈækʃn/" }, word2: { word: "share", ipa: "/ʃeə/" }, word3: { word: "finished", ipa: "/ˈfɪnɪʃt/" } },
  { focus: "/f/", word1: { word: "feedback", ipa: "/ˈfiːdbæk/" }, word2: { word: "follow", ipa: "/ˈfɒləʊ/" }, word3: { word: "brief", ipa: "/briːf/" } },
  { focus: "/d/", word1: { word: "deadline", ipa: "/ˈdedlaɪn/" }, word2: { word: "decide", ipa: "/dɪˈsaɪd/" }, word3: { word: "agreed", ipa: "/əˈɡriːd/" } },
  { focus: "/t/", word1: { word: "task", ipa: "/tɑːsk/" }, word2: { word: "update", ipa: "/ˌʌpˈdeɪt/" }, word3: { word: "meeting", ipa: "/ˈmiːtɪŋ/" } }
];

/**
 * Pronunciation selection is curriculum data, not a generative guess. AI still
 * writes the learner guidance, while focus/words/IPA come from this reviewed
 * registry and are varied deterministically by CEFR and day.
 */
export function curatedPronunciationPlan(cefr: string, dayNumber: number): CuratedPronunciationPlan {
  const levelOffset = Math.max(0, ["A1", "A2", "B1", "B2", "C1"].indexOf(cefr));
  const plan = CURATED_PRONUNCIATION_PLANS[(levelOffset + Math.max(1, dayNumber) - 1) % CURATED_PRONUNCIATION_PLANS.length]!;
  return structuredClone(plan);
}

/**
 * Small, reviewed overrides for words that have caused target-sound mistakes.
 * This intentionally is not a general-purpose dictionary or a Kaikki import.
 */
const CURATED_WORD_IPA: Readonly<Record<string, string>> = {
  called: "/kɔːld/",
  cost: "/kɒst/",
  deadline: "/ˈdedlaɪn/",
  feedback: "/ˈfiːdbæk/",
  fine: "/faɪn/",
  have: "/hæv/",
  helpful: "/ˈhelpfəl/",
  hat: "/hæt/",
  man: "/mæn/",
  needed: "/ˈniːdɪd/",
  planned: "/plænd/",
  slipped: "/slɪpt/",
  week: "/wiːk/",
  well: "/wel/",
  work: "/wɜːk/"
};

export function curatedPronunciationWord(word: string, modelIpa: string): PronunciationWordInput {
  const normalizedWord = word.trim().toLocaleLowerCase("en-US");
  return { word: word.trim(), ipa: CURATED_WORD_IPA[normalizedWord] ?? modelIpa.trim() };
}

export function containsTargetPhoneme(ipa: string, targetPhoneme: string): boolean {
  const normalizedIpa = ipa.replaceAll("/", "").replace(/[ˈˌ\s]/gu, "");
  const target = targetPhoneme.replaceAll("/", "").replace(/[ˈˌ\s]/gu, "");
  if (!normalizedIpa || !target || target.length > normalizedIpa.length) return false;
  const vowels = /[aeiouyæɑɒɔəɜɛɪʊʌɐɵœøɞɘɤɨʉɯ]/u;
  let index = normalizedIpa.indexOf(target);
  while (index >= 0) {
    const before = normalizedIpa[index - 1] ?? "";
    const after = normalizedIpa[index + target.length] ?? "";
    if (!vowels.test(target[0] ?? "") || (!vowels.test(before) && !vowels.test(after))) return true;
    index = normalizedIpa.indexOf(target, index + 1);
  }
  return false;
}

export function buildPronunciationAssets(
  targetFocus: string,
  words: readonly PronunciationWordInput[],
  registry: PronunciationAssetRegistry = DEFAULT_PRONUNCIATION_ASSET_REGISTRY
): PronunciationAssets {
  const target = targetFocus.match(/\/([^/]+)\//u)?.[1]?.trim() ?? targetFocus.trim();
  if (!target || words.length !== 3) {
    return { wordAudioUrls: [], warnings: ["Pronunciation requires one target phoneme and exactly three words"] };
  }
  if (!CURATED_PHONEME_TARGET_SET.has(target)) {
    return { wordAudioUrls: [], warnings: [`Unsupported target phoneme /${target}/`] };
  }

  const verifiedWords = words.map((word) => curatedPronunciationWord(word.word, word.ipa));
  const invalidWords = verifiedWords.filter((word) => !containsTargetPhoneme(word.ipa, target));
  if (invalidWords.length > 0) {
    return {
      wordAudioUrls: [],
      warnings: invalidWords.map((word) => `${word.word} does not contain target phoneme /${target}/`)
    };
  }

  const wordAssets = verifiedWords.map((word) => registry.words[audioSlug(word.word)]);
  const missingWords = verifiedWords.filter((word, index) => !wordAssets[index]);
  if (missingWords.length > 0) {
    return {
      wordAudioUrls: [],
      warnings: ["Word audio assets unavailable", ...missingWords.map((word) => `No registered word audio asset exists for ${word.word}`)]
    };
  }
  return {
    wordAudioUrls: wordAssets.map((asset) => asset!.url),
    warnings: []
  };
}

function audioSlug(word: string): string {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "word";
}
