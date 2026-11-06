// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonthlyFinalReview } from "./MonthlyFinalReview.js";
import { monthlyFinalView } from "../../../test/support/monthly-final-view.js";

afterEach(cleanup);

describe("Monthly final review screen", () => {
  it("reuses the level editor and shows status, GEN report, mapping, GA/GB and pronunciation positions", () => {
    render(<MonthlyFinalReview draft={monthlyFinalView()} onClose={vi.fn()} onSave={vi.fn()} onPublish={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Bản nháp đề thi tháng" });
    expect(within(dialog).getByText("Chi tiết 4 phần")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Nội dung L01" })).toBeInTheDocument();
    expect(screen.getByTestId("monthly-final-status")).toHaveTextContent("Chờ rà soát");
    expect(screen.getByTestId("monthly-final-status")).toHaveAttribute("data-status", "NEEDS_REVIEW");
    expect(screen.getByText("Chưa có audio")).toBeInTheDocument();
    const report = screen.getByRole("region", { name: "Việc còn thiếu" });
    expect(within(report).getByText("Còn thiếu 1 việc")).toBeInTheDocument();
    expect(within(report).getByTestId("todo-audio")).toHaveTextContent("Chưa có audio");
    expect(within(report).getByRole("checkbox", { name: "Đã nghe soát audio" })).toBeDisabled();
    expect(within(report).getByText(/Xem toàn bộ 23 kiểm tra/u)).toBeInTheDocument();
    expect(within(screen.getByTestId("gen-GEN05")).getByRole("checkbox", { name: "Xác nhận đã rà GEN05" })).toBeEnabled();
    expect(screen.queryByTestId("gen-GEN13")).not.toBeInTheDocument();
    const mapping = screen.getByRole("group", { name: "Bảng mapping mục từ" });
    expect(within(mapping).getAllByRole("row")).toHaveLength(5);
    expect(within(mapping).getByRole("row", { name: /V01 deadline.*L01 B/u })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "GA thành phần chính" })).toHaveValue("ga-1");
    expect(screen.getByText(/P1 \/nt\/ · Sound 1/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt & phát hành" })).toBeDisabled();
  });

  it("saves edited GA/GB components, confirmations and item text with the four sections", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MonthlyFinalReview draft={monthlyFinalView()} onClose={vi.fn()} onSave={onSave} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "GA thành phần chính" }), "ga-3");
    await user.click(screen.getByRole("checkbox", { name: "Xác nhận đã rà GEN05" }));
    await user.clear(screen.getByRole("textbox", { name: "Nội dung R01" }));
    await user.type(screen.getByRole("textbox", { name: "Nội dung R01" }), "Please ___ the invoice.");
    await user.click(screen.getByRole("button", { name: "Lưu bản nháp" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const input = onSave.mock.calls[0]![0];
    expect(input.review.grammar).toEqual(expect.arrayContaining([expect.objectContaining({ code: "GA", mainStepId: "ga-3", secondaryStepId: "ga-2", mainPatterns: ["should + V"] })]));
    expect(input.review.manualConfirmations).toEqual(["GEN05"]);
    expect(input.review.audioReviewed).toBe(false);
    expect(input.sections.find((section: { code: string }) => section.code === "reading").groups[0].tasks[0].prompt).toBe("Please ___ the invoice.");
  });

  it("allows the 'đã nghe soát' tick only once audio is saved, and publishes only a READY, reviewed exam", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MonthlyFinalReview draft={monthlyFinalView()} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Đã nghe soát audio" })).toBeDisabled();
    unmount();

    const onSave = vi.fn().mockResolvedValue(undefined);
    const second = render(<MonthlyFinalReview draft={monthlyFinalView({ audio: true })} onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("checkbox", { name: "Đã nghe soát audio" }));
    await user.click(screen.getByRole("button", { name: "Lưu bản nháp" }));
    await waitFor(() => expect(onSave.mock.calls[0]![0].review.audioReviewed).toBe(true));
    second.unmount();

    const onPublish = vi.fn().mockResolvedValue(undefined);
    render(<MonthlyFinalReview draft={monthlyFinalView({ status: "READY", audio: true, reviewed: true })} onClose={vi.fn()} onSave={vi.fn()} onPublish={onPublish} />);
    expect(screen.getByTestId("monthly-final-status")).toHaveTextContent("Sẵn sàng phát hành");
    await user.click(screen.getByRole("button", { name: "Duyệt & phát hành" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("is read-only after 00:00 of the exam date", () => {
    render(<MonthlyFinalReview draft={monthlyFinalView({ editable: false, status: "READY", audio: true, reviewed: true })} onClose={vi.fn()} onSave={vi.fn()} onPublish={vi.fn()} />);
    expect(screen.getAllByText(/Đã quá 00:00 ngày thi/u).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Lưu bản nháp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Nội dung L01" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "GA thành phần chính" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duyệt & phát hành" })).toBeDisabled();
  });
});
