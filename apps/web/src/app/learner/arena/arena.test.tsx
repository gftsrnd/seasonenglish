// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArenaHome, ArenaLeaderboard as Board, ArenaMatch } from "../../../api/arena.js";
import { ModalProvider } from "../../shared/ModalProvider.js";
import { ArenaSeasonSetting } from "../../manager/ArenaSeasonSetting.js";
import { ArenaEntryCard, myMatchRows } from "./ArenaHub.js";
import { ArenaLeaderboard } from "./ArenaLeaderboard.js";
import { ArenaMatchScreen } from "./ArenaMatchScreen.js";
import { ArenaResultCard } from "./ArenaResultCard.js";
import { arenaRouteMatch } from "./ArenaRoutes.js";
import { bandLabel } from "./arena-text.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ID = "11111111-1111-4111-8111-111111111111";
const future = new Date(Date.now() + 18 * 3_600_000).toISOString();

function match(overrides: Partial<ArenaMatch> = {}): ArenaMatch {
  return {
    id: ID, mode: "ranked", game: "scramble", cefr: "B1", status: "accepted", setKind: "personal", setTopic: "Coffee shop",
    postedByMe: true, opponent: { id: "opp", displayName: "Lan Anh", cefr: "B1" }, createdAt: new Date().toISOString(),
    acceptDeadline: future, acceptedAt: new Date().toISOString(), playDeadline: future, settledAt: null, cancelReason: null,
    me: { started: false, played: false, score: null, gameplayMs: null }, them: { played: false, score: null }, result: null,
    ...overrides
  };
}

const settled = (outcome: "win" | "lose" | "draw", change: number, mode: "ranked" | "friendly" = "ranked") => match({
  mode, status: "settled", settledAt: new Date().toISOString(),
  me: { started: true, played: true, score: 73, gameplayMs: 30_000 }, them: { played: true, score: 64 },
  result: { outcome, decidedBy: "score", rating: mode === "ranked" ? { before: 1_000, after: 1_000 + change, change, base: 50, decayPercent: 100, meetingIndex: 1 } : null }
});

describe("arena result card", () => {
  it("waits for the opponent and points to the bell", () => {
    render(<ArenaResultCard match={match({ me: { started: true, played: true, score: 73, gameplayMs: 1 } })} />);
    expect(screen.getByRole("heading", { name: "Chờ đối thủ" })).toBeInTheDocument();
    expect(screen.getByText("Kết quả sẽ báo ở chuông.")).toBeInTheDocument();
    expect(screen.queryByText(/điểm xếp hạng/)).toBeNull();
  });

  it("shows win with the opponent, both scores, the +N chip, the explanation and Đấu tiếp", () => {
    const again = vi.fn();
    render(<ArenaResultCard match={settled("win", 50)} onAgain={again} />);
    expect(screen.getByRole("heading", { name: "Bạn thắng!" })).toBeInTheDocument();
    expect(document.querySelector("[data-arena-xh]")).toHaveTextContent("Lan Anh 64 · +50 điểm xếp hạng");
    expect(document.querySelector(".arena-result__detail")!.textContent!.length).toBeLessThanOrEqual(40);
    expect(screen.getByText("73")).toBeInTheDocument();
    expect(screen.getByText("64")).toBeInTheDocument();
    expect(screen.getByText("+50 điểm xếp hạng")).toBeInTheDocument();
    expect(screen.getByText(/Ngang sức · lần gặp 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Đấu tiếp/ }));
    expect(again).toHaveBeenCalled();
  });

  it("shows lose and draw", () => {
    const { rerender } = render(<ArenaResultCard match={settled("lose", -50)} />);
    expect(screen.getByRole("heading", { name: "Bạn thua" })).toBeInTheDocument();
    expect(screen.getByText("−50 điểm xếp hạng")).toBeInTheDocument();
    rerender(<ArenaResultCard match={settled("draw", 0)} />);
    expect(screen.getByRole("heading", { name: "Hoà" })).toBeInTheDocument();
  });

  it("never shows an XH chip for a friendly match", () => {
    render(<ArenaResultCard match={settled("win", 0, "friendly")} />);
    expect(document.querySelector("[data-arena-chip]")).toBeNull();
    expect(document.querySelector("[data-arena-xh]")).toHaveTextContent("Lan Anh 64 · Giao hữu");
  });

  it("labels the band from the base points", () => {
    expect(bandLabel(75, "win")).toBe("Đối thủ mạnh hơn");
    expect(bandLabel(25, "win")).toBe("Đối thủ yếu hơn");
    expect(bandLabel(25, "lose")).toBe("Đối thủ mạnh hơn");
    expect(bandLabel(50, "lose")).toBe("Ngang sức");
  });
});

