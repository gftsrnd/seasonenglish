// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  currentSession: vi.fn(),
  learnerLogin: vi.fn(),
  staffLogin: vi.fn(),
  getProductPreferences: vi.fn(),
  getProfile: vi.fn(),
  logout: vi.fn()
}));

const learnerClient = vi.hoisted(() => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn()
}));

const managerClient = vi.hoisted(() => ({
  getManagerSettings: vi.fn()
}));

vi.mock("../api/shared.js", () => ({ sharedApiClient: client }));
vi.mock("../api/learner.js", () => ({ learnerApiClient: learnerClient }));
vi.mock("../api/manager.js", () => ({ managerApiClient: managerClient }));

import { PrototypeApp, resolveSessionEntryPath } from "./PrototypeApp.js";

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

afterEach(cleanup);

beforeEach(() => {
  window.history.replaceState({}, "", "/home");
  client.currentSession.mockResolvedValue(learnerSession);
  client.getProductPreferences.mockResolvedValue({ theme: "summer", vocabImageSource: "wikimedia" });
  client.getProfile.mockResolvedValue({
    profile: { fullName: "Nguyễn Minh Anh", avatar: { color: "olive", acc: "leaf", bg: 0 } },
    version: 1
  });
  client.logout.mockRejectedValue(new Error("network unavailable"));
});

describe("PrototypeApp session shell", () => {
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
    render(<PrototypeApp>{() => <h1>Trang quản lý</h1>}</PrototypeApp>);

    expect(await screen.findByRole("heading", { name: "Trang quản lý" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/mgr");
  });

  it("returns a persisted learner to home from a stale staff route", async () => {
    window.history.replaceState({}, "", "/mgr");
    client.currentSession.mockResolvedValue(learnerSession);
    render(<PrototypeApp>{() => <h1>Trang học</h1>}</PrototypeApp>);

    expect(await screen.findByRole("heading", { name: "Trang học" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/home");
  });

  it.each([
    ["operator", operatorSession, "/profile", "/op"],
    ["manager", managerSession, "/profile", "/mgr"]
  ] as const)("normalizes a persisted %s session from a learner route before the first role screen", async (_role, session, pathname, expected) => {
    window.history.replaceState({}, "", pathname);
    client.currentSession.mockResolvedValue(session);
    render(<PrototypeApp>{() => <h1>Role home</h1>}</PrototypeApp>);

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
    render(<PrototypeApp>{() => <h1>Role home</h1>}</PrototypeApp>);

    expect(await screen.findByRole("heading", { name: "Role home" })).toBeInTheDocument();
    expect(window.location.pathname).toBe(expected);
  });

  it("normalizes the stale route after a new learner sign-in", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/mgr");
    client.currentSession.mockResolvedValue(null);
    render(<PrototypeApp>{() => <h1>Trang học</h1>}</PrototypeApp>);

    await user.type(await screen.findByRole("textbox", { name: "Email" }), "learner@example.test");
    await user.type(screen.getByLabelText("Mật khẩu"), "learner-pass");
    client.learnerLogin.mockResolvedValueOnce(learnerSession);
    await user.click(screen.getByRole("button", { name: "Đăng nhập người học" }));

    expect(await screen.findByRole("heading", { name: "Trang học" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/home");
  });

  it("keeps the active session and reports a failed logout", async () => {
    const user = userEvent.setup();
    render(<PrototypeApp>{() => <h1>Trang học</h1>}</PrototypeApp>);

    await user.click(await screen.findByRole("button", { name: "Đăng xuất khỏi tài khoản này" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Không đăng xuất được. Vui lòng thử lại.");
    expect(screen.getByRole("heading", { name: "Trang học" })).toBeInTheDocument();
  });
});
