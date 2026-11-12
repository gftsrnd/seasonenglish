// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameDescriptor, GameWordSetView } from "@e4s/contracts";
import { WordSortGame } from "./WordSortGame.js";
import { LearnerGame } from "../learner/Games.js";
import type { LearnerCallbacks } from "../learner/contracts.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const words: GameWordSetView["words"] = [
  { id: "a-change", english: "change", vietnamese: "sự thay đổi", definition: "sự thay đổi", partOfSpeech: "noun", example: "We need a change in the plan." },
  { id: "b-prepare", english: "prepare", vietnamese: "chuẩn bị", definition: "get ready", partOfSpeech: "verb", example: "Please prepare the report." },
  { id: "c-quick", english: "quick", vietnamese: "nhanh", definition: "fast", partOfSpeech: "adjective", example: "a quick call" },
  { id: "d-from", english: "from", vietnamese: "từ", definition: "từ", partOfSpeech: "preposition" }
];

function currentWord() {
  return screen.getByText((_, element) => element?.matches(".sort-word-line > strong") ?? false).textContent ?? "";
}

describe("Word sort context sentence", () => {
  it("shows the sentence with the word highlighted and keeps the meaning at A1-A2", () => {
    const { container } = render(<WordSortGame words={words} cefr="A2" onFinish={vi.fn()} />);
    const word = words.find((item) => item.english === currentWord())!;
    const meaning = container.querySelector(".sort-meaning");
    expect(meaning).toBeInTheDocument();
    if (word.example) {
      const context = container.querySelector("[data-word-context]")!;
      expect(context).toHaveTextContent(word.example);
      expect(context.querySelector("mark")).toHaveTextContent(new RegExp(`^${word.english}$`, "i"));
    }
    // A duplicated meaning ("từ · từ") collapses to one.
    expect(meaning?.textContent).not.toMatch(/^(.+) · \1$/);
  });

  it("replaces the meaning line with the sentence from B1 and keeps words without a sentence playable", async () => {
    vi.useFakeTimers();
    const { container } = render(<WordSortGame words={words} cefr="B1" onFinish={vi.fn()} />);
    const seen = new Set<string>();
    for (let round = 0; round < words.length; round += 1) {
      const word = words.find((item) => item.english === currentWord())!;
      seen.add(word.id);
      if (word.example) {
        expect(container.querySelector("[data-word-context] mark")).toHaveTextContent(word.english);
        expect(container.querySelector(".sort-meaning")).not.toBeInTheDocument();
      } else {
        expect(container.querySelector("[data-word-context]")).not.toBeInTheDocument();
        expect(container.querySelector(".sort-meaning")).toHaveTextContent(word.vietnamese);
      }
      if (round === words.length - 1) break;
      fireEvent.click(screen.getByRole("button", { name: "Noun" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    }
    vi.useRealTimers();
    expect(seen.size).toBe(words.length);
  });

  it("speaks only the word, never the sentence", () => {
    render(<WordSortGame words={words} cefr="A1" onFinish={vi.fn()} />);
    const label = screen.getByRole("button", { name: /^Nghe / }).getAttribute("aria-label");
    expect(label).toBe(`Nghe ${currentWord()}`);
  });

  it("fills missing sentences once while the tutorial is shown", async () => {
    const pendingSet: GameWordSetView = { id: "set-1", topic: "Office", cefr: "B1", source: "custom", examplesPending: true, words: words.map(({ example: _example, ...item }) => item) };
    const prepareGameWordExamples = vi.fn().mockResolvedValue({ ...pendingSet, examplesPending: undefined, words });
    const descriptor: GameDescriptor = { key: "sort", icon: "", name: "Word sort", description: "", goal: "", instructions: ["a", "b", "c"], scoring: "", best: null };
    const actions = { navigate: vi.fn(), finishGame: vi.fn(), resetGameResult: vi.fn(), speak: vi.fn(), prepareGameWordExamples } as unknown as LearnerCallbacks;
    const { container } = render(<LearnerGame descriptor={descriptor} wordSet={pendingSet} result={null} actions={actions} />);
    expect(screen.getByRole("button", { name: /Đang chuẩn bị câu ví dụ/ })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Bắt đầu chơi/ })).toBeEnabled());
    expect(prepareGameWordExamples).toHaveBeenCalledTimes(1);
    expect(prepareGameWordExamples).toHaveBeenCalledWith("set-1");
    fireEvent.click(screen.getByRole("button", { name: /Bắt đầu chơi/ }));
    const word = words.find((item) => item.english === currentWord())!;
    if (word.example) expect(container.querySelector("[data-word-context] mark")).toHaveTextContent(word.english);
  });
});
