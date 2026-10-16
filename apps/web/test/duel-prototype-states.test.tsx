// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DuelView, GameDescriptor } from "@e4s/contracts";
import { PrototypeDuel } from "../src/prototype/learner/Games.js";
import type { LearnerPrototypeCallbacks } from "../src/prototype/learner/contracts.js";

afterEach(cleanup);

const actions = {
  navigate: vi.fn(),
  finishGame: vi.fn(),
  resetGameResult: vi.fn(),
  resolveGameWordImage: vi.fn(async () => null)
} as unknown as LearnerPrototypeCallbacks;

const descriptor: GameDescriptor = {
  key: "scramble",
  icon: "🔤",
  name: "Word scramble",
  description: "Xếp chữ",
  goal: "Xếp đúng từ.",
  instructions: ["Đọc gợi ý."],
  scoring: "+1",
  best: null
};

const wordSet = {
  id: "duel-set",
  topic: "Sprint planning",
  cefr: "B1" as const,
  source: "custom" as const,
  words: [{ id: "deadline", english: "deadline", vietnamese: "hạn chót", definition: "latest time", partOfSpeech: "noun" }]
};

function duel(overrides: Partial<DuelView> = {}): DuelView {
  return {
    id: "duel-1",
    game: "scramble",
    opponent: { id: "u2", displayName: "Lan" },
    state: "open",
    myScore: { score: 2, maxScore: 2 },
    opponentScore: null,
    outcome: "waiting",
    challengedByMe: true,
    wordSetTopic: wordSet.topic,
    createdAt: "2026-10-15T10:00:00.000Z",
    wordSet,
    result: { id: "result-1", game: "scramble", score: 2, maxScore: 2, correct: 1, total: 1, completedAt: "2026-10-15T10:01:00.000Z" },
    ...overrides
  };
}

describe("prototype duel terminal states", () => {
  it("shows waiting after the learner has played and removes the replay/start action", () => {
    render(<PrototypeDuel view={duel()} descriptor={descriptor} actions={actions} />);

    expect(screen.getByRole("heading", { name: /đã ghi kết quả.*chờ đối thủ/i })).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bắt đầu/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /về đấu trường/i })[0]).toHaveAttribute("href", "/arena");
  });

  it.each([
    ["win", "Bạn thắng"],
    ["lose", "Bạn thua"],
    ["draw", "Hoà"]
  ] as const)("renders the %s result without reopening the duel", (outcome, label) => {
    render(<PrototypeDuel view={duel({ state: "completed", outcome, opponentScore: { score: outcome === "win" ? 1 : 2 } as DuelView["opponentScore"] })} descriptor={descriptor} actions={actions} />);

    expect(screen.getByRole("heading", { name: new RegExp(label, "i") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bắt đầu/i })).not.toBeInTheDocument();
  });
});
