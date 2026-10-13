import { useState } from "react";
import { Link } from "react-router";
import type { ContentLessonDraftInput, ContentLessonSetVersionView } from "@e4s/contracts";
import { LessonEditor } from "./LessonEditor.js";

const statusLabel = { draft: "Bản nháp", review: "Chờ duyệt", published: "Đã duyệt", retired: "Đã thu hồi" } as const;

export function LessonSet({ view, readOnly, initialEditingDay = null, onSaveDraft, onSubmitReview, onPublish, onRetire }: {
  view: ContentLessonSetVersionView;
  readOnly: boolean;
  initialEditingDay?: number | null;
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
    <Link className="back-link" to="/op/lessons">← Ma trận bài học</Link>
    <header className="lesson-set-heading"><div><h1>Tuần {view.weekNumber} · Mức {view.cefr} <span className={`content-state content-state--${view.status}`}>{statusLabel[view.status]}</span></h1><p>{view.topic} · {view.lessons.length} bài · giải thích bằng {view.explanationLanguage}</p></div><div className="lesson-set-actions">
      {view.status === "draft" ? <button type="button" disabled={readOnly || view.lessons.length !== 5} onClick={() => void onSubmitReview()}>Gửi duyệt</button> : null}
      {view.status === "review" ? <button type="button" disabled={readOnly} onClick={() => void onPublish()}>Duyệt</button> : null}
      {view.status === "published" ? <button type="button" disabled={readOnly} onClick={() => void onRetire()}>Thu hồi duyệt</button> : null}
      <button type="button" disabled>Sinh lại</button><button type="button" disabled={readOnly || view.status === "published"}>Xoá</button>
    </div></header>
    {readOnly ? <p className="operator-readonly">Quản lý đang xem ở chế độ chỉ đọc.</p> : null}
    <p className="content-help">🔍 <strong>Checklist duyệt:</strong> đúng mức CEFR (từ/ngữ pháp không vượt mức)? Giải thích bằng {view.explanationLanguage} dễ hiểu? Đáp án bài tập đúng? Nội dung sát chủ đề tuần và tình huống công việc? Không khen quá tay, không nội dung nhạy cảm?</p>
    <div className="lesson-card-list">{view.lessons.map((lesson) => <article className="lesson-admin-card" key={lesson.id}><div className="lesson-admin-heading"><h3><span>T{lesson.dayNumber + 1}</span> {lesson.title} <small>{lesson.durationMinutes} phút</small> <em>{lesson.practiceLabel}</em></h3><div><button type="button" disabled={readOnly} onClick={() => setEditingDay(lesson.dayNumber)}>Sửa</button><button type="button" disabled={readOnly || view.status === "published"} onClick={() => void onSaveDraft(view.lessons.filter((item) => item.dayNumber !== lesson.dayNumber).map(({ dayNumber, title, durationMinutes, parts }) => ({ dayNumber, title, durationMinutes, parts })))}>Xoá bài</button></div></div><details><summary>Xem nội dung</summary><ol>{lesson.parts.map((part) => <li key={part.code}><strong>{part.title}</strong></li>)}</ol></details></article>)}</div>
    <section className="direct-author-card"><h3>✍️ Soạn bài trực tiếp</h3><p>Chọn ngày để điền form ngay trên trang: từ vựng, ngữ pháp, phát âm và 4 kỹ năng. Ngày đã có bài thì form mở sẵn nội dung để sửa. App kiểm tra mục còn thiếu trước khi lưu; bộ bài trở về Bản nháp để duyệt lại.</p><div>{[1, 2, 3, 4, 5].map((day) => <button type="button" disabled={readOnly} key={day} onClick={() => setEditingDay(day)}>Sửa T{day + 1}</button>)}</div></section>
    {editingDay === null ? null : <LessonEditor weekNumber={view.weekNumber} cefr={view.cefr} dayNumber={editingDay} lesson={view.lessons.find((lesson) => lesson.dayNumber === editingDay)} onClose={() => setEditingDay(null)} onSave={saveLesson} />}
  </main>;
}
