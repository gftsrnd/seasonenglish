import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const databaseDir = resolve(`.tmp/postgres-test-${process.pid}`);
await mkdir(databaseDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "e4s",
  password: "e4s_test_password",
  port: 55432,
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
      TEST_DATABASE_URL: "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test"
    },
    shell: false,
    stdio: "inherit"
  });
  exitCode = await new Promise((resolveExit) => {
    child.on("exit", (code) => resolveExit(code ?? 1));
  });
} finally {
  await pg.stop().catch(() => undefined);
}

process.exitCode = exitCode;
