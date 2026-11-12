/**
 * L-042 — optional register alternatives of the month's core words, B1–C1 only:
 * slang ("Khẩu ngữ": workplace-acceptable informal English, meet -> touch base)
 * and poetic ("Văn phong": formal / literary register, start -> commence).
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

export interface MonthlyRegisterCore { id: string; word: string; meaning: string; type: string }
export interface MonthlyRegisterCandidate { coreId: string; kind: MonthlyRegisterKind; word: string; definition: string }

/** Checkpoint shape: which cores were checked (by id and word) and the accepted alternatives. */
export const monthlyRegisterCheckpointSchema = z.object({
  checkedCores: z.array(z.object({ id: z.string().min(1), word: z.string().min(1) }).strict()).max(120),
  items: z.array(z.object({ coreId: z.string().min(1), kind: z.enum(["slang", "poetic"]), word: z.string().min(1), definition: z.string().min(1) }).strict()).max(240)
}).strict();
export type MonthlyRegisterCheckpoint = z.infer<typeof monthlyRegisterCheckpointSchema>;

const REGISTER_DEFINITION_RULE = (cefr: string) => `definition: a short simple-English definition or usage note of the alternative in this sense (2-14 words, vocabulary easier than CEFR ${cefr}, no Vietnamese, never using the alternative itself), e.g. touch base: "talk briefly to check on progress"; commence: "begin, in formal writing".`;

export function buildMonthlyRegisterTermsPrompt(input: { cefr: string; theme: string }): string {
  return `PHASE 2B — OPTIONAL REGISTER ALTERNATIVES (CEFR ${input.cefr}, theme ${input.theme}). For each core in cores (its exact sense is given by meaning, which is Vietnamese, and type) you MAY return at most one "slang" item and at most one "poetic" item; coreId is that core's id. `
    + `slang = a real, current, INFORMAL English word or short expression (1-4 words) that colleagues actually say at work for this exact sense (meet -> touch base, estimate -> ballpark, meeting -> catch-up). It must be acceptable in a normal workplace: never vulgar, crude, offensive, sexual, drug-related, violent or discriminatory, and never a spelling form such as gonna or wanna. `
    + `poetic = a real, current FORMAL or literary-register alternative used in formal writing for this exact sense (start -> commence, buy -> purchase, help -> assist, end -> conclude). `
    + `Both must keep the core's part of speech and exact sense, must not be the core itself or an inflection of it, and must not be a neutral everyday synonym (a neutral word is neither slang nor poetic). Do not invent, coin, or use rare, dated, regional or jargon words. Most cores have no genuine slang item and many have no formal alternative: returning nothing for a core is correct and preferred over forcing one; there is no quota. `
    + `${REGISTER_DEFINITION_RULE(input.cefr)} Return items: [] when no core has a genuine alternative.`;
}

export function buildMonthlyRegisterTermsAuditPrompt(input: { cefr: string }): string {
  return `AUDIT ONLY — DO NOT GENERATE. You are an independent British English lexicographer; you did not write these candidates. candidates lists proposed register alternatives for the cores in cores (each core's exact sense is its Vietnamese meaning and type). This task has no minimum count or quota. `
    + `Keep a candidate only when ALL are true: (1) the word or expression is real, current English found in a standard dictionary with this sense; (2) for slang it is genuinely informal AND acceptable in a normal workplace (never vulgar, crude, offensive, sexual, drug-related, violent or discriminatory); for poetic it is genuinely formal or literary register used in formal writing; (3) it means the same as the core in this exact sense, with the same part of speech; (4) its definition correctly describes it in simple English with no Vietnamese. `
    + `Reject anything invented, rare, dated, regional, jargon, a different sense, merely topic-related, or of neutral register (a neutral synonym is neither slang nor poetic). Do not repair, rename, relabel or add candidates. Return each accepted candidate in items exactly unchanged (coreId, kind, word, definition); return rejected candidates nowhere. Return items: [] when none pass. CEFR ${input.cefr}.`;
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

/**
 * Runs the phase for `cores`. Deterministic screen before the audit: known core,
 * shape, not a core/support word of the card, definition rules and the
 * sensitive-text filter (see selectMonthlyRegisterTerms). Never throws.
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
      maxOutputTokens: Math.min(6_000, 400 + cores.length * 90),
      temperature: 0.2,
      maxAttempts: 2
    });
    generated = monthlyRegisterTermsOutputSchema.parse(output.output).items;
  } catch (error) {
    return { ...result, failed: `generation: ${error instanceof Error ? error.message : String(error)}` };
  }
  result.generated = generated.length;
  const screened: MonthlyRegisterCandidate[] = [];
  for (const core of cores) {
    const forCore = generated.filter((item) => item.coreId === core.id);
    if (!forCore.length) continue;
    const takenWords = [...allCoreWords, ...input.supports.filter((support) => support.relatesToCoreId === core.id).map((support) => support.word)];
    const selection = selectMonthlyRegisterTerms(core, forCore, { cefr: input.cefr, takenWords });
    result.rejected.push(...selection.rejected.map((reason) => `${core.word}: ${reason}`));
    screened.push(...selection.selected.map((term) => ({ coreId: core.id, kind: term.kind, word: term.word, definition: term.definition })));
  }
  result.rejected.push(...generated.filter((item) => !coreById.has(item.coreId)).map((item) => `${item.word}: unknown core ${item.coreId}`));
  if (!screened.length) return result;
  try {
    result.calls += 1;
    const auditCores = cores.filter((core) => screened.some((item) => item.coreId === core.id));
    const output = await input.runner.runTask("monthly_register_terms", { cefr: input.cefr, cores: auditCores, candidates: screened }, {
      systemPrompt: buildMonthlyRegisterTermsAuditPrompt({ cefr: input.cefr }),
      maxOutputTokens: Math.min(6_000, 300 + screened.length * 60),
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
