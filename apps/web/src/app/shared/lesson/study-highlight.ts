import type { CefrLevel } from "@e4s/contracts";
import { findMonthlyGrammarCatalogTopic, monthlyGrammarCatalog, type MonthlyGrammarCatalogTopic } from "@e4s/domain/monthly";

/**
 * Study-block highlights (grammar formula slots, the matching words of the
 * examples, the pronunciation ending) and the grammar point name. Everything
 * is derived deterministically from the stored lesson text at render time, so
 * published lessons need no regeneration; whenever a rule is unsure it returns
 * no highlight (or no name) instead of guessing.
 */
export interface HighlightSegment { text: string; mark: boolean }

const plain = (text: string): HighlightSegment[] => text ? [{ text, mark: false }] : [];

function merge(segments: HighlightSegment[]): HighlightSegment[] {
  const out: HighlightSegment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const last = out[out.length - 1];
    if (last && last.mark === segment.mark) last.text += segment.text;
    else out.push({ ...segment });
  }
  return out;
}

// ------------------------------------------------------------------ grammar formula

/** Auxiliaries, modals and their negatives: a formula slot made only of these is a key slot. */
const AUX_WORDS = new Set([
  "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't",
  "will", "won't", "would", "wouldn't", "can", "can't", "cannot", "could", "couldn't", "should", "shouldn't",
  "must", "mustn't", "might", "may", "shall", "going", "to", "used", "'m", "'s", "'re", "'ll", "'ve", "'d"
]);
/** Verb placeholders ("V-ing", "base verb", "V3", "past participle" …). */
const VERB_PLACEHOLDER = /^(?:v(?:[0-3]|-?ing|-?ed|-?e?s|-inf)?|verb(?:-?ing|-?ed|-?e?s)?|(?:base|main) (?:verb|form)|(?:bare )?infinitive|past participle|past (?:simple )?form)$/u;
const ENDING = /^-[a-z]{1,3}$/u;
const SUBJECT_PRONOUNS = new Set(["i", "you", "we", "they", "he", "she", "it"]);
const DETERMINERS = new Set(["the", "a", "an", "my", "our", "your", "his", "her", "their", "this", "that"]);
const ADVERBS_BETWEEN = new Set(["not", "never", "just", "already", "always", "usually", "often", "ever", "also", "still", "sometimes", "really", "yet"]);

type PieceKind = "aux" | "verb" | "ending" | "pair";
interface Slot { text: string; kinds: PieceKind[]; neutral: boolean; aux: string[]; verb?: "ing" | "ed" | "any" }

/** "I'm", "she's", "they'll": a subject pronoun contracted with its auxiliary. */
const PRONOUN_CONTRACTION = /^(?:i|you|we|they|he|she|it)(?:'m|'re|'s|'ll|'ve|'d)$/u;

/** The auxiliary words of a "pronoun + form" piece ("He is" → is, "They are not" → are, not); undefined otherwise. */
function pairForms(words: readonly string[]): string[] | undefined {
  if (words.length === 1 && PRONOUN_CONTRACTION.test(words[0]!)) return [words[0]!];
  if (words.length < 2 || !SUBJECT_PRONOUNS.has(words[0]!)) return undefined;
  const forms = words.slice(1);
  return forms.every((word) => AUX_WORDS.has(word)) && !forms.every((word) => word === "to") ? forms : undefined;
}

const pieceWords = (piece: string) => piece.trim().toLocaleLowerCase("en").replace(/’/gu, "'").replace(/[?.!,]+$/u, "").split(/\s+/u).filter(Boolean);

/** One "/"-separated piece of a slot: auxiliary word(s), a verb placeholder, an ending or a "pronoun + form" pair; otherwise undefined. */
function pieceKind(piece: string): PieceKind | undefined {
  const value = piece.trim().toLocaleLowerCase("en").replace(/’/gu, "'").replace(/[?.!,]+$/u, "");
  if (!value) return undefined;
  if (ENDING.test(value)) return "ending";
  if (VERB_PLACEHOLDER.test(value)) return "verb";
  const words = value.split(/\s+/u);
  if (words.every((word) => AUX_WORDS.has(word)) && !(words.length === 1 && words[0] === "to")) return "aux";
  if (pairForms(words)) return "pair";
  return undefined;
}

