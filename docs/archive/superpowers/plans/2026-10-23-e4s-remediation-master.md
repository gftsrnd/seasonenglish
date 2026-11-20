# E4S Remediation Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans`; write RED tests before implementation and use `superpowers:verification-before-completion` before any completion claim.

**Goal:** Resolve the learner-critical flow first, then Season Chat, the learning loop, and finally experience polish, with every checklist claim backed by reproducible evidence.

**Architecture:** Keep domain rules deterministic and server-enforced; treat AI output as untrusted structured input; persist workflow state in PostgreSQL; use the web client only for presentation and interaction. Execute and verify the stack only through Docker Compose inside WSL.

**Tech Stack:** TypeScript, React, Fastify, PostgreSQL, Vitest, Testing Library, Playwright, Docker Compose in WSL, Anthropic-compatible AI provider.

## 1. Approval boundary

- This document and its four child plans are planning artifacts only.
- Do not edit implementation files, run migrations, consume real AI tokens, rebuild containers, or alter local data before explicit user approval.
- Preserve all existing dirty-worktree changes. Never reset, checkout, or overwrite unrelated work.
- After approval, the main agent owns P1 core learning. Dedicated agents own Season Chat, P2, and P3 with disjoint write scopes.

## 2. Source of truth and traceability

Every checklist item must have one row in the execution evidence ledger with these fields:

1. Checklist/spec/prompt source and exact acceptance criterion.
2. Current-code evidence and identified root cause.
3. RED test name and failing output.
4. Contract/domain/database/API/UI change.
5. GREEN, regression, browser, and AI-evaluation results.
6. Final evidence: command log, API/DB assertion, screenshot or video where visual behavior matters, and AI token usage.

Primary sources:

- `E4S_CHECKLIST-TEST_22_10.xlsm` — all checklist IDs and expected behavior.
- `E4S_Placement_Assessment_Spec_v1.docx` — authoritative Placement structure, keys, rubrics, timing, and CEFR conversion.
- Prompt/test document pairs for objectives, grammar, lexical relations, exercise generation, and grading.

No item is “done” because a component exists or a screenshot looks plausible. It is done only when its acceptance tests pass in the integrated WSL Docker stack.

## 3. Dependency graph and ownership

1. **Gate 0 — Baseline and infrastructure**
   - Inventory dirty files and assign file ownership.
   - Verify an actual WSL distro and `docker compose version` from inside it.
   - Translate the repository path with `wslpath`; do not fall back to Windows Docker Desktop.
   - Capture existing focused-test results before introducing RED tests.
2. **P1A — Placement and operator approval**
   - L-022–L-036, C-018, O-005–O-007.
3. **P1B — Prompt and lesson quality**
   - A-006, A-008, A-007, A-009 in that dependency order.
4. **P1C — Learner lesson UI**
   - L-042, L-043, L-045–L-050 only after their upstream data contracts are stable.
5. **Season Chat**
   - L-052, L-054–L-056 after grading contracts are stable.
6. **P2 learning loop**
   - Weekly practice, progress, level-up, appeals, history, certificates.
7. **P3**
   - Mini games, music/theme, badges/animation, non-blocking Manager reports.

P2 may build persistence foundations after P1 contracts are frozen, but cannot change Placement or prompt contracts. P3 cannot redefine reward or readiness rules owned by P2.

## 4. Local scenario accounts and resettable fixtures

Add an idempotent, local/test-only scenario seeder rather than overloading the single demo learner. It must refuse to run outside explicit local/test mode, use deterministic IDs, document credentials, and support resetting one scenario without wiping user data.

Required scenarios:

| Scenario | Purpose |
|---|---|
| `learner-placement-new@e4s.local` | Profile complete, no attempt; full start flow |
| `learner-placement-listening@e4s.local` | Active Listening with play-count and timer state |
| `learner-placement-reading@e4s.local` | Submitted Listening, active Reading |
| `learner-placement-writing@e4s.local` | Writing drafts and under-word warnings |
| `learner-placement-speaking@e4s.local` | Recording, typed proxy, upload failure variants |
| `learner-placement-review@e4s.local` | Objective scores complete, productive skills pending review |
| `learner-placement-borderline@e4s.local` | 64.50/84.60 boundary and manual-review flags |
| `learner-lesson-b1@e4s.local` | Published B1 lesson with rich lexical/grammar data |
| `learner-lesson-attempts@e4s.local` | First wrong, exhausted, correct, appeal states |
| `learner-weekly@e4s.local` | Weekly practice and appeal flow |
| `learner-level-ready@e4s.local` | All readiness signals and level-up exam |
| `learner-history@e4s.local` | Progress history and immutable certificate |
| `operator-review@e4s.local` | Placement, lesson, weekly, and appeal queues |
| `manager-review@e4s.local` | Organisation settings and reporting |

Learners use the six-digit local PIN contract; staff use local passwords. Credentials must live in local documentation/seed code only, never in production defaults. Add `scripts/prepare-local-scenarios.ts`, a matching cleanup/reset command, integration tests for idempotence and isolation, and a generated scenario manifest showing URLs and expected starting states.

## 5. AI test budget and audit

- Hard total: **1,000,000 input + output tokens** for approved real-AI tests.
- Add an `AiTokenLedger` around provider calls and persist JSON/CSV with suite, case, provider, model, prompt version, input tokens, output tokens, cumulative tokens, latency, and result.
- Run deterministic/unit/integration tests first. Real AI runs only for prompt gold sets and narrow E2E smoke tests.
- Stop scheduling calls at 950,000 tokens, leaving a 50,000 safety reserve. Reject any call whose declared maximum could exceed 1,000,000.
- Never log API keys, request authorization headers, or learner PII.
- Prompt release gates: closed-response false-negative ≤1%, open-response false-negative ≤3%, wrong answer key ≤0.5%, ambiguous published item ≤2%, fabricated feedback 0 in reviewed sample and ≤0.5% gold set, repeatability ≥98%.

## 6. Verification tiers

1. Pure domain tests: boundaries, formulas, invariants.
2. Contract/schema tests: reject missing, contradictory, or unsafe AI output.
3. Repository/API integration tests with real PostgreSQL.
4. Web component interaction and accessibility tests.
5. Browser E2E with real DB, object storage, audio fixtures, reload/logout/restart.
6. Real-AI gold-set evaluation under the token ledger.
7. Final Docker WSL acceptance run and persistence test after container restart.

Required final commands are run inside WSL:

```bash
docker compose up --build -d
docker compose ps
node scripts/verify-local-compose.mjs
pnpm typecheck
pnpm test
pnpm --filter @e4s/web build
```

Then restart without deleting volumes and rerun scenario smoke tests. Never use `docker compose down -v` for acceptance.

## 7. Completion rule

A phase can be presented for acceptance only when:

- every scoped checklist ID has an evidence-ledger entry;
- focused and regression tests are green;
- the browser flow is demonstrated from the corresponding local scenario account;
- relevant data survives reload, logout/login, and container restart;
- AI usage is within budget and attached to the report;
- no unrelated dirty-worktree change was overwritten;
- remaining limitations and manual checks are explicit.

Child plans:

- `2026-10-23-p1-core-learning.md`
- `2026-10-23-season-chat.md`
- `2026-10-23-p2-learning-loop.md`
- `2026-10-23-p3-experience-polish.md`
