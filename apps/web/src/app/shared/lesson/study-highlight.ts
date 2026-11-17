import type { CefrLevel } from "@e4s/contracts";
import { findMonthlyGrammarCatalogTopic, monthlyGrammarCatalog, monthlyGrammarFormulaLines, monthlyGrammarMarkSpans, monthlyReadAloudTargetSpans, readMonthlyGrammarExampleMarks, type MonthlyGrammarCatalogTopic } from "@e4s/domain/monthly";

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
  "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did",
  "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't",
  "will", "won't", "would", "wouldn't", "can", "can't", "cannot", "could", "couldn't", "should", "shouldn't",
  "must", "mustn't", "might", "may", "shall", "going", "to", "used", "'m", "'s", "'re", "'ll", "'ve", "'d"
]);
/** Verb placeholders ("V-ing", "base verb", "V3", "past participle", "động từ" …). */
const VERB_PLACEHOLDER = /^(?:v(?:[0-3]|-?ing|-?ed|-?e?s|\+e?s|-inf)?|verb(?:-?ing|-?ed|-?e?s|\+e?s)?|(?:base|main) (?:verb|form)|(?:bare )?infinitive|past participle|past (?:simple )?form|irregular(?: past)?(?: (?:form|verb))?|(?:stative|state) verbs?|present simple verb|động từ(?: (?:nguyên mẫu|nguyên thể|thêm -e?s))?|v nguyên mẫu)$/u;
const TO_INFINITIVE = /^(?:to-infinitive|to infinitive|to-inf)$/u;
const REPORTING_SLOT = /^reporting verbs?$/u;
const ENDING = /^-[a-z]{1,3}$/u;
const SUBJECT_PRONOUNS = new Set(["i", "you", "we", "they", "he", "she", "it"]);
const OTHER_PRONOUNS = new Set(["me", "him", "her", "us", "them", "my", "your", "his", "its", "our", "their", "mine", "yours", "hers", "ours", "theirs"]);
const DETERMINERS = new Set(["the", "a", "an", "my", "our", "your", "his", "her", "their", "this", "that"]);
const ADVERBS_BETWEEN = new Set(["not", "never", "just", "already", "always", "usually", "often", "ever", "also", "still", "sometimes", "really", "yet"]);
/** Clause connectors: a slot made of these ("when/while", "Because") is key, and the words are marked in the examples. */
const CONNECTOR_WORDS = new Set(["when", "while", "before", "after", "because", "if", "unless", "until", "although", "though", "since"]);
const CONNECTOR_PHRASES = ["as soon as", "even though", "even if"];
/** and/but/or/so are key only as a list of connectors ("and/but/or/so/because"), never alone. */
const COORDINATORS = new Set(["and", "but", "or", "so"]);
const REPORTING_VERBS = new Set(["said", "told", "asked", "explained", "noted", "mentioned", "confirmed", "clarified", "reported", "suggested", "advised", "reminded", "warned", "promised", "agreed", "offered", "refused", "invited", "encouraged", "announced", "stated", "claimed", "admitted", "denied", "insisted", "recommended", "requested", "urged", "replied", "added", "argued", "complained", "informed", "instructed", "emphasised", "emphasized", "highlighted"]);
/** Common irregular past / participle forms: marked only when the formula itself lists them. */
const IRREGULAR_FORMS = new Set([
  "went", "gone", "saw", "seen", "came", "took", "taken", "gave", "given", "made", "sent", "wrote", "written", "began", "begun", "became",
  "knew", "known", "grew", "grown", "drew", "drawn", "flew", "flown", "chose", "chosen", "spoke", "spoken", "broke", "broken", "drove", "driven",
  "rose", "risen", "fell", "fallen", "forgot", "forgotten", "got", "gotten", "paid", "heard", "left", "lost", "won", "led", "spent", "built",
  "sold", "told", "said", "thought", "brought", "bought", "taught", "caught", "kept", "held", "met", "ran", "sat", "stood", "understood",
  "found", "felt", "meant", "done", "ate", "eaten", "slept", "wore", "worn", "threw", "thrown", "woke", "woken", "lent", "dealt", "sought",
  "fought", "shown", "proven"
]);
/** Words ending in -ed / -ing that are not verb forms. */
const ED_STOP = new Set(["need", "feed", "speed", "indeed", "red", "bed", "seed", "weed", "deed", "greed", "breed", "bleed", "proceed", "succeed", "exceed", "shed", "hundred", "sacred", "naked", "wicked", "embed", "wed"]);
const ING_STOP = new Set(["thing", "nothing", "something", "anything", "everything", "morning", "evening", "during", "ceiling", "king", "ring", "bring", "string", "spring", "swing", "sting", "wing", "meeting", "building", "training", "briefing", "booking", "wedding", "heading", "setting", "ending", "sibling", "pudding", "earring"]);
const S_STOP = new Set(["always", "sometimes", "perhaps", "towards", "its", "this", "his", "hers", "ours", "yours", "theirs", "was", "has", "does", "plus", "thus", "yes", "less", "unless", "across", "news", "series", "sales", "lots", "means", "besides"]);
/** Words that can follow a present-simple -s verb right after a short subject ("The client meets our team"). */
const AFTER_S_VERB = new Set(["to", "at", "in", "on", "from", "for", "with", "by", "about", "into", "of", "up", "out", "over", "after", "before", "every", "each", "some", "all", "its", "that", "what", "when", "if", "and", "but", "us", "me", "him", "her", "them", "it", "you"]);
/** Non-verbs often written after "to" ("move to late November"). */
const NOT_AFTER_TO = new Set(["late", "early", "next", "last", "all", "each", "every", "one", "two", "three", "home", "lunch", "everyone", "everybody", "someone", "me", "him", "her", "us", "them", "it", "you", "do"]);
const CLITIC_FORMS: Record<string, string[]> = { "'m": ["am"], "'re": ["are"], "'s": ["is", "has"], "'ll": ["will"], "'ve": ["have"], "'d": ["had", "would"] };

