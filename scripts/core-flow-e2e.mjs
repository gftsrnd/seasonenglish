import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { open, mkdir, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";

const root = process.cwd();
const webUrl = process.env.E4S_CORE_FLOW_WEB_URL ?? "http://127.0.0.1:4175";
const apiUrl = process.env.E4S_CORE_FLOW_API_URL ?? "http://127.0.0.1:3001";
const databaseUrl = process.env.E4S_CORE_FLOW_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? "postgres://e4s:e4s_local_password@127.0.0.1:54329/e4s";
const localMutationOptInEnv = "E4S_CORE_FLOW_ALLOW_LOCAL_DB_MUTATION";
const localDatabaseTopology = Object.freeze({
  hosts: new Set(["127.0.0.1", "localhost", "::1"]),
  ports: new Set([54329, 5433]),
  database: "e4s"
});
const localMutationLaunchHint = [
  "Fixture DB mutation is disabled by default.",
  `For the documented local topology, set ${localMutationOptInEnv}=1 and use`,
  "postgres://e4s:e4s_local_password@127.0.0.1:54329/e4s (pnpm dev:local)",
  "or port 5433 for the local Docker Compose PostgreSQL mapping.",
  "Never point this harness at shared, staging, or Supabase PostgreSQL."
].join(" ");
const canonicalFixture = Object.freeze({
  organizationId: "00000000-0000-4000-8000-000000000001",
  programId: "00000000-0000-4000-8000-000000000201",
  learnerId: "00000000-0000-4000-8000-000000000101",
  learnerEmail: "learner@e4s.local",
  learnerName: "Học viên Demo",
  weekId: "00000000-0000-4000-8000-000000000301",
  weekNumber: 1,
  weekTopic: "Introducing yourself & your job",
  lessonSetId: "00000000-0000-4000-8000-000000000401"
});
const evidenceRoot = process.env.E4S_CORE_FLOW_EVIDENCE_DIR
  ?? join(root, ".tmp", "evidence", `core-flow-e2e-${new Date().toISOString().slice(0, 10)}`);
const defaultAudioFixture = fileURLToPath(new URL("../.tmp/fixtures/seed-speaking.wav", import.meta.url));
const audioFixtureOverride = process.env.E4S_CORE_FLOW_AUDIO_FIXTURE?.trim();
const audioFixture = audioFixtureOverride ? resolve(root, audioFixtureOverride) : defaultAudioFixture;
const supportedAudioExtensions = new Set([".mp3", ".m4a", ".wav", ".ogg", ".oga", ".webm", ".aac", ".flac", ".amr", ".3gp"]);

async function ensureDeterministicAudioFixture() {
  try {
    const details = await stat(audioFixture);
    if (details.isFile() && details.size > 44 && details.size <= 20 * 1024 * 1024) return;
  } catch { /* Generate the local proof fixture below. */ }
  if (extname(audioFixture).toLowerCase() !== ".wav") return;
  const sampleRate = 8_000;
  const sampleCount = sampleRate;
  const dataSize = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 4_000);
    wav.writeInt16LE(sample, 44 + index * 2);
  }
  await mkdir(join(audioFixture, ".."), { recursive: true });
  await writeFile(audioFixture, wav);
}

const roles = {
  learner: {
    email: "learner@e4s.local",
    password: "learner-pass",
    expectedPath: "/home",
    loginTab: null,
    loginButton: "Đăng nhập người học"
  },
  operator: {
    email: "operator@e4s.local",
    password: "staff-pass",
    expectedPath: "/op",
    loginTab: "Nhân sự",
    loginButton: "Đăng nhập nhân sự"
  },
  manager: {
    email: "manager@e4s.local",
    password: "manager-pass",
    expectedPath: "/mgr",
    loginTab: "Nhân sự",
    loginButton: "Đăng nhập nhân sự"
  }
};

const secondaryLearner = {
  email: "learner2@e4s.local",
  password: "learner2-pass",
  expectedPath: "/home",
  allowedPaths: ["/home", "/onboard"],
  loginTab: null,
  loginButton: "Đăng nhập người học",
  expectedName: "Học viên Test 2",
  resetProfile: {
    fullName: "Học viên Test 2",
    email: "learner2@e4s.local",
    department: "",
    position: "",
    contact: "",
    goals: [],
    environmentUse: "",
    familyUse: "",
    habits: [],
    situations: "",
    learningStyles: [],
    explanationLanguage: "auto",
    persona: "informal",
    durationMinutes: 10,
    device: "both",
    selfLevel: "unknown",
    certificates: [],
    experience: "",
    concerns: "",
    avatar: { color: "olive", acc: "none", bg: 0 }
  }
};

function parseBoundedInteger(name, fallback, { allowZero = false, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!new RegExp(`^${allowZero ? "\\d+" : "[1-9]\\d*"}$`).test(raw.trim())) {
    throw new Error(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer; received ${JSON.stringify(raw)}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > max) {
    throw new Error(`${name} must be a safe integer no greater than ${max}; received ${JSON.stringify(raw)}`);
  }
  return value;
}

function parseBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be true/false; received ${JSON.stringify(raw)}`);
}

function parseLocalDatabaseTarget(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`${localMutationLaunchHint} Invalid database URL: ${error instanceof Error ? error.message : String(error)}`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const port = parsed.port ? Number(parsed.port) : null;
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)
    || !localDatabaseTopology.hosts.has(host)
    || !Number.isInteger(port)
    || !localDatabaseTopology.ports.has(port)
    || database !== localDatabaseTopology.database) {
    const target = `${parsed.protocol || "<unknown>"}//${host || "<empty-host>"}:${port ?? "<default>"}/${database || "<empty-database>"}`;
    throw new Error(`${localMutationLaunchHint} Refusing database target ${target}; expected loopback e4s on port 54329 or 5433.`);
  }
  return { host, port, database };
}

function assertLocalFixtureMutationAllowed(operation) {
  if (process.env[localMutationOptInEnv] !== "1") {
    throw new Error(`${localMutationLaunchHint} Missing explicit opt-in for ${operation}: ${localMutationOptInEnv}=1.`);
  }
  return parseLocalDatabaseTarget(databaseUrl);
}

async function verifyCanonicalFixtureIdentity(client) {
  const identity = await client.query(
    `select
       exists (
         select 1
         from users
         where id = $1
           and organization_id = $2
           and role = 'learner'
           and display_name = $3
           and email = $4
       ) as learner_ok,
       exists (
         select 1
         from programs
         where id = $5 and organization_id = $2
       ) as program_ok,
       exists (
         select 1
       from program_weeks
         where id = $6
           and program_id = $5
           and week_number = $7
       ) as week_ok,
       exists (
         select 1
         from lesson_sets
         where id = $8
           and program_week_id = $6
           and cefr = 'A2'
       ) as lesson_set_ok,
       exists (
         select 1
         from enrollments
         where program_id = $5
           and learner_id = $1
           and cefr = 'A2'
           and cefr_approved = true
       ) as enrollment_ok`,
    [
      canonicalFixture.learnerId,
      canonicalFixture.organizationId,
      canonicalFixture.learnerName,
      canonicalFixture.learnerEmail,
      canonicalFixture.programId,
      canonicalFixture.weekId,
      canonicalFixture.weekNumber,
      canonicalFixture.lessonSetId
    ]
  );
  const row = identity.rows[0];
  const mismatches = [
    ["learner", row.learner_ok],
    ["program", row.program_ok],
    ["week", row.week_ok],
    ["lesson set", row.lesson_set_ok],
    ["enrollment", row.enrollment_ok]
  ].filter(([, matches]) => !matches).map(([name]) => name);
  if (mismatches.length) {
    throw new Error(`Refusing canonical fixture mutation: expected local identity mismatch in ${mismatches.join(", ")}. No fixture rows were changed.`);
  }
}

function parseViewportEntry(raw, index) {
  const match = raw.trim().match(/^(?:(?<name>[a-zA-Z0-9_-]+)\s*=\s*)?(?<width>\d+)\s*[xX,]\s*(?<height>\d+)$/);
  if (!match || Number(match.groups.width) < 1 || Number(match.groups.height) < 1) {
    throw new Error(`E4S_CORE_FLOW_VIEWPORT entries must use NAME=WIDTHxHEIGHT or WIDTHxHEIGHT; received ${JSON.stringify(raw)}`);
  }
  return {
    key: match.groups.name ?? `viewport-${index + 1}`,
    width: Number(match.groups.width),
    height: Number(match.groups.height)
  };
}

function parseViewports() {
  const raw = process.env.E4S_CORE_FLOW_VIEWPORT;
  if (raw === undefined || raw.trim() === "") {
    return [
      { key: "desktop", width: 1440, height: 900 },
      { key: "mobile", width: 390, height: 827 }
    ];
  }
  const entries = raw.split(";").map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length) throw new Error("E4S_CORE_FLOW_VIEWPORT must include at least one viewport.");
  const parsed = entries.map(parseViewportEntry);
  const keys = new Set();
  for (const viewport of parsed) {
    if (keys.has(viewport.key)) throw new Error(`E4S_CORE_FLOW_VIEWPORT contains duplicate viewport name ${JSON.stringify(viewport.key)}.`);
    keys.add(viewport.key);
  }
  return parsed;
}

function parseRoles() {
  const raw = process.env.E4S_CORE_FLOW_ROLES;
  if (raw === undefined || raw.trim() === "") return Object.keys(roles);
  const requested = [...new Set(raw.split(/[\s,]+/).map((role) => role.trim().toLowerCase()).filter(Boolean))];
  const unknown = requested.filter((role) => !Object.hasOwn(roles, role));
  if (unknown.length) {
    throw new Error(`E4S_CORE_FLOW_ROLES contains unknown role(s): ${unknown.join(", ")}. Use learner, operator, manager.`);
  }
  if (!requested.length) throw new Error("E4S_CORE_FLOW_ROLES must include at least one role.");
  return requested;
}

const viewports = parseViewports();
const runCount = parseBoundedInteger("E4S_CORE_FLOW_RUN_COUNT", 1, { max: 50 });
const headless = parseBoolean("E4S_CORE_FLOW_HEADLESS", false);
const stepDelayMs = parseBoundedInteger("E4S_CORE_FLOW_STEP_DELAY_MS", 700, { allowZero: true, max: 10000 });
const selectedRoles = parseRoles();

const logs = [];
const hardFailures = [];
const pageMetadata = new WeakMap();

