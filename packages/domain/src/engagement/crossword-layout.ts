/**
 * Deterministic crossword layout, shared by the web game and the server so the
 * server knows which words were really placed in the grid (the round's N) without
 * trusting the client.
 */
export type CrosswordDirection = "across" | "down";
export interface CrosswordEntry<Word> { value: string; word: Word }
export type CrosswordPlaced<Word> = CrosswordEntry<Word> & { row: number; column: number; direction: CrosswordDirection; number?: number };
export interface CrosswordLayout<Word> { cells: Array<Array<string | null>>; placed: Array<CrosswordPlaced<Word>>; numbers: Record<string, number> }

/** Letters a crossword cell row is built from ("Ice-cream" → "icecream"). */
export function crosswordLetters(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ").replace(/[^a-z]/g, "");
}

/** Lays out the words (in the given order) on a grid; at most 10 words of 3+ letters, longest first. */
export function buildCrosswordLayout<Word extends { english: string }>(words: readonly Word[]): CrosswordLayout<Word> {
  const entries = words.map((word) => ({ value: crosswordLetters(word.english), word })).filter((entry) => entry.value.length >= 3);
  const size = 17;
  const grid: Array<Array<string | null>> = Array.from({ length: size }, () => Array<string | null>(size).fill(null));
  const placed: Array<CrosswordPlaced<Word>> = [];
  const canPlace = (value: string, row: number, column: number, direction: CrosswordDirection) => {
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
  const put = (entry: CrosswordEntry<Word>, row: number, column: number, direction: CrosswordDirection) => {
    const rowStep = direction === "down" ? 1 : 0; const columnStep = direction === "across" ? 1 : 0;
    entry.value.toUpperCase().split("").forEach((character, index) => { grid[row + rowStep * index]![column + columnStep * index] = character; });
    placed.push({ ...entry, value: entry.value.toUpperCase(), row, column, direction });
  };
  [...entries].sort((left, right) => right.value.length - left.value.length).slice(0, 10).forEach((entry, entryIndex) => {
    const value = entry.value.toUpperCase();
    if (!entryIndex) { put({ ...entry, value }, Math.floor(size / 2), Math.floor((size - value.length) / 2), "across"); return; }
    let best: { row: number; column: number; direction: CrosswordDirection; crossingCount: number } | null = null;
    placed.forEach((current) => {
      const currentRowStep = current.direction === "down" ? 1 : 0; const currentColumnStep = current.direction === "across" ? 1 : 0;
      current.value.split("").forEach((currentCharacter, currentIndex) => value.split("").forEach((character, index) => {
        if (currentCharacter !== character) return;
        const direction: CrosswordDirection = current.direction === "across" ? "down" : "across";
        const row = current.row + currentRowStep * currentIndex - (direction === "down" ? index : 0);
        const column = current.column + currentColumnStep * currentIndex - (direction === "across" ? index : 0);
        const crossingCount = canPlace(value, row, column, direction);
        if (crossingCount > 0 && (!best || crossingCount > best.crossingCount)) best = { row, column, direction, crossingCount };
      }));
    });
    const chosen = best as { row: number; column: number; direction: CrosswordDirection; crossingCount: number } | null;
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
