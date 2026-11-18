import { createGroqProvider } from "@e4s/ai";
import { ArenaRepository, createRepositories } from "@e4s/database";
import { createS3Storage } from "@e4s/storage";
import { Pool } from "pg";
import { createWorkerHandlers } from "./handlers.js";
import { loadWorkerConfig } from "./config.js";
import { createPoller } from "./poller.js";
import { processNextJob, type JobHandler } from "./worker.js";

const ARENA_SWEEP_MS = 60_000;
const config = loadWorkerConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
const repositories = createRepositories(pool);
const storage = createS3Storage(config.minio);
const ai = config.groq ? createGroqProvider(config.groq) : undefined;
const handlers: Record<string, JobHandler> = createWorkerHandlers({
  storage,
  bucket: config.minio.bucket,
  notifications: repositories.notifications,
  ...(ai ? { ai } : {})
});

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
// Arena: expire unaccepted challenges and settle matches past their play deadline (idempotent).
const arena = new ArenaRepository(pool);
const arenaSweep = createPoller(async () => {
  if (stopping) return;
  try {
    await arena.sweep();
  } catch (error) {
    console.error("arena sweep failed", error);
  }
}, ARENA_SWEEP_MS);
arenaSweep.start();
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await poller.stop();
  await arenaSweep.stop();
  await pool.end();
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
