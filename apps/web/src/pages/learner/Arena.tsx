import { useState } from "react";
import type { ArenaView, GameKey } from "@e4s/contracts";
import { Avatar } from "./Profile.js";

const DUEL_GAMES: Array<{ key: Exclude<GameKey, "crossword">; icon: string; name: string }> = [
  { key: "scramble", icon: "🔤", name: "Word scramble" },
  { key: "eggs", icon: "🧺", name: "Season catch" },
  { key: "mario", icon: "🍄", name: "Season-rio" },
  { key: "sort", icon: "🗂️", name: "Word sort" },
  { key: "typing", icon: "⌨️", name: "Typing race" }
];

export function Arena({ view, onChallenge }: { view: ArenaView; onChallenge: (opponentId: string, game: Exclude<GameKey, "crossword">) => void | Promise<void> }) {
  const [opponent, setOpponent] = useState(view.opponents[0]?.id ?? "");
  const [game, setGame] = useState<Exclude<GameKey, "crossword">>("scramble");
  if (!view.eligible) return <main className="learner-page engagement-page"><section className="engagement-card arena-lock"><div className="lively-mark">🔒</div><div><span className="eyebrow">Đấu trường nội bộ</span><h1>Mở khoá từ mức B1</h1><p>Bảng xếp hạng và thách đấu 1-1 chỉ dành cho học viên từ B1 trở lên. Bạn đang ở mức {view.currentLevel} – học và thi lên mức rồi quay lại nhé.</p><a className="button button--primary" href="/games">← Mini game</a></div></section></main>;
  return <main className="learner-page engagement-page"><header className="engagement-title"><div><span className="eyebrow">Đấu trường nội bộ · B1+</span><h1>Xếp hạng & thách đấu</h1><p>Điểm = tổng % kỷ lục của từng trò (tối đa 600) + 50 mỗi trận thắng.</p></div><a className="button" href="/games">← Mini game</a></header>
    <section className="engagement-card"><h2>Bảng xếp hạng ({view.leaderboard.length} người)</h2><div className="arena-ranking">{view.leaderboard.length ? view.leaderboard.map((item) => <div className={`arena-player ${item.learnerId === view.learnerId ? "is-me" : ""}`} key={item.learnerId}><b>{item.rank <= 3 ? ["🥇", "🥈", "🥉"][item.rank - 1] : item.rank}</b>{item.avatar ? <Avatar avatar={item.avatar} name={item.displayName} /> : <span className="avatar-dot">{item.displayName.slice(0, 1)}</span>}<div><strong>{item.displayName}</strong><small>{item.cefr} · {item.played}/6 trò · thắng {item.won} / thua {item.lost} trận</small></div><em>{item.points}</em></div>) : <p className="muted">Chưa có ai.</p>}</div></section>
    <section className="engagement-card"><h2>⚔️ Thách đấu 1-1</h2><p>Cả hai chơi cùng một trò với cùng bộ từ của bạn; mỗi người một lượt, điểm % cao hơn thắng. Lời thách đấu nằm ở trang này của đối thủ.</p>{view.opponents.length && view.wordSetTopic ? <div className="challenge-row"><select aria-label="Đối thủ" value={opponent} onChange={(event) => setOpponent(event.target.value)}>{view.opponents.map((item) => <option value={item.id} key={item.id}>{item.displayName} ({item.cefr})</option>)}</select><select aria-label="Trò chơi" value={game} onChange={(event) => setGame(event.target.value as Exclude<GameKey, "crossword">)}>{DUEL_GAMES.map((item) => <option value={item.key} key={item.key}>{item.icon} {item.name}</option>)}</select><span className="muted">bộ từ: <strong>{view.wordSetTopic}</strong></span><button className="button button--primary" type="button" onClick={() => void onChallenge(opponent, game)}>Gửi lời thách đấu</button></div> : <p className="muted">{!view.wordSetTopic ? "Tạo một bộ từ ở Mini game trước." : "Chưa có học viên B1+ nào khác để thách đấu."}</p>}
      <div className="duel-list">{view.duels.length ? view.duels.map((duel) => <DuelRow key={duel.id} duel={duel} />) : <p className="muted">Chưa có trận nào.</p>}</div></section>
  </main>;
}

function DuelRow({ duel }: { duel: ArenaView["duels"][number] }) {
  const game = DUEL_GAMES.find((item) => item.key === duel.game);
  const state = duel.outcome === "play" ? "Đến lượt bạn" : duel.outcome === "waiting" ? "Chờ đối thủ" : duel.outcome === "win" ? "Thắng" : duel.outcome === "lose" ? "Thua" : "Hoà";
  const score = (value: typeof duel.myScore) => value ? `${value.score}/${value.maxScore} (${Math.round(100 * value.score / Math.max(1, value.maxScore))}%)` : "—";
  return <article><div><strong>{game ? `${game.icon} ${game.name}` : duel.game} · với {duel.opponent.displayName} <span className={`duel-state duel-state--${duel.outcome}`}>{state}</span></strong><small>{duel.wordSetTopic} · {new Date(duel.createdAt).toLocaleString("vi-VN")} · bạn: {score(duel.myScore)} · {duel.opponent.displayName.split(" ").at(-1)}: {score(duel.opponentScore)}</small></div>{duel.outcome === "play" ? <a className="button button--primary" href={`/duel/${duel.id}`}>{duel.challengedByMe ? "Chơi ván của bạn" : "Nhận lời ⚔️"}</a> : null}</article>;
}
