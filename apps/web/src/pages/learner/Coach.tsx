import { useState, type FormEvent } from "react";
import type { CoachPersona, CoachView } from "@e4s/contracts";

interface CoachProps {
  view: CoachView;
  onSend: (message: string) => void | Promise<void>;
  onPersonaChange: (persona: CoachPersona) => void | Promise<void>;
  onNewChat: () => void | Promise<void>;
}

export function Coach({ view, onSend, onPersonaChange, onNewChat }: CoachProps) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const capped = view.daily.used >= view.daily.limit;
  const canSend = view.aiAvailable && !capped && !busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next = message.trim();
    if (!next || !canSend) return;
    setBusy(true); setError("");
    try { await onSend(next); setMessage(""); }
    catch { setError("Season chưa gửi được phản hồi. Câu trả lời của bạn vẫn còn để thử lại."); }
    finally { setBusy(false); }
  };

  const act = async (operation: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await operation(); }
    catch { setError("Chưa lưu được thay đổi. Vui lòng thử lại."); }
    finally { setBusy(false); }
  };

  return <main className="learner-page learner-page--coach">
    <section className="coach-card" aria-label="Luyện với Season">
      <header className="coach-header">
        <SeasonEmblem />
        <div className="coach-title"><h1>Season</h1><p>{view.topic} · {view.cefr}</p></div>
        <div className="coach-actions" role="group" aria-label="Phong cách của Season">
          {(["informal", "formal"] as const).map((persona) => <button
            key={persona}
            type="button"
            className={view.persona === persona ? "is-active" : ""}
            aria-pressed={view.persona === persona}
            disabled={busy}
            onClick={() => void act(() => onPersonaChange(persona))}
          >{persona === "informal" ? "Informal" : "Formal"}</button>)}
          <button type="button" disabled={busy} onClick={() => void act(onNewChat)}>Xoá chat</button>
        </div>
      </header>

      {!view.aiAvailable ? <div className="coach-warning" role="status"><SeasonOops /><span>Chưa kết nối AI nên Season chưa trả lời được. Báo người vận hành kiểm tra kết nối AI trong Cài đặt.</span></div> : null}

      <div className="coach-limits">
        <div className="coach-limit-badges">
          <span className={`coach-badge ${capped ? "is-danger" : "is-primary"}`}>Hôm nay {view.daily.used}/{view.daily.limit} lượt</span>
          <span className={`coach-badge ${view.weekly.turns >= view.weekly.target ? "is-success" : ""}`}>Tuần này {view.weekly.turns} lượt{view.weekly.turns >= view.weekly.target ? " ✓" : ` · mục tiêu ≥${view.weekly.target}`}</span>
        </div>
        <details><summary>Giới hạn chat hoạt động thế nào?</summary><p>1 lượt = 1 tin nhắn bạn gửi và Season trả lời kèm chấm điểm. Mỗi người được tối đa <strong>{view.daily.limit} lượt mỗi ngày</strong>; bộ đếm về 0 lúc 0 giờ. Xoá chat không trả lại lượt đã dùng. Tin nhắn lỗi không tính lượt.</p></details>
      </div>

      {capped ? <div className="coach-warning" role="status"><span>Bạn đã dùng hết {view.daily.limit} lượt hôm nay. Ô nhập sẽ mở lại vào ngày mai.</span></div> : null}

      <div className="coach-chat" role="log" aria-label="Hội thoại với Season" aria-live="polite">
        {view.messages.map((item) => <div className="coach-message-group" data-speaker={item.speaker} key={item.id}>
          {item.feedback ? <CoachFeedback feedback={item.feedback} /> : null}
          <div className={`coach-message coach-message--${item.speaker}`}>{item.text}</div>
        </div>)}
        {busy ? <div className="coach-message coach-message--coach coach-thinking"><span className="spinner" aria-hidden="true" /> Season đang nghĩ…</div> : null}
      </div>

      <section className="coach-vocabulary" aria-label="Ô từ bí mật">
        <div className="coach-vocabulary-heading"><strong>Ô từ bí mật: dùng đúng từ trong một câu đúng ngữ cảnh để mở ô</strong><span>{view.vocabulary.filter((item) => item.opened).length}/{view.vocabulary.length}</span></div>
        <div className="coach-word-slots">{view.vocabulary.map((item) => item.opened
          ? <button type="button" className="coach-word is-open" title={item.meaning} key={item.word}>✓ {item.word}</button>
          : <span className="coach-word" title="Chưa mở" key={item.word}>? {item.meaning}</span>)}</div>
      </section>

      <form className="coach-compose" onSubmit={(event) => void submit(event)}>
        <input value={message} onChange={(event) => setMessage(event.target.value)} disabled={!view.aiAvailable || capped || busy} autoComplete="off" placeholder="Viết câu trả lời bằng tiếng Anh…" />
        <button className="coach-mic" type="button" aria-label="Nói" disabled={!view.aiAvailable || capped || busy}><MicIcon /></button>
        <button className="coach-send" type="submit" aria-label="Gửi" disabled={!canSend || !message.trim()}><SendIcon /></button>
      </form>
      {error ? <p className="coach-error" role="alert">{error}</p> : null}
    </section>
    <p className="coach-footnote">Mỗi lượt Season trả lời, chấm 3 tiêu chí (đúng ý · từ vựng · ngữ pháp) và gợi ý tối đa 3 chỗ sửa. Mục tiêu: ≥{view.weekly.target} lượt mỗi tuần.</p>
  </main>;
}

function CoachFeedback({ feedback }: { feedback: CoachView["messages"][number]["feedback"] }) {
  if (!feedback) return null;
  const hasSuggestions = feedback.suggestions.length > 0;
  return <aside className={`coach-feedback ${feedback.relevant ? "" : "is-off-topic"}`} aria-label="Phản hồi cho câu trả lời">
    <div className="coach-feedback-heading"><strong>{!feedback.relevant ? "Chưa trả lời đúng câu hỏi" : hasSuggestions ? "Gần đúng rồi!" : "Tốt lắm!"}</strong><div>
      <span>Ý {feedback.rubric.meaning}/5</span><span>Từ {feedback.rubric.vocabulary}/5</span><span>NP {feedback.rubric.grammar}/5</span>
    </div></div>
    {feedback.relevanceNote ? <p>{feedback.relevanceNote}</p> : null}
    {feedback.suggestions.map((suggestion) => <div className="coach-fix" key={`${suggestion.original}:${suggestion.corrected}`}>
      <p><s>{suggestion.original}</s> → <mark>{suggestion.corrected}</mark></p><small>{suggestion.explanation}</small>
    </div>)}
    {feedback.correctedText && hasSuggestions ? <p className="coach-corrected">✓ <i>{feedback.correctedText}</i></p> : null}
  </aside>;
}

function SeasonEmblem() { return <span className="season-emblem" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M6 26C6 13 14 6 27 6c0 13-7 21-21 20z" /><path d="M6 26c4-7 9-12 15-16" /></svg></span>; }
function SeasonOops() { return <span className="season-oops" aria-hidden="true">☀</span>; }
function MicIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>; }
function SendIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 16-8-5 16-3-6-8-2Z" /><path d="m12 14 8-10" /></svg>; }
