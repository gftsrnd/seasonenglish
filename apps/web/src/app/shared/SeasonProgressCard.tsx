import { Check, Info, LockKeyhole } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { InfoTip } from "./CompactUi.js";
import type { LearnerProgressView } from "@e4s/contracts";
import { REWARD_SEASONS, type RewardSeasonLevel } from "@e4s/domain/engagement";
import { Modal, Progress } from "../learner/ui.js";
import { RewardSeasonImage } from "./RewardIcon.js";
import { RulesDisclosure, RulesIconButton } from "./RulesDisclosure.js";
import { RewardBadgeArtwork } from "./RewardBadgeArtwork.js";
import "./season-progress-card.css";
import "./reward-point-rules.css";

const formatPoints = (points: number) => points.toLocaleString("vi-VN");

/**
 * How points are earned (same rules as the server reward sync): short rows "Việc · +điểm", and the condition,
 * only when it matters, in the same sentence.
 */
export const REWARD_POINT_GROUPS: ReadonlyArray<{ title: string; rules: ReadonlyArray<readonly [label: string, points: string, condition?: string]> }> = [
  { title: "Học bài", rules: [
    ["Bài học mới (lần đầu)", "+10"],
    ["Mỗi phần bài học làm đúng", "+5", "mỗi lần làm lại bớt 1, ít nhất +1"],
    ["Bài Ôn tuần (thứ Sáu)", "+15"],
    ["Học trọn lịch tháng", "+20", "1 lần mỗi tháng"]
  ] },
  { title: "Luyện tập", rules: [
    ["1 lượt luyện với Season", "+2"],
    ["Mini game đạt từ 50/100", "+5", "tối đa 3 lượt mỗi ngày"],
    ["Ván đấu trường đạt từ 50/100", "+5", "tính chung 3 lượt mỗi ngày với mini game"]
  ] },
  { title: "Bài thi", rules: [
    ["Nộp bài thi cuối tháng", "+15"],
    ["Test đầu vào, thi lên mức", "+10"]
  ] }
];

/** Flat "label: points" list (manager simulator tip). */
export const REWARD_POINT_RULES: ReadonlyArray<readonly [label: string, points: string]> = REWARD_POINT_GROUPS.flatMap((group) =>
  group.rules.map(([label, points, condition]) => [label, condition ? `${points}, ${condition}` : points] as const));

/** The point rules: one plain line per action, grouped. */
function RewardPointRules({ className }: { className?: string }) {
  return <div className={`rules-points reward-point-rules${className ? ` ${className}` : ""}`} data-testid="reward-point-rules">
    {REWARD_POINT_GROUPS.map((group) => <section key={group.title} className="reward-point-group">
      <h4>{group.title}</h4>
      <dl>{group.rules.map(([label, points, condition]) => <div key={label}><dt>{label}{condition ? <small>{condition}</small> : null}</dt><dd>{points}</dd></div>)}</dl>
    </section>)}
  </div>;
}

/** Phones: the rules open in a popup (≤80% high, sticky header with ×), in two tabs, never as an inline popover. */
function RewardRulesDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"points" | "season">("points");
  return <Modal title="Cách tính điểm và lên Season" className="reward-rules-dialog" onClose={onClose} dismissOnBackdrop>
    <div className="reward-rules-tabs" role="tablist" aria-label="Luật điểm">
      <button type="button" role="tab" aria-selected={tab === "points"} onClick={() => setTab("points")}>Cách tính điểm</button>
      <button type="button" role="tab" aria-selected={tab === "season"} onClick={() => setTab("season")}>Lên Season</button>
    </div>
    {tab === "points" ? <RewardPointRules /> : <ul className="reward-season-list rules-list" data-testid="reward-season-rules">{REWARD_SEASON_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>}
  </Modal>;
}

/** How the Season ladder and the badges work (same rules as the server). */
export const REWARD_SEASON_RULES: readonly string[] = [
  `Mỗi trình độ (A1–C1) có 4 Season: ${REWARD_SEASONS.map((season) => `${season.shortName}${season.pointsRequired ? ` ${formatPoints(season.pointsRequired)} điểm` : " (bắt đầu)"}`).join(" → ")}, tính bằng điểm kiếm được từ khi vào trình độ.`,
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
  const [rulesOpen, setRulesOpen] = useState(false);
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
    <div className="row between profile-badges-heading" style={{ marginTop: 14 }}>{compact ? <h3 className="info-title" style={{ margin: 0 }}><span className="info-title-text">Huy hiệu theo cấp</span><RulesIconButton label="Cách tính điểm và lên Season" onClick={() => setRulesOpen(true)} /></h3> : <h3 style={{ margin: 0 }}>Huy hiệu theo cấp</h3>}<span className="small muted" style={{ fontWeight: 800 }}>{view.badgeCount}/{view.badgeRoadmap.length} huy hiệu</span></div>
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
              <span className="profile-season-emoji" role="img" aria-label={`Biểu tượng ${meta.name}`}><RewardSeasonImage level={meta.level} size={18} /></span>
              <span>Cấp {seasonLevel} · {meta.shortName}</span>
            </span>
            {compact ? null : <span className="xs muted">{meta.pointsRequired ? `${formatPoints(meta.pointsRequired)} điểm` : "Bắt đầu"}{list.length ? ` + ${list.length} huy hiệu` : ""}{completed ? " · đã đạt" : isCurrent ? " · đang ở đây" : ""}</span>}
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
          </div> : null}
        </div>;
      })}
    </div>
    {rulesOpen ? <RewardRulesDialog onClose={() => setRulesOpen(false)} /> : null}
    <div className="profile-season-actions"><button type="button" className="btn btn-sm" aria-controls={levelsId} aria-expanded={showAllBadges} onClick={() => setShowAllBadges((value) => !value)}>{showAllBadges ? "Thu gọn huy hiệu" : "Xem tất cả huy hiệu"}</button>
    {certificateAction}</div>
    {compact ? null : <RulesDisclosure title="Cách tính điểm và lên Season">
      <RewardPointRules />
      <section><h4>Lên Season</h4><ul className="rules-list" data-testid="reward-season-rules">{REWARD_SEASON_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul></section>
    </RulesDisclosure>}
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
  return <span className="profile-season-figure" data-season-level={level} role="img" aria-label={season.shortName} style={{ position: "relative", display: "inline-grid", placeItems: "center", flexShrink: 0, width: outerSize, height: outerSize, borderRadius: "50%" }}><span className="profile-season-figure-emoji" aria-hidden="true"><RewardSeasonImage level={season.level} size={Math.round(sizes[index]! * .72)} className="profile-season-figure-img" /></span></span>;
}
