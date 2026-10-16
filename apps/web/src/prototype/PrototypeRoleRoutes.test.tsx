// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RewardView, SessionView } from "@e4s/contracts";
import { PrototypeRoleRoutes } from "./PrototypeRoleRoutes.js";
import { learnerApiClient as apiClient } from "../api/learner.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const learner: SessionView = {
  user: { id: "learner-1", displayName: "Học viên Demo", email: null },
  role: "learner",
  permissions: ["learning:own"]
};

const operator: SessionView = {
  user: { id: "operator-1", displayName: "Vận hành Demo", email: null },
  role: "operator",
  permissions: ["content:operate"]
};

const manager: SessionView = {
  user: { id: "manager-1", displayName: "Quản lý Demo", email: null },
  role: "manager",
  permissions: ["content:operate", "report:read"]
};

function renderRoute(pathname: string, session: SessionView) {
  return render(<MemoryRouter initialEntries={[pathname]}><PrototypeRoleRoutes session={session} /></MemoryRouter>);
}

describe("PrototypeRoleRoutes authorization boundary", () => {
  it.each([
    ["/op/weeks", "Tài khoản này không có quyền mở khu vực vận hành."],
    ["/settings", "Tài khoản này không có quyền mở khu vực quản lý."],
    ["/mgr/report", "Tài khoản này không có quyền mở khu vực quản lý."]
  ])("shows an authorization fallback when a learner refreshes %s", (pathname, message) => {
    renderRoute(pathname, learner);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/home");
  });

  it.each(["/mgr/report", "/settings/private", "/reward/preview"])("shows an authorization fallback instead of silently redirecting Operator from %s", (pathname) => {
    renderRoute(pathname, operator);

    expect(screen.getByRole("alert")).toHaveTextContent("Tài khoản này không có quyền mở khu vực quản lý.");
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/op");
  });

  it("loads the learner reward preview instead of treating it as a Manager-only route", async () => {
    const reward: RewardView = {
      mode: "preview",
      learnerName: "Học viên Demo",
      cefr: "A2",
      cefrLabel: "A2 · Sơ cấp",
      points: 12,
      displayPoints: 60,
      season: { name: "Mùa hạ", description: "đón nắng" },
      simulated: true,
      earnedBadgeCount: 1,
      requiredBadgeCount: 8,
      printable: false,
      certificateNumber: "SE-PREVIEW",
      completedAt: "2026-10-15T09:00:00.000Z",
      organizationName: "GFT",
      operatorName: "Vận hành Demo",
      managerName: "Quản lý Demo",
      badges: []
    };
    const getReward = vi.spyOn(apiClient, "getReward").mockResolvedValue(reward);

    renderRoute("/reward/preview", learner);

    expect(await screen.findByRole("heading", { name: "Certificate of Completion" })).toBeInTheDocument();
    expect(getReward).toHaveBeenCalledWith("preview");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the learner reward preview accessible when the URL has a trailing slash", async () => {
    const reward: RewardView = {
      mode: "preview",
      learnerName: "Học viên Demo",
      cefr: "A2",
      cefrLabel: "A2 · Sơ cấp",
      points: 12,
      displayPoints: 60,
      season: { name: "Mùa hạ", description: "đón nắng" },
      simulated: true,
      earnedBadgeCount: 1,
      requiredBadgeCount: 8,
      printable: false,
      certificateNumber: "SE-PREVIEW",
      completedAt: "2026-10-15T09:00:00.000Z",
      organizationName: "GFT",
      operatorName: "Vận hành Demo",
      managerName: "Quản lý Demo",
      badges: []
    };
    vi.spyOn(apiClient, "getReward").mockResolvedValue(reward);

    renderRoute("/reward/preview/", learner);

    expect(await screen.findByRole("heading", { name: "Certificate of Completion" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("allows Operator to open the existing read-only Settings surface", () => {
    renderRoute("/settings", operator);

    expect(screen.getByRole("status")).toHaveTextContent("Đang tải cài đặt");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps Manager access to Operator routes", () => {
    renderRoute("/op/not-a-real-route", manager);

    expect(screen.getByRole("alert")).toHaveTextContent("Đường dẫn vận hành không tồn tại.");
    expect(screen.queryByText(/không có quyền/i)).not.toBeInTheDocument();
  });

  it("shows the existing not-found fallback for an unknown nested Manager route", () => {
    renderRoute("/mgr/not-a-real-route", manager);

    expect(screen.getByText("Không tìm thấy trang.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/mgr");
  });

  it("fails closed with feedback when the session carries an unknown runtime role", () => {
    const unknownRole = { ...operator, role: "auditor" } as unknown as SessionView;
    renderRoute("/settings", unknownRole);

    expect(screen.getByRole("alert")).toHaveTextContent("Vai trò tài khoản này không được hỗ trợ. Vui lòng quay lại trang bắt đầu.");
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
    expect(screen.queryByText("Đang tải cài đặt")).not.toBeInTheDocument();
  });
});
