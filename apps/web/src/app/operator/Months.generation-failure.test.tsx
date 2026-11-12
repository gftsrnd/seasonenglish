// @vitest-environment jsdom
import { render as renderUi, screen, within, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalProvider } from "../shared/ModalProvider.js";
import { MonthlyLessonPreview } from "./Months.js";

const render = (element: ReactElement) => renderUi(<ModalProvider>{element}</ModalProvider>);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const failure = {
  failedAt: "2026-11-12T12:00:00.000Z",
  attempts: 3,
  report: {
    severe: [{ severity: "severe" as const, code: "MONTHLY_PRONUNCIATION_HOMOPHONE", component: "pronunciation", message: "team / teem là hai từ đồng âm." }],
    light: [{ severity: "light" as const, code: "MONTHLY_ANSWER_LONGEST_OPTION", component: "listening", message: "Đáp án đúng thường dài nhất." }]
  },
  candidate: { title: "Ôn tập tuần 1", parts: [{ code: "instruction", title: "Hướng dẫn", content: { guidance: "Bản sinh lỗi: nghe và chọn." } }] }
};

describe("Operator monthly day: failed AI generation (December 2026 N3)", () => {
  it("shows the failing candidate's findings and content below the kept draft", () => {
    render(<MonthlyLessonPreview date="2026-12-04" cefr="A1" onClose={vi.fn()} onApprove={vi.fn()} lesson={{
      lessonNumber: 4, lessonDate: "2026-12-04", kind: "review", status: "draft", scopeHash: "scope", locked: false, correctionCount: 0,
      quality: { severe: [], light: [] }, generationFailure: failure,
      content: { title: "Ôn tập", parts: [{ code: "instruction", title: "Hướng dẫn", content: { guidance: "Bản nháp cũ vẫn giữ." } }] }
    }} />);
    const section = screen.getByRole("region", { name: "Lần sinh AI chưa đạt" });
    expect(within(section).getByText("Không duyệt được")).toBeInTheDocument();
    expect(within(section).getByText(/team \/ teem là hai từ đồng âm/)).toBeInTheDocument();
    expect(within(section).getByText(/Đáp án đúng thường dài nhất/)).toBeInTheDocument();
    expect(within(section).getByText(/Bản nháp hiện có ở trên vẫn được giữ nguyên/)).toBeInTheDocument();
    // The candidate renders with the ordinary lesson preview, below the kept draft's own preview.
    expect(section).toHaveTextContent(/hướng dẫn làm bài/i);
    expect(screen.getByTestId("monthly-lesson-4")).toHaveTextContent(/hướng dẫn làm bài/i);
    expect(screen.getByTestId("monthly-lesson-4")).not.toHaveTextContent("Chưa có bản nháp đạt yêu cầu.");
  });

  it("explains that a day with only a failed candidate has no draft yet", () => {
    render(<MonthlyLessonPreview date="2026-12-04" cefr="A1" onClose={vi.fn()} lesson={{
      lessonNumber: 4, lessonDate: "2026-12-04", kind: "review", status: "pending", scopeHash: "scope", locked: false, correctionCount: 0,
      quality: { severe: [], light: [] }, generationFailure: failure
    }} />);
    expect(screen.getByText("Chưa có bản nháp đạt yêu cầu.")).toBeInTheDocument();
    expect(screen.getByText(/không được lưu thành bản nháp/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Duyệt bài/ })).not.toBeInTheDocument();
  });
});
