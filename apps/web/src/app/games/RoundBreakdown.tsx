import type { GameFinishInput, GameKey } from "@e4s/contracts";
import { scoreGameRound, type RoundUnitOutcome } from "@e4s/domain/engagement";
import type { GameWord } from "./types.js";
import "./round-breakdown.css";

/** The one scoring rule of the six games, in ratios so it holds for every round length. */
export const GAME_SCORING_RULE = "Đúng ngay: được 1 phần điểm. Từ câu thứ 3 đúng liên tiếp: mỗi câu được gấp rưỡi. Dùng gợi ý hoặc thử lại: được nửa phần. Sai: 0 và mất chuỗi. Đúng hết, không đứt chuỗi = 100.";

type Cell = "first" | "combo" | "assisted" | "wrong";

/** Per-question outcomes of a finished round, scored with the same rule as the server. */
export function roundOutcomes(game: GameKey, words: readonly GameWord[], input: GameFinishInput, options: { attemptSeed?: number; unitIds?: readonly string[] } = {}): RoundUnitOutcome[] {
  const units = options.unitIds ? options.unitIds.map((id) => words.find((word) => word.id === id)).filter((word): word is GameWord => Boolean(word)) : undefined;
  return scoreGameRound(game, words, input.answers, { attemptSeed: options.attemptSeed ?? 0, events: input.events, ...(units?.length ? { units } : {}) }).outcomes;
}

function cells(outcomes: readonly RoundUnitOutcome[]): Cell[] {
  let streak = 0;
  return outcomes.map((outcome) => {
    if (outcome === "first_try") { streak += 1; return streak >= 3 ? "combo" : "first"; }
    streak = 0;
    return outcome === "assisted" ? "assisted" : "wrong";
  });
}

const CELL_LABEL: Record<Cell, string> = { first: "Đúng ngay", combo: "Đúng trong chuỗi (gấp rưỡi)", assisted: "Có gợi ý / thử lại (nửa phần)", wrong: "Sai (0)" };

/** "Mất điểm vì: câu 6 sai, câu 9 có gợi ý." – positions while short, counts when many. */
export function lostPointsLine(outcomes: readonly RoundUnitOutcome[]): string {
  const marks = cells(outcomes);
  const wrong = marks.flatMap((cell, index) => cell === "wrong" ? [index + 1] : []);
  const assisted = marks.flatMap((cell, index) => cell === "assisted" ? [index + 1] : []);
  if (!wrong.length && !assisted.length) return "Đúng hết, không đứt chuỗi.";
  const list = (numbers: number[], word: string) => numbers.length <= 3 ? `câu ${numbers.join(", ")} ${word}` : `${numbers.length} câu ${word}`;
  const parts = [wrong.length ? list(wrong, "sai") : "", assisted.length ? list(assisted, "có gợi ý") : ""].filter(Boolean);
  return `Mất điểm vì: ${parts.join("; ")}. Sau mỗi câu đó, chuỗi bắt đầu lại.`;
}

/** Result card strip: one coloured box per question, a small legend and the "Mất điểm vì" line. */
export function RoundBreakdown({ outcomes }: { outcomes: readonly RoundUnitOutcome[] }) {
  if (!outcomes.length) return null;
  const marks = cells(outcomes);
  const used = (["first", "combo", "assisted", "wrong"] as Cell[]).filter((cell) => marks.includes(cell));
  return <div className="round-breakdown">
    <ol className="round-breakdown__strip" aria-label="Kết quả từng câu">
      {marks.map((cell, index) => <li key={index} className={`round-breakdown__cell is-${cell}`} title={`Câu ${index + 1}: ${CELL_LABEL[cell]}`} aria-label={`Câu ${index + 1}: ${CELL_LABEL[cell]}`}>{index + 1}</li>)}
    </ol>
    <p className="round-breakdown__legend">{used.map((cell) => <span key={cell}><i className={`round-breakdown__dot is-${cell}`} aria-hidden="true" />{CELL_LABEL[cell]}</span>)}</p>
    <p className="round-breakdown__why">{lostPointsLine(outcomes)}</p>
  </div>;
}
