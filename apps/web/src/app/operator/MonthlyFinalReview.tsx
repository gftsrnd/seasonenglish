import { useEffect, useMemo, useState } from "react";
import type {
  AssessmentLevelFormUpdateInput, MonthlyFinalCheckView, MonthlyFinalDraftView, MonthlyFinalExamStatus,
  MonthlyFinalGenCode, MonthlyFinalUpdateInput
} from "@e4s/contracts";
import { OperatorLevelFormDetail, type LevelFormEditorDetail } from "./LevelForms.js";

const STATUS_COPY: Record<MonthlyFinalExamStatus, { label: string; tone: string; description: string }> = {
  INPUT_ERROR: { label: "INPUT_ERROR", tone: "danger", description: "Khung tháng thiếu đầu vào bắt buộc." },
  DRAFT: { label: "DRAFT", tone: "warn", description: "Còn quy tắc kiểm tra tự động chưa đạt. Sửa nội dung hoặc sinh lại." },
  NEEDS_REVIEW: { label: "NEEDS_REVIEW", tone: "warn", description: "Kiểm tra tự động đã đạt. Còn mục cần người rà soát hoặc audio chưa nghe soát." },
  READY: { label: "READY", tone: "ok", description: "Mọi điều kiện phát hành đã đạt. Có thể duyệt và phát hành." }
};
const CHECK_STATUS: Record<MonthlyFinalCheckView["status"], { label: string; tone: string }> = {
  pass: { label: "Đạt", tone: "ok" },
  fail: { label: "Không đạt", tone: "danger" },
  needs_review: { label: "Cần rà soát", tone: "warn" }
};
const SKILL_LABEL = { listening: "Nghe", reading: "Đọc", writing: "Viết (W2)", speaking: "Nói (S3)" } as const;

type GrammarChoice = { code: "GA" | "GB"; mainStepId: string; secondaryStepId: string; mainPatterns: string; secondaryPatterns: string };

export interface MonthlyFinalReviewProps {
  draft: MonthlyFinalDraftView;
  readOnly?: boolean;
  onClose(): void;
  onSave?(input: MonthlyFinalUpdateInput): Promise<unknown>;
  onPublish?(): Promise<unknown>;
  synthesize?(input: { text: string; voice: string }): Promise<{ filename: string; mimeType: string; base64: string }>;
  uploadAudio?(file: Blob, filename: string): Promise<{ url: string }>;
}

/**
 * Monthly final v2.0 review screen. It reuses the level-up form editor for the
 * four sections and adds the v2.0 review evidence: status, GEN01–GEN23 report,
 * the N-row mapping, GA/GB main/secondary components, pronunciation positions,
 * grader samples and the "đã nghe soát" audio tick that publishing requires.
 */
