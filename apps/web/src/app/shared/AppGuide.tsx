import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CircleHelp, X } from "lucide-react";
import "./app-guide.css";

import { guideAutoOpenKey, guideDefinitions, guidePopupDefinitions, type GuideRole, type GuideStep } from "./app-guide-steps.js";

export const OPEN_LEARNER_HOME_GUIDE = "e4s:open-learner-home-guide";

const SEEN_KEY = "e4s:guide-seen";
/** Screens that open their guide on the first visit remember it per browser; storage may be unavailable. */
function guideSeen(key: string) {
  try { return (JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as unknown[]).includes(key); } catch { return false; }
}
function markGuideSeen(key: string) {
  try {
    const seen = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as unknown[];
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.filter(item => item !== key), key]));
  } catch { /* the guide still opens; it just may open again next time */ }
}
// Vitest renders screens without a guide popping up over them; tests opt in with autoOpen.
const AUTO_OPEN_DEFAULT = import.meta.env.MODE !== "test";

/** Help shares the close button's flex group, including custom dialog headers. */
export function popupGuideHost(popup: HTMLElement): HTMLElement {
  const close = popup.querySelector<HTMLElement>('.modal-close, button[aria-label="Đóng"]');
  const parent = close?.parentElement;
  if (parent && parent !== popup) return parent;
  return popup.querySelector<HTMLElement>(":scope > header, :scope > .assessment-bank-header, :scope > .operator-level-form-dialog-header") ?? popup;
}

const SCROLL_KEYS = new Set([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"]);

type ActiveStep = { selector: string; target: HTMLElement; title: string; text: string; prioritize?: true };
type Spotlight = { top: number; left: number; width: number; height: number };
type GuideContext = { popup: HTMLElement | null; steps: ActiveStep[]; inboxOpen?: boolean };
type GuideState = GuideContext & { isOpen: boolean; index: number };

function isVisible(node: HTMLElement) {
  if (node.closest("[hidden], [inert], [data-guide-ignore], [data-toast-id], #toast") || !node.getClientRects().length || getComputedStyle(node).visibility !== "visible") return false;
  for (let parent = node.parentElement?.closest("details:not([open])"); parent; parent = parent.parentElement?.closest("details:not([open])")) {
    if (!parent.querySelector(":scope > summary")?.contains(node)) return false;
  }
  return true;
}

/** Resolves each step to its first visible target, in on-screen order; steps without a target are skipped. */
export function findSteps(definitions: readonly GuideStep[], scope: ParentNode): ActiveStep[] {
  return definitions.flatMap(([selector, title, text, prioritize]) => {
    const target = Array.from(scope.querySelectorAll<HTMLElement>(selector)).find(isVisible);
    return target ? [{ selector, target, title, text, ...(prioritize ? { prioritize } : {}) }] : [];
  }).sort((left, right) => {
    // Steps follow the reading order of the current layout; a region comes before the controls inside it.
    if (left.target === right.target) return 0;
    return left.target.compareDocumentPosition(right.target) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  });
}

function sameStep(left: ActiveStep | undefined, right: ActiveStep | undefined) {
  return left?.selector === right?.selector && left?.title === right?.title;
}

function currentContext(role: GuideRole, path: string, definitions: readonly GuideStep[]): GuideContext {
  const popup = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], .monthly-resource-panel[role="dialog"]'))
    .filter(isVisible).at(-1) ?? null;
  if (!popup) return { popup, steps: findSteps(definitions, document) };
  if (popup.matches('.inbox-dialog')) return { popup: null, steps: findSteps(definitions, document), inboxOpen: true };
  return { popup, steps: findSteps(guidePopupDefinitions(role, path, popup) ?? [], popup) };
}

function updateContext(current: GuideState, next: GuideContext): GuideState {
  if (current.popup === next.popup && current.inboxOpen === next.inboxOpen && current.steps.length === next.steps.length &&
    current.steps.every((step, index) => sameStep(step, next.steps[index]) && step.target === next.steps[index]?.target)) return current;
  if (current.popup !== next.popup || next.inboxOpen) return { ...next, isOpen: false, index: 0 };
  const added = next.steps.findIndex(step => step.prioritize && !current.steps.some(previous => sameStep(step, previous)));
  const retained = next.steps.findIndex(step => sameStep(step, current.steps[current.index]));
  const index = added >= 0 ? added : retained >= 0 ? retained : Math.min(current.index, next.steps.length - 1);
  return { ...next, isOpen: current.isOpen && next.steps.length > 0, index: Math.max(0, index) };
}

/** Step copy may mark button names and key conditions with **bold**; everything else stays plain text. */
function guideText(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) => index % 2 ? <b key={index}>{part}</b> : part);
}

