import { rewardBadgeIcon, rewardBadgeIconForLabel } from "./reward-badge-icons.js";

export function RewardBadgeArtwork({ badgeKey, label, className }: { badgeKey: string; label: string; className?: string }) {
  return <span className={className} role="img" aria-label={`Biểu tượng ${label}`}>
    {rewardBadgeIcon(badgeKey) ?? rewardBadgeIconForLabel(label) ?? "🏅"}{/* media-scan: allow-avatar-reward -- deliberate reward symbol */}
  </span>;
}
