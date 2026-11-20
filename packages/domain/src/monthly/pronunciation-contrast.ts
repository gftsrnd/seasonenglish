import type { CefrLevel } from "@e4s/contracts";
import { monthlyIpaPhonemes } from "./pronunciation-ipa.js";
import { areLikelyHomophones, isPlausibleMinimalPair } from "../content/choice-quality.js";
import { findMonthlyPronunciationCatalogItem, monthlyPronunciationCatalog, type MonthlyPronunciationCatalogItem } from "./pronunciation-catalog.js";

/**
 * Friday review listen-and-choose items (two per review): the learner hears one
 * option and picks it from two. What the two options must contrast depends on
 * the roadmap item (docs/pronunciation-roadmap.md, step 2 "Phân biệt trong từ"):
 *
 * - `minimal_pair`  A1–A2 phonemes and pairs: two real words that differ only
 *                   in the target sound (ship / sheep).
 * - `word_form`     B1+ single-word phenomena (endings, clusters, word stress,
 *                   suffixes, elision): the taught example and the same word
 *                   with the feature changed (sends / send, strategic /
 *                   strategy, greenhouse / green house, setup / set up).
 * - `phrase`        B1+ phrase phenomena (weak forms, linking, contracted 's,
 *                   sentence stress, intonation, emphasis, presentation): the
 *                   taught example phrase and the same phrase with one word
 *                   changed, added or removed, a contraction written out, or
 *                   only the final punctuation changed (send the file / send a
 *                   file, it's clear now / it is clear now).
 */
export type MonthlyPronunciationContrastKind = "minimal_pair" | "word_form" | "phrase";

export interface MonthlyPronunciationContrastRule {
  kind: MonthlyPronunciationContrastKind;
  /** Ending phenomena: the inflection is stripped to find the stem the partner must share. */
  ending?: "s" | "ed";
  /** The two phonemes that must substitute for one another in a target-pair exercise. */
  targetPairs?: readonly (readonly [string, string])[];
  /** One-line instruction for the AI, with an illustration of a valid pair. */
  guidance: string;
}

