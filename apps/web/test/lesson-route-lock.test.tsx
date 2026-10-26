// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonView } from "@e4s/contracts";
import { LearnerController } from "../src/app/learner/Router.js";
import type { LearnerCallbacks } from "../src/app/learner/contracts.js";

afterEach(cleanup);

const callbacks = {
  navigate: vi.fn(), saveProfileDraft: vi.fn(), saveProfile: vi.fn(), startAssessment: vi.fn(), saveAssessmentResponse: vi.fn(),
  completeAssessmentSection: vi.fn(), submitAssessment: vi.fn(), uploadAssessmentAudio: vi.fn(), recordAssessmentAudioPlay: vi.fn(),
  createAssessmentAppeal: vi.fn(), saveLessonProgress: vi.fn(), submitMicroAnswer: vi.fn(), completeMicroLesson: vi.fn(),
  regenerateMicroLesson: vi.fn(), sendCoachMessage: vi.fn(), changeCoachPersona: vi.fn(), startNewCoachChat: vi.fn(),
  sendChallengeMessage: vi.fn(), submitWeeklyPractice: vi.fn(), submitSurvey: vi.fn(), saveAvatar: vi.fn(), printReward: vi.fn(),
  speak: vi.fn(), generateGameSet: vi.fn(), useWeeklyGameSet: vi.fn(), deleteGameSet: vi.fn(), finishGame: vi.fn(), resetGameResult: vi.fn(),
  resolveGameWordImage: vi.fn(), createDuel: vi.fn()
} as unknown as LearnerCallbacks;

const lesson: LessonView = {
  id: "00000000-0000-4000-8000-000000000602",
  title: "Past simple: I joined…",
  dayNumber: 2,
  weekNumber: 1,
  weekTopic: "Introducing yourself & your job",
  durationMinutes: 10,
  cefr: "A2",
  content: { parts: [{ code: "objective", title: "Mục tiêu", content: { text: "Mục tiêu" } }] },
  progress: { status: "not_started", completedPartCodes: [], evidence: {} },
  lock: {
    reason: "prior",
    message: "Bạn chưa hoàn thành T2 · I work in… as… (bài 1/5).",
    dayNumber: 2,
    totalLessons: 5,
    blocker: { id: "00000000-0000-4000-8000-000000000601", dayNumber: 1, title: "I work in… as…" }
  }
};

describe("learner lesson route lock binding", () => {
  it("renders the server-provided lock instead of exposing future lesson content", () => {
    render(<LearnerController path={`/lesson/${lesson.id}`} contracts={{ lesson }} callbacks={callbacks} />);

    expect(screen.getByRole("heading", { name: /học bù bài trước đã nhé/i })).toBeInTheDocument();
    expect(screen.getByText(/bạn chưa hoàn thành/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: lesson.title })).not.toBeInTheDocument();
  });

  it("renders the schedule date lock with the recoverable coach/home actions", () => {
    const { rerender } = render(<LearnerController path={`/lesson/${lesson.id}`} contracts={{ lesson }} callbacks={callbacks} />);
    rerender(<LearnerController path={`/lesson/${lesson.id}`} contracts={{ lesson: {
      ...lesson,
      lock: {
        reason: "date",
        message: "Bạn đã xong các bài trước; hôm nay có thể luyện thêm với Season.",
        dayNumber: 2,
        totalLessons: 5,
        opensAt: "2026-10-17"
      }
    } }} callbacks={callbacks} />);

    expect(screen.getByRole("heading", { name: /bài này mở vào/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /luyện với season/i })).toHaveAttribute("href", "/coach");
    expect(screen.getByRole("link", { name: /về trang chủ/i })).toHaveAttribute("href", "/home");
  });
});
