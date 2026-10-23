import type {
  AssessmentDeletionRequestView, ManagerAccountView, ManagerAccountsView, ManagerDataExportView,
  ManagerDataImportView, ManagerDeleteRequestsView, ManagerImageTestView, ManagerLearnerProfileView,
  ManagerMaintenanceConfirmationInput, ManagerMaintenanceConfirmationView, ManagerMaintenanceResultView,
  ManagerMusicTestView, ManagerOperationsView,
  ManagerProgressView, ManagerProviderSettingsInput, ManagerProviderSettingsTestInput,
  ManagerProviderSettingsView, ManagerProviderTestView, ManagerPurgeConfirmationInput,
  ManagerPurgeConfirmationView, ManagerReminderCopyView, ManagerReminderDismissView,
  ManagerReminderSendView, ManagerRemindersView, ManagerReportView, ManagerSettingsView, ManagerTrashView, ManagerPinReportsView,
  OperatorSettingsOverviewView, OrganisationExperienceInput, OrganisationExperienceView,
  ManagerWebhookTestView, ProductPreferencesView, SystemCapabilitiesView, WeeklyPracticeAssignmentView
} from "@e4s/contracts";
import { request } from "./runtime.js";

export interface ManagerApiClient {
  getManagerProgress(): Promise<ManagerProgressView>;
  getManagerLearnerProfile(learnerId: string): Promise<ManagerLearnerProfileView>;
  assignManagerWeeklyPractice(learnerId: string): Promise<WeeklyPracticeAssignmentView>;
  getManagerOperations(): Promise<ManagerOperationsView>;
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
  getManagerPinReports(): Promise<ManagerPinReportsView>;
  createManagerAccount(input: { displayName: string; email: string; role: ManagerAccountView["role"]; password: string }): Promise<ManagerAccountView>;
  updateManagerAccountRole(accountId: string, role: ManagerAccountView["role"]): Promise<ManagerAccountView>;
  updateManagerAccountStatus(accountId: string, status: "active" | "disabled" | "deleted"): Promise<ManagerAccountView>;
  resetManagerAccountPassword(accountId: string, password: string): Promise<{ saved: boolean }>;
  getManagerReminders(): Promise<ManagerRemindersView>;
  sendManagerReminder(learnerId: string, requestId: string): Promise<ManagerReminderSendView>;
  dismissManagerReminder(learnerId: string): Promise<ManagerReminderDismissView>;
  copyManagerReminder(learnerId: string): Promise<ManagerReminderCopyView>;
  getManagerReport(): Promise<ManagerReportView>;
  getManagerSettings(): Promise<ManagerSettingsView>;
  getOperatorSettingsOverview(): Promise<OperatorSettingsOverviewView>;
  saveManagerSettings(input: Omit<ManagerSettingsView, "organizationName">): Promise<ManagerSettingsView>;
  saveOperatorSettings(input: Omit<ManagerSettingsView, "organizationName">): Promise<ManagerSettingsView>;
  getProductPreferences(): Promise<ProductPreferencesView>;
  saveProductPreferences(input: ProductPreferencesView): Promise<ProductPreferencesView>;
  getSystemCapabilities(): Promise<SystemCapabilitiesView>;
  getOrganisationExperience(): Promise<OrganisationExperienceView>;
  saveOrganisationExperience(input: OrganisationExperienceInput): Promise<OrganisationExperienceView>;
}

export const managerApiClient: ManagerApiClient = {
  getManagerProgress: () => request("/api/v1/manager/progress"),
  getManagerLearnerProfile: (learnerId) => request(`/api/v1/manager/learners/${encodeURIComponent(learnerId)}`),
  assignManagerWeeklyPractice: (learnerId) => request(`/api/v1/manager/learners/${encodeURIComponent(learnerId)}/weekly-practice`, { method: "POST", body: "{}" }),
  getManagerOperations: () => request("/api/v1/manager/operations"),
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
  getManagerPinReports: () => request("/api/v1/manager/pin-reports"),
  createManagerAccount: (input) => request("/api/v1/manager/accounts", { method: "POST", body: JSON.stringify(input) }),
  updateManagerAccountRole: (accountId, role) => request(`/api/v1/manager/accounts/${encodeURIComponent(accountId)}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  updateManagerAccountStatus: (accountId, status) => request(`/api/v1/manager/accounts/${encodeURIComponent(accountId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  resetManagerAccountPassword: (accountId, password) => request(`/api/v1/manager/accounts/${encodeURIComponent(accountId)}/password-reset`, { method: "POST", body: JSON.stringify({ password }) }),
  getManagerReminders: () => request("/api/v1/manager/reminders"),
  sendManagerReminder: (learnerId, requestId) => request(`/api/v1/manager/reminders/${encodeURIComponent(learnerId)}`, { method: "POST", body: JSON.stringify({ requestId }) }),
  dismissManagerReminder: (learnerId) => request(`/api/v1/manager/reminders/${encodeURIComponent(learnerId)}/dismiss`, { method: "POST", body: "{}" }),
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
