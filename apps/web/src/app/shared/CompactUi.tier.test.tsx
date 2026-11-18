// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Pencil } from "lucide-react";
import { afterEach, expect, it, vi } from "vitest";
import { ActionLabel, Description, InfoTitle } from "./CompactUi.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Evaluates (min-width: Npx) and (max-width: Npx) parts against a viewport width.
const media = (width: number) => vi.stubGlobal("matchMedia", (query: string) => {
  const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
  const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity);
  return { matches: width >= min && width <= max, media: query, addEventListener: () => {}, removeEventListener: () => {} };
});

const View = () => <>
  <button type="button"><ActionLabel icon={Pencil} label="Sửa" /></button>
  <InfoTitle title="Đang học" tip="Giải thích dài" />
  <Description text="Mô tả đầy đủ của mục" short="Mô tả ngắn" />
</>;

it("phone (≤ 600px): icon-only action, ⓘ title, short description", () => {
  media(390);
  const { container } = render(<View />);
  expect(container.querySelector(".action-icon-only")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Đang học: giải thích" })).toBeInTheDocument();
  expect(screen.getByText("Mô tả ngắn")).toBeInTheDocument();
});

it("tablet (601–1024px): icon + text action, ⓘ title, one-line description", () => {
  for (const width of [768, 1024]) {
    media(width);
    const { container, unmount } = render(<View />);
    expect(container.querySelector(".action-icon-only")).not.toBeInTheDocument();
    expect(container.querySelector(".action-icon-text")).toHaveTextContent("Sửa");
    expect(screen.getByRole("button", { name: "Đang học: giải thích" })).toBeInTheDocument();
    expect(screen.getByText("Mô tả ngắn")).toHaveClass("tier-one-line");
    unmount();
  }
});

it("desktop (≥ 1025px): plain text action, plain title, full description", () => {
  media(1280);
  const { container } = render(<View />);
  expect(screen.getByRole("button", { name: "Sửa" })).toHaveTextContent("Sửa");
  expect(container.querySelector(".action-icon-text, .action-icon-only, .info-tip")).not.toBeInTheDocument();
  expect(screen.getByText("Mô tả đầy đủ của mục")).not.toHaveClass("tier-one-line");
});
