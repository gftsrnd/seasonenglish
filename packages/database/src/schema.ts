import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const now = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const emptyObject = sql`'{}'::jsonb`;
const emptyArray = sql`'[]'::jsonb`;

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull().unique(), createdAt: now()
});

export const organizationSettings = pgTable("organization_settings", {
  organizationId: uuid("organization_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  reminderInactiveDays: integer("reminder_inactive_days").notNull().default(3),
  weeklyReportEnabled: boolean("weekly_report_enabled").notNull().default(true),
  theme: text("theme").notNull().default("auto"),
  vocabImageSource: text("vocab_image_source").notNull().default("wikimedia"),
  configuration: jsonb("configuration").notNull().default(emptyObject),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const providerConfigurations = pgTable("provider_configurations", {
  organizationId: uuid("organization_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  baseUrl: text("base_url").notNull().default(""),
  model: text("model").notNull().default(""),
  speechToTextModel: text("speech_to_text_model").notNull().default(""),
  secretCiphertext: text("secret_ciphertext"),
  secretNonce: text("secret_nonce"),
  secretAuthTag: text("secret_auth_tag"),
  lastTestStatus: text("last_test_status").notNull().default("never"),
  lastTestCode: text("last_test_code"),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const managerPinReports = pgTable("manager_pin_reports", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  subjectUserId: uuid("subject_user_id").notNull().references(() => users.id),
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("open"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: now(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
});

export const managerDestructiveConfirmations = pgTable("manager_destructive_confirmations", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  managerId: uuid("manager_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  targetId: uuid("target_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  details: jsonb("details").notNull().default(emptyObject),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: now()
});

export const managerMaintenanceBackups = pgTable("manager_maintenance_backups", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  managerId: uuid("manager_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  snapshotSha256: text("snapshot_sha256").notNull(),
  createdAt: now(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true })
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  role: text("role").notNull(), displayName: text("display_name").notNull(), email: text("email"),
  avatar: jsonb("avatar").notNull().default(emptyObject),
  status: text("status").notNull().default("active"), createdAt: now(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("users_org_email_unique").on(table.organizationId, table.email)]);

export const userCredentials = pgTable("user_credentials", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  credentialHash: text("credential_hash").notNull(), algorithm: text("algorithm").notNull().default("scrypt"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }), createdAt: now()
});

export const learnerProfiles = pgTable("learner_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  profile: jsonb("profile").notNull().default(emptyObject), version: integer("version").notNull().default(1),
  draftProfile: jsonb("draft_profile"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const programs = pgTable("programs", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(), startDate: date("start_date").notNull(), weekCount: integer("week_count").notNull(),
  currentWeekOverride: integer("current_week_override"),
  status: text("status").notNull().default("draft"), createdAt: now()
});

export const enrollments = pgTable("enrollments", {
  id: uuid("id").primaryKey(), programId: uuid("program_id").notNull().references(() => programs.id),
  learnerId: uuid("learner_id").notNull().references(() => users.id), cefr: text("cefr"),
  cefrApproved: boolean("cefr_approved").notNull().default(false), enrolledAt: now()
}, (table) => [uniqueIndex("enrollments_program_learner_unique").on(table.programId, table.learnerId)]);

export const programWeeks = pgTable("program_weeks", {
  id: uuid("id").primaryKey(), programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(), topic: text("topic").notNull(),
  description: text("description").notNull().default(""), objectives: jsonb("objectives").notNull().default(emptyArray),
  keyVocabHint: text("key_vocab_hint").notNull().default(""), aiPlan: jsonb("ai_plan").notNull().default(emptyObject)
}, (table) => [uniqueIndex("program_weeks_program_number_unique").on(table.programId, table.weekNumber)]);

export const promptVersions = pgTable("prompt_versions", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  taskKey: text("task_key").notNull(), version: integer("version").notNull(), content: text("content").notNull(),
  status: text("status").notNull().default("draft"), createdBy: uuid("created_by").references(() => users.id), createdAt: now()
});

export const rubricVersions = pgTable("rubric_versions", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  rubricKey: text("rubric_key").notNull(), version: integer("version").notNull(), criteria: jsonb("criteria").notNull(),
  status: text("status").notNull().default("draft"), createdBy: uuid("created_by").references(() => users.id), createdAt: now()
});

export const lessonSets = pgTable("lesson_sets", {
  id: uuid("id").primaryKey(), programWeekId: uuid("program_week_id").notNull().references(() => programWeeks.id),
  cefr: text("cefr").notNull(), createdAt: now()
});

export const lessonSetVersions = pgTable("lesson_set_versions", {
  id: uuid("id").primaryKey(), lessonSetId: uuid("lesson_set_id").notNull().references(() => lessonSets.id, { onDelete: "cascade" }),
  version: integer("version").notNull(), status: text("status").notNull().default("draft"),
  payload: jsonb("payload").notNull().default(emptyObject), createdBy: uuid("created_by").references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id), createdAt: now(),
  publishedAt: timestamp("published_at", { withTimezone: true })
});

export const lessons = pgTable("lessons", {
  id: uuid("id").primaryKey(), lessonSetVersionId: uuid("lesson_set_version_id").notNull().references(() => lessonSetVersions.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(), title: text("title").notNull()
});

export const lessonVersions = pgTable("lesson_versions", {
  id: uuid("id").primaryKey(), lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  version: integer("version").notNull(), status: text("status").notNull().default("draft"), content: jsonb("content").notNull(),
  promptVersionId: uuid("prompt_version_id").references(() => promptVersions.id), createdAt: now()
});

export const progressRecords = pgTable("progress_records", {
  id: uuid("id").primaryKey(), learnerId: uuid("learner_id").notNull().references(() => users.id),
  lessonId: uuid("lesson_id").notNull().references(() => lessons.id), status: text("status").notNull().default("not_started"),
  score: numeric("score", { precision: 6, scale: 2 }), evidence: jsonb("evidence").notNull().default(emptyObject),
  startedAt: timestamp("started_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const lessonPartAttempts = pgTable("lesson_part_attempts", {
  id: uuid("id").primaryKey(), learnerId: uuid("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }), partCode: text("part_code").notNull(),
  requestKey: uuid("request_key").notNull(), attemptNumber: integer("attempt_number").notNull(), status: text("status").notNull(),
  answer: text("answer"), score: numeric("score", { precision: 6, scale: 2 }), feedback: text("feedback"), artifactKey: text("artifact_key"),
  createdAt: now()
});

export const lessonPartAppeals = pgTable("lesson_part_appeals", {
  id: uuid("id").primaryKey(), learnerId: uuid("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }), partCode: text("part_code").notNull(),
  reason: text("reason").notNull(), status: text("status").notNull().default("pending"), resolution: text("resolution"),
  resolvedBy: uuid("resolved_by").references(() => users.id), createdAt: now(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
});

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey(), learnerId: uuid("learner_id").notNull().references(() => users.id),
  activityType: text("activity_type").notNull(), referenceType: text("reference_type").notNull(), referenceId: uuid("reference_id"),
  minutes: integer("minutes").notNull().default(0), evidence: jsonb("evidence").notNull().default(emptyObject), occurredAt: now()
});

export const assessmentDefinitions = pgTable("assessment_definitions", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  assessmentKey: text("assessment_key").notNull(), kind: text("kind").notNull(), title: text("title").notNull()
});

export const assessmentVersions = pgTable("assessment_versions", {
  id: uuid("id").primaryKey(), definitionId: uuid("definition_id").notNull().references(() => assessmentDefinitions.id),
  version: integer("version").notNull(), status: text("status").notNull().default("draft"), blueprint: jsonb("blueprint").notNull(),
  rubricVersionId: uuid("rubric_version_id").references(() => rubricVersions.id),
  publishedAt: timestamp("published_at", { withTimezone: true })
});

export const assessmentAttempts = pgTable("assessment_attempts", {
  id: uuid("id").primaryKey(), assessmentVersionId: uuid("assessment_version_id").notNull().references(() => assessmentVersions.id),
  learnerId: uuid("learner_id").notNull().references(() => users.id), status: text("status").notNull().default("in_progress"),
  currentSection: text("current_section"), timingState: jsonb("timing_state").notNull().default(emptyObject),
  integrityEvents: jsonb("integrity_events").notNull().default(emptyArray), startedAt: now(),
  violationCount: integer("violation_count").notNull().default(0), violationLimit: integer("violation_limit").notNull().default(3),
  submitReason: text("submit_reason"), deviceEvidence: jsonb("device_evidence").notNull().default(emptyObject),
  mediaEvidence: jsonb("media_evidence").notNull().default(emptyObject),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const assessmentResponses = pgTable("assessment_responses", {
  id: uuid("id").primaryKey(), attemptId: uuid("attempt_id").notNull().references(() => assessmentAttempts.id, { onDelete: "cascade" }),
  section: text("section").notNull(), taskKey: text("task_key").notNull(), response: jsonb("response").notNull(), savedAt: now()
});

export const assessmentScores = pgTable("assessment_scores", {
  id: uuid("id").primaryKey(), attemptId: uuid("attempt_id").notNull().references(() => assessmentAttempts.id, { onDelete: "cascade" }),
  section: text("section").notNull(), score: numeric("score", { precision: 6, scale: 2 }).notNull(),
  criteria: jsonb("criteria").notNull().default(emptyObject), source: text("source").notNull(),
  rubricVersionId: uuid("rubric_version_id").references(() => rubricVersions.id), createdAt: now()
});

export const assessmentDecisions = pgTable("assessment_decisions", {
  id: uuid("id").primaryKey(), attemptId: uuid("attempt_id").notNull().unique().references(() => assessmentAttempts.id),
  suggestedLevel: text("suggested_level"), approvedLevel: text("approved_level"), status: text("status").notNull(),
  reason: text("reason").notNull().default(""), decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true })
});

export const appeals = pgTable("appeals", {
  id: uuid("id").primaryKey(), attemptId: uuid("attempt_id").notNull().references(() => assessmentAttempts.id),
  learnerId: uuid("learner_id").notNull().references(() => users.id), reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), resolvedBy: uuid("resolved_by").references(() => users.id),
  resolution: text("resolution"), createdAt: now(), resolvedAt: timestamp("resolved_at", { withTimezone: true })
});

export const aiTasks = pgTable("ai_tasks", {
  id: uuid("id").primaryKey(), taskKey: text("task_key").notNull().unique(), inputSchema: jsonb("input_schema").notNull(),
  outputSchema: jsonb("output_schema").notNull(), dataPolicy: jsonb("data_policy").notNull().default(emptyObject)
});

export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").primaryKey(), taskId: uuid("task_id").notNull().references(() => aiTasks.id), userId: uuid("user_id").references(() => users.id),
  promptVersionId: uuid("prompt_version_id").references(() => promptVersions.id), provider: text("provider").notNull(), model: text("model").notNull(),
  status: text("status").notNull(), inputHash: text("input_hash").notNull(), output: jsonb("output"), usage: jsonb("usage").notNull().default(emptyObject),
  requestKey: text("request_key"),
  latencyMs: integer("latency_ms"), traceId: text("trace_id").notNull().unique(), errorCode: text("error_code"),
  createdAt: now(), completedAt: timestamp("completed_at", { withTimezone: true })
});

export const coachSessions = pgTable("coach_sessions", {
  id: uuid("id").primaryKey(), learnerId: uuid("learner_id").notNull().references(() => users.id), scenario: jsonb("scenario").notNull(),
  rubricVersionId: uuid("rubric_version_id").references(() => rubricVersions.id), status: text("status").notNull().default("active"),
  startedAt: now(), completedAt: timestamp("completed_at", { withTimezone: true })
});

export const coachTurns = pgTable("coach_turns", {
  id: uuid("id").primaryKey(), sessionId: uuid("session_id").notNull().references(() => coachSessions.id, { onDelete: "cascade" }),
  turnNumber: integer("turn_number").notNull(), speaker: text("speaker").notNull(), content: jsonb("content").notNull(),
  feedback: jsonb("feedback"), aiRunId: uuid("ai_run_id").references(() => aiRuns.id), createdAt: now()
});

export const practiceSubmissions = pgTable("practice_submissions", {
  id: uuid("id").primaryKey(), learnerId: uuid("learner_id").notNull().references(() => users.id),
  programWeekId: uuid("program_week_id").notNull().references(() => programWeeks.id), status: text("status").notNull().default("draft"),
  content: jsonb("content").notNull().default(emptyObject), score: jsonb("score"), feedback: jsonb("feedback"),
  promptSnapshot: jsonb("prompt_snapshot").notNull().default(emptyObject), cefrSnapshot: text("cefr_snapshot"),
  vocabularySnapshot: jsonb("vocabulary_snapshot").notNull().default(emptyArray), supersededAt: timestamp("superseded_at", { withTimezone: true }),
  requestKey: text("request_key"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }), reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  canonicalLearnerWeek: uniqueIndex("practice_submissions_learner_week_canonical_unique")
    .on(table.learnerId, table.programWeekId).where(sql`${table.supersededAt} is null`)
}));

