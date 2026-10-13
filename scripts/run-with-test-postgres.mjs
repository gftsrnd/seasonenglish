import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const databaseDir = resolve(`.tmp/postgres-test-${process.pid}`);
await mkdir(databaseDir, { recursive: true });
const port = 55_000 + (process.pid % 5_000);

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "e4s",
  password: "e4s_test_password",
  port,
  persistent: false,
  onLog: () => undefined,
  onError: (message) => process.stderr.write(`[postgres] ${String(message)}\n`)
});

let exitCode = 1;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("e4s_test");

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
