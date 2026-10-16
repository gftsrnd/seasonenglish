import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { Client } from "pg";

const root = process.cwd();
const webUrl = process.env.E4S_CORE_FLOW_WEB_URL ?? "http://127.0.0.1:4175";
const apiUrl = process.env.E4S_CORE_FLOW_API_URL ?? "http://127.0.0.1:3001";
const databaseUrl = process.env.E4S_CORE_FLOW_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? "postgres://e4s:e4s_local_password@127.0.0.1:54329/e4s";
const evidenceRoot = process.env.E4S_CORE_FLOW_EVIDENCE_DIR
  ?? join(root, ".tmp", "evidence", `core-flow-e2e-${new Date().toISOString().slice(0, 10)}`);
// Keep the default honest when no real audio is available. A local run may
// opt into an existing audio file with this variable; the harness never
// synthesizes a Blob or bypasses the learner upload control.
const audioFixture = process.env.E4S_CORE_FLOW_AUDIO_FIXTURE;
const viewport = { width: 390, height: 844 };
const runCount = 2;

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

const logs = [];
const hardFailures = [];

class Unverified extends Error {
  constructor(reason) {
    super(reason);
    this.name = "Unverified";
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function pathOf(role, run, step) {
  return join(evidenceRoot, role, `run-${run}`, `${safeName(step)}.png`);
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
  const file = pathOf(role, run, step);
  await mkdir(join(evidenceRoot, role, `run-${run}`), { recursive: true });
  // Capture the actual viewport: the prototype intentionally keeps the bottom
  // navigation fixed, so a full-page capture places that navigation halfway
  // down a long document and creates a false overlap signal in the evidence.
  await page.screenshot({ path: file, fullPage: false });
  return relative(root, file).replaceAll("\\", "/");
}

async function recordStep(page, role, run, step, status, details = {}) {
  const state = await pageState(page).catch(() => ({ href: "unavailable" }));
  const file = await screenshot(page, role, run, step).catch(() => undefined);
  logs.push({ role, run, step, status, route: state.pathname, screenshot: file, details, state, at: new Date().toISOString() });
  console.log(`[${status}] ${role} run ${run} · ${step}${file ? ` · ${file}` : ""}`);
}

async function step(page, role, run, name, action) {
  try {
    const details = await action();
    await recordStep(page, role, run, name, "PASS", details ?? {});
    return details;
  } catch (error) {
    const status = error instanceof Unverified ? "UNVERIFIED" : "FAIL";
    await recordStep(page, role, run, name, status, { reason: error instanceof Error ? error.message : String(error) });
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

async function login(page, role) {
  const fixture = roles[role];
  await page.goto(`${webUrl}/`, { waitUntil: "networkidle" });
  await page.waitForSelector('form input[name="email"]');
  assert(new URL(page.url()).pathname === "/", `Fresh entry opened at ${new URL(page.url()).pathname}`);
  if (fixture.loginTab) await page.getByRole("tab", { name: fixture.loginTab }).click();
  await page.locator('input[name="email"]').fill(fixture.email);
  await page.locator('input[name="password"]').fill(fixture.password);
  await page.getByRole("button", { name: fixture.loginButton, exact: true }).click();
  await page.waitForURL((url) => url.pathname === fixture.expectedPath, { timeout: 20_000 });
  await waitForSession(page, role);
}

async function jsonFromPage(page, path) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { credentials: "include", cache: "no-store" });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, path);
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
  const organizationId = "00000000-0000-4000-8000-000000000001";
  const programId = "00000000-0000-4000-8000-000000000201";
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

async function learnerRun(page, run) {
  const role = "learner";
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
    return { nextLesson: { id: next.id, title: next.title, status: next.status }, homeStatus: response.status };
  });

  const lessonId = home?.nextLesson?.id;
  assert(lessonId, "Learner flow did not resolve a lesson id");
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
    const current = await jsonFromPage(page, `/api/v1/lessons/${lessonId}`);
    const speaking = current.body.progress.evidence?.speaking;
    if (speaking?.artifactKey || current.body.progress.completedPartCodes.includes("speaking")) {
      return { speaking: "already-persisted" };
    }
    if (!audioFixture) throw new Unverified("Speaking chưa thể hoàn tất: chưa cấp audio fixture thật và harness không tạo audio giả.");
    const card = page.locator('[data-part="speaking"]');
    await card.waitFor();
    const uploadResponse = page.waitForResponse((response) => response.url().includes("/api/v1/files/assessment-audio") && response.request().method() === "POST");
    await card.locator('input[aria-label="Tải file ghi âm speaking"]').setInputFiles(audioFixture);
    const uploaded = await uploadResponse;
    assert(uploaded.ok(), `Speaking audio upload returned ${uploaded.status()}`);
    await card.getByText("Đã tải file ghi âm lên.").waitFor();
    const speakingAnswer = String(current.body.content?.parts?.find((part) => part.code === "speaking")?.content?.answer ?? "").trim();
    assert(speakingAnswer, "Lesson speaking answer is missing from the real lesson payload");
    await card.getByRole("textbox").fill(speakingAnswer);
    const submit = card.getByRole("button", { name: /Nộp bài|Đã xong/ }).first();
    const attemptResponse = page.waitForResponse((response) => response.url().includes(`/api/v1/lessons/${lessonId}/parts/speaking/attempts`) && response.request().method() === "POST");
    await submit.click();
    const attempted = await attemptResponse;
    assert(attempted.ok(), `Speaking attempt returned ${attempted.status()}`);
    const persisted = await jsonFromPage(page, `/api/v1/lessons/${lessonId}`);
    assert(persisted.status === 200 && (persisted.body.progress.evidence?.speaking?.artifactKey || persisted.body.progress.completedPartCodes.includes("speaking")), "Speaking audio evidence did not persist");
    return { speaking: "uploaded-and-persisted", artifactKey: persisted.body.progress.evidence?.speaking?.artifactKey };
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
}

