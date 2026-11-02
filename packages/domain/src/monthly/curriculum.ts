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
  soundId: string;
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
  const newLessonCount = calendar.effectiveDays.filter((date) => !isFriday(date)).length;
  const levelIndex = ["A1", "A2", "B1", "B2", "C1"].indexOf(cefr);
  const advancedOffset = Math.max(0, levelIndex - 1);
  const weeklyBlocks = Math.max(1, Math.ceil(calendar.lessonCount / 5));
  return {
    vocabularyCount: newLessonCount * 3,
    // Every new lesson needs a usable relation set: three umbrella terms,
    // four synonyms/antonyms, and two word-family terms. These belong to the
    // lesson day, rather than being a thin add-on to an individual core word.
    expandedVocabularyCount: newLessonCount * 9,
    grammarTopicCount: weeklyBlocks + advancedOffset,
    pronunciationSoundCount: weeklyBlocks + Math.floor(advancedOffset / 2)
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
  const newDays = calendar.effectiveDays.filter((date) => !isFriday(date));
  const expectedCoreCount = newDays.length * 3;
  if (input.coreTerms.length !== expectedCoreCount) throw new RangeError(`Expected ${expectedCoreCount} core terms for ${input.month}`);
  const duplicateCore = duplicateOf(input.coreTerms.map((term) => normalize(term.word)));
  if (duplicateCore) throw new RangeError(`Duplicate core term: ${duplicateCore}`);
  const duplicateSupport = duplicateOf(input.supportTerms.map((term) => normalize(term.word)));
  if (duplicateSupport) throw new RangeError(`Duplicate support term: ${duplicateSupport}`);
  if (input.supportTerms.some((term) => input.coreTerms.some((core) => normalize(core.word) === normalize(term.word)))) throw new RangeError("Support term duplicates a core term");
  if (input.grammarTopics.length === 0) throw new RangeError("Monthly curriculum needs at least one grammar topic");
  if (input.sounds.length === 0) throw new RangeError("Monthly curriculum needs at least one sound");
  if (input.supportTerms.some((term) => !Number.isInteger(term.dayNumber) || term.dayNumber < 1 || term.dayNumber > calendar.lessonCount)) throw new RangeError("Every expanded term must belong to a valid monthly day");
  if (input.grammarTopics.some((topic) => topic.steps.length === 0)) throw new RangeError("Every grammar topic needs a concrete step");

  const nextExample = input.sounds.map(() => 0);
  let coreCursor = 0;
  let reviewCursor = 0;
  const introduced: string[] = [];
  const daySpecs = calendar.effectiveDays.map((date, index) => {
    const lessonNumber = index + 1;
    const kind = isFriday(date) ? "review" as const : "new" as const;
    const coreTermIds = kind === "new" ? input.coreTerms.slice(coreCursor, coreCursor + 3).map((term) => term.id) : [];
    coreCursor += coreTermIds.length;
    introduced.push(...coreTermIds);
    const reviewTermIds = kind === "review" ? chooseReviewTerms(introduced, reviewCursor) : [];
    if (kind === "review") reviewCursor += reviewTermIds.length;
    const topic = input.grammarTopics[Math.min(input.grammarTopics.length - 1, Math.floor((index * input.grammarTopics.length) / calendar.lessonCount))]!;
    const step = topic.steps[Math.min(topic.steps.length - 1, Math.floor(((index * input.grammarTopics.length) % calendar.lessonCount) * topic.steps.length / Math.max(1, Math.ceil(calendar.lessonCount / input.grammarTopics.length))))] ?? topic.steps.at(-1)!;
    const soundIndex = index % input.sounds.length;
    const sound = input.sounds[soundIndex]!;
    const exampleStart = nextExample[soundIndex] ?? 0;
    const exampleIds = sound.examples.slice(exampleStart, exampleStart + 3).map((example) => example.id);
    nextExample[soundIndex] = exampleStart + exampleIds.length;
    if (exampleIds.length !== 3) throw new RangeError(`Sound ${sound.id} needs three unused examples for lesson ${lessonNumber}`);
    return { lessonNumber, date, kind, coreTermIds, reviewTermIds, grammarStepId: step.id, soundId: sound.id, pronunciationExampleIds: exampleIds };
  });

  const newLessonNumbers = calendar.effectiveDays.flatMap((date, index) => isFriday(date) ? [] : [index + 1]);
  const coreTerms: CoreTerm[] = input.coreTerms.map((term, index) => ({
    ...term,
    source: "core_registry",
    component: "core",
    dayNumber: newLessonNumbers[Math.floor(index / 3)]!
  }));
  const supportTerms: SupportTerm[] = input.supportTerms.map((term) => ({ ...term, component: "expanded" }));
  return { ...input, coreTerms, supportTerms, version: input.theme.version, daySpecs };
}

export function validateMonthlyCurriculum(contract: MonthlyCurriculumContract): string[] {
  const calendar = buildMonthlyCalendar(contract.month);
  const errors: string[] = [];
  const duplicateCore = duplicateOf(contract.coreTerms.map((term) => normalize(term.word)));
  if (duplicateCore) errors.push(`Duplicate core term: ${duplicateCore}`);
  const duplicateSupport = duplicateOf(contract.supportTerms.map((term) => normalize(term.word)));
  if (duplicateSupport) errors.push(`Duplicate expanded term: ${duplicateSupport}`);
  const coreWords = new Set(contract.coreTerms.map((term) => normalize(term.word)));
  for (const term of contract.supportTerms) {
    if (coreWords.has(normalize(term.word))) errors.push(`Expanded term ${term.id} duplicates a core term`);
  }
  if (contract.grammarTopics.length === 0) errors.push("Monthly curriculum needs at least one grammar topic");
  if (contract.sounds.length === 0) errors.push("Monthly curriculum needs at least one sound");
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
    if (isFriday(day.date) && day.kind !== "review") errors.push(`Friday lesson ${day.lessonNumber} must be review`);
    if (!isFriday(day.date) && day.kind !== "new") errors.push(`Non-Friday lesson ${day.lessonNumber} must introduce new terms`);
    if (!grammarStepIds.has(day.grammarStepId)) errors.push(`Lesson ${day.lessonNumber} references an unlocked grammar step`);
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
  const assignedGrammarSteps = new Set(contract.daySpecs.map((day) => day.grammarStepId));
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

function chooseReviewTerms(introduced: readonly string[], cursor: number): string[] {
  if (introduced.length < 3) throw new RangeError("Review day requires three previously introduced core terms");
  return Array.from({ length: 3 }, (_, index) => introduced[(cursor + index) % introduced.length]!);
}

function isFriday(date: string): boolean {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() === 5;
}

function duplicateOf(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

