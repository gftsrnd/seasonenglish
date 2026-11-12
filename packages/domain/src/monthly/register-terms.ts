import type { CefrLevel } from "@e4s/contracts";
import { sensitiveTextIssue } from "../content/sensitive-text.js";

/**
 * Optional register alternatives of a core word (L-042, B1–C1 only):
 * - "slang": a workplace-acceptable INFORMAL word or expression for the same
 *   sense (meet -> touch base, estimate -> ballpark), shown as "Khẩu ngữ";
 * - "poetic": a FORMAL / literary-register alternative used in formal writing
 *   (start -> commence), shown as "Văn phong".
 * Never mandatory: most cores have none, and absence is never a finding. Each
 * carries a short simple-English `definition` (no Vietnamese) and a fixed
 * English register label.
 */
export type MonthlyRegisterKind = "slang" | "poetic";
export const MONTHLY_REGISTER_KINDS = ["slang", "poetic"] as const satisfies readonly MonthlyRegisterKind[];

export interface MonthlyRegisterTerm {
  kind: MonthlyRegisterKind;
  word: string;
  /** Short simple-English definition / usage note (2–14 words, no Vietnamese). */
  definition: string;
  /** English register label shown with the definition. */
  register: string;
}

/** Register alternatives are generated and shown for these month levels only. */
export const MONTHLY_REGISTER_LEVELS: readonly CefrLevel[] = ["B1", "B2", "C1"];
export function monthlyRegisterTermsApply(cefr: string | undefined): boolean {
  return cefr === "B1" || cefr === "B2" || cefr === "C1";
}

export const MONTHLY_REGISTER_LABELS: Readonly<Record<MonthlyRegisterKind, string>> = {
  slang: "Informal: casual spoken workplace English",
  poetic: "Formal: formal or literary writing"
};

const DEFINITION_MAX_WORDS = 14;
const DEFINITION_MAX_CHARS = 100;
const VIETNAMESE_LETTER = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹàáèéìíòóùúý]/iu;
const WORD_SHAPE = /^\p{L}+(?:[-'’]\p{L}+)*(?:\s+\p{L}+(?:[-'’]\p{L}+)*){0,3}$/u;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/’/gu, "'").replace(/\s+/gu, " ");
}

/**
 * Deterministic gate for one register alternative of `core` (undefined = fine):
 * shape (1–4 words), not the core itself nor another word already on the
 * card, short simple-English definition, and the sensitive-text filter (slang
 * must never be vulgar or offensive).
 */
export function monthlyRegisterTermIssue(
  core: { word: string },
  term: { kind: string; word: string; definition?: string | undefined },
  options: { cefr: string; takenWords?: readonly string[] }
): string | undefined {
  if (!monthlyRegisterTermsApply(options.cefr)) return `register alternatives are B1–C1 only (month is ${options.cefr})`;
  if (term.kind !== "slang" && term.kind !== "poetic") return `unknown register kind ${term.kind}`;
  const word = term.word.trim();
  if (!WORD_SHAPE.test(word)) return `"${word}" must be one English word or a 2–4 word expression`;
  if (normalize(word) === normalize(core.word)) return `"${word}" repeats the core word`;
  if ((options.takenWords ?? []).some((taken) => normalize(taken) === normalize(word))) return `"${word}" is already a core or support word for this card`;
  const definition = term.definition?.trim() ?? "";
  if (!definition) return `"${word}" needs a short simple-English definition`;
  if (VIETNAMESE_LETTER.test(definition)) return `"${word}" definition must be simple English with no Vietnamese`;
  const words = definition.split(/\s+/u).filter(Boolean).length;
  if (words < 2 || words > DEFINITION_MAX_WORDS || definition.length > DEFINITION_MAX_CHARS) return `"${word}" definition must be 2–${DEFINITION_MAX_WORDS} words (at most ${DEFINITION_MAX_CHARS} characters)`;
  if (` ${normalize(definition).replace(/[^\p{L}\s'-]/gu, " ")} `.includes(` ${normalize(word)} `)) return `"${word}" definition must not use the word itself`;
  if (sensitiveTextIssue(word) || sensitiveTextIssue(definition)) return `"${word}" is not workplace-appropriate`;
  return undefined;
}

/**
 * Keeps the register alternatives that pass {@link monthlyRegisterTermIssue}
 * for one core, at most one per kind (the first valid one), with the fixed
 * register label. Returns an empty list at A1–A2.
 */
export function selectMonthlyRegisterTerms(
  core: { word: string },
  candidates: ReadonlyArray<{ kind: string; word: string; definition?: string | undefined }>,
  options: { cefr: string; takenWords?: readonly string[] }
): { selected: MonthlyRegisterTerm[]; rejected: string[] } {
  const selected: MonthlyRegisterTerm[] = [];
  const rejected: string[] = [];
  if (!monthlyRegisterTermsApply(options.cefr)) return { selected, rejected };
  for (const candidate of candidates) {
    const taken = [...(options.takenWords ?? []), ...selected.map((term) => term.word)];
    const issue = monthlyRegisterTermIssue(core, candidate, { cefr: options.cefr, takenWords: taken })
      ?? (selected.some((term) => term.kind === candidate.kind) ? `a ${candidate.kind} alternative is already chosen for ${core.word}` : undefined);
    if (issue) { rejected.push(issue); continue; }
    const kind = candidate.kind as MonthlyRegisterKind;
    selected.push({ kind, word: candidate.word.trim(), definition: candidate.definition!.trim(), register: MONTHLY_REGISTER_LABELS[kind] });
  }
  return { selected, rejected };
}

/**
 * Stored register alternatives that are still valid (planning and lesson
 * attachment re-check them, so an edited or older pool never shows a bad one).
 */
export function validMonthlyRegisterTerms(core: { word: string; registerTerms?: readonly MonthlyRegisterTerm[] | undefined }, cefr: string | undefined): MonthlyRegisterTerm[] {
  if (!cefr || !monthlyRegisterTermsApply(cefr) || !Array.isArray(core.registerTerms) || !core.registerTerms.length) return [];
  return selectMonthlyRegisterTerms(core, core.registerTerms, { cefr }).selected;
}

/** Learner card lexical details ("Khẩu ngữ" / "Văn phong") for a core's register alternatives. */
export function monthlyRegisterLexicalDetails(terms: readonly MonthlyRegisterTerm[]): Array<{ kind: MonthlyRegisterKind; word: string; definition: string; context: string }> {
  return terms.map((term) => ({ kind: term.kind, word: term.word, definition: term.definition, context: term.register || MONTHLY_REGISTER_LABELS[term.kind] }));
}
