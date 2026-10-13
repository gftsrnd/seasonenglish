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
