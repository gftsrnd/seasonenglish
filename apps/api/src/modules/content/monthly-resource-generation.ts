import { allowedMonthlySupportLevels, buildMonthlyCalendar, monthlyDayKind, monthlySupportLevelBand, MONTHLY_MAX_SUPPORTS_PER_CORE, MONTHLY_MIN_SUPPORTS_PER_CORE, MONTHLY_REQUIRED_SUPPORT_RELATIONS, type MonthlyResourcePoolContract, type MonthlySupportRelation, type SharedMonthBrief } from "@e4s/domain";
import type { CefrLevel } from "@e4s/contracts";
import { monthlyResourcePlanOutputSchema, type MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { validateMonthlyResourcePlanShape } from "./monthly-resource-plan-spec.js";

/**
 * VH-R33: umbrella/synonym/antonym (and every other support) may come from the
 * month's CEFR level or one adjacent level. Prompts ask the model to label each
 * support with its own level so the band is recorded on the stored term.
 */
export function buildMonthlySupportLevelGuidance(cefr: string): string {
  const allowed = isCefrLevel(cefr) ? allowedMonthlySupportLevels(cefr) : [];
  const band = allowed.length ? allowed.join(", ") : `${cefr} or one adjacent CEFR level`;
  return `Support words may be at CEFR ${band} (the month's level ${cefr} or one adjacent level). Set each expandedTerms item's cefr field to that support word's own CEFR level. Do not reject or omit a genuine relation only because the word is one level above or below ${cefr}; never use a word two or more levels away, and never force a relation that does not genuinely exist.`;
}

function isCefrLevel(value: string): value is CefrLevel {
  return value === "A1" || value === "A2" || value === "B1" || value === "B2" || value === "C1";
}

export interface MonthlyResourceCriteria {
  vocabularyCount: number;
  expandedVocabularyCount: number;
  grammarTopicCount: number;
  pronunciationSoundCount: number;
}

export const MONTHLY_RESOURCE_CANDIDATE_POOL_SIZE = 500;
export const monthlyResourceCandidatePoolSchema = monthlyResourcePlanOutputSchema.shape.coreTerms.max(MONTHLY_RESOURCE_CANDIDATE_POOL_SIZE);

export function parseMonthlyResourceAiOutput(output: unknown): MonthlyResourcePlanTaskOutput {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return monthlyResourcePlanOutputSchema.parse(output);
  }
  const candidate = output as Record<string, unknown>;
  // Model providers sometimes attach top-level explanatory metadata even when
  // the requested content schema is strict. Ignore those non-content keys,
  // while keeping every resource field and nested item strictly validated.
  return monthlyResourcePlanOutputSchema.parse({
    coreTerms: candidate.coreTerms,
    expandedTerms: candidate.expandedTerms,
    grammarTopics: candidate.grammarTopics,
    pronunciationTargets: candidate.pronunciationTargets
  });
}

const CURRENT_MONTHLY_RESOURCE_BASE_SCHEMA_VERSION = "monthly-resource-category-v17-core-family-screen-current-pronunciation-system";
export const CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS = {
  coreTerms: "monthly-resource-category-v19-core-relation-preflight",
  expandedTerms: "monthly-resource-category-v32-preflight-support-graph-and-partial-checkpoints",
  grammarTopics: CURRENT_MONTHLY_RESOURCE_BASE_SCHEMA_VERSION,
  pronunciationTargets: CURRENT_MONTHLY_RESOURCE_BASE_SCHEMA_VERSION
} as const;

export function isCurrentMonthlyResourceCheckpointCategory(category: string, lineage: unknown): boolean {
  if (!lineage || typeof lineage !== "object" || !("schemaVersion" in lineage)) return false;
  const expected = CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS[category as keyof typeof CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS];
  return Boolean(expected && lineage.schemaVersion === expected);
}

const CORE_WORDS_WITHOUT_CLEAR_DERIVATIONAL_FAMILIES = new Set(["feedback", "deadline", "agenda"]);

export function selectMonthlyCoreCandidates(input: {
  candidates: MonthlyResourcePlanTaskOutput["coreTerms"];
  existingCoreWords: ReadonlySet<string>;
  needed: number;
}): { selected: MonthlyResourcePlanTaskOutput["coreTerms"]; rejected: string[] } {
  const selected: MonthlyResourcePlanTaskOutput["coreTerms"] = [];
  const rejected: string[] = [];
  const chosen = new Set<string>();
  for (const candidate of input.candidates) {
    const word = normalizeMonthlyResourceWord(candidate.word);
    let reason = "";
    if (!isSingleHeadword(candidate.word)) reason = "must be one standalone lexical headword";
    else if (!hasSingleCoreSense(candidate.type, candidate.meaning)) reason = "must have one part of speech and one unambiguous Vietnamese meaning";
    else if (CORE_WORDS_WITHOUT_CLEAR_DERIVATIONAL_FAMILIES.has(word)) reason = "does not have a clear, common derivational word family for this resource plan";
    else if (input.existingCoreWords.has(word)) reason = "duplicates an existing core term";
    else if ([...input.existingCoreWords].some((existing) => isGenuineWordFamily(word, existing) || isGenuineWordFamily(existing, word))) reason = "overlaps a derivational family with another core headword";
    else if (chosen.has(word)) reason = "duplicates another candidate in this core batch";
    if (reason) {
      rejected.push(`${candidate.word} -> ${word} (${reason})`);
      continue;
    }
    chosen.add(word);
    selected.push(candidate);
    if (selected.length === input.needed) break;
  }
  return { selected, rejected };
}

export function hasSingleCoreSense(type: string, meaning: string): boolean {
  const normalizedType = type.trim().toLocaleLowerCase("en");
  const normalizedMeaning = meaning.trim();
  return Boolean(normalizedType)
    && !/[\/,;]/u.test(normalizedType)
    && !/[\/;]/u.test(normalizedMeaning)
    && !/\s+(?:or|hoặc)\s+/iu.test(normalizedMeaning);
}

