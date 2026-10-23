import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { ArenaView, DuelView, GameDescriptor, GameHubView, GameKey, GameTopicModeration, GameWordSetView } from "@e4s/contracts";
import { ArrowLeft, ArrowLeftRight, ArrowRight, Egg, Grid3X3, Keyboard, Play, Shuffle, Sun, Volume2 } from "lucide-react";
import { CrosswordGame, ScrambleGame, SeasonCatchGame, SeasonRioGame, TypingRaceGame, WordSortGame } from "../games/index.js";
import type { LearnerCallbacks } from "./contracts.js";
import { ErrorText, Notice, PageTitle, AppLink } from "./ui.js";

type GameIdentity = Pick<GameDescriptor, "key" | "icon" | "name" | "description"> & { iconElement: ReactNode };

const gameIdentity: GameIdentity[] = [
  { key: "scramble", icon: "🔀", iconElement: <Shuffle size={28} strokeWidth={2} aria-hidden="true" />, name: "Xếp chữ", description: "Xếp chữ thành từ đúng." },
  { key: "crossword", icon: "▦", iconElement: <Grid3X3 size={28} strokeWidth={2} aria-hidden="true" />, name: "Ô chữ", description: "Điền từ theo gợi ý." },
  { key: "eggs", icon: "🥚", iconElement: <Egg size={28} strokeWidth={2} aria-hidden="true" />, name: "Season catch", description: "Hứng đúng vật phẩm, giữ 3 mạng." },
  { key: "mario", icon: "☀", iconElement: <Sun size={28} strokeWidth={2} aria-hidden="true" />, name: "Season-rio", description: "Vượt cổng, đánh boss từ vựng." },
  { key: "sort", icon: "↔", iconElement: <ArrowLeftRight size={28} strokeWidth={2} aria-hidden="true" />, name: "Phân loại từ", description: "Xếp từ theo nhóm nghĩa." },
  { key: "typing", icon: "⌨", iconElement: <Keyboard size={28} strokeWidth={2} aria-hidden="true" />, name: "Đua gõ từ", description: "Gõ từ trước khi hết giờ." }
];

const compactTutorial: Record<GameKey, string[]> = {
  scramble: [
    "Đọc gợi ý rồi bấm hoặc gõ chữ cái để xếp thành từ; ⌫ xoá chữ cuối.",
    "Nếu xếp sai, ô rung và bạn có tối đa 2 lần thử mỗi từ.",
    "Dùng Gợi ý để mở chữ tiếp theo; từ đó bị trừ nửa điểm."
  ],
  crossword: [
    "Mỗi số trên lưới ứng với một gợi ý ngang hoặc dọc.",
    "Gõ vào ô; ô tự nhảy sang ô kế, phím mũi tên để di chuyển.",
    "Kiểm tra để xem ô đúng xanh, sai đỏ; Gợi ý 1 chữ trừ 1 điểm."
  ],
  eggs: [
    "Đưa rổ hứng vật phẩm đúng theo gợi ý; kéo/chạm hoặc dùng ← → để di chuyển.",
    "Hứng đúng được +1; hứng nhầm hoặc bỏ lỡ mất ❤️. Tốc độ tăng theo CEFR.",
    "Mất 3 ❤️ thì kết thúc."
  ],
  mario: [
    "Chạy bằng phím ← →, nhảy bằng Space hoặc ↑ (điện thoại: 3 nút dưới màn hình).",
    "Mỗi hộp quà ? đứng trên một cột gỗ chắn ngang đường: chạm vào hộp hoặc cột → câu hỏi từ vựng, chọn 1 trong 4. Đúng: 🍄 (+1). Sai: mất 1 ❤️. Trả lời xong (đúng hay sai) cổng mới mở, nên không bỏ qua hộp nào được.",
    "Đường khúc khuỷu: có hộp đặt trên bục gỗ, có hộp trên bục cao phải leo bậc. Cuối màn là món ăn khoái khẩu KHỔNG LỒ của nhân vật (thỏ – cà rốt, sóc – hạt dẻ, cánh cụt – cá…): chạm vào là đồng hồ 10 giây chạy; mỗi câu đúng ăn 1 miếng (3 miếng), sai mất 1 ❤️; quá 10 giây món ăn bị hỏng → thua.",
    "Ăn hết món khổng lồ rồi chạm cờ để về đích. Hết 3 ❤️ hoặc để món ăn hỏng là thua."
  ],
  sort: [
    "Mỗi lượt có một từ, nghĩa và các nhóm từ loại.",
    "Chọn nhóm đúng: đúng +1 và tăng chuỗi; sai hiện đáp án và reset chuỗi.",
    "Nhìn hậu tố và cách dùng trong cụm từ để chọn."
  ],
  typing: [
    "Mỗi từ có nghĩa, định nghĩa và hình minh hoạ nếu có.",
    "Gõ bằng phím ảo hoặc bàn phím thật rồi Enter trước khi hết giờ.",
    "Đúng +10 × combo (tối đa ×5); sai hoặc hết giờ reset combo.",
    "Chữ đúng xanh, sai đỏ; dùng ⌫ để sửa."
  ]
};

