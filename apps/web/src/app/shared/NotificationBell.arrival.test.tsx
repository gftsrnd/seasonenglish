// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./NotificationBell.js";

const api = vi.hoisted(() => ({ getNotificationInbox: vi.fn(), markInboxRead: vi.fn(), resolveTopicReport: vi.fn() }));
vi.mock("../../api/notifications.js", () => api);

type Item = { id: string; kind: string; context: string; createdAt: string; readAt: string | null; relatedId?: string | null; topicReport?: unknown };
const item = (id: string, kind: string, context = "", extra: Partial<Item> = {}): Item => ({ id, kind, context, createdAt: "2026-11-16T08:00:00.000Z", readAt: null, ...extra });

/** A server whose unread items can grow between polls; newest first. */
function inbox(initial: Item[]) {
  let items = [...initial];
  api.getNotificationInbox.mockImplementation(async (limit: number, unreadOnly: boolean) => {
    const visible = unreadOnly ? items.filter((entry) => !entry.readAt) : items;
    return { items: limit ? visible.slice(0, limit) : [], unreadCount: items.filter((entry) => !entry.readAt).length, nextCursor: null };
  });
  return { arrive: (...next: Item[]) => { items = [...next, ...items]; } };
}

async function poll() {
  const calls = api.getNotificationInbox.mock.calls.length;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await waitFor(() => expect(api.getNotificationInbox.mock.calls.length).toBeGreaterThan(calls));
}

function renderBell() {
  return render(<MemoryRouter>
    <NotificationBell />
    <Routes>
      <Route path="/" element={<span />} />
      <Route path="/support" element={<h1>Hỗ trợ học tập</h1>} />
      <Route path="/mgr/requests" element={<h1>Khiếu nại</h1>} />
    </Routes>
  </MemoryRouter>);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NotificationBell new-notification card", () => {
  beforeEach(() => {
    api.getNotificationInbox.mockReset();
    api.markInboxRead.mockReset();
    api.resolveTopicReport.mockReset();
    api.markInboxRead.mockResolvedValue({ unreadCount: 0 });
  });

  it("never pops up for unread items that were already there on page load", async () => {
    inbox([item("old-1", "complaint_received", "attendance"), item("old-2", "learning_reminder")]);
    renderBell();
    expect(await screen.findByRole("button", { name: /2 chưa đọc/ })).toBeInTheDocument();
    await poll();
    expect(screen.queryByTestId("inbox-arrival")).not.toBeInTheDocument();
  });

  it("shows one card per increase with the newest item, and opens that item on click", async () => {
    const server = inbox([item("old", "learning_reminder")]);
    const user = userEvent.setup();
    renderBell();
    await screen.findByRole("button", { name: /1 chưa đọc/ });
    server.arrive(item("new", "complaint_received", "exam_eligibility"));
    await poll();
    const card = await screen.findByTestId("inbox-arrival");
    expect(within(card).getByText("Khiếu nại về điều kiện dự thi")).toBeInTheDocument();
    expect(within(card).getByText(/Học viên đã gửi đơn/)).toBeInTheDocument();
    // Same count on the next poll: no second card.
    await user.click(within(card).getByRole("button", { name: "Ẩn thông báo mới" }));
    await poll();
    expect(screen.queryByTestId("inbox-arrival")).not.toBeInTheDocument();
    server.arrive(item("newer", "complaint_received", "attendance"));
    await poll();
    await user.click(within(await screen.findByTestId("inbox-arrival")).getByRole("button", { name: /Khiếu nại về điểm danh/ }));
    expect(await screen.findByRole("heading", { name: "Khiếu nại" })).toBeInTheDocument();
    expect(api.markInboxRead).toHaveBeenCalledWith({ ids: ["newer"] });
  });

  it("collapses several arrivals into one card that opens the bell", async () => {
    const server = inbox([item("old", "learning_reminder")]);
    const user = userEvent.setup();
    renderBell();
    await screen.findByRole("button", { name: /1 chưa đọc/ });
    server.arrive(item("a", "lesson_published"), item("b", "badge_earned", "Chăm chỉ"), item("c", "duel_invited", "games"));
    await poll();
    const card = await screen.findByTestId("inbox-arrival");
    expect(within(card).getByText("3 thông báo mới")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: /3 thông báo mới/ }));
    expect(screen.getByRole("dialog", { name: "Thông báo" })).toBeInTheDocument();
    expect(screen.queryByTestId("inbox-arrival")).not.toBeInTheDocument();
  });

  it("keeps a single card: a later arrival joins the visible one", async () => {
    const server = inbox([]);
    renderBell();
    await screen.findByRole("button", { name: "Thông báo" });
    server.arrive(item("a", "lesson_published"));
    await poll();
    expect(await screen.findByText("Lịch học có bài mới hoặc bài cập nhật")).toBeInTheDocument();
    server.arrive(item("b", "duel_invited", "games"));
    await poll();
    expect(await screen.findByText("2 thông báo mới")).toBeInTheDocument();
    expect(screen.getAllByTestId("inbox-arrival")).toHaveLength(1);
  });

  it("hides the card after about six seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = inbox([]);
    renderBell();
    await screen.findByRole("button", { name: "Thông báo" });
    server.arrive(item("a", "lesson_published"));
    await poll();
    await screen.findByTestId("inbox-arrival");
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByTestId("inbox-arrival")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1_500); });
    expect(screen.queryByTestId("inbox-arrival")).not.toBeInTheDocument();
  });

  it("anchors the card under the bell and keeps it inside a phone viewport", async () => {
    const server = inbox([]);
    renderBell();
    const bell = await screen.findByRole("button", { name: "Thông báo" });
    vi.spyOn(bell, "getBoundingClientRect").mockReturnValue({ top: 12, bottom: 52, left: 250, right: 290, width: 40, height: 40, x: 250, y: 12, toJSON: () => ({}) });
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(300);
    server.arrive(item("a", "lesson_published"));
    await poll();
    const card = await screen.findByTestId("inbox-arrival");
    expect(card).toHaveStyle({ top: "60px", left: "8px", width: "284px" });
  });

  it("does not pop up while the bell is open", async () => {
    const server = inbox([]);
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: "Thông báo" }));
    server.arrive(item("a", "lesson_published"));
    await poll();
    expect(screen.queryByTestId("inbox-arrival")).not.toBeInTheDocument();
  });
});