export function buildMonthlyCoreCandidatesPrompt(input: {
  cefr: string;
  theme: string;
  communicationGoal: string;
  existingCoreWords: readonly string[];
  batchNumber: number;
  neededCount?: number;
  candidateCount?: number;
  rejectedWords?: readonly string[];
  previousIssue?: string;
  preflightRelations?: boolean;
  candidatePoolOnly?: boolean;
}): string {
  const neededCount = input.neededCount ?? 3;
  const candidateCount = input.candidateCount ?? 6;
  const categoryScope = input.candidatePoolOnly
    ? `Return exactly ${candidateCount} ordered coreTerms candidate lexemes only. expandedTerms, grammarTopics and pronunciationTargets must be empty arrays.`
    : input.preflightRelations
    ? `Return exactly ${candidateCount} ordered coreTerms candidates and only their mandatory expandedTerms preflight edges. For EVERY core candidate, return exactly three authentic supports: one umbrella, one same-sense synonym, and one common word_family item, each linked using that candidate's exact coreTerms.id. Do not return grammarTopics or pronunciationTargets.`
    : `Return exactly ${candidateCount} ordered coreTerms candidates and no other category: expandedTerms, grammarTopics and pronunciationTargets must be empty arrays.`;
  const relationPreflight = input.preflightRelations
    ? ` For every core candidate, silently verify that all three linked support edges are true for its exact meaning. Support edge IDs must be unique. Umbrella must be a genuine broader category, synonym a natural same-sense substitute, and word_family a common derivation from the same root. If a candidate cannot support all three, omit its core and all its edges, and replace it with another candidate so the requested number of cores is still returned. ${buildMonthlySupportLevelGuidance(input.cefr)}`
    : "";
  const candidatePoolRules = input.candidatePoolOnly
    ? ` This is a shared candidate lexicon, not the final core list. Include a broad, varied set of standalone A1–C1-appropriate workplace words and useful support vocabulary; terms do not need to have an umbrella or synonym relation. Include precise one-sense glosses and accurate IPA. Mix nouns, verbs, adjectives, and adverbs; include useful derived forms and category words where natural. Do not include phrases, inflections, duplicates, or invented words.`
    : "";
  const retry = input.rejectedWords?.length || input.previousIssue
    ? ` RETRY FOR CORE BATCH ${input.batchNumber}: ${input.rejectedWords?.length ? `these headwords have already failed and are forbidden, including normalized variants, synonyms, and inflections: ${input.rejectedWords.join(", ")}. ` : ""}${input.previousIssue ? `The previous candidates failed because ${input.previousIssue}. ` : ""}Return ${candidateCount} entirely different authentic standalone headwords. Preserve every base requirement, especially a clear, common derivational word-family item.`
    : "";
  return `PHASE 1 — ORDERED MONTH VOCABULARY CANDIDATES. ${categoryScope} Every candidate must be one standalone English lexical headword, never a multi-word compound phrase, slash alternative, interjection, greeting, discourse formula, or inflected variant of another selected candidate. Assign exactly one part of speech (noun, verb, adjective, or adverb) and one clear, common workplace sense; do not combine POS labels or give alternate meanings in the Vietnamese meaning field. Every candidate must have one short Vietnamese gloss for that chosen sense. Select only authentic level-appropriate English; a family form must be a distinct lexical item, not just a plural or tense form. Do not invent words or use semantic neighbors as family members. ${candidatePoolRules}${input.candidatePoolOnly ? "" : `Candidates intended for use as core words must have a common, useful derivational family (for example: manage → manager/management; help → helpful/helper; plan → planner/planning; update → updater; client → clientele). Avoid feedback and deadline as core headwords because neither has a clear, common derivational family for this plan. ${input.preflightRelations ? "Every core candidate must support a genuine umbrella category, a natural same-sense synonym, and a common derivational word-family item; verify all three for the exact meaning." : "Every core candidate must support a genuine umbrella category, a natural same-sense synonym, and a common derivational word-family item; silently identify all three for the exact meaning before returning that candidate."} Omit any proposed core whose only derivation is rare, an inflection, a compound, or changes to an unrelated sense.`} A1 uses very common concrete words; A2 uses useful routine office terms; B1+ can be more nuanced. All ${candidateCount} candidates must be appropriate to CEFR ${input.cefr}, and useful for the approved month theme (${input.theme}) and practical communication goal (${input.communicationGoal}). The application will select the first ${neededCount} unique valid headword${neededCount === 1 ? "" : "s"}. Use these already generated core and support terms as forbidden words: ${input.existingCoreWords.join("; ") || "none"}. If a candidate conflicts with a forbidden word or another candidate, replace it with a different standalone term; do not repeat the collision or a normalized variant. This is an unordered month pool; do not assign calendar days.${relationPreflight}${retry}`;
}

export function buildMonthlyCandidateRelationGraphPrompt(input: {
  cefr: string;
  theme: string;
  coreCandidates: MonthlyResourcePlanTaskOutput["coreTerms"];
  candidatePool: MonthlyResourcePlanTaskOutput["coreTerms"];
}): string {
  const coreIds = new Set(input.coreCandidates.map((term) => term.id));
  const supportPool = input.candidatePool.filter((term) => !coreIds.has(term.id));
  return `PHASE 2 — BUILD RELATION EDGES FROM THE SHARED CANDIDATE LEXICON. CEFR ${input.cefr}; approved theme ${input.theme}. coreTermBatch contains the only possible core candidates for this batch. Return coreTerms, grammarTopics, and pronunciationTargets as empty arrays. For each core candidate, select support words ONLY from the supplied candidatePool; do not invent or rewrite a word, gloss, or part of speech. Use each candidatePool item's word, meaning, and type exactly as provided. Identify up to three genuinely valid alternatives for each required relation (umbrella, synonym, word_family), each linked to the exact core ID. Also identify up to six additional genuine support relations (umbrella, synonym, word_family, collocation, antonym) for that same core, with preference for a true antonym when one exists. Do not force any relation. A support must fit the core's exact stated sense; an associated topic, example, tool, sibling, or inflection is not enough. A word-family item must be an established common derivation of the same root, not just similar spelling. Every edge must carry a unique id, relation and relatesToCoreId. Return several options per relation when multiple valid pool words exist so an independent audit can choose among them. Empty relation options are acceptable; never mislabel or pad. ${buildMonthlySupportLevelGuidance(input.cefr)} This month has a 35% repeated-support placement ceiling, so prefer distinct pool words unless reusing an exact valid relation for another core. Core candidates: ${JSON.stringify(input.coreCandidates)}. Candidate pool: ${JSON.stringify(supportPool)}.`;
}

