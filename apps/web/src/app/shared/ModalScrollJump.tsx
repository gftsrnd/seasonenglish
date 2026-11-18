import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown } from "lucide-react";
import { useCompactUi } from "./CompactUi.js";
import { dodgeTop } from "./scroll-jump-dodge.js";

/** The round button's box (.app-scroll-jump) and its inset from the popup edge. */
const SIZE = 44;
const INSET = 12;

/** Where a popup's content scrolls: its body, its feed, or the popup itself. */
const SCROLLER_SELECTORS = [".operator-level-form-dialog-body", ".inbox-feed"];

type Target = { key: string; scroller: HTMLElement; top: number; left: number; atTop: boolean };

function findTargets(): Target[] {
  const dialogs = [...document.querySelectorAll<HTMLElement>(".modal-backdrop > .dialog, .modal-backdrop > [role=dialog], .inbox-backdrop > .dialog, .monthly-resource-panel")];
  return dialogs.flatMap((dialog, index) => {
    const candidates = [...SCROLLER_SELECTORS.map((selector) => dialog.querySelector<HTMLElement>(selector)).filter((node): node is HTMLElement => Boolean(node)), dialog];
    const scroller = candidates.find((node) => node.scrollHeight > node.clientHeight + 24 && /auto|scroll/.test(getComputedStyle(node).overflowY));
    if (!scroller) return [];
    const rect = dialog.getBoundingClientRect();
    if (!rect.width || !rect.height) return [];
    const footer = pinnedFooterHeight(dialog, rect);
    // Never on a control: step up past any button/field under the default spot (bottom-right, above a pinned footer).
    const left = Math.round(rect.right - INSET - SIZE);
    const top = dodgeTop(dialog, left, Math.round(rect.bottom - footer - INSET - SIZE), SIZE, rect.top + rect.height * 0.35);
    if (top === null) return [];
    return [{ key: `${index}-${dialog.className}`, scroller, top: Math.round(top), left, atTop: scroller.scrollTop < 8 }];
  });
}

/**
 * Height of the bar pinned to the popup's bottom edge (pager, sticky action
 * footer such as "Huỷ / Kiểm tra & lưu"), so the button sits above it instead
 * of covering its buttons.
 */
function pinnedFooterHeight(dialog: HTMLElement, rect: DOMRect): number {
  let top = rect.bottom;
  for (const node of dialog.querySelectorAll<HTMLElement>(".list-pager, footer, [class*='actions'], [class*='footer']")) {
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height || box.bottom < rect.bottom - 40 || box.top > rect.bottom) continue;
    const pinned = node.matches(".list-pager") || /sticky|fixed/.test(getComputedStyle(node).position);
    if (pinned) top = Math.min(top, box.top);
  }
  return Math.max(0, rect.bottom - top);
}

/**
 * Phones/tablets: every popup whose content scrolls gets the same floating
 * up/down button at the bottom-right of the popup (above a pager footer).
 * Popups that fit show none. Mounted once by App.
 */
export function ModalScrollJump() {
  const compact = useCompactUi();
  const [targets, setTargets] = useState<Target[]>([]);
  useEffect(() => {
    if (!compact) { setTargets([]); return undefined; }
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setTargets(findTargets())); };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "open", "aria-expanded"] });
    document.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    update();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [compact]);
  if (!compact || !targets.length || typeof document === "undefined") return null;
  return createPortal(<>{targets.map((target) => {
    const label = target.atTop ? "Cuộn xuống cuối" : "Cuộn lên đầu";
    return <button
      key={target.key}
      type="button"
      className="app-scroll-jump modal-scroll-jump no-print"
      data-direction={target.atTop ? "down" : "up"}
      aria-label={label}
      title={label}
      style={{ top: target.top, left: target.left }}
      onClick={() => target.scroller.scrollTo({ top: target.atTop ? target.scroller.scrollHeight : 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
    ><ArrowDown size={20} aria-hidden="true" /></button>;
  })}</>, document.body);
}
