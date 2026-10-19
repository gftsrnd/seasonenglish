import { chromium } from "playwright";
import fs from "node:fs/promises";

const repoRoot = "D:/TTS - AI Application - Huynh Doan Hoang Minh/12_10_2026 - 17_10_2026/E4S/platform";
const evidenceRoot = process.env.E4S_MANAGER_EVIDENCE_ROOT
  ? process.env.E4S_MANAGER_EVIDENCE_ROOT.replaceAll("\\", "/")
  : `${repoRoot}/apps/web/src/app/manager/evidence/visual-slice-2026-10-16/fresh-current-2026-10-16`;
const sizes = [[390, 827], [827, 900]];
const routes = [
  ["progress", "/mgr"],
  ["ops", "/mgr/ops"],
  ["reminders", "/mgr/reminders"],
  ["report", "/mgr/report"],
  ["rewards", "/mgr/rewards"],
  ["reward-preview", "/reward/preview"],
  ["settings", "/settings"]
];
const expectedHeadings = new Map([
  ["progress", "Tiến độ nhóm"],
  ["ops", "Hiệu suất vận hành"],
  ["reminders", "Nhắc học"],
  ["report", "Báo cáo tổng kết"],
  ["rewards", "Giả lập phần thưởng"],
  ["reward-preview", "Certificate of Completion"],
  ["settings", "Cài đặt"]
]);

await fs.mkdir(`${evidenceRoot}/local`, { recursive: true });
await fs.mkdir(`${evidenceRoot}/app`, { recursive: true });

const settle = async (page) => {
  await page.locator("body").waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(900);
  await page.locator("main").waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(350);
};

async function loginLocal(page) {
  await page.goto("http://127.0.0.1:4175/", { waitUntil: "domcontentloaded" });
  await page.locator("#app-login-email").waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("tab", { name: "Nhân sự" }).click();
  await page.locator("#app-login-email").fill("manager@e4s.local");
  await page.locator("#app-login-password").fill("manager-pass");
  await page.getByRole("button", { name: "Đăng nhập nhân sự", exact: true }).click();
  await page.waitForURL("**/mgr", { timeout: 10_000 });
  await settle(page);
}

async function loginApplication(page) {
  await page.goto("http://127.0.0.1:4176/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-action="seed-demo"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-action="entry-role"][data-role="manager"]').click();
  await page.waitForTimeout(250);
  await page.locator('[data-action="login"]').first().click();
  await settle(page);
}

async function confirmManagerIdentity(page, host, name, route) {
  const identity = await page.evaluate((currentHost) => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1;
    };
    const headings = [...document.querySelectorAll("main h1, main h2")].filter(visible).map((node) => (node.textContent || "").trim()).filter(Boolean);
    const localManagerNav = document.querySelector('nav[aria-label="Điều hướng quản lý"]');
    const canonicalManagerNav = [...document.querySelectorAll("nav")].find((node) => /Tiến độ/.test(node.textContent || ""));
    const managerNav = currentHost === "local" ? localManagerNav : canonicalManagerNav;
    return {
      href: location.href,
      role: managerNav ? currentHost === "local" ? managerNav.getAttribute("aria-label") : "Manager navigation" : null,
      headings
    };
  }, host);
  const expectedHeading = expectedHeadings.get(name);
  const routeOk = host === "local" ? new URL(identity.href).pathname === route : identity.href.includes(`#${route}`);
  const roleOk = identity.role === (host === "local" ? "Điều hướng quản lý" : "Manager navigation");
  const headingOk = Boolean(expectedHeading && identity.headings.some((heading) => heading === expectedHeading || heading.includes(expectedHeading)));
  if (!routeOk || !roleOk || !headingOk) {
    throw new Error(`Manager identity failed for ${host} ${route}: ${JSON.stringify({ routeOk, roleOk, headingOk, expectedHeading, ...identity })}`);
  }
  return { ...identity, expectedHeading, routeOk, roleOk, headingOk };
}

