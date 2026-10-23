// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagerLearnerProfileView, ManagerOperationsView, ManagerProgressView, ManagerProviderSettingsView, ManagerReportView, ManagerSettingsView, OperatorSettingsOverviewView, OrganisationExperienceView, ProductPreferencesView, SystemCapabilitiesView } from "@e4s/contracts";
import { managerApiClient as apiClient } from "../../api/manager.js";
import { operatorApiClient } from "../../api/operator.js";
import { MaintenanceConfirmationDialog, ManagerRouteController, PurgeConfirmationDialog } from "./ManagerRouteController.js";
import { RoleRoutes } from "../RoleRoutes.js";
import { ModalProvider } from "../shared/ModalProvider.js";
import { ThemeProvider } from "../shared/ThemeProvider.js";
import { ToastProvider } from "../shared/design-system.js";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.spyOn(apiClient, "getOrganisationExperience").mockResolvedValue(organisationExperience);
  vi.spyOn(apiClient, "saveOrganisationExperience").mockImplementation(async (input) => input);
  vi.spyOn(apiClient, "getManagerPinReports").mockResolvedValue({ reports: [] });
});

function renderManager(element: ReactElement) {
  return render(<ToastProvider><ModalProvider>{element}</ModalProvider></ToastProvider>);
}

