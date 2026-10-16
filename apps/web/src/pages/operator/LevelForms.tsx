import { useState } from "react";
import type { AssessmentLevelFormSlotView } from "@e4s/contracts";

export function LevelForms({ slots, aiAvailable, readOnly = false, onGenerate, onPublish }: {
  slots: AssessmentLevelFormSlotView[]; aiAvailable: boolean; readOnly?: boolean;
  onGenerate?: (level: AssessmentLevelFormSlotView["targetLevel"]) => void | Promise<void>;
  onPublish?: (versionId: string) => void | Promise<void>;
}) {
  const [opened, setOpened] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, action: () => void | Promise<void>) => { setBusy(key); try { await action(); } finally { setBusy(null); } };
  return <main className="operator-page operator-page--forms">
    <header className="operator-heading page-title"><div><a className="back-link" href="/op">← Duyệt trình độ</a><h1>Đề thi lên mức</h1><p>Mỗi mức đích cần một đề ngắn được duyệt: 1 đoạn nghe (5 câu × 5đ), 1 bài đọc (5 câu × 5đ), viết 80–120 từ, 1 task nói – tất cả ở mức đích. Học viên đủ tín hiệu thi đề của mức kế tiếp, thời gian mỗi phần bằng nửa bài đầu vào.</p></div>{!aiAvailable ? <a className="operator-badge operator-badge--warn" href="/settings">Chưa có API key – không sinh đề được</a> : null}</header>
    {readOnly ? <p className="operator-readonly">Quản lý đang xem đúng màn hình của Người vận hành ở chế độ chỉ đọc.</p> : null}
    <div className="level-form-list">{slots.map((slot) => <section className="level-form-card operator-card" key={slot.targetLevel}>
      <div className="level-form-heading operator-row operator-row--between"><h3>Mức đích {slot.targetLevel} <span className={`operator-badge ${slot.publishedForm ? "operator-badge--ok" : "operator-badge--warn"}`}>{slot.publishedForm ? "có đề đã duyệt" : "chưa có đề duyệt"}</span></h3><button className="button--primary operator-button--small" type="button" disabled={readOnly || busy !== null || !aiAvailable || !onGenerate} onClick={() => void run(`generate-${slot.targetLevel}`, () => onGenerate?.(slot.targetLevel))}>{busy === `generate-${slot.targetLevel}` ? "Đang sinh…" : "Sinh đề bằng AI"}</button></div>
      <div className="operator-list">{slot.draftForm ? <article className="published-form operator-item"><div><strong>{slot.draftForm.title}</strong> <span className="operator-badge">Bản nháp</span><p>{slot.draftForm.listeningTaskCount} câu nghe · {slot.draftForm.readingTaskCount} câu đọc · {slot.draftForm.attemptCount} lượt thi</p>{opened === `${slot.targetLevel}-draft` ? <FormDetails form={slot.draftForm} published={false} /> : null}</div><div className="operator-row"><button className="operator-button--small" type="button" onClick={() => setOpened((current) => current === `${slot.targetLevel}-draft` ? null : `${slot.targetLevel}-draft`)}>{opened === `${slot.targetLevel}-draft` ? "Ẩn" : "Xem"}</button>{onPublish ? <button className="button--primary operator-button--small" type="button" disabled={readOnly || busy !== null} onClick={() => void run(`publish-${slot.targetLevel}`, () => onPublish(slot.draftForm!.versionId))}>{busy === `publish-${slot.targetLevel}` ? "Đang duyệt…" : "Duyệt"}</button> : null}</div></article> : null}
      {slot.publishedForm ? <article className="published-form operator-item"><div><strong>{slot.publishedForm.title}</strong> <span className="operator-badge operator-badge--ok">Đã duyệt</span><p>{formatDate(slot.publishedForm.publishedAt)} · {slot.publishedForm.listeningTaskCount} câu nghe · {slot.publishedForm.readingTaskCount} câu đọc · {slot.publishedForm.attemptCount} lượt thi</p>{opened === `${slot.targetLevel}-published` ? <FormDetails form={slot.publishedForm} published /> : null}</div><button className="operator-button--small" type="button" onClick={() => setOpened((current) => current === `${slot.targetLevel}-published` ? null : `${slot.targetLevel}-published`)}>{opened === `${slot.targetLevel}-published` ? "Ẩn" : "Xem"}</button></article> : null}</div>
      {!slot.draftForm && !slot.publishedForm ? <p className="operator-empty">Chưa có đề.</p> : null}
    </section>)}</div>
  </main>;
}

function FormDetails({ form, published }: { form: NonNullable<AssessmentLevelFormSlotView["draftForm"]>; published: boolean }) {
  return <dl className="form-detail-list"><div><dt>Phiên bản</dt><dd>v{form.version}</dd></div><div><dt>Nghe</dt><dd>{form.listeningTaskCount} câu</dd></div><div><dt>Đọc</dt><dd>{form.readingTaskCount} câu</dd></div><div><dt>Trạng thái</dt><dd>{published ? "Đang dùng cho lượt thi mới" : "Chờ Người vận hành duyệt"}</dd></div></dl>;
}

function formatDate(value: string | null) {
  if (!value) return "Chưa có ngày duyệt";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
