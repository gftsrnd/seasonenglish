// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeeklyReviewSessionView } from "@e4s/contracts";
import { LearnerLesson } from "./Learning.js";

afterEach(cleanup);

const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹàáèéìíòóùúý]/iu;
const translation = { question: "Báo cáo đã sẵn sàng chưa?", answer: "Rồi" };

/** A monthly daily lesson as the learner API sends it: the listening translation is not in the content. */
function monthlyLesson(cefr: "A2" | "B1", evidence: Record<string, unknown> = {}, contentExtra: Record<string, unknown> = {}) {
  return {
    id: `monthly-${cefr}`, kind: "new", exerciseVersionId: "v1", title: "Reports", dayNumber: 1, weekNumber: 0, weekTopic: "Reports", durationMinutes: 10, cefr,
    content: { parts: [
      { code: "objective", title: "Mục tiêu", content: { text: "Report progress." } },
      { code: "listening", title: cefr === "A2" ? "Nghe" : "Listening", content: { script: "The report is ready.", prompt: cefr === "A2" ? "Nghe và chọn: Is it ready?" : "Is it ready?", options: ["Yes", "No", "Maybe", "Later"], answer: "Yes", ...contentExtra } }
    ] },
    progress: { status: "in_progress", completedPartCodes: ["objective"], evidence }
  } as any;
}

describe("exercise translation after a finished question (12/11)", () => {
  it("shows nothing before the question is finished and offers no early translation button", async () => {
    const submitLessonPartAttempt = vi.fn().mockResolvedValue({
      lessonId: "monthly-A2", partCode: "listening",
      evidence: { attempts: 1, status: "wrong_retry", answer: "No", feedback: "Chưa đúng." },
      progress: { status: "in_progress", completedPartCodes: ["objective"], evidence: { listening: { attempts: 1, status: "wrong_retry", answer: "No", feedback: "Chưa đúng." } } }
    });
    const { container } = render(<LearnerLesson view={{ lesson: monthlyLesson("A2"), lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), submitLessonPartAttempt } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(screen.queryByTestId("lesson-exercise-translation")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("radio", { name: /No/ }));
    fireEvent.click(screen.getByRole("button", { name: "Nộp bài" }));
    await screen.findByText("Chưa đúng.");
    expect(screen.queryByTestId("lesson-exercise-translation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Xem bản dịch|View translation/u })).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain(translation.question);
  });

  it("shows the question and answer translation after a correct answer, with the result", async () => {
    const submitLessonPartAttempt = vi.fn().mockResolvedValue({
      lessonId: "monthly-A2", partCode: "listening", translation,
      evidence: { attempts: 1, status: "correct", answer: "Yes", feedback: "Đúng rồi." },
      progress: { status: "in_progress", completedPartCodes: ["objective", "listening"], evidence: { listening: { attempts: 1, status: "correct", answer: "Yes", feedback: "Đúng rồi." } } }
    });
    render(<LearnerLesson view={{ lesson: monthlyLesson("A2"), lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), submitLessonPartAttempt } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    await userEvent.setup().click(screen.getByRole("radio", { name: /Yes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Nộp bài" }));
    const block = await screen.findByRole("region", { name: "Bản dịch tiếng Việt · Nghe" });
    expect(block).toHaveTextContent("Câu hỏi: Báo cáo đã sẵn sàng chưa?");
    expect(block).toHaveTextContent("Đáp án: Rồi");
    // Same look as the answer feedback: an info notice.
    expect(block.querySelector(".banner.info")).not.toBeNull();
  });

  it("shows it after the last attempt is used, together with the correct answer", () => {
    const exhausted = monthlyLesson("B1", { listening: { attempts: 2, status: "wrong_exhausted", answer: "No", feedback: "Not quite." } }, { questionTranslation: translation.question, answerTranslation: translation.answer });
    exhausted.progress.completedPartCodes = ["objective", "listening"];
    render(<LearnerLesson view={{ lesson: exhausted, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), submitLessonPartAttempt: vi.fn() } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. practice/i }));
    expect(screen.getByText("Answer: Yes")).toBeInTheDocument();
    const block = screen.getByRole("region", { name: "Vietnamese translation · Listening" });
    expect(block).toHaveTextContent("Question: Báo cáo đã sẵn sàng chưa?");
    expect(block).toHaveTextContent("Answer: Rồi");
    expect(within(block).getByText(translation.question)).toHaveAttribute("lang", "vi");
  });

  it("never sends the Vietnamese translation to text-to-speech", async () => {
    const speak = vi.fn();
    const finished = monthlyLesson("A2", { listening: { attempts: 1, status: "correct", answer: "Yes" } }, { questionTranslation: translation.question, answerTranslation: translation.answer });
    finished.progress.completedPartCodes = ["objective", "listening"];
    render(<LearnerLesson view={{ lesson: finished, lock: null }} actions={{ navigate: vi.fn(), speak, submitLessonPartAttempt: vi.fn() } as any} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(screen.getByTestId("lesson-exercise-translation")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /Nghe nội dung phần/u }));
    expect(speak).toHaveBeenCalledWith("The report is ready.", "en-US", expect.anything());
    for (const call of speak.mock.calls) expect(String(call[0])).not.toMatch(VIETNAMESE);
  });
});

describe("Friday review translation", () => {
  const view = (prompt: string): WeeklyReviewSessionView => ({
    lessonId: "review-1", warmup: { status: "skipped", cards: [] },
    sections: [{ code: "word_use", title: "Word use", totalItems: 2, correctItems: 0, completed: false }],
    currentSectionCode: "word_use",
    currentQuestion: { sectionCode: "word_use", itemId: prompt, variantId: prompt, retry: false, prompt, options: ["deadline", "budget"], freeResponse: false, acceptsAudio: false },
    completed: false, completedAt: null
  });
  const reviewLesson = { id: "review-1", title: "Bài ôn tuần 1", dayNumber: 5, weekNumber: 0, weekTopic: "Handover", durationMinutes: 15, cefr: "A2", kind: "review", content: { parts: [] }, progress: { status: "in_progress", completedPartCodes: [], evidence: {} } } as any;

  it("shows the translation only after a correct answer, never after a wrong one", async () => {
    const user = userEvent.setup();
    const answerWeeklyReview = vi.fn()
      .mockResolvedValueOnce({ correct: false, feedback: "Chưa đúng.", willRetry: true, session: view("The ___ is Friday.") })
      .mockResolvedValueOnce({ correct: true, feedback: "Đúng rồi.", willRetry: false, translation: { question: "Hạn chót là thứ Sáu.", answer: "hạn chót" }, session: view("Our ___ is small.") });
    render(<LearnerLesson view={{ lesson: reviewLesson, lock: null }} actions={{ navigate: vi.fn(), speak: vi.fn(), saveLessonProgress: vi.fn(), getWeeklyReviewSession: vi.fn().mockResolvedValue(view("The ___ is Friday.")), answerWeeklyReview } as any} />);
    await user.click(await screen.findByRole("button", { name: "budget" }));
    await screen.findByText(/Chưa đúng\./u);
    expect(screen.queryByTestId("review-exercise-translation")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "deadline" }));
    const block = await screen.findByTestId("review-exercise-translation");
    expect(block).toHaveTextContent("Câu hỏi: Hạn chót là thứ Sáu.");
    expect(block).toHaveTextContent("Đáp án: hạn chót");
  });
});
