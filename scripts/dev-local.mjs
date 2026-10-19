import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import EmbeddedPostgres from "embedded-postgres";
import { verifyLocalObjectStorage, waitForHttpReady } from "./local-storage-preflight.mjs";

if (existsSync(resolve(".env"))) loadEnvFile(resolve(".env"));

const databaseDir = resolve(".local/postgres");
await mkdir(databaseDir, { recursive: true });
const databasePort = 54329;
const databaseUrl = `postgres://e4s:e4s_local_password@127.0.0.1:${databasePort}/e4s`;
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: "e4s",
  password: "e4s_local_password",
  port: databasePort,
  persistent: true,
  onLog: () => undefined,
  onError: (message) => process.stderr.write(`[postgres] ${String(message)}\n`)
});

const children = new Set();
const run = (command, args, env = {}) => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
    stdio: "inherit"
  });
  children.add(child);
  child.once("exit", (code) => {
    children.delete(child);
    if (!stopping && code) void stop(code);
  });
  return child;
};
const runOnce = (command, args, env = {}) => new Promise((resolveExit, reject) => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
    stdio: "inherit"
  });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolveExit() : reject(new Error(`${command} exited ${code}`)));
});

let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  await postgres.stop().catch(() => undefined);
  process.exit(code);
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

try {
  const storageStatus = await verifyLocalObjectStorage();
  if (!existsSync(join(databaseDir, "PG_VERSION"))) await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("e4s").catch((error) => {
    if (!String(error).toLowerCase().includes("already exists")) throw error;
  });
  await runOnce("pnpm", ["exec", "tsx", "scripts/prepare-local.ts"], { DATABASE_URL: databaseUrl });
  run("pnpm", ["exec", "tsx", "apps/api/src/server.ts"], {
    DATABASE_URL: databaseUrl,
    COOKIE_SECURE: "false",
    PORT: "3001",
    // Keep the Windows dev-local process connected to the E4S MinIO service
    // exposed by the Ubuntu/WSL compose stack. Without this, buildApi omits
    // file routes entirely and learner speaking uploads fail with a misleading
    // 404 even though the UI and API are otherwise healthy.
    S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9002",
    S3_REGION: process.env.S3_REGION ?? "us-east-1",
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? "e4s_minio",
    S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? "e4s_local_minio_password"
  });
  run("pnpm", ["--filter", "@e4s/web", "dev", "--", "--host", "127.0.0.1", "--port", "4175"]);
  await Promise.all([
    waitForHttpReady("API", "http://127.0.0.1:3001/api/readiness"),
    waitForHttpReady("Web", "http://127.0.0.1:4175")
  ]);
  process.stdout.write([
    "E4S local đã sẵn sàng:",
    "  Web        ✓ http://127.0.0.1:4175",
    "  API        ✓ http://127.0.0.1:3001",
    `  PostgreSQL ✓ ${databasePort}`,
    `  MinIO      ✓ ${storageStatus.endpoint} · buckets ${storageStatus.buckets.join(", ")}`,
    ""
  ].join("\n"));
  await new Promise(() => undefined);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  await stop(1);
}