const gameTileBackground: Record<GameKey, string> = {
  scramble: "var(--tile-1)",
  crossword: "var(--primary-soft)",
  eggs: "var(--tile-2)",
  mario: "var(--tile-3)",
  sort: "var(--primary-soft)",
  typing: "var(--tile-1)"
};

const topicFormStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const wordChipListStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 7 };
const wordChipStyle: CSSProperties = { minHeight: 40, minWidth: 0, maxWidth: "100%", borderRadius: 999, background: "var(--surface-2)", padding: "5px 10px", fontSize: ".72rem", boxShadow: "none", whiteSpace: "normal", overflowWrap: "anywhere", textAlign: "left" };

function gameTileStyle(key: GameKey): CSSProperties {
  return { display: "grid", alignContent: "start", alignItems: "stretch", gridTemplateRows: "auto auto minmax(0, 1fr) auto", gap: 5, minHeight: 130, minWidth: 0, height: "100%", borderRadius: 14, padding: 14, background: gameTileBackground[key], textDecoration: "none", overflowWrap: "anywhere" };
}

export function LearnerGames({ view, actions }: { view: GameHubView; actions: LearnerCallbacks }) {
  const [topic, setTopic] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [moderation, setModeration] = useState<GameTopicModeration>(view.topicModeration ?? { state: "empty" });
  const topicLoading = busy || moderation.state === "loading";
  const topicGenerationDisabled = view.aiAvailable !== true || topicLoading;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!topic.trim() || topicGenerationDisabled) return; setBusy(true); setError(""); setModeration({ state: "loading" }); try { await actions.generateGameSet(topic.trim()); setTopic(""); setModeration({ state: "success", topic: topic.trim() }); } catch (reason) { const details = reason && typeof reason === "object" && "details" in reason ? (reason as { details?: { moderation?: GameTopicModeration } }).details?.moderation : undefined; if (details) setModeration(details); else setModeration({ state: "error", message: "Không thể kiểm tra chủ đề." }); setError(reason instanceof Error && reason.message === "TOPIC_CREATION_TEMPORARILY_LOCKED" ? "Bạn đã nhập 3 chủ đề không hợp lệ. Tạo bộ từ được mở lại sau 30 phút; người vận hành đã nhận được báo cáo." : reason instanceof Error && reason.message === "VOCABULARY_TOPIC_REJECTED" ? "Chủ đề này không có nghĩa hoặc không phù hợp cho học tập." : "Không tạo được bộ từ. Vui lòng thử lại."); } finally { setBusy(false); } };
  const runTopicAction = async (action: () => void | Promise<void>, message: string) => { if (topicLoading) return; setBusy(true); setError(""); try { await action(); } catch { setError(message); } finally { setBusy(false); } };
  return <div className="app-learner-page games-page"><PageTitle eyebrow="Mini game" title="Game từ vựng" detail={`Nhập chủ đề, tạo bộ từ đúng level ${view.cefr} rồi chơi.`} /><section className="card"><h2>1. Chủ đề</h2><form className="row topic-create" style={topicFormStyle} aria-busy={topicLoading || undefined} onSubmit={submit}><input style={{ flex: "1 1 260px", minWidth: 0 }} aria-label="Chủ đề bộ từ" aria-describedby={!view.aiAvailable ? "game-topic-help" : undefined} disabled={topicGenerationDisabled} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="VD: coffee shop, sprint planning, du lịch, bóng đá…" /><button className="btn-primary" type="submit" aria-busy={topicLoading || undefined} disabled={topicGenerationDisabled || !topic.trim()}>{topicLoading ? "Đang tạo…" : "Tạo bộ từ"}</button><button className="btn-sm" type="button" aria-busy={topicLoading || undefined} disabled={topicLoading} onClick={() => void runTopicAction(() => actions.useWeeklyGameSet(), "Không tải được từ vựng tuần này. Vui lòng thử lại.")}>{topicLoading ? "Đang xử lý…" : "Dùng từ vựng tuần này"}</button></form>{!view.aiAvailable ? <p id="game-topic-help" className="muted">Chưa có API key; chỉ dùng được từ vựng tuần này. Báo vận hành nhập key trong Cài đặt.</p> : null}<TopicModerationNotice moderation={moderation} /><ErrorText message={error} />{view.wordSet ? <div className="row between topic-source"><span><b>{view.wordSet.topic}</b> · {view.wordSet.words.length} từ</span><button className="btn-sm btn-danger" type="button" aria-busy={topicLoading || undefined} disabled={topicLoading} onClick={() => void runTopicAction(() => actions.deleteGameSet(), "Không xoá được bộ từ. Vui lòng thử lại.")}>{topicLoading ? "Đang xử lý…" : "Xoá bộ này"}</button></div> : null}</section>
    <section className="card">{view.wordSet ? <><div className="section-heading"><h2>2. Bộ từ: {view.wordSet.topic} <small>{view.wordSet.cefr}</small></h2></div>{view.wordSet.words.length ? <div className="word-chip-list" style={wordChipListStyle}>{view.wordSet.words.map((word) => <button className="word-chip" style={wordChipStyle} type="button" title={word.definition} onClick={() => actions.speak(word.english)} key={word.id}><Volume2 className="game-control-icon" size={15} strokeWidth={2} aria-hidden="true" /><b>{word.english}</b><span>– {word.vietnamese}</span></button>)}</div> : <Notice>Chưa có từ. Tạo chủ đề hoặc dùng từ tuần này.</Notice>}</> : <><h2>2. Bộ từ</h2><Notice>Tạo một bộ từ để bắt đầu chơi.</Notice></>}</section>
    <section className="card"><h2>3. Chọn trò chơi</h2>{view.wordSet ? <div className="grid cols-3 game-grid" style={{ gap: 10 }}>{gameIdentity.map((identity) => { const live = view.games.find((game) => game.key === identity.key); return <AppLink className={`tile game-tile game-${identity.key}`} style={gameTileStyle(identity.key)} href={`/games/${identity.key}`} navigate={actions.navigate} ariaLabel={`Chơi ${identity.name}`} key={identity.key}><span className="game-icon" aria-hidden="true">{identity.iconElement}</span><h3>{identity.name}</h3><p>{identity.description}</p>{live?.best ? <b>Tốt nhất: {live.best.score}/{live.best.maxScore}</b> : null}</AppLink>; })}</div> : <Notice>Chưa thể chơi khi chưa có bộ từ.</Notice>}</section>
    <AppLink className={`arena-entry ${view.arena.eligible ? "open" : "locked"}`} style={{ display: "flex", width: "100%", minWidth: 0, boxSizing: "border-box", marginTop: 12, padding: 16, background: view.arena.eligible ? "var(--primary-soft)" : "var(--surface)" }} href="/arena" navigate={actions.navigate}><div><div className="eyebrow">{view.arena.eligible ? "Đấu trường nội bộ" : "🔒 Đấu trường nội bộ · mở từ B1"}</div><p>{view.arena.eligible ? `${view.arena.points} điểm${view.arena.pendingDuels ? ` · ${view.arena.pendingDuels} lời thách đấu đang chờ` : ""}` : "Xếp hạng và thi đấu từ B1+."}</p></div><b>{view.arena.eligible ? "Vào →" : "B1+"}</b></AppLink>
  </div>;
}

