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
import { ModalProvider } from "../shared/ModalProvider.js";
import type { ReactElement } from "react";
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

const playableView: GameHubView = {
  ...view,
  wordSet: {
    ...view.wordSet!,
    words: [
      { id: "colleague", english: "colleague", vietnamese: "đồng nghiệp", definition: "a co-worker", partOfSpeech: "noun" },
      { id: "schedule", english: "schedule", vietnamese: "lịch trình", definition: "a plan of times", partOfSpeech: "noun" },
      { id: "coordinate", english: "coordinate", vietnamese: "phối hợp", definition: "organize together", partOfSpeech: "verb" },
      { id: "communicate", english: "communicate", vietnamese: "giao tiếp", definition: "share information", partOfSpeech: "verb" }
    ]
  }
};

function renderGames(game: ReactElement) {
  return render(game, { wrapper: ModalProvider });
}

describe("app games affordances", () => {
  it("keeps the active word set when the learner cancels deletion or replacement", async () => {
    renderGames(<LearnerGames view={{ ...view, aiAvailable: true, learnedVocabularyAvailable: true, wordSet: { ...view.wordSet!, source: "custom" } }} actions={actions} />);

    fireEvent.click(screen.getByRole("button", { name: "Xoá bộ này" }));
    const removal = await screen.findByRole("dialog", { name: "Xoá bộ từ đang dùng?" });
    expect(within(removal).getByRole("button", { name: "Xoá bộ từ" })).toHaveClass("btn-danger");
    expect(actions.deleteGameSet).not.toHaveBeenCalled();
    fireEvent.click(within(removal).getByRole("button", { name: "Huỷ" }));
    expect(actions.deleteGameSet).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Dùng từ đã học trong tháng" }));
    const replacement = await screen.findByRole("dialog", { name: "Thay bộ từ đang dùng?" });
    expect(within(replacement).getByRole("button", { name: "Thay bộ từ" })).toHaveClass("btn-primary");
    expect(actions.useWeeklyGameSet).not.toHaveBeenCalled();
    fireEvent.click(within(replacement).getByRole("button", { name: "Huỷ" }));
    expect(actions.useWeeklyGameSet).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /Bộ từ: Tuần 1/i })).toBeInTheDocument();
  });
  it("separates the three game setup sections into responsive cards", () => {
    renderGames(<LearnerGames view={{ ...view, aiAvailable: true }} actions={actions} />);

    const page = screen.getByRole("heading", { name: "Game từ vựng" }).closest(".games-page");
    expect(page).toHaveClass("games-page");
    const sections = Array.from((page as HTMLElement).querySelectorAll<HTMLElement>(".games-section-card:not(.arena-section-card)"));
    expect(sections).toHaveLength(3);
    expect((page as HTMLElement).lastElementChild).toHaveClass("arena-section-card");
    for (const section of sections) expect(section).toHaveClass("games-section-card");
    const topicSection = sections[0]!;
    const wordSetSection = sections[1]!;
    expect(topicSection).toHaveClass("games-topic-card");
    expect(wordSetSection).toHaveClass("games-word-set-card");
    expect(topicSection.querySelector("form.topic-create")).toBeInTheDocument();
    expect(within(topicSection).getByText(/Tuần 1/).closest(".topic-source")).toBeInTheDocument();
    expect(within(wordSetSection).getByRole("heading", { name: /Bộ từ: Tuần 1/i }).closest(".section-heading")).toBeInTheDocument();
  });

  it("confirms that the active set uses learned vocabulary from the current learning path", () => {
    renderGames(<LearnerGames view={view} actions={actions} />);

    expect(screen.getByText("Đang dùng bộ từ đã học trong lộ trình hiện tại.")).toBeInTheDocument();
    expect(screen.queryByText("Nhập một chủ đề để tạo bộ từ.")).not.toBeInTheDocument();
  });

  it("offers a way to get practice words when AI generation and learned words are unavailable", () => {
    renderGames(<LearnerGames view={{ ...view, wordSet: null }} actions={actions} />);

    expect(screen.queryByRole("textbox", { name: "Chủ đề bộ từ" })).not.toBeInTheDocument();
    expect(screen.queryByText("Nhập một chủ đề để tạo bộ từ.")).not.toBeInTheDocument();
    expect(screen.getByText(/Hãy học một bài để có từ luyện tập/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Về Trang chủ" })).toHaveAttribute("href", "/home");
  });

  it("shows the loading state while topic generation is pending", async () => {
    let resolveGeneration: (() => void) | undefined;
    const generateGameSet = vi.fn(() => new Promise<void>((resolve) => { resolveGeneration = resolve; }));
    const loadingActions = { ...actions, generateGameSet } as unknown as LearnerCallbacks;

    renderGames(<LearnerGames view={{ ...view, wordSet: null, aiAvailable: true }} actions={loadingActions} />);
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

    renderGames(<LearnerGames view={{ ...view, wordSet: null, aiAvailable: true }} actions={errorActions} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Chủ đề bộ từ" }), { target: { value: "nonsense" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Chủ đề bộ từ" }).closest("form")!);

    expect(await screen.findByText("Chủ đề này không có nghĩa hoặc không phù hợp cho học tập.")).toBeInTheDocument();
  });

  it("shows the server message when the topic is not allowed", async () => {
    const message = "Chủ đề này không phù hợp. Hãy chọn một chủ đề công việc hoặc đời sống, ví dụ: coffee shop, meeting.";
    const rejection = Object.assign(new Error("GAME_TOPIC_NOT_ALLOWED"), { details: { code: "GAME_TOPIC_NOT_ALLOWED", message, moderation: { state: "unsafe", strike: 1, message } } });
    const generateGameSet = vi.fn().mockRejectedValue(rejection);
    renderGames(<LearnerGames view={{ ...view, wordSet: null, aiAvailable: true }} actions={{ ...actions, generateGameSet } as unknown as LearnerCallbacks} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Chủ đề bộ từ" }), { target: { value: "unsafe words" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Chủ đề bộ từ" }).closest("form")!);

    expect(await screen.findByText((content) => content.includes(message))).toBeInTheDocument();
    expect(screen.queryByText(/Đã tạo bộ từ theo chủ đề/)).not.toBeInTheDocument();
    expect(screen.queryByText("Chủ đề này không có nghĩa hoặc không phù hợp cho học tập.")).not.toBeInTheDocument();
  });

  it("shows an unsuitable theme as a gentle notice without the safety counter", async () => {
    const message = "Chủ đề này không phù hợp với Mini game. Hãy chọn một chủ đề công việc hoặc đời sống, ví dụ: coffee shop, meeting.";
    const rejection = Object.assign(new Error("GAME_TOPIC_NOT_SUITABLE"), { details: { code: "GAME_TOPIC_NOT_SUITABLE", message, strikes: 0, moderation: { state: "not_suitable", message } } });
    const generateGameSet = vi.fn().mockRejectedValue(rejection);
    renderGames(<LearnerGames view={{ ...view, wordSet: null, aiAvailable: true }} actions={{ ...actions, generateGameSet } as unknown as LearnerCallbacks} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Chủ đề bộ từ" }), { target: { value: "religion" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Chủ đề bộ từ" }).closest("form")!);

    const notice = await screen.findByText(message);
    expect(notice.closest(".banner")).toHaveClass("warn");
    expect(screen.queryByText(/Cảnh báo an toàn/)).not.toBeInTheDocument();
    expect(screen.queryByText("Không tạo được bộ từ. Vui lòng thử lại.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Đã tạo bộ từ theo chủ đề/)).not.toBeInTheDocument();
  });

  it("renders weekly vocabulary as compact speakable cards", () => {
    const weeklyView: GameHubView = {
      ...view,
      wordSet: {
        ...view.wordSet!,
        words: [{ id: "word-1", english: "colleague", vietnamese: "đồng nghiệp", definition: "a co-worker", partOfSpeech: "noun" }]
      }
    };

    renderGames(<LearnerGames view={weeklyView} actions={actions} />);

    const word = screen.getByRole("button", { name: /colleague.*đồng nghiệp/i });
    expect(word).toHaveClass("word-chip");
    expect(word).toHaveAttribute("title", "a co-worker");
    fireEvent.click(word);
    expect(actions.speak).toHaveBeenCalledWith("colleague");
  });

  it("keeps the six game destinations without exposing the retired B1 arena", () => {
    const descriptor = (key: GameDescriptor["key"], name: string): GameDescriptor => ({
      key, icon: "🎮", name, description: `${name} description`, goal: "goal", instructions: [], scoring: "scoring", best: null
    });
    const gameView: GameHubView = {
      ...playableView,
      games: [
        descriptor("scramble", "Xếp chữ"), descriptor("crossword", "Ô chữ"), descriptor("eggs", "Season catch"),
        descriptor("mario", "Season-rio"), descriptor("sort", "Phân loại từ"), descriptor("typing", "Đua gõ từ")
      ]
    };

    renderGames(<LearnerGames view={gameView} actions={actions} />);

    const labels = { scramble: "Xếp chữ", crossword: "Ô chữ", eggs: "Season catch", mario: "Season-rio", sort: "Phân loại từ", typing: "Đua gõ từ" } as const;
    for (const [key, label] of Object.entries(labels)) expect(screen.getByRole("link", { name: `Chơi ${label}` })).toHaveAttribute("href", `/games/${key}`);
    expect(screen.queryByText("Đấu trường nội bộ")).not.toBeInTheDocument();
  });

  it("shows Đấu trường as its own card below the games, separate from the personal game cards", () => {
    renderGames(<LearnerGames view={{ ...view, cefr: "B1", arena: { ...view.arena, eligible: true, points: 12 } }} actions={actions} />);

    expect(screen.queryByText("Đấu trường nội bộ")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Đấu trường/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bảng xếp hạng/ })).toHaveAttribute("href", "/arena");
    expect(screen.queryByRole("button", { name: /^Đấu / })).not.toBeInTheDocument();
  });

  it("uses consistent Lucide icons for the six game tiles without rendering raw tile glyphs", () => {
    renderGames(<LearnerGames view={playableView} actions={actions} />);

    const icons = [
      ["Xếp chữ", "lucide-shuffle"],
      ["Ô chữ", "lucide-grid-3x3"],
      ["Season catch", "lucide-shopping-basket"],
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
      expect(tile.querySelector(".game-icon")).not.toHaveTextContent(/[🔀▦🧺☀↔⌨]/);
    }
  });

  it("cancels a pending Word sort completion when the learner leaves", async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const { unmount } = render(<WordSortGame words={[
      { id: "colleague", english: "colleague", vietnamese: "đồng nghiệp", definition: "a co-worker", partOfSpeech: "noun" },
      { id: "report", english: "report", vietnamese: "báo cáo", definition: "a written account", partOfSpeech: "noun" },
      { id: "incident", english: "incident", vietnamese: "sự cố", definition: "an unexpected event", partOfSpeech: "noun" },
      { id: "corridor", english: "corridor", vietnamese: "hành lang", definition: "a hallway", partOfSpeech: "noun" }
    ]} onFinish={onFinish} />);

    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole("button", { name: "Noun" }));
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });

    expect(onFinish).not.toHaveBeenCalled();
  });

  it("scores Word sort with the shared streak (9, 9, then 14 a question on 8) and sends no own combo", async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const words = Array.from({ length: 8 }, (_, index) => ({ id: `noun-${index}`, english: `noun${index}`, vietnamese: `danh từ ${index}`, definition: "a thing", partOfSpeech: "noun" }));
    render(<WordSortGame words={words} onFinish={onFinish} />);

    for (let index = 0; index < words.length; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Noun" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    }

    expect(onFinish).toHaveBeenCalledTimes(1);
    const answers = (onFinish.mock.calls[0]![0] as { answers: Array<{ combo?: number; attempts?: number }> }).answers;
    expect(answers.map((answer) => answer.combo)).toEqual(Array(8).fill(undefined));
    expect(answers.every((answer) => answer.attempts === 1)).toBe(true);
    expect(document.querySelector('[data-hud="raw"]')).toHaveTextContent("Điểm 100");
    expect(document.querySelector('[data-hud="combo"]')).toHaveTextContent("Combo 8");
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

  it("allows exactly one Scramble hint per word and re-enables it on the next word (B8-008)", async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<ScrambleGame words={[
      { id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun" },
      { id: "dog", english: "dog", vietnamese: "con chó", definition: "a loyal pet", partOfSpeech: "noun" }
    ]} onFinish={onFinish} />);
    const slots = () => within(screen.getByLabelText("Từ đang xếp")).getAllByText(/./).map((slot) => slot.textContent);
    const hint = screen.getByRole("button", { name: "Gợi ý" });

    fireEvent.click(hint);
    expect(slots()).toHaveLength(1);
    expect(hint).toBeDisabled();
    fireEvent.click(hint);
    fireEvent.click(hint);
    expect(slots()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua" }));
    expect(screen.getByText(/Đã bỏ qua · Từ đúng:/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_800); });

    expect(screen.getByText("Từ 2/2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gợi ý" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_800); });

    expect(onFinish).toHaveBeenCalledTimes(1);
    const answers = (onFinish.mock.calls[0]![0] as { answers: Array<{ answer: string; usedHint?: boolean; attempts?: number }> }).answers;
    expect(answers.map(({ answer, usedHint, attempts }) => ({ answer, usedHint, attempts }))).toEqual([
      { answer: "", usedHint: true, attempts: 1 },
      { answer: "", usedHint: false, attempts: 1 }
    ]);
    expect(document.querySelector('[data-hud="raw"]')).toHaveTextContent("Điểm 0");
  });

  it("keeps the correct prefix and adds one letter when the Scramble hint is used after a wrong pick", async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<ScrambleGame words={[
      { id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun" }
    ]} onFinish={onFinish} />);
    const bank = screen.getByRole("group", { name: "Chữ cái bị xáo trộn" });
    const tileFor = (character: string) => within(bank).getAllByRole("button").find((button) => button.textContent === character && !button.hasAttribute("disabled"))!;

    fireEvent.click(tileFor("t"));
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý" }));
    expect(within(screen.getByLabelText("Từ đang xếp")).getAllByText(/./).map((slot) => slot.textContent)).toEqual(["C"]);

    fireEvent.click(tileFor("a"));
    fireEvent.click(tileFor("t"));
    expect(screen.getByText("Đúng · cat +50")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    const answers = (onFinish.mock.calls[0]![0] as { answers: Array<{ answer: string; usedHint?: boolean }> }).answers;
    expect(answers).toEqual([expect.objectContaining({ answer: "cat", usedHint: true, attempts: 1 })]);
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
