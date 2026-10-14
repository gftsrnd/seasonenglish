// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Arena, Duel, Game, Games, Practice, Reward, Survey } from "../src/pages/learner/index.js";
import type { ArenaView, DuelView, GameHubView, WeeklyPracticeView } from "@e4s/contracts";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

const wordSet = {
  id: "set-1", topic: "Tuần 1: Introducing yourself & your job", cefr: "A2" as const,
  source: "weekly" as const,
  words: [
    { id: "colleague", english: "colleague", vietnamese: "đồng nghiệp", definition: "a person you work with", partOfSpeech: "noun" },
    { id: "prepare", english: "prepare", vietnamese: "chuẩn bị", definition: "make ready", partOfSpeech: "verb" },
    { id: "deadline", english: "deadline", vietnamese: "hạn chót", definition: "the latest time to finish", partOfSpeech: "noun" },
    { id: "manager", english: "manager", vietnamese: "quản lý", definition: "a person who leads a team", partOfSpeech: "noun" },
    { id: "update", english: "update", vietnamese: "cập nhật", definition: "give the latest information", partOfSpeech: "verb" },
    { id: "client", english: "client", vietnamese: "khách hàng", definition: "a person using a service", partOfSpeech: "noun" },
    { id: "project", english: "project", vietnamese: "dự án", definition: "a planned piece of work", partOfSpeech: "noun" },
    { id: "careful", english: "careful", vietnamese: "cẩn thận", definition: "giving close attention", partOfSpeech: "adjective" },
    { id: "quickly", english: "quickly", vietnamese: "nhanh chóng", definition: "at a fast speed", partOfSpeech: "adverb" },
    { id: "report", english: "report", vietnamese: "báo cáo", definition: "give information about progress", partOfSpeech: "verb" },
    { id: "in-charge", english: "in charge of", vietnamese: "phụ trách", definition: "responsible for something", partOfSpeech: "phrase" },
    { id: "with", english: "with", vietnamese: "với", definition: "together with", partOfSpeech: "preposition" }
  ]
};

const gameRows = [
  ["scramble", "🔤", "Word scramble"], ["crossword", "🧩", "Crosswords"], ["eggs", "🧺", "Season catch"],
  ["mario", "🍄", "Season-rio"], ["sort", "🗂️", "Word sort"], ["typing", "⌨️", "Typing race"]
] as const;
const games: GameHubView["games"] = gameRows.map(([key, icon, name]) => ({
  key, icon, name,
  description: `${name} description`, goal: `${name} goal`, instructions: ["Bước một", "Bước hai"], scoring: "+1", best: null
}));

