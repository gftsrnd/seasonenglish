import type { CefrLevel } from "@e4s/contracts";

export const MONTHLY_SEASON_TURN_TARGET = 100;
export const DAILY_SEASON_TURN_LIMIT = 30;
/** The 23:24 minute is the last minute in which a learner may enter. */
export const MONTHLY_EXAM_ENTRY_CUTOFF = "23:25:00";

export function monthlyExamEntryState(systemDate: string, examDate: string, localTime: string): "upcoming" | "open" | "closed" {
  if (systemDate < examDate) return "upcoming";
  return systemDate === examDate && localTime < MONTHLY_EXAM_ENTRY_CUTOFF ? "open" : "closed";
}

/** Scale the monthly Season target for learners approved after the month starts. */
export function monthlySeasonTurnTarget(approvalDate: string, month: string, examDate: string): number {
  return monthlyLearnerWindow(month, examDate, approvalDate).seasonTarget;
}

/**
 * Single rule for the Season target a learner sees for a month (Coach, home,
 * monthly-exam eligibility): the prorated window target only applies when the
 * learner is actually in this month's cohort; otherwise the full target holds.
 */
export function learnerMonthlySeasonTarget(access: { readonly state: string; readonly seasonTarget: number } | null | undefined): number {
  if (access?.state === "uncounted") return 0;
  return monthlyAccessCounts(access?.state) ? access!.seasonTarget : MONTHLY_SEASON_TURN_TARGET;
}

/**
 * Monthly access states of a learner. `uncounted` ("học thử tháng này"): the level was approved
 * (or the month published) after more than 25% of the month's school days, so the learner studies
 * any published lesson through the system date without sequence gates. There are no counted attendance days,
 * absence lock or warnings, monthly final eligibility, Season target or level-up month. Counting
 * starts with the next month.
 */
export type LearnerMonthlyAccessState = "active" | "uncounted" | "unplaced" | "waiting_content" | "waiting_next_month" | "missed_exam";

/** States in which the month's lessons are listed and can be opened. */
export function monthlyAccessCanStudy(state: string | null | undefined): boolean {
  return state === "active" || state === "uncounted";
}

/** The month counts (attendance, absences, monthly final, Season target, level-up records) only when active. */
export function monthlyAccessCounts(state: string | null | undefined): boolean {
  return state === "active";
}

/**
 * Access state from the learner window: content must be published, the approval date reached,
 * and a window with fewer than 75% of the school days left is studied but not counted.
 */
export function monthlyAccessState(input: { cefr: string | null; publishedOn: string | null; approvalDate: string; systemDate: string; canStudy: boolean }): Exclude<LearnerMonthlyAccessState, "missed_exam"> {
  if (!input.cefr) return "unplaced";
  if (!input.publishedOn || input.publishedOn > input.systemDate) return "waiting_content";
  if (input.approvalDate > input.systemDate) return "waiting_next_month";
  return input.canStudy ? "active" : "uncounted";
}

export function monthlyLearnerWindow(month: string, examDate: string, approvalDate: string) {
  const end = new Date(`${examDate}T00:00:00Z`);
  const dates: string[] = [];
  for (const date = new Date(`${month}-01T00:00:00Z`); date < end; date.setUTCDate(date.getUTCDate() + 1)) {
    const weekday = date.getUTCDay();
    if (weekday >= 1 && weekday <= 5) dates.push(date.toISOString().slice(0, 10));
  }
  const effectiveDates = dates.filter(date => date >= approvalDate);
  const canStudy = dates.length > 0 && effectiveDates.length * 4 >= dates.length * 3;
  const startDate = canStudy ? effectiveDates[0]! : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  return {
    canStudy, startDate, effectiveDates, effectiveDays: effectiveDates.length,
    seasonTarget: dates.length ? Math.ceil(MONTHLY_SEASON_TURN_TARGET * effectiveDates.length / dates.length) : MONTHLY_SEASON_TURN_TARGET
  };
}

/**
 * Days that count for attendance (December 2026: the exam day showed 22
 * absences when only 7 lessons existed). Product rule: one attendance per
 * Mon–Fri day with at least one completed lesson, exam day excluded; a day can
 * only be missed when an approved, published lesson was available on it.
 * Past effective days without such a lesson are dropped; today and later days
 * are kept (their lessons may still be approved under rolling publication).
 */
export function monthlyAttendanceCountedDates(effectiveDates: readonly string[], lessonDates: ReadonlySet<string> | readonly string[], systemDate: string): string[] {
  const available = lessonDates instanceof Set ? lessonDates : new Set(lessonDates as readonly string[]);
  return effectiveDates.filter((date) => date >= systemDate || available.has(date));
}

export function consecutiveLearningAbsences(
  effectiveDates: readonly string[], attendedDates: readonly string[], today: string, resetOn?: string
): number {
  return learningAbsenceStreak(effectiveDates, attendedDates, today, resetOn).days;
}

