import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { readFileSync } from "node:fs";

const sharedCss = readFileSync(new URL("./shared.css", import.meta.url), "utf8");
const coordinatorCss = readFileSync(new URL("../app-layout.css", import.meta.url), "utf8");
const managerCss = readFileSync(new URL("../manager/manager.css", import.meta.url), "utf8");
const settingsCss = readFileSync(new URL("../settings/settings.css", import.meta.url), "utf8");

describe("mobile shell layout", () => {
  it("keeps the bottom navigation in the viewport layout instead of covering main content", () => {
    expect(sharedCss).toMatch(/body:has\(nav\.bottomnav\)\s*>\s*#root[\s\S]*?display:\s*flex/);
    expect(sharedCss).toMatch(/body:has\(nav\.bottomnav\)\s*>\s*#root[\s\S]*?height:\s*100dvh/);
    expect(sharedCss).toMatch(/body:has\(nav\.bottomnav\)\s*>\s*#root[\s\S]*?overflow:\s*hidden/);
    expect(sharedCss).toMatch(/body:has\(nav\.bottomnav\)\s*>\s*#root[\s\S]*?\.bottomnav[\s\S]*?position:\s*static/);
    expect(sharedCss).toMatch(/body:has\(nav\.bottomnav\)\s*>\s*#root\s*>\s*main[\s\S]*?overflow-y:\s*auto\s*!important/);
    expect(sharedCss).toMatch(/body:has\(nav\.bottomnav\)\s*>\s*#root\s*>\s*\.bottomnav[\s\S]*?position:\s*static\s*!important/);
  });

  it("keeps the compact avatar artwork inside a full-size profile hit target", () => {
    expect(sharedCss).toMatch(/\.topbar \.userchip > \.btn-ghost\[aria-label="Đổi avatar"\][\s\S]*?width:\s*44px[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*44px/);
  });
});

describe("desktop shell layout", () => {
  it("keeps the complete brand inside the desktop sidebar", () => {
    expect(sharedCss).toMatch(/@media \(min-width: 961px\)[\s\S]*?\.topbar\.topbar > \.brand\s*\{[\s\S]*?gap:\s*8px/);
    expect(sharedCss).toMatch(/@media \(min-width: 961px\)[\s\S]*?\.topbar\.topbar > \.brand\s*\{[\s\S]*?max-width:\s*100%/);
    expect(sharedCss).toMatch(/@media \(min-width: 961px\)[\s\S]*?\.topbar\.topbar > \.brand > span:last-child\s*\{[\s\S]*?overflow:\s*visible/);
  });
});

describe("entry shell layout", () => {
  it("centers the entry card with room to scroll when the form grows", () => {
    expect(sharedCss).toMatch(/main\.app-entry-main\s*\{[^}]*align-items:\s*safe center[^}]*justify-items:\s*center[^}]*min-height:\s*100dvh/);
    expect(sharedCss).toMatch(/\.app-entry-content\s*\{[^}]*display:\s*grid/);
  });

  it("keeps transparent login links readable in seasonal themes", () => {
    expect(sharedCss).toMatch(/\.app-entry-link:hover:not\(:disabled\)\s*\{[\s\S]*?background:\s*transparent[\s\S]*?color:\s*var\(--primary-dark\)/);
    expect(sharedCss).not.toMatch(/\.app-entry-link:hover:not\(:disabled\)\s*\{[\s\S]*?color:\s*var\(--primary-ink\)/);
  });
});

describe("tablet shell navigation", () => {
  it("uses the bottom navigation instead of a clipped header lane", () => {
    expect(sharedCss).toMatch(/\.app-shell-topbar\s*>\s*nav\s*\{\s*display:\s*none/);
    expect(sharedCss).toMatch(/#root\s*>\s*\.bottomnav\s*>\s*a\s*\{[^}]*flex:\s*1 1 0/);
  });
});

describe("seasonal pattern accessibility", () => {
  it("renders decoration behind content and disables it for reduced transparency and forced colours", () => {
    expect(coordinatorCss).toMatch(/body::before[\s\S]*?background-image:\s*var\(--season-pattern-image/);
    expect(coordinatorCss).toMatch(/body\s*>\s*#root[\s\S]*?position:\s*relative[\s\S]*?z-index:\s*1/);
    expect(coordinatorCss).toMatch(/@media \(prefers-reduced-transparency:\s*reduce\)[\s\S]*?body::before[\s\S]*?display:\s*none/);
    expect(coordinatorCss).toMatch(/@media \(forced-colors:\s*active\)[\s\S]*?body::before[\s\S]*?display:\s*none/);
  });
});

describe("Manager and Settings page geometry", () => {
  it("keeps page titles clear of the shell and their first card at narrow and tablet widths", () => {
    // The shared shell supplies the content inset; Manager must not add a
    // second top inset that pushes the title/card rhythm away from the
    // canonical app geometry.
    expect(managerCss).toMatch(/\.manager-page\s*\{[\s\S]*?padding-top:\s*0/);
    expect(managerCss).toMatch(/\.manager-page-title__content\s+p\s*\{[\s\S]*?line-height:\s*1\.55/);
    expect(settingsCss).toMatch(/\.settings-page\s*\{[\s\S]*?padding-top:\s*12px/);
    expect(settingsCss).toMatch(/\.settings-page\s*>\s*\.page-title\s*\{[\s\S]*?margin-bottom:\s*12px/);
  });
});
