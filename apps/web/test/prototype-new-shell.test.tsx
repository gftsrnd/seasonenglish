// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrototypeEntry } from "../src/prototype/shared/PrototypeEntry.js";
import { PrototypeShell } from "../src/prototype/shared/PrototypeShell.js";

const learnerSession = {
  user: { id: "learner", displayName: "Nguyễn Minh Anh", email: "learner@example.test" },
  role: "learner" as const,
  permissions: ["learning:own" as const]
};

afterEach(cleanup);

describe("new binding-prototype shell", () => {
  it("uses the exact learner navigation order and original audio paths", () => {
    render(<MemoryRouter initialEntries={["/home"]}><PrototypeShell session={learnerSession} onLogout={vi.fn()}><section>Trang học</section></PrototypeShell></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Điều hướng người học" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Trang chủ", "Luyện với Season", "Bài tuần", "Mini game", "Tiến độ & hồ sơ"]);
    expect(screen.getByRole("button", { name: "Hiệu ứng âm thanh: bật" }).querySelector("svg")).toHaveClass("lucide-volume-2");
    expect(screen.getByRole("button", { name: "Nhạc nền: bật" }).querySelector("svg")).toHaveClass("lucide-music-2");
    expect(screen.getByRole("button", { name: "Hiệu ứng âm thanh: bật" }).querySelector("svg")).toHaveAttribute("width", "18");
  });

  it("keeps manager navigation and read-only operator overlay from the prototype", () => {
    const session = { ...learnerSession, role: "manager" as const, permissions: ["settings:manage" as const] };
    render(<MemoryRouter initialEntries={["/op/lessons"]}><PrototypeShell session={session} onLogout={vi.fn()}><section>Bài học</section></PrototypeShell></MemoryRouter>);
    expect(within(screen.getByRole("navigation", { name: "Điều hướng quản lý" })).getAllByRole("link").map((link) => link.textContent)).toEqual(["Tiến độ", "Vận hành", "Nhắc học", "Báo cáo", "Cài đặt"]);
    expect(screen.getByText("Chế độ xem của Quản lý")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đề lên mức" })).toBeInTheDocument();
  });

  it("keeps the learner shell avatar as a real avatar-picker trigger", async () => {
    const user = userEvent.setup();
    const onAvatarClick = vi.fn();
    const { container } = render(<MemoryRouter initialEntries={["/home"]}><PrototypeShell session={learnerSession} avatar={{ acc: "leaf", color: "olive", bg: 0 }} onLogout={vi.fn()} onAvatarClick={onAvatarClick}><section>Trang học</section></PrototypeShell></MemoryRouter>);
    const avatarButton = within(container).getByRole("button", { name: "Đổi avatar" });
    expect(avatarButton.querySelector("svg")).not.toBeNull();
    await user.click(avatarButton);
    expect(onAvatarClick).toHaveBeenCalledOnce();
  });

  it("disables the avatar trigger until its action is available", () => {
    render(<MemoryRouter initialEntries={["/home"]}><PrototypeShell session={learnerSession} onLogout={vi.fn()}><section>Trang học</section></PrototypeShell></MemoryRouter>);

    expect(screen.getByRole("button", { name: "Đổi avatar" })).toBeDisabled();
  });

  it("locks every entry action while a real login is pending", async () => {
    let resolveLogin!: (session: typeof learnerSession) => void;
    const client = {
      learnerLogin: vi.fn(() => new Promise<typeof learnerSession>((resolve) => { resolveLogin = resolve; })),
      staffLogin: vi.fn()
    };
    const user = userEvent.setup();
    render(<PrototypeEntry client={client} onAuthenticated={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "learner@example.test");
    await user.type(screen.getByLabelText("Mật khẩu"), "not-submitted-by-browser");
    await user.click(screen.getByRole("button", { name: "Đăng nhập người học" }));

    expect(screen.getByRole("button", { name: "Đang đăng nhập…" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Người học" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Nhân sự" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Email" })).toBeDisabled();
    expect(screen.getByLabelText("Mật khẩu")).toBeDisabled();
    resolveLogin(learnerSession);
  });

  it("supports arrow-key navigation for the account-type tabs", async () => {
    const client = { learnerLogin: vi.fn(), staffLogin: vi.fn() };
    const user = userEvent.setup();
    render(<PrototypeEntry client={client} onAuthenticated={vi.fn()} />);

    const learnerTab = screen.getByRole("tab", { name: "Người học" });
    const staffTab = screen.getByRole("tab", { name: "Nhân sự" });
    expect(learnerTab).toHaveAttribute("tabindex", "0");
    expect(staffTab).toHaveAttribute("tabindex", "-1");
    expect(learnerTab).toHaveAttribute("aria-controls", "prototype-login-panel");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "prototype-login-learner-tab");

    learnerTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(staffTab).toHaveFocus();
    expect(staffTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Đăng nhập nhân sự" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "prototype-login-staff-tab");
  });

  it("associates login fields with the error and moves focus to failed-login feedback", async () => {
    const client = {
      learnerLogin: vi.fn().mockRejectedValue(new Error("invalid credentials")),
      staffLogin: vi.fn()
    };
    const user = userEvent.setup();
    render(<PrototypeEntry client={client} onAuthenticated={vi.fn()} />);

    const email = screen.getByRole("textbox", { name: "Email" });
    const password = screen.getByLabelText("Mật khẩu");
    expect(email).toHaveAttribute("id", "prototype-login-email");
    expect(password).toHaveAttribute("id", "prototype-login-password");

    await user.type(email, "learner@example.test");
    await user.type(password, "wrong-password");
    await user.click(screen.getByRole("button", { name: "Đăng nhập người học" }));

    const error = await screen.findByRole("alert");
    expect(error).toHaveFocus();
    expect(error).toHaveAttribute("id", "prototype-login-error");
    expect(email).toHaveAttribute("aria-describedby", "prototype-login-error");
    expect(password).toHaveAttribute("aria-describedby", "prototype-login-error");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-describedby", "prototype-login-error");
  });
});
