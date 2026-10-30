import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { GameDescriptor, GameHubView, GameKey, GameTopicModeration, GameWordSetView } from "@e4s/contracts";
import { seasonRioRoundPlan } from "@e4s/domain/engagement";
import { ArrowLeft, ArrowLeftRight, ArrowRight, Flag, Gift, Grid3X3, Heart, Image as ImageIcon, Keyboard, Layers3, Lightbulb, MousePointerClick, Play, ScanText, ShoppingBasket, Shuffle, Sun, Target, Timer, Trophy, Volume2, type LucideIcon } from "lucide-react";
import { CrosswordGame, ScrambleGame, SeasonCatchGame, SeasonRioGame, TypingRaceGame, WordSortGame } from "../games/index.js";
import { crosswordEntryCount } from "../games/CrosswordGame.js";
import type { GameWord } from "../games/types.js";
import type { LearnerCallbacks } from "./contracts.js";
import { ErrorText, Notice, PageTitle, AppLink } from "./ui.js";

type GameIdentity = Pick<GameDescriptor, "key" | "icon" | "name" | "description"> & { iconElement: ReactNode };

const gameIdentity: GameIdentity[] = [
  { key: "scramble", icon: "🔀", iconElement: <Shuffle size={28} strokeWidth={2} aria-hidden="true" />, name: "Xếp chữ", description: "Xếp chữ thành từ đúng." },
  { key: "crossword", icon: "▦", iconElement: <Grid3X3 size={28} strokeWidth={2} aria-hidden="true" />, name: "Ô chữ", description: "Điền từ theo gợi ý." },
  { key: "eggs", icon: "🧺", iconElement: <ShoppingBasket size={28} strokeWidth={2} aria-hidden="true" />, name: "Season catch", description: "Hứng đúng vật phẩm, giữ 3 mạng." },
  { key: "mario", icon: "☀", iconElement: <Sun size={28} strokeWidth={2} aria-hidden="true" />, name: "Season-rio", description: "Vượt cổng, đánh boss từ vựng." },
  { key: "sort", icon: "↔", iconElement: <ArrowLeftRight size={28} strokeWidth={2} aria-hidden="true" />, name: "Phân loại từ", description: "Xếp từ theo nhóm nghĩa." },
  { key: "typing", icon: "⌨", iconElement: <Keyboard size={28} strokeWidth={2} aria-hidden="true" />, name: "Đua gõ từ", description: "Gõ từ trước khi hết giờ." }
];

const compactTutorial: Record<GameKey, string[]> = {
  scramble: [
    "Đọc gợi ý và xếp các chữ thành từ đúng.",
    "Mỗi từ có tối đa 2 lần thử.",
    "Gợi ý mở một chữ nhưng sẽ giảm điểm."
  ],
  crossword: [
    "Chọn một hàng hoặc cột rồi đọc gợi ý.",
    "Điền từng chữ vào lưới.",
    "Kiểm tra đáp án; dùng gợi ý sẽ giảm điểm."
  ],
  eggs: [
    "Di chuyển rổ để hứng từ đúng với gợi ý.",
    "Hứng đúng được điểm; hứng sai mất một mạng.",
    "Mất đủ 3 mạng thì lượt chơi kết thúc."
  ],
  mario: [
    "Di chuyển, nhảy và mở từng hộp câu hỏi.",
    "Trả lời để mở cổng; trả lời sai mất một mạng.",
    "Vượt thử thách cuối rồi chạm cờ để hoàn thành."
  ],
  sort: [
    "Đọc từ và nghĩa được đưa ra.",
    "Chọn đúng nhóm từ loại.",
    "Đúng sẽ tăng chuỗi; sai sẽ hiện đáp án."
  ],
  typing: [
    "Đọc nghĩa hoặc xem hình gợi ý.",
    "Gõ từ và nhấn Enter trước khi hết giờ.",
    "Gõ đúng liên tiếp để tăng điểm combo."
  ]
};

