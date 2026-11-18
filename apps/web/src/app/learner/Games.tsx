import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { ArenaView, DuelView, GameDescriptor, GameHubView, GameKey, GameTopicModeration, GameWordSetView } from "@e4s/contracts";
import { seasonRioRoundPlan } from "@e4s/domain/engagement";
import { ArrowLeft, ArrowLeftRight, LogOut, Trash2, ArrowRight, Flag, Gift, Grid3X3, Heart, Keyboard, Layers3, Lightbulb, MousePointerClick, Play, ScanText, ShoppingBasket, Shuffle, Sun, Target, Timer, Trophy, Volume2, type LucideIcon } from "lucide-react";
import { CrosswordGame, ScrambleGame, SeasonCatchGame, SeasonRioGame, TypingRaceGame, WordSortGame } from "../games/index.js";
import { crosswordEntryCount } from "../games/CrosswordGame.js";
import { gameRoundWordCount, type GameWord } from "../games/types.js";
import type { LearnerCallbacks } from "./contracts.js";
import { ErrorText, Notice, PageTitle, AppLink } from "./ui.js";
import { useModal } from "../shared/ModalProvider.js";
import { useMediaQuery } from "../shared/useMediaQuery.js";
import { ActionLabel, InfoTitle, useCompactUi } from "../shared/CompactUi.js";
import { Pager, usePaged } from "../shared/Pager.js";

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
    "Hứng đúng được điểm; hứng sai hoặc để rơi mất một mạng.",
    "Mất đủ 3 mạng thì lượt chơi kết thúc."
  ],
  mario: [
    "Di chuyển, nhảy và mở từng hộp câu hỏi.",
    "Trả lời để mở cổng; trả lời sai mất một mạng.",
    "Vượt thử thách cuối rồi chạm cờ để hoàn thành."
  ],
  sort: [
    "Đọc từ trong câu ví dụ: cách dùng trong câu quyết định từ loại.",
    "Chọn đúng nhóm từ loại.",
    "Đúng sẽ tăng chuỗi; sai sẽ hiện đáp án."
  ],
  typing: [
    "Đọc nghĩa và định nghĩa hoặc nghe phát âm.",
    "Gõ từ bằng bàn phím thật hoặc bàn phím ảo trước khi hết giờ.",
    "Gõ đúng liên tiếp để tăng điểm combo."
  ]
};

const tutorialStepVisuals: Record<GameKey, readonly { kind: string; Icon: LucideIcon }[]> = {
  scramble: [{ kind: "read", Icon: ScanText }, { kind: "arrange", Icon: Shuffle }, { kind: "hint", Icon: Lightbulb }],
  crossword: [{ kind: "choose", Icon: MousePointerClick }, { kind: "grid", Icon: Grid3X3 }, { kind: "hint", Icon: Lightbulb }],
  eggs: [{ kind: "move", Icon: ArrowLeftRight }, { kind: "catch", Icon: Target }, { kind: "lives", Icon: Heart }],
  mario: [{ kind: "move", Icon: ArrowLeftRight }, { kind: "gift", Icon: Gift }, { kind: "finish", Icon: Flag }],
  sort: [{ kind: "read", Icon: ScanText }, { kind: "classify", Icon: Layers3 }, { kind: "streak", Icon: Trophy }],
  typing: [{ kind: "clue", Icon: ScanText }, { kind: "type", Icon: Keyboard }, { kind: "timer", Icon: Timer }]
};

const topicFormStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const wordChipListStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 7 };
const wordChipStyle: CSSProperties = { minHeight: 40, minWidth: 0, maxWidth: "100%", borderRadius: 999, background: "var(--surface-2)", padding: "5px 10px", fontSize: ".72rem", boxShadow: "none", whiteSpace: "normal", overflowWrap: "anywhere", textAlign: "left" };

function gameTileStyle(available: boolean): CSSProperties {
  return { display: "grid", alignContent: "start", alignItems: "stretch", gridTemplateRows: "auto auto minmax(0, 1fr) auto", gap: 5, minHeight: 130, minWidth: 0, height: "100%", borderRadius: 14, padding: 14, background: available ? "var(--primary-soft)" : "var(--surface-2)", textDecoration: "none", overflowWrap: "anywhere" };
}

type GameAvailability = { available: true } | { available: false; reason: string };

/** A session seed is shared by every engine, so a new game session does not
 * silently replay the lesson-array order while scoring remains reproducible. */
