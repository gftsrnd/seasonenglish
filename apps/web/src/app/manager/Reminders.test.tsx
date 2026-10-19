// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagerReminders } from "./Reminders.js";

afterEach(cleanup);

describe("manager reminder copy", () => {
  it("keeps the reminder actionable without a decorative emoji", () => {
    render(<ManagerReminders
      view={{
        organizationName: "GFT Demo",
        inactiveDays: 3,
        webhookConfigured: false,
        candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", lastActivityAt: null, missedDays: 4 }],
        history: []
      }}
      onSend={vi.fn()}
    />);

    const card = screen.getByRole("region", { name: "Nhắc học cho Học viên Demo" });
    expect(card).toHaveTextContent("Chỉ cần 15 phút hôm nay thôi");
    expect(card).not.toHaveTextContent("💪");
    expect(screen.getByRole("button", { name: "Ghi nhận tất cả (1)" }).querySelector("svg.lucide-bell")).toBeInTheDocument();
  });
});
