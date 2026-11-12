import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Languages, Volume2 } from "lucide-react";

/** Mouse events a touch screen emulates right after a tap are ignored for this long. */
const TOUCH_MOUSE_GRACE_MS = 800;

/**
 * A control (example card, synonym/antonym chip…) with a small translate icon
 * at its right end behind a thin divider. The icon is a sibling control laid
 * over the control's end (never a nested button) and never plays audio:
 * tap/click it to open or close the popup; a tap outside or Esc closes it; on
 * desktop hovering the icon also shows it. The popup text is never part of
 * any spoken text. Without a hint the control renders alone.
 */
export function MeaningPopupControl({ hint, label, lang, variant, children }: {
  /** Popup text; no icon when empty. */
  hint?: string | undefined;
  /** Accessible name of the icon. */
  label: string;
  /** Language of the popup text. */
  lang: "vi" | "en";
  /** "example": grammar example card; "chip": vocabulary relation chip. */
  variant?: "example" | "chip";
  children: ReactNode;
}) {
  const tooltipId = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const lastTouch = useRef(0);
  const text = hint?.trim();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (wrapper.current && event.target instanceof Node && !wrapper.current.contains(event.target)) { pinned.current = false; setOpen(false); }
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { pinned.current = false; setOpen(false); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  // Keep the popup inside the viewport (16px gutter): a chip near the card's right edge shifts it left.
  const popup = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = popup.current;
    if (!open || !element || typeof window === "undefined") return;
    element.style.left = "";
    const rect = element.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth || window.innerWidth;
    const overflow = rect.right - (viewport - 16);
    if (overflow > 0) element.style.left = `${-Math.min(overflow, Math.max(0, rect.left - 16))}px`;
  }, [open]);

  if (!text) return <>{children}</>;
  const hovering = () => Date.now() - lastTouch.current >= TOUCH_MOUSE_GRACE_MS;
  return <span ref={wrapper} className={`lesson-example-wrap${variant === "chip" ? " lesson-example-wrap--chip" : ""}`} data-open={open || undefined}>
    {children}
    <button
      className="btn-sm btn-ghost lesson-example-translate"
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-controls={tooltipId}
      aria-describedby={tooltipId}
      onPointerDown={(event) => { if (event.pointerType !== "mouse") lastTouch.current = Date.now(); }}
      onClick={(event) => { event.stopPropagation(); const next = !(open && pinned.current); pinned.current = next; setOpen(next); }}
      onMouseEnter={() => { if (hovering()) setOpen(true); }}
      onMouseLeave={() => { if (hovering() && !pinned.current) setOpen(false); }}
    ><Languages size={14} aria-hidden="true" /></button>
    <span ref={popup} id={tooltipId} role="tooltip" className="lesson-example-translation" lang={lang} hidden={!open}>{text}</span>
  </span>;
}

/**
 * One grammar example card: the existing "listen" button (click/tap anywhere
 * on the card plays the English sentence only, unchanged) plus, for A1–A2
 * examples that carry one, the translate icon with the Vietnamese popup.
 */
export function GrammarExampleButton({ text, spoken, translation, listenLabel, onPlay }: {
  /** English example as displayed. */
  text: string;
  /** English text sent to audio/TTS. */
  spoken: string;
  /** Vietnamese translation (A1–A2 only); no translate icon when absent. */
  translation?: string | undefined;
  listenLabel: string;
  onPlay: () => void;
}) {
  return <MeaningPopupControl hint={translation} label="Xem nghĩa tiếng Việt" lang="vi" variant="example">
    <button
      className="btn-sm btn-ghost lesson-example-card vocabulary-card-sound"
      type="button"
      aria-label={`${listenLabel}: ${spoken}`}
      onClick={onPlay}
    ><Volume2 size={14} aria-hidden="true" />{text}</button>
  </MeaningPopupControl>;
}
