import type { ApiClient } from "../api-client.js";
import { request } from "./runtime.js";

export type ManagerApiClient = Pick<ApiClient,
  "getManagerProgress" | "getManagerLearnerProfile" | "getManagerOperations" | "getManagerDeleteRequests" | "decideManagerDeleteRequest" |
  "getManagerTrash" | "restoreManagerTrashAccount" | "requestManagerTrashPurgeConfirmation" | "purgeManagerTrashAccount" |
  "getManagerPinReports" | "createManagerPinReport" | "resolveManagerPinReport" | "testManagerImage" | "clearManagerImageCache" |
  "testManagerMusic" | "resetManagerMusic" | "testManagerWebhook" | "exportManagerData" | "importManagerData" |
  "requestManagerSeedConfirmation" | "seedManagerData" | "requestManagerWipeConfirmation" | "wipeManagerData" |
  "getManagerProviderSettings" | "saveManagerProviderSettings" | "testManagerProviderSettings" | "getManagerAccounts" |
  "createManagerAccount" | "updateManagerAccountRole" | "updateManagerAccountStatus" | "resetManagerAccountPassword" |
  "getManagerReminders" | "sendManagerReminder" | "dismissManagerReminder" | "copyManagerReminder" | "getManagerReport" |
  "getManagerSettings" | "saveManagerSettings" | "getProductPreferences" | "saveProductPreferences" | "getSystemCapabilities"
>;

export const managerApiClient: ManagerApiClient = {
  getManagerProgress: () => request("/api/v1/manager/progress"),
  getManagerLearnerProfile: (learnerId) => request(`/api/v1/manager/learners/${encodeURIComponent(learnerId)}`),
  getManagerOperations: () => request("/api/v1/manager/operations"),
  getManagerDeleteRequests: () => request("/api/v1/manager/delete-requests"),
  decideManagerDeleteRequest: (requestId, input) => request(`/api/v1/manager/delete-requests/${encodeURIComponent(requestId)}/decision`, { method: "POST", body: JSON.stringify(input) }),
  getManagerTrash: () => request("/api/v1/manager/trash"),
  restoreManagerTrashAccount: (accountId) => request(`/api/v1/manager/trash/${encodeURIComponent(accountId)}/restore`, { method: "POST", body: "{}" }),
  requestManagerTrashPurgeConfirmation: (accountId) => request(`/api/v1/manager/trash/${encodeURIComponent(accountId)}/purge-confirmation`, { method: "POST", body: "{}" }),
  purgeManagerTrashAccount: (accountId, input) => request(`/api/v1/manager/trash/${encodeURIComponent(accountId)}`, { method: "DELETE", body: JSON.stringify(input) }),
  getManagerPinReports: () => request("/api/v1/manager/pin-reports"),
  createManagerPinReport: (input) => request("/api/v1/manager/pin-reports", { method: "POST", body: JSON.stringify(input) }),
  resolveManagerPinReport: (reportId) => request(`/api/v1/manager/pin-reports/${encodeURIComponent(reportId)}/resolve`, { method: "POST", body: "{}" }),
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
  getManagerReminders: () => request("/api/v1/manager/reminders"),
  sendManagerReminder: (learnerId, requestId) => request(`/api/v1/manager/reminders/${encodeURIComponent(learnerId)}`, { method: "POST", body: JSON.stringify({ requestId }) }),
  dismissManagerReminder: (learnerId) => request(`/api/v1/manager/reminders/${encodeURIComponent(learnerId)}/dismiss`, { method: "POST", body: "{}" }),
  copyManagerReminder: (learnerId) => request(`/api/v1/manager/reminders/${encodeURIComponent(learnerId)}/copy`, { method: "POST", body: "{}" }),
  getManagerReport: () => request("/api/v1/manager/report"),
  getManagerSettings: () => request("/api/v1/manager/settings"),
  saveManagerSettings: (input) => request("/api/v1/manager/settings", { method: "PUT", body: JSON.stringify(input) }),
  getProductPreferences: () => request("/api/v1/product-preferences"),
  saveProductPreferences: (input) => request("/api/v1/product-preferences", { method: "PUT", body: JSON.stringify(input) }),
  getSystemCapabilities: () => request("/api/v1/system/capabilities")
};
