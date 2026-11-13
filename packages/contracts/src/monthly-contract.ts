import type { CefrLevel } from "./domain-contract.js";

export interface MonthlyGrammarDayPlan {
  code: string;
  objective: string;
  mode: "recognize" | "apply" | "contrast" | "read_aloud" | "voice_note" | "personalize" | "shadow" | "mock";
  milestoneIds: string[];
  recallMilestoneIds: string[];
  /** Grammar roadmap stage of the day (docs/grammar-roadmap.md); only on roadmap months. */
  stage?: "identify" | "structure" | "variation" | "meaning_use" | "common_errors" | "application" | "link" | "mixed_practice" | "workplace_task" | "error_review" | "long_context" | "mock_test";
}
export interface MonthlyPronunciationDayPlan {
  slot: string;
  stage: "recognize" | "discriminate" | "sentence" | "contrast" | "read_aloud" | "voice_note" | "personalize" | "shadow" | "mock";
  objective: string;
  targetIds: string[];
  exampleIds: string[];
  exampleSet?: number;
  requiredPositions?: Array<{ soundId: string; exampleId: string }>;
}

export const MONTH_BRIEF_STATUSES = ["missing", "draft", "approved"] as const;
export type MonthBriefStatus = (typeof MONTH_BRIEF_STATUSES)[number];

export const MONTH_FRAMEWORK_STATUSES = ["missing", "draft", "generating", "approved", "failed"] as const;
export type MonthFrameworkStatus = (typeof MONTH_FRAMEWORK_STATUSES)[number];

export const MONTH_LESSON_STATUSES = ["pending", "generating", "draft", "approved", "failed"] as const;
export type MonthLessonStatus = (typeof MONTH_LESSON_STATUSES)[number];

export interface SharedMonthBriefView {
  month: string;
  title: string;
  brief: string;
  context: string;
  communicationGoal: string;
  version: number;
  status: Exclude<MonthBriefStatus, "missing">;
}

export interface MonthlyQualityFindingView {
  severity: "severe" | "light";
  code: string;
  message: string;
  dayNumber?: number;
  component?: string;
}

export interface OperatorAcknowledgementView {
  actorId: string;
  acknowledgedAt: string;
  findingCodes: string[];
  /**
   * 13/11: the day was approved while severe findings remained ("Vẫn duyệt").
   * `severeFindingCodes` lists the severe codes the Operator accepted.
   */
  severeOverride?: boolean;
  severeFindingCodes?: string[];
}

export interface MonthLessonCellView {
  lessonNumber: number;
  lessonDate: string;
  kind: "new" | "review";
  status: MonthLessonStatus;
  scopeHash: string;
  locked: boolean;
  correctionCount: number;
  /** Published/draft lesson data is exposed only in the operator monthly overview for preview. */
  content?: { title?: string; parts?: Array<{ code?: string; title?: string; content?: Record<string, unknown> }> };
  quality: {
    severe: MonthlyQualityFindingView[];
    light: MonthlyQualityFindingView[];
    acknowledged?: OperatorAcknowledgementView;
  };
  /**
   * Last AI generation that failed the quality gate after every repair round
   * (December 2026 N3). Shown to the Operator for diagnosis only: it is never
   * the day's draft, never replaces one, and can never be approved.
   */
  generationFailure?: MonthLessonGenerationFailureView;
}

export interface MonthLessonGenerationFailureView {
  failedAt: string;
  attempts: number;
  report: { severe: MonthlyQualityFindingView[]; light: MonthlyQualityFindingView[] };
  /** The final failing candidate as the model produced it (after deterministic plan fields). */
  candidate: { title?: string; parts?: Array<{ code?: string; title?: string; content?: Record<string, unknown> }> } | null;
}

