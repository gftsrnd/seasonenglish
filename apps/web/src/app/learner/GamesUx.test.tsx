// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameDescriptor, GameHubView, GameWordSetView } from "@e4s/contracts";
import { CrosswordGame } from "../games/CrosswordGame.js";
import { SeasonCatchGame } from "../games/SeasonCatchGame.js";
import { SeasonRioGame } from "../games/SeasonRioGame.js";
import { TypingRaceGame } from "../games/TypingRaceGame.js";
import { LearnerGame, LearnerGames } from "./Games.js";
import type { LearnerCallbacks } from "./contracts.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
  it("keeps hub descriptions concise while preserving each game's core action", () => {
    render(<LearnerGames view={hubView} actions={actions} />);

    expect(screen.getByText("Hứng đúng vật phẩm, giữ 3 mạng.")).toBeInTheDocument();
    expect(screen.queryByText(/mang đúng từ: lá \(thu\)/i)).not.toBeInTheDocument();
  });

  it("mirrors the canonical Season-rio tutorial content and controls", async () => {
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

    expect(screen.getByRole("heading", { name: "🍄 Season-rio" })).toBeInTheDocument();
    expect(screen.getByText("Kỷ lục: chưa có")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thoát game" })).toHaveClass("btn", "btn-sm");
    expect(screen.getByText("Hướng dẫn chơi", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Mỗi hộp quà \? đứng trên một cột gỗ chắn ngang đường/i)).toBeInTheDocument();
    expect(screen.getByText(/món ăn khoái khẩu KHỔNG LỒ/i)).toBeInTheDocument();
    expect(screen.getByText(/Bộ từ: Introducing yourself · 3 từ/i)).toBeInTheDocument();
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

  it("renders attributed open media in the typing clue", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const onResolveImage = vi.fn().mockResolvedValue({
      status: "available",
      imageUrl: "https://storage.example/colleague.jpg",
      alt: "colleague",
      attribution: {
        creator: "Open artist",
        licence: "CC BY 4.0",
        licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Colleague.jpg"
      }
    });
    render(<TypingRaceGame words={[wordSet.words[0]!]} onFinish={vi.fn()} onResolveImage={onResolveImage} />);

    expect(await screen.findByRole("img", { name: "colleague" })).toHaveAttribute("src", "https://storage.example/colleague.jpg");
    expect(screen.getByText("Nguồn ảnh")).toBeInTheDocument();
    expect(onResolveImage).toHaveBeenCalledWith("word-1");
  });

  it("shows a compact fallback for unavailable and legacy image-less words", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const view = render(<TypingRaceGame words={[wordSet.words[0]!]} onFinish={vi.fn()} onResolveImage={() => Promise.resolve({ status: "unavailable" })} />);
    expect(await screen.findByText("Chưa có ảnh minh hoạ")).toBeInTheDocument();

    view.rerender(<TypingRaceGame words={[wordSet.words[0]!]} onFinish={vi.fn()} />);
    expect(await screen.findByText("Chưa có ảnh minh hoạ")).toBeInTheDocument();
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

  it("exposes crossword rows, cells and clue relationships to assistive technology", () => {
    render(<CrosswordGame words={wordSet.words} onFinish={vi.fn()} />);

    expect(screen.getByRole("grid", { name: "Lưới ô chữ" })).toHaveAttribute("aria-readonly", "false");
    expect(screen.getAllByRole("row")[0]).toHaveAttribute("aria-label", "Hàng 1");
    expect(screen.getAllByRole("gridcell")[0]).toHaveAttribute("aria-label", expect.stringMatching(/^Ô chữ hàng \d+ cột \d+$/));
    expect(screen.getAllByRole("textbox")[0]).toHaveAttribute("aria-describedby");
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
});
