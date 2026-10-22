import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import EmbeddedPostgres from "embedded-postgres";
import { assertLocalPortAvailable, LOCAL_DEV_PORTS, verifyLocalObjectStorage, waitForHttpReady } from "./local-storage-preflight.mjs";

if (existsSync(resolve(".env"))) loadEnvFile(resolve(".env"));

const databaseDir = resolve(".local/postgres");
await mkdir(databaseDir, { recursive: true });
const databasePort = LOCAL_DEV_PORTS.postgres;
const apiUrl = `http://127.0.0.1:${LOCAL_DEV_PORTS.api}`;
const webUrl = `http://127.0.0.1:${LOCAL_DEV_PORTS.web}`;
const minioConsoleUrl = process.env.E4S_MINIO_CONSOLE_URL ?? `http://127.0.0.1:${LOCAL_DEV_PORTS.minioConsole}`;
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
  const storageEndpoint = process.env.E4S_MINIO_URL ?? process.env.S3_ENDPOINT ?? `http://127.0.0.1:${LOCAL_DEV_PORTS.minio}`;
  const storageStatus = await verifyLocalObjectStorage({ endpoint: storageEndpoint });
  await waitForHttpReady("MinIO Console", minioConsoleUrl);
  await Promise.all([
    assertLocalPortAvailable("PostgreSQL", LOCAL_DEV_PORTS.postgres),
    assertLocalPortAvailable("API", LOCAL_DEV_PORTS.api),
    assertLocalPortAvailable("Web", LOCAL_DEV_PORTS.web)
  ]);
  if (!existsSync(join(databaseDir, "PG_VERSION"))) await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("e4s").catch((error) => {
    if (!String(error).toLowerCase().includes("already exists")) throw error;
  });
  await runOnce("pnpm", ["exec", "tsx", "scripts/prepare-local.ts"], { DATABASE_URL: databaseUrl });
  run("pnpm", ["exec", "tsx", "apps/api/src/server.ts"], {
    DATABASE_URL: databaseUrl,
    COOKIE_SECURE: "false",
    PORT: String(LOCAL_DEV_PORTS.api),
    // Keep the Windows dev-local process connected to the E4S MinIO service
    // exposed by the Ubuntu/WSL compose stack. Without this, buildApi omits
    // file routes entirely and learner speaking uploads fail with a misleading
    // 404 even though the UI and API are otherwise healthy.
    S3_ENDPOINT: storageEndpoint,
    S3_REGION: process.env.S3_REGION ?? "us-east-1",
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? "e4s_minio",
    S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? "e4s_local_minio_password"
  });
  run("pnpm", ["--filter", "@e4s/web", "dev", "--", "--host", "127.0.0.1", "--port", String(LOCAL_DEV_PORTS.web)]);
  await Promise.all([
    waitForHttpReady("API", `${apiUrl}/api/readiness`),
    waitForHttpReady("Web", webUrl)
  ]);
  process.stdout.write([
    "E4S local đã sẵn sàng:",
    `  Web        ✓ ${webUrl}`,
    `  API        ✓ ${apiUrl}`,
    `  PostgreSQL ✓ ${databasePort}`,
    `  MinIO API  ✓ ${storageStatus.endpoint} · buckets ${storageStatus.buckets.join(", ")}`,
    `  MinIO UI   ✓ ${minioConsoleUrl}`,
    ""
  ].join("\n"));
  await new Promise(() => undefined);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  await stop(1);
}
