import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", ".tmp/**", ".superpowers/**"],
    fileParallelism: false,
    setupFiles: ["./test.setup.ts"]
  }
});
