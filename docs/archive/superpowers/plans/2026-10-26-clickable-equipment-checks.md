# Clickable Equipment Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Headphones and Micro device cards trigger the same checks as their adjacent text buttons.

**Architecture:** Reuse the existing `checkSound` and `checkMicrophoneForTest` callbacks and shared equipment state. Replace non-interactive card spans with semantic buttons, preserving current layout, status text, and assessment start behavior.

**Tech Stack:** React, TypeScript, Testing Library, Vitest, CSS

**Spec:** `docs/superpowers/specs/2026-10-26-clickable-equipment-checks-design.md`

## Global Constraints

- Keep both existing text buttons.
- Preserve the exact current visual shape of the Headphones and Micro cards.
- Do not introduce new equipment state or assessment-start gating.
- Run only the focused `Assessment` component tests requested by the user.

## Review Focus

- Headphones card click starts the packaged sound check once.
- Micro card click requests microphone access once.
- Keyboard-accessible card names remain distinct from the text buttons.
- Micro card cannot start a duplicate check while one is active.
- Existing text buttons retain their current behavior and status updates.

---

### Task 1: Clickable device cards

**Files:**
- Modify: `apps/web/src/app/learner/Assessment.tsx`
- Modify: `apps/web/src/app/learner/Assessment.test.tsx`
- Modify: `apps/web/src/app/learner/learner.css`

**Interfaces:**
- Consumes: existing `checkSound(): void` and `checkMicrophoneForTest(): Promise<void>` callbacks.
- Produces: semantic card buttons with accessible names `Thử tai nghe` and `Thử micro`.

- [ ] **Step 1: Write failing focused tests**

Add assertions that clicking each card invokes the same underlying behavior as its text button, and that the micro card is disabled while checking.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run apps/web/src/app/learner/Assessment.test.tsx -t "device card"`

Expected: FAIL because the current cards are non-interactive spans.

- [ ] **Step 3: Implement semantic card buttons**

Use `type="button"`, the existing callbacks, `aria-label`, existing `data-equipment` hooks, and `disabled={checkingMicrophone}` for the Micro card. Add focused CSS resets so the button cards retain the current visual layout and gain a visible focus state.

- [ ] **Step 4: Verify GREEN with focused tests**

Run: `pnpm exec vitest run apps/web/src/app/learner/Assessment.test.tsx`

Expected: all tests in the focused component file PASS.

- [ ] **Step 5: Commit**

Commit only the component, component test, CSS, and this plan.
