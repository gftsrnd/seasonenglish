import { useEffect, useState } from "react";
import { Link } from "react-router";
import { apiUrl } from "../../api/runtime.js";
import { Button, Modal } from "./ui.js";
import type { AssessmentPlacementRetakeRequestView } from "@e4s/contracts";
import { learnerApiClient, type LearnerApiClient } from "../../api/learner.js";

type RetakeApi = Pick<LearnerApiClient, "getPlacementRetakeRequest" | "createPlacementRetakeRequest">;

const dateTime = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

export function PlacementRetakeRequest({ api = learnerApiClient, onSent }: { api?: RetakeApi; onSent?: () => void }) {
  const [view, setView] = useState<AssessmentPlacementRetakeRequestView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let active = true;
    void api.getPlacementRetakeRequest?.().then((next) => { if (active) setView(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [api]);

  if (!view || (!view.request && !view.target && !view.original && view.retake === "not_granted")) return null;

  const send = async () => {
    if (busy || !api.createPlacementRetakeRequest) return;
    setBusy(true);
    setError(false);
    try {
      setView(await api.createPlacementRetakeRequest(reason.trim() || undefined));
      setConfirming(false);
      onSent?.();
    } catch { setError(true); }
    finally { setBusy(false); }
  };

  const request = view.request;
  return <section className="card learner-support-action" aria-labelledby="placement-retake-title">
    <h2 id="placement-retake-title">Test đầu vào</h2>
    {view.original ? <OriginalPlacementSubmission submission={view.original} /> : null}
    {request ? <div role="status">
      {request.status === "pending" ? <p><span className="badge warn">Chờ xử lý</span> Đã gửi yêu cầu thi lại. Vận hành sẽ duyệt hoặc từ chối.</p> : null}
      {request.status === "accepted" ? <p><span className="badge ok">Đã duyệt</span> Yêu cầu thi lại đã được duyệt. Bạn được thi lại 1 lần; sau đó Vận hành sẽ xếp lớp cho bạn. <Link className="btn btn-sm" to="/test/placement">Mở bài thi lại</Link></p> : null}
      {request.status === "rejected" ? <p><span className="badge danger">Đã từ chối</span> Yêu cầu thi lại bị từ chối.</p> : null}
      {request.resolution ? <p className="small">Phản hồi của Vận hành: {request.resolution}</p> : null}
    </div> : view.target ? <>
      <p>Nếu chưa hài lòng với kết quả, bạn có thể xin thi lại bài đầu vào <b>một lần</b>{view.target.availableUntil ? <> trước <b>{dateTime.format(new Date(view.target.availableUntil))}</b></> : null}. Vận hành sẽ duyệt hoặc từ chối yêu cầu.</p>
      <button type="button" className="btn-primary" onClick={() => setConfirming(true)}>Xin thi lại</button>
      {confirming ? <Modal
        title="Gửi yêu cầu thi lại?"
        description="Bạn chỉ được xin thi lại bài đầu vào một lần. Nếu được duyệt, quyết định xếp lớp của Vận hành sau bài thi lại là quyết định cuối cùng."
        onClose={() => { if (!busy) setConfirming(false); }}
        actions={<><Button disabled={busy} onClick={() => setConfirming(false)}>Hủy</Button><Button variant="primary" disabled={busy} onClick={() => void send()}>{busy ? "Đang gửi…" : "Gửi yêu cầu"}</Button></>}
      >
        <label>Lý do (không bắt buộc)<textarea rows={4} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} /></label>
        {error ? <p className="form-error" role="alert">Chưa gửi được yêu cầu. Hãy thử lại.</p> : null}
      </Modal> : null}
    </> : view.retake !== "not_granted" ? <p><Link className="btn btn-sm" to="/test/placement">Mở bài thi lại</Link></p> : null}
  </section>;
}

function OriginalPlacementSubmission({ submission }: { submission: NonNullable<AssessmentPlacementRetakeRequestView["original"]> }) {
  const { attempt, definition, feedback } = submission;
  return <details className="card flat">
    <summary>Xem bài đầu vào đã nộp</summary>
    {attempt.totalScore != null ? <p><b>Tổng điểm:</b> {attempt.totalScore}/{definition.totalScore}</p> : null}
    {feedback ? <p><b>Phản hồi của Vận hành cho bài đầu vào:</b> {feedback}</p> : null}
    {definition.sections.map((section) => {
      const answers = section.groups.flatMap((group) => group.tasks.flatMap((task) => {
        const response = attempt.responses.find((item) => item.section === section.code && item.taskKey === task.key);
        if (!response) return [];
        const value = task.options?.find((option) => option.value === response.value)?.label ?? response.value;
        return <li key={task.key}>
          <b>{task.prompt}</b>
          {value ? <p style={{ whiteSpace: "pre-wrap" }}>{value}</p> : null}
          {response.artifactKey ? <audio aria-label="Bản ghi âm đã nộp" controls preload="none" src={apiUrl(`/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(response.artifactKey)}`)} /> : null}
        </li>;
      }));
      return answers.length ? <section key={section.code}>
        <h3>{section.title}</h3>
        <ul>{answers}</ul>
      </section> : null;
    })}
    {!attempt.responses.length ? <p>Không có câu trả lời đã lưu.</p> : null}
  </details>;
}
