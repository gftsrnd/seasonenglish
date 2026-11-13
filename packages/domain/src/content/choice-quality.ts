/**
 * Lexical heuristics for generated choice items and learner-facing text
 * (AI quality plan 11/11, WP3/WP7/WP8). These are deterministic checks without
 * a dictionary: curated lists of forms that are never valid English, vulgar
 * words, word-class labels and internal planning wording.
 */

const WORD_CLASS_LABELS = new Set([
  "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "determiner", "article", "interjection",
  "nouns", "verbs", "adjectives", "adverbs",
  "danh từ", "động từ", "tính từ", "trạng từ", "đại từ", "giới từ", "liên từ", "mạo từ"
]);

/** HV-R49: a Word form task must not ask for the word class / part of speech. */
export function mentionsWordClass(prompt: string): boolean {
  return /\bword[\s-]*class(?:es)?\b|\bparts?[\s-]+of[\s-]+speech\b|\bwhat\s+type\s+of\s+word\b/iu.test(prompt)
    || /từ\s+loại|loại\s+từ/iu.test(prompt.normalize("NFC"));
}

/** True when every option is a grammatical label (noun/verb/…), i.e. the task asks for a word class. */
export function optionsAreWordClassLabels(options: readonly string[]): boolean {
  return options.length > 0 && options.every((option) => WORD_CLASS_LABELS.has(option.normalize("NFC").toLocaleLowerCase("vi").replace(/[.\s]+$/u, "").trim()));
}

/** Words given as a bracketed hint in a prompt, e.g. "Please send the ____ (document)." -> ["document"]. */
export function bracketHintWords(prompt: string): string[] {
  return [...prompt.matchAll(/\(([^()]{1,40})\)/gu)].map((match) => match[1]!.trim().toLocaleLowerCase("en-US")).filter(Boolean);
}

/** Irregular verbs whose regularised forms (sended, maked…) are invented, never valid English. */
const IRREGULAR_BASES = [
  "send", "make", "give", "have", "go", "take", "buy", "bring", "think", "write", "speak", "meet", "pay", "say", "tell",
  "find", "get", "know", "see", "begin", "choose", "build", "spend", "lend", "feel", "keep", "lose", "hold", "sell",
  "teach", "catch", "understand", "run", "come", "become", "do", "drive", "grow", "draw", "read", "set", "cut", "hit",
  "let", "stand", "win", "wear", "break", "forget", "eat", "drink", "swim", "sleep", "fly", "throw", "ride", "rise",
  "shake", "steal", "hide", "bite", "fight", "seek", "mean", "shut", "spread", "hurt", "leave", "sit"
];
/** Nouns that do not take verb or adverb suffixes (feedbacked, colleagued…). */
const NOUN_ONLY_BASES = [
  "feedback", "colleague", "deadline", "information", "advice", "equipment", "teamwork", "knowledge", "homework",
  "furniture", "luggage", "client", "manager"
];
/** Adjectives that do not take verb suffixes (accurating…). */
const ADJECTIVE_ONLY_BASES = ["accurate", "careful", "useful", "polite", "helpful", "important", "necessary", "difficult"];
/** Generated forms that happen to be real English words. */
const REAL_WORDS = new Set(["seed", "sited", "singed", "wined", "leaved"]);
const EXPLICIT_INVENTED = ["haves", "revisely", "updately", "confirmly", "colleagueship", "gooder", "badder", "childs", "womans", "mens"];

const INVENTED_FORMS: ReadonlySet<string> = (() => {
  const forms = new Set<string>(EXPLICIT_INVENTED);
  const consonant = /[bcdfghjklmnpqrstvwxz]$/u;
  for (const base of IRREGULAR_BASES) {
    forms.add(`${base}ed`);
    if (base.endsWith("e")) forms.add(`${base}d`);
    if (consonant.test(base)) forms.add(`${base}${base.at(-1)}ed`);
  }
  for (const base of [...NOUN_ONLY_BASES, ...ADJECTIVE_ONLY_BASES]) {
    const stem = base.endsWith("e") ? base.slice(0, -1) : base;
    for (const form of [`${base}ed`, `${stem}ed`, `${base}ing`, `${stem}ing`]) forms.add(form);
    if (NOUN_ONLY_BASES.includes(base)) forms.add(`${base}ly`);
  }
  for (const word of REAL_WORDS) forms.delete(word);
  return forms;
})();