export const learnerVocabularyUnlocks = pgTable("learner_vocabulary_unlocks", {
  learnerId: uuid("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  word: text("word").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow()
});

export const levelUpChallengeResults = pgTable("level_up_challenge_results", {
  id: uuid("id").primaryKey(),
  assessmentAttemptId: uuid("assessment_attempt_id").notNull().unique().references(() => assessmentAttempts.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().unique().references(() => coachSessions.id, { onDelete: "cascade" }),
  learnerId: uuid("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  completedTurns: integer("completed_turns").notNull(),
  average: numeric("average", { precision: 5, scale: 2 }).notNull(),
  offTopic: integer("off_topic").notNull(),
  passed: boolean("passed").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const practiceAppeals = pgTable("practice_appeals", {
  id: uuid("id").primaryKey(),
  submissionId: uuid("submission_id").notNull().unique().references(() => practiceSubmissions.id, { onDelete: "cascade" }),
  learnerId: uuid("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  resolution: text("resolution"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
});

export const levelUpRetryPlans = pgTable("level_up_retry_plans", {
  id: uuid("id").primaryKey(),
  assessmentAttemptId: uuid("assessment_attempt_id").notNull().unique().references(() => assessmentAttempts.id, { onDelete: "cascade" }),
  learnerId: uuid("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eligibleAt: timestamp("eligible_at", { withTimezone: true }).notNull(), weakestSkill: text("weakest_skill").notNull(),
  readinessSnapshot: jsonb("readiness_snapshot").notNull(), createdAt: now()
}, (table) => ({ learnerEligible: index("level_up_retry_plans_learner_eligible_idx").on(table.learnerId, table.eligibleAt) }));

export const scheduledLevelChanges = pgTable("scheduled_level_changes", {
  id: uuid("id").primaryKey(), learnerId: uuid("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assessmentAttemptId: uuid("assessment_attempt_id").notNull().unique().references(() => assessmentAttempts.id, { onDelete: "cascade" }),
  fromCefr: text("from_cefr").notNull(), toCefr: text("to_cefr").notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(), status: text("status").notNull().default("scheduled"),
  approvedBy: uuid("approved_by").notNull().references(() => users.id), reason: text("reason"),
  evidence: jsonb("evidence").notNull().default(emptyObject), appliedAt: timestamp("applied_at", { withTimezone: true }), createdAt: now()
}, (table) => ({ due: index("scheduled_level_changes_due_idx").on(table.status, table.effectiveAt) }));

export const certificateIssuances = pgTable("certificate_issuances", {
  id: uuid("id").primaryKey(), learnerId: uuid("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  certificateCode: text("certificate_code").notNull().unique(), level: text("level").notNull(),
  learnerName: text("learner_name").notNull(), organizationName: text("organization_name").notNull(),
  badgesSnapshot: jsonb("badges_snapshot").notNull().default(emptyArray), signaturesSnapshot: jsonb("signatures_snapshot").notNull().default(emptyObject),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({ learnerProgram: uniqueIndex("certificate_issuances_learner_program_unique").on(table.learnerId, table.programId) }));

export const files = pgTable("files", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  ownerUserId: uuid("owner_user_id").references(() => users.id), purpose: text("purpose").notNull(), bucket: text("bucket").notNull(),
  objectKey: text("object_key").notNull(), mimeType: text("mime_type").notNull(), sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(), sourceFlow: text("source_flow").notNull().default("placement"),
  sourceEntityId: uuid("source_entity_id"), taskKey: text("task_key"), questionKey: text("question_key"), transcript: text("transcript"),
  completedAt: timestamp("completed_at", { withTimezone: true }), gradedAt: timestamp("graded_at", { withTimezone: true }),
  retentionUntil: timestamp("retention_until", { withTimezone: true }), deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by").references(() => users.id), createdAt: now()
});

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  requestFingerprint: text("request_fingerprint").notNull(),
  normalizedQuery: text("normalized_query").notNull(),
  provider: text("provider").notNull(),
  providerAssetId: text("provider_asset_id"),
  status: text("status").notNull(),
  sourceUrl: text("source_url"),
  sourcePageUrl: text("source_page_url"),
  creator: text("creator"),
  licence: text("licence"),
  licenceUrl: text("licence_url"),
  objectKey: text("object_key"),
  mimeType: text("mime_type"),
  width: integer("width"),
  height: integer("height"),
  sha256: text("sha256"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: now(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("media_assets_organization_fingerprint_unique").on(table.organizationId, table.requestFingerprint),
  index("media_assets_status_expires_index").on(table.status, table.expiresAt)
]);

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey(), kind: text("kind").notNull(), payload: jsonb("payload").notNull(), state: text("state").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0), maxAttempts: integer("max_attempts").notNull().default(3),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(), lockedBy: text("locked_by"),
  lockExpiresAt: timestamp("lock_expires_at", { withTimezone: true }), lastError: text("last_error"),
  idempotencyKey: text("idempotency_key").unique(), createdAt: now(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const reminders = pgTable("reminders", {
  id: uuid("id").primaryKey(), learnerId: uuid("learner_id").notNull().references(() => users.id), reason: text("reason").notNull(),
  message: text("message").notNull(), status: text("status").notNull().default("draft"), createdBy: uuid("created_by").references(() => users.id), createdAt: now()
});

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").primaryKey(), reminderId: uuid("reminder_id").notNull().references(() => reminders.id), provider: text("provider").notNull(),
  status: text("status").notNull(), externalId: text("external_id"), response: jsonb("response").notNull().default(emptyObject), attemptedAt: now()
});

export const badges = pgTable("badges", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  badgeKey: text("badge_key").notNull(), label: text("label").notNull(), rule: jsonb("rule").notNull()
});

export const rewardEvents = pgTable("reward_events", {
  id: uuid("id").primaryKey(), learnerId: uuid("learner_id").notNull().references(() => users.id), badgeId: uuid("badge_id").references(() => badges.id),
  points: integer("points").notNull().default(0), sourceType: text("source_type").notNull(), sourceId: uuid("source_id").notNull(), createdAt: now()
}, (table) => ({
  pointsBusinessKey: uniqueIndex("reward_events_points_business_key_unique")
    .on(table.learnerId, table.sourceType, table.sourceId).where(sql`${table.badgeId} is null`),
  badgeBusinessKey: uniqueIndex("reward_events_badge_business_key_unique")
    .on(table.learnerId, table.badgeId).where(sql`${table.badgeId} is not null`)
}));

export const gameSets = pgTable("game_sets", {
  id: uuid("id").primaryKey(), programWeekId: uuid("program_week_id").references(() => programWeeks.id), gameKey: text("game_key").notNull(),
  learnerId: uuid("learner_id").references(() => users.id), status: text("status").notNull().default("draft"),
  payload: jsonb("payload").notNull(), createdAt: now()
});

export const gameResults = pgTable("game_results", {
  id: uuid("id").primaryKey(), gameSetId: uuid("game_set_id").notNull().references(() => gameSets.id), learnerId: uuid("learner_id").notNull().references(() => users.id),
  score: integer("score").notNull(), gameKey: text("game_key"), maxScore: integer("max_score"), requestKey: text("request_key"),
  duelId: uuid("duel_id"), details: jsonb("details").notNull().default(emptyObject), completedAt: now()
});

export const duels = pgTable("duels", {
  id: uuid("id").primaryKey(), gameSetId: uuid("game_set_id").notNull().references(() => gameSets.id), challengerId: uuid("challenger_id").notNull().references(() => users.id),
  opponentId: uuid("opponent_id").notNull().references(() => users.id), gameKey: text("game_key"), state: text("state").notNull().default("open"), scores: jsonb("scores").notNull().default(emptyObject),
  createdAt: now(), completedAt: timestamp("completed_at", { withTimezone: true })
});

export const surveys = pgTable("surveys", {
  id: uuid("id").primaryKey(), learnerId: uuid("learner_id").notNull().references(() => users.id), surveyKey: text("survey_key").notNull(),
  answers: jsonb("answers").notNull(), submittedAt: now()
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id), actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: uuid("entity_id"), payload: jsonb("payload").notNull().default(emptyObject),
  traceId: text("trace_id").notNull(), createdAt: now()
});

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: bigserial("id", { mode: "number" }).primaryKey(), scope: text("scope").notNull(), key: text("key").notNull(),
  response: jsonb("response").notNull(), createdAt: now()
});

export const databaseSchema = {
  activities, aiRuns, aiTasks, appeals, assessmentAttempts, assessmentDecisions,
  assessmentDefinitions, assessmentResponses, assessmentScores, assessmentVersions,
  auditEvents, badges, coachSessions, coachTurns, duels, enrollments, files, mediaAssets,
  gameResults, gameSets, idempotencyKeys, jobs, learnerProfiles, lessonSetVersions,
  lessonPartAppeals, lessonPartAttempts, lessonSets, lessonVersions, lessons, notificationDeliveries, organizations, organizationSettings, providerConfigurations,
  practiceSubmissions, learnerVocabularyUnlocks, levelUpChallengeResults, practiceAppeals,
  programWeeks, programs, progressRecords, promptVersions,
  reminders, rewardEvents, rubricVersions, sessions, surveys, userCredentials, users, managerPinReports, managerDestructiveConfirmations, managerMaintenanceBackups
};
