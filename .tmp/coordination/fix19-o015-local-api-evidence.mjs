import { chromium } from "playwright";
import fs from "node:fs/promises";

const base = "http://127.0.0.1:4182";
const dir = "D:/TTS - AI Application - Huynh Doan Hoang Minh/12_10_2026 - 17_10_2026/E4S/e4s-fix19-worktree/.tmp/coordination/evidence";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: false });

async function loginLearner(page) {
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Người học" }).click();
  await page.getByLabel("Email").fill("learner@e4s.local");
  await page.getByRole("textbox", { name: /Mật khẩu/ }).fill("learner-pass");
  await page.getByRole("button", { name: /Đăng nhập người học/ }).click();
  await page.waitForTimeout(900);
}

async function loginOperator(page) {
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Nhân sự" }).click();
  await page.getByLabel("Email").fill("operator@e4s.local");
  await page.getByRole("textbox", { name: /Mật khẩu/ }).fill("staff-pass");
  await page.getByRole("button", { name: /Đăng nhập nhân sự/ }).click();
  await page.waitForTimeout(900);
}

const learner = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await loginLearner(learner);
const before = await learner.evaluate(async () => {
  const response = await fetch("/api/v1/learner/home");
  const body = await response.json();
  return { status: response.status, week: body.week, lessons: body.lessons };
});
if (before.status !== 200 || before.lessons.length !== 5) throw new Error(`O-015 precondition failed: ${JSON.stringify(before)}`);

const operator = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await loginOperator(operator);
await operator.goto(`${base}/op/weeks`, { waitUntil: "networkidle" });
await operator.getByLabel("Chủ đề *").first().waitFor();
const originalTopic = await operator.getByLabel("Chủ đề *").first().inputValue();
const topic = `O-015 giữ plan 5 ngày ${Date.now()}`;
await operator.getByLabel("Chủ đề *").first().fill(topic);
await operator.getByRole("button", { name: "Lưu khung chủ đề" }).click();
await operator.getByText("Đã lưu khung chủ đề.").waitFor();
const operatorAfter = await operator.evaluate(async () => {
  const response = await fetch("/api/v1/content/weeks");
  return { status: response.status, body: await response.json() };
});
if (operatorAfter.status !== 200 || operatorAfter.body.weeks[0]?.topic !== topic) throw new Error(`O-015 topic save failed: ${JSON.stringify(operatorAfter)}`);
const operatorPng = `${dir}/O-015-local-api-topic-edit-saved.png`;
await operator.screenshot({ path: operatorPng, fullPage: false });

await learner.goto(`${base}/home`, { waitUntil: "networkidle" });
const after = await learner.evaluate(async () => {
  const response = await fetch("/api/v1/learner/home");
  const body = await response.json();
  return { status: response.status, week: body.week, lessons: body.lessons };
});
const beforePlan = before.lessons.map(({ id, dayNumber, title }) => ({ id, dayNumber, title }));
const afterPlan = after.lessons.map(({ id, dayNumber, title }) => ({ id, dayNumber, title }));
if (after.status !== 200 || JSON.stringify(beforePlan) !== JSON.stringify(afterPlan)) {
  throw new Error(`O-015 plan changed after topic edit: ${JSON.stringify({ beforePlan, afterPlan })}`);
}
const learnerPng = `${dir}/O-015-local-api-five-day-plan-preserved.png`;
await learner.screenshot({ path: learnerPng, fullPage: false });
console.log(JSON.stringify({
  base, headless: false, id: "O-015", route: "/op/weeks -> /home",
  trigger: `changed topic from '${originalTopic}' to '${topic}' and clicked Lưu khung chủ đề`,
  api: {
    before: { endpoint: "/api/v1/learner/home", status: before.status, week: before.week, plan: beforePlan },
    save: { endpoint: "/api/v1/content/weeks", method: "PUT", status: operatorAfter.status, savedTopic: operatorAfter.body.weeks[0]?.topic },
    after: { endpoint: "/api/v1/learner/home", status: after.status, week: after.week, plan: afterPlan }
  },
  expected: "thủ công sửa chủ đề nhưng kế hoạch 5 ngày đã lưu vẫn giữ nguyên",
  screenshots: [operatorPng, learnerPng]
}, null, 2));
await browser.close();
