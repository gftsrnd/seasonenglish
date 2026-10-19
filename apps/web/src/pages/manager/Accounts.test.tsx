// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagerAccountsView } from "@e4s/contracts";
import { ManagerAccounts } from "./Accounts.js";

afterEach(cleanup);

const view: ManagerAccountsView = {
  organizationName: "GFT",
  accounts: [{ id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", role: "learner", status: "active", createdAt: "2026-10-01T09:00:00.000Z" }]
};

describe("ManagerAccounts", () => {
  it("uses the app confirmation modal for account deletion", async () => {
    const user = userEvent.setup();
    const onChangeStatus = vi.fn().mockResolvedValue(undefined);
    render(<ManagerAccounts view={view} currentUserId="manager-1" onChangeRole={vi.fn()} onCreate={vi.fn()} onChangeStatus={onChangeStatus} onResetPassword={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Xóa tài khoản" }));
    const dialog = await screen.findByRole("dialog", { name: "Xóa quyền truy cập" });
    expect(dialog).toHaveTextContent("Học viên Demo");
    await user.click(within(dialog).getByRole("button", { name: "Xóa tài khoản" }));
    await new Promise((resolve) => setTimeout(resolve, 5_200));
    expect(onChangeStatus).toHaveBeenCalledWith("learner-1", "deleted");
  }, 10_000);
});
