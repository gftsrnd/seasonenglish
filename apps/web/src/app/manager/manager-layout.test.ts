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

  it("keeps standard Manager dialogs compact instead of stretching across the viewport", () => {
    expect(css).toMatch(/\.manager-modal-backdrop\s*>\s*\.dialog:not\(\.manager-learner-profile-dialog\)\s*\{[\s\S]*?width:\s*min\(560px,\s*100%\)/);
  });

  it("keeps long Manager account lists inside a bounded scroll region", () => {
    expect(css).toMatch(/\.manager-accounts-table\s*\{[\s\S]*?max-height:\s*560px[\s\S]*?overflow-y:\s*auto/);
    expect(css).toMatch(/\.manager-accounts-table__table\s+thead\s+th\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*0/);
    expect(css).toMatch(/\.manager-accounts-pagination\s*\{[\s\S]*?display:\s*flex[\s\S]*?flex-wrap:\s*wrap/);
  });

  it("keeps the password reveal control fixed inside the input", () => {
    expect(css).toMatch(/\.settings-page\[data-settings-role="manager"\]\s+\.manager-password-toggle\s*\{[^}]*position:\s*absolute[^}]*inset-block:\s*5px[^}]*right:\s*6px[^}]*height:\s*auto[^}]*min-height:\s*0[^}]*padding:\s*0/s);
    expect(css).toMatch(/\.manager-password-control\s*>\s*input\s*\{[^}]*width:\s*100%[^}]*box-sizing:\s*border-box/s);
  });

  it("separates the permanent-delete actions from the confirmation content", () => {
    expect(css).toMatch(/\.manager-purge-dialog__actions\s*\{[^}]*gap:\s*16px[^}]*padding-top:\s*16px[^}]*border-top:\s*1px\s+solid\s+var\(--line\)/s);
  });

  it("contains the recovery panel and replaces the browser's raw summary marker", () => {
    expect(css).toMatch(/\.settings-recovery\s*\{[^}]*box-sizing:\s*border-box[^}]*overflow:\s*clip/s);
    expect(css).toMatch(/\.settings-recovery\s*>\s*summary\s*\{[^}]*display:\s*flex[^}]*list-style:\s*none/s);
    expect(css).toMatch(/\.settings-recovery__body\s*\{[^}]*box-sizing:\s*border-box[^}]*overflow:\s*hidden/s);
  });

  it("uses orange as an accent instead of flooding the deletion review card", () => {
    expect(css).toMatch(/\.manager-operational-card--delete\s*\{[^}]*border-left:\s*4px\s+solid\s+var\(--primary\)[^}]*background:\s*var\(--surface\)/s);
    expect(css).not.toMatch(/\.manager-operational-card--delete\s*\{[^}]*background:\s*var\(--butter\)/s);
  });

  it("keeps the pending-review badge vertically aligned with the account name", () => {
    expect(css).toMatch(/\.manager-operational-row\s+\.title\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*gap:\s*6px/s);
  });

  it("lets Manager and Settings use the canonical document scroll on mobile", () => {
    expect(css).toMatch(/body:has\(> #root > \.topbar nav\[aria-label="Điều hướng quản lý"\]\)\s*\{[\s\S]*?overflow:\s*visible\s*!important/);
    expect(css).toMatch(/body:has\(> #root > \.topbar nav\[aria-label="Điều hướng quản lý"\]\) > #root\s*\{[\s\S]*?display:\s*block\s*!important[\s\S]*?overflow:\s*visible\s*!important/);
    expect(css).toMatch(/body:has\(> #root > \.topbar nav\[aria-label="Điều hướng quản lý"\]\) > #root > main\s*\{[\s\S]*?flex:\s*none\s*!important[\s\S]*?overflow:\s*visible\s*!important/);
    expect(css).toMatch(/body:has\(> #root > \.topbar nav\[aria-label="Điều hướng quản lý"\]\) > #root > \.bottomnav\s*\{[\s\S]*?position:\s*fixed\s*!important/);
  });
});
