import { useMemo, useRef, useState } from "react";
import type { GameAnswerInput } from "@e4s/contracts";
import { letters, type FinishGame, type GameWord } from "./types.js";

type Entry = { value: string; word: GameWord };
type Direction = "across" | "down";
type Placed = Entry & { row: number; column: number; direction: Direction; number?: number };
type Crossword = { cells: Array<Array<string | null>>; placed: Placed[]; numbers: Record<string, number> };

export function CrosswordGame({ words, onFinish }: { words: GameWord[]; onFinish: FinishGame }) {
  const crossword = useMemo(() => buildCrossword(words.map((word) => ({ value: letters(word.english), word })).filter((entry) => entry.value.length >= 3)), [words]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, "ok" | "bad">>({});
  const [hints, setHints] = useState(0);
  const [checks, setChecks] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const activeCells = useMemo(() => crossword.cells.flatMap((row, rowIndex) => row.flatMap((wanted, columnIndex) => wanted ? [`${rowIndex},${columnIndex}`] : [])), [crossword]);
  if (crossword.placed.length < 3) return <p className="muted">Không đan được lưới từ bộ này — cần ít nhất 3 từ có chữ cái chung.</p>;
  const cellKey = (row: number, column: number) => `${row},${column}`;
  const focusCell = (key: string | undefined) => { if (key) inputRefs.current[key]?.focus(); };
  const moveFocus = (row: number, column: number, key: string) => {
    if (key === "ArrowLeft") focusCell(cellKey(row, column - 1));
    else if (key === "ArrowRight") focusCell(cellKey(row, column + 1));
    else if (key === "ArrowUp") focusCell(cellKey(row - 1, column));
    else if (key === "ArrowDown") focusCell(cellKey(row + 1, column));
  };
  const clue = (direction: Direction) => crossword.placed.filter((entry) => entry.direction === direction).sort((left, right) => (left.number ?? 0) - (right.number ?? 0));
  const readWord = (entry: Placed) => {
    const rowStep = entry.direction === "down" ? 1 : 0;
    const columnStep = entry.direction === "across" ? 1 : 0;
    return entry.value.split("").map((_, index) => values[cellKey(entry.row + rowStep * index, entry.column + columnStep * index)] ?? "").join("");
  };
  const check = async () => {
    if (busy) return;
    const nextStates: Record<string, "ok" | "bad"> = {};
    let correctCells = 0;
    crossword.cells.forEach((row, rowIndex) => row.forEach((wanted, columnIndex) => {
      if (!wanted) return;
      const key = cellKey(rowIndex, columnIndex);
      const correct = values[key]?.toUpperCase() === wanted;
      if (correct) correctCells += 1;
      if (values[key]) nextStates[key] = correct ? "ok" : "bad";
    }));
    setStates(nextStates);
    setChecks((value) => value + 1);
    const correctWords = crossword.placed.filter((entry) => readWord(entry) === entry.value).length;
    if (correctCells !== crossword.cells.flat().filter(Boolean).length) {
      setNotice(`${correctWords}/${crossword.placed.length} từ đúng · ${correctCells} ô đúng.`);
      return;
    }
    const answers: GameAnswerInput[] = crossword.placed.map((entry) => ({ wordId: entry.word.id, answer: entry.word.english, attempts: checks + 1, combo: 1 }));
    setBusy(true);
    await onFinish({ answers, hintsUsed: hints });
  };
  const hint = () => {
    const candidates: Array<[string, string]> = [];
    crossword.cells.forEach((row, rowIndex) => row.forEach((wanted, columnIndex) => {
      if (!wanted) return;
      const key = cellKey(rowIndex, columnIndex);
      if (values[key]?.toUpperCase() !== wanted) candidates.push([key, wanted]);
    }));
    const candidate = candidates[0];
    if (!candidate) return;
    setValues((current) => ({ ...current, [candidate[0]]: candidate[1] }));
    setStates((current) => ({ ...current, [candidate[0]]: "ok" }));
    setHints((value) => value + 1);
  };
  return <div className="game-runner">
    <div className="game-hud"><h2>{crossword.placed.length} từ</h2><span>Gợi ý <strong>{hints}</strong></span><span>Kiểm tra <strong>{checks}</strong></span></div>
    <div className="crossword-scene">
      <div className="crossword-grid" role="grid" aria-label="Lưới ô chữ" style={{ gridTemplateColumns: `repeat(${crossword.cells[0]?.length ?? 1}, minmax(28px, 38px))` }}>
        {crossword.cells.flatMap((row, rowIndex) => row.map((wanted, columnIndex) => {
          const key = cellKey(rowIndex, columnIndex);
          if (!wanted) return <span className="crossword-block" aria-hidden="true" key={key} />;
          return <label className={`crossword-cell ${states[key] ?? ""}`} key={key}>{crossword.numbers[key] ? <small>{crossword.numbers[key]}</small> : null}<input ref={(element) => { inputRefs.current[key] = element; }} aria-label={`Ô chữ hàng ${rowIndex + 1} cột ${columnIndex + 1}`} maxLength={1} value={values[key] ?? ""} disabled={busy} onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); moveFocus(rowIndex, columnIndex, event.key); }
          }} onChange={(event) => {
            const value = event.target.value.replace(/[^a-z]/gi, "").slice(-1).toUpperCase();
            setValues((current) => ({ ...current, [key]: value }));
            setStates((current) => { const next = { ...current }; delete next[key]; return next; });
            if (value) focusCell(activeCells[activeCells.indexOf(key) + 1]);
          }} /></label>;
        }))}
      </div>
      <div className="crossword-actions"><button className="button button--primary" type="button" onClick={() => void check()} disabled={busy}>Kiểm tra</button><button className="button" type="button" onClick={hint} disabled={busy}>Gợi ý 1 chữ</button><span>Mỗi gợi ý trừ 1 điểm.</span></div>
      <div className="crossword-clues">
        <section role="region" aria-label="Gợi ý ngang"><h3>Ngang →</h3><ol>{clue("across").map((entry) => <li key={`${entry.number}-${entry.word.id}`}><b>{entry.number}.</b> {entry.word.vietnamese}{entry.word.definition ? <span className="muted"> · {entry.word.definition}</span> : null} <small>({entry.value.length})</small></li>)}</ol></section>
        <section role="region" aria-label="Gợi ý dọc"><h3>Dọc ↓</h3><ol>{clue("down").map((entry) => <li key={`${entry.number}-${entry.word.id}`}><b>{entry.number}.</b> {entry.word.vietnamese}{entry.word.definition ? <span className="muted"> · {entry.word.definition}</span> : null} <small>({entry.value.length})</small></li>)}</ol></section>
      </div>
      <p className="game-notice" aria-live="polite">{notice}</p>
    </div>
  </div>;
}

