import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Banner, Button, Empty, OperatorPage, PageTitle, StandaloneReadOnlyBanner } from "./primitives.js";
import type { LevelFormActionKey, OperatorLevelFormsActions, OperatorLevelFormsView } from "./types.js";
import type { AssessmentLevelFormDetailView, AssessmentLevelFormUpdateInput, CefrLevel } from "@e4s/contracts";
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
  const pageTitle = <PageTitle actions={!view.aiConnected ? <span className="badge warn">AI tạm chưa sẵn sàng</span> : undefined}><h1>Đề thi lên mức</h1><p className="muted">Mỗi mức đích có một khung soạn đề riêng. Nội dung sinh và nội dung soạn tay đều phải theo bốn kỹ năng của bài đầu vào, với độ khó ở mức đích; chỉ bản nháp mới sửa được trước khi phát hành.</p></PageTitle>;

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
      return <div className={embedded ? "operator-level-group operator-level-group--embedded" : "card operator-level-group"} key={group.target}><div className="row between operator-card-header operator-level-group-header"><div><span className="operator-level-kicker">Mức đích</span><h3>{group.target}</h3></div>{hasForm ? <Badge tone={approved ? "ok" : "warn"}>{approved ? "Đã duyệt" : "Đang chỉnh sửa"}</Badge> : <div className="row operator-level-form-actions"><Badge tone="warn">Chưa có đề</Badge><Button small disabled={Boolean(readOnlyReason) || generating || mutationBusy || !actions.onCreateManual} title={readOnlyReason} onClick={() => actions.onCreateManual?.(group.target)}>Soạn tay</Button><Button small primary busy={groupGenerating} disabled={Boolean(generateBlocked) || generating || mutationBusy} title={generateBlocked || (generating ? "Đang sinh đề" : undefined)} onClick={() => actions.onGenerate(group.target)}>{groupGenerating ? "Đang sinh…" : "Sinh đề bằng AI"}</Button></div>}</div>
        {group.forms.length ? <div className="list" style={{ marginTop: 8 }}>{group.forms.map(form => {
          const isApproved = form.status === "approved";
          const publishBusy = view.publishingId === form.id;
          const deleteBusy = view.deletingId === form.id;
          const deleteReason = blocked("delete") || readOnlyReason || (isApproved ? "Chỉ xoá được bản nháp" : undefined) || (form.attempts ? "Đề này đã có bài thi nên không xoá được" : undefined);
          const actionBusy = mutationBusy || generating || publishBusy || deleteBusy;
          const publicationBlocked = form.publicationReady === false;
          return <div className={`item operator-level-form-item${embedded ? " operator-assessment-form-row" : ""}`} key={form.id}><div className="body"><div className="title">{form.title} <Badge tone={isApproved ? "ok" : ""}>{isApproved ? "Đã duyệt" : "Bản nháp"}</Badge>{form.short && <Badge tone="warn">ngắn</Badge>}{form.inUse && <Badge tone="primary">đang dùng</Badge>}</div><div className="xs muted">{form.createdAt} · {form.byName || "—"} · {form.listeningQuestions} câu nghe · {form.readingQuestions} câu đọc · {form.attempts} lượt thi</div>{publicationBlocked ? <div id={`level-form-publication-${form.id}`} className="xs muted">Chờ hoàn thiện {form.publicationBlockerCount ?? "các"} mục trước khi phát hành.</div> : null}</div><div className="row operator-level-form-actions"><Button small disabled={Boolean(blocked("view"))} onClick={() => actions.onView(form.id)}>Xem</Button><Button small disabled={!actions.onEdit || Boolean(readOnlyReason) || actionBusy || Boolean(blocked("edit"))} onClick={() => actions.onEdit?.(form.id, isApproved)}>{isApproved ? "Chỉnh sửa" : "Sửa"}</Button>{!isApproved && <Button small primary busy={publishBusy} disabled={Boolean(readOnlyReason) || actionBusy || Boolean(blocked("approve")) || publicationBlocked} aria-describedby={publicationBlocked ? `level-form-publication-${form.id}` : undefined} onClick={() => actions.onApprove(form.id)}>{publishBusy ? "Đang phát hành…" : "Duyệt & phát hành"}</Button>}<Button small danger busy={deleteBusy} disabled={Boolean(deleteReason) || actionBusy} title={deleteReason} onClick={() => actions.onDelete(form.id)}>{deleteBusy ? "Đang xoá…" : "Xoá"}</Button></div></div>;
        })}</div> : <p className="small muted operator-level-empty">Chưa có bản nháp. Soạn tay hoặc sinh bằng AI để tạo đề theo cấu trúc 4 kỹ năng, 75 phút, 100 điểm; chỉ bản nháp hoàn chỉnh mới phát hành được.</p>}
      </div>;
    })}
  </>;
  const formCount = view.targets.reduce((total, group) => total + group.forms.length, 0);
  // Embedded in "Kết quả bài thi": same saved-versions card as the other exam tabs.
  return embedded
    ? <section className="card operator-assessment-form-list operator-level-forms-embedded" aria-label="Phiên bản đề lên mức"><div className="row between"><div><p className="xs muted">PHIÊN BẢN ĐỀ ĐÃ LƯU</p><h2>Đề lên mức</h2></div><span className="badge">{formCount} phiên bản</span></div><div className="stack">{content}</div></section>
    : <OperatorPage title="Đề thi lên mức">{content}</OperatorPage>;
}

