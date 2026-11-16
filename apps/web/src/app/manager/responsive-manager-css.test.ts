// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Manager phone/tablet stylesheet", () => {
  it("keeps the manager phone rules scoped and loaded once from the route controller", () => {
    const controller: string = readFileSync(new URL("./ManagerRouteController.tsx", import.meta.url), "utf8");
    const css: string = readFileSync(new URL("../responsive-manager.css", import.meta.url), "utf8");
    expect(controller.match(/responsive-manager\.css/g)).toHaveLength(1);
    expect(controller).toMatch(/className="manager-root"/);
    // Every rule inside the media queries is scoped to the manager root.
    const rules = css.split(/@media[^{]+\{/).slice(1).join("\n").split("\n").filter((line: string) => /^\s+:root/.test(line));
    expect(rules.length).toBeGreaterThan(50);
    for (const rule of rules) expect(rule).toMatch(/\.manager-root|:has\(\.manager-root\)/);
  });
});
