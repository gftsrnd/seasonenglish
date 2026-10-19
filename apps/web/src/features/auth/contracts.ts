import type { SessionView } from "@e4s/contracts";

export type { SessionView } from "@e4s/contracts";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthClient {
  learnerLogin(input: LoginCredentials): Promise<SessionView>;
  staffLogin(input: LoginCredentials): Promise<SessionView>;
}
