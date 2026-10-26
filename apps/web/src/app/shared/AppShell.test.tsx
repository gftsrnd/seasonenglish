// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter, MemoryRouter } from "react-router";
import type { SessionView } from "@e4s/contracts";
import { ExperienceProvider, useExperience } from "../../features/experience/Experience.js";
import { AudioControls, AppShell } from "./AppShell.js";
import { registerAssessmentLogoutGuard } from "./assessment-logout-guard.js";
import { claimExclusiveAudio } from "../../features/experience/audio-precedence.js";

function MusicState() {
  const { musicOn } = useExperience();
  return <output aria-label="music-state">{musicOn ? "on" : "off"}</output>;
}

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const session = (role: SessionView["role"]): SessionView => ({
  user: { id: role, displayName: role === "learner" ? "Học viên Demo" : role === "operator" ? "Operator Demo" : "Manager Demo", email: `${role}@e4s.local` },
  role,
  permissions: role === "learner" ? ["learning:own"] : role === "operator" ? ["content:operate", "assessment:review", "prompt:manage"] : ["content:operate", "assessment:review", "prompt:manage", "report:read", "operations:read", "reminder:manage", "reward:preview", "account:manage", "role:manage", "organisation:manage", "settings:manage"]
} as SessionView);

describe("app audio controls", () => {
  it("renders Lucide icons without changing the audio button contract", () => {
    render(<ExperienceProvider><AudioControls /></ExperienceProvider>);

    expect(screen.getByRole("button", { name: "Hiệu ứng âm thanh: bật" }).querySelector("svg")).toHaveClass("lucide-volume-2");
    expect(screen.getByRole("button", { name: "Nhạc nền: bật" }).querySelector("svg")).toHaveClass("lucide-music-2");
    expect(screen.getByRole("button", { name: "Hiệu ứng âm thanh: bật" }).querySelector("svg")).toHaveAttribute("width", "18");
    expect(screen.getByRole("button", { name: "Nhạc nền: bật" }).querySelector("svg")).toHaveAttribute("stroke-width", "1.7");
  });

  it("updates the shared experience music preference", async () => {
    const user = userEvent.setup();
    render(<ExperienceProvider><AudioControls /><MusicState /></ExperienceProvider>);

    expect(screen.getByRole("button", { name: "Hiệu ứng âm thanh: bật" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Nhạc nền: bật" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Nhạc nền: bật" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("music-state")).toHaveTextContent("on");

    await user.click(screen.getByRole("button", { name: "Nhạc nền: bật" }));

    expect(screen.getByRole("button", { name: "Nhạc nền: tắt" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("music-state")).toHaveTextContent("off");
  });

  it("keeps BGM unavailable when the Manager disables it globally", () => {
    render(<ExperienceProvider musicAllowed={false}><AudioControls /><MusicState /></ExperienceProvider>);

    expect(screen.getByRole("button", { name: "Nhạc nền: tắt" })).toBeDisabled();
    expect(screen.getByLabelText("music-state")).toHaveTextContent("off");
  });

  it("announces the new audio state after a toggle", async () => {
    const user = userEvent.setup();
    render(<ExperienceProvider><AudioControls /></ExperienceProvider>);

    await user.click(screen.getByRole("button", { name: "Hiệu ứng âm thanh: bật" }));

    expect(screen.getByRole("status", { name: "Phản hồi âm thanh" })).toHaveTextContent("Đã tắt hiệu ứng âm thanh.");
  });
});

describe("app shell navigation and logout", () => {
  it("stops active assessment audio before starting logout", async () => {
    const user = userEvent.setup();
    const stopAudio = vi.fn();
    const onLogout = vi.fn();
    claimExclusiveAudio("speech", stopAudio);
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} onLogout={onLogout}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    await user.click(screen.getByRole("button", { name: "Đăng xuất khỏi tài khoản này" }));

    expect(stopAudio).toHaveBeenCalledOnce();
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("stops active assessment audio when the authenticated shell exits", () => {
    const stopAudio = vi.fn();
    claimExclusiveAudio("speech", stopAudio);
    const { unmount } = render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} onLogout={vi.fn()}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    unmount();

    expect(stopAudio).toHaveBeenCalledOnce();
  });

  it("uses the app dialog instead of the browser confirm while an assessment is active", async () => {
    const user = userEvent.setup();
    const guard = vi.fn().mockResolvedValue("logout");
    const unregister = registerAssessmentLogoutGuard(guard);
    const onLogout = vi.fn();
    try {
      render(<ExperienceProvider><MemoryRouter initialEntries={["/test/placement"]}><AppShell session={session("learner")} onLogout={onLogout}><div /></AppShell></MemoryRouter></ExperienceProvider>);

      await user.click(screen.getByRole("button", { name: "Đăng xuất khỏi tài khoản này" }));
      const dialog = screen.getByRole("dialog", { name: "Bạn đang làm bài test" });
      expect(within(dialog).getByText(/được ghi nhận là một lần cảnh báo/i)).toBeInTheDocument();
      expect(guard).not.toHaveBeenCalled();
      expect(onLogout).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole("button", { name: "Ở lại làm bài" }));
      expect(screen.queryByRole("dialog", { name: "Bạn đang làm bài test" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Đăng xuất khỏi tài khoản này" }));
      await user.click(within(screen.getByRole("dialog", { name: "Bạn đang làm bài test" })).getByRole("button", { name: "Vẫn đăng xuất" }));
      await waitFor(() => expect(guard).toHaveBeenCalledOnce());
      expect(onLogout).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });
  it.each(["A1", "A2", "B1", "B2", "C1"] as const)("shows the learner role icon and real %s level badge", (cefr) => {
    const { container } = render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} learnerCefr={cefr} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    expect(screen.getByLabelText("Vai trò: Người học").querySelector("svg")).toHaveClass("lucide-graduation-cap");
    expect(screen.getByText(cefr, { selector: ".account-level-badge" })).toHaveClass(`lvl-${cefr}`);
    expect(container.querySelector(".account-identity")).toBeInTheDocument();
  });

  it("does not invent a level badge when learner CEFR is unavailable", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);
    expect(document.querySelector(".account-level-badge")).not.toBeInTheDocument();
  });

  it("leaves non-learner identity unchanged", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/op"]}><AppShell session={session("operator")} learnerCefr="B1" onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);
    expect(screen.queryByLabelText("Vai trò: Người học")).not.toBeInTheDocument();
    expect(document.querySelector(".account-level-badge")).not.toBeInTheDocument();
    expect(screen.getByText(/Người vận hành/)).toBeInTheDocument();
  });

  it("keeps Learner navigation scoped to Learner routes", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    const links = [
      ...within(screen.getByRole("navigation", { name: "Điều hướng người học" })).getAllByRole("link"),
      ...within(screen.getByRole("navigation", { name: "Điều hướng trên thiết bị di động" })).getAllByRole("link")
    ];
    expect(links.map((link) => link.getAttribute("href"))).not.toEqual(expect.arrayContaining(["/op", "/mgr", "/settings"]));
  });

  it("hides learner destinations until onboarding is complete", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} onboardingComplete={false} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    expect(screen.queryByRole("link", { name: "Luyện với Season" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bài tuần" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Trang chủ" })).toHaveLength(2);
  });

  it("keeps the primary operator item active for an unlisted operator child route", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/op/prompts"]}><AppShell session={session("operator")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    const primary = within(screen.getByRole("navigation", { name: "Điều hướng trên thiết bị di động" })).getByRole("link", { name: "Duyệt mức" });
    expect(primary).toHaveClass("active");
    expect(primary).toHaveAttribute("aria-current", "page");
  });

  it("keeps the primary manager item active for the reward child route", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/mgr/rewards"]}><AppShell session={session("manager")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    const primary = within(screen.getByRole("navigation", { name: "Điều hướng trên thiết bị di động" })).getByRole("link", { name: "Tiến độ" });
    expect(primary).toHaveClass("active");
    expect(primary).toHaveAttribute("aria-current", "page");
  });

  it("locks logout while the session request is still pending and announces progress", async () => {
    const user = userEvent.setup();
    let resolveLogout!: () => void;
    const onLogout = () => new Promise<void>((resolve) => { resolveLogout = resolve; });
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} onLogout={onLogout}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    const logout = screen.getByRole("button", { name: "Đăng xuất khỏi tài khoản này" });
    await user.click(logout);

    expect(logout).toBeDisabled();
    expect(logout).toHaveTextContent("Đang đăng xuất…");
    expect(screen.getByRole("status", { name: "Trạng thái đăng xuất" })).toHaveTextContent("Đang đăng xuất…");

    resolveLogout();
    await waitFor(() => expect(logout).toBeEnabled());
    expect(screen.getByRole("status", { name: "Trạng thái đăng xuất" })).toHaveTextContent("");
  });

  it("uses an accessible Lucide logout affordance for the compact shell control", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    const logout = screen.getByRole("button", { name: "Đăng xuất khỏi tài khoản này" });
    expect(logout).toHaveAttribute("title", "Đăng xuất khỏi tài khoản này");
    expect(logout.querySelector("svg")).toHaveClass("lucide-log-out");
    expect(logout.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(logout).toHaveTextContent("Đăng xuất");
  });

  it("returns the user to the entry root when logout starts", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/op");
    render(<ExperienceProvider><BrowserRouter><AppShell session={session("operator")} onLogout={() => undefined}><div /></AppShell></BrowserRouter></ExperienceProvider>);

    await user.click(screen.getByRole("button", { name: "Đăng xuất khỏi tài khoản này" }));

    expect(window.location.pathname).toBe("/");
  });

  it("clears account state but keeps device audio preferences before logout", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("e4s:effects", "off");
    window.localStorage.setItem("e4s:music", "on");
    window.localStorage.setItem("unrelated-preference", "keep");
    window.sessionStorage.setItem("e4s:temporary", "stale");
    document.body.classList.add("app-modal-open");
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    await user.click(screen.getByRole("button", { name: "Đăng xuất khỏi tài khoản này" }));

    expect(window.localStorage.getItem("e4s:effects")).toBe("off");
    expect(window.localStorage.getItem("e4s:music")).toBe("on");
    expect(window.localStorage.getItem("unrelated-preference")).toBe("keep");
    expect(window.sessionStorage.getItem("e4s:temporary")).toBeNull();
    expect(document.body).not.toHaveClass("app-modal-open");
  });
});
