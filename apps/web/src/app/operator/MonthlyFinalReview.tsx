import { useEffect, useMemo, useState } from "react";
import { LineField } from "../shared/LineField.js";
import type {
  AssessmentLevelFormUpdateInput, MonthlyFinalCheckView, MonthlyFinalDraftView, MonthlyFinalExamStatus,
  MonthlyFinalGenCode, MonthlyFinalUpdateInput
} from "@e4s/contracts";
import { useModal } from "../shared/ModalProvider.js";
import { OperatorLevelFormDetail, type LevelFormEditorDetail } from "./LevelForms.js";
import { formatScore } from "../shared/format-score.js";

const STATUS_COPY: Record<MonthlyFinalExamStatus, { label: string; tone: string; description: string }> = {
  INPUT_ERROR: { label: "Thiếu đầu vào", tone: "danger", description: "Khung tháng thiếu đầu vào bắt buộc." },
  DRAFT: { label: "Cần sửa", tone: "warn", description: "Đề còn lỗi bên dưới. Sửa nội dung hoặc sinh lại." },
  NEEDS_REVIEW: { label: "Chờ rà soát", tone: "warn", description: "Không còn lỗi tự động. Còn mục cần người xác nhận hoặc audio chưa nghe soát." },
  READY: { label: "Sẵn sàng phát hành", tone: "ok", description: "Đã đủ điều kiện. Có thể duyệt và phát hành." }
};
const AUDIO_LABEL: Record<string, string> = { SCRIPT_ONLY: "Chưa có audio", REVIEWED: "Audio đã nghe soát" };

