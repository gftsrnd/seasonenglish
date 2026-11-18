// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter, MemoryRouter } from "react-router";
import type { SessionView } from "@e4s/contracts";
import { ExperienceProvider, useExperience } from "../../features/experience/Experience.js";
import { AudioControls, AppShell } from "./AppShell.js";
import { registerAssessmentLogoutGuard } from "./assessment-logout-guard.js";
import { claimExclusiveAudio } from "../../features/experience/audio-precedence.js";
import { ThemeProvider, useTheme } from "./ThemeProvider.js";

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

const sidebarLogout = () => within(document.querySelector<HTMLElement>(".userchip")!).getByRole("button", { name: "Đăng xuất khỏi tài khoản này" });

it("only shows the scroll shortcut when content extends beyond the viewport", () => {
  const edges: Element[] = [];
  let notify!: (entries: { target: Element; isIntersecting: boolean }[]) => void;
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof notify) { notify = callback; }
    observe = (edge: Element) => { edges.push(edge); };
    disconnect = vi.fn();
  });
  try {
    render(<ExperienceProvider><MemoryRouter><AppShell session={session("manager")} onLogout={vi.fn()}><div>Nội dung</div></AppShell></MemoryRouter></ExperienceProvider>);
    expect(edges).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Cuộn xuống cuối trang" })).not.toBeInTheDocument();
    act(() => notify([{ target: edges[0]!, isIntersecting: true }, { target: edges[1]!, isIntersecting: false }]));
    expect(screen.getByRole("button", { name: "Cuộn xuống cuối trang" })).toBeEnabled();
    act(() => notify([{ target: edges[0]!, isIntersecting: false }, { target: edges[1]!, isIntersecting: true }]));
    expect(screen.getByRole("button", { name: "Cuộn lên đầu trang" })).toBeEnabled();
    act(() => notify([{ target: edges[0]!, isIntersecting: true }]));
    expect(screen.queryByRole("button", { name: "Cuộn xuống cuối trang" })).not.toBeInTheDocument();
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
});

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
  it.each([
    ["learner", "/profile", "profile-identity-card"],
    ["operator", "/op/review", "operator-review-navigation"],
    ["manager", "/mgr", "manager-progress-card"]
  ] as const)("places guide help in the compact app header for %s", async (role, path, anchor) => {
    const visible = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect(12, 70, 180, 65)] as unknown as DOMRectList);
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn()
    })));
    try {
      const { container } = render(<ExperienceProvider><MemoryRouter initialEntries={[path]}><AppShell session={session(role)} onLogout={vi.fn()}><section className={anchor} /></AppShell></MemoryRouter></ExperienceProvider>);
      const utilities = screen.getByRole("group", { name: "Tiện ích ứng dụng" });
      expect(container.querySelector(".app-shell-topbar")).toContainElement(utilities);
      expect(await within(utilities).findByRole("button", { name: "Hướng dẫn sử dụng" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Hướng dẫn sử dụng" })).toHaveLength(1);
    } finally {
      visible.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["learner", "/profile", "profile-identity-card"],
    ["operator", "/op/months", "monthly-topic-card"],
    ["manager", "/mgr", "manager-progress-card"]
  ] as const)("puts account details in the desktop avatar menu and keeps sidebar logout for %s", async (role, path, anchor) => {
    const visibleTarget = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect(12, 70, 180, 65)] as unknown as DOMRectList);
    const { container } = render(<ExperienceProvider><MemoryRouter initialEntries={[path]}><AppShell session={session(role)} onLogout={vi.fn()}><div className={anchor}><div className={role === "learner" ? "profile-identity-actions" : undefined}><button type="button" aria-expanded="false">Mở chi tiết</button></div>{role === "learner" ? <button className="btn-primary" type="button">Đổi avatar</button> : null}</div></AppShell></MemoryRouter></ExperienceProvider>);
    try {
      const controls = screen.getByRole("group", { name: "Tiện ích ứng dụng" });
      expect(screen.queryByRole("group", { name: "Âm thanh" })).not.toBeInTheDocument();

      expect(container.querySelector(".shell-desktop-header")).toContainElement(controls);
      expect(container.querySelector("main")).not.toContainElement(controls);
      expect(within(controls).getByRole("button", { name: /^Thông báo/ })).toBeInTheDocument();
      expect(await within(controls).findByRole("button", { name: "Hướng dẫn sử dụng" })).toBeInTheDocument();
      const account = within(controls).getByRole("button", { name: "Tài khoản và âm thanh" });
      const menu = container.querySelector<HTMLElement>(".shell-account-panel")!;
      expect(account).toHaveAttribute("popovertarget", menu.id);
      expect(account).not.toHaveTextContent(session(role).user.displayName);
      expect(menu).toHaveTextContent(session(role).user.displayName);
      expect(menu.querySelector('[role="group"][aria-label="Âm thanh"]')).toBeInTheDocument();
      expect(menu.querySelector('button[data-action="logout"]')).toBeInTheDocument();
      expect(sidebarLogout()).toBeInTheDocument();
      expect(within(controls).getByRole("button", { name: /^Thông báo/ })).not.toHaveTextContent("Thông báo");
      expect(within(controls).getByRole("button", { name: "Hướng dẫn sử dụng" })).toHaveTextContent(/^$/);
      expect(screen.getAllByRole("button", { name: /^Thông báo/ })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "Hướng dẫn sử dụng" })).toHaveLength(1);
    } finally {
      visibleTarget.mockRestore();
    }
  });

  it("updates decorative seasonal motifs when the organisation theme is previewed", async () => {
    function PreviewWinter() {
      const { previewTheme } = useTheme();
      return <button type="button" onClick={() => previewTheme("winter")}>Xem thử mùa đông</button>;
    }
    window.localStorage.setItem("e4s:organisation-theme", "summer");
    const { container } = render(<ThemeProvider><ExperienceProvider><MemoryRouter><AppShell session={session("learner")} onLogout={vi.fn()}><PreviewWinter /></AppShell></MemoryRouter></ExperienceProvider></ThemeProvider>);
    const decoration = container.querySelector(".shell-season-decoration");

    expect(decoration).toHaveAttribute("aria-hidden", "true");
    expect(decoration?.querySelectorAll(":scope > svg")).toHaveLength(9);
    expect(decoration?.querySelector(".lucide-sun")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Xem thử mùa đông" }));
    expect(decoration?.querySelector(".lucide-snowflake")).toBeInTheDocument();
  });

  it("stops active assessment audio before starting logout", async () => {
    const user = userEvent.setup();
    const stopAudio = vi.fn();
    const onLogout = vi.fn();
    claimExclusiveAudio("speech", stopAudio);
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} onLogout={onLogout}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    await user.click(sidebarLogout());

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

      await user.click(sidebarLogout());
      const dialog = screen.getByRole("dialog", { name: "Bạn đang làm bài test" });
      expect(within(dialog).getByText(/được ghi nhận là một lần cảnh báo/i)).toBeInTheDocument();
      expect(guard).not.toHaveBeenCalled();
      expect(onLogout).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole("button", { name: "Ở lại làm bài" }));
      expect(screen.queryByRole("dialog", { name: "Bạn đang làm bài test" })).not.toBeInTheDocument();

      await user.click(sidebarLogout());
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

  it("shows the recap-approved Operator navigation groups", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/op/tests"]}><AppShell session={session("operator")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    const navigation = screen.getByRole("navigation", { name: "Điều hướng người vận hành" });
    expect(within(navigation).getByRole("link", { name: "Sinh bài" })).toHaveAttribute("href", "/op/months");
    expect(within(navigation).getByRole("link", { name: "Phản hồi & yêu cầu" })).toHaveAttribute("href", "/op/review");
    expect(within(navigation).getByRole("link", { name: "Kết quả bài thi" })).toHaveAttribute("href", "/op/tests");
    expect(within(navigation).getByRole("link", { name: "Kết quả bài thi" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).queryByRole("link", { name: "Đọc mẫu" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Đề lên mức" })).not.toBeInTheDocument();
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

  it("highlights Kết quả bài thi (not Duyệt mức) on the level-form tab route", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/op/levelforms"]}><AppShell session={session("operator")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    for (const name of ["Điều hướng người vận hành", "Điều hướng trên thiết bị di động"]) {
      const navigation = screen.getByRole("navigation", { name });
      const current = within(navigation).getAllByRole("link").filter(link => link.getAttribute("aria-current") === "page");
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAttribute("href", "/op/tests");
    }
  });

  it("keeps the primary operator item active for an unlisted operator child route", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/op/prompts"]}><AppShell session={session("operator")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    const primary = within(screen.getByRole("navigation", { name: "Điều hướng trên thiết bị di động" })).getByRole("link", { name: "Duyệt mức" });
    expect(primary).toHaveClass("active");
    expect(primary).toHaveAttribute("aria-current", "page");
  });

  it("keeps the primary manager item active for the reward child route", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/mgr/rewards"]}><AppShell session={session("manager")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    const primary = within(screen.getByRole("navigation", { name: "Điều hướng trên thiết bị di động" })).getByRole("link", { name: "Theo dõi" });
    expect(primary).toHaveClass("active");
    expect(primary).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["/mgr/reminders", "Theo dõi"], ["/mgr/report", "Theo dõi"],
    ["/mgr/holidays", "Vận hành"], ["/mgr/complaints", "Yêu cầu"],
    ["/mgr/reopen-requests", "Yêu cầu"], ["/mgr/requests", "Yêu cầu"], ["/settings", "Cài đặt"]
  ])("keeps four Manager destinations and highlights the correct group on %s", (path, label) => {
    render(<ExperienceProvider><MemoryRouter initialEntries={[path]}><AppShell session={session("manager")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);
    for (const name of ["Điều hướng quản lý", "Điều hướng trên thiết bị di động"]) {
      const navigation = screen.getByRole("navigation", { name });
      expect(within(navigation).getAllByRole("link").map(link => link.textContent)).toEqual(["Theo dõi", "Vận hành", "Yêu cầu", "Cài đặt"]);
      expect(within(navigation).getByRole("link", { name: "Vận hành" })).toHaveAttribute("href", "/mgr/ops");
      expect(within(navigation).getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
      expect(within(navigation).getAllByRole("link").filter(link => link.getAttribute("aria-current") === "page")).toHaveLength(1);
    }
  });

  it("locks logout while the session request is still pending and announces progress", async () => {
    const user = userEvent.setup();
    let resolveLogout!: () => void;
    const onLogout = () => new Promise<void>((resolve) => { resolveLogout = resolve; });
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} onLogout={onLogout}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    const logout = sidebarLogout();
    await user.click(logout);

    expect(logout).toBeDisabled();
    expect(logout).toHaveTextContent("Đang đăng xuất…");
    expect(screen.getByRole("status", { name: "Trạng thái đăng xuất" })).toHaveTextContent("Đang đăng xuất…");

    resolveLogout();
    await waitFor(() => expect(logout).toBeEnabled());
    expect(screen.getByRole("status", { name: "Trạng thái đăng xuất" })).toHaveTextContent("");
  });

  it("uses an accessible Lucide logout affordance for the sidebar control", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><AppShell session={session("learner")} onLogout={() => undefined}><div /></AppShell></MemoryRouter></ExperienceProvider>);

    const logout = sidebarLogout();
    expect(logout).toHaveAttribute("title", "Đăng xuất khỏi tài khoản này");
    expect(logout.querySelector("svg")).toHaveClass("lucide-log-out");
    expect(logout.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(logout).toHaveTextContent("Đăng xuất");
  });

  it("returns the user to the entry root when logout starts", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/op");
    render(<ExperienceProvider><BrowserRouter><AppShell session={session("operator")} onLogout={() => undefined}><div /></AppShell></BrowserRouter></ExperienceProvider>);

    await user.click(sidebarLogout());

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

    await user.click(sidebarLogout());

    expect(window.localStorage.getItem("e4s:effects")).toBe("off");
    expect(window.localStorage.getItem("e4s:music")).toBe("on");
    expect(window.localStorage.getItem("unrelated-preference")).toBe("keep");
    expect(window.sessionStorage.getItem("e4s:temporary")).toBeNull();
    expect(document.body).not.toHaveClass("app-modal-open");
  });
});
