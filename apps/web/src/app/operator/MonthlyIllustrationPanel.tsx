import { useState } from "react";
import { ImageUp, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type { MonthlyIllustrationsView, MonthlyIllustrationView } from "../../api/operator.js";

/**
 * Core-word illustrations of the month: one square 256px picture per core word.
 * While resources are a draft the Operator can (re)generate with an optional note
 * or upload a picture. Approval freezes the pictures that exist; a word without a
 * picture (missing, failed, or interrupted) can still be generated or uploaded.
 */
export function MonthlyIllustrationPanel({ view, busy, onGenerate, onUpload, onRemove }: {
  view: MonthlyIllustrationsView;
  busy: boolean;
  onGenerate(input: { words?: string[]; hint?: string }): Promise<void> | void;
  onUpload(word: string, file: File): Promise<void> | void;
  onRemove?(word: string): Promise<void> | void;
}) {
  const locked = illustrationsFrameworkLocked(view);
  const counts = illustrationCounts(view);
  const working = view.running || counts.inProgress > 0;
  const canEdit = illustrationsEditable(view, busy);
  return <div className="monthly-illustrations">
    <div className="monthly-illustrations-summary">
      <p className="small">
        <b>{counts.ready}/{view.images.length}</b> từ có ảnh
        {counts.fillable ? ` · ${counts.fillable} có thể sinh tiếp` : null}
        {working ? <> · <span className="spinner" aria-hidden="true" /> đang sinh{counts.inProgress ? ` ${counts.inProgress} ảnh` : " ảnh"}…</> : null}
        {locked
          ? counts.fillable || counts.inProgress
            ? " · Ảnh đã có được khóa cùng tài nguyên; từ chưa có ảnh vẫn sinh hoặc tải lên được."
            : " · Ảnh đã khóa cùng tài nguyên, không đổi được."
          : " · Ảnh vuông 256px, không chứa chữ, theo chủ đề tháng. Sau khi chốt tài nguyên, ảnh đã có sẽ không đổi được."}
      </p>
      {!locked || counts.fillable ? <button type="button" className="btn btn-primary" disabled={!canEdit || !view.available || !counts.fillable} title={!view.available ? "Chưa cấu hình OPENAI_API_KEY và OPENAI_IMAGE_MODEL" : undefined} onClick={() => void onGenerate({})}><Sparkles size={16} aria-hidden="true" /> Sinh ảnh còn thiếu ({counts.fillable})</button> : null}
    </div>
    {!view.available && (!locked || counts.fillable) ? <p className="small monthly-error" role="note">Chưa cấu hình API ảnh (OPENAI_API_KEY, OPENAI_IMAGE_MODEL). Vẫn có thể tải ảnh lên tay.</p> : null}
    <ul className="monthly-illustration-grid">{view.images.map((image) => <IllustrationTile key={image.coreTermId} image={image} canEdit={canEdit} canGenerate={view.available} onGenerate={onGenerate} onUpload={onUpload} {...(onRemove && !locked ? { onRemove } : {})} />)}</ul>
  </div>;
}

/** The resources are approved: pictures that exist are frozen (older APIs only sent per-word locks). */
export function illustrationsFrameworkLocked(view: MonthlyIllustrationsView): boolean {
  return view.locked ?? view.images.some((image) => image.locked);
}

/** ready = has a picture; inProgress = queued or being drawn by a live job; fillable = can still get one. */
export function illustrationCounts(view: MonthlyIllustrationsView): { ready: number; inProgress: number; fillable: number } {
  return {
    ready: view.images.filter((image) => image.status === "ready").length,
    inProgress: view.images.filter((image) => image.status === "pending" || image.status === "generating").length,
    fillable: view.images.filter((image) => !image.locked && (image.status === "missing" || image.status === "failed")).length
  };
}

/**
 * Whether pictures can be changed right now: not while a job runs. Each tile also respects its own
 * lock (a picture frozen by approval never changes; a word without one stays fillable).
 */
export function illustrationsEditable(view: MonthlyIllustrationsView, busy: boolean): boolean {
  return !busy && !view.running && !view.images.some((image) => image.status === "pending" || image.status === "generating");
}

/** One core word's picture with its actions: redraw (optional note), upload a file, remove. A locked picture has none. */
export function IllustrationTile({ image, canEdit, canGenerate, onGenerate, onUpload, onRemove, as: Tag = "li" }: { image: MonthlyIllustrationView; canEdit: boolean; canGenerate: boolean; onGenerate(input: { words?: string[]; hint?: string }): Promise<void> | void; onUpload(word: string, file: File): Promise<void> | void; onRemove?(word: string): Promise<void> | void; as?: "li" | "div" }) {
  const [hintOpen, setHintOpen] = useState(false);
  const [hint, setHint] = useState("");
  const editable = canEdit && !image.locked;
  const statusLabel = { missing: "Chưa có ảnh", pending: "Đang chờ", generating: "Đang sinh…", ready: image.source === "upload" ? "Ảnh tải lên" : "Ảnh AI", failed: "Lỗi" }[image.status];
  return <Tag className={`monthly-illustration-tile is-${image.status}`} {...(Tag === "div" ? { role: "group", "aria-label": `Ảnh minh họa của ${image.word}` } : {})}>
    <div className="monthly-illustration-frame">{image.url ? <img src={image.url} alt={`Minh họa: ${image.word}`} width={128} height={128} loading="lazy" /> : <span className="small muted">{image.status === "generating" || image.status === "pending" ? "Đang sinh…" : "—"}</span>}</div>
    <div className="monthly-illustration-meta"><b>{image.word}</b><span className="small muted">{image.meaning}</span><span className={`badge${image.status === "failed" ? " danger" : image.status === "ready" ? " ok" : ""}`} title={image.error}>{statusLabel}</span></div>
    {editable ? <div className="monthly-illustration-actions">
      {canGenerate ? <button type="button" className="monthly-illustration-action" onClick={() => setHintOpen((value) => !value)} aria-expanded={hintOpen}><RefreshCw size={14} aria-hidden="true" /> Sinh lại</button> : null}
      <label className="monthly-illustration-action"><ImageUp size={14} aria-hidden="true" /> Tải ảnh<input hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label={`Tải ảnh cho ${image.word}`} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onUpload(image.word, file); }} /></label>
      {onRemove && image.url ? <button type="button" className="monthly-illustration-action" aria-label={`Xóa ảnh của ${image.word}`} title="Xóa ảnh (từ này sẽ chỉ hiện chữ)" onClick={() => void onRemove(image.word)}><Trash2 size={14} aria-hidden="true" /> Xóa ảnh</button> : null}
    </div> : null}
    {hintOpen && editable ? <form className="monthly-illustration-hint" onSubmit={(event) => { event.preventDefault(); setHintOpen(false); void onGenerate({ words: [image.word], ...(hint.trim() ? { hint: hint.trim() } : {}) }); }}>
      <input value={hint} maxLength={300} placeholder="Gợi ý thêm (không bắt buộc), vd: vẽ cảnh họp" aria-label={`Gợi ý vẽ lại ${image.word}`} onChange={(event) => setHint(event.target.value)} />
      <button type="submit" className="btn-sm btn-primary">Vẽ lại</button>
    </form> : null}
  </Tag>;
}
