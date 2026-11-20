// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerHome, LearnerCoach, LearnerChallenge } from "../src/app/learner/index.js";
import type { LearnerCallbacks } from "../src/app/learner/contracts.js";

afterEach(cleanup);

const actions = (): LearnerCallbacks => ({
  navigate: vi.fn(), saveProfileDraft: vi.fn(), saveProfile: vi.fn(), startAssessment: vi.fn(),
  saveAssessmentResponse: vi.fn(), completeAssessmentSection: vi.fn(), submitAssessment: vi.fn(),
  uploadAssessmentAudio: vi.fn(async () => "artifact"), recordAssessmentAudioPlay: vi.fn(async () => ({ playCount: 1, remaining: 1 })),
  createAssessmentAppeal: vi.fn(), completeLessonStudy: vi.fn(), saveLessonProgress: vi.fn(), submitMicroAnswer: vi.fn(), completeMicroLesson: vi.fn(),
  regenerateMicroLesson: vi.fn(), sendCoachMessage: vi.fn(), changeCoachPersona: vi.fn(), startNewCoachChat: vi.fn(),
  sendChallengeMessage: vi.fn(), submitSurvey: vi.fn(), saveAvatar: vi.fn(), printReward: vi.fn(),
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
  levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: true, examAvailable: true, criteria: [] },
  pilotPhase: "in_pilot", levelUpPhase: "requested", monthlyGoal: "Speak clearly", rewardAnnouncement: { kind: "new-level-announcement", points: 20, nextPoints: 60, seasonName: "Mùa thu" }
} as any;

describe("learner lifecycle app states", () => {
  it("renders server-owned Home phase and reward announcement without React inference", () => {
    const callback = actions();
    const { container } = render(<LearnerHome view={{ ...home, rewardAnnouncement: { ...home.rewardAnnouncement, announcementId: "level-change-1", level: "B1", kind: "new-level-announcement" } }} actions={callback} />);
    expect(container).not.toHaveTextContent(/đang trong giai đoạn pilot/i);
    expect(container).toHaveTextContent(/thông tin hồ sơ của bạn/i);
    expect(container).toHaveTextContent(/hồ sơ và đánh giá đầu vào/i);
    expect(container).not.toHaveTextContent(/chặng 1/i);
  });

  it("shows the level-up celebration modal and persists its acknowledgement", async () => {
    const callback = actions();
    const user = userEvent.setup();
    render(<LearnerHome view={{ ...home, rewardAnnouncement: { ...home.rewardAnnouncement, announcementId: "level-change-1", level: "B1", kind: "new-level-announcement" } }} actions={callback} />);
    // The level-up notice is a compact shared popup named after the new level (no "Thông báo thật"/rule copy).
    const modal = screen.getByRole("dialog", { name: "Bạn đã lên mức B1" });
    expect(modal).not.toHaveTextContent(/thông báo thật|quy tắc công nhận/i);
    await user.click(within(modal).getByRole("button", { name: /tiếp tục học/i }));
    expect(callback.acknowledgeRewardAnnouncement).toHaveBeenCalledWith("level-change-1");
  });

  it("does not render the retired weekly path when a month framework is absent", async () => {
    const callback = actions();
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

    expect(screen.getAllByText(/lộ trình tháng đang được chuẩn bị/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/my department/i)).not.toBeInTheDocument();
    expect(callback.navigate).not.toHaveBeenCalled();
  });

  it("lets a learner request a locked Coach word to be opened", () => {
    const coach = {
      sessionId: "s", topic: "Meetings", cefr: "A2", persona: "informal", aiAvailable: true,
      daily: { used: 0, limit: 20 }, monthly: { label: "Tháng 2026-11", turns: 0, target: 100 }, messages: [],
      vocabulary: [{ word: "deadline", meaning: "hạn chót", opened: false }]
    } as any;
    const callback = actions();
    render(<LearnerCoach view={coach} actions={callback} />);
    expect(screen.getByLabelText("Từ bí mật 1 chưa mở")).toBeInTheDocument();
  });

  it("keeps multiple corrections for the same original phrase stable", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const coach = {
      sessionId: "s", topic: "Meetings", cefr: "A2", persona: "informal", aiAvailable: true,
      daily: { used: 1, limit: 20 }, monthly: { label: "Tháng 2026-11", turns: 1, target: 100 }, vocabulary: [],
      messages: [{ id: "m1", speaker: "coach", text: "Try again", feedback: {
        relevant: true, relevanceNote: "Relevant",
        evaluation: { status: "valid", result: "partially_correct", countsTowardGoal: true, noteVi: "Cần hoàn chỉnh ý." },
        seasonReply: "Try these complete sentences.", seasonReplyTranslation: "Hãy thử các câu hoàn chỉnh này.",
        nextQuestion: "What do you like about your job?", nextQuestionTranslation: "Bạn thích điều gì ở công việc?",
        rubric: {
          meaning: { score: 3, evidence: "Main idea is clear.", improvement: "Add an object." },
          vocabulary: { score: 2, evidence: "Basic vocabulary.", improvement: "Use work vocabulary." },
          grammar: { score: 2, evidence: "Sentence is incomplete.", improvement: "Complete each sentence." }
        },
        corrections: [
          { original: "I do not like", corrected: "I do not like my job.", translation: "Tôi không thích công việc của mình.", reason: "Complete the object." },
          { original: "I do not like", corrected: "I don't like it.", translation: "Tôi không thích nó.", reason: "Use a natural contraction." }
        ],
        correctedText: "", suggestedAnswer: { text: "", translation: "" }
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

});
