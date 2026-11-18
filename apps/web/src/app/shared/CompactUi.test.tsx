// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Eye } from "lucide-react";
import { afterEach, expect, it, vi } from "vitest";
import { ActionLabel, Description, InfoTitle, SectionTip } from "./CompactUi.js";

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

it("keeps the complete compact title as the heading name and gives the tip its own name", () => {
  media(375);
  const title = "Tiêu đề đầy đủ với nội dung dài";
  render(<InfoTitle title={title} tip="Nội dung giải thích" label="Mở giải thích" />);
  expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mở giải thích" })).toBeInTheDocument();
});

it("keeps an explicitly supplied section heading name when adding its help button", () => {
  media(440);
  render(<h3 aria-label="Bài thi tháng theo mức"><span>Tháng 11</span><SectionTip label="Giải thích bài thi" text="Chọn mức để xem đề." /></h3>);
  expect(screen.getByRole("heading", { name: "Bài thi tháng theo mức" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Giải thích bài thi" })).toBeInTheDocument();
});
