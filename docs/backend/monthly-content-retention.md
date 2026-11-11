# Monthly content retention

The organization system date determines the previous, current and next months. Operator content reads outside that window are unavailable. Learners can finish a published lesson from the previous month while it remains in the window, subject to its existing access rules. The Manager-only retention plan lists older months and counts their content and pending appeal dependencies.

A purge needs its own reviewed data migration and execution procedure. The current foreign keys tie lesson progress and appeals to lesson identities and tie exam attempts to assessment versions. Published lesson-set versions also have an immutability trigger. Dropping a framework or deleting a version in bulk can remove appeals, fail on foreign keys, or change historical reports.

- Keep month, lesson, and exam identity and scheduling facts used by reporting. Keep attendance and progress records, scores, results, level-up history, and request and audit logs.
- Before removing question payloads, preserve the source version, question, choices, answer key, learner answer, grade, and relevant audio or attachment reference for each pending appeal. Old part-level appeals use the lesson and part code. Exercise appeals also identify the exact version.
- Verify the preservation and removal plan against a disposable database, including a prior-month submission across the boundary, a pending appeal, a resolved appeal, an exam result, and a progress report. Recheck pending dependencies in the same transaction as any future payload removal, and persist the affected month and record counts in the audit log.
- Verify object references independently before removing generated files. Confirm each object is outside the retained window and is neither shared by in-window content nor used by pending appeal evidence.

## Disposable database rehearsal

`previewExpiredMonthCompaction` builds a manifest for one organization and expired month. Each change names its record type, ID, and before and after SHA-256 digests. The manifest also lists versions retained for pending appeals, reopen requests, unfinished exams, and official exam results still inside the appeal period.

The rehearsal removes brief text, curriculum teaching allocations, checkpoint output, lesson parts, and exam questions from eligible rows. It keeps lesson and assessment identities, historical schedule metadata, assessment section limits and durations, answers, scores, progress, and logs. For a pending lesson appeal, it keeps the exact part on the source version and the current version if a correction depends on both. A pending legacy part appeal keeps the part used by the current review query. A pending exam appeal holds the whole form because its review scope can cover the whole attempt.

The executor requires the `e4s_test` database, an explicit disposable session flag, an active Manager in the organization, and the reviewed manifest digest. It locks relevant tables, rebuilds the manifest, and applies the changes and their audit entry in the same transaction. A changed digest rolls the transaction back. A repeat preview after compaction shows no additional changes unless a hold has been released or new payloads exist.

The rehearsal is exercised by the monthly content integration test. Production execution still needs a separately reviewed manifest, backup and recovery checks, an archive marker that keeps compacted content unavailable after a simulated-date rewind, and an operational concurrency strategy. Physical objects, illustration rows, generated copies in AI/job logs, and retained evidence blobs are outside the rehearsal.