export interface MonthFrameworkView {
  id: string;
  cefr: CefrLevel;
  version: number;
  status: Exclude<MonthFrameworkStatus, "missing">;
  scopeHash: string;
  publication?: { ready: boolean; publishedOn: string | null };
  resources?: {
    coreTerms: Array<{ id: string; word: string; meaning: string; type: string; ipa: string; source: "core_registry"; component: "core"; dayNumber?: number; /** Frozen illustration URL once resources are approved. */ imageUrl?: string; /** The core word's own CEFR label from generation; absent on older pools. */ cefr?: CefrLevel; /** L-042, B1–C1 only: optional audited slang ("Khẩu ngữ") / poetic ("Văn chương") synonyms; absent when none exists. Items stored before 12/11 have no ipa/usage/source (their "poetic" meant formal register). */ registerTerms?: Array<{ kind: "slang" | "poetic"; word: string; definition: string; register: string; ipa?: string; usage?: string; source?: string }> }>;
    supportTerms: Array<{ id: string; word: string; meaning: string; type: string; relation: "umbrella" | "synonym" | "antonym" | "word_family" | "collocation"; source: "example" | "family" | "synonym" | "antonym" | "group" | "manual"; component: "expanded"; dayNumber?: number; relatedCoreTermId?: string; /** CEFR level of the support word (same as the framework level or ±1); absent on pools stored before VH-R33. */ cefr?: CefrLevel }>;
    grammarTopics: Array<{ id: string; title: string; steps: Array<{ id: string; focus: string; formula: string; usage: string; examples: string[]; dailyObjectives?: string[] | undefined }>; catalogId?: string }>;
    sounds: Array<{ id: string; ipa: string; label: string; examples: Array<{ id: string; word: string; ipa: string }>; /** Roadmap catalog item; absent on older pools. */ catalogId?: string }>;
    carryoverReviews?: Array<{ lessonNumber: number; day: MonthDayPlanView; coreTerms: NonNullable<MonthFrameworkView["resources"]>["coreTerms"]; supportTerms: NonNullable<MonthFrameworkView["resources"]>["supportTerms"]; grammarTopics: NonNullable<MonthFrameworkView["resources"]>["grammarTopics"]; sounds: NonNullable<MonthFrameworkView["resources"]>["sounds"] }>;
    /** Draft pools expose no day allocation. Approved frameworks project saved DaySpecs here for review. */
    roadmap?: {
      allocated: boolean;
      grammarSteps: Array<{ stepId: string; lessonNumbers: number[] }>;
      sounds: Array<{ soundId: string; lessonNumbers: number[]; slots: string[] }>;
      days: MonthDayPlanView[];
    };
  };
  lessons: MonthLessonCellView[];
  quality: {
    severe: MonthlyQualityFindingView[];
    light: MonthlyQualityFindingView[];
    acknowledged?: OperatorAcknowledgementView;
  };
  /** Latest Operator request asking a Manager to reopen these approved resources; null when none exists. */
  reopenRequest?: MonthFrameworkReopenRequestView | null;
}

export interface MonthlyPublicationPreviewView {
  publishOn: string;
  affectedLearners: number;
  waitingNextMonth: number;
  nextMonth: string;
}

/** "Công bố lại": move a published month's publication date back to the current system date. */
export interface MonthlyRepublicationPreviewView {
  /** Current stored publication date. */
  publishedOn: string;
  /** The organisation system date the month would be republished on. */
  republishOn: string;
  /** false when the dates already match (nothing to do). */
  needed: boolean;
  /** Same readiness rule as the first publication (approved resources + 3 consecutive approved lessons from today). */
  ready: boolean;
  /** Lesson days in the readiness window that are not approved yet. */
  missingDays: Array<{ lessonNumber: number; date: string }>;
  /** Active learners of this level who can study from `republishOn`. */
  affectedLearners: number;
  /** Learners whose level start lies after `republishOn` and is moved back to it. */
  shiftedLearners: number;
}

export interface MonthlyRepublicationResultView {
  previousPublishedOn: string;
  publishedOn: string;
  changed: boolean;
  shiftedLearners: number;
}

