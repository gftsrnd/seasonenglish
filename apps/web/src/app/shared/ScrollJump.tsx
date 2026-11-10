import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown } from "lucide-react";

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

  return { start, end, jump, atTop: edges.top, visible: !edges.top || !edges.bottom };
}

export function ScrollJumpButton({ atTop, onClick, inExam = false, style }: {
  atTop: boolean;
  onClick: () => void;
  inExam?: boolean;
  style?: CSSProperties | undefined;
}) {
  const label = `Cuộn ${atTop ? "xuống cuối" : "lên đầu"} ${inExam ? "đề thi" : "trang"}`;
  const button = <button
    className={`app-scroll-jump no-print${inExam ? " app-scroll-jump--exam" : ""}`}
    type="button"
    data-direction={atTop ? "down" : "up"}
    aria-label={label}
    title={label}
    style={style}
    onClick={onClick}
  >
    <ArrowDown size={20} aria-hidden="true" />
  </button>;
  return inExam ? <div className="exam-scroll-jump-dock">{button}</div> : button;
}
