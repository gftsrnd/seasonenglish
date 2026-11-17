import { RequestEvidenceDetails } from "../shared/RequestEvidence.js";
import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Badge, Button, Empty, LevelChip, OperatorPage, PageTitle, Rubric, Suggestions } from "./primitives.js";
import type { Cefr, OperatorReviewActions, OperatorReviewView, ReviewActionKey, ReviewAppeal, ReviewSubmission, ReviewTab, ReviewWeeklyPractice } from "./types.js";
import type { ContentReviewAssessmentDetailView, LessonExerciseCorrectionInput } from "@e4s/contracts";
import type { PromptOptions } from "../shared/ModalProvider.js";
import { operatorDateTime } from "./adapters.js";
import { AssessmentManualScore, AssessmentMonthlyRubricScore, type ManualScoreInput } from "./AssessmentManualScore.js";
import { AudioEvidencePanel } from "../shared/media/AudioEvidencePanel.js";
import { normalizeAudioEvidence, type AudioEvidence } from "../shared/media/audio-evidence.js";
import { normalizeBlankPrompt } from "../learner/text.js";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import "./styles.css";
import { formatScore, formatScoreOutOf } from "../shared/format-score.js";
import { LineField } from "../shared/LineField.js";
import { errorMessage } from "../shared/error-message.js";
import { Paged, PagedList } from "../shared/Pager.js";
import { ScrollJumpButton, useScrollJump } from "../shared/ScrollJump.js";
import { X as XIcon_ } from "lucide-react";
import { ActionLabel, Description } from "../shared/CompactUi.js";
import { ModalCloseButton } from "../shared/CompactUi.js";

const TABS: Array<[ReviewTab, string]> = [["coach", "Phản hồi Season"], ["appeals", "Kháng nghị"], ["attempts", "Cảnh báo bài tập"]];

export async function promptExerciseCorrection(
  modal: { prompt(options: PromptOptions): Promise<string | null> },
  item: { question?: string | null | undefined; answerKey?: string | null | undefined; options?: string[] | undefined }
): Promise<LessonExerciseCorrectionInput | null> {
  const prompt = await modal.prompt({
    title: "Hiệu chỉnh câu hỏi", label: "Nội dung câu hỏi", initialValue: item.question ?? "",
    multiline: { minLength: 1, maxLength: 4_000 }, confirmLabel: "Tiếp tục"
  });
  if (!prompt?.trim()) return null;
  if (!item.answerKey && !item.options?.length) return { prompt: prompt.trim() };
  const answer = await modal.prompt({
    title: "Hiệu chỉnh đáp án", message: item.options?.join(" · "), label: "Đáp án đúng",
    initialValue: item.answerKey ?? "", confirmLabel: "Tiếp tục"
  });
  return answer?.trim() ? { prompt: prompt.trim(), correctAnswer: answer.trim() } : null;
}
const focusableSelector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), audio[controls], [href], [tabindex]:not([tabindex='-1'])";

type PendingReviewAction = {
  key: ReviewActionKey;
  id: string;
  expected?: boolean;
  decision?: boolean;
};

type ReviewActionError = PendingReviewAction & { message: string };

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => !element.hidden);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}

function actionErrorMessage(reason: unknown): string {
  return errorMessage(reason, undefined, "Không hoàn tất thao tác. Hãy thử lại.");
}

function SubmissionReviewCard({
  item, aiConnected, readOnly, manualGradeBlocked, gradeAiBusy, gradeAiBlocked, onGradeAi, onGradeManual, onMarkRead, onDeleteAudio
}: {
  item: ReviewSubmission;
  aiConnected: boolean;
  readOnly: boolean;
  manualGradeBlocked?: string;
  gradeAiBusy: boolean;
  gradeAiBlocked?: string;
  onGradeAi(): void;
  onGradeManual(input: { meaning: number; vocabulary: number; grammar: number; feedback: string }): void;
  onMarkRead(checked: boolean): void;
  onDeleteAudio?: NonNullable<OperatorReviewActions["onDeleteAudio"]>;
}) {
  const [meaning, setMeaning] = useState(item.rubric?.meaning ?? 0);
  const [vocabulary, setVocabulary] = useState(item.rubric?.vocab ?? 0);
  const [grammar, setGrammar] = useState(item.rubric?.grammar ?? 0);
  const [feedback, setFeedback] = useState(item.feedback ?? "");
  useEffect(() => {
    setMeaning(item.rubric?.meaning ?? 0);
    setVocabulary(item.rubric?.vocab ?? 0);
    setGrammar(item.rubric?.grammar ?? 0);
    setFeedback(item.feedback ?? "");
  }, [item.id, item.rubric?.meaning, item.rubric?.vocab, item.rubric?.grammar, item.feedback]);
  const valid = [meaning, vocabulary, grammar].every(value => Number.isFinite(value) && value >= 0 && value <= 5) && feedback.trim().length > 0;
  const scoreInput = (label: string, value: number, setValue: (value: number) => void) => <label className="operator-submission-score-field"><span>{label}</span><input aria-label={label} type="number" min={0} max={5} step={0.5} value={value} disabled={readOnly} onChange={event => setValue(Number(event.target.value))} /></label>;
  return <div className="card operator-review-card">
    <div className="row between operator-card-header"><div><b>{item.learnerName}</b> {item.cefr && <LevelChip level={item.cefr} />} <span className="xs muted">Bài tháng · {item.type ? (item.type === "dialogue" ? "Hội thoại" : "Viết") : "—"} · {item.submittedAt}</span></div></div>
    <div className="operator-submission-content" role="region" aria-label={`Nội dung bài nộp của ${item.learnerName}`}>
    <div className="operator-submission-brief">
      <section className="operator-submission-task"><b className="operator-review-field-label">Đề bài</b><p>{item.task || "—"}</p></section>
      <section className="operator-submission-guidance"><b className="operator-review-field-label">Hướng dẫn</b><p>{item.guidance || "—"}</p></section>
      <section className="operator-submission-vocabulary"><b className="operator-review-field-label">Từ bắt buộc</b><p>{item.requiredVocabulary?.length ? item.requiredVocabulary.join(", ") : "—"}</p></section>
      <section className="operator-submission-answer"><b className="operator-review-field-label">Bài làm của học viên</b><p>{item.text}</p>{item.audioArtifact ? <AudioEvidencePanel label={`Bản ghi âm bài nộp của ${item.learnerName}`} evidence={{ ...item.audioArtifact, transcript: item.audioArtifact.transcript ?? item.text }} {...(onDeleteAudio ? { onDelete: onDeleteAudio } : {})} /> : null}</section>
    </div>
    </div>
    {item.total != null ? <div className="operator-submission-result" role="region" aria-label={`Kết quả và nhận xét của ${item.learnerName}`}><div className="row operator-submission-result-summary" aria-label="Kết quả chấm"><b>{formatScoreOutOf(item.total, 100)}</b><Rubric value={item.rubric} />{item.aiGraded ? <Badge>AI chấm</Badge> : <Badge>Người chấm</Badge>}</div><details className="operator-submission-ai-detail"><summary><b>Nhận xét và gợi ý sửa ({item.suggestions?.length ?? 0})</b>{item.feedback ? <span className="small muted">{item.feedback}</span> : null}</summary><div className="operator-submission-ai-detail-body">{item.feedback ? <div className="operator-submission-feedback-copy"><b className="operator-review-field-label">Nhận xét đã chấm</b><p>{item.feedback}</p></div> : null}<Suggestions items={item.suggestions} /></div></details></div> : <div className="operator-submission-status-row"><Badge tone="warn">Chưa chấm</Badge></div>}
    <details className="operator-submission-grader" aria-label={`Chấm bài của ${item.learnerName}`} open={item.total == null}>
      <summary><b>{item.total == null ? "Chấm bài" : "Chấm lại / chỉnh kết quả"}</b><span className="small muted">3 tiêu chí · nhận xét · thao tác</span></summary>
      <div className="operator-submission-grader-body">
      <div className="operator-submission-score-grid" role="group" aria-label="Ba tiêu chí chấm điểm">{scoreInput("Đúng ý", meaning, setMeaning)}{scoreInput("Từ vựng", vocabulary, setVocabulary)}{scoreInput("Ngữ pháp", grammar, setGrammar)}</div>
      <label className="operator-submission-feedback"><span>Nhận xét</span><textarea aria-label="Nhận xét" rows={3} value={feedback} disabled={readOnly} onChange={event => setFeedback(event.target.value)} placeholder="Nhập nhận xét gửi học viên…" /></label>
      <div className="row operator-review-action-footer">{aiConnected ? <Button small danger={item.total != null} busy={gradeAiBusy} disabled={readOnly || Boolean(gradeAiBlocked)} title={gradeAiBlocked} onClick={onGradeAi}>{gradeAiBusy ? "Đang chấm bằng AI…" : item.total == null ? "Chấm bằng AI" : "Chấm lại bằng AI"}</Button> : null}<Button primary={item.total == null} danger={item.total != null} small disabled={readOnly || Boolean(manualGradeBlocked) || !valid} title={manualGradeBlocked} onClick={() => onGradeManual({ meaning, vocabulary, grammar, feedback: feedback.trim() })}>Lưu kết quả chấm</Button><Button small disabled={readOnly} onClick={() => onMarkRead(!item.operatorChecked)}>{item.operatorChecked ? "Đã đọc" : "Đánh dấu đã đọc"}</Button></div>
      </div>
    </details>
  </div>;
}

