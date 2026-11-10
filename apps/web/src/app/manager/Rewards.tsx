import { useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronRight, X } from "lucide-react";
import { PageTitle } from "./shared.js";
import type { BadgeRoadmapItem, SeasonLevelView } from "@e4s/contracts";
import { SeasonFigure, SeasonProgressCard } from "../shared/SeasonProgressCard.js";
import { rewardBadgeIcon } from "../shared/reward-badge-icons.js";
import { useDialog } from "../shared/ModalProvider.js";
import { rewardBadgeCatalog as badges } from "./reward-catalog.js";
import "./rewards.css";

const levels: Array<SeasonLevelView & { required: readonly string[] }> = [
  { key: "spring", level: 1, name: "Mùa xuân – gieo hạt", pointsRequired: 0, required: [] },
  { key: "summer", level: 2, name: "Mùa hạ – đón nắng", pointsRequired: 60, required: ["first", "streak3"] },
  { key: "autumn", level: 3, name: "Mùa thu – gặt hái", pointsRequired: 180, required: ["week", "friday", "chat"] },
  { key: "winter", level: 4, name: "Mùa đông – vững vàng", pointsRequired: 360, required: ["streak7", "sharp", "words"] },
];
const cases = [
  ["Mới bắt đầu", 0, []], ["Cấp 1 · đủ điểm, thiếu huy hiệu", 80, ["first"]], ["Cấp 1 · đủ huy hiệu, thiếu điểm", 40, ["first", "streak3"]],
  ["Vừa lên cấp 2", 65, ["first", "streak3"]], ["Cấp 2 · điểm cao, kẹt vì huy hiệu", 400, ["first", "streak3", "week"]], ["Vừa lên cấp 3", 190, ["first", "streak3", "week", "friday", "chat"]],
  ["Cấp 3 · thiếu 1 huy hiệu cuối", 420, ["first", "streak3", "week", "friday", "chat", "streak7", "sharp"]], ["Cấp cao nhất", 420, badges.map((item) => item[0])], ["Có huy hiệu cấp cao nhưng thiếu cấp dưới", 400, ["first", "streak7", "sharp", "words"]]
] as const;

