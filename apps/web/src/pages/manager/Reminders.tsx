import type { ManagerRemindersView } from "@e4s/contracts";
import { useMemo, useState } from "react";
import "./styles.manager-clone.css";

export function ManagerReminders({ view, sendingLearnerId, notice, onSend }: {
  view: ManagerRemindersView;
  sendingLearnerId?: string | undefined;
  notice?: string | undefined;
  onSend: (learnerId: string) => void | Promise<void>;
}) {
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const candidates = useMemo(() => view.candidates.filter((item) => !handled.has(item.learnerId)), [handled, view.candidates]);
  const markHandled = (learnerId: string) => setHandled((current) => new Set(current).add(learnerId));
  const send = async (learnerId: string) => { await onSend(learnerId); markHandled(learnerId); };
  const sendAll = async () => { for (const item of candidates) await send(item.learnerId); };
  const copy = async (learnerId: string) => {
    const item = view.candidates.find((candidate) => candidate.learnerId === learnerId);
    if (!item) return;
    await navigator.clipboard.writeText(reminderMessage(item.learnerName, view.inactiveDays));
    markHandled(learnerId);
  };

  return <main className="operator-page manager-page manager-clone manager-reminders-page">
    <header className="manager-page-title"><div><h1>Nhắc học</h1><p>Tự phát hiện người bỏ ≥{view.inactiveDays} ngày liên tiếp. Gửi qua Base Message webhook hoặc copy tin nhắn để gửi tay.</p></div>
      {candidates.length ? <button className="button button--primary" type="button" disabled={Boolean(sendingLearnerId)} onClick={() => void sendAll()}>Gửi tất cả ({candidates.length})</button> : null}
    </header>

    <section className="manager-reminder-banner" role="note"><span aria-hidden="true">i</span><div><b>Kết nối Base.vn được quản lý trong Cài đặt.</b><p>Hệ thống sẽ gửi webhook qua máy chủ; bạn cũng có thể dùng nút Copy để gửi tay.</p></div></section>
    {notice ? <p className="manager-notice" role="status">{notice}</p> : null}

    {candidates.length ? <section className="manager-reminder-list" aria-label="Người học cần nhắc">{candidates.map((item) => <article className="manager-card" key={item.learnerId}>
      <div className="manager-reminder-heading"><div><b>{item.learnerName}</b> {item.cefr ? <span className={`manager-badge manager-level manager-level-${item.cefr}`}>{item.cefr}</span> : null} <span className="manager-badge is-danger">bỏ {view.inactiveDays} ngày</span></div><span>{item.lastActivityAt ? shortDate(item.lastActivityAt) : "chưa có hoạt động"}</span></div>
      <div className="manager-reminder-message">{reminderMessage(item.learnerName, view.inactiveDays)}</div>
      <div className="manager-row"><button type="button" onClick={() => void copy(item.learnerId)}>Copy tin nhắn</button><button className="button button--primary" type="button" disabled={sendingLearnerId === item.learnerId} onClick={() => void send(item.learnerId)}>{sendingLearnerId === item.learnerId ? "Đang gửi…" : "Gửi qua Base.vn"}</button><button type="button" onClick={() => markHandled(item.learnerId)}>Đã nhắc cách khác</button></div>
    </article>)}</section> : <section className="manager-card manager-reminder-empty"><span aria-hidden="true">✓</span><div><h3>Không ai cần nhắc hôm nay</h3><p>Mọi người học đều có hoạt động trong {view.inactiveDays} ngày gần đây.</p></div></section>}
  </main>;
}

function reminderMessage(name: string, inactiveDays: number) {
  const shortName = name.trim().split(/\s+/).at(-1) ?? name;
  return `Chào ${shortName}, Season English thấy bạn chưa học trong ${inactiveDays} ngày gần đây. Bạn mở lại bài hôm nay và dành ít nhất 10 phút nhé. Nếu đang vướng chỗ nào, hãy nhắn để đội ngũ hỗ trợ.`;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}
