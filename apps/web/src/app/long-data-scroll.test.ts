// @ts-expect-error Vitest runs this file in Node, while the web tsconfig omits @types/node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Runtime stylesheets: app.css (main.tsx) and shared.css (AppShell). src/styles.css is not loaded by the app.
const globalCss = ["./app.css", "./shared/shared.css"].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
const operatorDashboard = readFileSync(new URL("./operator/Dashboard.tsx", import.meta.url), "utf8");

describe("long data scroll regions", () => {
  it("does not force every shared table into a short vertical viewport", () => {
    expect(globalCss).toMatch(/\.table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
    expect(globalCss).not.toMatch(/\.table-wrap\s*\{[^}]*max-height:/s);
    expect(globalCss).not.toMatch(/\.table-wrap\s+thead\s+th\s*\{[^}]*position:\s*sticky/s);
  });

  it("bounds only explicitly marked long regions and exposes a stable scrollbar gutter", () => {
    expect(globalCss).toMatch(/\.bounded-scroll-region\s*\{[^}]*max-height:\s*min\(60vh,\s*32rem\)[^}]*overflow:\s*auto[^}]*scrollbar-gutter:\s*stable/s);
    expect(globalCss).not.toMatch(/\.manager-page\s+\.list[\s\S]*?max-height:/s);
    expect(globalCss).not.toMatch(/\.settings-page\s+\.list[\s\S]*?max-height:/s);
  });

  it("places pending assessment cards inside the shared bounded region", () => {
    expect(operatorDashboard).toMatch(/aria-label="Danh sách chờ duyệt"[^>]*className="bounded-scroll-region operator-pending-list"/);
  });
});
