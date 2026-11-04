// @ts-expect-error Vitest executes this stylesheet contract in Node; the web project omits Node ambient types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sharedCss = readFileSync(new URL("./app.css", import.meta.url), "utf8");
const learnerCss = readFileSync(new URL("./learner/learner.css", import.meta.url), "utf8");
const settingsCss = readFileSync(new URL("./settings/settings.css", import.meta.url), "utf8");

function rule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("neutral card surface contract", () => {
  it("does not use a decorative coloured rail for neutral task, notice, hero, or feedback cards", () => {
    for (const [css, selector] of [
      [globalCss, ".primary-task"],
      [globalCss, ".micro-card"],
      [globalCss, ".coach-feedback"],
      [globalCss, ".assessment-stimulus"],
      [globalCss, ".manager-operator-preview"],
      [sharedCss, ".correction"],
      [sharedCss, ".hero"],
      [sharedCss, ".banner.info"],
      [learnerCss, ".correction"],
      [learnerCss, ".hero"],
      [learnerCss, ".banner.info"],
      [settingsCss, ".settings-page .banner.info"]
    ] as const) {
      expect(rule(css, selector), selector).not.toMatch(/border-(left|inline-start)\s*:/);
    }
  });
});
