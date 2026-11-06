import { useState } from "react";
import { ImageUp, RefreshCw, Sparkles } from "lucide-react";
import type { MonthlyIllustrationsView, MonthlyIllustrationView } from "../../api/operator.js";

/**
 * Core-word illustrations of the month: one square 256px picture per core word.
 * While resources are a draft the Operator can (re)generate with an optional note
 * or upload a picture; once resources are approved the pictures are frozen.
 */
export function MonthlyIllustrationPanel({ view, busy, onGenerate, onUpload }: {
  view: MonthlyIllustrationsView;
  busy: boolean;
  onGenerate(input: { words?: string[]; hint?: string }): Promise<void> | void;
  onUpload(word: string, file: File): Promise<void> | void;
}) {
  const locked = view.images.some((image) => image.locked);
  const ready = view.images.filter((image) => image.status === "ready").length;
  const working = view.running || view.images.some((image) => image.status === "pending" || image.status === "generating");
  const missing = view.images.filter((image) => image.status === "missing" || image.status === "failed").length;
  const canEdit = !locked && !busy && !working;
  return <div className="monthly-illustrations">
    <div className="monthly-illustrations-summary">
      <p className="small">
        <b>{ready}/{view.images.length}</b> từ đã có ảnh{working ? <> · <span className="spinner" aria-hidden="true" /> đang sinh ảnh…</> : null}
        {locked ? " · Ảnh đã khóa cùng tài nguyên, không đổi được." : " · Ảnh vuông 256px, không chứa chữ, theo chủ đề tháng. Sau khi chốt tài nguyên sẽ không đổi được ảnh."}
      </p>
      {!locked ? <button type="button" className="btn btn-primary" disabled={!canEdit || !view.available || !missing} title={!view.available ? "Chưa cấu hình OPENAI_API_KEY và OPENAI_IMAGE_MODEL" : undefined} onClick={() => void onGenerate({})}><Sparkles size={16} aria-hidden="true" /> Sinh ảnh còn thiếu ({missing})</button> : null}
    </div>
    {!view.available && !locked ? <p className="small monthly-error" role="note">Chưa cấu hình API ảnh (OPENAI_API_KEY, OPENAI_IMAGE_MODEL). Vẫn có thể tải ảnh lên tay.</p> : null}
    <ul className="monthly-illustration-grid">{view.images.map((image) => <IllustrationTile key={image.coreTermId} image={image} canEdit={canEdit} canGenerate={view.available} onGenerate={onGenerate} onUpload={onUpload} />)}</ul>
  </div>;
}

function IllustrationTile({ image, canEdit, canGenerate, onGenerate, onUpload }: { image: MonthlyIllustrationView; canEdit: boolean; canGenerate: boolean; onGenerate(input: { words?: string[]; hint?: string }): Promise<void> | void; onUpload(word: string, file: File): Promise<void> | void }) {
  const [hintOpen, setHintOpen] = useState(false);
  const [hint, setHint] = useState("");
  const statusLabel = { missing: "Chưa có ảnh", pending: "Đang chờ", generating: "Đang sinh…", ready: image.source === "upload" ? "Ảnh tải lên" : "Ảnh AI", failed: "Lỗi" }[image.status];
  return <li className={`monthly-illustration-tile is-${image.status}`}>
    <div className="monthly-illustration-frame">{image.url ? <img src={image.url} alt={`Minh họa: ${image.word}`} width={128} height={128} loading="lazy" /> : <span className="small muted">{image.status === "generating" || image.status === "pending" ? "Đang sinh…" : "—"}</span>}</div>
    <div className="monthly-illustration-meta"><b>{image.word}</b><span className="small muted">{image.meaning}</span><span className={`badge${image.status === "failed" ? " danger" : image.status === "ready" ? " ok" : ""}`} title={image.error}>{statusLabel}</span></div>
    {canEdit ? <div className="monthly-illustration-actions">
      {canGenerate ? <button type="button" className="monthly-illustration-action" onClick={() => setHintOpen((value) => !value)} aria-expanded={hintOpen}><RefreshCw size={14} aria-hidden="true" /> Sinh lại</button> : null}
      <label className="monthly-illustration-action"><ImageUp size={14} aria-hidden="true" /> Tải ảnh<input hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label={`Tải ảnh cho ${image.word}`} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onUpload(image.word, file); }} /></label>
    </div> : null}
    {hintOpen && canEdit ? <form className="monthly-illustration-hint" onSubmit={(event) => { event.preventDefault(); setHintOpen(false); void onGenerate({ words: [image.word], ...(hint.trim() ? { hint: hint.trim() } : {}) }); }}>
      <input value={hint} maxLength={300} placeholder="Gợi ý thêm (không bắt buộc), vd: vẽ cảnh họp" aria-label={`Gợi ý vẽ lại ${image.word}`} onChange={(event) => setHint(event.target.value)} />
      <button type="submit" className="btn-sm btn-primary">Vẽ lại</button>
    </form> : null}
  </li>;
}
