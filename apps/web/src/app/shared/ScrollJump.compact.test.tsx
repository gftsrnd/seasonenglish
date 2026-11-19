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

it("on phones and tablets keeps the up arrow at the end of the page (owner 19/11)", () => {
  const page = stub(true);
  render(<Page />);
  page.notify(true, false);
  expect(screen.getByRole("button", { name: "Cuộn xuống cuối trang" })).toBeInTheDocument();
  page.notify(false, false);
  expect(screen.getByRole("button", { name: "Cuộn lên đầu trang" })).toBeInTheDocument();
  page.notify(false, true);
  expect(screen.getByRole("button", { name: "Cuộn lên đầu trang" })).toBeInTheDocument();
});

it("on desktop keeps the up arrow at the end of the page", () => {
  const page = stub(false);
  render(<Page />);
  page.notify(false, true);
  expect(screen.getByRole("button", { name: "Cuộn lên đầu trang" })).toBeInTheDocument();
});
