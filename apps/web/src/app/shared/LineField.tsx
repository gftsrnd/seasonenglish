import { useCallback, useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent, type TextareaHTMLAttributes } from "react";

/**
 * A one-line value (question, choice, answer, instruction…) edited in a box that
 * starts one row high and grows to show all of its text, like "Đoạn văn".
 * The value stays a single line: Enter is blocked and pasted line breaks become spaces.
 * `grow={false}` keeps the box size of its surroundings (a fixed-height grid) and only wraps the text.
 */
export function LineField({ onChange, onKeyDown, className, grow = true, ...props }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & { value?: string; grow?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = useCallback(() => {
    const element = ref.current;
    if (!element || !grow) return;
    element.style.height = "auto";
    const content = element.scrollHeight;
    if (!content) { element.style.height = ""; return; }
    const style = window.getComputedStyle(element);
    const border = style.boxSizing === "border-box" ? (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0) : -((parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0));
    element.style.height = `${content + border}px`;
  }, [grow]);
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
    rows={grow ? 1 : undefined}
    className={[grow ? "line-field" : "", className ?? ""].filter(Boolean).join(" ") || undefined}
    onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault(); onKeyDown?.(event); }}
    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
      if (/[\r\n]/.test(event.target.value)) event.target.value = event.target.value.replace(/\r\n|[\r\n]/g, " ");
      onChange?.(event);
      if (props.value === undefined) fit();
    }}
  />;
}
