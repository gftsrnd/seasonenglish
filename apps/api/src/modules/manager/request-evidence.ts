import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import { inspectBitmap } from "../media/safety.js";
import { requestEvidenceMaxBytes } from "@e4s/contracts";

const mimeType = z.enum(["image/png", "image/jpeg", "image/webp"]);
const screenshot = z.object({
  mimeType,
  base64: z.base64().max(4 * Math.ceil(requestEvidenceMaxBytes / 3))
}).transform(({ mimeType, base64 }, context) => {
  const bytes = Buffer.from(base64, "base64");
  try {
    if (bytes.length > requestEvidenceMaxBytes) throw new Error();
    const { width, height } = inspectBitmap(bytes, mimeType);
    if (width > 4096 || height > 4096) throw new Error();
    return { bytes, mimeType };
  } catch {
    context.addIssue({ code: "custom", message: "Invalid screenshot" });
    return z.NEVER;
  }
});

export const requestEvidenceFields = {
  scope: z.string().trim().min(1).max(180).optional(),
  screenshot: screenshot.optional()
};

const paramsSchema = z.object({
  kind: z.enum(["complaint", "assessment", "lesson_part", "weekly_practice"]),
  id: z.uuid()
});
const tables = { complaint: "learner_complaints", assessment: "appeals", lesson_part: "lesson_part_appeals", weekly_practice: "practice_appeals" } as const;

export function registerRequestEvidenceRoutes(app: FastifyInstance, pool: Pool) {
  const canRead = createRoleGuard(pool, ["learner", "operator", "manager"], { allowDisabledLearner: true });
  app.get("/api/v1/request-evidence/:kind/:id", { preHandler: canRead }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(404).send({ code: "REQUEST_EVIDENCE_NOT_FOUND" });
    const { kind, id } = params.data;
    const isComplaint = kind === "complaint";
    const table = tables[kind];
    const file = await pool.query<{ screenshot: Buffer; screenshot_type: string }>(
      `select item.screenshot, item.screenshot_type
         from ${table} item
         join users learner on learner.id = item.learner_id and learner.status <> 'purged'
         join users actor on actor.id = $2
        where item.id = $1 and item.screenshot is not null
          and (actor.role = 'learner' and actor.id = learner.id and
              (actor.status = 'active'${isComplaint ? " or (actor.status = 'disabled' and item.kind = 'account_unlock')" : ""})
            or actor.role = $3 and actor.status = 'active' and actor.organization_id = learner.organization_id)`,
      [id, request.e4sSession!.user.id, isComplaint ? "manager" : "operator"]
    );
    const row = file.rows[0];
    if (!row) return reply.code(404).send({ code: "REQUEST_EVIDENCE_NOT_FOUND" });
    return reply.header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .type(row.screenshot_type).send(row.screenshot);
  });
}
