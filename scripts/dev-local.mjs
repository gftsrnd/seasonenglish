import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

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
  if (!existsSync(join(databaseDir, "PG_VERSION"))) await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("e4s").catch((error) => {
    if (!String(error).toLowerCase().includes("already exists")) throw error;
  });
  await runOnce("pnpm", ["exec", "tsx", "scripts/prepare-local.ts"], { DATABASE_URL: databaseUrl });
  run("pnpm", ["exec", "tsx", "apps/api/src/server.ts"], {
    DATABASE_URL: databaseUrl,
    ALLOW_DEMO_LOGIN: "true",
    COOKIE_SECURE: "false",
    PORT: "3001"
  });
  run("pnpm", ["--filter", "@e4s/web", "dev", "--", "--host", "127.0.0.1", "--port", "4173"]);
  process.stdout.write("E4S local: http://127.0.0.1:4173\n");
  await new Promise(() => undefined);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  await stop(1);
}
