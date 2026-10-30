// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameDescriptor, GameHubView, GameWordSetView } from "@e4s/contracts";
import { CrosswordGame } from "../games/CrosswordGame.js";
import { SeasonCatchGame } from "../games/SeasonCatchGame.js";
import { SeasonRioGame } from "../games/SeasonRioGame.js";
import { TypingRaceGame } from "../games/TypingRaceGame.js";
import { WordSortGame } from "../games/WordSortGame.js";
import { LearnerGame, LearnerGames } from "./Games.js";
import type { LearnerCallbacks } from "./contracts.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

const wordSet: GameWordSetView = {
  id: "word-set-1",
  topic: "Introducing yourself",
  cefr: "A2",
  source: "weekly",
  words: [
    { id: "word-1", english: "colleague", vietnamese: "đồng nghiệp", definition: "a co-worker", partOfSpeech: "noun" },
    { id: "word-2", english: "schedule", vietnamese: "lịch trình", definition: "a plan of times", partOfSpeech: "noun" },
    { id: "word-3", english: "coordinate", vietnamese: "phối hợp", definition: "organize together", partOfSpeech: "verb" }
  ]
};

const actions = {
  navigate: vi.fn(),
  finishGame: vi.fn().mockResolvedValue(undefined),
  resetGameResult: vi.fn(),
  appealMonthlyExam: vi.fn(), resolveGameWordImage: vi.fn().mockResolvedValue({ status: "unavailable" }),
  useWeeklyGameSet: vi.fn().mockResolvedValue(undefined),
  deleteGameSet: vi.fn().mockResolvedValue(undefined),
  speak: vi.fn()
} as unknown as LearnerCallbacks;

const descriptor = (key: GameDescriptor["key"], instructions: string[]): GameDescriptor => ({
  key,
  icon: "🎮",
  name: key,
  description: "description",
  goal: "goal",
  instructions,
  scoring: "scoring",
  best: null
});

const hubView: GameHubView = {
  cefr: "A2",
  aiAvailable: false,
  wordSet,
  games: [
    descriptor("scramble", []), descriptor("crossword", []), { ...descriptor("eggs", []), description: "Đưa rổ hứng vật phẩm theo mùa mang đúng từ: lá (thu), hoa (xuân), kem (hè), tuyết (đông)." },
    descriptor("mario", []), descriptor("sort", []), descriptor("typing", [])
  ]
};

