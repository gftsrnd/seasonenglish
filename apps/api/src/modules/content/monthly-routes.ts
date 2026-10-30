import type { AiTaskRunner } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import { localDateString } from "@e4s/domain/calendar";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import { clockForUser } from "../system/clock.js";

const monthParams = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]) });
const frameworkParams = z.object({ frameworkId: z.string().uuid() });
const lessonParams = frameworkParams.extend({ lessonNumber: z.coerce.number().int().min(1).max(23) });
const lessonPart = z.object({ code: z.string().min(1), title: z.string(), content: z.record(z.string(), z.unknown()) });
const lessonInput = z.object({
  lesson: z.object({ dayNumber: z.number().int().min(1).max(23), title: z.string().trim().min(1).max(200), durationMinutes: z.number().int().min(1).max(120), parts: z.array(lessonPart).min(1) })
});

/**
 * Cơ chế tháng — route Vận hành. Mọi luật ngày/giờ đọc clock của tổ chức (hỗ trợ giờ giả lập ở local).
 */
export function registerMonthlyContentRoutes(
  app: FastifyInstance,
  pool: Pool,
  aiRunner?: AiTaskRunner,
  aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>
): void {
  const repositories = createRepositories(pool);
  const readers = createRoleGuard(pool, ["operator", "manager"]);
  const operators = createRoleGuard(pool, ["operator"]);
  const todayFor = async (userId: string) => localDateString((await clockForUser(pool, userId)).now());
  const aiConnected = async (userId: string) => Boolean(aiRunner || (aiRunnerFactory && await aiRunnerFactory(userId).catch(() => undefined)));

  app.get("/api/v1/content/months", { preHandler: readers }, async (request, reply) => {
    const userId = request.e4sSession!.user.id;
    const view = await repositories.monthly.overview(userId, await todayFor(userId), await aiConnected(userId));
    return view ?? reply.code(404).send({ code: "MONTHLY_ORGANIZATION_NOT_FOUND" });
  });

  app.get("/api/v1/content/months/:month/:cefr", { preHandler: readers }, async (request, reply) => {
    const params = monthParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_MONTH" });
    const userId = request.e4sSession!.user.id;
    const view = await repositories.monthly.framework(userId, params.data.month, params.data.cefr, await todayFor(userId));
    return view ?? reply.code(404).send({ code: "MONTHLY_ORGANIZATION_NOT_FOUND" });
  });

  app.post("/api/v1/content/months/:month/:cefr/framework/generate", { preHandler: operators, config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const params = monthParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_MONTH" });
    const userId = request.e4sSession!.user.id;
    return guard(reply, async () => {
      const result = await repositories.monthly.requestFrameworkGeneration(userId, params.data.month, params.data.cefr, await todayFor(userId));
      return reply.code(202).send({ accepted: true, jobId: result.jobId, frameworkId: result.frameworkId });
    });
  });

  app.post("/api/v1/content/month-frameworks/:frameworkId/approve", { preHandler: operators }, async (request, reply) => {
    const params = frameworkParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_FRAMEWORK" });
    return guard(reply, async () => {
      const result = await repositories.monthly.approveFramework(request.e4sSession!.user.id, params.data.frameworkId);
      return reply.code(202).send({ accepted: true, jobId: result.jobId });
    });
  });

  app.get("/api/v1/content/month-frameworks/:frameworkId/lessons/:lessonNumber", { preHandler: readers }, async (request, reply) => {
    const params = lessonParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_LESSON" });
    return guard(reply, async () => {
      const detail = await repositories.monthly.lessonDetail(request.e4sSession!.user.id, params.data.frameworkId, params.data.lessonNumber);
      return detail ?? reply.code(404).send({ code: "MONTHLY_LESSON_NOT_READY" });
    });
  });

  app.put("/api/v1/content/month-frameworks/:frameworkId/lessons/:lessonNumber", { preHandler: operators }, async (request, reply) => {
    const params = lessonParams.safeParse(request.params);
    const body = lessonInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_LESSON" });
    return guard(reply, async () => repositories.monthly.saveLessonDay(
      request.e4sSession!.user.id, params.data.frameworkId, params.data.lessonNumber,
      body.data.lesson as unknown as Parameters<typeof repositories.monthly.saveLessonDay>[3]
    ));
  });

  app.post("/api/v1/content/month-frameworks/:frameworkId/lessons/:lessonNumber/approve", { preHandler: operators }, async (request, reply) => {
    const params = lessonParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_LESSON" });
    return guard(reply, async () => repositories.monthly.approveLessonDay(request.e4sSession!.user.id, params.data.frameworkId, params.data.lessonNumber));
  });

  app.post("/api/v1/content/month-frameworks/:frameworkId/exam/generate", { preHandler: operators }, async (request, reply) => {
    const params = frameworkParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_FRAMEWORK" });
    return guard(reply, async () => {
      const result = await repositories.monthly.requestExamGeneration(request.e4sSession!.user.id, params.data.frameworkId);
      return reply.code(202).send({ accepted: true, jobId: result.jobId });
    });
  });

  app.post("/api/v1/content/month-frameworks/:frameworkId/exam/approve", { preHandler: operators }, async (request, reply) => {
    const params = frameworkParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_FRAMEWORK" });
    return guard(reply, async () => repositories.monthly.approveExam(request.e4sSession!.user.id, params.data.frameworkId));
  });
}

const conflictCodes = new Set([
  "MONTHLY_MONTH_NOT_EDITABLE", "MONTHLY_LEVEL_NOT_ACTIVE", "MONTHLY_FRAMEWORK_ALREADY_APPROVED", "MONTHLY_FRAMEWORK_GENERATING",
  "MONTHLY_FRAMEWORK_EMPTY", "MONTHLY_FRAMEWORK_NOT_APPROVED", "MONTHLY_LESSON_NOT_READY", "MONTHLY_EXAM_ALREADY_APPROVED",
  "MONTHLY_EXAM_NOT_READY", "CONTENT_DAY_MISMATCH"
]);

async function guard<T>(reply: FastifyReply, run: () => Promise<T>): Promise<T | FastifyReply> {
  try {
    return await run();
  } catch (error) {
    const code = error instanceof Error ? error.message : "MONTHLY_UNKNOWN";
    if (code === "MONTHLY_FRAMEWORK_NOT_FOUND") return reply.code(404).send({ code });
    if (code === "MONTHLY_FORBIDDEN") return reply.code(403).send({ code });
    if (code === "CONTENT_VALIDATION_FAILED") return reply.code(422).send({ code, issues: (error as { issues?: unknown }).issues ?? [] });
    if (conflictCodes.has(code)) return reply.code(409).send({ code });
    throw error;
  }
}
