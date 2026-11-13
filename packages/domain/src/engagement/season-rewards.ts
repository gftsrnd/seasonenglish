import type { CefrLevel } from "@e4s/contracts";

/**
 * Season reward rules (monthly product).
 *
 * - Lifetime points are kept forever (reward ledger); the Season ladder is
 *   climbed per CEFR level with the points earned since the learner entered
 *   the current level ("điểm trong mức"). A level change of any kind restarts
 *   the ladder at Mùa xuân for the new level.
 * - Every level has the same four Seasons and thresholds; each Season also
 *   needs all of its badges, and Seasons are climbed strictly in order.
 * - Badges are earned once and kept forever. A badge not yet earned uses the
 *   threshold of the learner's current level at the time it is earned.
 */

export type RewardSeasonKey = "spring" | "summer" | "autumn" | "winter";
export type RewardSeasonLevel = 1 | 2 | 3 | 4;

export const REWARD_BADGE_KEYS = [
  "starter", "streak", "week_complete", "friday", "coach_friend", "first_try", "monthly_final_score", "wordsmith"
] as const;
export type RewardBadgeKey = (typeof REWARD_BADGE_KEYS)[number];

/** Badge keys of the retired ladder ("Chuỗi 3 ngày", "Chuỗi 5 ngày"); kept in old ledgers, never counted. */
export const RETIRED_REWARD_BADGE_KEYS = ["streak3", "streak5"] as const;

export interface RewardSeason {
  key: RewardSeasonKey;
  level: RewardSeasonLevel;
  /** Full name, e.g. "Mùa thu – gặt hái". */
  name: string;
  /** Short name, e.g. "Mùa thu". */
  shortName: string;
  /** Points earned in the current level needed for this Season. */
  pointsRequired: number;
  badges: readonly RewardBadgeKey[];
}

export const REWARD_SEASONS: readonly RewardSeason[] = [
  { key: "spring", level: 1, name: "Mùa xuân – gieo hạt", shortName: "Mùa xuân", pointsRequired: 0, badges: [] },
  { key: "summer", level: 2, name: "Mùa hạ – đón nắng", shortName: "Mùa hạ", pointsRequired: 500, badges: ["starter", "streak"] },
  { key: "autumn", level: 3, name: "Mùa thu – gặt hái", shortName: "Mùa thu", pointsRequired: 2000, badges: ["week_complete", "friday", "coach_friend"] },
  { key: "winter", level: 4, name: "Mùa đông – vững vàng", shortName: "Mùa đông", pointsRequired: 5000, badges: ["first_try", "monthly_final_score", "wordsmith"] }
];

/** Monthly final threshold: "passed" uses the monthly pass rule (≥ 70 and every skill ≥ 15). */
export type MonthlyFinalThreshold = number | "passed";

type Thresholds<T> = Readonly<Record<CefrLevel, T>>;

/** Per-level thresholds of every badge (the learner's current level decides a badge not yet earned). */
export const REWARD_BADGE_THRESHOLDS: {
  readonly starter: Thresholds<number>;
  readonly streak: Thresholds<number>;
  readonly week_complete: Thresholds<number>;
  readonly friday: Thresholds<number>;
  readonly coach_friend: Thresholds<number>;
  readonly wordsmith: Thresholds<number>;
  readonly first_try: Thresholds<number>;
  readonly monthly_final_score: Thresholds<MonthlyFinalThreshold>;
} = {
  starter: { A1: 1, A2: 1, B1: 1, B2: 1, C1: 1 },
  streak: { A1: 10, A2: 10, B1: 5, B2: 5, C1: 5 },
  week_complete: { A1: 3, A2: 3, B1: 2, B2: 2, C1: 2 },
  friday: { A1: 4, A2: 4, B1: 3, B2: 3, C1: 3 },
  coach_friend: { A1: 20, A2: 30, B1: 50, B2: 70, C1: 100 },
  wordsmith: { A1: 15, A2: 20, B1: 30, B2: 40, C1: 50 },
  first_try: { A1: 1, A2: 2, B1: 3, B2: 5, C1: 5 },
  monthly_final_score: { A1: "passed", A2: 75, B1: 80, B2: 85, C1: 90 }
};

export const REWARD_BADGE_LABELS: Readonly<Record<RewardBadgeKey, string>> = {
  starter: "Khởi đầu",
  streak: "Chuỗi ngày học",
  week_complete: "Tuần trọn vẹn",
  friday: "Ôn tập đúng hẹn",
  coach_friend: "Bạn của Season",
  first_try: "Chuẩn ngay lần đầu",
  monthly_final_score: "Điểm thi tháng",
  wordsmith: "Thợ chữ"
};

/** The level whose thresholds apply when the learner has no approved level yet. */
export const DEFAULT_REWARD_LEVEL: CefrLevel = "A1";

