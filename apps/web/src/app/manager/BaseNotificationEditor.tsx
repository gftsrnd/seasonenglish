import { useState } from "react";
import type { ManagerBaseNotificationInput, ManagerBaseNotificationView } from "@e4s/contracts";
import { useModal } from "../shared/ModalProvider.js";
import { Save, X } from "lucide-react";
import { ActionLabel, useCompactUi } from "../shared/CompactUi.js";
import { ManagerTitle } from "./shared.js";

export function BaseNotificationEditor({ learnerName, value, onSave, onCancel }: {
  learnerName: string;
  value: ManagerBaseNotificationView | undefined;
  onSave: (input: ManagerBaseNotificationInput) => Promise<void>;
  onCancel: () => void;
}) {
  const modal = useModal();
  const compact = useCompactUi();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [destinationLabel, setDestinationLabel] = useState(value?.destinationLabel || learnerName);
  const [webhookTemplate, setWebhookTemplate] = useState(value?.webhookTemplate || '{"base_content":"{message}"}');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const replacing = Boolean(value?.configured && webhookUrl.trim());
  const save = async (remove = false) => {
    if (saving) return;
    if (!remove) {
      if (!destinationLabel.trim()) { setError("Nhập tên nơi nhận Base.vn."); return; }
      if (!value?.configured && !webhookUrl.trim()) { setError("Nhập incoming webhook dành cho người học này."); return; }
      if (webhookUrl.trim()) {
        try { const url = new URL(webhookUrl.trim()); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); }
        catch { setError("Webhook cần là URL HTTPS hợp lệ."); return; }
      }
      try {
        const payload: unknown = JSON.parse(webhookTemplate);
        if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("base_content" in payload) || typeof payload.base_content !== "string" || !payload.base_content.includes("{message}")) throw new Error();
      } catch { setError("JSON cần có base_content chứa {message}."); return; }
    }
    if ((remove || replacing) && !await modal.confirm({
      title: remove ? "Gỡ kênh Base.vn?" : "Thay webhook Base.vn?",
      message: remove
        ? <>E4S sẽ ngừng gửi nhắc học qua Base.vn cho <b>{learnerName}</b> cho đến khi có cấu hình mới.</>
        : <>Nhắc học qua Base.vn cho <b>{learnerName}</b> sẽ dùng nơi nhận mới sau khi lưu.</>,
      confirmLabel: remove ? "Gỡ kênh Base.vn" : "Thay webhook",
      tone: "danger",
      countdownSeconds: 0
    })) return;
    setSaving(true); setError("");
    try { await onSave({ webhookUrl: webhookUrl.trim(), destinationLabel: destinationLabel.trim(), webhookTemplate, remove }); }
    catch { setError("Không lưu được kênh Base.vn. Kiểm tra URL, payload và thử lại."); }
    finally { setSaving(false); }
  };
  return <form className="card soft manager-base-editor" aria-label={`Kênh Base.vn của ${learnerName}`} onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <ManagerTitle title={compact ? "Kênh nhận Base.vn" : `Kênh nhận Base.vn của ${learnerName}`} tip={<>Dán incoming webhook của cuộc trò chuyện Base Message dành cho người học này. Webhook quyết định nơi nhận; hệ thống không tự tìm tài khoản Base theo email. Lưu cấu hình không gửi tin.{value?.configured ? " URL đã lưu được ẩn. Để trống để giữ nguyên; dùng Gỡ kênh để ngừng cấu hình cho các lần gửi mới." : ""} Mẫu payload dùng base_content với {"{message}"}; có thể thêm {"{name}"}. Chỉ dùng webhook mà người học được phép nhận.</>} />
    {compact ? null : <p className="small muted">Dán incoming webhook của cuộc trò chuyện Base Message dành cho người học này. Webhook quyết định nơi nhận; hệ thống không tự tìm tài khoản Base theo email. Lưu cấu hình không gửi tin.</p>}
    <label>Tên nơi nhận Base.vn<input value={destinationLabel} maxLength={120} disabled={saving} onChange={(event) => setDestinationLabel(event.target.value)} /></label>
    <label>Webhook Base.vn của {learnerName}<input type="password" autoComplete="new-password" value={webhookUrl} disabled={saving} placeholder={value?.configured ? "Đã lưu bí mật — để trống để giữ nguyên" : "https://…"} onChange={(event) => setWebhookUrl(event.target.value)} /></label>
    {value?.configured && !compact ? <p className="small muted">URL đã lưu được ẩn. Để trống để giữ nguyên; dùng Gỡ kênh để ngừng cấu hình cho các lần gửi mới.</p> : null}
    <label>Mẫu payload Base.vn (JSON)<textarea rows={compact ? 2 : 3} value={webhookTemplate} disabled={saving} onChange={(event) => setWebhookTemplate(event.target.value)} /></label>
    {compact ? null : <p className="small muted">Dùng <code>base_content</code> với <code>{"{message}"}</code>; có thể thêm <code>{"{name}"}</code>. Chỉ dùng webhook mà người học được phép nhận.</p>}
    {error ? <p className="small danger" role="alert">{error}</p> : null}
    {compact ? <div className="row manager-base-editor-actions">{value?.configured ? <button className="btn-sm btn-danger" type="button" disabled={saving} onClick={() => void save(true)}>Gỡ kênh</button> : null}<button className={replacing ? "btn-sm btn-danger" : "btn-sm btn-primary"} type="submit" aria-label="Lưu kênh Base.vn" disabled={saving}>{saving ? "…" : <ActionLabel icon={Save} label="Lưu kênh Base.vn" />}</button><button className="btn-sm" type="button" aria-label="Đóng cấu hình" disabled={saving} onClick={onCancel}><ActionLabel icon={X} label="Đóng cấu hình" /></button></div>
    : <div className="row"><button className={replacing ? "btn-sm btn-danger" : "btn-sm btn-primary"} type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu kênh Base.vn"}</button><button className="btn-sm" type="button" disabled={saving} onClick={onCancel}>Đóng cấu hình</button>{value?.configured ? <button className="btn-sm btn-danger" type="button" disabled={saving} onClick={() => void save(true)}>Gỡ kênh Base.vn</button> : null}</div>}
  </form>;
}
