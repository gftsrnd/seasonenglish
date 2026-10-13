import { describe, expect, it } from "vitest";
import {
  createCredentialHash,
  issueSessionToken,
  permissionsFor,
  sessionTokenHash,
  verifyCredential
} from "../src/identity/index.js";

describe("identity domain", () => {
  it("stores a scrypt credential hash and verifies without retaining plaintext", async () => {
    const encoded = await createCredentialHash("correct horse battery staple");

    expect(encoded).toMatch(/^scrypt\$/);
    expect(encoded).not.toContain("correct horse battery staple");
    await expect(verifyCredential("correct horse battery staple", encoded)).resolves.toBe(true);
    await expect(verifyCredential("wrong password", encoded)).resolves.toBe(false);
  });

  it("issues an opaque session token while storing only its hash", () => {
    const token = issueSessionToken();
    const tokenHash = sessionTokenHash(token);

    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).not.toBe(token);
  });

  it("derives permissions from the account role instead of browser input", () => {
    expect(permissionsFor("learner")).toContain("learning:own");
    expect(permissionsFor("operator")).toContain("content:operate");
    expect(permissionsFor("manager")).toContain("report:read");
    expect(permissionsFor("learner")).not.toContain("content:operate");
  });
});
