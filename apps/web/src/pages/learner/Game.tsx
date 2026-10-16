import { useEffect, useRef, useState } from "react";
import type { DuelView, GameDescriptor, GameResultView, GameWordSetView } from "@e4s/contracts";
import { CrosswordGame } from "./games/CrosswordGame.js";
import { ScrambleGame } from "./games/ScrambleGame.js";
import { SeasonCatchGame } from "./games/SeasonCatchGame.js";
import { SeasonRioGame } from "./games/SeasonRioGame.js";
import { TypingRaceGame } from "./games/TypingRaceGame.js";
import { WordSortGame } from "./games/WordSortGame.js";
import { SeasonMark } from "./games/season-art.js";
import type { FinishGame } from "./games/types.js";
import { useExperience } from "../../features/experience/Experience.js";

export function Game({ descriptor, wordSet, onFinish, backHref = "/games", result, duelOutcome, onReplay, onResolveWordImage }: {
  descriptor: GameDescriptor;
  wordSet: GameWordSetView;
  onFinish: FinishGame;
  backHref?: string;
  result?: GameResultView | undefined;
  duelOutcome?: DuelView["outcome"] | undefined;
  onReplay?: (() => void) | undefined;
  onResolveWordImage?: ((setId: string, wordId: string) => Promise<string | null>) | undefined;
}) {
  const [started, setStarted] = useState(Boolean(result));
  const [playKey, setPlayKey] = useState(0);
  const [attemptSeed, setAttemptSeed] = useState(0);
  const [submissionError, setSubmissionError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const pendingFinish = useRef<Parameters<FinishGame>[0] | undefined>(undefined);
  const { play } = useExperience();
  useEffect(() => {
    if (!result) return;
    const record = result.score > 0 && (!descriptor.best || result.score > descriptor.best.score);
    play(record ? "celebrate" : "success");
  }, [descriptor.best, play, result]);
  const submitResult: FinishGame = async (input) => {
    const pending = pendingFinish.current ?? input;
    pendingFinish.current = pending;
    setSubmissionError(false);
    setRetrying(true);
    try {
      await onFinish(pending);
      pendingFinish.current = undefined;
    } catch {
      setSubmissionError(true);
    } finally {
      setRetrying(false);
    }
  };
  return <main className={`learner-page engagement-page game-screen game-screen--${descriptor.key}`}>
    <header className="engagement-title game-heading"><div><h1>{descriptor.icon} {descriptor.name}</h1><p>{wordSet.topic} · {wordSet.words.length} từ</p>{descriptor.best ? <span className="record-pill">Kỷ lục: {descriptor.best.score}/{descriptor.best.maxScore}</span> : <span className="record-pill">Kỷ lục: chưa có</span>}</div><a className="button" href={backHref}>Thoát game</a></header>
    {!started ? <section className="engagement-card game-tutorial"><div className="lively-mark" aria-hidden="true"><SeasonMark /></div><div><span className="eyebrow">Hướng dẫn chơi</span><h2>{descriptor.icon} {descriptor.name} – {descriptor.goal}</h2><ol>{descriptor.instructions.map((item) => <li key={item}>{item}</li>)}</ol><p><strong>Tính điểm:</strong> {descriptor.scoring}</p><p className="muted">Bộ từ: {wordSet.topic} · {wordSet.words.length} từ. Nút <b>Thoát game</b> dừng trò; lượt dở không được tính.</p><div className="form-action-row"><button className="button button--primary" type="button" onClick={() => { setAttemptSeed((seed) => seed + 1); setStarted(true); }}>▶ Bắt đầu chơi</button><a className="button" href={backHref}>← Quay lại</a></div></div></section>
      : <section className="engagement-card game-board"><div key={playKey}>{renderGame(descriptor.key, wordSet, submitResult, attemptSeed, onResolveWordImage)}</div>{submissionError ? <div className="game-submit-error" role="alert"><p>Chưa lưu được kết quả lượt này. Kiểm tra kết nối rồi thử gửi lại.</p><button className="button button--primary" type="button" disabled={retrying} onClick={() => { if (pendingFinish.current) void submitResult(pendingFinish.current); }}>{retrying ? "Đang gửi lại…" : "Thử gửi lại"}</button></div> : null}{result ? <GameOver descriptor={descriptor} wordSet={wordSet} result={result} duelOutcome={duelOutcome} onReplay={() => { pendingFinish.current = undefined; setSubmissionError(false); setAttemptSeed((seed) => seed + 1); setPlayKey((value) => value + 1); onReplay?.(); }} /> : null}</section>}
  </main>;
}

function GameOver({ descriptor, wordSet, result, duelOutcome, onReplay }: {
  descriptor: GameDescriptor; wordSet: GameWordSetView; result: GameResultView;
  duelOutcome?: DuelView["outcome"] | undefined; onReplay: () => void;
}) {
  const record = result.score > 0 && (!descriptor.best || result.score > descriptor.best.score);
  const outcomeText = duelOutcome === "win" ? "Bạn thắng. +50 điểm đấu trường"
    : duelOutcome === "lose" ? "Bạn thua ván này"
      : duelOutcome === "draw" ? "Hoà"
        : duelOutcome === "waiting" ? "Đã ghi kết quả – chờ đối thủ chơi" : "";
  return <article className={`game-over-card ${record ? "is-record" : ""}`} aria-live="polite">
    <div className="lively-mark" aria-hidden="true"><SeasonMark /></div>
    <div><span className="eyebrow">{descriptor.icon} {descriptor.name}</span><h2>GAME OVER</h2>
      <p className="game-over-message">{record ? "Kỷ lục mới!" : descriptor.best ? `Chưa phá được kỷ lục ${descriptor.best.score}/${descriptor.best.maxScore} – thử lại nhé!` : "Hãy thử lại để lập kỷ lục!"}</p>
      <dl className="game-result-table"><div><dt>Điểm</dt><dd>{result.score} / {result.maxScore}</dd></div><div><dt>{gameResultLabel(descriptor.key)}</dt><dd>{result.correct} / {result.total}</dd></div><div><dt>Kỷ lục trước</dt><dd>{descriptor.best ? `${descriptor.best.score} / ${descriptor.best.maxScore}` : "—"}</dd></div><div><dt>Bộ từ</dt><dd>{wordSet.topic}</dd></div>{outcomeText ? <div><dt>Thách đấu</dt><dd>{outcomeText} · <a href="/arena">Xem đấu trường</a></dd></div> : null}</dl>
      <div className="form-action-row">{duelOutcome ? <a className="button button--primary" href="/arena">Về đấu trường</a> : <button className="button button--primary" type="button" onClick={onReplay}>▶ Chơi lại</button>}<a className="button" href="/games">Chọn trò khác</a></div>
    </div>
  </article>;
}

function gameResultLabel(key: GameDescriptor["key"]): string {
  if (key === "scramble") return "Từ đã xếp đúng";
  if (key === "crossword") return "Từ trong lưới đúng";
  if (key === "eggs") return "Vật phẩm hứng đúng";
  if (key === "mario") return "Cổng và món ăn đúng";
  if (key === "sort") return "Từ phân loại đúng";
  return "Từ gõ đúng";
}

function renderGame(
  key: GameDescriptor["key"], wordSet: GameWordSetView, onFinish: FinishGame, attemptSeed: number,
  onResolveWordImage?: (setId: string, wordId: string) => Promise<string | null>
) {
  if (key === "scramble") return <ScrambleGame words={wordSet.words} onFinish={onFinish} attemptSeed={attemptSeed} />;
  if (key === "crossword") return <CrosswordGame words={wordSet.words} onFinish={onFinish} attemptSeed={attemptSeed} />;
  if (key === "eggs") return <SeasonCatchGame words={wordSet.words} cefr={wordSet.cefr} onFinish={onFinish} attemptSeed={attemptSeed} />;
  if (key === "mario") return <SeasonRioGame words={wordSet.words} onFinish={onFinish} attemptSeed={attemptSeed} />;
  if (key === "sort") return <WordSortGame words={wordSet.words} onFinish={onFinish} attemptSeed={attemptSeed} />;
  return <TypingRaceGame words={wordSet.words} onFinish={onFinish} attemptSeed={attemptSeed}
    onResolveImage={onResolveWordImage ? (wordId) => onResolveWordImage(wordSet.id, wordId) : undefined} />;
}
