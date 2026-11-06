import type { CefrLevel } from "@e4s/contracts";

export interface MonthlyCalendar {
  month: string;
  studyDays: string[];
  effectiveDays: string[];
  examDate: string;
  lessonCount: number;
}

export interface SharedMonthBrief {
  version: number;
  title: string;
  brief: string;
  context: string;
  communicationGoal: string;
}

export interface CoreTerm {
  id: string;
  word: string;
  meaning: string;
  type: string;
  ipa: string;
  source: "core_registry";
  component: "core";
  dayNumber: number;
}

export interface SupportTerm {
  id: string;
  word: string;
  meaning: string;
  type: string;
  relation: MonthlySupportRelation;
  source: "example" | "family" | "synonym" | "antonym" | "group" | "manual";
  component: "expanded";
  dayNumber: number;
  relatedCoreTermId: string;
  /**
   * CEFR level of the support word itself (VH-R33). A support may come from the
   * month's level or one adjacent level (±1, clamped to A1..C1). Optional so
   * pools stored before this field existed keep validating unchanged.
   */
  cefr?: CefrLevel;
}

export const MONTHLY_SUPPORT_RELATIONS = ["umbrella", "synonym", "antonym", "word_family", "collocation"] as const;
export type MonthlySupportRelation = (typeof MONTHLY_SUPPORT_RELATIONS)[number];
/**
 * The three structural support relations. Which of them a core must have
 * depends on its part of speech (see `requiredSupportRelationsFor`); a core
 * whose part of speech cannot be read still needs all three.
 */
export const MONTHLY_STRUCTURAL_SUPPORT_RELATIONS = ["umbrella", "synonym", "word_family"] as const satisfies readonly MonthlySupportRelation[];
export type MonthlyStructuralSupportRelation = (typeof MONTHLY_STRUCTURAL_SUPPORT_RELATIONS)[number];
export type MonthlyCorePartOfSpeech = "noun" | "verb" | "adjective" | "adverb";

/**
 * Required support relations per core part of speech, following WordNet:
 * nouns are organised by hypernymy (umbrella) and synonymy, so a noun needs an
 * umbrella and a synonym and takes a word family only when a common one exists;
 * verbs, adjectives and adverbs have no reliable noun-style hypernym, so they
 * need a synonym and a word family and take an umbrella only when a genuine one exists.
 */
export const MONTHLY_REQUIRED_SUPPORT_RELATIONS_BY_POS: Readonly<Record<MonthlyCorePartOfSpeech, readonly MonthlyStructuralSupportRelation[]>> = {
  noun: ["umbrella", "synonym"],
  verb: ["synonym", "word_family"],
  adjective: ["synonym", "word_family"],
  adverb: ["synonym", "word_family"]
};
/** Every core needs at least this many supports, whatever its part of speech. */
export const MONTHLY_MIN_SUPPORTS_PER_CORE = 3;
export const MONTHLY_MAX_SUPPORTS_PER_CORE = 9;

/**
 * Reads a core's single part of speech from its `type` label ("noun", "Verb",
 * "adj."). Returns undefined for an empty, unknown or mixed label ("noun/verb").
 */
export function monthlyCorePartOfSpeech(type: string | undefined): MonthlyCorePartOfSpeech | undefined {
  const tokens = (type ?? "").toLocaleLowerCase("en").split(/[^a-z]+/u).filter(Boolean);
  const found = new Set<MonthlyCorePartOfSpeech>();
  for (const token of tokens) {
    if (token === "noun" || token === "n") found.add("noun");
    else if (token === "verb" || token === "v") found.add("verb");
    else if (token === "adjective" || token === "adj") found.add("adjective");
    else if (token === "adverb" || token === "adv") found.add("adverb");
  }
  return found.size === 1 ? [...found][0] : undefined;
}

/**
 * Support relations a core of this part of speech must have (noun: umbrella +
 * synonym; verb/adjective/adverb: synonym + word family). An unknown or mixed
 * part of speech keeps the strict legacy set (umbrella, synonym, word family).
 */
export function requiredSupportRelationsFor(type: string | undefined): readonly MonthlyStructuralSupportRelation[] {
  const pos = monthlyCorePartOfSpeech(type);
  return pos ? MONTHLY_REQUIRED_SUPPORT_RELATIONS_BY_POS[pos] : MONTHLY_STRUCTURAL_SUPPORT_RELATIONS;
}

/** Structural relations that are optional for this part of speech but taken when a genuine one exists (noun: word family; verb/adjective/adverb: umbrella). */
export function optionalStructuralSupportRelationsFor(type: string | undefined): readonly MonthlyStructuralSupportRelation[] {
  const required = requiredSupportRelationsFor(type);
  return MONTHLY_STRUCTURAL_SUPPORT_RELATIONS.filter((relation) => !required.includes(relation));
}

/** Whether `terms` cover every relation required for a core of this part of speech. */
export function hasRequiredMonthlySupportRelations(coreType: string | undefined, terms: readonly { relation: string }[]): boolean {
  const relations = new Set(terms.map((term) => term.relation));
  return requiredSupportRelationsFor(coreType).every((relation) => relations.has(relation));
}

