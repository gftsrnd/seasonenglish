/**
 * L-042 — optional slang and poetic synonyms of the month's core words, B1–C1
 * only (stakeholder definition, 12/11):
 * - slang of core A = word C, a genuine same-meaning synonym of A used in
 *   everyday conversation, not in formal communication (dollar -> buck,
 *   cancel -> scrap), with British IPA and a usage note (when to use it, when not);
 * - poetic of core A = word B, a genuine same-meaning synonym of A used in
 *   literature rather than common English (morning -> morn, horse -> steed,
 *   sleep -> slumber), with British IPA and a GENERAL source note only.
 *   Formal-register words (commence, conclude, furnish) are not poetic.
 *
 * Cost: ONE batched generation call for all cores of the level and ONE batched
 * audit call over the surviving candidates (skipped when none survive). A1–A2
 * make no call. Returning nothing is correct and preferred over inventing;
 * absence is never a finding and a failed call never blocks the month (the
 * phase then simply yields no alternatives — an unaudited item is never kept).
 */
import { monthlyRegisterTermsOutputSchema, type AiTaskRunner } from "@e4s/ai";
import { monthlyRegisterTermsApply, selectMonthlyRegisterTerms, type MonthlyRegisterKind } from "@e4s/domain";
import { z } from "zod";
import { MONTHLY_BRITISH_IPA_RULE, monthlyBritishIpaIssue } from "./monthly-british-ipa.js";
import { MonthlyAiCallBudgetError, monthlyResourceAiCallLimit } from "./monthly-resource-generation.js";

export interface MonthlyRegisterCore { id: string; word: string; meaning: string; type: string }
export interface MonthlyRegisterCandidate {
  coreId: string;
  kind: MonthlyRegisterKind;
  word: string;
  definition: string;
  /** British IPA (absent only on checkpoints written before 12/11). */
  ipa?: string | undefined;
  /** Slang: when to use / when not to use. */
  usage?: string | undefined;
  /** Poetic: general source note. */
  source?: string | undefined;
}

/** Checkpoint shape: which cores were checked (by id and word) and the accepted alternatives. */
export const monthlyRegisterCheckpointSchema = z.object({
  checkedCores: z.array(z.object({ id: z.string().min(1), word: z.string().min(1) }).strict()).max(120),
  items: z.array(z.object({
    coreId: z.string().min(1), kind: z.enum(["slang", "poetic"]), word: z.string().min(1), definition: z.string().min(1),
    ipa: z.string().min(1).optional(), usage: z.string().min(1).optional(), source: z.string().min(1).optional()
  }).strict()).max(240)
}).strict();
export type MonthlyRegisterCheckpoint = z.infer<typeof monthlyRegisterCheckpointSchema>;

const SLANG_RULE = `SLANG of a core word A is a word or short expression C (1-4 words) that means EXACTLY the same as A in this sense — a true synonym: C can replace A in the same sentence without changing the meaning — and that native speakers use in everyday conversation but NOT in formal communication (dollar -> buck, cancel -> scrap, complain -> moan). A related but different idea is NOT a synonym and must never be returned: report -> update is wrong (an update is not a report), meeting -> call is wrong. It must be acceptable among colleagues: never vulgar, crude, offensive, sexual, drug-related, violent or discriminatory, and never a spelling form such as gonna or wanna.`;
const POETIC_RULE = `POETIC of a core word A is a single word B that means EXACTLY the same as A and is used in literature (poetry, old stories, Shakespeare, the King James Bible) rather than in common modern English (morning -> morn, horse -> steed, sleep -> slumber, enemy -> foe, sorrow -> woe, often -> oft, before -> ere, look -> behold). A FORMAL, business or official word is NOT poetic and must never be returned as poetic: start -> commence, finish -> conclude, give -> furnish, buy -> purchase, help -> assist, get -> obtain are formal register, not literature. Most workplace words have no poetic synonym: expect one for only a few cores (about 1 in 10 or fewer).`;
const NOTE_RULE = `note: for slang, one or two short simple-English sentences saying when to use it AND when NOT to use it (e.g. buck: "Fine in casual chat with friends or colleagues; do not use it in reports, client emails or formal meetings."); for poetic, ONLY a general note on where the word is found (e.g. morn: "Common in older poetry, Shakespeare and the King James Bible.") — never name a specific title, poem, play, chapter, verse, line or quotation, and never call it formal or business English.`;

