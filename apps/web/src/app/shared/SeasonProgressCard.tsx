import { Check, LockKeyhole } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { InfoTip } from "./CompactUi.js";
import type { LearnerProgressView } from "@e4s/contracts";
import { REWARD_SEASONS, type RewardSeasonLevel } from "@e4s/domain/engagement";
import { Progress } from "../learner/ui.js";
import { REWARD_SEASON_ICONS } from "./reward-badge-icons.js";
import { RewardBadgeArtwork } from "./RewardBadgeArtwork.js";
import "./season-progress-card.css";

const formatPoints = (points: number) => points.toLocaleString("vi-VN");

/** How points are earned (same rules as the server reward sync). */
export const REWARD_POINT_RULES: ReadonlyArray<readonly [label: string, points: string]> = [
  ["Hoàn thành 1 bài học mới (lần đầu)", "+10"],
  ["Mỗi phần bài học làm đúng", "+5 lần 1, giảm 1 điểm mỗi lần làm lại (tối thiểu +1); chỉ tính lần đúng đầu tiên"],
  ["Hoàn thành bài Ôn tuần (thứ Sáu)", "+15"],
  ["1 lượt luyện hợp lệ với Season", "+2"],
  ["Mini game đạt từ 50% điểm tối đa", "+5, tối đa 3 lượt có điểm mỗi ngày (chơi thêm vẫn được, không cộng điểm)"],
  ["Nộp bài thi cuối tháng", "+15"],
  ["Bài kiểm tra đầu vào, thi lên mức", "+10"],
  ["Hoàn thành trọn lịch học tháng (mọi bài mới và bài ôn)", "+20, một lần mỗi tháng"]
];

/** How the Season ladder and the badges work (same rules as the server). */
export const REWARD_SEASON_RULES: readonly string[] = [
  `Mỗi trình độ (A1–C1) có 4 Season: ${REWARD_SEASONS.map((season) => `${REWARD_SEASON_ICONS[season.level]} ${season.shortName}${season.pointsRequired ? ` ${formatPoints(season.pointsRequired)} điểm` : " (bắt đầu)"}`).join(" → ")}, tính bằng điểm kiếm được từ khi vào trình độ.`,
  "Lên Season: đủ điểm trong trình độ và mọi huy hiệu của Season đó; đi lần lượt, không nhảy cấp.",
  "Đổi trình độ (lên mức, kháng nghị, điều chỉnh): Season bắt đầu lại từ Mùa xuân của trình độ mới. Tổng điểm tích lũy và huy hiệu đã nhận được giữ mãi.",
  "Huy hiệu chưa nhận dùng mức yêu cầu của trình độ hiện tại.",
  "Ngày học (Chuỗi ngày học): ngày có bài theo lịch tháng (T2–T5 bài mới, T6 bài ôn) được hoàn thành đúng ngày. Mini game, luyện Season không tính; cuối tuần, ngày nghỉ lễ không tính và không làm đứt chuỗi.",
  "Học trọn tuần: xong mọi bài T2–CN của tuần đó trong lịch tháng. Đúng ngay lần đầu: Nghe, Đọc, Viết, Nói đều đúng ngay lần đầu, từ 80 điểm."
];

type SeasonCardData = Pick<LearnerProgressView, "season" | "points" | "badgeRoadmap"> & { badgeCount: number };

/**
 * `compact` (learner phones/tablets): the summary lines move into the ⓘ of the Season title, the point and
 * Season rules into the ⓘ of "Huy hiệu theo cấp", and every badge is a small chip (icon · name · lock) whose
 * description opens on tap. Without it (desktop, manager simulator) the card renders exactly as before.
 */
