import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildMonthlyCalendar, buildMonthlyCurriculum } from "../packages/domain/dist/src/monthly/index.js";

const webUrl = process.env.E4S_MONTHLY_E2E_WEB_URL ?? "http://127.0.0.1:4275";
const month = process.env.E4S_MONTHLY_E2E_MONTH ?? "2026-11";
const evidenceDir = process.env.E4S_MONTHLY_E2E_EVIDENCE_DIR ?? join(process.cwd(), ".artifacts", "monthly-learning-e2e");

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

function curriculum(cefr) {
  const calendar = buildMonthlyCalendar(month);
  const count = calendar.effectiveDays.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 5).length * 3;
  return buildMonthlyCurriculum({
    month, cefr,
    theme: { version: 1, title: "Monthly E2E customer handover", brief: "Prepare a customer handover.", context: "Customer success", communicationGoal: "Explain handover risks." },
    coreTerms: Array.from({ length: count }, (_, index) => ({ id: `e2e-${cefr}-term-${index}`, word: `term-${index}`, meaning: "nghĩa", type: "noun", ipa: "/tɜːm/" })),
    supportTerms: [],
    grammarTopics: Array.from({ length: 4 }, (_, index) => ({ id: `e2e-${cefr}-g-${index}`, title: `Grammar ${index}`, steps: [{ id: `e2e-${cefr}-g-${index}-s`, focus: "focus", formula: "S + V", usage: "usage", examples: ["Example."] }] })),
    sounds: Array.from({ length: 4 }, (_, index) => ({ id: `e2e-${cefr}-s-${index}`, ipa: "/t/", label: "T", examples: Array.from({ length: Math.ceil(calendar.lessonCount / 4) * 3 }, (_, example) => ({ id: `e2e-${cefr}-s-${index}-${example}`, word: `sound-${index}-${example}`, ipa: "/t/" })) }))
  });
}

function lessonFor(contract) {
  const spec = contract.daySpecs.find((day) => day.lessonNumber === 1);
  const terms = spec.coreTermIds.map((id) => contract.coreTerms.find((term) => term.id === id));
  const sound = contract.sounds.find((item) => item.id === spec.soundId);
  const grammar = contract.grammarTopics.flatMap((topic) => topic.steps).find((step) => step.id === spec.grammarStepId);
  const choice = { prompt: "Which words are on the handover list?", options: ["The handover list", "A travel plan", "A lunch menu", "A sports team"], answer: "The handover list" };
  return { title: "The handover list", parts: [
    { code: "objective", content: { text: "Use the words in a short workplace exchange." } },
    { code: "instruction", content: { steps: ["Read the examples.", "Choose an answer."] } },
    { code: "vocabulary", content: { items: terms.map((term) => ({ word: term.word, meaning: term.meaning, synonyms: ["plan"], antonyms: ["opposite"] })) } },
    { code: "grammar", content: { formula: grammar.formula, text: grammar.usage } },
    { code: "pronunciation", content: { focus: sound.ipa, words: sound.examples.slice(0, 3) } },
    { code: "listening", content: { script: "The handover list is ready.", ...choice } },
    { code: "reading", content: { text: "The handover list is ready.", ...choice } },
    { code: "writing", content: { prompt: "Write one sentence about the handover list.", answer: "The handover list is ready." } },
    { code: "word_class", content: choice }, { code: "word_use", content: choice },
    { code: "speaking", content: { prompt: "Say one sentence about the handover list.", sample: "The handover list is ready." } }
  ] };
}

async function login(page, email, password) {
  await page.goto(webUrl, { waitUntil: "networkidle" });
  if (email.includes("quoc.bao")) await page.getByText("Nhân sự", { exact: true }).click();
  await page.getByLabel("Email").fill(email);
  const secret = email.includes("quoc.bao") ? page.getByRole("textbox", { name: "Mật khẩu" }) : page.getByRole("textbox", { name: "Mã PIN" });
  await secret.fill(password);
  await page.getByRole("button", { name: email.includes("quoc.bao") ? "Đăng nhập nhân sự" : "Đăng nhập người học" }).click();
  await page.waitForURL(email.includes("quoc.bao") ? /\/mgr/ : /\/(home|onboard)/);
}

