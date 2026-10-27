// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LEARNER_ROUTES,
  LearnerController,
  LearnerRouter,
  type LearnerCallbacks,
  type LearnerScreen
} from "../src/app/learner/index.js";

afterEach(cleanup);

const callbacks = (): LearnerCallbacks => ({
  navigate: vi.fn(),
  saveProfileDraft: vi.fn(),
  saveProfile: vi.fn(),
  startAssessment: vi.fn(),
  saveAssessmentResponse: vi.fn(),
  completeAssessmentSection: vi.fn(),
  submitAssessment: vi.fn(),
  uploadAssessmentAudio: vi.fn(async () => "artifact/audio"),
  recordAssessmentAudioPlay: vi.fn(async () => ({ playCount: 1, remaining: 1 })),
  createAssessmentAppeal: vi.fn(),
  completeLessonStudy: vi.fn(),
  saveLessonProgress: vi.fn(),
  submitMicroAnswer: vi.fn(),
  completeMicroLesson: vi.fn(),
  regenerateMicroLesson: vi.fn(),
  sendCoachMessage: vi.fn(),
  changeCoachPersona: vi.fn(),
  startNewCoachChat: vi.fn(),
  sendChallengeMessage: vi.fn(),
  submitWeeklyPractice: vi.fn(),
  submitSurvey: vi.fn(),
  saveAvatar: vi.fn(),
  printReward: vi.fn(),
  speak: vi.fn(),
  generateGameSet: vi.fn(),
  useWeeklyGameSet: vi.fn(),
  deleteGameSet: vi.fn(),
  finishGame: vi.fn(),
  resetGameResult: vi.fn(),
  resolveGameWordImage: vi.fn(async () => ({ status: "unavailable" as const })),
  createDuel: vi.fn()
});

