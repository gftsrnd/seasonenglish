import { randomUUID } from "node:crypto";
import { createRepositories } from "@e4s/database";
import { localDateString } from "@e4s/domain/calendar";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import { clockForUser } from "../system/clock.js";

const idParam = z.object({ id: z.string().uuid() });
const decisionInput = z.object({ decision: z.enum(["approved", "rejected"]), resolution: z.string().trim().max(1000).optional() });
const noteInput = z.object({ note: z.string().trim().max(1000).optional() });

/**
 * Quản lý · Tháng học: khiếu nại thi tháng, báo cáo xin mở, tài khoản khoá vì vắng.
 * Job hằng ngày được xếp lười (idempotent theo ngày) để không cần scheduler riêng.
 */
export function registerManagerMonthlyRoutes(app: FastifyInstance, pool: Pool): void {
  const repositories = createRepositories(pool);
  const managerOnly = createRoleGuard(pool, ["manager"]);

  app.get("/api/v1/manager/month", { preHandler: managerOnly }, async (request, reply) => {
    const managerId = request.e4sSession!.user.id;
    const now = (await clockForUser(pool, managerId)).now();
    await enqueueDailyMaintenance(repositories, now);
    // Quản lý mở màn thì chạy luôn một lượt để số liệu đúng ngay (job nền vẫn chạy lại idempotent).
    await repositories.monthlyManager.runDailyMaintenance(now);
    const view = await repositories.monthlyManager.managerView(managerId, now);
    return view ?? reply.code(404).send({ code: "MANAGER_ORGANIZATION_NOT_FOUND" });
  });

  app.post("/api/v1/manager/month/exam-appeals/:id/decision", { preHandler: managerOnly }, async (request, reply) => {
    const params = idParam.safeParse(request.params);
    const body = decisionInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "MONTHLY_DECISION_INVALID" });
    const managerId = request.e4sSession!.user.id;
    const now = (await clockForUser(pool, managerId)).now();
    return guard(reply, async () => {
      await repositories.monthlyManager.decideExamAppeal(managerId, params.data.id, body.data.decision, body.data.resolution ?? "", now);
      return repositories.monthlyManager.managerView(managerId, now);
    });
  });

  app.post("/api/v1/manager/month/unlock-requests/:id/decision", { preHandler: managerOnly }, async (request, reply) => {
    const params = idParam.safeParse(request.params);
    const body = decisionInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "MONTHLY_DECISION_INVALID" });
    const managerId = request.e4sSession!.user.id;
    const now = (await clockForUser(pool, managerId)).now();
    return guard(reply, async () => {
      await repositories.monthlyManager.decideUnlockRequest(managerId, params.data.id, body.data.decision, body.data.resolution ?? "", now);
      return repositories.monthlyManager.managerView(managerId, now);
    });
  });

  app.post("/api/v1/manager/month/account-locks/:id/unlock", { preHandler: managerOnly }, async (request, reply) => {
    const params = idParam.safeParse(request.params);
    const body = noteInput.safeParse(request.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ code: "MONTHLY_DECISION_INVALID" });
    const managerId = request.e4sSession!.user.id;
    const now = (await clockForUser(pool, managerId)).now();
    return guard(reply, async () => {
      await repositories.monthlyManager.unlockAccount(managerId, params.data.id, body.data.note ?? "", now);
      return repositories.monthlyManager.managerView(managerId, now);
    });
  });
}

/** Xếp job `monthly.daily-maintenance` một lần mỗi ngày (theo giờ Việt Nam). */
export async function enqueueDailyMaintenance(repositories: ReturnType<typeof createRepositories>, now: Date): Promise<void> {
  const day = localDateString(now);
  await repositories.jobs.enqueue({ id: randomUUID(), kind: "monthly.daily-maintenance", payload: { day, now: now.toISOString() }, idempotencyKey: `monthly.daily-maintenance:${day}`, maxAttempts: 3 });
}

async function guard<T>(reply: FastifyReply, run: () => Promise<T>): Promise<T | FastifyReply> {
  try {
    return await run();
  } catch (error) {
    const code = error instanceof Error ? error.message : "MONTHLY_UNKNOWN";
    if (code.endsWith("_NOT_FOUND")) return reply.code(404).send({ code });
    if (code.startsWith("MONTHLY_") || code.startsWith("ACCOUNT_")) return reply.code(409).send({ code });
    throw error;
  }
}
