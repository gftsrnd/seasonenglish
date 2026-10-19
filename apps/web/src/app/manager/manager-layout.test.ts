// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./manager.css", import.meta.url), "utf8");
const controller = readFileSync(new URL("./ManagerRouteController.tsx", import.meta.url), "utf8");

describe("Manager layout rhythm contract", () => {
  it("loads Manager-only CSS through the lazy route controller", () => {
    expect(controller).toMatch(/import ["']\.\/manager\.css["']/);
  });

  it("keeps Manager title-to-content spacing at the app rhythm on every viewport", () => {
    expect(css).toMatch(/\.manager-page\s*>\s*\.page-title,[\s\S]*?\.manager-page-title\s*\{[\s\S]*?margin-bottom:\s*14px/);
    expect(css).not.toMatch(/@media\s*\(max-width:\s*520px\)[\s\S]*?\.manager-page\s*>\s*\.page-title,[\s\S]*?margin-bottom:\s*18px/);
  });

  it("keeps Manager Settings aligned without leaking the Manager page-title override", () => {
    expect(css).toMatch(/\.settings-page\[data-settings-role="manager"\]\s*>\s*\.page-title\s*\{[\s\S]*?margin-bottom:\s*2px/);
  });

  it("keeps the Manager operator summary compact and horizontally scannable", () => {
    expect(css).toMatch(/\.manager-operator-summary\s*\{[\s\S]*?min-width:\s*900px/);
    expect(css).toMatch(/\.manager-operator-list\s*\{[\s\S]*?overflow-x:\s*auto/);
  });

  it("keeps Manager modals fixed to the viewport instead of the long page document", () => {
    expect(css).toMatch(/\.manager-modal-backdrop\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0[\s\S]*?display:\s*grid/);
  });

  it("lets Manager and Settings use the canonical document scroll on mobile", () => {
    expect(css).toMatch(/body:has\(> #root > \.topbar nav\[aria-label="Điều hướng quản lý"\]\)\s*\{[\s\S]*?overflow:\s*visible\s*!important/);
    expect(css).toMatch(/body:has\(> #root > \.topbar nav\[aria-label="Điều hướng quản lý"\]\) > #root\s*\{[\s\S]*?display:\s*block\s*!important[\s\S]*?overflow:\s*visible\s*!important/);
    expect(css).toMatch(/body:has\(> #root > \.topbar nav\[aria-label="Điều hướng quản lý"\]\) > #root > main\s*\{[\s\S]*?flex:\s*none\s*!important[\s\S]*?overflow:\s*visible\s*!important/);
    expect(css).toMatch(/body:has\(> #root > \.topbar nav\[aria-label="Điều hướng quản lý"\]\) > #root > \.bottomnav\s*\{[\s\S]*?position:\s*fixed\s*!important/);
  });
});
