// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
  getProfile: vi.fn(),
  logout: vi.fn()
}));

const learnerClient = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getProgress: vi.fn(),
  getAssessment: vi.fn(),
  saveProfile: vi.fn()
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
  window.history.replaceState({}, "", "/home");
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
  learnerClient.getAssessment.mockResolvedValue({ attempt: { status: "approved" } });
  learnerClient.getProgress.mockResolvedValue({ learner: { id: "learner-1", displayName: "Nguyễn Minh Anh", cefr: "A2", profile: {} }, points: 0, badges: [], weeks: [] });
});

describe("App session shell", () => {
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
    expect(screen.getAllByRole("link", { name: "Bài thi" })).toHaveLength(2);
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
    expect(screen.queryByRole("link", { name: "Bài tuần" })).not.toBeInTheDocument();
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

  it("uses the current seasonal theme on login when no organisation theme has been loaded", async () => {
    client.currentSession.mockResolvedValueOnce(null);
    render(<App />);

    expect(await screen.findByRole("textbox", { name: "Email" })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe(resolveAutomaticTheme(new Date())));
    expect(client.getOrganisationExperience).not.toHaveBeenCalled();
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
