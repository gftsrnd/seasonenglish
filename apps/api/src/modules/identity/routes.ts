import { createHmac, createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { AccountRole, LearnerAvatarData, SessionView } from "@e4s/contracts";
import { createRepositories, type DatabaseRepositories, type UserCredentialRecord, type UserIdentity } from "@e4s/database";
import { createPinHash, issueSessionToken, permissionsFor, sessionTokenHash, verifyCredential } from "@e4s/domain/identity";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { identityEmailDeliveryFailure, type IdentityEmailSender, type IdentityOtpPurpose } from "./email.js";

const COOKIE_NAME = "e4s_session";
const staffLoginInput = z.object({ email: z.string().trim().email(), password: z.string().min(1) });
const learnerLoginInput = z.object({ email: z.string().trim().email(), pin: z.string().regex(/^\d{6}$/) });
const versionedLoginInput = z.object({
  audience: z.enum(["learner", "staff"]),
  email: z.string().trim().email(),
  password: z.string().optional(),
  pin: z.string().optional()
});
const learnerRegistrationInput = z.object({
  displayName: z.string().trim().min(2).max(120).refine(isValidHumanName),
  email: z.string().trim().email().max(320),
  pin: z.string().regex(/^\d{6}$/)
}).strict();
const challengeVerificationInput = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
const pinResetStartInput = z.object({ email: z.string().trim().email().max(320) }).strict();
const staffPasswordHelpInput = z.object({ email: z.string().trim().email().max(320) }).strict();
const pinResetCompleteInput = z.object({ resetToken: z.string().min(32).max(256), pin: z.string().regex(/^\d{6}$/) }).strict();
const avatarInput = z.object({
  acc: z.enum(["none", "leaf", "sun", "flower", "cloud", "star", "drop", "snow"]),
  color: z.enum(["ink", "brown", "olive", "taupe", "orange", "rose"]),
  bg: z.number().int().min(0).max(5)
}).strict();

export interface IdentityRouteOptions {
  pool: Pool;
  secureCookies: boolean;
  sessionTtlMs?: number;
  emailSender?: IdentityEmailSender;
  otpSecret: string;
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
    const parsed = (audience === "learner" ? learnerLoginInput : staffLoginInput).safeParse(rawInput);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_LOGIN_INPUT" });

    const account = await repositories.identity.findCredentialByEmail(parsed.data.email);
    if (!account) {
      const deletedAccount = await repositories.identity.findUserByEmail(parsed.data.email);
      if (deletedAccount?.status === "deleted") return reply.code(403).send({ code: "ACCOUNT_DELETED" });
      return reply.code(401).send({ code: "INVALID_CREDENTIALS" });
    }
    const credential = audience === "learner" ? (parsed.data as z.infer<typeof learnerLoginInput>).pin : (parsed.data as z.infer<typeof staffLoginInput>).password;
    if (!(await verifyCredential(credential, account.credentialHash))) {
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
  app.post("/api/auth/staff/password-help", { config: { rateLimit: { max: 5, timeWindow: "5 minutes" } } }, async (request, reply) => {
    const parsed = staffPasswordHelpInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_EMAIL" });
    await repositories.identity.requestStaffPasswordHelp(parsed.data.email);
    return reply.code(202).send({ requested: true });
  });
  app.post("/api/auth/learner/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = learnerRegistrationInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_LEARNER_REGISTRATION" });
    try {
      const account = await repositories.identity.registerLearner({
        displayName: normalizeHumanName(parsed.data.displayName),
        email: parsed.data.email,
        credentialHash: await createPinHash(parsed.data.pin)
      });
      reply.code(201);
      return createSession(reply, repositories, account, options.secureCookies, sessionTtlMs);
    } catch (error) {
      if (error instanceof Error && ["LEARNER_REGISTRATION_EMAIL_EXISTS", "LEARNER_REGISTRATION_EMAIL_DELETED"].includes(error.message)) {
        return reply.code(409).send({ code: error.message });
      }
      if (error instanceof Error && error.message === "LEARNER_REGISTRATION_UNAVAILABLE") return reply.code(503).send({ code: error.message });
      throw error;
    }
  });
  app.post("/api/auth/learner/pin-reset/start", { config: { rateLimit: { max: 5, timeWindow: "5 minutes" } } }, async (request, reply) => {
    const parsed = pinResetStartInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_EMAIL" });
    if (!options.emailSender) return reply.code(503).send({ code: "EMAIL_DELIVERY_UNAVAILABLE" });
    const account = await repositories.identity.findUserByEmail(parsed.data.email);
    const eligible = account?.role === "learner" && account.status === "active";
    const challengeId = randomUUID();
    const code = otpCode();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await options.pool.query(
      `insert into auth_challenges (id, kind, email, user_id, code_hash, expires_at)
       values ($1, 'pin_reset', lower($2), $3, $4, $5)`,
      [challengeId, parsed.data.email, eligible ? account.id : null, otpHash(options.otpSecret, challengeId, parsed.data.email, code), expiresAt]
    );
    if (eligible) {
      try {
        await options.emailSender.sendOtp({ to: parsed.data.email.toLowerCase(), code, purpose: "pin_reset" });
      } catch (error) {
        console.error("[identity-email] PIN reset delivery failed", identityEmailDeliveryFailure(error));
        await options.pool.query("delete from auth_challenges where id = $1", [challengeId]);
        return reply.code(503).send({ code: "EMAIL_DELIVERY_FAILED" });
      }
    } else {
      console.info("[identity-email] PIN reset email not sent", {
        reason: account === null ? "account_not_found" : account.role !== "learner" ? "not_a_learner" : "account_not_active",
        challengeId
      });
    }
    return reply.code(202).send({ challengeId, expiresAt });
  });
  app.post("/api/auth/learner/pin-reset/verify", { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } }, async (request, reply) => {
    const parsed = challengeVerificationInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_VERIFICATION_INPUT" });
    const challenge = await verifyChallenge(options.pool, options.otpSecret, parsed.data.challengeId, parsed.data.code, "pin_reset");
    if (!challenge?.userId) return reply.code(400).send({ code: "INVALID_OR_EXPIRED_CODE" });
    const resetToken = randomBytes(32).toString("hex");
    await options.pool.query(
      "update auth_challenges set verified_at = now(), reset_token_hash = $2, reset_token_expires_at = now() + interval '10 minutes' where id = $1",
      [challenge.id, tokenHash(resetToken)]
    );
    return { resetToken };
  });
  app.post("/api/auth/learner/pin-reset/complete", { config: { rateLimit: { max: 5, timeWindow: "5 minutes" } } }, async (request, reply) => {
    const parsed = pinResetCompleteInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_PIN_RESET_INPUT" });
    const client = await options.pool.connect();
    try {
      await client.query("begin");
      const found = await client.query<{ id: string; user_id: string; organization_id: string }>(
        `select ac.id, ac.user_id, u.organization_id
         from auth_challenges ac join users u on u.id = ac.user_id
         where ac.kind = 'pin_reset' and ac.reset_token_hash = $1 and ac.verified_at is not null
           and ac.reset_token_expires_at > now() and ac.consumed_at is null and u.role = 'learner' and u.status = 'active'
         for update`,
        [tokenHash(parsed.data.resetToken)]
      );
      const row = found.rows[0];
      if (!row) {
        await client.query("rollback");
        return reply.code(400).send({ code: "INVALID_OR_EXPIRED_RESET_TOKEN" });
      }
      await client.query("update user_credentials set credential_hash = $2, updated_at = now() where user_id = $1", [row.user_id, await createPinHash(parsed.data.pin)]);
      await client.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [row.user_id]);
      await client.query("update auth_challenges set consumed_at = now() where id = $1", [row.id]);
      await client.query(
        `insert into manager_pin_reports (id, organization_id, subject_user_id, note, status, created_by, resolved_by, resolved_at)
         values ($1, $2, $3, $4, 'done', $3, $3, now())`,
        [randomUUID(), row.organization_id, row.user_id, "Người học đã tự đổi PIN qua xác minh email."]
      );
      await client.query("commit");
      return { saved: true };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
  app.get("/api/session", currentSession);
  app.post("/api/logout", logout);

  app.post("/api/v1/sessions", loginRateLimit, async (request, reply) => {
    const parsed = versionedLoginInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_LOGIN_INPUT" });
    if (parsed.data.audience === "learner" && !parsed.data.pin) return reply.code(400).send({ code: "INVALID_LOGIN_INPUT" });
    if (parsed.data.audience === "staff" && !parsed.data.password) return reply.code(400).send({ code: "INVALID_LOGIN_INPUT" });
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

interface VerifiedChallenge {
  id: string;
  email: string;
  userId: string | null;
  payload: unknown;
}

async function verifyChallenge(pool: Pool, secret: string, id: string, code: string, kind: IdentityOtpPurpose): Promise<VerifiedChallenge | null> {
  const result = await pool.query<{
    id: string; email: string; user_id: string | null; code_hash: string; payload: unknown;
  }>(
    `select id, email, user_id, code_hash, payload from auth_challenges
     where id = $1 and kind = $2 and expires_at > now() and consumed_at is null and attempt_count < max_attempts`,
    [id, kind]
  );
  const row = result.rows[0];
  if (!row) return null;
  const expected = otpHash(secret, id, row.email, code);
  const valid = safeStringEqual(row.code_hash, expected);
  if (!valid) {
    await pool.query("update auth_challenges set attempt_count = attempt_count + 1 where id = $1", [id]);
    return null;
  }
  return { id: row.id, email: row.email, userId: row.user_id, payload: row.payload };
}

function otpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function otpHash(secret: string, challengeId: string, email: string, code: string): string {
  return createHmac("sha256", secret).update(`${challengeId}:${email.trim().toLowerCase()}:${code}`).digest("hex");
}

function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeStringEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeHumanName(value: string): string {
  return value.trim().replace(/\s+/g, " ").normalize("NFC");
}

function isValidHumanName(value: string): boolean {
  const tokens = normalizeHumanName(value).split(" ");
  return tokens.length >= 2 && tokens.every((token) => /^[\p{L}\p{M}]+(?:[-'][\p{L}\p{M}]+)*$/u.test(token));
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