/** Plain-language summary of a failed check: what is missing and where, without rule codes. */
export function plainMonthlyFinalIssue(check: MonthlyFinalCheckView): { area: string; text: string } {
  const words = [...new Set([...check.detail.matchAll(/"([^"]+)"/gu)].map((match) => match[1]!))];
  const list = words.length ? `: ${words.slice(0, 8).join(", ")}${words.length > 8 ? ` (+${words.length - 8})` : ""}` : "";
  const after = check.detail.includes(":") ? check.detail.slice(check.detail.indexOf(":") + 1).trim() : check.detail;
  switch (check.code) {
    case "GEN02": return { area: "Cấu trúc", text: "Số câu từng phần chưa khớp công thức của tháng." };
    case "GEN04": return { area: "Nghe", text: `Từ được hỏi nhưng chưa có trong bài nghe${list}.` };
    case "GEN10": return { area: "Viết · Nói", text: "Bài mẫu Viết / Nói B chưa có câu dùng ngữ pháp của tháng." };
    case "GEN11": return { area: "Nói A", text: `Bài đọc thành tiếng thiếu từ luyện âm${list}.` };
    case "GEN17": return { area: "Lựa chọn", text: `Đáp án đúng dồn vào một vị trí A/B/C (${after}) — nên đổi thứ tự lựa chọn.` };
    case "GEN18": return { area: "Đề học viên", text: "Đề học viên đang lộ câu lấy từ lời giải, bài mẫu hoặc script." };
    case "GEN23": return { area: "Hướng dẫn", text: `Hướng dẫn cho học viên dùng thuật ngữ ngữ pháp${list} — viết lại bằng lời đơn giản.` };
    default: return { area: "Khác", text: `${check.title}${check.detail ? ` — ${check.detail}` : ""}` };
  }
}
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
  const modal = useModal();
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
    warnings: [],
    versions: [],
    deleteReason: null,
    ...(exam ? { targetLevel: exam.framework.cefr } : {}),
    ...(exam?.autoFixed?.length ? { autoFixed: exam.autoFixed } : {})
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
    if (!onPublish || publishing || publishBlocker) return;
    if (!await modal.confirm({ title: "Duyệt và phát hành đề tháng?", message: "Phiên bản này sẽ dùng cho các lượt thi tháng mới.", confirmLabel: "Duyệt & phát hành" })) return;
    setPublishing(true); setError(null);
    try { await onPublish(); } catch { setError("Không phát hành được đề tháng. Kiểm tra trạng thái READY và audio đã nghe soát."); } finally { setPublishing(false); }
  };
  const publishBlocker = !exam ? "Bản nháp cũ chưa có gói kiểm tra v2.0 — hãy sinh lại đề."
    : !draft.editable ? (draft.status === "published" ? "Đề đã phát hành." : "Đã quá 00:00 ngày thi; đề bị khóa.")
    : draft.stale ? "Khung tháng đã thay đổi sau khi sinh đề — hãy sinh lại."
    : dirty ? "Còn thay đổi chưa lưu."
    : exam.status === "DRAFT" || exam.status === "INPUT_ERROR" ? "Sửa hết các việc còn thiếu trước khi phát hành."
    : exam.audio.status !== "REVIEWED" ? "Chưa có audio: thêm audio, nghe soát và tick trước khi phát hành."
    : exam.status !== "READY" ? "Còn mục cần người xác nhận."
    : null;

  const status = exam ? STATUS_COPY[exam.status] : STATUS_COPY.DRAFT;
  const failedChecks = (exam?.checks ?? []).filter((check) => check.status === "fail");
  const manualChecks = (exam?.checks ?? []).filter((check) => check.mode === "manual" && check.status !== "fail");
  const todoCount = failedChecks.length + (savedAudioReady ? 0 : 1);
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
    hideValidation
    onDraftChange={setCurrent}
  >
    <section className="card flat monthly-final-review" aria-label="Kiểm duyệt đề thi tháng">
      <header className="row between"><div><b>Trạng thái đề</b> <span className={`badge ${status.tone}`} data-testid="monthly-final-status" data-status={exam?.status ?? "DRAFT"}>{status.label}</span> <span className={`badge ${exam?.audio.status === "REVIEWED" ? "ok" : "warn"}`}>{AUDIO_LABEL[exam?.audio.status ?? "SCRIPT_ONLY"] ?? exam?.audio.status}</span></div>
        {onPublish ? <button type="button" className="btn btn-primary" disabled={Boolean(publishBlocker) || publishing} title={publishBlocker ?? undefined} onClick={() => void publish()}>{publishing ? "Đang phát hành…" : "Duyệt & phát hành"}</button> : null}</header>
      <p className="small muted">{status.description}{publishBlocker ? ` ${publishBlocker}` : ""}</p>
      {exam ? <p className="xs muted">{exam.framework.cefr} · tháng {exam.framework.month} · ngày thi {draft.examDate} · {exam.allocation.l} câu Nghe · {exam.allocation.r} câu Đọc · Viết · Nói · {exam.source === "ai" ? "AI sinh" : "Soạn tay"}</p> : null}
      {draft.stale ? <div className="banner warn" role="alert"><div className="body small">Khung tháng đã được duyệt lại sau khi sinh đề này. Đề không còn khớp phạm vi đã duyệt; hãy sinh lại.</div></div> : null}
      {!draft.editable && draft.status === "draft" ? <div className="banner warn"><div className="body small">Đã quá 00:00 ngày thi ({draft.examDate}); không sửa hoặc sinh lại được.</div></div> : null}
      {error ? <p role="alert" className="monthly-error">{error}</p> : null}
    </section>

    {exam ? <>

      <section className={`card flat monthly-final-issues ${failedChecks.length ? "has-issues" : ""}`} aria-label="Việc còn thiếu">
        <h4>{todoCount ? `Còn thiếu ${todoCount} việc` : "Không còn việc thiếu"}</h4>
        {todoCount ? <ul className="monthly-final-issue-list">
          {!savedAudioReady ? <li data-testid="todo-audio"><span className="badge danger">Audio</span> Chưa có audio cho 2 bản nghe — thêm audio ở phần Nghe rồi lưu.</li> : null}
          {failedChecks.map((check) => { const issue = plainMonthlyFinalIssue(check); return <li key={check.code} data-testid={`gen-${check.code}`} title={check.title}><span className="badge danger">{issue.area}</span> {issue.text}</li>; })}
        </ul> : <p className="small muted">Nội dung đã qua mọi kiểm tra tự động.</p>}
        <h5>Cần người xác nhận ({(audioReviewed ? 1 : 0) + manualChecks.filter((check) => confirmations.has(check.code)).length}/{manualChecks.length + 1})</h5>
        <ul className="monthly-final-confirm-list">
          <li><label title={!savedAudioReady ? "Cần audio đã lưu cho cả hai bản nghe trước khi tick." : contentDirty ? "Lưu thay đổi trước, nghe lại rồi tick." : undefined}><input type="checkbox" aria-label="Đã nghe soát audio" checked={audioReviewed} disabled={!editable || !savedAudioReady || contentDirty} onChange={(event) => setAudioReviewed(event.target.checked)} /> <span>Đã nghe soát cả 2 bản nghe: khớp script, thời lượng và đáp án{!savedAudioReady ? <em className="xs muted"> (cần thêm audio trước)</em> : null}</span></label></li>
        </ul>
        {manualChecks.length ? <>
          <ul className="monthly-final-confirm-list">{manualChecks.map((check) => <li key={check.code} data-testid={`gen-${check.code}`}>
            <label><input type="checkbox" aria-label={`Xác nhận đã rà ${check.code}`} checked={confirmations.has(check.code)} disabled={!editable || contentDirty} onChange={(event) => setConfirmations((previous) => { const next = new Set(previous); if (event.target.checked) next.add(check.code); else next.delete(check.code); return next; })} /> <span>{check.title}</span></label>
          </li>)}</ul>
        </> : null}
        <details className="monthly-final-fold">
          <summary>Xem toàn bộ {exam.checks.length} kiểm tra</summary>
          <ul className="monthly-final-check-list small">{exam.checks.map((check) => <li key={check.code}><span className={`badge ${CHECK_STATUS[check.status].tone}`}>{CHECK_STATUS[check.status].label}</span> <b>{check.title}</b>{check.detail ? <div className="xs muted">{check.detail}</div> : null}</li>)}</ul>
        </details>
      </section>

      <details className="card flat monthly-final-fold" aria-label="Bảng mapping mục từ">
        <summary><b>Từ vựng được kiểm tra ở đâu</b> <span className="xs muted">{exam.mapping.length} từ</span></summary>
        <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Mục từ</th><th>Nghĩa đã học</th><th>Kỹ năng</th><th>Vị trí</th><th>Đáp án</th></tr></thead><tbody>
          {exam.mapping.map((row) => <tr key={row.termId}><td>{row.code}</td><td>{row.word} <span className="xs muted">· {row.type}</span></td><td>{row.meaning}</td><td>{SKILL_LABEL[row.skill]}</td><td>{row.position}</td><td>{answerKey.get(row.taskKey) || (row.skill === "writing" || row.skill === "speaking" ? "Rubric" : "—")}</td></tr>)}
        </tbody></table></div>
      </details>

      <details className="card flat monthly-final-fold" aria-label="Ngữ pháp GA GB">
        <summary><b>Ngữ pháp được chấm</b> <span className="xs muted">{exam.grammar.map((target) => target.topicTitle).join(" · ")}</span></summary>
        {exam.grammar.map((target) => {
          const choice = grammar.find((item) => item.code === target.code);
          if (!choice) return null;
          const update = (patch: Partial<GrammarChoice>) => setGrammar((previous) => previous.map((item) => item.code === target.code ? { ...item, ...patch } : item));
          return <div className="monthly-final-grammar" key={target.code}>
            <b>{target.code} · {target.topicTitle}</b>
            <div className="monthly-final-grammar-grid">
              <label>Thành phần chính (Writing + Speaking)<select aria-label={`${target.code} thành phần chính`} value={choice.mainStepId} disabled={!editable} onChange={(event) => update({ mainStepId: event.target.value, mainPatterns: target.taughtSteps.find((step) => step.stepId === event.target.value)?.formula ?? "" })}>{target.taughtSteps.map((step) => <option key={step.stepId} value={step.stepId}>{step.focus} — {step.formula}</option>)}</select></label>
              <label>Thành phần phụ (chỉ Writing)<select aria-label={`${target.code} thành phần phụ`} value={choice.secondaryStepId} disabled={!editable} onChange={(event) => update({ secondaryStepId: event.target.value, secondaryPatterns: target.taughtSteps.find((step) => step.stepId === event.target.value)?.formula ?? "" })}>{target.taughtSteps.map((step) => <option key={step.stepId} value={step.stepId}>{step.focus} — {step.formula}</option>)}</select></label>
            </div>
            {choice.mainStepId === choice.secondaryStepId ? <p className="small form-error" role="alert">Thành phần chính và phụ phải khác nhau.</p> : null}
            <div className="monthly-final-grammar-grid">
              <label>Mẫu chấp nhận (chính, mỗi dòng một mẫu)<textarea aria-label={`${target.code} mẫu chính`} value={choice.mainPatterns} disabled={!editable} onChange={(event) => update({ mainPatterns: event.target.value })} /></label>
              <label>Mẫu chấp nhận (phụ)<textarea aria-label={`${target.code} mẫu phụ`} value={choice.secondaryPatterns} disabled={!editable} onChange={(event) => update({ secondaryPatterns: event.target.value })} /></label>
            </div>
          </div>;
        })}
        <h5>Câu dùng ngữ pháp trong từng bản nghe</h5>
        {evidence.map((item, index) => <div className="monthly-final-grammar-grid" key={item.groupKey}>
          <label>{item.groupKey} · câu GA<LineField aria-label={`${item.groupKey} câu GA`} value={item.gaSentence} disabled={!editable} onChange={(event) => setEvidence((previous) => previous.map((entry, entryIndex) => entryIndex === index ? { ...entry, gaSentence: event.target.value } : entry))} /></label>
          <label>{item.groupKey} · câu GB<LineField aria-label={`${item.groupKey} câu GB`} value={item.gbSentence} disabled={!editable} onChange={(event) => setEvidence((previous) => previous.map((entry, entryIndex) => entryIndex === index ? { ...entry, gbSentence: event.target.value } : entry))} /></label>
        </div>)}
      </details>

      <details className="card flat monthly-final-fold" aria-label="Vị trí phát âm Speaking A">
        <summary><b>Phát âm được chấm ở Nói A</b> <span className="xs muted">{exam.pronunciation.map((target) => target.ipa).join(" ")}</span></summary>
        <div className="table-wrap"><table><thead><tr><th>Mục</th><th>Vị trí 1</th><th>Vị trí 2</th><th>Từ ví dụ đã học</th></tr></thead><tbody>
          {exam.pronunciation.map((target) => <tr key={target.code}><td>{target.code} {target.ipa} · {target.label}</td>{[0, 1].map((index) => <td key={index}>{target.positions[index] ? `${target.positions[index]!.target} trong "${target.positions[index]!.word}"` : "—"}</td>)}<td className="xs muted">{target.taughtExamples.map((example) => example.word).join(", ")}</td></tr>)}
        </tbody></table></div>
      </details>

      <details className="card flat monthly-final-fold">
        <summary><b>Gói người chấm</b> <span className="xs muted">lời giải, bài mẫu, rubric</span></summary>
        <div className="table-wrap"><table><thead><tr><th>Câu</th><th>Giải thích</th><th>Trích đoạn bằng chứng (câu nghe)</th></tr></thead><tbody>
          {Object.entries(items).map(([key, item]) => <tr key={key}><td>{key}</td>
            <td><LineField aria-label={`Giải thích ${key}`} value={item.explanation} disabled={!editable} onChange={(event) => setItems((previous) => ({ ...previous, [key]: { ...previous[key]!, explanation: event.target.value } }))} /></td>
            <td>{key.startsWith("L") ? <LineField aria-label={`Bằng chứng ${key}`} value={item.evidence ?? ""} disabled={!editable} onChange={(event) => setItems((previous) => ({ ...previous, [key]: { ...previous[key]!, evidence: event.target.value } }))} /> : null}</td></tr>)}
        </tbody></table></div>
        <h5>Bài Writing mẫu</h5><p className="small" style={{ whiteSpace: "pre-line" }}>{exam.grader.writingSample || "—"}</p>
        <p className="xs muted">GA chính: {exam.grader.writingGrammarEvidence.gaMain} · GA phụ: {exam.grader.writingGrammarEvidence.gaSecondary} · GB chính: {exam.grader.writingGrammarEvidence.gbMain} · GB phụ: {exam.grader.writingGrammarEvidence.gbSecondary}</p>
        <h5>Speaking B mẫu</h5><p className="small" style={{ whiteSpace: "pre-line" }}>{exam.grader.speakingSample || "—"}</p>
        <p className="xs muted">GA chính: {exam.grader.speakingGrammarEvidence.gaMain} · GB chính: {exam.grader.speakingGrammarEvidence.gbMain}</p>
        <h5>Rubric</h5><ul className="small">{exam.grader.rubric.map((item) => <li key={item.code}><b>{item.code}</b> ({formatScore(item.maxScore)}) {item.description}</li>)}</ul>
      </details>
    </> : null}
  </OperatorLevelFormDetail>;
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}
