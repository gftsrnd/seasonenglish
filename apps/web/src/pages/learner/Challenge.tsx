import { useState, type FormEvent } from "react";
import type { LevelChallengeView } from "@e4s/contracts";

export function Challenge({ view, onSend }: {
  view: LevelChallengeView;
  onSend: (message: string) => void | Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const capped = view.daily.used >= view.daily.limit;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy || capped || !view.aiAvailable || view.progress.complete) return;
    setBusy(true); setError("");
    try { await onSend(text); setMessage(""); }
    catch { setError("Season chưa ghi nhận được lượt này. Nội dung vẫn được giữ để bạn gửi lại."); }
    finally { setBusy(false); }
  };
  return <main className="learner-page learner-page--coach">
    <section className="coach-card" aria-label={`Thử thách lên mức ${view.targetLevel}`}>
      <header className="coach-header"><span className="season-emblem" aria-hidden="true">◆</span><div className="coach-title">
        <h1>Thử thách lên mức {view.targetLevel}</h1>
        <p>Season nói ở mức {view.targetLevel} · lượt {view.progress.completedTurns}/{view.progress.requiredTurns}</p>
      </div><span className={`coach-badge ${view.progress.passed ? "is-success" : "is-primary"}`}>TB {view.progress.average}/5 · lạc đề {view.progress.offTopic}</span></header>
      <div className="coach-limits"><p>Đạt khi điểm trung bình ba tiêu chí từ <strong>3.5/5</strong>, đủ 6 lượt và tối đa 1 lượt lạc đề. Mỗi câu trả lời được lưu cùng bài thi lên mức.</p><span className={`coach-badge ${capped ? "is-danger" : "is-primary"}`}>Hôm nay {view.daily.used}/{view.daily.limit} lượt</span></div>
      {!view.aiAvailable ? <div className="coach-warning" role="status">AI hiện không sẵn sàng; thử thách vẫn được giữ nguyên để làm tiếp.</div> : null}
      {view.progress.complete ? <div className="coach-warning" role="status"><strong>{view.progress.passed ? "Đã đạt thử thách." : "Đã hoàn thành nhưng chưa đạt ngưỡng."}</strong> Kết quả đã được lưu cùng hồ sơ duyệt mức.</div> : null}
      <div className="coach-chat" role="log" aria-live="polite">{view.messages.map((item) => <div className="coach-message-group" data-speaker={item.speaker} key={item.id}>
        {item.feedback ? <aside className={`coach-feedback ${item.feedback.relevant ? "" : "is-off-topic"}`}><strong>{item.feedback.relevant ? `Ý ${item.feedback.rubric.meaning}/5 · Từ ${item.feedback.rubric.vocabulary}/5 · NP ${item.feedback.rubric.grammar}/5` : "Lượt này chưa trả lời đúng câu hỏi"}</strong>{item.feedback.relevanceNote ? <p>{item.feedback.relevanceNote}</p> : null}</aside> : null}
        <div className={`coach-message coach-message--${item.speaker}`}>{item.text}</div>
      </div>)}{busy ? <div className="coach-message coach-message--coach coach-thinking"><span className="spinner" /> Season đang nghĩ…</div> : null}</div>
      {!view.progress.complete ? <form className="coach-compose" onSubmit={(event) => void submit(event)}><input value={message} onChange={(event) => setMessage(event.target.value)} disabled={!view.aiAvailable || capped || busy} autoComplete="off" placeholder="Answer in English…" /><button className="coach-send" type="submit" disabled={!message.trim() || !view.aiAvailable || capped || busy} aria-label="Gửi">➤</button></form> : null}
      {error ? <p className="coach-error" role="alert">{error}</p> : null}
    </section>
    <p className="coach-footnote"><a href="/home">← Trang chủ</a> · Thử thách được lưu tự động; bạn có thể quay lại làm tiếp.</p>
  </main>;
}