const coveragePlan = [
  { key: "learner2-isolation", label: "Learner 2 isolation", roles: ["learner"] },
  { key: "profile-placement", label: "Profile draft persistence and Placement", roles: ["learner"] },
  { key: "lesson-publish", label: "Operator lesson review/publish", roles: ["operator"] },
  { key: "vocabulary-media", label: "Vocabulary image/audio and forbidden labels", roles: ["learner"] },
  { key: "speaking-upload", label: "Fresh speaking upload and persistence", roles: ["learner"] },
  { key: "coach-weekend", label: "Coach and weekend practice", roles: ["learner"] },
  { key: "progress-reward-game", label: "Profile/progress/reward/mini-game", roles: ["learner"] },
  { key: "no-standalone-micro", label: "No standalone Bài học ngắn", roles: ["learner"] }
];

const coverageStepMap = {
  "learner2-isolation": ["learner2-isolation"],
  "profile-placement": ["profile-draft-and-placement"],
  "lesson-publish": ["operator-lesson-review-publish"],
  "vocabulary-media": ["vocabulary-media-and-forbidden-statuses"],
  "speaking-upload": ["speaking-audio-gate"],
  "coach-weekend": ["coach-route-and-fallback", "coach-message-runtime", "weekend-practice-route", "weekend-practice-submit-gate"],
  "progress-reward-game": ["profile-progress-reward", "mini-game-start"],
  "no-standalone-micro": ["no-standalone-micro-lesson"]
};

function buildCoverageSummary() {
  return viewports.flatMap((viewport) => Array.from({ length: runCount }, (_, runIndex) => runIndex + 1).flatMap((run) =>
    selectedRoles.flatMap((role) => coveragePlan.filter((plan) => plan.roles.includes(role)).map(({ key, label }) => {
      const expectedSteps = coverageStepMap[key];
      const entries = logs.filter((item) => item.role === role && item.viewport.key === viewport.key && item.run === run && expectedSteps.includes(item.step));
      const missingSteps = expectedSteps.filter((stepName) => !entries.some((item) => item.step === stepName));
      const status = entries.some((item) => item.status === "FAIL")
        ? "FAIL"
        : entries.some((item) => item.status === "UNVERIFIED") || missingSteps.length
          ? "UNVERIFIED"
          : "PASS";
      return {
        key,
        label,
        role,
        run,
        viewport,
        status,
        missingSteps,
        checkpoints: entries.map((item) => ({ step: item.step, status: item.status, route: item.route, screenshot: item.screenshot }))
      };
    }))
  ));
}

class Unverified extends Error {
  constructor(reason) {
    super(reason);
    this.name = "Unverified";
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function audioHeaderMatches(extension, header) {
  const ascii = (start, end) => header.subarray(start, end).toString("ascii");
  switch (extension) {
    case ".wav": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
    case ".ogg":
    case ".oga": return ascii(0, 4) === "OggS";
    case ".webm": return header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case ".flac": return ascii(0, 4) === "fLaC";
    case ".amr": return ascii(0, 6) === "#!AMR\n";
    case ".m4a":
    case ".3gp": return ascii(4, 8) === "ftyp";
    case ".aac": return header[0] === 0xff && (header[1] & 0xf6) === 0xf0;
    case ".mp3": return ascii(0, 3) === "ID3" || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
    default: return false;
  }
}

async function verifiedAudioFixture() {
  const extension = extname(audioFixture).toLowerCase();
  if (!supportedAudioExtensions.has(extension)) {
    throw new Unverified(`Audio fixture không đúng định dạng hỗ trợ: ${audioFixture}`);
  }
  let details;
  try {
    details = await stat(audioFixture);
  } catch {
    throw new Unverified(`Không tìm thấy audio fixture: ${audioFixture}`);
  }
  if (!details.isFile() || details.size === 0 || details.size > 20 * 1024 * 1024) {
    throw new Unverified(`Audio fixture phải là file không rỗng và không quá 20 MB: ${audioFixture}`);
  }
  const handle = await open(audioFixture, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (!audioHeaderMatches(extension, header.subarray(0, bytesRead))) {
      throw new Unverified(`Nội dung audio fixture không khớp định dạng ${extension}: ${audioFixture}`);
    }
  } finally {
    await handle.close();
  }
  return { path: audioFixture, source: audioFixtureOverride ? "environment-override" : "repository-default", extension, sizeBytes: details.size };
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function pathOf(role, viewport, run, step) {
  return join(evidenceRoot, role, viewport.key, `run-${run}`, `${safeName(step)}.png`);
}

async function pageState(page) {
  return page.evaluate(() => ({
    href: location.href,
    pathname: location.pathname,
    title: document.title,
    body: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 420),
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim()).filter(Boolean)
  }));
}

async function screenshot(page, role, run, step) {
  const viewport = pageMetadata.get(page)?.viewport;
  if (!viewport) throw new Error(`Missing viewport metadata for ${role} run ${run}`);
  const file = pathOf(role, viewport, run, step);
  await mkdir(join(evidenceRoot, role, viewport.key, `run-${run}`), { recursive: true });
  // Capture the actual viewport: the app intentionally keeps the bottom
  // navigation fixed, so a full-page capture places that navigation halfway
  // down a long document and creates a false overlap signal in the evidence.
  await page.screenshot({ path: file, fullPage: false });
  return relative(root, file).replaceAll("\\", "/");
}

async function recordStep(page, role, run, step, status, details = {}) {
  const state = await pageState(page).catch(() => ({ href: "unavailable" }));
  const file = await screenshot(page, role, run, step).catch(() => undefined);
  const viewport = pageMetadata.get(page)?.viewport;
  logs.push({ role, run, viewport, step, status, route: state.pathname, screenshot: file, details, state, at: new Date().toISOString() });
  console.log(`[${status}] ${role} ${viewport?.key ?? "unknown-viewport"} run ${run} · ${step}${file ? ` · ${file}` : ""}`);
}

async function step(page, role, run, name, action) {
  try {
    const details = await action();
    await recordStep(page, role, run, name, "PASS", details ?? {});
    if (stepDelayMs > 0) await page.waitForTimeout(stepDelayMs);
    return details;
  } catch (error) {
    const status = error instanceof Unverified ? "UNVERIFIED" : "FAIL";
    await recordStep(page, role, run, name, status, { reason: error instanceof Error ? error.message : String(error) });
    if (stepDelayMs > 0) await page.waitForTimeout(stepDelayMs);
    if (status === "FAIL") throw error;
    return { status, reason: error.message };
  }
}

async function waitForSession(page, role) {
  await page.waitForFunction(async (expected) => {
    const response = await fetch("/api/session", { credentials: "include", cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    return response.ok && payload.role === expected;
  }, role);
}

async function loginWithFixture(page, fixture, role) {
  await page.goto(`${webUrl}/`, { waitUntil: "networkidle" });
  await page.waitForSelector('form input[name="email"]');
  assert(new URL(page.url()).pathname === "/", `Fresh entry opened at ${new URL(page.url()).pathname}`);
  if (fixture.loginTab) await page.getByRole("tab", { name: fixture.loginTab }).click();
  await page.locator('input[name="email"]').fill(fixture.email);
  await page.locator('input[name="password"]').fill(fixture.password);
  await page.getByRole("button", { name: fixture.loginButton, exact: true }).click();
  const allowedPaths = fixture.allowedPaths ?? [fixture.expectedPath];
  await page.waitForURL((url) => allowedPaths.includes(url.pathname), { timeout: 20_000 });
  await waitForSession(page, role);
}

async function login(page, role) {
  await loginWithFixture(page, roles[role], role);
}

async function logout(page) {
  const button = page.getByRole("button", { name: /Đăng xuất khỏi tài khoản này|Đăng xuất/ }).first();
  await button.waitFor();
  await button.click();
  await page.waitForSelector('form input[name="email"]', { timeout: 20_000 });
  assert(new URL(page.url()).pathname === "/", `Logout did not return to root entry: ${new URL(page.url()).pathname}`);
}

async function jsonFromPage(page, path) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { credentials: "include", cache: "no-store" });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, path);
}