describe("engagement screens preserve Thu's visible flow", () => {
  it("keeps locked, open and submitted weekly-practice states in one screen", () => {
    const locked: WeeklyPracticeView = {
      state: "locked", weekId: "week-1", weekNumber: 1, topic: "Introducing yourself & your job",
      completedLessons: 2, totalLessons: 5, task: "Introduce your role", guidance: "Write 8 words", submission: null
    };
    const { rerender } = render(<Practice view={locked} onSubmit={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /bài thực hành cuối tuần/i })).toBeInTheDocument();
    expect(screen.getByText(/xong đủ 5 bài/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");

    rerender(<Practice view={{ ...locked, state: "open", completedLessons: 5 }} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/bài viết tiếng anh/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nộp bài/i })).toBeInTheDocument();
  });

  it("keeps six games, Arena and Reward as distinct destinations", () => {
    render(<Games view={{ cefr: "A2", aiAvailable: true, wordSet, games, arena: { eligible: false, requiredLevel: "B1", points: 0, pendingDuels: 0 } }}
      aiAvailable onGenerate={vi.fn()} onUseWeekly={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getAllByRole("link", { name: /word scramble|crosswords|season catch|season-rio|word sort|typing race/i })).toHaveLength(6);
    expect(screen.getByRole("link", { name: /đấu trường nội bộ/i })).toHaveAttribute("href", "/arena");
    expect(screen.queryByText(/chứng nhận hoàn thành/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/coffee shop/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tạo bộ từ/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dùng từ vựng tuần này/i })).toBeInTheDocument();
  });

  it("shows the game tutorial before play and submits evidence rather than a client score", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const shortSet = { ...wordSet, words: [
      { id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun" },
      { id: "dog", english: "dog", vietnamese: "con chó", definition: "a loyal pet", partOfSpeech: "noun" }
    ] };
    render(<Game descriptor={games[0]!} wordSet={shortSet} onFinish={onFinish} />);
    expect(screen.getByText(/hướng dẫn chơi/i)).toBeInTheDocument();
    expect(screen.getByTestId("season-mark")).toBeInTheDocument();
    expect(screen.queryByText("◆")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    expect(screen.getByText(/từ 1\/2/i)).toBeInTheDocument();
    for (const letter of "cat") await user.click(screen.getByRole("button", { name: new RegExp(`^chữ ${letter} `, "i") }));
    expect(screen.getByRole("heading", { name: "Từ 1/2" })).toBeInTheDocument();
    expect(screen.getByText(/cat \+2/i)).toBeInTheDocument();
    expect(await screen.findByText(/từ 2\/2/i, {}, { timeout: 1_600 })).toBeInTheDocument();
    for (const letter of "dog") await user.click(screen.getByRole("button", { name: new RegExp(`^chữ ${letter} `, "i") }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({
      answers: expect.arrayContaining([expect.objectContaining({ wordId: "cat", answer: "cat" })])
    })), { timeout: 1_600 });
    expect(onFinish.mock.calls[0]?.[0]).not.toHaveProperty("score");
  });

  it("keeps GAME OVER inside the same game screen instead of opening a result screen", async () => {
    const result = {
      id: "result-1", game: "scramble" as const, score: 3, maxScore: 4,
      correct: 2, total: 2, completedAt: "2026-10-13T10:00:00.000Z"
    };
    render(<Game descriptor={games[0]!} wordSet={wordSet} result={result} onFinish={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: /word scramble/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /game over/i })).toBeInTheDocument();
    expect(screen.getByText("3 / 4")).toBeInTheDocument();
    expect(screen.getByText(/bộ từ/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /chơi lại/i })).toBeInTheDocument();
  });

  it("uses tile attempts for Word scramble instead of a generic answer form", async () => {
    const user = userEvent.setup();
    render(<Game descriptor={games[0]!} wordSet={wordSet} onFinish={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    expect(screen.getByText(/sai 0\/2/i)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /chữ cái bị xáo trộn/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/câu trả lời/i)).not.toBeInTheDocument();
  });

  it("never opens Word scramble with the answer already arranged", async () => {
    const user = userEvent.setup();
    render(<Game descriptor={games[0]!} wordSet={{ ...wordSet, words: [
      { id: "app", english: "app", vietnamese: "ứng dụng", definition: "a software application", partOfSpeech: "noun" }
    ] }} onFinish={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    const bank = screen.getByRole("group", { name: /chữ cái bị xáo trộn/i });
    expect(Array.from(bank.querySelectorAll("button")).map((button) => button.textContent).join("")).not.toBe("app");
  });

  it("records a last-letter hint in Word scramble evidence", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<Game descriptor={games[0]!} wordSet={{ ...wordSet, words: [
      { id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun" }
    ] }} onFinish={onFinish} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    await user.click(screen.getByRole("button", { name: /^chữ c /i }));
    await user.click(screen.getByRole("button", { name: /^chữ a /i }));
    await user.click(screen.getByRole("button", { name: /gợi ý/i }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith({ answers: [expect.objectContaining({ wordId: "cat", answer: "cat", usedHint: true })] }), { timeout: 1_600 });
  });

  it("keeps the canonical spacing when Word scramble submits a phrase", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<Game descriptor={games[0]!} wordSet={{ ...wordSet, words: [
      { id: "cat-dog", english: "cat dog", vietnamese: "mèo và chó", definition: "two pets", partOfSpeech: "phrase" }
    ] }} onFinish={onFinish} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    for (const letter of "catdog") await user.click(screen.getByRole("button", { name: new RegExp(`^chữ ${letter} `, "i") }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith({ answers: [expect.objectContaining({ wordId: "cat-dog", answer: "cat dog" })] }), { timeout: 1_600 });
  });

  it("renders Crosswords as one intersecting grid with across and down clues", async () => {
    const user = userEvent.setup();
    render(<Game descriptor={games[1]!} wordSet={wordSet} onFinish={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    expect(screen.getByRole("grid", { name: /lưới ô chữ/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /gợi ý ngang/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /gợi ý dọc/i })).toBeInTheDocument();
    expect(screen.getByText(/a person you work with/i)).toBeInTheDocument();
    const cells = screen.getAllByRole("textbox", { name: /ô chữ/i });
    expect(cells.length).toBeGreaterThan(8);
    await user.click(cells[0]!);
    await user.keyboard("c");
    expect(cells[1]).toHaveFocus();
  });

  it("runs Season catch as a falling-item collision game", async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = "autumn";
    render(<Game descriptor={games[2]!} wordSet={wordSet} onFinish={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    expect(screen.getByRole("application", { name: /màn chơi season catch/i })).toBeInTheDocument();
    expect(screen.getByText(/lượt 1\/10/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("falling-item")).toHaveLength(4);
    expect(screen.getByTestId("catch-basket")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /sóc mùa thu/i })).toBeInTheDocument();
  });

  it("runs Season-rio as a platformer with eight gates, a boss and a finish flag", async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = "autumn";
    render(<Game descriptor={games[3]!} wordSet={wordSet} onFinish={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    const application = screen.getByRole("application", { name: /màn chơi season-rio/i });
    expect(application).toBeInTheDocument();
    const gates = screen.getAllByTestId("gift-gate");
    expect(gates).toHaveLength(8);
    expect(gates[0]).toHaveStyle({ left: "360px" });
    expect(screen.getAllByTestId("rio-platform")).toHaveLength(7);
    expect(screen.getByTestId("season-rio-boss")).toHaveTextContent(/hạt dẻ khổng lồ/i);
    expect(screen.getByRole("img", { name: /sóc mùa thu/i })).toBeInTheDocument();
    expect(screen.getByTestId("season-rio-flag")).toBeInTheDocument();
    const hero = screen.getByTestId("season-rio-hero");
    expect(hero).toHaveStyle({ left: "40px" });
    expect(application).toContainElement(screen.getByRole("button", { name: "Sang phải" }));
    await user.click(screen.getByRole("button", { name: "Sang phải" }));
    expect(hero).toHaveStyle({ left: "48px" });
  });

  it("keeps Thu's distinct bomb feedback when a Season-rio gate answer is wrong", async () => {
    const user = userEvent.setup();
    render(<Game descriptor={games[3]!} wordSet={wordSet} onFinish={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    const moveRight = screen.getByRole("button", { name: "Sang phải" });
    for (let step = 0; step < 34; step += 1) await user.click(moveRight);
    await screen.findByRole("dialog", { name: /câu hỏi hộp quà/i });
    await user.click(screen.getByRole("button", { name: "prepare" }));
    expect(screen.getAllByTestId("gift-gate")[0]).toHaveAttribute("data-state", "wrong");
  });

  it("keeps Word sort as a part-of-speech choice game", async () => {
    const user = userEvent.setup();
    const sortSet = { ...wordSet, words: wordSet.words.filter((word) => ["noun", "verb", "adjective", "phrase"].includes(word.partOfSpeech)).slice(0, 6) };
    render(<Game descriptor={games[4]!} wordSet={sortSet} onFinish={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    const choices = screen.getByRole("group", { name: /nhóm từ loại/i });
    expect(choices).toBeInTheDocument();
    expect(getComputedStyle(choices).display).toBe("grid");
    expect(screen.getByRole("button", { name: "Noun" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nghe colleague/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preposition" })).not.toBeInTheDocument();
  });

  it("runs Typing race with a live countdown, typed-character feedback and combo", async () => {
    const user = userEvent.setup();
    render(<Game descriptor={games[5]!} wordSet={wordSet} onFinish={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    expect(screen.getByRole("progressbar", { name: /thời gian còn lại/i })).toBeInTheDocument();
    expect(screen.getByText(/combo ×1/i)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /bàn phím ảo/i })).toBeInTheDocument();
    expect(screen.getAllByTestId("typing-character").length).toBeGreaterThan(2);
    expect(screen.queryByText("🖼️")).not.toBeInTheDocument();
  });

  it("lets the learner correct a full wrong Typing race answer before Enter", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<Game descriptor={games[5]!} wordSet={{ ...wordSet, words: [
      { id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun" }
    ] }} onFinish={onFinish} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    await user.click(screen.getByRole("button", { name: "c" }));
    await user.click(screen.getByRole("button", { name: "a" }));
    await user.click(screen.getByRole("button", { name: "x" }));
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("typing-character")[2]).toHaveClass("is-wrong");
    await user.click(screen.getByRole("button", { name: "⌫" }));
    await user.click(screen.getByRole("button", { name: "t" }));
    await user.click(screen.getByRole("button", { name: "↵" }));
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByText("✅ cat")).toBeInTheDocument();
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith({ answers: [expect.objectContaining({ wordId: "cat", answer: "cat" })] }), { timeout: 900 });
  });

  it("keeps the current Typing race word available after a wrong Enter submission", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<Game descriptor={games[5]!} wordSet={{ ...wordSet, words: [
      { id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun" }
    ] }} onFinish={onFinish} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    await user.click(screen.getByRole("button", { name: "c" }));
    await user.click(screen.getByRole("button", { name: "a" }));
    await user.click(screen.getByRole("button", { name: "r" }));
    await user.click(screen.getByRole("button", { name: "↵" }));
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Từ 1/1" })).toBeInTheDocument();
    expect(screen.getAllByTestId("typing-character").every((cell) => cell.textContent === "")).toBe(true);
  });

  it("keeps a completed game retryable when saving its result fails", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<Game descriptor={games[0]!} wordSet={{ ...wordSet, words: [
      { id: "cat", english: "cat", vietnamese: "con mèo", definition: "a small pet", partOfSpeech: "noun" }
    ] }} onFinish={onFinish} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu chơi/i }));
    await user.keyboard("cat");

    const retry = await screen.findByRole("button", { name: /thử gửi lại/i }, { timeout: 2_000 });
    expect(screen.getByRole("alert")).toHaveTextContent(/chưa lưu được kết quả/i);
    await user.click(retry);
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(2));
    expect(onFinish.mock.calls[1]?.[0]).toBe(onFinish.mock.calls[0]?.[0]);
  });

  it("keeps Arena locked below B1 and Duel on its own route", () => {
    const locked: ArenaView = { eligible: false, requiredLevel: "B1", currentLevel: "A2", points: 0, wordSetTopic: null, learnerId: "u1", leaderboard: [], opponents: [], duels: [] };
    const { rerender } = render(<Arena view={locked} onChallenge={vi.fn()} />);
    expect(screen.getByText(/mở khoá từ mức b1/i)).toBeInTheDocument();
    rerender(<Arena view={{ ...locked, eligible: true, currentLevel: "B1", wordSetTopic: "Sprint planning", opponents: [{ id: "u2", displayName: "Lan", cefr: "B1" }], leaderboard: [{ rank: 1, learnerId: "u1", displayName: "Minh", cefr: "B1", points: 250, played: 2, won: 1, lost: 0 }], duels: [{ id: "d1", game: "scramble", opponent: { id: "u2", displayName: "Lan" }, state: "open", myScore: null, opponentScore: null, outcome: "play", challengedByMe: true, wordSetTopic: "Sprint planning", createdAt: "2026-10-13T10:00:00.000Z" }] }} onChallenge={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /xếp hạng & thách đấu/i })).toBeInTheDocument();
    expect(screen.getByText(/tổng % kỷ lục.*50 mỗi trận thắng/i)).toBeInTheDocument();
    expect(screen.getByText("Sprint planning", { selector: ".challenge-row strong" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /word scramble/i })).toBeInTheDocument();
    expect(screen.getByText(/2\/6 trò.*thắng 1.*thua 0/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /chơi ván của bạn/i })).toBeInTheDocument();

    const duel: DuelView = {
      id: "d1", game: "scramble", opponent: { id: "u2", displayName: "Lan" }, state: "open",
      myScore: null, opponentScore: null, outcome: "play", challengedByMe: false, wordSetTopic: wordSet.topic,
      createdAt: new Date().toISOString(), wordSet
    };
    rerender(<Duel view={duel} descriptor={games[0]!} onFinish={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /thách đấu với lan/i })).toBeInTheDocument();
  });

  it("keeps an Arena challenge retryable when creating it fails", async () => {
    const user = userEvent.setup();
    const onChallenge = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<Arena view={{
      eligible: true, requiredLevel: "B1", currentLevel: "B1", points: 0, wordSetTopic: "Sprint planning", learnerId: "u1",
      leaderboard: [], opponents: [{ id: "u2", displayName: "Lan", cefr: "B1" }], duels: []
    }} onChallenge={onChallenge} />);
    await user.click(screen.getByRole("button", { name: /gửi lời thách đấu/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/chưa gửi được lời thách đấu/i);
    expect(screen.getByLabelText("Đối thủ")).toHaveValue("u2");
    await user.click(screen.getByRole("button", { name: /gửi lời thách đấu/i }));
    await waitFor(() => expect(onChallenge).toHaveBeenCalledTimes(2));
  });

  it("keeps the certificate and pilot survey as separate one-screen flows", async () => {
    const { rerender } = render(<Reward view={{
      mode: "preview", learnerName: "Học viên Demo", cefr: "A2", cefrLabel: "Sơ trung cấp", points: 20, displayPoints: 20,
      season: { name: "Mùa Thu", description: "Mùa của sự trưởng thành" }, simulated: true,
      earnedBadgeCount: 1, requiredBadgeCount: 8, printable: false, certificateNumber: "SE-2026-000101",
      completedAt: "2026-10-13T00:00:00.000Z", organizationName: "GFT", operatorName: "Thư Demo", managerName: "Quản lý Demo",
      badges: [{ key: "starter", label: "Khởi động", description: "Hoàn thành bài đầu", earned: true }]
    }} />);
    expect(screen.getByRole("heading", { name: /certificate of completion/i })).toBeInTheDocument();
    expect(screen.getAllByText(/bản xem trước/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/giả lập, không ghi vào dữ liệu/i)).toBeInTheDocument();
    expect(screen.getByText(/ngày hoàn thành/i)).toBeInTheDocument();
    expect(screen.getByText(/cấp độ/i)).toBeInTheDocument();
    expect(screen.getByText("Thư Demo")).toBeInTheDocument();
    expect(screen.getByText("Quản lý Demo")).toBeInTheDocument();
    expect(screen.getByText(/có giá trị nội bộ/i)).toBeInTheDocument();

    const user = userEvent.setup();
    const onSubmit = vi.fn();
    rerender(<Survey view={{ state: "open", surveyKey: "pilot_end" }} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.selectOptions(screen.getByLabelText(/học chủ yếu lúc nào/i), "both");
    await user.click(screen.getByRole("button", { name: /gửi khảo sát/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rating: 5, studyTime: "both" }));
  });

  it("keeps survey answers available when saving fails", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<Survey view={{ state: "open", surveyKey: "pilot_end" }} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.selectOptions(screen.getByLabelText(/học chủ yếu lúc nào/i), "outside");
    await user.click(screen.getByRole("button", { name: /gửi khảo sát/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/chưa gửi được khảo sát/i);
    expect(screen.getByRole("button", { name: "4" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/học chủ yếu lúc nào/i)).toHaveValue("outside");
    await user.click(screen.getByRole("button", { name: /gửi khảo sát/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });
});