export function selectMonthlySupportCandidates(input: {
  candidates: MonthlyResourcePlanTaskOutput["expandedTerms"];
  coreId: string;
  coreWord: string;
  coreType: string;
  coreWords: ReadonlySet<string>;
  sameCoreWords: ReadonlySet<string>;
  sameCoreRelations: ReadonlySet<MonthlyResourcePlanTaskOutput["expandedTerms"][number]["relation"]>;
  sameCoreRelationCounts?: ReadonlyMap<MonthlySupportRelation, number>;
  existingSupportWords: readonly string[];
  maxRepeatedPlacements: number;
  maxPhrasePlacements: number;
  needed: number;
  /** Month CEFR level; when given, a candidate labelled more than one level away is rejected. */
  cefr?: CefrLevel;
}): { selected: MonthlyResourcePlanTaskOutput["expandedTerms"]; rejected: string[] } {
  const selected: MonthlyResourcePlanTaskOutput["expandedTerms"] = [];
  const rejected: string[] = [];
  const chosen = new Set<string>();
  const existingCounts = new Map<string, number>();
  for (const raw of input.existingSupportWords) {
    const word = normalizeMonthlyResourceWord(raw);
    existingCounts.set(word, (existingCounts.get(word) ?? 0) + 1);
  }
  let repeatedPlacements = input.existingSupportWords.length - existingCounts.size;
  let phrasePlacements = input.existingSupportWords.filter((word) => !isSingleHeadword(word)).length;
  let sameCorePhraseCount = [...input.sameCoreWords].filter((word) => !isSingleHeadword(word)).length;
  const sameCoreRelations = new Set(input.sameCoreRelations);
  const sameCoreWords = new Set(input.sameCoreWords);
  const relationCounts = new Map<MonthlySupportRelation, number>(input.sameCoreRelationCounts ?? [...sameCoreRelations].map((relation) => [relation, 1] as const));

  const requiredRelations = MONTHLY_REQUIRED_SUPPORT_RELATIONS;
  const orderedCandidates = [
    ...requiredRelations.flatMap((relation) => sameCoreRelations.has(relation) ? [] : [input.candidates.find((candidate) => candidate.relation === relation)]),
    ...input.candidates
  ].filter((candidate): candidate is MonthlyResourcePlanTaskOutput["expandedTerms"][number] => Boolean(candidate));
  const attempted = new Set<string>();

  for (const candidate of orderedCandidates) {
    const candidateKey = `${candidate.id}\u0000${candidate.word}\u0000${candidate.relation}`;
    if (attempted.has(candidateKey)) continue;
    attempted.add(candidateKey);
    const word = normalizeMonthlyResourceWord(candidate.word);
    let reason = "";
    if (candidate.relatesToCoreId !== input.coreId) reason = "incorrect core relation";
    else if ((relationCounts.get(candidate.relation) ?? 0) >= 3) reason = "exceeds the three-support limit for this semantic relation";
    else if (input.cefr && monthlySupportLevelBand(input.cefr, candidate.cefr) === "out_of_range") reason = `CEFR ${candidate.cefr} is more than one level from ${input.cefr}`;
    else if (input.coreWords.has(word)) reason = "matches a core term";
    else if (["umbrella", "synonym", "antonym"].includes(candidate.relation) && !hasCompatiblePartOfSpeech(input.coreType, candidate.type, candidate.relation)) reason = "part of speech does not match the core sense for this relation";
    else if (candidate.relation === "word_family" && !isGenuineWordFamily(input.coreWord, candidate.word)) reason = "does not share a genuine derivational root with the core headword";
    else if (!isSingleHeadword(candidate.word) && !isWorkplacePhrase(candidate.word)) reason = "must be one lexical headword or a natural two-to-four-word workplace phrase";
    else if (!isSingleHeadword(candidate.word) && sameCorePhraseCount >= 1) reason = "allows only one phrase for this core; prefer standalone words";
    else if (sameCoreWords.has(word)) reason = "duplicates a selected support term for this core";
    else if (chosen.has(word)) reason = "duplicates another candidate in this core batch";
    else if (!isSingleHeadword(candidate.word) && phrasePlacements + 1 > input.maxPhrasePlacements) reason = "exceeds the monthly phrase ceiling; standalone words are required";
    else {
      const nextRepeatCount = repeatedPlacements + (existingCounts.has(word) ? 1 : 0);
      if (nextRepeatCount > input.maxRepeatedPlacements) reason = "exceeds the 35% monthly support-repeat limit";
      else repeatedPlacements = nextRepeatCount;
    }
    if (reason) {
      rejected.push(`${candidate.word} -> ${word} (${reason})`);
      continue;
    }
    chosen.add(word);
    selected.push(candidate);
    sameCoreWords.add(word);
    sameCoreRelations.add(candidate.relation);
    relationCounts.set(candidate.relation, (relationCounts.get(candidate.relation) ?? 0) + 1);
    if (!isSingleHeadword(candidate.word)) {
      phrasePlacements += 1;
      sameCorePhraseCount += 1;
    }
    if (selected.length === input.needed) break;
  }
  for (const relation of requiredRelations) {
    if (!sameCoreRelations.has(relation)) rejected.push(`missing required ${relation} relation for this core`);
  }
  return { selected, rejected };
}

