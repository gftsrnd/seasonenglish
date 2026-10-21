import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Badge, Button, Empty, LevelChip, OperatorPage, PageTitle, Rubric, Suggestions } from "./primitives.js";
import type { Cefr, OperatorReviewActions, OperatorReviewView, ReviewActionKey, ReviewTab } from "./types.js";
import type { ContentReviewAssessmentDetailView } from "@e4s/contracts";
import { operatorDateTime } from "./adapters.js";
import { AssessmentManualScore, type ManualScoreInput } from "./AssessmentManualScore.js";

const TABS: Array<[ReviewTab, string]> = [["subs", "Bài nộp"], ["coach", "Phản hồi coach"], ["micro", "Bài siêu ngắn"], ["appeals", "Kháng nghị"], ["attempts", "Số lần làm bài"], ["tests", "Bài test"]];
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
  return reason instanceof Error && reason.message.trim() ? reason.message : "Không hoàn tất thao tác. Hãy thử lại.";
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
    if (pending.key === "deleteMicro") completed = !view.microLessons.some(item => item.id === pending.id);
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
    if (view.activeTab === "subs") return view.submissions.length ? <div className="operator-review-card-list">{view.submissions.map(item => <div className="card operator-review-card" key={item.id}>
      <div className="row between operator-card-header"><div><b>{item.learnerName}</b> {item.cefr && <LevelChip level={item.cefr} />} <span className="xs muted">Tuần {item.week} · {item.type ? (item.type === "dialogue" ? "Hội thoại" : "Viết") : "—"} · {item.submittedAt}</span></div><label className="small"><input type="checkbox" checked={item.operatorChecked} disabled={readOnly || Boolean(blocked("checkSubmission")) || isSameItemBusy("checkSubmission", item.id)} aria-busy={isBusy("checkSubmission", item.id) || undefined} onChange={event => runAction({ key: "checkSubmission", id: item.id, expected: event.target.checked }, () => actions.onMarkSubmission(item.id, event.target.checked))} style={{ width: "auto" }} /> Đã đọc mẫu</label></div>
      <p className="small muted" style={{ margin: "6px 0 2px" }}>Đề: {item.task || "—"}</p><div className="card soft small" style={{ whiteSpace: "pre-wrap" }}>{item.text}</div>
      {item.total != null ? <><div className="row" style={{ marginTop: 8 }}><b>{item.total}/100</b><Rubric value={item.rubric} />{!item.aiGraded && <Badge>chấm tay</Badge>}</div><p className="small" style={{ marginTop: 6 }}>{item.feedback}</p><Suggestions items={item.suggestions} /></> : <div className="row">
        <Badge tone="warn">Chưa chấm</Badge>{view.aiConnected && <Button small busy={isBusy("gradeAi", item.id)} disabled={readOnly || Boolean(blocked("gradeAi")) || isSameItemBusy("gradeAi", item.id)} title={blocked("gradeAi")} onClick={() => runAction({ key: "gradeAi", id: item.id }, () => actions.onGradeAi(item.id))}>{isBusy("gradeAi", item.id) ? "Đang chấm bằng AI…" : "Chấm bằng AI"}</Button>}
        <Button small disabled={readOnly || Boolean(blocked("gradeManual"))} title={blocked("gradeManual")} onClick={() => actions.onGradeManual(item.id)}>Chấm tay</Button>
      </div>}
    </div>)}</div> : <Empty>Chưa có bài nộp.</Empty>;

    if (view.activeTab === "coach") return view.coachTurns.length ? <div className="card operator-review-panel"><p className="small muted operator-review-intro">Đọc mẫu phản hồi AI coach; kiểm tra lệch mức, lỗi hoặc khen quá tay rồi sửa prompt nếu cần.</p><div className="operator-coach-list">{view.coachTurns.map(item => <div className="item" key={item.id}><div className="body small"><div className="row between operator-review-item-heading"><span><b>{item.learnerName}</b> {item.cefr && <LevelChip level={item.cefr} />} <span className="xs muted">{item.week ? `Tuần ${item.week} · ` : ""}{item.at}</span></span><label className="xs"><input type="checkbox" checked={item.checked} disabled={readOnly || Boolean(blocked("checkCoach")) || isSameItemBusy("checkCoach", item.id)} aria-busy={isBusy("checkCoach", item.id) || undefined} onChange={event => runAction({ key: "checkCoach", id: item.id, expected: event.target.checked }, () => actions.onMarkCoachTurn(item.id, event.target.checked))} style={{ width: "auto" }} /> Đã kiểm</label></div><div className="operator-review-copy"><span className="muted">Học viên:</span> {item.userText}</div><div className="operator-review-copy"><span className="muted">Coach:</span> {item.reply}</div><Rubric value={item.rubric} /><Suggestions items={item.suggestions} /></div></div>)}</div></div> : <Empty>Chưa có lượt luyện nào.</Empty>;

    if (view.activeTab === "micro") return view.microLessons.length ? <div className="card"><p className="small muted">Bài siêu ngắn do học viên tự tạo theo nghề và phong cách học. Kiểm tra lệch mức/sai nghĩa rồi xoá bài kém.</p><div className="list">{view.microLessons.map(item => <div className="item" key={item.id}><div className="body small"><div className="row between"><span><b>{item.learnerName || "—"}</b> <LevelChip level={item.cefr} /> <span className="xs muted">{item.date} · {item.topic}{item.completed ? " · đã học" : ""}</span></span><Button small danger busy={isBusy("deleteMicro", item.id)} disabled={readOnly || Boolean(blocked("deleteMicro")) || isSameItemBusy("deleteMicro", item.id)} title={blocked("deleteMicro")} onClick={() => runAction({ key: "deleteMicro", id: item.id }, () => actions.onDeleteMicroLesson(item.id))}>{isBusy("deleteMicro", item.id) ? "Đang xoá…" : "Xoá"}</Button></div><div><b>Lý thuyết:</b> {item.theory}</div><div><b>Từ:</b> {item.vocabulary}</div><div><b>Thực hành{item.practiceType ? ` (${item.practiceType})` : ""}:</b> {item.practiceText}{item.practiceAnswer && <span className="muted"> → {item.practiceAnswer}</span>}</div>{item.learnerAnswer && <div><b>Bài làm:</b> {item.learnerAnswer}{item.score != null && <Badge tone={item.scoreOk ? "ok" : "warn"}>{item.score}/10</Badge>}</div>}{(item.job || item.learningStyle) && <div className="xs muted">{[item.job, item.learningStyle].filter(Boolean).join(" · ")}</div>}</div></div>)}</div></div> : <Empty>Chưa có bài siêu ngắn nào.</Empty>;

    if (view.activeTab === "appeals") return view.appeals.length ? view.appeals.map(item => <div className="card" key={item.id} style={item.status === "pending" ? { background: "var(--butter)" } : undefined}><div className="row between"><div><b>{item.learnerName}</b> {item.cefr && <LevelChip level={item.cefr} />} <span className="xs muted">{[item.title, item.part, item.at].filter(Boolean).join(" · ")}{item.kind === "part" ? ` · đã làm ${item.attempts} lần` : ""}</span></div><Badge tone={item.status === "pending" ? "warn" : item.status === "accepted" ? "ok" : "danger"}>{item.statusLabel || (item.status === "pending" ? "Chờ xử lý" : item.status === "accepted" ? "Đã chấp nhận" : "Giữ nguyên")}</Badge></div>{item.question && <div className="small"><b>Đề:</b> {item.question}{item.options?.length ? <span className="muted"> ({item.options.join(" / ")})</span> : null}</div>}{item.answer && <div className="card soft small" style={{ whiteSpace: "pre-wrap" }}><b>Bài làm của học viên:</b> {item.answer}</div>}{(item.key || item.aiFeedback) && <div className="small">{item.key && <><b>Đáp án tham khảo:</b> {item.key} · </>}<b>AI nhận xét:</b> {item.aiFeedback || "(chấm theo đáp án, không có nhận xét)"}</div>}<div className="small"><b>Lý do học viên báo cáo:</b> {item.reason}</div>{item.status === "pending" ? <div className="row"><Button primary small busy={isBusy("decideAppeal", item.id, true)} disabled={readOnly || Boolean(blocked("decideAppeal")) || isSameItemBusy("decideAppeal", item.id)} title={blocked("decideAppeal")} onClick={() => runAction({ key: "decideAppeal", id: item.id, decision: true }, () => actions.onDecideAppeal(item.id, true))}>{isBusy("decideAppeal", item.id, true) ? "Đang xử lý…" : item.kind === "sub" ? "Chấp nhận – chấm lại điểm" : "Chấp nhận – tính là đúng"}</Button><Button small busy={isBusy("decideAppeal", item.id, false)} disabled={readOnly || Boolean(blocked("decideAppeal")) || isSameItemBusy("decideAppeal", item.id)} title={blocked("decideAppeal")} onClick={() => runAction({ key: "decideAppeal", id: item.id, decision: false }, () => actions.onDecideAppeal(item.id, false))}>{isBusy("decideAppeal", item.id, false) ? "Đang xử lý…" : "Giữ nguyên kết quả"}</Button></div> : item.decidedSummary && <div className="xs muted">{item.decidedSummary}</div>}</div>) : <Empty>Chưa có kháng nghị nào. Học viên bấm “Báo cáo: AI chấm sai” ở bài tập hoặc bài tuần thì yêu cầu hiện ở đây.</Empty>;

    if (view.activeTab === "attempts") return view.attempts.length ? <div className="card"><p className="small muted operator-status-legend">Mỗi phần tối đa 3 lượt: <span><Check className="operator-inline-icon" size={14} strokeWidth={2.5} aria-hidden="true" /> đúng</span>, <span><X className="operator-inline-icon" size={14} strokeWidth={2.5} aria-hidden="true" /> hết lượt vẫn sai/đã hiện đáp án</span>, … đang làm. Sắp theo phần hết lượt rồi tổng lượt.</p><div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Người học</th><th>Bài</th><th>Nghe</th><th>Đọc</th><th>Viết</th><th>Nói</th><th>Tổng lần</th></tr></thead><tbody>{view.attempts.map(item => <tr key={item.id}><td><b>{item.learnerName}</b> {item.cefr && <LevelChip level={item.cefr} />}</td><td className="small">{item.lesson}</td><td>{item.listening}</td><td>{item.reading}</td><td>{item.writing}</td><td>{item.speaking}</td><td><b>{item.total}</b></td></tr>)}</tbody></table></div></div> : <Empty>Chưa có học viên nào làm bài thực hành.</Empty>;

    return view.tests.length ? <div className="card"><div className="table-wrap operator-action-table-wrap"><table className="operator-action-table"><thead><tr><th>Người học</th><th>Loại</th><th>Nộp</th><th>Tổng</th><th>Mức thô</th><th>AI</th><th aria-label="Thao tác" /></tr></thead><tbody>{view.tests.map(item => <tr key={item.id}><td data-label="Người học">{item.learnerName}</td><td data-label="Loại">{item.kind === "placement" ? "Đầu vào" : item.kind === "level_up" ? "Lên mức" : "Cuối kỳ"}</td><td data-label="Nộp">{item.submittedAt || "—"}</td><td data-label="Tổng">{item.total ?? "—"}</td><td data-label="Mức thô">{item.rawLevel || "—"}</td><td data-label="AI">{item.aiSuggestedCefr || "—"}</td><td data-label="Thao tác"><Button small disabled={Boolean(blocked("viewTest"))} title={blocked("viewTest")} onClick={() => actions.onViewTest(item.id)}>Xem</Button></td></tr>)}</tbody></table></div></div> : <Empty>Chưa có bài test.</Empty>;
  };

  return <OperatorPage title="Đọc mẫu"><PageTitle><h1>Đọc mẫu & kiểm tra AI</h1><p className="muted">Kiểm tra bài nộp thứ Sáu, phản hồi của AI coach và các bài test.</p></PageTitle>{actionError && <div className="banner danger" role="alert" style={{ marginBottom: 12 }}><div className="body small">{actionError.message}</div></div>}<div className="tabs operator-review-tabs" role="tablist" aria-label="Nhóm nội dung cần kiểm tra">{TABS.map(([key, label]) => <button type="button" role="tab" aria-selected={view.activeTab === key} className={view.activeTab === key ? "active" : ""} key={key} onClick={() => actions.onTabChange(key)}>{key === "attempts" ? label : `${label} (${view.counts[key]}${key === "subs" ? " chưa đọc" : ""})`}</button>)}</div>{body()}</OperatorPage>;
}

