import type { CefrLevel } from "./domain-contract.js";
import type { ContentLessonDraftInput } from "./content-contract.js";

/** Cơ chế học theo tháng — màn Vận hành. */

export type MonthFrameworkStatus = "missing" | "generating" | "draft" | "approved" | "failed";
export type MonthLessonStatus = "pending" | "generating" | "draft" | "approved" | "failed";
export type MonthExamStatus = "none" | "generating" | "draft" | "approved" | "failed";

export interface MonthlyLevelSummaryView {
  cefr: CefrLevel;
  frameworkStatus: MonthFrameworkStatus;
  approvedLessons: number;
  totalLessons: number;
  examStatus: MonthExamStatus;
  /** Khung duyệt + mọi bài ngày duyệt + bài thi duyệt → học viên thấy bài. */
  readyForLearners: boolean;
}

export interface MonthlyMonthSummaryView {
  month: string;
  /** Nhãn hiển thị, ví dụ "Tháng 11/2026". */
  label: string;
  examDate: string;
  lessonCount: number;
  studyDayCount: number;
  /** Tháng trước chỉ xem; tháng này và tháng sau sinh/duyệt/soạn tay được. */
  editable: boolean;
  levels: MonthlyLevelSummaryView[];
}

export interface MonthlyOperatorOverviewView {
  today: string;
  months: MonthlyMonthSummaryView[];
  activeLevels: CefrLevel[];
  settings: { vocabularyCount: number; grammarTopicCount: number; soundCount: number; examDurationMinutes: number };
  aiConnected: boolean;
}

export interface MonthFrameworkVocabularyView { word: string; type: string; ipa: string; meaning: string; example: string; abstract: boolean }
export interface MonthFrameworkGrammarStepView { step: number; focus: string; formula: string; usage: string; examples: string[] }
export interface MonthFrameworkGrammarTopicView { title: string; summary: string; steps: MonthFrameworkGrammarStepView[] }
export interface MonthFrameworkSoundView { ipa: string; label: string; tip: string; tipEn?: string; examples: Array<{ word: string; ipa: string }> }

export interface MonthLessonCellView {
  lessonNumber: number;
  date: string;
  status: MonthLessonStatus;
  title: string | null;
  lessonId: string | null;
  error: string | null;
  approvedAt: string | null;
  /** Từ bài này trở đi là ôn từ (hết từ mới). */
  review: boolean;
}

export interface MonthFrameworkView {
  id: string | null;
  month: string;
  cefr: CefrLevel;
  status: MonthFrameworkStatus;
  version: number;
  source: "ai" | "sample" | "manual" | null;
  generationError: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  vocabulary: MonthFrameworkVocabularyView[];
  grammarTopics: MonthFrameworkGrammarTopicView[];
  sounds: MonthFrameworkSoundView[];
  firstReviewLesson: number | null;
  lessons: MonthLessonCellView[];
  lessonSetVersionId: string | null;
  exam: { status: MonthExamStatus; error: string | null; assessmentVersionId: string | null; approvedAt: string | null };
  readyForLearners: boolean;
  editable: boolean;
}

export interface MonthLessonDetailView {
  frameworkId: string;
  lessonNumber: number;
  date: string;
  status: MonthLessonStatus;
  lesson: ContentLessonDraftInput & { id: string };
}

export interface MonthlyJobAcceptedView {
  accepted: true;
  jobId: string;
}
