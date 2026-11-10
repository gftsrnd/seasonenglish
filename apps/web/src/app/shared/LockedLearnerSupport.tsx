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
      if (active) setComplaint(complaints.find(item => item.kind === "account_unlock"));
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
  return <>
    {complaint && <p role="status">
      {pending ? "Yêu cầu mở khóa đang chờ Quản lý xử lý."
        : complaint.status === "rejected" ? "Yêu cầu mở khóa đã bị từ chối."
          : "Quản lý đã duyệt yêu cầu mở khóa."}
      {complaint.resolution && <><br />{complaint.resolution}</>}
    </p>}
    {complaint ? <RequestEvidenceDetails kind="complaint" item={complaint} /> : null}
    <div className="locked-account-actions">
      {!pending && <button type="button" className="btn btn-primary" aria-expanded={open} aria-controls={open ? formId : undefined}
        disabled={loading} onClick={() => { setOpen(value => !value); setEvidence({}); }}>Liên hệ Quản lý</button>}
      <button type="button" className="btn" onClick={onLogout}>Đăng xuất</button>
    </div>
    {open && !pending && <form id={formId} className="locked-account-form" onSubmit={submit}>
      <RequestEvidenceFields value={evidence} onChange={setEvidence} label="Thời điểm xảy ra" placeholder="Ví dụ: 06/11, khoảng 14 giờ" disabled={sending} />
      <label>Lý do yêu cầu mở khóa
        <textarea autoFocus required minLength={5} maxLength={2000} rows={3} value={reason}
          onChange={event => setReason(event.target.value)} />
      </label>
      {error && <p role="alert" className="small danger-text">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={sending || evidence.blocked || reason.trim().length < 5}>
        {sending ? "Đang gửi…" : "Gửi yêu cầu"}
      </button>
    </form>}
  </>;
}
