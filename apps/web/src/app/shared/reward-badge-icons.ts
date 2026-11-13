import { REWARD_BADGE_LABELS, REWARD_SEASONS, rewardSeasonFor, type RewardSeasonLevel } from "@e4s/domain/engagement";

const rewardBadgeIcons: Readonly<Record<string, string>> = {
  starter: "🐣", // media-scan: allow-avatar-reward -- deliberate reward symbol
  streak: "🔥", // media-scan: allow-avatar-reward -- deliberate reward symbol
  week_complete: "🗓️", // media-scan: allow-avatar-reward -- deliberate reward symbol
  friday: "⏰", // media-scan: allow-avatar-reward -- deliberate reward symbol
  coach_friend: "💬", // media-scan: allow-avatar-reward -- deliberate reward symbol
  first_try: "🎯", // media-scan: allow-avatar-reward -- deliberate reward symbol
  monthly_final_score: "📝", // media-scan: allow-avatar-reward -- deliberate reward symbol
  wordsmith: "🔑" // media-scan: allow-avatar-reward -- deliberate reward symbol
};

/** Old client keys and the retired streak badges map to the current badge keys. */
const badgeAliases = new Map([
  ["first", "starter"],
  ["week", "week_complete"],
  ["streak3", "streak"],
  ["streak5", "streak"],
  ["streak7", "streak"],
  ["sharp", "first_try"],
  ["words", "wordsmith"],
  ["chat", "coach_friend"]
]);

/** Labels (current and earlier names) to badge keys, for notifications that carry the label only. */
const labelKeys = new Map<string, string>([
  ...Object.entries(REWARD_BADGE_LABELS).map(([key, label]) => [label, key] as [string, string]),
  ["Đúng ngay lần đầu", "first_try"],
  ["Chuỗi 3 ngày", "streak"],
  ["Chuỗi 5 ngày", "streak"]
]);

export function rewardBadgeKey(key: string) {
  return badgeAliases.get(key) ?? key;
}

export function rewardBadgeIcon(key: string): string | undefined {
  const canonical = rewardBadgeKey(key);
  return Object.hasOwn(rewardBadgeIcons, canonical) ? rewardBadgeIcons[canonical] : undefined;
}

export function rewardBadgeIconForLabel(label: string): string | undefined {
  const key = labelKeys.get(label.trim());
  return key ? rewardBadgeIcon(key) : undefined;
}

export const REWARD_SEASON_ICONS: Readonly<Record<RewardSeasonLevel, string>> = {
  1: "🌱", // media-scan: allow-avatar-reward -- deliberate reward symbol
  2: "☀️", // media-scan: allow-avatar-reward -- deliberate reward symbol
  3: "🍂", // media-scan: allow-avatar-reward -- deliberate reward symbol
  4: "❄️" // media-scan: allow-avatar-reward -- deliberate reward symbol
};

/** Season of a learner row: the server's Season of the current level, or the same ladder rule on the points in level. */
export function rewardSeasonOfLearner(learner: {
  rewardPoints: number; rewardPointsInLevel?: number; rewardSeasonLevel?: number;
  earnedBadges: readonly string[]; earnedBadgeDetails?: readonly { key: string }[];
}) {
  const level = (learner.rewardSeasonLevel ?? rewardSeasonFor(learner.rewardPointsInLevel ?? learner.rewardPoints,
    new Set([...learner.earnedBadges, ...(learner.earnedBadgeDetails ?? []).map((badge) => badge.key)].map(rewardBadgeKey))).level) as RewardSeasonLevel;
  const season = REWARD_SEASONS.find((item) => item.level === level) ?? REWARD_SEASONS[0]!;
  return { ...season, icon: REWARD_SEASON_ICONS[season.level], index: season.level - 1, pointsInLevel: learner.rewardPointsInLevel ?? learner.rewardPoints };
}