const home = (matches: Partial<ArenaHome["matches"]> = {}): ArenaHome => ({
  eligible: true, requiredLevel: "B1", level: "B1", season: { id: "s", startsOn: "2026-11-01", endsOn: "2027-02-01", status: "active" },
  ratings: { scramble: 1_000, crossword: 1_000, eggs: 1_000, mario: 1_000, sort: 1_000, typing: 1_000 }, total: 6_000,
  openRanked: 1, maxOpenRanked: 3, matches: { open: [], active: [], done: [], ...matches }
});
const board: Board = {
  level: "B1", game: "total", season: null, me: { rank: 4, of: 5, rating: 6_000 },
  entries: [
    { rank: 1, learnerId: "a", displayName: "An", rating: 6_150 },
    { rank: 2, learnerId: "b", displayName: "Bình", rating: 6_100 },
    { rank: 3, learnerId: "c", displayName: "Chi", rating: 6_050 },
    { rank: 4, learnerId: "me", displayName: "Tôi", rating: 6_000 },
    { rank: 5, learnerId: "e", displayName: "Em", rating: 5_950 }
  ]
};

describe("Đấu trường page", () => {
  const client = (overrides: Partial<Record<string, unknown>> = {}) => ({
    home: vi.fn().mockResolvedValue({ ...home({ active: [match()], done: [settled("win", 50), match({ id: "x", status: "cancelled" })] }), rank: { position: 4, of: 5 }, set: { topic: "project change", words: 12, kind: "personal" } }),
    leaderboard: vi.fn().mockImplementation(({ game }: { game?: string }) => Promise.resolve({ ...board, game: game ?? "total" })),
    challenges: vi.fn().mockResolvedValue({ challenges: [{ id: "c1", game: "sort", setKind: "personal", setTopic: "budget", acceptDeadline: future, createdAt: future }] }),
    postChallenge: vi.fn().mockResolvedValue(match({ status: "open" })),
    acceptChallenge: vi.fn().mockResolvedValue(match()),
    inviteFriendly: vi.fn().mockResolvedValue(match()), answerFriendly: vi.fn(),
    cancel: vi.fn().mockResolvedValue(match({ status: "cancelled" })), forfeit: vi.fn(),
    ...overrides
  });
  const page = (api: ReturnType<typeof client>, navigate = vi.fn(), notify = vi.fn()) =>
    render(<ModalProvider><ArenaLeaderboard navigate={navigate} notify={notify} learnerId="me" client={api as never} /></ModalProvider>);

  it("shows the season banner, the rules ⓘ, the back link and the two tabs", async () => {
    page(client());
    expect(await screen.findByRole("heading", { level: 1, name: /Đấu trường B1/ })).toBeInTheDocument();
    expect(screen.getByText(/6\.000 điểm XH tổng · Hạng 4\/5/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Luật đấu trường" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Về Mini game/ })).toHaveAttribute("href", "/games");
    expect(screen.getByRole("tab", { name: "Đấu" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Bảng xếp hạng" })).toBeInTheDocument();
  });

  it("posts a ranked challenge with the set in use after confirming, and hides cancelled matches", async () => {
    const api = client();
    page(api);
    expect(await screen.findByText("project change · 12 từ")).toBeInTheDocument();
    expect(screen.queryByText("Đã huỷ")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Phân loại từ/ }));
    fireEvent.click(screen.getByRole("button", { name: "Đăng thách đấu" }));
    expect(await screen.findByRole("dialog", { name: "Đăng thách đấu Phân loại từ?" })).toBeInTheDocument();
    expect(api.postChallenge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Đăng" }));
    await waitFor(() => expect(api.postChallenge).toHaveBeenCalledWith(expect.objectContaining({ game: "sort" })));
  });

  it("accepts an open challenge after confirming and opens the match", async () => {
    const navigate = vi.fn();
    const api = client();
    page(api, navigate);
    expect(await screen.findByText(/budget · còn \d+ giờ/)).toBeInTheDocument();
    const row = screen.getByText(/budget · còn/).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Nhận" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Nhận thách đấu Phân loại từ?" })).getByRole("button", { name: "Nhận" }));
    await waitFor(() => expect(api.acceptChallenge).toHaveBeenCalledWith("c1"));
    expect(navigate).toHaveBeenCalledWith(`/arena/match/${ID}`);
  });

  it("cancels my unanswered challenge after confirming", async () => {
    const api = client({ home: vi.fn().mockResolvedValue({ ...home({ open: [match({ status: "open", opponent: null })] }), set: { topic: "t", words: 12, kind: "personal" } }) });
    page(api);
    fireEvent.click(await screen.findByRole("button", { name: "Huỷ" }));
    fireEvent.click(await screen.findByRole("button", { name: "Huỷ thách đấu" }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(ID));
  });

  it("locks posting at 3 open matches", async () => {
    page(client({ home: vi.fn().mockResolvedValue({ ...home(), openRanked: 3, set: { topic: "t", words: 12, kind: "personal" } }) }));
    expect(await screen.findByRole("button", { name: "Đăng thách đấu" })).toBeDisabled();
    expect(screen.getByText(/Đã đủ 3 trận đang mở/)).toBeInTheDocument();
  });

  it("invites a friend by picking a person in the Giao hữu mode", async () => {
    const api = client();
    page(api);
    fireEvent.click(await screen.findByRole("tab", { name: "Giao hữu" }));
    const select = await screen.findByLabelText("Người nhận");
    await waitFor(() => expect(within(select).getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(select, { target: { value: "b" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi lời mời" }));
    await waitFor(() => expect(api.inviteFriendly).toHaveBeenCalledWith(expect.objectContaining({ opponentId: "b", game: "scramble" })));
  });

  it("shows the leaderboard table with the six games, my row and 'Bạn đang hạng'", async () => {
    page(client());
    fireEvent.click(await screen.findByRole("tab", { name: "Bảng xếp hạng" }));
    expect(await screen.findByRole("columnheader", { name: "Season catch" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tổng" })).toBeInTheDocument();
    expect(screen.getByText("Bạn đang hạng 4/5")).toBeInTheDocument();
    expect(document.querySelector("tr.is-me")).toHaveTextContent("Bạn");
  });

  it("keeps Trận của bạn to three rows, invites and my turn first, results only when settled", () => {
    const rows = myMatchRows(home({
      open: [match({ id: "o", status: "open" }), match({ id: "i", mode: "friendly", status: "invited", postedByMe: false })],
      active: [match({ id: "t" })], done: [match({ id: "c", status: "cancelled" }), settled("win", 50)]
    }));
    expect(rows.map((row) => row.id)).toEqual(["i", "t", "o"]);
  });
});

describe("Mini game › Đấu trường card", () => {
  it("opens /arena from B1 and only says it opens from B1 below", async () => {
    const { unmount } = render(<ArenaEntryCard level="B1" navigate={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Vào Đấu trường B1" })).toHaveAttribute("href", "/arena");
    unmount();
    render(<ArenaEntryCard level="A2" navigate={vi.fn()} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Mở từ B1. Bạn đang ở mức A2.")).toBeInTheDocument();
  });
});

describe("arena match screen", () => {
  const round = { match: match({ me: { started: true, played: false, score: null, gameplayMs: null } }), attemptSeed: 0, unitIds: ["w1"],
    wordSet: { id: "set", topic: "Coffee shop", cefr: "B1" as const, source: "custom" as const, words: ["latte", "mocha", "espresso", "barista"].map((english, index) => ({ id: `w${index + 1}`, english, vietnamese: english, definition: english, partOfSpeech: "noun" })) } };

  it("shows the ranked line, resumes a started match and forfeits only after the confirm", async () => {
    const api = {
      match: vi.fn().mockResolvedValue(match({ me: { started: true, played: false, score: null, gameplayMs: null } })),
      start: vi.fn().mockResolvedValue(round),
      submit: vi.fn(), answerFriendly: vi.fn(), quickMatch: vi.fn(),
      forfeit: vi.fn().mockResolvedValue(settled("lose", -50))
    };
    render(<ModalProvider><ArenaMatchScreen matchId={ID} navigate={vi.fn()} notify={vi.fn()} client={api as never} /></ModalProvider>);
    expect(await screen.findByText("Xếp hạng · đối thủ ẩn")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Chơi tiếp/ }));
    await waitFor(() => expect(api.start).toHaveBeenCalledWith(ID));
    fireEvent.click(await screen.findByRole("button", { name: /Thoát/ }));
    expect(await screen.findByText("Thoát sẽ tính thua.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục chơi" }));
    await waitFor(() => expect(screen.queryByText("Thoát sẽ tính thua.")).toBeNull());
    expect(api.forfeit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Thoát/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Thoát và chịu thua" }));
    await waitFor(() => expect(api.forfeit).toHaveBeenCalledWith(ID));
    expect(await screen.findByRole("heading", { name: "Bạn thua" })).toBeInTheDocument();
  });

  it("matches only the two arena routes", () => {
    expect(arenaRouteMatch("/arena")).toEqual({ screen: "board" });
    expect(arenaRouteMatch(`/arena/match/${ID}`)).toEqual({ screen: "match", id: ID });
    expect(arenaRouteMatch("/arena/other")).toBeNull();
  });
});

describe("manager arena season field", () => {
  it("saves the season start and asks for a confirmation once matches exist", async () => {
    const setting = { firstSeasonStart: "2026-11-01", seasonMonths: 3, current: { id: "s", startsOn: "2026-11-01", endsOn: "2027-02-01", status: "active" as const }, next: null, hasMatches: true };
    const api = { seasonSetting: vi.fn().mockResolvedValue(setting), saveSeasonStart: vi.fn().mockResolvedValue({ ...setting, next: { id: "n", startsOn: "2027-02-01", endsOn: "2027-05-01", status: "scheduled" } }) };
    const notify = vi.fn();
    render(<ModalProvider><ArenaSeasonSetting notify={notify} client={api} /></ModalProvider>);
    const field = await screen.findByLabelText("Ngày bắt đầu mùa xếp hạng");
    fireEvent.change(field, { target: { value: "2027-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu ngày bắt đầu mùa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Áp dụng từ mùa sau" }));
    await waitFor(() => expect(api.saveSeasonStart).toHaveBeenCalledWith({ startsOn: "2027-02-01", confirm: true }));
    expect(notify).toHaveBeenCalledWith("Đã lưu ngày bắt đầu mùa xếp hạng.", "ok");
  });

  it("saves without a confirmation while the season has no matches", async () => {
    const setting = { firstSeasonStart: null, seasonMonths: 3, current: null, next: null, hasMatches: false };
    const api = { seasonSetting: vi.fn().mockResolvedValue(setting), saveSeasonStart: vi.fn().mockResolvedValue(setting) };
    render(<ModalProvider><ArenaSeasonSetting notify={vi.fn()} client={api} /></ModalProvider>);
    fireEvent.change(await screen.findByLabelText("Ngày bắt đầu mùa xếp hạng"), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu ngày bắt đầu mùa" }));
    await waitFor(() => expect(api.saveSeasonStart).toHaveBeenCalledWith({ startsOn: "2026-12-01" }));
  });
});