/**
 * Operator manual edit of a DRAFT monthly resource pool (VH-R30/VH-R35).
 * Core count and core IDs are fixed; a core word is replaced by editing its row.
 * New support terms and pronunciation examples carry client-generated unique IDs.
 */
export interface MonthlyResourceEditInput {
  /** Framework version the editor was opened on; a stale version is rejected. */
  expectedVersion: number;
  coreTerms: Array<{ id: string; word: string; type: string; meaning: string; ipa: string }>;
  supportTerms: Array<{ id: string; word: string; meaning: string; type: string; relation: "umbrella" | "synonym" | "antonym" | "word_family" | "collocation"; relatedCoreTermId: string; cefr?: CefrLevel | undefined }>;
  grammarTopics: Array<{ id: string; title: string; steps: Array<{ id: string; focus: string; formula: string; usage: string; examples: string[]; dailyObjectives?: string[] | undefined }>; catalogId?: string }>;
  sounds: Array<{ id: string; ipa: string; label: string; examples: Array<{ id: string; word: string; ipa: string }> }>;
}

/** One validation problem in an edited pool, anchored to the row the UI shows it on. */
export interface MonthlyResourceEditIssue {
  section: "coreTerms" | "supportTerms" | "grammarTopics" | "sounds" | "pool";
  /** Core/support term ID, grammar topic or step ID, sound or sound example ID; absent for pool-wide rules. */
  rowId?: string;
  field?: string;
  message: string;
}

export interface MonthFrameworkReopenRequestView {
  id: string;
  /** Framework version the request was made against. */
  frameworkVersion: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface MonthDayPlanView {
  newLessonNumber?: number;
  reviewWeekNumber?: number;
  grammarPlan?: MonthlyGrammarDayPlan;
  pronunciationPlan?: MonthlyPronunciationDayPlan;
  lessonNumber: number;
  date: string;
  kind: "new" | "review";
  coreTermIds: string[];
  expandedTermIds: string[];
  reviewTermIds: string[];
  reviewExpandedTermIds: string[];
  reviewWeekKey?: string | null;
  reviewFromPreviousMonth?: boolean;
  reviewGatesNextWeek?: boolean;
  reviewPrerequisiteLessonNumbers?: number[];
  reviewGrammarStepIds?: string[];
  reviewSoundIds?: string[];
  reviewPronunciationExampleIds?: string[];
  skillExercises: Array<{ exerciseCode: "listening" | "reading" | "writing" | "word_class" | "word_use" | "speaking"; focus: string; resourceIds: string[] }>;
  grammarStepIds: string[];
  soundId: string;
  pronunciationSlot?: string;
  pronunciationExampleIds: string[];
}

export interface MonthlyOperatorOverviewView {
  calendar?: Array<{ date: string; kind: "new" | "review" | "weekend" | "exam"; lessonNumber?: number; newLessonNumber?: number; reviewWeekNumber?: number; holiday?: { date: string; name: string; source: "national" | "organization"; sourceUrl?: string }; holidayExamConflict?: boolean }>;
  /**
   * The Manager-controlled test date.  Operator month selection and every
   * date-sensitive permission must be derived from this value, never from the
   * browser clock or the legacy pilot cycle.
   */
  systemDate: string;
  /** The fixed previous/current/next month selector derived from systemDate. */
  monthWindow: {
    previous: string;
    current: string;
    next: string;
    /** Only the current and next system months may be authored. */
    writable: boolean;
  };
  brief: SharedMonthBriefView | null;
  frameworks: MonthFrameworkView[];
}

/** Observed status of the current resource-generation request; never an estimated percentage. */
export interface MonthlyResourceGenerationProgress {
  runId: string;
  status: "running" | "completed" | "failed";
  phase: "preparing" | "coreTerms" | "expandedTerms" | "grammarTopics" | "pronunciationTargets" | "saving";
  counts: Partial<Record<"coreTerms" | "expandedTerms" | "grammarTopics" | "pronunciationTargets", number>>;
  current?: number;
  total?: number;
  startedAt: string;
  updatedAt: string;
}
