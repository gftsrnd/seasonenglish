import { useId, useState, type FormEvent } from "react";
import type { AssessmentAppealTargetView, AssessmentAppealView, CefrLevel } from "@e4s/contracts";
import type { RequestEvidenceInput } from "@e4s/contracts";
import { RequestEvidenceDetails, RequestEvidenceFields, requestEvidenceArgs, type RequestEvidenceDraft } from "../shared/RequestEvidence.js";
import { ApiError } from "../../api/runtime.js";

const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

export function AssessmentAppealForm({ target, appeal, submit }: {
  target?: AssessmentAppealTargetView | null | undefined;
  appeal?: AssessmentAppealView | null | undefined;
  submit: (reason: string, evidence?: RequestEvidenceInput & { proposedLevel?: CefrLevel }) => void | Promise<void>;
}) {
  const field = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [proposedLevel, setProposedLevel] = useState<CefrLevel | "">("");
  const [evidence, setEvidence] = useState<RequestEvidenceDraft>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || evidence.blocked || reason.trim().length < 10 || (target?.requiresProposedLevel && !proposedLevel)) return;
    setBusy(true);
    setError("");
    try {
      const evidenceArgs = requestEvidenceArgs(evidence);
      if (target?.requiresProposedLevel && proposedLevel) {
        await submit(reason.trim(), { ...evidenceArgs[0], proposedLevel });
      } else {
        await submit(reason.trim(), ...evidenceArgs);
      }
      setOpen(false);
      setReason("");
      setEvidence({});
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === "ASSESSMENT_APPEAL_NOT_AVAILABLE"
        ? "Bài thi đã hết hạn kháng nghị hoặc yêu cầu đã được gửi. Tải lại để xem trạng thái."
        : "Chưa gửi được kháng nghị. Hãy thử lại.");
    } finally { setBusy(false); }
  };
  if (appeal) return <div className="assessment-appeal-status">
    <b>{appeal.status === "pending" ? "Kháng nghị đang chờ xử lý" : appeal.status === "accepted" ? "Kháng nghị được chấp nhận" : "Kháng nghị bị từ chối"}</b>
    <p>{appeal.reason}</p>
    {appeal.proposedLevel ? <p>Trình độ đề xuất · {appeal.proposedLevel}</p> : null}
    <RequestEvidenceDetails kind="assessment" item={appeal} />
    {appeal.resolution ? <p><b>Phản hồi của Vận hành</b> · {appeal.resolution}</p> : null}
  </div>;
  if (!target) return null;
  return <div className="assessment-appeal-status">
    {target.availableUntil ? <p className="small muted">Gửi trước {dateFormat.format(new Date(target.availableUntil))}.</p> : null}
    {!open ? <button className="btn" type="button" aria-expanded={false} onClick={() => setOpen(true)}>Gửi kháng nghị</button>
      : <form className="learner-support-form" onSubmit={send} aria-busy={busy}>
        {target.requiresProposedLevel ? <label>Trình độ đề xuất<select required value={proposedLevel} onChange={event => setProposedLevel(event.target.value as CefrLevel | "")}>
          <option value="">Chọn trình độ</option>
          {["A1", "A2", "B1", "B2", "C1"].map(level => <option key={level}>{level}</option>)}
        </select></label> : null}
        <RequestEvidenceFields value={evidence} onChange={setEvidence} label="Phần hoặc câu cần xem lại" placeholder="Ví dụ: Nghe, câu 3 hoặc toàn bài" disabled={busy} />
        <label htmlFor={field}>Lý do kháng nghị</label>
        <textarea id={field} rows={3} required minLength={10} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} autoFocus />
        {error ? <p role="alert">{error}</p> : null}
        <div className="form-actions learner-support-form-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => { setOpen(false); setEvidence({}); }}>Hủy</button>
          <button type="submit" className="btn-primary" disabled={busy || evidence.blocked || reason.trim().length < 10 || Boolean(target.requiresProposedLevel && !proposedLevel)}>{busy ? "Đang gửi…" : "Gửi cho Vận hành"}</button>
        </div>
      </form>}
  </div>;
}
