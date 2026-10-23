// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameDescriptor, GameHubView } from "@e4s/contracts";
import { LearnerGames } from "./Games.js";
import { ScrambleGame } from "../games/ScrambleGame.js";
import { WordSortGame } from "../games/WordSortGame.js";
import { SeasonCatchGame } from "../games/SeasonCatchGame.js";
import { SeasonRioGame } from "../games/SeasonRioGame.js";
import { TypingRaceGame } from "../games/TypingRaceGame.js";
import type { LearnerCallbacks } from "./contracts.js";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});
beforeEach(() => vi.clearAllMocks());

const actions = { navigate: vi.fn(), generateGameSet: vi.fn(), useWeeklyGameSet: vi.fn(), deleteGameSet: vi.fn(), speak: vi.fn() } as unknown as LearnerCallbacks;

const view: GameHubView = {
  cefr: "A2",
  aiAvailable: false,
  wordSet: { id: "word-set-1", topic: "Tuần 1", cefr: "A2", source: "weekly", words: [] },
  games: [],
  arena: { eligible: false, requiredLevel: "B1", points: 0, pendingDuels: 0 }
};

describe("app games affordances", () => {
  it("disables topic entry when AI generation is unavailable and explains the fallback", () => {
    render(<LearnerGames view={view} actions={actions} />);

    const topic = screen.getByRole("textbox", { name: "Chủ đề bộ từ" });
    expect(topic).toBeDisabled();
    expect(topic).toHaveAttribute("aria-describedby", "game-topic-help");
    expect(screen.getByText(/chỉ dùng được từ vựng tuần này/i)).toHaveAttribute("id", "game-topic-help");
    expect(screen.getByRole("button", { name: "Tạo bộ từ" })).toBeDisabled();
  });

  it("shows the loading state while topic generation is pending", async () => {
    let resolveGeneration: (() => void) | undefined;
    const generateGameSet = vi.fn(() => new Promise<void>((resolve) => { resolveGeneration = resolve; }));
    const loadingActions = { ...actions, generateGameSet } as unknown as LearnerCallbacks;

    render(<LearnerGames view={{ ...view, aiAvailable: true }} actions={loadingActions} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Chủ đề bộ từ" }), { target: { value: "coffee shop" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Chủ đề bộ từ" }).closest("form")!);

    await waitFor(() => expect(screen.getByRole("button", { name: "Đang tạo…" })).toBeDisabled());
    expect(screen.getByText("Đang kiểm tra và tạo bộ từ…")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Chủ đề bộ từ" })).toBeDisabled();

    resolveGeneration?.();
  });

  it("shows the topic error when generation fails", async () => {
    const generateGameSet = vi.fn().mockRejectedValue(new Error("VOCABULARY_TOPIC_REJECTED"));
    const errorActions = { ...actions, generateGameSet } as unknown as LearnerCallbacks;

    render(<LearnerGames view={{ ...view, aiAvailable: true }} actions={errorActions} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Chủ đề bộ từ" }), { target: { value: "nonsense" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Chủ đề bộ từ" }).closest("form")!);

    expect(await screen.findByText("Chủ đề này không có nghĩa hoặc không phù hợp cho học tập.")).toBeInTheDocument();
  });

  it("renders weekly vocabulary as compact speakable cards", () => {
    const weeklyView: GameHubView = {
      ...view,
      wordSet: {
        ...view.wordSet!,
        words: [{ id: "word-1", english: "colleague", vietnamese: "đồng nghiệp", definition: "a co-worker", partOfSpeech: "noun" }]
      }
    };

    render(<LearnerGames view={weeklyView} actions={actions} />);

    const word = screen.getByRole("button", { name: /colleague.*đồng nghiệp/i });
    expect(word).toHaveClass("word-chip");
    expect(word).toHaveAttribute("title", "a co-worker");
    fireEvent.click(word);
    expect(actions.speak).toHaveBeenCalledWith("colleague");
  });

  it("keeps the six game destinations and the locked arena destination", () => {
    const descriptor = (key: GameDescriptor["key"], name: string): GameDescriptor => ({
      key, icon: "🎮", name, description: `${name} description`, goal: "goal", instructions: [], scoring: "scoring", best: null
    });
    const gameView: GameHubView = {
      ...view,
      games: [
        descriptor("scramble", "Xếp chữ"), descriptor("crossword", "Ô chữ"), descriptor("eggs", "Season catch"),
        descriptor("mario", "Season-rio"), descriptor("sort", "Phân loại từ"), descriptor("typing", "Đua gõ từ")
      ]
    };

    render(<LearnerGames view={gameView} actions={actions} />);

    const labels = { scramble: "Xếp chữ", crossword: "Ô chữ", eggs: "Season catch", mario: "Season-rio", sort: "Phân loại từ", typing: "Đua gõ từ" } as const;
    for (const [key, label] of Object.entries(labels)) expect(screen.getByRole("link", { name: `Chơi ${label}` })).toHaveAttribute("href", `/games/${key}`);
    const arena = screen.getByRole("link", { name: /Đấu trường nội bộ/i });
    expect(arena).toHaveClass("locked");
    expect(arena).toHaveAttribute("href", "/arena");
    expect(arena).toHaveTextContent("B1+");
  });

  it("uses consistent Lucide icons for the six game tiles without rendering raw tile glyphs", () => {
    render(<LearnerGames view={view} actions={actions} />);

    const icons = [
      ["Xếp chữ", "lucide-shuffle"],
      ["Ô chữ", "lucide-grid-3x3"],
      ["Season catch", "lucide-egg"],
      ["Season-rio", "lucide-sun"],
      ["Phân loại từ", "lucide-arrow-left-right"],
      ["Đua gõ từ", "lucide-keyboard"]
    ] as const;
    for (const [name, iconClass] of icons) {
      const tile = screen.getByRole("link", { name: `Chơi ${name}` });
      const icon = tile.querySelector(".game-icon svg");
      expect(icon).toHaveClass(iconClass);
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveAttribute("width", "28");
      expect(icon).toHaveAttribute("height", "28");
      expect(icon).toHaveAttribute("stroke-width", "2");
      expect(tile.querySelector(".game-icon")).not.toHaveTextContent(/[🔀▦🥚☀↔⌨]/);
    }
  });

  it("cancels a pending Word sort completion when the learner leaves", async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const { unmount } = render(<WordSortGame words={[
      { id: "colleague", english: "colleague", vietnamese: "đồng nghiệp", definition: "a co-worker", partOfSpeech: "noun" }
    ]} onFinish={onFinish} />);

    fireEvent.click(screen.getByRole("button", { name: "Noun" }));
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    expect(onFinish).not.toHaveBeenCalled();
  });

  it("restores Scramble focus and clears transient feedback before the retry", async () => {
    vi.useFakeTimers();
    render(<ScrambleGame words={[
      { id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun" }
    ]} onFinish={vi.fn()} />);
    const bank = screen.getByRole("group", { name: "Chữ cái bị xáo trộn" });
    const buttons = within(bank).getAllByRole("button");

    for (const button of buttons) fireEvent.click(button);
    expect(screen.getByText("Chưa đúng – xếp lại nhé.")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(450); });

    expect(screen.queryByText("Chưa đúng – xếp lại nhé.")).not.toBeInTheDocument();
    expect(within(bank).getAllByRole("button")[0]).toHaveFocus();
  });

  it("shows both used attempts after the final wrong Scramble answer", async () => {
    vi.useFakeTimers();
    render(<ScrambleGame words={[
      { id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun" }
    ]} onFinish={vi.fn()} />);

    const clickBankOrder = () => {
      const bank = screen.getByRole("group", { name: "Chữ cái bị xáo trộn" });
      for (const button of within(bank).getAllByRole("button")) fireEvent.click(button);
    };
    clickBankOrder();
    await act(async () => { await vi.advanceTimersByTimeAsync(450); });
    clickBankOrder();

    expect(screen.getByText("Sai 2/2")).toBeInTheDocument();
  });

  it("keeps Season catch focused without scrolling the active game under the header", () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    render(<SeasonCatchGame words={[{
      id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun"
    }]} cefr="A2" onFinish={vi.fn()} />);

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("keeps Season-rio focused without scrolling the active game under the header", () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    render(<SeasonRioGame words={[{
      id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun"
    }]} onFinish={vi.fn()} />);

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("resets the scroll container after a long game tutorial starts", () => {
    const view = render(<main><div /></main>);
    const main = screen.getByRole("main");
    main.scrollTop = 188;
    view.rerender(<main><SeasonRioGame words={[{
      id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun"
    }]} onFinish={vi.fn()} /></main>);
    expect(main.scrollTop).toBe(0);

    main.scrollTop = 88;
    view.rerender(<main><TypingRaceGame words={[{
      id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun"
    }]} onFinish={vi.fn()} /></main>);
    expect(main.scrollTop).toBe(0);
  });
});