/** What a tense-name slot ("past continuous", "past simple") means in an example sentence. */
interface TenseRule { aux?: string[]; verb?: "ing" | "ed" | "any"; ed?: boolean }
const PAST_CONTINUOUS: TenseRule = { aux: ["was", "were", "wasn't", "weren't"], verb: "ing" };
const PRESENT_CONTINUOUS: TenseRule = { aux: ["am", "is", "are", "isn't", "aren't", "'m", "'re", "'s"], verb: "ing" };
const PAST_SIMPLE: TenseRule = { ed: true };
const FUTURE_SIMPLE: TenseRule = { aux: ["will", "won't", "'ll"], verb: "any" };
const TENSES = new Map<string, TenseRule>([
  ["past continuous", PAST_CONTINUOUS], ["past progressive", PAST_CONTINUOUS],
  ["present continuous", PRESENT_CONTINUOUS], ["present progressive", PRESENT_CONTINUOUS],
  ["past simple", PAST_SIMPLE], ["simple past", PAST_SIMPLE],
  ["present perfect", { aux: ["have", "has", "haven't", "hasn't", "'ve"], verb: "ed" }],
  ["past perfect", { aux: ["had", "hadn't", "'d"], verb: "ed" }],
  ["future simple", FUTURE_SIMPLE], ["simple future", FUTURE_SIMPLE],
  // Present simple has no form that is safe to mark: the name is key in the formula only.
  ["present simple", {}], ["simple present", {}]
]);
const TENSE_NAMES = [...TENSES.keys()].join("|");
const TENSE_NAME = new RegExp(`^(?:the )?(${TENSE_NAMES})(?: tense)?$`, "u");
/** A side that starts with a tense name ("Present Simple cho lịch cố định"); not "present perfect continuous". */
const TENSE_LEAD = new RegExp(`^(?:the\\s+)?(${TENSE_NAMES})(?!\\s+(?:continuous|progressive|perfect))(?=$|[\\s(,:])`, "iu");
const tenseOf = (value: string) => TENSES.get(value.toLocaleLowerCase("en").replace(/^the\s+/u, "").replace(/\s+tense$/u, "").replace(/\s+/gu, " "));
/** A formula that names the -s form of the verb ("-s/-es", "V+s", "(s/es)", "thêm -s"). */
const S_FORM = /(?<![a-z])-e?s\b|\bv\s?\+\s?e?s\b|\(e?s\s?\/\s?es\)|\bverb\s?\+\s?e?s\b/iu;

type PieceKind = "aux" | "verb" | "ending" | "pair" | "subj" | "pron" | "connector" | "coord" | "tense" | "reporting" | "toinf" | "phrase";
interface Slot {
  text: string; kinds: PieceKind[]; neutral: boolean; aux: string[]; verb?: "ing" | "ed" | "any";
  /** The slot names the -ing / -ed form itself ("V-ing", "verb-ed", "-ed", "irregular"). */
  form?: "ing" | "ed";
  connectors: string[]; tenses: TenseRule[]; pronouns: string[]; reporting: boolean; toInf: boolean;
  /** A short compared phrase ("have got" in "have got (now) vs had (past)"). */
  phrase?: string;
  /** Only the first characters are key (the tense name of "Present Simple cho lịch cố định"). */
  prefix?: number;
  /** A neutral subject slot ("Subject", "I/We/They", "I usually") or a pronoun list: the next verb is the subject's verb. */
  subjectLike: boolean;
}

/** "I'm", "she's", "they'll": a subject pronoun contracted with its auxiliary. */
const PRONOUN_CONTRACTION = /^(?:i|you|we|they|he|she|it)(?:'m|'re|'s|'ll|'ve|'d)$/u;

const isForm = (word: string) => AUX_WORDS.has(word) || word === "not";

/** The auxiliary words of a "pronoun + form" piece ("He is" → is, "I am not" → am, not) or of a question
 * piece ("Is he" → is); undefined otherwise. */
function pairForms(words: readonly string[]): string[] | undefined {
  if (words.length === 1 && PRONOUN_CONTRACTION.test(words[0]!)) return [words[0]!];
  if (words.length < 2) return undefined;
  if (SUBJECT_PRONOUNS.has(words[0]!)) {
    const forms = words.slice(1);
    return forms.every(isForm) && !forms.every((word) => word === "to" || word === "not") ? forms : undefined;
  }
  // Question order: "Am I", "Is he", "Aren't they".
  if (words.length === 2 && AUX_WORDS.has(words[0]!) && words[0] !== "to" && SUBJECT_PRONOUNS.has(words[1]!)) return [words[0]!];
  return undefined;
}

const cleanPieceText = (piece: string) => piece.trim().toLocaleLowerCase("en").replace(/’/gu, "'").replace(/^\[(.*)\]$/u, "$1").replace(/[?.!,…]+$/u, "");
const pieceWords = (piece: string) => cleanPieceText(piece).split(/\s+/u).filter(Boolean);
const withoutNotes = (text: string) => text.replace(/\([^)]*\)/gu, " ").replace(/\s+/gu, " ").trim();

/** One "/"-separated piece of a slot: auxiliary word(s), a verb placeholder, an ending, a "pronoun + form" pair,
 * a pronoun, a connector or a tense name; otherwise undefined. */
