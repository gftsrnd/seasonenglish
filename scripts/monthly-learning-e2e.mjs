import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

// This scenario creates and approves content.  It must never silently target
// a developer's persistent local environment: that is how a term-0 fixture
// was previously released into the local runtime.
const webUrl = process.env.E4S_MONTHLY_E2E_WEB_URL;
const month = process.env.E4S_MONTHLY_E2E_MONTH ?? "2026-11";
const evidenceDir = process.env.E4S_MONTHLY_E2E_EVIDENCE_DIR ?? join(process.cwd(), ".artifacts", "monthly-learning-e2e");

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };


async function login(page, email, password, staff = false) {
  await page.goto(webUrl, { waitUntil: "networkidle" });
  if (staff) await page.getByText("Nhân sự", { exact: true }).click();
  await page.getByLabel("Email").fill(email);
  const secret = staff ? page.getByRole("textbox", { name: "Mật khẩu" }) : page.getByRole("textbox", { name: "Mã PIN" });
  await secret.fill(password);
  await page.getByRole("button", { name: staff ? "Đăng nhập nhân sự" : "Đăng nhập người học" }).click();
  await page.waitForURL(staff ? /\/op/ : /\/(home|onboard)/);
}

async function fillLabeled(page, label, value) {
  const field = page.locator("label").filter({ hasText: label }).first().locator("input, textarea").first();
  await field.fill(value);
}

async function createMonthThroughUi(operatorPage, cefr, { createBrief = false } = {}) {
  if (createBrief) {
    const title = operatorPage.getByLabel("Tiêu đề");
    if (await title.isDisabled()) {
      fail("E2E fixture precondition: the selected month already has an approved brief. Select a fresh month before proving browser-only monthly authoring.");
    }
    await fillLabeled(operatorPage, "Tiêu đề", "Monthly E2E customer handover");
    await fillLabeled(operatorPage, "Mô tả", "Prepare a customer handover.");
    await fillLabeled(operatorPage, "Bối cảnh", "Customer success");
    await fillLabeled(operatorPage, "Mục tiêu giao tiếp", "Explain handover risks.");
    await operatorPage.getByRole("button", { name: "Lưu chủ đề" }).click();
    await operatorPage.getByRole("button", { name: "Chốt chủ đề" }).click();
  }
  await operatorPage.getByRole("tab", { name: cefr, exact: true }).click();
  const resources = operatorPage.locator(".monthly-resources");
  await resources.getByLabel("Từ cốt lõi").fill("3");
  await resources.getByLabel("Từ mở rộng").fill("0");
  await resources.getByRole("button", { name: "Sinh", exact: true }).click();
  await resources.getByText("Chờ chốt", { exact: true }).waitFor();
  await resources.getByRole("button", { name: "Chốt tài nguyên" }).click();
  await resources.getByText("Đã chốt", { exact: true }).waitFor();
  const firstDay = operatorPage.locator(".monthly-calendar").getByRole("gridcell").filter({ hasText: /^2\s*Bài 1/ }).first();
  await firstDay.getByRole("button", { name: "Sinh", exact: true }).click();
  await firstDay.getByText("Đã duyệt", { exact: true }).waitFor();
}