function hasCompatiblePartOfSpeech(coreType: string, supportType: string, relation: string): boolean {
  const parse = (value: string): Set<string> => new Set(value.toLocaleLowerCase("en").split(/[\s,/|]+/u).filter(Boolean));
  const coreParts = parse(coreType);
  const supportParts = parse(supportType);
  if (relation === "umbrella") {
    // The independent relation audit checks whether the candidate is genuinely
    // broader for this exact sense. Keep this local guard about POS only; a
    // closed vocabulary list cannot cover valid categories such as booking →
    // reservation or writing → document and causes avoidable pool failures.
    if (coreParts.has("verb")) return supportParts.has("noun");
    if (coreParts.has("adjective")) return supportParts.has("noun");
    if (coreParts.has("noun")) return supportParts.has("noun");
    return false;
  }
  return [...coreParts].some((part) => supportParts.has(part));
}

export function keepSemanticallyAuditedSupportCandidates(
  candidates: readonly MonthlyResourcePlanTaskOutput["expandedTerms"][number][],
  audited: readonly MonthlyResourcePlanTaskOutput["expandedTerms"][number][]
): MonthlyResourcePlanTaskOutput["expandedTerms"] {
  const auditedKeys = new Set(audited.map((term) => [
    normalizeMonthlyResourceWord(term.word),
    normalizeMonthlyResourceWord(term.meaning),
    term.type.trim().toLocaleLowerCase("en"),
    term.relation,
    term.relatesToCoreId
  ].join("\u0000")));
  // The audit model may rewrite a generated ID even when it approves the exact
  // candidate. Match the auditable content, then retain the original candidate
  // unchanged so model-generated IDs never become curriculum identifiers.
  return candidates.filter((term) => auditedKeys.has([
    normalizeMonthlyResourceWord(term.word),
    normalizeMonthlyResourceWord(term.meaning),
    term.type.trim().toLocaleLowerCase("en"),
    term.relation,
    term.relatesToCoreId
  ].join("\u0000")));
}

export function keepExactMonthlySupportRelationCandidates(
  candidates: readonly MonthlyResourcePlanTaskOutput["expandedTerms"][number][],
  relation: MonthlyResourcePlanTaskOutput["expandedTerms"][number]["relation"],
  coreId: string
): MonthlyResourcePlanTaskOutput["expandedTerms"] {
  return candidates.filter((candidate) => candidate.relation === relation && candidate.relatesToCoreId === coreId);
}

export function buildMonthlySupportRelationAuditPrompt(input: {
  core: { word: string; meaning: string; type: string };
  candidates: readonly MonthlyResourcePlanTaskOutput["expandedTerms"][number][];
}): string {
  const core = `${input.core.word} (${input.core.meaning}; ${input.core.type})`;
  const umbrellaTest = input.core.type.toLocaleLowerCase("en").includes("verb")
    ? `Ask whether “${monthlyVerbGerund(input.core.word)} is a kind of [candidate]” is true (for example, writing is an activity). Use the core's exact stated sense; do not accept a synonym as a broader category.`
    : input.core.type.toLocaleLowerCase("en").includes("adjective")
      ? `Ask whether “Being ${input.core.word} is a kind of [candidate]” names a broader quality or property, rather than a synonym.`
      : `Ask whether “A ${input.core.word} is a kind of [candidate]” is true.`;

  return `AUDIT ONLY — DO NOT GENERATE MONTHLY RESOURCES. Evaluate the exact candidates below against the core sense ${core}. This task has no minimum count, relation quota, or requirement to fill any slot. Do not generate, repair, rename, relabel, translate, or add candidates. Keep candidates when the existing relation is accurate in a common, natural use for this exact core sense. For context-sensitive synonyms, accept a normal substitution in at least one common sentence; do not require the words to be interchangeable in every context. Reject candidates that are only related by topic, differ in core sense, or are more than one CEFR level away from the month's level. Do not reject a genuine relation only because the word is one level above or below the month's level. Check each candidate's word, stated Vietnamese meaning, part of speech, and relation together. For umbrella, ${umbrellaTest} A related topic, result, example, tool, sibling item, or frequent phrase is not a broader category. For synonym, substitute the candidate in a natural sentence using the core's stated meaning; reject it if the meaning or register changes materially in that sentence. For word_family, require an established, common derivation from the same lexical root that is useful for this core sense; shared spelling or a mechanically possible suffix is not enough. For antonym, require a genuine opposite in this sense. For collocation, require a natural co-occurrence in this sense. Keep each accepted candidate's id, word, meaning, type, relation, relatesToCoreId, and cefr (when present) exactly unchanged. Return rejected candidates nowhere. Set coreTerms, grammarTopics, and pronunciationTargets to empty arrays. Candidates: ${JSON.stringify(input.candidates)}`;
}

function monthlyVerbGerund(word: string): string {
  const normalized = word.trim().toLocaleLowerCase("en");
  if (/ie$/u.test(normalized)) return `${normalized.slice(0, -2)}ying`;
  if (/[^aeiou]e$/u.test(normalized) && !/(?:ee|ye|oe)$/u.test(normalized)) return `${normalized.slice(0, -1)}ing`;
  if (/[^aeiou][aeiou][^aeiouwxy]$/u.test(normalized)) return `${normalized}${normalized.at(-1)}ing`;
  return `${normalized}ing`;
}