function TopicModerationNotice({ moderation }: { moderation: GameTopicModeration }) {
  if (moderation.state === "success") return <Notice tone="ok">Đã tạo bộ từ theo chủ đề <b>{moderation.topic}</b>.</Notice>;
  if (moderation.state === "empty") return <Notice>Nhập một chủ đề để tạo bộ từ.</Notice>;
  if (moderation.state === "loading") return <Notice>Đang kiểm tra và tạo bộ từ…</Notice>;
  if (moderation.state === "invalid") return <Notice tone="danger">{moderation.message}</Notice>;
  if (moderation.state === "unsafe") return <Notice tone="danger">Cảnh báo an toàn · {moderation.strike}/3 · {moderation.message}</Notice>;
  if (moderation.state === "reported") return <Notice tone="danger">Đã báo vận hành sau {moderation.strike}/3 lần vi phạm. {moderation.message}</Notice>;
  if (moderation.state === "ai_rejected") return <Notice tone="danger">AI từ chối chủ đề này. {moderation.message}</Notice>;
  return <Notice tone="danger">{moderation.message}</Notice>;
}

export function LearnerGame({ descriptor, wordSet, result, actions, duel }: { descriptor: GameDescriptor; wordSet: GameWordSetView; result: { score: number; maxScore: number } | null | undefined; actions: LearnerCallbacks; duel?: boolean }) {
  const [started, setStarted] = useState(false); const [submitted, setSubmitted] = useState(false); const [attempt, setAttempt] = useState(0); const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState(""); const [pendingInput, setPendingInput] = useState<Parameters<LearnerCallbacks["finishGame"]>[0]>();
  const pageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!started) return;
    const main = pageRef.current?.closest<HTMLElement>("main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [started]);
  const finish = async (input: Parameters<LearnerCallbacks["finishGame"]>[0]) => { setSubmitted(true); setPendingInput(input); setSubmitError(""); setSubmitting(true); try { await actions.finishGame(input); } catch { setSubmitError("Chưa lưu được kết quả lượt này. Kiểm tra kết nối rồi thử lại."); } finally { setSubmitting(false); } };
  if (!started) {
    const instructions = compactTutorial[descriptor.key] ?? descriptor.instructions;
    const backHref = duel ? "/arena" : "/games";
    const recordLabel = descriptor.best ? `Kỷ lục: ${descriptor.best.score}/${descriptor.best.maxScore}` : "Kỷ lục: chưa có";
    return <div ref={pageRef} className="app-learner-page game-page">
      <header className="page-title" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ marginTop: 0 }}>{descriptor.icon} {descriptor.name}</h1>
          <p className="muted">{wordSet.topic} · {wordSet.words.length} từ</p>
          <span className="badge warn" id="gm-best" style={{ marginTop: 6 }}>{recordLabel}</span>
        </div>
        <AppLink className="btn btn-sm" href={backHref} navigate={actions.navigate} title="Dừng trò này" style={{ minHeight: 36, minWidth: 0 }}>Thoát game</AppLink>
      </header>
      <section className="card" id="gm-board" style={{ position: "relative", marginTop: 0 }}>
        <div className="game-tutorial-content" style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div className="eyebrow">Hướng dẫn chơi</div>
            <h3 style={{ margin: "2px 0 6px", lineHeight: 1.25 }}>{descriptor.icon} {descriptor.name} – {descriptor.goal}</h3>
            <ol className="small" style={{ margin: 0, paddingLeft: 20, fontWeight: 500, lineHeight: 1.6 }}>{instructions.map((line) => <li key={line}>{line}</li>)}</ol>
            <p className="small" style={{ margin: "8px 0 0" }}><b>Tính điểm:</b> {descriptor.scoring}</p>
            <p className="xs muted" style={{ margin: "4px 0 0" }}>Bộ từ: {wordSet.topic} · {wordSet.words.length} từ. Nút <b>Thoát game</b> ở góc trên dừng trò bất cứ lúc nào (lượt chơi dở không được tính).</p>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn-primary btn-lg" type="button" onClick={() => { setAttempt((value) => value + 1); setStarted(true); }}><Play className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />Bắt đầu chơi</button>
              <AppLink className="btn" href={backHref} navigate={actions.navigate}><ArrowLeft className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />Quay lại</AppLink>
            </div>
          </div>
        </div>
      </section>
    </div>;
  }
  return <div ref={pageRef} className="app-learner-page game-page"><header className="row between"><div><div className="eyebrow">{descriptor.icon} {descriptor.name}</div><h1>{wordSet.topic}</h1></div><div id="gm-best" className="badge">{descriptor.best ? `Kỷ lục: ${descriptor.best.score}/${descriptor.best.maxScore}` : "Chưa có kỷ lục"}</div></header><section id="gm-board" className="game-board">{submitted ? <section className="card"><h2>{submitError ? "Chưa lưu được kết quả" : result ? "GAME OVER" : "Đang ghi kết quả…"}</h2>{submitError ? <><Notice tone="danger">{submitError}</Notice><button className="btn-primary" type="button" disabled={submitting || !pendingInput} onClick={() => pendingInput ? void finish(pendingInput) : undefined}>{submitting ? "Đang gửi lại…" : "Thử gửi lại"}</button></> : null}{result ? <><div className="stat"><strong>{result.score}/{result.maxScore}</strong><span>Điểm</span></div>{!duel ? <button className="btn-primary" type="button" onClick={() => { actions.resetGameResult(); setSubmitError(""); setPendingInput(undefined); setSubmitted(false); setStarted(false); setAttempt((value) => value + 1); }}><Play className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />Chơi lại</button> : null}<AppLink className="btn" href={duel ? "/arena" : "/games"} navigate={actions.navigate}>{duel ? "Về đấu trường" : "Chọn trò khác"}</AppLink></> : null}</section> : <GameEngine game={descriptor.key} wordSet={wordSet} attempt={attempt} finish={finish} actions={actions} />}</section><AppLink className="btn btn-danger" href={duel ? "/arena" : "/games"} navigate={actions.navigate}>Thoát</AppLink></div>;
}

