import { defineConfig } from "@playwright/test";

const cloudTarget = process.env.E4S_BROWSERSTACK_TARGET;
const browsers = [
  { browserName: "chromium", channel: "chrome", name: "Chrome" },
  { browserName: "chromium", channel: "msedge", name: "Edge" },
  { browserName: "firefox", name: "Firefox" },
  { browserName: "webkit", name: "WebKit" },
];
const screens = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

export default defineConfig({
  testMatch: "login.spec.mjs",
  workers: 1,
  reporter: "list",
  use: { baseURL: cloudTarget || "http://127.0.0.1:4175" },
  // The SDK supplies the remote browser, OS and device from browserstack.yml.
  projects: cloudTarget ? undefined : browsers.flatMap(({ name, ...browser }) =>
    screens.map((viewport) => ({
      name: `${name}-${viewport.width}`,
      use: { ...browser, viewport },
    })),
  ),
});
