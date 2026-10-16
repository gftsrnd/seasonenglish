import { useState } from "react";
import type { ContentReviewTabKey, ContentReviewView } from "@e4s/contracts";

type CheckHandler = (kind: "submission" | "coach", id: string, checked: boolean) => void | Promise<void>;

export function Review({ view, readOnly = false, onChecked = noopCheck, onDeleteMicro = noopId, onManualGrade = noopGrade, onAppealDecision = noopAppeal }: {
  view: ContentReviewView;
  readOnly?: boolean;
  onChecked?: CheckHandler;
  onDeleteMicro?: (id: string) => void | Promise<void>;
  onManualGrade?: (id: string, input: { meaning: number; vocabulary: number; grammar: number; feedback: string }) => void | Promise<void>;
  onAppealDecision?: (id: string, status: "accepted" | "rejected", resolution: string) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<ContentReviewTabKey>(view.submissions.length ? "submissions" : view.coachSamples.length ? "coach" : "submissions");
  const [gradeTarget, setGradeTarget] = useState<{ id: string; learnerName: string } | null>(null);
  const [appealTarget, setAppealTarget] = useState<{ id: string; learnerName: string; status: "accepted" | "rejected" } | null>(null);
  return <main className="operator-page content-review-page">
    <header className="operator-heading page-title"><div><h1>Đọc mẫu & kiểm tra AI</h1><p>Kiểm tra bài nộp thứ Sáu, phản hồi của AI coach và các bài test.</p></div></header>
    {readOnly ? <p className="operator-readonly">Quản lý đang xem đúng màn hình của Người vận hành ở chế độ chỉ đọc.</p> : null}
    <div className="review-tabs operator-tabs" role="tablist" aria-label="Nhóm nội dung cần kiểm tra">{view.tabs.map((tab) => <button className={selected === tab.key ? "active" : ""} type="button" role="tab" aria-selected={selected === tab.key} key={tab.key} onClick={() => setSelected(tab.key)}>{tab.label} ({tab.unreadCount ?? tab.count}{tab.key === "submissions" ? " chưa đọc" : ""})</button>)}</div>
    <fieldset className="review-panel" role="tabpanel" disabled={readOnly}>{panel(selected, view, readOnly, onChecked, onDeleteMicro, (id, learnerName) => setGradeTarget({ id, learnerName }), (id, learnerName, status) => setAppealTarget({ id, learnerName, status }))}</fieldset>
    {gradeTarget ? <ReviewDialog title={`Chấm bài của ${gradeTarget.learnerName}`} onClose={() => setGradeTarget(null)}>
      <form onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onManualGrade(gradeTarget.id, {
          meaning: Number(data.get("meaning")), vocabulary: Number(data.get("vocabulary")),
          grammar: Number(data.get("grammar")), feedback: String(data.get("feedback") ?? "").trim()
        });
        setGradeTarget(null);
      }}>
        <div className="editor-two-columns"><ScoreInput name="meaning" label="Đúng ý" /><ScoreInput name="vocabulary" label="Từ vựng" /><ScoreInput name="grammar" label="Ngữ pháp" /></div>
        <label>Nhận xét<textarea name="feedback" required defaultValue="Đã kiểm tra theo rubric và evidence đã lưu." /></label>
        <DialogActions onClose={() => setGradeTarget(null)} submitLabel="Lưu điểm" />
      </form>
    </ReviewDialog> : null}
    {appealTarget ? <ReviewDialog title={`Xử lý kháng nghị của ${appealTarget.learnerName}`} onClose={() => setAppealTarget(null)}>
      <form onSubmit={(event) => {
        event.preventDefault();
        const resolution = String(new FormData(event.currentTarget).get("resolution") ?? "").trim();
        void onAppealDecision(appealTarget.id, appealTarget.status, resolution);
        setAppealTarget(null);
      }}>
        <p>Quyết định: <strong>{appealTarget.status === "accepted" ? "Chấp nhận kháng nghị" : "Giữ nguyên kết quả"}</strong></p>
        <label>Kết luận sau khi đối chiếu evidence<textarea name="resolution" required defaultValue={appealTarget.status === "accepted" ? "Chấp nhận kháng nghị sau khi đối chiếu evidence." : "Giữ nguyên kết quả sau khi đối chiếu evidence."} /></label>
        <DialogActions onClose={() => setAppealTarget(null)} submitLabel="Lưu kết luận" />
      </form>
    </ReviewDialog> : null}
  </main>;
}

