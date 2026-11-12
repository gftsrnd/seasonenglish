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

  it("B1–C1: no meaning popup at all; the chip only plays the word", () => {
    renderCard("B2", { synonyms: [{ word: "assist", definition: "help someone do something" }], antonyms: [{ word: "hinder", note: "cản trở" }] });
    expect(screen.queryByRole("button", { name: "View meaning" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem nghĩa" })).not.toBeInTheDocument();
    expect(screen.queryByText("help someone do something")).not.toBeInTheDocument();
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

describe("collocation translation (12/11)", () => {
  const collocations = ["meet the manager", "our manager", "a project manager"];
  it("A1–A2: each phrase chip carries the translate icon inside it; the phrase still plays, the icon opens the Vietnamese meaning", () => {
    const speak = renderCard("A2", { collocations, collocationTranslations: ["gặp quản lý", "quản lý của chúng tôi", "một quản lý dự án"] });
    fireEvent.click(screen.getByRole("button", { name: "Nghe cụm từ: meet the manager" }));
    expect(speak).toHaveBeenCalledWith("meet the manager");
    const icon = screen.getByRole("button", { name: "Xem nghĩa: our manager" });
    expect(icon.parentElement).toHaveClass("lesson-example-wrap", "lesson-example-wrap--phrase");
    expect(icon.parentElement?.firstElementChild).toHaveAccessibleName("Nghe cụm từ: our manager");
    expect(screen.getByText("quản lý của chúng tôi")).not.toBeVisible();
    fireEvent.click(icon);
    expect(screen.getByText("quản lý của chúng tôi")).toBeVisible();
    expect(screen.getByText("quản lý của chúng tôi")).toHaveAttribute("lang", "vi");
    expect(speak).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("quản lý của chúng tôi")).not.toBeVisible();
  });

  it("B1+ and old content without translations keep the plain phrase buttons", () => {
    renderCard("B2", { collocations, collocationTranslations: ["gặp quản lý", "quản lý của chúng tôi", "một quản lý dự án"] });
    expect(screen.queryByRole("button", { name: /^View meaning|^Xem nghĩa/ })).not.toBeInTheDocument();
    cleanup();
    renderCard("A2", { collocations });
    expect(screen.getAllByRole("button", { name: /^Nghe cụm từ/ })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /^Xem nghĩa/ })).not.toBeInTheDocument();
  });
});
