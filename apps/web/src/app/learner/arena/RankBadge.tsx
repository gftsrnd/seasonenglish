const MEDALS: Record<1 | 2 | 3, { file: string; label: string }> = {
  1: { file: "/arena/medal-gold.svg", label: "Hạng 1 · huy chương vàng" },
  2: { file: "/arena/medal-silver.svg", label: "Hạng 2 · huy chương bạc" },
  3: { file: "/arena/medal-bronze.svg", label: "Hạng 3 · huy chương đồng" }
};

/**
 * Rank cell of the leaderboard. Ranks 1–3 get a round gold / silver / bronze medal (files in
 * public/arena, number included) hanging from a two-strap ribbon drawn in CSS with the season theme
 * colours (--primary / --primary-dark), so it fits all 7 themes. Ranks 4+ stay plain numbers.
 */
export function RankBadge({ rank, size = "normal", label }: { rank: number; size?: "normal" | "large"; label?: number }) {
  if (rank !== 1 && rank !== 2 && rank !== 3) return <span className="rank-badge rank-badge--plain" aria-label={`Hạng ${label ?? rank}`}>{label ?? rank}</span>;
  const medal = MEDALS[rank];
  return <span className={`rank-badge rank-badge--medal rank-badge--${rank} rank-badge--${size}`} data-rank={rank} role="img" aria-label={medal.label}>
    <span className="rank-badge__ribbon" aria-hidden="true"><i /><i /></span>
    <img className="rank-badge__medal" src={medal.file} alt="" draggable={false} />
  </span>;
}
