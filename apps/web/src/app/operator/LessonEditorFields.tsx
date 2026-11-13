import type { ReactNode } from "react";
import { LineField } from "../shared/LineField.js";

export { LineField };

/** Building blocks shared by every section of the manual lesson editor, so all sections look alike. */
export function EditorSection({ title, children, disabled = false }: { title: string; children: ReactNode; disabled?: boolean }) {
  return <fieldset className="card soft operator-editor-section" disabled={disabled}><legend>{title}</legend>{children}</fieldset>;
}

export function Field({ label, hint, children }: { label: string; hint?: string | undefined; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="xs muted">{hint}</small>}</label>;
}

/**
 * Answer choices on one row, 4 across (two on narrow screens), each with its own placeholder.
 * `count` is 4 except where the content has another fixed number (review minimal pairs: 2).
 * `data-option-index` lets a quality finding ("Lựa chọn C …") land on the exact field.
 */
export function OptionFields({ prefix, options, onChange, optional = false, count = 4 }: { prefix: string; options: string[]; onChange(value: string[]): void; optional?: boolean; count?: number }) {
  return <div className="grid cols-4" aria-label={`${prefix} – Các lựa chọn`}>{Array.from({ length: count }, (_, index) => index).map(index => <LineField key={index} data-option-index={index} aria-label={`${prefix} – Lựa chọn ${index + 1}`} value={options[index] ?? ""} placeholder={`Lựa chọn ${index + 1}${optional ? " (chỉ khi trắc nghiệm)" : ""}`} onChange={event => { const next = [...options]; while (next.length < count) next.push(""); next[index] = event.target.value; onChange(next); }} />)}</div>;
}
