// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import type { ContentReviewView, SessionView } from "@e4s/contracts";
import { ToastProvider } from "../shared/design-system.js";
import { OperatorRouteController, type OperatorApiClient } from "./OperatorRouteController.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const session = { role: "operator", user: { id: "op", displayName: "Operator", email: null } } as SessionView;
const appeal: ContentReviewView["appeals"][number] = {
  id: "appeal-1", learnerName: "Hà", reason: "Xem lại điểm bài luyện", status: "pending",
  createdAt: "2026-11-08T01:00:00Z", resolution: "", kind: "weekly_practice", submissionId: "submission-1", currentScore: 68
};

function openRoute(path: string, client: Record<string, unknown>) {
  render(<MemoryRouter initialEntries={[path]}><ToastProvider><OperatorRouteController session={session} client={client as unknown as OperatorApiClient} /></ToastProvider></MemoryRouter>);
}

it("opens a focused practice appeal from the old review link and shows the saved decision", async () => {
  const user = userEvent.setup();
  let current = appeal;
  let removed = false;
  const getContentReviewAppeals = vi.fn(async (filter: { id?: string; status?: string }) => ({
    appeals: !removed && (filter.id || filter.status === "all" || filter.status === (current.status === "pending" ? "pending" : "handled")) ? [current] : [], hasMore: false
  }));
  const deleteContentReviewAppeal = vi.fn(async () => { removed = true; });
  const decideReviewedAppeal = vi.fn(async () => {
    current = { ...current, status: "accepted", resolution: "Đã chấm lại." };
    return { saved: true };
  });
  openRoute("/op/review?tab=appeals&id=appeal-1", { getContentReviewAppeals, decideReviewedAppeal, deleteContentReviewAppeal });

  expect(await screen.findByRole("heading", { name: "Kháng nghị" })).toBeInTheDocument();
  const list = await screen.findByRole("table", { name: "Danh sách kháng nghị" });
  expect(within(list).getByRole("link", { name: "Thu gọn" })).toHaveAttribute("aria-expanded", "true");
  await user.click(within(list).getByRole("button", { name: "Chấp nhận kháng nghị" }));
  const score = await screen.findByRole("dialog", { name: "Chấm lại bài thực hành tuần" });
  await user.type(within(score).getByRole("spinbutton"), "83");
  await user.click(within(score).getByRole("button", { name: "Tiếp tục" }));
  const response = await screen.findByRole("dialog", { name: "Chấp nhận kháng nghị" });
  await user.type(within(response).getByRole("textbox"), "Đã chấm lại.");
  await user.click(within(response).getByRole("button", { name: "Chấp nhận" }));

  expect(decideReviewedAppeal).toHaveBeenCalledWith("appeal-1", { status: "accepted", resolution: "Đã chấm lại.", newScore: 83 });
  expect(await within(list).findByText("Phản hồi: Đã chấm lại.")).toBeInTheDocument();
  const filter = screen.getByRole("combobox", { name: "Trạng thái" });
  expect(filter).toHaveValue("all");
  expect(within(list).getByRole("cell", { name: "Đã chấp nhận" })).toBeVisible();
  await user.selectOptions(filter, "pending");
  expect(await screen.findByText("Chưa có kháng nghị chờ xử lý.")).toBeVisible();
  await user.selectOptions(screen.getByRole("combobox", { name: "Trạng thái" }), "handled");
  expect(await screen.findByText("Phản hồi: Đã chấm lại.")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Về danh sách" })).not.toBeInTheDocument();
  const handledList = screen.getByRole("table", { name: "Danh sách kháng nghị" });
  await user.click(within(handledList).getByRole("button", { name: "Xóa" }));
  const confirmation = await screen.findByRole("dialog", { name: "Xóa kháng nghị" });
  await user.click(within(confirmation).getByRole("button", { name: "Xóa" }));
  expect(deleteContentReviewAppeal).toHaveBeenCalledWith("appeal-1");
  expect(await screen.findByText("Chưa có kháng nghị đã xử lý.")).toBeVisible();
});

it.each([false, true])("uses the compact retake collapse icon only on phone or tablet (%s)", async (compact) => {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: compact && query === "(max-width: 1024px)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
  const getContentReviewAppeals = vi.fn(async () => ({
    appeals: [{ ...appeal, kind: "assessment", requestKind: "retake", assessmentKind: "placement" }], hasMore: false,
  }));
  openRoute("/op/review?tab=appeals&id=appeal-1", { getContentReviewAppeals });

  const toggle = await screen.findByRole("link", { name: "Thu gọn" });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  if (compact) expect(toggle.querySelector("svg")).toBeInTheDocument();
  else expect(toggle).toHaveTextContent("Thu gọn");
});

it("redirects the old month hash and shows decisions directly in the manager request list", async () => {
  openRoute("/op/months#my-reopen-requests", {
    getOwnReopenRequests: vi.fn().mockResolvedValue({ requests: [{
      id: "reopen-1", target: "weekly_review", status: "pending", reason: "Bổ sung nội dung", createdAt: "2026-11-07T01:00:00Z",
      lesson: { date: "2026-11-07", cefr: "A2", number: 4 }
    }] }),
    getOwnDeletionRequests: vi.fn().mockResolvedValue({ requests: [{
      id: "deletion-1", learnerName: "Học viên cũ", status: "approved", reason: "Tài khoản tạo nhầm", note: "Đã xác minh",
      requestedAt: "2026-11-08T01:00:00Z", decidedAt: "2026-11-08T02:00:00Z"
    }] })
  });

  expect(await screen.findByRole("heading", { name: "Yêu cầu" })).toBeInTheDocument();
  const list = within(screen.getByRole("table", { name: "Danh sách yêu cầu" }));
  expect(await list.findByText("Mở lại bài ôn")).toBeVisible();
  expect(list.getByText(/2026-11-07 · A2 · Ôn tập/)).toBeVisible();
  expect(list.queryByText(/Bài 4/)).not.toBeInTheDocument();
  expect(list.getByText("Phản hồi: Đã xác minh")).toBeVisible();
  expect(list.getByText("Tài khoản tạo nhầm")).toBeVisible();
  expect(list.getByText("Đã duyệt")).toBeVisible();
  expect(list.queryAllByText("—", { exact: true })).toHaveLength(0);
  expect(list.queryByRole("link")).not.toBeInTheDocument();
});

it("names a reopened daily lesson by its new-lesson number, not the raw calendar slot", async () => {
  openRoute("/op/months#my-reopen-requests", {
    getOwnReopenRequests: vi.fn().mockResolvedValue({ requests: [{
      id: "reopen-2", target: "daily_lesson", status: "pending", reason: "Sửa ví dụ", createdAt: "2026-11-09T01:00:00Z",
      lesson: { date: "2026-11-09", cefr: "A1", number: 6, newLessonNumber: 5 }
    }] }),
    getOwnDeletionRequests: vi.fn().mockResolvedValue({ requests: [] })
  });
  const list = within(await screen.findByRole("table", { name: "Danh sách yêu cầu" }));
  expect(await list.findByText(/2026-11-09 · A1 · Bài 5/)).toBeVisible();
  expect(list.queryByText(/Bài 6/)).not.toBeInTheDocument();
});