async function browserRequest(page, path, options = {}) {
  const result = await page.evaluate(async ({ path, options }) => {
    const response = await fetch(path, { ...options, headers: { "content-type": "application/json", ...(options.headers ?? {}) } });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { path, options });
  return result;
}

async function expectStatus(page, path, options, status, label) {
  const result = await browserRequest(page, path, options);
  assert(result.status === status, `${label}: expected ${status}, got ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function createMonth(managerPage, cefr, shouldCreateBrief) {
  const contract = curriculum(cefr);
  const existing = await expectStatus(managerPage, `/api/v1/content/months/${month}`, {}, 200, `load ${cefr} month`);
  const existingFramework = existing.frameworks?.find((framework) => framework.cefr === cefr && framework.status === "approved" && framework.lessons?.[0]?.status === "approved");
  if (existingFramework) return;
  if (shouldCreateBrief) {
    if (!existing.brief?.status || existing.brief.status !== "approved") {
      await expectStatus(managerPage, `/api/v1/content/months/${month}/brief`, { method: "PUT", body: JSON.stringify({ title: contract.theme.title, brief: contract.theme.brief, context: contract.theme.context, communicationGoal: contract.theme.communicationGoal }) }, 200, "save monthly brief");
      await expectStatus(managerPage, `/api/v1/content/months/${month}/brief/approve`, { method: "POST", body: "{}" }, 204, "approve monthly brief");
    }
  }
  const framework = await expectStatus(managerPage, `/api/v1/content/months/${month}/frameworks/generate`, { method: "POST", body: JSON.stringify({ contract }) }, 200, `generate ${cefr} framework`);
  await expectStatus(managerPage, `/api/v1/content/month-frameworks/${framework.id}/approve`, { method: "POST", body: "{}" }, 204, `approve ${cefr} framework`);
  await expectStatus(managerPage, `/api/v1/content/month-frameworks/${framework.id}/days/1`, { method: "PUT", body: JSON.stringify(lessonFor(contract)) }, 200, `save ${cefr} day 1`);
  await expectStatus(managerPage, `/api/v1/content/month-frameworks/${framework.id}/days/1/approve`, { method: "POST", body: "{}" }, 204, `approve ${cefr} day 1`);
}

async function completeDailyLesson(learnerPage) {
  const view = await expectStatus(learnerPage, `/api/v1/learner/months/${month}`, {}, 200, "load learner month");
  const lessonId = view.lessons[0]?.id;
  assert(lessonId, "learner month has no approved lesson");
  await learnerPage.goto(`${webUrl}/lesson/${lessonId}`, { waitUntil: "networkidle" });
  await learnerPage.getByText("The handover list", { exact: true }).first().waitFor();
  const lesson = await expectStatus(learnerPage, `/api/v1/lessons/${lessonId}`, {}, 200, "load learner lesson");
  if (lesson.progress?.status === "completed") return;
  await expectStatus(learnerPage, `/api/v1/lessons/${lessonId}/study-completion`, { method: "POST", body: "{}" }, 200, "complete study");
  for (const [code, evidence] of [["listening", { answer: "The handover list" }], ["reading", { answer: "The handover list" }], ["writing", { answer: "The handover list is ready." }], ["word_class", { answer: "The handover list" }], ["word_use", { answer: "The handover list" }], ["speaking", { artifactKey: `monthly-e2e/${crypto.randomUUID()}.webm` }]]) {
    await expectStatus(learnerPage, `/api/v1/lessons/${lessonId}/parts/${code}/attempts`, { method: "POST", body: JSON.stringify({ requestId: crypto.randomUUID(), evidence }) }, 200, `submit ${code}`);
  }
  await expectStatus(learnerPage, `/api/v1/lessons/${lessonId}/progress`, { method: "PUT", body: JSON.stringify({ markComplete: true }) }, 200, "complete daily lesson");
}

async function submitFinal(learnerPage) {
  await learnerPage.goto(`${webUrl}/test/monthly`, { waitUntil: "networkidle" });
  await learnerPage.getByRole("heading", { name: "Bài thi tháng" }).first().waitFor();
  const started = await expectStatus(learnerPage, "/api/v1/assessments/monthly/start", { method: "POST", body: "{}" }, 201, "start monthly final");
  const attemptId = started.attempt.id;
  for (const section of ["listening", "reading", "writing"]) await expectStatus(learnerPage, `/api/v1/assessment-attempts/${attemptId}/sections/${section}/complete`, { method: "POST", body: "{}" }, 200, `complete final ${section}`);
  await expectStatus(learnerPage, `/api/v1/assessment-attempts/${attemptId}/submit`, { method: "POST", body: "{}" }, 200, "submit monthly final");
  return attemptId;
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const manager = await browser.newPage();
  const learner = await browser.newPage();
  try {
    await login(manager, "quoc.bao.le@e4s.local", "manager-pass");
    await manager.goto(`${webUrl}/mgr/ops/months`, { waitUntil: "networkidle" });
    await manager.getByRole("heading", { name: "Thiết kế tháng học" }).waitFor();
    await createMonth(manager, "A1", true);
    await expectStatus(manager, "/api/v1/assessment-reviews/learners/00000000-0000-4000-8000-000000000101/level", { method: "PATCH", body: JSON.stringify({ mode: "direct", targetLevel: "A1", reason: "Monthly E2E A1 scenario", evidence: "Local E2E fixture" }) }, 200, "set learner A1");
    await manager.screenshot({ path: join(evidenceDir, "01-manager-month-approved.png"), fullPage: true });

    await login(learner, "minh.anh.nguyen@e4s.local", "246810");
    await learner.goto(`${webUrl}/home`, { waitUntil: "networkidle" });
    await completeDailyLesson(learner);
    await learner.goto(`${webUrl}/home`, { waitUntil: "networkidle" });
    await learner.getByLabel("Bài thi tháng").waitFor();
    const firstFinal = await submitFinal(learner);
    const appeal = await browserRequest(learner, `/api/v1/assessment-attempts/${firstFinal}/appeals`, { method: "POST", body: JSON.stringify({ reason: "Xin xem lại phần viết của bài thi tháng." }) });
    assert([201, 409].includes(appeal.status), `appeal monthly final: expected 201 or existing 409, got ${appeal.status} ${JSON.stringify(appeal.body)}`);
    await manager.goto(`${webUrl}/mgr/ops/levels`, { waitUntil: "networkidle" });
    await manager.getByRole("heading", { name: "Duyệt trình độ" }).waitFor();
    await expectStatus(manager, `/api/v1/assessment-reviews/${firstFinal}/decision`, { method: "POST", body: JSON.stringify({ status: "approved", reason: "Đã đối chiếu bài làm và chấp nhận kết quả bài thi tháng." }) }, 200, "manager resolves appeal");
    const approved = await expectStatus(learner, "/api/v1/assessments/monthly", {}, 200, "read approved final");
    assert(approved.attempt?.status === "approved" && approved.appeal?.status === "accepted", "approved final did not return an accepted appeal");

    await expectStatus(manager, "/api/v1/assessment-reviews/learners/00000000-0000-4000-8000-000000000101/level", { method: "PATCH", body: JSON.stringify({ mode: "direct", targetLevel: "C1", reason: "Monthly E2E C1 scenario", evidence: "Local E2E fixture" }) }, 200, "set learner C1");
    await createMonth(manager, "C1", false);
    await completeDailyLesson(learner);
    const c1Final = await submitFinal(learner);
    await expectStatus(manager, `/api/v1/assessment-reviews/${c1Final}/decision`, { method: "POST", body: JSON.stringify({ status: "approved", reason: "Đã đạt yêu cầu C1 của bài thi tháng." }) }, 200, "approve C1 final");
    const certificate = await expectStatus(learner, "/api/v1/engagement/rewards/done", {}, 200, "issue C1 certificate");
    assert(certificate.printable === true && certificate.certificateNumber, "C1 certificate was not issued");
    await learner.goto(`${webUrl}/profile`, { waitUntil: "networkidle" });
    await learner.screenshot({ path: join(evidenceDir, "02-learner-c1-certificate.png"), fullPage: true });
    console.log(`MONTHLY E2E PASS: ${webUrl} · evidence ${evidenceDir}`);
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(`MONTHLY E2E FAIL: ${error.message}`); process.exit(1); });
