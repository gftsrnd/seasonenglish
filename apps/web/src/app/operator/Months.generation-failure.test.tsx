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
    expect(within(section).getByText(/Đáp án đúng thường là lựa chọn dài nhất/)).toBeInTheDocument();
    // One compact row: title, status chip, count and a chevron; no generation timestamp or explanatory paragraph.
    expect(section).not.toHaveTextContent(/Sinh lúc|Bước tiếp theo|Bấm để/);
    expect(within(section).getByRole("button", { name: /Lần sinh AI gần nhất chưa đạt/ })).toHaveAttribute("aria-expanded", "true");
    // The findings sit in the sticky, collapsible dock above the lesson.
    expect(section.closest(".operator-monthly-findings-dock")).not.toBeNull();
    expect(within(section).getByText(/1 lỗi nặng · 1 cảnh báo/)).toBeInTheDocument();
    // The candidate renders with the ordinary lesson preview, below the kept draft's own preview.
    expect(screen.getByRole("region", { name: "Bản AI chưa đạt" })).toHaveTextContent(/hướng dẫn làm bài/i);
    expect(screen.getByTestId("monthly-lesson-4")).toHaveTextContent(/hướng dẫn làm bài/i);
    expect(screen.getByTestId("monthly-lesson-4")).not.toHaveTextContent("Chưa có bản nháp đạt yêu cầu.");
  });

  it("explains that a day with only a failed candidate has no draft yet", () => {
    render(<MonthlyLessonPreview date="2026-12-04" cefr="A1" onClose={vi.fn()} lesson={{
      lessonNumber: 4, lessonDate: "2026-12-04", kind: "review", status: "pending", scopeHash: "scope", locked: false, correctionCount: 0,
      quality: { severe: [], light: [] }, generationFailure: failure
    }} />);
    expect(screen.getByText("Chưa có bản nháp đạt yêu cầu.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Duyệt bài/ })).not.toBeInTheDocument();
    // Read-only (no editor): no edit buttons at all.
    expect(screen.queryByRole("button", { name: /Sửa/ })).not.toBeInTheDocument();
  });

  it("edits the failed candidate from the page's Sửa tay or from one finding's own Sửa", async () => {
    const onEdit = vi.fn();
    render(<MonthlyLessonPreview date="2026-12-04" cefr="A1" onClose={vi.fn()} onEdit={onEdit} lesson={{
      lessonNumber: 4, lessonDate: "2026-12-04", kind: "review", status: "pending", scopeHash: "scope", locked: false, correctionCount: 0,
      quality: { severe: [], light: [] }, generationFailure: failure
    }} />);
    const section = screen.getByRole("region", { name: "Lần sinh AI chưa đạt" });
    // No second, AI-sounding edit button in the panel: the page header's "Sửa tay" is the one entry point.
    expect(within(section).queryByRole("button", { name: /Sửa bản AI/ })).not.toBeInTheDocument();
    // Findings name the place (review section) before the text; severity chips stay.
    expect(section).toHaveTextContent("Nặng Phát âm: team / teem là hai từ đồng âm.");
    expect(section).toHaveTextContent("Nhẹ Phần 1 · Nghe & nhận biết từ: Đáp án đúng thường là lựa chọn dài nhất");
    screen.getByRole("button", { name: "Sửa tay" }).click();
    expect(onEdit).toHaveBeenLastCalledWith();
    // Each finding line opens the editor on that line's item.
    within(section).getByRole("button", { name: "Sửa tay: Phần 1 · Nghe & nhận biết từ" }).click();
    expect(onEdit).toHaveBeenLastCalledWith("MONTHLY_ANSWER_LONGEST_OPTION-1-0");
  });

  it("lists a saved draft's own quality findings with the next step", () => {
    render(<MonthlyLessonPreview date="2026-12-03" cefr="A2" onClose={vi.fn()} onEdit={vi.fn()} lesson={{
      lessonNumber: 3, lessonDate: "2026-12-03", kind: "new", status: "failed", scopeHash: "scope", locked: false, correctionCount: 0,
      quality: { severe: [{ severity: "severe", code: "MONTHLY_INVENTED_WORD_FORM", component: "word_use", message: "Every option must be real. Fix: word_use (colleagueing)" }], light: [] },
      content: { title: "Bài 3", parts: [{ code: "word_use", title: "Dùng từ", content: { prompt: "Choose", options: ["a", "b", "He was colleagueing me."], answer: "a" } }] }
    }} />);
    const section = screen.getByRole("region", { name: "Kiểm tra chất lượng bản nháp" });
    expect(section).toHaveTextContent("Chưa duyệt được");
    expect(within(section).getByRole("button", { name: "Sửa tay: Câu 1 · Dùng từ" })).toBeInTheDocument();
    expect(section).toHaveTextContent("Câu 1 · Dùng từ: Lựa chọn C dùng từ không có thật “colleagueing”");
  });
});
