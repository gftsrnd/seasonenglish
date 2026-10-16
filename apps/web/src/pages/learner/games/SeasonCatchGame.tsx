import { useEffect, useMemo, useRef, useState } from "react";
import type { GameAnswerInput, GameEvidenceEventInput, GameWordSetView } from "@e4s/contracts";
import { choices, prepareGameAttempt, type FinishGame, type GameWord } from "./types.js";
import { currentSeasonVisual, SeasonCatchItem, SeasonHero } from "./season-art.js";
import { useExperience } from "../../../features/experience/Experience.js";

type FallingItem = { word: GameWord; x: number; y: number; speed: number };
type CatchEvent = { kind: "caught" | "dropped"; item: FallingItem };
const speedByLevel: Record<GameWordSetView["cefr"], number> = { A1: 1, A2: 1.5, B1: 2, B2: 2.5, C1: 3 };

export function SeasonCatchGame({ words: source, cefr, onFinish, attemptSeed = 0 }: { words: GameWord[]; cefr: GameWordSetView["cefr"]; onFinish: FinishGame; attemptSeed?: number }) {
  const season = currentSeasonVisual();
  const words = useMemo(() => prepareGameAttempt(source, attemptSeed).slice(0, 10), [attemptSeed, source]);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [basketX, setBasketX] = useState(50);
  const basketRef = useRef(50);
  const [items, setItems] = useState<FallingItem[]>([]);
  const [answers, setAnswers] = useState<GameAnswerInput[]>([]);
  const [events, setEvents] = useState<GameEvidenceEventInput[]>([]);
  const [notice, setNotice] = useState("");
  const [event, setEvent] = useState<CatchEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const { play } = useExperience();
  const current = words[round];
  const eventPending = useRef(false);

  useEffect(() => { basketRef.current = basketX; }, [basketX]);
  useEffect(() => {
    if (!current) return;
    const options = choices(words, current, 4, attemptSeed ^ round);
    const startingHeights = [-2, 10, 22, 34];
    setItems(options.map((word, index) => ({ word, x: 12.5 + index * 25, y: startingHeights[index] ?? -2, speed: 7 + index * .7 + round * .22 })));
    eventPending.current = false;
  }, [attemptSeed, current, round, words]);

  useEffect(() => {
    if (!current || busy) return;
    let previous = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const delta = Math.min(45, now - previous) / 1000;
      previous = now;
      setItems((existing) => {
        if (eventPending.current) return existing;
        const next = existing.map((item) => ({ ...item, y: item.y + item.speed * speedByLevel[cefr] * delta }));
        const caught = next.find((item) => item.y >= 73 && item.y <= 88 && Math.abs(item.x - basketRef.current) < 10);
        if (caught) {
          eventPending.current = true;
          queueMicrotask(() => setEvent({ kind: "caught", item: caught }));
          return next.filter((item) => item !== caught);
        }
        const droppedCorrect = next.find((item) => item.word.id === current.id && item.y >= 91);
        if (droppedCorrect) {
          eventPending.current = true;
          queueMicrotask(() => setEvent({ kind: "dropped", item: droppedCorrect }));
        }
        return next.filter((item) => item.y < 95);
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [busy, cefr, current]);

  useEffect(() => {
    if (!event || !current || busy) return;
    const correct = event.kind === "caught" && event.item.word.id === current.id;
    if (event.kind === "caught" && !correct) {
      play("error");
      const nextEvents = [...events, { type: "wrong_catch" as const, wordId: current.id, answer: event.item.word.english }];
      const nextLives = lives - 1;
      setLives(nextLives);
      setEvents(nextEvents);
      setNotice(`💔 “${event.item.word.english}” không khớp với gợi ý.`);
      setEvent(null);
      eventPending.current = false;
      if (nextLives <= 0) {
        const nextAnswers = [...answers, { wordId: current.id, answer: event.item.word.english, attempts: 1, usedHint: false, combo: 1 }];
        setBusy(true); setGameOver(true);
        window.setTimeout(() => void onFinish({ answers: nextAnswers, events: nextEvents }), 850);
      }
      return;
    }
    const answer: GameAnswerInput = { wordId: current.id, answer: correct ? current.english : "[dropped]", attempts: 1, usedHint: false, combo: 1 };
    const nextAnswers = [...answers, answer];
    const nextLives = correct ? lives : lives - 1;
    if (correct) { play("success"); setScore((value) => value + 1); setNotice(`✅ Đã hứng đúng “${current.english}”.`); }
    else { play("error"); setLives(nextLives); setNotice(`💔 “${current.english}” đã rơi xuống đất.`); }
    setEvent(null);
    if (round >= words.length - 1 || nextLives <= 0) {
      setBusy(true);
      const result = events.length ? { answers: nextAnswers, events } : { answers: nextAnswers };
      if (nextLives <= 0) { setGameOver(true); window.setTimeout(() => void onFinish(result), 850); }
      else void onFinish(result);
    } else {
      setAnswers(nextAnswers); setRound((value) => value + 1);
    }
  }, [answers, busy, current, event, events, lives, onFinish, round, words.length]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.preventDefault();
      if (event.key === "ArrowLeft") setBasketX((value) => Math.max(5, value - 5));
      if (event.key === "ArrowRight") setBasketX((value) => Math.min(95, value + 5));
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  if (!current) return <p className="muted">Bộ từ chưa đủ cho Season catch.</p>;
  const setFromPointer = (clientX: number, element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width) return;
    setBasketX(Math.max(5, Math.min(95, ((clientX - bounds.left) / bounds.width) * 100)));
  };
  return <div className="game-runner">
    <div className="game-hud"><h2>Lượt {Math.min(round + 1, words.length)}/{words.length}</h2><span>Điểm <strong>{score}</strong></span><span aria-label={`${lives} tim`}>{"❤️".repeat(Math.max(0, lives))}{"🖤".repeat(Math.max(0, 3 - lives))}</span></div>
    <div className="catch-scene catch-arena" role="application" aria-label="Màn chơi Season catch" tabIndex={0} onPointerMove={(event) => setFromPointer(event.clientX, event.currentTarget)} onPointerDown={(event) => setFromPointer(event.clientX, event.currentTarget)}>
      <p className="catch-prompt"><SeasonCatchItem /><strong>{current.vietnamese}</strong><small>{current.definition}</small></p>
      <div className="catch-sky" aria-hidden="true"><span className="cloud cloud--one" /><span className="cloud cloud--two" /></div>
      {items.map((item) => <div data-testid="falling-item" className="falling-item" key={item.word.id} style={{ left: `${item.x}%`, top: `${item.y}%` }}><SeasonCatchItem /><b>{item.word.english}</b></div>)}
      <div data-testid="catch-basket" className="catch-hero" style={{ left: `${basketX}%` }}><span className="basket" aria-hidden="true">🧺</span><SeasonHero className="season-animal" /></div>
      <div className="catch-ground" />
      {gameOver ? <div className="game-ending" role="status"><span>🦖</span><strong>Hết 3 mạng!</strong><small>Khủng long đã xuất hiện.</small></div> : null}
    </div>
    <p className="catch-help">Kéo chuột / chạm hoặc dùng phím ← → để đưa {season.heroName} và chiếc rổ tới dưới {season.catchItem.name} đúng. Tốc độ {cefr} ×{speedByLevel[cefr]}.</p>
    <p className="game-notice" aria-live="polite">{notice}</p>
  </div>;
}