export function OperatorReviewAssessmentDetail({ detail, onClose, onSaveManualScore, savingManualScore = false }: { detail: ContentReviewAssessmentDetailView; onClose(): void; onSaveManualScore?: (input: ManualScoreInput) => void; savingManualScore?: boolean }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const [audioErrors, setAudioErrors] = useState<Record<string, boolean>>({});
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
  const manualCriteria = (section: string) => {
    const criteria = scoreFor(section)?.criteria ?? {};
    return Object.fromEntries(Object.entries(criteria).filter(([key, value]) => key !== "comment" && key !== "note" && typeof value === "number")) as Record<string, number>;
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
  const renderAnswer = (section: string, task: ReviewTask, answer: ContentReviewAssessmentDetailView["answers"][number] | undefined, showTitle = true, itemNumber?: number) => {
    const audioKey = `${section}:${task.taskKey}`;
    const audioError = audioErrors[audioKey];
    const objective = section === "listening" || section === "reading";
    const answerValue = answer?.value ?? "";
    const isCorrect = Boolean(task.correctAnswer && answerValue === task.correctAnswer);
    const points = task.maxScore == null ? "" : ` (${task.maxScore}đ)`;
    return <article className="operator-answer-row" key={audioKey}>
      {objective ? <p className="operator-answer-question"><b>{itemNumber ? `${itemNumber}. ` : ""}{task.prompt}</b><span className="muted">{points}</span></p> : showTitle && task.title ? <p className="operator-answer-task-title"><b>{task.title}</b></p> : null}
      {objective ? <p className="operator-answer-result">{answerValue ? <><span className={isCorrect ? "operator-answer-correct" : task.correctAnswer ? "operator-answer-wrong" : ""}>{answerText(task, answerValue)}</span>{task.correctAnswer && !isCorrect ? <> <span className="operator-answer-arrow">→</span> {answerText(task, task.correctAnswer)}</> : null}</> : <>bỏ qua{task.correctAnswer ? <> <span className="operator-answer-arrow">→</span> {answerText(task, task.correctAnswer)}</> : null}</>}</p> : <div className="operator-answer-response">
        {answerValue ? <p className="operator-answer-value">{answerValue}</p> : <p className="operator-answer-value muted">{section === "writing" ? "(không có bài viết)" : "(không có lời chép)"}</p>}
        {answer?.audioArtifact && <>
          <div className="xs muted">File ghi âm: {answer.audioArtifact.artifactKey}</div>
          {answer.audioArtifact.signedUrl && <>
            <audio controls preload="none" src={answer.audioArtifact.signedUrl} aria-label={`Phát audio ${answer.taskKey}`} onError={() => setAudioErrors(current => ({ ...current, [audioKey]: true }))} style={{ width: "100%", maxWidth: 420, marginTop: 8 }} />
            {audioError && <p className="small" role="alert">Không phát được audio này. Link có thể đã hết hạn hoặc tệp không còn khả dụng.</p>}
          </>}
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
          <div className="operator-answer-rows">{group.tasks.map((task, index) => renderAnswer(section, task, answers.find(answer => answer.taskKey === task.taskKey), false, start + index + 1))}</div>
        </>;
        return objective ? <details className="operator-answer-group-details" key={group.key}>
          <summary className="operator-answer-group-heading"><b id={`operator-group-${section}-${group.key}`}>{groupLabel}{groupMax ? ` · ${groupEarned}/${groupMax} điểm` : ""}</b></summary>
          {body}
        </details> : <section className="operator-answer-group-details operator-answer-group-static" key={group.key} aria-labelledby={`operator-group-${section}-${group.key}`}>
          <div className="operator-answer-group-heading"><b id={`operator-group-${section}-${group.key}`}>{groupLabel}</b>{wordInfo && <span className="muted">{wordInfo}</span>}</div>
          {body}
        </section>;
      })}
      {ungrouped.length ? <div className="operator-answer-rows">{ungrouped.map(({ task, answer }, index) => renderAnswer(section, task, answer, true, numberOffset + index + 1))}</div> : null}
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
    <div className="row between"><div><h3 id="operator-review-detail-title">Bài test · {detail.learnerName}</h3><p className="small muted">{detail.title} · {statusLabels[detail.status] ?? detail.status} · Nộp {operatorDateTime(detail.submittedAt)} · Bắt đầu {operatorDateTime(detail.startedAt)} · Tổng điểm: {detail.totalScore == null ? "0/100" : `${detail.totalScore}/100`}</p></div><button className="btn-sm" type="button" onClick={onClose}>Đóng</button></div>
    <h4>Điểm theo 4 kỹ năng</h4>
    <div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Kỹ năng</th><th>Điểm</th><th>CEFR</th><th>Thời gian làm</th></tr></thead><tbody>{sectionOrder.map(section => { const score = scoreFor(section); const displayScore = score?.score ?? (score?.maxScore == null ? null : 0); const pendingMarker = score?.score == null && (section === "writing" || section === "speaking") ? "*" : ""; return <tr key={section}><td>{sectionLabel(section)}</td><td>{displayScore == null ? "—" : `${displayScore}/${score?.maxScore ?? "—"}${pendingMarker}`}</td><td>{score?.cefr ? <LevelChip level={score.cefr as Cefr} /> : "—"}</td><td>{formatDuration(score?.actualSeconds)}{score?.durationMinutes ? <span className="xs muted"> / {score.durationMinutes} phút</span> : null}</td></tr>; })}<tr className="operator-total-row"><th>Tổng</th><th>{detail.totalScore == null ? "0/100" : `${detail.totalScore}/100`}</th><th>{detail.overallCefr ? <LevelChip level={detail.overallCefr as Cefr} /> : "—"}</th><th>{formatDuration(detail.totalTimeSeconds)}{detail.totalTimeLimitMinutes ? ` / ${detail.totalTimeLimitMinutes} phút` : ""}</th></tr></tbody></table></div>
    <details className="operator-processing-log"><summary className="small">Nhật ký xử lý ({detail.activity?.length ?? 0})</summary>{detail.activity?.length ? <ul className="small">{detail.activity.map((event, index) => <li key={`${event.at}-${index}`}><b>{event.label}</b> · {operatorDateTime(event.at)}{event.detail ? <span className="muted"> · {event.detail}</span> : null}</li>)}</ul> : <p className="small muted">Chưa có hoạt động xử lý được ghi nhận.</p>}</details>
    <details className="operator-integrity-log"><summary className="small">Nhật ký cảnh báo ({detail.integrityEvents.length})</summary>{detail.integrityEvents.length ? <ul className="small">{detail.integrityEvents.map((event, index) => { const item = integrityEventText(event); return <li key={index}><b>{item.label}</b>{item.count !== undefined ? ` · Lần ghi nhận ${item.count}` : ""}{item.at ? ` · ${item.at}` : ""}</li>; })}</ul> : <p className="small muted">Không có cảnh báo được ghi nhận.</p>}</details>
    <h4 className="operator-detail-section-title">Bài làm và bằng chứng</h4>
    <section className="operator-assessment-document" aria-label="Bài làm và bằng chứng"><div className="operator-answer-sections">
      {renderAssessmentSection("listening")}
      {renderAssessmentSection("reading")}
      {onSaveManualScore ? <AssessmentManualScore writingCriteria={manualCriteria("writing")} speakingCriteria={manualCriteria("speaking")} comment={typeof scoreFor("writing")?.criteria.comment === "string" ? scoreFor("writing")?.criteria.comment as string : ""} onSave={onSaveManualScore} saving={savingManualScore} writingContent={renderSectionContent("writing")} speakingContent={renderSectionContent("speaking")} writingScore={scoreFor("writing")?.score} speakingScore={scoreFor("speaking")?.score} /> : <>{renderAssessmentSection("writing")}{renderAssessmentSection("speaking")}</>}
    </div></section>
    {detail.decision && <div className="banner info"><div className="body small">Quyết định: {detail.decision.status} · {detail.decision.approvedLevel ?? "—"} · {detail.decision.reason}</div></div>}
    {detail.appeal && <div className="banner warn"><div className="body small">Kháng nghị: {detail.appeal.status} · {detail.appeal.reason}{detail.appeal.resolution ? ` · ${detail.appeal.resolution}` : ""}</div></div>}
  </section></div>;
}
