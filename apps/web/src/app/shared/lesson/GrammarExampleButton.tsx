import { useEffect, useId, useRef, useState } from "react";
import { Languages, Volume2 } from "lucide-react";

/** Mouse events a touch screen emulates right after a tap are ignored for this long. */
const TOUCH_MOUSE_GRACE_MS = 800;

/**
 * One grammar example card: the existing "listen" button (click/tap anywhere
 * on the card plays the English sentence only, unchanged) plus, for A1–A2
 * examples that carry one, a small translate icon at the card's right end.
 * The icon is a sibling control laid over the card's end (never a nested
 * button) and never plays audio: tap/click it to open or close the Vietnamese
 * popup; a tap outside or Esc closes it; on desktop hovering the icon also
 * shows it. The translation is never part of the spoken text.
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
  const tooltipId = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const lastTouch = useRef(0);
  const hint = translation?.trim();

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

  const example = <button
    className="btn-sm btn-ghost lesson-example-card vocabulary-card-sound"
    type="button"
    aria-label={`${listenLabel}: ${spoken}`}
    onClick={onPlay}
  ><Volume2 size={14} aria-hidden="true" />{text}</button>;
  if (!hint) return example;

  const hovering = () => Date.now() - lastTouch.current >= TOUCH_MOUSE_GRACE_MS;
  return <span ref={wrapper} className="lesson-example-wrap" data-open={open || undefined}>
    {example}
    <button
      className="btn-sm btn-ghost lesson-example-translate"
      type="button"
      aria-label="Xem nghĩa tiếng Việt"
      aria-expanded={open}
      aria-controls={tooltipId}
      aria-describedby={tooltipId}
      onPointerDown={(event) => { if (event.pointerType !== "mouse") lastTouch.current = Date.now(); }}
      onClick={(event) => { event.stopPropagation(); const next = !(open && pinned.current); pinned.current = next; setOpen(next); }}
      onMouseEnter={() => { if (hovering()) setOpen(true); }}
      onMouseLeave={() => { if (hovering() && !pinned.current) setOpen(false); }}
    ><Languages size={14} aria-hidden="true" /></button>
    <span id={tooltipId} role="tooltip" className="lesson-example-translation" lang="vi" hidden={!open}>{hint}</span>
  </span>;
}
