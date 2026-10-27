import type { AssessmentSectionCode, CefrLevel } from "@e4s/contracts";

export interface WeeklyPracticeValidationInput {
  cefr: CefrLevel;
  text: string;
  weeklyVocabulary: readonly string[];
}

export interface LevelReadinessThresholds {
  days: number;
  lessons: number;
  firstTry: number;
  submission: number;
  coach: number;
  coachTurns: number;
  wrong: number;
  minParts: number;
}

export interface LevelReadinessMetrics {
  lessonCompletion: number;
  firstTryAccuracy: number;
  weeklyPractice: number;
  coachRubric: number;
  coachTurns: number;
  wrongRate: number;
  attemptedParts: number;
}

export type LevelReadinessCriterionKey = "lessonCompletion" | "firstTryAccuracy" | "weeklyPractice" | "coachRubric" | "wrongRate";

export function validateWeeklyPractice(input: WeeklyPracticeValidationInput): { valid: boolean; errors: string[] } {
  const text = input.text.trim();
  const errors: string[] = [];
  const words = countWords(text);

  if (words < 8) errors.push("Bài thực hành cần ít nhất 8 từ.");

  if (input.cefr === "A1" || input.cefr === "A2") {
    const sentenceCount = countSentences(text);
    if (sentenceCount < 3 || sentenceCount > 5) errors.push("Bài A1–A2 cần từ 3 đến 5 câu.");
    const usedVocabulary = new Set(input.weeklyVocabulary
      .map((entry) => normalize(entry))
      .filter((entry) => entry && normalize(text).includes(entry)));
    if (usedVocabulary.size < 3) errors.push("Hãy dùng ít nhất 3 từ hoặc cụm từ của tuần.");
  } else if (input.cefr === "B1") {
    if (words < 80 || words > 120) errors.push("Bài B1 cần từ 80 đến 120 từ.");
  } else {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
    const validDialogue = lines >= 8 && lines <= 12;
    const validReflection = words >= 120 && words <= 180;
    if (!validDialogue && !validReflection) {
      errors.push("Bài B2–C1 cần hội thoại 8–12 dòng hoặc bài phản hồi 120–180 từ.");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function calculateWeeklyPracticeScore(input: {
  meaning: number;
  vocabulary: number;
  grammar: number;
  offTopic: boolean;
}): number {
  for (const value of [input.meaning, input.vocabulary, input.grammar]) {
    if (!Number.isFinite(value) || value < 0 || value > 5) throw new RangeError("Weekly-practice rubric scores must be between 0 and 5");
  }
  const weighted = (input.meaning * 0.4 + input.vocabulary * 0.3 + input.grammar * 0.3) * 20;
  return round(Math.min(input.offTopic ? 30 : 100, weighted));
}

export function buildLevelReadiness(input: {
  metrics: LevelReadinessMetrics;
  thresholds: LevelReadinessThresholds;
  examAvailable: boolean;
}) {
  const criteria: Array<{ key: LevelReadinessCriterionKey; current: number; target: number; met: boolean }> = [
    criterion("lessonCompletion", input.metrics.lessonCompletion, input.thresholds.lessons),
    criterion("firstTryAccuracy", input.metrics.firstTryAccuracy, input.thresholds.firstTry),
    criterion("weeklyPractice", input.metrics.weeklyPractice, input.thresholds.submission),
    {
      ...criterion("coachRubric", input.metrics.coachRubric, input.thresholds.coach),
      met: input.metrics.coachRubric >= input.thresholds.coach && input.metrics.coachTurns >= input.thresholds.coachTurns
    }
  ];
  return {
    windowDays: input.thresholds.days,
    criteria,
    eligible: input.examAvailable && criteria.every((item) => item.met),
    examAvailable: input.examAvailable
  };
}

export function passesLevelUpExam(
  scores: Record<AssessmentSectionCode, number>,
  maxima: Record<AssessmentSectionCode, number>
): boolean {
  const sections = Object.keys(scores) as AssessmentSectionCode[];
  if (sections.some((section) => !Number.isFinite(scores[section]) || maxima[section] <= 0)) return false;
  const total = sections.reduce((sum, section) => sum + scores[section], 0);
  return total >= 70 && sections.every((section) => scores[section] / maxima[section] >= 0.5);
}

export function createLevelRetryPlan(input: {
  failedAt: Date;
  scores: Record<AssessmentSectionCode, number>;
  readinessSnapshot: LevelReadinessMetrics;
}) {
  const weakestSkill = (Object.entries(input.scores) as Array<[AssessmentSectionCode, number]>)
    .sort((left, right) => left[1] - right[1])[0]?.[0] ?? "listening";
  return {
    eligibleAt: new Date(input.failedAt.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    weakestSkill,
    readinessSnapshot: { ...input.readinessSnapshot }
  };
}

export function nextEffectiveMonday(now: Date, timeZone = "Asia/Ho_Chi_Minh"): string {
  const local = zonedParts(now, timeZone);
  const localCalendarDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const daysUntilMonday = (8 - localCalendarDate.getUTCDay()) % 7 || 7;
  localCalendarDate.setUTCDate(localCalendarDate.getUTCDate() + daysUntilMonday);
  return zonedMidnightToUtc({
    year: localCalendarDate.getUTCFullYear(),
    month: localCalendarDate.getUTCMonth() + 1,
    day: localCalendarDate.getUTCDate()
  }, timeZone).toISOString();
}

function criterion(key: LevelReadinessCriterionKey, current: number, target: number) {
  return { key, current: round(current), target, met: current >= target };
}

function countWords(value: string): number {
  return value.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function countSentences(value: string): number {
  return value.split(/[.!?]+(?:\s+|$)|\r?\n+/).map((part) => part.trim()).filter(Boolean).length;
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function zonedMidnightToUtc(date: { year: number; month: number; day: number }, timeZone: string): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day);
  const represented = zonedParts(new Date(guess), timeZone);
  const representedAsUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute, represented.second);
  return new Date(guess - (representedAsUtc - guess));
}