describe("ManagerRouteController", () => {
  it("renders security activity as a compact notice instead of a raw bullet list", async () => {
    vi.mocked(apiClient.getManagerPinReports).mockResolvedValue({ reports: [{ id: "pin-1", subjectUserId: "learner-1", subjectName: "Media GFT", note: "Người học đã tự đổi PIN qua xác minh email.", status: "open", createdAt: "2026-10-23T08:39:09.000Z", resolvedAt: null }] });
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [] });

    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    const notice = await screen.findByRole("region", { name: "Thông báo bảo mật" });
    expect(notice).toHaveClass("manager-security-notices");
    expect(within(notice).getByRole("listitem")).toHaveClass("manager-security-notice");
    expect(within(notice).getByText("Media GFT")).toBeInTheDocument();
    expect(within(notice).getByText("Người học đã tự đổi PIN qua xác minh email.")).toBeInTheDocument();
    expect(within(notice).getByRole("time")).toHaveAttribute("dateTime", "2026-10-23T08:39:09.000Z");
  });

  it("reports an experience save failure and lets Settings restore the committed draft", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.saveOrganisationExperience).mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getOperatorSettingsOverview").mockResolvedValue({
      organizationName: "GFT",
      settings: managerSettings,
      pilot: { startDate: managerSettings.pilotStartDate, weeks: managerSettings.pilotWeeks, weekOverride: managerSettings.weekOverride, minMinutesPerDay: managerSettings.minMinutesPerDay, courseTheme: managerSettings.courseTheme, coachDailyLimit: managerSettings.coachDailyLimit },
      test: { timed: managerSettings.testTimed, times: managerSettings.testTimes, warnLimit: managerSettings.testWarnLimit },
      levelUp: managerSettings.levelUp,
      accounts: []
    });
    renderManager(<ThemeProvider><MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="operator" currentUserId="operator-1" /></MemoryRouter></ThemeProvider>);
    await screen.findByRole("heading", { name: "Cài đặt" });

    await user.click(screen.getByRole("radio", { name: "Mùa đông" }));
    await user.click(screen.getByRole("button", { name: "Lưu giao diện" }));

    const errorToast = await screen.findByRole("alert");
    expect(errorToast).toHaveTextContent("Không lưu được trải nghiệm tổ chức");
    expect(errorToast).toHaveClass("ds-toast", "ds-toast--danger");
    expect(document.querySelector(".settings-toast")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Tự động theo ngày" })).toBeChecked());
  });

  it("scrolls the active Manager header destination into view on tablet widths", async () => {
    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Điều hướng quản lý");
    const active = document.createElement("a");
    active.className = "active";
    active.href = "/mgr/reminders";
    active.textContent = "Nhắc học";
    nav.append(active);
    document.body.append(nav);

    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 827 });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    vi.spyOn(apiClient, "getManagerReminders").mockResolvedValue({
      organizationName: "GFT", inactiveDays: 3, webhookConfigured: false,
      candidates: [], history: []
    });

    try {
      renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
      await screen.findByText("Không ai cần nhắc hôm nay");
      expect(screen.getByRole("heading", { name: "Nhắc học" })).toBeInTheDocument();
      await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" }));
    } finally {
      nav.remove();
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("loads the real operations view for /mgr/ops", async () => {
    vi.spyOn(apiClient, "getManagerOperations").mockResolvedValue(operations);
    renderManager(<MemoryRouter initialEntries={["/mgr/ops"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await screen.findByText("1/2 bộ đã duyệt");
    expect(screen.getByRole("heading", { name: "Hiệu suất vận hành" })).toBeInTheDocument();
    expect(apiClient.getManagerOperations).toHaveBeenCalledOnce();
    expect(screen.getByText("1/2 bộ đã duyệt")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Mã PIN/ })).not.toBeInTheDocument();
  });

  it("mounts the full Manager-owned operations area inside Manager routes", async () => {
    vi.spyOn(operatorApiClient, "getContentPrompts").mockResolvedValue({ groups: [
      { key: "system_rules", label: "Quy tắc chung", content: "current", defaultContent: "default", version: 1, status: "active" }
    ] });
    const save = vi.spyOn(operatorApiClient, "saveContentPrompts");

    renderManager(<MemoryRouter initialEntries={["/mgr/ops/prompts"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Prompt & rubric" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu prompt" })).toBeEnabled();
    expect(save).not.toHaveBeenCalled();
  });

  it("opens Manager operations without an Operator preview banner", async () => {
    vi.spyOn(apiClient, "getManagerOperations").mockResolvedValue(operations);
    renderManager(<MemoryRouter initialEntries={["/mgr/ops"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    expect(await screen.findByText("1/2 bộ đã duyệt")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hiệu suất vận hành" })).toBeInTheDocument();
    expect(screen.queryByText(/chế độ xem của quản lý|chỉ xem|Operator/i)).not.toBeInTheDocument();
  });

  it("opens the real learner quick-view and shows Manager operational queues", async () => {
    vi.spyOn(apiClient, "getManagerProgress").mockResolvedValue(managerProgress);
    vi.spyOn(apiClient, "getManagerDeleteRequests").mockResolvedValue({ requests: [{ id: "delete-1", learnerId: "learner-1", learnerName: "Học viên Demo", reason: "Xin xoá", status: "pending", requestedBy: "operator-1", requestedAt: "2026-10-14T09:00:00.000Z" }] });
    vi.spyOn(apiClient, "getManagerTrash").mockResolvedValue({ accounts: [{ id: "trash-1", displayName: "Tài khoản cũ", email: "old@e4s.local", role: "learner", status: "deleted", deletedAt: "2026-10-14T09:00:00.000Z" }] });
    const profile: ManagerLearnerProfileView = { learner: { id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", status: "active", createdAt: "2026-10-01T09:00:00.000Z", currentLevel: "A2" }, profile: { goals: ["Giao tiếp"] }, metrics: { completedLessons: 4, totalLessons: 10, coachTurns: 6, studyDays: 3, rewardPoints: 20, lastActivityAt: "2026-10-14T09:00:00.000Z" } };
    const openProfile = vi.spyOn(apiClient, "getManagerLearnerProfile").mockResolvedValue(profile);
    renderManager(<MemoryRouter initialEntries={["/mgr"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await screen.findByRole("button", { name: "Hồ sơ Học viên Demo" });
    expect(screen.getByRole("heading", { name: "Tiến độ nhóm" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Yêu cầu xoá tài khoản/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Mã PIN/ })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Hồ sơ Học viên Demo" }));
    expect(openProfile).toHaveBeenCalledWith("learner-1");
    expect(await screen.findByRole("dialog")).toHaveTextContent("Học viên Demo");
    expect(screen.getByText("Giao tiếp")).toBeInTheDocument();
  });

  it("persists a manual reminder dismissal for a learner", async () => {
    vi.spyOn(apiClient, "getManagerReminders").mockResolvedValue({
      organizationName: "GFT", inactiveDays: 3, webhookConfigured: false,
      candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", lastActivityAt: null, missedDays: 3 }], history: []
    });
    const dismiss = vi.spyOn(apiClient, "dismissManagerReminder").mockResolvedValue({ reminderId: "reminder-1", learnerId: "learner-1", status: "dismissed" });
    renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await screen.findByRole("button", { name: "Đã nhắc qua kênh khác" });
    expect(screen.getByRole("heading", { name: "Nhắc học" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Đã nhắc qua kênh khác" }));
    expect(dismiss).toHaveBeenCalledWith("learner-1");
    expect((await screen.findByText("Đã ghi nhận đã nhắc qua kênh khác.")).closest(".ds-toast")).toHaveClass("ds-toast--ok");
  });

  it("reports a local reminder as recorded for manual sending", async () => {
    vi.spyOn(apiClient, "getManagerReminders").mockResolvedValue({
      organizationName: "GFT", inactiveDays: 3, webhookConfigured: false,
      candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", lastActivityAt: null, missedDays: 3 }], history: []
    });
    vi.spyOn(apiClient, "sendManagerReminder").mockResolvedValue({ reminderId: "reminder-1", learnerId: "learner-1", status: "queued", deliveryStatus: "queued", provider: "local_queue" });
    renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Ghi nhận gửi tay" }));
    const successToast = await screen.findByText(/Đã ghi nhận để gửi tay và lưu vào lịch sử/);
    expect(successToast.closest(".ds-toast")).toHaveClass("ds-toast--ok");
    expect(screen.getByRole("note")).toHaveTextContent("Chưa có webhook Base.vn");
    expect(screen.queryByText(/đã gửi qua Base/i)).not.toBeInTheDocument();
  });

  it("explains when reminder eligibility changed after loading", async () => {
    vi.spyOn(apiClient, "getManagerReminders").mockResolvedValue({
      organizationName: "GFT", inactiveDays: 3, webhookConfigured: true,
      candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", lastActivityAt: null, missedDays: 3 }], history: []
    });
    vi.spyOn(apiClient, "sendManagerReminder").mockRejectedValue(new Error("MANAGER_REMINDER_NOT_ELIGIBLE"));
    renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Gửi qua Base.vn" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Người học không còn đủ điều kiện nhắc");
  });

  it("keeps the manual reminder error state honest when the API rejects", async () => {
    vi.spyOn(apiClient, "getManagerReminders").mockResolvedValue({
      organizationName: "GFT", inactiveDays: 3, webhookConfigured: false,
      candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", lastActivityAt: null, missedDays: 3 }], history: []
    });
    vi.spyOn(apiClient, "dismissManagerReminder").mockRejectedValue(new Error("REMINDER_DISMISS_FAILED"));
    renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await screen.findByRole("button", { name: "Đã nhắc qua kênh khác" });
    expect(screen.getByRole("heading", { name: "Nhắc học" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Đã nhắc qua kênh khác" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không ghi nhận được trạng thái đã nhắc qua kênh khác.");
    expect(screen.queryByText("Không ghi nhận được nhắc qua kênh khác.")).not.toBeInTheDocument();
  });

  it("keeps the Manager route context visible when a route request fails", async () => {
    vi.spyOn(apiClient, "getManagerReminders").mockRejectedValue(new Error("REMINDERS_UNAVAILABLE"));
    renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được danh sách nhắc học.");
    expect(screen.getByRole("heading", { name: "Nhắc học" })).toBeInTheDocument();
  });

  it("keeps the Manager route heading visible while a route request is loading", () => {
    const request = vi.spyOn(apiClient, "getManagerReminders").mockReturnValue(new Promise(() => undefined));
    renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Nhắc học" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải danh sách nhắc học");
    request.mockRestore();
  });

  it("audits a successful reminder copy and refreshes the pending state", async () => {
    const reminders = {
      organizationName: "GFT", inactiveDays: 3, webhookConfigured: false,
      candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2" as const, lastActivityAt: null, missedDays: 3 }], history: []
    };
    const load = vi.spyOn(apiClient, "getManagerReminders").mockResolvedValue(reminders);
    const copy = vi.spyOn(apiClient, "copyManagerReminder").mockResolvedValue({ reminderId: "reminder-1", learnerId: "learner-1", status: "copied" });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await screen.findByRole("button", { name: "Copy tin nhắn" });
    expect(screen.getByRole("heading", { name: "Nhắc học" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Copy tin nhắn" }));
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith("learner-1"));
    expect(load).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("status")).toHaveTextContent("Đã copy tin nhắn");
  });

  it("does not load provider metadata after the PRD questions section is removed", async () => {
    vi.spyOn(apiClient, "getManagerReport").mockResolvedValue(managerReport);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    const provider = vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    renderManager(<MemoryRouter initialEntries={["/mgr/report"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Báo cáo tổng kết" });
    expect(screen.getByRole("heading", { name: "Báo cáo tổng kết" })).toBeInTheDocument();
    expect(provider).not.toHaveBeenCalled();
    expect(screen.queryByText(/qwen\/qwen3\.8-27b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/openai/)).not.toBeInTheDocument();
  });

  it("uses the app confirm modal for delete approval and restore", async () => {
    vi.spyOn(apiClient, "getManagerProgress").mockResolvedValue(managerProgress);
    vi.spyOn(apiClient, "getManagerDeleteRequests").mockResolvedValue({ requests: [{ id: "delete-1", learnerId: "learner-1", learnerName: "Học viên Demo", reason: "Xin xoá", status: "pending", requestedBy: "operator-1", requestedAt: "2026-10-14T09:00:00.000Z" }] });
    vi.spyOn(apiClient, "getManagerTrash").mockResolvedValue({ accounts: [{ id: "trash-1", displayName: "Tài khoản cũ", email: "old@e4s.local", role: "learner", status: "deleted", deletedAt: "2026-10-14T09:00:00.000Z" }] });
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [] });
    vi.spyOn(apiClient, "getManagerReminders").mockResolvedValue({ organizationName: "GFT", inactiveDays: 3, candidates: [], history: [] });
    const decide = vi.spyOn(apiClient, "decideManagerDeleteRequest").mockResolvedValue({ id: "delete-1", learnerId: "learner-1", learnerName: "Học viên Demo", reason: "Xin xoá", status: "approved", requestedBy: "operator-1", requestedAt: "2026-10-14T09:00:00.000Z", decidedAt: "2026-10-15T09:00:00.000Z", note: "Đã xác nhận từ hàng đợi Quản lý." });
    const restore = vi.spyOn(apiClient, "restoreManagerTrashAccount").mockResolvedValue({ id: "trash-1", displayName: "Tài khoản cũ", email: "old@e4s.local", role: "learner", status: "active", createdAt: "2026-10-01T09:00:00.000Z" });
    const user = userEvent.setup();
    renderManager(<MemoryRouter initialEntries={["/mgr"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await screen.findByRole("button", { name: "Duyệt xoá" });
    expect(screen.getByRole("heading", { name: "Tiến độ nhóm" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Duyệt xoá" }));
    const approval = await screen.findByRole("dialog", { name: "Duyệt xoá tài khoản" });
    expect(approval).toHaveTextContent("Học viên Demo");
    await user.click(within(approval).getByRole("button", { name: "Duyệt xoá" }));
    await new Promise((resolve) => setTimeout(resolve, 5_200));
    expect(decide).toHaveBeenCalledWith("delete-1", { status: "approved", note: "Đã xác nhận từ hàng đợi Quản lý." });

    cleanup();
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Người dùng" })).toBeInTheDocument();
    await user.click(screen.getByText(/Khôi phục tài khoản/));
    await user.click(await screen.findByRole("button", { name: "Khôi phục" }));
    const restoreDialog = await screen.findByRole("dialog", { name: "Khôi phục tài khoản" });
    await user.click(within(restoreDialog).getByRole("button", { name: "Khôi phục" }));
    expect(restore).toHaveBeenCalledWith("trash-1");
  }, 15_000);

  it("uses the app prompt modal for Manager password reset", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [{ id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", role: "learner", status: "active", createdAt: "2026-10-01T09:00:00.000Z" }] });
    const reset = vi.spyOn(apiClient, "resetManagerAccountPassword").mockResolvedValue({ saved: true });
    const user = userEvent.setup();
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await screen.findByRole("button", { name: "Đặt lại mật khẩu" });
    expect(screen.getByRole("heading", { name: "Cài đặt" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Đặt lại mật khẩu" }));
    const prompt = await screen.findByRole("dialog", { name: "Mật khẩu mới cho Học viên Demo" });
    await user.type(within(prompt).getByLabelText("Mật khẩu mới"), "new-password");
    await user.click(within(prompt).getByRole("button", { name: "Đặt lại mật khẩu" }));
    await vi.waitFor(() => expect(reset).toHaveBeenCalledWith("learner-1", "new-password"));
  });

  it("requires Manager confirmation before deleting an account", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [{ id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", role: "learner", status: "active", createdAt: "2026-10-01T09:00:00.000Z" }] });
    const remove = vi.spyOn(apiClient, "updateManagerAccountStatus").mockResolvedValue({ id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", role: "learner", status: "deleted", createdAt: "2026-10-01T09:00:00.000Z" });
    const user = userEvent.setup();
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Người dùng" })).toBeInTheDocument();
    expect(document.querySelector(".settings-action-table")).not.toHaveClass("manager-action-table");

    await user.click(screen.getByRole("button", { name: "Xoá" }));
    const dialog = await screen.findByRole("dialog", { name: "Xoá tài khoản?" });
    expect(dialog).toHaveTextContent("Học viên Demo");
    expect(remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Huỷ" }));
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Xoá" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Xoá tài khoản?" })).getByRole("button", { name: "Xoá tài khoản" }));
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith("learner-1", "deleted"));
  });

  it("requires confirmation for account role/status changes and keeps API errors visible", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    const accounts = { organizationName: "GFT", accounts: [
      { id: "manager-1", displayName: "Quản lý Demo", email: "manager@e4s.local", role: "manager", status: "active", createdAt: "2026-10-01T09:00:00.000Z" },
      { id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", role: "learner", status: "active", createdAt: "2026-10-01T09:00:00.000Z" }
    ] } as const;
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue(accounts);
    const changeRole = vi.spyOn(apiClient, "updateManagerAccountRole").mockResolvedValue({ ...accounts.accounts[1], role: "operator" });
    const lock = vi.spyOn(apiClient, "updateManagerAccountStatus").mockRejectedValue(new Error("ACCOUNT_UPDATE_FAILED"));
    const user = userEvent.setup();
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Người dùng" })).toBeInTheDocument();
    const roleSelect = screen.getByRole("combobox", { name: "Vai trò Học viên Demo" });
    await user.selectOptions(roleSelect, "operator");
    const roleDialog = await screen.findByRole("dialog", { name: "Đổi vai trò tài khoản?" });
    expect(changeRole).not.toHaveBeenCalled();
    await user.click(within(roleDialog).getByRole("button", { name: "Huỷ" }));
    expect(changeRole).not.toHaveBeenCalled();

    await user.selectOptions(roleSelect, "operator");
    await user.click(within(await screen.findByRole("dialog", { name: "Đổi vai trò tài khoản?" })).getByRole("button", { name: "Đổi vai trò" }));
    await vi.waitFor(() => expect(changeRole).toHaveBeenCalledWith("learner-1", "operator"));

    const learnerRow = roleSelect.closest("tr");
    expect(learnerRow).not.toBeNull();
    await user.click(within(learnerRow as HTMLElement).getByRole("button", { name: "Khoá" }));
    const lockDialog = await screen.findByRole("dialog", { name: "Khoá tài khoản?" });
    expect(lock).not.toHaveBeenCalled();
    await user.click(within(lockDialog).getByRole("button", { name: "Khoá tài khoản" }));
    await vi.waitFor(() => expect(lock).toHaveBeenCalledWith("learner-1", "disabled"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không cập nhật được tài khoản.");
    expect(screen.getByRole("combobox", { name: "Vai trò Quản lý Demo" })).toBeDisabled();
    expect(screen.getByTitle("Không thể khoá tài khoản đang đăng nhập")).toBeDisabled();
  });

  it("shows server feedback for Manager account creation", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [] });
    const create = vi.spyOn(apiClient, "createManagerAccount")
      .mockRejectedValueOnce(new Error("EMAIL_EXISTS"))
      .mockResolvedValueOnce({ id: "created-1", displayName: "Người mới", email: "new@e4s.local", role: "learner", status: "active", createdAt: "2026-10-15T09:00:00.000Z" });
    const user = userEvent.setup();
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Người dùng" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tạo tài khoản mới" })).toBeInTheDocument();
    expect(screen.getByLabelText("Vai trò")).toHaveValue("learner");
    expect(screen.getByText(/Người học có thể đăng nhập ngay bằng email và mật khẩu ban đầu/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Tên"), "Người mới");
    await user.type(screen.getByLabelText("Email"), "new@e4s.local");
    await user.type(screen.getByLabelText("Mật khẩu ban đầu"), "password-123");
    await user.click(screen.getByRole("button", { name: "+ Thêm người dùng" }));
    const createError = await screen.findByRole("alert");
    expect(createError).toHaveTextContent("Không tạo được tài khoản.");
    expect(createError).toHaveClass("ds-toast", "ds-toast--danger");
    expect(document.querySelector(".settings-toast")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ Thêm người dùng" }));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const created = await screen.findByText("Đã tạo tài khoản.", { exact: true });
    expect(created.closest(".ds-toast")).toHaveClass("ds-toast--ok");
  });

  it("reveals and hides the initial password without losing its value", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [] });
    const user = userEvent.setup();
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    const password = await screen.findByLabelText("Mật khẩu ban đầu");
    await user.type(password, "password-123");
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Hiện mật khẩu ban đầu" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("password-123");
    await user.click(screen.getByRole("button", { name: "Ẩn mật khẩu ban đầu" }));
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("password-123");
  });

  it("renders account administration with scoped responsive layout regions", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [{ id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", role: "learner", status: "active", createdAt: "2026-10-01T09:00:00.000Z" }] });
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    const form = await screen.findByRole("heading", { name: "Tạo tài khoản mới" }).then((heading) => heading.closest("form"));
    expect(form).toHaveClass("manager-account-create");
    expect(form?.querySelector(".manager-account-create__grid")).toBeInTheDocument();
    expect(form?.querySelector(".manager-account-create__submit")).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveClass("manager-accounts-table__table");
    expect(screen.getByRole("group", { name: "Thao tác tài khoản Học viên Demo" })).toHaveClass("manager-account-actions");
    expect(screen.getByText(/Khôi phục tài khoản/).closest("details")).toHaveClass("settings-recovery");
  });

  it("shows the complete organisation account directory inside the bounded table", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    const getAccounts = vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({
      organizationName: "GFT",
      accounts: Array.from({ length: 18 }, (_, index) => ({
        id: `learner-${index + 1}`,
        displayName: `Học viên ${index + 1}`,
        email: `learner-${index + 1}@e4s.local`,
        role: (index === 0 ? "manager" : index === 1 ? "operator" : "learner") as "manager" | "operator" | "learner",
        status: "active" as const,
        createdAt: "2026-10-01T09:00:00.000Z"
      }))
    });
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    const table = await screen.findByRole("table");
    expect(screen.getByText("18 tài khoản")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(19);
    expect(screen.getByRole("combobox", { name: "Vai trò Học viên 9" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Thao tác tài khoản Học viên 18" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Xem thêm/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thu gọn" })).not.toBeInTheDocument();
    expect(getAccounts).toHaveBeenCalledOnce();
    expect(screen.getByText(/Khôi phục tài khoản/).closest("details")).toHaveClass("settings-recovery");
  });

  it("uses Manager copy for account status states while protecting the signed-in account", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [
      { id: "manager-1", displayName: "Quản lý Demo", email: "manager@e4s.local", role: "manager", status: "active", createdAt: "2026-10-01T09:00:00.000Z" },
      { id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", role: "learner", status: "disabled", createdAt: "2026-10-01T09:00:00.000Z" },
      { id: "learner-2", displayName: "Tài khoản cũ", email: "old@e4s.local", role: "learner", status: "deleted", createdAt: "2026-10-01T09:00:00.000Z" }
    ] });
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Người dùng" })).toBeInTheDocument();
    expect(screen.getByText("Đang hoạt động")).toBeInTheDocument();
    expect(screen.getByText("Đã khoá")).toBeInTheDocument();
    expect(screen.getByText("Đã xoá")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Khoá" })).toBeDisabled();
  });

  it("exposes a Manager-only purge action for deleted accounts", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [] });
    vi.spyOn(apiClient, "getManagerTrash").mockResolvedValue({ accounts: [{ id: "trash-1", displayName: "Tài khoản cũ", email: "old@e4s.local", role: "learner", status: "deleted", deletedAt: "2026-10-14T09:00:00.000Z" }] });
    const confirmation = vi.spyOn(apiClient, "requestManagerTrashPurgeConfirmation").mockResolvedValue({ accountId: "trash-1", token: "server-token", confirmationPhrase: "XOA VINH VIEN", countdownSeconds: 5, expiresAt: "2026-10-15T09:01:00.000Z" });
    const purge = vi.spyOn(apiClient, "purgeManagerTrashAccount").mockResolvedValue(undefined);
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Người dùng" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText(/Khôi phục tài khoản/));
    expect(await screen.findByRole("heading", { name: /^Tài khoản đã duyệt xoá/ })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Xoá vĩnh viễn" }));
    expect(confirmation).toHaveBeenCalledWith("trash-1");
    expect(screen.getByRole("dialog", { name: "Xác nhận xoá vĩnh viễn" })).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Xác nhận xoá vĩnh viễn" });
    expect(within(dialog).getByText(/Thông tin đăng nhập và dữ liệu cá nhân sẽ bị xoá; lịch sử học được giữ ẩn danh/)).toBeInTheDocument();
    expect(dialog.querySelector(".manager-purge-dialog__actions")).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Xoá vĩnh viễn tài khoản" })).toBeDisabled();
    expect(purge).not.toHaveBeenCalled();
  });

  it("keeps purge disabled until the server countdown and exact phrase are satisfied", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<PurgeConfirmationDialog accountName="Tài khoản cũ" confirmation={{ accountId: "trash-1", token: "server-token", confirmationPhrase: "XOA VINH VIEN", countdownSeconds: 5, expiresAt: "2026-10-15T09:01:00.000Z" }} busy={false} onCancel={vi.fn()} onConfirm={onConfirm} />);
    const confirm = screen.getByRole("button", { name: "Xoá vĩnh viễn tài khoản" });
    expect(confirm).toBeDisabled();
    for (let tick = 0; tick < 5; tick += 1) {
      await act(async () => { vi.advanceTimersByTime(1_000); await Promise.resolve(); });
    }
    fireEvent.change(screen.getByRole("textbox", { name: "Cụm từ xác nhận" }), { target: { value: "XOA VINH VIEN" } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("XOA VINH VIEN");
  });

  it("requires the maintenance countdown and server backup phrase", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<MaintenanceConfirmationDialog confirmation={{ action: "wipe_data", token: "maintenance-token", confirmationPhrase: "XOA TOAN BO", countdownSeconds: 5, expiresAt: "2026-10-15T09:01:00.000Z", backupId: "backup-1" }} busy={false} onCancel={vi.fn()} onConfirm={onConfirm} />);
    const confirm = screen.getByRole("button", { name: "Xoá toàn bộ" });
    expect(confirm).toBeDisabled();
    for (let tick = 0; tick < 5; tick += 1) {
      await act(async () => { vi.advanceTimersByTime(1_000); await Promise.resolve(); });
    }
    fireEvent.change(screen.getByRole("textbox", { name: "Cụm từ xác nhận dữ liệu" }), { target: { value: "XOA TOAN BO" } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("XOA TOAN BO");
  });

  it("opens the staff certificate preview from the Manager reward simulator", async () => {
    renderManager(<MemoryRouter initialEntries={["/reward/preview"]}><RoleRoutes session={{ user: { id: "manager-1", displayName: "Quản lý Demo", email: null }, role: "manager", permissions: [] }} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Certificate of Completion" })).toBeInTheDocument();
    expect(screen.getByText(/Bản xem trước/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Quay lại" })).toHaveAttribute("href", "/mgr/rewards");
  });

  it("shows operator-owned settings and hides Manager-only organization configuration", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    const getProvider = vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getOperatorSettingsOverview").mockResolvedValue({
      organizationName: "GFT",
      settings: managerSettings,
      pilot: { startDate: managerSettings.pilotStartDate, weeks: managerSettings.pilotWeeks, weekOverride: managerSettings.weekOverride, minMinutesPerDay: managerSettings.minMinutesPerDay, courseTheme: managerSettings.courseTheme, coachDailyLimit: managerSettings.coachDailyLimit },
      test: { timed: managerSettings.testTimed, times: managerSettings.testTimes, warnLimit: managerSettings.testWarnLimit },
      levelUp: managerSettings.levelUp,
      accounts: []
    } satisfies OperatorSettingsOverviewView);
    const saveProduct = vi.spyOn(apiClient, "saveProductPreferences").mockResolvedValue({ ...product, theme: "winter" });
    const saveExperience = vi.mocked(apiClient.saveOrganisationExperience);
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="operator" currentUserId="operator-1" /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Cài đặt" });
    expect(screen.getByRole("heading", { name: "Cài đặt" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tùy chọn cá nhân" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Hiệu ứng âm thanh" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Nhạc nền" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kiểm tra kết nối" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kết nối AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Prompt & rubric" })).not.toBeInTheDocument();
    expect(getProvider).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nguồn ảnh")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Chủ đề giao diện (áp dụng ngay khi chọn)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu giao diện" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu nhạc nền" })).toBeInTheDocument();
    expect(saveProduct).not.toHaveBeenCalled();
    expect(saveExperience).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: "Mùa đông" }));
    await user.click(screen.getByRole("button", { name: "Lưu giao diện" }));
    expect(saveExperience).toHaveBeenCalledWith({ theme: "winter", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 22 } });
    expect(saveProduct).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Dữ liệu" })).not.toBeInTheDocument();
  });

  it("keeps Operator settings usable while an older API lacks organisation experience", async () => {
    vi.mocked(apiClient.getOrganisationExperience).mockRejectedValueOnce(new Error("404"));
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getOperatorSettingsOverview").mockResolvedValue({
      organizationName: "GFT",
      settings: managerSettings,
      pilot: { startDate: managerSettings.pilotStartDate, weeks: managerSettings.pilotWeeks, weekOverride: managerSettings.weekOverride, minMinutesPerDay: managerSettings.minMinutesPerDay, courseTheme: managerSettings.courseTheme, coachDailyLimit: managerSettings.coachDailyLimit },
      test: { timed: managerSettings.testTimed, times: managerSettings.testTimes, warnLimit: managerSettings.testWarnLimit },
      levelUp: managerSettings.levelUp,
      accounts: []
    });

    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="operator" currentUserId="operator-1" /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Giao diện theo mùa / lễ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nhạc nền của Season" })).toBeInTheDocument();
    expect(screen.queryByText("Không tải được cấu hình hệ thống.")).not.toBeInTheDocument();
  });
});

const managerSettings = {
  organizationName: "GFT", programName: "E4S Pilot", reminderInactiveDays: 3, weeklyReportEnabled: true,
  pilotStartDate: "2026-10-12", pilotWeeks: 2, weekOverride: 0, minMinutesPerDay: 15,
  courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20,
  testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3,
  levelUp: { days: 14, lessons: 90, firstTry: 75, submission: 80, coach: 4, coachTurns: 6, wrong: 30, minParts: 4 },
  backgroundMusic: { enabled: true, url: "", volume: 22 }, baseWebhookUrl: "", baseWebhookTemplate: "{}"
} satisfies ManagerSettingsView;
const organisationExperience = { theme: "auto", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 22 } } satisfies OrganisationExperienceView;
const managerProvider = {
  provider: "openai", configured: true, baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo",
  capabilities: { chat: true, structuredOutput: true, speechToText: true }, lastTest: { status: "success", testedAt: "2026-10-15T09:00:00.000Z", code: null }
} satisfies ManagerProviderSettingsView;
const operations: ManagerOperationsView = {
  organizationName: "GFT", currentWeek: 1, pilotWeeks: 2,
  content: { draft: 1, inReview: 0, published: 1 }, queues: { assessmentReview: 0, practiceReview: 0 }, automation: { pendingJobs: 0, aiFailures: 0 }, recentActivity: [],
  readiness: { requiredSets: 2, readySets: 1, missing: [{ week: 1, cefr: "B1", state: "missing" }], orphanLegacySets: 0 }, operators: []
};
const product: ProductPreferencesView = { theme: "auto", vocabImageSource: "wikimedia" };
const capabilities: SystemCapabilitiesView = { api: true, database: true, ai: true, objectStorage: true, imageProviders: { pexels: false, pixabay: false } };
const managerProgress: ManagerProgressView = {
  organizationName: "GFT", currentWeek: 1, pilotWeeks: 2,
  summary: { learnerCount: 1, activeLearnersThisWeek: 1, completedLessons: 4, pendingAssessments: 0, completedLearners: 0, surveyCount: 0, satisfactionAverage: null },
  learners: [{ learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", completedLessons: 4, totalLessonsThisWeek: 5, sessionsThisWeek: 2, coachTurnsThisWeek: 3, weeklyPracticeScore: null, weeklyPracticeStatus: "not_submitted", rewardPoints: 20, earnedBadges: [], placementScore: 60, missedDays: 0, lastActivityAt: "2026-10-14T09:00:00.000Z" }]
};
const managerReport = {
  organizationName: "GFT", generatedAt: "2026-10-15T09:00:00.000Z", currentWeek: 1, pilotWeeks: 2,
  progress: managerProgress.summary, learners: managerProgress.learners, activityByDay: [], regularByWeek: [], levelDistribution: [],
  totals: { approvedLessonSets: 1, approvedLessons: 5, coachTurns: 2, practiceSubmissions: 1, reviewedPracticeSubmissions: 1, reminders: 1, appeals: 0, pendingAppeals: 0 },
  surveyResponses: [], operations: { content: operations.content, queues: operations.queues, automation: operations.automation }
} satisfies ManagerReportView;