/** The fields the shared assessment editor needs; level-up details and monthly finals both provide them. */
export type LevelFormEditorDetail = Pick<AssessmentLevelFormDetailView, "title" | "status" | "sections" | "warnings" | "versions" | "deleteReason"> & { targetLevel?: CefrLevel };

type LevelFormDetailProps = {
  detail: LevelFormEditorDetail | AssessmentLevelFormDetailView;
  readOnly?: boolean;
  editing?: boolean;
  onClose(): void;
  onSave?(input: AssessmentLevelFormUpdateInput): void | Promise<void>;
  uploadAudio?(file: Blob, filename: string): Promise<{ url: string }>;
  synthesizeEdgeTts?(input: { text: string; voice: string }): Promise<{ filename: string; mimeType: string; base64: string }>;
  /** Overrides "Đề lên mức {level}" for other assessment kinds (e.g. the monthly final). */
  kicker?: string;
  dialogLabel?: string;
  /** Kind-specific review panels rendered above the four sections. */
  children?: ReactNode;
  /** Notified with every local edit so a wrapper can track unsaved changes. */
  onDraftChange?(draft: AssessmentLevelFormUpdateInput): void;
  /** Synthesise only the spoken text, not the "Speaker:" labels. */
  speakTextOnly?: boolean;
  /** The caller renders its own publication checklist (e.g. monthly final). */
  hideValidation?: boolean;
};

/** "Speaker: text" lines back into script lines, so editing never doubles the speaker label. */
export function parseScriptLines(value: string): Array<{ speaker: string; text: string }> {
  const lines: Array<{ speaker: string; text: string }> = [];
  for (const raw of value.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const labelled = line.match(/^([^:]{1,40}):\s+(.*)$/u);
    const previous = lines[lines.length - 1];
    if (labelled) lines.push({ speaker: labelled[1]!.trim(), text: labelled[2]!.trim() });
    else if (previous) lines[lines.length - 1] = { ...previous, text: `${previous.text} ${line}` };
    else lines.push({ speaker: "Narrator", text: line });
  }
  return lines.length ? lines : [{ speaker: "Narrator", text: "" }];
}

