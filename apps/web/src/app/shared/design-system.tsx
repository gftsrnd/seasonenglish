import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
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

type ToastTone = "info" | "ok" | "danger";
type ToastInput = { message: ReactNode; tone?: ToastTone; durationMs?: number };
type ToastItem = ToastInput & { id: number };
type ToastApi = { show: (input: ToastInput) => number; dismiss: (id: number) => void };
const ToastContext = createContext<ToastApi | undefined>(undefined);

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Map<number, number>());
  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const show = useCallback((input: ToastInput) => {
    const id = ++sequence.current;
    const item = { ...input, id, durationMs: input.durationMs ?? 4_000 };
    setItems((current) => [...current.slice(-2), item]);
    if (item.durationMs > 0) timers.current.set(id, window.setTimeout(() => dismiss(id), item.durationMs));
    return id;
  }, [dismiss]);
  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [dismiss, show]);
  return <ToastContext.Provider value={api}>
    {children}
    <div className="ds-toast-viewport" aria-live="polite" aria-atomic="false">
      {items.map((item) => <div className={`ds-toast ds-toast--${item.tone ?? "info"}`} key={item.id} role={item.tone === "danger" ? "alert" : "status"}>
        <span className="ds-toast__message">{item.message}</span>
        <button className="ds-toast__dismiss" type="button" aria-label="Đóng thông báo" onClick={() => dismiss(item.id)}>×</button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}
