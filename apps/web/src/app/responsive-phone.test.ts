import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./responsive-phone.css", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const body = css.replace(/\/\*[\s\S]*?\*\//g, "");

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

describe("phone usability stylesheet", () => {
  it("is loaded after the tablet/touch stylesheet", () => {
    expect(app).toMatch(/import "\.\/responsive-compact\.css";\r?\nimport "\.\/responsive-phone\.css";/);
  });

  it("never touches desktop: every rule is inside a phone or tablet width query", () => {
    for (const prelude of topLevelPreludes(body)) expect(prelude).toMatch(/^@media (\(min-width: 481px\) and )?\(max-width: (480|600|1024)px\)/);
  });

  it("defines one phone type and spacing scale that every screen inherits", () => {
    expect(css).toMatch(/@media \(max-width: 480px\) \{\s*:root \{[\s\S]*?--phone-h1: 21px;[\s\S]*?--phone-card-pad: 12px;[\s\S]*?--phone-btn-h: 32px;[\s\S]*?--phone-field-h: 34px;[\s\S]*?font-size: 14px;/);
    expect(css).toMatch(/:is\(main, \.dialog, \[role="dialog"\]\) h1 \{ font-size: var\(--phone-h1\) !important;/);
  });

  it("sizes form fields for phones; iOS focus zoom is turned off by the viewport meta instead of 16px text", () => {
    // Zoom stays allowed for everyone (accessibility); only iOS gets maximum-scale=1, which stops its focus zoom.
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1\.0" \/>/);
    expect(html).toMatch(/iP\(hone\|ad\|od\)[\s\S]*?maximum-scale=1/);
    expect(css).toMatch(/--phone-field-h: 34px;/);
    expect(css).toMatch(/select\) \{\s*height: var\(--phone-field-h\);[\s\S]*?font-size: 14px;/);
    expect(css).toMatch(/textarea \{ min-height: 56px !important; height: auto !important;[^}]*field-sizing: content;/);
  });

  it("keeps phone text at 12px or larger", () => {
    for (const [, size] of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(size)).toBeGreaterThanOrEqual(12);
  });
});
