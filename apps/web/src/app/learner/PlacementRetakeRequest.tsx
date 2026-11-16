import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { AssessmentPlacementRetakeRequestView } from "@e4s/contracts";
import { learnerApiClient, type LearnerApiClient } from "../../api/learner.js";

type RetakeApi = Pick<LearnerApiClient, "getPlacementRetakeRequest" | "createPlacementRetakeRequest">;

const dateTime = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Placement test on the support page: only a "Xin thi lại" button, no free-text appeal (owner
 * decision 11/2026). Shown while a request is possible (sent back, or approved and within 72 h of
 * the decision), then the request's status and the Operator's decision.
 */
export function PlacementRetakeRequest({ api = learnerApiClient, onSent }: { api?: RetakeApi; onSent?: () => void }) {
  const [view, setView] = useState<AssessmentPlacementRetakeRequestView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void api.getPlacementRetakeRequest?.().then((next) => { if (active) setView(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [api]);

  if (!view || (!view.request && !view.target)) return null;

  const send = async () => {
    if (busy || !api.createPlacementRetakeRequest) return;
    setBusy(true);
    setError(false);
    try {
      setView(await api.createPlacementRetakeRequest());
      onSent?.();
    } catch { setError(true); }
    finally { setBusy(false); }
  };

  const request = view.request;
  return <section className="card learner-support-action" aria-labelledby="placement-retake-title">
    <h2 id="placement-retake-title">Test đầu vào</h2>
    {request ? <div role="status">
      {request.status === "pending" ? <p><span className="badge warn">Chờ xử lý</span> Đã gửi yêu cầu thi lại. Vận hành sẽ duyệt hoặc từ chối.</p> : null}
      {request.status === "accepted" ? <p><span className="badge ok">Đã duyệt</span> Yêu cầu thi lại đã được duyệt. Bạn được thi lại 1 lần; sau đó Vận hành sẽ xếp lớp cho bạn. <Link className="btn btn-sm" to="/test/placement">Mở bài thi lại</Link></p> : null}
      {request.status === "rejected" ? <p><span className="badge danger">Đã từ chối</span> Yêu cầu thi lại bị từ chối.</p> : null}
      {request.resolution ? <p className="small">Phản hồi của Vận hành: {request.resolution}</p> : null}
    </div> : view.target ? <>
      <p>Nếu chưa hài lòng với kết quả, bạn có thể xin thi lại bài đầu vào <b>một lần</b>{view.target.availableUntil ? <> trước <b>{dateTime.format(new Date(view.target.availableUntil))}</b></> : null}. Vận hành sẽ duyệt hoặc từ chối yêu cầu.</p>
      {error ? <p role="alert">Chưa gửi được yêu cầu. Hãy thử lại.</p> : null}
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void send()}>{busy ? "Đang gửi…" : "Xin thi lại"}</button>
    </> : null}
  </section>;
}