/** A slot is key when every piece of its main text (outside parentheses) is an auxiliary, a placeholder or an ending. */
function readSlot(text: string): Slot {
  const main = text.replace(/\([^)]*\)/gu, " ").replace(/\s+/gu, " ").trim();
  const pieces = main.split("/").map((piece) => piece.trim()).filter(Boolean);
  const kinds = pieces.map(pieceKind);
  const key = pieces.length > 0 && kinds.every(Boolean);
  const lower = main.toLocaleLowerCase("en").replace(/[?.!,]+$/u, "");
  const slot: Slot = { text, kinds: key ? kinds as PieceKind[] : [], neutral: !key, aux: [] };
  if (!key) return slot;
  slot.aux = [
    ...pieces.filter((_, index) => kinds[index] === "aux").flatMap((piece) => piece.toLocaleLowerCase("en").split(/\s+/u)),
    // "I am / He is / They are": only the forms are key, the pronouns stay plain.
    ...pieces.filter((_, index) => kinds[index] === "pair").flatMap((piece) => pairForms(pieceWords(piece)) ?? [])
  ].filter((word) => word !== "to");
  if (kinds.includes("verb")) slot.verb = /ing\b/u.test(lower) ? "ing" : /(?:-|\b)ed\b|participle|v3/u.test(lower) && !/v-?s\b/u.test(lower) ? "ed" : "any";
  return slot;
}

function slotSegments(slot: Slot): HighlightSegment[] {
  const out: HighlightSegment[] = [];
  // Key text outside parentheses is marked; inside parentheses only endings ("-s/-es") are.
  for (const chunk of slot.text.split(/(\([^)]*\))/u)) {
    if (!chunk) continue;
    if (chunk.startsWith("(")) {
      for (const part of chunk.split(/((?<![A-Za-z])-[a-z]{1,3}(?:\/-[a-z]{1,3})*)(?![a-z])/u)) out.push({ text: part, mark: /^-[a-z]{1,3}(?:\/-[a-z]{1,3})*$/u.test(part) });
    } else if (slot.neutral) out.push({ text: chunk, mark: false });
    else if (slot.kinds.includes("pair")) {
      // Piece by piece: a "pronoun + form" pair marks the form only; other key pieces are marked whole.
      chunk.split(/(\/)/u).forEach((piece, index) => {
        if (index % 2) { out.push({ text: piece, mark: false }); return; }
        const lead = piece.match(/^\s*/u)![0];
        const tail = piece.match(/[\s?.!,]*$/u)![0];
        const body = piece.slice(lead.length, Math.max(lead.length, piece.length - tail.length));
        const kind = pieceKind(body);
        const pronoun = kind === "pair" && pieceWords(body).length > 1 ? body.match(/^\S+\s+/u)?.[0] ?? "" : "";
        out.push({ text: lead, mark: false }, { text: pronoun, mark: false }, { text: body.slice(pronoun.length), mark: Boolean(kind) }, { text: tail, mark: false });
      });
    } else {
      const lead = chunk.match(/^\s*/u)![0];
      const tail = chunk.match(/[\s?.!,]*$/u)![0];
      out.push({ text: lead, mark: false }, { text: chunk.slice(lead.length, chunk.length - tail.length), mark: true }, { text: tail, mark: false });
    }
  }
  return out;
}

interface FormulaLine { label: string; pattern: string; examples: string; slots: Slot[] }

/** "Question: Do/Does + subject + V?" → label, pattern and the formula's own examples after ": ". */
function readFormulaLine(line: string): FormulaLine {
  let rest = line;
  let label = "";
  const first = rest.indexOf(": ");
  if (first > 0 && !rest.slice(0, first).includes("+") && first <= 30) { label = rest.slice(0, first + 2); rest = rest.slice(first + 2); }
  let examples = "";
  const next = rest.indexOf(": ");
  if (next > 0 && rest.slice(0, next).includes("+")) { examples = rest.slice(next); rest = rest.slice(0, next); }
  const slots = rest.includes(" + ") ? rest.split(" + ").map(readSlot) : [];
  return { label, pattern: rest, examples, slots };
}

