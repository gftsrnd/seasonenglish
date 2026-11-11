// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  currentSession: vi.fn(),
  learnerLogin: vi.fn(),
  staffLogin: vi.fn(),
  registerLearner: vi.fn(),
  startLearnerPinReset: vi.fn(),
  verifyLearnerPinReset: vi.fn(),
  completeLearnerPinReset: vi.fn(),
  getProductPreferences: vi.fn(),
  getOrganisationExperience: vi.fn(),
  getPublicOrganisationTheme: vi.fn(),
  getProfile: vi.fn(),
  logout: vi.fn()
}));

const learnerClient = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getProgress: vi.fn(),
  getAssessment: vi.fn(),
  saveProfile: vi.fn(),
  getLearnerComplaints: vi.fn(),
  getLearnerAppeals: vi.fn(),
  getAppealableAssessments: vi.fn(),
  createAssessmentAppeal: vi.fn(),
  getCourseCompletion: vi.fn(),
  submitLearnerComplaint: vi.fn()
}));

const managerClient = vi.hoisted(() => ({
  getManagerSettings: vi.fn()
}));

vi.mock("../api/shared.js", () => ({ sharedApiClient: client }));
vi.mock("../api/learner.js", () => ({ learnerApiClient: learnerClient }));
vi.mock("../api/manager.js", () => ({ managerApiClient: managerClient }));

import { App, resolveSessionEntryPath } from "./App.js";
import { themePatternUrls, useTheme } from "./shared/ThemeProvider.js";
import { useExperience } from "../features/experience/Experience.js";
import { resolveAutomaticTheme } from "../features/experience/useAutomaticTheme.js";

const learnerSession = {
  user: { id: "learner-1", displayName: "Nguyễn Minh Anh", email: "learner@example.test" },
  role: "learner" as const,
  permissions: ["learning:own" as const]
};

const managerSession = {
  user: { id: "manager-1", displayName: "Quản lý Demo", email: "manager@example.test" },
  role: "manager" as const,
  permissions: ["management:all" as const]
};

const operatorSession = {
  user: { id: "operator-1", displayName: "Vận hành Demo", email: "operator@example.test" },
  role: "operator" as const,
  permissions: ["content:operate" as const]
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/home");
  client.getPublicOrganisationTheme.mockResolvedValue({ theme: "winter" });
  client.currentSession.mockResolvedValue(learnerSession);
  client.getProductPreferences.mockResolvedValue({ theme: "summer", vocabImageSource: "wikimedia" });
  client.getOrganisationExperience.mockResolvedValue({ theme: "winter", backgroundMusic: { enabled: false, playlistId: "auto", customUrl: "", volume: 18 } });
  client.getProfile.mockResolvedValue({
    profile: { fullName: "Nguyễn Minh Anh", avatar: { color: "olive", acc: "leaf", bg: 0 } },
    version: 1
  });
  client.logout.mockRejectedValue(new Error("network unavailable"));
  learnerClient.getProfile.mockResolvedValue({
    profile: { fullName: "Nguyễn Minh Anh", avatar: { color: "olive", acc: "leaf", bg: 0 } },
    completed: true,
    version: 1
  });
  learnerClient.getLearnerComplaints.mockResolvedValue({ complaints: [] });
  learnerClient.getAssessment.mockResolvedValue({ attempt: { status: "approved" } });
  learnerClient.getProgress.mockResolvedValue({ learner: { id: "learner-1", displayName: "Nguyễn Minh Anh", cefr: "A2", profile: {} }, points: 0, badges: [], weeks: [] });
});

