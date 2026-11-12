import type { CefrLevel } from "@e4s/contracts";
import { sensitiveTextIssue } from "../content/sensitive-text.js";

/**
 * Optional slang / poetic synonyms of a core word (L-042, B1–C1 only), as
 * defined by the stakeholder (12/11):
 * - "slang" of core A = word C, a genuine same-meaning synonym of A used in
 *   everyday conversation but not in formal communication (dollar -> buck,
 *   cancel -> scrap). Shown with British IPA and a short English usage note
 *   (when to use it and when NOT to use it). Label "Slang" / "Khẩu ngữ".
 * - "poetic" of core A = word B, a genuine same-meaning synonym of A used in
 *   literature rather than common English (morning -> morn, horse -> steed,
 *   sleep -> slumber). Shown with British IPA and a GENERAL source note only
 *   (e.g. "common in older poetry, Shakespeare, the King James Bible"), never
 *   a specific title, verse or line. Label "Poetic" / "Văn chương".
 *   Formal-register words (commence, conclude, furnish) are NOT poetic.
 * Never mandatory: most cores have none, and absence is never a finding.
 * No Vietnamese anywhere (B1+ has no translation).
 *
 * Legacy data (before 12/11) stored kind "poetic" for formal-register words
 * and has no ipa/usage/source; it is still accepted when stored so old pools
 * and lessons keep rendering as before ("Formal" / "Văn phong").
 */
export type MonthlyRegisterKind = "slang" | "poetic";
export const MONTHLY_REGISTER_KINDS = ["slang", "poetic"] as const satisfies readonly MonthlyRegisterKind[];

export interface MonthlyRegisterTerm {
  kind: MonthlyRegisterKind;
  word: string;
  /** Short simple-English definition (2–14 words, no Vietnamese). */
  definition: string;
  /** English register label shown with the definition. */
  register: string;
  /** British (RP) IPA between slashes; absent on legacy items. */
  ipa?: string;
  /** Slang only: when to use it and when NOT to use it (short English note). */
  usage?: string;
  /** Poetic only: where it is found, as a general source note (no titles, verses or lines). */
  source?: string;
}

/** Register alternatives are generated and shown for these month levels only. */
export const MONTHLY_REGISTER_LEVELS: readonly CefrLevel[] = ["B1", "B2", "C1"];
export function monthlyRegisterTermsApply(cefr: string | undefined): boolean {
  return cefr === "B1" || cefr === "B2" || cefr === "C1";
}

export const MONTHLY_REGISTER_LABELS: Readonly<Record<MonthlyRegisterKind, string>> = {
  slang: "Slang: everyday conversation, not formal communication",
  poetic: "Poetic: used in literature, not in common English"
};
/** Labels of items stored before 12/11 (kind "poetic" then meant formal register). */
export const MONTHLY_LEGACY_REGISTER_LABELS: Readonly<Record<MonthlyRegisterKind, string>> = {
  slang: "Informal: casual spoken workplace English",
  poetic: "Formal: formal or literary writing"
};

/** A stored item from before 12/11: no IPA, usage or source fields. */
export function isLegacyMonthlyRegisterTerm(term: { ipa?: string | undefined; usage?: string | undefined; source?: string | undefined }): boolean {
  return !term.ipa?.trim() && !term.usage?.trim() && !term.source?.trim();
}

const DEFINITION_MAX_WORDS = 14;
const DEFINITION_MAX_CHARS = 100;
const NOTE_MIN_WORDS = 4;
const NOTE_MAX_WORDS = 30;
const NOTE_MAX_CHARS = 200;
const VIETNAMESE_LETTER = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹàáèéìíòóùúý]/iu;
const WORD_SHAPE = /^\p{L}+(?:[-'’]\p{L}+)*(?:\s+\p{L}+(?:[-'’]\p{L}+)*){0,3}$/u;
const IPA_SHAPE = /^\/[^/\s][^/]*\/$/u;

/**
 * Formal / business-register words that the old generator returned as
 * "poetic" (start -> commence, finish -> conclude, give -> furnish). They are
 * formal, not literary, and are never accepted as poetic (or as slang).
 */
