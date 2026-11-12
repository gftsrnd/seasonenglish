import type { AiTaskRunner } from "@e4s/ai";
import type { ObjectStorage } from "@e4s/storage";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ContentMediaService } from "../media/index.js";
import type { EdgeTtsRunner } from "../assessment/edge-tts.js";
import { listeningAudioServiceFor } from "../assessment/listening-audio.js";
import { registerMonthlyContentRoutes } from "./monthly-routes.js";
import { createIllustrationProviderFromEnvironment, registerMonthlyIllustrationRoutes } from "./monthly-illustrations.js";
import { registerContentRoutes as registerWeeklyContentRoutes } from "./routes.js";

export function registerContentRoutes(
  app: FastifyInstance,
  pool: Pool,
  aiRunner?: AiTaskRunner,
  storage?: ObjectStorage,
  aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>,
  mediaService?: ContentMediaService,
  edgeTtsRunner?: EdgeTtsRunner
): void {
  registerWeeklyContentRoutes(app, pool, aiRunner, storage, aiRunnerFactory, mediaService);
  registerMonthlyContentRoutes(app, pool, aiRunner, aiRunnerFactory, listeningAudioServiceFor(pool, edgeTtsRunner, storage));
  registerMonthlyIllustrationRoutes(app, pool, storage, createIllustrationProviderFromEnvironment(process.env));
}