async function loginStaff(page, role) {
  await login(page, role);
  assert(new URL(page.url()).pathname === roles[role].expectedPath, `${role} landed at ${new URL(page.url()).pathname}`);
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
      await select.selectOption(String(target.suggestedLevel));
      const card = select.locator("xpath=ancestor::div[contains(@class,'card')][1]");
      const button = card.getByRole("button", { name: "Duyệt mức", exact: true });
      await button.waitFor();
      assert(!(await button.isDisabled()), `Approve button is disabled for ${target.learnerName}`);
      const request = page.waitForResponse((response) => response.url().includes(`/api/v1/assessment-reviews/${target.attemptId}/decision`) && response.request().method() === "POST");
      await button.click();
      const response = await request;
      assert(response.ok(), `Assessment decision returned ${response.status()}`);
      await page.waitForFunction(async (attemptId) => {
        const response = await fetch("/api/v1/assessment-reviews/pending", { credentials: "include", cache: "no-store" });
        const pending = await response.json().catch(() => []);
        return response.ok && !pending.some((item) => item.attemptId === attemptId);
      }, target.attemptId);
      return { attemptId: target.attemptId, learnerName: target.learnerName, approvedLevel: target.suggestedLevel, responseStatus: response.status() };
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
}

async function managerRun(page, run) {
  const role = "manager";
  await step(page, role, run, "login-lands-mgr", async () => {
    await loginStaff(page, role);
    await page.getByRole("heading", { name: /Tiến độ nhóm|Quản lý/i }).first().waitFor();
    await checkNoOverflow(page);
    return { route: "/mgr" };
  });

  await step(page, role, run, "manager-operations", async () => {
    await page.goto(`${webUrl}/mgr/ops`, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname === "/mgr/ops");
    const body = await page.locator("body").innerText();
    assert(/vận hành|operations|tổng quan/i.test(body), "Manager operations screen has no operations marker");
    await checkNoOverflow(page);
    return { route: "/mgr/ops" };
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
    await checkNoOverflow(page);
    return { route: "/settings", disabledSelectCount: disabledCount };
  });

  await step(page, role, run, "manager-read-only-preview", async () => {
    await page.goto(`${webUrl}/op/prompts`, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname === "/op/prompts");
    await page.getByText("Chế độ xem của Quản lý", { exact: true }).waitFor();
    const save = page.getByRole("button", { name: "Lưu prompt", exact: true });
    const textarea = page.locator("textarea").first();
    assert(await save.isDisabled(), "Manager prompt preview exposes an enabled save action");
    assert(await textarea.isDisabled() || await textarea.isEditable() === false, "Manager prompt preview textarea is editable");
    await checkNoOverflow(page);
    return { route: "/op/prompts", saveDisabled: await save.isDisabled(), textareaReadOnly: !(await textarea.isEditable()) };
  });
}

async function runRole(role, run) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(`[PAGEERROR] ${role} run ${run}: ${error.message}`));
  try {
    if (role === "learner") await learnerRun(page, run);
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
  for (const role of Object.keys(roles)) {
    for (let run = 1; run <= runCount; run += 1) {
      try {
        await runRole(role, run);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        hardFailures.push({ role, run, message });
        console.error(`[FAIL] ${role} run ${run}: ${message}`);
      }
    }
  }
} catch (error) {
  hardFailures.push({ role: "harness", run: 0, message: error instanceof Error ? error.message : String(error) });
  console.error(`[FAIL] harness: ${hardFailures.at(-1).message}`);
} finally {
  const summary = {
    target: { webUrl, apiUrl, viewport, runCount },
    evidenceRoot: relative(root, evidenceRoot).replaceAll("\\", "/"),
    logs,
    hardFailures,
    counts: {
      pass: logs.filter((item) => item.status === "PASS").length,
      unverified: logs.filter((item) => item.status === "UNVERIFIED").length,
      fail: logs.filter((item) => item.status === "FAIL").length
    },
    generatedAt: new Date().toISOString()
  };
  await writeFile(join(evidenceRoot, "manifest.json"), JSON.stringify(summary, null, 2), "utf8");
  await writeFile(join(evidenceRoot, "summary.md"), [
    "# E4S Core Flow E2E",
    "",
    `Target: ${webUrl} · API: ${apiUrl} · viewport: ${viewport.width}×${viewport.height}`,
    `Runs: ${runCount} per role`,
    "",
    `- PASS: ${summary.counts.pass}`,
    `- UNVERIFIED: ${summary.counts.unverified}`,
    `- FAIL: ${summary.counts.fail}`,
    `- Hard failures: ${hardFailures.length}`,
    "",
    "UNVERIFIED không được tính là PASS. Xem manifest.json để biết route/state và ảnh tương ứng cho từng action.",
    ...(hardFailures.length ? ["", "## Hard failures", ...hardFailures.map((item) => `- ${item.role} run ${item.run}: ${item.message}`)] : [])
  ].join("\n"), "utf8");
  console.log(`Evidence: ${relative(root, evidenceRoot).replaceAll("\\", "/")}`);
  console.log(`Summary: PASS=${summary.counts.pass} UNVERIFIED=${summary.counts.unverified} FAIL=${summary.counts.fail}`);
  process.exitCode = hardFailures.length ? 1 : 0;
}
