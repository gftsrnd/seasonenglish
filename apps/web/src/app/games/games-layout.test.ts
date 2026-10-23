// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { readFileSync } from "node:fs";
// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(fileURLToPath(new URL("./games.css", import.meta.url)), "utf8");

describe("game surface layout guardrails", () => {
  it("reserves the same safe bottom-nav clearance for the hub and every game route", () => {
    expect(stylesheet).toMatch(
      /\.app-learner-page\.game-page,\s*\.app-learner-page\.games-page\s*\{[^}]*padding-bottom:\s*calc\(128px\s*\+\s*env\(safe-area-inset-bottom\)\)/s
    );
  });

  it("keeps Season-rio controls out of the vocabulary modal layer", () => {
    expect(stylesheet).toMatch(/\.rio-scene:has\(\.rio-quiz\) \.mario-controls\s*\{[^}]*visibility:\s*hidden/s);
  });

  it("keeps the Season catch prompt opaque so falling labels cannot show through it", () => {
    expect(stylesheet).toMatch(/\.catch-prompt\s*\{[^}]*background:\s*var\(--surface\)/s);
  });

  it("keeps game controls touch-safe and separates active content from mobile navigation", () => {
    expect(stylesheet).toMatch(
      /\.app-learner-page\.game-page,\s*\.app-learner-page\.games-page\s*\{[^}]*padding-bottom:\s*calc\(128px\s*\+\s*env\(safe-area-inset-bottom\)\)/s,
    );
    expect(stylesheet).toMatch(/\.game-runner\s*\{[^}]*gap:\s*16px/s);
    expect(stylesheet).toMatch(/\.game-runner button\s*\{[^}]*min-height:\s*44px/s);
    expect(stylesheet).toMatch(/\.virtual-keyboard button\s*\{[^}]*min-height:\s*44px/s);
    expect(stylesheet).toMatch(/\.app-learner-page\.games-page \.game-tile\s*\{[^}]*gap:\s*8px/s);
    expect(stylesheet).toMatch(/\.app-learner-page\.game-page\s*>\s*\.page-title\s*\{[^}]*margin-bottom:\s*18px\s*!important/s);
    expect(stylesheet).toMatch(/\.app-learner-page\.games-page \.btn-sm,[\s\n]*\.app-learner-page\.game-page \.btn-sm\s*\{[^}]*min-height:\s*44px\s*!important/s);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*720px\)[\s\S]*?\.typing-scene\s*\{[^}]*padding:\s*14px\s+12px/s);
  });

  it("disables failure and loading animation when reduced motion is requested", () => {
    expect(stylesheet).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.game-ending span,[\s\S]*?\.game-ending \.dino \.jaw[\s\S]*?animation:\s*none/s);
  });
});
