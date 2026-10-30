import type { CefrLevel } from "./domain-contract.js";
import type { ContentLessonDraftInput } from "./content-contract.js";
import type { LessonLockView } from "./learning-contract.js";

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

/** Đề thi tháng cho Vận hành xem: 4 phần, key, ma trận và rubric (gói người chấm). Không gửi cho học viên. */
export interface MonthlyExamOperatorView {
  frameworkId: string;
  month: string;
  cefr: CefrLevel;
  status: MonthExamStatus;
  assessmentVersionId: string;
  title: string;
  totalMinutes: number;
  totalScore: number;
  audioStatus: "SCRIPT_ONLY" | "READY";
  blueprintStatus: "DRAFT" | "NEEDS_REVIEW" | "READY";
  sections: Array<{
    code: "listening" | "reading" | "writing" | "speaking";
    title: string;
    durationMinutes: number;
    maxScore: number;
    instructions: string[];
    groups: Array<{
      key: string;
      title: string;
      instruction: string;
      maxPlays?: number;
      stimulus?: { type: string; text?: string; lines?: Array<{ speaker: string; text: string }> };
      tasks: Array<{
        key: string;
        prompt: string;
        responseType: "single_choice" | "long_text" | "speaking_evidence";
        maxScore: number;
        options?: Array<{ value: string; label: string }>;
        correctAnswer?: string;
        evidenceCodes?: string[];
        hint?: string;
        minWords?: number;
        maxWords?: number;
      }>;
    }>;
  }>;
  mapping: Array<{ objective: string; kind: "vocabulary" | "grammar" | "pronunciation"; position: string; evidence: string; maxScore: number }>;
  graderPackage: {
    scripts: Array<{ key: string; title: string; lines: Array<{ speaker: string; text: string }> }>;
    keys: Array<{ taskKey: string; answer: string; evidence: string; explanation: string }>;
    rubric: { writing: Array<{ code: string; label: string; max: number }>; speaking: Array<{ code: string; label: string; max: number }> };
    sampleAnswers: { writing: string; speaking: string };
  };
  checks: Array<{ code: string; passed: boolean; detail: string }>;
}

/** Trạng thái tháng của học viên (trang chủ + màn bài thi tháng). */
export type LearnerMonthMode = "join_current_month" | "wait_next_month" | "locked_missed_exam" | "unlocked_by_manager";
export type MonthlyExamAccess = "not_open_yet" | "open" | "locked";
export type MonthlyExamAppealStatus = "pending" | "approved" | "rejected" | "auto_approved";

export interface LearnerMonthLessonView {
  id: string;
  lessonNumber: number;
  date: string;
  title: string;
  status: "not_started" | "in_progress" | "completed";
  lock: LessonLockView | null;
  review: boolean;
}

export interface LearnerMonthView {
  month: string;
  label: string;
  today: string;
  examDate: string;
  lessonCount: number;
  studyDayCount: number;
  cefr: CefrLevel | null;
  /** Null khi chưa có ghi danh tháng (chưa duyệt mức). */
  enrollment: {
    mode: LearnerMonthMode;
    reason: string;
    ratioPercent: number | null;
    startsOn: string | null;
    effectiveDayCount: number;
    maxAbsences: number;
    countsForLevelUp: boolean;
  } | null;
  /** Khung + mọi bài ngày + đề thi của level đã duyệt đủ. */
  contentReady: boolean;
  /** Chỉ luyện Season (chủ đề ngẫu nhiên, không ô từ bí mật) và mini game keyword. */
  seasonOnly: boolean;
  seasonOnlyReason: "no_content" | "waiting_next_month" | "locked_missed_exam" | null;
  lessons: LearnerMonthLessonView[];
  nextLesson: LearnerMonthLessonView | null;
  completedLessons: number;
  attendance: { effectiveDays: number; attendedDays: number; absentDays: number; maxAbsences: number; eligible: boolean };
  exam: {
    date: string;
    durationMinutes: number;
    opensAt: string;
    locksAt: string;
    access: MonthlyExamAccess;
    /** Đề đã duyệt cho level của học viên. */
    available: boolean;
    eligible: boolean;
    attemptStatus: "none" | "in_progress" | "submitted" | "pending_review" | "approved" | "needs_retry";
    appeal: { status: MonthlyExamAppealStatus; deadlineAt: string; createdAt: string; resolution: string | null } | null;
    /** Vào thi được ngay bây giờ. */
    canStart: boolean;
    blockedReason: "not_open_yet" | "locked" | "not_eligible" | "no_exam" | "already_submitted" | "waiting" | null;
  };
  coach: { turnsThisMonth: number; monthlyTarget: number; dailyLimit: number };
}

export interface MonthlyExamAppealInput { reason: string }
