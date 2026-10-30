/**
 * Lịch học theo tháng (thay cơ chế theo tuần).
 * Mọi ngày là chuỗi "YYYY-MM-DD" theo múi giờ học (mặc định Asia/Ho_Chi_Minh); tháng là "YYYY-MM".
 * Chỉ học Thứ Hai–Thứ Sáu. Ngày thi tháng = ngày học cuối cùng của tháng.
 */

export const LEARNING_TIME_ZONE = "Asia/Ho_Chi_Minh";
export const MAX_ABSENCE_PERCENT = 30;
export const NEWCOMER_JOIN_PERCENT = 75;
export const CONSECUTIVE_ABSENCE_LOCK_DAYS = 5;
export const EXAM_LOCK_BUFFER_MINUTES = 5;
export const DEFAULT_MONTHLY_EXAM_MINUTES = 30;

// ---------- Clock: nguồn thời gian duy nhất cho luật nghiệp vụ ----------

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function createFixedClock(instant: Date | string): Clock {
  const fixed = new Date(instant);
  if (Number.isNaN(fixed.getTime())) throw new RangeError("Fixed clock needs a valid instant");
  return { now: () => new Date(fixed.getTime()) };
}

/** Giờ giả lập: chạy tiếp từ `fakeNow` kể từ lúc tạo. Chỉ dùng ở local/test. */
export function createOffsetClock(fakeNow: Date | string, base: Clock = systemClock): Clock {
  const offset = new Date(fakeNow).getTime() - base.now().getTime();
  if (Number.isNaN(offset)) throw new RangeError("Offset clock needs a valid instant");
  return { now: () => new Date(base.now().getTime() + offset) };
}

export function fakeClockAllowed(env: { NODE_ENV?: string | undefined; E4S_ALLOW_FAKE_CLOCK?: string | undefined }): boolean {
  return env.NODE_ENV !== "production" || env.E4S_ALLOW_FAKE_CLOCK === "1";
}

// ---------- Ngày / giờ theo múi giờ học ----------

export function localDateString(instant: Date, timeZone = LEARNING_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Thời điểm UTC của hh:mm theo giờ địa phương của `date`. */
export function localDateTimeToUtc(date: string, minutesFromMidnight: number, timeZone = LEARNING_TIME_ZONE): Date {
  const { year, month, day } = parseDate(date);
  const guess = Date.UTC(year, month - 1, day, 0, minutesFromMidnight);
  const represented = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(guess));
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(represented.find((part) => part.type === type)?.value ?? 0);
  const representedAsUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"), pick("second"));
  return new Date(guess - (representedAsUtc - guess));
}

export function addDays(date: string, days: number): string {
  const { year, month, day } = parseDate(date);
  return formatDate(new Date(Date.UTC(year, month - 1, day + days)));
}

export function isStudyWeekday(date: string): boolean {
  const weekday = weekdayOf(date);
  return weekday >= 1 && weekday <= 5;
}

