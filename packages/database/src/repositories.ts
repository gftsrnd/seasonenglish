import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { buildLevelReadiness as calculateLevelReadiness, consecutiveLearningAbsences, learningAbsenceStreak, monthlyAttendanceCountedDates, evaluateMonthlyLevelUpReadiness, MONTHLY_EXAM_ENTRY_CUTOFF, passesLevelUpExam, createLevelRetryPlan, monthlyLearnerWindow, learnerMonthlySeasonTarget, LEVEL_READINESS_THRESHOLDS, type LevelReadinessMetrics, type LevelReadinessThresholds, type MonthlyLevelRecord } from "@e4s/domain/progression";
import { evaluateGeneratedLessonQuality, validateGenerationFindingsForPublication, validateLessonPublication } from "@e4s/domain/content";
import { lessonCompletionActivity } from "@e4s/domain/learning";
import { longestScheduledLessonStreak, nextRewardSeason, rewardBadgeDescription, rewardBadgeThreshold, rewardSeasonFor, rewardSeasonLabel, REWARD_BADGE_KEYS, REWARD_SEASONS, pickGameWordExample, type RewardSeason } from "@e4s/domain/engagement";
import { formatDisplayScore } from "./score-format.js";
import { buildMonthlyCalendar, formatMonthlyDayLabel, monthlyLessonDisplayTitle, evaluateMonthlyLessonAccess, monthlyAttendanceDates, mergedVietnamHolidays, withMonthlyExpandedTerms, monthlyGrammarDayTopicName, withMonthlyGrammarTopicName, type MonthlyGrammarTopicSource, type MonthlyLessonAccess, type MonthlyVocabularyCore } from "@e4s/domain/monthly";
import { FROZEN_MONTHLY_ILLUSTRATIONS_SQL, withFrozenMonthlyIllustrations, type FrozenMonthlyIllustration } from "./monthly-illustration-projection.js";
import { generationFindingsFromPayload } from "./generation-findings.js";
import { MonthlyContentRepository } from "./monthly-content-repository.js";
import { learnerLevelStartedOnSql } from "./learner-level-start.js";
import type {
  AccountRole,
  AudioArtifactInput,
  AudioArtifactView,
  AssessmentDeviceEvidence,
  AssessmentEvidenceType,
  AssessmentAppealTargetView,
  AssessmentKind,
  AssessmentMediaEvidence,
  AssessmentDeletionRequestView,
  AssessmentLevelFormDeleteView,
  AssessmentLevelFormDetailView,
  AssessmentLevelFormUpdateInput,
  AssessmentLevelChangeInput,
  AssessmentLevelUpOverrideView,
  AssessmentLevelChangeView,
  AssessmentMonthlyGoalView,
  AssessmentReviewAttemptDetailView,
  AssessmentReviewChallengeView,
  AssessmentReviewLearnerView,
  AssessmentReviewAttemptSummaryView,
  AssessmentRuntimeView,
  AssessmentSectionCode,
  AssessmentSnapshot,
  AssessmentSubmitReason,
  AssessmentViolationReason,
  BadgeRoadmapItem,
  SeasonLevelView,
  CefrLevel,
  ContentLessonDraftInput,
  ContentLessonMutationResult,
  ContentLessonMatrixView,
  ContentLessonSetVersionView,
  ContentWeeklyPracticeDraftInput,
  ContentPromptKey,
  ContentPromptSettingsView,
  ContentReviewView,
  ContentReviewAssessmentDetailView,
  ContentReviewAiGradeJobView,
  ContentWeekFrameView,
  ContentWeekInput,
  CoachFeedbackView,
  CoachTurnClassification,
  LevelChallengeView,
  LevelChallengeResultView,
  LevelChallengeRequestView,
  CoachPersona,
  CoachView,
  DuelView,
  GameHubView,
  GameKey,
  GameResultView,
  GameTopicModeration,
  GameWordView,
  GameWordSetView,
  LearnerAvatarData,
  LearnerNotificationView,
  LearnerProfileData,
  LearnerProgressView,
  RewardAnnouncementView,
  LevelUpPhase,
  PilotPhase,
  LevelReadinessMetric,
  LevelReadinessView,
  LessonContent,
  LessonPart,
  LessonLockView,
  LessonPartAppealView,
  LessonExerciseCorrectionInput,
  LessonPartAttemptEvidenceInput,
  LessonPartAttemptView,
  LessonPartCode,
  LessonProgressView,
  PartEvidence,
  ManagerBaseNotificationInput,
  ManagerBaseNotificationView,
  ManagerOperationsView,
  ManagerAccountView,
  ManagerAccountsView,
  ManagerDeleteRequestsView,
  ManagerDataExportView,
  ManagerDataImportView,
  ManagerImageTestView,
  ManagerLearnerProfileView,
  ManagerMusicTestView,
  ManagerMaintenanceAction,
  ManagerMaintenanceConfirmationInput,
  ManagerMaintenanceConfirmationView,
  ManagerMaintenanceResultView,
  ManagerPurgeConfirmationInput,
  ManagerPurgeConfirmationView,
  ManagerPinReportView,
  ManagerPinReportsView,
  ManagerProviderKind,
  ManagerProviderSettingsInput,
  ManagerProviderSettingsTestInput,
  ManagerProviderSettingsView,
  ManagerProviderTestView,
  ManagerMonthlyFilter,
  ManagerMonthlyLearnerView,
  ManagerMonthlyOverviewView,
  ManagerProgressView,
  OperatorSettingsOverviewView,
  OrganisationExperienceInput,
  OrganisationExperienceView,
  ManagerReminderCandidateView,
  ManagerReminderChannel,
  ManagerReminderCopyView,
  ManagerReminderDismissView,
  ManagerReminderProvider,
  ManagerRemindersView,
  ManagerReminderSendView,
  ManagerReportView,
  ManagerSettingsView,
  ManagerSettingsInput,
  ManagerTrashView,
  ManagerWebhookTestView,
  ManualAssessmentScoreInput,
  MicroLessonView,
  RewardView,
  SurveyView,
  WeeklyPracticeView,
  WeeklyPracticeAppealView,
  WeeklyPracticeReviewState
} from "@e4s/contracts";
import { seedDemo, DEMO_IDS } from "./seed.js";
import { prototypePromptDefaults } from "./prototype-prompts.js";

const prototypeTaskPromptDefaults: Readonly<Record<string, string>> = {
  system_rules: prototypePromptDefaults.base,
  assessment_scoring: prototypePromptDefaults.placement,
  week_suggestions: prototypePromptDefaults.weeks,
  monthly_topic_suggestion: prototypePromptDefaults.monthlyTopic,
  monthly_resource_generation: prototypePromptDefaults.monthlyResources,
  monthly_lessons: prototypePromptDefaults.monthlyLessons,
  monthly_final_generation: prototypePromptDefaults.monthlyFinal,
  level_form_generation: prototypePromptDefaults.levelForm,
  micro_grading: prototypePromptDefaults.mgrade,
  coach_dialogue: prototypePromptDefaults.coach,
  weekly_practice_grading: prototypePromptDefaults.grade,
  lesson_productive_grading: prototypePromptDefaults.lessonProductive
};

function shouldSyncPrototypePrompt(
  rows: readonly {
    version: number;
    content: string;
    status: string;
    created_by: string | null;
    creator_role: AccountRole | null;
  }[],
  canonicalContent: string
): boolean {
  const latest = rows[0];
  if (latest?.status === "draft") return false;
  const active = rows.find((row) => row.status === "active");
  if (!active) return true;
  if (active.content === canonicalContent) return false;
  const isManagerPublished = active.version > 1 && active.created_by !== null && active.creator_role === "manager";
  return !isManagerPublished;
}

async function ensurePrototypePrompts(
  pool: Pool,
  organizationId: string,
  requestedKeys?: readonly string[]
): Promise<void> {
  const keys = [...new Set(
    (requestedKeys ?? Object.keys(prototypeTaskPromptDefaults)).filter((key) => Object.hasOwn(prototypeTaskPromptDefaults, key))
  )];
  if (!keys.length) return;
  const existing = await pool.query<{
    id: string;
    task_key: string;
    version: number;
    content: string;
    status: string;
    created_by: string | null;
    creator_role: AccountRole | null;
  }>(
    `select pv.id, pv.task_key, pv.version, pv.content, pv.status, pv.created_by, u.role as creator_role
     from prompt_versions pv
     left join users u on u.id = pv.created_by
     where pv.organization_id = $1 and pv.task_key = any($2::text[])
     order by pv.task_key, pv.version desc`,
    [organizationId, keys]
  );
  const needsSync = keys.some((taskKey) => {
    const canonicalContent = prototypeTaskPromptDefaults[taskKey];
    if (!canonicalContent) return false;
    const rows = existing.rows.filter((row) => row.task_key === taskKey);
    return shouldSyncPrototypePrompt(rows, canonicalContent);
  });
  if (!needsSync) return;

  const client = await pool.connect();
  try {
    await client.query("begin");
    const locked = await client.query<{
      id: string;
      task_key: string;
      version: number;
      content: string;
      status: string;
      created_by: string | null;
      creator_role: AccountRole | null;
    }>(
      `select pv.id, pv.task_key, pv.version, pv.content, pv.status, pv.created_by, u.role as creator_role
       from prompt_versions pv
       left join users u on u.id = pv.created_by
       where pv.organization_id = $1 and pv.task_key = any($2::text[])
       order by pv.task_key, pv.version desc
       for update of pv`,
      [organizationId, keys]
    );
    for (const taskKey of keys) {
      const canonicalContent = prototypeTaskPromptDefaults[taskKey];
      if (!canonicalContent) continue;
      const rows = locked.rows.filter((row) => row.task_key === taskKey);
      if (!shouldSyncPrototypePrompt(rows, canonicalContent)) continue;
      const nextVersion = (rows[0]?.version ?? 0) + 1;
      await client.query(
        `update prompt_versions
         set status = 'retired'
         where organization_id = $1 and task_key = $2 and status = 'active'`,
        [organizationId, taskKey]
      );
      await client.query(
        `insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
         values ($1, $2, $3, $4, $5, 'active', null)`,
        [randomUUID(), organizationId, taskKey, nextVersion, canonicalContent]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    if (!isPostgresUniqueViolation(error)) throw error;
  } finally {
    client.release();
  }
}

async function ensurePrototypePromptsForUser(
  pool: Pool,
  userId: string,
  requestedKeys?: readonly string[]
): Promise<void> {
  const keys = [...new Set(
    (requestedKeys ?? Object.keys(prototypeTaskPromptDefaults)).filter((key) => Object.hasOwn(prototypeTaskPromptDefaults, key))
  )];
  if (!keys.length) return;
  const user = await pool.query<{ organization_id: string }>(
    "select organization_id from users where id = $1",
    [userId]
  );
  const organizationId = user.rows[0]?.organization_id;
  if (!organizationId) return;
  await ensurePrototypePrompts(pool, organizationId, keys);
}
import { assessmentProductiveRubric, normalizeLevelFormQuestionPrompts, type StoredAssessmentDefinition } from "./assessment-blueprints.js";
function roundAssessmentScore(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeWeekPlan(value: unknown): Partial<Record<CefrLevel, string[]>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const plan: Partial<Record<CefrLevel, string[]>> = {};
  for (const level of ["A1", "A2", "B1", "B2", "C1"] as const) {
    const days = source[level];
    if (Array.isArray(days) && days.length === 5 && days.every((day): day is string => typeof day === "string" && day.trim().length > 0)) plan[level] = days.map(day => day.trim());
  }
  return plan;
}

export interface UserIdentity {
  id: string;
  displayName: string;
  email: string | null;
  avatar?: LearnerAvatarData;
  role: AccountRole;
  status: string;
}

export interface UserCredentialRecord extends UserIdentity {
  credentialHash: string;
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
}

export interface ActiveSessionRecord extends UserIdentity {
  sessionId: string;
  expiresAt: Date;
}

export interface ActiveLearningContext {
  programId: string;
  programName: string;
  cycleNumber: number;
  weekCount: number;
  weekId: string;
  weekNumber: number;
  topic: string;
  description: string;
  objectives: string[];
  cefr: string | null;
  startDate: string;
}

export interface ActiveMonthlyLearningContext {
  month: string;
  themeTitle: string;
  themeBrief: string;
  communicationGoal: string;
  cefr: CefrLevel;
  examDate: string;
  systemDate: string;
  holidays: Array<{ date: string; name: string }>;
}

export interface LearnerProfileRecord {
  profile: Partial<LearnerProfileData>;
  completedProfile?: Partial<LearnerProfileData>;
  draftAvailable?: boolean;
  version: number;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface LearnerLessonRecord {
  exerciseVersionId?: string;
  teachingLabel?: string;
  newLessonNumber?: number;
  id: string;
  title: string;
  dayNumber: number;
  weekNumber: number;
  weekTopic: string;
  cefr: CefrLevel;
  content: LessonContent & { durationMinutes?: number };
  progress: LessonProgressView;
  lock: LessonLockView | null;
  monthlyKind?: "new" | "review";
  lessonDate?: string;
  systemDate?: string;
}

type LearnerLessonQueryRow = {
  exercise_version_id?: string;
  monthly_core_terms?: MonthlyVocabularyCore[];
  frozen_illustrations?: FrozenMonthlyIllustration[];
  id: string;
  title: string;
  day_number: number;
  week_number: number;
  week_topic: string;
  cefr: CefrLevel;
  content: LessonContent & { durationMinutes?: number };
  lesson_count: string;
  opens_at: string;
  opens_later: boolean;
  blocker_id: string | null;
  blocker_day_number: number | null;
  blocker_title: string | null;
  progress_status: LessonProgressView["status"] | null;
  progress_score: string | null;
  progress_evidence: Record<string, unknown> | null;
  progress_updated_at: Date | null;
  monthly_kind?: "new" | "review";
  monthly_day_spec?: import("@e4s/domain").MonthlyDaySpec;
  monthly_grammar_topics?: MonthlyGrammarTopicSource[] | null;
  monthly_new_ordinal?: number;
  monthly_review_ordinal?: number;
  lesson_date?: string;
  system_date?: string;
};

export interface PublishedLessonSet {
  id: string;
  versionId: string;
  version: number;
  status: string;
  payload: unknown;
}

export interface JobInput {
  id: string;
  kind: string;
  payload: unknown;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export interface LeasedJob {
  id: string;
  kind: string;
  payload: unknown;
  state: "running";
  attempts: number;
  maxAttempts: number;
  lockedBy: string;
}

export interface ReminderWebhookDelivery {
  reminderId: string;
  deliveryId: string;
  message: string;
  learnerName: string;
  webhookUrl: string;
  webhookTemplate: string;
}

export interface ReminderWebhookDeliveryUpdate {
  reminderId: string;
  deliveryId: string;
  status: "sent" | "failed";
  response: Record<string, unknown>;
  externalId?: string | null;
}

export interface ReminderEmailDelivery {
  reminderId: string;
  deliveryId: string;
  message: string;
  learnerName: string;
  recipient: string;
}

export interface PublishedAssessmentRecord {
  definitionId: string;
  versionId: string;
  assessmentKey: string;
  kind: "placement" | "level_up" | "final" | "pass_course";
  title: string;
  version: number;
  blueprint: StoredAssessmentDefinition;
}

export interface AssessmentResponseRecord {
  section: AssessmentSectionCode;
  taskKey: string;
  value: string;
  evidenceType: AssessmentEvidenceType;
  artifactKey: string | null;
  savedAt: Date;
}

export interface AssessmentAttemptRecord {
  id: string;
  assessmentVersionId: string;
  learnerId: string;
  status: "in_progress" | "submitted" | "pending_review" | "approved" | "needs_retry";
  currentSection: AssessmentSectionCode | null;
  timingState: {
    sections?: Partial<Record<AssessmentSectionCode, {
      startedAt: string;
      endsAt: string;
      completedAt?: string;
      auto?: boolean;
    }>>;
  };
  integrityEvents: Array<{
    requestId: string;
    reason: AssessmentViolationReason;
    occurredAt: string;
    recordedAt: string;
    violationCount: number;
  }>;
  violationCount: number;
  violationLimit: number;
  submitReason: AssessmentSubmitReason | null;
  deviceEvidence: AssessmentDeviceEvidence;
  mediaEvidence: AssessmentMediaEvidence;
  startedAt: Date;
  submittedAt: Date | null;
  updatedAt: Date;
  responses: AssessmentResponseRecord[];
  scores: Partial<Record<AssessmentSectionCode, number>>;
  audioPlayCounts: Record<string, number>;
  suggestedLevel: CefrLevel | null;
}

export type PlacementAttemptResumeResult =
  | { state: "none"; attempt: null }
  | { state: "ready" | "migrated"; attempt: AssessmentAttemptRecord }
  | { state: "restart_required" | "session_conflict"; attempt: null };

export interface AssessmentRescoreContext {
  attempt: AssessmentAttemptRecord;
  definition: StoredAssessmentDefinition;
}

export interface AssessmentReviewQueueRecord {
  attemptId: string;
  learnerId: string;
  learnerName: string;
  profileComplete: boolean;
  kind: AssessmentKind;
  title: string;
  submittedAt: Date;
  sectionScores: Partial<Record<AssessmentSectionCode, number>>;
  suggestedLevel: CefrLevel | null;
  reviewFlags: Array<"pending_score" | "incomplete" | "typed_speaking" | "borderline" | "skill_gap">;
  challenge?: { completedTurns: number; requiredTurns: 6; average: number; offTopic: number; complete: boolean; passed: boolean };
}

export interface AssessmentDecisionRecord {
  attemptId: string;
  status: "approved" | "needs_retry";
  approvedLevel: CefrLevel | null;
  reason: string;
  decidedBy: string;
  decidedAt: Date;
}

export interface AssessmentApprovedLearnerRecord {
  learnerId: string;
  learnerName: string;
  currentLevel: CefrLevel;
  placementScore: number | null;
  monthlyGoal: string | null;
  levelUpOverride: { targetLevel: CefrLevel; reason: string; grantedBy: string | null; grantedAt: string } | null;
}

export interface AssessmentUnassessedLearnerRecord {
  learnerId: string;
  learnerName: string;
  profileComplete: boolean;
  lifecycle: "not_started" | "in_progress" | "needs_retry";
  lastAttemptAt: Date | null;
}

export interface AssessmentReviewFlowRecord {
  learnerId: string;
  learnerName: string;
  currentLevel: CefrLevel;
  targetLevel: CefrLevel;
  phase: "testing" | "ungraded" | "challenge" | "failed";
  metrics: string;
  assessmentAttemptId: string;
  challengeAttemptId: string | null;
}

export interface AssessmentLevelFormRecord {
  definitionId: string;
  versionId: string;
  title: string;
  version: number;
  targetLevel: Exclude<CefrLevel, "A1">;
  publishedAt: Date | null;
  listeningTaskCount: number;
  readingTaskCount: number;
  attemptCount: number;
  status: "draft" | "published" | "retired";
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

class IdentityRepository {
  constructor(private readonly pool: Pool) {}

  async registerLearner(input: { displayName: string; email: string; credentialHash: string }): Promise<UserIdentity> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const targets = await client.query<{ organization_id: string; program_id: string }>(
        `select o.id as organization_id, p.id as program_id
         from organizations o
         join lateral (
           select id from programs
           where organization_id = o.id and status = 'active'
           order by start_date desc, created_at desc
           limit 1
         ) p on true`
      );
      if (targets.rowCount !== 1 || !targets.rows[0]) throw new Error("LEARNER_REGISTRATION_UNAVAILABLE");
      const duplicate = await client.query<{ status: string }>("select status from users where lower(email) = lower($1) limit 1", [input.email]);
      if (duplicate.rowCount) {
        if (duplicate.rows[0]?.status === "deleted") throw new Error("LEARNER_REGISTRATION_EMAIL_DELETED");
        throw new Error("LEARNER_REGISTRATION_EMAIL_EXISTS");
      }

      const id = randomUUID();
      const target = targets.rows[0];
      await client.query(
        `insert into users (id, organization_id, role, display_name, email)
         values ($1, $2, 'learner', $3, lower($4))`,
        [id, target.organization_id, input.displayName, input.email]
      );
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [id, input.credentialHash]);
      await client.query("insert into learner_profiles (user_id) values ($1)", [id]);
      await client.query("insert into enrollments (id, program_id, learner_id) values ($1, $2, $3)", [randomUUID(), target.program_id, id]);
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'account.self_registered', 'user', $3, $4::jsonb, $5)`,
        [randomUUID(), target.organization_id, id, JSON.stringify({ role: "learner" }), randomUUID()]
      );
      await client.query("commit");
      return { id, displayName: input.displayName, email: input.email.toLowerCase(), role: "learner", status: "active" };
    } catch (error) {
      await client.query("rollback");
      if (isPostgresUniqueViolation(error)) throw new Error("LEARNER_REGISTRATION_EMAIL_EXISTS");
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByEmail(email: string): Promise<UserIdentity | null> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      email: string | null;
      avatar: LearnerAvatarData | Record<string, never>;
      role: AccountRole;
      status: string;
    }>(
      `select id, display_name, email, avatar, role, status
       from users
       where lower(email) = lower($1)
       limit 1`,
      [email]
    );
    const row = result.rows[0];
    return row
      ? { id: row.id, displayName: row.display_name, email: row.email, ...avatarField(row.avatar), role: row.role, status: row.status }
      : null;
  }

  async findCredentialByEmail(email: string): Promise<UserCredentialRecord | null> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      email: string | null;
      avatar: LearnerAvatarData | Record<string, never>;
      role: AccountRole;
      status: string;
      credential_hash: string;
      failed_pin_attempts: number;
      pin_locked_until: Date | null;
    }>(
      `select u.id, u.display_name, u.email, u.avatar, u.role, u.status, c.credential_hash,
              c.failed_pin_attempts, c.pin_locked_until
       from users u join user_credentials c on c.user_id = u.id
       where lower(u.email) = lower($1)
         and (u.status = 'active' or (u.role = 'learner' and u.status = 'disabled'))
       limit 1`,
      [email]
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          displayName: row.display_name,
          email: row.email,
          ...avatarField(row.avatar),
          role: row.role,
          status: row.status,
          credentialHash: row.credential_hash,
          failedPinAttempts: row.failed_pin_attempts,
          pinLockedUntil: row.pin_locked_until
        }
      : null;
  }

  async recordFailedLearnerPin(userId: string): Promise<{ failedAttempts: number; lockedUntil: Date | null }> {
    const result = await this.pool.query<{ failed_pin_attempts: number; pin_locked_until: Date | null }>(
      `update user_credentials
       set failed_pin_attempts = case when pin_locked_until is not null and pin_locked_until <= now() then 1 else failed_pin_attempts + 1 end,
           pin_locked_until = case
             when (case when pin_locked_until is not null and pin_locked_until <= now() then 1 else failed_pin_attempts + 1 end) >= 5
               then now() + interval '15 minutes'
             else null
           end,
           updated_at = now()
       where user_id = $1 and (pin_locked_until is null or pin_locked_until <= now())
       returning failed_pin_attempts, pin_locked_until`,
      [userId]
    );
    const row = result.rows[0];
    if (row) return { failedAttempts: row.failed_pin_attempts, lockedUntil: row.pin_locked_until };
    const locked = await this.pool.query<{ failed_pin_attempts: number; pin_locked_until: Date | null }>(
      "select failed_pin_attempts, pin_locked_until from user_credentials where user_id = $1",
      [userId]
    );
    return { failedAttempts: locked.rows[0]?.failed_pin_attempts ?? 0, lockedUntil: locked.rows[0]?.pin_locked_until ?? null };
  }

  async resetLearnerPinFailures(userId: string): Promise<void> {
    await this.pool.query(
      "update user_credentials set failed_pin_attempts = 0, pin_locked_until = null, updated_at = now() where user_id = $1",
      [userId]
    );
  }

  async requestStaffPasswordHelp(email: string, credential: "password" | "pin" | "manager-password" = "password"): Promise<void> {
    const managerRequest = credential === "manager-password";
    const note = managerRequest ? "Quản lý yêu cầu hỗ trợ đặt lại mật khẩu."
      : credential === "pin" ? "Người vận hành báo quên mã PIN và cần Quản lý hỗ trợ."
      : "Người vận hành báo quên mật khẩu và cần Quản lý đặt lại.";
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const subject = await client.query<{ id: string; organization_id: string }>(
        `select id, organization_id from users
         where lower(email) = lower($1) and role = $2 and status = 'active'
         limit 1 for update`,
        [email, managerRequest ? 'manager' : 'operator']
      );
      const account = subject.rows[0];
      if (account) {
        await client.query(
          `insert into manager_pin_reports (id, organization_id, subject_user_id, note, created_by)
           select $1, $2, $3, $4, $3
           where not exists (
             select 1 from manager_pin_reports
             where organization_id = $2 and subject_user_id = $3 and note = $4 and status = 'open'
           )`,
          [randomUUID(), account.organization_id, account.id, note]
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(input: { id: string; userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.pool.query(
      `insert into sessions (id, user_id, token_hash, expires_at) values ($1, $2, $3, $4)`,
      [input.id, input.userId, input.tokenHash, input.expiresAt]
    );
  }

  async findActiveSession(tokenHash: string): Promise<ActiveSessionRecord | null> {
    const result = await this.pool.query<{
      session_id: string;
      expires_at: Date;
      id: string;
      display_name: string;
      email: string | null;
      avatar: LearnerAvatarData | Record<string, never>;
      role: AccountRole;
      status: string;
    }>(
      `select s.id as session_id, s.expires_at, u.id, u.display_name, u.email, u.avatar, u.role, u.status
       from sessions s join users u on u.id = s.user_id
       where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.status = 'active'
       limit 1`,
      [tokenHash]
    );
    const row = result.rows[0];
    return row
      ? {
          sessionId: row.session_id,
          expiresAt: row.expires_at,
          id: row.id,
          displayName: row.display_name,
          email: row.email,
          ...avatarField(row.avatar),
          role: row.role,
          status: row.status
        }
      : null;
  }

  async findDisabledLearnerSession(tokenHash: string): Promise<ActiveSessionRecord | null> {
    const result = await this.pool.query<{
      session_id: string; expires_at: Date; id: string; display_name: string; email: string | null;
      avatar: LearnerAvatarData | Record<string, never>; role: AccountRole; status: string;
    }>(
      `select s.id as session_id, s.expires_at, u.id, u.display_name, u.email, u.avatar, u.role, u.status
       from sessions s join users u on u.id = s.user_id
       where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
         and u.role = 'learner' and u.status = 'disabled'
       limit 1`,
      [tokenHash]
    );
    const row = result.rows[0];
    return row ? {
      sessionId: row.session_id, expiresAt: row.expires_at, id: row.id, displayName: row.display_name,
      email: row.email, ...avatarField(row.avatar), role: row.role, status: row.status
    } : null;
  }

  async updateAvatar(userId: string, avatar: LearnerAvatarData): Promise<UserIdentity> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      email: string | null;
      avatar: LearnerAvatarData;
      role: AccountRole;
      status: string;
    }>(
      `update users
       set avatar = $2::jsonb, updated_at = now()
       where id = $1 and status = 'active'
       returning id, display_name, email, avatar, role, status`,
      [userId, JSON.stringify(avatar)]
    );
    const row = result.rows[0];
    if (!row) throw new Error("USER_NOT_FOUND");
    return {
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      avatar: row.avatar,
      role: row.role,
      status: row.status
    };
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.pool.query(
      `update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`,
      [tokenHash]
    );
  }
}

function avatarField(value: LearnerAvatarData | Record<string, never>): { avatar?: LearnerAvatarData } {
  return value && "acc" in value && "color" in value && "bg" in value
    ? { avatar: value as LearnerAvatarData }
    : {};
}

interface StoredRequestEvidence {
  scope?: string | undefined;
  screenshot?: { bytes: Buffer; mimeType: string } | undefined;
}

function requestEvidenceValues({ scope, screenshot }: StoredRequestEvidence) {
  return [scope ?? null, screenshot?.bytes ?? null, screenshot?.mimeType ?? null] as const;
}

class LearningRepository {
  constructor(private readonly pool: Pool) {}

  async getActiveContext(learnerId: string): Promise<ActiveLearningContext | null> {
    const result = await this.pool.query<{
      program_id: string;
      program_name: string;
      cycle_number: string;
      start_date: string;
      week_count: number;
      week_id: string;
      week_number: number;
      topic: string;
      description: string;
      objectives: string[];
      cefr: string | null;
    }>(
      `select p.id as program_id, p.name as program_name, p.start_date::text as start_date, p.week_count,
              (select count(*)::text from programs cycle where cycle.organization_id = p.organization_id and cycle.created_at <= p.created_at) as cycle_number,
              pw.id as week_id, pw.week_number, pw.topic, pw.description, pw.objectives, e.cefr
       from enrollments e
       join programs p on p.id = e.program_id and p.status = 'active'
       join program_weeks pw on pw.program_id = p.id
         and pw.week_number = coalesce(
           p.current_week_override,
           greatest(1, least(p.week_count, ((organization_system_date(p.organization_id) - p.start_date) / 7) + 1))
         )
       where e.learner_id = $1 and e.cefr_approved
       order by e.enrolled_at desc limit 1`,
      [learnerId]
    );
    const row = result.rows[0];
    return row
      ? {
          programId: row.program_id,
          programName: row.program_name,
          cycleNumber: Number(row.cycle_number) || 1,
          startDate: row.start_date,
          weekCount: row.week_count,
          weekId: row.week_id,
          weekNumber: row.week_number,
          topic: row.topic,
          description: row.description,
          objectives: row.objectives,
          cefr: row.cefr
        }
      : null;
  }

  async getActiveMonthlyContext(learnerId: string): Promise<ActiveMonthlyLearningContext | null> {
    if ((await learnerMonthlyAccess(this.pool, learnerId))?.state !== "active") return null;
    const result = await this.pool.query<{
      month: string; theme_title: string; theme_brief: string; communication_goal: string; cefr: CefrLevel; exam_date: string; system_date: string; holiday_dates: string[] | null;
    }>(
      `select pm.month, pm.theme_title, pm.theme_brief, pm.communication_goal, mf.cefr, pm.exam_date::text,
              organization_system_date(u.organization_id)::text as system_date,
              (select array_agg(holiday_date::text) from organization_holidays
               where organization_id = u.organization_id and to_char(holiday_date, 'YYYY-MM') = pm.month) as holiday_dates
       from enrollments e
       join users u on u.id = e.learner_id and u.status = 'active'
       join program_months pm on pm.organization_id = u.organization_id and pm.month = to_char(organization_system_date(u.organization_id), 'YYYY-MM')
       join month_frameworks mf on mf.program_month_id = pm.id and mf.cefr = e.cefr and mf.status = 'approved'
       where e.learner_id = $1
       limit 1`,
      [learnerId]
    );
    const row = result.rows[0];
    return row ? {
      month: row.month,
      themeTitle: row.theme_title,
      themeBrief: row.theme_brief,
      communicationGoal: row.communication_goal,
      cefr: row.cefr,
      examDate: row.exam_date,
      systemDate: row.system_date,
      holidays: mergedVietnamHolidays(row.month, (row.holiday_dates ?? []).map(date => ({ date })))
    } : null;
  }

  async getProfile(learnerId: string): Promise<LearnerProfileRecord | null> {
    const result = await this.pool.query<{
      profile: Partial<LearnerProfileData>;
      draft_profile: Partial<LearnerProfileData> | null;
      display_name: string;
      email: string | null;
      version: number;
      completed_at: Date | null;
      updated_at: Date;
    }>(
      `select lp.profile, lp.draft_profile, u.display_name, u.email, lp.version, lp.completed_at,
              coalesce(lp.draft_updated_at, lp.updated_at) as updated_at
       from learner_profiles lp
       join users u on u.id = lp.user_id and u.role = 'learner' and u.status = 'active'
       where lp.user_id = $1`,
      [learnerId]
    );
    const row = result.rows[0];
    return row ? {
      profile: {
        ...publicLearnerProfile(row.draft_profile ?? row.profile),
        fullName: row.display_name,
        ...(row.email ? { email: row.email } : {})
      },
      completedProfile: {
        ...publicLearnerProfile(row.profile),
        fullName: row.display_name,
        ...(row.email ? { email: row.email } : {})
      },
      draftAvailable: row.draft_profile !== null,
      version: row.version,
      completedAt: row.completed_at,
      updatedAt: row.updated_at
    } : null;
  }

  async saveProfile(input: {
    learnerId: string;
    profile: LearnerProfileData;
    expectedVersion: number;
    complete: boolean;
  }): Promise<LearnerProfileRecord | null> {
    const client = await this.pool.connect();
    const email = input.profile.email.trim().toLowerCase();
    const profile = { ...input.profile, email };
    try {
      await client.query("begin");
      const identity = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'learner' and status = 'active' for update",
        [input.learnerId]
      );
      if (!identity.rowCount) {
        await client.query("rollback");
        return null;
      }
      const duplicate = await client.query(
        "select 1 from users where id <> $1 and lower(email) = $2 limit 1",
        [input.learnerId, email]
      );
      if (duplicate.rowCount) throw new Error("LEARNER_PROFILE_EMAIL_EXISTS");

      const result = await client.query<{
        profile: LearnerProfileData;
        version: number;
        completed_at: Date | null;
        updated_at: Date;
      }>(
        `insert into learner_profiles (user_id, profile, version, completed_at)
         values ($1, $2::jsonb, 1, case when $4 then now() else null end)
         on conflict (user_id) do update
         set profile = jsonb_set(
           jsonb_set(excluded.profile, '{_operator}', coalesce(learner_profiles.profile->'_operator', '{}'::jsonb), true),
           '{_lifecycle}', coalesce(learner_profiles.profile->'_lifecycle', '{}'::jsonb), true
         ),
             draft_profile = null,
             draft_updated_at = null,
             version = learner_profiles.version + 1,
             completed_at = case when $4 then coalesce(learner_profiles.completed_at, now()) else null end,
             updated_at = now()
         where learner_profiles.version = $3
         returning profile, version, completed_at, updated_at`,
        [input.learnerId, JSON.stringify(profile), input.expectedVersion, input.complete]
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("rollback");
        return null;
      }
      await client.query("update users set email = $2, updated_at = now() where id = $1", [input.learnerId, email]);
      await client.query("commit");
      return {
        profile: row.profile,
        completedProfile: row.profile,
        draftAvailable: false,
        version: row.version,
        completedAt: row.completed_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      await client.query("rollback");
      if (isPostgresUniqueViolation(error)) throw new Error("LEARNER_PROFILE_EMAIL_EXISTS");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveProfileDraft(input: {
    learnerId: string;
    profile: Partial<LearnerProfileData>;
    expectedVersion: number;
  }): Promise<LearnerProfileRecord | null> {
    const result = await this.pool.query<{
      profile: Partial<LearnerProfileData>;
      draft_profile: Partial<LearnerProfileData>;
      version: number;
      completed_at: Date | null;
      draft_updated_at: Date;
    }>(
      `update learner_profiles
       set draft_profile = $2::jsonb, draft_updated_at = now()
       where user_id = $1 and version = $3
       returning profile, draft_profile, version, completed_at, draft_updated_at`,
      [input.learnerId, JSON.stringify(input.profile), input.expectedVersion]
    );
    const row = result.rows[0];
    return row ? {
      profile: row.draft_profile,
      completedProfile: row.profile,
      draftAvailable: true,
      version: row.version,
      completedAt: row.completed_at,
      updatedAt: row.draft_updated_at
    } : null;
  }

  async updateMonthlyGoal(learnerId: string, monthlyGoal: string): Promise<AssessmentMonthlyGoalView | null> {
    const client = await this.pool.connect();
    const now = new Date();
    try {
      await client.query("begin");
      const identity = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'learner' and status = 'active' for update",
        [learnerId]
      );
      if (!identity.rows[0]) {
        await client.query("rollback");
        return null;
      }
      const current = await client.query<{ profile: unknown }>(
        "select profile from learner_profiles where user_id = $1 for update", [learnerId]
      );
      const profile = profileObject(current.rows[0]?.profile);
      const updated = { ...profile, monthlyGoal };
      if (current.rows[0]) {
        await client.query(
          "update learner_profiles set profile = $2::jsonb, version = version + 1, updated_at = $3 where user_id = $1",
          [learnerId, JSON.stringify(updated), now]
        );
      } else {
        await client.query(
          "insert into learner_profiles (user_id, profile, version, updated_at) values ($1, $2::jsonb, 1, $3)",
          [learnerId, JSON.stringify(updated), now]
        );
      }
      await client.query("commit");
      return { learnerId, monthlyGoal, updatedBy: learnerId, updatedAt: now.toISOString() };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async acknowledgeRewardAnnouncement(learnerId: string, announcementId: string): Promise<boolean> {
    const seasonUp = /^season-up:(?:(A1|A2|B1|B2|C1):)?([2-4])$/.exec(announcementId);
    if (seasonUp) {
      // The Season congratulation is shown once: closing it marks that Season (and lower ones) of the level celebrated.
      const result = await this.pool.query(
        `update learner_season_milestones set celebrated_at = now()
         where learner_id = $1 and season_level <= $2 and celebrated_at is null
           and ($3::text is null or cefr = $3)`,
        [learnerId, Number(seasonUp[2]), seasonUp[1] ?? null]
      );
      return Boolean(result.rowCount);
    }
    const current = await this.learnerLifecycle(learnerId, 0, false);
    if (!current || current.rewardAnnouncement.kind === "normal"
      || current.rewardAnnouncement.announcementId !== announcementId) return false;

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{ profile: unknown }>(
        `select lp.profile
         from learner_profiles lp
         join users u on u.id = lp.user_id and u.role = 'learner' and u.status = 'active'
         where lp.user_id = $1
         for update`, [learnerId]
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("rollback");
        return false;
      }
      const profile = profileObject(row.profile);
      const lifecycle = learnerLifecycleState(profile);
      await client.query(
        `update learner_profiles
         set profile = $2::jsonb, version = version + 1, updated_at = now()
         where user_id = $1`,
        [learnerId, JSON.stringify({
          ...profile,
          _lifecycle: { ...lifecycle, rewardAnnouncementAcknowledged: announcementId }
        })]
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async learnerLifecycle(learnerId: string, points: number, eligible = false): Promise<{
    levelUpPhase: LevelUpPhase;
    monthlyGoal: string | null;
    rewardAnnouncement: RewardAnnouncementView;
  } | null> {
    const [identity, profileResult, levelup, seasonMilestone] = await Promise.all([
      this.pool.query<{ cefr: CefrLevel | null; cefr_approved: boolean }>(
        `select e.cefr, e.cefr_approved from enrollments e
         join programs p on p.id = e.program_id and p.status = 'active'
         where e.learner_id = $1 order by e.cefr_approved desc, e.enrolled_at desc limit 1`, [learnerId]
      ),
      this.pool.query<{ profile: unknown }>("select profile from learner_profiles where user_id = $1", [learnerId]),
      this.pool.query<{
        attempt_id: string; attempt_status: string; decision_status: string | null; approved_level: CefrLevel | null;
        target_level: CefrLevel | null; challenge_status: string | null; challenge_passed: boolean | null;
      }>(
        `select aa.id as attempt_id, aa.status as attempt_status,
                decision.status as decision_status, decision.approved_level,
                nullif(av.blueprint->>'targetLevel', '') as target_level,
                challenge.status as challenge_status, challenge.passed as challenge_passed
         from assessment_attempts aa
         join assessment_versions av on av.id = aa.assessment_version_id
         join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'level_up'
         left join assessment_decisions decision on decision.attempt_id = aa.id
         left join lateral (
           select cs.status, result.passed
           from coach_sessions cs
           left join level_up_challenge_results result on result.session_id = cs.id
           where cs.learner_id = aa.learner_id and cs.scenario->>'kind' = 'level_up'
             and cs.scenario->>'assessmentAttemptId' = aa.id::text
           order by cs.started_at desc limit 1
         ) challenge on true
         where aa.learner_id = $1
           and aa.started_at >= coalesce((
             select max(ae.created_at) from audit_events ae
             where ae.entity_id = $1 and ae.action = 'assessment.learner.level_changed'
               and ae.payload->>'mode' = 'direct' and ae.payload->>'previousLevel' is distinct from ae.payload->>'targetLevel'
           ), '-infinity'::timestamptz)
         order by aa.started_at desc limit 1`, [learnerId]
      ),
      this.pool.query<{ season_level: number; cefr: CefrLevel; points_in_level: number }>(
        `select m.season_level, m.cefr, learner_points_in_level(m.learner_id) as points_in_level
         from learner_season_milestones m
         where m.learner_id = $1 and m.celebrated_at is null and m.cefr = learner_current_cefr(m.learner_id)
         order by m.season_level desc limit 1`, [learnerId]
      )
    ]);
    const profile = profileObject(profileResult.rows[0]?.profile);
    const enrollment = identity.rows[0];
    const current = levelup.rows[0];
    let levelUpPhase: LevelUpPhase = "none";
    if (enrollment?.cefr_approved) {
      if (!current) {
        levelUpPhase = eligible ? "eligible" : "none";
      } else if (current.attempt_status === "in_progress") {
        levelUpPhase = "testing";
      } else if (current.challenge_passed === true && current.decision_status === "approved") {
        levelUpPhase = "approved";
      } else if (current.challenge_passed === true && current.decision_status === "suggested") {
        levelUpPhase = "requested";
      } else if (current.challenge_passed === false || current.attempt_status === "needs_retry" || current.decision_status === "rejected") {
        levelUpPhase = "failed";
      } else if (current.challenge_status === "active") {
        levelUpPhase = "challenge";
      } else if (["submitted", "pending_review"].includes(current.attempt_status)) {
        levelUpPhase = "ungraded";
      } else if (current.decision_status === "approved") {
        levelUpPhase = "approved";
      } else {
        levelUpPhase = "eligible";
      }
    }
    const latest = operatorProfileState(profile).levelHistory?.at(-1);
    const parsedChange = latest?.changedAt ? new Date(latest.changedAt) : null;
    const latestChangedAt = parsedChange && Number.isFinite(parsedChange.getTime()) ? parsedChange : null;
    const latestLevel = latest?.to ?? null;
    const newLevel = Boolean(latestChangedAt && latestLevel === enrollment?.cefr
      && latest?.from !== latestLevel && Date.now() - latestChangedAt.getTime() < 30 * 24 * 60 * 60 * 1000);
    const raised = Boolean(latest?.from && cefrIndex(latest.from) < cefrIndex(latestLevel));
    const candidateKind = enrollment?.cefr === "C1" ? "top-level-redirect"
      : newLevel ? raised ? "new-level-announcement" : "level-adjustment" : "normal";
    const candidateId = candidateKind === "top-level-redirect"
      ? `top-level:${enrollment?.cefr ?? "C1"}:${latestChangedAt?.toISOString() ?? "current"}`
      : newLevel && latestLevel && latestChangedAt
        ? `level-up:${latestLevel}:${latestChangedAt.toISOString()}` : undefined;
    const lifecycle = learnerLifecycleState(profile);
    const acknowledged = Boolean(candidateId && lifecycle.rewardAnnouncementAcknowledged === candidateId);
    const announcementKind = acknowledged ? "normal" : candidateKind;
    const seasonName = seasonNameForDate(new Date());
    // A newly reached Season (of the current level's ladder) waits behind a level announcement and is congratulated once.
    const milestone = seasonMilestone.rows[0];
    const reachedSeason = announcementKind === "normal" && milestone
      ? SEASONS.find((season) => season.level === milestone.season_level) ?? null
      : null;
    if (reachedSeason && milestone) {
      return {
        levelUpPhase,
        monthlyGoal: typeof profile.monthlyGoal === "string" && profile.monthlyGoal.trim() ? profile.monthlyGoal : null,
        rewardAnnouncement: {
          kind: "season-up",
          points: Number(milestone.points_in_level),
          nextPoints: SEASONS.find((season) => season.level === reachedSeason.level + 1)?.pointsRequired ?? null,
          seasonName: rewardSeasonLabel(reachedSeason, milestone.cefr),
          seasonLevel: reachedSeason.level,
          level: milestone.cefr,
          announcementId: `season-up:${milestone.cefr}:${reachedSeason.level}`,
          source: "genuine",
          rule: "Mỗi trình độ có 4 Season. Lên Season khi đủ điểm trong trình độ và mọi huy hiệu của Season đó; đi lần lượt, không nhảy cấp. Huy hiệu đã nhận được giữ mãi."
        }
      };
    }
    return {
      levelUpPhase,
      monthlyGoal: typeof profile.monthlyGoal === "string" && profile.monthlyGoal.trim() ? profile.monthlyGoal : null,
      rewardAnnouncement: {
        kind: announcementKind,
        points,
        nextPoints: nextSeasonPointsTier(points),
        seasonName,
        level: (newLevel ? latestLevel : enrollment?.cefr) ?? null,
        ...(announcementKind === "normal" ? {} : {
          ...(candidateId ? { announcementId: candidateId } : {}),
          source: "genuine" as const,
          rule: announcementKind === "top-level-redirect"
            ? "Mức C1 là mức cao nhất của lộ trình hiện tại."
            : announcementKind === "level-adjustment"
              ? "Đường lên mức bắt đầu lại theo trình độ mới. Kết quả trước đây vẫn được lưu trong lịch sử."
              : "Mức mới chỉ được công nhận sau khi người vận hành duyệt bằng chứng học tập."
        })
      }
    };
  }

  async listLessons(learnerId: string, weekId: string): Promise<LearnerLessonRecord[]> {
    const result = await this.pool.query<{
      id: string;
      title: string;
      day_number: number;
      week_number: number;
      week_topic: string;
      cefr: CefrLevel;
      content: LessonContent & { durationMinutes?: number };
      lesson_count: string;
      opens_at: string;
      opens_later: boolean;
      blocker_id: string | null;
      blocker_day_number: number | null;
      blocker_title: string | null;
      progress_status: LessonProgressView["status"] | null;
      progress_score: string | null;
      progress_evidence: Record<string, unknown> | null;
      progress_updated_at: Date | null;
    }>(
      `select l.id, l.title, l.day_number, pw.week_number, coalesce(nullif(lsv.payload->>'topic', ''), pw.topic) as week_topic, ls.cefr, lv.content,
              (select count(*) from lessons all_lessons where all_lessons.lesson_set_version_id = lsv.id)::text as lesson_count,
              (p.start_date + ((pw.week_number - 1) * 7 + l.day_number - 1))::text as opens_at,
              (p.start_date + ((pw.week_number - 1) * 7 + l.day_number - 1)) > organization_system_date(p.organization_id) as opens_later,
              blocker.id as blocker_id, blocker.day_number as blocker_day_number, blocker.title as blocker_title,
              pr.status as progress_status, pr.score::text as progress_score,
              pr.evidence as progress_evidence, pr.updated_at as progress_updated_at
       from enrollments e
       join lesson_sets ls on ls.program_week_id = $2 and ls.cefr = e.cefr
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
       join program_weeks pw on pw.id = ls.program_week_id
       join programs p on p.id = pw.program_id
       join lessons l on l.lesson_set_version_id = lsv.id
       join lateral (
         select content from lesson_versions
         where lesson_id = l.id and status = 'published'
         order by version desc limit 1
       ) lv on true
       left join lateral (
         select previous.id, previous.day_number, previous.title
         from lessons previous
         where previous.lesson_set_version_id = lsv.id
           and previous.day_number < l.day_number
           and not exists (
             select 1 from progress_records previous_progress
             where previous_progress.learner_id = e.learner_id
               and previous_progress.lesson_id = previous.id
               and previous_progress.status = 'completed'
           )
         order by previous.day_number
         limit 1
       ) blocker on true
       left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = e.learner_id
       where e.learner_id = $1
       order by l.day_number`,
      [learnerId, weekId]
    );
    return result.rows.map(mapLessonRow);
  }

  async listMonthlyLessons(learnerId: string, month: string): Promise<LearnerLessonRecord[]> {
    const access = await learnerMonthlyAccess(this.pool, learnerId, month);
    if (access?.state !== "active") return [];
    const result = await this.pool.query<LearnerLessonQueryRow & { organization_id: string; review_gates_next_week: boolean | null; review_from_previous_month: boolean | null }>(
      `select l.id, l.title, ml.lesson_number as day_number, 0 as week_number, pm.theme_title as week_topic, mf.cefr, lv.content, mf.curriculum_contract->'coreTerms' as monthly_core_terms,
              ${FROZEN_MONTHLY_ILLUSTRATIONS_SQL} as frozen_illustrations, (select lesson_spec.item from jsonb_array_elements(mf.curriculum_contract->'daySpecs') as lesson_spec(item) where (lesson_spec.item->>'lessonNumber')::int = ml.lesson_number limit 1) as monthly_day_spec,
              (select count(*)::int from jsonb_array_elements(mf.curriculum_contract->'daySpecs') as ordinal_spec(item) where ordinal_spec.item->>'kind' = 'new' and (ordinal_spec.item->>'lessonNumber')::int <= ml.lesson_number) as monthly_new_ordinal,
              (select count(*)::int from jsonb_array_elements(mf.curriculum_contract->'daySpecs') as ordinal_spec(item) where ordinal_spec.item->>'kind' = 'review' and (ordinal_spec.item->>'lessonNumber')::int <= ml.lesson_number) as monthly_review_ordinal, case when (mf.curriculum_contract->'daySpecs' @> jsonb_build_array(jsonb_build_object('lessonNumber', ml.lesson_number, 'kind', 'review'))) then 'review' else 'new' end as monthly_kind, ml.lesson_date::text as lesson_date, organization_system_date(pm.organization_id)::text as system_date,
              (select count(*) from month_lessons count_ml where count_ml.framework_id = mf.id and count_ml.status = 'approved')::text as lesson_count,
              ml.lesson_date::text as opens_at, ml.lesson_date > organization_system_date(pm.organization_id) as opens_later,
              null::uuid as blocker_id, null::int as blocker_day_number, null::text as blocker_title,
              pm.organization_id, (day_spec.spec->>'reviewGatesNextWeek')::boolean as review_gates_next_week,
              (day_spec.spec->>'reviewFromPreviousMonth')::boolean as review_from_previous_month,
              pr.status as progress_status, pr.score::text as progress_score, pr.evidence as progress_evidence, pr.updated_at as progress_updated_at
       from enrollments e
       join program_months pm on pm.organization_id = (select organization_id from users where id = e.learner_id) and pm.month = $2
       join month_frameworks mf on mf.program_month_id = pm.id and mf.cefr = e.cefr and mf.status = 'approved' and mf.published_at is not null
       join month_lessons ml on ml.framework_id = mf.id and ml.status = 'approved' and ml.lesson_id is not null and ml.scope_hash = mf.scope_hash
       join lessons l on l.id = ml.lesson_id
       join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
       join lateral (select content from lesson_versions where lesson_id = l.id and status = 'published' order by version desc limit 1) lv on true
       left join lateral (
         select spec from jsonb_array_elements(mf.curriculum_contract->'daySpecs') spec
         where (spec->>'lessonNumber')::int = ml.lesson_number limit 1
       ) day_spec on true
       left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = e.learner_id
       where e.learner_id = $1 and e.cefr = $3
         and pm.month between to_char(organization_system_date(pm.organization_id) - interval '1 month', 'YYYY-MM')
                          and to_char(organization_system_date(pm.organization_id), 'YYYY-MM')
       order by ml.lesson_number`,
      [learnerId, month, access.cefr]
    );
    // A learner who joins mid-month (≥ 75% window) still studies the whole month
    // from lesson 1 in sequence (catch-up). The start date only bounds the
    // attendance window; a Friday review dated before it never gates later lessons.
    for (const row of result.rows) {
      if (row.monthly_kind === "review" && row.lesson_date && row.lesson_date < access.startDate) row.review_gates_next_week = false;
    }
    const first = result.rows[0];
    if (!first) return [];
    const holidays = await this.pool.query<{ holiday_date: string }>(
      `select holiday_date::text as holiday_date from organization_holidays
       where organization_id = $1 and to_char(holiday_date, 'YYYY-MM') = $2`,
      [first.organization_id, month]
    );
    const records = result.rows.map(mapLessonRow);
    return applyMonthlyLessonAccess(records, result.rows, month, first.system_date ?? `${month}-01`, mergedVietnamHolidays(month, holidays.rows.map(row => ({ date: row.holiday_date }))).map(day => day.date));
  }

  async findLesson(learnerId: string, lessonId: string): Promise<LearnerLessonRecord | null> {
    const result = await this.pool.query<LearnerLessonQueryRow>(
      `select l.id, l.title, l.day_number, pw.week_number, coalesce(nullif(lsv.payload->>'topic', ''), pw.topic) as week_topic, ls.cefr, lv.content,
              (select count(*) from lessons all_lessons where all_lessons.lesson_set_version_id = lsv.id)::text as lesson_count,
              (p.start_date + ((pw.week_number - 1) * 7 + l.day_number - 1))::text as opens_at,
              (p.start_date + ((pw.week_number - 1) * 7 + l.day_number - 1)) > organization_system_date(p.organization_id) as opens_later,
              blocker.id as blocker_id, blocker.day_number as blocker_day_number, blocker.title as blocker_title,
              pr.status as progress_status, pr.score::text as progress_score,
              pr.evidence as progress_evidence, pr.updated_at as progress_updated_at
       from lessons l
       join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
       join lesson_sets ls on ls.id = lsv.lesson_set_id
       join program_weeks pw on pw.id = ls.program_week_id
       join programs p on p.id = pw.program_id
       join enrollments e on e.program_id = pw.program_id and e.cefr = ls.cefr and e.learner_id = $1
       join lateral (
         select content from lesson_versions
         where lesson_id = l.id and status = 'published'
         order by version desc limit 1
       ) lv on true
       left join lateral (
         select previous.id, previous.day_number, previous.title
         from lessons previous
         where previous.lesson_set_version_id = lsv.id
           and previous.day_number < l.day_number
           and not exists (
             select 1 from progress_records previous_progress
             where previous_progress.learner_id = e.learner_id
               and previous_progress.lesson_id = previous.id
               and previous_progress.status = 'completed'
           )
         order by previous.day_number
         limit 1
       ) blocker on true
       left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = e.learner_id
       where l.id = $2
       limit 1`,
      [learnerId, lessonId]
    );
    let row = result.rows[0];
    if (!row) {
      const monthly = await this.pool.query<LearnerLessonQueryRow & { monthly_month: string }>(
        `select pm.month as monthly_month, l.id, l.title, ml.lesson_number as day_number, 0 as week_number, pm.theme_title as week_topic, mf.cefr, lv.content, lv.id as exercise_version_id, mf.curriculum_contract->'coreTerms' as monthly_core_terms, mf.curriculum_contract->'grammarTopics' as monthly_grammar_topics,
              ${FROZEN_MONTHLY_ILLUSTRATIONS_SQL} as frozen_illustrations, (select lesson_spec.item from jsonb_array_elements(mf.curriculum_contract->'daySpecs') as lesson_spec(item) where (lesson_spec.item->>'lessonNumber')::int = ml.lesson_number limit 1) as monthly_day_spec,
              (select count(*)::int from jsonb_array_elements(mf.curriculum_contract->'daySpecs') as ordinal_spec(item) where ordinal_spec.item->>'kind' = 'new' and (ordinal_spec.item->>'lessonNumber')::int <= ml.lesson_number) as monthly_new_ordinal,
              (select count(*)::int from jsonb_array_elements(mf.curriculum_contract->'daySpecs') as ordinal_spec(item) where ordinal_spec.item->>'kind' = 'review' and (ordinal_spec.item->>'lessonNumber')::int <= ml.lesson_number) as monthly_review_ordinal, case when (mf.curriculum_contract->'daySpecs' @> jsonb_build_array(jsonb_build_object('lessonNumber', ml.lesson_number, 'kind', 'review'))) then 'review' else 'new' end as monthly_kind, ml.lesson_date::text as lesson_date, organization_system_date((select organization_id from users where id = e.learner_id))::text as system_date,
                (select count(*) from month_lessons count_ml where count_ml.framework_id = mf.id and count_ml.status = 'approved')::text as lesson_count,
                ml.lesson_date::text as opens_at, ml.lesson_date > organization_system_date((select organization_id from users where id = e.learner_id)) as opens_later,
                blocker.id as blocker_id, blocker.day_number as blocker_day_number, blocker.title as blocker_title,
                pr.status as progress_status, pr.score::text as progress_score, pr.evidence as progress_evidence, pr.updated_at as progress_updated_at
         from enrollments e
         join program_months pm on pm.organization_id = (select organization_id from users where id = e.learner_id)
         join month_frameworks mf on mf.program_month_id = pm.id and mf.cefr = e.cefr and mf.status = 'approved' and mf.published_at is not null
         join month_lessons ml on ml.framework_id = mf.id and ml.status = 'approved' and ml.lesson_id is not null and ml.scope_hash = mf.scope_hash
         join lessons l on l.id = ml.lesson_id
         join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
         join lateral (select id, content from lesson_versions where lesson_id = l.id and status = 'published' order by version desc limit 1) lv on true
         left join lateral (
           select previous_l.id, previous_ml.lesson_number as day_number, previous_l.title
           from month_lessons previous_ml join lessons previous_l on previous_l.id = previous_ml.lesson_id
           where previous_ml.framework_id = mf.id and previous_ml.status = 'approved' and previous_ml.lesson_number < ml.lesson_number
             and not exists (select 1 from progress_records previous_progress where previous_progress.learner_id = e.learner_id and previous_progress.lesson_id = previous_l.id and previous_progress.status = 'completed')
           order by previous_ml.lesson_number limit 1
         ) blocker on true
         left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = e.learner_id
         where e.learner_id = $1 and l.id = $2
           and pm.month between to_char(organization_system_date(pm.organization_id) - interval '1 month', 'YYYY-MM')
                            and to_char(organization_system_date(pm.organization_id), 'YYYY-MM')
         limit 1`,
        [learnerId, lessonId]
      );
      row = monthly.rows[0];
    }
    if (!row) return null;
    let lesson = mapLessonRow(row);
    const monthlyMonth = (row as { monthly_month?: string }).monthly_month;
    if (monthlyMonth) {
      // Monthly locks are computed over the whole month (review gate, holidays).
      const monthLesson = (await this.listMonthlyLessons(learnerId, monthlyMonth)).find((candidate) => candidate.id === lesson.id);
      if (!monthLesson) return null;
      lesson = { ...lesson, lock: monthLesson.lock };
    }
    const appeals = await this.pool.query<{ part_code: LessonPartCode; status: "pending" | "accepted" | "rejected"; resolution: string | null; exercise_version_id: string | null }>(
      `select distinct on (part_code) part_code, status, resolution, exercise_version_id from lesson_part_appeals
       where learner_id = $1 and lesson_id = $2
         and (exercise_version_id is null or exercise_version_id = $3)
       order by part_code, created_at desc`,
      [learnerId, lessonId, lesson.exerciseVersionId ?? null]
    );
    const submittedSpeaking = lesson.progress.evidence.speaking?.status === "submitted"
      && Boolean(lesson.progress.evidence.speaking.artifactKey);
    if (!appeals.rowCount && !submittedSpeaking) return lesson;
    const completedPartCodes = Array.from(new Set([
      ...lesson.progress.completedPartCodes,
      ...(submittedSpeaking ? ["speaking" as const] : []),
      ...appeals.rows.filter(appeal => !appeal.exercise_version_id && (appeal.status === "accepted" || (
        appeal.status === "pending" && ["appealed", "wrong_exhausted"].includes(lesson.progress.evidence[appeal.part_code]?.status ?? "")
      ))).map(appeal => appeal.part_code)
    ])) as LessonPartCode[];
    const evidence = { ...lesson.progress.evidence };
    for (const appeal of appeals.rows) {
      const current = evidence[appeal.part_code];
      if (appeal.exercise_version_id) {
        evidence[appeal.part_code] = { attempts: 0, ...current, appealStatus: appeal.status };
        continue;
      }
      if (appeal.status !== "accepted" && !["appealed", "wrong_exhausted"].includes(current?.status ?? "")) {
        evidence[appeal.part_code] = { attempts: 0, ...current, appealStatus: appeal.status };
        continue;
      }
      evidence[appeal.part_code] = {
        attempts: current?.attempts ?? 0,
        appealStatus: appeal.status,
        ...(current?.answer === undefined ? {} : { answer: current.answer }),
        ...(current?.score === undefined ? {} : { score: current.score }),
        ...(current?.artifactKey === undefined ? {} : { artifactKey: current.artifactKey }),
        ...(current?.translationViewed === undefined ? {} : { translationViewed: current.translationViewed }),
        status: appeal.status === "pending" ? "appealed" : appeal.status === "accepted" ? "correct" : current?.status ?? "wrong_exhausted",
        feedback: appeal.status === "pending" ? "Kháng nghị đã được gửi tới người vận hành." : appeal.resolution || (appeal.status === "accepted" ? "Kháng nghị đã được chấp nhận." : "Kết quả được giữ nguyên.")
      };
    }
    return { ...lesson, progress: { ...lesson.progress, completedPartCodes, evidence } };
  }

  /** Stored Friday review state (resume point); null before the first visit. */
  async getWeeklyReviewState(learnerId: string, lessonId: string): Promise<{ state: unknown; completedAt: string | null } | null> {
    const result = await this.pool.query<{ state: unknown; completed_at: Date | null }>(
      "select state, completed_at from learner_review_sessions where learner_id = $1 and lesson_id = $2",
      [learnerId, lessonId]
    );
    const row = result.rows[0];
    return row ? { state: row.state, completedAt: row.completed_at?.toISOString() ?? null } : null;
  }

  /**
   * Persists review state after every answer. Completing the review completes
   * its lesson record; the completion time drives attendance and the unlock
   * gate. Review answers never touch lesson_part_attempts.
   */
  async saveWeeklyReviewState(input: { learnerId: string; lessonId: string; state: unknown; completed: boolean }): Promise<void> {
    const saved = await this.pool.query<{ completed_at: Date | null }>(
      `insert into learner_review_sessions (id, learner_id, lesson_id, state, completed_at, updated_at)
       values ($1, $2, $3, $4::jsonb, case when $5 then now() else null end, now())
       on conflict (learner_id, lesson_id) do update
       set state = excluded.state,
           completed_at = coalesce(learner_review_sessions.completed_at, excluded.completed_at),
           updated_at = now()
       returning completed_at`,
      [randomUUID(), input.learnerId, input.lessonId, JSON.stringify(input.state), input.completed]
    );
    if (!input.completed || !saved.rows[0]?.completed_at) return;
    const existing = await this.pool.query<{ status: string }>(
      "select status from progress_records where learner_id = $1 and lesson_id = $2",
      [input.learnerId, input.lessonId]
    );
    if (existing.rows[0]?.status === "completed") return;
    await this.saveLessonProgress({
      learnerId: input.learnerId,
      lessonId: input.lessonId,
      progress: { status: "completed", completedPartCodes: [], evidence: {} }
    });
  }

  async saveLessonProgress(input: {
    learnerId: string;
    lessonId: string;
    progress: LessonProgressView;
  }): Promise<LessonProgressView> {
    const result = await this.pool.query<{
      status: LessonProgressView["status"];
      score: string | null;
      evidence: Record<string, unknown>;
      updated_at: Date;
    }>(
      `insert into progress_records
         (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at, updated_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, now(), case when $4 = 'completed' then now() else null end, now())
       on conflict (learner_id, lesson_id) do update
       set status = excluded.status,
           score = coalesce(excluded.score, progress_records.score),
           evidence = excluded.evidence,
           completed_at = case when excluded.status = 'completed' then coalesce(progress_records.completed_at, now()) else progress_records.completed_at end,
           updated_at = now()
       returning status, score::text, evidence, updated_at`,
      [
        randomUUID(), input.learnerId, input.lessonId, input.progress.status,
        input.progress.score ?? null,
        JSON.stringify({
          completedPartCodes: input.progress.completedPartCodes,
          evidence: input.progress.evidence
        })
      ]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Could not persist lesson progress");
    if (input.progress.status === "completed") await withLearnerRewardLock(this.pool, input.learnerId, async (client) => {
      const [previousActivities, lessonDuration] = await Promise.all([
        client.query<{ count: string }>(
          `select count(*)::text as count from activities
           where learner_id = $1 and reference_type = 'lesson' and reference_id = $2
             and activity_type in ('lesson', 'lesson_review')`,
          [input.learnerId, input.lessonId]
        ),
        client.query<{ duration_minutes: string | null }>(
          `select case
                    when coalesce(content->>'durationMinutes', '') ~ '^\\d+$'
                      then content->>'durationMinutes'
                    else null
                  end as duration_minutes
           from lesson_versions
           where lesson_id = $1 and status = 'published'
           order by version desc
           limit 1`,
          [input.lessonId]
        )
      ]);
      const activity = lessonCompletionActivity(
        Number(previousActivities.rows[0]?.count ?? 0),
        Number(lessonDuration.rows[0]?.duration_minutes ?? 10)
      );
      await client.query(
        `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
         values ($1, $2, $3, 'lesson', $4, $5, $6::jsonb)`,
        [
          randomUUID(), input.learnerId, activity.activityType, input.lessonId, activity.minutes,
          JSON.stringify({ score: input.progress.score ?? null, review: activity.activityType === "lesson_review" })
        ]
      );
      await syncLearnerRewards(client, input.learnerId);
    });
    return mapProgress(row.status, row.score, row.evidence, row.updated_at);
  }

  async submitLessonPartAttempt(input: {
    learnerId: string;
    lessonId: string;
    partCode: LessonPartCode;
    requestId: string;
    evidence: LessonPartAttemptEvidenceInput;
    /** Speaking uploads and self-written Writing are queued for background AI grading. */
    aiGrading?: boolean;
  }): Promise<LessonPartAttemptView | null> {
    const lesson = await this.findLesson(input.learnerId, input.lessonId);
    const part = lesson?.content.parts.find((candidate) => candidate.code === input.partCode);
    if (!lesson || !part) return null;

    if (input.evidence.translated) {
      const current = lesson.progress.evidence[input.partCode];
      const evidence: PartEvidence = {
        attempts: current?.attempts ?? 0,
        ...(current?.status === undefined ? {} : { status: current.status }),
        ...(current?.answer === undefined ? {} : { answer: current.answer }),
        ...(current?.score === undefined ? {} : { score: current.score }),
        ...(current?.artifactKey === undefined ? {} : { artifactKey: current.artifactKey }),
        translationViewed: true,
        feedback: "Bản dịch đã được mở để bạn đối chiếu."
      };
      const progress = await this.saveLessonProgress({
        learnerId: input.learnerId,
        lessonId: input.lessonId,
        progress: { ...lesson.progress, evidence: { ...lesson.progress.evidence, [input.partCode]: evidence } }
      });
      return { lessonId: input.lessonId, partCode: input.partCode, evidence, progress };
    }

    const client = await this.pool.connect();
    let attemptId: string | null = null;
    let storedEvidence: PartEvidence | null = null;
    try {
      await client.query("begin");
      let gradingContent = part.content;
      if (lesson.exerciseVersionId) {
        await client.query("select id from lessons where id = $1 for update", [input.lessonId]);
        const latest = await client.query<{ content: LessonContent }>(
          "select content from lesson_versions where lesson_id = $1 and status = 'published' order by version desc limit 1",
          [input.lessonId]
        );
        gradingContent = latest.rows[0]?.content.parts.find(item => item.code === input.partCode)?.content ?? gradingContent;
      }
      const duplicate = await client.query<{
        id: string; attempt_number: number; status: StoredLessonAttemptStatus; answer: string | null;
        score: string | null; feedback: string | null; artifact_key: string | null; grading: LessonAttemptGrading | null;
      }>(
        `select id, attempt_number, status, answer, score::text, feedback, artifact_key, grading
         from lesson_part_attempts where learner_id = $1 and request_key = $2`,
        [input.learnerId, input.requestId]
      );
      const existing = duplicate.rows[0];
      if (existing) {
        attemptId = existing.id;
        storedEvidence = mapPartEvidence(existing);
        await client.query("commit");
      } else {
        // A 'retake' (unclear recording) never uses up one of the two attempts.
        const count = await client.query<{ count: string; reused: boolean }>(
          `select count(*) filter (where status <> 'retake')::text as count,
                  coalesce(bool_or($4::text is not null and artifact_key = $4), false) as reused
           from lesson_part_attempts
           where learner_id = $1 and lesson_id = $2 and part_code = $3`,
          [input.learnerId, input.lessonId, input.partCode, input.evidence.artifactKey ?? null]
        );
        if (input.partCode === "speaking" && count.rows[0]?.reused) throw new Error("LESSON_SPEAKING_NEW_RECORDING_REQUIRED");
        const attemptNumber = Number(count.rows[0]?.count ?? 0) + 1;
        const graded = gradeLessonPart(part.code, gradingContent, input.evidence, attemptNumber);
        const newAttemptId = randomUUID();
        const queueAi = Boolean(input.aiGrading) && graded.status === "submitted";
        const pendingGrading: LessonAttemptGrading = { state: "pending", queuedAt: new Date().toISOString() };
        const inserted = await client.query<{
          id: string; attempt_number: number; status: StoredLessonAttemptStatus; answer: string | null;
          score: string | null; feedback: string | null; artifact_key: string | null; grading: LessonAttemptGrading | null;
        }>(
          `insert into lesson_part_attempts
             (id, learner_id, lesson_id, part_code, request_key, attempt_number, status, answer, score, feedback, artifact_key, grading)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
           on conflict (learner_id, request_key) do nothing
           returning id, attempt_number, status, answer, score::text, feedback, artifact_key, grading`,
          [newAttemptId, input.learnerId, input.lessonId, input.partCode, input.requestId, attemptNumber,
            graded.status, input.evidence.answer ?? null, graded.score, graded.feedback, input.evidence.artifactKey ?? null,
            queueAi ? JSON.stringify(pendingGrading) : null]
        );
        if (queueAi && inserted.rows[0]) {
          await client.query(
            `insert into jobs (id, kind, payload, max_attempts, idempotency_key)
             values ($1, $2, $3::jsonb, 3, $4) on conflict (idempotency_key) do nothing`,
            [randomUUID(), LESSON_PRODUCTIVE_GRADING_JOB, JSON.stringify({ learnerId: input.learnerId, attemptId: newAttemptId }), `lesson-grade:${newAttemptId}`]
          );
        }
        const row = inserted.rows[0];
        if (!row) {
          const raced = await client.query<{
            id: string; attempt_number: number; status: StoredLessonAttemptStatus; answer: string | null;
            score: string | null; feedback: string | null; artifact_key: string | null; grading: LessonAttemptGrading | null;
          }>(
            `select id, attempt_number, status, answer, score::text, feedback, artifact_key, grading
             from lesson_part_attempts where learner_id = $1 and request_key = $2`,
            [input.learnerId, input.requestId]
          );
          const racedRow = raced.rows[0];
          if (!racedRow) throw new Error("LESSON_ATTEMPT_IDEMPOTENCY_RACE");
          attemptId = racedRow.id;
          storedEvidence = mapPartEvidence(racedRow);
          await client.query("commit");
        } else {
          attemptId = row.id;
          storedEvidence = mapPartEvidence(row);
          if (input.partCode === "speaking" && input.evidence.artifactKey) {
            await linkAudioOnClient(client, {
              ownerUserId: input.learnerId,
              audio: { artifactKey: input.evidence.artifactKey },
              sourceFlow: "daily_lesson",
              sourceEntityId: attemptId,
              taskKey: input.partCode
            });
          }
          const currentEvidence = lesson.progress.evidence;
          // Practising a part again after a correct answer is allowed, but the
          // correct result stays the part's result (and the retry earns nothing).
          const keepCorrect = currentEvidence[input.partCode]?.status === "correct";
          const mergedEvidence = keepCorrect ? currentEvidence : { ...currentEvidence, [input.partCode]: storedEvidence };
          // A persisted writing response or Speaking upload is the learner's
          // terminal action even when automatic scoring is unavailable. Review
          // can enrich its feedback later without blocking the monthly path.
          const partFinished = ["correct", "wrong_exhausted"].includes(storedEvidence.status ?? "")
            || (input.partCode === "writing" && storedEvidence.status === "submitted" && Boolean(storedEvidence.answer))
            || (input.partCode === "speaking" && storedEvidence.status === "submitted" && Boolean(storedEvidence.artifactKey));
          const completedPartCodes = Array.from(new Set([
            ...lesson.progress.completedPartCodes,
            ...(partFinished ? [input.partCode] : [])
          ])) as LessonPartCode[];
          const status = lesson.progress.status === "completed" ? "completed" : completedPartCodes.length ? "in_progress" : "not_started";
          await client.query(
            `insert into progress_records
               (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at, updated_at)
             values ($1, $2, $3, $4, $5, $6::jsonb, now(), case when $4 = 'completed' then now() else null end, now())
             on conflict (learner_id, lesson_id) do update
             set status = case when progress_records.status = 'completed' then 'completed' else excluded.status end,
                 evidence = excluded.evidence, updated_at = now()`,
            [randomUUID(), input.learnerId, input.lessonId, status, lesson.progress.score ?? null,
              JSON.stringify({ completedPartCodes, evidence: mergedEvidence })]
          );
          if (!keepCorrect && storedEvidence.status === "correct" && storedEvidence.score && storedEvidence.score > 0) {
            await awardLessonPartPoints(client, input.learnerId, attemptId, Math.max(1, 6 - storedEvidence.attempts));
          }
          await client.query("commit");
        }
      }
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    const refreshed = await this.findLesson(input.learnerId, input.lessonId);
    if (!refreshed || !storedEvidence || !attemptId) return null;
    return { lessonId: input.lessonId, partCode: input.partCode, evidence: storedEvidence, progress: refreshed.progress };
  }

  /** A queued daily Speaking/Writing attempt with the lesson it belongs to, for background AI grading. */
  async lessonAttemptForGrading(learnerId: string, attemptId: string): Promise<{
    attempt: { id: string; lessonId: string; partCode: LessonPartCode; attemptNumber: number; answer: string | null; artifactKey: string | null; grading: LessonAttemptGrading | null };
    lesson: LearnerLessonRecord | null;
    partContent: Record<string, unknown> | null;
  } | null> {
    const result = await this.pool.query<{
      id: string; lesson_id: string; part_code: LessonPartCode; attempt_number: number; answer: string | null;
      artifact_key: string | null; grading: LessonAttemptGrading | null; published_content: Record<string, unknown> | null;
    }>(
      `select a.id, a.lesson_id, a.part_code, a.attempt_number, a.answer, a.artifact_key, a.grading,
              (select entry->'content' from lesson_versions lv cross join lateral jsonb_array_elements(lv.content->'parts') entry
               where lv.lesson_id = a.lesson_id and lv.status = 'published' and entry->>'code' = a.part_code
               order by lv.version desc limit 1) as published_content
       from lesson_part_attempts a where a.id = $1 and a.learner_id = $2`,
      [attemptId, learnerId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const lesson = await this.findLesson(learnerId, row.lesson_id);
    const lessonPart = lesson?.content.parts.find((part) => part.code === row.part_code)?.content ?? null;
    return {
      attempt: {
        id: row.id, lessonId: row.lesson_id, partCode: row.part_code, attemptNumber: row.attempt_number,
        answer: row.answer, artifactKey: row.artifact_key, grading: row.grading
      },
      lesson,
      partContent: row.published_content ?? lessonPart
    };
  }

  /**
   * Stores the AI result of a pending attempt and moves the part to the same
   * outcome every other part uses. Only a still-pending attempt is updated, so a
   * retried job never overwrites a grade or an operator decision.
   */
  async saveLessonAttemptGrade(input: {
    learnerId: string;
    attemptId: string;
    status: "correct" | "wrong_retry" | "wrong_exhausted" | "retake";
    score: number;
    feedback: string;
    transcript?: string;
    grading: LessonAttemptGrading;
  }): Promise<PartEvidence | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await client.query<{ grading: LessonAttemptGrading | null }>(
        "select grading from lesson_part_attempts where id = $1 and learner_id = $2 for update",
        [input.attemptId, input.learnerId]
      );
      if (current.rows[0]?.grading?.state !== "pending") {
        await client.query("rollback");
        return null;
      }
      const updated = await client.query<LessonAttemptRow>(
        `update lesson_part_attempts
         set status = $3, score = $4, feedback = $5, answer = coalesce($6, answer), grading = $7::jsonb
         where id = $1 and learner_id = $2
         returning id, lesson_id, part_code, attempt_number, status, answer, score::text, feedback, artifact_key, grading`,
        [input.attemptId, input.learnerId, input.status, input.score, input.feedback, input.transcript ?? null, JSON.stringify(input.grading)]
      );
      const row = updated.rows[0]!;
      const evidence = mapPartEvidence(row);
      await applyLessonAttemptEvidence(client, input.learnerId, row, evidence);
      if (input.status === "correct") {
        await awardLessonPartPoints(client, input.learnerId, row.id, Math.max(1, 6 - row.attempt_number));
      }
      if (input.transcript !== undefined && row.artifact_key) {
        await client.query(
          "update files set transcript = $3 where owner_user_id = $1 and object_key = $2 and purpose = 'assessment_audio'",
          [input.learnerId, row.artifact_key, input.transcript]
        );
      }
      await client.query("commit");
      return evidence;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  /** AI could not grade the attempt: it stays submitted for the operator, with a visible state and the error code. */
  async markLessonAttemptGradingFallback(input: { learnerId: string; attemptId: string; code: string }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const updated = await client.query<LessonAttemptRow>(
        `update lesson_part_attempts
         set grading = coalesce(grading, '{}'::jsonb) || jsonb_build_object('state', 'operator', 'code', $3::text, 'failedAt', now())
         where id = $1 and learner_id = $2 and grading->>'state' = 'pending'
         returning id, lesson_id, part_code, attempt_number, status, answer, score::text, feedback, artifact_key, grading`,
        [input.attemptId, input.learnerId, input.code]
      );
      const row = updated.rows[0];
      if (row) await applyLessonAttemptEvidence(client, input.learnerId, row, mapPartEvidence(row));
      await client.query("commit");
      return Boolean(row);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Failed Speaking/Writing positions from AI-graded daily attempts (M1 error review, Friday review). */
  async lessonFailedPositions(learnerId: string, options: { since?: string; limit?: number } = {}): Promise<Array<{
    attemptId: string; lessonId: string; partCode: LessonPartCode; createdAt: string;
    level: NonNullable<LessonAttemptGrading["level"]>; focus: string | null; failedPositions: LessonAttemptFailedPosition[];
  }>> {
    const result = await this.pool.query<{
      id: string; lesson_id: string; part_code: LessonPartCode; created_at: Date; grading: LessonAttemptGrading;
    }>(
      `select id, lesson_id, part_code, created_at, grading from lesson_part_attempts
       where learner_id = $1 and grading ? 'failedPositions' and jsonb_array_length(grading->'failedPositions') > 0
         and ($2::timestamptz is null or created_at >= $2::timestamptz)
       order by created_at desc limit $3`,
      [learnerId, options.since ?? null, Math.max(1, Math.min(500, options.limit ?? 100))]
    );
    return result.rows.map((row) => ({
      attemptId: row.id, lessonId: row.lesson_id, partCode: row.part_code, createdAt: row.created_at.toISOString(),
      level: row.grading.level ?? "fail", focus: row.grading.focus ?? null, failedPositions: row.grading.failedPositions ?? []
    }));
  }

  async appealLessonPart(input: StoredRequestEvidence & {
    learnerId: string;
    lessonId: string;
    partCode: LessonPartCode;
    reason: string;
    exerciseVersionId?: string | undefined;
  }): Promise<LessonPartAppealView | null> {
    const lesson = await this.findLesson(input.learnerId, input.lessonId);
    if (!lesson || !lesson.content.parts.some((part) => part.code === input.partCode)) return null;
    if (input.exerciseVersionId && (lesson.monthlyKind !== "new" || input.exerciseVersionId !== lesson.exerciseVersionId)) return null;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`${input.learnerId}:${input.lessonId}:${input.partCode}`]);
      if (input.exerciseVersionId) {
        await client.query("select id from lessons where id = $1 for key share", [input.lessonId]);
        const latest = await client.query<{ id: string }>(
          "select id from lesson_versions where lesson_id = $1 and status = 'published' order by version desc limit 1", [input.lessonId]
        );
        if (latest.rows[0]?.id !== input.exerciseVersionId) {
          await client.query("rollback");
          return null;
        }
      }
      const existing = await client.query<{ id: string; status: "pending" | "accepted" | "rejected"; created_at: Date; reason: string }>(
        `select id, status, created_at, reason from lesson_part_appeals
         where learner_id = $1 and lesson_id = $2 and part_code = $3 and exercise_version_id is not distinct from $4
         order by created_at asc limit 1`,
        [input.learnerId, input.lessonId, input.partCode, input.exerciseVersionId ?? null]
      );
      const prior = existing.rows[0];
      if (prior) {
        await client.query("commit");
        return {
          lessonId: input.lessonId, partCode: input.partCode, status: prior.status, reason: prior.reason,
          evidence: lesson.progress.evidence[input.partCode] ?? { attempts: 0 },
          createdAt: prior.created_at.toISOString(), progress: lesson.progress
        };
      }
      const inserted = await client.query<{ id: string; status: "pending" | "accepted" | "rejected"; created_at: Date; reason: string }>(
        `insert into lesson_part_appeals (id, learner_id, lesson_id, part_code, reason, request_scope, screenshot, screenshot_type, exercise_version_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id, status, created_at, reason`,
        [randomUUID(), input.learnerId, input.lessonId, input.partCode, input.reason, ...requestEvidenceValues(input), input.exerciseVersionId ?? null]
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("LESSON_APPEAL_NOT_PERSISTED");
      const current = lesson.progress.evidence[input.partCode];
      if (input.exerciseVersionId || current?.status !== "wrong_exhausted") {
        await client.query("commit");
        return {
          lessonId: input.lessonId, partCode: input.partCode, status: row.status, reason: row.reason,
          evidence: { attempts: 0, ...current, appealStatus: row.status }, createdAt: row.created_at.toISOString(),
          progress: { ...lesson.progress, evidence: {
            ...lesson.progress.evidence, [input.partCode]: { attempts: 0, ...current, appealStatus: row.status }
          } }
        };
      }
      const evidence: PartEvidence = {
        attempts: current?.attempts ?? 0,
        ...(current?.answer === undefined ? {} : { answer: current.answer }),
        ...(current?.score === undefined ? {} : { score: current.score }),
        ...(current?.artifactKey === undefined ? {} : { artifactKey: current.artifactKey }),
        ...(current?.translationViewed === undefined ? {} : { translationViewed: current.translationViewed }),
        status: "appealed",
        feedback: "Kháng nghị đã được gửi tới người vận hành."
      };
      // An appeal is pending operator review, but it is a terminal learner action and must not block lesson completion.
      const completedPartCodes = Array.from(new Set([
        ...lesson.progress.completedPartCodes,
        input.partCode
      ]));
      const status = lesson.progress.status === "completed" ? "completed" : completedPartCodes.length ? "in_progress" : "not_started";
      await client.query(
        `insert into progress_records
           (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at, updated_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, now(), case when $4 = 'completed' then now() else null end, now())
         on conflict (learner_id, lesson_id) do update
         set status = case when progress_records.status = 'completed' then 'completed' else excluded.status end,
             evidence = excluded.evidence, updated_at = now()`,
        [randomUUID(), input.learnerId, input.lessonId, status, lesson.progress.score ?? null,
          JSON.stringify({ completedPartCodes, evidence: { ...lesson.progress.evidence, [input.partCode]: evidence } })]
      );
      await client.query("commit");
      const refreshed = await this.findLesson(input.learnerId, input.lessonId);
      if (!refreshed) return null;
      return {
        lessonId: input.lessonId, partCode: input.partCode, status: row.status, reason: row.reason,
        evidence: refreshed.progress.evidence[input.partCode] ?? evidence,
        createdAt: row.created_at.toISOString(), progress: refreshed.progress
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async findLessonPartAppeal(
    learnerId: string,
    lessonId: string,
    partCode: LessonPartCode,
    exerciseVersionId?: string
  ): Promise<LessonPartAppealView | null> {
    const lesson = await this.findLesson(learnerId, lessonId);
    if (!lesson) return null;
    const result = await this.pool.query<{
      status: "pending" | "accepted" | "rejected";
      reason: string;
      created_at: Date;
    }>(
      `select status, reason, created_at from lesson_part_appeals
       where learner_id = $1 and lesson_id = $2 and part_code = $3 and exercise_version_id is not distinct from $4
       order by created_at asc limit 1`,
      [learnerId, lessonId, partCode, exerciseVersionId ?? null]
    );
    const appeal = result.rows[0];
    if (!appeal) return null;
    return {
      lessonId,
      partCode,
      status: appeal.status,
      reason: appeal.reason,
      evidence: lesson.progress.evidence[partCode] ?? { attempts: 0 },
      createdAt: appeal.created_at.toISOString(),
      progress: lesson.progress
    };
  }

  async getProgressDashboard(learnerId: string): Promise<LearnerProgressView | null> {
    await applyDueScheduledLevelChanges(this.pool, learnerId);
    const learner = await this.pool.query<{
      id: string;
      display_name: string;
      cefr: CefrLevel | null;
      profile: Partial<LearnerProfileData>;
    }>(
      `select u.id, u.display_name, e.cefr, lp.profile
       from users u
       left join learner_profiles lp on lp.user_id = u.id
       left join enrollments e on e.learner_id = u.id
       where u.id = $1 and u.role = 'learner' and u.status = 'active'
       limit 1`,
      [learnerId]
    );
    const row = learner.rows[0];
    if (!row) return null;

    // Fixed criteria; a stored organization_settings.configuration.levelUp is no longer read.
    const thresholds: LevelReadinessThresholds = { ...LEVEL_READINESS_THRESHOLDS };

    const monthlyContext = await this.getActiveMonthlyContext(learnerId);
    const monthlyLessons = monthlyContext ? await this.listMonthlyLessons(learnerId, monthlyContext.month) : [];
    const [reward, weeks, study, activity, badgeRoadmap, coach, practice, assessments, availability, firstTry, monthlyFinal, monthlyFinalPublished] = await Promise.all([
      this.pool.query<{ points: string; badges: Array<{ key: string; label: string }> }>(
        `select coalesce(sum(re.points), 0)::text as points,
                coalesce(jsonb_agg(distinct jsonb_build_object('key', b.badge_key, 'label', b.label))
                  filter (where b.id is not null and ${ACTIVE_BADGE_SQL("b")}), '[]'::jsonb) as badges
         from reward_events re left join badges b on b.id = re.badge_id
         where re.learner_id = $1`, [learnerId]
      ),
      this.pool.query<{
        week_number: number; topic: string; completed_lessons: string; total_lessons: string;
        start_date: string; today: string;
        lesson_days: Array<{ dayNumber: number; status: string | null; completedAt: string | null }>;
      }>(
        `select pw.week_number, pw.topic, p.start_date::text as start_date, organization_system_date(p.organization_id)::text as today,
                count(pr.id) filter (where pr.status = 'completed')::text as completed_lessons,
                count(l.id)::text as total_lessons,
                coalesce(jsonb_agg(jsonb_build_object(
                  'dayNumber', l.day_number,
                  'status', pr.status,
                  'completedAt', pr.completed_on
                ) order by l.day_number) filter (where l.id is not null), '[]'::jsonb) as lesson_days
         from enrollments e
         join programs p on p.id = e.program_id
         join program_weeks pw on pw.program_id = e.program_id
         left join lesson_sets ls on ls.program_week_id = pw.id and ls.cefr = e.cefr
         left join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
         left join lessons l on l.lesson_set_version_id = lsv.id
         left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = e.learner_id
           and pr.updated_at >= now() - make_interval(days => $2)
         where e.learner_id = $1
         group by pw.id, p.start_date, p.organization_id order by pw.week_number`, [learnerId, thresholds.days]
      ),
      this.pool.query<{ count: string }>(
        `select count(distinct occurred_at::date)::text as count
         from activities
         where learner_id = $1
           and ($2::date is null or occurred_at::date >= $2::date)`,
        [learnerId, monthlyContext ? `${monthlyContext.month}-01` : null]
      ),
      this.pool.query<{ activity_type: string; minutes: number; evidence: Record<string, unknown>; occurred_at: Date }>(
        `select activity_type, minutes, evidence, occurred_at
         from activities
         where learner_id = $1
           and ($2::date is null or occurred_at::date >= $2::date)
         order by occurred_at desc limit 30`,
        [learnerId, monthlyContext ? `${monthlyContext.month}-01` : null]
      ),
      this.pool.query<{ badge_key: string; label: string; rule: { description?: string; seasonLevel?: number }; earned: boolean; earned_level: CefrLevel | null }>(
        `select b.badge_key, b.label, b.rule, earned.at is not null as earned,
                case when earned.at is not null then learner_level_at($1, earned.at) end as earned_level
         from badges b
         join users u on u.organization_id = b.organization_id and u.id = $1
         left join lateral (select min(re.created_at) as at from reward_events re where re.badge_id = b.id and re.learner_id = $1) earned on true
         where ${ACTIVE_BADGE_SQL("b")}
         order by coalesce((b.rule->>'seasonLevel')::int, 99), b.badge_key`, [learnerId]
      ),
      this.pool.query<{ turns_today: string; turns_this_week: string; turns_14_days: string; rubric_average: string | null }>(
        `select
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= organization_system_date((select organization_id from users where id = $1))
             and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true)))::text as turns_today,
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= case when $3::boolean
             then date_trunc('month', organization_system_date((select organization_id from users where id = $1)))
             else date_trunc('week', organization_system_date((select organization_id from users where id = $1))) end
             and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true)))::text as turns_this_week,
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= case when $3::boolean
             then date_trunc('month', organization_system_date((select organization_id from users where id = $1)))
             else now() - make_interval(days => $2) end
             and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true)))::text as turns_14_days,
           avg(((case when jsonb_typeof(ct.feedback->'rubric'->'meaning') = 'object' then (ct.feedback->'rubric'->'meaning'->>'score')::numeric else (ct.feedback->'rubric'->>'meaning')::numeric end)
             + (case when jsonb_typeof(ct.feedback->'rubric'->'vocabulary') = 'object' then (ct.feedback->'rubric'->'vocabulary'->>'score')::numeric else (ct.feedback->'rubric'->>'vocabulary')::numeric end)
             + (case when jsonb_typeof(ct.feedback->'rubric'->'grammar') = 'object' then (ct.feedback->'rubric'->'grammar'->>'score')::numeric else (ct.feedback->'rubric'->>'grammar')::numeric end)) / 3) filter (
             where ct.speaker = 'learner' and ct.created_at >= case when $3::boolean
                 then date_trunc('month', organization_system_date((select organization_id from users where id = $1)))
                 else now() - make_interval(days => $2) end
               and ct.feedback ? 'rubric'
                and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true))
           )::text as rubric_average
         from coach_sessions cs left join coach_turns ct on ct.session_id = cs.id
         where cs.learner_id = $1`, [learnerId, thresholds.days, Boolean(monthlyContext)]
      ),
      this.pool.query<{ status: string; total: string | null }>(
        `select ps.status, ps.score->>'total' as total
         from practice_submissions ps where ps.learner_id = $1
           and coalesce(ps.reviewed_at, ps.submitted_at, ps.updated_at) >= now() - make_interval(days => $2)
         order by coalesce(ps.reviewed_at, ps.submitted_at, ps.updated_at) desc limit 1`, [learnerId, thresholds.days]
      ),
      this.pool.query<{
        kind: string; total_score: string; approved_level: CefrLevel | null;
        section: "listening" | "reading" | "writing" | "speaking"; section_score: string; section_max: string | null;
      }>(
        `with latest as (
           select distinct on (ad.kind) aa.id, ad.kind, av.blueprint, dec.approved_level
           from assessment_attempts aa
           join assessment_versions av on av.id = aa.assessment_version_id
           join assessment_definitions ad on ad.id = av.definition_id
           left join assessment_decisions dec on dec.attempt_id = aa.id
           where aa.learner_id = $1 and (
             (ad.kind = 'placement' and aa.status in ('submitted', 'pending_review', 'approved'))
             or (ad.kind = 'pass_course' and aa.status in ('approved', 'needs_retry') and dec.decided_at is not null)
           ) and exists (select 1 from assessment_scores score where score.attempt_id = aa.id)
           order by ad.kind, aa.submitted_at desc nulls last, aa.started_at desc
         )
         select latest.kind, sum(score.score) over (partition by latest.id)::text as total_score,
                latest.approved_level, score.section, score.score::text as section_score,
                (select item->>'maxScore' from jsonb_array_elements(latest.blueprint->'sections') item
                 where item->>'code' = score.section) as section_max
         from latest join assessment_scores score on score.attempt_id = latest.id`, [learnerId]
      ),
      this.pool.query<{ levelup_available: boolean }>(
        `select exists(select 1 from assessment_versions av join assessment_definitions ad on ad.id = av.definition_id
             where av.status = 'published' and ad.kind = 'level_up'
               and av.blueprint->>'targetLevel' = $1) as levelup_available`,
        [nextCefr(row.cefr)]
      ),
      monthlyContext ? this.pool.query<{ evidence: { evidence?: Record<string, PartEvidence> } }>(
        `select pr.evidence from progress_records pr
         join month_lessons ml on ml.lesson_id = pr.lesson_id and ml.status = 'approved'
         join month_frameworks mf on mf.id = ml.framework_id and mf.status = 'approved'
         join program_months pm on pm.id = mf.program_month_id
         where pr.learner_id = $1 and pm.month = $2 and mf.cefr = $3 and not ${MONTH_LESSON_IS_REVIEW_SQL}`, [learnerId, monthlyContext.month, monthlyContext.cefr]
      ) : Promise.resolve({ rows: [] as Array<{ evidence: { evidence?: Record<string, PartEvidence> } }> }),
      monthlyContext ? this.pool.query<{ status: string; total_score: string | null }>(
        `select aa.status, sum(s.score)::text as total_score
         from assessment_attempts aa
         join assessment_versions av on av.id = aa.assessment_version_id
         join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'final'
         left join assessment_scores s on s.attempt_id = aa.id
         where aa.learner_id = $1 and ad.assessment_key = ('monthly-final-' || $2 || '-' || lower($3))
         group by aa.id
         order by aa.submitted_at desc nulls last, aa.started_at desc nulls last
         limit 1`, [learnerId, monthlyContext.month, monthlyContext.cefr]
      ) : Promise.resolve({ rows: [] as Array<{ status: string; total_score: string | null }> }),
      monthlyContext ? this.pool.query<{ published: boolean }>(
        `select exists(
           select 1
           from assessment_definitions ad
           join assessment_versions av on av.definition_id = ad.id and av.status = 'published'
           where ad.kind = 'final'
             and ad.assessment_key = ('monthly-final-' || $1 || '-' || lower($2))
         ) as published`,
        [monthlyContext.month, monthlyContext.cefr]
      ) : Promise.resolve({ rows: [{ published: false }] as Array<{ published: boolean }> })
    ]);
    const rewards = reward.rows[0] ?? { points: "0", badges: [] };
    const points = Number(rewards.points);
    const seasonState = await learnerSeasonState(this.pool, learnerId);
    const earnedBadgeKeys = seasonState?.badgeKeys ?? new Set(rewards.badges.map((badge) => badge.key));
    const pointsInLevel = seasonState?.pointsInLevel ?? points;
    const rewardLevel = seasonState?.cefr ?? null;
    const roadmap = badgeRoadmap.rows.map((badge): BadgeRoadmapItem => {
      const known = (REWARD_BADGE_KEYS as readonly string[]).includes(badge.badge_key)
        ? badge.badge_key as (typeof REWARD_BADGE_KEYS)[number] : null;
      // An earned badge shows the rule it met (at the level it was earned); the others the current level's rule.
      const ruleLevel = badge.earned ? badge.earned_level ?? rewardLevel : rewardLevel;
      return {
        key: badge.badge_key,
        label: badge.label,
        description: known ? rewardBadgeDescription(known, ruleLevel) : badge.rule.description ?? "Tiêu chí được xác định trong hệ thống",
        seasonLevel: normalizeSeasonLevel(badge.rule.seasonLevel),
        earned: badge.earned,
        ...(badge.earned ? { earnedLevel: badge.earned_level ?? null } : {}),
        ...(known ? { threshold: rewardBadgeThreshold(known, rewardLevel) } : {})
      };
    });
    const coachSummary = coach.rows[0] ?? { turns_today: "0", turns_this_week: "0", turns_14_days: "0", rubric_average: null };

    // Friday reviews are not lessons: excluded from k/N progress and the level-up path.
    const dailyMonthlyLessons = monthlyLessons.filter((lesson) => lesson.monthlyKind !== "review");
    const totalLessons = monthlyContext ? dailyMonthlyLessons.length : 0;
    const completedLessons = monthlyContext
      ? dailyMonthlyLessons.filter((lesson) => lesson.progress.status === 'completed').length
      : 0;
    const lessonCompletion = totalLessons ? completedLessons / totalLessons * 100 : 0;
    const firstTryParts = firstTry.rows.flatMap((item) => Object.values(item.evidence.evidence ?? {}));
    const firstTryCorrect = firstTryParts.filter(item => item.firstTryCorrect ?? (item.attempts === 1 && (item.score === undefined || item.score >= 80))).length;
    const firstTryAccuracy = firstTryParts.length ? firstTryCorrect / firstTryParts.length * 100 : 0;
    const wrongParts = firstTryParts.filter((item) => (item.attempts ?? 0) >= 3 && (item.score ?? 0) < 80).length;
    const wrongRate = firstTryParts.length ? wrongParts / firstTryParts.length * 100 : 0;
    const readiness = buildLevelReadiness({
      cefr: row.cefr,
      lessonCompletion,
      completedLessons,
      totalLessons,
      firstTryAccuracy,
      firstTryCorrect,
      firstTryTotal: firstTryParts.length,
      weeklyPractice: Number(monthlyFinal.rows[0]?.total_score ?? 0),
      coachRubric: Number(coachSummary.rubric_average ?? 0),
      coachTurns: Number(monthlyContext ? coachSummary.turns_this_week : coachSummary.turns_14_days),
      wrongRate,
      attemptedParts: firstTryParts.length,
      examAvailable: Boolean(availability.rows[0]?.levelup_available),
      thresholds
    });
    const monthlyPolicy = await this.monthlyLevelUpReadiness(learnerId, row.cefr);
    // Staff exception ("Thi lên mức"): the learner may take the next-level test now.
    const staffOverride = row.cefr && row.cefr !== "C1"
      ? (await this.pool.query<{ target_cefr: CefrLevel }>(
        `select o.target_cefr from level_up_overrides o
         where o.learner_id = $1 and ${levelUpOverrideActiveSql("$2")} limit 1`, [learnerId, row.cefr]
      )).rows[0] ?? null
      : null;
    const badgeCounts = requiredBadgeCountsForNext(pointsInLevel, earnedBadgeKeys);
    const assessmentViews = buildAssessmentSnapshots(assessments.rows);
    // Same rule as reward(…, "done"): the badge certificate opens at C1 with an approved monthly final.
    const badgeCertificateAvailable = row.cefr === "C1" && Boolean((await this.pool.query(
      `select 1 from assessment_attempts aa
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id
       where aa.learner_id = $1 and ad.kind = 'final' and aa.status = 'approved' limit 1`, [learnerId]
    )).rowCount);
    return {
      learner: { id: row.id, displayName: row.display_name, cefr: row.cefr, profile: row.profile ?? {} },
      points,
      badges: rewards.badges,
      weeks: [],
      ...(monthlyContext ? {
        monthlyProgress: {
          month: monthlyContext.month,
          themeTitle: monthlyContext.themeTitle,
          examDate: monthlyContext.examDate,
          completedLessons,
          totalLessons,
          days: monthlyLessons.map((lesson) => ({
            lessonNumber: lesson.dayNumber,
            status: lesson.progress.status,
            opensAt: lesson.lock?.opensAt ?? null,
            ...(lesson.lessonDate ? { lessonDate: lesson.lessonDate } : {}),
            ...(lesson.monthlyKind ? { kind: lesson.monthlyKind } : {})
          })),
          exam: (() => {
            const attempt = monthlyFinal.rows[0];
            if (attempt && ['submitted', 'pending_review', 'approved', 'needs_retry'].includes(attempt.status)) {
              return { status: 'completed' as const, totalScore: attempt.total_score === null ? null : Number(attempt.total_score) };
            }
            if (attempt) return { status: 'locked' as const, totalScore: null };
            if (totalLessons === 0 || completedLessons < totalLessons) return { status: 'locked' as const, totalScore: null };
            if (!monthlyFinalPublished.rows[0]?.published) return { status: 'unpublished' as const, totalScore: null };
            return { status: 'ready' as const, totalScore: null };
          })()
        }
      } : {}),
      monthlyPreparation: !monthlyContext,
      studyDays: monthlyContext ? Number(study.rows[0]?.count ?? 0) : 0,
      activity: activity.rows.map((item) => ({
        type: item.activity_type,
        minutes: item.minutes,
        occurredAt: item.occurred_at.toISOString(),
        evidence: item.evidence
      })),
      season: {
        current: seasonForRewards(pointsInLevel, earnedBadgeKeys),
        next: nextSeasonFor(pointsInLevel, earnedBadgeKeys),
        earnedBadgeCount: badgeCounts.earned,
        requiredBadgeCount: badgeCounts.required,
        cefr: rewardLevel,
        pointsInLevel
      },
      badgeRoadmap: roadmap,
      badgeCertificateAvailable,
      levelReadiness: {
        ...readiness,
        ...(monthlyPolicy ? { eligible: monthlyPolicy.eligible } : {}),
        ...(monthlyPolicy ? {
          monthlyPolicy: {
            requiredMonths: monthlyPolicy.requiredMonths,
            eligibleMonths: monthlyPolicy.eligibleMonths,
            finalPasses: monthlyPolicy.finalPasses,
            finalPassesRequired: monthlyPolicy.finalPassesRequired,
            finalAverage: monthlyPolicy.finalAverage,
            finalAverageTarget: monthlyPolicy.finalAverageTarget,
            seasonMonths: monthlyPolicy.seasonMonths,
            seasonMonthsRequired: monthlyPolicy.seasonMonthsRequired,
            latestFinalPassed: monthlyPolicy.latestFinalPassed,
            absenceCap: monthlyPolicy.absenceCap,
            absenceRate: monthlyPolicy.absenceRate,
            reasons: monthlyPolicy.reasons
          }
        } : {}),
        ...(staffOverride ? { eligible: true, targetLevel: staffOverride.target_cefr, staffOverride: true } : {})
      },
      stats: {
        completedLessons,
        coachTurns: monthlyContext ? Number(coachSummary.turns_this_week) : 0,
        coachTurnsToday: monthlyContext ? Number(coachSummary.turns_today) : 0,
        studyDays: monthlyContext ? Number(study.rows[0]?.count ?? 0) : 0
      },
      assessments: assessmentViews
    };
  }

  async monthlyLevelUpReadiness(learnerId: string, currentLevel: CefrLevel | null, throughMonth?: string) {
    if (!currentLevel) return evaluateMonthlyLevelUpReadiness({ currentLevel, months: [] });
    const candidateMonths = await this.pool.query<{ month: string; level_started_at: Date }>(
      `with current_enrollment as (
         select u.organization_id, greatest(e.enrolled_at,
           (select max(change.effective_at) from scheduled_level_changes change
            where change.learner_id = u.id and change.to_cefr = e.cefr and change.status = 'applied'),
           (select max(ae.created_at) from audit_events ae where ae.entity_id = u.id
              and ae.action = 'assessment.learner.level_changed' and ae.payload->>'mode' = 'direct'
              and ae.payload->>'targetLevel' = e.cefr and ae.payload->>'previousLevel' is distinct from e.cefr),
           (select max(decision.decided_at) from assessment_decisions decision
            join assessment_attempts attempt on attempt.id = decision.attempt_id
            join assessment_versions version on version.id = attempt.assessment_version_id
            join assessment_definitions definition on definition.id = version.definition_id
            where attempt.learner_id = u.id and definition.kind = 'placement'
              and decision.status = 'approved' and decision.approved_level = e.cefr)
         ) as level_started_at
         from users u join enrollments e on e.learner_id = u.id and e.cefr = $2 and e.cefr_approved = true
         join programs p on p.id = e.program_id and p.status = 'active'
         where u.id = $1 order by e.enrolled_at desc limit 1
       )
       select pm.month, enrollment.level_started_at
       from current_enrollment enrollment join program_months pm on pm.organization_id = enrollment.organization_id
       where pm.month between to_char(least((enrollment.level_started_at at time zone 'Asia/Ho_Chi_Minh')::date, organization_system_date(enrollment.organization_id)), 'YYYY-MM')
                          and least(coalesce($3::text, '9999-12'), to_char(organization_system_date(enrollment.organization_id), 'YYYY-MM'))`,
      [learnerId, currentLevel, throughMonth ?? null]
    );
    const levelStartedAt = candidateMonths.rows[0]?.level_started_at;
    if (!levelStartedAt) return evaluateMonthlyLevelUpReadiness({ currentLevel, months: [] });
    const attendance = await learnerMonthlyAttendanceDates(this.pool, learnerId, candidateMonths.rows.map((row) => row.month), { cefr: currentLevel, from: levelStartedAt });
    const attendedByMonth = Object.fromEntries([...attendance].map(([month, dates]) => [month, dates.length]));
    const result = await this.pool.query<MonthlyLevelRecord>(
      `with identity as (
         select u.organization_id, e.cefr, organization_system_date(u.organization_id)::date as system_date,
                -- A level started after a rolled-back system date counts from the system date.
                least(($3::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date, organization_system_date(u.organization_id)::date) as level_start_date
         from users u join enrollments e on e.learner_id = u.id and e.cefr = $4 and e.cefr_approved = true
         join programs p on p.id = e.program_id and p.status = 'active'
         where u.id = $1 and u.role = 'learner'
         order by e.enrolled_at desc limit 1
       ), months as (
         select pm.id, pm.month, pm.exam_date, i.level_start_date, i.cefr, mf.id as framework_id,
                (mf.status = 'approved') as framework_approved
         from identity i join program_months pm on pm.organization_id = i.organization_id
           and pm.month between to_char(i.level_start_date, 'YYYY-MM') and least(coalesce($5::text, '9999-12'), to_char(i.system_date, 'YYYY-MM'))
         left join month_frameworks mf on mf.program_month_id = pm.id and mf.cefr = i.cefr
       ), lesson_facts as (
         select m.*, count(ml.id) filter (where ml.status = 'approved')::int as scheduled_lessons,
                count(ml.id) filter (where ml.status = 'approved' and pr.status = 'completed')::int as completed_lessons,
                coalesce(($2::jsonb->>m.month)::int, 0) as attended_days,
                (select count(*)::int from generate_series(greatest((m.month || '-01')::date, m.level_start_date), m.exam_date - 1, interval '1 day') d where extract(isodow from d) <= 5
                   -- Only days with an approved lesson count; later days of the running month still count as planned.
                   and (d::date >= (select identity.system_date from identity) or exists (select 1 from month_lessons available where available.framework_id = m.framework_id and available.status = 'approved' and available.lesson_date = d::date))) as effective_days,
                (select count(*)::int from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
                  where cs.learner_id = $1 and ct.speaker = 'learner'
                    and ct.created_at >= $3::timestamptz
                    and (ct.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= (m.month || '-01')::date
                    and (ct.created_at at time zone 'Asia/Ho_Chi_Minh')::date < ((m.month || '-01')::date + interval '1 month')
                    and (ct.created_at at time zone 'Asia/Ho_Chi_Minh')::date < m.exam_date
                    and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true))) as season_turns
           from months m left join month_lessons ml on ml.framework_id = m.framework_id
           left join lessons l on l.id = ml.lesson_id
           left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = $1
          group by m.id, m.month, m.exam_date, m.level_start_date, m.cefr, m.framework_id, m.framework_approved
       )
       select lf.month,
              ((coalesce(lf.effective_days - lf.attended_days, lf.effective_days) <= floor(lf.effective_days * 0.3)
                or exists (select 1 from learner_complaints complaint where complaint.learner_id = $1
                  and complaint.kind = 'exam_eligibility' and complaint.status in ('approved', 'auto_approved')
                  and complaint.submitted_at >= $3::timestamptz
                  and complaint.submitted_at >= (lf.month || '-01')::date and complaint.submitted_at < (lf.month || '-01')::date + interval '1 month'))
                and exists (
                  select 1 from assessment_attempts taken
                  join assessment_versions taken_version on taken_version.id = taken.assessment_version_id
                  join assessment_definitions taken_definition on taken_definition.id = taken_version.definition_id
                  where taken.learner_id = $1 and taken_definition.kind = 'final' and taken.started_at >= $3::timestamptz
                    and taken_definition.assessment_key = ('monthly-final-' || lf.month || '-' || lower(lf.cefr))
                    and taken.status in ('submitted', 'pending_review', 'approved', 'needs_retry')
                )) as eligible,
              final_result.final_score as "finalScore", coalesce(final_result.final_passed, false) as "finalPassed",
              coalesce(lf.season_turns, 0) as "seasonTurns",
              greatest(coalesce(lf.effective_days - lf.attended_days, lf.effective_days), 0) as "absenceDays",
              lf.effective_days as "effectiveDays",
              case when lf.effective_days > 0 then ((lf.effective_days - lf.attended_days)::numeric / lf.effective_days * 100)::double precision else 100 end as "absenceRate"
       from lesson_facts lf
       left join lateral (
         select latest.final_score,
                (latest.final_score >= 70 and latest.section_count = 4 and latest.minimum_section_score >= 15) as final_passed
         from (
           select aa.id, sum(s.score)::double precision as final_score,
                  min(s.score)::double precision as minimum_section_score,
                  count(distinct s.section) filter (where s.section in ('listening', 'reading', 'writing', 'speaking')) as section_count
           from assessment_attempts aa
         join assessment_versions av on av.id = aa.assessment_version_id
         join assessment_definitions ad on ad.id = av.definition_id
         join assessment_scores s on s.attempt_id = aa.id
         where aa.learner_id = $1 and aa.status = 'approved' and ad.kind = 'final' and aa.started_at >= $3::timestamptz
           and ad.assessment_key = ('monthly-final-' || lf.month || '-' || lower(lf.cefr))
           group by aa.id, aa.submitted_at
           order by aa.submitted_at desc nulls last
           limit 1
         ) latest
       ) final_result on true
       order by lf.month`, [learnerId, JSON.stringify(attendedByMonth), levelStartedAt, currentLevel, throughMonth ?? null]
    );
    return evaluateMonthlyLevelUpReadiness({ currentLevel, months: result.rows });
  }

  async findMicroLesson(learnerId: string, microLessonId: string): Promise<MicroLessonView | null> {
    const result = await this.pool.query<{
      id: string;
      topic: string;
      cefr: CefrLevel;
      content: Omit<MicroLessonView, "id" | "topic" | "cefr">;
      progress: { feedback?: MicroLessonView["feedback"]; attempt?: MicroLessonView["attempt"] };
      completed_at: Date | null;
    }>(
      `select id, topic, cefr, content, progress, completed_at
       from micro_lessons where id = $1 and learner_id = $2`,
      [microLessonId, learnerId]
    );
    const micro = result.rows[0];
    if (!micro) return null;
    const practice = micro.content.practice as MicroLessonView["practice"] & { answer?: string };
    return {
      id: micro.id,
      topic: micro.topic,
      cefr: micro.cefr,
      ...micro.content,
      practice: { prompt: practice.prompt, type: practice.type, ...(practice.options ? { options: practice.options } : {}) },
      ...(micro.progress.attempt ? { attempt: micro.progress.attempt } : {}),
      ...(micro.progress.feedback ? { feedback: micro.progress.feedback } : {}),
      ...(micro.completed_at ? { completedAt: micro.completed_at.toISOString() } : {})
    };
  }

  async todayMicroLesson(learnerId: string): Promise<MicroLessonView | null> {
    const result = await this.pool.query<{ id: string }>(
      `select id from micro_lessons
       where learner_id = $1 and generated_at >= date_trunc('day', now())
       order by generated_at desc limit 1`,
      [learnerId]
    );
    return result.rows[0] ? this.findMicroLesson(learnerId, result.rows[0].id) : null;
  }

  async createMicroLesson(input: {
    learnerId: string;
    weekId: string;
    cefr: CefrLevel;
    content: {
      topic: string;
      durationMinutes: 5 | 10 | 15 | 20;
      theory: string;
      vocabulary: string[];
      practice: { prompt: string; type: "mcq" | "write" | "fill"; options?: string[] | undefined; answer: string };
    };
  }): Promise<MicroLessonView> {
    const id = randomUUID();
    const { topic, ...content } = input.content;
    await this.pool.query(
      `insert into micro_lessons (id, learner_id, program_week_id, cefr, topic, content, source)
       values ($1, $2, $3, $4, $5, $6::jsonb, 'ai')`,
      [id, input.learnerId, input.weekId, input.cefr, topic, JSON.stringify(content)]
    );
    return (await this.findMicroLesson(input.learnerId, id))!;
  }

  async microLessonForGrading(learnerId: string, microLessonId: string): Promise<{
    cefr: CefrLevel;
    theory: string;
    vocabulary: string[];
    practice: { prompt: string; type: "mcq" | "write" | "fill"; answer: string };
  } | null> {
    const result = await this.pool.query<{ cefr: CefrLevel; content: {
      theory: string; vocabulary: string[];
      practice: { prompt: string; type: "mcq" | "write" | "fill"; answer: string };
    } }>(
      `select cefr, content from micro_lessons where id = $1 and learner_id = $2`,
      [microLessonId, learnerId]
    );
    return result.rows[0] ? { cefr: result.rows[0].cefr, ...result.rows[0].content } : null;
  }

  async saveMicroAttemptGrade(input: {
    learnerId: string;
    microLessonId: string;
    answer: string;
    correct: boolean | null;
    score: number | null;
    feedback: string;
  }): Promise<MicroLessonView | null> {
    const updated = await this.pool.query(
      `update micro_lessons
       set progress = jsonb_build_object(
         'attempt', jsonb_build_object(
           'answer', $3::text,
           'attempts', coalesce((progress->'attempt'->>'attempts')::int, 0) + 1,
           'correct', $4::boolean,
           'score', $5::int
         ),
         'feedback', jsonb_build_object('status', 'ready', 'message', $6::text)
       )
       where id = $1 and learner_id = $2`,
      [input.microLessonId, input.learnerId, input.answer, input.correct, input.score, input.feedback]
    );
    return updated.rowCount ? this.findMicroLesson(input.learnerId, input.microLessonId) : null;
  }

  async submitMicroAttempt(learnerId: string, microLessonId: string, answer: string): Promise<MicroLessonView | null> {
    const updated = await this.pool.query(
      `update micro_lessons
       set progress = jsonb_build_object(
         'attempt', jsonb_build_object(
           'answer', $3::text,
           'attempts', coalesce((progress->'attempt'->>'attempts')::int, 0) + 1,
           'correct', lower(trim(content->'practice'->>'answer')) = lower(trim($3::text))
         ),
         'feedback', jsonb_build_object(
           'status', 'ready',
           'message', case
             when lower(trim(content->'practice'->>'answer')) = lower(trim($3::text))
               then 'Đúng rồi. Bạn đã dùng mẫu câu lịch sự và nêu thời gian mới rõ ràng.'
             else 'Chưa đúng. Hãy chọn câu có “Could we…” và một thời gian đề xuất cụ thể.'
           end
         )
       )
       where id = $1 and learner_id = $2`,
      [microLessonId, learnerId, answer]
    );
    return updated.rowCount ? this.findMicroLesson(learnerId, microLessonId) : null;
  }

  async completeMicroLesson(learnerId: string, microLessonId: string): Promise<MicroLessonView | null> {
    const updated = await this.pool.query(
      `update micro_lessons set completed_at = coalesce(completed_at, now())
       where id = $1 and learner_id = $2 and progress->'feedback'->>'status' = 'ready'`,
      [microLessonId, learnerId]
    );
    if (!updated.rowCount) return null;
    await withLearnerRewardLock(this.pool, learnerId, async (client) => {
      await client.query(
        `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
         select $1, $2, 'micro_lesson', 'micro_lesson', $3, 5,
                jsonb_build_object('score', (progress->'attempt'->>'score')::int)
         from micro_lessons where id = $3 and learner_id = $2
         and not exists (select 1 from activities where learner_id = $2 and reference_type = 'micro_lesson' and reference_id = $3)`,
        [randomUUID(), learnerId, microLessonId]
      );
      await syncLearnerRewards(client, learnerId);
    });
    return this.findMicroLesson(learnerId, microLessonId);
  }
}

/** Season ladder of every CEFR level (same thresholds per level), climbed with the points earned in the level. */
const SEASONS = REWARD_SEASONS;

/** SQL predicate: a badge of the current catalog (retired "Chuỗi 3/5 ngày" never count). */
export const ACTIVE_BADGE_SQL = (alias: string) => `not coalesce((${alias}.rule->>'retired')::boolean, false)`;

/** Points of the next Season threshold above `pointsInLevel` (500, 2 000, 5 000), or null after Mùa đông's. */
export function nextSeasonPointsTier(pointsInLevel: number): number | null {
  return SEASONS.find((season) => season.pointsRequired > pointsInLevel)?.pointsRequired ?? null;
}

function normalizeSeasonLevel(value: number | undefined): 2 | 3 | 4 {
  return value === 3 || value === 4 ? value : 2;
}

/**
 * The learner's Season at the current level. Seasons are climbed in order, each
 * needing its points (earned in the current level) and all of its badges, so
 * badges of a higher Season never skip a missing lower one (the rule the
 * profile text, the manager column and the reward simulator use).
 */
export function seasonForRewards(pointsInLevel: number, badges: ReadonlySet<string>): SeasonLevelView {
  return seasonView(rewardSeasonFor(pointsInLevel, badges));
}

function seasonView(season: RewardSeason): SeasonLevelView {
  return { key: season.key, level: season.level, name: season.name, pointsRequired: season.pointsRequired };
}

function nextSeasonFor(pointsInLevel: number, badges: ReadonlySet<string>): SeasonLevelView | null {
  const next = nextRewardSeason(pointsInLevel, badges);
  return next ? seasonView(next) : null;
}

function requiredBadgeCountsForNext(pointsInLevel: number, badges: ReadonlySet<string>) {
  const next = nextRewardSeason(pointsInLevel, badges);
  return next
    ? { earned: next.badges.filter((badge) => badges.has(badge)).length, required: next.badges.length }
    : { earned: 0, required: 0 };
}

/** Lifetime points, points in the current level, the current level and the badges that count. */
export interface LearnerSeasonState {
  organizationId: string;
  cefr: CefrLevel | null;
  points: number;
  pointsInLevel: number;
  /** Start of the current level's ladder; null = every point counts (first level). */
  levelStartedAt: Date | null;
  badgeKeys: Set<string>;
  season: SeasonLevelView;
  next: SeasonLevelView | null;
}

export async function learnerSeasonState(db: Pool | PoolClient, learnerId: string): Promise<LearnerSeasonState | null> {
  const { rows: [row] } = await db.query<{
    organization_id: string; cefr: CefrLevel | null; points: number; points_in_level: number; level_started_at: Date | null; badge_keys: string[];
  }>(
    `select u.organization_id, learner_current_cefr(u.id) as cefr,
            coalesce((select sum(re.points) from reward_events re where re.learner_id = u.id), 0)::int as points,
            learner_points_in_level(u.id) as points_in_level,
            learner_season_started_at(u.id) as level_started_at,
            coalesce((select array_agg(b.badge_key) from reward_events re join badges b on b.id = re.badge_id
                      where re.learner_id = u.id and ${ACTIVE_BADGE_SQL("b")}), '{}'::text[]) as badge_keys
     from users u where u.id = $1`,
    [learnerId]
  );
  if (!row) return null;
  const badgeKeys = new Set(row.badge_keys);
  const pointsInLevel = Number(row.points_in_level);
  return {
    organizationId: row.organization_id,
    cefr: row.cefr,
    points: Number(row.points),
    pointsInLevel,
    levelStartedAt: row.level_started_at,
    badgeKeys,
    season: seasonForRewards(pointsInLevel, badgeKeys),
    next: nextSeasonFor(pointsInLevel, badgeKeys)
  };
}

function nextCefr(level: CefrLevel | null): CefrLevel | null {
  const order: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];
  const index = level ? order.indexOf(level) : -1;
  return index >= 0 && index < order.length - 1 ? order[index + 1] ?? null : null;
}

function buildWeekDayStatuses(week: {
  week_number: number;
  start_date: string;
  today: string;
  lesson_days: Array<{ dayNumber: number; status: string | null; completedAt: string | null }>;
}): NonNullable<LearnerProgressView["weeks"][number]["days"]> {
  const lessonByDay = new Map(week.lesson_days.map((lesson) => [lesson.dayNumber, lesson]));
  return (["T2", "T3", "T4", "T5", "T6"] as const).map((label, index) => {
    const dayNumber = index + 1;
    const lesson = lessonByDay.get(dayNumber);
    if (!lesson) return { label, status: "upcoming" as const };
    const dueDate = addUtcDays(week.start_date, (week.week_number - 1) * 7 + index);
    if (lesson.status === "completed") {
      const completedDate = lesson.completedAt?.slice(0, 10);
      return { label, status: !completedDate || completedDate <= dueDate ? "on_time" as const : "late" as const };
    }
    return { label, status: dueDate < week.today ? "late" as const : "upcoming" as const };
  });
}

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function buildLevelReadiness(input: {
  cefr: CefrLevel | null;
  lessonCompletion: number; completedLessons: number; totalLessons: number;
  firstTryAccuracy: number; firstTryCorrect: number; firstTryTotal: number;
  weeklyPractice: number; coachRubric: number; coachTurns: number; wrongRate: number; attemptedParts: number;
  examAvailable: boolean; thresholds: LevelReadinessThresholds;
}): LevelReadinessView {
  const calculated = calculateLevelReadiness({
    metrics: {
      lessonCompletion: input.lessonCompletion, firstTryAccuracy: input.firstTryAccuracy,
      weeklyPractice: input.weeklyPractice, coachRubric: input.coachRubric, coachTurns: input.coachTurns,
      wrongRate: input.wrongRate, attemptedParts: input.attemptedParts
    },
    thresholds: input.thresholds,
    examAvailable: input.examAvailable
  });
  const labels: Record<LevelReadinessMetric["key"], string> = {
    lessonCompletion: "Bài học hoàn thành", firstTryAccuracy: "Phần bài đúng ngay lần đầu",
    weeklyPractice: "Bài thi tháng", coachRubric: "Rubric Season trong tháng",
    wrongRate: "Phần sai nhiều lần"
  };
  const displays: Record<LevelReadinessMetric["key"], string> = {
    lessonCompletion: `${input.completedLessons}/${input.totalLessons} bài`,
    firstTryAccuracy: `${input.firstTryCorrect}/${input.firstTryTotal} phần`,
    weeklyPractice: input.weeklyPractice || input.weeklyPractice === 0 ? `${formatDisplayScore(input.weeklyPractice)}/100` : "Chưa có bài được chấm",
    coachRubric: `${formatDisplayScore(input.coachRubric)}/5 · ${input.coachTurns} lượt trong tháng`,
    wrongRate: `${formatDisplayScore(input.wrongRate)}% · ${input.attemptedParts} phần`
  };
  const criteria: LevelReadinessMetric[] = calculated.criteria.map((criterion) => ({
    ...criterion, label: labels[criterion.key], display: displays[criterion.key]
  }));
  return {
    targetLevel: nextCefr(input.cefr),
    windowDays: calculated.windowDays,
    eligible: calculated.eligible,
    examAvailable: input.examAvailable,
    criteria
  };
}

function buildAssessmentSnapshots(rows: Array<{
  kind: string; total_score: string; approved_level: CefrLevel | null;
  section: "listening" | "reading" | "writing" | "speaking"; section_score: string; section_max: string | null;
}>): { placement: AssessmentSnapshot | null; passCourse?: AssessmentSnapshot } {
  const build = (kind: string): AssessmentSnapshot | null => {
    const selected = rows.filter((row) => row.kind === kind);
    if (!selected.length || (kind === "pass_course" && selected.length !== 4)) return null;
    return {
      totalScore: Number(selected[0]?.total_score ?? 0),
      approvedLevel: selected[0]?.approved_level ?? null,
      sections: Object.fromEntries(selected.map((row) => [row.section, Number(row.section_score)])),
      ...(kind === "pass_course" ? { sectionMaxScores: Object.fromEntries(selected.filter(row => row.section_max !== null).map(row => [row.section, Number(row.section_max)])) } : {})
    };
  };
  const passCourse = build("pass_course");
  return { placement: build("placement"), ...(passCourse ? { passCourse } : {}) };
}

function mapLessonRow(row: {
  exercise_version_id?: string;
  monthly_core_terms?: MonthlyVocabularyCore[];
  frozen_illustrations?: FrozenMonthlyIllustration[];
  id: string;
  title: string;
  day_number: number;
  week_number: number;
  week_topic: string;
  cefr: CefrLevel;
  content: LessonContent & { durationMinutes?: number };
  lesson_count?: string;
  opens_at?: string;
  opens_later?: boolean;
  blocker_id?: string | null;
  blocker_day_number?: number | null;
  blocker_title?: string | null;
  progress_status: LessonProgressView["status"] | null;
  progress_score: string | null;
  progress_evidence: Record<string, unknown> | null;
  progress_updated_at: Date | null;
  monthly_kind?: "new" | "review";
  monthly_day_spec?: import("@e4s/domain").MonthlyDaySpec;
  monthly_grammar_topics?: MonthlyGrammarTopicSource[] | null;
  monthly_new_ordinal?: number;
  monthly_review_ordinal?: number;
  lesson_date?: string;
  system_date?: string;
}): LearnerLessonRecord {
  return {
    id: row.id,
    ...(row.exercise_version_id && row.monthly_kind === "new" ? { exerciseVersionId: row.exercise_version_id } : {}),
    // Monthly titles use the same number as teachingLabel (new lessons only, Friday reviews not counted).
    title: row.monthly_kind ? monthlyLessonDisplayTitle(row.title, { kind: row.monthly_kind, newLessonNumber: row.monthly_day_spec?.newLessonNumber ?? row.monthly_new_ordinal, reviewWeekNumber: row.monthly_day_spec?.reviewWeekNumber ?? row.monthly_review_ordinal }) || row.title : row.title,
    dayNumber: row.day_number,
    ...(row.monthly_kind ? { teachingLabel: formatMonthlyDayLabel({ ...row.monthly_day_spec, kind: row.monthly_kind, newLessonNumber: row.monthly_day_spec?.newLessonNumber ?? row.monthly_new_ordinal, reviewWeekNumber: row.monthly_day_spec?.reviewWeekNumber ?? row.monthly_review_ordinal }), ...(row.monthly_kind === "new" && row.monthly_new_ordinal ? { newLessonNumber: row.monthly_day_spec?.newLessonNumber ?? row.monthly_new_ordinal } : {}) } : {}),
    weekNumber: row.week_number,
    weekTopic: row.week_topic,
    cefr: row.cefr,
    content: { ...row.content, parts: normalizeLessonParts(withMonthlyGrammarTopicName(row.monthly_core_terms
      ? withMonthlyExpandedTerms(row.content.parts ?? [], withFrozenMonthlyIllustrations(row.monthly_core_terms, row.frozen_illustrations), [])
      : row.content.parts ?? [],
      // Grammar point name from the approved day plan (stored lessons carry none).
      row.monthly_kind && row.monthly_day_spec ? monthlyGrammarDayTopicName(row.cefr, { ...row.monthly_day_spec, kind: row.monthly_kind }, row.monthly_grammar_topics) : undefined), row.cefr) },
    progress: mapProgress(
      row.progress_status ?? "not_started",
      row.progress_score,
      row.progress_evidence ?? {},
      row.progress_updated_at
    ),
    lock: lessonLockFor(row),
    ...(row.monthly_kind ? { monthlyKind: row.monthly_kind, lessonDate: row.lesson_date, systemDate: row.system_date } : {})
  };
}

function lessonLockFor(row: {
  day_number: number;
  lesson_count?: string;
  opens_at?: string;
  opens_later?: boolean;
  blocker_id?: string | null;
  blocker_day_number?: number | null;
  blocker_title?: string | null;
}): LessonLockView | null {
  const totalLessons = Number(row.lesson_count ?? 0);
  if (row.blocker_id && row.blocker_day_number && row.blocker_title) {
    return {
      reason: "prior",
      message: `Bạn chưa hoàn thành ${lessonDayLabel(row.blocker_day_number)} · ${row.blocker_title} (bài ${row.blocker_day_number}/${totalLessons}). Các bài nối tiếp nhau nên không bỏ qua được: xong bài đó thì bài này tự mở.`,
      dayNumber: row.day_number,
      totalLessons,
      blocker: { id: row.blocker_id, dayNumber: row.blocker_day_number, title: row.blocker_title }
    };
  }
  if (row.opens_later && row.opens_at) {
    return {
      reason: "date",
      message: "Bạn đã xong các bài trước; hôm nay có thể luyện thêm với Season.",
      dayNumber: row.day_number,
      totalLessons,
      opensAt: row.opens_at
    };
  }
  return null;
}

/** SQL predicate: the month lesson `ml` of framework `mf` is a Friday review. */
export const MONTH_LESSON_IS_REVIEW_SQL = "(mf.curriculum_contract->'daySpecs' @> jsonb_build_array(jsonb_build_object('lessonNumber', ml.lesson_number, 'kind', 'review')))";

/**
 * SQL predicate for a staff "level-up allowed" override `o` that is still in force: not ended,
 * granted at the learner's current level `cefrSql`, and no level-up attempt started after the
 * grant has been decided (approved or sent back for retry). A level change ends it implicitly.
 */
export function levelUpOverrideActiveSql(cefrSql: string, alias = "o"): string {
  return `(${alias}.ended_at is null and ${alias}.from_cefr = ${cefrSql}
    and not exists (
      select 1 from assessment_attempts lo_aa
      join assessment_versions lo_av on lo_av.id = lo_aa.assessment_version_id
      join assessment_definitions lo_ad on lo_ad.id = lo_av.definition_id and lo_ad.kind = 'level_up'
      join assessment_decisions lo_d on lo_d.attempt_id = lo_aa.id and lo_d.status in ('approved', 'retry')
      where lo_aa.learner_id = ${alias}.learner_id and lo_aa.started_at >= ${alias}.granted_at
    ))`;
}

/**
 * Attendance dates per month from persisted completions and holidays, using
 * the domain rule (Friday counts only through a review; a late review credits
 * its effective makeup day). Shared by exam eligibility and level-up records.
 */
export async function learnerMonthlyAttendanceDates(pool: Pool | PoolClient, learnerId: string, months: readonly string[], scope?: { cefr: CefrLevel; from?: Date }): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!months.length) return result;
  const [completions, context] = await Promise.all([
    pool.query<{ completed_date: string; kind: "new" | "review" }>(
      // completed_on is the organisation (test) date of the completion, matching the system date used below.
      `select pr.completed_on::text as completed_date,
              case when ml.id is not null and ${MONTH_LESSON_IS_REVIEW_SQL} then 'review' else 'new' end as kind
         from progress_records pr
         left join month_lessons ml on ml.lesson_id = pr.lesson_id
         left join month_frameworks mf on mf.id = ml.framework_id
        where pr.learner_id = $1 and pr.status = 'completed' and pr.completed_on is not null
          and to_char(pr.completed_on, 'YYYY-MM') = any($2::text[])
          and ($3::text is null or mf.cefr = $3)
          and ($4::timestamptz is null or pr.completed_at >= $4)`,
      [learnerId, months, scope?.cefr ?? null, scope?.from ?? null]
    ),
    pool.query<{ system_date: string; holidays: string[] | null; exam_dates: Record<string, string> | null }>(
      `select organization_system_date(u.organization_id)::text as system_date,
              (select array_agg(h.holiday_date::text) from organization_holidays h
                where h.organization_id = u.organization_id and to_char(h.holiday_date, 'YYYY-MM') = any($2::text[])) as holidays,
              (select jsonb_object_agg(pm.month, pm.exam_date::text) from program_months pm
                where pm.organization_id = u.organization_id and pm.month = any($2::text[]) and pm.exam_date is not null) as exam_dates
         from users u where u.id = $1`,
      [learnerId, months]
    )
  ]);
  const facts = context.rows[0];
  const levelStartLocal = scope?.from && new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).format(scope.from);
  // A level started after a rolled-back system date counts from the system date.
  const levelStartDate = levelStartLocal && facts?.system_date ? notAfterSystemDate(levelStartLocal, facts.system_date) : levelStartLocal;
  for (const month of months) {
    const examDate = facts?.exam_dates?.[month];
    try {
      result.set(month, monthlyAttendanceDates({
        month,
        ...(examDate ? { examDate } : {}),
        ...(facts?.system_date ? { systemDate: facts.system_date } : {}),
        completions: completions.rows
          .filter((row) => row.completed_date.startsWith(month))
          .map((row) => ({ completedDate: row.completed_date, kind: row.kind })),
        holidays: mergedVietnamHolidays(month, (facts?.holidays ?? []).map(date => ({ date }))).map(day => day.date)
      }).filter(date => !levelStartDate || date >= levelStartDate));
    } catch {
      result.set(month, []);
    }
  }
  return result;
}

/**
 * Dates per month on which an approved lesson of the learner's level was
 * available (approved month lesson in an approved, published framework). Only
 * these past days can be absences (December 2026: 22 absences with 7 lessons).
 */
export async function learnerMonthlyLessonDates(pool: Pool | PoolClient, learnerId: string, months: readonly string[], cefr: CefrLevel): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>(months.map((month) => [month, new Set<string>()]));
  if (!months.length) return result;
  const { rows } = await pool.query<{ month: string; lesson_date: string }>(
    `select pm.month, ml.lesson_date::text as lesson_date
       from users u
       join program_months pm on pm.organization_id = u.organization_id and pm.month = any($2::text[])
       join month_frameworks mf on mf.program_month_id = pm.id and mf.cefr = $3
         and mf.status = 'approved' and mf.published_at is not null
       join month_lessons ml on ml.framework_id = mf.id and ml.status = 'approved'
      where u.id = $1`,
    [learnerId, months, cefr]
  );
  for (const row of rows) result.get(row.month)?.add(row.lesson_date);
  return result;
}

/**
 * A date stamped from the organisation system date (publication, level start, unlock) is never in
 * the future in real time; after a simulated-date rollback it counts as the current system date.
 */
export function notAfterSystemDate(date: string | null, systemDate: string): string | null {
  return date !== null && date > systemDate ? systemDate : date;
}

type LearnerMonthlyAccess = ReturnType<typeof monthlyLearnerWindow> & {
  state: "active" | "unplaced" | "waiting_content" | "waiting_next_month" | "missed_exam";
  month: string; systemDate: string; examDate: string; cefr: CefrLevel | null; resetOn: string | null; graduated: boolean;
};

export async function learnerMonthlyAccess(db: Pool | PoolClient, learnerId: string, month?: string): Promise<LearnerMonthlyAccess | null> {
  const { rows: [row] } = await db.query<{
    system_date: string; month: string; cefr: CefrLevel | null; level_started_on: string | null;
    exam_date: string | null; published_on: string | null; reset_on: string | null; unlocked_on: string | null; graduated: boolean;
  }>(
    `select dates.system_date::text, dates.month, enrollment.cefr, enrollment.level_started_on::text,
            pm.exam_date::text, framework.published_on::text, learner.attendance_reset_on::text as reset_on,
            exists(select 1 from pass_course_certificates certificate where certificate.learner_id = learner.id) as graduated,
            (select max(coalesce(nullif(complaint.related_data->>'resolvedOn', '')::date,
                     (complaint.resolved_at at time zone 'Asia/Ho_Chi_Minh')::date))::text
               from learner_complaints complaint where complaint.learner_id = learner.id
                 and complaint.kind = 'lesson_unlock' and complaint.status = 'approved'
                 and complaint.related_data->>'month' = dates.month) as unlocked_on
       from users learner
       cross join lateral (select organization_system_date(learner.organization_id) as system_date,
         coalesce($2, to_char(organization_system_date(learner.organization_id), 'YYYY-MM')) as month) dates
       left join lateral (
         select e.cefr, ${learnerLevelStartedOnSql("e", "learner.id")} as level_started_on
         from enrollments e join programs p on p.id = e.program_id and p.status = 'active'
         where e.learner_id = learner.id and e.cefr_approved and e.cefr is not null
         order by e.enrolled_at desc limit 1
       ) enrollment on true
       left join program_months pm on pm.organization_id = learner.organization_id and pm.month = dates.month
       left join month_frameworks framework on framework.program_month_id = pm.id and framework.cefr = enrollment.cefr
         and framework.status = 'approved' and framework.published_at is not null
       where learner.id = $1 and learner.role = 'learner'`,
    [learnerId, month ?? null]
  );
  if (!row) return null;
  const examDate = row.exam_date ?? buildMonthlyCalendar(row.month).examDate;
  // These dates are stamped from the system date of the moment. After a tester moves the simulated
  // date backwards one can lie after it; published content and an approved level must stay open,
  // so such a date counts as the system date (and no day before it is ever counted as missed).
  const publishedOn = notAfterSystemDate(row.published_on, row.system_date);
  const approvalDate = [`${row.month}-01`, notAfterSystemDate(row.level_started_on, row.system_date), publishedOn,
    notAfterSystemDate(row.unlocked_on, row.system_date)]
    .filter((date): date is string => date !== null).sort().at(-1)!;
  const window = monthlyLearnerWindow(row.month, examDate, approvalDate);
  let state: LearnerMonthlyAccess["state"] = !row.cefr ? "unplaced"
    : !publishedOn || publishedOn > row.system_date ? "waiting_content"
    : !window.canStudy || approvalDate > row.system_date ? "waiting_next_month"
    : "active";
  if (row.cefr && !row.graduated && !row.unlocked_on && row.month === row.system_date.slice(0, 7)
      && await learnerMissedPreviousExam(db, learnerId, row.month, row.cefr)) {
    state = "missed_exam";
  }
  return { ...window, state, month: row.month, systemDate: row.system_date, examDate, cefr: row.cefr, resetOn: row.reset_on, graduated: row.graduated };
}

function previousLearningMonth(month: string): string {
  const previousDate = new Date(`${month}-01T00:00:00Z`);
  previousDate.setUTCDate(0);
  return previousDate.toISOString().slice(0, 7);
}

async function learnerMissedPreviousExam(db: Pool | PoolClient, learnerId: string, month: string, cefr: CefrLevel) {
  const previousMonth = previousLearningMonth(month);
  const { rows: [exam] } = await db.query<{ override: boolean; grace_open: boolean }>(
    `select exists(select 1 from learner_complaints c where c.learner_id = learner.id and c.kind = 'exam_eligibility'
              and c.status in ('approved', 'auto_approved') and left(c.related_data->>'month', 7) = $2
              and coalesce(c.related_data->>'cefr', $3) = $3) as override,
            exists(select 1 from learner_complaints c where c.learner_id = learner.id and c.kind = 'exam_eligibility'
              and left(c.related_data->>'month', 7) = $2 and coalesce(c.related_data->>'cefr', $3) = $3
              and (c.status = 'pending' or (c.status in ('approved', 'auto_approved')
                and coalesce(nullif(c.related_data->>'resolvedOn', '')::date, (c.resolved_at at time zone 'Asia/Ho_Chi_Minh')::date)
                    + (c.resolved_at at time zone 'Asia/Ho_Chi_Minh')::time >= pm.exam_date + $4::time
                and now() < c.resolved_at + interval '24 hours'))) as grace_open
       from users learner join program_months pm on pm.organization_id = learner.organization_id and pm.month = $2
       join assessment_definitions d on d.organization_id = learner.organization_id and d.kind = 'final'
         and d.assessment_key = ('monthly-final-' || $2 || '-' || lower($3))
       where learner.id = $1
         and exists (select 1 from assessment_versions v where v.definition_id = d.id and v.published_at is not null)
         and not exists (select 1 from assessment_attempts a join assessment_versions v on v.id = a.assessment_version_id
           where a.learner_id = learner.id and v.definition_id = d.id)`,
    [learnerId, previousMonth, cefr, MONTHLY_EXAM_ENTRY_CUTOFF]
  );
  if (!exam || exam.grace_open) return false;
  const prior = await learnerMonthlyAccess(db, learnerId, previousMonth);
  if (prior?.state !== "active") return false;
  if (exam.override) return true;
  const [attendanceByMonth, lessonDates] = await Promise.all([
    learnerMonthlyAttendanceDates(db, learnerId, [previousMonth], { cefr }),
    learnerMonthlyLessonDates(db, learnerId, [previousMonth], cefr)
  ]);
  const attendance = attendanceByMonth.get(previousMonth) ?? [];
  // Only days that had an approved lesson count (the month is over, so every day is past).
  const counted = monthlyAttendanceCountedDates(prior.effectiveDates, lessonDates.get(previousMonth) ?? new Set(), prior.systemDate);
  const attended = attendance.filter(date => counted.includes(date)).length;
  return counted.length - attended <= Math.floor(counted.length * 0.3);
}

async function learnerLearningAbsences(db: Pool | PoolClient, learnerId: string, access: LearnerMonthlyAccess): Promise<number> {
  return (await learnerAbsenceStreak(db, learnerId, access)).days;
}

async function learnerAbsenceStreak(db: Pool | PoolClient, learnerId: string, access: LearnerMonthlyAccess): Promise<{ days: number; startedOn: string | null }> {
  if (access.state !== "active" || !access.cefr || access.graduated) return { days: 0, startedOn: null };
  const previous = await learnerMonthlyAccess(db, learnerId, previousLearningMonth(access.month));
  const windows = previous?.state === "active" ? [previous, access] : [access];
  const [attendance, lessonDates] = await Promise.all([
    learnerMonthlyAttendanceDates(db, learnerId, windows.map(item => item.month), { cefr: access.cefr }),
    learnerMonthlyLessonDates(db, learnerId, windows.map(item => item.month), access.cefr)
  ]);
  // A past weekday without an approved lesson is never an absence.
  const counted = windows.flatMap(item => monthlyAttendanceCountedDates(item.effectiveDates, lessonDates.get(item.month) ?? new Set(), access.systemDate));
  return learningAbsenceStreak(counted, [...attendance.values()].flat(), access.systemDate, access.resetOn ?? undefined);
}

export async function learnerConsecutiveLearningAbsences(db: Pool | PoolClient, learnerId: string) {
  const access = await learnerMonthlyAccess(db, learnerId);
  return access ? learnerLearningAbsences(db, learnerId, access) : 0;
}

/** Consecutive missed learning days with the first missed date of the run (stable key for one streak). */
export async function learnerLearningAbsenceStreak(db: Pool | PoolClient, learnerId: string): Promise<{ days: number; startedOn: string | null }> {
  const access = await learnerMonthlyAccess(db, learnerId);
  return access ? learnerAbsenceStreak(db, learnerId, access) : { days: 0, startedOn: null };
}

/** Days in a row after which the inactivity job locks a learner account. */
export const LEARNING_ABSENCE_LOCK_DAYS = 5;
/** First streak length that warns the learner (one inbox notification per streak length). */
export const LEARNING_ABSENCE_WARNING_DAYS = 3;

/**
 * Puts the absence warning into the learner's notification bell: one notification per streak
 * length (3, then 4 days) of the same streak, never one per day. The event key holds the first
 * missed date, so a new streak after attending again warns again.
 */
export async function syncLearnerAbsenceNotice(db: Pool | PoolClient, learnerId: string, streak?: { days: number; startedOn: string | null }): Promise<void> {
  const current = streak ?? await learnerLearningAbsenceStreak(db, learnerId);
  if (!current.startedOn || current.days < LEARNING_ABSENCE_WARNING_DAYS || current.days >= LEARNING_ABSENCE_LOCK_DAYS) return;
  await db.query(
    `select notify_inbox(organization_id, 'learner', id, $2, 'absence_warning', $3)
     from users where id = $1 and role = 'learner' and status = 'active'`,
    [learnerId, `absence:${current.startedOn}:${current.days}`, String(current.days)]
  );
}

export async function autoApproveExpiredEligibilityComplaints(
  db: Pool | PoolClient, scope: { learnerId?: string; organizationId?: string } = {}
) {
  await db.query(
    `with resolved as (
       update learner_complaints
       set status = 'auto_approved', resolution = 'Tự duyệt do quá hạn', resolved_at = due_at,
           related_data = related_data || jsonb_build_object('resolvedOn', organization_system_date(organization_id)
             + ((due_at at time zone 'Asia/Ho_Chi_Minh')::date - (now() at time zone 'Asia/Ho_Chi_Minh')::date))
       where kind = 'exam_eligibility' and status = 'pending' and due_at <= now()
         and ($1::uuid is null or learner_id = $1) and ($2::uuid is null or organization_id = $2)
       returning id, organization_id
     )
     insert into audit_events (id, organization_id, action, entity_type, entity_id, payload, trace_id)
     select gen_random_uuid(), organization_id, 'learner.complaint.auto_approved', 'learner_complaint',
            id, jsonb_build_object('resolution', 'Tự duyệt do quá hạn'), gen_random_uuid()::text from resolved`,
    [scope.learnerId ?? null, scope.organizationId ?? null]
  );
}

/**
 * Monthly lesson locks come from the domain gate (sequential order, holiday
 * chains, Friday review gating the next Monday, calendar date). The SQL only
 * supplies persisted facts.
 */
function applyMonthlyLessonAccess(
  records: LearnerLessonRecord[],
  rows: ReadonlyArray<{ id: string; day_number: number; lesson_date?: string; monthly_kind?: "new" | "review";
  monthly_day_spec?: import("@e4s/domain").MonthlyDaySpec;
  monthly_new_ordinal?: number;
  monthly_review_ordinal?: number; review_gates_next_week?: boolean | null; review_from_previous_month?: boolean | null }>,
  month: string,
  systemDate: string,
  holidays: readonly string[]
): LearnerLessonRecord[] {
  let access: MonthlyLessonAccess[];
  try {
    access = evaluateMonthlyLessonAccess({
      month,
      systemDate,
      holidays,
      lessons: rows.map((row, index) => ({
        lessonNumber: row.day_number,
        date: row.lesson_date ?? "",
        kind: row.monthly_kind ?? "new",
        completed: records[index]?.progress.status === "completed",
        ...(typeof row.review_gates_next_week === "boolean" ? { reviewGatesNextWeek: row.review_gates_next_week } : {}),
        ...(typeof row.review_from_previous_month === "boolean" ? { reviewFromPreviousMonth: row.review_from_previous_month } : {})
      }))
    });
  } catch {
    return records;
  }
  const byNumber = new Map(records.map((record) => [record.dayNumber, record]));
  const totalLessons = records.length;
  return records.map((record) => {
    const decision = access.find((item) => item.lessonNumber === record.dayNumber);
    if (!decision || !decision.locked) return { ...record, lock: null };
    if (decision.reason === "date") {
      return { ...record, lock: { reason: "date", message: "Bạn đã xong các bài trước; hôm nay có thể luyện thêm với Season.", dayNumber: record.dayNumber, totalLessons, opensAt: decision.opensAt } };
    }
    const blocker = byNumber.get(decision.blockerLessonNumber);
    // Name the blocker like the calendar: "Bài N" counts new lessons only; a review is "Ôn tuần N", never "Bài N".
    const blockerLabel = blocker ? (blocker.monthlyKind === "review" ? blocker.teachingLabel ?? "Ôn tập" : blocker.newLessonNumber ? `Bài ${blocker.newLessonNumber}` : blocker.teachingLabel) : undefined;
    const blockerView = blocker ? { id: blocker.id, dayNumber: blocker.dayNumber, title: blocker.title, ...(blockerLabel ? { label: blockerLabel } : {}) } : undefined;
    if (decision.reason === "review") {
      return { ...record, lock: {
        reason: "review",
        message: `Hoàn thành bài ôn tuần ${decision.reviewWeekNumber} để mở bài này.`,
        dayNumber: record.dayNumber, totalLessons, reviewWeekNumber: decision.reviewWeekNumber,
        ...(blockerView ? { blocker: blockerView } : {})
      } };
    }
    return { ...record, lock: {
      reason: "prior",
      message: blocker
        ? `Bạn chưa hoàn thành ${blockerLabel ? monthlyLessonPhrase(blockerLabel) : `bài ${blocker.dayNumber}/${totalLessons}`} · ${blocker.title}. Các bài nối tiếp nhau nên không bỏ qua được: xong bài đó thì bài này tự mở.`
        : "Bạn chưa hoàn thành bài trước. Xong bài đó thì bài này tự mở.",
      dayNumber: record.dayNumber, totalLessons,
      ...(blockerView ? { blocker: blockerView } : {})
    } };
  });
}

function lessonDayLabel(dayNumber: number): string {
  return (["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const)[dayNumber - 1] ?? `Bài ${dayNumber}`;
}

/** "Bài 5" -> "bài 5", "Ôn tuần 1" -> "bài ôn tuần 1" for use inside a sentence. */
function monthlyLessonPhrase(label: string): string {
  return label.startsWith("Bài ") ? `bài ${label.slice(4)}` : `bài ${label.charAt(0).toLocaleLowerCase("vi")}${label.slice(1)}`;
}

function mapProgress(
  status: LessonProgressView["status"],
  score: string | null,
  stored: Record<string, unknown>,
  updatedAt: Date | null
): LessonProgressView {
  const completedPartCodes = Array.isArray(stored.completedPartCodes)
    ? stored.completedPartCodes as LessonProgressView["completedPartCodes"]
    : [];
  const evidence = stored.evidence && typeof stored.evidence === "object"
    ? stored.evidence as LessonProgressView["evidence"]
    : {};
  return {
    status,
    completedPartCodes,
    evidence,
    ...(score !== null ? { score: Number(score) } : {}),
    ...(updatedAt ? { updatedAt: updatedAt.toISOString() } : {})
  };
}

function mapPartEvidence(row: {
  attempt_number: number;
  status: StoredLessonAttemptStatus;
  answer: string | null;
  score: string | null;
  feedback: string | null;
  artifact_key: string | null;
  grading?: LessonAttemptGrading | null;
}): PartEvidence {
  // An unclear recording ('retake') reads as "try again" without using an attempt.
  const retake = row.status === "retake";
  const status: PartEvidence["status"] = row.status === "retake" ? "wrong_retry" : row.status;
  const aiGrading = row.grading?.state === "pending" || row.grading?.state === "operator" ? row.grading.state : undefined;
  return {
    attempts: retake ? Math.max(0, row.attempt_number - 1) : row.attempt_number,
    ...(status === undefined ? {} : { status }),
    ...(row.answer === null ? {} : { answer: row.answer }),
    ...(row.score === null ? {} : { score: Number(row.score) }),
    ...(row.feedback === null ? {} : { feedback: row.feedback }),
    ...(row.artifact_key === null ? {} : { artifactKey: row.artifact_key }),
    ...(aiGrading ? { aiGrading } : {})
  };
}

export const LESSON_PRODUCTIVE_GRADING_JOB = "lesson.productive-grade";

interface LessonAttemptRow {
  id: string; lesson_id: string; part_code: LessonPartCode; attempt_number: number; status: StoredLessonAttemptStatus;
  answer: string | null; score: string | null; feedback: string | null; artifact_key: string | null; grading: LessonAttemptGrading | null;
}

/**
 * Writes a background-graded attempt into the learner's lesson progress, when it
 * is still the latest attempt for that part: correct / wrong_exhausted finish the
 * part, wrong_retry (incl. an unclear recording) reopens it for another try.
 */
async function applyLessonAttemptEvidence(client: PoolClient, learnerId: string, row: LessonAttemptRow, evidence: PartEvidence): Promise<void> {
  const latest = await client.query<{ id: string }>(
    `select id from lesson_part_attempts where learner_id = $1 and lesson_id = $2 and part_code = $3
     order by created_at desc, attempt_number desc limit 1`,
    [learnerId, row.lesson_id, row.part_code]
  );
  if (latest.rows[0]?.id !== row.id) return;
  const progress = await client.query<{ evidence: { completedPartCodes?: LessonPartCode[]; evidence?: Partial<Record<LessonPartCode, PartEvidence>> } | null }>(
    "select evidence from progress_records where learner_id = $1 and lesson_id = $2 for update",
    [learnerId, row.lesson_id]
  );
  const stored = progress.rows[0]?.evidence;
  if (!progress.rowCount || !stored) return;
  const current = stored.evidence?.[row.part_code];
  // A later attempt never replaces a part that is already correct from another attempt.
  if (current?.status === "correct" && current.attempts !== row.attempt_number) return;
  const next: PartEvidence = {
    ...(current?.appealStatus ? { appealStatus: current.appealStatus } : {}),
    ...(current?.translationViewed !== undefined ? { translationViewed: current.translationViewed } : {}),
    ...evidence
  };
  const finished = ["correct", "wrong_exhausted"].includes(evidence.status ?? "") || evidence.status === "submitted";
  const completedPartCodes = (stored.completedPartCodes ?? []).filter((code) => code !== row.part_code);
  if (finished) completedPartCodes.push(row.part_code);
  await client.query(
    `update progress_records set evidence = $3::jsonb, updated_at = now() where learner_id = $1 and lesson_id = $2`,
    [learnerId, row.lesson_id, JSON.stringify({ ...stored, completedPartCodes, evidence: { ...(stored.evidence ?? {}), [row.part_code]: next } })]
  );
}

type StoredLessonAttemptStatus = PartEvidence["status"] | "retake";

export interface LessonAttemptFailedPosition {
  target: string;
  kind: "pronunciation" | "required_word" | "grammar";
  note: string;
}

/** AI grading state stored on lesson_part_attempts.grading. */
export interface LessonAttemptGrading {
  state: "pending" | "graded" | "operator";
  queuedAt?: string;
  gradedAt?: string;
  level?: "pass" | "near" | "fail" | "retake";
  transcript?: string;
  failedPositions?: LessonAttemptFailedPosition[];
  usedRequiredWords?: string[];
  /** Pronunciation focus of the day, kept with the positions for M1 / Friday review. */
  focus?: string;
  sttModel?: string;
  model?: string;
  traceId?: string;
  code?: string;
}

function gradeLessonPart(
  partCode: LessonPartCode,
  content: Record<string, unknown>,
  input: LessonPartAttemptEvidenceInput,
  attemptNumber: number
): { status: Exclude<NonNullable<PartEvidence["status"]>, "unanswered" | "appealed">; score: number; feedback: string } {
  if (partCode === "speaking" && input.artifactKey) {
    return { status: "submitted", score: 0, feedback: "Đã nhận file ghi âm. Bài được lưu để người vận hành kiểm tra khi AI không sẵn sàng." };
  }
  const answer = input.answer?.trim() ?? "";
  if (partCode === "writing" && (content.type === undefined || content.type === "write") && answer.split(/\s+/u).filter(Boolean).length >= 2) {
    return { status: "submitted", score: 0, feedback: "Đã lưu câu tự viết để chấm tay khi AI chưa sẵn sàng." };
  }
  const expected = content.answer;
  const expectedAnswers = Array.isArray(expected) ? expected.map(String) : expected === undefined ? [] : [String(expected)];
  const correct = expectedAnswers.length
    ? expectedAnswers.some((candidate) => normalizeLessonAnswer(candidate) === normalizeLessonAnswer(answer))
    : Boolean(answer || input.artifactKey);
  if (correct) return { status: "correct", score: 100, feedback: "Đúng rồi. Bạn đã hoàn thành phần này." };
  return attemptNumber >= 2
    ? { status: "wrong_exhausted", score: 0, feedback: "Bạn đã hết lượt thử. Hãy xem lại phần hướng dẫn hoặc gửi kháng nghị." }
    : { status: "wrong_retry", score: 0, feedback: "Chưa đúng. Bạn còn một lượt thử." };
}

function normalizeLessonAnswer(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
}

function lessonExerciseOptions(content: Record<string, unknown>): string[] {
  const choices = Array.isArray(content.options) ? content.options : [content.option1, content.option2, content.option3, content.option4];
  return choices.filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
}

class ContentRepository {
  constructor(private readonly pool: Pool) {}

  private async exerciseWarnings(organizationId: string, warningId: string | null = null): Promise<NonNullable<ContentReviewView["exerciseWarnings"]>> {
    const result = await this.pool.query<{
      id: string; learner_name: string; cefr: CefrLevel; month: string; framework_id: string;
      lesson_id: string; day_number: number; lesson_title: string; part_code: string;
      exercise_version_id: string; content: Record<string, unknown>; first_answer: string; second_answer: string;
    }>(
      `select second.id, learner.display_name as learner_name, mf.cefr, pm.month, mf.id as framework_id,
              l.id as lesson_id, ml.lesson_number as day_number, l.title as lesson_title, second.part_code,
              part.id as exercise_version_id, part.content,
              first.answer as first_answer, second.answer as second_answer
       from lesson_part_attempts second
       join users learner on learner.id = second.learner_id and learner.role = 'learner' and learner.status = 'active'
       join month_lessons ml on ml.lesson_id = second.lesson_id and ml.status = 'approved'
       join month_frameworks mf on mf.id = ml.framework_id and mf.status = 'approved' and mf.published_at is not null
         and mf.scope_hash = ml.scope_hash
       join program_months pm on pm.id = mf.program_month_id and pm.organization_id = learner.organization_id
       join lessons l on l.id = ml.lesson_id
       join lateral (
         select attempt.answer from lesson_part_attempts attempt
         where attempt.learner_id = second.learner_id and attempt.lesson_id = second.lesson_id
           and attempt.part_code = second.part_code and attempt.attempt_number = 1 and attempt.status = 'wrong_retry'
         order by attempt.created_at desc limit 1
       ) first on true
       join lateral (
         select lv.id, entry->'content' as content
         from lesson_versions lv cross join lateral jsonb_array_elements(lv.content->'parts') entry
         where lv.lesson_id = l.id and lv.status = 'published' and entry->>'code' = second.part_code
         order by lv.version desc limit 1
       ) part on true
       where learner.organization_id = $1 and ($2::uuid is null or second.id = $2)
         and second.attempt_number = 2 and second.status = 'wrong_exhausted' and second.grading is null
         and mf.curriculum_contract->'daySpecs' @> jsonb_build_array(jsonb_build_object('lessonNumber', ml.lesson_number, 'kind', 'new'))
         and pm.month between to_char(organization_system_date(pm.organization_id) - interval '1 month', 'YYYY-MM')
                          and to_char(organization_system_date(pm.organization_id), 'YYYY-MM')
         and not exists (select 1 from audit_events ae where ae.organization_id = $1 and ae.entity_id = second.id
                         and ae.action in ('monthly.exercise_warning_no_issue', 'monthly.exercise_warning_corrected'))
       order by second.created_at desc limit 100`,
      [organizationId, warningId]
    );
    return result.rows.map(row => ({
      id: row.id, learnerName: row.learner_name, cefr: row.cefr, month: row.month, frameworkId: row.framework_id,
      lessonId: row.lesson_id, dayNumber: row.day_number, lessonTitle: row.lesson_title, partCode: row.part_code,
      exerciseVersionId: row.exercise_version_id,
      question: String(row.content.prompt ?? row.content.task ?? ""),
      options: lessonExerciseOptions(row.content),
      answerKey: typeof row.content.answer === "string" ? row.content.answer : null,
      answers: [row.first_answer ?? "", row.second_answer ?? ""]
    }));
  }

  async dismissExerciseWarning(actorId: string, warningId: string): Promise<boolean> {
    const actor = await this.pool.query<{ organization_id: string }>(
      "select organization_id from users where id = $1 and role = 'operator' and status = 'active'", [actorId]
    );
    const organizationId = actor.rows[0]?.organization_id;
    if (!organizationId || !(await this.exerciseWarnings(organizationId, warningId)).length) return false;
    await this.pool.query(
      `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
       values ($1, $2, $3, 'monthly.exercise_warning_no_issue', 'lesson_part_attempt', $1, '{}'::jsonb, $4)
       on conflict do nothing`,
      [warningId, organizationId, actorId, randomUUID()]
    );
    return true;
  }

  async resolveExerciseWarning(actorId: string, warningId: string, exerciseVersionId: string, correction: LessonExerciseCorrectionInput): Promise<boolean> {
    const actor = await this.pool.query<{ organization_id: string }>(
      "select organization_id from users where id = $1 and role = 'operator' and status = 'active'", [actorId]
    );
    const organizationId = actor.rows[0]?.organization_id;
    if (!organizationId) return false;
    const [warning] = await this.exerciseWarnings(organizationId, warningId);
    if (!warning) return false;
    if (warning.exerciseVersionId !== exerciseVersionId) throw new Error("LESSON_EXERCISE_CHANGED");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const regraded = await this.correctLessonExercise(client, warning.lessonId, warning.partCode as LessonPartCode, exerciseVersionId, correction);
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'monthly.exercise_warning_corrected', 'lesson_part_attempt', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, actorId, warningId, JSON.stringify(regraded), randomUUID()]
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async setLessonMatrixLevels(staffId: string, levels: readonly CefrLevel[]): Promise<ContentLessonMatrixView | null> {
    const uniqueLevels = [...new Set(levels)];
    if (!uniqueLevels.length || uniqueLevels.some((level) => !["A1", "A2", "B1", "B2", "C1"].includes(level))) {
      throw new Error("CONTENT_LESSON_LEVELS_INVALID");
    }
    const program = await this.pool.query<{ id: string }>(
      `select p.id from users staff
       join programs p on p.organization_id = staff.organization_id and p.status = 'active'
       where staff.id = $1 limit 1`,
      [staffId]
    );
    const programId = program.rows[0]?.id;
    if (!programId) return null;
    await this.pool.query(
      `insert into content_lesson_level_settings (program_id, levels, updated_at)
       values ($1, $2::text[], now())
       on conflict (program_id) do update set levels = excluded.levels, updated_at = now()`,
      [programId, uniqueLevels]
    );
    return this.lessonMatrix(staffId);
  }

  async listWeeks(staffId: string): Promise<ContentWeekFrameView | null> {
    const result = await this.pool.query<{
      program_id: string;
      start_date: string;
      week_count: number;
      current_week_override: number | null;
      cycle_number: string;
      today: string;
      id: string | null;
      week_number: number | null;
      topic: string | null;
      description: string | null;
      objectives: unknown;
      key_vocab_hint: string | null;
      ai_plan: unknown;
    }>(
      `select p.id as program_id, p.start_date::text, p.week_count, p.current_week_override,
              (select count(*)::text from programs cycle where cycle.organization_id = p.organization_id and cycle.created_at <= p.created_at) as cycle_number,
              organization_system_date(p.organization_id)::text as today,
              pw.id, pw.week_number, pw.topic, pw.description, pw.objectives, pw.key_vocab_hint, pw.ai_plan
       from users staff
       join programs p on p.organization_id = staff.organization_id and p.status = 'active'
       left join program_weeks pw on pw.program_id = p.id and pw.week_number <= p.week_count
       where staff.id = $1
       order by pw.week_number`,
      [staffId]
    );
    const first = result.rows[0];
    if (!first) return null;
    const start = new Date(`${first.start_date}T00:00:00.000Z`);
    const today = new Date(`${first.today}T00:00:00.000Z`);
    const dateText = (value: Date) => value.toISOString().slice(0, 10);
    return {
      pilot: { startDate: first.start_date, weekCount: first.week_count, cycleNumber: Number(first.cycle_number) || 1 },
      weeks: result.rows.flatMap((row) => {
        if (!row.id || row.week_number === null || row.topic === null) return [];
        const weekStart = new Date(start);
        weekStart.setUTCDate(start.getUTCDate() + ((row.week_number - 1) * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
        const objectives = Array.isArray(row.objectives)
          ? row.objectives.filter((value): value is string => typeof value === "string").join("; ")
          : "";
        return [{
          id: row.id,
          weekNumber: row.week_number,
          startDate: dateText(weekStart),
          endDate: dateText(weekEnd),
          current: first.current_week_override !== null
            ? row.week_number === first.current_week_override
            : today >= weekStart && today < new Date(weekEnd.getTime() + 86_400_000),
          topic: row.topic,
          description: row.description ?? "",
          objectives,
          keyVocabHint: row.key_vocab_hint ?? "",
          plan: normalizeWeekPlan(row.ai_plan)
        }];
      })
    };
  }

  async usedLessonTopics(staffId: string): Promise<string[]> {
    const result = await this.pool.query<{ topic: string }>(
      `select topic from (
         select distinct on (lower(trim(lsv.payload->>'topic')))
                trim(lsv.payload->>'topic') as topic, lsv.created_at
         from users staff
         join programs p on p.organization_id = staff.organization_id and p.status = 'active'
         join program_weeks pw on pw.program_id = p.id
         join lesson_sets ls on ls.program_week_id = pw.id
         join lesson_set_versions lsv on lsv.lesson_set_id = ls.id
         where staff.id = $1 and nullif(trim(lsv.payload->>'topic'), '') is not null
         order by lower(trim(lsv.payload->>'topic')), lsv.created_at desc
       ) history
       order by created_at desc
       limit 52`,
      [staffId]
    );
    return result.rows.map((row) => row.topic);
  }

  async usedSuggestedTopics(staffId: string): Promise<string[]> {
    const result = await this.pool.query<{ output: unknown }>(
      `select ar.output
       from users staff
       join users requester on requester.organization_id = staff.organization_id
       join ai_runs ar on ar.user_id = requester.id and ar.status = 'succeeded' and ar.output is not null
       join ai_tasks task on task.id = ar.task_id and task.task_key = 'week_suggestions'
       where staff.id = $1
       order by ar.completed_at desc nulls last, ar.created_at desc
       limit 25`,
      [staffId]
    );
    const topics: string[] = [];
    const seen = new Set<string>();
    for (const row of result.rows) {
      const output = row.output && typeof row.output === "object" && !Array.isArray(row.output)
        ? row.output as { weeks?: unknown }
        : {};
      if (!Array.isArray(output.weeks)) continue;
      for (const week of output.weeks) {
        const options = week && typeof week === "object" && !Array.isArray(week)
          ? (week as { options?: unknown }).options
          : undefined;
        if (!Array.isArray(options)) continue;
        for (const option of options) {
          const topic = option && typeof option === "object" && !Array.isArray(option)
            ? (option as { topic?: unknown }).topic
            : undefined;
          if (typeof topic !== "string" || !topic.trim()) continue;
          const key = topic.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
          if (seen.has(key)) continue;
          seen.add(key);
          topics.push(topic.trim());
          if (topics.length === 52) return topics;
        }
      }
    }
    return topics;
  }

  async saveWeeks(actorId: string, weeks: readonly ContentWeekInput[]): Promise<ContentWeekFrameView | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const program = await client.query<{ id: string; organization_id: string; week_count: number }>(
        `select p.id, p.organization_id, p.week_count
         from users actor join programs p on p.organization_id = actor.organization_id and p.status = 'active'
         where actor.id = $1 for update of p`,
        [actorId]
      );
      const row = program.rows[0];
      if (!row) throw new Error("CONTENT_PROGRAM_NOT_FOUND");
      for (const week of weeks) {
        if (week.weekNumber < 1 || week.weekNumber > row.week_count) throw new Error("CONTENT_WEEK_OUT_OF_RANGE");
        const nextPlan = JSON.stringify(normalizeWeekPlan(week.plan));
        // Topic and plan edits invalidate only unfinished authoring work.
        // Learners keep the current published set until publishVersion()
        // atomically retires it while promoting its approved replacement.
        await client.query(
          `update lesson_set_versions lsv set status = 'retired'
           from lesson_sets ls, program_weeks pw
           where lsv.lesson_set_id = ls.id and ls.program_week_id = pw.id
             and pw.program_id = $1 and pw.week_number = $2
             and lsv.status in ('draft', 'review')
             and (
               pw.topic <> $3
               or ($4::jsonb <> '{}'::jsonb and pw.ai_plan <> $4::jsonb)
             )`,
          [row.id, week.weekNumber, week.topic.trim(), nextPlan]
        );
        await client.query(
          `insert into program_weeks
             (id, program_id, week_number, topic, description, objectives, key_vocab_hint, ai_plan)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
           on conflict (program_id, week_number) do update set
             topic = excluded.topic, description = excluded.description,
             objectives = excluded.objectives, key_vocab_hint = excluded.key_vocab_hint,
             ai_plan = case
               when excluded.ai_plan <> '{}'::jsonb then excluded.ai_plan
               else program_weeks.ai_plan
             end`,
          [randomUUID(), row.id, week.weekNumber, week.topic.trim(), week.description.trim(),
            JSON.stringify(week.objectives.trim() ? [week.objectives.trim()] : []), week.keyVocabHint.trim(), JSON.stringify(normalizeWeekPlan(week.plan))]
        );
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'content.weeks.updated', 'program', $4, $5::jsonb, $6)`,
        [randomUUID(), row.organization_id, actorId, row.id,
          JSON.stringify({ weekNumbers: weeks.map((week) => week.weekNumber) }), randomUUID()]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    return this.listWeeks(actorId);
  }

  /**
   * Single entry point for the canonical weekly blueprint. The week row is
   * locked for the whole read-normalize-write cycle, so concurrent requests from
   * any operator or API process are serialized: the first request normalizes
   * and saves; every later request sees the saved canonical plan inside the
   * lock and `normalizePlan` returns it without calling AI.
   */
  async ensureCanonicalWeekPlan(
    actorId: string,
    weekNumber: number,
    normalizePlan: (currentWeek: ContentWeekInput) => Promise<{
      plan: ContentWeekInput["plan"];
      normalized: boolean;
    }>
  ): Promise<ContentWeekFrameView["weeks"][number] | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const locked = await client.query<{
        id: string;
        week_number: number;
        topic: string;
        description: string;
        objectives: string[] | null;
        key_vocab_hint: string;
        ai_plan: Record<string, string[]> | null;
      }>(
        `select pw.id, pw.week_number, pw.topic, pw.description, pw.objectives, pw.key_vocab_hint, pw.ai_plan
         from users actor
         join programs p on p.organization_id = actor.organization_id and p.status = 'active'
         join program_weeks pw on pw.program_id = p.id and pw.week_number = $2
         where actor.id = $1
         for update of pw`,
        [actorId, weekNumber]
      );
      const row = locked.rows[0];
      if (!row) {
        await client.query("rollback");
        return null;
      }
      const lockedPlan = normalizeWeekPlan(row.ai_plan ?? undefined);
      const objectives = Array.isArray(row.objectives)
        ? row.objectives.filter((value): value is string => typeof value === "string").join("; ")
        : "";
      const weekWithLockedPlan: ContentWeekInput = {
        weekNumber: row.week_number,
        topic: row.topic,
        description: row.description,
        objectives,
        keyVocabHint: row.key_vocab_hint,
        plan: lockedPlan
      };
      const outcome = await normalizePlan(weekWithLockedPlan);
      if (outcome.normalized) {
        // Compare-and-set against the locked value as a second guard.
        await client.query(
          `update program_weeks pw
           set ai_plan = $3::jsonb
           where pw.id = $1
             and md5(coalesce(pw.ai_plan, '{}'::jsonb)::text) = md5($2::jsonb::text)`,
          [row.id, JSON.stringify(row.ai_plan ?? {}), JSON.stringify(normalizeWeekPlan(outcome.plan) ?? {})]
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    const frameAfter = await this.listWeeks(actorId);
    return frameAfter?.weeks.find((candidate) => candidate.weekNumber === weekNumber) ?? null;
  }

  async lessonMatrix(staffId: string): Promise<ContentLessonMatrixView | null> {
    const program = await this.pool.query<{ id: string }>(
      `select p.id from users staff
       join programs p on p.organization_id = staff.organization_id and p.status = 'active'
       where staff.id = $1 limit 1`,
      [staffId]
    );
    const programId = program.rows[0]?.id;
    if (!programId) return null;
    const settings = await this.pool.query<{ levels: CefrLevel[] | null }>(
      "select levels from content_lesson_level_settings where program_id = $1",
      [programId]
    );
    const activeLevels = settings.rows[0]?.levels?.filter((level): level is CefrLevel => ["A1", "A2", "B1", "B2", "C1"].includes(level))
      ?? ["A1", "A2", "B1", "B2"];
    const levelsResult = await this.pool.query<{ cefr: CefrLevel; learner_count: string }>(
      `with supported(cefr, sort_order) as (
         values ('A1', 1), ('A2', 2), ('B1', 3), ('B2', 4), ('C1', 5)
       ), learner_counts as (
         select e.cefr, count(distinct e.learner_id)::integer as learner_count
         from enrollments e
         join users u on u.id = e.learner_id and u.role = 'learner' and u.status = 'active'
         where e.program_id = $1 and e.cefr is not null and e.cefr_approved group by e.cefr
       )
       select supported.cefr, coalesce(learner_counts.learner_count, 0)::text as learner_count
       from supported left join learner_counts using (cefr)
       where supported.cefr = any($2::text[])
       order by supported.sort_order`,
      [programId, activeLevels]
    );
    const levels = levelsResult.rows.map((row) => ({ cefr: row.cefr, learnerCount: Number(row.learner_count) }));
    const weeksResult = await this.pool.query<{ week_number: number; topic: string; ai_plan: unknown }>(
      `select pw.week_number, pw.topic, pw.ai_plan
       from program_weeks pw join programs p on p.id = pw.program_id
       where pw.program_id = $1 and pw.week_number <= p.week_count
       order by pw.week_number`,
      [programId]
    );
    const weeks: ContentLessonMatrixView["weeks"] = [];
    for (const week of weeksResult.rows) {
      const cells: ContentLessonMatrixView["weeks"][number]["cells"] = [];
      const plan = normalizeWeekPlan(week.ai_plan);
      for (const level of levels) {
        const version = await this.pool.query<{
          version_id: string;
          version: number;
          status: Extract<ContentLessonSetVersionView["status"], "draft" | "review" | "published">;
          created_at: Date;
          lessons: Array<{ dayNumber: number; title: string; content?: { parts?: ContentLessonDraftInput["parts"] } }>;
        }>(
          `select latest.version_id, latest.version, latest.status, latest.created_at,
                  coalesce(json_agg(json_build_object('dayNumber', l.day_number, 'title', l.title, 'content', lv.content)
                    order by l.day_number) filter (where l.id is not null), '[]') as lessons
           from program_weeks pw
           join lateral (
             select candidate.id as version_id, candidate.version, candidate.status, candidate.created_at
             from lesson_sets ls
             join lesson_set_versions candidate on candidate.lesson_set_id = ls.id
             where ls.program_week_id = pw.id
               and ls.cefr = $3
               and candidate.status in ('draft', 'review', 'published')
               and (
                 nullif(trim(candidate.payload->>'topic'), '') is null
                 or trim(candidate.payload->>'topic') = pw.topic
               )
             order by candidate.version desc, candidate.created_at desc, candidate.id desc
             limit 1
           ) latest on true
           left join lessons l on l.lesson_set_version_id = latest.version_id
           left join lateral (
             select lesson_version.content
             from lesson_versions lesson_version
             where lesson_version.lesson_id = l.id
             order by lesson_version.version desc
             limit 1
           ) lv on true
           where pw.program_id = $1 and pw.week_number = $2
           group by latest.version_id, latest.version, latest.status, latest.created_at`,
          [programId, week.week_number, level.cefr]
        );
        const row = version.rows[0];
        cells.push(row ? {
          cefr: level.cefr,
          status: row.status,
          versionId: row.version_id,
          version: row.version,
          updatedAt: row.created_at.toISOString(),
          lessons: row.lessons.map((lesson) => ({
            dayNumber: lesson.dayNumber,
            title: normalizeLessonTitle(lesson.title, lesson.content?.parts ?? [])
          })),
          ...(plan[level.cefr] ? { plan: plan[level.cefr] } : {})
        } : {
          cefr: level.cefr, status: "missing", versionId: null, version: null, updatedAt: null, lessons: [], ...(plan[level.cefr] ? { plan: plan[level.cefr] } : {})
        });
      }
      weeks.push({ weekNumber: week.week_number, topic: week.topic, cells });
    }
    return { levels, weeks };
  }

  async usedLessonVocabulary(staffId: string): Promise<string[]> {
    const result = await this.pool.query<{ word: string }>(
      `with latest_sets as (
         select distinct on (ls.id) lsv.id, lsv.created_at
         from users staff
         join programs p on p.organization_id = staff.organization_id and p.status = 'active'
         join program_weeks pw on pw.program_id = p.id
         join lesson_sets ls on ls.program_week_id = pw.id
         join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status <> 'retired'
         where staff.id = $1
         order by ls.id, lsv.version desc, lsv.created_at desc, lsv.id desc
       ), vocabulary as (
         select lower(trim(item ->> 'word')) as word, max(latest_sets.created_at) as last_used_at
         from latest_sets
         join lessons lesson on lesson.lesson_set_version_id = latest_sets.id
         join lateral (
           select lesson_version.content
           from lesson_versions lesson_version
           where lesson_version.lesson_id = lesson.id
           order by lesson_version.version desc
           limit 1
         ) current_lesson on true
         cross join lateral jsonb_array_elements(coalesce(current_lesson.content -> 'parts', '[]'::jsonb)) part
         cross join lateral jsonb_array_elements(
           case when jsonb_typeof(part -> 'content' -> 'items') = 'array'
             then part -> 'content' -> 'items' else '[]'::jsonb end
         ) item
         where part ->> 'code' = 'vocabulary' and trim(coalesce(item ->> 'word', '')) <> ''
         group by lower(trim(item ->> 'word'))
       )
       select word from vocabulary order by last_used_at desc, word`,
      [staffId]
    );
    return result.rows.map((row) => row.word);
  }

  async saveLessonDraft(
    actorId: string,
    weekNumber: number,
    cefr: CefrLevel,
    lessonDrafts: readonly ContentLessonDraftInput[],
    source: "manual" | "ai" = "manual",
    generation?: {
      schemaVersion: number;
      prompt: { versionId: string; content: string };
      input: Record<string, unknown>;
      output: unknown;
      validation: { valid: boolean; issues: readonly unknown[] };
      generatedAt: string;
    }
  ): Promise<ContentLessonSetVersionView> {
    const client = await this.pool.connect();
    let versionId = "";
    try {
      await client.query("begin");
      const context = await client.query<{ organization_id: string; week_id: string; topic: string }>(
        `select p.organization_id, pw.id as week_id, pw.topic
         from users actor
         join programs p on p.organization_id = actor.organization_id and p.status = 'active'
         join program_weeks pw on pw.program_id = p.id and pw.week_number = $2
         where actor.id = $1`,
        [actorId, weekNumber]
      );
      const row = context.rows[0];
      if (!row) throw new Error("CONTENT_WEEK_NOT_FOUND");
      const existingSet = await client.query<{ id: string }>(
        "select id from lesson_sets where program_week_id = $1 and cefr = $2 for update",
        [row.week_id, cefr]
      );
      const lessonSetId = existingSet.rows[0]?.id ?? randomUUID();
      if (!existingSet.rows[0]) {
        await client.query(
          "insert into lesson_sets (id, program_week_id, cefr) values ($1, $2, $3)",
          [lessonSetId, row.week_id, cefr]
        );
      }
      const next = await client.query<{ version: number }>(
        "select coalesce(max(version), 0) + 1 as version from lesson_set_versions where lesson_set_id = $1",
        [lessonSetId]
      );
      versionId = randomUUID();
      await client.query(
        `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by)
         values ($1, $2, $3, 'draft', $4::jsonb, $5)`,
        [versionId, lessonSetId, next.rows[0]?.version ?? 1,
          JSON.stringify({
            source,
            lessonCount: lessonDrafts.length,
            topic: row.topic,
            ...(generation ? { generation } : {})
          }), actorId]
      );
      for (const draft of lessonDrafts) {
        const lessonId = randomUUID();
        await client.query(
          "insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, $4)",
          [lessonId, versionId, draft.dayNumber, draft.title.trim()]
        );
        await client.query(
          `insert into lesson_versions (id, lesson_id, version, status, content)
           values ($1, $2, 1, 'draft', $3::jsonb)`,
          [randomUUID(), lessonId, JSON.stringify({ durationMinutes: draft.durationMinutes, parts: draft.parts })]
        );
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'content.lesson-set.draft-created', 'lesson_set_version', $4, '{}'::jsonb, $5)`,
        [randomUUID(), row.organization_id, actorId, versionId, randomUUID()]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    const saved = await this.lessonSetVersion(actorId, versionId);
    if (!saved) throw new Error("CONTENT_VERSION_NOT_FOUND");
    return saved;
  }

  /**
   * Create a new immutable draft version from the current draft/published
   * version, applying one small authoring operation to its lesson list.
   * Keeping the copy-on-write operation here means every client receives an
   * authoritative version and stale editors cannot overwrite newer work.
   */
  private async mutateLessonSet(
    actorId: string,
    weekNumber: number,
    cefr: CefrLevel,
    expectedVersion: number | undefined,
    action: string,
    mutate: (lessons: ContentLessonDraftInput[]) => ContentLessonDraftInput[],
    mutatePayload?: (payload: Record<string, unknown>) => Record<string, unknown>
  ): Promise<ContentLessonMutationResult> {
    const client = await this.pool.connect();
    let versionId = "";
    try {
      await client.query("begin");
      const context = await client.query<{ organization_id: string; week_id: string; topic: string }>(
        `select p.organization_id, pw.id as week_id, pw.topic
         from users actor
         join programs p on p.organization_id = actor.organization_id and p.status = 'active'
         join program_weeks pw on pw.program_id = p.id and pw.week_number = $2
         where actor.id = $1 limit 1`,
        [actorId, weekNumber]
      );
      const contextRow = context.rows[0];
      if (!contextRow) throw new Error("CONTENT_WEEK_NOT_FOUND");

      const setResult = await client.query<{ id: string }>(
        `select id from lesson_sets where program_week_id = $1 and cefr = $2 for update`,
        [contextRow.week_id, cefr]
      );
      let lessonSetId = setResult.rows[0]?.id;
      if (!lessonSetId) {
        lessonSetId = randomUUID();
        await client.query(
          "insert into lesson_sets (id, program_week_id, cefr) values ($1, $2, $3)",
          [lessonSetId, contextRow.week_id, cefr]
        );
      }

      const latestResult = await client.query<{
        id: string; version: number; status: ContentLessonSetVersionView["status"]; payload: Record<string, unknown>;
      }>(
        `select id, version, status, payload from lesson_set_versions
         where lesson_set_id = $1 order by version desc limit 1 for update`,
        [lessonSetId]
      );
      const latest = latestResult.rows[0];
      const currentVersion = latest?.version ?? 0;
      if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
        throw new Error("CONTENT_VERSION_CONFLICT");
      }
      if (latest?.status === "draft" && latest.version !== currentVersion) {
        throw new Error("CONTENT_VERSION_CONFLICT");
      }
      if (latest?.status === "review") throw new Error("CONTENT_NOT_EDITABLE");

      const baseVersionId = latest?.id ?? null;
      const baseRows = baseVersionId ? await client.query<{
        day_number: number; title: string; content: unknown;
      }>(
        `select l.day_number, l.title, lv.content
         from lessons l join lateral (
           select content from lesson_versions where lesson_id = l.id order by version desc limit 1
         ) lv on true
         where l.lesson_set_version_id = $1 order by l.day_number`,
        [baseVersionId]
      ) : { rows: [] };
      const baseLessons: ContentLessonDraftInput[] = baseRows.rows.map((row) => {
        const content = row.content && typeof row.content === "object"
          ? row.content as { durationMinutes?: unknown; parts?: unknown }
          : {};
        return {
          dayNumber: row.day_number,
          title: row.title,
          durationMinutes: typeof content.durationMinutes === "number" ? content.durationMinutes : 10,
          parts: Array.isArray(content.parts) ? content.parts as ContentLessonDraftInput["parts"] : []
        };
      });
      const lessons = mutate(baseLessons).sort((left, right) => left.dayNumber - right.dayNumber);
      const basePayload = latest?.payload && typeof latest.payload === "object" && !Array.isArray(latest.payload) ? latest.payload : {};
      const contentPayload = mutatePayload ? mutatePayload(basePayload) : basePayload;
      const nextVersion = currentVersion + 1;
      versionId = randomUUID();
      await client.query(
        `update lesson_set_versions set status = 'retired'
         where lesson_set_id = $1 and status = 'draft'`,
        [lessonSetId]
      );
      await client.query(
        `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by)
         values ($1, $2, $3, 'draft', $4::jsonb, $5)`,
        [versionId, lessonSetId, nextVersion, JSON.stringify({ ...contentPayload, source: "manual", lessonCount: lessons.length, operation: action, topic: contextRow.topic }), actorId]
      );
      for (const draft of lessons) {
        const lessonId = randomUUID();
        await client.query(
          "insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, $4)",
          [lessonId, versionId, draft.dayNumber, draft.title.trim()]
        );
        await client.query(
          `insert into lesson_versions (id, lesson_id, version, status, content)
           values ($1, $2, 1, 'draft', $3::jsonb)`,
          [randomUUID(), lessonId, JSON.stringify({ durationMinutes: draft.durationMinutes, parts: draft.parts })]
        );
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, $4, 'lesson_set_version', $5, $6::jsonb, $7)`,
        [randomUUID(), contextRow.organization_id, actorId, action, versionId,
          JSON.stringify({ weekNumber, cefr, expectedVersion: expectedVersion ?? null, version: nextVersion }), randomUUID()]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    const saved = await this.lessonSetVersion(actorId, versionId);
    if (!saved) throw new Error("CONTENT_VERSION_NOT_FOUND");
    return { ...saved, optimisticVersion: saved.version };
  }

  async upsertLessonDay(
    actorId: string,
    weekNumber: number,
    cefr: CefrLevel,
    dayNumber: number,
    lesson: ContentLessonDraftInput,
    expectedVersion?: number
  ): Promise<ContentLessonMutationResult> {
    if (lesson.dayNumber !== dayNumber || dayNumber < 1 || dayNumber > 7) throw new Error("CONTENT_DAY_MISMATCH");
    validateLessonDraftInput(lesson);
    return this.mutateLessonSet(actorId, weekNumber, cefr, expectedVersion, "content.lesson-day.saved", (lessons) => {
      const withoutDay = lessons.filter((candidate) => candidate.dayNumber !== dayNumber);
      return [...withoutDay, { ...lesson, title: lesson.title.trim() }];
    });
  }

  async deleteLessonDay(
    actorId: string,
    weekNumber: number,
    cefr: CefrLevel,
    dayNumber: number,
    expectedVersion?: number
  ): Promise<ContentLessonMutationResult> {
    return this.mutateLessonSet(actorId, weekNumber, cefr, expectedVersion, "content.lesson-day.deleted", (lessons) => {
      if (!lessons.some((lesson) => lesson.dayNumber === dayNumber)) throw new Error("CONTENT_DAY_NOT_FOUND");
      return lessons.filter((lesson) => lesson.dayNumber !== dayNumber);
    });
  }

  async saveLessonJson(
    actorId: string,
    weekNumber: number,
    cefr: CefrLevel,
    lessons: readonly ContentLessonDraftInput[],
    expectedVersion?: number
  ): Promise<ContentLessonMutationResult> {
    const days = new Set<number>();
    for (const lesson of lessons) {
      if (days.has(lesson.dayNumber)) throw new Error("CONTENT_DUPLICATE_DAY");
      days.add(lesson.dayNumber);
      validateLessonDraftInput(lesson);
    }
    return this.mutateLessonSet(actorId, weekNumber, cefr, expectedVersion, "content.lesson-set.json-saved", () => lessons.map((lesson) => ({ ...lesson, title: lesson.title.trim() })));
  }

  async saveWeeklyPractice(
    actorId: string,
    weekNumber: number,
    cefr: CefrLevel,
    input: ContentWeeklyPracticeDraftInput
  ): Promise<ContentLessonMutationResult> {
    const requiredVocabulary = [...new Set(input.requiredVocabulary.map((item) => item.trim()).filter(Boolean))];
    if (requiredVocabulary.length > 12) throw new Error("WEEKLY_PRACTICE_VOCABULARY_LIMIT");
    const weeklyPractice = {
      task: input.task.trim(),
      guidance: input.guidance.trim(),
      inputMode: "text_or_dictation" as const,
      requiredVocabulary
    };
    return this.mutateLessonSet(
      actorId, weekNumber, cefr, input.expectedVersion,
      "content.weekly-practice.saved",
      (lessons) => lessons,
      (payload) => ({ ...payload, weeklyPractice })
    );
  }

  async deleteDraftLessonSet(actorId: string, weekNumber: number, cefr: CefrLevel): Promise<{ deleted: true }> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{
        lesson_set_id: string; organization_id: string; published: boolean; enrolled: boolean;
      }>(
        `select ls.id as lesson_set_id, p.organization_id,
                exists(select 1 from lesson_set_versions where lesson_set_id = ls.id and status = 'published') as published,
                exists(select 1 from enrollments e where e.program_id = p.id and e.cefr = ls.cefr) as enrolled
         from users actor
         join programs p on p.organization_id = actor.organization_id and p.status = 'active'
         join program_weeks pw on pw.program_id = p.id and pw.week_number = $2
         join lesson_sets ls on ls.program_week_id = pw.id and ls.cefr = $3
         where actor.id = $1 limit 1 for update of ls`,
        [actorId, weekNumber, cefr]
      );
      const row = result.rows[0];
      if (!row) throw new Error("CONTENT_DRAFT_NOT_FOUND");
      if (row.published || row.enrolled) throw new Error("CONTENT_DRAFT_IN_USE");
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'content.lesson-set.draft-deleted', 'lesson_set', $4, $5::jsonb, $6)`,
        [randomUUID(), row.organization_id, actorId, row.lesson_set_id, JSON.stringify({ weekNumber, cefr }), randomUUID()]
      );
      await client.query("delete from lesson_sets where id = $1", [row.lesson_set_id]);
      await client.query("commit");
      return { deleted: true };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async lessonSetVersion(staffId: string, versionId: string): Promise<ContentLessonSetVersionView | null> {
    const version = await this.pool.query<{
      lesson_set_id: string;
      version_id: string;
      version: number;
      status: ContentLessonSetVersionView["status"];
      week_number: number;
      topic: string;
      cefr: CefrLevel;
      created_by: string | null;
      approved_by: string | null;
      created_at: Date;
      published_at: Date | null;
      payload: Record<string, unknown>;
    }>(
      `select ls.id as lesson_set_id, lsv.id as version_id, lsv.version, lsv.status,
              pw.week_number, pw.topic, ls.cefr, lsv.created_by, lsv.approved_by,
              lsv.created_at, lsv.published_at, lsv.payload
       from users staff
       join programs p on p.organization_id = staff.organization_id
       join program_weeks pw on pw.program_id = p.id
       join lesson_sets ls on ls.program_week_id = pw.id
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.id = $2
       where staff.id = $1`,
      [staffId, versionId]
    );
    const row = version.rows[0];
    if (!row) return null;
    const lessons = await this.pool.query<{
      id: string;
      day_number: number;
      title: string;
      content: { durationMinutes?: number; parts?: ContentLessonDraftInput["parts"] };
    }>(
      `select l.id, l.day_number, l.title, lv.content
       from lessons l join lateral (
         select content from lesson_versions where lesson_id = l.id order by version desc limit 1
       ) lv on true
       where l.lesson_set_version_id = $1 order by l.day_number`,
      [versionId]
    );
    const generatedPractice = weeklyPracticeTask(row.topic, row.cefr);
    const storedPractice = row.payload.weeklyPractice && typeof row.payload.weeklyPractice === "object"
      ? row.payload.weeklyPractice as Record<string, unknown>
      : {};
    const lessonVocabulary = lessons.rows.flatMap((lesson) => {
      const parts = Array.isArray(lesson.content.parts) ? lesson.content.parts : [];
      const vocabulary = parts.find((part) => part.code === "vocabulary")?.content;
      if (!vocabulary || typeof vocabulary !== "object" || Array.isArray(vocabulary)) return [];
      const items = Array.isArray((vocabulary as { items?: unknown }).items) ? (vocabulary as { items: unknown[] }).items : [];
      return items.flatMap((item) => item && typeof item === "object" && !Array.isArray(item)
        && typeof (item as { word?: unknown }).word === "string"
        ? [(item as { word: string }).word.trim()]
        : []);
    }).filter(Boolean);
    const storedVocabulary = Array.isArray(storedPractice.requiredVocabulary)
      ? storedPractice.requiredVocabulary.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
      : [];
    return {
      lessonSetId: row.lesson_set_id,
      versionId: row.version_id,
      version: row.version,
      status: row.status,
      weekNumber: row.week_number,
      topic: row.topic,
      cefr: row.cefr,
      explanationLanguage: row.cefr === "A1" || row.cefr === "A2" ? "Tiếng Việt" : "English",
      createdBy: row.created_by,
      approvedBy: row.approved_by,
      createdAt: row.created_at.toISOString(),
      publishedAt: row.published_at?.toISOString() ?? null,
      weeklyPractice: {
        task: typeof storedPractice.task === "string" && storedPractice.task.trim() ? storedPractice.task.trim() : generatedPractice.task,
        guidance: typeof storedPractice.guidance === "string" && storedPractice.guidance.trim() ? storedPractice.guidance.trim() : generatedPractice.guidance,
        inputMode: "text_or_dictation",
        requiredVocabulary: [...new Set(storedVocabulary.length ? storedVocabulary : lessonVocabulary)].slice(0, 12)
      },
      generationFindings: generationFindingsFromPayload(row.payload),
      lessons: lessons.rows.map((lesson) => ({
        id: lesson.id,
        dayNumber: lesson.day_number,
        title: normalizeLessonTitle(lesson.title, lesson.content.parts ?? []),
        durationMinutes: lesson.content.durationMinutes ?? 10,
        parts: normalizeLessonParts(lesson.content.parts ?? [], row.cefr),
        practiceLabel: practiceLabel(lesson.content.parts ?? [])
      }))
    };
  }

  async latestLessonSet(staffId: string, weekNumber: number, cefr: CefrLevel): Promise<ContentLessonSetVersionView | null> {
    const result = await this.pool.query<{ id: string }>(
      `select lsv.id from users staff
       join programs p on p.organization_id = staff.organization_id and p.status = 'active'
       join program_weeks pw on pw.program_id = p.id and pw.week_number = $2
       join lesson_sets ls on ls.program_week_id = pw.id and ls.cefr = $3
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id
       where staff.id = $1 and lsv.status <> 'retired'
         and (nullif(trim(lsv.payload->>'topic'), '') is null or trim(lsv.payload->>'topic') = pw.topic)
       order by lsv.version desc limit 1`,
      [staffId, weekNumber, cefr]
    );
    const id = result.rows[0]?.id;
    return id ? this.lessonSetVersion(staffId, id) : null;
  }

  async submitVersionForReview(actorId: string, versionId: string): Promise<ContentLessonSetVersionView | null> {
    const candidate = await this.lessonSetVersion(actorId, versionId);
    if (!candidate) return null;
    if (!validateLessonPublication(candidate.lessons, candidate.weeklyPractice, candidate.cefr).valid
      || !validateGenerationFindingsForPublication(candidate.generationFindings).valid
      || !evaluateGeneratedLessonQuality({
        cefr: candidate.cefr,
        lessons: candidate.lessons,
        ...(candidate.generationFindings ? { findings: candidate.generationFindings } : {})
      }).ready) throw new Error("CONTENT_VALIDATION_FAILED");
    const updated = await this.pool.query<{ id: string }>(
      `update lesson_set_versions lsv set status = 'review'
       from lesson_sets ls, program_weeks pw, programs p, users actor
       where lsv.id = $2 and lsv.status = 'draft' and lsv.created_by = $1
         and ls.id = lsv.lesson_set_id and pw.id = ls.program_week_id and p.id = pw.program_id
         and actor.id = $1 and actor.organization_id = p.organization_id
       returning lsv.id`,
      [actorId, versionId]
    );
    return updated.rows[0] ? this.lessonSetVersion(actorId, versionId) : null;
  }

  async publishVersion(checkerId: string, versionId: string): Promise<ContentLessonSetVersionView> {
    const candidate = await this.lessonSetVersion(checkerId, versionId);
    if (!candidate) throw new Error("CONTENT_VERSION_NOT_FOUND");
    if (!validateLessonPublication(candidate.lessons, candidate.weeklyPractice, candidate.cefr).valid
      || !validateGenerationFindingsForPublication(candidate.generationFindings).valid
      || !evaluateGeneratedLessonQuality({
        cefr: candidate.cefr,
        lessons: candidate.lessons,
        ...(candidate.generationFindings ? { findings: candidate.generationFindings } : {})
      }).ready) throw new Error("CONTENT_VALIDATION_FAILED");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const version = await client.query<{
        lesson_set_id: string;
        created_by: string;
        organization_id: string;
        status: string;
      }>(
        `select lsv.lesson_set_id, lsv.created_by, p.organization_id, lsv.status
         from lesson_set_versions lsv
         join lesson_sets ls on ls.id = lsv.lesson_set_id
         join program_weeks pw on pw.id = ls.program_week_id
         join programs p on p.id = pw.program_id
         join users checker on checker.id = $1 and checker.organization_id = p.organization_id
         where lsv.id = $2 for update of lsv`,
        [checkerId, versionId]
      );
      const row = version.rows[0];
      if (!row) throw new Error("CONTENT_VERSION_NOT_FOUND");
      if (row.status !== "review") throw new Error("CONTENT_NOT_IN_REVIEW");
      await client.query(
        "update lesson_set_versions set status = 'retired' where lesson_set_id = $1 and status = 'published'",
        [row.lesson_set_id]
      );
      await client.query(
        `update lesson_set_versions
         set status = 'published', approved_by = $2, published_at = now()
         where id = $1`,
        [versionId, checkerId]
      );
      await client.query(
        `update lesson_versions lv set status = 'published'
         from lessons l where l.id = lv.lesson_id and l.lesson_set_version_id = $1`,
        [versionId]
      );
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'content.lesson-set.published', 'lesson_set_version', $4, '{}'::jsonb, $5)`,
        [randomUUID(), row.organization_id, checkerId, versionId, randomUUID()]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    const published = await this.lessonSetVersion(checkerId, versionId);
    if (!published) throw new Error("CONTENT_VERSION_NOT_FOUND");
    return published;
  }

  async retireVersion(actorId: string, versionId: string): Promise<ContentLessonSetVersionView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const retired = await client.query<{ organization_id: string }>(
        `update lesson_set_versions lsv set status = 'retired'
         from lesson_sets ls, program_weeks pw, programs p, users actor
         where lsv.id = $2 and lsv.status = 'published'
           and ls.id = lsv.lesson_set_id and pw.id = ls.program_week_id and p.id = pw.program_id
           and actor.id = $1 and actor.organization_id = p.organization_id
         returning p.organization_id`,
        [actorId, versionId]
      );
      const row = retired.rows[0];
      if (!row) throw new Error("CONTENT_NOT_PUBLISHED");
      await client.query(
        `update lesson_versions lv set status = 'retired'
         from lessons l where l.id = lv.lesson_id and l.lesson_set_version_id = $1`,
        [versionId]
      );
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'content.lesson-set.retired', 'lesson_set_version', $4, '{}'::jsonb, $5)`,
        [randomUUID(), row.organization_id, actorId, versionId, randomUUID()]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    const result = await this.lessonSetVersion(actorId, versionId);
    if (!result) throw new Error("CONTENT_VERSION_NOT_FOUND");
    return result;
  }

  async reviewAppeals(staffId: string, query: { id?: string | undefined; status?: "all" | "pending" | "handled" | undefined; offset: number }) {
    const result = await this.pool.query<{ organization_id: string }>("select organization_id from users where id = $1", [staffId]);
    const organizationId = result.rows[0]?.organization_id;
    if (!organizationId) return null;
    const pageSize = 20;
    const appeals = await this.listReviewAppeals(organizationId, query.id
      ? { id: query.id, limit: 1, offset: 0 }
      : { ...(query.status === "all" ? {} : { pending: query.status !== "handled" }), limit: pageSize + 1, offset: query.offset });
    return { appeals: appeals.slice(0, pageSize), hasMore: appeals.length > pageSize };
  }

  private async listReviewAppeals(organizationId: string, filter: { pending?: boolean; id?: string; limit: number; offset: number }): Promise<ContentReviewView["appeals"]> {
    const result = await this.pool.query<{
        id: string; learner_name: string; reason: string; status: "pending" | "accepted" | "rejected";
        resolution: string | null; created_at: Date; kind: "assessment" | "weekly_practice" | "lesson_part";
        submission_id: string | null; current_score: string | null; attempt_id: string | null;
        cefr: CefrLevel | null; week_number: number | null; day_number: number | null; lesson_title: string | null;
        part_code: string | null; attempts: number | null; answer: string | null; ai_feedback: string | null;
        part_content: Record<string, unknown> | null; scope: string | null; has_evidence: boolean; exercise_version_id: string | null; proposed_level: CefrLevel | null;
        lesson_label: string | null;
      }>(`select combined.* from (
            select a.id, u.display_name as learner_name, a.reason, a.status, a.resolution, a.created_at,
                   'assessment'::text as kind, null::uuid as submission_id, null::text as current_score, aa.id as attempt_id,
                   null::text as cefr, null::int as week_number, null::int as day_number, d.title as lesson_title,
                   null::text as part_code, null::int as attempts, null::text as answer, null::text as ai_feedback,
                   null::jsonb as part_content, a.request_scope as scope, a.screenshot is not null as has_evidence, null::uuid as exercise_version_id, a.proposed_level, null::text as lesson_label
            from appeals a join users u on u.id = a.learner_id and u.role = 'learner' and u.status = 'active'
            join assessment_attempts aa on aa.id = a.attempt_id
            join assessment_versions av on av.id = aa.assessment_version_id
            join assessment_definitions d on d.id = av.definition_id
            where u.organization_id = $1 and a.staff_deleted_at is null
            union all
            select pa.id, u.display_name as learner_name, pa.reason, pa.status, pa.resolution, pa.created_at,
                   'weekly_practice'::text as kind, pa.submission_id, ps.score->>'total' as current_score, null::uuid as attempt_id,
                   null::text as cefr, null::int as week_number, null::int as day_number, null::text as lesson_title,
                   null::text as part_code, null::int as attempts, ps.content->>'text' as answer, ps.feedback->>'message' as ai_feedback,
                   jsonb_build_object('prompt', ps.prompt_snapshot->>'task') as part_content, pa.request_scope, pa.screenshot is not null, null::uuid, null::text, null::text
            from practice_appeals pa
            join practice_submissions ps on ps.id = pa.submission_id
            join users u on u.id = pa.learner_id and u.role = 'learner' and u.status = 'active'
            where u.organization_id = $1 and pa.staff_deleted_at is null
            union all
            select lpa.id, u.display_name as learner_name, lpa.reason, lpa.status, lpa.resolution, lpa.created_at,
                   'lesson_part'::text as kind, null::uuid as submission_id, null::text as current_score, null::uuid as attempt_id,
                   ls.cefr::text, pw.week_number, l.day_number, l.title as lesson_title, lpa.part_code,
                   coalesce((pr.evidence->'evidence'->lpa.part_code->>'attempts')::int, latest_attempt.attempt_number, 0) as attempts,
                   coalesce(pr.evidence->'evidence'->lpa.part_code->>'answer', latest_attempt.answer) as answer,
                   coalesce(pr.evidence->'evidence'->lpa.part_code->>'feedback', latest_attempt.feedback) as ai_feedback,
                   lesson_part.part_content, lpa.request_scope, lpa.screenshot is not null, lpa.exercise_version_id, null::text,
                   (select case when mf.curriculum_contract->'daySpecs' @> jsonb_build_array(jsonb_build_object('lessonNumber', ml.lesson_number, 'kind', 'review')) then 'Ôn tập'
                           else 'Bài ' || (select count(*) from jsonb_array_elements(mf.curriculum_contract->'daySpecs') as label_spec(item)
                                            where label_spec.item->>'kind' = 'new' and (label_spec.item->>'lessonNumber')::int <= ml.lesson_number) end
                    from month_lessons ml join month_frameworks mf on mf.id = ml.framework_id where ml.lesson_id = l.id limit 1) as lesson_label
            from lesson_part_appeals lpa
            join users u on u.id = lpa.learner_id and u.role = 'learner' and u.status = 'active'
            join lessons l on l.id = lpa.lesson_id
            join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id
            join lesson_sets ls on ls.id = lsv.lesson_set_id
            left join program_weeks pw on pw.id = ls.program_week_id
            left join progress_records pr on pr.learner_id = lpa.learner_id and pr.lesson_id = lpa.lesson_id
            left join lateral (
              select lpat.attempt_number, lpat.answer, lpat.feedback from lesson_part_attempts lpat
              where lpat.learner_id = lpa.learner_id and lpat.lesson_id = lpa.lesson_id and lpat.part_code = lpa.part_code
              order by lpat.attempt_number desc limit 1
            ) latest_attempt on true
            left join lateral (
              select part->'content' as part_content
              from lesson_versions lv, jsonb_array_elements(lv.content->'parts') part
              where lv.lesson_id = l.id and lv.status = 'published' and part->>'code' = lpa.part_code
                and (lpa.exercise_version_id is null or lpa.exercise_version_id = lv.id)
              order by lv.version desc limit 1
            ) lesson_part on true
            where u.organization_id = $1 and lpa.staff_deleted_at is null
          ) combined
          where ($2::boolean is null or (combined.status = 'pending') = $2)
            and ($3::uuid is null or combined.id = $3)
          order by (combined.status = 'pending') desc, combined.created_at desc, combined.id desc
          limit $4 offset $5`, [organizationId, filter.pending ?? null, filter.id ?? null, filter.limit, filter.offset]);
    const pending = result.rows.filter(row => row.status === "pending");
    const overdue = new Set<string>();
    if (pending.length) {
      const { rows: [calendar] } = await this.pool.query<{ today: string; exam_dates: Record<string, string> | null; holidays: string[] | null }>(
        `select organization_system_date($1)::text as today,
                (select jsonb_object_agg(month, exam_date::text) from program_months where organization_id = $1) as exam_dates,
                (select array_agg(holiday_date::text) from organization_holidays where organization_id = $1) as holidays`, [organizationId]
      );
      const vietnamDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
      const effectiveDatesByMonth = new Map<string, Set<string>>();
      for (const row of pending) {
        const date = new Date(`${vietnamDate.format(row.created_at)}T00:00:00Z`);
        let elapsed = 0;
        for (date.setUTCDate(date.getUTCDate() + 1); elapsed < 2; date.setUTCDate(date.getUTCDate() + 1)) {
          const key = date.toISOString().slice(0, 10);
          if (key >= calendar!.today) break;
          const month = key.slice(0, 7);
          let effectiveDates = effectiveDatesByMonth.get(month);
          if (!effectiveDates) {
            const exam = calendar!.exam_dates?.[month] ?? buildMonthlyCalendar(month).examDate;
            const holidays = new Set(mergedVietnamHolidays(month, (calendar!.holidays ?? []).map(date => ({ date }))).map(holiday => holiday.date));
            effectiveDates = new Set(monthlyLearnerWindow(month, exam, `${month}-01`).effectiveDates.filter(date => !holidays.has(date)));
            effectiveDatesByMonth.set(month, effectiveDates);
          }
          if (effectiveDates.has(key)) elapsed++;
        }
        if (elapsed >= 2) overdue.add(row.id);
      }
    }
    return result.rows.map((row) => ({
        ...(() => {
          const content = row.part_content ?? {};
          const options = lessonExerciseOptions(content);
          return row.kind === "lesson_part" ? {
            cefr: row.cefr, weekNumber: row.week_number, dayNumber: row.day_number, ...(row.lesson_label ? { lessonLabel: row.lesson_label } : {}),
            lessonTitle: row.lesson_title, partCode: row.part_code, attempts: row.attempts, exerciseVersionId: row.exercise_version_id,
            answer: row.answer, aiFeedback: row.ai_feedback,
            question: typeof content.prompt === "string" ? content.prompt : typeof content.task === "string" ? content.task : null,
            options, answerKey: typeof content.answer === "string" ? content.answer : null
          } : row.kind === "assessment" ? { lessonTitle: row.lesson_title, attemptId: row.attempt_id } : {
            answer: row.answer, aiFeedback: row.ai_feedback,
            question: typeof content.prompt === "string" ? content.prompt : null
          };
        })(),
        id: row.id, learnerName: row.learner_name, reason: row.reason, status: row.status,
        ...(overdue.has(row.id) ? { overdue: true } : {}),
        ...(row.proposed_level ? { proposedLevel: row.proposed_level } : {}),
        scope: row.scope, hasEvidence: row.has_evidence,
        createdAt: row.created_at.toISOString(), resolution: row.resolution ?? "", kind: row.kind,
        submissionId: row.submission_id, currentScore: row.current_score === null ? null : Number(row.current_score)
    }));
  }

  async reviewOverview(staffId: string): Promise<ContentReviewView | null> {
    const organization = await this.pool.query<{ organization_id: string }>(
      "select organization_id from users where id = $1", [staffId]
    );
    const organizationId = organization.rows[0]?.organization_id;
    if (!organizationId) return null;
    const counts = await this.pool.query<{
      submissions: string; coach: string; micro: string; appeals: string; attempts: string; assessments: string;
    }>(
      `select
        (select count(*) from practice_submissions ps join users u on u.id = ps.learner_id and u.role = 'learner' and u.status = 'active' where u.organization_id = $1 and ps.status in ('submitted', 'reviewed'))::text as submissions,
        (select count(*) from coach_turns ct join coach_sessions cs on cs.id = ct.session_id join users u on u.id = cs.learner_id and u.role = 'learner' and u.status = 'active' where u.organization_id = $1 and ct.speaker = 'learner')::text as coach,
        (select count(*) from micro_lessons ml join users u on u.id = ml.learner_id and u.role = 'learner' and u.status = 'active' where u.organization_id = $1)::text as micro,
        ((select count(*) from appeals a join assessment_attempts aa on aa.id = a.attempt_id join users u on u.id = aa.learner_id and u.role = 'learner' and u.status = 'active' where u.organization_id = $1)
          + (select count(*) from practice_appeals pa join users u on u.id = pa.learner_id and u.role = 'learner' and u.status = 'active' where u.organization_id = $1)
          + (select count(*) from lesson_part_appeals lpa join users u on u.id = lpa.learner_id and u.role = 'learner' and u.status = 'active' where u.organization_id = $1))::text as appeals,
        (select count(*) from assessment_attempts aa join users u on u.id = aa.learner_id and u.role = 'learner' and u.status = 'active' join assessment_versions av on av.id = aa.assessment_version_id join assessment_definitions ad on ad.id = av.definition_id where u.organization_id = $1 and ad.kind in ('placement', 'level_up', 'final', 'pass_course'))::text as attempts,
        (select count(*) from assessment_versions av join assessment_definitions ad on ad.id = av.definition_id where ad.organization_id = $1 and ad.kind in ('placement', 'level_up', 'final', 'pass_course'))::text as assessments`,
      [organizationId]
    );
    const count = counts.rows[0] ?? { submissions: "0", coach: "0", micro: "0", appeals: "0", attempts: "0", assessments: "0" };
    const coach = await this.pool.query<{
      id: string; learner_name: string; cefr: CefrLevel | null; week_number: number | null;
      created_at: Date; content: Record<string, unknown>; feedback: Record<string, unknown> | null;
    }>(
      `select ct.id, u.display_name as learner_name, e.cefr, pw.week_number,
              ct.created_at, ct.content, ct.feedback
       from coach_turns ct
       join coach_sessions cs on cs.id = ct.session_id
       join users u on u.id = cs.learner_id and u.organization_id = $1 and u.role = 'learner' and u.status = 'active'
       left join enrollments e on e.learner_id = u.id
       left join programs p on p.id = e.program_id
       left join program_weeks pw on pw.program_id = p.id
         and pw.week_number = greatest(1, least(p.week_count, ((ct.created_at::date - p.start_date) / 7) + 1))
       where ct.speaker = 'learner'
       order by ct.created_at desc limit 40`,
      [organizationId]
    );
    const [submissions, micros, appeals, progress, assessments, weeklySets, exerciseWarnings] = await Promise.all([
      this.pool.query<{
        id: string; learner_name: string; cefr: CefrLevel | null; week_number: number; submitted_at: Date;
        operator_checked: boolean; content: Record<string, unknown>; prompt_snapshot: Record<string, unknown>;
        vocabulary_snapshot: unknown; score: Record<string, unknown> | null; topic: string;
        feedback: Record<string, unknown> | null;
      }>(`select ps.id, u.display_name as learner_name, e.cefr, pw.week_number, ps.submitted_at,
                 ps.operator_checked, ps.content, ps.prompt_snapshot, ps.vocabulary_snapshot, ps.score, ps.feedback, pw.topic
          from practice_submissions ps join users u on u.id = ps.learner_id and u.role = 'learner' and u.status = 'active'
          join program_weeks pw on pw.id = ps.program_week_id
          left join enrollments e on e.learner_id = u.id and e.program_id = pw.program_id
          where u.organization_id = $1 and ps.status in ('submitted', 'reviewed')
          order by ps.submitted_at desc limit 60`, [organizationId]),
      this.pool.query<{
        id: string; learner_name: string; cefr: CefrLevel; topic: string; generated_at: Date;
        completed_at: Date | null; content: Record<string, unknown>; progress: Record<string, unknown>;
      }>(`select ml.id, u.display_name as learner_name, ml.cefr, ml.topic, ml.generated_at,
                 ml.completed_at, ml.content, ml.progress
          from micro_lessons ml join users u on u.id = ml.learner_id and u.role = 'learner' and u.status = 'active'
          where u.organization_id = $1 order by ml.generated_at desc limit 60`, [organizationId]),
      this.listReviewAppeals(organizationId, { limit: 60, offset: 0 }),
      this.pool.query<{
        id: string; learner_id: string; learner_name: string; cefr: CefrLevel | null; week_number: number; day_number: number;
        title: string; evidence: Record<string, unknown>;
      }>(`select pr.id, u.id as learner_id, u.display_name as learner_name, e.cefr, pw.week_number, l.day_number,
                 l.title, pr.evidence
          from progress_records pr join users u on u.id = pr.learner_id and u.role = 'learner' and u.status = 'active'
          join lessons l on l.id = pr.lesson_id
          join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id
          join lesson_sets ls on ls.id = lsv.lesson_set_id
          join program_weeks pw on pw.id = ls.program_week_id
          left join enrollments e on e.learner_id = u.id and e.program_id = pw.program_id
          where u.organization_id = $1 and pr.evidence <> '{}'::jsonb order by pr.updated_at desc limit 100`, [organizationId]),
      this.pool.query<{
        id: string; learner_name: string; kind: "placement" | "level_up" | "final" | "pass_course"; title: string;
        status: string; submitted_at: Date | null; total_score: string | null;
      }>(`select aa.id, u.display_name as learner_name, ad.kind, ad.title, aa.status, aa.submitted_at,
                 sum(sc.score)::text as total_score
          from assessment_attempts aa join users u on u.id = aa.learner_id and u.role = 'learner' and u.status = 'active'
          join assessment_versions av on av.id = aa.assessment_version_id
          join assessment_definitions ad on ad.id = av.definition_id
          left join assessment_scores sc on sc.attempt_id = aa.id
          where u.organization_id = $1 and ad.kind in ('placement', 'level_up', 'final', 'pass_course')
          group by aa.id, u.display_name, ad.kind, ad.title order by aa.started_at desc limit 100`, [organizationId]),
      this.pool.query<{ id: string }>(
        `select distinct on (ls.id) lsv.id
         from programs p
         join program_weeks pw on pw.program_id = p.id
         join lesson_sets ls on ls.program_week_id = pw.id
         join lesson_set_versions lsv on lsv.lesson_set_id = ls.id
         where p.organization_id = $1 and p.status = 'active'
           and lsv.status in ('draft', 'review', 'published')
         order by ls.id, lsv.version desc`, [organizationId]
      ),
      this.exerciseWarnings(organizationId)
    ]);
    const weeklyPracticeSets = (await Promise.all(weeklySets.rows.map((row) => this.lessonSetVersion(staffId, row.id))))
      .filter((item): item is ContentLessonSetVersionView => item !== null);
    return {
      tabs: [
        { key: "submissions", label: "Bài nộp", count: Number(count.submissions), unreadCount: submissions.rows.filter((row) => !row.operator_checked).length },
        { key: "coach", label: "Phản hồi coach", count: Number(count.coach) },
        { key: "weekly_practices", label: "Bài cuối tuần", count: weeklyPracticeSets.length },
        { key: "micro", label: "Bài siêu ngắn", count: Number(count.micro) },
        { key: "appeals", label: "Kháng nghị", count: Number(count.appeals) },
        { key: "attempts", label: "Cảnh báo bài tập", count: exerciseWarnings.length },
        { key: "assessments", label: "Bài test", count: Number(count.assessments) }
      ],
      weeklyPractices: weeklyPracticeSets.map((item) => ({
        versionId: item.versionId,
        weekNumber: item.weekNumber,
        cefr: item.cefr,
        topic: item.topic,
        status: item.status,
        version: item.version,
        task: item.weeklyPractice?.task ?? "",
        guidance: item.weeklyPractice?.guidance ?? "",
        requiredVocabulary: item.weeklyPractice?.requiredVocabulary ?? []
      })),
      coachSamples: coach.rows.map((row) => {
        const feedback = row.feedback ?? {};
        const rubric = feedback.rubric && typeof feedback.rubric === "object" ? feedback.rubric as Record<string, unknown> : {};
        const audioArtifact = audioArtifactFromContent(row.content);
        return {
          id: row.id,
          learnerName: row.learner_name,
          cefr: row.cefr,
          weekNumber: row.week_number,
          createdAt: row.created_at.toISOString(),
          checked: Boolean(feedback.checked),
          learnerText: typeof row.content.text === "string" ? row.content.text : "",
          coachText: typeof feedback.coachText === "string" ? feedback.coachText : "",
          scores: {
            meaning: rubricScoreOrNull(rubric.meaning),
            vocabulary: rubricScoreOrNull(rubric.vocabulary),
            grammar: rubricScoreOrNull(rubric.grammar)
          },
          suggestions: (Array.isArray(feedback.corrections) ? feedback.corrections : Array.isArray(feedback.suggestions) ? feedback.suggestions : [])
            .flatMap((value) => {
                if (typeof value === "string") return [value];
                if (!value || typeof value !== "object" || Array.isArray(value)) return [];
                const suggestion = value as Record<string, unknown>;
                if (typeof suggestion.original !== "string" || typeof suggestion.corrected !== "string") return [];
                const reason = typeof suggestion.reason === "string" ? suggestion.reason : typeof suggestion.explanation === "string" ? suggestion.explanation : "";
                const explanation = reason ? ` — ${reason}` : "";
                return [`${suggestion.original} → ${suggestion.corrected}${explanation}`];
              }),
          ...(audioArtifact ? { audioArtifact } : {})
        };
      }),
      submissions: submissions.rows.map((row) => {
        const rubric = row.score?.rubric && typeof row.score.rubric === "object" ? row.score.rubric as Record<string, unknown> : {};
        const suggestions = Array.isArray(row.feedback?.suggestions) ? row.feedback.suggestions : [];
        const generated = weeklyPracticeTask(row.topic, row.cefr ?? "A1");
        const prompt = row.prompt_snapshot && typeof row.prompt_snapshot === "object" ? row.prompt_snapshot : {};
        const requiredVocabulary = Array.isArray(prompt.requiredVocabulary)
          ? prompt.requiredVocabulary.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
          : Array.isArray(row.vocabulary_snapshot)
            ? row.vocabulary_snapshot.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
            : [];
        const audioArtifact = audioArtifactFromContent(row.content);
        return {
          id: row.id, learnerName: row.learner_name, cefr: row.cefr, weekNumber: row.week_number,
          submittedAt: row.submitted_at.toISOString(), checked: row.operator_checked,
          type: row.content.inputMode === "dialogue" || row.content.type === "dialogue" ? "dialogue" : "writing",
          task: typeof prompt.task === "string" && prompt.task.trim() ? prompt.task : generated.task,
          guidance: typeof prompt.guidance === "string" && prompt.guidance.trim() ? prompt.guidance : generated.guidance,
          requiredVocabulary,
          text: typeof row.content.text === "string" ? row.content.text : "",
          total: numberOrNull(row.score?.total),
          rubric: { meaning: numberOrNull(rubric.meaning), vocabulary: numberOrNull(rubric.vocabulary), grammar: numberOrNull(rubric.grammar) },
          feedback: typeof row.feedback?.message === "string" ? row.feedback.message : "",
          aiGraded: row.feedback?.source === "ai",
          suggestions: suggestions.flatMap((item) => item && typeof item === "object" && !Array.isArray(item)
            ? [`${String((item as Record<string, unknown>).original ?? "")} → ${String((item as Record<string, unknown>).corrected ?? "")}`] : []),
          ...(audioArtifact ? { audioArtifact } : {})
        };
      }),
      microLessons: micros.rows.map((row) => {
        const vocabulary = Array.isArray(row.content.vocabulary) ? row.content.vocabulary.map(String) : [];
        const practice = row.content.practice && typeof row.content.practice === "object" ? row.content.practice as Record<string, unknown> : {};
        const attempt = row.progress.attempt && typeof row.progress.attempt === "object" ? row.progress.attempt as Record<string, unknown> : {};
        return {
          id: row.id, learnerName: row.learner_name, cefr: row.cefr, topic: row.topic,
          generatedAt: row.generated_at.toISOString(), completed: Boolean(row.completed_at),
          theory: typeof row.content.theory === "string" ? row.content.theory : "",
          vocabulary, practice: typeof practice.prompt === "string" ? practice.prompt : "",
          answer: typeof attempt.answer === "string" ? attempt.answer : null
        };
      }),
      appeals,
      exerciseWarnings,
      lessonAttempts: progress.rows.map((row) => {
        const source = row.evidence.evidence && typeof row.evidence.evidence === "object"
          ? row.evidence.evidence as Record<string, unknown> : row.evidence;
        const attempts: Partial<Record<"listening" | "reading" | "writing" | "word_class" | "word_use" | "speaking", number>> = {};
        for (const code of ["listening", "reading", "writing", "word_class", "word_use", "speaking"] as const) {
          const value = source[code];
          if (value && typeof value === "object" && !Array.isArray(value)) {
            const count = Number((value as Record<string, unknown>).attempts);
            if (Number.isFinite(count) && count > 0) attempts[code] = count;
          }
        }
        const speaking = source.speaking;
        const speakingArtifactKey = speaking && typeof speaking === "object" && !Array.isArray(speaking)
          && typeof (speaking as Record<string, unknown>).artifactKey === "string"
          ? (speaking as Record<string, unknown>).artifactKey as string
          : undefined;
        return { id: row.id, learnerId: row.learner_id, learnerName: row.learner_name, cefr: row.cefr, weekNumber: row.week_number,
          dayNumber: row.day_number, lessonTitle: row.title, attempts, ...(speakingArtifactKey ? { speakingArtifactKey } : {}) };
      }),
      assessments: assessments.rows.map((row) => ({
        id: row.id, learnerName: row.learner_name, kind: row.kind, title: row.title, status: row.status,
        submittedAt: row.submitted_at?.toISOString() ?? null,
        totalScore: row.total_score === null ? null : Number(row.total_score)
      }))
    };
  }

  async setReviewChecked(actorId: string, kind: "submission" | "coach", id: string, checked: boolean): Promise<boolean> {
    if (kind === "submission") {
      const result = await this.pool.query(
        `update practice_submissions ps set operator_checked = $3, checked_by = case when $3 then $1::uuid else null end
         from users learner, users actor where ps.id = $2 and learner.id = ps.learner_id
           and actor.id = $1 and actor.organization_id = learner.organization_id`, [actorId, id, checked]
      );
      return Boolean(result.rowCount);
    }
    const result = await this.pool.query(
      `update coach_turns ct set feedback = coalesce(ct.feedback, '{}'::jsonb) || jsonb_build_object('checked', $3, 'checkedBy', case when $3 then $1::text else '' end)
       from coach_sessions cs, users learner, users actor where ct.id = $2 and cs.id = ct.session_id
         and learner.id = cs.learner_id and actor.id = $1 and actor.organization_id = learner.organization_id`,
      [actorId, id, checked]
    );
    return Boolean(result.rowCount);
  }

  async deleteMicroLesson(actorId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      `delete from micro_lessons ml using users learner, users actor
       where ml.id = $2 and learner.id = ml.learner_id and actor.id = $1
         and actor.organization_id = learner.organization_id`, [actorId, id]
    );
    return Boolean(result.rowCount);
  }

  async gradePracticeSubmission(actorId: string, id: string, input: {
    meaning: number; vocabulary: number; grammar: number; feedback: string;
  }): Promise<boolean> {
    const total = Math.round((input.meaning * 0.4 + input.vocabulary * 0.3 + input.grammar * 0.3) * 20);
    const result = await this.pool.query(
      `update practice_submissions ps set status = 'reviewed',
         score = jsonb_build_object('total', $3::numeric, 'rubric', jsonb_build_object('meaning', $4::numeric, 'vocabulary', $5::numeric, 'grammar', $6::numeric)),
         feedback = jsonb_build_object('message', $7::text, 'source', 'human'), operator_checked = true,
         checked_by = $1, reviewed_at = now(), updated_at = now()
       from users learner, users actor where ps.id = $2 and learner.id = ps.learner_id
         and actor.id = $1 and actor.organization_id = learner.organization_id`,
      [actorId, id, total, input.meaning, input.vocabulary, input.grammar, input.feedback]
    );
    return Boolean(result.rowCount);
  }

  /** Load only the persisted fields an Operator may submit to the grading task. */
  async reviewSubmissionForAi(staffId: string, id: string): Promise<{
    id: string;
    learnerId: string;
    organizationId: string;
    cefr: CefrLevel;
    topic: string;
    text: string;
  } | null> {
    const result = await this.pool.query<{
      id: string; learner_id: string; organization_id: string; cefr: CefrLevel; topic: string; content: Record<string, unknown>;
    }>(
      `select ps.id, ps.learner_id, learner.organization_id, e.cefr, pw.topic, ps.content
       from practice_submissions ps
       join users learner on learner.id = ps.learner_id
       join users staff on staff.id = $1 and staff.organization_id = learner.organization_id
       join program_weeks pw on pw.id = ps.program_week_id
       left join enrollments e on e.learner_id = learner.id and e.program_id = pw.program_id
       where ps.id = $2
       order by e.enrolled_at desc nulls last
       limit 1`,
      [staffId, id]
    );
    const row = result.rows[0];
    if (!row || !row.cefr) return null;
    return {
      id: row.id,
      learnerId: row.learner_id,
      organizationId: row.organization_id,
      cefr: row.cefr,
      topic: row.topic,
      text: typeof row.content?.text === "string" ? row.content.text : ""
    };
  }

  async beginReviewAiGrade(staffId: string, submissionId: string, requestId: string): Promise<{
    job: ContentReviewAiGradeJobView;
    input: { id: string; learnerId: string; cefr: CefrLevel; topic: string; text: string } | null;
    started: boolean;
  } | null> {
    const source = await this.reviewSubmissionForAi(staffId, submissionId);
    if (!source) return null;
    const idempotencyKey = `content-review-ai-grade:${submissionId}:${requestId}`;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const inserted = await client.query<{ id: string; created_at: Date }>(
        `insert into jobs (id, kind, payload, max_attempts, idempotency_key)
         values ($1, 'content.review.ai-grade', $2::jsonb, 1, $3)
         on conflict (idempotency_key) do nothing
         returning id, created_at`,
        [randomUUID(), JSON.stringify({ submissionId, learnerId: source.learnerId, organizationId: source.organizationId, requestId }), idempotencyKey]
      );
      const row = await client.query<{
        id: string; state: "queued" | "running" | "succeeded" | "failed" | "dead"; payload: Record<string, unknown>; last_error: string | null; created_at: Date; updated_at: Date;
      }>(
        `select id, state, payload, last_error, created_at, updated_at from jobs where idempotency_key = $1 for update`,
        [idempotencyKey]
      );
      const job = row.rows[0];
      if (!job) { await client.query("rollback"); return null; }
      await client.query("commit");
      return {
        job: reviewAiGradeJobView(job),
        input: inserted.rowCount ? { id: source.id, learnerId: source.learnerId, cefr: source.cefr, topic: source.topic, text: source.text } : null,
        started: Boolean(inserted.rowCount)
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async completeReviewAiGrade(input: {
    staffId: string;
    submissionId: string;
    requestId: string;
    output: { score: { total: number; rubric: { meaning: number; vocabulary: number; grammar: number } }; feedback: string; suggestions: Array<{ original: string; corrected: string; explanation: string }>; correctedText: string };
    taskId: string;
    promptVersionId: string;
    metadata: AiRunMetadataInput;
  }): Promise<ContentReviewAiGradeJobView | null> {
    const idempotencyKey = `content-review-ai-grade:${input.submissionId}:${input.requestId}`;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const jobResult = await client.query<{ id: string; state: string; payload: Record<string, unknown>; created_at: Date; updated_at: Date }>(
        `select j.id, j.state, j.payload, j.created_at, j.updated_at
         from jobs j join users staff on staff.id = $1
         where j.idempotency_key = $2 and (j.payload->>'organizationId')::uuid = staff.organization_id
         for update`,
        [input.staffId, idempotencyKey]
      );
      const job = jobResult.rows[0];
      if (!job) { await client.query("rollback"); return null; }
      if (job.state === "succeeded") { await client.query("commit"); return reviewAiGradeJobView(job); }
      const learner = await client.query<{ learner_id: string }>(
        `select ps.learner_id from practice_submissions ps join users staff on staff.id = $1
         join users learner on learner.id = ps.learner_id and learner.organization_id = staff.organization_id
         where ps.id = $2`, [input.staffId, input.submissionId]
      );
      const learnerId = learner.rows[0]?.learner_id;
      if (!learnerId) { await client.query("rollback"); return null; }
      const runId = randomUUID();
      await insertAiRun(client, {
        id: runId,
        learnerId,
        requestId: input.requestId,
        taskId: input.taskId,
        promptVersionId: input.promptVersionId,
        output: input.output,
        metadata: input.metadata
      });
      await client.query(
        `update practice_submissions ps set status = 'reviewed',
           score = $3::jsonb, feedback = $4::jsonb, operator_checked = true,
           checked_by = $1, reviewed_at = now(), updated_at = now()
         from users staff, users learner
         where ps.id = $2 and staff.id = $1 and learner.id = ps.learner_id
           and learner.organization_id = staff.organization_id`,
        [input.staffId, input.submissionId, JSON.stringify(input.output.score), JSON.stringify({
          message: input.output.feedback, suggestions: input.output.suggestions,
          correctedText: input.output.correctedText, source: "ai", aiRunId: runId
        })]
      );
      const payload = { ...job.payload, result: input.output };
      const updated = await client.query<{ id: string; state: "succeeded"; payload: Record<string, unknown>; created_at: Date; updated_at: Date }>(
        `update jobs set state = 'succeeded', payload = $2::jsonb, updated_at = now()
         where id = $1 returning id, state, payload, created_at, updated_at`,
        [job.id, JSON.stringify(payload)]
      );
      await client.query("commit");
      return updated.rows[0] ? reviewAiGradeJobView(updated.rows[0]) : null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async failReviewAiGrade(staffId: string, submissionId: string, requestId: string, errorCode: string): Promise<ContentReviewAiGradeJobView | null> {
    const idempotencyKey = `content-review-ai-grade:${submissionId}:${requestId}`;
    const result = await this.pool.query<{ id: string; state: "failed"; payload: Record<string, unknown>; created_at: Date; updated_at: Date }>(
      `update jobs j set state = 'failed', last_error = $3, updated_at = now()
       from users staff
       where j.idempotency_key = $2 and staff.id = $1
         and (j.payload->>'organizationId')::uuid = staff.organization_id
       returning j.id, j.state, j.payload, j.created_at, j.updated_at`,
      [staffId, idempotencyKey, errorCode]
    );
    const row = result.rows[0];
    return row ? { ...reviewAiGradeJobView(row), errorCode } : null;
  }

  async resolveAppeal(
    actorId: string, id: string, status: "accepted" | "rejected", resolution: string, newScore?: number,
    exerciseCorrection?: LessonExerciseCorrectionInput
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const lessonPart = await client.query<{ organization_id: string; status: string; lesson_id: string; part_code: LessonPartCode; exercise_version_id: string | null }>(
        `select learner.organization_id, lpa.status, lpa.lesson_id, lpa.part_code, lpa.exercise_version_id
         from lesson_part_appeals lpa
         join users learner on learner.id = lpa.learner_id
         join users actor on actor.id = $1 and actor.organization_id = learner.organization_id and actor.role = 'operator' and actor.status = 'active'
         where lpa.id = $2 for update of lpa`,
        [actorId, id]
      );
      const lessonPartAppeal = lessonPart.rows[0];
      if (lessonPartAppeal) {
        if (lessonPartAppeal.status !== "pending") {
          await client.query("rollback");
          return false;
        }
        const regraded = status === "accepted" && lessonPartAppeal.exercise_version_id
          ? await this.correctLessonExercise(client, lessonPartAppeal.lesson_id, lessonPartAppeal.part_code, lessonPartAppeal.exercise_version_id, exerciseCorrection)
          : null;
        await client.query(
          `update lesson_part_appeals
           set status = $2, resolution = $3, resolved_by = $4, resolved_at = now()
           where id = $1`,
          [id, status, resolution, actorId]
        );
        await client.query(
          `insert into audit_events
             (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
           values ($1, $2, $3, 'lesson-part.appeal.resolved', 'lesson_part_appeal', $4, $5::jsonb, $6)`,
          [randomUUID(), lessonPartAppeal.organization_id, actorId, id, JSON.stringify({ status, resolution, ...(regraded ? { regraded } : {}) }), randomUUID()]
        );
        await client.query("commit");
        return true;
      }
      const practice = await client.query<{ submission_id: string; organization_id: string; status: string }>(
        `select pa.submission_id, learner.organization_id, pa.status
         from practice_appeals pa
         join users learner on learner.id = pa.learner_id
         join users actor on actor.id = $1 and actor.organization_id = learner.organization_id
         where pa.id = $2 for update of pa`,
        [actorId, id]
      );
      const practiceAppeal = practice.rows[0];
      if (practiceAppeal) {
        if (practiceAppeal.status !== "pending") {
          await client.query("rollback");
          return false;
        }
        if (status === "accepted" && newScore === undefined) throw new Error("PRACTICE_APPEAL_SCORE_REQUIRED");
        await client.query(
          `update practice_appeals
           set status = $2, resolution = $3, resolved_by = $4, resolved_at = now()
           where id = $1`,
          [id, status, resolution, actorId]
        );
        if (status === "accepted") {
          await client.query(
            `update practice_submissions
             set status = 'reviewed',
                 score = jsonb_set(coalesce(score, '{}'::jsonb), '{total}', to_jsonb($2::numeric), true),
                 feedback = coalesce(feedback, '{}'::jsonb) || jsonb_build_object(
                   'source', 'appeal-human', 'message', $3::text, 'appealId', $4::text
                 ),
                 operator_checked = true, checked_by = $5, reviewed_at = now(), updated_at = now()
             where id = $1`,
            [practiceAppeal.submission_id, newScore, resolution, id, actorId]
          );
        }
        await client.query(
          `insert into audit_events
             (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
           values ($1, $2, $3, 'weekly-practice.appeal.resolved', 'practice_appeal', $4, $5::jsonb, $6)`,
          [randomUUID(), practiceAppeal.organization_id, actorId, id,
            JSON.stringify({ status, resolution, newScore: status === "accepted" ? newScore : null,
              submissionId: practiceAppeal.submission_id }), randomUUID()]
        );
        await client.query("commit");
        return true;
      }
      const assessment = await client.query(
        `update appeals a set status = $3, resolution = $4, resolved_by = $1, resolved_at = now()
         from users learner, users actor where a.id = $2 and a.status = 'pending'
           and learner.id = a.learner_id and actor.id = $1 and actor.organization_id = learner.organization_id`,
        [actorId, id, status, resolution]
      );
      if (assessment.rowCount && status === "accepted") await new AssessmentRepository(this.pool).applyAcceptedAppealLevel(client, actorId, id, resolution);
      await client.query("commit");
      return Boolean(assessment.rowCount);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  private async correctLessonExercise(
    client: PoolClient, lessonId: string, partCode: LessonPartCode, exerciseVersionId: string,
    correction?: LessonExerciseCorrectionInput
  ): Promise<{ versionId: string; learners: number }> {
    if (!correction) throw new Error("LESSON_EXERCISE_CORRECTION_REQUIRED");
    // The lesson ID and part code identify the question across corrected versions.
    // Keep the lesson ID so previously completed days and answer history still resolve.
    await client.query("select id from lessons where id = $1 for update", [lessonId]);
    const versions = await client.query<{ id: string; version: number; content: LessonContent }>(
      `select id, version, content from lesson_versions where lesson_id = $1 and status = 'published'
       and (id = $2 or version = (select max(version) from lesson_versions where lesson_id = $1 and status = 'published'))
       order by version desc`, [lessonId, exerciseVersionId]
    );
    const latest = versions.rows[0];
    const original = versions.rows.find(row => row.id === exerciseVersionId)?.content.parts.find(part => part.code === partCode);
    const part = latest?.content.parts.find(part => part.code === partCode);
    if (!latest || !part || !original) throw new Error("LESSON_EXERCISE_CHANGED");
    const promptKey = typeof part.content.prompt !== "string" && typeof part.content.task === "string" ? "task" : "prompt";
    const answer = correction.correctAnswer?.trim();
    const options = lessonExerciseOptions(part.content);
    if (answer && options.length && !options.some(option => normalizeLessonAnswer(option) === normalizeLessonAnswer(answer))) {
      throw new Error("LESSON_EXERCISE_ANSWER_NOT_AN_OPTION");
    }
    const desired = {
      ...part.content, [promptKey]: correction.prompt.trim(),
      ...(answer ? { answer: options.find(option => normalizeLessonAnswer(option) === normalizeLessonAnswer(answer)) ?? answer } : {})
    };
    if (JSON.stringify(part.content) === JSON.stringify(desired)) {
      if (JSON.stringify(part.content) === JSON.stringify(original.content)) throw new Error("LESSON_EXERCISE_CORRECTION_REQUIRED");
      // A separate appeal for the same question can accept the already-applied correction.
      return { versionId: latest.id, learners: 0 };
    }
    if (JSON.stringify(part.content) !== JSON.stringify(original.content)) throw new Error("LESSON_EXERCISE_CHANGED");
    const versionId = randomUUID();
    const content = { ...latest.content, parts: latest.content.parts.map(item => item.code === partCode ? { ...item, content: desired } : item) };
    await client.query(
      `insert into lesson_versions (id, lesson_id, version, status, content)
       select $1, $2, coalesce(max(version), 0) + 1, 'published', $3::jsonb from lesson_versions where lesson_id = $2`,
      [versionId, lessonId, JSON.stringify(content)]
    );
    const attempts = await client.query<{ id: string; learner_id: string; attempt_number: number; answer: string | null; artifact_key: string | null }>(
      `select id, learner_id, attempt_number, answer, artifact_key from lesson_part_attempts
       where lesson_id = $1 and part_code = $2 and grading is null order by learner_id, attempt_number, created_at for update`,
      [lessonId, partCode]
    );
    const learners = new Map<string, { evidence: PartEvidence; rewardId: string | null; points: number }>();
    for (const attempt of attempts.rows) {
      const graded = gradeLessonPart(partCode, desired, {
        ...(attempt.answer === null ? {} : { answer: attempt.answer }),
        ...(attempt.artifact_key === null ? {} : { artifactKey: attempt.artifact_key })
      }, attempt.attempt_number);
      await client.query("update lesson_part_attempts set status = $2, score = $3, feedback = $4 where id = $1", [attempt.id, graded.status, graded.score, graded.feedback]);
      const current = learners.get(attempt.learner_id);
      const evidence = current?.rewardId ? current.evidence : mapPartEvidence({ ...attempt, ...graded, score: String(graded.score) });
      learners.set(attempt.learner_id, {
        evidence: {
          ...evidence, attempts: attempt.attempt_number,
          firstTryCorrect: current?.evidence.firstTryCorrect ?? (attempt.attempt_number === 1 && graded.status === "correct")
        },
        rewardId: current?.rewardId ?? (graded.status === "correct" ? attempt.id : null),
        points: current?.rewardId ? current.points : graded.status === "correct" ? Math.max(1, 6 - attempt.attempt_number) : 0
      });
    }
    for (const [learnerId, { evidence, rewardId, points }] of learners) {
      const complete = ["correct", "wrong_exhausted"].includes(evidence.status ?? "")
        || (evidence.status === "submitted" && ((partCode === "writing" && Boolean(evidence.answer)) || (partCode === "speaking" && Boolean(evidence.artifactKey))));
      await client.query(
        `update progress_records set evidence = evidence || jsonb_build_object(
           'evidence', coalesce(evidence->'evidence', '{}'::jsonb) || jsonb_build_object($3::text, coalesce(evidence->'evidence'->$3::text, '{}'::jsonb) || $4::jsonb),
           'completedPartCodes', (coalesce(evidence->'completedPartCodes', '[]'::jsonb) - $3::text)
              || case when $5 then jsonb_build_array($3::text) else '[]'::jsonb end
         ), updated_at = now() where learner_id = $1 and lesson_id = $2`,
        [learnerId, lessonId, partCode, JSON.stringify(evidence), complete]
      );
      await client.query(
        `update reward_events r set points = case when r.source_id = $4::uuid then $5 else 0 end
         from lesson_part_attempts a where r.learner_id = $1 and r.source_type = 'lesson_part' and r.source_id = a.id
           and a.lesson_id = $2 and a.part_code = $3`,
        [learnerId, lessonId, partCode, rewardId, points]
      );
      if (rewardId) await client.query(
        `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
         values ($1, $2, null, $3, 'lesson_part', $4) on conflict do nothing`, [randomUUID(), learnerId, points, rewardId]
      );
    }
    return { versionId, learners: learners.size };
  }

  async promptSettings(staffId: string): Promise<Omit<ContentPromptSettingsView["groups"][number], "label">[]> {
    await ensurePrototypePromptsForUser(this.pool, staffId);
    const organization = await this.pool.query<{ organization_id: string }>(
      "select organization_id from users where id = $1", [staffId]
    );
    const organizationId = organization.rows[0]?.organization_id;
    if (!organizationId) return [];
    const result = await this.pool.query<{
      task_key: ContentPromptKey; version: number; content: string; status: "draft" | "active" | "retired"; default_content: string;
    }>(
      `select distinct on (latest.task_key) latest.task_key, latest.version, latest.content, latest.status,
              coalesce((select active.content from prompt_versions active
                        where active.organization_id = latest.organization_id
                          and active.task_key = latest.task_key
                          and active.status = 'active'
                        order by active.version desc limit 1),
                       first_value(latest.content) over (partition by latest.task_key order by latest.version)) as default_content
       from prompt_versions latest
       where latest.organization_id = $1
       order by latest.task_key, latest.version desc`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      key: row.task_key,
      content: row.content,
      defaultContent: row.default_content,
      version: row.version,
      status: row.status
    }));
  }

  async savePromptDrafts(
    actorId: string,
    groups: readonly { key: ContentPromptKey; content: string }[]
  ): Promise<Omit<ContentPromptSettingsView["groups"][number], "label">[]> {
    const client = await this.pool.connect();
    const saved: Omit<ContentPromptSettingsView["groups"][number], "label">[] = [];
    await ensurePrototypePromptsForUser(this.pool, actorId, groups.map((group) => group.key));
    try {
      await client.query("begin");
      const actor = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1", [actorId]
      );
      const organizationId = actor.rows[0]?.organization_id;
      if (!organizationId) throw new Error("CONTENT_ACTOR_NOT_FOUND");
      for (const group of groups) {
        const next = await client.query<{ version: number; default_content: string }>(
          `select coalesce(max(version), 0) + 1 as version,
                  coalesce((array_agg(content order by status = 'active' desc, version desc))[1], '') as default_content
           from prompt_versions where organization_id = $1 and task_key = $2`,
          [organizationId, group.key]
        );
        const version = next.rows[0]?.version ?? 1;
        await client.query(
          `insert into prompt_versions
             (id, organization_id, task_key, version, content, status, created_by)
           values ($1, $2, $3, $4, $5, 'draft', $6)`,
          [randomUUID(), organizationId, group.key, version, group.content, actorId]
        );
        saved.push({
          key: group.key,
          content: group.content,
          defaultContent: next.rows[0]?.default_content ?? "",
          version,
          status: "draft"
        });
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    return saved;
  }

  async publishPromptDraft(
    actorId: string,
    key: ContentPromptKey,
    version: number
  ): Promise<Omit<ContentPromptSettingsView["groups"][number], "label"> | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const target = await client.query<{
        id: string; organization_id: string; content: string; default_content: string;
      }>(
        `select candidate.id, candidate.organization_id, candidate.content,
                coalesce((select active.content from prompt_versions active
                          where active.organization_id = candidate.organization_id
                            and active.task_key = candidate.task_key and active.status = 'active'
                          order by active.version desc limit 1), candidate.content) as default_content
         from prompt_versions candidate
         join users actor on actor.id = $1 and actor.organization_id = candidate.organization_id
         where candidate.task_key = $2 and candidate.version = $3 and candidate.status = 'draft'
         for update of candidate`,
        [actorId, key, version]
      );
      const row = target.rows[0];
      if (!row) {
        await client.query("rollback");
        return null;
      }
      await client.query(
        `update prompt_versions set status = 'retired'
         where organization_id = $1 and task_key = $2 and status = 'active'`,
        [row.organization_id, key]
      );
      await client.query("update prompt_versions set status = 'active' where id = $1", [row.id]);
      await client.query("commit");
      return { key, content: row.content, defaultContent: row.content, version, status: "active" };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async findPublishedLessonSet(programWeekId: string, cefr: string): Promise<PublishedLessonSet | null> {
    const result = await this.pool.query<{
      id: string;
      version_id: string;
      version: number;
      status: string;
      payload: unknown;
    }>(
      `select ls.id, lsv.id as version_id, lsv.version, lsv.status, lsv.payload
       from lesson_sets ls
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id
       where ls.program_week_id = $1 and ls.cefr = $2 and lsv.status = 'published'
       order by lsv.version desc
       limit 1`,
      [programWeekId, cefr]
    );
    const row = result.rows[0];
    return row
      ? { id: row.id, versionId: row.version_id, version: row.version, status: row.status, payload: row.payload }
      : null;
  }
}

function normalizeLessonParts(parts: readonly LessonPart[], cefr: CefrLevel): LessonPart[] {
  return parts.map((part) => ({ ...part, content: normalizeLessonPartContent(part.code, part.content, cefr) }));
}

function normalizeLessonPartContent(code: string, raw: Record<string, unknown>, cefr: CefrLevel): Record<string, unknown> {
  if (code !== "vocabulary") return raw;
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    ...raw,
    items: items.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const item = value as Record<string, unknown>;
      return {
        ...item,
        collocations: normalizeStringList(item.collocations ?? item.phrases ?? item.examples),
        family: normalizeFamily(item.family),
        synonyms: normalizeLexicalList(item.synonyms, cefr),
        antonyms: normalizeLexicalList(item.antonyms, cefr),
        umbrella: normalizeUmbrella(item.umbrella)
      };
    })
  };
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  if (typeof value === "string") return value.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeFamily(value: unknown): Array<{ word: string; type?: string; meaning?: string }> {
  if (Array.isArray(value)) return value.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [{ word: entry.trim() }];
    if (entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as Record<string, unknown>).word === "string") return [entry as { word: string; type?: string; meaning?: string }];
    return [];
  });
  if (typeof value !== "string" || !value.trim() || value.trim() === "—") return [];
  return value.split(/[;,\n]/).map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(entry);
    return match ? { word: match[1]!.trim(), type: match[2]!.trim() } : { word: entry };
  });
}

function normalizeLexicalList(value: unknown, cefr: CefrLevel): Array<{ word: string; level: CefrLevel }> {
  if (Array.isArray(value)) return value.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [{ word: entry.trim(), level: cefr }];
    if (entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as Record<string, unknown>).word === "string") {
      const object = entry as Record<string, unknown>;
      return [{ ...object, level: typeof object.level === "string" ? object.level : cefr } as { word: string; level: CefrLevel }];
    }
    return [];
  });
  return typeof value === "string" ? value.split(/[;,\n]/).map((entry) => entry.trim()).filter(Boolean).filter((entry) => entry !== "—").map((word) => ({ word, level: cefr })) : [];
}

function normalizeUmbrella(value: unknown): { word: string; meaning: string; siblings: Array<{ word: string }> } | undefined {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).word === "string") {
    const object = value as Record<string, unknown>;
    return { word: object.word as string, meaning: typeof object.meaning === "string" ? object.meaning : "", siblings: Array.isArray(object.siblings) ? object.siblings as Array<{ word: string }> : [] };
  }
  return typeof value === "string" && value.trim() && value.trim() !== "—" ? { word: value.trim(), meaning: "", siblings: [] } : undefined;
}

function normalizeLessonTitle(title: string, parts: readonly { code: string; content: Record<string, unknown> }[]): string {
  const formula = parts.find((part) => part.code === "grammar")?.content.formula;
  if (typeof formula !== "string" || !formula.trim() || !/[+/?…]/.test(formula) || title.trim() === formula.trim()) return title;
  return formula.trim().replace(/danh từ số ít/gi, "noun").replace(/danh từ số nhiều/gi, "plural noun");
}

function practiceLabel(parts: readonly { code: string; content: Record<string, unknown> }[]): string {
  const writing = parts.find((part) => part.code === "writing")?.content;
  const type = writing && typeof writing.type === "string" ? writing.type : "bài tập";
  const answer = writing && typeof writing.answer === "string" ? writing.answer : "";
  return answer ? `${type} · đáp án: ${answer}` : type;
}

function validateLessonDraftInput(lesson: ContentLessonDraftInput): void {
  if (!Number.isInteger(lesson.dayNumber) || lesson.dayNumber < 1 || lesson.dayNumber > 7) {
    throw new Error("CONTENT_LESSON_INVALID");
  }
  if (!lesson.title.trim() || !Number.isFinite(lesson.durationMinutes) || lesson.durationMinutes <= 0) {
    throw new Error("CONTENT_LESSON_INVALID");
  }
  const required = [
    "objective", "instruction", "vocabulary", "grammar", "pronunciation",
    "listening", "reading", "writing", "speaking"
  ];
  const codes = new Set(lesson.parts.map((part) => part.code));
  if (required.some((code) => !codes.has(code as typeof lesson.parts[number]["code"]))) {
    throw new Error("CONTENT_LESSON_INVALID");
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rubricScoreOrNull(value: unknown): number | null {
  if (typeof value === "number") return numberOrNull(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return numberOrNull((value as Record<string, unknown>).score);
}

type OperatorProfileState = {
  pendingLevel?: {
    targetLevel: CefrLevel;
    effectiveAt: string;
    mode: "scheduled" | "recommend_lower";
    reason: string;
  } | undefined;
  levelHistory?: Array<{
    from: CefrLevel | null;
    to: CefrLevel;
    changedAt: string;
    mode: "direct" | "scheduled" | "recommend_lower";
    reason: string;
    evidence: string;
    changedBy: string | null;
  }> | undefined;
};

function profileObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function reviewCefrFromScore(score: number | null, maxScore: number): CefrLevel | null {
  if (score == null || maxScore <= 0) return null;
  const percent = Math.max(0, Math.min(100, score / maxScore * 100));
  return percent < 25 ? "A1" : percent < 45 ? "A2" : percent < 65 ? "B1" : percent < 85 ? "B2" : "C1";
}

function actualSectionSeconds(timingState: AssessmentAttemptRecord["timingState"], section: AssessmentSectionCode): number | null {
  const timing = timingState.sections?.[section];
  if (!timing?.startedAt || !timing.completedAt) return null;
  const started = Date.parse(timing.startedAt);
  const completed = Date.parse(timing.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return null;
  return Math.max(0, Math.round((completed - started) / 1000));
}

function operatorProfileState(value: unknown): OperatorProfileState {
  const state = profileObject(profileObject(value)._operator);
  return {
    pendingLevel: state.pendingLevel && typeof state.pendingLevel === "object"
      ? state.pendingLevel as OperatorProfileState["pendingLevel"] : undefined,
    levelHistory: Array.isArray(state.levelHistory) ? state.levelHistory as OperatorProfileState["levelHistory"] : []
  };
}

type LearnerLifecycleState = {
  rewardAnnouncementAcknowledged?: string;
};

function learnerLifecycleState(value: unknown): LearnerLifecycleState {
  const state = profileObject(profileObject(value)._lifecycle);
  return typeof state.rewardAnnouncementAcknowledged === "string"
    ? { rewardAnnouncementAcknowledged: state.rewardAnnouncementAcknowledged } : {};
}

function publicLearnerProfile(value: unknown): Partial<LearnerProfileData> {
  const profile = profileObject(value);
  // `persona` is a retired profile field (old Season style choice); stored
  // profiles may still carry it, but it is ignored and never exposed.
  const { _operator: _ignoredOperator, _lifecycle: _ignoredLifecycle, persona: _retiredPersona, ...publicProfile } = profile;
  return publicProfile as Partial<LearnerProfileData>;
}

async function listDeletionRequests(pool: Pool, organizationId: string, requestedBy: string | null = null): Promise<AssessmentDeletionRequestView[]> {
  const result = await pool.query<{
    id: string;
    learner_id: string;
    learner_name: string;
    reason: string;
    status: string;
    requested_by: string;
    requested_at: Date;
    decided_by: string | null;
    decided_at: Date | null;
    note: string | null;
  }>(
    `select ae.id, ae.entity_id as learner_id, learner.display_name as learner_name,
            coalesce(ae.payload->>'reason', '') as reason,
            coalesce(ae.payload->>'status', 'pending') as status,
            coalesce(ae.payload->>'requestedBy', ae.actor_user_id::text) as requested_by,
            ae.created_at as requested_at,
            ae.payload->>'decidedBy' as decided_by,
            nullif(ae.payload->>'decidedAt', '')::timestamptz as decided_at,
            ae.payload->>'note' as note
     from audit_events ae
     join users learner on learner.id = ae.entity_id and learner.organization_id = $1
     where ae.organization_id = $1 and ae.action = 'learner.deletion_requested'
       and learner.status <> 'purged'
       and ($2::text is null or coalesce(ae.payload->>'requestedBy', ae.actor_user_id::text) = $2)
     order by ae.created_at desc`,
    [organizationId, requestedBy]
  );
  return result.rows.map((request) => ({
      id: request.id,
      learnerId: request.learner_id,
      learnerName: request.learner_name,
      reason: request.reason,
      status: isDeletionRequestStatus(request.status) ? request.status : "pending",
      requestedBy: request.requested_by,
      requestedAt: request.requested_at.toISOString(),
      decidedBy: request.decided_by,
      decidedAt: request.decided_at?.toISOString() ?? null,
      note: request.note
    }));
}

function isDeletionRequestStatus(value: string): value is AssessmentDeletionRequestView["status"] {
  return value === "pending" || value === "approved" || value === "rejected" || value === "cancelled";
}

const purgeConfirmationPhrase = "XOA VINH VIEN" as const;
const purgeConfirmationCountdownSeconds = 5 as const;
const purgeConfirmationTtlSeconds = 60;
const maintenanceConfirmationCountdownSeconds = 5 as const;
const maintenanceConfirmationTtlSeconds = 300;
const maintenanceBackupTtlSeconds = 3600;
const maintenancePhrases = {
  seed_demo: "GHI DE TOAN BO",
  wipe_data: "XOA TOAN BO"
} as const satisfies Record<ManagerMaintenanceAction, string>;

function destructiveTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function maintenanceSnapshotHash(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isYouTubeMusicUrl(value: string, enabled: boolean): boolean {
  if (!enabled || !value.trim()) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

function importedSettings(
  current: Omit<ManagerSettingsView, "organizationName">,
  candidate: Record<string, unknown>
): Omit<ManagerSettingsView, "organizationName"> {
  const next = { ...current };
  const numberKeys = [
    "reminderInactiveDays", "pilotWeeks", "weekOverride", "minMinutesPerDay", "coachDailyLimit", "testWarnLimit"
  ] as const;
  for (const key of numberKeys) if (typeof candidate[key] === "number" && Number.isFinite(candidate[key])) next[key] = candidate[key] as never;
  if (typeof candidate.weeklyReportEnabled === "boolean") next.weeklyReportEnabled = candidate.weeklyReportEnabled;
  if (typeof candidate.aiTestDisabled === "boolean") next.aiTestDisabled = candidate.aiTestDisabled;
  if (typeof candidate.pilotStartDate === "string") next.pilotStartDate = candidate.pilotStartDate;
  if (typeof candidate.simulatedSystemDate === "string") next.simulatedSystemDate = candidate.simulatedSystemDate;
  if (typeof candidate.courseTheme === "string") next.courseTheme = candidate.courseTheme;
  if (typeof candidate.testTimed === "boolean") next.testTimed = candidate.testTimed;
  if (typeof candidate.baseWebhookUrl === "string") next.baseWebhookUrl = candidate.baseWebhookUrl;
  if (typeof candidate.baseWebhookTemplate === "string") next.baseWebhookTemplate = candidate.baseWebhookTemplate;
  const music = isRecord(candidate.backgroundMusic) ? candidate.backgroundMusic : undefined;
  if (music && typeof music.enabled === "boolean" && typeof music.url === "string" && typeof music.volume === "number") {
    next.backgroundMusic = { enabled: music.enabled, url: music.url, volume: music.volume };
  }
  const times = isRecord(candidate.testTimes) ? candidate.testTimes : undefined;
  if (times && ["listening", "reading", "writing", "speaking"].every((key) => typeof times[key] === "number")) {
    next.testTimes = {
      listening: times.listening as number, reading: times.reading as number,
      writing: times.writing as number, speaking: times.speaking as number
    };
  }
  return next;
}

const cefrOrder: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];

function cefrIndex(level: CefrLevel | null): number {
  return level ? cefrOrder.indexOf(level) : -1;
}

function sectionTaskCount(blueprint: StoredAssessmentDefinition, code: AssessmentSectionCode): number {
  return blueprint.sections
    .find((section) => section.code === code)
    ?.groups.reduce((total, group) => total + group.tasks.length, 0) ?? 0;
}

/** The only publishable level-up shape is the placement-format assessment. */
function hasCanonicalLevelFormStructure(blueprint: StoredAssessmentDefinition): boolean {
  const expected: Record<AssessmentSectionCode, { duration: number; score: number; tasks: number }> = {
    listening: { duration: 15, score: 20, tasks: 20 },
    reading: { duration: 25, score: 40, tasks: 40 },
    writing: { duration: 20, score: 20, tasks: 2 },
    speaking: { duration: 15, score: 20, tasks: 4 }
  };
  if (blueprint.totalMinutes !== 75 || blueprint.totalScore !== 100 || blueprint.sections.length !== 4) return false;
  return (Object.entries(expected) as Array<[AssessmentSectionCode, typeof expected[AssessmentSectionCode]]>).every(([code, requirement]) => {
    const section = blueprint.sections.find((item) => item.code === code);
    return Boolean(section && section.durationMinutes === requirement.duration && section.maxScore === requirement.score && sectionTaskCount(blueprint, code) === requirement.tasks);
  });
}

/** A manually-created frame is a real draft, but it must not be publishable
 * until every learner-facing field has been supplied. */
function hasCompleteLevelFormContent(blueprint: StoredAssessmentDefinition): boolean {
  return blueprint.sections.every((section) => section.groups.every((group) => {
    if (group.stimulus?.type === "audio_script" && (!group.stimulus.lines?.length || !group.stimulus.lines.every((line) => line.speaker.trim() && line.text.trim()))) return false;
    if (group.stimulus?.type === "passage" && !group.stimulus.text?.trim()) return false;
    return group.tasks.every((task) => {
      if (!task.prompt.trim()) return false;
      if (task.responseType !== "single_choice") return true;
      const options = task.options ?? [];
      return options.length === 4
        && options.every((option) => option.value.trim() && option.label.trim())
        && Boolean(task.correctAnswer && options.some((option) => option.value === task.correctAnswer));
    });
  }));
}

/** A compact count for list actions. Detail view exposes the exact grouped
 * reasons; publication still applies the full content validation above. */
function levelFormPublicationBlockerCount(blueprint: StoredAssessmentDefinition): number {
  const expectedCounts: Record<AssessmentSectionCode, number> = { listening: 20, reading: 40, writing: 2, speaking: 4 };
  let blockers = 0;
  for (const code of ["listening", "reading", "writing", "speaking"] as const) {
    const section = blueprint.sections.find((item) => item.code === code);
    if (!section || sectionTaskCount(blueprint, code) < expectedCounts[code]) { blockers++; continue; }
    const tasks = section.groups.flatMap((group) => group.tasks);
    if (tasks.some((task) => !task.prompt.trim())) blockers++;
    if (tasks.some((task) => task.responseType === "single_choice" && (!task.correctAnswer || !task.options?.some((option) => option.value === task.correctAnswer)))) blockers++;
  }
  const listening = blueprint.sections.find((section) => section.code === "listening");
  blockers += listening?.groups.filter((group) => group.stimulus?.type !== "audio_script" || !group.stimulus.audioSrc?.trim()).length ?? 1;
  return blockers;
}

function assessmentTaskMap(blueprint: StoredAssessmentDefinition): Map<string, unknown> {
  return new Map(blueprint.sections.flatMap((section) => section.groups.flatMap((group) =>
    group.tasks.map((task) => [task.key, task] as const)
  )));
}

function placementTaskKeyForCurrentVersion(taskKey: string): string {
  return taskKey === "LA_3" || taskKey === "LB_Q6" ? "LB_Q9" : taskKey;
}

function supportsPlacementMigration(
  source: StoredAssessmentDefinition,
  target: StoredAssessmentDefinition
): boolean {
  if (source.kind !== "placement" || target.kind !== "placement" || ![1, 2].includes(source.version) || target.version !== 3) return false;
  const sourceTasks = assessmentTaskMap(source);
  const targetTasks = assessmentTaskMap(target);
  const sourceMovedKey = source.version === 1 ? "LA_3" : "LB_Q6";
  if (!sourceTasks.has(sourceMovedKey) || targetTasks.has("LA_3") || targetTasks.has("LB_Q6") || !targetTasks.has("LB_Q9")) return false;
  if (sourceTasks.size !== targetTasks.size) return false;
  for (const [sourceKey, sourceTask] of sourceTasks) {
    const targetKey = placementTaskKeyForCurrentVersion(sourceKey);
    const targetTask = targetTasks.get(targetKey);
    if (!targetTask) return false;
    const migratedTask = { ...(sourceTask as Record<string, unknown>), key: targetKey };
    if (JSON.stringify(migratedTask) !== JSON.stringify(targetTask)) return false;
  }
  return true;
}

function reviewAiGradeJobView(row: {
  id: string;
  state: string;
  payload: Record<string, unknown>;
  last_error?: string | null;
  created_at: Date;
  updated_at: Date;
}): ContentReviewAiGradeJobView {
  const result = row.payload.result;
  const parsed = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : null;
  const score = parsed?.score && typeof parsed.score === "object" && !Array.isArray(parsed.score) ? parsed.score as Record<string, unknown> : null;
  const rubric = score?.rubric && typeof score.rubric === "object" && !Array.isArray(score.rubric) ? score.rubric as Record<string, unknown> : null;
  const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    return typeof entry.original === "string" && typeof entry.corrected === "string" && typeof entry.explanation === "string"
      ? [{ original: entry.original, corrected: entry.corrected, explanation: entry.explanation }] : [];
  }) : [];
  const hasResult = Boolean(score && rubric && typeof score.total === "number" && typeof parsed?.feedback === "string");
  return {
    jobId: row.id,
    submissionId: typeof row.payload.submissionId === "string" ? row.payload.submissionId : "",
    status: row.state === "dead" ? "failed" : row.state as ContentReviewAiGradeJobView["status"],
    requestedAt: row.created_at.toISOString(),
    completedAt: row.state === "succeeded" || row.state === "failed" ? row.updated_at.toISOString() : null,
    errorCode: row.last_error ?? null,
    result: hasResult ? {
      total: Number(score!.total),
      rubric: { meaning: Number(rubric!.meaning), vocabulary: Number(rubric!.vocabulary), grammar: Number(rubric!.grammar) },
      feedback: String(parsed!.feedback),
      suggestions,
      correctedText: typeof parsed!.correctedText === "string" ? parsed!.correctedText : ""
    } : null
  };
}

function nextMondayIso(): string {
  const date = new Date();
  const day = date.getUTCDay();
  const days = day === 1 ? 7 : (8 - day) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function seasonNameForDate(date: Date): string {
  const month = date.getUTCMonth() + 1;
  if (month >= 3 && month <= 5) return "Mùa xuân – gieo hạt";
  if (month >= 6 && month <= 8) return "Mùa hè – bứt phá";
  if (month >= 9 && month <= 11) return "Mùa thu – trưởng thành";
  return "Mùa đông – vững vàng";
}

const learnerAssessmentAppealCandidates = `
  select aa.id as attempt_id, aa.learner_id, definition.title, definition.kind,
         decision.decided_at + case when definition.kind = 'final' then interval '3 days' else interval '72 hours' end as deadline
  from assessment_attempts aa
  join assessment_versions version on version.id = aa.assessment_version_id
  join assessment_definitions definition on definition.id = version.definition_id
  left join assessment_decisions decision on decision.attempt_id = aa.id
  where aa.learner_id = $1 and aa.status in ('approved', 'needs_retry')
    and decision.status in ('approved', 'retry', 'rejected') and decision.decided_at is not null
    and (definition.kind in ('placement', 'level_up', 'pass_course')
      or (definition.kind = 'final' and definition.assessment_key like 'monthly-final-%'))
    and not exists (select 1 from appeals a where a.attempt_id = aa.id)
    and exists (select 1 from enrollments approved where approved.learner_id = aa.learner_id
      and approved.cefr_approved and approved.cefr is not null)
`;
const openAssessmentAppeal = "deadline >= now()";

class AssessmentRepository {
  constructor(private readonly pool: Pool) {}

  /** Appeals open only after the placement level is approved; before that there is nothing to appeal. */
  async hasApprovedLevel(learnerId: string): Promise<boolean> {
    const result = await this.pool.query<{ approved: boolean }>(
      `select exists(select 1 from enrollments e where e.learner_id = $1 and e.cefr_approved and e.cefr is not null) as approved`,
      [learnerId]
    );
    return Boolean(result.rows[0]?.approved);
  }

  async levelUpStartContext(learnerId: string): Promise<{
    currentLevel: CefrLevel | null;
    active: boolean;
    retryEligibleAt: Date | null;
  }> {
    const result = await this.pool.query<{
      current_level: CefrLevel | null; active: boolean; retry_eligible_at: Date | null;
    }>(
      `select enrollment.cefr as current_level,
              exists(
                select 1 from assessment_attempts aa
                join assessment_versions av on av.id = aa.assessment_version_id
                join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'level_up'
                where aa.learner_id = learner.id and aa.status in ('in_progress', 'submitted', 'pending_review')
                union all
                select 1 from scheduled_level_changes change
                where change.learner_id = learner.id and change.status = 'scheduled'
              ) as active,
              (select rp.eligible_at from level_up_retry_plans rp where rp.learner_id = learner.id
               order by rp.created_at desc limit 1) as retry_eligible_at
       from users learner
       left join lateral (
         select e.cefr from enrollments e join programs p on p.id = e.program_id and p.status = 'active'
         where e.learner_id = learner.id and e.cefr_approved = true order by e.enrolled_at desc limit 1
       ) enrollment on true
       where learner.id = $1 and learner.role = 'learner' and learner.status = 'active'`,
      [learnerId]
    );
    const row = result.rows[0];
    return {
      currentLevel: row?.current_level ?? null,
      active: Boolean(row?.active),
      retryEligibleAt: row?.retry_eligible_at ?? null
    };
  }

  async findPublishedLevelUpForLearner(learnerId: string, targetLevel: CefrLevel): Promise<PublishedAssessmentRecord | null> {
    const result = await this.pool.query<{
      definition_id: string; version_id: string; assessment_key: string; kind: "level_up";
      title: string; version: number; blueprint: StoredAssessmentDefinition;
    }>(
      `select ad.id as definition_id, av.id as version_id, ad.assessment_key, ad.kind, ad.title,
              av.version, av.blueprint
       from users learner
       join assessment_definitions ad on ad.organization_id = learner.organization_id and ad.kind = 'level_up'
       join assessment_versions av on av.definition_id = ad.id and av.status = 'published'
       where learner.id = $1 and av.blueprint->>'targetLevel' = $2
       order by av.published_at desc nulls last, av.version desc limit 1`,
      [learnerId, targetLevel]
    );
    const row = result.rows[0];
    return row ? {
      definitionId: row.definition_id, versionId: row.version_id, assessmentKey: row.assessment_key,
      kind: row.kind, title: row.title, version: row.version, blueprint: row.blueprint
    } : null;
  }

  async findPublished(kind: AssessmentKind): Promise<PublishedAssessmentRecord | null> {
    const databaseKind = kind === "level-up" ? "level_up" : kind === "pass-course" ? "pass_course" : kind;
    const result = await this.pool.query<{
      definition_id: string;
      version_id: string;
      assessment_key: string;
      kind: "placement" | "level_up" | "final" | "pass_course";
      title: string;
      version: number;
      blueprint: StoredAssessmentDefinition;
    }>(
      `select ad.id as definition_id, av.id as version_id, ad.assessment_key, ad.kind, ad.title,
              av.version, av.blueprint
       from assessment_definitions ad
       join assessment_versions av on av.definition_id = ad.id
       where ad.kind = $1 and av.status = 'published'
       order by av.version desc
       limit 1`,
      [databaseKind]
    );
    const row = result.rows[0];
    return row ? {
      definitionId: row.definition_id,
      versionId: row.version_id,
      assessmentKey: row.assessment_key,
      kind: row.kind,
      title: row.title,
      version: row.version,
      blueprint: row.blueprint
    } : null;
  }

  /**
   * Resolve an assessment attempt against the exact published version that
   * created it. A monthly final is keyed by month and CEFR, so looking up only
   * the latest form of kind `final` can select another month's form.
   */
  async findPublishedByVersion(versionId: string): Promise<PublishedAssessmentRecord | null> {
    const result = await this.pool.query<{
      definition_id: string;
      version_id: string;
      assessment_key: string;
      kind: "placement" | "level_up" | "final" | "pass_course";
      title: string;
      version: number;
      blueprint: StoredAssessmentDefinition;
    }>(
      `select ad.id as definition_id, av.id as version_id, ad.assessment_key, ad.kind, ad.title,
              av.version, av.blueprint
       from assessment_versions av
       join assessment_definitions ad on ad.id = av.definition_id
       where av.id = $1 and (av.status = 'published' or (ad.kind = 'final' and av.published_at is not null))
       limit 1`,
      [versionId]
    );
    const row = result.rows[0];
    return row ? {
      definitionId: row.definition_id,
      versionId: row.version_id,
      assessmentKey: row.assessment_key,
      kind: row.kind,
      title: row.title,
      version: row.version,
      blueprint: row.blueprint
    } : null;
  }

  /** Pass Course may start only for an explicitly C1-ready learner. */
  async passCourseEligibility(learnerId: string): Promise<boolean> {
    const result = await this.pool.query<{ eligible: boolean }>(
      `select exists(
         select 1
         from users learner
         join enrollments enrollment on enrollment.learner_id = learner.id
           and enrollment.cefr = 'C1' and enrollment.cefr_approved = true
         join pass_course_readiness readiness on readiness.learner_id = learner.id
           and readiness.organization_id = learner.organization_id and readiness.cefr_ready = true
         where learner.id = $1 and learner.role = 'learner' and learner.status = 'active'
       ) as eligible`,
      [learnerId]
    );
    return Boolean(result.rows[0]?.eligible);
  }

  async findInProgressLevelUpAttempt(learnerId: string): Promise<AssessmentAttemptRecord | null> {
    const result = await this.pool.query<{ id: string }>(
      `select attempt.id from assessment_attempts attempt
       join assessment_versions version on version.id = attempt.assessment_version_id
       join assessment_definitions definition on definition.id = version.definition_id and definition.kind = 'level_up'
       where attempt.learner_id = $1 and attempt.status = 'in_progress'
       order by attempt.started_at desc limit 1`,
      [learnerId]
    );
    const attemptId = result.rows[0]?.id;
    return attemptId ? this.findAttempt(learnerId, attemptId) : null;
  }

  async claimAttemptSession(learnerId: string, attemptId: string, sessionId: string): Promise<boolean> {
    const result = await this.pool.query(
      `update assessment_attempts attempt
       set owner_session_id = $3
       where attempt.id = $1 and attempt.learner_id = $2
         and exists (
           select 1 from sessions incoming
           where incoming.id = $3 and incoming.user_id = $2
             and incoming.revoked_at is null and incoming.expires_at > now()
         )
         and (
           attempt.status <> 'in_progress'
           or attempt.owner_session_id = $3
           or not exists (
             select 1 from sessions owner
             where owner.id = attempt.owner_session_id
               and owner.revoked_at is null and owner.expires_at > now()
           )
         )`,
      [attemptId, learnerId, sessionId]
    );
    return result.rowCount === 1;
  }

  async findActiveAttempt(learnerId: string, assessmentVersionId: string): Promise<AssessmentAttemptRecord | null> {
    const result = await this.pool.query<{ id: string }>(
      `select id from assessment_attempts
       where learner_id = $1 and assessment_version_id = $2
         and status in ('in_progress', 'submitted', 'pending_review', 'approved', 'needs_retry')
       order by started_at desc limit 1`,
      [learnerId, assessmentVersionId]
    );
    const id = result.rows[0]?.id;
    return id ? this.findAttempt(learnerId, id) : null;
  }

  async findMonthlyFinalAttempt(learnerId: string, month?: string): Promise<AssessmentAttemptRecord | null> {
    const { rows: [row] } = await this.pool.query<{ id: string }>(
      `select a.id from assessment_attempts a
       join assessment_versions v on v.id = a.assessment_version_id
       join assessment_definitions d on d.id = v.definition_id
       where a.learner_id = $1 and d.kind = 'final'
         and d.assessment_key like 'monthly-final-%'
         and (($2::text is null and a.status = 'in_progress')
           or ($2::text is not null and d.assessment_key like 'monthly-final-' || $2 || '-%'))
       order by a.started_at desc limit 1`,
      [learnerId, month ?? null]
    );
    return row ? this.findAttempt(learnerId, row.id) : null;
  }

  async resumePlacementAttempt(
    learnerId: string,
    published: PublishedAssessmentRecord,
    sessionId?: string
  ): Promise<PlacementAttemptResumeResult> {
    const current = await this.findActiveAttempt(learnerId, published.versionId);
    if (current && current.status !== "in_progress") return { state: "ready", attempt: current };

    let candidate = current;
    if (!candidate) {
      const stale = await this.pool.query<{ id: string }>(
        `select aa.id
         from assessment_attempts aa
         join assessment_versions av on av.id = aa.assessment_version_id
         where aa.learner_id = $1 and av.definition_id = $2 and aa.status = 'in_progress'
         order by aa.started_at desc
         limit 1`,
        [learnerId, published.definitionId]
      );
      const staleId = stale.rows[0]?.id;
      candidate = staleId ? await this.findAttempt(learnerId, staleId) : null;
    }
    if (!candidate) return { state: "none", attempt: null };
    if (sessionId && !await this.claimAttemptSession(learnerId, candidate.id, sessionId)) {
      return { state: "session_conflict", attempt: null };
    }

    const hasLegacyResponse = candidate.responses.some((response) => response.section === "listening" && response.taskKey === "LA_3");
    if (candidate.assessmentVersionId === published.versionId && !hasLegacyResponse) {
      return { state: "ready", attempt: candidate };
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const locked = await client.query<{
        id: string;
        status: AssessmentAttemptRecord["status"];
        assessment_version_id: string;
        blueprint: StoredAssessmentDefinition;
      }>(
        `select aa.id, aa.status, aa.assessment_version_id, av.blueprint
         from assessment_attempts aa
         join assessment_versions av on av.id = aa.assessment_version_id
         where aa.id = $1 and aa.learner_id = $2
         for update of aa`,
        [candidate.id, learnerId]
      );
      const attempt = locked.rows[0];
      if (!attempt || attempt.status !== "in_progress") {
        await client.query("rollback");
        const latest = await this.findActiveAttempt(learnerId, published.versionId);
        return latest ? { state: "ready", attempt: latest } : { state: "none", attempt: null };
      }

      const targetTasks = assessmentTaskMap(published.blueprint);
      const versionChanged = attempt.assessment_version_id !== published.versionId;
      const compatibleVersion = !versionChanged || supportsPlacementMigration(attempt.blueprint, published.blueprint);
      const responses = await client.query<{ task_key: string; response: unknown }>(
        "select task_key, response from assessment_responses where attempt_id = $1 for update",
        [attempt.id]
      );
      const mappedKeysAreValid = responses.rows.every((response) =>
        targetTasks.has(placementTaskKeyForCurrentVersion(response.task_key))
      );
      const legacy = responses.rows.find((response) => response.task_key === "LA_3" || response.task_key === "LB_Q6");
      const target = responses.rows.find((response) => response.task_key === "LB_Q9");
      const conflict = Boolean(legacy && target && JSON.stringify(legacy.response) !== JSON.stringify(target.response));

      if (!compatibleVersion || !mappedKeysAreValid || conflict || !targetTasks.has("LB_Q9")) {
        await client.query("delete from assessment_attempts where id = $1 and learner_id = $2", [attempt.id, learnerId]);
        await client.query("commit");
        return { state: "restart_required", attempt: null };
      }

      if (legacy && target) {
        await client.query(
          "delete from assessment_responses where attempt_id = $1 and section = 'listening' and task_key in ('LA_3', 'LB_Q6')",
          [attempt.id]
        );
      } else if (legacy) {
        await client.query(
          `update assessment_responses set task_key = 'LB_Q9', saved_at = now()
           where attempt_id = $1 and section = 'listening' and task_key in ('LA_3', 'LB_Q6')`,
          [attempt.id]
        );
      }
      if (versionChanged) {
        await client.query(
          "update assessment_attempts set assessment_version_id = $2, updated_at = now() where id = $1",
          [attempt.id, published.versionId]
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const migrated = await this.findAttempt(learnerId, candidate.id);
    return migrated ? { state: "migrated", attempt: migrated } : { state: "restart_required", attempt: null };
  }

  async findAttempt(learnerId: string, attemptId: string): Promise<AssessmentAttemptRecord | null> {
    const result = await this.pool.query<{
      id: string;
      assessment_version_id: string;
      learner_id: string;
      status: AssessmentAttemptRecord["status"];
      current_section: AssessmentSectionCode | null;
      timing_state: AssessmentAttemptRecord["timingState"];
      integrity_events: AssessmentAttemptRecord["integrityEvents"];
      violation_count: number;
      violation_limit: number;
      submit_reason: AssessmentSubmitReason | null;
      device_evidence: AssessmentDeviceEvidence;
      media_evidence: Partial<AssessmentMediaEvidence> | null;
      started_at: Date;
      submitted_at: Date | null;
      updated_at: Date;
      suggested_level: CefrLevel | null;
      challenge_turns: string; challenge_average: string | null; challenge_off_topic: string; challenge_status: string | null;
    }>(
      `select aa.id, aa.assessment_version_id, aa.learner_id, aa.status, aa.current_section,
              aa.timing_state, aa.integrity_events, aa.violation_count, aa.violation_limit,
              aa.submit_reason, aa.device_evidence, aa.media_evidence,
              aa.started_at, aa.submitted_at, aa.updated_at, dec.suggested_level
       from assessment_attempts aa
       left join assessment_decisions dec on dec.attempt_id = aa.id
       where aa.id = $1 and aa.learner_id = $2`,
      [attemptId, learnerId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const [responses, scores, audioPlays] = await Promise.all([
      this.pool.query<{
        section: AssessmentSectionCode;
        task_key: string;
        response: { value?: string; evidenceType?: AssessmentEvidenceType; artifactKey?: string };
        saved_at: Date;
      }>(
        `select section, task_key, response, saved_at
         from assessment_responses where attempt_id = $1 order by saved_at, task_key`,
        [attemptId]
      ),
      this.pool.query<{ section: AssessmentSectionCode; score: string }>(
        `select section, score::text from assessment_scores where attempt_id = $1`,
        [attemptId]
      ),
       this.pool.query<{ section: AssessmentSectionCode; group_key: string; play_count: number }>(
        `select section, group_key, play_count
         from assessment_audio_plays where attempt_id = $1`,
        [attemptId]
      )
    ]);
    const mediaEvidence = mediaEvidenceFromResponses(responses.rows.map((response) => ({
      taskKey: response.task_key,
      response: response.response,
      savedAt: response.saved_at
    })), row.media_evidence);
    return {
      id: row.id,
      assessmentVersionId: row.assessment_version_id,
      learnerId: row.learner_id,
      status: row.status,
      currentSection: row.current_section,
      timingState: row.timing_state ?? {},
      integrityEvents: Array.isArray(row.integrity_events) ? row.integrity_events : [],
      violationCount: Number(row.violation_count ?? 0),
      violationLimit: Number(row.violation_limit ?? 3),
      submitReason: row.submit_reason,
      deviceEvidence: row.device_evidence ?? defaultDeviceEvidence(),
      mediaEvidence,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
      responses: responses.rows.map((response) => ({
        section: response.section,
        taskKey: response.task_key,
        value: String(response.response.value ?? ""),
        evidenceType: response.response.evidenceType ?? "text",
        artifactKey: response.response.artifactKey ?? null,
        savedAt: response.saved_at
      })),
      scores: Object.fromEntries(scores.rows.map((score) => [score.section, Number(score.score)])),
      audioPlayCounts: Object.fromEntries(audioPlays.rows.map((play) => [`${play.section}:${play.group_key}`, play.play_count])),
      suggestedLevel: row.suggested_level
    };
  }

  async getAssessmentRuntime(learnerId: string, attemptId: string): Promise<AssessmentRuntimeView | null> {
    const attempt = await this.findAttempt(learnerId, attemptId);
    return attempt ? assessmentRuntimeFromAttempt(attempt) : null;
  }

  async recordAssessmentViolation(input: {
    learnerId: string;
    attemptId: string;
    requestId: string;
    reason: AssessmentViolationReason;
    occurredAt: string;
  }): Promise<AssessmentRuntimeView | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const scope = `assessment.violation:${input.attemptId}`;
      // Reserve the request inside the same transaction as the attempt update.
      // ON CONFLICT waits for an in-flight reservation, so a retry cannot race
      // the update and increment the authoritative counter twice.
      const reservation = await client.query<{ id: number }>(
        `insert into idempotency_keys (scope, key, response) values ($1, $2, '{}'::jsonb)
         on conflict (scope, key) do nothing returning id`,
        [scope, input.requestId]
      );
      if (!reservation.rowCount) {
        const existing = await client.query<{ response: AssessmentRuntimeView }>(
          `select response from idempotency_keys where scope = $1 and key = $2`,
          [scope, input.requestId]
        );
        await client.query("commit");
        return existing.rows[0]?.response ?? null;
      }

      const locked = await client.query<{
        id: string;
        status: AssessmentAttemptRecord["status"];
        current_section: AssessmentSectionCode | null;
        timing_state: AssessmentAttemptRecord["timingState"];
        violation_count: number;
        violation_limit: number;
        integrity_events: AssessmentAttemptRecord["integrityEvents"];
      }>(
        `select id, status, current_section, timing_state, violation_count, violation_limit, integrity_events
         from assessment_attempts
         where id = $1 and learner_id = $2
         for update`,
        [input.attemptId, input.learnerId]
      );
      const attempt = locked.rows[0];
      if (!attempt || attempt.status !== "in_progress") {
        await client.query("rollback");
        return null;
      }

      const violationCount = Number(attempt.violation_count ?? 0) + 1;
      const violationLimit = Number(attempt.violation_limit ?? 3);
      const recordedAt = new Date().toISOString();
      const event = {
        requestId: input.requestId,
        reason: input.reason,
        occurredAt: input.occurredAt,
        recordedAt,
        violationCount
      } satisfies AssessmentAttemptRecord["integrityEvents"][number];
      const events = [...(Array.isArray(attempt.integrity_events) ? attempt.integrity_events : []), event];
      const clipboardViolations = events.filter(({ reason }) => reason === "copy" || reason === "paste").length;
      const autoSubmitted = violationCount > violationLimit || clipboardViolations >= 3;
      const timingState = attempt.timing_state ?? {};
      if (autoSubmitted && attempt.current_section) {
        timingState.sections ??= {};
        const current = timingState.sections[attempt.current_section];
        if (current) timingState.sections[attempt.current_section] = { ...current, completedAt: recordedAt, auto: true };
      }
      await client.query(
        `update assessment_attempts
         set violation_count = $3,
             integrity_events = $4::jsonb,
             timing_state = $5::jsonb,
             status = case when $6 then 'pending_review' else status end,
             current_section = case when $6 then null else current_section end,
             submitted_at = case when $6 then now() else submitted_at end,
             submit_reason = case when $6 then 'violations' else submit_reason end,
             updated_at = now()
         where id = $1 and learner_id = $2`,
        [input.attemptId, input.learnerId, violationCount, JSON.stringify(events), JSON.stringify(timingState), autoSubmitted]
      );
      const state = await client.query<{
        status: AssessmentAttemptRecord["status"];
        current_section: AssessmentSectionCode | null;
        timing_state: AssessmentAttemptRecord["timingState"];
        violation_count: number;
        violation_limit: number;
        submit_reason: AssessmentSubmitReason | null;
        device_evidence: AssessmentDeviceEvidence;
        media_evidence: Partial<AssessmentMediaEvidence> | null;
      }>(
        `select status, current_section, timing_state, violation_count, violation_limit,
                submit_reason, device_evidence, media_evidence
         from assessment_attempts where id = $1 and learner_id = $2`,
        [input.attemptId, input.learnerId]
      );
      const updated = state.rows[0];
      if (!updated) { await client.query("rollback"); return null; }
      // A transaction owns one pg Client. Keep its queries sequential: pg@9
      // removes support for overlapping client.query() calls on that client.
      const responses = await client.query<{ task_key: string; response: { evidenceType?: AssessmentEvidenceType; artifactKey?: string }; saved_at: Date }>(
        `select task_key, response, saved_at from assessment_responses where attempt_id = $1`, [input.attemptId]
      );
      const audioPlays = await client.query<{ section: AssessmentSectionCode; group_key: string; play_count: number }>(
        `select section, group_key, play_count from assessment_audio_plays where attempt_id = $1`, [input.attemptId]
      );
      const mediaEvidence = mediaEvidenceFromResponses(responses.rows.map((response) => ({
        taskKey: response.task_key, response: response.response, savedAt: response.saved_at
      })), updated.media_evidence);
      const runtime = {
        ...assessmentRuntimeFromState({
          status: updated.status,
          currentSection: updated.current_section,
          timingState: updated.timing_state ?? {},
          violationCount: Number(updated.violation_count ?? 0),
          violationLimit: Number(updated.violation_limit ?? 3),
          submitReason: updated.submit_reason,
          deviceEvidence: updated.device_evidence ?? defaultDeviceEvidence(),
          mediaEvidence,
          audioPlayCounts: Object.fromEntries(audioPlays.rows.map((play) => [`${play.section}:${play.group_key}`, play.play_count]))
        }),
        autoSubmitted
      } satisfies AssessmentRuntimeView;
      await client.query(`update idempotency_keys set response = $3::jsonb where scope = $1 and key = $2`, [scope, input.requestId, JSON.stringify(runtime)]);
      await client.query("commit");
      return runtime;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async findAppeal(learnerId: string, attemptId: string): Promise<{
    id: string; reason: string; scope: string | null; hasEvidence: boolean; status: "pending" | "accepted" | "rejected";
    resolution: string | null; createdAt: Date; resolvedAt: Date | null; proposedLevel: CefrLevel | null;
  } | null> {
    const result = await this.pool.query<{
      id: string; reason: string; status: "pending" | "accepted" | "rejected";
      resolution: string | null; created_at: Date; resolved_at: Date | null;
      scope: string | null; has_evidence: boolean; proposed_level: CefrLevel | null;
    }>(
      `select id, reason, status, resolution, created_at, resolved_at, proposed_level, request_scope as scope, screenshot is not null as has_evidence from appeals
       where learner_id = $1 and attempt_id = $2 order by created_at desc limit 1`,
      [learnerId, attemptId]
    );
    const row = result.rows[0];
    return row ? { id: row.id, reason: row.reason, scope: row.scope, hasEvidence: row.has_evidence,
      status: row.status, resolution: row.resolution, createdAt: row.created_at, resolvedAt: row.resolved_at, proposedLevel: row.proposed_level } : null;
  }

  async listAppealableResults(learnerId: string, attemptId: string | null = null): Promise<AssessmentAppealTargetView[]> {
    const result = await this.pool.query<{ attempt_id: string; title: string; deadline: Date; kind: string }>(
      `select attempt_id, title, deadline, kind from (${learnerAssessmentAppealCandidates}) eligible
       where ($2::uuid is null or attempt_id = $2) and ${openAssessmentAppeal}
       order by deadline asc nulls last, attempt_id`,
      [learnerId, attemptId]
    );
    return result.rows.map(row => ({ attemptId: row.attempt_id, title: row.title, availableUntil: row.deadline.toISOString(), requiresProposedLevel: row.kind !== "final" }));
  }

  async createAppeal(learnerId: string, attemptId: string, reason: string, evidence: StoredRequestEvidence & { proposedLevel?: CefrLevel | undefined } = {}): Promise<{
    id: string; reason: string; scope: string | null; hasEvidence: boolean; status: "pending"; resolution: null; createdAt: Date; resolvedAt: null;
    proposedLevel: CefrLevel | null;
  } | null> {
    const result = await this.pool.query<{ id: string; created_at: Date }>(
      `insert into appeals (id, attempt_id, learner_id, reason, expires_at, request_scope, screenshot, screenshot_type, proposed_level)
       select $3, attempt_id, learner_id, $4, deadline, $5, $6, $7, $8
       from (${learnerAssessmentAppealCandidates}) eligible
       where attempt_id = $2 and ${openAssessmentAppeal} and (kind = 'final') = ($8::text is null)
       on conflict (attempt_id) where status = 'pending' do nothing
       returning id, created_at`,
      [learnerId, attemptId, randomUUID(), reason, ...requestEvidenceValues(evidence), evidence.proposedLevel ?? null]
    );
    const row = result.rows[0];
    return row ? { id: row.id, reason, scope: evidence.scope ?? null, hasEvidence: Boolean(evidence.screenshot),
      status: "pending", resolution: null, createdAt: row.created_at, resolvedAt: null, proposedLevel: evidence.proposedLevel ?? null } : null;
  }

  async resolveAssessmentAppeal(input: {
    appealId: string;
    reviewerId: string;
    status: "accepted" | "rejected";
    resolution: string;
  }): Promise<{ id: string; status: "accepted" | "rejected"; resolution: string; resolvedAt: Date } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{ id: string; status: "accepted" | "rejected"; resolution: string; resolved_at: Date }>(
        `update appeals appeal
         set status = $3, resolution = $4, resolved_by = $2, resolved_at = now()
         from assessment_attempts attempt
         join users learner on learner.id = attempt.learner_id
         join users reviewer on reviewer.id = $2 and reviewer.organization_id = learner.organization_id and reviewer.role = 'operator'
         where appeal.id = $1 and appeal.attempt_id = attempt.id and appeal.status = 'pending'
         returning appeal.id, appeal.status, appeal.resolution, appeal.resolved_at`,
        [input.appealId, input.reviewerId, input.status, input.resolution]
      );
      const row = result.rows[0];
      if (row?.status === "accepted") await this.applyAcceptedAppealLevel(client, input.reviewerId, row.id, input.resolution);
      await client.query("commit");
      return row ? { id: row.id, status: row.status, resolution: row.resolution, resolvedAt: row.resolved_at } : null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async recordAudioPlay(input: {
    learnerId: string;
    attemptId: string;
    section: AssessmentSectionCode;
    groupKey: string;
    maxPlays: number;
  }): Promise<number | null> {
    const result = await this.pool.query<{ play_count: number }>(
      `insert into assessment_audio_plays (id, attempt_id, section, group_key, play_count)
       select $1, aa.id, $4, $5, 1
       from assessment_attempts aa
       where aa.id = $2 and aa.learner_id = $3
         and aa.status = 'in_progress' and aa.current_section = $4
       on conflict (attempt_id, section, group_key)
       do update set play_count = assessment_audio_plays.play_count + 1, last_played_at = now()
       where assessment_audio_plays.play_count < $6
       returning play_count`,
      [randomUUID(), input.attemptId, input.learnerId, input.section, input.groupKey, input.maxPlays]
    );
    return result.rows[0]?.play_count ?? null;
  }

  async assessmentViolationLimit(learnerId: string): Promise<number> {
    const result = await this.pool.query<{ violation_limit: number | null }>(
      `select coalesce(
                case when os.configuration->>'testWarnLimit' ~ '^[0-9]+$'
                  then (os.configuration->>'testWarnLimit')::int end,
                3
              ) as violation_limit
       from users u
       left join organization_settings os on os.organization_id = u.organization_id
       where u.id = $1`,
      [learnerId]
    );
    const limit = Number(result.rows[0]?.violation_limit ?? 3);
    return Number.isInteger(limit) && limit >= 1 && limit <= 10 ? limit : 3;
  }

  async startAttempt(input: {
    learnerId: string;
    assessmentVersionId: string;
    firstSection: AssessmentSectionCode;
    durationMinutes: number;
    violationLimit?: number;
    ownerSessionId?: string;
  }): Promise<AssessmentAttemptRecord> {
    const active = await this.findActiveAttempt(input.learnerId, input.assessmentVersionId);
    if (active) return active;
    const id = randomUUID();
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + input.durationMinutes * 60_000);
    const timingState = { sections: { [input.firstSection]: { startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString() } } };
    try {
      await this.pool.query(
        `insert into assessment_attempts
           (id, assessment_version_id, learner_id, status, current_section, timing_state, violation_limit, started_at, updated_at, owner_session_id)
         values ($1, $2, $3, 'in_progress', $4, $5::jsonb, $6, $7, $7, $8)`,
        [id, input.assessmentVersionId, input.learnerId, input.firstSection, JSON.stringify(timingState), input.violationLimit ?? 3, startedAt, input.ownerSessionId ?? null]
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
      const raced = await this.findActiveAttempt(input.learnerId, input.assessmentVersionId);
      if (raced) return raced;
      throw error;
    }
    return (await this.findAttempt(input.learnerId, id))!;
  }

  async saveResponse(input: {
    learnerId: string;
    attemptId: string;
    section: AssessmentSectionCode;
    taskKey: string;
    value: string;
    evidenceType: AssessmentEvidenceType;
    artifactKey?: string;
  }): Promise<AssessmentResponseRecord | null> {
    const id = randomUUID();
    const result = await this.pool.query<{
      section: AssessmentSectionCode;
      task_key: string;
      response: { value: string; evidenceType: AssessmentEvidenceType; artifactKey?: string };
      saved_at: Date;
    }>(
      `insert into assessment_responses (id, attempt_id, section, task_key, response)
       select $1, aa.id, $4, $5, $6::jsonb
       from assessment_attempts aa
       where aa.id = $2 and aa.learner_id = $3 and aa.status = 'in_progress' and aa.current_section = $4
       on conflict (attempt_id, section, task_key)
       do update set response = excluded.response, saved_at = now()
       returning section, task_key, response, saved_at`,
      [id, input.attemptId, input.learnerId, input.section, input.taskKey, JSON.stringify({
        value: input.value,
        evidenceType: input.evidenceType,
        ...(input.artifactKey ? { artifactKey: input.artifactKey } : {})
      })]
    );
    const row = result.rows[0];
    return row ? {
      section: row.section,
      taskKey: row.task_key,
      value: row.response.value,
      evidenceType: row.response.evidenceType,
      artifactKey: row.response.artifactKey ?? null,
      savedAt: row.saved_at
    } : null;
  }

  async advanceSection(input: {
    learnerId: string;
    attemptId: string;
    currentSection: AssessmentSectionCode;
    nextSection: AssessmentSectionCode;
    nextDurationMinutes: number;
    auto?: boolean;
  }): Promise<AssessmentAttemptRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const locked = await client.query<{ timing_state: AssessmentAttemptRecord["timingState"] }>(
        `select timing_state from assessment_attempts
         where id = $1 and learner_id = $2 and status = 'in_progress' and current_section = $3
         for update`,
        [input.attemptId, input.learnerId, input.currentSection]
      );
      const row = locked.rows[0];
      if (!row) { await client.query("rollback"); return null; }
      const now = new Date();
      const endsAt = new Date(now.getTime() + input.nextDurationMinutes * 60_000);
      const timingState = row.timing_state ?? {};
      timingState.sections ??= {};
      const current = timingState.sections[input.currentSection];
      if (current) timingState.sections[input.currentSection] = { ...current, completedAt: now.toISOString(), ...(input.auto ? { auto: true } : {}) };
      timingState.sections[input.nextSection] = { startedAt: now.toISOString(), endsAt: endsAt.toISOString() };
      await client.query(
        `update assessment_attempts set current_section = $4, timing_state = $5::jsonb, updated_at = $6
         where id = $1 and learner_id = $2 and current_section = $3`,
        [input.attemptId, input.learnerId, input.currentSection, input.nextSection, JSON.stringify(timingState), now]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    return this.findAttempt(input.learnerId, input.attemptId);
  }

  async submitAttempt(learnerId: string, attemptId: string, submitReason: AssessmentSubmitReason = "manual"): Promise<AssessmentAttemptRecord | null> {
    return this.submitAssessmentAttempt({ learnerId, attemptId, submitReason });
  }

  async submitAssessmentAttempt(input: {
    learnerId: string;
    attemptId: string;
    requestId?: string;
    submitReason?: AssessmentSubmitReason;
    queueAiScoring?: boolean;
  }): Promise<AssessmentAttemptRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const scope = `assessment.submit:${input.attemptId}`;
      if (input.requestId) {
        const existing = await client.query<{ response: { attemptId: string } }>(
          `select response from idempotency_keys where scope = $1 and key = $2`,
          [scope, input.requestId]
        );
        if (existing.rows[0]) {
          await client.query("commit");
          return this.findAttempt(input.learnerId, input.attemptId);
        }
      }
      const locked = await client.query<{
        status: AssessmentAttemptRecord["status"];
        current_section: AssessmentSectionCode | null;
        timing_state: AssessmentAttemptRecord["timingState"];
      }>(
        `select status, current_section, timing_state from assessment_attempts
         where id = $1 and learner_id = $2
         for update`,
        [input.attemptId, input.learnerId]
      );
      const current = locked.rows[0];
      if (!current) {
        await client.query("rollback");
        return null;
      }
      if (current.status !== "in_progress") {
        await client.query("commit");
        return this.findAttempt(input.learnerId, input.attemptId);
      }
      if (current.current_section !== "speaking") {
        await client.query("rollback");
        return null;
      }
      const reason = input.submitReason ?? "manual";
      const timingState = current.timing_state ?? {};
      if (current.current_section) {
        timingState.sections ??= {};
        const currentTiming = timingState.sections[current.current_section];
        if (currentTiming) timingState.sections[current.current_section] = { ...currentTiming, completedAt: new Date().toISOString(), ...(reason === "timeout" || reason === "violations" ? { auto: true } : {}) };
      }
      await client.query(
        `update assessment_attempts
         set status = 'pending_review', current_section = null, timing_state = $4::jsonb, submitted_at = now(), submit_reason = $3, updated_at = now()
         where id = $1 and learner_id = $2`,
        [input.attemptId, input.learnerId, reason, JSON.stringify(timingState)]
      );
      if (input.queueAiScoring) {
        await client.query(
          `insert into jobs (id, kind, payload, idempotency_key)
           select $3, 'assessment.ai-score-auto', jsonb_build_object(
             'attemptId', $1::text, 'learnerId', u.id::text,
             'organizationId', u.organization_id::text, 'requestId', $1::text
           ), $4
           from users u where u.id = $2
           on conflict (idempotency_key) do nothing`,
          [input.attemptId, input.learnerId, randomUUID(), `assessment-ai-score:${input.attemptId}:${input.attemptId}`]
        );
      }
      if (input.requestId) {
        await client.query(
          `insert into idempotency_keys (scope, key, response) values ($1, $2, $3::jsonb)`,
          [scope, input.requestId, JSON.stringify({ attemptId: input.attemptId })]
        );
      }
      await client.query("commit");
      await withLearnerRewardLock(this.pool, input.learnerId, async (rewardClient) => {
        await rewardClient.query(
          `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
           select $1, $2, 'assessment', 'assessment_attempt', $3, 30, '{}'::jsonb
           where not exists (select 1 from activities where learner_id = $2 and reference_type = 'assessment_attempt' and reference_id = $3)`,
          [randomUUID(), input.learnerId, input.attemptId]
        );
        await syncLearnerRewards(rewardClient, input.learnerId);
      });
      return this.findAttempt(input.learnerId, input.attemptId);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertSectionScore(input: {
    learnerId: string;
    attemptId: string;
    section: AssessmentSectionCode;
    score: number;
    criteria: unknown;
    source: "deterministic" | "ai" | "human";
  }): Promise<boolean> {
    const result = await this.pool.query(
      `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
       select $1, aa.id, $4, $5, $6::jsonb, $7
       from assessment_attempts aa
       where aa.id = $2 and aa.learner_id = $3
         and (aa.status = 'in_progress'
           or ($7 = 'deterministic' and aa.status in ('submitted', 'pending_review', 'approved', 'needs_retry')))
       on conflict (attempt_id, section)
       do update set score = excluded.score, criteria = excluded.criteria, source = excluded.source,
                     created_at = now()
       returning id`,
      [randomUUID(), input.attemptId, input.learnerId, input.section, input.score, JSON.stringify(input.criteria), input.source]
    );
    return Boolean(result.rowCount);
  }

  async saveSuggestedDecision(input: { attemptId: string; learnerId: string; suggestedLevel: CefrLevel; reason: string }): Promise<void> {
    await this.pool.query(
      `insert into assessment_decisions (id, attempt_id, suggested_level, status, reason)
       select $1, aa.id, $4, 'suggested', $5 from assessment_attempts aa
       where aa.id = $2 and aa.learner_id = $3
       on conflict (attempt_id) do update set suggested_level = excluded.suggested_level,
         reason = excluded.reason where assessment_decisions.status = 'suggested'`,
      [randomUUID(), input.attemptId, input.learnerId, input.suggestedLevel, input.reason]
    );
  }

  async getReviewLearner(reviewerId: string, learnerId: string): Promise<AssessmentReviewLearnerView | null> {
    const learnerResult = await this.pool.query<{
      id: string; display_name: string; email: string | null; status: string; created_at: Date;
      cefr: CefrLevel | null; cefr_approved: boolean; profile: unknown;
    }>(
      `select learner.id, learner.display_name, learner.email, learner.status, learner.created_at,
              enrollment.cefr, coalesce(enrollment.cefr_approved, false) as cefr_approved,
              coalesce(lp.profile, '{}'::jsonb) as profile
       from users reviewer
       join users learner on learner.organization_id = reviewer.organization_id
         and learner.id = $2 and learner.role = 'learner' and learner.status = 'active'
       left join lateral (
         select e.cefr, e.cefr_approved
         from enrollments e join programs p on p.id = e.program_id and p.status = 'active'
         where e.learner_id = learner.id order by e.cefr_approved desc, e.enrolled_at desc limit 1
       ) enrollment on true
       left join learner_profiles lp on lp.user_id = learner.id
       where reviewer.id = $1 and reviewer.role in ('operator', 'manager')`,
      [reviewerId, learnerId]
    );
    const learner = learnerResult.rows[0];
    if (!learner) return null;
    const state = operatorProfileState(learner.profile);
    const monthlyGoalValue = profileObject(learner.profile).monthlyGoal;

    const attemptsResult = await this.pool.query<{
      id: string; kind: "placement" | "level_up"; title: string;
      status: AssessmentReviewAttemptSummaryView["status"];
      started_at: Date; submitted_at: Date | null; section_scores: unknown;
      total_score: string | null; suggested_level: CefrLevel | null; approved_level: CefrLevel | null;
    }>(
      `select aa.id, ad.kind, ad.title, aa.status, aa.started_at, aa.submitted_at,
              coalesce(jsonb_object_agg(sc.section, sc.score) filter (where sc.section is not null), '{}'::jsonb) as section_scores,
              sum(sc.score)::text as total_score, decision.suggested_level, decision.approved_level
       from assessment_attempts aa
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id
       join users reviewer on reviewer.id = $1
       join users learner on learner.id = aa.learner_id and learner.organization_id = reviewer.organization_id
         and learner.status = 'active'
       left join assessment_scores sc on sc.attempt_id = aa.id
       left join assessment_decisions decision on decision.attempt_id = aa.id
       where aa.learner_id = $2 and ad.kind in ('placement', 'level_up')
       group by aa.id, ad.kind, ad.title, decision.suggested_level, decision.approved_level
       order by aa.started_at desc`,
      [reviewerId, learnerId]
    );
    const deletionResult = await this.pool.query<{
      id: string; reason: string; status: AssessmentDeletionRequestView["status"];
      requested_by: string; requested_at: Date; decided_by: string | null; decided_at: Date | null; note: string | null;
    }>(
      `select ae.id, coalesce(ae.payload->>'reason', '') as reason,
              coalesce(ae.payload->>'status', 'pending') as status,
              coalesce(ae.payload->>'requestedBy', ae.actor_user_id::text) as requested_by,
              ae.created_at as requested_at,
              ae.payload->>'decidedBy' as decided_by,
              nullif(ae.payload->>'decidedAt', '')::timestamptz as decided_at,
              ae.payload->>'note' as note
       from audit_events ae
       join users actor on actor.id = ae.actor_user_id
       where ae.action = 'learner.deletion_requested' and ae.entity_id = $2
         and actor.organization_id = (select organization_id from users where id = $1)
       order by ae.created_at desc`,
      [reviewerId, learnerId]
    );
    return {
      learner: {
        id: learner.id,
        displayName: learner.display_name,
        email: learner.email,
        status: learner.status,
        createdAt: learner.created_at.toISOString(),
        currentLevel: learner.cefr,
        cefrApproved: learner.cefr_approved,
        pendingLevel: state.pendingLevel ?? null
      },
      profile: publicLearnerProfile(learner.profile),
      monthlyGoal: typeof monthlyGoalValue === "string" && monthlyGoalValue.trim() ? monthlyGoalValue : null,
      levelHistory: state.levelHistory ?? [],
      attempts: attemptsResult.rows.map((attempt) => ({
        id: attempt.id,
        kind: attempt.kind,
        title: attempt.title,
        status: attempt.status,
        startedAt: attempt.started_at.toISOString(),
        submittedAt: attempt.submitted_at?.toISOString() ?? null,
        totalScore: attempt.total_score === null ? null : Number(attempt.total_score),
        sectionScores: Object.fromEntries(Object.entries((attempt.section_scores && typeof attempt.section_scores === "object") ? attempt.section_scores as Record<string, unknown> : {}).map(([key, value]) => [key, Number(value)])),
        suggestedLevel: attempt.suggested_level,
        approvedLevel: attempt.approved_level
      })),
      deletionRequests: deletionResult.rows.map((request) => ({
        id: request.id,
        learnerId,
        learnerName: learner.display_name,
        reason: request.reason,
        status: request.status,
        requestedBy: request.requested_by,
        requestedAt: request.requested_at.toISOString(),
        decidedBy: request.decided_by,
        decidedAt: request.decided_at?.toISOString() ?? null,
        note: request.note
      }))
    };
  }

  async getRescoreContext(reviewerId: string, attemptId: string): Promise<AssessmentRescoreContext | null> {
    const scope = await this.pool.query<{
      learner_id: string;
      blueprint: StoredAssessmentDefinition;
    }>(
      `select aa.learner_id, av.blueprint
       from assessment_attempts aa
       join users learner on learner.id = aa.learner_id and learner.status = 'active'
       join users reviewer on reviewer.id = $1
         and reviewer.role in ('operator', 'manager')
         and reviewer.organization_id = learner.organization_id
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id
       where aa.id = $2 and aa.status = 'pending_review' and ad.kind in ('placement', 'level_up', 'final', 'pass_course')`,
      [reviewerId, attemptId]
    );
    const row = scope.rows[0];
    if (!row) return null;
    const attempt = await this.findAttempt(row.learner_id, attemptId);
    return attempt ? { attempt, definition: row.blueprint } : null;
  }

  async saveAssessmentRescore(input: {
    actorId: string;
    automatic?: boolean;
    attemptId: string;
    requestId: string;
    aiRequestKey: string;
    taskId: string;
    promptVersionId: string;
    output: {
      writingScore: number;
      speakingScore: number | null;
      suggestedLevel?: CefrLevel;
      rationale: string;
      monthlyGoal?: string;
      writingCriteria?: Record<string, unknown>;
      speakingCriteria?: Record<string, unknown>;
    };
    metadata: AiRunMetadataInput;
  }): Promise<"saved" | "duplicate" | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const scope = await client.query<{ organization_id: string; learner_id: string }>(
        `select reviewer.organization_id, aa.learner_id
         from users reviewer
         join assessment_attempts aa on aa.id = $2 and aa.status = 'pending_review'
         join users learner on learner.id = aa.learner_id
           and learner.organization_id = reviewer.organization_id and learner.status = 'active'
         where reviewer.id = $1 and (
           ($3 and reviewer.id = aa.learner_id) or (not $3 and reviewer.role in ('operator', 'manager'))
         )
         for update of aa`,
        [input.actorId, input.attemptId, Boolean(input.automatic)]
      );
      const person = scope.rows[0];
      if (!person) {
        await client.query("rollback");
        return null;
      }
      const aiRunId = randomUUID();
      const inserted = await insertAiRun(client, {
        id: aiRunId,
        learnerId: input.actorId,
        requestId: input.aiRequestKey,
        taskId: input.taskId,
        promptVersionId: input.promptVersionId,
        output: input.output,
        metadata: input.metadata
      });
      if (!inserted) {
        await client.query("commit");
        return "duplicate";
      }
      await client.query(
        `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
         values ($1, $2, 'writing', $3, $4::jsonb, 'ai')
         on conflict (attempt_id, section)
         do update set score = excluded.score, criteria = excluded.criteria, source = 'ai', created_at = now()
         where not $5 or assessment_scores.source <> 'human'`,
        [randomUUID(), input.attemptId, input.output.writingScore, JSON.stringify({
          rationale: input.output.rationale,
          monthlyGoal: input.output.monthlyGoal,
          ...input.output.writingCriteria
        }), Boolean(input.automatic || input.output.writingCriteria)]
      );
      if (input.output.speakingScore !== null) await client.query(
        `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
         values ($1, $2, 'speaking', $3, $4::jsonb, 'ai')
         on conflict (attempt_id, section)
         do update set score = excluded.score, criteria = excluded.criteria, source = 'ai', created_at = now()
         where not $5 or assessment_scores.source <> 'human'`,
        [randomUUID(), input.attemptId, input.output.speakingScore, JSON.stringify({
          rationale: input.output.rationale,
          evidencePolicy: "Pronunciation is scored only when audio evidence exists.",
          ...input.output.speakingCriteria
        }), Boolean(input.automatic || input.output.speakingCriteria)]
      );
      if (input.output.suggestedLevel) await client.query(
        `insert into assessment_decisions
           (id, attempt_id, suggested_level, approved_level, status, reason, decided_by, decided_at)
         values ($1, $2, $3, null, 'suggested', $4, null, null)
         on conflict (attempt_id) do update
           set suggested_level = excluded.suggested_level, reason = excluded.reason
         where assessment_decisions.status = 'suggested'`,
        [randomUUID(), input.attemptId, input.output.suggestedLevel, input.output.rationale]
      );
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, $7, 'assessment_attempt', $4, $5::jsonb, $6)`,
        [
          randomUUID(),
          person.organization_id,
          input.actorId,
          input.attemptId,
          JSON.stringify({
            requestId: input.requestId,
            suggestedLevel: input.output.suggestedLevel,
            writingScore: input.output.writingScore,
            speakingScore: input.output.speakingScore,
            rationale: input.output.rationale,
            monthlyGoal: input.output.monthlyGoal,
            aiRunId
          }),
          randomUUID(),
          input.automatic ? "assessment.ai_scored" : "assessment.rescored"
        ]
      );
      await client.query("commit");
      return "saved";
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveManualAssessmentScore(input: ManualAssessmentScoreInput & {
    actorId: string;
    attemptId: string;
  }): Promise<boolean | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const scope = await client.query<{ organization_id: string; blueprint: StoredAssessmentDefinition }>(
        `select reviewer.organization_id, av.blueprint
         from users reviewer
         join assessment_attempts aa on aa.id = $2 and aa.status in ('pending_review', 'submitted')
         join assessment_versions av on av.id = aa.assessment_version_id
         join users learner on learner.id = aa.learner_id
           and learner.organization_id = reviewer.organization_id and learner.status = 'active'
         where reviewer.id = $1 and reviewer.role in ('operator', 'manager')
         for update of aa`,
        [input.actorId, input.attemptId]
      );
      const person = scope.rows[0];
      if (!person) {
        await client.query("rollback");
        return null;
      }
      const monthly = person.blueprint.kind === "final";
      const rubric = monthly || person.blueprint.kind === "pass-course" ? assessmentProductiveRubric(person.blueprint) : [];
      const rubricScores = input.rubricScores ?? [];
      const rubricByCode = new Map(rubric.map(criterion => [criterion.code, criterion]));
      const submittedScores = new Map(rubricScores.map(criterion => [criterion.code, criterion.score]));
      if ((monthly && (!rubric.length || rubricScores.length !== rubric.length || submittedScores.size !== rubric.length
        || rubricScores.some(({ code, score }) => score > (rubricByCode.get(code)?.maxScore ?? -1))))
        || (!monthly && rubricScores.length)) {
        await client.query("rollback");
        return null;
      }
      const passCourse = person.blueprint.kind === "pass-course";
      const speakingEvidence = new Map<string, ManualAssessmentScoreInput["speakingTasks"][number]["evidenceType"]>();
      if (passCourse || (monthly && person.blueprint.monthlyExam)) {
        const evidence = await client.query<{ task_key: string; evidence_type: string | null; artifact_key: string | null }>(
          `select task_key, response->>'evidenceType' as evidence_type, response->>'artifactKey' as artifact_key
           from assessment_responses where attempt_id = $1 and section = 'speaking'`, [input.attemptId]
        );
        for (const { task_key, evidence_type, artifact_key } of evidence.rows) {
          if (evidence_type === "audio" && artifact_key) speakingEvidence.set(task_key, "audio");
          if (evidence_type === "transcript" || evidence_type === "typed_proxy" || evidence_type === "technical_failure") {
            speakingEvidence.set(task_key, evidence_type);
          }
        }
      }
      if (monthly && person.blueprint.monthlyExam
        && (((submittedScores.get("S1") ?? 0) > 0 && speakingEvidence.get("SA") !== "audio")
          || ((submittedScores.get("S5") ?? 0) > 0 && speakingEvidence.get("SB") !== "audio"))) {
        await client.query("rollback");
        return null;
      }
      const sectionRubric = (skill: "writing" | "speaking") => rubricScores.filter(item => rubricByCode.get(item.code)?.skill === skill);
      const monthlyWriting = sectionRubric("writing");
      const monthlySpeaking = sectionRubric("speaking");
      const writingScore = roundAssessmentScore(monthly ? monthlyWriting.reduce((total, item) => total + item.score, 0) : input.writingTasks.reduce((total, task) => {
        const raw = task.criteria.taskCompletion + task.criteria.organization + task.criteria.vocabulary + task.criteria.grammar + task.criteria.workplaceRegister;
        return total + raw / 20 * (rubricByCode.get(task.taskKey)?.maxScore ?? (task.taskKey === "W1" ? 7 : 13));
      }, 0));
      const speakingScores = input.speakingTasks.map((task) => task.criteria === null ? null : (
        task.criteria.taskCompletionRelevance + task.criteria.grammarVocabulary + task.criteria.coherenceClarity + task.criteria.interactionProfessionalRegister
      ) / 20 * (rubricByCode.get(task.taskKey)?.maxScore ?? 5));
      if (speakingScores.some((score) => score === null)) {
        await client.query("rollback");
        return null;
      }
      const speakingScore = roundAssessmentScore(monthly ? monthlySpeaking.reduce((total, item) => total + item.score, 0) : speakingScores.reduce<number>((total, score) => total + Number(score), 0));
      const scoredSpeakingTasks = input.speakingTasks.map((task, index) => ({
        ...task,
        evidenceType: passCourse ? speakingEvidence.get(task.taskKey) ?? "skipped" : task.evidenceType,
        taskScore: Number(speakingScores[index]),
        completionStatus: task.criteria === null ? "pending_evidence" : "scored"
      }));
      for (const [section, score, sectionCriteria] of [
        ["writing", writingScore, { ...(monthly ? { rubricScores: monthlyWriting } : { tasks: input.writingTasks }), comment: input.comment }],
        ["speaking", speakingScore, { ...(monthly ? { rubricScores: monthlySpeaking } : { tasks: scoredSpeakingTasks }), totalScore: speakingScore, completionStatus: "scored", notes: input.comment, comment: input.comment }]
      ] as const) {
        await client.query(
          `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
           values ($1, $2, $3, $4, $5::jsonb, 'human')
           on conflict (attempt_id, section)
           do update set score = excluded.score, criteria = excluded.criteria, source = 'human', created_at = now()`,
          [randomUUID(), input.attemptId, section, score, JSON.stringify(sectionCriteria)]
        );
      }
      const totals = await client.query<{ total_score: string; section_count: string }>(
        `select coalesce(sum(score), 0)::text as total_score, count(distinct section)::text as section_count
         from assessment_scores where attempt_id = $1`,
        [input.attemptId]
      );
      const totalScore = roundAssessmentScore(Number(totals.rows[0]?.total_score ?? 0));
      const suggestedLevel = !monthly && person.blueprint.kind !== "pass-course" && Number(totals.rows[0]?.section_count ?? 0) === 4
        ? reviewCefrFromScore(totalScore, 100)
        : null;
      if (suggestedLevel) {
        await client.query(
          `insert into assessment_decisions (id, attempt_id, suggested_level, status, reason)
           values ($1, $2, $3, 'suggested', $4)
           on conflict (attempt_id) do update set suggested_level = excluded.suggested_level,
             status = case when assessment_decisions.status = 'approved' then assessment_decisions.status else 'suggested' end,
             reason = case when assessment_decisions.status = 'approved' then assessment_decisions.reason else excluded.reason end`,
          [randomUUID(), input.attemptId, suggestedLevel, `Tổng điểm chấm tay ${formatDisplayScore(totalScore)}/100.`]
        );
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'assessment.manual_score', 'assessment_attempt', $4, $5::jsonb, $6)`,
        [randomUUID(), person.organization_id, input.actorId, input.attemptId, JSON.stringify({ writingScore, speakingScore, totalScore, suggestedLevel }), randomUUID()]
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getReviewAttempt(reviewerId: string, attemptId: string): Promise<AssessmentReviewAttemptDetailView | null> {
    const scope = await this.pool.query<{
      learner_id: string; learner_name: string; kind: "placement" | "level_up" | "final" | "pass_course"; title: string;
      approved_level: CefrLevel | null; suggested_level: CefrLevel | null;
      decision_status: string | null; decision_reason: string | null; decided_by: string | null; decided_at: Date | null;
      blueprint: StoredAssessmentDefinition;
    }>(
      `select aa.learner_id, learner.display_name as learner_name, ad.kind, ad.title, av.blueprint,
              decision.approved_level, decision.suggested_level, decision.status as decision_status,
              decision.reason as decision_reason, decision.decided_by, decision.decided_at
       from assessment_attempts aa
       join users learner on learner.id = aa.learner_id and learner.status = 'active'
       join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id
       left join assessment_decisions decision on decision.attempt_id = aa.id
       where aa.id = $2 and ad.kind in ('placement', 'level_up', 'final', 'pass_course')`,
      [reviewerId, attemptId]
    );
    const row = scope.rows[0];
    if (!row) return null;
    const attempt = await this.findAttempt(row.learner_id, attemptId);
    if (!attempt) return null;
    const scoreRows = await this.pool.query<{
      section: AssessmentSectionCode; score: string; source: "deterministic" | "ai" | "human"; criteria: unknown;
    }>(
      `select section, score::text, source, criteria from assessment_scores where attempt_id = $1 order by section`,
      [attemptId]
    );
    const aiScoringRows = await this.pool.query<{
      state: "queued" | "running" | "succeeded" | "failed" | "dead";
      request_id: string;
      last_error: string | null;
      updated_at: Date;
    }>(
      `select j.state, j.payload->>'requestId' as request_id, j.last_error, j.updated_at
       from jobs j
       join users reviewer on reviewer.id = $1
       where j.kind in ('assessment.ai-score', 'assessment.ai-score-auto')
         and j.payload->>'attemptId' = $2
         and (j.payload->>'organizationId')::uuid = reviewer.organization_id
       order by j.updated_at desc limit 1`,
      [reviewerId, attemptId]
    );
    const activityRows = await this.pool.query<{
      at: Date;
      source: string;
      detail: unknown;
    }>(
      `select occurred_at as at, 'submitted' as source, evidence as detail
       from activities
       where reference_type = 'assessment_attempt' and reference_id = $1
       union all
       select created_at as at, action as source, payload as detail
       from audit_events
       where entity_type = 'assessment_attempt' and entity_id = $1
       order by at`,
      [attemptId]
    );
    const sections = normalizeLevelFormQuestionPrompts(row.blueprint).sections ?? [];
    const prompts = new Map<string, { prompt?: string; title?: string }>();
    const taskPrompts = sections.flatMap((section) => section.groups.flatMap((group) => group.tasks.map((task) => ({
      section: section.code,
      taskKey: task.key,
      ...(group.title ? { title: group.title } : {}),
      prompt: task.prompt
    }))));
    for (const section of sections) {
      for (const group of section.groups ?? []) {
        for (const task of group.tasks ?? []) prompts.set(`${section.code}:${task.key}`, {
          prompt: task.prompt,
          ...(task.title ? { title: task.title } : {})
        });
      }
    }
    const decisionStatus = row.decision_status === "approved" || row.decision_status === "retry"
      ? (row.decision_status === "retry" ? "needs_retry" : "approved") : null;
    const sectionScores = Object.values(attempt.scores);
    const scoreBySection = new Map(scoreRows.rows.map((score) => [score.section, score]));
    const sectionLabels: Record<AssessmentSectionCode, string> = { listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" };
    const sectionDefinitions = new Map(sections.map(section => [section.code, section]));
    const sectionGroups = (section: AssessmentSectionCode) => (sectionDefinitions.get(section)?.groups ?? []).map(group => ({
      key: group.key,
      label: group.title,
      instruction: group.instruction,
      ...(group.stimulus ? { stimulus: group.stimulus } : {}),
      ...(group.maxPlays == null ? {} : { maxPlays: group.maxPlays }),
      tasks: group.tasks.map(task => ({
        taskKey: task.key,
        ...(task.title ? { title: task.title } : {}),
        prompt: task.prompt,
        answer: attempt.responses.find(response => response.section === section && response.taskKey === task.key)?.value ?? null,
        ...(task.maxScore == null ? {} : { maxScore: task.maxScore }),
        ...(task.minWords == null ? {} : { minWords: task.minWords }),
        ...(task.maxWords == null ? {} : { maxWords: task.maxWords }),
        ...(task.options ? { options: task.options } : {}),
        ...(task.correctAnswer == null ? {} : { correctAnswer: task.correctAnswer })
      }))
    }));
    const reviewedSections = (["listening", "reading", "writing", "speaking"] as const).map((section) => {
      const score = scoreBySection.get(section);
      const definition = sectionDefinitions.get(section);
      const criteria = score ? profileObject(score.criteria) : {};
      const sectionScore = score ? Number(score.score) : null;
      return {
        section,
        label: sectionLabels[section],
        maxScore: definition?.maxScore ?? 0,
        durationMinutes: definition?.durationMinutes ?? 0,
        actualSeconds: actualSectionSeconds(attempt.timingState, section),
        score: sectionScore,
        cefr: reviewCefrFromScore(sectionScore, definition?.maxScore ?? 0),
        source: score?.source ?? null,
        criteria,
        comment: typeof criteria.comment === "string" ? criteria.comment : typeof criteria.note === "string" ? criteria.note : null,
        state: score ? "scored" as const : "not_scored" as const,
        groups: sectionGroups(section)
      };
    });
    const completedTimes = reviewedSections.map(section => section.actualSeconds);
    const totalTimeSeconds = completedTimes.every((seconds): seconds is number => seconds !== null)
      ? completedTimes.reduce((sum, seconds) => sum + seconds, 0) : null;
    const allSectionsScored = reviewedSections.every(section => section.score !== null);
    const totalScore = allSectionsScored
      ? sectionScores.reduce((total, score) => total + Number(score ?? 0), 0)
      : null;
    return {
      id: attempt.id,
      kind: row.kind,
      title: row.title,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      totalScore,
      overallCefr: allSectionsScored ? reviewCefrFromScore(totalScore, row.blueprint.totalScore) : null,
      totalTimeSeconds,
      totalTimeLimitMinutes: row.blueprint.totalMinutes,
      sectionScores: attempt.scores,
      suggestedLevel: row.suggested_level,
      approvedLevel: row.approved_level,
      learnerId: row.learner_id,
      learnerName: row.learner_name,
      ...(row.kind === "final" || row.kind === "pass_course" ? { productiveRubric: assessmentProductiveRubric(row.blueprint) } : {}),
      taskPrompts,
      responses: attempt.responses.map((response) => ({
        section: response.section,
        taskKey: response.taskKey,
        value: response.value,
        evidenceType: response.evidenceType,
        ...(response.artifactKey ? { artifactKey: response.artifactKey } : {}),
        savedAt: response.savedAt.toISOString(),
        ...prompts.get(`${response.section}:${response.taskKey}`)
      })),
      scores: scoreRows.rows.map((score) => ({
        section: score.section,
        score: Number(score.score),
        source: score.source,
        criteria: profileObject(score.criteria)
      })),
      aiScoring: aiScoringRows.rows[0] ? {
        status: aiScoringRows.rows[0].state === "dead" ? "failed" : aiScoringRows.rows[0].state,
        requestId: aiScoringRows.rows[0].request_id,
        errorCode: aiScoringRows.rows[0].last_error,
        updatedAt: aiScoringRows.rows[0].updated_at.toISOString()
      } : null,
      sections: reviewedSections,
      activity: activityRows.rows.map((event) => {
        const label = event.source === "submitted" ? "Đã nộp bài"
          : event.source === "assessment.rescored" ? "Đã chấm lại bằng AI"
            : event.source === "assessment.manual_score" ? "Đã lưu điểm chấm tay"
              : event.source === "assessment.decision" ? "Người vận hành đã ra quyết định"
                : event.source === "assessment.violation" ? "Đã ghi nhận cảnh báo" : "Hoạt động xử lý";
        const detail = event.source === "assessment.manual_score" ? "Đã cập nhật điểm Viết và Nói bằng rubric thủ công."
          : event.source === "assessment.rescored" ? "Đã cập nhật kết quả chấm AI."
            : event.source === "assessment.decision" ? "Đã cập nhật quyết định duyệt mức." : undefined;
        return { at: event.at.toISOString(), label, ...(detail ? { detail } : {}) };
      }),
      integrityEvents: attempt.integrityEvents,
      decision: decisionStatus ? {
        attemptId,
        status: decisionStatus,
        approvedLevel: row.approved_level,
        reason: row.decision_reason === "Season challenge passed; pending operator approval."
          ? "Đã đạt thử thách Season, chờ Người vận hành duyệt."
          : row.decision_reason ?? "",
        decidedBy: row.decided_by ?? "",
        decidedAt: row.decided_at?.toISOString() ?? attempt.updatedAt.toISOString()
      } : null
    };
  }

  async beginAssessmentAiScoring(actorId: string, attemptId: string, requestId: string): Promise<{ started: boolean } | null> {
    const result = await this.pool.query<{ id: string }>(
      `insert into jobs (id, kind, payload, state, max_attempts, idempotency_key)
       select $4, 'assessment.ai-score', jsonb_build_object(
         'attemptId', aa.id::text,
         'organizationId', learner.organization_id::text,
         'requestId', $3::text
       ), 'running', 1, $5
       from assessment_attempts aa
       join users learner on learner.id = aa.learner_id and learner.status = 'active'
       join users actor on actor.id = $1 and actor.organization_id = learner.organization_id
       where aa.id = $2 and aa.status in ('in_progress', 'pending_review')
       on conflict (idempotency_key) do nothing
       returning id`,
      [actorId, attemptId, requestId, randomUUID(), `assessment-ai-score:${attemptId}:${requestId}`]
    );
    if (result.rowCount) return { started: true };
    const existing = await this.pool.query<{ id: string }>(
      `select j.id from jobs j
       join users actor on actor.id = $1
       where j.idempotency_key = $2
         and (j.payload->>'organizationId')::uuid = actor.organization_id`,
      [actorId, `assessment-ai-score:${attemptId}:${requestId}`]
    );
    return existing.rowCount ? { started: false } : null;
  }

  async completeAssessmentAiScoring(actorId: string, attemptId: string, requestId: string): Promise<boolean> {
    const result = await this.pool.query(
      `update jobs j set state = 'succeeded', last_error = null, updated_at = now()
       from users actor
       where actor.id = $1 and j.idempotency_key = $2
         and (j.payload->>'organizationId')::uuid = actor.organization_id`,
      [actorId, `assessment-ai-score:${attemptId}:${requestId}`]
    );
    return Boolean(result.rowCount);
  }

  async failAssessmentAiScoring(actorId: string, attemptId: string, requestId: string, errorCode: string): Promise<boolean> {
    const result = await this.pool.query(
      `update jobs j set state = 'failed', last_error = $3, updated_at = now()
       from users actor
       where actor.id = $1 and j.idempotency_key = $2
         and (j.payload->>'organizationId')::uuid = actor.organization_id`,
      [actorId, `assessment-ai-score:${attemptId}:${requestId}`, errorCode]
    );
    return Boolean(result.rowCount);
  }

  async getReviewChallenge(reviewerId: string, attemptId: string): Promise<AssessmentReviewChallengeView | null> {
    const sessionResult = await this.pool.query<{
      session_id: string; status: "active" | "completed"; target_level: CefrLevel;
    }>(
      `select cs.id as session_id, cs.status,
              coalesce(nullif(cs.scenario->>'targetLevel', ''), nullif(av.blueprint->>'targetLevel', ''), decision.suggested_level) as target_level
       from coach_sessions cs
       join assessment_attempts aa on aa.id = $2
       join users learner on learner.id = aa.learner_id and learner.status = 'active'
       join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
       join assessment_versions av on av.id = aa.assessment_version_id
       left join assessment_decisions decision on decision.attempt_id = aa.id
       where cs.learner_id = aa.learner_id
         and cs.scenario->>'kind' = 'level_up'
         and cs.scenario->>'assessmentAttemptId' = aa.id::text
       order by cs.started_at desc limit 1`,
      [reviewerId, attemptId]
    );
    const session = sessionResult.rows[0];
    if (!session || !session.target_level) return null;
    const turnsResult = await this.pool.query<{
      id: string; turn_number: number; speaker: "learner" | "ai"; content: unknown;
      feedback: Record<string, unknown> | null; created_at: Date;
    }>(
      `select id, turn_number, speaker, content, feedback, created_at
       from coach_turns where session_id = $1 order by turn_number`,
      [session.session_id]
    );
    const learnerTurns = turnsResult.rows.filter((turn) => turn.speaker === "learner");
    const countableTurns = learnerTurns.filter((turn) => {
      const evaluation = profileObject(turn.feedback?.evaluation);
      return typeof evaluation.countsTowardGoal === "boolean" ? evaluation.countsTowardGoal : turn.feedback?.relevant !== false;
    });
    const rubricValues = countableTurns.flatMap((turn) => {
      const rubric = profileObject(turn.feedback?.rubric);
      const values = [rubric.meaning, rubric.vocabulary, rubric.grammar].map((value) => coachRubricCriterion(value).score);
      return values.length ? [values.reduce((sum, value) => sum + value, 0) / values.length] : [];
    });
    const offTopic = learnerTurns.filter((turn) => {
      const evaluation = profileObject(turn.feedback?.evaluation);
      return evaluation.status === "off_topic" || (evaluation.status === undefined && turn.feedback?.relevant === false);
    }).length;
    const average = rubricValues.length
      ? Math.round(rubricValues.reduce((sum, value) => sum + value, 0) / rubricValues.length * 10) / 10
      : 0;
    const complete = countableTurns.length >= 6;
    return {
      sessionId: session.session_id,
      assessmentAttemptId: attemptId,
      targetLevel: session.target_level,
      status: session.status === "completed" ? "completed" : "active",
      progress: { completedTurns: countableTurns.length, requiredTurns: 6, average, offTopic, complete, passed: complete && average >= 3.5 && offTopic <= 1 },
      turns: turnsResult.rows.map((turn) => {
        const content = profileObject(turn.content);
        return {
          id: turn.id,
          turnNumber: turn.turn_number,
          speaker: turn.speaker === "ai" ? "coach" : "learner",
          text: typeof content.text === "string" ? content.text : typeof content.value === "string" ? content.value : "",
          coachText: typeof turn.feedback?.coachText === "string" ? turn.feedback.coachText : null,
          feedback: turn.feedback,
          createdAt: turn.created_at.toISOString()
        };
      })
    };
  }

  /** `outer` runs the change inside the caller's transaction (e.g. an accepted level appeal). */
  async changeLearnerLevel(actorId: string, learnerId: string, input: AssessmentLevelChangeInput, outer?: PoolClient): Promise<AssessmentLevelChangeView | null> {
    const client = outer ?? await this.pool.connect();
    try {
      if (!outer) await client.query("begin");
      const identity = await client.query<{ organization_id: string; display_name: string }>(
        `select learner.organization_id, learner.display_name
         from users actor join users learner on learner.organization_id = actor.organization_id
           and learner.id = $2 and learner.role = 'learner' and learner.status = 'active'
         where actor.id = $1 and actor.role in ('operator', 'manager')`,
        [actorId, learnerId]
      );
      const person = identity.rows[0];
      if (!person) { if (!outer) await client.query("rollback"); return null; }
      const enrollmentResult = await client.query<{ id: string; program_id: string; cefr: CefrLevel | null; cefr_approved: boolean }>(
        `select e.id, e.program_id, e.cefr, e.cefr_approved
         from enrollments e join programs p on p.id = e.program_id and p.status = 'active'
         where e.learner_id = $1 and p.organization_id = $2 order by e.enrolled_at desc limit 1 for update`,
        [learnerId, person.organization_id]
      );
      const enrollment = enrollmentResult.rows[0];
      const currentLevel = enrollment?.cefr ?? null;
      // A lower-level recommendation may intentionally reaffirm the current
      // floor (for example A1 after a pending A2 recommendation).  Reject only
      // upward recommendations; equal-level recommendations remain auditable
      // and clear the pending target in the same way as the prototype flow.
      if (input.mode === "recommend_lower" && (currentLevel === null || cefrIndex(input.targetLevel) > cefrIndex(currentLevel))) {
        throw new Error("ASSESSMENT_LEVEL_INVALID");
      }
      const program = enrollment ?? (await client.query<{ id: string }>(
        `select id from programs where organization_id = $1 and status = 'active' order by created_at limit 1`, [person.organization_id]
      )).rows[0];
      if (!program) throw new Error("ASSESSMENT_PROGRAM_NOT_FOUND");
      const profileResult = await client.query<{ profile: unknown }>(
        "select profile from learner_profiles where user_id = $1 for update", [learnerId]
      );
      const profile = profileObject(profileResult.rows[0]?.profile);
      const state = operatorProfileState(profile);
      const now = new Date();
      let effectiveAt = now.toISOString();
      let nextState: OperatorProfileState = { ...state };
      if (input.mode === "direct") {
        if (enrollment) {
          await client.query("update enrollments set cefr = $2, cefr_approved = true where id = $1", [enrollment.id, input.targetLevel]);
        } else {
          await client.query(
            "insert into enrollments (id, program_id, learner_id, cefr, cefr_approved) values ($1, $2, $3, $4, true)",
            [randomUUID(), program.id, learnerId, input.targetLevel]
          );
        }
        nextState = {
          pendingLevel: undefined,
          levelHistory: [...(state.levelHistory ?? []), {
            from: currentLevel, to: input.targetLevel, changedAt: effectiveAt, mode: input.mode,
            reason: input.reason, evidence: input.evidence, changedBy: actorId
          }]
        };
      } else {
        effectiveAt = nextMondayIso();
        nextState = {
          ...state,
          pendingLevel: { targetLevel: input.targetLevel, effectiveAt, mode: input.mode, reason: input.reason }
        };
        if (!enrollment) {
          await client.query(
            "insert into enrollments (id, program_id, learner_id, cefr, cefr_approved) values ($1, $2, $3, null, false)",
            [randomUUID(), program.id, learnerId]
          );
        }
      }
      const updatedProfile = { ...profile, _operator: nextState };
      if (profileResult.rows[0]) {
        await client.query(
          "update learner_profiles set profile = $2::jsonb, version = version + 1, updated_at = now() where user_id = $1",
          [learnerId, JSON.stringify(updatedProfile)]
        );
      } else {
        await client.query(
          "insert into learner_profiles (user_id, profile, version) values ($1, $2::jsonb, 1)",
          [learnerId, JSON.stringify(updatedProfile)]
        );
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'assessment.learner.level_changed', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), person.organization_id, actorId, learnerId, JSON.stringify({ ...input, previousLevel: currentLevel, effectiveAt }), randomUUID()]
      );
      if (!outer) await client.query("commit");
      return {
        ...input,
        learnerId,
        previousLevel: currentLevel,
        effectiveAt,
        changedBy: actorId,
        changedAt: now.toISOString()
      };
    } catch (error) {
      if (!outer) await client.query("rollback");
      throw error;
    } finally { if (!outer) (client as PoolClient).release(); }
  }

  /**
   * Staff exception: Operator/Manager of the learner's organisation lets the learner take the
   * next-level test now. Re-granting supersedes the open grant; every change is audited.
   */
  async setLevelUpOverride(actorId: string, learnerId: string, input: { allowed: boolean; reason: string }): Promise<AssessmentLevelUpOverrideView | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const identity = await client.query<{ organization_id: string; cefr: CefrLevel | null }>(
        `select learner.organization_id, enrollment.cefr
         from users actor join users learner on learner.organization_id = actor.organization_id
           and learner.id = $2 and learner.role = 'learner' and learner.status = 'active'
         left join lateral (
           select e.cefr from enrollments e join programs p on p.id = e.program_id and p.status = 'active'
           where e.learner_id = learner.id and e.cefr_approved = true order by e.enrolled_at desc limit 1
         ) enrollment on true
         where actor.id = $1 and actor.role in ('operator', 'manager') and actor.status = 'active'
         for update of learner`,
        [actorId, learnerId]
      );
      const person = identity.rows[0];
      if (!person) { await client.query("rollback"); return null; }
      if (!person.cefr) throw new Error("LEVEL_UP_OVERRIDE_NOT_APPROVED");
      const currentLevel = person.cefr;
      const open = await client.query<{ id: string; target_cefr: CefrLevel }>(
        `select o.id, o.target_cefr from level_up_overrides o
         where o.learner_id = $1 and o.ended_at is null for update`,
        [learnerId]
      );
      const previous = open.rows[0];
      let override: AssessmentLevelUpOverrideView["override"] = null;
      if (input.allowed) {
        if (currentLevel === "C1") throw new Error("LEVEL_UP_OVERRIDE_TOP_LEVEL");
        const targetLevel = nextCefr(currentLevel);
        if (!targetLevel) throw new Error("LEVEL_UP_OVERRIDE_TOP_LEVEL");
        if (previous) {
          await client.query(
            `update level_up_overrides set ended_at = now(), ended_by = $2, end_reason = 'superseded' where id = $1`,
            [previous.id, actorId]
          );
        }
        const granted = await client.query<{ granted_at: Date; granted_by_name: string | null }>(
          `insert into level_up_overrides (id, organization_id, learner_id, from_cefr, target_cefr, reason, granted_by)
           values ($1, $2, $3, $4, $5, $6, $7)
           returning granted_at, (select display_name from users where id = $7) as granted_by_name`,
          [randomUUID(), person.organization_id, learnerId, currentLevel, targetLevel, input.reason, actorId]
        );
        override = { targetLevel, reason: input.reason, grantedBy: granted.rows[0]?.granted_by_name ?? null, grantedAt: granted.rows[0]!.granted_at.toISOString() };
      } else {
        if (!previous) throw new Error("LEVEL_UP_OVERRIDE_NOT_FOUND");
        await client.query(
          `update level_up_overrides set ended_at = now(), ended_by = $2, end_reason = 'revoked', end_note = $3 where id = $1`,
          [previous.id, actorId, input.reason]
        );
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, $4, 'user', $5, $6::jsonb, $7)`,
        [randomUUID(), person.organization_id, actorId,
          input.allowed ? "assessment.learner.level_up_override_granted" : "assessment.learner.level_up_override_revoked",
          learnerId, JSON.stringify({ currentLevel, targetLevel: override?.targetLevel ?? previous?.target_cefr ?? null, reason: input.reason }), randomUUID()]
      );
      await client.query("commit");
      return { learnerId, currentLevel, override };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  /**
   * An accepted placement / level appeal moves the learner to the level they proposed, as a new joiner from the
   * approval date (the enrollment trigger restarts `cefr_started_on`, so the 75% month rule applies).
   * Product rule: biên bản 30/10 mục 11 & 6.
   */
  async applyAcceptedAppealLevel(client: PoolClient, actorId: string, appealId: string, resolution: string): Promise<void> {
    const appeal = await client.query<{ learner_id: string; proposed_level: CefrLevel | null; kind: string; current: CefrLevel | null }>(
      `select a.learner_id, a.proposed_level, d.kind,
              (select e.cefr from enrollments e where e.learner_id = a.learner_id order by e.enrolled_at desc limit 1) as current
       from appeals a join assessment_attempts aa on aa.id = a.attempt_id
       join assessment_versions v on v.id = aa.assessment_version_id join assessment_definitions d on d.id = v.definition_id
       where a.id = $1 and a.status = 'accepted'`,
      [appealId]
    );
    const row = appeal.rows[0];
    // Only tests that set a level (placement, level-up); the monthly final and Pass Course appeals change scores.
    if (!row?.proposed_level || !["placement", "level_up"].includes(row.kind) || row.proposed_level === row.current) return;
    await this.changeLearnerLevel(actorId, row.learner_id, {
      mode: "direct", targetLevel: row.proposed_level,
      reason: `Kháng nghị bài kiểm tra được duyệt: ${resolution}`.slice(0, 2_000), evidence: `appeal:${appealId}`
    }, client);
  }

  async updateLearnerMonthlyGoal(actorId: string, learnerId: string, monthlyGoal: string): Promise<AssessmentMonthlyGoalView | null> {
    const identity = await this.pool.query<{ organization_id: string }>(
      `select learner.organization_id from users actor
       join users learner on learner.organization_id = actor.organization_id and learner.id = $2
         and learner.role = 'learner' and learner.status = 'active'
       where actor.id = $1 and actor.role in ('operator', 'manager')`, [actorId, learnerId]
    );
    const organizationId = identity.rows[0]?.organization_id;
    if (!organizationId) return null;
    const now = new Date();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const profileResult = await client.query<{ profile: unknown }>("select profile from learner_profiles where user_id = $1 for update", [learnerId]);
      const profile = profileObject(profileResult.rows[0]?.profile);
      const updated = { ...profile, monthlyGoal };
      if (profileResult.rows[0]) {
        await client.query("update learner_profiles set profile = $2::jsonb, version = version + 1, updated_at = $3 where user_id = $1", [learnerId, JSON.stringify(updated), now]);
      } else {
        await client.query("insert into learner_profiles (user_id, profile, version) values ($1, $2::jsonb, 1)", [learnerId, JSON.stringify(updated)]);
      }
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'assessment.learner.monthly_goal_updated', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, actorId, learnerId, JSON.stringify({ monthlyGoal }), randomUUID()]
      );
      await client.query("commit");
      return { learnerId, monthlyGoal, updatedBy: actorId, updatedAt: now.toISOString() };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async listOwnDeletionRequests(actorId: string): Promise<AssessmentDeletionRequestView[]> {
    const result = await this.pool.query<{ organization_id: string }>(
      "select organization_id from users where id = $1 and role = 'operator' and status = 'active'", [actorId]
    );
    const organizationId = result.rows[0]?.organization_id;
    return organizationId ? listDeletionRequests(this.pool, organizationId, actorId) : [];
  }

  async requestLearnerDeletion(actorId: string, learnerId: string, reason: string): Promise<AssessmentDeletionRequestView | null> {
    const identity = await this.pool.query<{ organization_id: string; display_name: string }>(
      `select learner.organization_id, learner.display_name from users actor
       join users learner on learner.organization_id = actor.organization_id and learner.id = $2
         and learner.role = 'learner' and learner.status = 'active'
       where actor.id = $1 and actor.role in ('operator', 'manager')`, [actorId, learnerId]
    );
    const person = identity.rows[0];
    if (!person) return null;
    const existing = await this.pool.query<{
      id: string; reason: string; requested_by: string; created_at: Date;
    }>(
      `select id, coalesce(payload->>'reason', '') as reason,
              coalesce(payload->>'requestedBy', actor_user_id::text) as requested_by, created_at
       from audit_events where action = 'learner.deletion_requested' and entity_id = $1
         and payload->>'status' = 'pending' order by created_at desc limit 1`, [learnerId]
    );
    const row = existing.rows[0];
    if (row) return { id: row.id, learnerId, learnerName: person.display_name, reason: row.reason, status: "pending", requestedBy: row.requested_by, requestedAt: row.created_at.toISOString() };
    const id = randomUUID();
    const createdAt = new Date();
    await this.pool.query(
      `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
       values ($1, $2, $3, 'learner.deletion_requested', 'user', $4, $5::jsonb, $6)`,
      [id, person.organization_id, actorId, learnerId, JSON.stringify({ status: "pending", reason, requestedBy: actorId }), randomUUID()]
    );
    return { id, learnerId, learnerName: person.display_name, reason, status: "pending", requestedBy: actorId, requestedAt: createdAt.toISOString() };
  }

  async listPending(reviewerId: string): Promise<AssessmentReviewQueueRecord[]> {
    const result = await this.pool.query<{
      attempt_id: string;
      learner_id: string;
      learner_name: string;
      profile_complete: boolean;
      kind: "placement" | "level_up" | "final" | "pass_course";
      title: string;
      submitted_at: Date;
      section_scores: Partial<Record<AssessmentSectionCode, number>> | null;
      suggested_level: CefrLevel | null;
      challenge_turns: string;
      challenge_average: string | null;
      challenge_off_topic: string;
      challenge_status: string | null;
      blueprint: StoredAssessmentDefinition;
      response_count: string;
      typed_speaking: boolean;
    }>(
      `select aa.id as attempt_id, aa.learner_id, learner.display_name as learner_name,
              (lp.completed_at is not null) as profile_complete,
              ad.kind, ad.title, aa.submitted_at,
              coalesce(jsonb_object_agg(sc.section, sc.score) filter (where sc.section is not null), '{}'::jsonb) as section_scores,
              decision.suggested_level, coalesce(challenge.turns, 0)::text as challenge_turns,
              challenge.average::text as challenge_average, coalesce(challenge.off_topic, 0)::text as challenge_off_topic,
              challenge.status as challenge_status, av.blueprint,
              coalesce(responses.response_count, 0)::text as response_count,
              coalesce(responses.typed_speaking, false) as typed_speaking
       from assessment_attempts aa
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id
       join users learner on learner.id = aa.learner_id and learner.status = 'active'
       join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
       left join learner_profiles lp on lp.user_id = learner.id
       left join assessment_scores sc on sc.attempt_id = aa.id
       left join assessment_decisions decision on decision.attempt_id = aa.id
       left join lateral (
         select count(*) as response_count,
                bool_or(ar.section = 'speaking' and coalesce(ar.response->>'evidenceType', '') <> 'audio') as typed_speaking
         from assessment_responses ar where ar.attempt_id = aa.id
       ) responses on true
       left join lateral (
         select cs.status, count(ct.id) filter (where ct.speaker = 'learner') as turns,
                avg(((ct.feedback->'rubric'->>'meaning')::numeric + (ct.feedback->'rubric'->>'vocabulary')::numeric + (ct.feedback->'rubric'->>'grammar')::numeric) / 3) filter (where ct.speaker = 'learner') as average,
                count(ct.id) filter (where ct.speaker = 'learner' and coalesce((ct.feedback->>'relevant')::boolean, true) = false) as off_topic
         from coach_sessions cs left join coach_turns ct on ct.session_id = cs.id
         where cs.learner_id = aa.learner_id and cs.scenario->>'kind' = 'level_up'
           and cs.scenario->>'assessmentAttemptId' = aa.id::text group by cs.id
         order by cs.started_at desc limit 1
       ) challenge on true
       where aa.status = 'pending_review' and ad.kind in ('placement', 'level_up', 'final', 'pass_course')
       group by aa.id, learner.display_name, lp.completed_at, ad.kind, ad.title, av.blueprint,
                decision.suggested_level, responses.response_count, responses.typed_speaking,
                challenge.turns, challenge.average, challenge.off_topic, challenge.status
       order by aa.submitted_at nulls last, aa.started_at`,
      [reviewerId]
    );
    return result.rows.map((row) => {
      const scores = Object.fromEntries(Object.entries(row.section_scores ?? {}).map(([section, score]) => [section, Number(score)])) as Partial<Record<AssessmentSectionCode, number>>;
      const sections = row.blueprint.sections ?? [];
      const expectedResponses = sections.reduce((total, section) => total + section.groups.reduce((count, group) => count + group.tasks.length, 0), 0);
      const percentages = sections.flatMap(section => {
        const score = scores[section.code];
        return score == null || !section.maxScore ? [] : [score / section.maxScore * 100];
      });
      const totalPercent = sections.reduce((total, section) => total + (scores[section.code] ?? 0), 0);
      const reviewFlags: AssessmentReviewQueueRecord["reviewFlags"] = [];
      if ((["listening", "reading", "writing", "speaking"] as AssessmentSectionCode[]).some(section => scores[section] == null)) reviewFlags.push("pending_score");
      if (Number(row.response_count) < expectedResponses) reviewFlags.push("incomplete");
      if (row.typed_speaking) reviewFlags.push("typed_speaking");
      if ([25, 45, 65, 85].some(boundary => Math.abs(totalPercent - boundary) <= 0.5)) reviewFlags.push("borderline");
      const bands = percentages.map(percent => percent < 25 ? 0 : percent < 45 ? 1 : percent < 65 ? 2 : percent < 85 ? 3 : 4);
      if (bands.length > 1 && Math.max(...bands) - Math.min(...bands) >= 2) reviewFlags.push("skill_gap");
      return {
      attemptId: row.attempt_id,
      learnerId: row.learner_id,
      learnerName: row.learner_name,
      profileComplete: row.profile_complete,
      kind: row.kind === "level_up" ? "level-up" : row.kind === "pass_course" ? "pass-course" : row.kind,
      title: row.title,
      submittedAt: row.submitted_at,
      sectionScores: scores,
      suggestedLevel: row.suggested_level,
      reviewFlags,
      ...(row.kind === "level_up" ? { challenge: {
        completedTurns: Number(row.challenge_turns), requiredTurns: 6 as const,
        average: Number(row.challenge_average ?? 0), offTopic: Number(row.challenge_off_topic),
        complete: row.challenge_status === "completed",
        passed: row.challenge_status === "completed" && Number(row.challenge_average ?? 0) >= 3.5 && Number(row.challenge_off_topic) <= 1
      } } : {})
    }; });
  }

  async getReviewOverview(reviewerId: string): Promise<{
    pending: AssessmentReviewQueueRecord[];
    approvedLearners: AssessmentApprovedLearnerRecord[];
    unassessedLearners: AssessmentUnassessedLearnerRecord[];
    inProgressLearners: AssessmentUnassessedLearnerRecord[];
    retryLearners: AssessmentUnassessedLearnerRecord[];
    inFlow: AssessmentReviewFlowRecord[];
    openAppeals: number;
  }> {
    const [pending, approved, unassessed, inFlow, appealCount] = await Promise.all([
      this.listPending(reviewerId),
      this.pool.query<{
        learner_id: string;
        learner_name: string;
        current_level: CefrLevel;
        placement_score: string | null;
        monthly_goal: string | null;
        override_target: CefrLevel | null;
        override_reason: string | null;
        override_granted_by: string | null;
        override_granted_at: Date | null;
      }>(
        `select learner.id as learner_id, learner.display_name as learner_name,
                e.cefr as current_level, placement.total_score as placement_score,
                nullif(lp.profile->>'monthlyGoal', '') as monthly_goal,
                override.target_cefr as override_target, override.reason as override_reason,
                override.granted_by_name as override_granted_by, override.granted_at as override_granted_at
         from users learner
         join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
         join enrollments e on e.learner_id = learner.id and e.cefr_approved = true
         left join learner_profiles lp on lp.user_id = learner.id
         left join lateral (
           select sum(sc.score)::text as total_score
           from assessment_attempts aa
           join assessment_versions av on av.id = aa.assessment_version_id
           join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'placement'
           left join assessment_scores sc on sc.attempt_id = aa.id
           where aa.learner_id = learner.id and aa.status = 'approved'
           group by aa.id, aa.submitted_at
           order by aa.submitted_at desc nulls last
           limit 1
         ) placement on true
         left join lateral (
           select o.target_cefr, o.reason, o.granted_at, granter.display_name as granted_by_name
           from level_up_overrides o left join users granter on granter.id = o.granted_by
           where o.learner_id = learner.id and ${levelUpOverrideActiveSql("e.cefr")}
           limit 1
         ) override on true
         where learner.role = 'learner' and learner.status = 'active'
         order by learner.display_name`,
        [reviewerId]
      ),
      this.pool.query<{
        learner_id: string;
        learner_name: string;
        profile_complete: boolean;
        attempt_status: string | null;
        last_attempt_at: Date | null;
      }>(
        `select learner.id as learner_id, learner.display_name as learner_name,
                (lp.completed_at is not null) as profile_complete,
                latest.attempt_status, latest.last_attempt_at
         from users learner
         join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
         left join learner_profiles lp on lp.user_id = learner.id
         left join lateral (
           select aa.status as attempt_status,
                  coalesce(aa.submitted_at, aa.updated_at, aa.started_at) as last_attempt_at
           from assessment_attempts aa
           join assessment_versions av on av.id = aa.assessment_version_id
           join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'placement'
           where aa.learner_id = learner.id
           order by coalesce(aa.submitted_at, aa.updated_at, aa.started_at) desc nulls last
           limit 1
         ) latest on true
         where learner.role = 'learner' and learner.status = 'active'
           and not exists (
             select 1 from assessment_attempts aa
             join assessment_versions av on av.id = aa.assessment_version_id
             join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'placement'
             where aa.learner_id = learner.id and aa.status in ('pending_review', 'approved')
           )
         order by learner.display_name`,
        [reviewerId]
      ),
      this.listReviewFlow(reviewerId),
      this.pool.query<{ count: string }>(
        `select count(*)::text as count from (
           select a.id from appeals a join assessment_attempts aa on aa.id = a.attempt_id
             join users learner on learner.id = aa.learner_id
             join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
             where a.status = 'pending'
           union all
           select pa.id from practice_appeals pa join users learner on learner.id = pa.learner_id
             join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
             where pa.status = 'pending'
           union all
           select lpa.id from lesson_part_appeals lpa join users learner on learner.id = lpa.learner_id
             join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
             where lpa.status = 'pending'
         ) pending_appeals`, [reviewerId]
      )
    ]);
    const learnerBuckets = unassessed.rows.map((row) => ({
      learnerId: row.learner_id,
      learnerName: row.learner_name,
      profileComplete: row.profile_complete,
      lifecycle: row.attempt_status === "needs_retry"
        ? "needs_retry" as const
        : row.attempt_status === "in_progress" || row.attempt_status === "submitted"
          ? "in_progress" as const
          : "not_started" as const,
      lastAttemptAt: row.last_attempt_at
    }));
    return {
      pending,
      approvedLearners: approved.rows.map((row) => ({
        learnerId: row.learner_id,
        learnerName: row.learner_name,
        currentLevel: row.current_level,
        placementScore: row.placement_score === null ? null : Number(row.placement_score),
        monthlyGoal: row.monthly_goal,
        levelUpOverride: row.override_target && row.override_granted_at ? {
          targetLevel: row.override_target,
          reason: row.override_reason ?? "",
          grantedBy: row.override_granted_by,
          grantedAt: row.override_granted_at.toISOString()
        } : null
      })),
      unassessedLearners: learnerBuckets.filter((learner) => learner.lifecycle === "not_started"),
      inProgressLearners: learnerBuckets.filter((learner) => learner.lifecycle === "in_progress"),
      retryLearners: learnerBuckets.filter((learner) => learner.lifecycle === "needs_retry"),
      inFlow,
      openAppeals: Number(appealCount.rows[0]?.count ?? 0)
    };
  }

  async listReviewFlow(reviewerId: string): Promise<AssessmentReviewFlowRecord[]> {
    const result = await this.pool.query<{
      attempt_id: string;
      learner_id: string;
      learner_name: string;
      current_level: CefrLevel;
      target_level: CefrLevel | null;
      attempt_status: string;
      decision_status: string | null;
      challenge_status: string | null;
      challenge_passed: boolean | null;
      challenge_turns: string;
      challenge_average: string | null;
      challenge_off_topic: string;
      score_total: string | null;
    }>(
      `with latest_level_up as (
         select distinct on (aa.learner_id)
                aa.id as attempt_id, aa.learner_id, learner.display_name as learner_name,
                enrollment.cefr as current_level,
                nullif(av.blueprint->>'targetLevel', '') as target_level,
                aa.status as attempt_status, decision.status as decision_status,
                challenge.status as challenge_status, challenge.passed as challenge_passed,
                coalesce(challenge.turns, 0)::text as challenge_turns,
                challenge.average::text as challenge_average,
                coalesce(challenge.off_topic, 0)::text as challenge_off_topic,
                scores.total::text as score_total
         from assessment_attempts aa
         join assessment_versions av on av.id = aa.assessment_version_id
         join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'level_up'
         join users learner on learner.id = aa.learner_id and learner.status = 'active'
         join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
         join lateral (
           select e.cefr
           from enrollments e
           join programs p on p.id = e.program_id and p.status = 'active'
           where e.learner_id = aa.learner_id and e.cefr_approved = true
           order by e.enrolled_at desc limit 1
         ) enrollment on true
         left join assessment_decisions decision on decision.attempt_id = aa.id
         left join lateral (
           select cs.status, result.passed,
                  count(ct.id) filter (where ct.speaker = 'learner') as turns,
                  avg(((ct.feedback->'rubric'->>'meaning')::numeric + (ct.feedback->'rubric'->>'vocabulary')::numeric + (ct.feedback->'rubric'->>'grammar')::numeric) / 3) filter (where ct.speaker = 'learner') as average,
                  count(ct.id) filter (where ct.speaker = 'learner' and coalesce((ct.feedback->>'relevant')::boolean, true) = false) as off_topic
           from coach_sessions cs
           left join coach_turns ct on ct.session_id = cs.id
           left join level_up_challenge_results result on result.session_id = cs.id
           where cs.learner_id = aa.learner_id and cs.scenario->>'kind' = 'level_up'
             and cs.scenario->>'assessmentAttemptId' = aa.id::text
           group by cs.id, result.passed
           order by cs.started_at desc limit 1
         ) challenge on true
         left join lateral (
           select sum(sc.score) as total
           from assessment_scores sc
           where sc.attempt_id = aa.id
         ) scores on true
         order by aa.learner_id, aa.started_at desc
       )
       select * from latest_level_up
       where target_level is not null
       order by learner_name`,
      [reviewerId]
    );
    return result.rows.flatMap((row) => {
      let phase: AssessmentReviewFlowRecord["phase"] | null = null;
      if (row.attempt_status === "in_progress") phase = "testing";
      else if (row.challenge_passed === false || row.attempt_status === "needs_retry" || row.decision_status === "rejected") phase = "failed";
      else if (row.challenge_status === "active") phase = "challenge";
      else if (row.attempt_status === "submitted" || row.attempt_status === "pending_review") phase = "ungraded";
      if (!phase) return [];

      const turns = Number(row.challenge_turns);
      const average = row.challenge_average === null ? null : Number(row.challenge_average);
      const offTopic = Number(row.challenge_off_topic);
      const testSummary = row.score_total === null ? "bài thi" : `bài thi ${formatDisplayScore(Number(row.score_total))}/100`;
      const metrics = phase === "testing"
        ? "đang làm bài thi"
        : phase === "ungraded"
          ? `đã nộp ${testSummary} · chờ chấm Viết/Nói`
          : phase === "challenge"
            ? `qua ${testSummary} · đang thử thách Season (${turns}/6)`
            : average === null
              ? `chưa đạt: ${testSummary} · cần thi lại`
              : `chưa đạt: ${formatDisplayScore(average)}/5 · ${offTopic} lượt lạc đề`;
      return [{
        learnerId: row.learner_id,
        learnerName: row.learner_name,
        currentLevel: row.current_level,
        targetLevel: row.target_level as CefrLevel,
        phase,
        metrics,
        assessmentAttemptId: row.attempt_id,
        challengeAttemptId: row.challenge_status ? row.attempt_id : null
      }];
    });
  }

  async listLevelForms(reviewerId: string): Promise<AssessmentLevelFormRecord[]> {
    const result = await this.pool.query<{
      definition_id: string;
      version_id: string;
      title: string;
      version: number;
      blueprint: StoredAssessmentDefinition;
      published_at: Date | null;
      attempt_count: string;
    }>(
      `select ad.id as definition_id, av.id as version_id, ad.title, av.version,
              av.blueprint, av.published_at, count(aa.id)::text as attempt_count
       from assessment_definitions ad
       join users reviewer on reviewer.id = $1 and reviewer.organization_id = ad.organization_id
       join assessment_versions av on av.definition_id = ad.id and av.status in ('draft', 'published')
       left join assessment_attempts aa on aa.assessment_version_id = av.id
       where ad.kind = 'level_up'
       group by ad.id, av.id, ad.title, av.version, av.blueprint, av.published_at
       order by av.published_at desc nulls last`,
      [reviewerId]
    );
    return result.rows.flatMap((row) => {
      if (!hasCanonicalLevelFormStructure(row.blueprint)) return [];
      const targetLevel = row.blueprint.targetLevel;
      if (!targetLevel || targetLevel === "A1") return [];
      const publicationBlockerCount = levelFormPublicationBlockerCount(row.blueprint);
      const sectionCount = (code: AssessmentSectionCode) => row.blueprint.sections
        .find((section) => section.code === code)?.groups.reduce((total, group) => total + group.tasks.length, 0) ?? 0;
      return [{
        definitionId: row.definition_id,
        versionId: row.version_id,
        title: row.title,
        version: row.version,
        targetLevel,
        publishedAt: row.published_at,
        listeningTaskCount: sectionCount("listening"),
        readingTaskCount: sectionCount("reading"),
        attemptCount: Number(row.attempt_count),
        publicationReady: publicationBlockerCount === 0,
        publicationBlockerCount
        ,status: row.published_at ? "published" : "draft"
      }];
    });
  }

  /** Return every persisted version for one target level, including retired history. */
  async listLevelFormVersions(reviewerId: string, targetLevel: Exclude<CefrLevel, "A1">): Promise<AssessmentLevelFormRecord[]> {
    const result = await this.pool.query<{
      definition_id: string;
      version_id: string;
      title: string;
      version: number;
      target_level: Exclude<CefrLevel, "A1"> | null;
      blueprint: StoredAssessmentDefinition;
      published_at: Date | null;
      status: "draft" | "published" | "retired";
      attempt_count: string;
    }>(
      `select ad.id as definition_id, av.id as version_id, ad.title, av.version,
              nullif(av.blueprint->>'targetLevel', '') as target_level,
              av.blueprint, av.published_at, av.status,
              count(aa.id)::text as attempt_count
       from assessment_definitions ad
       join users reviewer on reviewer.id = $1 and reviewer.organization_id = ad.organization_id
       join assessment_versions av on av.definition_id = ad.id
       left join assessment_attempts aa on aa.assessment_version_id = av.id
       where ad.kind = 'level_up' and coalesce(av.blueprint->>'targetLevel', '') = $2
       group by ad.id, av.id, ad.title, av.version, av.blueprint, av.published_at, av.status
       order by av.version desc`,
      [reviewerId, targetLevel]
    );
    return result.rows.flatMap((row) => {
      if (!hasCanonicalLevelFormStructure(row.blueprint)) return [];
      const blueprintTarget = row.target_level ?? row.blueprint.targetLevel;
      if (!blueprintTarget || blueprintTarget === "A1") return [];
      const publicationBlockerCount = levelFormPublicationBlockerCount(row.blueprint);
      const sectionCount = (code: AssessmentSectionCode) => row.blueprint.sections
        .find((section) => section.code === code)?.groups.reduce((total, group) => total + group.tasks.length, 0) ?? 0;
      return [{
        definitionId: row.definition_id,
        versionId: row.version_id,
        title: row.title,
        version: row.version,
        targetLevel: blueprintTarget,
        publishedAt: row.published_at,
        listeningTaskCount: sectionCount("listening"),
        readingTaskCount: sectionCount("reading"),
        attemptCount: Number(row.attempt_count),
        publicationReady: publicationBlockerCount === 0,
        publicationBlockerCount,
        status: row.status
      }];
    });
  }

  async getLevelFormDetail(reviewerId: string, versionId: string): Promise<AssessmentLevelFormDetailView | null> {
    const result = await this.pool.query<{
      definition_id: string;
      version_id: string;
      title: string;
      version: number;
      target_level: Exclude<CefrLevel, "A1"> | null;
      blueprint: StoredAssessmentDefinition;
      published_at: Date | null;
      status: "draft" | "published" | "retired";
      attempt_count: string;
    }>(
      `select ad.id as definition_id, av.id as version_id, ad.title, av.version,
              nullif(av.blueprint->>'targetLevel', '') as target_level,
              av.blueprint, av.published_at, av.status,
              count(aa.id)::text as attempt_count
       from assessment_versions av
       join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'level_up'
       join users reviewer on reviewer.id = $1 and reviewer.organization_id = ad.organization_id
       left join assessment_attempts aa on aa.assessment_version_id = av.id
       where av.id = $2
       group by ad.id, av.id, ad.title, av.version, av.blueprint, av.published_at, av.status`,
      [reviewerId, versionId]
    );
    const row = result.rows[0];
    const targetLevel = row?.target_level ?? row?.blueprint.targetLevel;
    if (!row || !targetLevel || targetLevel === "A1") return null;
    const publicationBlockerCount = levelFormPublicationBlockerCount(row.blueprint);
    const summary = {
      definitionId: row.definition_id,
      versionId: row.version_id,
      title: row.title,
      version: row.version,
      targetLevel,
      publishedAt: row.published_at?.toISOString() ?? null,
      listeningTaskCount: sectionTaskCount(row.blueprint, "listening"),
      readingTaskCount: sectionTaskCount(row.blueprint, "reading"),
      attemptCount: Number(row.attempt_count),
      status: row.status,
      publicationReady: publicationBlockerCount === 0,
      publicationBlockerCount
    } as const;
    const versions = (await this.listLevelFormVersions(reviewerId, targetLevel)).map((version) => ({
      ...version,
      publishedAt: version.publishedAt?.toISOString() ?? null
    }));
    const warnings: AssessmentLevelFormDetailView["warnings"] = [];
    const expectedCounts: Record<AssessmentSectionCode, number> = { listening: 20, reading: 40, writing: 2, speaking: 4 };
    const present = new Set(row.blueprint.sections.map((section) => section.code));
    for (const code of ["listening", "reading", "writing", "speaking"] as const) {
      const count = sectionTaskCount(row.blueprint, code);
      if (!present.has(code)) warnings.push({ code: "missing_section", message: `Thiếu phần ${code}.`, severity: "error" });
      else if (count < expectedCounts[code]) warnings.push({ code: "short_section", message: `Phần ${code} mới có ${count}/${expectedCounts[code]} câu.`, severity: "warning" });
    }
    // A manually-created canonical form intentionally starts blank.  One raw
    // warning for every choice task turns the operator's validation panel into
    // a 60-row error wall before they can author the first question.  Keep the
    // individual validation at publication time, but present the draft status
    // as an actionable, section-level count.
    for (const section of row.blueprint.sections) {
      const missingPrompts = section.groups.flatMap((group) => group.tasks
        .filter((task) => !task.prompt.trim())
        .map((task) => task.key));
      if (missingPrompts.length) {
        warnings.push({
          code: "missing_task_prompt",
          message: `Phần ${section.title}: ${missingPrompts.length} câu chưa có đề bài.${missingPrompts.length <= 4 ? ` (${missingPrompts.join(", ")})` : ""}`,
          severity: "error"
        });
      }
      const missingAnswerKeys = section.groups.flatMap((group) => group.tasks
        .filter((task) => task.responseType === "single_choice" && !task.correctAnswer)
        .map((task) => task.key));
      if (missingAnswerKeys.length) {
        warnings.push({
          code: "missing_answer_key",
          message: `Phần ${section.title}: ${missingAnswerKeys.length} câu chưa chọn đáp án.${missingAnswerKeys.length <= 4 ? ` (${missingAnswerKeys.join(", ")})` : ""}`,
          severity: "error"
        });
      }
    }
    const listening = row.blueprint.sections.find((section) => section.code === "listening");
    for (const group of listening?.groups ?? []) {
      if (group.stimulus?.type !== "audio_script" || !group.stimulus.audioSrc?.trim()) {
        warnings.push({ code: "missing_audio", message: `Nhóm nghe “${group.title}” chưa có tệp audio.`, severity: "error" });
      }
    }
    if (Number(row.attempt_count) > 0) warnings.push({ code: "in_use", message: "Đề đã có bài thi nên không thể xoá.", severity: "warning" });
    const deletable = row.status === "draft" && Number(row.attempt_count) === 0;
    const deleteReason = deletable ? null
      : row.status === "published" ? "Đề đã duyệt/phát hành."
        : Number(row.attempt_count) > 0 ? "Đề đã có bài thi."
          : "Chỉ có thể xoá bản nháp.";
    return {
      ...summary,
      sections: normalizeLevelFormQuestionPrompts(row.blueprint).sections.map((section) => ({
        ...section,
        groups: section.groups.map((group) => ({
          ...group,
          tasks: group.tasks.map((task) => ({ ...task, correctAnswer: task.correctAnswer ?? null }))
        }))
      })),
      warnings,
      versions,
      deletable,
      deleteReason,
      ...levelFormAutoFixed(row.blueprint)
    };
  }

  async updateLevelFormDraft(reviewerId: string, versionId: string, input: AssessmentLevelFormUpdateInput): Promise<AssessmentLevelFormDetailView | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const target = await client.query<{ organization_id: string; definition_id: string; blueprint: StoredAssessmentDefinition; attempt_count: string }>(
        `select ad.organization_id, ad.id as definition_id, av.blueprint,
                (select count(*)::text from assessment_attempts aa where aa.assessment_version_id = av.id) as attempt_count
         from assessment_versions av
         join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'level_up'
         join users reviewer on reviewer.id = $1 and reviewer.organization_id = ad.organization_id
         where av.id = $2 and av.status = 'draft'
         for update of av`,
        [reviewerId, versionId]
      );
      const row = target.rows[0];
      if (!row || Number(row.attempt_count) > 0) { await client.query("rollback"); return null; }
      const sections = input.sections.map((section) => ({
        ...section,
        groups: section.groups.map((group) => ({
          ...group,
          tasks: group.tasks.map(({ correctAnswer, ...task }) => ({ ...task, ...(correctAnswer ? { correctAnswer } : {}) }))
        }))
      })) as StoredAssessmentDefinition["sections"];
      const blueprint: StoredAssessmentDefinition = { ...row.blueprint, title: input.title, sections };
      await client.query("update assessment_definitions set title = $1 where id = $2", [input.title, row.definition_id]);
      await client.query("update assessment_versions set blueprint = $1::jsonb where id = $2", [JSON.stringify(blueprint), versionId]);
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'assessment.level-form.updated', 'assessment_version', $4, $5::jsonb, $6)`,
        [randomUUID(), row.organization_id, reviewerId, versionId, JSON.stringify({ title: input.title }), randomUUID()]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    return this.getLevelFormDetail(reviewerId, versionId);
  }

  async copyLevelFormToDraft(reviewerId: string, versionId: string): Promise<AssessmentLevelFormDetailView | null> {
    const client = await this.pool.connect();
    let createdId = "";
    try {
      await client.query("begin");
      const source = await client.query<{ organization_id: string; definition_id: string; blueprint: StoredAssessmentDefinition }>(
        `select ad.organization_id, ad.id as definition_id, av.blueprint
         from assessment_versions av
         join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'level_up'
         join users reviewer on reviewer.id = $1 and reviewer.organization_id = ad.organization_id
         where av.id = $2 and av.status in ('published', 'retired')
         for update of av`,
        [reviewerId, versionId]
      );
      const row = source.rows[0];
      if (!row) { await client.query("rollback"); return null; }
      await client.query("update assessment_versions set status = 'retired' where definition_id = $1 and status = 'draft'", [row.definition_id]);
      const next = await client.query<{ version: number }>("select coalesce(max(version), 0) + 1 as version from assessment_versions where definition_id = $1", [row.definition_id]);
      createdId = randomUUID();
      await client.query(
        "insert into assessment_versions (id, definition_id, version, status, blueprint) values ($1, $2, $3, 'draft', $4::jsonb)",
        [createdId, row.definition_id, next.rows[0]?.version ?? 1, JSON.stringify(row.blueprint)]
      );
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'assessment.level-form.copied-to-draft', 'assessment_version', $4, $5::jsonb, $6)`,
        [randomUUID(), row.organization_id, reviewerId, createdId, JSON.stringify({ sourceVersionId: versionId }), randomUUID()]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    return this.getLevelFormDetail(reviewerId, createdId);
  }

  async deleteLevelForm(reviewerId: string, versionId: string): Promise<AssessmentLevelFormDeleteView | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const target = await client.query<{ organization_id: string; status: "draft" | "published" | "retired"; attempt_count: string }>(
        `select ad.organization_id, av.status, count(aa.id)::text as attempt_count
         from assessment_versions av
         join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'level_up'
         join users reviewer on reviewer.id = $1 and reviewer.organization_id = ad.organization_id
         left join assessment_attempts aa on aa.assessment_version_id = av.id
         where av.id = $2
         group by ad.organization_id, av.id, av.status`,
        [reviewerId, versionId]
      );
      const row = target.rows[0];
      if (!row) { await client.query("rollback"); return null; }
      if (row.status !== "draft") throw new Error("LEVEL_FORM_NOT_DELETABLE");
      if (Number(row.attempt_count) > 0) throw new Error("LEVEL_FORM_IN_USE");
      const deleted = await client.query("delete from assessment_versions where id = $1 and status = 'draft' returning id", [versionId]);
      if (!deleted.rowCount) { await client.query("rollback"); return null; }
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'assessment.level-form.deleted', 'assessment_version', $4, '{}'::jsonb, $5)`,
        [randomUUID(), row.organization_id, reviewerId, versionId, randomUUID()]
      );
      await client.query("commit");
      return { deleted: true, versionId };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async createLevelFormDraft(reviewerId: string, targetLevel: Exclude<CefrLevel, "A1">, blueprint: StoredAssessmentDefinition): Promise<AssessmentLevelFormRecord> {
    const client = await this.pool.connect();
    let versionId = "";
    try {
      await client.query("begin");
      const actor = await client.query<{ organization_id: string }>("select organization_id from users where id = $1", [reviewerId]);
      const organizationId = actor.rows[0]?.organization_id;
      if (!organizationId) throw new Error("ASSESSMENT_REVIEWER_NOT_FOUND");
      const key = `level-up-${targetLevel.toLowerCase()}`;
      const existing = await client.query<{ id: string }>("select id from assessment_definitions where organization_id = $1 and assessment_key = $2 for update", [organizationId, key]);
      const definitionId = existing.rows[0]?.id ?? randomUUID();
      if (!existing.rows[0]) await client.query(
        "insert into assessment_definitions (id, organization_id, assessment_key, kind, title) values ($1, $2, $3, 'level_up', $4)",
        [definitionId, organizationId, key, blueprint.title]
      );
      else await client.query("update assessment_definitions set title = $2 where id = $1", [definitionId, blueprint.title]);
      await client.query("update assessment_versions set status = 'retired' where definition_id = $1 and status = 'draft'", [definitionId]);
      const next = await client.query<{ version: number }>("select coalesce(max(version), 0) + 1 as version from assessment_versions where definition_id = $1", [definitionId]);
      versionId = randomUUID();
      await client.query("insert into assessment_versions (id, definition_id, version, status, blueprint) values ($1, $2, $3, 'draft', $4::jsonb)", [versionId, definitionId, next.rows[0]?.version ?? 1, JSON.stringify(blueprint)]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
    const forms = await this.listLevelForms(reviewerId);
    const created = forms.find((form) => form.versionId === versionId);
    if (!created) throw new Error("ASSESSMENT_FORM_NOT_FOUND");
    return created;
  }

  async publishLevelForm(reviewerId: string, versionId: string): Promise<AssessmentLevelFormRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const target = await client.query<{ definition_id: string; blueprint: StoredAssessmentDefinition }>(
        `select av.definition_id, av.blueprint from assessment_versions av join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'level_up'
         join users reviewer on reviewer.id = $1 and reviewer.organization_id = ad.organization_id
         where av.id = $2 and av.status = 'draft' for update of av`, [reviewerId, versionId]
      );
      const definitionId = target.rows[0]?.definition_id;
      if (!definitionId) { await client.query("rollback"); return null; }
      const blueprint = target.rows[0]!.blueprint;
      if (!hasCanonicalLevelFormStructure(blueprint)) throw new Error("LEVEL_FORM_STRUCTURE_INVALID");
      if (!hasCompleteLevelFormContent(blueprint)) throw new Error("LEVEL_FORM_CONTENT_INCOMPLETE");
      const listening = blueprint.sections.find((section) => section.code === "listening");
      const missingAudio = !listening || listening.groups.some((group) => group.stimulus?.type !== "audio_script" || !group.stimulus.audioSrc?.trim());
      if (missingAudio) throw new Error("LEVEL_FORM_AUDIO_REQUIRED");
      await client.query("update assessment_versions set status = 'retired' where definition_id = $1 and status = 'published'", [definitionId]);
      await client.query("update assessment_versions set status = 'published', published_at = now() where id = $1", [versionId]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
    return (await this.listLevelForms(reviewerId)).find((form) => form.versionId === versionId) ?? null;
  }

  async decide(input: {
    attemptId: string;
    reviewerId: string;
    status: "approved" | "needs_retry";
    approvedLevel: CefrLevel | null;
    reason: string;
  }): Promise<AssessmentDecisionRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const locked = await client.query<{
        learner_id: string;
        organization_id: string;
        status: AssessmentAttemptRecord["status"];
        kind: "placement" | "level_up" | "final" | "pass_course";
        current_level: CefrLevel | null;
        pass_course_ready: boolean | null;
        challenge_passed: boolean | null;
        challenge_turns: number | null;
        challenge_average: string | null;
        challenge_off_topic: number | null;
      }>(
        `select aa.learner_id, learner.organization_id, aa.status, definition.kind,
                enrollment.cefr as current_level, readiness.cefr_ready as pass_course_ready, challenge.passed as challenge_passed,
                challenge.completed_turns as challenge_turns, challenge.average::text as challenge_average,
                challenge.off_topic as challenge_off_topic
         from assessment_attempts aa
         join assessment_versions version on version.id = aa.assessment_version_id
         join assessment_definitions definition on definition.id = version.definition_id
         join users learner on learner.id = aa.learner_id
         join users reviewer on reviewer.id = $2
           and reviewer.organization_id = learner.organization_id
           and reviewer.role = 'operator'
         left join enrollments enrollment on enrollment.learner_id = aa.learner_id and enrollment.cefr_approved = true
         left join pass_course_readiness readiness on readiness.learner_id = aa.learner_id
           and readiness.organization_id = learner.organization_id
         left join level_up_challenge_results challenge on challenge.assessment_attempt_id = aa.id
         where aa.id = $1 and definition.kind in ('placement', 'level_up', 'final', 'pass_course')
         for update of aa`,
        [input.attemptId, input.reviewerId]
      );
      const attempt = locked.rows[0];
      if (!attempt || !["pending_review", "approved", "needs_retry"].includes(attempt.status)) {
        await client.query("rollback");
        return null;
      }
      if (attempt.kind !== "final" && input.status === "approved" && !input.approvedLevel) {
        if (attempt.kind === "pass_course") {
          // Form A is pass/fail: it never changes CEFR. Its gate is a
          // persisted C1 readiness flag plus the operator's final decision.
        } else {
          await client.query("rollback");
          return null;
        }
      }
      if (attempt.kind === "pass_course" && input.approvedLevel) {
        await client.query("rollback");
        return null;
      }
      if (attempt.kind === "level_up" && input.status === "approved" && attempt.challenge_passed !== true) {
        await client.query("rollback");
        return null;
      }

      let passCourseScore: number | undefined;
      if (attempt.kind === "pass_course") {
        const score = await client.query<{ total: string; scored_sections: string; valid_sections: string }>(
          `select coalesce(sum(score), 0)::text as total,
                  count(distinct section)::text as scored_sections,
                  count(distinct section) filter (where score between 0 and (section_spec->>'maxScore')::numeric)::text as valid_sections
             from assessment_scores sc
             join assessment_attempts a on a.id = sc.attempt_id
             join assessment_versions v on v.id = a.assessment_version_id
             join lateral jsonb_array_elements(v.blueprint->'sections') section_spec on section_spec->>'code' = sc.section
             where sc.attempt_id = $1`,
          [input.attemptId]
        );
        const total = Number(score.rows[0]?.total ?? 0);
        const scoredSections = Number(score.rows[0]?.scored_sections ?? 0);
        const validSections = Number(score.rows[0]?.valid_sections ?? 0);
        const approved = input.status === "approved";
        if ((approved && (attempt.current_level !== "C1" || attempt.pass_course_ready !== true || scoredSections !== 4 || validSections !== 4))
          || (approved !== (total >= 85) && !input.reason.trim())) {
          await client.query("rollback");
          return null;
        }
        passCourseScore = total;
      }

      const existing = await client.query<{
        status: "approved" | "retry";
        approved_level: CefrLevel | null;
        reason: string;
        decided_by: string;
        decided_at: Date;
      }>(
        `select status, approved_level, reason, decided_by, decided_at
         from assessment_decisions where attempt_id = $1`,
        [input.attemptId]
      );
      const previous = existing.rows[0];
      if (attempt.status !== "pending_review" && previous) {
        await client.query("commit");
        return {
          attemptId: input.attemptId,
          status: previous.status === "retry" ? "needs_retry" : "approved",
          approvedLevel: previous.approved_level,
          reason: previous.reason,
          decidedBy: previous.decided_by,
          decidedAt: previous.decided_at
        };
      }

      const decidedAt = new Date();
      const decisionStatus = input.status === "needs_retry" ? "retry" : "approved";
      await client.query(
        `insert into assessment_decisions
           (id, attempt_id, approved_level, status, reason, decided_by, decided_at)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (attempt_id) do update
         set approved_level = excluded.approved_level, status = excluded.status,
             reason = excluded.reason, decided_by = excluded.decided_by, decided_at = excluded.decided_at`,
        [randomUUID(), input.attemptId, input.approvedLevel, decisionStatus, input.reason, input.reviewerId, decidedAt]
      );
      await client.query(
        `update assessment_attempts set status = $2, updated_at = $3 where id = $1`,
        [input.attemptId, input.status, decidedAt]
      );
      await client.query(
        `update appeals
         set status = $2, resolution = $3, resolved_by = $4, resolved_at = $5
         where attempt_id = $1 and status = 'pending'`,
        [input.attemptId, input.status === "approved" ? "accepted" : "rejected", input.reason, input.reviewerId, decidedAt]
      );
      if (input.status === "approved" && input.approvedLevel && attempt.kind === "level_up") {
        const scoreRows = await client.query<{ section: AssessmentSectionCode; score: string }>(
          "select section, score::text from assessment_scores where attempt_id = $1 order by section", [input.attemptId]
        );
        const examScores = Object.fromEntries(scoreRows.rows.map((row) => [row.section, Number(row.score)]));
        await client.query(
          `insert into scheduled_level_changes
             (id, learner_id, assessment_attempt_id, from_cefr, to_cefr, effective_at, status,
              approved_by, reason, evidence)
           values ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8, $9::jsonb)
           on conflict (assessment_attempt_id) do nothing`,
          [randomUUID(), attempt.learner_id, input.attemptId, attempt.current_level, input.approvedLevel,
            decidedAt, input.reviewerId, input.reason, JSON.stringify({
              examScores,
              challenge: {
                completedTurns: Number(attempt.challenge_turns ?? 0),
                average: Number(attempt.challenge_average ?? 0),
                offTopic: Number(attempt.challenge_off_topic ?? 0),
                passed: true
              }
            })]
        );
        await applyScheduledLevelChanges(client, attempt.learner_id, decidedAt, input.attemptId);
      } else if (input.status === "approved" && input.approvedLevel && attempt.kind === "placement") {
        await client.query(
          `update enrollments set cefr = $2, cefr_approved = true where learner_id = $1`,
          [attempt.learner_id, input.approvedLevel]
        );
      }
      if (attempt.kind === "pass_course") {
        if (input.status === "approved") {
          const certificateNumber = `E4S-C1-${input.attemptId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
          await client.query(
            `insert into pass_course_certificates
               (id, attempt_id, learner_id, organization_id, certificate_number, issued_by, metadata)
             values ($1, $2, $3, $4, $5, $6, $7::jsonb)
             on conflict (attempt_id) do nothing`,
            [randomUUID(), input.attemptId, attempt.learner_id, attempt.organization_id, certificateNumber, input.reviewerId,
              JSON.stringify({ form: "A", totalMinutes: 90, totalScore: 100, passingScore: 85 })]
          );
          await client.query(
            `update pass_course_readiness
             set cefr_ready = false, reset_at = now(), reset_reason = 'pass_course_certified', updated_at = now()
             where learner_id = $1`, [attempt.learner_id]
          );
        } else {
          await client.query(
            `insert into pass_course_readiness (learner_id, organization_id, cefr_ready, reset_at, reset_reason, updated_at)
             values ($1, $2, false, now(), $3, now())
             on conflict (learner_id) do update
             set cefr_ready = false, reset_at = excluded.reset_at, reset_reason = excluded.reset_reason, updated_at = now()`,
            [attempt.learner_id, attempt.organization_id, input.reason]
          );
        }
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'assessment.decision', 'assessment_attempt', $4, $5::jsonb, $6)`,
        [randomUUID(), attempt.organization_id, input.reviewerId, input.attemptId,
          JSON.stringify({ status: input.status, approvedLevel: input.approvedLevel, reason: input.reason,
            ...(passCourseScore === undefined ? {} : { totalScore: passCourseScore, recommendedStatus: passCourseScore >= 85 ? "approved" : "needs_retry" }),
            ...(attempt.kind === "level_up" && input.status === "approved"
              ? { effectiveAt: decidedAt.toISOString() } : {}) }), randomUUID()]
      );
      await client.query("commit");
      return {
        attemptId: input.attemptId,
        status: input.status,
        approvedLevel: input.approvedLevel,
        reason: input.reason,
        decidedBy: input.reviewerId,
        decidedAt
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

function defaultDeviceEvidence(): AssessmentDeviceEvidence {
  return { microphoneSupported: null, microphoneState: "unknown", soundCheck: "unknown", checkedAt: null };
}

function mediaEvidenceFromResponses(
  responses: Array<{ taskKey: string; response: { evidenceType?: AssessmentEvidenceType; artifactKey?: string }; savedAt: Date }>,
  stored: Partial<AssessmentMediaEvidence> | null | undefined
): AssessmentMediaEvidence {
  const recordings: AssessmentMediaEvidence["recordings"] = {};
  if (stored?.recordings && typeof stored.recordings === "object") {
    for (const [taskKey, value] of Object.entries(stored.recordings)) {
      if (!value || typeof value !== "object" || typeof value.artifactKey !== "string") continue;
      recordings[taskKey] = { ...value, taskKey };
    }
  }
  if (Array.isArray(stored?.uploads)) {
    for (const value of stored.uploads) {
      if (!value || typeof value !== "object" || typeof value.taskKey !== "string" || typeof value.artifactKey !== "string") continue;
      recordings[value.taskKey] = { ...value };
    }
  }
  for (const response of responses) {
    if (response.response.evidenceType !== "audio" || !response.response.artifactKey) continue;
    const recording = {
      taskKey: response.taskKey,
      artifactKey: response.response.artifactKey,
      uploadedAt: response.savedAt.toISOString()
    };
    recordings[response.taskKey] = recording;
  }
  return { recordings, uploads: Object.values(recordings) };
}

function assessmentRuntimeFromAttempt(attempt: AssessmentAttemptRecord): AssessmentRuntimeView {
  return assessmentRuntimeFromState(attempt);
}

function assessmentRuntimeFromState(state: {
  status: AssessmentAttemptRecord["status"];
  currentSection: AssessmentSectionCode | null;
  timingState: AssessmentAttemptRecord["timingState"];
  violationCount: number;
  violationLimit: number;
  submitReason: AssessmentSubmitReason | null;
  deviceEvidence: AssessmentDeviceEvidence;
  mediaEvidence: AssessmentMediaEvidence;
  audioPlayCounts: Record<string, number>;
}): AssessmentRuntimeView {
  const sectionTiming = state.currentSection ? state.timingState.sections?.[state.currentSection] : undefined;
  const remainingSeconds = state.status !== "in_progress"
    ? 0
    : sectionTiming?.endsAt
      ? Math.max(0, Math.ceil((new Date(sectionTiming.endsAt).getTime() - Date.now()) / 1000))
      : null;
  return {
    remainingSeconds,
    violationCount: state.violationCount,
    violationLimit: state.violationLimit,
    submitReason: state.submitReason,
    status: state.status,
    currentSection: state.currentSection,
    audioPlayCounts: state.audioPlayCounts,
    deviceEvidence: state.deviceEvidence,
    mediaEvidence: state.mediaEvidence
  };
}

const coachDailyLimitSql = `least(greatest(coalesce((case
  when to_char(organization_system_date(u.organization_id), 'YYYY-MM') < os.configuration->>'coachDailyLimitStartsMonth'
  then os.configuration->>'previousCoachDailyLimit'
  else os.configuration->>'coachDailyLimit'
end)::int, 30), 1), 200)`;

class CoachRepository {
  constructor(private readonly pool: Pool) {}

  async listForLearner(learnerId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `select id, scenario, status, started_at, completed_at
       from coach_sessions where learner_id = $1 order by started_at desc`,
      [learnerId]
    );
    return result.rows;
  }

  async dailyLimitForLearner(learnerId: string): Promise<number> {
    const result = await this.pool.query<{ daily_limit: number }>(
      `select ${coachDailyLimitSql} as daily_limit
       from users u left join organization_settings os on os.organization_id = u.organization_id
       where u.id = $1`,
      [learnerId]
    );
    return result.rows[0]?.daily_limit ?? 30;
  }

  async currentForLearner(learnerId: string, aiAvailable: boolean): Promise<CoachView | null> {
    const monthlyContext = await new LearningRepository(this.pool).getActiveMonthlyContext(learnerId);
    const context = await this.pool.query<{
      display_name: string; cefr: CefrLevel; scenario: Record<string, unknown> | null;
      session_id: string | null; coach_daily_limit: number; system_month: string;
      system_date: string; system_day_of_week: number; exam_date: string | null;
    }>(
      `select u.display_name, e.cefr, cs.id as session_id, cs.scenario,
              ${coachDailyLimitSql} as coach_daily_limit,
              to_char(organization_system_date(p.organization_id), 'YYYY-MM') as system_month,
              organization_system_date(p.organization_id)::text as system_date,
              extract(isodow from organization_system_date(p.organization_id))::int as system_day_of_week,
              (select pm.exam_date::text from program_months pm
               where pm.organization_id = p.organization_id
                 and pm.month = to_char(organization_system_date(p.organization_id), 'YYYY-MM') limit 1) as exam_date
       from users u
       join enrollments e on e.learner_id = u.id
       join programs p on p.id = e.program_id and p.status = 'active'
       left join lateral (
         select id, scenario from coach_sessions
         where learner_id = u.id and status = 'active'
           and coalesce(scenario->>'kind', 'practice') = 'practice'
         order by started_at desc limit 1
       ) cs on true
       left join organization_settings os on os.organization_id = u.organization_id
       where u.id = $1 and u.role = 'learner' and u.status = 'active'
       order by e.enrolled_at desc limit 1`,
      [learnerId]
    );
    const row = context.rows[0];
    if (!row) return null;
    // A prior weekly session has no month marker. Retire it before serving the monthly model.
    let sessionId = row.session_id;
    let scenario = row.scenario ?? {};
    const sessionMonth = typeof scenario.month === "string" ? scenario.month : null;
    if (sessionId && sessionMonth !== row.system_month) {
      await this.pool.query("update coach_sessions set status = 'completed', completed_at = now() where id = $1", [sessionId]);
      sessionId = null;
      scenario = {};
    }
    const previousSession = await this.pool.query<{ scenario: Record<string, unknown> | null; last_question: string | null }>(
      `select cs.scenario,
              coalesce(cs.scenario->>'openingQuestion', latest_turn.feedback->>'nextQuestion') as last_question
       from coach_sessions cs
       left join lateral (
         select ct.feedback from coach_turns ct
         where ct.session_id = cs.id and ct.speaker = 'learner' and ct.feedback is not null
         order by ct.turn_number desc limit 1
       ) latest_turn on true
       where cs.learner_id = $1 and cs.status <> 'active'
         and coalesce(cs.scenario->>'kind', 'practice') = 'practice'
         and cs.scenario->>'month' = $2
       order by coalesce(cs.completed_at, cs.started_at) desc limit 1`,
      [learnerId, row.system_month]
    );
    const previousScenario = previousSession.rows[0]?.scenario ?? {};
    const activeTopic = monthlyContext?.themeTitle
      ?? (typeof scenario.title === "string" ? scenario.title : null)
      ?? (typeof previousScenario.title === "string" ? previousScenario.title : null)
      ?? randomMonthlyCoachTopic();
    const priorQuestionRows = await this.pool.query<{ question: string }>(
      `select recent.question
       from (
         select cs.scenario->>'openingQuestion' as question, cs.started_at as created_at
         from coach_sessions cs
         where cs.learner_id = $1 and cs.scenario->>'month' = $2 and cs.scenario->>'title' = $3
           and coalesce(cs.scenario->>'kind', 'practice') = 'practice'
         union all
         select ct.feedback->>'nextQuestion' as question, ct.created_at
         from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
         where cs.learner_id = $1 and cs.scenario->>'month' = $2 and cs.scenario->>'title' = $3
           and coalesce(cs.scenario->>'kind', 'practice') = 'practice'
       ) recent
       where nullif(btrim(recent.question), '') is not null
       order by recent.created_at desc limit 100`,
      [learnerId, row.system_month, activeTopic]
    );
    const priorQuestions = [...new Set(priorQuestionRows.rows.map((entry) => entry.question.trim()))];
    const firstName = row.display_name.trim().split(/\s+/).at(-1) ?? row.display_name;
    const openingQuestion = typeof scenario.openingQuestion === "string" && scenario.openingQuestion.trim()
      ? scenario.openingQuestion
      : coachOpeningQuestion(firstName, activeTopic, priorQuestions);
    // Season's tone comes only from the Informal/Formal toggle on the Season
    // screen, which writes it onto the practice session. A new session keeps
    // the learner's last toggle choice from any earlier practice session (also
    // across months); with no earlier session it starts Informal. The retired
    // profile-form style value is never read.
    const rememberedPersona = typeof scenario.persona === "string" ? scenario.persona : (await this.pool.query<{ persona: string | null }>(
      `select scenario->>'persona' as persona from coach_sessions
       where learner_id = $1 and coalesce(scenario->>'kind', 'practice') = 'practice'
         and scenario ? 'persona' and ($2::uuid is null or id <> $2::uuid)
       order by coalesce(completed_at, started_at) desc, started_at desc limit 1`,
      [learnerId, sessionId]
    )).rows[0]?.persona ?? previousScenario.persona;
    scenario = {
      ...scenario,
      title: activeTopic,
      persona: rememberedPersona === "formal" ? "formal" : "informal",
      month: row.system_month,
      openingQuestion
    };
    if (!sessionId) {
      sessionId = randomUUID();
      await this.pool.query(
        `insert into coach_sessions (id, learner_id, scenario, status)
         values ($1, $2, $3::jsonb, 'active')`,
        [sessionId, learnerId, JSON.stringify(scenario)]
      );
    } else {
      await this.pool.query("update coach_sessions set scenario = $2::jsonb where id = $1", [sessionId, JSON.stringify(scenario)]);
    }
    let [turns, counters, vocabularyRows, vocabularyTotalRows, unlockedRows] = await Promise.all([
      this.pool.query<{
        id: string; speaker: string; content: Record<string, unknown>;
        feedback: Record<string, unknown> | null; created_at: Date;
      }>(
        `select id, speaker, content, feedback, created_at from coach_turns
         where session_id = $1 order by turn_number, created_at`, [sessionId]
      ),
      this.pool.query<{ daily_used: string; monthly_turns: string }>(
        `select
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= organization_system_date((select organization_id from users where id = $1))
             and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean,
               coalesce((ct.feedback->>'relevant')::boolean, true)))::text as daily_used,
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= date_trunc('month', organization_system_date((select organization_id from users where id = $1)))
             and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean,
               coalesce((ct.feedback->>'relevant')::boolean, true)))::text as monthly_turns
         from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
         where cs.learner_id = $1`, [learnerId]
      ),
      Promise.resolve({ rows: [] as Array<{ content: Record<string, unknown> }> }),
      Promise.resolve({ rows: [] as Array<{ content: Record<string, unknown> }> }),
      this.pool.query<{ word: string }>(
        `select unlocks.word from learner_vocabulary_unlocks unlocks
         join users u on u.id = unlocks.learner_id
         where unlocks.learner_id = $1
           and unlocks.unlocked_at >= date_trunc('month', organization_system_date(u.organization_id))`, [learnerId]
      )
    ]);
    if (monthlyContext) {
      [vocabularyRows, vocabularyTotalRows] = await Promise.all([
      this.pool.query<{ content: Record<string, unknown> }>(
        `select lv.content
         from enrollments e
         join users u on u.id = e.learner_id
         join program_months pm on pm.organization_id = u.organization_id and pm.month = $2
         join month_frameworks mf on mf.program_month_id = pm.id and mf.cefr = e.cefr and mf.status = 'approved'
         join month_lessons ml on ml.framework_id = mf.id and ml.status = 'approved' and ml.lesson_id is not null
         join lessons l on l.id = ml.lesson_id
         join progress_records pr on pr.lesson_id = l.id and pr.learner_id = $1 and pr.status = 'completed'
         join lateral (
           select content from lesson_versions where lesson_id = l.id and status = 'published'
           order by version desc limit 1
         ) lv on true
         where e.learner_id = $1 and ml.lesson_date <= organization_system_date(u.organization_id)
         order by ml.lesson_number`,
        [learnerId, monthlyContext.month]
      ),
      this.pool.query<{ content: Record<string, unknown> }>(
        `select lv.content
         from enrollments e
         join users u on u.id = e.learner_id
         join program_months pm on pm.organization_id = u.organization_id and pm.month = $2
         join month_frameworks mf on mf.program_month_id = pm.id and mf.cefr = e.cefr and mf.status = 'approved'
         join month_lessons ml on ml.framework_id = mf.id and ml.status = 'approved' and ml.lesson_id is not null
         join lessons l on l.id = ml.lesson_id
         join lateral (
           select content from lesson_versions where lesson_id = l.id and status = 'published'
           order by version desc limit 1
         ) lv on true
         where e.learner_id = $1
         order by ml.lesson_number`,
        [learnerId, monthlyContext.month]
      )
      ]);
    }
    const messages: CoachView["messages"] = [];
    const openedWords = new Set<string>(unlockedRows.rows.map((row) => row.word.toLowerCase()));
    for (const turn of turns.rows) {
      const text = typeof turn.content.text === "string" ? turn.content.text : "";
      const audioArtifact = audioArtifactFromContent(turn.content);
      const feedback = coachFeedback(turn.feedback);
      const feedbackRecord = turn.feedback ?? {};
      if (feedbackRecord.evaluation && typeof feedbackRecord.evaluation === "object"
        && !Array.isArray(feedbackRecord.evaluation)
        && (feedbackRecord.evaluation as Record<string, unknown>).status === "valid"
        && (feedbackRecord.evaluation as Record<string, unknown>).countsTowardGoal === true
        && Array.isArray(feedbackRecord.usedWords)) {
        for (const word of feedbackRecord.usedWords) if (typeof word === "string") openedWords.add(word.toLowerCase());
      }
      const classification = coachTurnClassification(feedbackRecord);
      if (turn.speaker === "coach") {
        if (text) messages.push({ id: turn.id, speaker: "coach", text, createdAt: turn.created_at.toISOString(), ...(classification ? { classification } : {}) });
        continue;
      }
      if (text || audioArtifact) messages.push({ id: turn.id, speaker: "learner", text, createdAt: turn.created_at.toISOString(), ...(classification ? { classification } : {}), ...(audioArtifact ? { audioArtifact } : {}) });
      const coachText = storedCoachSpokenText(feedbackRecord);
      if (coachText) messages.push({
        id: `${turn.id}:coach`, speaker: "coach", text: coachText,
        createdAt: turn.created_at.toISOString(), ...(classification ? { classification } : {}), ...(feedback ? { feedback } : {})
      });
    }
    messages.unshift({
      id: `${sessionId}:opening`, speaker: "coach", text: openingQuestion,
      createdAt: new Date(0).toISOString()
    });
    const vocabularyCandidates = vocabularyRows.rows.flatMap(({ content }) => {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      const vocabularyPart = parts.find((part) =>
        part && typeof part === "object" && !Array.isArray(part) && (part as Record<string, unknown>).code === "vocabulary"
      ) as Record<string, unknown> | undefined;
      const vocabularyContent = vocabularyPart?.content;
      const items = vocabularyContent && typeof vocabularyContent === "object" && !Array.isArray(vocabularyContent)
        && Array.isArray((vocabularyContent as Record<string, unknown>).items)
        ? (vocabularyContent as Record<string, unknown>).items as unknown[] : [];
      return items.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const value = item as Record<string, unknown>;
        const word = typeof value.word === "string" ? value.word.trim().replace(/\s+/g, " ") : "";
        if (!isPlausibleCoachVocabularyWord(word)) return [];
        return [{ word, meaning: typeof value.meaning === "string" ? value.meaning : "", opened: openedWords.has(word.toLowerCase()) }];
      });
    });
    const vocabularyByWord = new Map<string, CoachView["vocabulary"][number]>();
    for (const item of vocabularyCandidates) {
      const key = item.word.trim().toLocaleLowerCase();
      if (!key || vocabularyByWord.has(key)) continue;
      vocabularyByWord.set(key, item);
    }
    const vocabulary = [...vocabularyByWord.values()];
    const allMonthlyVocabulary = new Set(vocabularyTotalRows.rows.flatMap(({ content }) => {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      const vocabularyPart = parts.find((part) =>
        part && typeof part === "object" && !Array.isArray(part) && (part as Record<string, unknown>).code === "vocabulary"
      ) as Record<string, unknown> | undefined;
      const vocabularyContent = vocabularyPart?.content;
      const items = vocabularyContent && typeof vocabularyContent === "object" && !Array.isArray(vocabularyContent)
        && Array.isArray((vocabularyContent as Record<string, unknown>).items)
        ? (vocabularyContent as Record<string, unknown>).items as unknown[] : [];
      return items.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const word = typeof (item as Record<string, unknown>).word === "string"
          ? (item as Record<string, unknown>).word as string : "";
        return isPlausibleCoachVocabularyWord(word) ? [word.trim().replace(/\s+/g, " ").toLocaleLowerCase()] : [];
      });
    }));
    const openedVocabularyCount = vocabulary.filter((item) => item.opened).length;
    const questionHistory = [...new Set([
      ...priorQuestions,
      openingQuestion,
      ...turns.rows.flatMap((turn) => {
        const nextQuestion = typeof turn.feedback?.nextQuestion === "string" ? turn.feedback.nextQuestion.trim() : "";
        return nextQuestion ? [nextQuestion] : [];
      })
    ])];
    const count = counters.rows[0] ?? { daily_used: "0", monthly_turns: "0" };
    const chatAvailability: CoachView["chatAvailability"] = row.system_day_of_week > 5
      ? { available: false, reason: "weekend" }
      : row.exam_date === row.system_date ? { available: false, reason: "monthly_exam_day" } : { available: true };
    return {
      sessionId, topic: activeTopic, cefr: row.cefr,
      persona: scenario.persona === "formal" ? "formal" : "informal",
      aiAvailable, daily: { used: Number(count.daily_used), limit: row.coach_daily_limit },
      chatAvailability,
      monthly: { label: `Tháng ${row.system_month}`, turns: Number(count.monthly_turns), target: learnerMonthlySeasonTarget(await learnerMonthlyAccess(this.pool, learnerId, row.system_month)) },
      messages, vocabulary,
      questionHistory,
      ...(monthlyContext ? { vocabularyProgress: { opened: openedVocabularyCount, total: allMonthlyVocabulary.size } } : {})
    };
  }

  async reserveDailyTurn(input: { learnerId: string; sessionId: string; requestId: string }): Promise<"reserved" | "limit" | "in_progress"> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select id from users where id = $1 for update", [input.learnerId]);
      const session = await client.query(
        "select id from coach_sessions where id = $1 and learner_id = $2 and status = 'active' for update",
        [input.sessionId, input.learnerId]
      );
      if (!session.rowCount) throw new Error("COACH_SESSION_NOT_FOUND");
      const duplicate = await client.query(
        "select 1 from coach_turn_reservations where learner_id = $1 and request_id = $2 and expires_at > now()",
        [input.learnerId, input.requestId]
      );
      if (duplicate.rowCount) {
        await client.query("rollback");
        return "in_progress";
      }
      await client.query("delete from coach_turn_reservations where learner_id = $1 and expires_at <= now()", [input.learnerId]);
      const cap = await client.query<{ daily_used: string; reserved: string; daily_limit: number }>(
        `select
           (select count(*) filter (where ct.speaker = 'learner'
               and ct.created_at >= organization_system_date(u.organization_id)
               and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean,
                 coalesce((ct.feedback->>'relevant')::boolean, true)))::text
            from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
            where cs.learner_id = u.id) as daily_used,
           (select count(*)::text from coach_turn_reservations r
            where r.learner_id = u.id
              and r.reserved_at >= organization_system_date(u.organization_id)
              and r.expires_at > now()) as reserved,
           ${coachDailyLimitSql} as daily_limit
         from users u left join organization_settings os on os.organization_id = u.organization_id
         where u.id = $1 group by u.id, os.configuration`,
        [input.learnerId]
      );
      const capRow = cap.rows[0] ?? { daily_used: "0", reserved: "0", daily_limit: 30 };
      if (Number(capRow.daily_used) + Number(capRow.reserved) >= capRow.daily_limit) {
        await client.query("rollback");
        return "limit";
      }
      await client.query(
        `insert into coach_turn_reservations (learner_id, session_id, request_id)
         values ($1, $2, $3)`,
        [input.learnerId, input.sessionId, input.requestId]
      );
      await client.query("commit");
      return "reserved";
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseDailyTurn(learnerId: string, requestId: string): Promise<void> {
    await this.pool.query(
      "delete from coach_turn_reservations where learner_id = $1 and request_id = $2",
      [learnerId, requestId]
    );
  }

  async saveAiTurn(input: {
    learnerId: string;
    sessionId: string;
    requestId: string;
    message: string;
    audio?: AudioArtifactInput;
    taskId: string;
    promptVersionId: string;
    output: {
      feedbackStatus?: "unavailable";
      evaluation: { status: "valid" | "insufficient" | "off_topic"; result: "correct" | "partially_correct" | "missing_information" | "off_topic"; countsTowardGoal: boolean; noteVi: string };
      seasonReply: string; seasonReplyTranslation: string; nextQuestion: string; nextQuestionTranslation: string;
      rubric: {
        meaning: { score: number; evidence: string; improvement: string };
        vocabulary: { score: number; evidence: string; improvement: string };
        grammar: { score: number; evidence: string; improvement: string };
      };
      corrections: Array<{ original: string; corrected: string; translation: string; reason: string }>;
      correctedText: string; suggestedAnswer: { text: string; translation: string; kind?: "idea" }; usedWords: string[];
    };
    metadata: {
      traceId: string; provider: string; model: string; inputHash: string;
      usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; latencyMs: number;
    };
    challengeAttemptId?: string;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select id from users where id = $1 for update", [input.learnerId]);
      const locked = await client.query(
        "select id from coach_sessions where id = $1 and learner_id = $2 and status = 'active' for update",
        [input.sessionId, input.learnerId]
      );
      if (!locked.rowCount) throw new Error("COACH_SESSION_NOT_FOUND");
      const cap = await client.query<{ daily_used: string; daily_limit: number }>(
        `select count(*) filter (where ct.speaker = 'learner' and ct.created_at >= organization_system_date(u.organization_id)
            and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean,
              coalesce((ct.feedback->>'relevant')::boolean, true)))::text as daily_used,
                ${coachDailyLimitSql} as daily_limit
         from users u
         left join organization_settings os on os.organization_id = u.organization_id
         left join coach_sessions cs on cs.learner_id = u.id
         left join coach_turns ct on ct.session_id = cs.id
         where u.id = $1
         group by u.id, os.configuration`,
        [input.learnerId]
      );
      const capRow = cap.rows[0] ?? { daily_used: "0", daily_limit: 30 };
      if (Number(capRow.daily_used) >= capRow.daily_limit) {
        throw Object.assign(new Error("COACH_DAILY_LIMIT"), { code: "COACH_DAILY_LIMIT" });
      }
      const runId = randomUUID();
      const inserted = await client.query<{ id: string }>(
        `insert into ai_runs
           (id, task_id, user_id, prompt_version_id, provider, model, status, input_hash,
            output, usage, latency_ms, trace_id, request_key, completed_at)
         values ($1, $2, $3, $4, $5, $6, 'succeeded', $7, $8::jsonb, $9::jsonb, $10, $11, $12, now())
         on conflict (user_id, task_id, request_key) where request_key is not null do nothing
         returning id`,
        [runId, input.taskId, input.learnerId, input.promptVersionId, input.metadata.provider,
          input.metadata.model, input.metadata.inputHash, JSON.stringify(input.output),
          JSON.stringify(input.metadata.usage), input.metadata.latencyMs, input.metadata.traceId, input.requestId]
      );
      if (!inserted.rows[0]) {
        await client.query("rollback");
        return false;
      }
      const next = await client.query<{ number: string }>(
        "select (coalesce(max(turn_number), 0) + 1)::text as number from coach_turns where session_id = $1",
        [input.sessionId]
      );
      const turnId = randomUUID();
      await client.query(
        `insert into coach_turns (id, session_id, turn_number, speaker, content, feedback, ai_run_id)
         values ($1, $2, $3, 'learner', $4::jsonb, $5::jsonb, $6)`,
        [turnId, input.sessionId, Number(next.rows[0]?.number ?? 1),
          JSON.stringify({ text: input.message, requestId: input.requestId, ...(input.audio ? { audioArtifact: storedAudioArtifact(input.audio) } : {}) }),
          JSON.stringify({
            coachText: coachSpokenText(input.output.seasonReply, input.output.nextQuestion),
            ...(input.output.feedbackStatus ? { feedbackStatus: input.output.feedbackStatus } : {}),
            evaluation: input.output.evaluation,
            seasonReply: input.output.seasonReply, seasonReplyTranslation: input.output.seasonReplyTranslation,
            nextQuestion: input.output.nextQuestion, nextQuestionTranslation: input.output.nextQuestionTranslation,
            rubric: input.output.rubric, corrections: input.output.corrections,
            correctedText: input.output.correctedText, suggestedAnswer: input.output.suggestedAnswer,
            usedWords: input.output.usedWords, checked: false
          }), runId]
      );
      if (input.output.evaluation.countsTowardGoal && input.output.usedWords.length) {
        for (const word of new Set(input.output.usedWords.map((value) => value.trim()).filter(Boolean))) {
          await client.query(
            `insert into learner_vocabulary_unlocks (learner_id, word, unlocked_at)
             values ($1, $2, now())
             on conflict (learner_id, word) do update set unlocked_at = excluded.unlocked_at`,
            [input.learnerId, word]
          );
        }
      }
      if (input.audio) await linkAudioOnClient(client, {
        ownerUserId: input.learnerId, audio: input.audio, sourceFlow: "season", sourceEntityId: turnId
      });
      if (input.output.evaluation.countsTowardGoal) await client.query(
        `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
         values ($1, $2, 'coach', 'coach_turn', $3, 2, $4::jsonb)`,
        [randomUUID(), input.learnerId, turnId, JSON.stringify({
          countsTowardGoal: input.output.evaluation.countsTowardGoal,
          status: input.output.evaluation.status,
          rubric: {
            meaning: input.output.rubric.meaning.score,
            vocabulary: input.output.rubric.vocabulary.score,
            grammar: input.output.rubric.grammar.score
          }
        })]
      );
      if (input.challengeAttemptId) {
        const challenge = await client.query<{ completed_turns: string; average: string | null; off_topic: string }>(
          `select count(*) filter (where speaker = 'learner' and coalesce(feedback->'evaluation'->>'status', 'valid') <> 'insufficient')::text as completed_turns,
                  avg(((feedback->'rubric'->'meaning'->>'score')::numeric + (feedback->'rubric'->'vocabulary'->>'score')::numeric + (feedback->'rubric'->'grammar'->>'score')::numeric) / 3)
                    filter (where speaker = 'learner' and coalesce(feedback->'evaluation'->>'status', 'valid') <> 'insufficient')::text as average,
                  count(*) filter (where speaker = 'learner' and coalesce(feedback->'evaluation'->>'status', case when coalesce((feedback->>'relevant')::boolean, true) then 'valid' else 'off_topic' end) = 'off_topic')::text as off_topic
           from coach_turns where session_id = $1`, [input.sessionId]
        );
        const stats = challenge.rows[0] ?? { completed_turns: "0", average: null, off_topic: "0" };
        const completedTurns = Number(stats.completed_turns);
        if (completedTurns >= 6) {
          const average = stats.average === null ? 0 : Math.round(Number(stats.average) * 10) / 10;
          const offTopic = Number(stats.off_topic);
          const passed = average >= 3.5 && offTopic <= 1;
          const resultId = randomUUID();
          await client.query(
            `insert into level_up_challenge_results
               (id, assessment_attempt_id, session_id, learner_id, completed_turns, average, off_topic, passed)
             values ($1, $2, $3, $4, $5, $6, $7, $8)
             on conflict (assessment_attempt_id) do update
             set session_id = excluded.session_id, completed_turns = excluded.completed_turns,
                 average = excluded.average, off_topic = excluded.off_topic, passed = excluded.passed`,
            [resultId, input.challengeAttemptId, input.sessionId, input.learnerId, completedTurns, average, offTopic, passed]
          );
          if (passed) {
            await client.query(
              `insert into assessment_decisions
                 (id, attempt_id, suggested_level, status, reason)
               select $1, aa.id, cs.scenario->>'targetLevel', 'suggested', $4
               from assessment_attempts aa join coach_sessions cs on cs.id = $3
               where aa.id = $2 and aa.learner_id = $5
               on conflict (attempt_id) do update
               set suggested_level = coalesce(assessment_decisions.suggested_level, excluded.suggested_level),
                   status = case when assessment_decisions.status in ('approved', 'rejected') then assessment_decisions.status else 'suggested' end,
                   reason = case when assessment_decisions.status in ('approved', 'rejected') then assessment_decisions.reason else excluded.reason end`,
              [randomUUID(), input.challengeAttemptId, input.sessionId, "Season challenge passed; pending operator approval.", input.learnerId]
            );
          }
          // A completed challenge is the learner's level-up submission. Move
          // the attempt into the same review lifecycle used by the operator
          // approval route so a pending request can actually be approved (or
          // retried) after a reload.
          await client.query(
            `update assessment_attempts
             set status = case when $3 then 'pending_review' else 'needs_retry' end,
                 current_section = null,
                 submitted_at = coalesce(submitted_at, now()),
                 updated_at = now()
             where id = $1 and learner_id = $2
               and status in ('in_progress', 'submitted', 'pending_review', 'approved')`,
            [input.challengeAttemptId, input.learnerId, passed]
          );
          await client.query(
            `update coach_sessions set status = 'completed', completed_at = coalesce(completed_at, now())
             where id = $1 and learner_id = $2 and scenario->>'kind' = 'level_up'`,
            [input.sessionId, input.learnerId]
          );
        }
      }
      await syncLearnerRewards(client, input.learnerId);
      await client.query(
        "delete from coach_turn_reservations where learner_id = $1 and request_id = $2",
        [input.learnerId, input.requestId]
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async hasPracticeTurn(sessionId: string, requestId: string): Promise<boolean> {
    const result = await this.pool.query(
      "select 1 from coach_turns where session_id = $1 and content->>'requestId' = $2 limit 1",
      [sessionId, requestId]
    );
    return Boolean(result.rowCount);
  }

  async saveLocalPracticeTurn(input: {
    learnerId: string;
    sessionId: string;
    requestId: string;
    message: string;
    audio?: AudioArtifactInput;
    currentQuestion: string;
    seasonReply: string;
    seasonReplyTranslation: string;
    nextQuestion: string;
    nextQuestionTranslation: string;
    reasonVi?: string;
    aiFailureCode?: string;
    /** Answer idea for the re-asked question (for example after "I don't know"). */
    suggestedAnswer?: { text: string; translation: string };
    /** Clarification / "I don't know": stored without a rubric penalty. */
    notScored?: boolean;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const locked = await client.query(
        "select id from coach_sessions where id = $1 and learner_id = $2 and status = 'active' for update",
        [input.sessionId, input.learnerId]
      );
      if (!locked.rowCount) throw new Error("COACH_SESSION_NOT_FOUND");
      const duplicate = await client.query(
        "select 1 from coach_turns where session_id = $1 and content->>'requestId' = $2 limit 1",
        [input.sessionId, input.requestId]
      );
      if (duplicate.rowCount) {
        await client.query("rollback");
        return false;
      }
      const next = await client.query<{ number: string }>(
        "select (coalesce(max(turn_number), 0) + 1)::text as number from coach_turns where session_id = $1",
        [input.sessionId]
      );
      const turnId = randomUUID();
      await client.query(
        `insert into coach_turns (id, session_id, turn_number, speaker, content, feedback)
         values ($1, $2, $3, 'learner', $4::jsonb, $5::jsonb)`,
        [turnId, input.sessionId, Number(next.rows[0]?.number ?? 1),
          JSON.stringify({ text: input.message, requestId: input.requestId, ...(input.audio ? { audioArtifact: storedAudioArtifact(input.audio) } : {}) }),
          JSON.stringify({
            coachText: input.aiFailureCode ? coachSpokenText(input.seasonReply, input.nextQuestion) : input.seasonReply,
            ...(input.aiFailureCode ? { feedbackStatus: "unavailable", aiFailureCode: input.aiFailureCode } : {}),
            evaluation: { status: "insufficient", result: "missing_information", countsTowardGoal: Boolean(input.aiFailureCode), noteVi: input.reasonVi ?? input.seasonReplyTranslation },
            seasonReply: input.seasonReply, seasonReplyTranslation: input.seasonReplyTranslation,
            nextQuestion: input.nextQuestion,
            nextQuestionTranslation: input.nextQuestionTranslation,
            ...(input.notScored ? { notScored: true } : {}),
            ...(input.aiFailureCode ? {} : { rubric: input.notScored ? {
              meaning: { score: 0, evidence: "Season hỏi lại câu hỏi; lượt này không chấm điểm.", improvement: "" },
              vocabulary: { score: 0, evidence: "Season hỏi lại câu hỏi; lượt này không chấm điểm.", improvement: "" },
              grammar: { score: 0, evidence: "Season hỏi lại câu hỏi; lượt này không chấm điểm.", improvement: "" }
            } : {
              meaning: { score: 0, evidence: `“${input.message}” chưa đủ thông tin để trả lời câu hỏi.`, improvement: "Viết một câu có chủ ngữ và ý chính." },
              vocabulary: { score: 0, evidence: "Chưa đủ nội dung để đánh giá từ vựng.", improvement: "Dùng ít nhất một từ liên quan đến câu hỏi." },
              grammar: { score: 0, evidence: "Chưa đủ câu để đánh giá ngữ pháp.", improvement: "Viết một câu tiếng Anh hoàn chỉnh." }
            } }),
            corrections: [], correctedText: "",
            suggestedAnswer: input.suggestedAnswer?.text.trim()
              ? { text: input.suggestedAnswer.text.trim(), translation: input.suggestedAnswer.translation.trim(), kind: "idea" }
              : { text: "", translation: "" },
            usedWords: [], checked: false
          })]
      );
      if (input.audio) await linkAudioOnClient(client, {
        ownerUserId: input.learnerId, audio: input.audio, sourceFlow: "season", sourceEntityId: turnId
      });
      if (input.aiFailureCode) {
        await client.query(
          `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
           select $1, organization_id, id, 'coach.practice_turn_credited_during_outage', 'coach_turn', $3,
             jsonb_build_object('code', $4::text, 'requestId', $5::text, 'practiceDate', organization_system_date(organization_id)), $6
           from users where id = $2`,
          [randomUUID(), input.learnerId, turnId, input.aiFailureCode, input.requestId, randomUUID()]
        );
      }
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async challengeForLearner(learnerId: string, aiAvailable: boolean): Promise<LevelChallengeView | null> {
    const attempt = await this.pool.query<{
      attempt_id: string; target_level: CefrLevel; session_id: string | null; session_status: string | null;
      blueprint: StoredAssessmentDefinition; section_scores: Partial<Record<AssessmentSectionCode, number>>;
      result_id: string | null; result_completed_turns: number | null; result_average: string | null;
      result_off_topic: number | null; result_passed: boolean | null; result_created_at: Date | null;
      decision_id: string | null; decision_status: string | null; decision_decided_at: Date | null;
    }>(
      `select aa.id as attempt_id, av.blueprint->>'targetLevel' as target_level, av.blueprint,
              coalesce(scores.section_scores, '{}'::jsonb) as section_scores,
              cs.id as session_id, cs.status as session_status,
              result.id as result_id, result.completed_turns as result_completed_turns, result.average::text as result_average,
              result.off_topic as result_off_topic, result.passed as result_passed, result.created_at as result_created_at,
              decision.id as decision_id, decision.status as decision_status,
              decision.decided_at as decision_decided_at
       from assessment_attempts aa
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'level_up'
       join users learner on learner.id = aa.learner_id and learner.status = 'active'
       left join lateral (
         select id, status from coach_sessions
         where learner_id = aa.learner_id and scenario->>'kind' = 'level_up'
           and scenario->>'assessmentAttemptId' = aa.id::text
         order by started_at desc limit 1
       ) cs on true
       left join level_up_challenge_results result on result.assessment_attempt_id = aa.id
       left join assessment_decisions decision on decision.attempt_id = aa.id
       left join lateral (
         select jsonb_object_agg(sc.section, sc.score) as section_scores
         from assessment_scores sc where sc.attempt_id = aa.id
       ) scores on true
        where aa.learner_id = $1 and aa.status in ('pending_review', 'approved')
       order by aa.submitted_at desc nulls last limit 1`,
      [learnerId]
    );
    const row = attempt.rows[0];
    if (!row?.target_level) return null;
    const maxima = Object.fromEntries(row.blueprint.sections.map((section) => [section.code, section.maxScore])) as Record<AssessmentSectionCode, number>;
    const scores = row.section_scores as Record<AssessmentSectionCode, number>;
    if ((["listening", "reading", "writing", "speaking"] as const).some((section) => scores[section] === undefined)) return null;
    if (!passesLevelUpExam(scores, maxima)) {
      const failedAt = new Date();
      const retry = createLevelRetryPlan({
        failedAt,
        scores,
        readinessSnapshot: {
          lessonCompletion: 0, firstTryAccuracy: 0, weeklyPractice: 0,
          coachRubric: 0, coachTurns: 0, wrongRate: 0, attemptedParts: 0
        }
      });
      await this.pool.query(
        `insert into level_up_retry_plans
           (id, assessment_attempt_id, learner_id, eligible_at, weakest_skill, readiness_snapshot)
         values ($1, $2, $3, $4, $5, $6::jsonb)
         on conflict (assessment_attempt_id) do nothing`,
        [randomUUID(), row.attempt_id, learnerId, retry.eligibleAt, retry.weakestSkill,
          JSON.stringify({ ...retry.readinessSnapshot, examScores: scores, maxima, targetLevel: row.target_level })]
      );
      await this.pool.query(
        "update assessment_attempts set status = 'needs_retry', updated_at = now() where id = $1 and learner_id = $2",
        [row.attempt_id, learnerId]
      );
      return null;
    }
    let sessionId = row.session_id;
    if (!sessionId) {
      sessionId = randomUUID();
      await this.pool.query(
        `insert into coach_sessions (id, learner_id, scenario, status)
         values ($1, $2, $3::jsonb, 'active')`,
        [sessionId, learnerId, JSON.stringify({
          kind: "level_up", assessmentAttemptId: row.attempt_id, targetLevel: row.target_level,
          title: `Thử thách lên mức ${row.target_level}`, persona: "formal"
        })]
      );
    }
    const [turns, counters] = await Promise.all([
      this.pool.query<{
        id: string; speaker: string; content: Record<string, unknown>;
        feedback: Record<string, unknown> | null; created_at: Date;
      }>(
        `select id, speaker, content, feedback, created_at from coach_turns
         where session_id = $1 order by turn_number, created_at`, [sessionId]
      ),
      this.pool.query<{ daily_used: string }>(
        `select count(*) filter (where ct.speaker = 'learner' and ct.created_at >= current_date
           and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true)))::text as daily_used
         from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
         where cs.learner_id = $1`, [learnerId]
      )
    ]);
    const messages: LevelChallengeView["messages"] = [{
      id: "challenge-welcome", speaker: "coach",
      text: `Hi! This is your ${row.target_level} challenge. Tell me about a recent problem at work and how you handled it.`,
      createdAt: new Date(0).toISOString()
    }];
    let scoreTotal = 0;
    let scoredTurns = 0;
    let offTopic = 0;
    for (const turn of turns.rows) {
      const text = typeof turn.content.text === "string" ? turn.content.text : "";
      const feedback = coachFeedback(turn.feedback);
      const feedbackRecord = turn.feedback ?? {};
      if (turn.speaker === "coach") {
        if (text) messages.push({ id: turn.id, speaker: "coach", text, createdAt: turn.created_at.toISOString() });
        continue;
      }
      if (text) messages.push({ id: turn.id, speaker: "learner", text, createdAt: turn.created_at.toISOString() });
      const coachText = storedCoachSpokenText(feedbackRecord);
      if (feedback) {
        if (feedback.evaluation.status !== "insufficient") {
          scoreTotal += (feedback.rubric.meaning.score + feedback.rubric.vocabulary.score + feedback.rubric.grammar.score) / 3;
          scoredTurns += 1;
        }
        if (feedback.evaluation.status === "off_topic") offTopic += 1;
      }
      if (coachText) messages.push({
        id: `${turn.id}:coach`, speaker: "coach", text: coachText,
        createdAt: turn.created_at.toISOString(), ...(feedback ? { feedback } : {})
      });
    }
    const average = scoredTurns ? Math.round(scoreTotal / scoredTurns * 10) / 10 : 0;
    const complete = scoredTurns >= 6;
    const result = row.result_id ? {
      id: row.result_id,
      assessmentAttemptId: row.attempt_id,
      sessionId,
      completedTurns: Number(row.result_completed_turns ?? scoredTurns),
      average: Number(row.result_average ?? average),
      offTopic: Number(row.result_off_topic ?? offTopic),
      passed: Boolean(row.result_passed),
      createdAt: row.result_created_at?.toISOString() ?? new Date().toISOString()
    } satisfies LevelChallengeResultView : null;
    const request = row.decision_id && (row.decision_status === "suggested" || row.decision_status === "approved" || row.decision_status === "rejected")
      ? {
          id: row.decision_id,
          assessmentAttemptId: row.attempt_id,
          targetLevel: row.target_level,
          status: row.decision_status === "suggested" ? "pending" as const : row.decision_status === "approved" ? "approved" as const : "rejected" as const,
          // assessment_decisions intentionally has no created_at column. The
          // result is created in the same challenge transaction, so expose its
          // timestamp as the request timestamp and fall back to the decision
          // timestamp for legacy rows.
          createdAt: row.result_created_at?.toISOString() ?? row.decision_decided_at?.toISOString() ?? new Date().toISOString(),
          decidedAt: row.decision_decided_at?.toISOString() ?? null
        } satisfies LevelChallengeRequestView : null;
    const phase = result ? "complete" : scoredTurns ? "resume" : "new";
    return {
      sessionId, assessmentAttemptId: row.attempt_id, targetLevel: row.target_level, aiAvailable,
      daily: { used: Number(counters.rows[0]?.daily_used ?? 0), limit: 30 },
      progress: { completedTurns: scoredTurns, requiredTurns: 6, average, offTopic, complete, passed: result?.passed ?? (complete && average >= 3.5 && offTopic <= 1) },
      phase,
      result,
      request,
      retakePlan: result && (!result.passed || row.decision_status === "retry")
        ? { status: "available", message: "Season đã tạo kế hoạch luyện lại cho bạn." } : null,
      messages
    };
  }

  async finalizeChallenge(learnerId: string, sessionId: string): Promise<void> {
    await this.pool.query(
      `update coach_sessions set status = 'completed', completed_at = now()
       where id = $1 and learner_id = $2 and scenario->>'kind' = 'level_up'
          and (select count(*) from coach_turns where session_id = $1 and speaker = 'learner'
            and coalesce(feedback->'evaluation'->>'status', 'valid') <> 'insufficient') >= 6`,
      [sessionId, learnerId]
    );
  }

  async setPersona(learnerId: string, persona: CoachPersona): Promise<void> {
    await this.pool.query(
      `update coach_sessions set scenario = jsonb_set(scenario, '{persona}', to_jsonb($2::text), true)
       where id = (select id from coach_sessions where learner_id = $1 and status = 'active'
         and coalesce(scenario->>'kind', 'practice') = 'practice' order by started_at desc limit 1)`,
      [learnerId, persona]
    );
  }

  async archiveCurrent(learnerId: string): Promise<void> {
    await this.pool.query(
      `update coach_sessions set status = 'completed', completed_at = now()
       where id = (select id from coach_sessions where learner_id = $1 and status = 'active'
         and coalesce(scenario->>'kind', 'practice') = 'practice' order by started_at desc limit 1)`,
      [learnerId]
    );
  }
}

const monthlyCoachFallbackTopics = [
  "a workplace check-in",
  "planning a workday",
  "helping a colleague",
  "joining a meeting"
] as const;

function randomMonthlyCoachTopic(): string {
  return monthlyCoachFallbackTopics[Math.floor(Math.random() * monthlyCoachFallbackTopics.length)]!;
}
/** Manager monthly state for a learner without an approved level. "Chờ duyệt
 * mức" must match the operator review queue (`listPending`), which only holds
 * `pending_review` attempts: a `submitted` placement is saved but not graded
 * yet, so it is not in the queue and is reported separately. */
export function managerPlacementState(
  status: "in_progress" | "submitted" | "pending_review" | "approved" | "needs_retry" | null
): "unplaced" | "placement_in_progress" | "placement_submitted" | "placement_pending" | "placement_retry" {
  if (status === "in_progress") return "placement_in_progress";
  if (status === "needs_retry") return "placement_retry";
  if (status === "submitted") return "placement_submitted";
  return status ? "placement_pending" : "unplaced";
}

export function coachOpeningQuestion(firstName: string, topic: string, previousQuestions: readonly string[] | string = []): string {
  const normalized = topic.toLocaleLowerCase();
  let prompts: string[];
  if (normalized.includes("feedback")) {
    prompts = [
      `Hi ${firstName}! Let's practise "${topic}". A colleague's report is clear, but one slide has too much text. What feedback would you give?`,
      `Hi ${firstName}! We're still working on "${topic}". A client has concerns about your latest update. What would you say to understand their feedback?`,
      `Hi ${firstName}! Let's take another angle on "${topic}". A teammate asks you to review a draft before a client meeting. What would you check first?`,
      `Hi ${firstName}! We're continuing "${topic}". A client asks for a clearer project timeline. How would you respond?`,
      `Hi ${firstName}! Let's keep practising "${topic}". Your manager wants a short summary of client comments. What would you highlight?`
    ];
  } else if (normalized.includes("email") || normalized.includes("reschedul")) {
    prompts = [
      `Hi ${firstName}! Let's practise "${topic}". You need to move tomorrow's meeting to Friday. What would you write?`,
      `Hi ${firstName}! We're still working on "${topic}". Your manager asks whether the meeting time still works. How would you ask to reschedule it?`,
      `Hi ${firstName}! Let's take another angle on "${topic}". A client cannot attend the meeting you arranged. What would you email them?`,
      `Hi ${firstName}! We're continuing "${topic}". The new meeting time conflicts with another call. How would you explain that?`,
      `Hi ${firstName}! Let's keep practising "${topic}". You need to confirm Friday's meeting with the team. What would you write?`
    ];
  } else if (normalized.includes("introduc") || normalized.includes("your job")) {
    prompts = [
      `Hi ${firstName}! Let's practise "${topic}". Imagine you're meeting a new colleague. How would you introduce yourself and your role?`,
      `Hi ${firstName}! We're still working on "${topic}". You're meeting a new teammate. How would you describe what you do?`,
      `Hi ${firstName}! Let's take another angle on "${topic}". A client asks what your team does. How would you explain it?`,
      `Hi ${firstName}! We're continuing "${topic}". A new colleague asks what you are working on this week. What would you tell them?`,
      `Hi ${firstName}! Let's keep practising "${topic}". You're joining a project meeting for the first time. How would you introduce yourself?`
    ];
  } else if (normalized.includes("monthly workplace practice")) {
    prompts = [
      `Hi ${firstName}! Let's practise a workplace conversation for this month. Imagine you are checking in with a colleague. What would you say first?`,
      `Hi ${firstName}! Let's practise a different workplace situation. A colleague asks for an update. What would you tell them?`,
      `Hi ${firstName}! Let's try another workplace situation. A teammate needs help with a deadline. What would you ask them?`,
      `Hi ${firstName}! Imagine you're meeting a client this week. What information would you share first?`,
      `Hi ${firstName}! A colleague asks you to join a project meeting. What would you clarify before it starts?`
    ];
  } else {
    prompts = [
      `Hi ${firstName}! Let's practise "${topic}". Think of a real situation at work. What would you say first?`,
      `Hi ${firstName}! We're still working on "${topic}". A colleague brings this up at work. How would you respond?`,
      `Hi ${firstName}! Let's take another angle on "${topic}". A teammate asks for your view in a meeting. What would you tell them?`,
      `Hi ${firstName}! We're continuing "${topic}". A client needs a quick update. What would you explain first?`,
      `Hi ${firstName}! Let's keep practising "${topic}". A manager asks about the next step. What would you recommend?`
    ];
  }
  const normalize = (value: string) => value.normalize("NFKC").replace(/[“”]/gu, '"').replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
  const priorValues = typeof previousQuestions === "string" ? [previousQuestions] : previousQuestions;
  const prior = new Set(priorValues.map(normalize));
  return prompts.find((prompt) => !prior.has(normalize(prompt))) ?? prompts[0]!;
}

export function coachSpokenText(reply: string, question: string): string {
  const spoken = reply.trim();
  const followUp = question.trim();
  // An Informal turn ends "…question? 😊": the trailing emoji does not make
  // the question missing, so it is not appended a second time.
  const withoutEmoji = spoken.replace(/[\p{Extended_Pictographic}️\s]+$/gu, "").trim();
  return spoken.endsWith(followUp) || withoutEmoji.endsWith(followUp) ? spoken : `${spoken} ${followUp}`.trim();
}

function storedCoachSpokenText(value: Record<string, unknown>): string {
  const text = typeof value.coachText === "string" ? value.coachText : "";
  const reply = typeof value.seasonReply === "string" ? value.seasonReply : "";
  const question = typeof value.nextQuestion === "string" ? value.nextQuestion : "";
  return text === `${reply} ${question}`.trim() ? coachSpokenText(reply, question) : text;
}

function coachFeedback(value: Record<string, unknown> | null): CoachFeedbackView | null {
  if (!value) return null;
  const rubric = value.rubric && typeof value.rubric === "object" && !Array.isArray(value.rubric)
    ? value.rubric as Record<string, unknown> : null;
  if (!rubric && typeof value.aiFailureCode !== "string") return null;
  const classification = coachTurnClassification(value);
  const correctionSource = Array.isArray(value.corrections) ? value.corrections : Array.isArray(value.suggestions) ? value.suggestions : [];
  const corrections = correctionSource.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    const reason = typeof entry.reason === "string" ? entry.reason : typeof entry.explanation === "string" ? entry.explanation : "";
    if (typeof entry.original !== "string" || typeof entry.corrected !== "string" || !reason) return [];
    return [{
      original: entry.original,
      corrected: entry.corrected,
      translation: typeof entry.translation === "string" ? entry.translation : "",
      reason
    }];
  });
  const evaluationSource = value.evaluation && typeof value.evaluation === "object" && !Array.isArray(value.evaluation)
    ? value.evaluation as Record<string, unknown> : null;
  const legacyGenericFallback = evaluationSource?.noteVi === "Bạn đã phản hồi đúng tình huống."
    && coachRubricCriterion(rubric?.meaning).evidence === "Câu trả lời bám sát tình huống."
    && coachRubricCriterion(rubric?.vocabulary).evidence === "Từ vựng phù hợp ngữ cảnh."
    && coachRubricCriterion(rubric?.grammar).evidence === "Cấu trúc câu rõ ràng."
    && coachRubricCriterion(rubric?.meaning).score === 4
    && coachRubricCriterion(rubric?.vocabulary).score === 4
    && coachRubricCriterion(rubric?.grammar).score === 4
    && !corrections.length;
  const feedbackUnavailable = value.feedbackStatus === "unavailable" || legacyGenericFallback;
  const legacyRelevant = value.relevant !== false;
  const status = feedbackUnavailable ? "insufficient" : evaluationSource?.status === "insufficient" || evaluationSource?.status === "off_topic"
    ? evaluationSource.status : legacyRelevant ? "valid" : "off_topic";
  const countsTowardGoal = feedbackUnavailable && typeof value.aiFailureCode !== "string" ? false : typeof evaluationSource?.countsTowardGoal === "boolean"
    ? evaluationSource.countsTowardGoal : status === "valid";
  const result = feedbackUnavailable ? "missing_information" : evaluationSource?.result === "correct" || evaluationSource?.result === "partially_correct"
    || evaluationSource?.result === "missing_information" || evaluationSource?.result === "off_topic"
    ? evaluationSource.result
    : status === "off_topic" ? "off_topic" : status === "insufficient" ? "missing_information" : "partially_correct";
  const suggestedAnswerSource = value.suggestedAnswer && typeof value.suggestedAnswer === "object" && !Array.isArray(value.suggestedAnswer)
    ? value.suggestedAnswer as Record<string, unknown> : null;
  const coachText = typeof value.coachText === "string" ? value.coachText : "";
  return {
    relevant: status !== "off_topic",
    relevanceNote: typeof value.relevanceNote === "string" ? value.relevanceNote : "",
    feedbackStatus: feedbackUnavailable ? "unavailable" : "complete",
    ...(typeof value.aiFailureCode === "string" ? { creditedDuringAiOutage: true } : {}),
    evaluation: {
      status,
      result,
      countsTowardGoal,
      noteVi: legacyGenericFallback
        ? "Nhận xét AI chưa có cho lượt này; câu trả lời vẫn được lưu."
        : typeof evaluationSource?.noteVi === "string"
        ? evaluationSource.noteVi : typeof value.relevanceNote === "string" ? value.relevanceNote : "Không có nhận xét chi tiết cho lượt chat cũ."
    },
    ...(classification ? { classification } : {}),
    seasonReply: typeof value.seasonReply === "string" ? value.seasonReply : coachText,
    seasonReplyTranslation: typeof value.seasonReplyTranslation === "string"
      ? value.seasonReplyTranslation : typeof value.replyTranslation === "string" ? value.replyTranslation : "",
    nextQuestion: typeof value.nextQuestion === "string" ? value.nextQuestion : "",
    nextQuestionTranslation: typeof value.nextQuestionTranslation === "string" ? value.nextQuestionTranslation : "",
    rubric: {
      meaning: coachRubricCriterion(rubric?.meaning),
      vocabulary: coachRubricCriterion(rubric?.vocabulary),
      grammar: coachRubricCriterion(rubric?.grammar)
    },
    corrections,
    correctedText: typeof value.correctedText === "string" ? value.correctedText : "",
    suggestedAnswer: {
      text: typeof suggestedAnswerSource?.text === "string" ? suggestedAnswerSource.text : "",
      translation: typeof suggestedAnswerSource?.translation === "string" ? suggestedAnswerSource.translation : "",
      ...(suggestedAnswerSource?.kind === "idea" ? { kind: "idea" as const } : {})
    },
    ...(value.notScored === true ? { notScored: true } : {})
  };
}

function isPlausibleCoachVocabularyWord(word: string): boolean {
  if (!word || word.length > 48) return false;
  return word.split(" ").length <= 5 && !/[.!?;:\n\r]/u.test(word);
}

function coachRubricCriterion(value: unknown): { score: number; evidence: string; improvement: string } {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const criterion = value as Record<string, unknown>;
    return {
      score: Number(criterion.score ?? 0),
      evidence: typeof criterion.evidence === "string" ? criterion.evidence : "Không có bằng chứng chi tiết cho lượt chat cũ.",
      improvement: typeof criterion.improvement === "string" ? criterion.improvement : "Xem câu sửa và thử lại ở lượt tiếp theo."
    };
  }
  return {
    score: Number(value ?? 0),
    evidence: "Không có bằng chứng chi tiết cho lượt chat cũ.",
    improvement: "Xem câu sửa và thử lại ở lượt tiếp theo."
  };
}

function coachTurnClassification(value: Record<string, unknown>): CoachTurnClassification | null {
  if (value.error === true || value.errorCode) return "error";
  const evaluation = value.evaluation && typeof value.evaluation === "object" && !Array.isArray(value.evaluation)
    ? value.evaluation as Record<string, unknown> : null;
  if (evaluation?.status === "insufficient") return "insufficient";
  if (evaluation?.status === "off_topic" || value.relevant === false) return "off-topic";
  const corrections = Array.isArray(value.corrections) ? value.corrections.length : Array.isArray(value.suggestions) ? value.suggestions.length : 0;
  if (corrections > 0 || (typeof value.correctedText === "string" && value.correctedText.trim())) return "corrected";
  return "normal";
}

import { calculateWeeklyPracticeScore } from "@e4s/domain/progression";

function weeklyPracticeReviewState(
  status: "draft" | "submitted" | "reviewed",
  score: Record<string, unknown> | null,
  gradingSource: "ai" | "manual" | null,
  appealStatus: "pending" | "accepted" | "rejected" | null
): WeeklyPracticeReviewState | undefined {
  if (appealStatus === "pending") return "appeal-pending";
  if (appealStatus === "accepted" || appealStatus === "rejected") return "appeal-decided";
  if (status === "draft" || (status === "submitted" && !score)) return "ungraded";
  if (gradingSource === "manual") return "graded-manual";
  if (gradingSource === "ai" || score) return "graded-ai";
  return "ungraded";
}

function weeklyPracticeTask(topic: string, cefr: CefrLevel): {
  inputMode: "write" | "dialogue";
  task: string;
  guidance: string;
} {
  if (cefr === "A1" || cefr === "A2") return {
    inputMode: "write",
    task: `Write 3–5 sentences about “${topic}”. Use at least 3 words from this week's lessons.`,
    guidance: `Viết 3–5 câu tiếng Anh về chủ đề “${topic}”. Dùng ít nhất 3 từ trong bài học tuần này.`
  };
  if (cefr === "B1") return {
    inputMode: "write",
    task: `Write a short paragraph or email (80–120 words) about “${topic}”, including one problem and one suggestion.`,
    guidance: "Write in English and clearly state one problem and one suggestion."
  };
  return {
    inputMode: "dialogue",
    task: `Write a short dialogue (8–12 lines) or a 120–180-word reflection on “${topic}”. Show a disagreement or a negotiation and how it is resolved.`,
    guidance: "Write in English and show a disagreement or negotiation and how it is resolved."
  };
}

class EngagementRepository {
  constructor(private readonly pool: Pool) {}

  async weeklyPracticeRequirements(learnerId: string): Promise<{ cefr: CefrLevel; vocabulary: string[] } | null> {
    const context = await this.activeEngagementContext(learnerId);
    if (!context) return null;
    const published = await this.pool.query<{ payload: Record<string, unknown> }>(
      `select lsv.payload
       from lesson_sets ls
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
       where ls.program_week_id = $1 and ls.cefr = $2
       order by lsv.version desc limit 1`,
      [context.weekId, context.cefr]
    );
    const weeklyPractice = published.rows[0]?.payload.weeklyPractice;
    const requiredVocabulary = weeklyPractice && typeof weeklyPractice === "object" && !Array.isArray(weeklyPractice)
      && Array.isArray((weeklyPractice as Record<string, unknown>).requiredVocabulary)
      ? (weeklyPractice as Record<string, unknown>).requiredVocabulary as unknown[]
      : [];
    const publishedVocabulary = requiredVocabulary
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (publishedVocabulary.length) return { cefr: context.cefr, vocabulary: publishedVocabulary };
    const lessonContents = await this.pool.query<{ content: Record<string, unknown> }>(
      `select lv.content
       from lesson_sets ls
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
       join lessons l on l.lesson_set_version_id = lsv.id
       join lateral (
         select content from lesson_versions
         where lesson_id = l.id and status = 'published'
         order by version desc limit 1
       ) lv on true
       where ls.program_week_id = $1 and ls.cefr = $2
       order by l.day_number`,
      [context.weekId, context.cefr]
    );
    const lessonVocabulary = lessonContents.rows.flatMap(({ content }) => {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      return parts.flatMap((part) => {
        if (!part || typeof part !== "object" || Array.isArray(part)) return [];
        const record = part as Record<string, unknown>;
        if (record.code !== "vocabulary" || !record.content || typeof record.content !== "object" || Array.isArray(record.content)) return [];
        const items = Array.isArray((record.content as Record<string, unknown>).items)
          ? (record.content as Record<string, unknown>).items as unknown[] : [];
        return items.flatMap((item) => item && typeof item === "object" && !Array.isArray(item)
          && typeof (item as Record<string, unknown>).word === "string"
          ? [String((item as Record<string, unknown>).word).trim()] : []);
      });
    }).filter(Boolean);
    if (lessonVocabulary.length) return { cefr: context.cefr, vocabulary: [...new Set(lessonVocabulary)] };
    const set = await this.pool.query<{ payload: Record<string, unknown> }>(
      `select payload from game_sets
       where program_week_id = $1 and game_key = 'weekly_vocabulary' and status = 'published'
         and learner_id is null
       order by created_at desc limit 1`,
      [context.weekId]
    );
    const words = Array.isArray(set.rows[0]?.payload.words) ? set.rows[0]!.payload.words : [];
    return {
      cefr: context.cefr,
      vocabulary: words.flatMap((item) => item && typeof item === "object" && !Array.isArray(item)
        && typeof (item as Record<string, unknown>).english === "string"
        ? [String((item as Record<string, unknown>).english)] : [])
    };
  }

  async weeklyPractice(learnerId: string): Promise<WeeklyPracticeView | null> {
    const context = await this.activeEngagementContext(learnerId);
    if (!context) return null;
    const lessons = await this.pool.query<{ total: string; completed: string }>(
      `select count(l.id)::text as total,
              count(l.id) filter (where pr.status = 'completed')::text as completed
       from lesson_sets ls
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
       join lessons l on l.lesson_set_version_id = lsv.id
       left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = $1
       where ls.program_week_id = $2 and ls.cefr = $3`,
      [learnerId, context.weekId, context.cefr]
    );
    const submission = await this.pool.query<{
      id: string; status: "draft" | "submitted" | "reviewed"; content: Record<string, unknown>;
      score: Record<string, unknown> | null; feedback: Record<string, unknown> | string | null;
      prompt_snapshot: Record<string, unknown>;
      submitted_at: Date | null;
      grading_source: "ai" | "manual" | null;
      appeal_id: string | null; appeal_status: "pending" | "accepted" | "rejected" | null;
      appeal_reason: string | null; appeal_resolution: string | null; appeal_created_at: Date | null; appeal_resolved_at: Date | null;
    }>(
      `select ps.id, ps.status, ps.content, ps.score, ps.feedback, ps.prompt_snapshot, ps.submitted_at,
              case when ps.feedback->>'source' in ('human', 'appeal-human') then 'manual' else case when ps.score is not null then 'ai' end end as grading_source,
              pa.id as appeal_id, pa.status as appeal_status, pa.reason as appeal_reason,
              pa.resolution as appeal_resolution, pa.created_at as appeal_created_at, pa.resolved_at as appeal_resolved_at
       from practice_submissions ps
       left join practice_appeals pa on pa.submission_id = ps.id
       where ps.learner_id = $1 and ps.program_week_id = $2 and ps.superseded_at is null limit 1`,
      [learnerId, context.weekId]
    );
    const history = await this.pool.query<{
      id: string; week_id: string; week_number: number; topic: string; prompt_snapshot: Record<string, unknown>;
      score: Record<string, unknown> | null; submitted_at: Date | null;
    }>(
      `select ps.id, pw.id as week_id, pw.week_number, pw.topic, ps.prompt_snapshot, ps.score, ps.submitted_at
       from practice_submissions ps
       join program_weeks pw on pw.id = ps.program_week_id
       join programs p on p.id = pw.program_id
       join enrollments e on e.program_id = p.id and e.learner_id = ps.learner_id
       where ps.learner_id = $1 and ps.program_week_id <> $2 and ps.superseded_at is null
       order by ps.submitted_at desc nulls last, pw.week_number desc
       limit 24`,
      [learnerId, context.weekId]
    );
    const count = lessons.rows[0] ?? { total: "0", completed: "0" };
    const totalLessons = Number(count.total);
    const completedLessons = Number(count.completed);
    const row = submission.rows[0];
    const state = row?.status ?? (totalLessons >= 5 && completedLessons >= 5 ? "open" : "locked");
    const content = row?.content ?? {};
    const score = row?.score ?? null;
    const feedback = row?.feedback;
    const audioArtifact = audioArtifactFromContent(content);
    const reviewState = row ? weeklyPracticeReviewState(row.status, row.score, row.grading_source, row.appeal_status) : undefined;
    const generatedPractice = weeklyPracticeTask(context.topic, context.cefr);
    const storedPrompt = row?.prompt_snapshot ?? {};
    const practice = {
      inputMode: storedPrompt.inputMode === "dialogue" ? "dialogue" as const : generatedPractice.inputMode,
      task: typeof storedPrompt.task === "string" ? storedPrompt.task : generatedPractice.task,
      guidance: typeof storedPrompt.guidance === "string" ? storedPrompt.guidance : generatedPractice.guidance
    };
    return {
      state, weekId: context.weekId, weekNumber: context.weekNumber, topic: context.topic,
      completedLessons, totalLessons,
      inputMode: practice.inputMode,
      task: practice.task,
      guidance: practice.guidance,
      submission: row ? {
        id: row.id, status: row.status, text: String(content.text ?? ""),
        submittedAt: row.submitted_at?.toISOString() ?? null,
        ...(row.grading_source ? { gradingSource: row.grading_source } : {}),
        ...(reviewState ? { reviewState } : {}),
        ...(audioArtifact ? { audioArtifact } : {}),
        score: score && typeof score.total === "number" ? {
          total: score.total,
          ...(score.rubric && typeof score.rubric === "object" ? { rubric: score.rubric as { meaning: number; vocabulary: number; grammar: number } } : {})
        } : null,
        feedback: typeof feedback === "string" ? feedback : String(feedback?.message ?? ""),
        suggestions: feedback && typeof feedback === "object" && Array.isArray(feedback.suggestions)
          ? feedback.suggestions as Array<{ original: string; corrected: string; explanation: string }> : [],
        correctedText: feedback && typeof feedback === "object" ? String(feedback.correctedText ?? "") : ""
      } : null,
      ...(reviewState ? { reviewState } : {}),
      history: history.rows.map((item) => ({
        id: item.id,
        weekId: item.week_id,
        weekNumber: item.week_number,
        topic: item.topic,
        task: typeof item.prompt_snapshot.task === "string" ? item.prompt_snapshot.task : weeklyPracticeTask(item.topic, context.cefr).task,
        submittedAt: item.submitted_at?.toISOString() ?? null,
        score: item.score && typeof item.score.total === "number" ? {
          total: item.score.total,
          ...(item.score.rubric && typeof item.score.rubric === "object"
            ? { rubric: item.score.rubric as { meaning: number; vocabulary: number; grammar: number } } : {})
        } : null
      })),
      appeal: row?.appeal_id ? {
        id: row.appeal_id,
        submissionId: row.id,
        status: row.appeal_status ?? "pending",
        reason: row.appeal_reason ?? "",
        resolution: row.appeal_resolution,
        createdAt: row.appeal_created_at?.toISOString() ?? new Date(0).toISOString(),
        resolvedAt: row.appeal_resolved_at?.toISOString() ?? null
      } satisfies WeeklyPracticeAppealView : null
    };
  }

  async assignWeeklyPractice(input: { staffId: string; learnerId: string }): Promise<import("@e4s/contracts").WeeklyPracticeAssignmentView | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const eligible = await client.query<{
        week_id: string; week_number: number; topic: string; cefr: CefrLevel; payload: Record<string, unknown>;
      }>(
        `select pw.id as week_id, pw.week_number, pw.topic, e.cefr, lsv.payload
         from users staff
         join users learner on learner.id = $2 and learner.organization_id = staff.organization_id
           and learner.role = 'learner' and learner.status = 'active'
         join enrollments e on e.learner_id = learner.id and e.cefr_approved = true
         join programs p on p.id = e.program_id and p.status = 'active'
         join program_weeks pw on pw.program_id = p.id
           and pw.week_number = coalesce(p.current_week_override,
             least(p.week_count, greatest(1, floor((organization_system_date(p.organization_id) - p.start_date) / 7.0)::int + 1)))
         join lesson_sets ls on ls.program_week_id = pw.id and ls.cefr = e.cefr
         join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
         where staff.id = $1 and staff.status = 'active' and staff.role in ('manager', 'operator')
         order by lsv.version desc limit 1
         for update of learner`,
        [input.staffId, input.learnerId]
      );
      const row = eligible.rows[0];
      if (!row) {
        await client.query("rollback");
        return null;
      }
      const generated = weeklyPracticeTask(row.topic, row.cefr);
      const stored = row.payload.weeklyPractice && typeof row.payload.weeklyPractice === "object" && !Array.isArray(row.payload.weeklyPractice)
        ? row.payload.weeklyPractice as Record<string, unknown> : {};
      const task = typeof stored.task === "string" && stored.task.trim() ? stored.task : generated.task;
      const guidance = typeof stored.guidance === "string" && stored.guidance.trim() ? stored.guidance : generated.guidance;
      const inputMode = stored.inputMode === "dialogue" ? "dialogue" : generated.inputMode;
      const requiredVocabulary = Array.isArray(stored.requiredVocabulary)
        ? stored.requiredVocabulary.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
        : [];
      const submissionId = randomUUID();
      const inserted = await client.query<{ id: string }>(
        `insert into practice_submissions
           (id, learner_id, program_week_id, status, content, prompt_snapshot, cefr_snapshot, vocabulary_snapshot, updated_at)
         values ($1, $2, $3, 'draft', '{}'::jsonb, $4::jsonb, $5, '[]'::jsonb, now())
         on conflict (learner_id, program_week_id) where superseded_at is null do nothing
         returning id`,
        [submissionId, input.learnerId, row.week_id, JSON.stringify({ task, guidance, inputMode, requiredVocabulary }), row.cefr]
      );
      const canonical = inserted.rows[0] ?? (await client.query<{ id: string }>(
        `select id from practice_submissions where learner_id = $1 and program_week_id = $2 and superseded_at is null`,
        [input.learnerId, row.week_id]
      )).rows[0];
      if (!canonical) throw new Error("WEEKLY_PRACTICE_ASSIGNMENT_CONFLICT");
      await client.query("commit");
      return {
        status: inserted.rowCount ? "assigned" : "already_assigned",
        learnerId: input.learnerId,
        submissionId: canonical.id,
        weekId: row.week_id,
        weekNumber: row.week_number,
        topic: row.topic,
        task,
        guidance
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async submitWeeklyPractice(input: { learnerId: string; requestId: string; text: string; audio?: AudioArtifactInput }): Promise<WeeklyPracticeView | null> {
    const view = await this.weeklyPractice(input.learnerId);
    if (!view || view.state === "locked") return null;
    const requirements = await this.weeklyPracticeRequirements(input.learnerId);
    if (!requirements) return null;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query<{ id: string; status: "draft" | "submitted" | "reviewed" }>(
        "select id, status from practice_submissions where learner_id = $1 and (program_week_id = $2 or request_key = $3) for update",
        [input.learnerId, view.weekId, input.requestId]
      );
      let submissionId = existing.rows[0]?.id ?? randomUUID();
      let activated = false;
      if (existing.rows[0]?.status === "draft") {
        await client.query(
          `update practice_submissions
           set status = 'submitted', content = $2::jsonb, request_key = $3,
               submitted_at = now(), updated_at = now()
           where id = $1`,
          [submissionId, JSON.stringify({ text: input.text, inputMode: view.inputMode ?? "write", type: view.inputMode === "dialogue" ? "dialogue" : "writing", ...(input.audio ? { audioArtifact: storedAudioArtifact(input.audio) } : {}) }), input.requestId]
        );
        activated = true;
      } else if (!existing.rows[0]) {
        const inserted = await client.query(
          `insert into practice_submissions
             (id, learner_id, program_week_id, status, content, request_key, prompt_snapshot, cefr_snapshot, vocabulary_snapshot, submitted_at, updated_at)
           values ($1, $2, $3, 'submitted', $4::jsonb, $5, $6::jsonb, $7, $8::jsonb, now(), now())
           on conflict (learner_id, program_week_id) where superseded_at is null do nothing
           returning id`,
          [submissionId, input.learnerId, view.weekId, JSON.stringify({
            text: input.text,
            inputMode: view.inputMode ?? "write",
            type: view.inputMode === "dialogue" ? "dialogue" : "writing",
            ...(input.audio ? { audioArtifact: storedAudioArtifact(input.audio) } : {})
          }), input.requestId, JSON.stringify({ task: view.task, guidance: view.guidance, inputMode: view.inputMode ?? "write" }),
          requirements.cefr, JSON.stringify(requirements.vocabulary)]
        );
        activated = Boolean(inserted.rowCount);
        if (!inserted.rowCount) {
          const raced = await client.query<{ id: string }>(
            `select id from practice_submissions where learner_id = $1 and program_week_id = $2 and superseded_at is null`,
            [input.learnerId, view.weekId]
          );
          if (raced.rows[0]) submissionId = raced.rows[0].id;
        }
      }
      if (input.audio && existing.rows[0]?.status !== "draft") {
        await client.query(
          `update practice_submissions
           set content = jsonb_set(content, '{audioArtifact}', $2::jsonb, true), updated_at = now()
           where id = $1`,
          [submissionId, JSON.stringify(storedAudioArtifact(input.audio))]
        );
      }
      if (input.audio) await linkAudioOnClient(client, {
        ownerUserId: input.learnerId, audio: input.audio, sourceFlow: "weekly_practice", sourceEntityId: submissionId,
        taskKey: "weekly_practice"
      });
      if (activated) await client.query(
          `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
           values ($1, $2, 'weekly_practice', 'practice_submission', $3, 10, $4::jsonb)`,
          [randomUUID(), input.learnerId, submissionId, JSON.stringify({ wordCount: input.text.trim().split(/\s+/).length })]
        );
      if (activated) await syncLearnerRewards(client, input.learnerId);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback"); throw error;
    } finally { client.release(); }
    return this.weeklyPractice(input.learnerId);
  }

  async appealWeeklyPractice(input: StoredRequestEvidence & { learnerId: string; submissionId: string; reason: string }): Promise<WeeklyPracticeView | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const submission = await client.query<{
        id: string; status: string; program_week_id: string; score: Record<string, unknown> | null;
        feedback: Record<string, unknown> | null;
      }>(
        `select id, status, program_week_id, score, feedback from practice_submissions
          where id = $1 and learner_id = $2 for update`, [input.submissionId, input.learnerId]
      );
      const row = submission.rows[0];
      const gradingSource = row?.feedback && typeof row.feedback === "object" ? row.feedback.source : null;
      const manuallyGraded = gradingSource === "human" || gradingSource === "appeal-human";
      if (!row || manuallyGraded || (row.status !== "reviewed" && !(row.status === "submitted" && row.score))) {
        await client.query("rollback");
        return null;
      }
      const inserted = await client.query(
        `insert into practice_appeals (id, submission_id, learner_id, reason, request_scope, screenshot, screenshot_type)
         values ($1, $2, $3, $4, $5, $6, $7) on conflict (submission_id) do nothing`,
        [randomUUID(), input.submissionId, input.learnerId, input.reason, ...requestEvidenceValues(input)]
      );
      if (!inserted.rowCount) throw new Error("PRACTICE_APPEAL_EXISTS");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return this.weeklyPractice(input.learnerId);
  }

  async saveWeeklyPracticeGrade(input: {
    learnerId: string; requestId: string; taskId: string; promptVersionId: string;
    output: { score: { total: number; rubric: { meaning: number; vocabulary: number; grammar: number } };
      offTopic: boolean;
      feedback: string; suggestions: Array<{ original: string; corrected: string; explanation: string }>;
      correctedText: string };
    metadata: AiRunMetadataInput;
  }): Promise<WeeklyPracticeView | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const submission = await client.query<{ id: string }>(
        "select id from practice_submissions where learner_id = $1 and request_key = $2 for update",
        [input.learnerId, input.requestId]
      );
      if (!submission.rows[0]) { await client.query("rollback"); return null; }
      const runId = randomUUID();
      const inserted = await insertAiRun(client, {
        id: runId, learnerId: input.learnerId, requestId: input.requestId, taskId: input.taskId,
        promptVersionId: input.promptVersionId, output: input.output, metadata: input.metadata
      });
      if (inserted) {
        const canonicalScore = {
          ...input.output.score,
          total: calculateWeeklyPracticeScore({ ...input.output.score.rubric, offTopic: input.output.offTopic })
        };
        await client.query(
          `update practice_submissions set score = $2::jsonb, feedback = $3::jsonb, updated_at = now()
           where id = $1`,
          [submission.rows[0].id, JSON.stringify(canonicalScore), JSON.stringify({
            message: input.output.feedback, source: "ai", suggestions: input.output.suggestions,
            correctedText: input.output.correctedText, aiRunId: runId
          })]
        );
      }
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    return this.weeklyPractice(input.learnerId);
  }

  async gameHub(learnerId: string): Promise<{
    cefr: CefrLevel; wordSet: GameWordSetView | null; learnedVocabularyAvailable: boolean;
    best: Partial<Record<GameKey, { score: number; maxScore: number }>>;
  } | null> {
    const context = await this.activeGameContext(learnerId);
    if (!context) return null;
    const [result, learned] = await Promise.all([
      this.pool.query<{ id: string; payload: Record<string, unknown> }>(
        `select id, payload from game_sets
         where learner_id = $1 and game_key = 'monthly_vocabulary' and status = 'published'
           and payload->>'month' = $2 and payload->>'cefr' = $3
         limit 1`, [learnerId, context.month, context.cefr]
      ),
      this.monthlyLearnedGameWords(learnerId, context)
    ]);
    const row = result.rows[0];
    const learnedVocabularyAvailable = learned.length > 0;
    const empty = { cefr: context.cefr, wordSet: null, learnedVocabularyAvailable, best: {} };
    if (!row) return empty;
    const payload = row.payload;
    const storedWords = Array.isArray(payload.words) ? payload.words as GameWordSetView["words"] : [];
    if (payload.source === "learned") {
      const eligibleWords = new Map(learned.map(word => [word.id, word.english]));
      if (!storedWords.length || storedWords.some(word => eligibleWords.get(word.id) !== word.english)) return empty;
    }
    // Monthly sets show the frozen illustration of each word, also for sets saved before the picture existed.
    const learnedImages = new Map(learned.flatMap(word => word.imageUrl ? [[word.english.toLocaleLowerCase("en"), word.imageUrl] as const] : []));
    // Word sort context lines: learned sets read them from the lesson (also for sets saved before the field existed).
    const learnedExamples = new Map(learned.flatMap(word => word.example ? [[word.english.toLocaleLowerCase("en"), word.example] as const] : []));
    const words = payload.source === "learned"
      ? storedWords.map(word => {
        const key = word.english.toLocaleLowerCase("en");
        const withImage = word.imageUrl || !learnedImages.has(key) ? word : { ...word, imageUrl: learnedImages.get(key)! };
        return withImage.example || !learnedExamples.has(key) ? withImage : { ...withImage, example: learnedExamples.get(key)! };
      })
      : storedWords.map(word => word.example || !learnedExamples.has(word.english.toLocaleLowerCase("en")) ? word : { ...word, example: learnedExamples.get(word.english.toLocaleLowerCase("en"))! });
    const examplesPending = !payload.examplesBackfill && words.some(word => !word.example);
    const distractors = Array.isArray(payload.distractors) ? payload.distractors as GameWordSetView["words"] : undefined;
    // The record belongs to the learner and the game, not to one word set: learning new words retires the
    // set and creates a new one, and the record must survive that (same rule as the leaderboard).
    const bestRows = await this.pool.query<{ game_key: GameKey; score: number; max_score: number }>(
      `select distinct on (game_key) game_key, score, max_score
       from game_results where learner_id = $1 and game_key is not null
       order by game_key, (score::numeric / greatest(max_score, 1)) desc, score desc, completed_at asc`,
      [learnerId]
    );
    return {
      cefr: context.cefr,
      learnedVocabularyAvailable,
      wordSet: { id: row.id, topic: String(payload.topic ?? context.topic), cefr: context.cefr,
        source: payload.source === "learned" ? "monthly" : "custom", words, ...(distractors ? { distractors } : {}),
        ...(examplesPending ? { examplesPending } : {}) },
      best: Object.fromEntries(bestRows.rows.map((item) => [item.game_key, normalizedGameBest(item)]))
    };
  }

  private async monthlyLearnedGameWords(learnerId: string, context: { month: string; monthId: string | null; cefr: CefrLevel }): Promise<GameWordView[]> {
    if (!context.monthId) return [];
    const lessons = await new LearningRepository(this.pool).listMonthlyLessons(learnerId, context.month);
    const learned = lessons.filter(lesson => lesson.cefr === context.cefr && lesson.monthlyKind !== "review" && !lesson.lock
      && (lesson.progress.status === "completed" || lesson.progress.completedPartCodes.includes("vocabulary")));
    const seen = new Set<string>();
    const words: GameWordSetView["words"] = [];
    for (const lesson of learned) {
      const vocabulary = lesson.content.parts.find(part => part.code === "vocabulary");
      const content = vocabulary?.content && typeof vocabulary.content === "object" && !Array.isArray(vocabulary.content)
        ? vocabulary.content as Record<string, unknown> : undefined;
      const items = Array.isArray(content?.items) ? content.items : [];
      for (const [index, item] of items.entries()) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const value = item as Record<string, unknown>;
        const english = typeof value.word === "string" ? value.word.trim() : "";
        const key = english.toLocaleLowerCase("en");
        if (!english || seen.has(key)) continue;
        const vietnamese = typeof value.meaning === "string" && value.meaning.trim() ? value.meaning.trim() : english;
        const partOfSpeech = normalizeGamePartOfSpeech(value.partOfSpeech ?? value.type);
        const example = pickGameWordExample(english, { examples: value.examples, collocations: value.collocations });
        words.push({
          id: `${lesson.id}-${index + 1}`,
          english,
          vietnamese,
          definition: typeof value.definition === "string" && value.definition.trim() ? value.definition.trim() : vietnamese,
          partOfSpeech,
          ...(example ? { example } : {}),
          ...(typeof value.imageQuery === "string" && value.imageQuery.trim() ? { imageQuery: value.imageQuery.trim() } : {}),
          ...(typeof value.imageUrl === "string" && value.imageUrl.trim() ? { imageUrl: value.imageUrl.trim() } : {})
        });
        seen.add(key);
      }
    }
    return words;
  }

  async useLearnedVocabularyGameSet(learnerId: string): Promise<boolean> {
    const context = await this.activeGameContext(learnerId);
    if (!context) return false;
    const words = await this.monthlyLearnedGameWords(learnerId, context);
    if (!words.length) return false;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select id from users where id = $1 for update", [learnerId]);
      await this.retireMonthlyGameSet(client, learnerId, context.month);
      await client.query(
        `insert into game_sets (id, program_month_id, learner_id, game_key, status, payload)
         values ($1, $2, $3, 'monthly_vocabulary', 'published', $4::jsonb)`,
        [randomUUID(), context.monthId, learnerId, JSON.stringify({
          topic: `Từ đã học tháng ${context.month.slice(5)}/${context.month.slice(0, 4)}`,
          month: context.month, cefr: context.cefr, words, source: "learned"
        })]
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async gameWord(learnerId: string, setId: string, wordId: string): Promise<Pick<
    GameWordView,
    "english" | "partOfSpeech" | "imageQuery" | "imageUrl" | "imageAttribution"
  > | null> {
    const hub = await this.gameHub(learnerId);
    if (!hub?.wordSet || hub.wordSet.id !== setId) return null;
    const value = hub.wordSet.words.find(word => word?.id === wordId);
    if (!value) return null;
    if (typeof value.english !== "string" || !value.english.trim()) return null;
    const partOfSpeech = typeof value.partOfSpeech === "string" && value.partOfSpeech.trim()
      ? value.partOfSpeech.trim().toLowerCase()
      : "";
    if (!partOfSpeech) return null;
    return {
      english: value.english,
      partOfSpeech,
      ...(typeof value.imageQuery === "string" && value.imageQuery.trim() ? { imageQuery: value.imageQuery } : {}),
      ...(typeof value.imageUrl === "string" && value.imageUrl.trim() ? { imageUrl: value.imageUrl } : {}),
      ...(value.imageAttribution && typeof value.imageAttribution === "object" && !Array.isArray(value.imageAttribution)
        ? { imageAttribution: value.imageAttribution as NonNullable<GameWordView["imageAttribution"]> }
        : {})
    };
  }

  async saveGameWordImage(learnerId: string, setId: string, wordId: string, imageUrl: string): Promise<boolean> {
    const context = await this.activeGameContext(learnerId);
    if (!context) return false;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{ payload: Record<string, unknown> }>(
        `select payload from game_sets
         where id = $1 and game_key = 'monthly_vocabulary'
           and status = 'published' and learner_id = $2 and payload->>'month' = $3 and payload->>'cefr' = $4
         for update`,
        [setId, learnerId, context.month, context.cefr]
      );
      const payload = result.rows[0]?.payload;
      if (!payload || !Array.isArray(payload.words)) { await client.query("rollback"); return false; }
      let found = false;
      const words = payload.words.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const word = item as Record<string, unknown>;
        if (String(word.id ?? "") !== wordId) return item;
        found = true;
        return { ...word, imageUrl };
      });
      if (!found) { await client.query("rollback"); return false; }
      await client.query("update game_sets set payload = $2::jsonb where id = $1", [setId, JSON.stringify({ ...payload, words })]);
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Stores the one-time batched Word sort context backfill on the set: the
   * sentences for words that lacked one, plus a marker so the AI call never
   * repeats for this set (also when it failed and nothing was stored).
   */
  async saveGameWordExamples(learnerId: string, setId: string, input: {
    examples: Record<string, string>; status: "completed" | "failed";
    run?: { requestId: string; taskId: string; promptVersionId: string; metadata: AiRunMetadataInput };
  }): Promise<boolean> {
    const context = await this.activeGameContext(learnerId);
    if (!context) return false;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{ payload: Record<string, unknown> }>(
        `select payload from game_sets
         where id = $1 and game_key = 'monthly_vocabulary'
           and status = 'published' and learner_id = $2 and payload->>'month' = $3 and payload->>'cefr' = $4
         for update`,
        [setId, learnerId, context.month, context.cefr]
      );
      const payload = result.rows[0]?.payload;
      if (!payload || !Array.isArray(payload.words) || payload.examplesBackfill) { await client.query("rollback"); return false; }
      const words = payload.words.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const word = item as Record<string, unknown>;
        const example = input.examples[String(word.id ?? "")];
        return example && !word.example ? { ...word, example } : item;
      });
      if (input.run) {
        await insertAiRun(client, {
          id: randomUUID(), learnerId, requestId: input.run.requestId, taskId: input.run.taskId,
          promptVersionId: input.run.promptVersionId, output: { examples: input.examples }, metadata: input.run.metadata
        });
      }
      await client.query("update game_sets set payload = $2::jsonb where id = $1", [setId, JSON.stringify({
        ...payload, words, examplesBackfill: { status: input.status, at: new Date().toISOString() }
      })]);
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveGeneratedWordSet(input: {
    learnerId: string; requestId: string; taskId: string; promptVersionId: string;
    output: { topic: string; words: GameWordSetView["words"]; distractors: GameWordSetView["words"] }; metadata: AiRunMetadataInput;
  }): Promise<void> {
    const context = await this.activeGameContext(input.learnerId);
    if (!context) throw new Error("GAME_CONTEXT_NOT_FOUND");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const runId = randomUUID();
      const inserted = await insertAiRun(client, {
        id: runId, learnerId: input.learnerId, requestId: input.requestId, taskId: input.taskId,
        promptVersionId: input.promptVersionId, output: input.output, metadata: input.metadata
      });
      if (inserted) {
        await client.query("select id from users where id = $1 for update", [input.learnerId]);
        await this.retireMonthlyGameSet(client, input.learnerId, context.month);
        await client.query(
          `insert into game_sets (id, program_month_id, learner_id, game_key, status, payload)
           values ($1, $2, $3, 'monthly_vocabulary', 'published', $4::jsonb)`,
          [randomUUID(), context.monthId, input.learnerId, JSON.stringify({
            topic: input.output.topic, month: context.month, cefr: context.cefr, words: input.output.words, distractors: input.output.distractors,
            source: "ai", aiRunId: runId
          })]
        );
      }
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }

  async retireGeneratedWordSet(learnerId: string): Promise<void> {
    const context = await this.activeGameContext(learnerId);
    if (context) await this.retireMonthlyGameSet(this.pool, learnerId, context.month);
  }

  private async retireMonthlyGameSet(db: Pool | PoolClient, learnerId: string, month: string): Promise<void> {
    await db.query(
      `update game_sets set status = 'retired'
       where learner_id = $1 and payload->>'month' = $2 and game_key = 'monthly_vocabulary' and status = 'published'`,
      [learnerId, month]
    );
  }

  async findGameResult(learnerId: string, requestId: string): Promise<GameResultView | null> {
    const result = await this.pool.query<{
      id: string; game_key: GameKey; score: number; max_score: number; details: Record<string, unknown>; completed_at: Date;
    }>(
      "select id, game_key, score, max_score, details, completed_at from game_results where learner_id = $1 and request_key = $2 limit 1",
      [learnerId, requestId]
    );
    const row = result.rows[0];
    return row ? gameResultView(row) : null;
  }

  async saveGameResult(input: {
    learnerId: string; setId: string; game: GameKey; requestId: string;
    score: number; maxScore: number; correct: number; total: number; details: unknown; duelId?: string;
  }): Promise<GameResultView> {
    const id = randomUUID();
    const result = await this.pool.query<{
      id: string; game_key: GameKey; score: number; max_score: number; details: Record<string, unknown>; completed_at: Date;
    }>(
      `insert into game_results
         (id, game_set_id, learner_id, game_key, score, max_score, request_key, duel_id, details)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       on conflict (learner_id, request_key) where request_key is not null do update set request_key = excluded.request_key
       returning id, game_key, score, max_score, details, completed_at`,
      [id, input.setId, input.learnerId, input.game, input.score, input.maxScore, input.requestId,
        input.duelId ?? null, JSON.stringify({ correct: input.correct, total: input.total, evidence: input.details })]
    );
    const row = result.rows[0]!;
    await withLearnerRewardLock(this.pool, input.learnerId, async (client) => {
      await client.query(
        `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
         select $1, $2, 'game', 'game_result', $3, 5, $4::jsonb
         where not exists (select 1 from activities where learner_id = $2 and reference_type = 'game_result' and reference_id = $3)`,
        [randomUUID(), input.learnerId, row.id, JSON.stringify({ game: input.game, score: input.score, maxScore: input.maxScore })]
      );
      await syncLearnerRewards(client, input.learnerId);
    });
    return gameResultView(row);
  }

  async arena(learnerId: string): Promise<{
    cefr: CefrLevel; organizationId: string; programId: string;
    opponents: Array<{ id: string; displayName: string; avatar?: LearnerAvatarData; cefr: CefrLevel }>;
    leaderboard: Array<{ learnerId: string; displayName: string; avatar?: LearnerAvatarData; cefr: CefrLevel; points: number; played: number; won: number; lost: number }>;
    duels: Array<{ id: string; game: GameKey; wordSetTopic: string; challengerId: string; opponentId: string; challengerName: string; opponentName: string; state: string; scores: Record<string, { score: number; maxScore: number }>; createdAt: Date }>;
  } | null> {
    const context = await this.activeGameContext(learnerId);
    if (!context) return null;
    const players = await this.pool.query<{
      id: string; display_name: string; profile: Partial<LearnerProfileData> | null; cefr: CefrLevel; points: string; played: string; won: string; lost: string;
    }>(
      `with best as (
         select distinct on (gr.learner_id, gr.game_key) gr.learner_id, gr.game_key,
                round(100 * gr.score::numeric / greatest(gr.max_score, 1))::int as points
         from game_results gr where gr.game_key is not null
         order by gr.learner_id, gr.game_key, (gr.score::numeric / greatest(gr.max_score, 1)) desc
       ), duel_scores as (
         select d.challenger_id as learner_id,
                case when (d.scores->d.challenger_id::text->>'score')::numeric / greatest((d.scores->d.challenger_id::text->>'maxScore')::numeric, 1)
                           > (d.scores->d.opponent_id::text->>'score')::numeric / greatest((d.scores->d.opponent_id::text->>'maxScore')::numeric, 1) then 1 else 0 end as won,
                case when (d.scores->d.challenger_id::text->>'score')::numeric / greatest((d.scores->d.challenger_id::text->>'maxScore')::numeric, 1)
                           < (d.scores->d.opponent_id::text->>'score')::numeric / greatest((d.scores->d.opponent_id::text->>'maxScore')::numeric, 1) then 1 else 0 end as lost
         from duels d where d.state = 'completed'
         union all
         select d.opponent_id,
                case when (d.scores->d.opponent_id::text->>'score')::numeric / greatest((d.scores->d.opponent_id::text->>'maxScore')::numeric, 1)
                           > (d.scores->d.challenger_id::text->>'score')::numeric / greatest((d.scores->d.challenger_id::text->>'maxScore')::numeric, 1) then 1 else 0 end,
                case when (d.scores->d.opponent_id::text->>'score')::numeric / greatest((d.scores->d.opponent_id::text->>'maxScore')::numeric, 1)
                           < (d.scores->d.challenger_id::text->>'score')::numeric / greatest((d.scores->d.challenger_id::text->>'maxScore')::numeric, 1) then 1 else 0 end
         from duels d where d.state = 'completed'
       ), duel_totals as (
         select learner_id, sum(won)::int as won, sum(lost)::int as lost from duel_scores group by learner_id
       )
       select u.id, u.display_name, lp.profile, e.cefr,
              (coalesce(sum(best.points), 0) + coalesce(dt.won, 0) * 50)::text as points,
              count(best.game_key)::text as played, coalesce(dt.won, 0)::text as won, coalesce(dt.lost, 0)::text as lost
       from users u join enrollments e on e.learner_id = u.id and e.program_id = $1
       left join learner_profiles lp on lp.user_id = u.id
       left join best on best.learner_id = u.id
       left join duel_totals dt on dt.learner_id = u.id
       where u.organization_id = $2 and u.role = 'learner' and u.status = 'active'
         and e.cefr in ('B1','B2','C1') and e.cefr_approved = true
       group by u.id, lp.profile, e.cefr, dt.won, dt.lost
       order by (coalesce(sum(best.points), 0) + coalesce(dt.won, 0) * 50) desc, u.display_name`,
      [context.programId, context.organizationId]
    );
    const duelRows = await this.pool.query<{
      id: string; game_key: GameKey; challenger_id: string; opponent_id: string; challenger_name: string;
      opponent_name: string; state: string; scores: Record<string, { score: number; maxScore: number }>; created_at: Date; word_set_topic: string;
    }>(
      `select d.id, d.game_key, d.challenger_id, d.opponent_id, cu.display_name as challenger_name,
              ou.display_name as opponent_name, d.state, d.scores, d.created_at, coalesce(gs.payload->>'topic', '') as word_set_topic
       from duels d join users cu on cu.id = d.challenger_id join users ou on ou.id = d.opponent_id
       join game_sets gs on gs.id = d.game_set_id
       where d.challenger_id = $1 or d.opponent_id = $1 order by d.created_at desc`,
      [learnerId]
    );
    return {
      cefr: context.cefr, organizationId: context.organizationId, programId: context.programId,
      opponents: players.rows.filter((row) => row.id !== learnerId).map((row) => ({ id: row.id, displayName: row.display_name, ...(row.profile?.avatar ? { avatar: row.profile.avatar } : {}), cefr: row.cefr })),
      leaderboard: players.rows.map((row) => ({ learnerId: row.id, displayName: row.display_name, ...(row.profile?.avatar ? { avatar: row.profile.avatar } : {}), cefr: row.cefr, points: Number(row.points), played: Number(row.played), won: Number(row.won), lost: Number(row.lost) })),
      duels: duelRows.rows.map((row) => ({ id: row.id, game: row.game_key, wordSetTopic: row.word_set_topic, challengerId: row.challenger_id, opponentId: row.opponent_id,
        challengerName: row.challenger_name, opponentName: row.opponent_name, state: row.state, scores: row.scores, createdAt: row.created_at }))
    };
  }

  async createDuel(learnerId: string, opponentId: string, game: GameKey): Promise<string | null> {
    const [arena, hub] = await Promise.all([this.arena(learnerId), this.gameHub(learnerId)]);
    if (!arena || !hub?.wordSet || !arena.opponents.some((item) => item.id === opponentId)) return null;
    const existing = await this.pool.query<{ id: string }>(
      `select id from duels where state = 'open' and game_key = $3
       and ((challenger_id = $1 and opponent_id = $2) or (challenger_id = $2 and opponent_id = $1)) limit 1`,
      [learnerId, opponentId, game]
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const id = randomUUID();
    const snapshotId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into game_sets (id, program_week_id, program_month_id, learner_id, game_key, status, payload)
         select $1, program_week_id, program_month_id, null, 'duel_snapshot', 'published', $3::jsonb
         from game_sets where id = $2`,
        [snapshotId, hub.wordSet.id, JSON.stringify({
          topic: hub.wordSet.topic,
          cefr: hub.wordSet.cefr,
          words: hub.wordSet.words,
          source: "duel",
          sourceGameSetId: hub.wordSet.id
        })]
      );
      const inserted = await client.query<{ id: string }>(
        `insert into duels (id, game_set_id, challenger_id, opponent_id, game_key, state, scores)
         values ($1, $2, $3, $4, $5, 'open', '{}'::jsonb)
         on conflict do nothing returning id`,
        [id, snapshotId, learnerId, opponentId, game]
      );
      if (inserted.rows[0]) {
        await client.query("commit");
        return inserted.rows[0].id;
      }
      await client.query("rollback");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    const raced = await this.pool.query<{ id: string }>(
      `select id from duels where state = 'open' and game_key = $3
       and ((challenger_id = $1 and opponent_id = $2) or (challenger_id = $2 and opponent_id = $1)) limit 1`,
      [learnerId, opponentId, game]
    );
    return raced.rows[0]?.id ?? null;
  }

  async duel(learnerId: string, duelId: string): Promise<DuelView | null> {
    const result = await this.pool.query<{
      id: string; game_key: GameKey; challenger_id: string; opponent_id: string; challenger_name: string;
      opponent_name: string; state: DuelView["state"]; scores: Record<string, { score: number; maxScore: number }>;
      created_at: Date; game_set_id: string; payload: Record<string, unknown>;
    }>(
      `select d.id, d.game_key, d.challenger_id, d.opponent_id, cu.display_name as challenger_name,
              ou.display_name as opponent_name, d.state, d.scores, d.created_at, d.game_set_id, gs.payload
       from duels d join users cu on cu.id = d.challenger_id join users ou on ou.id = d.opponent_id
       join game_sets gs on gs.id = d.game_set_id
       where d.id = $1 and (d.challenger_id = $2 or d.opponent_id = $2)`,
      [duelId, learnerId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const opponentId = row.challenger_id === learnerId ? row.opponent_id : row.challenger_id;
    const opponentName = row.challenger_id === learnerId ? row.opponent_name : row.challenger_name;
    const myScore = row.scores[learnerId] ?? null;
    const opponentScore = row.scores[opponentId] ?? null;
    return {
      id: row.id, game: row.game_key, opponent: { id: opponentId, displayName: opponentName }, state: row.state,
      myScore, opponentScore, outcome: duelOutcome(myScore, opponentScore), challengedByMe: row.challenger_id === learnerId,
      wordSetTopic: String(row.payload.topic ?? ""), createdAt: row.created_at.toISOString(),
      wordSet: {
        id: row.game_set_id, topic: String(row.payload.topic ?? ""), cefr: String(row.payload.cefr ?? "A2") as CefrLevel,
        source: "custom",
        words: Array.isArray(row.payload.words) ? row.payload.words as GameWordSetView["words"] : [],
        ...(Array.isArray(row.payload.distractors)
          ? { distractors: row.payload.distractors as GameWordSetView["words"] }
          : {})
      }
    };
  }

  async saveDuelScore(input: { learnerId: string; duelId: string; result: GameResultView; requestId: string }): Promise<DuelView | "already_played" | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const locked = await client.query<{
        challenger_id: string; opponent_id: string; scores: Record<string, { score: number; maxScore: number }>;
      }>("select challenger_id, opponent_id, scores from duels where id = $1 for update", [input.duelId]);
      const row = locked.rows[0];
      if (!row || ![row.challenger_id, row.opponent_id].includes(input.learnerId)) { await client.query("rollback"); return null; }
      if (row.scores[input.learnerId]) { await client.query("rollback"); return "already_played"; }
      const scores = { ...row.scores, [input.learnerId]: { score: input.result.score, maxScore: input.result.maxScore } };
      const completed = Boolean(scores[row.challenger_id] && scores[row.opponent_id]);
      await client.query(
        `update duels set scores = $2::jsonb, state = $3, completed_at = case when $3 = 'completed' then now() else null end where id = $1`,
        [input.duelId, JSON.stringify(scores), completed ? "completed" : "open"]
      );
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    return this.duel(input.learnerId, input.duelId);
  }

  async reward(learnerId: string, mode: "preview" | "done"): Promise<RewardView | null> {
    const result = await this.pool.query<{
      display_name: string; cefr: CefrLevel; program_id: string; points: string; organization_name: string; operator_name: string; manager_name: string; completed_at: Date | null; monthly_final_approved: boolean;
      badges: Array<{ key: string; label: string; description: string; earned: boolean }>;
    }>(
      `select u.display_name, e.cefr, e.program_id, o.name as organization_name, coalesce(sum(re.points), 0)::text as points, max(re.created_at) as completed_at,
              coalesce((select x.display_name from users x where x.organization_id = u.organization_id and x.role = 'operator' and x.status = 'active' order by x.created_at limit 1), '') as operator_name,
              coalesce((select x.display_name from users x where x.organization_id = u.organization_id and x.role = 'manager' and x.status = 'active' order by x.created_at limit 1), '') as manager_name,
              exists(select 1 from assessment_attempts aa
                join assessment_versions av on av.id = aa.assessment_version_id
                join assessment_definitions ad on ad.id = av.definition_id
                where aa.learner_id = u.id and ad.kind = 'final' and aa.status = 'approved') as monthly_final_approved,
              (select coalesce(jsonb_agg(jsonb_build_object('key', b.badge_key, 'label', b.label,
                'description', b.rule->>'description', 'earned', exists(select 1 from reward_events x where x.learner_id = u.id and x.badge_id = b.id)) order by b.badge_key), '[]'::jsonb)
               from badges b where b.organization_id = u.organization_id and ${ACTIVE_BADGE_SQL("b")}) as badges
       from users u join organizations o on o.id = u.organization_id join enrollments e on e.learner_id = u.id
       left join reward_events re on re.learner_id = u.id where u.id = $1 group by u.id, e.cefr, e.program_id, o.name`,
      [learnerId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const earnedBadgeCount = row.badges.filter((badge) => badge.earned).length;
    const printable = row.cefr === "C1" && row.monthly_final_approved;
    if (mode === "done" && !printable) return null;
    const year = new Date().getUTCFullYear();
    const generatedCode = `SE-${year}-${learnerId.replace(/\W/g, "").slice(-6).toUpperCase()}`;
    type CertificateIssuanceRow = {
      certificate_code: string; level: CefrLevel; learner_name: string; organization_name: string;
      badges_snapshot: typeof row.badges; signatures_snapshot: { operatorName?: string; managerName?: string }; issued_at: Date;
    };
    let issuance: CertificateIssuanceRow | null = null;
    if (mode === "done") {
      await this.pool.query(
        `insert into certificate_issuances
           (id, learner_id, program_id, certificate_code, level, learner_name, organization_name,
            badges_snapshot, signatures_snapshot, issued_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, now())
         on conflict (learner_id, program_id) do nothing`,
        [randomUUID(), learnerId, row.program_id, generatedCode, row.cefr, row.display_name, row.organization_name,
          JSON.stringify(row.badges), JSON.stringify({ operatorName: row.operator_name, managerName: row.manager_name })]
      );
      const stored = await this.pool.query<CertificateIssuanceRow>(
        `select certificate_code, level, learner_name, organization_name,
                badges_snapshot, signatures_snapshot, issued_at
         from certificate_issuances where learner_id = $1 and program_id = $2`,
        [learnerId, row.program_id]
      );
      issuance = stored.rows[0] ?? null;
      if (!issuance) return null;
    }
    const badges = issuance?.badges_snapshot ?? row.badges;
    const signatures = issuance?.signatures_snapshot ?? { operatorName: row.operator_name, managerName: row.manager_name };
    // The certificate names the learner's actual Season at the current level (same ladder as the profile).
    const seasonState = await learnerSeasonState(this.pool, learnerId);
    const season = seasonState?.season
      ?? seasonForRewards(Number(row.points), new Set(row.badges.filter((badge) => badge.earned).map((badge) => badge.key)));
    const [seasonName = season.name, seasonDescription = ""] = season.name.split(" – ");
    return {
      mode, learnerName: issuance?.learner_name ?? row.display_name, cefr: issuance?.level ?? row.cefr,
      cefrLabel: cefrDisplayLabel(issuance?.level ?? row.cefr),
      points: Number(row.points), displayPoints: Number(row.points),
      season: { name: seasonName, description: seasonDescription, cefr: seasonState?.cefr ?? row.cefr }, simulated: mode === "preview", earnedBadgeCount,
      requiredBadgeCount: badges.length, printable, certificateNumber: issuance?.certificate_code ?? generatedCode,
      completedAt: issuance?.issued_at.toISOString() ?? (mode === "done" ? row.completed_at : null)?.toISOString() ?? new Date().toISOString(),
      organizationName: issuance?.organization_name ?? row.organization_name,
      operatorName: signatures.operatorName ?? "", managerName: signatures.managerName ?? "", badges
    };
  }

  async survey(learnerId: string): Promise<SurveyView> {
    const result = await this.pool.query<{ answers: NonNullable<SurveyView["answers"]>; submitted_at: Date }>(
      "select answers, submitted_at from surveys where learner_id = $1 and survey_key = 'pilot_end' limit 1",
      [learnerId]
    );
    const row = result.rows[0];
    return row ? { state: "submitted", surveyKey: "pilot_end", answers: row.answers, submittedAt: row.submitted_at.toISOString() }
      : { state: "open", surveyKey: "pilot_end" };
  }

  async submitSurvey(learnerId: string, answers: NonNullable<SurveyView["answers"]>): Promise<SurveyView | null> {
    const result = await this.pool.query(
      `insert into surveys (id, learner_id, survey_key, answers) values ($1, $2, 'pilot_end', $3::jsonb)
       on conflict (learner_id, survey_key) do nothing returning id`,
      [randomUUID(), learnerId, JSON.stringify(answers)]
    );
    return result.rowCount ? this.survey(learnerId) : null;
  }

  private async activeGameContext(learnerId: string): Promise<{
    organizationId: string; programId: string; monthId: string | null; month: string; topic: string | null; cefr: CefrLevel;
  } | null> {
    const { rows } = await this.pool.query<{
      organization_id: string; program_id: string; month_id: string | null; month: string; topic: string | null; cefr: CefrLevel;
    }>(
      `select u.organization_id, p.id as program_id, pm.id as month_id, pm.theme_title as topic, e.cefr,
              to_char(organization_system_date(u.organization_id), 'YYYY-MM') as month
       from users u join enrollments e on e.learner_id = u.id and e.cefr_approved = true and e.cefr is not null
       join programs p on p.id = e.program_id and p.status = 'active'
       left join program_months pm on pm.organization_id = u.organization_id
          and pm.month = to_char(organization_system_date(u.organization_id), 'YYYY-MM')
       where u.id = $1 and u.role = 'learner' and u.status = 'active'
       order by e.enrolled_at desc limit 1`, [learnerId]
    );
    const row = rows[0];
    return row ? { organizationId: row.organization_id, programId: row.program_id, monthId: row.month_id,
      month: row.month, topic: row.topic, cefr: row.cefr } : null;
  }

  private async activeEngagementContext(learnerId: string): Promise<{
    organizationId: string; programId: string; weekId: string; weekNumber: number; topic: string; cefr: CefrLevel;
  } | null> {
    const result = await this.pool.query<{
      organization_id: string; program_id: string; week_id: string; week_number: number; topic: string; cefr: CefrLevel;
    }>(
      `select u.organization_id, p.id as program_id, pw.id as week_id, pw.week_number, pw.topic, e.cefr
       from users u join enrollments e on e.learner_id = u.id and e.cefr_approved = true
       join programs p on p.id = e.program_id and p.status = 'active'
       join program_weeks pw on pw.program_id = p.id
        and pw.week_number = coalesce(p.current_week_override,
          least(p.week_count, greatest(1, floor((organization_system_date(p.organization_id) - p.start_date) / 7.0)::int + 1)))
       where u.id = $1
         and exists (
           select 1 from lesson_sets ls
           join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
           where ls.program_week_id = pw.id and ls.cefr = e.cefr
         )
       limit 1`,
      [learnerId]
    );
    const row = result.rows[0];
    return row ? { organizationId: row.organization_id, programId: row.program_id, weekId: row.week_id,
      weekNumber: row.week_number, topic: row.topic, cefr: row.cefr } : null;
  }

  async getSummary(learnerId: string): Promise<{ points: number; badges: unknown[] }> {
    const result = await this.pool.query<{ points: string; badges: unknown[] }>(
      `select coalesce(sum(re.points), 0)::text as points,
              coalesce(jsonb_agg(distinct jsonb_build_object('key', b.badge_key, 'label', b.label))
                filter (where b.id is not null), '[]'::jsonb) as badges
       from reward_events re
       left join badges b on b.id = re.badge_id
       where re.learner_id = $1`,
      [learnerId]
    );
    const row = result.rows[0] ?? { points: "0", badges: [] };
    return { points: Number(row.points), badges: row.badges };
  }
}

interface AiRunMetadataInput {
  traceId: string; provider: string; model: string; inputHash: string;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; latencyMs: number;
}

async function insertAiRun(client: PoolClient, input: {
  id: string; learnerId: string; requestId: string; taskId: string; promptVersionId: string;
  output: unknown; metadata: AiRunMetadataInput;
}): Promise<boolean> {
  const result = await client.query(
    `insert into ai_runs
       (id, task_id, user_id, prompt_version_id, provider, model, status, input_hash,
        output, usage, latency_ms, trace_id, request_key, completed_at)
     values ($1, $2, $3, $4, $5, $6, 'succeeded', $7, $8::jsonb, $9::jsonb, $10, $11, $12, now())
     on conflict (user_id, task_id, request_key) where request_key is not null do nothing
     returning id`,
    [input.id, input.taskId, input.learnerId, input.promptVersionId, input.metadata.provider,
      input.metadata.model, input.metadata.inputHash, JSON.stringify(input.output), JSON.stringify(input.metadata.usage),
      input.metadata.latencyMs, input.metadata.traceId, input.requestId]
  );
  return Boolean(result.rowCount);
}

function gameResultView(row: {
  id: string; game_key: GameKey; score: number; max_score: number; details: Record<string, unknown>; completed_at: Date;
}): GameResultView {
  return {
    id: row.id, game: row.game_key, score: row.score, maxScore: row.max_score,
    correct: Number(row.details.correct ?? 0), total: Number(row.details.total ?? 0), completedAt: row.completed_at.toISOString()
  };
}

function normalizedGameBest(item: { game_key: GameKey; score: number; max_score: number }) {
  if (item.game_key === "eggs" && item.max_score > 0 && item.max_score !== 10) {
    return { score: Math.max(0, Math.min(10, Math.round(10 * item.score / item.max_score))), maxScore: 10 };
  }
  return { score: item.score, maxScore: item.max_score };
}

function normalizeGamePartOfSpeech(value: unknown): string {
  const label = typeof value === "string" ? value.trim().toLocaleLowerCase("vi") : "";
  if (label.includes("danh từ") || label === "noun") return "noun";
  if (label.includes("động từ") || label === "verb") return "verb";
  if (label.includes("tính từ") || label === "adjective") return "adjective";
  if (label.includes("trạng từ") || label === "adverb") return "adverb";
  if (label.includes("giới từ") || label === "preposition") return "preposition";
  return "phrase";
}

function duelOutcome(
  mine: { score: number; maxScore: number } | null,
  theirs: { score: number; maxScore: number } | null
): DuelView["outcome"] {
  if (!mine) return "play";
  if (!theirs) return "waiting";
  const left = mine.score / Math.max(1, mine.maxScore);
  const right = theirs.score / Math.max(1, theirs.maxScore);
  return left === right ? "draw" : left > right ? "win" : "lose";
}

function cefrDisplayLabel(level: CefrLevel): string {
  return ({ A1: "A1 – Mới bắt đầu", A2: "A2 – Sơ cấp", B1: "B1 – Trung cấp", B2: "B2 – Trên trung cấp", C1: "C1 – Nâng cao" } as const)[level];
}

class NotificationRepository {
  constructor(private readonly pool: Pool) {}

  async listForLearner(learnerId: string): Promise<LearnerNotificationView[]> {
    const result = await this.pool.query<{
      id: string;
      reason: string;
      message: string;
      status: LearnerNotificationView["status"];
      created_at: Date;
      deliveries: Array<{
        provider: string;
        status: "queued" | "sent" | "failed";
        externalId: string | null;
        attemptedAt: string;
      }>;
    }>(
      `select r.id, r.reason, r.message, r.status, r.created_at,
              coalesce(jsonb_agg(jsonb_build_object(
                'provider', nd.provider,
                'status', nd.status,
                'externalId', nd.external_id,
                'attemptedAt', nd.attempted_at
              ) order by nd.attempted_at desc)
                filter (where nd.id is not null), '[]'::jsonb) as deliveries
       from reminders r
       left join notification_deliveries nd on nd.reminder_id = r.id
       where r.learner_id = $1
       group by r.id
       order by r.created_at desc`,
      [learnerId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      message: row.message,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      deliveries: row.deliveries.map((delivery) => ({
        provider: delivery.provider,
        status: delivery.status,
        externalId: delivery.externalId,
        attemptedAt: delivery.attemptedAt
      }))
    }));
  }

  async findWebhookDelivery(reminderId: string): Promise<ReminderWebhookDelivery | null> {
    const result = await this.pool.query<{
      reminder_id: string;
      delivery_id: string;
      message: string;
      learner_name: string;
      secret_ciphertext: string;
      secret_nonce: string;
      secret_auth_tag: string;
      webhook_template: string | null;
    }>(
      `select r.id as reminder_id, nd.id as delivery_id, r.message,
              learner.display_name as learner_name,
              destination.secret_ciphertext, destination.secret_nonce, destination.secret_auth_tag, destination.webhook_template
       from reminders r
       join users learner on learner.id = r.learner_id
       join notification_deliveries nd on nd.reminder_id = r.id
         and nd.provider = 'base_webhook' and nd.status = 'queued'
       join reminder_base_destinations destination on destination.reminder_id = r.id
       where r.id = $1 and r.status = 'queued'
       order by nd.attempted_at desc
       limit 1`,
      [reminderId]
    );
    const row = result.rows[0];
    if (!row?.secret_ciphertext || !row.webhook_template) return null;
    return {
      reminderId: row.reminder_id,
      deliveryId: row.delivery_id,
      message: row.message,
      learnerName: row.learner_name,
      webhookUrl: decryptProviderSecret(row),
      webhookTemplate: row.webhook_template
    };
  }

  async claimEmailDelivery(reminderId: string): Promise<ReminderEmailDelivery | null> {
    const result = await this.pool.query<{
      reminder_id: string;
      delivery_id: string;
      message: string;
      learner_name: string;
      recipient: string | null;
    }>(
      `with target as (
         select r.id as reminder_id, nd.id as delivery_id, r.message,
                learner.display_name as learner_name, nullif(trim(learner.email), '') as recipient
         from reminders r
         join users learner on learner.id = r.learner_id
         join notification_deliveries nd on nd.reminder_id = r.id
           and nd.provider = 'resend' and nd.status = 'queued'
         where r.id = $1 and r.status = 'queued' and not (nd.response ? 'claimed')
         order by nd.attempted_at desc
         limit 1
         for update of nd skip locked
       ), claimed as (
         update notification_deliveries nd
         set response = nd.response || '{"claimed":true}'::jsonb
         from target where nd.id = target.delivery_id
         returning target.*
       )
       select * from claimed`,
      [reminderId]
    );
    const row = result.rows[0];
    if (!row?.recipient) return null;
    return {
      reminderId: row.reminder_id,
      deliveryId: row.delivery_id,
      message: row.message,
      learnerName: row.learner_name,
      recipient: row.recipient
    };
  }

  async updateWebhookDelivery(input: ReminderWebhookDeliveryUpdate): Promise<void> {
    await this.updateReminderDelivery(input);
  }

  async updateReminderDelivery(input: ReminderWebhookDeliveryUpdate): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update notification_deliveries
         set status = $2, external_id = $3, response = $4::jsonb, attempted_at = now()
         where id = $1`,
        [input.deliveryId, input.status, input.externalId ?? null, JSON.stringify(input.response)]
      );
      await client.query(
        `update reminders set status = $2
         where id = $1 and status = 'queued'`,
        [input.reminderId, input.status]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

class FileRepository {
  constructor(private readonly pool: Pool) {}

  async listForOwner(ownerUserId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `select id, purpose, bucket, object_key, mime_type, size_bytes, sha256, retention_until, created_at
       from files where owner_user_id = $1 order by created_at desc`,
      [ownerUserId]
    );
    return result.rows;
  }

  async createForOwner(input: CreateFileInput): Promise<AudioFileRecord | null> {
    const result = await this.pool.query<AudioFileRow>(
      `insert into files (
         id, organization_id, owner_user_id, purpose, bucket, object_key,
         mime_type, size_bytes, sha256, source_flow, source_entity_id,
         task_key, question_key, transcript
       )
       select $1, u.organization_id, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13
       from users u
       where u.id = $2
       returning *`,
      [
        input.id, input.ownerUserId, input.purpose, input.bucket, input.objectKey,
        input.mimeType, input.sizeBytes, input.sha256, input.sourceFlow ?? "placement",
        input.sourceEntityId ?? null, input.taskKey ?? null, input.questionKey ?? null,
        input.transcript ?? null
      ]
    );
    return result.rows[0] ? fromAudioRow(result.rows[0]) : null;
  }

  async linkAudioToSource(input: {
    ownerUserId: string;
    audio: AudioArtifactInput;
    sourceFlow: AudioSourceFlow;
    sourceEntityId: string;
    taskKey?: string | null;
    questionKey?: string | null;
  }): Promise<AudioFileRecord | null> {
    const result = await this.pool.query<AudioFileRow>(
      `update files as file
       set source_flow = $4,
           source_entity_id = $5,
           task_key = $6,
           question_key = $7,
           transcript = coalesce($8, file.transcript),
           completed_at = coalesce(file.completed_at, now()),
           retention_until = coalesce(file.retention_until, now() + interval '60 days')
       where file.purpose = 'assessment_audio'
         and file.owner_user_id = $1
         and (($2::uuid is not null and file.id = $2::uuid)
           or ($3::text is not null and file.object_key = $3::text))
       returning file.*`,
      [input.ownerUserId, input.audio.fileId ?? null, input.audio.artifactKey,
        input.sourceFlow, input.sourceEntityId, input.taskKey ?? null, input.questionKey ?? null,
        input.audio.transcript ?? null]
    );
    return result.rows[0] ? fromAudioRow(result.rows[0]) : null;
  }

  async ownedBy(ownerUserId: string, purpose: string, objectKey: string): Promise<boolean> {
    const result = await this.pool.query(
      `select 1 from files
       where owner_user_id = $1 and purpose = $2 and object_key = $3
         and deleted_at is null
       limit 1`,
      [ownerUserId, purpose, objectKey]
    );
    return Boolean(result.rowCount);
  }

  async findAssessmentAudioForViewer(viewerId: string, objectKey: string): Promise<AudioFileRecord | null> {
    const result = await this.pool.query<AudioFileRow>(
      `select f.*
       from files f
       join users owner on owner.id = f.owner_user_id
       join users viewer on viewer.id = $1
       where f.purpose = 'assessment_audio' and f.object_key = $2
         and (
           (viewer.role = 'learner' and f.owner_user_id = viewer.id)
           or (viewer.role in ('operator', 'manager') and owner.organization_id = viewer.organization_id)
         )
       limit 1`,
      [viewerId, objectKey]
    );
    return result.rows[0] ? fromAudioRow(result.rows[0]) : null;
  }

  async listAssessmentAudioForStaff(input: {
    viewerId: string;
    learnerId?: string;
    sourceFlow?: AudioSourceFlow;
  }): Promise<AudioFileRecord[]> {
    const values: string[] = [input.viewerId];
    const filters = [
      "f.purpose = 'assessment_audio'",
      "viewer.role in ('operator', 'manager')",
      "owner.organization_id = viewer.organization_id"
    ];
    if (input.learnerId) {
      values.push(input.learnerId);
      filters.push(`f.owner_user_id = $${values.length}`);
    }
    if (input.sourceFlow) {
      values.push(input.sourceFlow);
      filters.push(`f.source_flow = $${values.length}`);
    }
    const result = await this.pool.query<AudioFileRow>(
      `select f.*
       from files f
       join users owner on owner.id = f.owner_user_id
       join users viewer on viewer.id = $1
       where ${filters.join(" and ")}
       order by f.created_at desc, f.id`,
      values
    );
    return result.rows.map(fromAudioRow);
  }

  async markAudioCompleted(input: {
    actorId: string;
    fileId: string;
    transcript?: string | null;
  }): Promise<AudioFileRecord | null> {
    return this.updateAudioLifecycle(input, "completed");
  }

  async markAudioGraded(input: {
    actorId: string;
    fileId: string;
    transcript?: string | null;
  }): Promise<AudioFileRecord | null> {
    return this.updateAudioLifecycle(input, "graded");
  }

  async createAudioDeletionConfirmation(input: {
    actorId: string;
    fileId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `insert into file_deletion_confirmations (
         id, file_id, organization_id, requester_user_id, token_hash, expires_at
       )
       select gen_random_uuid(), f.id, f.organization_id, $1, $3, $4
       from files f
       join users actor on actor.id = $1
       where f.id = $2 and f.purpose = 'assessment_audio'
         and f.deleted_at is null
         and actor.role in ('operator', 'manager')
         and actor.organization_id = f.organization_id
       returning id`,
      [input.actorId, input.fileId, input.tokenHash, input.expiresAt]
    );
    return Boolean(result.rowCount);
  }

  async findAudioDeleteTarget(actorId: string, fileId: string, tokenHash: string): Promise<AudioFileRecord | null> {
    const result = await this.pool.query<AudioFileRow>(
      `select f.*
       from files f
       join users actor on actor.id = $1
       join file_deletion_confirmations c on c.file_id = f.id
         and c.requester_user_id = actor.id
         and c.token_hash = $3
         and c.used_at is null
         and c.expires_at > now()
       where f.id = $2 and f.purpose = 'assessment_audio'
         and f.deleted_at is null
         and actor.role in ('operator', 'manager')
         and actor.organization_id = f.organization_id
       limit 1`,
      [actorId, fileId, tokenHash]
    );
    return result.rows[0] ? fromAudioRow(result.rows[0]) : null;
  }

  async deleteAudioWithConfirmation(input: {
    actorId: string;
    fileId: string;
    tokenHash: string;
    traceId: string;
    now?: Date;
  }): Promise<{ status: "deleted" | "not_found" | "invalid_confirmation" | "already_deleted"; file?: AudioFileRecord }> {
    const now = input.now ?? new Date();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const file = await client.query<AudioFileRow>(
        `select f.*
         from files f
         join users actor on actor.id = $1
         where f.id = $2 and f.purpose = 'assessment_audio'
           and actor.role in ('operator', 'manager')
           and actor.organization_id = f.organization_id
         for update`,
        [input.actorId, input.fileId]
      );
      if (!file.rows[0]) {
        await client.query("rollback");
        return { status: "not_found" };
      }
      if (file.rows[0].deleted_at) {
        await client.query("rollback");
        return { status: "already_deleted" };
      }
      const confirmation = await client.query(
        `select id from file_deletion_confirmations
         where file_id = $1 and requester_user_id = $2 and token_hash = $3
           and used_at is null and expires_at > $4
         for update`,
        [input.fileId, input.actorId, input.tokenHash, now]
      );
      if (!confirmation.rowCount) {
        await client.query("rollback");
        return { status: "invalid_confirmation" };
      }
      const updated = await client.query<AudioFileRow>(
        `update files
         set deleted_at = $3, deleted_by = $1
         where id = $2 and deleted_at is null
         returning *`,
        [input.actorId, input.fileId, now]
      );
      await client.query(
        `update file_deletion_confirmations set used_at = $2 where id = $1`,
        [confirmation.rows[0].id, now]
      );
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values (gen_random_uuid(), $1, $2, 'audio_object_deleted', 'file', $3, $4::jsonb, $5)`,
        [
          updated.rows[0]!.organization_id,
          input.actorId,
          input.fileId,
          JSON.stringify({ objectKey: updated.rows[0]!.object_key, transcriptRetained: true, scoreFeedbackRetained: true, deletedAt: now.toISOString() }),
          input.traceId
        ]
      );
      await client.query("commit");
      return { status: "deleted", file: fromAudioRow(updated.rows[0]!) };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async updateAudioLifecycle(input: {
    actorId: string;
    fileId: string;
    transcript?: string | null;
  }, event: "completed" | "graded"): Promise<AudioFileRecord | null> {
    const column = event === "completed" ? "completed_at" : "graded_at";
    const result = await this.pool.query<AudioFileRow>(
      `update files as file
       set ${column} = coalesce(${column}, now()),
           retention_until = now() + interval '60 days',
           transcript = coalesce($3, transcript)
       from users actor, users owner
       where file.id = $2 and file.purpose = 'assessment_audio'
         and actor.id = $1
         and owner.id = file.owner_user_id
         and (
           (actor.role = 'learner' and file.owner_user_id = actor.id)
           or (actor.role in ('operator', 'manager') and owner.organization_id = actor.organization_id)
         )
       returning file.*`,
      [input.actorId, input.fileId, input.transcript ?? null]
    );
    return result.rows[0] ? fromAudioRow(result.rows[0]) : null;
  }
}

export type AudioSourceFlow = "placement" | "daily_lesson" | "weekly_practice" | "season";

interface CreateFileInput {
  id: string;
  ownerUserId: string;
  purpose: string;
  bucket: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  sourceFlow?: AudioSourceFlow;
  sourceEntityId?: string | null;
  taskKey?: string | null;
  questionKey?: string | null;
  transcript?: string | null;
}

export interface AudioFileRecord {
  id: string;
  organizationId: string;
  ownerUserId: string | null;
  purpose: string;
  bucket: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  sourceFlow: AudioSourceFlow;
  sourceEntityId: string | null;
  taskKey: string | null;
  questionKey: string | null;
  transcript: string | null;
  createdAt: Date;
  completedAt: Date | null;
  gradedAt: Date | null;
  retentionUntil: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
}

interface AudioFileRow {
  id: string;
  organization_id: string;
  owner_user_id: string | null;
  purpose: string;
  bucket: string;
  object_key: string;
  mime_type: string;
  size_bytes: number | string;
  sha256: string;
  source_flow: AudioSourceFlow;
  source_entity_id: string | null;
  task_key: string | null;
  question_key: string | null;
  transcript: string | null;
  created_at: Date;
  completed_at: Date | null;
  graded_at: Date | null;
  retention_until: Date | null;
  deleted_at: Date | null;
  deleted_by: string | null;
}

function fromAudioRow(row: AudioFileRow): AudioFileRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    purpose: row.purpose,
    bucket: row.bucket,
    objectKey: row.object_key,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    sourceFlow: row.source_flow,
    sourceEntityId: row.source_entity_id,
    taskKey: row.task_key,
    questionKey: row.question_key,
    transcript: row.transcript,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    gradedAt: row.graded_at,
    retentionUntil: row.retention_until,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by
  };
}

function storedAudioArtifact(audio: AudioArtifactInput): AudioArtifactView {
  return {
    artifactKey: audio.artifactKey,
    ...(audio.fileId ? { fileId: audio.fileId } : {}),
    ...(audio.transcript !== undefined ? { transcript: audio.transcript } : {})
  };
}

function audioArtifactFromContent(content: Record<string, unknown>): AudioArtifactView | undefined {
  const value = content.audioArtifact;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const audio = value as Record<string, unknown>;
  if (typeof audio.artifactKey !== "string" || !audio.artifactKey) return undefined;
  return {
    artifactKey: audio.artifactKey,
    ...(typeof audio.fileId === "string" ? { fileId: audio.fileId } : {}),
    ...(typeof audio.transcript === "string" || audio.transcript === null ? { transcript: audio.transcript } : {})
  };
}

async function linkAudioOnClient(client: PoolClient, input: {
  ownerUserId: string;
  audio: AudioArtifactInput;
  sourceFlow: AudioSourceFlow;
  sourceEntityId: string;
  taskKey?: string | null;
  questionKey?: string | null;
}): Promise<void> {
  await client.query(
    `update files as file
     set source_flow = $4,
         source_entity_id = $5,
         task_key = $6,
         question_key = $7,
         transcript = coalesce($8, file.transcript),
         completed_at = coalesce(file.completed_at, now()),
         retention_until = coalesce(file.retention_until, now() + interval '60 days')
     where file.purpose = 'assessment_audio'
       and file.owner_user_id = $1
       and (($2::uuid is not null and file.id = $2::uuid)
         or ($3::text is not null and file.object_key = $3::text))`,
    [input.ownerUserId, input.audio.fileId ?? null, input.audio.artifactKey,
      input.sourceFlow, input.sourceEntityId, input.taskKey ?? null, input.questionKey ?? null,
      input.audio.transcript ?? null]
  );
}

class AiRunRepository {
  constructor(private readonly pool: Pool) {}

  async listForUser(userId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `select id, task_id, provider, model, status, usage, latency_ms, trace_id, error_code, created_at, completed_at
       from ai_runs where user_id = $1 order by created_at desc`,
      [userId]
    );
    return result.rows;
  }

  async requestExists(userId: string, requestKey: string, taskKey: string): Promise<boolean> {
    const result = await this.pool.query(
      `select 1 from ai_runs ar join ai_tasks at on at.id = ar.task_id
       where ar.user_id = $1 and ar.request_key = $2 and at.task_key = $3 limit 1`,
      [userId, requestKey, taskKey]
    );
    return Boolean(result.rowCount);
  }

  async findSucceededOutput(userId: string, requestKey: string, taskKey: string): Promise<{ output: unknown } | null> {
    const result = await this.pool.query<{ output: unknown }>(
      `select ar.output
       from ai_runs ar
       join ai_tasks at on at.id = ar.task_id
       where ar.user_id = $1 and ar.request_key = $2 and at.task_key = $3
         and ar.status = 'succeeded'
       limit 1`,
      [userId, requestKey, taskKey]
    );
    const row = result.rows[0];
    return row ? { output: row.output } : null;
  }

  async findSucceededOutputForOrganization(actorId: string, requestKey: string, taskKey: string): Promise<{ output: unknown } | null> {
    const result = await this.pool.query<{ output: unknown }>(
      `select ar.output
       from users actor
       join users run_user on run_user.organization_id = actor.organization_id
       join ai_runs ar on ar.user_id = run_user.id
       join ai_tasks at on at.id = ar.task_id
       where actor.id = $1 and ar.request_key = $2 and at.task_key = $3
         and ar.status = 'succeeded'
       order by ar.completed_at desc nulls last, ar.created_at desc
       limit 1`,
      [actorId, requestKey, taskKey]
    );
    const row = result.rows[0];
    return row ? { output: row.output } : null;
  }

  async activeTaskPrompt(userId: string, taskKey: string): Promise<{
    taskId: string; promptVersionId: string; prompt: string;
  } | null> {
    await ensurePrototypePromptsForUser(this.pool, userId, ["system_rules", taskKey]);
    const result = await this.pool.query<{ task_id: string; prompt_version_id: string; prompt: string }>(
      `select at.id as task_id, task_prompt.id as prompt_version_id,
              concat_ws(E'\n\n', base_prompt.content, task_prompt.content) as prompt
       from users u
       join ai_tasks at on at.task_key = $2
       join lateral (
         select id, content from prompt_versions
         where organization_id = u.organization_id and task_key = $2 and status = 'active'
         order by version desc limit 1
       ) task_prompt on true
       left join lateral (
         select content from prompt_versions
         where organization_id = u.organization_id and task_key = 'system_rules' and status = 'active'
         order by version desc limit 1
       ) base_prompt on true
       where u.id = $1`,
      [userId, taskKey]
    );
    const row = result.rows[0];
    return row ? { taskId: row.task_id, promptVersionId: row.prompt_version_id, prompt: row.prompt } : null;
  }

  async recordSucceeded(input: {
    userId: string; requestId: string; taskId: string; promptVersionId: string; output: unknown; metadata: AiRunMetadataInput;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      return await insertAiRun(client, {
        id: randomUUID(), learnerId: input.userId, requestId: input.requestId, taskId: input.taskId,
        promptVersionId: input.promptVersionId, output: input.output, metadata: input.metadata
      });
    } finally { client.release(); }
  }

  async recordCheckpoint(input: {
    userId: string; requestId: string; taskId: string; promptVersionId: string; output: unknown; metadata: AiRunMetadataInput;
  }): Promise<void> {
    await this.pool.query(
      `insert into ai_runs
         (id, task_id, user_id, prompt_version_id, provider, model, status, input_hash,
          output, usage, latency_ms, trace_id, request_key, completed_at)
       values ($1, $2, $3, $4, $5, $6, 'succeeded', $7, $8::jsonb, $9::jsonb, $10, $11, $12, now())
       on conflict (user_id, task_id, request_key) where request_key is not null do update
       set provider = excluded.provider,
           model = excluded.model,
           status = 'succeeded',
           input_hash = excluded.input_hash,
           output = excluded.output,
           usage = excluded.usage,
           latency_ms = excluded.latency_ms,
           completed_at = now(),
           error_code = null`,
      [randomUUID(), input.taskId, input.userId, input.promptVersionId, input.metadata.provider,
        input.metadata.model, input.metadata.inputHash, JSON.stringify(input.output), JSON.stringify(input.metadata.usage),
        input.metadata.latencyMs, randomUUID(), input.requestId]
    );
  }

  /**
   * Keep an auditable diagnostic for a failed generation attempt.  This must
   * never mutate lesson versions: a failed run is evidence only, while the
   * last published version remains the recovery point for operators.
   */
  async recordFailed(input: {
    userId: string; requestId: string; taskId: string; promptVersionId: string;
    errorCode: string; diagnostic: unknown;
    metadata?: Partial<AiRunMetadataInput>;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const metadata = input.metadata;
      const result = await client.query(
        `insert into ai_runs
           (id, task_id, user_id, prompt_version_id, provider, model, status, input_hash,
            output, usage, latency_ms, trace_id, request_key, error_code, completed_at)
         values ($1, $2, $3, $4, $5, $6, 'failed', $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, now())
         on conflict (user_id, task_id, request_key) where request_key is not null do nothing
         returning id`,
        [randomUUID(), input.taskId, input.userId, input.promptVersionId,
          metadata?.provider ?? "unavailable", metadata?.model ?? "unavailable",
          metadata?.inputHash ?? "generation-failed-before-output", JSON.stringify({ diagnostic: input.diagnostic }),
          JSON.stringify(metadata?.usage ?? {}), metadata?.latencyMs ?? null,
          metadata?.traceId ?? randomUUID(), input.requestId, input.errorCode]
      );
      return Boolean(result.rowCount);
    } finally { client.release(); }
  }
}

class JobRepository {
  constructor(private readonly pool: Pool) {}

  async enqueue(input: JobInput): Promise<void> {
    await this.pool.query(
      `insert into jobs (id, kind, payload, max_attempts, idempotency_key)
       values ($1, $2, $3::jsonb, $4, $5)
       on conflict (idempotency_key) do nothing`,
      [input.id, input.kind, JSON.stringify(input.payload), input.maxAttempts ?? 3, input.idempotencyKey ?? null]
    );
  }

  async leaseNext(workerId: string, leaseSeconds: number, kinds?: string[]): Promise<LeasedJob | null> {
    const result = await this.pool.query<{
      id: string;
      kind: string;
      payload: unknown;
      state: "running";
      attempts: number;
      max_attempts: number;
      locked_by: string;
    }>(
      `with next_job as (
         select id from jobs
         where (
           (state = 'queued' and run_at <= now())
           or (state = 'running' and lock_expires_at <= now())
         )
         and attempts < max_attempts
         and ($3::text[] is null or kind = any($3::text[]))
         order by run_at, created_at
         for update skip locked
         limit 1
       )
       update jobs j
       set state = 'running', attempts = attempts + 1, locked_by = $1,
           lock_expires_at = now() + ($2 * interval '1 second'), updated_at = now()
       from next_job
       where j.id = next_job.id
       returning j.id, j.kind, j.payload, j.state, j.attempts, j.max_attempts, j.locked_by`,
      [workerId, leaseSeconds, kinds ?? null]
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          kind: row.kind,
          payload: row.payload,
          state: row.state,
          attempts: row.attempts,
          maxAttempts: row.max_attempts,
          lockedBy: row.locked_by
        }
      : null;
  }

  async markSucceeded(id: string, workerId: string): Promise<boolean> {
    const result = await this.pool.query(
      `update jobs
       set state = 'succeeded', locked_by = null, lock_expires_at = null, updated_at = now()
       where id = $1 and state = 'running' and locked_by = $2 and lock_expires_at > now()
       returning id`,
      [id, workerId]
    );
    return Boolean(result.rowCount);
  }

  async markFailed(id: string, workerId: string, error: string, retry = true): Promise<"queued" | "dead" | null> {
    const result = await this.pool.query<{ state: "queued" | "dead" | "failed" }>(
      `update jobs
       set state = case when not $4 then 'failed' when attempts >= max_attempts then 'dead' else 'queued' end,
           run_at = case
             when attempts >= max_attempts then run_at
             else now() + (least(attempts, 6) * interval '10 seconds')
           end,
           locked_by = null,
           lock_expires_at = null,
           last_error = left($3, 2_000),
           updated_at = now()
       where id = $1 and state = 'running' and locked_by = $2 and lock_expires_at > now()
       returning state`,
      [id, workerId, error, retry]
    );
    const state = result.rows[0]?.state;
    return state === "queued" || state === "dead" ? state : null;
  }
}

interface ProviderConfigurationRow {
  provider: ManagerProviderKind;
  base_url: string;
  model: string;
  speech_to_text_model: string;
  secret_ciphertext: string | null;
  secret_nonce: string | null;
  secret_auth_tag: string | null;
  last_test_status: ManagerProviderTestView["status"];
  last_test_code: string | null;
  last_tested_at: Date | null;
}

export interface ManagerAiRuntimeSettings {
  provider: ManagerProviderKind;
  baseUrl: string;
  model: string;
  credential: string;
  /** Speech-to-text model of an OpenAI-compatible provider; empty when none is configured. */
  speechToTextModel?: string;
}

const providerDefaults = (provider: ManagerProviderKind): Pick<ManagerProviderSettingsView, "baseUrl" | "model" | "speechToTextModel"> => {
  if (provider === "claude") return {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-haiku-5-5",
    speechToTextModel: ""
  };
  if (provider === "gemini") return {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-1.5-flash",
    speechToTextModel: ""
  };
  return {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "qwen/qwen3.8-27b",
    speechToTextModel: "whisper-large-v3-turbo"
  };
};

function providerCapabilities(provider: ManagerProviderKind): NonNullable<ManagerProviderSettingsView["capabilities"]> {
  return { chat: true, structuredOutput: true, speechToText: provider === "openai" };
}

function mapProviderSettings(row?: ProviderConfigurationRow): ManagerProviderSettingsView {
  const provider = row?.provider ?? "openai";
  const defaults = providerDefaults(provider);
  return {
    provider,
    configured: Boolean(row?.secret_ciphertext),
    baseUrl: row?.base_url || defaults.baseUrl,
    model: row?.model || defaults.model,
    speechToTextModel: row?.speech_to_text_model || defaults.speechToTextModel,
    capabilities: providerCapabilities(provider),
    lastTest: {
      status: row?.last_test_status ?? "never",
      testedAt: row?.last_tested_at?.toISOString() ?? null,
      code: redactProviderTestCode(row?.last_test_code ?? null)
    }
  };
}

function redactProviderTestCode(code: string | null): string | null {
  if (!code || !/^[A-Z0-9_:-]{1,80}$/.test(code)) return null;
  return code;
}

function readSettingsEncryptionKey(): Buffer {
  const encoded = process.env.E4S_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("PROVIDER_SETTINGS_ENCRYPTION_KEY_MISSING");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("PROVIDER_SETTINGS_ENCRYPTION_KEY_INVALID");
  return key;
}

function encryptRecoverableSecret(secret: string): { ciphertext: string; nonce: string; authTag: string } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", readSettingsEncryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), nonce: nonce.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

function decryptRecoverableSecret(row: { recovery_ciphertext: string | null; recovery_nonce: string | null; recovery_auth_tag: string | null }): string {
  if (!row.recovery_ciphertext || !row.recovery_nonce || !row.recovery_auth_tag) throw new Error("MANAGER_ACCOUNT_PIN_UNAVAILABLE");
  try {
    const decipher = createDecipheriv("aes-256-gcm", readSettingsEncryptionKey(), Buffer.from(row.recovery_nonce, "base64"));
    decipher.setAuthTag(Buffer.from(row.recovery_auth_tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(row.recovery_ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message === "MANAGER_ACCOUNT_PIN_UNAVAILABLE") throw error;
    if (error instanceof Error && error.message.startsWith("PROVIDER_SETTINGS_ENCRYPTION_KEY_")) throw error;
    throw new Error("MANAGER_ACCOUNT_PIN_DECRYPT_FAILED");
  }
}

function encryptProviderSecret(secret: string): { ciphertext: string; nonce: string; authTag: string } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", readSettingsEncryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

function decryptProviderSecret(row: Pick<ProviderConfigurationRow, "secret_ciphertext" | "secret_nonce" | "secret_auth_tag">): string {
  if (!row.secret_ciphertext || !row.secret_nonce || !row.secret_auth_tag) return "";
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      readSettingsEncryptionKey(),
      Buffer.from(row.secret_nonce, "base64")
    );
    decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(row.secret_ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PROVIDER_SETTINGS_ENCRYPTION_KEY_")) throw error;
    throw new Error("PROVIDER_SETTINGS_DECRYPT_FAILED");
  }
}

async function probeProvider(input: {
  provider: ManagerProviderKind;
  baseUrl: string;
  model: string;
  credential: string;
}): Promise<Pick<ManagerProviderTestView, "status" | "code">> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const baseUrl = input.baseUrl.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(baseUrl)) return { status: "error", code: "PROVIDER_ENDPOINT_INVALID" };
    let url = `${baseUrl}/chat/completions`;
    let headers: Record<string, string> = { "content-type": "application/json" };
    let body: Record<string, unknown> = {
      model: input.model,
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 8
    };
    if (input.provider === "claude") {
      url = `${baseUrl}/messages`;
      headers = { "content-type": "application/json", "x-api-key": input.credential, "anthropic-version": "2023-06-01" };
      body = { model: input.model, max_tokens: 8, messages: [{ role: "user", content: "Reply with OK." }] };
    } else if (input.provider === "gemini") {
      url = `${baseUrl}/models/${encodeURIComponent(input.model)}:generateContent`;
      headers = { "content-type": "application/json", "x-goog-api-key": input.credential };
      body = { contents: [{ parts: [{ text: "Reply with OK." }] }] };
    } else {
      headers.authorization = `Bearer ${input.credential}`;
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (response.ok) return { status: "success", code: null };
    return { status: "error", code: response.status >= 500 ? "PROVIDER_UNAVAILABLE" : `PROVIDER_HTTP_${response.status}` };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return { status: "timeout", code: "PROVIDER_TIMEOUT" };
    return { status: "error", code: "PROVIDER_NETWORK_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}

class ManagerRepository {
  constructor(private readonly pool: Pool) {}

  /** Called by the manager dashboard and the API process sweep; a manager can later reopen the account. */
  async lockInactiveLearners(): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const candidates = await client.query<{ id: string; organization_id: string }>(
        // A test date ahead of the real Vietnam date never locks anyone: those absences have not happened.
        `select u.id, u.organization_id from users u
         where u.role = 'learner' and u.status = 'active'
           and exists (select 1 from enrollments e where e.learner_id = u.id and e.cefr_approved)
           and organization_system_date(u.organization_id) <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
         order by u.id for update of u`
      );
      let locked = 0;
      for (const learner of candidates.rows) {
        const missedDays = await learnerConsecutiveLearningAbsences(client, learner.id);
        if (missedDays < 5) continue;
        await client.query("update users set status = 'disabled', updated_at = now() where id = $1", [learner.id]);
        await client.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [learner.id]);
        await client.query(
          `insert into audit_events (id, organization_id, action, entity_type, entity_id, payload, trace_id)
           values ($1, $2, 'learner.inactivity_locked', 'user', $3, $4::jsonb, $5)`,
          [randomUUID(), learner.organization_id, learner.id, JSON.stringify({ missedDays, thresholdDays: 5 }), randomUUID()]
        );
        locked++;
      }
      await client.query("commit");
      return locked;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  private async eligibleReminderLearners(db: Pool | PoolClient, organizationId: string, learnerId?: string, includeQueued = false): Promise<Array<{
    learner_id: string;
    learner_name: string;
    learner_email: string | null;
    cefr: CefrLevel | null;
    last_activity_at: Date | null;
    missed_days: number;
  }>> {
    const result = await db.query<{
      learner_id: string;
      learner_name: string;
      learner_email: string | null;
      cefr: CefrLevel | null;
      last_activity_at: Date | null;
    }>(
      `select
         u.id as learner_id,
         u.display_name as learner_name,
         nullif(trim(u.email), '') as learner_email,
         (select e.cefr from enrollments e join programs p on p.id = e.program_id
          where e.learner_id = u.id and p.organization_id = $1 order by e.enrolled_at desc limit 1) as cefr,
         activity.last_activity_at
       from users u
       left join lateral (
         select max(a.occurred_at) as last_activity_at from activities a where a.learner_id = u.id
       ) activity on true
       where u.organization_id = $1 and u.role = 'learner' and u.status = 'active'
         and exists (select 1 from enrollments e where e.learner_id = u.id and e.cefr_approved)
         and not exists (
           select 1 from audit_events handled
           where handled.organization_id = $1 and handled.entity_id = u.id
              and handled.action in ('reminder.dismissed'${includeQueued ? "" : ", 'reminder.queued'"})
             and (handled.created_at at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date
         )
         ${learnerId ? "and u.id = $2" : ""}
       order by activity.last_activity_at asc nulls first, u.display_name asc
       ${learnerId ? "for update of u" : ""}`,
      learnerId ? [organizationId, learnerId] : [organizationId]
    );
    const eligible = [];
    for (const learner of result.rows) {
      const missedDays = await learnerConsecutiveLearningAbsences(db, learner.learner_id);
      if (missedDays >= 3 && missedDays < 5) eligible.push({ ...learner, missed_days: missedDays });
    }
    return eligible;
  }

  private async requireEligibleReminderLearner(db: PoolClient, organizationId: string, learnerId: string): Promise<{
    learner_id: string;
    learner_email: string | null;
    missed_days: number;
  }> {
    const eligible = (await this.eligibleReminderLearners(db, organizationId, learnerId, true))[0];
    if (eligible) return eligible;
    const target = await db.query(
      `select 1 from users
       where id = $1 and organization_id = $2 and role = 'learner' and status = 'active'`,
      [learnerId, organizationId]
    );
    if (!target.rowCount) throw new Error("MANAGER_REMINDER_LEARNER_NOT_FOUND");
    throw new Error("MANAGER_REMINDER_NOT_ELIGIBLE");
  }

  private async organizationFor(staffId: string): Promise<{ id: string; name: string; role: AccountRole } | null> {
    const organization = await this.pool.query<{ id: string; name: string; role: AccountRole }>(
      `select o.id, o.name, u.role
       from users u
       join organizations o on o.id = u.organization_id
       where u.id = $1`,
      [staffId]
    );
    return organization.rows[0] ?? null;
  }

  private async settingsForOrganization(organizationId: string): Promise<Omit<ManagerSettingsView, "organizationName">> {
    const program = await this.pool.query<{
      id: string; name: string; start_date: string; week_count: number; current_week_override: number | null;
      today: string; cycle_number: string;
    }>(
      `select p.id, p.name, p.start_date::text, p.week_count, p.current_week_override,
              organization_system_date(p.organization_id)::text as today,
              (select count(*)::text from programs cycle
               where cycle.organization_id = p.organization_id
                 and cycle.created_at <= p.created_at) as cycle_number
       from programs p
       where p.organization_id = $1 and p.status = 'active'
       order by p.start_date desc
       limit 1`,
      [organizationId]
    );
    const activeProgram = program.rows[0];
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = monday.getUTCDay() || 7;
    monday.setUTCDate(monday.getUTCDate() - day + 1);
    const currentMonday = monday.toISOString().slice(0, 10);
    const defaults: Omit<ManagerSettingsView, "organizationName"> = {
      programName: activeProgram?.name ?? "Chương trình tiếng Anh",
      aiTestDisabled: false,
      reminderInactiveDays: 3, weeklyReportEnabled: true,
      pilotStartDate: activeProgram?.start_date ?? currentMonday,
      // Empty means no test date: the organisation follows the real Vietnam date.
      simulatedSystemDate: "",
      pilotWeeks: activeProgram?.week_count ?? 2,
      weekOverride: activeProgram?.current_week_override ?? 0,
      minMinutesPerDay: 15,
      courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 30,
      testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3,
      backgroundMusic: { enabled: true, url: "", volume: 22 },
      baseWebhookUrl: "", baseWebhookTemplate: "{\"base_content\":\"{message}\"}"
    };
    const result = await this.pool.query<{ reminder_inactive_days: number; weekly_report_enabled: boolean; configuration: Partial<Omit<ManagerSettingsView, "organizationName">> }>(
      "select reminder_inactive_days, weekly_report_enabled, configuration from organization_settings where organization_id = $1",
      [organizationId]
    );
    const settings = result.rows[0];
    // A levelUp stored by the removed "Ngưỡng xét lên / hạ mức" card stays in the row but is never returned.
    const { levelUp: _retiredLevelUp, ...configuration } = (settings?.configuration ?? {}) as Partial<Omit<ManagerSettingsView, "organizationName">> & { levelUp?: unknown };
    const base = settings
      ? { ...defaults, ...configuration, reminderInactiveDays: settings.reminder_inactive_days, weeklyReportEnabled: settings.weekly_report_enabled,
          baseWebhookUrl: "", baseWebhookTemplate: defaults.baseWebhookTemplate,
          programName: activeProgram?.name ?? defaults.programName,
          pilotStartDate: activeProgram?.start_date ?? defaults.pilotStartDate,
          simulatedSystemDate: settings.configuration?.simulatedSystemDate ?? defaults.simulatedSystemDate,
          pilotWeeks: activeProgram?.week_count ?? defaults.pilotWeeks,
          weekOverride: 0,
          testTimes: { ...defaults.testTimes, ...settings.configuration?.testTimes },
          backgroundMusic: { ...defaults.backgroundMusic, ...settings.configuration?.backgroundMusic } }
      : defaults;
    if (!activeProgram) return base;
    const start = Date.parse(`${activeProgram.start_date}T00:00:00.000Z`);
    const todayMs = Date.parse(`${activeProgram.today}T00:00:00.000Z`);
    const elapsedWeek = Math.floor((todayMs - start) / (7 * 86_400_000)) + 1;
    const endDate = new Date(start + (activeProgram.week_count * 7 - 1) * 86_400_000).toISOString().slice(0, 10);
    const extension = await this.pool.query<{
      actor_name: string; from_weeks: string; to_weeks: string; changed_at: Date;
    }>(
      `select actor.display_name as actor_name,
              event.payload->>'fromWeeks' as from_weeks,
              event.payload->>'toWeeks' as to_weeks,
              event.created_at as changed_at
       from audit_events event
       left join users actor on actor.id = event.actor_user_id
       where event.organization_id = $1 and event.entity_id = $2
         and event.action = 'pilot.duration_extended'
       order by event.created_at desc limit 1`,
      [organizationId, activeProgram.id]
    );
    const latest = extension.rows[0];
    return {
      ...base,
      pilotCycle: {
        number: Number(activeProgram.cycle_number) || 1,
        currentWeek: Math.max(1, Math.min(activeProgram.week_count, elapsedWeek)),
        state: elapsedWeek > activeProgram.week_count ? "awaiting_next_cycle" : "active",
        startDate: activeProgram.start_date,
        endDate,
        ...(latest ? { lastExtension: {
          actorName: latest.actor_name || "Người vận hành",
          fromWeeks: Number(latest.from_weeks),
          toWeeks: Number(latest.to_weeks),
          changedAt: latest.changed_at.toISOString()
        } } : {})
      }
    };
  }

  async providerSettings(staffId: string): Promise<ManagerProviderSettingsView | null> {
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;
    const result = await this.pool.query<ProviderConfigurationRow>(
      `select provider, base_url, model, speech_to_text_model, secret_ciphertext,
              last_test_status, last_test_code, last_tested_at
       from provider_configurations where organization_id = $1`,
      [organization.id]
    );
    const row = result.rows[0];
    return mapProviderSettings(row);
  }

  /** Loads the encrypted provider credential only for server-side AI wiring. */
  async providerRuntime(staffId: string): Promise<ManagerAiRuntimeSettings | null> {
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;
    const result = await this.pool.query<ProviderConfigurationRow>(
      `select provider, base_url, model, speech_to_text_model, secret_ciphertext,
              secret_nonce, secret_auth_tag, last_test_status, last_test_code, last_tested_at
       from provider_configurations where organization_id = $1`,
      [organization.id]
    );
    const row = result.rows[0];
    if (!row?.secret_ciphertext) return null;
    const defaults = providerDefaults(row.provider);
    return {
      provider: row.provider,
      baseUrl: row.base_url || defaults.baseUrl,
      model: row.model || defaults.model,
      credential: decryptProviderSecret(row),
      speechToTextModel: row.speech_to_text_model || defaults.speechToTextModel
    };
  }

  async saveProviderSettings(managerId: string, input: ManagerProviderSettingsInput): Promise<ManagerProviderSettingsView> {
    const organization = await this.organizationFor(managerId);
    if (!organization) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    const current = await this.pool.query<ProviderConfigurationRow>(
      `select provider, base_url, model, speech_to_text_model, secret_ciphertext, secret_nonce, secret_auth_tag,
              last_test_status, last_test_code, last_tested_at
       from provider_configurations where organization_id = $1`,
      [organization.id]
    );
    const existing = current.rows[0];
    const secret = typeof input.credential === "string" && input.credential.trim().length > 0
      ? encryptProviderSecret(input.credential)
      : existing
        ? { ciphertext: existing.secret_ciphertext, nonce: existing.secret_nonce, authTag: existing.secret_auth_tag }
        : { ciphertext: null, nonce: null, authTag: null };
    await this.pool.query(
      `insert into provider_configurations
         (organization_id, provider, base_url, model, speech_to_text_model,
          secret_ciphertext, secret_nonce, secret_auth_tag, last_test_status, last_test_code,
          last_tested_at, updated_by, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'never', null, null, $9, now())
       on conflict (organization_id) do update
       set provider = excluded.provider,
           base_url = excluded.base_url,
           model = excluded.model,
           speech_to_text_model = excluded.speech_to_text_model,
           secret_ciphertext = excluded.secret_ciphertext,
           secret_nonce = excluded.secret_nonce,
           secret_auth_tag = excluded.secret_auth_tag,
           last_test_status = 'never',
           last_test_code = null,
           last_tested_at = null,
           updated_by = excluded.updated_by,
           updated_at = now()`,
      [organization.id, input.provider, input.baseUrl.trim(), input.model.trim(), input.speechToTextModel.trim(),
        secret.ciphertext, secret.nonce, secret.authTag, managerId]
    );
    await this.pool.query(
      `insert into audit_events
         (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
       values ($1, $2, $3, 'provider.settings.updated', 'organization', $2, $4::jsonb, $5)`,
      [randomUUID(), organization.id, managerId, JSON.stringify({ provider: input.provider, model: input.model.trim() }), randomUUID()]
    );
    const saved = await this.providerSettings(managerId);
    if (!saved) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    return saved;
  }

  async testProviderSettings(managerId: string, input?: ManagerProviderSettingsTestInput): Promise<ManagerProviderTestView> {
    const organization = await this.organizationFor(managerId);
    if (!organization) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    const result = await this.pool.query<ProviderConfigurationRow>(
      `select provider, base_url, model, speech_to_text_model, secret_ciphertext, secret_nonce, secret_auth_tag,
              last_test_status, last_test_code, last_tested_at
       from provider_configurations where organization_id = $1`,
      [organization.id]
    );
    const current = result.rows[0];
    const provider = input?.provider ?? current?.provider ?? "openai";
    const baseUrl = input?.baseUrl?.trim() ?? current?.base_url ?? providerDefaults(provider).baseUrl;
    const model = input?.model?.trim() ?? current?.model ?? providerDefaults(provider).model;
    const speechToTextModel = input?.speechToTextModel?.trim() ?? current?.speech_to_text_model ?? providerDefaults(provider).speechToTextModel;
    const credential = typeof input?.credential === "string" && input.credential.trim().length > 0
      ? input.credential.trim()
      : current?.secret_ciphertext
        ? decryptProviderSecret(current)
        : "";
    const testedAt = new Date().toISOString();
    const outcome = !credential
      ? { status: "error" as const, code: "PROVIDER_NOT_CONFIGURED" }
      : await probeProvider({ provider, baseUrl, model, credential });
    const view: ManagerProviderTestView = { status: outcome.status, testedAt, code: outcome.code };
    if (current) {
      await this.pool.query(
        `update provider_configurations
         set last_test_status = $2, last_test_code = $3, last_tested_at = $4, updated_by = $5, updated_at = now()
         where organization_id = $1`,
        [organization.id, view.status, view.code, testedAt, managerId]
      );
    }
    return view;
  }

  async monthlyOverview(staffId: string, filter: ManagerMonthlyFilter = {}): Promise<ManagerMonthlyOverviewView | null> {
    const identity = await this.pool.query<{ id: string; name: string; system_date: string }>(
      `select o.id, o.name, organization_system_date(o.id)::text as system_date
       from users manager join organizations o on o.id = manager.organization_id
       where manager.id = $1 and manager.role = 'manager' and manager.status = 'active'`, [staffId]
    );
    const organization = identity.rows[0];
    if (!organization) return null;
    const systemDate = organization.system_date;
    const currentMonth = systemDate.slice(0, 7);
    const month = filter.month ?? currentMonth;
    const cohort = await this.pool.query<{
      id: string; name: string; email: string | null; status: string; cefr: CefrLevel | null;
      historical_cefr: CefrLevel | null; last_activity: Date | null; enrolled_on: string | null;
      placement_status: "in_progress" | "submitted" | "pending_review" | "approved" | "needs_retry" | null;
    }>(
      `select u.id, u.display_name as name, u.email, u.status, enrollment.cefr,
              (enrollment.enrolled_at at time zone 'Asia/Ho_Chi_Minh')::date::text as enrolled_on,
              coalesce(previous_exam.cefr, previous_level.from_cefr) as historical_cefr, placement.status as placement_status,
              (select max(occurred_at) from activities where learner_id = u.id
                 and (occurred_at at time zone 'Asia/Ho_Chi_Minh')::date < ($2 || '-01')::date + interval '1 month') as last_activity
       from users u
       left join lateral (
         select e.cefr, e.enrolled_at from enrollments e join programs p on p.id = e.program_id
         where e.learner_id = u.id and e.cefr_approved
           and (p.status = 'active' or $2 < $3)
           and ($2 = $3 or (e.enrolled_at at time zone 'Asia/Ho_Chi_Minh')::date < ($2 || '-01')::date + interval '1 month')
         order by (p.status = 'active') desc, e.enrolled_at desc limit 1
       ) enrollment on true
       left join lateral (
         select upper(right(d.assessment_key, 2)) as cefr
         from assessment_attempts a join assessment_versions v on v.id = a.assessment_version_id
         join assessment_definitions d on d.id = v.definition_id
         where $2 < $3 and a.learner_id = u.id and d.organization_id = $1 and d.kind = 'final'
           and d.assessment_key in ('monthly-final-' || $2 || '-a1', 'monthly-final-' || $2 || '-a2',
             'monthly-final-' || $2 || '-b1', 'monthly-final-' || $2 || '-b2', 'monthly-final-' || $2 || '-c1')
         order by a.started_at desc, a.id desc limit 1
       ) previous_exam on true
       left join lateral (
         select from_cefr from scheduled_level_changes change
         where $2 < $3 and change.learner_id = u.id and change.status = 'applied'
           and (change.effective_at at time zone 'Asia/Ho_Chi_Minh')::date >= ($2 || '-01')::date + interval '1 month'
         order by change.effective_at limit 1
       ) previous_level on true
       left join lateral (
         select a.status from assessment_attempts a join assessment_versions v on v.id = a.assessment_version_id
         join assessment_definitions d on d.id = v.definition_id and d.kind = 'placement' and d.organization_id = $1
         where a.learner_id = u.id
           and ($2 >= $3 or (a.started_at at time zone 'Asia/Ho_Chi_Minh')::date < ($2 || '-01')::date + interval '1 month')
         order by a.started_at desc, a.id desc limit 1
       ) placement on true
       where u.organization_id = $1 and u.role = 'learner' and u.status in ('active', 'disabled')
         and ($2 >= $3 or (u.created_at at time zone 'Asia/Ho_Chi_Minh')::date < ($2 || '-01')::date + interval '1 month'
           or previous_exam.cefr is not null)
       order by u.display_name, u.id`, [organization.id, month, currentMonth]
    );
    const filtered = cohort.rows
      .map(row => ({ ...row, selectedLevel: row.historical_cefr ?? row.cefr }))
      .filter(row => !filter.cefr || row.selectedLevel === filter.cefr);
    const [survey, learners] = await Promise.all([
      this.monthlySurveySummary(organization.id, month, filter.cefr ? filtered.map(row => row.id) : null),
      Promise.all(filtered.map(async (row): Promise<ManagerMonthlyLearnerView> => {
        const cefr = row.selectedLevel;
        const access = await learnerMonthlyAccess(this.pool, row.id, month);
        const [facts] = (await this.pool.query<{
          exam_date: string | null; framework_published: boolean; scheduled: number; completed: number;
          reviews: number; reviewed: number; elapsed_lessons: number; completed_elapsed: number;
          turns: number; complaints: number; attendance_override: boolean; exam_status: ManagerMonthlyLearnerView["exam"]["status"];
          listening: number | null; reading: number | null; writing: number | null; speaking: number | null;
        }>(
          `select pm.exam_date::text, coalesce(mf.published_at is not null, false) as framework_published,
                  lessons.*, season.turns, problems.complaints, problems.attendance_override,
                  coalesce(attempt.status, case when form.published then 'not_started' else 'unpublished' end) as exam_status, scores.*
           from (select $1::uuid as org, $2::text as month, $3::uuid as learner, $4::text as cefr,
                        $5::date as today, $7::date as start_date) scope
           left join program_months pm on pm.organization_id = scope.org and pm.month = scope.month
           left join lateral (
             select candidate.* from month_frameworks candidate
             where candidate.program_month_id = pm.id and candidate.cefr = scope.cefr
               and candidate.status in ('approved', 'retired')
             order by (candidate.status = 'approved') desc, candidate.version desc limit 1
           ) mf on true
           cross join lateral (
             select count(*) filter (where not ${MONTH_LESSON_IS_REVIEW_SQL})::int as scheduled,
                    count(*) filter (where not ${MONTH_LESSON_IS_REVIEW_SQL} and progress.status = 'completed')::int as completed,
                    count(*) filter (where ${MONTH_LESSON_IS_REVIEW_SQL})::int as reviews,
                    count(*) filter (where ${MONTH_LESSON_IS_REVIEW_SQL} and progress.status = 'completed')::int as reviewed,
                    -- Lessons expected by today: a mid-month learner catches up from lesson 1, so every
                    -- lesson dated <= today counts (not only those from the start date); a Friday review
                    -- dated before the start date never gates the sequence, so it is not expected.
                    count(*) filter (where ml.lesson_date <= scope.today
                      and not (ml.lesson_date < scope.start_date and ${MONTH_LESSON_IS_REVIEW_SQL}))::int as elapsed_lessons,
                    count(*) filter (where ml.lesson_date <= scope.today
                      and not (ml.lesson_date < scope.start_date and ${MONTH_LESSON_IS_REVIEW_SQL})
                      and progress.status = 'completed')::int as completed_elapsed
             from month_lessons ml
             left join progress_records progress on progress.lesson_id = ml.lesson_id and progress.learner_id = scope.learner
             where ml.framework_id = mf.id and ml.status = 'approved' and ml.lesson_id is not null
           ) lessons
           cross join lateral (
             select count(*)::int as turns
             from coach_turns turn join coach_sessions session on session.id = turn.session_id
             where session.learner_id = scope.learner and turn.speaker = 'learner'
               and coalesce(session.scenario->>'kind', 'practice') = 'practice'
               and to_char(turn.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') = scope.month
               and (turn.created_at at time zone 'Asia/Ho_Chi_Minh')::date < coalesce(pm.exam_date, $6::date)
               and coalesce((turn.feedback->'evaluation'->>'countsTowardGoal')::boolean, (turn.feedback->>'relevant')::boolean, true)
           ) season
           cross join lateral (
             select ((select count(*) from learner_complaints complaint
               where complaint.organization_id = scope.org and complaint.learner_id = scope.learner
                 and coalesce(nullif(left(complaint.related_data->>'month', 7), ''), to_char(complaint.submitted_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM')) = scope.month)
               + (select count(*) from appeals appeal where appeal.learner_id = scope.learner
                 and to_char(appeal.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') = scope.month))::int as complaints,
               exists (select 1 from learner_complaints complaint
                 where complaint.organization_id = scope.org and complaint.learner_id = scope.learner
                   and complaint.kind = 'exam_eligibility' and complaint.status in ('approved', 'auto_approved')
                   and coalesce(complaint.related_data->>'cefr', scope.cefr) = scope.cefr
                   and coalesce(nullif(left(complaint.related_data->>'month', 7), ''), to_char(complaint.submitted_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM')) = scope.month) as attendance_override
           ) problems
           left join assessment_definitions definition on definition.organization_id = scope.org and definition.kind = 'final'
             and definition.assessment_key = ('monthly-final-' || scope.month || '-' || lower(scope.cefr))
           cross join lateral (select exists(select 1 from assessment_versions version where version.definition_id = definition.id and version.status = 'published') as published) form
           left join lateral (
             select a.id, a.status from assessment_attempts a
             join assessment_versions v on v.id = a.assessment_version_id and v.definition_id = definition.id
             where a.learner_id = scope.learner
             order by a.started_at desc, a.id desc limit 1
           ) attempt on true
           cross join lateral (
             select max(s.score) filter (where s.section = 'listening')::double precision as listening,
                    max(s.score) filter (where s.section = 'reading')::double precision as reading,
                    max(s.score) filter (where s.section = 'writing')::double precision as writing,
                    max(s.score) filter (where s.section = 'speaking')::double precision as speaking
             from assessment_scores s where s.attempt_id = attempt.id
           ) scores`,
          [organization.id, month, row.id, cefr, systemDate, buildMonthlyCalendar(month).examDate,
            access?.state === "active" && access.cefr === cefr ? access.startDate : `${month}-01`]
        )).rows;
        if (!facts) throw new Error("MANAGER_MONTHLY_FACTS_MISSING");
        const examDate = facts.exam_date ?? buildMonthlyCalendar(month).examDate;
        const historicalWindow = cefr && (cefr !== access?.cefr || (month < currentMonth && access?.state !== "active" && facts.framework_published))
          ? monthlyLearnerWindow(month, examDate, row.enrolled_on ?? `${month}-01`) : null;
        const learningWindow = historicalWindow ?? access;
        const placementState = managerPlacementState(row.placement_status);
        const state = row.status === "disabled" ? "locked"
          : access?.graduated && month === currentMonth ? "graduated"
          : !cefr ? placementState
          : historicalWindow && facts.framework_published && historicalWindow.canStudy ? "active"
          : access?.state === "active" || access?.state === "waiting_next_month" || access?.state === "missed_exam" ? access.state
          : "waiting_content";
        const hasAttendance = state === "active" || state === "graduated" || (state === "locked" && (access?.state === "active" || historicalWindow?.canStudy));
        // Past weekdays without an approved lesson of this level are not absences (December 2026).
        const lessonDates = cefr && hasAttendance ? (await learnerMonthlyLessonDates(this.pool, row.id, [month], cefr)).get(month) ?? new Set<string>() : new Set<string>();
        const effective = hasAttendance ? monthlyAttendanceCountedDates(learningWindow?.effectiveDates ?? [], lessonDates, systemDate) : [];
        const elapsed = effective.filter(date => date < systemDate);
        const [attendance, readiness] = await Promise.all([
          cefr && hasAttendance
            ? learnerMonthlyAttendanceDates(this.pool, row.id, [month], { cefr })
            : new Map<string, string[]>(),
          cefr && cefr === access?.cefr && cefr !== "C1"
            ? new LearningRepository(this.pool).monthlyLevelUpReadiness(row.id, cefr, month)
            : null
        ]);
        const attended = new Set((attendance.get(month) ?? []).filter(date => effective.includes(date) && date <= systemDate));
        const daysAttended = elapsed.filter(date => attended.has(date)).length;
        const absenceDays = elapsed.length - daysAttended;
        const maxAbsences = Math.floor(effective.length * 0.3);
        const consecutiveAbsences = consecutiveLearningAbsences(effective, [...attended], systemDate, access?.resetOn ?? undefined);
        const scores = { listening: facts.listening, reading: facts.reading, writing: facts.writing, speaking: facts.speaking };
        const scoreValues = Object.values(scores);
        const examTotal = scoreValues.every((score): score is number => score !== null) ? scoreValues.reduce((sum, score) => sum + score, 0) : null;
        const levelCriteria = readiness && readiness.targetLevel ? [
          readiness.eligibleMonths >= readiness.requiredMonths,
          readiness.finalPasses >= readiness.finalPassesRequired && readiness.finalAverage !== null
            && readiness.finalAverage >= readiness.finalAverageTarget && readiness.latestFinalPassed,
          readiness.seasonMonths >= readiness.seasonMonthsRequired,
          readiness.absenceRate <= readiness.absenceCap
        ] as const : null;
        return {
          learnerId: row.id, learnerName: row.name, email: row.email, cefr, state,
          lastActivityAt: row.last_activity?.toISOString() ?? null,
          attendedDays: attended.size, elapsedDays: effective.filter(date => date <= systemDate).length,
          absenceDays, maxAbsences, consecutiveAbsences,
          lessons: { completed: facts.completed, scheduled: facts.scheduled },
          reviews: { completed: facts.reviewed, scheduled: facts.reviews },
          season: { turns: facts.turns, target: hasAttendance ? (learningWindow?.seasonTarget ?? 100) : 100 },
          exam: { status: facts.exam_status, scores, total: examTotal }, levelCriteria, complaintCount: facts.complaints,
          attendanceEligible: state === "active" && (absenceDays <= maxAbsences || facts.attendance_override),
          onTrack: elapsed.length > 0 && daysAttended / elapsed.length >= 0.7,
          completedToDate: facts.elapsed_lessons > 0 && facts.completed_elapsed === facts.elapsed_lessons,
          lessonsToDate: { completed: facts.completed_elapsed, expected: facts.elapsed_lessons },
          atRisk: state === "active" && (consecutiveAbsences >= 3 || (absenceDays > 0 && absenceDays >= Math.floor(2 * maxAbsences / 3) + 1)
            || (!facts.attendance_override && systemDate < examDate && absenceDays === maxAbsences))
        };
      }))
    ]);
    learners.sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || b.consecutiveAbsences - a.consecutiveAbsences || a.learnerName.localeCompare(b.learnerName, "vi"));
    return { organizationName: organization.name, month, currentMonth, cefr: filter.cefr ?? null, generatedAt: new Date().toISOString(), survey, learners };
  }

  private async monthlySurveySummary(organizationId: string, month: string, learnerIds: readonly string[] | null): Promise<ManagerMonthlyOverviewView["survey"]> {
    const { rows: [summary] } = await this.pool.query<ManagerMonthlyOverviewView["survey"]>(
      `with classified as (
         select submission.learner_id, exists (
                  select 1 from jsonb_array_elements(form.questions) question where question->>'kind' = 'rating'
                ) as has_rating_question,
                coalesce(ratings.count, 0) as rating_count, ratings.total as rating_total
         from monthly_survey_submissions submission
         join monthly_survey_forms form using (organization_id, month, revision)
         left join lateral (
           select count(*)::int, sum((answer->>'value')::numeric) as total
           from jsonb_array_elements(submission.answers) answer
           join jsonb_array_elements(form.questions) with ordinality as question(definition, position)
             on answer->>'questionIndex' = (question.position - 1)::text
           where question.definition->>'kind' = 'rating'
             and jsonb_typeof(answer->'value') = 'number'
             and answer->>'value' in ('1', '2', '3', '4', '5')
         ) ratings on true
         where submission.organization_id = $1 and submission.month = $2 and form.published_at is not null
           and ($3::uuid[] is null or submission.learner_id = any($3))
       )
       select count(*)::int as submissions, coalesce(sum(rating_count), 0)::int as "ratingResponses",
              count(*) filter (where not has_rating_question)::int as "withoutRatingQuestion",
              count(*) filter (where has_rating_question and rating_count = 0)::int as "unansweredRating",
              round(sum(rating_total) / nullif(sum(rating_count), 0), 1)::double precision as average
       from classified`, [organizationId, month, learnerIds]
    );
    return summary ?? { submissions: 0, ratingResponses: 0, withoutRatingQuestion: 0, unansweredRating: 0, average: null };
  }

  async progress(staffId: string): Promise<ManagerProgressView | null> {
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;

    const programResult = await this.pool.query<{ id: string; start_date: string; week_count: number; current_week_override: number | null }>(
      `select id, start_date::text, week_count, current_week_override
       from programs where organization_id = $1
       order by (status = 'active') desc, created_at desc limit 1`,
      [organization.id]
    );
    const program = programResult.rows[0];
    const elapsedWeek = program ? Math.floor((Date.now() - new Date(`${program.start_date}T00:00:00Z`).getTime()) / 604_800_000) + 1 : 1;
    const currentWeek = program ? Math.max(1, Math.min(program.week_count, program.current_week_override ?? elapsedWeek)) : 1;
    const pilotWeeks = program?.week_count ?? 1;

    const [summaryResult, learnersResult, activityByDayResult, regularByWeekResult] = await Promise.all([
      this.pool.query<{
        learner_count: string;
        active_learners_this_week: string;
        completed_lessons: string;
        pending_assessments: string;
        survey_count: string;
        satisfaction_average: string | null;
      }>(
        `select
           (select count(*) from users where organization_id = $1 and role = 'learner' and status = 'active')::text as learner_count,
           (select count(*) from (
               select a.learner_id from activities a join users u on u.id = a.learner_id
               where u.organization_id = $1 and u.role = 'learner' and u.status = 'active' and a.occurred_at >= date_trunc('week', now())
              group by a.learner_id having count(distinct a.occurred_at::date) >= 3
            ) regular)::text as active_learners_this_week,
           (select count(*)
            from progress_records pr
             join users u on u.id = pr.learner_id and u.role = 'learner' and u.status = 'active'
             where u.organization_id = $1 and pr.status = 'completed')::text as completed_lessons,
           (select count(*)
            from assessment_attempts aa
             join users u on u.id = aa.learner_id and u.role = 'learner' and u.status = 'active'
             join assessment_versions av on av.id = aa.assessment_version_id
             join assessment_definitions ad on ad.id = av.definition_id
             where u.organization_id = $1 and aa.status = 'pending_review' and ad.kind in ('placement', 'level_up'))::text as pending_assessments,
           (select count(*) from surveys s join users u on u.id = s.learner_id and u.role = 'learner' and u.status = 'active'
            where u.organization_id = $1 and s.answers ? 'rating')::text as survey_count,
           (select round(avg((s.answers->>'rating')::numeric), 1)::text
            from surveys s join users u on u.id = s.learner_id and u.role = 'learner' and u.status = 'active'
            where u.organization_id = $1 and (s.answers->>'rating') ~ '^[1-5](\\.0)?$') as satisfaction_average`,
        [organization.id]
      ),
      this.pool.query<{
        learner_id: string;
        learner_name: string;
        cefr: CefrLevel | null;
        completed_lessons: string;
        total_lessons_this_week: string;
        sessions_this_week: string;
        coach_turns_this_week: string;
        weekly_practice_score: string | null;
        weekly_practice_status: string | null;
        reward_points: string;
        reward_points_in_level: number;
        earned_badges: string[] | null;
        earned_badge_details: Array<{ key: string; label: string; description: string }> | null;
        activity_dates_this_week: string[] | null;
        placement_score: string | null;
        placement_status: "in_progress" | "submitted" | null;
        placement_scoring: "ai" | "human" | "automatic" | "pending" | null;
        missed_days: string | null;
        last_activity_at: Date | null;
      }>(
        `select
           u.id as learner_id,
           u.display_name as learner_name,
           (select e.cefr
            from enrollments e
            join programs p on p.id = e.program_id
            where e.learner_id = u.id and p.organization_id = $1
            order by e.enrolled_at desc
            limit 1) as cefr,
           (case when exists (
              select 1 from month_frameworks mf
              join program_months pm on pm.id = mf.program_month_id and pm.organization_id = $1
              where pm.month = to_char(organization_system_date(u.organization_id), 'YYYY-MM') and mf.status = 'approved'
                and mf.cefr = (select e.cefr from enrollments e where e.learner_id = u.id order by e.enrolled_at desc limit 1)
            ) then (select count(*)
              from progress_records pr
              join month_lessons ml on ml.lesson_id = pr.lesson_id and ml.status = 'approved'
              join month_frameworks mf on mf.id = ml.framework_id and mf.status = 'approved'
              join program_months pm on pm.id = mf.program_month_id and pm.organization_id = $1
              where pr.learner_id = u.id and pr.status = 'completed' and not ${MONTH_LESSON_IS_REVIEW_SQL}
                and pm.month = to_char(organization_system_date(u.organization_id), 'YYYY-MM'))
            else (select count(*) from progress_records pr where pr.learner_id = u.id and pr.status = 'completed')
            end)::text as completed_lessons,
           coalesce(
             nullif((select count(*)
               from month_lessons ml
               join month_frameworks mf on mf.id = ml.framework_id and mf.status = 'approved'
               join program_months pm on pm.id = mf.program_month_id and pm.organization_id = $1
               where pm.month = to_char(organization_system_date(u.organization_id), 'YYYY-MM')
                 and mf.cefr = (select e.cefr from enrollments e where e.learner_id = u.id order by e.enrolled_at desc limit 1)
                 and ml.status = 'approved' and ml.lesson_id is not null and not ${MONTH_LESSON_IS_REVIEW_SQL}), 0),
             (select count(*)
              from lessons l
              join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
              join lesson_sets ls on ls.id = lsv.lesson_set_id
              join program_weeks pw on pw.id = ls.program_week_id
              where pw.program_id = $2 and pw.week_number = $3
                and ls.cefr = (select e.cefr from enrollments e where e.learner_id = u.id and e.program_id = $2 limit 1))
           )::text as total_lessons_this_week,
           (select count(distinct a.occurred_at::date) from activities a
            where a.learner_id = u.id
              and (($2::uuid is not null
                and a.occurred_at::date >= (select start_date + (($3 - 1) * 7) from programs where id = $2)
                and a.occurred_at::date < (select start_date + ($3 * 7) from programs where id = $2))
                or ($2::uuid is null and a.occurred_at >= date_trunc('week', now()))
              ))::text as sessions_this_week,
           (select count(*) from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
            where cs.learner_id = u.id and ct.speaker = 'learner' and ct.created_at >= date_trunc('week', now())
              and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true)))::text as coach_turns_this_week,
           (select ps.score->>'total' from practice_submissions ps join program_weeks pw on pw.id = ps.program_week_id
            where ps.learner_id = u.id and pw.program_id = $2 and pw.week_number = $3
            order by ps.updated_at desc limit 1) as weekly_practice_score,
           (select ps.status from practice_submissions ps join program_weeks pw on pw.id = ps.program_week_id
            where ps.learner_id = u.id and pw.program_id = $2 and pw.week_number = $3
            order by ps.updated_at desc limit 1) as weekly_practice_status,
           (select coalesce(sum(re.points), 0) from reward_events re where re.learner_id = u.id)::text as reward_points,
           learner_points_in_level(u.id) as reward_points_in_level,
           (select array_agg(earned.label order by earned.label)
            from (select distinct b.label
                  from reward_events re join badges b on b.id = re.badge_id
                  where re.learner_id = u.id and ${ACTIVE_BADGE_SQL("b")}) earned) as earned_badges,
           (select coalesce(jsonb_agg(earned.badge_json order by earned.badge_label), '[]'::jsonb)
            from (
              select distinct b.label as badge_label,
                     jsonb_build_object(
                       'key', b.badge_key,
                       'label', b.label,
                       'description', coalesce(b.rule->>'description', '')
                     ) as badge_json
              from reward_events re
              join badges b on b.id = re.badge_id
              where re.learner_id = u.id and ${ACTIVE_BADGE_SQL("b")}
            ) earned) as earned_badge_details,
           (select coalesce(array_agg(activity.day order by activity.day), '{}'::text[])
            from (select distinct a.occurred_at::date::text as day
                  from activities a
                  where a.learner_id = u.id
                    and $2::uuid is not null
                    and a.occurred_at::date >= (select start_date + (($3 - 1) * 7) from programs where id = $2)
                    and a.occurred_at::date < (select start_date + ($3 * 7) from programs where id = $2)) activity) as activity_dates_this_week,
           (select sum(sc.score)::text from assessment_scores sc where sc.attempt_id = (
              select aa.id from assessment_attempts aa join assessment_versions av on av.id = aa.assessment_version_id
              join assessment_definitions ad on ad.id = av.definition_id
              where aa.learner_id = u.id and ad.kind = 'placement' and aa.submitted_at is not null
              order by aa.submitted_at desc limit 1)) as placement_score,
           (select case
              when aa.submitted_at is not null or aa.status in ('submitted', 'pending_review', 'approved', 'needs_retry') then 'submitted'
              else 'in_progress'
            end
            from assessment_attempts aa
            join assessment_versions av on av.id = aa.assessment_version_id
            join assessment_definitions ad on ad.id = av.definition_id
            where aa.learner_id = u.id and ad.kind = 'placement'
            order by aa.started_at desc limit 1) as placement_status,
           (select case
              when bool_or(sc.source = 'human') then 'human'
              when bool_or(sc.source = 'ai') then 'ai'
              when count(*) >= 4 then 'automatic'
              when count(*) > 0 then 'pending'
              else null
            end
            from assessment_scores sc where sc.attempt_id = (
              select aa.id from assessment_attempts aa join assessment_versions av on av.id = aa.assessment_version_id
              join assessment_definitions ad on ad.id = av.definition_id
              where aa.learner_id = u.id and ad.kind = 'placement' and aa.submitted_at is not null
              order by aa.submitted_at desc limit 1)) as placement_scoring,
           (select greatest(0, floor(extract(epoch from (now() - max(a.occurred_at))) / 86400))::int::text
            from activities a where a.learner_id = u.id) as missed_days,
           (select max(a.occurred_at) from activities a where a.learner_id = u.id) as last_activity_at
         from users u
         where u.organization_id = $1 and u.role = 'learner' and u.status = 'active'
         order by last_activity_at desc nulls last, u.display_name asc`,
        [organization.id, program?.id ?? null, currentWeek]
      ),
      this.pool.query<{ date: string; active_learners: string; sessions: string; minutes: string }>(
        `select a.occurred_at::date::text as date,
                count(distinct a.learner_id)::text as active_learners,
                count(*)::text as sessions,
                coalesce(sum(a.minutes), 0)::text as minutes
         from activities a
         join users u on u.id = a.learner_id and u.role = 'learner' and u.status = 'active'
         where u.organization_id = $1 and u.role = 'learner'
           and ($2::uuid is null or a.occurred_at::date >= (select start_date from programs where id = $2))
         group by a.occurred_at::date
         order by a.occurred_at::date`,
        [organization.id, program?.id ?? null]
      ),
      this.pool.query<{ week: number; regular_learners: string; total_learners: string }>(
        `with weeks as (
           select generate_series(1, greatest(1, $3::int))::int as week
         ), active_learners as (
           select u.id
           from users u
           join enrollments e on e.learner_id = u.id and e.program_id = $2
           where u.organization_id = $1 and u.role = 'learner' and u.status = 'active'
             and e.cefr is not null and e.cefr_approved
         ), regular as (
           select w.week, a.learner_id
           from weeks w
           join activities a on $2::uuid is not null
             and a.occurred_at::date >= (select start_date + ((w.week - 1) * 7) from programs where id = $2)
             and a.occurred_at::date < (select start_date + (w.week * 7) from programs where id = $2)
           join active_learners al on al.id = a.learner_id
           group by w.week, a.learner_id
           having count(distinct a.occurred_at::date) >= 3
         )
         select w.week,
                (select count(*) from regular r where r.week = w.week)::text as regular_learners,
                (select count(*) from active_learners)::text as total_learners
         from weeks w order by w.week`,
        [organization.id, program?.id ?? null, pilotWeeks]
      )
    ]);
    const summary = summaryResult.rows[0] ?? {
      learner_count: "0", active_learners_this_week: "0", completed_lessons: "0", pending_assessments: "0", survey_count: "0", satisfaction_average: null
    };
    const learners = learnersResult.rows.map((row) => ({
      learnerId: row.learner_id,
      learnerName: row.learner_name,
      cefr: row.cefr,
      completedLessons: Number(row.completed_lessons),
      totalLessonsThisWeek: Number(row.total_lessons_this_week),
      sessionsThisWeek: Number(row.sessions_this_week),
      coachTurnsThisWeek: Number(row.coach_turns_this_week),
      weeklyPracticeScore: row.weekly_practice_score === null ? null : Number(row.weekly_practice_score),
      weeklyPracticeStatus: row.weekly_practice_score !== null ? "scored" as const : row.weekly_practice_status ? "pending_review" as const : "not_submitted" as const,
      rewardPoints: Number(row.reward_points),
      rewardPointsInLevel: Number(row.reward_points_in_level),
      rewardSeasonLevel: seasonForRewards(Number(row.reward_points_in_level), new Set((row.earned_badge_details ?? []).map((badge) => badge.key))).level,
      earnedBadges: row.earned_badges ?? [],
      earnedBadgeDetails: row.earned_badge_details ?? [],
      activityDatesThisWeek: row.activity_dates_this_week ?? [],
      placementScore: row.placement_score === null ? null : Number(row.placement_score),
      placementStatus: row.placement_status ?? "not_started" as const,
      placementScoring: row.placement_scoring,
      missedDays: row.missed_days === null ? null : Number(row.missed_days),
      lastActivityAt: row.last_activity_at?.toISOString() ?? null
    }));
    const completedLearners = learners.filter((row) => row.totalLessonsThisWeek > 0 && row.completedLessons >= row.totalLessonsThisWeek).length;
    const weekStartDate = program
      ? new Date(Date.UTC(Number(program.start_date.slice(0, 4)), Number(program.start_date.slice(5, 7)) - 1, Number(program.start_date.slice(8, 10)) + (currentWeek - 1) * 7)).toISOString().slice(0, 10)
      : undefined;
    return {
      organizationName: organization.name,
      currentWeek,
      pilotWeeks,
      ...(weekStartDate ? { weekStartDate } : {}),
      activityByDay: activityByDayResult.rows.map((row) => ({
        date: row.date,
        activeLearners: Number(row.active_learners),
        sessions: Number(row.sessions),
        minutes: Number(row.minutes)
      })),
      regularByWeek: regularByWeekResult.rows.map((row) => {
        const totalLearners = Number(row.total_learners);
        const regularLearners = Number(row.regular_learners);
        return {
          week: row.week,
          regularLearners,
          totalLearners,
          percent: totalLearners ? Math.round(regularLearners / totalLearners * 100) : 0
        };
      }),
      summary: {
        learnerCount: Number(summary.learner_count),
        activeLearnersThisWeek: Number(summary.active_learners_this_week),
        completedLessons: Number(summary.completed_lessons),
        pendingAssessments: Number(summary.pending_assessments),
        completedLearners,
        surveyCount: Number(summary.survey_count),
        satisfactionAverage: summary.satisfaction_average === null ? null : Number(summary.satisfaction_average)
      },
      learners
    };
  }

  async operations(staffId: string, options: { month?: string } = {}): Promise<ManagerOperationsView | null> {
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;

    const programResult = await this.pool.query<{ id: string; start_date: string; week_count: number; current_week_override: number | null }>(
      `select id, start_date::text, week_count, current_week_override from programs where organization_id = $1
       order by (status = 'active') desc, created_at desc limit 1`, [organization.id]
    );
    const program = programResult.rows[0];
    const elapsedWeek = program ? Math.floor((Date.now() - new Date(`${program.start_date}T00:00:00Z`).getTime()) / 604_800_000) + 1 : 1;
    const currentWeek = program ? Math.max(1, Math.min(program.week_count, program.current_week_override ?? elapsedWeek)) : 1;
    const pilotWeeks = program?.week_count ?? 1;

    const [contentResult, queuesResult, automationResult, activityResult, operatorResult, readinessResult, orphanResult] = await Promise.all([
      this.pool.query<{ draft: string; in_review: string; published: string }>(
        `select
           count(*) filter (where lsv.status = 'draft')::text as draft,
           count(*) filter (where lsv.status = 'review')::text as in_review,
           count(*) filter (where lsv.status = 'published')::text as published
         from lesson_set_versions lsv
         join lesson_sets ls on ls.id = lsv.lesson_set_id
         join program_weeks pw on pw.id = ls.program_week_id
         join programs p on p.id = pw.program_id
         where p.organization_id = $1`,
        [organization.id]
      ),
      this.pool.query<{ assessment_review: string; practice_review: string }>(
        `select
           (select count(*) from assessment_attempts aa join users u on u.id = aa.learner_id and u.role = 'learner' and u.status = 'active'
            join assessment_versions av on av.id = aa.assessment_version_id join assessment_definitions ad on ad.id = av.definition_id
            where u.organization_id = $1 and aa.status = 'pending_review' and ad.kind in ('placement', 'level_up'))::text as assessment_review,
           (select count(*) from practice_submissions ps join users u on u.id = ps.learner_id and u.role = 'learner' and u.status = 'active'
            where u.organization_id = $1 and ps.status = 'submitted')::text as practice_review`,
        [organization.id]
      ),
      this.pool.query<{ pending_jobs: string; ai_failures: string }>(
        `select
           (select count(*) from jobs
            where state in ('queued', 'running') and payload ->> 'organizationId' = ($1::uuid)::text)::text as pending_jobs,
           (select count(*) from ai_runs ar join users u on u.id = ar.user_id and u.status = 'active'
            where u.organization_id = $1 and ar.status in ('failed', 'invalid_output'))::text as ai_failures`,
        [organization.id]
      ),
      this.pool.query<{ id: string; action: string; created_at: Date }>(
        `select id, action, created_at
         from audit_events
         where organization_id = $1
         order by created_at desc
         limit 10`,
        [organization.id]
      ),
      this.pool.query<{ id: string; display_name: string }>(
        `select id, display_name from users where organization_id = $1 and role = 'operator' and status = 'active' order by display_name`,
        [organization.id]
      ),
      this.pool.query<{ week: number; cefr: CefrLevel; has_set: boolean; ready: boolean }>(
        `with levels as (
           select distinct e.cefr
           from enrollments e
           join users u on u.id = e.learner_id
           where e.program_id = $2 and u.organization_id = $1 and u.role = 'learner' and u.status = 'active'
             and e.cefr is not null and e.cefr_approved
         ), required as (
           select week, cefr
           from generate_series(1, greatest(1, $3::int)) week
           cross join levels
         )
         select r.week, r.cefr,
                exists (
                  select 1 from lesson_sets ls join program_weeks pw on pw.id = ls.program_week_id
                  where pw.program_id = $2 and pw.week_number = r.week and ls.cefr = r.cefr
                ) as has_set,
                exists (
                  select 1 from lesson_sets ls join program_weeks pw on pw.id = ls.program_week_id
                  join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
                  where pw.program_id = $2 and pw.week_number = r.week and ls.cefr = r.cefr
                ) as ready
         from required r order by r.week, r.cefr`,
        [organization.id, program?.id ?? null, currentWeek]
      ),
      this.pool.query<{ count: string }>(
        `select count(*)::text as count
         from lesson_sets ls
         join program_weeks pw on pw.id = ls.program_week_id
         join programs p on p.id = pw.program_id
         where p.organization_id = $1
           and not exists (
             select 1 from lesson_set_versions lsv
             where lsv.lesson_set_id = ls.id and (lsv.created_by is not null or lsv.approved_by is not null)
           )`,
        [organization.id]
      )
    ]);
    const content = contentResult.rows[0] ?? { draft: "0", in_review: "0", published: "0" };
    const queues = queuesResult.rows[0] ?? { assessment_review: "0", practice_review: "0" };
    const automation = automationResult.rows[0] ?? { pending_jobs: "0", ai_failures: "0" };
    // Monthly content model: everything below is scoped to one program month and
    // attributed through persisted actor columns (month_frameworks.created_by /
    // approved_by, lesson_set_versions.created_by, month_lessons.approved_by,
    // month_lesson_corrections.requested_by, ai_runs.user_id, audit actor).
    const monthResult = await this.pool.query<{ current_month: string; months: string[] | null }>(
      `select to_char(organization_system_date($1), 'YYYY-MM') as current_month,
              array(select month from program_months where organization_id = $1 order by month desc) as months`,
      [organization.id]
    );
    const currentMonth = monthResult.rows[0]?.current_month ?? new Date().toISOString().slice(0, 7);
    const selectedMonth = options.month ?? currentMonth;
    const availableMonths = [...new Set([currentMonth, ...(monthResult.rows[0]?.months ?? [])])].sort().reverse();
    const monthFrameworks = `month_fw as (
         select mf.id, mf.cefr, mf.status, mf.created_by, mf.approved_by, mf.published_at
         from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
         where pm.organization_id = $1 and pm.month = $2 and mf.status <> 'retired'
       )`;
    const summaryResult = await this.pool.query<{ frameworks: string; approved_frameworks: string; published_frameworks: string; lessons: string; approved_lessons: string; failed_lessons: string }>(
      `with ${monthFrameworks}
       select (select count(*) from month_fw)::text as frameworks,
              (select count(*) from month_fw where status = 'approved')::text as approved_frameworks,
              (select count(*) from month_fw where published_at is not null)::text as published_frameworks,
              (select count(*) from month_lessons ml join month_fw mf on mf.id = ml.framework_id)::text as lessons,
              (select count(*) from month_lessons ml join month_fw mf on mf.id = ml.framework_id where ml.status = 'approved')::text as approved_lessons,
              (select count(*) from month_lessons ml join month_fw mf on mf.id = ml.framework_id where ml.status = 'failed')::text as failed_lessons`,
      [organization.id, selectedMonth]
    );
    const summary = summaryResult.rows[0];
    const operators = await Promise.all(operatorResult.rows.map(async (operator) => {
      const params = [organization.id, selectedMonth, operator.id];
      const ownedLessons = `owned_lessons as (
           select distinct l.id from lessons l
           join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id
           join lesson_sets ls on ls.id = lsv.lesson_set_id
           join month_fw mf on mf.id = ls.month_framework_id
           where lsv.created_by = $3 or exists (select 1 from month_lessons ml where ml.lesson_id = l.id and ml.approved_by = $3)
         )`;
      const [poolResult, lessonResult, finalResult, outcomeResult, approvalResult, evidenceResult, reviewResult] = await Promise.all([
        this.pool.query<{ cefr: CefrLevel; status: string; created: boolean; approved: boolean; published: boolean }>(
          `with ${monthFrameworks}
           select cefr, status, coalesce(created_by = $3, false) as created,
                  coalesce(status = 'approved' and approved_by = $3, false) as approved,
                  coalesce(published_at is not null and approved_by = $3, false) as published
           from month_fw where created_by = $3 or approved_by = $3 order by cefr`, params
        ),
        this.pool.query<{ drafted: string; resaved: string; approved: string; published: string; corrections: string; average_hours: string | null }>(
          `with ${monthFrameworks},
           current_lessons as (
             select ml.status, ml.approved_by, ml.approved_at, mf.published_at, lsv.created_by as drafted_by, lsv.created_at as drafted_at
             from month_fw mf join month_lessons ml on ml.framework_id = mf.id
             left join lessons l on l.id = ml.lesson_id
             left join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id
           ), saves as (
             select ls.month_framework_id, lsv.payload->>'dayNumber' as day_number, count(*) as versions
             from lesson_set_versions lsv join lesson_sets ls on ls.id = lsv.lesson_set_id
             join month_fw mf on mf.id = ls.month_framework_id
             where lsv.created_by = $3 and lsv.payload->>'source' = 'monthly'
             group by 1, 2
           )
           select (select count(*) from current_lessons where drafted_by = $3)::text as drafted,
                  (select count(*) from saves where versions > 1)::text as resaved,
                  (select count(*) from current_lessons where approved_by = $3 and status = 'approved')::text as approved,
                  (select count(*) from current_lessons where approved_by = $3 and status = 'approved' and published_at is not null)::text as published,
                  (select count(*) from month_lesson_corrections mlc join month_lessons ml on ml.id = mlc.month_lesson_id
                     join month_fw mf on mf.id = ml.framework_id where mlc.requested_by = $3)::text as corrections,
                  (select round((avg(extract(epoch from (approved_at - drafted_at))) / 3600)::numeric, 1)::text from current_lessons
                    where approved_by = $3 and status = 'approved' and drafted_at is not null and approved_at >= drafted_at) as average_hours`, params
        ),
        this.pool.query<{ generated: string; failed: string; published: string }>(
          `with ${monthFrameworks}
           select (select count(*) from ai_runs ar join ai_tasks t on t.id = ar.task_id and t.task_key = 'monthly_final_generation'
                     join month_fw mf on mf.id::text = split_part(ar.request_key, ':', 2)
                    where ar.user_id = $3 and ar.request_key like 'monthly-final:%' and ar.status = 'succeeded')::text as generated,
                  (select count(*) from ai_runs ar join ai_tasks t on t.id = ar.task_id and t.task_key = 'monthly_final_generation'
                     join month_fw mf on mf.id::text = split_part(ar.request_key, ':', 2)
                    where ar.user_id = $3 and ar.request_key like 'monthly-final:%' and ar.status in ('failed', 'invalid_output'))::text as failed,
                  (select count(distinct ae.entity_id) from audit_events ae
                    where ae.organization_id = $1 and ae.actor_user_id = $3 and ae.action = 'monthly_final.published'
                      and ae.payload->>'month' = $2)::text as published`, params
        ),
        this.pool.query<{ completions: string; average_score: string | null }>(
          `with ${monthFrameworks}, ${ownedLessons}
           select count(*)::text as completions, round(avg(pr.score) filter (where pr.score is not null), 1)::text as average_score
           from progress_records pr join owned_lessons ol on ol.id = pr.lesson_id
           join users learner on learner.id = pr.learner_id and learner.organization_id = $1 and learner.role = 'learner' and learner.status = 'active'
           where pr.status = 'completed'`, params
        ),
        this.pool.query<{ approvals: string; average_approval_hours: string | null }>(
          `select count(*)::text as approvals,
             round(avg(extract(epoch from (ad.decided_at - aa.submitted_at)) / 3600), 1)::text as average_approval_hours
           from assessment_decisions ad join assessment_attempts aa on aa.id = ad.attempt_id
           join users u on u.id = aa.learner_id and u.role = 'learner' and u.status = 'active'
           where u.organization_id = $1 and ad.decided_by = $3 and ad.decided_at is not null and aa.submitted_at is not null
             and to_char(ad.decided_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') = $2`, params
        ),
        this.pool.query<{ parts: string; first_try: string; failed: string; attempts: string }>(
          `with ${monthFrameworks}, ${ownedLessons}, part_results as (
             select value as result from progress_records pr
             join owned_lessons ol on ol.id = pr.lesson_id
             join users learner on learner.id = pr.learner_id and learner.organization_id = $1 and learner.role = 'learner' and learner.status = 'active'
             cross join lateral jsonb_each(case when jsonb_typeof(pr.evidence->'evidence') = 'object' then pr.evidence->'evidence' else pr.evidence end)
             where jsonb_typeof(value) = 'object' and value ? 'attempts'
           ) select count(*)::text as parts,
             count(*) filter (where (result->>'attempts')::int = 1 and coalesce((result->>'score')::numeric, 100) >= 80)::text as first_try,
             count(*) filter (where (result->>'attempts')::int >= 3 and coalesce((result->>'score')::numeric, 0) < 80)::text as failed,
             coalesce(sum((result->>'attempts')::int),0)::text as attempts from part_results`, params
        ),
        this.pool.query<{ submissions: string; coach: string }>(
          `select
             (select count(*) from practice_submissions ps join users learner on learner.id = ps.learner_id and learner.role = 'learner' and learner.status = 'active' where learner.organization_id = $1 and ps.checked_by = $2)::text as submissions,
             (select count(*) from coach_turns ct join coach_sessions cs on cs.id = ct.session_id join users learner on learner.id = cs.learner_id and learner.role = 'learner' and learner.status = 'active' where learner.organization_id = $1 and ct.feedback->>'checkedBy' = $2::text)::text as coach`, [organization.id, operator.id]
        )
      ]);
      const lessons = lessonResult.rows[0] ?? { drafted: "0", resaved: "0", approved: "0", published: "0", corrections: "0", average_hours: null };
      const finals = finalResult.rows[0] ?? { generated: "0", failed: "0", published: "0" };
      const outcome = outcomeResult.rows[0] ?? { completions: "0", average_score: null };
      const approval = approvalResult.rows[0] ?? { approvals: "0", average_approval_hours: null };
      const evidence = evidenceResult.rows[0] ?? { parts: "0", first_try: "0", failed: "0", attempts: "0" };
      const reviews = reviewResult.rows[0] ?? { submissions: "0", coach: "0" };
      const partCount = Number(evidence.parts);
      return {
        operatorId: operator.id, operatorName: operator.display_name,
        resourcePools: poolResult.rows.map((row) => ({ cefr: row.cefr, status: row.status, createdByOperator: row.created, approvedByOperator: row.approved, published: row.published })),
        poolsCreated: poolResult.rows.filter((row) => row.created).length,
        poolsApproved: poolResult.rows.filter((row) => row.approved).length,
        lessonsDrafted: Number(lessons.drafted), lessonsResaved: Number(lessons.resaved),
        lessonsApproved: Number(lessons.approved), lessonsPublished: Number(lessons.published),
        correctionsRequested: Number(lessons.corrections),
        averageDraftToApprovalHours: lessons.average_hours === null ? null : Number(lessons.average_hours),
        finalsGenerated: Number(finals.generated), finalGenerationFailures: Number(finals.failed), finalsPublished: Number(finals.published),
        completions: Number(outcome.completions),
        averageScore: outcome.average_score === null ? null : Number(outcome.average_score),
        firstTryPercent: partCount ? Math.round(Number(evidence.first_try) / partCount * 100) : null,
        failedPercent: partCount ? Math.round(Number(evidence.failed) / partCount * 100) : null,
        averageAttempts: partCount ? Math.round(Number(evidence.attempts) / partCount * 10) / 10 : null,
        approvals: Number(approval.approvals), averageApprovalHours: approval.average_approval_hours === null ? null : Number(approval.average_approval_hours),
        reviewedSubmissions: Number(reviews.submissions), reviewedCoachTurns: Number(reviews.coach)
      };
    }));
    return {
      organizationName: organization.name,
      month: selectedMonth,
      currentMonth,
      availableMonths,
      monthSummary: {
        frameworks: Number(summary?.frameworks ?? 0), approvedFrameworks: Number(summary?.approved_frameworks ?? 0),
        publishedFrameworks: Number(summary?.published_frameworks ?? 0), lessons: Number(summary?.lessons ?? 0),
        approvedLessons: Number(summary?.approved_lessons ?? 0), failedLessons: Number(summary?.failed_lessons ?? 0)
      },
      currentWeek,
      pilotWeeks,
      content: { draft: Number(content.draft), inReview: Number(content.in_review), published: Number(content.published) },
      queues: { assessmentReview: Number(queues.assessment_review), practiceReview: Number(queues.practice_review) },
      automation: { pendingJobs: Number(automation.pending_jobs), aiFailures: Number(automation.ai_failures) },
      readiness: {
        requiredSets: readinessResult.rows.length,
        readySets: readinessResult.rows.filter((row) => row.ready).length,
        missing: readinessResult.rows.filter((row) => !row.ready).map((row) => ({
          week: row.week,
          cefr: row.cefr,
          state: row.has_set ? "draft" as const : "missing" as const
        })),
        orphanLegacySets: Number(orphanResult.rows[0]?.count ?? 0)
      },
      recentActivity: activityResult.rows.map((row) => ({ id: row.id, action: row.action, createdAt: row.created_at.toISOString() })),
      operators
    };
  }

  async accounts(staffId: string): Promise<ManagerAccountsView | null> {
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;
    const accounts = await this.pool.query<{
      id: string;
      display_name: string;
      email: string | null;
      role: AccountRole;
      status: string;
      created_at: Date;
      cefr: CefrLevel | null;
      placement_score: string | null;
    }>(
      `select id, display_name, email, role, status, created_at
              ,learner_data.cefr
              ,learner_data.placement_score
       from users
       left join lateral (
         select latest_enrollment.cefr,
                latest_placement.placement_score
         from lateral (
           select e.cefr
           from enrollments e
           where e.learner_id = users.id
           order by e.enrolled_at desc
           limit 1
         ) latest_enrollment
         cross join lateral (
           select sum(sc.score)::text as placement_score
           from assessment_scores sc
           where sc.attempt_id = (
             select aa.id
             from assessment_attempts aa
             join assessment_versions av on av.id = aa.assessment_version_id
             join assessment_definitions ad on ad.id = av.definition_id
             where aa.learner_id = users.id
               and ad.kind = 'placement'
               and aa.submitted_at is not null
             order by aa.submitted_at desc
             limit 1
           )
         ) latest_placement
       ) learner_data on true
       where organization_id = $1 and status in ('active', 'disabled')
       order by case role when 'manager' then 0 when 'operator' then 1 else 2 end, display_name asc`,
      [organization.id]
    );
    return {
      organizationName: organization.name,
      accounts: accounts.rows.map((account) => this.accountView(account))
    };
  }

  async operatorSettingsOverview(staffId: string): Promise<OperatorSettingsOverviewView | null> {
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;
    const settings = await this.settingsForOrganization(organization.id);
    const directory = await this.accounts(staffId);
    if (!directory) return null;
    return {
      organizationName: organization.name,
      pilot: {
        startDate: settings.pilotStartDate,
        weeks: settings.pilotWeeks,
        weekOverride: settings.weekOverride,
        minMinutesPerDay: settings.minMinutesPerDay,
        courseTheme: settings.courseTheme,
        coachDailyLimit: settings.coachDailyLimit
      },
      settings: { organizationName: organization.name, ...settings },
      test: { timed: settings.testTimed, times: settings.testTimes, warnLimit: settings.testWarnLimit },
      accounts: directory.accounts
    };
  }

  async saveLearnerBaseNotification(managerId: string, learnerId: string, input: ManagerBaseNotificationInput): Promise<ManagerBaseNotificationView | null> {
    const organization = await this.organizationFor(managerId);
    if (!organization) return null;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const target = await client.query(
        "select id from users where id = $1 and organization_id = $2 and role = 'learner' and status <> 'deleted' for update",
        [learnerId, organization.id]
      );
      if (!target.rowCount) { await client.query("rollback"); return null; }
      const existing = await client.query<{ secret_ciphertext: string; secret_nonce: string; secret_auth_tag: string }>("select secret_ciphertext, secret_nonce, secret_auth_tag from learner_base_notification_channels where learner_id = $1", [learnerId]);
      const secret = input.webhookUrl.trim() ? encryptProviderSecret(input.webhookUrl.trim()) : existing.rows[0] ? { ciphertext: existing.rows[0].secret_ciphertext, nonce: existing.rows[0].secret_nonce, authTag: existing.rows[0].secret_auth_tag } : null;
      if (input.remove) {
        await client.query("delete from learner_base_notification_channels where learner_id = $1", [learnerId]);
      } else {
        if (!secret) throw new Error("MANAGER_REMINDER_BASE_WEBHOOK_MISSING");
        await client.query(
          `insert into learner_base_notification_channels (learner_id, secret_ciphertext, secret_nonce, secret_auth_tag, webhook_template, destination_label, updated_by)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (learner_id) do update set secret_ciphertext = excluded.secret_ciphertext, secret_nonce = excluded.secret_nonce, secret_auth_tag = excluded.secret_auth_tag,
             webhook_template = excluded.webhook_template, destination_label = excluded.destination_label,
             updated_by = excluded.updated_by, updated_at = now()`,
          [learnerId, secret!.ciphertext, secret!.nonce, secret!.authTag, input.webhookTemplate, input.destinationLabel.trim(), managerId]
        );
      }
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'learner.base_notification.updated', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organization.id, managerId, learnerId, JSON.stringify({ configured: !input.remove }), randomUUID()]
      );
      await client.query("commit");
      return { configured: !input.remove, destinationLabel: input.remove ? "" : input.destinationLabel.trim(), webhookTemplate: input.remove ? '{"base_content":"{message}"}' : input.webhookTemplate };
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }

  async reminders(staffId: string): Promise<ManagerRemindersView | null> {
    await this.lockInactiveLearners();
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;
    const settings = await this.settingsForOrganization(organization.id);
    const candidates = await this.eligibleReminderLearners(this.pool, organization.id);
    const baseChannels = await this.pool.query<{ learner_id: string; destination_label: string; webhook_template: string }>(
      `select channel.learner_id, channel.destination_label, channel.webhook_template
       from learner_base_notification_channels channel join users u on u.id = channel.learner_id
       where u.organization_id = $1`, [organization.id]
    );
    const channelByLearner = new Map(baseChannels.rows.map((row) => [row.learner_id, row]));
    const history = await this.pool.query<{
      reminder_id: string;
      learner_id: string;
      learner_name: string;
      recipient: string | null;
      missed_days: string | null;
      status: string;
      delivery_status: string | null;
      provider: ManagerReminderProvider | null;
      created_at: Date;
      attempted_at: Date | null;
    }>(
      `select r.id as reminder_id, r.learner_id, u.display_name as learner_name, case when delivery.provider = 'base_webhook' then destination.destination_label when delivery.provider = 'resend' then nullif(trim(u.email), '') else null end as recipient,
              case when (ae.payload->>'missedDays') ~ '^\\d+$' then ae.payload->>'missedDays' else null end as missed_days,
              case when ae.action = 'reminder.copied' then 'copied' else r.status end as status,
              case when ae.action = 'reminder.copied' then null else delivery.status end as delivery_status,
              case when ae.action = 'reminder.copied' then null else delivery.provider end as provider,
              r.created_at, case when ae.action = 'reminder.copied' then null else delivery.attempted_at end as attempted_at
       from reminders r
       join users u on u.id = r.learner_id
       left join lateral (
         select nd.status, nd.provider, nd.attempted_at
         from notification_deliveries nd
           where nd.reminder_id = r.id
         order by nd.attempted_at desc limit 1
       ) delivery on true
       left join reminder_base_destinations destination on destination.reminder_id = r.id
       left join lateral (
         select a.action, a.payload
         from audit_events a
         where a.organization_id = $1 and a.action in ('reminder.queued', 'reminder.dismissed', 'reminder.copied')
           and a.payload->>'reminderId' = r.id::text
         order by a.created_at desc limit 1
       ) ae on true
       where u.organization_id = $1 and r.staff_deleted_at is null
       order by r.created_at desc
       limit 30`,
      [organization.id]
    );
    return {
      organizationName: organization.name,
      inactiveDays: settings.reminderInactiveDays,
      webhookConfigured: false,
      candidates: candidates.map((candidate) => ({
        learnerId: candidate.learner_id,
        learnerName: candidate.learner_name,
        learnerEmail: candidate.learner_email,
        cefr: candidate.cefr,
        lastActivityAt: candidate.last_activity_at?.toISOString() ?? null,
        missedDays: candidate.missed_days,
        baseNotification: {
          configured: channelByLearner.has(candidate.learner_id),
          destinationLabel: channelByLearner.get(candidate.learner_id)?.destination_label ?? "",
          webhookTemplate: channelByLearner.get(candidate.learner_id)?.webhook_template ?? '{"base_content":"{message}"}'
        }
      })),
      history: history.rows.map((row) => ({
        reminderId: row.reminder_id,
        learnerId: row.learner_id,
        learnerName: row.learner_name,
        recipient: row.recipient,
        missedDays: row.missed_days === null ? null : Number(row.missed_days),
        status: row.status,
        deliveryStatus: row.delivery_status,
        provider: row.provider,
        createdAt: row.created_at.toISOString(),
        attemptedAt: row.attempted_at?.toISOString() ?? null
      }))
    };
  }

  /**
   * Hides one reminder from the Manager history. The reminder row, its
   * deliveries and audit trail stay intact, so learner eligibility, delivery
   * jobs and reports are unaffected; only the history log no longer lists it.
   */
  async deleteReminderHistory(managerId: string, reminderId: string): Promise<boolean> {
    const result = await this.pool.query(
      `with removed as (
         update reminders r set staff_deleted_at = now(), staff_deleted_by = manager.id
           from users learner, users manager
          where r.id = $1 and learner.id = r.learner_id and manager.id = $2 and manager.role = 'manager'
            and learner.organization_id = manager.organization_id and r.staff_deleted_at is null
         returning r.id, r.learner_id, manager.organization_id
       )
       insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
       select gen_random_uuid(), organization_id, $2, 'manager.reminder_history_deleted', 'reminder', id,
              jsonb_build_object('reminderId', id, 'learnerId', learner_id), gen_random_uuid()::text
       from removed returning id`,
      [reminderId, managerId]
    );
    return Boolean(result.rowCount);
  }

  async queueReminder(managerId: string, learnerId: string, requestId: string, channel: ManagerReminderChannel): Promise<ManagerReminderSendView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const organizationResult = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 for update", [managerId]
      );
      const organizationId = organizationResult.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
      const scope = `manager-reminder:${organizationId}:${channel}`;
      const reservation = await client.query(
        `insert into idempotency_keys (scope, key, response)
         values ($1, $2, '{}'::jsonb)
         on conflict (scope, key) do nothing
         returning id`,
        [scope, requestId]
      );
      if (!reservation.rowCount) {
        const previous = await client.query<{ response: ManagerReminderSendView }>(
          "select response from idempotency_keys where scope = $1 and key = $2", [scope, requestId]
        );
        const response = previous.rows[0]?.response;
        if (!response?.reminderId) {
          await client.query("rollback");
          throw new Error("MANAGER_REMINDER_RETRY_UNAVAILABLE");
        }
        if (response.learnerId !== learnerId) {
          await client.query("rollback");
          throw new Error("MANAGER_REMINDER_REQUEST_REUSED");
        }
        await client.query("commit");
        return response;
      }
      const learner = await this.requireEligibleReminderLearner(client, organizationId, learnerId);
      const baseResult = channel === "base" ? await client.query<{ secret_ciphertext: string; secret_nonce: string; secret_auth_tag: string; webhook_template: string; destination_label: string }>(
        "select secret_ciphertext, secret_nonce, secret_auth_tag, webhook_template, destination_label from learner_base_notification_channels where learner_id = $1 for share", [learnerId]
      ) : null;
      const baseDestination = baseResult?.rows[0];
      if (channel === "email" && !learner.learner_email) throw new Error("MANAGER_REMINDER_EMAIL_MISSING");
      if (channel === "base" && !baseDestination) throw new Error("MANAGER_REMINDER_BASE_WEBHOOK_MISSING");
      const provider = channel === "email" ? "resend" as const : "base_webhook" as const;
      const sameDay = await client.query<{
        reminder_id: string;
        reminder_status: "queued" | "sent";
        delivery_status: "queued" | "sent";
      }>(
        `select r.id as reminder_id, r.status as reminder_status, nd.status as delivery_status
         from reminders r
         join notification_deliveries nd on nd.reminder_id = r.id and nd.provider = $2
         where r.learner_id = $1 and r.created_at >= current_date
           and r.status in ('queued', 'sent') and nd.status in ('queued', 'sent')
         order by r.created_at desc limit 1
         for update of r, nd`,
        [learnerId, provider]
      );
      const existing = sameDay.rows[0];
      if (existing) {
        const response: ManagerReminderSendView = {
          reminderId: existing.reminder_id,
          learnerId,
          status: existing.reminder_status,
          deliveryStatus: existing.delivery_status,
          provider
        };
        await client.query(
          "update idempotency_keys set response = $3::jsonb where scope = $1 and key = $2",
          [scope, requestId, JSON.stringify(response)]
        );
        await client.query("commit");
        return response;
      }
      const reminderId = randomUUID();
      const response: ManagerReminderSendView = { reminderId, learnerId, status: "queued", deliveryStatus: "queued", provider };
      await client.query(
        `insert into reminders (id, learner_id, reason, message, status, created_by)
         values ($1, $2, 'inactive_learning', 'Bạn chưa có hoạt động học gần đây. Hãy quay lại E4S để tiếp tục mục tiêu tuần.', 'queued', $3)`,
        [reminderId, learnerId, managerId]
      );
      await client.query(
        `insert into notification_deliveries (id, reminder_id, provider, status, response)
         values ($1, $2, $3, 'queued', '{}'::jsonb)`,
        [randomUUID(), reminderId, provider]
      );
      if (provider === "base_webhook") {
        await client.query(
          "insert into reminder_base_destinations (reminder_id, secret_ciphertext, secret_nonce, secret_auth_tag, webhook_template, destination_label) values ($1, $2, $3, $4, $5, $6)",
          [reminderId, baseDestination!.secret_ciphertext, baseDestination!.secret_nonce, baseDestination!.secret_auth_tag, baseDestination!.webhook_template, baseDestination!.destination_label]
        );
        await client.query(
          `insert into jobs (id, kind, payload, max_attempts, idempotency_key)
           values ($1, 'notification.base-webhook', $2::jsonb, 3, $3)
           on conflict (idempotency_key) do nothing`,
          [randomUUID(), JSON.stringify({ reminderId }), `notification:${reminderId}`]
        );
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'reminder.queued', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, managerId, learnerId, JSON.stringify({ reminderId, missedDays: learner.missed_days, channel, provider }), randomUUID()]
      );
      await client.query(
        "update idempotency_keys set response = $3::jsonb where scope = $1 and key = $2",
        [scope, requestId, JSON.stringify(response)]
      );
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async dismissReminder(managerId: string, learnerId: string): Promise<ManagerReminderDismissView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const organizationResult = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'manager' and status = 'active' for update",
        [managerId]
      );
      const organizationId = organizationResult.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");

      const learner = await this.requireEligibleReminderLearner(client, organizationId, learnerId);

      const existing = await client.query<{ id: string }>(
        `select id from reminders
         where learner_id = $1 and created_by = $2 and reason = 'manual' and status = 'dismissed'
           and created_at >= current_date
         order by created_at desc limit 1
         for update`,
        [learnerId, managerId]
      );
      const existingReminderId = existing.rows[0]?.id;
      if (existingReminderId) {
        await client.query("commit");
        return { reminderId: existingReminderId, learnerId, status: "dismissed" };
      }

      const reminderId = randomUUID();
      await client.query(
        `insert into reminders (id, learner_id, reason, message, status, created_by)
         values ($1, $2, 'manual', 'Đã ghi nhận quản lý nhắc học thủ công.', 'dismissed', $3)`,
        [reminderId, learnerId, managerId]
      );
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'reminder.dismissed', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, managerId, learnerId, JSON.stringify({ reminderId, missedDays: learner.missed_days }), randomUUID()]
      );
      await client.query("commit");
      return { reminderId, learnerId, status: "dismissed" };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async copyReminder(managerId: string, learnerId: string): Promise<ManagerReminderCopyView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const organizationResult = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'manager' and status = 'active' for update",
        [managerId]
      );
      const organizationId = organizationResult.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");

      const learner = await this.requireEligibleReminderLearner(client, organizationId, learnerId);

      const alreadyCopied = await client.query<{ id: string }>(
        `select r.id
         from reminders r
         join audit_events a on a.organization_id = $3
           and a.action = 'reminder.copied'
           and a.payload->>'reminderId' = r.id::text
         where r.learner_id = $1 and r.created_by = $2 and r.reason = 'inactive_learning'
           and r.created_at >= current_date
         order by r.created_at desc limit 1
         for update of r`,
        [learnerId, managerId, organizationId]
      );
      const copiedReminderId = alreadyCopied.rows[0]?.id;
      if (copiedReminderId) {
        await client.query("commit");
        return { reminderId: copiedReminderId, learnerId, status: "copied" };
      }

      const pending = await client.query<{ id: string }>(
        `select id from reminders
         where learner_id = $1 and created_by = $2 and reason = 'inactive_learning'
           and status in ('draft', 'queued') and created_at >= current_date
         order by created_at desc limit 1
         for update`,
        [learnerId, managerId]
      );
      const reminderId = pending.rows[0]?.id ?? randomUUID();
      if (pending.rowCount) {
        await client.query("update reminders set status = 'cancelled' where id = $1", [reminderId]);
      } else {
        await client.query(
          `insert into reminders (id, learner_id, reason, message, status, created_by)
           values ($1, $2, 'inactive_learning', 'Bạn chưa có hoạt động học gần đây. Hãy quay lại E4S để tiếp tục mục tiêu tuần.', 'cancelled', $3)`,
          [reminderId, learnerId, managerId]
        );
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'reminder.copied', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, managerId, learnerId, JSON.stringify({ reminderId, missedDays: learner.missed_days }), randomUUID()]
      );
      await client.query("commit");
      return { reminderId, learnerId, status: "copied" };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async learnerProfile(managerId: string, learnerId: string): Promise<ManagerLearnerProfileView | null> {
    const learnerResult = await this.pool.query<{
      id: string;
      display_name: string;
      email: string | null;
      status: string;
      created_at: Date;
      current_level: CefrLevel | null;
      profile: unknown;
    }>(
      `select learner.id, learner.display_name, learner.email, learner.status, learner.created_at,
              enrollment.cefr as current_level, coalesce(lp.profile, '{}'::jsonb) as profile
       from users manager
       join users learner on learner.organization_id = manager.organization_id
         and learner.id = $2 and learner.role = 'learner' and learner.status in ('active', 'disabled')
       left join lateral (
         select e.cefr
         from enrollments e join programs p on p.id = e.program_id and p.status = 'active'
         where e.learner_id = learner.id
         order by e.enrolled_at desc limit 1
       ) enrollment on true
       left join learner_profiles lp on lp.user_id = learner.id
       where manager.id = $1 and manager.role = 'manager' and manager.status = 'active'`,
      [managerId, learnerId]
    );
    const learner = learnerResult.rows[0];
    if (!learner) return null;
    const scores = await this.pool.query<{ kind: "placement" | "pass_course"; total: number | null }>(
      `select latest.kind, case when count(scores.section) = 4 then sum(scores.score)::double precision end as total
       from (
         select distinct on (definition.kind) definition.kind, attempt.id
         from assessment_attempts attempt
         join assessment_versions version on version.id = attempt.assessment_version_id
         join assessment_definitions definition on definition.id = version.definition_id
         where attempt.learner_id = $1
           and ((definition.kind = 'placement' and attempt.submitted_at is not null)
             or (definition.kind = 'pass_course' and attempt.status in ('approved', 'needs_retry')))
         order by definition.kind, attempt.submitted_at desc nulls last, attempt.started_at desc, attempt.id
       ) latest
       left join assessment_scores scores on scores.attempt_id = latest.id
         and scores.section in ('listening', 'reading', 'writing', 'speaking')
       group by latest.kind`,
      [learnerId]
    );
    const metrics = await this.pool.query<{
      completed_lessons: string;
      total_lessons: string;
      coach_turns: string;
      study_days: string;
      reward_points: string;
      last_activity_at: Date | null;
    }>(
      `select
         (select count(*) from progress_records where learner_id = $1 and status = 'completed')::text as completed_lessons,
         (select count(distinct l.id)
            from enrollments e
            join programs p on p.id = e.program_id and p.status = 'active'
            join lesson_sets ls on ls.program_week_id in (select id from program_weeks where program_id = p.id)
              and ls.cefr = e.cefr
            join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
            join lessons l on l.lesson_set_version_id = lsv.id
           where e.learner_id = $1)::text as total_lessons,
         (select count(*) from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
           where cs.learner_id = $1 and ct.speaker = 'learner')::text as coach_turns,
         (select count(distinct occurred_at::date) from activities where learner_id = $1)::text as study_days,
         (select coalesce(sum(points), 0) from reward_events where learner_id = $1)::text as reward_points,
         (select max(occurred_at) from activities where learner_id = $1) as last_activity_at`,
      [learnerId]
    );
    const row = metrics.rows[0];
    return {
      learner: {
        id: learner.id,
        displayName: learner.display_name,
        email: learner.email,
        status: learner.status,
        createdAt: learner.created_at.toISOString(),
        currentLevel: learner.current_level
      },
      profile: publicLearnerProfile(learner.profile),
      assessmentScores: {
        placement: scores.rows.find((score) => score.kind === "placement")?.total ?? null,
        passCourse: scores.rows.find((score) => score.kind === "pass_course")?.total ?? null
      },
      metrics: {
        completedLessons: Number(row?.completed_lessons ?? 0),
        totalLessons: Number(row?.total_lessons ?? 0),
        coachTurns: Number(row?.coach_turns ?? 0),
        studyDays: Number(row?.study_days ?? 0),
        rewardPoints: Number(row?.reward_points ?? 0),
        lastActivityAt: row?.last_activity_at?.toISOString() ?? null
      }
    };
  }

  async changeLearnerDisplayName(managerId: string, learnerId: string, displayName: string): Promise<string | null> {
    const result = await this.pool.query<{ display_name: string }>(
      `with target as (
         select learner.id, learner.organization_id, learner.display_name
         from users manager join users learner on learner.organization_id = manager.organization_id
         where manager.id = $1 and manager.role = 'manager' and manager.status = 'active'
           and learner.id = $2 and learner.role = 'learner' and learner.status in ('active', 'disabled')
         for update of learner
       ), updated as (
         update users learner set display_name = $3
         from target where learner.id = target.id and target.display_name <> $3
         returning learner.id, learner.organization_id, learner.display_name, target.display_name as previous_name
       ), audit as (
         insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         select $4::uuid, organization_id, $1, 'account.display_name.change', 'user', id,
                jsonb_build_object('previousDisplayName', previous_name, 'displayName', display_name), $4::uuid::text
         from updated
       )
       select coalesce((select display_name from updated), target.display_name) as display_name from target`,
      [managerId, learnerId, displayName, randomUUID()]
    );
    return result.rows[0]?.display_name ?? null;
  }

  async deleteRequests(managerId: string): Promise<ManagerDeleteRequestsView | null> {
    const organization = await this.organizationFor(managerId);
    return organization ? { requests: await listDeletionRequests(this.pool, organization.id) } : null;
  }

  async decideDeleteRequest(managerId: string, requestId: string, input: { status: "approved" | "rejected"; note: string }): Promise<AssessmentDeletionRequestView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const manager = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'manager' and status = 'active' for update",
        [managerId]
      );
      const organizationId = manager.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
      const result = await client.query<{
        id: string;
        learner_id: string;
        learner_name: string;
        learner_status: string;
        reason: string;
        payload: Record<string, unknown>;
        requested_by: string;
        requested_at: Date;
      }>(
        `select ae.id, ae.entity_id as learner_id, learner.display_name as learner_name,
                learner.status as learner_status, coalesce(ae.payload->>'reason', '') as reason,
                ae.payload, coalesce(ae.payload->>'requestedBy', ae.actor_user_id::text) as requested_by,
                ae.created_at as requested_at
         from audit_events ae
         join users learner on learner.id = ae.entity_id and learner.organization_id = $1
         where ae.id = $2 and ae.organization_id = $1 and ae.action = 'learner.deletion_requested'
         for update`,
        [organizationId, requestId]
      );
      const request = result.rows[0];
      if (!request) throw new Error("MANAGER_DELETE_REQUEST_NOT_FOUND");
      const currentStatus = typeof request.payload?.status === "string" ? request.payload.status : "pending";
      if (currentStatus !== "pending") throw new Error("MANAGER_DELETE_REQUEST_ALREADY_DECIDED");
      const decidedAt = new Date();
      const payload = {
        ...(request.payload ?? {}),
        status: input.status,
        decidedBy: managerId,
        decidedAt: decidedAt.toISOString(),
        note: input.note
      };
      await client.query("update audit_events set payload = $2::jsonb where id = $1", [requestId, JSON.stringify(payload)]);
      if (input.status === "approved") {
        await client.query(
          "update users set status = 'deleted', updated_at = now() where id = $1 and organization_id = $2",
          [request.learner_id, organizationId]
        );
        await client.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [request.learner_id]);
        await client.query(
          `insert into audit_events
             (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
           values ($1, $2, $3, 'manager.learner.deleted', 'user', $4, $5::jsonb, $6)`,
          [randomUUID(), organizationId, managerId, request.learner_id, JSON.stringify({ requestId }), randomUUID()]
        );
      }
      await client.query("commit");
      return {
        id: request.id,
        learnerId: request.learner_id,
        learnerName: request.learner_name,
        reason: request.reason,
        status: input.status,
        requestedBy: request.requested_by,
        requestedAt: request.requested_at.toISOString(),
        decidedBy: managerId,
        decidedAt: decidedAt.toISOString(),
        note: input.note
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async trash(managerId: string): Promise<ManagerTrashView | null> {
    const organization = await this.organizationFor(managerId);
    if (!organization) return null;
    const result = await this.pool.query<{
      id: string; display_name: string; email: string | null; role: AccountRole; updated_at: Date;
    }>(
      `select id, display_name, email, role, updated_at
       from users where organization_id = $1 and status = 'deleted'
       order by updated_at desc, display_name asc`,
      [organization.id]
    );
    return {
      accounts: result.rows.map((account) => ({
        id: account.id,
        displayName: account.display_name,
        email: account.email,
        role: account.role,
        status: "deleted",
        deletedAt: account.updated_at.toISOString()
      }))
    };
  }

  async restoreAccount(managerId: string, accountId: string): Promise<ManagerAccountView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'manager' and status = 'active' for update",
        [managerId]
      );
      const organizationId = actor.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
      const updated = await client.query<{
        id: string; display_name: string; email: string | null; role: AccountRole; status: string; created_at: Date;
      }>(
        `update users set status = 'active', updated_at = now()
         where id = $1 and organization_id = $2 and status = 'deleted'
         returning id, display_name, email, role, status, created_at`,
        [accountId, organizationId]
      );
      const account = updated.rows[0];
      if (!account) throw new Error("MANAGER_TRASH_ACCOUNT_NOT_FOUND");
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'manager.account.restored', 'user', $4, '{}'::jsonb, $5)`,
        [randomUUID(), organizationId, managerId, accountId, randomUUID()]
      );
      await client.query("commit");
      return this.accountView(account);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async issuePurgeConfirmation(managerId: string, accountId: string): Promise<ManagerPurgeConfirmationView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'manager' and status = 'active' for update",
        [managerId]
      );
      const organizationId = actor.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
      const target = await client.query<{ id: string }>(
        "select id from users where id = $1 and organization_id = $2 and status = 'deleted' for update",
        [accountId, organizationId]
      );
      if (!target.rowCount) throw new Error("MANAGER_TRASH_ACCOUNT_NOT_FOUND");

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + purgeConfirmationTtlSeconds * 1000);
      await client.query(
        `insert into manager_destructive_confirmations
           (id, organization_id, manager_id, action, target_id, token_hash, expires_at)
         values ($1, $2, $3, 'purge_account', $4, $5, $6)`,
        [randomUUID(), organizationId, managerId, accountId, destructiveTokenHash(token), expiresAt]
      );
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'manager.account.purge_confirmation_issued', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, managerId, accountId, JSON.stringify({ action: "purge_account", expiresAt: expiresAt.toISOString() }), randomUUID()]
      );
      await client.query("commit");
      return {
        accountId,
        token,
        confirmationPhrase: purgeConfirmationPhrase,
        countdownSeconds: purgeConfirmationCountdownSeconds,
        expiresAt: expiresAt.toISOString()
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async purgeAccount(managerId: string, accountId: string, input: ManagerPurgeConfirmationInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'manager' and status = 'active' for update",
        [managerId]
      );
      const organizationId = actor.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
      if (managerId === accountId) throw new Error("MANAGER_SELF_PURGE_FORBIDDEN");
      const target = await client.query<{ id: string; role: AccountRole }>(
        "select id, role from users where id = $1 and organization_id = $2 and status = 'deleted' for update",
        [accountId, organizationId]
      );
      const targetAccount = target.rows[0];
      if (!targetAccount) throw new Error("MANAGER_TRASH_ACCOUNT_NOT_FOUND");
      if (input.confirmationPhrase !== purgeConfirmationPhrase) throw new Error("MANAGER_PURGE_CONFIRMATION_INVALID");
      const confirmation = await client.query<{ id: string }>(
        `select id
         from manager_destructive_confirmations
         where organization_id = $1 and manager_id = $2 and action = 'purge_account'
           and target_id = $3 and token_hash = $4 and used_at is null and expires_at > now()
         order by created_at desc
         limit 1
         for update`,
        [organizationId, managerId, accountId, destructiveTokenHash(input.confirmationToken)]
      );
      if (!confirmation.rows[0]) throw new Error("MANAGER_PURGE_CONFIRMATION_INVALID");
      const anonymousName = targetAccount.role === "learner"
        ? "Người học đã xoá"
        : targetAccount.role === "operator"
          ? "Người vận hành đã xoá"
          : "Quản lý đã xoá";

      // Remove authentication and direct profile/file identifiers first. Every
      // statement runs in this transaction, so a failed scrub restores all rows.
      await client.query("delete from sessions where user_id = $1", [accountId]);
      await client.query("delete from user_credentials where user_id = $1", [accountId]);
      await client.query("delete from learner_profiles where user_id = $1", [accountId]);
      const privateFiles = await client.query<{ bucket: string; object_key: string }>(
        "select bucket, object_key from files where owner_user_id = $1 for update",
        [accountId]
      );
      for (const file of privateFiles.rows) {
        await client.query(
          `insert into jobs (id, kind, payload, max_attempts, idempotency_key)
           values ($1, 'storage.cleanup', $2::jsonb, 3, $3)
           on conflict (idempotency_key) do nothing`,
          [
            randomUUID(),
            JSON.stringify({ bucket: file.bucket, objectKey: file.object_key, reason: "account_purge" }),
            `account-purge:${accountId}:${file.bucket}:${file.object_key}`
          ]
        );
      }
      await client.query("delete from files where owner_user_id = $1", [accountId]);

      // Keep operational and learning history, but remove free-form content that
      // can contain names, contact details, speech, or other personal data.
      await client.query("update progress_records set evidence = '{}'::jsonb where learner_id = $1", [accountId]);
      await client.query("update activities set evidence = '{}'::jsonb where learner_id = $1", [accountId]);
      await client.query(
        `update assessment_attempts
         set timing_state = '{}'::jsonb, integrity_events = '[]'::jsonb,
             device_evidence = '{}'::jsonb, media_evidence = '{}'::jsonb
         where learner_id = $1`,
        [accountId]
      );
      await client.query(
        `update assessment_responses set response = '{}'::jsonb
         where attempt_id in (select id from assessment_attempts where learner_id = $1)`,
        [accountId]
      );
      await client.query(
        `update assessment_scores set criteria = '{}'::jsonb
         where attempt_id in (select id from assessment_attempts where learner_id = $1)`,
        [accountId]
      );
      await client.query(
        `update assessment_decisions set reason = 'Nội dung đã được xoá khi ẩn danh tài khoản.'
         where attempt_id in (select id from assessment_attempts where learner_id = $1)`,
        [accountId]
      );
      await client.query(
        `update appeals set reason = 'Nội dung đã được xoá khi ẩn danh tài khoản.', resolution = null,
           request_scope = null, screenshot = null, screenshot_type = null
         where learner_id = $1`,
        [accountId]
      );
      await client.query("update ai_runs set user_id = null, output = null where user_id = $1", [accountId]);
      await client.query("update coach_sessions set scenario = '{}'::jsonb where learner_id = $1", [accountId]);
      await client.query(
        `update coach_turns set content = '{}'::jsonb, feedback = null
         where session_id in (select id from coach_sessions where learner_id = $1)`,
        [accountId]
      );
      await client.query("update practice_submissions set content = '{}'::jsonb, feedback = null where learner_id = $1", [accountId]);
      await client.query(
        `update reminders
         set reason = 'Tài khoản đã ẩn danh', message = 'Nội dung đã được xoá khi ẩn danh tài khoản.'
         where learner_id = $1`,
        [accountId]
      );
      await client.query(
        `update notification_deliveries set external_id = null, response = '{}'::jsonb
         where reminder_id in (select id from reminders where learner_id = $1)`,
        [accountId]
      );
      await client.query("update game_results set details = '{}'::jsonb where learner_id = $1", [accountId]);
      await client.query("update surveys set answers = '{}'::jsonb where learner_id = $1", [accountId]);
      await client.query("update monthly_survey_submissions set answers = '[]'::jsonb where learner_id = $1", [accountId]);
      await client.query("update micro_lessons set content = '{}'::jsonb, progress = '{}'::jsonb where learner_id = $1", [accountId]);
      await client.query("update topic_strikes set topic = 'Đã ẩn danh', reason = 'Nội dung đã được xoá.' where learner_id = $1", [accountId]);
      await client.query("update topic_reports set topic = 'Đã ẩn danh', reason = 'Nội dung đã được xoá.' where learner_id = $1", [accountId]);
      await client.query("update lesson_part_attempts set answer = null, feedback = null, artifact_key = null where learner_id = $1", [accountId]);
      await client.query("update lesson_part_appeals set reason = 'Nội dung đã được xoá.', request_scope = null, screenshot = null, screenshot_type = null where learner_id = $1", [accountId]);
      await client.query("update practice_appeals set reason = 'Nội dung đã được xoá.', resolution = null, request_scope = null, screenshot = null, screenshot_type = null where learner_id = $1", [accountId]);
      await client.query("update learner_complaints set request_scope = null, screenshot = null, screenshot_type = null where learner_id = $1", [accountId]);
      await client.query("update manager_pin_reports set note = 'Nội dung đã được xoá khi ẩn danh tài khoản.' where subject_user_id = $1", [accountId]);
      await client.query(
        `update audit_events set payload = '{}'::jsonb
         where (entity_type = 'user' and entity_id = $1) or actor_user_id = $1`,
        [accountId]
      );

      await client.query(
        `update users
         set display_name = $3, email = null, avatar = '{}'::jsonb, status = 'purged', updated_at = now()
         where id = $1 and organization_id = $2`,
        [accountId, organizationId, anonymousName]
      );
      await client.query("update manager_destructive_confirmations set used_at = now() where id = $1", [confirmation.rows[0].id]);
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'manager.account.purged', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, managerId, accountId,
          JSON.stringify({ piiRemoved: true, authenticationRemoved: true, historyRetained: true }), randomUUID()]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async pinReports(managerId: string): Promise<ManagerPinReportsView | null> {
    const organization = await this.organizationFor(managerId);
    if (!organization) return null;
    const result = await this.pool.query<{
      id: string; subject_user_id: string; subject_name: string; note: string; status: "open" | "done";
      created_at: Date; resolved_at: Date | null;
    }>(
      `select r.id, r.subject_user_id, u.display_name as subject_name, r.note, r.status,
              r.created_at, r.resolved_at
       from manager_pin_reports r join users u on u.id = r.subject_user_id
       where r.organization_id = $1 order by r.created_at desc`,
      [organization.id]
    );
    return { reports: result.rows.map((report) => this.pinReportView(report)) };
  }

  async createPinReport(managerId: string, accountId: string, note: string): Promise<ManagerPinReportView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'manager' and status = 'active' for update",
        [managerId]
      );
      const organizationId = actor.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
      const subject = await client.query<{ id: string; display_name: string }>(
        "select id, display_name from users where id = $1 and organization_id = $2 and status in ('active', 'disabled') for update",
        [accountId, organizationId]
      );
      if (!subject.rows[0]) throw new Error("MANAGER_PIN_REPORT_ACCOUNT_NOT_FOUND");
      const id = randomUUID();
      const created = await client.query<{
        id: string; subject_user_id: string; subject_name: string; note: string; status: "open" | "done"; created_at: Date; resolved_at: Date | null;
      }>(
        `insert into manager_pin_reports (id, organization_id, subject_user_id, note, created_by)
         values ($1, $2, $3, $4, $5)
         returning id, subject_user_id, $6::text as subject_name, note, status, created_at, resolved_at`,
        [id, organizationId, accountId, note, managerId, subject.rows[0].display_name]
      );
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'manager.pin_report.created', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, managerId, accountId, JSON.stringify({ reportId: id }), randomUUID()]
      );
      await client.query("commit");
      const report = created.rows[0];
      if (!report) throw new Error("MANAGER_PIN_REPORT_CREATE_FAILED");
      return this.pinReportView(report);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async resolvePinReport(managerId: string, reportId: string): Promise<ManagerPinReportView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'manager' and status = 'active' for update",
        [managerId]
      );
      const organizationId = actor.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
      const updated = await client.query<{
        id: string; subject_user_id: string; subject_name: string; note: string; status: "open" | "done"; created_at: Date; resolved_at: Date | null;
      }>(
        `update manager_pin_reports r set status = 'done', resolved_by = $3, resolved_at = now()
         from users subject
         where r.id = $1 and r.organization_id = $2 and subject.id = r.subject_user_id
         returning r.id, r.subject_user_id, subject.display_name as subject_name, r.note, r.status, r.created_at, r.resolved_at`,
        [reportId, organizationId, managerId]
      );
      const report = updated.rows[0];
      if (!report) throw new Error("MANAGER_PIN_REPORT_NOT_FOUND");
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'manager.pin_report.resolved', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, managerId, report.subject_user_id, JSON.stringify({ reportId }), randomUUID()]
      );
      await client.query("commit");
      return this.pinReportView(report);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  private pinReportView(report: {
    id: string;
    subject_user_id: string;
    subject_name: string;
    note: string;
    status: "open" | "done";
    created_at: Date;
    resolved_at: Date | null;
  }): ManagerPinReportView {
    return {
      id: report.id,
      subjectUserId: report.subject_user_id,
      subjectName: report.subject_name,
      note: report.note,
      status: report.status,
      createdAt: report.created_at.toISOString(),
      resolvedAt: report.resolved_at?.toISOString() ?? null
    };
  }

  async report(staffId: string): Promise<ManagerReportView | null> {
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;
    const [progress, operations, levelDistributionResult, totalsResult, surveysResult] = await Promise.all([
      this.progress(staffId),
      this.operations(staffId),
      this.pool.query<{ cefr: CefrLevel; learners: string }>(
        `select e.cefr, count(distinct e.learner_id)::text as learners
         from enrollments e
         join programs p on p.id = e.program_id
         join users u on u.id = e.learner_id
         where p.organization_id = $1 and u.role = 'learner' and u.status = 'active' and e.cefr is not null and e.cefr_approved
         group by e.cefr order by e.cefr`,
        [organization.id]
      ),
      this.pool.query<{
        approved_lesson_sets: string;
        approved_lessons: string;
        coach_turns: string;
        practice_submissions: string;
        reviewed_practice_submissions: string;
        reminders: string;
        appeals: string;
        pending_appeals: string;
      }>(
        `select
           (select count(distinct ls.id) from lesson_sets ls
             join program_weeks pw on pw.id = ls.program_week_id join programs p on p.id = pw.program_id
             where p.organization_id = $1 and exists (
               select 1 from lesson_set_versions lsv where lsv.lesson_set_id = ls.id and lsv.status = 'published'
             ))::text as approved_lesson_sets,
           (select count(*) from lessons l join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id
             join lesson_sets ls on ls.id = lsv.lesson_set_id join program_weeks pw on pw.id = ls.program_week_id
             join programs p on p.id = pw.program_id where p.organization_id = $1 and lsv.status = 'published')::text as approved_lessons,
           (select count(*) from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
           join users u on u.id = cs.learner_id and u.role = 'learner' and u.status = 'active' where u.organization_id = $1 and ct.speaker = 'learner')::text as coach_turns,
           (select count(*) from practice_submissions ps join users u on u.id = ps.learner_id and u.role = 'learner' and u.status = 'active'
             where u.organization_id = $1 and ps.submitted_at is not null)::text as practice_submissions,
           (select count(*) from practice_submissions ps join users u on u.id = ps.learner_id and u.role = 'learner' and u.status = 'active'
             where u.organization_id = $1 and ps.checked_by is not null)::text as reviewed_practice_submissions,
           (select count(*) from reminders r join users u on u.id = r.learner_id and u.role = 'learner' and u.status = 'active'
             where u.organization_id = $1)::text as reminders,
           (select count(*) from appeals a join users u on u.id = a.learner_id and u.role = 'learner' and u.status = 'active'
             where u.organization_id = $1)::text as appeals,
           (select count(*) from appeals a join users u on u.id = a.learner_id and u.role = 'learner' and u.status = 'active'
             where u.organization_id = $1 and a.status = 'pending')::text as pending_appeals`,
        [organization.id]
      ),
      this.pool.query<{
        learner_id: string;
        learner_name: string;
        rating: string;
        comment: string | null;
        study_time: string | null;
        submitted_at: Date;
      }>(
        `select s.learner_id, u.display_name as learner_name, s.answers->>'rating' as rating,
                nullif(s.answers->>'comment', '') as comment,
                nullif(s.answers->>'studyTime', '') as study_time,
                s.submitted_at
         from surveys s join users u on u.id = s.learner_id and u.role = 'learner' and u.status = 'active'
         where u.organization_id = $1 and (s.answers->>'rating') ~ '^[1-5](\\.0)?$'
         order by s.submitted_at desc`,
        [organization.id]
      )
    ]);
    if (!progress || !operations) return null;
    const totals = totalsResult.rows[0] ?? {
      approved_lesson_sets: "0", approved_lessons: "0", coach_turns: "0", practice_submissions: "0",
      reviewed_practice_submissions: "0", reminders: "0", appeals: "0", pending_appeals: "0"
    };
    return {
      organizationName: progress.organizationName,
      generatedAt: new Date().toISOString(),
      currentWeek: progress.currentWeek,
      pilotWeeks: progress.pilotWeeks,
      progress: progress.summary,
      learners: progress.learners,
      activityByDay: progress.activityByDay ?? [],
      regularByWeek: progress.regularByWeek ?? [],
      levelDistribution: levelDistributionResult.rows.map((row) => ({ cefr: row.cefr, learners: Number(row.learners) })),
      totals: {
        approvedLessonSets: Number(totals.approved_lesson_sets),
        approvedLessons: Number(totals.approved_lessons),
        coachTurns: Number(totals.coach_turns),
        practiceSubmissions: Number(totals.practice_submissions),
        reviewedPracticeSubmissions: Number(totals.reviewed_practice_submissions),
        reminders: Number(totals.reminders),
        appeals: Number(totals.appeals),
        pendingAppeals: Number(totals.pending_appeals)
      },
      surveyResponses: surveysResult.rows.map((row) => ({
        learnerId: row.learner_id,
        learnerName: row.learner_name,
        rating: Number(row.rating),
        comment: row.comment ?? "",
        studyTime: row.study_time === "work" || row.study_time === "outside" || row.study_time === "both" ? row.study_time : null,
        submittedAt: row.submitted_at.toISOString()
      })),
      operations: { content: operations.content, queues: operations.queues, automation: operations.automation }
    };
  }

  async settings(staffId: string): Promise<ManagerSettingsView | null> {
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;
    const settings = await this.settingsForOrganization(organization.id);
    return { organizationName: organization.name, ...settings };
  }

  async organisationExperience(userId: string): Promise<OrganisationExperienceView | null> {
    const result = await this.pool.query<{ theme: OrganisationExperienceView["theme"]; configuration: Record<string, unknown> }>(
      `select coalesce(os.theme, 'auto') as theme, coalesce(os.configuration, '{}'::jsonb) as configuration
       from users u
       left join organization_settings os on os.organization_id = u.organization_id
       where u.id = $1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const configured = isRecord(row.configuration.backgroundMusic) ? row.configuration.backgroundMusic : {};
    return {
      theme: row.theme,
      backgroundMusic: {
        enabled: typeof configured.enabled === "boolean" ? configured.enabled : true,
        playlistId: typeof configured.playlistId === "string" && configured.playlistId.trim() ? configured.playlistId : "auto",
        customUrl: typeof configured.customUrl === "string" ? configured.customUrl : typeof configured.url === "string" ? configured.url : "",
        volume: typeof configured.volume === "number" ? configured.volume : 22
      }
    };
  }

  async saveOrganisationExperience(userId: string, input: OrganisationExperienceInput): Promise<OrganisationExperienceView> {
    const result = await this.pool.query<{ theme: OrganisationExperienceView["theme"]; configuration: Record<string, unknown> }>(
      `insert into organization_settings (organization_id, theme, configuration, updated_by)
       select organization_id, $2, jsonb_build_object('backgroundMusic', $3::jsonb), $1
       from users where id = $1
       on conflict (organization_id) do update
       set theme = excluded.theme,
           configuration = jsonb_set(organization_settings.configuration, '{backgroundMusic}', $3::jsonb, true),
           updated_by = excluded.updated_by,
           updated_at = now()
       returning theme, configuration`,
      [userId, input.theme, JSON.stringify(input.backgroundMusic)]
    );
    if (!result.rowCount) throw new Error("ORGANISATION_EXPERIENCE_NOT_FOUND");
    return input;
  }

  async saveSettings(managerId: string, input: ManagerSettingsInput): Promise<ManagerSettingsView> {
    const organization = await this.organizationFor(managerId);
    if (!organization) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const activeProgram = await client.query<{ id: string; start_date: string; week_count: number; name: string; today: string }>(
        `select id, start_date::text, week_count, name, organization_system_date(organization_id)::text as today
         from programs
         where organization_id = $1 and status = 'active'
         order by start_date desc
         limit 1
         for update`,
        [organization.id]
      );
      const currentProgram = activeProgram.rows[0];
      const pilotAction = input.pilotCycleAction === "save";
      const { pilotCycleAction: _pilotCycleAction, baseWebhookUrl: _retiredBaseUrl, baseWebhookTemplate: _retiredBaseTemplate, ...cleanInput } = input;
      const existingSettings = await client.query<{ configuration: Partial<Omit<ManagerSettingsView, "organizationName">> }>(
        "select configuration from organization_settings where organization_id = $1 for update", [organization.id]
      );
      let effectiveProgramId = currentProgram?.id;
      let effectiveStartDate = currentProgram?.start_date ?? input.pilotStartDate;
      let effectiveWeeks = currentProgram?.week_count ?? input.pilotWeeks;
      if (currentProgram && pilotAction) {
        const start = Date.parse(`${currentProgram.start_date}T00:00:00.000Z`);
        const today = Date.parse(`${currentProgram.today}T00:00:00.000Z`);
        const elapsedWeek = Math.floor((today - start) / (7 * 86_400_000)) + 1;
        if (elapsedWeek <= currentProgram.week_count) {
          if (input.pilotWeeks < currentProgram.week_count) throw new Error("PILOT_WEEKS_CANNOT_DECREASE");
          if (input.pilotWeeks > currentProgram.week_count) {
            effectiveWeeks = input.pilotWeeks;
            await client.query("update programs set week_count = $2, current_week_override = null where id = $1", [currentProgram.id, effectiveWeeks]);
            await client.query(
              `insert into audit_events
                 (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
               values ($1, $2, $3, 'pilot.duration_extended', 'program', $4, $5::jsonb, $6)`,
              [randomUUID(), organization.id, managerId, currentProgram.id, JSON.stringify({ fromWeeks: currentProgram.week_count, toWeeks: effectiveWeeks }), randomUUID()]
            );
          }
        } else {
          const newProgramId = randomUUID();
          const monday = await client.query<{ monday: string }>("select date_trunc('week', current_date)::date::text as monday");
          effectiveStartDate = monday.rows[0]?.monday ?? currentProgram.today;
          effectiveWeeks = input.pilotWeeks;
          effectiveProgramId = newProgramId;
          await client.query("update programs set status = 'completed' where id = $1", [currentProgram.id]);
          await client.query(
            `insert into programs (id, organization_id, name, start_date, week_count, current_week_override, status)
             values ($1, $2, $3, $4::date, $5, null, 'active')`,
            [newProgramId, organization.id, cleanInput.programName.trim(), effectiveStartDate, effectiveWeeks]
          );
          await client.query(
            `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved)
             select gen_random_uuid(), $1, learner_id, cefr, cefr_approved
             from enrollments where program_id = $2
             on conflict (program_id, learner_id) do nothing`,
            [newProgramId, currentProgram.id]
          );
          await client.query(
            `insert into content_lesson_level_settings (program_id, levels)
             select $1, levels from content_lesson_level_settings where program_id = $2
             on conflict (program_id) do nothing`,
            [newProgramId, currentProgram.id]
          );
          await client.query(
            `insert into audit_events
               (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
             values ($1, $2, $3, 'pilot.cycle_started', 'program', $4, $5::jsonb, $6)`,
            [randomUUID(), organization.id, managerId, newProgramId, JSON.stringify({ previousProgramId: currentProgram.id, weeks: effectiveWeeks, startDate: effectiveStartDate }), randomUUID()]
          );
        }
      }
      const currentSettings = existingSettings.rows[0]?.configuration;
      let coachLimitChange: { coachDailyLimitStartsMonth: string; previousCoachDailyLimit: number } | undefined;
      const previousConfiguredLimit = currentSettings?.coachDailyLimit ?? 30;
      const coachDailyLimit = organization.role === "manager" ? cleanInput.coachDailyLimit : previousConfiguredLimit;
      if (coachDailyLimit !== previousConfiguredLimit) {
        const schedule = await client.query<{ starts_month: string; daily_limit: number }>(
          `select to_char(organization_system_date(u.organization_id) + interval '1 month', 'YYYY-MM') as starts_month,
                  ${coachDailyLimitSql} as daily_limit
           from users u left join organization_settings os on os.organization_id = u.organization_id
           where u.id = $1`, [managerId]
        );
        const current = schedule.rows[0]!;
        coachLimitChange = { coachDailyLimitStartsMonth: current.starts_month, previousCoachDailyLimit: current.daily_limit };
      }
      const savedInput = {
        ...currentSettings,
        ...cleanInput,
        ...coachLimitChange,
        coachDailyLimit,
        // Only an explicit test date is stored; empty/null returns to the real date (undefined is dropped
        // by JSON.stringify, removing the key), omitted keeps the current one.
        simulatedSystemDate: (cleanInput.simulatedSystemDate === undefined ? currentSettings?.simulatedSystemDate : cleanInput.simulatedSystemDate) || undefined,
        // Merge so fields the settings form does not send (customUrl, playlistId) survive a save.
        backgroundMusic: { ...currentSettings?.backgroundMusic, ...cleanInput.backgroundMusic },
        pilotStartDate: effectiveStartDate, pilotWeeks: effectiveWeeks, weekOverride: 0
      };
      await client.query(
        `insert into organization_settings (organization_id, reminder_inactive_days, weekly_report_enabled, configuration, updated_by)
         values ($1, $2, $3, $4::jsonb, $5)
         on conflict (organization_id) do update
         set reminder_inactive_days = excluded.reminder_inactive_days,
             weekly_report_enabled = excluded.weekly_report_enabled,
             configuration = excluded.configuration,
             updated_by = excluded.updated_by,
             updated_at = now()`,
        [organization.id, savedInput.reminderInactiveDays, savedInput.weeklyReportEnabled, JSON.stringify(savedInput), managerId]
      );
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'organisation.settings.updated', 'organization', $2, $4::jsonb, $5)`,
        [randomUUID(), organization.id, managerId, JSON.stringify({ ...savedInput, baseWebhookUrl: undefined, baseWebhookTemplate: undefined }), randomUUID()]
      );
      // Test-date and upcoming-lesson notices follow the (possibly new) organisation date at once.
      await client.query("select sync_staff_date_notices($1)", [organization.id]);
      const program = await client.query<{ id: string }>(
        `update programs
         set name = $1,
             current_week_override = null
         where id = $2
         returning id`,
        [savedInput.programName.trim(), effectiveProgramId]
      );
      const programId = program.rows[0]?.id;
      if (programId) {
        await client.query(
          `insert into program_weeks
             (id, program_id, week_number, topic, description, objectives, key_vocab_hint, ai_plan)
           select gen_random_uuid(), $1, week_number, '', '', '[]'::jsonb, '', '{}'::jsonb
           from generate_series(1, $2::int) as week_number
           on conflict (program_id, week_number) do nothing`,
          [programId, savedInput.pilotWeeks]
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    const saved = await this.settings(managerId);
    if (!saved) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    return saved;
  }

  async clearImageCache(managerId: string): Promise<{ cleared: number }> {
    const organization = await this.organizationFor(managerId);
    if (!organization) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    const client = await this.pool.connect();
    let cleared = 0;
    try {
      await client.query("begin");
      const sets = await client.query<{ id: string; payload: Record<string, unknown> }>(
        `select gs.id, gs.payload
         from game_sets gs
         join program_weeks pw on pw.id = gs.program_week_id
         join programs p on p.id = pw.program_id
         where p.organization_id = $1 and jsonb_typeof(gs.payload->'words') = 'array'
         for update of gs`,
        [organization.id]
      );
      for (const set of sets.rows) {
        const words = Array.isArray(set.payload.words) ? set.payload.words : [];
        let changed = false;
        const nextWords = words.map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return item;
          const word = item as Record<string, unknown>;
          if (!("imageUrl" in word)) return item;
          changed = true;
          const { imageUrl: _imageUrl, ...withoutImage } = word;
          return withoutImage;
        });
        if (!changed) continue;
        await client.query("update game_sets set payload = $2::jsonb where id = $1", [set.id, JSON.stringify({ ...set.payload, words: nextWords })]);
        cleared += 1;
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'manager.image_cache.cleared', 'organization', $2, $4::jsonb, $5)`,
        [randomUUID(), organization.id, managerId, JSON.stringify({ cleared }), randomUUID()]
      );
      await client.query("commit");
      return { cleared };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async testMusic(managerId: string, input: ManagerSettingsView["backgroundMusic"]): Promise<ManagerMusicTestView> {
    if (!(await this.organizationFor(managerId))) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    const valid = isYouTubeMusicUrl(input.url, input.enabled);
    return { status: valid ? "valid" : "invalid", checkedAt: new Date().toISOString() };
  }

  async resetMusic(managerId: string): Promise<ManagerSettingsView["backgroundMusic"]> {
    const organization = await this.organizationFor(managerId);
    if (!organization) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    const settings = await this.settingsForOrganization(organization.id);
    const backgroundMusic = { enabled: true, url: "", volume: 22 };
    // saveSettings merges music fields, so a reset clears the experience fields explicitly.
    const resetMusic = { ...backgroundMusic, customUrl: "", playlistId: "auto" };
    await this.saveSettings(managerId, { ...settings, backgroundMusic: resetMusic });
    return backgroundMusic;
  }

  async testWebhook(managerId: string, input: { url: string; template: string }): Promise<ManagerWebhookTestView> {
    if (!(await this.organizationFor(managerId))) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    const testedAt = new Date().toISOString();
    let target: URL;
    let payload: unknown;
    try {
      target = new URL(input.url);
    } catch {
      return { status: "error", statusCode: null, code: "WEBHOOK_URL_INVALID", testedAt };
    }
    if (target.protocol !== "https:") return { status: "error", statusCode: null, code: "WEBHOOK_URL_HTTPS_REQUIRED", testedAt };
    try {
      payload = JSON.parse(input.template.replaceAll("{message}", "E4S kiểm tra webhook thành công.").replaceAll("{name}", "E4S"));
    } catch {
      return { status: "error", statusCode: null, code: "WEBHOOK_TEMPLATE_INVALID", testedAt };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(target.toString(), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      return { status: response.ok ? "success" : "error", statusCode: response.status, code: response.ok ? null : `WEBHOOK_HTTP_${response.status}`, testedAt };
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      return {
        status: timedOut ? "timeout" : "error",
        statusCode: null,
        code: timedOut ? "WEBHOOK_TIMEOUT" : "WEBHOOK_NETWORK_ERROR",
        testedAt
      };
    } finally { clearTimeout(timeout); }
  }

  async exportData(managerId: string): Promise<ManagerDataExportView | null> {
    const organization = await this.organizationFor(managerId);
    if (!organization) return null;
    const [accounts, progress] = await Promise.all([this.accounts(managerId), this.progress(managerId)]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      organization,
      settings: await this.settingsForOrganization(organization.id),
      accounts: accounts?.accounts ?? [],
      progress: progress ? { summary: progress.summary, learners: progress.learners } : null
    };
  }

  async importData(managerId: string, snapshot: unknown): Promise<ManagerDataImportView> {
    if (!isRecord(snapshot) || snapshot.version !== 1 || !isRecord(snapshot.settings)) {
      throw new Error("MANAGER_DATA_IMPORT_INVALID");
    }
    const organization = await this.organizationFor(managerId);
    if (!organization) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    const current = await this.settingsForOrganization(organization.id);
    const input = importedSettings(current, snapshot.settings);
    await this.saveSettings(managerId, input);
    return { imported: true };
  }

  async issueMaintenanceConfirmation(managerId: string, action: ManagerMaintenanceAction): Promise<ManagerMaintenanceConfirmationView> {
    const organization = await this.maintenanceOrganizationFor(managerId);
    const snapshot = await this.exportData(managerId);
    if (!snapshot) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    const backupId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + maintenanceConfirmationTtlSeconds * 1000);
    const backupExpiresAt = new Date(Date.now() + maintenanceBackupTtlSeconds * 1000);
    const snapshotSha256 = maintenanceSnapshotHash(snapshot);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into manager_maintenance_backups
           (id, organization_id, manager_id, action, snapshot, snapshot_sha256, expires_at)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [backupId, organization.id, managerId, action, JSON.stringify(snapshot), snapshotSha256, backupExpiresAt]
      );
      await client.query(
        `insert into manager_destructive_confirmations
           (id, organization_id, manager_id, action, target_id, token_hash, details, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [randomUUID(), organization.id, managerId, action, organization.id, destructiveTokenHash(token), JSON.stringify({ backupId, snapshotSha256 }), expiresAt]
      );
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'manager.maintenance.confirmation_issued', 'organization', $2, $4::jsonb, $5)`,
        [randomUUID(), organization.id, managerId, JSON.stringify({ action, backupId, snapshotSha256, expiresAt: expiresAt.toISOString() }), randomUUID()]
      );
      await client.query("commit");
      return {
        action,
        token,
        confirmationPhrase: maintenancePhrases[action],
        countdownSeconds: maintenanceConfirmationCountdownSeconds,
        expiresAt: expiresAt.toISOString(),
        backupId
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async runMaintenance(managerId: string, action: ManagerMaintenanceAction, input: ManagerMaintenanceConfirmationInput): Promise<ManagerMaintenanceResultView> {
    if (input.confirmationPhrase !== maintenancePhrases[action]) throw new Error("MANAGER_MAINTENANCE_CONFIRMATION_INVALID");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = await client.query<{ organization_id: string }>(
        `select u.organization_id from users u join organizations o on o.id = u.organization_id
         where u.id = $1 and u.role = 'manager' and u.status = 'active' and o.slug = 'gft-demo'
         and (select count(*) from organizations) = 1 for update`,
        [managerId]
      );
      const organizationId = actor.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_MAINTENANCE_TARGET_INVALID");
      const confirmation = await client.query<{ id: string; details: Record<string, unknown> }>(
        `select id, details
         from manager_destructive_confirmations
         where organization_id = $1 and manager_id = $2 and action = $3
           and target_id = $1 and token_hash = $4 and used_at is null and expires_at > now()
         order by created_at desc limit 1 for update`,
        [organizationId, managerId, action, destructiveTokenHash(input.confirmationToken)]
      );
      const confirmationRow = confirmation.rows[0];
      const backupId = typeof confirmationRow?.details?.backupId === "string" ? confirmationRow.details.backupId : "";
      if (!confirmationRow || !backupId) throw new Error("MANAGER_MAINTENANCE_CONFIRMATION_INVALID");
      const backup = await client.query<{ id: string }>(
        `select id from manager_maintenance_backups
         where id = $1 and organization_id = $2 and manager_id = $3 and action = $4
           and consumed_at is null and expires_at > now()
         for update`,
        [backupId, organizationId, managerId, action]
      );
      if (!backup.rowCount) throw new Error("MANAGER_MAINTENANCE_BACKUP_REQUIRED");

      await this.resetLocalMaintenanceData(client, organizationId, managerId);
      if (action === "seed_demo") await seedDemo(client, { mode: "local" });
      await client.query("update manager_destructive_confirmations set used_at = now() where id = $1", [confirmationRow.id]);
      await client.query("update manager_maintenance_backups set consumed_at = now() where id = $1", [backupId]);
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, $4, 'organization', $2, $5::jsonb, $6)`,
        [randomUUID(), organizationId, managerId, `manager.maintenance.${action}`, JSON.stringify({ backupId }), randomUUID()]
      );
      await client.query("commit");
      return { action, completed: true, backupId, completedAt: new Date().toISOString() };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  private async maintenanceOrganizationFor(managerId: string): Promise<{ id: string; name: string }> {
    const organization = await this.pool.query<{ id: string; name: string; slug: string; organization_count: string }>(
      `select o.id, o.name, o.slug, (select count(*)::text from organizations) as organization_count
       from users u join organizations o on o.id = u.organization_id
       where u.id = $1 and u.role = 'manager' and u.status = 'active'`,
      [managerId]
    );
    const row = organization.rows[0];
    if (!row) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
    if (row.slug !== "gft-demo" || row.organization_count !== "1") throw new Error("MANAGER_MAINTENANCE_TARGET_INVALID");
    return { id: row.id, name: row.name };
  }

  private async resetLocalMaintenanceData(client: PoolClient, organizationId: string, managerId: string): Promise<void> {
    const preservedTables = [
      "organizations", "users", "user_credentials", "sessions", "audit_events",
      "manager_destructive_confirmations", "manager_maintenance_backups", "schema_migrations"
    ];
    const tables = await client.query<{ table_name: string }>(
      `select quote_ident(tablename) as table_name
       from pg_tables
       where schemaname = 'public' and not (tablename = any($1::text[]))
       order by tablename`,
      [preservedTables]
    );
    if (tables.rows.length) await client.query(`truncate table ${tables.rows.map((row) => row.table_name).join(", ")} cascade`);
    await client.query("delete from sessions where user_id <> $1", [managerId]);
    await client.query("delete from user_credentials where user_id <> $1", [managerId]);
    await client.query("update audit_events set actor_user_id = null where organization_id = $1 and actor_user_id <> $2", [organizationId, managerId]);
    await client.query("delete from users where organization_id = $1 and id <> $2", [organizationId, managerId]);
  }

  async changeAccountRole(managerId: string, accountId: string, nextRole: AccountRole): Promise<ManagerAccountView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const organizationResult = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 for update", [managerId]
      );
      const organizationId = organizationResult.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
      const targetResult = await client.query<{
        id: string;
        display_name: string;
        email: string | null;
        role: AccountRole;
        status: string;
        created_at: Date;
      }>(
        `select id, display_name, email, role, status, created_at
         from users
         where id = $1 and organization_id = $2 and status in ('active', 'disabled')
         for update`,
        [accountId, organizationId]
      );
      const target = targetResult.rows[0];
      if (!target) throw new Error("MANAGER_ACCOUNT_NOT_FOUND");
      if (target.id === managerId && target.role !== nextRole) throw new Error("MANAGER_SELF_ROLE_CHANGE_FORBIDDEN");
      if (target.role === "manager" && target.role !== nextRole) {
        const managers = await client.query(
          "select id from users where organization_id = $1 and role = 'manager' and status = 'active' for update",
          [organizationId]
        );
        if ((managers.rowCount ?? 0) <= 1) throw new Error("MANAGER_LAST_ADMIN_REQUIRED");
      }
      if (target.role === nextRole) {
        await client.query("commit");
        return this.accountView(target);
      }
      const updatedResult = await client.query<{
        id: string;
        display_name: string;
        email: string | null;
        role: AccountRole;
        status: string;
        created_at: Date;
      }>(
        `update users set role = $3, updated_at = now()
         where id = $1 and organization_id = $2
         returning id, display_name, email, role, status, created_at`,
        [accountId, organizationId, nextRole]
      );
      const updated = updatedResult.rows[0];
      if (!updated) throw new Error("MANAGER_ACCOUNT_NOT_FOUND");
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'account.role.changed', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, managerId, accountId, JSON.stringify({ from: target.role, to: nextRole }), randomUUID()]
      );
      await client.query("commit");
      return this.accountView(updated);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async createAccount(managerId: string, input: {
    displayName: string;
    email: string;
    role: AccountRole;
    credentialHash: string;
    recoverableCredential?: string;
  }): Promise<ManagerAccountView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'manager' and status = 'active' for update",
        [managerId]
      );
      const organizationId = actor.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
      const duplicate = await client.query(
        "select id from users where organization_id = $1 and lower(email) = lower($2) and status in ('active', 'disabled')",
        [organizationId, input.email]
      );
      if (duplicate.rowCount) throw new Error("MANAGER_ACCOUNT_EMAIL_EXISTS");
      const id = randomUUID();
      const created = await client.query<{
        id: string; display_name: string; email: string; role: AccountRole; status: string; created_at: Date;
      }>(
        `insert into users (id, organization_id, role, display_name, email)
         values ($1, $2, $3, $4, lower($5))
         returning id, display_name, email, role, status, created_at`,
        [id, organizationId, input.role, input.displayName, input.email]
      );
      const recovery = input.recoverableCredential ? encryptRecoverableSecret(input.recoverableCredential) : null;
      await client.query(
        `insert into user_credentials
           (user_id, credential_hash, recovery_ciphertext, recovery_nonce, recovery_auth_tag)
         values ($1, $2, $3, $4, $5)`,
        [id, input.credentialHash, recovery?.ciphertext ?? null, recovery?.nonce ?? null, recovery?.authTag ?? null]
      );
      if (input.role === "learner") {
        await client.query("insert into learner_profiles (user_id) values ($1)", [id]);
        await client.query(
          `insert into enrollments (id, program_id, learner_id)
           select $1, p.id, $2 from programs p
           where p.organization_id = $3 and p.status = 'active'
           order by p.start_date desc limit 1`,
          [randomUUID(), id, organizationId]
        );
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'account.created', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, managerId, id, JSON.stringify({ role: input.role, email: input.email }), randomUUID()]
      );
      await client.query("commit");
      const row = created.rows[0];
      if (!row) throw new Error("MANAGER_ACCOUNT_CREATE_FAILED");
      return this.accountView(row);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async changeAccountStatus(managerId: string, accountId: string, status: "active" | "disabled" | "deleted"): Promise<ManagerAccountView> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = await client.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 and role = 'manager' and status = 'active' for update",
        [managerId]
      );
      const organizationId = actor.rows[0]?.organization_id;
      if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
      const target = await client.query<{
        id: string; display_name: string; email: string | null; role: AccountRole; status: string; created_at: Date;
      }>(
        `select id, display_name, email, role, status, created_at from users
         where id = $1 and organization_id = $2 and status in ('active', 'disabled') for update`,
        [accountId, organizationId]
      );
      const before = target.rows[0];
      if (!before) throw new Error("MANAGER_ACCOUNT_NOT_FOUND");
      if (before.id === managerId) throw new Error("MANAGER_SELF_STATUS_CHANGE_FORBIDDEN");
      if (before.role === "manager" && status !== "active") {
        const managers = await client.query(
          "select id from users where organization_id = $1 and role = 'manager' and status = 'active' for update",
          [organizationId]
        );
        if ((managers.rowCount ?? 0) <= 1) throw new Error("MANAGER_LAST_ADMIN_REQUIRED");
      }
      const updated = await client.query<{
        id: string; display_name: string; email: string | null; role: AccountRole; status: string; created_at: Date;
      }>(
        `update users set status = $3, updated_at = now() where id = $1 and organization_id = $2
         returning id, display_name, email, role, status, created_at`,
        [accountId, organizationId, status]
      );
      await client.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [accountId]);
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'account.status.changed', 'user', $4, $5::jsonb, $6)`,
        [randomUUID(), organizationId, managerId, accountId, JSON.stringify({ from: before.status, to: status }), randomUUID()]
      );
      await client.query("commit");
      const row = updated.rows[0];
      if (!row) throw new Error("MANAGER_ACCOUNT_NOT_FOUND");
      return this.accountView(row);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async resetAccountCredential(managerId: string, accountId: string, credentialHash: string, recoverableCredential?: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const target = await client.query<{ organization_id: string }>(
        `select target.organization_id from users target
         join users manager on manager.id = $1 and manager.role = 'manager' and manager.status = 'active'
           and manager.organization_id = target.organization_id
         where target.id = $2 and target.status in ('active', 'disabled') for update of target`,
        [managerId, accountId]
      );
      const organizationId = target.rows[0]?.organization_id;
      if (!organizationId) { await client.query("rollback"); return false; }
      const recovery = recoverableCredential ? encryptRecoverableSecret(recoverableCredential) : null;
      await client.query(
        `insert into user_credentials
           (user_id, credential_hash, recovery_ciphertext, recovery_nonce, recovery_auth_tag)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id) do update set credential_hash = excluded.credential_hash,
           recovery_ciphertext = excluded.recovery_ciphertext,
           recovery_nonce = excluded.recovery_nonce,
           recovery_auth_tag = excluded.recovery_auth_tag,
           updated_at = now()`,
        [accountId, credentialHash, recovery?.ciphertext ?? null, recovery?.nonce ?? null, recovery?.authTag ?? null]
      );
      await client.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [accountId]);
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'account.credential.reset', 'user', $4, '{}'::jsonb, $5)`,
        [randomUUID(), organizationId, managerId, accountId, randomUUID()]
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async revealAccountPin(managerId: string, accountId: string): Promise<string> {
    const result = await this.pool.query<{
      recovery_ciphertext: string | null; recovery_nonce: string | null; recovery_auth_tag: string | null;
    }>(
      `select c.recovery_ciphertext, c.recovery_nonce, c.recovery_auth_tag
       from users actor
       join users subject on subject.organization_id = actor.organization_id
         and subject.id = $2 and subject.role = 'learner' and subject.status in ('active', 'disabled')
       left join user_credentials c on c.user_id = subject.id
       where actor.id = $1 and actor.role = 'manager' and actor.status = 'active'`,
      [managerId, accountId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("MANAGER_ACCOUNT_NOT_FOUND");
    const pin = decryptRecoverableSecret(row);
    if (!/^\d{6}$/.test(pin)) throw new Error("MANAGER_ACCOUNT_PIN_DECRYPT_FAILED");
    return pin;
  }

  async revealAccountCredential(managerId: string, accountId: string): Promise<{ credential: string; kind: "pin" | "password" }> {
    const result = await this.pool.query<{
      role: AccountRole;
      recovery_ciphertext: string | null;
      recovery_nonce: string | null;
      recovery_auth_tag: string | null;
    }>(
      `select subject.role, c.recovery_ciphertext, c.recovery_nonce, c.recovery_auth_tag
       from users actor
       join users subject on subject.organization_id = actor.organization_id
         and subject.id = $2 and subject.status in ('active', 'disabled')
       left join user_credentials c on c.user_id = subject.id
       where actor.id = $1 and actor.role = 'manager' and actor.status = 'active'`,
      [managerId, accountId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("MANAGER_ACCOUNT_NOT_FOUND");
    let credential: string;
    try {
      credential = decryptRecoverableSecret(row);
    } catch (error) {
      if (error instanceof Error && error.message === "MANAGER_ACCOUNT_PIN_UNAVAILABLE") throw new Error("MANAGER_ACCOUNT_CREDENTIAL_UNAVAILABLE");
      if (error instanceof Error && error.message === "MANAGER_ACCOUNT_PIN_DECRYPT_FAILED") throw new Error("MANAGER_ACCOUNT_CREDENTIAL_DECRYPT_FAILED");
      throw error;
    }
    const kind = row.role === "learner" ? "pin" : "password";
    if ((kind === "pin" && !/^\d{6}$/.test(credential)) || (kind === "password" && credential.length < 8)) {
      throw new Error("MANAGER_ACCOUNT_CREDENTIAL_DECRYPT_FAILED");
    }
    return { credential, kind };
  }

  private accountView(account: {
    id: string;
    display_name: string;
    email: string | null;
    role: AccountRole;
    status: string;
    created_at: Date;
    cefr?: CefrLevel | null;
    placement_score?: string | null;
  }): ManagerAccountView {
    return {
      id: account.id,
      displayName: account.display_name,
      email: account.email,
      role: account.role,
      status: account.status,
      createdAt: account.created_at.toISOString(),
      cefr: account.cefr ?? null,
      placementScore: account.placement_score == null ? null : Number(account.placement_score)
    };
  }
}

async function applyDueScheduledLevelChanges(pool: Pool, learnerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await applyScheduledLevelChanges(client, learnerId, new Date());
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function applyScheduledLevelChanges(
  client: PoolClient,
  learnerId: string,
  appliedAt: Date,
  assessmentAttemptId?: string
): Promise<void> {
  const due = await client.query<{
    id: string; assessment_attempt_id: string; from_cefr: CefrLevel; to_cefr: CefrLevel;
    approved_by: string; reason: string | null; evidence: Record<string, unknown>; organization_id: string;
  }>(
    `select change.id, change.assessment_attempt_id, change.from_cefr, change.to_cefr,
            change.approved_by, change.reason, change.evidence, learner.organization_id
     from scheduled_level_changes change
     join users learner on learner.id = change.learner_id
     where change.learner_id = $1 and change.status = 'scheduled' and change.effective_at <= $2
       and ($3::uuid is null or change.assessment_attempt_id = $3)
     order by change.effective_at for update of change`,
    [learnerId, appliedAt, assessmentAttemptId ?? null]
  );
  for (const change of due.rows) {
    await client.query(
      "update enrollments set cefr = $2, cefr_approved = true where learner_id = $1",
      [learnerId, change.to_cefr]
    );
    // Reaching C1 through the real approved level-up lifecycle is the only
    // production path that unlocks the fixed Pass Course Form A.
    if (change.to_cefr === "C1") {
      await client.query(
        `insert into pass_course_readiness (learner_id, organization_id, cefr_ready, reset_at, reset_reason, updated_at)
         values ($1, $2, true, null, null, now())
         on conflict (learner_id) do update
         set cefr_ready = true, reset_at = null, reset_reason = null, updated_at = now()`,
        [learnerId, change.organization_id]
      );
    }
    await client.query(
      "update scheduled_level_changes set status = 'applied', applied_at = $2 where id = $1 and status = 'scheduled'",
      [change.id, appliedAt]
    );
    await client.query(
      `insert into audit_events
         (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
       values ($1, $2, $3, 'assessment.level-up.applied', 'assessment_attempt', $4, $5::jsonb, $6)`,
      [randomUUID(), change.organization_id, change.approved_by, change.assessment_attempt_id,
        JSON.stringify({ from: change.from_cefr, to: change.to_cefr, reason: change.reason, evidence: change.evidence }), randomUUID()]
    );
  }
}

/**
 * Pays a correct lesson part (+5 on the first try, one less per retry) only for
 * the first correct answer of that part: answering the same part again later
 * (new request, another attempt after a correct answer) never adds points.
 */
async function awardLessonPartPoints(client: PoolClient, learnerId: string, attemptId: string, points: number): Promise<void> {
  await lockLearnerRewards(client, learnerId);
  await client.query(
    `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
     select $1, $2, null, $4, 'lesson_part', attempt.id
     from lesson_part_attempts attempt
     where attempt.id = $3 and attempt.learner_id = $2
       and not exists (
         select 1 from reward_events paid
         join lesson_part_attempts earlier on earlier.id = paid.source_id
         where paid.learner_id = $2 and paid.source_type = 'lesson_part' and paid.badge_id is null and paid.points > 0
           and earlier.lesson_id = attempt.lesson_id and earlier.part_code = attempt.part_code)
     on conflict do nothing`,
    [randomUUID(), learnerId, attemptId, points]
  );
  await recordSeasonMilestones(client, learnerId);
}

/**
 * Serialises reward work for one learner until the surrounding transaction ends,
 * so parallel requests (double click, retry, two tabs) cannot award the same
 * activity twice or collide on the reward ledger's business keys.
 */
async function lockLearnerRewards(client: PoolClient, learnerId: string): Promise<void> {
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [`rewards:${learnerId}`]);
}

/** Runs `work` in its own transaction holding the learner's reward lock. */
async function withLearnerRewardLock<T>(pool: Pool, learnerId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await lockLearnerRewards(client, learnerId);
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Mini game results that earn points per learner per day (Asia/Ho_Chi_Minh). Further plays earn 0. */
export const PAID_GAME_RESULTS_PER_DAY = 3;

/**
 * One activity earns points once. When the same action was recorded twice (a
 * historical race), only the earliest row of that reference is paid.
 */
const FIRST_ACTIVITY_OF_REFERENCE_SQL = `(a.reference_id is null or not exists (
  select 1 from activities twin
  where twin.learner_id = a.learner_id and twin.activity_type = a.activity_type
    and twin.reference_type = a.reference_type and twin.reference_id = a.reference_id and twin.id <> a.id
    and ((twin.occurred_at, twin.id) < (a.occurred_at, a.id)
      or exists (select 1 from reward_events paid where paid.learner_id = twin.learner_id
        and paid.source_type = 'activity_points' and paid.source_id = twin.id and paid.badge_id is null))))`;

/**
 * Applies the reward rules of the monthly product to the learner's recorded
 * activities. Points (lifetime ledger, reward_events):
 * - new lesson completed the first time +10; the Friday review ("Ôn tuần") +15
 * - valid Season turn +2; micro lesson +5
 * - mini game +5 when the score is at least half of the maximum, for at most
 *   three paid results a day (more plays are recorded but earn 0)
 * - monthly final exam submitted +15; placement / level-up / exit test +10
 * - whole month of the monthly calendar completed (every new and review lesson) +20, once a month
 * Lesson parts (+5…+1, first correct answer only) are paid by awardLessonPartPoints.
 * Badges are awarded once each and kept forever, with a bell notification; a badge
 * not earned yet uses the threshold of the learner's current level. A newly
 * reached Season of the current level's ladder (points earned in the level) is
 * recorded once per level (bell + congratulation modal).
 */
async function syncLearnerRewards(db: Pool | PoolClient, learnerId: string): Promise<void> {
  if (!("release" in db)) {
    await withLearnerRewardLock(db, learnerId, (client) => syncLearnerRewards(client, learnerId));
    return;
  }
  await lockLearnerRewards(db, learnerId);
  await db.query(
    `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
     select gen_random_uuid(), a.learner_id, null,
       case
         when a.activity_type = 'lesson' then case when exists (
             select 1 from month_lessons ml join month_frameworks mf on mf.id = ml.framework_id
             where ml.lesson_id = a.reference_id and ${MONTH_LESSON_IS_REVIEW_SQL}) then 15 else 10 end
         when a.activity_type = 'micro_lesson' then 5
         when a.activity_type = 'coach' then 2
         when a.activity_type = 'assessment' then case when exists (
             select 1 from assessment_attempts aa
             join assessment_versions av on av.id = aa.assessment_version_id
             join assessment_definitions ad on ad.id = av.definition_id
             where aa.id = a.reference_id and ad.kind = 'final') then 15 else 10 end
         else 0 end,
       'activity_points', a.id
     from activities a
     where a.learner_id = $1
       and a.activity_type <> 'game'
       and (a.activity_type <> 'coach' or coalesce(
         (a.evidence->>'countsTowardGoal')::boolean,
         (a.evidence->>'relevant')::boolean,
         false
       ))
       and not (a.activity_type = 'coach' and exists (
         select 1 from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
         where ct.id = a.reference_id and coalesce(cs.scenario->>'kind', 'practice') = 'level_up'
       ))
       and not exists (select 1 from reward_events re where re.learner_id = a.learner_id
         and re.source_type = 'activity_points' and re.source_id = a.id and re.badge_id is null)
       and ${FIRST_ACTIVITY_OF_REFERENCE_SQL}
     on conflict (learner_id, source_type, source_id) where badge_id is null do nothing`,
    [learnerId]
  );
  // Mini games: +5 for a result of at least 50 % of its maximum, the first three
  // such results of each Vietnam day. Results already paid keep their slot.
  await db.query(
    `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
     select gen_random_uuid(), ranked.learner_id, null, 5, 'activity_points', ranked.id
     from (
       select a.id, a.learner_id, paid.id is not null as paid,
              row_number() over (
                partition by (a.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date
                order by (paid.id is not null) desc, a.occurred_at, a.id
              ) as position
       from activities a
       left join reward_events paid on paid.learner_id = a.learner_id and paid.source_type = 'activity_points'
         and paid.source_id = a.id and paid.badge_id is null and paid.points > 0
       where a.learner_id = $1 and a.activity_type = 'game'
         and (paid.id is not null or (
           jsonb_typeof(a.evidence->'score') = 'number' and jsonb_typeof(a.evidence->'maxScore') = 'number'
           and (a.evidence->>'maxScore')::numeric > 0
           and (a.evidence->>'score')::numeric * 2 >= (a.evidence->>'maxScore')::numeric
           and not exists (select 1 from reward_events done where done.learner_id = a.learner_id
             and done.source_type = 'activity_points' and done.source_id = a.id and done.badge_id is null)
           and ${FIRST_ACTIVITY_OF_REFERENCE_SQL}))
     ) ranked
     where not ranked.paid and ranked.position <= $2
     on conflict (learner_id, source_type, source_id) where badge_id is null do nothing`,
    [learnerId, PAID_GAME_RESULTS_PER_DAY]
  );

  const state = await learnerSeasonState(db, learnerId);
  if (!state) return;
  const cefr = state.cefr;
  const [lessons, calendar, coach, words, firstTry, finals, facts] = await Promise.all([
    db.query<{ count: string }>("select count(*)::text as count from progress_records where learner_id = $1 and status = 'completed'", [learnerId]),
    learnerMonthlyCalendarProgress(db, learnerId),
    db.query<{ count: string }>(`select count(*)::text as count from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
      where cs.learner_id = $1 and ct.speaker = 'learner' and coalesce(cs.scenario->>'kind', 'practice') = 'practice'
        and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true))`, [learnerId]),
    db.query<{ count: string }>(`select count(distinct word)::text as count from coach_turns ct
      join coach_sessions cs on cs.id = ct.session_id
      cross join lateral jsonb_array_elements_text(coalesce(ct.feedback->'usedWords', '[]'::jsonb)) word
      where cs.learner_id = $1 and coalesce(cs.scenario->>'kind', 'practice') = 'practice'
        and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true))`, [learnerId]),
    db.query<{ evidence: Record<string, unknown> }>(
      "select evidence from progress_records where learner_id = $1 and status = 'completed'", [learnerId]
    ),
    // Approved monthly finals: total of the four skills and the weakest skill (monthly pass rule).
    db.query<{ total: number; sections: number; weakest: number }>(
      `select sum(s.score)::float8 as total,
              count(distinct s.section) filter (where s.section in ('listening', 'reading', 'writing', 'speaking'))::int as sections,
              min(s.score)::float8 as weakest
       from assessment_attempts aa
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'final'
       join assessment_scores s on s.attempt_id = aa.id
       where aa.learner_id = $1 and aa.status = 'approved'
       group by aa.id`, [learnerId]
    ),
    db.query<{ today: string; holidays: string[] | null }>(
      `select organization_system_date(u.organization_id)::text as today,
              (select array_agg(h.holiday_date::text) from organization_holidays h where h.organization_id = u.organization_id) as holidays
       from users u where u.id = $1`, [learnerId]
    )
  ]);
  const monthly = monthlyCalendarAchievements(calendar);
  for (const monthId of monthly.completedMonthIds) {
    await db.query(
      `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
       values (gen_random_uuid(), $1, null, 20, 'full_month_bonus', $2)
       on conflict (learner_id, source_type, source_id) where badge_id is null do nothing`,
      [learnerId, monthId]
    );
  }
  // Streak, whole weeks and on-time reviews count inside the current level only: their
  // thresholds drop at B1, so lifetime counts would hand them out on arrival. The other
  // counters are lifetime (their thresholds never drop, so arrival alone never meets them).
  const levelStartDate = state.levelStartedAt
    ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).format(state.levelStartedAt) : null;
  const inLevel = calendar.filter((day) => !levelStartDate
    || (day.lessonDate !== null && day.lessonDate >= levelStartDate && (!cefr || !day.cefr || day.cefr === cefr)));
  const levelCalendar = monthlyCalendarAchievements(inLevel);
  const today = facts.rows[0]?.today;
  const holidayDates = new Set(facts.rows[0]?.holidays ?? []);
  for (const month of new Set(inLevel.flatMap((day) => day.lessonDate ? [day.lessonDate.slice(0, 7)] : []))) {
    for (const holiday of mergedVietnamHolidays(month, [])) holidayDates.add(holiday.date);
  }
  const streak = longestScheduledLessonStreak(
    inLevel.flatMap((day) => day.lessonDate ? [{ date: day.lessonDate, completedOnTime: day.completed && day.onTime }] : []),
    { holidays: holidayDates, ...(today ? { today } : {}) }
  );
  const finalThreshold = rewardBadgeThreshold("monthly_final_score", cefr);
  const earned = new Set<string>();
  if (Number(lessons.rows[0]?.count ?? 0) >= rewardBadgeThreshold("starter", cefr)) earned.add("starter");
  if (streak >= rewardBadgeThreshold("streak", cefr)) earned.add("streak");
  if (levelCalendar.completeWeeks >= rewardBadgeThreshold("week_complete", cefr)) earned.add("week_complete");
  if (levelCalendar.onTimeReviews >= rewardBadgeThreshold("friday", cefr)) earned.add("friday");
  if (Number(coach.rows[0]?.count ?? 0) >= rewardBadgeThreshold("coach_friend", cefr)) earned.add("coach_friend");
  if (Number(words.rows[0]?.count ?? 0) >= rewardBadgeThreshold("wordsmith", cefr)) earned.add("wordsmith");
  if (firstTry.rows.filter((row) => isFirstTryLesson(row.evidence)).length >= rewardBadgeThreshold("first_try", cefr)) earned.add("first_try");
  if (finals.rows.some((row) => finalThreshold === "passed"
    ? Number(row.total) >= 70 && Number(row.sections) === 4 && Number(row.weakest) >= 15
    : Number(row.total) >= finalThreshold)) earned.add("monthly_final_score");

  for (const badgeKey of earned) {
    if (state.badgeKeys.has(badgeKey)) continue;
    // A badge is awarded once and kept forever; the bell notification is sent with that first award only.
    await db.query(
      `with awarded as (
         insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
         select gen_random_uuid(), $1, b.id, 0, 'achievement', $1
         from users u join badges b on b.organization_id = u.organization_id and b.badge_key = $2
         where u.id = $1
         on conflict (learner_id, badge_id) where badge_id is not null do nothing
         returning badge_id
       )
       select notify_inbox(b.organization_id, 'learner', $1, 'badge:' || b.badge_key, 'badge_earned', b.label)
       from awarded join badges b on b.id = awarded.badge_id`,
      [learnerId, badgeKey]
    );
  }
  await recordSeasonMilestones(db, learnerId);
}

/** One scheduled day of a monthly calendar the learner studies, with the learner's completion. */
export interface MonthlyCalendarLessonProgress {
  monthId: string;
  frameworkId: string;
  lessonCount: number;
  kind: "new" | "review";
  lessonDate: string | null;
  completed: boolean;
  /** Completed on its scheduled (organisation) date. */
  onTime: boolean;
  /** CEFR level of the monthly calendar. */
  cefr?: CefrLevel | null;
}

/**
 * Every scheduled day (new lessons and Friday reviews) of the monthly calendars
 * the learner has started, with completion. A scheduled day whose lesson is not
 * approved yet counts as not completed.
 */
async function learnerMonthlyCalendarProgress(db: Pool | PoolClient, learnerId: string): Promise<MonthlyCalendarLessonProgress[]> {
  const { rows } = await db.query<{
    month_id: string; framework_id: string; cefr: CefrLevel | null; lesson_count: number; kind: string | null; lesson_date: string | null; completed: boolean; on_time: boolean;
  }>(
    `select pm.id as month_id, mf.id as framework_id, mf.cefr, pm.lesson_count, spec.kind, spec.lesson_date::text as lesson_date,
            pr.id is not null as completed,
            coalesce(pr.completed_on = spec.lesson_date, false) as on_time
     from users u
     join program_months pm on pm.organization_id = u.organization_id
     join month_frameworks mf on mf.program_month_id = pm.id and mf.status = 'approved' and mf.published_at is not null
     cross join lateral (
       select item->>'kind' as kind, item->>'lessonNumber' as lesson_number,
              coalesce(
                (select scheduled.lesson_date from month_lessons scheduled
                 where scheduled.framework_id = mf.id and scheduled.lesson_number::text = item->>'lessonNumber' limit 1),
                case when item->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (item->>'date')::date end
              ) as lesson_date
       from jsonb_array_elements(case when jsonb_typeof(mf.curriculum_contract->'daySpecs') = 'array'
         then mf.curriculum_contract->'daySpecs' else '[]'::jsonb end) item
     ) spec
     left join month_lessons ml on ml.framework_id = mf.id and ml.lesson_number::text = spec.lesson_number
       and ml.status = 'approved' and ml.lesson_id is not null and ml.scope_hash = mf.scope_hash
     left join progress_records pr on pr.lesson_id = ml.lesson_id and pr.learner_id = u.id and pr.status = 'completed'
     where u.id = $1
       and exists (
         select 1 from month_lessons started
         join progress_records done on done.lesson_id = started.lesson_id
         where started.framework_id = mf.id and done.learner_id = u.id and done.status = 'completed'
       )`,
    [learnerId]
  );
  return rows.map((row) => ({
    monthId: row.month_id, frameworkId: row.framework_id, lessonCount: Number(row.lesson_count),
    kind: row.kind === "review" ? "review" : "new", lessonDate: row.lesson_date, completed: row.completed, onTime: row.on_time,
    cefr: row.cefr
  }));
}

/** Calendar weeks shorter than this (a month starting on a Friday, ending on a Monday) do not count as a whole week. */
export const MIN_LESSONS_FOR_WEEK_BADGE = 3;

/**
 * Monthly-calendar achievements: months whose every scheduled day is completed
 * (+20 bonus), calendar weeks (Mon–Sun) of at least three lessons all completed
 * ("Tuần trọn vẹn") and Friday reviews completed on their own day ("Ôn tập đúng hẹn").
 */
export function monthlyCalendarAchievements(lessons: readonly MonthlyCalendarLessonProgress[]): {
  completedMonthIds: string[]; weekComplete: boolean; fridayOnTime: boolean; completeWeeks: number; onTimeReviews: number;
} {
  const frameworks = new Map<string, MonthlyCalendarLessonProgress[]>();
  const weeks = new Map<string, MonthlyCalendarLessonProgress[]>();
  for (const lesson of lessons) {
    frameworks.set(lesson.frameworkId, [...(frameworks.get(lesson.frameworkId) ?? []), lesson]);
    if (lesson.lessonDate) {
      const key = `${lesson.frameworkId}:${isoWeekStart(lesson.lessonDate)}`;
      weeks.set(key, [...(weeks.get(key) ?? []), lesson]);
    }
  }
  const completedMonthIds = new Set<string>();
  for (const days of frameworks.values()) {
    const first = days[0]!;
    if (days.length >= first.lessonCount && days.every((day) => day.completed)) completedMonthIds.add(first.monthId);
  }
  const completeWeeks = [...weeks.values()].filter((days) => days.length >= MIN_LESSONS_FOR_WEEK_BADGE && days.every((day) => day.completed)).length;
  const onTimeReviews = new Set(lessons.filter((lesson) => lesson.kind === "review" && lesson.onTime)
    .map((lesson) => `${lesson.frameworkId}:${lesson.lessonDate ?? ""}`)).size;
  return {
    completedMonthIds: [...completedMonthIds],
    weekComplete: completeWeeks > 0,
    fridayOnTime: onTimeReviews > 0,
    completeWeeks,
    onTimeReviews
  };
}

function isoWeekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/**
 * Records each Season the learner reached once per CEFR level (every level has
 * its own ladder). The highest newly reached Season gets a bell notification and
 * waits for its congratulation modal; Seasons passed on the way in the same step
 * are not celebrated separately.
 */
async function recordSeasonMilestones(client: PoolClient, learnerId: string): Promise<void> {
  const state = await learnerSeasonState(client, learnerId);
  if (!state?.cefr) return;
  const level = state.season.level;
  if (level < 2) return;
  const inserted = await client.query<{ season_level: number }>(
    `insert into learner_season_milestones (learner_id, cefr, season_level)
     select $1, $2, level from generate_series(2, $3::int) as level
     on conflict do nothing
     returning season_level`,
    [learnerId, state.cefr, level]
  );
  if (!inserted.rowCount) return;
  const highest = Math.max(...inserted.rows.map((item) => item.season_level));
  await client.query(
    `update learner_season_milestones set celebrated_at = now()
     where learner_id = $1 and cefr = $2 and season_level < $3 and celebrated_at is null`,
    [learnerId, state.cefr, highest]
  );
  await client.query(
    "select notify_inbox($1, 'learner', $2, $3, 'season_reached', $4)",
    [state.organizationId, learnerId, `season:${state.cefr}:${highest}`, `${highest}:${state.cefr}`]
  );
}

function isFirstTryLesson(record: Record<string, unknown>): boolean {
  const evidence = record.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return false;
  return (["listening", "reading", "writing", "speaking"] as const).every((key) => {
    const item = (evidence as Record<string, unknown>)[key];
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const value = item as { attempts?: unknown; score?: unknown };
    return value.attempts === 1 && typeof value.score === "number" && value.score >= 80;
  });
}

export function createRepositories(pool: Pool) {
  return {
    identity: new IdentityRepository(pool),
    learning: new LearningRepository(pool),
    assessments: new AssessmentRepository(pool),
    coach: new CoachRepository(pool),
    content: new ContentRepository(pool),
    monthlyContent: new MonthlyContentRepository(pool),
    engagement: new EngagementRepository(pool),
    notifications: new NotificationRepository(pool),
    files: new FileRepository(pool),
    aiRuns: new AiRunRepository(pool),
    jobs: new JobRepository(pool),
    manager: new ManagerRepository(pool)
  };
}

export type DatabaseRepositories = ReturnType<typeof createRepositories>;

/** Generation auto-fix notes stored on a level-up blueprint (`levelFormQuality.autoFixed`). */
function levelFormAutoFixed(blueprint: StoredAssessmentDefinition): { autoFixed?: string[] } {
  const notes = (blueprint as { levelFormQuality?: { autoFixed?: unknown } }).levelFormQuality?.autoFixed;
  const list = Array.isArray(notes) ? notes.filter((note): note is string => typeof note === "string" && Boolean(note.trim())) : [];
  return list.length ? { autoFixed: list } : {};
}
