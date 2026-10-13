// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Coach } from "../src/pages/learner/Coach.js";
import type { CoachView } from "@e4s/contracts";

afterEach(cleanup);

const view: CoachView = {
  sessionId: "session-1",
  topic: "Introducing yourself & your job",
  cefr: "A2",
  persona: "informal",
  aiAvailable: true,
  daily: { used: 1, limit: 20 },
  weekly: { turns: 1, target: 2 },
  messages: [
    { id: "welcome", speaker: "coach", text: "Hi B! I'm Season. What do you do at work?", createdAt: "2026-10-13T00:00:00.000Z" },
    { id: "turn-1", speaker: "learner", text: "I work at marketing.", createdAt: "2026-10-13T00:01:00.000Z" },
    { id: "turn-1:coach", speaker: "coach", text: "Nice to meet you! What do you do every day?", createdAt: "2026-10-13T00:01:00.000Z", feedback: {
      relevant: true, relevanceNote: "", rubric: { meaning: 4, vocabulary: 3, grammar: 3 },
      suggestions: [{ original: "I work at marketing", corrected: "I work in marketing", explanation: "Dùng in trước tên phòng ban." }],
      correctedText: "I work in marketing."
    } }
  ],
  vocabulary: Array.from({ length: 15 }, (_, index) => ({ word: `word-${index + 1}`, meaning: `nghĩa ${index + 1}`, opened: index === 0 }))
};

describe("Coach screen preserves Thu's experience", () => {
  it("keeps the same Season header, counters, feedback, secret words and one chat flow", () => {
    render(<Coach view={view} onSend={vi.fn()} onPersonaChange={vi.fn()} onNewChat={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Season" })).toBeInTheDocument();
    expect(screen.getByText(/Introducing yourself & your job · A2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Informal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Formal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xoá chat" })).toBeInTheDocument();
    expect(screen.getByText("Hôm nay 1/20 lượt")).toBeInTheDocument();
    expect(screen.getByText(/Tuần này 1 lượt · mục tiêu ≥2/)).toBeInTheDocument();
    expect(screen.getByRole("log", { name: /hội thoại với season/i })).toHaveTextContent("I work at marketing.");
    expect(screen.getByText("Ý 4/5")).toBeInTheDocument();
    expect(screen.getByText("Từ 3/5")).toBeInTheDocument();
    expect(screen.getByText("NP 3/5")).toBeInTheDocument();
    expect(screen.getAllByText(/I work at marketing/)).toHaveLength(2);
    const secretWords = screen.getByRole("region", { name: /ô từ bí mật/i });
    expect(within(secretWords).getByText("1/15")).toBeInTheDocument();
    expect(within(secretWords).getAllByText(/^\?|^✓/)).toHaveLength(15);
    expect(screen.getByPlaceholderText(/Viết câu trả lời bằng tiếng Anh/i)).toBeInTheDocument();
  });

  it("sends a full message and keeps persona/new-chat as explicit actions", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onPersonaChange = vi.fn().mockResolvedValue(undefined);
    const onNewChat = vi.fn().mockResolvedValue(undefined);
    render(<Coach view={view} onSend={onSend} onPersonaChange={onPersonaChange} onNewChat={onNewChat} />);

    await user.type(screen.getByPlaceholderText(/Viết câu trả lời bằng tiếng Anh/i), "I prepare weekly reports.");
    await user.click(screen.getByRole("button", { name: "Gửi" }));
    expect(onSend).toHaveBeenCalledWith("I prepare weekly reports.");
    await user.click(screen.getByRole("button", { name: "Formal" }));
    expect(onPersonaChange).toHaveBeenCalledWith("formal");
    await user.click(screen.getByRole("button", { name: "Xoá chat" }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });
});
