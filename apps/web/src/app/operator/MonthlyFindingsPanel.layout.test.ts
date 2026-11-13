// @ts-expect-error Vitest runs this file in Node, while the web tsconfig omits @types/node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("findings layout CSS: the section label never wraps word by word (13/11)", () => {
  it("CSS keeps the label rigid and lets only the message wrap", () => {
    expect(css).toMatch(/\.operator-monthly-finding-label\s*\{[^}]*flex:\s*none[^}]*white-space:\s*nowrap/u);
    expect(css).toMatch(/\.operator-monthly-finding-where\s*\{[^}]*flex:\s*none[^}]*white-space:\s*nowrap/u);
    expect(css).toMatch(/\.operator-monthly-finding-text\s*\{[^}]*flex:\s*1 1 14em[^}]*min-width:\s*0/u);
    expect(css).toMatch(/\.operator-monthly-findings-list > li\s*\{[^}]*flex-wrap:\s*wrap/u);
    // Buttons are inline-flex app-wide: the editor item and the collapsed first line override it.
    expect(css).toMatch(/\.operator-modal-scope button\.operator-editor-finding-item\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap[^}]*justify-content:\s*flex-start/u);
    expect(css).toMatch(/\.operator-modal-scope button\.operator-editor-findings-first\s*\{[^}]*display:\s*block/u);
  });
});