export function buildMonthlyRegisterTermsPrompt(input: { cefr: string; theme: string }): string {
  return `PHASE 2B — OPTIONAL SLANG AND POETIC SYNONYMS (CEFR ${input.cefr}, theme ${input.theme}). For each core in cores (its exact sense is given by meaning, which is Vietnamese, and type) you MAY return at most one "slang" item and at most one "poetic" item; coreId is that core's id. `
    + `${SLANG_RULE} ${POETIC_RULE} `
    + `Both must keep the core's part of speech and exact sense, must not be the core itself or an inflection or phrase built on it, and must not be a neutral everyday synonym (a neutral word is neither slang nor poetic). Do not invent, coin, or use rare regional or jargon words. Most cores have no genuine slang item and almost all have no poetic item: returning nothing for a core is correct and preferred over forcing one; there is no quota. `
    + `Fields: word; ipa = the standard British English (RP) IPA of word between slashes; definition = a short simple-English definition of word in this sense (2-14 words, vocabulary easier than CEFR ${input.cefr}, never using word itself); ${NOTE_RULE} No Vietnamese anywhere. ${MONTHLY_BRITISH_IPA_RULE} Return items: [] when no core has a genuine slang or poetic synonym.`;
}

export function buildMonthlyRegisterTermsAuditPrompt(input: { cefr: string }): string {
  return `AUDIT ONLY — DO NOT GENERATE. You are an independent British English lexicographer; you did not write these candidates. candidates lists proposed slang and poetic synonyms for the cores in cores (each core's exact sense is its Vietnamese meaning and type). This task has no minimum count or quota. `
    + `${SLANG_RULE} ${POETIC_RULE} `
    + `Keep a candidate only when ALL are true: (1) the word is real English found in a standard dictionary with this sense; (2) it means EXACTLY the same as the core in this sense, with the same part of speech — it could replace the core in a sentence without changing the meaning (reject related ideas such as report -> update); (3) slang is genuinely everyday conversational English that is not used in formal communication and is acceptable among colleagues; poetic is genuinely literary (found in poetry or older literature) and NOT merely formal, business or official register (reject commence, conclude, furnish, purchase, assist); (4) ipa is a correct standard British (RP) transcription of the word; (5) the definition is correct simple English; (6) the note is correct: for slang it says when to use it and when not to; for poetic it is only a general, true source (e.g. older poetry, Shakespeare, the King James Bible) and names no specific title, verse, line or quotation; (7) no Vietnamese anywhere. `
    + `Reject anything invented, rare, regional, jargon, a different sense, merely topic-related, or of neutral register. When unsure, reject. Do not repair, rename, relabel or add candidates. Return each accepted candidate in items exactly unchanged (coreId, kind, word, ipa, definition, note); return rejected candidates nowhere. Return items: [] when none pass. CEFR ${input.cefr}.`;
}

