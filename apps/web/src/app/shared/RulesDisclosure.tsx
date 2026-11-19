import type { ReactNode } from "react";
import "./rules-disclosure.css";

/**
 * Desktop rule text (owner 19/11): a small "▼ title" line like Bài thi tháng's "Quy tắc điểm danh và giờ vào đề", not a card that opens the rules in place.
 * Phones/tablets show the same content behind an ⓘ instead (callers choose by tier).
 */
export function RulesDisclosure({ title, children, className, testId }: { title: string; children: ReactNode; className?: string; testId?: string }) {
  return <details className={["rules-disclosure", "monthly-eligibility-rules", className].filter(Boolean).join(" ")} {...(testId ? { "data-testid": testId } : {})}>
    <summary>{title}</summary>
    <div className="rules-disclosure__body">{children}</div>
  </details>;
}
