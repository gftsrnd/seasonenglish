import { createHash, randomBytes } from "node:crypto";

export function issueSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
