import { useEffect, useRef, useState } from "react";
import { Badge, Banner, Button, Empty, OperatorPage, PageTitle, StandaloneReadOnlyBanner } from "./primitives.js";
import type { LevelFormActionKey, OperatorLevelFormsActions, OperatorLevelFormsView } from "./types.js";
import type { AssessmentLevelFormDetailView, AssessmentLevelFormUpdateInput } from "@e4s/contracts";
import { operatorDateTime } from "./adapters.js";

type LevelFormsUiView = OperatorLevelFormsView & {
  loading?: boolean;
  loadState?: "idle" | "loading" | "success" | "error";
  mutationState?: "idle" | "loading";
  mutationMessage?: string | null;
  publishingId?: string | null;
  deletingId?: string | null;
};

type OperatorLevelFormsProps = {
  view: LevelFormsUiView;
  actions: OperatorLevelFormsActions;
  readOnly?: boolean;
  unavailable?: Partial<Record<LevelFormActionKey, string>>;
  embedded?: boolean;
};

export function OperatorLevelForms({ view, actions, readOnly = false, unavailable = {}, embedded = false }: OperatorLevelFormsProps) {
  const blocked = (key: LevelFormActionKey) => unavailable[key];
  const generating = Boolean(view.generatingTarget) || view.generateState === "loading";
  const mutationBusy = view.mutationState === "loading";
  const loading = view.loading || view.loadState === "loading";
  const readOnlyReason = readOnly ? "Quản lý đang xem ở chế độ chỉ đọc" : undefined;
  const pageTitle = <PageTitle actions={!view.aiConnected ? <span className="badge warn">AI tạm chưa sẵn sàng</span> : undefined}><h1>Đề thi lên mức</h1><p className="muted">Mỗi mức đích cần một đề ngắn được duyệt: 1 đoạn nghe (5 câu × 5đ), 1 bài đọc (5 câu × 5đ), viết 80–120 từ, 1 task nói – tất cả ở mức đích. Học viên đủ tín hiệu thi đề của mức kế tiếp, thời gian mỗi phần bằng nửa bài đầu vào.</p></PageTitle>;

  const content = <>{!embedded && pageTitle}
    <StandaloneReadOnlyBanner readOnly={readOnly} />
    {!view.aiConnected && <Banner tone="warn"><span className="small"><b>AI hệ thống tạm chưa sẵn sàng.</b> Chưa thể sinh đề mới; các đề đã có vẫn có thể xem. Nếu trạng thái kéo dài, hãy báo quản trị hệ thống.</span></Banner>}
    {view.generateError && <div className="banner warn" role="alert"><div className="body small">{view.generateError}</div></div>}
    {view.mutationMessage && <div className="small muted" aria-live="polite">{mutationBusy && <span className="spinner" aria-hidden="true" />} {view.mutationMessage}</div>}
    {loading ? <div className="card" role="status" aria-label="Đang tải đề thi lên mức"><div className="row"><span className="spinner" aria-hidden="true" /><p>Đang tải đề thi lên mức…</p></div></div> : !view.targets.length ? <div role="status" aria-label="Chưa có mức đích"><Empty><p className="small muted">Chưa có mức đích để hiển thị.</p></Empty></div> : view.targets.map(group => {
      const approved = group.forms.some(form => form.status === "approved");
      const hasForm = group.forms.length > 0;
      const generateBlocked = blocked("generate") || readOnlyReason || (!view.aiConnected ? "AI hệ thống tạm chưa sẵn sàng" : undefined);
      const groupGenerating = view.generatingTarget === group.target || (view.generateState === "loading" && !view.generatingTarget);
      return <div className="card operator-level-group" key={group.target}><div className="row between operator-card-header operator-level-group-header"><div><span className="operator-level-kicker">Mức đích</span><h3>{group.target}</h3></div>{hasForm ? <Badge tone={approved ? "ok" : "warn"}>{approved ? "Đã duyệt" : "Đang chỉnh sửa"}</Badge> : <><Badge tone="warn">Chưa có đề</Badge><Button small primary busy={groupGenerating} disabled={Boolean(generateBlocked) || generating || mutationBusy} title={generateBlocked || (generating ? "Đang sinh đề" : undefined)} onClick={() => actions.onGenerate(group.target)}>{groupGenerating ? "Đang sinh…" : "Sinh đề bằng AI"}</Button></>}</div>
        {group.forms.length ? <div className="list" style={{ marginTop: 8 }}>{group.forms.map(form => {
          const isApproved = form.status === "approved";
          const publishBusy = view.publishingId === form.id;
          const deleteBusy = view.deletingId === form.id;
          const deleteReason = blocked("delete") || readOnlyReason || (isApproved ? "Chỉ xoá được bản nháp" : undefined) || (form.attempts ? "Đề này đã có bài thi nên không xoá được" : undefined);
          const actionBusy = mutationBusy || generating || publishBusy || deleteBusy;
          return <div className="item operator-level-form-item" key={form.id}><div className="body"><div className="title">{form.title} <Badge tone={isApproved ? "ok" : ""}>{isApproved ? "Đã duyệt" : "Bản nháp"}</Badge>{form.short && <Badge tone="warn">ngắn</Badge>}{form.inUse && <Badge tone="primary">đang dùng</Badge>}</div><div className="xs muted">{form.createdAt} · {form.byName || "—"} · {form.listeningQuestions} câu nghe · {form.readingQuestions} câu đọc · {form.attempts} lượt thi</div></div><div className="row operator-level-form-actions"><Button small disabled={Boolean(blocked("view"))} onClick={() => actions.onView(form.id)}>Xem</Button><Button small disabled={!actions.onEdit || Boolean(readOnlyReason) || actionBusy || Boolean(blocked("edit"))} onClick={() => actions.onEdit?.(form.id, isApproved)}>{isApproved ? "Chỉnh sửa" : "Sửa"}</Button>{!isApproved && <Button small primary busy={publishBusy} disabled={Boolean(readOnlyReason) || actionBusy || Boolean(blocked("approve"))} onClick={() => actions.onApprove(form.id)}>{publishBusy ? "Đang phát hành…" : "Duyệt & phát hành"}</Button>}<Button small danger busy={deleteBusy} disabled={Boolean(deleteReason) || actionBusy} title={deleteReason} onClick={() => actions.onDelete(form.id)}>{deleteBusy ? "Đang xoá…" : "Xoá"}</Button></div></div>;
        })}</div> : <p className="small muted operator-level-empty">Chưa có đề.</p>}
      </div>;
    })}
  </>;
  return embedded ? content : <OperatorPage title="Đề thi lên mức">{content}</OperatorPage>;
}

