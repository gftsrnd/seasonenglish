import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./responsive-compact.css", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const body = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Top-level blocks of the stylesheet: every one must be a media query. */
function topLevelPreludes(source: string): string[] {
  const preludes: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "{") { if (depth === 0) preludes.push(source.slice(start, index).trim()); depth += 1; }
    if (source[index] === "}") { depth -= 1; if (depth === 0) start = index + 1; }
  }
  return preludes;
}

describe("phone and tablet stylesheet", () => {
  it("is loaded by the app root", () => {
    expect(app).toMatch(/import "\.\/responsive-compact\.css";/);
  });

  it("keeps desktop unchanged: every rule sits in a phone/tablet, touch or no-hover media query", () => {
    const preludes = topLevelPreludes(body);
    expect(preludes.length).toBeGreaterThan(5);
    for (const prelude of preludes) {
      expect(prelude).toMatch(/^@media \((max-width: (1024|1023|767|600|560|480|420)px|pointer: coarse|hover: none)\)/);
    }
  });

  it("lets lesson examples and chips wrap inside the screen instead of being clipped", () => {
    expect(css).toMatch(/\.lesson-page :is\(\.lesson-example-card, \.vocabulary-card-sound, \.lesson-example-wrap, \.btn-sm\) \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
    expect(css).toMatch(/\.lesson-page :is\(\.lesson-surface, \.lesson-parts\) \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.lesson-grammar-formula-row \{ flex-wrap: wrap;/);
  });

  it("fits the stacked account cards to the settings card", () => {
    expect(css).toMatch(/@container manager-accounts \(max-width: 975px\) \{\s*:root:root \.settings-action-table \.manager-accounts-table__table \{ width: 100%; min-width: 0;/);
  });

  it("hides the floating scroll button while any modal or dialog is open", () => {
    expect(css).toMatch(/body:has\(\.modal-backdrop, dialog\[open\], \[role="dialog"\][^)]*\) > #root > \.app-scroll-jump \{ display: none; \}/);
  });

  it("gives touch screens 40px targets and phones/tablets 12px minimum labels", () => {
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*:root:root :is\(\.btn-sm, a\.btn-sm, \.btn\.btn-sm\) \{ min-height: var\(--touch-min, 40px\) !important; \}/);
    expect(css).toMatch(/@media \(max-width: 1023px\) \{\s*\.bottomnav a:not\(z\) \{ font-size: 12px; \}/);
    expect(css).toMatch(/\.eyebrow:not\(z\) \{ font-size: 12px; \}/);
    expect(css).toMatch(/\.badge:not\(z\) \{ font-size: 12px; \}/);
    // Never a blanket override that could shrink text that is already larger.
    expect(css).not.toMatch(/:is\([^)]*\.badge[^)]*\)\s*\{\s*font-size/);
  });

  it("lets the manager dashboard lists flow in the page on phones", () => {
    expect(css).toMatch(/@media \(max-width: 767px\) \{\s*:root:root #root \.manager-page :is\(\.manager-progress-table, \.manager-progress-list\) \{\s*max-height: none !important;/);
  });
});
