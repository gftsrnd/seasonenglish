import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Badge, Button, Empty, LevelChip, OperatorPage, PageTitle, Rubric, Suggestions } from "./primitives.js";
import type { OperatorReviewActions, OperatorReviewView, ReviewActionKey, ReviewTab } from "./types.js";
import type { ContentReviewAssessmentDetailView } from "@e4s/contracts";
import { operatorDateTime } from "./adapters.js";

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
    if (view.activeTab === "subs") return view.submissions.length ? view.submissions.map(item => <div className="card" key={item.id}>
      <div className="row between operator-card-header"><div><b>{item.learnerName}</b> {item.cefr && <LevelChip level={item.cefr} />} <span className="xs muted">Tuần {item.week} · {item.type ? (item.type === "dialogue" ? "Hội thoại" : "Viết") : "—"} · {item.submittedAt}</span></div><label className="small"><input type="checkbox" checked={item.operatorChecked} disabled={readOnly || Boolean(blocked("checkSubmission")) || isSameItemBusy("checkSubmission", item.id)} title={blocked("checkSubmission")} aria-busy={isBusy("checkSubmission", item.id) || undefined} onChange={event => runAction({ key: "checkSubmission", id: item.id, expected: event.target.checked }, () => actions.onMarkSubmission(item.id, event.target.checked))} style={{ width: "auto" }} /> Đã đọc mẫu</label></div>
      <p className="small muted" style={{ margin: "6px 0 2px" }}>Đề: {item.task || "—"}</p><div className="card soft small" style={{ whiteSpace: "pre-wrap" }}>{item.text}</div>
      {item.total != null ? <><div className="row" style={{ marginTop: 8 }}><b>{item.total}/100</b><Rubric value={item.rubric} />{!item.aiGraded && <Badge>chấm tay</Badge>}</div><p className="small" style={{ marginTop: 6 }}>{item.feedback}</p><Suggestions items={item.suggestions} /></> : <div className="row">
        <Badge tone="warn">Chưa chấm</Badge>{view.aiConnected && <Button small busy={isBusy("gradeAi", item.id)} disabled={readOnly || Boolean(blocked("gradeAi")) || isSameItemBusy("gradeAi", item.id)} title={blocked("gradeAi")} onClick={() => runAction({ key: "gradeAi", id: item.id }, () => actions.onGradeAi(item.id))}>{isBusy("gradeAi", item.id) ? "Đang chấm bằng AI…" : "Chấm bằng AI"}</Button>}
        <Button small disabled={readOnly || Boolean(blocked("gradeManual"))} title={blocked("gradeManual")} onClick={() => actions.onGradeManual(item.id)}>Chấm tay</Button>
      </div>}
    </div>) : <Empty>Chưa có bài nộp.</Empty>;

    if (view.activeTab === "coach") return view.coachTurns.length ? <div className="card"><p className="small muted">Đọc mẫu phản hồi AI coach; kiểm tra lệch mức, lỗi hoặc khen quá tay rồi sửa prompt nếu cần.</p><div className="operator-coach-list">{view.coachTurns.map(item => <div className="item" key={item.id}><div className="body small"><div className="row between"><span><b>{item.learnerName}</b> {item.cefr && <LevelChip level={item.cefr} />} <span className="xs muted">{item.week ? `Tuần ${item.week} · ` : ""}{item.at}</span></span><label className="xs"><input type="checkbox" checked={item.checked} disabled={readOnly || Boolean(blocked("checkCoach")) || isSameItemBusy("checkCoach", item.id)} title={blocked("checkCoach")} aria-busy={isBusy("checkCoach", item.id) || undefined} onChange={event => runAction({ key: "checkCoach", id: item.id, expected: event.target.checked }, () => actions.onMarkCoachTurn(item.id, event.target.checked))} style={{ width: "auto" }} /> Đã kiểm</label></div><div><span className="muted">Học viên:</span> {item.userText}</div><div><span className="muted">Coach:</span> {item.reply}</div><Rubric value={item.rubric} /><Suggestions items={item.suggestions} /></div></div>)}</div></div> : <Empty>Chưa có lượt luyện nào.</Empty>;

    if (view.activeTab === "micro") return view.microLessons.length ? <div className="card"><p className="small muted">Bài siêu ngắn do học viên tự tạo theo nghề và phong cách học. Kiểm tra lệch mức/sai nghĩa rồi xoá bài kém.</p><div className="list">{view.microLessons.map(item => <div className="item" key={item.id}><div className="body small"><div className="row between"><span><b>{item.learnerName || "—"}</b> <LevelChip level={item.cefr} /> <span className="xs muted">{item.date} · {item.topic}{item.completed ? " · đã học" : ""}</span></span><Button small danger busy={isBusy("deleteMicro", item.id)} disabled={readOnly || Boolean(blocked("deleteMicro")) || isSameItemBusy("deleteMicro", item.id)} title={blocked("deleteMicro")} onClick={() => runAction({ key: "deleteMicro", id: item.id }, () => actions.onDeleteMicroLesson(item.id))}>{isBusy("deleteMicro", item.id) ? "Đang xoá…" : "Xoá"}</Button></div><div><b>Lý thuyết:</b> {item.theory}</div><div><b>Từ:</b> {item.vocabulary}</div><div><b>Thực hành{item.practiceType ? ` (${item.practiceType})` : ""}:</b> {item.practiceText}{item.practiceAnswer && <span className="muted"> → {item.practiceAnswer}</span>}</div>{item.learnerAnswer && <div><b>Bài làm:</b> {item.learnerAnswer}{item.score != null && <Badge tone={item.scoreOk ? "ok" : "warn"}>{item.score}/10</Badge>}</div>}{(item.job || item.learningStyle) && <div className="xs muted">{[item.job, item.learningStyle].filter(Boolean).join(" · ")}</div>}</div></div>)}</div></div> : <Empty>Chưa có bài siêu ngắn nào.</Empty>;

    if (view.activeTab === "appeals") return view.appeals.length ? view.appeals.map(item => <div className="card" key={item.id} style={item.status === "pending" ? { background: "var(--butter)" } : undefined}><div className="row between"><div><b>{item.learnerName}</b> {item.cefr && <LevelChip level={item.cefr} />} <span className="xs muted">{[item.title, item.part, item.at].filter(Boolean).join(" · ")}{item.kind === "part" ? ` · đã làm ${item.attempts} lần` : ""}</span></div><Badge tone={item.status === "pending" ? "warn" : item.status === "accepted" ? "ok" : "danger"}>{item.statusLabel || (item.status === "pending" ? "Chờ xử lý" : item.status === "accepted" ? "Đã chấp nhận" : "Giữ nguyên")}</Badge></div>{item.question && <div className="small"><b>Đề:</b> {item.question}{item.options?.length ? <span className="muted"> ({item.options.join(" / ")})</span> : null}</div>}{item.answer && <div className="card soft small" style={{ whiteSpace: "pre-wrap" }}><b>Bài làm của học viên:</b> {item.answer}</div>}{(item.key || item.aiFeedback) && <div className="small">{item.key && <><b>Đáp án tham khảo:</b> {item.key} · </>}<b>AI nhận xét:</b> {item.aiFeedback || "(chấm theo đáp án, không có nhận xét)"}</div>}<div className="small"><b>Lý do học viên báo cáo:</b> {item.reason}</div>{item.status === "pending" ? <div className="row"><Button primary small busy={isBusy("decideAppeal", item.id, true)} disabled={readOnly || Boolean(blocked("decideAppeal")) || isSameItemBusy("decideAppeal", item.id)} title={blocked("decideAppeal")} onClick={() => runAction({ key: "decideAppeal", id: item.id, decision: true }, () => actions.onDecideAppeal(item.id, true))}>{isBusy("decideAppeal", item.id, true) ? "Đang xử lý…" : item.kind === "sub" ? "Chấp nhận – chấm lại điểm" : "Chấp nhận – tính là đúng"}</Button><Button small busy={isBusy("decideAppeal", item.id, false)} disabled={readOnly || Boolean(blocked("decideAppeal")) || isSameItemBusy("decideAppeal", item.id)} title={blocked("decideAppeal")} onClick={() => runAction({ key: "decideAppeal", id: item.id, decision: false }, () => actions.onDecideAppeal(item.id, false))}>{isBusy("decideAppeal", item.id, false) ? "Đang xử lý…" : "Giữ nguyên kết quả"}</Button></div> : item.decidedSummary && <div className="xs muted">{item.decidedSummary}</div>}</div>) : <Empty>Chưa có kháng nghị nào. Học viên bấm “Báo cáo: AI chấm sai” ở bài tập hoặc bài tuần thì yêu cầu hiện ở đây.</Empty>;

    if (view.activeTab === "attempts") return view.attempts.length ? <div className="card"><p className="small muted operator-status-legend">Mỗi phần tối đa 3 lượt: <span><Check className="operator-inline-icon" size={14} strokeWidth={2.5} aria-hidden="true" /> đúng</span>, <span><X className="operator-inline-icon" size={14} strokeWidth={2.5} aria-hidden="true" /> hết lượt vẫn sai/đã hiện đáp án</span>, … đang làm. Sắp theo phần hết lượt rồi tổng lượt.</p><div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Người học</th><th>Bài</th><th>Nghe</th><th>Đọc</th><th>Viết</th><th>Nói</th><th>Tổng lần</th></tr></thead><tbody>{view.attempts.map(item => <tr key={item.id}><td><b>{item.learnerName}</b> {item.cefr && <LevelChip level={item.cefr} />}</td><td className="small">{item.lesson}</td><td>{item.listening}</td><td>{item.reading}</td><td>{item.writing}</td><td>{item.speaking}</td><td><b>{item.total}</b></td></tr>)}</tbody></table></div></div> : <Empty>Chưa có học viên nào làm bài thực hành.</Empty>;

    return view.tests.length ? <div className="card"><div className="table-wrap operator-action-table-wrap"><table className="operator-action-table"><thead><tr><th>Người học</th><th>Loại</th><th>Nộp</th><th>Tổng</th><th>Mức thô</th><th>AI</th><th aria-label="Thao tác" /></tr></thead><tbody>{view.tests.map(item => <tr key={item.id}><td data-label="Người học">{item.learnerName}</td><td data-label="Loại">{item.kind === "placement" ? "Đầu vào" : item.kind === "level_up" ? "Lên mức" : "Cuối kỳ"}</td><td data-label="Nộp">{item.submittedAt || "—"}</td><td data-label="Tổng">{item.total ?? "—"}</td><td data-label="Mức thô">{item.rawLevel || "—"}</td><td data-label="AI">{item.aiSuggestedCefr || "—"}</td><td data-label="Thao tác"><Button small disabled={Boolean(blocked("viewTest"))} title={blocked("viewTest")} onClick={() => actions.onViewTest(item.id)}>Xem</Button></td></tr>)}</tbody></table></div></div> : <Empty>Chưa có bài test.</Empty>;
  };

  return <OperatorPage title="Đọc mẫu"><PageTitle><h1>Đọc mẫu & kiểm tra AI</h1><p className="muted">Kiểm tra bài nộp thứ Sáu, phản hồi của AI coach và các bài test.</p></PageTitle>{actionError && <div className="banner danger" role="alert" style={{ marginBottom: 12 }}><div className="body small">{actionError.message}</div></div>}<div className="tabs operator-review-tabs" role="tablist" aria-label="Nhóm nội dung cần kiểm tra">{TABS.map(([key, label]) => <button type="button" role="tab" aria-selected={view.activeTab === key} className={view.activeTab === key ? "active" : ""} key={key} onClick={() => actions.onTabChange(key)}>{key === "attempts" ? label : `${label} (${view.counts[key]}${key === "subs" ? " chưa đọc" : ""})`}</button>)}</div>{body()}</OperatorPage>;
}