describe("App session shell", () => {
  it("shows only the locked-account screen for a disabled learner session", async () => {
    client.currentSession.mockResolvedValue({ ...learnerSession, accountStatus: "disabled" });
    client.logout.mockResolvedValue(undefined);
    render(<App>{() => <div>Normal learner routes</div>}</App>);
    expect(await screen.findByRole("heading", { name: "Tài khoản đang bị khóa" })).toBeInTheDocument();
    expect(screen.queryByText("Normal learner routes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  });

  it("lets a locked learner contact the manager from the lock screen", async () => {
    client.currentSession.mockResolvedValue({ ...learnerSession, accountStatus: "disabled" });
    learnerClient.getLearnerComplaints.mockResolvedValue({ complaints: [] });
    learnerClient.submitLearnerComplaint.mockResolvedValue({ complaint: { kind: "account_unlock", status: "pending" } });
    const user = userEvent.setup();
    render(<App />);
    const contact = await screen.findByRole("button", { name: "Liên hệ Quản lý" });
    await waitFor(() => expect(contact).toBeEnabled());
    await user.click(contact);
    await user.type(screen.getByRole("textbox", { name: "Lý do yêu cầu mở khóa" }), "Nhờ xem lại việc khóa tài khoản.");
    await user.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    expect(learnerClient.submitLearnerComplaint).toHaveBeenCalledWith("account_unlock", "Nhờ xem lại việc khóa tài khoản.");
    expect(await screen.findByText(/Bạn đã gửi yêu cầu mở khóa, Quản lý đang xem xét/)).toBeInTheDocument();
  });
  it("shows a certificate without exam grades for a completed learner account", async () => {
    client.currentSession.mockResolvedValue({ ...learnerSession, courseCompleted: true });
    window.history.replaceState({}, "", "/reward/course");
    learnerClient.getCourseCompletion.mockResolvedValue({
      certificateNumber: "E4S-C1-123", organizationName: "GFT Demo", issuerName: "Vận hành Demo", displayName: "Nguyễn Minh Anh", issuedAt: "2026-11-09T08:00:00Z",
      scores: [{ section: "listening", score: 20, maxScore: 20 }, { section: "reading", score: 40, maxScore: 40 }, { section: "writing", score: 18, maxScore: 20 }, { section: "speaking", score: 17, maxScore: 20 }], feedback: "Đạt C1."
    });
    render(<App />);
    expect(await screen.findByText("E4S-C1-123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "In / lưu PDF" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tiếp tục học" })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("img", { name: "GFT Demo" })).toBeVisible();
    expect(screen.getByText("Vận hành Demo")).toBeVisible();
    expect(screen.queryByText("95/100")).not.toBeInTheDocument();
    expect(screen.queryByText("Kết quả bài thi")).not.toBeInTheDocument();
    expect(screen.queryByText("Đạt C1.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Liên hệ Quản lý" })).not.toBeInTheDocument();
  });

  it("opens the old support link before placement and submits a historical assessment appeal", async () => {
    window.history.replaceState({}, "", "/profile#my-requests");
    learnerClient.getProfile.mockResolvedValue({ profile: {}, completed: false, version: 1 });
    learnerClient.getProgress.mockResolvedValue({ learner: { id: "learner-1", cefr: null } });
    learnerClient.getLearnerComplaints.mockResolvedValue({ complaints: [] });
    learnerClient.getLearnerAppeals.mockResolvedValue({ appeals: [] });
    learnerClient.getAppealableAssessments.mockResolvedValue({ results: [{ attemptId: "exam-1", title: "Bài thi đầu vào", availableUntil: null }] });
    learnerClient.createAssessmentAppeal.mockImplementation(async () => {
      learnerClient.getAppealableAssessments.mockResolvedValue({ results: [] });
      learnerClient.getLearnerAppeals.mockResolvedValue({ appeals: [{ id: "appeal-1", kind: "assessment", title: "Bài thi đầu vào", reason: "Nhờ kiểm tra lại điểm phần nghe.", status: "pending", createdAt: "2026-11-09T08:00:00Z" }] });
    });
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Hỗ trợ học tập" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/support");
    const sections = screen.getByRole("navigation", { name: "Các mục hỗ trợ học tập" });
    await user.click(within(sections).getByRole("link", { name: "Khiếu nại" }));
    await user.click(await screen.findByRole("button", { name: "Gửi khiếu nại" }));
    expect(screen.getByLabelText("Lý do khiếu nại")).toBeVisible();
    await user.click(within(sections).getByRole("link", { name: "Kháng nghị" }));
    await user.click(await screen.findByRole("button", { name: "Gửi kháng nghị" }));
    expect(within(sections).getByRole("link", { name: "Kháng nghị" })).toHaveAttribute("aria-current", "page");
    await user.type(screen.getByLabelText("Lý do kháng nghị"), "Nhờ kiểm tra lại điểm phần nghe.");
    await user.click(screen.getByRole("button", { name: "Gửi cho Vận hành" }));
    expect(learnerClient.createAssessmentAppeal).toHaveBeenCalledWith("exam-1", "Nhờ kiểm tra lại điểm phần nghe.");
    expect(await screen.findByText("Chờ xử lý")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về Tiến độ & hồ sơ" })).toHaveAttribute("href", "/profile");
  });

  it("maps every resolved season to a dedicated pattern asset", () => {
    expect(themePatternUrls).toEqual({
      spring: "/patterns/season-spring.png",
      summer: "/patterns/season-summer.png",
      autumn: "/patterns/season-autumn.png",
      winter: "/patterns/season-winter.png",
      tet: "/patterns/season-tet.png",
      midautumn: "/patterns/season-midautumn.png",
      christmas: "/patterns/season-christmas.png"
    });
  });

  it.each([
    ["learner", "/mgr", "/home"],
    ["learner", "/login", "/home"],
    ["operator", "/home", "/op"],
    ["operator", "/mgr/ops", "/op"],
    ["manager", "/home", "/mgr"],
    ["manager", "/profile", "/mgr"],
    ["learner", "/games/crossword", "/games/crossword"],
    ["learner", "/reward/preview", "/reward/preview"],
    ["operator", "/settings", "/settings"],
    ["manager", "/reward/preview", "/reward/preview"]
  ] as const)("normalizes a stale %s entry route from %s to %s", (role, pathname, expected) => {
    expect(resolveSessionEntryPath(role, pathname)).toBe(expected);
  });

  it("opens an existing session on that role's page during bootstrap", async () => {
    window.history.replaceState({}, "", "/");
    client.currentSession.mockResolvedValue(managerSession);
    render(<App>{() => <h1>Trang quản lý</h1>}</App>);

    expect(await screen.findByRole("heading", { name: "Trang quản lý" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/mgr");
  });

  it("refreshes the visible account when another tab changes the shared browser cookie", async () => {
    client.currentSession.mockResolvedValueOnce(learnerSession).mockResolvedValueOnce(managerSession);
    render(<App>{(active) => <h1>{active.role}</h1>}</App>);

    expect(await screen.findByRole("heading", { name: "learner" })).toBeInTheDocument();
    window.dispatchEvent(new StorageEvent("storage", { key: "e4s:auth:changed", newValue: "changed" }));

    expect(await screen.findByRole("heading", { name: "manager" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/mgr");
  });

  it("returns a persisted learner to home from a stale staff route", async () => {
    window.history.replaceState({}, "", "/mgr");
    client.currentSession.mockResolvedValue(learnerSession);
    render(<App>{() => <h1>Trang học</h1>}</App>);

    expect(await screen.findByRole("heading", { name: "Trang học" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/home");
  });

  it("keeps learner destinations visible when an approved learner has a newer placement awaiting review", async () => {
    learnerClient.getAssessment.mockResolvedValueOnce({ attempt: { status: "pending_review" } });
    render(<App>{() => <h1>Trang học</h1>}</App>);

    expect(await screen.findAllByRole("link", { name: "Luyện với Season" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Bài tháng" })).toHaveLength(2);
  });

  it("keeps learning destinations hidden until the learner has an approved CEFR level", async () => {
    learnerClient.getProgress.mockResolvedValueOnce({
      learner: { id: "learner-1", displayName: "Nguyễn Minh Anh", cefr: null, profile: {} },
      points: 0,
      badges: [],
      weeks: []
    });
    render(<App>{() => <h1>Cửa vào người học</h1>}</App>);

    expect(await screen.findByRole("heading", { name: "Cửa vào người học" })).toBeInTheDocument();
    await waitFor(() => expect(learnerClient.getProgress).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Luyện với Season" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bài tháng" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mini game" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tiến độ & hồ sơ" })).not.toBeInTheDocument();
  });

  it.each([
    ["operator", operatorSession, "/profile", "/op"],
    ["manager", managerSession, "/profile", "/mgr"]
  ] as const)("normalizes a persisted %s session from a learner route before the first role screen", async (_role, session, pathname, expected) => {
    window.history.replaceState({}, "", pathname);
    client.currentSession.mockResolvedValue(session);
    render(<App>{() => <h1>Role home</h1>}</App>);

    expect(await screen.findByRole("heading", { name: "Role home" })).toBeInTheDocument();
    expect(window.location.pathname).toBe(expected);
  });

  it.each([
    ["learner", learnerSession, "/home"],
    ["operator", operatorSession, "/op"],
    ["manager", managerSession, "/mgr"]
  ] as const)("lands a persisted %s session on its own home from the app entry", async (_role, session, expected) => {
    window.history.replaceState({}, "", "/");
    client.currentSession.mockResolvedValue(session);
    render(<App>{() => <h1>Role home</h1>}</App>);

    expect(await screen.findByRole("heading", { name: "Role home" })).toBeInTheDocument();
    expect(window.location.pathname).toBe(expected);
  });

  it.each([learnerSession, operatorSession, managerSession])("loads the organisation experience for the active $role session", async (activeSession) => {
    client.currentSession.mockResolvedValue(activeSession);
    render(<App>{() => <ExperienceProbe />}</App>);

    await waitFor(() => expect(screen.getByTestId("resolved-theme")).toHaveTextContent("winter"));
    await waitFor(() => expect(screen.getByTestId("music-allowed")).toHaveTextContent("false"));
    expect(client.getOrganisationExperience).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.themePattern).toBe("winter");
    expect(document.documentElement.style.getPropertyValue("--season-pattern-image")).toContain("season-winter.png");
  });

  it("keeps the last known organisation theme on the login screen after logout", async () => {
    const user = userEvent.setup();
    client.logout.mockResolvedValueOnce(undefined);
    render(<App>{() => <h1>Trang học</h1>}</App>);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("winter");
      expect(document.documentElement.style.getPropertyValue("--season-pattern-image")).toContain("season-winter.png");
    });
    await user.click(screen.getByRole("button", { name: "Đăng xuất khỏi tài khoản này" }));

    expect(await screen.findByRole("textbox", { name: "Email" })).toBeInTheDocument();
    await flushThemeEffects();
    expect(document.documentElement.dataset.theme).toBe("winter");
    expect(document.documentElement.style.getPropertyValue("--season-pattern-image")).toContain("season-winter.png");
  });

  it("keeps the last known organisation theme on a connection error and presents a complete recovery panel", async () => {
    const user = userEvent.setup();
    client.currentSession.mockResolvedValueOnce(learnerSession).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(null);
    render(<App>{() => <h1>Trang học</h1>}</App>);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("winter");
      expect(document.documentElement.style.getPropertyValue("--season-pattern-image")).toContain("season-winter.png");
    });
    window.dispatchEvent(new StorageEvent("storage", { key: "e4s:auth:changed", newValue: "changed" }));

    expect(await screen.findByRole("heading", { name: "Chưa thể mở E4S" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Kết nối bị gián đoạn");
    expect(screen.getByRole("button", { name: "Thử kết nối lại" })).toBeEnabled();
    await flushThemeEffects();
    expect(document.documentElement.dataset.theme).toBe("winter");
    expect(document.documentElement.style.getPropertyValue("--season-pattern-image")).toContain("season-winter.png");
    await user.click(screen.getByRole("button", { name: "Thử kết nối lại" }));
    expect(await screen.findByRole("textbox", { name: "Email" })).toBeInTheDocument();
  });

  it("loads the organisation theme before the first login screen on a new browser", async () => {
    client.currentSession.mockResolvedValueOnce(null);
    let finishTheme!: (result: { theme: "christmas" }) => void;
    client.getPublicOrganisationTheme.mockReturnValueOnce(new Promise((resolve) => { finishTheme = resolve; }));
    render(<App />);

    await waitFor(() => expect(client.getPublicOrganisationTheme).toHaveBeenCalledOnce());
    expect(screen.queryByRole("textbox", { name: "Email" })).not.toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    await act(async () => finishTheme({ theme: "christmas" }));
    expect(await screen.findByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("christmas");
    expect(document.documentElement.style.getPropertyValue("--season-pattern-image")).toContain("season-christmas.png");
    expect(client.getOrganisationExperience).not.toHaveBeenCalled();
  });

  it("restores the organisation theme on a reload while offline", async () => {
    client.currentSession.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("offline"));
    client.getPublicOrganisationTheme.mockResolvedValueOnce({ theme: "christmas" });
    const first = render(<App />);
    expect(await screen.findByRole("textbox", { name: "Email" })).toBeInTheDocument();
    first.unmount();

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Chưa thể mở E4S" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("christmas");
    expect(document.documentElement.style.getPropertyValue("--season-pattern-image")).toContain("season-christmas.png");
  });

  it("uses the current seasonal theme when the organisation explicitly selects auto", async () => {
    client.currentSession.mockResolvedValueOnce(learnerSession);
    client.getOrganisationExperience.mockResolvedValueOnce({ theme: "auto", backgroundMusic: { enabled: false, playlistId: "auto", customUrl: "", volume: 18 } });
    render(<App>{() => <ExperienceProbe />}</App>);

    await waitFor(() => expect(client.getOrganisationExperience).toHaveBeenCalled());
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe(resolveAutomaticTheme(new Date())));
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent(resolveAutomaticTheme(new Date()));
  });

  it("refreshes the organisation experience when an already-open app regains focus", async () => {
    client.getOrganisationExperience
      .mockResolvedValueOnce({ theme: "winter", backgroundMusic: { enabled: false, playlistId: "auto", customUrl: "", volume: 18 } })
      .mockResolvedValueOnce({ theme: "spring", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 26 } });
    render(<App>{() => <ExperienceProbe />}</App>);

    await waitFor(() => expect(screen.getByTestId("resolved-theme")).toHaveTextContent("winter"));
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(screen.getByTestId("resolved-theme")).toHaveTextContent("spring"));
    expect(client.getOrganisationExperience).toHaveBeenCalledTimes(2);
    expect(document.documentElement.dataset.themePattern).toBe("spring");
  });

  it("applies an organisation experience push without focus or refresh", async () => {
    const streams: FakeEventSource[] = [];
    class FakeEventSource {
      listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();
      constructor(readonly url: string) { streams.push(this); }
      addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      }
      close = vi.fn();
      emit(type: string, data: unknown) {
        for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data: JSON.stringify(data) }));
      }
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    render(<App>{() => <ExperienceProbe />}</App>);

    await waitFor(() => expect(streams).toHaveLength(1));
    streams[0]!.emit("experience", { theme: "spring", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 26 } });

    await waitFor(() => expect(screen.getByTestId("resolved-theme")).toHaveTextContent("spring"));
    expect(document.documentElement.dataset.themePattern).toBe("spring");
  });

  it("releases the push stream while the tab is hidden and reconnects when it is visible again", async () => {
    const streams: Array<{ close: ReturnType<typeof vi.fn> }> = [];
    class FakeEventSource {
      close = vi.fn();
      constructor(readonly url: string) { streams.push(this); }
      addEventListener() {}
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    render(<App>{() => <ExperienceProbe />}</App>);

    await waitFor(() => expect(streams).toHaveLength(1));
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(streams[0]!.close).toHaveBeenCalledOnce();

    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(streams).toHaveLength(2));
    expect(streams[1]!.close).not.toHaveBeenCalled();
  });

  it("passes the learner's approved CEFR into the account badge", async () => {
    render(<App>{() => <h1>Trang học</h1>}</App>);
    expect(await screen.findByText("A2", { selector: ".account-level-badge" })).toBeInTheDocument();
    expect(learnerClient.getProgress).toHaveBeenCalledOnce();
  });

  it("normalizes the stale route after a new learner sign-in", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/mgr");
    client.currentSession.mockResolvedValue(null);
    render(<App>{() => <h1>Trang học</h1>}</App>);

    await user.type(await screen.findByRole("textbox", { name: "Email" }), "learner@example.test");
    await user.type(screen.getByLabelText("Mã PIN"), "123456");
    client.learnerLogin.mockResolvedValueOnce(learnerSession);
    await user.click(screen.getByRole("button", { name: "Đăng nhập người học" }));

    expect(await screen.findByRole("heading", { name: "Trang học" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/home");
  });

  it("keeps the active session and reports a failed logout", async () => {
    const user = userEvent.setup();
    render(<App>{() => <h1>Trang học</h1>}</App>);

    await user.click(await screen.findByRole("button", { name: "Đăng xuất khỏi tài khoản này" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Không đăng xuất được. Vui lòng thử lại.");
    expect(screen.getByRole("heading", { name: "Trang học" })).toBeInTheDocument();
  });
});

function ExperienceProbe() {
  const { resolvedTheme } = useTheme();
  const { musicAllowed } = useExperience();
  return <><span data-testid="resolved-theme">{resolvedTheme}</span><span data-testid="music-allowed">{String(musicAllowed)}</span></>;
}

async function flushThemeEffects(): Promise<void> {
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
}
