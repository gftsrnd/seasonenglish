# Stable Lesson Generation Quality Design

## Intent

Make one CEFR level usable without manual rescue: it may contain at most two genuinely missing extended-vocabulary fields across five days, and no learner-facing defect.

## Scope

Only the weekly lesson-generation path: canonical plan, component generation, checkpoints, targeted repair, quality admission, draft persistence, Operator status, review and publication.

## Quality contract

- A **blocking** issue is any missing required lesson/exercise part, invalid or ambiguous answer, source/question/key mismatch, invalid CEFR/language constraint, unusable grammar or pronunciation, invalid schema, or an AI finding verified by deterministic validation.
- A **light** issue is exactly one genuinely absent `word family`, `umbrella word`, or synonym/antonym relation.
- A level is ready only with zero blocking issues and at most two light issues across all five days.
- A derived, inflected, plural, or fabricated relation never counts as supplied data.

## Architecture

`LessonQualityPolicy` becomes the only classification source. Generator validation, repair selection, Operator warnings, and review/publication call it rather than reimplementing portions of its logic.

Component checkpoints remain durable. A failed component is repaired alone, up to three attempts; valid checkpointed components are never regenerated. A quality failure retains a private candidate/checkpoint and runs targeted repair. It may not overwrite an older ready draft or become reviewable/publishable until the policy passes.

The AI reviewer is advisory unless a finding names an exercise field and evidence that deterministic validation confirms. Style-only reviewer notes stay warnings.

## Explicit non-goals

- Do not weaken answer, source, CEFR, grammar, pronunciation, or required-part validation to make runs pass.
- Do not run or reset existing weeks while changing the architecture.
- Do not change Season, placement, audio, email, or unrelated UI flows.

## Decisions

- Retry budget is three total attempts for every AI-generated component and each atomic reviewer repair.
- Grammar is always required for a complete generated lesson. Classifier abstention is a generator failure to repair, not a hidden learner-facing grammar part.
- Operator can inspect a retained incomplete candidate, but it is never labelled ready or eligible for review/publication.
