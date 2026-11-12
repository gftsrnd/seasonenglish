import type { ManagerBaseNotificationInput, ManagerReminderChannel, ManagerRemindersView } from "@e4s/contracts";
import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { useDialog } from "../shared/ModalProvider.js";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { Badge, PageTitle, copyText } from "./shared.js";
import { BaseNotificationEditor } from "./BaseNotificationEditor.js";
import "./reminder-channels.css";

export type ManagerRemindersProps = {
  view: ManagerRemindersView;
  sendingKey?: string | null;
  notice?: string | null;
  noticeTone?: "info" | "danger" | "ok";
  onSend: (learnerId: string, channel: ManagerReminderChannel) => void | Promise<void>;
  onSendAll?: (channel: ManagerReminderChannel) => void | Promise<void>;
  onDismiss?: (learnerId: string) => void | Promise<void>;
  onCopy?: (learnerId: string) => void | Promise<void>;
  onSaveBase?: (learnerId: string, input: ManagerBaseNotificationInput) => Promise<void>;
  /** Removes one row from the reminder history log; the caller owns the confirmation. */
  onDeleteHistory?: (item: ManagerReminderHistoryItem) => void | Promise<void>;
};

type ManagerReminderHistoryItem = NonNullable<ManagerRemindersView["history"]>[number];