export function createGameAttemptSeed(random: () => number = Math.random) {
  // Must stay within the API's validated `attemptSeed` range. A wider random
  // integer made every completed game fail with INVALID_GAME_RESULT on save.
  return Math.floor(random() * 10_001);
}

export function nextGameAttemptSeed(previous: number) {
  // `prepareGameAttempt` rotates by the seed. Incrementing on replay means a
  // replay cannot silently start in the same vocabulary order (for 2+ words).
  return previous >= 10_000 ? 0 : previous + 1;
}

export function getGameAvailability(key: GameKey, words: readonly GameWord[]): GameAvailability {
  if (!words.length) return { available: false, reason: "Bộ từ chưa có dữ liệu để chơi." };
  if (key === "crossword" && crosswordEntryCount(words) < 3) return { available: false, reason: "Cần ít nhất 3 từ có chữ cái chung." };
  if (key === "sort" && words.filter((word) => word.partOfSpeech.trim()).length < 4) return { available: false, reason: "Cần ít nhất 4 từ có thông tin từ loại." };
  if (key === "typing" && !words.some((word) => /^[a-z][a-z\s'-]*$/i.test(word.english))) return { available: false, reason: "Bộ từ chưa có từ phù hợp để gõ." };
  return { available: true };
}

/** The shared "Điểm" line of all six tutorials (RULE A.3); Season catch adds its lives rule. */
export const GAME_SCORING_LINE = "Đúng ngay +10, từ câu thứ 3 liên tiếp +15; gợi ý hoặc thử lại +5; sai 0. Điểm ván tối đa 100.";
export const CATCH_LIVES_LINE = "Hứng sai hoặc để rơi: mất 1 mạng.";

export function getGameRoundSummary(descriptor: Pick<GameDescriptor, "key" | "goal" | "scoring">, words: readonly GameWord[]) {
  // Server descriptors hard-code the largest round size ("10 từ", "8 từ",
  // "10 lượt"); the real round depends on the word set (HUD "Từ 1/8"), so the
  // counts in the copy are replaced with the values the game will actually use.
  const scoring = descriptor.key === "eggs" ? `${GAME_SCORING_LINE} ${CATCH_LIVES_LINE}` : GAME_SCORING_LINE;
  if (descriptor.key === "typing") return { goal: descriptor.goal.replace(/\d+ từ/, `${gameRoundWordCount("typing", words)} từ`), scoring };
  if (descriptor.key === "scramble") return { goal: descriptor.goal.replace(/\(\d+ từ\)/, `(${gameRoundWordCount("scramble", words)} từ)`), scoring };
  if (descriptor.key === "eggs") return { goal: descriptor.goal.replace(/\d+ lượt/, `${gameRoundWordCount("eggs", words)} lượt`), scoring };
  if (descriptor.key !== "mario") return { goal: descriptor.goal, scoring };
  const plan = seasonRioRoundPlan(words);
  return {
    goal: plan.bossQuestions ? `Vượt ${plan.gateCount} cổng, trả lời ${plan.bossQuestions} câu Boss rồi chạm cờ.` : `Vượt ${plan.gateCount} cổng rồi chạm cờ.`,
    scoring
  };
}

export function LearnerGames({ view, actions }: { view: GameHubView; actions: LearnerCallbacks }) {
  const modal = useModal();
  const wordSet = view.wordSet;
  const confirmWordSetChange = (remove = false) => !wordSet || modal.confirm({
    title: remove ? "Xoá bộ từ đang dùng?" : "Thay bộ từ đang dùng?",
    message: <>Bộ từ <b>{wordSet.topic}</b> sẽ không còn là bộ đang dùng.</>,
    confirmLabel: remove ? "Xoá bộ từ" : "Thay bộ từ",
    tone: remove ? "danger" : "primary",
    countdownSeconds: 0
  });
  const [topic, setTopic] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [moderation, setModeration] = useState<GameTopicModeration>(view.topicModeration ?? { state: "empty" });
  const topicLoading = busy || moderation.state === "loading";
  const topicGenerationDisabled = view.aiAvailable !== true || topicLoading;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!topic.trim() || topicGenerationDisabled || !await confirmWordSetChange()) return; setBusy(true); setError(""); setModeration({ state: "loading" }); try { await actions.generateGameSet(topic.trim()); setTopic(""); setModeration({ state: "success", topic: topic.trim() }); } catch (reason) { const details = reason && typeof reason === "object" && "details" in reason ? (reason as { details?: { moderation?: GameTopicModeration } }).details?.moderation : undefined; if (details) setModeration(details); else setModeration({ state: "error", message: "Không thể kiểm tra chủ đề." }); if (reason instanceof Error && reason.message === "GAME_TOPIC_NOT_SUITABLE") { if (!details) setModeration({ state: "not_suitable", message: serverTopicMessage(reason, UNSUITABLE_TOPIC_MESSAGE) }); return; } if (reason instanceof Error && reason.message === "GAME_TOPIC_NOT_ALLOWED") { setError(details?.state === "unsafe" ? "" : serverTopicMessage(reason)); return; } setError(reason instanceof Error && reason.message === "TOPIC_CREATION_TEMPORARILY_LOCKED" ? "Bạn đã nhập 3 chủ đề không hợp lệ. Tạo bộ từ được mở lại sau 30 phút; người vận hành đã nhận được báo cáo." : reason instanceof Error && reason.message === "VOCABULARY_TOPIC_REJECTED" ? "Chủ đề này không có nghĩa hoặc không phù hợp cho học tập." : "Không tạo được bộ từ. Vui lòng thử lại."); } finally { setBusy(false); } };
  const runTopicAction = async (action: () => void | Promise<void>, message: string) => { if (topicLoading) return; setBusy(true); setError(""); try { await action(); } catch (reason) { setError(reason instanceof Error && reason.message === "LEARNED_VOCABULARY_NOT_FOUND" ? "Bạn chưa học từ vựng nào trong lộ trình hiện tại. Hãy mở một bài học trước rồi thử lại." : message); } finally { setBusy(false); } };
  const useLearnedWords = async () => {
    if (await confirmWordSetChange()) await runTopicAction(async () => {
      await actions.useWeeklyGameSet();
      setModeration({ state: "empty" });
    }, "Không tải được bộ từ đã học.");
  };
  const removeWordSet = async () => {
    if (await confirmWordSetChange(true)) await runTopicAction(() => actions.deleteGameSet(), "Không xoá được bộ từ. Vui lòng thử lại.");
  };
  const compact = useMediaQuery("(max-width: 960px)");
  const compactUi = useCompactUi();
  const usesLearnedVocabulary = wordSet?.source === "monthly" || wordSet?.source === "weekly";
  // Phones/tablets: the word chips are paged (8 / 12 per page) instead of a long chip run.
  const pagedWords = usePaged(view.wordSet?.words ?? [], { phone: 8, tablet: 12 });
  // The "type a topic" hint is guidance: on phones/tablets it moves into the ⓘ next to the section title.
  const topicHintInTip = compactUi && Boolean(view.aiAvailable) && moderation.state === "empty" && !usesLearnedVocabulary;
  const topicTitle = compact ? (wordSet ? "Đổi nguồn từ" : "Nguồn từ") : "1. Chủ đề";
  const topicPanel = <section className="card games-section-card games-topic-card" aria-labelledby="games-topic-title">{topicHintInTip ? <InfoTitle as="h2" title={<span id="games-topic-title">{topicTitle}</span>} tip="Nhập một chủ đề để tạo bộ từ." label={`${topicTitle}: giải thích`} /> : <h2 id="games-topic-title">{topicTitle}</h2>}{view.aiAvailable ? <form className="row topic-create" style={topicFormStyle} aria-busy={topicLoading || undefined} onSubmit={submit}><input style={{ flex: "1 1 260px", minWidth: 0 }} aria-label="Chủ đề bộ từ" disabled={topicGenerationDisabled} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="1–3 từ tiếng Anh, ví dụ coffee shop" /><button className="btn-primary" type="submit" aria-busy={topicLoading || undefined} disabled={topicGenerationDisabled || !topic.trim()}>{topicLoading ? "Đang tạo…" : "Tạo bộ từ"}</button></form> : <p className="muted">{view.learnedVocabularyAvailable ? "Tạm thời chưa thể tạo bộ từ theo chủ đề. Bạn vẫn có thể dùng từ đã học." : wordSet ? "Tạm thời chưa thể tạo bộ từ theo chủ đề." : "Tạm thời chưa thể tạo bộ từ theo chủ đề. Hãy học một bài để có từ luyện tập."}</p>}{(view.aiAvailable || usesLearnedVocabulary) && !topicHintInTip ? <TopicModerationNotice moderation={view.aiAvailable ? moderation : { state: "empty" }} usesLearnedVocabulary={usesLearnedVocabulary} /> : null}<ErrorText message={error} />{view.learnedVocabularyAvailable ? <button className="btn-sm btn-primary" type="button" data-game-source-learned disabled={topicLoading} onClick={() => void useLearnedWords()}>{view.wordSet?.source === "monthly" ? "Cập nhật bộ từ đã học" : "Dùng từ đã học trong tháng"}</button> : null}{!wordSet && !view.aiAvailable && !view.learnedVocabularyAvailable ? <AppLink className="btn btn-sm" href="/home" navigate={actions.navigate}>Về Trang chủ</AppLink> : null}{view.wordSet ? <div className="row between topic-source"><span><b>{view.wordSet.topic}</b> · {view.wordSet.words.length} từ</span><button className="btn-sm btn-danger" type="button" aria-busy={topicLoading || undefined} disabled={topicLoading} aria-label="Xoá bộ này" title="Xoá bộ này" onClick={() => void removeWordSet()}>{topicLoading ? "Đang xử lý…" : <ActionLabel icon={Trash2} label="Xoá bộ này" />}</button></div> : null}</section>;
  const wordPanel = <section className="card games-section-card games-word-set-card" aria-labelledby="games-word-set-title">{view.wordSet ? <><div className="section-heading"><h2 id="games-word-set-title">{compact ? "Bộ từ: " : "2. Bộ từ: "}{view.wordSet.topic} <small>{view.wordSet.cefr}</small></h2></div>{view.wordSet.words.length ? <><div className="word-chip-list" style={wordChipListStyle}>{pagedWords.visible.map((word) => <button className="word-chip" style={wordChipStyle} type="button" title={word.definition} onClick={() => actions.speak(word.english)} key={word.id}><Volume2 className="game-control-icon" size={15} strokeWidth={2} aria-hidden="true" /><b>{word.english}</b><span>– {word.vietnamese}</span></button>)}</div><Pager {...pagedWords} label="bộ từ" /></> : <Notice>Chưa có từ. Tạo chủ đề hoặc dùng từ trong lộ trình hiện tại.</Notice>}</> : <><h2 id="games-word-set-title">{compact ? "Bộ từ" : "2. Bộ từ"}</h2><Notice>Chưa có bộ từ.</Notice></>}</section>;
  const gamePicker = <section className="card games-section-card" aria-labelledby="games-picker-title"><h2 id="games-picker-title">{compact ? "Chọn trò chơi" : "3. Chọn trò chơi"}</h2>{view.wordSet ? <div className="grid cols-3 game-grid" style={{ gap: 10 }}>{gameIdentity.map((identity) => { const live = view.games.find((game) => game.key === identity.key); const availability = getGameAvailability(identity.key, view.wordSet!.words); const content = <><span className="game-icon" aria-hidden="true">{identity.iconElement}</span><h3>{identity.name}</h3><p>{identity.description}</p>{availability.available ? (live?.best ? <b>Tốt nhất: {live.best.score}/{live.best.maxScore}</b> : <b>Sẵn sàng chơi</b>) : <small className="game-unavailable-reason">{availability.reason}</small>}</>; return availability.available ? <AppLink className={`tile game-tile game-${identity.key}`} style={gameTileStyle(availability.available)} href={`/games/${identity.key}`} navigate={actions.navigate} ariaLabel={`Chơi ${identity.name}`} key={identity.key}>{content}</AppLink> : <button className={`tile game-tile game-${identity.key} is-unavailable`} style={gameTileStyle(availability.available)} type="button" aria-label={`${identity.name} chưa sẵn sàng`} disabled key={identity.key}>{content}</button>; })}</div> : <Notice>Chưa thể chơi khi chưa có bộ từ.</Notice>}</section>;

  return <div className={`app-learner-page games-page${compact && wordSet ? " games-play-first" : ""}`}><PageTitle eyebrow="Mini game" title="Game từ vựng" detail={compact && wordSet ? "Chọn trò chơi để luyện bộ từ hiện tại." : `Chơi bằng từ đã học trong tháng hoặc tự tạo bộ từ theo chủ đề ở mức ${view.cefr}.`} tip={`Chơi bằng từ đã học trong tháng hoặc tự tạo bộ từ theo chủ đề ở mức ${view.cefr}.`} compactDetail={false} />
    {compact && wordSet ? <>
      <details className="card game-vocabulary-tools">
        <summary><b>Bộ từ đang chơi</b><span>{wordSet.topic} · {wordSet.words.length} từ</span></summary>
        {wordPanel}
        {topicPanel}
      </details>
      {gamePicker}
    </> : <>{topicPanel}{wordPanel}{gamePicker}</>}
  </div>;
}

const UNSUITABLE_TOPIC_MESSAGE = "Chủ đề này không phù hợp với Mini game. Hãy chọn một chủ đề công việc hoặc đời sống, ví dụ: coffee shop, meeting.";

/** Server-provided learner message for an unsafe topic (falls back to the standard Vietnamese wording). */
function serverTopicMessage(reason: unknown, fallback = "Chủ đề này không phù hợp. Hãy chọn một chủ đề công việc hoặc đời sống, ví dụ: coffee shop, meeting."): string {
  const details = reason && typeof reason === "object" && "details" in reason ? (reason as { details?: { message?: unknown } }).details : undefined;
  return typeof details?.message === "string" && details.message ? details.message : fallback;
}

function TopicModerationNotice({ moderation, usesLearnedVocabulary }: { moderation: GameTopicModeration; usesLearnedVocabulary: boolean }) {
  if (moderation.state === "success") return <Notice tone="ok">Đã tạo bộ từ theo chủ đề <b>{moderation.topic}</b>.</Notice>;
  if (moderation.state === "empty" && usesLearnedVocabulary) return <Notice tone="ok">Đang dùng bộ từ đã học trong lộ trình hiện tại.</Notice>;
  if (moderation.state === "empty") return <Notice>Nhập một chủ đề để tạo bộ từ.</Notice>;
  if (moderation.state === "loading") return <Notice>Đang kiểm tra và tạo bộ từ…</Notice>;
  if (moderation.state === "invalid") return <Notice tone="danger">{moderation.message}</Notice>;
  if (moderation.state === "not_suitable") return <Notice tone="warn">{moderation.message}</Notice>;
  if (moderation.state === "unsafe") return <Notice tone="danger">Cảnh báo an toàn · {moderation.strike}/3 · {moderation.message}</Notice>;
  if (moderation.state === "reported") return <Notice tone="danger">Đã báo vận hành sau {moderation.strike}/3 lần vi phạm. {moderation.message}</Notice>;
  if (moderation.state === "ai_rejected") return <Notice tone="danger">AI từ chối chủ đề này. {moderation.message}</Notice>;
  return <Notice tone="danger">{moderation.message}</Notice>;
}

export function LearnerGame({ descriptor, wordSet, result, actions, duel }: { descriptor: GameDescriptor; wordSet: GameWordSetView; result: { score: number; maxScore: number } | null | undefined; actions: LearnerCallbacks; duel?: boolean }) {
  const compactUi = useCompactUi();
  const [started, setStarted] = useState(false); const [submitted, setSubmitted] = useState(false); const [attempt, setAttempt] = useState(createGameAttemptSeed); const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState(""); const [pendingInput, setPendingInput] = useState<Parameters<LearnerCallbacks["finishGame"]>[0]>();
  const pageRef = useRef<HTMLDivElement | null>(null);
  // Word sort shows a context sentence per word; a stored set that predates them is filled once
  // (one batched request server-side) while the learner reads the tutorial.
  const [exampleSet, setExampleSet] = useState<GameWordSetView | null>(null);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const prepareExamples = actions.prepareGameWordExamples;
  const needsExamples = descriptor.key === "sort" && Boolean(wordSet.examplesPending) && Boolean(prepareExamples);
  useEffect(() => {
    if (!needsExamples || !prepareExamples) return;
    let live = true;
    setExamplesLoading(true);
    prepareExamples(wordSet.id)
      .then((set) => { if (live && set.id === wordSet.id) setExampleSet(set); })
      .catch(() => { /* still playable: words without a sentence show the word only */ })
      .finally(() => { if (live) setExamplesLoading(false); });
    return () => { live = false; };
  }, [needsExamples, prepareExamples, wordSet.id]);
  const playSet = exampleSet?.id === wordSet.id ? exampleSet : wordSet;
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
    const backHref = duel ? "/arena" : "/games";
    const recordLabel = descriptor.best ? `Kỷ lục: ${descriptor.best.score}/${descriptor.best.maxScore}` : "Kỷ lục: chưa có";
    return <div ref={pageRef} className="app-learner-page game-page">
      <header className="page-title" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="game-title" style={{ marginTop: 0 }}><span className="game-title-icon" aria-hidden="true">{visualIdentity?.iconElement}</span><span>{descriptor.name}</span></h1>
          <p className="muted">{wordSet.topic} · {wordSet.words.length} từ</p>
          <span className="badge warn" id="gm-best" style={{ marginTop: 6 }}>{recordLabel}</span>
        </div>
        {compactUi ? <GameExitLink href={backHref} navigate={actions.navigate} /> : <AppLink className="btn btn-sm" href={backHref} navigate={actions.navigate} title="Dừng trò này" style={{ minHeight: 36, minWidth: 0 }}>Thoát game</AppLink>}
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
              <button className="btn-primary btn-lg" type="button" disabled={examplesLoading} aria-busy={examplesLoading || undefined} onClick={() => { setStarted(true); }}><Play className="game-control-icon" size={19} aria-hidden="true" />{examplesLoading ? "Đang chuẩn bị câu ví dụ…" : "Bắt đầu chơi"}</button>
              <AppLink className="btn" href={backHref} navigate={actions.navigate}><ArrowLeft className="game-control-icon" size={18} aria-hidden="true" />Quay lại</AppLink>
            </div>
          </div>
        </div>
      </section>
    </div>;
  }
  const exitHref = duel ? "/arena" : "/games";
  return <div ref={pageRef} className={`app-learner-page game-page${compactUi ? " game-page--compact" : ""}`}><header className="row between game-running-header"><div><div className="eyebrow game-running-title"><span className="game-title-icon" aria-hidden="true">{visualIdentity?.iconElement}</span><span>{descriptor.name}</span></div><h1>{wordSet.topic}</h1></div><div id="gm-best" className="badge">{descriptor.best ? `Kỷ lục: ${descriptor.best.score}/${descriptor.best.maxScore}` : "Chưa có kỷ lục"}</div>{compactUi && !submitted ? <GameExitLink href={exitHref} navigate={actions.navigate} /> : null}</header><section id="gm-board" className="game-board">{submitted ? <section className={`card game-result ${submitError ? "is-error" : result ? "is-complete" : "is-pending"}`} aria-live="polite">{submitError ? <><div className="game-result__icon" aria-hidden="true">!</div><div><div className="eyebrow">Kết quả chưa được lưu</div><h2>Gửi lại lượt chơi</h2></div><Notice tone="danger">{submitError}</Notice><div className="game-result__actions"><button className="btn-primary" type="button" disabled={submitting || !pendingInput} onClick={() => pendingInput ? void finish(pendingInput) : undefined}>{submitting ? "Đang gửi lại…" : "Thử gửi lại"}</button><AppLink className="btn" href={duel ? "/arena" : "/games"} navigate={actions.navigate}>{duel ? "Bỏ lượt này" : "Chọn trò khác"}</AppLink></div></> : result ? <><div className="game-result__icon" aria-hidden="true"><Trophy size={32} strokeWidth={1.8} /></div><div className="game-result__copy"><div className="eyebrow">Hoàn thành lượt chơi</div><h2>Điểm của bạn</h2><p>Điểm đã được ghi vào tiến độ của bạn.</p></div><div className="game-result__score"><strong>{result.score}</strong><span>trên {result.maxScore} điểm</span></div><div className="game-result__actions">{!duel ? <button className="btn-primary" type="button" onClick={() => { actions.resetGameResult(); setSubmitError(""); setPendingInput(undefined); setSubmitted(false); setStarted(false); setAttempt(nextGameAttemptSeed(attempt)); }}><Play className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />Chơi lại</button> : null}<AppLink className="btn" href={duel ? "/arena" : "/games"} navigate={actions.navigate}>{duel ? "Về đấu trường" : "Chọn trò khác"}</AppLink></div></> : <><div className="game-result__icon game-result__spinner" aria-hidden="true" /><div><div className="eyebrow">Đang hoàn tất</div><h2>Đang ghi kết quả…</h2></div></>}</section> : <GameEngine game={descriptor.key} wordSet={playSet} attempt={attempt} finish={finish} />}</section>{!submitted && !compactUi ? <AppLink className="btn btn-danger" href={exitHref} navigate={actions.navigate}>Thoát</AppLink> : null}</div>;
}

