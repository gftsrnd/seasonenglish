import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const { BROWSERSTACK_USERNAME, BROWSERSTACK_ACCESS_KEY, E4S_BROWSERSTACK_URL } = process.env;
if (!BROWSERSTACK_USERNAME?.trim() || !BROWSERSTACK_ACCESS_KEY?.trim()) {
  console.error("Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY before starting BrowserStack.");
  process.exit(1);
}

let target;
try {
  target = new URL(E4S_BROWSERSTACK_URL);
} catch {
  console.error("Set E4S_BROWSERSTACK_URL to the HTTPS origin approved for BrowserStack.");
  process.exit(1);
}
if (target.protocol !== "https:" || target.href !== `${target.origin}/`) {
  console.error("E4S_BROWSERSTACK_URL must be an HTTPS origin without credentials, path, query, or fragment.");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const manifestPath = require.resolve("browserstack-node-sdk/package.json");
const { bin } = require(manifestPath);
const runner = resolve(dirname(manifestPath), bin["browserstack-node-sdk"]);
const result = spawnSync(process.execPath, [runner, "playwright", "test"], {
  cwd: import.meta.dirname,
  env: { ...process.env, E4S_BROWSERSTACK_TARGET: target.origin },
  stdio: "inherit",
});
if (result.error) console.error("Could not start the BrowserStack SDK.");
process.exitCode = result.status ?? 1;
