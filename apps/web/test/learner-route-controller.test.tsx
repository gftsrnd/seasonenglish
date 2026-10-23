// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameHubView, LearnerHomeView, LearnerProfileView, LearnerProgressView, MicroLessonView } from "@e4s/contracts";

const api = vi.hoisted(() => ({
  getHome: vi.fn(),
  getProfile: vi.fn(),
  getProgress: vi.fn(),
  saveProfile: vi.fn(),
  getMicroLesson: vi.fn(),
  generateMicroLesson: vi.fn(),
  getGames: vi.fn(),
  useWeeklyGameWordSet: vi.fn(),
  deleteGameWordSet: vi.fn()
}));

vi.mock("../src/api/learner.js", () => ({ learnerApiClient: api }));

import { LearnerRouteController, printLearnerReward, resolveLearnerRoute } from "../src/app/learner/LearnerRouteController.js";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("learner route integration controller", () => {
  it("does not resolve the retired final assessment route", () => {
    expect(resolveLearnerRoute("/test/final")).toEqual({ name: "notFound", params: {} });
  });

  it.each([
    ["/home", { name: "home", params: {} }],
    ["/test/level-up", { name: "assessment", params: { kind: "levelup" } }],
    ["/lesson/lesson%201", { name: "lesson", params: { id: "lesson 1" } }],
    ["/micro/m-1", { name: "micro", params: { id: "m-1" } }],
    ["/games/scramble", { name: "game", params: { game: "scramble" } }],
    ["/reward/done", { name: "reward", params: { mode: "done" } }],
    ["/duel/d-1", { name: "duel", params: { id: "d-1" } }]
  ] as const)("resolves %s without asking App to map params", (path, expected) => {
    expect(resolveLearnerRoute(path)).toEqual(expected);
  });

  it("loads the real home contract for the current React Router location", async () => {
    api.getHome.mockResolvedValue(homeView);
    render(<MemoryRouter initialEntries={["/home"]}><LearnerRouteController /></MemoryRouter>);
    expect(screen.getByText("Đang tải trang chủ…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Chào Lan!" })).toBeInTheDocument();
    expect(api.getHome).toHaveBeenCalledOnce();
  });

  it("keeps an incomplete profile in the new onboarding flow", async () => {
    api.getProfile.mockResolvedValue(incompleteProfile);
    render(<MemoryRouter initialEntries={["/onboard"]}><LearnerRouteController /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Cho Season biết về bạn nhé" })).toBeInTheDocument();
    expect(screen.getByText("Hồ sơ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu nháp" })).toBeInTheDocument();
  });

  it("routes the learner delete action to the delete API instead of the weekly-set action", async () => {
    const user = userEvent.setup();
    api.getGames.mockResolvedValue(gameHubView);
    api.deleteGameWordSet.mockResolvedValue({ ...gameHubView, wordSet: { ...gameHubView.wordSet, source: "weekly", topic: "Tuần 1" } });

    render(<MemoryRouter initialEntries={["/games"]}><LearnerRouteController /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Xoá bộ này" }));

    await waitFor(() => expect(api.deleteGameWordSet).toHaveBeenCalledOnce());
    expect(api.useWeeklyGameWordSet).not.toHaveBeenCalled();
  });

  it("shows the missing-profile state when progress loads for an incomplete profile", async () => {
    api.getProfile.mockResolvedValue(incompleteProfile);
    api.getProgress.mockResolvedValue(incompleteProgress);
    render(<MemoryRouter initialEntries={["/profile"]}><LearnerRouteController /></MemoryRouter>);

    expect(await screen.findByText("Bạn chưa hoàn thành hồ sơ cá nhân.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Điền hồ sơ" })).toHaveAttribute("href", "/onboard");
  });

  it("saves an edited profile with the fetched server version", async () => {
    const user = userEvent.setup();
    const profile: LearnerProfileView = {
      profile: {
        fullName: "Lan", email: "lan@example.com", goals: [], environmentUse: "weekly", familyUse: "sometimes",
        habits: [], learningStyles: [], explanationLanguage: "auto", persona: "informal", durationMinutes: 10,
        device: "both", selfLevel: "A2", certificates: []
      },
      completed: true, version: 7, updatedAt: "2026-10-14T00:00:00.000Z"
    };
    api.getProfile.mockResolvedValue(profile);
    api.saveProfile.mockResolvedValue({ ...profile, version: 8 });
    api.getHome.mockResolvedValue(homeView);
    render(<MemoryRouter initialEntries={["/onboard"]}><LearnerRouteController /></MemoryRouter>);
    await screen.findByRole("button", { name: "Lưu hồ sơ" });
    await user.click(within(screen.getByRole("group", { name: "Bạn dùng tiếng Anh ở công ty cho việc gì? *" })).getByRole("checkbox", { name: "Nói chuyện với khách hàng / đối tác" }));
    await user.click(within(screen.getByRole("group", { name: "Mức độ dùng tiếng Anh trong môi trường làm việc? *" })).getByRole("radio", { name: "Hằng ngày" }));
    await user.click(within(screen.getByRole("group", { name: "Mức độ sử dụng tiếng Anh trong gia đình bạn? *" })).getByRole("radio", { name: "Hằng ngày (người thân nói tiếng Anh)" }));
    await user.click(within(screen.getByRole("group", { name: "Thói quen dùng tiếng Anh ngoài công việc? *" })).getByRole("checkbox", { name: "Xem phim / video tiếng Anh" }));
    await user.click(within(screen.getByRole("group", { name: "Bạn học hiệu quả nhất khi… *" })).getByRole("checkbox", { name: "Đọc & ghi chú" }));
    await user.click(await screen.findByRole("button", { name: "Lưu hồ sơ" }));
    await waitFor(() => expect(api.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ fullName: "Lan", email: "lan@example.com" }), 7));
  });

  it("passes the explicit regenerate command through the app controller", async () => {
    const user = userEvent.setup();
    const micro: MicroLessonView = {
      id: "m-1", topic: "Meetings", cefr: "A2", durationMinutes: 5,
      regenerateAvailable: true,
      theory: "Use a clear question to ask for the next project deadline.", vocabulary: ["deadline", "clarify", "schedule"],
      practice: { prompt: "Choose the clear question.", type: "mcq", options: ["Could you clarify the deadline?", "Tell me now."] }
    };
    api.getMicroLesson.mockResolvedValue(micro);
    api.generateMicroLesson.mockResolvedValue({ ...micro, id: "m-2" });
    render(<MemoryRouter initialEntries={["/micro/m-1"]}><LearnerRouteController /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Tạo lại bài" }));

    await waitFor(() => expect(api.generateMicroLesson).toHaveBeenCalledWith(expect.any(String), true));
  });

  it("keeps the micro screen mounted and exposes the server error when regeneration is unavailable", async () => {
    const user = userEvent.setup();
    const micro: MicroLessonView = {
      id: "m-1", topic: "Meetings", cefr: "A2", durationMinutes: 5,
      regenerateAvailable: true,
      theory: "Use a clear question to ask for the next project deadline.", vocabulary: ["deadline", "clarify", "schedule"],
      practice: { prompt: "Choose the clear question.", type: "mcq", options: ["Could you clarify the deadline?", "Tell me now."] }
    };
    api.getMicroLesson.mockResolvedValue(micro);
    api.generateMicroLesson.mockRejectedValue(new Error("AI_UNAVAILABLE"));
    render(<MemoryRouter initialEntries={["/micro/m-1"]}><LearnerRouteController /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Tạo lại bài" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Season chưa kết nối AI");
    expect(screen.getByRole("heading", { name: "Meetings" })).toBeInTheDocument();
  });

  it("scopes the landscape certificate print rule to the print lifecycle", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    printLearnerReward();
    expect(document.getElementById("e4s-reward-print-style")?.textContent).toMatch(/A4 landscape/);
    window.dispatchEvent(new Event("afterprint"));
    expect(document.getElementById("e4s-reward-print-style")).toBeNull();
    print.mockRestore();
  });
});

