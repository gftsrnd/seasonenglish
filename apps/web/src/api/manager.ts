import type {
  AssessmentDeletionRequestView, ManagerAccountCredentialView, ManagerAccountPinView, ManagerAccountView, ManagerAccountsView, ManagerDataExportView,
  ManagerDataImportView, ManagerDeleteRequestsView, ManagerImageTestView, ManagerLearnerProfileView,
  ManagerMaintenanceConfirmationInput, ManagerMaintenanceConfirmationView, ManagerMaintenanceResultView,
  ManagerMusicTestView, ManagerOperationsView,
  ManagerMonthlyFilter, ManagerMonthlyOverviewView, ManagerProgressView, ManagerProviderSettingsInput, ManagerProviderSettingsTestInput,
  ManagerProviderSettingsView, ManagerProviderTestView, ManagerPurgeConfirmationInput,
  ManagerPurgeConfirmationView, ManagerReminderCopyView, ManagerReminderDismissView,
  ManagerBaseNotificationInput, ManagerBaseNotificationView, ManagerReminderChannel, ManagerReminderSendView, ManagerRemindersView, ManagerReportView, ManagerSettingsInput, ManagerSettingsView, ManagerTrashView,
  OperatorSettingsOverviewView, OrganisationExperienceInput, OrganisationExperienceView,
  ManagerWebhookTestView, ProductPreferencesView, ReopenRequestView, SystemCapabilitiesView, WeeklyPracticeAssignmentView,
  LearnerComplaintKind, ManagerComplaintView
} from "@e4s/contracts";
import { request } from "./runtime.js";

export interface ManagerApiClient {
  getManagerComplaints(): Promise<{ complaints: ManagerComplaintView[] }>;
  deleteManagerRequest(kind: "complaint" | "reopen", id: string): Promise<void>;
  setManagerRequestArchived(kind: "complaint" | "reopen", id: string, archived: boolean): Promise<void>;
  decideManagerComplaint(id: string, decision: "approved" | "rejected", resolution: string): Promise<{ complaint: Pick<ManagerComplaintView, "id" | "kind" | "status" | "resolution" | "resolvedAt"> }>;
  getManagerHolidays(): Promise<{ holidays: Array<{ id: string; date: string; created_at: string; created_by_name: string | null; source?: "national" | "organization"; name?: string; sourceUrl?: string }> }>;
  addManagerHoliday(date: string): Promise<{ holiday: { id: string; date: string } }>;
  removeManagerHoliday(id: string): Promise<{ deleted: true }>;
  getManagerReopenRequests(): Promise<{ requests: ReopenRequestView[] }>;
  decideManagerReopenRequest(requestId: string, decision: "approved" | "rejected", reason: string): Promise<ReopenRequestView>;
  getManagerProgress(): Promise<ManagerProgressView>;
  getManagerMonthlyOverview(filter?: ManagerMonthlyFilter): Promise<ManagerMonthlyOverviewView>;
  getManagerLearnerProfile(learnerId: string): Promise<ManagerLearnerProfileView>;
  renameManagerLearner(learnerId: string, displayName: string): Promise<{ displayName: string }>;
  assignManagerWeeklyPractice(learnerId: string): Promise<WeeklyPracticeAssignmentView>;
  getManagerOperations(month?: string): Promise<ManagerOperationsView>;
  getManagerDeleteRequests(): Promise<ManagerDeleteRequestsView>;
  decideManagerDeleteRequest(requestId: string, input: { status: "approved" | "rejected"; note: string }): Promise<AssessmentDeletionRequestView>;
  getManagerTrash(): Promise<ManagerTrashView>;
  restoreManagerTrashAccount(accountId: string): Promise<ManagerAccountView>;
  requestManagerTrashPurgeConfirmation(accountId: string): Promise<ManagerPurgeConfirmationView>;
  purgeManagerTrashAccount(accountId: string, input: ManagerPurgeConfirmationInput): Promise<void>;
  testManagerImage(input: { source: ProductPreferencesView["vocabImageSource"]; word?: string }): Promise<ManagerImageTestView>;
  clearManagerImageCache(): Promise<{ cleared: number }>;
  testManagerMusic(input: ManagerSettingsView["backgroundMusic"]): Promise<ManagerMusicTestView>;
  resetManagerMusic(): Promise<ManagerSettingsView["backgroundMusic"]>;
  testManagerWebhook(input: { url: string; template: string }): Promise<ManagerWebhookTestView>;
  exportManagerData(): Promise<ManagerDataExportView>;
  importManagerData(snapshot: unknown): Promise<ManagerDataImportView>;
  requestManagerSeedConfirmation(): Promise<ManagerMaintenanceConfirmationView>;
  seedManagerData(input: ManagerMaintenanceConfirmationInput): Promise<ManagerMaintenanceResultView>;
  requestManagerWipeConfirmation(): Promise<ManagerMaintenanceConfirmationView>;
  wipeManagerData(input: ManagerMaintenanceConfirmationInput): Promise<ManagerMaintenanceResultView>;
  getManagerProviderSettings(): Promise<ManagerProviderSettingsView>;
  saveManagerProviderSettings(input: ManagerProviderSettingsInput): Promise<ManagerProviderSettingsView>;
  testManagerProviderSettings(input?: ManagerProviderSettingsTestInput): Promise<ManagerProviderTestView>;
  getManagerAccounts(): Promise<ManagerAccountsView>;
  createManagerAccount(input: { displayName: string; email: string; role: ManagerAccountView["role"]; password: string }): Promise<ManagerAccountView>;
  updateManagerAccountRole(accountId: string, role: ManagerAccountView["role"]): Promise<ManagerAccountView>;
  updateManagerAccountStatus(accountId: string, status: "active" | "disabled" | "deleted"): Promise<ManagerAccountView>;
  resetManagerAccountPassword(accountId: string, password: string): Promise<{ saved: boolean }>;
  getManagerAccountPin(accountId: string): Promise<ManagerAccountPinView>;
  getManagerAccountCredential(accountId: string): Promise<ManagerAccountCredentialView>;
  getManagerReminders(): Promise<ManagerRemindersView>;
  saveManagerLearnerBaseNotification(learnerId: string, input: ManagerBaseNotificationInput): Promise<ManagerBaseNotificationView>;
  sendManagerReminder(learnerId: string, requestId: string, channel: ManagerReminderChannel): Promise<ManagerReminderSendView>;
  dismissManagerReminder(learnerId: string): Promise<ManagerReminderDismissView>;
  deleteManagerReminderHistory(reminderId: string): Promise<{ deleted: true }>;
  copyManagerReminder(learnerId: string): Promise<ManagerReminderCopyView>;
  getManagerReport(): Promise<ManagerReportView>;
  getManagerSettings(): Promise<ManagerSettingsView>;
  getOperatorSettingsOverview(): Promise<OperatorSettingsOverviewView>;
  saveManagerSettings(input: ManagerSettingsInput): Promise<ManagerSettingsView>;
  saveOperatorSettings(input: ManagerSettingsInput): Promise<ManagerSettingsView>;
  getProductPreferences(): Promise<ProductPreferencesView>;
  saveProductPreferences(input: ProductPreferencesView): Promise<ProductPreferencesView>;
  getSystemCapabilities(): Promise<SystemCapabilitiesView>;
  getOrganisationExperience(): Promise<OrganisationExperienceView>;
  saveOrganisationExperience(input: OrganisationExperienceInput): Promise<OrganisationExperienceView>;
}