function GameEngine({ game, wordSet, attempt, finish, actions }: { game: GameKey; wordSet: GameWordSetView; attempt: number; finish: (input: Parameters<LearnerCallbacks["finishGame"]>[0]) => void | Promise<void>; actions: LearnerCallbacks }) { switch (game) { case "scramble": return <ScrambleGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; case "crossword": return <CrosswordGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; case "eggs": return <SeasonCatchGame words={wordSet.words} cefr={wordSet.cefr} attemptSeed={attempt} onFinish={finish} />; case "mario": return <SeasonRioGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; case "sort": return <WordSortGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; case "typing": return <TypingRaceGame words={wordSet.words} imageSetId={wordSet.id} resolveImage={actions.resolveGameWordImage} attemptSeed={attempt} onFinish={finish} />; } }

export function LearnerArena({ view, actions }: { view: ArenaView; actions: LearnerCallbacks }) { const [opponent,setOpponent]=useState(view.opponents[0]?.id ?? ""); const [game,setGame]=useState<Exclude<GameKey,"crossword">>("scramble"); if (!view.eligible) return <div className="app-learner-page"><PageTitle title="Đấu trường nội bộ" /><Notice tone="warn">Đấu trường mở từ B1. Bạn đang ở mức {view.currentLevel}.</Notice><AppLink className="btn" href="/games" navigate={actions.navigate}>Về Mini game</AppLink></div>; return <div className="app-learner-page"><AppLink href="/games" navigate={actions.navigate}><ArrowLeft className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />Về Mini game</AppLink><PageTitle eyebrow={`${view.points} điểm đấu trường`} title="Đấu trường nội bộ" /><section className="card"><h2>Bảng xếp hạng</h2>{view.leaderboard.length ? <div className="table-wrap"><table><thead><tr><th>Hạng</th><th>Người học</th><th>Mức</th><th>Điểm</th><th>Thắng / thua</th></tr></thead><tbody>{view.leaderboard.map((row) => <tr key={row.learnerId}><td>{row.rank}</td><td>{row.displayName}{row.learnerId === view.learnerId ? " (Bạn)" : ""}</td><td>{row.cefr}</td><td>{row.points}</td><td>{row.won}/{row.lost}</td></tr>)}</tbody></table></div> : <Notice>Chưa có kết quả đấu trường.</Notice>}</section><section className="card"><h2>Thách đấu đồng nghiệp</h2>{view.opponents.length ? <div className="row"><select aria-label="Đối thủ" value={opponent} onChange={(e)=>setOpponent(e.target.value)}>{view.opponents.map((item)=><option value={item.id} key={item.id}>{item.displayName} · {item.cefr}</option>)}</select><select aria-label="Trò chơi" value={game} onChange={(e)=>setGame(e.target.value as typeof game)}>{gameIdentity.filter((item)=>item.key!=="crossword").map((item)=><option value={item.key} key={item.key}>{item.name}</option>)}</select><button className="btn-primary" type="button" onClick={()=>void actions.createDuel(opponent,game)}>Gửi thách đấu</button></div> : <Notice>Chưa có đối thủ phù hợp.</Notice>}</section><section className="card"><h2>Các ván thách đấu</h2>{view.duels.length ? view.duels.map((duel)=><article className="arena-row" key={duel.id}><div><b>{duel.opponent.displayName}</b><p>{duel.wordSetTopic} · {gameIdentity.find((item)=>item.key===duel.game)?.name}</p></div><span className="badge">{duelStatusLabel(duel)}</span>{duel.outcome === "play" ? <AppLink className="btn btn-primary" href={`/duel/${duel.id}`} navigate={actions.navigate}>Chơi ngay</AppLink> : null}</article>) : <Notice>Chưa có ván nào.</Notice>}</section></div>; }

