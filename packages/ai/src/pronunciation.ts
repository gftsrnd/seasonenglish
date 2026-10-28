export interface PronunciationWordInput {
  word: string;
  ipa: string;
}

export interface PronunciationAssets {
  phonemeAudioId?: string;
  phonemeAudioUrl?: string;
  wordAudioUrls: string[];
  warnings: string[];
}

const CURATED_PHONEME_ASSETS = new Set([
  "æ", "aɪ", "d", "eɪ", "f", "iː", "ɪ", "k", "p", "s", "t", "w", "ʃ", "ʌ", "θ", "ð", "ɜː"
]);

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
  words: readonly PronunciationWordInput[]
): PronunciationAssets {
  const target = targetFocus.match(/\/([^/]+)\//u)?.[1]?.trim() ?? targetFocus.trim();
  if (!target || words.length !== 3) {
    return { wordAudioUrls: [], warnings: ["Pronunciation requires one target phoneme and exactly three words"] };
  }
  if (!CURATED_PHONEME_ASSETS.has(target)) {
    return { wordAudioUrls: [], warnings: [`No curated phoneme asset exists for /${target}/`] };
  }

  const verifiedWords = words.map((word) => curatedPronunciationWord(word.word, word.ipa));
  const invalidWords = verifiedWords.filter((word) => !containsTargetPhoneme(word.ipa, target));
  if (invalidWords.length > 0) {
    return {
      wordAudioUrls: [],
      warnings: invalidWords.map((word) => `${word.word} does not contain target phoneme /${target}/`)
    };
  }

  const phonemeAudioId = `phoneme-${target}`;
  return {
    phonemeAudioId,
    phonemeAudioUrl: `/media/audio/phonemes/${target}.wav`,
    wordAudioUrls: verifiedWords.map((word) => `/media/audio/words/${audioSlug(word.word)}.mp3`),
    warnings: []
  };
}

function audioSlug(word: string): string {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "word";
}