const appealPartLabels: Record<string, string> = {
  listening: "Nghe", reading: "Đọc", writing: "Viết", word_class: "Từ loại", word_use: "Dùng từ", speaking: "Nói"
};

function appealPartLabel(part?: string) {
  return part ? appealPartLabels[part] ?? part : "Bài kiểm tra";
}

export function AppealReviewCard({ item, readOnly, blockedMessage, busy, itemBusy, onDecision, compactRetake, reviewAction }: {
  item: ReviewAppeal;
  readOnly: boolean;
  blockedMessage?: string;
  busy(decision: boolean): boolean;
  itemBusy: boolean;
  onDecision(decision: boolean): void;
  compactRetake?: boolean;
  reviewAction?: React.ReactNode;
}) {
  const partLabel = appealPartLabel(item.part);
  const retake = item.retakeRequest === true;
  const compact = retake && compactRetake;
  const title = retake ? "Yêu cầu thi lại bài đầu vào" : item.title || (item.kind === "sub" ? "Bài thực hành tuần" : "Bài kiểm tra");
  const statusLabel = item.statusLabel || (item.status === "pending" ? "Chờ xử lý" : item.status === "accepted" ? (retake ? "Đã cho thi lại" : "Đã chấp nhận") : (retake ? "Đã từ chối" : "Giữ nguyên"));
  return <article className={`operator-review-appeal operator-review-appeal-${item.status}${compact ? " operator-review-appeal-compact" : ""}`} aria-label={retake ? `Yêu cầu thi lại của ${item.learnerName}` : `Kháng nghị phần ${partLabel} của ${item.learnerName}`}>
    {!compact ? <header className="operator-review-appeal-header">
      <div className="operator-review-appeal-heading">
        <div className="row operator-review-appeal-badges">{item.cefr && <LevelChip level={item.cefr} />}{!retake ? <Badge>{item.kind === "part" ? `Phần ${partLabel}` : item.kind === "sub" ? "Bài thực hành tuần" : "Bài kiểm tra"}</Badge> : null}</div>
        <h3>{title}</h3>
        <p className="xs muted">{item.learnerName} · {item.at}{item.kind === "part" ? ` · ${item.attempts ?? 0} lượt làm` : ""}{item.currentScore != null ? ` · Điểm hiện tại ${formatScoreOutOf(item.currentScore, 100)}` : ""}</p>
      </div>
      <Badge tone={item.overdue ? "danger" : item.status === "pending" ? "warn" : item.status === "accepted" ? "ok" : "danger"}>{item.overdue ? "Quá hạn xử lý" : statusLabel}</Badge>
    </header> : null}
    {item.question ? <section className="operator-review-appeal-block"><b className="operator-review-field-label">Đề bài</b><p>{normalizeBlankPrompt(item.question)}</p>{item.options?.length ? <div className="operator-review-appeal-options">{item.options.map((option, index) => <span key={`${item.id}-option-${index}`}>{option}</span>)}</div> : null}</section> : null}
    {item.answer ? <section className="operator-review-appeal-block operator-review-learner-answer"><b className="operator-review-field-label">Bài làm của học viên</b><p>{item.answer}</p></section> : null}
    {(item.key || item.aiFeedback) ? <div className="operator-review-appeal-comparison">{item.key ? <section><b className="operator-review-field-label">Đáp án tham khảo</b><p>{item.key}</p></section> : null}{item.aiFeedback ? <section><b className="operator-review-field-label">Nhận xét trước đó</b><p>{item.aiFeedback}</p></section> : null}</div> : null}
    {!compact ? <section className="operator-review-appeal-reason"><b className="operator-review-field-label">{retake ? "Lý do xin thi lại" : "Lý do kháng nghị"}</b><p>{item.reason}</p>
        {item.proposedLevel ? <p>Trình độ đề xuất · {item.proposedLevel}</p> : null}
      <RequestEvidenceDetails kind={item.kind === "part" ? "lesson_part" : item.kind === "sub" ? "weekly_practice" : "assessment"} item={item} />
    </section> : null}
    {item.status === "pending" ? <footer className="row operator-review-action-footer"><Button primary small busy={busy(true)} disabled={readOnly || Boolean(blockedMessage) || itemBusy} title={blockedMessage} onClick={() => onDecision(true)}>{busy(true) ? "Đang xử lý…" : retake ? "Duyệt cho thi lại" : "Chấp nhận kháng nghị"}</Button><Button small busy={busy(false)} disabled={readOnly || Boolean(blockedMessage) || itemBusy} title={blockedMessage} onClick={() => onDecision(false)}>{busy(false) ? "Đang xử lý…" : retake ? "Từ chối" : "Giữ nguyên kết quả"}</Button>{reviewAction}</footer> : <>
      {!compact && item.decidedSummary ? <p className="xs muted operator-review-appeal-resolution">{item.decidedSummary}</p> : null}
      {reviewAction ? <footer className="row operator-review-action-footer">{reviewAction}</footer> : null}
    </>}
  </article>;
}

