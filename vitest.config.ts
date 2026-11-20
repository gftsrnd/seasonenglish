import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**", "**/dist/**", ".tmp/**", ".superpowers/**", "legacy/**",
      // Not Vitest files: node:test (run with `node --test`) and Playwright (BrowserStack smoke kit).
      "scripts/p2-certificate-pdf.test.mjs", "scripts/browser-smoke/**"
    ],
    fileParallelism: false,
    setupFiles: ["./test.setup.ts"]
  }
});
