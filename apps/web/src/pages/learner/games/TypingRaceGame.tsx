import { useEffect, useMemo, useRef, useState } from "react";
import type { GameAnswerInput } from "@e4s/contracts";
import { normalize, type FinishGame, type GameWord } from "./types.js";

const keyboardRows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const timeFor = (word: string) => Math.max(4_000, word.replace(/\s/g, "").length * 900);

export function TypingRaceGame({ words: source, onFinish }: { words: GameWord[]; onFinish: FinishGame }) {
  const words = useMemo(() => source.filter((word) => /^[a-z][a-z\s'-]*$/i.test(word.english)).slice(0, 10), [source]);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(1);
  const [answers, setAnswers] = useState<GameAnswerInput[]>([]);
  const [remaining, setRemaining] = useState(() => timeFor(words[0]?.english ?? ""));
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState("");
  const deadline = useRef(performance.now() + remaining);
  const transitionTimer = useRef<number | null>(null);
  const transitioning = useRef(false);
  const state = useRef({ index, typed, combo, answers, busy });
  state.current = { index, typed, combo, answers, busy };
  const word = words[index];
  const target = normalize(word?.english ?? "");
  const maximum = timeFor(target);

  const next = async (answer: string, correct: boolean, timedOut = false) => {
    if (!word || busy || transitioning.current) return;
    if (!correct && !timedOut) {
      setCombo(1);
      setNotice(`❌ Chưa đúng — thử lại từ “${word.english}”.`);
      setTyped("");
      return;
    }
    const nextAnswers = [...answers, { wordId: word.id, answer, attempts: 1, usedHint: false, combo }];
    if (correct) { setScore((value) => value + 10 * combo); setCombo((value) => Math.min(5, value + 1)); setNotice(`✅ ${word.english}`); }
    else { setCombo(1); setNotice(timedOut ? `⏱ Hết giờ — ${word.english}` : `❌ Đáp án đúng: ${word.english}`); }
    transitioning.current = true;
    setLocked(true);
    setAnswers(nextAnswers);
    transitionTimer.current = window.setTimeout(() => {
      if (index >= words.length - 1) {
        setBusy(true);
        void onFinish({ answers: nextAnswers });
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
      if (event.key === "Enter") { event.preventDefault(); press("enter"); }
      else if (event.key === "Backspace") { event.preventDefault(); press("backspace"); }
      else if (event.key === " " || /^[a-z'-]$/i.test(event.key)) press(event.key.toLowerCase());
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  if (!word) return <p className="muted">Bộ từ chưa đủ từ phù hợp cho Typing race.</p>;
  return <div className="game-runner">
    <div className="game-hud"><h2>Từ {index + 1}/{words.length}</h2><span>Điểm <strong>{score}</strong></span><span>Combo ×{combo}</span></div>
    <div className="typing-scene">
      <div className="typing-clue"><div><span className="eyebrow">Gợi ý</span><strong>{word.vietnamese}</strong><small>{word.definition} · {target.replace(/\s/g, "").length} chữ cái{target.includes(" ") ? ", có dấu cách" : ""}</small></div></div>
      <div className="typing-timer" role="progressbar" aria-label="Thời gian còn lại" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={Math.round(remaining)}><i style={{ width: `${Math.max(0, Math.min(100, remaining / maximum * 100))}%` }} /></div>
      <div className="typing-word" aria-label="Từ đang gõ">{target.split("").map((character, characterIndex) => { const value = typed[characterIndex]; const state = value === undefined ? "" : value === character ? "is-correct" : "is-wrong"; return <span data-testid="typing-character" className={state} key={characterIndex}>{character === " " ? " " : value?.toUpperCase() ?? ""}</span>; })}</div>
      <div className="virtual-keyboard" role="group" aria-label="Bàn phím ảo">{keyboardRows.map((row) => <div className="keyboard-row" key={row}>{row.split("").map((letter) => <button type="button" disabled={busy || locked} key={letter} onClick={() => press(letter)}>{letter}</button>)}</div>)}<div className="keyboard-row keyboard-row--actions"><button type="button" disabled={busy || locked} onClick={() => press(" ")}>Dấu cách</button><button type="button" disabled={busy || locked} onClick={() => press("backspace")}>⌫</button><button className="is-enter" type="button" disabled={busy || locked} onClick={() => press("enter")}>↵</button></div></div>
      <p className="game-notice" aria-live="polite">{notice}</p>
    </div>
  </div>;
}