function key(item: { coreId: string; kind: string; word: string }): string {
  return [item.coreId, item.kind, item.word.trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ")].join("\u0000");
}

/** Candidates the audit returned (matched by core, kind and word); the original candidate is kept unchanged. */
export function keepAuditedMonthlyRegisterTerms(candidates: readonly MonthlyRegisterCandidate[], audited: ReadonlyArray<{ coreId: string; kind: string; word: string }>): MonthlyRegisterCandidate[] {
  const kept = new Set(audited.map(key));
  return candidates.filter((candidate) => kept.has(key(candidate)));
}

export interface MonthlyRegisterPhaseResult {
  items: MonthlyRegisterCandidate[];
  calls: number;
  generated: number;
  rejected: string[];
  /** Set when a call failed; the phase then returns no alternatives for the requested cores. */
  failed?: string;
}

/** The model's `note` is the slang usage note or the poetic source note. */
function fromModelItem(item: { coreId: string; kind: MonthlyRegisterKind; word: string; ipa: string; definition: string; note: string }): MonthlyRegisterCandidate {
  return { coreId: item.coreId, kind: item.kind, word: item.word, definition: item.definition, ipa: item.ipa, ...(item.kind === "slang" ? { usage: item.note } : { source: item.note }) };
}

function toModelItem(item: MonthlyRegisterCandidate) {
  return { coreId: item.coreId, kind: item.kind, word: item.word, ipa: item.ipa ?? "", definition: item.definition, note: (item.kind === "slang" ? item.usage : item.source) ?? "" };
}

/**
 * Runs the phase for `cores`. Deterministic screen before the audit: known core,
 * shape, not a core/support word of the card, definition and note rules, no
 * formal-register word as poetic, the sensitive-text filter (see
 * selectMonthlyRegisterTerms) and the British IPA check used for cores and
 * supports. Never throws.
 */
export async function runMonthlyRegisterTermsPhase(input: {
  runner: Pick<AiTaskRunner, "runTask">;
  cefr: string;
  theme: string;
  cores: readonly MonthlyRegisterCore[];
  /** The month's support words by core (taken words for the card). */
  supports: ReadonlyArray<{ word: string; relatesToCoreId: string }>;
}): Promise<MonthlyRegisterPhaseResult> {
  const result: MonthlyRegisterPhaseResult = { items: [], calls: 0, generated: 0, rejected: [] };
  if (!monthlyRegisterTermsApply(input.cefr) || !input.cores.length) return result;
  const cores = input.cores.map(({ id, word, meaning, type }) => ({ id, word, meaning, type }));
  const coreById = new Map(cores.map((core) => [core.id, core]));
  const allCoreWords = cores.map((core) => core.word);
  let generated: MonthlyRegisterCandidate[];
  try {
    result.calls += 1;
    const output = await input.runner.runTask("monthly_register_terms", { cefr: input.cefr, theme: input.theme, cores }, {
      systemPrompt: buildMonthlyRegisterTermsPrompt({ cefr: input.cefr, theme: input.theme }),
      maxOutputTokens: Math.min(8_000, 500 + cores.length * 120),
      temperature: 0.2,
      maxAttempts: 2
    });
    generated = monthlyRegisterTermsOutputSchema.parse(output.output).items.map(fromModelItem);
  } catch (error) {
    return { ...result, failed: `generation: ${error instanceof Error ? error.message : String(error)}` };
  }
  result.generated = generated.length;
  const screened: MonthlyRegisterCandidate[] = [];
  for (const core of cores) {
    const forCore = generated.filter((item) => item.coreId === core.id);
    if (!forCore.length) continue;
    const ipaChecked = forCore.filter((item) => {
      const issue = monthlyBritishIpaIssue(item.word, item.ipa ?? "");
      if (issue) result.rejected.push(`${core.word}: "${item.word}" ${issue}`);
      return !issue;
    });
    const takenWords = [...allCoreWords, ...input.supports.filter((support) => support.relatesToCoreId === core.id).map((support) => support.word)];
    const selection = selectMonthlyRegisterTerms(core, ipaChecked, { cefr: input.cefr, takenWords });
    result.rejected.push(...selection.rejected.map((reason) => `${core.word}: ${reason}`));
    screened.push(...selection.selected.map((term) => ({ coreId: core.id, kind: term.kind, word: term.word, definition: term.definition, ...(term.ipa ? { ipa: term.ipa } : {}), ...(term.usage ? { usage: term.usage } : {}), ...(term.source ? { source: term.source } : {}) })));
  }
  result.rejected.push(...generated.filter((item) => !coreById.has(item.coreId)).map((item) => `${item.word}: unknown core ${item.coreId}`));
  if (!screened.length) return result;
  try {
    result.calls += 1;
    const auditCores = cores.filter((core) => screened.some((item) => item.coreId === core.id));
    const output = await input.runner.runTask("monthly_register_terms", { cefr: input.cefr, cores: auditCores, candidates: screened.map(toModelItem) }, {
      systemPrompt: buildMonthlyRegisterTermsAuditPrompt({ cefr: input.cefr }),
      maxOutputTokens: Math.min(8_000, 400 + screened.length * 110),
      temperature: 0,
      maxAttempts: 2
    });
    const audited = monthlyRegisterTermsOutputSchema.parse(output.output).items;
    result.items = keepAuditedMonthlyRegisterTerms(screened, audited);
    result.rejected.push(...screened.filter((item) => !result.items.includes(item)).map((item) => `${item.word}: rejected by the audit`));
  } catch (error) {
    // Never keep an unaudited alternative.
    return { ...result, items: [], failed: `audit: ${error instanceof Error ? error.message : String(error)}` };
  }
  return result;
}

/**
 * Resume: alternatives from a current checkpoint for cores that are unchanged
 * (same id and word), plus the cores still to check.
 */
export function resumeMonthlyRegisterCheckpoint(checkpoint: MonthlyRegisterCheckpoint | undefined, cores: readonly MonthlyRegisterCore[]): { items: MonthlyRegisterCandidate[]; pending: MonthlyRegisterCore[]; checked: MonthlyRegisterCheckpoint["checkedCores"] } {
  const same = (a: string, b: string) => a.trim().toLocaleLowerCase("en-US") === b.trim().toLocaleLowerCase("en-US");
  const checked = (checkpoint?.checkedCores ?? []).filter((entry) => cores.some((core) => core.id === entry.id && same(core.word, entry.word)));
  const checkedIds = new Set(checked.map((entry) => entry.id));
  return {
    items: (checkpoint?.items ?? []).filter((item) => checkedIds.has(item.coreId)),
    pending: cores.filter((core) => !checkedIds.has(core.id)),
    checked
  };
}

/**
 * Register-only regeneration of an existing pool's cores (Operator route for
 * drafts, trial script for approved pools on the dev stack): runs the phase
 * once for ALL cores and returns the cores with ONLY `registerTerms` replaced
 * — every other core field, and the supports, are untouched. When the phase
 * failed, nothing is replaced.
 */
export async function regenerateMonthlyRegisterTerms<T extends { id: string; word: string; meaning: string; type: string; registerTerms?: unknown }>(input: {
  runner: Pick<AiTaskRunner, "runTask">;
  cefr: string;
  theme: string;
  coreTerms: readonly T[];
  supportTerms: ReadonlyArray<{ word: string; relatedCoreTermId?: string; relatesToCoreId?: string }>;
}): Promise<{ coreTerms: T[]; phase: MonthlyRegisterPhaseResult }> {
  const phase = await runMonthlyRegisterTermsPhase({
    runner: input.runner, cefr: input.cefr, theme: input.theme,
    cores: input.coreTerms.map(({ id, word, meaning, type }) => ({ id, word, meaning, type })),
    supports: input.supportTerms.map((support) => ({ word: support.word, relatesToCoreId: support.relatedCoreTermId ?? support.relatesToCoreId ?? "" }))
  });
  if (phase.failed) return { coreTerms: [...input.coreTerms], phase };
  const coreTerms = input.coreTerms.map((core) => {
    const { registerTerms: _previous, ...rest } = core;
    const selected = selectMonthlyRegisterTerms(core, phase.items.filter((item) => item.coreId === core.id), { cefr: input.cefr }).selected;
    return (selected.length ? { ...rest, registerTerms: selected } : rest) as T;
  });
  return { coreTerms, phase };
}

export interface MonthlyRegisterUsage { calls: number; inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }

/**
 * Wraps a runner with the monthly resource AI-call ceiling
 * (MONTHLY_RESOURCE_AI_CALL_LIMIT, default 400) and token accounting, for the
 * register-only regeneration (which itself makes at most two calls).
 */
export function budgetedMonthlyRegisterRunner(base: Pick<AiTaskRunner, "runTask">, limit = monthlyResourceAiCallLimit()): { runner: Pick<AiTaskRunner, "runTask">; usage: MonthlyRegisterUsage } {
  const usage: MonthlyRegisterUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
  let started = 0;
  const runner: Pick<AiTaskRunner, "runTask"> = {
    runTask: async (...args: Parameters<AiTaskRunner["runTask"]>) => {
      if (started >= limit) throw new MonthlyAiCallBudgetError(limit);
      started += 1;
      const result = await base.runTask(...args);
      usage.calls += 1;
      usage.inputTokens += result.metadata?.usage?.inputTokens ?? 0;
      usage.outputTokens += result.metadata?.usage?.outputTokens ?? 0;
      usage.cacheReadInputTokens += result.metadata?.usage?.cacheReadInputTokens ?? 0;
      usage.cacheCreationInputTokens += result.metadata?.usage?.cacheCreationInputTokens ?? 0;
      return result;
    }
  };
  return { runner, usage };
}