export function MonthlyFinalReview({ draft, readOnly = false, onClose, onSave, onPublish, synthesize, uploadAudio }: MonthlyFinalReviewProps) {
  const exam = draft.exam;
  const editable = draft.editable && !readOnly && Boolean(exam);
  const savedSections = useMemo(() => JSON.stringify(draft.blueprint.sections), [draft]);
  const [current, setCurrent] = useState<AssessmentLevelFormUpdateInput>(() => ({ title: draft.blueprint.title, sections: draft.blueprint.sections }));
  const [grammar, setGrammar] = useState<GrammarChoice[]>([]);
  const [evidence, setEvidence] = useState<Array<{ groupKey: string; gaSentence: string; gbSentence: string }>>([]);
  const [items, setItems] = useState<Record<string, { explanation: string; evidence?: string }>>({});
  const [audioReviewed, setAudioReviewed] = useState(false);
  const [confirmations, setConfirmations] = useState<Set<MonthlyFinalGenCode>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent({ title: draft.blueprint.title, sections: draft.blueprint.sections });
    setGrammar(exam?.grammar.map((target) => ({ code: target.code, mainStepId: target.main.stepId, secondaryStepId: target.secondary.stepId, mainPatterns: target.main.acceptedPatterns.join("\n"), secondaryPatterns: target.secondary.acceptedPatterns.join("\n") })) ?? []);
    setEvidence(exam?.grader.listening.map((item) => ({ ...item })) ?? []);
    setItems(structuredClone(exam?.grader.items ?? {}));
    setAudioReviewed(exam?.audio.status === "REVIEWED");
    setConfirmations(new Set(exam?.manualConfirmations ?? []));
    setError(null);
  }, [draft, exam]);

  const contentDirty = JSON.stringify(current.sections) !== savedSections || current.title !== draft.blueprint.title;
  const listeningGroups = draft.blueprint.sections.find((section) => section.code === "listening")?.groups ?? [];
  const savedAudioReady = listeningGroups.length > 0 && listeningGroups.every((group) => group.stimulus?.type === "audio_script" && Boolean(group.stimulus.audioSrc?.trim()));
  const answerKey = useMemo(() => new Map(current.sections.flatMap((section) => section.groups.flatMap((group) => group.tasks.map((task) => [task.key, task.correctAnswer ?? ""] as const)))), [current]);
  const reviewDirty = Boolean(exam) && (
    audioReviewed !== (exam!.audio.status === "REVIEWED")
    || JSON.stringify([...confirmations].sort()) !== JSON.stringify([...exam!.manualConfirmations].sort())
    || JSON.stringify(grammar.map(({ code, mainStepId, secondaryStepId, mainPatterns, secondaryPatterns }) => [code, mainStepId, secondaryStepId, splitLines(mainPatterns), splitLines(secondaryPatterns)]))
      !== JSON.stringify(exam!.grammar.map((target) => [target.code, target.main.stepId, target.secondary.stepId, target.main.acceptedPatterns, target.secondary.acceptedPatterns]))
    || JSON.stringify(evidence) !== JSON.stringify(exam!.grader.listening)
    || JSON.stringify(items) !== JSON.stringify(exam!.grader.items)
  );
  const dirty = contentDirty || reviewDirty;

  const detail: LevelFormEditorDetail = useMemo(() => ({
    title: draft.blueprint.title,
    status: draft.status,
    sections: draft.blueprint.sections,
    warnings: (exam?.checks ?? []).filter((check) => check.status === "fail").map((check) => ({ code: "missing_section" as const, message: `${check.code} · ${check.detail}`, severity: "error" as const })),
    versions: [],
    deleteReason: null,
    ...(exam ? { targetLevel: exam.framework.cefr } : {})
  }), [draft, exam]);

  const save = async (sections: AssessmentLevelFormUpdateInput) => {
    if (!onSave || !exam) return;
    setError(null);
    try {
      await onSave({
        ...sections,
        review: {
          grammar: grammar.map((item) => {
            const mainPatterns = splitLines(item.mainPatterns);
            const secondaryPatterns = splitLines(item.secondaryPatterns);
            return { code: item.code, mainStepId: item.mainStepId, secondaryStepId: item.secondaryStepId, ...(mainPatterns.length ? { mainPatterns } : {}), ...(secondaryPatterns.length ? { secondaryPatterns } : {}) };
          }),
          listeningEvidence: evidence,
          items,
          audioReviewed,
          manualConfirmations: [...confirmations]
        }
      });
    } catch {
      setError("Không lưu được bản nháp đề tháng.");
    }
  };
  const publish = async () => {
    if (!onPublish) return;
    setPublishing(true); setError(null);
    try { await onPublish(); } catch { setError("Không phát hành được đề tháng. Kiểm tra trạng thái READY và audio đã nghe soát."); } finally { setPublishing(false); }
  };
  const publishBlocker = !exam ? "Bản nháp cũ chưa có gói kiểm tra v2.0 — hãy sinh lại đề."
    : !draft.editable ? (draft.status === "published" ? "Đề đã phát hành." : "Đã quá 00:00 ngày thi; đề bị khóa.")
    : draft.stale ? "Khung tháng đã thay đổi sau khi sinh đề — hãy sinh lại."
    : dirty ? "Còn thay đổi chưa lưu."
    : exam.audio.status !== "REVIEWED" ? "Audio còn SCRIPT_ONLY: nghe soát và tick trước khi phát hành."
    : exam.status !== "READY" ? `Trạng thái ${exam.status}: chỉ đề READY mới duyệt được.`
    : null;

  const status = exam ? STATUS_COPY[exam.status] : STATUS_COPY.DRAFT;
  return <OperatorLevelFormDetail
    detail={detail}
    editing={editable}
    readOnly={!editable}
    onClose={onClose}
    {...(editable && onSave ? { onSave: save } : {})}
    {...(uploadAudio ? { uploadAudio } : {})}
    {...(synthesize ? { synthesizeEdgeTts: synthesize } : {})}
    kicker={`Bài thi tháng · ${exam?.framework.cefr ?? ""} · ${exam?.formCode ?? ""}`}
    dialogLabel="Bản nháp đề thi tháng"
    speakTextOnly
    onDraftChange={setCurrent}
  >
    <section className="card flat monthly-final-review" aria-label="Kiểm duyệt đề thi tháng">
      <header className="row between"><div><b>Trạng thái đề</b> <span className={`badge ${status.tone}`} data-testid="monthly-final-status">{status.label}</span> <span className={`badge ${exam?.audio.status === "REVIEWED" ? "ok" : "warn"}`}>Audio {exam?.audio.status ?? "SCRIPT_ONLY"}</span></div>
        {onPublish ? <button type="button" className="btn btn-primary" disabled={Boolean(publishBlocker) || publishing} title={publishBlocker ?? undefined} onClick={() => void publish()}>{publishing ? "Đang phát hành…" : "Duyệt & phát hành"}</button> : null}</header>
      <p className="small muted">{status.description}{publishBlocker ? ` ${publishBlocker}` : ""}</p>
      {exam ? <p className="xs muted">Khung {exam.framework.cefr} {exam.framework.month} · phiên bản {exam.framework.version} · scope {exam.framework.scopeHash} · ngày thi {draft.examDate} · N {exam.allocation.n} = L {exam.allocation.l} + R {exam.allocation.r} + W {exam.allocation.w} + S {exam.allocation.s} · {exam.source === "ai" ? "AI sinh" : "Soạn tay"}</p> : null}
      {draft.stale ? <div className="banner warn" role="alert"><div className="body small">Khung tháng đã được duyệt lại sau khi sinh đề này. Đề không còn khớp phạm vi đã duyệt; hãy sinh lại.</div></div> : null}
      {!draft.editable && draft.status === "draft" ? <div className="banner warn"><div className="body small">Đã quá 00:00 ngày thi ({draft.examDate}); không sửa hoặc sinh lại được.</div></div> : null}
      {error ? <p role="alert" className="monthly-error">{error}</p> : null}
    </section>

    {exam ? <>
      <section className="card flat monthly-final-audio-review" aria-label="Nghe soát audio">
        <h4>Audio phần nghe</h4>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" aria-label="Đã nghe soát audio" checked={audioReviewed} disabled={!editable || !savedAudioReady || contentDirty} onChange={(event) => setAudioReviewed(event.target.checked)} />
          <span>Đã nghe soát cả 2 bản nghe: khớp script, thời lượng và đáp án.</span>
        </label>
        <p className="xs muted">{!savedAudioReady ? "Cần audio đã lưu cho cả hai tin nhắn trước khi tick." : contentDirty ? "Lưu thay đổi script/audio trước, sau đó nghe lại rồi tick." : "Tick rồi bấm Lưu bản nháp để ghi nhận. Sửa script hoặc đổi audio sẽ bỏ tick."}</p>
      </section>

      <section className="card flat" aria-label="Báo cáo kiểm tra GEN">
        <h4>Báo cáo kiểm tra GEN01–GEN23</h4>
        <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Quy tắc</th><th>Cách kiểm</th><th>Kết quả</th><th>Bằng chứng</th><th>Đã rà</th></tr></thead><tbody>
          {exam.checks.map((check) => <tr key={check.code} data-testid={`gen-${check.code}`}>
            <td>{check.code}</td><td>{check.title}</td><td>{check.mode === "auto" ? "Tự động" : "Người rà"}</td>
            <td><span className={`badge ${CHECK_STATUS[check.status].tone}`}>{CHECK_STATUS[check.status].label}</span></td>
            <td className="small">{check.detail}</td>
            <td>{check.mode === "manual" ? <input type="checkbox" aria-label={`Xác nhận đã rà ${check.code}`} checked={confirmations.has(check.code)} disabled={!editable || contentDirty || (check.status === "fail" && !confirmations.has(check.code))} onChange={(event) => setConfirmations((previous) => { const next = new Set(previous); if (event.target.checked) next.add(check.code); else next.delete(check.code); return next; })} /> : null}</td>
          </tr>)}
        </tbody></table></div>
      </section>

      <section className="card flat" aria-label="Bảng mapping mục từ">
        <h4>Bảng mapping {exam.mapping.length} mục từ → vị trí đánh giá</h4>
        <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Mục từ</th><th>Nghĩa đã học</th><th>Kỹ năng</th><th>Vị trí</th><th>Đáp án</th></tr></thead><tbody>
          {exam.mapping.map((row) => <tr key={row.termId}><td>{row.code}</td><td>{row.word} <span className="xs muted">· {row.type}</span></td><td>{row.meaning}</td><td>{SKILL_LABEL[row.skill]}</td><td>{row.position}</td><td>{answerKey.get(row.taskKey) || (row.skill === "writing" || row.skill === "speaking" ? "Rubric" : "—")}</td></tr>)}
        </tbody></table></div>
      </section>

      <section className="card flat" aria-label="Ngữ pháp GA GB">
        <h4>Ngữ pháp GA / GB — thành phần chính và phụ</h4>
        {exam.grammar.map((target) => {
          const choice = grammar.find((item) => item.code === target.code);
          if (!choice) return null;
          const update = (patch: Partial<GrammarChoice>) => setGrammar((previous) => previous.map((item) => item.code === target.code ? { ...item, ...patch } : item));
          return <div className="monthly-final-grammar" key={target.code}>
            <b>{target.code} · {target.topicTitle}</b>
            <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
              <label>Thành phần chính (Writing + Speaking)<select aria-label={`${target.code} thành phần chính`} value={choice.mainStepId} disabled={!editable} onChange={(event) => update({ mainStepId: event.target.value, mainPatterns: target.taughtSteps.find((step) => step.stepId === event.target.value)?.formula ?? "" })}>{target.taughtSteps.map((step) => <option key={step.stepId} value={step.stepId}>{step.focus} — {step.formula}</option>)}</select></label>
              <label>Thành phần phụ (chỉ Writing)<select aria-label={`${target.code} thành phần phụ`} value={choice.secondaryStepId} disabled={!editable} onChange={(event) => update({ secondaryStepId: event.target.value, secondaryPatterns: target.taughtSteps.find((step) => step.stepId === event.target.value)?.formula ?? "" })}>{target.taughtSteps.map((step) => <option key={step.stepId} value={step.stepId}>{step.focus} — {step.formula}</option>)}</select></label>
            </div>
            {choice.mainStepId === choice.secondaryStepId ? <p className="small form-error" role="alert">Thành phần chính và phụ phải khác nhau.</p> : null}
            <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
              <label>Mẫu chấp nhận (chính, mỗi dòng một mẫu)<textarea aria-label={`${target.code} mẫu chính`} value={choice.mainPatterns} disabled={!editable} onChange={(event) => update({ mainPatterns: event.target.value })} /></label>
              <label>Mẫu chấp nhận (phụ)<textarea aria-label={`${target.code} mẫu phụ`} value={choice.secondaryPatterns} disabled={!editable} onChange={(event) => update({ secondaryPatterns: event.target.value })} /></label>
            </div>
          </div>;
        })}
        <h5>Câu GA/GB trong từng bản nghe (GEN21)</h5>
        {evidence.map((item, index) => <div className="row" style={{ flexWrap: "wrap", gap: 12 }} key={item.groupKey}>
          <label>{item.groupKey} · câu GA<input aria-label={`${item.groupKey} câu GA`} value={item.gaSentence} disabled={!editable} onChange={(event) => setEvidence((previous) => previous.map((entry, entryIndex) => entryIndex === index ? { ...entry, gaSentence: event.target.value } : entry))} /></label>
          <label>{item.groupKey} · câu GB<input aria-label={`${item.groupKey} câu GB`} value={item.gbSentence} disabled={!editable} onChange={(event) => setEvidence((previous) => previous.map((entry, entryIndex) => entryIndex === index ? { ...entry, gbSentence: event.target.value } : entry))} /></label>
        </div>)}
      </section>

      <section className="card flat" aria-label="Vị trí phát âm Speaking A">
        <h4>8 vị trí phát âm Speaking A (S1)</h4>
        <div className="table-wrap"><table><thead><tr><th>Mục</th><th>Vị trí 1</th><th>Vị trí 2</th><th>Từ ví dụ đã học</th></tr></thead><tbody>
          {exam.pronunciation.map((target) => <tr key={target.code}><td>{target.code} {target.ipa} · {target.label}</td>{[0, 1].map((index) => <td key={index}>{target.positions[index] ? `${target.positions[index]!.target} trong "${target.positions[index]!.word}"` : "—"}</td>)}<td className="xs muted">{target.taughtExamples.map((example) => example.word).join(", ")}</td></tr>)}
        </tbody></table></div>
      </section>

      <details className="card flat">
        <summary><b>Gói người chấm: lời giải, bằng chứng, bài mẫu, rubric</b></summary>
        <div className="table-wrap"><table><thead><tr><th>Câu</th><th>Giải thích</th><th>Trích đoạn bằng chứng (câu nghe)</th></tr></thead><tbody>
          {Object.entries(items).map(([key, item]) => <tr key={key}><td>{key}</td>
            <td><input aria-label={`Giải thích ${key}`} value={item.explanation} disabled={!editable} onChange={(event) => setItems((previous) => ({ ...previous, [key]: { ...previous[key]!, explanation: event.target.value } }))} /></td>
            <td>{key.startsWith("L") ? <input aria-label={`Bằng chứng ${key}`} value={item.evidence ?? ""} disabled={!editable} onChange={(event) => setItems((previous) => ({ ...previous, [key]: { ...previous[key]!, evidence: event.target.value } }))} /> : null}</td></tr>)}
        </tbody></table></div>
        <h5>Bài Writing mẫu</h5><p className="small" style={{ whiteSpace: "pre-line" }}>{exam.grader.writingSample || "—"}</p>
        <p className="xs muted">GA chính: {exam.grader.writingGrammarEvidence.gaMain} · GA phụ: {exam.grader.writingGrammarEvidence.gaSecondary} · GB chính: {exam.grader.writingGrammarEvidence.gbMain} · GB phụ: {exam.grader.writingGrammarEvidence.gbSecondary}</p>
        <h5>Speaking B mẫu</h5><p className="small" style={{ whiteSpace: "pre-line" }}>{exam.grader.speakingSample || "—"}</p>
        <p className="xs muted">GA chính: {exam.grader.speakingGrammarEvidence.gaMain} · GB chính: {exam.grader.speakingGrammarEvidence.gbMain}</p>
        <h5>Rubric</h5><ul className="small">{exam.grader.rubric.map((item) => <li key={item.code}><b>{item.code}</b> ({item.maxScore}) {item.description}</li>)}</ul>
      </details>
    </> : null}
  </OperatorLevelFormDetail>;
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}
