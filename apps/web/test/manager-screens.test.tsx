// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  currentSession: vi.fn(),
  logout: vi.fn(),
  getManagerProgress: vi.fn(),
  getManagerOperations: vi.fn(),
  getManagerAccounts: vi.fn(),
  updateManagerAccountRole: vi.fn(),
  getManagerReminders: vi.fn(),
  sendManagerReminder: vi.fn(),
  getManagerReport: vi.fn(),
  getManagerSettings: vi.fn(),
  saveManagerSettings: vi.fn()
}));

vi.mock("../src/api-client.js", () => ({ apiClient: client }));

import { App } from "../src/App.js";

afterEach(cleanup);

const managerSession = {
  user: { id: "manager-1", displayName: "Quản lý Demo", email: "manager@e4s.local" },
  role: "manager" as const,
  permissions: ["content:operate", "assessment:review", "prompt:manage", "account:manage"]
};

beforeEach(() => {
  client.currentSession.mockResolvedValue(managerSession);
  client.logout.mockResolvedValue(undefined);
  client.getManagerProgress.mockResolvedValue({
    organizationName: "GFT Demo",
    summary: { learnerCount: 1, activeLearnersThisWeek: 1, completedLessons: 1, pendingAssessments: 0 },
    learners: [{ learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", completedLessons: 1, lastActivityAt: "2026-10-14T09:00:00.000Z" }]
  });
  client.getManagerOperations.mockResolvedValue({
    organizationName: "GFT Demo",
    content: { draft: 0, inReview: 0, published: 1 },
    queues: { assessmentReview: 0, practiceReview: 0 },
    automation: { pendingJobs: 0, aiFailures: 0 },
    recentActivity: []
  });
  client.getManagerAccounts.mockResolvedValue({
    organizationName: "GFT Demo",
    accounts: [
      { id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", role: "learner", status: "active", createdAt: "2026-10-14T09:00:00.000Z" },
      { id: "operator-1", displayName: "Thư Demo", email: "operator@e4s.local", role: "operator", status: "active", createdAt: "2026-10-14T09:00:00.000Z" }
    ]
  });
  client.updateManagerAccountRole.mockResolvedValue({
    id: "operator-1", displayName: "Thư Demo", email: "operator@e4s.local", role: "manager", status: "active", createdAt: "2026-10-14T09:00:00.000Z"
  });
  client.getManagerReminders.mockResolvedValue({
    organizationName: "GFT Demo", inactiveDays: 3,
    candidates: [{ learnerId: "learner-2", learnerName: "Học viên Cần nhắc", cefr: "A2", lastActivityAt: null }]
  });
  client.sendManagerReminder.mockResolvedValue({ reminderId: "reminder-1", learnerId: "learner-2", status: "queued" });
  client.getManagerReport.mockResolvedValue({
    organizationName: "GFT Demo", generatedAt: "2026-10-14T09:00:00.000Z",
    progress: { learnerCount: 2, activeLearnersThisWeek: 1, completedLessons: 1, pendingAssessments: 0 },
    operations: { content: { draft: 0, inReview: 0, published: 1 }, queues: { assessmentReview: 0, practiceReview: 0 }, automation: { pendingJobs: 0, aiFailures: 0 } }
  });
  client.getManagerSettings.mockResolvedValue({ organizationName: "GFT Demo", reminderInactiveDays: 3, weeklyReportEnabled: true });
  client.saveManagerSettings.mockResolvedValue({ organizationName: "GFT Demo", reminderInactiveDays: 5, weeklyReportEnabled: false });
});

describe("Manager screens", () => {
  it("replaces the pending Manager progress placeholder with organisation data", async () => {
    window.history.pushState({}, "", "/mgr");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Tiến độ nhóm" })).toBeInTheDocument();
    expect(screen.getByText("Học viên Demo")).toBeInTheDocument();
    expect(screen.getByText("1 người học")).toBeInTheDocument();
    expect(screen.queryByText(/đang chờ kết nối dữ liệu/i)).not.toBeInTheDocument();
  });

  it("replaces the pending operations placeholder with live operational counts", async () => {
    window.history.pushState({}, "", "/mgr/ops");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Tổng quan vận hành" })).toBeInTheDocument();
    expect(screen.getByText("1/1 bộ đã duyệt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tiến độ/ })).not.toHaveAttribute("data-permission-status", "pending");
  });

  it("places Manager account roles inside the existing Settings screen", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Quản lý tài khoản và phân quyền" })).toBeInTheDocument();
    expect(screen.getByText("Học viên Demo")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Vai trò của Thư Demo"), "manager");
    expect(client.updateManagerAccountRole).toHaveBeenCalledWith("operator-1", "manager");
  });

  it("replaces the reminder placeholder with an auditable learner action", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/mgr/reminders");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Nhắc học" })).toBeInTheDocument();
    expect(screen.getByText("Học viên Cần nhắc")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gửi qua Base.vn" }));
    expect(client.sendManagerReminder).toHaveBeenCalledWith("learner-2", expect.any(String));
  });

  it("replaces the report placeholder with organisation totals", async () => {
    window.history.pushState({}, "", "/mgr/report");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Báo cáo tổ chức" })).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Học viên: 2 đang học");
  });
});
