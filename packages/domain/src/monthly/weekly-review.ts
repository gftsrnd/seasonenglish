import { buildMonthlyCalendar, monthlyDayKind, type MonthlyCalendar } from "./curriculum.js";

/**
 * Operating rules of the Friday weekly review (bài ôn thứ Sáu): week identity,
 * the next-week unlock gate, and review attendance. Pure functions only; the
 * database and API layers feed persisted facts in.
 */

export interface MonthlyWeeklyReviewSlot {
  /** 1-based ordinal of the calendar week among the month's effective days. */
  weekNumber: number;
  /** Monday of the calendar week (YYYY-MM-DD). */
  weekKey: string;
  reviewDate: string;
  lessonNumber: number;
  /** The Mon–Thu new lessons of the same calendar week. */
  prerequisiteLessonNumbers: number[];
  /** A month that starts on Friday reviews the previous month's material. */
  fromPreviousMonth: boolean;
  /** Only a review with this month's material gates the next week's Monday. */
  gatesNextWeek: boolean;
}

/**
 * Derives every Friday review of a month from the calendar.
 * - Friday exam date: excluded from effective days, so no review (exam replaces it).
 * - Exam on Mon–Thu: that week's Friday belongs to the next month, so no review and no gate.
 * - Month starting on Friday: carryover review, never a gate.
 * - Weeks with 1–3 new days still have a review.
 */
export function monthlyWeeklyReviews(monthOrCalendar: string | MonthlyCalendar): MonthlyWeeklyReviewSlot[] {
  const calendar = typeof monthOrCalendar === "string" ? buildMonthlyCalendar(monthOrCalendar) : monthOrCalendar;
  const slots: MonthlyWeeklyReviewSlot[] = [];
  calendar.effectiveDays.forEach((date, index) => {
    const lessonNumber = index + 1;
    if (monthlyDayKind(lessonNumber, calendar) !== "review") return;
    const weekKey = mondayOfWeek(date);
    const fromPreviousMonth = lessonNumber === 1 && weekdayOf(`${calendar.month}-01`) === 5;
    const prerequisiteLessonNumbers = fromPreviousMonth ? [] : calendar.effectiveDays.slice(0, index).flatMap((candidate, candidateIndex) =>
      mondayOfWeek(candidate) === weekKey && monthlyDayKind(candidateIndex + 1, calendar) === "new" ? [candidateIndex + 1] : []);
    slots.push({
      weekNumber: monthlyWeekNumber(date, calendar),
      weekKey,
      reviewDate: date,
      lessonNumber,
      prerequisiteLessonNumbers,
      fromPreviousMonth,
      gatesNextWeek: !fromPreviousMonth && prerequisiteLessonNumbers.length > 0
    });
  });
  return slots;
}

/** Calendar week ordinal of a date inside the month (week of the first effective day = 1). */
export function monthlyWeekNumber(date: string, calendar: MonthlyCalendar): number {
  const weekKeys = [...new Set(calendar.effectiveDays.map(mondayOfWeek))];
  const index = weekKeys.indexOf(mondayOfWeek(date));
  if (index < 0) throw new RangeError(`Date ${date} is outside the monthly schedule`);
  return index + 1;
}

/** The review a new lesson belongs to, or null when its week has no review. */
export function weeklyReviewForLesson(lessonNumber: number, monthOrCalendar: string | MonthlyCalendar): MonthlyWeeklyReviewSlot | null {
  return monthlyWeeklyReviews(monthOrCalendar).find((slot) => slot.prerequisiteLessonNumbers.includes(lessonNumber)) ?? null;
}

// ---------------------------------------------------------------------------
// Unlock gate
// ---------------------------------------------------------------------------

export interface MonthlyAccessLessonInput {
  lessonNumber: number;
  date: string;
  kind: "new" | "review";
  completed: boolean;
  /** DaySpec metadata; derived from the calendar when absent (legacy plans). */
  reviewGatesNextWeek?: boolean;
  reviewFromPreviousMonth?: boolean;
}

export type MonthlyLessonAccess =
  | { lessonNumber: number; locked: false }
  | { lessonNumber: number; locked: true; reason: "prior"; blockerLessonNumber: number }
  | { lessonNumber: number; locked: true; reason: "review"; blockerLessonNumber: number; reviewWeekNumber: number }
  | { lessonNumber: number; locked: true; reason: "date"; opensAt: string };

/**
 * Sequential monthly access (CH-R40, HV-R40, HV-R50, CH-R20):
 * week 1 lessons → week 1 review → week 2 lessons → … A lesson is locked by
 * the earliest earlier lesson that is not complete, except:
 * - a new lesson on a declared holiday never blocks later lessons (holiday
 *   chain); a Friday review inside a holiday chain still blocks;
 * - a non-gating review (month starting on Friday) never blocks.
 * A review additionally requires every daily lesson of its own week, holiday
 * lessons included, because it reviews that material (HV-R50).
 * Lessons never open before their calendar date. Newcomers use the same rule:
 * past lessons are makeup lessons, still in this order.
 */
