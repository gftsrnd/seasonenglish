# Learner-Priority Remediation Design

## Intent

Resolve checklist findings in learner journey order. Work stays on `codex/deploy-web-fallback`; each priority group is verified and reported before the next group starts.

## Priority order

1. P0 identity and access safety.
2. P1 placement assessment and level approval.
3. P1 lesson quality and AI prompt contracts.
4. P1 lesson completion and Season practice.
5. P2 weekly practice, progress, and level-up.
6. P3 games and visual polish.

## P0 scope

- Independent browser sessions must not replace each other.
- Learners, operators, and managers may access only routes and APIs allowed by their persisted account role.
- Registration email uniqueness is case-insensitive, including deleted accounts.
- Learner onboarding must start with the authenticated account's display name and email; another account's local draft must not override them.
- Existing valid behavior is retained. Findings already fixed in code are closed by focused regression evidence instead of duplicate implementation.

## Working rules

- Use the checklist acceptance criteria as the source of truth.
- Run only focused tests for the files and paths touched by the current priority group.
- Do not start the next priority group until the current group has a result report and the user releases the hold.
- P1 lesson-quality work requires a separate design review because the supplied prompts still contain contract conflicts and missing validators.

## Considered approaches

- Rewrite authentication: rejected because the current opaque-cookie and server-side role-guard architecture already matches the intended security model.
- UI-only redirects: rejected because they do not protect APIs.
- Verify current server controls, add missing regression coverage, then repair only reproducible gaps: selected because it is the smallest safe change and preserves working behavior.
