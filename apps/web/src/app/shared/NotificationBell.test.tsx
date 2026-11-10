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

  it("opens the matching appeal in the operator request hub", async () => {
    const relatedId = "dd8828fc-27c5-4321-8876-515725d2569a";
    api.getNotificationInbox.mockImplementation(async (limit) => ({ items: limit ? [{ ...notification, kind: "appeal_received", context: "assessment", relatedId }] : [], unreadCount: 1, nextCursor: null }));
    api.markInboxRead.mockResolvedValue({ unreadCount: 0 });
    function Target() { return <h1>{useLocation().search}</h1>; }
    const user = userEvent.setup();
    render(<MemoryRouter><NotificationBell /><Routes><Route path="/" element={<span />} /><Route path="/op/review" element={<Target />} /></Routes></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /1 chưa đọc/ }));
    await user.click(await screen.findByRole("button", { name: "Mở kháng nghị" }));
    expect(screen.getByRole("heading", { name: `?tab=appeals&id=${relatedId}` })).toBeInTheDocument();
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
});