const homeView: LearnerHomeView = {
  onboardingRequired: false,
  learner: { displayName: "Lan", cefr: "A2" },
  program: { name: "English for Every Season", weekCount: 2 },
  week: { id: "w1", weekNumber: 1, topic: "Meetings", description: "", objectives: [] },
  lessons: [], nextLesson: null,
  metrics: { completedLessons: 0, totalLessons: 0, studyDays: 0, streakDays: 0, points: 0 },
  schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [] },
  coach: { turnsThisWeek: 0, targetTurns: 2, href: "/coach" },
  practice: { status: "locked", detail: "Chưa mở", href: "/practice" },
  levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: false, criteria: [] },
};

const incompleteProfile: LearnerProfileView = {
  profile: {
    fullName: "",
    email: "",
    goals: [],
    environmentUse: "",
    familyUse: "",
    habits: [],
    learningStyles: [],
    explanationLanguage: "auto",
    persona: "informal",
    durationMinutes: 10,
    device: "both",
    selfLevel: "unknown",
    certificates: []
  },
  completed: false,
  version: 1,
  updatedAt: "2026-10-14T00:00:00.000Z"
};

const incompleteProgress: LearnerProgressView = {
  learner: { id: "learner-1", displayName: "Lan", cefr: null, profile: incompleteProfile.profile },
  points: 0,
  badges: [],
  weeks: [],
  studyDays: 0,
  activity: [],
  season: {
    current: { key: "spring", level: 1, name: "Mùa xuân – gieo hạt", pointsRequired: 0 },
    next: { key: "summer", level: 2, name: "Mùa hạ – đón nắng", pointsRequired: 60 },
    earnedBadgeCount: 0,
    requiredBadgeCount: 1
  },
  badgeRoadmap: [],
  levelReadiness: { targetLevel: null, windowDays: 14, eligible: false, examAvailable: false, criteria: [] },
  stats: { completedLessons: 0, coachTurns: 0, studyDays: 0 },
  assessments: { placement: null }
};

const gameHubView: GameHubView = {
  cefr: "A2",
  aiAvailable: false,
  wordSet: { id: "custom-set", topic: "Meetings", cefr: "A2", source: "custom", words: [{ id: "word-1", english: "agenda", vietnamese: "chương trình", definition: "a list of items", partOfSpeech: "noun" }] },
  games: [],
  arena: { eligible: false, requiredLevel: "B1", points: 0, pendingDuels: 0 }
};
