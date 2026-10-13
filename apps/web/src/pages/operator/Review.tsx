import { useState } from "react";
import type { ContentReviewTabKey, ContentReviewView } from "@e4s/contracts";

export function Review({ view }: { view: ContentReviewView }) {
  const [selected, setSelected] = useState<ContentReviewTabKey>("coach");
  return <main className="operator-page content-review-page">
    <header className="operator-heading operator-heading--stack"><div><h1>Đọc mẫu & kiểm tra AI</h1><p>Kiểm tra bài nộp thứ Sáu, phản hồi của AI coach và các bài test.</p></div></header>
    <div className="review-tabs" role="tablist" aria-label="Nhóm nội dung cần kiểm tra">{view.tabs.map((tab) => <button type="button" role="tab" aria-selected={selected === tab.key} key={tab.key} onClick={() => setSelected(tab.key)}>{tab.label} ({tab.unreadCount ?? tab.count}{tab.unreadCount ? " chưa đọc" : ""})</button>)}</div>
    {selected === "coach" ? <section className="review-panel" role="tabpanel"><p>Đọc mẫu phản hồi của AI coach để kiểm tra chất lượng (lệch mức, sửa sai, khen quá tay). Sửa prompt nếu cần.</p><div className="coach-sample-list">{view.coachSamples.map((sample) => <article className="coach-sample" key={sample.id}><div className="coach-sample-heading"><div><strong>{sample.learnerName}</strong>{sample.cefr ? <span className="level-pill">{sample.cefr}</span> : null}<small>{sample.weekNumber ? `Tuần ${sample.weekNumber} · ` : ""}{formatDate(sample.createdAt)}</small></div><label><input type="checkbox" checked={sample.checked} readOnly /> Đã kiểm</label></div><p><span>Học viên:</span> {sample.learnerText}</p><p><span>Coach:</span> {sample.coachText || "Chưa có phản hồi lưu trong dữ liệu."}</p><div className="coach-scores"><span>Ý: {score(sample.scores.meaning)}</span><span>Từ: {score(sample.scores.vocabulary)}</span><span>NP: {score(sample.scores.grammar)}</span></div>{sample.suggestions.length ? <ul>{sample.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul> : null}</article>)}</div></section> : <section className="review-panel" role="tabpanel"><p className="operator-empty">Nhóm này có {view.tabs.find((tab) => tab.key === selected)?.count ?? 0} mục. Nội dung chi tiết được giữ trong cùng màn và sẽ hiện tại đây.</p></section>}
  </main>;
}

function score(value: number | null): string { return value === null ? "—" : `${value}/5`; }
function formatDate(value: string): string { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
