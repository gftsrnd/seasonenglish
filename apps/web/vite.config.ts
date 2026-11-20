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


/**
 * Role-route preload hints: the learner/operator/manager controller chunks are lazy, so they used to start
 * downloading only after the entry bundle ran. This writes their hashed file names into index.html and a tiny
 * script preloads the one matching the current path, in parallel with the entry bundle.
 */
const roleRoutePreload: Plugin = {
  name: "e4s-role-route-preload",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler(html, context) {
      const bundle = context.bundle;
      if (!bundle) return html;
      const chunks = Object.values(bundle).filter((item): item is Extract<typeof item, { type: "chunk" }> => item.type === "chunk");
      const filesFor = (moduleSuffix: string) => {
        const entry = chunks.find((chunk) => chunk.facadeModuleId?.endsWith(moduleSuffix));
        if (!entry) return [] as string[];
        const files = new Set<string>();
        const visit = (chunk: typeof entry) => {
          if (files.has(chunk.fileName)) return;
          files.add(chunk.fileName);
          for (const css of (chunk as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss ?? []) files.add(css);
          for (const imported of chunk.imports) { const next = chunks.find((item) => item.fileName === imported); if (next) visit(next); }
        };
        visit(entry);
        return [...files].filter((file) => !html.includes(file));
      };
      const routes = {
        learner: filesFor("learner/LearnerRouteController.tsx"),
        operator: filesFor("operator/OperatorRouteController.tsx"),
        manager: filesFor("manager/ManagerRouteController.tsx")
      };
      const prefixes = {
        operator: ["/op"],
        manager: ["/mgr", "/settings"],
        learner: ["/home", "/monthly", "/coach", "/games", "/arena", "/profile", "/support", "/lesson", "/test", "/challenge", "/survey", "/onboard", "/reward"]
      };
      const hints = Object.fromEntries(Object.entries(routes).map(([role, files]) => [role, { prefixes: prefixes[role as keyof typeof prefixes], files }]));
      const script = "<script>(function(h){var p=location.pathname;Object.keys(h).forEach(function(k){if(!h[k].prefixes.some(function(x){return p===x||p.indexOf(x+\"/\")===0}))return;h[k].files.forEach(function(f){var l=document.createElement(\"link\");var css=f.slice(-4)===\".css\";l.rel=css?\"preload\":\"modulepreload\";if(css)l.as=\"style\";l.href=\"/\"+f;l.crossOrigin=\"\";document.head.appendChild(l)})})})(" + JSON.stringify(hints) + ")</script>";
      return html.replace("</head>", `${script}</head>`);
    }
  }
};

export default defineConfig({
  plugins: [react(), roleRoutePreload, ...(process.env.VITE_E4S_STAFF_DIRECT_ENTRY !== "0" ? [staffEntryPreview] : [])],
  server: {
    host: "127.0.0.1",
    port: 4175,
    proxy: { "/api": process.env.E4S_API_PROXY_URL ?? "http://127.0.0.1:4174" }
  },
  preview: { host: "127.0.0.1", port: 4175 },
  // `tsc -b` emits compiled copies of the tests into dist/; never run those stale copies.
  test: { exclude: ["**/node_modules/**", "**/dist/**", ".tmp/**"] }
});