export function nextStudyWeekday(date: string): string {
  let cursor = date;
  while (!isStudyWeekday(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

export function nextMonth(month: string): string {
  const { year, month: m } = parseMonth(month);
  return formatMonth(new Date(Date.UTC(year, m, 1)));
}

export function previousMonth(month: string): string {
  const { year, month: m } = parseMonth(month);
  return formatMonth(new Date(Date.UTC(year, m - 2, 1)));
}

// ---------- Lịch của một tháng ----------

export interface MonthlyCalendar {
  month: string;
  /** Mọi ngày T2–T6 trong tháng. */
  studyDays: string[];
  /** Ngày học cuối cùng = ngày thi tháng. */
  examDate: string;
  /** Số bài học = số ngày học − 1. */
  lessonCount: number;
  /** Ngày hiệu lực (ngày học trừ ngày thi). Bài ngày k ứng với effectiveDays[k-1]. */
  effectiveDays: string[];
  effectiveDayCount: number;
  maxAbsences: number;
}

export function buildMonthlyCalendar(month: string): MonthlyCalendar {
  const { year, month: m } = parseMonth(month);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const studyDays: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    if (isStudyWeekday(date)) studyDays.push(date);
  }
  const examDate = studyDays[studyDays.length - 1]!;
  const effectiveDays = studyDays.slice(0, -1);
  return {
    month,
    studyDays,
    examDate,
    lessonCount: effectiveDays.length,
    effectiveDays,
    effectiveDayCount: effectiveDays.length,
    maxAbsences: maxAbsencesFor(effectiveDays.length)
  };
}

/** Vắng tối đa = floor(30% × ngày hiệu lực). Dùng số nguyên để tránh lỗi dấu phẩy động. */
export function maxAbsencesFor(effectiveDayCount: number): number {
  return Math.floor((effectiveDayCount * MAX_ABSENCE_PERCENT) / 100);
}

/** Ngày học thứ `lessonNumber` (bắt đầu từ 1) của tháng; null nếu ngoài phạm vi. */
export function lessonDate(calendar: MonthlyCalendar, lessonNumber: number): string | null {
  return calendar.effectiveDays[lessonNumber - 1] ?? null;
}

/** Bài ngày k mở khi đã tới (hoặc qua) ngày học thứ k. */
export function isLessonUnlockedByDate(calendar: MonthlyCalendar, lessonNumber: number, today: string): boolean {
  const date = lessonDate(calendar, lessonNumber);
  return date !== null && today >= date;
}

/** Học tuần tự: bài k chỉ học được khi các bài trước đã hoàn thành. */
export function nextLearnableLesson(calendar: MonthlyCalendar, completedLessons: ReadonlySet<number>, today: string): number | null {
  for (let number = 1; number <= calendar.lessonCount; number += 1) {
    if (completedLessons.has(number)) continue;
    return isLessonUnlockedByDate(calendar, number, today) ? number : null;
  }
  return null;
}

export function isLessonLearnable(calendar: MonthlyCalendar, lessonNumber: number, completedLessons: ReadonlySet<number>, today: string): boolean {
  if (!isLessonUnlockedByDate(calendar, lessonNumber, today)) return false;
  for (let number = 1; number < lessonNumber; number += 1) {
    if (!completedLessons.has(number)) return false;
  }
  return true;
}

// ---------- Điểm danh và điều kiện dự thi ----------

export interface AttendanceReport {
  effectiveDays: number;
  attendedDays: number;
  absentDays: number;
  maxAbsences: number;
  eligible: boolean;
}

/**
 * Một ngày điểm danh = ngày hiệu lực có hoàn thành >= 1 bài (học bù nhiều bài cùng ngày vẫn là 1).
 * `completedAt` là thời điểm hoàn thành từng bài. Ngày vắng = ngày hiệu lực đã qua mà không điểm danh.
 */
export function buildAttendanceReport(input: {
  learnerEffectiveDays: readonly string[];
  completedAt: readonly Date[];
  today: string;
  timeZone?: string;
}): AttendanceReport {
  const attended = new Set(input.completedAt.map((instant) => localDateString(instant, input.timeZone)));
  const total = input.learnerEffectiveDays.length;
  const attendedDays = input.learnerEffectiveDays.filter((day) => attended.has(day)).length;
  const absentDays = input.learnerEffectiveDays.filter((day) => day < input.today && !attended.has(day)).length;
  const maxAbsences = maxAbsencesFor(total);
  return { effectiveDays: total, attendedDays, absentDays, maxAbsences, eligible: absentDays <= maxAbsences };
}

/**
 * Chuỗi ngày vắng liên tiếp tính ngược từ ngày học gần nhất ĐÃ QUA (T2–T6, bỏ ngày thi).
 * Trả về số ngày liên tiếp; >= 5 thì khoá tài khoản.
 */
export function consecutiveAbsentStudyDays(input: {
  today: string;
  attendedDates: ReadonlySet<string>;
  /** Ngày học viên bắt đầu được tính (ví dụ ngày duyệt mức); ngày trước đó không tính vắng. */
  countFrom: string;
}): number {
  let count = 0;
  let cursor = addDays(input.today, -1);
  while (cursor >= input.countFrom) {
    if (isStudyWeekday(cursor) && !isExamDate(cursor)) {
      if (input.attendedDates.has(cursor)) break;
      count += 1;
    }
    cursor = addDays(cursor, -1);
  }
  return count;
}

export function shouldLockForAbsence(consecutiveAbsentDays: number): boolean {
  return consecutiveAbsentDays >= CONSECUTIVE_ABSENCE_LOCK_DAYS;
}

export function isExamDate(date: string): boolean {
  return buildMonthlyCalendar(monthOf(date)).examDate === date;
}

// ---------- Cơ chế người mới ----------

export type NewcomerPlacement =
  | {
      mode: "join_current_month";
      month: string;
      ratioPercent: number;
      /** Ngày hiệu lực còn lại tính cả ngày được duyệt. */
      effectiveDays: string[];
      maxAbsences: number;
      /** Học bù tuần tự từ bài ngày 1. */
      startLesson: 1;
    }
  | {
      mode: "wait_next_month";
      month: string;
      ratioPercent: number;
      startsOn: string;
      /** Trong lúc chờ chỉ luyện Season (chủ đề ngẫu nhiên) và mini game keyword. */
      seasonOnlyUntil: string;
    };

/**
 * Tỉ lệ = ngày hiệu lực còn lại (tính cả ngày duyệt, chỉ T2–T6, không tính ngày thi) / ngày hiệu lực cả tháng.
 * Duyệt vào T7/CN tính từ Thứ Hai kế tiếp. >= 75% học tháng này từ bài 1; ngược lại chờ tháng sau.
 */
export function placeNewcomer(approvedAt: Date, timeZone = LEARNING_TIME_ZONE): NewcomerPlacement {
  const approvedDate = nextStudyWeekday(localDateString(approvedAt, timeZone));
  const month = monthOf(approvedDate);
  const calendar = buildMonthlyCalendar(month);
  const remaining = calendar.effectiveDays.filter((day) => day >= approvedDate);
  const ratio = calendar.effectiveDayCount === 0 ? 0 : (remaining.length / calendar.effectiveDayCount) * 100;
  const joins = remaining.length > 0 && remaining.length * 100 >= calendar.effectiveDayCount * NEWCOMER_JOIN_PERCENT;
  if (joins) {
    return {
      mode: "join_current_month",
      month,
      ratioPercent: roundPercent(ratio),
      effectiveDays: remaining,
      maxAbsences: maxAbsencesFor(remaining.length),
      startLesson: 1
    };
  }
  const next = buildMonthlyCalendar(nextMonth(month));
  return {
    mode: "wait_next_month",
    month,
    ratioPercent: roundPercent(ratio),
    startsOn: next.studyDays[0]!,
    seasonOnlyUntil: addDays(next.studyDays[0]!, -1)
  };
}

// ---------- Bài thi tháng ----------

export interface ExamWindow {
  examDate: string;
  opensAt: Date;
  /** Hạn vào làm bài = 24:00 − thời lượng − 5 phút. Vào sau giờ này thì không được làm. */
  locksAt: Date;
}

export function buildExamWindow(examDate: string, durationMinutes = DEFAULT_MONTHLY_EXAM_MINUTES, timeZone = LEARNING_TIME_ZONE): ExamWindow {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes + EXAM_LOCK_BUFFER_MINUTES >= 24 * 60) {
    throw new RangeError("Exam duration must leave room inside the exam day");
  }
  return {
    examDate,
    opensAt: localDateTimeToUtc(examDate, 0, timeZone),
    locksAt: localDateTimeToUtc(examDate, 24 * 60 - durationMinutes - EXAM_LOCK_BUFFER_MINUTES, timeZone)
  };
}

export type ExamAccess = "not_open_yet" | "open" | "locked";

export function examAccessAt(window: ExamWindow, now: Date): ExamAccess {
  if (now < window.opensAt) return "not_open_yet";
  return now <= window.locksAt ? "open" : "locked";
}

/** Quản lý có 24 giờ duyệt khiếu nại; quá hạn thì tự cho thi. */
export const EXAM_APPEAL_REVIEW_HOURS = 24;

export function examAppealDeadline(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + EXAM_APPEAL_REVIEW_HOURS * 60 * 60 * 1000);
}

