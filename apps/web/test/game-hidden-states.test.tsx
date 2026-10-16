// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameHubView } from "@e4s/contracts";
import { PrototypeGames } from "../src/prototype/learner/Games.js";
import type { LearnerPrototypeCallbacks } from "../src/prototype/learner/contracts.js";

afterEach(cleanup);

const actions = {
  navigate: vi.fn(), generateGameSet: vi.fn(), useWeeklyGameSet: vi.fn(), deleteGameSet: vi.fn(), speak: vi.fn()
} as unknown as LearnerPrototypeCallbacks;

const view = (topicModeration: GameHubView["topicModeration"]): GameHubView => ({
  cefr: "A2", aiAvailable: true,
  ...(topicModeration === undefined ? {} : { topicModeration }),
  wordSet: { id: "00000000-0000-4000-8000-000000000301", topic: "Tuần 1", cefr: "A2", source: "weekly", words: [] },
  games: [], arena: { eligible: false, requiredLevel: "B1", points: 0, pendingDuels: 0 }
});

describe("prototype game moderation states", () => {
  it.each([
    [{ state: "empty" }, /nhập chủ đề/i],
    [{ state: "loading" }, /đang kiểm tra/i],
    [{ state: "success", topic: "Sprint planning" }, /đã tạo bộ từ theo chủ đề/i],
    [{ state: "invalid", message: "Chủ đề không hợp lệ." }, /chủ đề không hợp lệ/i],
    [{ state: "unsafe", strike: 2, message: "Chủ đề không phù hợp." }, /cảnh báo an toàn.*2\/3/i],
    [{ state: "reported", strike: 3, message: "Đã báo vận hành." }, /đã báo vận hành/i],
    [{ state: "ai_rejected", message: "AI không trả về được bộ từ hợp lệ." }, /ai từ chối/i],
    [{ state: "error", message: "Không thể kiểm tra chủ đề." }, /không thể kiểm tra chủ đề/i]
  ] as const)("renders server topic state %#", (topicModeration, expected) => {
    render(<PrototypeGames view={view(topicModeration)} actions={actions} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
