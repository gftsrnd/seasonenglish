# Season Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans`; write contract and behavior tests first.

**Goal:** Make each Season turn pedagogically correct and structurally unambiguous for L-052 and L-054–L-056.

**Architecture:** Replace the overloaded response schema with explicit evaluation, reply, next question, correction, score evidence, translations, and suggested answer. Enforce invalid-turn invariants in the server before counting progress.

## Tasks

1. Add schema RED tests for independent `evaluation`, `seasonReply`, `nextQuestion`, three rubric objects with evidence/improvement, `corrections`, `correctedText`, `suggestedAnswer`, translations, and `usedWords`.
2. Enforce invariants:
   - insufficient: does not count, meaning=0, no unlocked words;
   - off-topic: does not count, meaning≤1, no unlocked words, repeat current question;
   - valid: only state that can advance goals and unlock vocabulary.
3. Detect acknowledgement-only input such as “ok” before calling AI, while preserving short but meaningful A1 answers such as “I agree.” Store it for history but exclude it from daily/weekly/progress/reward counts.
4. Send `currentQuestion` separately to AI and persist `countsTowardGoal`; update every Season counter and reward query to filter it.
5. Add persona output validation and one repair attempt:
   - Formal: no contractions, slang, emoji, or exclamation mark.
   - Informal: short, natural contraction, exactly one emoji.
6. Version the canonical prompt; do not mutate old prompt releases. Preserve Level Challenge compatibility with an explicit mode/regression tests.
7. Rebuild `CoachPractice` into separately labeled regions: Season’s next question, evaluation of the learner’s previous answer, corrected sentence, explanation of three scores, and suggested answer to the next question; attach each translation to the correct source.
8. Add a legacy adapter so old turns remain readable without relabeling a correction as a next-answer suggestion.

## Acceptance evidence

- “ok” produces inline Vietnamese guidance, meaning 0, no AI call, no turn consumption, no reward/vocabulary unlock.
- Off-topic input has meaning≤1, displays the reason, repeats the pending question, and changes no weekly target.
- A valid short answer is not rejected merely for brevity.
- Every rubric score cites evidence from the learner sentence.
- Corrections never appear under “gợi ý trả lời tiếp”; the suggested answer always answers the displayed next question.
- Formal/Informal validators pass behavioral tests, not prompt string checks.
- Legacy history and Level Challenge remain functional.
