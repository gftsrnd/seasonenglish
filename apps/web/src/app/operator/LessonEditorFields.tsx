import type { ReactNode } from "react";

/** Building blocks shared by every section of the manual lesson editor, so all sections look alike. */
export function EditorSection({ title, children, disabled = false }: { title: string; children: ReactNode; disabled?: boolean }) {
  return <fieldset className="card soft operator-editor-section" disabled={disabled}><legend>{title}</legend>{children}</fieldset>;
}

export function Field({ label, hint, children }: { label: string; hint?: string | undefined; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="xs muted">{hint}</small>}</label>;
}

/** Four answer choices on one row (two on narrow screens), each with its own placeholder. */
export function OptionFields({ prefix, options, onChange, optional = false }: { prefix: string; options: string[]; onChange(value: string[]): void; optional?: boolean }) {
  return <div className="grid cols-4" aria-label={`${prefix} – Các lựa chọn`}>{[0, 1, 2, 3].map(index => <input key={index} aria-label={`${prefix} – Lựa chọn ${index + 1}`} value={options[index] ?? ""} placeholder={`Lựa chọn ${index + 1}${optional ? " (chỉ khi trắc nghiệm)" : ""}`} onChange={event => { const next = [...options]; while (next.length < 4) next.push(""); next[index] = event.target.value; onChange(next); }} />)}</div>;
}