export function buildMonthlySupportRelationCandidatePrompt(input: {
  cefr: string;
  core: { id: string; word: string; meaning: string; type: string };
  relation: "umbrella" | "synonym" | "word_family";
  theme: string;
  forbiddenCoreWords: readonly string[];
  existingSupportWords: readonly string[];
  sameCoreSupportWords?: readonly string[];
  rejectedCandidateWords?: readonly string[];
  previousIssue?: string;
  candidateCount?: number;
}): string {
  const candidateCount = input.candidateCount ?? 4;
  const relationGuidance = {
    umbrella: input.core.type.toLocaleLowerCase("en").includes("verb")
      ? "Return only a genuine broader noun category for the action in this exact verb sense (for example, writing is an activity). The candidate may be one noun or a natural two-to-four-word noun phrase if the phrase names the true broader category. The candidate must be broader than the verb; a synonym, topic, result, example, tool, or frequent phrase is not a hypernym. Do not return a same-level sibling action from the same workplace topic."
      : input.core.type.toLocaleLowerCase("en").includes("adjective")
        ? "Return only a genuine broader noun category for this quality (for example, carefulness is a quality). The candidate may be one noun or a natural two-to-four-word noun phrase naming a broader quality. A synonym, same-level sibling, topic, example, result, tool, or frequent phrase is not a hypernym."
        : "Return only a genuine broader class the noun belongs to (X is a kind of Y), with a compatible part of speech/sense. The candidate may be one noun or a natural two-to-four-word noun phrase when that names the broader category (for example, phone conversation for call). Choose a category above the core, not another same-level item from the same workplace topic. A meeting is a peer of a call, not its umbrella.",
    synonym: "Return only a natural substitute for the exact stated sense, preserving part of speech, meaning, and register. Related words that merely share a topic are not synonyms.",
    word_family: "Return only an established, common derivational form from the same lexical root. Exclude inflections, plurals, tense forms, and semantic neighbors."
  }[input.relation];
  const forbiddenRelations = ["umbrella", "synonym", "antonym", "word_family", "collocation"].filter((relation) => relation !== input.relation);
  const forbiddenList = forbiddenRelations.length > 1
    ? `${forbiddenRelations.slice(0, -1).join(", ")}, or ${forbiddenRelations.at(-1)}`
    : forbiddenRelations[0];
  return `PHASE 2 — SINGLE RELATION CANDIDATES. This phase's count and exact-relation rules override any general prompt that requests a different candidate count or mixed relations; do not return 12 unless this phase explicitly requests 12. For exact core ${input.core.word} (${input.core.meaning}; ${input.core.type}), generate up to ${candidateCount} distinct candidates for relation exactly \`${input.relation}\` only. Aim for at least six genuinely plausible candidates when that many exist; this is a candidate batch, not a final pool, and an independent audit will filter it. Do not stop at one merely because the distinction requires thought, but never invent options to reach six. This is for CEFR ${input.cefr} and approved month theme ${input.theme}. ${buildMonthlySupportLevelGuidance(input.cefr)} ${relationGuidance} Label every returned expandedTerms item with relation \`${input.relation}\` and relatesToCoreId \`${input.core.id}\`. Do not produce ${forbiddenList} entries or any coreTerms, grammarTopics, or pronunciationTargets. If no genuine candidate exists, return an empty expandedTerms array; never invent, relabel, or pad. Never return any finalized core headword or its normalized variant: ${input.forbiddenCoreWords.join("; ") || "none"}. Do not duplicate a support term already attached to this same core: ${input.sameCoreSupportWords?.join("; ") || "none"}. Other ${input.relation} candidates already generated and rejected for this core: ${input.rejectedCandidateWords?.join("; ") || "none"}; return different candidates and normalized variants on this retry. Previous attempt feedback: ${input.previousIssue || "none"}. Before inventing new candidates, check whether any other-core support listed below is a genuine fit; reuse it for this core when the exact relation holds. The system allows up to a 35% monthly repeat ceiling, so do not reject a valid match merely because it was already used elsewhere. Other-core support words: ${input.existingSupportWords.join("; ") || "none"}. Return only authentic lexical items within the allowed CEFR band and accurate Vietnamese meanings.`;
}

export function buildMonthlyOptionalSupportPrompt(input: {
  cefr: string;
  core: { id: string; word: string; meaning: string; type: string };
  theme: string;
  requestedCount: number;
  forbiddenCoreWords: readonly string[];
  existingSupportWords: readonly string[];
  sameCoreSupportWords?: readonly string[];
  rejectedCandidateWords?: readonly string[];
  previousIssue?: string;
  candidateCount?: number;
}): string {
  const candidateCount = input.candidateCount ?? 12;
  return `PHASE 2 — REMAINING SUPPORT CANDIDATE BATCH FOR ONE CORE. For exact core ${input.core.word} (${input.core.meaning}; ${input.core.type}), CEFR ${input.cefr}, approved month theme ${input.theme}, generate up to ${candidateCount} distinct authentic expandedTerms candidates so the application can select up to ${input.requestedCount} additional valid supports. The separately audited umbrella, synonym, and word_family supports already exist; do not duplicate any support already attached to this same core. These additional items are optional enrichment: the three required relations already meet the per-core minimum, so return only genuine extra relations, and the per-core total must never exceed ${MONTHLY_MAX_SUPPORTS_PER_CORE}. ${buildMonthlySupportLevelGuidance(input.cefr)} Use any true relation that fits this exact sense, including additional umbrella, synonym, word_family, collocation, or antonym. Offer varied candidates across valid relations rather than repeating one relation; no relation may exceed three supports for this core. Prefer genuine antonyms when they exist, but antonyms are optional and must never be invented or forced. If fewer than ${input.requestedCount} authentic candidates exist, return only the valid ones; never pad or mislabel. Every relatesToCoreId must be ${input.core.id}. Return only candidate expandedTerms and empty arrays for coreTerms, grammarTopics, and pronunciationTargets. Do not repeat any core headword or normalized variant: ${input.forbiddenCoreWords.join("; ") || "none"}. Same-core supports already used: ${input.sameCoreSupportWords?.join("; ") || "none"}. Do not return previously rejected candidates: ${input.rejectedCandidateWords?.join("; ") || "none"}. Previous validation feedback: ${input.previousIssue || "none"}. Other-core terms may be reused when they are a genuine fit; the system enforces a 35% monthly repeat ceiling and will reject over-limit repeats. Other-core support terms available for valid reuse: ${input.existingSupportWords.join("; ") || "none"}.`;
}

