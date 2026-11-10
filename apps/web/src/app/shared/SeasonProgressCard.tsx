import { Check, LockKeyhole } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { LearnerProgressView } from "@e4s/contracts";
import { Progress } from "../learner/ui.js";
import { rewardBadgeIcon } from "./reward-badge-icons.js";
import "./season-progress-card.css";

const SEASON_META = {
  1: { icon: "🌱", name: "Mùa xuân – gieo hạt", points: 0 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
  2: { icon: "☀️", name: "Mùa hạ – đón nắng", points: 60 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
  3: { icon: "🍂", name: "Mùa thu – gặt hái", points: 180 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
  4: { icon: "❄️", name: "Mùa đông – vững vàng", points: 360 } // media-scan: allow-avatar-reward -- deliberate reward symbol
} as const;

type SeasonCardData = Pick<LearnerProgressView, "season" | "points" | "badgeRoadmap"> & { badgeCount: number };

export function SeasonProgressCard({ view, certificateAction, revealedBadgeLevel }: {
  view: SeasonCardData;
  certificateAction: ReactNode;
  revealedBadgeLevel?: number | undefined;
}) {
  const levelsId = useId();
  const [showAllBadges, setShowAllBadges] = useState(false);
  const next = view.season.next;
  const nextBadges = next ? view.badgeRoadmap.filter((badge) => badge.seasonLevel === next.level) : [];
  const missing = nextBadges.filter((badge) => !badge.earned);
  const pointsMet = !next || view.points >= next.pointsRequired;
  const badgesMet = !next || missing.length === 0;
  const currentLevel = view.season.current.level;
  const showCurrent = currentLevel !== 1 || !next;
  const visibleLevels = [1, 2, 3, 4].filter((level) =>
    showAllBadges || level === revealedBadgeLevel || level === next?.level || (showCurrent && level === currentLevel)
  );
  return <section className="card profile-season-card" aria-label="Mùa học">
    <div className="profile-season-heading">
      <SeasonFigure level={currentLevel} />
      <div>
        <div className="eyebrow">Mùa học {currentLevel}/4</div>
        <h2 className="profile-season-title">{view.season.current.name}</h2>
        <div className="small muted">{next ? `Tiếp theo: ${next.name}` : "Đã đạt cấp cao nhất"}</div>
      </div>
    </div>
    {next && <>
      <div className="profile-season-tracks">
        <SeasonTrack met={pointsMet} title="Điểm" current={view.points} target={next.pointsRequired} />
        <SeasonTrack met={badgesMet} title="Huy hiệu" current={view.season.earnedBadgeCount} target={view.season.requiredBadgeCount} />
      </div>
      {missing.length > 0 && <p className="small profile-season-missing">
        <b>Thiếu huy hiệu</b> · {missing.map((badge) => badge.label).join(", ")}
      </p>}
    </>}
    <div className="row between profile-badges-heading" style={{ marginTop: 14 }}><h3 style={{ margin: 0 }}>Huy hiệu theo cấp</h3><span className="small muted" style={{ fontWeight: 800 }}>{view.badgeCount}/{view.badgeRoadmap.length} huy hiệu{!next && ` · ★ ${view.points} điểm`}</span></div>
    <div id={levelsId} className="profile-season-levels">
      {visibleLevels.map((seasonLevel) => {
        const list = view.badgeRoadmap.filter((badge) => badge.seasonLevel === seasonLevel);
        const meta = SEASON_META[seasonLevel as keyof typeof SEASON_META];
        const current = currentLevel === seasonLevel;
        const completed = currentLevel > seasonLevel;
        const nextLevel = currentLevel + 1 === seasonLevel;
        return <div className="profile-season-level" data-season-level={seasonLevel} key={seasonLevel}>
          <div className="profile-season-level-heading">
            <span className={`badge ${completed ? "ok" : nextLevel ? "warn" : current ? "primary" : ""}`}>
              <span className="profile-season-emoji" role="img" aria-label={`Biểu tượng ${meta.name}`}>{meta.icon}</span>
              <span>Cấp {seasonLevel} · {meta.name}</span>
            </span>
            <span className="xs muted">{meta.points} điểm{list.length ? ` + ${list.length} huy hiệu` : " · không yêu cầu huy hiệu"}{completed ? " · đã đạt" : nextLevel ? " · cấp tiếp theo" : current ? " · đang ở đây" : ""}</span>
          </div>
          {list.length ? <div className="badges">
            {list.map((badge) => {
              const StatusIcon = badge.earned ? Check : LockKeyhole;
              return <article className={`bdg${badge.earned ? "" : " off"}`} key={badge.key}>
                <span className="profile-badge-state" role="img" aria-label={badge.earned ? "Đã đạt" : "Chưa đạt"}>
                  <StatusIcon size={14} aria-hidden="true" />
                </span>
                <span className="profile-badge-emoji" role="img" aria-label={`Biểu tượng ${badge.label}`}>{rewardBadgeIcon(badge.key) ?? "🏅"}</span>
                <b>{badge.label}</b>
                <span className="profile-badge-description">{badge.description}</span>
              </article>;
            })}
          </div> : <p className="profile-season-empty xs muted">Cấp nền của lộ trình. Đủ điều kiện từ đây sẽ mở Cấp 2.</p>}
        </div>;
      })}
    </div>
    <div className="profile-season-actions"><button type="button" className="btn btn-sm" aria-controls={levelsId} aria-expanded={showAllBadges} onClick={() => setShowAllBadges((value) => !value)}>{showAllBadges ? "Thu gọn huy hiệu" : "Xem tất cả huy hiệu"}</button>
    {certificateAction}</div>
    <details style={{ marginTop: 10 }}><summary className="small" style={{ fontWeight: 800, cursor: "pointer" }}>Cách tính điểm và lên cấp</summary><ul className="small" style={{ margin: "6px 0 0", paddingLeft: 20 }}><li>Hoàn thành 1 bài học: <b>+10</b></li><li>Mỗi phần Nghe/Đọc/Viết/Nói đúng: <b>+5 lần 1, giảm 1 điểm mỗi lần làm lại</b></li><li>1 lượt luyện với Season: <b>+2</b></li><li>Mở 1 ô từ bí mật: <b>+2</b></li><li>Hoàn thành bài thi tháng: <b>+15</b></li><li>Hoàn thành trọn lộ trình tháng: <b>+20</b></li><li>Lên cấp: đủ <b>điểm</b> và <b>mọi huy hiệu của cấp</b>; đi lần lượt, không nhảy cấp.</li></ul></details>
  </section>;
}

function SeasonTrack({ met, title, current, target }: { met: boolean; title: string; current: number; target: number }) {
  return <div className={`profile-season-track${met ? " is-met" : ""}`}>
    <div className="profile-season-track-label">
      <b className="small">{title}</b>
      {met && <Check className="status-icon" aria-hidden="true" />}
      <span className="sr-only"> · {met ? "Đạt" : "Chưa đạt"}</span>
    </div>
    <strong>{current} / {target}</strong>
    <Progress value={current} max={target} label={title} />
  </div>;
}

export function SeasonFigure({ level }: { level: number }) {
  const season = [
    { name: "Mùa xuân", icon: "🌱", size: 64 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
    { name: "Mùa hạ", icon: "☀️", size: 76 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
    { name: "Mùa thu", icon: "🍂", size: 88 }, // media-scan: allow-avatar-reward -- deliberate reward symbol
    { name: "Mùa đông", icon: "❄️", size: 100 } // media-scan: allow-avatar-reward -- deliberate reward symbol
  ][Math.max(0, Math.min(3, level - 1))]!;
  const outerSize = season.size + 28;
  return <span className="profile-season-figure" data-season-level={level} role="img" aria-label={season.name} style={{ position: "relative", display: "inline-grid", placeItems: "center", flexShrink: 0, width: outerSize, height: outerSize, borderRadius: "50%" }}><span className="profile-season-figure-emoji" aria-hidden="true">{season.icon}</span></span>;
}
