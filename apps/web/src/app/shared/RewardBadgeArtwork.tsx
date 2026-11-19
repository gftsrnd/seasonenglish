import { RewardBadgeImage } from "./RewardIcon.js";

/** A badge's owner-supplied picture (19/11), sized by the wrapper's font size (1.25em). */
export function RewardBadgeArtwork({ badgeKey, label, className }: { badgeKey: string; label: string; className?: string }) {
  return <span className={["reward-badge-art", className].filter(Boolean).join(" ")} role="img" aria-label={`Biểu tượng ${label}`}>
    <RewardBadgeImage badgeKey={badgeKey} label={label} className="reward-badge-art__img" />
  </span>;
}