function englishTokens(value: string): string[] {
  return value.toLocaleLowerCase("en-US").match(/[a-z]+/gu) ?? [];
}

/** Invented word forms in a string (sended, maked, feedbacked, accurating…). */
export function inventedWordForms(value: string): string[] {
  return [...new Set(englishTokens(value).filter((token) => INVENTED_FORMS.has(token)))];
}

const OFFENSIVE_WORDS = new Set([
  "shit", "shitty", "fuck", "fucking", "fucked", "bitch", "cunt", "dick", "cock", "pussy", "whore", "slut", "bastard",
  "asshole", "arse", "piss", "pissed", "crap", "nigger", "nigga", "fag", "faggot", "retard", "twat", "wanker", "bollocks",
  "tits", "porn", "rape", "cum", "jizz", "dildo", "boob", "boobs", "penis", "vagina"
]);

/** Vulgar or offensive words in a string (whole-word match). */
export function offensiveWords(value: string): string[] {
  return [...new Set(englishTokens(value).filter((token) => OFFENSIVE_WORDS.has(token)))];
}

/** True when the answer is strictly longer than every other option (a give-away cue). */
export function answerIsUniqueLongestOption(options: readonly string[], answer: string): boolean {
  const wanted = answer.trim().toLocaleLowerCase("en-US");
  const answerOption = options.find((option) => option.trim().toLocaleLowerCase("en-US") === wanted);
  if (!answerOption || options.length < 3) return false;
  const length = answerOption.trim().length;
  return options.every((option) => option === answerOption || option.trim().length < length);
}

