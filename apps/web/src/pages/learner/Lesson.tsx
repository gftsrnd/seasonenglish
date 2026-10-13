import { useEffect, useState, type FormEvent } from "react";
import type { LessonPart, LessonProgressView, PartEvidence, LessonView } from "@e4s/contracts";

export interface LessonProps {
  lesson: LessonView;
  onSaveProgress: (progress: LessonProgressView) => void | Promise<void>;
}

const studyParts = new Set(["objective", "instruction", "vocabulary", "grammar", "pronunciation"]);
const lessonPartLabels = [
  ["listening", "Nghe"], ["speaking", "Nói"], ["reading", "Đọc"], ["writing", "Viết"],
  ["vocabulary", "Từ vựng"], ["grammar", "Ngữ pháp"], ["pronunciation", "Phát âm"],
  ["word_class", "Từ loại"], ["word_use", "Dùng từ"]
] as const;

export function Lesson({ lesson, onSaveProgress }: LessonProps) {
  const [phase, setPhase] = useState<"study" | "practice">("study");
  const [progress, setProgress] = useState(lesson.progress);
  useEffect(() => setProgress(lesson.progress), [lesson.progress]);
  const completed = new Set(progress.completedPartCodes);
  const practiceParts = lesson.content.parts.filter((part) => !studyParts.has(part.code));
  const allPracticeDone = practiceParts.every((part) => completed.has(part.code));

  const savePart = async (part: LessonPart, evidence: PartEvidence) => {
    const completedPartCodes = lesson.content.parts
      .map((item) => item.code)
      .filter((code) => completed.has(code) || code === part.code);
    const next: LessonProgressView = {
      status: "in_progress",
      completedPartCodes,
      evidence: { ...progress.evidence, [part.code]: evidence }
    };
    setProgress(next);
    await onSaveProgress(next);
  };

  const completeLesson = async () => {
    if (!allPracticeDone) return;
    const next: LessonProgressView = { ...progress, status: "completed" };
    setProgress(next);
    await onSaveProgress(next);
  };
  return <main className="learner-page">
    <a className="back-link back-link--square" href="/home" aria-label="Quay lại trang chủ">‹</a>
    <header className="page-heading lesson-heading">
      <p className="eyebrow">Tuần 1 · T{lesson.dayNumber + 1} · {lesson.title}</p>
      <div className="lesson-meta"><span>Bài {lesson.dayNumber}/5 · {lesson.cefr}</span><span>◷ {lesson.durationMinutes} phút</span></div>
      <h1>{lesson.title}</h1>
    </header>
    <div className="lesson-surface">
      <ul className="lesson-part-map" aria-label="Nội dung bài học">{lessonPartLabels
        .filter(([code]) => lesson.content.parts.some((part) => part.code === code))
        .map(([code, label]) => <li key={code} data-kind={studyParts.has(code) ? "study" : "practice"}>{label}</li>)}</ul>
      <div className="lesson-phase" role="group" aria-label="Các bước trong bài học">
        <button type="button" aria-pressed={phase === "study"} onClick={() => setPhase("study")}>1. Học</button>
        <button type="button" aria-pressed={phase === "practice"} onClick={() => setPhase("practice")}>2. Bài tập</button>
      </div>
      <div aria-live="polite">{lesson.content.parts.map((part) => {
        const isStudy = studyParts.has(part.code);
        return <LessonPartSection
          key={part.code}
          part={part}
          hidden={phase === "study" ? !isStudy : isStudy}
          completed={completed.has(part.code)}
          evidence={progress.evidence[part.code]}
          onSave={savePart}
        />;
      })}</div>
    </div>
    <footer className="lesson-actions">
      {phase === "study"
        ? <button className="button button--primary" type="button" onClick={() => setPhase("practice")}>Đã học xong → Làm bài tập</button>
        : <div><p aria-live="polite">Đã xong {completed.size}/{practiceParts.length} phần bài tập.</p><button className="button button--primary" type="button" disabled={!allPracticeDone} onClick={() => void completeLesson()}>Hoàn thành bài</button></div>}
    </footer>
  </main>;
}

function LessonPartSection({ part, hidden, completed, evidence, onSave }: {
  part: LessonPart;
  hidden: boolean;
  completed: boolean;
  evidence?: PartEvidence | undefined;
  onSave: (part: LessonPart, evidence: PartEvidence) => void | Promise<void>;
}) {
  return <section data-testid="lesson-part" data-part={part.code} hidden={hidden} aria-labelledby={`part-${part.code}`}>
    <h2 id={`part-${part.code}`}>{part.title}</h2>
    <PartContent part={part} />
    {!studyParts.has(part.code) ? <Exercise part={part} evidence={evidence} completed={completed} onSave={onSave} /> : null}
  </section>;
}

