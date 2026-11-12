// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedLessonPartContent } from "../../learner/Learning.js";
import { learnerLessonCopy } from "./language.js";

afterEach(cleanup);

const renderCard = (cefr: "A2" | "B2", item: Record<string, unknown>, speak = vi.fn()) => {
  const language = cefr === "A2" ? "vi" : "en";
  render(<div className="lesson-page"><SharedLessonPartContent cefr={cefr} language={language} copy={learnerLessonCopy[language]} grammarAvailable sectionNumber={1}
    part={{ code: "vocabulary", title: "Vocabulary", content: { items: [{ word: "help", meaning: "giúp đỡ", ...item }] } } as any}
    speak={speak} openVocabularyModal={vi.fn()} /><button type="button">outside</button></div>);
  return speak;
};

describe("synonym/antonym chip meaning (12/11)", () => {
  it("A1–A2: the word part still plays the word; the icon opens the Vietnamese meaning, never spoken", () => {
    const speak = renderCard("A2", { synonyms: [{ word: "assist", note: "hỗ trợ" }], antonyms: [{ word: "hinder", note: "cản trở" }] });
    fireEvent.click(screen.getByRole("button", { name: "Nghe từ đồng nghĩa: assist" }));
    expect(speak).toHaveBeenCalledWith("assist");
    const icons = screen.getAllByRole("button", { name: "Xem nghĩa" });
    expect(icons).toHaveLength(2);
    expect(screen.getByText("hỗ trợ")).not.toBeVisible();
    fireEvent.click(icons[0]!);
    expect(screen.getByText("hỗ trợ")).toBeVisible();
    expect(screen.getByText("hỗ trợ")).toHaveAttribute("lang", "vi");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("hỗ trợ")).not.toBeVisible();
    fireEvent.click(icons[1]!);
    fireEvent.pointerDown(screen.getByRole("button", { name: "outside" }));
    expect(screen.getByText("cản trở")).not.toBeVisible();
    for (const call of speak.mock.calls) expect(call[0]).not.toMatch(/hỗ trợ|cản trở/u);
  });

  it("B1–C1: the icon shows the English definition and never a Vietnamese note", () => {
    renderCard("B2", { synonyms: [{ word: "assist", definition: "help someone do something" }], antonyms: [{ word: "hinder", note: "cản trở" }] });
    const icons = screen.getAllByRole("button", { name: "View meaning" });
    expect(icons).toHaveLength(1);
    fireEvent.click(icons[0]!);
    expect(screen.getByText("help someone do something")).toBeVisible();
    expect(screen.getByText("help someone do something")).toHaveAttribute("lang", "en");
    expect(screen.queryByText("cản trở")).not.toBeInTheDocument();
  });

  it("old content without a meaning keeps the plain chip", () => {
    const { container } = render(<div />);
    renderCard("A2", { synonyms: [{ word: "assist" }] });
    expect(screen.getByRole("button", { name: "Nghe từ đồng nghĩa: assist" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem nghĩa" })).not.toBeInTheDocument();
    expect(container.ownerDocument.querySelector(".lesson-example-wrap--chip")).toBeNull();
  });
});
