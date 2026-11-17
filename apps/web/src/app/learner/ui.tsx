import { ChevronRight } from "lucide-react";
import { InfoTitle, ModalCloseButton, useCompactUi } from "../shared/CompactUi.js";
import { useEffect, useId, useRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

/** "Bài 5" / "Ôn tuần 2" at A1–A2; `english` (B1+ learners, who see no Vietnamese) gives "Lesson 5" / "Week 2 review". */
export function learnerLessonLabel(lesson: { dayNumber: number; newLessonNumber?: number; teachingLabel?: string; kind?: "new" | "review" }, english = false) {
  if (lesson.kind === "review" || /^(?:Ôn (?:tuần|tập)|Week \d+ review|Weekly review)/u.test(lesson.teachingLabel ?? "")) {
    const week = /^(?:Ôn tuần (\d+)|Week (\d+) review)$/u.exec(lesson.teachingLabel ?? "");
    const number = week?.[1] ?? week?.[2];
    if (english) return number ? `Week ${number} review` : "Review";
    return number ? `Ôn tuần ${number}` : "Ôn tập";
  }
  const legacyOrdinal = /^(?:N|Bài |Lesson )(\d+)/u.exec(lesson.teachingLabel ?? "")?.[1];
  return `${english ? "Lesson" : "Bài"} ${lesson.newLessonNumber ?? legacyOrdinal ?? lesson.dayNumber}`;
}

/** In-sentence form of a lesson label: "Bài 5" -> "bài 5", "Ôn tuần 1" -> "bài ôn tuần 1". */
export function learnerLessonPhrase(label: string) {
  return label.startsWith("Bài ") ? `bài ${label.slice(4)}` : `bài ${label.charAt(0).toLocaleLowerCase("vi")}${label.slice(1)}`;
}

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

export function LearnerSupportCard({ from, navigate, appeals = true }: { from: "home" | "profile"; navigate: AppLinkProps["navigate"]; appeals?: boolean }) {
  return <AppLink className="card learner-support-entry" href={`/support?from=${from}`} navigate={navigate} ariaLabel="Hỗ trợ học tập" style={{ display: "flex" }}>
    <div><h2>Hỗ trợ học tập</h2><p className="small muted">{appeals ? "Gửi khiếu nại, kháng nghị, trả lời khảo sát và xem phản hồi." : "Gửi khiếu nại, trả lời khảo sát và xem phản hồi."}</p></div>
    <ChevronRight size={20} aria-hidden="true" />
  </AppLink>;
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

export function Modal({ open = true, title, description, children, actions, onClose, className, dismissOnBackdrop = false }: {
  open?: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: (() => void) | undefined;
  className?: string | undefined;
  dismissOnBackdrop?: boolean;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    // Focus lands on the dialog itself (no ring on the × or an action), unless a field asks for it; Tab moves into the controls.
    const initial = dialog?.querySelector<HTMLElement>("[data-modal-initial-focus]") ?? dialog?.querySelector<HTMLElement>("input, select, textarea");
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
  return <div className="modal-backdrop" role="presentation" onClick={(event) => { if (dismissOnBackdrop && event.target === event.currentTarget) onClose?.(); }}><section ref={dialogRef} className={["dialog", className].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1} onKeyDown={handleKeyDown}>
    <div className="row between"><h2 id={titleId}>{title}</h2>{onClose ? <ModalCloseButton label="Đóng hộp thoại" onClick={onClose} /> : null}</div>
    {description ? <p id={descriptionId} className="small">{description}</p> : null}
    {children}
    {actions ? <div className="row modal-actions" style={{ justifyContent: "flex-end", marginTop: 12 }}>{actions}</div> : null}
  </section></div>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  return <div className={`banner ${tone}`} role={tone === "danger" ? "alert" : "note"} aria-atomic="true"><div className="body small">{children}</div></div>;
}

/**
 * Page header. `tip` = guidance shown behind an ⓘ next to the title on phones/tablets
 * (desktop renders the plain title, unchanged); `compactDetail: false` hides the detail
 * line on phones/tablets (use it when the same text is in `tip`).
 */
export function PageTitle({ eyebrow, title, detail, aside, tip, compactDetail = true }: { eyebrow?: string; title: string; detail?: ReactNode; aside?: ReactNode; tip?: ReactNode; compactDetail?: boolean }) {
  const compact = useCompactUi();
  const showDetail = detail && (compactDetail || !compact);
  return <header className="page-title"><div>{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}{tip ? <InfoTitle as="h1" title={title} tip={tip} /> : <h1>{title}</h1>}{showDetail ? <p className="muted">{detail}</p> : null}</div>{aside}</header>;
}

export function Progress({ value, max, label, segmented = false }: { value: number; max: number; label: string; segmented?: boolean }) {
  const safeMax = Math.max(0, max);
  const safeValue = Math.max(0, Math.min(safeMax, value));
  const percent = safeMax > 0 ? Math.round(safeValue / safeMax * 100) : 0;
  return <div className={`progress${segmented ? " progress-segmented" : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={safeValue} style={segmented ? { gridTemplateColumns: `repeat(${Math.max(safeMax, 1)}, minmax(0, 1fr))` } : undefined}>{segmented ? Array.from({ length: safeMax }, (_, index) => <i className={index === safeValue - 1 ? "is-active" : index < safeValue ? "is-complete" : "is-upcoming"} key={index} />) : <i style={{ width: `${percent}%` }} />}</div>;
}

export function ErrorText({ message, id, className }: { message?: string | undefined; id?: string | undefined; className?: string | undefined }) {
  return message ? <p id={id} className={className ? `form-error ${className}` : "form-error"} role="alert" aria-live="assertive" aria-atomic="true">{message}</p> : null;
}
