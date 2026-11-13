import type { CefrLevel } from "@e4s/contracts";
import { REWARD_BADGE_KEYS, REWARD_BADGE_LABELS, rewardBadgeDescription } from "@e4s/domain/engagement";

/** The eight Season badges with their rule at a level (same catalog and thresholds as the server). */
export function rewardBadgeCatalogAt(level: CefrLevel) {
  return REWARD_BADGE_KEYS.map((key) => [key, REWARD_BADGE_LABELS[key], rewardBadgeDescription(key, level)] as const);
}

export const rewardBadgeCatalog = rewardBadgeCatalogAt("A1");
