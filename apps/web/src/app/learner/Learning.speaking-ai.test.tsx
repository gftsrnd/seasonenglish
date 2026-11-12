// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerLesson } from "./Learning.js";

afterEach(cleanup);
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

const heard = { attempts: 0, answer: JSON.stringify(["meeting", "email", "manager"]) };

function lesson(speaking: Record<string, unknown>, completedSpeaking = false) {
  const completedPartCodes = ["objective", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", ...(completedSpeaking ? ["speaking"] : [])];
  return {
    id: "lesson-speaking-ai", title: "Present Simple", dayNumber: 3, weekNumber: 1, weekTopic: "Team work", durationMinutes: 15, cefr: "A2", kind: "new",
    content: { parts: [
      { code: "objective", content: { items: ["Nói về lịch họp của nhóm."] } },
      { code: "vocabulary", content: { items: [{ word: "meeting", pronunciation: "/ˈmiːtɪŋ/", meaning: "cuộc họp" }] } },
      { code: "grammar", content: { formula: "S + V(s/es)", usage: "Thói quen.", examples: ["The team meets every Monday."] } },
      { code: "pronunciation", content: { focus: "/m/", words: [{ ipa: "/ˈmiːtɪŋ/", word: "meeting" }, { ipa: "/ˈiːmeɪl/", word: "email" }, { ipa: "/ˈmænɪdʒə/", word: "manager" }] } },
      { code: "speaking", content: { prompt: "Nói về lịch họp hàng tuần.", sample: "Our team has a meeting every Monday." } }
    ] },
    progress: { status: "in_progress", completedPartCodes, evidence: { pronunciation: heard, speaking } }
  } as any;
}

function renderLesson(value: any, extra: Record<string, unknown> = {}) {
  const actions = { navigate: vi.fn(), saveLessonProgress: vi.fn(), completeLessonStudy: vi.fn(), speak: vi.fn(), uploadAssessmentAudio: vi.fn(), ...extra } as any;
  const view = render(<LearnerLesson view={{ lesson: value, lock: null }} actions={actions} />);
  return { ...view, actions };
}

const speakingPart = () => document.querySelector('[data-part="speaking"]') as HTMLElement;
const statusLines = () => Array.from(speakingPart().querySelectorAll(".lesson-answer > .banner")).map((node) => [node.className.replace("banner ", ""), node.textContent]);

describe("Speaking AI grading states", () => {
  it("shows the single waiting line while the AI grade is pending and refreshes until it arrives", async () => {
    const user = userEvent.setup();
    const refreshLesson = vi.fn().mockResolvedValue(undefined);
    const pending = lesson({ attempts: 1, status: "submitted", aiGrading: "pending", artifactKey: "assessment-audio/a.webm", feedback: "Đã nhận file ghi âm." }, true);
    const { rerender, actions } = renderLesson(pending, { refreshLesson });
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(statusLines()).toEqual([["info", "Đã nộp bản ghi âm · đang chờ chấm."]]);
    await waitFor(() => expect(refreshLesson).toHaveBeenCalled(), { timeout: 4_000 });

    const graded = lesson({
      attempts: 1, status: "wrong_retry", score: 50, artifactKey: "assessment-audio/a.webm",
      answer: "Our team has a mitting every Monday.", feedback: "Bạn nói đúng yêu cầu. Hãy đọc rõ âm /m/ trong meeting."
    });
    rerender(<LearnerLesson view={{ lesson: graded, lock: null }} actions={actions} />);
    await waitFor(() => expect(statusLines()).toEqual([["warn", "Bạn nói đúng yêu cầu. Hãy đọc rõ âm /m/ trong meeting."]]));
    expect(speakingPart()).toHaveTextContent("Our team has a mitting every Monday.");
    // The graded recording is used: the learner records a new one before checking again.
    expect(screen.getByRole("button", { name: "Kiểm tra nói" })).toBeDisabled();
    expect(speakingPart()).not.toHaveTextContent("Đã tải file ghi âm lên");
  }, 10_000);

  it("shows a pass as the part's single ok line and does not poll", async () => {
    const user = userEvent.setup();
    const refreshLesson = vi.fn().mockResolvedValue(undefined);
    renderLesson(lesson({ attempts: 1, status: "correct", score: 100, artifactKey: "assessment-audio/a.webm", feedback: "Bạn đọc rõ từ meeting." }, true), { refreshLesson });
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(statusLines()).toEqual([["ok", "Bạn đọc rõ từ meeting."]]);
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    expect(refreshLesson).not.toHaveBeenCalled();
  }, 10_000);

  it("keeps the waiting line, without polling, when the recording went to the operator", async () => {
    const user = userEvent.setup();
    const refreshLesson = vi.fn().mockResolvedValue(undefined);
    renderLesson(lesson({ attempts: 1, status: "submitted", aiGrading: "operator", artifactKey: "assessment-audio/a.webm" }, true), { refreshLesson });
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(statusLines()).toEqual([["info", "Đã nộp bản ghi âm · đang chờ chấm."]]);
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    expect(refreshLesson).not.toHaveBeenCalled();
  }, 10_000);

  it("asks for a new recording after an unclear one, as a retry line", async () => {
    const user = userEvent.setup();
    renderLesson(lesson({ attempts: 0, status: "wrong_retry", artifactKey: "assessment-audio/a.webm", feedback: "Bản ghi chưa nghe rõ hoặc quá ngắn. Hãy ghi âm lại, nói to và rõ hơn." }));
    await user.click(screen.getByRole("tab", { name: /2\. bài tập/i }));
    expect(statusLines()).toEqual([["warn", "Bản ghi chưa nghe rõ hoặc quá ngắn. Hãy ghi âm lại, nói to và rõ hơn."]]);
    expect(screen.getByRole("button", { name: "Kiểm tra nói" })).toBeDisabled();
  });
});
