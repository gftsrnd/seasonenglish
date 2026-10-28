import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import type { AiTaskRunner } from "@e4s/ai";
import type { ObjectStorage } from "@e4s/storage";
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { registerAssessmentRoutes } from "./modules/assessment/index.js";
import { registerCoachRoutes } from "./modules/coach/index.js";
import { registerContentRoutes } from "./modules/content/index.js";
import { registerEngagementRoutes } from "./modules/engagement/index.js";
import { registerFileRoutes } from "./modules/files/index.js";
import { registerIdentityRoutes, type IdentityEmailSender } from "./modules/identity/index.js";
import { registerLearningRoutes } from "./modules/learning/index.js";
import { registerManagerRoutes } from "./modules/manager/index.js";
import type { ContentMediaService } from "./modules/media/index.js";
import { registerNotificationRoutes } from "./modules/notifications/index.js";
import { registerSystemRoutes } from "./modules/system/index.js";

export { createRoleGuard } from "./modules/identity/index.js";

export interface BuildApiOptions {
  pool: Pool;
  /** Retained for compatibility with older integration fixtures; demo login is removed. */
  allowDemoLogin?: boolean;
  secureCookies?: boolean;
  aiRunner?: AiTaskRunner;
  aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>;
  storage?: ObjectStorage;
  mediaService?: ContentMediaService;
  /** Enables destructive demo maintenance only for an explicitly local/test process. */
  maintenanceEnabled?: boolean;
  /** Comma-separated browser origins allowed to use credentialed API requests. */
  webOrigin?: string;
  /** Reports image-provider readiness without exposing credentials to the browser. */
  imageProviders?: {
    pexels: boolean;
    pixabay: boolean;
  };
  identityEmailSender?: IdentityEmailSender;
  otpSecret?: string;
}

export function buildApi(options: BuildApiOptions): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: true });
  // The guarded demo reset only covers PostgreSQL. Keep it disabled when object storage
  // is mounted until a matching object purge/backup workflow exists.
  const maintenanceEnabled = (options.maintenanceEnabled ?? false) && !options.storage;
  void app.register(cookie);
  const webOrigins = (options.webOrigin ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (webOrigins.length > 0) {
    const firstOrigin = webOrigins[0];
    const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
    if (webOrigins.length === 1 && firstOrigin) {
      void app.register(cors, { origin: firstOrigin, credentials: true, methods });
    } else {
      void app.register(cors, { origin: webOrigins, credentials: true, methods });
    }
  }
  void app.register(rateLimit, { global: false });
  registerIdentityRoutes(app, {
    pool: options.pool,
    secureCookies: options.secureCookies ?? true,
    ...(options.identityEmailSender ? { emailSender: options.identityEmailSender } : {}),
    otpSecret: options.otpSecret ?? "local-only-change-me"
  });
  registerLearningRoutes(app, options.pool, options.aiRunner, options.mediaService, options.aiRunnerFactory);
  registerAssessmentRoutes(app, options.pool, options.aiRunner, options.aiRunnerFactory);
  registerContentRoutes(app, options.pool, options.aiRunner, options.storage, options.aiRunnerFactory, options.mediaService);
  registerManagerRoutes(app, options.pool, {
    maintenanceEnabled,
    ...(options.mediaService ? { mediaService: options.mediaService } : {})
  });
  registerNotificationRoutes(app, options.pool);
  registerCoachRoutes(app, options.pool, options.aiRunner, options.aiRunnerFactory, options.storage);
  registerEngagementRoutes(app, options.pool, options.aiRunner, options.mediaService, options.aiRunnerFactory, options.storage);
  registerSystemRoutes(app, options.pool, options.storage, Boolean(options.aiRunner), maintenanceEnabled, options.imageProviders, Boolean(options.aiRunnerFactory));
  if (options.storage) {
    void app.register(multipart, { limits: { files: 1, fileSize: 20 * 1024 * 1024 } });
    registerFileRoutes(app, options.pool, options.storage);
  }
  return app;
}
