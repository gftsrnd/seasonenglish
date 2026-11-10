import type { AccountRole, SessionView } from "@e4s/contracts";
import { createRepositories } from "@e4s/database";
import { roleAllowed } from "@e4s/domain/identity";
import type { preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import { resolveSession, sessionView } from "./routes.js";

declare module "fastify" {
  interface FastifyRequest {
    e4sSession?: SessionView;
    e4sSessionId?: string;
  }
}

export function createRoleGuard(
  pool: Pool,
  allowedRoles: readonly AccountRole[],
  options?: { allowDisabledLearner?: boolean }
): preHandlerHookHandler {
  const repositories = createRepositories(pool);
  return async (request, reply) => {
    const account = await resolveSession(request, repositories, options);
    if (!account) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    if (!roleAllowed(account.role, allowedRoles)) return reply.code(403).send({ code: "FORBIDDEN" });
    request.e4sSession = sessionView(account);
    request.e4sSessionId = account.sessionId;
  };
}
