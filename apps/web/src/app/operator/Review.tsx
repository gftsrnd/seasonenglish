import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Badge, Button, Empty, LevelChip, OperatorPage, PageTitle, Rubric, Suggestions } from "./primitives.js";
import type { Cefr, OperatorReviewActions, OperatorReviewView, ReviewActionKey, ReviewAppeal, ReviewSubmission, ReviewTab, ReviewWeeklyPractice } from "./types.js";
import type { ContentReviewAssessmentDetailView } from "@e4s/contracts";
import { operatorDateTime } from "./adapters.js";
import { AssessmentManualScore, type ManualScoreInput } from "./AssessmentManualScore.js";
import { AudioEvidencePanel } from "../shared/media/AudioEvidencePanel.js";
import { normalizeAudioEvidence, type AudioEvidence } from "../shared/media/audio-evidence.js";

const TABS: Array<[ReviewTab, string]> = [["weekly", "Bài cuối tuần"], ["subs", "Bài nộp"], ["coach", "Phản hồi coach"], ["appeals", "Kháng nghị"], ["attempts", "Số lần làm bài"], ["tests", "Bài test"]];
const focusableSelector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), audio[controls], [href], [tabindex]:not([tabindex='-1'])";
const cefrOrder: Record<Cefr, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };

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
  return reason instanceof Error && reason.message.trim() ? reason.message : "Không hoàn tất thao tác. Hãy thử lại.";
}

