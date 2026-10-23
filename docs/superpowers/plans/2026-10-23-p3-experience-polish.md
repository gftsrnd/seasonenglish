# P3 Experience and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans`; do not change P1/P2 business rules.

**Goal:** Finish mini games, reliable calm background music, realtime seasonal themes, badges/animation, and non-blocking Manager reports after learner-critical flows are stable.

**Architecture:** Separate committed organisation experience from local device preference and preview state; use a lifecycle-aware media adapter with licensed local fallback; keep game scores server-validated.

## Tasks

1. Establish a music license/catalog gate. Every preset needs a verified source, license metadata, valid asset/URL, and media-manifest entry. Unverified tracks do not appear. Use the prototype repository only to identify the intended list; independently verify assets/licensing before inclusion.
2. Rebuild player lifecycle tests: no command before ready; switching destroys old source; volume changes current playback immediately; hidden tab pauses; user gesture is required for first play; YouTube errors fall back locally; TTS/listening/microphone pause and restore music correctly.
3. C-015: persist personal enabled/disabled state by device across reload and Learner/Operator/Manager account changes without organisation settings overwriting it.
4. C-010/O-033/M-018: separate committed organisation theme/music, unsaved preview, and device preference. Save emits organisation-scoped realtime events; another browser updates without refresh; reconnect/polling recovers; failed save emits nothing and preview rolls back.
5. Settings UI: compact list rather than nested cards, orange shared style for selection/slider/focus, real preview button, and clear preview-versus-save behavior.
6. L-074–L-075: topic ≤70 characters/7 words; soft-reject group topics without strike; strike only nonsense/banned content; third strike notifies Operator once; word set must contain 12 targets + 8 distractors or remain unpublished.
7. L-076–L-085: lock existing correct game mechanics with regression tests; require at least four valid POS words for Word Sort; standardize HUD/result/replay/record; confetti only for online record success; enforce B1+ Arena, one attempt per player, leaderboard formula, +50 win, and no duplicate open challenge.
8. L-019 and presentation part of L-065: one-time badge modal, reduced-motion support, no success animation for failures. Wait for P2’s shared reward policy before M-015 simulation.
9. M-013/M-014: create one canonical report-section model reused by UI, copy, text export, and print; include every section, clear empty states, organisation isolation, and print without navigation/actions.
10. Browser acceptance in Docker WSL: real audible playback, source switch, live volume, visibility pause/resume, cross-account persistence, two-browser realtime theme/music, network/YouTube fallback, and calmness/manual listening check.

## Exclusions

- C-018 belongs to P1 Placement.
- L-066 certificate and progression logic belong to P2.
- Do not fabricate a large playlist if licensing or playable assets cannot be proven.
- In-memory SSE is acceptable only for the current one-API Compose topology; multi-replica production requires shared pub/sub.