export function rewardBadgeThreshold(key: "monthly_final_score", level: CefrLevel | null | undefined): MonthlyFinalThreshold;
export function rewardBadgeThreshold(key: Exclude<RewardBadgeKey, "monthly_final_score">, level: CefrLevel | null | undefined): number;
export function rewardBadgeThreshold(key: RewardBadgeKey, level: CefrLevel | null | undefined): number | MonthlyFinalThreshold;
export function rewardBadgeThreshold(key: RewardBadgeKey, level: CefrLevel | null | undefined): number | MonthlyFinalThreshold {
  return REWARD_BADGE_THRESHOLDS[key][level ?? DEFAULT_REWARD_LEVEL];
}

/** The rule text of a badge at a level ("Học 5 ngày liên tiếp" at B1). */
export function rewardBadgeDescription(key: string, level: CefrLevel | null | undefined): string {
  const cefr = level ?? DEFAULT_REWARD_LEVEL;
  switch (key) {
    case "starter": return "Xong bài học đầu tiên";
    case "streak": return `Học ${REWARD_BADGE_THRESHOLDS.streak[cefr]} ngày liên tiếp`;
    case "week_complete": return `Học trọn ${REWARD_BADGE_THRESHOLDS.week_complete[cefr]} tuần`;
    case "friday": return `${REWARD_BADGE_THRESHOLDS.friday[cefr]} bài Ôn tuần đúng hẹn`;
    case "coach_friend": return `${REWARD_BADGE_THRESHOLDS.coach_friend[cefr]} lượt luyện với Season`;
    case "wordsmith": return `Dùng ${REWARD_BADGE_THRESHOLDS.wordsmith[cefr]} từ khác nhau với Season`;
    case "first_try": {
      const count = REWARD_BADGE_THRESHOLDS.first_try[cefr];
      return `${count} bài đúng ngay lần đầu`;
    }
    case "monthly_final_score": {
      const threshold = REWARD_BADGE_THRESHOLDS.monthly_final_score[cefr];
      return threshold === "passed" ? "Đạt một bài thi tháng" : `Thi tháng đạt từ ${threshold} điểm`;
    }
    default: return "Tiêu chí được xác định trong hệ thống";
  }
}

/** The Season reached with `pointsInLevel` and the earned badges; in order, never skipping a tier. */
export function rewardSeasonFor(pointsInLevel: number, badges: ReadonlySet<string>): RewardSeason {
  let current = REWARD_SEASONS[0]!;
  for (const season of REWARD_SEASONS.slice(1)) {
    if (pointsInLevel < season.pointsRequired || !season.badges.every((badge) => badges.has(badge))) break;
    current = season;
  }
  return current;
}

export function nextRewardSeason(pointsInLevel: number, badges: ReadonlySet<string>): RewardSeason | null {
  const current = rewardSeasonFor(pointsInLevel, badges);
  return REWARD_SEASONS.find((season) => season.level === current.level + 1) ?? null;
}

/** Points of the next Season of the current ladder, or null once Mùa đông is reached. */
export function nextRewardSeasonPoints(pointsInLevel: number, badges: ReadonlySet<string>): number | null {
  return nextRewardSeason(pointsInLevel, badges)?.pointsRequired ?? null;
}

/** "Mùa thu · B1" */
export function rewardSeasonLabel(season: Pick<RewardSeason, "shortName">, level: CefrLevel | null | undefined): string {
  return level ? `${season.shortName} · ${level}` : season.shortName;
}

export interface ScheduledLessonDay {
  /** Organisation date (YYYY-MM-DD) of a scheduled monthly lesson (new lesson or Friday review). */
  date: string;
  /** The learner completed that day's lesson on that day. */
  completedOnTime: boolean;
}

/**
 * Longest run of consecutive learning days. Only calendar days with a scheduled
 * monthly lesson take part: such a day counts when its lesson was completed on
 * that day and breaks the run otherwise. Weekends, holidays and days without a
 * scheduled lesson neither count nor break the run; games or Season practice
 * alone never make a learning day. Days after `today` are not judged yet.
 */
export function longestScheduledLessonStreak(days: readonly ScheduledLessonDay[], options: { holidays?: Iterable<string>; today?: string } = {}): number {
  const holidays = new Set(options.holidays ?? []);
  const byDate = new Map<string, boolean>();
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) continue;
    byDate.set(day.date, (byDate.get(day.date) ?? false) || day.completedOnTime);
  }
  let longest = 0;
  let current = 0;
  for (const date of [...byDate.keys()].sort()) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6 || holidays.has(date)) continue;
    const done = byDate.get(date)!;
    if (!done && options.today && date >= options.today) continue;
    current = done ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}