function duelStatusLabel(duel: ArenaView["duels"][number]) {
  if (duel.outcome === "play") return duel.challengedByMe ? "Chờ đối thủ" : "Đến lượt bạn";
  if (duel.outcome === "waiting") return "Chờ đối thủ";
  if (duel.outcome === "win") return "Thắng";
  if (duel.outcome === "lose") return "Thua";
  return "Hoà";
}

export function LearnerDuel({ view, descriptor, actions }: { view: DuelView; descriptor: GameDescriptor; actions: LearnerCallbacks }) {
  if (view.outcome !== "play") return <DuelTerminal view={view} actions={actions} />;
  return <LearnerGame descriptor={descriptor} wordSet={view.wordSet} result={view.result ? { score: view.result.score, maxScore: view.result.maxScore } : null} actions={actions} duel />;
}

function DuelTerminal({ view, actions }: { view: DuelView; actions: LearnerCallbacks }) {
  const score = view.result ?? view.myScore;
  const title = view.outcome === "waiting" ? "Đã ghi kết quả – chờ đối thủ chơi" : view.outcome === "win" ? "Bạn thắng" : view.outcome === "lose" ? "Bạn thua" : "Hoà";
  const detail = view.outcome === "waiting" ? "Kết quả của bạn đã được lưu. Đấu trường sẽ cập nhật khi đối thủ hoàn thành ván chơi." : "Ván đấu đã hoàn tất. Kết quả đã được ghi vào bảng xếp hạng.";
  return <div className="app-learner-page game-page"><AppLink href="/arena" navigate={actions.navigate}>← Về đấu trường</AppLink><PageTitle eyebrow="Đấu trường nội bộ" title={title} detail={detail} /><section className="card"><div className="stat"><strong>{score ? `${score.score}/${score.maxScore}` : "—"}</strong><span>Điểm của bạn</span></div>{view.opponentScore ? <p className="muted">Đối thủ: {view.opponentScore.score}/{view.opponentScore.maxScore} điểm</p> : null}<Notice tone={view.outcome === "waiting" ? "info" : "ok"}>{view.outcome === "waiting" ? "Đang chờ đối thủ chơi xong." : "Bạn không thể mở lại ván đấu này."}</Notice><AppLink className="btn btn-primary" href="/arena" navigate={actions.navigate}>Về đấu trường</AppLink></section></div>;
}