/** The current run of missed learning days and the first missed date of that run (one key per streak). */
export function learningAbsenceStreak(
  effectiveDates: readonly string[], attendedDates: readonly string[], today: string, resetOn?: string
): { days: number; startedOn: string | null } {
  const attended = new Set(attendedDates);
  let days = 0;
  let startedOn: string | null = null;
  for (const date of effectiveDates) {
    if (date >= today) break;
    if (resetOn && date < resetOn) continue;
    if (attended.has(date)) {
      days = 0;
      startedOn = null;
    } else {
      if (days === 0) startedOn = date;
      days += 1;
    }
  }
  return { days, startedOn };
}

export function monthlyAttendanceAllowance(effectiveDays: number): number {
  return Math.floor(effectiveDays * 0.3);
}

export interface MonthlyExamEligibilityInput {
  systemDate: string;
  examDate: string;
  /** All effective weekdays in the month, excluding the exam date. */
  effectiveDays: number;
  /** Effective weekdays with available lessons that have already ended. */
  elapsedEffectiveDays: number;
  attendedDays: number;
  attendedElapsedDays?: number;
  scheduledLessons: number;
  completedLessons: number;
  seasonTurns: number;
  seasonTarget?: number;
  attendanceOverride?: boolean;
  windowOpen?: boolean;
  learnerEligible?: boolean;
  frameworkApproved: boolean;
  formPublished: boolean;
}

export interface MonthlyExamEligibility {
  effectiveDays: number;
  elapsedEffectiveDays: number;
  attendedDays: number;
  absenceDays: number;
  maxAbsences: number;
  attendanceEligible: boolean;
  attendanceOverride: boolean;
  scheduledLessons: number;
  completedLessons: number;
  lessonsEligible: boolean;
  seasonTurns: number;
  seasonTurnsRequired: number;
  seasonEligible: boolean;
  frameworkApproved: boolean;
  formPublished: boolean;
  windowOpen: boolean;
  accessEligible: boolean;
  reasons: string[];
  /** Kept compatible with the existing learner contract. */
  accessState: "tracking" | "eligible" | "appeal_required";
}

/**
 * Evaluates exam access from persisted facts. Scoring and monthly final results
 * are intentionally absent: access is a prerequisite and never a score.
 */
export function evaluateMonthlyExamEligibility(input: MonthlyExamEligibilityInput): MonthlyExamEligibility {
  const effectiveDays = Math.max(0, Math.floor(input.effectiveDays));
  const elapsedEffectiveDays = Math.max(0, Math.min(effectiveDays, Math.floor(input.elapsedEffectiveDays)));
  const attendedDays = Math.max(0, Math.min(effectiveDays, Math.floor(input.attendedDays)));
  const attendedElapsedDays = Math.max(0, Math.min(elapsedEffectiveDays, Math.floor(input.attendedElapsedDays ?? attendedDays)));
  const absenceDays = elapsedEffectiveDays - attendedElapsedDays;
  const maxAbsences = monthlyAttendanceAllowance(effectiveDays);
  const attendanceOverride = input.attendanceOverride === true;
  const attendanceEligible = absenceDays <= maxAbsences || attendanceOverride;
  const scheduledLessons = Math.max(0, Math.floor(input.scheduledLessons));
  const completedLessons = Math.max(0, Math.min(scheduledLessons, Math.floor(input.completedLessons)));
  const lessonsEligible = scheduledLessons > 0 && completedLessons === scheduledLessons;
  const seasonTurns = Math.max(0, Math.floor(input.seasonTurns));
  const seasonTarget = input.seasonTarget ?? MONTHLY_SEASON_TURN_TARGET;
  const seasonEligible = seasonTurns >= seasonTarget;
  // A published fixed final is available to every learner at the level on the
  // exam date. Lesson completion and Season activity are readiness metrics,
  // not access gates (CH-R33); attendance remains the learner access gate.
  const windowOpen = input.windowOpen ?? input.systemDate === input.examDate;
  const reasons: string[] = [];
  if (!attendanceEligible) reasons.push("MONTHLY_ATTENDANCE_LIMIT_EXCEEDED");
  if (!windowOpen) reasons.push("MONTHLY_EXAM_WINDOW_NOT_OPEN");
  if (!input.formPublished) reasons.push("MONTHLY_FORM_NOT_PUBLISHED");
  if (input.learnerEligible === false) reasons.push("MONTHLY_LEARNER_NOT_IN_COHORT");
  return {
    effectiveDays,
    elapsedEffectiveDays,
    attendedDays,
    absenceDays,
    maxAbsences,
    attendanceEligible,
    attendanceOverride,
    scheduledLessons,
    completedLessons,
    lessonsEligible,
    seasonTurns,
    seasonTurnsRequired: seasonTarget,
    seasonEligible,
    frameworkApproved: input.frameworkApproved,
    formPublished: input.formPublished,
    windowOpen,
    accessEligible: reasons.length === 0,
    reasons,
    accessState: !attendanceEligible ? "appeal_required" : windowOpen && reasons.length === 0 ? "eligible" : "tracking"
  };
}

