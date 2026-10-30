import type { ManagerReminderChannel, ManagerRemindersView } from "@e4s/contracts";
import { useState } from "react";
import { Bell } from "lucide-react";
import { Badge, PageTitle, copyText } from "./shared.js";

export type ManagerRemindersProps = {
  view: ManagerRemindersView;
  sendingKey?: string | null;
  notice?: string | null;
  noticeTone?: "info" | "danger" | "ok";
  onSend: (learnerId: string, channel: ManagerReminderChannel) => void | Promise<void>;
  onSendAll?: (channel: ManagerReminderChannel) => void | Promise<void>;
  onDismiss?: (learnerId: string) => void | Promise<void>;
  onCopy?: (learnerId: string) => void | Promise<void>;
};

export function ManagerReminders({ view, sendingKey, notice, noticeTone = "info", onSend, onSendAll, onDismiss, onCopy }: ManagerRemindersProps) {
  const [handlingLearnerId, setHandlingLearnerId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [localStatus, setLocalStatus] = useState("");
  const [confirmation, setConfirmation] = useState<{ kind: "all" } | { kind: "single"; learnerId: string; learnerName: string; learnerEmail: string | null } | null>(null);
  const sending = Boolean(sendingKey);
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
    try { await onDismiss(learnerId); }
    catch { /* The route reports the failure through the shared toast. */ }
    finally { setHandlingLearnerId(null); }
  };
  const runSendAll = async () => {
    if (sendingAll || sending) return;
    setSendingAll(true); setLocalStatus("");
    try {
      if (onSendAll) await onSendAll("email");
      else for (const candidate of view.candidates) await onSend(candidate.learnerId, "email");
      setLocalStatus("Đã gửi email nhắc học cho toàn bộ người trong danh sách.");
    } catch { setLocalStatus("Chưa gửi hết được email. Hãy kiểm tra cấu hình và thử lại."); }
    finally { setSendingAll(false); }
  };
  const confirmEmail = async () => {
    const pending = confirmation;
    if (!pending) return;
    setConfirmation(null);
    if (pending.kind === "all") await runSendAll();
    else await onSend(pending.learnerId, "email");
  };
  return <div className="manager-page manager-reminders-page">
    <PageTitle><div><h1>Nhắc học</h1><p className="muted"><Bell size={16} strokeWidth={2} aria-hidden="true" /> Tự phát hiện người bỏ ≥{view.inactiveDays} ngày liên tiếp. Email được gửi riêng đến địa chỉ hiển thị trên từng thẻ; muốn dùng kênh khác, hãy copy tin nhắn.</p></div></PageTitle>
    {view.emailConfigured === false ? <div className="banner info" role="note"><div className="body"><b>Chưa cấu hình email Resend.</b> Nút Gửi email sẽ bị khóa trên môi trường này.</div></div> : null}
    {notice ? <div className={`banner ${noticeTone}`} role={noticeTone === "danger" ? "alert" : "status"}>{notice}</div> : null}
    {localStatus ? <div className="manager-inline-status xs muted" role="status" aria-live="polite">{localStatus}</div> : null}
    {view.candidates.length ? <div className="manager-reminder-toolbar"><div><b>{view.candidates.length} người học cần được nhắc</b><span className="small muted">Danh sách dựa trên số ngày không hoạt động; hãy kiểm tra trước khi gửi đồng loạt.</span></div><button className="btn-primary" type="button" disabled={view.emailConfigured === false || sending || sendingAll} aria-busy={sendingAll || undefined} onClick={() => setConfirmation({ kind: "all" })}>{sendingAll ? "Đang gửi tất cả…" : "Gửi tất cả qua email"}</button></div> : null}
    {view.candidates.length ? view.candidates.map((candidate) => { const message = reminderMessage(candidate.learnerName, candidate.missedDays ?? view.inactiveDays); const busy = handlingLearnerId === candidate.learnerId; const emailBusy = sendingKey === `${candidate.learnerId}:email`; return <section className="card manager-reminder-card" key={candidate.learnerId} aria-label={`Nhắc học cho ${candidate.learnerName}`}><div className="row between"><div><b className="name">{candidate.learnerName}</b> {candidate.cefr ? <Badge tone="primary">{candidate.cefr}</Badge> : null} <Badge tone="danger">bỏ {candidate.missedDays ?? view.inactiveDays} ngày</Badge><div className="manager-reminder-recipient">Email nhận: <b>{candidate.learnerEmail ?? "Chưa có email"}</b></div></div><span className="xs muted">{candidate.lastActivityAt ? formatReminderDate(candidate.lastActivityAt) : "chưa có hoạt động"}</span></div><div className="card soft small manager-reminder-message">{message}</div><div className="row manager-reminder-actions" role="group" aria-label={`Thao tác nhắc học cho ${candidate.learnerName}`}><button className="btn-sm" type="button" disabled={busy || sending} aria-busy={busy || undefined} onClick={() => void runCopy(candidate.learnerId, message)}>{busy ? "Đang copy…" : "Copy tin nhắn"}</button><button className="btn-sm btn-primary" type="button" disabled={view.emailConfigured === false || sending || Boolean(handlingLearnerId) || !candidate.learnerEmail} aria-busy={emailBusy || undefined} title={!candidate.learnerEmail ? "Người học chưa có email nhận" : view.emailConfigured === false ? "Email Resend chưa được cấu hình" : undefined} onClick={() => setConfirmation({ kind: "single", learnerId: candidate.learnerId, learnerName: candidate.learnerName, learnerEmail: candidate.learnerEmail ?? null })}>{emailBusy ? "Đang gửi email…" : "Gửi email"}</button><button className="btn-sm btn-ghost" type="button" disabled={!onDismiss || busy || sending} aria-busy={busy || undefined} title={!onDismiss ? "Chưa có API ghi nhận lời nhắc qua kênh khác" : undefined} onClick={() => void runDismiss(candidate.learnerId)}>{busy ? "Đang ghi nhận…" : "Đã nhắc qua kênh khác"}</button></div></section>; }) : <section className="card"><h3>Không ai cần nhắc hôm nay</h3><p className="muted">Mọi người học đều có hoạt động trong {view.inactiveDays} ngày gần đây.</p></section>}
    {view.history?.length ? <section className="section"><h3>Lịch sử nhắc</h3><div className="card table-wrap"><table aria-label="Lịch sử nhắc học"><thead><tr><th>Ngày</th><th>Người học</th><th>Email nhận</th><th>Kênh</th><th>Bỏ</th><th>Kết quả</th></tr></thead><tbody>{view.history.map((item) => <tr key={item.reminderId}><td>{formatReminderDate(item.createdAt)}</td><td>{item.learnerName}</td><td>{item.recipient ?? "—"}</td><td>{providerLabel(item.provider)}</td><td>{item.missedDays === null ? "—" : `${item.missedDays} ngày`}</td><td><Badge tone={statusTone(item.deliveryStatus ?? item.status)}>{statusLabel(item.deliveryStatus ?? item.status, item.provider)}</Badge></td></tr>)}</tbody></table></div></section> : null}
    {confirmation ? <div className="modal-backdrop manager-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setConfirmation(null); }}><section className="dialog manager-reminder-confirm-dialog" role="dialog" aria-modal="true" aria-label="Xác nhận gửi email"><h2>Xác nhận gửi email</h2>{confirmation.kind === "all" ? <p>Bạn sắp gửi email nhắc học cho <b>{view.candidates.length} người học</b>. Hãy chắc rằng danh sách và nội dung đã đúng.</p> : <p>Gửi email nhắc học cho <b>{confirmation.learnerName}</b> ({confirmation.learnerEmail ?? "chưa có email"})?</p>}<div className="row manager-reminder-confirm-actions"><button className="btn-sm" type="button" onClick={() => setConfirmation(null)}>Huỷ</button><button className="btn-sm btn-primary" type="button" onClick={() => void confirmEmail()}>Xác nhận gửi email</button></div></section></div> : null}
  </div>;
}

function reminderMessage(name: string, missedDays: number) { return `Chào ${name}, bạn đã ${missedDays} ngày chưa vào học tiếng Anh. Chỉ cần 15 phút hôm nay thôi – vào học một bài ngắn hoặc luyện một lượt với Season nhé!`; }
function formatReminderDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(value)); }
function providerLabel(provider?: string | null) { return provider === "resend" ? "Email" : provider === "base_webhook" ? "Base.vn" : "Khác"; }
function statusLabel(status: string, provider?: string | null) { if (status === "sent") return provider === "resend" ? "Đã gửi email" : "Đã gửi Base.vn"; return ({ queued: "Đã xếp hàng", delivered: "Đã giao", failed: "Gửi lỗi", copied: "Đã copy", dismissed: "Đã nhắc kênh khác", resolved: "Đã quay lại học" } as Record<string, string>)[status] ?? status; }
function statusTone(status: string): "" | "ok" | "warn" | "danger" | "primary" { return status === "delivered" || status === "sent" ? "ok" : status === "failed" ? "danger" : status === "resolved" ? "primary" : "warn"; }
