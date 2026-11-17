// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameDescriptor, GameHubView, GameWordSetView } from "@e4s/contracts";
import { CrosswordGame } from "../games/CrosswordGame.js";
import { ThemeProvider } from "../shared/ThemeProvider.js";
import { SeasonCatchGame } from "../games/SeasonCatchGame.js";
import { SeasonRioGame } from "../games/SeasonRioGame.js";
import { TypingRaceGame } from "../games/TypingRaceGame.js";
import { WordSortGame } from "../games/WordSortGame.js";
import { prepareGameAttempt } from "../games/types.js";
import { createGameAttemptSeed, nextGameAttemptSeed, LearnerGame, LearnerGames } from "./Games.js";
import { ModalProvider } from "../shared/ModalProvider.js";
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
  resolveGameWordImage: vi.fn().mockResolvedValue({ status: "unavailable" }),
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
  ],
  arena: { eligible: false, requiredLevel: "B1", points: 0, pendingDuels: 0 }
};

describe("learner game visual and interaction regressions", () => {
  it("does not start Word Sort with fewer than four valid part-of-speech words", () => {
    render(<WordSortGame words={wordSet.words} onFinish={vi.fn()} />);

    expect(screen.getByText("Cần ít nhất 4 từ có thông tin từ loại để bắt đầu.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Nhóm từ loại" })).not.toBeInTheDocument();
  });

  it("uses the current season's supplied Catch scene and keeps the four-item cap", () => {
    localStorage.setItem("e4s:organisation-theme", "autumn");
    const catchView = render(<ThemeProvider><SeasonCatchGame words={wordSet.words} cefr="A2" onFinish={vi.fn()} /></ThemeProvider>);
    expect(catchView.container.querySelector('.season-stage-background')).toHaveAttribute("src", "/media/games/seven-seasons/seasons/thu/background.svg");
    expect(catchView.container.querySelector('.falling-item img[src$="/drop.svg"]')).toBeInTheDocument();
    expect(catchView.container.querySelector('.catch-hero img')).toHaveAttribute("alt", "Sóc cầm rổ");
    expect(catchView.container.querySelectorAll('.game-lives img[src$="/heart.svg"]')).toHaveLength(3);
    expect(screen.getAllByTestId("falling-item")).toHaveLength(3);
    localStorage.removeItem("e4s:organisation-theme");
  });

  it("keeps Rio's existing gate layout", () => {
    document.documentElement.dataset.theme = "autumn";
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    localStorage.setItem("e4s:organisation-theme", "autumn");
    const rioView = render(<ThemeProvider><SeasonRioGame words={wordSet.words} onFinish={vi.fn()} /></ThemeProvider>);
    expect(rioView.container.querySelector('.gift-gate img[src$="/chest.svg"]')).toBeInTheDocument();
    expect(within(screen.getAllByTestId("gift-gate")[0]!).queryByText("?")).not.toBeInTheDocument();
    expect(rioView.container.querySelector('.gift-gate img[src$="/gate-post.svg"]')).toBeInTheDocument();
    expect(rioView.container.querySelector('.rio-platform[src$="/platform.svg"]')).toBeInTheDocument();
    expect(rioView.container.querySelector('.rio-boss img')).toHaveAttribute("alt", "Hạt dẻ");
    expect(rioView.container.querySelector('.rio-flag')).toHaveAttribute("aria-label", "Cột mốc về đích");
    expect(rioView.container.querySelector('.rio-flag img')).toHaveAttribute("src", "/media/games/seven-seasons/seasons/thu/finish-flag.svg");
    expect(rioView.container.querySelector('.rio-hero img')).toHaveAttribute("alt", "Sóc");
    localStorage.removeItem("e4s:organisation-theme");
    expect(screen.getAllByTestId("gift-gate")).toHaveLength(3);
    expect(screen.getAllByTestId("gift-gate").map((gate) => gate.dataset.state)).toEqual(["closed", "closed", "closed"]);
  });

  it("keeps hub descriptions concise while preserving each game's core action", () => {
    render(<LearnerGames view={hubView} actions={actions} />, { wrapper: ModalProvider });

    expect(screen.getByText("Hứng đúng vật phẩm, giữ 3 mạng.")).toBeInTheDocument();
    expect(screen.queryByText(/mang đúng từ: lá \(thu\)/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chơi Season-rio" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chơi Đua gõ từ" })).toBeInTheDocument();
  });

  it("gives all six ready tiles the same background", () => {
    const compatibleWords = { ...wordSet, words: [
      ...wordSet.words,
      { id: "word-4", english: "organize", vietnamese: "tổ chức", definition: "arrange things", partOfSpeech: "verb" as const }
    ] };
    render(<LearnerGames view={{ ...hubView, wordSet: compatibleWords }} actions={actions} />, { wrapper: ModalProvider });

    const ready = within(screen.getByRole("region", { name: /Chọn trò chơi/ })).getAllByRole("link", { name: /^Chơi / });
    expect(ready).toHaveLength(6);
    expect(new Set(ready.map((tile) => tile.style.background)).size).toBe(1);
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
    render(<LearnerGames view={{ ...hubView, wordSet: incompatibleWords }} actions={actions} />, { wrapper: ModalProvider });

    expect(screen.getByRole("button", { name: "Ô chữ chưa sẵn sàng" })).toBeDisabled();
    expect(screen.getByText("Cần ít nhất 3 từ có chữ cái chung.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phân loại từ chưa sẵn sàng" })).toBeDisabled();
    expect(screen.getByText("Cần ít nhất 4 từ có thông tin từ loại.")).toBeInTheDocument();
    const ready = screen.getByRole("link", { name: "Chơi Xếp chữ" });
    const locked = screen.getByRole("button", { name: "Ô chữ chưa sẵn sàng" });
    expect(ready.style.background).not.toBe(locked.style.background);
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

  it("derives the Typing race tutorial word count and max score from the actual word set", () => {
    const typing = descriptor("typing", []);
    typing.name = "Typing race";
    typing.goal = "Gõ đúng 10 từ thật nhanh, giữ chuỗi combo càng dài càng nhiều điểm.";
    typing.scoring = "10 điểm × combo cho mỗi từ đúng; tối đa 10 từ.";
    const eightWords: GameWordSetView = { ...wordSet, words: Array.from({ length: 8 }, (_, index) => ({ id: `w-${index}`, english: `word${"abcdefgh"[index]}`, vietnamese: `từ ${index}`, definition: "a word", partOfSpeech: "noun" })) };
    render(<LearnerGame descriptor={typing} wordSet={eightWords} result={null} actions={actions} />);

    expect(screen.getByText("Gõ đúng 8 từ thật nhanh, giữ chuỗi combo càng dài càng nhiều điểm.")).toBeInTheDocument();
    expect(screen.getByText(/10 điểm × combo cho mỗi từ đúng; 8 từ, tối đa 300 điểm\./)).toBeInTheDocument();
    expect(screen.queryByText(/10 từ/)).not.toBeInTheDocument();
  });

  it("derives Scramble and Season catch round counts from the word set", () => {
    const scramble = descriptor("scramble", []);
    scramble.goal = "Xếp đúng càng nhiều từ càng tốt (8 từ).";
    const { unmount } = render(<LearnerGame descriptor={scramble} wordSet={wordSet} result={null} actions={actions} />);
    expect(screen.getByText("Xếp đúng càng nhiều từ càng tốt (3 từ).")).toBeInTheDocument();
    unmount();
    const eggs = { ...descriptor("eggs", []), goal: "Hứng đúng vật phẩm khớp với gợi ý, 10 lượt.", scoring: "+1 điểm mỗi vật phẩm hứng đúng, tối đa 10." };
    render(<LearnerGame descriptor={eggs} wordSet={wordSet} result={null} actions={actions} />);
    expect(screen.getByText("Hứng đúng vật phẩm khớp với gợi ý, 3 lượt.")).toBeInTheDocument();
    expect(screen.getByText(/\+1 điểm mỗi vật phẩm hứng đúng, tối đa 3\./)).toBeInTheDocument();
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


  it("plays Typing race without requesting vocabulary artwork", () => {
    const resolveGameWordImage = vi.fn().mockResolvedValue({ status: "unavailable" });
    const typing = descriptor("typing", []);
    render(<LearnerGame descriptor={typing} wordSet={wordSet} result={null} actions={{ ...actions, resolveGameWordImage } as unknown as LearnerCallbacks} />);

    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));

    const scene = screen.getByRole("application", { name: "Màn chơi Đua gõ từ" });
    expect(resolveGameWordImage).not.toHaveBeenCalled();
    expect(within(scene).getByText("Gợi ý")).toBeVisible();
    expect(within(scene).getByRole("button", { name: /^Nghe / })).toBeEnabled();
  });

  it("omits a Typing illustration even when the word already has an image URL", () => {
    render(<TypingRaceGame words={[{ ...wordSet.words[0]!, imageUrl: "https://example.invalid/colleague.jpg" }]} onFinish={vi.fn()} />);

    const scene = screen.getByRole("application", { name: "Màn chơi Đua gõ từ" });
    expect(within(scene).getByText("đồng nghiệp")).toBeVisible();
    expect(within(scene).getByText(/a co-worker · 9 chữ cái/)).toBeVisible();
    expect(within(scene).queryByRole("img")).not.toBeInTheDocument();
    expect(scene.querySelector(".typing-clue-image")).toBeNull();
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

  it("drains the Typing race time bar continuously over the word's time limit and restarts it for the next word", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"] });
    try {
      const onFinish = vi.fn();
      // "role" → 4 000 ms limit; "menu" → 4 000 ms limit.
      render(<TypingRaceGame words={[
        { id: "role", english: "role", vietnamese: "vai trò", definition: "a job function", partOfSpeech: "noun" },
        { id: "menu", english: "menu", vietnamese: "thực đơn", definition: "a list of food", partOfSpeech: "noun" }
      ]} onFinish={onFinish} />);
      const bar = () => screen.getByRole("progressbar", { name: "Thời gian còn lại" });
      const fill = () => screen.getByTestId("typing-timer-fill");
      const left = () => fill().style.getPropertyValue("--typing-time-left");
      const firstFill = fill();

      // The visual drain is one CSS animation lasting the whole time limit, not a per-frame width.
      expect(fill().style.getPropertyValue("--typing-time-limit")).toBe("4000ms");
      expect(fill()).not.toHaveClass("is-paused");
      expect(left()).toBe("100%");
      expect(bar()).toHaveAttribute("aria-valuenow", "4000");

      // Intermediate values step down once per second (used for aria and reduced motion).
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(left()).toBe("75%");
      expect(bar()).toHaveAttribute("aria-valuenow", "3000");
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(left()).toBe("50%");
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(left()).toBe("25%");
      expect(fill()).toBe(firstFill);

      // At the limit the round times out, the bar freezes at 0 while the answer shows…
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(left()).toBe("0%");
      expect(fill()).toHaveClass("is-paused");
      expect(screen.getByText(/Hết giờ/)).toBeInTheDocument();

      // …then the next word starts with a fresh, full bar (new element → animation restarts).
      act(() => { vi.advanceTimersByTime(1_200); });
      expect(screen.getByRole("heading", { name: "Từ 2/2" })).toBeInTheDocument();
      expect(fill()).not.toBe(firstFill);
      expect(fill()).not.toHaveClass("is-paused");
      expect(left()).toBe("100%");
      act(() => { vi.advanceTimersByTime(2_000); });
      expect(left()).toBe("50%");
      expect(onFinish).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("advances Typing race as soon as the word is typed correctly, without Enter", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"] });
    try {
      const onFinish = vi.fn();
      const { container } = render(<TypingRaceGame words={[
        { id: "role", english: "role", vietnamese: "vai trò", definition: "a job function", partOfSpeech: "noun" },
        { id: "menu", english: "menu", vietnamese: "thực đơn", definition: "a list of food", partOfSpeech: "noun" }
      ]} onFinish={onFinish} />);
      const first = screen.queryByText("vai trò") ? "role" : "menu";
      const second = first === "role" ? "menu" : "role";
      for (const key of first.slice(0, -1)) fireEvent.keyDown(window, { key });
      expect(screen.queryByText(/^Đúng/)).not.toBeInTheDocument();
      fireEvent.keyDown(window, { key: first.slice(-1).toUpperCase() });
      expect(screen.getByText(`Đúng · ${first}`)).toBeInTheDocument();
      expect(container.querySelector(".game-hud strong")).toHaveTextContent(/^10\//);
      act(() => { vi.advanceTimersByTime(500); });
      expect(screen.getByRole("heading", { name: "Từ 2/2" })).toBeInTheDocument();
      expect(screen.getByText("Combo ×2")).toBeInTheDocument();
      for (const key of second) fireEvent.keyDown(window, { key });
      act(() => { vi.advanceTimersByTime(500); });
      expect(onFinish).toHaveBeenCalledWith({ answers: [
        expect.objectContaining({ wordId: first, answer: first, combo: 1 }),
        expect.objectContaining({ wordId: second, answer: second, combo: 2 })
      ] });
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows wrong feedback only once every Typing race slot is filled with a wrong word", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"] });
    try {
      const onFinish = vi.fn();
      const { container } = render(<TypingRaceGame words={[{ id: "role", english: "role", vietnamese: "vai trò", definition: "a job function", partOfSpeech: "noun" }]} onFinish={onFinish} />);
      for (const key of "rol") fireEvent.keyDown(window, { key });
      expect(screen.queryByText(/Chưa đúng/)).not.toBeInTheDocument();
      fireEvent.keyDown(window, { key: "x" });
      expect(screen.getByText("Chưa đúng · Thử lại nhé.")).toBeInTheDocument();
      expect(container.querySelectorAll('[data-testid="typing-character"]:not(:empty)')).toHaveLength(0);
      act(() => { vi.advanceTimersByTime(1_500); });
      expect(onFinish).not.toHaveBeenCalled();
      // The learner can retry the same word and it still auto-advances when right.
      for (const key of "role") fireEvent.keyDown(window, { key });
      fireEvent.keyDown(window, { key: "Enter" });
      act(() => { vi.advanceTimersByTime(500); });
      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(onFinish).toHaveBeenCalledWith({ answers: [expect.objectContaining({ wordId: "role", answer: "role", combo: 1 })] });
    } finally {
      vi.useRealTimers();
    }
  });

  it("has no on-screen Enter key and keeps a centred backspace key that still deletes", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { container } = render(<TypingRaceGame words={[{ id: "role", english: "role", vietnamese: "vai trò", definition: "a job function", partOfSpeech: "noun" }]} onFinish={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Nhập" })).not.toBeInTheDocument();
    expect(container.querySelector(".is-enter")).toBeNull();
    const actionsRow = container.querySelector(".keyboard-row--actions")!;
    const backspace = within(actionsRow as HTMLElement).getByRole("button", { name: "Xoá ký tự cuối" });
    expect(backspace).toHaveClass("is-backspace");
    expect(actionsRow.children).toHaveLength(1);
    const typedText = () => screen.getAllByTestId("typing-character").map((item) => item.textContent).join("");
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.keyDown(window, { key: "o" });
    fireEvent.click(backspace);
    expect(typedText()).toBe("R");
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(typedText()).toBe("");
  });

  it("presses the matching on-screen key down while a physical key is held", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { container } = render(<TypingRaceGame words={[{ id: "role", english: "role", vietnamese: "vai trò", definition: "a job function", partOfSpeech: "noun" }]} onFinish={vi.fn()} />);
    const key = (name: string) => container.querySelector<HTMLButtonElement>(`.virtual-keyboard button[data-key="${name}"]`)!;
    expect(container.querySelectorAll(".virtual-keyboard button:not([data-key])")).toHaveLength(0);

    fireEvent.keyDown(window, { key: "R" });
    expect(key("r")).toHaveClass("is-pressed", "is-hit");
    expect(container.querySelectorAll(".virtual-keyboard .is-pressed")).toHaveLength(1);
    fireEvent.keyUp(window, { key: "R" });
    expect(key("r")).not.toHaveClass("is-pressed");

    fireEvent.keyDown(window, { key: "x" });
    expect(key("x")).toHaveClass("is-pressed", "is-miss");
    fireEvent.keyUp(window, { key: "x" });
    expect(key("x")).not.toHaveClass("is-pressed");

    fireEvent.keyDown(window, { key: "Backspace" });
    expect(key("backspace")).toHaveClass("is-pressed", "is-backspace");
    fireEvent.keyUp(window, { key: "Backspace" });
    expect(key("backspace")).not.toHaveClass("is-pressed");
  });

  it("maps space to its on-screen key and presses a clicked key briefly", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"] });
    try {
      const { container } = render(<TypingRaceGame words={[{ id: "ice-cream", english: "ice cream", vietnamese: "kem", definition: "a frozen dessert", partOfSpeech: "noun" }]} onFinish={vi.fn()} />);
      const key = (name: string) => container.querySelector<HTMLButtonElement>(`.virtual-keyboard button[data-key="${name}"]`)!;
      expect(key("space")).toHaveTextContent("Dấu cách");

      fireEvent.keyDown(window, { key: " " });
      expect(key("space")).toHaveClass("is-pressed");
      fireEvent.keyUp(window, { key: " " });
      expect(key("space")).not.toHaveClass("is-pressed");

      fireEvent.click(key("backspace"));
      fireEvent.click(key("i"));
      expect(key("i")).toHaveClass("is-pressed", "is-hit");
      expect(screen.getAllByTestId("typing-character")[0]).toHaveTextContent("I");
      act(() => { vi.advanceTimersByTime(200); });
      expect(key("i")).not.toHaveClass("is-pressed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps one exit choice on a completed game result", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const oneWordSet = { ...wordSet, words: [{ id: "role", english: "role", vietnamese: "vai trò", definition: "a job function", partOfSpeech: "noun" }] };
    render(<LearnerGame descriptor={descriptor("typing", [])} wordSet={oneWordSet} result={{ score: 10, maxScore: 10 }} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));
    for (const key of "role") fireEvent.keyDown(window, { key });
    await screen.findByRole("heading", { name: "Điểm của bạn" });
    expect(screen.getByRole("link", { name: "Chọn trò khác" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Thoát" })).not.toBeInTheDocument();
  });

  it("keeps keyboard focus inside the open Season-rio quiz", async () => {
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<SeasonRioGame words={wordSet.words} onFinish={vi.fn()} />);

    const right = screen.getByRole("button", { name: "Sang phải" });
    const hero = screen.getByTestId("season-rio-hero");
    fireEvent.pointerDown(right, { pointerId: 4 });
    expect(hero).toHaveClass("is-running");
    fireEvent.keyDown(screen.getByRole("application", { name: "Màn chơi Season-rio" }), { key: "ArrowUp" });
    for (let index = 0; index < 80 && !screen.queryByRole("dialog"); index += 1) {
      await act(async () => {
        const callback = frames.shift();
        if (!callback) return;
        now += 17;
        callback(now);
      });
    }
    fireEvent.pointerUp(right, { pointerId: 4 });
    expect(Number.parseFloat((hero as HTMLElement).style.left)).toBeGreaterThan(40);

    const dialog = await screen.findByRole("dialog");
    await act(async () => {
      const callback = frames.shift();
      if (callback) callback(now + 17);
    });
    const options = within(dialog).getAllByRole("button");
    // Opening a gate must not imply a choice: the dialog receives focus, while
    // every answer remains neutral until the learner explicitly navigates.
    expect(dialog).toHaveFocus();
    expect(options).not.toContain(document.activeElement);
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

  it("focuses the matching word when a crossword clue is activated", () => {
    render(<CrosswordGame words={wordSet.words} onFinish={vi.fn()} />);

    const clue = screen.getByRole("region", { name: "Gợi ý dọc" }).querySelector("button")!;
    fireEvent.click(clue);
    const input = document.activeElement as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("aria-describedby")).toContain(clue.parentElement!.id);
    fireEvent.keyDown(input, { key: "a" });
    expect(input).toHaveValue("A");
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
    const afterTyped = document.activeElement as HTMLInputElement;
    expect(next).toHaveValue("A");
    expect(afterTyped).not.toBe(next);
    expect(afterTyped).toHaveValue("");
    fireEvent.keyDown(afterTyped, { key: "Backspace" });
    expect(next).toHaveValue("");
    expect(next).toHaveFocus();
  });

  it("switches a crossing cell between horizontal and vertical word entry", () => {
    const { container } = render(<CrosswordGame words={wordSet.words} onFinish={vi.fn()} />);
    const crossing = screen.getAllByRole("textbox").find((input) => (input.getAttribute("aria-describedby")?.match(/crossword-clue-/g)?.length ?? 0) > 1);
    expect(crossing).toBeDefined();
    fireEvent.click(crossing!);
    expect(container.querySelector(".crossword-mode")).toHaveTextContent("Ngang");
    fireEvent.click(crossing!);
    expect(container.querySelector(".crossword-mode")).toHaveTextContent("Dọc");
    fireEvent.keyDown(crossing!, { key: "a" });
    expect(document.activeElement).not.toBe(crossing);
  });

  it("writes one physical crossword key once and gives a hint only for the selected word", () => {
    const { container } = render(<CrosswordGame words={wordSet.words} onFinish={vi.fn()} />);
    const crossing = screen.getAllByRole("textbox").find((input) => (input.getAttribute("aria-describedby")?.match(/crossword-clue-/g)?.length ?? 0) > 1)!;
    fireEvent.click(crossing);
    const activeClue = container.querySelector(".crossword-active-clue")?.textContent;
    fireEvent.keyDown(crossing, { key: "a" });
    expect(crossing).toHaveValue("A");
    expect(screen.getAllByRole("textbox").filter((input) => (input as HTMLInputElement).value === "A")).toHaveLength(1);
    expect(container.querySelector(".crossword-active-clue")).toHaveTextContent(activeClue ?? "");
    expect(screen.getByRole("button", { name: "Gợi ý 1 chữ" })).toBeEnabled();
  });

  it("starts every game session from a fresh shared attempt seed", () => {
    const firstSeed = createGameAttemptSeed(() => .01);
    const secondSeed = createGameAttemptSeed(() => .02);
    expect(firstSeed).not.toBe(secondSeed);
    expect(createGameAttemptSeed(() => .999999)).toBeLessThanOrEqual(10_000);
    expect(nextGameAttemptSeed(firstSeed)).toBe(firstSeed + 1);
    expect(nextGameAttemptSeed(10_000)).toBe(0);
    expect(prepareGameAttempt(wordSet.words, firstSeed).map((word) => word.id)).not.toEqual(prepareGameAttempt(wordSet.words, secondSeed).map((word) => word.id));
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

  it("moves the Season catch basket itself with the focused keyboard playfield", () => {
    render(<SeasonCatchGame words={wordSet.words} cefr="A2" onFinish={vi.fn()} />);
    const scene = screen.getByRole("application", { name: "Màn chơi Season catch" });
    const basket = screen.getByTestId("catch-basket");
    scene.focus();
    fireEvent.keyDown(scene, { key: "ArrowRight" });
    expect(basket).toHaveStyle({ left: "55%" });
    expect(basket.querySelector(".season-catch-player")).toBeInTheDocument();
  });

  it("shows a recoverable error when removing the active vocabulary set fails", async () => {
    const deleteGameSet = vi.fn().mockRejectedValue(new Error("network"));
    render(<LearnerGames view={hubView} actions={{ ...actions, deleteGameSet } as unknown as LearnerCallbacks} />, { wrapper: ModalProvider });

    fireEvent.click(screen.getByRole("button", { name: "Xoá bộ này" }));
    const dialog = await screen.findByRole("dialog", { name: "Xoá bộ từ đang dùng?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Xoá bộ từ" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Không xoá được bộ từ. Vui lòng thử lại.");
    expect(screen.getByRole("button", { name: "Xoá bộ này" })).not.toBeDisabled();
  });

  it("keeps natural-topic generation open before the learner has selected a word set", () => {
    render(<LearnerGames view={{ ...hubView, aiAvailable: true, wordSet: null }} actions={actions as unknown as LearnerCallbacks} />, { wrapper: ModalProvider });

    const topic = screen.getByRole("textbox", { name: "Chủ đề bộ từ" });
    fireEvent.change(topic, { target: { value: "Coffee shop conversations" } });

    expect(screen.getByRole("button", { name: "Tạo bộ từ" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: /Chơi / })).not.toBeInTheDocument();
    expect(screen.getByText("Chưa có bộ từ.")).toBeInTheDocument();
  });
});