export interface MonthlyLevelRecord {
  month: string;
  eligible: boolean;
  finalScore: number | null;
  finalPassed: boolean;
  seasonTurns: number;
  /** Newcomer-scaled target for a month that started mid-month. */
  seasonTarget?: number;
  absenceRate: number;
  /** Exact counts allow the level-wide attendance cap to use a weighted rate. */
  absenceDays?: number;
  effectiveDays?: number;
}

export interface MonthlyLevelUpReadiness {
  targetLevel: CefrLevel | null;
  eligible: boolean;
  requiredMonths: number;
  eligibleMonths: number;
  finalPasses: number;
  finalPassesRequired: number;
  finalAverage: number | null;
  finalAverageTarget: number;
  seasonMonths: number;
  seasonMonthsRequired: number;
  latestFinalPassed: boolean;
  absenceCap: number;
  absenceRate: number;
  reasons: string[];
}

/** Evaluates the six eligible months used by the canonical level-up policy. */
export function evaluateMonthlyLevelUpReadiness(input: {
  currentLevel: CefrLevel | null;
  months: readonly MonthlyLevelRecord[];
}): MonthlyLevelUpReadiness {
  const targetLevel = nextLevel(input.currentLevel);
  if (!targetLevel) {
    return {
      targetLevel: null, eligible: false, requiredMonths: 6, eligibleMonths: 0,
      finalPasses: 0, finalPassesRequired: 0, finalAverage: null, finalAverageTarget: 0,
      seasonMonths: 0, seasonMonthsRequired: 0, latestFinalPassed: false, absenceCap: 0, absenceRate: 0,
      reasons: ["HIGHEST_LEVEL_REACHED"]
    };
  }
  const level = input.currentLevel!;
  const finalPassesRequired = level === "A1" || level === "A2" ? 4 : 5;
  const finalAverageTarget = level === "A1" || level === "A2" ? 70 : level === "B1" ? 72 : 75;
  const absenceCap = level === "A1" || level === "A2" ? 25 : level === "B1" || level === "B2" ? 20 : 15;
  const eligibleMonths = input.months.filter((month) => month.eligible).slice(-6);
  const scores = eligibleMonths.map((month) => month.finalScore).filter((score): score is number => Number.isFinite(score));
  const finalPasses = eligibleMonths.filter((month) => month.finalPassed).length;
  const seasonMonths = eligibleMonths.filter((month) => month.seasonTurns >= (month.seasonTarget ?? MONTHLY_SEASON_TURN_TARGET)).length;
  const finalAverage = scores.length === 6 ? scores.reduce((sum, score) => sum + score, 0) / 6 : null;
  const latest = eligibleMonths[eligibleMonths.length - 1];
  const latestFinalPassed = Boolean(latest?.finalPassed);
  const effectiveDays = eligibleMonths.reduce((sum, month) => sum + Math.max(0, month.effectiveDays ?? 0), 0);
  const absenceDays = eligibleMonths.reduce((sum, month) => sum + Math.max(0, month.absenceDays ?? 0), 0);
  const absenceRate = effectiveDays > 0
    ? absenceDays / effectiveDays * 100
    : eligibleMonths.length ? Math.max(...eligibleMonths.map((month) => month.absenceRate)) : 100;
  const reasons: string[] = [];
  if (eligibleMonths.length < 6) reasons.push("LEVEL_UP_SIX_ELIGIBLE_MONTHS_REQUIRED");
  if (finalPasses < finalPassesRequired) reasons.push("LEVEL_UP_MONTHLY_FINAL_PASSES_INSUFFICIENT");
  if (finalAverage === null || finalAverage < finalAverageTarget) reasons.push("LEVEL_UP_MONTHLY_FINAL_AVERAGE_INSUFFICIENT");
  if (!latestFinalPassed) reasons.push("LEVEL_UP_LATEST_MONTHLY_FINAL_MUST_PASS");
  if (seasonMonths < finalPassesRequired) reasons.push("LEVEL_UP_SEASON_MONTHS_INSUFFICIENT");
  if (absenceRate > absenceCap) reasons.push("LEVEL_UP_ABSENCE_CAP_EXCEEDED");
  return {
    targetLevel, eligible: reasons.length === 0, requiredMonths: 6, eligibleMonths: eligibleMonths.length,
    finalPasses, finalPassesRequired, finalAverage, finalAverageTarget, seasonMonths,
    seasonMonthsRequired: finalPassesRequired, latestFinalPassed, absenceCap, absenceRate, reasons
  };
}

function nextLevel(level: CefrLevel | null): CefrLevel | null {
  if (level === "A1") return "A2";
  if (level === "A2") return "B1";
  if (level === "B1") return "B2";
  if (level === "B2") return "C1";
  return null;
}
