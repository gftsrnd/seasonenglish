/**
 * Grammar formula vs examples (live B1 24/12, Bài 15): each rule row of a
 * grammar step's formula must have at least one example that uses it, and every
 * example must use at least one row. The learner highlighter (web
 * study-highlight.ts) only marks what the formula lists, so a step whose
 * examples teach another structure looks randomly highlighted.
 *
 * The check is deterministic and conservative: a row whose structure cannot be
 * read (present simple, "subject + verb", Vietnamese slot names, free text) is
 * never reported and never makes an example "unmatched".
 */

/** Light finding code (advisory: never counts toward the two-light-finding approval limit). */
export const MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH = "MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH";

/** Light finding codes that are shown to the Operator but neither block approval nor count toward the light-finding limit. */
export const MONTHLY_ADVISORY_FINDING_CODES: readonly string[] = [MONTHLY_GRAMMAR_FORMULA_EXAMPLE_MISMATCH];

export function isMonthlyAdvisoryFinding(finding: { code: string }): boolean {
  return MONTHLY_ADVISORY_FINDING_CODES.includes(finding.code);
}

/** The light findings that count toward the approval limit and need an acknowledgement (advisory ones removed). */
export function monthlyGatedLightFindings<T extends { code: string }>(light: readonly T[]): T[] {
  return light.filter((finding) => !isMonthlyAdvisoryFinding(finding));
}

// ------------------------------------------------------------------ tokens

const ADVERBS = new Set(["not", "never", "just", "already", "always", "usually", "often", "ever", "also", "still", "sometimes", "really", "now", "currently", "constantly"]);
const SUBJECT_PRONOUNS = new Set(["i", "you", "we", "they", "he", "she", "it"]);
const PRESENT_BE = new Set(["am", "is", "are", "'s"]);
const NOUN_DETERMINERS = new Set(["a", "an", "the", "this", "that", "these", "those", "our", "your", "their", "my", "his", "her", "its"]);
const S_CLITIC_HOSTS = new Set(["it", "he", "she", "that", "there", "what", "who", "here", "where", "how"]);
const BE_FORMS = new Set(["am", "is", "are", "was", "were", "be", "been", "being", "'s", "'m", "'re"]);

