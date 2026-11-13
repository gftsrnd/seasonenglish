import { useCallback, useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from "react";

/** Building blocks shared by every section of the manual lesson editor, so all sections look alike. */
export function EditorSection({ title, children, disabled = false }: { title: string; children: ReactNode; disabled?: boolean }) {
  return <fieldset className="card soft operator-editor-section" disabled={disabled}><legend>{title}</legend>{children}</fieldset>;
}

export function Field({ label, hint, children }: { label: string; hint?: string | undefined; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="xs muted">{hint}</small>}</label>;
}

/**
 * A one-line value (question, choice, answer, instruction…) edited in a box that
 * starts one row high and grows to show all of its text, like "Đoạn văn".
 * The value stays a single line: Enter is blocked and pasted line breaks become spaces.
 */
export function LineField({ onChange, onKeyDown, className, ...props }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & { value?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    const content = element.scrollHeight;
    if (!content) { element.style.height = ""; return; }
    const style = window.getComputedStyle(element);
    const border = style.boxSizing === "border-box" ? (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0) : -((parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0));
    element.style.height = `${content + border}px`;
  }, []);
  useLayoutEffect(fit, [fit, props.value]);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    // Refit when the width changes (dialog resize, a collapsed section opening), not when the operator drags the height.
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => { if (element.clientWidth !== width) { width = element.clientWidth; fit(); } });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);
  return <textarea
    {...props}
    ref={ref}
    rows={1}
    className={className ? `operator-line-field ${className}` : "operator-line-field"}
    onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault(); onKeyDown?.(event); }}
    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
      if (/[\r\n]/.test(event.target.value)) event.target.value = event.target.value.replace(/\r\n|[\r\n]/g, " ");
      onChange?.(event);
      if (props.value === undefined) fit();
    }}
  />;
}

/**
 * Answer choices on one row, 4 across (two on narrow screens), each with its own placeholder.
 * `count` is 4 except where the content has another fixed number (review minimal pairs: 2).
 * `data-option-index` lets a quality finding ("Lựa chọn C …") land on the exact field.
 */
export function OptionFields({ prefix, options, onChange, optional = false, count = 4 }: { prefix: string; options: string[]; onChange(value: string[]): void; optional?: boolean; count?: number }) {
  return <div className="grid cols-4" aria-label={`${prefix} – Các lựa chọn`}>{Array.from({ length: count }, (_, index) => index).map(index => <LineField key={index} data-option-index={index} aria-label={`${prefix} – Lựa chọn ${index + 1}`} value={options[index] ?? ""} placeholder={`Lựa chọn ${index + 1}${optional ? " (chỉ khi trắc nghiệm)" : ""}`} onChange={event => { const next = [...options]; while (next.length < count) next.push(""); next[index] = event.target.value; onChange(next); }} />)}</div>;
}
