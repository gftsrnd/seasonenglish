import type { AccountRole } from "./domain-contract.js";

export const ROLE_PERMISSIONS = {
  learner: ["learning:own", "assessment:own", "coach:own", "profile:own"],
  operator: ["content:operate", "assessment:review", "prompt:manage"],
  manager: ["report:read", "operations:read", "reminder:manage", "reward:preview"]
} as const satisfies Record<AccountRole, readonly string[]>;

export type Permission = (typeof ROLE_PERMISSIONS)[AccountRole][number];

export interface SessionUserView {
  readonly id: string;
  readonly displayName: string;
  readonly email: string | null;
}

export interface SessionView {
  readonly user: SessionUserView;
  readonly role: AccountRole;
  readonly permissions: readonly Permission[];
}
