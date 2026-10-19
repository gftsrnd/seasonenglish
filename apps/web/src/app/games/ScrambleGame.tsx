import { useEffect, useMemo, useRef, useState } from "react";
import type { GameAnswerInput } from "@e4s/contracts";
import { Delete, Lightbulb } from "lucide-react";
import { letters, prepareGameAttempt, seededShuffle, type FinishGame, type GameWord } from "./types.js";
import { useExperience } from "../../features/experience/Experience.js";

export function ScrambleGame({ words: source, onFinish, attemptSeed = 0 }: { words: GameWord[]; onFinish: FinishGame; attemptSeed?: number }) {
  const words = useMemo(() => prepareGameAttempt(source.filter((word) => letters(word.english).length >= 3), attemptSeed).slice(0, 8), [attemptSeed, source]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [wrong, setWrong] = useState(0);
  const [usedHint, setUsedHint] = useState(false);
  const [points, setPoints] = useState(0);
  const [answers, setAnswers] = useState<GameAnswerInput[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState("");
  const { play } = useExperience();
  const timer = useRef<number | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const bankRef = useRef<HTMLDivElement | null>(null);
  const word = words[index];
  const target = word ? letters(word.english) : "";
  const tiles = useMemo(() => {
    if (!target) return [];
    const raw = target.split("").map((character, tileIndex) => ({ character, tileIndex }));
    let shuffled = seededShuffle(raw, attemptSeed ^ index ^ target.length);
    if (target.length > 2 && shuffled.map((tile) => tile.character).join("") === target) {
      shuffled = [...shuffled.slice(1), shuffled[0]!];
    }
    return shuffled.map((tile, tileIndex) => ({ ...tile, tileIndex }));
  }, [attemptSeed, index, target]);
  const assembled = revealed || picked.map((tileIndex) => tiles[tileIndex]?.character ?? "").join("");

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  useEffect(() => {
    sceneRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (locked || busy) return;
    const nextButton = bankRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    if (nextButton) nextButton.focus({ preventScroll: true });
    else sceneRef.current?.focus({ preventScroll: true });
  }, [busy, index, locked, notice, picked]);

  const scheduleNext = (nextAnswers: GameAnswerInput[], delay: number) => {
    setLocked(true);
    setAnswers(nextAnswers);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (index >= words.length - 1) {
        setBusy(true);
        void onFinish({ answers: nextAnswers });
        return;
      }
      setIndex((value) => value + 1);
      setPicked([]);
      setWrong(0);
      setUsedHint(false);
      setRevealed("");
      setNotice("");
      setLocked(false);
    }, delay);
  };

  const completeWord = async (answer: string, hintWasUsed = usedHint) => {
    if (!word || busy || locked) return;
    const correct = answer === target;
    if (!correct && wrong < 1) {
      play("error");
      setWrong(wrong + 1);
      setNotice("Chưa đúng – xếp lại nhé.");
      setLocked(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setPicked([]);
        setNotice("");
        setLocked(false);
      }, 450);
      return;
    }
    const nextAnswer: GameAnswerInput = { wordId: word.id, answer: correct ? word.english : answer, attempts: wrong + 1, usedHint: hintWasUsed, combo: 1 };
    const nextAnswers = [...answers, nextAnswer];
    const earned = hintWasUsed || wrong ? 1 : 2;
    play(correct ? "success" : "error");
    if (correct) setPoints((value) => value + earned);
    if (!correct) setWrong((value) => value + 1);
    setRevealed(target);
    setNotice(correct ? `✅ ${word.english} +${earned}` : `❌ Từ đúng: ${word.english}`);
    scheduleNext(nextAnswers, correct ? 1_200 : 1_800);
  };

  const pick = (tileIndex: number, hintWasUsed = usedHint) => {
    if (busy || locked || picked.includes(tileIndex)) return;
    const next = [...picked, tileIndex];
    setPicked(next);
    if (next.length === target.length) void completeWord(next.map((item) => tiles[item]?.character ?? "").join(""), hintWasUsed);
  };
  const backspace = () => { if (!busy && !locked) setPicked((value) => value.slice(0, -1)); };
  const hint = () => {
    if (busy || locked) return;
    const nextCharacter = target[picked.length];
    const tileIndex = tiles.findIndex((tile, tileIndex) => tile.character === nextCharacter && !picked.includes(tileIndex));
    if (tileIndex >= 0) {
      setUsedHint(true);
      pick(tileIndex, true);
    }
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const scene = sceneRef.current;
      const active = document.activeElement;
      const insideLetterBank = active instanceof HTMLElement && Boolean(active.closest(".letter-bank"));
      if (!scene || !scene.contains(active) || (active !== scene && !insideLetterBank) || busy || locked) return;
      if (event.key === "Backspace") { event.preventDefault(); backspace(); return; }
      if (!/^[a-z]$/i.test(event.key)) return;
      const tileIndex = tiles.findIndex((tile, tileIndex) => tile.character === event.key.toLowerCase() && !picked.includes(tileIndex));
      if (tileIndex >= 0) pick(tileIndex);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  if (!word) return <p className="muted">Bộ từ chưa đủ từ phù hợp cho Word scramble.</p>;
  const noticeTone = notice.startsWith("✅") ? "is-success" : notice.startsWith("❌") || notice.startsWith("Chưa") ? "is-error" : "";
  return <div className="game-runner" aria-busy={busy || undefined}>
    <div className="game-hud"><h2>Từ {index + 1}/{words.length}</h2><span>Điểm <strong>{points}</strong></span><span className={wrong ? "is-danger" : ""}>Sai {wrong}/2</span></div>
    <div ref={sceneRef} className={`scramble-scene ${notice.startsWith("Chưa") ? "is-shaking" : ""}`} tabIndex={0}>
      <p><span className="eyebrow">Gợi ý</span><strong>{word.vietnamese}</strong><small>{word.definition} · {target.length} chữ cái</small></p>
      <div className="answer-slots" aria-label="Từ đang xếp">{target.split("").map((_, slot) => <span key={slot}>{assembled[slot]?.toUpperCase() ?? ""}</span>)}</div>
      <div ref={bankRef} className="letter-bank" role="group" aria-label="Chữ cái bị xáo trộn">{tiles.map((tile, tileIndex) => <button type="button" aria-label={`Chữ ${tile.character} vị trí ${tileIndex + 1}`} className={picked.includes(tileIndex) ? "is-used" : ""} disabled={busy || locked || picked.includes(tileIndex)} key={`${tile.character}-${tileIndex}`} onClick={() => pick(tileIndex)}>{tile.character}</button>)}</div>
      <div className="mini-actions"><button type="button" disabled={busy || locked} onClick={backspace}><Delete className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />Bỏ chữ cuối</button><button type="button" disabled={busy || locked} onClick={hint}><Lightbulb className="game-control-icon" size={16} strokeWidth={2} aria-hidden="true" />Gợi ý</button></div>
       {busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}
       <p className={`game-notice ${noticeTone}`} aria-live="polite">{notice}</p>
    </div>
  </div>;
}