function SubmissionReviewCard({
  item, aiConnected, readOnly, manualGradeBlocked, gradeAiBusy, gradeAiBlocked, onGradeAi, onGradeManual, onMarkChecked, onDeleteAudio
}: {
  item: ReviewSubmission;
  aiConnected: boolean;
  readOnly: boolean;
  manualGradeBlocked?: string;
  gradeAiBusy: boolean;
  gradeAiBlocked?: string;
  onGradeAi(): void;
  onGradeManual(input: { meaning: number; vocabulary: number; grammar: number; feedback: string }): void;
  onMarkChecked(checked: boolean): void;
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
    <div className="row between operator-card-header"><div><b>{item.learnerName}</b> {item.cefr && <LevelChip level={item.cefr} />} <span className="xs muted">Tuần {item.week} · {item.type ? (item.type === "dialogue" ? "Hội thoại" : "Viết") : "—"} · {item.submittedAt}</span></div><label className="small"><input type="checkbox" checked={item.operatorChecked} disabled={readOnly} onChange={event => onMarkChecked(event.target.checked)} style={{ width: "auto" }} /> Đã xem bài</label></div>
    <div className="operator-submission-brief">
      <section><b className="operator-review-field-label">Đề bài</b><p>{item.task || "—"}</p></section>
      <section><b className="operator-review-field-label">Hướng dẫn</b><p>{item.guidance || "—"}</p></section>
      <section><b className="operator-review-field-label">Từ bắt buộc</b><p>{item.requiredVocabulary?.length ? item.requiredVocabulary.join(", ") : "—"}</p></section>
      <section className="operator-submission-answer"><b className="operator-review-field-label">Bài làm của học viên</b><p>{item.text}</p>{item.audioArtifact ? <AudioEvidencePanel label={`Bản ghi âm bài nộp của ${item.learnerName}`} evidence={{ ...item.audioArtifact, transcript: item.audioArtifact.transcript ?? item.text }} {...(onDeleteAudio ? { onDelete: onDeleteAudio } : {})} /> : null}</section>
    </div>
    {item.total != null ? <div className="operator-submission-result"><div className="row"><b>{item.total}/100</b><Rubric value={item.rubric} />{item.aiGraded ? <Badge>AI chấm</Badge> : <Badge>Người chấm</Badge>}</div>{item.feedback ? <p className="small">{item.feedback}</p> : null}<Suggestions items={item.suggestions} /></div> : <div className="operator-submission-status-row"><Badge tone="warn">Chưa chấm</Badge></div>}
    <div className="operator-submission-grader" aria-label={`Chấm bài của ${item.learnerName}`}>
      <div className="operator-submission-score-grid">{scoreInput("Đúng ý", meaning, setMeaning)}{scoreInput("Từ vựng", vocabulary, setVocabulary)}{scoreInput("Ngữ pháp", grammar, setGrammar)}</div>
      <label className="operator-submission-feedback"><span>Nhận xét</span><textarea aria-label="Nhận xét" rows={3} value={feedback} disabled={readOnly} onChange={event => setFeedback(event.target.value)} placeholder="Nhập nhận xét gửi học viên…" /></label>
      <div className="row operator-review-action-footer">{aiConnected ? <Button small busy={gradeAiBusy} disabled={readOnly || Boolean(gradeAiBlocked)} title={gradeAiBlocked} onClick={onGradeAi}>{gradeAiBusy ? "Đang chấm bằng AI…" : item.total == null ? "Chấm bằng AI" : "Chấm lại bằng AI"}</Button> : null}<Button primary small disabled={readOnly || Boolean(manualGradeBlocked) || !valid} title={manualGradeBlocked} onClick={() => onGradeManual({ meaning, vocabulary, grammar, feedback: feedback.trim() })}>Lưu kết quả chấm</Button></div>
    </div>
  </div>;
}

const appealPartLabels: Record<string, string> = {
  listening: "Nghe", reading: "Đọc", writing: "Viết", word_class: "Từ loại", word_use: "Dùng từ", speaking: "Nói"
};

function appealPartLabel(part?: string) {
  return part ? appealPartLabels[part] ?? part : "Bài kiểm tra";
}

function AppealReviewCard({ item, readOnly, blockedMessage, busy, itemBusy, onDecision }: {
  item: ReviewAppeal;
  readOnly: boolean;
  blockedMessage?: string;
  busy(decision: boolean): boolean;
  itemBusy: boolean;
  onDecision(decision: boolean): void;
}) {
  const partLabel = appealPartLabel(item.part);
  const title = item.title || (item.kind === "sub" ? "Bài nộp cuối tuần" : "Bài kiểm tra đầu vào/lên mức");
  const statusLabel = item.statusLabel || (item.status === "pending" ? "Chờ xử lý" : item.status === "accepted" ? "Đã chấp nhận" : "Giữ nguyên");
  return <article className={`operator-review-appeal operator-review-appeal-${item.status}`} aria-label={`Kháng nghị phần ${partLabel} của ${item.learnerName}`}>
    <header className="operator-review-appeal-header">
      <div className="operator-review-appeal-heading">
        <div className="row operator-review-appeal-badges">{item.cefr && <LevelChip level={item.cefr} />}<Badge>{item.kind === "part" ? `Phần ${partLabel}` : item.kind === "sub" ? "Bài cuối tuần" : "Bài kiểm tra"}</Badge></div>
        <h3>{title}</h3>
        <p className="xs muted">{item.at}{item.kind === "part" ? ` · ${item.attempts ?? 0} lượt làm` : ""}</p>
      </div>
      <Badge tone={item.status === "pending" ? "warn" : item.status === "accepted" ? "ok" : "danger"}>{statusLabel}</Badge>
    </header>
    {item.question ? <section className="operator-review-appeal-block"><b className="operator-review-field-label">Đề bài</b><p>{item.question}</p>{item.options?.length ? <div className="operator-review-appeal-options">{item.options.map((option, index) => <span key={`${item.id}-option-${index}`}>{option}</span>)}</div> : null}</section> : null}
    {item.answer ? <section className="operator-review-appeal-block operator-review-learner-answer"><b className="operator-review-field-label">Bài làm của học viên</b><p>{item.answer}</p></section> : null}
    {(item.key || item.aiFeedback) ? <div className="operator-review-appeal-comparison">{item.key ? <section><b className="operator-review-field-label">Đáp án tham khảo</b><p>{item.key}</p></section> : null}{item.aiFeedback ? <section><b className="operator-review-field-label">Nhận xét trước đó</b><p>{item.aiFeedback}</p></section> : null}</div> : null}
    <section className="operator-review-appeal-reason"><b className="operator-review-field-label">Lý do kháng nghị</b><p>{item.reason}</p></section>
    {item.status === "pending" ? <footer className="row operator-review-action-footer"><Button primary small busy={busy(true)} disabled={readOnly || Boolean(blockedMessage) || itemBusy} title={blockedMessage} onClick={() => onDecision(true)}>{busy(true) ? "Đang xử lý…" : "Chấp nhận kháng nghị"}</Button><Button small busy={busy(false)} disabled={readOnly || Boolean(blockedMessage) || itemBusy} title={blockedMessage} onClick={() => onDecision(false)}>{busy(false) ? "Đang xử lý…" : "Giữ nguyên kết quả"}</Button></footer> : item.decidedSummary ? <p className="xs muted operator-review-appeal-resolution">{item.decidedSummary}</p> : null}
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

export function WeeklyPracticeEditor({ item, readOnly, onSave }: { item: ReviewWeeklyPractice; readOnly: boolean; onSave: NonNullable<OperatorReviewActions["onSaveWeeklyPractice"]> }) {
  const [task, setTask] = useState(item.task);
  const [guidance, setGuidance] = useState(item.guidance);
  const [vocabulary, setVocabulary] = useState(item.requiredVocabulary.join(", "));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const savingRef = useRef(false);
  const lastSaveAttemptRef = useRef(0);
  const generationRef = useRef(0);
  const requiredVocabulary = [...new Set(vocabulary.split(/[\n,]+/u).map(value => value.trim()).filter(Boolean))];
  const context = `Tuần ${item.week} · ${item.cefr}`;
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
    <div className="row between operator-card-header"><div><b>Tuần {item.week} · {item.topic}</b><div className="xs muted"><LevelChip level={item.cefr} /> · v{item.version} · {item.status === "approved" ? "Đã duyệt" : item.status === "review" ? "Chờ duyệt" : "Bản nháp"}</div></div><Button small aria-label={`Sinh bài cuối tuần · ${context}`} disabled={readOnly || saving} onClick={generate}>Sinh bài cuối tuần</Button></div>
    <label className="small">Đề bài<textarea aria-label={`Đề bài · ${context}`} value={task} disabled={readOnly || saving} onChange={event => setTask(event.target.value)} /></label>
    <label className="small">Hướng dẫn<textarea aria-label={`Hướng dẫn · ${context}`} value={guidance} disabled={readOnly || saving} onChange={event => setGuidance(event.target.value)} /></label>
    <label className="small">Từ bắt buộc<input aria-label={`Từ bắt buộc · ${context}`} value={vocabulary} disabled={readOnly || saving} onChange={event => setVocabulary(event.target.value)} /></label>
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

export function OperatorReview({ view, actions, readOnly = false, unavailable = {} }: { view: OperatorReviewView; actions: OperatorReviewActions; readOnly?: boolean; unavailable?: Partial<Record<ReviewActionKey, string>> }) {
  const blocked = (key: ReviewActionKey) => unavailable[key];
  const [pending, setPending] = useState<PendingReviewAction>();
  const [actionError, setActionError] = useState<ReviewActionError>();

  const isBusy = (key: ReviewActionKey, id: string, decision?: boolean) => pending?.key === key && pending.id === id && (decision === undefined || pending.decision === decision);
  const isSameItemBusy = (key: ReviewActionKey, id: string) => pending?.key === key && pending.id === id;

  useEffect(() => {
    if (!pending) return;
    let completed = false;
    if (pending.key === "checkSubmission") completed = view.submissions.find(item => item.id === pending.id)?.operatorChecked === pending.expected;
    if (pending.key === "checkCoach") completed = view.coachTurns.find(item => item.id === pending.id)?.checked === pending.expected;
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
    if (view.activeTab === "subs") return view.submissions.length ? <div className="operator-review-card-list">{groupReviewItemsByLearner(view.submissions).map(group => <details className="card operator-review-learner-group" key={group.learnerName}><summary><b>{group.learnerName}</b><span className="xs muted">{group.items.length} bài · {group.items.filter(item => !item.operatorChecked).length} chưa xem · {group.items.filter(item => item.total == null).length} chưa chấm</span></summary><div className="operator-review-group-items">{group.items.map(item => <SubmissionReviewCard key={item.id} item={item} aiConnected={Boolean(view.aiConnected)} readOnly={readOnly} {...(blocked("gradeManual") ? { manualGradeBlocked: blocked("gradeManual") } : {})} gradeAiBusy={isBusy("gradeAi", item.id)} {...(blocked("gradeAi") ? { gradeAiBlocked: blocked("gradeAi") } : {})} onGradeAi={() => runAction({ key: "gradeAi", id: item.id }, () => actions.onGradeAi(item.id))} onGradeManual={input => actions.onGradeManual(item.id, input)} onMarkChecked={checked => runAction({ key: "checkSubmission", id: item.id, expected: checked }, () => actions.onMarkSubmission(item.id, checked))} {...(actions.onDeleteAudio ? { onDeleteAudio: actions.onDeleteAudio } : {})} />)}</div></details>)}</div> : <Empty>Chưa có bài nộp.</Empty>;

    if (view.activeTab === "coach") return view.coachTurns.length ? <div className="card operator-review-panel"><p className="small muted operator-review-intro">Đọc mẫu phản hồi AI coach; kiểm tra lệch mức, lỗi hoặc khen quá tay rồi sửa prompt nếu cần.</p><div className="operator-coach-list">{groupReviewItemsByLearner(view.coachTurns).map(group => <details className="operator-review-learner-group" key={group.learnerName}><summary><b>{group.learnerName}</b><span className="xs muted">{group.items.length} phản hồi · {group.items.filter(item => !item.checked).length} chưa kiểm</span></summary><div className="operator-review-group-items">{group.items.map(item => <div className="item" key={item.id}><div className="body small"><div className="row between operator-review-item-heading"><span>{item.cefr && <LevelChip level={item.cefr} />} <span className="xs muted">{item.week ? `Tuần ${item.week} · ` : ""}{item.at}</span></span><label className="xs"><input type="checkbox" checked={item.checked} disabled={readOnly || Boolean(blocked("checkCoach")) || isSameItemBusy("checkCoach", item.id)} aria-busy={isBusy("checkCoach", item.id) || undefined} onChange={event => runAction({ key: "checkCoach", id: item.id, expected: event.target.checked }, () => actions.onMarkCoachTurn(item.id, event.target.checked))} style={{ width: "auto" }} /> Đã kiểm</label></div><div className="operator-review-copy"><span className="muted">Học viên:</span> {item.userText}</div><div className="operator-review-copy"><span className="muted">Coach:</span> {item.reply}</div>{item.audioArtifact ? <AudioEvidencePanel label={`Bản ghi âm Season của ${item.learnerName}`} evidence={{ ...item.audioArtifact, transcript: item.audioArtifact.transcript ?? item.userText }} {...(actions.onDeleteAudio ? { onDelete: actions.onDeleteAudio } : {})} /> : null}<Rubric value={item.rubric} /><Suggestions items={item.suggestions} /></div></div>)}</div></details>)}</div></div> : <Empty>Chưa có lượt luyện nào.</Empty>;

    if (view.activeTab === "weekly") return view.weeklyPractices.length ? <div className="operator-review-card-list">{[...view.weeklyPractices].sort((left, right) => left.week - right.week || cefrOrder[left.cefr] - cefrOrder[right.cefr] || left.id.localeCompare(right.id)).map(item => <WeeklyPracticeEditor key={item.id} item={item} readOnly={readOnly || !actions.onSaveWeeklyPractice} onSave={actions.onSaveWeeklyPractice ?? (() => undefined)} />)}</div> : <Empty>Chưa có bộ bài tuần để soạn bài cuối tuần.</Empty>;

    if (view.activeTab === "appeals") return view.appeals.length ? <div className="operator-review-card-list">{groupReviewItemsByLearner(view.appeals).map(group => <details className="card operator-review-learner-group" open key={group.learnerName}><summary><b>{group.learnerName}</b><span className="xs muted">{group.items.length} kháng nghị · {group.items.filter(item => item.status === "pending").length} chờ xử lý</span></summary><div className="operator-review-group-items">{group.items.map(item => <AppealReviewCard key={item.id} item={item} readOnly={readOnly} {...(blocked("decideAppeal") ? { blockedMessage: blocked("decideAppeal") } : {})} busy={decision => isBusy("decideAppeal", item.id, decision)} itemBusy={isSameItemBusy("decideAppeal", item.id)} onDecision={decision => runAction({ key: "decideAppeal", id: item.id, decision }, () => actions.onDecideAppeal(item.id, decision))} />)}</div></details>)}</div> : <Empty>Chưa có kháng nghị nào. Học viên bấm “Báo cáo: AI chấm sai” ở bài tập hoặc bài tuần thì yêu cầu hiện ở đây.</Empty>;

    if (view.activeTab === "attempts") return view.attempts.length ? <div className="card"><p className="small muted operator-status-legend">Mỗi phần tối đa 3 lượt: <span><Check className="operator-inline-icon" size={14} strokeWidth={2.5} aria-hidden="true" /> đúng</span>, <span><X className="operator-inline-icon" size={14} strokeWidth={2.5} aria-hidden="true" /> hết lượt vẫn sai/đã hiện đáp án</span>, … đang làm.</p><div className="operator-attempt-learner-list">{groupAttemptsByLearner(view.attempts).map(group => { const first = group.items[0]!; const total = group.items.reduce((sum, item) => sum + item.total, 0); return <details className="operator-review-learner-group" data-testid="attempt-learner-group" key={group.learnerId}><summary><span><b>{first.learnerName}</b> {first.cefr && <LevelChip level={first.cefr} />}</span><span className="xs muted">{group.items.length} bài · {total} lượt</span></summary><div className="table-wrap"><table><thead><tr><th>Bài</th><th>Nghe</th><th>Đọc</th><th>Viết</th><th>Nói</th><th>Tổng lần</th></tr></thead><tbody>{group.items.map(item => <tr key={item.id}><td className="small">{item.lesson}</td><td>{item.listening}</td><td>{item.reading}</td><td>{item.writing}</td><td>{item.speaking}</td><td><b>{item.total}</b></td></tr>)}</tbody></table></div></details>; })}</div></div> : <Empty>Chưa có học viên nào làm bài thực hành.</Empty>;

    return view.tests.length ? <div className="card"><div className="table-wrap operator-action-table-wrap"><table className="operator-action-table"><thead><tr><th>Người học</th><th>Loại</th><th>Nộp</th><th>Tổng</th><th>Mức thô</th><th>AI</th><th aria-label="Thao tác" /></tr></thead><tbody>{view.tests.map(item => <tr key={item.id}><td data-label="Người học">{item.learnerName}</td><td data-label="Loại">{item.kind === "placement" ? "Đầu vào" : "Lên mức"}</td><td data-label="Nộp">{item.submittedAt || "—"}</td><td data-label="Tổng">{item.total ?? "—"}</td><td data-label="Mức thô">{item.rawLevel || "—"}</td><td data-label="AI">{item.aiSuggestedCefr || "—"}</td><td data-label="Thao tác"><Button small disabled={Boolean(blocked("viewTest"))} title={blocked("viewTest")} onClick={() => actions.onViewTest(item.id)}>Xem</Button></td></tr>)}</tbody></table></div></div> : <Empty>Chưa có bài test.</Empty>;
  };

  return <OperatorPage title="Đọc mẫu"><PageTitle><h1>Đọc mẫu & kiểm tra AI</h1><p className="muted">Kiểm tra bài nộp thứ Sáu, phản hồi của AI coach và các bài test.</p></PageTitle>{actionError && <div className="banner danger" role="alert" style={{ marginBottom: 12 }}><div className="body small">{actionError.message}</div></div>}<div className="tabs operator-review-tabs" role="tablist" aria-label="Nhóm nội dung cần kiểm tra">{TABS.map(([key, label]) => <button type="button" role="tab" aria-selected={view.activeTab === key} className={view.activeTab === key ? "active" : ""} key={key} onClick={() => actions.onTabChange(key)}>{key === "attempts" ? label : `${label} (${view.counts[key]}${key === "subs" ? " chưa đọc" : ""})`}</button>)}</div>{body()}</OperatorPage>;
}

export function OperatorReviewAssessmentDetail({ detail, onClose, onSaveManualScore, savingManualScore = false, onDeleteAudio }: { detail: ContentReviewAssessmentDetailView; onClose(): void; onSaveManualScore?: (input: ManualScoreInput) => void; savingManualScore?: boolean; onDeleteAudio?: (evidence: AudioEvidence) => void | Promise<void> }) {
  const dialogRef = useRef<HTMLElement>(null);
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
  const statusLabels: Record<string, string> = { submitted: "Đã nộp", pending_review: "Chờ duyệt", approved: "Đã duyệt", in_progress: "Đang làm", retry: "Cần làm lại" };
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
  type ReviewTask = { taskKey: string; title?: string; prompt?: string; maxScore?: number; minWords?: number; maxWords?: number; options?: Array<{ value: string; label: string }>; correctAnswer?: string | null };
  const renderStimulus = (stimulus: { type: string; text?: string; lines?: Array<{ speaker: string; text: string }>; headers?: string[]; rows?: string[][] } | undefined) => {
    if (!stimulus) return null;
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
    const points = task.maxScore == null ? "" : ` (${task.maxScore}đ)`;
    return <article className="operator-answer-row" key={audioKey}>
      {objective ? <p className="operator-answer-question"><b>{itemLabel}{task.prompt}</b><span className="muted">{points}</span></p> : <>{showTitle && task.title ? <p className="operator-answer-task-title"><b>{task.title}</b></p> : null}{task.prompt ? <p className="operator-answer-question"><b>{itemLabel}{task.prompt}</b></p> : null}</>}
      {objective ? <p className="operator-answer-result">{answerValue ? <><span className={isCorrect ? "operator-answer-correct" : task.correctAnswer ? "operator-answer-wrong" : ""}>{answerText(task, answerValue)}</span>{task.correctAnswer && !isCorrect ? <> <span className="operator-answer-arrow">→</span> {answerText(task, task.correctAnswer)}</> : null}</> : <>bỏ qua{task.correctAnswer ? <> <span className="operator-answer-arrow">→</span> {answerText(task, task.correctAnswer)}</> : null}</>}</p> : <div className="operator-answer-response">
        {evidenceLabel ? <div className="xs muted"><b>{evidenceLabel}</b></div> : null}
        {!answer?.audioArtifact ? answerValue ? <p className="operator-answer-value">{answerValue}</p> : <p className="operator-answer-value muted">{section === "writing" ? "(không có bài viết)" : "(không có lời chép)"}</p> : null}
        {answer?.evidenceType === "typed_proxy" ? <div className="banner warn" role="alert"><div className="body small">Bằng chứng này phải chấm tay: văn bản thay thế không xác minh phát âm, độ trôi chảy hoặc tương tác theo thời gian thực.</div></div> : null}
        {answer?.audioArtifact && <>
          <div className="xs muted">File ghi âm: {answer.audioArtifact.artifactKey}</div>
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
    return <div className="operator-answer-section-content">
      {groups.map(group => {
        const groupMax = group.tasks.reduce((sum, task) => sum + (task.maxScore ?? 0), 0);
        const groupEarned = group.tasks.reduce((sum, task) => sum + (task.correctAnswer && answers.find(answer => answer.taskKey === task.taskKey)?.value === task.correctAnswer ? (task.maxScore ?? 0) : 0), 0);
        const start = numberOffset;
        numberOffset += group.tasks.length;
        const objective = section === "listening" || section === "reading";
        const groupLabel = section === "writing" && groupMax ? group.label.replace("phút ·", `phút · ${groupMax} điểm ·`) : group.label;
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
          <summary className="operator-answer-group-heading"><b id={`operator-group-${section}-${group.key}`}>{groupLabel}{groupMax ? ` · ${groupEarned}/${groupMax} điểm` : ""}</b></summary>
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
    return <details className="operator-answer-section" data-assessment-section={section} key={section} aria-labelledby={`operator-evidence-${section}`} open={section === "listening" || section === "reading"}>
      <summary className="operator-answer-section-summary"><b id={`operator-evidence-${section}`}>{sectionLabel(section)} · {score?.score ?? 0}/{score?.maxScore ?? (section === "reading" ? 40 : 20)}</b></summary>
      {renderSectionContent(section)}
    </details>;
  };

  return <div className="modal-backdrop operator-modal-scope operator-detail-modal" role="presentation"><section ref={dialogRef} className="dialog wide operator-detail-dialog operator-assessment-dialog" role="dialog" aria-modal="true" aria-label={`Chi tiết bài test của ${detail.learnerName}`} tabIndex={-1}>
    <div className="row between"><div><h3 id="operator-review-detail-title">Bài test · {detail.learnerName}</h3><p className="small muted">{detail.title} · {statusLabels[detail.status] ?? detail.status} · Nộp {operatorDateTime(detail.submittedAt)} · Bắt đầu {operatorDateTime(detail.startedAt)} · Tổng điểm: {detail.totalScore == null ? "Chờ đủ 4 kỹ năng" : `${detail.totalScore}/100`}</p></div><button className="btn-sm" type="button" onClick={onClose}>Đóng</button></div>
    <h4>Điểm theo 4 kỹ năng</h4>
    <div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Kỹ năng</th><th>Điểm</th><th>Nguồn</th><th>CEFR</th><th>Thời gian làm</th></tr></thead><tbody>{sectionOrder.map(section => { const score = scoreFor(section); const sourceLabel = score?.source === "human" ? "Chấm tay" : score?.source === "ai" ? "AI chấm" : score?.source === "deterministic" ? "Tự động" : "—"; return <tr key={section}><td>{sectionLabel(section)}</td><td>{score?.score == null ? "Chờ chấm" : `${score.score}/${score.maxScore ?? "—"}`}</td><td>{score?.source === "human" || score?.source === "ai" ? <Badge tone="primary">{sourceLabel}</Badge> : sourceLabel}</td><td>{score?.cefr ? <LevelChip level={score.cefr as Cefr} /> : "—"}</td><td>{formatDuration(score?.actualSeconds)}{score?.durationMinutes ? <span className="xs muted"> / {score.durationMinutes} phút</span> : null}</td></tr>; })}<tr className="operator-total-row"><th>Tổng</th><th>{detail.totalScore == null ? "Chờ đủ 4 kỹ năng" : `${detail.totalScore}/100`}</th><th>—</th><th>{detail.overallCefr ? <LevelChip level={detail.overallCefr as Cefr} /> : "—"}</th><th>{formatDuration(detail.totalTimeSeconds)}{detail.totalTimeLimitMinutes ? ` / ${detail.totalTimeLimitMinutes} phút` : ""}</th></tr></tbody></table></div>
    <div className="operator-log-group">
      <details className="operator-processing-log"><summary className="small">Nhật ký xử lý ({detail.activity?.length ?? 0})</summary>{detail.activity?.length ? <ul className="small">{detail.activity.map((event, index) => <li key={`${event.at}-${index}`}><b>{event.label}</b> · {operatorDateTime(event.at)}{event.detail ? <span className="muted"> · {event.detail}</span> : null}</li>)}</ul> : <p className="small muted">Chưa có hoạt động xử lý được ghi nhận.</p>}</details>
      <details className="operator-integrity-log"><summary className="small">Nhật ký cảnh báo ({detail.integrityEvents.length})</summary>{detail.integrityEvents.length ? <ul className="small">{detail.integrityEvents.map((event, index) => { const item = integrityEventText(event); return <li key={index}><b>{item.label}</b>{item.count !== undefined ? ` · Lần ghi nhận ${item.count}` : ""}{item.at ? ` · ${item.at}` : ""}</li>; })}</ul> : <p className="small muted">Không có cảnh báo được ghi nhận.</p>}</details>
    </div>
    <h4 className="operator-detail-section-title">Bài làm và bằng chứng</h4>
    <section className="operator-assessment-document" aria-label="Bài làm và bằng chứng"><div className="operator-answer-sections">
      {renderAssessmentSection("listening")}
      {renderAssessmentSection("reading")}
      {onSaveManualScore ? <AssessmentManualScore writingTasks={manualTasks("writing") as ManualScoreInput["writingTasks"]} speakingTasks={manualTasks("speaking") as ManualScoreInput["speakingTasks"]} comment={typeof scoreFor("writing")?.criteria.comment === "string" ? scoreFor("writing")?.criteria.comment as string : ""} onSave={onSaveManualScore} saving={savingManualScore} writingContent={renderSectionContent("writing")} speakingContent={renderSectionContent("speaking")} {...(scoreFor("writing")?.score !== undefined ? { writingScore: scoreFor("writing")!.score } : {})} {...(scoreFor("speaking")?.score !== undefined ? { speakingScore: scoreFor("speaking")!.score } : {})} /> : <>{renderAssessmentSection("writing")}{renderAssessmentSection("speaking")}</>}
    </div></section>
    {detail.decision && <div className="banner info"><div className="body small">Quyết định: {detail.decision.status} · {detail.decision.approvedLevel ?? "—"} · {detail.decision.reason}</div></div>}
    {detail.appeal && <div className="banner warn"><div className="body small">Kháng nghị: {detail.appeal.status} · {detail.appeal.reason}{detail.appeal.resolution ? ` · ${detail.appeal.resolution}` : ""}</div></div>}
  </section></div>;
}
