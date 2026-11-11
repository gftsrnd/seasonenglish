/**
 * Phoneme-level comparison of a monthly pronunciation target with an example
 * transcription. Shared by resource generation, manual edit and approval so the
 * three gates cannot drift. A plain substring test let /ɪ/ match the diphthong
 * in /saɪn/, /t/ match /tʃ/, and the "final cluster" /st/ match the onset of
 * /ɪkˈstend/; this compares whole phoneme tokens instead.
 */

const MULTI_CHARACTER_PHONEMES = ["tʃ", "dʒ", "aɪ", "eɪ", "ɔɪ", "aʊ", "əʊ", "oʊ", "ɪə", "eə", "ɛə", "ʊə"] as const;
const VOWEL_START = /^[aeiouyæøœɐɑɒɔəɘɛɜɞɤɨɪʉʊʌʏɯɶɵɚɝ]/u;
/** Length marks and diacritics that belong to the preceding phoneme. */
const MODIFIER = /^[ːˑʰʲʷˠˤ̩̯̃̀-ͯ]$/u;
const BOUNDARY = new Set(["ˈ", "ˌ", "."]);

/**
 * Function words usually spoken in a weak form (/ðət/, /həv/, /ən/…). Their
 * strong-form dictionary transcription is not a reliable example of a vowel target.
 */
const WEAK_FORM_WORDS = new Set([
  "a", "an", "the", "and", "but", "or", "as", "at", "for", "from", "of", "to", "than", "that", "there",
  "them", "her", "his", "him", "us", "your", "some", "can", "could", "would", "should", "shall", "will",
  "must", "have", "has", "had", "do", "does", "am", "are", "was", "were", "been"
]);

function stripIpaDelimiters(value: string): string {
  return value.trim().replace(/^[/[]/u, "").replace(/[/\]]$/u, "")
    .replace(/[͡‿]/gu, "")
    // Optional sounds such as the British "(r)" are not evidence of a target.
    .replace(/\([^)]*\)/gu, "")
    .replace(/\s+/gu, "");
}

/** Splits an IPA transcription into phoneme tokens; stress marks and syllable dots are their own tokens. */
export function monthlyIpaPhonemes(value: string): string[] {
  const text = stripIpaDelimiters(value);
  const tokens: string[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    if (BOUNDARY.has(char)) {
      tokens.push(char);
      index += 1;
      continue;
    }
    const multi = MULTI_CHARACTER_PHONEMES.find((phoneme) => text.startsWith(phoneme, index));
    let token = multi ?? char;
    index += token.length;
    while (index < text.length && MODIFIER.test(text[index]!)) {
      token += text[index]!;
      index += 1;
    }
    if (MODIFIER.test(token)) {
      // A stray modifier (e.g. a length mark after a boundary) attaches to the previous phoneme.
      if (tokens.length && !BOUNDARY.has(tokens.at(-1)!)) tokens[tokens.length - 1] += token;
      continue;
    }
    tokens.push(token);
  }
  return tokens;
}

function isVowelToken(token: string | undefined): boolean {
  return Boolean(token && VOWEL_START.test(token));
}

function isConsonantToken(token: string): boolean {
  return !BOUNDARY.has(token) && !isVowelToken(token);
}

/**
 * True when `token` is the weak vowel /ə/. A function word whose only vowel is
 * /ə/ is transcribed in its weak form (/ðət/, /həv/, /tə/).
 */
function isWeakVowelToken(token: string): boolean {
  return token.replace(/[ˑ̩̯̃̀-ͯ]/gu, "") === "ə";
}

/**
 * True when the example transcription contains the target as a contiguous run
 * of whole phonemes. A consonant-cluster target (two or more consonants, e.g.
 * /st/, /nd/, /kt/) is a final/coda cluster and must not be followed by a vowel
 * in the same syllable. A stressed-vowel target (/ˈɪ/) matches when that vowel
 * is the nucleus of the primary-stressed syllable (finance /ˈfɪnəns/, district
 * /ˈdɪstrɪkt/), not only when the stress mark directly precedes it.
 *
 * Weak forms (roadmap: weak forms are a B2 phenomenon): when `word` is given, a
 * function word is not accepted as an example of the weak vowel /ə/, nor when
 * its transcription is a weak form. A function word written in its strong form
 * with the target vowel is a genuine example (that /ðæt/ and have /hæv/ for /æ/).
 */
