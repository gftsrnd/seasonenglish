// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./settings.css", import.meta.url), "utf8");

describe("Settings mobile layout contract", () => {
  it("keeps basic HCI rhythm and actionable touch targets local to Settings", () => {
    expect(css).toMatch(/\.settings-page\s*\{[\s\S]*?gap:\s*16px/);
    expect(css).toMatch(/\.settings-page\s*>\s*\.card\s*\{[\s\S]*?gap:\s*16px/);
    expect(css).toMatch(/\.settings-page\s+\.field\s*\{[\s\S]*?gap:\s*8px/);
    expect(css).toMatch(/\.settings-page button,[\s\S]*?\.settings-page \.btn\s*\{[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/section\.card\s*>\s*\.row:has\(> button\)[\s\S]*?flex-wrap:\s*wrap/);
  });

  it("does not reserve obsolete fixed-nav overlay space", () => {
    expect(css).toMatch(/\.settings-page\[data-settings-role="manager"\][\s\S]*?padding-bottom:\s*calc\(24px\s*\+/);
    expect(css).not.toMatch(/\.settings-page\[data-settings-role="manager"\][\s\S]*?padding-bottom:\s*108px/);
  });
});
