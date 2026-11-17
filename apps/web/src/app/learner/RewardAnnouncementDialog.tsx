import type { RewardAnnouncementView } from "@e4s/contracts";
import { Button, Modal } from "./ui.js";

export function RewardAnnouncementDialog({ announcement, onClose }: {
  announcement: RewardAnnouncementView;
  onClose: () => void | Promise<void>;
}) {
  const adjusted = announcement.kind === "level-adjustment";
  const seasonUp = announcement.kind === "season-up";
  const topLevel = announcement.kind === "top-level-redirect";
  const close = () => void onClose();
  let title = "Bạn đã lên mức";
  if (adjusted) title = "Trình độ đã được cập nhật";
  else if (seasonUp) title = announcement.seasonLevel ? `Bạn đã lên cấp Mùa ${announcement.seasonLevel}` : "Bạn đã lên cấp Mùa";
  else if (topLevel) title = "Bạn đã đạt mức cao nhất";
  else if (announcement.level) title += ` ${announcement.level}`;

  return <Modal
    className="learner-reward-dialog"
    title={title}
    onClose={close}
    dismissOnBackdrop
    actions={<Button variant="primary" onClick={close}>Tiếp tục học</Button>}
  >
    {seasonUp || (adjusted && announcement.level) || announcement.source === "simulated" ? <div className="row">
      {seasonUp ? <span className="badge lvl">{announcement.seasonName}</span> : null}
      {adjusted && announcement.level ? <span className="badge lvl">Mức {announcement.level}</span> : null}
      {announcement.source === "simulated" ? <span className="badge">Mô phỏng</span> : null}
    </div> : null}
    {announcement.reason ? <p className={adjusted ? undefined : "small"}><b>Lý do của Vận hành</b><br />{announcement.reason}</p> : null}
    {adjusted ? <p className="small muted">{announcement.rule ?? "Đường lên mức bắt đầu lại theo trình độ mới. Kết quả cũ vẫn được lưu."}</p> : null}
    {seasonUp ? <p className="small">Huy hiệu đã nhận vẫn được giữ.</p> : null}
    {topLevel ? <p className="small">{announcement.level ? `Bạn đã hoàn thành chặng ${announcement.level} trong lộ trình hiện tại.` : "Bạn đã hoàn thành chặng cao nhất trong lộ trình hiện tại."}</p> : null}
  </Modal>;
}
