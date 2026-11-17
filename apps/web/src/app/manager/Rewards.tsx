import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { Award, ChevronRight } from "lucide-react";
import { ManagerTitle, PageTitle } from "./shared.js";
import { ActionLabel, Description, useCompactUi } from "../shared/CompactUi.js";
import type { BadgeRoadmapItem, CefrLevel, SeasonLevelView } from "@e4s/contracts";
import { REWARD_SEASONS, rewardBadgeThreshold, rewardSeasonLabel, type RewardBadgeKey } from "@e4s/domain/engagement";
import { REWARD_POINT_RULES, REWARD_SEASON_RULES, SeasonProgressCard } from "../shared/SeasonProgressCard.js";
import { rewardBadgeIcon } from "../shared/reward-badge-icons.js";
import { RewardAnnouncementDialog } from "../learner/RewardAnnouncementDialog.js";
import { rewardBadgeCatalogAt } from "./reward-catalog.js";
import "./rewards.css";

const CEFR_LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];
const MAX_SIMULATED_POINTS = 6000;
/** Every CEFR level climbs the same four Seasons with the points earned in that level. */
const levels: Array<SeasonLevelView & { required: readonly string[]; shortName: string }> = REWARD_SEASONS.map((season) => ({
  key: season.key, level: season.level, name: season.name, shortName: season.shortName, pointsRequired: season.pointsRequired, required: season.badges
}));
const SUMMER = ["starter", "streak"];
const AUTUMN = ["week_complete", "friday", "coach_friend"];
const ALL_BADGES = levels.flatMap((level) => level.required);
const cases = [
  ["Mới vào trình độ", 0, []], ["Cấp 1 · đủ điểm, thiếu huy hiệu", 650, ["starter"]], ["Cấp 1 · đủ huy hiệu, thiếu điểm", 300, SUMMER],
  ["Vừa lên cấp 2", 520, SUMMER], ["Cấp 2 · điểm cao, kẹt vì huy hiệu", 3000, [...SUMMER, "week_complete"]], ["Vừa lên cấp 3", 2100, [...SUMMER, ...AUTUMN]],
  ["Cấp 3 · thiếu 1 huy hiệu cuối", 5600, [...SUMMER, ...AUTUMN, "first_try", "monthly_final_score"]], ["Cấp cao nhất", 5600, ALL_BADGES], ["Có huy hiệu cấp cao nhưng thiếu cấp dưới", 5600, ["starter", "first_try", "monthly_final_score", "wordsmith"]]
] as const;