export function ManagerRewards() {
  const [pointsInput, setPointsInput] = useState("0");
  const [earned, setEarned] = useState<readonly string[]>([]);
  const [revealedBadgeLevel, setRevealedBadgeLevel] = useState<number>();
  const [preview, setPreview] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const customId = useId();
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const previewDialogRef = useRef<HTMLElement>(null);
  const points = Number(pointsInput);
  const level = useMemo(() => rewardLevel(points, earned), [points, earned]);
  const next = levels[level.index + 1] ?? null;
  const badgeRoadmap: BadgeRoadmapItem[] = levels.flatMap(({ level: seasonLevel, required }) => {
    if (seasonLevel === 1) return [];
    return required.map((key) => {
      const [, label, description] = badges.find(([id]) => id === key)!;
      return { key, label, description, seasonLevel, earned: earned.includes(key) };
    });
  });
  const season = {
    current: level,
    next,
    earnedBadgeCount: next?.required.filter((key) => earned.includes(key)).length ?? 0,
    requiredBadgeCount: next?.required.length ?? 0
  };
  const previewLevel = preview === null ? undefined : levels[preview];
  const selectedCase = cases.findIndex(([, casePoints, caseBadges]) => points === casePoints && equalSets(earned, caseBadges));
  const certificatePath = level.level === 4 ? `/reward/preview?points=${points}` : "/reward/preview";
  const closePreview = () => {
    setPreview(null);
    queueMicrotask(() => previewTriggerRef.current?.focus());
  };
  useDialog(preview !== null, previewDialogRef, closePreview, previewCloseRef);
  return <div className="manager-page manager-rewards-page">
    <PageTitle><Link to="/mgr" className="manager-page-back small">← Tiến độ nhóm</Link><h1>Giả lập phần thưởng</h1><p className="muted">Xem phần thưởng theo tình huống mẫu.</p></PageTitle>
    <div className="manager-reward-workspace">
      <section className="card manager-reward-controls" aria-label="Thiết lập giả lập">
        <label className="field">
          <span>Tình huống mẫu</span>
          <select value={selectedCase} onChange={(event) => {
            const scenario = cases[Number(event.target.value)];
            if (scenario) {
              setPointsInput(String(scenario[1]));
              setEarned(scenario[2]);
              setRevealedBadgeLevel(undefined);
            }
          }}>
            {selectedCase < 0 && <option value={-1} disabled>Tùy chỉnh</option>}
            {cases.map(([label], index) => <option key={label} value={index}>{label}</option>)}
          </select>
        </label>
        <button className="btn btn-sm manager-reward-custom-toggle" type="button" aria-expanded={customOpen} aria-controls={customId}
          onClick={() => setCustomOpen((open) => !open)}>
          <ChevronRight size={16} aria-hidden="true" />Tùy chỉnh điểm và huy hiệu
        </button>
        <div className="manager-reward-custom" id={customId} hidden={!customOpen}>
          <label className="field">
            <span>Điểm giả lập (0–600)</span>
            <input type="text" inputMode="numeric" placeholder="0" value={pointsInput}
              onChange={(event) => {
                const value = event.target.value;
                if (/^[0-9]*$/.test(value)) setPointsInput(value === "" ? "" : String(Math.min(600, Number(value))));
              }} />
          </label>
          <div className="manager-reward-badge-field">
            <span className="small" id={`${customId}-badges`}>Huy hiệu đã có</span>
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
      <section className="card section manager-reward-result-pane" aria-label="Xem trước hồ sơ học viên">
        <header className="row between manager-section-heading manager-reward-preview-heading">
          <h2>Học viên sẽ thấy</h2>
          <div className="manager-reward-preview-actions" role="group" aria-label="Xem thông báo lên cấp">
            {[2, 3].map((tier) => <button className="btn-sm" type="button" key={tier} onClick={(event) => {
              previewTriggerRef.current = event.currentTarget;
              setPreview(tier - 1);
            }}>Xem lên cấp {tier}</button>)}
          </div>
        </header>
        <div className="reward-screen-reader" role="status">Cấp {level.level}/4 · {level.name}</div>
        <SeasonProgressCard view={{ points, badgeCount: earned.length, season, badgeRoadmap }} revealedBadgeLevel={revealedBadgeLevel} certificateAction={
          <Link className="btn btn-sm" to={certificatePath}>Xem trước chứng nhận</Link>
        } />
      </section>
    </div>
    {previewLevel && <div className="modal-backdrop manager-modal-backdrop" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) closePreview();
    }}>
      <section ref={previewDialogRef} className="dialog reward-celebration" role="dialog" aria-modal="true" aria-label="Màn chúc mừng lên cấp" tabIndex={-1}>
        <div className="reward-celebration-header">
          <span className="badge">Giả lập</span>
          <button ref={previewCloseRef} className="btn btn-ghost" type="button" aria-label="Đóng màn chúc mừng" onClick={closePreview}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="reward-celebration-body">
          <SeasonFigure level={previewLevel.level} />
          <div className="eyebrow">Lên cấp {previewLevel.level}/4</div>
          <h2>{previewLevel.name}</h2>
          <p className="small">{previewLevel.pointsRequired} điểm · {previewLevel.required.length} huy hiệu</p>
        </div>
        <button className="btn-primary reward-celebration-action" type="button" onClick={closePreview}>Tiếp tục</button>
      </section>
    </div>}
  </div>;
}

function rewardLevel(points: number, earned: readonly string[]) { let index = 0; while (index + 1 < levels.length) { const next = levels[index + 1]!; if (points < next.pointsRequired || !next.required.every((id) => earned.includes(id))) break; index++; } return { ...levels[index]!, index }; }
function equalSets(left: readonly string[], right: readonly string[]) { return left.length === right.length && right.every((item) => left.includes(item)); }