async function diagnostics(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1;
    };
    const text = (node) => (node.innerText || node.getAttribute("aria-label") || node.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 90);
    const nodes = [...document.querySelectorAll("h1,h2,h3,h4,p,a,button,input,select,textarea,section,article,nav,header,[role=alert],[role=dialog]")].filter(visible);
    const overlaps = [];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (nodes[i].contains(nodes[j]) || nodes[j].contains(nodes[i])) continue;
        const a = nodes[i].getBoundingClientRect();
        const b = nodes[j].getBoundingClientRect();
        const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const area = x * y;
        if (area > 12 && area / Math.min(a.width * a.height, b.width * b.height) > 0.22) overlaps.push({ a: text(nodes[i]), b: text(nodes[j]), area: Math.round(area) });
      }
    }
    const main = document.querySelector("main");
    const title = main?.querySelector(".page-title");
    const firstContent = title ? [...(title.parentElement?.children ?? [])].find((node) => node !== title && visible(node)) : null;
    const titleGap = title && firstContent ? Math.round(firstContent.getBoundingClientRect().top - title.getBoundingClientRect().bottom) : null;
    return {
      url: location.href,
      viewport: [innerWidth, innerHeight],
      scrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      documentScrollHeight: document.documentElement.scrollHeight,
      mainScrollHeight: main?.scrollHeight ?? null,
      mainClientHeight: main?.clientHeight ?? null,
      mainOverflowY: main ? getComputedStyle(main).overflowY : null,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      titleGap,
      overlapCount: overlaps.length,
      overlaps: overlaps.slice(0, 10),
      dialog: Boolean(document.querySelector('[role="dialog"], #modal .dialog')),
      headings: [...document.querySelectorAll("main h1, main h2")].filter(visible).map(text).slice(0, 4)
    };
  });
}

