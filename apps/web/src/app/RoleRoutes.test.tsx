// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LearnerHomeView, RewardView, SessionView } from "@e4s/contracts";
import { recoverStaleRoleBundle, RoleRouteErrorBoundary, RoleRoutes } from "./RoleRoutes.js";
import { learnerApiClient as apiClient } from "../api/learner.js";
import { operatorApiClient } from "../api/operator.js";
import { shouldRedirectApprovedPlacement } from "./learner/LearnerRouteController.js";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

const learner: SessionView = {
  user: { id: "learner-1", displayName: "Học viên Demo", email: null },
  role: "learner",
  permissions: ["learning:own"]
};

const operator: SessionView = {
  user: { id: "operator-1", displayName: "Vận hành Demo", email: null },
  role: "operator",
  permissions: ["content:operate"]
};

const manager: SessionView = {
  user: { id: "manager-1", displayName: "Quản lý Demo", email: null },
  role: "manager",
  permissions: ["content:operate", "report:read"]
};

function renderRoute(pathname: string, session: SessionView) {
  return render(<MemoryRouter initialEntries={[pathname]}><RoleRoutes session={session} /></MemoryRouter>);
}

const unlockedHome: LearnerHomeView = {
  onboardingRequired: false,
  learner: { displayName: "Học viên Demo", cefr: "A2" },
  program: { name: "English for Every Season", weekCount: 2 },
  week: { id: "week-1", weekNumber: 1, topic: "Meetings", description: "", objectives: [] },
  lessons: [], nextLesson: null,
  metrics: { completedLessons: 0, totalLessons: 0, studyDays: 0, streakDays: 0, points: 0 },
  schedule: { daysPerWeek: 5, lessonMinutes: 10, days: [] },
  coach: { turnsThisWeek: 0, targetTurns: 2, href: "/coach" },
  practice: { status: "locked", detail: "Chưa mở", href: "/practice" },
  levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: false, criteria: [] },
};