export function ManagerReminders({ view, sendingKey, notice, noticeTone = "info", onSend, onSendAll, onDismiss, onCopy, onSaveBase, onDeleteHistory }: ManagerRemindersProps) {
  const compact = useMediaQuery("(max-width: 800px)");
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [handlingLearnerId, setHandlingLearnerId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [editingBaseId, setEditingBaseId] = useState<string | null>(null);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState("");
  const [confirmation, setConfirmation] = useState<{ kind: "all" } | { kind: "single"; learnerId: string; learnerName: string; learnerEmail: string | null; channel: ManagerReminderChannel } | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeConfirmation = () => setConfirmation(null);
  useDialog(confirmation !== null, dialogRef, closeConfirmation);
  const sending = Boolean(sendingKey);
  const history = view.history ?? [];
  const visibleHistory = showAllHistory ? history : history.slice(0, 6);
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
  const runDeleteHistory = async (item: ManagerReminderHistoryItem) => {
    if (!onDeleteHistory || deletingHistoryId) return;
    setDeletingHistoryId(item.reminderId);
    try { await onDeleteHistory(item); }
    catch { /* The route reports the failure through the shared toast. */ }
    finally { setDeletingHistoryId(null); }
  };
  const deleteHistoryButton = (item: ManagerReminderHistoryItem) => onDeleteHistory ? <button className="btn-sm btn-danger manager-reminder-history-delete" type="button" disabled={Boolean(deletingHistoryId)} aria-busy={deletingHistoryId === item.reminderId || undefined} aria-label={`Xóa lượt nhắc ${item.learnerName} ngày ${formatReminderDate(item.createdAt)}`} onClick={() => void runDeleteHistory(item)}>{deletingHistoryId === item.reminderId ? "Đang xóa…" : "Xóa"}</button> : null;
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
  const confirmSend = async () => {
    const pending = confirmation;
    if (!pending) return;
    setConfirmation(null);
    if (pending.kind === "all") await runSendAll();
    else await onSend(pending.learnerId, pending.channel);
  };
  return <div className="manager-page manager-reminders-page">
    <PageTitle description={<p className="muted">Nhắc học viên vắng từ {view.inactiveDays} ngày.</p>}><h1>Nhắc học</h1></PageTitle>
    {view.emailConfigured === false ? <div className="banner info" role="note"><div className="body"><b>Chưa cấu hình email Resend.</b> Nút Gửi email sẽ bị khóa trên môi trường này.</div></div> : null}
    {notice ? <div className={`banner ${noticeTone}`} role={noticeTone === "danger" ? "alert" : "status"}>{notice}</div> : null}
    {localStatus ? <div className="manager-inline-status xs muted" role="status" aria-live="polite">{localStatus}</div> : null}
    {view.candidates.length ? <div className="card row between manager-reminder-toolbar"><div><b>{view.candidates.length} người học cần được nhắc</b><span className="small muted">Email được gửi riêng cho từng học viên.</span></div><button className="btn-primary" type="button" disabled={view.emailConfigured === false || sending || sendingAll} aria-busy={sendingAll || undefined} onClick={() => setConfirmation({ kind: "all" })}>{sendingAll ? "Đang gửi tất cả…" : "Gửi tất cả qua email"}</button></div> : null}
    {view.candidates.length ? <div className="manager-reminder-queue">
      {view.candidates.map((candidate) => {
        const days = candidate.missedDays ?? view.inactiveDays;
        const message = reminderMessage(candidate.learnerName, days);
        const busy = handlingLearnerId === candidate.learnerId;
        const emailBusy = sendingKey === `${candidate.learnerId}:email`;
        const baseBusy = sendingKey === `${candidate.learnerId}:base`;
        const expanded = expandedId === candidate.learnerId;
        const detailId = `reminder-detail-${candidate.learnerId}`;
        const identity = <span className="manager-reminder-identity">
          <b>{candidate.learnerName}</b>
          {candidate.cefr ? <Badge tone="primary">{candidate.cefr}</Badge> : null}
          <Badge tone="danger">Vắng {days} ngày</Badge>
        </span>;
        return <section className="card manager-reminder-card" key={candidate.learnerId} aria-label={`Nhắc học cho ${candidate.learnerName}`}>
          {compact ? <button className="manager-reminder-toggle" type="button" aria-expanded={expanded} aria-controls={detailId}
            onClick={() => setExpandedId(expanded ? null : candidate.learnerId)}>
            {identity}<span className="manager-reminder-toggle-label">{expanded ? "Thu gọn" : "Xem tin"}<ChevronDown size={16} aria-hidden="true" /></span>
          </button> : identity}
          <div id={detailId} hidden={compact && !expanded}>
            <div className="manager-reminder-recipient">Email nhận: <b>{candidate.learnerEmail ?? "Chưa có email"}</b></div>
            <div className="manager-reminder-recipient">Base.vn: <b>{candidate.baseNotification?.configured ? candidate.baseNotification.destinationLabel : "Chưa cấu hình cho người học"}</b></div>
            <div className="manager-reminder-recipient">Hoạt động gần nhất: <b>{candidate.lastActivityAt ? formatReminderDate(candidate.lastActivityAt) : "Chưa có hoạt động"}</b></div>
            <div className="small manager-reminder-message">{message}</div>
            <div className="row manager-reminder-actions" role="group" aria-label={`Thao tác nhắc học cho ${candidate.learnerName}`}>
            <button className="btn-sm" type="button" disabled={busy || sending} aria-busy={busy || undefined} onClick={() => void runCopy(candidate.learnerId, message)}>{busy ? "Đang copy…" : "Copy tin nhắn"}</button>
            <button className="btn-sm btn-primary" type="button" disabled={view.emailConfigured === false || sending || Boolean(handlingLearnerId) || !candidate.learnerEmail} aria-busy={emailBusy || undefined} title={!candidate.learnerEmail ? "Người học chưa có email nhận" : view.emailConfigured === false ? "Email Resend chưa được cấu hình" : undefined} onClick={() => setConfirmation({ kind: "single", learnerId: candidate.learnerId, learnerName: candidate.learnerName, learnerEmail: candidate.learnerEmail ?? null, channel: "email" })}>{emailBusy ? "Đang gửi email…" : "Gửi email"}</button>
            <button className="btn-sm btn-primary" type="button" disabled={!candidate.baseNotification?.configured || sending || sendingAll || Boolean(handlingLearnerId)} aria-busy={baseBusy || undefined} title={!candidate.baseNotification?.configured ? "Cấu hình kênh nhận Base.vn riêng cho người học trước khi gửi" : undefined} onClick={() => setConfirmation({ kind: "single", learnerId: candidate.learnerId, learnerName: candidate.learnerName, learnerEmail: candidate.baseNotification?.destinationLabel ?? null, channel: "base" })}>{baseBusy ? "Đang gửi Base.vn…" : "Gửi Base.vn"}</button>
            <button className="btn-sm" type="button" disabled={!onSaveBase || busy || sending || sendingAll} onClick={() => setEditingBaseId(editingBaseId === candidate.learnerId ? null : candidate.learnerId)}>Cấu hình Base.vn</button>
            <button className="btn-sm btn-ghost" type="button" disabled={!onDismiss || busy || sending} aria-busy={busy || undefined} title={!onDismiss ? "Chưa có API ghi nhận lời nhắc qua kênh khác" : undefined} onClick={() => void runDismiss(candidate.learnerId)}>{busy ? "Đang ghi nhận…" : "Đã nhắc qua kênh khác"}</button>
          </div>
          {editingBaseId === candidate.learnerId && onSaveBase ? <BaseNotificationEditor learnerName={candidate.learnerName} value={candidate.baseNotification} onCancel={() => setEditingBaseId(null)} onSave={async (input) => { setHandlingLearnerId(candidate.learnerId); try { await onSaveBase(candidate.learnerId, input); setEditingBaseId(null); } finally { setHandlingLearnerId(null); } }} /> : null}
          </div>
        </section>;
      })}
    </div> : <section className="card manager-reminder-empty-state"><h3>Không ai cần nhắc hôm nay</h3><p className="muted">Mọi người học đều có hoạt động trong {view.inactiveDays} ngày gần đây.</p></section>}
    {history.length ? <section className="card section manager-reminder-history">
      <h3>Lịch sử nhắc</h3>
      {compact ? <>
      <ul role="list" className="manager-reminder-history-list" aria-label="Lịch sử nhắc học">
        {visibleHistory.map((item) => {
          const status = item.deliveryStatus ?? item.status;
          return <li key={item.reminderId}>
            <div className="manager-reminder-history-heading">
              <b>{item.learnerName}</b>
              <Badge tone={statusTone(status)}>{statusLabel(status, item.provider)}</Badge>
            </div>
            <div className="small muted">
              <time dateTime={item.createdAt}>{formatReminderDate(item.createdAt)}</time> · {providerLabel(item.provider)}
              {item.missedDays !== null ? ` · Vắng ${item.missedDays} ngày` : null}
            </div>
            {item.recipient ? <div className="small muted">Nơi nhận: {item.recipient}</div> : null}
            {deleteHistoryButton(item)}
          </li>;
        })}
      </ul>
      {!showAllHistory && history.length > visibleHistory.length ? <button className="btn-sm manager-reminder-history-more" type="button" onClick={() => setShowAllHistory(true)}>Xem thêm {history.length - visibleHistory.length} lượt</button> : null}
      </> : <div className="table-wrap bounded-scroll-region sticky-table-head manager-reminder-history-scroll" role="region" aria-label="Danh sách lịch sử nhắc" tabIndex={0}><table aria-label="Lịch sử nhắc học"><thead><tr><th>Ngày</th><th>Người học</th><th>Nơi nhận</th><th>Kênh</th><th>Bỏ</th><th>Kết quả</th>{onDeleteHistory ? <th><span className="sr-only">Thao tác</span></th> : null}</tr></thead><tbody>{history.map((item) => <tr key={item.reminderId}><td>{formatReminderDate(item.createdAt)}</td><td>{item.learnerName}</td><td>{item.recipient ?? "—"}</td><td>{providerLabel(item.provider)}</td><td>{item.missedDays === null ? "—" : `${item.missedDays} ngày`}</td><td><Badge tone={statusTone(item.deliveryStatus ?? item.status)}>{statusLabel(item.deliveryStatus ?? item.status, item.provider)}</Badge></td>{onDeleteHistory ? <td className="manager-reminder-history-action">{deleteHistoryButton(item)}</td> : null}</tr>)}</tbody></table></div>}
    </section> : null}
    {confirmation ? <div className="modal-backdrop manager-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setConfirmation(null); }}><section ref={dialogRef} className="dialog manager-reminder-confirm-dialog" role="dialog" aria-modal="true" tabIndex={-1} aria-label={`Xác nhận gửi ${confirmation.kind === "single" && confirmation.channel === "base" ? "Base.vn" : "email"}`}><h2>Xác nhận gửi {confirmation.kind === "single" && confirmation.channel === "base" ? "Base.vn" : "email"}</h2>{confirmation.kind === "all" ? <p>Bạn sắp gửi email nhắc học cho <b>{view.candidates.length} người học</b>. Hãy chắc rằng danh sách và nội dung đã đúng.</p> : <p>Gửi {confirmation.channel === "base" ? "Base.vn" : "email"} nhắc học cho <b>{confirmation.learnerName}</b> ({confirmation.learnerEmail ?? "chưa có nơi nhận"})?{confirmation.channel === "base" ? " Tin sẽ đến cuộc trò chuyện được gắn với incoming webhook đã lưu cho người học này." : ""}</p>}<div className="row manager-reminder-confirm-actions"><button className="btn-sm" type="button" onClick={() => setConfirmation(null)}>Huỷ</button><button className="btn-sm btn-primary" type="button" onClick={() => void confirmSend()}>Xác nhận gửi {confirmation.kind === "single" && confirmation.channel === "base" ? "Base.vn" : "email"}</button></div></section></div> : null}
  </div>;
}

function reminderMessage(name: string, missedDays: number) { return `Chào ${name}, bạn đã ${missedDays} ngày chưa vào học tiếng Anh. Chỉ cần 15 phút hôm nay thôi – vào học một bài ngắn hoặc luyện một lượt với Season nhé!`; }
function formatReminderDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(value)); }
function providerLabel(provider?: string | null) { return provider === "resend" ? "Email" : provider === "base_webhook" ? "Base.vn" : "Khác"; }
function statusLabel(status: string, provider?: string | null) { if (status === "sent") return provider === "resend" ? "Đã gửi email" : "Đã gửi Base.vn"; return ({ queued: "Đã xếp hàng", delivered: "Đã giao", failed: "Gửi lỗi", copied: "Đã copy", dismissed: "Đã nhắc kênh khác", resolved: "Đã quay lại học" } as Record<string, string>)[status] ?? status; }
function statusTone(status: string): "" | "ok" | "warn" | "danger" | "primary" { return status === "delivered" || status === "sent" ? "ok" : status === "failed" ? "danger" : status === "resolved" ? "primary" : "warn"; }
