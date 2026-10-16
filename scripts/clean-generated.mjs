import { access, readdir, readFile, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staleTestDatabaseAgeMs = 2 * 60 * 60 * 1000;

const workspacePackages = [
  "apps/api",
  "apps/web",
  "apps/worker",
  "packages/ai",
  "packages/contracts",
  "packages/database",
  "packages/domain",
  "packages/storage",
  "packages/test-support"
];

const fixedTargets = [
  "coverage",
  "playwright-report",
  "test-results",
  ...workspacePackages.flatMap((workspacePackage) => [
    `${workspacePackage}/dist`,
    `${workspacePackage}/node_modules/.vite`
  ])
];

function insideWorkspace(path) {
  const candidate = resolve(path);
  return candidate !== root && candidate.startsWith(`${root}${sep}`);
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function staleTestDatabaseTargets() {
  const temporaryRoot = join(root, ".tmp");
  if (!(await exists(temporaryRoot))) return [];

  const now = Date.now();
  const targets = [];
  for (const entry of await readdir(temporaryRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^postgres-test(?:-\d+)?$/.test(entry.name)) continue;
    const path = join(temporaryRoot, entry.name);
    const metadata = await stat(path);
    if (now - metadata.mtimeMs < staleTestDatabaseAgeMs) continue;

    const pidPath = join(path, "postmaster.pid");
    if (await exists(pidPath)) {
      const firstLine = (await readFile(pidPath, "utf8")).split(/\r?\n/u, 1)[0] ?? "";
      if (processIsRunning(Number.parseInt(firstLine, 10))) continue;
    }
    targets.push(path);
  }
  return targets;
}

const targets = [
  ...fixedTargets.map((target) => join(root, target)),
  ...(await staleTestDatabaseTargets())
];

let removed = 0;
for (const target of targets) {
  if (!insideWorkspace(target)) throw new Error(`Refusing unsafe cleanup target: ${target}`);
  if (!(await exists(target))) continue;
  await rm(target, { recursive: true, force: true });
  removed += 1;
  console.log(`removed ${relative(root, target)}`);
}

console.log(`cleanup complete: ${removed} generated path(s) removed`);