export function generateWeeklyPracticeDraft(topic: string, cefr: Cefr, vocabulary: readonly string[], variation = 0) {
  const sentenceRange = cefr === "A1" ? "3–4" : cefr === "A2" ? "3–5" : "5–7";
  const words = [...new Set(vocabulary.map(value => value.trim()).filter(Boolean))].slice(0, 12);
  const options = [
    {
      task: `Write ${sentenceRange} sentences about “${topic}”.`,
      guidance: `Viết ${sentenceRange} câu tiếng Anh về chủ đề “${topic}”.`
    },
    {
      task: `Describe a realistic workplace situation about “${topic}” in ${sentenceRange} sentences.`,
      guidance: `Mô tả một tình huống công việc thực tế về “${topic}” bằng ${sentenceRange} câu tiếng Anh.`
    },
    {
      task: `Write a short connected paragraph of ${sentenceRange} sentences about “${topic}”.`,
      guidance: `Viết một đoạn liền mạch ${sentenceRange} câu tiếng Anh về “${topic}”, có mở đầu và kết quả.`
    },
    {
      task: `In ${sentenceRange} sentences, explain what happened and what should happen next in a situation about “${topic}”.`,
      guidance: `Trong ${sentenceRange} câu tiếng Anh, nêu điều đã xảy ra và bước xử lý tiếp theo trong tình huống “${topic}”.`
    }
  ];
  const option = options[((variation % options.length) + options.length) % options.length]!;
  const vocabularyInstruction = words.length
    ? ` Dùng ít nhất 3 từ trong bài tuần này: ${words.join(", ")}.`
    : " Dùng ít nhất 3 từ trong bài tuần này.";
  return {
    task: option.task,
    guidance: `${option.guidance}${vocabularyInstruction}`
  };
}