function buildCrossword(entries: Entry[]): Crossword {
  const size = 17;
  const grid: Array<Array<string | null>> = Array.from({ length: size }, () => Array<string | null>(size).fill(null));
  const placed: Placed[] = [];
  const canPlace = (value: string, row: number, column: number, direction: Direction) => {
    const rowStep = direction === "down" ? 1 : 0;
    const columnStep = direction === "across" ? 1 : 0;
    if (row < 0 || column < 0 || row + rowStep * (value.length - 1) >= size || column + columnStep * (value.length - 1) >= size) return -1;
    const beforeRow = row - rowStep; const beforeColumn = column - columnStep;
    const afterRow = row + rowStep * value.length; const afterColumn = column + columnStep * value.length;
    if ((beforeRow >= 0 && beforeColumn >= 0 && grid[beforeRow]?.[beforeColumn]) || (afterRow < size && afterColumn < size && grid[afterRow]?.[afterColumn])) return -1;
    let crossingCount = 0;
    for (let index = 0; index < value.length; index += 1) {
      const cellRow = row + rowStep * index; const cellColumn = column + columnStep * index; const existing = grid[cellRow]?.[cellColumn];
      if (existing) { if (existing !== value[index]?.toUpperCase()) return -1; crossingCount += 1; }
      else {
        const before = direction === "across" ? grid[cellRow - 1]?.[cellColumn] : grid[cellRow]?.[cellColumn - 1];
        const after = direction === "across" ? grid[cellRow + 1]?.[cellColumn] : grid[cellRow]?.[cellColumn + 1];
        if (before || after) return -1;
      }
    }
    return crossingCount;
  };
  const put = (entry: Entry, row: number, column: number, direction: Direction) => {
    const rowStep = direction === "down" ? 1 : 0; const columnStep = direction === "across" ? 1 : 0;
    entry.value.toUpperCase().split("").forEach((character, index) => { grid[row + rowStep * index]![column + columnStep * index] = character; });
    placed.push({ ...entry, value: entry.value.toUpperCase(), row, column, direction });
  };
  entries.filter((entry) => entry.value.length >= 3).sort((left, right) => right.value.length - left.value.length).slice(0, 10).forEach((entry, entryIndex) => {
    const value = entry.value.toUpperCase();
    if (!entryIndex) { put({ ...entry, value }, Math.floor(size / 2), Math.floor((size - value.length) / 2), "across"); return; }
    let best: { row: number; column: number; direction: Direction; crossingCount: number } | null = null;
    placed.forEach((current) => {
      const currentRowStep = current.direction === "down" ? 1 : 0; const currentColumnStep = current.direction === "across" ? 1 : 0;
      current.value.split("").forEach((currentCharacter, currentIndex) => value.split("").forEach((character, index) => {
        if (currentCharacter !== character) return;
        const direction: Direction = current.direction === "across" ? "down" : "across";
        const row = current.row + currentRowStep * currentIndex - (direction === "down" ? index : 0);
        const column = current.column + currentColumnStep * currentIndex - (direction === "across" ? index : 0);
        const crossingCount = canPlace(value, row, column, direction);
        if (crossingCount > 0 && (!best || crossingCount > best.crossingCount)) best = { row, column, direction, crossingCount };
      }));
    });
    const chosen = best as { row: number; column: number; direction: Direction; crossingCount: number } | null;
    if (chosen) put({ ...entry, value }, chosen.row, chosen.column, chosen.direction);
  });
  let minRow = size; let maxRow = -1; let minColumn = size; let maxColumn = -1;
  placed.forEach((entry) => {
    const rowStep = entry.direction === "down" ? 1 : 0; const columnStep = entry.direction === "across" ? 1 : 0;
    minRow = Math.min(minRow, entry.row); minColumn = Math.min(minColumn, entry.column);
    maxRow = Math.max(maxRow, entry.row + rowStep * (entry.value.length - 1)); maxColumn = Math.max(maxColumn, entry.column + columnStep * (entry.value.length - 1));
  });
  if (!placed.length) return { cells: [], placed, numbers: {} };
  const cells = grid.slice(minRow, maxRow + 1).map((row) => row.slice(minColumn, maxColumn + 1));
  placed.forEach((entry) => { entry.row -= minRow; entry.column -= minColumn; });
  let number = 0; const numbers: Record<string, number> = {};
  cells.forEach((row, rowIndex) => row.forEach((character, columnIndex) => {
    if (character && placed.some((entry) => entry.row === rowIndex && entry.column === columnIndex)) numbers[`${rowIndex},${columnIndex}`] = ++number;
  }));
  placed.forEach((entry) => { const value = numbers[`${entry.row},${entry.column}`]; if (value !== undefined) entry.number = value; });
  return { cells, placed, numbers };
}
