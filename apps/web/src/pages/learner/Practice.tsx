import { useState, type FormEvent } from "react";
import type { WeeklyPracticeView } from "@e4s/contracts";

export function Practice({ view, onSubmit }: { view: WeeklyPracticeView; onSubmit: (text: string) => void | Promise<void> }) {
  const [text, setText] = useState(view.submission?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const locked = view.state === "locked";
  const submitted = view.state === "submitted" || view.state === "reviewed";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (wordCount < 8 || busy) return;
    setBusy(true); setError("");
    try { await onSubmit(text.trim()); }
    catch { setError("Chưa nộp được bài. Nội dung vẫn được giữ để bạn thử lại."); }
    finally { setBusy(false); }
  };
  return <main className="learner-page engagement-page">
    <header className="engagement-title"><div><span className="eyebrow">Tuần {view.weekNumber} · {view.topic}</span><h1>Bài thực hành cuối tuần</h1></div></header>
    {locked ? <section className="engagement-card practice-lock">
      <div className="lively-mark" aria-hidden="true">🔒</div>
      <div><h2>Bạn chưa mở khoá bài Tuần {view.weekNumber}</h2><h3>Xong đủ {view.totalLessons} bài T2–T6 trước đã nhé</h3>
        <p>Bài thực hành dùng lại mẫu câu và từ vựng của cả tuần. Bạn đã xong <strong>{view.completedLessons}/{view.totalLessons}</strong> bài.</p>
        <progress aria-label="Tiến độ mở bài tuần" aria-valuenow={view.completedLessons} aria-valuemax={Math.max(1, view.totalLessons)} value={view.completedLessons} max={Math.max(1, view.totalLessons)} />
        <a className="button button--primary" href="/home">Về trang chủ học tiếp</a></div>
    </section> : submitted && view.submission ? <section className="engagement-card practice-result">
      <div className="practice-result-heading"><h2>Tuần {view.weekNumber} · Bài đã nộp</h2><Status status={view.submission.status} {...(typeof view.submission.score?.total === "number" ? { score: view.submission.score.total } : {})} /></div>
      <p className="submitted-copy">{view.submission.text}</p>
      {view.submission.score?.rubric ? <div className="rubric-row"><span>Đúng ý <b>{view.submission.score.rubric.meaning}</b></span><span>Từ vựng <b>{view.submission.score.rubric.vocabulary}</b></span><span>Ngữ pháp <b>{view.submission.score.rubric.grammar}</b></span></div> : null}
      {view.submission.feedback ? <p>{view.submission.feedback}</p> : <p className="muted">Bài đã được lưu và đang chờ phản hồi.</p>}
      {view.submission.suggestions.length ? <ul className="correction-list">{view.submission.suggestions.map((item) => <li key={`${item.original}-${item.corrected}`}><s>{item.original}</s> → <strong>{item.corrected}</strong><small>{item.explanation}</small></li>)}</ul> : null}
    </section> : <section className="engagement-card practice-compose">
      <div className="season-prompt"><span aria-hidden="true">◆</span><div><h2>{view.task}</h2><p>{view.guidance}</p></div></div>
      <form onSubmit={(event) => void submit(event)}><label>Bài viết tiếng Anh<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Viết bằng tiếng Anh…" /></label>
        <div className="form-action-row"><span>{wordCount} từ · tối thiểu 8</span><button className="button button--primary" type="submit" disabled={busy || wordCount < 8}>{busy ? "Đang nộp…" : "Nộp bài"}</button></div>
        {error ? <p role="alert" className="coach-error">{error}</p> : null}</form>
    </section>}
  </main>;
}

function Status({ status, score }: { status: string; score?: number }) {
  return <span className={`status-pill status-pill--${status}`}>{typeof score === "number" ? `${score}/100` : status === "reviewed" ? "Đã chấm" : "Chờ chấm"}</span>;
}