export function SeasonProgressCard({ view, certificateAction, revealedBadgeLevel, compact = false }: {
  view: SeasonCardData;
  certificateAction: ReactNode;
  revealedBadgeLevel?: number | undefined;
  compact?: boolean;
}) {
  const levelsId = useId();
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [openBadge, setOpenBadge] = useState<string | null>(null);
  const cefr = view.season.cefr ?? null;
  const pointsInLevel = view.season.pointsInLevel ?? view.points;
  const next = view.season.next;
  const nextBadges = next ? view.badgeRoadmap.filter((badge) => badge.seasonLevel === next.level) : [];
  const missing = nextBadges.filter((badge) => !badge.earned);
  const pointsMet = !next || pointsInLevel >= next.pointsRequired;
  const badgesMet = !next || missing.length === 0;
  const currentLevel = view.season.current.level;
  const current = seasonMeta(currentLevel);
  const showCurrent = currentLevel !== 1 || !next;
  const visibleLevels = [1, 2, 3, 4].filter((level) =>
    showAllBadges || level === revealedBadgeLevel || level === next?.level || (showCurrent && level === currentLevel)
  );
  const inLevel = cefr ? `trong ${cefr}` : "trong trình độ";
  const nextLine = next ? `Tiếp theo: ${next.name}` : `Đã đạt Season cao nhất${cefr ? ` của ${cefr}` : ""}`;
  const rulesTip = <span className="profile-season-rules-tip">
    <b>Cách tính điểm</b>
    <ul data-testid="reward-point-rules">{REWARD_POINT_RULES.map(([label, points]) => <li key={label}>{label}: <b>{points}</b></li>)}</ul>
    <b>Lên Season</b>
    <ul data-testid="reward-season-rules">{REWARD_SEASON_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
  </span>;
  return <section className={`card profile-season-card${compact ? " profile-season-card--compact" : ""}`} aria-label="Mùa học">
    <div className="profile-season-heading">
      <SeasonFigure level={currentLevel} />
      <div>
        <div className="eyebrow">Mùa học {currentLevel}/4{cefr ? ` · Trình độ ${cefr}` : ""}</div>
        {compact ? <h2 className="profile-season-title info-title" data-testid="season-ladder-title"><span className="info-title-text">{current.shortName}{cefr ? ` · ${cefr}` : ""}</span><InfoTip label="Mùa học: chi tiết" text={<>{nextLine}. Điểm {inLevel}: <b>{formatPoints(pointsInLevel)}</b> · Tổng điểm tích lũy: <b>★ {formatPoints(view.points)}</b></>} /></h2> : <>
        <h2 className="profile-season-title" data-testid="season-ladder-title">{current.shortName}{cefr ? ` · ${cefr}` : ""}</h2>
        <div className="small muted">{nextLine}</div>
        <div className="small muted" data-testid="season-points-summary">Điểm {inLevel}: <b>{formatPoints(pointsInLevel)}</b> · Tổng điểm tích lũy: <b>★ {formatPoints(view.points)}</b></div></>}
      </div>
    </div>
    {next && <>
      <div className="profile-season-tracks">
        <SeasonTrack met={pointsMet} title={`Điểm ${inLevel}`} current={pointsInLevel} target={next.pointsRequired} />
        <SeasonTrack met={badgesMet} title="Huy hiệu" current={view.season.earnedBadgeCount} target={view.season.requiredBadgeCount} />
      </div>
      {missing.length > 0 && <p className="small profile-season-missing">
        <b>Thiếu huy hiệu</b> · {missing.map((badge) => badge.label).join(", ")}
      </p>}
    </>}
    <div className="row between profile-badges-heading" style={{ marginTop: 14 }}>{compact ? <h3 className="info-title" style={{ margin: 0 }}><span className="info-title-text">Huy hiệu theo cấp</span><InfoTip label="Cách tính điểm và lên Season" text={rulesTip} /></h3> : <h3 style={{ margin: 0 }}>Huy hiệu theo cấp</h3>}<span className="small muted" style={{ fontWeight: 800 }}>{view.badgeCount}/{view.badgeRoadmap.length} huy hiệu · giữ mãi</span></div>
    <div id={levelsId} className="profile-season-levels">
      {visibleLevels.map((seasonLevel) => {
        const list = view.badgeRoadmap.filter((badge) => badge.seasonLevel === seasonLevel);
        const meta = seasonMeta(seasonLevel);
        const isCurrent = currentLevel === seasonLevel;
        const completed = currentLevel > seasonLevel;
        const nextLevel = currentLevel + 1 === seasonLevel;
        return <div className="profile-season-level" data-season-level={seasonLevel} key={seasonLevel}>
          <div className="profile-season-level-heading">
            <span className={`badge ${completed ? "ok" : nextLevel ? "warn" : isCurrent ? "primary" : ""}`} {...(compact ? { title: `${meta.pointsRequired ? `${formatPoints(meta.pointsRequired)} điểm ${inLevel}` : "Bắt đầu trình độ"}${list.length ? ` + ${list.length} huy hiệu` : ""}` } : {})}>
              <span className="profile-season-emoji" role="img" aria-label={`Biểu tượng ${meta.name}`}>{REWARD_SEASON_ICONS[meta.level]}</span>
              <span>Cấp {seasonLevel} · {meta.name}</span>
            </span>
            {compact ? null : <span className="xs muted">{meta.pointsRequired ? `${formatPoints(meta.pointsRequired)} điểm ${inLevel}` : "Bắt đầu trình độ"}{list.length ? ` + ${list.length} huy hiệu` : " · không yêu cầu huy hiệu"}{completed ? " · đã đạt" : nextLevel ? " · cấp tiếp theo" : isCurrent ? " · đang ở đây" : ""}</span>}
          </div>
          {list.length && compact ? <><div className="badges badge-chips">
            {list.map((badge) => {
              const StatusIcon = badge.earned ? Check : LockKeyhole;
              const isOpen = openBadge === badge.key;
              return <button type="button" className={`bdg-chip${badge.earned ? " is-earned" : ""}`} key={badge.key} data-badge-key={badge.key} aria-expanded={isOpen} title={badge.description} onClick={() => setOpenBadge(isOpen ? null : badge.key)}>
                <RewardBadgeArtwork className="profile-badge-emoji" badgeKey={badge.key} label={badge.label} />
                <b>{badge.label}</b>
                <span className="profile-badge-state" role="img" aria-label={badge.earned ? "Đã đạt" : "Chưa đạt"}><StatusIcon size={13} aria-hidden="true" /></span>
              </button>;
            })}
          </div>{list.some((badge) => badge.key === openBadge) ? <p className="small profile-badge-tip" role="note">{(() => { const badge = list.find((item) => item.key === openBadge)!; return <><b>{badge.label}</b> · {badge.description}{badge.earned ? ` · ${badge.earnedLevel ? `Đạt ở ${badge.earnedLevel}` : "Đã đạt"}` : ""}</>; })()}</p> : null}</>
          : list.length ? <div className="badges">
            {list.map((badge) => {
              const StatusIcon = badge.earned ? Check : LockKeyhole;
              return <article className={`bdg${badge.earned ? "" : " off"}`} key={badge.key} data-badge-key={badge.key}>
                <span className="profile-badge-state" role="img" aria-label={badge.earned ? "Đã đạt" : "Chưa đạt"}>
                  <StatusIcon size={14} aria-hidden="true" />
                </span>
                <RewardBadgeArtwork className="profile-badge-emoji" badgeKey={badge.key} label={badge.label} />
                <b>{badge.label}</b>
                {badge.earned && <span className="xs profile-badge-earned-level">{badge.earnedLevel ? `Đạt ở ${badge.earnedLevel}` : "Đã đạt"}</span>}
                <span className="profile-badge-description">{badge.description}</span>
              </article>;
            })}
          </div> : compact ? null : <p className="profile-season-empty xs muted">Mùa bắt đầu của mỗi trình độ. Đủ điều kiện từ đây sẽ mở Cấp 2.</p>}
        </div>;
      })}
    </div>
    <div className="profile-season-actions"><button type="button" className="btn btn-sm" aria-controls={levelsId} aria-expanded={showAllBadges} onClick={() => setShowAllBadges((value) => !value)}>{showAllBadges ? "Thu gọn huy hiệu" : "Xem tất cả huy hiệu"}</button>
    {certificateAction}</div>
    {compact ? null : <details style={{ marginTop: 10 }}><summary className="small" style={{ fontWeight: 800, cursor: "pointer" }}>Cách tính điểm và lên Season</summary>
      <ul className="small" data-testid="reward-point-rules" style={{ margin: "6px 0 0", paddingLeft: 20 }}>{REWARD_POINT_RULES.map(([label, points]) => <li key={label}>{label}: <b>{points}</b></li>)}</ul>
      <ul className="small" data-testid="reward-season-rules" style={{ margin: "6px 0 0", paddingLeft: 20 }}>{REWARD_SEASON_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
    </details>}
  </section>;
}

function seasonMeta(level: number) {
  return REWARD_SEASONS.find((season) => season.level === level) ?? REWARD_SEASONS[0]!;
}

function SeasonTrack({ met, title, current, target }: { met: boolean; title: string; current: number; target: number }) {
  return <div className={`profile-season-track${met ? " is-met" : ""}`}>
    <div className="profile-season-track-label">
      <b className="small">{title}</b>
      {met && <Check className="status-icon" aria-hidden="true" />}
      <span className="sr-only"> · {met ? "Đạt" : "Chưa đạt"}</span>
    </div>
    <strong>{formatPoints(current)} / {formatPoints(target)}</strong>
    <Progress value={current} max={target} label={title} />
  </div>;
}

export function SeasonFigure({ level }: { level: number }) {
  const sizes = [64, 76, 88, 100];
  const index = Math.max(0, Math.min(3, level - 1));
  const season = REWARD_SEASONS[index]!;
  const outerSize = sizes[index]! + 28;
  return <span className="profile-season-figure" data-season-level={level} role="img" aria-label={season.shortName} style={{ position: "relative", display: "inline-grid", placeItems: "center", flexShrink: 0, width: outerSize, height: outerSize, borderRadius: "50%" }}><span className="profile-season-figure-emoji" aria-hidden="true">{REWARD_SEASON_ICONS[season.level as RewardSeasonLevel]}</span></span>;
}
