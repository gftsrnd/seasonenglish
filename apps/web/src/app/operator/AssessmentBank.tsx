import { useEffect, useRef, useState } from "react";
import type { AssessmentBankBlueprint, AssessmentBankFormDetail, AssessmentBankPolicy, AssessmentBankScope, AssessmentBankView, AssessmentLevelFormUpdateInput } from "@e4s/contracts";
import type { AssessmentBankClient } from "../../api/operator.js";
export type { AssessmentBankClient } from "../../api/operator.js";
import { useDialog, useModal } from "../shared/ModalProvider.js";
import { ModalCloseButton } from "../shared/CompactUi.js";
import { OperatorLevelFormDetail } from "./LevelForms.js";
import { AssessmentPreviewDialog, type AssessmentPreviewForm } from "./AssessmentPreviewDialog.js";
import { formatScore } from "../shared/format-score.js";
import "./assessment-bank.css";


const titles: Record<AssessmentBankScope, string> = { placement: "Đề đầu vào", retake: "Đề thi lại đầu vào", pass_course: "Đề đầu ra", A2: "Đề lên mức A2", B1: "Đề lên mức B1", B2: "Đề lên mức B2", C1: "Đề lên mức C1" };
function bankPreview(form: AssessmentBankFormDetail): AssessmentPreviewForm {
  const blueprint = form.blueprint;
  return {
    versionId: form.versionId,
    title: form.title,
    version: form.version,
    kind: blueprint.kind === "level-up" ? "level_up" : blueprint.kind === "pass-course" ? "pass_course" : blueprint.kind,
    status: form.status === "archived" ? "retired" : form.status,
    totalMinutes: blueprint.totalMinutes,
    totalScore: blueprint.totalScore,
    audioConfigured: form.audioConfigured === true,
    editable: false,
    sections: blueprint.sections.map(section => ({ ...section, groups: section.groups.map(group => ({ ...group, tasks: group.tasks.map(task => ({ ...task, correctAnswer: task.correctAnswer ?? null })) })) }))
  };
}
function errorText(error: unknown): string {
  const item = error as { code?: string; message?: string; issues?: string[]; details?: { issues?: string[] } };
  const issues = item?.issues ?? item?.details?.issues;
  if (issues?.length) return issues.join(" · ");
  const messages: Record<string, string> = {
    ASSESSMENT_BANK_INCOMPATIBLE: "Các bộ đã chọn chưa tương thích. Kiểm tra lại cấu trúc và tiêu chí chấm.",
    ASSESSMENT_BANK_INCOMPATIBLE_SOURCES: "Các bộ chưa tương thích hoặc số bộ vượt số phần có thể ghép. Hãy chọn lại nguồn đề.",
    ASSESSMENT_BANK_SOURCE_CONFIGURED: "Bộ đang được chọn để giao đề. Hãy đổi cấu hình trước khi lưu trữ.",
    ASSESSMENT_BANK_FORM_USED: "Đã có lượt thi; giữ đề, audio và lịch sử kết quả. Không thể xoá bộ đề này.",
    ASSESSMENT_BANK_ARCHIVE_REQUIRED: "Hãy lưu trữ bộ đề trước khi xoá.",
    ASSESSMENT_BANK_SOURCE_COUNT: "Số bộ đã chọn chưa khớp số lượng muốn trộn.",
    ASSESSMENT_BANK_SOURCE_UNAVAILABLE: "Có bộ chưa được duyệt hoặc đã ngừng sử dụng. Hãy tải lại và chọn nguồn khác.",
    ASSESSMENT_BANK_GENERATION_FAILED: "Chưa sinh được đề hoàn chỉnh. Hãy thử lại hoặc soạn tay.",
    ASSESSMENT_BANK_GENERATION_SHAPE: "Nội dung AI chưa đúng cấu trúc đề. Hãy thử sinh lại.",
    ASSESSMENT_BANK_GENERATION_ANSWERS: "Đáp án AI chưa hợp lệ. Hãy thử sinh lại.",
    ASSESSMENT_BANK_GENERATION_STIMULUS: "Nội dung AI còn thiếu ngữ liệu. Hãy thử sinh lại.",
    AI_UNAVAILABLE: "AI chưa sẵn sàng. Bạn có thể soạn tay hoặc thử lại sau.",
    AI_PROMPT_NOT_READY: "Chưa có cấu hình sinh đề AI. Hãy kiểm tra thiết lập.",
    NETWORK_UNAVAILABLE: "Mất kết nối. Hãy thử lại; cấu hình chưa được thay đổi.",
    ASSESSMENT_BANK_SOURCE_IN_USE: "Bộ đang được chọn để giao đề. Hãy đổi cấu hình trước khi lưu trữ."
  };
  return messages[item?.code ?? ""] ?? item?.message ?? item?.code ?? "Chưa thực hiện được. Hãy thử lại.";
}

