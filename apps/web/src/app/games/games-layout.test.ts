// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { readFileSync } from "node:fs";
// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(fileURLToPath(new URL("./games.css", import.meta.url)), "utf8");

const shellStylesheet = readFileSync(fileURLToPath(new URL("../shared/shared.css", import.meta.url)), "utf8");

const responsiveStylesheet = readFileSync(fileURLToPath(new URL("../responsive-learner.css", import.meta.url)), "utf8");

describe("game surface layout guardrails", () => {
  it("allows the Typing scene and keyboard tracks to shrink at narrow viewport widths", () => {
    expect(stylesheet).toMatch(/\.typing-scene\s*\{[^}]*min-width:\s*0\b[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    expect(stylesheet).toMatch(/\.virtual-keyboard\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  });

  it("lets the full game topic wrap above the controls on narrow phones", () => {
    expect(responsiveStylesheet).toMatch(/\.game-running-header h1\s*\{[^}]*max-width:\s*100%[^}]*overflow-wrap:\s*anywhere[^}]*white-space:\s*normal/s);
    expect(responsiveStylesheet).toMatch(/@media \(max-width: 480px\)\s*\{\s*[^{}]*\.game-running-header\s*\{[^}]*flex-wrap:\s*wrap[^}]*\}\s*[^{}]*\.game-running-header > div:first-child\s*\{[^}]*flex-basis:\s*100%/s);
  });

  it("reserves the same safe bottom-nav clearance for the hub and every game route", () => {
    // The compact shell now gives the bottom nav its own row (main scrolls above it), so game routes no longer
    // carry their own overlay padding; the shared shell is the single source of the clearance.
    expect(shellStylesheet).toMatch(/body:has\(nav\.bottomnav\) > #root > main\s*\{[^}]*overflow-y:\s*auto !important/s);
    expect(shellStylesheet).toMatch(/body:has\(nav\.bottomnav\) > #root > \.bottomnav\s*\{[^}]*position:\s*static !important[^}]*padding-block:\s*4px calc\(4px \+ env\(safe-area-inset-bottom, 0px\)\)/s);
    expect(stylesheet).not.toMatch(/padding-bottom:\s*calc\(128px/);
  });

  it("keeps Season-rio controls out of the vocabulary modal layer", () => {
    expect(stylesheet).toMatch(/\.rio-scene:has\(\.rio-quiz\) \.mario-controls\s*\{[^}]*visibility:\s*hidden/s);
  });

  it("keeps the Season catch prompt opaque so falling labels cannot show through it", () => {
    expect(stylesheet).toMatch(/\.catch-prompt\s*\{[^}]*background:\s*var\(--surface\)/s);
  });

  it("keeps game controls touch-safe and separates active content from mobile navigation", () => {
    expect(shellStylesheet).toMatch(/body:has\(nav\.bottomnav\) > #root > \.bottomnav\s*\{[^}]*position:\s*static !important/s);
    expect(stylesheet).toMatch(/\.game-runner\s*\{[^}]*gap:\s*16px/s);
    expect(stylesheet).toMatch(/\.game-runner button\s*\{[^}]*min-height:\s*44px/s);
    expect(stylesheet).toMatch(/\.virtual-keyboard button\s*\{[^}]*min-height:\s*44px/s);
    expect(stylesheet).toMatch(/\.app-learner-page\.games-page \.game-tile\s*\{[^}]*gap:\s*8px/s);
    expect(stylesheet).toMatch(/\.app-learner-page\.game-page\s*>\s*\.page-title\s*\{[^}]*margin-bottom:\s*18px\s*!important/s);
    expect(stylesheet).toMatch(/\.app-learner-page\.games-page \.btn-sm,[\s\n]*\.app-learner-page\.game-page \.btn-sm\s*\{[^}]*min-height:\s*44px\s*!important/s);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*720px\)[\s\S]*?\.typing-scene\s*\{[^}]*padding:\s*14px\s+12px/s);
  });

  it("centres a single, bounded Typing race backspace key instead of a full-width Enter/backspace pair", () => {
    expect(stylesheet).toMatch(/\.keyboard-row\s*\{[^}]*justify-content:\s*center/s);
    expect(stylesheet).toMatch(/\.keyboard-row--actions button\.is-backspace\s*\{[^}]*flex:\s*0 1 180px/s);
    expect(stylesheet).not.toMatch(/\.is-enter/);
  });

  it("disables failure and loading animation when reduced motion is requested", () => {
    expect(stylesheet).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.game-ending span,[\s\S]*?\.game-ending \.dino \.jaw[\s\S]*?animation:\s*none/s);
  });
});
