// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerHome, LearnerCoach, LearnerChallenge, LearnerPractice } from "../src/app/learner/index.js";
import type { LearnerCallbacks } from "../src/app/learner/contracts.js";

afterEach(cleanup);

const actions = (): LearnerCallbacks => ({
  navigate: vi.fn(), saveProfileDraft: vi.fn(), saveProfile: vi.fn(), startAssessment: vi.fn(),
  saveAssessmentResponse: vi.fn(), completeAssessmentSection: vi.fn(), submitAssessment: vi.fn(),
  uploadAssessmentAudio: vi.fn(async () => "artifact"), recordAssessmentAudioPlay: vi.fn(async () => ({ playCount: 1, remaining: 1 })),
  createAssessmentAppeal: vi.fn(), completeLessonStudy: vi.fn(), saveLessonProgress: vi.fn(), submitMicroAnswer: vi.fn(), completeMicroLesson: vi.fn(),
  regenerateMicroLesson: vi.fn(), sendCoachMessage: vi.fn(), changeCoachPersona: vi.fn(), startNewCoachChat: vi.fn(),
  sendChallengeMessage: vi.fn(), submitWeeklyPractice: vi.fn(), submitSurvey: vi.fn(), saveAvatar: vi.fn(), printReward: vi.fn(),
  acknowledgeRewardAnnouncement: vi.fn(),
  speak: vi.fn(), generateGameSet: vi.fn(), useWeeklyGameSet: vi.fn(), deleteGameSet: vi.fn(), finishGame: vi.fn(),
  resetGameResult: vi.fn(), resolveGameWordImage: vi.fn(async () => ({ status: "unavailable" as const })), createDuel: vi.fn()
});

const home = {
  onboardingRequired: false,
  learner: { displayName: "Lan", cefr: "A2" }, program: { name: "E4S", weekCount: 2 },
  week: { id: "w1", weekNumber: 1, topic: "Meetings", description: "", objectives: [] },
  lessons: [], nextLesson: null, metrics: { completedLessons: 5, totalLessons: 5, studyDays: 5, streakDays: 3, points: 20 },
  schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [] }, coach: { turnsThisWeek: 1, targetTurns: 2, href: "/coach" },
  practice: { status: "reviewed", detail: "Đã chấm", href: "/practice" },
  levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: true, examAvailable: true, criteria: [] },
  pilotPhase: "in_pilot", levelUpPhase: "requested", monthlyGoal: "Speak clearly", rewardAnnouncement: { kind: "new-level-announcement", points: 20, nextPoints: 60, seasonName: "Mùa thu" }
} as any;

