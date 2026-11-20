# Game Reliability and Visual Pass Design

## Intent

Make the six vocabulary games reliably playable from real learner word sets, then improve their visual hierarchy without replacing the current seasonal artwork or changing their scoring rules.

## Goals

- Do not offer a game when the active word set cannot produce a valid round.
- Keep tutorial goals and rules consistent with the round actually created.
- Make keyboard, touch, and assistive-technology controls complete and scoped to the active game.
- Give every game a clear clue area, play area, progress area, and feedback state.

## Non-goals

- No new game type, external asset pack, scoring model, or arena rule.
- No replacement of the existing seasonal SVG artwork.
- No IPA or pronunciation-provider integration in this pass.

## Constraints

- Existing React, Lucide SVG icons, CSS variables, game contracts, and deterministic attempt seed remain the foundation.
- Every behavior change starts with a failing regression test.
- A game unavailable for the current word set stays visible but disabled with a plain-language reason.

## Approach

Three approaches were considered: visual-only changes, rewriting all engines, and a staged reliability-first pass. Visual-only work would preserve known blockers; a rewrite would unnecessarily risk scoring and arena behavior. The selected staged pass fixes availability and rule truth first, engine controls second, and visual hierarchy third.

## Accepted direction

The learner keeps the same six games and seasonal identity. The hub communicates which games are ready. Tutorials derive counts from the real round. Individual screens become more lively through purposeful SVG icons, stronger grouping, progress surfaces, and clearer feedback rather than adding decorative text.
