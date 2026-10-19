import { AI_TASKS, createAiService, createGroqProvider } from "@e4s/ai";
import { createMediaRepository } from "@e4s/database";
import { createS3Storage, type ObjectStorage } from "@e4s/storage";
import { Pool } from "pg";
import { buildApi } from "./app.js";
import { createContentMediaService } from "./modules/media/index.js";
import { createOpenverseProvider } from "./modules/media/providers/openverse.js";
import { createWikimediaProvider } from "./modules/media/providers/wikimedia.js";
import { createWikipediaProvider } from "./modules/media/providers/wikipedia.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
const aiRunner = process.env.GROQ_API_KEY
  ? createAiService({
      registry: AI_TASKS,
      provider: createGroqProvider({
        apiKey: process.env.GROQ_API_KEY,
        ...(process.env.GROQ_MODEL ? { model: process.env.GROQ_MODEL } : {})
      }),
      loadPrompt: async () => ""
    })
  : undefined;
const storage = createStorageFromEnvironment();
const mediaService = storage ? createProductionMediaService(storage) : undefined;
const app = buildApi({
  pool,
  secureCookies: process.env.COOKIE_SECURE === "true",
  maintenanceEnabled: process.env.E4S_ENABLE_MAINTENANCE === "true" && process.env.NODE_ENV !== "production",
  imageProviders: {
    pexels: Boolean(process.env.PEXELS_API_KEY?.trim()),
    pixabay: Boolean(process.env.PIXABAY_API_KEY?.trim())
  },
  ...(storage ? { storage } : {}),
  ...(mediaService ? { mediaService } : {}),
  ...(aiRunner ? { aiRunner } : {})
});
const port = Number(process.env.PORT ?? 3001);
await app.listen({ host: process.env.HOST ?? "127.0.0.1", port });
const stop = async () => { await app.close(); await pool.end(); process.exit(0); };
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

function createStorageFromEnvironment() {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) return undefined;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("S3_ACCESS_KEY and S3_SECRET_KEY are required when S3_ENDPOINT is configured");
  }
  return createS3Storage({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId,
    secretAccessKey
  });
}

function createProductionMediaService(storage: ObjectStorage) {
  const wikipedia = createWikipediaProvider();
  const wikimedia = createWikimediaProvider();
  const openverse = createOpenverseProvider();
  return createContentMediaService({
    repository: createMediaRepository(pool),
    storage,
    providers: {
      exactWikipedia: wikipedia.exact,
      searchCommons: wikimedia.search,
      searchOpenverse: openverse.search
    }
  });
}