export function AssessmentBank({ scope, client, readOnly = false }: { scope: AssessmentBankScope; client: AssessmentBankClient; readOnly?: boolean }) {
  const modal = useModal();
  const [bank, setBank] = useState<AssessmentBankView>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [policyOpen, setPolicyOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<{ form: AssessmentBankFormDetail; editing: boolean }>();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let current = true;
    setBank(undefined); setError(undefined); setNotice(undefined); setEditor(undefined); setPolicyOpen(false); setShowArchived(false);
    client.getAssessmentBank(scope).then(data => { if (current) setBank(data); }, reason => { if (current) setError(errorText(reason)); });
    return () => { current = false; mounted.current = false; };
  }, [scope, client]);
  const reload = async () => { const next = await client.getAssessmentBank(scope); if (mounted.current) setBank(next); };
  const checked = async (form: AssessmentBankFormDetail) => ({ ...form, issues: (await client.validateAssessmentBankForm(scope, form.versionId)).issues });
  const run = async (key: string, action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(key); setError(undefined); setNotice(undefined);
    try { await action(); } catch (reason) { if (mounted.current) setError(errorText(reason)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(undefined); }
  };
  const open = (id: string, editing: boolean) => run(id, async () => {
    let form = await client.getAssessmentBankForm(scope, id);
    if (editing && form.status === "published") form = await client.updateAssessmentBankForm(scope, id, form.blueprint);
    setEditor({ form: editing ? await checked(form) : form, editing }); await reload();
  });
  const create = (method: "manual" | "ai") => run(method, async () => {
    const form = await client.createAssessmentBankForm(scope, { method });
    if (mounted.current) setEditor({ form: await checked(form), editing: true });
    await reload();
  });
  const archive = async (id: string, draft: boolean) => {
    if (inFlight.current) return;
    if (!await modal.confirm({ title: draft ? "Bỏ bản nháp?" : "Lưu trữ bộ đề?", message: draft ? "Bản nháp sẽ ngừng sử dụng." : "Ngừng giao bộ này cho lượt thi mới. Bài đang thi và lịch sử kết quả vẫn được giữ.", confirmLabel: draft ? "Bỏ bản nháp" : "Lưu trữ", cancelLabel: "Huỷ", countdownSeconds: 0 })) return;
    await run(id, async () => { await client.archiveAssessmentBankForm(scope, id); await reload(); setNotice("Đã lưu trữ bộ đề; lịch sử bài thi được giữ nguyên."); });
  };
  const remove = async (id: string, title: string) => {
    if (inFlight.current) return;
    if (!await modal.confirm({ title: "Xoá bộ đề đã lưu trữ?", message: `“${title}” chưa có lượt thi. Xoá vĩnh viễn bộ đề này? Tệp audio dùng chung vẫn được giữ.`, confirmLabel: "Xoá bộ đề", cancelLabel: "Huỷ", tone: "danger", countdownSeconds: 0 })) return;
    await run(id, async () => { await client.deleteAssessmentBankForm(scope, id); await reload(); setNotice("Đã xoá bộ đề lưu trữ chưa sử dụng."); });
  };
  if (!bank) return <section className="card" aria-label={titles[scope]}>{error ? <p role="alert">{error}</p> : <p>Đang tải kho đề…</p>}</section>;
  const visibleForms = bank.forms.filter(form => showArchived || form.status !== "archived");
  return <section className="card operator-assessment-form-list assessment-bank" data-assessment-kind={scope === "placement" || scope === "retake" ? "placement" : scope === "pass_course" ? "pass_course" : "level_up"} aria-label={`Kho ${titles[scope].toLocaleLowerCase("vi")}`}>
    <div className="row between assessment-bank-header"><div><p className="xs muted">PHIÊN BẢN ĐỀ ĐÃ LƯU</p><h2>{titles[scope]}</h2></div><span className="badge">{visibleForms.length} phiên bản</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!bank.forms.length && <p className="muted">Chưa có bộ đề. Soạn tay hoặc sinh AI để tạo bản nháp, kiểm tra rồi duyệt trước khi sử dụng.</p>}
    <div className="row assessment-bank-toolbar">{!readOnly && <><button type="button" className="btn-sm assessment-bank-compact-action" disabled={Boolean(busy)} onClick={() => void create("manual")}>Soạn tay</button><button type="button" className="btn-sm btn-primary assessment-bank-compact-action" disabled={Boolean(busy)} onClick={() => void create("ai")}>{busy === "ai" ? "Đang sinh…" : "Sinh bằng AI"}</button><button type="button" className="btn-sm assessment-bank-compact-action" disabled={Boolean(busy)} onClick={() => setPolicyOpen(true)}>Cách giao đề</button></>}
      {bank.forms.some(form => form.status === "archived") && <button type="button" className="btn-sm assessment-bank-archive-toggle" aria-expanded={showArchived} onClick={() => setShowArchived(value => !value)}>{showArchived ? "Ẩn kho lưu trữ" : `Xem kho lưu trữ (${bank.forms.filter(form => form.status === "archived").length})`}</button>}
    </div>
    <div className="stack assessment-bank-list">{visibleForms.map(form => <article className="item operator-assessment-form-row assessment-bank-row" key={form.versionId}>
      <div className="operator-assessment-form-info">
        <div className="assessment-bank-title">
          <b>{form.title}</b>
          {form.status === "archived" ? <span className="badge assessment-bank-state archived">Đã lưu trữ</span>
            : form.status === "draft" ? <span className="badge assessment-bank-state draft">Bản nháp</span>
            : bank.policy.versionIds.includes(form.versionId) ? <span className="badge assessment-bank-state active">Đang dùng</span>
            : <span className="badge assessment-bank-state approved">Đã duyệt</span>}
        </div>
        <p className="small muted"><span>Phiên bản {form.version} · {form.status === "published" ? "Đã phát hành" : form.status === "draft" ? "Bản nháp" : "Đã lưu lịch sử"}</span>
          {form.sectionCount !== undefined && form.totalMinutes !== undefined && form.totalScore !== undefined && <><span className="operator-form-meta-divider"> · </span><span className="operator-form-metrics"><span>{form.sectionCount} kỹ năng</span> · <span>{form.totalMinutes} phút</span> · <span>{formatScore(form.totalScore)} điểm</span></span></>}
        </p>
        {form.audioConfigured !== undefined && <p className="xs muted">Âm thanh: {form.audioConfigured ? "đã cấu hình nguồn audio" : "chưa đủ nguồn audio"}</p>}
        {form.status === "archived" && form.deleteReason && <p className="small muted">{form.deleteReason}</p>}
      </div>
      <div className="row operator-assessment-form-actions assessment-bank-actions" style={{ flex: "none", alignSelf: "flex-start", gap: 6 }}><button type="button" className="btn-sm assessment-bank-compact-action" disabled={Boolean(busy)} aria-label={`Xem ${form.title}`} onClick={() => void open(form.versionId, false)}>Xem</button>
        {!readOnly && form.status !== "archived" && <><button type="button" className="btn-sm assessment-bank-compact-action" disabled={Boolean(busy)} onClick={() => void open(form.versionId, true)}>{form.status === "published" ? "Tạo bản sửa" : "Sửa"}</button><button type="button" className="btn-sm assessment-bank-compact-action" disabled={Boolean(busy)} onClick={() => void archive(form.versionId, form.status === "draft")}>{form.status === "draft" ? "Bỏ nháp" : "Lưu trữ"}</button></>}
        {!readOnly && form.status === "archived" && form.canDelete === true && <button type="button" className="btn-sm btn-danger assessment-bank-compact-action" disabled={Boolean(busy)} aria-label={`Xoá ${form.title}`} onClick={() => void remove(form.versionId, form.title)}>Xoá</button>}
      </div>
    </article>)}</div>
    {policyOpen && <AssessmentDeliveryDialog bank={bank} onClose={() => setPolicyOpen(false)} onSave={async policy => {
      const next = await client.saveAssessmentBankPolicy(scope, policy); setBank(next); setPolicyOpen(false); setNotice("Đã áp dụng cho các lượt thi mới. Bài đang thi và lịch sử giữ nguyên.");
    }} />}
    {editor && !editor.editing && <AssessmentPreviewDialog key={editor.form.versionId} form={bankPreview(editor.form)} readOnly onClose={() => setEditor(undefined)} />}
    {editor?.editing && <OperatorLevelFormDetail key={editor.form.versionId} kicker={titles[scope]} dialogLabel={`Soạn ${titles[scope].toLowerCase()}`} readOnly={readOnly || editor.form.status !== "draft"} editing
      publicationReady={editor.form.issues?.length === 0}
      detail={{ title: editor.form.title, status: editor.form.status === "archived" ? "retired" : editor.form.status, sections: editor.form.blueprint.sections, warnings: (editor.form.issues ?? []).map(message => ({ code: "quality_check" as const, severity: "error" as const, message })), versions: [], deleteReason: null }}
      onClose={() => setEditor(undefined)}
      onConfirmDiscard={() => modal.confirm({ title: "Đóng bản đang sửa?", message: "Các thay đổi chưa lưu sẽ bị bỏ.", confirmLabel: "Đóng", cancelLabel: "Tiếp tục sửa", countdownSeconds: 0 })}
      {...(!readOnly && editor.editing && editor.form.status === "draft" ? {
        onSave: async (input: AssessmentLevelFormUpdateInput) => {
          const blueprint: AssessmentBankBlueprint = { ...editor.form.blueprint, ...input, sections: input.sections.map(section => ({ ...section, groups: section.groups.map(group => ({ ...group, tasks: group.tasks.map(({ correctAnswer, ...task }) => ({ ...task, ...(correctAnswer == null ? {} : { correctAnswer }) })) })) })) };
          const form = await client.updateAssessmentBankForm(scope, editor.form.versionId, blueprint); setEditor({ form: await checked(form), editing: true }); await reload();
        },
        onPublish: async (confirmation: { answersReviewed: true }) => {
          const validation = await client.validateAssessmentBankForm(scope, editor.form.versionId);
          if (validation.issues.length) { setEditor({ ...editor, form: { ...editor.form, issues: validation.issues } }); throw new Error(validation.issues.join(" · ")); }
          await client.publishAssessmentBankForm(scope, editor.form.versionId, confirmation); setEditor(undefined); await reload(); setNotice("Đã duyệt bộ đề. Mở cấu hình giao đề để chọn sử dụng.");
        }
      } : {})}
      {...(client.uploadContentMedia ? { uploadAudio: (file: Blob, name: string) => client.uploadContentMedia!("audio", file, name) } : {})}
      {...(client.synthesizeAssessmentEdgeTts ? { synthesizeEdgeTts: client.synthesizeAssessmentEdgeTts } : {})}
    />}
  </section>;
}

