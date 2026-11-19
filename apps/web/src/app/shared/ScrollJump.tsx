import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { dodgeTop } from "./scroll-jump-dodge.js";
import { ArrowDown } from "lucide-react";

/** Phone and tablet widths, or any touch-first screen. */
export const COMPACT_SCROLL_JUMP_QUERY = "(max-width: 1024px), (pointer: coarse)";

export function useScrollJump(contained = false) {
  const start = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: true, bottom: true });

  useEffect(() => {
    const first = start.current;
    const last = end.current;
    if (!first || !last || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      setEdges(previous => ({
        top: entries.find(entry => entry.target === first)?.isIntersecting ?? previous.top,
        bottom: entries.find(entry => entry.target === last)?.isIntersecting ?? previous.bottom
      }));
    });
    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, []);

  const jump = () => {
    const region = start.current?.parentElement;
    const scrollsWithinRegion = region && region.scrollHeight > region.clientHeight
      && /^(auto|scroll|overlay)$/.test(getComputedStyle(region).overflowY);
    const target = contained || scrollsWithinRegion ? region : document.scrollingElement;
    target?.scrollTo({
      top: edges.top ? target.scrollHeight : 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"
    });
  };

  // Every width keeps the up arrow at the end of a long page (owner 19/11: phones lost the way back up).
  // The button steps past controls under it (dodgeTop) and hides only when no free spot is left.
  return { start, end, jump, atTop: edges.top, visible: !edges.top || !edges.bottom };
}

export function ScrollJumpButton({ atTop, onClick, inExam = false, style }: {
  atTop: boolean;
  onClick: () => void;
  inExam?: boolean;
  style?: CSSProperties | undefined;
}) {
  const label = `Cuộn ${atTop ? "xuống cuối" : "lên đầu"} ${inExam ? "đề thi" : "trang"}`;
  const ref = useRef<HTMLButtonElement>(null);
  const [lift, setLift] = useState<number | null>(0);
  // Page button (not the exam dock): steps up past any control under it, or
  // hides while no free spot is left, so it never covers row actions.
  useLayoutEffect(() => {
    if (inExam || typeof window === "undefined") return undefined;
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const button = ref.current; if (!button) return;
        const box = button.getBoundingClientRect(); if (!box.width) return;
        const base = box.top - (Number(button.dataset.lift) || 0);
        const main = document.querySelector("main") ?? document.body;
        const top = dodgeTop(main, box.left, base, box.height, window.innerHeight * 0.45, button);
        const next = top === null ? null : Math.round(top - base);
        button.dataset.lift = String(next ?? 0);
        setLift(next);
      });
    };
    place();
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [inExam, atTop]);
  // Phones/tablets (owner 19/11): the button never jumps up the screen – it keeps its corner and
  // fades out while a control is under it. Desktop still steps past controls.
  const compactCorner = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(COMPACT_SCROLL_JUMP_QUERY).matches;
  const placed: CSSProperties | undefined = inExam || lift === 0 ? style
    : compactCorner ? { ...style, opacity: 0, pointerEvents: "none" }
    : { ...style, ...(lift === null ? { visibility: "hidden" } : { transform: `translateY(${lift}px)` }) };
  const button = <button
    ref={ref}
    className={`app-scroll-jump no-print${inExam ? " app-scroll-jump--exam" : ""}`}
    type="button"
    data-direction={atTop ? "down" : "up"}
    aria-label={label}
    title={label}
    style={placed}
    onClick={onClick}
  >
    <ArrowDown size={20} aria-hidden="true" />
  </button>;
  return inExam ? <div className="exam-scroll-jump-dock">{button}</div> : button;
}
