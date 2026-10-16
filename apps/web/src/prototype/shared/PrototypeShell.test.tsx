// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrowserRouter, MemoryRouter } from "react-router";
import type { SessionView } from "@e4s/contracts";
import { ExperienceProvider, useExperience } from "../../features/experience/Experience.js";
import { AudioControls, PrototypeShell } from "./PrototypeShell.js";

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

describe("prototype audio controls", () => {
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

describe("prototype shell navigation and logout", () => {
  it("keeps Learner navigation scoped to Learner routes", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><PrototypeShell session={session("learner")} onLogout={() => undefined}><div /></PrototypeShell></MemoryRouter></ExperienceProvider>);

    const links = [
      ...within(screen.getByRole("navigation", { name: "Điều hướng người học" })).getAllByRole("link"),
      ...within(screen.getByRole("navigation", { name: "Điều hướng trên thiết bị di động" })).getAllByRole("link")
    ];
    expect(links.map((link) => link.getAttribute("href"))).not.toEqual(expect.arrayContaining(["/op", "/mgr", "/settings"]));
  });

  it("keeps the primary operator item active for an unlisted operator child route", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/op/prompts"]}><PrototypeShell session={session("operator")} onLogout={() => undefined}><div /></PrototypeShell></MemoryRouter></ExperienceProvider>);

    const primary = within(screen.getByRole("navigation", { name: "Điều hướng trên thiết bị di động" })).getByRole("link", { name: "Duyệt mức" });
    expect(primary).toHaveClass("active");
    expect(primary).toHaveAttribute("aria-current", "page");
  });

  it("keeps the primary manager item active for the reward child route", () => {
    render(<ExperienceProvider><MemoryRouter initialEntries={["/mgr/rewards"]}><PrototypeShell session={session("manager")} onLogout={() => undefined}><div /></PrototypeShell></MemoryRouter></ExperienceProvider>);

    const primary = within(screen.getByRole("navigation", { name: "Điều hướng trên thiết bị di động" })).getByRole("link", { name: "Tiến độ" });
    expect(primary).toHaveClass("active");
    expect(primary).toHaveAttribute("aria-current", "page");
  });

  it("locks logout while the session request is still pending and announces progress", async () => {
    const user = userEvent.setup();
    let resolveLogout!: () => void;
    const onLogout = () => new Promise<void>((resolve) => { resolveLogout = resolve; });
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><PrototypeShell session={session("learner")} onLogout={onLogout}><div /></PrototypeShell></MemoryRouter></ExperienceProvider>);

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
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><PrototypeShell session={session("learner")} onLogout={() => undefined}><div /></PrototypeShell></MemoryRouter></ExperienceProvider>);

    const logout = screen.getByRole("button", { name: "Đăng xuất khỏi tài khoản này" });
    expect(logout).toHaveAttribute("title", "Đăng xuất khỏi tài khoản này");
    expect(logout.querySelector("svg")).toHaveClass("lucide-log-out");
    expect(logout.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(logout).toHaveTextContent("Đăng xuất");
  });

  it("returns the user to the entry root when logout starts", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/op");
    render(<ExperienceProvider><BrowserRouter><PrototypeShell session={session("operator")} onLogout={() => undefined}><div /></PrototypeShell></BrowserRouter></ExperienceProvider>);

    await user.click(screen.getByRole("button", { name: "Đăng xuất khỏi tài khoản này" }));

    expect(window.location.pathname).toBe("/");
  });

  it("clears namespaced shared-device state and modal scroll lock before logout", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("e4s:effects", "off");
    window.localStorage.setItem("e4s:music", "on");
    window.localStorage.setItem("unrelated-preference", "keep");
    window.sessionStorage.setItem("e4s:temporary", "stale");
    document.body.classList.add("prototype-modal-open");
    render(<ExperienceProvider><MemoryRouter initialEntries={["/home"]}><PrototypeShell session={session("learner")} onLogout={() => undefined}><div /></PrototypeShell></MemoryRouter></ExperienceProvider>);

    await user.click(screen.getByRole("button", { name: "Đăng xuất khỏi tài khoản này" }));

    expect(window.localStorage.getItem("e4s:effects")).toBeNull();
    expect(window.localStorage.getItem("e4s:music")).toBeNull();
    expect(window.localStorage.getItem("unrelated-preference")).toBe("keep");
    expect(window.sessionStorage.getItem("e4s:temporary")).toBeNull();
    expect(document.body).not.toHaveClass("prototype-modal-open");
  });
});
