import type { ApiClient } from "../api-client.js";
import { request } from "./runtime.js";

export type SharedApiClient = Pick<ApiClient,
  "learnerLogin" | "staffLogin" | "currentSession" | "saveSessionAvatar" | "logout" |
  "getProductPreferences" | "saveProductPreferences"
>;

export const sharedApiClient: SharedApiClient = {
  learnerLogin: (input) => request("/api/auth/learner/login", { method: "POST", body: JSON.stringify(input) }),
  staffLogin: (input) => request("/api/auth/staff/login", { method: "POST", body: JSON.stringify(input) }),
  currentSession: () => request("/api/session"),
  saveSessionAvatar: (avatar) => request("/api/v1/me/avatar", { method: "PATCH", body: JSON.stringify(avatar) }),
  logout: () => request("/api/logout", { method: "POST", body: "{}" }),
  getProductPreferences: () => request("/api/v1/product-preferences"),
  saveProductPreferences: (input) => request("/api/v1/product-preferences", { method: "PUT", body: JSON.stringify(input) })
};