export function selectMonthlyPronunciationCandidates(input: {
  candidates: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"];
  forbiddenWords: ReadonlySet<string>;
  needed: number;
  targetIpa?: string;
}): { selected: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"]; rejected: string[] } {
  const selected: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"] = [];
  const rejected: string[] = [];
  const chosen = new Set<string>();
  for (const candidate of input.candidates) {
    const word = normalizeMonthlyResourceWord(candidate.word);
    const syllables = countApproximateSyllables(candidate.word);
    const reason = syllables > 3
      ? `has ${syllables} syllables`
      : input.forbiddenWords.has(word) || chosen.has(word)
        ? "duplicates a pronunciation example already used"
        : input.targetIpa && !doesMonthlyPronunciationExampleMatch(input.targetIpa, candidate.ipa)
          ? `IPA ${candidate.ipa} does not illustrate target ${input.targetIpa}`
          : "";
    if (reason) {
      rejected.push(`${candidate.word} -> ${word} (${reason})`);
      continue;
    }
    chosen.add(word);
    selected.push(candidate);
    if (selected.length === input.needed) break;
  }
  return { selected, rejected };
}

export function doesMonthlyPronunciationExampleMatch(targetIpa: string, exampleIpa: string): boolean {
  const stripDelimiters = (value: string) => value.trim().replace(/^[/\[]/u, "").replace(/[/\]]$/u, "").replace(/͡/gu, "");
  const target = stripDelimiters(targetIpa);
  const example = stripDelimiters(exampleIpa);
  if (target.includes("X")) {
    const stressMarks = target.match(/[ˈˌ]/gu) ?? [];
    return stressMarks.every((mark) => example.includes(mark));
  }
  return Boolean(target && example.includes(target));
}

export function buildMonthlyPronunciationDistinctnessConstraint(
  previousTargets: readonly Pick<MonthlyResourcePlanTaskOutput["pronunciationTargets"][number], "ipa" | "label" | "explanation">[],
  retryIssue = ""
): string {
  const exclusions = previousTargets.map((target) => `${target.ipa} (${target.label}; ${target.explanation})`);
  const banned = exclusions.length
    ? `HARD BANS: this target must not return ${previousTargets.map((target) => target.ipa).join(", ")}. These targets are already accepted and cannot be reused or paraphrased: ${exclusions.join("; ")}. Choose a different phoneme or stress pattern, with a clearly different sound category; avoid near-neighbor contrasts of a sound already selected.`
    : "This is the first roadmap target; choose a genuine target that can coexist with three other distinct pronunciation targets.";
  const hasStressOnlyTarget = previousTargets.some((target) => target.ipa.trim() === "/ˈ/" || target.ipa.trim() === "/ˌ/");
  const categoryConstraint = hasStressOnlyTarget
    ? "A stress-only marker target has already been accepted. This target must be a real consonant or vowel phoneme, not another stress pattern; do not return /ˈ/, /ˌ/ or any other stress-only marker."
    : "Use a real consonant or vowel phoneme unless a stress target is materially different from every accepted target.";
  const retry = retryIssue
    ? `The previous response was rejected: ${retryIssue}. Treat that IPA and target description as forbidden too. Return a different valid IPA target; do not repeat the rejected target category.`
    : "";
  return `${banned} ${categoryConstraint} ${retry}`.trim();
}

export function getMonthlyPronunciationTargetIssue(
  candidate: Pick<MonthlyResourcePlanTaskOutput["pronunciationTargets"][number], "ipa">,
  previousTargets: readonly Pick<MonthlyResourcePlanTaskOutput["pronunciationTargets"][number], "ipa">[]
): string | undefined {
  const normalized = candidate.ipa.trim().toLocaleLowerCase("en");
  const stressOnly = normalized === "/ˈ/" || normalized === "/ˌ/";
  if (previousTargets.some((target) => target.ipa.trim().toLocaleLowerCase("en") === normalized)) {
    return `target IPA ${candidate.ipa} duplicates an earlier pronunciation target`;
  }
  if (stressOnly && previousTargets.some((target) => {
    const prior = target.ipa.trim().toLocaleLowerCase("en");
    return prior === "/ˈ/" || prior === "/ˌ/";
  })) {
    return `target IPA ${candidate.ipa} is a second stress-only target; only one stress-pattern target is allowed across P1–P4`;
  }
  return undefined;
}

export function buildMonthlyPronunciationSchemaRepairIssue(issues: readonly Record<string, unknown>[]): string {
  const details = issues.flatMap((issue) => {
    const path = typeof issue.path === "string" ? issue.path : "output";
    const message = typeof issue.message === "string" ? issue.message : "does not match the structured schema";
    return [`${path}: ${message}`];
  });
  return `Structured output repair required. Previous response schema issues: ${details.join("; ") || "the response did not match the required shape"}. Return a complete corrected result. pronunciationTargets must be an array containing exactly one target object for this phase, not a string. Include at least 18 ordered example candidates; keep coreTerms, expandedTerms and grammarTopics empty. The target ipa must be one valid slash-delimited IPA form with no prose or multiple transcriptions.`;
}

export function getMonthlyGrammarPhaseIssues(result: MonthlyResourcePlanTaskOutput): string[] {
  const issues: string[] = [];
  if (result.coreTerms.length) issues.push(`coreTerms must be empty (received ${result.coreTerms.length})`);
  if (result.expandedTerms.length) issues.push(`expandedTerms must be empty (received ${result.expandedTerms.length})`);
  if (result.grammarTopics.length !== 2) issues.push(`grammarTopics must contain exactly 2 items (received ${result.grammarTopics.length})`);
  if (result.pronunciationTargets.length) issues.push(`pronunciationTargets must be empty (received ${result.pronunciationTargets.length})`);
  for (const [topicIndex, topic] of result.grammarTopics.entries()) {
    if (topic.steps.length !== 3) issues.push(`grammarTopics[${topicIndex}] must contain exactly 3 progressive steps (received ${topic.steps.length})`);
    if (new Set(topic.steps.map((step) => step.id)).size !== topic.steps.length) issues.push(`grammarTopics[${topicIndex}] repeats a step ID`);
    if (new Set(topic.steps.map((step) => step.focus.trim().toLocaleLowerCase("en").replace(/[\s\p{P}]+/gu, " ").trim())).size !== topic.steps.length) {
      issues.push(`grammarTopics[${topicIndex}] must have distinct step focus values`);
    }
  }
  return issues;
}