describe("learner lifecycle app states", () => {
  it("renders server-owned Home phase and reward announcement without React inference", () => {
    const callback = actions();
    const { container } = render(<LearnerHome view={{ ...home, rewardAnnouncement: { ...home.rewardAnnouncement, announcementId: "level-change-1", level: "B1", kind: "new-level-announcement" } }} actions={callback} />);
    expect(container).toHaveTextContent(/đang trong giai đoạn pilot/i);
    expect(container).toHaveTextContent(/yêu cầu lên mức đang chờ duyệt/i);
    expect(container).toHaveTextContent(/mục tiêu tháng.*speak clearly/i);
    expect(container).toHaveTextContent(/mức mới/i);
  });

  it("shows the level-up celebration modal and persists its acknowledgement", async () => {
    const callback = actions();
    const user = userEvent.setup();
    render(<LearnerHome view={{ ...home, rewardAnnouncement: { ...home.rewardAnnouncement, announcementId: "level-change-1", level: "B1", kind: "new-level-announcement" } }} actions={callback} />);
    const modal = screen.getByTestId("modal.level-up-celebration");
    expect(modal).toHaveTextContent(/thông báo thật/i);
    expect(modal).toHaveTextContent(/mùa thu/i);
    expect(modal).toHaveTextContent(/b1/i);
    expect(modal).toHaveTextContent(/quy tắc|duyệt/i);
    await user.click(within(modal).getByRole("button", { name: /tiếp tục học/i }));
    expect(callback.acknowledgeRewardAnnouncement).toHaveBeenCalledWith("level-change-1");
  });

  it("renders server-owned lesson locks in the week path and blocks deep-link navigation", async () => {
    const callback = actions();
    const user = userEvent.setup();
    render(<LearnerHome view={{
      ...home,
      lessons: [
        { id: "l1", dayNumber: 1, title: "I work in…", status: "completed", lock: null },
        { id: "l2", dayNumber: 2, title: "I am from + place", status: "not_started", lock: null },
        {
          id: "l3", dayNumber: 3, title: "My department", status: "not_started",
          lock: {
            reason: "prior",
            message: "Bạn chưa hoàn thành T3 · I am from + place (bài 2/5).",
            dayNumber: 3,
            totalLessons: 5,
            blocker: { id: "l2", dayNumber: 2, title: "I am from + place" }
          }
        }
      ],
      nextLesson: { id: "l2", dayNumber: 2, title: "I am from + place", status: "not_started", lock: null }
    }} actions={callback} />);

    const locked = screen.getByRole("link", { name: /t4 · my department.*chưa mở/i });
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(locked).toHaveAttribute("title", "My department – mở sau khi xong bài trước");
    expect(locked.querySelector("svg.lucide-lock-keyhole")).toBeInTheDocument();
    expect(locked).not.toHaveTextContent("🔒");
    expect(within(locked).queryByText(/xong t3 trước/i)).not.toBeInTheDocument();

    await user.click(locked);
    expect(callback.navigate).not.toHaveBeenCalledWith("/lesson/l3");
  });

  it("lets a learner request a locked Coach word to be opened", () => {
    const coach = {
      sessionId: "s", topic: "Meetings", cefr: "A2", persona: "informal", aiAvailable: true,
      daily: { used: 0, limit: 20 }, weekly: { turns: 0, target: 2 }, messages: [],
      vocabulary: [{ word: "deadline", meaning: "hạn chót", opened: false }]
    } as any;
    const callback = actions();
    render(<LearnerCoach view={coach} actions={callback} />);
    expect(screen.getByRole("button", { name: "Mở từ bí mật 1" })).toBeEnabled();
  });

  it("keeps multiple corrections for the same original phrase stable", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const coach = {
      sessionId: "s", topic: "Meetings", cefr: "A2", persona: "informal", aiAvailable: true,
      daily: { used: 1, limit: 20 }, weekly: { turns: 1, target: 2 }, vocabulary: [],
      messages: [{ id: "m1", speaker: "coach", text: "Try again", feedback: {
        relevant: true, relevanceNote: "Relevant", rubric: { meaning: 3, vocabulary: 2, grammar: 2 },
        suggestions: [
          { original: "I do not like", corrected: "I do not like my job.", explanation: "Complete the object." },
          { original: "I do not like", corrected: "I don't like it.", explanation: "Use a natural contraction." }
        ]
      }}]
    } as any;
    render(<LearnerCoach view={coach} actions={actions()} />);
    expect(screen.getByText("I do not like my job.")).toBeInTheDocument();
    expect(screen.getByText("I don't like it.")).toBeInTheDocument();
    expect(consoleError.mock.calls.some((call) => call.some((value) => String(value).includes("same key")))).toBe(false);
    consoleError.mockRestore();
  });

  it("shows challenge pass request and failure retake states from the contract", () => {
    const pass = {
      sessionId: "s", assessmentAttemptId: "a", targetLevel: "B1", aiAvailable: true,
      daily: { used: 6, limit: 20 }, progress: { completedTurns: 6, requiredTurns: 6, average: 4, offTopic: 0, complete: true, passed: true },
      messages: [], phase: "complete", result: { passed: true }, request: { status: "pending" }
    } as any;
    const { rerender } = render(<LearnerChallenge view={pass} actions={actions()} />);
    expect(screen.getByText(/yêu cầu lên mức đã được gửi/i)).toBeInTheDocument();
    const fail = { ...pass, progress: { ...pass.progress, average: 2.4, passed: false }, result: { passed: false }, request: null, retakePlan: { status: "available" } };
    rerender(<LearnerChallenge view={fail} actions={actions()} />);
    expect(screen.getByText(/kế hoạch luyện lại/i)).toBeInTheDocument();
  });

  it("renders practice appeal action and pending/decided hidden states", () => {
    const base = {
      state: "reviewed", weekId: "w", weekNumber: 1, topic: "Meetings", completedLessons: 5, totalLessons: 5,
      task: "Write", guidance: "Eight words", submission: { id: "sub", status: "reviewed", text: "text", submittedAt: null,
        score: { total: 70 }, feedback: "Feedback", suggestions: [], correctedText: "" }, appeal: null
    } as any;
    const callback = actions();
    const { rerender } = render(<LearnerPractice view={base} actions={callback} />);
    expect(screen.getByRole("button", { name: /gửi kháng nghị/i })).toBeInTheDocument();
    rerender(<LearnerPractice view={{ ...base, appeal: { status: "pending", reason: "reason" } }} actions={callback} />);
    expect(screen.getByText(/kháng nghị.*pending/i)).toBeInTheDocument();
    rerender(<LearnerPractice view={{ ...base, appeal: { status: "accepted", reason: "reason", resolution: "Đã chấp nhận" } }} actions={callback} />);
    expect(screen.getByText(/đã chấp nhận/i)).toBeInTheDocument();
  });
});
