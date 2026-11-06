import type { CefrLevel } from "@e4s/contracts";
import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { mapWithConcurrency, MonthlyCorePhaseShortfallError } from "./monthly-core-phase.js";

type CoreTerm = MonthlyResourcePlanTaskOutput["coreTerms"][number];
type SupportTerm = MonthlyResourcePlanTaskOutput["expandedTerms"][number];

/** Result of enriching one core: either it now holds its supports in the shared pool, or it must be dropped. */
export type MonthlyCoreEnrichmentOutcome = { ok: true } | { ok: false; issue: string };

export interface MonthlyEnrichmentRefillStats {
  /** Refill cycles run (each one calls the core phase once). */
  refillCycles: number;
  /** Cores dropped because enrichment could not keep or obtain their required relations. */
  droppedCores: Array<{ word: string; issue: string }>;
  /** Cores added by refill cycles. */
  refilledCores: number;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase("en").replace(/[\s\p{P}]+/gu, " ").trim();

/** Renumbers cores to `${cefr}-core-1..N` in order and re-links their supports. */
export function relinkMonthlyCoresAndSupports(cefr: CefrLevel, coreTerms: readonly CoreTerm[], supportTerms: readonly SupportTerm[]): { coreTerms: CoreTerm[]; supportTerms: SupportTerm[] } {
  const prefix = cefr.toLowerCase();
  const cores: CoreTerm[] = [];
  const supports: SupportTerm[] = [];
  coreTerms.forEach((core, index) => {
    const id = `${prefix}-core-${index + 1}`;
    cores.push({ ...core, id });
    for (const term of supportTerms) {
      if (term.relatesToCoreId === core.id) supports.push({ ...term, id: `${prefix}-expanded-${supports.length + 1}`, relatesToCoreId: id });
    }
  });
  return { coreTerms: cores, supportTerms: supports };
}

/**
 * Enrichment with drop-and-refill.
 *
 * Every pending core is enriched concurrently. A core whose enrichment cannot
 * keep or obtain the relations its part of speech requires is dropped together
 * with its supports instead of failing the request. The remaining cores (in
 * their original order) are handed back to the core phase (`refill`) as
 * `initial`, so only the freed slots are filled with fully checked cores that
 * are appended at the end; then only those new cores are enriched. After
 * `maxRefillCycles` refills, any core still dropped ends the request with a
 * `MonthlyCorePhaseShortfallError` carrying the accepted cores and supports so
 * the caller's checkpoint lets the next request continue.
 *
 * `coreTerms` and `expandedTerms` are the caller's shared arrays and are
 * updated in place; `enrichCore` reads and writes them while it runs.
 */
export async function runMonthlyEnrichmentWithRefill(input: {
  cefr: CefrLevel;
  neededCount: number;
  coreTerms: CoreTerm[];
  expandedTerms: SupportTerm[];
  /** Index of the first core to enrich in the first cycle; -1 when every core is already complete. */
  firstPendingIndex: number;
  enrichCore: (coreIndex: number) => Promise<MonthlyCoreEnrichmentOutcome>;
  /** Runs the core phase with `initial` cores (and supports) to fill the freed slots up to `neededCount`. */
  refill: (initial: { coreTerms: CoreTerm[]; supportTerms: SupportTerm[] }, avoidWords: readonly string[]) => Promise<{ coreTerms: CoreTerm[]; supportTerms: SupportTerm[] }>;
  /** Persists the current cores and supports (checkpoint). */
  save: (state: { coreTerms: CoreTerm[]; supportTerms: SupportTerm[] }) => Promise<void>;
  /** Called after the core list changed (drop/refill) so derived state such as core-word sets can be rebuilt. */
  onCoresChanged?: () => void;
  concurrency?: number;
  maxRefillCycles?: number;
}): Promise<MonthlyEnrichmentRefillStats> {
  const concurrency = input.concurrency ?? 6;
  const maxRefillCycles = input.maxRefillCycles ?? 3;
  const stats: MonthlyEnrichmentRefillStats = { refillCycles: 0, droppedCores: [], refilledCores: 0 };
  const avoidWords = new Set<string>();
  const replaceState = (state: { coreTerms: CoreTerm[]; supportTerms: SupportTerm[] }) => {
    input.coreTerms.splice(0, input.coreTerms.length, ...state.coreTerms);
    input.expandedTerms.splice(0, input.expandedTerms.length, ...state.supportTerms);
    input.onCoresChanged?.();
  };
  const droppedSummary = () => stats.droppedCores.map((entry) => `${entry.word}: ${entry.issue}`).join(" | ");

  let pending = input.firstPendingIndex >= 0
    ? input.coreTerms.map((_core, index) => index).filter((index) => index >= input.firstPendingIndex)
    : [];
  while (pending.length) {
    const outcomes = await mapWithConcurrency(pending, concurrency, (coreIndex) => input.enrichCore(coreIndex));
    const droppedIds = new Set<string>();
    pending.forEach((coreIndex, position) => {
      const outcome = outcomes[position]!;
      if (outcome.ok) return;
      const core = input.coreTerms[coreIndex]!;
      droppedIds.add(core.id);
      avoidWords.add(core.word);
      stats.droppedCores.push({ word: core.word, issue: outcome.issue });
    });
    if (!droppedIds.size) break;

    const remaining = relinkMonthlyCoresAndSupports(
      input.cefr,
      input.coreTerms.filter((core) => !droppedIds.has(core.id)),
      input.expandedTerms.filter((term) => !droppedIds.has(term.relatesToCoreId))
    );
    console.info("[monthly-enrichment] dropped cores", JSON.stringify({ cycle: stats.refillCycles, dropped: [...droppedIds].length, remaining: remaining.coreTerms.length, neededCount: input.neededCount }));
    if (stats.refillCycles >= maxRefillCycles) {
      replaceState(remaining);
      await input.save(remaining);
      throw new MonthlyCorePhaseShortfallError(
        [`Core vocabulary generation saved ${remaining.coreTerms.length} of ${input.neededCount} cores after ${stats.refillCycles} enrichment refill cycle${stats.refillCycles === 1 ? "" : "s"}; run generation again to continue from them. Cores dropped because enrichment could not keep their required relations: ${droppedSummary()}.`],
        remaining
      );
    }

    stats.refillCycles += 1;
    const keptWords = new Set(remaining.coreTerms.map((core) => normalize(core.word)));
    let refilled: { coreTerms: CoreTerm[]; supportTerms: SupportTerm[] };
    try {
      refilled = await input.refill(remaining, [...avoidWords]);
    } catch (error) {
      if (error instanceof MonthlyCorePhaseShortfallError) {
        replaceState(error.partial);
        await input.save(error.partial);
        throw new MonthlyCorePhaseShortfallError([...error.errors, `Cores dropped during enrichment: ${droppedSummary()}.`], error.partial);
      }
      throw error;
    }
    replaceState(refilled);
    await input.save(refilled);
    pending = input.coreTerms.flatMap((core, index) => keptWords.has(normalize(core.word)) ? [] : [index]);
    stats.refilledCores += pending.length;
  }
  return stats;
}
