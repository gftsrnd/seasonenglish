import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Mirror the staff entry routes from the Docker web server in the local preview.
const staffEntryPreview: Plugin = {
  name: "e4s-staff-entry-preview",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (!/^\/login\/?$/.test(url.pathname)) return next();
      response.writeHead(302, { Location: `/${url.search}` });
      response.end();
    });
  },
  transformIndexHtml(_html, context) {
    const path = (context.originalUrl ?? context.path).split("?")[0] ?? "/";
    if (!/^\/season-english\/staff(?:\/forgot-password)?\/?$/.test(path)) return;
    return [{ tag: "meta", attrs: { name: "e4s-entry", content: "staff" }, injectTo: "head" }];
  }
};

export default defineConfig({
  plugins: [react(), ...(process.env.VITE_E4S_STAFF_DIRECT_ENTRY !== "0" ? [staffEntryPreview] : [])],
  server: {
    host: "127.0.0.1",
    port: 4175,
    proxy: { "/api": process.env.E4S_API_PROXY_URL ?? "http://127.0.0.1:4174" }
  },
  preview: { host: "127.0.0.1", port: 4175 },
  // `tsc -b` emits compiled copies of the tests into dist/; never run those stale copies.
  test: { exclude: ["**/node_modules/**", "**/dist/**", ".tmp/**"] }
});
