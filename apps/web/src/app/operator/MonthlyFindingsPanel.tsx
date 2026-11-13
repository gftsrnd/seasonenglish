import { useId, useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import type { MonthlyFindingLine } from "./monthly-failure-findings.js";
import { Badge } from "./primitives.js";

/** "2 lỗi nặng · 3 cảnh báo" — the one-line count shown while the list is collapsed. */
export function monthlyFindingCount(lines: readonly MonthlyFindingLine[]): string {
  const severe = lines.filter((line) => line.severity === "severe").length;
  const light = lines.length - severe;
  return [severe ? `${severe} lỗi nặng` : "", light ? `${light} cảnh báo` : ""].filter(Boolean).join(" · ") || "Không có mục nào";
}

/** Shared toggle label for both findings controls. */
function toggleLabel(open: boolean): string {
  return open ? "Thu gọn danh sách cảnh báo" : "Mở danh sách cảnh báo";
}

function SeverityChip({ line }: { line: MonthlyFindingLine }) {
  return <Badge tone={line.severity === "severe" ? "danger" : "warn"}>{line.severity === "severe" ? "Nặng" : "Nhẹ"}</Badge>;
}

/**
 * Day page: quality findings that stay in view while the Operator scrolls the
 * lesson. One row (title, status chip, count, chevron), then one line per
 * problem: WHERE it is and WHAT to fix. With `onEditLine`, each line ends with a
 * small "Sửa" that opens the manual editor on that exact item.
 */
export function MonthlyFindingsPanel({ label, title, badge, lines, onEditLine, testId, className = "" }: {
  label: string;
  title: string;
  badge?: { tone: "danger" | "warn"; text: string } | undefined;
  lines: readonly MonthlyFindingLine[];
  onEditLine?: ((line: MonthlyFindingLine) => void) | undefined;
  testId?: string | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return <section className={`card operator-monthly-findings ${className}`.trim()} aria-label={label} data-testid={testId}>
    <button type="button" className="operator-monthly-findings-head" aria-expanded={open} aria-controls={bodyId} aria-label={toggleLabel(open)} title={toggleLabel(open)} onClick={() => setOpen((value) => !value)}>
      <span className="operator-monthly-findings-title">{title}</span>
      {badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : null}
      <span className="small muted operator-monthly-findings-count">{monthlyFindingCount(lines)}</span>
      <ChevronDown className="operator-monthly-findings-chevron" size={18} aria-hidden="true" focusable="false" />
    </button>
    <div className="operator-monthly-findings-body" id={bodyId} hidden={!open}>
      <ul className="small operator-monthly-findings-list">{lines.map((line) => <li key={line.key}>
        <SeverityChip line={line} /> <span className="operator-monthly-finding-text"><strong>{line.where}</strong>: {line.what}</span>
        {onEditLine ? <button type="button" className="link-button operator-monthly-finding-edit" aria-label={`Sửa tay: ${line.where}`} title="Mở trình sửa tay tại mục này" onClick={() => onEditLine(line)}><Pencil size={13} aria-hidden="true" />Sửa</button> : null}
      </li>)}</ul>
    </div>
  </section>;
}

/**
 * Manual editor: a compact strip under the header. One line — the count and the
 * first problem (a link to its field) — with a chevron that lists the rest.
 */
export function EditorFindingsStrip({ lines, onSelect }: { lines: readonly MonthlyFindingLine[]; onSelect(line: MonthlyFindingLine): void }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const first = lines[0];
  if (!first) return null;
  const severe = lines.some((line) => line.severity === "severe");
  return <section className={`operator-editor-findings${severe ? " is-severe" : ""}`} aria-label="Các mục cần sửa">
    <div className="operator-editor-findings-row">
      <span className="operator-editor-findings-count">{monthlyFindingCount(lines)}</span>
      {!open ? <button type="button" className="link-button operator-editor-finding-link operator-editor-findings-first" onClick={() => onSelect(first)}><strong>{first.where}</strong>: {first.what}</button> : <span className="operator-editor-findings-first" />}
      {lines.length > 1 ? <button type="button" className="operator-editor-findings-toggle" aria-expanded={open} aria-controls={listId} aria-label={toggleLabel(open)} title={toggleLabel(open)} onClick={() => setOpen((value) => !value)}><ChevronDown className="operator-editor-findings-chevron" size={18} aria-hidden="true" focusable="false" /></button> : null}
    </div>
    {lines.length > 1 ? <ul className="small operator-editor-findings-list" id={listId} hidden={!open}>{lines.map((line) => <li key={line.key}>
      <SeverityChip line={line} /> <button type="button" className="link-button operator-editor-finding-link" onClick={() => onSelect(line)}><strong>{line.where}</strong>: {line.what}</button>
    </li>)}</ul> : null}
  </section>;
}
