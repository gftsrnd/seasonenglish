import { useEffect, useMemo, useRef, useState } from "react";
import type { GameAnswerInput, GameEvidenceEventInput, GameWordSetView } from "@e4s/contracts";
import { CATCH_ROUND_SIZE, choices, prepareGameAttempt, type FinishGame, type GameWord } from "./types.js";
import { SeasonHearts, SeasonImage, SeasonStageSky, useGameSeason, useSeasonGameSound } from "./seven-season-art.js";
import { GameFeedback } from "./GameFeedback.js";
import { InfoTitle, useCompactUi } from "../shared/CompactUi.js";
import "./seven-season-games.css";

type FallingItem = { word: GameWord; x: number; y: number };
type CatchPose = "hero-stand" | "catch-arms" | "catch-hold" | "catch-correct" | "catch-wrong" | "catch-miss" | "catch-lose";
type CatchEffect = { x: number; y: number; id: number; asset: "fx/drop-land" | "fx/catch-correct" | "fx/catch-wrong" };
const speedByLevel: Record<GameWordSetView["cefr"], number> = { A1: 1, A2: 1.5, B1: 2, B2: 2.5, C1: 3 };

export function SeasonCatchGame({ words: source, cefr, onFinish, attemptSeed = 0 }: { words: GameWord[]; cefr: GameWordSetView["cefr"]; onFinish: FinishGame; attemptSeed?: number }) {
  const compactUi = useCompactUi();
  const season = useGameSeason();
  const playSound = useSeasonGameSound();
  const words = useMemo(() => prepareGameAttempt(source, attemptSeed).slice(0, CATCH_ROUND_SIZE), [attemptSeed, source]);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [basketX, setBasketX] = useState(50);
  const basketRef = useRef(50);
  const falling = useRef<FallingItem[]>([]);
  const [items, setItems] = useState<FallingItem[]>([]);
  const answers = useRef<GameAnswerInput[]>([]);
  const events = useRef<GameEvidenceEventInput[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<"lost" | "won" | null>(null);
  const [pose, setPose] = useState<CatchPose>("hero-stand");
  const [effects, setEffects] = useState<CatchEffect[]>([]);
  const effectId = useRef(0);
  const poseTimer = useRef<number | undefined>(undefined);
  const finishTimer = useRef<number | undefined>(undefined);
  const finished = useRef(false);
  const basketInteracted = useRef(false);
  const pointerDown = useRef(false);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const current = words[round];

  useEffect(() => {
    sceneRef.current?.focus({ preventScroll: true });
    const arms = window.setTimeout(() => setPose("catch-arms"), 100);
    const ready = window.setTimeout(() => setPose("catch-hold"), 350);
    return () => {
      window.clearTimeout(arms);
      window.clearTimeout(ready);
      window.clearTimeout(poseTimer.current);
      window.clearTimeout(finishTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const options = choices(words, current, 4, attemptSeed ^ round);
    falling.current = options.map((word, index) => ({ word, x: 12.5 + index * 25, y: -8 }));
    setItems(falling.current);
    basketInteracted.current = false;
  }, [attemptSeed, current, round, words]);

  useEffect(() => {
    if (!current || busy) return;
    let previous = performance.now();
    const speed = (7 + round * .22) * speedByLevel[cefr];
    const react = (nextPose: CatchPose) => {
      window.clearTimeout(poseTimer.current);
      setPose(nextPose);
      if (nextPose !== "catch-lose") poseTimer.current = window.setTimeout(() => setPose("catch-hold"), 540);
    };
    const finish = (state: "lost" | "won", finalAnswers: GameAnswerInput[]) => {
      if (finished.current) return;
      finished.current = true;
      window.clearTimeout(poseTimer.current);
      setBusy(true);
      setEnding(state);
      setPose(state === "lost" ? "catch-lose" : "catch-correct");
      if (state === "lost") playSound("game-over");
      finishTimer.current = window.setTimeout(() => void onFinish({
        answers: finalAnswers,
        ...(events.current.length ? { events: events.current } : {}),
      }), 850);
    };
    const timer = window.setInterval(() => {
      if (finished.current) return;
      const now = performance.now();
      const delta = Math.min(45, now - previous) / 1000;
      previous = now;
      const next = falling.current.map(item => ({ ...item, y: item.y + speed * delta }));
      const caught = basketInteracted.current
        ? next.find(item => item.y >= 73 && item.y <= 88 && Math.abs(item.x - basketRef.current) < 10)
        : undefined;
      if (caught) {
        const correct = caught.word.id === current.id;
        falling.current = next.filter(item => item !== caught);
        setItems(falling.current);
        const answer: GameAnswerInput = { wordId: current.id, answer: caught.word.english, attempts: 1, usedHint: false, combo: 1 };
        setEffects([{ x: caught.x, y: caught.y, id: ++effectId.current, asset: correct ? "fx/catch-correct" : "fx/catch-wrong" }]);
        if (correct) {
          playSound("catch-correct");
          answers.current.push(answer);
          setScore(value => value + 1);
          setNotice(`Đúng · Đã hứng “${current.english}”.`);
          if (round === words.length - 1) finish("won", answers.current);
          else {
            react("catch-correct");
            setRound(value => value + 1);
          }
        } else {
          events.current.push({ type: "wrong_catch", wordId: current.id, answer: caught.word.english });
          setLives(lives - 1);
          setNotice(`Chưa đúng · “${caught.word.english}” không khớp với gợi ý.`);
          if (lives === 1) finish("lost", [...answers.current, answer]);
          else {
            playSound("catch-wrong");
            react("catch-wrong");
          }
        }
        return;
      }
      const landed = next.filter(item => item.y >= 95);
      if (landed.length) {
        playSound("drop");
        react("catch-miss");
        setEffects(landed.map(item => ({ x: item.x, y: 93, id: ++effectId.current, asset: "fx/drop-land" })));
      }
      falling.current = next.map(item => item.y >= 95 ? { ...item, y: -8 } : item);
      setItems(falling.current);
    }, 50);
    return () => window.clearInterval(timer);
  }, [busy, cefr, current, lives, onFinish, playSound, round, words.length]);

  const moveBasket = (next: number) => {
    const bounded = Math.max(5, Math.min(95, next));
    basketRef.current = bounded;
    setBasketX(bounded);
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (busy || !sceneRef.current?.contains(document.activeElement)) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      basketInteracted.current = true;
      moveBasket(basketRef.current + (event.key === "ArrowLeft" ? -5 : 5));
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [busy]);

  if (!current) return <p className="muted">Bộ từ chưa đủ cho Season Catch.</p>;
  const setFromPointer = (clientX: number, element: HTMLElement) => {
    if (busy) return;
    const bounds = element.getBoundingClientRect();
    if (!bounds.width) return;
    basketInteracted.current = true;
    moveBasket(((clientX - bounds.left) / bounds.width) * 100);
  };
  const help = `Di chuyển rổ tới dưới ${season.drop.toLocaleLowerCase("vi")} đúng bằng kéo, chạm hoặc phím mũi tên.`;
  return <div className="game-runner" aria-busy={busy || undefined}>
    <div className="game-hud">
      {compactUi ? <InfoTitle as="h2" title={<>Lượt {round + 1}/{words.length}</>} tip={help} label="Cách chơi Season Catch" /> : <h2>Lượt {round + 1}/{words.length}</h2>}
      <span><SeasonImage season={season} asset="hud/score" className="season-hud-icon" /> Điểm <strong>{score}</strong></span>
      <SeasonHearts season={season} lives={lives} />
    </div>
    <div ref={sceneRef} className="catch-scene catch-arena seasonal-catch" role="application" aria-label="Màn chơi Season catch" tabIndex={0}
      onBlur={() => { pointerDown.current = false; }}
      onPointerMove={event => { if (!pointerDown.current && event.buttons === 0) return; event.preventDefault(); setFromPointer(event.clientX, event.currentTarget); }}
      onPointerDown={event => { event.preventDefault(); pointerDown.current = true; event.currentTarget.setPointerCapture?.(event.pointerId); event.currentTarget.focus({ preventScroll: true }); setFromPointer(event.clientX, event.currentTarget); }}
      onPointerUp={event => { pointerDown.current = false; if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId); }}
      onPointerCancel={() => { pointerDown.current = false; }} onLostPointerCapture={() => { pointerDown.current = false; }}>
      <SeasonStageSky season={season} />
      <SeasonImage season={season} asset="ground" className="season-stage-ground" />
      <p className="catch-prompt"><SeasonImage season={season} asset="drop" /><strong>{current.vietnamese}</strong><small>{current.definition}</small></p>
      {items.map(item => <div data-testid="falling-item" className="falling-item" key={item.word.id} style={{ left: `${item.x}%`, top: `${item.y}%` }}>
        <SeasonImage season={season} asset="fx/drop-trail" className="season-drop-trail" />
        <SeasonImage season={season} asset="drop" className="season-drop" />
        <b>{item.word.english}</b>
      </div>)}
      {effects.map(effect => <SeasonImage season={season} key={effect.id} asset={effect.asset} className="season-catch-effect" style={{ left: `${effect.x}%`, top: `${effect.y}%` }} />)}
      <div data-testid="catch-basket" className="catch-hero" style={{ left: `${basketX}%` }}>
        <SeasonImage season={season} asset={pose} alt={`${season.hero} cầm rổ`} className="season-catch-player" />
      </div>
      {ending ? <div className="season-catch-result" role="status">{ending === "won" ? "Hết lượt!" : "Hết mạng!"}</div> : null}
    </div>
    {compactUi ? null : <p className="catch-help">{help}</p>}
    {busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}
    <GameFeedback message={notice} tone={notice.startsWith("Đúng") ? "success" : notice.startsWith("Chưa") ? "error" : "info"} />
  </div>;
}