export function evaluateMonthlyLessonAccess(input: {
  month: string;
  systemDate: string;
  lessons: readonly MonthlyAccessLessonInput[];
  holidays?: readonly string[];
}): MonthlyLessonAccess[] {
  const calendar = buildMonthlyCalendar(input.month);
  const holidays = new Set(input.holidays ?? []);
  const slots = new Map(monthlyWeeklyReviews(calendar).map((slot) => [slot.lessonNumber, slot]));
  const ordered = [...input.lessons].sort((left, right) => left.lessonNumber - right.lessonNumber);
  const byNumber = new Map(ordered.map((lesson) => [lesson.lessonNumber, lesson]));
  const gates = (lesson: MonthlyAccessLessonInput) => {
    if (lesson.kind !== "review") return true;
    if (lesson.reviewGatesNextWeek !== undefined) return lesson.reviewGatesNextWeek;
    if (lesson.reviewFromPreviousMonth) return false;
    return slots.get(lesson.lessonNumber)?.gatesNextWeek ?? true;
  };
  return ordered.map((lesson): MonthlyLessonAccess => {
    const blocker = ordered.find((previous) => previous.lessonNumber < lesson.lessonNumber
      && !previous.completed
      && gates(previous)
      && !(previous.kind === "new" && holidays.has(previous.date)));
    const ownWeekBlocker = lesson.kind === "review"
      ? (slots.get(lesson.lessonNumber)?.prerequisiteLessonNumbers ?? [])
        .map((number) => byNumber.get(number))
        .find((previous): previous is MonthlyAccessLessonInput => Boolean(previous && !previous.completed))
      : undefined;
    const first = [blocker, ownWeekBlocker]
      .filter((candidate): candidate is MonthlyAccessLessonInput => Boolean(candidate))
      .sort((left, right) => left.lessonNumber - right.lessonNumber)[0];
    if (first) {
      if (first.kind === "review") {
        return { lessonNumber: lesson.lessonNumber, locked: true, reason: "review", blockerLessonNumber: first.lessonNumber, reviewWeekNumber: monthlyWeekNumber(first.date, calendar) };
      }
      return { lessonNumber: lesson.lessonNumber, locked: true, reason: "prior", blockerLessonNumber: first.lessonNumber };
    }
    if (lesson.date > input.systemDate) return { lessonNumber: lesson.lessonNumber, locked: true, reason: "date", opensAt: lesson.date };
    return { lessonNumber: lesson.lessonNumber, locked: false };
  });
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export interface MonthlyAttendanceCompletion {
  /** Vietnam-time calendar date on which the lesson was completed. */
  completedDate: string;
  kind: "new" | "review";
}

/**
 * Attendance dates of a month (CH-R20–CH-R23, CH-R17):
 * - Mon–Thu: any completed daily lesson or review (today's or makeup).
 * - Friday: only a completed review; completing a daily lesson on Friday does
 *   not count. A review finished after its Friday leaves that Friday absent
 *   and instead credits the makeup date when it is an effective day.
 * - Weekend completions never count; the exam date is not an effective day.
 * - Declared holidays count automatically once they have arrived.
 */
export function monthlyAttendanceDates(input: {
  month: string;
  examDate?: string;
  systemDate?: string;
  completions: readonly MonthlyAttendanceCompletion[];
  holidays?: readonly string[];
}): string[] {
  const calendar = buildMonthlyCalendar(input.month);
  const examDate = input.examDate ?? calendar.examDate;
  const effective = new Set(weekdaysBetween(`${input.month}-01`, examDate));
  const attended = new Set<string>();
  for (const completion of input.completions) {
    if (!effective.has(completion.completedDate)) continue;
    if (weekdayOf(completion.completedDate) === 5 && completion.kind !== "review") continue;
    attended.add(completion.completedDate);
  }
  for (const holiday of input.holidays ?? []) {
    if (!effective.has(holiday)) continue;
    if (input.systemDate && holiday > input.systemDate) continue;
    attended.add(holiday);
  }
  return [...attended].sort();
}

export interface WeeklyReviewAttendanceOutcome {
  /** True only when the review was completed on its own Friday. */
  reviewFridayAttended: boolean;
  /** The date credited by this completion, if any. */
  creditedDate: string | null;
}

/** Explains what one review completion does to attendance. */
export function weeklyReviewAttendanceOutcome(input: {
  reviewDate: string;
  completedDate: string;
  month: string;
  examDate?: string;
}): WeeklyReviewAttendanceOutcome {
  const credited = monthlyAttendanceDates({ month: input.month, ...(input.examDate ? { examDate: input.examDate } : {}), completions: [{ completedDate: input.completedDate, kind: "review" }] });
  return {
    reviewFridayAttended: input.completedDate === input.reviewDate && credited.includes(input.reviewDate),
    creditedDate: credited[0] ?? null
  };
}

function weekdaysBetween(startDate: string, endExclusive: string): string[] {
  const result: string[] = [];
  const end = new Date(`${endExclusive}T00:00:00Z`);
  for (const current = new Date(`${startDate}T00:00:00Z`); current < end; current.setUTCDate(current.getUTCDate() + 1)) {
    const weekday = current.getUTCDay();
    if (weekday >= 1 && weekday <= 5) result.push(current.toISOString().slice(0, 10));
  }
  return result;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function mondayOfWeek(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}
