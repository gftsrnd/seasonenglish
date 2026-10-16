// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryScreen, type AuthClient, type SessionView } from "../src/features/auth/entry-screen.js";

const learnerSession: SessionView = {
  user: { id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local" },
  role: "learner",
  permissions: ["learning:own"]
};

afterEach(cleanup);

describe("approved entry screen", () => {
  it("shows learner and staff paths without a role chooser", () => {
    const client = stubClient();
    render(<EntryScreen client={client} onAuthenticated={() => undefined} />);

    expect(screen.getByRole("heading", { name: /học tiếng anh cho công việc/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /đăng nhập người học/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dành cho nhân sự/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dùng thử/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/chọn vai trò/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("sends only learner credentials and trusts the returned account role", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    const onAuthenticated = vi.fn();
    render(<EntryScreen client={client} onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText(/email/i), "learner@e4s.local");
    await user.type(screen.getByLabelText(/mật khẩu/i), "learner-pass");
    await user.click(screen.getByRole("button", { name: /đăng nhập người học/i }));

    expect(client.learnerLogin).toHaveBeenCalledWith({
      email: "learner@e4s.local",
      password: "learner-pass"
    });
    expect(onAuthenticated).toHaveBeenCalledWith(learnerSession);
  });

  it("switches the staff form in place without adding a route", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    render(<EntryScreen client={client} onAuthenticated={() => undefined} />);

    await user.click(screen.getByRole("button", { name: /dành cho nhân sự/i }));
    expect(screen.getByRole("button", { name: /đăng nhập nhân sự/i })).toBeInTheDocument();

  });

  it("shows the exact pending action and blocks every competing auth action", async () => {
    const user = userEvent.setup();
    let resolveLogin!: (session: SessionView) => void;
    const client = stubClient();
    client.learnerLogin = vi.fn(() => new Promise<SessionView>((resolve) => { resolveLogin = resolve; }));
    render(<EntryScreen client={client} onAuthenticated={() => undefined} />);

    await user.type(screen.getByLabelText(/email/i), "learner@e4s.local");
    await user.type(screen.getByLabelText(/mật khẩu/i), "learner-pass");
    await user.click(screen.getByRole("button", { name: /đăng nhập người học/i }));

    expect(screen.getByRole("button", { name: "Đang đăng nhập…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dành cho nhân sự" })).toBeDisabled();

    resolveLogin(learnerSession);
  });

  it("clears the stale message before retrying", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    client.learnerLogin = vi.fn().mockRejectedValue(new Error("invalid credentials"));
    render(<EntryScreen client={client} onAuthenticated={() => undefined} />);

    await user.type(screen.getByLabelText(/email/i), "learner@e4s.local");
    await user.type(screen.getByLabelText(/mật khẩu/i), "wrong-pass");
    await user.click(screen.getByRole("button", { name: /đăng nhập người học/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể đăng nhập. Vui lòng kiểm tra email và mật khẩu.");

  });
});

function stubClient(): AuthClient {
  return {
    learnerLogin: vi.fn().mockResolvedValue(learnerSession),
    staffLogin: vi.fn().mockResolvedValue(learnerSession)
  };
}
