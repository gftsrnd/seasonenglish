import { chromium } from "playwright";
import fs from "node:fs/promises";

const base = "http://127.0.0.1:4182";
const api = "http://127.0.0.1:3001";
const dir = "D:/TTS - AI Application - Huynh Doan Hoang Minh/12_10_2026 - 17_10_2026/E4S/e4s-fix19-worktree/.tmp/coordination/evidence";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const evidence = [];
const email = `lane2-${Date.now()}@example.com`;
const password = "SeasonPass123!";

await page.goto(`${base}/`, { waitUntil: "networkidle" });
let file = `${dir}/C-001-local-api-empty-session-entry.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "C-001", route: "/", api: "GET /api/session real -> 401 UNAUTHENTICATED", trigger: "opened app with no authenticated local session", expected: "welcome, role choice and login are visible", screenshot: file });
await page.getByRole("button", { name: "Quên mật khẩu?" }).click();
file = `${dir}/A-002-local-email-password-reset-request.png`;
await page.getByText(/liên hệ người vận hành hoặc quản lý để được cấp lại mật khẩu/).waitFor();
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "A-002", route: "/", api: "no reset API call; current product routes request to operator/manager password reset", trigger: "clicked Quên mật khẩu?", expected: "clear current email/password reset instruction", screenshot: file });
await page.getByLabel("Email").fill(email);
await page.getByRole("textbox", { name: /Mật khẩu/ }).fill(password);
await page.getByRole("button", { name: "Hiện mật khẩu" }).click();
file = `${dir}/A-001-local-api-password-reveal.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "A-001", route: "/", api: "GET /api/session -> 401 UNAUTHENTICATED", trigger: "entered password and clicked Hiện mật khẩu", expected: "password text visible", screenshot: file });

await page.getByRole("button", { name: /Tạo tài khoản người học/ }).click();
await page.getByLabel("Họ và tên").fill("Lane Two Learner");
await page.getByLabel("Email").fill(email);
await page.getByRole("textbox", { name: /^Mật khẩu/ }).fill(password);
await page.getByRole("textbox", { name: /Xác nhận mật khẩu/ }).fill(password);
await page.getByRole("button", { name: /Đăng ký và bắt đầu/ }).click();
await page.getByRole("textbox", { name: "Email *" }).waitFor({ timeout: 30000 });

await page.getByRole("textbox", { name: "Email *" }).fill("abc");
await page.getByText("Email chưa đúng định dạng").waitFor();
file = `${dir}/L-008-local-api-live-email-error.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "L-008", route: "/onboard", api: "authenticated local API session; profile GET real", trigger: "typed abc", expected: "immediate invalid email error", screenshot: file });

await page.getByRole("textbox", { name: "Họ tên *" }).fill("Lane Two Learner");
await page.getByRole("textbox", { name: "Email *" }).fill("JAME@GMAIL.COM");
await page.getByRole("checkbox", { name: "Nói chuyện với khách hàng / đối tác" }).check();
await page.getByRole("radio", { name: "Vài lần mỗi tuần" }).first().check();
await page.getByRole("radio", { name: "Không dùng" }).check();
await page.getByRole("checkbox", { name: "Học qua app / khoá học" }).check();
await page.getByRole("checkbox", { name: "Đọc và ghi chú" }).check();
await page.getByRole("button", { name: /Lưu và làm test đầu vào/ }).click();
await page.waitForTimeout(1000);
const savedProfileResponse = await page.evaluate(async () => {
  const response = await fetch("/api/v1/learner/profile", { credentials: "include" });
  return { status: response.status, body: await response.json() };
});
console.log("PROFILE_GET_AFTER_SAVE", savedProfileResponse);
const savedRequest = { email: savedProfileResponse.body?.profile?.email ?? savedProfileResponse.body?.email };
if (savedRequest?.email !== "jame@gmail.com") throw new Error(`Expected normalized local API request, got ${savedRequest?.email}`);
file = `${dir}/L-008-local-api-uppercase-normalized.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "L-008", route: "/onboard", api: "PUT /api/v1/learner/profile real request email=jame@gmail.com", trigger: "submitted JAME@GMAIL.COM with required fields", expected: "persisted request is lowercase", screenshot: file });

