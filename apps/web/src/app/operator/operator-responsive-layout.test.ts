// @ts-expect-error Vitest runs this file in Node, while the web tsconfig omits @types/node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appCss = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("Operator responsive layout guardrails", () => {
  it("reserves the fixed mobile navigation clearance", () => {
    expect(appCss).toMatch(/body:has\(nav\.bottomnav\):has\(\.app-operator\) > #root > main\s*\{[^}]*padding-bottom:\s*calc\(128px/);
  });

  it("keeps title rhythm and equal-height signal cards explicit", () => {
    expect(appCss).toMatch(/\.app-operator > \.page-title\s*\{[^}]*margin-bottom:\s*14px/);
    expect(appCss).toMatch(/\.app-operator > \.section\s*\{[^}]*margin-top:\s*22px/);
    expect(appCss).toMatch(/\.app-operator \.section > h3\s*\{[^}]*margin-bottom:\s*14px/);
    expect(appCss).toMatch(/\.app-operator \.grid\.cols-2 > \.card\s*\{[^}]*height:\s*100%/);
  });

  it("keeps compact Operator controls touchable on phones", () => {
    expect(appCss).toMatch(/@media \(max-width:\s*480px\)[\s\S]*?\.app-operator\[aria-label="Đọc mẫu"\] \.btn-sm,[\s\S]*?\.app-operator\[aria-label="Prompt"\] \.btn-sm,[\s\S]*?\.app-operator\[aria-label="Đề thi lên mức"\] \.btn-sm[\s\S]*?min-height:\s*40px/);
    expect(appCss).toMatch(/\.app-operator \.tabs\.operator-review-tabs\[role="tablist"\][\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[\s\S]*?overflow:\s*visible/);
  });

  it("keeps pending review actions in an even phone grid", () => {
    expect(appCss).toMatch(/@media \(max-width:\s*480px\)[\s\S]*?\.app-operator\[aria-label="Duyệt trình độ"\] > \.section:first-of-type > \.card > \.row:last-child\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(appCss).toMatch(/\.app-operator\[aria-label="Duyệt trình độ"\] > \.section:first-of-type > \.card > \.row:last-child > \*\s*\{[\s\S]*?margin-left:\s*0 !important/);
    expect(appCss).toMatch(/\.app-operator\[aria-label="Duyệt trình độ"\] > \.section:first-of-type > \.card > \.row:last-child > \.btn-danger\s*\{[\s\S]*?grid-column:\s*2[\s\S]*?width:\s*auto/);
  });

  it("keeps approved learner actions on one desktop row", () => {
    expect(appCss).toMatch(/\.app-operator \.operator-action-table td\[data-label="Thao tác"\] > \.row\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*nowrap/);
  });

  it("gives prompt headings their own line before the reset action", () => {
    expect(appCss).toMatch(/\.app-operator\[aria-label="Prompt"\] > \.card > \.row\.between\s*\{[^}]*align-items:\s*center[^}]*gap:\s*8px/);
    expect(appCss).toMatch(/\.app-operator\[aria-label="Prompt"\] > \.card > \.row\.between > h3\s*\{[^}]*flex:\s*0 1 auto[^}]*margin:\s*0 0 8px/);
  });

  it("lets Operator status rows wrap without icon or viewport collisions", () => {
    expect(appCss).toMatch(/\.app-operator \.operator-status-message,[\s\S]*?\.app-operator \.operator-status-legend\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(appCss).toMatch(/body:has\(\.app-operator\)\s*\{[^}]*overflow-x:\s*clip/);
    expect(appCss).toMatch(/\.app-operator\[aria-label="Prompt"\] > \.card textarea\s*\{[^}]*max-width:\s*100%/);
  });

  it("aligns warning icons with the first line instead of shifting the SVG baseline", () => {
    expect(appCss).toMatch(/\.app-operator \.operator-banner-icon\s*\{[^}]*align-self:\s*flex-start[^}]*margin-top:\s*\.2em/);
    expect(appCss).toMatch(/\.app-operator \.operator-banner-svg\s*\{[^}]*display:\s*block[^}]*vertical-align:\s*0/);
  });

  it("keeps the lesson-set status badge centered beside the page heading", () => {
    expect(appCss).toMatch(/\.app-operator \.operator-lesson-set-title\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*gap:\s*8px/);
    expect(appCss).toMatch(/\.app-operator \.operator-lesson-set-title > \.badge\s*\{[^}]*flex:\s*0 0 auto/);
  });

  it("wraps long prompt tokens and keeps narrow detail tables inside dialogs", () => {
    expect(appCss).toMatch(/\.app-operator\[aria-label="Prompt"\] > \.card > \.row\.between > h3\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
    expect(appCss).toMatch(/\.operator-modal-scope \.list \.item\s*\{[\s\S]*?display:\s*flex/);
    expect(appCss).toMatch(/\.operator-detail-modal \.table-wrap table\s*\{[\s\S]*?table-layout:\s*fixed/);
  });

  it("keeps every app Operator destination reachable in the tablet header", () => {
    expect(appCss).toMatch(/@media \(min-width:\s*761px\) and \(max-width:\s*960px\)[\s\S]*?body:has\(\.app-operator\) \.topbar nav\s*\{[\s\S]*?flex:\s*1 1 auto[\s\S]*?max-width:\s*none[\s\S]*?overflow-x:\s*auto/);
    expect(appCss).toMatch(/body:has\(\.app-operator\) \.topbar nav a\s*\{[\s\S]*?display:\s*inline-flex[\s\S]*?flex:\s*0 0 auto/);
    expect(appCss).not.toMatch(/body:has\(\.app-operator\) \.topbar nav a\s*\{[\s\S]*?display:\s*none/);
  });

});
