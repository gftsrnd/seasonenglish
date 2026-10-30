import { createRepositories } from "@e4s/database";
import type { AccountRole } from "@e4s/contracts";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import type { ContentMediaService } from "../media/index.js";
import { createResendReminderEmailSender, type ReminderEmailSender } from "./email.js";

const accountRoles = new Set<AccountRole>(["learner", "operator", "manager"]);
const accountCreateInput = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  role: z.enum(["learner", "operator", "manager"]),
  password: z.string().min(6).max(128)
}).superRefine((input, context) => {
  if (input.role === "learner" && !/^\d{6}$/.test(input.password)) {
    context.addIssue({ code: "custom", path: ["password"], message: "Learner PIN must contain exactly 6 digits" });
  }
  if (input.role !== "learner" && input.password.length < 8) {
    context.addIssue({ code: "custom", path: ["password"], message: "Staff password must contain at least 8 characters" });
  }
});
const accountStatusInput = z.object({ status: z.enum(["active", "disabled", "deleted"]) });
const resetPasswordInput = z.object({ password: z.string().min(6).max(128) });
const managerSettingsInput = z.object({
  programName: z.string().trim().min(1).max(120),
  pilotCycleAction: z.literal("save").optional(),
  aiTestDisabled: z.boolean().default(false),
  reminderInactiveDays: z.number().int().min(1).max(30), weeklyReportEnabled: z.boolean(),
  pilotStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), pilotWeeks: z.number().int().min(2).max(4),
  weekOverride: z.number().int().min(0).max(4), minMinutesPerDay: z.number().int().min(5).max(60),
  courseTheme: z.string().max(160), coachDailyLimit: z.number().int().min(1).max(200),
  testTimed: z.boolean(), testTimes: z.object({ listening: z.number().int().min(1).max(60), reading: z.number().int().min(1).max(60), writing: z.number().int().min(1).max(60), speaking: z.number().int().min(1).max(60) }),
  testWarnLimit: z.number().int().min(1).max(10),
  levelUp: z.object({ days: z.number().int().min(1).max(60), lessons: z.number().min(1).max(100), firstTry: z.number().min(1).max(100), submission: z.number().min(1).max(100), coach: z.number().min(0).max(5), coachTurns: z.number().int().min(0).max(100), wrong: z.number().min(1).max(100), minParts: z.number().int().min(1).max(50) }),
  backgroundMusic: z.object({ enabled: z.boolean(), url: z.string().max(1000), volume: z.number().int().min(0).max(100) }),
  baseWebhookUrl: z.string().max(1000), baseWebhookTemplate: z.string().max(4000),
  monthly: z.object({
    vocabularyCount: z.number().int().min(1).max(89),
    grammarTopicCount: z.number().int().min(1).max(12),
    soundCount: z.number().int().min(1).max(12),
    examDurationMinutes: z.number().int().min(10).max(600),
    coachMonthlyTarget: z.number().int().min(1).max(1000),
    retentionCleanupEnabled: z.boolean(),
    fakeClockAt: z.string().datetime({ offset: true }).nullable()
  }).default({ vocabularyCount: 60, grammarTopicCount: 3, soundCount: 4, examDurationMinutes: 30, coachMonthlyTarget: 100, retentionCleanupEnabled: true, fakeClockAt: null })
}).refine(input => new Date(`${input.pilotStartDate}T00:00:00Z`).getUTCDay() === 1, { path: ["pilotStartDate"], message: "Pilot must start on Monday" });
const managerProviderSettingsInput = z.object({
  provider: z.enum(["claude", "gemini", "openai"]),
  baseUrl: z.string().trim().url().max(1000),
  model: z.string().trim().min(1).max(200),
  speechToTextModel: z.string().trim().max(200),
  credential: z.string().max(4000).optional()
});
const managerProviderTestInput = managerProviderSettingsInput.partial();
const managerDeleteDecisionInput = z.object({ status: z.enum(["approved", "rejected"]), note: z.string().trim().max(2000).default("") });
const managerPinReportInput = z.object({ accountId: z.string().uuid(), note: z.string().trim().min(1).max(2000) });
const managerPurgeConfirmationInput = z.object({});
const managerPurgeInput = z.object({ confirmationToken: z.string().trim().min(20).max(200), confirmationPhrase: z.string().trim().min(1).max(80) });
const managerMaintenanceConfirmationInput = z.object({});
const managerMaintenanceInput = z.object({ confirmationToken: z.string().trim().min(20).max(200), confirmationPhrase: z.string().trim().min(1).max(80) });
const managerImageTestInput = z.object({ source: z.enum(["pexels", "pixabay", "openverse", "wikimedia", "disabled"]), word: z.string().trim().min(1).max(120).default("notebook") });
const placementTestChangeRequestInput = z.object({ developerEmail: z.string().trim().email().max(254), note: z.string().trim().min(1).max(4000) });
const accountIdParams = z.object({ accountId: z.uuid() });
const learnerIdParams = z.object({ learnerId: z.uuid() });
const reminderSendInput = z.object({
  requestId: z.string().min(1).max(128),
  channel: z.enum(["email", "base"])
});
const requestIdParams = z.object({ requestId: z.uuid() });
const reportIdParams = z.object({ reportId: z.uuid() });
const managerMusicTestInput = z.object({ enabled: z.boolean(), url: z.string().max(1000), volume: z.number().int().min(0).max(100) });
const managerWebhookTestInput = z.object({ url: z.string().trim().max(1000), template: z.string().max(4000) });
const managerImportInput = z.object({
  snapshot: z.object({ version: z.literal(1), settings: managerSettingsInput }).passthrough()
});

