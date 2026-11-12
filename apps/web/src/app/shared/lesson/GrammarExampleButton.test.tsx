// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GrammarExampleButton } from "./GrammarExampleButton.js";
import { SharedLessonPartContent } from "../../learner/Learning.js";
import { learnerLessonCopy } from "./language.js";

afterEach(cleanup);

const example = (translation?: string, onPlay = vi.fn()) => render(<div>
  <GrammarExampleButton text="I have sent the report." spoken="I have sent the report." translation={translation} listenLabel="Nghe câu ví dụ" onPlay={onPlay} />
  <button type="button">outside</button>
</div>);

it("tapping the card plays the English audio only and never opens the translation", () => {
  const onPlay = vi.fn();
  example("Tôi đã gửi báo cáo.", onPlay);
  fireEvent.click(screen.getByRole("button", { name: "Nghe câu ví dụ: I have sent the report." }));
  expect(onPlay).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
});

it("the translate icon inside the card toggles the popup without playing audio; outside tap and Esc close it", () => {
  const onPlay = vi.fn();
  const { container } = example("Tôi đã gửi báo cáo.", onPlay);
  const icon = screen.getByRole("button", { name: "Xem nghĩa tiếng Việt" });
  const tooltip = screen.getByRole("tooltip", { hidden: true });
  // A sibling of the card button inside the card wrapper: never a nested button.
  expect(icon.closest(".lesson-example-card")).toBeNull();
  expect(icon.parentElement).toBe(container.querySelector(".lesson-example-wrap"));
  expect(icon).toHaveAccessibleDescription("Tôi đã gửi báo cáo.");
  expect(icon).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(icon);
  expect(tooltip).toBeVisible();
  expect(icon).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(icon);
  expect(tooltip).not.toBeVisible();
  fireEvent.click(icon);
  fireEvent.pointerDown(screen.getByRole("button", { name: "outside" }));
  expect(tooltip).not.toBeVisible();
  fireEvent.click(icon);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(tooltip).not.toBeVisible();
  expect(onPlay).not.toHaveBeenCalled();
});

it("desktop: hovering the translate icon shows the popup and leaving hides it", () => {
  example("Tôi đã gửi báo cáo.");
  const icon = screen.getByRole("button", { name: "Xem nghĩa tiếng Việt" });
  const tooltip = screen.getByRole("tooltip", { hidden: true });
  fireEvent.mouseEnter(icon);
  expect(tooltip).toBeVisible();
  fireEvent.mouseLeave(icon);
  expect(tooltip).not.toBeVisible();
});

it("renders the plain example button when there is no translation (older lessons, B1+)", () => {
  const { container } = example(undefined);
  expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
  expect(screen.queryByRole("button", { name: "Xem nghĩa tiếng Việt" })).toBeNull();
  expect(container.querySelector(".lesson-example-wrap")).toBeNull();
});

it("lesson grammar: A1–A2 examples get the translate icon, speech stays English only", () => {
  const speak = vi.fn();
  render(<SharedLessonPartContent cefr="A2" language="vi" copy={learnerLessonCopy.vi} grammarAvailable sectionNumber={1}
    part={{ code: "grammar", title: "grammar", content: { formula: "S + have/has + V3", text: "Dùng để nói kết quả.", examples: ["I have sent the report.", "We have met the client."], exampleTranslations: ["Tôi đã gửi báo cáo.", "Chúng tôi đã gặp khách hàng."] } } as never}
    speak={speak} openVocabularyModal={vi.fn()} />);
  const icons = screen.getAllByRole("button", { name: "Xem nghĩa tiếng Việt" });
  expect(icons).toHaveLength(2);
  fireEvent.click(icons[1]!);
  expect(screen.getByRole("tooltip")).toHaveTextContent("Chúng tôi đã gặp khách hàng.");
  expect(speak).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Nghe câu ví dụ: I have sent the report." }));
  expect(speak).toHaveBeenCalledTimes(1);
  expect(speak.mock.calls[0]![0]).toBe("I have sent the report.");
  expect(JSON.stringify(speak.mock.calls)).not.toMatch(/Tôi|Chúng|báo cáo|khách hàng/u);
});

it("lesson grammar: English (B1+) lessons never show the translate icon", () => {
  render(<SharedLessonPartContent cefr="B1" language="en" copy={learnerLessonCopy.en} grammarAvailable sectionNumber={1}
    part={{ code: "grammar", title: "grammar", content: { formula: "S + have/has + V3", text: "Use it for results.", examples: ["I have sent the report."], exampleTranslations: ["Tôi đã gửi báo cáo."] } } as never}
    speak={vi.fn()} openVocabularyModal={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Xem nghĩa tiếng Việt" })).toBeNull();
});