/** Spoken text of a pronunciation example: drops "(noun)/(verb)/(adjective)" notes, pause bars and intonation arrows. */
export function monthlyPronunciationExampleText(word: string): string {
  return word
    .replace(/\((?:noun|verb|adjective|adj\.?|n\.?|v\.?)\)/giu, " ")
    .replace(/[|↗↘→‿]/gu, " ")
    .replace(/[’‘]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

const PHRASE_FORMS = new Set(["phrase", "contraction_s", "ed_link"]);

type ContrastSound = { ipa: string; catalogId?: string | undefined };
export function monthlyPronunciationContrastRule(cefr: CefrLevel, sound: ContrastSound & { examples?: ReadonlyArray<{ word: string }> }, monthSounds: readonly ContrastSound[] = [sound]): MonthlyPronunciationContrastRule {
  const item: MonthlyPronunciationCatalogItem | undefined = findMonthlyPronunciationCatalogItem(cefr, sound);
  const beginner = cefr === "A1" || cefr === "A2";
  const activePhonemes = new Set(monthSounds.flatMap(target => soundPhonemes(cefr, target)));
  if (beginner) {
    const ownPhonemes = soundPhonemes(cefr, sound);
    const targetPairs = monthlyPronunciationCatalog(cefr).flatMap(target => {
      const left = target.sides?.[0] ?? [];
      const right = target.sides?.[1] ?? [];
      return left.flatMap((phoneme, index) => {
        const counterpart = right[index];
        if (!counterpart || !activePhonemes.has(phoneme) || !activePhonemes.has(counterpart)) return [];
        return ownPhonemes.includes(phoneme) || ownPhonemes.includes(counterpart) ? [[phoneme, counterpart] as const] : [];
      });
    });
    if (targetPairs.length) return { kind: "minimal_pair", targetPairs,
      guidance: "a true minimal pair with one of these monthly substitutions (" + targetPairs.map(([first, second]) => "/" + first + "/ ↔ /" + second + "/").join(", ") + "). If no common minimal partner is suitable, a verified pair of real common words may differ by two phonemes, including that same target substitution. Describe a two-phoneme fallback as a sound contrast only" };
  }
  // Legacy sounds outside the catalog keep the phoneme minimal-pair rule.
  if (beginner || !item || item.type === "phoneme" || item.type === "pair") {
    return { kind: "minimal_pair", guidance: "a true minimal pair: the example word and a real, common word that sounds exactly the same except that the target sound is replaced by one neighbouring sound (same number of sounds, all other sounds identical and in the same order, e.g. ship / sheep, fan / van; never pairs such as event / segment, bat / box or sheet / shift, and never two spellings of the same sound such as team / teem, week / weak or meet / meat: homophones sound identical)" };
  }
  const form = item.form;
  const phrase = form ? PHRASE_FORMS.has(form.kind) || (form.kind === "stress" && form.pattern === "multi_compound") : (sound.examples ?? []).some((example) => monthlyPronunciationExampleText(example.word).split(" ").length >= 3);
  if (phrase) {
    return { kind: "phrase", guidance: "the example phrase copied exactly and the same phrase with only the target feature changed: one word changed, added or removed, a contraction written out in full, or only the final punctuation changed (e.g. send the file / send a file, it's clear now / it is clear now, customer service desk / customer service); never a single word taken out of the phrase and never an unrelated word pair" };
  }
  if (form?.kind === "ending") {
    const ed = form.ending.startsWith("ed");
    return { kind: "word_form", ending: ed ? "ed" : "s", guidance: ed
      ? "the example word and the same verb without the -ed ending, or a real word that differs only in that final sound (e.g. asked / ask, planned / plan, wanted / want)"
      : "the example word and the same word without the -s ending, or a real word that differs only in that final sound (e.g. sends / send, plans / plan, offices / office)" };
  }
  if (form?.kind === "onset") return { kind: "word_form", guidance: "the example word and a real word with the initial cluster reduced to one sound (e.g. play / pay, price / rice, clean / keen)" };
  if (form?.kind === "coda") return { kind: "word_form", guidance: "the example word and a real word with the final cluster reduced or changed (e.g. sent / set, tax / tack, cost / cot)" };
  if (form?.kind === "stress" && (form.pattern === "compound_vs_phrase" || form.pattern === "phrasal_noun_verb")) {
    return { kind: "word_form", guidance: "the two members of a taught stress pair, written without the (noun)/(verb) notes, where only the stress (spacing) changes (e.g. greenhouse / green house, setup / set up, follow-up / follow up)" };
  }
  return { kind: "word_form", guidance: "the example word and a real word of the same family or stem in which the stress or the target feature changes (e.g. strategic / strategy, engineer / engine, fifteen / fifty, comfortable / comfort)" };
}

/**
 * Why `partner` is not a valid contrast for the taught `example` under `rule`,
 * or undefined when it is. Explicit target pairs use verified IPA for both options.
 */
export function monthlyPronunciationContrastIssue(rule: MonthlyPronunciationContrastRule, example: string, partner: string, ipa?: { first?: string | undefined; second?: string | undefined }): string | undefined {
  const a = monthlyPronunciationExampleText(example);
  const b = monthlyPronunciationExampleText(partner);
  if (!a || !b) return "both options are needed";
  if (rule.kind === "minimal_pair") {
    if (a.toLocaleLowerCase("en-US") === b.toLocaleLowerCase("en-US")) return "the two options are the same word";
    if (rule.targetPairs?.length) {
      if (!/^[a-z]+$/iu.test(a) || !/^[a-z]+$/iu.test(b) || !ipa?.first || !ipa.second) return "both options must be real single words with verified IPA";
      if (areLikelyHomophones(a, b)) return "the two options are homophones";
      return monthlyTargetContrastDistance(rule.targetPairs, ipa.first, ipa.second) ? undefined : "the two words must differ by one or two phonemes, including the specified monthly target substitution";
    }
    if (areLikelyHomophones(a, b)) return `"${a}" and "${b}" sound exactly the same (homophones), so the learner cannot hear a difference; the partner must differ in the target sound`;
    return isPlausibleMinimalPair(a, b, ipa) ? undefined : "not a minimal pair: the two words must sound exactly the same except for the target sound, replaced by one neighbouring sound";
  }
  if (rule.kind === "phrase") {
    const raw = (value: string) => value.toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
    if (raw(a) === raw(b)) return "the two options are the same text";
    const x = phraseTokens(a);
    const y = phraseTokens(b);
    if (x.length < 2 && y.length < 2) return "use the whole example phrase, not a single word";
    return tokenDistance(x, y) <= 1 ? undefined : "the partner must be the same phrase with only one word changed, added or removed (or a contraction written out)";
  }
  const letters = (value: string) => value.toLocaleLowerCase("en-US").replace(/[^a-z]/gu, "");
  const x = letters(a);
  const y = letters(b);
  if (!x || !y) return "both options must be English words";
  if (x === y) return a.toLocaleLowerCase("en-US") === b.toLocaleLowerCase("en-US") ? "the two options are the same word" : undefined;
  const prefix = commonPrefix(x, y);
  if (rule.ending) {
    const stem = x.replace(rule.ending === "ed" ? /(?:ed|d)$/u : /(?:es|s)$/u, "");
    return prefix >= Math.max(2, stem.length - 1) && y.length <= stem.length + 3 ? undefined : `the partner must keep the stem "${stem}" and differ only in the ending`;
  }
  const shorter = Math.min(x.length, y.length);
  if (prefix >= Math.max(3, Math.ceil(shorter / 2))) return undefined;
  // Initial clusters: the rest of the word stays the same (play / pay, price / rice).
  if (commonSuffix(x, y) >= 2 && letterDistance(x, y) <= 2) return undefined;
  return "the partner must be the same word or stem with only the target feature changed";
}

/** Distance of a shortest pronunciation alignment that includes the configured substitution. */
export function monthlyTargetContrastDistance(pairs: readonly (readonly [string, string])[], first: string, second: string): 1 | 2 | undefined {
  const segments = (ipa: string) => monthlyIpaPhonemes(ipa).filter(segment => !["ˈ", "ˌ", "."].includes(segment));
  const a = segments(first);
  const b = segments(second);
  const distance = tokenDistance(a, b);
  if (distance !== 1 && distance !== 2) return undefined;
  const aligned = a.some((left, i) => b.some((right, j) =>
    pairs.some(([x, y]) => (left === x && right === y) || (left === y && right === x))
    && 1 + tokenDistance(a.slice(0, i), b.slice(0, j)) + tokenDistance(a.slice(i + 1), b.slice(j + 1)) === distance));
  return aligned ? distance : undefined;
}

/** Common contrast words with reviewed British IPA, usable when outside the month's approved word pools. */
export const MONTHLY_REVIEW_COMMON_CONTRAST_IPA: Readonly<Record<string, string>> = {
  easy: "/ˈiːzi/", dizzy: "/ˈdɪzi/", busy: "/ˈbɪzi/",
  board: "/bɔːd/", poured: "/pɔːd/",
  seat: "/siːt/", sit: "/sɪt/", feel: "/fiːl/", fill: "/fɪl/", leave: "/liːv/", live: "/lɪv/",
  sheep: "/ʃiːp/", ship: "/ʃɪp/", heat: "/hiːt/", hit: "/hɪt/", eat: "/iːt/", it: "/ɪt/",
  cheap: "/tʃiːp/", chip: "/tʃɪp/", green: "/ɡriːn/", grin: "/ɡrɪn/", sleep: "/sliːp/", slip: "/slɪp/",
  week: "/wiːk/", wick: "/wɪk/", bed: "/bed/", bad: "/bæd/", pen: "/pen/", pan: "/pæn/",
  men: "/men/", man: "/mæn/", set: "/set/", sat: "/sæt/", bet: "/bet/", bat: "/bæt/",
  send: "/send/", sand: "/sænd/", see: "/siː/", she: "/ʃiː/", sip: "/sɪp/", sell: "/sel/", shell: "/ʃel/",
  three: "/θriː/", tree: "/triː/", thank: "/θæŋk/", tank: "/tæŋk/", thin: "/θɪn/", tin: "/tɪn/", then: "/ðen/", den: "/den/"
};

/**
 * Common A1–A2 minimal pairs by target phoneme: [word with the target sound,
 * real partner with one neighbouring sound]. Used to make a failed
 * minimal-pair repair actionable (December 2026: "team / teem" came back six
 * times because "team" has no common minimal partner - "Tim" is a name).
 * Suggested pairs can be checked by reviewed IPA or spelling.
 */
export const A1A2_MINIMAL_PAIR_SUGGESTIONS: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = {
  "iː": [["seat", "sit"], ["feel", "fill"], ["leave", "live"], ["sheep", "ship"], ["read", "rid"], ["heat", "hit"], ["eat", "it"], ["cheap", "chip"], ["green", "grin"], ["sleep", "slip"]],
  "ɪ": [["sit", "seat"], ["fill", "feel"], ["live", "leave"], ["ship", "sheep"], ["hit", "heat"], ["it", "eat"], ["chip", "cheap"], ["slip", "sleep"], ["bit", "bet"], ["list", "least"]],
  "e": [["bed", "bad"], ["pen", "pan"], ["men", "man"], ["set", "sat"], ["bet", "bat"], ["send", "sand"], ["said", "sad"], ["left", "lift"], ["ten", "tin"], ["desk", "disk"]],
  "æ": [["bad", "bed"], ["man", "men"], ["pan", "pen"], ["sat", "set"], ["bat", "bet"], ["sand", "send"], ["sad", "said"], ["cat", "cut"], ["hat", "hut"], ["back", "buck"]],
  "ʌ": [["cut", "cat"], ["hut", "hat"], ["cup", "cap"], ["luck", "lock"], ["run", "ran"], ["fun", "fan"]],
  "ɑː": [["heart", "hat"], ["cart", "cat"], ["park", "pack"], ["last", "lost"]],
  "ɒ": [["lock", "luck"], ["hot", "hut"], ["shop", "ship"], ["not", "nut"], ["job", "jab"]],
  "ɔː": [["walk", "wok"], ["short", "shot"], ["port", "pot"]],
  "ʊ": [["full", "fool"], ["pull", "pool"], ["look", "luck"], ["book", "buck"]],
  "uː": [["fool", "full"], ["pool", "pull"], ["food", "feed"], ["shoot", "shot"]],
  "ɜː": [["work", "walk"], ["first", "fast"], ["bird", "bad"], ["shirt", "short"]],
  "eɪ": [["main", "men"], ["paper", "pepper"]],
  "aɪ": [["like", "lake"]],
  "ɔɪ": [["boy", "bay"], ["toy", "tie"]],
  "aʊ": [["now", "no"], ["found", "fund"], ["house", "horse"]],
  "əʊ": [["coat", "cot"], ["road", "rod"]],
  "ɪə": [["here", "her"], ["beer", "bee"]],
  "eə": [["care", "car"], ["fair", "fur"], ["hair", "her"]],
  m: [["mail", "nail"], ["mine", "nine"]],
  n: [["night", "might"], ["sun", "sum"]],
  l: [["light", "right"], ["lead", "read"], ["long", "wrong"], ["fly", "fry"]],
  h: [["hat", "at"], ["heat", "eat"], ["hold", "old"], ["hand", "and"]],
  p: [["pin", "bin"], ["pack", "back"], ["cap", "cab"], ["pay", "bay"]],
  b: [["bin", "pin"], ["back", "pack"], ["bay", "pay"]],
  t: [["time", "dime"], ["ten", "den"], ["sent", "send"], ["tie", "die"]],
  d: [["send", "sent"], ["die", "tie"]],
  f: [["fan", "van"], ["fine", "vine"]],
  v: [["van", "fan"], ["very", "berry"]],
  s: [["sip", "ship"], ["see", "she"], ["sort", "short"], ["sell", "shell"], ["bus", "buzz"]],
  z: [["buzz", "bus"], ["prize", "price"]],
  k: [["coat", "goat"], ["back", "bag"], ["class", "glass"]],
  g: [["goat", "coat"], ["bag", "back"], ["glass", "class"], ["gold", "cold"]],
  w: [["wine", "vine"], ["west", "vest"], ["wet", "vet"]],
  j: [["yet", "jet"], ["yes", "less"], ["year", "ear"]],
  "ŋ": [["thing", "thin"], ["sing", "sin"], ["wing", "win"], ["bang", "ban"]],
  r: [["right", "light"], ["read", "lead"], ["wrong", "long"], ["fry", "fly"]],
  "ʃ": [["ship", "sip"], ["she", "see"], ["shell", "sell"], ["short", "sort"]],
  "tʃ": [["chip", "ship"]],
  "dʒ": [["jet", "yet"], ["joke", "choke"]],
  "θ": [["think", "sink"], ["three", "tree"], ["thank", "tank"], ["thin", "tin"], ["path", "pass"]],
  "ð": [["then", "den"]]
};

/** Phonemes a stored A1–A2 sound teaches ("/iː/" -> ["iː"]; pair items both sides). */
function soundPhonemes(cefr: CefrLevel, sound: { ipa: string; catalogId?: string | undefined }): string[] {
  const item = findMonthlyPronunciationCatalogItem(cefr, sound);
  if (item?.phonemes?.length) return [...item.phonemes];
  return sound.ipa.replace(/[/[\]\s]/gu, "").split(/[–~,&-]+/u).filter(Boolean);
}

/** "example / partner" for each taught example that has a listed common partner. */
export function monthlyMinimalPairPartners(cefr: CefrLevel, sound: { ipa: string; catalogId?: string | undefined }, taughtExamples: readonly string[]): string[] {
  const pairs = soundPhonemes(cefr, sound).flatMap((phoneme) => A1A2_MINIMAL_PAIR_SUGGESTIONS[phoneme] ?? []);
  return [...new Set(taughtExamples.map(monthlyPronunciationExampleText).flatMap((example) => {
    const partner = pairs.find(([first]) => first === example.toLocaleLowerCase("en-US"))?.[1];
    return partner ? [`${example} / ${partner}`] : [];
  }))];
}

/**
 * Actionable partner advice for a failed A1–A2 minimal pair: the partner of the
 * taught example when a common one exists, otherwise the other taught examples
 * of the same sound that have one, plus model pairs for the sound.
 */
export function monthlyMinimalPairRepairAdvice(cefr: CefrLevel, sound: { ipa: string; catalogId?: string | undefined }, example: string, taughtExamples: readonly string[]): string {
  const phonemes = soundPhonemes(cefr, sound);
  const pairs = phonemes.flatMap((phoneme) => A1A2_MINIMAL_PAIR_SUGGESTIONS[phoneme] ?? []);
  const word = monthlyPronunciationExampleText(example).toLocaleLowerCase("en-US");
  const partnerOf = (candidate: string) => pairs.find(([first]) => first === candidate.toLocaleLowerCase("en-US"))?.[1];
  const own = partnerOf(word);
  const others = taughtExamples.map(monthlyPronunciationExampleText).filter((candidate) => candidate.toLocaleLowerCase("en-US") !== word)
    .flatMap((candidate) => { const partner = partnerOf(candidate); return partner ? [`"${candidate} / ${partner}"`] : []; });
  const label = phonemes.map((phoneme) => `/${phoneme}/`).join(" or ");
  const models = pairs.slice(0, 4).map(([first, second]) => `${first} / ${second}`).join(", ");
  if (own) return `Use "${word} / ${own}".`;
  return [
    `"${word}" has no common real word that differs only in ${label || "the target sound"} (a name such as Tim does not count),`,
    others.length
      ? `so replace this pair with another of this week's taught ${label} examples and its partner: ${[...new Set(others)].join(" or ")}.`
      : `so replace this pair with another of this week's taught examples (${taughtExamples.map((candidate) => `"${monthlyPronunciationExampleText(candidate)}"`).join(", ")}) that has a real partner.`,
    models ? `Real ${label} pairs look like: ${models}.` : ""
  ].filter(Boolean).join(" ");
}

function phraseTokens(value: string): string[] {
  return value.toLocaleLowerCase("en-US")
    .replace(/n't\b/gu, " not").replace(/'re\b/gu, " are").replace(/'ve\b/gu, " have").replace(/'ll\b/gu, " will").replace(/'d\b/gu, " would").replace(/'m\b/gu, " am")
    .replace(/(\p{L})'s\b/gu, "$1 's")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .split(/\s+/u).filter(Boolean)
    // 's may stand for is or has; compare it with either.
    .map((token) => token === "'s" ? "is" : token);
}

function tokenDistance(a: readonly string[], b: readonly string[]): number {
  const same = (x: string, y: string) => x === y || (x === "is" && y === "has") || (x === "has" && y === "is");
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (same(a[i - 1]!, b[j - 1]!) ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

function letterDistance(a: string, b: string): number {
  return tokenDistance([...a], [...b]);
}

function commonPrefix(a: string, b: string): number {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index += 1;
  return index;
}

function commonSuffix(a: string, b: string): number {
  let index = 0;
  while (index < a.length && index < b.length && a[a.length - 1 - index] === b[b.length - 1 - index]) index += 1;
  return index;
}
