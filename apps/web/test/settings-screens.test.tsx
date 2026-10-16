// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  currentSession: vi.fn(), logout: vi.fn(), getManagerAccounts: vi.fn(),
  getManagerSettings: vi.fn(), saveManagerSettings: vi.fn()
}));

vi.mock("../src/api-client.js", () => ({ apiClient: client }));

import { App } from "../src/App.js";

afterEach(cleanup);

beforeEach(() => {
  client.currentSession.mockResolvedValue({
    user: { id: "manager-1", displayName: "Quản lý Demo", email: "manager@e4s.local" },
    role: "manager", permissions: ["settings:manage"]
  });
  client.logout.mockResolvedValue(undefined);
  client.getManagerAccounts.mockResolvedValue({ organizationName: "GFT Demo", accounts: [] });
  client.getManagerSettings.mockResolvedValue({ organizationName: "GFT Demo", reminderInactiveDays: 3, weeklyReportEnabled: true });
  client.saveManagerSettings.mockResolvedValue({ organizationName: "GFT Demo", reminderInactiveDays: 5, weeklyReportEnabled: false });
});

describe("Manager safe settings", () => {
  it("shows and persists public reminder policy without a secret field", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Chính sách nhắc học và báo cáo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nhắc sau số ngày không hoạt động")).toHaveValue(3);
    expect(screen.queryByLabelText(/secret|api.?key|provider/i)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Nhắc sau số ngày không hoạt động"));
    await user.type(screen.getByLabelText("Nhắc sau số ngày không hoạt động"), "5");
    await user.click(screen.getByRole("button", { name: "Lưu chính sách" }));
    expect(client.saveManagerSettings).toHaveBeenCalledWith(expect.objectContaining({ reminderInactiveDays: 5, weeklyReportEnabled: true }));
  });
});
