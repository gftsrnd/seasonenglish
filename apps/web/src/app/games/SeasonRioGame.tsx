import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GameAnswerInput } from "@e4s/contracts";
import { seasonRioRoundPlan } from "@e4s/domain/engagement";
import { ArrowLeft, ArrowRight, ArrowUp, Gift, Heart, Target, Timer, Trophy } from "lucide-react";
import { choices, prepareGameAttempt, type FinishGame, type GameWord } from "./types.js";
import { currentSeasonVisual, DinoGameOverArt, GiftArt, SeasonHero } from "./season-art.js";
import { useExperience } from "../../features/experience/Experience.js";
import { GameFeedback } from "./GameFeedback.js";
import { InfoTitle, useCompactUi } from "../shared/CompactUi.js";

type Quiz = { phase: "gate" | "boss"; index: number; word: GameWord };
type GateState = "closed" | "correct" | "wrong";
const tierOrder = [0, 60, 0, 110, 60, 0, 110, 60] as const;
const gateLayout = tierOrder.map((tier, index) => ({ left: 360 + index * 330, tier }));

export function SeasonRioGame({ words: source, onFinish, attemptSeed = 0 }: { words: GameWord[]; onFinish: FinishGame; attemptSeed?: number }) {
  const compactUi = useCompactUi();
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
  const [motion, setMotion] = useState<"left" | "right" | null>(null);
  const { play } = useExperience();
  const keys = useRef<Record<string, boolean>>({});
  const velocityY = useRef(0);
  const finished = useRef(false);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const quizDialogRef = useRef<HTMLDivElement | null>(null);
  const focusBeforeQuiz = useRef<HTMLElement | null>(null);
  // A click can be delivered twice on touch/assistive-tech paths before React
  // has painted `quiz: null`. Keep the answer transition explicitly atomic so
  // Boss health and result-saving cannot advance twice or remount the scene.
  const answeringQuiz = useRef(false);
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
    const scene = sceneRef.current;
    const main = scene?.closest<HTMLElement>("main");
    if (main) main.scrollTop = 0;
    // Phones: bring the whole stage, controls included, above the bottom bar so
    // the thumbs land on ← → ↑ without scrolling first.
    // Deferred one frame: the game page resets its scroll to the top after this effect.
    const frame = scene && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 720px)").matches
      ? window.requestAnimationFrame(() => scene.scrollIntoView?.({ block: "nearest" }))
      : 0;
    scene?.focus({ preventScroll: true });
    return () => { if (frame) window.cancelAnimationFrame(frame); };
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
      if (key === "ArrowLeft" || key === "a") setMotion("left");
      if (key === "ArrowRight" || key === "d") setMotion("right");
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      keys.current[key] = false;
      if (["ArrowLeft", "ArrowRight", "a", "d"].includes(key) && !keys.current.ArrowLeft && !keys.current.ArrowRight && !keys.current.a && !keys.current.d) setMotion(null);
    };
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
        // Platforms are physical steps, not decoration. A runner on the ground
        // cannot phase through their side; they have to jump and land on top.
        const movingRight = nextX > current.heroX;
        const movingLeft = nextX < current.heroX;
        const blockingPlatform = platforms.find((platform) => {
          const belowTop = nextY < platform.height - 6;
          const entersFromLeft = movingRight && current.heroX + 24 <= platform.left && nextX + 24 > platform.left;
          const entersFromRight = movingLeft && current.heroX - 24 >= platform.left + platform.width && nextX - 24 < platform.left + platform.width;
          return belowTop && (entersFromLeft || entersFromRight);
        });
        if (blockingPlatform) {
          nextX = movingRight ? blockingPlatform.left - 24 : blockingPlatform.left + blockingPlatform.width + 24;
          setNotice("Bục gỗ chặn đường — nhảy lên để đi tiếp.");
        }
        // Leave a small collision margin so sub-pixel rAF motion cannot settle
        // just before the gate threshold without opening its question.
        const gateIndex = gatePositions.findIndex((position, index) => current.gateStates[index] === "closed" && nextX >= position - 52);
        if (gateIndex >= 0) {
          nextX = gatePositions[gateIndex]! - 52;
          const gate = activeGateLayout[gateIndex]!;
          const word = roundPlan.gateWords[gateIndex];
          if (word && nextY >= Math.max(0, gate.tier - 10)) {
            const nextQuiz = { phase: "gate" as const, index: gateIndex, word };
            // Stop the physics loop synchronously before React paints the
            // overlay. Without this, rAF could repeatedly re-open the same
            // gate during a browser frame and make the dialog flicker.
            state.current = { ...current, quiz: nextQuiz };
            setQuiz(nextQuiz);
            setNotice(`Hộp quà ${gateIndex + 1}/${roundPlan.gateCount} đang chặn đường.`);
          }
          else if (gate.tier > 0) setNotice(gate.tier === 60 ? "Đi lên bục để chạm hộp quà." : "Leo bậc thấp rồi lên bục cao để chạm hộp quà.");
        } else if (current.gateStates.every((gate) => gate !== "closed") && current.bossHealth > 0 && nextX >= bossX - 78) {
          nextX = bossX - 78;
          const bossIndex = roundPlan.bossQuestions - current.bossHealth;
          const word = roundPlan.bossWords[bossIndex % Math.max(1, roundPlan.bossWords.length)];
          if (word) {
            const nextQuiz = { phase: "boss" as const, index: bossIndex, word };
            state.current = { ...current, bossStarted: true, quiz: nextQuiz };
            setBossStarted(true);
            setQuiz(nextQuiz);
            setNotice(`Boss ${season.food.name}: trả lời đúng ${roundPlan.bossQuestions} câu trước khi hết 10 giây.`);
          }
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
      if (value <= 1) { window.clearInterval(timer); void finish(state.current.answers, `Hết giờ · ${season.food.name} khổng lồ đã hỏng.`); return 0; }
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
    // Do not preselect an answer on open. Focus the dialog itself so a pointer
    // user sees a neutral question, and keyboard navigation starts only once
    // the learner explicitly tabs into the options.
    quizDialogRef.current?.focus({ preventScroll: true });
  }, [quiz?.index, quiz?.phase]);

  const answerQuiz = (selected: GameWord) => {
    if (!quiz || busy || answeringQuiz.current) return;
    answeringQuiz.current = true;
    const correct = selected.id === quiz.word.id;
    play(correct ? "success" : "error");
    const answer: GameAnswerInput = { wordId: quiz.word.id, answer: selected.english, attempts: 1, usedHint: false, combo: 1 };
    const nextAnswers = [...answers, answer];
    let nextLives = lives;
    if (correct) setScore((value) => value + 1);
    else { nextLives -= 1; setLives(nextLives); }
    if (quiz.phase === "gate") {
      setGateStates((current) => current.map((value, index) => index === quiz.index ? (correct ? "correct" : "wrong") : value));
      setNotice(correct ? "Đúng · Cổng đã mở." : `Chưa đúng · Đáp án là “${quiz.word.english}”, cổng vẫn mở.`);
    } else {
      if (correct) { setBossHealth((value) => Math.max(0, value - 1)); setNotice(bossHealth <= 1 ? `Hoàn tất · Đã vượt qua ${season.food.name} khổng lồ — chạy tới cờ.` : "Đúng · Boss mất một điểm."); }
      else setNotice(`Chưa đúng · Đáp án là “${quiz.word.english}”.`);
    }
    setAnswers(nextAnswers); setQuiz(null);
    window.requestAnimationFrame(() => { answeringQuiz.current = false; });
    if (nextLives <= 0) void finish(nextAnswers, "Hết 3 mạng — khủng long đã xuất hiện.");
  };

  const hold = (key: string, pressed: boolean) => {
    keys.current[key] = pressed;
    if (key === "ArrowLeft" && pressed) setMotion("left");
    if (key === "ArrowRight" && pressed) setMotion("right");
    if (!pressed && ["ArrowLeft", "ArrowRight"].includes(key) && !keys.current.ArrowLeft && !keys.current.ArrowRight && !keys.current.a && !keys.current.d) setMotion(null);
  };
  const beginMove = (direction: -1 | 1) => {
    if (busy || quiz) return;
    hold(direction < 0 ? "ArrowLeft" : "ArrowRight", true);
  };
  // Touch: press and hold the left or right half of the stage to run that way.
  const stagePointer = useRef<{ id: number; key: "ArrowLeft" | "ArrowRight" } | null>(null);
  const pressStage = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || busy || quiz || stagePointer.current) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const key = event.clientX - bounds.left < bounds.width / 2 ? "ArrowLeft" : "ArrowRight";
    stagePointer.current = { id: event.pointerId, key };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sceneRef.current?.focus({ preventScroll: true });
    hold(key, true);
  };
  const releaseStage = (event: React.PointerEvent<HTMLDivElement>) => {
    const pressed = stagePointer.current;
    if (!pressed || pressed.id !== event.pointerId) return;
    stagePointer.current = null;
    hold(pressed.key, false);
  };
  const jump = () => { if (busy || quiz) return; hold("jump", true); if (velocityY.current === 0) velocityY.current = 11; };
  const trapQuizFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    if (!buttons.length) return;
    const first = buttons[0]!;
    const last = buttons.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const cameraLimit = Math.max(0, worldWidth - 900);
  const camera = Math.min(cameraLimit, Math.max(0, heroX * .35, heroX - 760));
  const isMoving = motion !== null;
  const heroPose = heroY > 0 ? "jump" : isMoving ? (Math.floor(heroX / 8) % 2 ? "run1" : "run2") : "idle";
  const noticeTone = notice.startsWith("Đúng") || notice.startsWith("Hoàn tất") || notice.startsWith("Về đích") ? "is-success" : notice.startsWith("Chưa") || notice.startsWith("Hết 3") ? "is-error" : notice.startsWith("Hết giờ") ? "is-warning" : "";
  return <div className="game-runner" aria-busy={busy || undefined}>
    <div className="game-hud">{compactUi ? <InfoTitle as="h2" title="Season-rio" tip={<>Giữ ← → để chạy, ↑ để nhảy. Chạm hộp quà để trả lời: trả lời xong cổng mở, sai mất ❤️. Cuối màn: đúng 3 câu với {season.food.emoji} trong 10 giây rồi về cờ.</>} label="Cách chơi Season-rio" /> : <h2>Season-rio</h2>}<span><Trophy size={16} aria-hidden="true" /><strong>{score}/{roundPlan.total}</strong></span><span><Gift size={16} aria-hidden="true" />Quà <strong>{gateStates.filter((gate) => gate !== "closed").length}/{roundPlan.gateCount}</strong></span><span><Target size={16} aria-hidden="true" />Boss <strong>{bossHealth > 0 ? bossHealth : "xong"}</strong>{bossHealth > 0 ? <><Timer size={14} aria-hidden="true" />{bossSeconds}s</> : null}</span><span className="game-lives" aria-label={`${lives} mạng còn lại`}>{[0, 1, 2].map((life) => <Heart className={life < lives ? "is-active" : "is-lost"} fill={life < lives ? "currentColor" : "none"} size={17} strokeWidth={2} aria-hidden="true" key={life} />)}</span></div>
    <div ref={sceneRef} className="rio-scene" role="application" aria-label="Màn chơi Season-rio" tabIndex={0} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "a", "d", "w"].includes(event.key)) event.preventDefault(); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { keys.current = {}; setMotion(null); } }}>
      <div className="rio-viewport" onPointerDown={pressStage} onPointerUp={releaseStage} onPointerCancel={releaseStage} onLostPointerCapture={releaseStage} onContextMenu={(event) => event.preventDefault()}><div className="rio-world" style={{ width: worldWidth, transform: `translateX(-${camera}px)` }}>
        <div className="rio-cloud rio-cloud--one" /><div className="rio-cloud rio-cloud--two" />
        {platforms.map((platform, index) => <div data-testid="rio-platform" className="rio-platform" style={{ left: platform.left, width: platform.width, height: platform.height }} key={`${platform.left}-${index}`} />)}
        {activeGateLayout.map((gate, index) => <div data-testid="gift-gate" data-state={gateStates[index] ?? "closed"} data-tier={gate.tier} className={`gift-gate ${(gateStates[index] ?? "closed") !== "closed" ? "is-open" : ""}`} style={{ left: gate.left, bottom: 28 + gate.tier }} key={gate.left}><i className="gate-beam" /><GiftArt state={gateStates[index] ?? "closed"} /><i className="gate-post" /></div>)}
        <div data-testid="season-rio-boss" className={`rio-boss ${bossHealth <= 0 ? "is-cleared" : ""}`} style={{ left: bossX }}><b>{bossHealth <= 0 ? "😋" : season.food.emoji}</b><span>{bossHealth <= 0 ? "Đã ăn xong" : `${season.food.name.toUpperCase()} KHỔNG LỒ · ${bossSeconds}s`}</span></div>
        <div data-testid="season-rio-flag" className={`rio-flag ${gateStates.every((gate) => gate !== "closed") && bossHealth <= 0 ? "is-ready" : ""}`} style={{ left: flagX }} aria-label="Cột mốc về đích"><img src="/media/games/flag.png" alt="" /><span>Đích</span></div>
        <div data-testid="season-rio-hero" className={`rio-hero ${heroY > 0 ? "is-jumping" : isMoving ? "is-running" : ""}`} style={{ left: heroX, bottom: 28 + heroY }}><SeasonHero pose={heroPose} /></div>
        <div className="rio-ground" />
      </div></div>
       <div className="mario-controls" aria-label="Điều khiển Season-rio"><div><RioControl label="Sang trái" disabled={busy || Boolean(quiz)} icon={<ArrowLeft className="game-control-icon" size={24} strokeWidth={2} aria-hidden="true" />} onPress={() => beginMove(-1)} onRelease={() => hold("ArrowLeft", false)} focusScene={() => sceneRef.current?.focus({ preventScroll: true })} /><RioControl label="Sang phải" disabled={busy || Boolean(quiz)} icon={<ArrowRight className="game-control-icon" size={24} strokeWidth={2} aria-hidden="true" />} onPress={() => beginMove(1)} onRelease={() => hold("ArrowRight", false)} focusScene={() => sceneRef.current?.focus({ preventScroll: true })} /></div><RioControl className="jump" label="Lên" disabled={busy || Boolean(quiz)} icon={<ArrowUp className="game-control-icon" size={24} strokeWidth={2} aria-hidden="true" />} onPress={jump} onRelease={() => hold("jump", false)} focusScene={() => sceneRef.current?.focus({ preventScroll: true })} /></div>
      {quiz ? <div ref={quizDialogRef} className="rio-quiz" role="dialog" aria-modal="true" aria-label={quiz.phase === "gate" ? "Câu hỏi hộp quà" : "Câu hỏi Boss"} tabIndex={-1} onKeyDown={trapQuizFocus}><div><span className="eyebrow">{quiz.phase === "gate" ? `Hộp quà ${quiz.index + 1}/${roundPlan.gateCount} hỏi` : `${season.food.emoji} Boss hỏi · ${bossSeconds}s`}</span><h3>{quiz.word.vietnamese}</h3><p>{quiz.word.definition}</p><div>{choices(words, quiz.word, 4, attemptSeed ^ quiz.index).map((choice) => <button type="button" disabled={busy} key={choice.id} onClick={() => answerQuiz(choice)}>{choice.english}</button>)}</div></div></div> : null}
      {ending ? <div className="game-ending" role="status">{ending === "dinosaur" ? <DinoGameOverArt /> : <span>{season.food.emoji}</span>}<strong>{ending === "dinosaur" ? "Hết mạng!" : "Hết 10 giây!"}</strong><small>{ending === "dinosaur" ? "Khủng long đã bắt kịp bạn." : `${season.food.name} khổng lồ đã hỏng.`}</small></div> : null}
    </div>
    {compactUi ? null : <p className="catch-help">Giữ ← → để chạy, ↑ để nhảy. Chạm hộp quà để trả lời: trả lời xong cổng mở, sai mất ❤️. Cuối màn: đúng 3 câu với {season.food.emoji} trong 10 giây rồi về cờ.</p>}
     {busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}
     <GameFeedback message={notice} tone={noticeTone === "is-success" ? "success" : noticeTone === "is-error" ? "error" : noticeTone === "is-warning" ? "warning" : "info"} />
  </div>;
}

function RioControl({ label, disabled, icon, onPress, onRelease, focusScene, className }: { label: string; disabled: boolean; icon: ReactNode; onPress: () => void; onRelease: () => void; focusScene: () => void; className?: string }) {
  const release = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    onRelease();
  };
  return <button className={className} type="button" aria-label={label} disabled={disabled} onPointerDown={(event) => {
    event.preventDefault();
    focusScene();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onPress();
  }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={onRelease} onContextMenu={(event) => event.preventDefault()} onClick={(event) => event.preventDefault()}>{icon}</button>;
}
