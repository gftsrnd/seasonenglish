// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Eye } from "lucide-react";
import { afterEach, expect, it, vi } from "vitest";
import { ActionLabel, Description } from "./CompactUi.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const media = (width: number) => vi.stubGlobal("matchMedia", (query: string) => {
  const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
  return { matches: width <= max, media: query, addEventListener: () => {}, removeEventListener: () => {} };
});

it("shows an icon button with the label as name and tooltip on phones, the text on desktop", () => {
  media(390);
  const { unmount } = render(<button type="button"><ActionLabel icon={Eye} label="Xem" /></button>);
  expect(screen.getByRole("button", { name: "Xem" })).toBeInTheDocument();
  expect(screen.getByTitle("Xem")).toHaveClass("action-icon-only");
  unmount();
  media(1280);
  render(<button type="button"><ActionLabel icon={Eye} label="Xem" /></button>);
  expect(screen.getByRole("button", { name: "Xem" })).toHaveTextContent("Xem");
  expect(screen.queryByTitle("Xem")).not.toBeInTheDocument();
});

it("keeps the full description on desktop and the short one on phones", () => {
  media(1280);
  const { unmount } = render(<Description text="Một câu mô tả dài." short="Ngắn." />);
  expect(screen.getByText("Một câu mô tả dài.")).toBeInTheDocument();
  unmount();
  media(390);
  render(<Description text="Một câu mô tả dài." short="Ngắn." />);
  expect(screen.getByText("Ngắn.")).toBeInTheDocument();
  expect(screen.queryByText("Một câu mô tả dài.")).not.toBeInTheDocument();
});
