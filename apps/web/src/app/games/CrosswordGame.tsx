import { useMemo, useRef, useState } from "react";
import type { GameAnswerInput } from "@e4s/contracts";
import { ArrowDown, ArrowRight } from "lucide-react";
import { letters, prepareGameAttempt, type FinishGame, type GameWord } from "./types.js";
import { useExperience } from "../../features/experience/Experience.js";

type Entry = { value: string; word: GameWord };
type Direction = "across" | "down";
type Placed = Entry & { row: number; column: number; direction: Direction; number?: number };
type Crossword = { cells: Array<Array<string | null>>; placed: Placed[]; numbers: Record<string, number> };

export function CrosswordGame({ words, onFinish, attemptSeed = 0 }: { words: GameWord[]; onFinish: FinishGame; attemptSeed?: number }) {
  const crossword = useMemo(() => buildCrossword(prepareGameAttempt(words, attemptSeed).map((word) => ({ value: letters(word.english), word })).filter((entry) => entry.value.length >= 3)), [attemptSeed, words]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, "ok" | "bad">>({});
  const [hints, setHints] = useState(0);
  const [checks, setChecks] = useState(0);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"info" | "success" | "error">("info");
  const [busy, setBusy] = useState(false);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>("across");
  const { play } = useExperience();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  if (crossword.placed.length < 3) return <p className="muted">Không đan được lưới từ bộ này — cần ít nhất 3 từ có chữ cái chung.</p>;
  const cellKey = (row: number, column: number) => `${row},${column}`;
  const focusCell = (key: string | undefined) => {
    if (!key) return;
    const input = inputRefs.current[key];
    if (!input) return;
    input.focus({ preventScroll: true });
    const grid = input.closest<HTMLElement>(".crossword-grid");
    if (!grid) return;
    const gridBox = grid.getBoundingClientRect();
    const inputBox = input.getBoundingClientRect();
    if (inputBox.left < gridBox.left) grid.scrollLeft -= gridBox.left - inputBox.left + 8;
    if (inputBox.right > gridBox.right) grid.scrollLeft += inputBox.right - gridBox.right + 8;
  };
  const moveFocus = (row: number, column: number, key: string) => {
    const nextRow = row + (key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0);
    const nextColumn = column + (key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0);
    if (nextRow < 0 || nextColumn < 0 || !crossword.cells[nextRow]?.[nextColumn]) return;
    const next = cellKey(nextRow, nextColumn);
    setActiveCell(next);
    focusCell(next);
  };
  const clue = (direction: Direction) => crossword.placed.filter((entry) => entry.direction === direction).sort((left, right) => (left.number ?? 0) - (right.number ?? 0));
  const entriesAt = (key: string) => crossword.placed.filter((entry) => {
    const [row, column] = key.split(",").map(Number);
    const rowStep = entry.direction === "down" ? 1 : 0;
    const columnStep = entry.direction === "across" ? 1 : 0;
    return entry.value.split("").some((_, index) => entry.row + rowStep * index === row && entry.column + columnStep * index === column);
  });
  const activeEntry = activeCell ? entriesAt(activeCell).find((entry) => entry.direction === direction) ?? entriesAt(activeCell)[0] : undefined;
  const activeEntryCells = activeEntry ? activeEntry.value.split("").map((_, index) => cellKey(activeEntry.row + (activeEntry.direction === "down" ? index : 0), activeEntry.column + (activeEntry.direction === "across" ? index : 0))) : [];
  const toggleDirection = (key: string) => {
    const entries = entriesAt(key);
    if (entries.some((entry) => entry.direction !== direction)) setDirection((value) => value === "across" ? "down" : "across");
  };
  const moveAlongActiveEntry = (key: string) => {
    const entry = entriesAt(key).find((candidate) => candidate.direction === direction) ?? entriesAt(key)[0];
    if (!entry) return;
    const cells = entry.value.split("").map((_, index) => cellKey(entry.row + (entry.direction === "down" ? index : 0), entry.column + (entry.direction === "across" ? index : 0)));
    const next = cells[cells.indexOf(key) + 1];
    if (next) { setActiveCell(next); focusCell(next); }
  };
  const clearCell = (key: string) => {
    setValues((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setStates((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const previousInActiveEntry = (key: string) => {
    const entry = entriesAt(key).find((candidate) => candidate.direction === direction) ?? entriesAt(key)[0];
    if (!entry) return undefined;
    const cells = entry.value.split("").map((_, index) => cellKey(entry.row + (entry.direction === "down" ? index : 0), entry.column + (entry.direction === "across" ? index : 0)));
    const previousIndex = cells.indexOf(key) - 1;
    return previousIndex >= 0 ? cells[previousIndex] : undefined;
  };
  const handleBackspace = (key: string) => {
    if (values[key]) {
      clearCell(key);
      return;
    }
    const previous = previousInActiveEntry(key);
    if (!previous) return;
    clearCell(previous);
    setActiveCell(previous);
    focusCell(previous);
  };
  const writeLetter = (key: string, letter: string) => {
    setValues((current) => ({ ...current, [key]: letter.toUpperCase() }));
    setStates((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    moveAlongActiveEntry(key);
  };
  const cellClueIds = (row: number, column: number) => crossword.placed
    .filter((entry) => {
      const rowStep = entry.direction === "down" ? 1 : 0;
      const columnStep = entry.direction === "across" ? 1 : 0;
      return entry.value.split("").some((_, index) => entry.row + rowStep * index === row && entry.column + columnStep * index === column);
    })
    .map((entry) => `crossword-clue-${entry.direction}-${entry.number}`)
    .join(" ");
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
      play("error");
      setNoticeTone("error");
      setNotice(`${correctWords}/${crossword.placed.length} từ đúng · ${correctCells} ô đúng.`);
      return;
    }
    play("success");
    setNoticeTone("success");
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
  return <div className="game-runner" aria-busy={busy || undefined}>
    <div className="game-hud"><h2>{crossword.placed.length} từ</h2><span>Gợi ý <strong>{hints}</strong></span><span>Kiểm tra <strong>{checks}</strong></span></div>
    <div className="crossword-scene">
      <p className="crossword-scroll-hint" role="note">Màn nhỏ: vuốt ngang để xem hết lưới.</p>
      <div className="crossword-mode" role="status" aria-live="polite"><span>Đang đi <b>{direction === "across" ? "Ngang" : "Dọc"}</b></span><span>Ô hiện tại <b>{activeEntry?.number ?? "—"}</b></span><button type="button" className="btn-sm" onClick={() => activeCell && toggleDirection(activeCell)} disabled={!activeCell || entriesAt(activeCell).length < 2}>Đổi hướng</button></div>
      <div className="crossword-grid" role="grid" aria-label="Lưới ô chữ" aria-readonly="false" aria-rowcount={crossword.cells.length} aria-colcount={crossword.cells[0]?.length ?? 0} style={{ gridTemplateColumns: `repeat(${crossword.cells[0]?.length ?? 1}, minmax(28px, 38px))` }}>
        {crossword.cells.map((row, rowIndex) => <div role="row" aria-label={`Hàng ${rowIndex + 1}`} aria-rowindex={rowIndex + 1} key={`row-${rowIndex}`}>
          {row.map((wanted, columnIndex) => {
          const key = cellKey(rowIndex, columnIndex);
          if (!wanted) return <span className="crossword-block" aria-hidden="true" key={key} />;
          return <label role="gridcell" aria-label={`Ô chữ hàng ${rowIndex + 1} cột ${columnIndex + 1}`} aria-colindex={columnIndex + 1} aria-current={activeCell === key ? "true" : undefined} className={`crossword-cell ${states[key] ?? ""} ${activeEntryCells.includes(key) ? "is-active-entry" : ""} ${activeCell === key ? "is-active" : ""}`} key={key} onClick={() => {
            if (activeCell === key) toggleDirection(key);
            setActiveCell(key);
          }}>{crossword.numbers[key] ? <small>{crossword.numbers[key]}</small> : null}<input ref={(element) => { inputRefs.current[key] = element; }} aria-label={`Ô chữ hàng ${rowIndex + 1} cột ${columnIndex + 1}`} aria-describedby={cellClueIds(rowIndex, columnIndex) || undefined} maxLength={1} value={values[key] ?? ""} disabled={busy} onFocus={() => setActiveCell(key)} onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              moveFocus(rowIndex, columnIndex, event.key);
              return;
            }
            if (event.key === "Backspace") {
              event.preventDefault();
              event.stopPropagation();
              handleBackspace(key);
              return;
            }
            if (event.key === "Delete") {
              event.preventDefault();
              event.stopPropagation();
              clearCell(key);
              return;
            }
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key.length === 1 && /^[a-z]$/i.test(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              if (!event.repeat) writeLetter(key, event.key);
            }
          }} onChange={(event) => {
            const value = event.target.value.replace(/[^a-z]/gi, "").slice(-1);
            if (value) writeLetter(key, value);
            else clearCell(key);
          }} /></label>;
          })}
        </div>)}
      </div>
      <div className="crossword-actions"><button className="btn-primary" type="button" onClick={() => void check()} disabled={busy}>Kiểm tra</button><button className="btn-sm" type="button" onClick={hint} disabled={busy}>Gợi ý 1 chữ</button><span>Mỗi gợi ý trừ 1 điểm.</span></div>
      <div className="crossword-clues">
        <section className={activeEntry?.direction === "across" ? "is-active" : ""} role="region" aria-label="Gợi ý ngang"><h3>Ngang <ArrowRight className="game-control-icon" size={12} strokeWidth={2} aria-hidden="true" /></h3><ol>{clue("across").map((entry) => <li className={activeEntry?.word.id === entry.word.id ? "is-active" : ""} id={`crossword-clue-across-${entry.number}`} key={`${entry.number}-${entry.word.id}`}><b>{entry.number}.</b> {entry.word.vietnamese}{entry.word.definition ? <span className="muted"> · {entry.word.definition}</span> : null} <small>({entry.value.length})</small></li>)}</ol></section>
        <section className={activeEntry?.direction === "down" ? "is-active" : ""} role="region" aria-label="Gợi ý dọc"><h3>Dọc <ArrowDown className="game-control-icon" size={12} strokeWidth={2} aria-hidden="true" /></h3><ol>{clue("down").map((entry) => <li className={activeEntry?.word.id === entry.word.id ? "is-active" : ""} id={`crossword-clue-down-${entry.number}`} key={`${entry.number}-${entry.word.id}`}><b>{entry.number}.</b> {entry.word.vietnamese}{entry.word.definition ? <span className="muted"> · {entry.word.definition}</span> : null} <small>({entry.value.length})</small></li>)}</ol></section>
      </div>
      {busy ? <span className="game-loading" role="status">Đang lưu kết quả…</span> : null}
      <p className={`game-notice ${noticeTone === "success" ? "is-success" : noticeTone === "error" ? "is-error" : ""}`} aria-live="polite">{notice}</p>
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
