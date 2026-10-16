import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import type { ObjectStorage } from "@e4s/storage";
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { registerAssessmentRoutes } from "./modules/assessment/index.js";
import { registerCoachRoutes, type AiTaskRunner } from "./modules/coach/index.js";
import { registerContentRoutes } from "./modules/content/index.js";
import { registerEngagementRoutes } from "./modules/engagement/index.js";
import { registerFileRoutes } from "./modules/files/index.js";
import { registerIdentityRoutes } from "./modules/identity/index.js";
import { registerLearningRoutes } from "./modules/learning/index.js";
import { registerManagerRoutes } from "./modules/manager/index.js";
import { registerNotificationRoutes } from "./modules/notifications/index.js";
import { registerSystemRoutes } from "./modules/system/index.js";

export { createRoleGuard } from "./modules/identity/index.js";

export interface BuildApiOptions {
  pool: Pool;
  /** Retained for compatibility with older integration fixtures; demo login is removed. */
  allowDemoLogin?: boolean;
  secureCookies?: boolean;
  aiRunner?: AiTaskRunner;
  storage?: ObjectStorage;
  /** Enables destructive demo maintenance only for an explicitly local/test process. */
  maintenanceEnabled?: boolean;
}

export function buildApi(options: BuildApiOptions): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: true });
  // The guarded demo reset only covers PostgreSQL. Keep it disabled when object storage
  // is mounted until a matching object purge/backup workflow exists.
  const maintenanceEnabled = (options.maintenanceEnabled ?? false) && !options.storage;
  void app.register(cookie);
  void app.register(rateLimit, { global: false });
  registerIdentityRoutes(app, {
    pool: options.pool,
    secureCookies: options.secureCookies ?? true
  });
  registerLearningRoutes(app, options.pool, options.aiRunner);
  registerAssessmentRoutes(app, options.pool, options.aiRunner);
  registerContentRoutes(app, options.pool, options.aiRunner, options.storage);
  registerManagerRoutes(app, options.pool, { maintenanceEnabled });
  registerNotificationRoutes(app, options.pool);
  registerCoachRoutes(app, options.pool, options.aiRunner);
  registerEngagementRoutes(app, options.pool, options.aiRunner);
  registerSystemRoutes(app, options.pool, options.storage, Boolean(options.aiRunner), maintenanceEnabled);
  if (options.storage) {
    void app.register(multipart, { limits: { files: 1, fileSize: 20 * 1024 * 1024 } });
    registerFileRoutes(app, options.pool, options.storage);
  }
  return app;
}