const tutorialStepVisuals: Record<GameKey, readonly { kind: string; Icon: LucideIcon }[]> = {
  scramble: [{ kind: "read", Icon: ScanText }, { kind: "arrange", Icon: Shuffle }, { kind: "hint", Icon: Lightbulb }],
  crossword: [{ kind: "choose", Icon: MousePointerClick }, { kind: "grid", Icon: Grid3X3 }, { kind: "hint", Icon: Lightbulb }],
  eggs: [{ kind: "move", Icon: ArrowLeftRight }, { kind: "catch", Icon: Target }, { kind: "lives", Icon: Heart }],
  mario: [{ kind: "move", Icon: ArrowLeftRight }, { kind: "gift", Icon: Gift }, { kind: "finish", Icon: Flag }],
  sort: [{ kind: "read", Icon: ScanText }, { kind: "classify", Icon: Layers3 }, { kind: "streak", Icon: Trophy }],
  typing: [{ kind: "clue", Icon: ImageIcon }, { kind: "type", Icon: Keyboard }, { kind: "timer", Icon: Timer }]
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

type GameAvailability = { available: true } | { available: false; reason: string };

export function getGameAvailability(key: GameKey, words: readonly GameWord[]): GameAvailability {
  if (!words.length) return { available: false, reason: "Bộ từ chưa có dữ liệu để chơi." };
  if (key === "crossword" && crosswordEntryCount(words) < 3) return { available: false, reason: "Cần ít nhất 3 từ có chữ cái chung." };
  if (key === "sort" && words.filter((word) => word.partOfSpeech.trim()).length < 4) return { available: false, reason: "Cần ít nhất 4 từ có thông tin từ loại." };
  if (key === "typing" && !words.some((word) => /^[a-z][a-z\s'-]*$/i.test(word.english))) return { available: false, reason: "Bộ từ chưa có từ phù hợp để gõ." };
  return { available: true };
}

function getGameRoundSummary(descriptor: GameDescriptor, words: readonly GameWord[]) {
  if (descriptor.key !== "mario") return { goal: descriptor.goal, scoring: descriptor.scoring };
  const plan = seasonRioRoundPlan(words);
  return {
    goal: `Vượt ${plan.gateCount} cổng, trả lời ${plan.bossQuestions} câu Boss rồi chạm cờ.`,
    scoring: `+1 điểm mỗi câu đúng, tối đa ${plan.total} điểm.`
  };
}

export function LearnerGames({ view, actions }: { view: GameHubView; actions: LearnerCallbacks }) {
  const [topic, setTopic] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [moderation, setModeration] = useState<GameTopicModeration>(view.topicModeration ?? { state: "empty" });
  const topicLoading = busy || moderation.state === "loading";
  const topicGenerationDisabled = view.aiAvailable !== true || topicLoading;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!topic.trim() || topicGenerationDisabled) return; setBusy(true); setError(""); setModeration({ state: "loading" }); try { await actions.generateGameSet(topic.trim()); setTopic(""); setModeration({ state: "success", topic: topic.trim() }); } catch (reason) { const details = reason && typeof reason === "object" && "details" in reason ? (reason as { details?: { moderation?: GameTopicModeration } }).details?.moderation : undefined; if (details) setModeration(details); else setModeration({ state: "error", message: "Không thể kiểm tra chủ đề." }); setError(reason instanceof Error && reason.message === "TOPIC_CREATION_TEMPORARILY_LOCKED" ? "Bạn đã nhập 3 chủ đề không hợp lệ. Tạo bộ từ được mở lại sau 30 phút; người vận hành đã nhận được báo cáo." : reason instanceof Error && reason.message === "VOCABULARY_TOPIC_REJECTED" ? "Chủ đề này không có nghĩa hoặc không phù hợp cho học tập." : "Không tạo được bộ từ. Vui lòng thử lại."); } finally { setBusy(false); } };
  const runTopicAction = async (action: () => void | Promise<void>, message: string) => { if (topicLoading) return; setBusy(true); setError(""); try { await action(); } catch (reason) { setError(reason instanceof Error && reason.message === "LEARNED_VOCABULARY_NOT_FOUND" ? "Bạn chưa học từ vựng nào trong tuần này. Hãy mở một bài học trước rồi thử lại." : message); } finally { setBusy(false); } };
  return <div className="app-learner-page games-page"><PageTitle eyebrow="Mini game" title="Game từ vựng" detail={`Nhập chủ đề, tạo bộ từ đúng level ${view.cefr} rồi chơi.`} /><section className="card games-section-card games-topic-card" aria-labelledby="games-topic-title"><h2 id="games-topic-title">1. Chủ đề</h2><form className="row topic-create" style={topicFormStyle} aria-busy={topicLoading || undefined} onSubmit={submit}><input style={{ flex: "1 1 260px", minWidth: 0 }} aria-label="Chủ đề bộ từ" aria-describedby={!view.aiAvailable ? "game-topic-help" : undefined} disabled={topicGenerationDisabled} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="VD: coffee shop, sprint planning, du lịch, bóng đá…" /><button className="btn-primary" type="submit" aria-busy={topicLoading || undefined} disabled={topicGenerationDisabled || !topic.trim()}>{topicLoading ? "Đang tạo…" : "Tạo bộ từ"}</button><button className="btn-sm" type="button" aria-busy={topicLoading || undefined} disabled={topicLoading} onClick={() => void runTopicAction(() => actions.useWeeklyGameSet(), "Không tải được từ vựng tuần này. Vui lòng thử lại.")}>{topicLoading ? "Đang xử lý…" : "Dùng từ vựng tuần này"}</button></form>{!view.aiAvailable ? <p id="game-topic-help" className="muted">Chưa có API key; chỉ dùng được từ vựng tuần này. Báo vận hành nhập key trong Cài đặt.</p> : null}<TopicModerationNotice moderation={moderation} usesWeeklyVocabulary={view.wordSet?.source === "weekly"} /><ErrorText message={error} />{view.wordSet ? <div className="row between topic-source"><span><b>{view.wordSet.topic}</b> · {view.wordSet.words.length} từ</span><button className="btn-sm btn-danger" type="button" aria-busy={topicLoading || undefined} disabled={topicLoading} onClick={() => void runTopicAction(() => actions.deleteGameSet(), "Không xoá được bộ từ. Vui lòng thử lại.")}>{topicLoading ? "Đang xử lý…" : "Xoá bộ này"}</button></div> : null}</section>
    <section className="card games-section-card games-word-set-card" aria-labelledby="games-word-set-title">{view.wordSet ? <><div className="section-heading"><h2 id="games-word-set-title">2. Bộ từ: {view.wordSet.topic} <small>{view.wordSet.cefr}</small></h2></div>{view.wordSet.words.length ? <div className="word-chip-list" style={wordChipListStyle}>{view.wordSet.words.map((word) => <button className="word-chip" style={wordChipStyle} type="button" title={word.definition} onClick={() => actions.speak(word.english)} key={word.id}><Volume2 className="game-control-icon" size={15} strokeWidth={2} aria-hidden="true" /><b>{word.english}</b><span>– {word.vietnamese}</span></button>)}</div> : <Notice>Chưa có từ. Tạo chủ đề hoặc dùng từ tuần này.</Notice>}</> : <><h2 id="games-word-set-title">2. Bộ từ</h2><Notice>Tạo một bộ từ để bắt đầu chơi.</Notice></>}</section>
    <section className="card games-section-card" aria-labelledby="games-picker-title"><h2 id="games-picker-title">3. Chọn trò chơi</h2>{view.wordSet ? <div className="grid cols-3 game-grid" style={{ gap: 10 }}>{gameIdentity.map((identity) => { const live = view.games.find((game) => game.key === identity.key); const availability = getGameAvailability(identity.key, view.wordSet!.words); const content = <><span className="game-icon" aria-hidden="true">{identity.iconElement}</span><h3>{identity.name}</h3><p>{identity.description}</p>{availability.available ? (live?.best ? <b>Tốt nhất: {live.best.score}/{live.best.maxScore}</b> : <b>Sẵn sàng chơi</b>) : <small className="game-unavailable-reason">{availability.reason}</small>}</>; return availability.available ? <AppLink className={`tile game-tile game-${identity.key}`} style={gameTileStyle(identity.key)} href={`/games/${identity.key}`} navigate={actions.navigate} ariaLabel={`Chơi ${identity.name}`} key={identity.key}>{content}</AppLink> : <button className={`tile game-tile game-${identity.key} is-unavailable`} style={gameTileStyle(identity.key)} type="button" aria-label={`${identity.name} chưa sẵn sàng`} disabled key={identity.key}>{content}</button>; })}</div> : <Notice>Chưa thể chơi khi chưa có bộ từ.</Notice>}</section>
  </div>;
}

function TopicModerationNotice({ moderation, usesWeeklyVocabulary }: { moderation: GameTopicModeration; usesWeeklyVocabulary: boolean }) {
  if (moderation.state === "success") return <Notice tone="ok">Đã tạo bộ từ theo chủ đề <b>{moderation.topic}</b>.</Notice>;
  if (moderation.state === "empty" && usesWeeklyVocabulary) return <Notice tone="ok">Đang dùng bộ từ đã học trong tuần này.</Notice>;
  if (moderation.state === "empty") return <Notice>Nhập một chủ đề để tạo bộ từ.</Notice>;
  if (moderation.state === "loading") return <Notice>Đang kiểm tra và tạo bộ từ…</Notice>;
  if (moderation.state === "invalid") return <Notice tone="danger">{moderation.message}</Notice>;
  if (moderation.state === "unsafe") return <Notice tone="danger">Cảnh báo an toàn · {moderation.strike}/3 · {moderation.message}</Notice>;
  if (moderation.state === "reported") return <Notice tone="danger">Đã báo vận hành sau {moderation.strike}/3 lần vi phạm. {moderation.message}</Notice>;
  if (moderation.state === "ai_rejected") return <Notice tone="danger">AI từ chối chủ đề này. {moderation.message}</Notice>;
  return <Notice tone="danger">{moderation.message}</Notice>;
}

export function LearnerGame({ descriptor, wordSet, result, actions }: { descriptor: GameDescriptor; wordSet: GameWordSetView; result: { score: number; maxScore: number } | null | undefined; actions: LearnerCallbacks }) {
  const [started, setStarted] = useState(false); const [submitted, setSubmitted] = useState(false); const [attempt, setAttempt] = useState(0); const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState(""); const [pendingInput, setPendingInput] = useState<Parameters<LearnerCallbacks["finishGame"]>[0]>();
  const pageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!started) return;
    const main = pageRef.current?.closest<HTMLElement>("main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [started]);
  const finish = async (input: Parameters<LearnerCallbacks["finishGame"]>[0]) => { const payload = { ...input, attemptSeed: attempt }; setSubmitted(true); setPendingInput(payload); setSubmitError(""); setSubmitting(true); try { await actions.finishGame(payload); } catch { setSubmitError("Chưa lưu được kết quả lượt này. Kiểm tra kết nối rồi thử lại."); } finally { setSubmitting(false); } };
  const visualIdentity = gameIdentity.find((item) => item.key === descriptor.key);
  if (!started) {
    const instructions = compactTutorial[descriptor.key] ?? descriptor.instructions;
    const roundSummary = getGameRoundSummary(descriptor, wordSet.words);
    const backHref = "/games";
    const recordLabel = descriptor.best ? `Kỷ lục: ${descriptor.best.score}/${descriptor.best.maxScore}` : "Kỷ lục: chưa có";
    return <div ref={pageRef} className="app-learner-page game-page">
      <header className="page-title" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="game-title" style={{ marginTop: 0 }}><span className="game-title-icon" aria-hidden="true">{visualIdentity?.iconElement}</span><span>{descriptor.name}</span></h1>
          <p className="muted">{wordSet.topic} · {wordSet.words.length} từ</p>
          <span className="badge warn" id="gm-best" style={{ marginTop: 6 }}>{recordLabel}</span>
        </div>
        <AppLink className="btn btn-sm" href={backHref} navigate={actions.navigate} title="Dừng trò này" style={{ minHeight: 36, minWidth: 0 }}>Thoát game</AppLink>
      </header>
      <section className="card" id="gm-board" style={{ position: "relative", marginTop: 0 }}>
        <div className={`game-tutorial-content game-tutorial-${descriptor.key}`}>
          <div className="game-tutorial-hero-icon" aria-hidden="true">{visualIdentity?.iconElement}</div>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div className="eyebrow">Hướng dẫn chơi</div>
            <h2 className="game-tutorial-title">Cách chơi {descriptor.name}</h2>
            <p className="game-tutorial-goal">{roundSummary.goal}</p>
            <ol className="game-tutorial-steps">{instructions.slice(0, 3).map((line, index) => {
              const stepVisual = tutorialStepVisuals[descriptor.key][index] ?? { kind: "step", Icon: Lightbulb };
              const StepIcon = stepVisual.Icon;
              return <li key={line}><span className="game-tutorial-step-icon" data-step-kind={stepVisual.kind}><StepIcon size={22} strokeWidth={2.2} aria-hidden="true" /></span><span>{line}</span></li>;
            })}</ol>
            <div className="game-tutorial-meta"><span><Trophy size={18} aria-hidden="true" /><span><b>Điểm</b> · {roundSummary.scoring}</span></span><span><Layers3 size={18} aria-hidden="true" /><span><b>Bộ từ</b> · {wordSet.words.length} từ</span></span></div>
            <div className="row game-tutorial-actions">
              <button className="btn-primary btn-lg" type="button" onClick={() => { setAttempt((value) => value + 1); setStarted(true); }}><Play className="game-control-icon" size={19} aria-hidden="true" />Bắt đầu chơi</button>
              <AppLink className="btn" href={backHref} navigate={actions.navigate}><ArrowLeft className="game-control-icon" size={18} aria-hidden="true" />Quay lại</AppLink>
            </div>
          </div>
        </div>
      </section>
    </div>;
  }
  return <div ref={pageRef} className="app-learner-page game-page"><header className="row between"><div><div className="eyebrow game-running-title"><span className="game-title-icon" aria-hidden="true">{visualIdentity?.iconElement}</span><span>{descriptor.name}</span></div><h1>{wordSet.topic}</h1></div><div id="gm-best" className="badge">{descriptor.best ? `Kỷ lục: ${descriptor.best.score}/${descriptor.best.maxScore}` : "Chưa có kỷ lục"}</div></header><section id="gm-board" className="game-board">{submitted ? <section className="card"><h2>{submitError ? "Chưa lưu được kết quả" : result ? "GAME OVER" : "Đang ghi kết quả…"}</h2>{submitError ? <><Notice tone="danger">{submitError}</Notice><button className="btn-primary" type="button" disabled={submitting || !pendingInput} onClick={() => pendingInput ? void finish(pendingInput) : undefined}>{submitting ? "Đang gửi lại…" : "Thử gửi lại"}</button></> : null}{result ? <><div className="stat"><strong>{result.score}/{result.maxScore}</strong><span>Điểm</span></div>{<button className="btn-primary" type="button" onClick={() => { actions.resetGameResult(); setSubmitError(""); setPendingInput(undefined); setSubmitted(false); setStarted(false); setAttempt((value) => value + 1); }}><Play className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />Chơi lại</button>}<AppLink className="btn" href="/games" navigate={actions.navigate}>Chọn trò khác</AppLink></> : null}</section> : <GameEngine game={descriptor.key} wordSet={wordSet} attempt={attempt} finish={finish} actions={actions} />}</section><AppLink className="btn btn-danger" href="/games" navigate={actions.navigate}>Thoát</AppLink></div>;
}

function GameEngine({ game, wordSet, attempt, finish, actions }: { game: GameKey; wordSet: GameWordSetView; attempt: number; finish: (input: Parameters<LearnerCallbacks["finishGame"]>[0]) => void | Promise<void>; actions: LearnerCallbacks }) { switch (game) { case "scramble": return <ScrambleGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; case "crossword": return <CrosswordGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; case "eggs": return <SeasonCatchGame words={wordSet.words} cefr={wordSet.cefr} attemptSeed={attempt} onFinish={finish} />; case "mario": return <SeasonRioGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; case "sort": return <WordSortGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; case "typing": return <TypingRaceGame words={wordSet.words} imageSetId={wordSet.id} resolveImage={actions.resolveGameWordImage} attemptSeed={attempt} onFinish={finish} />; } }
