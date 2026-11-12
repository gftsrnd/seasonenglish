import { MONTHLY_RELATION_DEFINITION_MAX_WORDS, monthlyRelationMeaningIssue, allowedMonthlySupportLevels, describeRequiredSupportRelations, isMonthlyCoreLevelAllowed, isMonthlySupportLevelAllowed, maxMonthlyWordFamilyLevel, buildMonthlyCalendar, monthlyCorePartOfSpeech, monthlyDayKind, monthlySupportLevelBand, MONTHLY_MAX_SUPPORTS_PER_CORE, MONTHLY_MIN_SUPPORTS_PER_CORE, monthlyIpaExampleMatchesTarget, monthlyPronunciationPairSide, optionalStructuralSupportRelationsFor, type MonthlyPronunciationCatalogItem, requiredSupportRelationsFor, monthlyGrammarCoverageIssues, monthlyGrammarTopicTitle, MONTHLY_GRAMMAR_PAIR_TYPE_LABELS, type MonthlyGrammarCatalogPair, type MonthlyResourcePoolContract, type MonthlySupportRelation, type SharedMonthBrief } from "@e4s/domain";
import type { CefrLevel } from "@e4s/contracts";
import { monthlyResourcePlanOutputSchema, type MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { validateMonthlyResourcePlanShape } from "./monthly-resource-plan-spec.js";
import { MONTHLY_BRITISH_IPA_RULE } from "./monthly-british-ipa.js";
import { buildMonthlyCoreCefrGuidance, buildMonthlyOtherLevelCoreExclusionText, buildMonthlyPronunciationExampleRules, getMonthlyCoreLevelIssue, getMonthlyPronunciationCatalogExampleIssue, getMonthlyPronunciationExampleQualityIssue } from "./monthly-resource-quality-gates.js";

/**
 * VH-R33: umbrella/synonym/antonym (and every other support) may come from the
 * month's CEFR level or one adjacent level. Prompts ask the model to label each
 * support with its own level so the band is recorded on the stored term.
 */
export function buildMonthlySupportLevelGuidance(cefr: string): string {
  const allowed = isCefrLevel(cefr) ? allowedMonthlySupportLevels(cefr) : [];
  const band = allowed.length ? allowed.join(", ") : `${cefr} or one adjacent CEFR level`;
  const familyMax = isCefrLevel(cefr) ? maxMonthlyWordFamilyLevel(cefr) : "two levels above the month's level";
  return `Support words may be at CEFR ${band} (the month's level ${cefr} or one adjacent level). Word-family items are the only exception: they may be any level at or below ${cefr} and at most two levels above it (up to ${familyMax}), and must still be a common, frequently used derivation a learner actually meets at work. Set each expandedTerms item's cefr field to that support word's own CEFR level. Do not reject or omit a genuine relation only because the word is one level above or below ${cefr}; never use any other support two or more levels away, never use a word-family item above ${familyMax}, and never force a relation that does not genuinely exist. ${buildMonthlyRelationMeaningGuidance(cefr)}`;
}

/**
 * What a synonym/antonym support must say about its meaning (12/11): learners
 * see it next to the word on the vocabulary card. A1–A2 read the Vietnamese
 * meaning; B1–C1 read a short English definition and no Vietnamese.
 */
export function buildMonthlyRelationMeaningGuidance(cefr: string): string {
  if (cefr === "A1" || cefr === "A2") return "Every synonym and antonym item's meaning is its own short Vietnamese meaning (learners at this level read it next to the word); do not return a definition field.";
  return `Every synonym and antonym item also carries definition: a short simple-English definition of that support word in this sense (2-${MONTHLY_RELATION_DEFINITION_MAX_WORDS} words, vocabulary easier than CEFR ${cefr}, no Vietnamese, never using the word itself), e.g. assist: "help someone do something"; reject: "say no to something". Learners at this level read it next to the word; the Vietnamese meaning field stays for staff. Other relations take no definition.`;
}

/** Core level rule shared by the core candidate prompts. */
function buildMonthlyCoreLevelGuidance(cefr: string): string {
  // Root cause of B2/C1 cores at A1–B1 (11/11): "at CEFR X or below" let the
  // model fill B2/C1 with basic words. B1+ now states the target band, a level
  // descriptor and too-easy examples, mirrored by getMonthlyCoreLevelIssue.
  return buildMonthlyCoreCefrGuidance(cefr);
}

/**
 * WordNet-style umbrella meaning by the core's part of speech. Shared by the
 * core preflight, relation generation and audit prompts.
 */
export const MONTHLY_UMBRELLA_RULES = {
  noun: "For a noun core the umbrella is its hypernym: “A <core> is a kind of <umbrella>” must be true (email -> message, invoice -> document); a two-to-three-word group noun phrase is fine (office equipment).",
  verb: "For a verb core the umbrella is a more general VERB that the core is a way of doing (troponymy): “To <core> is a way to <umbrella>” must be true (email -> send, whisper -> speak, cancel -> stop, review -> check).",
  adjective: "For an adjective or adverb core the umbrella is the attribute NOUN the word describes: “<core> describes <umbrella>” must be true (small -> size, easy -> difficulty, happy -> mood, late -> time).",
  generic: "Never use a generic placeholder as an umbrella (thing, stuff, item, object, something, matter, action, activity, process, situation, status, quality, or work/job/do for a verb, adjective or adverb)."
} as const;

/** The umbrella rule for one core part of speech, plus the generic-placeholder ban. */
export function monthlyUmbrellaRuleFor(coreType: string): string {
  const pos = monthlyCorePartOfSpeech(coreType);
  const rule = pos === "verb" ? MONTHLY_UMBRELLA_RULES.verb
    : pos === "adjective" || pos === "adverb" ? MONTHLY_UMBRELLA_RULES.adjective
      : pos === "noun" ? MONTHLY_UMBRELLA_RULES.noun
        : `${MONTHLY_UMBRELLA_RULES.noun} ${MONTHLY_UMBRELLA_RULES.verb} ${MONTHLY_UMBRELLA_RULES.adjective}`;
  return `${rule} ${MONTHLY_UMBRELLA_RULES.generic}`;
}

/** Required-relation rule by part of speech, shared by the core preflight prompts. */
const MONTHLY_RELATIONS_BY_POS_RULE = "Required relations depend on the core's part of speech: a noun needs an umbrella and a same-sense synonym (a common word_family item is optional and taken only when one exists); a verb, adjective or adverb needs a same-sense synonym and a common word_family item (an umbrella is optional and taken only when a genuine one exists). Every core still needs at least three supports in total.";

/**
 * Deterministic deny-list for umbrella supports: generic placeholders that never
 * name a real category. `work`, `job`, `do` and the generic attribute nouns are
 * only denied for verb/adjective/adverb cores, where they are placeholders
 * (“to email is a way to work”); a noun core can genuinely be a kind of work.
 */
const MONTHLY_GENERIC_UMBRELLAS: ReadonlySet<string> = new Set([
  "thing", "things", "stuff", "something", "item", "items", "object", "objects", "matter", "matters",
  "action", "actions", "activity", "activities", "process", "processes", "situation", "situations", "status", "quality", "qualities"
]);
const MONTHLY_GENERIC_NON_NOUN_UMBRELLAS: ReadonlySet<string> = new Set(["work", "job", "do", "act", "attribute", "characteristic", "property", "feature"]);

/** Deterministic umbrella screen: not a generic placeholder and the part of speech fits the core (verb -> verb; noun/adjective/adverb -> noun). */
export function isMonthlyUmbrellaShapeAllowed(coreType: string, umbrella: { word: string; type: string }): boolean {
  return !isGenericMonthlyUmbrella(coreType, umbrella.word) && hasCompatiblePartOfSpeech(coreType, umbrella.type, "umbrella");
}

/** True when `umbrellaWord` is a generic placeholder rather than a genuine umbrella for a core of `coreType`. */
export function isGenericMonthlyUmbrella(coreType: string, umbrellaWord: string): boolean {
  const word = normalizeMonthlyResourceWord(umbrellaWord);
  if (MONTHLY_GENERIC_UMBRELLAS.has(word)) return true;
  return monthlyCorePartOfSpeech(coreType) !== "noun" && MONTHLY_GENERIC_NON_NOUN_UMBRELLAS.has(word);
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
/** v18: pronunciation targets are the roadmap catalog items chosen with 12-month memory (11/11); older pronunciation checkpoints are regenerated. */
const CURRENT_MONTHLY_PRONUNCIATION_SCHEMA_VERSION = "monthly-resource-pronunciation-v18-roadmap-catalog";
export const CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS = {
  coreTerms: "monthly-resource-category-v19-core-relation-preflight",
  /** v33 (12/11): B1–C1 synonym/antonym supports carry an English definition; older support checkpoints are regenerated. */
  expandedTerms: "monthly-resource-category-v33-relation-meanings",
  /** v3: the two topics are the roadmap pair chosen with 12-month memory (docs/grammar-roadmap.md); older grammar checkpoints are regenerated. */
  grammarTopics: "monthly-resource-grammar-v3-roadmap-pair",
  pronunciationTargets: CURRENT_MONTHLY_PRONUNCIATION_SCHEMA_VERSION
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
  /** Month level: a candidate whose own cefr label is above it is rejected (an absent label is allowed). */
  cefr?: CefrLevel;
  /** Core words of the month's other levels that this level must not reuse (word -> level); see buildMonthlyCrossLevelCoreExclusions. */
  otherLevelCoreWords?: ReadonlyMap<string, CefrLevel>;
}): { selected: MonthlyResourcePlanTaskOutput["coreTerms"]; rejected: string[] } {
  const selected: MonthlyResourcePlanTaskOutput["coreTerms"] = [];
  const rejected: string[] = [];
  const chosen = new Set<string>();
  for (const candidate of input.candidates) {
    const word = normalizeMonthlyResourceWord(candidate.word);
    let reason = "";
    if (!isSingleHeadword(candidate.word)) reason = "must be one standalone lexical headword";
    else if (!hasSingleCoreSense(candidate.type, candidate.meaning)) reason = "must have one part of speech and one unambiguous Vietnamese meaning";
    else if (input.cefr && !isMonthlyCoreLevelAllowed(input.cefr, candidate.cefr)) reason = `CEFR ${candidate.cefr} is above the month level ${input.cefr}`;
    else if (input.cefr && (reason = getMonthlyCoreLevelIssue(candidate, input.cefr, input.otherLevelCoreWords) ?? "")) { /* reason set: non-word, below the level band, too easy, or another level's core */ }
    // Only a part of speech that requires a word family (verb, adjective, adverb) is screened here; a noun core may have none.
    else if (CORE_WORDS_WITHOUT_CLEAR_DERIVATIONAL_FAMILIES.has(word) && requiredSupportRelationsFor(candidate.type).includes("word_family")) reason = "does not have a clear, common derivational word family for this resource plan";
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
  /** Month-wide generation: ask for this many options (2-3) per required relation instead of one edge each. */
  relationOptionsPerRequired?: number;
  /** Month-wide generation: the sub-area of the theme this parallel call covers. */
  subArea?: string;
  /** Other levels' core words of the same month, given to the model as an exclusion list. */
  otherLevelCoreWords?: ReadonlyMap<string, CefrLevel>;
}): string {
  const neededCount = input.neededCount ?? 3;
  const relationOptions = input.relationOptionsPerRequired ? Math.max(2, Math.min(3, Math.round(input.relationOptionsPerRequired))) : 0;
  const candidateCount = input.candidateCount ?? 6;
  const categoryScope = input.candidatePoolOnly
    ? `Return exactly ${candidateCount} ordered coreTerms candidate lexemes only. expandedTerms, grammarTopics and pronunciationTargets must be empty arrays.`
    : input.preflightRelations && relationOptions
    ? `Return exactly ${candidateCount} ordered coreTerms candidates and only their mandatory expandedTerms preflight edges. For EVERY core candidate, return ${relationOptions === 2 ? "two" : "two to three"} distinct authentic options for EACH required relation of its part of speech, each linked using that candidate's exact coreTerms.id: for a noun, umbrella options and same-sense synonym options (plus common word_family options when a common derivation exists); for a verb, adjective or adverb, same-sense synonym options and common word_family options (plus umbrella options when a genuine umbrella exists). An independent audit picks among the options, so offer genuine alternatives rather than one guess; when only one genuine option exists for a relation, return just that one and never pad. Do not return collocation or antonym edges, grammarTopics or pronunciationTargets.`
    : input.preflightRelations
    ? `Return exactly ${candidateCount} ordered coreTerms candidates and only their mandatory expandedTerms preflight edges. For EVERY core candidate, return three authentic supports covering the relations its part of speech requires, each linked using that candidate's exact coreTerms.id: for a noun, one umbrella, one same-sense synonym, and one common word_family item when one exists (otherwise a second umbrella or synonym); for a verb, adjective or adverb, one same-sense synonym, one common word_family item, and one genuine umbrella when one exists (otherwise a second synonym or word_family item). Do not return grammarTopics or pronunciationTargets.`
    : `Return exactly ${candidateCount} ordered coreTerms candidates and no other category: expandedTerms, grammarTopics and pronunciationTargets must be empty arrays.`;
  const relationPreflight = input.preflightRelations
    ? ` For every core candidate, silently verify that every linked support edge is true for its exact meaning. Support edge IDs must be unique. ${MONTHLY_RELATIONS_BY_POS_RULE} ${MONTHLY_UMBRELLA_RULES.noun} ${MONTHLY_UMBRELLA_RULES.verb} ${MONTHLY_UMBRELLA_RULES.adjective} ${MONTHLY_UMBRELLA_RULES.generic} An umbrella is never a narrower kind of the core (computer -> laptop), a synonym (leader -> boss), a related thing or event (attend -> meeting, pay -> salary), or an adjective or modifier (designer -> graphic). Synonym must be a natural same-sense substitute, and word_family a common, frequently used derivation from the same root, never a rare agent or abstract noun (texter, checker, wrongness), never the comparative or superlative of an adjective (smaller, easier), and never the plain -ing, -s or -ed form of a verb (sending, sends, sent) unless the -ing form is an established noun (meeting, planning, training). If a candidate cannot support the relations its part of speech requires, omit its core and all its edges, and replace it with another candidate so the requested number of cores is still returned. ${buildMonthlySupportLevelGuidance(input.cefr)}`
    : "";
  const candidatePoolRules = input.candidatePoolOnly
    ? ` This is a shared candidate lexicon, not the final core list. Include a broad, varied set of standalone A1–C1-appropriate workplace words and useful support vocabulary; terms do not need to have an umbrella or synonym relation. Include precise one-sense glosses and accurate IPA. Mix nouns, verbs, adjectives, and adverbs; include useful derived forms and category words where natural. Do not include phrases, inflections, duplicates, or invented words.`
    : "";
  const subArea = input.subArea
    ? ` MONTH-WIDE PARALLEL REQUEST: other parallel requests cover the other parts of this theme, so draw every candidate from this sub-area only: ${input.subArea}. Never return two candidates that are synonyms of each other (for example start and begin, or finish and complete); keep only one of such a pair.`
    : "";
  const retry = input.rejectedWords?.length || input.previousIssue
    ? ` RETRY FOR CORE BATCH ${input.batchNumber}: ${input.rejectedWords?.length ? `these headwords have already failed and are forbidden, including normalized variants, synonyms, and inflections: ${input.rejectedWords.join(", ")}. ` : ""}${input.previousIssue ? `The previous candidates failed because ${input.previousIssue}. ` : ""}Return ${candidateCount} entirely different authentic standalone headwords. Preserve every base requirement, especially the relations each part of speech requires (a genuine umbrella for a noun; a clear, common derivational word-family item for a verb, adjective or adverb).`
    : "";
  return `PHASE 1 — ORDERED MONTH VOCABULARY CANDIDATES. ${categoryScope} Every candidate must be one standalone English lexical headword, never a multi-word compound phrase, slash alternative, interjection, greeting, discourse formula, or inflected variant of another selected candidate. Assign exactly one part of speech (noun, verb, adjective, or adverb) and one clear, common workplace sense; do not combine POS labels or give alternate meanings in the Vietnamese meaning field. Every candidate must have one short Vietnamese gloss for that chosen sense. Select only authentic level-appropriate English; a family form must be a distinct lexical item, not just a plural or tense form. Do not invent words or use semantic neighbors as family members. ${candidatePoolRules}${input.candidatePoolOnly ? "" : `Verb, adjective and adverb candidates intended for use as core words must have a common, useful derivational family (for example: manage → manager/management; help → helpful; decide → decision; pay → payment; careful → carefully). Noun candidates must have a genuine umbrella (hypernym) and take a word-family item only when a common one exists (plan → planner/planning). ${input.preflightRelations ? "Every core candidate must support the relations its part of speech requires: a noun a genuine umbrella category and a natural same-sense synonym; a verb, adjective or adverb a natural same-sense synonym and a common derivational word-family item; verify them for the exact meaning." : "Every core candidate must support the relations its part of speech requires: a noun a genuine umbrella category and a natural same-sense synonym; a verb, adjective or adverb a natural same-sense synonym and a common derivational word-family item; silently identify them for the exact meaning before returning that candidate."} ${input.preflightRelations ? "" : `${monthlyUmbrellaRuleFor("")} `}Omit any verb, adjective or adverb candidate whose only derivation is rare, an inflection, a compound, or changes to an unrelated sense. ${buildMonthlyCoreLevelGuidance(input.cefr)}`} A1 uses very common concrete words; A2 uses useful routine office terms; B1, B2 and C1 must follow the TARGET LEVEL rule above, each clearly harder than the level below it. All ${candidateCount} candidates must be appropriate to CEFR ${input.cefr}, and directly useful for the approved month theme (${input.theme}) and practical communication goal (${input.communicationGoal}); never return a word that is off-theme or only loosely tied to it. The application will select the first ${neededCount} unique valid headword${neededCount === 1 ? "" : "s"}. Use these already generated core and support terms as forbidden words: ${input.existingCoreWords.join("; ") || "none"}. If a candidate conflicts with a forbidden word or another candidate, replace it with a different standalone term; do not repeat the collision or a normalized variant. This is an unordered month pool; do not assign calendar days.${buildMonthlyOtherLevelCoreExclusionText(input.otherLevelCoreWords)}${relationPreflight}${subArea}${retry} ${MONTHLY_BRITISH_IPA_RULE}`;
}

export function buildMonthlyCandidateRelationGraphPrompt(input: {
  cefr: string;
  theme: string;
  coreCandidates: MonthlyResourcePlanTaskOutput["coreTerms"];
  candidatePool: MonthlyResourcePlanTaskOutput["coreTerms"];
}): string {
  const coreIds = new Set(input.coreCandidates.map((term) => term.id));
  const supportPool = input.candidatePool.filter((term) => !coreIds.has(term.id));
  return `PHASE 2 — BUILD RELATION EDGES FROM THE SHARED CANDIDATE LEXICON. CEFR ${input.cefr}; approved theme ${input.theme}. coreTermBatch contains the only possible core candidates for this batch. Return coreTerms, grammarTopics, and pronunciationTargets as empty arrays. For each core candidate, select support words ONLY from the supplied candidatePool; do not invent or rewrite a word, gloss, or part of speech. Use each candidatePool item's word, meaning, and type exactly as provided. Identify up to three genuinely valid alternatives for each required relation of the core's part of speech, each linked to the exact core ID. ${MONTHLY_RELATIONS_BY_POS_RULE} ${monthlyUmbrellaRuleFor("")} Also identify up to six additional genuine support relations (umbrella, synonym, word_family, collocation, antonym) for that same core, with preference for a true antonym when one exists. Do not force any relation. A support must fit the core's exact stated sense; an associated topic, example, tool, sibling, or inflection is not enough. A word-family item must be an established common derivation of the same root, not just similar spelling. Every edge must carry a unique id, relation and relatesToCoreId. Return several options per relation when multiple valid pool words exist so an independent audit can choose among them. Empty relation options are acceptable; never mislabel or pad. ${buildMonthlySupportLevelGuidance(input.cefr)} This month has a 35% repeated-support placement ceiling, so prefer distinct pool words unless reusing an exact valid relation for another core. Core candidates: ${JSON.stringify(input.coreCandidates)}. Candidate pool: ${JSON.stringify(supportPool)}.`;
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
  /** Month CEFR level; when given, a candidate labelled more than one level away (word family: more than two levels above) is rejected. */
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

  // Required relations depend on the core's part of speech; the optional
  // structural relation (noun: word family; verb/adjective/adverb: umbrella) is
  // tried next so a genuine one is taken when it exists.
  const requiredRelations = requiredSupportRelationsFor(input.coreType);
  const preferredRelations = [...requiredRelations, ...optionalStructuralSupportRelationsFor(input.coreType)];
  const orderedCandidates = [
    ...preferredRelations.flatMap((relation) => sameCoreRelations.has(relation) ? [] : [input.candidates.find((candidate) => candidate.relation === relation)]),
    ...input.candidates
  ].filter((candidate): candidate is MonthlyResourcePlanTaskOutput["expandedTerms"][number] => Boolean(candidate));
  const attempted = new Set<string>();

  for (const candidate of orderedCandidates) {
    const candidateKey = `${candidate.id}\u0000${candidate.word}\u0000${candidate.relation}`;
    if (attempted.has(candidateKey)) continue;
    attempted.add(candidateKey);
    const word = normalizeMonthlyResourceWord(candidate.word);
    let reason = "";
    let familyIssue: string | undefined;
    if (candidate.relatesToCoreId !== input.coreId) reason = "incorrect core relation";
    else if ((relationCounts.get(candidate.relation) ?? 0) >= 3) reason = "exceeds the three-support limit for this semantic relation";
    else if (candidate.relation === "umbrella" && isGenericMonthlyUmbrella(input.coreType, candidate.word)) reason = "is a generic placeholder, not a genuine umbrella for this core";
    else if ((reason = monthlySupportQualityIssue({ word: input.coreWord, type: input.coreType, ...(input.cefr ? { cefr: input.cefr } : {}) }, candidate, existingCounts.get(word) ?? 0) ?? "")) { /* reason set */ }
    else if (input.cefr && !isMonthlySupportLevelAllowed(input.cefr, candidate)) reason = candidate.relation === "word_family"
      ? `CEFR ${candidate.cefr} is above ${maxMonthlyWordFamilyLevel(input.cefr)}, the highest word-family level for ${input.cefr}`
      : `CEFR ${candidate.cefr} is more than one level from ${input.cefr}`;
    else if (input.cefr && (reason = monthlyRelationMeaningIssue(input.cefr, candidate) ?? "")) { /* reason set: synonym/antonym meaning for the level */ }
    else if (input.coreWords.has(word)) reason = "matches a core term";
    else if (["umbrella", "synonym", "antonym"].includes(candidate.relation) && !hasCompatiblePartOfSpeech(input.coreType, candidate.type, candidate.relation)) reason = "part of speech does not match the core sense for this relation";
    else if (candidate.relation === "word_family" && !isGenuineWordFamily(input.coreWord, candidate.word)) reason = "does not share a genuine derivational root with the core headword";
    else if (candidate.relation === "collocation" && !collocationContainsCoreWord(input.coreWord, candidate.word)) reason = "a collocation must be a phrase containing the core word or one of its word-family forms";
    else if (candidate.relation === "word_family" && (familyIssue = monthlyWordFamilyInflectionIssue({ word: input.coreWord, type: input.coreType }, candidate))) reason = familyIssue;
    else if ((candidate.relation !== "word_family" && isMonthlyInflectionalVariant(candidate.word, input.coreWord))
      || [...sameCoreWords, ...chosen].some((other) => isMonthlyInflectionalVariant(candidate.word, other))) reason = "is only an inflected form (plural, -s, -ed or -ing) of the core or another support for this core";
    else if (!isSingleHeadword(candidate.word) && !isWorkplacePhrase(candidate.word)) reason = "must be one lexical headword or a natural two-to-four-word workplace phrase";
    else if (!isSingleHeadword(candidate.word) && candidate.relation !== "umbrella" && sameCorePhraseCount >= 1) reason = "allows only one phrase for this core; prefer standalone words";
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
      if (candidate.relation !== "umbrella") sameCorePhraseCount += 1;
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
    // WordNet-style umbrella POS: a verb's umbrella is a more general verb
    // (email -> send); an adjective's or adverb's is the attribute noun it
    // describes (small -> size); a noun's is a broader noun. The independent
    // relation audit checks whether the candidate is genuinely broader for this
    // exact sense; this local guard is about POS only. A core with a mixed
    // label (noun/verb) accepts either compatible umbrella.
    const allowed = new Set<string>();
    if (coreParts.has("verb")) allowed.add("verb");
    if (coreParts.has("adjective") || coreParts.has("adverb") || coreParts.has("noun")) allowed.add("noun");
    return [...allowed].some((part) => supportParts.has(part));
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
  const pos = monthlyCorePartOfSpeech(input.core.type);
  const word = input.core.word.trim();
  const umbrellaTest = pos === "verb"
    ? `apply the verb test (WordNet troponymy): ask whether “To ${word} is a way to [candidate]” is true, where the candidate is a more general VERB (email -> send, whisper -> speak, cancel -> stop, review -> check). Reject a noun category (activity, communication), a synonym or same-level substitute, a narrower verb, or a sibling action from the same topic. Use the core's exact stated sense.`
    : pos === "adjective" || pos === "adverb"
      ? `apply the attribute test: ask whether “${word} describes [candidate]” is true, where the candidate is the attribute NOUN the word describes (small -> size, easy -> difficulty, happy -> mood, late -> time). Reject an adjective or adverb, a synonym, an opposite, or a generic attribute word (quality, property, attribute, characteristic, status).`
      : pos === "noun"
        ? `apply the hypernym test: ask whether “A ${word} is a kind of [candidate]” is true (email -> message, invoice -> document); a two-to-three-word group noun phrase is fine (office equipment).`
        : `apply the test for the core's part of speech. ${MONTHLY_UMBRELLA_RULES.noun} ${MONTHLY_UMBRELLA_RULES.verb} ${MONTHLY_UMBRELLA_RULES.adjective}`;
  const nounGroupWords = pos === "verb" || pos === "adjective" || pos === "adverb"
    ? ""
    : " Also accept a common group or category word that the core belongs to in everyday workplace use (the umbrella word of a word group, e.g. office -> workplace, email -> communication, invoice -> document, meeting -> event, Monday -> day), even when the strict 'kind of' sentence sounds loose.";

  return `AUDIT ONLY — DO NOT GENERATE MONTHLY RESOURCES. Evaluate the exact candidates below against the core sense ${core}. This task has no minimum count, relation quota, or requirement to fill any slot. Do not generate, repair, rename, relabel, translate, or add candidates. Keep candidates when the existing relation is accurate in a common, natural use for this exact core sense. For context-sensitive synonyms, accept a normal substitution in at least one common sentence; do not require the words to be interchangeable in every context. Reject candidates that are only related by topic, differ in core sense, or are more than one CEFR level away from the month's level (a word_family item may be up to two levels above it). Do not reject a genuine relation only because the word is one level above or below the month's level. Check each candidate's word, stated Vietnamese meaning, part of speech, and relation together. For umbrella, ${umbrellaTest}${nounGroupWords} ${MONTHLY_UMBRELLA_RULES.generic} The umbrella must be BROADER than the core: the core is one member of it. Reject a candidate that is NARROWER than the core, i.e. a kind of the core (computer -> laptop is wrong: a laptop is a kind of computer); a synonym or near-synonym (leader -> boss); a related thing, person, result or event rather than a category the core belongs to (attend -> meeting, pay -> salary: a meeting is what you attend and a salary is what you are paid, not categories of attending or paying); an adjective or modifier (designer -> graphic); a peer at the same level (a meeting is not the umbrella of a call); a related topic, example, tool, or frequent phrase. For synonym, substitute the candidate in a natural sentence using the core's stated meaning; reject it if the meaning or register changes materially in that sentence. ${MONTHLY_SYNONYM_RULE} For word_family, require an established, COMMON, frequently used derivation from the same lexical root that a learner would actually meet at work and that is useful for this core sense (manage -> manager, pay -> payment, decide -> decision); shared spelling or a mechanically possible suffix is not enough. Reject rare or awkward agent nouns, abstract nouns and adverbs even when they are dictionary words (for example texter, repairer, repairable, checker, payer, keeper, installer, wrongness, busyness, vagueness, problematically, keeping). Also reject the comparative or superlative of an adjective core (smaller, easier, newest) and the plain -ing, -s or -ed form of a verb core (sending, sends, sent); an -ing noun is kept only when it is an established noun for that verb (meeting, planning, training, building). For antonym, require a genuine opposite in this sense. For collocation, require a phrase that naturally co-occurs WITH the core word itself and contains the core word or one of its word-family forms (for example decide → make a decision, meet → attend a meeting); reject a word that is only topically related (review → feedback, meet → agenda). For a synonym or antonym that carries a definition, also reject it when the definition does not describe the candidate in this sense. Keep each accepted candidate's id, word, meaning, type, relation, relatesToCoreId, cefr and definition (when present) exactly unchanged. Return rejected candidates nowhere. Set coreTerms, grammarTopics, and pronunciationTargets to empty arrays. Candidates: ${JSON.stringify(input.candidates)}`;
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
  const pos = monthlyCorePartOfSpeech(input.core.type);
  const commonUmbrellaBans = "Never return a narrower kind of the core (computer -> laptop), a synonym (leader -> boss), a related thing, person or event rather than a category the core belongs to (attend -> meeting, pay -> salary), or an adjective or modifier (designer -> graphic).";
  const optionalNote = requiredSupportRelationsFor(input.core.type).includes(input.relation)
    ? ""
    : ` The ${input.relation} relation is optional for a ${pos ?? "core of this part of speech"}: return an empty expandedTerms array when no genuine candidate exists.`;
  const relationGuidance = {
    umbrella: pos === "verb"
      ? `Return only a more general VERB that this verb is a way of doing (WordNet troponymy): “To ${input.core.word} is a way to [candidate]” must be true for the exact stated sense (for example email -> send, whisper -> speak, cancel -> stop, review -> check). Label every candidate's type as verb. Never return a noun category (activity, communication, written communication), a synonym or same-level substitute, a narrower verb, or a same-level sibling action from the same workplace topic. ${MONTHLY_UMBRELLA_RULES.generic} ${commonUmbrellaBans}`
      : pos === "adjective" || pos === "adverb"
        ? `Return only the attribute NOUN this word describes: “${input.core.word} describes [candidate]” must be true for the exact stated sense (for example small -> size, easy -> difficulty, happy -> mood, late -> time). Label every candidate's type as noun. Never return an adjective or adverb, a synonym, an opposite, a same-level sibling, or a generic attribute word such as quality, property, attribute, characteristic or status. ${MONTHLY_UMBRELLA_RULES.generic} ${commonUmbrellaBans}`
        : `Return only a genuine broader class the noun belongs to (WordNet hypernym: “A ${input.core.word} is a kind of [candidate]”, for example email -> message, invoice -> document), with a compatible part of speech/sense. The candidate may be one noun or a natural two-to-four-word noun phrase when that names the broader category (for example, phone conversation for call). When no single common word names a clear group, prefer a two-to-three-word noun phrase that names the group (office equipment, written communication, quality control, work document) over a vague single word such as action, activity or thing. Choose a category above the core, not another same-level item from the same workplace topic. A meeting is a peer of a call, not its umbrella. A common group word the noun belongs to in workplace use is also acceptable (office -> workplace, invoice -> document). ${MONTHLY_UMBRELLA_RULES.generic} ${commonUmbrellaBans}`,
    synonym: `Return only a natural substitute for the exact stated sense, preserving part of speech, meaning, and register. Related words that merely share a topic are not synonyms. ${MONTHLY_SYNONYM_RULE}`,
    word_family: "Return only an established, COMMON, frequently used derivational form from the same lexical root that a learner would actually meet at work (for example manage -> manager, pay -> payment, decide -> decision, help -> helpful). Exclude inflections, plurals, tense forms, and semantic neighbors: never the comparative or superlative of an adjective (smaller, easier, newest), and never the plain -ing, -s or -ed form of a verb (sending, sends, sent); an -ing noun counts only when it is an established noun for that verb (meeting, planning, training, building). Never return a rare or awkward agent noun, abstract noun or adverb just because the suffix is possible (for example texter, repairer, checker, payer, keeper, wrongness, busyness, vagueness, problematically, keeping); return fewer candidates instead."
  }[input.relation] + optionalNote;
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
  const optional = optionalStructuralSupportRelationsFor(input.core.type);
  const preferOptional = optional.length
    ? ` First check for a genuine ${optional.join(" or ")} support, which is optional for this part of speech but should be taken when one exists${optional.includes("word_family") ? " (a common derivation such as plan -> planner or employ -> employee)" : ""}; never force one.`
    : "";
  return `PHASE 2 — REMAINING SUPPORT CANDIDATE BATCH FOR ONE CORE. For exact core ${input.core.word} (${input.core.meaning}; ${input.core.type}), CEFR ${input.cefr}, approved month theme ${input.theme}, generate up to ${candidateCount} distinct authentic expandedTerms candidates so the application can select up to ${input.requestedCount} additional valid supports. The separately audited ${describeRequiredSupportRelations(input.core.type)} supports required for this part of speech already exist; do not duplicate any support already attached to this same core. These additional items are optional enrichment beyond the required relations: return only genuine extra relations; the core needs at least ${MONTHLY_MIN_SUPPORTS_PER_CORE} supports in total, and the per-core total must never exceed ${MONTHLY_MAX_SUPPORTS_PER_CORE}. ${buildMonthlySupportLevelGuidance(input.cefr)}${preferOptional} Use any true relation that fits this exact sense, including additional umbrella, synonym, word_family, collocation, or antonym. Any umbrella must follow this rule: ${monthlyUmbrellaRuleFor(input.core.type)} A word_family item is never the comparative or superlative of an adjective or the plain -ing, -s or -ed form of a verb (meeting, planning and training are established -ing nouns and are fine). A collocation must be a two-to-four-word phrase that naturally co-occurs WITH the core word and contains the core word or one of its word-family forms (decide → make a decision); a topically related word such as feedback for review or agenda for meet is not a collocation. Never return a plural, -s, -ed or -ing form of the core or of another support as a separate support. Offer varied candidates across valid relations rather than repeating one relation; no relation may exceed three supports for this core. Prefer genuine antonyms when they exist, but antonyms are optional and must never be invented or forced. If fewer than ${input.requestedCount} authentic candidates exist, return only the valid ones; never pad or mislabel. Every relatesToCoreId must be ${input.core.id}. Return only candidate expandedTerms and empty arrays for coreTerms, grammarTopics, and pronunciationTargets. Do not repeat any core headword or normalized variant: ${input.forbiddenCoreWords.join("; ") || "none"}. Same-core supports already used: ${input.sameCoreSupportWords?.join("; ") || "none"}. Do not return previously rejected candidates: ${input.rejectedCandidateWords?.join("; ") || "none"}. Previous validation feedback: ${input.previousIssue || "none"}. Other-core terms may be reused when they are a genuine fit; the system enforces a 35% monthly repeat ceiling and will reject over-limit repeats. Other-core support terms available for valid reuse: ${input.existingSupportWords.join("; ") || "none"}.`;
}

export function selectMonthlyPronunciationCandidates(input: {
  candidates: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"];
  forbiddenWords: ReadonlySet<string>;
  needed: number;
  targetIpa?: string;
  /** Target label; a stress target's label ("first syllable", "two-syllable") is checked against each example. */
  targetLabel?: string;
  /** The month's core words with their IPA, so a homograph with a different stress (present) is rejected. */
  coreTerms?: ReadonlyArray<{ word: string; ipa: string }>;
  /** Roadmap catalog item: examples are checked by item type (phoneme, pair, phenomenon) instead of `targetIpa`. */
  catalogItem?: MonthlyPronunciationCatalogItem;
  /** Pair items: examples already accepted for this target, so both sides stay represented. */
  acceptedForTarget?: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"];
  /** Total examples the target needs (pair balance); defaults to `needed`. */
  totalForTarget?: number;
}): { selected: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"]; rejected: string[] } {
  if (input.catalogItem) return selectMonthlyCatalogPronunciationCandidates({ ...input, catalogItem: input.catalogItem });
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
        : input.targetIpa && !doesMonthlyPronunciationExampleMatch(input.targetIpa, candidate.ipa, candidate.word)
          ? `IPA ${candidate.ipa} does not illustrate target ${input.targetIpa}`
          : input.targetIpa
            ? getMonthlyPronunciationExampleQualityIssue({ targetIpa: input.targetIpa, targetLabel: input.targetLabel, word: candidate.word, ipa: candidate.ipa, coreTerms: input.coreTerms }) ?? ""
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

/** Single-word examples of phonemes, pairs and word-stress items keep the three-syllable limit; phrase phenomena do not. */
function catalogItemSyllableLimit(item: MonthlyPronunciationCatalogItem, word: string): number | undefined {
  if (item.type !== "phenomenon") return 3;
  return item.wordStress && isSingleHeadword(word) ? 3 : undefined;
}

function selectMonthlyCatalogPronunciationCandidates(input: {
  candidates: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"];
  forbiddenWords: ReadonlySet<string>;
  needed: number;
  coreTerms?: ReadonlyArray<{ word: string; ipa: string }>;
  catalogItem: MonthlyPronunciationCatalogItem;
  acceptedForTarget?: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"];
  totalForTarget?: number;
}): { selected: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"]; rejected: string[] } {
  const item = input.catalogItem;
  const selected: MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"] = [];
  const rejected: string[] = [];
  const chosen = new Set<string>();
  // Pair review: at least three examples of each side, so one side may fill at most total - 3.
  const total = input.totalForTarget ?? input.needed;
  const sideLimit = item.type === "pair" ? Math.max(1, total - 3) : Infinity;
  const sideCounts = new Map<number, number>();
  for (const accepted of input.acceptedForTarget ?? []) {
    const side = item.type === "pair" ? monthlyPronunciationPairSide(item, accepted)?.side : undefined;
    if (side !== undefined) sideCounts.set(side, (sideCounts.get(side) ?? 0) + 1);
  }
  for (const candidate of input.candidates) {
    const word = normalizeMonthlyResourceWord(candidate.word);
    const limit = catalogItemSyllableLimit(item, candidate.word);
    const syllables = countApproximateSyllables(candidate.word);
    let reason = limit !== undefined && syllables > limit
      ? `has ${syllables} syllables`
      : input.forbiddenWords.has(word) || chosen.has(word)
        ? "duplicates a pronunciation example already used"
        : getMonthlyPronunciationCatalogExampleIssue(item, candidate, input.coreTerms) ?? "";
    let side: number | undefined;
    if (!reason && item.type === "pair") {
      side = monthlyPronunciationPairSide(item, candidate)?.side;
      if (side !== undefined && (sideCounts.get(side) ?? 0) >= sideLimit) reason = `this side of the pair already has ${sideLimit} examples; give examples of the other side`;
    }
    if (reason) {
      rejected.push(`${candidate.word} -> ${word} (${reason})`);
      continue;
    }
    if (side !== undefined) sideCounts.set(side, (sideCounts.get(side) ?? 0) + 1);
    chosen.add(word);
    selected.push(candidate);
    if (selected.length === input.needed) break;
  }
  return { selected, rejected };
}

export const MONTHLY_PRONUNCIATION_EXPLANATION_MAX_WORDS = 50;
export const MONTHLY_PRONUNCIATION_EXPLANATION_MAX_CHARS = 300;
const MONTHLY_PRONUNCIATION_LABEL_MAX_CHARS = 100;

/** Label/explanation gate (roadmap: explanation at most 50 words; Vietnamese at A1–A2, simple English at B1–C1). */
export function getMonthlyPronunciationTextIssues(cefr: CefrLevel, target: { label: string; explanation: string }): string[] {
  const issues: string[] = [];
  const explanation = target.explanation.trim();
  const words = explanation.split(/\s+/u).filter(Boolean).length;
  if (explanation.length > MONTHLY_PRONUNCIATION_EXPLANATION_MAX_CHARS || words > MONTHLY_PRONUNCIATION_EXPLANATION_MAX_WORDS) {
    issues.push(`explanation is ${explanation.length} characters / ${words} words; shorten it to at most ${MONTHLY_PRONUNCIATION_EXPLANATION_MAX_WORDS} words and ${MONTHLY_PRONUNCIATION_EXPLANATION_MAX_CHARS} characters`);
  }
  if (target.label.trim().length > MONTHLY_PRONUNCIATION_LABEL_MAX_CHARS) issues.push(`label is ${target.label.trim().length} characters; keep it under ${MONTHLY_PRONUNCIATION_LABEL_MAX_CHARS}`);
  const english = monthlyDailyObjectivesMustBeEnglish(cefr);
  if (english && (isVietnameseMonthlyText(explanation) || isVietnameseMonthlyText(target.label))) issues.push(`label and explanation must be in simple English for ${cefr}, not Vietnamese`);
  if (!english && !isVietnameseMonthlyText(explanation)) issues.push(`explanation must be in Vietnamese for ${cefr}`);
  return issues;
}

/**
 * Phase 4 prompt for ONE roadmap item chosen by the application. The item is
 * fixed; the AI writes its label, explanation and example candidates.
 */
export function buildMonthlyCatalogPronunciationPrompt(input: {
  cefr: CefrLevel;
  slot: string;
  item: MonthlyPronunciationCatalogItem;
  monthItems: readonly MonthlyPronunciationCatalogItem[];
  catalog: readonly MonthlyPronunciationCatalogItem[];
  taughtIds: readonly string[];
  neededExamples: number;
  usedWords: readonly string[];
  acceptedWords: readonly string[];
  coreWords: readonly string[];
  vocabulary: string;
  exampleRejections?: readonly string[];
  textIssues?: readonly string[];
  schemaIssue?: string;
}): string {
  const vi = !monthlyDailyObjectivesMustBeEnglish(input.cefr);
  const { item } = input;
  const label = vi ? item.labelVi : item.labelEn;
  const kind = item.type === "phoneme" ? "a single phoneme of the British English 44-sound inventory"
    : item.type === "pair" ? "a confusable-pair review"
      : "a pronunciation phenomenon (not an isolated phoneme)";
  const taught = input.catalog.filter((entry) => input.taughtIds.includes(entry.id)).map((entry) => `${entry.notation} ${entry.labelEn}`);
  const catalogLine = input.catalog.map((entry) => `${entry.order}. ${entry.notation} ${entry.labelEn}`).join("; ");
  const textLanguage = vi ? "Vietnamese" : "simple English (no Vietnamese words)";
  const exampleRules = item.type === "phenomenon" ? "" : ` ${buildMonthlyPronunciationExampleRules()}`;
  const phraseKinds = new Set(["phrase", "ed_link", "contraction_s"]);
  const phraseForm = item.form && (phraseKinds.has(item.form.kind) || (item.form.kind === "stress" && item.form.pattern === "multi_compound"));
  const phraseRule = phraseForm
    ? ` IMPORTANT FOR THIS ITEM: every example is a whole phrase or short sentence, not a single word. Put the ENTIRE phrase or sentence in the example's word field (as in the examples of the form above) and the IPA of the whole phrase in its ipa field. Each phrase must be natural, grammatical English a colleague would really say; never build a phrase by slotting the target word into a fixed frame. An example whose word field holds only one word (such as "${item.form?.kind === "phrase" && item.form.functionWords ? item.form.functionWords[0] : "check"}") is rejected.`
    : "";
  const repair = [
    input.exampleRejections?.length ? `EXAMPLE REPAIR: keep the same item; the application rejected these examples: ${input.exampleRejections.join("; ")}. Return new, different examples that follow the example form exactly; never repeat a rejected example.` : "",
    input.textIssues?.length ? `TEXT REPAIR: ${input.textIssues.join("; ")}.` : "",
    input.schemaIssue ?? ""
  ].filter(Boolean).join(" ");
  return `PHASE 4 — ONE ROADMAP PRONUNCIATION ITEM ONLY. This phase prompt overrides any general pronunciation guidance (choosing targets, a three-syllable limit for every example, Vietnamese labels at every level). The application has ALREADY CHOSEN the item for roadmap slot ${input.slot} from the product roadmap of level ${input.cefr}; do not choose, change or rename the item. Item: id ${item.id}; notation ${item.notation}; type ${kind}; roadmap group ${item.group}; meaning "${item.labelEn}" (Vietnamese: "${item.labelVi}"). This month's four items in order: ${input.monthItems.map((entry) => `${entry.notation} ${entry.labelEn}`).join(" → ")}. Level catalog in roadmap order (context only): ${catalogLine}. Already taught to this level in the previous 12 months (never teach them again here): ${taught.join("; ") || "none"}. Return exactly one pronunciationTargets object and leave coreTerms, expandedTerms and grammarTopics empty. Set ipa to exactly "${item.notation}". Write label in ${textLanguage}, at most 80 characters, naming this item (for example "${label}"). Write explanation in ${textLanguage}: at most ${MONTHLY_PRONUNCIATION_EXPLANATION_MAX_WORDS} words and at most ${MONTHLY_PRONUNCIATION_EXPLANATION_MAX_CHARS} characters (the application rejects longer text), giving the mouth shape or the rule and one common mistake of Vietnamese learners. Return at least ${Math.max(18, input.neededExamples * 2)} ordered candidate examples so the application can select ${input.neededExamples}; learners meet them three at a time (recognise, distinguish, use in a sentence). EXAMPLE FORM for this item (the application checks every example and rejects any that break it): ${item.exampleGuidance}${phraseRule} Each example's ipa is its real standard British pronunciation in slashes. Prefer this month's core words when they genuinely show the item (core words: ${input.coreWords.join(", ") || "none"}); otherwise use familiar ${input.cefr}-level workplace words. Monthly vocabulary pool (use a word only when it genuinely shows the item): ${input.vocabulary}. Never reuse examples of earlier items of this month: ${input.usedWords.join("; ") || "none"}. Already accepted for this item (do not repeat): ${input.acceptedWords.join("; ") || "none"}.${exampleRules} Use neutral workplace content; never invent cultural, historical or identity-based framing.${repair ? ` ${repair}` : ""}`;
}

export function doesMonthlyPronunciationExampleMatch(targetIpa: string, exampleIpa: string, word?: string): boolean {
  // Whole-phoneme comparison (shared with manual edit and approval): no legacy
  // "X" placeholder, no diphthong/affricate/onset-cluster false positives (WP9).
  return monthlyIpaExampleMatchesTarget(targetIpa, exampleIpa, word);
}

export function buildMonthlyPronunciationDistinctnessConstraint(
  previousTargets: readonly Pick<MonthlyResourcePlanTaskOutput["pronunciationTargets"][number], "ipa" | "label" | "explanation">[],
  retryIssue = "",
  advanced = false
): string {
  const exclusions = previousTargets.map((target) => `${target.ipa} (${target.label}; ${target.explanation})`);
  const banned = exclusions.length
    ? `HARD BANS: this target must not return ${previousTargets.map((target) => target.ipa).join(", ")}. These targets are already accepted and cannot be reused or paraphrased: ${exclusions.join("; ")}. Choose a different phoneme or stress pattern, with a clearly different sound category; avoid near-neighbor contrasts of a sound already selected.`
    : "This is the first roadmap target; choose a genuine target that can coexist with three other distinct pronunciation targets.";
  const hasStressOnlyTarget = previousTargets.some((target) => target.ipa.trim() === "/ˈ/" || target.ipa.trim() === "/ˌ/");
  const categoryConstraint = advanced
    ? hasStressOnlyTarget
      ? "A stress-only marker target has already been accepted. Choose a different advanced phenomenon, such as a final consonant cluster /st/, /nd/ or /kt/; do not return /ˈ/, /ˌ/ or any isolated phoneme."
      : "Choose an advanced phenomenon with a transcribable pattern, such as a final consonant cluster /st/ or a stress marker /ˈ/. Do not use an isolated phoneme."
    : hasStressOnlyTarget
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

// Letters only Vietnamese uses (tone marks on top of ă/â/ê/ô/ơ/ư, đ, and the
// dot-below/hook-above tones); á/à/é/í/ó/ú alone also occur in English loanwords.
const VIETNAMESE_ONLY_LETTER = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹ]/iu;

/** True when a learner-facing objective written for B1–C1 contains Vietnamese (WP9). */
export function isVietnameseMonthlyText(value: string): boolean {
  return VIETNAMESE_ONLY_LETTER.test(value);
}

/** dailyObjectives are Vietnamese for A1/A2 and simple English from B1. */
export function monthlyDailyObjectivesMustBeEnglish(cefr: string | undefined): boolean {
  return cefr === "B1" || cefr === "B2" || cefr === "C1";
}

export function getMonthlyGrammarPhaseIssues(result: MonthlyResourcePlanTaskOutput, cefr?: string, pair?: MonthlyGrammarCatalogPair): string[] {
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
    const objectives = topic.steps.flatMap(step => step.dailyObjectives ?? []);
    if (objectives.length !== 6 || objectives.some(value => value.trim().length < 10)) issues.push(`grammarTopics[${topicIndex}] needs two explicit dailyObjectives per step (six in total)`);
    if (new Set(objectives.map(value => value.toLocaleLowerCase("en").replace(/[\s\p{P}]+/gu, " ").trim())).size !== objectives.length) issues.push(`grammarTopics[${topicIndex}] repeats a daily teaching objective`);
    const vietnamese = monthlyDailyObjectivesMustBeEnglish(cefr) ? objectives.filter(isVietnameseMonthlyText) : [];
    if (vietnamese.length) issues.push(`grammarTopics[${topicIndex}] dailyObjectives must be in simple English for ${cefr}, not Vietnamese (e.g. "${vietnamese[0]!.trim().slice(0, 80)}")`);
  }
  if (pair && result.grammarTopics.length === 2) issues.push(...monthlyGrammarRoadmapPairIssues(result, pair));
  return issues;
}

/** Roadmap pair gates: locked titles in A, B order and coverage of every "Nội dung" item. */
export function monthlyGrammarRoadmapPairIssues(result: MonthlyResourcePlanTaskOutput, pair: MonthlyGrammarCatalogPair): string[] {
  const issues: string[] = [];
  const sides = [pair.topicA, pair.topicB] as const;
  for (const [index, side] of sides.entries()) {
    const expected = monthlyGrammarTopicTitle(pair.cefr, side);
    if (result.grammarTopics[index]?.title.trim() !== expected) issues.push(`grammarTopics[${index}] must be the locked roadmap topic ${side.side} "${expected}"`);
  }
  issues.push(...monthlyGrammarCoverageIssues(pair.cefr, result.grammarTopics.map((topic, index) => ({ ...topic, id: `grammarTopics[${index}]`, catalogId: sides[index]?.id }))));
  return issues;
}

/** Sets the two locked roadmap titles (A, B) on a grammar phase result. */
export function withMonthlyGrammarRoadmapTitles(result: MonthlyResourcePlanTaskOutput, pair: MonthlyGrammarCatalogPair): MonthlyResourcePlanTaskOutput {
  const sides = [pair.topicA, pair.topicB];
  return { ...result, grammarTopics: result.grammarTopics.map((topic, index) => sides[index] ? { ...topic, title: monthlyGrammarTopicTitle(pair.cefr, sides[index]!) } : topic) };
}

export function buildMonthlyGrammarPhasePrompt(rejectedIssues: readonly string[] = [], cefr?: string, pair?: MonthlyGrammarCatalogPair): string {
  if (pair) return buildMonthlyGrammarRoadmapPrompt(pair, rejectedIssues);
  const repair = rejectedIssues.length
    ? ` Previous response rejected: ${rejectedIssues.join("; ")}. Correct each listed issue in this response.`
    : "";
  const objectiveLanguage = cefr ? ` For this ${cefr} plan, write dailyObjectives in ${monthlyDailyObjectivesMustBeEnglish(cefr) ? "simple English with no Vietnamese words" : "Vietnamese"}.` : "";
  return `PHASE 3 — GRAMMAR ONLY. Return exactly two grammarTopics; coreTerms, expandedTerms and pronunciationTargets must be empty arrays. Each grammar topic must have exactly three ordered progressive steps that build in complexity; use a distinct focus and teaching point at each step, with precise formula, usage in Vietnamese for A1/A2 or simple English for B1, B2 and C1, and three to six authentic workplace reference examples. Each step also has dailyObjectives: exactly two distinct objectives, first recognition/explanation and then contextual application, at the supplied CEFR, written in Vietnamese for A1/A2 and in simple English for B1, B2 and C1 (never Vietnamese from B1 upwards).${objectiveLanguage} Together they define A1–A6 or B1–B6; never copy one objective twice. Topic A steps are the progression for N1–N2, N3–N4, N5–N6. Topic B steps are the progression for N7–N8, N9–N10, N11–N12. N13–N15 combine the third step of both topics through contrast, read-aloud and voice note. N16–N18 are optional personalization, shadowing and speaking mock, without new grammar topics. Return JSON matching the schema only; do not include explanations or any other resource category.${repair}`;
}

/**
 * Roadmap grammar phase prompt (docs/grammar-roadmap.md): the application has
 * chosen the pair; the AI writes the three steps of each topic (two daily
 * objectives each = the six scaffolding days) inside the locked "Nội dung" list.
 */
export function buildMonthlyGrammarRoadmapPrompt(pair: MonthlyGrammarCatalogPair, rejectedIssues: readonly string[] = []): string {
  const english = monthlyDailyObjectivesMustBeEnglish(pair.cefr);
  const language = english ? "simple English with short sentences and vocabulary one level below the month's level (no Vietnamese words)" : "Vietnamese";
  const topicLine = (side: MonthlyGrammarCatalogPair["topicA"]) => `Topic ${side.side} title exactly "${monthlyGrammarTopicTitle(pair.cefr, side)}" (roadmap name: ${side.titleVi} / ${side.titleEn}); roadmap content it must cover, in roadmap wording: ${side.contents.map((item, index) => `${index + 1}) ${item}`).join("; ")}.`;
  const k1 = pair.pairType === "contrast" ? "K1 asks learners to choose A or B for each situation" : "K1 asks learners to join A and B in one sentence";
  const repair = rejectedIssues.length ? ` Previous response rejected: ${rejectedIssues.join("; ")}. Correct each listed issue in this response.` : "";
  return [
    `PHASE 3 — GRAMMAR ONLY, ROADMAP PAIR LOCKED BY THE APPLICATION. Return exactly two grammarTopics, topic A first, then topic B; coreTerms, expandedTerms and pronunciationTargets must be empty arrays. The application has ALREADY CHOSEN this month's pair from the product grammar roadmap of level ${pair.cefr}; do not choose, rename, merge, add or drop a topic, and teach nothing outside these two topics and grammar the level has already met.`,
    `Pair type: ${MONTHLY_GRAMMAR_PAIR_TYPE_LABELS[pair.pairType].en}. Workplace situation for the whole month: ${pair.situationEn}.`,
    topicLine(pair.topicA),
    topicLine(pair.topicB),
    "Each topic has exactly three ordered steps, and each step has exactly two dailyObjectives: six daily lessons per topic, one small idea per day (3–4 minutes of grammar), following the roadmap's six scaffolding steps with decreasing support. Step 1 = day 1 Identify (notice the structure in a real workplace message) + day 2 Basic structure (the main, usually affirmative, formula). Step 2 = day 3 Variations (negative, question, short form or the main variant; for a topic without negatives or questions, such as articles or prepositions, its second main variant) + day 4 Meaning and use (when to use it, signal words). Step 3 = day 5 Common errors (typical Vietnamese-influenced errors first: missing to be, missing -s/-ed, wrong tense because Vietnamese has no tense, articles, prepositions) + day 6 Application (learners write 1–2 sentences about their own work).",
    "Spread the roadmap content items over the six days so that EVERY item is taught on some day, one idea per day, in a sensible easy-to-hard order. Name the English forms of each roadmap item (the words and patterns listed in it) in the step focus, formula, usage, examples or dailyObjectives: the application checks that every item is covered.",
    "Step 1 formula is the core structure (it is also the main evidence scored in the monthly exam); step 2 formula is the variant or other use (the secondary exam evidence); step 3 formula is the complete productive pattern learners reuse on the combination days. Each step has a distinct focus, a precise formula, usage, and three to six authentic English workplace reference examples (office, sales, IT, marketing, HR, finance; fictional people and companies) with vocabulary at the month's level.",
    `Write usage and dailyObjectives in ${language}; grammar terms use their common English names (present perfect, passive…). Each dailyObjective names its scaffolding step and its single idea from the roadmap content; never repeat an objective.`,
    `After the two topics, N13–N15 combine A and B (${k1}; K2 is a 4–6 sentence email or message with gaps that need both A and B; K3 is a workplace task answered in 2–3 sentences with a model answer) and N16–N18 are M1 error review, M2 a longer dialogue or email, M3 a mock test, all without new grammar. Return JSON matching the schema only; do not include explanations or any other resource category.${repair}`
  ].join(" ");
}

export async function runMonthlyGrammarPhaseWithRetry(
  generate: (prompt: string) => Promise<MonthlyResourcePlanTaskOutput>,
  cefr?: string,
  pair?: MonthlyGrammarCatalogPair
): Promise<MonthlyResourcePlanTaskOutput> {
  let issues: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generated = await generate(buildMonthlyGrammarPhasePrompt(issues, cefr, pair));
    // The titles are locked plan fields: the application writes them.
    const result = pair ? withMonthlyGrammarRoadmapTitles(generated, pair) : generated;
    issues = getMonthlyGrammarPhaseIssues(result, cefr, pair);
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

export function wordFamilyBaseForms(value: string): Set<string> {
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

function inflectionBaseForms(token: string, includeIng: boolean): Set<string> {
  const word = token.replace(/[-'’]/gu, "");
  const forms = new Set<string>([word]);
  if (word.length < 4) return forms;
  if (word.endsWith("ies")) forms.add(`${word.slice(0, -3)}y`);
  if (/(?:ch|sh|x|z|ss|o)es$/u.test(word)) forms.add(word.slice(0, -2));
  if (/[^su]s$/u.test(word)) forms.add(word.slice(0, -1));
  if (word.endsWith("ied")) forms.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("ed")) {
    forms.add(word.slice(0, -2));
    forms.add(word.slice(0, -1));
    if (/([^aeiou])\1ed$/u.test(word)) forms.add(word.slice(0, -3));
  }
  if (includeIng && word.endsWith("ing") && word.length >= 6) {
    forms.add(word.slice(0, -3));
    forms.add(`${word.slice(0, -3)}e`);
    if (/([^aeiou])\1ing$/u.test(word)) forms.add(word.slice(0, -4));
  }
  return forms;
}

/**
 * Quality rule C: true when one term is only an inflection (plural/-s, -ed or
 * -ing) of the other, e.g. customer/customers. For phrases only the final
 * token may differ. Identical terms are not variants (duplicates are a
 * separate rule). Word-family supports use `monthlyWordFamilyInflectionIssue`
 * instead, which decides -ing and comparative forms by the core's part of speech.
 */
export function isMonthlyInflectionalVariant(first: string, second: string): boolean {
  return isInflectionalVariant(first, second, true);
}

/**
 * -ing forms that are established word-family nouns of their verb, so a verb
 * core may take them as word family (meet -> meeting). Kept deliberately small:
 * every other plain -ing form of a verb core is an inflection (send -> sending).
 */
export const MONTHLY_ING_WORD_FAMILY_NOUNS: ReadonlySet<string> = new Set([
  "meeting", "planning", "training", "building", "booking", "setting", "opening",
  "beginning", "feeling", "warning", "painting", "reading", "writing"
]);

/**
 * Quality rule C for word-family supports, by the core's part of speech:
 * - any core: a plural, -s or -ed form is an inflection (customer -> customers, plan -> planned);
 * - adjective/adverb core: the comparative or superlative is an inflection
 *   (small -> smaller/smallest, easy -> easier), unless the candidate is a noun
 *   in its own right (clean -> cleaner as a noun);
 * - verb core: the plain -ing form is an inflection (send -> sending), except the
 *   established -ing nouns in MONTHLY_ING_WORD_FAMILY_NOUNS (meet -> meeting).
 * A noun core may take a lexicalised -ing noun (plan -> planning).
 * Returns the rejection reason, or undefined when the candidate may stay.
 */
/** Common -ness nouns that are fine word-family items for A1/A2 adjective cores. */
export const MONTHLY_COMMON_NESS_NOUNS: ReadonlySet<string> = new Set(["happiness", "kindness", "readiness", "sadness", "illness", "darkness", "weakness", "fitness", "awareness", "loneliness", "business"]);
/** -ly forms that are rare or change meaning, so they are not useful word-family items. */
export const MONTHLY_RARE_LY_FORMS: ReadonlySet<string> = new Set(["tiredly", "lately", "oldly", "smally", "bigly", "donely", "goodly", "newly-made", "sickly", "deadly", "likely", "kindly"]);
const MONTHLY_IRREGULAR_COMPARATIVES: ReadonlySet<string> = new Set(["better", "best", "worse", "worst", "more", "most", "less", "least", "further", "farther"]);
/** A month umbrella word may be shared by at most this many cores (stops "office equipment" for everything). */
export const MONTHLY_MAX_UMBRELLA_REUSE = 2;

/**
 * Deterministic quality rules for support candidates (user-approved):
 * 1. one umbrella word serves at most MONTHLY_MAX_UMBRELLA_REUSE cores;
 * 2. adjective/adverb cores take no umbrella (optional for them and usually wrong, e.g. clear -> size);
 * 3. for A1/A2 adjective cores, -ness word-family nouns are rejected unless common;
 * 4. rare or meaning-changing -ly forms are rejected as word family;
 * 5. a comparative/superlative is never an antonym (good -> better).
 */
/**
 * Synonym shape (December 2026: A1 week ≈ "seven days", easy ≈ "not hard",
 * town ≈ "village", building ≈ "house"): one word of the same class and register
 * that can replace the core in a sentence, never a definition, a negation, a
 * narrower/broader word or a neighbour of the same category.
 */
export const MONTHLY_SYNONYM_RULE = "A synonym is ONE word of the same part of speech and register that can replace the core in a normal workplace sentence (a phrasal verb only for a verb core: pick up, set up). Never a definition or paraphrase (week -> seven days, easy -> not hard), a number phrase, a narrower or broader word or a neighbour in the same category (town -> village, building -> house or office, computer -> laptop, complete -> do), or a loose association; when a core has no true synonym, give none.";

const PHRASAL_PARTICLES = new Set(["up", "down", "out", "off", "on", "in", "over", "back", "away", "through", "about", "around", "forward", "ahead"]);
const NUMBER_WORDS = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|hundred|thousand|\d+)\b/u;

/** Deterministic synonym-shape rejection reason (MONTHLY_SYNONYM_RULE), or undefined. */
export function monthlySynonymShapeIssue(core: { word: string; type: string }, candidate: { word: string; relation: string }): string | undefined {
  if (candidate.relation !== "synonym") return undefined;
  const words = candidate.word.trim().toLocaleLowerCase("en").split(/\s+/u).filter(Boolean);
  if (words.length < 2) return undefined;
  if (/^(?:not|no|non|never)$/u.test(words[0]!)) return `"${candidate.word}" is a negated definition, not a synonym; give one word with the same meaning, or none`;
  if (NUMBER_WORDS.test(words.join(" "))) return `"${candidate.word}" is a definition, not a synonym; give one word with the same meaning, or none`;
  const phrasalVerb = /\bverb\b/iu.test(core.type) && words.length === 2 && PHRASAL_PARTICLES.has(words[1]!);
  return phrasalVerb ? undefined : `"${candidate.word}" is a phrase or definition; a synonym is one word of the same part of speech (a phrasal verb only for a verb core)`;
}

export function monthlySupportQualityIssue(
  core: { word: string; type: string; cefr?: string },
  candidate: { word: string; relation: string },
  existingMonthCount: number
): string | undefined {
  const synonymShape = monthlySynonymShapeIssue(core, candidate);
  if (synonymShape) return synonymShape;
  const word = normalizeMonthlyResourceWord(candidate.word);
  const adjectiveLike = /\b(adjective|adverb)\b/iu.test(core.type);
  if (candidate.relation === "umbrella") {
    if (adjectiveLike) return "adjective and adverb cores take no umbrella in this plan";
    if (existingMonthCount >= MONTHLY_MAX_UMBRELLA_REUSE) return `umbrella "${candidate.word}" is already used for ${MONTHLY_MAX_UMBRELLA_REUSE} cores this month`;
  }
  if (candidate.relation === "word_family") {
    if (adjectiveLike && (core.cefr === "A1" || core.cefr === "A2") && /ness$/u.test(word) && !MONTHLY_COMMON_NESS_NOUNS.has(word)) return `"${candidate.word}" is an uncommon -ness noun for this level`;
    if (MONTHLY_RARE_LY_FORMS.has(word)) return `"${candidate.word}" is a rare or meaning-changing -ly form`;
  }
  if (candidate.relation === "antonym") {
    const coreWord = normalizeMonthlyResourceWord(core.word);
    if (MONTHLY_IRREGULAR_COMPARATIVES.has(word)) return "a comparative or superlative is not an antonym";
    if (/(er|est)$/u.test(word) && (word.startsWith(coreWord) || word.startsWith(coreWord.replace(/e$/u, "")) || word.startsWith(coreWord.replace(/y$/u, "i")))) return "a comparative or superlative of the core is not an antonym";
  }
  return undefined;
}

export function monthlyWordFamilyInflectionIssue(core: { word: string; type: string }, candidate: { word: string; type?: string }): string | undefined {
  if (isInflectionalVariant(candidate.word, core.word, false)) return "is only an inflected form (plural, -s or -ed) of the core, not a word-family item";
  const pos = monthlyCorePartOfSpeech(core.type);
  const coreWord = normalizeMonthlyResourceWord(core.word).replace(/[-'’]/gu, "");
  const word = normalizeMonthlyResourceWord(candidate.word).replace(/[-'’]/gu, "");
  if (!coreWord || !word || coreWord.includes(" ") || word.includes(" ")) return undefined;
  if (pos === "adjective" || pos === "adverb") {
    const candidateIsNoun = monthlyCorePartOfSpeech(candidate.type) === "noun";
    if (comparativeForms(coreWord, "est").has(word) || (!candidateIsNoun && comparativeForms(coreWord, "er").has(word))) {
      return `is only the comparative or superlative of the ${pos} core, not a word-family item`;
    }
  }
  if (pos === "verb" && isPlainIngFormOf(word, coreWord) && !MONTHLY_ING_WORD_FAMILY_NOUNS.has(word)) {
    return "is only the -ing form of the verb core; only an established -ing noun (meeting, planning, training …) counts as word family";
  }
  return undefined;
}

/** small -> smaller, late -> later, easy -> easier, big -> bigger (and the -est forms). */
function comparativeForms(base: string, suffix: "er" | "est"): Set<string> {
  const forms = new Set<string>([`${base}${suffix}`]);
  if (base.endsWith("e")) forms.add(`${base}${suffix.slice(1)}`);
  if (/[^aeiou]y$/u.test(base)) forms.add(`${base.slice(0, -1)}i${suffix}`);
  if (/(?:^|[^aeiou])[aeiou][^aeiouwxy]$/u.test(base)) forms.add(`${base}${base.at(-1)}${suffix}`);
  return forms;
}

/** sending -> send, making -> make, stopping -> stop, lying -> lie. */
function isPlainIngFormOf(word: string, verb: string): boolean {
  if (!word.endsWith("ing") || word.length <= 4) return false;
  const stem = word.slice(0, -3);
  const bases = new Set<string>([stem, `${stem}e`]);
  if (/([^aeiou])\1$/u.test(stem)) bases.add(stem.slice(0, -1));
  if (stem.endsWith("y")) bases.add(`${stem.slice(0, -1)}ie`);
  return bases.has(verb);
}

function isInflectionalVariant(first: string, second: string, includeIng: boolean): boolean {
  const a = normalizeMonthlyResourceWord(first).split(" ").filter(Boolean);
  const b = normalizeMonthlyResourceWord(second).split(" ").filter(Boolean);
  if (!a.length || a.length !== b.length || a.slice(0, -1).join(" ") !== b.slice(0, -1).join(" ")) return false;
  const lastA = a.at(-1)!.replace(/[-'’]/gu, "");
  const lastB = b.at(-1)!.replace(/[-'’]/gu, "");
  if (lastA === lastB) return false;
  return inflectionBaseForms(lastA, includeIng).has(lastB) || inflectionBaseForms(lastB, includeIng).has(lastA);
}

/**
 * Quality rule A: a collocation support must be a phrase that contains the
 * core word, an inflection of it, or one of its word-family forms as a whole
 * word (decide → "make a decision"; review → "feedback" is rejected).
 */
export function collocationContainsCoreWord(coreWord: string, collocation: string): boolean {
  const core = normalizeMonthlyResourceWord(coreWord).replace(/[-'’]/gu, "");
  const tokens = normalizeMonthlyResourceWord(collocation).split(" ").map((token) => token.replace(/[-'’]/gu, "")).filter(Boolean);
  if (!core || tokens.length < 2) return false;
  const coreForms = wordFamilyBaseForms(core);
  return tokens.some((token) => [...inflectionBaseForms(token, true)].some((base) => base === core
    || (base.length >= 3 && [...wordFamilyBaseForms(base)].some((form) => form.length >= 3 && coreForms.has(form)))));
}

/**
 * Cheap deterministic screen run before an AI relation audit, so obviously
 * wrong word-family items and topic-only collocations never cost an audit call.
 */
export function prefilterMonthlySupportCandidatesForAudit(
  core: { word: string; type?: string },
  candidates: readonly MonthlyResourcePlanTaskOutput["expandedTerms"][number][]
): { kept: MonthlyResourcePlanTaskOutput["expandedTerms"]; rejected: string[] } {
  const kept: MonthlyResourcePlanTaskOutput["expandedTerms"] = [];
  const rejected: string[] = [];
  const coreType = core.type ?? "";
  for (const candidate of candidates) {
    const familyIssue = candidate.relation === "word_family" ? monthlyWordFamilyInflectionIssue({ word: core.word, type: coreType }, candidate) : undefined;
    if (candidate.relation === "word_family" && !isGenuineWordFamily(core.word, candidate.word)) rejected.push(`${candidate.word} (not a genuine word family of ${core.word})`);
    else if (familyIssue) rejected.push(`${candidate.word} (${familyIssue})`);
    else if (candidate.relation === "umbrella" && isGenericMonthlyUmbrella(coreType, candidate.word)) rejected.push(`${candidate.word} (generic placeholder umbrella)`);
    else if (candidate.relation === "umbrella" && coreType && !hasCompatiblePartOfSpeech(coreType, candidate.type, "umbrella")) rejected.push(`${candidate.word} (umbrella part of speech does not fit a ${coreType} core)`);
    else if (candidate.relation === "collocation" && !collocationContainsCoreWord(core.word, candidate.word)) rejected.push(`${candidate.word} (collocation without ${core.word})`);
    else kept.push(candidate);
  }
  return { kept, rejected };
}

/**
 * Re-screen of cached supports before enrichment (resumed checkpoints and
 * core-phase output). It applies only rules that `selectMonthlySupportCandidates`
 * also enforces when the core phase accepts a support (quality rules A and C,
 * umbrella deny-list and part of speech, genuine word family, no core words, no
 * duplicates, at most nine), so a support accepted under the same rules always
 * survives. Offending supports are dropped one by one; the rest stay.
 */
export function screenCachedMonthlyCoreSupports(
  core: { id: string; word: string; type: string },
  supports: readonly MonthlyResourcePlanTaskOutput["expandedTerms"][number][],
  coreWords: ReadonlySet<string>
): MonthlyResourcePlanTaskOutput["expandedTerms"] {
  const kept: MonthlyResourcePlanTaskOutput["expandedTerms"] = [];
  const keptWords = new Set<string>();
  for (const term of supports) {
    if (kept.length >= MONTHLY_MAX_SUPPORTS_PER_CORE) break;
    const word = normalizeMonthlyResourceWord(term.word);
    if (term.relatesToCoreId !== core.id || coreWords.has(word) || keptWords.has(word)) continue;
    if (term.relation === "collocation" && !collocationContainsCoreWord(core.word, term.word)) continue;
    if (term.relation === "umbrella" && !isMonthlyUmbrellaShapeAllowed(core.type, term)) continue;
    if (term.relation === "word_family" && (!isGenuineWordFamily(core.word, term.word) || monthlyWordFamilyInflectionIssue(core, term))) continue;
    if (term.relation !== "word_family" && isMonthlyInflectionalVariant(term.word, core.word)) continue;
    if (kept.some((earlier) => isMonthlyInflectionalVariant(term.word, earlier.word))) continue;
    kept.push(term);
    keptWords.add(word);
  }
  return kept;
}

/**
 * Quality rule B: a core may not be a synonym of another accepted core, and its
 * own synonyms may not include another accepted core word (start/begin).
 * Returns the conflicting accepted core word, if any.
 */
export function findMonthlyCoreSynonymConflict(input: {
  candidateWord: string;
  candidateSynonyms: readonly string[];
  acceptedCores: ReadonlyArray<{ word: string; synonyms: readonly string[] }>;
}): string | undefined {
  const same = (first: string, second: string) => normalizeMonthlyResourceWord(first) === normalizeMonthlyResourceWord(second) || isMonthlyInflectionalVariant(first, second);
  for (const accepted of input.acceptedCores) {
    if (accepted.synonyms.some((synonym) => same(synonym, input.candidateWord))) return accepted.word;
    if (input.candidateSynonyms.some((synonym) => same(synonym, accepted.word))) return accepted.word;
  }
  return undefined;
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
  plan: MonthlyResourcePlanTaskOutput,
  /** Roadmap catalog item of each pronunciation target, stored on the sound for the 12-month memory. */
  pronunciationCatalogIds: readonly (string | undefined)[] = [],
  /** Roadmap catalog topic of each grammar topic (A, B), stored on the topic for the 12-month memory. */
  grammarCatalogIds: readonly (string | undefined)[] = []
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
    .map(({ id, word, meaning, type, ipa, cefr: coreCefr }, index) => ({ id: coreIdMap.get(id) ?? `${cefr.toLowerCase()}-core-${index + 1}`, word, meaning, type, ipa, source: "core_registry" as const, component: "core" as const, ...(coreCefr ? { cefr: coreCefr } : {}) }));
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
      ...(term.cefr ? { cefr: term.cefr } : {}),
      // B1–C1 synonym/antonym definitions only; A1–A2 learners read the Vietnamese meaning.
      ...(term.definition?.trim() && (term.relation === "synonym" || term.relation === "antonym") && !["A1", "A2"].includes(cefr) ? { definition: term.definition.trim() } : {})
    }));
  const grammarTopics = plan.grammarTopics.map((topic, index) => ({
    id: `${cefr.toLowerCase()}-grammar-${index + 1}`,
    title: topic.title,
    steps: topic.steps.map((step, stepIndex) => ({
      id: `${cefr.toLowerCase()}-grammar-${index + 1}-step-${stepIndex + 1}`,
      focus: step.focus,
      formula: step.formula,
      usage: step.usage,
      examples: step.examples,
      ...(step.dailyObjectives ? { dailyObjectives: step.dailyObjectives } : {})
    })),
    ...(grammarCatalogIds[index] ? { catalogId: grammarCatalogIds[index]! } : {})
  }));
  const sounds = plan.pronunciationTargets.map((target, targetIndex) => ({
    id: `${cefr.toLowerCase()}-sound-${targetIndex + 1}`,
    ipa: target.ipa,
    label: target.label,
    examples: target.words.map((word, index) => ({ id: `${cefr.toLowerCase()}-sound-${targetIndex + 1}-word-${index + 1}`, word: word.word, ipa: word.ipa })),
    ...(pronunciationCatalogIds[targetIndex] ? { catalogId: pronunciationCatalogIds[targetIndex]! } : {})
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