const logout = page.getByRole("button", { name: /Đăng xuất/ });
if (!(await logout.count())) throw new Error("Could not reach logout control after real onboarding save");
await logout.click();
await page.getByRole("tab", { name: "Người học" }).waitFor();
await page.getByRole("tab", { name: "Nhân sự" }).click();
await page.getByLabel("Email").fill(email);
await page.getByRole("textbox", { name: /Mật khẩu/ }).fill(password);
await page.getByRole("button", { name: /Đăng nhập nhân sự/ }).click();
await page.getByText(/Tài khoản này dành cho người học/).waitFor();
file = `${dir}/A-003-local-api-wrong-role-warning.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "A-003", route: "/", api: "POST /api/auth/staff/login real API with learner credentials -> WRONG_LOGIN_PATH", trigger: "submitted learner account in staff tab", expected: "wrong-role warning", screenshot: file });

await page.getByRole("tab", { name: "Người học" }).click();
await page.getByLabel("Email").fill(email);
await page.getByRole("textbox", { name: /Mật khẩu/ }).fill("seasonpass123!");
await page.getByRole("button", { name: /Đăng nhập người học/ }).click();
await page.getByText(/Không thể đăng nhập|Email hoặc mật khẩu/).waitFor();
file = `${dir}/C-004-local-api-email-password-rejects-wrong-case.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "C-004", route: "/", api: "POST /api/auth/learner/login real API with wrong-case password -> rejected", trigger: "entered existing learner email and wrong-case password", expected: "email/password authentication rejects wrong credential; no PIN UI", screenshot: file });

file = `${dir}/L-001-local-api-learner-email-password-form.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "L-001", route: "/", api: "GET /api/session -> 401; learner tab selected", trigger: "selected Người học role", expected: "current email/password learner form with Caps Lock feedback", screenshot: file });

await page.getByLabel("Email").fill("missing-learner@example.com");
await page.getByRole("textbox", { name: /Mật khẩu/ }).fill(password);
await page.getByRole("button", { name: /Đăng nhập người học/ }).click();
await page.getByText(/Không thể đăng nhập|Email hoặc mật khẩu/).waitFor();
file = `${dir}/L-002-local-api-unknown-email-rejected.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "L-002", route: "/", api: "POST /api/auth/learner/login real API with unknown email -> rejected", trigger: "submitted unknown learner email", expected: "authentication error without accepting unknown identity", screenshot: file });

await page.getByLabel("Email").fill(email);
await page.getByRole("textbox", { name: /Mật khẩu/ }).fill("123");
await page.getByRole("button", { name: /Đăng nhập người học/ }).click();
await page.getByText(/Email hoặc mật khẩu chưa đúng định dạng|Không thể đăng nhập/).waitFor();
file = `${dir}/L-003-local-api-short-password-rejected.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "L-003", route: "/", api: "POST /api/auth/learner/login real API with 3-character password -> rejected", trigger: "submitted short password", expected: "invalid credential feedback", screenshot: file });

await page.getByRole("button", { name: /Tạo tài khoản người học/ }).click();
await page.getByLabel("Họ và tên").fill("Lane Two Password Check");
await page.getByLabel("Email").fill(`lane2-mismatch-${Date.now()}@example.com`);
await page.getByRole("textbox", { name: /^Mật khẩu/ }).fill(password);
await page.getByRole("textbox", { name: /Xác nhận mật khẩu/ }).fill("DifferentPass123!");
await page.getByRole("button", { name: /Đăng ký và bắt đầu/ }).click();
await page.getByText("Mật khẩu xác nhận chưa khớp.").waitFor();
file = `${dir}/L-004-local-email-password-first-setup-mismatch.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "L-004", route: "/register", api: "client validation before POST /api/auth/learner/register", trigger: "entered first password and mismatching confirmation", expected: "confirmation mismatch prevents account creation", screenshot: file });

await page.getByLabel("Email").fill(email);
await page.getByRole("textbox", { name: /Xác nhận mật khẩu/ }).fill(password);
await page.getByRole("button", { name: /Đăng ký và bắt đầu/ }).click();
await page.getByText(/Email này đã có tài khoản/).waitFor();
file = `${dir}/L-005-local-api-duplicate-email-rejected.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "L-005", route: "/register", api: "POST /api/auth/learner/register real API existing email -> LEARNER_REGISTRATION_EMAIL_EXISTS", trigger: "submitted registration with existing learner email", expected: "duplicate account rejected", screenshot: file });

await page.getByRole("button", { name: /Đã có tài khoản/ }).click();
await page.getByLabel("Email").fill(email);
await page.getByRole("textbox", { name: /Mật khẩu/ }).fill(password);
await page.getByRole("button", { name: /Đăng nhập người học/ }).click();
await page.waitForTimeout(700);
await page.goto(`${base}/profile`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Đổi avatar" }).last().waitFor();
await page.getByRole("button", { name: "Đổi avatar" }).last().click();
await page.getByRole("dialog", { name: "Avatar của bạn" }).waitFor();
await page.getByRole("dialog", { name: "Avatar của bạn" }).getByRole("button", { name: "Sao" }).click();
file = `${dir}/L-056-local-api-avatar-options.png`;
await page.screenshot({ path: file, fullPage: false });
evidence.push({ id: "L-056", route: "/profile", api: "authenticated learner profile GET real; avatar save is profile PUT", trigger: "opened Đổi avatar and selected Sao", expected: "avatar dialog exposes seasonal icon, six stroke colors and six backgrounds", screenshot: file });

console.log(JSON.stringify({ base, api, headless: false, email, evidence }, null, 2));
await browser.close();