/** Human-readable list of the required relations ("umbrella and synonym"). */
export function describeRequiredSupportRelations(coreType: string | undefined): string {
  const labels = requiredSupportRelationsFor(coreType).map((relation) => relation === "word_family" ? "word-family" : relation);
  return labels.length <= 2 ? labels.join(" and ") : `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}
/** Repeated support placements (same normalized word on several cores) may not exceed this share of the month's supports. */
export const MONTHLY_SUPPORT_REPEAT_CEILING = 0.35;
const MONTHLY_CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1"] as const satisfies readonly CefrLevel[];

/** Largest number of repeated support placements allowed for a month with `supportCount` supports. */
export function maxMonthlySupportRepeats(supportCount: number): number {
  return Math.floor(supportCount * MONTHLY_SUPPORT_REPEAT_CEILING);
}

/** CEFR levels a support term may come from: the learner level and its neighbours (±1, clamped to A1..C1). */
export function allowedMonthlySupportLevels(cefr: CefrLevel): CefrLevel[] {
  const index = MONTHLY_CEFR_ORDER.indexOf(cefr);
  return MONTHLY_CEFR_ORDER.filter((_level, levelIndex) => Math.abs(levelIndex - index) <= 1);
}

/** Classifies a support term's level against the month level; an absent level is treated as the same level. */
export function monthlySupportLevelBand(monthCefr: CefrLevel, supportCefr: CefrLevel | undefined): "same" | "adjacent" | "out_of_range" {
  if (!supportCefr || supportCefr === monthCefr) return "same";
  return allowedMonthlySupportLevels(monthCefr).includes(supportCefr) ? "adjacent" : "out_of_range";
}

/** How many CEFR levels above the month level a word-family support may be (A1 -> B1, B1 -> C1). */
export const MONTHLY_WORD_FAMILY_MAX_LEVELS_ABOVE = 2;

/** Highest CEFR level a word-family support may have for a month at `cefr` (month + 2, clamped to C1). */
export function maxMonthlyWordFamilyLevel(cefr: CefrLevel): CefrLevel {
  const index = MONTHLY_CEFR_ORDER.indexOf(cefr);
  return MONTHLY_CEFR_ORDER[Math.min(index + MONTHLY_WORD_FAMILY_MAX_LEVELS_ABOVE, MONTHLY_CEFR_ORDER.length - 1)]!;
}

/**
 * Whether a support term's level is acceptable for the month. Word-family items
 * may be any level below the month and at most two levels above it (a learner
 * meets common derived forms slightly above their level); every other relation
 * must stay within one level (VH-R33). An absent level is treated as the month level.
 */
/** Share of a month's expanded pool that may be multi-word expressions. */
export const MONTHLY_PHRASE_CEILING = 0.35;
export function maxMonthlyPhrasePlacements(supportCount: number): number {
  return Math.floor(supportCount * MONTHLY_PHRASE_CEILING);
}
/** Per-core phrase limit: one multi-word expression, plus an umbrella group phrase (office equipment) which does not count. */
export function countsTowardCorePhraseLimit(term: { word: string; relation?: string }): boolean {
  return term.relation !== "umbrella" && !isSingleEnglishHeadword(term.word);
}

export function isMonthlySupportLevelAllowed(monthCefr: CefrLevel, term: { relation?: string | undefined; cefr?: CefrLevel | undefined }): boolean {
  if (term.relation === "word_family") return !term.cefr || MONTHLY_CEFR_ORDER.indexOf(term.cefr) <= MONTHLY_CEFR_ORDER.indexOf(maxMonthlyWordFamilyLevel(monthCefr));
  return monthlySupportLevelBand(monthCefr, term.cefr) !== "out_of_range";
}

/** Human-readable support level rule used in validation errors. */
export function monthlySupportLevelRule(monthCefr: CefrLevel): string {
  return `supports must be within one level of ${monthCefr}; word family may be up to ${maxMonthlyWordFamilyLevel(monthCefr)}`;
}

/** Whether a core term's own CEFR level fits the month: never above the month level; an absent label is allowed. */
export function isMonthlyCoreLevelAllowed(monthCefr: CefrLevel, coreCefr: CefrLevel | undefined): boolean {
  return !coreCefr || MONTHLY_CEFR_ORDER.indexOf(coreCefr) <= MONTHLY_CEFR_ORDER.indexOf(monthCefr);
}
export const MONTHLY_EXERCISE_CODES = ["listening", "reading", "writing", "word_class", "word_use", "speaking"] as const;
export type MonthlyExerciseCode = (typeof MONTHLY_EXERCISE_CODES)[number];
export interface MonthlySkillExercisePlan {
  exerciseCode: MonthlyExerciseCode;
  focus: string;
  resourceIds: string[];
}

/** Editable resources before an operator locks their monthly lesson allocation. */
export type MonthlyResourcePoolCoreTerm = Omit<CoreTerm, "dayNumber">;
export type MonthlyResourcePoolSupportTerm = Omit<SupportTerm, "dayNumber"> & { relatedCoreTermId: string };
export interface MonthlyResourcePoolContract {
  month: string;
  cefr: CefrLevel;
  theme: SharedMonthBrief;
  coreTerms: MonthlyResourcePoolCoreTerm[];
  supportTerms: MonthlyResourcePoolSupportTerm[];
  grammarTopics: GrammarTopic[];
  sounds: PronunciationSound[];
  version: number;
}

type CoreTermInput = Omit<CoreTerm, "source" | "component" | "dayNumber">;
type SupportTermInput = Omit<SupportTerm, "component">;

export interface GrammarStep {
  id: string;
  focus: string;
  formula: string;
  usage: string;
  examples: string[];
}

export interface GrammarTopic {
  id: string;
  title: string;
  steps: GrammarStep[];
}

export interface PronunciationExample {
  id: string;
  word: string;
  ipa: string;
}

export interface PronunciationSound {
  id: string;
  ipa: string;
  label: string;
  examples: PronunciationExample[];
}

export interface MonthlyCurriculumInput {
  month: string;
  cefr: CefrLevel;
  theme: SharedMonthBrief;
  coreTerms: CoreTermInput[];
  supportTerms: SupportTermInput[];
  grammarTopics: GrammarTopic[];
  sounds: PronunciationSound[];
}

export interface MonthlyDaySpec {
  lessonNumber: number;
  date: string;
  kind: "new" | "review";
  coreTermIds: string[];
  expandedTermIds: string[];
  reviewTermIds: string[];
  reviewExpandedTermIds: string[];
  reviewFromPreviousMonth?: boolean;
  reviewGatesNextWeek?: boolean;
  reviewWeekKey?: string | null;
  reviewPrerequisiteLessonNumbers?: number[];
  reviewGrammarStepIds?: string[];
  reviewSoundIds?: string[];
  reviewPronunciationExampleIds?: string[];
  skillExercises: MonthlySkillExercisePlan[];
  grammarStepId: string;
  grammarStepIds?: string[];
  soundId: string;
  pronunciationSlot?: `P${1 | 2 | 3 | 4}` | `K${1 | 2 | 3}` | `M${1 | 2 | 3}`;
  pronunciationExampleIds: string[];
}

export type MonthlyCurriculumContract = Omit<MonthlyCurriculumInput, "coreTerms" | "supportTerms"> & {
  coreTerms: CoreTerm[];
  supportTerms: SupportTerm[];
  version: number;
  daySpecs: MonthlyDaySpec[];
};

export interface MonthlyExamScope {
  month: string;
  cefr: CefrLevel;
  contractVersion: number;
  coreTermIds: string[];
  grammarStepIds: string[];
  soundIds: string[];
}

export interface MonthlyResourceCriteriaDefaults {
  vocabularyCount: number;
  expandedVocabularyCount: number;
  grammarTopicCount: number;
  pronunciationSoundCount: number;
}

/** Starting values for monthly resources. Three core terms are needed for each new daily lesson. */
export function recommendedMonthlyResourceCriteria(month: string, cefr: CefrLevel): MonthlyResourceCriteriaDefaults {
  const calendar = buildMonthlyCalendar(month);
  const newLessonCount = calendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, calendar) === "new").length;
  void cefr;
  return {
    vocabularyCount: newLessonCount * 3,
    // Nine supports per core is the quality ceiling and the generation target;
    // generation may return as few as three supports covering the relations
    // required for the core's part of speech when no further authentic relation exists.
    expandedVocabularyCount: newLessonCount * 3 * MONTHLY_MAX_SUPPORTS_PER_CORE,
    grammarTopicCount: 2,
    pronunciationSoundCount: 4
  };
}

/** A monthly exam can guide reinforcement but never demotes a learner automatically. */
export function resolveMonthlyExamOutcome(input: { currentLevel: CefrLevel; passed: boolean }): {
  levelChange: null;
  recommendation: "continue_current_level" | "reinforce_lower_level";
  certificateEligible: boolean;
} {
  return input.passed
    ? { levelChange: null, recommendation: "continue_current_level", certificateEligible: input.currentLevel === "C1" }
    : { levelChange: null, recommendation: "reinforce_lower_level", certificateEligible: false };
}

/** The exam scope intentionally excludes all supplemental terms and activities. */
export function buildMonthlyExamScope(contract: MonthlyCurriculumContract): MonthlyExamScope {
  return {
    month: contract.month,
    cefr: contract.cefr,
    contractVersion: contract.version,
    coreTermIds: contract.coreTerms.map((term) => term.id),
    grammarStepIds: contract.grammarTopics.flatMap((topic) => topic.steps.map((step) => step.id)),
    soundIds: contract.sounds.map((sound) => sound.id)
  };
}

export function buildMonthlyCalendar(month: string): MonthlyCalendar {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) throw new RangeError("Month must be YYYY-MM");
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const studyDays: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) studyDays.push(date);
  }
  const examDate = studyDays.at(-1);
  if (!examDate) throw new RangeError("Month has no study day");
  // The final weekday is reserved for the monthly final.  It deliberately
  // never becomes a daily lesson: there is no DaySpec, lesson row, or daily
  // resource assignment for the exam date.
  const effectiveDays = studyDays.slice(0, -1);
  if (effectiveDays.length === 0) throw new RangeError("Month needs at least one daily lesson before its final exam");
  return { month, studyDays, effectiveDays, examDate, lessonCount: effectiveDays.length };
}

export function buildMonthlyCurriculum(input: MonthlyCurriculumInput): MonthlyCurriculumContract {
  const calendar = buildMonthlyCalendar(input.month);
  const newDays = calendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, calendar) === "new");
  const expectedCoreCount = newDays.length * 3;
  if (input.coreTerms.length !== expectedCoreCount) throw new RangeError(`Expected ${expectedCoreCount} core terms for ${input.month}`);
  if (input.coreTerms.some((term) => !isSingleEnglishHeadword(term.word))) throw new RangeError("Every core resource must be one standalone English headword");
  const duplicateCore = duplicateOf(input.coreTerms.map((term) => normalize(term.word)));
  if (duplicateCore) throw new RangeError(`Duplicate core term: ${duplicateCore}`);
  if (input.supportTerms.length < expectedCoreCount * MONTHLY_MIN_SUPPORTS_PER_CORE || input.supportTerms.length > expectedCoreCount * MONTHLY_MAX_SUPPORTS_PER_CORE) throw new RangeError(`Expected ${expectedCoreCount * MONTHLY_MIN_SUPPORTS_PER_CORE}-${expectedCoreCount * MONTHLY_MAX_SUPPORTS_PER_CORE} expanded terms for ${input.month}`);
  const outOfRangeSupport = input.supportTerms.find((term) => !isMonthlySupportLevelAllowed(input.cefr, term));
  if (outOfRangeSupport) throw new RangeError(`Expanded term ${outOfRangeSupport.id} is CEFR ${outOfRangeSupport.cefr}; ${monthlySupportLevelRule(input.cefr)}`);
  if (input.supportTerms.some((term) => !input.coreTerms.some((core) => core.id === term.relatedCoreTermId))) throw new RangeError("Every expanded term must link to a core term in this month");
  if (input.supportTerms.some((term) => !isSingleEnglishHeadword(term.word) && !isNaturalLengthEnglishPhrase(term.word))) throw new RangeError("Expanded resources must be English headwords or two-to-four-word expressions");
  if (input.supportTerms.filter((term) => !isSingleEnglishHeadword(term.word)).length > maxMonthlyPhrasePlacements(input.supportTerms.length)) throw new RangeError("Expanded expressions exceed the 35% monthly limit");
  if (expandedRepeatCount(input.supportTerms.map((term) => normalize(term.word))) > maxMonthlySupportRepeats(input.supportTerms.length)) {
    throw new RangeError("Expanded resources repeat more than 35% of the monthly total");
  }
  if (input.supportTerms.some((term) => input.coreTerms.some((core) => normalize(core.word) === normalize(term.word)))) throw new RangeError("Support term duplicates a core term");
  if (input.grammarTopics.length !== 2) throw new RangeError("Monthly curriculum needs exactly two grammar topics");
  if (input.sounds.length !== 4) throw new RangeError("Monthly curriculum needs exactly four pronunciation targets");
  if (input.supportTerms.some((term) => !Number.isInteger(term.dayNumber) || term.dayNumber < 1 || term.dayNumber > calendar.lessonCount)) throw new RangeError("Every expanded term must belong to a valid monthly day");
  if (input.grammarTopics.some((topic) => topic.steps.length !== 3)) throw new RangeError("Every grammar topic needs exactly three ordered steps");
  for (const core of input.coreTerms) {
    const related = input.supportTerms.filter((term) => term.relatedCoreTermId === core.id);
    if (related.length < MONTHLY_MIN_SUPPORTS_PER_CORE || related.length > MONTHLY_MAX_SUPPORTS_PER_CORE || !hasRequiredMonthlySupportRelations(core.type, related)) throw new RangeError(`Core term ${core.id} needs 3-9 supports including ${describeRequiredSupportRelations(core.type)}`);
    if (related.filter(countsTowardCorePhraseLimit).length > 1) throw new RangeError(`Core term ${core.id} may have at most one multi-word expanded expression`);
  }

  let newLessonOrdinal = 0;
  let pendingReviewCoreIds: string[] = [];
  let pendingReviewExpandedIds: string[] = [];
  let pendingReviewGrammarStepIds: string[] = [];
  let pendingReviewSoundIds: string[] = [];
  let pendingReviewPronunciationExampleIds: string[] = [];
  const daySpecs = calendar.effectiveDays.map((date, index) => {
    const lessonNumber = index + 1;
    const kind = monthlyDayKind(lessonNumber, calendar);
    const reviewFromPreviousMonth = kind === "review" && isFirstMonthFriday(date, calendar);
    const reviewWeekKey = kind === "review" ? mondayOfWeek(date) : null;
    if (kind === "new") newLessonOrdinal += 1;
    if (newLessonOrdinal > 18) throw new RangeError("Monthly pronunciation plan supports at most 18 new lesson slots");
    const coreTermIds = kind === "new" ? input.coreTerms.slice((newLessonOrdinal - 1) * 3, newLessonOrdinal * 3).map((term) => term.id) : [];
    const expandedTermIds = kind === "new" ? input.supportTerms.filter((term) => coreTermIds.includes(term.relatedCoreTermId)).map((term) => term.id) : [];
    const reviewTermIds = kind === "review" ? [...pendingReviewCoreIds] : [];
    const reviewExpandedTermIds = kind === "review" ? [...pendingReviewExpandedIds] : [];
    const reviewPrerequisiteLessonNumbers = kind === "review" && !reviewFromPreviousMonth
      ? calendar.effectiveDays.slice(0, index).flatMap((candidateDate, candidateIndex) =>
        mondayOfWeek(candidateDate) === reviewWeekKey && monthlyDayKind(candidateIndex + 1, calendar) === "new" ? [candidateIndex + 1] : [])
      : [];
    const reviewGrammarStepIds = kind === "review" ? [...pendingReviewGrammarStepIds] : [];
    const reviewSoundIds = kind === "review" ? [...pendingReviewSoundIds] : [];
    const reviewPronunciationExampleIds = kind === "review" ? [...pendingReviewPronunciationExampleIds] : [];
    const reviewGatesNextWeek = kind === "review" && !reviewFromPreviousMonth && reviewPrerequisiteLessonNumbers.length > 0;
    if (kind === "review") {
      pendingReviewCoreIds = [];
      pendingReviewExpandedIds = [];
      pendingReviewGrammarStepIds = [];
      pendingReviewSoundIds = [];
      pendingReviewPronunciationExampleIds = [];
    } else {
      pendingReviewCoreIds.push(...coreTermIds);
      pendingReviewExpandedIds.push(...expandedTermIds);
    }
    const assignmentOrdinal = Math.max(1, newLessonOrdinal);
    const grammarSteps = expectedGrammarSteps(assignmentOrdinal, input.grammarTopics);
    const step = grammarSteps[0]!;
    const soundIndex = pronunciationSoundIndex(assignmentOrdinal);
    const sound = input.sounds[soundIndex]!;
    const pronunciationSlot = pronunciationSlotFor(assignmentOrdinal);
    const exampleIds = sound.examples.slice(0, 3).map((example) => example.id);
    if (kind === "new") {
      for (const grammarStep of grammarSteps) if (!pendingReviewGrammarStepIds.includes(grammarStep.id)) pendingReviewGrammarStepIds.push(grammarStep.id);
      if (!pendingReviewSoundIds.includes(sound.id)) pendingReviewSoundIds.push(sound.id);
      for (const exampleId of exampleIds) if (!pendingReviewPronunciationExampleIds.includes(exampleId)) pendingReviewPronunciationExampleIds.push(exampleId);
    }
    if (exampleIds.length !== 3) throw new RangeError(`Sound ${sound.id} needs three unused examples for lesson ${lessonNumber}`);
    const skillExercises = buildMonthlySkillExercises(kind, kind === "new" ? coreTermIds : reviewTermIds, kind === "new" ? expandedTermIds : reviewExpandedTermIds);
    return { lessonNumber, date, kind, coreTermIds, expandedTermIds, reviewTermIds, reviewExpandedTermIds, reviewFromPreviousMonth, reviewGatesNextWeek, reviewWeekKey, reviewPrerequisiteLessonNumbers, reviewGrammarStepIds, reviewSoundIds, reviewPronunciationExampleIds, skillExercises, grammarStepId: step.id, grammarStepIds: grammarSteps.map((grammarStep) => grammarStep.id), soundId: sound.id, pronunciationSlot, pronunciationExampleIds: exampleIds };
  });

  const newLessonNumbers = calendar.effectiveDays.flatMap((_date, index) => monthlyDayKind(index + 1, calendar) === "new" ? [index + 1] : []);
  const coreTerms: CoreTerm[] = input.coreTerms.map((term, index) => ({
    ...term,
    source: "core_registry",
    component: "core",
    dayNumber: newLessonNumbers[Math.floor(index / 3)]!
  }));
  const supportTerms: SupportTerm[] = input.supportTerms.map((term) => ({ ...term, component: "expanded" }));
  return { ...input, coreTerms, supportTerms, version: input.theme.version, daySpecs };
}

/** Assigns an editable resource pool only when an operator explicitly approves it. */
export function planMonthlyResourcePool(pool: MonthlyResourcePoolContract): MonthlyCurriculumContract {
  const calendar = buildMonthlyCalendar(pool.month);
  const newDays = calendar.effectiveDays.flatMap((_date, index) => monthlyDayKind(index + 1, calendar) === "new" ? [index + 1] : []);
  const expectedCoreCount = newDays.length * 3;
  const errors: string[] = [];
  if (pool.coreTerms.length !== expectedCoreCount) errors.push(`Expected ${expectedCoreCount} core terms, got ${pool.coreTerms.length}.`);
  if (pool.supportTerms.length < expectedCoreCount * MONTHLY_MIN_SUPPORTS_PER_CORE || pool.supportTerms.length > expectedCoreCount * MONTHLY_MAX_SUPPORTS_PER_CORE) errors.push(`Expected ${expectedCoreCount * MONTHLY_MIN_SUPPORTS_PER_CORE}-${expectedCoreCount * MONTHLY_MAX_SUPPORTS_PER_CORE} expanded terms, got ${pool.supportTerms.length}.`);
  const normalizedCore = pool.coreTerms.map((term) => normalize(term.word));
  if (pool.coreTerms.some((term) => !isSingleEnglishHeadword(term.word))) errors.push("Every core resource must be one standalone English headword.");
  if (duplicateOf(normalizedCore)) errors.push(`Duplicate core term: ${duplicateOf(normalizedCore)}.`);
  if (duplicateOf(pool.coreTerms.map((term) => term.id))) errors.push("Core resource IDs must be unique.");
  if (duplicateOf(pool.supportTerms.map((term) => term.id))) errors.push("Expanded resource IDs must be unique.");
  const coreWords = new Set(normalizedCore);
  const phraseSupports = pool.supportTerms.filter((term) => !isSingleEnglishHeadword(term.word));
  if (pool.supportTerms.some((term) => !isSingleEnglishHeadword(term.word) && !isNaturalLengthEnglishPhrase(term.word))) errors.push("Expanded resources must be English headwords or two-to-four-word expressions.");
  if (phraseSupports.length > maxMonthlyPhrasePlacements(pool.supportTerms.length)) errors.push("Expanded expressions exceed the 35% monthly limit.");
  for (const support of pool.supportTerms) {
    if (!pool.coreTerms.some((core) => core.id === support.relatedCoreTermId)) errors.push(`Expanded term ${support.id} references an unknown core resource.`);
    if (coreWords.has(normalize(support.word))) errors.push(`Expanded term ${support.id} duplicates a core term.`);
    if (!isMonthlySupportLevelAllowed(pool.cefr, support)) errors.push(`Expanded term ${support.id} is CEFR ${support.cefr}; ${monthlySupportLevelRule(pool.cefr)}.`);
  }
  const supportCounts = new Map<string, number>();
  const phraseCountByCore = new Map<string, number>();
  for (const support of pool.supportTerms) supportCounts.set(support.relatedCoreTermId, (supportCounts.get(support.relatedCoreTermId) ?? 0) + 1);
  for (const support of phraseSupports.filter(countsTowardCorePhraseLimit)) phraseCountByCore.set(support.relatedCoreTermId, (phraseCountByCore.get(support.relatedCoreTermId) ?? 0) + 1);
  for (const core of pool.coreTerms) {
    if ((supportCounts.get(core.id) ?? 0) < MONTHLY_MIN_SUPPORTS_PER_CORE || (supportCounts.get(core.id) ?? 0) > MONTHLY_MAX_SUPPORTS_PER_CORE) errors.push(`Core term ${core.id} must have 3-9 related expanded terms.`);
    const linkedTerms = pool.supportTerms.filter((term) => term.relatedCoreTermId === core.id);
    if (!hasRequiredMonthlySupportRelations(core.type, linkedTerms)) errors.push(`Core term ${core.id} needs ${describeRequiredSupportRelations(core.type)} supports.`);
    if ((phraseCountByCore.get(core.id) ?? 0) > 1) errors.push(`Core term ${core.id} may have at most one multi-word expanded expression.`);
  }
  if (expandedRepeatCount(pool.supportTerms.map((term) => normalize(term.word))) > maxMonthlySupportRepeats(pool.supportTerms.length)) {
    errors.push("Expanded resources repeat more than 35% of the monthly total.");
  }
  if (pool.grammarTopics.length !== 2) errors.push("Monthly curriculum needs exactly two grammar topics.");
  if (pool.sounds.length !== 4) errors.push("Monthly curriculum needs exactly four pronunciation targets.");
  if (errors.length) throw new RangeError(errors.join(" "));

  const dayByCoreId = new Map<string, number>();
  for (let index = 0; index < pool.coreTerms.length; index += 1) {
    const dayNumber = newDays[Math.floor(index / 3)]!;
    dayByCoreId.set(pool.coreTerms[index]!.id, dayNumber);
  }
  const plannedSupportTerms = pool.supportTerms.map((term) => ({
    id: term.id,
    word: term.word,
    meaning: term.meaning,
    type: term.type,
    relation: term.relation,
    source: term.source,
    relatedCoreTermId: term.relatedCoreTermId,
    dayNumber: dayByCoreId.get(term.relatedCoreTermId)!,
    ...(term.cefr ? { cefr: term.cefr } : {})
  }));
  return buildMonthlyCurriculum({
    month: pool.month,
    cefr: pool.cefr,
    theme: pool.theme,
    coreTerms: pool.coreTerms.map(({ id, word, meaning, type, ipa }) => ({ id, word, meaning, type, ipa })),
    supportTerms: plannedSupportTerms,
    grammarTopics: pool.grammarTopics,
    sounds: pool.sounds
  });
}

/**
 * Rebuilds a previously approved allocation after a plan-schema upgrade. Legacy
 * generated pools without links can be repaired only when their stable IDs
 * prove the original three-supports-per-core order; no resource text is edited.
 */
export function backfillMonthlyCurriculumPlan(source: unknown): MonthlyCurriculumContract {
  if (!source || typeof source !== "object") throw new TypeError("Monthly framework contract must be an object");
  const legacy = source as MonthlyCurriculumContract & {
    supportTerms: Array<Omit<SupportTerm, "relatedCoreTermId"> & { relatedCoreTermId?: string }>;
    daySpecs: Array<Partial<MonthlyDaySpec> & Pick<MonthlyDaySpec, "lessonNumber" | "date" | "kind" | "coreTermIds" | "reviewTermIds" | "grammarStepId" | "soundId" | "pronunciationExampleIds">>;
  };
  const complete = legacy.supportTerms.every((term) => Boolean(term.relatedCoreTermId))
    && legacy.supportTerms.every((term) => Boolean(term.relation))
    && legacy.daySpecs.every((day) => Array.isArray(day.expandedTermIds) && Array.isArray(day.reviewExpandedTermIds) && Array.isArray(day.skillExercises));
  if (complete) {
    const contract = source as MonthlyCurriculumContract;
    const errors = validateMonthlyCurriculum(contract);
    if (errors.length) throw new RangeError(`Current monthly plan is invalid: ${errors.join(" ")}`);
    return contract;
  }

  const calendar = buildMonthlyCalendar(legacy.month);
  const expectedCoreCount = calendar.effectiveDays
    .filter((_date, index) => monthlyDayKind(index + 1, calendar) === "new").length * 3;
  if (legacy.coreTerms.length !== expectedCoreCount || legacy.supportTerms.length !== expectedCoreCount * 9) {
    throw new RangeError("Legacy plan backfill requires a complete nine-supports-per-core pool; generate a corrected resource revision instead");
  }
  const cefrPrefix = legacy.cefr.toLocaleLowerCase("en");
  const coreById = new Map(legacy.coreTerms.map((term) => [term.id, term]));
  for (const [index, term] of legacy.coreTerms.entries()) {
    if (term.id !== `${cefrPrefix}-core-${index + 1}`) throw new RangeError("Core IDs do not prove the original ordered monthly allocation");
  }
  const supportsWithLinks = legacy.supportTerms.map((term, index) => {
    const expectedCoreId = `${cefrPrefix}-core-${Math.floor(index / 9) + 1}`;
    const supportOrdinal = Number(term.id.match(new RegExp(`^${cefrPrefix}-expanded-(\\d+)$`, "u"))?.[1]);
    if (supportOrdinal !== index + 1) throw new RangeError("Expanded IDs do not prove the original three-per-core order");
    if (term.relatedCoreTermId && term.relatedCoreTermId !== expectedCoreId) throw new RangeError(`Expanded term ${term.id} has an unexpected core link`);
    const linkedCore = coreById.get(term.relatedCoreTermId ?? expectedCoreId);
    if (!linkedCore || term.dayNumber !== linkedCore.dayNumber) throw new RangeError(`Expanded term ${term.id} is not on its linked core day`);
    const relation = term.relation ?? relationFromLegacySource(term.source);
    if (!relation) throw new RangeError(`Expanded term ${term.id} has no recoverable semantic relation`);
    return { ...term, relation, relatedCoreTermId: term.relatedCoreTermId ?? expectedCoreId };
  });
  const pool: MonthlyResourcePoolContract = {
    month: legacy.month,
    cefr: legacy.cefr,
    version: legacy.version,
    theme: legacy.theme,
    coreTerms: legacy.coreTerms.map(({ id, word, meaning, type, ipa, source, component }) => ({ id, word, meaning, type, ipa, source, component })),
    supportTerms: supportsWithLinks.map(({ id, word, meaning, type, relation, source, relatedCoreTermId }) => ({ id, word, meaning, type, relation, source, component: "expanded", relatedCoreTermId })),
    grammarTopics: legacy.grammarTopics,
    sounds: legacy.sounds
  };
  return planMonthlyResourcePool(pool);
}

export function validateMonthlyCurriculum(contract: MonthlyCurriculumContract): string[] {
  const calendar = buildMonthlyCalendar(contract.month);
  const errors: string[] = [];
  const contractHasReviewMetadata = contract.daySpecs.some((day) => day.reviewWeekKey !== undefined || day.reviewPrerequisiteLessonNumbers !== undefined);
  const dayKindForContract = (lessonNumber: number) => contractHasReviewMetadata
    ? monthlyDayKind(lessonNumber, calendar)
    : legacyMonthlyDayKind(lessonNumber, calendar.lessonCount);
  const expectedNewDays = calendar.effectiveDays.filter((_date, index) => dayKindForContract(index + 1) === "new").length;
  if (contract.coreTerms.length !== expectedNewDays * 3) errors.push(`Monthly plan needs exactly three core words for each of ${expectedNewDays} new lessons`);
  if (contract.supportTerms.length < contract.coreTerms.length * MONTHLY_MIN_SUPPORTS_PER_CORE || contract.supportTerms.length > contract.coreTerms.length * MONTHLY_MAX_SUPPORTS_PER_CORE) errors.push("Monthly plan needs 3-9 linked expanded terms per core word");
  for (const term of contract.supportTerms) {
    if (!isMonthlySupportLevelAllowed(contract.cefr, term)) errors.push(`Expanded term ${term.id} is CEFR ${term.cefr}; ${monthlySupportLevelRule(contract.cefr)}`);
  }
  const duplicateCore = duplicateOf(contract.coreTerms.map((term) => normalize(term.word)));
  if (duplicateCore) errors.push(`Duplicate core term: ${duplicateCore}`);
  if (duplicateOf(contract.coreTerms.map((term) => term.id))) errors.push("Core resource IDs must be unique");
  if (duplicateOf(contract.supportTerms.map((term) => term.id))) errors.push("Expanded resource IDs must be unique");
  if (contract.coreTerms.some((term) => !isSingleEnglishHeadword(term.word))) errors.push("Every core resource must be one standalone English headword");
  if (contract.supportTerms.some((term) => !isSingleEnglishHeadword(term.word) && !isNaturalLengthEnglishPhrase(term.word))) errors.push("Expanded resources must be English headwords or two-to-four-word expressions");
  if (contract.supportTerms.filter((term) => !isSingleEnglishHeadword(term.word)).length > maxMonthlyPhrasePlacements(contract.supportTerms.length)) errors.push("Expanded expressions exceed the 35% monthly limit");
  if (expandedRepeatCount(contract.supportTerms.map((term) => normalize(term.word))) > maxMonthlySupportRepeats(contract.supportTerms.length)) {
    errors.push("Expanded resources repeat more than 35% of the monthly total");
  }
  const coreWords = new Set(contract.coreTerms.map((term) => normalize(term.word)));
  for (const term of contract.supportTerms) {
    if (coreWords.has(normalize(term.word))) errors.push(`Expanded term ${term.id} duplicates a core term`);
  }
  if (contract.grammarTopics.length !== 2) errors.push("Monthly curriculum needs exactly two grammar topics");
  if (contract.sounds.length !== 4) errors.push("Monthly curriculum needs exactly four pronunciation targets");
  if (duplicateOf(contract.grammarTopics.flatMap((topic) => topic.steps.map((step) => step.id)))) errors.push("Grammar step IDs must be unique");
  for (const topic of contract.grammarTopics) {
    if (!topic.title.trim() || topic.steps.length !== 3 || duplicateOf(topic.steps.map((step) => step.focus.trim().toLocaleLowerCase("en-US"))) || topic.steps.some((step) => !step.focus.trim() || !step.formula.trim() || !step.usage.trim() || step.examples.length < 3 || step.examples.some((example) => !example.trim()))) {
      errors.push(`Grammar topic ${topic.id} needs a concrete form, use, step, and example`);
    }
  }
  if (duplicateOf(contract.sounds.map((sound) => sound.id))) errors.push("Pronunciation target IDs must be unique");
  if (duplicateOf(contract.sounds.map((sound) => sound.ipa.trim().toLocaleLowerCase("en-US")))) errors.push("Monthly resources need four distinct pronunciation targets");
  for (const sound of contract.sounds) {
    const soundIndex = contract.sounds.indexOf(sound);
    const requiredExampleCount = 9;
    if (!sound.ipa.trim().startsWith("/") || !sound.ipa.trim().endsWith("/") || !sound.label.trim() || sound.examples.length < requiredExampleCount || sound.examples.some((example) => !example.word.trim() || !example.ipa.trim())) {
      errors.push(`Pronunciation target ${sound.id} needs ${requiredExampleCount} real examples for its assigned lesson slots`);
    }
  }
  const coreById = new Set(contract.coreTerms.map((term) => term.id));
  const grammarStepIds = new Set(contract.grammarTopics.flatMap((topic) => topic.steps.map((step) => step.id)));
  const soundsById = new Map(contract.sounds.map((sound) => [sound.id, sound]));
  const dayByNumber = new Map(contract.daySpecs.map((day) => [day.lessonNumber, day]));
  const seenNew = new Set<string>();
  const coreByDay = new Map<number, string[]>();
  const coreTermById = new Map(contract.coreTerms.map((term) => [term.id, term]));
  const supportIdsByCore = new Map<string, string[]>();
  let pendingReviewCoreIds: string[] = [];
  let pendingReviewExpandedIds: string[] = [];
  for (const term of contract.coreTerms) {
    coreByDay.set(term.dayNumber, [...(coreByDay.get(term.dayNumber) ?? []), term.id]);
    if (term.source !== "core_registry" || term.component !== "core") errors.push(`Core term ${term.id} has invalid source or component`);
    if (!Number.isInteger(term.dayNumber) || term.dayNumber < 1 || term.dayNumber > calendar.lessonCount) errors.push(`Core term ${term.id} has an invalid day assignment`);
  }
  for (const term of contract.supportTerms) {
    if (term.component !== "expanded" || !Number.isInteger(term.dayNumber) || term.dayNumber < 1 || term.dayNumber > calendar.lessonCount) errors.push(`Expanded term ${term.id} has an invalid component or day assignment`);
    if (!dayByNumber.has(term.dayNumber)) errors.push(`Expanded term ${term.id} is not assigned to a lesson`);
    const linkedCore = coreTermById.get(term.relatedCoreTermId);
    if (!linkedCore) errors.push(`Expanded term ${term.id} references an unknown core term`);
    else if (linkedCore.dayNumber !== term.dayNumber) errors.push(`Expanded term ${term.id} is assigned to a different day from its linked core term`);
    supportIdsByCore.set(term.relatedCoreTermId, [...(supportIdsByCore.get(term.relatedCoreTermId) ?? []), term.id]);
  }
  for (const core of contract.coreTerms) {
    const related = contract.supportTerms.filter((term) => term.relatedCoreTermId === core.id);
    if (related.length < MONTHLY_MIN_SUPPORTS_PER_CORE || related.length > MONTHLY_MAX_SUPPORTS_PER_CORE) errors.push(`Core term ${core.id} needs 3-9 linked expanded terms`);
    if (!hasRequiredMonthlySupportRelations(core.type, related)) errors.push(`Core term ${core.id} needs ${describeRequiredSupportRelations(core.type)} supports`);
    if (related.filter(countsTowardCorePhraseLimit).length > 1) errors.push(`Core term ${core.id} may have at most one multi-word expanded expression`);
  }
  if (contract.daySpecs.length !== calendar.lessonCount) errors.push("Day specification count does not match monthly calendar");
  let newLessonOrdinal = 0;
  for (const [index, day] of contract.daySpecs.entries()) {
    if (day.lessonNumber !== index + 1 || day.date !== calendar.effectiveDays[index]) errors.push(`Lesson ${day.lessonNumber} does not match its calendar date`);
    const expectedKind = dayKindForContract(day.lessonNumber);
    if (day.kind !== expectedKind) errors.push(`Lesson ${day.lessonNumber} must be ${expectedKind}`);
    const expectedWeekKey = expectedKind === "review" ? mondayOfWeek(calendar.effectiveDays[index] ?? day.date) : null;
    const expectedCarryover = expectedKind === "review" && isFirstMonthFriday(day.date, calendar);
    const expectedPrerequisites = expectedKind === "review" && !expectedCarryover
      ? calendar.effectiveDays.slice(0, index).flatMap((date, priorIndex) =>
        mondayOfWeek(date) === expectedWeekKey && monthlyDayKind(priorIndex + 1, calendar) === "new" ? [priorIndex + 1] : [])
      : [];
    const expectedReviewGrammarIds = [...new Set(expectedPrerequisites.flatMap((lessonNumber) => {
      const prior = contract.daySpecs[lessonNumber - 1];
      return prior?.grammarStepIds ?? (prior ? [prior.grammarStepId] : []);
    }))];
    const expectedReviewSoundIds = [...new Set(expectedPrerequisites.flatMap((lessonNumber) => {
      const soundId = contract.daySpecs[lessonNumber - 1]?.soundId;
      return soundId ? [soundId] : [];
    }))];
    const expectedReviewExampleIds = [...new Set(expectedPrerequisites.flatMap((lessonNumber) => contract.daySpecs[lessonNumber - 1]?.pronunciationExampleIds ?? []))];
    const dayHasReviewMetadata = day.reviewWeekKey !== undefined || day.reviewFromPreviousMonth !== undefined
      || day.reviewGatesNextWeek !== undefined || day.reviewPrerequisiteLessonNumbers !== undefined
      || day.reviewGrammarStepIds !== undefined || day.reviewSoundIds !== undefined || day.reviewPronunciationExampleIds !== undefined;
    if (dayHasReviewMetadata) {
      if ((day.reviewFromPreviousMonth ?? false) !== expectedCarryover) errors.push(`Lesson ${day.lessonNumber} has an incorrect previous-month review marker`);
      if ((day.reviewWeekKey ?? null) !== expectedWeekKey) errors.push(`Lesson ${day.lessonNumber} has an incorrect review week key`);
      if (JSON.stringify(day.reviewPrerequisiteLessonNumbers ?? []) !== JSON.stringify(expectedPrerequisites)) errors.push(`Lesson ${day.lessonNumber} has an incorrect review prerequisite lesson list`);
      if ((day.reviewGatesNextWeek ?? false) !== (expectedKind === "review" && !expectedCarryover && expectedPrerequisites.length > 0)) errors.push(`Lesson ${day.lessonNumber} has an incorrect next-week review gate`);
    }
    if (dayHasReviewMetadata && day.kind === "review") {
      if (JSON.stringify(day.reviewGrammarStepIds ?? []) !== JSON.stringify(expectedReviewGrammarIds)) errors.push(`Lesson ${day.lessonNumber} has an incorrect weekly grammar review scope`);
      if (JSON.stringify(day.reviewSoundIds ?? []) !== JSON.stringify(expectedReviewSoundIds)) errors.push(`Lesson ${day.lessonNumber} has an incorrect weekly pronunciation review scope`);
      if (JSON.stringify(day.reviewPronunciationExampleIds ?? []) !== JSON.stringify(expectedReviewExampleIds)) errors.push(`Lesson ${day.lessonNumber} has an incorrect weekly pronunciation example scope`);
    }
    if (day.kind === "new") newLessonOrdinal += 1;
    const roadmapOrdinal = Math.max(1, newLessonOrdinal);
    const expectedGrammarIds = contract.grammarTopics.length === 2 ? expectedGrammarSteps(roadmapOrdinal, contract.grammarTopics).map((step) => step.id) : [];
    if (JSON.stringify(day.grammarStepIds ?? [day.grammarStepId]) !== JSON.stringify(expectedGrammarIds) || day.grammarStepId !== expectedGrammarIds[0]) errors.push(`Lesson ${day.lessonNumber} does not follow the monthly grammar progression`);
    const expectedSound = contract.sounds[pronunciationSoundIndex(roadmapOrdinal)];
    if (day.soundId !== expectedSound?.id || day.pronunciationSlot !== pronunciationSlotFor(roadmapOrdinal)) errors.push(`Lesson ${day.lessonNumber} does not follow the pronunciation roadmap`);
    if (!grammarStepIds.has(day.grammarStepId) || (day.grammarStepIds ?? [day.grammarStepId]).some((id) => !grammarStepIds.has(id))) errors.push(`Lesson ${day.lessonNumber} references an unlocked grammar step`);
    const sound = soundsById.get(day.soundId);
    if (!sound) errors.push(`Lesson ${day.lessonNumber} references an unlocked sound`);
    const soundExampleIds = new Set(sound?.examples.map((example) => example.id) ?? []);
    if (day.pronunciationExampleIds.some((id) => !soundExampleIds.has(id))) errors.push(`Lesson ${day.lessonNumber} references an unlocked sound example`);
    if (day.kind === "new" && day.coreTermIds.length !== 3) errors.push(`New lesson ${day.lessonNumber} needs three core terms`);
    if (day.kind === "new" && duplicateOf(day.coreTermIds)) errors.push(`New lesson ${day.lessonNumber} repeats a core term`);
    if (day.kind === "new" && (day.expandedTermIds.length < 3 * MONTHLY_MIN_SUPPORTS_PER_CORE || day.expandedTermIds.length > 3 * MONTHLY_MAX_SUPPORTS_PER_CORE)) errors.push(`New lesson ${day.lessonNumber} needs ${3 * MONTHLY_MIN_SUPPORTS_PER_CORE}-${3 * MONTHLY_MAX_SUPPORTS_PER_CORE} linked expanded terms`);
    if (day.kind === "new" && duplicateOf(day.expandedTermIds)) errors.push(`New lesson ${day.lessonNumber} repeats an expanded term`);
    if (day.kind === "review" && day.coreTermIds.length !== 0) errors.push(`Review lesson ${day.lessonNumber} cannot introduce core terms`);
    if (day.kind === "review" && day.expandedTermIds.length !== 0) errors.push(`Review lesson ${day.lessonNumber} cannot introduce expanded terms`);
    if (day.kind === "new" && JSON.stringify([...day.coreTermIds].sort()) !== JSON.stringify([...(coreByDay.get(day.lessonNumber) ?? [])].sort())) errors.push(`New lesson ${day.lessonNumber} does not match its core term day assignments`);
    if (day.kind === "new") {
      const expectedExpandedIds = day.coreTermIds.flatMap((id) => supportIdsByCore.get(id) ?? []);
      if (JSON.stringify([...day.expandedTermIds].sort()) !== JSON.stringify(expectedExpandedIds.sort())) errors.push(`New lesson ${day.lessonNumber} does not match its linked expanded term assignments`);
      validateSkillExercises(day, [...day.coreTermIds, ...day.expandedTermIds], errors);
    } else {
      validateSkillExercises(day, [...day.reviewTermIds, ...day.reviewExpandedTermIds], errors);
      if (JSON.stringify([...day.reviewTermIds].sort()) !== JSON.stringify([...pendingReviewCoreIds].sort())) errors.push(`Review lesson ${day.lessonNumber} must cover the core terms since the previous review`);
      if (JSON.stringify([...day.reviewExpandedTermIds].sort()) !== JSON.stringify([...pendingReviewExpandedIds].sort())) errors.push(`Review lesson ${day.lessonNumber} must cover the linked expanded terms since the previous review`);
      pendingReviewCoreIds = [];
      pendingReviewExpandedIds = [];
    }
    for (const termId of day.coreTermIds) {
      if (!coreById.has(termId)) errors.push(`Unknown core term ${termId}`);
      if (seenNew.has(termId)) errors.push(`Core term ${termId} is introduced twice`);
      seenNew.add(termId);
      pendingReviewCoreIds.push(termId);
      pendingReviewExpandedIds.push(...(supportIdsByCore.get(termId) ?? []));
    }
    for (const termId of day.reviewTermIds) if (!seenNew.has(termId)) errors.push(`Review term ${termId} was not introduced before lesson ${day.lessonNumber}`);
    for (const termId of day.reviewExpandedTermIds) if (!contract.supportTerms.some((term) => term.id === termId && seenNew.has(term.relatedCoreTermId))) errors.push(`Review expanded term ${termId} was not introduced before lesson ${day.lessonNumber}`);
    if (day.pronunciationExampleIds.length !== 3) errors.push(`Lesson ${day.lessonNumber} needs three pronunciation examples`);
  }
  if (seenNew.size !== contract.coreTerms.length) errors.push("Every core term must be introduced exactly once");
  const assignedGrammarSteps = new Set(contract.daySpecs.flatMap((day) => day.grammarStepIds ?? [day.grammarStepId]));
  for (const id of grammarStepIds) if (!assignedGrammarSteps.has(id)) errors.push(`Grammar step ${id} is not assigned to a lesson`);
  const assignedSounds = new Set(contract.daySpecs.map((day) => day.soundId));
  for (const id of soundsById.keys()) if (!assignedSounds.has(id)) errors.push(`Sound ${id} is not assigned to a lesson`);
  return errors;
}

export function recommendedPendingBatch(daySpecs: readonly MonthlyDaySpec[], statuses: ReadonlyMap<number, string>, limit = 10): number[] {
  return daySpecs.filter((day) => statuses.get(day.lessonNumber) === "pending").slice(0, limit).map((day) => day.lessonNumber);
}

export function monthlyScopeHash(contract: MonthlyCurriculumContract): string {
  const text = stableStringify({ version: contract.version, theme: contract.theme, coreTerms: contract.coreTerms, supportTerms: contract.supportTerms, grammarTopics: contract.grammarTopics, sounds: contract.sounds, daySpecs: contract.daySpecs });
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `monthly-${(hash >>> 0).toString(16)}`;
}

export function monthlyResourcePoolHash(pool: MonthlyResourcePoolContract): string {
  const text = stableStringify({ version: pool.version, theme: pool.theme, coreTerms: pool.coreTerms, supportTerms: pool.supportTerms, grammarTopics: pool.grammarTopics, sounds: pool.sounds });
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `monthly-pool-${(hash >>> 0).toString(16)}`;
}

/** Human-facing ordinal for a new lesson; review slots deliberately have none. */
export function monthlyNewLessonOrdinal(lessonNumber: number, calendar: MonthlyCalendar): number | null {
  if (monthlyDayKind(lessonNumber, calendar) !== "new") return null;
  let count = 0;
  for (let slot = 1; slot <= lessonNumber; slot += 1) if (monthlyDayKind(slot, calendar) === "new") count += 1;
  return count;
}

/** Review slots follow actual Fridays in the effective monthly calendar. */
export function monthlyDayKind(lessonNumber: number, calendar: MonthlyCalendar): "new" | "review" {
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > calendar.lessonCount) {
    throw new RangeError("Lesson number must be inside the monthly schedule");
  }
  const date = calendar.effectiveDays[lessonNumber - 1];
  return date && new Date(`${date}T12:00:00Z`).getUTCDay() === 5 ? "review" : "new";
}

function legacyMonthlyDayKind(lessonNumber: number, lessonCount: number): "new" | "review" {
  if (lessonNumber <= 15) return lessonNumber % 5 === 0 ? "review" : "new";
  return lessonCount >= 20 && lessonNumber === lessonCount ? "review" : "new";
}

function mondayOfWeek(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function isFirstMonthFriday(date: string, calendar: MonthlyCalendar): boolean {
  const first = new Date(`${calendar.month}-01T12:00:00Z`);
  return date === calendar.effectiveDays[0] && first.getUTCDay() === 5;
}

function expectedGrammarSteps(ordinal: number, topics: readonly GrammarTopic[]): GrammarStep[] {
  if (ordinal <= 6) return [topics[0]!.steps[Math.min(2, Math.floor((ordinal - 1) / 2))]!];
  if (ordinal <= 12) return [topics[1]!.steps[Math.min(2, Math.floor((ordinal - 7) / 2))]!];
  if (ordinal <= 16) return [topics[0]!.steps[2]!, topics[1]!.steps[2]!];
  return [topics[(ordinal - 16) % 2]!.steps[2]!];
}

function pronunciationSoundIndex(ordinal: number): number {
  return ordinal <= 12 ? Math.floor((ordinal - 1) / 3) : (ordinal - 13) % 4;
}

function pronunciationSlotFor(ordinal: number): NonNullable<MonthlyDaySpec["pronunciationSlot"]> {
  if (ordinal <= 12) return (["P1", "P2", "P3", "P4"] as const)[Math.ceil(ordinal / 3) - 1]!;
  if (ordinal <= 15) return (["K1", "K2", "K3"] as const)[ordinal - 13]!;
  return (["M1", "M2", "M3"] as const)[ordinal - 16]!;
}

function duplicateOf(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function expandedRepeatCount(values: readonly string[]): number {
  return values.length - new Set(values).size;
}

const MONTHLY_EXERCISE_FOCI: Record<MonthlyExerciseCode, { lesson: string; review: string }> = {
  listening: { lesson: "Nghe và nhận diện thông tin gắn với tài nguyên ngày học.", review: "Nghe lại và nhận diện tài nguyên đã học trong tuần." },
  reading: { lesson: "Đọc và tìm thông tin dùng các tài nguyên ngày học.", review: "Đọc lại và tìm thông tin trong nội dung tuần đã học." },
  writing: { lesson: "Dùng tài nguyên ngày học trong một phản hồi viết ngắn.", review: "Ôn cách dùng tài nguyên tuần qua một phản hồi viết ngắn." },
  word_class: { lesson: "Nhận diện từ loại của các từ cốt lõi ngày học.", review: "Ôn từ loại của các từ cốt lõi trong tuần." },
  word_use: { lesson: "Chọn cách dùng phù hợp cho từ và nhóm từ đã học.", review: "Ôn cách dùng các từ và nhóm từ đã học trong tuần." },
  speaking: { lesson: "Dùng tài nguyên ngày học trong phản hồi nói ngắn.", review: "Ôn tài nguyên tuần qua phản hồi nói ngắn." }
};

function buildMonthlySkillExercises(kind: "new" | "review", coreIds: string[], expandedIds: string[]): MonthlySkillExercisePlan[] {
  const resourceIds = [...coreIds, ...expandedIds];
  return MONTHLY_EXERCISE_CODES.map((exerciseCode) => ({
    exerciseCode,
    focus: MONTHLY_EXERCISE_FOCI[exerciseCode][kind === "new" ? "lesson" : "review"],
    resourceIds: [...resourceIds]
  }));
}

function validateSkillExercises(day: MonthlyDaySpec, expectedResourceIds: readonly string[], errors: string[]): void {
  // Plans stored before the skillExercises DaySpec field have no array here.
  // Report it instead of crashing so the caller can answer with a plan error.
  if (!Array.isArray(day.skillExercises)) {
    errors.push(`Lesson ${day.lessonNumber} has no skill exercise plan; the stored plan predates skill exercises and must be re-planned`);
    return;
  }
  const exerciseCodes = day.skillExercises.map((item) => item.exerciseCode);
  if (exerciseCodes.length !== MONTHLY_EXERCISE_CODES.length || duplicateOf(exerciseCodes)
    || MONTHLY_EXERCISE_CODES.some((code) => !exerciseCodes.includes(code))) {
    errors.push(`Lesson ${day.lessonNumber} needs exactly one plan item for each of the six skill exercise codes`);
  }
  const allowed = new Set(expectedResourceIds);
  for (const exercise of day.skillExercises) {
    if (!exercise.focus.trim()) errors.push(`Lesson ${day.lessonNumber} has an empty ${exercise.exerciseCode} exercise focus`);
    if (!exercise.resourceIds.length || exercise.resourceIds.some((id) => !allowed.has(id))) {
      errors.push(`Lesson ${day.lessonNumber} ${exercise.exerciseCode} exercise references resources outside its allocation`);
    }
  }
}

function relationFromLegacySource(source: SupportTerm["source"]): MonthlySupportRelation | undefined {
  switch (source) {
    case "example": return "collocation";
    case "family": return "word_family";
    case "synonym": return "synonym";
    case "antonym": return "antonym";
    case "group": return "umbrella";
    case "manual": return undefined;
  }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function isSingleEnglishHeadword(value: string): boolean {
  return /^\p{L}+(?:[-'’]\p{L}+)*$/u.test(value.trim());
}

function isNaturalLengthEnglishPhrase(value: string): boolean {
  const words = value.trim().split(/\s+/u);
  return words.length >= 2 && words.length <= 4 && words.every(isSingleEnglishHeadword);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