describe("new learner app frontend", () => {
  it("owns every learner route from the binding route matrix", () => {
    expect(LEARNER_ROUTES).toEqual([
      "/home", "/onboard", "/test/:kind", "/lesson/:id", "/micro/:id",
      "/coach", "/challenge", "/practice", "/survey", "/profile",
      "/reward/:mode", "/games", "/games/:game", "/arena", "/duel/:id"
    ]);
  });

  it("renders the app home block order from contract data", () => {
    const screenView: LearnerScreen = {
      kind: "home",
      view: {
        onboardingRequired: false,
        learner: { displayName: "Lan", cefr: "A2" },
        program: { name: "English for Every Season", weekCount: 2 },
        week: { id: "w1", weekNumber: 1, topic: "Giới thiệu trong công việc", description: "", objectives: [] },
        lessons: [{ id: "l1", dayNumber: 1, title: "Nice to meet you", status: "not_started" }],
        nextLesson: { id: "l1", dayNumber: 1, title: "Nice to meet you", status: "not_started" },
        metrics: { completedLessons: 0, totalLessons: 5, studyDays: 0, streakDays: 0, points: 0 },
        schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [{ label: "T2", date: "2026-10-12", status: "today" }] },
        coach: { turnsThisWeek: 0, targetTurns: 2, href: "/coach" },
        practice: { status: "locked", detail: "Mở khi hoàn thành đủ 5 bài.", href: "/practice" },
        levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: false, criteria: [] },
        microLesson: { id: "m1", topic: "Email ngắn", durationMinutes: 5, completed: false },
        reward: { points: 0, nextPoints: 60, seasonName: "Mùa xuân – gieo hạt" }
      }
    };
    const { container } = render(<LearnerRouter screen={screenView} callbacks={callbacks()} />);
    expect(Array.from(container.querySelectorAll("[data-home-block]")).map((node) => node.getAttribute("data-home-block"))).toEqual([
      "context", "primary", "metrics", "week-path", "attendance", "activities", "readiness", "micro", "reward"
    ]);
    expect(screen.getByRole("heading", { name: "Chào Lan!" })).toBeInTheDocument();
    expect(screen.getByText("Hôm nay học gì nào?")).toBeInTheDocument();
    const primary = container.querySelector('[data-home-block="primary"]');
    expect(within(primary as HTMLElement).getByRole("link", { name: "Học ngay" })).toHaveAttribute("href", "/lesson/l1");
    const metrics = container.querySelector('[data-home-block="metrics"]');
    expect(metrics).toHaveClass("stats");
    expect(metrics?.querySelectorAll(".ring")).toHaveLength(4);
    expect(within(metrics as HTMLElement).getByText("Bài tuần này")).toBeInTheDocument();
    expect(within(metrics as HTMLElement).getByText("Ngày học (T2–T6)")).toBeInTheDocument();
    expect(within(metrics as HTMLElement).getByText("Ngày liên tiếp")).toBeInTheDocument();
    expect(container.querySelector("main")).toBeNull();
  });

  it("adapts an existing home contract directly without inventing route data", () => {
    const { container } = render(<LearnerController path="#/home" contracts={{ home: {
      onboardingRequired: true,
      learner: { displayName: "Lan", cefr: null },
      program: null, week: null, lessons: [], nextLesson: null,
      metrics: { completedLessons: 0, totalLessons: 0, studyDays: 0, streakDays: 0, points: 0 },
      schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [] },
      coach: { turnsThisWeek: 0, targetTurns: 2, href: "/coach" },
      practice: { status: "locked", detail: "Chưa mở", href: "/practice" },
      levelReadiness: { targetLevel: null, windowDays: 14, eligible: false, examAvailable: false, criteria: [] },
    } }} callbacks={callbacks()} />);
    expect(screen.getByRole("heading", { name: "3 bước để bắt đầu học" })).toBeInTheDocument();
    expect(container.querySelector("main")).toBeNull();
  });

  it("keeps the six exact app game identities and routes", () => {
    render(<LearnerRouter screen={{
      kind: "games",
      view: {
        cefr: "B1",
        aiAvailable: true,
        wordSet: { id: "set-1", topic: "Meetings", cefr: "B1", source: "custom", words: [
          { id: "colleague", english: "colleague", vietnamese: "đồng nghiệp", definition: "a co-worker", partOfSpeech: "noun" },
          { id: "schedule", english: "schedule", vietnamese: "lịch trình", definition: "a plan of times", partOfSpeech: "noun" },
          { id: "coordinate", english: "coordinate", vietnamese: "phối hợp", definition: "organize together", partOfSpeech: "verb" },
          { id: "communicate", english: "communicate", vietnamese: "giao tiếp", definition: "share information", partOfSpeech: "verb" }
        ] },
        games: [],
        arena: { eligible: true, requiredLevel: "B1", points: 50, pendingDuels: 0 }
      }
    }} callbacks={callbacks()} />);
    expect(screen.getAllByRole("link", { name: /chơi/i }).map((link) => link.getAttribute("href"))).toEqual([
      "/games/scramble", "/games/crossword", "/games/eggs", "/games/mario", "/games/sort", "/games/typing"
    ]);
    expect(screen.getByText("Season catch")).toBeInTheDocument();
    expect(screen.getByText("Season-rio")).toBeInTheDocument();
  });

  it("routes every visible game-set control through supplied callbacks", async () => {
    const user = userEvent.setup();
    const actions = callbacks();
    render(<LearnerRouter screen={{
      kind: "games",
      view: {
        cefr: "B1", aiAvailable: true,
        wordSet: { id: "set-1", topic: "Meetings", cefr: "B1", source: "custom", words: [] },
        games: [], arena: { eligible: true, requiredLevel: "B1", points: 0, pendingDuels: 0 }
      }
    }} callbacks={actions} />);
    await user.type(screen.getByLabelText("Chủ đề bộ từ"), "coffee shop");
    await user.click(screen.getByRole("button", { name: "Tạo bộ từ" }));
    await user.click(screen.getByRole("button", { name: "Dùng từ vựng tuần này" }));
    await user.click(screen.getByRole("button", { name: "Xoá bộ này" }));
    expect(actions.generateGameSet).toHaveBeenCalledWith("coffee shop");
    expect(actions.useWeeklyGameSet).toHaveBeenCalledOnce();
    expect(actions.deleteGameSet).toHaveBeenCalledOnce();
  });

  it("preserves assessment preparation copy and delegates start", () => {
    const actions = callbacks();
    render(<LearnerRouter screen={{ kind: "assessment", view: {
      definition: {
        key: "placement-v1", kind: "placement", title: "Test đầu vào", version: 1,
        totalMinutes: 60, totalScore: 100,
        sections: [
          { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 25, instructions: ["Nghe tối đa 2 lần"], groups: [] },
          { code: "reading", title: "Đọc", durationMinutes: 15, maxScore: 25, instructions: ["Đọc và chọn đáp án"], groups: [] },
          { code: "writing", title: "Viết", durationMinutes: 15, maxScore: 25, instructions: ["Viết theo đề bài"], groups: [] },
          { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 25, instructions: ["Ghi âm câu trả lời"], groups: [] }
        ]
      },
      screenState: "preparation", attempt: null, timed: true, warningLimit: 3, targetLevel: null
    } }} callbacks={actions} />);
    expect(screen.getByText("Quy định làm bài – đọc trước khi bắt đầu")).toBeInTheDocument();
    expect(screen.getByText(/Nghe → Đọc → Viết → Nói/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu phần Nghe" }));
    fireEvent.click(screen.getByRole("button", { name: "Tôi đã sẵn sàng, bắt đầu" }));
    expect(actions.startAssessment).toHaveBeenCalledOnce();
  });
});