async function captureSuite(host) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: sizes[0][0], height: sizes[0][1] }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const results = [];
  try {
    if (host === "local") await loginLocal(page);
    else await loginApplication(page);
    for (const [name, route] of routes) {
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        const url = host === "local" ? `http://127.0.0.1:4175${route}` : `http://127.0.0.1:4176/#${route}`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await settle(page);
        const identity = await confirmManagerIdentity(page, host, name, route);
        const file = `${host}/${name}-${width}x${height}.png`;
        await page.screenshot({ path: `${evidenceRoot}/${file}`, fullPage: false });
        results.push({ host, route, size: `${width}x${height}`, file, identity, ...(await diagnostics(page)) });
      }
    }

    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      const rewardsUrl = host === "local" ? "http://127.0.0.1:4175/mgr/rewards" : "http://127.0.0.1:4176/#/mgr/rewards";
      await page.goto(rewardsUrl, { waitUntil: "domcontentloaded" });
      await settle(page);
      const identity = await confirmManagerIdentity(page, host, "rewards", "/mgr/rewards");
      const previewTrigger = page.getByRole("button", { name: "Xem màn lên cấp" }).first();
      if (await previewTrigger.isVisible().catch(() => false)) {
        await previewTrigger.click();
        const rewardDialog = page.locator('[role="dialog"][aria-label="Màn chúc mừng lên cấp"], #modal .dialog');
        if (await rewardDialog.isVisible().catch(() => false) || await rewardDialog.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
          const file = `${host}/rewards-modal-${width}x${height}.png`;
          await page.screenshot({ path: `${evidenceRoot}/${file}`, fullPage: false });
          results.push({ host, route: "/mgr/rewards", state: "reward-promotion-modal", size: `${width}x${height}`, file, identity, dialog: "Màn chúc mừng lên cấp", ...(await diagnostics(page)) });
          const closeReward = page.getByRole("button", { name: "Đóng màn chúc mừng" });
          if (await closeReward.isVisible().catch(() => false)) await closeReward.click();
          else await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
        } else {
          const file = `${host}/rewards-modal-not-open-${width}x${height}.png`;
          await page.screenshot({ path: `${evidenceRoot}/${file}`, fullPage: false });
          results.push({ host, route: "/mgr/rewards", state: "reward-promotion-modal", size: `${width}x${height}`, file, blocked: "click-did-not-open-dialog", ...(await diagnostics(page)) });
        }
      } else {
        const file = `${host}/rewards-modal-not-open-${width}x${height}.png`;
        await page.screenshot({ path: `${evidenceRoot}/${file}`, fullPage: false });
        results.push({ host, route: "/mgr/rewards", state: "reward-promotion-modal", size: `${width}x${height}`, file, blocked: "trigger-not-visible", ...(await diagnostics(page)) });
      }
    }

    for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto(host === "local" ? "http://127.0.0.1:4175/mgr" : "http://127.0.0.1:4176/#/mgr", { waitUntil: "domcontentloaded" });
    await settle(page);
    const profileIdentity = await confirmManagerIdentity(page, host, "progress", "/mgr");
    const profileButton = host === "local"
      ? page.getByRole("button", { name: /^Hồ sơ / }).first()
      : page.locator('[data-action="op-view-profile"]').first();
    if (await profileButton.isVisible().catch(() => false) && !(await profileButton.isDisabled().catch(() => true))) {
      await profileButton.click();
      await page.locator('[role="dialog"], #modal .dialog').last().waitFor({ state: "visible", timeout: 5_000 });
      const profileDialog = page.locator('[role="dialog"], #modal .dialog').last();
      const file = `${host}/dialog-learner-profile-${width}x${height}.png`;
      await page.screenshot({ path: `${evidenceRoot}/${file}`, fullPage: false });
      results.push({ host, route: "/mgr", state: "learner-profile-dialog", size: `${width}x${height}`, file, identity: profileIdentity, dialog: "Hồ sơ", dialogMarkup: await profileDialog.getAttribute("role").catch(() => null) ? "role-dialog" : "canonical-modal-dialog", ...(await diagnostics(page)) });
      await page.getByRole("button", { name: "Đóng", exact: true }).last().click();
    }

    await page.goto(host === "local" ? "http://127.0.0.1:4175/settings" : "http://127.0.0.1:4176/#/settings", { waitUntil: "domcontentloaded" });
    await settle(page);
    const settingsIdentity = await confirmManagerIdentity(page, host, "settings", "/settings");
    const resetButton = page.getByRole("button", { name: "Đặt lại mật khẩu", exact: true }).first();
    if (await resetButton.isVisible().catch(() => false) && !(await resetButton.isDisabled().catch(() => true))) {
      await resetButton.click();
      await page.locator('[role="dialog"], #modal .dialog').last().waitFor({ state: "visible", timeout: 5_000 });
      const file = `${host}/dialog-password-reset-${width}x${height}.png`;
      await page.screenshot({ path: `${evidenceRoot}/${file}`, fullPage: false });
      results.push({ host, route: "/settings", state: "password-reset-dialog", size: `${width}x${height}`, file, identity: settingsIdentity, dialog: "Mật khẩu mới", ...(await diagnostics(page)) });
      const cancel = page.getByRole("button", { name: "Huỷ", exact: true });
      if (await cancel.isVisible().catch(() => false)) await cancel.last().click();
      else await page.getByRole("button", { name: "Hủy", exact: true }).last().click();
    } else {
      results.push({ host, route: "/settings", state: "password-reset-dialog", size: `${width}x${height}`, blocked: host === "canonical" ? "canonical-manager-state-has-no-password-reset-dialog" : "password-reset-trigger-not-visible", identity: settingsIdentity, ...(await diagnostics(page)) });
    }
    }
  } finally {
    await context.close();
    await browser.close();
  }
  return results;
}

const results = [...await captureSuite("local"), ...await captureSuite("app")];
await fs.writeFile(`${evidenceRoot}/manifest.json`, JSON.stringify({ generatedAt: new Date().toISOString(), source: { local: "http://127.0.0.1:4175", app: "http://127.0.0.1:4176" }, role: "manager", routes, sizes, results }, null, 2));
console.log(JSON.stringify({ evidenceRoot, count: results.length, results }, null, 2));
