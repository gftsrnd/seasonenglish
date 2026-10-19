// @ts-expect-error The web tsconfig intentionally omits Node types; Vitest runs this source in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./learner.css", import.meta.url), "utf8");

describe("learner responsive shell rules", () => {
  it("removes the overflowing account label from the compact mobile header", () => {
    expect(css).toMatch(/@media\s*\(max-width:720px\)/);
    expect(css).toMatch(/\.topbar \.userchip\s*>\s*\.small\s*\{\s*display:\s*none\s*;?\s*\}/s);
  });

  it("keeps learner content clear of the fixed mobile navigation", () => {
    expect(css).toMatch(
      /main:has\(\.app-learner-page\)\s*\{[^}]*padding-bottom:\s*calc\(128px\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)\s*!important/s,
    );
    expect(css).toMatch(
      /body:has\(nav\.bottomnav\)\s*>\s*#root\s*>\s*main:has\(\.app-learner-page\)\s*\{[^}]*padding-bottom:\s*calc\(128px\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)\s*!important/s,
    );
  });

  it("gives learner page headings and stacked cards a consistent rhythm", () => {
    expect(css).toMatch(/\.app-learner-page\s*>\s*\.page-title\s*\{[^}]*margin-bottom:\s*18px/s);
    expect(css).toMatch(/\.app-learner-page\s*>\s*\.card\s*\+\s*\.card\s*\{[^}]*margin-top:\s*16px/s);
    expect(css).toMatch(/\.app-learner-page\[style\*="display:\s*grid"\]\s*\{[^}]*row-gap:\s*12px\s*!important/s);
    expect(css).toMatch(/\.app-learner-page\[style\*="display:\s*grid"\]\s*>\s*\.card\s*\+\s*\.card\s*\{[^}]*margin-top:\s*0/s);
    expect(css).toMatch(/\.app-learner-page\s*>\s*\.page-title\s+h1\s*\{[^}]*margin-bottom:\s*0/s);
    expect(css).toMatch(/\.app-learner-page\[style\*="display:\s*grid"\]\s*>\s*\.page-title\s*\{[^}]*margin-bottom:\s*8px/s);
  });

  it("keeps the Home heading compact and its mobile context cards evenly stacked", () => {
    expect(css).toMatch(/@media\s*\(max-width:480px\)\s*\{[^}]*\.app-learner-page\.home-page\s*>\s*\.page-title\s*\{[^}]*gap:\s*6px/s);
    expect(css).toMatch(/\.app-learner-page\.home-page\s*>\s*\.page-title\s+\.badge\s*\{[^}]*font-size:\s*\.7rem[^}]*padding:\s*3px\s+8px/s);
    expect(css).toMatch(/\.app-learner-page\.home-page\s+\.home-context\s*>\s*\.card\s*\+\s*\.card\s*\{[^}]*margin-top:\s*4px/s);
  });

  it("stacks the profile assessment score before its skill progress rows on narrow screens", () => {
    expect(css).toMatch(
      /\.app-learner-page\.profile-page\s+\[aria-label="Kết quả đánh giá"\]\s*>\s*\.grid\s*>\s*\.item\[role="region"\]\s*\{[^}]*display:\s*block/s,
    );
    expect(css).toMatch(
      /\.app-learner-page\.profile-page\s+\[aria-label="Kết quả đánh giá"\]\s*>\s*\.grid\s*>\s*\.item\[role="region"\]\s*>\s*div:not\(\.row\)\s*\{[^}]*margin-top:\s*8px/s,
    );
  });

  it("keeps Home metrics readable and equal-height within their group on narrow screens", () => {
    expect(css).toMatch(/\.app-learner-page\.home-page\s+\.stats\s*\{[^}]*align-items:\s*stretch/s);
    expect(css).toMatch(/@media\s*\(max-width:480px\)\s*\{[^}]*\.app-learner-page\.home-page\s+\.stats\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
    expect(css).toMatch(/\.app-learner-page\.home-page\s+\.stats\s+\.stat\s*\{[^}]*min-height:/s);
  });

  it("uses a consistent learner status icon box instead of oversized inline glyphs", () => {
    expect(css).toMatch(/\.app-learner-page\s+\.status-icon\s*\{[^}]*width:\s*18px[^}]*height:\s*18px/s);
    expect(css).toMatch(/\.app-learner-page\s+\.status-icon\s*\{[^}]*flex:\s*0\s+0\s+18px/s);
  });

  it("keeps profile label/value rows readable on narrow screens", () => {
    expect(css).toMatch(/\.profile-page\s+\.profile-details\s*\{[^}]*gap:\s*8px/s);
    expect(css).toMatch(/\.profile-page\s+\.profile-detail-row\s*\{[^}]*gap:\s*10px[^}]*line-height:\s*1\.4/s);
    expect(css).toMatch(/\.profile-page\s+\.profile-detail-label\s*\{[^}]*flex:\s*0\s+0\s+120px[^}]*min-width:\s*0\s*!important/s);
    expect(css).toMatch(/\.profile-page\s+\.profile-detail-value\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/s);
  });

  it("keeps learner buttons and icons from collapsing or overflowing their primitives", () => {
    expect(css).toMatch(/\.app-learner-page\s+(?:button|\.btn)\s*\{[^}]*min-width:\s*44px/s);
    expect(css).toMatch(/\.app-learner-page\s+(?:button|\.btn)\s*>\s*svg\s*\{[^}]*flex:\s*0\s+0\s+auto/s);
    expect(css).toMatch(/\.app-learner-page\s+\.card\s*>\s*:first-child\s*\{[^}]*margin-top:\s*0/s);
    expect(css).toMatch(/\.app-learner-page\s+\.card\s*>\s*:last-child\s*\{[^}]*margin-bottom:\s*0/s);
  });

  it("separates certificate rows so disabled fields do not read as one fused table", () => {
    expect(css).toMatch(/\.profile-form\s+\[aria-label="Về tiếng Anh"\]>div:nth-of-type\(2\):has\(>\.row\)\s*\{[^}]*display:\s*grid[^}]*gap:\s*6px/s);
    expect(css).toMatch(/\.profile-form\s+\[aria-label="Về tiếng Anh"\]>div:nth-of-type\(2\):has\(>\.row\)>\.row\s*\{[^}]*row-gap:\s*6px[^}]*min-width:\s*0/s);
    expect(css).toMatch(/\.profile-form\s+\[aria-label="Về tiếng Anh"\]>div:nth-of-type\(2\):has\(>\.row\)>\.row>input\s*\{[^}]*min-width:\s*0/s);
  });

  it("keeps lesson tabs and Coach vocabulary actions touch-safe on mobile", () => {
    expect(css).toMatch(/\.lesson-page\s+\.ltabs\s+button\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.coach-page\s+\.coach-surface\s+\.word-card\s*\{[^}]*min-height:\s*44px/s);
  });
});
