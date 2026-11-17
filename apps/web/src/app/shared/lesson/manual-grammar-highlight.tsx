import { Fragment } from "react";
import { conciseGrammarExample } from "./presentation.js";
import "./study-highlight.css";

export type GrammarHighlightColor = "blue" | "purple";
export type GrammarHighlightRange = { start: number; end: number; color: GrammarHighlightColor };
type StoredHighlight = { text: string; ranges: GrammarHighlightRange[] };

export function grammarHighlightEntry(value: unknown, point: number, index: number, example: string): StoredHighlight | undefined {
  if (!Array.isArray(value) || !Array.isArray(value[point])) return undefined;
  const entry = value[point][index] as Partial<StoredHighlight> | null | undefined;
  const text = conciseGrammarExample(example);
  if (entry?.text !== text || !Array.isArray(entry.ranges)) return undefined;
  const ranges = entry.ranges.filter(range => range && Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end)
    && range.start >= 0 && range.end > range.start && range.end <= text.length
    && (range.color === "blue" || range.color === "purple")).sort((a, b) => a.start - b.start);
  return { text, ranges };
}

export function applyGrammarHighlight(ranges: readonly GrammarHighlightRange[], start: number, end: number, color: GrammarHighlightColor | "erase"): GrammarHighlightRange[] {
  const next = ranges.flatMap(range => {
    if (range.end <= start || range.start >= end) return [range];
    const remainder = [];
    if (range.start < start) remainder.push({ ...range, end: start });
    if (range.end > end) remainder.push({ ...range, start: end });
    return remainder;
  });
  if (color !== "erase") next.push({ start, end, color });
  return next.sort((a, b) => a.start - b.start);
}

export function ManualGrammarHighlight({ text, ranges, offset = 0 }: { text: string; ranges: readonly GrammarHighlightRange[]; offset?: number }) {
  let cursor = 0;
  return <>{ranges.map((range, index) => {
    const start = Math.max(cursor, range.start - offset);
    const end = Math.min(text.length, range.end - offset);
    if (start >= end) return null;
    const plain = text.slice(cursor, start);
    cursor = end;
    return <Fragment key={index}>{plain}<strong data-grammar-highlight={range.color}>{text.slice(start, end)}</strong></Fragment>;
  })}{text.slice(cursor)}</>;
}
