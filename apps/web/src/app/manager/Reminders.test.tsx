// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "@testing-library/user-event";
import { ManagerReminders } from "./Reminders.js";

afterEach(cleanup);

describe("manager reminder copy", () => {
  it("keeps the reminder actionable without a decorative emoji", () => {
    render(<ManagerReminders
      view={{
        organizationName: "GFT Demo",
        inactiveDays: 3,
        webhookConfigured: false,
        candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", learnerEmail: "learner@example.com", cefr: "A2", lastActivityAt: null, missedDays: 4 }],
        history: []
      }}
      onSend={vi.fn()}
    />);

    const card = screen.getByRole("region", { name: "Nhắc học cho Học viên Demo" });
    expect(card).toHaveTextContent("learner@example.com");
    expect(card).toHaveTextContent("Chỉ cần 15 phút hôm nay thôi");
    expect(card).not.toHaveTextContent("💪");
    expect(screen.getByRole("button", { name: "Gửi email" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Gửi Base.vn" })).not.toBeInTheDocument();
  });

  it("shows recipient emails in history and can send all candidates by email", async () => {
    const user = userEvent.setup();
    const onSendAll = vi.fn().mockResolvedValue(undefined);
    render(<ManagerReminders
      view={{
        organizationName: "GFT Demo", inactiveDays: 3, webhookConfigured: true, emailConfigured: true,
        candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", learnerEmail: "learner@example.com", cefr: "A2", lastActivityAt: null, missedDays: 4 }],
        history: [{ reminderId: "r-1", learnerId: "learner-1", learnerName: "Học viên Demo", recipient: "learner@example.com", missedDays: 4, status: "sent", deliveryStatus: "sent", provider: "resend", createdAt: "2026-10-28T09:00:00.000Z", attemptedAt: "2026-10-28T09:00:01.000Z" }]
      }}
      onSend={vi.fn()}
      onSendAll={onSendAll}
    />);

    expect(screen.getByRole("columnheader", { name: "Email nhận" })).toBeInTheDocument();
    expect(screen.getByText("1 người học cần được nhắc")).toBeInTheDocument();
    expect(screen.queryByText(/đủ điều kiện/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("learner@example.com").length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getByRole("button", { name: "Gửi tất cả qua email" }));
    expect(onSendAll).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Xác nhận gửi email" });
    expect(dialog).toHaveTextContent("1 người học");
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận gửi email" }));
    expect(onSendAll).toHaveBeenCalledWith("email");
  });

  it("asks for confirmation before sending one learner an email", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ManagerReminders
      view={{ organizationName: "GFT Demo", inactiveDays: 3, webhookConfigured: true, emailConfigured: true, candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", learnerEmail: "learner@example.com", cefr: "A2", lastActivityAt: null, missedDays: 4 }], history: [] }}
      onSend={onSend}
    />);

    await user.click(screen.getByRole("button", { name: "Gửi email" }));
    expect(onSend).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Xác nhận gửi email" });
    expect(dialog).toHaveTextContent("Học viên Demo");
    expect(dialog).toHaveTextContent("learner@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Huỷ" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps Copy available after recording a copied reminder", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    render(<ManagerReminders
      view={{
        organizationName: "GFT Demo",
        inactiveDays: 3,
        webhookConfigured: false,
        candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", lastActivityAt: null, missedDays: 4 }],
        history: []
      }}
      onSend={vi.fn()}
      onCopy={onCopy}
    />);

    const card = screen.getByRole("region", { name: "Nhắc học cho Học viên Demo" });
    await user.click(within(card).getByRole("button", { name: "Copy tin nhắn" }));

    expect(onCopy).toHaveBeenCalledWith("learner-1");
    expect(screen.getByRole("region", { name: "Nhắc học cho Học viên Demo" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Copy tin nhắn" })).toBeEnabled();
  });
});
