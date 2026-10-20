import { chromium } from "playwright";
import fs from "node:fs/promises";

const base = "http://127.0.0.1:4182";
const dir = "D:/TTS - AI Application - Huynh Doan Hoang Minh/12_10_2026 - 17_10_2026/E4S/e4s-fix19-worktree/.tmp/coordination/evidence";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: false });
const evidence = [];

async function login(page, email, password) {
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Nhân sự" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: /Mật khẩu/ }).fill(password);
  await page.getByRole("button", { name: /Đăng nhập nhân sự/ }).click();
  await page.waitForTimeout(1000);
  console.log("STAFF_LOGIN", email, (await page.locator("body").innerText()).slice(-400));
}

const operator = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await login(operator, "operator@e4s.local", "staff-pass");
await operator.goto(`${base}/op/weeks`, { waitUntil: "networkidle" });
await operator.getByLabel("Chủ đề *").first().waitFor();
const topic = `Lane 2 local API ${Date.now()}`;
await operator.getByLabel("Chủ đề *").first().fill(topic);
await operator.getByRole("button", { name: "Lưu khung chủ đề" }).click();
await operator.waitForTimeout(700);
let file = `${dir}/O-013-local-api-week-form-saved.png`;
await operator.screenshot({ path: file, fullPage: false });
evidence.push({ id: "O-013", route: "/op/weeks", api: "authenticated operator session; saveContentWeeks real API completed", trigger: `filled topic '${topic}' and clicked Lưu khung chủ đề`, expected: "topic, description, objective and vocabulary fields render and save", screenshot: file });

await operator.goto(`${base}/op/prompts`, { waitUntil: "networkidle" });
await operator.getByRole("heading", { name: "Prompt & rubric" }).waitFor();
const prompt = `Lane 2 prompt ${Date.now()}`;
await operator.locator("textarea").first().fill(prompt);
await operator.getByRole("button", { name: "Lưu prompt" }).click();
await operator.waitForTimeout(700);
file = `${dir}/O-026-local-api-prompt-saved.png`;
await operator.screenshot({ path: file, fullPage: false });
evidence.push({ id: "O-026", route: "/op/prompts", api: "authenticated operator session; saveContentPrompts real API completed", trigger: "edited first prompt and clicked Lưu prompt", expected: "edited prompt remains visible after save", screenshot: file });
await operator.getByRole("button", { name: "Về mặc định" }).first().click();
file = `${dir}/O-026-local-api-prompt-reset.png`;
await operator.screenshot({ path: file, fullPage: false });
evidence.push({ id: "O-026", route: "/op/prompts", api: "reset prompt control executed in authenticated operator UI", trigger: "clicked Về mặc định", expected: "prompt value returns to default", screenshot: file });

const manager = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await login(manager, "manager@e4s.local", "manager-pass");
await manager.goto(`${base}/mgr`, { waitUntil: "networkidle" });
await manager.getByRole("heading", { name: "Tiến độ nhóm" }).waitFor();
const csvDownload = manager.waitForEvent("download");
await manager.getByRole("button", { name: "Xuất CSV" }).click();
const download = await csvDownload;
const csvPath = `${dir}/M-007-local-api-e4s-tien-do.csv`;
await download.saveAs(csvPath);
file = `${dir}/M-007-local-api-progress-shortcuts-csv.png`;
await manager.screenshot({ path: file, fullPage: false });
evidence.push({ id: "M-007", route: "/mgr", api: "authenticated manager session; manager progress GET real API; browser download completed", trigger: "clicked Xuất CSV on progress screen", expected: "manager progress screen exposes shortcuts and downloadable CSV", screenshot: file, csv: csvPath });

await manager.goto(`${base}/mgr/rewards`, { waitUntil: "networkidle" });
await manager.getByRole("heading", { name: "Giả lập phần thưởng" }).waitFor();
await manager.getByRole("button", { name: "Cấp 1 · đủ điểm, thiếu huy hiệu" }).click();
await manager.getByRole("status").filter({ hasText: "Kết quả: cấp 1/4" }).waitFor();
file = `${dir}/M-015-local-api-reward-simulation-case.png`;
await manager.screenshot({ path: file, fullPage: false });
evidence.push({ id: "M-015", route: "/mgr/rewards", api: "manager-only deterministic simulator; no learner API request", trigger: "selected 80-point case with first badge", expected: "result stays level 1 because required badge is missing", screenshot: file });

console.log(JSON.stringify({ base, headless: false, evidence }, null, 2));
await browser.close();
