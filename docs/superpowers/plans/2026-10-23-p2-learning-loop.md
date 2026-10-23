# P2 Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans`; protect persistence and scoring with RED integration tests.

**Goal:** Complete weekly practice, appeals, progress/readiness, level-up, history, and certificates without redefining P1 or Season contracts.

**Architecture:** Centralize progression rules in pure domain functions, add idempotent persistence constraints and immutable snapshots, and make all Operator actions transactional and audited.

## Tasks

1. Add domain RED tests for CEFR-specific weekly-practice validation, 40/30/30 scoring, off-topic cap 30, readiness from configured thresholds, exam pass rule, retry plan, and next-effective-Monday using the organisation timezone.
2. Add persistence constraints/snapshots: one weekly submission per learner/week, prompt/CEFR/vocabulary snapshot, reward-event business keys, retry plans, scheduled level changes, and immutable certificate issuance.
3. L-057–L-060: enforce A1/A2, B1, and B2+ form rules server-side; recalculate AI totals; preserve a zero score; expose historical weeks; queue manual review when AI fails.
4. L-061/O-022–O-024: include weekly appeals in Operator Review; one appeal only; require new 0–100 score when accepted and explanation when resolved; update appeal, score source, reviewer, audit event, and learner-visible result in one transaction.
5. L-063–L-065: reward ledger is the only total source; weekly practice +15, full-week bonus +20 exactly once, level challenge +0; histories remain isolated across accounts.
6. L-068–L-069/O-032: use one readiness calculator and all eight organisation thresholds in a single window; API—not only UI—blocks ineligible/C1/pending/active learners and selects a published form for the exact target CEFR.
7. L-070–L-071/O-027: exam passes only at total≥70 and every skill≥50%; only then open a single six-turn challenge; challenge passes at average≥3.5 and off-topic≤1 and grants no reward.
8. L-072–L-073/O-012: persist 14-day retry plans and weak-skill evidence; Operator approval schedules—not immediately applies—the level for the next Monday; preserve current-week content and audit from/to/date/reviewer/reason/evidence.
9. L-066: issue one immutable certificate with code/date/level/badge/name/signature snapshot and verify one-page A4 landscape PDF with Playwright.
10. Run a real-DB Docker WSL E2E: weekly submission → AI failure/manual score → one appeal → updated result → readiness → level exam → challenge → Operator approval → Monday activation → history/certificate after restart.

## Coordination limits

- Do not restore “Bài siêu ngắn” in any role.
- P1 owns assessment contracts; Season owns normal coach turns; P2 owns challenge context and reward exclusion only.
- P3 owns badge/confetti presentation, not reward/readiness policy.
- Organisation timezone must be explicitly chosen/configured before implementing Monday activation.
