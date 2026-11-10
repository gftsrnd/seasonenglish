// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "@testing-library/user-event";
import { ModalProvider } from "../shared/ModalProvider.js";
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
    expect(screen.getByRole("button", { name: "Gửi Base.vn" })).toBeDisabled();
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

    expect(screen.getByRole("columnheader", { name: "Nơi nhận" })).toBeInTheDocument();
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


describe("personal Base notification channels", () => {
  const candidate = { learnerId: "learner-1", learnerName: "Học viên Demo", learnerEmail: "learner@example.com", cefr: "A2" as const, lastActivityAt: null, missedDays: 4 };
  it("confirms a configured learner destination before sending Base only", async () => {
    const user = userEvent.setup(); const send = vi.fn();
    render(<ManagerReminders view={{ organizationName: "Demo", inactiveDays: 3, candidates: [{ ...candidate, baseNotification: { configured: true, destinationLabel: "Base Minh Anh", webhookTemplate: '{"base_content":"{message}"}' } }] }} onSend={send} />);
    await user.click(screen.getByRole("button", { name: "Gửi Base.vn" }));
    expect(send).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Xác nhận gửi Base.vn" });
    expect(dialog).toHaveTextContent("Base Minh Anh");
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận gửi Base.vn" }));
    expect(send).toHaveBeenCalledExactlyOnceWith("learner-1", "base");
  });

  it("saves a learner destination without sending a notification", async () => {
    const user = userEvent.setup(); const send = vi.fn(); const save = vi.fn().mockResolvedValue(undefined);
    render(<ManagerReminders view={{ organizationName: "Demo", inactiveDays: 3, candidates: [candidate] }} onSend={send} onSaveBase={save} />, { wrapper: ModalProvider });
    await user.click(screen.getByRole("button", { name: "Cấu hình Base.vn" }));
    await user.type(screen.getByLabelText("Webhook Base.vn của Học viên Demo"), "https://base.example.test/personal");
    await user.click(screen.getByRole("button", { name: "Lưu kênh Base.vn" }));
    expect(save).toHaveBeenCalledWith("learner-1", expect.objectContaining({ webhookUrl: "https://base.example.test/personal" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("retains the saved secret when editing a label with a blank URL", async () => {
    const user = userEvent.setup(); const save = vi.fn().mockResolvedValue(undefined);
    render(<ManagerReminders view={{ organizationName: "Demo", inactiveDays: 3, candidates: [{ ...candidate, baseNotification: { configured: true, destinationLabel: "Base riêng", webhookTemplate: '{"base_content":"{message}"}' } }] }} onSend={vi.fn()} onSaveBase={save} />, { wrapper: ModalProvider });
    await user.click(screen.getByRole("button", { name: "Cấu hình Base.vn" }));
    expect(screen.getByLabelText("Webhook Base.vn của Học viên Demo")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Lưu kênh Base.vn" }));
    expect(save).toHaveBeenCalledWith("learner-1", expect.objectContaining({ webhookUrl: "", remove: false }));
  });

  it("keeps the configured Base channel when replacement or removal is cancelled", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ManagerReminders view={{ organizationName: "Demo", inactiveDays: 3, candidates: [{ ...candidate, baseNotification: { configured: true, destinationLabel: "Base riêng", webhookTemplate: '{"base_content":"{message}"}' } }] }} onSend={vi.fn()} onSaveBase={save} />, { wrapper: ModalProvider });
    await user.click(screen.getByRole("button", { name: "Cấu hình Base.vn" }));
    await user.type(screen.getByLabelText("Webhook Base.vn của Học viên Demo"), "https://base.example.test/new");
    await user.click(screen.getByRole("button", { name: "Lưu kênh Base.vn" }));
    const replacement = await screen.findByRole("dialog", { name: "Thay webhook Base.vn?" });
    expect(save).not.toHaveBeenCalled();
    await user.click(within(replacement).getByRole("button", { name: "Huỷ" }));
    await user.click(screen.getByRole("button", { name: "Gỡ kênh Base.vn" }));
    const removal = await screen.findByRole("dialog", { name: "Gỡ kênh Base.vn?" });
    expect(save).not.toHaveBeenCalled();
    await user.click(within(removal).getByRole("button", { name: "Huỷ" }));
    expect(save).not.toHaveBeenCalled();
  });
});

it("shows compact history and opens one learner's reminder on small screens", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  try {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ManagerReminders
      view={{
        organizationName: "GFT Demo", inactiveDays: 3, emailConfigured: true,
        candidates: [
          { learnerId: "learner-1", learnerName: "Học viên Demo", learnerEmail: "learner@example.com", cefr: "A2", lastActivityAt: null, missedDays: 4 },
          { learnerId: "learner-2", learnerName: "Học viên Hai", learnerEmail: "other@example.com", cefr: "A1", lastActivityAt: null, missedDays: 3 }
        ],
        history: [{ reminderId: "r-1", learnerId: "learner-1", learnerName: "Học viên Demo", recipient: "learner@example.com", missedDays: 4, status: "sent", deliveryStatus: "sent", provider: "resend", createdAt: "2026-10-28T09:00:00.000Z", attemptedAt: null }]
      }}
      onSend={onSend}
    />);
    const history = screen.getByRole("list", { name: "Lịch sử nhắc học" });
    expect(history).toHaveTextContent("Đã gửi email");
    expect(history).toHaveTextContent("learner@example.com");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi email" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Học viên Demo.*Xem tin/ }));
    await user.click(screen.getByRole("button", { name: "Gửi email" }));
    expect(screen.getByRole("dialog", { name: "Xác nhận gửi email" })).toHaveTextContent("learner@example.com");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Học viên Hai.*Xem tin/ }));
    expect(screen.getAllByRole("button", { name: "Gửi email" })).toHaveLength(1);
    expect(screen.getByText("other@example.com")).toBeVisible();
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
});
