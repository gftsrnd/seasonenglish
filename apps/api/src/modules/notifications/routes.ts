import type { LearnerNotificationsView } from "@e4s/contracts";
import { createRepositories } from "@e4s/database";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createRoleGuard } from "../identity/policy.js";

export function registerNotificationRoutes(app: FastifyInstance, pool: Pool): void {
  const repositories = createRepositories(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);

  app.get("/api/v1/notifications", { preHandler: learnerOnly }, async (request): Promise<LearnerNotificationsView> => ({
    notifications: await repositories.notifications.listForLearner(request.e4sSession!.user.id)
  }));
}