export function monthlyIpaExampleMatchesTarget(targetIpa: string, exampleIpa: string, word?: string): boolean {
  const target = monthlyIpaPhonemes(targetIpa);
  const example = monthlyIpaPhonemes(exampleIpa);
  if (!target.length || !example.length) return false;
  if (word !== undefined && target.some(isVowelToken) && WEAK_FORM_WORDS.has(word.trim().toLocaleLowerCase("en-US"))) {
    if (target.some((token) => token.startsWith("ə"))) return false;
    const vowels = example.filter(isVowelToken);
    if (vowels.length && vowels.every(isWeakVowelToken)) return false;
  }
  if (target.length === 2 && target[0] === "ˈ" && isVowelToken(target[1])) {
    const shape = monthlyIpaShape(exampleIpa);
    return shape.stressedVowel === target[1];
  }
  const cluster = target.length >= 2 && target.every(isConsonantToken);
  for (let start = 0; start + target.length <= example.length; start += 1) {
    if (!target.every((token, offset) => example[start + offset] === token)) continue;
    if (cluster && isVowelToken(example[start + target.length])) continue;
    return true;
  }
  return false;
}

const SONORANTS = new Set(["l", "r", "n", "m", "ŋ", "w", "j"]);
/** Drops diacritics (keeps the length mark ː, which distinguishes /iː/ from /i/) and folds ɡ→g, ɹ→r. */
export function monthlyIpaBaseToken(token: string): string {
  return token.replace(/[ˑʰʲʷˠˤ̀-ͯ]/gu, "").replace(/ɡ/gu, "g").replace(/ɹ/gu, "r");
}

export interface MonthlyIpaShape {
  /** Phoneme tokens without stress marks or syllable dots, folded by `monthlyIpaBaseToken`. */
  phonemes: string[];
  syllables: number;
  /** 0-based index of the syllable carrying primary stress, or undefined when it cannot be told. */
  stressedSyllable: number | undefined;
  /** The vowel (nucleus) of the stressed syllable. */
  stressedVowel: string | undefined;
}

/** Syllable count and primary-stress position of one word's transcription (syllabic /l n m/ after an obstruent count). */
export function monthlyIpaShape(ipa: string): MonthlyIpaShape {
  const tokens = monthlyIpaPhonemes(ipa);
  const phonemes = tokens.filter((token) => !BOUNDARY.has(token)).map(monthlyIpaBaseToken);
  let syllables = 0;
  let stressedSyllable: number | undefined;
  let stressedVowel: string | undefined;
  let pendingStress = false;
  const nuclei: string[] = [];
  tokens.forEach((token, index) => {
    if (token === "ˈ") { pendingStress = true; return; }
    if (BOUNDARY.has(token)) return;
    const previous = tokens.slice(0, index).filter((item) => !BOUNDARY.has(item)).at(-1);
    const next = tokens.slice(index + 1).find((item) => !BOUNDARY.has(item));
    const syllabicConsonant = /̩/u.test(token)
      || (["l", "n", "m"].includes(monthlyIpaBaseToken(token)) && previous !== undefined && isConsonantToken(previous) && !SONORANTS.has(monthlyIpaBaseToken(previous)) && (next === undefined || isConsonantToken(next)));
    if (!isVowelToken(token) && !syllabicConsonant) return;
    nuclei.push(monthlyIpaBaseToken(token));
    if (pendingStress && stressedSyllable === undefined) { stressedSyllable = syllables; stressedVowel = monthlyIpaBaseToken(token); }
    pendingStress = false;
    syllables += 1;
  });
  if (stressedSyllable === undefined && syllables === 1) { stressedSyllable = 0; stressedVowel = nuclei[0]; }
  return { phonemes, syllables, stressedSyllable, stressedVowel };
}