function pieceKind(piece: string): PieceKind | undefined {
  const value = cleanPieceText(piece);
  if (!value) return undefined;
  if (ENDING.test(value)) return "ending";
  if (VERB_PLACEHOLDER.test(value)) return "verb";
  if (TO_INFINITIVE.test(value)) return "toinf";
  if (REPORTING_SLOT.test(value)) return "reporting";
  if (TENSE_NAME.test(value)) return "tense";
  if (CONNECTOR_WORDS.has(value) || CONNECTOR_PHRASES.includes(value)) return "connector";
  if (COORDINATORS.has(value)) return "coord";
  if (SUBJECT_PRONOUNS.has(value)) return "subj";
  if (OTHER_PRONOUNS.has(value)) return "pron";
  const words = value.split(/\s+/u);
  // "do not", "is not", "will not": the full negative counts as the auxiliary.
  if (words.every(isForm) && !words.every((word) => word === "to" || word === "not")) return "aux";
  if (pairForms(words)) return "pair";
  return undefined;
}

const emptySlot = (text: string): Slot => ({ text, kinds: [], neutral: true, aux: [], connectors: [], tenses: [], pronouns: [], reporting: false, toInf: false, subjectLike: false });

/** A slot is key when every piece of its main text (outside parentheses) is a key piece. */
function readSlot(text: string): Slot {
  const main = withoutNotes(text);
  const pieces = main.split(/\s*\/\s*|\s+or\s+/u).map((piece) => piece.trim()).filter(Boolean);
  const raw = pieces.map(pieceKind);
  const hasPair = raw.includes("pair");
  // "me / him / them", "my / his / their", "I / he / they (chủ ngữ)": a pronoun table; bare "I/We/They" is a subject.
  const pronounList = raw.length > 0 && raw.every((kind) => kind === "subj" || kind === "pron") && (raw.includes("pron") || (raw.length >= 2 && /chủ ngữ|subject/iu.test(text)));
  const connectorList = raw.length >= 2 && raw.every((kind) => kind === "connector" || kind === "coord");
  const kinds = raw.map((kind) => kind === "subj" ? (pronounList ? "pron" : hasPair ? "subj" : undefined)
    : kind === "pron" ? (pronounList ? "pron" : undefined)
      : kind === "coord" ? (connectorList ? "connector" : undefined) : kind);
  const key = pieces.length > 0 && kinds.every(Boolean) && !kinds.every((kind) => kind === "subj");
  const slot = emptySlot(text);
  if (!key) {
    slot.subjectLike = Boolean(main) && !pieceWords(main).some((word) => AUX_WORDS.has(word) || CONNECTOR_WORDS.has(word));
    return slot;
  }
  const keyKinds = kinds as PieceKind[];
  slot.kinds = keyKinds;
  slot.neutral = false;
  const of = (kind: PieceKind) => pieces.filter((_, index) => keyKinds[index] === kind);
  slot.aux = [
    ...of("aux").flatMap((piece) => piece.toLocaleLowerCase("en").split(/\s+/u)),
    // "I am / He is / They are": only the forms are key, the pronouns stay plain.
    ...of("pair").flatMap((piece) => pairForms(pieceWords(piece)) ?? [])
  ].filter((word) => word !== "to");
  slot.connectors = of("connector").map(cleanPieceText);
  slot.pronouns = of("pron").map(cleanPieceText);
  slot.tenses = of("tense").flatMap((piece) => tenseOf(cleanPieceText(piece)) ?? []);
  slot.reporting = keyKinds.includes("reporting");
  slot.toInf = keyKinds.includes("toinf");
  slot.subjectLike = keyKinds.every((kind) => kind === "pron");
  const verbPieces = pieces.map(cleanPieceText).filter((piece, index) => keyKinds[index] === "verb" || (keyKinds[index] === "ending" && /^-(?:ing|ed)$/u.test(piece)));
  if (verbPieces.length) {
    const verbs = verbPieces.join(" ");
    slot.verb = /ing\b/u.test(verbs) ? "ing" : /(?:-|\b)ed\b|participle|v3|irregular/u.test(verbs) && !/v-?s\b/u.test(verbs) ? "ed" : "any";
    if (verbPieces.some((piece) => /^(?:v-?|verb-?|-)ing$/u.test(piece))) slot.form = "ing";
    else if (verbPieces.some((piece) => /^(?:v-?|verb-?|-)ed$|^irregular/u.test(piece))) slot.form = "ed";
  }
  return slot;
}

/** A compared phrase side ("have got (now)"): its main text is key. */
function phraseSlot(text: string): Slot {
  return { ...emptySlot(text), kinds: ["phrase"], neutral: false, phrase: cleanPieceText(withoutNotes(text)) };
}

/** Splits at a separator outside parentheses, keeping the separators (the parts and separators rebuild the text). */
function splitTop(text: string, separator: RegExp): { parts: string[]; seps: string[] } {
  const parts: string[] = [];
  const seps: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      separator.lastIndex = index;
      const found = separator.exec(text);
      if (found?.[0] && index > start) {
        parts.push(text.slice(start, index));
        seps.push(found[0]);
        index += found[0].length - 1;
        start = index + 1;
      }
    }
  }
  parts.push(text.slice(start));
  return { parts, seps };
}

