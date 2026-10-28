# AI quality and pronunciation generation design

## Intent

Acceptance extensions for C-021; A-006, A-007, A-008, A-009; L-052, L-053, L-054, L-055; A-024, A-025, A-026, A-027, A-028, A-029; A-044, A-045, A-047, A-049; O-017, O-018, O-026; I-093, I-104.

Keep the accepted lesson-generation path usable when AI is unavailable or returns a partial result, while tightening generated lesson quality incrementally and preventing pronunciation target errors.

## Decisions

- The current generation behavior is the `baseline` profile and remains the default.
- `strict` is an explicit, reversible opt-in profile. It adds deterministic local checks and repairs; it does not replace the baseline prompt, schemas, or fallback behavior.
- Fatal schema, empty, unsafe, or severely wrong-level results remain publication blockers. Optional fields and minor formatting issues warn; recoverable component failures preserve valid components and are surfaced in generation diagnostics.
- Pronunciation target selection uses a small curated IPA mapping. A selected word is accepted only when its mapped IPA contains the exact target phoneme. Known cases such as `slipped /slɪpt/` are covered.
- Pronunciation content keeps the existing `phonemeAudioUrl` and `wordAudioUrls` names. `phonemeAudioUrl` points only to a curated phoneme clip; each `wordAudioUrls[index]` points to the corresponding whole-word clip. No generated audio may be TTS of an IPA string.

### Agent 2 contract

The pronunciation part remains a normal lesson part. Its content is:

```json
{
  "focus": "/d/",
  "tip": "...",
  "words": [{"word": "called", "ipa": "/kɔːld/"}],
  "phonemeAudioId": "phoneme-d",
  "phonemeAudioUrl": "/media/audio/phonemes/d.wav",
  "wordAudioUrls": ["/media/audio/words/called.mp3"]
}
```

`wordAudioUrls` is aligned by index with the complete `words` array (three entries in generated lessons). The phoneme URL and word URLs are different namespaces and must never be substituted for one another. If the target check fails, the generator omits both audio URL fields and retains the existing pronunciation section/fallback behavior.

## Rollback

Set `qualityProfile` to `baseline` (the default) at the generation call site, or remove the strict option from a caller. Existing prompts/schemas remain unchanged and generated output remains backward compatible. If an already-generated strict lesson is unsuitable, retire/revert its lesson-set version through the existing content version workflow; no database migration is required.

## Non-goals

- No database/storage migrations.
- No learner/operator layout changes.
- No full Kaikki dataset or dynamic external dictionary dependency.
