# Pilot Fixtures And AI Test Mode Design

## Intent

Make acceptance tests O-013, O-016, L-016, L-017, M-004, M-010, C-021 and L-033 reproducible without editing the database by hand.

## Scope

- The active program remains the single source of truth for pilot start date and week count. Saving a larger pilot creates missing week placeholders so both Weekly Topics and Lesson Matrix expose every configured week.
- Local scenario preparation supplies one learner inactive for at least two days and one learner with consecutive activity spanning a weekend. Re-running preparation must not duplicate evidence.
- Manager Settings includes an organization-scoped AI test switch. When disabled for testing, all organization AI runner lookups return unavailable and capability responses show AI unavailable while preserving the saved provider credential.
- Two Vietnamese DOCX guides document the fixture accounts and the no-AI test flow after implementation is verified.

## Approaches

- Chosen: persist `aiTestDisabled` in the existing organization settings JSON and enforce it in the organization runner factory. This is organization-scoped, reversible, auditable through the existing settings save, and requires no credential deletion.
- Rejected: deleting or blanking the API key. This is destructive and does not test a recoverable outage.
- Rejected: browser-only toggle. It would hide buttons but API calls could still reach AI.

## Constraints

- No Docker Desktop; local verification uses the configured WSL Docker Engine.
- Existing provider secrets never leave the API and are not altered by the switch.
- Existing weeks and lessons are preserved when pilot length changes.
- Test data uses deterministic local scenario accounts only.