describe("NotificationBell audited notice types", () => {
  beforeEach(() => {
    api.getNotificationInbox.mockReset();
    api.markInboxRead.mockReset();
    api.resolveTopicReport.mockReset();
  });

  it("shows a Mini game topic report with its details and resolves it from the bell", async () => {
    const report = item("topic-inbox", "topic_report_received", "games", {
      relatedId: "11111111-1111-4111-8111-111111111111",
      topicReport: { learnerName: "Lan", topic: "casino", reason: "Chủ đề không phù hợp", strikeCount: 3, status: "open" }
    });
    inbox([report]);
    api.resolveTopicReport.mockResolvedValue({ saved: true });
    api.markInboxRead.mockResolvedValue({ unreadCount: 0 });
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: /1 chưa đọc/ }));
    const dialog = screen.getByRole("dialog", { name: "Thông báo" });
    expect(await within(dialog).findByText("Báo cáo chủ đề Mini game · Lan")).toBeInTheDocument();
    expect(within(dialog).getByText(/Nhập “casino” – Chủ đề không phù hợp\. 3 lần vi phạm liên tiếp/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Đã xử lý" }));
    expect(api.resolveTopicReport).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(api.markInboxRead).toHaveBeenCalledWith({ ids: ["topic-inbox"] });
    // Resolving keeps the Operator in the bell.
    expect(screen.getByRole("dialog", { name: "Thông báo" })).toBeInTheDocument();
  });

  it("shows a handled topic report without a resolve button", async () => {
    inbox([item("topic-done", "topic_report_received", "games", {
      readAt: "2026-11-16T09:00:00.000Z",
      relatedId: "11111111-1111-4111-8111-111111111111",
      topicReport: { learnerName: "Lan", topic: "casino", reason: "Chủ đề không phù hợp", strikeCount: 3, status: "resolved" }
    })]);
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: "Thông báo" }));
    const dialog = screen.getByRole("dialog", { name: "Thông báo" });
    expect(await within(dialog).findByText(/Báo cáo đã được xử lý/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Đã xử lý" })).not.toBeInTheDocument();
  });

  it("tells a learner that this month's lessons are locked and opens the unlock request", async () => {
    inbox([item("locked", "monthly_lessons_locked", "2026-11")]);
    api.markInboxRead.mockResolvedValue({ unreadCount: 0 });
    const user = userEvent.setup();
    renderBell();
    await user.click(await screen.findByRole("button", { name: /1 chưa đọc/ }));
    const dialog = screen.getByRole("dialog", { name: "Thông báo" });
    expect(await within(dialog).findByText("Bài học tháng này đang bị khóa")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Gửi đơn xin mở" }));
    expect(await screen.findByRole("heading", { name: "Hỗ trợ học tập" })).toBeInTheDocument();
    expect(api.markInboxRead).toHaveBeenCalledWith({ ids: ["locked"] });
  });
});
