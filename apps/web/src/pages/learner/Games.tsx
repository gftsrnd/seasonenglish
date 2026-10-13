import { useState, type FormEvent } from "react";
import type { GameHubView } from "@e4s/contracts";

export function Games({ view, aiAvailable = view.aiAvailable ?? false, onGenerate, onUseWeekly, onDelete }: {
  view: GameHubView; aiAvailable?: boolean;
  onGenerate?: (topic: string) => void | Promise<void>;
  onUseWeekly?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!topic.trim() || !onGenerate || busy) return;
    setBusy(true); try { await onGenerate(topic.trim()); setTopic(""); } finally { setBusy(false); }
  };
  return <main className="learner-page engagement-page">
    <header className="engagement-title"><div><span className="eyebrow">Mini game</span><h1>Game từ vựng</h1><p>Nhập chủ đề bạn thích, Season tạo bộ từ đúng level {view.cefr}, rồi bắt đầu chơi thôi!</p></div></header>
    <section className="engagement-card"><h2>1. Chủ đề</h2>
      <form className="topic-create" onSubmit={(event) => void submit(event)}>
        <input aria-label="Chủ đề bộ từ" placeholder="VD: coffee shop, sprint planning, du lịch, bóng đá…" value={topic} onChange={(event) => setTopic(event.target.value)} />
        <button className="button button--primary" type="submit" disabled={!topic.trim() || !aiAvailable || !onGenerate || busy}>{busy ? "Đang tạo…" : "Tạo bộ từ"}</button>
        <button className="button" type="button" onClick={() => void onUseWeekly?.()}>Dùng từ vựng tuần này</button>
      </form>
      {!aiAvailable ? <p className="muted">Chưa có API key nên chỉ dùng được từ vựng tuần này – báo vận hành nhập key trong Cài đặt.</p> : null}
      <div className="topic-source"><strong>{view.wordSet.topic}</strong><span>{view.wordSet.words.length} từ</span>
        <button className="text-button" type="button" onClick={() => void onDelete?.()}>🗑 Xoá bộ này</button></div>
    </section>
    <section className="engagement-card"><div className="section-heading"><h2>2. Bộ từ: {view.wordSet.topic} <small>{view.wordSet.cefr}</small></h2><span>{view.wordSet.words.length} từ · bấm để nghe</span></div><div className="word-chip-list">{view.wordSet.words.map((word) => <button type="button" className="word-chip" key={word.id} title={word.definition} onClick={() => speak(word.english)}><span aria-hidden="true">🔊</span><b>{word.english}</b><span>– {word.vietnamese}</span></button>)}</div></section>
    <section className="engagement-card"><h2>3. Chọn trò chơi</h2><div className="game-grid">{view.games.map((game) => <a className={`game-tile game-tile--${game.key}`} href={`/games/${game.key}`} key={game.key}><span className="game-icon" aria-hidden="true">{game.icon}</span><strong>{game.name}</strong><small>{game.description}</small>{game.best ? <em>Tốt nhất: {game.best.score}/{game.best.maxScore}</em> : null}</a>)}</div></section>
    <a className={`arena-entry ${view.arena.eligible ? "is-open" : "is-locked"}`} href="/arena"><div><span className="eyebrow">{view.arena.eligible ? "Đấu trường nội bộ" : "🔒 Đấu trường nội bộ · mở từ B1"}</span><p>{view.arena.eligible ? `Bạn có ${view.arena.points} điểm${view.arena.pendingDuels ? ` · ${view.arena.pendingDuels} lời thách đấu đang chờ` : ""}` : "Xếp hạng và thi đấu với đồng nghiệp từ mức B1 trở lên."}</p></div><b>{view.arena.eligible ? "Vào →" : "B1+"}</b></a>
  </main>;
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}