function slotSegments(slot: Slot): HighlightSegment[] {
  if (slot.prefix !== undefined) return [{ text: slot.text.slice(0, slot.prefix), mark: true }, ...plain(slot.text.slice(slot.prefix))];
  const out: HighlightSegment[] = [];
  // Key text outside parentheses is marked; inside parentheses only endings ("-s/-es") are.
  for (const chunk of slot.text.split(/(\([^)]*\))/u)) {
    if (!chunk) continue;
    if (chunk.startsWith("(")) {
      for (const part of chunk.split(/((?<![A-Za-z])-[a-z]{1,3}(?:\/-[a-z]{1,3})*)(?![a-z])/u)) out.push({ text: part, mark: /^-[a-z]{1,3}(?:\/-[a-z]{1,3})*$/u.test(part) });
    } else if (slot.neutral) out.push({ text: chunk, mark: false });
    else if (slot.kinds.includes("pair")) {
      // Piece by piece: a "pronoun + form" pair marks the form only; a bare pronoun stays plain; other key pieces are marked whole.
      chunk.split(/(\/)/u).forEach((piece, index) => {
        if (index % 2) { out.push({ text: piece, mark: false }); return; }
        const lead = piece.match(/^\s*/u)![0];
        const tail = piece.match(/[\s?.!,]*$/u)![0];
        const body = piece.slice(lead.length, Math.max(lead.length, piece.length - tail.length));
        const kind = pieceKind(body);
        out.push({ text: lead, mark: false });
        if (kind === "pair" && pieceWords(body).length > 1) {
          // Only the forms are marked; the pronoun stays plain whichever side it is on.
          const forms = new Set(pairForms(pieceWords(body)) ?? []);
          for (const word of body.split(/(\s+)/u)) out.push({ text: word, mark: forms.has(word.toLocaleLowerCase("en").replace(/’/gu, "'")) });
        } else out.push({ text: body, mark: Boolean(kind) && kind !== "subj" });
        out.push({ text: tail, mark: false });
      });
    } else {
      // A leading "/" or "or" after a note ("V-ed (regular) / irregular") is a separator, not key text.
      const lead = chunk.match(/^[\s/]*(?:or\s+)?/u)![0];
      const tail = chunk.match(/[\s?.!,…]*$/u)![0];
      out.push({ text: lead, mark: false }, { text: chunk.slice(lead.length, Math.max(lead.length, chunk.length - tail.length)), mark: true }, { text: tail, mark: false });
    }
  }
  return out;
}

interface FormulaLine { label: string; pattern: string; examples: string; slots: Slot[]; seps: string[] }

