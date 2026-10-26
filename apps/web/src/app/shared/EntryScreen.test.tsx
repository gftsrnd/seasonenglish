// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "@e4s/contracts";
import type { AuthClient } from "../../features/auth/index.js";
import { EntryScreen } from "./EntryScreen.js";

const learnerSession: SessionView = { user: { id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local" }, role: "learner", permissions: ["learning:own"] };

afterEach(cleanup);
beforeEach(() => window.history.replaceState({}, "", "/"));

function stubClient(): AuthClient {
  return {
    learnerLogin: vi.fn().mockResolvedValue(learnerSession),
    staffLogin: vi.fn().mockResolvedValue(learnerSession),
    registerLearner: vi.fn().mockResolvedValue(learnerSession),
    startLearnerPinReset: vi.fn().mockResolvedValue({ challengeId: "challenge-2", expiresAt: new Date().toISOString() }),
    verifyLearnerPinReset: vi.fn().mockResolvedValue({ resetToken: "reset-token" }),
    completeLearnerPinReset: vi.fn().mockResolvedValue({ saved: true }),
    requestStaffPasswordHelp: vi.fn().mockResolvedValue({ requested: true })
  };
}

describe("EntryScreen interaction", () => {
  it("shows learner PIN as six positions and sends the learner PIN contract", async () => {
    const user = userEvent.setup(); const client = stubClient();
    render(<EntryScreen client={client} onAuthenticated={vi.fn()} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("placeholder", "ten@email.com");
    expect(screen.queryByText("Gồm 6 chữ số.")).not.toBeInTheDocument();
    expect(screen.getByText("Không lưu đăng nhập. Hãy đăng xuất sau khi học.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "learner@e4s.local");
    await user.type(screen.getByLabelText("Mã PIN"), "12ab3456");
    await user.click(screen.getByRole("button", { name: "Hiện Mã PIN" }));
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ẩn Mã PIN" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Đăng nhập người học" }));
    expect(client.learnerLogin).toHaveBeenCalledWith({ email: "learner@e4s.local", pin: "123456" });
  });

  it("returns focus to the PIN field after toggling visibility so Backspace edits the PIN", async () => {
    const user = userEvent.setup();
    render(<EntryScreen client={stubClient()} onAuthenticated={vi.fn()} />);
    const pin = screen.getByLabelText("Mã PIN");
    await user.type(pin, "123456");
    await user.click(screen.getByRole("button", { name: "Hiện Mã PIN" }));
    await user.keyboard("{Backspace}");
    expect(pin).toHaveValue("12345");
    expect(pin).toHaveFocus();
  });

  it("keeps validation errors directly under the matching registration field", async () => {
    const user = userEvent.setup(); const client = stubClient();
    render(<EntryScreen client={client} onAuthenticated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản người học" }));
    await user.type(screen.getByLabelText("Họ và tên"), "Media123");
    await user.type(screen.getByLabelText("Email"), "new@e4s.local");
    await user.type(screen.getByLabelText("Mã PIN"), "123456");
    await user.type(screen.getByLabelText("Nhập lại mã PIN"), "123456");
    await user.click(screen.getByRole("button", { name: "Đăng ký và bắt đầu" }));
    expect(screen.getByLabelText("Họ và tên").closest("label")).toHaveTextContent("Nhập đầy đủ họ và tên, không dùng số");
    expect(client.registerLearner).not.toHaveBeenCalled();
  });

  it("validates registration name and email while the learner is typing", async () => {
    const user = userEvent.setup();
    render(<EntryScreen client={stubClient()} onAuthenticated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản người học" }));
    await user.type(screen.getByLabelText("Họ và tên"), "213123");
    expect(screen.getByLabelText("Họ và tên").closest("label")).toHaveTextContent("Nhập đầy đủ họ và tên, không dùng số");
    await user.clear(screen.getByLabelText("Họ và tên"));
    await user.type(screen.getByLabelText("Họ và tên"), "Nguyễn Minh Anh");
    expect(screen.getByLabelText("Họ và tên").closest("label")).not.toHaveTextContent("Nhập đầy đủ họ và tên, không dùng số");
    await user.type(screen.getByLabelText("Email"), "123123");
    expect(screen.getByLabelText("Email").closest("label")).toHaveTextContent("Nhập email hợp lệ");
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "new@e4s.local");
    expect(screen.getByLabelText("Email").closest("label")).not.toHaveTextContent("Nhập email hợp lệ");
  });

  it("validates both learner and staff login fields while typing", async () => {
    const user = userEvent.setup();
    render(<EntryScreen client={stubClient()} onAuthenticated={vi.fn()} />);

    await user.type(screen.getByLabelText("Email"), "bad");
    expect(screen.getByLabelText("Email").closest("label")).toHaveTextContent("Nhập email hợp lệ");
    await user.type(screen.getByLabelText("Mã PIN"), "12");
    expect(screen.getByLabelText("Mã PIN").closest("label")).toHaveTextContent("Mã PIN phải gồm đúng 6 chữ số");
    await user.type(screen.getByLabelText("Mã PIN"), "3456");
    expect(screen.getByLabelText("Mã PIN").closest("label")).not.toHaveTextContent("Mã PIN phải gồm đúng 6 chữ số");

    await user.click(screen.getByRole("tab", { name: "Nhân sự" }));
    await user.type(screen.getByLabelText("Email"), "staff");
    expect(screen.getByLabelText("Email").closest("label")).toHaveTextContent("Nhập email hợp lệ");
    await user.type(screen.getByLabelText("Mật khẩu"), "short");
    expect(screen.getByLabelText("Mật khẩu").closest("label")).not.toHaveTextContent("Mật khẩu cần ít nhất 8 ký tự");
  });

  it("explains when a learner signs in through the staff tab", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    client.staffLogin = vi.fn().mockRejectedValue(new Error("WRONG_LOGIN_PATH"));
    render(<EntryScreen client={client} onAuthenticated={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Nhân sự" }));
    await user.type(screen.getByLabelText("Email"), "learner@e4s.local");
    await user.type(screen.getByLabelText("Mật khẩu"), "246810");
    await user.click(screen.getByRole("button", { name: "Đăng nhập nhân sự" }));

    expect(client.staffLogin).toHaveBeenCalledWith({ email: "learner@e4s.local", password: "246810" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể đăng nhập. Vui lòng kiểm tra email, mật khẩu và vai trò. Tài khoản người học cần đăng nhập ở tab Người học.");
  });

  it("validates every PIN recovery step while typing", async () => {
    const user = userEvent.setup();
    render(<EntryScreen client={stubClient()} onAuthenticated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Quên mã PIN?" }));

    await user.type(screen.getByLabelText("Email"), "bad");
    expect(screen.getByLabelText("Email").closest("label")).toHaveTextContent("Nhập email hợp lệ");
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "learner@e4s.local");
    await user.click(screen.getByRole("button", { name: "Gửi mã qua email" }));

    await user.type(screen.getByLabelText("Mã xác minh"), "12");
    expect(screen.getByLabelText("Mã xác minh").closest("label")).toHaveTextContent("Mã xác minh phải gồm 6 chữ số");
    await user.type(screen.getByLabelText("Mã xác minh"), "3456");
    expect(screen.getByLabelText("Mã xác minh").closest("label")).not.toHaveTextContent("Mã xác minh phải gồm 6 chữ số");
    await user.click(screen.getByRole("button", { name: "Xác minh mã" }));

    await user.type(screen.getByLabelText("Mã PIN mới"), "12");
    expect(screen.getByLabelText("Mã PIN mới").closest("label")).toHaveTextContent("Mã PIN phải gồm đúng 6 chữ số");
    await user.type(screen.getByLabelText("Mã PIN mới"), "3456");
    await user.type(screen.getByLabelText("Nhập lại mã PIN"), "654321");
    expect(screen.getByLabelText("Nhập lại mã PIN").closest("label")).toHaveTextContent("Mã PIN nhập lại chưa khớp");
    await user.clear(screen.getByLabelText("Nhập lại mã PIN"));
    await user.type(screen.getByLabelText("Nhập lại mã PIN"), "123456");
    expect(screen.getByLabelText("Nhập lại mã PIN").closest("label")).not.toHaveTextContent("Mã PIN nhập lại chưa khớp");
  });

  it("uses the concise duplicate-email message under email", async () => {
    const user = userEvent.setup(); const client = stubClient();
    client.registerLearner = vi.fn().mockRejectedValue(new Error("LEARNER_REGISTRATION_EMAIL_EXISTS"));
    render(<EntryScreen client={client} onAuthenticated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản người học" }));
    await user.type(screen.getByLabelText("Họ và tên"), "Học Viên"); await user.type(screen.getByLabelText("Email"), "used@e4s.local");
    await user.type(screen.getByLabelText("Mã PIN"), "123456"); await user.type(screen.getByLabelText("Nhập lại mã PIN"), "123456");
    await user.click(screen.getByRole("button", { name: "Đăng ký và bắt đầu" }));
    expect(await screen.findByText("Email này không khả dụng. Hãy dùng email khác.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email").closest("label")).toContainElement(screen.getByRole("alert"));
    await user.type(screen.getByLabelText("Email"), "x");
    expect(screen.queryByText("Email này không khả dụng. Hãy dùng email khác.")).not.toBeInTheDocument();
  });

  it("creates a valid learner account without an OTP step", async () => {
    const user = userEvent.setup(); const client = stubClient(); const authenticated = vi.fn();
    render(<EntryScreen client={client} onAuthenticated={authenticated} />);
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản người học" }));
    await user.type(screen.getByLabelText("Họ và tên"), "Nguyễn Minh Anh"); await user.type(screen.getByLabelText("Email"), "new@e4s.local");
    await user.type(screen.getByLabelText("Mã PIN"), "654321"); await user.type(screen.getByLabelText("Nhập lại mã PIN"), "654321");
    await user.click(screen.getByRole("button", { name: "Đăng ký và bắt đầu" }));
    expect(client.registerLearner).toHaveBeenCalledWith({ displayName: "Nguyễn Minh Anh", email: "new@e4s.local", pin: "654321" });
    expect(authenticated).toHaveBeenCalledWith(learnerSession);
  });

  it("runs forgot PIN through email OTP and saves a new six-digit PIN", async () => {
    const user = userEvent.setup(); const client = stubClient();
    render(<EntryScreen client={client} onAuthenticated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Quên mã PIN?" }));
    await user.type(screen.getByLabelText("Email"), "learner@e4s.local"); await user.click(screen.getByRole("button", { name: "Gửi mã qua email" }));
    await user.type(screen.getByLabelText("Mã xác minh"), "123456"); await user.click(screen.getByRole("button", { name: "Xác minh mã" }));
    await user.type(screen.getByLabelText("Mã PIN mới"), "789012"); await user.type(screen.getByLabelText("Nhập lại mã PIN"), "789012");
    await user.click(screen.getByRole("button", { name: "Lưu mã PIN mới" }));
    expect(client.completeLearnerPinReset).toHaveBeenCalledWith({ resetToken: "reset-token", pin: "789012" });
    expect(screen.getByText(/Đã cập nhật mã PIN/)).toBeInTheDocument();
  });

  it("lets staff send a generic password-help notification to the Manager", async () => {
    const user = userEvent.setup(); const client = stubClient();
    render(<EntryScreen client={client} onAuthenticated={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Nhân sự" }));
    await user.click(screen.getByRole("button", { name: "Quên mật khẩu?" }));
    expect(screen.getByRole("heading", { name: "Quên mật khẩu nhân sự" })).toBeInTheDocument();
    expect(screen.getByText("Tài khoản nhân sự")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "operator@e4s.local");
    await user.click(screen.getByRole("button", { name: "Thông báo cho Quản lý" }));
    expect(client.requestStaffPasswordHelp).toHaveBeenCalledWith({ email: "operator@e4s.local" });
    expect(screen.getByText("Nếu email thuộc tài khoản người vận hành, yêu cầu đã được gửi tới Quản lý.")).toBeInTheDocument();
  });
});
