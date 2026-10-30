import { createGroqProvider } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import { createS3Storage } from "@e4s/storage";
import { Pool } from "pg";
import { createWorkerHandlers } from "./handlers.js";
import { createMonthlyHandlers } from "./monthly-handlers.js";
import { loadWorkerConfig } from "./config.js";
import { createPoller } from "./poller.js";
import { processNextJob, type JobHandler } from "./worker.js";

const config = loadWorkerConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
const repositories = createRepositories(pool);
const storage = createS3Storage(config.minio);
const ai = config.groq ? createGroqProvider(config.groq) : undefined;
const handlers: Record<string, JobHandler> = {
  ...createWorkerHandlers({
    storage,
    bucket: config.minio.bucket,
    notifications: repositories.notifications,
    ...(ai ? { ai } : {})
  }),
  ...createMonthlyHandlers({ monthly: repositories.monthly, monthlyManager: repositories.monthlyManager, ...(ai ? { ai } : {}) })
};

let stopping = false;
const tick = async () => {
  if (stopping) return;
  try {
    await processNextJob({ jobs: repositories.jobs, workerId: config.workerId, leaseSeconds: config.leaseSeconds, handlers });
  } catch (error) {
    console.error("worker tick failed", error);
  }
};

const poller = createPoller(tick, config.pollMs);
poller.start();
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await poller.stop();
  await pool.end();
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
