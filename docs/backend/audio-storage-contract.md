# Audio storage contract

This contract covers C-020, C-024, C-026, O-004, O-036, M-008 and the storage portions of L-030, L-031, L-032, L-047, L-060, A-012, A-023 and A-032.

The existing `POST /api/v1/files/assessment-audio` route remains compatible with callers that send only `file`. It now accepts these optional multipart fields:

- `sourceFlow`: `placement` (default), `daily_lesson`, `weekly_practice`, or `season`.
- `sourceEntityId`: UUID for the attempt, lesson/part submission, weekly submission, Season session/turn, or other owning flow record.
- `taskKey` and `questionKey`: flow-local identifiers.
- `transcript`: server-persisted transcript when available.

The response keeps `artifactKey` and adds `fileId`, `mimeType`, `sizeBytes`, `sha256`, the linkage fields, `transcript`, `completedAt`, `gradedAt`, `retentionUntil`, `cleanupEligible`, `deletedAt`, and `deletedBy`. Uploaded bytes and the original MIME type are sent to the private `e4s-evidence` bucket.

Playback is available at `GET /api/v1/files/assessment-audio/read?artifactKey=...`. Learners can read only their own file. Operators and Managers can read files owned by learners in their organization. The response preserves `url` and `expiresAt`, and also returns `signedUrl` plus the metadata above. Deleted files return metadata and transcript with `signedUrl`/`url` set to `null`.

For the non-placement flows, the lifecycle calls are:

- `POST /api/v1/files/assessment-audio/:fileId/complete` with optional `{ "transcript": "..." }`; learner-owned or same-organization staff-authorized. This records completion and makes the file eligible 60 days later.
- `POST /api/v1/files/assessment-audio/:fileId/grade` with optional transcript; Operator/Manager only. This records grading and resets the 60-day eligibility window from the grading event.
- `GET /api/v1/files/assessment-audio?learnerId=...&sourceFlow=...`; Operator/Manager only. Both filters are optional and the response is `{ items: [...] }` with signed playback metadata.

Coach/Season and weekly-practice callers may include the upload response (or its compatible subset) as an `audio` JSON field:

- `POST /api/v1/coach/messages` accepts `{ requestId, message, audio }`. The learner turn is stored in `coach_turns`, the file is linked with `sourceFlow: "season"` and the generated turn UUID as `sourceEntityId`, and the returned `CoachView.messages[].audioArtifact` includes `fileId`, `artifactKey`, `signedUrl`, `expiresAt`, `createdAt`, `mimeType`, `sizeBytes`, `transcript`, `retentionUntil`, `cleanupEligible`, `deletedAt`, and `deletedBy`.
- `POST /api/v1/engagement/practice/submit` accepts `{ requestId, text, audio }`. The submission content retains the audio reference, the file is linked with `sourceFlow: "weekly_practice"`, `sourceEntityId` equal to the submission UUID, and `taskKey: "weekly_practice"`; `submission.audioArtifact` returns the same metadata shape.

The `audio` field requires `artifactKey` and accepts optional `fileId`, `signedUrl`, `expiresAt`, `createdAt`, `mimeType`, `sizeBytes`, `transcript`, `retentionUntil`, `cleanupEligible`, `deletedAt`, and `deletedBy`. Placement and daily-lesson upload/read callers can continue sending only `file` and using `artifactKey`, `url`, and `expiresAt`.

Deletion is two-step: `POST /api/v1/files/assessment-audio/:fileId/delete-confirmation`, then `DELETE /api/v1/files/assessment-audio/:fileId` with `{ "confirmationToken": "..." }`. The token expires after 10 minutes. Deletion removes only the object, marks the file as deleted, retains the file row/transcript and the linked flow score/feedback, and writes an `audio_object_deleted` audit event with actor and timestamp.

The migration revokes table, sequence, and function access from `PUBLIC`, `anon`, and `authenticated` where those Supabase roles exist, and enables RLS on sensitive storage/evidence and identity tables. The API continues to work through its owning/bypass-capable backend database role; no browser or anon credential is used.

Supabase dashboard / object-store setting that cannot be enforced by this repository migration: keep the S3/Supabase Storage evidence bucket private and deny anonymous `GetObject`/`ListBucket`. The application only exposes server-generated short-lived signed URLs. Provider credentials remain server-side environment variables and must not be configured in the web app.