/** The container that actually scrolls the card: `#root > main` on phones/tablets, the document on desktop, or a popup body. */
function guideScroller(target: HTMLElement): Element {
  for (let node = target.parentElement; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    // Bounded list boxes inside a card also scroll; only a page-sized container (main, a dialog body) moves the card.
    // A popup's own scrolling body (e.g. the manual lesson editor) also moves the card, even when it is
    // shorter than the window; otherwise the guide scrolled the page behind and spotlighted the wrong place.
    const pageSized = node.matches("#root > main, [role=dialog], .dialog") || node.clientHeight > window.innerHeight * 0.75
      || (node.clientHeight > 200 && Boolean(node.closest("[role=dialog], .dialog")));
    if (pageSized && (overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return document.scrollingElement ?? document.documentElement;
}

function getSpotlight(target: HTMLElement): Spotlight | null {
  if (!target.isConnected || !target.getClientRects().length) return null;
  const rect = target.getBoundingClientRect();
  const padding = 10;
  // Clip to every scrolling/clipping ancestor (e.g. a popup's body) so a tall card never spills past the box.
  let clipLeft = 0, clipTop = 0;
  let clipRight = document.documentElement.clientWidth || window.innerWidth, clipBottom = window.innerHeight;
  for (let node = target.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.overflowY === "visible" && style.overflowX === "visible") continue;
    const box = node.getBoundingClientRect();
    clipLeft = Math.max(clipLeft, box.left); clipTop = Math.max(clipTop, box.top);
    clipRight = Math.min(clipRight, box.right); clipBottom = Math.min(clipBottom, box.bottom);
  }
  const left = Math.max(rect.left - padding, clipLeft);
  const top = Math.max(rect.top - padding, clipTop);
  const width = Math.min(rect.right + padding, clipRight) - left;
  const height = Math.min(rect.bottom + padding, clipBottom) - top;
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}

export function AppGuide({ role, pathname, compact, onOpenChange, autoOpen = AUTO_OPEN_DEFAULT }: { role: GuideRole; pathname: string; compact: boolean; onOpenChange?: (open: boolean) => void; autoOpen?: boolean }) {
  const dialogId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const engineScrollUntil = useRef(0);
  // Collapsed sections the engine opened for the current step; closed again when the step changes or the guide closes.
  const engineOpened = useRef<Array<{ restore: () => void }>>([]);
  const engineClicking = useRef(false);
  const [state, setState] = useState<GuideState>({ isOpen: false, index: 0, steps: [], popup: null });
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  // A target that stays under the guide box after scrolling (e.g. a popup's fixed footer) moves the box to the top.
  const [placeTop, setPlaceTop] = useState(false);
  const { isOpen, index, steps, popup, inboxOpen } = state;
  const active = isOpen ? steps[index] : undefined;
  const path = pathname.replace(/\/+$/, "");
  const definitions = guideDefinitions(role, path);

  useLayoutEffect(() => {
    onOpenChange?.(isOpen);
    return () => { if (isOpen) onOpenChange?.(false); };
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!definitions) return;
    const update = () => {
      const next = currentContext(role, path, definitions);
      // First visit of a screen (or tab) that opts in: open its guide once, from step 1.
      const key = autoOpen && !next.popup && !next.inboxOpen && next.steps.length ? guideAutoOpenKey(role, path) : undefined;
      if (key && !guideSeen(key)) {
        markGuideSeen(key);
        setState(current => current.isOpen ? updateContext(current, next) : { ...next, isOpen: true, index: 0 });
        return;
      }
      setState(current => updateContext(current, next));
    };
    let frame: number | undefined;
    const observer = new MutationObserver(records => {
      if (frame !== undefined || records.every(record => record.target instanceof Element &&
        record.target.closest(".app-guide-panel, .app-guide-spotlight"))) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        update();
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "inert", "open", "aria-modal", "aria-current", "aria-expanded", "data-expanded", "data-monthly-preparation", "data-operator-review-tab", "disabled"],
    });
    update();
    return () => {
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [autoOpen, definitions, compact, path, role]);

  useEffect(() => {
    if (!definitions || role !== "learner" || path !== "/home") return;
    let frame = 0;
    const openHomeGuide = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next = currentContext(role, path, definitions);
        if (!next.popup && !next.inboxOpen && next.steps.length) setState({ ...next, isOpen: true, index: 0 });
      });
    };
    window.addEventListener(OPEN_LEARNER_HOME_GUIDE, openHomeGuide);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(OPEN_LEARNER_HOME_GUIDE, openHomeGuide);
    };
  }, [definitions, path, role]);

  const close = () => {
    setState(current => ({ ...current, isOpen: false, index: 0 }));
    trigger.current?.focus({ preventScroll: true });
  };
  const open = () => {
    if (isOpen) {
      close();
      return;
    }
    // Opening (or re-opening) the guide always starts from step 1; a prioritized step only jumps ahead
    // when its card appears while the guide is already open (see updateContext).
    if (!definitions) return;
    const current = currentContext(role, path, definitions);
    if (current.steps.length && !current.inboxOpen) setState({ ...current, isOpen: true, index: 0 });
  };
  const move = (direction: -1 | 1) => {
    setState(current => ({ ...current, index: Math.max(0, Math.min(current.index + direction, current.steps.length - 1)) }));
  };

  const activeTarget = active?.target;
  useLayoutEffect(() => {
    const restoreAll = () => {
      for (const opened of engineOpened.current.splice(0)) opened.restore();
    };
    if (!isOpen || !activeTarget) { restoreAll(); return; }
    restoreAll();
    // A step that points at a collapsed section (settings panel toggle, <details>) opens it while the step is shown.
    const engineClick = (button: HTMLElement) => {
      engineClicking.current = true;
      try { button.click(); } finally { engineClicking.current = false; }
    };
    const toggle = activeTarget.querySelector<HTMLElement>(':scope > button[aria-expanded="false"][aria-controls]');
    if (toggle) {
      engineClick(toggle);
      engineOpened.current.push({ restore: () => { if (toggle.isConnected && toggle.getAttribute("aria-expanded") === "true") engineClick(toggle); } });
    }
    const details = activeTarget instanceof HTMLDetailsElement ? activeTarget : activeTarget.querySelector<HTMLDetailsElement>(":scope > details");
    if (details && !details.open) {
      details.open = true;
      engineOpened.current.push({ restore: () => { if (details.isConnected) details.open = false; } });
    }
    if (!engineOpened.current.length) return;
    // The opened section grows: once it has rendered, align its top below the header.
    const frame = window.requestAnimationFrame(() => {
      engineScrollUntil.current = Date.now() + 1500;
      activeTarget.scrollIntoView?.({ block: "start", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTarget, isOpen]);
  useEffect(() => () => { for (const opened of engineOpened.current.splice(0)) opened.restore(); }, []);
  // Keeps the highlighted card readable above the fixed guide box: whenever its top is above the visible band
  // (scrolled past) or its top part sits under the box, the real scroll container is moved so the card's top lands
  // just below the app header. Works in both directions and re-runs once layout settles (fonts, async content).
  const openedAt = useRef(0);
  useLayoutEffect(() => { if (isOpen) openedAt.current = Date.now(); }, [isOpen]);
  useLayoutEffect(() => {
    if (!activeTarget) return;
    const reveal = (behavior: ScrollBehavior) => {
      if (!activeTarget.isConnected) return;
      const panel = closeButton.current?.closest(".app-guide-panel")?.getBoundingClientRect();
      if (!panel || !panel.height) return; // not laid out yet (or a test DOM without layout)
      // The app bar across the top (desktop also has a tall sidebar <header>; ignore it).
      const header = Array.from(document.querySelectorAll("#root > header"), element => element.getBoundingClientRect())
        .find(box => box.height > 0 && box.height < 160 && box.width > window.innerWidth / 2);
      let top = Math.max(compact ? 64 : 12, header && header.bottom > 0 && header.top <= 0 ? header.bottom + 8 : 0);
      let bottom = panel.top - 10;
      const scroller = guideScroller(activeTarget);
      // A bounded list box between the card and the page scroller (e.g. a request table) is scrolled first,
      // otherwise a row below its fold stays clipped and the step highlights nothing.
      for (let node = activeTarget.parentElement; node && node !== scroller && node !== document.body; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowY;
        if ((overflow !== "auto" && overflow !== "scroll") || node.scrollHeight <= node.clientHeight + 1) continue;
        const box = node.getBoundingClientRect();
        const inner = activeTarget.getBoundingClientRect();
        const shift = inner.top < box.top ? inner.top - box.top - 8 : inner.bottom > box.bottom ? Math.min(inner.bottom - box.bottom + 8, inner.top - box.top - 8) : 0;
        if (shift) {
          engineScrollUntil.current = Date.now() + 2000;
          node.scrollTop += shift;
        }
      }
      // Inside a popup the visible band is the popup's own scrolling body (below its sticky header), not the window:
      // aligning to the window top hid the card under the popup's edge.
      if (scroller !== document.scrollingElement && scroller !== document.documentElement && scroller.closest("[role=dialog], .dialog")) {
        const box = scroller.getBoundingClientRect();
        const sticky = Array.from(scroller.querySelectorAll<HTMLElement>(":scope > header, :scope > * > header"))
          .find(element => getComputedStyle(element).position === "sticky")?.getBoundingClientRect();
        top = Math.max(top, box.top + 8, sticky && sticky.height < 200 ? sticky.bottom + 8 : 0);
        bottom = Math.min(bottom, box.bottom - 8);
      }
      if (bottom - top < 80) return; // no usable band above the box (e.g. a very short window)
      const rect = activeTarget.getBoundingClientRect();
      const fits = rect.height <= bottom - top;
      // A card taller than the band is moved up whenever less than two thirds of the band shows it.
      const hidden = rect.top < top - 1 || (fits ? rect.bottom > bottom + 1 : rect.top > top + (bottom - top) / 3);
      if (!hidden) return;
      engineScrollUntil.current = Date.now() + 2000;
      // A card that fits is centred in the visible band (minimal movement, the cards around it stay in view);
      // only a card taller than the band is aligned to its top. Aligning every card to the top pushed short
      // cards near the page end up against the header with a large empty area below.
      const delta = fits ? rect.top - (top + (bottom - top - rect.height) / 2) : rect.top - top;
      if (typeof scroller.scrollBy === "function") scroller.scrollBy({ top: delta, behavior });
      else scroller.scrollTop += delta;
    };
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Right after opening, jump instantly (the page lock starts now); later step changes may glide.
    setPlaceTop(false);
    reveal(reducedMotion || Date.now() - openedAt.current < 400 ? "instant" : "smooth");
    const settle = window.setTimeout(() => {
      reveal("instant");
      const panel = closeButton.current?.closest(".app-guide-panel")?.getBoundingClientRect();
      const rect = activeTarget.isConnected ? activeTarget.getBoundingClientRect() : null;
      if (panel?.height && rect?.height && rect.top > panel.top - 24 && rect.top < window.innerHeight) setPlaceTop(true);
    }, 450);
    return () => window.clearTimeout(settle);
  }, [activeTarget, compact]);

  useEffect(() => {
    if (isOpen) closeButton.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const preventPageAction = (event: Event) => {
      if (engineClicking.current) return;
      if (!(event.target instanceof Element) ||
        event.target.closest(".app-guide-panel") || trigger.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    // The page is locked while the guide is open: only the engine scrolls (to bring the next card into view).
    const inPanel = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(".app-guide-panel"));
    const preventScroll = (event: Event) => {
      if (!inPanel(event.target)) event.preventDefault();
    };
    const root = document.scrollingElement ?? document.documentElement;
    // Phones and tablets scroll `#root > main`, desktop scrolls the document: lock both (and any other
    // container that scrolls) so programmatic scrolling cannot move the page while the guide is open.
    const locked = new Map<Element, { top: number; left: number }>();
    const remember = (element: Element | null | undefined) => {
      if (element && !locked.has(element)) locked.set(element, { top: element.scrollTop, left: element.scrollLeft });
    };
    remember(root);
    remember(document.querySelector("#root > main"));
    const keepScroll = (event: Event) => {
      const element = event.target === document ? root : event.target instanceof Element ? event.target : null;
      if (!element || element.closest(".app-guide-panel")) return;
      if (Date.now() < engineScrollUntil.current) {
        locked.set(element, { top: element.scrollTop, left: element.scrollLeft });
        return;
      }
      const position = locked.get(element);
      if (!position) return;
      if (element.scrollTop !== position.top) element.scrollTop = position.top;
      if (element.scrollLeft !== position.left) element.scrollLeft = position.left;
    };
    const onGuideKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const activatesButton = (event.key === " " || event.key === "Enter") && inPanel(event.target);
      if (SCROLL_KEYS.has(event.key) && !activatesButton) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key === "Tab") {
        const panel = closeButton.current?.closest(".app-guide-panel");
        const buttons = Array.from(panel?.querySelectorAll<HTMLButtonElement>("button:enabled") ?? []);
        if (!buttons.length) return;
        const current = buttons.findIndex(button => button === document.activeElement);
        const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
          : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        event.preventDefault();
        event.stopPropagation();
        buttons[next]?.focus({ preventScroll: true });
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setState(current => ({ ...current, isOpen: false, index: 0 }));
      trigger.current?.focus({ preventScroll: true });
    };
    const blocking = { capture: true, passive: false } as const;
    document.addEventListener("wheel", preventScroll, blocking);
    document.addEventListener("touchmove", preventScroll, blocking);
    window.addEventListener("scroll", keepScroll, true);
    document.addEventListener("click", preventPageAction, true);
    document.addEventListener("auxclick", preventPageAction, true);
    document.addEventListener("submit", preventPageAction, true);
    document.addEventListener("keydown", onGuideKey, true);
    return () => {
      document.removeEventListener("wheel", preventScroll, blocking);
      document.removeEventListener("touchmove", preventScroll, blocking);
      window.removeEventListener("scroll", keepScroll, true);
      document.removeEventListener("click", preventPageAction, true);
      document.removeEventListener("auxclick", preventPageAction, true);
      document.removeEventListener("submit", preventPageAction, true);
      document.removeEventListener("keydown", onGuideKey, true);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!activeTarget) return;
    const sync = () => setSpotlight(getSpotlight(activeTarget));
    let frame: number | undefined;
    const schedule = () => {
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        sync();
      });
    };
    sync();
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    resize?.observe(activeTarget);
    resize?.observe(document.body);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      resize?.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [activeTarget]);

  const helpHost = popup ? popupGuideHost(popup) : null;
  useLayoutEffect(() => {
    if (!helpHost || helpHost === popup || !definitions || !steps.length) return;
    const isHeader = helpHost.matches("header, .assessment-bank-header, .operator-level-form-dialog-header") || Boolean(helpHost.querySelector(":scope > h2, :scope > h3, :scope > .operator-level-form-dialog-title"));
    const name = isHeader ? "app-guide-help-header" : "app-guide-help-actions";
    const existed = helpHost.classList.contains(name);
    helpHost.classList.add(name);
    return () => { if (!existed) helpHost.classList.remove(name); };
  }, [helpHost, popup, definitions, steps.length]);
  if (!definitions || !steps.length) return null;

  const helpButton = <button ref={trigger} className={`btn-sm ${popup ? "app-guide-popup-trigger" : "btn-ghost"} app-guide-trigger`} type="button"
      aria-label="Hướng dẫn sử dụng" title="Hướng dẫn sử dụng" aria-haspopup="dialog" disabled={inboxOpen}
      aria-expanded={isOpen} aria-controls={isOpen ? dialogId : undefined} onClick={open}>
      <CircleHelp size={18} strokeWidth={1.7} aria-hidden="true" />
    </button>;
  return <>
    {helpHost ? createPortal(helpButton, helpHost) : helpButton}
    {isOpen && createPortal(<>
      <div className="app-guide-blocker" data-popup={Boolean(popup) || undefined} aria-hidden="true" />
      {active && spotlight && <div className="app-guide-spotlight" style={spotlight} aria-hidden="true" />}
      <section id={dialogId} role="dialog" aria-labelledby={`${dialogId}-label`} className="app-guide-panel"
        data-compact={compact || undefined} data-popup={Boolean(popup) || undefined} data-place={placeTop ? "top" : undefined}>
        <div className="app-guide-header">
          <span id={`${dialogId}-label`} className="app-guide-title">Hướng dẫn sử dụng</span>
          <div className="app-guide-header-controls">
            {steps.length > 0 && <span className="app-guide-count" aria-label={`Bước ${index + 1} trên ${steps.length}`}>{index + 1} / {steps.length}</span>}
            <button ref={closeButton} className="btn-sm btn-ghost app-guide-close" type="button" aria-label="Đóng hướng dẫn" onClick={close}>
              <X size={19} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="app-guide-copy" aria-live="polite" aria-atomic="true">
          {active && <><h2>{active.title}</h2><p>{guideText(active.text)}</p></>}
        </div>
        <footer className="app-guide-actions">
          {steps.length > 1 && <button type="button" className="btn-sm" disabled={index === 0} onClick={() => move(-1)}>
            <ChevronLeft size={16} aria-hidden="true" /> Trước
          </button>}
          <button type="button" className="btn-sm btn-primary" onClick={() => index + 1 < steps.length ? move(1) : close()}>
            {index + 1 < steps.length ? <>Tiếp theo <ChevronRight size={16} aria-hidden="true" /></> : "Đã hiểu"}
          </button>
        </footer>
      </section>
    </>, document.body)}
  </>;
}
