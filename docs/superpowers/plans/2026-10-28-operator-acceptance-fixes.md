# Operator Acceptance Fixes Implementation Plan

**Goal:** Close the confirmed Operator acceptance gaps without changing the local web port (4175) or undoing existing work.

## Task 1: Duyệt mức data integrity

- Add failing contract/controller/repository coverage for pending appeal counts and review flags.
- Return the pending appeal count from the assessment overview instead of hard-coding zero.
- Carry review flags through contracts, adapters, and pending learner cards.
- Add regression coverage that blank rejection/demotion reasons never mutate state.

## Task 2: Bài tuần review correctness

- Add failing tests for resolved lesson-part appeals, weighted manual scoring, and the newest 40 Coach turns.
- Return accepted/rejected appeal outcomes and explanations to learners.
- Limit Coach review history to 40.
- Preserve the user's explicit removal of raw checkboxes; use compact action/status controls for persisted review state.

## Task 3: Operator settings constraints

- Add failing UI/API tests for Monday-only pilot start dates and Coach limits 1–200.
- Apply the same validation in the UI, API, and runtime database queries.
- Keep existing working threshold and permission behavior covered.

## Task 4: Topics and lessons

- Confirm the remaining O-013–O-021 root causes.
- Add focused failing tests before each production fix.
- Preserve the last published learner content while drafts are regenerated or edited.

## Task 5: Verification and local handoff

- Run focused web and API tests after each group.
- Run typecheck and production build.
- Restart only the API/web process if necessary, preserving `127.0.0.1:4175`.
