import { Award } from "lucide-react";
import type { RewardSeasonLevel } from "@e4s/domain/engagement";
import { rewardBadgeIcon, rewardBadgeKey, rewardBadgeKeyForLabel } from "./reward-badge-icons.js";

import "./reward-icon.css";

/** Owner-supplied progress art (19/11): /media/rewards/<key>.webp for the eight badges and the four Seasons. */
const SEASON_FILES: Readonly<Record<RewardSeasonLevel, string>> = { 1: "spring", 2: "summer", 3: "autumn", 4: "winter" };

/** A badge's picture by key (aliases resolved) or by its label; unknown badges get a plain award mark. */
export function RewardBadgeImage({ badgeKey, label, size = 24, className }: { badgeKey?: string; label?: string; size?: number; className?: string }) {
  const key = badgeKey && rewardBadgeIcon(badgeKey) ? rewardBadgeKey(badgeKey) : label ? rewardBadgeKeyForLabel(label) : undefined;
  if (!key) return <Award className={className} size={size} strokeWidth={1.8} aria-hidden="true" />;
  return <img className={["reward-icon", className].filter(Boolean).join(" ")} src={`/media/rewards/${key}.webp`} alt="" width={size} height={size} decoding="async" draggable={false} />;
}

/** A Season's picture: 1 Mùa xuân, 2 Mùa hạ, 3 Mùa thu, 4 Mùa đông. */
export function RewardSeasonImage({ level, size = 24, className }: { level: number; size?: number; className?: string }) {
  const file = SEASON_FILES[Math.max(1, Math.min(4, Math.trunc(level))) as RewardSeasonLevel];
  return <img className={["reward-icon", className].filter(Boolean).join(" ")} src={`/media/rewards/${file}.webp`} alt="" width={size} height={size} decoding="async" draggable={false} />;
}