function wavFixture() {
  // A tiny valid PCM/WAV recording. The browser upload route validates MIME and extension.
  const bytes = Buffer.alloc(44 + 1600);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(8000, 28); bytes.writeUInt16LE(1, 32); bytes.writeUInt16LE(8, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(1600, 40); bytes.fill(128, 44);
  return bytes;
}

async function completeDailyLesson(learnerPage) {
  await learnerPage.getByText("The handover list", { exact: true }).first().waitFor();
  if (await learnerPage.getByText("Bạn đã học bài này rồi, ôn lại thoải mái!", { exact: true }).count()) return;
  const pronunciationButtons = learnerPage.locator('[data-part="pronunciation"] button');
  for (let index = 0; index < await pronunciationButtons.count(); index += 1) {
    await pronunciationButtons.nth(index).click();
  }
  await learnerPage.getByRole("button", { name: /Sang bài tập|Move to practice/ }).click();
  const answerParts = ["listening", "reading", "writing", "word_class", "word_use"];
  for (const code of answerParts) {
    const part = learnerPage.locator(`[data-part="${code}"]`);
    const textbox = part.locator("textarea");
    if (await textbox.count()) await textbox.fill(code === "writing" ? "The handover list is ready." : "The handover list");
    else await part.getByText("The handover list", { exact: true }).first().click();
    await part.getByRole("button", { name: /Nộp bài|Submit/ }).click();
  }
  const audioInput = learnerPage.locator('[data-part="speaking"] input[type="file"]');
  await audioInput.setInputFiles({ name: "monthly-e2e.wav", mimeType: "audio/wav", buffer: wavFixture() });
  await learnerPage.getByText(/Đã lưu monthly-e2e\.wav|Saved monthly-e2e\.wav/).waitFor();
  await learnerPage.locator('[data-part="speaking"]').getByRole("button", { name: /Kiểm tra nói|Check speaking/ }).click();
  await learnerPage.getByRole("region", { name: /Hoàn thành bài học|Complete lesson/ }).getByRole("button", { name: /Hoàn thành bài|Complete lesson/ }).click();
  await learnerPage.waitForURL(/\/home/);
}

async function dismissLearnerBlockingDialog(learnerPage) {
  const dialog = learnerPage.locator('[role="dialog"], .modal-backdrop').last();
  if (!await dialog.isVisible().catch(() => false)) return;
  const continueButton = dialog.getByRole("button", { name: /Tiếp tục học|Đóng/ }).first();
  if (await continueButton.isVisible().catch(() => false)) await continueButton.click();
}

async function main() {
  if (!webUrl) fail("E4S_MONTHLY_E2E_WEB_URL is required and must point to an isolated E2E stack.");
  if (process.env.E4S_MONTHLY_E2E_ALLOW_MUTATION !== "true") {
    fail("Set E4S_MONTHLY_E2E_ALLOW_MUTATION=true only for an isolated E2E stack; this scenario creates and publishes content.");
  }
  if (/^https?:\/\/(?:127\.0\.0\.1|localhost):4175\/?$/u.test(webUrl)) {
    fail("Refusing to mutate the persistent local server on port 4175. Use an isolated E2E stack.");
  }
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const operator = await browser.newPage();
  const learner = await browser.newPage();
  try {
    await login(learner, "minh.anh.nguyen@e4s.local", "246810");
    await learner.goto(`${webUrl}/home`, { waitUntil: "networkidle" });
    const levelText = await learner.getByText(/Trình độ (A1|A2|B1|B2|C1)/).first().innerText();
    const cefr = levelText.match(/(A1|A2|B1|B2|C1)/)?.[1];
    assert(cefr, `learner level badge is missing: ${levelText}`);

    await login(operator, "thu.ha.tran@e4s.local", "staff-pass", true);
    await operator.goto(`${webUrl}/op/months`, { waitUntil: "networkidle" });
    await operator.screenshot({ path: join(evidenceDir, "debug-operator-months-before-authoring.png"), fullPage: true });
    await operator.getByRole("heading", { name: "Bài học" }).waitFor();
    await createMonthThroughUi(operator, cefr, { createBrief: true });
    await operator.screenshot({ path: join(evidenceDir, "01-operator-month-approved.png"), fullPage: true });

    await learner.goto(`${webUrl}/home`, { waitUntil: "networkidle" });
    await dismissLearnerBlockingDialog(learner);
    await learner.getByRole("link", { name: /Học.*ngay/ }).click();
    await learner.waitForURL(/\/lesson\//);
    await completeDailyLesson(learner);
    await learner.getByRole("heading", { name: /Chào / }).waitFor();
    await learner.locator('[data-home-block="month-path"] li[data-state="completed"]').waitFor();
    await learner.screenshot({ path: join(evidenceDir, "02-learner-daily-complete.png"), fullPage: true });
    console.log(`MONTHLY DAILY E2E PASS: ${webUrl} · evidence ${evidenceDir}`);
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(`MONTHLY E2E FAIL: ${error.message}`); process.exit(1); });
