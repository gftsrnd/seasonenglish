import { useEffect, useState } from "react";
import type { ManagerMonthlyView, MonthlyDecisionInput } from "@e4s/contracts";
import { Badge, PageTitle, formatDateTime } from "./shared.js";

export type ManagerMonthProps = {
  view: ManagerMonthlyView;
  busyId?: string | null;
  notice?: string | null;
  onDecideAppeal: (id: string, input: MonthlyDecisionInput) => void | Promise<void>;
  onDecideUnlock: (id: string, input: MonthlyDecisionInput) => void | Promise<void>;
  onUnlockAccount: (id: string, note: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
};

/** Quản lý · Tháng học: 3 danh sách cần xử lý. Mọi quyết định ghi audit_events ở API. */
export function ManagerMonth({ view, busyId, notice, onDecideAppeal, onDecideUnlock, onUnlockAccount, onRefresh }: ManagerMonthProps) {
  const [now, setNow] = useState(() => Date.now());
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const note = (id: string) => notes[id] ?? "";
  const setNote = (id: string, value: string) => setNotes((current) => ({ ...current, [id]: value }));
  const pendingAppeals = view.examAppeals.filter((item) => item.status === "pending");
  const pendingUnlocks = view.unlockRequests.filter((item) => item.status === "pending");
  const activeLocks = view.lockedAccounts.filter((item) => !item.unlockedAt);
  return <div className="app-manager-page manager-month-page">
    <PageTitle actions={<button className="btn" type="button" onClick={() => void onRefresh()}>Tải lại</button>}><h1>Tháng học · {view.label}</h1><p className="muted">Khiếu nại không đủ điều kiện thi (Quản lý có 24 giờ; quá hạn hệ thống tự cho thi), báo cáo xin mở sau khi bỏ thi, và tài khoản bị khoá vì vắng 5 ngày học liên tiếp.</p></PageTitle>
    {notice ? <div className="banner info" role="status"><div className="body small">{notice}</div></div> : null}

    <section className="card section" aria-labelledby="month-appeals-title">
      <div className="row between manager-section-heading"><h3 id="month-appeals-title">1. Khiếu nại thi tháng</h3><Badge tone={pendingAppeals.length ? "warn" : "ok"}>{pendingAppeals.length} chờ xử lý</Badge></div>
      {view.examAppeals.length === 0 ? <p className="small muted">Chưa có khiếu nại nào trong tháng này và tháng trước.</p> : <div className="manager-month-list">
        {view.examAppeals.map((item) => {
          const remaining = new Date(item.deadlineAt).getTime() - now;
          return <article className="card soft manager-month-item" key={item.id}>
            <div className="row between"><div><b>{item.learnerName}</b> <span className="small muted">{item.email ?? ""} · {item.cefr} · {monthLabel(item.month)}</span></div><Badge tone={item.status === "pending" ? "warn" : item.status === "rejected" ? "danger" : "ok"}>{appealStatus(item.status)}</Badge></div>
            <div className="small">Điểm danh {item.attendedDays}/{item.effectiveDays} · vắng tối đa {item.maxAbsences} · gửi lúc {formatDateTime(item.createdAt)}</div>
            <blockquote className="small">{item.reason}</blockquote>
            {item.status === "pending" ? <>
              <div className="small" style={{ color: remaining < 3 * 3_600_000 ? "var(--danger, #b42318)" : undefined }}>Hạn xử lý: {formatDateTime(item.deadlineAt)} · còn {countdown(remaining)}. Quá hạn hệ thống tự cho thi.</div>
              <label className="field"><span>Ghi chú (tuỳ chọn)</span><input value={note(item.id)} onChange={(event) => setNote(item.id, event.target.value)} placeholder="Lý do duyệt / từ chối" /></label>
              <div className="row">
                <button className="btn-primary" type="button" disabled={busyId === item.id} onClick={() => void onDecideAppeal(item.id, { decision: "approved", resolution: note(item.id) })}>Cho thi</button>
                <button className="btn-danger" type="button" disabled={busyId === item.id} onClick={() => void onDecideAppeal(item.id, { decision: "rejected", resolution: note(item.id) })}>Không cho thi</button>
              </div>
            </> : item.resolution ? <div className="small muted">{item.resolution}</div> : null}
          </article>;
        })}
      </div>}
    </section>

    <section className="card section" aria-labelledby="month-unlock-title">
      <div className="row between manager-section-heading"><h3 id="month-unlock-title">2. Báo cáo xin mở tháng sau (bỏ thi tháng trước)</h3><Badge tone={pendingUnlocks.length ? "warn" : "ok"}>{pendingUnlocks.length} chờ xử lý</Badge></div>
      {view.lockedMonthLearners.length ? <p className="small muted">Đang khoá bài học {view.label}: {view.lockedMonthLearners.map((item) => `${item.learnerName} (${item.cefr})`).join(", ")}.</p> : null}
      {view.unlockRequests.length === 0 ? <p className="small muted">Chưa có báo cáo xin mở.</p> : <div className="manager-month-list">
        {view.unlockRequests.map((item) => <article className="card soft manager-month-item" key={item.id}>
          <div className="row between"><div><b>{item.learnerName}</b> <span className="small muted">{item.email ?? ""} · bỏ thi {monthLabel(item.missedMonth)} · gửi {formatDateTime(item.createdAt)}</span></div><Badge tone={item.status === "pending" ? "warn" : item.status === "rejected" ? "danger" : "ok"}>{unlockStatus(item.status)}</Badge></div>
          <blockquote className="small">{item.reason}</blockquote>
          {item.status === "pending" ? <>
            <p className="small muted">Mở thì học viên vào thẳng tháng mới từ bài 1 (không thi bù); tháng này <b>không tính</b> vào số tháng xét lên mức.</p>
            <label className="field"><span>Ghi chú (tuỳ chọn)</span><input value={note(item.id)} onChange={(event) => setNote(item.id, event.target.value)} /></label>
            <div className="row">
              <button className="btn-primary" type="button" disabled={busyId === item.id} onClick={() => void onDecideUnlock(item.id, { decision: "approved", resolution: note(item.id) })}>Mở tháng mới</button>
              <button className="btn-danger" type="button" disabled={busyId === item.id} onClick={() => void onDecideUnlock(item.id, { decision: "rejected", resolution: note(item.id) })}>Từ chối</button>
            </div>
          </> : item.resolution ? <div className="small muted">{item.resolution}</div> : null}
        </article>)}
      </div>}
    </section>

    <section className="card section" aria-labelledby="month-locks-title">
      <div className="row between manager-section-heading"><h3 id="month-locks-title">3. Tài khoản bị khoá vì vắng</h3><Badge tone={activeLocks.length ? "danger" : "ok"}>{activeLocks.length} đang khoá</Badge></div>
      {view.lockedAccounts.length === 0 ? <p className="small muted">Chưa có tài khoản nào bị khoá.</p> : <div className="table-wrap"><table className="manager-table"><thead><tr><th>Học viên</th><th>Lý do</th><th>Khoá lúc</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {view.lockedAccounts.map((item) => <tr key={item.id}>
          <td><b>{item.learnerName}</b><div className="small muted">{item.email ?? ""}</div></td>
          <td className="small">{item.reason === "consecutive_absence" ? `Vắng ${String(item.detail.consecutiveAbsentDays ?? 5)} ngày học liên tiếp` : "Khoá thủ công"}</td>
          <td className="small">{formatDateTime(item.lockedAt)}</td>
          <td>{item.unlockedAt ? <Badge tone="ok">Đã mở {formatDateTime(item.unlockedAt)}</Badge> : <Badge tone="danger">Đang khoá</Badge>}{item.unlockNote ? <div className="small muted">{item.unlockNote}</div> : null}</td>
          <td>{item.unlockedAt ? null : <div className="row"><input value={note(item.id)} onChange={(event) => setNote(item.id, event.target.value)} placeholder="Ghi chú" aria-label={`Ghi chú mở khoá ${item.learnerName}`} /><button className="btn-primary" type="button" disabled={busyId === item.id} onClick={() => void onUnlockAccount(item.id, note(item.id))}>Mở lại</button></div>}</td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </div>;
}

function monthLabel(month: string): string { return `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`; }
function countdown(ms: number): string {
  if (ms <= 0) return "0 phút (đã quá hạn)";
  const minutes = Math.floor(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút` : `${minutes} phút`;
}
function appealStatus(status: ManagerMonthlyView["examAppeals"][number]["status"]): string {
  return status === "pending" ? "Chờ duyệt" : status === "approved" ? "Đã cho thi" : status === "auto_approved" ? "Tự cho thi (quá 24 giờ)" : "Từ chối";
}
function unlockStatus(status: ManagerMonthlyView["unlockRequests"][number]["status"]): string {
  return status === "pending" ? "Chờ duyệt" : status === "approved" ? "Đã mở" : "Từ chối";
}
