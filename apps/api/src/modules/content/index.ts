import type { AiTaskRunner } from "@e4s/ai";
import type { ObjectStorage } from "@e4s/storage";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ContentMediaService } from "../media/index.js";
import { registerMonthlyContentRoutes } from "./monthly-routes.js";
import { createIllustrationProviderFromEnvironment, registerMonthlyIllustrationRoutes } from "./monthly-illustrations.js";
import { registerContentRoutes as registerWeeklyContentRoutes } from "./routes.js";

export function registerContentRoutes(
  app: FastifyInstance,
  pool: Pool,
  aiRunner?: AiTaskRunner,
  storage?: ObjectStorage,
  aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>,
  mediaService?: ContentMediaService
): void {
  registerWeeklyContentRoutes(app, pool, aiRunner, storage, aiRunnerFactory, mediaService);
  registerMonthlyContentRoutes(app, pool, aiRunner, aiRunnerFactory);
  registerMonthlyIllustrationRoutes(app, pool, storage, createIllustrationProviderFromEnvironment(process.env));
}
