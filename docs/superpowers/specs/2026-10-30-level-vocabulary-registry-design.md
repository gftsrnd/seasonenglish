# Level Vocabulary Registry Design

## Intent

Prevent repeated learner-facing vocabulary within one CEFR level without
asking the model to remember five lessons. A word that has already been
introduced as a target or lexical relation may still occur in an exercise
example, but may not be presented again as a vocabulary card or relation.

## Quality contract

- Primary vocabulary targets are unique across the five days of one level.
- Introduced family, synonym, antonym and umbrella terms are unique across
  the level; an occurrence in prose/examples is not a duplicate.
- An umbrella label shared by multiple targets in one lesson is one group,
  rendered once, rather than a chip repeated on every target card.
- Duplicate lexical metadata is a blocking vocabulary finding and only that
  vocabulary component may be repaired.

## Architecture

The API derives a canonical registry from vocabulary part data, both from
retained lessons during a repair and from newly generated candidates. The
registry is deterministic and keyed by normalized English lexical words.
Generation validates candidate vocabulary against the retained registry and
against accepted candidate days before a draft can pass the quality gate.

The API also writes a `groups` projection beside vocabulary `items` when it
builds a lesson. Each group owns one umbrella label and the target words it
contains. Operator and Learner render that projection identically; legacy
lessons without `groups` derive the same projection at read time.

## Non-goals

- Do not ban ordinary reuse inside examples, reading passages or exercises.
- Do not require a precomputed 75-word dictionary or serialize five-level
  batch generation.
- Do not alter CEFR, answer, audio, email or non-lesson flows.
