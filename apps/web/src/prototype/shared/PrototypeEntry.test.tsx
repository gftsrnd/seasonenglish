// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "@e4s/contracts";
import type { AuthClient } from "../../features/auth/index.js";
import { PrototypeEntry } from "./PrototypeEntry.js";

const learnerSession: SessionView = {
  user: { id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local" },
  role: "learner",
  permissions: ["learning:own"]
};

afterEach(cleanup);

function stubClient(): AuthClient {
  return {
    learnerLogin: vi.fn().mockRejectedValue(new Error("invalid credentials")),
    staffLogin: vi.fn().mockResolvedValue(learnerSession)
  };
}

describe("PrototypeEntry interaction", () => {
  it("clears a stale learner error and focuses email when switching to staff", async () => {
    const user = userEvent.setup();
    const client = stubClient();
    render(<PrototypeEntry client={client} onAuthenticated={() => undefined} />);

    await user.type(screen.getByLabelText("Email"), "wrong@example.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Đăng nhập người học" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể đăng nhập");
    await user.click(screen.getByRole("tab", { name: "Nhân sự" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "prototype-login-staff-tab");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Mật khẩu")).toHaveValue("");
  });
});
