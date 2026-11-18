import { useEffect, useMemo, useRef, useState } from "react";
import type { GameAnswerInput, GameEvidenceEventInput, GameWordSetView } from "@e4s/contracts";
import { choices, gameRoundWords, type FinishGame, type GameWord } from "./types.js";
import { GameHud, useGameClock, useRoundTally } from "./GameHud.js";
import { SeasonHearts, SeasonImage, SeasonStageGround, SeasonStageSky, useGameSeason, useSeasonGameSound } from "./seven-season-art.js";
import { GameFeedback } from "./GameFeedback.js";
import { InfoTitle, useCompactUi } from "../shared/CompactUi.js";
import "./seven-season-games.css";

type CatchPose = "hero-stand" | "catch-arms" | "catch-hold" | "catch-correct" | "catch-wrong" | "catch-miss" | "catch-lose";
type CatchEffect = { x: number; y: number; id: number; asset: "fx/drop-land" | "fx/catch-correct" | "fx/catch-wrong" };
const laneX = (index: number) => 12.5 + index * 25;
const speedByLevel: Record<GameWordSetView["cefr"], number> = { A1: 1, A2: 1.5, B1: 2, B2: 2.5, C1: 3 };

export function SeasonCatchGame({ words: source, cefr, onFinish, attemptSeed = 0 }: { words: GameWord[]; cefr: GameWordSetView["cefr"]; onFinish: FinishGame; attemptSeed?: number }) {
  const compactUi = useCompactUi();
  const season = useGameSeason();
  const playSound = useSeasonGameSound();
  const words = useMemo(() => gameRoundWords("eggs", source, attemptSeed), [attemptSeed, source]);
  const [round, setRound] = useState(0);
  const [lives, setLives] = useState(3);
  const livesRef = useRef(3);
  const basketRef = useRef(50);
  const basketEdge = useRef(5);
  const answers = useRef<GameAnswerInput[]>([]);
  const events = useRef<GameEvidenceEventInput[]>([]);
  // Answers so far as state, for the live HUD (refs feed the final submission).
  const [played, setPlayed] = useState<GameAnswerInput[]>([]);
  const clock = useGameClock();
  const tally = useRoundTally("eggs", words, played);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<"lost" | "won" | null>(null);
  const [pose, setPose] = useState<CatchPose>("hero-stand");
  const [effects, setEffects] = useState<CatchEffect[]>([]);
  const effectId = useRef(0);
  const finishTimer = useRef<number | undefined>(undefined);
  const soundLatest = useRef(playSound);
  soundLatest.current = playSound;
  const finishLatest = useRef(onFinish);
  finishLatest.current = onFinish;
  const keys = useRef(new Set<string>());
  const touchDirection = useRef(0);
  const drag = useRef<{ id: number; left: number; width: number } | null>(null);
  const runnerRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const catcherRef = useRef<HTMLDivElement | null>(null);
  const groundRef = useRef<HTMLDivElement | null>(null);
  const current = words[round];
  const options = useMemo(() => current ? choices(words, current, 4, attemptSeed ^ round) : [], [attemptSeed, current, round, words]);

  useEffect(() => {
    sceneRef.current?.focus({ preventScroll: true });
    const arms = window.setTimeout(() => setPose("catch-arms"), 100);
    const ready = window.setTimeout(() => setPose("catch-hold"), 350);
    return () => {
      window.clearTimeout(arms);
      window.clearTimeout(ready);
      window.clearTimeout(finishTimer.current);
    };
  }, []);

  const moveBasket = (next: number) => {
    basketRef.current = Math.max(basketEdge.current, Math.min(100 - basketEdge.current, next));
    if (catcherRef.current) catcherRef.current.style.left = `${basketRef.current}%`;
  };

  useEffect(() => {
    const arena = sceneRef.current;
    const sprite = catcherRef.current;
    const ground = groundRef.current;
    const wave = waveRef.current;
    if (!arena || !sprite || !ground || !wave || !current || busy) return;

    let frame = 0;
    let nextRoundTimer: number | undefined;
    let previous = performance.now();
    let y = -8;
    let resolved = false;
    const speed = (7 + round * .22) * speedByLevel[cefr];
    let width = 0, height = 0, rimY = 0, surfaceY = 0, reach = 0;
    const measure = () => {
      const arenaBox = arena.getBoundingClientRect();
      const spriteBox = sprite.getBoundingClientRect();
      width = arenaBox.width;
      height = arenaBox.height;
      if (!width || !height) return;
      basketEdge.current = Math.min(50, Math.max(5, spriteBox.width * 50 / width));
      moveBasket(basketRef.current);
      // The supplied catcher art has an inset at the top edge of its square.
      rimY = (spriteBox.top + spriteBox.height * .1725 - arenaBox.top) * 100 / height;
      surfaceY = (ground.getBoundingClientRect().top + 3 - arenaBox.top) * 100 / height;
      reach = spriteBox.width * .28 + (wave.querySelector(".season-drop")?.getBoundingClientRect().width ?? 0) * .23;
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(arena);
    observer?.observe(sprite);

    const resolveWave = (caughtIndex: number) => {
      resolved = true;
      wave.style.visibility = "hidden";
      const caught = options[caughtIndex];
      const correct = caught?.id === current.id;
      // A wrong catch and a drop that reaches the ground both score 0 and cost a life.
      const nextLives = correct ? livesRef.current : livesRef.current - 1;
      answers.current.push({ wordId: current.id, answer: caught?.english ?? "", attempts: 1, usedHint: false, ms: clock.lap() });
      clock.pause();
      setPlayed([...answers.current]);
      if (!correct) {
        livesRef.current = nextLives;
        setLives(nextLives);
      }
      if (caught) {
        if (!correct) events.current.push({ type: "wrong_catch", wordId: current.id, answer: caught.english });
        setNotice(correct ? `Đúng · Đã hứng “${caught.english}”.` : `Chưa đúng · “${caught.english}” không khớp với gợi ý.`);
        setPose(correct ? "catch-correct" : "catch-wrong");
        setEffects([{ x: laneX(caughtIndex), y: rimY, id: ++effectId.current, asset: correct ? "fx/catch-correct" : "fx/catch-wrong" }]);
        soundLatest.current(correct ? "catch-correct" : "catch-wrong");
      } else {
        events.current.push({ type: "timeout", wordId: current.id, answer: "" });
        setNotice("Chưa hứng được · Mất 1 mạng.");
        setPose("catch-miss");
        setEffects(options.map((_, index) => ({ x: laneX(index), y: surfaceY, id: ++effectId.current, asset: "fx/drop-land" })));
        soundLatest.current("drop");
      }

      if (nextLives === 0 || round + 1 === words.length) {
        setBusy(true);
        setEnding(nextLives === 0 ? "lost" : "won");
        if (nextLives === 0) {
          setPose("catch-lose");
          setEffects([]);
          setNotice("Hết mạng!");
          soundLatest.current("game-over");
        }
        finishTimer.current = window.setTimeout(() => void finishLatest.current({
          answers: answers.current,
          ...(events.current.length ? { events: events.current } : {}),
        }), 750);
        return;
      }

      nextRoundTimer = window.setTimeout(() => {
        setNotice("");
        setEffects([]);
        setPose("catch-hold");
        setRound(value => value + 1);
      }, 650);
    };

    const step = (now: number) => {
      const delta = Math.min(60, now - previous) / 1000;
      previous = now;
      const left = keys.current.has("arrowleft") || keys.current.has("a");
      const right = keys.current.has("arrowright") || keys.current.has("d");
      const direction = touchDirection.current || Number(right) - Number(left);
      if (direction) moveBasket(basketRef.current + direction * 72 * delta);

      if (!resolved && height > 0) {
        const nextY = y + speed * delta;
        if (y < rimY && nextY >= rimY) {
          let nearest = -1;
          let distance = reach;
          options.forEach((_, index) => {
            const gap = Math.abs(laneX(index) - basketRef.current) * width / 100;
            if (gap > distance) return;
            nearest = index;
            distance = gap;
          });
          if (nearest >= 0) resolveWave(nearest);
        }
        if (!resolved && nextY >= surfaceY) resolveWave(-1);
        if (!resolved) {
          wave.style.transform = `translate3d(0, ${nextY * height / 100}px, 0)`;
          if (y < 0 && nextY >= 0) wave.style.visibility = "visible";
          y = nextY;
        }
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    clock.start();
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(nextRoundTimer);
      observer?.disconnect();
      clock.pause();
    };
  }, [busy, cefr, clock, current, options, round, words.length]);

  const clearMovement = () => {
    keys.current.clear();
    touchDirection.current = 0;
    drag.current = null;
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const key = event.key.toLowerCase();
      if (busy || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented ||
        (active !== document.body && !runnerRef.current?.contains(active))) return;
      if (key !== "arrowleft" && key !== "arrowright" && key !== "a" && key !== "d") return;
      event.preventDefault();
      if (keys.current.has(key)) return;
      keys.current.add(key);
      moveBasket(basketRef.current + (key === "arrowleft" || key === "a" ? -5 : 5));
    };
    const keyup = (event: KeyboardEvent) => { keys.current.delete(event.key.toLowerCase()); };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", clearMovement);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clearMovement);
      clearMovement();
    };
  }, [busy]);

  if (!current) return <p className="muted">Bộ từ chưa đủ cho Season Catch.</p>;
  const help = `Hứng ${season.drop.toLocaleLowerCase("vi")} đúng. Dùng nút trái/phải, phím ← → hoặc A/D, hoặc kéo rổ.`;
  return <div ref={runnerRef} className="game-runner" aria-busy={busy || undefined}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearMovement(); }}>
    <GameHud title={compactUi ? <InfoTitle as="h2" title={<>Lượt {round + 1}/{words.length}</>} tip={help} label="Cách chơi Season Catch" /> : <h2>Lượt {round + 1}/{words.length}</h2>} raw={tally.raw} combo={tally.combo} clock={clock}>
      <SeasonHearts season={season} lives={lives} />
    </GameHud>
    <div ref={sceneRef} className="catch-scene catch-arena seasonal-catch" role="application" aria-label="Màn chơi Season catch" tabIndex={0}
      onPointerMove={event => {
        const pointer = drag.current;
        if (busy || pointer?.id !== event.pointerId) return;
        moveBasket((event.clientX - pointer.left) * 100 / pointer.width);
      }}
      onPointerDown={event => {
        if (busy || event.button !== 0) return;
        const { left, width } = event.currentTarget.getBoundingClientRect();
        if (!width) return;
        event.preventDefault();
        drag.current = { id: event.pointerId, left, width };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.currentTarget.focus({ preventScroll: true });
        moveBasket((event.clientX - left) * 100 / width);
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}>
      <SeasonStageSky season={season} />
      <SeasonStageGround season={season} groundRef={groundRef} />
      <p className="catch-prompt"><SeasonImage season={season} asset="drop" /><strong>{current.vietnamese}</strong>{current.definition !== current.vietnamese ? <small>{current.definition}</small> : null}</p>
      <div ref={waveRef} key={round} className="catch-wave">
        {options.map((word, index) => <div data-testid="falling-item" className="falling-item" key={word.id} style={{ left: `${laneX(index)}%` }}>
          <SeasonImage season={season} asset="fx/drop-trail" className="season-drop-trail" />
          <SeasonImage season={season} asset="drop" className="season-drop" />
          <b>{word.english}</b>
        </div>)}
      </div>
      {effects.map(effect => <SeasonImage season={season} key={effect.id} asset={effect.asset} className="season-catch-effect" style={{ left: `${effect.x}%`, top: `${effect.y}%` }} />)}
      <div ref={catcherRef} data-testid="catch-basket" className="catch-hero" style={{ left: "50%" }}>
        <SeasonImage season={season} asset={pose} alt={`${season.hero} cầm rổ`} className="season-catch-player" />
      </div>
      {ending === "won" ? <div className="season-stage-result" role="status">
        <SeasonImage season={season} asset="fx/win" />
        Hết lượt!
      </div> : null}
    </div>
    {compactUi ? <div className="season-catch-controls" role="group" aria-label="Điều khiển Season Catch">
      {([-1, 1] as const).map(direction => <button type="button" key={direction}
        aria-label={direction === -1 ? "Sang trái" : "Sang phải"} disabled={busy}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          sceneRef.current?.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture?.(event.pointerId);
          touchDirection.current = direction;
          moveBasket(basketRef.current + direction * 5);
        }}
        onPointerUp={() => { touchDirection.current = 0; }}
        onPointerCancel={() => { touchDirection.current = 0; }}
        onLostPointerCapture={() => { touchDirection.current = 0; }}
        onClick={event => { if (event.detail === 0) moveBasket(basketRef.current + direction * 5); }}>
        <SeasonImage season={season} asset={direction === -1 ? "hud/left" : "hud/right"} />
      </button>)}
    </div> : <p className="catch-help">{help}</p>}
    {busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}
    <GameFeedback message={notice} tone={notice.startsWith("Đúng") ? "success" : (ending === "lost" || notice.startsWith("Chưa")) ? "error" : "info"} />
  </div>;
}
