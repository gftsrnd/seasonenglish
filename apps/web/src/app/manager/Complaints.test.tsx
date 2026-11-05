// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { managerApiClient } from "../../api/manager.js";
import { ManagerComplaints } from "./Complaints.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Manager complaint queue", () => {
  it("requires and submits a learner-facing decision response", async () => {
    const user = userEvent.setup();
    vi.spyOn(managerApiClient, "getManagerComplaints").mockResolvedValue({ complaints: [{
      id: "complaint-1", learnerId: "learner-1", learnerName: "Linh", kind: "exam_eligibility", reason: "Điểm danh bị ghi thiếu.", relatedData: {}, status: "pending", resolution: null,
      submittedAt: "2026-11-26T02:00:00.000Z", dueAt: "2026-11-27T02:00:00.000Z", resolvedAt: null
    }] });
    const decide = vi.spyOn(managerApiClient, "decideManagerComplaint").mockResolvedValue({ complaint: { id: "complaint-1", kind: "exam_eligibility", status: "approved", resolution: "Đã kiểm tra.", resolvedAt: "2026-11-26T04:00:00.000Z" } });
    render(<ManagerComplaints />);
    await screen.findByText("Điểm danh bị ghi thiếu.");
    await user.click(screen.getByRole("button", { name: "Duyệt" }));
    expect(decide).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Phản hồi bắt buộc"), "Đã kiểm tra.");
    await user.click(screen.getByRole("button", { name: "Duyệt" }));
    expect(decide).toHaveBeenCalledWith("complaint-1", "approved", "Đã kiểm tra.");
  });
});
