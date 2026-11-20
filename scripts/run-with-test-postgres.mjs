import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

/** Ask the OS for a free port (a pid-derived port could collide with a running server). */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function startPostgres() {
  let lastError;
  // Embedded Postgres occasionally fails to start (port race, slow disk); retry with a fresh dir and port.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const databaseDir = resolve(`.tmp/postgres-test-${process.pid}-${randomUUID()}`);
    await mkdir(databaseDir, { recursive: true });
    const port = await freePort();
    const pg = new EmbeddedPostgres({
      databaseDir,
      user: "e4s",
      password: "e4s_test_password",
      port,
      persistent: false,
      onLog: () => undefined,
      onError: (message) => process.stderr.write(`[postgres] ${String(message)}
`)
    });
    try {
      await pg.initialise();
      await pg.start();
      await pg.createDatabase("e4s_test");
      return { pg, port };
    } catch (error) {
      lastError = error;
      process.stderr.write(`[postgres] start attempt ${attempt} failed: ${String(error ?? "unknown error")}
`);
      await pg.stop().catch(() => undefined);
    }
  }
  throw new Error(`Embedded Postgres did not start after 3 attempts: ${String(lastError ?? "unknown error")}`);
}

let exitCode = 1;
const { pg, port } = await startPostgres();
try {
  const args = process.argv.slice(2);
  const vitestEntry = resolve("node_modules/vitest/vitest.mjs");
  const child = spawn(process.execPath, [vitestEntry, "run", ...args], {
    env: {
      ...process.env,
      TEST_DATABASE_URL: `postgres://e4s:e4s_test_password@127.0.0.1:${port}/e4s_test`
    },
    shell: false,
    stdio: "inherit"
  });
  exitCode = await new Promise((resolveExit) => {
    child.on("exit", (code) => resolveExit(code ?? 1));
  });
} finally {
  let stopTimer;
  await Promise.race([
    pg.stop().catch(() => undefined),
    new Promise((resolveStop) => {
      stopTimer = setTimeout(() => {
        process.stderr.write("[postgres] graceful stop timed out after 5 seconds; exiting the isolated test process\n");
        resolveStop();
      }, 5_000);
    })
  ]);
  if (stopTimer) clearTimeout(stopTimer);
}

process.exit(exitCode);
