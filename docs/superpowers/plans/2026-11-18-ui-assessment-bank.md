# E4S UI and assessment banks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track completion below and in the plan ledger.

**Goal:** Implement approved UI fixes and flexible assessment banks on 4300 while preserving historical exams.
**Architecture:** Reuse existing React, Fastify, PostgreSQL assessment versions and scoring. Separate independent UI domains; new bank policy/provenance persisted server-side and consumed by runtime and review. Keep monthly unchanged.
**Tech Stack:** TypeScript, React, Fastify, PostgreSQL, Vitest, Playwright, Docker Compose e4s-dev.
**Spec:** docs/superpowers/specs/2026-11-18-ui-assessment-bank.md

## Global Constraints
- 4300 only; never touch 4175 data/deployment. Arena deferred.
- No random toggle, flexible selected source count/forms, explicit confirmation, default single.
- Immutable source versions and attempt provenance, archive used versions, no age expiry.
- Monthly no mixing/shuffle. Three initial forms not a cap.
- Preserve permissions, scoring maxima, exam eligibility and legacy sessions.

## Review Focus
- Incompatible sources or dependent question numbering: reject mixing or keep order.
- Refresh, concurrent starts and archive during an active exam: same delivered definition.
- Cross-organization source ids and answer keys: enforce authorization and redact keys.
- Missing audio/AI/assets: retain drafts, actionable errors, no fake successful exams.
- Old profile/avatar/certificate/guide: backward compatible data and correct empty states.

## Tasks
- [x] T1 Avatar/certificate data and shared presentation: ProfileReward.tsx, AppShell.tsx, CertificateDocument.tsx, contracts/session/avatar API; focused persistence and preview checks.
- [x] T2 Shared overflow/dialog/crossword/pending presentation plus request forms/guide: learner/responsive/operator/games CSS, Settings.tsx, app-guide-steps.ts, related API; focused responsive and removal checks.
- [x] T3 Assessment banks, mixing, immutable provenance and lifecycle: new migration, database/domain bank module, assessment-bank-routes.ts, routes.ts runtime integration; unit + DB/API lifecycle checks before UI.
- [x] T4 Bank management UI and client contracts: per-scope bank list, create/edit/publish/archive, modal delivery policy and source selection, initial inventory guidance; focused UI policy tests.
- [x] T5 Dialogue TTS root cause/cache/manual/automatic: dialogue-tts.ts, listening-audio.ts, route caller, focused speaker and cache checks.
- [x] T6 Integration review, regression suite/build and 4300-only deployment/browser checks; record evidence and remaining limitations.

Each nontrivial task writes and runs a failing test first, implements minimally, runs focused tests, self-reviews and reports exact files/results. Shared file overlaps are serialized by the controller.