// Auxiliaries, modals, negation and infinitive "to": tense/verb-form options differ by these, so they are
// naturally longer ("was reviewing" vs "reviewed") without giving the answer away.
const FORM_FUNCTION_WORDS = new Set(["am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "will", "would", "shall", "should", "can", "could", "may", "might", "must", "not", "to", "going"]);
const contractionRest = (word: string) => word.replace(/n't$|'(?:s|re|ve|ll|d|m)$/u, "");

/**
 * True when every option is a form of one word: after dropping auxiliaries/modals/"not"/"to", each option
 * leaves a single word and all share a stem (common prefix of at least 3 letters, e.g. review / reviewed /
 * reviewing; decide / decision / decisive). Irregular forms (write / wrote / written) also pass when the
 * remaining words share their first 2 letters and every option is at most 3 words long.
 */
export function optionsAreFormVariants(options: readonly string[]): boolean {
  if (options.length < 2) return false;
  const lexical = options.map((option) => (option.toLocaleLowerCase("en-US").match(/[a-z']+/gu) ?? []).map(contractionRest).filter((word) => word && !FORM_FUNCTION_WORDS.has(word)));
  if (lexical.some((words) => words.length !== 1)) return false;
  const words = lexical.map((list) => list[0]!);
  let prefix = words[0]!;
  for (const word of words.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < word.length && prefix[index] === word[index]) index += 1;
    prefix = prefix.slice(0, index);
  }
  if (prefix.length >= 3) return true;
  return prefix.length >= 2 && options.every((option) => option.trim().split(/\s+/u).length <= 3);
}

/**
 * Tolerant "answer is the longest" cue for grammar and word-form items (13/11): tense and word forms are
 * naturally different lengths, so it is a cue only when the options are not forms of one word AND the answer
 * is clearly longer than every other option — more than one word longer and more than 30% more characters.
 * Listening/reading keep {@link answerIsUniqueLongestOption}.
 */
export function answerIsClearlyLongestOption(options: readonly string[], answer: string): boolean {
  if (!answerIsUniqueLongestOption(options, answer) || optionsAreFormVariants(options)) return false;
  const wanted = answer.trim().toLocaleLowerCase("en-US");
  const others = options.filter((option) => option.trim().toLocaleLowerCase("en-US") !== wanted);
  const wordCount = (value: string) => value.trim().split(/\s+/u).filter(Boolean).length;
  const longestOther = Math.max(...others.map((option) => option.trim().length));
  const mostWords = Math.max(...others.map(wordCount));
  return wordCount(answer) - mostWords > 1 && answer.trim().length > longestOther * 1.3;
}

const VIETNAMESE_LETTERS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu;

/** Vietnamese text by its letters (diacritics) — used where Vietnamese is required, not forbidden. */
export function containsVietnameseLetters(value: unknown): boolean {
  return typeof value === "string" && VIETNAMESE_LETTERS.test(value.normalize("NFC"));
}

/** Internal planning wording that must never reach a learner. */
export const INTERNAL_LEARNER_TERMS = ["người học", "core term", "core terms", "expanded term", "expanded terms", "support term", "support terms", "lockedscope", "dayspec", "dailyteachingplan"] as const;

/**
 * Internal terms (and verbatim pasted planning strings such as a theme's
 * communicationGoal) found in a learner-facing string.
 */
export function internalLearnerTerms(value: string, pastedPlanStrings: readonly string[] = []): string[] {
  const text = value.normalize("NFC").toLocaleLowerCase("vi").replace(/\s+/gu, " ");
  const found: string[] = INTERNAL_LEARNER_TERMS.filter((term) => new RegExp(`(?<![\\p{L}])${term.replace(/\s/gu, "\\s")}(?![\\p{L}])`, "u").test(text));
  for (const raw of pastedPlanStrings) {
    const planned = raw.normalize("NFC").toLocaleLowerCase("vi").replace(/\s+/gu, " ").replace(/[.…]+$/u, "").trim();
    if (planned.length < 24) continue;
    const probe = planned.length > 40 ? planned.slice(0, 40) : planned;
    if (text.includes(probe)) found.push(raw.length > 60 ? `${raw.slice(0, 60)}…` : raw);
  }
  return [...new Set(found)];
}

/**
 * Spelling units that stand for one sound (vowel teams, r-coloured vowels,
 * consonant digraphs). A minimal pair may differ only by one such unit.
 */
const ONE_SOUND_SPELLINGS: ReadonlySet<string> = new Set([
  "ee", "ea", "ie", "ei", "ey", "oo", "ou", "ow", "ai", "ay", "oa", "oe", "oi", "oy", "au", "aw", "ew", "ue", "ui", "igh",
  "ar", "er", "ir", "or", "ur", "al", "air", "ear", "eer", "ere", "our", "ure",
  "th", "sh", "ch", "tch", "ph", "wh", "ck", "ng", "gh", "kn", "wr", "dge", "qu", "mb", "gn"
]);

function collapseDoubledConsonants(word: string): string {
  // "ck" spells one /k/ (wick ~ week differ only in the vowel).
  return word.replace(/ck/gu, "k").replace(/([bcdfghjklmnpqrstvwxz])\1/gu, "$1");
}

/** Common homophones whose spellings differ in more than a vowel team (right / write, hour / our). */
const HOMOPHONE_GROUPS: ReadonlyArray<readonly string[]> = [
  ["right", "write", "rite"], ["there", "their"], ["hour", "our"], ["two", "too", "to"], ["know", "no"], ["knew", "new"],
  ["buy", "by", "bye"], ["whole", "hole"], ["wear", "where"], ["weather", "whether"], ["through", "threw"], ["not", "knot"],
  ["son", "sun"], ["cell", "sell"], ["cent", "sent", "scent"], ["site", "sight", "cite"], ["role", "roll"], ["brake", "break"],
  ["flour", "flower"], ["hear", "here"], ["higher", "hire"], ["hi", "high"], ["for", "four"], ["one", "won"], ["piece", "peace"],
  ["deer", "dear"], ["dew", "due"], ["need", "knead"], ["suite", "sweet"], ["check", "cheque"], ["way", "weigh"], ["wait", "weight"],
  ["eight", "ate"], ["be", "bee"], ["we", "wee"], ["see", "sea"], ["mail", "male"], ["sale", "sail"], ["tale", "tail"], ["pain", "pane"],
  ["plain", "plane"], ["main", "mane"], ["made", "maid"], ["waste", "waist"], ["fair", "fare"], ["pair", "pear", "pare"], ["stair", "stare"],
  ["steal", "steel"], ["real", "reel"], ["heal", "heel"], ["meet", "meat"], ["week", "weak"], ["team", "teem"], ["seem", "seam"],
  ["feet", "feat"], ["read", "reed"], ["die", "dye"], ["rode", "road", "rowed"], ["sole", "soul"], ["so", "sew", "sow"],
  ["blue", "blew"], ["route", "root"], ["board", "bored"], ["course", "coarse"], ["key", "quay"], ["profit", "prophet"]
];

/** A rough sound key of a spelling: silent initial letters dropped, vowel teams and magic e folded to one vowel symbol. */
function soundKey(word: string): string {
  return collapseDoubledConsonants(word)
    .replace(/^kn/u, "n").replace(/^wr/u, "r").replace(/^wh/u, "w").replace(/^gn/u, "n")
    .replace(/igh/gu, "Y")
    .replace(/ee|ea|ie(?!s)/gu, "I")
    .replace(/ai|ay/gu, "A")
    .replace(/oa|oe/gu, "O")
    .replace(/oo|ue|ew/gu, "U")
    .replace(/a([bcdfgklmnprstvz])e$/u, "A$1").replace(/i([bcdfgklmnprstvz])e$/u, "Y$1").replace(/o([bcdfgklmnprstvz])e$/u, "O$1")
    .replace(/u([bcdfgklmnprstvz])e$/u, "U$1").replace(/e([bcdfgklmnprstvz])e$/u, "I$1");
}

/**
 * True when two different spellings are (very likely) pronounced the same:
 * a listed homophone pair, or the same consonants with two spellings of one
 * vowel (team / teem, week / weak, sale / sail). Homophones are never minimal
 * pairs: the learner cannot hear a difference (December 2026 A1 review "team / teem").
 */
export function areLikelyHomophones(first: string, second: string): boolean {
  const a = first.trim().toLocaleLowerCase("en-US");
  const b = second.trim().toLocaleLowerCase("en-US");
  if (!a || !b || a === b || !/^[a-z]+$/u.test(a) || !/^[a-z]+$/u.test(b)) return false;
  if (HOMOPHONE_GROUPS.some((group) => group.includes(a) && group.includes(b))) return true;
  return soundKey(a) === soundKey(b);
}

function ipaSegments(ipa: string): string[] {
  const clean = ipa.normalize("NFC").replace(/[/[\]ˈˌ.\s‿()]/gu, "");
  return clean.match(/(?:tʃ|dʒ|eɪ|aɪ|ɔɪ|aʊ|əʊ|oʊ|ɪə|eə|ʊə)|.ː?/gu) ?? [];
}

function segmentDistance(a: readonly string[], b: readonly string[]): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

/**
 * WP8 round 2: a heuristic minimal-pair check. With both IPA transcriptions
 * the pair must differ by exactly one sound segment; otherwise the spellings
 * must share their start and end and differ in one spot by at most one
 * one-sound spelling unit (ship/sheep, think/sink, fan/van, hat/hate). Rejects
 * event/segment, bat/box, sheet/shift, bomb/bond, correct/count. Phrases are
 * not judged (returns true).
 */
export function isPlausibleMinimalPair(first: string, second: string, ipa?: { first?: string | undefined; second?: string | undefined }): boolean {
  const a = first.trim().toLocaleLowerCase("en-US");
  const b = second.trim().toLocaleLowerCase("en-US");
  if (!/^[a-z]+$/u.test(a) || !/^[a-z]+$/u.test(b)) return true;
  if (a === b) return false;
  if (ipa?.first?.trim() && ipa.second?.trim()) return segmentDistance(ipaSegments(ipa.first), ipaSegments(ipa.second)) === 1;
  if (areLikelyHomophones(a, b)) return false;
  const x = collapseDoubledConsonants(a);
  const y = collapseDoubledConsonants(b);
  if (x === y) return false;
  let prefix = 0;
  while (prefix < x.length && prefix < y.length && x[prefix] === y[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < x.length - prefix && suffix < y.length - prefix && x[x.length - 1 - suffix] === y[y.length - 1 - suffix]) suffix += 1;
  if (prefix + suffix === 0) return false;
  const oneSound = (middle: string) => middle.length <= 1 || ONE_SOUND_SPELLINGS.has(middle);
  return oneSound(x.slice(prefix, x.length - suffix)) && oneSound(y.slice(prefix, y.length - suffix));
}