describe("RoleRoutes authorization boundary", () => {
  it.each(["submitted", "pending_review", "approved"])("removes the placement result screen once status is %s", (status) => {
    expect(shouldRedirectApprovedPlacement("placement", status)).toBe(true);
  });

  it.each(["in_progress", "needs_retry"])("keeps an actionable placement route for status %s", (status) => {
    expect(shouldRedirectApprovedPlacement("placement", status)).toBe(false);
  });

  it("returns an active placement attempt from Home to the test route", async () => {
    vi.spyOn(apiClient, "getHome").mockResolvedValue({
      ...unlockedHome,
      learner: { ...unlockedHome.learner, cefr: null }
    });
    vi.spyOn(apiClient, "getAssessment").mockResolvedValue({ attempt: { status: "in_progress" } } as never);
    vi.spyOn(apiClient, "getProfile").mockResolvedValue({ completed: true, profile: {}, version: 1 } as never);

    render(<MemoryRouter initialEntries={["/home"]}><RoleRoutes session={learner} /><LocationProbe /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/test/placement"));
  });
  it("reloads once automatically when a stale role bundle cannot load", () => {
    const reload = vi.fn();
    const setItem = vi.fn();
    const storage = { getItem: vi.fn(() => null), setItem };

    expect(recoverStaleRoleBundle(new Error("Failed to fetch dynamically imported module"), storage, reload, 1_000)).toBe(true);
    expect(setItem).toHaveBeenCalledWith("e4s:role-bundle-reload-at", "1000");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows a clear error instead of looping or leaving a blank page after recovery already ran", () => {
    window.sessionStorage.setItem("e4s:role-bundle-reload-at", String(Date.now()));
    const BrokenRoute = () => { throw new Error("Failed to fetch dynamically imported module"); };
    render(<MemoryRouter><RoleRouteErrorBoundary><BrokenRoute /></RoleRouteErrorBoundary></MemoryRouter>);

    expect(screen.getByRole("alert")).toHaveTextContent("Không tải được giao diện");
    expect(screen.queryByRole("button", { name: "Tải lại trang" })).not.toBeInTheDocument();
  });
  it.each([
    ["/op/weeks", "Tài khoản này không có quyền mở khu vực vận hành."],
    ["/settings", "Tài khoản này không có quyền mở khu vực quản lý."],
    ["/mgr/report", "Tài khoản này không có quyền mở khu vực quản lý."]
  ])("shows an authorization fallback when a learner refreshes %s", (pathname, message) => {
    renderRoute(pathname, learner);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/home");
  });

  it.each(["/mgr/report", "/settings/private", "/reward/preview"])("shows an authorization fallback instead of silently redirecting Operator from %s", (pathname) => {
    renderRoute(pathname, operator);

    expect(screen.getByRole("alert")).toHaveTextContent("Tài khoản này không có quyền mở khu vực quản lý.");
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/op");
  });

  it("loads the learner reward preview instead of treating it as a Manager-only route", async () => {
    const reward: RewardView = {
      mode: "preview",
      learnerName: "Học viên Demo",
      cefr: "A2",
      cefrLabel: "A2 · Sơ cấp",
      points: 12,
      displayPoints: 60,
      season: { name: "Mùa hạ", description: "đón nắng" },
      simulated: true,
      earnedBadgeCount: 1,
      requiredBadgeCount: 8,
      printable: false,
      certificateNumber: "SE-PREVIEW",
      completedAt: "2026-10-15T09:00:00.000Z",
      organizationName: "GFT",
      operatorName: "Vận hành Demo",
      managerName: "Quản lý Demo",
      badges: []
    };
    vi.spyOn(apiClient, "getHome").mockResolvedValue(unlockedHome);
    const getReward = vi.spyOn(apiClient, "getReward").mockResolvedValue(reward);

    renderRoute("/reward/preview", learner);

    expect(await screen.findByRole("heading", { name: "Certificate of Completion" })).toBeInTheDocument();
    expect(getReward).toHaveBeenCalledWith("preview");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the learner reward preview accessible when the URL has a trailing slash", async () => {
    const reward: RewardView = {
      mode: "preview",
      learnerName: "Học viên Demo",
      cefr: "A2",
      cefrLabel: "A2 · Sơ cấp",
      points: 12,
      displayPoints: 60,
      season: { name: "Mùa hạ", description: "đón nắng" },
      simulated: true,
      earnedBadgeCount: 1,
      requiredBadgeCount: 8,
      printable: false,
      certificateNumber: "SE-PREVIEW",
      completedAt: "2026-10-15T09:00:00.000Z",
      organizationName: "GFT",
      operatorName: "Vận hành Demo",
      managerName: "Quản lý Demo",
      badges: []
    };
    vi.spyOn(apiClient, "getHome").mockResolvedValue(unlockedHome);
    vi.spyOn(apiClient, "getReward").mockResolvedValue(reward);

    renderRoute("/reward/preview/", learner);

    expect(await screen.findByRole("heading", { name: "Certificate of Completion" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("allows Operator to open the existing read-only Settings surface", () => {
    renderRoute("/settings", operator);

    expect(screen.getByRole("status")).toHaveTextContent("Đang tải cài đặt");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocks Operator from both legacy and direct Prompt settings routes", () => {
    const legacy = render(<MemoryRouter initialEntries={["/op/prompts"]}><RoleRoutes session={operator} /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Tài khoản này không có quyền mở cấu hình Prompt & rubric.");

    legacy.unmount();
    render(<MemoryRouter initialEntries={["/settings/prompts"]}><RoleRoutes session={operator} /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Tài khoản này không có quyền mở cấu hình Prompt & rubric.");
  });

  it("recognizes the new Operator Bài kiểm tra route", async () => {
    vi.spyOn(operatorApiClient, "getContentReview").mockResolvedValue({ tabs: [], submissions: [], coachSamples: [], microLessons: [], weeklyPractices: [], appeals: [], lessonAttempts: [], assessments: [] });
    vi.spyOn(operatorApiClient, "getSystemCapabilities").mockResolvedValue({ ai: true } as never);

    renderRoute("/op/tests", operator);

    expect(await screen.findByRole("heading", { name: "Bài kiểm tra" })).toBeInTheDocument();
    expect(screen.queryByText("Đường dẫn vận hành không tồn tại.")).not.toBeInTheDocument();
  });

  it("redirects Manager away from direct Operator routes", () => {
    renderRoute("/op/not-a-real-route", manager);

    expect(screen.getByRole("status")).toHaveTextContent("Đang tải hiệu suất vận hành");
    expect(screen.queryByText("Đường dẫn vận hành không tồn tại.")).not.toBeInTheDocument();
  });

  it("shows the existing not-found fallback for an unknown nested Manager route", () => {
    renderRoute("/mgr/not-a-real-route", manager);

    expect(screen.getByText("Không tìm thấy trang.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/mgr");
  });

  it("fails closed with feedback when the session carries an unknown runtime role", () => {
    const unknownRole = { ...operator, role: "auditor" } as unknown as SessionView;
    renderRoute("/settings", unknownRole);

    expect(screen.getByRole("alert")).toHaveTextContent("Vai trò tài khoản này không được hỗ trợ. Vui lòng quay lại trang bắt đầu.");
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
    expect(screen.queryByText("Đang tải cài đặt")).not.toBeInTheDocument();
  });
});

function LocationProbe() {
  return <output data-testid="current-path">{useLocation().pathname}</output>;
}
