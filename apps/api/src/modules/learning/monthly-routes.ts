import { createRepositories } from "@e4s/database";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import { clockForUser } from "../system/clock.js";
import { enqueueDailyMaintenance } from "../manager/monthly-routes.js";

const appealInput = z.object({ reason: z.string().trim().min(5).max(1000) });

/** Học viên theo tháng: trạng thái tháng, khiếu nại không đủ điều kiện thi. */
export function registerLearnerMonthlyRoutes(app: FastifyInstance, pool: Pool): void {
  const repositories = createRepositories(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);

  app.get("/api/v1/learner/month", { preHandler: learnerOnly }, async (request, reply) => {
    const learnerId = request.e4sSession!.user.id;
    const now = (await clockForUser(pool, learnerId)).now();
    await enqueueDailyMaintenance(repositories, now);
    const view = await repositories.learnerMonthly.monthView(learnerId, now);
    if (!view) return reply.code(404).send({ code: "LEARNER_NOT_FOUND" });
    const unlock = await repositories.monthlyManager.unlockRequestFor(learnerId, now);
    return { ...view, unlockRequest: unlock ? { status: unlock.status as "pending" | "approved" | "rejected", createdAt: unlock.createdAt.toISOString(), resolution: unlock.resolution } : null };
  });

  app.post("/api/v1/learner/month/exam-appeal", { preHandler: learnerOnly }, async (request, reply) => {
    const body = appealInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: "MONTHLY_APPEAL_INVALID" });
    const learnerId = request.e4sSession!.user.id;
    const now = (await clockForUser(pool, learnerId)).now();
    return guard(reply, async () => {
      const result = await repositories.learnerMonthly.createExamAppeal(learnerId, body.data.reason, now);
      return reply.code(201).send({ status: result.status, deadlineAt: result.deadlineAt.toISOString() });
    });
  });

  app.post("/api/v1/learner/month/unlock-request", { preHandler: learnerOnly }, async (request, reply) => {
    const body = appealInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: "MONTHLY_UNLOCK_INVALID" });
    const learnerId = request.e4sSession!.user.id;
    const now = (await clockForUser(pool, learnerId)).now();
    return guard(reply, async () => {
      const result = await repositories.monthlyManager.createUnlockRequest(learnerId, body.data.reason, now);
      return reply.code(201).send(result);
    });
  });
}

async function guard<T>(reply: FastifyReply, run: () => Promise<T>): Promise<T | FastifyReply> {
  try {
    return await run();
  } catch (error) {
    const code = error instanceof Error ? error.message : "MONTHLY_UNKNOWN";
    if (code.startsWith("MONTHLY_")) return reply.code(409).send({ code });
    throw error;
  }
}
