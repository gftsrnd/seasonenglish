const MEDALS: Record<1 | 2 | 3, { file: string; label: string }> = {
  1: { file: "/arena/medal-gold.svg", label: "Hạng 1 · huy hiệu vàng" },
  2: { file: "/arena/medal-silver.svg", label: "Hạng 2 · huy hiệu bạc" },
  3: { file: "/arena/medal-bronze.svg", label: "Hạng 3 · huy hiệu đồng" }
};

/**
 * Rank cell of the leaderboard. Ranks 1–3 get the gold / silver / bronze medal (files in
 * public/arena, drawn in the seven-season HUD style) on a two-tail ribbon whose colours are the
 * season theme tokens (--primary / --primary-dark), so it matches all 7 themes. Ranks 4+ stay plain numbers.
 */
export function RankBadge({ rank }: { rank: number }) {
  if (rank !== 1 && rank !== 2 && rank !== 3) return <span className="rank-badge rank-badge--plain" aria-label={`Hạng ${rank}`}>{rank}</span>;
  const medal = MEDALS[rank];
  return <span className={`rank-badge rank-badge--medal rank-badge--${rank}`} data-rank={rank} role="img" aria-label={medal.label}>
    <span className="rank-badge__ribbon" aria-hidden="true" />
    <img className="rank-badge__medal" src={medal.file} alt="" draggable={false} />
    <span className="rank-badge__num" aria-hidden="true">{rank}</span>
  </span>;
}
