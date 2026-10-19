import { useEffect, useId, useRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> & {
  href: string;
  navigate: (path: string) => void;
  ariaLabel?: string | undefined;
  disabled?: boolean | undefined;
};

export function AppLink({ href, navigate, children, className, ariaLabel, title, disabled = false, style, onKeyDown, ...rest }: AppLinkProps) {
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    onKeyDown?.(event);
    if (disabled && (event.key === "Enter" || event.key === " ")) event.preventDefault();
  };
  const targetStyle: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: 44, minWidth: 44, ...style };
  return <a {...rest} href={href} className={className} aria-label={ariaLabel} title={title} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} style={targetStyle} onClick={follow} onKeyDown={handleKeyDown}>{children}</a>;
}

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean | undefined;
  variant?: "default" | "primary" | "danger" | "ghost" | undefined;
  size?: "sm" | "md" | "lg" | undefined;
};

export function Button({ busy = false, variant = "default", size = "md", className, style, disabled, children, type = "button", ...rest }: AppButtonProps) {
  const classes = ["btn", size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "", variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : variant === "ghost" ? "btn-ghost" : "", className].filter(Boolean).join(" ");
  return <button {...rest} type={type} className={classes} disabled={disabled || busy} aria-disabled={disabled || busy || undefined} aria-busy={busy || undefined} style={{ minHeight: size === "lg" ? 48 : 44, minWidth: 44, ...style }}>{children}</button>;
}

type CardProps = HTMLAttributes<HTMLElement> & { as?: "article" | "div" | "section" | undefined };

export function Card({ as: Element = "section", className, ...rest }: CardProps) {
  return <Element {...rest} className={["card", className].filter(Boolean).join(" ")} />;
}

export function Empty({ title, description, action, className, ...rest }: HTMLAttributes<HTMLElement> & { title?: string | undefined; description?: ReactNode; action?: ReactNode }) {
  const titleId = useId();
  return <Card {...rest} className={className} role="status" aria-live="polite" aria-labelledby={title ? titleId : undefined}>
    {title ? <h2 id={titleId}>{title}</h2> : null}
    {description ? <div className="muted">{description}</div> : null}
    {action ? <div className="row" style={{ marginTop: 10 }}>{action}</div> : null}
  </Card>;
}

export function Loading({ label = "Đang tải…", className, ...rest }: HTMLAttributes<HTMLDivElement> & { label?: ReactNode }) {
  return <div {...rest} className={["loading-state", className].filter(Boolean).join(" ")} role="status" aria-live="polite" aria-busy="true"><span aria-hidden="true">…</span> {label}</div>;
}

export function Modal({ open = true, title, description, children, actions, onClose, className }: {
  open?: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const initial = dialog?.querySelector<HTMLElement>("[data-modal-initial-focus]") ?? dialog?.querySelector<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
    (initial ?? dialog)?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
    }
  };
  return <div className="modal-backdrop" role="presentation"><section ref={dialogRef} className={["dialog", className].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1} onKeyDown={handleKeyDown}>
    <div className="row between"><h2 id={titleId}>{title}</h2>{onClose ? <Button variant="ghost" size="sm" aria-label="Đóng hộp thoại" onClick={onClose}>×</Button> : null}</div>
    {description ? <p id={descriptionId} className="small">{description}</p> : null}
    {children}
    {actions ? <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>{actions}</div> : null}
  </section></div>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  return <div className={`banner ${tone}`} role={tone === "danger" ? "alert" : "note"} aria-atomic="true"><div className="body small">{children}</div></div>;
}

export function PageTitle({ eyebrow, title, detail, aside }: { eyebrow?: string; title: string; detail?: ReactNode; aside?: ReactNode }) {
  return <header className="page-title"><div>{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}<h1>{title}</h1>{detail ? <p className="muted">{detail}</p> : null}</div>{aside}</header>;
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const safeMax = Math.max(0, max);
  const safeValue = Math.max(0, Math.min(safeMax, value));
  const percent = safeMax > 0 ? Math.round(safeValue / safeMax * 100) : 0;
  return <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={safeValue}><i style={{ width: `${percent}%` }} /></div>;
}

export function ErrorText({ message, id, className }: { message?: string | undefined; id?: string | undefined; className?: string | undefined }) {
  return message ? <p id={id} className={className ? `form-error ${className}` : "form-error"} role="alert" aria-live="assertive" aria-atomic="true">{message}</p> : null;
}
