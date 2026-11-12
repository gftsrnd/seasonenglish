import { AI_TASKS, createAiService, createAnthropicProvider } from "@e4s/ai";
import { autoApproveExpiredEligibilityComplaints, createMediaRepository, createRepositories, syncStaffDateNotices } from "@e4s/database";
import { createS3Storage, type ObjectStorage } from "@e4s/storage";
import { Pool } from "pg";
import { loadEnvFile } from "node:process";
import { buildApi } from "./app.js";
import { createResendIdentityEmailSender, readIdentityEmailConfiguration } from "./modules/identity/index.js";
import { createOrganizationAiRunnerFactory, normalizeAiMaxAttempts } from "./modules/ai/runtime.js";
import { createContentMediaService } from "./modules/media/index.js";
import { createLocalEdgeTtsRunner } from "./modules/assessment/edge-tts.js";
import { createOpenverseProvider } from "./modules/media/providers/openverse.js";
import { createPixabayProvider } from "./modules/media/providers/pixabay.js";
import { createWikimediaProvider } from "./modules/media/providers/wikimedia.js";
import { createWikipediaProvider } from "./modules/media/providers/wikipedia.js";

try {
  loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // Environment variables supplied by the process remain the source of truth.
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
const configuredAiTimeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 60_000);
const aiTimeoutMs = Number.isFinite(configuredAiTimeoutMs) && configuredAiTimeoutMs > 0 ? configuredAiTimeoutMs : 60_000;
const aiMaxAttempts = normalizeAiMaxAttempts(process.env.AI_MAX_ATTEMPTS);
const aiRunner = process.env.AI_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY
  ? createAiService({
      registry: AI_TASKS,
      provider: createAnthropicProvider({
        apiKey: process.env.ANTHROPIC_API_KEY,
        ...(process.env.ANTHROPIC_MODEL ? { model: process.env.ANTHROPIC_MODEL } : {})
      }),
      timeoutMs: aiTimeoutMs,
      maxAttempts: aiMaxAttempts,
      loadPrompt: async () => ""
    })
  : undefined;
const aiRunnerFactory = createOrganizationAiRunnerFactory(pool, aiRunner, {
  timeoutMs: aiTimeoutMs,
  maxAttempts: aiMaxAttempts
});
const storage = createStorageFromEnvironment();
const mediaService = storage ? createProductionMediaService(storage) : undefined;
const identityEmailConfiguration = readIdentityEmailConfiguration(process.env);
const identityEmailSender = identityEmailConfiguration
  ? createResendIdentityEmailSender(identityEmailConfiguration)
  : undefined;
if (identityEmailConfiguration) {
  process.stdout.write(`[identity-email] Resend configured with sender ${identityEmailConfiguration.from}\n`);
}
const app = buildApi({
  pool,
  secureCookies: process.env.COOKIE_SECURE === "true",
  ...(process.env.WEB_ORIGIN ? { webOrigin: process.env.WEB_ORIGIN } : {}),
  maintenanceEnabled: process.env.E4S_ENABLE_MAINTENANCE === "true" && process.env.NODE_ENV !== "production",
  imageProviders: {
    pexels: Boolean(process.env.PEXELS_API_KEY?.trim()),
    pixabay: Boolean(process.env.PIXABAY_API_KEY?.trim())
  },
  ...(storage ? { storage } : {}),
  ...(mediaService ? { mediaService } : {}),
  ...(aiRunner ? { aiRunner } : {}),
  ...(process.env.E4S_ENABLE_EDGE_TTS === "true" ? { edgeTtsRunner: createLocalEdgeTtsRunner({
    ...(process.env.EDGE_TTS_COMMAND ? { command: process.env.EDGE_TTS_COMMAND } : {})
  }) } : {}),
  ...(identityEmailSender ? { identityEmailSender } : {}),
  otpSecret: process.env.AUTH_OTP_SECRET ?? "local-only-change-me",
  aiRunnerFactory
});
const reportMaintenanceError = (error: unknown) => {
  process.stderr.write(`[monthly-maintenance-sweep] ${error instanceof Error ? error.message : String(error)}\n`);
};
const lockLearners = () => createRepositories(pool).manager.lockInactiveLearners().catch(reportMaintenanceError);
const syncDateNotices = () => syncStaffDateNotices(pool).catch(reportMaintenanceError);
const approveComplaints = () => autoApproveExpiredEligibilityComplaints(pool).catch(reportMaintenanceError);
const dayMs = 24 * 60 * 60 * 1_000;
const untilVietnamMidnight = () => dayMs - (Date.now() + 7 * 60 * 60 * 1_000) % dayMs;
let inactivitySweep: ReturnType<typeof setTimeout>;
function scheduleInactivitySweep() {
  inactivitySweep = setTimeout(() => {
    void lockLearners();
    void syncDateNotices();
    scheduleInactivitySweep();
  }, untilVietnamMidnight());
  inactivitySweep.unref();
}
void lockLearners();
void syncDateNotices();
void approveComplaints();
scheduleInactivitySweep();
const complaintSweep = setInterval(approveComplaints, 60 * 1_000);
complaintSweep.unref();
const port = Number(process.env.PORT ?? 3001);
await app.listen({ host: process.env.HOST ?? "127.0.0.1", port });
const stop = async () => { clearTimeout(inactivitySweep); clearInterval(complaintSweep); await app.close(); await pool.end(); process.exit(0); };
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
  const pixabay = createPixabayProvider(process.env.PIXABAY_API_KEY ? { apiKey: process.env.PIXABAY_API_KEY } : {});
  return createContentMediaService({
    repository: createMediaRepository(pool),
    storage,
    providers: {
      exactWikipedia: wikipedia.exact,
      searchCommons: wikimedia.search,
      searchPixabay: pixabay.search,
      searchOpenverse: openverse.search
    }
  });
}
