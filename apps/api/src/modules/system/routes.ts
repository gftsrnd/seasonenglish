import type { ObjectStorage } from "@e4s/storage";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { EVIDENCE_BUCKET } from "../files/constants.js";
import { createRoleGuard } from "../identity/policy.js";

export function registerSystemRoutes(app: FastifyInstance, pool: Pool, storage?: ObjectStorage, aiAvailable = false, maintenanceEnabled = false): void {
  const authenticated = createRoleGuard(pool, ["learner", "operator", "manager"]);
  const staff = createRoleGuard(pool, ["operator", "manager"]);
  app.get("/api/health", async () => ({ status: "ok" }));

  app.get("/api/v1/product-preferences", { preHandler: authenticated }, async (request) => {
    const result = await pool.query<{ theme: string; vocab_image_source: string }>(
      `select coalesce(os.theme, 'auto') as theme, coalesce(os.vocab_image_source, 'wikimedia') as vocab_image_source
       from users u left join organization_settings os on os.organization_id = u.organization_id where u.id = $1`,
      [request.e4sSession!.user.id]
    );
    const row = result.rows[0] ?? { theme: "auto", vocab_image_source: "wikimedia" };
    return { theme: row.theme, vocabImageSource: row.vocab_image_source };
  });

  app.put("/api/v1/product-preferences", { preHandler: staff }, async (request, reply) => {
    const parsed = z.object({
      theme: z.enum(["auto", "spring", "summer", "autumn", "winter", "tet", "midautumn", "christmas"]),
      vocabImageSource: z.enum(["pexels", "pixabay", "wikimedia", "openverse", "disabled"])
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_PRODUCT_PREFERENCES" });
    const result = await pool.query<{ theme: string; vocab_image_source: string }>(
      `insert into organization_settings (organization_id, theme, vocab_image_source, updated_by)
       select organization_id, $2, $3, $1 from users where id = $1
       on conflict (organization_id) do update set theme = excluded.theme,
         vocab_image_source = excluded.vocab_image_source, updated_by = excluded.updated_by, updated_at = now()
       returning theme, vocab_image_source`,
      [request.e4sSession!.user.id, parsed.data.theme, parsed.data.vocabImageSource]
    );
    const row = result.rows[0]!;
    return { theme: row.theme, vocabImageSource: row.vocab_image_source };
  });

  app.get("/api/v1/system/capabilities", {
    preHandler: createRoleGuard(pool, ["operator", "manager"])
  }, async (_request, reply) => {
    try {
      await pool.query("select 1");
    } catch {
      return reply.code(503).send({ code: "SYSTEM_DATABASE_UNAVAILABLE" });
    }
    return {
      api: true,
      database: true,
      ai: aiAvailable,
      objectStorage: await objectStorageAvailable(storage),
      maintenance: maintenanceEnabled
    } as const;
  });

  app.get("/api/readiness", async (_request, reply) => {
    try {
      await pool.query("select 1");
      const encryptedSettings = await pool.query<{ secret_ciphertext: string | null }>(
        "select secret_ciphertext from provider_configurations where secret_ciphertext is not null limit 1"
      );
      if (encryptedSettings.rowCount && !validSettingsEncryptionKey()) {
        throw new Error("Provider settings encryption key is unavailable");
      }
      if (!await objectStorageAvailable(storage)) throw new Error("Object storage is unavailable");
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });
}

async function objectStorageAvailable(storage: ObjectStorage | undefined): Promise<boolean> {
  if (!storage) return false;
  try {
    await storage.ready(EVIDENCE_BUCKET);
    return true;
  } catch {
    return false;
  }
}

function validSettingsEncryptionKey(): boolean {
  const encoded = process.env.E4S_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  return Buffer.from(encoded, "base64").length === 32;
}
