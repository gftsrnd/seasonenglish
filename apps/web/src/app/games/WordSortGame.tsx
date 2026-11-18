import { useEffect, useMemo, useRef, useState } from "react";
import type { CefrLevel, GameAnswerInput } from "@e4s/contracts";
import { gameWordContextSpan } from "@e4s/domain/engagement";
import { Volume2 } from "lucide-react";
import { gameRoundWords, type FinishGame, type GameWord } from "./types.js";
import { GameHud, useGameClock, useRoundTally } from "./GameHud.js";
import { useExperience } from "../../features/experience/Experience.js";
import { GameFeedback } from "./GameFeedback.js";

const groups = [["noun", "Noun", "Danh từ"], ["verb", "Verb", "Động từ"], ["adjective", "Adjective", "Tính từ"], ["adverb", "Adverb", "Trạng từ"], ["preposition", "Preposition", "Giới từ"], ["phrase", "Phrase", "Cụm từ"]] as const;
function groupFor(partOfSpeech: string) {
  const value = partOfSpeech.toLowerCase();
  if (/phrasal|phrase|idiom|expression/.test(value)) return "phrase";
  return groups.find(([key]) => value.startsWith(key))?.[0] ?? "phrase";
}

/** The context sentence with the game word highlighted; null when the word has no usable sentence. */
export function WordSortContext({ example, word }: { example: string | undefined; word: string }) {
  const span = example ? gameWordContextSpan(example, word) : null;
  if (!example || !span) return null;
  return <p className="sort-context" data-word-context lang="en">{example.slice(0, span.start)}<mark>{example.slice(span.start, span.end)}</mark>{example.slice(span.end)}</p>;
}

function meaningLine(word: GameWord) {
  const vietnamese = word.vietnamese.trim();
  const definition = word.definition.trim();
  return !definition || definition.toLocaleLowerCase("vi") === vietnamese.toLocaleLowerCase("vi") ? vietnamese : `${vietnamese} · ${definition}`;
}

export function WordSortGame({ words: source, onFinish, attemptSeed = 0, cefr }: { words: GameWord[]; onFinish: FinishGame; attemptSeed?: number; cefr?: CefrLevel }) {
  const words = useMemo(() => gameRoundWords("sort", source, attemptSeed), [attemptSeed, source]);
  // Keep the classification surface stable across word sets. A missing part
  // of speech in a generated set must not silently remove the choice from the
  // game; the learner should still see the six canonical categories.
  const availableGroups = groups;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<GameAnswerInput[]>([]);
  const clock = useGameClock();
  const tally = useRoundTally("sort", words, answers);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const completionTimer = useRef<number | null>(null);
  const mounted = useRef(true);
  const { play, speak } = useExperience();
  const word = words[index];

  useEffect(() => {
    mounted.current = true;
    clock.start();
    return () => {
      clock.pause();
      mounted.current = false;
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    };
  }, [clock]);

  if (words.length < 4) return <p className="muted">Cần ít nhất 4 từ có thông tin từ loại để bắt đầu.</p>;
  if (!word) return <p className="muted">Bộ từ chưa có đủ thông tin từ loại.</p>;
  const right = groupFor(word.partOfSpeech);
  // The sentence decides the word class. A1–A2 keep the Vietnamese meaning under it; from B1 the
  // sentence replaces the meaning line (a word without a sentence still shows its meaning).
  const context = <WordSortContext example={word.example} word={word.english} />;
  const hasContext = Boolean(word.example && gameWordContextSpan(word.example, word.english));
  const showMeaning = !hasContext || cefr === undefined || cefr === "A1" || cefr === "A2";
  const pick = async (group: string) => {
    if (selected || busy) return;
    const correct = group === right;
    const nextAnswers: GameAnswerInput[] = [...answers, { wordId: word.id, answer: group, attempts: 1, usedHint: false, ms: clock.lap() }];
    clock.pause();
    setSelected(group);
    setAnswers(nextAnswers);
    setNotice(correct ? `Đúng · ${word.english} = ${right}` : `Chưa đúng · ${word.english} là ${right}.`);
    play(correct ? "success" : "error");
    await new Promise<void>((resolve) => {
      completionTimer.current = window.setTimeout(() => {
        completionTimer.current = null;
        resolve();
      }, correct ? 700 : 1500);
    });
    if (!mounted.current) return;
    if (index >= words.length - 1) { setBusy(true); await onFinish({ answers: nextAnswers }); return; }
    setIndex((value) => value + 1); setSelected(null); setNotice(""); clock.start();
  };
  const noticeTone = notice.startsWith("Đúng") ? "is-success" : notice.startsWith("Chưa") ? "is-error" : "";
  return <div className="game-runner" aria-busy={busy || undefined}>
    <GameHud title={<h2>Từ {index + 1}/{words.length}</h2>} raw={tally.raw} combo={tally.combo} clock={clock} />
    <div className="sort-scene"><span className="eyebrow">Từ này thuộc từ loại nào?</span><div className="sort-word-line"><strong>{word.english}</strong><button type="button" className="sort-speak" aria-label={`Nghe ${word.english}`} onClick={() => speak(word.english)}><Volume2 className="game-control-icon" size={18} strokeWidth={2} aria-hidden="true" /></button></div><div className="sort-clue">{context}{showMeaning ? <span className="sort-meaning">{meaningLine(word)}</span> : null}</div><div className="sort-bins" role="group" aria-label="Nhóm từ loại">{availableGroups.map(([key, label, vietnamese]) => <button type="button" aria-label={label} disabled={!!selected || busy} className={selected && key === right ? "is-correct" : selected === key ? "is-wrong" : ""} key={key} onClick={() => void pick(key)}><b>{label}</b><small>{vietnamese}</small></button>)}</div>{busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}<GameFeedback message={notice} tone={noticeTone === "is-success" ? "success" : noticeTone === "is-error" ? "error" : "info"} /></div>
  </div>;
}