export function examAppealAutoApproved(submittedAt: Date, now: Date): boolean {
  return now >= examAppealDeadline(submittedAt);
}

// ---------- Ràng buộc khung tháng ----------

export interface MonthFrameworkSettings {
  vocabularyCount: number;
  grammarTopicCount: number;
  soundCount: number;
}

export const DEFAULT_MONTH_FRAMEWORK_SETTINGS: MonthFrameworkSettings = { vocabularyCount: 60, grammarTopicCount: 3, soundCount: 4 };

/** N < 90 và N <= 3 × số bài của tháng. */
export function validateMonthFrameworkSettings(settings: MonthFrameworkSettings, lessonCount: number): string[] {
  const errors: string[] = [];
  const { vocabularyCount, grammarTopicCount, soundCount } = settings;
  if (![vocabularyCount, grammarTopicCount, soundCount].every((value) => Number.isInteger(value) && value > 0)) {
    errors.push("N, Y, Z phải là số nguyên dương.");
  }
  if (vocabularyCount >= 90) errors.push("Số từ vựng N phải nhỏ hơn 90.");
  if (vocabularyCount > 3 * lessonCount) errors.push("Số từ vựng N không được vượt 3 × số bài của tháng.");
  return errors;
}

/** Tháng mà Vận hành thấy: tháng trước (chỉ xem), tháng này, tháng sau (sinh được). */
export function operatorVisibleMonths(today: string): { previous: string; current: string; next: string; editable: string[] } {
  const current = monthOf(today);
  return { previous: previousMonth(current), current, next: nextMonth(current), editable: [current, nextMonth(current)] };
}

/** Phạm vi giữ nội dung: ngoài 3 tháng này thì thuộc diện dọn. */
export function isMonthOutsideRetention(month: string, today: string): boolean {
  const visible = operatorVisibleMonths(today);
  return month < visible.previous || month > visible.next;
}

// ---------- Nội bộ ----------

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Invalid date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function parseMonth(month: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new RangeError(`Invalid month: ${month}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function weekdayOf(date: string): number {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatMonth(date: Date): string {
  return formatDate(date).slice(0, 7);
}