function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === "string" && accountRoles.has(value as AccountRole);
}

export function registerManagerRoutes(app: FastifyInstance, pool: Pool, options: { maintenanceEnabled?: boolean; mediaService?: ContentMediaService; reminderEmailSender?: ReminderEmailSender } = {}): void {
  const repositories = createRepositories(pool);
  const managerOnly = createRoleGuard(pool, ["manager"]);
  const staffReadOnly = createRoleGuard(pool, ["manager", "operator"]);
  const maintenanceEnabled = options.maintenanceEnabled === true;
  const reminderEmailSender = options.reminderEmailSender ?? (process.env.RESEND_API_KEY
    ? createResendReminderEmailSender({
        apiKey: process.env.RESEND_API_KEY,
        from: process.env.RESEND_FROM_EMAIL ?? "E4S <onboarding@resend.dev>"
      })
    : undefined);

  app.get("/api/v1/manager/progress", { preHandler: managerOnly }, async (request, reply) => {
    const view = await repositories.manager.progress(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
  });

  app.get("/api/v1/manager/operations", { preHandler: managerOnly }, async (request, reply) => {
    const view = await repositories.manager.operations(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
  });

  app.get<{ Params: { learnerId: string } }>("/api/v1/manager/learners/:learnerId", { preHandler: managerOnly }, async (request, reply) => {
    const params = learnerIdParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "MANAGER_LEARNER_ID_INVALID" });
    const view = await repositories.manager.learnerProfile(request.e4sSession!.user.id, params.data.learnerId);
    return view ?? reply.code(404).send({ code: "MANAGER_LEARNER_NOT_FOUND" });
  });

  app.post<{ Params: { learnerId: string } }>("/api/v1/manager/learners/:learnerId/weekly-practice", { preHandler: managerOnly }, async (request, reply) => {
    const params = learnerIdParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "MANAGER_LEARNER_ID_INVALID" });
    const assignment = await repositories.engagement.assignWeeklyPractice({
      staffId: request.e4sSession!.user.id,
      learnerId: params.data.learnerId
    });
    return assignment ?? reply.code(409).send({ code: "WEEKLY_PRACTICE_NOT_ELIGIBLE" });
  });

  app.get("/api/v1/manager/delete-requests", { preHandler: managerOnly }, async (request, reply) => {
    const view = await repositories.manager.deleteRequests(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
  });

  app.post<{ Params: { requestId: string } }>(
    "/api/v1/manager/delete-requests/:requestId/decision",
    { preHandler: managerOnly },
    async (request, reply) => {
      const params = requestIdParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: "MANAGER_DELETE_REQUEST_ID_INVALID" });
      const parsed = managerDeleteDecisionInput.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ code: "MANAGER_DELETE_DECISION_INVALID" });
      try {
        return await repositories.manager.decideDeleteRequest(request.e4sSession!.user.id, params.data.requestId, parsed.data);
      } catch (error) {
        if (error instanceof Error && [
          "MANAGER_ORGANIZATION_NOT_FOUND", "MANAGER_DELETE_REQUEST_NOT_FOUND", "MANAGER_DELETE_REQUEST_ALREADY_DECIDED"
        ].includes(error.message)) return reply.code(error.message === "MANAGER_ORGANIZATION_NOT_FOUND" ? 404 : 409).send({ code: error.message });
        throw error;
      }
    }
  );

  app.get("/api/v1/manager/trash", { preHandler: managerOnly }, async (request, reply) => {
    const view = await repositories.manager.trash(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
  });

  app.post<{ Params: { accountId: string } }>(
    "/api/v1/manager/trash/:accountId/restore",
    { preHandler: managerOnly },
    async (request, reply) => {
      const params = accountIdParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: "MANAGER_ACCOUNT_ID_INVALID" });
      try {
        return await repositories.manager.restoreAccount(request.e4sSession!.user.id, params.data.accountId);
      } catch (error) {
        if (error instanceof Error && ["MANAGER_ORGANIZATION_NOT_FOUND", "MANAGER_TRASH_ACCOUNT_NOT_FOUND"].includes(error.message)) {
          return reply.code(error.message === "MANAGER_ORGANIZATION_NOT_FOUND" ? 404 : 409).send({ code: error.message });
        }
        throw error;
      }
    }
  );

  app.post<{ Params: { accountId: string } }>(
    "/api/v1/manager/trash/:accountId/purge-confirmation",
    { preHandler: managerOnly },
    async (request, reply) => {
      const params = accountIdParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: "MANAGER_ACCOUNT_ID_INVALID" });
      const parsed = managerPurgeConfirmationInput.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ code: "MANAGER_PURGE_CONFIRMATION_INVALID" });
      try {
        return await repositories.manager.issuePurgeConfirmation(request.e4sSession!.user.id, params.data.accountId);
      } catch (error) {
        if (error instanceof Error && ["MANAGER_ORGANIZATION_NOT_FOUND", "MANAGER_TRASH_ACCOUNT_NOT_FOUND"].includes(error.message)) {
          return reply.code(error.message === "MANAGER_ORGANIZATION_NOT_FOUND" ? 404 : 409).send({ code: error.message });
        }
        throw error;
      }
    }
  );

  app.delete<{ Params: { accountId: string } }>(
    "/api/v1/manager/trash/:accountId",
    { preHandler: managerOnly },
    async (request, reply) => {
      const params = accountIdParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: "MANAGER_ACCOUNT_ID_INVALID" });
      const parsed = managerPurgeInput.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ code: "MANAGER_PURGE_CONFIRMATION_INVALID" });
      try {
        await repositories.manager.purgeAccount(request.e4sSession!.user.id, params.data.accountId, parsed.data);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof Error && [
          "MANAGER_ORGANIZATION_NOT_FOUND", "MANAGER_TRASH_ACCOUNT_NOT_FOUND", "MANAGER_SELF_PURGE_FORBIDDEN", "MANAGER_PURGE_CONFIRMATION_INVALID"
        ].includes(error.message)) return reply.code(error.message === "MANAGER_ORGANIZATION_NOT_FOUND" ? 404 : 409).send({ code: error.message });
        throw error;
      }
    }
  );

  app.get("/api/v1/manager/pin-reports", { preHandler: managerOnly }, async (request, reply) => {
    const view = await repositories.manager.pinReports(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
  });

  app.post("/api/v1/manager/pin-reports", { preHandler: managerOnly }, async (request, reply) => {
    const parsed = managerPinReportInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "MANAGER_PIN_REPORT_INVALID" });
    try {
      const report = await repositories.manager.createPinReport(request.e4sSession!.user.id, parsed.data.accountId, parsed.data.note);
      return reply.code(201).send(report);
    } catch (error) {
      if (error instanceof Error && ["MANAGER_ORGANIZATION_NOT_FOUND", "MANAGER_PIN_REPORT_ACCOUNT_NOT_FOUND"].includes(error.message)) {
        return reply.code(error.message === "MANAGER_ORGANIZATION_NOT_FOUND" ? 404 : 400).send({ code: error.message });
      }
      throw error;
    }
  });

  app.post<{ Params: { reportId: string } }>(
    "/api/v1/manager/pin-reports/:reportId/resolve",
    { preHandler: managerOnly },
    async (request, reply) => {
      const params = reportIdParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: "MANAGER_PIN_REPORT_ID_INVALID" });
      try {
        return await repositories.manager.resolvePinReport(request.e4sSession!.user.id, params.data.reportId);
      } catch (error) {
        if (error instanceof Error && ["MANAGER_ORGANIZATION_NOT_FOUND", "MANAGER_PIN_REPORT_NOT_FOUND"].includes(error.message)) {
          return reply.code(error.message === "MANAGER_ORGANIZATION_NOT_FOUND" ? 404 : 409).send({ code: error.message });
        }
        throw error;
      }
    }
  );

  app.post("/api/v1/manager/settings/image-test", { preHandler: managerOnly }, async (request, reply) => {
    const parsed = managerImageTestInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "MANAGER_IMAGE_TEST_INVALID" });
    const testedAt = new Date().toISOString();
    if (parsed.data.source === "disabled" || !options.mediaService) {
      return { status: "unavailable", source: parsed.data.source, provider: null, cached: false, imageUrl: null, attribution: null, testedAt } as const;
    }
    try {
      const result = await options.mediaService.diagnoseForUser(request.e4sSession!.user.id, {
        term: parsed.data.word,
        partOfSpeech: "noun",
        allowProviderFallback: true
      });
      const image = result.image;
      return {
        status: image.status,
        source: parsed.data.source,
        provider: result.provider,
        cached: result.cached,
        imageUrl: image.status === "available" ? image.imageUrl : null,
        attribution: image.status === "available" ? image.attribution : null,
        testedAt
      } as const;
    } catch {
      return reply.code(502).send({ code: "MANAGER_IMAGE_TEST_UNAVAILABLE" });
    }
  });

  app.post("/api/v1/manager/settings/image-cache", { preHandler: managerOnly }, async (request, reply) => {
    try {
      return options.mediaService
        ? await options.mediaService.clearForUser(request.e4sSession!.user.id)
        : { cleared: 0 };
    } catch (error) {
      return sendManagerOperationsError(reply, error);
    }
  });

  app.post("/api/v1/manager/settings/music-test", { preHandler: managerOnly }, async (request, reply) => {
    const parsed = managerMusicTestInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "MANAGER_MUSIC_TEST_INVALID" });
    try {
      return await repositories.manager.testMusic(request.e4sSession!.user.id, parsed.data);
    } catch (error) {
      return sendManagerOperationsError(reply, error);
    }
  });

  app.post("/api/v1/manager/settings/music-reset", { preHandler: managerOnly }, async (request, reply) => {
    try {
      return await repositories.manager.resetMusic(request.e4sSession!.user.id);
    } catch (error) {
      return sendManagerOperationsError(reply, error);
    }
  });

  app.post("/api/v1/manager/settings/webhook-test", { preHandler: managerOnly }, async (request, reply) => {
    const parsed = managerWebhookTestInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "MANAGER_WEBHOOK_TEST_INVALID" });
    try {
      return await repositories.manager.testWebhook(request.e4sSession!.user.id, parsed.data);
    } catch (error) {
      return sendManagerOperationsError(reply, error);
    }
  });

  app.get("/api/v1/manager/settings/export", { preHandler: managerOnly }, async (request, reply) => {
    try {
      const view = await repositories.manager.exportData(request.e4sSession!.user.id);
      return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
    } catch (error) {
      return sendManagerOperationsError(reply, error);
    }
  });

  app.post("/api/v1/manager/settings/import", { preHandler: managerOnly }, async (request, reply) => {
    const parsed = managerImportInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "MANAGER_DATA_IMPORT_INVALID" });
    try {
      return await repositories.manager.importData(request.e4sSession!.user.id, parsed.data.snapshot);
    } catch (error) {
      if (error instanceof Error && error.message === "MANAGER_DATA_IMPORT_INVALID") return reply.code(400).send({ code: error.message });
      return sendManagerOperationsError(reply, error);
    }
  });

  app.post("/api/v1/manager/settings/seed-confirmation", { preHandler: managerOnly }, async (request, reply) => {
    if (!maintenanceEnabled) return reply.code(404).send({ code: "MANAGER_MAINTENANCE_DISABLED" });
    const parsed = managerMaintenanceConfirmationInput.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: "MANAGER_MAINTENANCE_CONFIRMATION_INVALID" });
    try {
      return await repositories.manager.issueMaintenanceConfirmation(request.e4sSession!.user.id, "seed_demo");
    } catch (error) {
      return sendMaintenanceError(reply, error);
    }
  });

  app.post("/api/v1/manager/settings/seed", { preHandler: managerOnly }, async (request, reply) => {
    if (!maintenanceEnabled) return reply.code(404).send({ code: "MANAGER_MAINTENANCE_DISABLED" });
    const parsed = managerMaintenanceInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "MANAGER_MAINTENANCE_CONFIRMATION_INVALID" });
    try {
      return await repositories.manager.runMaintenance(request.e4sSession!.user.id, "seed_demo", parsed.data);
    } catch (error) {
      return sendMaintenanceError(reply, error);
    }
  });

  app.post("/api/v1/manager/settings/wipe-confirmation", { preHandler: managerOnly }, async (request, reply) => {
    if (!maintenanceEnabled) return reply.code(404).send({ code: "MANAGER_MAINTENANCE_DISABLED" });
    const parsed = managerMaintenanceConfirmationInput.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: "MANAGER_MAINTENANCE_CONFIRMATION_INVALID" });
    try {
      return await repositories.manager.issueMaintenanceConfirmation(request.e4sSession!.user.id, "wipe_data");
    } catch (error) {
      return sendMaintenanceError(reply, error);
    }
  });

  app.post("/api/v1/manager/settings/wipe", { preHandler: managerOnly }, async (request, reply) => {
    if (!maintenanceEnabled) return reply.code(404).send({ code: "MANAGER_MAINTENANCE_DISABLED" });
    const parsed = managerMaintenanceInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "MANAGER_MAINTENANCE_CONFIRMATION_INVALID" });
    try {
      return await repositories.manager.runMaintenance(request.e4sSession!.user.id, "wipe_data", parsed.data);
    } catch (error) {
      return sendMaintenanceError(reply, error);
    }
  });

  app.get("/api/v1/manager/provider-settings", { preHandler: managerOnly }, async (request, reply) => {
    try {
      const view = await repositories.manager.providerSettings(request.e4sSession!.user.id);
      return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
    } catch (error) {
      return sendProviderSettingsError(reply, error);
    }
  });

  app.put("/api/v1/manager/provider-settings", { preHandler: managerOnly }, async (request, reply) => {
    const parsed = managerProviderSettingsInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "PROVIDER_SETTINGS_INPUT_INVALID" });
    try {
      return await repositories.manager.saveProviderSettings(request.e4sSession!.user.id, parsed.data);
    } catch (error) {
      return sendProviderSettingsError(reply, error);
    }
  });

  app.post("/api/v1/manager/provider-settings/test", { preHandler: managerOnly }, async (request, reply) => {
    const parsed = managerProviderTestInput.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: "PROVIDER_SETTINGS_TEST_INPUT_INVALID" });
    try {
      return await repositories.manager.testProviderSettings(request.e4sSession!.user.id, parsed.data);
    } catch (error) {
      return sendProviderSettingsError(reply, error);
    }
  });

  app.get("/api/v1/manager/accounts", { preHandler: managerOnly }, async (request, reply) => {
    const view = await repositories.manager.accounts(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
  });

  app.get("/api/v1/operator/settings-overview", { preHandler: staffReadOnly }, async (request, reply) => {
    const view = await repositories.manager.operatorSettingsOverview(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
  });

  app.put("/api/v1/operator/settings", { preHandler: staffReadOnly }, async (request, reply) => {
    const parsed = managerSettingsInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "OPERATOR_SETTINGS_INVALID" });
    try {
      const { pilotCycleAction, ...settings } = parsed.data;
      const saved = await repositories.manager.saveSettings(request.e4sSession!.user.id, { ...settings, ...(pilotCycleAction ? { pilotCycleAction } : {}) });
      return saved ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
    } catch (error) {
      if (error instanceof Error && error.message === "PILOT_WEEKS_CANNOT_DECREASE") return reply.code(409).send({ code: error.message });
      throw error;
    }
  });

  app.post("/api/v1/manager/accounts", { preHandler: managerOnly }, async (request, reply) => {
    const parsed = accountCreateInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "MANAGER_ACCOUNT_INPUT_INVALID" });
    try {
      const account = await repositories.manager.createAccount(request.e4sSession!.user.id, {
        ...parsed.data,
        recoverableCredential: parsed.data.password,
        credentialHash: parsed.data.role === "learner"
          ? await createPinHash(parsed.data.password)
          : await createCredentialHash(parsed.data.password)
      });
      return reply.code(201).send(account);
    } catch (error) {
      if (error instanceof Error && error.message === "MANAGER_ACCOUNT_EMAIL_EXISTS") {
        return reply.code(409).send({ code: error.message });
      }
      throw error;
    }
  });

  app.patch<{ Params: { accountId: string }; Body: { role?: unknown } }>(
    "/api/v1/manager/accounts/:accountId/role",
    { preHandler: managerOnly },
    async (request, reply) => {
      const params = accountIdParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: "MANAGER_ACCOUNT_ID_INVALID" });
      const role = request.body?.role;
      if (!isAccountRole(role)) return reply.code(400).send({ code: "MANAGER_ROLE_INVALID" });
      try {
        return await repositories.manager.changeAccountRole(request.e4sSession!.user.id, params.data.accountId, role);
      } catch (error) {
        if (error instanceof Error && error.message === "MANAGER_ACCOUNT_NOT_FOUND") return reply.code(404).send({ code: error.message });
        if (error instanceof Error && ["MANAGER_LAST_ADMIN_REQUIRED", "MANAGER_SELF_ROLE_CHANGE_FORBIDDEN"].includes(error.message)) {
          return reply.code(409).send({ code: error.message });
        }
        throw error;
      }
    }
  );

  app.patch("/api/v1/manager/accounts/:accountId/status", { preHandler: managerOnly }, async (request, reply) => {
    const body = accountStatusInput.safeParse(request.body);
    const params = accountIdParams.safeParse(request.params);
    if (!body.success) return reply.code(400).send({ code: "MANAGER_ACCOUNT_STATUS_INVALID" });
    if (!params.success) return reply.code(400).send({ code: "MANAGER_ACCOUNT_ID_INVALID" });
    try {
      return await repositories.manager.changeAccountStatus(request.e4sSession!.user.id, params.data.accountId, body.data.status);
    } catch (error) {
      if (error instanceof Error && error.message === "MANAGER_ACCOUNT_NOT_FOUND") return reply.code(404).send({ code: error.message });
      if (error instanceof Error && ["MANAGER_LAST_ADMIN_REQUIRED", "MANAGER_SELF_STATUS_CHANGE_FORBIDDEN"].includes(error.message)) {
        return reply.code(409).send({ code: error.message });
      }
      throw error;
    }
  });

  app.get("/api/v1/manager/accounts/:accountId/pin", { preHandler: managerOnly }, async (request, reply) => {
    const params = accountIdParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "MANAGER_ACCOUNT_ID_INVALID" });
    try {
      return { pin: await repositories.manager.revealAccountPin(request.e4sSession!.user.id, params.data.accountId) };
    } catch (error) {
      if (error instanceof Error && error.message === "MANAGER_ACCOUNT_NOT_FOUND") return reply.code(404).send({ code: error.message });
      if (error instanceof Error && error.message === "MANAGER_ACCOUNT_PIN_UNAVAILABLE") return reply.code(409).send({ code: error.message });
      if (error instanceof Error && error.message === "MANAGER_ACCOUNT_PIN_DECRYPT_FAILED") return reply.code(500).send({ code: error.message });
      throw error;
    }
  });

  app.get("/api/v1/manager/accounts/:accountId/credential", { preHandler: managerOnly }, async (request, reply) => {
    const params = accountIdParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "MANAGER_ACCOUNT_ID_INVALID" });
    try {
      return await repositories.manager.revealAccountCredential(request.e4sSession!.user.id, params.data.accountId);
    } catch (error) {
      if (error instanceof Error && error.message === "MANAGER_ACCOUNT_NOT_FOUND") return reply.code(404).send({ code: error.message });
      if (error instanceof Error && error.message === "MANAGER_ACCOUNT_CREDENTIAL_UNAVAILABLE") return reply.code(409).send({ code: error.message });
      if (error instanceof Error && error.message === "MANAGER_ACCOUNT_CREDENTIAL_DECRYPT_FAILED") return reply.code(500).send({ code: error.message });
      throw error;
    }
  });

  app.post("/api/v1/manager/accounts/:accountId/password-reset", { preHandler: managerOnly }, async (request, reply) => {
    const body = resetPasswordInput.safeParse(request.body);
    const params = accountIdParams.safeParse(request.params);
    if (!body.success) return reply.code(400).send({ code: "MANAGER_ACCOUNT_PASSWORD_INVALID" });
    if (!params.success) return reply.code(400).send({ code: "MANAGER_ACCOUNT_ID_INVALID" });
    const directory = await repositories.manager.accounts(request.e4sSession!.user.id);
    const target = directory?.accounts.find(account => account.id === params.data.accountId);
    if (!target) return reply.code(404).send({ code: "MANAGER_ACCOUNT_NOT_FOUND" });
    if (target.role === "learner" && !/^\d{6}$/.test(body.data.password)) {
      return reply.code(400).send({ code: "MANAGER_ACCOUNT_PASSWORD_INVALID" });
    }
    if (target.role !== "learner" && body.data.password.length < 8) {
      return reply.code(400).send({ code: "MANAGER_ACCOUNT_PASSWORD_INVALID" });
    }
    const saved = await repositories.manager.resetAccountCredential(
      request.e4sSession!.user.id,
      params.data.accountId,
      target.role === "learner" ? await createPinHash(body.data.password) : await createCredentialHash(body.data.password),
      body.data.password
    );
    return saved ? { saved: true } : reply.code(404).send({ code: "MANAGER_ACCOUNT_NOT_FOUND" });
  });

  app.get("/api/v1/manager/reminders", { preHandler: managerOnly }, async (request, reply) => {
    const view = await repositories.manager.reminders(request.e4sSession!.user.id);
    return view ? { ...view, emailConfigured: Boolean(reminderEmailSender) } : reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
  });

  app.post<{ Params: { learnerId: string }; Body: { requestId?: unknown; channel?: unknown } }>(
    "/api/v1/manager/reminders/:learnerId",
    { preHandler: managerOnly },
    async (request, reply) => {
      const params = learnerIdParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: "MANAGER_REMINDER_LEARNER_ID_INVALID" });
      const body = reminderSendInput.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ code: "MANAGER_REMINDER_REQUEST_INVALID" });
      if (body.data.channel === "email" && !reminderEmailSender) {
        return reply.code(503).send({ code: "MANAGER_REMINDER_EMAIL_NOT_CONFIGURED" });
      }
      try {
        const queued = await repositories.manager.queueReminder(
          request.e4sSession!.user.id,
          params.data.learnerId,
          body.data.requestId,
          body.data.channel
        );
        if (body.data.channel === "base" || queued.deliveryStatus !== "queued") return queued;
        const delivery = await repositories.notifications.claimEmailDelivery(queued.reminderId);
        if (!delivery) return queued;
        try {
          const sent = await reminderEmailSender!.sendReminder({
            to: delivery.recipient,
            learnerName: delivery.learnerName,
            message: delivery.message
          });
          await repositories.notifications.updateReminderDelivery({
            reminderId: delivery.reminderId,
            deliveryId: delivery.deliveryId,
            status: "sent",
            externalId: sent.externalId,
            response: { provider: "resend", accepted: true }
          });
          return { ...queued, status: "sent" as const, deliveryStatus: "sent" as const };
        } catch {
          await repositories.notifications.updateReminderDelivery({
            reminderId: delivery.reminderId,
            deliveryId: delivery.deliveryId,
            status: "failed",
            response: { provider: "resend", accepted: false, code: "PROVIDER_REQUEST_FAILED" }
          });
          return reply.code(502).send({ code: "MANAGER_REMINDER_EMAIL_DELIVERY_FAILED" });
        }
      } catch (error) {
        if (error instanceof Error && error.message === "MANAGER_REMINDER_LEARNER_NOT_FOUND") return reply.code(404).send({ code: error.message });
        if (error instanceof Error && ["MANAGER_REMINDER_RETRY_UNAVAILABLE", "MANAGER_REMINDER_REQUEST_REUSED", "MANAGER_REMINDER_NOT_ELIGIBLE"].includes(error.message)) return reply.code(409).send({ code: error.message });
        if (error instanceof Error && ["MANAGER_REMINDER_EMAIL_MISSING", "MANAGER_REMINDER_BASE_WEBHOOK_MISSING"].includes(error.message)) return reply.code(422).send({ code: error.message });
        throw error;
      }
    }
  );

  app.post<{ Params: { learnerId: string } }>(
    "/api/v1/manager/reminders/:learnerId/dismiss",
    { preHandler: managerOnly },
    async (request, reply) => {
      const params = learnerIdParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: "MANAGER_REMINDER_LEARNER_ID_INVALID" });
      try {
        return await repositories.manager.dismissReminder(request.e4sSession!.user.id, params.data.learnerId);
      } catch (error) {
        if (error instanceof Error && error.message === "MANAGER_ORGANIZATION_NOT_FOUND") {
          return reply.code(404).send({ code: error.message });
        }
        if (error instanceof Error && error.message === "MANAGER_REMINDER_LEARNER_NOT_FOUND") {
          return reply.code(404).send({ code: error.message });
        }
        if (error instanceof Error && error.message === "MANAGER_REMINDER_NOT_ELIGIBLE") {
          return reply.code(409).send({ code: error.message });
        }
        throw error;
      }
    }
  );

  app.post<{ Params: { learnerId: string } }>(
    "/api/v1/manager/reminders/:learnerId/copy",
    { preHandler: managerOnly },
    async (request, reply) => {
      const params = learnerIdParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: "MANAGER_REMINDER_LEARNER_ID_INVALID" });
      try {
        return await repositories.manager.copyReminder(request.e4sSession!.user.id, params.data.learnerId);
      } catch (error) {
        if (error instanceof Error && error.message === "MANAGER_ORGANIZATION_NOT_FOUND") {
          return reply.code(404).send({ code: error.message });
        }
        if (error instanceof Error && error.message === "MANAGER_REMINDER_LEARNER_NOT_FOUND") {
          return reply.code(404).send({ code: error.message });
        }
        if (error instanceof Error && error.message === "MANAGER_REMINDER_NOT_ELIGIBLE") {
          return reply.code(409).send({ code: error.message });
        }
        throw error;
      }
    }
  );

  app.get("/api/v1/manager/report", { preHandler: managerOnly }, async (request, reply) => {
    const view = await repositories.manager.report(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
  });

  app.get("/api/v1/manager/settings", { preHandler: managerOnly }, async (request, reply) => {
    const view = await repositories.manager.settings(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
  });

  app.post("/api/v1/operator/placement-test-change-request", { preHandler: staffReadOnly }, async (request, reply) => {
    const parsed = placementTestChangeRequestInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "PLACEMENT_TEST_CHANGE_REQUEST_INVALID" });
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return reply.code(503).send({ code: "EMAIL_UNAVAILABLE" });
    const actor = await pool.query<{ display_name: string; email: string; organization_id: string }>("select display_name, email, organization_id from users where id = $1", [request.e4sSession!.user.id]);
    const user = actor.rows[0];
    if (!user) return reply.code(404).send({ code: "OPERATOR_NOT_FOUND" });
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? "E4S <onboarding@resend.dev>", to: [parsed.data.developerEmail], subject: "E4S · Yêu cầu đổi đề đầu vào", text: `Người gửi: ${user.display_name} <${user.email}>\n\n${parsed.data.note}` }) });
    if (!response.ok) return reply.code(502).send({ code: "PLACEMENT_TEST_CHANGE_REQUEST_FAILED" });
    await pool.query(`insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id) values (gen_random_uuid(), $1, $2, 'assessment.placement_change_requested', 'assessment_definition', $1, $3::jsonb, gen_random_uuid())`, [user.organization_id, request.e4sSession!.user.id, JSON.stringify({ developerEmail: parsed.data.developerEmail, note: parsed.data.note })]);
    return { sent: true };
  });

  app.put(
    "/api/v1/manager/settings",
    { preHandler: managerOnly },
    async (request, reply) => {
      const parsed = managerSettingsInput.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "MANAGER_SETTINGS_INVALID" });
      }
      try {
        const { pilotCycleAction, ...settings } = parsed.data;
        const saved = await repositories.manager.saveSettings(request.e4sSession!.user.id, { ...settings, ...(pilotCycleAction ? { pilotCycleAction } : {}) });
        return saved ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
      } catch (error) {
        if (error instanceof Error && error.message === "PILOT_WEEKS_CANNOT_DECREASE") return reply.code(409).send({ code: error.message });
        throw error;
      }
    }
  );
}

