import { MONTHLY_MIN_SUPPORTS_PER_CORE, MONTHLY_STRUCTURAL_SUPPORT_RELATIONS, hasRequiredMonthlySupportRelations, requiredSupportRelationsFor, type MonthlyStructuralSupportRelation } from "@e4s/domain";
import type { CefrLevel } from "@e4s/contracts";
import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import {
  buildMonthlyCoreCandidatesPrompt,
  buildMonthlySupportRelationCandidatePrompt,
  findMonthlyCoreSynonymConflict,
  keepExactMonthlySupportRelationCandidates,
  keepSemanticallyAuditedSupportCandidates,
  MonthlyResourcePlanError,
  prefilterMonthlySupportCandidatesForAudit,
  selectMonthlyCoreCandidates,
  selectMonthlySupportCandidates
} from "./monthly-resource-generation.js";
import { isMonthlyCoreLevelReason, summarizeMonthlyCoreLevelRejections } from "./monthly-resource-quality-gates.js";

type CoreTerm = MonthlyResourcePlanTaskOutput["coreTerms"][number];
type SupportTerm = MonthlyResourcePlanTaskOutput["expandedTerms"][number];

export interface MonthlyPhaseTargets {
  vocabularyCount: number;
  expandedVocabularyCount: number;
  grammarTopicCount: number;
  pronunciationSoundCount: number;
}

export interface MonthlyCorePhaseStats {
  rounds: number;
  candidatesGenerated: number;
  generationCalls: number;
  gapFillCalls: number;
  auditCalls: number;
  auditsSkippedByPrefilter: number;
  elapsedMs: number;
}

/**
 * Sub-areas handed to the parallel month-wide generation calls so each call
 * draws from a different part of the approved theme and the calls rarely
 * propose the same words.
 */
/** Initial-letter groups that spread follow-up candidate requests across the lexicon. */
export const MONTHLY_CORE_LETTER_GROUPS = ["a, b", "c", "d, e", "f, g, h", "i, j, k, l", "m, n, o", "p, q, r", "s", "t, u, v, w, y"] as const;

export const MONTHLY_CORE_SUB_AREAS = [
  "people, roles, teams and organisations involved in this theme (mostly nouns)",
  "the main actions and processes needed to reach the communication goal (mostly verbs)",
  "documents, information, messages and tools used in this theme (mostly nouns)",
  "time, scheduling, progress and follow-up steps (nouns and verbs)",
  "problems, requests, changes and solutions that come up (nouns and verbs)",
  "qualities, evaluations, results and outcomes (adjectives, adverbs and result nouns)"
] as const;

const normalize = (value: string) => value.trim().toLocaleLowerCase("en").replace(/[\s\p{P}]+/gu, " ").trim();

const isInvalidAiOutputDefault = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && ["AI_OUTPUT_INVALID", "AI_OUTPUT_TRUNCATED"].includes(String((error as { code?: unknown }).code)));

/** Runs `worker` over `items` with at most `limit` in flight, preserving result order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run));
  return results;
}

/**
 * Month-wide Phase 1 core selection.
 *
 * 1. A few parallel generation calls (each with its own sub-area and the full
 *    forbidden list) return ≈1.5× the needed candidates, each with 2–3
 *    options per required relation.
 * 2. Every candidate is pre-filtered, audited and (only for relations its part
 *    of speech requires that are still missing: noun -> umbrella/synonym,
 *    verb/adjective/adverb -> synonym/word family) gap-filled concurrently
 *    under a concurrency limit.
 * 3. Cores are selected sequentially in deterministic candidate order
 *    (uniqueness, single sense, family overlap, synonym conflicts, required
 *    relations, 35% repeat ceiling, phrase cap).
 * 4. Follow-up rounds request only the missing count; after `maxRounds` the
 *    phase fails with the collected candidate failures.
 */
