import { chromium } from "playwright";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

const baseUrl = args.get("--base") ?? "http://127.0.0.1:4175";
const storageState = args.get("--state");
const routes = [
  ["mgr", "/mgr"],
  ["ops", "/mgr/ops"],
  ["reminders", "/mgr/reminders"],
  ["report", "/mgr/report"],
  ["rewards", "/mgr/rewards"],
  ["settings", "/settings"]
];
const viewports = [
  [827, 900],
  [600, 900],
  [390, 844]
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(storageState ? { storageState } : undefined);
const failures = [];

for (const [name, route] of routes) {
  for (const [width, height] of viewports) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    try {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 12_000 });
      await page.locator("main").waitFor({ state: "visible", timeout: 5_000 });
      await page.waitForTimeout(250);
      const result = await page.evaluate(({ name: routeName }) => {
        const visible = (element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        };
        const title = document.querySelector("main .page-title");
        let introGap = null;
        if (title?.parentElement) {
          const siblings = [...title.parentElement.children];
          const firstContent = siblings.slice(siblings.indexOf(title) + 1).find(visible);
          if (firstContent) introGap = Math.round(firstContent.getBoundingClientRect().top - title.getBoundingClientRect().bottom);
        }
        const bottomNav = document.querySelector("nav.bottomnav");
        const initialOverflow = document.documentElement.scrollWidth > innerWidth + 1;
        window.scrollTo(0, document.documentElement.scrollHeight);
        const navRect = bottomNav && visible(bottomNav) ? bottomNav.getBoundingClientRect() : null;
        const coveredControls = navRect ? [...document.querySelectorAll("main button, main a, main input, main select, main textarea, main summary")]
          .filter(visible)
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.bottom > navRect.top + 1 && rect.top < navRect.bottom - 1;
          })
          .map((element) => (element.innerText || element.getAttribute("aria-label") || element.tagName).trim().slice(0, 50)) : [];
        const actionTable = document.querySelector("[data-manager-action-table]");
        let actionCellVisible = true;
        if (actionTable) {
          const cell = actionTable.querySelector("tbody tr:last-child td:last-child");
          if (cell) {
            const wrapRect = actionTable.getBoundingClientRect();
            const cellRect = cell.getBoundingClientRect();
            actionCellVisible = cellRect.left >= wrapRect.left - 1 && cellRect.right <= wrapRect.right + 1;
          }
        }
        return {
          initialOverflow,
          introGap,
          coveredControls,
          actionCellVisible,
          missingCertificateExtras: routeName === "settings" ? false : false
        };
      }, { name });
      if (result.initialOverflow) failures.push(`${name}@${width}: document horizontal overflow`);
      if (result.introGap !== null && result.introGap < 12) failures.push(`${name}@${width}: intro-to-content gap ${result.introGap}px`);
      if (result.coveredControls.length) failures.push(`${name}@${width}: bottom nav covers ${result.coveredControls.join(", ")}`);
      if (!result.actionCellVisible) failures.push(`${name}@${width}: action column is outside its scroll viewport`);
    } catch (error) {
      failures.push(`${name}@${width}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await page.close();
    }
  }
}

const certificate = await context.newPage();
await certificate.setViewportSize({ width: 827, height: 900 });
try {
  await certificate.goto(`${baseUrl}/reward/preview`, { waitUntil: "domcontentloaded", timeout: 12_000 });
  await certificate.locator("main").waitFor({ state: "visible", timeout: 5_000 });
  const text = await certificate.locator("main").innerText();
  if (!text.includes("PHẦN THƯỞNG KÈM THEO")) failures.push("reward-preview: missing prototype reward extras block");
} catch (error) {
  failures.push(`reward-preview: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await certificate.close();
}

await context.close();
await browser.close();
if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, routes: routes.map(([name]) => name), viewports: viewports.map(([width]) => width) }, null, 2));
}
