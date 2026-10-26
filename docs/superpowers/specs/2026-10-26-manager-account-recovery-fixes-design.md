# Manager account recovery fixes

## Scope

- Do not show a pending deletion request after its learner account has already been permanently purged. Preserve the audit event for history.
- Keep transparent login links readable in every seasonal theme by using a foreground token intended for text on a light background.
- Let an Operator report a forgotten password from the staff login screen. The public endpoint returns the same response for every valid email, creates at most one open Manager notification for an active Operator, and exposes that notification through the existing Manager security-notification list.

## Behaviour

The staff recovery form accepts an email and confirms only that the request was received. It never reveals whether an account exists. Repeated requests for the same active Operator reuse the existing open notification. Managers continue to reset credentials through the existing account-management workflow.

Deletion requests whose subject is `purged` are excluded from the actionable request list. Historical audit rows remain untouched.

## Verification

Add API integration coverage for purged deletion requests and deduplicated Operator password-help reports, UI coverage for the staff recovery form, and a CSS regression guard for seasonal hover text. Run focused tests, typecheck, and production build.
