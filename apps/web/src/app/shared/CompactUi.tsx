import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import "./info-tip.css";
import "./modal-header.css";
import "./content-image-contain.css";
import { Info, X } from "lucide-react";
import { useMediaQuery } from "./useMediaQuery.js";

/** Phones only (≤ 600px): compact UI (icon buttons, short descriptions). Tablets and desktop keep the full text. */
export const COMPACT_UI_QUERY = "(max-width: 600px)";
export function useCompactUi() {
  return useMediaQuery(COMPACT_UI_QUERY);
}

/** Tablets (601–1024px): desktop structure with phone density (see responsive-tablet.css). */
export const TABLET_UI_QUERY = "(min-width: 601px) and (max-width: 1024px)";
export type UiTier = "phone" | "tablet" | "desktop";
/** phone ≤ 600px · tablet 601–1024px · desktop ≥ 1025px. */
export function useUiTier(): UiTier {
  const phone = useMediaQuery(COMPACT_UI_QUERY);
  const tablet = useMediaQuery(TABLET_UI_QUERY);
  return phone ? "phone" : tablet ? "tablet" : "desktop";
}

type IconComponent = ComponentType<{ size?: number; "aria-hidden"?: boolean | "true"; strokeWidth?: number }>;

/**
 * Button content that is an icon on phones/tablets and the text label on
 * desktop. The label stays as the accessible name (visually hidden) and as a
 * tooltip, so `<button><ActionLabel icon={Eye} label="Xem" /></button>` reads
 * "Xem" everywhere. Destructive buttons keep their red `.btn-danger` style.
 */
export function ActionLabel({ icon: Icon, label, children }: { icon: IconComponent; label: string; children?: ReactNode }) {
  const tier = useUiTier();
  if (tier === "desktop") return <>{children ?? label}</>;
  // Tablet: icon + short text label, not icon-only.
  if (tier === "tablet") return <span className="action-icon-text" title={label}><Icon size={15} strokeWidth={2.2} aria-hidden="true" /><span>{label}</span></span>;
  return <span className="action-icon-only" title={label}><Icon size={16} strokeWidth={2.2} aria-hidden="true" /><span className="action-icon-label">{label}</span></span>;
}

/** Icon followed by a short label on phones/tablets (for actions that need words); full label on desktop. */
export function ActionShortLabel({ icon: Icon, label, short }: { icon: IconComponent; label: string; short?: string }) {
  if (useUiTier() === "desktop") return <>{label}</>;
  return <span className="action-icon-text" title={label}><Icon size={15} strokeWidth={2.2} aria-hidden="true" /><span>{short ?? label}</span></span>;
}

/** The box an ⓘ popover spans: the nearest card, panel or dialog around the title. */
/** Wider frames that win over a nearer card (a KPI tile's tip spans the whole KPI row). */
const INFO_TIP_WIDE_FRAME = ".manager-kpi-grid";
const INFO_TIP_FRAME = ".settings-panel, .card, .dialog, [role=\"dialog\"], .section, section, .page-title, main";

/**
 * ⓘ right after a title: tap or hover to read guidance. The trigger is glued to
 * the last word (word joiner + nowrap), so it never wraps alone. The popover
 * opens just below the title, as wide as the card/panel the title belongs to.
 */
