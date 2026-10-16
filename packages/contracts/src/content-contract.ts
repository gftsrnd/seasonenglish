import type { AssessmentDecisionView, AssessmentResponseView, AssessmentSectionCode, AssessmentSectionStatus, AssessmentAttemptStatus } from "./assessment-contract.js";
import type { CefrLevel } from "./domain-contract.js";
import type { LessonPart } from "./learning-contract.js";

export type ContentLessonSetStatus = "missing" | "draft" | "review" | "published" | "retired";

export interface ContentWeekTopicView {
  id: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  current: boolean;
  topic: string;
  description: string;
  objectives: string;
  keyVocabHint: string;
}

export interface ContentWeekFrameView {
  pilot: { startDate: string; weekCount: number };
  weeks: ContentWeekTopicView[];
}

export interface ContentWeekInput {
  weekNumber: number;
  topic: string;
  description: string;
  objectives: string;
  keyVocabHint: string;
}

export interface ContentWeekSuggestionView {
  weekNumber: number;
  /** Legacy clients may omit this while the expanded endpoint always returns it. */
  levels?: CefrLevel[];
  options: Array<Omit<ContentWeekInput, "weekNumber"> & {
    /** One concrete, ordered Monday–Friday plan for each active CEFR level. */
    plan?: Partial<Record<CefrLevel, string[]>>;
  }>;
}

export interface ContentLessonDraftInput {
  dayNumber: number;
  title: string;
  durationMinutes: number;
  parts: LessonPart[];
}

export interface ContentLessonSummaryView extends ContentLessonDraftInput {
  id: string;
  practiceLabel: string;
}

export interface ContentLessonSetVersionView {
  lessonSetId: string;
  versionId: string;
  version: number;
  status: Exclude<ContentLessonSetStatus, "missing">;
  weekNumber: number;
  topic: string;
  cefr: CefrLevel;
  explanationLanguage: "Tiếng Việt" | "English";
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: string;
  publishedAt: string | null;
  lessons: ContentLessonSummaryView[];
}

export interface ContentLessonMutationInput {
  expectedVersion?: number;
  lesson: ContentLessonDraftInput;
}

export interface ContentLessonJsonInput {
  expectedVersion?: number;
  lessons: ContentLessonDraftInput[];
}

export interface ContentLessonMutationResult extends ContentLessonSetVersionView {
  optimisticVersion: number;
}

export interface ContentLessonMatrixView {
  levels: Array<{ cefr: CefrLevel; learnerCount: number }>;
  weeks: Array<{
    weekNumber: number;
    topic: string;
    cells: Array<{
      cefr: CefrLevel;
      status: ContentLessonSetStatus;
      versionId: string | null;
      version: number | null;
      updatedAt: string | null;
      lessons: Array<{ dayNumber: number; title: string }>;
    }>;
  }>;
}

export type ContentReviewTabKey = "submissions" | "coach" | "micro" | "appeals" | "attempts" | "assessments";

export interface ContentReviewView {
  tabs: Array<{
    key: ContentReviewTabKey;
    label: string;
    count: number;
    unreadCount?: number;
  }>;
  coachSamples: Array<{
    id: string;
    learnerName: string;
    cefr: CefrLevel | null;
    weekNumber: number | null;
    createdAt: string;
    checked: boolean;
    learnerText: string;
    coachText: string;
    scores: { meaning: number | null; vocabulary: number | null; grammar: number | null };
    suggestions: string[];
  }>;
  submissions: Array<{
    id: string; learnerName: string; cefr: CefrLevel | null; weekNumber: number;
    submittedAt: string; checked: boolean; text: string; total: number | null;
    rubric: { meaning: number | null; vocabulary: number | null; grammar: number | null };
    feedback: string; suggestions: string[]; aiGraded?: boolean;
    /** Resolved from the persisted weekly-practice submission and its program week. */
    type?: "dialogue" | "writing";
    task?: string;
  }>;
  microLessons: Array<{
    id: string; learnerName: string; cefr: CefrLevel; topic: string; generatedAt: string;
    completed: boolean; theory: string; vocabulary: string[]; practice: string; answer: string | null;
  }>;
  appeals: Array<{
    id: string; learnerName: string; reason: string; status: "pending" | "accepted" | "rejected";
    createdAt: string; resolution: string;
  }>;
  lessonAttempts: Array<{
    id: string; learnerName: string; cefr: CefrLevel | null; weekNumber: number; dayNumber: number;
    lessonTitle: string; attempts: Partial<Record<"listening" | "reading" | "writing" | "speaking", number>>;
  }>;
  assessments: Array<{
    id: string; learnerName: string; kind: "placement" | "final" | "level_up";
    title: string; status: string; submittedAt: string | null; totalScore: number | null;
  }>;
}

export interface ContentReviewAssessmentAnswerView extends AssessmentResponseView {
  title?: string;
  prompt?: string;
  audioArtifact?: {
    artifactKey: string;
    mimeType: string | null;
    sizeBytes: number | null;
    signedUrl: string | null;
    expiresAt: string | null;
  } | null;
}

export interface ContentReviewAssessmentDetailView {
  attemptId: string;
  learnerId: string;
  learnerName: string;
  kind: "placement" | "final" | "level_up";
  title: string;
  status: AssessmentAttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  totalScore: number | null;
  answers: ContentReviewAssessmentAnswerView[];
  scores: Array<{
    section: AssessmentSectionCode;
    score: number;
    source: "deterministic" | "ai" | "human";
    criteria: Record<string, unknown>;
  }>;
  integrityEvents: Array<Record<string, unknown>>;
  decision: AssessmentDecisionView | null;
  appeal: { id: string; reason: string; status: "pending" | "accepted" | "rejected"; resolution: string | null; createdAt: string } | null;
}

export type ContentReviewAiGradeJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface ContentReviewAiGradeJobView {
  jobId: string;
  submissionId: string;
  status: ContentReviewAiGradeJobStatus;
  requestedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  result: {
    total: number;
    rubric: { meaning: number; vocabulary: number; grammar: number };
    feedback: string;
    suggestions: Array<{ original: string; corrected: string; explanation: string }>;
    correctedText: string;
  } | null;
}

export type ContentPromptKey =
  | "system_rules"
  | "assessment_scoring"
  | "weekly_lessons"
  | "week_suggestions"
  | "micro_grading"
  | "coach_dialogue"
  | "weekly_practice_grading";

export interface ContentPromptGroupView {
  key: ContentPromptKey;
  label: string;
  content: string;
  defaultContent: string;
  version: number;
  status: "draft" | "active" | "retired";
}

export interface ContentPromptSettingsView {
  groups: ContentPromptGroupView[];
}