/** "Question: Do/Does + subject + V?" → label, pattern and the formula's own examples after ": ". */
function readFormulaLine(line: string): FormulaLine {
  let rest = line;
  let label = "";
  const first = rest.indexOf(": ");
  if (first > 0 && !rest.slice(0, first).includes("+") && first <= 30) { label = rest.slice(0, first + 2); rest = rest.slice(first + 2); }
  let examples = "";
  const next = rest.indexOf(": ");
  if (next > 0 && rest.slice(0, next).includes("+")) { examples = rest.slice(next); rest = rest.slice(0, next); }
  const done = (slots: Slot[], seps: string[] = []): FormulaLine => ({ label, pattern: rest, examples, slots, seps });
  // "Subject + was/were + V-ing", "If + past simple, would + V": slots between " + " (and ", ") outside parentheses.
  if (rest.includes(" + ")) { const split = splitTop(rest, /\s\+\s|,\s+/uy); return done(split.parts.map(readSlot), split.seps); }
  const formsOnly = rest.includes("/") && rest.split("/").every((piece) => { const kind = pieceKind(piece); return kind === "pair" || kind === "aux"; });
  if (formsOnly) return done([readSlot(rest)]);
  const whole = readSlot(rest);
  if (!whole.neutral && whole.kinds.every((kind) => kind === "pron")) return done([whole]);
  // "Present Simple cho lịch cố định / Present Continuous cho việc …": the tense names lead each side.
  const sides = splitTop(rest, /\s+vs\.?\s+|\s+\/\s+/iuy);
  if (sides.parts.length >= 2 && sides.parts.every((side) => TENSE_LEAD.test(side))) {
    return done(sides.parts.map((side) => {
      const name = side.match(TENSE_LEAD)![0];
      return { ...emptySlot(side), kinds: ["tense"], neutral: false, tenses: [tenseOf(name)!], prefix: name.length };
    }), sides.seps);
  }
  // "have got (now) vs had (past)": two short phrases compared, each key.
  if (/\s+vs\.?\s+/iu.test(rest)) {
    const compared = splitTop(rest, /\s+vs\.?\s+/iuy);
    const short = (side: string) => { const tokens = withoutNotes(side).split(/\s+/u).filter(Boolean); return tokens.length >= 1 && tokens.length <= 3 && tokens.every((token) => /^[A-Za-z][A-Za-z'’-]*$/u.test(token)); };
    if (compared.parts.length >= 2 && compared.parts.every(short)) {
      return done(compared.parts.map((side) => { const slot = readSlot(side); return slot.kinds.length === 1 && slot.kinds[0] === "tense" ? slot : phraseSlot(side); }), compared.seps);
    }
  }
  return done([]);
}

/** Rules for marking example words, collected from all formula lines. */
export interface GrammarExampleMatcher {
  aux: Set<string>;
  follow: Array<{ verb: "ing" | "ed" | "any"; skipSubject: boolean }>;
  subjectVerb: boolean;
  /** Verb forms named by the formula ("I work / She manages", listed irregular pasts). */
  verbs: Set<string>;
  /** Exact words that are key wherever they occur (pronoun tables, connectors). */
  words: Set<string>;
  /** Multi-word key phrases ("as soon as", "have got"). */
  phrases: string[][];
  /** Tense-name slots: the auxiliary is marked only together with the verb form that follows it. */
  tenseForms: Array<{ aux: Set<string>; verb: "ing" | "ed" | "any" }>;
  /** Any -ed / -ing verb form (outside a stoplist, not after a determiner). */
  ed: boolean;
  ing: boolean;
  /** The -s verb after a short sentence-initial subject ("The client meets our team"). */
  sForm: boolean;
  reporting: boolean;
  toInf: boolean;
}

function words(sentence: string): string[] {
  return sentence.match(/[A-Za-z][A-Za-z'’]*/gu)?.map((word) => word.toLocaleLowerCase("en").replace(/’/gu, "'")) ?? [];
}

/** "I am not / He isn't + …; Am I…? / Is he…?": several patterns on one line. " || ", " | " and " · " always
 * separate patterns; "; " does when the line has no examples part or every part is a "+" pattern. */
function clauses(line: string): { parts: string[]; seps: string[] } {
  const hard = splitTop(line, /\s+\|\|?\s+|\s+·\s+/uy);
  const parts: string[] = [];
  const seps: string[] = [];
  hard.parts.forEach((part, index) => {
    if (index) seps.push(hard.seps[index - 1]!);
    const soft = part.includes("; ") ? splitTop(part, /;\s+/uy) : { parts: [part], seps: [] };
    if (soft.parts.length > 1 && (!readFormulaLine(part).examples || soft.parts.every((piece) => piece.includes(" + ")))) {
      soft.parts.forEach((piece, at) => { if (at) seps.push(soft.seps[at - 1]!); parts.push(piece); });
    } else parts.push(part);
  });
  return { parts, seps };
}

/** Builds the example matcher of a (possibly multi-line) formula; null when no slot is key. */
export function grammarExampleMatcher(lines: readonly string[]): GrammarExampleMatcher | null {
  const matcher: GrammarExampleMatcher = { aux: new Set(), follow: [], subjectVerb: false, verbs: new Set(), words: new Set(), phrases: [], tenseForms: [], ed: false, ing: false, sForm: false, reporting: false, toInf: false };
  let any = false;
  // Error-check / "(NOT …)" lines are read rule by rule, as the formula box shows them (the wrong forms never count).
  const patterns = lines.flatMap((line) => ERROR_CHECK_LABEL.test(line) || NOT_NOTE.test(line)
    ? errorCheckRules(line.replace(/\s+/gu, " ").trim().replace(ERROR_CHECK_LABEL, "")).map((rule) => readErrorCheckRule(rule).pattern).filter(Boolean)
    : [line]);
  for (const raw of patterns) {
    let lineSubjectVerb = false;
    let linePast = false;
    for (const line of clauses(raw).parts.map(readFormulaLine)) {
      line.slots.forEach((slot, index) => {
        if (slot.neutral) return;
        any = true;
        for (const word of slot.aux) matcher.aux.add(word);
        for (const connector of slot.connectors) {
          if (connector.includes(" ")) matcher.phrases.push(connector.split(" "));
          else matcher.words.add(connector);
        }
        for (const pronoun of slot.pronouns) matcher.words.add(pronoun);
        if (slot.phrase) matcher.phrases.push(slot.phrase.split(/\s+/u));
        if (slot.reporting) matcher.reporting = true;
        if (slot.toInf) matcher.toInf = true;
        for (const tense of slot.tenses) {
          if (tense.aux && tense.verb) matcher.tenseForms.push({ aux: new Set(tense.aux), verb: tense.verb });
          if (tense.ed) { matcher.ed = true; linePast = true; }
        }
        if (!slot.verb) return;
        const before = line.slots[index - 1];
        const twoBack = line.slots[index - 2];
        const afterAux = Boolean(before && !before.neutral && before.aux.length);
        if (afterAux) matcher.follow.push({ verb: slot.verb, skipSubject: false });
        else if (before?.neutral && twoBack && !twoBack.neutral && twoBack.aux.length) matcher.follow.push({ verb: slot.verb, skipSubject: true });
        else if (before?.subjectLike && index === 1) {
          matcher.subjectVerb = true;
          lineSubjectVerb = true;
          // The formula's own short examples ("I work / She manages / The team meets") name the verb forms.
          for (const example of line.examples.replace(/^:\s*/u, "").split(/\s+\/\s+|;\s*/u)) {
            const tokens = words(example);
            if (!tokens.length || tokens.length > 4) continue;
            const verb = SUBJECT_PRONOUNS.has(tokens[0]!) ? tokens[1] : DETERMINERS.has(tokens[0]!) ? tokens[2] : undefined;
            if (verb && !AUX_WORDS.has(verb)) matcher.verbs.add(verb);
          }
        }
        // "verb + -ed", "Subject + V-ed", "at risk of + V-ing": the named form itself, wherever it is.
        if (slot.form && !afterAux) {
          matcher[slot.form] = true;
          if (slot.form === "ed") linePast = true;
        }
      });
    }
    // Irregular past forms count only when the formula itself lists them ("… then I sent it").
    if (linePast) for (const word of words(raw)) if (IRREGULAR_FORMS.has(word)) matcher.verbs.add(word);
    if (lineSubjectVerb && S_FORM.test(raw)) matcher.sForm = true;
  }
  return any ? matcher : null;
}

/** Marks the auxiliaries, verb forms, connectors and compared phrases of an example sentence that fill the formula's key slots. */
export function grammarExampleSegments(sentence: string, matcher: GrammarExampleMatcher | null): HighlightSegment[] {
  if (!matcher) return plain(sentence);
  const parts = sentence.split(/([A-Za-z][A-Za-z'’]*)/u);
  const tokens = parts.map((part, index) => index % 2 === 1 ? part.toLocaleLowerCase("en").replace(/’/gu, "'") : "");
  const wordIndexes = parts.map((_, index) => index).filter((index) => index % 2 === 1);
  const tok = (position: number) => tokens[wordIndexes[position] ?? -1] ?? "";
  // "all" marks the word; "clitic" marks only the contracted auxiliary of "I'm", "we're".
  const marked = new Map<number, "all" | "clitic">();
  const mark = (index: number | undefined, how: "all" | "clitic" = "all") => { if (index !== undefined && marked.get(index) !== "all") marked.set(index, how); };
  const target = (position: number, skipSubject: boolean, allowBe = false) => {
    let cursor = position + 1;
    if (skipSubject && SUBJECT_PRONOUNS.has(tok(cursor))) cursor += 1;
    while (ADVERBS_BETWEEN.has(tok(cursor))) cursor += 1;
    const index = wordIndexes[cursor];
    const word = index === undefined ? "" : tokens[index]!;
    if (!word || (AUX_WORDS.has(word) && !(allowBe && (word === "be" || word === "have"))) || SUBJECT_PRONOUNS.has(word) || DETERMINERS.has(word) || OTHER_PRONOUNS.has(word)) return undefined;
    return { index, word };
  };
  const auxHow = (set: Set<string>, token: string): "all" | "clitic" | undefined => {
    if (set.has(token)) return "all";
    if (PRONOUN_CONTRACTION.test(token)) { const clitic = token.slice(token.indexOf("'")); if (set.has(clitic) || CLITIC_FORMS[clitic]!.some((form) => set.has(form))) return "clitic"; }
    return undefined;
  };
  const midCapital = (position: number) => position > 0 && /^[A-Z]/u.test(parts[wordIndexes[position]!]!);
  const afterDeterminer = (position: number) => DETERMINERS.has(tok(position - 1));
  wordIndexes.forEach((index, position) => {
    const token = tokens[index]!;
    const how = auxHow(matcher.aux, token);
    if (how) {
      mark(index, how);
      for (const rule of matcher.follow) {
        const found = target(position, rule.skipSubject);
        // V-ing must end in -ing; V3/base forms can be irregular, so any verb-like word is accepted.
        if (found && (rule.verb !== "ing" || /..ing$/u.test(found.word))) mark(found.index);
      }
    }
    for (const form of matcher.tenseForms) {
      const tenseHow = auxHow(form.aux, token);
      if (!tenseHow) continue;
      const found = target(position, false, form.verb === "any");
      const fits = found && (form.verb === "ing" ? /..ing$/u.test(found.word) : form.verb === "ed" ? /^[a-z]{2,}(?:ed|en)$/u.test(found.word) || IRREGULAR_FORMS.has(found.word) : true);
      if (fits) { mark(index, tenseHow); mark(found.index); }
    }
    if (matcher.verbs.has(token) && !afterDeterminer(position)) mark(index);
    if (matcher.words.has(token)) mark(index);
    if (matcher.reporting && REPORTING_VERBS.has(token)) mark(index);
    if (matcher.ed && /^[a-z]{2,}ed$/u.test(token) && !ED_STOP.has(token) && !AUX_WORDS.has(token) && !afterDeterminer(position) && !midCapital(position)) mark(index);
    if (matcher.ing && /^[a-z]{2,}ing$/u.test(token) && !ING_STOP.has(token) && !afterDeterminer(position) && !midCapital(position)) mark(index);
    if (matcher.toInf && token === "to") {
      const next = wordIndexes[position + 1];
      const word = tok(position + 1);
      if (next !== undefined && parts[index + 1] === " " && /^[a-z]+$/u.test(parts[next]!) && !NOT_AFTER_TO.has(word) && !DETERMINERS.has(word) && !SUBJECT_PRONOUNS.has(word) && (!AUX_WORDS.has(word) || word === "be" || word === "have")) { mark(index); mark(next); }
    }
  });
  for (const phrase of matcher.phrases) {
    for (let position = 0; position + phrase.length <= wordIndexes.length; position += 1) {
      if (phrase.every((word, offset) => tok(position + offset) === word)) phrase.forEach((_, offset) => mark(wordIndexes[position + offset]));
    }
  }
  // "Subject + verb": the word right after a subject pronoun at the start of the sentence.
  if (matcher.subjectVerb && wordIndexes.length > 1 && SUBJECT_PRONOUNS.has(tok(0))) {
    let cursor = 1;
    while (ADVERBS_BETWEEN.has(tok(cursor))) cursor += 1;
    const index = wordIndexes[cursor];
    if (index !== undefined && !AUX_WORDS.has(tokens[index]!) && !DETERMINERS.has(tokens[index]!)) mark(index);
  }
  // "-s" verb after a one-word subject: "The client meets our team", "Linh checks the plan". Only when the next word
  // shows the verb has ended (a determiner, preposition or pronoun), so "Our team members work" stays plain.
  if (matcher.sForm && wordIndexes.length >= 2) {
    const sVerb = (position: number) => { const word = tok(position); return /^[a-z]{2,}s$/u.test(word) && !/(?:ss|us|is)$/u.test(word) && !S_STOP.has(word) && !AUX_WORDS.has(word) && !ADVERBS_BETWEEN.has(word); };
    const ended = (position: number) => { const next = tok(position + 1); return !next || AFTER_S_VERB.has(next) || DETERMINERS.has(next); };
    const verbAfter = (start: number) => { let cursor = start; while (ADVERBS_BETWEEN.has(tok(cursor))) cursor += 1; return sVerb(cursor) && ended(cursor) ? cursor : undefined; };
    const first = tok(0);
    const second = tok(1);
    let found: number | undefined;
    if (DETERMINERS.has(first) && second && !/s$/u.test(second) && !AUX_WORDS.has(second) && !OTHER_PRONOUNS.has(second)) found = verbAfter(2);
    else if (/^[A-Z][a-z]+$/u.test(parts[wordIndexes[0]!]!) && parts[wordIndexes[0]! + 1] === " " && !SUBJECT_PRONOUNS.has(first) && !DETERMINERS.has(first) && !CONNECTOR_WORDS.has(first) && !COORDINATORS.has(first) && !AUX_WORDS.has(first)) found = verbAfter(1);
    if (found !== undefined) mark(wordIndexes[found]);
  }
  return merge(parts.flatMap((text, index) => {
    const how = marked.get(index);
    if (how !== "clitic") return [{ text, mark: how === "all" }];
    const cut = text.search(/['’]/u);
    return [{ text: text.slice(0, cut), mark: false }, { text: text.slice(cut), mark: true }];
  }));
}

// ------------------------------------------------------------------ generated example marks

/** Marks the given spans of a text. */
function spanSegments(text: string, spans: ReadonlyArray<{ start: number; end: number }>): HighlightSegment[] {
  const out: HighlightSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    out.push({ text: text.slice(cursor, span.start), mark: false }, { text: text.slice(span.start, span.end), mark: true });
    cursor = span.end;
  }
  out.push({ text: text.slice(cursor), mark: false });
  return merge(out);
}

/**
 * The words the lesson model marked for one example (`exampleMarks[index].marks`, generated since 13/11);
 * undefined when the block stores no marks (older lessons keep the formula-based matcher).
 */
export function grammarExampleMarkWords(exampleMarks: unknown, index: number): string[] | undefined {
  const marks = readMonthlyGrammarExampleMarks(exampleMarks);
  if (!marks) return undefined;
  return marks[index]?.marks ?? [];
}

/**
 * An example sentence with exactly its generated marks highlighted (whole words, as the server checks them)
 * and nothing else; a "Wrong: … Right: …" example only in its right sentence.
 */
export function grammarMarkedExampleSegments(sentence: string, marks: readonly string[]): HighlightSegment[] {
  return spanSegments(sentence, monthlyGrammarMarkSpans(sentence, marks).spans);
}

// ------------------------------------------------------------------ read-aloud passage

/**
 * The read-aloud passage with its target words and phrases marked, each occurrence the server counts:
 * longer targets first, whole words, a word inside a marked phrase not again. No targets → plain.
 */
export function readAloudPassageSegments(passage: string, targets: readonly string[] | undefined): HighlightSegment[] {
  if (!targets?.length) return plain(passage);
  return spanSegments(passage, monthlyReadAloudTargetSpans(passage, targets));
}

/** One formula line with its key slots (and the matching words of its own examples) marked. */
export function grammarFormulaSegments(line: string, matcher: GrammarExampleMatcher | null = grammarExampleMatcher([line])): HighlightSegment[] {
  const { parts, seps } = clauses(line);
  if (parts.length > 1) return merge(parts.flatMap((part, index) => [...(index ? plain(seps[index - 1]!) : []), ...grammarFormulaSegments(part, matcher)]));
  const parsed = readFormulaLine(line);
  if (!parsed.slots.length || parsed.slots.every((slot) => slot.neutral && !/\(-[a-z]/u.test(slot.text))) return plain(line);
  const pattern = parsed.slots.flatMap((slot, index) => [...(index ? plain(parsed.seps[index - 1] ?? " + ") : []), ...slotSegments(slot)]);
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

/** One rule row of an error-check formula: the pattern (highlighted), its notes (muted) and its own wrong forms (red). */
export interface GrammarFormulaRule { pattern: string; notes: string[]; wrong: string[] }
export interface GrammarFormulaBox { tone: "neutral" | "correct" | "wrong"; label?: string; lines: string[]; rules?: GrammarFormulaRule[] }

const CORRECT_MARKER = /^(?:✓|✔|✅|(?:đúng|correct|right)\s*:)/iu;
const MARKER = /(✓|✔|✅|✗|✘|❌|(?<![\p{L}])(?:đúng|sai|correct|right|wrong|incorrect|not)\s*:)/iu;
/** Roadmap "common errors" label: shown to nobody, it only says the line lists error rules. */
const ERROR_CHECK_LABEL = /^\s*(?:error check|common errors?|common mistakes?|lỗi thường gặp)\s*:\s*/iu;
/** "(NOT is knowing)": the wrong form of the rule it follows. Upper-case NOT only, so a "(not)" slot stays a slot. */
const NOT_NOTE = /\(\s*NOT\s+[^)]+\)/u;
const NOT_NOTES = /\s*\(\s*NOT\s+([^)]+)\)/gu;

/** The separate rules of an error-check line: split at " / " between two "+" patterns, and at " vs ". */
function errorCheckRules(text: string): string[] {
  const { parts, seps } = splitTop(text, /\s+\/\s+|\s+vs\.?\s+/iuy);
  const rules: string[] = [];
  parts.forEach((part, index) => {
    const separator = seps[index - 1] ?? "";
    const previous = rules[rules.length - 1];
    // "verb-ed / irregular", "I am / He is": alternatives of one rule stay together.
    if (previous !== undefined && separator.includes("/") && !(part.includes(" + ") && previous.includes(" + "))) rules[rules.length - 1] = `${previous}${separator}${part}`;
    else rules.push(part);
  });
  return rules.map((rule) => rule.trim()).filter(Boolean);
}

/** "[subject] + state verb (NOT is knowing) (note)" → the pattern, its notes and the rule's own wrong forms. */
function readErrorCheckRule(rule: string): GrammarFormulaRule {
  const wrong = [...rule.matchAll(NOT_NOTES)].map((found) => found[1]!.trim()).filter(Boolean);
  const rest = rule.replace(NOT_NOTES, " ");
  // "(not)" is a slot of the pattern; every other parenthesis is a note.
  const notes = (rest.match(/\([^)]*\)/gu) ?? []).filter((note) => !/^\(\s*not\s*\)$/iu.test(note));
  const pattern = notes.reduce((value, note) => value.replace(note, " "), rest).replace(/\s+/gu, " ").trim();
  return { pattern, notes, wrong };
}

/** "Wrong: She work in Hanoi. Right: She works in Hanoi." (also Sai:/Đúng:, Incorrect:/Correct:, ✗/✓, either order). */
const WRONG_MARK = String.raw`(?:wrong|incorrect|sai|✗|✘|❌)`;
const RIGHT_MARK = String.raw`(?:right|correct|đúng|✓|✔|✅)`;
const PAIR_SEPARATOR = String.raw`\s*(?:→|->|—|–|;|\|)?\s*`;
const WRONG_FIRST = new RegExp(String.raw`^\s*${WRONG_MARK}\s*:\s*(.+?)${PAIR_SEPARATOR}${RIGHT_MARK}\s*:\s*(.+?)\s*$`, "iu");
const WRONG_FIRST_SYMBOL = new RegExp(String.raw`^\s*[✗✘❌]\s*(.+?)${PAIR_SEPARATOR}[✓✔✅]\s*:?\s*(.+?)\s*$`, "u");
const RIGHT_FIRST = new RegExp(String.raw`^\s*${RIGHT_MARK}\s*:\s*(.+?)${PAIR_SEPARATOR}${WRONG_MARK}\s*:\s*(.+?)\s*$`, "iu");
const RIGHT_FIRST_SYMBOL = new RegExp(String.raw`^\s*[✓✔✅]\s*(.+?)${PAIR_SEPARATOR}[✗✘❌]\s*:?\s*(.+?)\s*$`, "u");

/** A wrong/right example split into its two sentences; undefined for an ordinary example. */
export function grammarExamplePair(example: string): { wrong: string; right: string } | undefined {
  const text = example.replace(/\s+/gu, " ").trim();
  const wrongFirst = text.match(WRONG_FIRST) ?? text.match(WRONG_FIRST_SYMBOL);
  const rightFirst = wrongFirst ? undefined : text.match(RIGHT_FIRST) ?? text.match(RIGHT_FIRST_SYMBOL);
  const wrong = (wrongFirst?.[1] ?? rightFirst?.[2])?.trim();
  const right = (wrongFirst?.[2] ?? rightFirst?.[1])?.trim();
  return wrong && right ? { wrong, right } : undefined;
}

const cleanPiece = (value: string) => value.replace(/^[\s/;,.()]+|[\s/;,(]+$/gu, "").replace(/^([^()]*)\)$/u, "$1").trim();

/**
 * Splits a formula into the boxes it shows: one neutral box normally; a green "correct" and a red "wrong" box when
 * the text marks a wrong pattern (✓/✗, "Đúng:/Sai:", "Correct:/Wrong:", "not: …"); two neutral boxes for a
 * comparison of two structures ("A vs B" with a "+" pattern on a side). Unsure → one box, one row per formula
 * line and per top-level ";" rule.
 */
export function grammarFormulaBoxes(formula: string, language: "vi" | "en", splitLines: (formula: string) => string[] = monthlyGrammarFormulaLines, names: readonly string[] = []): GrammarFormulaBox[] {
  const displayFormula = formula
    .replace(/(\bam\s*\/\s*is\s*\/\s*are\b)\s*(?:\+\s*)?\((?:không\s+(?:được\s+)?(?:bỏ(?:\s+quên)?|lược\s+bỏ)|do\s+not\s+omit|don['’]t\s+omit)\)/giu, "$1")
    .replace(/^(.*\b(?:do(?:\s*\/\s*|\s+or\s+)does|do|does)\b.*?\+\s*V)\s*\?/gimu, "$1 (base form)?")
    .replace(/\b(I\s*\/\s*you\s*\/\s*we\s*\/\s*they)(?=\s*\+\s*V\b(?!\s*-))/giu, language === "vi" ? "$1/chủ ngữ số nhiều" : "$1/plural subject")
    .replace(/\b(he\s*\/\s*she\s*\/\s*it)(?=\s*\+\s*V\s*-\s*s\b)/giu, language === "vi" ? "$1/chủ ngữ số ít" : "$1/singular subject");
  const text = displayFormula.replace(/\s+/gu, " ").trim();
  const single: GrammarFormulaBox[] = [{ tone: "neutral", lines: splitLines(displayFormula) }];
  if (!text) return single;
  // (c) "Error check: …" and "(NOT …)" rules: one neutral box, never a two-structure compare, one row per rule; a
  // "(NOT …)" wrong form stays on its own rule's row and other notes in parentheses become that row's muted notes.
  if (ERROR_CHECK_LABEL.test(text) || NOT_NOTE.test(text)) {
    const rules = errorCheckRules(text.replace(ERROR_CHECK_LABEL, "")).map(readErrorCheckRule).filter((rule) => rule.pattern || rule.wrong.length);
    if (rules.length) return [{ tone: "neutral", lines: rules.map((rule) => rule.pattern), rules }];
  }
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
  // (a) two structures compared ("A vs B" on one formula line). Rules on several lines or separated by ";"
  // are one rule per row of a single band (16/11), the rows the gate numbers (monthlyGrammarFormulaLines).
  const sides = monthlyGrammarFormulaLines(formula).length === 1 ? text.split(/\s+vs\.?\s+/iu).map((side) => side.trim()).filter(Boolean) : [];
  if (sides.length === 2 && sides.every((side) => side.length >= 3) && sides.some((side) => side.includes("+"))) {
    return sides.map((side, index) => {
      const labelled = side.match(/^([\p{L}][\p{L}'’ -]{1,30}):\s+(.+)$/u);
      const label = labelled && !labelled[1]!.includes("+") ? labelled[1]!.trim() : names.length === 2 ? names[index]!.trim() : undefined;
      return { tone: "neutral" as const, ...(label ? { label } : {}), lines: [labelled && label === labelled[1]!.trim() ? labelled[2]!.trim() : side] };
    });
  }
  return single;
}
