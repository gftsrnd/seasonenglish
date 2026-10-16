import type { AccountRole } from "./domain-contract.js";
import type { LearnerAvatarData } from "./learning-contract.js";

export const ROLE_PERMISSIONS = {
  learner: ["learning:own", "assessment:own", "coach:own", "profile:own"],
  operator: ["content:operate", "assessment:review", "prompt:manage"],
  manager: [
    "content:operate", "assessment:review", "prompt:manage",
    "report:read", "operations:read", "reminder:manage", "reward:preview",
    "account:manage", "role:manage", "organisation:manage", "settings:manage"
  ]
} as const satisfies Record<AccountRole, readonly string[]>;

export type Permission = (typeof ROLE_PERMISSIONS)[AccountRole][number];

export interface SessionUserView {
  readonly id: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly avatar?: LearnerAvatarData;
}

export interface SessionView {
  readonly user: SessionUserView;
  readonly role: AccountRole;
  readonly permissions: readonly Permission[];
}
