// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MonthlyFinalDraftView } from "@e4s/contracts";
import { ModalProvider } from "../shared/ModalProvider.js";
import { MonthlyFinalReview } from "./MonthlyFinalReview.js";
import { monthlyFinalView } from "../../../test/support/monthly-final-view.js";

afterEach(cleanup);

/** A published exam re-checked under today's rules (4175: GEN12 now fails, so the exam status is DRAFT). */
function published(extra: Partial<MonthlyFinalDraftView> = {}): MonthlyFinalDraftView {
  return { ...monthlyFinalView({ status: "DRAFT", editable: false }), status: "published", editable: false, ...extra };
}

describe("published monthly final review", () => {
  it("shows its real state, never 'Cần sửa' with a 'Duyệt & phát hành' button", () => {
    render(<ModalProvider><MonthlyFinalReview draft={published()} onClose={vi.fn()} onPublish={vi.fn()} /></ModalProvider>);
    expect(screen.getByTestId("monthly-final-status")).toHaveTextContent("Đã phát hành");
    expect(screen.queryByText("Cần sửa")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt & phát hành" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Việc còn thiếu" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Kiểm tra đề" })).toHaveTextContent("1 kiểm tra không đạt theo quy tắc hiện tại");
    expect(screen.queryByRole("button", { name: "Sinh lại đề" })).not.toBeInTheDocument();
    expect(screen.queryByText(/hãy sinh lại/u)).not.toBeInTheDocument();
  });

  it("offers 'Sinh lại đề' for a truly stale exam nobody has started", async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    render(<ModalProvider><MonthlyFinalReview draft={published({ stale: true, regenerable: true, startedLearners: 0 })} onClose={vi.fn()} onRegenerate={onRegenerate} /></ModalProvider>);
    expect(screen.getByText(/Đề hiện tại vẫn dùng cho học viên đến khi bản mới được duyệt và phát hành/u)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sinh lại đề" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("keeps a stale exam learners have started, with a calm notice and no block", () => {
    render(<ModalProvider><MonthlyFinalReview draft={published({ stale: true, regenerable: false, startedLearners: 3 })} onClose={vi.fn()} onRegenerate={vi.fn()} /></ModalProvider>);
    expect(screen.getByRole("note")).toHaveTextContent("Đề đã có 3 học viên làm, giữ nguyên đề này.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sinh lại đề" })).not.toBeInTheDocument();
  });

  it("tells a replacement draft that the published version stays live", () => {
    render(<ModalProvider><MonthlyFinalReview draft={{ ...monthlyFinalView(), livePublishedVersion: 6 }} onClose={vi.fn()} onPublish={vi.fn()} /></ModalProvider>);
    expect(screen.getByText(/thay cho phiên bản 6 đang phát hành/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duyệt & phát hành" })).toBeInTheDocument();
  });
});