export function buildMonthlyGrammarPhasePrompt(rejectedIssues: readonly string[] = []): string {
  const repair = rejectedIssues.length
    ? ` Previous response rejected: ${rejectedIssues.join("; ")}. Correct each listed issue in this response.`
    : "";
  return `PHASE 3 — GRAMMAR ONLY. Return exactly two grammarTopics; coreTerms, expandedTerms and pronunciationTargets must be empty arrays. Each grammar topic must have exactly three ordered progressive steps that build in complexity; use a distinct focus and teaching point at each step, with precise formula, concise Vietnamese usage, and three to six authentic workplace examples. Topic A steps are the progression for N1–N2, N3–N4, N5–N6. Topic B steps are the progression for N7–N8, N9–N10, N11–N12. N13–N16 combine the third step of both topics. Return JSON matching the schema only; do not include explanations or any other resource category.${repair}`;
}

export async function runMonthlyGrammarPhaseWithRetry(
  generate: (prompt: string) => Promise<MonthlyResourcePlanTaskOutput>
): Promise<MonthlyResourcePlanTaskOutput> {
  let issues: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await generate(buildMonthlyGrammarPhasePrompt(issues));
    issues = getMonthlyGrammarPhaseIssues(result);
    if (!issues.length) return result;
  }
  throw new MonthlyResourcePlanError([`Grammar phase failed after 3 attempts: ${issues.join("; ")}.`]);
}

function normalizeMonthlyResourceWord(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[\s\p{P}]+/gu, " ").trim();
}

const WORD_FAMILY_BASE_OVERRIDES: Readonly<Record<string, readonly string[]>> = {
  client: ["clientele"],
  clientele: ["client"],
  ideal: ["idea"],
  wallpaper: ["wall"]
};

const DERIVATIONAL_SUFFIX_RULES: ReadonlyArray<{ suffix: string; replacements: readonly string[] }> = [
  { suffix: "ibilities", replacements: ["ible"] },
  { suffix: "ibility", replacements: ["ible"] },
  { suffix: "abilities", replacements: ["able"] },
  { suffix: "ability", replacements: ["able"] },
  { suffix: "fulness", replacements: ["ful"] },
  { suffix: "iness", replacements: ["y"] },
  { suffix: "ily", replacements: ["y"] },
  { suffix: "ier", replacements: ["y"] },
  { suffix: "iest", replacements: ["y"] },
  { suffix: "ution", replacements: ["ve", "ute"] },
  { suffix: "ication", replacements: ["y"] },
  { suffix: "ation", replacements: ["", "e", "ate"] },
  { suffix: "ition", replacements: ["", "e", "ite"] },
  { suffix: "sion", replacements: ["de", "se", "d", "s", ""] },
  { suffix: "tion", replacements: ["", "e", "te"] },
  { suffix: "ature", replacements: [""] },
  { suffix: "atic", replacements: [""] },
  { suffix: "ery", replacements: ["er"] },
  { suffix: "ness", replacements: [""] },
  { suffix: "ment", replacements: ["", "e"] },
  { suffix: "able", replacements: ["", "e"] },
  { suffix: "ible", replacements: ["", "e"] },
  { suffix: "less", replacements: [""] },
  { suffix: "ful", replacements: [""] },
  { suffix: "ive", replacements: ["", "e"] },
  { suffix: "ity", replacements: ["", "e"] },
  { suffix: "ship", replacements: [""] },
  { suffix: "ance", replacements: ["", "e"] },
  { suffix: "ence", replacements: ["", "e"] },
  { suffix: "er", replacements: ["", "e"] },
  { suffix: "or", replacements: ["", "e"] },
  { suffix: "ly", replacements: ["", "e"] },
  { suffix: "ing", replacements: ["", "e"] },
  { suffix: "al", replacements: ["", "e"] },
  { suffix: "lysis", replacements: ["lyze", "lyse"] },
  { suffix: "ysis", replacements: ["yze"] }
];

const DERIVATIONAL_PREFIXES = ["un", "in", "im", "ir", "il", "dis", "non", "re", "mis", "over", "under", "pre", "post", "de"] as const;

