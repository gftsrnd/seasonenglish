import type { LearnerAvatarData, OrganisationExperienceView, ProductPreferencesView, SessionView } from "@e4s/contracts";
import type { AuthClient } from "../features/auth/contracts.js";
import { request } from "./runtime.js";

export interface SharedApiClient extends AuthClient {
  currentSession(): Promise<SessionView>;
  saveSessionAvatar(avatar: LearnerAvatarData): Promise<SessionView>;
  logout(): Promise<void>;
  getProductPreferences(): Promise<ProductPreferencesView>;
  saveProductPreferences(input: ProductPreferencesView): Promise<ProductPreferencesView>;
  getOrganisationExperience(): Promise<OrganisationExperienceView>;
}

export const sharedApiClient: SharedApiClient = {
  learnerLogin: (input) => request("/api/auth/learner/login", { method: "POST", body: JSON.stringify(input) }),
  staffLogin: (input) => request("/api/auth/staff/login", { method: "POST", body: JSON.stringify(input) }),
  registerLearner: (input) => request("/api/auth/learner/register", { method: "POST", body: JSON.stringify(input) }),
  startLearnerPinReset: (input) => request("/api/auth/learner/pin-reset/start", { method: "POST", body: JSON.stringify(input) }),
  verifyLearnerPinReset: (input) => request("/api/auth/learner/pin-reset/verify", { method: "POST", body: JSON.stringify(input) }),
  completeLearnerPinReset: (input) => request("/api/auth/learner/pin-reset/complete", { method: "POST", body: JSON.stringify(input) }),
  currentSession: () => request("/api/session"),
  saveSessionAvatar: (avatar) => request("/api/v1/me/avatar", { method: "PATCH", body: JSON.stringify(avatar) }),
  logout: () => request("/api/logout", { method: "POST", body: "{}" }),
  getProductPreferences: () => request("/api/v1/product-preferences"),
  saveProductPreferences: (input) => request("/api/v1/product-preferences", { method: "PUT", body: JSON.stringify(input) }),
  getOrganisationExperience: () => request("/api/v1/organisation-experience")
};