export function WeeklyPracticeEditor({ item, readOnly, onSave, compact = false, contextLabel, headingLabel }: { item: ReviewWeeklyPractice; readOnly: boolean; onSave: NonNullable<OperatorReviewActions["onSaveWeeklyPractice"]>; compact?: boolean; contextLabel?: string; headingLabel?: string }) {
  const [task, setTask] = useState(item.task);
  const [guidance, setGuidance] = useState(item.guidance);
  const [vocabulary, setVocabulary] = useState(item.requiredVocabulary.join(", "));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const savingRef = useRef(false);
  const lastSaveAttemptRef = useRef(0);
  const generationRef = useRef(0);
  const requiredVocabulary = [...new Set(vocabulary.split(/[\n,]+/u).map(value => value.trim()).filter(Boolean))];
  const context = contextLabel ?? `Tuần ${item.week} · ${item.cefr}`;
  const generate = () => {
    const generated = generateWeeklyPracticeDraft(item.topic, item.cefr, requiredVocabulary, generationRef.current);
    generationRef.current += 1;
    setTask(generated.task);
    setGuidance(generated.guidance);
  };
  const save = async () => {
    const now = Date.now();
    if (savingRef.current || now - lastSaveAttemptRef.current < 500 || readOnly || !task.trim() || !guidance.trim()) return;
    lastSaveAttemptRef.current = now;
    savingRef.current = true;
    setSaving(true);
    setSaveError(undefined);
    try {
      await onSave({ week: item.week, cefr: item.cefr, expectedVersion: item.version, task: task.trim(), guidance: guidance.trim(), requiredVocabulary });
    } catch (reason) {
      setSaveError(actionErrorMessage(reason));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return <article className="card operator-weekly-practice-editor">
    <div className={`operator-weekly-practice-header${compact ? " compact" : ""}`}>{compact ? null : <div className="operator-weekly-practice-heading"><b>{headingLabel ?? `Tuần ${item.week} · ${item.topic}`}</b><div className="operator-weekly-practice-meta"><LevelChip level={item.cefr} /><span>v{item.version}</span><span>{item.status === "approved" ? "Đã duyệt" : item.status === "review" ? "Chờ duyệt" : "Bản nháp"}</span></div></div>}<Button small aria-label={`Sinh bài cuối tuần · ${context}`} disabled={readOnly || saving} onClick={generate}>Sinh bài cuối tuần</Button></div>
    <div className="operator-weekly-practice-fields"><label>Đề bài<textarea aria-label={`Đề bài · ${context}`} value={task} disabled={readOnly || saving} onChange={event => setTask(event.target.value)} /></label>
    <label>Hướng dẫn<textarea aria-label={`Hướng dẫn · ${context}`} value={guidance} disabled={readOnly || saving} onChange={event => setGuidance(event.target.value)} /></label>
    <label>Từ bắt buộc<LineField aria-label={`Từ bắt buộc · ${context}`} value={vocabulary} disabled={readOnly || saving} onChange={event => setVocabulary(event.target.value)} /></label></div>
    {saveError && <div className="small" role="alert">{saveError}</div>}
    <div className="row operator-review-action-footer"><Button small primary aria-label={`Lưu bản nháp · ${context}`} busy={saving} disabled={readOnly || saving || !task.trim() || !guidance.trim() || requiredVocabulary.length > 12} onClick={() => void save()}>{saving ? "Đang lưu…" : "Lưu bản nháp"}</Button></div>
  </article>;
}

export function groupReviewItemsByLearner<T extends { learnerName: string }>(items: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.learnerName, [...(groups.get(item.learnerName) ?? []), item]);
  return [...groups].map(([learnerName, learnerItems]) => ({ learnerName, items: learnerItems }));
}

function groupAttemptsByLearner(items: OperatorReviewView["attempts"]) {
  const groups = new Map<string, OperatorReviewView["attempts"]>();
  for (const item of items) groups.set(item.learnerId, [...(groups.get(item.learnerId) ?? []), item]);
  return [...groups.entries()].map(([learnerId, learnerItems]) => ({ learnerId, items: learnerItems }));
}

const integrityReasonLabels: Record<string, string> = {
  window_blur: "Rời khỏi cửa sổ bài test",
  tab_switch: "Chuyển sang tab hoặc cửa sổ khác",
  copy: "Sao chép nội dung trong bài test",
  paste: "Dán nội dung vào bài test",
  fullscreen_exit: "Thoát chế độ toàn màn hình",
  devtools: "Mở công cụ phát triển"
};

function integrityEventText(event: Record<string, unknown>): { label: string; count?: number; at?: string } {
  const reason = typeof event.reason === "string" ? event.reason : "";
  const label = integrityReasonLabels[reason] ?? "Có cảnh báo cần kiểm tra";
  const count = typeof event.violationCount === "number" ? event.violationCount : undefined;
  const timestamp = typeof event.occurredAt === "string" ? event.occurredAt : typeof event.recordedAt === "string" ? event.recordedAt : undefined;
  return { label, ...(count === undefined ? {} : { count }), ...(timestamp ? { at: operatorDateTime(timestamp) } : {}) };
}

export function OperatorReview({ view, actions, readOnly = false, unavailable = {}, mode = "weekly", embedded = false }: { view: OperatorReviewView; actions: OperatorReviewActions; readOnly?: boolean; unavailable?: Partial<Record<ReviewActionKey, string>>; mode?: "weekly" | "assessment"; embedded?: boolean }) {
  const blocked = (key: ReviewActionKey) => unavailable[key];
  const [pending, setPending] = useState<PendingReviewAction>();
  const [actionError, setActionError] = useState<ReviewActionError>();

  const isBusy = (key: ReviewActionKey, id: string, decision?: boolean) => pending?.key === key && pending.id === id && (decision === undefined || pending.decision === decision);
  const isSameItemBusy = (key: ReviewActionKey, id: string) => pending?.key === key && pending.id === id;

  useEffect(() => {
    if (!pending) return;
    let completed = false;
    if (pending.key === "gradeAi") completed = view.submissions.find(item => item.id === pending.id)?.total != null;
    if (pending.key === "decideAppeal") completed = view.appeals.find(item => item.id === pending.id)?.status !== "pending";
    if (completed) setPending(current => current?.key === pending.key && current.id === pending.id ? undefined : current);
  }, [pending, view]);

  const runAction = (next: PendingReviewAction, action: () => void) => {
    setPending(next);
    setActionError(undefined);
    try {
      const result = action() as unknown;
      if (!isPromiseLike(result)) return;
      void Promise.resolve(result).then(
        () => setPending(current => current?.key === next.key && current.id === next.id ? undefined : current),
        reason => {
          setPending(current => current?.key === next.key && current.id === next.id ? undefined : current);
          setActionError({ ...next, message: actionErrorMessage(reason) });
        }
      );
    } catch (reason) {
      setPending(undefined);
      setActionError({ ...next, message: actionErrorMessage(reason) });
    }
  };

  const body = () => {
    if (view.activeTab === "attempts" && view.exerciseWarnings) {
      return view.exerciseWarnings.length ? <div className="stack operator-review-card-list">
        {view.exerciseWarnings.map(warning => <article className="card" key={warning.id}>
          <b>{warning.learnerName} · <LevelChip level={warning.cefr} /></b>
          <p>{warning.lessonTitle} · {warning.month}</p>
          <p><b>Câu hỏi</b> {warning.question || warning.partCode}</p>
          <ol aria-label="Hai lượt trả lời sai">{warning.answers.map((answer, index) => <li key={index}>{answer || "Không có câu trả lời"}</li>)}</ol>
          <div className="row">
            {actions.onOpenExercise && <button type="button" className="btn-sm" onClick={() => actions.onOpenExercise?.(warning)}>Mở câu hỏi</button>}
            {!readOnly && actions.onCorrectExerciseWarning && <button type="button" className="btn-sm" onClick={() => actions.onCorrectExerciseWarning?.(warning)}>Hiệu chỉnh câu</button>}
            {!readOnly && actions.onDismissExerciseWarning && <button type="button" className="btn-sm" onClick={() => actions.onDismissExerciseWarning?.(warning.id)}>Không lỗi</button>}
          </div>
        </article>)}
      </div> : <Empty>Chưa có câu bài ngày sai cả hai lượt.</Empty>;
    }
    if (view.activeTab === "subs") return <Empty>Chưa có bài tháng đã nộp. Bài nộp tuần cũ không được hiển thị trong luồng tháng.</Empty>;

    if (view.activeTab === "coach") return view.coachTurns.length ? <div className="card operator-review-panel"><Description className="small muted operator-review-intro" text="Đọc mẫu phản hồi AI coach; kiểm tra lệch mức, lỗi hoặc khen quá tay rồi sửa prompt nếu cần." /><div className="operator-coach-list">{groupReviewItemsByLearner(view.coachTurns).map(group => <details className="operator-review-learner-group" key={group.learnerName}><summary><b>{group.learnerName}</b><span className="xs muted">{group.items.length} phản hồi</span></summary><div className="operator-review-group-items">{<PagedList items={group.items} label="phản hồi">{item => <div className="item" key={item.id}><div className="body small"><div className="row between operator-review-item-heading"><span>{item.cefr && <LevelChip level={item.cefr} />} <span className="xs muted">{item.week ? `Tuần ${item.week} · ` : ""}{item.at}</span></span><Button small disabled={readOnly} onClick={() => actions.onMarkCoachTurn(item.id, !item.checked)}>{item.checked ? "Đã kiểm" : "Đánh dấu đã kiểm"}</Button></div><div className="operator-review-copy"><span className="muted">Học viên:</span> {item.userText}</div><div className="operator-review-copy"><span className="muted">Coach:</span> {item.reply}</div>{item.audioArtifact ? <AudioEvidencePanel label={`Bản ghi âm Season của ${item.learnerName}`} evidence={{ ...item.audioArtifact, transcript: item.audioArtifact.transcript ?? item.userText }} {...(actions.onDeleteAudio ? { onDelete: actions.onDeleteAudio } : {})} /> : null}<Rubric value={item.rubric} /><Suggestions items={item.suggestions} /></div></div>}</PagedList>}</div></details>)}</div></div> : <Empty>Chưa có lượt luyện nào.</Empty>;

    if (view.activeTab === "weekly") return <Empty>Chưa có bài tháng. Bài tháng chỉ xuất hiện sau khi Người vận hành tạo và duyệt lịch học tháng.</Empty>;

    if (view.activeTab === "appeals") return view.appeals.length ? <div className="operator-review-card-list">{groupReviewItemsByLearner(view.appeals).map(group => <details className="card operator-review-learner-group" key={group.learnerName}><summary><b>{group.learnerName}</b><span className="xs muted">{group.items.length} kháng nghị · {group.items.filter(item => item.status === "pending").length} chờ xử lý</span></summary><div className="operator-review-group-items">{group.items.map(item => <AppealReviewCard key={item.id} item={item} readOnly={readOnly} {...(blocked("decideAppeal") ? { blockedMessage: blocked("decideAppeal") } : {})} busy={decision => isBusy("decideAppeal", item.id, decision)} itemBusy={isSameItemBusy("decideAppeal", item.id)} onDecision={decision => runAction({ key: "decideAppeal", id: item.id, decision }, () => actions.onDecideAppeal(item.id, decision))} />)}</div></details>)}</div> : <Empty>Chưa có kháng nghị nào. Yêu cầu kháng nghị bài học tháng sẽ hiện ở đây.</Empty>;

    if (view.activeTab === "attempts") return view.attempts.length ? <div className="card"><p className="small muted operator-status-legend">Mỗi kỹ năng tối đa 2 lượt: <span><Check className="operator-inline-icon" size={14} strokeWidth={2.5} aria-hidden="true" /> đúng</span>, <span><X className="operator-inline-icon" size={14} strokeWidth={2.5} aria-hidden="true" /> hết lượt vẫn sai/đã hiện đáp án</span>, … đang làm.</p><div className="operator-attempt-learner-list">{groupAttemptsByLearner(view.attempts).map(group => { const first = group.items[0]!; const total = group.items.reduce((sum, item) => sum + item.total, 0); return <details className="operator-review-learner-group" data-testid="attempt-learner-group" key={group.learnerId}><summary><span><b>{first.learnerName}</b> {first.cefr && <LevelChip level={first.cefr} />}</span><span className="xs muted">{group.items.length} bài · {total} lượt</span></summary><div className="table-wrap"><table><thead><tr><th>Bài</th><th>Nghe</th><th>Đọc</th><th>Viết</th><th>Từ loại</th><th>Dùng từ</th><th>Nói</th><th>Tổng lần</th></tr></thead><tbody>{group.items.map(item => <tr key={item.id}><td className="small">{item.lesson}</td><td>{item.listening}</td><td>{item.reading}</td><td>{item.writing}</td><td>{item.wordClass}</td><td>{item.wordUse}</td><td>{item.speaking}{item.audioArtifact ? <AudioEvidencePanel label={`Bản ghi âm bài học của ${item.learnerName}`} evidence={item.audioArtifact} {...(actions.onDeleteAudio ? { onDelete: actions.onDeleteAudio } : {})} /> : null}</td><td><b>{item.total}</b></td></tr>)}</tbody></table></div></details>; })}</div></div> : <Empty>Chưa có học viên nào làm bài thực hành.</Empty>;

    const assessmentLabel = (kind: typeof view.tests[number]["kind"]) => kind === "placement" ? "Đầu vào" : kind === "final" ? "Bài thi tháng" : kind === "pass_course" ? "Đề đầu ra" : "Lên mức";
    return view.tests.length ? <div className="card"><Paged items={view.tests} label="lượt làm bài">{tests => <div className="table-wrap operator-action-table-wrap">
      <table className="operator-action-table operator-results-table" role="table" aria-label="Lượt làm bài thi">
        <thead><tr><th scope="col">Người học</th><th scope="col">Loại</th><th scope="col">Nộp</th><th scope="col">Tổng</th><th scope="col" aria-label="Thao tác" /></tr></thead>
        <tbody>{tests.map(item => <tr role="row" key={item.id}>
          <td className="operator-result-name">{item.learnerName}</td>
          <td className="operator-result-type">{assessmentLabel(item.kind)}{item.status && assessmentStatusLabels[item.status] ? <span className="operator-result-status"> · {assessmentStatusLabels[item.status]}</span> : null}</td>
          <td className="operator-result-desktop-detail">{item.submittedAt || "—"}</td>
          <td className="operator-result-score">{item.total == null ? "—" : formatScoreOutOf(item.total, 100)}</td>
          <td className="operator-result-action"><Button small disabled={Boolean(blocked("viewTest"))} title={blocked("viewTest")} onClick={() => actions.onViewTest(item.id)}>Xem</Button></td>
        </tr>)}</tbody>
      </table>
    </div>}</Paged></div> : <Empty>Chưa có bài test.</Empty>;
  };

  const content = <>{!embedded && <PageTitle><h1>Chấm & Kháng nghị</h1><p className="muted">Kiểm tra phản hồi Season, xử lý kháng nghị và theo dõi cảnh báo bài tập.</p></PageTitle>}{actionError && <div className="banner danger" role="alert" style={{ marginBottom: 12 }}><div className="body small">{actionError.message}</div></div>}{mode === "weekly" && !embedded && <div className="tabs operator-review-tabs" role="tablist" aria-label="Nhóm nội dung cần kiểm tra">{TABS.map(([key, label]) => <button type="button" role="tab" aria-selected={view.activeTab === key} className={view.activeTab === key ? "active" : ""} key={key} onClick={() => actions.onTabChange(key)}>{key === "attempts" ? label : `${label} (${key === "weekly" || key === "subs" ? 0 : view.counts[key] ?? 0}${key === "subs" ? " chưa đọc" : ""})`}</button>)}</div>}{body()}</>;
  return embedded ? content : <OperatorPage title="Chấm & Kháng nghị">{content}</OperatorPage>;
}

// Covers every attempt status for every kind (placement, monthly, level-up,
// pass-course); "completed" is listed so finished monthly/pass-course rows keep
// their status label in the ≤900px card layout.
const assessmentStatusLabels: Record<string, string> = {
  submitted: "Đã nộp", pending_review: "Chờ duyệt", approved: "Đã duyệt", in_progress: "Đang làm", needs_retry: "Cần làm lại", retry: "Cần làm lại", completed: "Đã hoàn thành"
};

export function OperatorReviewAssessmentDetail({ detail, onClose, onSaveManualScore, savingManualScore = false, onDeleteAudio, onRescore, rescoring = false, learnerFeedback }: { detail: ContentReviewAssessmentDetailView; learnerFeedback?: string | null; onClose(): void; onSaveManualScore?: (input: ManualScoreInput) => void; savingManualScore?: boolean; onDeleteAudio?: (evidence: AudioEvidence) => void | Promise<void>; onRescore?: () => void; rescoring?: boolean }) {
  const learnerView = learnerFeedback !== undefined;
  const compact = useMediaQuery("(max-width: 900px)");
  const dialogRef = useRef<HTMLElement>(null);
  // The long test detail scrolls inside the dialog: same up/down jump button as the pages.
  const scroll = useScrollJump(true);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    (focusableElements(dialog)[0] ?? dialog).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements(dialog);
      if (!elements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
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

  const sectionRows = detail.sections?.length
    ? detail.sections
    : detail.scores.map(score => ({ section: score.section, label: score.section, maxScore: null, durationMinutes: null, actualSeconds: null, cefr: null, score: score.score, source: score.source, criteria: score.criteria, comment: null, state: "scored" as const, groups: [] }));
  const sectionOrder = ["listening", "reading", "writing", "speaking"] as const;
  const sectionLabels: Record<(typeof sectionOrder)[number], string> = { listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" };
  const sectionLabel = (section: string) => sectionLabels[section as (typeof sectionOrder)[number]] ?? section;
  const answersFor = (section: string) => detail.answers.filter(answer => answer.section === section);
  const tasksFor = (section: string) => detail.taskPrompts?.filter(task => task.section === section) ?? [];
  const scoreFor = (section: string) => sectionRows.find(score => score.section === section);
  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds == null) return "—";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = String(seconds % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
  };
  const manualTasks = (section: "writing" | "speaking") => {
    const criteria = scoreFor(section)?.criteria ?? {};
    return Array.isArray(criteria.tasks) ? criteria.tasks : [];
  };
  const monthlyRubric = detail.kind === "final" ? detail.productiveRubric : undefined;
  const writingCriteria = scoreFor("writing")?.criteria;
  const comment = typeof writingCriteria?.comment === "string" ? writingCriteria.comment : "";
  const monthlyScores: Record<string, number> = {};
  for (const criteria of [writingCriteria?.rubricScores, writingCriteria?.suggestedSpeakingRubricScores, scoreFor("speaking")?.criteria.rubricScores]) {
    if (!Array.isArray(criteria)) continue;
    for (const item of criteria) {
      if (item && typeof item.code === "string" && typeof item.score === "number") monthlyScores[item.code] = item.score;
    }
  }
  type ReviewTask = { taskKey: string; title?: string; prompt?: string; maxScore?: number; minWords?: number; maxWords?: number; options?: Array<{ value: string; label: string }>; correctAnswer?: string | null };
  const renderStimulus = (stimulus: { type: string; text?: string; audioSrc?: string; lines?: Array<{ speaker: string; text: string }>; headers?: string[]; rows?: string[][] } | undefined) => {
    if (!stimulus) return null;
    if (learnerView && stimulus.type === "audio_script") {
      return stimulus.audioSrc ? <audio className="operator-stimulus" controls preload="none" src={stimulus.audioSrc} aria-label="Đoạn nghe của đề đầu vào" />
        : <p className="small muted">Đoạn nghe hiện không có bản phát lại.</p>;
    }
    if (stimulus.lines?.length) return <p className="operator-stimulus"><span className="operator-stimulus-label">Transcript:</span> {stimulus.lines.map((line, index) => <span key={`${line.speaker}-${index}`}><i>{line.speaker}:</i> {line.text}{index < stimulus.lines!.length - 1 ? " " : ""}</span>)}</p>;
    if (stimulus.text) return <p className="operator-stimulus"><span className="operator-stimulus-label">Nội dung:</span> {stimulus.text}</p>;
    if (stimulus.headers?.length && stimulus.rows?.length) return <div className="operator-stimulus-table"><div className="table-wrap"><table><thead><tr>{stimulus.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{stimulus.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div></div>;
    return null;
  };
  const answerText = (task: ReviewTask, value: string) => {
    const option = task.options?.find(item => item.value === value);
    return option ? `${option.value}. ${option.label}` : value;
  };
  const renderAnswer = (section: string, task: ReviewTask, answer: ContentReviewAssessmentDetailView["answers"][number] | undefined, showTitle = true, itemLabel = "") => {
    const audioKey = `${section}:${task.taskKey}`;
    const objective = section === "listening" || section === "reading";
    const answerValue = answer?.value ?? "";
    const isCorrect = Boolean(task.correctAnswer && answerValue === task.correctAnswer);
    const evidenceLabel = answer?.evidenceType === "typed_proxy" ? "Câu trả lời văn bản thay thế"
      : answer?.evidenceType === "transcript" ? "Bản chép lời từ hệ thống"
        : answer?.evidenceType === "audio" ? "Bản ghi âm" : null;
    const points = task.maxScore == null ? "" : ` (${formatScore(task.maxScore)}đ)`;
    return <article className="operator-answer-row" key={audioKey}>
      {objective ? <p className="operator-answer-question"><b>{itemLabel}{normalizeBlankPrompt(task.prompt)}</b><span className="muted">{points}</span></p> : <>{showTitle && task.title ? <p className="operator-answer-task-title"><b>{task.title}</b></p> : null}{task.prompt ? <p className="operator-answer-question"><b>{itemLabel}{normalizeBlankPrompt(task.prompt)}</b></p> : null}</>}
      {objective ? <p className="operator-answer-result">{answerValue ? <><span className={isCorrect ? "operator-answer-correct" : task.correctAnswer ? "operator-answer-wrong" : ""}>{answerText(task, answerValue)}</span>{task.correctAnswer && !isCorrect ? <> <span className="operator-answer-arrow">→</span> {answerText(task, task.correctAnswer)}</> : null}</> : <>{learnerView ? "Chưa trả lời" : "bỏ qua"}{task.correctAnswer ? <> <span className="operator-answer-arrow">→</span> {answerText(task, task.correctAnswer)}</> : null}</>}</p> : <div className="operator-answer-response">
        {evidenceLabel ? <div className="xs muted"><b>{evidenceLabel}</b></div> : null}
        {!answer?.audioArtifact ? answerValue ? <p className="operator-answer-value">{answerValue}</p> : <p className="operator-answer-value muted">{section === "writing" ? "(không có bài viết)" : "(không có lời chép)"}</p> : null}
        {!learnerView && answer?.evidenceType === "typed_proxy" ? <div className="banner warn" role="alert"><div className="body small">Bằng chứng này phải chấm tay: văn bản thay thế không xác minh phát âm, độ trôi chảy hoặc tương tác theo thời gian thực.</div></div> : null}
        {answer?.audioArtifact && <>
          {!learnerView ? <div className="xs muted">File ghi âm: {answer.audioArtifact.artifactKey}</div> : null}
          <AudioEvidencePanel
            label={`audio ${answer.taskKey}`}
            evidence={{ ...answer.audioArtifact, ...(answerValue ? { transcript: answerValue } : {}) }}
            {...(onDeleteAudio && normalizeAudioEvidence(answer.audioArtifact)?.fileId ? { onDelete: onDeleteAudio } : {})}
          />
        </>}
        {!answer?.audioArtifact && section === "speaking" && <p className="operator-answer-audio-missing muted">(không có file ghi âm)</p>}
      </div>}
    </article>;
  };

  const renderSectionContent = (section: (typeof sectionOrder)[number]) => {
    const answers = answersFor(section);
    const tasks = tasksFor(section);
    const score = scoreFor(section);
    const items = tasks.length
      ? tasks.map(task => ({ task, answer: answers.find(answer => answer.taskKey === task.taskKey) }))
      : answers.map(answer => ({ task: { taskKey: answer.taskKey, ...(answer.title ? { title: answer.title } : {}), prompt: answer.prompt ?? "" }, answer }));
    const groups = score?.groups ?? [];
    const groupedKeys = new Set(groups.flatMap(group => group.tasks.map(task => task.taskKey)));
    const ungrouped = items.filter(({ task }) => !groupedKeys.has(task.taskKey));
    let numberOffset = 0;
    if (!items.length && !groups.length) return <p className="small muted operator-answer-empty">Chưa có task hoặc câu trả lời được lưu cho phần này.</p>;
    // A stored section score with no per-question answer matching this form's tasks
    // (e.g. imported/fixture totals) must not read as "every question skipped, 0 points".
    const knownTaskKeys = new Set([...items.map(({ task }) => task.taskKey), ...groupedKeys]);
    const missingItemEvidence = (section === "listening" || section === "reading") && score?.score != null && Number(score.score) > 0
      && !answers.some(answer => knownTaskKeys.has(answer.taskKey));
    return <div className="operator-answer-section-content">
      {missingItemEvidence && <p className="small muted operator-answer-empty">Chưa có chi tiết từng câu cho phần này; điểm {sectionLabel(section)} là tổng đã lưu, không tính lại từ các câu bên dưới.</p>}
      {groups.map(group => {
        const groupMax = group.tasks.reduce((sum, task) => sum + (task.maxScore ?? 0), 0);
        const groupEarned = group.tasks.reduce((sum, task) => sum + (task.correctAnswer && answers.find(answer => answer.taskKey === task.taskKey)?.value === task.correctAnswer ? (task.maxScore ?? 0) : 0), 0);
        const start = numberOffset;
        numberOffset += group.tasks.length;
        const objective = section === "listening" || section === "reading";
        const groupLabel = section === "writing" && groupMax ? group.label.replace("phút ·", `phút · ${formatScore(groupMax)} điểm ·`) : group.label;
        const firstTask = group.tasks[0];
        const response = firstTask ? answers.find(answer => answer.taskKey === firstTask.taskKey)?.value ?? "" : "";
        const wordCount = response.trim() ? response.trim().split(/\s+/).length : 0;
        const wordInfo = section === "writing" && firstTask?.minWords != null && firstTask.maxWords != null ? ` (${wordCount} từ · yêu cầu ${firstTask.minWords}–${firstTask.maxWords})` : "";
        const body = <>
          {(section === "listening" || section === "reading") && renderStimulus(group.stimulus)}
          {(section === "listening" || section === "reading") && group.instruction && <p className="small muted operator-answer-instruction">{group.instruction}</p>}
          <div className="operator-answer-rows">{group.tasks.map((task, index) => {
            const itemLabel = objective ? `${start + index + 1}. ` : section === "speaking" && group.key === "S3" ? `Câu ${index + 1}. ` : "";
            return renderAnswer(section, task, answers.find(answer => answer.taskKey === task.taskKey), false, itemLabel);
          })}</div>
        </>;
        return objective ? <details className="operator-answer-group-details" key={group.key}>
          <summary className="operator-answer-group-heading"><b id={`operator-group-${section}-${group.key}`}>{groupLabel}{groupMax && !learnerView ? ` · ${formatScoreOutOf(groupEarned, groupMax)} điểm` : ""}</b></summary>
          {body}
        </details> : <section className="operator-answer-group-details operator-answer-group-static" key={group.key} aria-labelledby={`operator-group-${section}-${group.key}`}>
          <div className="operator-answer-group-heading"><b id={`operator-group-${section}-${group.key}`}>{groupLabel}</b>{wordInfo && <span className="muted">{wordInfo}</span>}</div>
          {body}
        </section>;
      })}
      {ungrouped.length ? <div className="operator-answer-rows">{ungrouped.map(({ task, answer }, index) => renderAnswer(section, task, answer, true, `${numberOffset + index + 1}. `))}</div> : null}
    </div>;
  };

  const renderAssessmentSection = (section: (typeof sectionOrder)[number]) => {
    const score = scoreFor(section);
    return <details className="operator-answer-section" data-assessment-section={section} key={section} aria-labelledby={`operator-evidence-${section}`} open={!learnerView && (section === "listening" || section === "reading")}>
      <summary className="operator-answer-section-summary"><b id={`operator-evidence-${section}`}>{sectionLabel(section)} · {learnerView && score?.score == null ? "Chờ chấm" : formatScoreOutOf(score?.score ?? 0, score?.maxScore ?? (section === "reading" ? 40 : 20))}</b></summary>
      {renderSectionContent(section)}
    </details>;
  };

  const durationLabel = (actual: number | null | undefined, limit: number | null | undefined) => {
    if (actual == null) return limit ? `Giới hạn ${limit} phút` : null;
    return limit ? `${formatDuration(actual)} / ${limit} phút` : formatDuration(actual);
  };
  const scoreRows = [
    ...sectionOrder.map(section => {
      const score = scoreFor(section);
      const source = score?.source === "human" ? <Badge tone="primary">Chấm tay</Badge>
        : score?.source === "ai" ? <Badge tone="primary">AI chấm</Badge>
        : score?.source === "deterministic" ? "Tự động" : null;
      return {
        label: sectionLabel(section),
        points: score?.score == null ? "Chờ chấm" : formatScoreOutOf(score.score, score.maxScore),
        source,
        level: score?.cefr ? <LevelChip level={score.cefr as Cefr} /> : null,
        duration: durationLabel(score?.actualSeconds, score?.durationMinutes),
        total: false
      };
    }),
    {
      label: "Tổng",
      points: detail.totalScore == null ? "Chờ đủ 4 kỹ năng" : formatScoreOutOf(detail.totalScore, 100),
      source: null,
      level: detail.overallCefr ? <LevelChip level={detail.overallCefr as Cefr} /> : null,
      duration: durationLabel(detail.totalTimeSeconds, detail.totalTimeLimitMinutes),
      total: true
    }
  ];

  return <div className="modal-backdrop operator-modal-scope operator-detail-modal" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className={`dialog wide operator-detail-dialog operator-assessment-dialog${learnerView ? " learner-original-placement-dialog" : ""}`} role="dialog" aria-modal="true" aria-label={learnerView ? "Bài đầu vào đã nộp" : `Chi tiết bài test của ${detail.learnerName}`} tabIndex={-1}>
    <div className="row between"><div><h3 id="operator-review-detail-title">{learnerView ? "Bài đầu vào đã nộp" : `Bài test · ${detail.learnerName}`}</h3><p className="small muted">{learnerView ? null : <>{detail.title} · </>}{assessmentStatusLabels[detail.status] ?? detail.status}{detail.submittedAt ? <> · Nộp {operatorDateTime(detail.submittedAt)}</> : null}{learnerView ? null : <> · Bắt đầu {operatorDateTime(detail.startedAt)}</>} · Tổng điểm: {detail.totalScore == null ? "Chờ đủ 4 kỹ năng" : formatScoreOutOf(detail.totalScore, 100)}</p></div><ModalCloseButton onClick={onClose} /></div>
    <div ref={scroll.start} className="app-scroll-edge" aria-hidden="true" />
    {learnerFeedback ? <p className="operator-answer-value"><b>Phản hồi của Vận hành</b><br />{learnerFeedback}</p> : null}
    {!learnerView ? <h4>Điểm theo 4 kỹ năng</h4> : null}
    {learnerView ? null : compact ? <ul className="operator-skill-scores" aria-label="Điểm theo 4 kỹ năng">
      {scoreRows.map(row => <li key={row.label} className={row.total ? "operator-total-row" : undefined}>
        <div className="operator-skill-score-head"><b>{row.label}</b><b>{row.points}</b></div>
        <div className="operator-skill-score-meta">
          {row.source}
          {row.level}
          {row.duration ? <span className="small muted">{row.duration}</span> : null}
        </div>
      </li>)}
    </ul> : <div className="table-wrap">
      <table>
        <thead><tr><th>Kỹ năng</th><th>Điểm</th><th>Nguồn</th><th>CEFR</th><th>Thời gian làm</th></tr></thead>
        <tbody>{scoreRows.map(row => row.total
          ? <tr className="operator-total-row" key={row.label}><th>{row.label}</th><th>{row.points}</th><th>—</th><th>{row.level ?? "—"}</th><th>{row.duration ?? "—"}</th></tr>
          : <tr key={row.label}><td>{row.label}</td><td>{row.points}</td><td>{row.source ?? "—"}</td><td>{row.level ?? "—"}</td><td>{row.duration ?? "—"}</td></tr>
        )}</tbody>
      </table>
    </div>}
    {onRescore && <div className="row">
      <button className="btn-sm" type="button" disabled={rescoring || savingManualScore} onClick={onRescore}>{rescoring ? "Đang chấm lại…" : "Chấm lại bằng AI"}</button>
      {detail.aiScoring?.status === "failed" && <span className="small muted">Lần chấm AI gần nhất thất bại. Có thể chấm tay.</span>}
    </div>}
    {!learnerView ? <div className="operator-log-group">
      <details className="operator-processing-log"><summary className="small">Nhật ký xử lý ({detail.activity?.length ?? 0})</summary>{detail.activity?.length ? <ul className="small">{detail.activity.map((event, index) => <li key={`${event.at}-${index}`}><b>{event.label}</b> · {operatorDateTime(event.at)}{event.detail ? <span className="muted"> · {event.detail}</span> : null}</li>)}</ul> : <p className="small muted">Chưa có hoạt động xử lý được ghi nhận.</p>}</details>
      <details className="operator-integrity-log"><summary className="small">Nhật ký cảnh báo ({detail.integrityEvents.length})</summary>{detail.integrityEvents.length ? <ul className="small">{detail.integrityEvents.map((event, index) => { const item = integrityEventText(event); return <li key={index}><b>{item.label}</b>{item.count !== undefined ? ` · Lần ghi nhận ${item.count}` : ""}{item.at ? ` · ${item.at}` : ""}</li>; })}</ul> : <p className="small muted">Không có cảnh báo được ghi nhận.</p>}</details>
    </div> : null}
    <h4 className="operator-detail-section-title">Bài làm và bằng chứng</h4>
    <section className="operator-assessment-document" aria-label="Bài làm và bằng chứng"><div className="operator-answer-sections">
      {renderAssessmentSection("listening")}
      {renderAssessmentSection("reading")}
      {onSaveManualScore && monthlyRubric?.length ? <AssessmentMonthlyRubricScore rubric={monthlyRubric} saved={monthlyScores} comment={comment} onSave={onSaveManualScore} saving={savingManualScore} writingContent={renderSectionContent("writing")} speakingContent={renderSectionContent("speaking")} />
        : onSaveManualScore && detail.kind !== "final" ? <AssessmentManualScore writingTasks={manualTasks("writing") as ManualScoreInput["writingTasks"]} speakingTasks={manualTasks("speaking") as ManualScoreInput["speakingTasks"]} comment={comment} onSave={onSaveManualScore} saving={savingManualScore} writingContent={renderSectionContent("writing")} speakingContent={renderSectionContent("speaking")} {...(detail.kind === "pass_course" && detail.productiveRubric ? { passCourseRubric: detail.productiveRubric } : {})} {...(scoreFor("writing")?.score !== undefined ? { writingScore: scoreFor("writing")!.score } : {})} {...(scoreFor("speaking")?.score !== undefined ? { speakingScore: scoreFor("speaking")!.score } : {})} /> : <>{renderAssessmentSection("writing")}{renderAssessmentSection("speaking")}</>}
    </div></section>
    {detail.decision && <div className="banner info"><div className="body small">Quyết định: {detail.decision.status} · {detail.decision.approvedLevel ?? "—"} · {detail.decision.reason}</div></div>}
    {detail.appeal && <div className="banner warn"><div className="body small">Kháng nghị: {detail.appeal.status} · {detail.appeal.reason}{detail.appeal.resolution ? ` · ${detail.appeal.resolution}` : ""}</div></div>}
    <div ref={scroll.end} className="app-scroll-edge" aria-hidden="true" />
    {scroll.visible && <ScrollJumpButton atTop={scroll.atTop} onClick={scroll.jump} inExam />}
  </section></div>;
}
