import type { ReactNode } from "react";
import { Book } from "lucide-react";
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

/**
 * Long rules open in a popup from a book inside a circle (owner 19/11, from the reference picture);
 * ⓘ stays for short notes. Same size and colour as ⓘ; the label is the tooltip and the accessible name.
 */
export function RulesIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="rules-icon-button" aria-label={`Luật: ${label}`} title="Luật" aria-haspopup="dialog" onClick={onClick}><Book size={11} strokeWidth={2.4} aria-hidden="true" /></button>;
}
