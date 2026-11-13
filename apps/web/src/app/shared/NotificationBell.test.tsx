// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./NotificationBell.js";

const api = vi.hoisted(() => ({ getNotificationInbox: vi.fn(), markInboxRead: vi.fn() }));
vi.mock("../../api/notifications.js", () => api);

const notification = {
  id: "complaint-inbox",
  kind: "complaint_received",
  context: "exam_eligibility",
  createdAt: "2026-11-09T08:00:00.000Z",
  readAt: null
};

afterEach(cleanup);

describe("NotificationBell", () => {
  beforeEach(() => {
    api.getNotificationInbox.mockReset();
    api.markInboxRead.mockReset();
  });

  it("opens via keyboard, returns focus on Escape and opens the Manager complaint tab", async () => {
    api.getNotificationInbox.mockImplementation(async (limit) => ({ items: limit ? [notification] : [], unreadCount: 1, nextCursor: null }));
    api.markInboxRead.mockResolvedValue({ unreadCount: 0 });
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /><Routes><Route path="/" element={<span />} /><Route path="/mgr/requests" element={<h1>Khiếu nại</h1>} /></Routes></MemoryRouter>);
    const bell = await screen.findByRole("button", { name: /1 chưa đọc/ });
    bell.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Thông báo" });
    expect(await within(dialog).findByText("Khiếu nại về điều kiện dự thi")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(bell).toHaveFocus();
    await user.click(bell);
    await user.click(await screen.findByRole("button", { name: "Mở khiếu nại" }));
    expect(await screen.findByRole("heading", { name: "Khiếu nại" })).toBeInTheDocument();
    expect(api.markInboxRead).toHaveBeenCalledWith({ ids: [notification.id] });
  });

  it("renders a neutral row for an unknown notification kind instead of crashing the inbox", async () => {
    const items = [{ ...notification, id: "unknown-kind", kind: "reminder", context: "learning" }, notification];
    api.getNotificationInbox.mockImplementation(async (limit) => ({ items: limit ? items : [], unreadCount: 2, nextCursor: null }));
    api.markInboxRead.mockResolvedValue({ unreadCount: 1 });
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /2 chưa đọc/ }));
    const dialog = screen.getByRole("dialog", { name: "Thông báo" });
    expect(await within(dialog).findByText("Có thông báo mới")).toBeInTheDocument();
    expect(within(dialog).getByText("Học tập")).toBeInTheDocument();
    expect(within(dialog).getByText("Khiếu nại về điều kiện dự thi")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Về trang chính" }));
    expect(api.markInboxRead).toHaveBeenCalledWith({ ids: ["unknown-kind"] });
  });

  it("shows the learner's absence warning and a reopened lesson as bell notifications", async () => {
    const items = [
      { ...notification, id: "absence-3", kind: "absence_warning", context: "3" },
      { ...notification, id: "lesson-reopen", kind: "lesson_reopened", context: "2026-11" }
    ];
    api.getNotificationInbox.mockImplementation(async (limit) => ({ items: limit ? items : [], unreadCount: 2, nextCursor: null }));
    api.markInboxRead.mockResolvedValue({ unreadCount: 1 });
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /2 chưa đọc/ }));
    const dialog = screen.getByRole("dialog", { name: "Thông báo" });
    expect(await within(dialog).findByText("Bạn đã vắng 3 ngày học liên tiếp")).toBeInTheDocument();
    expect(within(dialog).getByText("Vắng thêm 2 ngày học liên tiếp sẽ bị khóa tài khoản.")).toBeInTheDocument();
    expect(within(dialog).getByText("Một bài học đang được cập nhật")).toBeInTheDocument();
  });

  it("tells the learner about a new badge and a new Season", async () => {
    const items = [
      { ...notification, id: "badge-week", kind: "badge_earned", context: "Tuần trọn vẹn" },
      { ...notification, id: "season-3", kind: "season_reached", context: "3:B1" },
      { ...notification, id: "season-old", kind: "season_reached", context: "2" }
    ];
    api.getNotificationInbox.mockImplementation(async (limit) => ({ items: limit ? items : [], unreadCount: 3, nextCursor: null }));
    api.markInboxRead.mockResolvedValue({ unreadCount: 1 });
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /3 chưa đọc/ }));
    const dialog = screen.getByRole("dialog", { name: "Thông báo" });
    expect(await within(dialog).findByText("Bạn vừa nhận huy hiệu 🗓️ Tuần trọn vẹn")).toBeInTheDocument();
    expect(within(dialog).getByText("Chúc mừng! Bạn đã lên 🍂 Mùa thu · B1")).toBeInTheDocument();
    expect(within(dialog).getByText("Chúc mừng! Bạn đã lên ☀️ Mùa hạ")).toBeInTheDocument();
  });

  it("shows the test-date and unapproved upcoming-lesson notices with their dates", async () => {
    const items = [
      { ...notification, id: "test-date", kind: "test_date_active", context: "2026-11-09:2026-11-12" },
      { ...notification, id: "lesson-window", kind: "lesson_window_unapproved", context: "2026-11-11:A2" }
    ];
    api.getNotificationInbox.mockImplementation(async (limit) => ({ items: limit ? items : [], unreadCount: 2, nextCursor: null }));
    api.markInboxRead.mockResolvedValue({ unreadCount: 1 });
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /><Routes><Route path="/" element={<span />} /><Route path="/op/months" element={<h1>Lịch tháng</h1>} /></Routes></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /2 chưa đọc/ }));
    const dialog = screen.getByRole("dialog", { name: "Thông báo" });
    expect(await within(dialog).findByText("Ngày thử đang là 09/11 (ngày thật 12/11)")).toBeInTheDocument();
    expect(within(dialog).getByText("Nhớ trả về ngày thật sau khi thử.")).toBeInTheDocument();
    expect(within(dialog).getByText("Bài ngày 11/11 của A2 chưa được duyệt")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Mở lịch tháng" }));
    expect(await screen.findByRole("heading", { name: "Lịch tháng" })).toBeInTheDocument();
  });

  it("opens the matching appeal in the operator request hub", async () => {
    const relatedId = "dd8828fc-27c5-4321-8876-515725d2569a";
    api.getNotificationInbox.mockImplementation(async (limit) => ({ items: limit ? [{ ...notification, kind: "appeal_received", context: "assessment", relatedId }] : [], unreadCount: 1, nextCursor: null }));
    api.markInboxRead.mockResolvedValue({ unreadCount: 0 });
    function Target() { return <h1>{useLocation().search}</h1>; }
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /><Routes><Route path="/" element={<span />} /><Route path="/op/review" element={<Target />} /></Routes></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /1 chưa đọc/ }));
    await user.click(await screen.findByRole("button", { name: "Mở kháng nghị" }));
    expect(await screen.findByRole("heading", { name: `?tab=appeals&id=${relatedId}` })).toBeInTheDocument();
  });

  it("links a grading interruption to the exact exam attempt and manual review tab", async () => {
    const relatedId = "dd8828fc-27c5-4321-8876-515725d2569a";
    const items = [{ ...notification, kind: "assessment_manual_review", context: "final", relatedId }];
    api.getNotificationInbox.mockImplementation(async limit => ({ items: limit ? items : [], unreadCount: 1, nextCursor: null }));
    api.markInboxRead.mockResolvedValue({ unreadCount: 0 });
    function Target() { return <h1>{useLocation().search}</h1>; }
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /><Routes><Route path="/" element={<span />} /><Route path="/op/tests" element={<Target />} /></Routes></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /1 chưa đọc/ }));
    expect(await screen.findByText("Có bài thi tháng cần chấm tay")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mở bài cần chấm" }));
    expect(await screen.findByRole("heading", { name: `?tab=monthly&attemptId=${relatedId}` })).toBeInTheDocument();
  });

  it("keeps the badge when marking read fails and retries the mutation", async () => {
    let unreadCount = 1;
    api.getNotificationInbox.mockImplementation(async (limit, unreadOnly) => ({
      items: limit && (!unreadOnly || unreadCount) ? [notification] : [],
      unreadCount,
      nextCursor: null
    }));
    api.markInboxRead.mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(async () => {
      unreadCount = 0;
      return { unreadCount };
    });
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /1 chưa đọc/ }));
    await user.click(screen.getByRole("button", { name: "Chưa đọc" }));
    const mark = screen.getByRole("button", { name: "Đánh dấu tất cả đã đọc" });
    await user.click(mark);
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa đánh dấu được thông báo.");
    expect(screen.getByRole("button", { name: /1 chưa đọc/ })).toBeInTheDocument();
    await user.click(mark);
    await waitFor(() => expect(screen.getByText("Bạn đã đọc hết thông báo.")).toBeInTheDocument());
    expect(api.markInboxRead).toHaveBeenLastCalledWith({ all: true });
  });

  it("shows a user's PIN activity to Managers as an unread security notification", async () => {
    const items = [
      { id: "security-pin", kind: "security_report", context: "1", createdAt: "2026-11-12T11:28:00.000Z", readAt: null,
        securityReport: { subjectName: "Minh Anh", note: "Người học đã tự đổi PIN qua xác minh email." } },
      { id: "security-help", kind: "security_report", context: "3", createdAt: "2026-11-12T09:05:00.000Z", readAt: "2026-11-12T10:00:00.000Z",
        securityReport: { subjectName: "Lan Vận hành", note: "Người vận hành báo quên mã PIN và cần Quản lý hỗ trợ." } }
    ];
    api.getNotificationInbox.mockImplementation(async (limit) => ({ items: limit ? items : [], unreadCount: 1, nextCursor: null }));
    api.markInboxRead.mockResolvedValue({ unreadCount: 0 });
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /><Routes><Route path="/" element={<span />} /><Route path="/settings" element={<h1>Cài đặt</h1>} /></Routes></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /1 chưa đọc/ }));
    const dialog = screen.getByRole("dialog", { name: "Thông báo" });
    expect(await within(dialog).findByText("Đổi mã PIN · Minh Anh")).toBeInTheDocument();
    expect(within(dialog).getByText("Minh Anh vừa đổi mã PIN lúc 18:28 12/11.")).toBeInTheDocument();
    expect(within(dialog).getByText("Hỗ trợ mã PIN · Lan Vận hành · 3 lần")).toBeInTheDocument();
    expect(within(dialog).getByText("Người vận hành báo quên mã PIN và cần Quản lý hỗ trợ (lúc 16:05 12/11).")).toBeInTheDocument();
    await user.click(within(dialog).getAllByRole("button", { name: "Mở Người dùng" })[0]!);
    expect(await screen.findByRole("heading", { name: "Cài đặt" })).toBeInTheDocument();
    expect(api.markInboxRead).toHaveBeenCalledWith({ ids: ["security-pin"] });
  });
});
