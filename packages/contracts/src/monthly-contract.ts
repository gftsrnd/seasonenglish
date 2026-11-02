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
}

export interface MonthFrameworkView {
  id: string;
  cefr: CefrLevel;
  version: number;
  status: Exclude<MonthFrameworkStatus, "missing">;
  scopeHash: string;
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