/** Lower-case words with contractions expanded ("isn't" → is not, "we're" → we are, "client's" → client). */
export function grammarTokens(text: string): string[] {
  const raw = text.toLocaleLowerCase("en-US").replace(/[’‘`]/gu, "'").match(/[a-z]+(?:'[a-z]+)*/gu) ?? [];
  const out: string[] = [];
  for (const word of raw) {
    if (word === "won't") { out.push("will", "not"); continue; }
    if (word === "can't" || word === "cannot") { out.push("can", "not"); continue; }
    if (word === "shan't") { out.push("shall", "not"); continue; }
    if (word === "ain't") { out.push("is", "not"); continue; }
    if (word === "let's") { out.push("let", "us"); continue; }
    if (word.endsWith("n't")) { out.push(word.slice(0, -3), "not"); continue; }
    const clitic = /^([a-z]+)'(m|re|ve|ll|d|s)$/u.exec(word);
    if (clitic) {
      const [, host, tail] = clitic as unknown as [string, string, string];
      out.push(host);
      if (tail === "m") out.push("am");
      else if (tail === "re") out.push("are");
      else if (tail === "ve") out.push("have");
      else if (tail === "ll") out.push("will");
      else if (tail === "d") out.push("'d");
      else if (S_CLITIC_HOSTS.has(host)) out.push("'s");
      continue;
    }
    out.push(word.replace(/'.*$/u, ""));
  }
  return out;
}

function sameWord(pattern: string, token: string): boolean {
  if (pattern === token) return true;
  if (pattern === "be") return BE_FORMS.has(token);
  if (pattern === "have") return token === "has";
  if (token === "'s") return pattern === "is" || pattern === "has";
  if (token === "'d") return pattern === "would" || pattern === "had";
  if (LEXICAL_LITERALS.has(pattern)) return token === `${pattern}s` || token === `${pattern}es` || token === `${pattern}ed` || token === `${pattern}d`;
  return false;
}

// ------------------------------------------------------------------ word lists

/** Function words a formula may name literally ("always", "used to", "have got", "on the point of"). */
const FUNCTION_WORDS = new Set([
  "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did",
  "will", "would", "can", "could", "shall", "should", "may", "might", "must", "ought", "'s", "'d",
  "not", "never", "always", "usually", "often", "sometimes", "rarely", "already", "just", "yet", "still", "ever", "also",
  "since", "for", "ago", "by", "when", "while", "before", "after", "because", "if", "unless", "until", "although", "though",
  "as", "soon", "even", "only", "so", "and", "but", "or", "than", "used", "use", "to", "going", "got", "get", "able", "about", "due",
  "on", "the", "point", "of", "that", "who", "which", "what", "whose", "whom", "where", "there", "it", "wish", "need", "hope", "rather", "better",
  "wondering", "once", "whether", "neither", "nor", "either", "both", "more", "most", "less", "much", "many", "too", "enough", "let", "us"
]);
/** Literal formula words that also accept -s/-ed endings ("wish" → wishes). */
const LEXICAL_LITERALS = new Set(["wish", "need", "hope"]);
/** Trailing words several aux alternatives share ("have/has been", "am/is/are going to", "Could/Would you"). */
const SHARED_TAIL = new Set(["been", "have", "going", "to", "got", "able", "you"]);
/** Aux/modal words whose alternatives share a trailing word ("have/has been", "may/might/could have"). */
const SHARING_AUX = new Set(["am", "is", "are", "was", "were", "have", "has", "had", "do", "does", "did", "will", "would", "can", "could", "shall", "should", "may", "might", "must", "not"]);

const ED_STOP = new Set(["need", "feed", "speed", "indeed", "red", "bed", "seed", "weed", "deed", "greed", "breed", "bleed", "proceed", "succeed", "exceed", "shed", "hundred", "sacred", "naked", "wicked", "embed", "wed", "led"]);
const ING_STOP = new Set(["thing", "nothing", "something", "anything", "everything", "morning", "evening", "during", "ceiling", "king", "ring", "bring", "string", "spring", "swing", "sting", "wing", "meeting", "building", "training", "briefing", "booking", "wedding", "heading", "setting", "ending", "sibling", "pudding", "earring", "marketing", "pricing", "onboarding", "funding", "spelling", "shipping", "parking", "according", "outstanding", "interesting", "boring"]);
/** Irregular past and past-participle forms. */
const IRREGULAR_FORMS = new Set([
  "went", "gone", "saw", "seen", "came", "come", "took", "taken", "gave", "given", "made", "sent", "wrote", "written", "began", "begun", "became", "become",
  "knew", "known", "grew", "grown", "drew", "drawn", "flew", "flown", "chose", "chosen", "spoke", "spoken", "broke", "broken", "drove", "driven",
  "rose", "risen", "fell", "fallen", "forgot", "forgotten", "got", "gotten", "paid", "heard", "left", "lost", "won", "led", "spent", "built",
  "sold", "told", "said", "thought", "brought", "bought", "taught", "caught", "kept", "held", "met", "ran", "run", "sat", "stood", "understood",
  "found", "felt", "meant", "done", "did", "ate", "eaten", "slept", "wore", "worn", "threw", "thrown", "woke", "woken", "lent", "dealt", "sought",
  "fought", "shown", "proven", "had", "been", "was", "were", "put", "set", "cut", "let", "read", "hit", "shut", "cost", "quit", "spread", "split",
  "hung", "lit", "bent", "dug", "fed", "fled", "forbade", "hid", "hidden", "laid", "rode", "ridden", "rang", "rung", "shook", "shaken", "shot",
  "sang", "sung", "sank", "sunk", "stole", "stolen", "struck", "swore", "sworn", "swam", "swum", "tore", "torn", "upset", "withdrew", "withdrawn", "overcame", "undertook", "undertaken", "arose", "arisen", "bore", "borne", "bound", "froze", "frozen", "mistook", "mistaken", "oversaw", "overseen"
]);
/** State verbs that are rarely nouns or prepositions (no "like", "cost", "value"). */
const STATE_VERB_LEMMAS = ["know", "believe", "understand", "need", "want", "love", "hate", "prefer", "own", "belong", "seem", "mean", "remember", "forget", "agree", "disagree", "depend", "contain", "include", "deserve", "owe", "possess", "realise", "realize", "recognise", "recognize", "suppose", "wish", "appear", "consist", "doubt", "imagine", "involve", "require"];
const IRREGULAR_STATE = ["knew", "known", "understood", "meant", "forgot", "forgotten"];
const REPORTING_LEMMAS = ["say", "tell", "ask", "explain", "note", "mention", "confirm", "clarify", "report", "suggest", "advise", "remind", "warn", "promise", "agree", "offer", "refuse", "invite", "encourage", "announce", "state", "claim", "admit", "deny", "insist", "recommend", "request", "urge", "reply", "add", "argue", "complain", "inform", "instruct", "emphasise", "emphasize", "highlight", "order", "persuade", "allow", "expect", "want", "convince"];
const IRREGULAR_REPORTING = ["said", "told"];
const NOT_AFTER_TO = new Set(["the", "a", "an", "my", "our", "your", "his", "her", "their", "this", "that", "these", "those", "its", "late", "early", "next", "last", "all", "each", "every", "one", "two", "three", "home", "lunch", "everyone", "everybody", "someone", "me", "him", "us", "them", "it", "you", "date", "time", "work", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

function verbForms(lemmas: readonly string[], irregular: readonly string[]): Set<string> {
  const forms = new Set<string>(irregular);
  for (const lemma of lemmas) {
    const stem = lemma.endsWith("e") ? lemma.slice(0, -1) : lemma;
    const y = lemma.endsWith("y") && !/[aeiou]y$/u.test(lemma) ? lemma.slice(0, -1) : null;
    for (const form of [lemma, `${lemma}s`, `${lemma}es`, `${lemma}d`, `${lemma}ed`, `${stem}ing`, `${lemma}ing`, ...(y ? [`${y}ies`, `${y}ied`] : [])]) forms.add(form);
  }
  return forms;
}
const STATE_FORMS = verbForms(STATE_VERB_LEMMAS, IRREGULAR_STATE);
const REPORTING_FORMS = verbForms(REPORTING_LEMMAS, IRREGULAR_REPORTING);

type Form = "ing" | "past" | "pp" | "state" | "reporting" | "toinf";

const isIng = (token: string) => /^[a-z]{2,}ing$/u.test(token) && !ING_STOP.has(token);
const isEd = (token: string) => /^[a-z]{2,}ed$/u.test(token) && !ED_STOP.has(token);
const isPast = (token: string) => isEd(token) || IRREGULAR_FORMS.has(token);

function formAt(form: Form, tokens: readonly string[], index: number): boolean {
  const token = tokens[index]!;
  switch (form) {
    // "is meeting", "are training": a noun-like -ing word right after a form of be is the verb.
    case "ing": return isIng(token) || (/^[a-z]{2,}ing$/u.test(token) && [1, 2].some((back) => index - back >= 0 && BE_FORMS.has(tokens[index - back]!) && (back === 1 || ADVERBS.has(tokens[index - 1]!))));
    case "past": return isPast(token);
    case "pp": return isPast(token);
    case "state": return STATE_FORMS.has(token);
    case "reporting": return REPORTING_FORMS.has(token);
    case "toinf": { const next = tokens[index + 1]; return token === "to" && next !== undefined && !NOT_AFTER_TO.has(next) && !/^\d/u.test(next); }
  }
}

// ------------------------------------------------------------------ formula rows

/** Splits at a separator outside parentheses (sticky regex), keeping the separators. */
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

const ERROR_CHECK_LABEL = /^\s*(?:error check|common errors?|common mistakes?|lỗi thường gặp)\s*:\s*/iu;
const NOT_NOTES = /\s*\(\s*NOT\s+([^)]+)\)/gu;
const TENSE_NAMES = ["past continuous", "past progressive", "present continuous", "present progressive", "past simple", "simple past", "present perfect continuous", "present perfect", "past perfect", "future simple", "simple future", "present simple", "simple present"];
const TENSE_LEAD = new RegExp(`^(?:the\\s+)?(${TENSE_NAMES.join("|")})(?=$|[\\s(,:])`, "iu");
const PLACEHOLDER_HINT = /(?:^|[\s(/-])(?:v|v[0-3]|verb|verbs|v-?ing|-ing|-ed|participle|noun|nouns|clause|object|complement|infinitive|base|form|subject|agent|reason|element|inversion|danh từ|tính từ|động từ|chủ ngữ|thành phần|thời gian)(?=$|[\s).?…/,])|\.\.\.|…|\?$/iu;

const withoutNotes = (text: string) => text.replace(/\([^)]*\)/gu, " ").replace(/\s+/gu, " ").trim();

/** "Past simple: Subject + V-ed (I finished it)" → "Subject + V-ed (I finished it)"; also cuts the formula's own examples after a ": ". */
function stripLabelAndExamples(row: string): string {
  let rest = row.replace(ERROR_CHECK_LABEL, "").trim();
  const first = rest.indexOf(": ");
  if (first > 0 && first <= 30 && !rest.slice(0, first).includes("+")) rest = rest.slice(first + 2).trim();
  const next = topLevelIndex(rest, ": ");
  if (next > 0 && rest.slice(0, next).includes(" + ")) rest = rest.slice(0, next).trim();
  return rest.replace(/[;,]+$/u, "").replace(/(?<!.).$/u, "").trim();
}

/** First index of `needle` outside parentheses, or -1. */
function topLevelIndex(text: string, needle: string): number {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && text.startsWith(needle, index)) return index;
  }
  return -1;
}

/** The last " + " slot of a pattern is a placeholder ("base verb (commitment)", "V-ing", "noun"): a following " / X + …" starts a new rule. */
function endsWithPlaceholder(pattern: string): boolean {
  const slots = splitTop(pattern, /\s\+\s/uy).parts;
  const last = slots[slots.length - 1] ?? "";
  return /\(/u.test(last) || PLACEHOLDER_HINT.test(withoutNotes(last).toLocaleLowerCase("en-US"));
}

/**
 * Formula layout for generation prompts (16/11): one rule per line. Learners read each line (and each top-level
 * ";" rule of older content) as its own row of the formula band; several rules joined with ";" on one line
 * read as one long sentence.
 */
export const MONTHLY_GRAMMAR_FORMULA_LAYOUT_RULE = "FORMULA LAYOUT: write each formula with one rule per line, rules separated by a line break (\"\\n\" in the JSON string), never several rules joined with \";\" on one line (write \"Subject + am/is/are + verb-ing\\nSubject + present simple for facts\", not \"Subject + am/is/are + verb-ing; Subject + present simple for facts\"). A slot with alternatives stays on its rule's line (am/is/are, (always)).";

/** "Subject + V-ing: I am working" — a top-level ": " after a "+" pattern starts the formula's own examples. */
function hasExamplesTail(text: string): boolean {
  const colon = topLevelIndex(text, ": ");
  return colon > 0 && text.slice(0, colon).includes("+");
}

/**
 * The lines a formula is shown on (16/11): one per line break and one per top-level ";" rule
 * ("Subject + (always) + am/is/are + verb-ing for complaints; Subject + present simple for facts" → two
 * lines). Never inside parentheses, and never inside the formula's own examples list ("Subject + V-ing: I am
 * working; she is calling" stays one line). The learner and operator formula band and the row numbering of
 * monthlyGrammarFormulaRows both start from these lines, so the display and the gate agree.
 */
export function monthlyGrammarFormulaLines(formula: string): string[] {
  const lines: string[] = [];
  for (const raw of formula.split(/\r?\n/u)) {
    const text = raw.replace(/\s+/gu, " ").trim();
    if (!text) continue;
    const pieces: string[] = [];
    for (const part of splitTop(text, /;\s*/uy).parts.map((piece) => piece.trim()).filter(Boolean)) {
      const previous = pieces[pieces.length - 1];
      // An example after "; " (no "+" pattern, no "Label:") continues the previous line's examples.
      if (previous !== undefined && hasExamplesTail(previous) && !part.includes("+") && !/^\p{L}[\p{L}'’ -]{1,30}:\s/u.test(part)) pieces[pieces.length - 1] = `${previous}; ${part}`;
      else pieces.push(part);
    }
    lines.push(...pieces);
  }
  return lines;
}

/**
 * The rule rows of a formula, as the learner reads them: one per formula line (line breaks and
 * top-level ";", see monthlyGrammarFormulaLines), " → ", "|", " · ", " vs ", and " / " between two
 * "+" patterns (never inside a slot such as "am/is/are" or "must have / can't have").
 */
export function monthlyGrammarFormulaRows(formula: string): string[] {
  const rows: string[] = [];
  for (const text of monthlyGrammarFormulaLines(formula)) {
    const coarse = splitTop(text, /\s+→\s+|\s+\|\|?\s+|\s+·\s+|\.\s+(?=\p{Lu}[\p{L}'’ -]{2,30}:\s)/uy).parts;
    for (const chunk of coarse) {
      for (const side of splitTop(stripLabelAndExamples(chunk), /\s+vs\.?\s+/iuy).parts) {
        const { parts, seps } = splitTop(stripLabelAndExamples(side), /\s+\/\s+/uy);
        const merged: string[] = [];
        parts.forEach((part, index) => {
          const previous = merged[merged.length - 1];
          const newRule = previous !== undefined && ((part.includes(" + ") && previous.includes(" + ") && endsWithPlaceholder(previous)) || (TENSE_LEAD.test(part.trim()) && TENSE_LEAD.test(previous.trim())));
          if (previous === undefined || newRule) merged.push(part);
          else merged[merged.length - 1] = `${previous}${seps[index - 1]}${part}`;
        });
        for (const rule of merged) { const clean = stripLabelAndExamples(rule); if (clean && /[\p{L}]/u.test(clean)) rows.push(clean); }
      }
    }
  }
  return rows;
}

// ------------------------------------------------------------------ row requirements

interface Alternative { phrase?: string[]; form?: Form; tense?: { aux: string[]; verb: Form } }
interface Requirement { alternatives: Alternative[] }
export interface MonthlyGrammarRow { text: string; requirements: Requirement[]; wrong: string[] }

function formOfPlaceholder(value: string): Form | "free" | undefined {
  const text = value.trim();
  if (/^(?:v-?ing|verb-?ing|-ing|v\s?\+\s?ing|gerund|ing form)$/u.test(text)) return "ing";
  if (/^(?:v-?ed|verb-?ed|-ed|v2|past(?: simple)? (?:form|verb)|irregular(?: past)?(?: (?:form|verb))?|irregular past form|simple past verb)$/u.test(text)) return "past";
  if (/^(?:v3|past participle|participle|pp|past participle v3|v3 past participle)$/u.test(text)) return "pp";
  if (/^(?:state|stative) verbs?$/u.test(text)) return "state";
  if (/^reporting verbs?$/u.test(text)) return "reporting";
  if (/^(?:to-infinitive|to infinitive|to-inf|to \+ v)$/u.test(text)) return "toinf";
  if (/^(?:v|v1|v0|verb|verbs|base verb|base form|bare infinitive|infinitive|main verb|present simple verb|noun|nouns|noun phrase|object|complement|clause|main clause|subject|subject pronoun|agent|reason|time|adjective|focus element|inversion|danh từ|tính từ|động từ|chủ ngữ|thành phần|clause \d|clause)$/u.test(text)) return "free";
  if (/^(?:động từ|danh từ|tính từ|v nguyên mẫu)/u.test(text)) return "free";
  return undefined;
}

function tenseRequirement(name: string): Alternative | "free" | undefined {
  const tense = name.toLocaleLowerCase("en-US").replace(/^the\s+/u, "").replace(/\s+tense$/u, "").replace(/\s+/gu, " ");
  if (tense === "past simple" || tense === "simple past") return { form: "past" };
  if (tense === "past continuous" || tense === "past progressive") return { tense: { aux: ["was", "were"], verb: "ing" } };
  if (tense === "present continuous" || tense === "present progressive") return { tense: { aux: ["am", "is", "are"], verb: "ing" } };
  if (tense === "present perfect continuous") return { tense: { aux: ["been"], verb: "ing" } };
  if (tense === "present perfect") return { tense: { aux: ["have", "has"], verb: "pp" } };
  if (tense === "past perfect") return { tense: { aux: ["had", "'d"], verb: "pp" } };
  if (tense === "future simple" || tense === "simple future") return { phrase: ["will"] };
  if (tense === "present simple" || tense === "simple present") return "free";
  return undefined;
}

/** One " + " slot → its requirement, or null when the slot asks for nothing readable. */
function slotRequirement(raw: string): { requirement: Requirement | null; alternatives: boolean } {
  const text = withoutNotes(raw).replace(/^\[|\]$/gu, "").replace(/[[\]]/gu, "").replace(/(?:\.\.\.|…|[?!.])+$/u, "").trim().toLocaleLowerCase("en-US").replace(/[’‘]/gu, "'");
  if (!text) return { requirement: null, alternatives: false };
  const lead = TENSE_LEAD.exec(text);
  if (lead && (lead[0].length === text.length || !text.includes("/"))) {
    const tense = tenseRequirement(lead[1]!);
    return { requirement: tense && tense !== "free" ? { alternatives: [tense] } : null, alternatives: false };
  }
  const pieces = text.split(/\s*\/\s*|\s+or\s+/u).map((piece) => piece.trim()).filter(Boolean);
  const alternatives = pieces.length > 1;
  const words = pieces.map((piece) => {
    const placeholder = formOfPlaceholder(piece);
    return placeholder ? [piece] : grammarTokens(piece);
  });
  // "have/has been", "may not/might not/could not have", "should/shouldn't have": aux alternatives share the last
  // alternative's trailing words (never a "not": "can / can't" stays two alternatives).
  const last = words[words.length - 1]!;
  const shared: string[] = [];
  for (let index = last.length - 1; index >= 1 && SHARED_TAIL.has(last[index]!); index -= 1) shared.unshift(last[index]!);
  if (words.length > 1 && shared.length && !formOfPlaceholder(last.join(" "))) for (let index = 0; index < words.length - 1; index += 1) {
    const alt = words[index]!;
    if (alt.every((word) => SHARING_AUX.has(word) || SUBJECT_PRONOUNS.has(word)) && alt[alt.length - 1] !== shared[shared.length - 1]) words[index] = [...alt, ...shared];
  }
  const result: Alternative[] = [];
  // "I/We/They don't": the bare pronouns share the last alternative's form.
  const pronounOnly = (alt: readonly string[]) => alt.every((word) => SUBJECT_PRONOUNS.has(word));
  const readable = words.some((alt) => !pronounOnly(alt)) ? words.filter((alt) => !pronounOnly(alt)) : words;
  for (const alt of readable) {
    if (alt.length === 1 && formOfPlaceholder(alt[0]!)) {
      const form = formOfPlaceholder(alt[0]!)!;
      if (form === "free") return { requirement: null, alternatives };
      result.push({ form });
      continue;
    }
    // "I am", "Could we", "Were we to": the pronoun is the subject, not part of the structure.
    const dropped = alt.some((word) => SUBJECT_PRONOUNS.has(word)) && !alt.every((word) => SUBJECT_PRONOUNS.has(word));
    let phrase = alt.filter((word) => !SUBJECT_PRONOUNS.has(word) || alt.every((other) => SUBJECT_PRONOUNS.has(other)));
    // "We are going to": another subject takes another form of be ("the client is going to").
    if (dropped && (phrase[0] === "am" || phrase[0] === "is" || phrase[0] === "are") && phrase.length > 1) phrase = ["be", ...phrase.slice(1)];
    // "that/who clause": a trailing slot name is not a word to find.
    while (phrase.length > 1 && formOfPlaceholder(phrase[phrase.length - 1]!) === "free") phrase = phrase.slice(0, -1);
    if (!phrase.length || phrase.every((word) => SUBJECT_PRONOUNS.has(word)) || !phrase.every((word) => FUNCTION_WORDS.has(word))) return { requirement: null, alternatives };
    // "What we need is": the lexical word may change ("What the client wants is").
    result.push({ phrase: phrase.length > 1 && phrase.some((word) => !LEXICAL_LITERALS.has(word)) ? phrase.filter((word) => !LEXICAL_LITERALS.has(word)) : phrase });
  }
  return { requirement: result.length ? { alternatives: result } : null, alternatives };
}

/** Reads one rule row: its requirements (empty when nothing in it is readable) and its "(NOT …)" wrong forms. */
export function readMonthlyGrammarRow(row: string): MonthlyGrammarRow {
  const wrong = [...row.matchAll(NOT_NOTES)].map((found) => found[1]!.trim()).filter(Boolean);
  const text = row.replace(NOT_NOTES, " ").replace(/\s+/gu, " ").trim();
  const requirements: Requirement[] = [];
  if (!text.includes(" + ")) {
    // "Past simple alone when …", "Present Continuous cho việc …": a leading tense name is the rule.
    const lead = TENSE_LEAD.exec(text);
    const tense = lead ? tenseRequirement(lead[1]!) : undefined;
    if (tense && tense !== "free") requirements.push({ alternatives: [tense] });
    else if (!lead) { const slot = slotRequirement(text).requirement; if (slot) requirements.push(slot); }
    return { text: row, requirements, wrong };
  }
  const slots = splitTop(text, /\s\+\s|,\s+/uy).parts;
  // "Would + base verb is for the past, not for a fixed future plan": a rule written as prose is not a pattern to check.
  const prose = (slot: string) => { const words = withoutNotes(slot).toLocaleLowerCase("en-US").split(/\s+/u); return words.length >= 4 && words.filter((word) => FUNCTION_WORDS.has(word)).length >= 2; };
  if (slots.some((slot) => !slot.includes("/") && !slotRequirement(slot).requirement && prose(slot))) return { text: row, requirements, wrong };
  let previousFreeWithAlternatives = false;
  for (const slot of slots) {
    const { requirement, alternatives } = slotRequirement(slot);
    // "be + on track / at risk of + V-ing": a verb form after alternatives we cannot read may belong to one of them only.
    const formOnly = requirement?.alternatives.every((alternative) => alternative.form) ?? false;
    if (requirement && !(formOnly && previousFreeWithAlternatives)) requirements.push(requirement);
    previousFreeWithAlternatives = !requirement && alternatives;
  }
  return { text: row, requirements, wrong };
}

export function isMonthlyPresentProgressiveRow(row: MonthlyGrammarRow): boolean {
  const alternatives = row.requirements.flatMap((requirement) => requirement.alternatives);
  const named = alternatives.some((alternative) => alternative.tense?.verb === "ing" && alternative.tense.aux.every((aux) => PRESENT_BE.has(aux)));
  return named || (alternatives.some((alternative) => alternative.form === "ing")
    && alternatives.some((alternative) => alternative.phrase?.some((token) => PRESENT_BE.has(token)))
    && alternatives.every((alternative) => alternative.form === "ing" || alternative.phrase?.every((token) => PRESENT_BE.has(token) || ADVERBS.has(token))));
}

function phraseAt(phrase: readonly string[], tokens: readonly string[]): boolean {
  // Each next word within three tokens of the previous one ("has already been", "were we to", "what the client wants is").
  const from = (start: number, offset: number): boolean => {
    if (offset === phrase.length) return true;
    const end = offset === 0 ? tokens.length - 1 : Math.min(tokens.length - 1, start + 3);
    for (let index = start; index <= end; index += 1) if (sameWord(phrase[offset]!, tokens[index]!) && from(index + 1, offset + 1)) return true;
    return false;
  };
  return from(0, 0);
}

function alternativeIn(alternative: Alternative, tokens: readonly string[]): boolean {
  if (alternative.phrase) return phraseAt(alternative.phrase, tokens);
  if (alternative.form) return tokens.some((_, index) => formAt(alternative.form!, tokens, index));
  if (alternative.tense) {
    const { aux, verb } = alternative.tense;
    return tokens.some((token, index) => aux.some((word) => sameWord(word, token)) && [1, 2, 3].some((step) => index + step < tokens.length && formAt(verb, tokens, index + step)));
  }
  return false;
}

/** Whether a sentence uses every readable part of the row (order-free, within the sentence). */
function sentenceUsesRow(sentence: string, row: MonthlyGrammarRow): boolean {
  const tokens = grammarTokens(sentence);
  return row.requirements.every((requirement) => requirement.alternatives.some((alternative) => alternativeIn(alternative, tokens)));
}

/** "Wrong: She work in Hanoi. Right: She works in Hanoi." (also Sai:/Đúng:, Incorrect:/Correct:, ✗/✓, either order). */
const WRONG_MARK = String.raw`(?:wrong|incorrect|sai|✗|✘|❌)`;
const RIGHT_MARK = String.raw`(?:right|correct|đúng|✓|✔|✅)`;
const PAIR_SEPARATOR = String.raw`\s*(?:→|->|—|–|;|\|)?\s*`;
const WRONG_FIRST = new RegExp(String.raw`^\s*${WRONG_MARK}\s*:\s*(.+?)${PAIR_SEPARATOR}${RIGHT_MARK}\s*:\s*(.+?)\s*$`, "iu");
const WRONG_FIRST_SYMBOL = new RegExp(String.raw`^\s*[✗✘❌]\s*(.+?)${PAIR_SEPARATOR}[✓✔✅]\s*:?\s*(.+?)\s*$`, "u");
const RIGHT_FIRST = new RegExp(String.raw`^\s*${RIGHT_MARK}\s*:\s*(.+?)${PAIR_SEPARATOR}${WRONG_MARK}\s*:\s*(.+?)\s*$`, "iu");
const RIGHT_FIRST_SYMBOL = new RegExp(String.raw`^\s*[✓✔✅]\s*(.+?)${PAIR_SEPARATOR}[✗✘❌]\s*:?\s*(.+?)\s*$`, "u");

function examplePair(example: string): { wrong: string; right: string } | undefined {
  const text = example.replace(/\s+/gu, " ").trim();
  const wrongFirst = text.match(WRONG_FIRST) ?? text.match(WRONG_FIRST_SYMBOL);
  const rightFirst = wrongFirst ? undefined : text.match(RIGHT_FIRST) ?? text.match(RIGHT_FIRST_SYMBOL);
  const wrong = (wrongFirst?.[1] ?? rightFirst?.[2])?.trim();
  const right = (wrongFirst?.[2] ?? rightFirst?.[1])?.trim();
  return wrong && right ? { wrong, right } : undefined;
}

/** Recognises progressive be in a statement or a short question, independently of example marks. */
export function hasMonthlyPresentProgressive(example: string): boolean {
  const sentence = examplePair(example)?.right ?? example;
  const tokens = grammarTokens(sentence);
  const question = /\?\s*$/u.test(sentence);
  return tokens.some((aux, index) => {
    if (!PRESENT_BE.has(aux)) return false;
    const invertedPronoun = question && SUBJECT_PRONOUNS.has(tokens[index + 1] ?? "");
    const allowSubjectPhrase = question && !invertedPronoun;
    const limit = allowSubjectPhrase ? Math.min(tokens.length, index + 6) : tokens.length;
    for (let next = index + (invertedPronoun ? 2 : 1); next < limit; next += 1) {
      const token = tokens[next]!;
      if (ADVERBS.has(token)) continue;
      if (!NOUN_DETERMINERS.has(tokens[next - 1]!) && formAt("ing", tokens, next)) return true;
      if (!allowSubjectPhrase || PRESENT_BE.has(token) || token === "to") break;
    }
    return false;
  });
}

/** Whether an example uses a row; a "Wrong: … Right: …" example counts for the rule it corrects. */
export function monthlyGrammarExampleUsesRow(example: string, row: MonthlyGrammarRow): boolean {
  if (!row.requirements.length) return false;
  const pair = examplePair(example);
  if (!pair) return sentenceUsesRow(example, row);
  if (sentenceUsesRow(pair.right, row)) return true;
  const wrong = ` ${grammarTokens(pair.wrong).join(" ")} `;
  return row.wrong.some((form) => { const tokens = grammarTokens(form).filter((token) => !/^(?:verb|v|ed|ing)$/u.test(token)); return tokens.length > 0 && wrong.includes(` ${tokens.join(" ")} `); });
}

// ------------------------------------------------------------------ marked examples (generated since 13/11)

/**
 * Generated grammar examples say which formula row they illustrate and which exact words realise it
 * (`exampleMarks`, index-aligned with `examples`): `{ row, marks }`, `row` 1-based over
 * {@link monthlyGrammarFormulaRows} of the example's own formula. The model knows the grammar ("knows",
 * "wrote", "had", "have got"), so no word list is needed: the check below is exact, and the learner
 * highlight shows exactly these words. Lessons stored without marks keep the heuristic check above.
 */
export interface MonthlyGrammarExampleMark { row: number; marks: string[] }

/** The stored marks of a block: undefined when the block has none (older lessons); null entries are malformed. */
export function readMonthlyGrammarExampleMarks(value: unknown): Array<MonthlyGrammarExampleMark | null> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    const row = typeof record.row === "number" ? record.row : typeof record.row === "string" && /^\d+$/u.test(record.row.trim()) ? Number(record.row) : NaN;
    const marks = Array.isArray(record.marks) ? record.marks.filter((mark): mark is string => typeof mark === "string" && Boolean(mark.trim())).map((mark) => mark.trim()) : [];
    return Number.isInteger(row) ? { row, marks } : null;
  });
}

const MARK_WORD_CHAR = /[\p{L}\p{N}'’-]/u;
const markKey = (value: string) => value.replace(/[’‘]/gu, "'").toLocaleLowerCase("en-US");

/**
 * Where the marks occur in a sentence: each mark verbatim (case and curly apostrophes aside) as whole
 * words, every occurrence, longer marks first and never overlapping. A "Wrong: … Right: …" example is
 * searched in its right sentence only. `missing` lists the marks found nowhere.
 */
export function monthlyGrammarMarkSpans(sentence: string, marks: readonly string[]): { spans: Array<{ start: number; end: number }>; missing: string[] } {
  const pair = examplePair(sentence);
  const rightStart = pair ? sentence.lastIndexOf(pair.right) : 0;
  const from = pair && rightStart >= 0 ? rightStart : 0;
  const to = pair && rightStart >= 0 ? rightStart + pair.right.length : sentence.length;
  const haystack = markKey(sentence);
  const taken = new Array<boolean>(sentence.length).fill(false);
  const spans: Array<{ start: number; end: number }> = [];
  const missing: string[] = [];
  const unique = [...new Set(marks.map((mark) => mark.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const mark of unique) {
    const needle = markKey(mark).replace(/\s+/gu, " ");
    let found = false;
    for (let index = haystack.indexOf(needle, from); index >= 0 && index + needle.length <= to; index = haystack.indexOf(needle, index + 1)) {
      const end = index + needle.length;
      if ((index > 0 && MARK_WORD_CHAR.test(sentence[index - 1]!)) || (end < sentence.length && MARK_WORD_CHAR.test(sentence[end]!))) continue;
      found = true;
      if (taken.slice(index, end).some(Boolean)) continue;
      taken.fill(true, index, end);
      spans.push({ start: index, end });
    }
    if (!found) missing.push(mark);
  }
  return { spans: spans.sort((a, b) => a.start - b.start), missing };
}

export interface MonthlyGrammarMarkedStepCheck {
  /** Every row of the formula (readable or not) with the examples that say they illustrate it. */
  rows: Array<{ text: string; exampleIndexes: number[] }>;
  rowsWithoutExample: string[];
  /** One line per example whose mark entry is missing, names no row of the formula, marks nothing or marks words it does not contain. */
  exampleIssues: string[];
}

/** The exact row coverage of a block whose examples carry marks. */
export function checkMonthlyGrammarMarkedStep(formula: string, examples: readonly string[], marks: ReadonlyArray<MonthlyGrammarExampleMark | null>): MonthlyGrammarMarkedStepCheck {
  const rowTexts = monthlyGrammarFormulaRows(formula);
  const rows = rowTexts.map((text) => ({ text, exampleIndexes: [] as number[] }));
  const exampleIssues: string[] = [];
  examples.forEach((example, index) => {
    const entry = marks[index];
    const label = `example ${index + 1} "${example}"`;
    if (!entry) { exampleIssues.push(`${label} has no exampleMarks entry { row, marks }`); return; }
    if (entry.row < 1 || entry.row > rows.length) { exampleIssues.push(`${label} names row ${entry.row}, but the formula has ${rows.length} row${rows.length === 1 ? "" : "s"}`); return; }
    if (!entry.marks.length) { exampleIssues.push(`${label} marks no words of row ${entry.row}`); return; }
    const { missing } = monthlyGrammarMarkSpans(example, entry.marks);
    if (missing.length) { exampleIssues.push(`${label} marks ${missing.map((mark) => `"${mark}"`).join(", ")}, which ${missing.length === 1 ? "is" : "are"} not in its ${examplePair(example) ? "Right sentence" : "text"} as whole words`); return; }
    rows[entry.row - 1]!.exampleIndexes.push(index);
  });
  return { rows, rowsWithoutExample: rows.filter((row) => !row.exampleIndexes.length).map((row) => row.text), exampleIssues };
}

// ------------------------------------------------------------------ step check

export interface MonthlyGrammarStepCheck {
  rows: Array<{ text: string; readable: boolean; exampleIndexes: number[] }>;
  /** Readable rows that no example uses. */
  rowsWithoutExample: string[];
  /** Examples that use no row (only when every row is readable). */
  examplesWithoutRow: string[];
  /** Fewer examples than readable rows. */
  tooFewExamples: boolean;
}

export function checkMonthlyGrammarStep(formula: string, examples: readonly string[]): MonthlyGrammarStepCheck {
  const rows = monthlyGrammarFormulaRows(formula).map(readMonthlyGrammarRow);
  const list = examples.filter((example) => example.trim());
  const checked = rows.map((row) => ({ text: row.text, readable: row.requirements.length > 0, exampleIndexes: list.flatMap((example, index) => monthlyGrammarExampleUsesRow(example, row) ? [index] : []) }));
  const readable = checked.filter((row) => row.readable);
  const allReadable = rows.length > 0 && readable.length === rows.length;
  return {
    rows: checked,
    rowsWithoutExample: list.length ? readable.filter((row) => !row.exampleIndexes.length).map((row) => row.text) : [],
    examplesWithoutRow: allReadable ? list.filter((_, index) => !checked.some((row) => row.exampleIndexes.includes(index))) : [],
    tooFewExamples: list.length > 0 && list.length < readable.length
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

export interface MonthlyGrammarFormulaExampleIssue { step: number | null; formula: string; rowsWithoutExample: string[]; examplesWithoutRow: string[]; tooFewExamples: boolean; exampleMarkIssues?: string[] }

/**
 * Formula/example mismatches of a lesson grammar part: one entry per step
 * (grammar.steps when there are two or more, as the learner sees them),
 * otherwise for the top-level formula and examples. Empty when everything matches.
 *
 * A block whose examples carry `exampleMarks` is checked exactly (every row has an
 * example that names it, every example names a row and marks words it contains);
 * a block without marks keeps the heuristic matcher, unless `requireMarks` (a new
 * generation) asks for them.
 */
export function monthlyGrammarFormulaExampleIssues(grammar: Record<string, unknown> | undefined, options: { requireMarks?: boolean } = {}): MonthlyGrammarFormulaExampleIssue[] {
  if (!grammar) return [];
  const steps = Array.isArray(grammar.steps) ? grammar.steps.filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === "object" && !Array.isArray(step) && typeof (step as Record<string, unknown>).formula === "string") : [];
  const blocks = steps.length >= 2
    ? steps.map((step, index) => ({ step: index + 1 as number | null, formula: step.formula as string, examples: stringList(step.examples), rawExamples: step.examples, marks: step.exampleMarks }))
    : typeof grammar.formula === "string" ? [{ step: null as number | null, formula: grammar.formula, examples: stringList(grammar.examples), rawExamples: grammar.examples, marks: grammar.exampleMarks }] : [];
  return blocks.flatMap((block) => {
    const marks = readMonthlyGrammarExampleMarks(block.marks);
    if (marks || options.requireMarks) {
      // Marks are index-aligned with the stored examples, blanks included.
      const all = Array.isArray(block.rawExamples) ? block.rawExamples.map((example) => typeof example === "string" ? example.trim() : "") : [];
      const indexed = all.flatMap((example, index) => example ? [{ example, mark: marks?.[index] ?? null }] : []);
      const check = checkMonthlyGrammarMarkedStep(block.formula, indexed.map((item) => item.example), indexed.map((item) => item.mark));
      const exampleMarkIssues = marks ? check.exampleIssues : indexed.length ? ["the examples have no exampleMarks: give one { row, marks } entry per example"] : [];
      const tooFewExamples = indexed.length < Math.max(2, check.rows.length);
      return check.rowsWithoutExample.length || exampleMarkIssues.length || tooFewExamples
        ? [{ step: block.step, formula: block.formula, rowsWithoutExample: check.rowsWithoutExample, examplesWithoutRow: [], tooFewExamples, exampleMarkIssues }]
        : [];
    }
    const check = checkMonthlyGrammarStep(block.formula, block.examples);
    // A step left without examples (the model wrote none for it; resource examples are never copied in): every readable row lacks one.
    if (block.step !== null && !block.examples.length) {
      const rows = check.rows.filter((row) => row.readable).map((row) => row.text);
      return rows.length ? [{ step: block.step, formula: block.formula, rowsWithoutExample: rows, examplesWithoutRow: [], tooFewExamples: true }] : [];
    }
    return check.rowsWithoutExample.length || check.examplesWithoutRow.length || check.tooFewExamples
      ? [{ step: block.step, formula: block.formula, rowsWithoutExample: check.rowsWithoutExample, examplesWithoutRow: check.examplesWithoutRow, tooFewExamples: check.tooFewExamples }]
      : [];
  });
}

/** How much is wrong across the issues (rows without an example, examples without a row or valid marks, a short list): a repair must lower it. */
export function monthlyGrammarFormulaExampleIssueCount(issues: readonly MonthlyGrammarFormulaExampleIssue[]): number {
  return issues.reduce((total, issue) => total + issue.rowsWithoutExample.length + issue.examplesWithoutRow.length + (issue.exampleMarkIssues?.length ?? 0) + (issue.tooFewExamples ? 1 : 0), 0);
}

/** How the model marks its examples (prompt, schema description and repair message share it). */
export const MONTHLY_GRAMMAR_EXAMPLE_MARKS_RULE = "EXAMPLE MARKS: next to examples (top-level grammar.examples and every grammar.steps entry) return exampleMarks, one entry per example in the same order: { row, marks }. row is the 1-based number of the formula row the example illustrates (the rows of that block's own formula, numbered in order: each pattern separated by \" / \" between two \"+\" patterns, \";\", \" vs \", \" → \" or a new line, as listed in the formula rows above when they are listed); marks lists the exact words of the example that realise that row, copied verbatim as whole words: the state verb (\"knows\", \"need\"), the past form (\"registered\", \"wrote\"), \"have got\" as one mark, \"had\" for past possession, \"is\", \"always\" and \"asking\" for always + continuous (each mark is one word or a run of adjacent words); never the subject or other words. Every example has at least one mark, and every row at least one example. In a \"Wrong: ... Right: ...\" example mark words of the Right sentence only.";

/** English repair hint for the AI (also the light finding's message). */
export function monthlyGrammarFormulaExampleMessage(issues: readonly MonthlyGrammarFormulaExampleIssue[]): string {
  const details = issues.map((issue) => {
    const where = issue.step ? `grammar.steps[${issue.step - 1}]` : "grammar";
    const parts = [
      ...issue.rowsWithoutExample.map((row) => `formula row "${row}" has no example that uses it`),
      ...issue.examplesWithoutRow.map((example) => `example "${example}" uses no row of the formula`),
      ...(issue.tooFewExamples ? ["it has fewer examples than formula rows"] : []),
      ...(issue.exampleMarkIssues ?? [])
    ];
    return `${where}: ${parts.join("; ")}`;
  });
  return `Grammar formula and examples do not match (the formula is locked). Rewrite the examples (and the explanation text) so every formula row has at least one example using exactly that structure, every example uses a row of its own formula, and a step with N rows has at least N examples (never fewer than 2). ${MONTHLY_GRAMMAR_EXAMPLE_MARKS_RULE} ${details.join(" | ")}`;
}