describe("learner game visual and interaction regressions", () => {
  it("does not start Word Sort with fewer than four valid part-of-speech words", () => {
    render(<WordSortGame words={wordSet.words} onFinish={vi.fn()} />);

    expect(screen.getByText("Cần ít nhất 4 từ có thông tin từ loại để bắt đầu.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Nhóm từ loại" })).not.toBeInTheDocument();
  });

  it("keeps the original game artwork and scene objects without changing initial mechanics", () => {
    document.documentElement.dataset.theme = "autumn";
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const catchView = render(<SeasonCatchGame words={wordSet.words} cefr="A2" onFinish={vi.fn()} />);
    expect(catchView.container.querySelector('.catch-prompt img[src^="data:image/svg+xml"]')).toBeInTheDocument();
    expect(catchView.container.querySelector('.falling-item img[src^="data:image/svg+xml"]')).toBeInTheDocument();
    expect(catchView.container.querySelector('.season-animal[src^="data:image/svg+xml"]')).toHaveAttribute("alt", "Sóc mùa thu");
    expect(catchView.container.querySelector(".basket")).toHaveTextContent("🧺");
    expect(catchView.container.querySelectorAll(".game-lives .lucide-heart")).toHaveLength(3);
    expect(catchView.container.querySelector(".game-lives")).not.toHaveTextContent(/[❤️🖤]/);
    expect(screen.getAllByTestId("falling-item")).toHaveLength(3);
    catchView.unmount();

    const rioView = render(<SeasonRioGame words={wordSet.words} onFinish={vi.fn()} />);
    expect(rioView.container.querySelector('.gift-gate > span img[src^="data:image/svg+xml"]')).toBeInTheDocument();
    expect(rioView.container.querySelector('.rio-boss > b')).toHaveTextContent("🌰");
    expect(rioView.container.querySelector('.rio-flag')).toHaveTextContent("🚩");
    expect(rioView.container.querySelector('.rio-hero img[src^="data:image/svg+xml"]')).toHaveAttribute("alt", "Sóc mùa thu");
    expect(screen.getAllByTestId("gift-gate")).toHaveLength(3);
    expect(screen.getAllByTestId("gift-gate").map((gate) => gate.dataset.state)).toEqual(["closed", "closed", "closed"]);
  });

  it("keeps hub descriptions concise while preserving each game's core action", () => {
    render(<LearnerGames view={hubView} actions={actions} />);

    expect(screen.getByText("Hứng đúng vật phẩm, giữ 3 mạng.")).toBeInTheDocument();
    expect(screen.queryByText(/mang đúng từ: lá \(thu\)/i)).not.toBeInTheDocument();
  });

  it("keeps games visible but disables rounds the active word set cannot build", () => {
    const incompatibleWords: GameWordSetView = {
      ...wordSet,
      words: [
        { id: "cat", english: "cat", vietnamese: "mèo", definition: "a pet", partOfSpeech: "noun" },
        { id: "dog", english: "dog", vietnamese: "chó", definition: "a pet", partOfSpeech: "noun" },
        { id: "fly", english: "fly", vietnamese: "bay", definition: "move in air", partOfSpeech: "verb" }
      ]
    };
    render(<LearnerGames view={{ ...hubView, wordSet: incompatibleWords }} actions={actions} />);

    expect(screen.getByRole("button", { name: "Ô chữ chưa sẵn sàng" })).toBeDisabled();
    expect(screen.getByText("Cần ít nhất 3 từ có chữ cái chung.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phân loại từ chưa sẵn sàng" })).toBeDisabled();
    expect(screen.getByText("Cần ít nhất 4 từ có thông tin từ loại.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chơi Xếp chữ" })).toBeInTheDocument();
  });

  it("shows a short game introduction with one goal and no more than three steps", () => {
    const scramble = descriptor("scramble", [
      "Đọc gợi ý rồi chọn chữ.",
      "Bạn có hai lần thử.",
      "Dùng gợi ý khi cần.",
      "Dòng giải thích dài không nên hiện."
    ]);
    scramble.name = "Xếp chữ";
    scramble.icon = "abc";
    scramble.goal = "Xếp đúng càng nhiều từ càng tốt.";
    const { container } = render(<LearnerGame descriptor={scramble} wordSet={wordSet} result={null} actions={actions} />);

    expect(screen.getByRole("heading", { name: "Cách chơi Xếp chữ" })).toBeInTheDocument();
    expect(screen.getByText("Xếp đúng càng nhiều từ càng tốt.")).toBeInTheDocument();
    expect(container.querySelector(".game-tutorial-hero-icon svg")).toBeInTheDocument();
    expect(container.querySelectorAll(".game-tutorial-steps li")).toHaveLength(3);
    expect(container.querySelectorAll(".game-tutorial-step-icon")).toHaveLength(3);
    expect(screen.queryByText("Dòng giải thích dài không nên hiện.")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".game-tutorial-meta svg")).toHaveLength(2);
    expect(container.querySelectorAll(".game-tutorial-actions svg")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Bắt đầu chơi" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quay lại" })).toBeInTheDocument();
  });

  it("uses game-specific tutorial icons instead of one repeated icon set", () => {
    const catchGame = descriptor("eggs", []);
    catchGame.name = "Season catch";
    const { container } = render(<LearnerGame descriptor={catchGame} wordSet={wordSet} result={null} actions={actions} />);

    expect([...container.querySelectorAll(".game-tutorial-step-icon")].map((item) => item.getAttribute("data-step-kind"))).toEqual([
      "move", "catch", "lives"
    ]);
  });

  it("keeps the canonical Season-rio goal and controls in a concise tutorial", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const mario = descriptor("mario", [
      "Chạy bằng phím ← →, nhảy bằng Space hoặc ↑ (điện thoại: 3 nút dưới màn hình).",
      "Mỗi hộp quà ? đứng trên một cột gỗ chắn ngang đường: chạm vào hộp hoặc cột → câu hỏi từ vựng, chọn 1 trong 4. Đúng: 🍄 (+1). Sai: mất 1 ❤️. Trả lời xong (đúng hay sai) cổng mới mở, nên không bỏ qua hộp nào được.",
      "Đường khúc khuỷu: có hộp đặt trên bục gỗ, có hộp trên bục cao phải leo bậc. Cuối màn là món ăn khoái khẩu KHỔNG LỒ của nhân vật (thỏ – cà rốt, sóc – hạt dẻ, cánh cụt – cá…): chạm vào là đồng hồ 10 giây chạy; mỗi câu đúng ăn 1 miếng (3 miếng), sai mất 1 ❤️; quá 10 giây món ăn bị hỏng → thua.",
      "Ăn hết món khổng lồ rồi chạm cờ để về đích. Hết 3 ❤️ hoặc để món ăn hỏng là thua."
    ]);
    mario.name = "Season-rio";
    mario.icon = "🍄";
    mario.goal = "Trả lời đủ 8 hộp quà chắn đường, ăn hết món khổng lồ trong 10 giây và chạm cờ.";
    mario.scoring = "+1 điểm mỗi hộp quà đúng, +1 mỗi miếng ăn đúng ở Boss (tối đa 11).";
    render(<LearnerGame descriptor={mario} wordSet={wordSet} result={null} actions={actions} />);

    expect(screen.getByRole("heading", { name: "Season-rio" })).toBeInTheDocument();
    expect(screen.getByText("Kỷ lục: chưa có")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thoát game" })).toHaveClass("btn", "btn-sm");
    expect(screen.getByText("Hướng dẫn chơi", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Di chuyển, nhảy và mở từng hộp câu hỏi.")).toBeInTheDocument();
    expect(screen.getByText("Trả lời để mở cổng; trả lời sai mất một mạng.")).toBeInTheDocument();
    expect(screen.getByText("Vượt thử thách cuối rồi chạm cờ để hoàn thành.")).toBeInTheDocument();
    expect(screen.getByText("Vượt 3 cổng, trả lời 3 câu Boss rồi chạm cờ.")).toBeInTheDocument();
    expect(screen.getByText(/tối đa 6 điểm/i)).toBeInTheDocument();
    expect(screen.queryByText(/Mỗi hộp quà \? đứng trên một cột gỗ chắn ngang đường/i)).not.toBeInTheDocument();
    const tutorialMeta = document.querySelector(".game-tutorial-meta");
    expect(tutorialMeta).not.toBeNull();
    expect(within(tutorialMeta as HTMLElement).getByText(/3 từ/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu chơi" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quay lại" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
  });

  it("resets the learner main scroll container when a game starts", async () => {
    const crossword = descriptor("crossword", []);
    render(<main><LearnerGame descriptor={crossword} wordSet={wordSet} result={null} actions={actions} /></main>);

    const main = screen.getByRole("main");
    main.scrollTop = 320;
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));

    await waitFor(() => expect(main.scrollTop).toBe(0));
  });

  it("keeps the typing clue copy in a separate readable block", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { container } = render(<TypingRaceGame words={[wordSet.words[0]!]} onFinish={vi.fn()} />);

    expect(container.querySelector(".typing-clue-copy")).toBeInTheDocument();
  });

  it("loads Typing race artwork through the game media resolver and keeps a fallback when unavailable", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const resolveGameWordImage = vi.fn().mockResolvedValue({
      status: "available",
      imageUrl: "https://provider.invalid/image.jpg",
      alt: "colleague",
      attribution: { creator: null, licence: "CC0", licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Colleague.jpg" }
    });
    const typing = descriptor("typing", []);
    render(<LearnerGame descriptor={typing} wordSet={wordSet} result={null} actions={{ ...actions, resolveGameWordImage } as unknown as LearnerCallbacks} />);

    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));

    expect(await screen.findByRole("img", { name: "colleague" })).toHaveAttribute("src", "https://provider.invalid/image.jpg");
    expect(resolveGameWordImage).toHaveBeenCalledWith("word-set-1", expect.any(String));
  });

  it("does not replace unavailable Typing race artwork with an unrelated seasonal animal", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const resolveGameWordImage = vi.fn().mockResolvedValue({ status: "unavailable" });
    render(<TypingRaceGame words={[wordSet.words[0]!]} imageSetId="word-set-1" resolveImage={resolveGameWordImage} onFinish={vi.fn()} />);

    expect(await screen.findByRole("img", { name: /Chưa có ảnh minh hoạ cho colleague/i })).toBeInTheDocument();
    expect(document.querySelector('.typing-clue-image img[src*="/media/seasons/"]')).not.toBeInTheDocument();
  });

  it("ignores browser modifier shortcuts instead of typing into the answer", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { container } = render(<TypingRaceGame words={[wordSet.words[0]!]} onFinish={vi.fn()} />);

    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", metaKey: true });
    fireEvent.keyDown(window, { key: "x", altKey: true });

    expect(container.querySelectorAll('[data-testid="typing-character"]:not(:empty)')).toHaveLength(0);
  });

  it("includes apostrophe and hyphen controls for touch typing", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<TypingRaceGame words={[{
      id: "check-in", english: "check-in's", vietnamese: "của lúc nhận phòng", definition: "belonging to a check-in", partOfSpeech: "noun"
    }]} onFinish={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Dấu gạch nối" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Dấu nháy đơn" })).toBeEnabled();
  });

  it("hides punctuation controls when the current typing word does not need them", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<TypingRaceGame words={[wordSet.words[0]!]} onFinish={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Dấu gạch nối" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dấu nháy đơn" })).not.toBeInTheDocument();
  });

  it("does not type when focus has left Typing race", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { container } = render(<><TypingRaceGame words={[wordSet.words[0]!]} onFinish={vi.fn()} /><button type="button">Ngoài Đua gõ từ</button></>);
    const outside = screen.getByRole("button", { name: "Ngoài Đua gõ từ" });
    outside.focus();
    fireEvent.keyDown(outside, { key: "c" });

    expect(container.querySelectorAll('[data-testid="typing-character"]:not(:empty)')).toHaveLength(0);
  });

  it("keeps keyboard focus inside the open Season-rio quiz", async () => {
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<SeasonRioGame words={wordSet.words} onFinish={vi.fn()} />);

    await act(async () => {
      const right = screen.getByRole("button", { name: "Sang phải" });
      for (let index = 0; index < 35; index += 1) {
        fireEvent.pointerDown(right);
        fireEvent.pointerUp(right);
      }
    });
    await act(async () => {
      for (let index = 0; index < 6; index += 1) {
        const callback = frames.shift();
        if (!callback) break;
        now += 17;
        callback(now);
      }
    });

    const dialog = await screen.findByRole("dialog");
    const options = within(dialog).getAllByRole("button");
    options[0]!.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(options.at(-1)).toHaveFocus();
    options.at(-1)!.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(options[0]).toHaveFocus();
  });

  it("exposes crossword rows, cells and clue relationships to assistive technology", () => {
    render(<CrosswordGame words={wordSet.words} onFinish={vi.fn()} />);

    expect(screen.getByRole("grid", { name: "Lưới ô chữ" })).toHaveAttribute("aria-readonly", "false");
    expect(screen.getAllByRole("row")[0]).toHaveAttribute("aria-label", "Hàng 1");
    expect(screen.getAllByRole("gridcell")[0]).toHaveAttribute("aria-label", expect.stringMatching(/^Ô chữ hàng \d+ cột \d+$/));
    expect(screen.getAllByRole("textbox")[0]).toHaveAttribute("aria-describedby");
  });

  it("types once and backspaces along the selected vertical crossword entry", () => {
    render(<CrosswordGame words={wordSet.words} onFinish={vi.fn()} />);
    const vertical = screen.getAllByRole("textbox").find((input) => input.getAttribute("aria-describedby")?.includes("crossword-clue-down"));
    expect(vertical).toBeDefined();
    fireEvent.focus(vertical!);
    fireEvent.keyDown(vertical!, { key: "ArrowDown" });
    const next = document.activeElement as HTMLInputElement;
    expect(next).not.toBe(vertical);
    fireEvent.keyDown(next, { key: "a" });
    expect(next).toHaveFocus();
    fireEvent.change(next, { target: { value: "a" } });
    const afterTyped = document.activeElement as HTMLInputElement;
    expect(next).toHaveValue("A");
    expect(afterTyped).toHaveValue("");
    fireEvent.keyDown(afterTyped, { key: "Backspace" });
    expect(next).toHaveValue("");
    expect(next).toHaveFocus();
  });

  it("uses the same SVG game identity in the outer title and tutorial", () => {
    const catchGame = descriptor("eggs", []);
    catchGame.icon = "🥚";
    catchGame.name = "Season catch";
    const { container } = render(<LearnerGame descriptor={catchGame} wordSet={wordSet} result={null} actions={actions} />);

    expect(screen.getByRole("heading", { name: "Season catch" })).toBeInTheDocument();
    expect(container.querySelector(".game-title-icon .lucide-shopping-basket")).toBeInTheDocument();
    expect(container.querySelector(".game-tutorial-hero-icon .lucide-shopping-basket")).toBeInTheDocument();
    expect(screen.queryByText("🥚")).not.toBeInTheDocument();
  });

  it("keeps Season-rio help concise and accurate about gate behavior", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<SeasonRioGame words={wordSet.words} onFinish={vi.fn()} />);

    expect(screen.getByText(/trả lời xong cổng mở/i)).toBeInTheDocument();
    expect(screen.queryByText(/đúng mới mở cổng/i)).not.toBeInTheDocument();
  });

  it("scopes movement keys to the focused playfield in both seasonal games", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const rio = render(<><SeasonRioGame words={wordSet.words} onFinish={vi.fn()} /><button type="button">Ngoài Season-rio</button></>);
    expect(screen.getByRole("application", { name: "Màn chơi Season-rio" })).toHaveFocus();
    const outsideRio = screen.getByRole("button", { name: "Ngoài Season-rio" });
    outsideRio.focus();
    const rioArrow = createEvent.keyDown(outsideRio, { key: "ArrowRight" });
    fireEvent(outsideRio, rioArrow);
    expect(rioArrow.defaultPrevented).toBe(false);
    rio.unmount();

    render(<><SeasonCatchGame words={wordSet.words} cefr="A2" onFinish={vi.fn()} /><button type="button">Ngoài Season catch</button></>);
    expect(screen.getByRole("application", { name: "Màn chơi Season catch" })).toHaveFocus();
    const outsideCatch = screen.getByRole("button", { name: "Ngoài Season catch" });
    outsideCatch.focus();
    const catchArrow = createEvent.keyDown(outsideCatch, { key: "ArrowRight" });
    fireEvent(outsideCatch, catchArrow);
    expect(catchArrow.defaultPrevented).toBe(false);
    expect(screen.getByTestId("catch-basket")).toHaveStyle({ left: "50%" });
  });

  it("shows a recoverable error when weekly vocabulary cannot be loaded", async () => {
    const useWeeklyGameSet = vi.fn().mockRejectedValue(new Error("network"));
    render(<LearnerGames view={hubView} actions={{ ...actions, useWeeklyGameSet } as unknown as LearnerCallbacks} />);

    fireEvent.click(screen.getByRole("button", { name: "Dùng từ vựng tuần này" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được từ vựng tuần này. Vui lòng thử lại.");
    expect(screen.getByRole("button", { name: "Dùng từ vựng tuần này" })).not.toBeDisabled();
  });

  it("keeps natural-topic generation open before the learner has selected a word set", () => {
    render(<LearnerGames view={{ ...hubView, aiAvailable: true, wordSet: null }} actions={actions as unknown as LearnerCallbacks} />);

    const topic = screen.getByRole("textbox", { name: "Chủ đề bộ từ" });
    fireEvent.change(topic, { target: { value: "Coffee shop conversations" } });

    expect(screen.getByRole("button", { name: "Tạo bộ từ" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: /Chơi / })).not.toBeInTheDocument();
    expect(screen.getByText("Tạo một bộ từ để bắt đầu chơi.")).toBeInTheDocument();
  });
});
