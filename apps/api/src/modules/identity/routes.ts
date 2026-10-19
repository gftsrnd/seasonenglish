import { randomUUID } from "node:crypto";
import type { AccountRole, LearnerAvatarData, SessionView } from "@e4s/contracts";
import { createRepositories, type DatabaseRepositories, type UserCredentialRecord, type UserIdentity } from "@e4s/database";
import { createCredentialHash, issueSessionToken, permissionsFor, sessionTokenHash, verifyCredential } from "@e4s/domain/identity";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

const COOKIE_NAME = "e4s_session";
const loginInput = z.object({ email: z.string().trim().email(), password: z.string().min(1) });
const versionedLoginInput = loginInput.extend({ audience: z.enum(["learner", "staff"]) });
const learnerRegistrationInput = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(200)
}).strict();
const avatarInput = z.object({
  acc: z.enum(["none", "leaf", "sun", "flower", "cloud", "star", "drop", "snow"]),
  color: z.enum(["ink", "brown", "olive", "taupe", "orange", "rose"]),
  bg: z.number().int().min(0).max(5)
}).strict();

export interface IdentityRouteOptions {
  pool: Pool;
  secureCookies: boolean;
  sessionTtlMs?: number;
}

export function registerIdentityRoutes(app: FastifyInstance, options: IdentityRouteOptions): void {
  const repositories = createRepositories(options.pool);
  const sessionTtlMs = options.sessionTtlMs ?? 7 * 24 * 60 * 60 * 1_000;

  const login = async (
    request: FastifyRequest,
    reply: FastifyReply,
    audience: "learner" | "staff",
    rawInput: unknown
  ): Promise<SessionView | void> => {
    const parsed = loginInput.safeParse(rawInput);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_LOGIN_INPUT" });

    const account = await repositories.identity.findCredentialByEmail(parsed.data.email);
    if (!account || !(await verifyCredential(parsed.data.password, account.credentialHash))) {
      return reply.code(401).send({ code: "INVALID_CREDENTIALS" });
    }
    if (!roleMatchesAudience(account.role, audience)) {
      return reply.code(403).send({ code: "WRONG_LOGIN_PATH" });
    }
    return createSession(reply, repositories, account, options.secureCookies, sessionTtlMs);
  };

  const currentSession = async (request: FastifyRequest, reply: FastifyReply): Promise<SessionView | void> => {
    const account = await resolveSession(request, repositories);
    if (!account) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    return sessionView(account);
  };

  const logout = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.cookies[COOKIE_NAME];
    if (token) await repositories.identity.revokeSession(sessionTokenHash(token));
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return reply.code(204).send();
  };

  const loginRateLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post("/api/auth/learner/login", loginRateLimit, (request, reply) => login(request, reply, "learner", request.body));
  app.post("/api/auth/staff/login", loginRateLimit, (request, reply) => login(request, reply, "staff", request.body));
  app.post("/api/auth/learner/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = learnerRegistrationInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_LEARNER_REGISTRATION" });
    try {
      const account = await repositories.identity.registerLearner({
        displayName: parsed.data.displayName,
        email: parsed.data.email,
        credentialHash: await createCredentialHash(parsed.data.password)
      });
      reply.code(201);
      return createSession(reply, repositories, account, options.secureCookies, sessionTtlMs);
    } catch (error) {
      if (error instanceof Error && error.message === "LEARNER_REGISTRATION_EMAIL_EXISTS") return reply.code(409).send({ code: error.message });
      if (error instanceof Error && error.message === "LEARNER_REGISTRATION_UNAVAILABLE") return reply.code(503).send({ code: error.message });
      throw error;
    }
  });
  app.get("/api/session", currentSession);
  app.post("/api/logout", logout);

  app.post("/api/v1/sessions", loginRateLimit, async (request, reply) => {
    const parsed = versionedLoginInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_LOGIN_INPUT" });
    return login(request, reply, parsed.data.audience, parsed.data);
  });
  app.get("/api/v1/me", currentSession);
  app.patch("/api/v1/me/avatar", async (request, reply) => {
    const account = await resolveSession(request, repositories);
    if (!account) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    const parsed = avatarInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_AVATAR" });
    const updated = await repositories.identity.updateAvatar(account.id, parsed.data as LearnerAvatarData);
    return sessionView(updated);
  });
  app.delete("/api/v1/sessions/current", logout);
}

function roleMatchesAudience(role: AccountRole, audience: "learner" | "staff"): boolean {
  return audience === "learner" ? role === "learner" : role === "operator" || role === "manager";
}

async function createSession(
  reply: FastifyReply,
  repositories: DatabaseRepositories,
  account: UserIdentity,
  secureCookies: boolean,
  sessionTtlMs: number
): Promise<SessionView> {
  const token = issueSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs);
  await repositories.identity.createSession({
    id: randomUUID(),
    userId: account.id,
    tokenHash: sessionTokenHash(token),
    expiresAt
  });
  reply.setCookie(COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    secure: secureCookies,
    sameSite: secureCookies ? "none" : "lax",
    expires: expiresAt
  });
  return sessionView(account);
}

export async function resolveSession(request: FastifyRequest, repositories: DatabaseRepositories): Promise<UserIdentity | null> {
  const token = request.cookies[COOKIE_NAME];
  return token ? repositories.identity.findActiveSession(sessionTokenHash(token)) : null;
}

export function sessionView(account: UserIdentity): SessionView {
  return {
    user: { id: account.id, displayName: account.displayName, email: account.email, ...(account.avatar ? { avatar: account.avatar } : {}) },
    role: account.role,
    permissions: permissionsFor(account.role)
  };
}