function sendProviderSettingsError(reply: { code: (status: number) => { send: (payload: unknown) => unknown } }, error: unknown): unknown {
  if (error instanceof Error && error.message === "MANAGER_ORGANIZATION_NOT_FOUND") {
    return reply.code(404).send({ code: error.message });
  }
  if (error instanceof Error && [
    "PROVIDER_SETTINGS_ENCRYPTION_KEY_MISSING",
    "PROVIDER_SETTINGS_ENCRYPTION_KEY_INVALID",
    "PROVIDER_SETTINGS_DECRYPT_FAILED"
  ].includes(error.message)) {
    return reply.code(503).send({ code: "PROVIDER_SETTINGS_ENCRYPTION_UNAVAILABLE" });
  }
  return reply.code(500).send({ code: "PROVIDER_SETTINGS_UNAVAILABLE" });
}

function sendManagerOperationsError(reply: { code: (status: number) => { send: (payload: unknown) => unknown } }, error: unknown): unknown {
  if (error instanceof Error && error.message === "MANAGER_ORGANIZATION_NOT_FOUND") {
    return reply.code(404).send({ code: error.message });
  }
  if (error instanceof Error && error.message === "MANAGER_DATA_IMPORT_INVALID") {
    return reply.code(400).send({ code: error.message });
  }
  return reply.code(500).send({ code: "MANAGER_OPERATION_UNAVAILABLE" });
}

function sendMaintenanceError(reply: { code: (status: number) => { send: (payload: unknown) => unknown } }, error: unknown): unknown {
  if (error instanceof Error && error.message === "MANAGER_ORGANIZATION_NOT_FOUND") {
    return reply.code(404).send({ code: error.message });
  }
  if (error instanceof Error && error.message === "MANAGER_MAINTENANCE_TARGET_INVALID") {
    return reply.code(409).send({ code: error.message });
  }
  if (error instanceof Error && ["MANAGER_MAINTENANCE_CONFIRMATION_INVALID", "MANAGER_MAINTENANCE_BACKUP_REQUIRED"].includes(error.message)) {
    return reply.code(409).send({ code: error.message });
  }
  return reply.code(500).send({ code: "MANAGER_MAINTENANCE_UNAVAILABLE" });
}