export function OperatorLevelFormDetail({ detail, readOnly = false, editing = false, onClose, onSave, uploadAudio, synthesizeEdgeTts, kicker, dialogLabel, children, onDraftChange, speakTextOnly = false, hideValidation = false }: LevelFormDetailProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const draftChangeRef = useRef(onDraftChange);
  const [draft, setDraft] = useState<AssessmentLevelFormUpdateInput>(() => ({ title: detail.title, sections: structuredClone(detail.sections) }));
  const [saving, setSaving] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  closeRef.current = onClose;
  draftChangeRef.current = onDraftChange;
  useEffect(() => setDraft({ title: detail.title, sections: structuredClone(detail.sections) }), [detail]);
  useEffect(() => { draftChangeRef.current?.(draft); }, [draft]);

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
  const updateGroupStimulusText = (sectionIndex: number, groupIndex: number, type: "audio_script" | "passage", text: string) => setDraft((current) => ({
    ...current,
    sections: current.sections.map((section, nextSectionIndex) => nextSectionIndex !== sectionIndex ? section : ({
      ...section,
      groups: section.groups.map((group, nextGroupIndex) => nextGroupIndex !== groupIndex ? group : ({
        ...group,
        stimulus: type === "audio_script"
          ? {
              type,
              lines: parseScriptLines(text),
              ...(group.stimulus?.type === "audio_script" && group.stimulus.audioSrc ? { audioSrc: group.stimulus.audioSrc } : {})
            }
          : { type, text }
      }))
    }))
  }));
  const uploadGroupAudio = async (sectionIndex: number, groupIndex: number, groupKey: string, file?: File) => {
    if (!file || !uploadAudio) return;
    setUploadingAudio(groupKey); setAudioError(null);
    try { const uploaded = await uploadAudio(file, file.name); updateGroupAudio(sectionIndex, groupIndex, uploaded.url); }
    catch { setAudioError("Không tải và lưu được file audio."); }
    finally { setUploadingAudio(null); }
  };
  const generateGroupEdgeTts = async (sectionIndex: number, groupIndex: number, groupKey: string, script: string) => {
    if (!synthesizeEdgeTts || !uploadAudio || !script.trim()) { setAudioError("Cần có kịch bản nghe và cấu hình Edge TTS để tạo audio."); return; }
    setUploadingAudio(groupKey); setAudioError(null);
    try {
      const generated = await synthesizeEdgeTts({ text: script, voice: "en-US-AvaMultilingualNeural" });
      const bytes = Uint8Array.from(atob(generated.base64), (character) => character.charCodeAt(0));
      const uploaded = await uploadAudio(new Blob([bytes], { type: generated.mimeType }), generated.filename);
      updateGroupAudio(sectionIndex, groupIndex, uploaded.url);
    } catch { setAudioError("Không tạo hoặc lưu được audio Edge TTS trên máy chủ."); }
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

  const renderSection = (section: AssessmentLevelFormUpdateInput["sections"][number], sectionIndex: number) => <details className="item operator-level-section" key={section.code}>
    <summary><span><b>{section.title}</b><small>{section.groups.reduce((count, group) => count + group.tasks.length, 0)} câu · {section.durationMinutes} phút · {section.maxScore} điểm</small></span></summary>
    <p className="small operator-level-instructions">{section.instructions.join(" · ")}</p>
    {section.groups.map((group, groupIndex) => {
      const audioSrc = group.stimulus?.type === "audio_script" ? group.stimulus.audioSrc?.trim() : undefined;
      const script = group.stimulus?.type === "audio_script" ? (group.stimulus.lines ?? []).map((line) => `${line.speaker}: ${line.text}`).join("\n") : "";
      const spokenScript = speakTextOnly && group.stimulus?.type === "audio_script" ? (group.stimulus.lines ?? []).map((line) => line.text).join("\n") : script;
      const passage= group.stimulus?.type === "passage" ? group.stimulus.text : "";
      const audioBusy = uploadingAudio === group.key;
      return <section className="card flat operator-level-question-group" key={group.key}>
        <header><b>{group.title}</b><p className="xs muted">{group.instruction}</p></header>
        {editing && !readOnly && section.code === "listening" ? <label className="operator-level-stimulus-editor"><span>Kịch bản nghe</span><textarea aria-label={`Kịch bản nghe ${group.title}`} value={script} onChange={(event) => updateGroupStimulusText(sectionIndex, groupIndex, "audio_script", event.target.value)} /></label> : null}
        {editing && !readOnly && section.code === "reading" ? <label className="operator-level-stimulus-editor"><span>Đoạn đọc</span><textarea aria-label={`Đoạn đọc ${group.title}`} value={passage} onChange={(event) => updateGroupStimulusText(sectionIndex, groupIndex, "passage", event.target.value)} /></label> : null}
        {section.code === "listening" ? <div className={`operator-level-audio ${audioSrc ? "has-audio" : "missing-audio"}`}>
          <div><b>{audioSrc ? "Audio phần nghe" : "Chưa có audio nghe"}</b><span className="xs muted">{audioSrc ? "Học viên sẽ nghe đúng tệp này trong bài thi." : "Chọn một nguồn audio và lưu bản nháp trước khi duyệt đề."}</span></div>
          {audioSrc ? <audio controls preload="metadata" src={audioSrc}>Trình duyệt không hỗ trợ audio.</audio> : null}
          {editing && !readOnly ? <div className="operator-level-audio-actions">
            <button type="button" className="btn-sm" disabled={audioBusy || !synthesizeEdgeTts || !uploadAudio || !script.trim()} title={!synthesizeEdgeTts ? "Edge TTS chưa được cấu hình trên máy chủ." : !script.trim() ? "Cần có kịch bản nghe trước khi tạo audio." : undefined} onClick={() => void generateGroupEdgeTts(sectionIndex, groupIndex, group.key, spokenScript)}>{audioBusy ? "Đang tạo…" : "Sinh audio Edge TTS"}</button>
            {uploadAudio ? <label className="btn-sm" aria-busy={audioBusy || undefined}>{audioBusy ? "Đang tải…" : audioSrc ? "Thay file audio" : "Tải file audio"}<input hidden type="file" accept="audio/*" aria-label={`${audioSrc ? "Thay" : "Tải"} audio cho ${group.title}`} disabled={audioBusy} onChange={(event) => void uploadGroupAudio(sectionIndex, groupIndex, group.key, event.target.files?.[0])} /></label> : null}
            <span className="operator-level-audio-unavailable" role="status" title="Chưa có AI/provider audio được cấu hình cho hệ thống này.">AI/provider audio chưa khả dụng</span>
          </div> : null}
          {audioError ? <p className="small form-error" role="alert">{audioError}</p> : null}
        </div> : null}
        <div className="operator-level-question-list" role="list" aria-label={`Câu hỏi phần ${section.title}`}>{group.tasks.map((task, taskIndex) => <article className="operator-level-question" role="listitem" key={task.key}>
          <div className="operator-level-question-number">Câu {taskIndex + 1}<span>{task.key}</span></div>
          <div className="operator-level-question-content">{task.title ? <b>{task.title}</b> : null}{editing && !readOnly ? <textarea aria-label={`Nội dung ${task.key}`} value={task.prompt} onChange={(event) => updatePrompt(sectionIndex, groupIndex, taskIndex, event.target.value)} /> : <p>{task.prompt}</p>}{task.options?.length ? editing && !readOnly ? <div className="operator-level-option-editor">{task.options.map((option, optionIndex) => <label key={option.value}><span>{option.value}</span><input aria-label={`Lựa chọn ${option.value} của ${task.key}`} value={option.label} onChange={(event) => updateTask(sectionIndex, groupIndex, taskIndex, { options: task.options?.map((item, nextOptionIndex) => nextOptionIndex === optionIndex ? { ...item, label: event.target.value } : item) })} /></label>)}<label className="operator-level-answer-editor"><span>Đáp án đúng</span><select aria-label={`Đáp án đúng của ${task.key}`} value={task.correctAnswer ?? ""} onChange={(event) => updateTask(sectionIndex, groupIndex, taskIndex, { correctAnswer: event.target.value })}><option value="" disabled>Chọn đáp án</option>{task.options.map(option => <option value={option.value} key={option.value}>{option.value}</option>)}</select></label></div> : <ol className="operator-level-options" type="A">{task.options.map(option => <li key={option.value}>{option.label}</li>)}</ol> : null}</div>
          {!editing && task.correctAnswer ? <Badge tone="ok">Đáp án {task.correctAnswer}</Badge> : null}
        </article>)}</div>
      </section>;
    })}
  </details>;

  return <div className="modal-backdrop operator-modal-scope operator-detail-modal" role="presentation"><section ref={dialogRef} className="dialog wide operator-detail-dialog operator-assessment-preview-dialog operator-level-editor-dialog" role="dialog" aria-modal="true" aria-label={dialogLabel ?? `Chi tiết ${detail.title}`} tabIndex={-1}>
    <div className="operator-level-form-dialog-header"><div className="operator-level-form-dialog-title"><span className="operator-level-kicker">{kicker ?? `Đề lên mức ${detail.targetLevel ?? ""}`}</span><h3>{detail.title}</h3><p className="small muted">{detail.status === "published" ? "Đã phát hành" : detail.status === "retired" ? "Đã lưu lịch sử" : "Bản nháp"}</p></div><div className="row operator-level-form-dialog-actions">{editing && !readOnly ? <button className="btn-sm btn-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? "Đang lưu…" : "Lưu bản nháp"}</button> : null}<button className="btn-sm" type="button" onClick={onClose}>Đóng</button></div></div>
    {detail.deleteReason && <div className="banner warn"><div className="body small">Không thể xoá: {detail.deleteReason}</div></div>}
    {hideValidation ? null : detail.warnings.length ? <section className="operator-level-validation" aria-label="Cảnh báo kiểm tra đề"><header><b>Cần hoàn thiện trước khi phát hành</b><span className="badge warn">{detail.warnings.length} mục</span></header><ul className="small">{detail.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}><Badge tone={warning.severity === "error" ? "danger" : "warn"}>{warning.code === "missing_answer_key" ? "Đáp án" : warning.code === "missing_task_prompt" ? "Đề bài" : warning.code === "missing_audio" ? "Audio" : "Cấu trúc"}</Badge> {warning.message}</li>)}</ul></section> : <div className="banner ok"><div className="body small">Đề đủ cấu trúc hiện tại, chưa có cảnh báo.</div></div>}
    {children}
    <h4>Chi tiết 4 phần</h4>
    <div className="list operator-level-section-list">{draft.sections.map(renderSection)}</div>
    <h4>Lịch sử phiên bản</h4>
    {detail.versions.length ? <div className="table-wrap"><table><thead><tr><th>Phiên bản</th><th>Trạng thái</th><th>Số lượt thi</th><th>Phát hành</th></tr></thead><tbody>{detail.versions.map(version => <tr key={version.versionId}><td>v{version.version}</td><td>{version.status}</td><td>{version.attemptCount}</td><td>{operatorDateTime(version.publishedAt)}</td></tr>)}</tbody></table></div> : <p className="small muted">Chưa có phiên bản khác.</p>}
  </section></div>;
}


