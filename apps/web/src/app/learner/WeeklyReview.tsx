import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, RotateCcw } from "lucide-react";
import type { CefrLevel, WeeklyReviewSessionView } from "@e4s/contracts";
import type { LearnerCallbacks } from "./contracts.js";
import { AppLink, ErrorText, Notice } from "./ui.js";

/**
 * Friday weekly review runner: optional flip-card warm-up, then the sections
 * in order with review-until-correct. The server owns grading, retries and the
 * resume point; this screen only renders the current question.
 */
export function WeeklyReview({ title, cefr, actions }: { title: string; cefr: CefrLevel; actions: LearnerCallbacks }) {
  const english = !["A1", "A2"].includes(cefr);
  const [session, setSession] = useState<WeeklyReviewSessionView | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string; willRetry: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  useEffect(() => {
    let active = true;
    actions.getWeeklyReviewSession?.()
      .then((loaded) => { if (active) setSession(loaded); })
      .catch(() => { if (active) setError(english ? "The review could not be loaded." : "Không tải được bài ôn."); });
    return () => { active = false; };
    // Mounted once per review lesson (keyed by lesson id); callbacks are recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session) {
    return <div className="app-learner-page"><div className="card">{error ? <ErrorText message={error} /> : <p>{english ? "Loading the weekly review…" : "Đang tải bài ôn…"}</p>}</div></div>;
  }

  const finishWarmup = async (status: "skipped" | "done") => {
    if (busy || !actions.setWeeklyReviewWarmup) return;
    setBusy(true);
    try { setSession(await actions.setWeeklyReviewWarmup(status)); } catch { setError(english ? "Could not save. Try again." : "Chưa lưu được. Thử lại nhé."); } finally { setBusy(false); }
  };

  const submit = async (value: string) => {
    const question = session.currentQuestion;
    if (busy || !question || !actions.answerWeeklyReview || !value.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await actions.answerWeeklyReview({ sectionCode: question.sectionCode, itemId: question.itemId, answer: value });
      setFeedback({ correct: result.correct, text: result.feedback, willRetry: result.willRetry });
      setSession(result.session);
      setAnswer("");
    } catch {
      setError(english ? "Your answer was not saved. Try again." : "Chưa lưu được câu trả lời. Thử lại nhé.");
    } finally {
      setBusy(false);
    }
  };

  const header = <div className="row" style={{ gap: 8, alignItems: "center" }}>
    <AppLink className="lesson-back" href="/home" navigate={actions.navigate} ariaLabel="Về trang chủ" title="Về trang chủ"><ChevronLeft size={22} aria-hidden="true" /></AppLink>
    <div><div className="eyebrow">{english ? "Friday review" : "Bài ôn thứ Sáu"}</div><h2 style={{ margin: 0 }}>{title}</h2></div>
  </div>;

  const sectionList = <ol className="weekly-review-sections" aria-label={english ? "Review sections" : "Các phần bài ôn"}>
    {session.sections.map((section) => <li key={section.code} aria-current={section.code === session.currentSectionCode ? "step" : undefined} data-completed={section.completed || undefined}>
      {section.completed ? <CheckCircle2 size={14} aria-hidden="true" /> : null} {section.title} · {section.correctItems}/{section.totalItems}
    </li>)}
  </ol>;

  if (session.warmup.status === "pending" && session.warmup.cards.length && !session.completed) {
    return <div className="app-learner-page stack">
      {header}
      <section className="card stack" aria-label={english ? "Warm-up flip cards" : "Khởi động: lật thẻ"}>
        <div className="eyebrow">{english ? "Part 0 · optional, not graded" : "Phần 0 · tùy chọn, không chấm"}</div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {session.warmup.cards.map((card, index) => <button type="button" className="card flat" key={`${card.word}-${index}`} aria-pressed={flipped.has(index)} onClick={() => setFlipped((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })}>
            {flipped.has(index) ? <><strong>{card.word}</strong>{card.pronunciation ? ` ${card.pronunciation}` : ""}</> : <>{card.meaning ?? "?"}</>}
          </button>)}
        </div>
        <div className="row">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void finishWarmup("skipped")}>{english ? "Skip" : "Bỏ qua"}</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void finishWarmup("done")}>{english ? "Start part 1" : "Vào phần 1"}</button>
        </div>
      </section>
      {error ? <ErrorText message={error} /> : null}
    </div>;
  }

  if (session.completed) {
    return <div className="app-learner-page stack">
      {header}
      {sectionList}
      <section className="card" aria-label={english ? "Review complete" : "Đã xong bài ôn"}>
        <h3>{english ? "Weekly review complete" : "Bạn đã hoàn thành bài ôn tuần"}</h3>
        <p>{english ? "Next week's first lesson opens on its day." : "Bài đầu tuần sau sẽ mở khi tới ngày học."}</p>
        <AppLink className="btn btn-primary" href="/home" navigate={actions.navigate}>{english ? "Back to home" : "Về trang chủ"}</AppLink>
      </section>
    </div>;
  }

  const question = session.currentQuestion;
  const section = session.sections.find((candidate) => candidate.code === session.currentSectionCode);
  return <div className="app-learner-page stack">
    {header}
    {sectionList}
    {feedback ? <Notice tone={feedback.correct ? "ok" : "warn"}>
      <span role="status">{feedback.text}{feedback.willRetry ? (english ? " This point comes back at the end of the section." : " Câu này sẽ quay lại ở cuối phần.") : ""}</span>
    </Notice> : null}
    {question ? <section className="card stack" aria-label={section?.title ?? question.sectionCode}>
      <div className="eyebrow">{section?.title}{question.retry ? <span className="badge" style={{ marginLeft: 8 }}><RotateCcw size={12} aria-hidden="true" /> {english ? "Try again" : "Làm lại"}</span> : null}</div>
      {question.passage ? <blockquote className="small">{question.passage}</blockquote> : null}
      <p><strong>{question.prompt}</strong></p>
      {question.options?.length
        ? <div className="stack" role="group" aria-label={english ? "Answer options" : "Các lựa chọn"}>{question.options.map((option) => <button type="button" key={option} className="btn" disabled={busy} onClick={() => void submit(option)}>{option}</button>)}</div>
        : <form className="stack" onSubmit={(event) => { event.preventDefault(); void submit(answer); }}>
          <label className="stack"><span className="small">{question.freeResponse ? (english ? "Write 1–2 sentences using at least two words from this week." : "Viết 1–2 câu, dùng ít nhất 2 từ của tuần.") : (english ? "Your answer" : "Câu trả lời")}</span>
            <textarea value={answer} rows={question.freeResponse ? 3 : 1} disabled={busy} onChange={(event) => setAnswer(event.target.value)} /></label>
          <button type="submit" className="btn-primary" disabled={busy || !answer.trim()}>{english ? "Check" : "Kiểm tra"}</button>
        </form>}
    </section> : null}
    {error ? <ErrorText message={error} /> : null}
  </div>;
}
