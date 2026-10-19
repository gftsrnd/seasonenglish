import { useEffect, useMemo, useRef, useState } from "react";
import type { GameAnswerInput } from "@e4s/contracts";
import { seasonRioRoundPlan } from "@e4s/domain/engagement";
import { ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, Heart, HeartCrack, Timer, XCircle } from "lucide-react";
import { choices, prepareGameAttempt, type FinishGame, type GameWord } from "./types.js";
import { currentSeasonVisual } from "./season-visual.js";
import { ProductArt } from "../shared/media/ProductArt.js";
import { useExperience } from "../../features/experience/Experience.js";

type Quiz = { phase: "gate" | "boss"; index: number; word: GameWord };
export type GateState = "closed" | "correct" | "wrong";
type NoticeTone = "neutral" | "success" | "error" | "warning";
const tierOrder = [0, 60, 0, 110, 60, 0, 110, 60] as const;
const gateLayout = tierOrder.map((tier, index) => ({ left: 360 + index * 330, tier }));

export function giftVisualIds(state: GateState) {
  return {
    gift: `gift-${state}` as const,
    result: state === "correct" ? "mushroom" as const : state === "wrong" ? "bomb" as const : null
  };
}

export function SeasonRioGame({ words: source, onFinish, attemptSeed = 0 }: { words: GameWord[]; onFinish: FinishGame; attemptSeed?: number }) {
  const season = currentSeasonVisual();
  const words = useMemo(() => prepareGameAttempt(source, attemptSeed), [attemptSeed, source]);
  const roundPlan = useMemo(() => seasonRioRoundPlan(words), [words]);
  const activeGateLayout = useMemo(() => gateLayout.slice(0, roundPlan.gateCount), [roundPlan.gateCount]);
  const gatePositions = useMemo(() => activeGateLayout.map((gate) => gate.left), [activeGateLayout]);
  const platforms = useMemo(() => activeGateLayout.flatMap((gate) => gate.tier === 60
    ? [{ left: gate.left - 10, width: 150, height: 60 }]
    : gate.tier === 110
      ? [{ left: gate.left - 150, width: 90, height: 55 }, { left: gate.left - 10, width: 150, height: 110 }]
      : []), [activeGateLayout]);
  const bossX = 360 + activeGateLayout.length * 330 + 60;
  const flagX = bossX + 220;
  const worldWidth = flagX + 200;
  const [heroX, setHeroX] = useState(40);
  const [heroY, setHeroY] = useState(0);
  const [gateStates, setGateStates] = useState<GateState[]>(() => Array.from({ length: roundPlan.gateCount }, () => "closed"));
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [bossHealth, setBossHealth] = useState(roundPlan.bossQuestions);
  const [bossSeconds, setBossSeconds] = useState(10);
  const [bossStarted, setBossStarted] = useState(false);
  const [answers, setAnswers] = useState<GameAnswerInput[]>([]);
  const [notice, setNotice] = useState<{ text: string; tone: NoticeTone }>({ text: "Chạy tới hộp quà đầu tiên.", tone: "neutral" });
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<"dinosaur" | "expired" | null>(null);
  const { play } = useExperience();
  const keys = useRef<Record<string, boolean>>({});
  const velocityY = useRef(0);
  const finished = useRef(false);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const quizDialogRef = useRef<HTMLDivElement | null>(null);
  const focusBeforeQuiz = useRef<HTMLElement | null>(null);
  const state = useRef({ heroX, heroY, gateStates, quiz, lives, bossHealth, bossStarted, answers });
  state.current = { heroX, heroY, gateStates, quiz, lives, bossHealth, bossStarted, answers };

  const finish = async (nextAnswers: GameAnswerInput[], reason: string, tone: NoticeTone) => {
    if (finished.current) return;
    finished.current = true; setBusy(true); setNotice({ text: reason, tone });
    if (reason.includes("Hết 3 mạng")) { setEnding("dinosaur"); await new Promise((resolve) => window.setTimeout(resolve, 850)); }
    if (reason.includes("hết giờ")) { setEnding("expired"); await new Promise((resolve) => window.setTimeout(resolve, 850)); }
    await onFinish({ answers: nextAnswers });
  };

  useEffect(() => {
    const scene = sceneRef.current;
    const main = scene?.closest<HTMLElement>("main");
    if (main) main.scrollTop = 0;
    scene?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const scene = sceneRef.current;
      const active = document.activeElement;
      const target = event.target;
      if (!scene || !scene.contains(active) || busy || quiz) return;
      if (target instanceof HTMLElement && target.closest("input,select,textarea,[contenteditable=\"true\"]")) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "a", "d", "w", " "].includes(key)) event.preventDefault();
      keys.current[key] = true;
    };
    const up = (event: KeyboardEvent) => { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; keys.current[key] = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [busy, quiz]);

  useEffect(() => {
    if (busy) return;
    let last = performance.now(); let frame = 0;
    const step = (now: number) => {
      const delta = Math.min(35, now - last) / 16.7; last = now;
      const current = state.current;
      if (!current.quiz) {
        let nextX = current.heroX + ((keys.current.ArrowRight || keys.current.d) ? 4.2 * delta : (keys.current.ArrowLeft || keys.current.a) ? -4.2 * delta : 0);
        let nextY = current.heroY;
        if ((keys.current.ArrowUp || keys.current[" "] || keys.current.w || keys.current.jump) && velocityY.current === 0) velocityY.current = 11;
        velocityY.current -= .62 * delta; nextY = Math.max(0, nextY + velocityY.current * delta);
        if (velocityY.current <= 0) {
          const landing = platforms
            .filter((platform) => nextX >= platform.left - 24 && nextX <= platform.left + platform.width + 24 && current.heroY >= platform.height && nextY <= platform.height)
            .sort((left, right) => right.height - left.height)[0];
          if (landing) { nextY = landing.height; velocityY.current = 0; }
        }
        if (nextY === 0 && velocityY.current < 0) velocityY.current = 0;
        nextX = Math.max(18, Math.min(flagX + 40, nextX));
        const gateIndex = gatePositions.findIndex((position, index) => current.gateStates[index] === "closed" && nextX >= position - 48);
        if (gateIndex >= 0) {
          nextX = gatePositions[gateIndex]! - 48;
          const gate = activeGateLayout[gateIndex]!;
          const word = roundPlan.gateWords[gateIndex];
          if (word && nextY >= Math.max(0, gate.tier - 10)) { setQuiz({ phase: "gate", index: gateIndex, word }); setNotice({ text: `Hộp quà ${gateIndex + 1}/${roundPlan.gateCount} đang chặn đường.`, tone: "neutral" }); }
          else if (gate.tier > 0) setNotice({ text: gate.tier === 60 ? "Đi lên bục để chạm hộp quà." : "Leo bậc thấp rồi lên bục cao để chạm hộp quà.", tone: "neutral" });
        } else if (current.gateStates.every((gate) => gate !== "closed") && current.bossHealth > 0 && nextX >= bossX - 78) {
          nextX = bossX - 78;
          const bossIndex = roundPlan.bossQuestions - current.bossHealth;
          const word = roundPlan.bossWords[bossIndex % Math.max(1, roundPlan.bossWords.length)];
          if (word) { setBossStarted(true); setQuiz({ phase: "boss", index: bossIndex, word }); setNotice({ text: `Boss ${season.food.name}: trả lời đúng ${roundPlan.bossQuestions} câu trước khi hết 10 giây.`, tone: "neutral" }); }
        } else if (current.gateStates.every((gate) => gate !== "closed") && current.bossHealth <= 0 && nextX >= flagX - 30) {
          nextX = flagX - 30; void finish(current.answers, "Đã về đích!", "success");
        }
        if (nextX !== current.heroX) setHeroX(nextX);
        if (nextY !== current.heroY) setHeroY(nextY);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [activeGateLayout, bossX, busy, flagX, gatePositions, onFinish, platforms, roundPlan]);

  useEffect(() => {
    if (!bossStarted || bossHealth <= 0 || busy) return;
    const timer = window.setInterval(() => setBossSeconds((value) => {
      if (value <= 1) { window.clearInterval(timer); void finish(state.current.answers, `${season.food.name} khổng lồ đã hỏng — hết giờ.`, "warning"); return 0; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [bossHealth, bossStarted, busy]);

  useEffect(() => {
    if (!quiz) {
      focusBeforeQuiz.current?.focus();
      focusBeforeQuiz.current = null;
      return;
    }
    focusBeforeQuiz.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => quizDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [quiz?.index, quiz?.phase]);

  const answerQuiz = (selected: GameWord) => {
    if (!quiz || busy) return;
    const correct = selected.id === quiz.word.id;
    play(correct ? "success" : "error");
    const answer: GameAnswerInput = { wordId: quiz.word.id, answer: selected.english, attempts: 1, usedHint: false, combo: 1 };
    const nextAnswers = [...answers, answer];
    let nextLives = lives;
    if (correct) setScore((value) => value + 1);
    else { nextLives -= 1; setLives(nextLives); }
    if (quiz.phase === "gate") {
      setGateStates((current) => current.map((value, index) => index === quiz.index ? (correct ? "correct" : "wrong") : value));
      setNotice(correct ? { text: "Đúng — cổng đã mở.", tone: "success" } : { text: `Sai — đáp án là “${quiz.word.english}”, cổng vẫn mở.`, tone: "error" });
    } else {
      if (correct) { setBossHealth((value) => Math.max(0, value - 1)); setNotice(bossHealth <= 1 ? { text: `Đã ăn hết ${season.food.name} khổng lồ — chạy tới cờ!`, tone: "success" } : { text: "Đúng — Boss mất một miếng.", tone: "success" }); }
      else setNotice({ text: `Sai — đáp án là “${quiz.word.english}”.`, tone: "error" });
    }
    setAnswers(nextAnswers); setQuiz(null);
    if (nextLives <= 0) void finish(nextAnswers, "Hết 3 mạng — khủng long đã xuất hiện.", "error");
  };

  const hold = (key: string, pressed: boolean) => { keys.current[key] = pressed; };
  const nudge = (direction: -1 | 1) => {
    if (busy || quiz) return;
    hold(direction < 0 ? "ArrowLeft" : "ArrowRight", true);
    setHeroX((value) => Math.max(18, Math.min(flagX + 40, value + direction * 8)));
  };
  const jump = () => { if (busy || quiz) return; hold("jump", true); if (velocityY.current === 0) velocityY.current = 11; };
  const cameraLimit = Math.max(0, worldWidth - 900);
  const camera = Math.min(cameraLimit, Math.max(0, heroX * .35, heroX - 760));
  const isMoving = keys.current.ArrowLeft || keys.current.ArrowRight || keys.current.a || keys.current.d;
  const noticeTone = notice.tone === "success" ? "is-success" : notice.tone === "error" ? "is-error" : notice.tone === "warning" ? "is-warning" : "";
  return <div className="game-runner" aria-busy={busy || undefined}>
    <div className="game-hud"><h2>Season-rio</h2><span aria-label={`Điểm ${score} trên ${roundPlan.total}`}><CheckCircle2 size={17} aria-hidden="true" /><strong>{score}/{roundPlan.total}</strong></span><span>Quà <strong>{gateStates.filter((gate) => gate !== "closed").length}/{roundPlan.gateCount}</strong></span><span className="game-boss-status"><ProductArt id={`food-${season.hero}`} decorative className="game-hud-art" /><span>{bossHealth > 0 ? `Boss ${bossHealth}/${roundPlan.bossQuestions}` : "Boss đã xong"}</span><Timer size={16} aria-hidden="true" /><span>{bossSeconds} giây</span></span><span className="game-life-count" aria-label={`${lives} mạng còn lại trên 3`}>{Array.from({ length: 3 }, (_, index) => index < lives ? <Heart key={index} size={18} fill="currentColor" aria-hidden="true" /> : <HeartCrack key={index} size={18} aria-hidden="true" />)}</span></div>
    <div ref={sceneRef} className="rio-scene" role="application" aria-label="Màn chơi Season-rio" tabIndex={0} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) keys.current = {}; }}>
      <div className="rio-viewport"><div className="rio-world" style={{ width: worldWidth, transform: `translateX(-${camera}px)` }}>
        <div className="rio-cloud rio-cloud--one" /><div className="rio-cloud rio-cloud--two" />
        {platforms.map((platform, index) => <div data-testid="rio-platform" className="rio-platform" style={{ left: platform.left, width: platform.width, height: platform.height }} key={`${platform.left}-${index}`} />)}
        {activeGateLayout.map((gate, index) => { const gateState = gateStates[index] ?? "closed"; const art = giftVisualIds(gateState); return <div data-testid="gift-gate" data-state={gateState} data-tier={gate.tier} aria-label={`Hộp quà ${index + 1}: ${gateState === "closed" ? "chưa trả lời" : gateState === "correct" ? "đúng" : "sai"}`} className={`gift-gate ${gateState !== "closed" ? "is-open" : ""}`} style={{ left: gate.left, bottom: 28 + gate.tier }} key={gate.left}><i className="gate-beam" /><span className="gift-art"><ProductArt id={art.gift} decorative />{art.result ? <ProductArt id={art.result} decorative className="gift-reward" /> : null}</span><i className="gate-post" /></div>; })}
        <div data-testid="season-rio-boss" className={`rio-boss ${bossHealth <= 0 ? "is-cleared" : ""}`} aria-label={bossHealth <= 0 ? `Đã ăn xong ${season.food.name}` : `Boss ${season.food.name}, còn ${bossHealth} phần`} style={{ left: bossX }}><ProductArt id={`food-${season.hero}`} decorative className="rio-boss-art" /><span>{bossHealth <= 0 ? "Đã ăn xong" : `${season.food.name.toUpperCase()} KHỔNG LỒ · ${bossSeconds}s`}</span></div>
        <div data-testid="season-rio-flag" className={`rio-flag ${gateStates.every((gate) => gate !== "closed") && bossHealth <= 0 ? "is-ready" : ""}`} aria-label="Cờ về đích" style={{ left: flagX }}><ProductArt id="flag" decorative /></div>
        <div data-testid="season-rio-hero" className={`rio-hero ${heroY > 0 ? "is-jumping" : isMoving ? "is-running" : ""}`} aria-label={`${season.heroName} trong màn chơi`} style={{ left: heroX, bottom: 28 + heroY }}><ProductArt id={`hero-${season.hero}`} decorative /></div>
        <div className="rio-ground" />
      </div></div>
       <div className="mario-controls" aria-label="Điều khiển Season-rio"><div><button type="button" aria-label="Sang trái" disabled={busy || Boolean(quiz)} onPointerDown={(event) => { event.preventDefault(); nudge(-1); }} onPointerUp={(event) => { event.preventDefault(); hold("ArrowLeft", false); }} onPointerCancel={() => hold("ArrowLeft", false)} onPointerLeave={() => hold("ArrowLeft", false)}><ArrowLeft className="game-control-icon" size={24} strokeWidth={2} aria-hidden="true" /></button><button type="button" aria-label="Sang phải" disabled={busy || Boolean(quiz)} onPointerDown={(event) => { event.preventDefault(); nudge(1); }} onPointerUp={(event) => { event.preventDefault(); hold("ArrowRight", false); }} onPointerCancel={() => hold("ArrowRight", false)} onPointerLeave={() => hold("ArrowRight", false)}><ArrowRight className="game-control-icon" size={24} strokeWidth={2} aria-hidden="true" /></button></div><button className="jump" type="button" aria-label="Lên" disabled={busy || Boolean(quiz)} onPointerDown={(event) => { event.preventDefault(); jump(); }} onPointerUp={(event) => { event.preventDefault(); hold("jump", false); }} onPointerCancel={() => hold("jump", false)}><ArrowUp className="game-control-icon" size={24} strokeWidth={2} aria-hidden="true" /></button></div>
      {quiz ? <div ref={quizDialogRef} className="rio-quiz" role="dialog" aria-modal="true" aria-label={quiz.phase === "gate" ? "Câu hỏi hộp quà" : "Câu hỏi Boss"} tabIndex={-1}><div><span className="eyebrow">{quiz.phase === "gate" ? `Hộp quà ${quiz.index + 1}/${roundPlan.gateCount} hỏi` : `Boss hỏi · ${bossSeconds}s`}</span><h3>{quiz.word.vietnamese}</h3><p>{quiz.word.definition}</p><div>{choices(words, quiz.word, 4, attemptSeed ^ quiz.index).map((choice) => <button type="button" disabled={busy} key={choice.id} onClick={() => answerQuiz(choice)}>{choice.english}</button>)}</div></div></div> : null}
      {ending ? <div className="game-ending" role="status">{ending === "dinosaur" ? <ProductArt id="dinosaur" decorative className="dino" /> : <ProductArt id={`food-${season.hero}`} decorative className="game-ending-art" />}<strong>{ending === "dinosaur" ? "Hết mạng!" : "Hết 10 giây!"}</strong><small>{ending === "dinosaur" ? "Khủng long đã bắt kịp bạn." : `${season.food.name} khổng lồ đã hỏng.`}</small></div> : null}
    </div>
    <p className="catch-help">← → di chuyển hoặc dùng nút. Chạm hộp/cột để trả lời; trả lời xong cổng mở, sai mất một mạng. Hộp trên bục cần leo lên trước. Cuối màn, chạm món ăn của nhân vật rồi trả lời đúng 3 câu trong 10 giây; sau đó chạm cờ về đích.</p>
     {busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}
     <p className={`game-notice ${noticeTone}`} aria-live="polite"><span className="game-notice-content">{notice.tone === "success" ? <CheckCircle2 size={17} aria-hidden="true" /> : notice.tone === "error" ? <XCircle size={17} aria-hidden="true" /> : notice.tone === "warning" ? <Timer size={17} aria-hidden="true" /> : null}<span>{notice.text}</span></span></p>
  </div>;
}