export function OperatorLevelFormDetail({ detail, readOnly = false, editing = false, onClose, onSave, uploadAudio }: { detail: AssessmentLevelFormDetailView; readOnly?: boolean; editing?: boolean; onClose(): void; onSave?(input: AssessmentLevelFormUpdateInput): void | Promise<void>; uploadAudio?(file: Blob, filename: string): Promise<{ url: string }> }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const [draft, setDraft] = useState<AssessmentLevelFormUpdateInput>(() => ({ title: detail.title, sections: structuredClone(detail.sections) }));
  const [saving, setSaving] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState<string | null>(null);
  closeRef.current = onClose;
  useEffect(() => setDraft({ title: detail.title, sections: structuredClone(detail.sections) }), [detail]);

  const updatePrompt = (sectionIndex: number, groupIndex: number, taskIndex: number, prompt: string) => setDraft((current) => ({
    ...current,
    sections: current.sections.map((section, nextSectionIndex) => nextSectionIndex !== sectionIndex ? section : ({
      ...section,
      groups: section.groups.map((group, nextGroupIndex) => nextGroupIndex !== groupIndex ? group : ({
        ...group,
        tasks: group.tasks.map((task, nextTaskIndex) => nextTaskIndex === taskIndex ? { ...task, prompt } : task)
      }))
    }))
  }));
  const updateTask = (sectionIndex: number, groupIndex: number, taskIndex: number, update: Record<string, unknown>) => setDraft((current) => ({
    ...current,
    sections: current.sections.map((section, nextSectionIndex) => nextSectionIndex !== sectionIndex ? section : ({
      ...section,
      groups: section.groups.map((group, nextGroupIndex) => nextGroupIndex !== groupIndex ? group : ({
        ...group,
        tasks: group.tasks.map((task, nextTaskIndex) => nextTaskIndex === taskIndex ? { ...task, ...update } : task)
      }))
    }))
  }));
  const updateGroupAudio = (sectionIndex: number, groupIndex: number, audioSrc: string) => setDraft((current) => ({
    ...current,
    sections: current.sections.map((section, nextSectionIndex) => nextSectionIndex !== sectionIndex ? section : ({
      ...section,
      groups: section.groups.map((group, nextGroupIndex) => nextGroupIndex !== groupIndex ? group : ({
        ...group,
        stimulus: group.stimulus?.type === "audio_script"
          ? { ...group.stimulus, audioSrc }
          : { type: "audio_script", audioSrc, lines: [{ speaker: "Narrator", text: group.instruction }] }
      }))
    }))
  }));
  const uploadGroupAudio = async (sectionIndex: number, groupIndex: number, groupKey: string, file?: File) => {
    if (!file || !uploadAudio) return;
    setUploadingAudio(groupKey);
    try { const uploaded = await uploadAudio(file, file.name); updateGroupAudio(sectionIndex, groupIndex, uploaded.url); }
    finally { setUploadingAudio(null); }
  };
  const save = async () => {
    if (!onSave || readOnly || !editing || saving) return;
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), [href], summary, [tabindex]:not([tabindex='-1'])")).filter(element => !element.hidden);
    (focusable()[0] ?? dialog).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return <div className="modal-backdrop operator-modal-scope operator-detail-modal" role="presentation"><section ref={dialogRef} className="dialog wide operator-detail-dialog" role="dialog" aria-modal="true" aria-label={`Chi tiết ${detail.title}`} tabIndex={-1}>
    <div className="operator-level-form-dialog-header"><div className="operator-level-form-dialog-title"><span className="operator-level-kicker">Đề lên mức {detail.targetLevel}</span><h3>{detail.title}</h3><p className="small muted">{detail.status === "published" ? "Đã phát hành" : detail.status === "retired" ? "Đã lưu lịch sử" : "Bản nháp"}</p></div><div className="row operator-level-form-dialog-actions">{editing && !readOnly ? <button className="btn-sm btn-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? "Đang lưu…" : "Lưu bản nháp"}</button> : null}<button className="btn-sm" type="button" onClick={onClose}>Đóng</button></div></div>
    {detail.deleteReason && <div className="banner warn"><div className="body small">Không thể xoá: {detail.deleteReason}</div></div>}
    {detail.warnings.length ? <div className="card soft"><b>Cảnh báo kiểm tra đề</b><ul className="small">{detail.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}><Badge tone={warning.severity === "error" ? "danger" : "warn"}>{warning.code}</Badge> {warning.message}</li>)}</ul></div> : <div className="banner ok"><div className="body small">Đề đủ cấu trúc hiện tại, chưa có cảnh báo.</div></div>}
    <h4>Chi tiết 4 phần</h4>
    <div className="list operator-level-section-list">{draft.sections.map((section, sectionIndex) => <details className="item operator-level-section" key={section.code} open={sectionIndex === 0}><summary><span><b>{section.title}</b><small>{section.groups.reduce((count, group) => count + group.tasks.length, 0)} câu · {section.durationMinutes} phút · {section.maxScore} điểm</small></span></summary><p className="small operator-level-instructions">{section.instructions.join(" · ")}</p>{section.groups.map((group, groupIndex) => { const audioSrc = group.stimulus?.type === "audio_script" ? group.stimulus.audioSrc?.trim() : undefined; return <section className="card flat operator-level-question-group" key={group.key}><header><b>{group.title}</b><p className="xs muted">{group.instruction}</p></header>{section.code === "listening" ? <div className={`operator-level-audio ${audioSrc ? "has-audio" : "missing-audio"}`}><div><b>{audioSrc ? "Audio phần nghe" : "Chưa có audio nghe"}</b><span className="xs muted">{audioSrc ? "Học viên sẽ nghe tệp này trong bài thi." : "Cần thêm tệp audio trước khi duyệt đề."}</span></div>{audioSrc ? <audio controls preload="metadata" src={audioSrc}>Trình duyệt không hỗ trợ audio.</audio> : null}{editing && !readOnly && uploadAudio ? <label className="btn-sm" aria-busy={uploadingAudio === group.key || undefined}>{uploadingAudio === group.key ? "Đang tải…" : audioSrc ? "Thay audio" : "Thêm audio"}<input hidden type="file" accept="audio/*" aria-label={`${audioSrc ? "Thay" : "Thêm"} audio cho ${group.title}`} disabled={uploadingAudio === group.key} onChange={(event) => void uploadGroupAudio(sectionIndex, groupIndex, group.key, event.target.files?.[0])} /></label> : null}</div> : null}<div className="operator-level-question-list" role="list" aria-label={`Câu hỏi phần ${section.title}`}>{group.tasks.map((task, taskIndex) => <article className="operator-level-question" role="listitem" key={task.key}><div className="operator-level-question-number">Câu {taskIndex + 1}<span>{task.key}</span></div><div className="operator-level-question-content">{task.title ? <b>{task.title}</b> : null}{editing && !readOnly ? <textarea aria-label={`Nội dung ${task.key}`} value={task.prompt} onChange={(event) => updatePrompt(sectionIndex, groupIndex, taskIndex, event.target.value)} /> : <p>{task.prompt}</p>}{task.options?.length ? editing && !readOnly ? <div className="operator-level-option-editor">{task.options.map((option, optionIndex) => <label key={option.value}><span>{option.value}</span><input aria-label={`Lựa chọn ${option.value} của ${task.key}`} value={option.label} onChange={(event) => updateTask(sectionIndex, groupIndex, taskIndex, { options: task.options?.map((item, nextOptionIndex) => nextOptionIndex === optionIndex ? { ...item, label: event.target.value } : item) })} /></label>)}<label className="operator-level-answer-editor"><span>Đáp án đúng</span><select aria-label={`Đáp án đúng của ${task.key}`} value={task.correctAnswer ?? ""} onChange={(event) => updateTask(sectionIndex, groupIndex, taskIndex, { correctAnswer: event.target.value })}><option value="" disabled>Chọn đáp án</option>{task.options.map(option => <option value={option.value} key={option.value}>{option.value}</option>)}</select></label></div> : <ol className="operator-level-options" type="A">{task.options.map(option => <li key={option.value}>{option.label}</li>)}</ol> : null}</div>{!editing && task.correctAnswer ? <Badge tone="ok">Đáp án {task.correctAnswer}</Badge> : null}</article>)}</div></section>; })}</details>)}</div>
    <h4>Lịch sử phiên bản</h4>
    {detail.versions.length ? <div className="table-wrap"><table><thead><tr><th>Phiên bản</th><th>Trạng thái</th><th>Số lượt thi</th><th>Phát hành</th></tr></thead><tbody>{detail.versions.map(version => <tr key={version.versionId}><td>v{version.version}</td><td>{version.status}</td><td>{version.attemptCount}</td><td>{operatorDateTime(version.publishedAt)}</td></tr>)}</tbody></table></div> : <p className="small muted">Chưa có phiên bản khác.</p>}
  </section></div>;
}
