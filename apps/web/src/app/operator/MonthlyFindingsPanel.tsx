import { useState, type ReactNode } from "react";
import type { MonthlyFindingLine } from "./monthly-failure-findings.js";
import { Badge } from "./primitives.js";

/** "2 lỗi nặng · 3 cảnh báo" — the one-line count shown while the list is collapsed. */
export function monthlyFindingCount(lines: readonly MonthlyFindingLine[]): string {
  const severe = lines.filter((line) => line.severity === "severe").length;
  const light = lines.length - severe;
  return [severe ? `${severe} lỗi nặng` : "", light ? `${light} cảnh báo` : ""].filter(Boolean).join(" · ") || "Không có mục nào";
}

/**
 * Quality findings that stay in view while the Operator scrolls the lesson (day
 * page) or the manual editor: a sticky, collapsible card with severity chips
 * (Nặng/Nhẹ), WHERE each problem is and WHAT to fix. With `onSelect`, each line
 * is a button that jumps to the matching section.
 */
export function MonthlyFindingsPanel({ label, title, badge, lines, children, onSelect, testId, className = "" }: {
  label: string;
  title: string;
  badge?: { tone: "danger" | "warn"; text: string } | undefined;
  lines: readonly MonthlyFindingLine[];
  children?: ReactNode;
  onSelect?: ((line: MonthlyFindingLine) => void) | undefined;
  testId?: string | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  return <section className={`card operator-monthly-findings ${className}`.trim()} aria-label={label} data-testid={testId}>
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><span className="operator-monthly-findings-title">{title}</span>{badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : null}<span className="small muted operator-monthly-findings-count">{monthlyFindingCount(lines)} · {open ? "Bấm để thu gọn" : "Bấm để xem"}</span></summary>
      <div className="operator-monthly-findings-body">
        {children}
        <div className="operator-level-validation"><ul className="small">{lines.map((line) => <li key={line.key}><Badge tone={line.severity === "severe" ? "danger" : "warn"}>{line.severity === "severe" ? "Nặng" : "Nhẹ"}</Badge> {onSelect
          ? <button type="button" className="link-button operator-monthly-finding-link" onClick={() => onSelect(line)}>{line.where}</button>
          : <strong>{line.where}</strong>}: {line.what}</li>)}</ul></div>
      </div>
    </details>
  </section>;
}
