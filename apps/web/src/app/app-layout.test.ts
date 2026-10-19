import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./app.css", import.meta.url), "utf8");

describe("global app HCI rhythm", () => {
  it("separates page headings, grouped controls, cards, and sections", () => {
    expect(css).toMatch(/\.page-title\s*\{[\s\S]*?row-gap:\s*12px[;\s][\s\S]*?margin-bottom:\s*18px/);
    expect(css).toMatch(/\.page-title p\s*\{[\s\S]*?margin:\s*6px 0 0[;\s][\s\S]*?line-height:\s*1\.5/);
    expect(css).toMatch(/\.page-title > \.row\s*\{[\s\S]*?row-gap:\s*10px/);
    expect(css).toMatch(/--hci-space-group:\s*16px/);
    expect(css).toMatch(/\.card \+ \.card\s*\{[\s\S]*?margin-top:\s*var\(--hci-space-group\)/);
    expect(css).toMatch(/--hci-space-section:\s*28px/);
    expect(css).toMatch(/\.section\s*\{[\s\S]*?margin-top:\s*var\(--hci-space-section\)/);
    expect(css).toMatch(/\.grid\s*\{[\s\S]*?gap:\s*var\(--hci-space-group\)/);
    expect(css).toMatch(/\.row\s*\{[\s\S]*?row-gap:\s*10px/);
    expect(css).toMatch(/\.stack\s*\{[\s\S]*?gap:\s*12px/);
  });

  it("gives badges, statuses, and body copy enough readable height", () => {
    expect(css).toMatch(/\.badge\s*\{[\s\S]*?min-height:\s*26px[;\s][\s\S]*?line-height:\s*1\.4/);
    expect(css).toMatch(/\.chip\s*\{[\s\S]*?min-height:\s*26px[;\s][\s\S]*?line-height:\s*1\.4/);
    expect(css).toMatch(/\.chips\s*\{[\s\S]*?row-gap:\s*8px/);
    expect(css).toMatch(/\.banner\s*\{[\s\S]*?line-height:\s*1\.5/);
    expect(css).toMatch(/\.card > h[234]:first-child[\s\S]*?margin-bottom:\s*12px/);
  });

  it("keeps primary controls touchable and decorative layers behind content", () => {
    expect(css).toMatch(/--hci-touch-target:\s*44px/);
    expect(css).toMatch(/button,\.btn\s*\{[\s\S]*?min-height:\s*var\(--hci-touch-target\)/);
    expect(css).toMatch(/\.btn-sm\s*\{[\s\S]*?min-height:\s*40px/);
    expect(css).toMatch(/\.word-chip\s*\{[\s\S]*?min-height:\s*44px\s*!important/);
    expect(css).toMatch(/\.hero,\.party,\.welcome\s*\{[\s\S]*?isolation:\s*isolate/);
    expect(css).toMatch(/\.hero::after,\.party::after\s*\{[\s\S]*?z-index:\s*0/);
    expect(css).toMatch(/\.hero > \*,\.party > \*,\.welcome \.body,\.welcome \.pills\s*\{[\s\S]*?z-index:\s*1/);
    expect(css).toMatch(/\.game-icon,\.game-control-icon,\.status-icon,\.app-brand-mark,\.avatar\s*\{[\s\S]*?flex-shrink:\s*0/);
  });
});
