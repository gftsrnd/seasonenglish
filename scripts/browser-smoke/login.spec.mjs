import { expect, test } from "@playwright/test";

test("public login fits the viewport and PIN controls work", async ({ page }, testInfo) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Đăng nhập", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();

  const pin = page.getByLabel("Mã PIN", { exact: true });
  const cells = page.locator(".app-pin-cells > span");
  await expect(cells).toHaveCount(6);
  await expect(pin).toHaveAttribute("type", "password");
  await pin.fill("123456");
  await expect(cells.first()).toHaveText("•");
  await page.getByRole("button", { name: "Hiện Mã PIN" }).click();
  await expect(pin).toHaveAttribute("type", "text");
  await expect(cells.last()).toHaveText("6");
  await page.getByRole("button", { name: "Ẩn Mã PIN" }).click();
  await expect(pin).toHaveAttribute("type", "password");
  await pin.clear();

  await page.getByRole("button", { name: "Quên mã PIN?" }).click();
  await expect(page.getByRole("heading", { name: "Quên mã PIN", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Quay lại đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Đăng nhập", exact: true })).toBeVisible();

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    return {
      viewportWidth: document.documentElement.clientWidth,
      contentWidth: document.documentElement.scrollWidth,
      ttfbMs: navigation ? Math.round(navigation.responseStart) : null,
      domReadyMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
    };
  });
  expect(metrics.contentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  console.log(testInfo.project.name, JSON.stringify(metrics));
});