function PartContent({ part }: { part: LessonPart }) {
  const content = part.content;
  if (part.code === "instruction" && isStringArray(content.steps)) {
    return <ol className="instruction-list">{content.steps.map((step) => <li key={step}>{step}</li>)}</ol>;
  }
  if (part.code === "vocabulary" && Array.isArray(content.items)) {
    const entries = content.items.filter(isVocabularyEntry);
    if (entries.length) return <div className="vocabulary-list">{entries.map((item) => <article className="vocabulary-card" key={item.word}>
      <div><h3>{item.word}</h3><p className="word-meta">{[item.type, item.pronunciation].filter(Boolean).join(" · ")}</p></div>
      {item.meaning ? <p className="word-meaning">{item.meaning}</p> : null}
      {item.examples?.length ? <div className="example-chips" aria-label={`Ví dụ với ${item.word}`}>{item.examples.map((example) => <span key={example}>{example}</span>)}</div> : null}
    </article>)}</div>;
    if (isStringArray(content.items)) return <div className="word-chips">{content.items.map((item) => <span key={item}>{item}</span>)}</div>;
  }
  if (part.code === "grammar" && hasGrammarContent(content)) {
    return <div className="grammar-block">
      {content.formula ? <strong>{content.formula}</strong> : null}
      {content.usage ? <p>{content.usage}</p> : null}
      {content.examples?.length ? <div className="example-chips" aria-label="Ví dụ ngữ pháp">{content.examples.map((example) => <span key={example}>{example}</span>)}</div> : null}
    </div>;
  }
  if (part.code === "pronunciation" && hasPronunciationContent(content)) {
    return <div className="pronunciation-block">
      {content.focus ? <strong>{content.focus}</strong> : null}
      {content.instruction ? <p>{content.instruction}</p> : null}
      {content.words?.length ? <div className="word-chips" aria-label="Từ luyện phát âm">{content.words.map((word) => <span key={word}>{word}</span>)}</div> : null}
    </div>;
  }
  return <p>{readableContent(content)}</p>;
}

interface VocabularyEntry {
  word: string;
  type?: string;
  pronunciation?: string;
  meaning?: string;
  examples?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isVocabularyEntry(value: unknown): value is VocabularyEntry {
  if (!isRecord(value) || typeof value.word !== "string") return false;
  const optionalStrings = [value.type, value.pronunciation, value.meaning];
  return optionalStrings.every((item) => item === undefined || typeof item === "string")
    && (value.examples === undefined || isStringArray(value.examples));
}

function hasGrammarContent(content: Record<string, unknown>): content is Record<string, unknown> & {
  formula?: string;
  usage?: string;
  examples?: string[];
} {
  return typeof content.formula === "string" || typeof content.usage === "string" || isStringArray(content.examples);
}

function hasPronunciationContent(content: Record<string, unknown>): content is Record<string, unknown> & {
  focus?: string;
  instruction?: string;
  words?: string[];
} {
  return typeof content.focus === "string" || typeof content.instruction === "string" || isStringArray(content.words);
}

function Exercise({ part, evidence, completed, onSave }: {
  part: LessonPart;
  evidence?: PartEvidence | undefined;
  completed: boolean;
  onSave: (part: LessonPart, evidence: PartEvidence) => void | Promise<void>;
}) {
  const options = Array.isArray(part.content.options) ? part.content.options.map(String) : [];
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answer = String(new FormData(event.currentTarget).get("answer") ?? "").trim();
    if (!answer) return;
    void onSave(part, { attempts: (evidence?.attempts ?? 0) + 1, answer });
  };
  return <form className="exercise" onSubmit={submit}>
    {options.length ? <fieldset><legend>Câu trả lời {part.title}</legend>{options.map((option) => <label key={option}>
      <input type="radio" name="answer" value={option} required defaultChecked={evidence?.answer === option} /> <span>{option}</span>
    </label>)}</fieldset> : <label>Câu trả lời {part.title}<textarea name="answer" required defaultValue={evidence?.answer ?? ""} /></label>}
    <div className="exercise-actions"><span className="part-state">{completed ? "Đã lưu kết quả" : "Chưa hoàn thành"}</span><button type="submit">Lưu {part.title}</button></div>
  </form>;
}

function readableContent(content: Record<string, unknown>): string {
  if (typeof content.text === "string") return content.text;
  if (typeof content.prompt === "string") return content.prompt;
  if (Array.isArray(content.items)) return content.items.join(" · ");
  if (Array.isArray(content.steps)) return content.steps.join(" → ");
  if (Array.isArray(content.words)) return content.words.join(" · ");
  return "Nội dung bài học";
}
