import { useId } from "react";

const METALS: Record<1 | 2 | 3, { label: string; light: string; mid: string; dark: string; ink: string }> = {
  1: { label: "Hạng 1 · huy chương vàng", light: "#FFF1B8", mid: "#F5C842", dark: "#C08A12", ink: "#6B4A06" },
  2: { label: "Hạng 2 · huy chương bạc", light: "#FFFFFF", mid: "#CDD3DA", dark: "#8C96A3", ink: "#3E4752" },
  3: { label: "Hạng 3 · huy chương đồng", light: "#FFE0C7", mid: "#E09A62", dark: "#9C5A2B", ink: "#4F2A10" }
};

/**
 * Rank cell of the leaderboard. Ranks 1–3 get a round gold / silver / bronze medal hanging from a
 * two-strap ribbon in the season theme colours (--primary / --primary-dark), so it fits all 7
 * themes; the rank number sits in the medal. Ranks 4+ stay plain numbers.
 */
export function RankBadge({ rank, size = "normal" }: { rank: number; size?: "normal" | "large" }) {
  const id = useId().replace(/:/g, "");
  if (rank !== 1 && rank !== 2 && rank !== 3) return <span className="rank-badge rank-badge--plain" aria-label={`Hạng ${rank}`}>{rank}</span>;
  const metal = METALS[rank];
  return <span className={`rank-badge rank-badge--medal rank-badge--${rank} rank-badge--${size}`} data-rank={rank} role="img" aria-label={metal.label}>
    <svg viewBox="0 0 40 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={metal.light} />
          <stop offset=".55" stopColor={metal.mid} />
          <stop offset="1" stopColor={metal.dark} />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={metal.light} />
          <stop offset="1" stopColor={metal.mid} />
        </linearGradient>
      </defs>
      <path d="M8 0h10l5 19-8 2z" fill="var(--primary)" />
      <path d="M32 0H22l-5 19 8 2z" fill="var(--primary-dark)" />
      <circle cx="20" cy="32" r="14.5" fill={`url(#${id}-face)`} stroke={metal.dark} strokeWidth="1.5" />
      <circle cx="20" cy="32" r="10.5" fill={`url(#${id}-inner)`} stroke={metal.dark} strokeWidth=".9" strokeOpacity=".55" />
      <path d="M11.5 27.5a9.5 9.5 0 0 1 6-5.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeOpacity=".8" />
      <text x="20" y="36.6" textAnchor="middle" fontSize="13" fontWeight="800" fill={metal.ink} fontFamily="inherit">{rank}</text>
    </svg>
  </span>;
}
