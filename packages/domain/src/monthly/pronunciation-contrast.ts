import type { CefrLevel } from "@e4s/contracts";
import { areLikelyHomophones, isPlausibleMinimalPair } from "../content/choice-quality.js";
import { findMonthlyPronunciationCatalogItem, type MonthlyPronunciationCatalogItem } from "./pronunciation-catalog.js";

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

export function monthlyPronunciationContrastRule(cefr: CefrLevel, sound: { ipa: string; catalogId?: string | undefined; examples?: ReadonlyArray<{ word: string }> }): MonthlyPronunciationContrastRule {
  const item: MonthlyPronunciationCatalogItem | undefined = findMonthlyPronunciationCatalogItem(cefr, sound);
  const beginner = cefr === "A1" || cefr === "A2";
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
 * or undefined when it is. `ipa` is used only by the strict minimal-pair rule.
 */
export function monthlyPronunciationContrastIssue(rule: MonthlyPronunciationContrastRule, example: string, partner: string, ipa?: { first?: string | undefined; second?: string | undefined }): string | undefined {
  const a = monthlyPronunciationExampleText(example);
  const b = monthlyPronunciationExampleText(partner);
  if (!a || !b) return "both options are needed";
  if (rule.kind === "minimal_pair") {
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
