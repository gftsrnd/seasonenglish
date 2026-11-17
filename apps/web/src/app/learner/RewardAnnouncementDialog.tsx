import { Award, TrendingDown, TrendingUp } from "lucide-react";
import { CEFR_LEVELS } from "@e4s/contracts";
import { SeasonFigure } from "../shared/SeasonProgressCard.js";
import type { RewardAnnouncementView } from "@e4s/contracts";
import { Button, Modal } from "./ui.js";

export function RewardAnnouncementDialog({ announcement, onClose }: {
  announcement: RewardAnnouncementView;
  onClose: () => void | Promise<void>;
}) {
  const retakeFinalized = announcement.kind === "placement-retake-finalized";
  const levelChange = retakeFinalized && announcement.previousLevel && announcement.level
    ? CEFR_LEVELS.indexOf(announcement.level) - CEFR_LEVELS.indexOf(announcement.previousLevel) : 0;
  const adjusted = announcement.kind === "level-adjustment" || levelChange < 0;
  const seasonUp = announcement.kind === "season-up";
  const topLevel = announcement.kind === "top-level-redirect";
  const close = () => void onClose();
  const Icon = adjusted ? TrendingDown : topLevel || (retakeFinalized && levelChange === 0) ? Award : TrendingUp;
  let title = "Bạn đã lên mức";
  if (retakeFinalized) title = levelChange > 0 ? `Bạn đã lên mức ${announcement.level}`
    : levelChange < 0 ? `Trình độ đã được điều chỉnh xuống ${announcement.level}` : `Bạn đã được chốt mức ${announcement.level}`;
  else if (adjusted) title = "Trình độ đã được cập nhật";
  else if (seasonUp) title = announcement.seasonLevel ? `Bạn đã lên cấp Mùa ${announcement.seasonLevel}` : "Bạn đã lên cấp Mùa";
  else if (topLevel) title = "Bạn đã đạt mức cao nhất";
  else if (announcement.level) title += ` ${announcement.level}`;

  return <Modal
    className={adjusted ? "learner-reward-dialog is-adjustment" : "learner-reward-dialog"}
    title={title}
    illustration={seasonUp ? <SeasonFigure level={announcement.seasonLevel ?? 1} /> : <Icon size={36} strokeWidth={1.8} />}
    onClose={close}
    dismissOnBackdrop
    actions={<Button variant="primary" onClick={close}>Tiếp tục học</Button>}
  >
    {seasonUp || (!retakeFinalized && adjusted && announcement.level) || announcement.source === "simulated" ? <div className="row">
      {seasonUp ? <span className="badge lvl">{announcement.seasonName}</span> : null}
      {!retakeFinalized && adjusted && announcement.level ? <span className="badge lvl">Mức {announcement.level}</span> : null}
      {announcement.source === "simulated" ? <span className="badge reward-simulation">Mô phỏng</span> : null}
    </div> : null}
    {retakeFinalized ? <p className="small">Vận hành đã chốt trình độ sau khi xem kết quả hai lần thi đầu vào.</p> : null}
    {announcement.reason ? <p className={adjusted ? undefined : "small"}><b>Lý do của Vận hành</b><br />{announcement.reason}</p> : null}
    {adjusted && !retakeFinalized ? <p className="small muted">{announcement.rule ?? "Đường lên mức bắt đầu lại theo trình độ mới. Kết quả cũ vẫn được lưu."}</p> : null}
    {seasonUp ? <p className="small">Huy hiệu đã nhận vẫn được giữ.</p> : null}
    {topLevel ? <p className="small">{announcement.level ? `Bạn đã hoàn thành chặng ${announcement.level} trong lộ trình hiện tại.` : "Bạn đã hoàn thành chặng cao nhất trong lộ trình hiện tại."}</p> : null}
  </Modal>;
}
