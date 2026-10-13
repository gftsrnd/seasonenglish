import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { registerAssessmentRoutes } from "./modules/assessment/index.js";
import { registerCoachRoutes, type AiTaskRunner } from "./modules/coach/index.js";
import { registerContentRoutes } from "./modules/content/index.js";
import { registerEngagementRoutes } from "./modules/engagement/index.js";
import { registerIdentityRoutes } from "./modules/identity/index.js";
import { registerLearningRoutes } from "./modules/learning/index.js";

export { createRoleGuard } from "./modules/identity/index.js";

export interface BuildApiOptions {
  pool: Pool;
  allowDemoLogin?: boolean;
  secureCookies?: boolean;
  aiRunner?: AiTaskRunner;
}

export function buildApi(options: BuildApiOptions): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: true });
  void app.register(cookie);
  void app.register(rateLimit, { global: false });
  registerIdentityRoutes(app, {
    pool: options.pool,
    allowDemoLogin: options.allowDemoLogin ?? false,
    secureCookies: options.secureCookies ?? true
  });
  registerLearningRoutes(app, options.pool);
  registerAssessmentRoutes(app, options.pool);
  registerContentRoutes(app, options.pool);
  registerCoachRoutes(app, options.pool, options.aiRunner);
  registerEngagementRoutes(app, options.pool, options.aiRunner);
  return app;
}
