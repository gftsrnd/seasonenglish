// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { COMPACT_SCROLL_JUMP_QUERY, ScrollJumpButton, useScrollJump } from "./ScrollJump.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Page() {
  const scroll = useScrollJump();
  return <main><div ref={scroll.start} /><p>Nội dung</p><div ref={scroll.end} />{scroll.visible && <ScrollJumpButton atTop={scroll.atTop} onClick={scroll.jump} />}</main>;
}

function stub(compact: boolean) {
  const edges: Element[] = [];
  let notify!: (entries: { target: Element; isIntersecting: boolean }[]) => void;
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof notify) { notify = callback; }
    observe = (edge: Element) => { edges.push(edge); };
    disconnect = vi.fn();
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: compact && query === COMPACT_SCROLL_JUMP_QUERY, media: query }));
  return { edges, notify: (top: boolean, bottom: boolean) => act(() => notify([{ target: edges[0]!, isIntersecting: top }, { target: edges[1]!, isIntersecting: bottom }])) };
}

/** Puts the page at `ratio` of its scrollable height and fires a scroll event. */
function scrollTo(ratio: number) {
  const root = document.documentElement;
  Object.defineProperty(root, "scrollHeight", { configurable: true, value: 2000 });
  Object.defineProperty(root, "clientHeight", { configurable: true, value: 800 });
  Object.defineProperty(root, "scrollTop", { configurable: true, value: 1200 * ratio });
  act(() => { document.dispatchEvent(new Event("scroll")); });
}

it("points down before half way and up from half way, on phones and tablets (owner 19/11)", () => {
  const page = stub(true);
  render(<Page />);
  page.notify(true, false);
  scrollTo(0.2);
  expect(screen.getByRole("button", { name: "Cuộn xuống cuối trang" })).toBeInTheDocument();
  page.notify(false, false);
  scrollTo(0.6);
  expect(screen.getByRole("button", { name: "Cuộn lên đầu trang" })).toBeInTheDocument();
  page.notify(false, true);
  scrollTo(1);
  expect(screen.getByRole("button", { name: "Cuộn lên đầu trang" })).toBeInTheDocument();
});

it("works the same on desktop", () => {
  const page = stub(false);
  render(<Page />);
  page.notify(false, true);
  scrollTo(0.9);
  expect(screen.getByRole("button", { name: "Cuộn lên đầu trang" })).toBeInTheDocument();
  scrollTo(0.1);
  expect(screen.getByRole("button", { name: "Cuộn xuống cuối trang" })).toBeInTheDocument();
});