export const managerApiClient: ManagerApiClient = {
  getManagerComplaints: () => request("/api/v1/manager/complaints"),
  deleteManagerRequest: (kind, id) => request(`/api/v1/manager/request-history/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setManagerRequestArchived: (kind, id, archived) => request(`/api/v1/manager/request-history/${kind}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ archived }) }),
  decideManagerComplaint: (id, decision, resolution) => request(`/api/v1/manager/complaints/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify({ decision, resolution }) }),
  getManagerHolidays: () => request("/api/v1/manager/holidays"),
  addManagerHoliday: (date) => request("/api/v1/manager/holidays", { method: "POST", body: JSON.stringify({ date }) }),
  removeManagerHoliday: (id) => request(`/api/v1/manager/holidays/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getManagerReopenRequests: () => request("/api/v1/manager/reopen-requests"),
  decideManagerReopenRequest: (requestId, decision, reason) => request(`/api/v1/manager/reopen-requests/${encodeURIComponent(requestId)}/${decision === "approved" ? "approve" : "reject"}`, { method: "POST", body: JSON.stringify({ reason }) }),
  getManagerProgress: () => request("/api/v1/manager/progress"),
  getManagerMonthlyOverview: (filter = {}) => {
    const query = new URLSearchParams();
    if (filter.month) query.set("month", filter.month);
    if (filter.cefr) query.set("cefr", filter.cefr);
    return request(`/api/v1/manager/monthly-overview${query.size ? `?${query}` : ""}`);
  },
  getManagerLearnerProfile: (learnerId) => request(`/api/v1/manager/learners/${encodeURIComponent(learnerId)}`),
  renameManagerLearner: (learnerId, displayName) => request(`/api/v1/manager/learners/${encodeURIComponent(learnerId)}/display-name`, { method: "PATCH", body: JSON.stringify({ displayName }) }),
  assignManagerWeeklyPractice: (learnerId) => request(`/api/v1/manager/learners/${encodeURIComponent(learnerId)}/weekly-practice`, { method: "POST", body: "{}" }),
  getManagerOperations: (month) => request(month ? `/api/v1/manager/operations?month=${encodeURIComponent(month)}` : "/api/v1/manager/operations"),
  getManagerDeleteRequests: () => request("/api/v1/manager/delete-requests"),
  decideManagerDeleteRequest: (requestId, input) => request(`/api/v1/manager/delete-requests/${encodeURIComponent(requestId)}/decision`, { method: "POST", body: JSON.stringify(input) }),
  getManagerTrash: () => request("/api/v1/manager/trash"),
  restoreManagerTrashAccount: (accountId) => request(`/api/v1/manager/trash/${encodeURIComponent(accountId)}/restore`, { method: "POST", body: "{}" }),
  requestManagerTrashPurgeConfirmation: (accountId) => request(`/api/v1/manager/trash/${encodeURIComponent(accountId)}/purge-confirmation`, { method: "POST", body: "{}" }),
  purgeManagerTrashAccount: (accountId, input) => request(`/api/v1/manager/trash/${encodeURIComponent(accountId)}`, { method: "DELETE", body: JSON.stringify(input) }),
  testManagerImage: (input) => request("/api/v1/manager/settings/image-test", { method: "POST", body: JSON.stringify(input) }),
  clearManagerImageCache: () => request("/api/v1/manager/settings/image-cache", { method: "POST", body: "{}" }),
  testManagerMusic: (input) => request("/api/v1/manager/settings/music-test", { method: "POST", body: JSON.stringify(input) }),
  resetManagerMusic: () => request("/api/v1/manager/settings/music-reset", { method: "POST", body: "{}" }),
  testManagerWebhook: (input) => request("/api/v1/manager/settings/webhook-test", { method: "POST", body: JSON.stringify(input) }),
  exportManagerData: () => request("/api/v1/manager/settings/export"),
  importManagerData: (snapshot) => request("/api/v1/manager/settings/import", { method: "POST", body: JSON.stringify({ snapshot }) }),
  requestManagerSeedConfirmation: () => request("/api/v1/manager/settings/seed-confirmation", { method: "POST", body: "{}" }),
  seedManagerData: (input) => request("/api/v1/manager/settings/seed", { method: "POST", body: JSON.stringify(input) }),
  requestManagerWipeConfirmation: () => request("/api/v1/manager/settings/wipe-confirmation", { method: "POST", body: "{}" }),
  wipeManagerData: (input) => request("/api/v1/manager/settings/wipe", { method: "POST", body: JSON.stringify(input) }),
  getManagerProviderSettings: () => request("/api/v1/manager/provider-settings"),
  saveManagerProviderSettings: (input) => request("/api/v1/manager/provider-settings", { method: "PUT", body: JSON.stringify(input) }),
  testManagerProviderSettings: (input) => request("/api/v1/manager/provider-settings/test", { method: "POST", body: JSON.stringify(input ?? {}) }),
  getManagerAccounts: () => request("/api/v1/manager/accounts"),
  createManagerAccount: (input) => request("/api/v1/manager/accounts", { method: "POST", body: JSON.stringify(input) }),
  updateManagerAccountRole: (accountId, role) => request(`/api/v1/manager/accounts/${encodeURIComponent(accountId)}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  updateManagerAccountStatus: (accountId, status) => request(`/api/v1/manager/accounts/${encodeURIComponent(accountId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  resetManagerAccountPassword: (accountId, password) => request(`/api/v1/manager/accounts/${encodeURIComponent(accountId)}/password-reset`, { method: "POST", body: JSON.stringify({ password }) }),
  getManagerAccountPin: (accountId) => request(`/api/v1/manager/accounts/${encodeURIComponent(accountId)}/pin`),
  getManagerAccountCredential: (accountId) => request(`/api/v1/manager/accounts/${encodeURIComponent(accountId)}/credential`),
  getManagerReminders: () => request("/api/v1/manager/reminders"),
  saveManagerLearnerBaseNotification: (learnerId, input) => request(`/api/v1/manager/learners/${encodeURIComponent(learnerId)}/notifications/base`, { method: "PUT", body: JSON.stringify(input) }),
  sendManagerReminder: (learnerId, requestId, channel) => request(`/api/v1/manager/reminders/${encodeURIComponent(learnerId)}`, { method: "POST", body: JSON.stringify({ requestId, channel }) }),
  dismissManagerReminder: (learnerId) => request(`/api/v1/manager/reminders/${encodeURIComponent(learnerId)}/dismiss`, { method: "POST", body: "{}" }),
  deleteManagerReminderHistory: (reminderId) => request(`/api/v1/manager/reminders/history/${encodeURIComponent(reminderId)}`, { method: "DELETE" }),
  copyManagerReminder: (learnerId) => request(`/api/v1/manager/reminders/${encodeURIComponent(learnerId)}/copy`, { method: "POST", body: "{}" }),
  getManagerReport: () => request("/api/v1/manager/report"),
  getManagerSettings: () => request("/api/v1/manager/settings"),
  getOperatorSettingsOverview: () => request("/api/v1/operator/settings-overview"),
  saveManagerSettings: (input) => request("/api/v1/manager/settings", { method: "PUT", body: JSON.stringify(input) }),
  saveOperatorSettings: (input) => request("/api/v1/operator/settings", { method: "PUT", body: JSON.stringify(input) }),
  getProductPreferences: () => request("/api/v1/product-preferences"),
  saveProductPreferences: (input) => request("/api/v1/product-preferences", { method: "PUT", body: JSON.stringify(input) }),
  getSystemCapabilities: () => request("/api/v1/system/capabilities"),
  getOrganisationExperience: () => request("/api/v1/organisation-experience"),
  saveOrganisationExperience: (input) => request("/api/v1/organisation-experience", { method: "PUT", body: JSON.stringify(input) })
};