const noopCheck: CheckHandler = () => undefined;
const noopId = (_id: string) => undefined;
const noopGrade = (_id: string, _input: { meaning: number; vocabulary: number; grammar: number; feedback: string }) => undefined;
const noopAppeal = (_id: string, _status: "accepted" | "rejected", _resolution: string) => undefined;

function panel(selected: ContentReviewTabKey, view: ContentReviewView, readOnly: boolean, onChecked: CheckHandler, onDeleteMicro: (id: string) => void | Promise<void>, openManualGrade: (id: string, learnerName: string) => void, openAppeal: (id: string, learnerName: string, status: "accepted" | "rejected") => void) {
  if (selected === "submissions") return view.submissions.length ? <div className="coach-sample-list">{view.submissions.map((item) => <article className="coach-sample" key={item.id}><div className="coach-sample-heading"><div><strong>{item.learnerName}</strong>{item.cefr ? <span className="level-pill">{item.cefr}</span> : null}<small>Tuần {item.weekNumber} · {formatDate(item.submittedAt)}</small></div><label><input type="checkbox" checked={item.checked} onChange={(event) => void onChecked("submission", item.id, event.target.checked)} /> Đã đọc mẫu</label></div><p>{item.text}</p><div className="coach-scores"><span>Tổng: {item.total ?? "—"}/100</span><span>Ý: {score(item.rubric.meaning)}</span><span>Từ: {score(item.rubric.vocabulary)}</span><span>NP: {score(item.rubric.grammar)}</span></div>{item.feedback ? <p><span>Nhận xét:</span> {item.feedback}</p> : <><p className="operator-warning">Bài đang chờ chấm.</p><button type="button" onClick={() => openManualGrade(item.id, item.learnerName)}>Chấm tay</button></>}{item.suggestions.length ? <ul>{item.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul> : null}</article>)}</div> : <Empty text="Chưa có bài nộp." />;
  if (selected === "coach") return view.coachSamples.length ? <><p>Đọc mẫu phản hồi của AI coach để kiểm tra lệch mức, sửa sai hoặc khen quá tay.</p><div className="coach-sample-list">{view.coachSamples.map((sample) => <article className="coach-sample" key={sample.id}><div className="coach-sample-heading"><div><strong>{sample.learnerName}</strong>{sample.cefr ? <span className="level-pill">{sample.cefr}</span> : null}<small>{sample.weekNumber ? `Tuần ${sample.weekNumber} · ` : ""}{formatDate(sample.createdAt)}</small></div><label><input type="checkbox" checked={sample.checked} onChange={(event) => void onChecked("coach", sample.id, event.target.checked)} /> Đã kiểm</label></div><p><span>Học viên:</span> {sample.learnerText}</p><p><span>Coach:</span> {sample.coachText || "Chưa có phản hồi lưu trong dữ liệu."}</p><div className="coach-scores"><span>Ý: {score(sample.scores.meaning)}</span><span>Từ: {score(sample.scores.vocabulary)}</span><span>NP: {score(sample.scores.grammar)}</span></div>{sample.suggestions.length ? <ul>{sample.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul> : null}</article>)}</div></> : <Empty text="Chưa có lượt luyện nào." />;
  if (selected === "micro") return view.microLessons.length ? <div className="coach-sample-list">{view.microLessons.map((item) => <article className="coach-sample" key={item.id}><div className="coach-sample-heading"><div><strong>{item.learnerName}</strong><span className="level-pill">{item.cefr}</span><small>{formatDate(item.generatedAt)} · {item.completed ? "Đã học" : "Chưa hoàn thành"}</small></div><button type="button" className="danger-button" onClick={() => void onDeleteMicro(item.id)}>Xoá bài kém</button></div><p><b>{item.topic}</b></p><p><span>Lý thuyết:</span> {item.theory}</p><p><span>Từ:</span> {item.vocabulary.join(" · ") || "—"}</p><p><span>Thực hành:</span> {item.practice || "—"}</p>{item.answer ? <p><span>Bài làm:</span> {item.answer}</p> : null}</article>)}</div> : <Empty text="Chưa có bài siêu ngắn." />;
  if (selected === "appeals") return view.appeals.length ? <div className="coach-sample-list">{view.appeals.map((item) => <article className="coach-sample" key={item.id}><div className="coach-sample-heading"><div><strong>{item.learnerName}</strong><small>{formatDate(item.createdAt)}</small></div><span className="level-pill">{appealLabel(item.status)}</span></div><p><span>Lý do:</span> {item.reason}</p>{item.resolution ? <p><span>Kết quả xử lý:</span> {item.resolution}</p> : <><p className="operator-warning">Đang chờ vận hành xử lý.</p><div><button type="button" onClick={() => openAppeal(item.id, item.learnerName, "accepted")}>Chấp nhận</button><button type="button" onClick={() => openAppeal(item.id, item.learnerName, "rejected")}>Giữ nguyên kết quả</button></div></>}</article>)}</div> : <Empty text="Chưa có kháng nghị." />;
  if (selected === "attempts") return view.lessonAttempts.length ? <><p>Số lần làm từng phần của mỗi bài (tối đa 3). Sắp theo tổng số lần làm.</p><div className="table-wrap"><table><thead><tr><th>Người học</th><th>Bài</th><th>Nghe</th><th>Đọc</th><th>Viết</th><th>Nói</th><th>Tổng lần</th></tr></thead><tbody>{[...view.lessonAttempts].sort((a, b) => totalAttempts(b.attempts) - totalAttempts(a.attempts)).map((item) => <tr key={item.id}><td><b>{item.learnerName}</b> {item.cefr ? <span className="level-pill">{item.cefr}</span> : null}</td><td>Tuần {item.weekNumber} · T{item.dayNumber + 1} · {item.lessonTitle}</td><td>{attempt(item.attempts.listening)}</td><td>{attempt(item.attempts.reading)}</td><td>{attempt(item.attempts.writing)}</td><td>{attempt(item.attempts.speaking)}</td><td><b>{totalAttempts(item.attempts)}</b></td></tr>)}</tbody></table></div></> : <Empty text="Chưa có học viên làm bài thực hành." />;
  return view.assessments.length ? <div className="table-wrap"><table><thead><tr><th>Người học</th><th>Loại</th><th>Nộp</th><th>Tổng</th><th>Trạng thái</th></tr></thead><tbody>{view.assessments.map((item) => <tr key={item.id}><td><b>{item.learnerName}</b></td><td>{assessmentKind(item.kind)} · {item.title}</td><td>{item.submittedAt ? formatDate(item.submittedAt) : "Chưa nộp"}</td><td>{item.totalScore ?? "—"}/100</td><td>{item.status}</td></tr>)}</tbody></table></div> : <Empty text="Chưa có bài test." />;
}

function Empty({ text }: { text: string }) { return <p className="operator-empty">{text}</p>; }
function score(value: number | null): string { return value === null ? "—" : `${value}/5`; }
function attempt(value: number | undefined): string { return value ? `${value}/3` : "chưa làm"; }
function totalAttempts(attempts: Partial<Record<"listening" | "reading" | "writing" | "speaking", number>>): number { return Object.values(attempts).reduce<number>((sum, value) => sum + (value ?? 0), 0); }
function appealLabel(value: "pending" | "accepted" | "rejected") { return value === "pending" ? "Chờ xử lý" : value === "accepted" ? "Đã chấp nhận" : "Giữ nguyên"; }
function assessmentKind(value: "placement" | "final" | "level_up") { return value === "placement" ? "Đầu vào" : value === "final" ? "Cuối kỳ" : "Lên mức"; }
function formatDate(value: string): string { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function ReviewDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="lesson-editor-backdrop"><section className="lesson-editor review-dialog" role="dialog" aria-modal="true" aria-label={title}><div className="lesson-editor-heading"><h3>{title}</h3><button type="button" onClick={onClose}>Đóng</button></div>{children}</section></div>;
}
function ScoreInput({ name, label }: { name: string; label: string }) {
  return <label>{label}<input name={name} type="number" min="0" max="5" step="0.5" required defaultValue="3" /></label>;
}
function DialogActions({ onClose, submitLabel }: { onClose: () => void; submitLabel: string }) {
  return <div className="lesson-editor-actions"><button type="button" onClick={onClose}>Huỷ</button><button className="button--primary" type="submit">{submitLabel}</button></div>;
}
