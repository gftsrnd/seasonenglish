import { useEffect, useMemo, useRef, useState } from "react";
import type { ContentImageView, GameAnswerInput, GameEvidenceEventInput } from "@e4s/contracts";
import { CornerDownLeft, Delete, Volume2 } from "lucide-react";
import { normalize, prepareGameAttempt, type FinishGame, type GameWord } from "./types.js";
import { useExperience } from "../../features/experience/Experience.js";
import { ContentImage } from "../shared/media/ContentImage.js";

const keyboardRows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const timeFor = (word: string) => Math.max(4_000, word.replace(/\s/g, "").length * 900);

export function TypingRaceGame({ words: source, onFinish, attemptSeed = 0, onResolveImage }: {
  words: GameWord[]; onFinish: FinishGame; attemptSeed?: number;
  onResolveImage?: ((wordId: string) => Promise<ContentImageView>) | undefined;
}) {
  const words = useMemo(() => prepareGameAttempt(source.filter((word) => /^[a-z][a-z\s'-]*$/i.test(word.english)), attemptSeed).slice(0, 10), [attemptSeed, source]);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(1);
  const [answers, setAnswers] = useState<GameAnswerInput[]>([]);
  const [events, setEvents] = useState<GameEvidenceEventInput[]>([]);
  const [remaining, setRemaining] = useState(() => timeFor(words[0]?.english ?? ""));
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState("");
  const { play, speak } = useExperience();
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const deadline = useRef(performance.now() + remaining);
  const transitionTimer = useRef<number | null>(null);
  const transitioning = useRef(false);
  const state = useRef({ index, typed, combo, answers, events, busy });
  state.current = { index, typed, combo, answers, events, busy };
  const word = words[index];
  const target = normalize(word?.english ?? "");
  const maximum = timeFor(target);

  const next = async (answer: string, correct: boolean, timedOut = false) => {
    if (!word || busy || transitioning.current) return;
    if (!correct && !timedOut) {
      play("error");
      setCombo(1);
      setNotice(`❌ Chưa đúng — thử lại từ “${word.english}”.`);
      setTyped("");
      return;
    }
    const nextAnswers = [...answers, { wordId: word.id, answer, attempts: 1, usedHint: false, combo }];
    const nextEvents = timedOut ? [...events, { type: "timeout" as const, wordId: word.id, answer }] : events;
    if (correct) { play("success"); setScore((value) => value + 10 * combo); setCombo((value) => Math.min(5, value + 1)); setNotice(`✅ ${word.english}`); }
    else { play(timedOut ? "warning" : "error"); setCombo(1); setNotice(timedOut ? `⏱ Hết giờ — ${word.english}` : `❌ Đáp án đúng: ${word.english}`); }
    transitioning.current = true;
    setLocked(true);
    setAnswers(nextAnswers);
    setEvents(nextEvents);
    transitionTimer.current = window.setTimeout(() => {
      if (index >= words.length - 1) {
        setBusy(true);
        void onFinish(nextEvents.length ? { answers: nextAnswers, events: nextEvents } : { answers: nextAnswers });
        return;
      }
      setIndex((value) => value + 1);
      setTyped("");
      const nextMaximum = timeFor(words[index + 1]?.english ?? "");
      setRemaining(nextMaximum); deadline.current = performance.now() + nextMaximum;
      setNotice("");
      setLocked(false);
      transitioning.current = false;
    }, correct ? 500 : 1_200);
  };
  const submit = () => { if (!word || busy) return; void next(typed, normalize(typed) === target); };
  const press = (key: string) => {
    if (!word || busy || locked) return;
    if (key === "enter") { submit(); return; }
    if (key === "backspace") { setTyped((value) => value.slice(0, -1)); return; }
    if (typed.length >= target.length) return;
    const nextTyped = typed + key;
    setTyped(nextTyped);
  };

  useEffect(() => {
    const main = sceneRef.current?.closest<HTMLElement>("main");
    if (main) main.scrollTop = 0;
  }, []);
  useEffect(() => {
    if (!word || busy || locked) return;
    let frame = 0;
    const tick = (now: number) => {
      const left = Math.max(0, deadline.current - now);
      setRemaining(left);
      if (left <= 0) { void next("[timeout]", false, true); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [busy, index, locked]);
  useEffect(() => () => { if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current); }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      // Browser/application shortcuts must never become game answers.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Enter") { event.preventDefault(); press("enter"); }
      else if (event.key === "Backspace") { event.preventDefault(); press("backspace"); }
      else if (event.key === " " || /^[a-z'-]$/i.test(event.key)) press(event.key.toLowerCase());
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  if (!word) return <p className="muted">Bộ từ chưa đủ từ phù hợp cho Typing race.</p>;
  const loadImage = () => {
    if (onResolveImage) return onResolveImage(word.id);
    if (word.imageUrl?.trim() && word.imageAttribution) return Promise.resolve({ status: "available", imageUrl: word.imageUrl.trim(), alt: word.english, attribution: word.imageAttribution } as const);
    return Promise.resolve({ status: "unavailable" } as const);
  };
  const noticeTone = notice.startsWith("✅") ? "is-success" : notice.startsWith("❌") ? "is-error" : notice.startsWith("⏱") ? "is-warning" : "";
  return <div className="game-runner" aria-busy={busy || undefined}>
    <div className="game-hud"><h2>Từ {index + 1}/{words.length}</h2><span>Điểm <strong>{score}</strong></span><span>Combo ×{combo}</span></div>
    <div ref={sceneRef} className="typing-scene">
      <div className="typing-clue"><div className="typing-clue-image"><ContentImage term={word.english} load={loadImage} required /></div><button type="button" className="typing-clue-speak" aria-label={`Nghe ${word.english}`} onClick={() => speak(word.english)}><Volume2 className="game-control-icon" size={18} strokeWidth={2} aria-hidden="true" /></button><div className="typing-clue-copy"><span className="eyebrow">Gợi ý</span><strong>{word.vietnamese}</strong><small>{word.definition} · {target.replace(/\s/g, "").length} chữ cái{target.includes(" ") ? ", có dấu cách" : ""}</small></div></div>
      <div className="typing-timer" role="progressbar" aria-label="Thời gian còn lại" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={Math.round(remaining)}><i style={{ width: `${Math.max(0, Math.min(100, remaining / maximum * 100))}%` }} /></div>
      <div className="typing-word" aria-label="Từ đang gõ">{target.split("").map((character, characterIndex) => { const value = typed[characterIndex]; const state = value === undefined ? "" : value === character ? "is-correct" : "is-wrong"; return <span data-testid="typing-character" className={state} key={characterIndex}>{character === " " ? " " : value?.toUpperCase() ?? ""}</span>; })}</div>
      <div className="virtual-keyboard" role="group" aria-label="Bàn phím ảo">{keyboardRows.map((row) => <div className="keyboard-row" key={row}>{row.split("").map((letter) => <button type="button" disabled={busy || locked} key={letter} onClick={() => press(letter)}>{letter}</button>)}</div>)}<div className="keyboard-row keyboard-row--actions"><button type="button" disabled={busy || locked} onClick={() => press(" ")}>Dấu cách</button><button type="button" aria-label="Xoá ký tự cuối" disabled={busy || locked} onClick={() => press("backspace")}><Delete className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" /></button><button className="is-enter" type="button" aria-label="Nhập" disabled={busy || locked} onClick={() => press("enter")}><CornerDownLeft className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" /></button></div></div>
      {busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}
      <p className={`game-notice ${noticeTone}`} aria-live="polite">{notice}</p>
    </div>
  </div>;
}