function wordFamilyBaseForms(value: string): Set<string> {
  const initial = normalizeMonthlyResourceWord(value).replace(/[-'’]/gu, "");
  const forms = new Set<string>([initial, ...(WORD_FAMILY_BASE_OVERRIDES[initial] ?? [])]);
  const queue = [...forms];
  while (queue.length) {
    const form = queue.shift()!;
    const candidates = new Set<string>();
    for (const { suffix, replacements } of DERIVATIONAL_SUFFIX_RULES) {
      if (!form.endsWith(suffix) || form.length - suffix.length < 3) continue;
      const stem = form.slice(0, -suffix.length);
      for (const replacement of replacements) candidates.add(`${stem}${replacement}`);
      if (/(.)\1$/u.test(stem)) candidates.add(stem.slice(0, -1));
    }
    for (const prefix of DERIVATIONAL_PREFIXES) {
      if (form.startsWith(prefix) && form.length - prefix.length >= 3) candidates.add(form.slice(prefix.length));
    }
    for (const candidate of candidates) {
      if (candidate.length < 3 || forms.has(candidate)) continue;
      forms.add(candidate);
      for (const override of WORD_FAMILY_BASE_OVERRIDES[candidate] ?? []) {
        if (!forms.has(override)) { forms.add(override); queue.push(override); }
      }
      queue.push(candidate);
    }
  }
  return forms;
}

/** Rejects semantic neighbors, plurals and same-word repeats mislabeled as a word family. */
export function isGenuineWordFamily(coreWord: string, relatedWord: string): boolean {
  if (!isSingleHeadword(coreWord) || !isSingleHeadword(relatedWord)) return false;
  const core = normalizeMonthlyResourceWord(coreWord).replace(/[-'’]/gu, "");
  const related = normalizeMonthlyResourceWord(relatedWord).replace(/[-'’]/gu, "");
  if (!core || !related || core === related) return false;
  const relatedForms = wordFamilyBaseForms(related);
  return [...wordFamilyBaseForms(core)].some((form) => form.length >= 3 && relatedForms.has(form));
}

export function isSingleHeadword(value: string): boolean {
  return /^\p{L}+(?:[-'’]\p{L}+)*$/u.test(value.trim());
}

function isWorkplacePhrase(value: string): boolean {
  const words = value.trim().split(/\s+/u);
  return words.length >= 2 && words.length <= 4 && words.every((word) => /^\p{L}+(?:[-'’]\p{L}+)*$/u.test(word));
}

function countApproximateSyllables(word: string): number {
  return Math.max(1, (word.toLocaleLowerCase("en").match(/[aeiouy]+/gu) ?? []).length);
}

/**
 * Converts one validated AI plan into the fixed monthly source used by every
 * later daily lesson. No emergency corpus is used: an unavailable AI provider
 * must leave the framework ungenerated for the operator to retry.
 */
export function buildMonthlyResourcesFromAiPlan(
  month: string,
  cefr: CefrLevel,
  theme: SharedMonthBrief,
  criteria: MonthlyResourceCriteria,
  plan: MonthlyResourcePlanTaskOutput
): MonthlyResourcePoolContract {
  const calendar = buildMonthlyCalendar(month);
  const newLessonDays = calendar.effectiveDays.flatMap((_date, index) => monthlyDayKind(index + 1, calendar) === "new" ? [index + 1] : []);
  const requiredVocabularyCount = newLessonDays.length * 3;
  const minimumExpandedVocabularyCount = newLessonDays.length * 3 * MONTHLY_MIN_SUPPORTS_PER_CORE;
  const maximumExpandedVocabularyCount = newLessonDays.length * 3 * MONTHLY_MAX_SUPPORTS_PER_CORE;
  if (criteria.vocabularyCount !== requiredVocabularyCount) throw new MonthlyResourceCriteriaError("VOCABULARY_COUNT_MISMATCH", requiredVocabularyCount);
  if (criteria.expandedVocabularyCount < minimumExpandedVocabularyCount || criteria.expandedVocabularyCount > maximumExpandedVocabularyCount) throw new MonthlyResourceCriteriaError("EXPANDED_VOCABULARY_COUNT_MISMATCH", maximumExpandedVocabularyCount);

  const shapeErrors = validateMonthlyResourcePlanShape(plan, newLessonDays.length, cefr);
  if (plan.expandedTerms.length > criteria.expandedVocabularyCount) shapeErrors.push(`Expanded resources exceed the requested maximum of ${criteria.expandedVocabularyCount}.`);
  if (criteria.grammarTopicCount !== 2) shapeErrors.push("Monthly resources always require exactly two grammar topics.");
  if (criteria.pronunciationSoundCount !== 4) shapeErrors.push("Monthly resources always require exactly four pronunciation targets.");
  if (shapeErrors.length) throw new MonthlyResourcePlanError(shapeErrors);

  const coreIdMap = new Map(plan.coreTerms.map((term, index) => [term.id, `${cefr.toLowerCase()}-core-${index + 1}`]));
  const coreTerms = [...plan.coreTerms]
    .map(({ id, word, meaning, type, ipa }, index) => ({ id: coreIdMap.get(id) ?? `${cefr.toLowerCase()}-core-${index + 1}`, word, meaning, type, ipa, source: "core_registry" as const, component: "core" as const }));
  const supportTerms = [...plan.expandedTerms]
    .map((term, index) => ({
      id: `${cefr.toLowerCase()}-expanded-${index + 1}`,
      word: term.word,
      meaning: term.meaning,
      type: term.type,
      relation: term.relation,
      source: relationSource(term.relation),
      component: "expanded" as const,
      relatedCoreTermId: coreIdMap.get(term.relatesToCoreId) ?? term.relatesToCoreId,
      ...(term.cefr ? { cefr: term.cefr } : {})
    }));
  const grammarTopics = plan.grammarTopics.map((topic, index) => ({
    id: `${cefr.toLowerCase()}-grammar-${index + 1}`,
    title: topic.title,
    steps: topic.steps.map((step, stepIndex) => ({
      id: `${cefr.toLowerCase()}-grammar-${index + 1}-step-${stepIndex + 1}`,
      focus: step.focus,
      formula: step.formula,
      usage: step.usage,
      examples: step.examples
    }))
  }));
  const sounds = plan.pronunciationTargets.map((target, targetIndex) => ({
    id: `${cefr.toLowerCase()}-sound-${targetIndex + 1}`,
    ipa: target.ipa,
    label: target.label,
    examples: target.words.map((word, index) => ({ id: `${cefr.toLowerCase()}-sound-${targetIndex + 1}-word-${index + 1}`, word: word.word, ipa: word.ipa }))
  }));
  return { month, cefr, theme, coreTerms, supportTerms, grammarTopics, sounds, version: theme.version };
}

export class MonthlyResourcePlanError extends Error {
  constructor(readonly errors: readonly string[]) {
    super("MONTHLY_RESOURCE_PLAN_INVALID");
  }
}

export class MonthlyResourceCriteriaError extends Error {
  constructor(
    readonly code: "VOCABULARY_COUNT_MISMATCH" | "EXPANDED_VOCABULARY_COUNT_MISMATCH",
    readonly requiredVocabularyCount: number
  ) {
    super(code);
  }
}

function relationSource(relation: MonthlyResourcePlanTaskOutput["expandedTerms"][number]["relation"]): "example" | "family" | "synonym" | "antonym" | "group" {
  if (relation === "word_family") return "family";
  if (relation === "collocation") return "example";
  if (relation === "umbrella") return "group";
  return relation;
}

