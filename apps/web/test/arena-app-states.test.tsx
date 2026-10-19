// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArenaView } from "@e4s/contracts";
import { LearnerArena } from "../src/app/learner/Games.js";
import type { LearnerCallbacks } from "../src/app/learner/contracts.js";

afterEach(cleanup);

const actions = { navigate: vi.fn(), createDuel: vi.fn() } as unknown as LearnerCallbacks;

const base: ArenaView = {
  eligible: true,
  requiredLevel: "B1",
  currentLevel: "B1",
  learnerId: "u1",
  points: 40,
  wordSetTopic: "Sprint planning",
  leaderboard: [],
  opponents: [],
  duels: []
};

describe("app arena duel states", () => {
  it("uses the app Vietnamese status labels for server-owned duel outcomes", () => {
    render(<LearnerArena view={{ ...base, duels: [
      { id: "sent", game: "scramble", opponent: { id: "u2", displayName: "Lan" }, state: "open", myScore: null, opponentScore: null, outcome: "play", challengedByMe: true, wordSetTopic: "Sprint planning", createdAt: "2026-10-15T10:00:00.000Z" },
      { id: "received", game: "typing", opponent: { id: "u3", displayName: "Nam" }, state: "open", myScore: null, opponentScore: null, outcome: "play", challengedByMe: false, wordSetTopic: "Sprint planning", createdAt: "2026-10-15T10:00:00.000Z" },
      { id: "waiting", game: "sort", opponent: { id: "u4", displayName: "Mai" }, state: "open", myScore: { score: 3, maxScore: 5 }, opponentScore: null, outcome: "waiting", challengedByMe: true, wordSetTopic: "Sprint planning", createdAt: "2026-10-15T10:00:00.000Z" },
      { id: "win", game: "eggs", opponent: { id: "u5", displayName: "An" }, state: "completed", myScore: { score: 5, maxScore: 5 }, opponentScore: { score: 3, maxScore: 5 }, outcome: "win", challengedByMe: true, wordSetTopic: "Sprint planning", createdAt: "2026-10-15T10:00:00.000Z" },
      { id: "lose", game: "mario", opponent: { id: "u6", displayName: "Hoa" }, state: "completed", myScore: { score: 2, maxScore: 5 }, opponentScore: { score: 4, maxScore: 5 }, outcome: "lose", challengedByMe: false, wordSetTopic: "Sprint planning", createdAt: "2026-10-15T10:00:00.000Z" },
      { id: "draw", game: "typing", opponent: { id: "u7", displayName: "Bình" }, state: "completed", myScore: { score: 4, maxScore: 5 }, opponentScore: { score: 4, maxScore: 5 }, outcome: "draw", challengedByMe: true, wordSetTopic: "Sprint planning", createdAt: "2026-10-15T10:00:00.000Z" }
    ] }} actions={actions} />);

    expect(screen.getAllByText("Chờ đối thủ")).toHaveLength(2);
    expect(screen.getByText("Đến lượt bạn")).toBeInTheDocument();
    expect(screen.getByText("Thắng")).toBeInTheDocument();
    expect(screen.getByText("Thua")).toBeInTheDocument();
    expect(screen.getByText("Hoà")).toBeInTheDocument();
    expect(screen.queryByText("waiting")).not.toBeInTheDocument();
  });
});