export function OperatorReviewAssessmentDetail({ detail, onClose }: { detail: ContentReviewAssessmentDetailView; onClose(): void }) {
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

  return <div className="modal-backdrop operator-modal-scope operator-detail-modal" role="presentation"><section ref={dialogRef} className="dialog wide operator-detail-dialog" role="dialog" aria-modal="true" aria-label={`Chi tiết bài test của ${detail.learnerName}`} tabIndex={-1}>
    <div className="row between"><div><h3 id="operator-review-detail-title">Bài test · {detail.learnerName}</h3><p className="small muted">{detail.title} · {detail.kind} · {detail.status} · Nộp {operatorDateTime(detail.submittedAt)} · Bắt đầu {operatorDateTime(detail.startedAt)} · Tổng điểm: {detail.totalScore ?? "—"}</p></div><button className="btn-sm" type="button" onClick={onClose}>Đóng</button></div>
    <h4>Đáp án và bằng chứng</h4>
    {detail.answers.length ? <div className="list">{detail.answers.map(answer => {
      const audioKey = `${answer.section}:${answer.taskKey}`;
      const audioError = audioErrors[audioKey];
      return <div className="item small" key={audioKey}><b>{answer.section} · {answer.taskKey}</b>{answer.title ? ` · ${answer.title}` : ""}<p className="small" style={{ whiteSpace: "pre-wrap" }}>{answer.value}</p>{answer.prompt && <p className="xs muted">Đề: {answer.prompt}</p>}{answer.audioArtifact && <><div className="xs muted">Audio: {answer.audioArtifact.artifactKey} · {answer.audioArtifact.mimeType ?? "không rõ loại"} · {answer.audioArtifact.sizeBytes ?? "—"} bytes{answer.audioArtifact.signedUrl ? " · có link phát" : " · chưa có link phát được cấp"}</div>{answer.audioArtifact.signedUrl && <><audio controls preload="none" src={answer.audioArtifact.signedUrl} aria-label={`Phát audio ${answer.taskKey}`} onError={() => setAudioErrors(current => ({ ...current, [audioKey]: true }))} style={{ width: "100%", maxWidth: 420, marginTop: 8 }} />{audioError && <p className="small" role="alert">Không phát được audio này. Link có thể đã hết hạn hoặc tệp không còn khả dụng.</p>}</>}</>}</div>;
    })}</div> : <p className="small muted">Chưa có đáp án được lưu.</p>}
    <h4>Điểm và bằng chứng chấm</h4>
    {detail.scores.length ? <div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Phần</th><th>Điểm</th><th>Nguồn</th><th>Tiêu chí</th></tr></thead><tbody>{detail.scores.map(score => <tr key={score.section}><td>{score.section}</td><td>{score.score}</td><td>{score.source}</td><td><code>{JSON.stringify(score.criteria)}</code></td></tr>)}</tbody></table></div> : <p className="small muted">Chưa có điểm chi tiết.</p>}
    <h4>Nhật ký chống gian lận</h4>
    {detail.integrityEvents.length ? <ul className="small">{detail.integrityEvents.map((event, index) => <li key={index}><code>{JSON.stringify(event)}</code></li>)}</ul> : <p className="small muted">Không có vi phạm được ghi nhận.</p>}
    {detail.decision && <div className="banner info"><div className="body small">Quyết định: {detail.decision.status} · {detail.decision.approvedLevel ?? "—"} · {detail.decision.reason}</div></div>}
    {detail.appeal && <div className="banner warn"><div className="body small">Kháng nghị: {detail.appeal.status} · {detail.appeal.reason}{detail.appeal.resolution ? ` · ${detail.appeal.resolution}` : ""}</div></div>}
  </section></div>;
}
