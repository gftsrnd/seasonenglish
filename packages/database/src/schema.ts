import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
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

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  role: text("role").notNull(), displayName: text("display_name").notNull(), email: text("email"),
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
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const programs = pgTable("programs", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(), startDate: date("start_date").notNull(), weekCount: integer("week_count").notNull(),
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
  description: text("description").notNull().default(""), objectives: jsonb("objectives").notNull().default(emptyArray)
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
  submittedAt: timestamp("submitted_at", { withTimezone: true }), reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const files = pgTable("files", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  ownerUserId: uuid("owner_user_id").references(() => users.id), purpose: text("purpose").notNull(), bucket: text("bucket").notNull(),
  objectKey: text("object_key").notNull(), mimeType: text("mime_type").notNull(), sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(), retentionUntil: timestamp("retention_until", { withTimezone: true }), createdAt: now()
});

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
});

export const gameSets = pgTable("game_sets", {
  id: uuid("id").primaryKey(), programWeekId: uuid("program_week_id").references(() => programWeeks.id), gameKey: text("game_key").notNull(),
  status: text("status").notNull().default("draft"), payload: jsonb("payload").notNull(), createdAt: now()
});

export const gameResults = pgTable("game_results", {
  id: uuid("id").primaryKey(), gameSetId: uuid("game_set_id").notNull().references(() => gameSets.id), learnerId: uuid("learner_id").notNull().references(() => users.id),
  score: integer("score").notNull(), details: jsonb("details").notNull().default(emptyObject), completedAt: now()
});

export const duels = pgTable("duels", {
  id: uuid("id").primaryKey(), gameSetId: uuid("game_set_id").notNull().references(() => gameSets.id), challengerId: uuid("challenger_id").notNull().references(() => users.id),
  opponentId: uuid("opponent_id").notNull().references(() => users.id), state: text("state").notNull().default("open"), scores: jsonb("scores").notNull().default(emptyObject),
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
  auditEvents, badges, coachSessions, coachTurns, duels, enrollments, files,
  gameResults, gameSets, idempotencyKeys, jobs, learnerProfiles, lessonSetVersions,
  lessonSets, lessonVersions, lessons, notificationDeliveries, organizations,
  practiceSubmissions, programWeeks, programs, progressRecords, promptVersions,
  reminders, rewardEvents, rubricVersions, sessions, surveys, userCredentials, users
};

