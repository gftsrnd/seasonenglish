import { useState } from "react";
import { Link } from "react-router";
import type { ContentLessonDraftInput, ContentLessonSetVersionView } from "@e4s/contracts";
import { LessonEditor } from "./LessonEditor.js";

const statusLabel = { draft: "Bản nháp", review: "Chờ duyệt", published: "Đã duyệt", retired: "Đã thu hồi" } as const;

export function LessonSet({ view, readOnly, initialEditingDay = null, error, onSaveDraft, onSubmitReview, onPublish, onRetire }: {
  view: ContentLessonSetVersionView;
  readOnly: boolean;
  initialEditingDay?: number | null;
  error?: string;
  onSaveDraft: (lessons: ContentLessonDraftInput[]) => void | Promise<void>;
  onSubmitReview: () => void | Promise<void>;
  onPublish: () => void | Promise<void>;
  onRetire: () => void | Promise<void>;
}) {
  const [editingDay, setEditingDay] = useState<number | null>(initialEditingDay);
  const saveLesson = async (lesson: ContentLessonDraftInput) => {
    const lessons = view.lessons
      .filter((item) => item.dayNumber !== lesson.dayNumber)
      .map(({ dayNumber, title, durationMinutes, parts }) => ({ dayNumber, title, durationMinutes, parts }));
    lessons.push(lesson);
    await onSaveDraft(lessons.sort((a, b) => a.dayNumber - b.dayNumber));
    setEditingDay(null);
  };
  return <main className="operator-page lesson-set-page">
    <header className="lesson-set-heading page-title"><div><Link className="back-link" to="/op/lessons">← Ma trận bài học</Link><h1>Tuần {view.weekNumber} · Mức {view.cefr} <span className={`operator-badge ${view.status === "published" ? "operator-badge--ok" : "operator-badge--warn"}`}>{statusLabel[view.status]}</span></h1><p>{view.topic} · {view.lessons.length} bài · giải thích bằng {view.explanationLanguage === "English" ? "tiếng Anh" : "tiếng Việt"}</p></div><div className="lesson-set-actions operator-row">
      {view.status === "draft" ? <button type="button" disabled={readOnly || view.lessons.length !== 5} onClick={() => void onSubmitReview()}>Gửi duyệt</button> : null}
      {view.status === "review" ? <button className="button--primary" type="button" disabled={readOnly} onClick={() => void onPublish()}>✓ Duyệt bộ bài</button> : null}
      {view.status === "published" ? <button type="button" disabled={readOnly} onClick={() => void onRetire()}>Thu hồi duyệt</button> : null}
    </div></header>
    {readOnly ? <p className="operator-readonly">Quản lý đang xem ở chế độ chỉ đọc.</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="operator-banner operator-banner--info checklist-banner"><span>🔍</span><div className="operator-banner__body">Checklist duyệt: đúng mức CEFR (từ/ngữ pháp không vượt mức)? {view.explanationLanguage === "Tiếng Việt" ? "Giải thích bằng tiếng Việt dễ hiểu?" : "Toàn bộ bằng tiếng Anh?"} Đáp án bài tập đúng? Nội dung sát chủ đề tuần và tình huống công việc? Không khen quá tay, không nội dung nhạy cảm?</div></div>
    <div className="lesson-card-list">{view.lessons.map((lesson) => <article className="lesson-admin-card operator-card" key={lesson.id}><div className="lesson-admin-heading operator-row operator-row--between"><h3><span className={`operator-badge level-${view.cefr}`}>T{lesson.dayNumber + 1}</span> {lesson.title} <span className="operator-badge">{lesson.durationMinutes} phút</span> <span className="operator-badge">{lesson.practiceLabel}</span></h3><div className="operator-row"><button className="operator-button--small" type="button" disabled={readOnly} onClick={() => setEditingDay(lesson.dayNumber)}>Sửa</button><button className="operator-button--small operator-button--danger" type="button" disabled={readOnly || view.status === "published"} onClick={() => void onSaveDraft(view.lessons.filter((item) => item.dayNumber !== lesson.dayNumber).map(({ dayNumber, title, durationMinutes, parts }) => ({ dayNumber, title, durationMinutes, parts })))}>Xoá bài</button></div></div><details><summary>Xem nội dung</summary><div className="lesson-part-preview">{lesson.parts.map((part) => <LessonPartPreview key={part.code} title={part.title} content={part.content} />)}</div></details></article>)}</div>
    <section className="direct-author-card operator-card"><h3>✍️ Soạn bài trực tiếp</h3><p>Chọn ngày để điền form ngay trên trang: từ vựng, ngữ pháp, phát âm và 4 kỹ năng. Ngày đã có bài thì form mở sẵn nội dung để sửa. App kiểm tra mục còn thiếu trước khi lưu; bộ bài trở về Bản nháp để duyệt lại.</p><div className="operator-row">{[1, 2, 3, 4, 5].map((day) => { const exists = view.lessons.some((lesson) => lesson.dayNumber === day); return <button className={exists ? "" : "button--primary"} type="button" disabled={readOnly} key={day} onClick={() => setEditingDay(day)}>{exists ? "Sửa" : "Soạn"} T{day + 1}</button>; })}</div></section>
    {editingDay === null ? null : <LessonEditor weekNumber={view.weekNumber} cefr={view.cefr} dayNumber={editingDay} lesson={view.lessons.find((lesson) => lesson.dayNumber === editingDay)} onClose={() => setEditingDay(null)} onSave={saveLesson} />}
  </main>;
}

function LessonPartPreview({ title, content }: { title: string; content: unknown }) {
  const value = asRecord(content);
  const items = Array.isArray(value.items) ? value.items.map(asRecord) : [];
  const options = textList(value.options);
  const lines = [text(value.text), text(value.formula), text(value.usage), text(value.focus), text(value.instruction), text(value.script), text(value.prompt)].filter(Boolean);
  const lists = [textList(value.steps), textList(value.examples), textList(value.words)].filter((item) => item.length);
  return <section className="lesson-part-preview__section"><h4>{title}</h4>{lines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}{items.length ? <ul>{items.map((item, index) => <li key={`${text(item.word)}-${index}`}><b>{text(item.word) || `Từ ${index + 1}`}</b>{text(item.pronunciation) ? ` · ${text(item.pronunciation)}` : ""}{text(item.meaning) ? ` — ${text(item.meaning)}` : ""}{textList(item.examples).length ? <small>{textList(item.examples).join(" · ")}</small> : null}</li>)}</ul> : null}{lists.map((list, index) => <ul key={index}>{list.map((item) => <li key={item}>{item}</li>)}</ul>)}{options.length ? <ol className="lesson-part-options">{options.map((option) => <li className={option === text(value.answer) ? "is-answer" : ""} key={option}>{option}</li>)}</ol> : null}{text(value.answer) ? <p><b>Đáp án:</b> {text(value.answer)}</p> : null}</section>;
}

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function textList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []; }
