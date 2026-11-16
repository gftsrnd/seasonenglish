// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LessonVocabularyItem } from "@e4s/contracts";
import { SharedVocabularyModal } from "./Learning.js";

afterEach(cleanup);

const item = {
  word: "meeting", type: "noun", pronunciation: "/ˈmiːtɪŋ/", meaning: "cuộc họp", examples: ["The meeting starts at nine."],
  family: [{ word: "meet", type: "verb", meaning: "gặp" }]
} as unknown as LessonVocabularyItem;

it("closes a vocabulary relation modal with Escape", () => {
  const close = vi.fn();
  render(<SharedVocabularyModal state={{ kind: "family", item }} speak={vi.fn()} language="vi" close={close} />);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveBeenCalledTimes(1);
});

it("closes on a backdrop tap but not on a tap inside the dialog", () => {
  const close = vi.fn();
  render(<SharedVocabularyModal state={{ kind: "family", item }} speak={vi.fn()} language="vi" close={close} />);
  fireEvent.mouseDown(screen.getByRole("dialog"));
  expect(close).not.toHaveBeenCalled();
  fireEvent.mouseDown(document.querySelector(".vocabulary-relation-modal")!);
  expect(close).toHaveBeenCalledTimes(1);
});
