import { useEffect, useMemo, useRef, useState } from "react";
import type { GameAnswerInput, GameEvidenceEventInput, GameWordSetView } from "@e4s/contracts";
import { CheckCircle2, Heart, HeartCrack, XCircle } from "lucide-react";
import { choices, prepareGameAttempt, type FinishGame, type GameWord } from "./types.js";
import { currentSeasonVisual } from "./season-visual.js";
import { ProductArt } from "../shared/media/ProductArt.js";
import { useExperience } from "../../features/experience/Experience.js";

type FallingItem = { word: GameWord; x: number; y: number; speed: number };
type CatchEvent = { kind: "caught"; item: FallingItem };
type NoticeTone = "neutral" | "success" | "error";
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
  const [notice, setNotice] = useState<{ text: string; tone: NoticeTone }>({ text: "", tone: "neutral" });
  const [event, setEvent] = useState<CatchEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const { play } = useExperience();
  const current = words[round];
  const eventPending = useRef(false);
  const basketInteracted = useRef(false);
  const pointerDown = useRef(false);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const wordsKey = words.map((word) => word.id).join("|");
  const currentId = current?.id;

  useEffect(() => {
    sceneRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => { basketRef.current = basketX; }, [basketX]);
  useEffect(() => {
    if (!current) return;
    const options = choices(words, current, 4, attemptSeed ^ round);
    const startingHeight = -8;
    const fallingSpeed = 7 + round * .22;
    setItems(options.map((word, index) => ({ word, x: 12.5 + index * 25, y: startingHeight, speed: fallingSpeed })));
    eventPending.current = false;
    basketInteracted.current = false;
  }, [attemptSeed, currentId, round, wordsKey]);

  useEffect(() => {
    if (!current || busy) return;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(45, now - previous) / 1000;
      previous = now;
      setItems((existing) => {
        if (eventPending.current) return existing;
        const next = existing.map((item) => ({ ...item, y: item.y + item.speed * speedByLevel[cefr] * delta }));
        const caught = basketInteracted.current
          ? next.find((item) => item.y >= 73 && item.y <= 88 && Math.abs(item.x - basketRef.current) < 10)
          : undefined;
        if (caught) {
          eventPending.current = true;
          queueMicrotask(() => setEvent({ kind: "caught", item: caught }));
          return next.filter((item) => item !== caught);
        }
        // Missing a target is not an answer. Wrap it back to the top instead of
        // consuming a life while the learner is idle; only a deliberate wrong
        // catch or a correct catch may advance the round.
        return next.map((item) => item.y >= 95 ? { ...item, y: -8 } : item);
      });
    };
    const timer = window.setInterval(() => tick(performance.now()), 50);
    return () => window.clearInterval(timer);
  }, [busy, cefr, currentId]);

  useEffect(() => {
    if (!event || !current || busy) return;
    const correct = event.kind === "caught" && event.item.word.id === current.id;
    if (!correct) {
      play("error");
      const nextEvents = [...events, { type: "wrong_catch" as const, wordId: current.id, answer: event.item.word.english }];
      const nextLives = lives - 1;
      setLives(nextLives);
      setEvents(nextEvents);
      setNotice({ text: `“${event.item.word.english}” không khớp với gợi ý.`, tone: "error" });
      setEvent(null);
      eventPending.current = false;
      if (nextLives <= 0) {
        const nextAnswers = [...answers, { wordId: current.id, answer: event.item.word.english, attempts: 1, usedHint: false, combo: 1 }];
        setBusy(true); setGameOver(true);
        window.setTimeout(() => void onFinish({ answers: nextAnswers, events: nextEvents }), 850);
      }
      return;
    }
    const answer: GameAnswerInput = { wordId: current.id, answer: correct ? current.english : "[wrong-catch]", attempts: 1, usedHint: false, combo: 1 };
    const nextAnswers = [...answers, answer];
    const nextLives = correct ? lives : lives - 1;
    if (correct) { play("success"); setScore((value) => value + 1); setNotice({ text: `Đã hứng đúng “${current.english}”.`, tone: "success" }); }
    else { play("error"); setLives(nextLives); setNotice({ text: `“${current.english}” đã rơi xuống đất.`, tone: "error" }); }
    setEvent(null);
    if (round >= words.length - 1 || nextLives <= 0) {
      setBusy(true);
      const nextEvents = events;
      const result = nextEvents.length ? { answers: nextAnswers, events: nextEvents } : { answers: nextAnswers };
      if (nextLives <= 0) { setGameOver(true); window.setTimeout(() => void onFinish(result), 850); }
      else void onFinish(result);
    } else {
      setAnswers(nextAnswers); setRound((value) => value + 1);
    }
  }, [answers, busy, current, event, events, lives, onFinish, round, words.length]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const scene = sceneRef.current;
      if (busy || !scene || !scene.contains(document.activeElement)) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        basketInteracted.current = true;
      }
      if (event.key === "ArrowLeft") setBasketX((value) => Math.max(5, value - 5));
      if (event.key === "ArrowRight") setBasketX((value) => Math.min(95, value + 5));
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [busy]);

  if (!current) return <p className="muted">Bộ từ chưa đủ cho Season catch.</p>;
  const setFromPointer = (clientX: number, element: HTMLElement) => {
    if (busy) return;
    const bounds = element.getBoundingClientRect();
    if (!bounds.width) return;
    basketInteracted.current = true;
    setBasketX(Math.max(5, Math.min(95, ((clientX - bounds.left) / bounds.width) * 100)));
  };
  const noticeTone = notice.tone === "success" ? "is-success" : notice.tone === "error" ? "is-error" : "";
  return <div className="game-runner" aria-busy={busy || undefined}>
    <div className="game-hud"><h2>Lượt {Math.min(round + 1, words.length)}/{words.length}</h2><span>Điểm <strong>{score}</strong></span><span className="game-life-count" aria-label={`${lives} mạng còn lại trên 3`}>{Array.from({ length: 3 }, (_, index) => index < lives ? <Heart key={index} size={18} fill="currentColor" aria-hidden="true" /> : <HeartCrack key={index} size={18} aria-hidden="true" />)}</span></div>
    <div ref={sceneRef} className="catch-scene catch-arena" role="application" aria-label="Màn chơi Season catch" tabIndex={0} onBlur={() => { eventPending.current = false; pointerDown.current = false; }} onPointerMove={(event) => { if (!pointerDown.current && event.buttons === 0) return; event.preventDefault(); setFromPointer(event.clientX, event.currentTarget); }} onPointerDown={(event) => { event.preventDefault(); pointerDown.current = true; event.currentTarget.focus({ preventScroll: true }); setFromPointer(event.clientX, event.currentTarget); }} onPointerUp={() => { pointerDown.current = false; }} onPointerCancel={() => { pointerDown.current = false; }} onPointerLeave={() => { pointerDown.current = false; }}>
      <p className="catch-prompt"><ProductArt id={`catch-${season.theme}`} decorative className="catch-product-art" /><strong>{current.vietnamese}</strong><small>{current.definition}</small></p>
      {items.map((item) => <div data-testid="falling-item" className="falling-item" aria-label={`${season.catchItem.label}: ${item.word.english}`} key={item.word.id} style={{ left: `${item.x}%`, top: `${item.y}%` }}><ProductArt id={`catch-${season.theme}`} decorative className="catch-product-art" /><b>{item.word.english}</b></div>)}
      <div data-testid="catch-basket" className="catch-hero" aria-label={`${season.heroName} điều khiển rổ`} style={{ left: `${basketX}%` }}><ProductArt id="basket" decorative className="basket" /><ProductArt id={`hero-${season.hero}`} decorative className="season-animal" /></div>
      <div className="catch-ground" />
      {gameOver ? <div className="game-ending" role="status"><ProductArt id="dinosaur" decorative className="dino" /><strong>Hết mạng!</strong><small>Khủng long đã xuất hiện.</small></div> : null}
    </div>
    <p className="catch-help">Đưa {season.heroName} và rổ tới dưới {season.catchItem.name} đúng bằng kéo/chạm hoặc phím ← →. Tốc độ {cefr} ×{speedByLevel[cefr]}.</p>
     {busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}
     <p className={`game-notice ${noticeTone}`} aria-live="polite">{notice.text ? <span className="game-notice-content">{notice.tone === "success" ? <CheckCircle2 size={17} aria-hidden="true" /> : notice.tone === "error" ? <XCircle size={17} aria-hidden="true" /> : null}<span>{notice.text}</span></span> : null}</p>
  </div>;
}
