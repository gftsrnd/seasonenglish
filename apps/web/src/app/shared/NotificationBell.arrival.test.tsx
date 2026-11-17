// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { AppGuide } from "./AppGuide.js";
import { NotificationBell } from "./NotificationBell.js";
import { Modal } from "../learner/ui.js";

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
    expect(within(card).queryByText(/Học viên đã gửi đơn/)).not.toBeInTheDocument();
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

  it("anchors the compact arrival below the bell and keeps placement details in the bell", async () => {
    const server = inbox([]);
    const user = userEvent.setup();
    renderBell();
    const bell = await screen.findByRole("button", { name: "Thông báo" });
    const bounds = vi.spyOn(bell, "getBoundingClientRect").mockReturnValue(new DOMRect(270, 12, 40, 40));
    const measure = HTMLElement.prototype.getBoundingClientRect;
    const cardBounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("inbox-arrival") ? new DOMRect(0, 0, 220, 40) : measure.call(this);
    });
    server.arrive(item("approved", "assessment_result", "placement"));
    await poll();
    const card = await screen.findByTestId("inbox-arrival");
    expect(card).toHaveStyle({ top: "56px", left: "180px" });
    bounds.mockRestore();
    cardBounds.mockRestore();
    expect(card).toHaveTextContent("Có kết quả Test đầu vào");
    expect(card).not.toHaveTextContent(/xin thi lại/);
    expect(within(card).getByRole("button", { name: "Ẩn thông báo mới" })).toHaveTextContent(/^$/);
    await user.click(screen.getByRole("button", { name: /Thông báo · 1 chưa đọc/ }));
    expect(await within(screen.getByRole("dialog", { name: "Thông báo" })).findByText(/xin thi lại trong 72 giờ/)).toBeInTheDocument();
    expect(api.markInboxRead).not.toHaveBeenCalled();
  });

  it("defers the arrival until the guide closes without marking it read", async () => {
    const server = inbox([]);
    const visible = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    const Fixture = () => {
      const [guideOpen, setGuideOpen] = useState(false);
      return <><AppGuide role="learner" pathname="/home" compact onOpenChange={setGuideOpen} />
        <NotificationBell deferArrival={guideOpen} />
        <div className="home-page" data-monthly-preparation="true"><section data-home-block="primary">Học bài</section></div></>;
    };
    render(<MemoryRouter><Fixture /></MemoryRouter>);
    await screen.findByRole("button", { name: "Thông báo" });
    fireEvent.click(await screen.findByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(screen.getByRole("dialog", { name: "Hướng dẫn sử dụng" })).toBeInTheDocument();
    server.arrive(item("approved", "assessment_result", "placement"));
    await poll();
    expect(await screen.findByRole("button", { name: /1 chưa đọc/ })).toBeInTheDocument();
    expect(screen.queryByTestId("inbox-arrival")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đóng hướng dẫn" }));
    expect(await screen.findByTestId("inbox-arrival")).toHaveTextContent("Có kết quả Test đầu vào");
    expect(api.markInboxRead).not.toHaveBeenCalled();
    visible.mockRestore();
  });

  it("keeps a new notification queued while a centered decision modal is open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = inbox([]);
    const Fixture = () => {
      const [open, setOpen] = useState(true);
      return <><NotificationBell /><Modal open={open} title="Bạn đã lên mức B2" onClose={() => setOpen(false)} /></>;
    };
    render(<MemoryRouter><Fixture /></MemoryRouter>);
    await screen.findByRole("dialog", { name: "Bạn đã lên mức B2" });
    server.arrive(item("final", "assessment_result", "placement_retake"));
    await poll();
    expect(await screen.findByRole("button", { name: /1 chưa đọc/ })).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(7_000); });
    expect(screen.queryByTestId("inbox-arrival")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đóng hộp thoại" }));
    expect(await screen.findByTestId("inbox-arrival")).toHaveTextContent("Đã xếp lớp sau bài thi lại");
    expect(api.markInboxRead).not.toHaveBeenCalled();
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
