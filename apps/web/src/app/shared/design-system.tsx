import { createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import "./design-system.css";

export type ButtonVariant = "default" | "primary" | "danger" | "ghost";
export type ButtonSize = "md" | "sm" | "lg";

export function Button({ variant = "default", size = "md", busy = false, className = "", children, disabled, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; busy?: boolean }) {
  const legacyVariant = variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : variant === "ghost" ? "btn-ghost" : "";
  const legacySize = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";
  const classes = ["ds-button", `ds-button--${variant}`, `ds-button--${size}`, legacyVariant, legacySize, className].filter(Boolean).join(" ");
  return <button {...props} type={type} className={classes} disabled={Boolean(disabled || busy)} aria-busy={busy ? "true" : undefined}>
    {busy ? <span className="ds-button__spinner" aria-hidden="true" /> : null}
    {children}
  </button>;
}

export type BadgeTone = "" | "ok" | "warn" | "danger" | "primary";

export function Badge({ children, tone = "", className = "" }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return <span className={["badge", "ds-badge", tone && `ds-badge--${tone}`, className].filter(Boolean).join(" ")}>{children}</span>;
}

export type ToastTone = "info" | "ok" | "warn" | "danger";
/**
 * `default` is the staff card (bottom right); `learner` keeps the learner pill (#toast, bottom centre);
 * `assessment` keeps the exam notice panel (icon + optional action button) learners see during a test.
 */
export type ToastVariant = "default" | "learner" | "assessment";
export type ToastInput = {
  message: ReactNode;
  tone?: ToastTone;
  /** 0 keeps the toast until it is dismissed. */
  durationMs?: number;
  /** De-dupe key for a ReactNode message whose text alone does not identify it. */
  key?: string;
  variant?: ToastVariant;
  /** Secondary detail (for example "Mã lỗi: HTTP_500"), shown only as the toast's tooltip. */
  detail?: string;
  actions?: ReactNode;
};
type ToastItem = ToastInput & { id: number; dedupeKey?: string | undefined };
export type ToastApi = { show: (input: ToastInput) => number; dismiss: (id: number) => void };
const ToastContext = createContext<ToastApi | undefined>(undefined);
const TOAST_DEDUPE_WINDOW_MS = 1_500;
// Outside a provider (an isolated component test) toasts are dropped instead of crashing the component.
const DETACHED_TOASTS: ToastApi = { show: () => 0, dismiss: () => undefined };

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? DETACHED_TOASTS;
}

/** Plain text of a ReactNode, so two toasts with the same wording count as the same message. */
function toastText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toastText).join(" ");
  if (isValidElement(node)) return toastText((node.props as { children?: ReactNode }).children);
  return "";
}

/** Tone plus normalised text (or the explicit key): the identity of a message for de-duping. */
export function toastDedupeKey(input: ToastInput): string | undefined {
  const text = input.key ?? toastText(input.message).normalize("NFC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("vi");
  return text ? `${input.variant ?? "default"}:${input.tone ?? "info"}:${text}` : undefined;
}

/**
 * The app's only toast system. One message is one toast: a message already on screen (same tone and text,
 * or the same `key`) is not stacked again; it stays and its timer restarts. A message that just left is
 * not re-shown within the de-dupe window either (two owners reporting the same action).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Map<number, number>());
  const visible = useRef(new Map<string, number>());
  const recent = useRef(new Map<string, number>());
  const keys = useRef(new Map<number, string>());
  const forget = (id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    const key = keys.current.get(id);
    if (key && visible.current.get(key) === id) visible.current.delete(key);
  };
  const remove = useCallback((id: number) => {
    forget(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  // An explicit dismiss (the close button, a condition that ended) also lets the same message show again at once.
  const dismiss = useCallback((id: number) => {
    const key = keys.current.get(id);
    if (key && recent.current.get(key) !== undefined) recent.current.delete(key);
    remove(id);
  }, [remove]);
  const schedule = useCallback((id: number, durationMs: number) => {
    const previous = timers.current.get(id);
    if (previous !== undefined) window.clearTimeout(previous);
    timers.current.delete(id);
    if (durationMs > 0) timers.current.set(id, window.setTimeout(() => remove(id), durationMs));
  }, [remove]);
  const show = useCallback((input: ToastInput) => {
    const dedupeKey = toastDedupeKey(input);
    const durationMs = input.durationMs ?? 4_000;
    const now = Date.now();
    if (dedupeKey) {
      const onScreen = visible.current.get(dedupeKey);
      if (onScreen !== undefined) { schedule(onScreen, durationMs); return onScreen; }
      const shownAt = recent.current.get(dedupeKey);
      if (shownAt !== undefined && now - shownAt < TOAST_DEDUPE_WINDOW_MS) return 0;
    }
    const id = ++sequence.current;
    if (dedupeKey) { visible.current.set(dedupeKey, id); recent.current.set(dedupeKey, now); keys.current.set(id, dedupeKey); }
    const item: ToastItem = { ...input, id, durationMs, dedupeKey };
    setItems((current) => {
      // At most three on screen: the oldest leaves (and stops counting as visible) when a fourth arrives.
      for (const dropped of current.slice(0, -2)) forget(dropped.id);
      return [...current.slice(-2), item];
    });
    schedule(id, durationMs);
    return id;
  }, [schedule]);
  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [dismiss, show]);
  const staff = items.filter((item) => (item.variant ?? "default") === "default");
  const learner = items.filter((item) => item.variant === "learner");
  const assessment = items.filter((item) => item.variant === "assessment");
  const role = (item: ToastItem) => item.tone === "danger" ? "alert" : "status";
  return <ToastContext.Provider value={api}>
    {children}
    <div className="ds-toast-viewport" aria-live="polite" aria-atomic="false">
      {staff.map((item) => <div className={`ds-toast ds-toast--${item.tone ?? "info"}`} key={item.id} role={role(item)} title={item.detail} data-toast-id={item.id}>
        <span className="ds-toast__message">{item.message}</span>
        {item.actions ? <span className="ds-toast__actions">{item.actions}</span> : null}
        <button className="ds-toast__dismiss" type="button" aria-label="Đóng thông báo" onClick={() => dismiss(item.id)}>×</button>
      </div>)}
    </div>
    {learner.length ? <div id="toast" aria-live="polite">
      {learner.map((item) => <div className={`toast ${item.tone === "danger" ? "err" : item.tone ?? "info"}`} key={item.id} role={role(item)} title={item.detail} data-toast-id={item.id}>{item.message}</div>)}
    </div> : null}
    {assessment.length ? <div className="assessment-toast-viewport">
      {assessment.map((item) => <div className={`assessment-toast assessment-toast-${item.tone ?? "info"}`} key={item.id} role={role(item)} aria-live={item.tone === "danger" ? "assertive" : "polite"} aria-atomic="true" title={item.detail} data-toast-id={item.id}>
        <div className="assessment-toast-body">{item.message}</div>
        {item.actions ? <div className="assessment-toast-actions">{item.actions}</div> : null}
      </div>)}
    </div> : null}
  </ToastContext.Provider>;
}

/**
 * A toast that stays while a condition holds (an exam warning, an error with a retry button): shown when
 * `input` appears, replaced when its key changes, dismissed when it becomes null or the component unmounts.
 */
export function useToastWhile(input: (ToastInput & { key: string }) | null | undefined) {
  const toast = useToast();
  const latest = useRef(input);
  latest.current = input;
  const key = input?.key;
  useEffect(() => {
    const current = latest.current;
    if (!current) return;
    const id = toast.show({ ...current, durationMs: 0 });
    return () => toast.dismiss(id);
  }, [toast, key]);
}
