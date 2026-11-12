// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagerLearnerProfileView, ManagerOperationsView, ManagerMonthlyOverviewView, ManagerProgressView, ManagerProviderSettingsView, ManagerSettingsView, OperatorSettingsOverviewView, OrganisationExperienceView, ProductPreferencesView, SystemCapabilitiesView } from "@e4s/contracts";
import { managerApiClient as apiClient } from "../../api/manager.js";
import { MaintenanceConfirmationDialog, ManagerRouteController, PurgeConfirmationDialog } from "./ManagerRouteController.js";
import { RoleRoutes } from "../RoleRoutes.js";
import { ModalProvider } from "../shared/ModalProvider.js";
import { ThemeProvider } from "../shared/ThemeProvider.js";
import { ToastProvider } from "../shared/design-system.js";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.spyOn(apiClient, "getManagerProgress").mockResolvedValue(progressView);
  vi.spyOn(apiClient, "getOrganisationExperience").mockResolvedValue(organisationExperience);
  vi.spyOn(apiClient, "saveOrganisationExperience").mockImplementation(async (input) => input);
  vi.spyOn(apiClient, "getManagerPinReports").mockResolvedValue({ reports: [] });
  vi.spyOn(apiClient, "getManagerComplaints").mockResolvedValue({ complaints: [] });
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

  it("shows two newest security notices by default and preserves grouped history when expanded", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.getManagerPinReports).mockResolvedValue({ reports: [
      { id: "pin-oldest", subjectUserId: "learner-4", subjectName: "Học viên Cũ", note: "Người học đã tự đổi PIN qua xác minh email.", status: "open", createdAt: "2026-10-23T08:00:00.000Z", resolvedAt: null },
      { id: "pin-third", subjectUserId: "learner-3", subjectName: "Học viên Ba", note: "Người học đã tự đổi PIN qua xác minh email.", status: "open", createdAt: "2026-10-28T08:18:00.000Z", resolvedAt: null },
      { id: "pin-second", subjectUserId: "learner-2", subjectName: "Học viên Hai", note: "Người học đã tự đổi PIN qua xác minh email.", status: "open", createdAt: "2026-10-28T08:19:00.000Z", resolvedAt: null },
      { id: "pin-latest-older-copy", subjectUserId: "learner-1", subjectName: "Học viên Một", note: "Người học đã tự đổi PIN qua xác minh email.", status: "open", createdAt: "2026-10-28T08:20:00.000Z", resolvedAt: null },
      { id: "pin-latest", subjectUserId: "learner-1", subjectName: "Học viên Một", note: "Người học đã tự đổi PIN qua xác minh email.", status: "open", createdAt: "2026-10-28T08:21:00.000Z", resolvedAt: null }
    ] });
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [] });

    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    const notice = await screen.findByRole("region", { name: "Thông báo bảo mật" });
    expect(within(notice).getByText("5 thông báo")).toBeInTheDocument();
    expect(within(notice).getAllByRole("listitem")).toHaveLength(2);
    expect(within(notice).getByText("Học viên Một")).toBeInTheDocument();
    expect(within(notice).getByText("2 lần")).toBeInTheDocument();
    expect(within(notice).getByText("Học viên Hai")).toBeInTheDocument();
    expect(within(notice).queryByText("Học viên Ba")).not.toBeInTheDocument();

    await user.click(within(notice).getByRole("button", { name: "Xem toàn bộ 5 thông báo" }));

    expect(within(notice).getAllByRole("listitem")).toHaveLength(4);
    expect(within(notice).getByText("Học viên Ba")).toBeInTheDocument();
    expect(within(notice).getByText("Học viên Cũ")).toBeInTheDocument();
    expect(within(notice).getByRole("button", { name: "Thu gọn thông báo bảo mật" })).toHaveAttribute("aria-expanded", "true");

    await user.click(within(notice).getByRole("button", { name: "Thu gọn thông báo bảo mật" }));
    expect(within(notice).getAllByRole("listitem")).toHaveLength(2);
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

  it("requires confirmation before clearing the image cache or importing organisation settings", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [] });
    const clear = vi.spyOn(apiClient, "clearManagerImageCache").mockResolvedValue({ cleared: 1 });
    const importData = vi.spyOn(apiClient, "importManagerData").mockResolvedValue({ imported: true });
    const user = userEvent.setup();
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Xoá cache ảnh" }));
    const clearDialog = await screen.findByRole("dialog", { name: "Xoá cache ảnh?" });
    expect(clear).not.toHaveBeenCalled();
    await user.click(within(clearDialog).getByRole("button", { name: "Huỷ" }));
    expect(clear).not.toHaveBeenCalled();

    const snapshot = { version: 1, settings: {} };
    const file = new File([], "e4s-settings.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(snapshot) });
    const input = document.querySelector<HTMLInputElement>("#settings-import-json")!;
    fireEvent.change(input, { target: { files: [file] } });
    const importDialog = await screen.findByRole("dialog", { name: "Nhập cấu hình từ JSON?" });
    expect(importDialog).toHaveTextContent(file.name);
    expect(importData).not.toHaveBeenCalled();
    await user.click(within(importDialog).getByRole("button", { name: "Huỷ" }));
    expect(importData).not.toHaveBeenCalled();
    await waitFor(() => expect(input).toBeEnabled());

    fireEvent.change(input, { target: { files: [file] } });
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Nhập cấu hình" }));
    expect(importData).toHaveBeenCalledExactlyOnceWith(snapshot);
  });

  it("requires confirmation for changes to the system test date and AI test mode", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [] });
    const save = vi.spyOn(apiClient, "saveManagerSettings").mockImplementation(async (input) => ({ ...managerSettings, ...input, simulatedSystemDate: input.simulatedSystemDate ?? managerSettings.simulatedSystemDate }));
    const user = userEvent.setup();

    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    await screen.findByRole("heading", { name: "Ngày hệ thống thử" });
    const field = within(screen.getByLabelText("Thiết lập ngày hệ thống thử")).getByLabelText("Ngày hệ thống thử");
    expect(screen.getByText(/lịch học, quyền vào bài, điểm danh, Season AI Coach và thông báo/i)).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "2026-11-14" } });
    await user.click(screen.getByRole("button", { name: "Lưu ngày hệ thống thử" }));

    const confirm = () => screen.getByRole("dialog", { name: "Áp dụng thay đổi cho toàn tổ chức?" });
    expect(confirm()).toHaveTextContent("2026-11-14");
    expect(save).not.toHaveBeenCalled();
    await user.click(within(confirm()).getByRole("button", { name: "Huỷ" }));
    expect(save).not.toHaveBeenCalled();
    expect(field).toHaveValue("2026-11-14");
    await user.click(screen.getByRole("button", { name: "Lưu ngày hệ thống thử" }));
    await user.click(within(confirm()).getByRole("button", { name: "Áp dụng thay đổi" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ simulatedSystemDate: "2026-11-14" })));

    const testMode = screen.getByRole("switch", { name: "Tắt AI để kiểm thử chế độ dự phòng" });
    await user.click(testMode);
    await user.click(screen.getByRole("button", { name: "Lưu chế độ kiểm thử AI" }));
    expect(confirm()).toHaveTextContent(/Tắt AI/);
    expect(save).toHaveBeenCalledTimes(1);
    await user.click(within(confirm()).getByRole("button", { name: "Huỷ" }));
    expect(testMode).toBeChecked();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["/mgr/reopen-requests", "Yêu cầu", "Yêu cầu mở khóa", "Duyệt yêu cầu mở khóa tài khoản và nội dung học."],
    ["/mgr/complaints", "Khiếu nại", "Khiếu nại học viên", "Xem và phản hồi khiếu nại của học viên."]
  ])("opens the legacy %s URL on the %s tab", async (path, label, tab, description) => {
    vi.spyOn(apiClient, "getManagerReopenRequests").mockResolvedValue({ requests: [] });
    renderManager(<MemoryRouter initialEntries={[path]}>
      <RoleRoutes session={{ role: "manager", user: { id: "manager-1", displayName: "Quản lý", email: null }, permissions: ["report:read"] }} />
    </MemoryRouter>);

    await waitFor(() => expect(apiClient.getManagerReopenRequests).toHaveBeenCalled());
    const heading = await screen.findByRole("heading", { name: label });
    const tabs = screen.getByRole("navigation", { name: "Loại yêu cầu" });
    expect(heading.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(tabs).getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
    expect(heading.parentElement).toHaveTextContent(description);
    expect(await screen.findByRole("table", { name: label })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Các mục yêu cầu" })).not.toBeInTheDocument();
  });

  const resourcesRequest = {
    id: "framework-request-1", target: "monthly_resources" as const, targetId: "framework-a2", requestedBy: "operator-1",
    reason: "Kế hoạch cũ thiếu bài tập kỹ năng", status: "pending" as const, decisionReason: null,
    createdAt: "2026-11-05T01:00:00.000Z", decidedAt: null,
    monthlyResources: { frameworkId: "framework-a2", month: "2026-11", cefr: "A2" as const, frameworkVersion: 1, lessonCount: 20, lessonsWithContent: 0, removedLessonCount: null }
  };

  it("lists a monthly resources reopen request with its month, level and version and approves it with a reason", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getManagerReopenRequests")
      .mockResolvedValueOnce({ requests: [resourcesRequest] })
      .mockResolvedValue({ requests: [{ ...resourcesRequest, status: "approved", decisionReason: "Đồng ý mở lại", decidedAt: "2026-11-05T02:00:00.000Z", monthlyResources: { ...resourcesRequest.monthlyResources, lessonCount: 0, removedLessonCount: 20 } }] });
    const decide = vi.spyOn(apiClient, "decideManagerReopenRequest").mockResolvedValue({ ...resourcesRequest, status: "approved", decisionReason: "Đồng ý mở lại", decidedAt: "2026-11-05T02:00:00.000Z" });
    renderManager(<MemoryRouter initialEntries={["/mgr/reopen-requests"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    const queue = (await screen.findByText("Tài nguyên tháng 11/2026 · A2")).closest("tr")!;
    expect(within(queue).getByText("Phiên bản tài nguyên v1")).toBeInTheDocument();
    expect(within(queue).queryByRole("alert")).not.toBeInTheDocument();

    await user.click(within(queue).getByRole("button", { name: "Duyệt mở khóa" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("xoá 20 bài chưa có nội dung");
    await user.type(within(dialog).getByLabelText("Lý do gửi cho vận hành và học viên"), "Đồng ý mở lại");
    await user.click(within(dialog).getByRole("button", { name: "Duyệt mở khóa" }));

    await waitFor(() => expect(decide).toHaveBeenCalledWith("framework-request-1", "approved", "Đồng ý mở lại"));
    expect(await within(queue).findByText("Đã xoá 20 bài khỏi lịch.")).toBeInTheDocument();
  });

  it("warns before approving a monthly resources reopen that removes lessons with content, and rejects with a reason", async () => {
    const user = userEvent.setup();
    const withContent = { ...resourcesRequest, monthlyResources: { ...resourcesRequest.monthlyResources, lessonsWithContent: 3 } };
    vi.spyOn(apiClient, "getManagerReopenRequests").mockResolvedValue({ requests: [withContent] });
    const decide = vi.spyOn(apiClient, "decideManagerReopenRequest").mockResolvedValue({ ...withContent, status: "rejected", decisionReason: "Giữ nguyên", decidedAt: "2026-11-05T02:00:00.000Z" });
    renderManager(<MemoryRouter initialEntries={["/mgr/reopen-requests"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    const queue = (await screen.findByText("Tài nguyên tháng 11/2026 · A2")).closest("tr")!;
    expect(await within(queue).findByRole("alert")).toHaveTextContent("3 bài đã có nội dung sẽ bị xoá");

    await user.click(within(queue).getByRole("button", { name: "Duyệt mở khóa" }));
    const approveDialog = await screen.findByRole("dialog");
    expect(approveDialog).toHaveTextContent("Cảnh báo: 3/20 bài đã có nội dung");
    await user.click(within(approveDialog).getByRole("button", { name: "Huỷ" }));
    expect(decide).not.toHaveBeenCalled();

    await user.click(within(queue).getByRole("button", { name: "Từ chối" }));
    const rejectDialog = await screen.findByRole("dialog");
    expect(rejectDialog).not.toHaveTextContent("Cảnh báo");
    await user.type(within(rejectDialog).getByLabelText("Lý do gửi cho vận hành và học viên"), "Giữ nguyên");
    await user.click(within(rejectDialog).getByRole("button", { name: "Từ chối" }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith("framework-request-1", "rejected", "Giữ nguyên"));
  });

  it("scrolls the Manager header horizontally to reveal the active destination on tablet widths", async () => {
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
    vi.spyOn(nav, "getBoundingClientRect").mockReturnValue({ left: 0, right: 100 } as DOMRect);
    vi.spyOn(active, "getBoundingClientRect").mockReturnValue({ left: 120, right: 180 } as DOMRect);
    vi.spyOn(apiClient, "getManagerReminders").mockResolvedValue({
      organizationName: "GFT", inactiveDays: 3, webhookConfigured: false,
      candidates: [], history: []
    });

    try {
      renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
      await screen.findByText("Không ai cần nhắc hôm nay");
      expect(screen.getByRole("heading", { name: "Nhắc học" })).toBeInTheDocument();
      await vi.waitFor(() => expect(nav.scrollLeft).toBe(80));
    } finally {
      nav.remove();
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("loads the real operations view for /mgr/ops", async () => {
    vi.spyOn(apiClient, "getManagerOperations").mockResolvedValue(operations);
    renderManager(<MemoryRouter initialEntries={["/mgr/ops"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    expect(await screen.findByRole("note", { name: "Phạm vi của Quản lý" })).toBeInTheDocument();
    expect(apiClient.getManagerOperations).toHaveBeenCalledOnce();
    expect(screen.getByRole("note", { name: "Phạm vi của Quản lý" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Mã PIN/ })).not.toBeInTheDocument();
  });

  it("does not expose Operator prompts to Manager", async () => {
    renderManager(<MemoryRouter initialEntries={["/settings/prompts"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Cài đặt" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Prompt & rubric" })).not.toBeInTheDocument();
  });

  it("keeps the Manager operations summary scoped to account operations", async () => {
    vi.spyOn(apiClient, "getManagerOperations").mockResolvedValue(operations);
    renderManager(<MemoryRouter initialEntries={["/mgr/ops"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    const scope = await screen.findByRole("note", { name: "Phạm vi của Quản lý" });
    expect(scope).toHaveTextContent(/theo dõi vận hành tài khoản/i);
    expect(screen.queryByRole("navigation", { name: "Điều hướng màn vận hành" })).not.toBeInTheDocument();
  });

  it("does not expose retired weekly operations to Manager", async () => {
    vi.spyOn(apiClient, "getManagerOperations").mockResolvedValue(operations);
    renderManager(<MemoryRouter initialEntries={["/mgr/ops/weeks"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);

    await vi.waitFor(() => expect(apiClient.getManagerOperations).toHaveBeenCalledOnce());
    expect(screen.queryByRole("heading", { name: "Khung chủ đề tuần" })).not.toBeInTheDocument();
  });

  it("opens the real learner quick-view and shows Manager operational queues", async () => {
    vi.spyOn(apiClient, "getManagerMonthlyOverview").mockResolvedValue(monthlyOverview);
    vi.spyOn(apiClient, "getManagerDeleteRequests").mockResolvedValue({ requests: [{ id: "delete-1", learnerId: "learner-1", learnerName: "Học viên Demo", reason: "Xin xoá", status: "pending", requestedBy: "operator-1", requestedAt: "2026-10-14T09:00:00.000Z" }] });
    vi.spyOn(apiClient, "getManagerTrash").mockResolvedValue({ accounts: [{ id: "trash-1", displayName: "Tài khoản cũ", email: "old@e4s.local", role: "learner", status: "deleted", deletedAt: "2026-10-14T09:00:00.000Z" }] });
    const profile: ManagerLearnerProfileView = { learner: { id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", status: "active", createdAt: "2026-10-01T09:00:00.000Z", currentLevel: "A2" }, profile: { goals: ["Giao tiếp"] }, assessmentScores: { placement: 60, passCourse: 87 }, metrics: { completedLessons: 4, totalLessons: 10, coachTurns: 6, studyDays: 3, rewardPoints: 20, lastActivityAt: "2026-10-14T09:00:00.000Z" } };
    const openProfile = vi.spyOn(apiClient, "getManagerLearnerProfile").mockResolvedValue(profile);
    renderManager(<MemoryRouter initialEntries={["/mgr"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await screen.findByRole("button", { name: "Hồ sơ Học viên Demo" });
    const csv = screen.getByRole("button", { name: "Xuất CSV" });
    expect(csv).toHaveClass("btn-primary");
    expect(csv.closest(".manager-progress-card-header")).toContainElement(screen.getByRole("link", { name: "Giả lập phần thưởng" }));
    expect(screen.getByRole("heading", { name: "Tiến độ nhóm" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Yêu cầu xoá tài khoản/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Mã PIN/ })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Hồ sơ Học viên Demo" }));
    expect(openProfile).toHaveBeenCalledWith("learner-1");
    expect(await screen.findByRole("dialog")).toHaveTextContent("Học viên Demo");
    expect(screen.getByText("Giao tiếp")).toBeInTheDocument();
    expect(screen.getByText("60/100")).toBeInTheDocument();
    expect(screen.getByText("87/100")).toBeInTheDocument();
    const rename = vi.spyOn(apiClient, "renameManagerLearner").mockResolvedValue({ displayName: "Tên mới" });
    const edit = userEvent.setup();
    await edit.click(screen.getByRole("button", { name: "Đổi tên hiển thị" }));
    await edit.clear(screen.getByLabelText("Tên hiển thị"));
    await edit.type(screen.getByLabelText("Tên hiển thị"), "Tên mới");
    await edit.click(screen.getByRole("button", { name: "Lưu tên" }));
    expect(rename).toHaveBeenCalledWith("learner-1", "Tên mới");
    expect(await screen.findByRole("dialog", { name: "Hồ sơ Tên mới" })).toBeInTheDocument();
  });

  it("persists a manual reminder dismissal for a learner", async () => {
    vi.spyOn(apiClient, "getManagerReminders").mockResolvedValue({
      organizationName: "GFT", inactiveDays: 3, webhookConfigured: false,
      candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", learnerEmail: "learner@example.com", cefr: "A2", lastActivityAt: null, missedDays: 3 }], history: []
    });
    const dismiss = vi.spyOn(apiClient, "dismissManagerReminder").mockResolvedValue({ reminderId: "reminder-1", learnerId: "learner-1", status: "dismissed" });
    renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await screen.findByRole("button", { name: "Đã nhắc qua kênh khác" });
    expect(screen.getByRole("heading", { name: "Nhắc học" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Đã nhắc qua kênh khác" }));
    expect(dismiss).toHaveBeenCalledWith("learner-1");
    expect((await screen.findByText("Đã ghi nhận đã nhắc qua kênh khác.")).closest(".ds-toast")).toHaveClass("ds-toast--ok");
  });

  it("sends the email channel independently", async () => {
    vi.spyOn(apiClient, "getManagerReminders").mockResolvedValue({
      organizationName: "GFT", inactiveDays: 3, webhookConfigured: false, emailConfigured: true,
      candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", learnerEmail: "learner@example.com", cefr: "A2", lastActivityAt: null, missedDays: 3 }], history: []
    });
    const send = vi.spyOn(apiClient, "sendManagerReminder").mockResolvedValue({ reminderId: "reminder-1", learnerId: "learner-1", status: "sent", deliveryStatus: "sent", provider: "resend" });
    renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Gửi email" }));
    await user.click(within(screen.getByRole("dialog", { name: "Xác nhận gửi email" })).getByRole("button", { name: "Xác nhận gửi email" }));
    const successToast = await screen.findByText(/Đã gửi email và lưu vào lịch sử/);
    expect(successToast.closest(".ds-toast")).toHaveClass("ds-toast--ok");
    expect(send).toHaveBeenCalledWith("learner-1", expect.any(String), "email");
  });

  it("explains when reminder eligibility changed after loading", async () => {
    vi.spyOn(apiClient, "getManagerReminders").mockResolvedValue({
      organizationName: "GFT", inactiveDays: 3, webhookConfigured: true,
      candidates: [{ learnerId: "learner-1", learnerName: "Học viên Demo", learnerEmail: "learner@example.com", cefr: "A2", lastActivityAt: null, missedDays: 3 }], history: []
    });
    vi.spyOn(apiClient, "sendManagerReminder").mockRejectedValue(new Error("MANAGER_REMINDER_NOT_ELIGIBLE"));
    renderManager(<MemoryRouter initialEntries={["/mgr/reminders"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Gửi email" }));
    await user.click(within(screen.getByRole("dialog", { name: "Xác nhận gửi email" })).getByRole("button", { name: "Xác nhận gửi email" }));
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
    vi.spyOn(apiClient, "getManagerMonthlyOverview").mockResolvedValue(monthlyOverview);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    const provider = vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    renderManager(<MemoryRouter initialEntries={["/mgr/report"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Báo cáo tổng kết" });
    expect(screen.getByRole("heading", { name: "Báo cáo tổng kết" })).toBeInTheDocument();
    expect(provider).not.toHaveBeenCalled();
    expect(screen.queryByText(/qwen\/qwen3\.8-27b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/openai/)).not.toBeInTheDocument();
  });

  it("uses the selected month and level for survey counts and the report export", async () => {
    const load = vi.spyOn(apiClient, "getManagerMonthlyOverview").mockImplementation(async (filter) => ({
      ...monthlyOverview, month: filter?.month ?? monthlyOverview.month, cefr: filter?.cefr ?? null
    }));
    const user = userEvent.setup();
    renderManager(<MemoryRouter initialEntries={["/mgr/report"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    expect(await screen.findByText(/3 phiếu · 1 câu trả lời có điểm/)).toHaveTextContent("1 phiếu không có câu chấm điểm · 1 phiếu bỏ trống câu chấm điểm");
    fireEvent.change(screen.getByLabelText("Tháng báo cáo"), { target: { value: "2026-08" } });
    await user.selectOptions(screen.getByLabelText("Lọc theo mức"), "A2");
    await waitFor(() => expect(load).toHaveBeenLastCalledWith({ month: "2026-08", cefr: "A2" }));
    expect(await screen.findByText("69/100 · Đã chấm")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Ba chỉ số của tháng" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Mức đạt" })).toBeInTheDocument();
    for (const name of ["1. Ba chỉ số của tháng", "2. Quy mô và hoạt động", "3. Từng học viên", "4. Phản hồi khảo sát", "5. Việc cần làm tiếp"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    const print = screen.getByRole("button", { name: "In / Lưu PDF" });
    expect(print).toHaveClass("btn-primary");
    const reportHeader = print.closest("article > header");
    expect(reportHeader).not.toBeNull();
    for (const name of ["Copy bản chữ", "Tải .txt"]) {
      expect(reportHeader).toContainElement(screen.getByRole("button", { name }));
    }
    expect(screen.queryByRole("button", { name: "Xuất CSV" })).not.toBeInTheDocument();
    expect(screen.queryByText("Điểm đầu ra · Pass Course")).not.toBeInTheDocument();
  });

  it("counts only graded placements as waiting for a level decision, matching the operator queue", async () => {
    const base = monthlyOverview.learners[0]!;
    const unplaced = (learnerId: string, learnerName: string, state: ManagerMonthlyOverviewView["learners"][number]["state"]) => ({ ...base, learnerId, learnerName, cefr: null, state });
    vi.spyOn(apiClient, "getManagerMonthlyOverview").mockResolvedValue({ ...monthlyOverview, learners: [
      unplaced("p-1", "Hồ Anh Tuấn", "placement_pending"), unplaced("p-2", "Dương Mỹ Linh", "placement_pending"),
      unplaced("p-3", "Tạ Bảo Trâm", "placement_pending"), unplaced("p-4", "Bùi Gia Hân", "placement_submitted")
    ] });
    renderManager(<MemoryRouter initialEntries={["/mgr/report"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    expect(await screen.findByText("3 học viên đang chờ duyệt mức.")).toBeInTheDocument();
    expect(screen.getByText("1 học viên đã nộp bài đầu vào, đang chờ chấm (chưa vào hàng chờ duyệt).")).toBeInTheDocument();
    expect(screen.queryByText("4 học viên đang chờ duyệt mức.")).not.toBeInTheDocument();
  });

  it("uses the app confirm modal for delete approval and restore", async () => {
    vi.spyOn(apiClient, "getManagerMonthlyOverview").mockResolvedValue(monthlyOverview);
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
    await screen.findByRole("button", { name: "Đặt lại PIN" });
    expect(screen.getByRole("heading", { name: "Cài đặt" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Đặt lại PIN" }));
    const prompt = await screen.findByRole("dialog", { name: "PIN mới cho Học viên Demo" });
    await user.type(within(prompt).getByLabelText("PIN mới"), "246802");
    await user.click(within(prompt).getByRole("button", { name: "Đặt lại PIN" }));
    await vi.waitFor(() => expect(reset).toHaveBeenCalledWith("learner-1", "246802"));
    expect(await screen.findByText("••••••")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hiện PIN của Học viên Demo" }));
    expect(screen.getByText("246802")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ẩn PIN của Học viên Demo" }));
    expect(screen.queryByText("246802")).not.toBeInTheDocument();
  });

  it("reveals the current learner PIN without opening the reset prompt", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [{ id: "learner-1", displayName: "Học viên Demo", email: "learner@e4s.local", role: "learner", status: "active", createdAt: "2026-10-01T09:00:00.000Z" }] });
    const reveal = vi.spyOn(apiClient, "getManagerAccountCredential").mockResolvedValue({ credential: "135790", kind: "pin" });
    const reset = vi.spyOn(apiClient, "resetManagerAccountPassword").mockResolvedValue({ saved: true });
    const user = userEvent.setup();

    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Hiện PIN của Học viên Demo" }));

    expect(reveal).toHaveBeenCalledWith("learner-1");
    expect(reset).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "PIN mới cho Học viên Demo" })).not.toBeInTheDocument();
    expect(screen.getByText("135790")).toBeInTheDocument();
  });

  it("returns to sign-in after resetting the signed-in Manager's password without reloading accounts", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    const directory = vi.spyOn(apiClient, "getManagerAccounts")
      .mockResolvedValueOnce({ organizationName: "GFT", accounts: [{ id: "manager-1", displayName: "Quản lý Demo", email: "manager@e4s.local", role: "manager", status: "active", createdAt: "2026-10-01T09:00:00.000Z" }] })
      .mockRejectedValue(new Error("Session revoked"));
    const reset = vi.spyOn(apiClient, "resetManagerAccountPassword").mockResolvedValue({ saved: true });
    const onSessionRevoked = vi.fn();
    const user = userEvent.setup();
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" onSessionRevoked={onSessionRevoked} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Đặt lại mật khẩu" }));
    const prompt = await screen.findByRole("dialog", { name: "Mật khẩu mới cho Quản lý Demo" });
    await user.type(within(prompt).getByLabelText("Mật khẩu mới"), "test-credential-123");
    await user.click(within(prompt).getByRole("button", { name: "Đặt lại mật khẩu" }));

    await waitFor(() => expect(onSessionRevoked).toHaveBeenCalledOnce());
    expect(reset).toHaveBeenCalledWith("manager-1", "test-credential-123");
    expect(directory).toHaveBeenCalledOnce();
    expect(screen.getByText(/Đã đặt lại mật khẩu.*đăng nhập lại/)).toBeInTheDocument();
  });

  it("shows and reveals a staff password only through the Manager credential endpoint", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [{ id: "operator-1", displayName: "Người vận hành Demo", email: "operator@e4s.local", role: "operator", status: "active", createdAt: "2026-10-01T09:00:00.000Z" }] });
    const reveal = vi.spyOn(apiClient, "getManagerAccountCredential").mockResolvedValue({ credential: "staff-pass-123", kind: "password" });
    const user = userEvent.setup();

    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    const revealButton = await screen.findByRole("button", { name: "Hiện mật khẩu của Người vận hành Demo" });
    expect(within(screen.getByRole("row", { name: /Người vận hành Demo/ })).getByText("••••••")).toBeInTheDocument();
    await user.click(revealButton);

    expect(reveal).toHaveBeenCalledWith("operator-1");
    expect(screen.getByRole("textbox", { name: "Giá trị mật khẩu của Người vận hành Demo" })).toHaveValue("staff-pass-123");
    await user.click(screen.getByRole("button", { name: "Ẩn mật khẩu của Người vận hành Demo" }));
    expect(screen.queryByDisplayValue("staff-pass-123")).not.toBeInTheDocument();
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

  it("shows app validation for incomplete Manager account creation", async () => {
    vi.spyOn(apiClient, "getProductPreferences").mockResolvedValue(product);
    vi.spyOn(apiClient, "getSystemCapabilities").mockResolvedValue(capabilities);
    vi.spyOn(apiClient, "getManagerSettings").mockResolvedValue(managerSettings);
    vi.spyOn(apiClient, "getManagerProviderSettings").mockResolvedValue(managerProvider);
    vi.spyOn(apiClient, "getManagerAccounts").mockResolvedValue({ organizationName: "GFT", accounts: [] });
    const create = vi.spyOn(apiClient, "createManagerAccount");
    const user = userEvent.setup();
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="manager" currentUserId="manager-1" /></MemoryRouter>);
    const submit = await screen.findByRole("button", { name: "+ Thêm người dùng" });
    const name = screen.getByLabelText("Tên");
    const email = screen.getByLabelText("Email");
    const pin = screen.getByLabelText("PIN ban đầu");

    await user.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("Nhập tên người dùng.");
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute("aria-invalid", "true");

    await user.type(name, "Người mới");
    await user.type(email, "sai-email");
    await user.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent("Nhập email hợp lệ.");
    expect(email).toHaveFocus();

    await user.clear(email);
    await user.type(email, "new@e4s.local");
    await user.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent("PIN học viên phải đúng 6 chữ số.");
    expect(pin).toHaveFocus();
    expect(create).not.toHaveBeenCalled();
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
    expect(screen.getByText(/Người học dùng PIN đúng 6 chữ số/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Tên"), "Người mới");
    await user.type(screen.getByLabelText("Email"), "new@e4s.local");
    await user.type(screen.getByLabelText("PIN ban đầu"), "135790");
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

    const password = await screen.findByLabelText("PIN ban đầu");
    await user.type(password, "135790");
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Hiện PIN ban đầu" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("135790");
    await user.click(screen.getByRole("button", { name: "Ẩn PIN ban đầu" }));
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("135790");
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
    expect(screen.getByText("Đã khoá")).toHaveClass("account-status-locked");
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
      accounts: []
    } satisfies OperatorSettingsOverviewView);
    const saveProduct = vi.spyOn(apiClient, "saveProductPreferences").mockResolvedValue({ ...product, theme: "winter" });
    const saveExperience = vi.mocked(apiClient.saveOrganisationExperience);
    renderManager(<MemoryRouter initialEntries={["/settings"]}><ManagerRouteController role="operator" currentUserId="operator-1" /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Cài đặt" });
    expect(screen.getByRole("heading", { name: "Cài đặt" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tùy chọn cá nhân" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Hiệu ứng âm thanh" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Nhạc nền" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kiểm tra kết nối" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kết nối AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Prompt & rubric" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mở Prompt & rubric" })).not.toBeInTheDocument();
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
  pilotStartDate: "2026-10-12", simulatedSystemDate: "2026-10-12", pilotWeeks: 2, weekOverride: 0, minMinutesPerDay: 15,
  courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 20,
  testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3,
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
const progressView: ManagerProgressView = {
  organizationName: "GFT", currentWeek: 1, pilotWeeks: 1,
  summary: { learnerCount: 1, activeLearnersThisWeek: 0, completedLessons: 0, pendingAssessments: 0, completedLearners: 0, surveyCount: 0, satisfactionAverage: null },
  learners: [{ learnerId: "learner-1", learnerName: "Học viên Demo", cefr: "A2", completedLessons: 0, totalLessonsThisWeek: 0,
    sessionsThisWeek: 0, coachTurnsThisWeek: 0, weeklyPracticeScore: null, weeklyPracticeStatus: "not_submitted",
    rewardPoints: 0, earnedBadges: [], placementScore: 60, missedDays: null, lastActivityAt: null }]
};

const monthlyOverview: ManagerMonthlyOverviewView = {
  organizationName: "GFT", currentMonth: "2026-11", month: "2026-11", cefr: null, generatedAt: "2026-11-09T00:00:00Z",
  survey: { submissions: 3, ratingResponses: 1, withoutRatingQuestion: 1, unansweredRating: 1, average: 4 },
  learners: [{
    learnerId: "learner-1", learnerName: "Học viên Demo", email: "learner@e4s.local", cefr: "A2", state: "active",
    lastActivityAt: "2026-11-06T09:00:00.000Z", attendedDays: 4, elapsedDays: 5, absenceDays: 1,
    maxAbsences: 6, consecutiveAbsences: 0, lessons: { completed: 4, scheduled: 16 }, reviews: { completed: 1, scheduled: 4 },
    season: { turns: 20, target: 95 }, exam: { status: "approved", scores: { listening: 20, reading: 18, writing: 16, speaking: 15 }, total: 69 },
    levelCriteria: [false, false, true, true], complaintCount: 1, attendanceEligible: true, onTrack: true, completedToDate: false, lessonsToDate: { completed: 0, expected: 0 }, atRisk: false
  }]
};
