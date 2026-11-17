import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GameAnswerInput, GameEvidenceEventInput } from "@e4s/contracts";
import { Delete, Volume2 } from "lucide-react";
import { isTypingWord, normalize, prepareGameAttempt, TYPING_ROUND_SIZE, type FinishGame, type GameWord } from "./types.js";
import { typingMaximum } from "@e4s/domain/engagement";
import { useExperience } from "../../features/experience/Experience.js";
import { GameFeedback } from "./GameFeedback.js";

const keyboardRows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const timeFor = (word: string) => Math.max(4_000, word.replace(/\s/g, "").length * 900);
/** How a key press landed: `hit`/`miss` flash the key, `pressed` only animates it (backspace, ignored presses). */
type KeyTone = "pressed" | "hit" | "miss";
/** Physical KeyboardEvent.key → answer key, or null for keys the game does not use. */
const answerKey = (key: string) => key === "Backspace" ? "backspace" : /^[a-z'-]$/i.test(key) ? key.toLowerCase() : null;
// A held physical key stays down until keyup; this only rescues a lost keyup (e.g. focus moved mid-press).
const HELD_KEY_FALLBACK_MS = 1_000;
// A click/tap has no hold of its own once released, so it shows a short press.
const TAP_PRESS_MS = 160;

export function TypingRaceGame({ words: source, onFinish, attemptSeed = 0 }: {
  words: GameWord[]; onFinish: FinishGame; attemptSeed?: number;
}) {
  const words = useMemo(() => prepareGameAttempt(source.filter(isTypingWord), attemptSeed).slice(0, TYPING_ROUND_SIZE), [attemptSeed, source]);
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
      // Never reveal the word before time runs out (13/11); the answer is shown only on timeout.
      setNotice("Chưa đúng · Thử lại nhé.");
      setTyped("");
      return;
    }
    const nextAnswers = [...answers, { wordId: word.id, answer, attempts: 1, usedHint: false, combo }];
    const nextEvents = timedOut ? [...events, { type: "timeout" as const, wordId: word.id, answer }] : events;
    if (correct) { play("success"); setScore((value) => value + 10 * combo); setCombo((value) => Math.min(5, value + 1)); setNotice(`Đúng · ${word.english}`); }
    else { play(timedOut ? "warning" : "error"); setCombo(1); setNotice(timedOut ? `Hết giờ · Đáp án: ${word.english}` : `Chưa đúng · Đáp án đúng: ${word.english}`); }
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
  // No submit key: the word is checked as it is typed. A match advances at
  // once; a wrong word only counts once every slot is filled (as a wrong
  // Enter used to), so mid-word typos are never penalised.
  const press = (key: string): KeyTone => {
    // Ignored presses (busy/locked/full) still animate the key but change nothing.
    if (!word || busy || locked) return "pressed";
    if (key === "backspace") { setTyped((value) => value.trimEnd().slice(0, -1)); return "pressed"; }
    if (typed.length >= target.length) return "pressed";
    const nextTyped = typed + key + (target[typed.length + 1] === " " ? " " : "");
    setTyped(nextTyped);
    if (normalize(nextTyped) === target) void next(nextTyped, true);
    else if (nextTyped.length >= target.length) void next(nextTyped, false);
    return key === target[typed.length] ? "hit" : "miss";
  };
  // Keys currently shown pressed on the on-screen keyboard (physical keys and clicks alike).
  const [pressedKeys, setPressedKeys] = useState<Readonly<Record<string, KeyTone>>>({});
  const pressTimers = useRef(new Map<string, number>());
  const releaseKey = (name: string) => {
    const timer = pressTimers.current.get(name);
    if (timer !== undefined) { window.clearTimeout(timer); pressTimers.current.delete(name); }
    setPressedKeys((current) => {
      if (!(name in current)) return current;
      const { [name]: _released, ...rest } = current;
      return rest;
    });
  };
  const holdKey = (name: string, tone: KeyTone, fallbackMs: number) => {
    const timer = pressTimers.current.get(name);
    if (timer !== undefined) window.clearTimeout(timer);
    pressTimers.current.set(name, window.setTimeout(() => releaseKey(name), fallbackMs));
    setPressedKeys((current) => current[name] === tone ? current : { ...current, [name]: tone });
  };
  // Shared props for every on-screen key: a pointer/touch holds it down, the click types it and
  // keeps a short press (with the hit/miss flash) after the finger lifts.
  const keyProps = (key: string, base?: string) => {
    const tone = pressedKeys[key];
    return {
      type: "button" as const,
      "data-key": key,
      className: [base, tone && "is-pressed", tone === "hit" && "is-hit", tone === "miss" && "is-miss"].filter(Boolean).join(" ") || undefined,
      disabled: busy || locked,
      onPointerDown: () => holdKey(key, "pressed", HELD_KEY_FALLBACK_MS),
      onPointerLeave: () => { if (pressedKeys[key] === "pressed") releaseKey(key); },
      onPointerCancel: () => releaseKey(key),
      onClick: () => holdKey(key, press(key), TAP_PRESS_MS)
    };
  };

  useEffect(() => {
    const main = sceneRef.current?.closest<HTMLElement>("main");
    if (main) main.scrollTop = 0;
    sceneRef.current?.focus({ preventScroll: true });
  }, []);
  const nextRef = useRef(next);
  nextRef.current = next;
  // The bar itself shrinks with a CSS animation (duration = the word's time
  // limit, restarted per word through its key), so it stays smooth however
  // often React renders. JS only keeps the deadline: a timeout ends the round
  // and a once-per-second sample feeds aria-valuenow and the stepped bar used
  // under prefers-reduced-motion.
  useEffect(() => {
    if (!word || busy || locked) return;
    const sample = () => setRemaining(Math.max(0, deadline.current - performance.now()));
    sample();
    const interval = window.setInterval(sample, 1_000);
    const timeout = window.setTimeout(() => {
      setRemaining(0);
      void nextRef.current("[timeout]", false, true);
    }, Math.max(0, deadline.current - performance.now()));
    return () => { window.clearInterval(interval); window.clearTimeout(timeout); };
  }, [busy, index, locked]);
  useEffect(() => () => { if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current); }, []);
  // Subscribed once; the handlers read the latest render through these refs.
  const pressRef = useRef(press);
  pressRef.current = press;
  const keyActions = useRef({ holdKey, releaseKey });
  keyActions.current = { holdKey, releaseKey };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const scene = sceneRef.current;
      if (!scene || !scene.contains(document.activeElement)) return;
      // Browser/application shortcuts must never become game answers.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Answers advance automatically and phrase separators are inserted as the learner types.
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); return; }
      const key = answerKey(event.key);
      if (key === null) return;
      if (key === "backspace") event.preventDefault();
      keyActions.current.holdKey(key, pressRef.current(key), HELD_KEY_FALLBACK_MS);
    };
    // Released wherever focus is, so a key never stays stuck down.
    const keyup = (event: KeyboardEvent) => {
      const key = answerKey(event.key);
      if (key !== null) keyActions.current.releaseKey(key);
    };
    const timers = pressTimers.current;
    const releaseAll = () => { for (const name of [...timers.keys()]) keyActions.current.releaseKey(name); };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", releaseAll);
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);
  if (!word) return <p className="muted">Bộ từ chưa đủ từ phù hợp cho Typing race.</p>;
  const noticeTone = notice.startsWith("Đúng") ? "is-success" : notice.startsWith("Chưa") ? "is-error" : notice.startsWith("Hết giờ") ? "is-warning" : "";
  return <div className="game-runner" aria-busy={busy || undefined}>
    <div className="game-hud"><h2>Từ {index + 1}/{words.length}</h2><span>Điểm <strong>{score}/{typingMaximum(words.length)}</strong></span><span>Combo ×{combo}</span></div>
    <div ref={sceneRef} className="typing-scene" role="application" aria-label="Màn chơi Đua gõ từ" tabIndex={0}>
      <div className="typing-clue"><button type="button" className="typing-clue-speak" aria-label={`Nghe ${word.english}`} onClick={() => speak(word.english)}><Volume2 className="game-control-icon" size={18} strokeWidth={2} aria-hidden="true" /></button><div className="typing-clue-copy"><span className="eyebrow">Gợi ý</span><strong>{word.vietnamese}</strong><small>{word.definition} · {target.replace(/\s/g, "").length} chữ cái{target.includes(" ") ? ", dấu cách tự điền" : ""}</small></div></div>
      <div className="typing-timer" role="progressbar" aria-label="Thời gian còn lại" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={Math.round(remaining)}><i key={index} data-testid="typing-timer-fill" className={busy || locked ? "is-paused" : undefined} style={{ "--typing-time-limit": `${maximum}ms`, "--typing-time-left": `${Math.max(0, Math.min(100, remaining / maximum * 100))}%` } as CSSProperties} /></div>
      <div className="typing-word" aria-label="Từ đang gõ" aria-live="polite">{target.split("").map((character, characterIndex) => { const value = typed[characterIndex]; const state = value === undefined ? "" : value === character ? "is-correct" : "is-wrong"; return <span data-testid="typing-character" className={state} key={characterIndex}>{character === " " ? " " : value?.toUpperCase() ?? ""}</span>; })}</div>
      <div className="virtual-keyboard" role="group" aria-label="Bàn phím ảo">{keyboardRows.map((row) => <div className="keyboard-row" key={row}>{row.split("").map((letter) => <button key={letter} {...keyProps(letter)}>{letter}</button>)}</div>)}<div className="keyboard-row keyboard-row--actions">{target.includes("-") ? <button aria-label="Dấu gạch nối" {...keyProps("-")}>-</button> : null}{target.includes("'") ? <button aria-label="Dấu nháy đơn" {...keyProps("'")}>′</button> : null}<button aria-label="Xoá ký tự cuối" {...keyProps("backspace", "is-backspace")}><Delete className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" /></button></div></div>
      {busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}
      <GameFeedback message={notice} tone={noticeTone === "is-success" ? "success" : noticeTone === "is-error" ? "error" : noticeTone === "is-warning" ? "warning" : "info"} />
    </div>
  </div>;
}