export function ManagerRewards() {
  const [pointsInput, setPointsInput] = useState("0");
  const [cefr, setCefr] = useState<CefrLevel>("A1");
  const [earned, setEarned] = useState<readonly string[]>([]);
  const [revealedBadgeLevel, setRevealedBadgeLevel] = useState<number>();
  const compactUi = useCompactUi();
  const [preview, setPreview] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  // Phones/tablets: "Kết quả" and "Tùy chỉnh" are two tabs instead of one long page.
  const [pane, setPane] = useState<"result" | "custom">("result");
  const customId = useId();
  const points = Number(pointsInput);
  const level = useMemo(() => rewardLevel(points, earned), [points, earned]);
  const next = levels[level.index + 1] ?? null;
  const badges = rewardBadgeCatalogAt(cefr);
  const badgeRoadmap: BadgeRoadmapItem[] = levels.flatMap(({ level: seasonLevel, required }) => {
    if (seasonLevel === 1) return [];
    return required.map((key) => {
      const [, label, description] = badges.find(([id]) => id === key)!;
      const isEarned = earned.includes(key);
      return { key, label, description, seasonLevel: seasonLevel as 2 | 3 | 4, earned: isEarned,
        threshold: rewardBadgeThreshold(key as RewardBadgeKey, cefr), ...(isEarned ? { earnedLevel: cefr } : {}) };
    });
  });
  const season = {
    current: level,
    next,
    earnedBadgeCount: next?.required.filter((key) => earned.includes(key)).length ?? 0,
    requiredBadgeCount: next?.required.length ?? 0,
    cefr,
    pointsInLevel: points
  };
  const previewLevel = preview === null ? undefined : levels[preview];
  const selectedCase = cases.findIndex(([, casePoints, caseBadges]) => points === casePoints && equalSets(earned, caseBadges));
  const certificatePath = level.level === 4 ? `/reward/preview?points=${points}&level=${cefr}` : `/reward/preview?level=${cefr}`;
  return <div className="manager-page manager-rewards-page">
    <PageTitle><Link to="/mgr" className="manager-page-back small">← Tiến độ nhóm</Link><ManagerTitle as="h1" title="Giả lập phần thưởng" tip="Xem phần thưởng theo tình huống mẫu. Mỗi trình độ có 4 Season, tính bằng điểm kiếm được trong trình độ; huy hiệu được giữ mãi." /><Description className="muted" text="Xem phần thưởng theo tình huống mẫu. Mỗi trình độ có 4 Season, tính bằng điểm kiếm được trong trình độ; huy hiệu được giữ mãi." /></PageTitle>
    <div className="manager-reward-workspace">
      <section className="card manager-reward-controls" aria-label="Thiết lập giả lập">
        <label className="field">
          <span>Trình độ</span>
          <select value={cefr} onChange={(event) => setCefr(event.target.value as CefrLevel)}>
            {CEFR_LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Tình huống mẫu</span>
          <select value={selectedCase} onChange={(event) => {
            const scenario = cases[Number(event.target.value)];
            if (scenario) {
              setPointsInput(String(scenario[1]));
              setEarned([...scenario[2]]);
              setRevealedBadgeLevel(undefined);
            }
          }}>
            {selectedCase < 0 && <option value={-1} disabled>Tùy chỉnh</option>}
            {cases.map(([label], index) => <option key={label} value={index}>{label}</option>)}
          </select>
        </label>
        {compactUi ? <div className="manager-reward-tabs" role="tablist" aria-label="Giả lập">
          <button type="button" role="tab" aria-selected={pane === "result"} aria-controls="manager-reward-result" onClick={() => setPane("result")}>Kết quả</button>
          <button type="button" role="tab" aria-selected={pane === "custom"} aria-controls={customId} onClick={() => setPane("custom")}>Tùy chỉnh · {earned.length} huy hiệu</button>
        </div> : <button className="btn btn-sm manager-reward-custom-toggle" type="button" aria-expanded={customOpen} aria-controls={customId}
          onClick={() => setCustomOpen((open) => !open)}>
          <ChevronRight size={16} aria-hidden="true" />Tùy chỉnh điểm và huy hiệu
        </button>}
        <div className="manager-reward-custom" id={customId} hidden={compactUi ? pane !== "custom" : !customOpen}>
          <label className="field">
            <span>Điểm trong trình độ (0–6.000)</span>
            <input type="text" inputMode="numeric" placeholder="0" value={pointsInput}
              onChange={(event) => {
                const value = event.target.value;
                if (/^[0-9]*$/.test(value)) setPointsInput(value === "" ? "" : String(Math.min(MAX_SIMULATED_POINTS, Number(value))));
              }} />
          </label>
          <div className="manager-reward-badge-field">
            {compactUi ? <ManagerTitle as="h4" id={`${customId}-badges`} className="manager-reward-badge-title" title="Huy hiệu đã có" tip="Huy hiệu đã có được giữ mãi khi đổi trình độ. Bấm để bật/tắt từng huy hiệu." /> : <span className="small" id={`${customId}-badges`}>Huy hiệu đã có (giữ mãi khi đổi trình độ)</span>}
            <div className="manager-reward-badge-group" role="group" aria-labelledby={`${customId}-badges`}>
              {badges.map(([id, name, description]) => <button className="btn-sm"
                type="button" key={id} title={description} aria-pressed={earned.includes(id)}
                onClick={() => {
                  setEarned((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
                  setRevealedBadgeLevel(levels.find(({ required }) => required.includes(id))?.level);
                }}>
                <span className="manager-reward-badge-icon" aria-hidden="true">{rewardBadgeIcon(id)}</span><span>{name}</span>
              </button>)}
            </div>
          </div>
        </div>
      </section>
      <section className="card section manager-reward-result-pane" id="manager-reward-result" aria-label="Xem trước hồ sơ học viên" hidden={compactUi && pane !== "result"}>
        <header className="row between manager-section-heading manager-reward-preview-heading">
          <ManagerTitle as="h2" title={compactUi ? "Học viên thấy" : "Học viên sẽ thấy"} label="Cách tính điểm và lên Season" tip={<>{REWARD_POINT_RULES.map(([label, value]) => `${label}: ${value}`).join(" · ")}. {REWARD_SEASON_RULES.join(" ")}</>} />
          <div className="manager-reward-preview-actions" role="group" aria-label="Xem thông báo lên cấp">
            {[2, 3].map((tier) => <button className="btn-sm" type="button" key={tier} onClick={() => setPreview(tier - 1)} aria-label={`Xem lên cấp ${tier}`}>{compactUi ? `Cấp ${tier}` : `Xem lên cấp ${tier}`}</button>)}
            {compactUi ? <Link className="btn btn-sm" to={certificatePath} aria-label="Xem trước chứng nhận" title="Xem trước chứng nhận"><ActionLabel icon={Award} label="Xem trước chứng nhận" /></Link> : null}
          </div>
        </header>
        <div className="reward-screen-reader" role="status">Cấp {level.level}/4 · {level.name} · {cefr}</div>
        <SeasonProgressCard view={{ points, badgeCount: earned.length, season, badgeRoadmap }} revealedBadgeLevel={revealedBadgeLevel} certificateAction={
          compactUi ? undefined : <Link className="btn btn-sm" to={certificatePath}>Xem trước chứng nhận</Link>
        } />
      </section>
    </div>
    {previewLevel ? <RewardAnnouncementDialog
      announcement={{
        kind: "season-up", source: "simulated", points, nextPoints: levels[previewLevel.level]?.pointsRequired ?? null,
        level: cefr, seasonLevel: previewLevel.level, seasonName: rewardSeasonLabel(previewLevel, cefr)
      }}
      onClose={() => setPreview(null)}
    /> : null}
  </div>;
}

function rewardLevel(points: number, earned: readonly string[]) { let index = 0; while (index + 1 < levels.length) { const next = levels[index + 1]!; if (points < next.pointsRequired || !next.required.every((id) => earned.includes(id))) break; index++; } return { ...levels[index]!, index }; }
function equalSets(left: readonly string[], right: readonly string[]) { return left.length === right.length && right.every((item) => left.includes(item)); }
