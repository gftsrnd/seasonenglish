// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryScreen } from "../src/app/shared/EntryScreen.js";
import { AppShell } from "../src/app/shared/AppShell.js";

const learnerSession = {
  user: { id: "learner", displayName: "Nguyễn Minh Anh", email: "learner@example.test" },
  role: "learner" as const,
  permissions: ["learning:own" as const]
};

const authClient = (overrides = {}) => ({
  learnerLogin: vi.fn(), staffLogin: vi.fn(),
  registerLearner: vi.fn(),
  startLearnerPinReset: vi.fn(), verifyLearnerPinReset: vi.fn(), completeLearnerPinReset: vi.fn(),
  requestStaffPasswordHelp: vi.fn(),
  ...overrides
});

afterEach(cleanup);

describe("new binding-app shell", () => {
  it("uses the exact learner navigation order and original audio paths", () => {
    render(<MemoryRouter initialEntries={["/home"]}><AppShell session={learnerSession} onLogout={vi.fn()}><section>Trang học</section></AppShell></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Điều hướng người học" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Trang chủ", "Luyện với Season", "Bài tuần", "Mini game", "Tiến độ & hồ sơ"]);
    expect(screen.getByRole("button", { name: "Hiệu ứng âm thanh: bật" }).querySelector("svg")).toHaveClass("lucide-volume-2");
    expect(screen.getByRole("button", { name: "Nhạc nền: bật" }).querySelector("svg")).toHaveClass("lucide-music-2");
    expect(screen.getByRole("button", { name: "Hiệu ứng âm thanh: bật" }).querySelector("svg")).toHaveAttribute("width", "18");
  });

  it("keeps Manager navigation free of the former nested Operator overlay", () => {
    const session = { ...learnerSession, role: "manager" as const, permissions: ["settings:manage" as const] };
    render(<MemoryRouter initialEntries={["/op/lessons"]}><AppShell session={session} onLogout={vi.fn()}><section>Bài học</section></AppShell></MemoryRouter>);
    expect(within(screen.getByRole("navigation", { name: "Điều hướng quản lý" })).getAllByRole("link").map((link) => link.textContent)).toEqual(["Tiến độ", "Vận hành", "Nhắc học", "Báo cáo", "Cài đặt"]);
    expect(screen.queryByText("Chế độ xem của Quản lý")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đề lên mức" })).not.toBeInTheDocument();
  });

  it("keeps the learner shell avatar as a real avatar-picker trigger", async () => {
    const user = userEvent.setup();
    const onAvatarClick = vi.fn();
    const { container } = render(<MemoryRouter initialEntries={["/home"]}><AppShell session={learnerSession} avatar={{ acc: "leaf", color: "olive", bg: 0 }} onLogout={vi.fn()} onAvatarClick={onAvatarClick}><section>Trang học</section></AppShell></MemoryRouter>);
    const avatarButton = within(container).getByRole("button", { name: "Đổi avatar" });
    expect(avatarButton.querySelector("svg")).not.toBeNull();
    await user.click(avatarButton);
    expect(onAvatarClick).toHaveBeenCalledOnce();
  });

  it("disables the avatar trigger until its action is available", () => {
    render(<MemoryRouter initialEntries={["/home"]}><AppShell session={learnerSession} onLogout={vi.fn()}><section>Trang học</section></AppShell></MemoryRouter>);

    expect(screen.getByRole("button", { name: "Đổi avatar" })).toBeDisabled();
  });

  it("locks every entry action while a real login is pending", async () => {
    let resolveLogin!: (session: typeof learnerSession) => void;
    const client = authClient({
      learnerLogin: vi.fn(() => new Promise<typeof learnerSession>((resolve) => { resolveLogin = resolve; })),
    });
    const user = userEvent.setup();
    render(<EntryScreen client={client} onAuthenticated={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "learner@example.test");
    await user.type(screen.getByLabelText("Mã PIN"), "123456");
    await user.click(screen.getByRole("button", { name: "Đăng nhập người học" }));

    expect(screen.getByRole("button", { name: "Đang xử lý…" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Email" })).toBeDisabled();
    expect(screen.getByLabelText("Mã PIN")).toBeDisabled();
    resolveLogin(learnerSession);
  });

  it("supports arrow-key navigation for the account-type tabs", async () => {
    const client = authClient();
    const user = userEvent.setup();
    render(<EntryScreen client={client} onAuthenticated={vi.fn()} />);

    const learnerTab = screen.getByRole("tab", { name: "Người học" });
    const staffTab = screen.getByRole("tab", { name: "Nhân sự" });
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "app-login-learner-tab");

    await user.click(staffTab);

    expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus();
    expect(staffTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Đăng nhập nhân sự" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "app-login-staff-tab");
  });

  it("places failed-login feedback under the PIN field", async () => {
    const client = authClient({
      learnerLogin: vi.fn().mockRejectedValue(new Error("invalid credentials")),
    });
    const user = userEvent.setup();
    render(<EntryScreen client={client} onAuthenticated={vi.fn()} />);

    const email = screen.getByRole("textbox", { name: "Email" });
    const pin = screen.getByLabelText("Mã PIN");

    await user.type(email, "learner@example.test");
    await user.type(pin, "123456");
    await user.click(screen.getByRole("button", { name: "Đăng nhập người học" }));

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Email hoặc PIN chưa đúng");
    expect(pin.closest("label")).toContainElement(error);
  });
});
