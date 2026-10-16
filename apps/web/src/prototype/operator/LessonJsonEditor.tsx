import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ContentLessonDraftInput, LessonPartCode } from "@e4s/contracts";
import { TriangleAlert } from "lucide-react";
import { Banner, Button } from "./primitives.js";
import { OPERATOR_LESSON_PART_ORDER, OPERATOR_REQUIRED_LESSON_PARTS, type LessonJsonEditorProps, type LessonJsonValidationResult } from "./types.js";

const partCodes = new Set<LessonPartCode>(OPERATOR_LESSON_PART_ORDER);
const partOrder = new Map<LessonPartCode, number>(OPERATOR_LESSON_PART_ORDER.map((code, index) => [code, index]));

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPartCode(value: unknown): value is LessonPartCode {
  return typeof value === "string" && partCodes.has(value as LessonPartCode);
}

function describeError(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message.trim() ? reason.message : fallback;
}

const focusableSelector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])";

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => !element.hidden);
}

export function validateLessonJson(value: unknown): LessonJsonValidationResult {
  const errors: string[] = [];
  if (!record(value)) return { valid: false, errors: ["JSON bài học phải là một object."] };

  const dayNumber = value.dayNumber;
  if (!Number.isInteger(dayNumber) || Number(dayNumber) < 1 || Number(dayNumber) > 7) errors.push("dayNumber phải là số nguyên từ 1 đến 7.");
  if (typeof value.title !== "string" || !value.title.trim()) errors.push("title không được để trống.");
  else if (value.title.length > 200) errors.push("title không được dài quá 200 ký tự.");
  if (!Number.isInteger(value.durationMinutes) || Number(value.durationMinutes) < 1 || Number(value.durationMinutes) > 120) errors.push("durationMinutes phải là số nguyên từ 1 đến 120.");

  if (!Array.isArray(value.parts)) {
    errors.push("parts phải là một mảng các phần bài học.");
  } else {
    if (value.parts.length < 1) errors.push("parts phải có ít nhất một phần; bộ bài chuẩn cần đủ các phần bắt buộc.");
    if (value.parts.length > 20) errors.push("parts không được có quá 20 phần.");
    const seen = new Set<LessonPartCode>();
    let previousOrder = -1;
    value.parts.forEach((part, index) => {
      if (!record(part)) {
        errors.push(`parts[${index}] phải là một object.`);
        return;
      }
      if (!isPartCode(part.code)) errors.push(`parts[${index}].code không thuộc cấu trúc bài học chuẩn.`);
      else {
        if (seen.has(part.code)) errors.push(`parts bị lặp phần ${part.code}.`);
        seen.add(part.code);
        const currentOrder = partOrder.get(part.code) ?? -1;
        if (currentOrder < previousOrder) errors.push("parts phải theo đúng thứ tự chuẩn của bài học.");
        previousOrder = Math.max(previousOrder, currentOrder);
      }
      if (typeof part.title !== "string" || !part.title.trim()) errors.push(`parts[${index}].title không được để trống.`);
      else if (part.title.length > 100) errors.push(`parts[${index}].title không được dài quá 100 ký tự.`);
      if (!record(part.content)) errors.push(`parts[${index}].content phải là một object.`);
    });
    const missing = OPERATOR_REQUIRED_LESSON_PARTS.filter(code => !seen.has(code));
    if (missing.length) errors.push(`parts thiếu các phần bắt buộc: ${missing.join(", ")}.`);
  }

  return errors.length ? { valid: false, errors } : { valid: true, errors: [], lesson: value as unknown as ContentLessonDraftInput };
}

type LessonJsonEditorRenderProps = LessonJsonEditorProps & { embedded?: boolean };

export function LessonJsonEditor({
  lesson,
  onSave,
  onCancel,
  busy = false,
  readOnly = false,
  error: externalError,
  embedded = false
}: LessonJsonEditorRenderProps) {
  const [value, setValue] = useState(() => JSON.stringify(lesson, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);
  const serializedLesson = useMemo(() => JSON.stringify(lesson, null, 2), [lesson]);
  const isBusy = busy || saving;

  useEffect(() => {
    setValue(serializedLesson);
    setErrors([]);
    setError(undefined);
  }, [serializedLesson]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (focusableElements(container)[0] ?? container).focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [embedded]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      if (!isBusy) {
        event.preventDefault();
        onCancel();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const container = containerRef.current;
    if (!container) return;
    const elements = focusableElements(container);
    if (!elements.length) {
      event.preventDefault();
      container.focus();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const save = async () => {
    if (readOnly || isBusy) return;
    setErrors([]);
    setError(undefined);
    let parsed: unknown;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch (reason) {
      setErrors([`JSON không hợp lệ: ${describeError(reason, "không thể đọc nội dung.")}`]);
      return;
    }
    const validation = validateLessonJson(parsed);
    if (!validation.valid || !validation.lesson) {
      setErrors(validation.errors);
      return;
    }
    setSaving(true);
    try {
      await onSave(validation.lesson);
    } catch (reason) {
      setError(describeError(reason, "Không lưu được JSON bài học."));
    } finally {
      setSaving(false);
    }
  };
  const visibleErrors = errors.length ? errors : externalError ? [externalError] : error ? [error] : [];
  const content = <>
    {!embedded && <div className="row between"><h3 id="lesson-json-title">JSON bài học</h3><Button type="button" small disabled={isBusy} onClick={onCancel}>Đóng</Button></div>}
    <textarea value={value} onChange={event => { setValue(event.target.value); setErrors([]); }} readOnly={readOnly || isBusy} rows={18} style={{ width: "100%", minHeight: "50vh", fontFamily: "ui-monospace, monospace", fontSize: ".8rem", boxSizing: "border-box" }} aria-label="Nội dung JSON bài học" aria-describedby={visibleErrors.length ? "lesson-json-error" : undefined} />
    {visibleErrors.length > 0 && <div id="lesson-json-error"><Banner tone="danger" icon={<TriangleAlert className="operator-banner-svg" size={17} strokeWidth={2.25} />}><div className="small"><b>JSON lỗi</b><ul>{visibleErrors.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div></Banner></div>}
    {isBusy && <span className="small muted" role="status" aria-live="polite">Đang lưu…</span>}
    <div className="row" style={{ justifyContent: "flex-end", marginTop: 10, flexWrap: "wrap" }}><Button type="button" disabled={isBusy} onClick={onCancel}>{embedded ? "Quay lại biểu mẫu" : "Huỷ"}</Button><Button type="button" primary busy={isBusy} disabled={readOnly || isBusy} onClick={() => void save()}>{isBusy ? "Đang lưu…" : "Lưu JSON"}</Button></div>
  </>;
  if (embedded) return <div ref={(element) => { containerRef.current = element; }} className="operator-lesson-json-editor" tabIndex={-1} onKeyDown={handleKeyDown}>{content}</div>;
  return <div className="modal-backdrop operator-modal-scope" role="presentation" onClick={event => { if (event.target === event.currentTarget && !isBusy) onCancel(); }}><section ref={(element) => { containerRef.current = element; }} className="dialog wide" role="dialog" aria-modal="true" aria-label="JSON bài học" aria-labelledby="lesson-json-title" aria-busy={isBusy || undefined} tabIndex={-1} onKeyDown={handleKeyDown}>{content}</section></div>;
}