export async function runMonthlyCorePhase(input: {
  cefr: CefrLevel;
  theme: { title: string; communicationGoal: string };
  neededCount: number;
  maxRepeatedPlacements: number;
  maxPhrasePlacements: number;
  supportTargetPerCore: number;
  generate: (prompt: string, coreTermBatch: CoreTerm[], targets: MonthlyPhaseTargets, options?: { temperature?: number; maxOutputTokens?: number }) => Promise<MonthlyResourcePlanTaskOutput>;
  audit: (core: CoreTerm, candidates: SupportTerm[]) => Promise<MonthlyResourcePlanTaskOutput>;
  isInvalidAiOutput?: (error: unknown) => boolean;
  candidatesPerCall?: number;
  maxParallelCalls?: number;
  concurrency?: number;
  maxRounds?: number;
  /** Smallest candidate request per round (default 12) so late rounds still explore. */
  minRequest?: number;
  overProvision?: number;
  relationOptionsPerRequired?: number;
  gapFillCandidateCount?: number;
  /** Cores (with their kept supports) accepted by an earlier, unfinished run; selection continues after them. */
  initial?: { coreTerms: CoreTerm[]; supportTerms: SupportTerm[] };
  /** Headwords that must not become cores again (e.g. cores dropped by enrichment); treated as already tried. */
  avoidWords?: readonly string[];
  /** Core words of the month's other CEFR levels (word -> level): an exclusion list in the prompt and a gate in selection. */
  otherLevelCoreWords?: ReadonlyMap<string, CefrLevel>;
  now?: () => number;
}): Promise<{ coreTerms: CoreTerm[]; supportTerms: SupportTerm[]; stats: MonthlyCorePhaseStats }> {
  const now = input.now ?? (() => Date.now());
  const startedAt = now();
  const isInvalidAiOutput = input.isInvalidAiOutput ?? isInvalidAiOutputDefault;
  const candidatesPerCall = input.candidatesPerCall ?? 10;
  const maxParallelCalls = input.maxParallelCalls ?? 8;
  const concurrency = input.concurrency ?? 8;
  const maxRounds = input.maxRounds ?? 16;
  const overProvision = input.overProvision ?? 3;
  const relationOptions = input.relationOptionsPerRequired ?? 3;
  const gapFillCandidateCount = input.gapFillCandidateCount ?? 8;
  const levelPrefix = input.cefr.toLowerCase();
  const stats: MonthlyCorePhaseStats = { rounds: 0, candidatesGenerated: 0, generationCalls: 0, gapFillCalls: 0, auditCalls: 0, auditsSkippedByPrefilter: 0, elapsedMs: 0 };

  const accepted: Array<{ core: CoreTerm; supports: SupportTerm[]; synonyms: string[] }> = [];
  const acceptedCoreWords = () => new Set(accepted.map((entry) => normalize(entry.core.word)));
  const acceptedSupports = () => accepted.flatMap((entry) => entry.supports);
  const triedWords = new Set<string>();
  const failures: string[] = [];
  // Level-gate rejections (too easy, another level's core, non-word) are fed
  // back in full on the next round so the AI replaces them at the right level.
  const levelRejections: Array<{ word: string; reason: string }> = [];
  for (const core of (input.initial?.coreTerms ?? []).slice(0, input.neededCount)) {
    const supports = (input.initial?.supportTerms ?? []).filter((term) => term.relatesToCoreId === core.id);
    accepted.push({ core, supports, synonyms: supports.filter((term) => term.relation === "synonym").map((term) => term.word) });
    triedWords.add(normalize(core.word));
  }
  for (const word of input.avoidWords ?? []) triedWords.add(normalize(word));

  const auditEdges = async (candidate: CoreTerm, edges: SupportTerm[]): Promise<SupportTerm[]> => {
    const { kept } = prefilterMonthlySupportCandidatesForAudit(candidate, edges);
    if (!kept.length) {
      if (edges.length) stats.auditsSkippedByPrefilter += 1;
      return [];
    }
    stats.auditCalls += 1;
    const audited = await input.audit(candidate, kept);
    return keepSemanticallyAuditedSupportCandidates(kept, audited.expandedTerms);
  };

  const selectSupportsFor = (candidate: CoreTerm, audited: SupportTerm[], coreWords: ReadonlySet<string>, existingSupportWords: readonly string[]) => selectMonthlySupportCandidates({
    candidates: audited,
    coreId: candidate.id,
    coreWord: candidate.word,
    coreType: candidate.type,
    coreWords,
    sameCoreWords: new Set(),
    sameCoreRelations: new Set(),
    existingSupportWords,
    maxRepeatedPlacements: input.maxRepeatedPlacements,
    maxPhrasePlacements: input.maxPhrasePlacements,
    cefr: input.cefr,
    // Keep every audited support up to the per-core target (<= 9, at most 3
    // per relation) so enrichment only asks the AI for what is still missing.
    needed: input.supportTargetPerCore
  });

  for (let round = 0; round < maxRounds && accepted.length < input.neededCount; round += 1) {
    stats.rounds += 1;
    const missing = input.neededCount - accepted.length;
    const requested = Math.max(input.minRequest ?? 12, Math.ceil(missing * overProvision));
    // Spread each round over as many parallel calls (one sub-area each) as the
    // request needs, at least 4 candidates per call for variety, and never more
    // than candidatesPerCall per call so the output never truncates.
    const perCallSize = Math.min(candidatesPerCall, Math.max(4, Math.ceil(requested / maxParallelCalls)));
    const callCount = Math.min(maxParallelCalls, Math.ceil(requested / perCallSize));
    const roundTotal = Math.min(requested, callCount * candidatesPerCall);
    const perCall = Array.from({ length: callCount }, (_value, index) => Math.min(candidatesPerCall, Math.floor(roundTotal / callCount) + (index < roundTotal % callCount ? 1 : 0)));
    const roundStartCoreWords = acceptedCoreWords();
    const forbidden = [...new Set([
      ...accepted.map((entry) => entry.core.word),
      ...acceptedSupports().map((term) => term.word),
      ...triedWords
    ])];
    const levelRepair = summarizeMonthlyCoreLevelRejections(input.cefr, levelRejections);
    const otherFailures = failures.filter((failure) => !isMonthlyCoreLevelReason(failure));
    const previousIssue = round > 0 && failures.length
      ? `an earlier round left ${missing} core slot${missing === 1 ? "" : "s"} unfilled.${otherFailures.length ? ` Recent failures: ${otherFailures.slice(-8).join("; ")}.` : ""}${levelRepair ? ` ${levelRepair}` : ""}`
      : "";

    // 1. Parallel month-wide generation, one sub-area per call.
    const callResults = await Promise.all(perCall.map(async (candidateCount, callIndex) => {
      const baseSubArea = MONTHLY_CORE_SUB_AREAS[(round * callCount + callIndex) % MONTHLY_CORE_SUB_AREAS.length]!;
      // From round 2 the model tends to repeat words it already tried. Give each
      // call its own initial-letter group so the calls explore different parts of
      // the lexicon. Every round stays on the approved theme and sub-area: a
      // loosely related general word produced off-theme cores in real runs.
      const letters = MONTHLY_CORE_LETTER_GROUPS[(round * callCount + callIndex) % MONTHLY_CORE_LETTER_GROUPS.length]!;
      const subArea = round === 0
        ? baseSubArea
        : `${baseSubArea}. Every candidate headword in this request must start with one of these letters: ${letters}, and must still belong to this sub-area of the approved theme; return fewer candidates rather than an off-theme word`;
      const prompt = buildMonthlyCoreCandidatesPrompt({
        cefr: input.cefr,
        theme: input.theme.title,
        communicationGoal: input.theme.communicationGoal,
        existingCoreWords: forbidden,
        batchNumber: round + 1,
        neededCount: candidateCount,
        candidateCount,
        preflightRelations: true,
        relationOptionsPerRequired: relationOptions,
        subArea,
        ...(input.otherLevelCoreWords?.size ? { otherLevelCoreWords: input.otherLevelCoreWords } : {}),
        ...(round > 0 ? { rejectedWords: [...triedWords], previousIssue } : {})
      });
      stats.generationCalls += 1;
      try {
        return await input.generate(prompt, [], { vocabularyCount: candidateCount, expandedVocabularyCount: candidateCount * relationOptions * 3, grammarTopicCount: 0, pronunciationSoundCount: 0 }, { maxOutputTokens: 16_000 });
      } catch (error) {
        if (isInvalidAiOutput(error)) {
          failures.push(`generation call ${round + 1}.${callIndex + 1} returned invalid output`);
          return undefined;
        }
        throw error;
      }
    }));

    // Re-key candidates so IDs never collide across calls, then interleave the
    // calls round-robin so consecutive lesson days mix sub-areas. Order is
    // deterministic: it depends only on call index and position.
    const perCallCandidates = callResults.map((result, callIndex) => (result?.coreTerms ?? []).map((core, position) => {
      const id = `candidate-${round + 1}-${callIndex + 1}-${position + 1}`;
      const edges = (result?.expandedTerms ?? []).filter((term) => term.relatesToCoreId === core.id).map((term) => ({ ...term, relatesToCoreId: id }));
      return { core: { ...core, id }, edges };
    }));
    const ordered: Array<{ core: CoreTerm; edges: SupportTerm[] }> = [];
    const seen = new Set<string>();
    for (let position = 0; position < Math.max(0, ...perCallCandidates.map((list) => list.length)); position += 1) {
      for (const list of perCallCandidates) {
        const entry = list[position];
        if (!entry) continue;
        const word = normalize(entry.core.word);
        if (seen.has(word) || triedWords.has(word)) continue;
        seen.add(word);
        ordered.push(entry);
      }
    }
    stats.candidatesGenerated += ordered.length;
    const returnedCount = perCallCandidates.reduce((total, list) => total + list.length, 0);
    console.info("[monthly-core-phase] round", JSON.stringify({ round: round + 1, missing, requested: perCall.reduce((a, b) => a + b, 0), calls: perCall.length, returned: returnedCount, newAfterDedup: ordered.length, acceptedSoFar: accepted.length }));
    ordered.forEach((entry) => triedWords.add(normalize(entry.core.word)));

    // Cheap deterministic core screen before any AI audit.
    const eligible = ordered.filter((entry) => {
      const result = selectMonthlyCoreCandidates({ candidates: [entry.core], existingCoreWords: roundStartCoreWords, needed: 1, cefr: input.cefr, ...(input.otherLevelCoreWords ? { otherLevelCoreWords: input.otherLevelCoreWords } : {}) });
      if (result.selected.length !== 1) {
        const reason = result.rejected[0] ?? "duplicate, mixed-sense, or overlapping core";
        failures.push(`${entry.core.word}: ${reason}`);
        if (isMonthlyCoreLevelReason(reason)) levelRejections.push({ word: entry.core.word, reason });
      }
      return result.selected.length === 1;
    }).map((entry) => {
      // The core's own level label only serves the screen above; drop it so
      // downstream inputs (gap-fill coreTermBatch) and stored cores keep their shape.
      const { cefr: _coreLevel, ...core } = entry.core;
      return { ...entry, core };
    });

    // 2. Audit + gap-fill per candidate, concurrently. Preparation stops being
    // launched once enough cores are selected (the consumer below sets stop).
    let stop = false;
    const prepare = async (entry: { core: CoreTerm; edges: SupportTerm[] }) => {
      const candidate = entry.core;
      let audited: SupportTerm[];
      try { audited = await auditEdges(candidate, entry.edges); }
      catch (error) {
        if (isInvalidAiOutput(error)) return { entry, audited: [] as SupportTerm[], failure: `${candidate.word}: relation audit output was invalid` };
        throw error;
      }
      const preliminaryCoreWords = new Set([...roundStartCoreWords, normalize(candidate.word)]);
      const preliminary = selectSupportsFor(candidate, audited, preliminaryCoreWords, []).selected;
      // Gap-fill only what this part of speech requires; an optional relation
      // (noun word family, verb/adjective umbrella) is never chased here.
      const missingRequired = requiredSupportRelationsFor(candidate.type).filter((relation) => !preliminary.some((term) => term.relation === relation));
      const gapResults = await Promise.all(missingRequired.map(async (relation: MonthlyStructuralSupportRelation) => {
        try {
          const prompt = buildMonthlySupportRelationCandidatePrompt({
            cefr: input.cefr,
            core: candidate,
            relation,
            theme: input.theme.title,
            forbiddenCoreWords: [...preliminaryCoreWords],
            existingSupportWords: acceptedSupports().map((term) => term.word),
            sameCoreSupportWords: audited.map((term) => term.word),
            rejectedCandidateWords: entry.edges.filter((term) => term.relation === relation && !audited.includes(term)).map((term) => term.word),
            previousIssue: "",
            candidateCount: gapFillCandidateCount
          });
          stats.gapFillCalls += 1;
          const generated = await input.generate(prompt, [candidate], { vocabularyCount: 0, expandedVocabularyCount: gapFillCandidateCount, grammarTopicCount: 0, pronunciationSoundCount: 0 }, { temperature: 0.35 });
          const exact = keepExactMonthlySupportRelationCandidates(generated.expandedTerms, relation, candidate.id);
          return exact.length ? await auditEdges(candidate, exact) : [];
        } catch (error) {
          if (isInvalidAiOutput(error)) return [];
          throw error;
        }
      }));
      return { entry, audited: [...audited, ...gapResults.flat()], failure: "" };
    };

    const prepared: Array<Promise<Awaited<ReturnType<typeof prepare>>> | undefined> = [];
    let launched = 0;
    let active = 0;
    const launchMore = () => {
      while (!stop && active < concurrency && launched < eligible.length) {
        const index = launched;
        launched += 1;
        active += 1;
        const promise = prepare(eligible[index]!);
        const settle = () => { active -= 1; launchMore(); };
        promise.then(settle, settle);
        prepared[index] = promise;
      }
    };
    launchMore();

    // 3. Sequential selection in candidate order.
    for (let index = 0; index < eligible.length && accepted.length < input.neededCount; index += 1) {
      launchMore();
      const { entry, audited, failure } = await prepared[index]!;
      const candidate = entry.core;
      if (failure) { failures.push(failure); continue; }
      const coreWords = acceptedCoreWords();
      const eligibleCore = selectMonthlyCoreCandidates({ candidates: [candidate], existingCoreWords: coreWords, needed: 1, cefr: input.cefr, ...(input.otherLevelCoreWords ? { otherLevelCoreWords: input.otherLevelCoreWords } : {}) }).selected[0];
      if (!eligibleCore) { failures.push(`${candidate.word}: duplicate, mixed-sense, or overlapping core`); continue; }
      const word = normalize(candidate.word);
      const supportOwner = accepted.find((other) => other.supports.some((term) => normalize(term.word) === word));
      if (supportOwner) { failures.push(`${candidate.word}: already used as a support of core ${supportOwner.core.word}`); continue; }
      const auditedSynonyms = audited.filter((term) => term.relation === "synonym").map((term) => term.word);
      const synonymConflict = findMonthlyCoreSynonymConflict({ candidateWord: candidate.word, candidateSynonyms: auditedSynonyms, acceptedCores: accepted.map((other) => ({ word: other.core.word, synonyms: other.synonyms })) });
      if (synonymConflict) { failures.push(`${candidate.word}: synonym of accepted core ${synonymConflict}`); continue; }
      const selection = selectSupportsFor(candidate, audited, new Set([...coreWords, word]), acceptedSupports().map((term) => term.word));
      // A core is accepted once it holds the relations its part of speech
      // requires. The 3-supports-per-core minimum is filled and enforced by the
      // enrichment phase (antonym, collocation or extra relations), so a core
      // with exactly its two required relations is not rejected here.
      if (!hasRequiredMonthlySupportRelations(candidate.type, selection.selected)) {
        const summary = (terms: readonly SupportTerm[]) => MONTHLY_STRUCTURAL_SUPPORT_RELATIONS.map((relation) => `${relation}=${terms.filter((term) => term.relation === relation).map((term) => term.word).slice(0, 3).join("/") || "∅"}`).join(", ");
        failures.push(`${candidate.word} (${candidate.type}; needs ${requiredSupportRelationsFor(candidate.type).join("+")}): generated [${summary(entry.edges)}], audit kept [${summary(audited)}], selected [${summary(selection.selected)}]`);
        continue;
      }
      accepted.push({ core: eligibleCore, supports: selection.selected, synonyms: auditedSynonyms });
      if (accepted.length === input.neededCount) stop = true;
    }
    stop = true;
    // Let in-flight preparation settle so no work outlives the phase; their
    // results (or AI-output errors) are intentionally unused.
    await Promise.allSettled(prepared.filter(Boolean));
  }

  stats.elapsedMs = now() - startedAt;
  const coreTerms: CoreTerm[] = [];
  const supportTerms: SupportTerm[] = [];
  accepted.forEach((entry, index) => {
    const id = `${levelPrefix}-core-${index + 1}`;
    coreTerms.push({ ...entry.core, id });
    for (const term of entry.supports) supportTerms.push({ ...term, id: `${levelPrefix}-expanded-${supportTerms.length + 1}`, relatesToCoreId: id });
  });
  if (accepted.length < input.neededCount) {
    throw new MonthlyCorePhaseShortfallError(
      [`Core vocabulary generation saved ${accepted.length} of ${input.neededCount} cores after ${stats.rounds} round${stats.rounds === 1 ? "" : "s"} (${stats.candidatesGenerated} candidates); run generation again to continue from them. Candidate failures: ${failures.slice(0, 40).join("; ") || "no candidates were returned"}.`],
      { coreTerms, supportTerms }
    );
  }
  return { coreTerms, supportTerms, stats };
}

/**
 * Thrown when the core phase ends short. It carries the cores (and their kept
 * supports) accepted so far so the caller can checkpoint them and the next run
 * continues from them instead of starting over.
 */
export class MonthlyCorePhaseShortfallError extends MonthlyResourcePlanError {
  constructor(errors: string[], readonly partial: { coreTerms: CoreTerm[]; supportTerms: SupportTerm[] }) {
    super(errors);
  }
}
