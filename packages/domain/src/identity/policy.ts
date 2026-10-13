import { ROLE_PERMISSIONS, type AccountRole, type Permission } from "@e4s/contracts";

export function permissionsFor(role: AccountRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleAllowed(role: AccountRole, allowed: readonly AccountRole[]): boolean {
  return allowed.includes(role);
}
