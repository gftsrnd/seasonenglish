import type { SessionView } from "@e4s/contracts";

export type { SessionView } from "@e4s/contracts";

export interface StaffLoginCredentials {
  email: string;
  password: string;
}
export type LoginCredentials = StaffLoginCredentials;

export interface LearnerLoginCredentials {
  email: string;
  pin: string;
}

export interface LearnerRegistration {
  displayName: string;
  email: string;
  pin: string;
}

export interface AuthChallengeView { challengeId: string; expiresAt: string; }

export interface AuthClient {
  learnerLogin(input: LearnerLoginCredentials): Promise<SessionView>;
  staffLogin(input: StaffLoginCredentials): Promise<SessionView>;
  registerLearner(input: LearnerRegistration): Promise<SessionView>;
  startLearnerPinReset(input: { email: string }): Promise<AuthChallengeView>;
  verifyLearnerPinReset(input: { challengeId: string; code: string }): Promise<{ resetToken: string }>;
  completeLearnerPinReset(input: { resetToken: string; pin: string }): Promise<{ saved: true }>;
  requestStaffPasswordHelp(input: { email: string }): Promise<{ requested: true }>;
}
