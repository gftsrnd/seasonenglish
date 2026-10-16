import { useEffect, useMemo, useRef, useState } from "react";
import type { GameAnswerInput } from "@e4s/contracts";
import { seasonRioRoundPlan } from "@e4s/domain/engagement";
import { choices, prepareGameAttempt, type FinishGame, type GameWord } from "./types.js";
import { currentSeasonVisual, GiftArt, SeasonHero } from "./season-art.js";
import { useExperience } from "../../../features/experience/Experience.js";

type Quiz = { phase: "gate" | "boss"; index: number; word: GameWord };
type GateState = "closed" | "correct" | "wrong";
const tierOrder = [0, 60, 0, 110, 60, 0, 110, 60] as const;
const gateLayout = tierOrder.map((tier, index) => ({ left: 360 + index * 330, tier }));

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
  const [notice, setNotice] = useState("Chạy tới hộp quà đầu tiên.");
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<"dinosaur" | "expired" | null>(null);
  const { play } = useExperience();
  const keys = useRef<Record<string, boolean>>({});
  const velocityY = useRef(0);
  const finished = useRef(false);
  const state = useRef({ heroX, heroY, gateStates, quiz, lives, bossHealth, bossStarted, answers });
  state.current = { heroX, heroY, gateStates, quiz, lives, bossHealth, bossStarted, answers };

  const finish = async (nextAnswers: GameAnswerInput[], reason: string) => {
    if (finished.current) return;
    finished.current = true; setBusy(true); setNotice(reason);
    if (reason.includes("Hết 3 mạng")) { setEnding("dinosaur"); await new Promise((resolve) => window.setTimeout(resolve, 850)); }
    if (reason.includes("hết giờ")) { setEnding("expired"); await new Promise((resolve) => window.setTimeout(resolve, 850)); }
    await onFinish({ answers: nextAnswers });
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key)) event.preventDefault();
      keys.current[event.key] = true;
    };
    const up = (event: KeyboardEvent) => { keys.current[event.key] = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

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
          if (word && nextY >= Math.max(0, gate.tier - 10)) { setQuiz({ phase: "gate", index: gateIndex, word }); setNotice(`Hộp quà ${gateIndex + 1}/${roundPlan.gateCount} đang chặn đường.`); }
          else if (gate.tier > 0) setNotice(gate.tier === 60 ? "Nhảy lên bục để chạm hộp quà." : "Leo bậc thấp rồi nhảy lên bục cao để chạm hộp quà.");
        } else if (current.gateStates.every((gate) => gate !== "closed") && current.bossHealth > 0 && nextX >= bossX - 78) {
          nextX = bossX - 78;
          const bossIndex = roundPlan.bossQuestions - current.bossHealth;
          const word = roundPlan.bossWords[bossIndex % Math.max(1, roundPlan.bossWords.length)];
          if (word) { setBossStarted(true); setQuiz({ phase: "boss", index: bossIndex, word }); setNotice(`Boss ${season.food.name}: trả lời đúng ${roundPlan.bossQuestions} câu trước khi hết 10 giây.`); }
        } else if (current.gateStates.every((gate) => gate !== "closed") && current.bossHealth <= 0 && nextX >= flagX - 30) {
          nextX = flagX - 30; void finish(current.answers, "🏁 Đã về đích!");
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
      if (value <= 1) { window.clearInterval(timer); void finish(state.current.answers, `⏱ ${season.food.name} khổng lồ đã hỏng — hết giờ.`); return 0; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [bossHealth, bossStarted, busy]);

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
      setNotice(correct ? "🍄 Đúng — cổng đã mở." : `💔 Sai — đáp án là “${quiz.word.english}”, cổng vẫn mở.`);
    } else {
      if (correct) { setBossHealth((value) => Math.max(0, value - 1)); setNotice(bossHealth <= 1 ? `😋 Đã ăn hết ${season.food.name} khổng lồ — chạy tới cờ!` : `${season.food.emoji} Đúng — Boss mất một miếng.`); }
      else setNotice(`💔 Sai — đáp án là “${quiz.word.english}”.`);
    }
    setAnswers(nextAnswers); setQuiz(null);
    if (nextLives <= 0) void finish(nextAnswers, "Hết 3 mạng — khủng long đã xuất hiện.");
  };

  const hold = (key: string, pressed: boolean) => { keys.current[key] = pressed; };
  const nudge = (direction: -1 | 1) => {
    hold(direction < 0 ? "ArrowLeft" : "ArrowRight", true);
    setHeroX((value) => Math.max(18, Math.min(flagX + 40, value + direction * 8)));
  };
  const jump = () => { hold("jump", true); if (velocityY.current === 0) velocityY.current = 11; };
  const camera = Math.max(0, Math.min(worldWidth - 900, heroX - 260));
  return <div className="game-runner">
    <div className="game-hud"><h2>Season-rio</h2><span>🍄 <strong>{score}/{roundPlan.total}</strong></span><span>Quà <strong>{gateStates.filter((gate) => gate !== "closed").length}/{roundPlan.gateCount}</strong></span><span>{season.food.emoji} {bossHealth > 0 ? `${"❤".repeat(bossHealth)} · ⏱ ${bossSeconds}s` : "xong"}</span><span aria-label={`${lives} tim`}>{"❤️".repeat(Math.max(0, lives))}{"🖤".repeat(Math.max(0, 3 - lives))}</span></div>
    <div className="rio-scene" role="application" aria-label="Màn chơi Season-rio" tabIndex={0}>
      <div className="rio-viewport"><div className="rio-world" style={{ width: worldWidth, transform: `translateX(-${camera}px)` }}>
        <div className="rio-cloud rio-cloud--one" /><div className="rio-cloud rio-cloud--two" />
        {platforms.map((platform, index) => <div data-testid="rio-platform" className="rio-platform" style={{ left: platform.left, width: platform.width, height: platform.height }} key={`${platform.left}-${index}`} />)}
        {activeGateLayout.map((gate, index) => <div data-testid="gift-gate" data-state={gateStates[index] ?? "closed"} data-tier={gate.tier} className={`gift-gate ${(gateStates[index] ?? "closed") !== "closed" ? "is-open" : ""}`} style={{ left: gate.left, bottom: 28 + gate.tier }} key={gate.left}><i className="gate-beam" /><GiftArt state={gateStates[index] ?? "closed"} /><i className="gate-post" /></div>)}
        <div data-testid="season-rio-boss" className={`rio-boss ${bossHealth <= 0 ? "is-cleared" : ""}`} style={{ left: bossX }}><b>{bossHealth <= 0 ? "😋" : season.food.emoji}</b><span>{bossHealth <= 0 ? "Đã ăn xong" : `${season.food.name.toUpperCase()} KHỔNG LỒ · ${bossSeconds}s`}</span></div>
        <div data-testid="season-rio-flag" className={`rio-flag ${gateStates.every((gate) => gate !== "closed") && bossHealth <= 0 ? "is-ready" : ""}`} style={{ left: flagX }}>🚩</div>
        <div data-testid="season-rio-hero" className={`rio-hero ${heroY > 0 ? "is-jumping" : ""}`} style={{ left: heroX, bottom: 28 + heroY }}><SeasonHero pose={heroY > 0 ? "jump" : "idle"} /></div>
        <div className="rio-ground" />
      </div></div>
      <div className="mario-controls" aria-label="Điều khiển Season-rio"><div><button type="button" aria-label="Sang trái" onPointerDown={() => nudge(-1)} onPointerUp={() => hold("ArrowLeft", false)} onPointerCancel={() => hold("ArrowLeft", false)} onPointerLeave={() => hold("ArrowLeft", false)}>←</button><button type="button" aria-label="Sang phải" onPointerDown={() => nudge(1)} onPointerUp={() => hold("ArrowRight", false)} onPointerCancel={() => hold("ArrowRight", false)} onPointerLeave={() => hold("ArrowRight", false)}>→</button></div><button className="jump" type="button" aria-label="Nhảy" onPointerDown={jump} onPointerUp={() => hold("jump", false)} onPointerCancel={() => hold("jump", false)}>↑ <small>Nhảy</small></button></div>
      {quiz ? <div className="rio-quiz" role="dialog" aria-label={quiz.phase === "gate" ? "Câu hỏi hộp quà" : "Câu hỏi Boss"}><div><span className="eyebrow">{quiz.phase === "gate" ? `Hộp quà ${quiz.index + 1}/${roundPlan.gateCount} hỏi` : `${season.food.emoji} Boss hỏi · ${bossSeconds}s`}</span><h3>{quiz.word.vietnamese}</h3><p>{quiz.word.definition}</p><div>{choices(words, quiz.word, 4, attemptSeed ^ quiz.index).map((choice) => <button type="button" disabled={busy} key={choice.id} onClick={() => answerQuiz(choice)}>{choice.english}</button>)}</div></div></div> : null}
      {ending ? <div className="game-ending" role="status"><span>{ending === "dinosaur" ? "🦖" : season.food.emoji}</span><strong>{ending === "dinosaur" ? "Hết 3 mạng!" : "Hết 10 giây!"}</strong><small>{ending === "dinosaur" ? "Khủng long đã bắt kịp bạn." : `${season.food.name} khổng lồ đã hỏng.`}</small></div> : null}
    </div>
    <p className="catch-help">Phím ← → di chuyển, Space / ↑ nhảy, hoặc dùng bộ nút trên màn chơi. Mỗi hộp quà là một cổng chắn ngang đường: chạm vào hộp hoặc cột gỗ để trả lời; trả lời xong cổng mới mở. Hộp trên bục thì phải leo lên bục trước. Đúng được nấm 🍄, sai mất ❤️. Cuối màn là {season.food.emoji} {season.food.name} khổng lồ – món khoái khẩu của {season.heroName}: trả lời đúng 3 câu trong 10 giây kể từ lúc chạm vào, quá giờ món ăn bị hỏng và thua. Xong thì chạm cờ để về đích.</p>
    <p className="game-notice" aria-live="polite">{notice}</p>
  </div>;
}
