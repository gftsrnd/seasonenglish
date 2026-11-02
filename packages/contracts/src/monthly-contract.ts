import type { CefrLevel } from "./domain-contract.js";

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
}

export interface MonthFrameworkView {
  id: string;
  cefr: CefrLevel;
  version: number;
  status: Exclude<MonthFrameworkStatus, "missing">;
  scopeHash: string;
  resources?: {
    coreTerms: Array<{ id: string; word: string; meaning: string; type: string; ipa: string; source: "core_registry"; component: "core"; dayNumber: number }>;
    supportTerms: Array<{ id: string; word: string; meaning: string; type: string; source: "example" | "family" | "synonym" | "antonym" | "group" | "manual"; component: "expanded"; dayNumber: number }>;
    grammarTopics: Array<{ id: string; title: string; steps: Array<{ id: string; focus: string; formula: string; usage: string; examples: string[] }> }>;
    sounds: Array<{ id: string; ipa: string; label: string; examples: Array<{ id: string; word: string; ipa: string }> }>;
  };
  lessons: MonthLessonCellView[];
  quality: {
    severe: MonthlyQualityFindingView[];
    light: MonthlyQualityFindingView[];
    acknowledged?: OperatorAcknowledgementView;
  };
}

export interface MonthlyOperatorOverviewView {
  brief: SharedMonthBriefView | null;
  frameworks: MonthFrameworkView[];
}
