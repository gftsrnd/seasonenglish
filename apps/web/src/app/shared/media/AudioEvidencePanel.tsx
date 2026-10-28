import { useState } from "react";
import { audioCleanupEligible, formatAudioDate, normalizeAudioEvidence, type AudioEvidence } from "./audio-evidence.js";

export function AudioEvidencePanel({
  evidence,
  label = "Bằng chứng âm thanh",
  resultText,
  onDelete,
  now = new Date()
}: {
  evidence: unknown;
  label?: string;
  resultText?: string | null;
  onDelete?: (evidence: AudioEvidence) => void | Promise<void>;
  now?: Date;
}) {
  const normalized = normalizeAudioEvidence(evidence);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  if (!normalized && !resultText) return null;
  const deleted = Boolean(normalized?.deletion?.deletedAt);
  const playable = Boolean(normalized?.signedUrl) && !failed && !deleted;
  const transcript = normalized?.transcript?.trim();
  const eligible = normalized ? audioCleanupEligible(normalized, now) : false;
  return <section className="stack audio-evidence-panel" aria-label={label}>
    {transcript ? <div className="audio-evidence-transcript"><strong>Bản chép lời</strong><p>{transcript}</p></div> : null}
    {resultText ? <p className="small audio-evidence-result">{resultText}</p> : null}
    {playable ? <audio controls preload="metadata" src={normalized!.signedUrl} aria-label={`Phát ${label}`} onError={() => setFailed(true)} style={{ maxWidth: "100%", width: "100%" }} /> : null}
    {deleted ? <p className="small muted" role="status">Bản ghi âm đã xoá{normalized?.deletion?.deletedAt ? ` ngày ${formatAudioDate(normalized.deletion.deletedAt)}` : ""}{normalized?.deletion?.deletedBy ? ` bởi ${normalized.deletion.deletedBy}` : ""}.</p> : null}
    {!deleted && normalized?.signedUrl && failed ? <p className="small" role="alert">Không phát được audio. Không phát được bản ghi âm này; transcript và kết quả vẫn được giữ.</p> : null}
    {!deleted && normalized?.artifactKey && !normalized.signedUrl ? <p className="small muted" role="status">Bản ghi âm chưa có link phát lại. Transcript và kết quả vẫn được giữ.</p> : null}
    {eligible ? <p className="small" role="note">Bản ghi âm đã đủ 60 ngày và có thể xoá. Không xoá tự động.</p> : null}
    {deleteError ? <p className="small" role="alert">{deleteError}</p> : null}
    {onDelete && normalized && normalized.fileId && !deleted ? confirming ? <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      <span className="small">Bạn có chắc muốn xoá bản ghi âm này?</span>
      <button className="btn-sm btn-danger" type="button" disabled={deleting} onClick={() => {
        setDeleting(true);
        setDeleteError("");
        void Promise.resolve(onDelete(normalized)).then(() => setConfirming(false)).catch(() => setDeleteError("Chưa xoá được bản ghi âm. Transcript và kết quả vẫn được giữ." )).finally(() => setDeleting(false));
      }}>{deleting ? "Đang xoá…" : "Xác nhận xoá bản ghi âm"}</button>
      <button className="btn-sm btn-ghost" type="button" disabled={deleting} onClick={() => setConfirming(false)}>Huỷ</button>
    </div> : <button className="btn-sm btn-ghost" type="button" disabled={!eligible} onClick={() => setConfirming(true)}>Xoá bản ghi âm</button> : null}
  </section>;
}