export function AssessmentDeliveryDialog({ bank, onClose, onSave }: { bank: AssessmentBankView; onClose(): void; onSave(policy: AssessmentBankPolicy): Promise<void> }) {
  const ref = useRef<HTMLElement>(null);
  const [mode, setMode] = useState(bank.policy.mode);
  const [count, setCount] = useState(bank.policy.mode === "mixed" ? bank.policy.sourceCount : 2);
  const [ids, setIds] = useState(bank.policy.versionIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const lock = useRef(false);
  const close = () => { if (!lock.current) onClose(); };
  useDialog(true, ref, close);
  const published = bank.forms.filter(form => form.status === "published");
  const needed = mode === "single" ? 1 : count;
  const valid = ids.length === needed && needed > 0 && (mode === "single" || needed >= 2) && ids.every(id => published.some(form => form.versionId === id));
  const apply = async () => {
    if (!valid || lock.current) return;
    lock.current = true; setBusy(true); setError(undefined);
    try { await onSave({ mode, sourceCount: needed, versionIds: ids }); }
    catch (reason) { setError(errorText(reason)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="modal-backdrop operator-modal-scope" onClick={event => { if (event.target === event.currentTarget) close(); }}><section ref={ref} className="dialog assessment-delivery-dialog" role="dialog" aria-modal="true" aria-label="Chọn cách giao đề" tabIndex={-1}>
    <div className="assessment-bank-header"><h2>Chọn cách giao đề</h2><ModalCloseButton onClick={close} disabled={busy} /></div>
    <p>{titles[bank.scope]} · Áp dụng cho lượt thi mới. Bài đang thi và kết quả cũ giữ nguyên.</p>
    <fieldset disabled={busy}><legend>Cách giao</legend>
      <label><input type="radio" name="delivery-mode" checked={mode === "single"} onChange={() => { setMode("single"); setIds([]); }} /> Dùng nguyên một bộ</label>
      <label><input type="radio" name="delivery-mode" checked={mode === "mixed"} onChange={() => { setMode("mixed"); setIds([]); }} /> Trộn các bộ</label>
    </fieldset>
    {mode === "mixed" && <><label>Số bộ muốn trộn<select aria-label="Số bộ muốn trộn" value={count} disabled={busy || published.length < 2} onChange={event => { setCount(Number(event.target.value)); setIds([]); }}>{Array.from({ length: Math.max(1, published.length - 1) }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n} bộ</option>)}</select></label><p className="small muted">Chọn đúng {count} bộ đã duyệt. Audio/bài đọc đi cùng câu hỏi. Chỉ xáo câu và lựa chọn ở vị trí phù hợp.</p></>}
    <fieldset disabled={busy}><legend>{mode === "mixed" ? `Chọn bộ tham gia (${ids.length}/${needed})` : "Chọn bộ đang sử dụng"}</legend>
      {bank.forms.filter(form => form.status !== "archived").map(form => <label className="assessment-bank-choice" key={form.versionId}><input type={mode === "mixed" ? "checkbox" : "radio"} name="delivery-source" disabled={form.status !== "published"} checked={ids.includes(form.versionId)} onChange={event => setIds(current => mode === "single" ? [form.versionId] : event.target.checked ? [...current, form.versionId] : current.filter(id => id !== form.versionId))} /> <span>{form.title} · v{form.version}{form.status !== "published" ? " · Chưa duyệt" : ""}{form.legacy ? " · Legacy" : ""}</span></label>)}
    </fieldset>
    {mode === "mixed" && published.length < 2 && <p role="alert">Cần ít nhất hai bộ đã duyệt để trộn.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="assessment-bank-actions assessment-bank-confirm"><button type="button" disabled={busy} onClick={close}>Huỷ</button><button type="button" className="btn-primary" disabled={busy || !valid} onClick={() => void apply()}>{busy ? "Đang áp dụng…" : "Xác nhận áp dụng"}</button></div>
  </section></div>;
}

export function PromotionBanks({ client, readOnly }: { client: AssessmentBankClient; readOnly: boolean }) {
  const [target, setTarget] = useState<AssessmentBankScope>("A2");
  return <><div className="tabs" role="tablist" aria-label="Mức đích">{(["A2", "B1", "B2", "C1"] as const).map(level => <button type="button" key={level} role="tab" aria-selected={target === level} onClick={() => setTarget(level)}>{level}</button>)}</div><AssessmentBank key={target} scope={target} client={client} readOnly={readOnly} /></>;
}
