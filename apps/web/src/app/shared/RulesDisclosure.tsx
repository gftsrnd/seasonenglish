import type { ReactNode } from "react";
import "./rules-disclosure.css";

/**
 * Desktop rule text (owner 19/11): one bold line with the black ▼ triangle (like the selects) that opens the rules in place.
 * Phones/tablets show the same content behind an ⓘ instead (callers choose by tier).
 */
export function RulesDisclosure({ title, children, className, testId }: { title: string; children: ReactNode; className?: string; testId?: string }) {
  return <details className={["rules-disclosure", className].filter(Boolean).join(" ")} {...(testId ? { "data-testid": testId } : {})}>
    <summary><span>{title}</span><span className="rules-disclosure__chevron" aria-hidden="true" /></summary>
    <div className="rules-disclosure__body">{children}</div>
  </details>;
}
