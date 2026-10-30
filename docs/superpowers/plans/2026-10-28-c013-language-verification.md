# C-013 Language Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and, only if needed, repair lesson-language behavior for A1-A2 versus B1+ on the current local build.

**Architecture:** Validate the shared learner-language decision at component and generated-content boundaries. Preserve Vietnamese vocabulary meanings at every level while switching lesson framing/guidance at B1+.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, local API/UI smoke testing.

**Spec:** C-013 from the round-5 checklist and the accepted rule: A1-A2 Vietnamese framing/guidance; B1+ English framing/guidance; vocabulary meanings Vietnamese.

## Global Constraints

- Do not classify English lesson content itself as a language leak.
- Do not translate Vietnamese vocabulary meanings at B1+.
- Verify current behavior before modifying production code.

## Review Focus

- A2 and B1 boundary behavior.
- Missing/unknown CEFR fallback.
- Existing lessons persisted before the shared-language change.
- AI-generated instructions that conflict with the display language.
- Vocabulary meaning labels at B1, B2, and C1.

---

### Task 1: Automated boundary verification

**Files:**
- Verify/modify if failing: `apps/web/src/app/learner/Learning.test.tsx`
- Verify/modify if failing: shared learner-language helpers and tests.

- [ ] Run existing C-013-focused tests and identify exact covered levels and labels.
- [ ] Add missing A2/B1 boundary tests before any production repair and confirm new tests fail only if behavior is incomplete.
- [ ] Make the minimum repair if a test exposes a real gap.
- [ ] Run the complete learner lesson test file and Web typecheck.

### Task 2: Current local evidence

- [ ] Inspect one current A2 lesson and one current B1 lesson on local.
- [ ] Verify headings, guidance, exercise labels, and vocabulary meanings against C-013.
- [ ] Report each criterion as Pass, Fail, or Not testable with captured evidence; do not mark C-013 complete from code inspection alone.

