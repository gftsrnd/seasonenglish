import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("season theme button contrast", () => {
  it.each([
    "apps/web/src/app/app.css",
    "apps/web/src/app/learner/learner.css",
    "apps/web/src/app/operator/styles.css"
  ])("keeps inline primary actions readable after hover in %s", (file) => {
    const css = readFileSync(file, "utf8");
    expect(css).toContain("button[style*=" + '"background: var(--primary)"' + "]:hover");
    expect(css).toMatch(/button\[style\*="background: var\(--primary\)"\]:hover[^}]*color:\s*var\(--primary-ink\)/s);
  });
});