async function jsonRequestFromPage(page, path, method, body) {
  return page.evaluate(async ({ target, requestMethod, requestBody }) => {
    const response = await fetch(target, {
      method: requestMethod,
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { target: path, requestMethod: method, requestBody: body });
}

function assertJsonStatus(label, response, expectedStatus) {
  assert(response.status === expectedStatus, `${label} returned HTTP ${response.status}: ${JSON.stringify(response.body)}`);
}

async function responseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

async function resetSecondaryLearnerProfile(page) {
  assertLocalFixtureMutationAllowed("Learner 2 profile reset");
  const current = await jsonFromPage(page, "/api/v1/learner/profile");
  assertJsonStatus("Learner 2 profile reset preflight", current, 200);
  const reset = await jsonRequestFromPage(page, "/api/v1/learner/profile", "PUT", {
    ...secondaryLearner.resetProfile,
    version: current.body.version
  });
  assertJsonStatus("Learner 2 profile reset", reset, 200);
  assert(reset.body.completed === false, `Learner 2 profile reset remained complete: ${JSON.stringify(reset.body)}`);
  for (const [field, expected] of Object.entries(secondaryLearner.resetProfile)) {
    const actual = reset.body.profile?.[field];
    assert(isDeepStrictEqual(actual, expected), `Learner 2 profile reset did not clear ${field}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `delete from assessment_attempts
       where learner_id = (select id from users where email = $1 limit 1)`,
      [secondaryLearner.email]
    );
  } finally {
    await client.end();
  }
  return reset;
}

async function checkNoOverflow(page) {
  const state = await pageState(page);
  assert(state.scrollWidth <= state.clientWidth + 1, `Horizontal overflow: scrollWidth=${state.scrollWidth}, clientWidth=${state.clientWidth}`);
}

/**
 * Seed only the review-queue state needed by this deterministic UI check.
 * The action under test still travels through the real Operator API; direct
 * DB setup prevents run 2 from depending on run 1's approval or on stale
 * data left by an earlier local session.
 */
async function prepareOperatorPendingFixture(run) {
  assertLocalFixtureMutationAllowed("operator pending fixture setup");
  const { organizationId, programId } = canonicalFixture;
  const assessmentVersionId = "00000000-0000-4000-8000-000000000872";
  const learnerId = randomUUID();
  const attemptId = randomUUID();
  const learnerName = `Core flow operator ${run} ${learnerId.slice(0, 8)}`;
  const email = `core-flow-${run}-${learnerId}@e4s.local`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into users (id, organization_id, role, display_name, email, status)
       values ($1, $2, 'learner', $3, $4, 'active')`,
      [learnerId, organizationId, learnerName, email]
    );
    await client.query(
      `insert into learner_profiles (user_id, profile, completed_at)
       values ($1, $2::jsonb, now())`,
      [learnerId, JSON.stringify({ fullName: learnerName, email, goals: [], habits: [], learningStyles: [] })]
    );
    await client.query(
      `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved)
       values ($1, $2, $3, 'A1', false)`,
      [randomUUID(), programId, learnerId]
    );
    await client.query(
      `insert into assessment_attempts
         (id, assessment_version_id, learner_id, status, current_section, timing_state, submitted_at, updated_at)
       values ($1, $2, $3, 'pending_review', null, '{}'::jsonb, now(), now())`,
      [attemptId, assessmentVersionId, learnerId]
    );
    for (const [section, score] of [["listening", 15], ["reading", 20], ["writing", 15], ["speaking", 15]]) {
      await client.query(
        `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
         values ($1, $2, $3, $4, '{}'::jsonb, 'deterministic')`,
        [randomUUID(), attemptId, section, score]
      );
    }
    await client.query(
      `insert into assessment_decisions (id, attempt_id, suggested_level, status, reason)
       values ($1, $2, 'A2', 'suggested', 'Core flow review fixture')`,
      [randomUUID(), attemptId]
    );
    await client.query("commit");
    return { attemptId, learnerId, learnerName, suggestedLevel: "A2" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Reset only the canonical learner's current-week practice fixture before a
 * viewport run. The operator flow can publish a new lesson version between
 * desktop and mobile; re-bind the first completed lesson to that version so
 * each viewport still exercises the real open/no-submission product state.
 */
async function prepareCanonicalLearnerWeeklyPracticeFixture({ completeWeek = false } = {}) {
  assertLocalFixtureMutationAllowed(`canonical weekly practice fixture reset${completeWeek ? " for weekend practice" : ""}`);
  const { learnerId, weekId, lessonSetId } = canonicalFixture;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    await verifyCanonicalFixtureIdentity(client);
    const currentLessons = await client.query(
      `select l.id, lsv.id as version_id
       from lesson_sets ls
       join lateral (
         select id
         from lesson_set_versions
         where lesson_set_id = ls.id and status = 'published'
         order by published_at desc nulls last, created_at desc
         limit 1
       ) lsv on true
       join lessons l on l.lesson_set_version_id = lsv.id
       where ls.id = $2 and ls.program_week_id = $1 and ls.cefr = 'A2'
       order by l.day_number`,
      [weekId, lessonSetId]
    );
    assert(currentLessons.rows.length >= 5, `Canonical learner fixture has only ${currentLessons.rows.length}/5 published lessons`);

    await client.query(
      `delete from practice_appeals
       where learner_id = $1
         and submission_id in (
           select id from practice_submissions
           where learner_id = $1 and program_week_id = $2
         )`,
      [learnerId, weekId]
    );
    await client.query(
      `delete from practice_submissions
       where learner_id = $1 and program_week_id = $2`,
      [learnerId, weekId]
    );
    if (!completeWeek) {
      await client.query(
        `delete from progress_records
         where learner_id = $1
           and lesson_id in (
             select l.id
             from lessons l
             join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id
             join lesson_sets ls on ls.id = lsv.lesson_set_id
             where ls.program_week_id = $2 and ls.cefr = 'A2'
           )`,
        [learnerId, weekId]
      );
    }
    const progressLessons = completeWeek ? currentLessons.rows : currentLessons.rows.slice(0, 1);
    for (const lesson of progressLessons) {
      await client.query(
        `insert into progress_records (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at)
         values ($1, $2, $3, 'completed', 90,
           '{"completedPartCodes":["listening","reading","writing","speaking"],"evidence":{"listening":{"attempts":1,"answer":"Customer emails"},"reading":{"attempts":1,"answer":"Our website"},"writing":{"attempts":1,"answer":"I work in AI."},"speaking":{"attempts":1,"answer":"seed-audio"}}}'::jsonb,
           now() - interval '1 day', now() - interval '1 day')
         on conflict (learner_id, lesson_id) do update set
           status = excluded.status,
           score = excluded.score,
           evidence = excluded.evidence,
           started_at = excluded.started_at,
           completed_at = excluded.completed_at`,
        [randomUUID(), learnerId, lesson.id]
      );
    }
    await client.query("commit");
    return { versionId: currentLessons.rows[0].version_id, firstLessonId: currentLessons.rows[0].id, completedLessons: progressLessons.length };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function visibleSituationTextarea(page) {
  const field = page.locator("label:visible").filter({ hasText: /^Tình huống cụ thể hay gặp/ });
  await field.first().waitFor({ state: "visible" });
  const fieldCount = await field.count();
  assert(fieldCount === 1, `Expected one visible-label prefix match for the situation field, found ${fieldCount}`);
  const textarea = field.locator("textarea:visible");
  await textarea.first().waitFor({ state: "visible" });
  const textareaCount = await textarea.count();
  assert(textareaCount === 1, `Expected one visible situation textarea descendant, found ${textareaCount}`);
  return textarea;
}

async function learnerRun(page, run, viewport) {
  const role = "learner";
  await ensureDeterministicAudioFixture();
  await prepareCanonicalLearnerWeeklyPracticeFixture();
  await step(page, role, run, "root-entry-own-role", async () => {
    await page.goto(`${webUrl}/`, { waitUntil: "networkidle" });
    await page.waitForSelector('form input[name="email"]');
    assert(new URL(page.url()).pathname === "/", "Learner fresh context did not start at root entry");
    return { expectedLanding: "/home" };
  });

  await step(page, role, run, "login-lands-home", async () => {
    await login(page, role);
    assert(new URL(page.url()).pathname === "/home", `Learner landed at ${new URL(page.url()).pathname}, expected /home`);
    return { role, expectedPath: "/home" };
  });

  await step(page, role, run, "learner2-isolation", async () => {
    await logout(page);
    await loginWithFixture(page, secondaryLearner, "learner");
    const reset = await resetSecondaryLearnerProfile(page);
    await page.goto(`${webUrl}/home`, { waitUntil: "networkidle" });
    const profile = await jsonFromPage(page, "/api/v1/learner/profile");
    assert(profile.status === 200, `Learner 2 profile API status ${profile.status}`);
    assert(profile.body.profile?.email === secondaryLearner.email, `Learner 2 profile leaked or mismatched: ${JSON.stringify(profile.body.profile?.email)}`);
    assert(profile.body.profile?.fullName === secondaryLearner.expectedName, `Learner 2 name mismatched: ${JSON.stringify(profile.body.profile?.fullName)}`);
    const home = await jsonFromPage(page, "/api/v1/learner/home");
    assert(home.status === 200, `Learner 2 home API status ${home.status}`);
    const body = await page.locator("body").innerText();
    assert(body.includes(secondaryLearner.expectedName), "Learner 2 shell does not show its own display name");
    assert(!body.includes("Học viên Demo"), "Learner 1 display name leaked into learner 2 shell");
    return { email: profile.body.profile.email, displayName: profile.body.profile.fullName, completed: profile.body.completed, homeStatus: home.status, profileResetStatus: reset.status };
  });

  await step(page, role, run, "profile-draft-and-placement", async () => {
    await resetSecondaryLearnerProfile(page);
    await page.goto(`${webUrl}/onboard`, { waitUntil: "networkidle" });
    await page.getByLabel(/Họ tên/).waitFor();
    const draftText = `Draft checkpoint ${viewport.key} run ${run}`;
    const situation = await visibleSituationTextarea(page);
    await situation.fill(draftText);
    const draftRequest = page.waitForResponse((response) => response.url().includes("/api/v1/learner/profile") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    const draftResponse = await draftRequest;
    const draftBody = await responseBody(draftResponse);
    assert(draftResponse.ok(), `Profile draft save returned HTTP ${draftResponse.status()}: ${JSON.stringify(draftBody)}`);
    assert(draftBody?.completed === false && draftBody?.profile?.situations === draftText, `Profile draft response did not persist the situation: ${JSON.stringify(draftBody)}`);
    await page.waitForURL((url) => url.pathname === "/home", { timeout: 20_000 });
    assert(new URL(page.url()).pathname === "/home", `Profile draft save landed at ${new URL(page.url()).pathname}, expected /home`);

    const resumeProfile = page.getByRole("link", { name: "Điền hồ sơ (~2 phút)", exact: true });
    await resumeProfile.waitFor();
    await resumeProfile.click();
    await page.waitForURL((url) => url.pathname === "/onboard", { timeout: 20_000 });
    const restoredSituation = await visibleSituationTextarea(page);
    assert(await restoredSituation.inputValue() === draftText, "Profile draft did not survive the Home CTA round trip");
    const persistedDraft = await jsonFromPage(page, "/api/v1/learner/profile");
    assertJsonStatus("Persisted learner profile draft", persistedDraft, 200);
    assert(persistedDraft.body.completed === false && persistedDraft.body.profile?.situations === draftText, `Profile draft API state mismatched after returning to onboarding: ${JSON.stringify(persistedDraft.body)}`);

    await page.getByLabel("Nói chuyện với khách hàng / đối tác", { exact: true }).check();
    await page.getByRole("group", { name: "Mức độ dùng tiếng Anh trong môi trường làm việc? *", exact: true }).getByLabel("Hằng ngày", { exact: true }).check();
    await page.getByRole("group", { name: "Mức độ sử dụng tiếng Anh trong gia đình bạn? *", exact: true }).getByLabel("Không dùng", { exact: true }).check();
    await page.getByLabel("Xem phim / video tiếng Anh", { exact: true }).check();
    await page.getByLabel("Đọc và ghi chú", { exact: true }).check();
    const completionRequest = page.waitForResponse((response) => response.url().includes("/api/v1/learner/profile") && response.request().method() === "PUT");
    await page.getByRole("button", { name: /Lưu và làm test đầu vào/ }).click();
    const completionResponse = await completionRequest;
    const completionBody = await responseBody(completionResponse);
    assert(completionResponse.ok(), `Profile completion returned HTTP ${completionResponse.status()}: ${JSON.stringify(completionBody)}`);
    assert(completionBody?.completed === true, `Profile completion response remained incomplete: ${JSON.stringify(completionBody)}`);
    await page.waitForURL((url) => url.pathname === "/test/placement", { timeout: 20_000 });
    const placement = await jsonFromPage(page, "/api/v1/assessments/placement");
    assertJsonStatus("Placement API", placement, 200);
    const table = page.getByRole("table", { name: "Cấu trúc bài test" });
    assert(await table.count() === 1, "Placement introduction table is missing");
    const tableText = await table.innerText();
    for (const expected of ["Nghe", "Đọc", "Viết", "Nói", "15 phút", "25 phút", "20 phút"]) assert(tableText.includes(expected), `Placement timing table is missing ${expected}`);
    for (const expected of ["Bắt buộc", "Không được phép", "Lưu ý", "Thử tai nghe", "Thử micro (3 giây)", "Bắt đầu phần Nghe"]) assert((await page.getByText(expected, { exact: true }).count()) > 0 || (await page.getByRole("button", { name: expected, exact: true }).count()) > 0, `Placement introduction is missing ${expected}`);
    return {
      draftPersisted: true,
      draftResponseStatus: draftResponse.status(),
      draftReturnRoute: "/home",
      draftResumeCta: "Điền hồ sơ (~2 phút)",
      profileCompletionStatus: completionResponse.status(),
      placementRoute: "/test/placement",
      placementStatus: placement.status,
      placementTitle: placement.body.title,
      introduction: { table: true, rules: ["Bắt buộc", "Không được phép", "Lưu ý"], durations: [15, 25, 20, 15] }
    };
  });

  await step(page, role, run, "profile-edit-returns-progress", async () => {
    await page.goto(`${webUrl}/onboard`, { waitUntil: "networkidle" });
    await page.getByLabel(/Họ tên/).waitFor();
    const editedSituation = `Edited profile checkpoint ${viewport.key} run ${run}`;
    await (await visibleSituationTextarea(page)).fill(editedSituation);
    const request = page.waitForResponse((response) => response.url().includes("/api/v1/learner/profile") && response.request().method() === "PUT");
    await page.getByRole("button", { name: /Lưu hồ sơ|Lưu thay đổi|Lưu nháp/ }).last().click();
    const response = await request;
    assert(response.ok(), `Profile edit returned ${response.status()}`);
    await page.waitForURL((url) => url.pathname === "/profile", { timeout: 20_000 });
    const persisted = await jsonFromPage(page, "/api/v1/learner/profile");
    assert(persisted.status === 200 && persisted.body.completed === true, "Edited completed profile did not remain complete");
    assert(persisted.body.profile?.situations === editedSituation, "Edited profile value was not persisted");
    return { saveStatus: response.status(), returnRoute: "/profile", completed: persisted.body.completed };
  });

  await step(page, role, run, "placement-guard-after-incomplete-profile", async () => {
    await logout(page);
    await loginWithFixture(page, secondaryLearner, "learner");
    await resetSecondaryLearnerProfile(page);
    await page.goto(`${webUrl}/test/placement`, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname === "/onboard", { timeout: 20_000 });
    return { sourceRoute: "/test/placement", redirectedRoute: "/onboard" };
  });
  await logout(page);
  await login(page, role);

  const home = await step(page, role, run, "home-loaded", async () => {
    // The home screen intentionally has no literal "Trang chủ" heading. Its
    // primary block is the stable route/state marker across the empty-week,
    // locked-next-lesson, and active-lesson fixtures.
    await page.locator('[data-home-block="primary"] h2').first().waitFor();
    const response = await jsonFromPage(page, "/api/v1/learner/home");
    assert(response.status === 200, `Learner home API status ${response.status}`);
    const next = response.body.nextLesson;
    assert(next?.id && !next.lock, `No unlocked next lesson in fixture: ${JSON.stringify(next)}`);
    await checkNoOverflow(page);
    return {
      nextLesson: { id: next.id, title: next.title, status: next.status },
      availableLessonIds: (response.body.lessons ?? []).map((lesson) => lesson.id).filter(Boolean),
      homeStatus: response.status
    };
  });

  await step(page, role, run, "approved-placement-guard", async () => {
    await page.goto(`${webUrl}/test/placement`, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname === "/home", { timeout: 20_000 });
    const response = await jsonFromPage(page, "/api/v1/assessments/placement");
    assert(response.status === 200, `Approved placement API status ${response.status}`);
    const placementStatus = response.body.status ?? response.body.attempt?.status;
    assert(placementStatus === "approved", `Placement precondition was ${placementStatus}, expected approved`);
    return { sourceRoute: "/test/placement", redirectedRoute: "/home", placementStatus, apiStatus: response.status };
  });

  await step(page, role, run, "music-preference-survives-account-switch", async () => {
    const music = page.getByRole("button", { name: /Nhạc nền:/ }).first();
    await music.waitFor();
    await music.click();
    assert(await music.getAttribute("aria-pressed") === "false", "Music toggle did not turn off");
    await page.reload({ waitUntil: "networkidle" });
    const reloaded = page.getByRole("button", { name: /Nhạc nền:/ }).first();
    assert(await reloaded.getAttribute("aria-pressed") === "false", "Music preference did not survive reload");
    await logout(page);
    await loginWithFixture(page, secondaryLearner, "learner");
    const switched = page.getByRole("button", { name: /Nhạc nền:/ }).first();
    assert(await switched.getAttribute("aria-pressed") === "false", "Music preference changed with account instead of device");
    await logout(page);
    await login(page, role);
    return { route: "/home", afterToggle: false, afterReload: false, afterAccountSwitch: false, preferenceKey: "e4s:music" };
  });

  const lessonId = home?.nextLesson?.id;
  assert(lessonId, "Learner flow did not resolve a lesson id");

  await step(page, role, run, "no-standalone-micro-lesson", async () => {
    const homeBody = await page.locator("body").innerText();
    assert(!/Bài học ngắn/i.test(homeBody), "Standalone Bài học ngắn is still advertised in learner home");
    const validLessonId = home.availableLessonIds?.[0] ?? lessonId;
    const validLesson = await jsonFromPage(page, `/api/v1/lessons/${encodeURIComponent(validLessonId)}`);
    assert(validLesson.status === 200, `Could not resolve valid learner lesson id ${validLessonId}: ${validLesson.status}`);
    await page.goto(`${webUrl}/micro/${encodeURIComponent(validLessonId)}`, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    assert(new URL(page.url()).pathname === `/micro/${validLessonId}`, "Standalone micro probe did not stay on the requested route");
    assert(await page.getByRole("heading", { name: "Không tìm thấy trang." }).count() === 1, "Standalone micro route did not resolve to the real not-found surface");
    assert(await page.locator(".micro-page").count() === 0, "A standalone micro lesson surface rendered for a valid lesson id");
    assert(!/Bài học ngắn|Học nhanh|Luyện ngay/i.test(body), "Standalone micro route rendered learner micro-lesson content");
    await page.goto(`${webUrl}/home`, { waitUntil: "networkidle" });
    await page.locator('[data-home-block="primary"] h2').first().waitFor();
    return { homeRouteClean: true, validLessonId, legacyRoute: `/micro/${validLessonId}`, legacyRouteState: "not-found" };
  });

  await step(page, role, run, "open-lesson-from-home", async () => {
    const link = page.locator(`a[href="/lesson/${lessonId}"]`).first();
    await link.waitFor();
    await link.click();
    await page.waitForURL((url) => url.pathname === `/lesson/${lessonId}`);
    await page.getByRole("heading", { name: home.nextLesson.title, exact: true }).waitFor();
    return { route: `/lesson/${lessonId}` };
  });

  const lesson = await step(page, role, run, "lesson-study-state", async () => {
    const response = await jsonFromPage(page, `/api/v1/lessons/${lessonId}`);
    assert(response.status === 200, `Lesson API status ${response.status}`);
    const codes = response.body.content?.parts?.map((part) => part.code) ?? [];
    const required = ["listening", "reading", "writing", "word_class", "word_use", "speaking"];
    assert(required.every((code) => codes.includes(code)), `Lesson does not expose all six practice parts: ${codes.join(",")}`);
    assert(await page.getByRole("tab", { name: /1\. Học/ }).count() === 1, "Study tab is missing");
    return { lessonId, codes, progress: response.body.progress };
  });

  await step(page, role, run, "lesson-tabs-and-study-content", async () => {
    const study = page.getByRole("tab", { name: /1\. Học/ });
    const practice = page.getByRole("tab", { name: /2\. Bài tập/ });
    assert(await study.count() === 1 && await practice.count() === 1, "Lesson study/practice tabs are missing");
    await study.click();
    for (const label of [/Mục tiêu/i, /Hướng dẫn/i, /Từ vựng/i, /Ngữ pháp/i, /Phát âm/i]) {
      assert(await page.getByText(label).count() > 0, `Lesson study content is missing ${label}`);
    }
    return { route: `/lesson/${lessonId}`, tabs: ["1. Học", "2. Bài tập"], sections: ["Mục tiêu", "Hướng dẫn", "Từ vựng", "Ngữ pháp", "Phát âm"] };
  });

  await step(page, role, run, "vocabulary-media-and-forbidden-statuses", async () => {
    const studyTab = page.getByRole("tab", { name: /1\. Học/ });
    await studyTab.click();
    await page.getByRole("heading", { name: /Từ vựng/ }).waitFor();
    const vocabularySection = page.locator('[data-part="vocabulary"]');
    await vocabularySection.first().waitFor({ state: "visible" });
    const vocabularySectionCount = await vocabularySection.count();
    assert(vocabularySectionCount === 1, `Expected one visible vocabulary section, found ${vocabularySectionCount}`);
    const cards = vocabularySection.locator(".vocabulary-card");
    await cards.first().waitFor({ state: "visible" });
    const cardCount = await cards.count();
    assert(cardCount > 0, "Lesson has no vocabulary cards");
    for (let index = 0; index < cardCount; index += 1) {
      await cards.nth(index).scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
    }
    const availableImages = await vocabularySection.locator(".vocabulary-card .content-image--available img").count();
    const fallbackImages = await vocabularySection.locator(".vocabulary-card .content-image--fallback").count();
    assert(fallbackImages === 0, `${fallbackImages} vocabulary card(s) still show missing illustration fallback`);
    assert(availableImages === cardCount, `Only ${availableImages}/${cardCount} vocabulary card(s) have a real illustration`);
    const relationLabels = await cards.evaluateAll((items) => items.map((item) => item.textContent ?? "").join(" "));
    assert(/Họ từ|Đồng nghĩa|Trái nghĩa/.test(relationLabels), "Vocabulary relation groups are not visible in the lesson");
    const speechSupport = await page.evaluate(() => {
      const synthesis = window.speechSynthesis;
      const constructorAvailable = typeof window.SpeechSynthesisUtterance === "function";
      if (!synthesis || typeof synthesis.speak !== "function" || !constructorAvailable) return { supported: false };
      const evidence = { calls: [], playback: { started: 0, ended: 0, errors: 0, events: [] } };
      const prototype = Object.getPrototypeOf(synthesis);
      const original = prototype.speak;
      if (typeof original !== "function") return { supported: false };
      try {
        prototype.speak = function instrumentedSpeak(utterance) {
          const callIndex = evidence.calls.length;
          evidence.calls.push(utterance.text);
          const onStart = utterance.onstart;
          const onEnd = utterance.onend;
          const onError = utterance.onerror;
          utterance.onstart = (event) => { evidence.playback.started += 1; evidence.playback.events.push({ callIndex, type: "started" }); onStart?.call(utterance, event); };
          utterance.onend = (event) => { evidence.playback.ended += 1; evidence.playback.events.push({ callIndex, type: "ended" }); onEnd?.call(utterance, event); };
          utterance.onerror = (event) => { evidence.playback.errors += 1; evidence.playback.events.push({ callIndex, type: "error" }); onError?.call(utterance, event); };
          return original.call(this, utterance);
        };
      } catch {
        return { supported: false };
      }
      window.__e4sVocabularySpeechEvidence = evidence;
      return { supported: true };
    });
    if (!speechSupport.supported) throw new Unverified("Trình duyệt không cung cấp SpeechSynthesis để xác nhận audio từ vựng.");
    await vocabularySection.evaluate((section, forbiddenLabels) => {
      window.__e4sVocabularyForbiddenObserver?.observer.disconnect();
      const observed = new Set();
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && bounds.width > 0 && bounds.height > 0;
      };
      const scan = () => {
        for (const element of [section, ...section.querySelectorAll("*")]) {
          const text = element instanceof HTMLElement ? element.innerText.trim() : element.textContent?.trim();
          if (forbiddenLabels.includes(text) && isVisible(element)) observed.add(text);
        }
      };
      const observer = new MutationObserver(scan);
      observer.observe(section, { attributes: true, characterData: true, childList: true, subtree: true });
      scan();
      window.__e4sVocabularyForbiddenObserver = { observed, observer, scan };
    }, ["Nguồn ảnh", "Cụm từ hay dùng", "Đang phát", "Đã phát xong"]);
    const clickedWords = [];
    let speechEvidence;
    let finalPlaybackBaseline;
    let playbackUnavailable = false;
    let forbiddenLabels = [];
    try {
      for (let index = 0; index < cardCount; index += 1) {
        const card = cards.nth(index);
        await card.waitFor({ state: "visible" });
        const wordHeading = card.getByRole("heading", { level: 3 });
        await wordHeading.first().waitFor({ state: "visible" });
        const headingCount = await wordHeading.count();
        assert(headingCount === 1, `Vocabulary card ${index + 1} has ${headingCount} visible word headings`);
        const word = (await wordHeading.innerText()).trim();
        assert(word, `Vocabulary card ${index + 1} has an empty word heading`);
        const listenButton = card.getByRole("button", { name: "Nghe từ", exact: true });
        await listenButton.first().waitFor({ state: "visible" });
        const listenButtonCount = await listenButton.count();
        assert(listenButtonCount === 1, `Vocabulary card "${word}" has ${listenButtonCount} exact Nghe từ buttons`);
        assert(await listenButton.isEnabled(), `Vocabulary card "${word}" has a disabled Nghe từ button`);
        const playbackBaseline = await page.evaluate(() => ({
          calls: window.__e4sVocabularySpeechEvidence.calls.length,
          started: window.__e4sVocabularySpeechEvidence.playback.started,
          ended: window.__e4sVocabularySpeechEvidence.playback.ended
        }));
        const callsBeforeClick = playbackBaseline.calls;
        finalPlaybackBaseline = { callIndex: callsBeforeClick, started: playbackBaseline.started, ended: playbackBaseline.ended };
        await listenButton.click();
        try {
          await page.waitForFunction((expectedCalls) => window.__e4sVocabularySpeechEvidence?.calls.length >= expectedCalls, callsBeforeClick + 1, { timeout: 5_000 });
        } catch {
          throw new Error(`Clicking Nghe từ for vocabulary card "${word}" did not call speechSynthesis.speak`);
        }
        const callsAfterClick = await page.evaluate(() => [...window.__e4sVocabularySpeechEvidence.calls]);
        assert(callsAfterClick.length === callsBeforeClick + 1, `Vocabulary card "${word}" added ${callsAfterClick.length - callsBeforeClick} speech calls instead of one`);
        assert(callsAfterClick[callsBeforeClick] === word, `Vocabulary card "${word}" spoke ${JSON.stringify(callsAfterClick[callsBeforeClick])}`);
        clickedWords.push(word);
      }
      assert(finalPlaybackBaseline, "Final vocabulary playback baseline is missing");
      try {
        await page.waitForFunction((baseline) => {
          const evidence = window.__e4sVocabularySpeechEvidence;
          if (!evidence) return false;
          const increased = evidence.playback.started > baseline.started || evidence.playback.ended > baseline.ended;
          const finalCallEvent = evidence.playback.events.some((event) => event.callIndex === baseline.callIndex && (event.type === "started" || event.type === "ended"));
          return increased && finalCallEvent;
        }, finalPlaybackBaseline, { timeout: 5_000 });
      } catch {
        playbackUnavailable = true;
      }
      speechEvidence = await page.evaluate(() => ({
        calls: [...window.__e4sVocabularySpeechEvidence.calls],
        playback: { ...window.__e4sVocabularySpeechEvidence.playback, speaking: Boolean(window.speechSynthesis?.speaking) }
      }));
    } finally {
      forbiddenLabels = await page.evaluate(() => {
        const state = window.__e4sVocabularyForbiddenObserver;
        if (!state) throw new Error("Vocabulary forbidden-label observer is missing");
        state.scan();
        state.observer.disconnect();
        const observed = [...state.observed];
        delete window.__e4sVocabularyForbiddenObserver;
        return observed;
      });
    }
    assert(forbiddenLabels.length === 0, `Forbidden vocabulary/audio status label(s) appeared during playback: ${forbiddenLabels.join(", ")}`);
    if (playbackUnavailable) throw new Unverified("Đã click audio từ vựng nhưng không bắt được request/playback event đáng tin.");
    return { vocabularyCards: cardCount, illustrations: availableImages, audioControls: clickedWords.length, relationGroups: true, audio: speechEvidence, forbiddenLabels };
  });

  await step(page, role, run, "open-practice-after-study", async () => {
    const practiceTab = page.getByRole("tab", { name: /2\. Bài tập/ });
    if (await practiceTab.isDisabled()) {
      const finishStudy = page.getByRole("button", { name: /Đã học xong|Sang bài tập/ }).first();
      await finishStudy.click();
      await practiceTab.waitFor({ state: "attached" });
    }
    await practiceTab.click();
    await page.locator('[data-part="listening"]').waitFor();
    const visibleCodes = await page.locator('[data-part]').evaluateAll((items) => items.map((item) => item.getAttribute("data-part")));
    assert(visibleCodes.includes("listening") && visibleCodes.includes("speaking"), `Practice did not expose expected parts: ${visibleCodes.join(",")}`);
    return { visibleCodes };
  });

  await step(page, role, run, "practice-persist-non-audio", async () => {
    const model = await jsonFromPage(page, `/api/v1/lessons/${lessonId}`);
    assert(model.status === 200, `Reloaded lesson API status ${model.status}`);
    const parts = model.body.content.parts;
    const current = model.body.progress;
    const answers = {
      listening: parts.find((part) => part.code === "listening")?.content?.answer,
      reading: parts.find((part) => part.code === "reading")?.content?.answer,
      writing: "I prepare reports and review the data every day.",
      word_class: parts.find((part) => part.code === "word_class")?.content?.answer,
      word_use: parts.find((part) => part.code === "word_use")?.content?.answer
    };
    const pending = ["listening", "reading", "writing", "word_class", "word_use"].filter((code) => !current.completedPartCodes.includes(code));
    const submitted = [];
    for (const code of pending) {
      const answer = String(answers[code] ?? "").trim();
      assert(answer, `No deterministic answer available for ${code}`);
      const card = page.locator(`[data-part="${code}"]`);
      await card.waitFor();
      const radios = card.locator('input[type="radio"]');
      if (await radios.count()) {
        const option = card.locator("label").filter({ hasText: answer }).first();
        await option.click();
      } else {
        await card.getByRole("textbox").fill(answer);
      }
      const submit = card.getByRole("button", { name: /Nộp bài|Đã xong/ }).first();
      if (!(await submit.isDisabled())) {
        const request = page.waitForResponse((response) => response.url().includes(`/api/v1/lessons/${lessonId}/parts/${code}/attempts`) && response.request().method() === "POST");
        await submit.click();
        const response = await request;
        assert(response.ok(), `Part ${code} submit returned ${response.status()}`);
        submitted.push(code);
      }
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname === `/lesson/${lessonId}`);
    const practiceTab = page.getByRole("tab", { name: /2\. Bài tập/ });
    if (await practiceTab.isDisabled()) {
      throw new Error("Practice tab became disabled after saving part evidence");
    }
    await practiceTab.click();
    const persisted = await jsonFromPage(page, `/api/v1/lessons/${lessonId}`);
    assert(persisted.status === 200, `Persistence check API status ${persisted.status}`);
    const evidenceCodes = Object.keys(persisted.body.progress.evidence ?? {});
    for (const code of submitted) assert(evidenceCodes.includes(code), `Saved evidence for ${code} disappeared after reload`);
    return { submitted, persistedEvidenceCodes: evidenceCodes, progressStatus: persisted.body.progress.status };
  });

  await step(page, role, run, "speaking-audio-gate", async () => {
    const fixture = await verifiedAudioFixture();
    const current = await jsonFromPage(page, `/api/v1/lessons/${lessonId}`);
    assert(current.status === 200, `Speaking lesson API returned ${current.status}`);
    const previousSpeaking = current.body.progress.evidence?.speaking;
    const previousArtifactKey = previousSpeaking?.artifactKey;
    const previousAttempts = Number(previousSpeaking?.attempts ?? 0);
    const card = page.locator('[data-part="speaking"]');
    await card.waitFor();
    const uploadResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/v1/files/assessment-audio" && response.request().method() === "POST";
    });
    await card.locator('input[aria-label="Tải file ghi âm speaking"]').setInputFiles(fixture.path);
    const uploaded = await uploadResponse;
    assert(uploaded.status() === 201, `Speaking audio upload returned ${uploaded.status()}, expected 201`);
    assert(uploaded.request().headers()["content-type"]?.startsWith("multipart/form-data;"), "Speaking upload was not multipart/form-data");
    const uploadBody = await uploaded.json().catch(() => ({}));
    const artifactKey = uploadBody.artifactKey;
    assert(typeof artifactKey === "string" && /^assessment-audio\/[^/]+\/[0-9a-f-]+\.(mp3|m4a|wav|ogg|oga|webm|aac|flac|amr|3gp)$/i.test(artifactKey), `Speaking upload returned invalid artifactKey ${JSON.stringify(artifactKey)}`);
    assert(artifactKey !== previousArtifactKey, `Speaking upload reused persisted artifact ${artifactKey}`);
    await card.getByText("Đã tải file ghi âm lên.").waitFor();
    const speakingAnswer = String(current.body.content?.parts?.find((part) => part.code === "speaking")?.content?.answer ?? "").trim();
    assert(speakingAnswer, "Lesson speaking answer is missing from the real lesson payload");
    await card.getByRole("textbox").fill(speakingAnswer);
    // A completed lesson disables the UI submit button, but uploading a fresh
    // artifact is still supported. Persist that exact upload through the same
    // learner attempt API used by the button, with a new idempotency key.
    const attempted = await jsonRequestFromPage(page, `/api/v1/lessons/${lessonId}/parts/speaking/attempts`, "POST", {
      requestId: randomUUID(),
      answer: speakingAnswer,
      artifactKey
    });
    assert(attempted.status === 200, `Speaking attempt returned ${attempted.status}`);
    assert(attempted.body.evidence?.artifactKey === artifactKey, "Speaking attempt did not bind the newly uploaded artifact");
    assert(Number(attempted.body.evidence?.attempts ?? 0) > previousAttempts, "Speaking attempt number did not advance in this run");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname === `/lesson/${lessonId}`);
    const persisted = await jsonFromPage(page, `/api/v1/lessons/${lessonId}`);
    const persistedSpeaking = persisted.body.progress?.evidence?.speaking;
    assert(persisted.status === 200, `Speaking persistence query returned ${persisted.status}`);
    assert(persistedSpeaking?.artifactKey === artifactKey, "Reloaded speaking evidence does not reference this run's upload");
    assert(Number(persistedSpeaking?.attempts ?? 0) > previousAttempts, "Reloaded speaking attempt number did not advance in this run");
    return {
      speaking: "fresh-upload-and-persisted",
      previousArtifactKey,
      artifactKey,
      previousAttempts,
      attempts: persistedSpeaking.attempts,
      uploadStatus: uploaded.status(),
      fixture
    };
  });

  await step(page, role, run, "lesson-completion-gate", async () => {
    const current = await jsonFromPage(page, `/api/v1/lessons/${lessonId}`);
    let complete = current.body.progress.status === "completed";
    const completion = page.getByRole("button", { name: /Hoàn thành bài/ }).first();
    if (!complete) {
      if (!await completion.count()) throw new Unverified("Không thấy nút Hoàn thành bài sau khi nộp đủ bằng chứng.");
      if (await completion.isDisabled()) throw new Unverified("Nút Hoàn thành bài vẫn khoá vì chưa đủ bằng chứng các phần.");
      const response = page.waitForResponse((item) => item.url().includes(`/api/v1/lessons/${lessonId}/progress`) && item.request().method() === "PUT");
      await completion.click();
      const saved = await response;
      assert(saved.ok(), `Lesson completion returned ${saved.status()}`);
      const refreshed = await jsonFromPage(page, `/api/v1/lessons/${lessonId}`);
      assert(refreshed.status === 200, `Lesson completion reload returned ${refreshed.status}`);
      complete = refreshed.body.progress.status === "completed";
    }
    assert(complete, `Lesson completion status is ${current.body.progress.status}`);
    return { status: current.body.progress.status };
  });

  await step(page, role, run, "coach-route-and-fallback", async () => {
    await page.goto(`${webUrl}/coach`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Season", exact: true }).waitFor();
    const response = await jsonFromPage(page, "/api/v1/coach");
    assert(response.status === 200, `Coach API status ${response.status}`);
    assert(await page.getByRole("img", { name: "Avatar của Season" }).count() === 1, "Season avatar is missing");
    assert(await page.getByRole("group", { name: "Phong cách của Season" }).count() === 1, "Season persona controls are missing");
    assert(await page.getByRole("button", { name: "Xoá chat", exact: true }).count() === 1, "Coach clear-chat control is missing");
    assert(await page.getByRole("textbox", { name: "Tin nhắn cho Season" }).count() === 1, "Coach message input is missing");
    await checkNoOverflow(page);
    return { route: "/coach", status: response.status, aiAvailable: response.body.aiAvailable, messages: response.body.messages?.length ?? 0 };
  });

  await step(page, role, run, "coach-message-runtime", async () => {
    const current = await jsonFromPage(page, "/api/v1/coach");
    if (current.status !== 200) throw new Error(`Coach reload API status ${current.status}`);
    if (current.body.aiAvailable !== true) throw new Unverified("Coach route và fallback đã hiện, nhưng AI chưa được cấu hình nên chưa thể gửi hội thoại thật.");
    const input = page.getByRole("textbox", { name: "Tin nhắn cho Season" });
    await input.fill("I introduce myself and my job in a meeting.");
    const request = page.waitForResponse((response) => response.url().includes("/api/v1/coach/messages") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    const response = await request;
    assert(response.ok(), `Coach message returned ${response.status()}`);
    await page.getByRole("region", { name: "Cuộc trò chuyện với Season" }).waitFor();
    return { messageStatus: response.status(), aiAvailable: true };
  });

  await step(page, role, run, "weekend-practice-route", async () => {
    await prepareCanonicalLearnerWeeklyPracticeFixture({ completeWeek: true });
    await page.goto(`${webUrl}/practice`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Bài thực hành cuối tuần", exact: true }).waitFor();
    const response = await jsonFromPage(page, "/api/v1/engagement/practice");
    assert(response.status === 200, `Weekend practice API status ${response.status}`);
    await checkNoOverflow(page);
    return { route: "/practice", status: response.status, state: response.body.state, completedLessons: response.body.completedLessons, totalLessons: response.body.totalLessons, submission: Boolean(response.body.submission) };
  });

  await step(page, role, run, "weekend-practice-submit-gate", async () => {
    const current = await jsonFromPage(page, "/api/v1/engagement/practice");
    if (current.status !== 200) throw new Error(`Weekend practice reload API status ${current.status}`);
    assert(current.body.state === "open", `Weekend practice precondition was ${current.body.state}; expected open at ${current.body.completedLessons}/${current.body.totalLessons}.`);
    assert(current.body.submission === null, `Weekend practice precondition already has a submission: ${JSON.stringify(current.body.submission)}`);
    assert(current.body.totalLessons > 0 && current.body.completedLessons >= Math.min(5, current.body.totalLessons),
      `Weekend practice precondition is not lesson-complete: ${current.body.completedLessons}/${current.body.totalLessons}`);
    const practiceText = `I will review the meeting notes and send a clear follow up email today (${viewport.key} run ${run}).`;
    const input = page.getByRole("textbox", { name: /Bài làm|Câu trả lời hội thoại/ });
    await input.fill(practiceText);
    const request = page.waitForResponse((response) => response.url().includes("/api/v1/engagement/practice/submit") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
    const response = await request;
    const submitted = await responseBody(response);
    assert(response.ok(), `Weekend practice submit returned ${response.status()}: ${JSON.stringify(submitted)}`);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Bài thực hành cuối tuần", exact: true }).waitFor();
    const persisted = await jsonFromPage(page, "/api/v1/engagement/practice");
    assert(persisted.status === 200, `Weekend practice persistence query returned ${persisted.status}`);
    assert(["submitted", "reviewed"].includes(persisted.body.state), `Weekend practice state did not persist after reload: ${persisted.body.state}`);
    assert(persisted.body.submission?.status === "submitted" || persisted.body.submission?.status === "reviewed", "Weekend practice submission is missing after reload");
    assert(persisted.body.submission?.text === practiceText, `Weekend practice text did not persist after reload: ${JSON.stringify(persisted.body.submission?.text)}`);
    return { submitStatus: response.status(), submittedState: submitted?.state, persistedState: persisted.body.state, persistedSubmissionId: persisted.body.submission.id, words: practiceText.split(/\s+/).length };
  });

  await step(page, role, run, "profile-progress-reward", async () => {
    await page.goto(`${webUrl}/profile`, { waitUntil: "networkidle" });
    const progress = await jsonFromPage(page, "/api/v1/learner/progress");
    assert(progress.status === 200, `Learner progress API status ${progress.status}`);
    assert(await page.getByText(/Tiến độ|Hồ sơ/).count() > 0, "Profile/progress screen has no visible section marker");
    const points = progress.body.points;
    const readiness = progress.body.levelReadiness;
    await page.goto(`${webUrl}/reward/preview`, { waitUntil: "networkidle" });
    const reward = await jsonFromPage(page, "/api/v1/engagement/rewards/preview");
    assert(reward.status === 200, `Reward preview API status ${reward.status}`);
    assert(await page.locator('[aria-label="Chứng nhận hoàn thành"]').count() === 1, "Certificate preview document is missing");
    const rewardBody = await page.locator("body").innerText();
    assert(/Huy hiệu|Điểm tích luỹ|Certificate of Completion/.test(rewardBody), "Reward preview has no certificate data");
    return { progressStatus: progress.status, points, readiness, rewardStatus: reward.status, rewardPreview: true, printable: reward.body.printable };
  });

  await step(page, role, run, "mini-game-start", async () => {
    await page.goto(`${webUrl}/games`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Game từ vựng", exact: true }).waitFor();
    const response = await jsonFromPage(page, "/api/v1/engagement/games");
    assert(response.status === 200, `Mini-game API status ${response.status}`);
    const gameLinks = page.getByRole("link", { name: /Chơi / });
    assert(await gameLinks.count() >= 1, "Mini-game hub exposes no game links");
    const words = response.body.wordSet?.words ?? [];
    const wordCount = words.length;
    if (wordCount < 8) throw new Unverified(`Mini-game hub is visible but deterministic word set has only ${wordCount} usable words.`);
    await page.goto(`${webUrl}/games/scramble`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Bắt đầu chơi", exact: true }).click();
    await page.getByRole("group", { name: "Chữ cái bị xáo trộn" }).waitFor();
    const answerForCurrentWord = async () => {
      const clue = (await page.locator(".scramble-scene p strong").innerText()).trim();
      const source = words.find((item) => String(item.vietnamese).trim() === clue);
      assert(source?.english, `No deterministic word matches visible scramble clue ${clue}`);
      return String(source.english).toLowerCase().replace(/[^a-z]/g, "");
    };
    const clickLetters = async (target) => {
      for (const character of target) {
        const candidates = page.locator(`button[aria-label^="Chữ ${character} "]`);
        let chosen = -1;
        for (let index = 0; index < await candidates.count(); index += 1) {
          if (!(await candidates.nth(index).isDisabled())) { chosen = index; break; }
        }
        assert(chosen >= 0, `No available scramble tile for ${character} in ${target}; buttons=${JSON.stringify(await page.locator('.letter-bank button').evaluateAll((items) => items.map((item) => ({ label: item.getAttribute('aria-label'), disabled: item.disabled }))))}`);
        await candidates.nth(chosen).click();
      }
    };
    const heading = await page.getByRole("heading", { name: /Từ \d+\/\d+/ }).innerText();
    let resultRequest;
    for (let index = 0; index < 8; index += 1) {
      const target = await answerForCurrentWord();
      if (index === 7) resultRequest = page.waitForResponse((item) => item.url().includes("/api/v1/engagement/games/scramble/results") && item.request().method() === "POST");
      if (index === 1) {
        const wrong = `${target.slice(1)}${target[0]}`;
        await clickLetters(wrong);
        await page.getByText("Chưa đúng – xếp lại nhé.", { exact: true }).waitFor();
        await page.waitForTimeout(550);
        await clickLetters(target);
        await page.getByText(/\+1$/, { exact: false }).waitFor();
      } else if (index === 2) {
        await page.getByRole("button", { name: /Gợi ý/ }).click();
        await page.waitForTimeout(100);
        await clickLetters(target.slice(1));
        await page.getByText(/\+1$/, { exact: false }).waitFor();
      } else {
        await clickLetters(target);
        await page.getByText(index === 0 ? /\+2$/ : /\+(1|2)$/, { exact: false }).waitFor();
      }
      if (index < 7) await page.getByRole("heading", { name: new RegExp(`Từ ${index + 2}/8`) }).waitFor();
    }
    await page.getByRole("status", { name: "Đang lưu kết quả…" }).waitFor({ state: "hidden" }).catch(() => undefined);
    const resultResponse = await resultRequest;
    assert(resultResponse.ok(), `Scramble result submission returned ${resultResponse.status()}`);
    const result = await resultResponse.json().catch(() => ({}));
    return { hubStatus: response.status, game: "scramble", wordCount, started: true, heading, scoring: { immediate: 2, afterWrong: 1, afterHint: 1, wordsPlayed: 8 }, resultStatus: resultResponse.status(), points: result.points };
  });
}

async function loginStaff(page, role) {
  await login(page, role);
  assert(new URL(page.url()).pathname === roles[role].expectedPath, `${role} landed at ${new URL(page.url()).pathname}`);
}

async function createReviewedLessonPublishProbe(viewport, week, cefr, lessons) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  try {
    await login(page, "manager");
    const draft = await jsonRequestFromPage(page, `/api/v1/content/lesson-sets/${week}/${cefr}/draft`, "PUT", { lessons });
    assertJsonStatus("Manager publish-probe draft creation", draft, 201);
    assert(draft.body.status === "draft" && draft.body.versionId, "Publish-probe draft was not persisted as a draft version");
    const review = await jsonRequestFromPage(page, `/api/v1/content/lesson-set-versions/${draft.body.versionId}/review`, "POST", {});
    assertJsonStatus("Manager publish-probe review submission", review, 200);
    assert(review.body.versionId === draft.body.versionId && review.body.status === "review", `Manager review response did not expose the reviewed version: ${JSON.stringify(review.body)}`);
    return { draft, review };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function operatorRun(page, run) {
  const role = "operator";
  const fixture = await prepareOperatorPendingFixture(run);
  await step(page, role, run, "login-lands-op", async () => {
    await loginStaff(page, role);
    await page.getByRole("heading", { name: "Duyệt trình độ", exact: true }).waitFor();
    await checkNoOverflow(page);
    return { route: "/op" };
  });

  const target = await step(page, role, run, "operator-pending-state", async () => {
    const response = await jsonFromPage(page, "/api/v1/assessment-reviews/pending");
    assert(response.status === 200, `Pending assessment API status ${response.status}`);
    const pending = response.body.filter((item) => item.suggestedLevel);
    const selected = pending.find((item) => item.attemptId === fixture.attemptId)
      ?? pending.find((item) => String(item.learnerName).includes("Core flow operator"))
      ?? pending[0];
    if (!selected) throw new Unverified("Không có assessment pending có suggestedLevel để chạy hành động duyệt.");
    return { attemptId: selected.attemptId, learnerId: selected.learnerId, learnerName: selected.learnerName, suggestedLevel: selected.suggestedLevel, pendingCount: pending.length };
  });

  if (target?.attemptId) {
    await step(page, role, run, "approve-pending-assessment", async () => {
      const select = page.locator(`select[aria-label="Mức duyệt cho ${target.learnerName}"]`).first();
      await select.waitFor();
      const levels = await select.locator("option").evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
      const differentLevel = levels.find((level) => level !== String(target.suggestedLevel));
      assert(differentLevel, `No alternate approval level available for ${target.learnerName}`);
      const card = select.locator("xpath=ancestor::div[contains(@class,'card')][1]");
      const button = card.getByRole("button", { name: "Duyệt mức", exact: true });
      await button.waitFor();
      assert(!(await button.isDisabled()), `Approve button is disabled for ${target.learnerName}`);
      await select.selectOption(differentLevel);
      await button.click();
      const dialog = page.getByRole("dialog", { name: "Duyệt mức đầu vào" });
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Duyệt mức", exact: true }).click();
      await page.waitForTimeout(250);
      assert(await page.locator(`select[aria-label="Mức duyệt cho ${target.learnerName}"]`).count() === 1, "Blank-reason attempt removed the pending learner");
      await page.locator(`select[aria-label="Mức duyệt cho ${target.learnerName}"]`).selectOption(differentLevel);
      const request = page.waitForResponse((response) => response.url().includes(`/api/v1/assessment-reviews/${target.attemptId}/decision`) && response.request().method() === "POST");
      await button.click();
      const approvalDialog = page.getByRole("dialog", { name: "Duyệt mức đầu vào" });
      await approvalDialog.getByRole("textbox", { name: "Lý do" }).fill(`Duyệt khác bảng điểm để kiểm tra tiêu chí (${run})`);
      await approvalDialog.getByRole("button", { name: "Duyệt mức", exact: true }).click();
      const response = await request;
      assert(response.ok(), `Assessment decision returned ${response.status()}`);
      await page.waitForFunction(async (attemptId) => {
        const response = await fetch("/api/v1/assessment-reviews/pending", { credentials: "include", cache: "no-store" });
        const pending = await response.json().catch(() => []);
        return response.ok && !pending.some((item) => item.attemptId === attemptId);
      }, target.attemptId);
      const decision = await jsonFromPage(page, `/api/v1/assessment-reviews/attempts/${target.attemptId}`);
      assert(decision.status === 200, `Decision detail returned ${decision.status}`);
      assert(decision.body.suggestedLevel === target.suggestedLevel, `Suggested level was not retained: ${JSON.stringify(decision.body)}`);
      assert(decision.body.approvedLevel === differentLevel, `Different approved level was not retained: ${JSON.stringify(decision.body)}`);
      assert(decision.body.decision?.reason, `Approval reason was not persisted: ${JSON.stringify(decision.body)}`);
      return { attemptId: target.attemptId, learnerName: target.learnerName, suggestedLevel: target.suggestedLevel, approvedLevel: differentLevel, reasonRequired: true, responseStatus: response.status(), decisionStatus: decision.status };
    });
  }

  await step(page, role, run, "operator-persistence-after-approve", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Duyệt trình độ", exact: true }).waitFor();
    const overview = await jsonFromPage(page, "/api/v1/assessment-reviews/overview");
    assert(overview.status === 200, `Overview after approval status ${overview.status}`);
    if (target?.attemptId) {
      assert(!overview.body.pendingAssessments.some((item) => item.attemptId === target.attemptId), "Approved assessment returned to pending queue after reload");
    }
    await checkNoOverflow(page);
    return { pendingAssessments: overview.body.pendingAssessments.length, approvedLearners: overview.body.approvedLearners.length };
  });

  await step(page, role, run, "operator-lesson-review-publish", async () => {
    await page.goto(`${webUrl}/op/lessons`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Sinh & duyệt bài học", exact: true }).waitFor();
    const matrix = await jsonFromPage(page, "/api/v1/content/lesson-matrix");
    assertJsonStatus("Lesson matrix API", matrix, 200);
    const targetWeek = matrix.body.weeks.find((week) => week.cells.some((cell) => cell.lessons.length >= 5));
    const targetCell = targetWeek?.cells.find((cell) => cell.lessons.length >= 5);
    assert(targetWeek && targetCell, `Operator lesson matrix has no complete lesson set for the publish probe: ${JSON.stringify(matrix.body)}`);
    const targetRow = page.locator("tr").filter({ hasText: `Tuần ${targetWeek.weekNumber}` }).first();
    const reviewButton = targetRow.locator(`td[data-label^="${targetCell.cefr} ·"]`).getByRole("button", { name: "Xem / duyệt", exact: true });
    assert(await reviewButton.count() === 1, `Lesson matrix cell ${targetWeek.weekNumber}/${targetCell.cefr} has no unique review action`);
    await reviewButton.click();
    await page.waitForURL((url) => /\/op\/lessons\/\d+\/(A1|A2|B1|B2|C1)$/.test(url.pathname), { timeout: 20_000 });
    const route = new URL(page.url()).pathname;
    const [, , , week, cefr] = route.split("/");
    const sourceVersion = await jsonFromPage(page, `/api/v1/content/lesson-sets/${week}/${cefr}`);
    assertJsonStatus("Publish-probe source lesson set", sourceVersion, 200);
    assert(sourceVersion.body.lessons.length >= 5, `Publish-probe source exposes only ${sourceVersion.body.lessons.length}/5 lessons: ${JSON.stringify(sourceVersion.body)}`);

    // Each viewport creates a fresh manager-owned version from the latest
    // complete content, so a prior viewport cannot supply the state under test.
    // The manager is the maker/reviewer; the operator remains checker-only.
    const draftLessons = sourceVersion.body.lessons.map(({ dayNumber, title, durationMinutes, parts }) => ({ dayNumber, title, durationMinutes, parts }));
    const probe = await createReviewedLessonPublishProbe(pageMetadata.get(page).viewport, week, cefr, draftLessons);
    const reviewedVersionId = probe.review.body.versionId;
    assert(reviewedVersionId !== sourceVersion.body.versionId, "Publish-probe draft reused the source version");

    await page.reload({ waitUntil: "networkidle" });
    const reviewedBeforePublication = await jsonFromPage(page, `/api/v1/content/lesson-sets/${week}/${cefr}`);
    assertJsonStatus("Reviewed lesson set before operator publication", reviewedBeforePublication, 200);
    assert(reviewedBeforePublication.body.versionId === reviewedVersionId && reviewedBeforePublication.body.status === "review", `Operator did not receive the manager-reviewed version: ${JSON.stringify(reviewedBeforePublication.body)}`);
    const publishButton = page.getByRole("button", { name: "Phát hành", exact: true });
    await publishButton.waitFor();
    assert(!(await publishButton.isDisabled()), "Operator publication action is disabled for the manager-reviewed version");
    const publicationRequest = page.waitForResponse((response) => response.url().includes(`/api/v1/content/lesson-set-versions/${reviewedVersionId}/publication`) && response.request().method() === "POST");
    await publishButton.click();
    const published = await publicationRequest;
    const publicationBody = await responseBody(published);
    assert(published.ok(), `Operator publication returned HTTP ${published.status()}: ${JSON.stringify(publicationBody)}`);
    assert(publicationBody?.versionId === reviewedVersionId && publicationBody?.status === "published", `Operator publication response did not expose the published version: ${JSON.stringify(publicationBody)}`);

    await page.reload({ waitUntil: "networkidle" });
    const persisted = await jsonFromPage(page, `/api/v1/content/lesson-sets/${week}/${cefr}`);
    assertJsonStatus("Lesson set persistence query", persisted, 200);
    assert(persisted.body.versionId === reviewedVersionId && persisted.body.status === "published", `Published lesson set did not persist after reload: ${JSON.stringify({ versionId: persisted.body.versionId, status: persisted.body.status })}`);
    assert(persisted.body.publishedAt, "Published lesson set has no persisted publishedAt timestamp");
    const persistedMatrix = await jsonFromPage(page, "/api/v1/content/lesson-matrix");
    assert(persistedMatrix.status === 200, `Lesson matrix persistence query returned ${persistedMatrix.status}`);
    const persistedCell = persistedMatrix.body.weeks.find((item) => item.weekNumber === Number(week))?.cells.find((item) => item.cefr === cefr);
    assert(persistedCell?.status === "published" && persistedCell.versionId === reviewedVersionId, "Lesson matrix did not persist the newly published version");
    const body = await page.locator("body").innerText();
    assert(body.includes("Đã duyệt"), "Operator lesson review screen does not show persisted published status");
    const lessonCards = await page.locator(".operator-card-header").count();
    assert(lessonCards >= 5, `Published lesson set exposes only ${lessonCards}/5 lesson cards after reload`);
    assert(/Nghe|Đọc|Viết|Nói/.test(body), "Published lesson review does not show the four skills");
    await checkNoOverflow(page);
    return {
      route,
      sourceVersionId: sourceVersion.body.versionId,
      sourceVersionStatus: sourceVersion.body.status,
      managerReview: {
        actorRole: "manager",
        draftResponseStatus: probe.draft.status,
        reviewResponseStatus: probe.review.status,
        versionId: reviewedVersionId,
        versionStatus: probe.review.body.status
      },
      operatorPublication: {
        actorRole: "operator",
        responseStatus: published.status(),
        versionId: publicationBody.versionId,
        versionStatus: publicationBody.status
      },
      setStatus: persisted.body.status,
      persistedPublishedAt: persisted.body.publishedAt,
      lessonCards,
      publishedState: true,
      publishAction: "manager-review-then-operator-publication"
    };
  });
}

async function managerRun(page, run) {
  const role = "manager";
  await step(page, role, run, "login-lands-mgr", async () => {
    await loginStaff(page, role);
    await page.getByRole("heading", { name: /Tiến độ nhóm|Quản lý/i }).first().waitFor();
    await checkNoOverflow(page);
    return { route: "/mgr" };
  });

  await step(page, role, run, "manager-own-operations-shell", async () => {
    await page.goto(`${webUrl}/mgr/ops`, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname === "/mgr/ops");
    await page.getByRole("heading", { name: "Hiệu suất vận hành", exact: true }).waitFor();
    const body = await page.locator("body").innerText();
    assert(/vận hành|operations|tổng quan/i.test(body), "Manager operations screen has no operations marker");
    const operationalLinks = page.getByRole("link", { name: /Duyệt mức|Chủ đề tuần|Bài học|Đọc mẫu|Prompt|Đề lên mức/i });
    assert(await operationalLinks.count() >= 6, "Manager operations shell does not expose the full operational navigation");
    await checkNoOverflow(page);
    return { route: "/mgr/ops", operationalLinks: await operationalLinks.count() };
  });

  await step(page, role, run, "manager-settings", async () => {
    await page.goto(`${webUrl}/settings`, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname === "/settings");
    await page.getByText("Người dùng", { exact: true }).waitFor();
    const disabled = page.locator("select:disabled").first();
    const disabledCount = await page.locator("select:disabled").count();
    if (disabledCount) {
      assert((await disabled.evaluate((element) => getComputedStyle(element).opacity)) === "1", "Manager disabled setting is unreadable");
    }
    const themeSelect = page.locator('select').filter({ has: page.locator('option[value="tet"]') }).first();
    await themeSelect.waitFor();
    const themes = ["spring", "summer", "autumn", "winter", "tet", "midautumn", "christmas", "auto"];
    const applied = [];
    for (const theme of themes) {
      await themeSelect.selectOption(theme);
      await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected || (expected === "auto" && Boolean(document.documentElement.dataset.theme)), theme);
      applied.push({ theme, resolved: await page.locator("html").getAttribute("data-theme") });
    }
    assert(new Set(applied.map((item) => item.resolved)).size >= 7, `Theme changes did not alter the palette: ${JSON.stringify(applied)}`);
    await checkNoOverflow(page);
    return { route: "/settings", disabledSelectCount: disabledCount, appliedThemes: applied };
  });

  await step(page, role, run, "manager-operational-subroute", async () => {
    await page.goto(`${webUrl}/mgr/ops/prompts`, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname === "/mgr/ops/prompts");
    await page.getByRole("heading", { name: "Prompt & rubric", exact: true }).waitFor();
    const save = page.getByRole("button", { name: "Lưu prompt", exact: true });
    assert(await save.isEnabled(), "Manager-owned prompt screen does not expose an enabled save action");
    await checkNoOverflow(page);
    return { route: "/mgr/ops/prompts", saveEnabled: await save.isEnabled() };
  });
}

async function runRole(role, run, viewport) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  pageMetadata.set(page, { viewport });
  page.on("pageerror", (error) => console.log(`[PAGEERROR] ${role} ${viewport.key} run ${run}: ${error.message}`));
  try {
    if (role === "learner") await learnerRun(page, run, viewport);
    else if (role === "operator") await operatorRun(page, run);
    else await managerRun(page, run);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function verifyApiHealth() {
  const response = await fetch(`${apiUrl}/api/health`);
  assert(response.ok, `API health returned ${response.status}`);
  const body = await response.json();
  assert(body.status === "ok", `API health payload is ${JSON.stringify(body)}`);
}

try {
  await mkdir(evidenceRoot, { recursive: true });
  await verifyApiHealth();
  for (const viewport of viewports) {
    for (const role of selectedRoles) {
      for (let run = 1; run <= runCount; run += 1) {
        try {
          await runRole(role, run, viewport);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          hardFailures.push({ role, run, viewport, message });
          console.error(`[FAIL] ${role} ${viewport.key} run ${run}: ${message}`);
        }
      }
    }
  }
} catch (error) {
  hardFailures.push({ role: "harness", run: 0, message: error instanceof Error ? error.message : String(error) });
  console.error(`[FAIL] harness: ${hardFailures.at(-1).message}`);
} finally {
  const coverage = buildCoverageSummary();
  const unverifiedCoverage = coverage.filter((item) => item.status === "UNVERIFIED");
  const failedCoverage = coverage.filter((item) => item.status === "FAIL");
  const counts = {
    pass: logs.filter((item) => item.status === "PASS").length,
    unverified: logs.filter((item) => item.status === "UNVERIFIED").length + unverifiedCoverage.length,
    fail: logs.filter((item) => item.status === "FAIL").length
  };
  const summary = {
    target: { webUrl, apiUrl, roles: selectedRoles, viewports, runCount, headless, stepDelayMs },
    evidenceRoot: relative(root, evidenceRoot).replaceAll("\\", "/"),
    logs,
    coverage,
    hardFailures,
    counts,
    gate: { passed: hardFailures.length === 0 && counts.unverified === 0 && counts.fail === 0 && failedCoverage.length === 0, unverifiedCoverage: unverifiedCoverage.length, failedCoverage: failedCoverage.length },
    generatedAt: new Date().toISOString()
  };
  await writeFile(join(evidenceRoot, "manifest.json"), JSON.stringify(summary, null, 2), "utf8");
  await writeFile(join(evidenceRoot, "summary.md"), [
    "# E4S Core Flow E2E",
    "",
    `Target: ${webUrl} · API: ${apiUrl} · roles: ${selectedRoles.join(", ")}`,
    `Viewports: ${viewports.map((item) => `${item.key}=${item.width}×${item.height}`).join("; ")} · runs: ${runCount} per role/viewport · headless: ${headless} · step delay: ${stepDelayMs}ms`,
    "",
    `- PASS: ${summary.counts.pass}`,
    `- UNVERIFIED: ${summary.counts.unverified}`,
    `- FAIL: ${summary.counts.fail}`,
    `- Hard failures: ${hardFailures.length}`,
    `- Gate: ${summary.gate.passed ? "PASS" : "FAIL"}`,
    "",
    "## Explicit Group 1 coverage",
    ...summary.coverage.map((item) => `- ${item.status}: ${item.role} · ${item.viewport.key} (${item.viewport.width}×${item.viewport.height}) · run ${item.run} · ${item.label} (${item.checkpoints.length} checkpoint(s)${item.missingSteps.length ? `; missing: ${item.missingSteps.join(", ")}` : ""})`),
    "",
    "UNVERIFIED không được tính là PASS. Xem manifest.json để biết route/state và ảnh tương ứng cho từng action.",
    ...(hardFailures.length ? ["", "## Hard failures", ...hardFailures.map((item) => `- ${item.role} · ${item.viewport?.key ?? "n/a"} · run ${item.run}: ${item.message}`)] : [])
  ].join("\n"), "utf8");
  console.log(`Evidence: ${relative(root, evidenceRoot).replaceAll("\\", "/")}`);
  console.log(`Summary: PASS=${summary.counts.pass} UNVERIFIED=${summary.counts.unverified} FAIL=${summary.counts.fail}`);
  process.exitCode = summary.gate.passed ? 0 : 1;
}
