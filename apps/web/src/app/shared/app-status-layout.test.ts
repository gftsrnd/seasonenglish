import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
// @ts-expect-error Vitest runs this layout test in Node; the web project omits Node ambient types.
import { fileURLToPath } from "node:url";

const appCssPath = fileURLToPath(new URL("../app.css", import.meta.url));
const sharedCssPath = fileURLToPath(new URL("./shared.css", import.meta.url));

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

describe("offline status layout", () => {
  it.each([
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ])("centres the recovery card in the $name viewport", async ({ width, height }) => {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(`
      <div id="root">
        <main class="app-status-page app-status-page--error">
          <section class="app-status-card">
            <p class="app-status-eyebrow">Kết nối bị gián đoạn</p>
            <h1>Chưa thể mở E4S</h1>
            <p class="app-status-message">E4S hiện chưa thể kết nối.</p>
            <button class="btn-primary app-status-retry">Thử kết nối lại</button>
          </section>
        </main>
      </div>
    `);
    await page.addStyleTag({ path: appCssPath });
    await page.addStyleTag({ path: sharedCssPath });

    const geometry = await page.locator(".app-status-card").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        centreX: rect.left + rect.width / 2,
        centreY: rect.top + rect.height / 2
      };
    });

    expect(geometry.centreX).toBeCloseTo(width / 2, 0);
    expect(geometry.centreY).toBeCloseTo(height / 2, 0);
    await page.close();
  });
});
