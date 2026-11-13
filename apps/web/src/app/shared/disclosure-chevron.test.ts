import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest executes this guard in Node; the web project omits Node ambient types.
import { readdirSync, readFileSync, statSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), "utf8");

function walk(dir: URL, found: URL[] = []): URL[] {
  for (const name of readdirSync(dir) as string[]) {
    const child = new URL(`${name}${statSync(new URL(name, dir)).isDirectory() ? "/" : ""}`, dir);
    if (statSync(child).isDirectory()) walk(child, found);
    else found.push(child);
  }
  return found;
}

describe("disclosure chevrons", () => {
  const files = walk(root);
  const stylesheets = files.filter((file) => file.pathname.endsWith(".css"));

  it("no stylesheet draws a disclosure marker from a text glyph", () => {
    const offenders: string[] = [];
    for (const path of stylesheets) {
      const css = readFileSync(path, "utf8");
      for (const match of css.matchAll(/content\s*:\s*(["'])([^"']*)\1/g)) {
        const value = (match[2] ?? "").trim().toLowerCase();
        if (value === "v" || value === "^" || /^\\(?:25[bc][0-9a-f]|2304|2303|203a|2c4|2c5)/.test(value) || /^[▾▴▸▹▼▲►◂⌄⌃›˅˄>]$/.test(value)) offenders.push(`${path.pathname}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no component renders a chevron as a text glyph", () => {
    const offenders: string[] = [];
    for (const path of files.filter((file) => file.pathname.endsWith(".tsx") && !/\.test\./.test(file.pathname))) {
      const source = readFileSync(path, "utf8");
      if (/aria-hidden="true">\s*[▾▴▸▼▲▶⌄⌃›v^]\s*<\//.test(source) || /\?\s*"[▼▲▾▴]"\s*:\s*"[▶▸▾▴]"/.test(source)) offenders.push(path.pathname);
    }
    expect(offenders).toEqual([]);
  });

  it("the shared chevron is drawn from one mask and centred on the cross axis of its row", () => {
    const css = read("app/app.css");
    const rule = css.match(/\.ui-chevron,[\s\S]*?\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(rule).toMatch(/content:\s*""/);
    expect(rule).toMatch(/align-self:\s*center/);
    expect(rule).toMatch(/margin-block:\s*auto/);
    expect(rule).toMatch(/mask:\s*var\(--ui-chevron-mask\)/);
    expect(css).toMatch(/\.ui-chevron--right[\s\S]*?\{transform:rotate\(-90deg\)\}/);
    expect(css).toMatch(/\[aria-expanded="true"\] > \.ui-chevron:not\(\.ui-chevron--right\)\{transform:rotate\(180deg\)\}/);
  });
});
