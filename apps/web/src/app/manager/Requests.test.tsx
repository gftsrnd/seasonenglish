// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { ManagerComplaintView } from "@e4s/contracts";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { managerApiClient } from "../../api/manager.js";
import { ModalProvider } from "../shared/ModalProvider.js";
import { ManagerRequests } from "./Requests.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.spyOn(managerApiClient, "getManagerReopenRequests").mockResolvedValue({ requests: [] }); });

function renderRequests() {
  render(<MemoryRouter><ModalProvider><ManagerRequests /></ModalProvider></MemoryRouter>);
}

describe("Manager requests table", () => {
  it("opens requests first, keeps pending rows above decisions, and archives complaints from their tab", async () => {
    const user = userEvent.setup();
    const handled: ManagerComplaintView = {
      id: "handled", learnerId: "learner-1", learnerName: "Linh", kind: "attendance",
      reason: "Cần đối soát điểm danh.", relatedData: {}, status: "approved", resolution: "Đã đối soát.",
      submittedAt: "2026-11-26T02:00:00.000Z", dueAt: null, resolvedAt: "2026-11-26T04:00:00.000Z", archivedAt: null
    };
    const pending = {
      id: "open", target: "daily_lesson", targetId: "lesson", requestedBy: "operator", reason: "Cần bổ sung hướng dẫn.",
      status: "pending", decisionReason: null, createdAt: "2026-11-25T02:00:00.000Z", decidedAt: null, archivedAt: null
    } as const;
    vi.mocked(managerApiClient.getManagerReopenRequests).mockResolvedValue({ requests: [pending, {
      ...pending, id: "closed", status: "approved", reason: "Cần sửa ví dụ.", decisionReason: "Đồng ý mở lại.",
      createdAt: "2026-11-26T02:00:00.000Z", decidedAt: "2026-11-26T03:00:00.000Z"
    }] });
    let archivedAt: string | null = null;
    vi.spyOn(managerApiClient, "getManagerComplaints").mockImplementation(async () => ({ complaints: [{ ...handled, archivedAt }] }));
    const setArchived = vi.spyOn(managerApiClient, "setManagerRequestArchived").mockImplementation(async (_kind, _id, archived) => {
      archivedAt = archived ? "2026-11-27T02:00:00.000Z" : null;
    });
    renderRequests();
    await screen.findByText(pending.reason);
    expect(screen.getByRole("link", { name: "Yêu cầu mở khóa" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText(handled.reason)).not.toBeInTheDocument();
    const [, pendingRow, history] = within(screen.getByRole("table")).getAllByRole("row");
    expect(pendingRow).toHaveTextContent("Chờ xử lý");
    expect(within(pendingRow!).queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
    expect(history).toHaveTextContent("Đồng ý mở lại");
    await user.click(screen.getByRole("link", { name: "Khiếu nại học viên" }));
    expect(screen.getByRole("link", { name: "Khiếu nại học viên" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Cần bổ sung hướng dẫn.")).not.toBeInTheDocument();
    expect(screen.getByText(/Đã đối soát/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Lưu trữ$/ }));
    const archiveDialog = await screen.findByRole("dialog", { name: "Lưu trữ khiếu nại?" });
    expect(setArchived).not.toHaveBeenCalled();
    await user.click(within(archiveDialog).getByRole("button", { name: "Huỷ" }));
    expect(setArchived).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^Lưu trữ$/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Lưu trữ" }));
    await waitFor(() => expect(screen.queryByText(handled.reason)).not.toBeInTheDocument());
    const archiveFilter = screen.getByRole("checkbox", { name: "Xem mục đã lưu trữ" });
    await user.click(archiveFilter);
    expect(screen.getByText(/Đã đối soát/)).toBeInTheDocument();
    expect(screen.queryByText("Cần bổ sung hướng dẫn.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Khôi phục" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Khôi phục" }));
    await waitFor(() => expect(screen.queryByText(handled.reason)).not.toBeInTheDocument());
    await user.click(archiveFilter);
    expect(screen.getByText(/Đã đối soát/)).toBeInTheDocument();
    expect(setArchived.mock.calls).toEqual([["complaint", "handled", true], ["complaint", "handled", false]]);
    const remove = vi.spyOn(managerApiClient, "deleteManagerRequest").mockResolvedValue();
    await user.click(screen.getByRole("button", { name: "Xóa" }));
    const dialog = await screen.findByRole("dialog", { name: "Xóa khiếu nại" });
    await user.click(within(dialog).getByRole("button", { name: "Xóa" }));
    expect(remove).toHaveBeenCalledWith("complaint", "handled");
    expect(await screen.findByText("Chưa có khiếu nại.")).toBeVisible();
  });

  it("requires and submits a learner-facing decision response", async () => {
    const user = userEvent.setup();
    vi.spyOn(managerApiClient, "getManagerComplaints").mockResolvedValue({ complaints: [{
      id: "complaint-1", learnerId: "learner-1", learnerName: "Linh", kind: "exam_eligibility", reason: "Điểm danh bị ghi thiếu.", relatedData: {}, status: "pending", resolution: null,
      submittedAt: "2026-11-26T02:00:00.000Z", dueAt: "2026-11-27T02:00:00.000Z", resolvedAt: null
    }] });
    const decide = vi.spyOn(managerApiClient, "decideManagerComplaint").mockResolvedValue({ complaint: { id: "complaint-1", kind: "exam_eligibility", status: "approved", resolution: "Đã kiểm tra.", resolvedAt: "2026-11-26T04:00:00.000Z" } });
    renderRequests();
    await user.click(screen.getByRole("link", { name: "Khiếu nại học viên" }));
    await screen.findByText("Điểm danh bị ghi thiếu.");
    await user.click(screen.getByRole("button", { name: "Duyệt" }));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Duyệt" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Phản hồi bắt buộc"), "Đã kiểm tra.");
    await user.click(submit);
    expect(decide).toHaveBeenCalledWith("complaint-1", "approved", "Đã kiểm tra.");
  });
});
