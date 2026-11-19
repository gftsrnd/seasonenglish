import { useEffect, type RefObject } from "react";

/** Tab bars whose clicks swap the content below them (by route or in place). */
const TAB_BAR = '[role="tablist"], .request-tabs, .manager-operation-tabs, .tabs';

/**
 * Owner 19/11: switching a tab made every screen jump back to the top – the old content went away
 * before the new one loaded, the page shrank to one screen and the browser reset the scroll.
 * On a tab click the content area keeps its current height (so the scroll position stays) until
 * the new content is at least as tall, or 1.5 s pass. Works for route tabs and in-page tabs.
 */
export function useStableTabSwitch(main: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let release: (() => void) | null = null;
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const element = main.current;
      if (!target || !element || !target.closest(TAB_BAR) || !element.contains(target)) return;
      release?.();
      const height = element.getBoundingClientRect().height;
      element.style.minHeight = `${height}px`;
      let done = false;
      const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => {
        const content = [...element.children].reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
        if (content >= height - 4) release?.();
      });
      const timer = window.setTimeout(() => release?.(), 1500);
      release = () => { if (done) return; done = true; element.style.minHeight = ""; observer?.disconnect(); window.clearTimeout(timer); release = null; };
      // children change after React renders the new tab; watch them on the next frames
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => { if (!done) [...element.children].forEach((child) => observer?.observe(child)); }));
    };
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("click", onClick, true); release?.(); };
  }, [main]);
}