export function InfoTip({ text, label = "Giải thích" }: { text: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<CSSProperties | null>(null);
  // Long guidance (more than ~6 lines) opens as a small shared popup instead of an inline box.
  const [asModal, setAsModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const fitted = useRef(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const popover = useRef<HTMLSpanElement>(null);
  const dialogBox = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!open) { setBox(null); setAsModal(false); fitted.current = false; return; }
    const place = () => {
      fitted.current = false;
      const trigger = ref.current; if (!trigger) return;
      const previous = trigger.previousElementSibling; const heading = trigger.closest("h1, h2, h3, h4, legend, summary, .settings-panel-head") ?? (previous?.matches("h1, h2, h3, h4") ? previous : null) ?? trigger.parentElement ?? trigger;
      let frame = (heading.closest(INFO_TIP_WIDE_FRAME) ?? heading.parentElement?.closest(INFO_TIP_FRAME) ?? heading) as HTMLElement;
      // A title in a small tile (e.g. one of two side-by-side cards): span the enclosing section instead, so the text stays readable.
      for (let wider = frame.parentElement?.closest<HTMLElement>(INFO_TIP_FRAME); wider && frame.getBoundingClientRect().width < Math.min(window.innerWidth * 0.6, 520); wider = wider.parentElement?.closest<HTMLElement>(INFO_TIP_FRAME)) frame = wider;
      const f = frame.getBoundingClientRect(); const h = heading.getBoundingClientRect(); const b = trigger.getBoundingClientRect();
      const left = Math.max(8, f.left + 8); const right = Math.min(window.innerWidth - 8, f.right - 8);
      setModalTitle((heading.getAttribute("aria-label") ?? heading.textContent ?? "").replace(/\s+/g, " ").trim() || label);
      setBox({ position: "fixed", top: Math.max(h.bottom, b.bottom) + 4, left, width: Math.max(160, right - left), right: "auto", bottom: "auto", maxWidth: "none", insetInlineStart: left, insetInlineEnd: "auto", insetBlockStart: Math.max(h.bottom, b.bottom) + 4, insetBlockEnd: "auto" });
    };
    place();
    const close = (event: Event) => { const target = event.target; if (!(target instanceof Node && (ref.current?.contains(target) || popover.current?.contains(target) || dialogBox.current?.contains(target)))) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onScroll = (event: Event) => { if (!(event.target instanceof Node && (popover.current?.contains(event.target) || dialogBox.current?.contains(event.target)))) setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", place); document.removeEventListener("scroll", onScroll, true); };
  }, [open]);
  // Keep the box inside the viewport: at most ~60% of the screen tall (scrolls inside), flipped above
  // the title when there is more room there; more than ~6 lines becomes a small popup instead.
  useLayoutEffect(() => {
    const node = popover.current;
    if (!open || !box || asModal || !node || fitted.current) return;
    fitted.current = true;
    const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 19;
    if (node.scrollHeight > lineHeight * 6.5 + 20) { setAsModal(true); return; }
    const top = Number(box.top) || 0;
    const titleTop = ref.current?.closest("h1, h2, h3, h4, legend, summary, .settings-panel-head")?.getBoundingClientRect().top ?? top - 28;
    const below = window.innerHeight - top - 8;
    const above = titleTop - 12;
    const cap = Math.round(window.innerHeight * 0.6);
    if (node.scrollHeight > below && above > below) {
      const maxHeight = Math.min(cap, above);
      setBox({ ...box, top: "auto", insetBlockStart: "auto", bottom: window.innerHeight - titleTop + 4, insetBlockEnd: window.innerHeight - titleTop + 4, maxHeight, overflowY: "auto" });
    } else {
      setBox({ ...box, maxHeight: Math.max(80, Math.min(cap, below)), overflowY: "auto" });
    }
  }, [open, box, asModal]);
  useEffect(() => {
    if (!asModal) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [asModal]);
  // CSS puts a word joiner (U+2060) before the ⓘ (.info-tip::before), gluing it to the preceding word so it never
  // wraps onto a line of its own; it is generated content, so the title's text stays exactly the title.
  return <span className="info-tip" ref={ref}>
    <button type="button" className="info-tip-button" aria-label={label} title={typeof text === "string" ? text : label} aria-expanded={open} aria-controls={open ? id : undefined} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}><Info size={15} aria-hidden="true" /></button>
    {open && !asModal ? createPortal(<span ref={popover} className="info-tip-popover" id={id} role="note" style={box ?? { visibility: "hidden" }}>{text}</span>, document.body) : null}
    {open && asModal ? createPortal(<div className="modal-backdrop info-tip-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialogBox} className="dialog info-tip-dialog" id={id} role="dialog" aria-modal="true" aria-label={modalTitle || label}>
        <header className="info-tip-dialog-header"><h3>{modalTitle || label}</h3><ModalCloseButton iconOnly onClick={() => setOpen(false)} /></header>
        <div className="info-tip-dialog-body">{text}</div>
      </section>
    </div>, document.body) : null}
  </span>;
}

/**
 * ⓘ for a section/card title: render it as the LAST CHILD of the heading
 * (`<h3>Title<SectionTip …/></h3>`). `desktop` = the section has no visible
 * guidance on desktop, so the ⓘ shows there too; otherwise it is phones/tablets
 * only (desktop keeps its paragraph). The heading's accessible name stays the
 * title alone (aria-label without the ⓘ button's label).
 */
export function SectionTip({ text, label, desktop = false }: { text: ReactNode; label?: string; desktop?: boolean }) {
  const compact = useUiTier() !== "desktop";
  const ref = useRef<HTMLSpanElement>(null);
  // Desktop never shows the ⓘ (owner decision 2026-11-16): `desktop` is kept for callers but ignored.
  void desktop;
  const shown = compact;
  useLayoutEffect(() => {
    const heading = ref.current?.closest("h1, h2, h3, h4");
    if (!heading || heading.hasAttribute("aria-label") || heading.hasAttribute("aria-labelledby")) return;
    const copy = heading.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(".section-tip").forEach((node) => node.remove());
    const name = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
    if (name && heading.getAttribute("aria-label") !== name) heading.setAttribute("aria-label", name);
    return () => { if (heading.getAttribute("aria-label") === name) heading.removeAttribute("aria-label"); };
  });
  return shown ? <span className="section-tip" ref={ref}><InfoTip text={text} {...(label ? { label } : {})} /></span> : null;
}

/**
 * A page/card description. Desktop shows `text`. Phones and tablets show
 * `short` (one short line) when given, otherwise nothing; with `info` the full
 * text moves into an ⓘ tooltip instead (render <InfoTip> next to the title).
 */
export function Description({ text, short, className = "small muted", page = false }: { text: ReactNode; short?: ReactNode; className?: string; page?: boolean }) {
  const tier = useUiTier();
  if (tier === "desktop") return <p className={className}>{text}</p>;
  // A page description: tablets show the full line like desktop; phones put it behind the title's ⓘ (owner 19/11).
  if (page) return tier === "tablet" ? <p className={className}>{text}</p> : null;
  // Tablet: one short line under the title; the longer guidance is in the title's ⓘ.
  if (tier === "tablet") return <p className={`${className} tier-one-line`} title={typeof text === "string" ? text : undefined}>{short ?? text}</p>;
  return short ? <p className={className}>{short}</p> : null;
}

/** Info tip that only appears on phones/tablets (desktop shows the paragraph instead). */
export function CompactInfoTip({ text, label }: { text: ReactNode; label?: string }) {
  const compact = useUiTier() !== "desktop";
  return compact ? <InfoTip text={text} {...(label ? { label } : {})} /> : null;
}

/**
 * A card/section title with its guidance behind ⓘ on phones/tablets.
 * Long titles wrap beside the help button. Desktop renders the plain
 * heading; pair it with `<Description text=… />` (no `short`) so the paragraph
 * shows on desktop and disappears on phones/tablets, where the tip holds it.
 */
export function InfoTitle({ as: Tag = "h3", title, tip, label, className }: { as?: "h1" | "h2" | "h3" | "h4"; title: ReactNode; tip: ReactNode; label?: string; className?: string }) {
  const compact = useUiTier() !== "desktop";
  if (!compact) return <Tag {...(className ? { className } : {})}>{title}</Tag>;
  return <Tag className={["info-title", className].filter(Boolean).join(" ")}><span className="info-title-text">{title}</span><InfoTip text={tip} label={label ?? (typeof title === "string" ? `${title}: giải thích` : "Giải thích")} /></Tag>;
}

/**
 * The one close button every popup uses: top-right of the sticky header
 * (CSS `.modal-close`), "× Đóng" on desktop and a 32px × square on
 * phones/tablets, same neutral style everywhere.
 */
export function ModalCloseButton({ onClick, disabled, label = "Đóng", iconOnly: iconOnlyProp = false, ref }: { onClick: () => void; disabled?: boolean; label?: string; iconOnly?: boolean; ref?: Ref<HTMLButtonElement> }) {
  // Tablets keep the × square of the shared popup header (the one universally obvious icon-only action).
  const iconOnly = useUiTier() === "tablet" || iconOnlyProp;
  return <button ref={ref} type="button" className={iconOnly ? "btn-sm modal-close modal-close--icon" : "btn-sm modal-close"} aria-label={label} title={label} disabled={disabled} onClick={onClick}>{iconOnly ? <X size={16} strokeWidth={2.2} aria-hidden="true" /> : <ActionLabel icon={X} label="Đóng" />}</button>;
}

/** A page title with its short description: the line under the title on tablets and desktop,
 *  behind the ⓘ beside the title on phones (owner 19/11). */
export function PhoneTitle({ title, description, as: Tag = "h1" }: { title: string; description: ReactNode; as?: "h1" | "h2" }) {
  const phone = useUiTier() === "phone";
  return phone ? <InfoTitle as={Tag} title={title} tip={description} /> : <><Tag>{title}</Tag><p className="muted">{description}</p></>;
}
