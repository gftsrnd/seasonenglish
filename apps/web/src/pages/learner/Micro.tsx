import type { MicroLessonView } from "@e4s/contracts";

export interface MicroProps {
  lesson: MicroLessonView;
  onSubmit: (answer: string) => void | Promise<void>;
  onComplete: () => void | Promise<void>;
}

export function Micro({ lesson, onSubmit, onComplete }: MicroProps) {
  return <main className="learner-page learner-page--narrow">
    <header className="page-heading"><p className="eyebrow">Bài siêu ngắn · {lesson.cefr} · {lesson.durationMinutes} phút</p><h1>{lesson.topic}</h1></header>
    <section aria-labelledby="micro-theory"><h2 id="micro-theory">Một ý cần nhớ</h2><p>{lesson.theory}</p><ul>{lesson.vocabulary.map((word) => <li key={word}>{word}</li>)}</ul></section>
    <form onSubmit={(event) => { event.preventDefault(); void onSubmit(String(new FormData(event.currentTarget).get("answer") ?? "")); }}>
      {lesson.practice.type === "mcq" && lesson.practice.options?.length
        ? <fieldset><legend>{lesson.practice.prompt}</legend>{lesson.practice.options.map((option) => <label key={option}>
          <input type="radio" name="answer" value={option} required defaultChecked={lesson.attempt?.answer === option} />
          <span>{option}</span>
        </label>)}</fieldset>
        : <label>{lesson.practice.prompt}<textarea name="answer" required defaultValue={lesson.attempt?.answer ?? ""} /></label>}
      <button className="button" type="submit">Nộp để nhận phản hồi</button>
    </form>
    <section role="region" aria-label="Phản hồi" aria-live="polite"><h2>Phản hồi</h2><p>{lesson.feedback?.message ?? "Nộp bài để Season phản hồi."}</p></section>
    {lesson.completedAt ? <p className="completion-state" role="status">Đã hoàn thành bài siêu ngắn này.</p>
      : <button className="button button--primary" type="button" disabled={lesson.feedback?.status !== "ready"} onClick={() => void onComplete()}>Hoàn thành</button>}
  </main>;
}