const FORMAL_REGISTER_WORDS = new Set([
  "commence", "conclude", "furnish", "purchase", "assist", "obtain", "acquire", "utilise", "utilize", "facilitate", "endeavour", "endeavor",
  "request", "require", "inform", "notify", "indicate", "demonstrate", "sufficient", "numerous", "approximately", "subsequently", "regarding",
  "terminate", "initiate", "implement", "ascertain", "comprehend", "accomplish", "procure", "remunerate", "reside", "depart", "inquire", "enquire",
  "prior", "additional", "expedite", "finalise", "finalize", "convene", "deliberate", "disseminate", "elucidate", "enumerate", "peruse", "render",
  "retain", "submit", "transmit", "verify", "endorse", "allocate", "ameliorate", "apprise", "commensurate", "consolidate", "constitute",
  "delineate", "designate", "effectuate", "formulate", "mitigate", "necessitate", "optimise", "optimize", "prioritise", "prioritize", "rectify",
  "reiterate", "solicit", "substantiate", "supersede", "undertake", "contribute", "complete", "deliver", "provide", "present", "proceed",
  "attain", "commend", "convey", "correspond", "determine", "discontinue", "elect", "employ", "establish", "evaluate", "execute", "forward",
  "perform", "possess", "remit", "remainder", "terminate", "transpire", "advise", "advocate", "aforementioned", "henceforth", "herewith",
  "pursuant", "whereby", "notwithstanding", "commencement", "conclusion", "cessation", "inception"
]);
/** Latinate formal-register endings; literary synonyms (morn, steed, slumber, foe, behold) do not look like this. */
const FORMAL_SUFFIX = /(?:ate|ise|ize|ify|tion|sion|ment|ance|ence|ity|ally)$/u;
/** A poetic source note names a literary setting… */
const LITERARY_CUE = /\b(?:poetry|poem|poems|poets?|poetic|literature|literary|verse|ballads?|hymns?|epics?|sagas?|legends?|fairy|folk ?tales?|tales|fables?|romances?|novels?|stories|storytelling|shakespeare(?:'s|an)?|bible|biblical|scripture|archaic|old-fashioned|older|classic(?:al)?|myths?|songs?)\b/iu;
/** …and never a formal / business setting (that is formal register, not poetic). */
const FORMAL_CUE = /\b(?:formal|business|official|legal|academic|reports?|workplace|office|letters?|emails?|documents?|contracts?|minutes|corporate)\b/iu;
/** Proper names a general source note may use; any other capitalised word suggests a specific title. */
const ALLOWED_SOURCE_NAMES = new Set(["shakespeare", "shakespeare's", "shakespearean", "king", "james", "bible", "biblical", "english", "old", "middle", "milton", "chaucer", "tennyson", "keats", "wordsworth", "byron", "spenser", "romantic", "victorian", "elizabethan", "medieval", "arthurian", "greek", "latin", "norse"]);
/** A slang usage note says when NOT to use the word. */
const NEGATIVE_CUE = /\b(?:not|never|avoid|don't|do not|instead|rather than|unsuitable|inappropriate|prefer(?:red)?|only (?:in|with|for)|in formal (?:writing|reports?|emails?|documents?|settings?|meetings?|contexts?))\b/iu;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/’/gu, "'").replace(/\s+/gu, " ");
}

function wordCount(value: string): number {
  return value.split(/\s+/u).filter(Boolean).length;
}

/** Problems of a general poetic source note: specific titles, verses, lines or quotations are not allowed. */
export function monthlyPoeticSourceIssue(word: string, source: string): string | undefined {
  const note = source.trim();
  if (!note) return `"${word}" needs a general source note (where it is found, e.g. older poetry, Shakespeare)`;
  if (VIETNAMESE_LETTER.test(note)) return `"${word}" source note must be English with no Vietnamese`;
  const words = wordCount(note);
  if (words < 3 || words > NOTE_MAX_WORDS || note.length > NOTE_MAX_CHARS) return `"${word}" source note must be 3–${NOTE_MAX_WORDS} words (at most ${NOTE_MAX_CHARS} characters)`;
  if (/\d/u.test(note)) return `"${word}" source note must stay general: no verse, line, chapter or year numbers`;
  if (/["“”«»]|(?:^|[^\p{L}])['‘’]|['‘’](?:[^\p{L}]|$)/u.test(note.replace(/\p{L}['’]s\b/gu, ""))) return `"${word}" source note must stay general: no quoted titles or lines`;
  if (/\b(?:act|scene|canto|chapter|stanza|book of|genesis|exodus|psalm \w+|hamlet|macbeth|othello|lear|romeo|juliet|tempest|paradise lost|beowulf|iliad|odyssey)\b/iu.test(note)) return `"${word}" source note must stay general: never name a specific work, act, chapter, verse or line`;
  const capitalised = note.split(/\s+/u).slice(1).map((token) => token.replace(/[^\p{L}'’]/gu, "")).filter((token) => /^\p{Lu}/u.test(token));
  const unknown = capitalised.find((token) => !ALLOWED_SOURCE_NAMES.has(normalize(token)));
  if (unknown) return `"${word}" source note must stay general (only broad sources such as older poetry, Shakespeare or the King James Bible), not "${unknown}"`;
  if (FORMAL_CUE.test(note)) return `"${word}" is described as formal or business English, which is formal register, not poetic`;
  if (!LITERARY_CUE.test(note)) return `"${word}" source note must say where in literature it is found (e.g. older poetry, Shakespeare, the King James Bible)`;
  return undefined;
}

/** Problems of a slang usage note: short English saying when to use it and when not to. */
export function monthlySlangUsageIssue(word: string, usage: string): string | undefined {
  const note = usage.trim();
  if (!note) return `"${word}" needs a short usage note (when to use it and when not to)`;
  if (VIETNAMESE_LETTER.test(note)) return `"${word}" usage note must be English with no Vietnamese`;
  const words = wordCount(note);
  if (words < NOTE_MIN_WORDS || words > NOTE_MAX_WORDS || note.length > NOTE_MAX_CHARS) return `"${word}" usage note must be ${NOTE_MIN_WORDS}–${NOTE_MAX_WORDS} words (at most ${NOTE_MAX_CHARS} characters)`;
  if (!NEGATIVE_CUE.test(note)) return `"${word}" usage note must also say when NOT to use it (e.g. not in reports or formal emails)`;
  return undefined;
}

/** Poetic must be literary, not formal register (commence, conclude, furnish are formal). */
export function monthlyFormalAsPoeticIssue(word: string): string | undefined {
  const tokens = normalize(word).split(" ");
  const formal = tokens.find((token) => FORMAL_REGISTER_WORDS.has(token));
  if (formal) return `"${word}" is a formal-register word, not a poetic (literary) synonym`;
  if (tokens.length > 1) return `"${word}" must be a single literary word, not a phrase`;
  if (tokens[0] && tokens[0].length > 6 && FORMAL_SUFFIX.test(tokens[0])) return `"${word}" looks like a formal (Latinate) register word, not a poetic (literary) synonym`;
  return undefined;
}

type RegisterCandidate = { kind: string; word: string; definition?: string | undefined; ipa?: string | undefined; usage?: string | undefined; source?: string | undefined };

/**
 * Deterministic gate for one register alternative of `core` (undefined = fine):
 * shape (1–4 words), not the core itself nor another word already on the
 * card, short simple-English definition, the sensitive-text filter (slang
 * must never be vulgar or offensive), and — for new items — IPA shape, a slang
 * usage note with a "when not to use" part, a general literary source note for
 * poetic, and no formal-register word as poetic. `legacy` re-checks an item
 * stored before 12/11 with the old rules only.
 */
export function monthlyRegisterTermIssue(
  core: { word: string },
  term: RegisterCandidate,
  options: { cefr: string; takenWords?: readonly string[]; legacy?: boolean }
): string | undefined {
  if (!monthlyRegisterTermsApply(options.cefr)) return `register alternatives are B1–C1 only (month is ${options.cefr})`;
  if (term.kind !== "slang" && term.kind !== "poetic") return `unknown register kind ${term.kind}`;
  const word = term.word.trim();
  if (!WORD_SHAPE.test(word)) return `"${word}" must be one English word or a 2–4 word expression`;
  if (normalize(word) === normalize(core.word)) return `"${word}" repeats the core word`;
  const coreNorm = normalize(core.word);
  if (!options.legacy && (normalize(word).split(" ").includes(coreNorm) || (coreNorm.length > 3 && normalize(word).startsWith(coreNorm)))) return `"${word}" is a form of the core word, not a different synonym`;
  if ((options.takenWords ?? []).some((taken) => normalize(taken) === normalize(word))) return `"${word}" is already a core or support word for this card`;
  const definition = term.definition?.trim() ?? "";
  if (!definition) return `"${word}" needs a short simple-English definition`;
  if (VIETNAMESE_LETTER.test(definition)) return `"${word}" definition must be simple English with no Vietnamese`;
  const words = wordCount(definition);
  if (words < 2 || words > DEFINITION_MAX_WORDS || definition.length > DEFINITION_MAX_CHARS) return `"${word}" definition must be 2–${DEFINITION_MAX_WORDS} words (at most ${DEFINITION_MAX_CHARS} characters)`;
  if (` ${normalize(definition).replace(/[^\p{L}\s'-]/gu, " ")} `.includes(` ${normalize(word)} `)) return `"${word}" definition must not use the word itself`;
  if (sensitiveTextIssue(word) || sensitiveTextIssue(definition)) return `"${word}" is not workplace-appropriate`;
  if (options.legacy) return undefined;
  const ipa = term.ipa?.trim() ?? "";
  if (!IPA_SHAPE.test(ipa)) return `"${word}" needs its British IPA between slashes`;
  if (FORMAL_REGISTER_WORDS.has(normalize(word))) return `"${word}" is a formal-register word, neither slang nor poetic`;
  if (term.kind === "slang") {
    const issue = monthlySlangUsageIssue(word, term.usage ?? "");
    if (issue) return issue;
    if (sensitiveTextIssue(term.usage ?? "")) return `"${word}" is not workplace-appropriate`;
    if (term.source?.trim()) return `"${word}" is slang and takes a usage note, not a source note`;
  } else {
    const issue = monthlyFormalAsPoeticIssue(word) ?? monthlyPoeticSourceIssue(word, term.source ?? "");
    if (issue) return issue;
    if (term.usage?.trim()) return `"${word}" is poetic and takes a source note, not a usage note`;
  }
  return undefined;
}

/**
 * Keeps the register alternatives that pass {@link monthlyRegisterTermIssue}
 * for one core, at most one per kind (the first valid one), with the fixed
 * register label. Returns an empty list at A1–A2. New candidates are checked
 * with the 12/11 rules; `allowLegacy` (stored data only) also accepts items
 * stored before 12/11 under the old rules, keeping their stored label.
 */
export function selectMonthlyRegisterTerms(
  core: { word: string },
  candidates: ReadonlyArray<RegisterCandidate & { register?: string | undefined }>,
  options: { cefr: string; takenWords?: readonly string[]; allowLegacy?: boolean }
): { selected: MonthlyRegisterTerm[]; rejected: string[] } {
  const selected: MonthlyRegisterTerm[] = [];
  const rejected: string[] = [];
  if (!monthlyRegisterTermsApply(options.cefr)) return { selected, rejected };
  for (const candidate of candidates) {
    const taken = [...(options.takenWords ?? []), ...selected.map((term) => term.word)];
    const legacy = Boolean(options.allowLegacy) && isLegacyMonthlyRegisterTerm(candidate);
    const issue = monthlyRegisterTermIssue(core, candidate, { cefr: options.cefr, takenWords: taken, legacy })
      ?? (selected.some((term) => term.kind === candidate.kind) ? `a ${candidate.kind} alternative is already chosen for ${core.word}` : undefined);
    if (issue) { rejected.push(issue); continue; }
    const kind = candidate.kind as MonthlyRegisterKind;
    if (legacy) {
      selected.push({ kind, word: candidate.word.trim(), definition: candidate.definition!.trim(), register: candidate.register?.trim() || MONTHLY_LEGACY_REGISTER_LABELS[kind] });
      continue;
    }
    selected.push({
      kind, word: candidate.word.trim(), definition: candidate.definition!.trim(), register: MONTHLY_REGISTER_LABELS[kind], ipa: candidate.ipa!.trim(),
      ...(kind === "slang" ? { usage: candidate.usage!.trim() } : { source: candidate.source!.trim() })
    });
  }
  return { selected, rejected };
}

/**
 * Stored register alternatives that are still valid (planning and lesson
 * attachment re-check them, so an edited or older pool never shows a bad one).
 * Items stored before 12/11 stay readable.
 */
export function validMonthlyRegisterTerms(core: { word: string; registerTerms?: readonly MonthlyRegisterTerm[] | undefined }, cefr: string | undefined): MonthlyRegisterTerm[] {
  if (!cefr || !monthlyRegisterTermsApply(cefr) || !Array.isArray(core.registerTerms) || !core.registerTerms.length) return [];
  return selectMonthlyRegisterTerms(core, core.registerTerms, { cefr, allowLegacy: true }).selected;
}

export interface MonthlyRegisterLexicalDetail {
  kind: MonthlyRegisterKind;
  word: string;
  definition: string;
  /** Legacy items only: the stored register label. */
  context?: string;
  ipa?: string;
  /** Part of speech (the core's, a synonym keeps it). */
  type?: string;
  usage?: string;
  source?: string;
}

/** Learner card lexical details (Slang / Poetic chips and modal) for a core's register alternatives. */
export function monthlyRegisterLexicalDetails(terms: readonly MonthlyRegisterTerm[], core?: { type?: string | undefined }): MonthlyRegisterLexicalDetail[] {
  const type = core?.type?.trim();
  return terms.map((term) => isLegacyMonthlyRegisterTerm(term)
    ? { kind: term.kind, word: term.word, definition: term.definition, context: term.register || MONTHLY_LEGACY_REGISTER_LABELS[term.kind] }
    : {
      kind: term.kind, word: term.word, definition: term.definition,
      ...(term.ipa ? { ipa: term.ipa } : {}),
      ...(type ? { type } : {}),
      ...(term.kind === "slang" && term.usage ? { usage: term.usage } : {}),
      ...(term.kind === "poetic" && term.source ? { source: term.source } : {})
    });
}
