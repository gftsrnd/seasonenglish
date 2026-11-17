import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GameAnswerInput } from "@e4s/contracts";
import { seasonRioRoundPlan } from "@e4s/domain/engagement";
import { choices, prepareGameAttempt, type FinishGame, type GameWord } from "./types.js";
import { SeasonHearts, SeasonImage, SeasonStageSky, useGameSeason, useSeasonGameSound } from "./seven-season-art.js";
import { GameFeedback } from "./GameFeedback.js";
import { InfoTitle, useCompactUi } from "../shared/CompactUi.js";
import "./seven-season-games.css";

type Quiz = { phase: "gate" | "boss"; index: number; word: GameWord };
type GateState = "closed" | "correct" | "wrong";
type Ending = "lost" | "expired" | "won";
type RioReaction = { id: number; phase: Quiz["phase"]; index: number; correct: boolean };
const tierOrder = [0, 60, 0, 110, 60, 0, 110, 60] as const;
const floor = 36;

export function SeasonRioGame({ words: source, onFinish, attemptSeed = 0 }: { words: GameWord[]; onFinish: FinishGame; attemptSeed?: number }) {
  const compactUi = useCompactUi();
  const season = useGameSeason();
  const playSound = useSeasonGameSound();
  const words = useMemo(() => prepareGameAttempt(source, attemptSeed), [attemptSeed, source]);
  const roundPlan = useMemo(() => seasonRioRoundPlan(words), [words]);
  const { gates: activeGateLayout, platforms } = useMemo(() => {
    // The opening staircase uses the proportions supplied for this season.
    const [positions, widths, tiers, gateIndex] = season.layout;
    const opening = positions.map((position, index) => {
      const center = Math.round(position * 3.2);
      const width = Math.round(widths[index]! * 1.08);
      return { left: center - width / 2, center, width, height: Math.round(tiers[index]! * .56) };
    });
    const first = opening[gateIndex]!;
    const gates = tierOrder.slice(0, roundPlan.gateCount).map((tier, index) => ({
      left: first.center + index * 330,
      tier: index === 0 ? first.height : tier,
    }));
    const steps = gates.slice(1).flatMap(gate => gate.tier === 60
      ? [{ left: gate.left - 54, width: 150, height: 60 }]
      : gate.tier === 110
        ? [{ left: gate.left - 158, width: 104, height: 55 }, { left: gate.left - 54, width: 150, height: 110 }]
        : []);
    return { gates, platforms: [...opening, ...steps] };
  }, [roundPlan.gateCount, season.layout]);
  const bossX = (activeGateLayout.at(-1)?.left ?? 285) + 390;
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
  const [ending, setEnding] = useState<Ending | null>(null);
  const [reaction, setReaction] = useState<RioReaction | null>(null);
  const [dust, setDust] = useState<{ id: number; x: number; y: number } | null>(null);
  const [motion, setMotion] = useState<"left" | "right" | null>(null);
  const effectId = useRef(0);
  const reactionTimer = useRef<number | undefined>(undefined);
  const finishTimer = useRef<number | undefined>(undefined);
  const bossDeadline = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const velocityY = useRef(0);
  const finished = useRef(false);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const quizDialogRef = useRef<HTMLDivElement | null>(null);
  const focusBeforeQuiz = useRef<HTMLElement | null>(null);
  // A click can be delivered twice on touch/assistive-tech paths before React
  // has painted `quiz: null`. Keep the answer transition explicitly atomic so
  // Boss health and result-saving cannot advance twice or remount the scene.
  const answeringQuiz = useRef(false);
  const state = useRef({ heroX, heroY, gateStates, quiz, lives, bossHealth, bossStarted, answers });
  state.current = { heroX, heroY, gateStates, quiz, lives, bossHealth, bossStarted, answers };

  const finish = useCallback((nextAnswers: GameAnswerInput[], outcome: Ending) => {
    if (finished.current) return;
    finished.current = true;
    setBusy(true);
    setQuiz(null);
    setEnding(outcome);
    setNotice(outcome === "won" ? "Đã về đích!" : outcome === "expired" ? "Hết giờ!" : "Hết mạng!");
    playSound(outcome === "won" ? "boss-win" : outcome === "expired" ? "timeout" : "game-over");
    finishTimer.current = window.setTimeout(() => void onFinish({ answers: nextAnswers }), 850);
  }, [onFinish, playSound]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = () => setViewportWidth(viewport.clientWidth || 900);
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

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
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(reactionTimer.current);
      window.clearTimeout(finishTimer.current);
    };
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
      if (["ArrowLeft", "ArrowRight", "a", "d"].includes(key) && !keys.current[key]) playSound("run");
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
  }, [busy, playSound, quiz]);

  useEffect(() => {
    if (busy) return;
    let last = performance.now(); let frame = 0;
    const step = (now: number) => {
      const delta = Math.min(35, now - last) / 16.7; last = now;
      const current = state.current;
      if (!current.quiz) {
        let nextX = current.heroX + ((keys.current.ArrowRight || keys.current.d) ? 4.2 * delta : (keys.current.ArrowLeft || keys.current.a) ? -4.2 * delta : 0);
        let nextY = current.heroY;
        if ((keys.current.ArrowUp || keys.current[" "] || keys.current.w || keys.current.jump) && velocityY.current === 0) {
          velocityY.current = 11;
          setDust({ id: ++effectId.current, x: current.heroX, y: current.heroY });
          playSound("jump");
        }
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
          setNotice("Nhảy lên bục để đi tiếp.");
        }
        // Leave a small collision margin so sub-pixel rAF motion cannot settle
        // just before the gate threshold without opening its question.
        const gateIndex = activeGateLayout.findIndex((gate, index) => current.gateStates[index] === "closed" && nextX >= gate.left - 28);
        if (gateIndex >= 0) {
          const gate = activeGateLayout[gateIndex]!;
          nextX = gate.left - 28;
          const word = roundPlan.gateWords[gateIndex];
          if (word && nextY >= gate.tier - 1) {
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
            if (!current.bossStarted) bossDeadline.current = performance.now() + 10_000;
            setBossStarted(true);
            setQuiz(nextQuiz);
            setNotice(`Boss ${season.boss}: trả lời đúng ${roundPlan.bossQuestions} câu trong 10 giây.`);
          }
        } else if (current.gateStates.every((gate) => gate !== "closed") && current.bossHealth <= 0 && nextX >= flagX - 30) {
          nextX = flagX - 30; finish(current.answers, "won");
        }
        if (nextX !== current.heroX) setHeroX(nextX);
        if (nextY !== current.heroY) setHeroY(nextY);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [activeGateLayout, bossX, busy, finish, flagX, platforms, playSound, roundPlan, season.boss]);

  useEffect(() => {
    if (!bossStarted || bossHealth <= 0 || busy) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((bossDeadline.current - performance.now()) / 1000));
      setBossSeconds(seconds);
      if (seconds === 0) {
        window.clearInterval(timer);
        finish(state.current.answers, "expired");
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [bossHealth, bossStarted, busy, finish]);

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
    playSound(!correct ? "catch-wrong" : quiz.phase === "gate" ? "gate-open" : bossHealth === 1 ? "boss-win" : "boss-hit");
    const answer: GameAnswerInput = { wordId: quiz.word.id, answer: selected.english, attempts: 1, usedHint: false, combo: 1 };
    const nextAnswers = [...answers];
    // A wrong Boss answer costs a life, but retains the same question. Save
    // one result per slot so the server scores a subsequent correct try.
    nextAnswers[quiz.phase === "gate" ? quiz.index : roundPlan.gateCount + quiz.index] = answer;
    const feedback: RioReaction = { id: ++effectId.current, phase: quiz.phase, index: quiz.index, correct };
    setReaction(feedback);
    window.clearTimeout(reactionTimer.current);
    reactionTimer.current = window.setTimeout(() => setReaction(null), 1180);
    let nextLives = lives;
    if (correct) setScore((value) => value + 1);
    else { nextLives -= 1; setLives(nextLives); }
    if (quiz.phase === "gate") {
      setGateStates((current) => current.map((value, index) => index === quiz.index ? (correct ? "correct" : "wrong") : value));
      setNotice(correct ? "Đúng · Cổng đã mở." : `Chưa đúng · Đáp án là “${quiz.word.english}”, cổng vẫn mở.`);
    } else {
      if (correct) { setBossHealth((value) => Math.max(0, value - 1)); setNotice(bossHealth === 1 ? "Đã vượt boss. Chạy tới cờ!" : "Đúng · Boss mất một điểm."); }
      else setNotice(`Chưa đúng · Đáp án là “${quiz.word.english}”.`);
    }
    setAnswers(nextAnswers); setQuiz(null);
    window.requestAnimationFrame(() => { answeringQuiz.current = false; });
    if (nextLives <= 0) finish(nextAnswers, "lost");
  };

  const hold = (key: string, pressed: boolean) => {
    if (pressed && key !== "jump" && !keys.current[key]) playSound("run");
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
  const jump = () => { if (busy || quiz) return; hold("jump", true); };
  const trapQuizFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    if (!buttons.length) return;
    const first = buttons[0]!;
    const last = buttons.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const cameraLimit = Math.max(0, worldWidth - viewportWidth);
  const camera = Math.min(cameraLimit, Math.max(0, heroX - viewportWidth * .4));
  const isMoving = motion !== null;
  const isAirborne = heroY > 0 && velocityY.current !== 0;
  const heroPose = ending === "won" ? "rio-joy" : ending ? "rio-lose" : reaction ? (reaction.correct ? "rio-joy" : "rio-shock")
    : isAirborne ? "rio-jump" : isMoving ? (Math.floor(heroX / 8) % 2 ? "rio-run-1" : "rio-run-2") : "rio-idle";
  const bossPose = ending === "expired" ? "boss-expired" : bossHealth <= 0 ? "boss-cleared"
    : reaction?.phase === "boss" ? (reaction.correct ? "boss-recoil" : "boss-smug") : bossStarted ? "boss-quiz" : "boss-idle";
  const bossEffect = ending === "expired" ? "fx/boss-timeout"
    : reaction?.phase === "boss" ? (bossHealth === 0 ? "fx/boss-clear" : reaction.correct ? "fx/boss-hit" : "fx/boss-wrong")
    : bossStarted && bossHealth === roundPlan.bossQuestions ? "fx/boss-ready" : null;
  const flagReady = gateStates.every(gate => gate !== "closed") && bossHealth <= 0;
  const help = "Chạy và nhảy tới hộp quà. Trả lời xong cổng mở, sai mất một tim. Vượt boss với 3 câu đúng trong 10 giây rồi chạm cờ.";
  return <div className="game-runner" aria-busy={busy || undefined}>
    <div className="game-hud">
      {compactUi ? <InfoTitle as="h2" title="Season-rio" tip={help} label="Cách chơi Season-rio" /> : <h2>Season-rio</h2>}
      <span><SeasonImage season={season} asset="hud/score" className="season-hud-icon" /><strong>{score}/{roundPlan.total}</strong></span>
      <span><SeasonImage season={season} asset="hud/gifts" className="season-hud-icon" />Quà <strong>{gateStates.filter(gate => gate !== "closed").length}/{roundPlan.gateCount}</strong></span>
      <span>Boss <strong>{bossHealth > 0 ? bossHealth : "xong"}</strong>
        {bossStarted && bossHealth > 0 ? <><SeasonImage season={season} asset="hud/timer" className="season-hud-icon" />{bossSeconds}s</> : null}
      </span>
      <SeasonHearts season={season} lives={lives} />
    </div>
    <div ref={sceneRef} className="rio-scene seasonal-rio" role="application" aria-label="Màn chơi Season-rio" tabIndex={0}
      onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "a", "d", "w"].includes(event.key)) event.preventDefault(); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { keys.current = {}; setMotion(null); } }}>
      <div ref={viewportRef} className="rio-viewport" onPointerDown={pressStage} onPointerUp={releaseStage} onPointerCancel={releaseStage} onLostPointerCapture={releaseStage} onContextMenu={event => event.preventDefault()}>
        <SeasonStageSky season={season} />
        <div className="rio-world" style={{ width: worldWidth, transform: `translateX(-${camera}px)` }}>
          <SeasonImage season={season} asset="ground" className="season-stage-ground" />
          {platforms.map(platform => <img key={platform.left} data-testid="rio-platform" className="rio-platform" src={`/media/games/seven-seasons/seasons/${season.id}/platform.svg`} alt="" draggable={false}
            style={{ left: platform.left, width: platform.width, height: platform.height }} />)}
          {activeGateLayout.map((gate, index) => {
            const gateState = gateStates[index] ?? "closed";
            const reacting = reaction?.phase === "gate" && reaction.index === index;
            return <div data-testid="gift-gate" data-state={gateState} data-tier={gate.tier} className="gift-gate seasonal-rio-gate" style={{ left: gate.left, bottom: floor + gate.tier }} key={gate.left}>
              <SeasonImage season={season} asset="gate-post" className="season-gate-post" />
              <SeasonImage season={season} asset={gateState === "correct" ? "chest-open" : gateState === "wrong" && reacting ? "chest-wrong" : "chest"} className="season-gate-chest" />
              <span className="season-gate-mark" aria-label={gateState === "closed" ? "Cổng đang chờ" : gateState === "correct" ? "Trả lời đúng" : "Trả lời sai"}>{gateState === "closed" ? "?" : gateState === "correct" ? "✓" : "×"}</span>
              {reacting ? <SeasonImage key={reaction.id} season={season} asset={reaction.correct ? "fx/chest-fireworks" : "fx/gate-wrong"} className="season-gate-burst" /> : null}
            </div>;
          })}
          <div data-testid="season-rio-boss" className="rio-boss" data-pose={bossPose} style={{ left: bossX }}>
            <SeasonImage season={season} asset={bossPose} alt={season.boss} className="season-rio-boss-art" />
            {bossEffect ? <SeasonImage key={reaction?.id} season={season} asset={bossEffect} className="season-boss-burst" /> : null}
          </div>
          <div data-testid="season-rio-flag" className={`rio-flag ${flagReady ? "is-ready" : ""}`} style={{ left: flagX }} aria-label="Cột mốc về đích">
            <SeasonImage season={season} asset="finish-flag" /><span>Đích</span>
          </div>
          {dust ? <SeasonImage key={dust.id} season={season} asset="shared-jump" className="season-rio-dust" style={{ left: dust.x, bottom: floor + dust.y }} /> : null}
          <div data-testid="season-rio-hero" className={`rio-hero ${isAirborne ? "is-jumping" : isMoving ? "is-running" : ""}`} style={{ left: heroX, bottom: floor + heroY }}>
            <SeasonImage season={season} asset={heroPose} alt={season.hero} className={motion === "left" ? "is-facing-left" : ""} />
          </div>
        </div>
        {quiz ? <div ref={quizDialogRef} className="rio-quiz" role="dialog" aria-modal="true" aria-label={quiz.phase === "gate" ? "Câu hỏi hộp quà" : "Câu hỏi Boss"} tabIndex={-1} onKeyDown={trapQuizFocus}>
          <div>
            <span className="eyebrow">{quiz.phase === "gate" ? `Hộp quà ${quiz.index + 1}/${roundPlan.gateCount}` : `Boss ${season.boss} · ${bossSeconds}s`}</span>
            <h3>{quiz.word.vietnamese}</h3>{quiz.word.definition !== quiz.word.vietnamese ? <p>{quiz.word.definition}</p> : null}
            <div>{choices(words, quiz.word, 4, attemptSeed ^ quiz.index).map(choice => <button type="button" disabled={busy} key={choice.id} onClick={() => answerQuiz(choice)}>{choice.english}</button>)}</div>
          </div>
        </div> : null}
        {ending ? <div className="season-stage-result" role="status">
          <SeasonImage season={season} asset={ending === "won" ? "fx/win" : ending === "expired" ? "fx/boss-timeout" : "fx/lose"} />
          {ending === "won" ? "Đã về đích!" : ending === "expired" ? "Hết giờ!" : "Hết mạng!"}
        </div> : null}
      </div>
      <div className="mario-controls" aria-label="Điều khiển Season-rio">
        <div>
          <RioControl label="Sang trái" disabled={busy || Boolean(quiz)} icon={<SeasonImage season={season} asset="hud/left" />} onPress={() => beginMove(-1)} onRelease={() => hold("ArrowLeft", false)} focusScene={() => sceneRef.current?.focus({ preventScroll: true })} />
          <RioControl label="Sang phải" disabled={busy || Boolean(quiz)} icon={<SeasonImage season={season} asset="hud/right" />} onPress={() => beginMove(1)} onRelease={() => hold("ArrowRight", false)} focusScene={() => sceneRef.current?.focus({ preventScroll: true })} />
        </div>
        <RioControl className="jump" label="Lên" disabled={busy || Boolean(quiz)} icon={<SeasonImage season={season} asset="hud/jump" />} onPress={jump} onRelease={() => hold("jump", false)} focusScene={() => sceneRef.current?.focus({ preventScroll: true })} />
      </div>
    </div>
    {compactUi ? null : <p className="catch-help">{help}</p>}
    {busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}
    <GameFeedback message={notice} tone={notice.startsWith("Đúng") || notice.startsWith("Đã") ? "success" : notice.startsWith("Chưa") || ending === "lost" ? "error" : ending === "expired" ? "warning" : "info"} />
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