/** Rules for marking example words, collected from all formula lines. */
export interface GrammarExampleMatcher { aux: Set<string>; follow: Array<{ verb: "ing" | "ed" | "any"; skipSubject: boolean }>; subjectVerb: boolean; verbs: Set<string> }

function words(sentence: string): string[] {
  return sentence.match(/[A-Za-z][A-Za-z'’]*/gu)?.map((word) => word.toLocaleLowerCase("en").replace(/’/gu, "'")) ?? [];
}

/** Builds the example matcher of a (possibly multi-line) formula; null when no slot is key. */
export function grammarExampleMatcher(lines: readonly string[]): GrammarExampleMatcher | null {
  const matcher: GrammarExampleMatcher = { aux: new Set(), follow: [], subjectVerb: false, verbs: new Set() };
  let any = false;
  for (const line of lines.map(readFormulaLine)) {
    line.slots.forEach((slot, index) => {
      if (slot.neutral) return;
      any = true;
      for (const word of slot.aux) matcher.aux.add(word);
      if (!slot.verb) return;
      const before = line.slots[index - 1];
      const twoBack = line.slots[index - 2];
      if (before && !before.neutral && before.aux.length) matcher.follow.push({ verb: slot.verb, skipSubject: false });
      else if (before?.neutral && twoBack && !twoBack.neutral && twoBack.aux.length) matcher.follow.push({ verb: slot.verb, skipSubject: true });
      else if (before?.neutral && index === 1) {
        matcher.subjectVerb = true;
        // The formula's own short examples ("I work / She manages / The team meets") name the verb forms.
        for (const example of line.examples.replace(/^:\s*/u, "").split(/\s+\/\s+|;\s*/u)) {
          const tokens = words(example);
          if (!tokens.length || tokens.length > 4) continue;
          const verb = SUBJECT_PRONOUNS.has(tokens[0]!) ? tokens[1] : DETERMINERS.has(tokens[0]!) ? tokens[2] : undefined;
          if (verb && !AUX_WORDS.has(verb)) matcher.verbs.add(verb);
        }
      }
    });
  }
  return any ? matcher : null;
}

/** Marks the auxiliaries and verb forms of an example sentence that fill the formula's key slots. */
export function grammarExampleSegments(sentence: string, matcher: GrammarExampleMatcher | null): HighlightSegment[] {
  if (!matcher) return plain(sentence);
  const parts = sentence.split(/([A-Za-z][A-Za-z'’]*)/u);
  const tokens = parts.map((part, index) => index % 2 === 1 ? part.toLocaleLowerCase("en").replace(/’/gu, "'") : "");
  const wordIndexes = parts.map((_, index) => index).filter((index) => index % 2 === 1);
  const marked = new Set<number>();
  wordIndexes.forEach((index, position) => {
    const token = tokens[index]!;
    if (matcher.aux.has(token)) {
      marked.add(index);
      for (const rule of matcher.follow) {
        let cursor = position + 1;
        if (rule.skipSubject && SUBJECT_PRONOUNS.has(tokens[wordIndexes[cursor] ?? -1] ?? "")) cursor += 1;
        while (ADVERBS_BETWEEN.has(tokens[wordIndexes[cursor] ?? -1] ?? "")) cursor += 1;
        const target = wordIndexes[cursor];
        const word = target === undefined ? "" : tokens[target]!;
        if (!word || AUX_WORDS.has(word) || SUBJECT_PRONOUNS.has(word) || DETERMINERS.has(word)) continue;
        // V-ing must end in -ing; V3/base forms can be irregular, so any verb-like word is accepted.
        if (rule.verb !== "ing" || /..ing$/u.test(word)) marked.add(target!);
      }
    }
    if (matcher.verbs.has(token)) marked.add(index);
  });
  // "Subject + verb": the word right after a subject pronoun at the start of the sentence.
  if (matcher.subjectVerb && wordIndexes.length > 1 && SUBJECT_PRONOUNS.has(tokens[wordIndexes[0]!]!)) {
    let cursor = 1;
    while (ADVERBS_BETWEEN.has(tokens[wordIndexes[cursor] ?? -1] ?? "")) cursor += 1;
    const target = wordIndexes[cursor];
    if (target !== undefined && !AUX_WORDS.has(tokens[target]!) && !DETERMINERS.has(tokens[target]!)) marked.add(target);
  }
  return merge(parts.map((text, index) => ({ text, mark: marked.has(index) })));
}

/** One formula line with its key slots (and the matching words of its own examples) marked. */
export function grammarFormulaSegments(line: string, matcher: GrammarExampleMatcher | null = grammarExampleMatcher([line])): HighlightSegment[] {
  const parsed = readFormulaLine(line);
  if (!parsed.slots.length || parsed.slots.every((slot) => slot.neutral && !/\(-[a-z]/u.test(slot.text))) return plain(line);
  const pattern = parsed.slots.flatMap((slot, index) => [...(index ? plain(" + ") : []), ...slotSegments(slot)]);
  const examples = parsed.examples
    ? [...plain(parsed.examples.match(/^:\s*/u)![0]), ...parsed.examples.replace(/^:\s*/u, "").split(/(\s+\/\s+|;\s*)/u).flatMap((part, index) => index % 2 ? plain(part) : grammarExampleSegments(part, matcher))]
    : [];
  return merge([...plain(parsed.label), ...pattern, ...examples]);
}

// ------------------------------------------------------------------ grammar point name

const normalize = (value: string) => ` ${value.toLocaleLowerCase("en").replace(/[\s\p{P}\p{S}]+/gu, " ").trim()} `;

/** Distinctive name phrases of a catalog title: "Past simple vs past continuous and past habits" → past simple, past continuous, past habits. */
function titlePhrases(title: string): string[] {
  return title.toLocaleLowerCase("en").replace(/\s+\d+$/u, "").split(/\s+vs\.?\s+|,\s*|\s+and\s+/u)
    .map((phrase) => normalize(phrase).trim().replace(/^(?:the|basic|advanced) /u, ""))
    .filter((phrase) => phrase.split(" ").length >= 2);
}

/** A1–A2 "English (Vietnamese)" per topic (several topics joined with " · "); B1+ English only. */
function plannedGrammarName(cefr: CefrLevel, title: string, titleVi: string): string {
  if ((cefr !== "A1" && cefr !== "A2") || !titleVi) return title;
  const en = title.split(" · ");
  const vi = titleVi.split(" · ");
  if (en.length !== vi.length) return title;
  return en.map((name, index) => normalize(name) === normalize(vi[index]!) || normalize(name).includes(normalize(vi[index]!)) ? name : `${name} (${vi[index]})`).join(" · ");
}

function displayName(cefr: CefrLevel, topic: MonthlyGrammarCatalogTopic): string {
  if (cefr !== "A1" && cefr !== "A2") return topic.titleEn;
  return normalize(topic.titleVi) === normalize(topic.titleEn) ? topic.titleEn : `${topic.titleEn} (${topic.titleVi})`;
}

/**
 * The roadmap name of the grammar point a lesson teaches ("Present simple vs present continuous";
 * A1–A2 add the Vietnamese name). Resolved from a stored catalogId/title when present, otherwise
 * from the lesson's own goal/usage text: the level-catalog topic (on the daily code's side, A or B)
 * whose title — or the most of its name phrases — the text mentions; a tie or no mention gives
 * undefined, never a guessed name.
 */
export function grammarPointName(cefr: CefrLevel, content: Record<string, unknown>): string | undefined {
  // The name the lesson API / operator preview attach from the approved day plan.
  const planned = typeof content.topicTitle === "string" ? content.topicTitle.trim() : "";
  if (planned) return plannedGrammarName(cefr, planned, typeof content.topicTitleVi === "string" ? content.topicTitleVi.trim() : "");
  const stored = ["catalogId", "grammarCatalogId"].map((key) => content[key]).find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const storedTitle = ["grammarTopic"].map((key) => content[key]).find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  if (stored || storedTitle) {
    const found = findMonthlyGrammarCatalogTopic(cefr, { catalogId: stored, title: storedTitle });
    if (found) return displayName(cefr, found.topic);
  }
  const steps = Array.isArray(content.steps) ? content.steps : [];
  const texts = [content.objective, content.usage, content.text, ...steps.flatMap((step) => step && typeof step === "object" ? [(step as Record<string, unknown>).text, (step as Record<string, unknown>).usage, (step as Record<string, unknown>).focus] : [])];
  const corpus = normalize(texts.filter((value): value is string => typeof value === "string").join(" "));
  if (!corpus.trim()) return undefined;
  const code = typeof content.dailyCode === "string" ? content.dailyCode.trim().charAt(0).toUpperCase() : "";
  const side = code === "A" || code === "B" ? code : undefined;
  let best: { topic: MonthlyGrammarCatalogTopic; score: number } | undefined;
  let tie = false;
  for (const pair of monthlyGrammarCatalog(cefr)) {
    for (const topic of [pair.topicA, pair.topicB]) {
      if (side && topic.side !== side) continue;
      const score = (corpus.includes(normalize(topic.titleEn)) ? 10 : 0) + titlePhrases(topic.titleEn).filter((phrase) => corpus.includes(` ${phrase} `)).length;
      if (!score) continue;
      if (!best || score > best.score) { best = { topic, score }; tie = false; }
      else if (score === best.score) tie = true;
    }
  }
  return best && !tie ? displayName(cefr, best.topic) : undefined;
}

// ------------------------------------------------------------------ pronunciation ending

/** The written ending and the IPA ending of a -s/-es or -ed example word, each split off when it matches. */
export function pronunciationEndingSegments(word: string, ipa: string | undefined, core: { ending: "s" | "ed"; result: string } | undefined): { word: HighlightSegment[]; ipa: HighlightSegment[] } {
  const none = { word: plain(word), ipa: plain(ipa ?? "") };
  if (!core || !/^[A-Za-z]+$/u.test(word)) return none;
  const sound = core.result.replace(/^\/|\/$/gu, "");
  const written = core.ending === "ed" ? (/ed$/iu.test(word) ? 2 : 0) : sound === "ɪz" ? (/es$/iu.test(word) ? 2 : 0) : (/[^s]s$/iu.test(word) ? 1 : 0);
  if (!written) return none;
  const wordSegments = [{ text: word.slice(0, -written), mark: false }, { text: word.slice(-written), mark: true }];
  const body = ipa?.match(/^(\/?)(.*?)(\/?)$/u);
  const ipaSegments = body && body[2]!.endsWith(sound) && body[2]!.length > sound.length
    ? merge([{ text: `${body[1]}${body[2]!.slice(0, -sound.length)}`, mark: false }, { text: sound, mark: true }, { text: body[3]!, mark: false }])
    : plain(ipa ?? "");
  return { word: wordSegments, ipa: ipaSegments };
}

// ------------------------------------------------------------------ pronunciation target sound

/** IPA symbols written with two characters: a one-character target inside one of these is a different sound. */
const IPA_MULTI = ["tʃ", "dʒ", "eɪ", "aɪ", "ɔɪ", "əʊ", "oʊ", "aʊ", "ɪə", "eə", "ʊə", "aɪə", "aʊə"];
const IPA_LENGTH_MARKS = /^[ːˑ]/u;

/**
 * The target sound inside an example's IPA ("/iː/" in /kliːn/ → kl·iː·n). Every occurrence is marked unless it
 * is only part of a longer symbol (/t/ inside /tʃ/, /ɪ/ inside /eɪ/, /i/ before a length mark); no occurrence → plain.
 */
export function pronunciationTargetSegments(ipa: string | undefined, target: string | undefined): HighlightSegment[] {
  const text = ipa ?? "";
  const sound = (target ?? "").trim().replace(/^\/+|\/+$/gu, "").trim();
  if (!text || !sound || /\s/u.test(sound) || sound.length > 4) return plain(text);
  const out: HighlightSegment[] = [];
  let cursor = 0;
  let found = false;
  for (let index = text.indexOf(sound); index >= 0; index = text.indexOf(sound, index + 1)) {
    if (index < cursor) continue;
    const before = text.slice(0, index);
    const after = text.slice(index + sound.length);
    if (IPA_LENGTH_MARKS.test(after) && !IPA_LENGTH_MARKS.test(sound.slice(-1))) continue;
    const inside = IPA_MULTI.some((symbol) => symbol !== sound && symbol.length > sound.length && [...Array(symbol.length - sound.length + 1).keys()].some((offset) => symbol.slice(offset, offset + sound.length) === sound && before.endsWith(symbol.slice(0, offset)) && after.startsWith(symbol.slice(offset + sound.length))));
    if (inside) continue;
    out.push({ text: text.slice(cursor, index), mark: false }, { text: sound, mark: true });
    cursor = index + sound.length;
    found = true;
  }
  if (!found) return plain(text);
  out.push({ text: text.slice(cursor), mark: false });
  return merge(out);
}

// ------------------------------------------------------------------ formula boxes (correct / wrong, two structures)

export interface GrammarFormulaBox { tone: "neutral" | "correct" | "wrong"; label?: string; lines: string[] }

const CORRECT_MARKER = /^(?:✓|✔|✅|(?:đúng|correct|right)\s*:)/iu;
const MARKER = /(✓|✔|✅|✗|✘|❌|(?<![\p{L}])(?:đúng|sai|correct|right|wrong|incorrect|not)\s*:)/iu;
const cleanPiece = (value: string) => value.replace(/^[\s/;,.()]+|[\s/;,(]+$/gu, "").replace(/^([^()]*)\)$/u, "$1").trim();

/**
 * Splits a formula into the boxes it shows: one neutral box normally; a green "correct" and a red "wrong" box when
 * the text marks a wrong pattern (✓/✗, "Đúng:/Sai:", "Correct:/Wrong:", "not: …"); two neutral boxes for a
 * comparison of two structures ("A vs B", "A ; B" with a "+" pattern on each side). Unsure → one box.
 */
export function grammarFormulaBoxes(formula: string, language: "vi" | "en", splitLines: (formula: string) => string[] = (value) => [value.trim()], names: readonly string[] = []): GrammarFormulaBox[] {
  const text = formula.replace(/\s+/gu, " ").trim();
  const single: GrammarFormulaBox[] = [{ tone: "neutral", lines: splitLines(formula) }];
  if (!text) return single;
  // (b) correct vs wrong pattern.
  const parts = text.split(MARKER);
  if (parts.length > 1) {
    const correct: string[] = [];
    const wrong: string[] = [];
    const lead = cleanPiece(parts[0]!);
    if (lead) correct.push(lead);
    for (let index = 1; index < parts.length; index += 2) {
      const piece = cleanPiece(parts[index + 1] ?? "");
      if (!piece) continue;
      (CORRECT_MARKER.test(parts[index]!) ? correct : wrong).push(piece);
    }
    if (correct.length && wrong.length) {
      return [
        { tone: "correct", label: language === "en" ? "Correct" : "Đúng", lines: correct },
        { tone: "wrong", label: language === "en" ? "Incorrect" : "Sai", lines: wrong }
      ];
    }
    return single;
  }
  // (a) two structures compared.
  const sides = text.split(/\s+vs\.?\s+|\s+;\s+/iu).map((side) => side.trim()).filter(Boolean);
  if (sides.length === 2 && sides.every((side) => side.length >= 3) && sides.some((side) => side.includes("+")) && (/\s+vs\.?\s+/iu.test(text) || sides.every((side) => side.includes("+")))) {
    return sides.map((side, index) => {
      const labelled = side.match(/^([\p{L}][\p{L}'’ -]{1,30}):\s+(.+)$/u);
      const label = labelled && !labelled[1]!.includes("+") ? labelled[1]!.trim() : names.length === 2 ? names[index]!.trim() : undefined;
      return { tone: "neutral" as const, ...(label ? { label } : {}), lines: [labelled && label === labelled[1]!.trim() ? labelled[2]!.trim() : side] };
    });
  }
  return single;
}
