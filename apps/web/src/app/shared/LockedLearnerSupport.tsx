import { useEffect, useId, useState, type FormEvent } from "react";
import type { LearnerComplaintView } from "@e4s/contracts";
import { learnerApiClient } from "../../api/learner.js";
import { RequestEvidenceDetails, RequestEvidenceFields, requestEvidenceArgs, type RequestEvidenceDraft } from "./RequestEvidence.js";
import { ApiError } from "../../api/runtime.js";

export function LockedLearnerSupport({ onLogout }: { onLogout: () => void }) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<RequestEvidenceDraft>({});
  const [complaint, setComplaint] = useState<LearnerComplaintView>();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void learnerApiClient.getLearnerComplaints().then(({ complaints }) => {
      // This screen only shows while the account is locked, so an approved request belongs to an earlier lock.
      if (active) setComplaint(complaints.find(item => item.kind === "account_unlock" && (item.status === "pending" || item.status === "rejected")));
    }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending || evidence.blocked || reason.trim().length < 5) return;
    setSending(true);
    setError("");
    try {
      const result = await learnerApiClient.submitLearnerComplaint("account_unlock", reason.trim(), ...requestEvidenceArgs(evidence));
      setComplaint(result.complaint);
      setOpen(false);
      setReason("");
      setEvidence({});
    } catch (error) {
      setError(error instanceof ApiError && error.code === "LEARNER_COMPLAINT_ALREADY_PENDING"
        ? "Bạn đã có một yêu cầu đang chờ Quản lý xử lý."
        : "Chưa gửi được yêu cầu. Hãy thử lại.");
    } finally {
      setSending(false);
    }
  };

  const pending = complaint?.status === "pending";
  const when = (iso: string | null | undefined) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} lúc ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const sent = when(complaint?.submittedAt);
  const due = when(complaint?.dueAt);
  // Short sentences per state, key facts in bold (same style as the app guide).
  const summary = !complaint
    ? <>Tài khoản của bạn đang <b>tạm dừng</b> nên chưa vào học được. Bấm <b>Liên hệ Quản lý</b> để xin mở khóa.</>
    : pending
      ? <>Tài khoản của bạn đang <b>tạm dừng</b>. Bạn đã gửi yêu cầu mở khóa{sent ? <> ngày <b>{sent}</b></> : null}, Quản lý {due ? <>sẽ trả lời trước <b>{due}</b></> : <>đang xem xét</>}. Được duyệt thì bạn đăng nhập lại để học tiếp.</>
      : <>Yêu cầu mở khóa đã <b>bị từ chối</b>{complaint.resolution ? <>: {complaint.resolution}</> : null}. Bạn có thể <b>gửi lại</b> kèm lý do rõ hơn.</>;
  return <>
    <p role="status" className="locked-account-summary">{summary}</p>
    {complaint?.hasEvidence ? <RequestEvidenceDetails kind="complaint" item={{ ...complaint, scope: undefined }} /> : null}
    <div className="locked-account-actions">
      {!pending && <button type="button" className="btn btn-primary" aria-expanded={open} aria-controls={open ? formId : undefined}
        disabled={loading} onClick={() => { setOpen(value => !value); setEvidence({}); }}>Liên hệ Quản lý</button>}
      <button type="button" className="btn" onClick={onLogout}>Đăng xuất</button>
    </div>
    {open && !pending && <form id={formId} className="locked-account-form" onSubmit={submit}>
      <label>Lý do yêu cầu mở khóa
        <textarea autoFocus required minLength={5} maxLength={2000} rows={3} value={reason}
          onChange={event => setReason(event.target.value)} />
      </label>
      {/* Optional evidence for the reason (e.g. an approved leave), not the time the lock happened. */}
      <RequestEvidenceFields value={evidence} onChange={setEvidence} label="Minh chứng kèm theo (không bắt buộc)" placeholder="Ví dụ: đơn nghỉ phép đã duyệt ngày 06/11" disabled={sending} />
      {error && <p role="alert" className="small danger-text">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={sending || evidence.blocked || reason.trim().length < 5}>
        {sending ? "Đang gửi…" : "Gửi yêu cầu"}
      </button>
    </form>}
  </>;
}
