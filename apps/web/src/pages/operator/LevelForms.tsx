import type { AssessmentLevelFormSlotView } from "@e4s/contracts";

export function LevelForms({ slots, aiAvailable }: { slots: AssessmentLevelFormSlotView[]; aiAvailable: boolean }) {
  return <main className="operator-page operator-page--forms">
    <a className="back-link" href="/op">← Duyệt trình độ</a>
    <header className="operator-heading operator-heading--stack"><div><h1>Đề thi lên mức</h1><p>Mỗi mức đích cần một đề ngắn được duyệt: 1 đoạn nghe (5 câu × 5đ), 1 bài đọc (5 câu × 5đ), viết 80–120 từ, 1 task nói – tất cả ở mức đích. Học viên đủ tín hiệu thi đề của mức kế tiếp, thời gian mỗi phần bằng nửa bài đầu vào.</p></div></header>
    {!aiAvailable ? <a className="operator-warning" href="/settings">Chưa có API key – không sinh đề được</a> : null}
    <div className="level-form-list">{slots.map((slot) => <section className="level-form-card" key={slot.targetLevel}>
      <div className="level-form-heading"><h3>Mức đích {slot.targetLevel} <span className={`form-state${slot.publishedForm ? " form-state--ready" : ""}`}>{slot.publishedForm ? "có đề đã duyệt" : "chưa có đề duyệt"}</span></h3><button className="button--primary" type="button" disabled={!aiAvailable}>Sinh đề bằng AI</button></div>
      {slot.publishedForm ? <article className="published-form"><div><strong>{slot.publishedForm.title}</strong> <span className="form-state form-state--ready">Đã duyệt</span><p>{formatDate(slot.publishedForm.publishedAt)} · Đề mẫu · {slot.publishedForm.listeningTaskCount} câu nghe · {slot.publishedForm.readingTaskCount} câu đọc · {slot.publishedForm.attemptCount} lượt thi</p></div><div><button type="button">Xem</button><button type="button" disabled>Xoá</button></div></article> : <p className="operator-empty">Chưa có đề.</p>}
    </section>)}</div>
  </main>;
}

function formatDate(value: string | null) {
  if (!value) return "Chưa có ngày duyệt";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

