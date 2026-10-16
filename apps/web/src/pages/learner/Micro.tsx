import type { MicroLessonView } from "@e4s/contracts";
import { useEffect, useState } from "react";
import { useExperience } from "../../features/experience/Experience.js";

export interface MicroProps {
  lesson: MicroLessonView;
  onSubmit: (answer: string) => void | Promise<void>;
  onComplete: () => void | Promise<void>;
}

export function Micro({ lesson, onSubmit, onComplete }: MicroProps) {
  const [answer, setAnswer] = useState(lesson.attempt?.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { speak, holdMusic, notify } = useExperience();
  useEffect(() => setAnswer(lesson.attempt?.answer ?? ""), [lesson.id, lesson.attempt?.answer]);
  const submit = async () => {
    setBusy(true); setError("");
    try { await onSubmit(answer); notify("Season đã lưu phản hồi cho bài này.", "success"); }
    catch { setError("Chưa nhận được phản hồi. Câu trả lời vẫn được giữ để bạn thử lại."); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    setBusy(true); setError("");
    try { await onComplete(); notify("Đã hoàn thành bài siêu ngắn.", "success"); }
    catch { setError("Chưa lưu được trạng thái hoàn thành. Vui lòng thử lại."); }
    finally { setBusy(false); }
  };
  const dictationAvailable = speechRecognitionConstructor() !== null;
  const dictate = () => {
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = "en-US"; recognition.interimResults = false;
    recognition.onstart = () => holdMusic(true);
    recognition.onend = () => holdMusic(false);
    recognition.onerror = () => { holdMusic(false); setError("Không nhận được giọng nói. Bạn vẫn có thể nhập câu trả lời."); };
    recognition.onresult = (event) => setAnswer(event.results[0]?.[0]?.transcript ?? answer);
    recognition.start();
  };
  return <main className="learner-page learner-page--narrow">
    <header className="page-heading"><p className="eyebrow">Bài siêu ngắn · {lesson.cefr} · {lesson.durationMinutes} phút</p><h1>{lesson.topic}</h1></header>
    <section aria-labelledby="micro-theory"><div className="section-heading"><h2 id="micro-theory">Một ý cần nhớ</h2><button type="button" onClick={() => speak(lesson.theory)}>🔊 Nghe mẫu câu</button></div><p>{lesson.theory}</p><ul>{lesson.vocabulary.map((word) => <li key={word}><button className="text-button" type="button" aria-label={`Nghe ${word}`} onClick={() => speak(word)}>🔊</button> {word}</li>)}</ul></section>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {lesson.practice.type === "mcq" && lesson.practice.options?.length
        ? <fieldset><legend>{lesson.practice.prompt}</legend>{lesson.practice.options.map((option) => <label key={option}>
          <input type="radio" name="answer" value={option} required checked={answer === option} onChange={() => setAnswer(option)} />
          <span>{option}</span>
        </label>)}</fieldset>
        : <label>{lesson.practice.prompt}{lesson.practice.type === "fill"
          ? <input name="answer" required value={answer} onChange={(event) => setAnswer(event.target.value)} />
          : <textarea name="answer" required value={answer} onChange={(event) => setAnswer(event.target.value)} />}</label>}
      {lesson.practice.type === "write" && dictationAvailable ? <button className="button" type="button" onClick={dictate}>🎙 Nói để nhập câu trả lời</button> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button" type="submit" disabled={busy || !answer.trim()}>{busy ? "Đang nhận phản hồi…" : "Nộp để nhận phản hồi"}</button>
    </form>
    <section role="region" aria-label="Phản hồi" aria-live="polite"><h2>Phản hồi</h2><p>{lesson.feedback?.message ?? "Nộp bài để Season phản hồi."}</p></section>
    {lesson.completedAt ? <p className="completion-state" role="status">Đã hoàn thành bài siêu ngắn này.</p>
      : <button className="button button--primary" type="button" disabled={busy || lesson.feedback?.status !== "ready"} onClick={() => void complete()}>Hoàn thành</button>}
  </main>;
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start(): void;
};

function speechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  const speechWindow = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}
