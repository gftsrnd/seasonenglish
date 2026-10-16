import { useMemo, useState } from "react";
import type { GameAnswerInput } from "@e4s/contracts";
import { prepareGameAttempt, type FinishGame, type GameWord } from "./types.js";
import { useExperience } from "../../../features/experience/Experience.js";

const groups = [["noun", "Noun", "Danh từ"], ["verb", "Verb", "Động từ"], ["adjective", "Adjective", "Tính từ"], ["adverb", "Adverb", "Trạng từ"], ["preposition", "Preposition", "Giới từ"], ["phrase", "Phrase", "Cụm từ"]] as const;
function groupFor(partOfSpeech: string) {
  const value = partOfSpeech.toLowerCase();
  if (/phrasal|phrase|idiom|expression/.test(value)) return "phrase";
  return groups.find(([key]) => value.startsWith(key))?.[0] ?? "phrase";
}

export function WordSortGame({ words: source, onFinish, attemptSeed = 0 }: { words: GameWord[]; onFinish: FinishGame; attemptSeed?: number }) {
  const words = useMemo(() => prepareGameAttempt(source.filter((word) => word.partOfSpeech), attemptSeed).slice(0, 12), [attemptSeed, source]);
  const availableGroups = useMemo(() => groups.filter(([key]) => ["noun", "verb", "adjective"].includes(key) || words.some((word) => groupFor(word.partOfSpeech) === key)), [words]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [answers, setAnswers] = useState<GameAnswerInput[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const { play, speak } = useExperience();
  const word = words[index];
  if (!word) return <p className="muted">Bộ từ chưa có đủ thông tin từ loại.</p>;
  const right = groupFor(word.partOfSpeech);
  const pick = async (group: string) => {
    if (selected || busy) return;
    const correct = group === right;
    const nextStreak = correct ? streak + 1 : 0;
    const nextAnswers = [...answers, { wordId: word.id, answer: group, attempts: 1, usedHint: false, combo: Math.max(1, nextStreak) }];
    setSelected(group);
    setNotice(correct ? `✅ ${word.english} = ${right}` : `❌ ${word.english} là ${right}.`);
    play(correct ? "success" : "error");
    if (correct) { setScore((value) => value + 1); setBest(Math.max(best, nextStreak)); }
    setStreak(nextStreak);
    await new Promise((resolve) => window.setTimeout(resolve, correct ? 700 : 1500));
    if (index >= words.length - 1) { setBusy(true); await onFinish({ answers: nextAnswers }); return; }
    setAnswers(nextAnswers); setIndex((value) => value + 1); setSelected(null); setNotice("");
  };
  return <div className="game-runner">
    <div className="game-hud"><h2>Từ {index + 1}/{words.length}</h2><span>Điểm <strong>{score}</strong></span><span>Chuỗi <strong>{streak}</strong></span></div>
    <div className="sort-scene"><span className="eyebrow">Từ này thuộc từ loại nào?</span><div className="sort-word-line"><strong>{word.english}</strong><button type="button" className="sort-speak" aria-label={`Nghe ${word.english}`} onClick={() => speak(word.english)}>🔊</button></div><span>{word.vietnamese} · {word.definition}</span><div className="sort-bins" style={{ display: "grid" }} role="group" aria-label="Nhóm từ loại">{availableGroups.map(([key, label, vietnamese]) => <button type="button" aria-label={label} disabled={!!selected || busy} className={selected && key === right ? "is-correct" : selected === key ? "is-wrong" : ""} key={key} onClick={() => void pick(key)}><b>{label}</b><small>{vietnamese}</small></button>)}</div><p className="game-notice" aria-live="polite">{notice}</p></div>
  </div>;
}
