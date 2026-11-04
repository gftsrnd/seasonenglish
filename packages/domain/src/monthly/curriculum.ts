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
  source: "example" | "family" | "synonym" | "antonym" | "group" | "manual";
  component: "expanded";
  dayNumber: number;
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
  reviewTermIds: string[];
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
  const newLessonCount = calendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, calendar.lessonCount) === "new").length;
  void cefr;
  return {
    vocabularyCount: newLessonCount * 3,
    // Every new lesson needs a usable relation set: three umbrella terms,
    // four synonyms/antonyms, and two word-family terms. These belong to the
    // lesson day, rather than being a thin add-on to an individual core word.
    expandedVocabularyCount: newLessonCount * 9,
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
  const newDays = calendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, calendar.lessonCount) === "new");
  const expectedCoreCount = newDays.length * 3;
  if (input.coreTerms.length !== expectedCoreCount) throw new RangeError(`Expected ${expectedCoreCount} core terms for ${input.month}`);
  if (input.coreTerms.some((term) => !isSingleEnglishHeadword(term.word))) throw new RangeError("Every core resource must be one standalone English headword");
  const duplicateCore = duplicateOf(input.coreTerms.map((term) => normalize(term.word)));
  if (duplicateCore) throw new RangeError(`Duplicate core term: ${duplicateCore}`);
  if (input.supportTerms.some((term) => !isSingleEnglishHeadword(term.word) && !isNaturalLengthEnglishPhrase(term.word))) throw new RangeError("Expanded resources must be English headwords or two-to-four-word expressions");
  if (input.supportTerms.filter((term) => !isSingleEnglishHeadword(term.word)).length > Math.floor(input.supportTerms.length * 0.25)) throw new RangeError("Expanded expressions exceed the 25% monthly limit");
  if (expandedRepeatCount(input.supportTerms.map((term) => normalize(term.word))) > Math.floor(input.supportTerms.length * 0.2)) {
    throw new RangeError("Expanded resources repeat more than 20% of the monthly total");
  }
  if (input.supportTerms.some((term) => input.coreTerms.some((core) => normalize(core.word) === normalize(term.word)))) throw new RangeError("Support term duplicates a core term");
  if (input.grammarTopics.length !== 2) throw new RangeError("Monthly curriculum needs exactly two grammar topics");
  if (input.sounds.length !== 4) throw new RangeError("Monthly curriculum needs exactly four pronunciation targets");
  if (input.supportTerms.some((term) => !Number.isInteger(term.dayNumber) || term.dayNumber < 1 || term.dayNumber > calendar.lessonCount)) throw new RangeError("Every expanded term must belong to a valid monthly day");
  if (input.grammarTopics.some((topic) => topic.steps.length !== 3)) throw new RangeError("Every grammar topic needs exactly three ordered steps");

  let coreCursor = 0;
  let reviewCursor = 0;
  let newLessonOrdinal = 0;
  const introduced: string[] = [];
  const daySpecs = calendar.effectiveDays.map((date, index) => {
    const lessonNumber = index + 1;
    const kind = monthlyDayKind(lessonNumber, calendar.lessonCount);
    if (kind === "new") newLessonOrdinal += 1;
    if (newLessonOrdinal > 18) throw new RangeError("Monthly pronunciation plan supports at most 18 new lesson slots");
    const coreTermIds = kind === "new" ? input.coreTerms.slice(coreCursor, coreCursor + 3).map((term) => term.id) : [];
    coreCursor += coreTermIds.length;
    introduced.push(...coreTermIds);
    const reviewTermIds = kind === "review" ? chooseReviewTerms(introduced, reviewCursor) : [];
    if (kind === "review") reviewCursor += reviewTermIds.length;
    const assignmentOrdinal = Math.max(1, newLessonOrdinal);
    const grammarSteps = assignmentOrdinal <= 6
      ? [input.grammarTopics[0]!.steps[Math.min(2, Math.floor((assignmentOrdinal - 1) / 2))]!]
      : assignmentOrdinal <= 12
        ? [input.grammarTopics[1]!.steps[Math.min(2, Math.floor((assignmentOrdinal - 7) / 2))]!]
        : assignmentOrdinal <= 15
          ? [input.grammarTopics[0]!.steps[2]!, input.grammarTopics[1]!.steps[2]!]
          : [input.grammarTopics[(assignmentOrdinal - 16) % 2]!.steps[2]!];
    const step = grammarSteps[0]!;
    const soundIndex = assignmentOrdinal <= 12 ? Math.floor((assignmentOrdinal - 1) / 3) : (assignmentOrdinal - 13) % 4;
    const sound = input.sounds[soundIndex]!;
    const pronunciationSlot: NonNullable<MonthlyDaySpec["pronunciationSlot"]> = assignmentOrdinal <= 12
      ? (["P1", "P2", "P3", "P4"] as const)[Math.ceil(assignmentOrdinal / 3) - 1]!
      : assignmentOrdinal <= 15
        ? (["K1", "K2", "K3"] as const)[assignmentOrdinal - 13]!
        : (["M1", "M2", "M3"] as const)[assignmentOrdinal - 16]!;
    const exampleIds = sound.examples.slice(0, 3).map((example) => example.id);
    if (exampleIds.length !== 3) throw new RangeError(`Sound ${sound.id} needs three unused examples for lesson ${lessonNumber}`);
    return { lessonNumber, date, kind, coreTermIds, reviewTermIds, grammarStepId: step.id, grammarStepIds: grammarSteps.map((grammarStep) => grammarStep.id), soundId: sound.id, pronunciationSlot, pronunciationExampleIds: exampleIds };
  });

  const newLessonNumbers = calendar.effectiveDays.flatMap((_date, index) => monthlyDayKind(index + 1, calendar.lessonCount) === "new" ? [index + 1] : []);
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
  const newDays = calendar.effectiveDays.flatMap((_date, index) => monthlyDayKind(index + 1, calendar.lessonCount) === "new" ? [index + 1] : []);
  const expectedCoreCount = newDays.length * 3;
  const errors: string[] = [];
  if (pool.coreTerms.length !== expectedCoreCount) errors.push(`Expected ${expectedCoreCount} core terms, got ${pool.coreTerms.length}.`);
  if (pool.supportTerms.length !== expectedCoreCount * 3) errors.push(`Expected ${expectedCoreCount * 3} expanded terms, got ${pool.supportTerms.length}.`);
  const normalizedCore = pool.coreTerms.map((term) => normalize(term.word));
  if (pool.coreTerms.some((term) => !isSingleEnglishHeadword(term.word))) errors.push("Every core resource must be one standalone English headword.");
  if (duplicateOf(normalizedCore)) errors.push(`Duplicate core term: ${duplicateOf(normalizedCore)}.`);
  if (duplicateOf(pool.coreTerms.map((term) => term.id))) errors.push("Core resource IDs must be unique.");
  if (duplicateOf(pool.supportTerms.map((term) => term.id))) errors.push("Expanded resource IDs must be unique.");
  const coreWords = new Set(normalizedCore);
  const phraseSupports = pool.supportTerms.filter((term) => !isSingleEnglishHeadword(term.word));
  if (pool.supportTerms.some((term) => !isSingleEnglishHeadword(term.word) && !isNaturalLengthEnglishPhrase(term.word))) errors.push("Expanded resources must be English headwords or two-to-four-word expressions.");
  if (phraseSupports.length > Math.floor(pool.supportTerms.length * 0.25)) errors.push("Expanded expressions exceed the 25% monthly limit.");
  for (const support of pool.supportTerms) {
    if (!pool.coreTerms.some((core) => core.id === support.relatedCoreTermId)) errors.push(`Expanded term ${support.id} references an unknown core resource.`);
    if (coreWords.has(normalize(support.word))) errors.push(`Expanded term ${support.id} duplicates a core term.`);
  }
  const supportCounts = new Map<string, number>();
  const phraseCountByCore = new Map<string, number>();
  for (const support of pool.supportTerms) supportCounts.set(support.relatedCoreTermId, (supportCounts.get(support.relatedCoreTermId) ?? 0) + 1);
  for (const support of phraseSupports) phraseCountByCore.set(support.relatedCoreTermId, (phraseCountByCore.get(support.relatedCoreTermId) ?? 0) + 1);
  for (const core of pool.coreTerms) {
    if (supportCounts.get(core.id) !== 3) errors.push(`Core term ${core.id} must have exactly three related expanded terms.`);
    if ((phraseCountByCore.get(core.id) ?? 0) > 1) errors.push(`Core term ${core.id} may have at most one multi-word expanded expression.`);
  }
  if (expandedRepeatCount(pool.supportTerms.map((term) => normalize(term.word))) > Math.floor(pool.supportTerms.length * 0.2)) {
    errors.push("Expanded resources repeat more than 20% of the monthly total.");
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
    source: term.source,
    dayNumber: dayByCoreId.get(term.relatedCoreTermId)!
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

export function validateMonthlyCurriculum(contract: MonthlyCurriculumContract): string[] {
  const calendar = buildMonthlyCalendar(contract.month);
  const errors: string[] = [];
  const duplicateCore = duplicateOf(contract.coreTerms.map((term) => normalize(term.word)));
  if (duplicateCore) errors.push(`Duplicate core term: ${duplicateCore}`);
  if (contract.coreTerms.some((term) => !isSingleEnglishHeadword(term.word))) errors.push("Every core resource must be one standalone English headword");
  if (contract.supportTerms.some((term) => !isSingleEnglishHeadword(term.word) && !isNaturalLengthEnglishPhrase(term.word))) errors.push("Expanded resources must be English headwords or two-to-four-word expressions");
  if (contract.supportTerms.filter((term) => !isSingleEnglishHeadword(term.word)).length > Math.floor(contract.supportTerms.length * 0.25)) errors.push("Expanded expressions exceed the 25% monthly limit");
  if (expandedRepeatCount(contract.supportTerms.map((term) => normalize(term.word))) > Math.floor(contract.supportTerms.length * 0.2)) {
    errors.push("Expanded resources repeat more than 20% of the monthly total");
  }
  const coreWords = new Set(contract.coreTerms.map((term) => normalize(term.word)));
  for (const term of contract.supportTerms) {
    if (coreWords.has(normalize(term.word))) errors.push(`Expanded term ${term.id} duplicates a core term`);
  }
  if (contract.grammarTopics.length !== 2) errors.push("Monthly curriculum needs exactly two grammar topics");
  if (contract.sounds.length !== 4) errors.push("Monthly curriculum needs exactly four pronunciation targets");
  for (const topic of contract.grammarTopics) {
    if (!topic.title.trim() || topic.steps.length === 0 || topic.steps.some((step) => !step.focus.trim() || !step.formula.trim() || !step.usage.trim() || step.examples.length === 0 || step.examples.some((example) => !example.trim()))) {
      errors.push(`Grammar topic ${topic.id} needs a concrete form, use, step, and example`);
    }
  }
  const coreById = new Set(contract.coreTerms.map((term) => term.id));
  const grammarStepIds = new Set(contract.grammarTopics.flatMap((topic) => topic.steps.map((step) => step.id)));
  const soundsById = new Map(contract.sounds.map((sound) => [sound.id, sound]));
  const dayByNumber = new Map(contract.daySpecs.map((day) => [day.lessonNumber, day]));
  const seenNew = new Set<string>();
  const coreByDay = new Map<number, string[]>();
  for (const term of contract.coreTerms) {
    coreByDay.set(term.dayNumber, [...(coreByDay.get(term.dayNumber) ?? []), term.id]);
    if (term.source !== "core_registry" || term.component !== "core") errors.push(`Core term ${term.id} has invalid source or component`);
    if (!Number.isInteger(term.dayNumber) || term.dayNumber < 1 || term.dayNumber > calendar.lessonCount) errors.push(`Core term ${term.id} has an invalid day assignment`);
  }
  for (const term of contract.supportTerms) {
    if (term.component !== "expanded" || !Number.isInteger(term.dayNumber) || term.dayNumber < 1 || term.dayNumber > calendar.lessonCount) errors.push(`Expanded term ${term.id} has an invalid component or day assignment`);
    if (!dayByNumber.has(term.dayNumber)) errors.push(`Expanded term ${term.id} is not assigned to a lesson`);
  }
  if (contract.daySpecs.length !== calendar.lessonCount) errors.push("Day specification count does not match monthly calendar");
  for (const [index, day] of contract.daySpecs.entries()) {
    if (day.lessonNumber !== index + 1 || day.date !== calendar.effectiveDays[index]) errors.push(`Lesson ${day.lessonNumber} does not match its calendar date`);
    const expectedKind = monthlyDayKind(day.lessonNumber, calendar.lessonCount);
    if (day.kind !== expectedKind) errors.push(`Lesson ${day.lessonNumber} must be ${expectedKind}`);
    if (!grammarStepIds.has(day.grammarStepId) || (day.grammarStepIds ?? [day.grammarStepId]).some((id) => !grammarStepIds.has(id))) errors.push(`Lesson ${day.lessonNumber} references an unlocked grammar step`);
    const sound = soundsById.get(day.soundId);
    if (!sound) errors.push(`Lesson ${day.lessonNumber} references an unlocked sound`);
    const soundExampleIds = new Set(sound?.examples.map((example) => example.id) ?? []);
    if (day.pronunciationExampleIds.some((id) => !soundExampleIds.has(id))) errors.push(`Lesson ${day.lessonNumber} references an unlocked sound example`);
    if (day.kind === "new" && day.coreTermIds.length !== 3) errors.push(`New lesson ${day.lessonNumber} needs three core terms`);
    if (day.kind === "review" && day.coreTermIds.length !== 0) errors.push(`Review lesson ${day.lessonNumber} cannot introduce core terms`);
    if (day.kind === "new" && JSON.stringify([...day.coreTermIds].sort()) !== JSON.stringify([...(coreByDay.get(day.lessonNumber) ?? [])].sort())) errors.push(`New lesson ${day.lessonNumber} does not match its core term day assignments`);
    for (const termId of day.coreTermIds) {
      if (!coreById.has(termId)) errors.push(`Unknown core term ${termId}`);
      if (seenNew.has(termId)) errors.push(`Core term ${termId} is introduced twice`);
      seenNew.add(termId);
    }
    for (const termId of day.reviewTermIds) if (!seenNew.has(termId)) errors.push(`Review term ${termId} was not introduced before lesson ${day.lessonNumber}`);
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
export function monthlyNewLessonOrdinal(lessonNumber: number, lessonCount: number): number | null {
  if (monthlyDayKind(lessonNumber, lessonCount) !== "new") return null;
  let count = 0;
  for (let slot = 1; slot <= lessonNumber; slot += 1) if (monthlyDayKind(slot, lessonCount) === "new") count += 1;
  return count;
}

function chooseReviewTerms(introduced: readonly string[], cursor: number): string[] {
  if (introduced.length < 3) throw new RangeError("Review day requires three previously introduced core terms");
  return Array.from({ length: 3 }, (_, index) => introduced[(cursor + index) % introduced.length]!);
}

/**
 * The month sequence is deliberately positional. It never infers a review
 * from a weekday, so persisted DaySpecs and the pre-generation calendar agree.
 */
export function monthlyDayKind(lessonNumber: number, lessonCount: number): "new" | "review" {
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > lessonCount) {
    throw new RangeError("Lesson number must be inside the monthly schedule");
  }
  if (lessonNumber <= 15) return lessonNumber % 5 === 0 ? "review" : "new";
  // After the first three five-slot cycles, the final available slot is the
  // fourth review. That gives 16/17/18 new lessons for 20/21/22 slots.
  if (lessonCount >= 20) return lessonNumber === lessonCount ? "review" : "new";
  return "new";
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
