import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.E4S_VISUAL_BASE ?? "http://127.0.0.1:4175";
const outputDir = process.env.E4S_VISUAL_OUT ?? ".tmp/prototype-hci-postpatch";
const routes = [
  { name: "home", path: "/home" },
  { name: "games", path: "/games" },
];
const viewports = [
  { name: "390x827", width: 390, height: 827 },
  { name: "827x900", width: 827, height: 900 },
];

const visible = (element) => {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
};

const measure = () => {
  const isVisible = (element) => {
    if (!element) return false;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom), left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height) };
  };
  const visibleElements = (selector) => [...document.querySelectorAll(selector)].filter(isVisible);
  const controls = visibleElements("button, .btn").filter((element) => !element.closest(".audio-ctl"));
  const title = document.querySelector(".page-title, main h1") && isVisible(document.querySelector(".page-title, main h1"))
    ? document.querySelector(".page-title, main h1")
    : null;
  const firstControl = title
    ? visibleElements("button, .btn, input, select, textarea").find((element) => element.getBoundingClientRect().top >= title.getBoundingClientRect().bottom - 1)
    : null;
  const cards = visibleElements(".card, .hero, .welcome");
  const verticalSiblingGaps = cards.slice(1).map((card, index) => {
    const previous = cards[index];
    return Math.round(card.getBoundingClientRect().top - previous.getBoundingClientRect().bottom);
  }).filter((gap) => gap >= 0);
  const touchTargetViolations = controls
    .filter((element) => !element.classList.contains("btn-sm"))
    .map((element) => ({ label: (element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 48), rect: rect(element) }))
    .filter(({ rect: box }) => box && (box.height < 44 || box.width < 44));
  const layerChecks = [".hero", ".party", ".welcome"].flatMap((selector) => visibleElements(selector).map((element) => ({
    selector,
    isolation: getComputedStyle(element).isolation,
    afterZIndex: getComputedStyle(element, "::after").zIndex,
  })));
  return {
    viewport: { width: innerWidth, height: innerHeight },
    overflowX: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    titleToFirstControl: title && firstControl
      ? Math.round(firstControl.getBoundingClientRect().top - title.getBoundingClientRect().bottom)
      : null,
    cardGaps: verticalSiblingGaps,
    touchTargetViolations,
    layerChecks,
    anchors: {
      title: rect(title),
      firstControl: rect(firstControl),
      firstCard: rect(cards[0]),
    },
  };
};

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox", { name: "Email" }).fill("learner@e4s.local");
    await page.getByLabel("Mật khẩu").fill("learner-pass");
    await page.getByRole("button", { name: "Đăng nhập người học", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/home", { timeout: 15_000 });
    await page.locator(".prototype-entry").waitFor({ state: "detached", timeout: 15_000 });
    await page.locator(".prototype-learner-page").waitFor({ state: "visible", timeout: 15_000 });

    for (const route of routes) {
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.locator("main").waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForTimeout(350);
      const geometry = await page.evaluate(measure);
      const screenshotPath = `${outputDir}/${route.name}-${viewport.name}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const result = { route: route.path, screenshotPath, ...geometry };
      results.push(result);
      console.log(JSON.stringify(result));
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = results.flatMap((result) => [
  result.overflowX ? `${result.route} ${result.viewport.width}: horizontal overflow (${result.scrollWidth}px)` : null,
  result.touchTargetViolations.length ? `${result.route} ${result.viewport.width}: touch target violations ${JSON.stringify(result.touchTargetViolations)}` : null,
]).filter(Boolean);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
