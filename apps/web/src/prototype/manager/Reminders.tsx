import type { ManagerRemindersView } from "@e4s/contracts";
import { useState } from "react";
import { Bell } from "lucide-react";
import { Badge, PageTitle, copyText } from "./shared.js";

export type PrototypeManagerRemindersProps = {
  view: ManagerRemindersView;
  sendingLearnerId?: string | null;
  notice?: string | null;
  noticeTone?: "info" | "danger" | "ok";
  onSend: (learnerId: string) => void | Promise<void>;
  onDismiss?: (learnerId: string) => void | Promise<void>;
  onCopy?: (learnerId: string) => void | Promise<void>;
};

export function PrototypeManagerReminders({ view, sendingLearnerId, notice, noticeTone = "info", onSend, onDismiss, onCopy }: PrototypeManagerRemindersProps) {
  const [handlingLearnerId, setHandlingLearnerId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [localStatus, setLocalStatus] = useState("");
  const canSend = view.webhookConfigured === true;
  const sending = Boolean(sendingLearnerId) || sendingAll;
  const sendAll = async () => {
    if (sending) return;
    setSendingAll(true);
    try {
      for (const candidate of view.candidates) await onSend(candidate.learnerId);
    } finally {
      setSendingAll(false);
    }
  };
  const runCopy = async (learnerId: string, message: string) => {
    if (handlingLearnerId) return;
    setHandlingLearnerId(learnerId); setLocalStatus("");
    try { await copyText(message); await onCopy?.(learnerId); if (!onCopy) setLocalStatus("Đã copy tin nhắn."); }
    catch { setLocalStatus("Không copy được. Hãy chọn và copy tin nhắn thủ công."); }
    finally { setHandlingLearnerId(null); }
  };
  const runDismiss = async (learnerId: string) => {
    if (!onDismiss || handlingLearnerId) return;
    setHandlingLearnerId(learnerId); setLocalStatus("");
    try { await onDismiss(learnerId); setLocalStatus("Đã ghi nhận nhắc thủ công."); }
    catch { setLocalStatus("Không ghi nhận được nhắc thủ công."); }
    finally { setHandlingLearnerId(null); }
  };
  return <div className="manager-page manager-reminders-page">
    <PageTitle actions={view.candidates.length ? <button className="btn btn-primary" type="button" disabled={!canSend || sending || Boolean(handlingLearnerId)} aria-busy={sending || undefined} title={!canSend ? "Chưa cấu hình webhook" : sending ? "Đang gửi lời nhắc" : undefined} onClick={() => void sendAll()}><Bell size={16} strokeWidth={2} aria-hidden="true" /> {sending ? "Đang gửi…" : `Gửi tất cả (${view.candidates.length})`}</button> : null}><h1>Nhắc học</h1><p className="muted">Tự phát hiện người bỏ ≥{view.inactiveDays} ngày liên tiếp. Gửi qua Base Message webhook hoặc copy tin nhắn để gửi tay.</p></PageTitle>
    {view.webhookConfigured === false ? <div className="banner info" role="note"><div className="body"><b>Chưa có webhook Base.vn.</b> Dán URL incoming webhook của nhóm chat trong <a href="/settings">Cài đặt</a>, hoặc dùng nút Copy để gửi tay.</div></div> : null}
    {notice ? <div className={`banner ${noticeTone}`} role={noticeTone === "danger" ? "alert" : "status"}>{notice}</div> : null}
    {localStatus ? <div className="manager-inline-status xs muted" role="status" aria-live="polite">{localStatus}</div> : null}
    {view.candidates.length ? view.candidates.map((candidate) => { const message = reminderMessage(candidate.learnerName, candidate.missedDays ?? view.inactiveDays); const busy = handlingLearnerId === candidate.learnerId; return <section className="card" key={candidate.learnerId} aria-label={`Nhắc học cho ${candidate.learnerName}`}><div className="row between"><div><b className="name">{candidate.learnerName}</b> {candidate.cefr ? <Badge tone="primary">{candidate.cefr}</Badge> : null} <Badge tone="danger">bỏ {candidate.missedDays ?? view.inactiveDays} ngày</Badge></div><span className="xs muted">{candidate.lastActivityAt ? formatReminderDate(candidate.lastActivityAt) : "chưa có hoạt động"}</span></div><div className="card soft small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{message}</div><div className="row manager-reminder-actions" role="group" aria-label={`Thao tác nhắc học cho ${candidate.learnerName}`} style={{ marginTop: 8 }}><button className="btn-sm" type="button" disabled={busy || sending} aria-busy={busy || undefined} onClick={() => void runCopy(candidate.learnerId, message)}>{busy ? "Đang copy…" : "Copy tin nhắn"}</button><button className="btn-sm btn-primary" type="button" title={!canSend ? "Chưa cấu hình webhook" : sending ? "Đang gửi lời nhắc" : undefined} disabled={!canSend || sendingLearnerId === candidate.learnerId || sendingAll || Boolean(handlingLearnerId)} aria-busy={sendingLearnerId === candidate.learnerId || undefined} onClick={() => void onSend(candidate.learnerId)}>{sendingLearnerId === candidate.learnerId ? "Đang gửi…" : "Gửi qua Base.vn"}</button><button className="btn-sm btn-ghost" type="button" disabled={!onDismiss || busy || sending} aria-busy={busy || undefined} title={!onDismiss ? "Chưa có API ghi nhận nhắc thủ công" : undefined} onClick={() => void runDismiss(candidate.learnerId)}>{busy ? "Đang ghi nhận…" : "Đã nhắc cách khác"}</button></div></section>; }) : <section className="card"><h3>Không ai cần nhắc hôm nay</h3><p className="muted">Mọi người học đều có hoạt động trong {view.inactiveDays} ngày gần đây.</p></section>}
    {view.history?.length ? <section className="section"><h3>Lịch sử nhắc</h3><div className="card table-wrap"><table aria-label="Lịch sử nhắc học"><thead><tr><th>Ngày</th><th>Người học</th><th>Bỏ</th><th>Kết quả</th></tr></thead><tbody>{view.history.map((item) => <tr key={item.reminderId}><td>{formatReminderDate(item.createdAt)}</td><td>{item.learnerName}</td><td>{item.missedDays === null ? "—" : `${item.missedDays} ngày`}</td><td><Badge tone={statusTone(item.deliveryStatus ?? item.status)}>{statusLabel(item.deliveryStatus ?? item.status)}</Badge></td></tr>)}</tbody></table></div></section> : null}
  </div>;
}

function reminderMessage(name: string, missedDays: number) { return `Chào ${name}, bạn đã ${missedDays} ngày chưa vào học tiếng Anh. Chỉ cần 15 phút hôm nay thôi – vào học một bài ngắn hoặc luyện một lượt với Season nhé! 💪`; }
function formatReminderDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(value)); }
function statusLabel(status: string) { return ({ queued: "Đã xếp hàng", sent: "Đã gửi webhook", delivered: "Đã giao", failed: "Gửi lỗi", copied: "Đã copy", dismissed: "Nhắc tay", resolved: "Đã quay lại học" } as Record<string, string>)[status] ?? status; }
function statusTone(status: string): "" | "ok" | "warn" | "danger" | "primary" { return status === "delivered" || status === "sent" ? "ok" : status === "failed" ? "danger" : status === "resolved" ? "primary" : "warn"; }