/** Phones/tablets: the one exit control of every game screen — a compact red "Thoát" at the right of the header. */
function GameExitLink({ href, navigate }: { href: string; navigate: LearnerCallbacks["navigate"] }) {
  return <AppLink className="btn btn-sm btn-danger game-exit-link" href={href} navigate={navigate} title="Dừng trò này"><LogOut size={15} strokeWidth={2.2} aria-hidden="true" />Thoát</AppLink>;
}

function GameEngine({ game, wordSet, attempt, finish }: { game: GameKey; wordSet: GameWordSetView; attempt: number; finish: (input: Parameters<LearnerCallbacks["finishGame"]>[0]) => void | Promise<void> }) { switch (game) { case "scramble": return <ScrambleGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; case "crossword": return <CrosswordGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; case "eggs": return <SeasonCatchGame words={wordSet.words} cefr={wordSet.cefr} attemptSeed={attempt} onFinish={finish} />; case "mario": return <SeasonRioGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; case "sort": return <WordSortGame words={wordSet.words} cefr={wordSet.cefr} attemptSeed={attempt} onFinish={finish} />; case "typing": return <TypingRaceGame words={wordSet.words} attemptSeed={attempt} onFinish={finish} />; } }

export function LearnerArena({ view, actions }: { view: ArenaView; actions: LearnerCallbacks }) { const [opponent,setOpponent]=useState(view.opponents[0]?.id ?? ""); const [game,setGame]=useState<Exclude<GameKey,"crossword">>("scramble"); if (!view.eligible) return <div className="app-learner-page"><PageTitle title="Đấu trường nội bộ" detail="So điểm với đồng nghiệp qua các game từ vựng." /><Notice tone="warn">Đấu trường mở từ B1. Bạn đang ở mức {view.currentLevel}.</Notice><AppLink className="btn" href="/games" navigate={actions.navigate}>Về Mini game</AppLink></div>; return <div className="app-learner-page"><AppLink href="/games" navigate={actions.navigate}><ArrowLeft className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />Về Mini game</AppLink><PageTitle eyebrow={`${view.points} điểm đấu trường`} title="Đấu trường nội bộ" detail="Chọn đồng nghiệp, chọn game và gửi thách đấu. Hai bên chơi cùng một bộ từ; điểm cao hơn sẽ thắng." /><section className="card"><h2>Bảng xếp hạng</h2>{view.leaderboard.length ? <div className="table-wrap"><table><thead><tr><th>Hạng</th><th>Người học</th><th>Mức</th><th>Điểm</th><th>Thắng / thua</th></tr></thead><tbody>{view.leaderboard.map((row) => <tr key={row.learnerId}><td>{row.rank}</td><td>{row.displayName}{row.learnerId === view.learnerId ? " (Bạn)" : ""}</td><td>{row.cefr}</td><td>{row.points}</td><td>{row.won}/{row.lost}</td></tr>)}</tbody></table></div> : <Notice>Chưa có kết quả đấu trường.</Notice>}</section><section className="card"><h2>Thách đấu đồng nghiệp</h2>{view.opponents.length ? <div className="row"><select aria-label="Đối thủ" value={opponent} onChange={(e)=>setOpponent(e.target.value)}>{view.opponents.map((item)=><option value={item.id} key={item.id}>{item.displayName} · {item.cefr}</option>)}</select><select aria-label="Trò chơi" value={game} onChange={(e)=>setGame(e.target.value as typeof game)}>{gameIdentity.filter((item)=>item.key!=="crossword").map((item)=><option value={item.key} key={item.key}>{item.name}</option>)}</select><button className="btn-primary" type="button" onClick={()=>void actions.createDuel(opponent,game)}>Gửi thách đấu</button></div> : <Notice>Chưa có đối thủ phù hợp.</Notice>}</section><section className="card"><h2>Các ván thách đấu</h2>{view.duels.length ? view.duels.map((duel)=><article className="arena-row" key={duel.id}><div><b>{duel.opponent.displayName}</b><p>{duel.wordSetTopic} · {gameIdentity.find((item)=>item.key===duel.game)?.name}</p></div><span className="badge">{duelStatusLabel(duel)}</span>{duel.outcome === "play" ? <AppLink className="btn btn-primary" href={`/duel/${duel.id}`} navigate={actions.navigate}>Chơi ngay</AppLink> : null}</article>) : <Notice>Chưa có ván nào.</Notice>}</section></div>; }

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
