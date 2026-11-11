import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CircleHelp, X } from "lucide-react";
import "./app-guide.css";

import { guideDefinitions, guidePopupDefinitions, type GuideRole, type GuideStep } from "./app-guide-steps.js";

type ActiveStep = { selector: string; target: HTMLElement; title: string; text: string; prioritize?: true };
type Spotlight = { top: number; left: number; width: number; height: number };
type GuideContext = { popup: HTMLElement | null; steps: ActiveStep[]; inboxOpen?: boolean };
type GuideState = GuideContext & { isOpen: boolean; index: number };

function isVisible(node: HTMLElement) {
  if (node.closest("[hidden], [inert]") || !node.getClientRects().length || getComputedStyle(node).visibility !== "visible") return false;
  for (let parent = node.parentElement?.closest("details:not([open])"); parent; parent = parent.parentElement?.closest("details:not([open])")) {
    if (!parent.querySelector(":scope > summary")?.contains(node)) return false;
  }
  return true;
}

function findSteps(definitions: readonly GuideStep[], scope: ParentNode): ActiveStep[] {
  return definitions.flatMap(([selector, title, text, prioritize]) => {
    const target = Array.from(scope.querySelectorAll<HTMLElement>(selector)).find(isVisible);
    return target ? [{ selector, target, title, text, ...(prioritize ? { prioritize } : {}) }] : [];
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

function getSpotlight(target: HTMLElement): Spotlight | null {
  if (!target.isConnected || !target.getClientRects().length) return null;
  const rect = target.getBoundingClientRect();
  const padding = 10;
  const left = Math.max(rect.left - padding, 0);
  const top = Math.max(rect.top - padding, 0);
  const width = Math.min(rect.right + padding, document.documentElement.clientWidth || window.innerWidth) - left;
  const height = Math.min(rect.bottom + padding, window.innerHeight) - top;
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}

export function AppGuide({ role, pathname, compact }: { role: GuideRole; pathname: string; compact: boolean }) {
  const dialogId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pointerPosition = useRef<{ x: number; y: number }>(null);
  const [state, setState] = useState<GuideState>({ isOpen: false, index: 0, steps: [], popup: null });
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const { isOpen, index, steps, popup, inboxOpen } = state;
  const active = isOpen ? steps[index] : undefined;
  const path = pathname.replace(/\/+$/, "");
  const definitions = guideDefinitions(role, path);

  useEffect(() => {
    if (!definitions) return;
    const update = () => {
      const next = currentContext(role, path, definitions);
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
      attributeFilter: ["hidden", "inert", "open", "aria-modal", "aria-current", "aria-expanded", "data-expanded", "data-monthly-preparation", "disabled"],
    });
    update();
    return () => {
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [definitions, compact, path, role]);

  const close = () => {
    setState(current => ({ ...current, isOpen: false }));
    trigger.current?.focus({ preventScroll: true });
  };
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    if (isOpen) {
      close();
      return;
    }
    pointerPosition.current = event.detail ? { x: event.clientX, y: event.clientY } : null;
    const first = Math.max(0, steps.findIndex(step => step.prioritize));
    setState(current => ({ ...current, isOpen: true, index: first }));
  };
  const move = (direction: -1 | 1, event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail) pointerPosition.current = { x: event.clientX, y: event.clientY };
    setState(current => ({ ...current, index: Math.max(0, Math.min(current.index + direction, current.steps.length - 1)) }));
  };

  const activeTarget = active?.target;
  useLayoutEffect(() => {
    if (!activeTarget) return;
    const rect = activeTarget.getBoundingClientRect();
    const panel = closeButton.current?.closest(".app-guide-panel")?.getBoundingClientRect();
    if (panel && (rect.top < (compact ? 64 : 12) || rect.bottom > panel.top - 10)) {
      activeTarget.scrollIntoView?.({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }, [activeTarget, compact]);

  useEffect(() => {
    if (isOpen) closeButton.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const preventPageAction = (event: Event) => {
      if (!(event.target instanceof Element) ||
        event.target.closest(".app-guide-panel") || trigger.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onTarget = (event: Event) => {
      if (event.type === "pointermove") {
        const { clientX, clientY, pointerType } = event as PointerEvent;
        if (pointerType === "touch") return;
        const previous = pointerPosition.current;
        if (previous?.x === clientX && previous?.y === clientY) return;
        pointerPosition.current = { x: clientX, y: clientY };
      }
      if (!(event.target instanceof Node)) return;
      const node = event.target;
      setState(current => {
        const match = current.steps.reduce((best, step, index) =>
          step.target.contains(node) && (best < 0 || current.steps[best]!.target.contains(step.target)) ? index : best, -1);
        return match < 0 || current.index === match ? current : { ...current, index: match };
      });
    };
    const onGuideKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
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
      setState(current => ({ ...current, isOpen: false }));
      trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointermove", onTarget);
    document.addEventListener("focusin", onTarget);
    document.addEventListener("click", preventPageAction, true);
    document.addEventListener("auxclick", preventPageAction, true);
    document.addEventListener("submit", preventPageAction, true);
    document.addEventListener("keydown", onGuideKey, true);
    return () => {
      document.removeEventListener("pointermove", onTarget);
      document.removeEventListener("focusin", onTarget);
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

  if (!definitions || !steps.length) return null;

  const helpButton = <button ref={trigger} className={`btn-sm ${popup ? "app-guide-popup-trigger" : "btn-ghost"} app-guide-trigger`} type="button"
      aria-label="Hướng dẫn sử dụng" title="Hướng dẫn sử dụng" aria-haspopup="dialog" disabled={inboxOpen}
      aria-expanded={isOpen} aria-controls={isOpen ? dialogId : undefined} onClick={open}>
      <CircleHelp size={18} strokeWidth={1.7} aria-hidden="true" />
    </button>;
  return <>
    {popup ? createPortal(helpButton, popup.querySelector(":scope > header") ?? popup) : helpButton}
    {isOpen && createPortal(<>
      {active && spotlight && <div className="app-guide-spotlight" style={spotlight} aria-hidden="true" />}
      <section id={dialogId} role="dialog" aria-labelledby={`${dialogId}-label`} className="app-guide-panel"
        data-compact={compact || undefined} data-popup={Boolean(popup) || undefined}>
        <header className="app-guide-header">
          <span id={`${dialogId}-label`}>Hướng dẫn sử dụng</span>
          {steps.length > 0 && <span className="app-guide-count" aria-label={`Bước ${index + 1} trên ${steps.length}`}>{index + 1} / {steps.length}</span>}
          <button ref={closeButton} className="btn-sm btn-ghost app-guide-close" type="button" aria-label="Đóng hướng dẫn" onClick={close}>
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="app-guide-copy" aria-live="polite" aria-atomic="true">
          {active && <><h2>{active.title}</h2><p>{active.text}</p></>}
        </div>
        <footer className="app-guide-actions">
          {steps.length > 1 && <button type="button" className="btn-sm" disabled={index === 0} onClick={event => move(-1, event)}>
            <ChevronLeft size={16} aria-hidden="true" /> Trước
          </button>}
          <button type="button" className="btn-sm btn-primary" onClick={event => index + 1 < steps.length ? move(1, event) : close()}>
            {index + 1 < steps.length ? <>Tiếp theo <ChevronRight size={16} aria-hidden="true" /></> : "Đã hiểu"}
          </button>
        </footer>
      </section>
    </>, document.body)}
  </>;
}
