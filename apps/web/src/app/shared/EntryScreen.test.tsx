// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "@e4s/contracts";
import type { AuthClient } from "../../features/auth/index.js";
import { EntryScreen } from "./EntryScreen.js";

const learnerSession: SessionView = {
  user: { id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local" },
  role: "learner",
  permissions: ["learning:own"]
};

afterEach(cleanup);
beforeEach(() => window.history.replaceState({}, "", "/"));

function stubClient(): AuthClient {
  return {
    learnerLogin: vi.fn().mockRejectedValue(new Error("invalid credentials")),
    staffLogin: vi.fn().mockResolvedValue(learnerSession),
    registerLearner: vi.fn().mockResolvedValue(learnerSession)
  };
}

describe("EntryScreen interaction", () => {
  it("clears a stale learner error and focuses email when switching to staff", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    render(<EntryScreen client={client} onAuthenticated={() => undefined} />);

    await user.type(screen.getByLabelText("Email"), "wrong@example.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Đăng nhập người học" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể đăng nhập");
    await user.click(screen.getByRole("tab", { name: "Nhân sự" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "app-login-staff-tab");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Mật khẩu")).toHaveValue("");
  });

  it("registers a learner from the public entry screen", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    const onAuthenticated = vi.fn();
    render(<EntryScreen client={client} onAuthenticated={onAuthenticated} />);

    await user.click(screen.getByRole("button", { name: "Tạo tài khoản người học" }));
    expect(screen.getByRole("heading", { name: "Đăng ký người học" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Họ và tên"), "Học viên mới");
    await user.type(screen.getByLabelText("Email"), "new@e4s.local");
    await user.type(screen.getByLabelText("Mật khẩu"), "new-password");
    await user.type(screen.getByLabelText("Xác nhận mật khẩu"), "new-password");
    expect(screen.getByRole("button", { name: "Hiện mật khẩu" })).not.toHaveTextContent("Hiện");
    expect(screen.getByRole("button", { name: "Hiện xác nhận mật khẩu" })).not.toHaveTextContent("Hiện");
    await user.click(screen.getByRole("button", { name: "Đăng ký và bắt đầu" }));

    expect(client.registerLearner).toHaveBeenCalledWith({ displayName: "Học viên mới", email: "new@e4s.local", password: "new-password" });
    expect(onAuthenticated).toHaveBeenCalledWith(learnerSession);
    expect(window.location.pathname).toBe("/home");
  });

  it("does not submit registration when password confirmation differs", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    render(<EntryScreen client={client} onAuthenticated={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Tạo tài khoản người học" }));
    await user.type(screen.getByLabelText("Họ và tên"), "Học viên mới");
    await user.type(screen.getByLabelText("Email"), "new@e4s.local");
    await user.type(screen.getByLabelText("Mật khẩu"), "new-password");
    await user.type(screen.getByLabelText("Xác nhận mật khẩu"), "different-password");
    await user.click(screen.getByRole("button", { name: "Đăng ký và bắt đầu" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Mật khẩu xác nhận chưa khớp");
    expect(client.registerLearner).not.toHaveBeenCalled();
  });

  it("explains that a deleted account must be restored or purged before re-registering", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    client.registerLearner = vi.fn().mockRejectedValue(new Error("LEARNER_REGISTRATION_EMAIL_DELETED"));
    render(<EntryScreen client={client} onAuthenticated={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Tạo tài khoản người học" }));
    await user.type(screen.getByLabelText("Họ và tên"), "Học viên mới");
    await user.type(screen.getByLabelText("Email"), "deleted@e4s.local");
    await user.type(screen.getByLabelText("Mật khẩu"), "new-password");
    await user.type(screen.getByLabelText("Xác nhận mật khẩu"), "new-password");
    await user.click(screen.getByRole("button", { name: "Đăng ký và bắt đầu" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("khôi phục hoặc xoá vĩnh viễn");
  });

  it("reveals the password and explains when the account uses another login path", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    client.learnerLogin = vi.fn().mockRejectedValue(new Error("WRONG_LOGIN_PATH"));
    window.history.replaceState({}, "", "/");
    render(<EntryScreen client={client} onAuthenticated={() => undefined} />);

    await user.type(screen.getByLabelText("Email"), "operator@e4s.local");
    await user.type(screen.getByLabelText("Mật khẩu"), "staff-pass");
    await user.click(screen.getByRole("button", { name: "Hiện mật khẩu" }));

    expect(screen.getByLabelText("Mật khẩu")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ẩn mật khẩu" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Ẩn mật khẩu" }));
    await user.click(screen.getByRole("button", { name: "Đăng nhập người học" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Hãy chọn tab Nhân sự");
  });

  it("explains when login is blocked because the account is in the trash", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    client.learnerLogin = vi.fn().mockRejectedValue(new Error("ACCOUNT_DELETED"));
    render(<EntryScreen client={client} onAuthenticated={() => undefined} />);

    await user.type(screen.getByLabelText("Email"), "deleted@e4s.local");
    await user.type(screen.getByLabelText("Mật khẩu"), "new-password");
    await user.click(screen.getByRole("button", { name: "Đăng nhập người học" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("đang nằm trong thùng rác");
  });

  it("shows the current email/password reset path for learner login", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    render(<EntryScreen client={client} onAuthenticated={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Quên mật khẩu?" }));
    expect(screen.getAllByRole("status").some((status) => status.textContent?.includes("liên hệ người vận hành hoặc quản lý để được cấp lại mật khẩu"))).toBe(true);
  });

  it("warns when Caps Lock is active while entering the email", async () => {
    const user = userEvent.setup();
    render(<EntryScreen client={stubClient()} onAuthenticated={() => undefined} />);

    const email = screen.getByLabelText("Email");
    await user.click(email);
    await user.keyboard("{CapsLock}");
    await user.keyboard("A");

    expect(screen.getAllByRole("status").some((status) => status.textContent?.includes("Caps Lock đang bật"))).toBe(true);
    await user.tab();
    expect(screen.getAllByRole("status").some((status) => status.textContent?.includes("Caps Lock đang bật"))).toBe(false);
  });
});
