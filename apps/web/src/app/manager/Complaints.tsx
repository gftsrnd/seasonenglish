import { useEffect, useState } from "react";
import type { ManagerComplaintView } from "@e4s/contracts";
import { managerApiClient } from "../../api/manager.js";
import { PageTitle } from "./shared.js";

const labels: Record<ManagerComplaintView["kind"], string> = {
  exam_eligibility: "Không đủ điều kiện thi",
  lesson_unlock: "Mở khóa bài tháng",
  account_unlock: "Mở khóa tài khoản",
  attendance: "Điểm danh sai",
  lesson_count: "Số lượng bài học",
  account: "Tài khoản"
};

export function ManagerComplaints() {
  const [complaints, setComplaints] = useState<ManagerComplaintView[]>();
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>();
  const load = async () => {
    try { setComplaints((await managerApiClient.getManagerComplaints()).complaints); setError(""); }
    catch { setError("Không tải được danh sách khiếu nại."); }
  };
  useEffect(() => { void load(); }, []);
  const decide = async (item: ManagerComplaintView, decision: "approved" | "rejected") => {
    const resolution = resolutions[item.id]?.trim() ?? "";
    if (!resolution) { setError("Hãy ghi phản hồi trước khi gửi quyết định."); return; }
    setBusy(item.id); setError("");
    try { await managerApiClient.decideManagerComplaint(item.id, decision, resolution); await load(); }
    catch { setError("Không lưu được quyết định; đơn có thể đã được xử lý."); }
    finally { setBusy(undefined); }
  };
  return <div className="manager-page manager-complaints-page">
    <PageTitle><h1>Khiếu nại</h1><p className="muted">Xem lý do, thông tin liên quan và phản hồi cho từng đơn.</p></PageTitle>
    {error ? <div className="banner danger" role="alert"><div className="body small">{error}</div></div> : null}
    {!complaints ? <p role="status">Đang tải khiếu nại…</p> : complaints.length === 0
      ? <section className="card"><p>Chưa có khiếu nại.</p></section>
      : <div className="list">{complaints.map((item) => <article className="card manager-complaint-card" key={item.id}>
        <div className="row between"><div><h2>{labels[item.kind]}</h2><p className="small muted">{item.learnerName} · {new Date(item.submittedAt).toLocaleString("vi-VN")}</p></div><span className={`badge ${item.status === "pending" ? "warn" : item.status === "rejected" ? "danger" : "ok"}`}>{item.status === "pending" ? "Chờ xử lý" : item.status === "auto_approved" ? "Tự duyệt quá hạn" : item.status === "approved" ? "Đã duyệt" : "Đã từ chối"}</span></div>
        <p>{item.reason}</p>
        {item.dueAt ? <p className="small muted">Hạn phản hồi: {new Date(item.dueAt).toLocaleString("vi-VN")}</p> : null}
        {item.status === "pending" ? <><label className="field">Phản hồi bắt buộc<textarea value={resolutions[item.id] ?? ""} maxLength={2000} onChange={(event) => setResolutions((current) => ({ ...current, [item.id]: event.target.value }))} /></label><div className="row"><button type="button" className="btn-sm btn-primary" disabled={busy === item.id} onClick={() => void decide(item, "approved")}>Duyệt</button><button type="button" className="btn-sm" disabled={busy === item.id} onClick={() => void decide(item, "rejected")}>Từ chối</button></div></> : <p className="small">Phản hồi: {item.resolution || "Tự duyệt do quá hạn"}</p>}
      </article>)}</div>}
  </div>;
}
