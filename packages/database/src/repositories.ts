import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { buildLevelReadiness as calculateLevelReadiness, nextEffectiveMonday, passesLevelUpExam, createLevelRetryPlan, type LevelReadinessMetrics, type LevelReadinessThresholds } from "@e4s/domain/progression";
import { validateGenerationFindingsForPublication, validateLessonPublication } from "@e4s/domain/content";
import { lessonCompletionActivity } from "@e4s/domain/learning";
import { generationFindingsFromPayload } from "./generation-findings.js";
import type {
  AccountRole,
  AudioArtifactInput,
  AudioArtifactView,
  AssessmentDeviceEvidence,
  AssessmentEvidenceType,
  AssessmentKind,
  AssessmentMediaEvidence,
  AssessmentDeletionRequestView,
  AssessmentLevelFormDeleteView,
  AssessmentLevelFormDetailView,
  AssessmentLevelFormUpdateInput,
  AssessmentLevelChangeInput,
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
  LessonPartAttemptEvidenceInput,
  LessonPartAttemptView,
  LessonPartCode,
  LessonProgressView,
  PartEvidence,
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
  micro_grading: prototypePromptDefaults.mgrade,
  coach_dialogue: prototypePromptDefaults.coach,
  weekly_practice_grading: prototypePromptDefaults.grade
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
import type { StoredAssessmentDefinition } from "./assessment-blueprints.js";
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

export interface LearnerProfileRecord {
  profile: Partial<LearnerProfileData>;
  completedProfile?: Partial<LearnerProfileData>;
  draftAvailable?: boolean;
  version: number;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface LearnerLessonRecord {
  id: string;
  title: string;
  dayNumber: number;
  weekNumber: number;
  weekTopic: string;
  cefr: CefrLevel;
  content: LessonContent & { durationMinutes?: number };
  progress: LessonProgressView;
  lock: LessonLockView | null;
}

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
  kind: "placement" | "level_up";
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
  | { state: "restart_required"; attempt: null };

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
    }>(
      `select u.id, u.display_name, u.email, u.avatar, u.role, u.status, c.credential_hash
       from users u join user_credentials c on c.user_id = u.id
       where lower(u.email) = lower($1) and u.status = 'active'
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
          credentialHash: row.credential_hash
        }
      : null;
  }

  async requestStaffPasswordHelp(email: string): Promise<void> {
    const note = "Người vận hành báo quên mật khẩu và cần Quản lý đặt lại.";
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const subject = await client.query<{ id: string; organization_id: string }>(
        `select id, organization_id from users
         where lower(email) = lower($1) and role = 'operator' and status = 'active'
         limit 1 for update`,
        [email]
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
           greatest(1, least(p.week_count, ((current_date - p.start_date) / 7) + 1))
         )
       where e.learner_id = $1
       limit 1`,
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
    const [identity, profileResult, levelup] = await Promise.all([
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
         where aa.learner_id = $1 order by aa.started_at desc limit 1`, [learnerId]
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
    const state = profile._operator && typeof profile._operator === "object" && !Array.isArray(profile._operator)
      ? profile._operator as Record<string, unknown> : {};
    const history = Array.isArray(state.levelHistory) ? state.levelHistory : [];
    const latest = history.at(-1);
    const latestChangedAt = latest && typeof latest === "object" && !Array.isArray(latest)
      && typeof (latest as Record<string, unknown>).changedAt === "string"
      ? new Date(String((latest as Record<string, unknown>).changedAt)) : null;
    const newLevel = Boolean(latestChangedAt && Number.isFinite(latestChangedAt.getTime())
      && Date.now() - latestChangedAt.getTime() < 30 * 24 * 60 * 60 * 1000);
    const latestLevel = latest && typeof latest === "object" && !Array.isArray(latest)
      && typeof (latest as Record<string, unknown>).to === "string"
      ? (latest as Record<string, unknown>).to as CefrLevel : null;
    const candidateKind = enrollment?.cefr === "C1" ? "top-level-redirect" : newLevel ? "new-level-announcement" : "normal";
    const candidateId = candidateKind === "top-level-redirect"
      ? `top-level:${enrollment?.cefr ?? "C1"}:${latestChangedAt?.toISOString() ?? "current"}`
      : candidateKind === "new-level-announcement" && latestLevel && latestChangedAt
        ? `level-up:${latestLevel}:${latestChangedAt.toISOString()}` : undefined;
    const lifecycle = learnerLifecycleState(profile);
    const acknowledged = Boolean(candidateId && lifecycle.rewardAnnouncementAcknowledged === candidateId);
    const announcementKind = acknowledged ? "normal" : candidateKind;
    const seasonName = seasonNameForDate(new Date());
    return {
      levelUpPhase,
      monthlyGoal: typeof profile.monthlyGoal === "string" && profile.monthlyGoal.trim() ? profile.monthlyGoal : null,
      rewardAnnouncement: {
        kind: announcementKind,
        points,
        nextPoints: points < 60 ? 60 : null,
        seasonName,
        level: (newLevel ? latestLevel : enrollment?.cefr) ?? null,
        ...(announcementKind === "normal" ? {} : {
          ...(candidateId ? { announcementId: candidateId } : {}),
          source: "genuine" as const,
          rule: announcementKind === "top-level-redirect"
            ? "Mức C1 là mức cao nhất của lộ trình hiện tại."
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
              (p.start_date + ((pw.week_number - 1) * 7 + l.day_number - 1)) > current_date as opens_later,
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

  async findLesson(learnerId: string, lessonId: string): Promise<LearnerLessonRecord | null> {
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
              (p.start_date + ((pw.week_number - 1) * 7 + l.day_number - 1)) > current_date as opens_later,
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
    const row = result.rows[0];
    if (!row) return null;
    const lesson = mapLessonRow(row);
    const appeals = await this.pool.query<{ part_code: LessonPartCode; status: "pending" | "accepted" | "rejected"; resolution: string | null }>(
      `select distinct on (part_code) part_code, status, resolution from lesson_part_appeals
       where learner_id = $1 and lesson_id = $2
       order by part_code, created_at desc`,
      [learnerId, lessonId]
    );
    const submittedSpeaking = lesson.progress.evidence.speaking?.status === "submitted"
      && Boolean(lesson.progress.evidence.speaking.artifactKey);
    if (!appeals.rowCount && !submittedSpeaking) return lesson;
    const completedPartCodes = Array.from(new Set([
      ...lesson.progress.completedPartCodes,
      ...(submittedSpeaking ? ["speaking" as const] : []),
      ...appeals.rows.filter(appeal => appeal.status === "pending" || appeal.status === "accepted").map((appeal) => appeal.part_code)
    ])) as LessonPartCode[];
    const evidence = { ...lesson.progress.evidence };
    for (const appeal of appeals.rows) {
      const current = evidence[appeal.part_code];
      evidence[appeal.part_code] = {
        attempts: current?.attempts ?? 0,
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
    if (input.progress.status === "completed") {
      const [previousActivities, lessonDuration] = await Promise.all([
        this.pool.query<{ count: string }>(
          `select count(*)::text as count from activities
           where learner_id = $1 and reference_type = 'lesson' and reference_id = $2
             and activity_type in ('lesson', 'lesson_review')`,
          [input.learnerId, input.lessonId]
        ),
        this.pool.query<{ duration_minutes: string | null }>(
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
      await this.pool.query(
        `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
         values ($1, $2, $3, 'lesson', $4, $5, $6::jsonb)`,
        [
          randomUUID(), input.learnerId, activity.activityType, input.lessonId, activity.minutes,
          JSON.stringify({ score: input.progress.score ?? null, review: activity.activityType === "lesson_review" })
        ]
      );
      await syncLearnerRewards(this.pool, input.learnerId);
    }
    return mapProgress(row.status, row.score, row.evidence, row.updated_at);
  }

  async submitLessonPartAttempt(input: {
    learnerId: string;
    lessonId: string;
    partCode: LessonPartCode;
    requestId: string;
    evidence: LessonPartAttemptEvidenceInput;
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
      const duplicate = await client.query<{
        id: string; attempt_number: number; status: PartEvidence["status"]; answer: string | null;
        score: string | null; feedback: string | null; artifact_key: string | null;
      }>(
        `select id, attempt_number, status, answer, score::text, feedback, artifact_key
         from lesson_part_attempts where learner_id = $1 and request_key = $2`,
        [input.learnerId, input.requestId]
      );
      const existing = duplicate.rows[0];
      if (existing) {
        attemptId = existing.id;
        storedEvidence = mapPartEvidence(existing);
        await client.query("commit");
      } else {
        const count = await client.query<{ count: string }>(
          `select count(*)::text as count from lesson_part_attempts
           where learner_id = $1 and lesson_id = $2 and part_code = $3`,
          [input.learnerId, input.lessonId, input.partCode]
        );
        const attemptNumber = Number(count.rows[0]?.count ?? 0) + 1;
        const graded = gradeLessonPart(part.code, part.content, input.evidence, attemptNumber);
        const inserted = await client.query<{
          id: string; attempt_number: number; status: PartEvidence["status"]; answer: string | null;
          score: string | null; feedback: string | null; artifact_key: string | null;
        }>(
          `insert into lesson_part_attempts
             (id, learner_id, lesson_id, part_code, request_key, attempt_number, status, answer, score, feedback, artifact_key)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           on conflict (learner_id, request_key) do nothing
           returning id, attempt_number, status, answer, score::text, feedback, artifact_key`,
          [randomUUID(), input.learnerId, input.lessonId, input.partCode, input.requestId, attemptNumber,
            graded.status, input.evidence.answer ?? null, graded.score, graded.feedback, input.evidence.artifactKey ?? null]
        );
        const row = inserted.rows[0];
        if (!row) {
          const raced = await client.query<{
            id: string; attempt_number: number; status: PartEvidence["status"]; answer: string | null;
            score: string | null; feedback: string | null; artifact_key: string | null;
          }>(
            `select id, attempt_number, status, answer, score::text, feedback, artifact_key
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
          const mergedEvidence = { ...currentEvidence, [input.partCode]: storedEvidence };
          // A persisted Speaking upload is the learner's terminal action even when
          // automatic scoring is unavailable. Self-writing remains pending review.
          const partFinished = ["correct", "wrong_exhausted"].includes(storedEvidence.status ?? "")
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
          if (storedEvidence.status === "correct" && storedEvidence.score && storedEvidence.score > 0) {
            await client.query(
              `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
               values ($1, $2, null, $4, 'lesson_part', $3)
               on conflict do nothing`,
              [randomUUID(), input.learnerId, attemptId, Math.max(1, 6 - storedEvidence.attempts)]
            );
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

  async appealLessonPart(input: {
    learnerId: string;
    lessonId: string;
    partCode: LessonPartCode;
    reason: string;
  }): Promise<LessonPartAppealView | null> {
    const lesson = await this.findLesson(input.learnerId, input.lessonId);
    if (!lesson || !lesson.content.parts.some((part) => part.code === input.partCode)) return null;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`${input.learnerId}:${input.lessonId}:${input.partCode}`]);
      const existing = await client.query<{ id: string; status: "pending" | "accepted" | "rejected"; created_at: Date; reason: string }>(
        `select id, status, created_at, reason from lesson_part_appeals
         where learner_id = $1 and lesson_id = $2 and part_code = $3
         order by created_at asc limit 1`,
        [input.learnerId, input.lessonId, input.partCode]
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
        `insert into lesson_part_appeals (id, learner_id, lesson_id, part_code, reason)
         values ($1, $2, $3, $4, $5)
         returning id, status, created_at, reason`,
        [randomUUID(), input.learnerId, input.lessonId, input.partCode, input.reason]
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("LESSON_APPEAL_NOT_PERSISTED");
      const current = lesson.progress.evidence[input.partCode];
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
    partCode: LessonPartCode
  ): Promise<LessonPartAppealView | null> {
    const lesson = await this.findLesson(learnerId, lessonId);
    if (!lesson) return null;
    const result = await this.pool.query<{
      status: "pending" | "accepted" | "rejected";
      reason: string;
      created_at: Date;
    }>(
      `select status, reason, created_at from lesson_part_appeals
       where learner_id = $1 and lesson_id = $2 and part_code = $3
       order by created_at asc limit 1`,
      [learnerId, lessonId, partCode]
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

    const settingsResult = await this.pool.query<{ level_up: Partial<LevelReadinessThresholds> | null }>(
      `select os.configuration->'levelUp' as level_up
       from users u left join organization_settings os on os.organization_id = u.organization_id
       where u.id = $1`, [learnerId]
    );
    const configured = settingsResult.rows[0]?.level_up ?? {};
    const thresholds: LevelReadinessThresholds = {
      days: Number(configured.days ?? 14), lessons: Number(configured.lessons ?? 90),
      firstTry: Number(configured.firstTry ?? 75), submission: Number(configured.submission ?? 80),
      coach: Number(configured.coach ?? 4), coachTurns: Number(configured.coachTurns ?? 6),
      wrong: Number(configured.wrong ?? 30), minParts: Number(configured.minParts ?? 4)
    };

    const [reward, weeks, study, activity, badgeRoadmap, coach, practice, assessments, availability, firstTry] = await Promise.all([
      this.pool.query<{ points: string; badges: Array<{ key: string; label: string }> }>(
        `select coalesce(sum(re.points), 0)::text as points,
                coalesce(jsonb_agg(distinct jsonb_build_object('key', b.badge_key, 'label', b.label))
                  filter (where b.id is not null), '[]'::jsonb) as badges
         from reward_events re left join badges b on b.id = re.badge_id
         where re.learner_id = $1`, [learnerId]
      ),
      this.pool.query<{
        week_number: number; topic: string; completed_lessons: string; total_lessons: string;
        start_date: string; today: string;
        lesson_days: Array<{ dayNumber: number; status: string | null; completedAt: string | null }>;
      }>(
        `select pw.week_number, pw.topic, p.start_date::text as start_date, current_date::text as today,
                count(pr.id) filter (where pr.status = 'completed')::text as completed_lessons,
                count(l.id)::text as total_lessons,
                coalesce(jsonb_agg(jsonb_build_object(
                  'dayNumber', l.day_number,
                  'status', pr.status,
                  'completedAt', pr.completed_at
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
         group by pw.id, p.start_date order by pw.week_number`, [learnerId, thresholds.days]
      ),
      this.pool.query<{ count: string }>(
        `select count(distinct occurred_at::date)::text as count from activities where learner_id = $1`, [learnerId]
      ),
      this.pool.query<{ activity_type: string; minutes: number; evidence: Record<string, unknown>; occurred_at: Date }>(
        `select activity_type, minutes, evidence, occurred_at
         from activities where learner_id = $1 order by occurred_at desc limit 30`, [learnerId]
      ),
      this.pool.query<{ badge_key: string; label: string; rule: { description?: string; seasonLevel?: number }; earned: boolean }>(
        `select b.badge_key, b.label, b.rule,
                exists(select 1 from reward_events re where re.badge_id = b.id and re.learner_id = $1) as earned
         from badges b
         join users u on u.organization_id = b.organization_id and u.id = $1
         order by coalesce((b.rule->>'seasonLevel')::int, 99), b.badge_key`, [learnerId]
      ),
      this.pool.query<{ turns_today: string; turns_this_week: string; turns_14_days: string; rubric_average: string | null }>(
        `select
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= current_date
             and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true)))::text as turns_today,
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= date_trunc('week', now())
             and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true)))::text as turns_this_week,
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= now() - make_interval(days => $2)
             and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true)))::text as turns_14_days,
           avg(((case when jsonb_typeof(ct.feedback->'rubric'->'meaning') = 'object' then (ct.feedback->'rubric'->'meaning'->>'score')::numeric else (ct.feedback->'rubric'->>'meaning')::numeric end)
             + (case when jsonb_typeof(ct.feedback->'rubric'->'vocabulary') = 'object' then (ct.feedback->'rubric'->'vocabulary'->>'score')::numeric else (ct.feedback->'rubric'->>'vocabulary')::numeric end)
             + (case when jsonb_typeof(ct.feedback->'rubric'->'grammar') = 'object' then (ct.feedback->'rubric'->'grammar'->>'score')::numeric else (ct.feedback->'rubric'->>'grammar')::numeric end)) / 3) filter (
             where ct.speaker = 'learner' and ct.created_at >= now() - make_interval(days => $2)
               and ct.feedback ? 'rubric'
                and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true))
           )::text as rubric_average
         from coach_sessions cs left join coach_turns ct on ct.session_id = cs.id
         where cs.learner_id = $1`, [learnerId, thresholds.days]
      ),
      this.pool.query<{ status: string; total: string | null }>(
        `select ps.status, ps.score->>'total' as total
         from practice_submissions ps where ps.learner_id = $1
           and coalesce(ps.reviewed_at, ps.submitted_at, ps.updated_at) >= now() - make_interval(days => $2)
         order by coalesce(ps.reviewed_at, ps.submitted_at, ps.updated_at) desc limit 1`, [learnerId, thresholds.days]
      ),
      this.pool.query<{
        kind: string; total_score: string; approved_level: CefrLevel | null;
        section: "listening" | "reading" | "writing" | "speaking"; section_score: string;
      }>(
        `select ad.kind, sum(s2.score) over (partition by aa.id)::text as total_score,
                dec.approved_level, s2.section, s2.score::text as section_score
         from assessment_attempts aa
         join assessment_versions av on av.id = aa.assessment_version_id
         join assessment_definitions ad on ad.id = av.definition_id
         join assessment_scores s2 on s2.attempt_id = aa.id
         left join assessment_decisions dec on dec.attempt_id = aa.id
         where aa.learner_id = $1 and ad.kind = 'placement'
           and aa.status in ('submitted', 'pending_review', 'approved')
         order by aa.submitted_at desc nulls last`, [learnerId]
      ),
      this.pool.query<{ levelup_available: boolean }>(
        `select exists(select 1 from assessment_versions av join assessment_definitions ad on ad.id = av.definition_id
             where av.status = 'published' and ad.kind = 'level_up'
               and av.blueprint->>'targetLevel' = $1) as levelup_available`,
        [nextCefr(row.cefr)]
      ),
      this.pool.query<{ evidence: { evidence?: Record<string, { attempts?: number; score?: number }> } }>(
        `select evidence from progress_records
         where learner_id = $1 and updated_at >= now() - make_interval(days => $2)`, [learnerId, thresholds.days]
      )
    ]);
    const rewards = reward.rows[0] ?? { points: "0", badges: [] };
    const points = Number(rewards.points);
    const earnedBadgeKeys = new Set(rewards.badges.map((badge) => badge.key));
    const roadmap = badgeRoadmap.rows.map((badge): BadgeRoadmapItem => ({
      key: badge.badge_key,
      label: badge.label,
      description: badge.rule.description ?? "Tiêu chí được xác định trong hệ thống",
      seasonLevel: normalizeSeasonLevel(badge.rule.seasonLevel),
      earned: badge.earned
    }));
    const coachSummary = coach.rows[0] ?? { turns_today: "0", turns_this_week: "0", turns_14_days: "0", rubric_average: null };
    const latestPractice = practice.rows[0];
    const totalLessons = weeks.rows.reduce((sum, week) => sum + Number(week.total_lessons), 0);
    const completedLessons = weeks.rows.reduce((sum, week) => sum + Number(week.completed_lessons), 0);
    const lessonCompletion = totalLessons ? completedLessons / totalLessons * 100 : 0;
    const firstTryParts = firstTry.rows.flatMap((item) => Object.values(item.evidence.evidence ?? {}));
    const firstTryCorrect = firstTryParts.filter((item) => item.attempts === 1 && (item.score === undefined || item.score >= 80)).length;
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
      weeklyPractice: Number(latestPractice?.total ?? 0),
      coachRubric: Number(coachSummary.rubric_average ?? 0),
      coachTurns: Number(coachSummary.turns_14_days),
      wrongRate,
      attemptedParts: firstTryParts.length,
      examAvailable: Boolean(availability.rows[0]?.levelup_available),
      thresholds
    });
    const badgeCounts = requiredBadgeCountsForNext(points, earnedBadgeKeys);
    const assessmentViews = buildAssessmentSnapshots(assessments.rows);
    return {
      learner: { id: row.id, displayName: row.display_name, cefr: row.cefr, profile: row.profile ?? {} },
      points,
      badges: rewards.badges,
      weeks: weeks.rows.map((week) => ({
        weekNumber: week.week_number,
        topic: week.topic,
        completedLessons: Number(week.completed_lessons),
        totalLessons: Number(week.total_lessons),
        days: buildWeekDayStatuses(week)
      })),
      studyDays: Number(study.rows[0]?.count ?? 0),
      activity: activity.rows.map((item) => ({
        type: item.activity_type,
        minutes: item.minutes,
        occurredAt: item.occurred_at.toISOString(),
        evidence: item.evidence
      })),
      season: {
        current: seasonFor(points, earnedBadgeKeys),
        next: nextSeasonFor(points, earnedBadgeKeys),
        earnedBadgeCount: badgeCounts.earned,
        requiredBadgeCount: badgeCounts.required
      },
      badgeRoadmap: roadmap,
      levelReadiness: readiness,
      stats: {
        completedLessons,
        coachTurns: Number(coachSummary.turns_this_week),
        coachTurnsToday: Number(coachSummary.turns_today),
        studyDays: Number(study.rows[0]?.count ?? 0)
      },
      assessments: assessmentViews
    };
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
    await this.pool.query(
      `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
       select $1, $2, 'micro_lesson', 'micro_lesson', $3, 5,
              jsonb_build_object('score', (progress->'attempt'->>'score')::int)
       from micro_lessons where id = $3 and learner_id = $2
       and not exists (select 1 from activities where learner_id = $2 and reference_type = 'micro_lesson' and reference_id = $3)`,
      [randomUUID(), learnerId, microLessonId]
    );
    await syncLearnerRewards(this.pool, learnerId);
    return this.findMicroLesson(learnerId, microLessonId);
  }
}

const SEASONS = [
  { key: "spring", level: 1, name: "Mùa xuân – gieo hạt", pointsRequired: 0, badges: [] },
  { key: "summer", level: 2, name: "Mùa hạ – đón nắng", pointsRequired: 60, badges: ["starter", "streak3"] },
  { key: "autumn", level: 3, name: "Mùa thu – gặt hái", pointsRequired: 180, badges: ["week_complete", "friday", "coach_friend"] },
  { key: "winter", level: 4, name: "Mùa đông – vững vàng", pointsRequired: 360, badges: ["streak5", "first_try", "wordsmith"] }
] as const;

function normalizeSeasonLevel(value: number | undefined): 2 | 3 | 4 {
  return value === 3 || value === 4 ? value : 2;
}

function seasonFor(points: number, badges: Set<string>) {
  return [...SEASONS].reverse().find((season) =>
    points >= season.pointsRequired && season.badges.every((badge) => badges.has(badge))) ?? SEASONS[0];
}

function nextSeasonFor(points: number, badges: Set<string>) {
  const current = seasonFor(points, badges);
  return SEASONS.find((season) => season.level === current.level + 1) ?? null;
}

function requiredBadgeCountsForNext(points: number, badges: Set<string>) {
  const next = nextSeasonFor(points, badges);
  return next
    ? { earned: next.badges.filter((badge) => badges.has(badge)).length, required: next.badges.length }
    : { earned: 0, required: 0 };
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
    weeklyPractice: "Bài thực hành tuần gần nhất", coachRubric: "Rubric khi luyện với Season",
    wrongRate: "Phần sai nhiều lần"
  };
  const displays: Record<LevelReadinessMetric["key"], string> = {
    lessonCompletion: `${input.completedLessons}/${input.totalLessons} bài`,
    firstTryAccuracy: `${input.firstTryCorrect}/${input.firstTryTotal} phần`,
    weeklyPractice: input.weeklyPractice || input.weeklyPractice === 0 ? `${input.weeklyPractice}/100` : "Chưa có bài được chấm",
    coachRubric: `${round(input.coachRubric)}/5 · ${input.coachTurns} lượt`,
    wrongRate: `${round(input.wrongRate)}% · ${input.attemptedParts} phần`
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
  section: "listening" | "reading" | "writing" | "speaking"; section_score: string;
}>): { placement: AssessmentSnapshot | null } {
  const build = (kind: string): AssessmentSnapshot | null => {
    const selected = rows.filter((row) => row.kind === kind);
    if (!selected.length) return null;
    return {
      totalScore: Number(selected[0]?.total_score ?? 0),
      approvedLevel: selected[0]?.approved_level ?? null,
      sections: Object.fromEntries(selected.map((row) => [row.section, Number(row.section_score)]))
    };
  };
  return { placement: build("placement") };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function mapLessonRow(row: {
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
}): LearnerLessonRecord {
  return {
    id: row.id,
    title: row.title,
    dayNumber: row.day_number,
    weekNumber: row.week_number,
    weekTopic: row.week_topic,
    cefr: row.cefr,
    content: { ...row.content, parts: normalizeLessonParts(row.content.parts ?? [], row.cefr) },
    progress: mapProgress(
      row.progress_status ?? "not_started",
      row.progress_score,
      row.progress_evidence ?? {},
      row.progress_updated_at
    ),
    lock: lessonLockFor(row)
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

function lessonDayLabel(dayNumber: number): string {
  return (["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const)[dayNumber - 1] ?? `Bài ${dayNumber}`;
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
  status: PartEvidence["status"];
  answer: string | null;
  score: string | null;
  feedback: string | null;
  artifact_key: string | null;
}): PartEvidence {
  return {
    attempts: row.attempt_number,
    ...(row.status === undefined ? {} : { status: row.status }),
    ...(row.answer === null ? {} : { answer: row.answer }),
    ...(row.score === null ? {} : { score: Number(row.score) }),
    ...(row.feedback === null ? {} : { feedback: row.feedback }),
    ...(row.artifact_key === null ? {} : { artifactKey: row.artifact_key })
  };
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
    : { status: "wrong_retry", score: 0, feedback: "Chưa đúng. Bạn còn một lượt thử; hãy xem lại gợi ý." };
}

function normalizeLessonAnswer(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
}

class ContentRepository {
  constructor(private readonly pool: Pool) {}

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
              current_date::text as today,
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
      || !validateGenerationFindingsForPublication(candidate.generationFindings).valid) throw new Error("CONTENT_VALIDATION_FAILED");
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
      || !validateGenerationFindingsForPublication(candidate.generationFindings).valid) throw new Error("CONTENT_VALIDATION_FAILED");
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
        (select count(*) from assessment_attempts aa join users u on u.id = aa.learner_id and u.role = 'learner' and u.status = 'active' join assessment_versions av on av.id = aa.assessment_version_id join assessment_definitions ad on ad.id = av.definition_id where u.organization_id = $1 and ad.kind in ('placement', 'level_up'))::text as attempts,
        (select count(*) from assessment_versions av join assessment_definitions ad on ad.id = av.definition_id where ad.organization_id = $1 and ad.kind in ('placement', 'level_up'))::text as assessments`,
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
    const [submissions, micros, appeals, progress, assessments, weeklySets] = await Promise.all([
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
      this.pool.query<{
        id: string; learner_name: string; reason: string; status: "pending" | "accepted" | "rejected";
        resolution: string | null; created_at: Date; kind: "assessment" | "weekly_practice" | "lesson_part";
        submission_id: string | null; current_score: string | null;
        cefr: CefrLevel | null; week_number: number | null; day_number: number | null; lesson_title: string | null;
        part_code: string | null; attempts: number | null; answer: string | null; ai_feedback: string | null;
        part_content: Record<string, unknown> | null;
      }>(`select combined.* from (
            select a.id, u.display_name as learner_name, a.reason, a.status, a.resolution, a.created_at,
                   'assessment'::text as kind, null::uuid as submission_id, null::text as current_score,
                   null::text as cefr, null::int as week_number, null::int as day_number, null::text as lesson_title,
                   null::text as part_code, null::int as attempts, null::text as answer, null::text as ai_feedback,
                   null::jsonb as part_content
            from appeals a join users u on u.id = a.learner_id and u.role = 'learner' and u.status = 'active'
            where u.organization_id = $1
            union all
            select pa.id, u.display_name as learner_name, pa.reason, pa.status, pa.resolution, pa.created_at,
                   'weekly_practice'::text as kind, pa.submission_id, ps.score->>'total' as current_score,
                   null::text as cefr, null::int as week_number, null::int as day_number, null::text as lesson_title,
                   null::text as part_code, null::int as attempts, null::text as answer, null::text as ai_feedback,
                   null::jsonb as part_content
            from practice_appeals pa
            join practice_submissions ps on ps.id = pa.submission_id
            join users u on u.id = pa.learner_id and u.role = 'learner' and u.status = 'active'
            where u.organization_id = $1
            union all
            select lpa.id, u.display_name as learner_name, lpa.reason, lpa.status, lpa.resolution, lpa.created_at,
                   'lesson_part'::text as kind, null::uuid as submission_id, null::text as current_score,
                   e.cefr::text, pw.week_number, l.day_number, l.title as lesson_title, lpa.part_code,
                   coalesce((pr.evidence->'evidence'->lpa.part_code->>'attempts')::int, latest_attempt.attempt_number, 0) as attempts,
                   coalesce(pr.evidence->'evidence'->lpa.part_code->>'answer', latest_attempt.answer) as answer,
                   coalesce(pr.evidence->'evidence'->lpa.part_code->>'feedback', latest_attempt.feedback) as ai_feedback,
                   lesson_part.part_content
            from lesson_part_appeals lpa
            join users u on u.id = lpa.learner_id and u.role = 'learner' and u.status = 'active'
            join lessons l on l.id = lpa.lesson_id
            join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id
            join lesson_sets ls on ls.id = lsv.lesson_set_id
            join program_weeks pw on pw.id = ls.program_week_id
            left join enrollments e on e.learner_id = u.id and e.program_id = pw.program_id
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
              order by lv.version desc limit 1
            ) lesson_part on true
            where u.organization_id = $1
          ) combined
          order by (combined.status = 'pending') desc, combined.created_at desc limit 60`, [organizationId]),
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
        id: string; learner_name: string; kind: "placement" | "level_up"; title: string;
        status: string; submitted_at: Date | null; total_score: string | null;
      }>(`select aa.id, u.display_name as learner_name, ad.kind, ad.title, aa.status, aa.submitted_at,
                 sum(sc.score)::text as total_score
          from assessment_attempts aa join users u on u.id = aa.learner_id and u.role = 'learner' and u.status = 'active'
          join assessment_versions av on av.id = aa.assessment_version_id
          join assessment_definitions ad on ad.id = av.definition_id
          left join assessment_scores sc on sc.attempt_id = aa.id
          where u.organization_id = $1 and ad.kind in ('placement', 'level_up')
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
      )
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
        { key: "attempts", label: "Số lần làm bài", count: Number(count.attempts) },
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
      appeals: appeals.rows.map((row) => ({
        ...(() => {
          const content = row.part_content ?? {};
          const options = Array.isArray(content.options)
            ? content.options.filter((value): value is string => typeof value === "string")
            : [content.option1, content.option2, content.option3, content.option4].filter((value): value is string => typeof value === "string");
          return row.kind === "lesson_part" ? {
            cefr: row.cefr, weekNumber: row.week_number, dayNumber: row.day_number,
            lessonTitle: row.lesson_title, partCode: row.part_code, attempts: row.attempts,
            answer: row.answer, aiFeedback: row.ai_feedback,
            question: typeof content.prompt === "string" ? content.prompt : null,
            options, answerKey: typeof content.answer === "string" ? content.answer : null
          } : {};
        })(),
        id: row.id, learnerName: row.learner_name, reason: row.reason, status: row.status,
        createdAt: row.created_at.toISOString(), resolution: row.resolution ?? "", kind: row.kind,
        submissionId: row.submission_id, currentScore: row.current_score === null ? null : Number(row.current_score)
      })),
      lessonAttempts: progress.rows.map((row) => {
        const source = row.evidence.evidence && typeof row.evidence.evidence === "object"
          ? row.evidence.evidence as Record<string, unknown> : row.evidence;
        const attempts: Partial<Record<"listening" | "reading" | "writing" | "speaking", number>> = {};
        for (const code of ["listening", "reading", "writing", "speaking"] as const) {
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
    actorId: string, id: string, status: "accepted" | "rejected", resolution: string, newScore?: number
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const lessonPart = await client.query<{ organization_id: string; status: string }>(
        `select learner.organization_id, lpa.status
         from lesson_part_appeals lpa
         join users learner on learner.id = lpa.learner_id
         join users actor on actor.id = $1 and actor.organization_id = learner.organization_id
         where lpa.id = $2 for update of lpa`,
        [actorId, id]
      );
      const lessonPartAppeal = lessonPart.rows[0];
      if (lessonPartAppeal) {
        if (lessonPartAppeal.status !== "pending") {
          await client.query("rollback");
          return false;
        }
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
          [randomUUID(), lessonPartAppeal.organization_id, actorId, id, JSON.stringify({ status, resolution }), randomUUID()]
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
      await client.query("commit");
      return Boolean(assessment.rowCount);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
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
  const { _operator: _ignoredOperator, _lifecycle: _ignoredLifecycle, ...publicProfile } = profile;
  return publicProfile as Partial<LearnerProfileData>;
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
  const level = isRecord(candidate.levelUp) ? candidate.levelUp : undefined;
  if (level && ["days", "lessons", "firstTry", "submission", "coach", "coachTurns", "wrong", "minParts"].every((key) => typeof level[key] === "number")) {
    next.levelUp = {
      days: level.days as number, lessons: level.lessons as number, firstTry: level.firstTry as number,
      submission: level.submission as number, coach: level.coach as number, coachTurns: level.coachTurns as number,
      wrong: level.wrong as number, minParts: level.minParts as number
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

class AssessmentRepository {
  constructor(private readonly pool: Pool) {}

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
    const databaseKind = kind === "level-up" ? "level_up" : kind;
    const result = await this.pool.query<{
      definition_id: string;
      version_id: string;
      assessment_key: string;
      kind: "placement" | "level_up";
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

  async resumePlacementAttempt(
    learnerId: string,
    published: PublishedAssessmentRecord
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
      const autoSubmitted = violationCount > violationLimit;
      const recordedAt = new Date().toISOString();
      const event = {
        requestId: input.requestId,
        reason: input.reason,
        occurredAt: input.occurredAt,
        recordedAt,
        violationCount
      } satisfies AssessmentAttemptRecord["integrityEvents"][number];
      const events = [...(Array.isArray(attempt.integrity_events) ? attempt.integrity_events : []), event];
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
    id: string; reason: string; status: "pending" | "accepted" | "rejected";
    resolution: string | null; createdAt: Date; resolvedAt: Date | null;
  } | null> {
    const result = await this.pool.query<{
      id: string; reason: string; status: "pending" | "accepted" | "rejected";
      resolution: string | null; created_at: Date; resolved_at: Date | null;
    }>(
      `select id, reason, status, resolution, created_at, resolved_at from appeals
       where learner_id = $1 and attempt_id = $2 order by created_at desc limit 1`,
      [learnerId, attemptId]
    );
    const row = result.rows[0];
    return row ? { id: row.id, reason: row.reason, status: row.status, resolution: row.resolution, createdAt: row.created_at, resolvedAt: row.resolved_at } : null;
  }

  async createAppeal(learnerId: string, attemptId: string, reason: string): Promise<{
    id: string; reason: string; status: "pending"; resolution: null; createdAt: Date; resolvedAt: null;
  } | null> {
    const result = await this.pool.query<{ id: string; created_at: Date }>(
      `insert into appeals (id, attempt_id, learner_id, reason)
       select $1, aa.id, aa.learner_id, $4 from assessment_attempts aa
       where aa.id = $2 and aa.learner_id = $3 and aa.status in ('pending_review', 'approved', 'needs_retry')
         and not exists (select 1 from appeals a where a.attempt_id = aa.id and a.status = 'pending')
       returning id, created_at`,
      [randomUUID(), attemptId, learnerId, reason]
    );
    const row = result.rows[0];
    return row ? { id: row.id, reason, status: "pending", resolution: null, createdAt: row.created_at, resolvedAt: null } : null;
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
           (id, assessment_version_id, learner_id, status, current_section, timing_state, violation_limit, started_at, updated_at)
         values ($1, $2, $3, 'in_progress', $4, $5::jsonb, $6, $7, $7)`,
        [id, input.assessmentVersionId, input.learnerId, input.firstSection, JSON.stringify(timingState), input.violationLimit ?? 3, startedAt]
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
      if (input.requestId) {
        await client.query(
          `insert into idempotency_keys (scope, key, response) values ($1, $2, $3::jsonb)`,
          [scope, input.requestId, JSON.stringify({ attemptId: input.attemptId })]
        );
      }
      await client.query("commit");
      await this.pool.query(
        `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
         select $1, $2, 'assessment', 'assessment_attempt', $3, 30, '{}'::jsonb
         where not exists (select 1 from activities where learner_id = $2 and reference_type = 'assessment_attempt' and reference_id = $3)`,
        [randomUUID(), input.learnerId, input.attemptId]
      );
      await syncLearnerRewards(this.pool, input.learnerId);
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
       where aa.id = $2 and aa.status = 'pending_review' and ad.kind in ('placement', 'level_up')`,
      [reviewerId, attemptId]
    );
    const row = scope.rows[0];
    if (!row) return null;
    const attempt = await this.findAttempt(row.learner_id, attemptId);
    return attempt ? { attempt, definition: row.blueprint } : null;
  }

  async saveAssessmentRescore(input: {
    actorId: string;
    attemptId: string;
    requestId: string;
    aiRequestKey: string;
    taskId: string;
    promptVersionId: string;
    output: {
      writingScore: number;
      speakingScore: number;
      suggestedLevel: CefrLevel;
      rationale: string;
      monthlyGoal: string;
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
         where reviewer.id = $1 and reviewer.role in ('operator', 'manager')
         for update of aa`,
        [input.actorId, input.attemptId]
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
         do update set score = excluded.score, criteria = excluded.criteria, source = 'ai', created_at = now()`,
        [randomUUID(), input.attemptId, input.output.writingScore, JSON.stringify({
          rationale: input.output.rationale,
          monthlyGoal: input.output.monthlyGoal
        })]
      );
      await client.query(
        `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
         values ($1, $2, 'speaking', $3, $4::jsonb, 'ai')
         on conflict (attempt_id, section)
         do update set score = excluded.score, criteria = excluded.criteria, source = 'ai', created_at = now()`,
        [randomUUID(), input.attemptId, input.output.speakingScore, JSON.stringify({
          rationale: input.output.rationale,
          evidencePolicy: "Pronunciation is scored only when audio evidence exists."
        })]
      );
      await client.query(
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
         values ($1, $2, $3, 'assessment.rescored', 'assessment_attempt', $4, $5::jsonb, $6)`,
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
          randomUUID()
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
      const scope = await client.query<{ organization_id: string; learner_id: string }>(
        `select reviewer.organization_id, aa.learner_id
         from users reviewer
         join assessment_attempts aa on aa.id = $2 and aa.status in ('pending_review', 'submitted')
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
      const writingScore = roundAssessmentScore(input.writingTasks.reduce((total, task) => {
        const raw = task.criteria.taskCompletion + task.criteria.organization + task.criteria.vocabulary + task.criteria.grammar + task.criteria.workplaceRegister;
        return total + raw / 20 * (task.taskKey === "W1" ? 7 : 13);
      }, 0));
      const speakingScores = input.speakingTasks.map((task) => task.criteria === null ? null : (
        task.criteria.taskCompletionRelevance + task.criteria.grammarVocabulary + task.criteria.coherenceClarity + task.criteria.interactionProfessionalRegister
      ) / 4);
      if (speakingScores.some((score) => score === null)) {
        await client.query("rollback");
        return null;
      }
      const speakingScore = roundAssessmentScore(speakingScores.reduce<number>((total, score) => total + Number(score), 0));
      const scoredSpeakingTasks = input.speakingTasks.map((task, index) => ({
        ...task,
        taskScore: Number(speakingScores[index]),
        completionStatus: task.criteria === null ? "pending_evidence" : "scored"
      }));
      for (const [section, score, sectionCriteria] of [
        ["writing", writingScore, { tasks: input.writingTasks, comment: input.comment }],
        ["speaking", speakingScore, { tasks: scoredSpeakingTasks, totalScore: speakingScore, completionStatus: "scored", notes: input.comment, comment: input.comment }]
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
      const suggestedLevel = Number(totals.rows[0]?.section_count ?? 0) === 4
        ? reviewCefrFromScore(totalScore, 100)
        : null;
      if (suggestedLevel) {
        await client.query(
          `insert into assessment_decisions (id, attempt_id, suggested_level, status, reason)
           values ($1, $2, $3, 'suggested', $4)
           on conflict (attempt_id) do update set suggested_level = excluded.suggested_level,
             status = case when assessment_decisions.status = 'approved' then assessment_decisions.status else 'suggested' end,
             reason = case when assessment_decisions.status = 'approved' then assessment_decisions.reason else excluded.reason end`,
          [randomUUID(), input.attemptId, suggestedLevel, `Tổng điểm chấm tay ${totalScore}/100.`]
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
      learner_id: string; learner_name: string; kind: "placement" | "level_up"; title: string;
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
       where aa.id = $2 and ad.kind in ('placement', 'level_up')`,
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
       where j.kind = 'assessment.ai-score'
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
    const prompts = new Map<string, { prompt?: string; title?: string }>();
    const taskPrompts = (row.blueprint.sections ?? []).flatMap((section) => section.groups.flatMap((group) => group.tasks.map((task) => ({
      section: section.code,
      taskKey: task.key,
      ...(group.title ? { title: group.title } : {}),
      prompt: task.prompt
    }))));
    for (const section of row.blueprint.sections ?? []) {
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
    const sectionDefinitions = new Map((row.blueprint.sections ?? []).map(section => [section.code, section]));
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
              : event.source === "assessment.decision" ? "Operator đã ra quyết định"
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
        reason: row.decision_reason ?? "",
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

  async changeLearnerLevel(actorId: string, learnerId: string, input: AssessmentLevelChangeInput): Promise<AssessmentLevelChangeView | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const identity = await client.query<{ organization_id: string; display_name: string }>(
        `select learner.organization_id, learner.display_name
         from users actor join users learner on learner.organization_id = actor.organization_id
           and learner.id = $2 and learner.role = 'learner' and learner.status = 'active'
         where actor.id = $1 and actor.role in ('operator', 'manager')`,
        [actorId, learnerId]
      );
      const person = identity.rows[0];
      if (!person) { await client.query("rollback"); return null; }
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
      await client.query("commit");
      return {
        ...input,
        learnerId,
        previousLevel: currentLevel,
        effectiveAt,
        changedBy: actorId,
        changedAt: now.toISOString()
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
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
      kind: "placement" | "level_up";
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
       where aa.status = 'pending_review' and ad.kind in ('placement', 'level_up')
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
      kind: row.kind === "level_up" ? "level-up" : row.kind,
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
      }>(
        `select learner.id as learner_id, learner.display_name as learner_name,
                e.cefr as current_level, placement.total_score as placement_score,
                nullif(lp.profile->>'monthlyGoal', '') as monthly_goal
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
        monthlyGoal: row.monthly_goal
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
      const testSummary = row.score_total === null ? "bài thi" : `bài thi ${Number(row.score_total)}/100`;
      const metrics = phase === "testing"
        ? "đang làm bài thi"
        : phase === "ungraded"
          ? `đã nộp ${testSummary} · chờ chấm Viết/Nói`
          : phase === "challenge"
            ? `qua ${testSummary} · đang thử thách Season (${turns}/6)`
            : average === null
              ? `chưa đạt: ${testSummary} · cần thi lại`
              : `chưa đạt: ${average}/5 · ${offTopic} lượt lạc đề`;
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
      const targetLevel = row.blueprint.targetLevel;
      if (!targetLevel || targetLevel === "A1") return [];
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
        attemptCount: Number(row.attempt_count)
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
      const blueprintTarget = row.target_level ?? row.blueprint.targetLevel;
      if (!blueprintTarget || blueprintTarget === "A1") return [];
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
      status: row.status
    } as const;
    const versions = (await this.listLevelFormVersions(reviewerId, targetLevel)).map((version) => ({
      ...version,
      publishedAt: version.publishedAt?.toISOString() ?? null
    }));
    const warnings: AssessmentLevelFormDetailView["warnings"] = [];
    const expectedCounts: Record<AssessmentSectionCode, number> = { listening: 5, reading: 5, writing: 1, speaking: 1 };
    const present = new Set(row.blueprint.sections.map((section) => section.code));
    for (const code of ["listening", "reading", "writing", "speaking"] as const) {
      const count = sectionTaskCount(row.blueprint, code);
      if (!present.has(code)) warnings.push({ code: "missing_section", message: `Thiếu phần ${code}.`, severity: "error" });
      else if (count < expectedCounts[code]) warnings.push({ code: "short_section", message: `Phần ${code} mới có ${count}/${expectedCounts[code]} câu.`, severity: "warning" });
    }
    for (const section of row.blueprint.sections) for (const group of section.groups) for (const task of group.tasks) {
      if (task.responseType === "single_choice" && !task.correctAnswer) warnings.push({ code: "missing_answer_key", message: `Câu ${task.key} chưa có đáp án.`, severity: "error" });
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
      sections: row.blueprint.sections.map((section) => ({
        ...section,
        groups: section.groups.map((group) => ({
          ...group,
          tasks: group.tasks.map((task) => ({ ...task, correctAnswer: task.correctAnswer ?? null }))
        }))
      })),
      warnings,
      versions,
      deletable,
      deleteReason
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
      const listening = target.rows[0]!.blueprint.sections.find((section) => section.code === "listening");
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
        kind: "placement" | "level_up";
        current_level: CefrLevel | null;
        challenge_passed: boolean | null;
        challenge_turns: number | null;
        challenge_average: string | null;
        challenge_off_topic: number | null;
      }>(
        `select aa.learner_id, learner.organization_id, aa.status, definition.kind,
                enrollment.cefr as current_level, challenge.passed as challenge_passed,
                challenge.completed_turns as challenge_turns, challenge.average::text as challenge_average,
                challenge.off_topic as challenge_off_topic
         from assessment_attempts aa
         join assessment_versions version on version.id = aa.assessment_version_id
         join assessment_definitions definition on definition.id = version.definition_id
         join users learner on learner.id = aa.learner_id
         join users reviewer on reviewer.id = $2
           and reviewer.organization_id = learner.organization_id
           and reviewer.role in ('operator', 'manager')
         left join enrollments enrollment on enrollment.learner_id = aa.learner_id and enrollment.cefr_approved = true
         left join level_up_challenge_results challenge on challenge.assessment_attempt_id = aa.id
         where aa.id = $1 and definition.kind in ('placement', 'level_up')
         for update of aa`,
        [input.attemptId, input.reviewerId]
      );
      const attempt = locked.rows[0];
      if (!attempt || !["pending_review", "approved", "needs_retry"].includes(attempt.status)) {
        await client.query("rollback");
        return null;
      }
      if (attempt.kind === "level_up" && input.status === "approved" && attempt.challenge_passed !== true) {
        await client.query("rollback");
        return null;
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
      if (input.status === "approved" && input.approvedLevel && attempt.kind === "level_up") {
        const effectiveAt = nextEffectiveMonday(decidedAt, "Asia/Ho_Chi_Minh");
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
            effectiveAt, input.reviewerId, input.reason, JSON.stringify({
              examScores,
              challenge: {
                completedTurns: Number(attempt.challenge_turns ?? 0),
                average: Number(attempt.challenge_average ?? 0),
                offTopic: Number(attempt.challenge_off_topic ?? 0),
                passed: true
              }
            })]
        );
      } else if (input.status === "approved" && input.approvedLevel) {
        await client.query(
          `update enrollments set cefr = $2, cefr_approved = true where learner_id = $1`,
          [attempt.learner_id, input.approvedLevel]
        );
      }
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'assessment.decision', 'assessment_attempt', $4, $5::jsonb, $6)`,
        [randomUUID(), attempt.organization_id, input.reviewerId, input.attemptId,
          JSON.stringify({ status: input.status, approvedLevel: input.approvedLevel, reason: input.reason,
            ...(attempt.kind === "level_up" && input.status === "approved"
              ? { effectiveAt: nextEffectiveMonday(decidedAt, "Asia/Ho_Chi_Minh") } : {}) }), randomUUID()]
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

  async currentForLearner(learnerId: string, aiAvailable: boolean): Promise<CoachView | null> {
    const context = await this.pool.query<{
      display_name: string; cefr: CefrLevel; topic: string; scenario: Record<string, unknown> | null;
      session_id: string | null; coach_daily_limit: number;
    }>(
      `select u.display_name, e.cefr, pw.topic, cs.id as session_id, cs.scenario,
              least(greatest(coalesce((os.configuration->>'coachDailyLimit')::int, 30), 1), 200) as coach_daily_limit
       from users u
       join enrollments e on e.learner_id = u.id
       join programs p on p.id = e.program_id and p.status = 'active'
       join program_weeks pw on pw.program_id = p.id
         and pw.week_number = coalesce(p.current_week_override,
           greatest(1, least(p.week_count, ((current_date - p.start_date) / 7) + 1)))
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
    let sessionId = row.session_id;
    let scenario = row.scenario ?? {};
    if (!sessionId) {
      sessionId = randomUUID();
      scenario = { title: row.topic, persona: "informal" };
      await this.pool.query(
        `insert into coach_sessions (id, learner_id, scenario, status)
         values ($1, $2, $3::jsonb, 'active')`,
        [sessionId, learnerId, JSON.stringify(scenario)]
      );
    }
    const [turns, counters, vocabularyRows, unlockedRows] = await Promise.all([
      this.pool.query<{
        id: string; speaker: string; content: Record<string, unknown>;
        feedback: Record<string, unknown> | null; created_at: Date;
      }>(
        `select id, speaker, content, feedback, created_at from coach_turns
         where session_id = $1 order by turn_number, created_at`, [sessionId]
      ),
      this.pool.query<{ daily_used: string; weekly_turns: string }>(
        `select
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= current_date
             and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean,
               coalesce((ct.feedback->>'relevant')::boolean, true)))::text as daily_used,
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= date_trunc('week', now())
             and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean,
               coalesce((ct.feedback->>'relevant')::boolean, true)))::text as weekly_turns
         from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
         where cs.learner_id = $1`, [learnerId]
      ),
      this.pool.query<{ content: Record<string, unknown> }>(
        `select lv.content
         from enrollments e
         join programs p on p.id = e.program_id and p.status = 'active'
         join program_weeks pw on pw.program_id = p.id
           and pw.week_number = coalesce(p.current_week_override,
             greatest(1, least(p.week_count, ((current_date - p.start_date) / 7) + 1)))
         join lesson_sets ls on ls.program_week_id = pw.id and ls.cefr = e.cefr
         join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
         join lessons l on l.lesson_set_version_id = lsv.id
         join lateral (
           select content from lesson_versions
           where lesson_id = l.id and status = 'published'
           order by version desc limit 1
         ) lv on true
         where e.learner_id = $1 order by l.day_number`, [learnerId]
      ),
      this.pool.query<{ word: string }>(
        "select word from learner_vocabulary_unlocks where learner_id = $1", [learnerId]
      )
    ]);
    const messages: CoachView["messages"] = [];
    const openedWords = new Set<string>(unlockedRows.rows.map((row) => row.word.toLowerCase()));
    for (const turn of turns.rows) {
      const text = typeof turn.content.text === "string" ? turn.content.text : "";
      const audioArtifact = audioArtifactFromContent(turn.content);
      const feedback = coachFeedback(turn.feedback);
      const feedbackRecord = turn.feedback ?? {};
      if (Array.isArray(feedbackRecord.usedWords)) {
        for (const word of feedbackRecord.usedWords) if (typeof word === "string") openedWords.add(word.toLowerCase());
      }
      const classification = coachTurnClassification(feedbackRecord);
      if (turn.speaker === "coach") {
        if (text) messages.push({ id: turn.id, speaker: "coach", text, createdAt: turn.created_at.toISOString(), ...(classification ? { classification } : {}) });
        continue;
      }
      if (text || audioArtifact) messages.push({ id: turn.id, speaker: "learner", text, createdAt: turn.created_at.toISOString(), ...(classification ? { classification } : {}), ...(audioArtifact ? { audioArtifact } : {}) });
      const coachText = typeof feedbackRecord.coachText === "string" ? feedbackRecord.coachText : "";
      if (coachText) messages.push({
        id: `${turn.id}:coach`, speaker: "coach", text: coachText,
        createdAt: turn.created_at.toISOString(), ...(classification ? { classification } : {}), ...(feedback ? { feedback } : {})
      });
    }
    if (!messages.some((message) => message.speaker === "coach")) {
      const firstName = row.display_name.trim().split(/\s+/).at(-1) ?? row.display_name;
      messages.unshift({
        id: "welcome", speaker: "coach", text: coachOpeningQuestion(firstName, row.topic),
        createdAt: new Date(0).toISOString()
      });
    }
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
    const vocabulary = [...vocabularyByWord.values()].slice(0, 12);
    const count = counters.rows[0] ?? { daily_used: "0", weekly_turns: "0" };
    return {
      sessionId, topic: row.topic, cefr: row.cefr,
      persona: scenario.persona === "formal" ? "formal" : "informal",
      aiAvailable, daily: { used: Number(count.daily_used), limit: row.coach_daily_limit },
      weekly: { turns: Number(count.weekly_turns), target: 50 }, messages, vocabulary
    };
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
      evaluation: { status: "valid" | "insufficient" | "off_topic"; result: "correct" | "partially_correct" | "missing_information" | "off_topic"; countsTowardGoal: boolean; noteVi: string };
      seasonReply: string; seasonReplyTranslation: string; nextQuestion: string; nextQuestionTranslation: string;
      rubric: {
        meaning: { score: number; evidence: string; improvement: string };
        vocabulary: { score: number; evidence: string; improvement: string };
        grammar: { score: number; evidence: string; improvement: string };
      };
      corrections: Array<{ original: string; corrected: string; translation: string; reason: string }>;
      correctedText: string; suggestedAnswer: { text: string; translation: string }; usedWords: string[];
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
        `select count(*) filter (where ct.speaker = 'learner' and ct.created_at >= current_date
            and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean,
              coalesce((ct.feedback->>'relevant')::boolean, true)))::text as daily_used,
                least(greatest(coalesce((os.configuration->>'coachDailyLimit')::int, 30), 1), 200) as daily_limit
         from users u
         left join organization_settings os on os.organization_id = u.organization_id
         left join coach_sessions cs on cs.learner_id = u.id
         left join coach_turns ct on ct.session_id = cs.id
         where u.id = $1
         group by os.configuration`,
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
            coachText: `${input.output.seasonReply} ${input.output.nextQuestion}`.trim(),
            evaluation: input.output.evaluation,
            seasonReply: input.output.seasonReply, seasonReplyTranslation: input.output.seasonReplyTranslation,
            nextQuestion: input.output.nextQuestion, nextQuestionTranslation: input.output.nextQuestionTranslation,
            rubric: input.output.rubric, corrections: input.output.corrections,
            correctedText: input.output.correctedText, suggestedAnswer: input.output.suggestedAnswer,
            usedWords: input.output.usedWords, checked: false
          }), runId]
      );
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
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async saveInsufficientTurn(input: {
    learnerId: string;
    sessionId: string;
    requestId: string;
    message: string;
    audio?: AudioArtifactInput;
    currentQuestion: string;
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
      const seasonReply = "Please write a complete English sentence so I can understand your answer.";
      const seasonReplyTranslation = "Hãy viết một câu tiếng Anh đầy đủ để Season hiểu câu trả lời của bạn.";
      const turnId = randomUUID();
      await client.query(
        `insert into coach_turns (id, session_id, turn_number, speaker, content, feedback)
         values ($1, $2, $3, 'learner', $4::jsonb, $5::jsonb)`,
        [turnId, input.sessionId, Number(next.rows[0]?.number ?? 1),
          JSON.stringify({ text: input.message, requestId: input.requestId, ...(input.audio ? { audioArtifact: storedAudioArtifact(input.audio) } : {}) }),
          JSON.stringify({
            coachText: seasonReply,
            evaluation: { status: "insufficient", result: "missing_information", countsTowardGoal: false, noteVi: seasonReplyTranslation },
            seasonReply, seasonReplyTranslation,
            nextQuestion: input.currentQuestion,
            nextQuestionTranslation: "Hãy trả lời lại câu hỏi trên bằng một câu đầy đủ.",
            rubric: {
              meaning: { score: 0, evidence: `“${input.message}” chưa đủ thông tin để trả lời câu hỏi.`, improvement: "Viết một câu có chủ ngữ và ý chính." },
              vocabulary: { score: 0, evidence: "Chưa đủ nội dung để đánh giá từ vựng.", improvement: "Dùng ít nhất một từ liên quan đến câu hỏi." },
              grammar: { score: 0, evidence: "Chưa đủ câu để đánh giá ngữ pháp.", improvement: "Viết một câu tiếng Anh hoàn chỉnh." }
            },
            corrections: [], correctedText: "", suggestedAnswer: { text: "", translation: "" },
            usedWords: [], checked: false
          })]
      );
      if (input.audio) await linkAudioOnClient(client, {
        ownerUserId: input.learnerId, audio: input.audio, sourceFlow: "season", sourceEntityId: turnId
      });
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
      const coachText = typeof feedbackRecord.coachText === "string" ? feedbackRecord.coachText : "";
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

function coachOpeningQuestion(firstName: string, topic: string): string {
  const normalized = topic.toLocaleLowerCase();
  if (normalized.includes("feedback")) {
    return `Hi ${firstName}! Let's practise giving feedback. A colleague's report is clear, but one slide has too much text. What would you say?`;
  }
  if (normalized.includes("email") || normalized.includes("reschedul")) {
    return `Hi ${firstName}! Let's practise rescheduling a meeting. You need to move tomorrow's meeting to Friday. What would you write?`;
  }
  if (normalized.includes("introduc") || normalized.includes("your job")) {
    return `Hi ${firstName}! Let's practise a short introduction. Imagine you're meeting a new colleague. How would you introduce yourself and your role?`;
  }
  return `Hi ${firstName}! Let's practise “${topic}”. Think of a real situation at work. What would you say first?`;
}

function coachFeedback(value: Record<string, unknown> | null): CoachFeedbackView | null {
  if (!value || !value.rubric || typeof value.rubric !== "object" || Array.isArray(value.rubric)) return null;
  const rubric = value.rubric as Record<string, unknown>;
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
  const legacyRelevant = value.relevant !== false;
  const status = evaluationSource?.status === "insufficient" || evaluationSource?.status === "off_topic"
    ? evaluationSource.status : legacyRelevant ? "valid" : "off_topic";
  const countsTowardGoal = typeof evaluationSource?.countsTowardGoal === "boolean"
    ? evaluationSource.countsTowardGoal : status === "valid";
  const result = evaluationSource?.result === "correct" || evaluationSource?.result === "partially_correct"
    || evaluationSource?.result === "missing_information" || evaluationSource?.result === "off_topic"
    ? evaluationSource.result
    : status === "off_topic" ? "off_topic" : status === "insufficient" ? "missing_information" : "partially_correct";
  const suggestedAnswerSource = value.suggestedAnswer && typeof value.suggestedAnswer === "object" && !Array.isArray(value.suggestedAnswer)
    ? value.suggestedAnswer as Record<string, unknown> : null;
  const coachText = typeof value.coachText === "string" ? value.coachText : "";
  return {
    relevant: status !== "off_topic",
    relevanceNote: typeof value.relevanceNote === "string" ? value.relevanceNote : "",
    evaluation: {
      status,
      result,
      countsTowardGoal,
      noteVi: typeof evaluationSource?.noteVi === "string"
        ? evaluationSource.noteVi : typeof value.relevanceNote === "string" ? value.relevanceNote : "Không có nhận xét chi tiết cho lượt chat cũ."
    },
    ...(classification ? { classification } : {}),
    seasonReply: typeof value.seasonReply === "string" ? value.seasonReply : coachText,
    seasonReplyTranslation: typeof value.seasonReplyTranslation === "string"
      ? value.seasonReplyTranslation : typeof value.replyTranslation === "string" ? value.replyTranslation : "",
    nextQuestion: typeof value.nextQuestion === "string" ? value.nextQuestion : "",
    nextQuestionTranslation: typeof value.nextQuestionTranslation === "string" ? value.nextQuestionTranslation : "",
    rubric: {
      meaning: coachRubricCriterion(rubric.meaning),
      vocabulary: coachRubricCriterion(rubric.vocabulary),
      grammar: coachRubricCriterion(rubric.grammar)
    },
    corrections,
    correctedText: typeof value.correctedText === "string" ? value.correctedText : "",
    suggestedAnswer: {
      text: typeof suggestedAnswerSource?.text === "string" ? suggestedAnswerSource.text : "",
      translation: typeof suggestedAnswerSource?.translation === "string" ? suggestedAnswerSource.translation : ""
    }
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
             least(p.week_count, greatest(1, floor((current_date - p.start_date) / 7.0)::int + 1)))
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
          `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
           select $1, $2, b.id, 0, 'weekly_practice', $3
           from users u join badges b on b.organization_id = u.organization_id and b.badge_key = 'friday'
           where u.id = $2
           on conflict do nothing`,
          [randomUUID(), input.learnerId, submissionId]
        );
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

  async appealWeeklyPractice(input: { learnerId: string; submissionId: string; reason: string }): Promise<WeeklyPracticeView | null> {
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
        `insert into practice_appeals (id, submission_id, learner_id, reason)
         values ($1, $2, $3, $4) on conflict (submission_id) do nothing`,
        [randomUUID(), input.submissionId, input.learnerId, input.reason]
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
    cefr: CefrLevel; wordSet: GameWordSetView | null; best: Partial<Record<GameKey, { score: number; maxScore: number }>>;
  } | null> {
    const context = await this.activeEngagementContext(learnerId);
    if (!context) return null;
    const result = await this.pool.query<{ id: string; learner_id: string | null; payload: Record<string, unknown> }>(
      `select id, learner_id, payload from game_sets
       where program_week_id = $1 and game_key = 'weekly_vocabulary' and status = 'published'
         and (learner_id = $2 or learner_id is null)
       order by (learner_id = $2) desc nulls last, created_at desc limit 1`,
      [context.weekId, learnerId]
    );
    const row = result.rows[0];
    if (!row) return { cefr: context.cefr, wordSet: null, best: {} };
    const payload = row.payload;
    const words = Array.isArray(payload.words) ? payload.words as GameWordSetView["words"] : [];
    const distractors = Array.isArray(payload.distractors) ? payload.distractors as GameWordSetView["words"] : undefined;
    const bestRows = await this.pool.query<{ game_key: GameKey; score: number; max_score: number }>(
      `select distinct on (game_key) game_key, score, max_score
       from game_results where learner_id = $1 and game_set_id = $2 and game_key is not null
       order by game_key, (score::numeric / greatest(max_score, 1)) desc, completed_at asc`,
      [learnerId, row.id]
    );
    return {
      cefr: context.cefr,
      wordSet: { id: row.id, topic: String(payload.topic ?? context.topic), cefr: context.cefr,
        source: row.learner_id && payload.source !== "learned" ? "custom" : "weekly", words, ...(distractors ? { distractors } : {}) },
      best: Object.fromEntries(bestRows.rows.map((item) => [item.game_key, normalizedGameBest(item)]))
    };
  }

  async useLearnedVocabularyGameSet(learnerId: string): Promise<boolean> {
    const context = await this.activeEngagementContext(learnerId);
    if (!context) return false;
    const learned = await this.pool.query<{ lesson_id: string; day_number: number; content: Record<string, unknown> }>(
      `select l.id as lesson_id, l.day_number, lv.content
       from lesson_sets ls
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
       join lessons l on l.lesson_set_version_id = lsv.id
       join lateral (
         select content from lesson_versions
         where lesson_id = l.id and status = 'published'
         order by version desc limit 1
       ) lv on true
       join progress_records pr on pr.lesson_id = l.id and pr.learner_id = $1
         and pr.status in ('in_progress', 'completed')
       where ls.program_week_id = $2 and ls.cefr = $3
       order by l.day_number`,
      [learnerId, context.weekId, context.cefr]
    );
    const seen = new Set<string>();
    const words: GameWordSetView["words"] = [];
    for (const lesson of learned.rows) {
      const parts = Array.isArray(lesson.content.parts) ? lesson.content.parts : [];
      const vocabulary = parts.find((part) => part && typeof part === "object" && !Array.isArray(part)
        && (part as Record<string, unknown>).code === "vocabulary") as Record<string, unknown> | undefined;
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
        words.push({
          id: `${lesson.lesson_id}-${index + 1}`,
          english,
          vietnamese,
          definition: typeof value.definition === "string" && value.definition.trim() ? value.definition.trim() : vietnamese,
          partOfSpeech,
          ...(typeof value.imageQuery === "string" && value.imageQuery.trim() ? { imageQuery: value.imageQuery.trim() } : {}),
          ...(typeof value.imageUrl === "string" && value.imageUrl.trim() ? { imageUrl: value.imageUrl.trim() } : {})
        });
        seen.add(key);
      }
    }
    if (!words.length) return false;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update game_sets set status = 'retired'
         where program_week_id = $1 and learner_id = $2 and game_key = 'weekly_vocabulary' and status = 'published'`,
        [context.weekId, learnerId]
      );
      await client.query(
        `insert into game_sets (id, program_week_id, learner_id, game_key, status, payload)
         values ($1, $2, $3, 'weekly_vocabulary', 'published', $4::jsonb)`,
        [randomUUID(), context.weekId, learnerId, JSON.stringify({
          topic: `Tuần ${context.weekNumber}: ${context.topic}`,
          cefr: context.cefr,
          words,
          source: "learned"
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
    const context = await this.activeEngagementContext(learnerId);
    if (!context) return null;
    const result = await this.pool.query<{ payload: Record<string, unknown> }>(
      `select payload from game_sets
       where id = $1 and program_week_id = $2 and game_key = 'weekly_vocabulary'
         and status = 'published' and (learner_id = $3 or learner_id is null)
       limit 1`,
      [setId, context.weekId, learnerId]
    );
    const payload = result.rows[0]?.payload;
    const words = Array.isArray(payload?.words) ? payload.words : [];
    const word = words.find((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      return String((item as Record<string, unknown>).id ?? "") === wordId;
    });
    if (!word || typeof word !== "object" || Array.isArray(word)) return null;
    const value = word as Record<string, unknown>;
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
    const context = await this.activeEngagementContext(learnerId);
    if (!context) return false;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{ payload: Record<string, unknown> }>(
        `select payload from game_sets
         where id = $1 and program_week_id = $2 and game_key = 'weekly_vocabulary'
           and status = 'published' and (learner_id = $3 or learner_id is null)
         for update`,
        [setId, context.weekId, learnerId]
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

  async saveGeneratedWordSet(input: {
    learnerId: string; requestId: string; taskId: string; promptVersionId: string;
    output: { topic: string; words: GameWordSetView["words"]; distractors: GameWordSetView["words"] }; metadata: AiRunMetadataInput;
  }): Promise<void> {
    const context = await this.activeEngagementContext(input.learnerId);
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
        await client.query(
          `update game_sets set status = 'retired'
           where program_week_id = $1 and learner_id = $2 and game_key = 'weekly_vocabulary' and status = 'published'`,
          [context.weekId, input.learnerId]
        );
        await client.query(
          `insert into game_sets (id, program_week_id, learner_id, game_key, status, payload)
           values ($1, $2, $3, 'weekly_vocabulary', 'published', $4::jsonb)`,
          [randomUUID(), context.weekId, input.learnerId, JSON.stringify({
            topic: input.output.topic, cefr: context.cefr, words: input.output.words, distractors: input.output.distractors,
            source: "ai", aiRunId: runId
          })]
        );
      }
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }

  async retireGeneratedWordSet(learnerId: string): Promise<void> {
    const context = await this.activeEngagementContext(learnerId);
    if (!context) return;
    await this.pool.query(
      `update game_sets set status = 'retired'
       where program_week_id = $1 and learner_id = $2 and game_key = 'weekly_vocabulary' and status = 'published'`,
      [context.weekId, learnerId]
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
    await this.pool.query(
      `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
       select $1, $2, 'game', 'game_result', $3, 5, $4::jsonb
       where not exists (select 1 from activities where learner_id = $2 and reference_type = 'game_result' and reference_id = $3)`,
      [randomUUID(), input.learnerId, row.id, JSON.stringify({ game: input.game, score: input.score, maxScore: input.maxScore })]
    );
    await syncLearnerRewards(this.pool, input.learnerId);
    return gameResultView(row);
  }

  async arena(learnerId: string): Promise<{
    cefr: CefrLevel; organizationId: string; programId: string;
    opponents: Array<{ id: string; displayName: string; avatar?: LearnerAvatarData; cefr: CefrLevel }>;
    leaderboard: Array<{ learnerId: string; displayName: string; avatar?: LearnerAvatarData; cefr: CefrLevel; points: number; played: number; won: number; lost: number }>;
    duels: Array<{ id: string; game: GameKey; wordSetTopic: string; challengerId: string; opponentId: string; challengerName: string; opponentName: string; state: string; scores: Record<string, { score: number; maxScore: number }>; createdAt: Date }>;
  } | null> {
    const context = await this.activeEngagementContext(learnerId);
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
        `insert into game_sets (id, program_week_id, learner_id, game_key, status, payload)
         select $1, program_week_id, null, 'duel_snapshot', 'published', $3::jsonb
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
      display_name: string; cefr: CefrLevel; program_id: string; points: string; organization_name: string; operator_name: string; manager_name: string; completed_at: Date | null;
      badges: Array<{ key: string; label: string; description: string; earned: boolean }>;
    }>(
      `select u.display_name, e.cefr, e.program_id, o.name as organization_name, coalesce(sum(re.points), 0)::text as points, max(re.created_at) as completed_at,
              coalesce((select x.display_name from users x where x.organization_id = u.organization_id and x.role = 'operator' and x.status = 'active' order by x.created_at limit 1), '') as operator_name,
              coalesce((select x.display_name from users x where x.organization_id = u.organization_id and x.role = 'manager' and x.status = 'active' order by x.created_at limit 1), '') as manager_name,
              (select coalesce(jsonb_agg(jsonb_build_object('key', b.badge_key, 'label', b.label,
                'description', b.rule->>'description', 'earned', exists(select 1 from reward_events x where x.learner_id = u.id and x.badge_id = b.id)) order by b.badge_key), '[]'::jsonb)
               from badges b where b.organization_id = u.organization_id) as badges
       from users u join organizations o on o.id = u.organization_id join enrollments e on e.learner_id = u.id
       left join reward_events re on re.learner_id = u.id where u.id = $1 group by u.id, e.cefr, e.program_id, o.name`,
      [learnerId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const earnedBadgeCount = row.badges.filter((badge) => badge.earned).length;
    const printable = earnedBadgeCount === row.badges.length && row.badges.length > 0;
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
    return {
      mode, learnerName: issuance?.learner_name ?? row.display_name, cefr: issuance?.level ?? row.cefr,
      cefrLabel: cefrDisplayLabel(issuance?.level ?? row.cefr),
      points: Number(row.points), displayPoints: mode === "preview" ? 420 : Number(row.points),
      season: { name: "Mùa đông", description: "vững vàng" }, simulated: mode === "preview", earnedBadgeCount,
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
          least(p.week_count, greatest(1, floor((current_date - p.start_date) / 7.0)::int + 1)))
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
      webhook_url: string | null;
      webhook_template: string | null;
    }>(
      `select r.id as reminder_id, nd.id as delivery_id, r.message,
              learner.display_name as learner_name,
              nullif(trim(os.configuration->>'baseWebhookUrl'), '') as webhook_url,
              coalesce(nullif(os.configuration->>'baseWebhookTemplate', ''), '{"base_content":"{message}"}') as webhook_template
       from reminders r
       join users learner on learner.id = r.learner_id
       join notification_deliveries nd on nd.reminder_id = r.id
         and nd.provider = 'base_webhook' and nd.status = 'queued'
       left join organization_settings os on os.organization_id = learner.organization_id
       where r.id = $1 and r.status = 'queued'
       order by nd.attempted_at desc
       limit 1`,
      [reminderId]
    );
    const row = result.rows[0];
    if (!row?.webhook_url || !row.webhook_template) return null;
    return {
      reminderId: row.reminder_id,
      deliveryId: row.delivery_id,
      message: row.message,
      learnerName: row.learner_name,
      webhookUrl: row.webhook_url,
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

  async leaseNext(workerId: string, leaseSeconds: number): Promise<LeasedJob | null> {
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
      [workerId, leaseSeconds]
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

  async markFailed(id: string, workerId: string, error: string): Promise<"queued" | "dead" | null> {
    const result = await this.pool.query<{ state: "queued" | "dead" }>(
      `update jobs
       set state = case when attempts >= max_attempts then 'dead' else 'queued' end,
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
      [id, workerId, error]
    );
    return result.rows[0]?.state ?? null;
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

  private async eligibleReminderLearners(db: Pool | PoolClient, organizationId: string, learnerId?: string): Promise<Array<{
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
      missed_days: number;
    }>(
      `select
         u.id as learner_id,
         u.display_name as learner_name,
         nullif(trim(u.email), '') as learner_email,
         (select e.cefr from enrollments e join programs p on p.id = e.program_id
          where e.learner_id = u.id and p.organization_id = $1 order by e.enrolled_at desc limit 1) as cefr,
         activity.last_activity_at,
         inactivity.missed_days
       from users u
       left join organization_settings settings on settings.organization_id = u.organization_id
       left join lateral (
         select max(a.occurred_at) as last_activity_at from activities a where a.learner_id = u.id
       ) activity on true
       cross join lateral (
         select greatest(0, current_date - coalesce(activity.last_activity_at::date, u.created_at::date))::int as missed_days
       ) inactivity
       where u.organization_id = $1 and u.role = 'learner' and u.status = 'active'
         and inactivity.missed_days >= coalesce(settings.reminder_inactive_days, 3)
         and not exists (
           select 1 from audit_events handled
           where handled.organization_id = $1 and handled.entity_id = u.id
              and handled.action in ('reminder.dismissed', 'reminder.queued')
             and handled.created_at >= current_date
         )
         ${learnerId ? "and u.id = $2" : ""}
       order by activity.last_activity_at asc nulls first, u.display_name asc
       ${learnerId ? "for update of u" : ""}`,
      learnerId ? [organizationId, learnerId] : [organizationId]
    );
    return result.rows;
  }

  private async requireEligibleReminderLearner(db: PoolClient, organizationId: string, learnerId: string): Promise<{
    learner_id: string;
    learner_email: string | null;
    missed_days: number;
  }> {
    const eligible = (await this.eligibleReminderLearners(db, organizationId, learnerId))[0];
    if (eligible) return eligible;
    const target = await db.query(
      `select 1 from users
       where id = $1 and organization_id = $2 and role = 'learner' and status = 'active'`,
      [learnerId, organizationId]
    );
    if (!target.rowCount) throw new Error("MANAGER_REMINDER_LEARNER_NOT_FOUND");
    throw new Error("MANAGER_REMINDER_NOT_ELIGIBLE");
  }

  private async organizationFor(staffId: string): Promise<{ id: string; name: string } | null> {
    const organization = await this.pool.query<{ id: string; name: string }>(
      `select o.id, o.name
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
              current_date::text as today,
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
      pilotWeeks: activeProgram?.week_count ?? 2,
      weekOverride: activeProgram?.current_week_override ?? 0,
      minMinutesPerDay: 15,
      courseTheme: "Tiếng Anh giao tiếp công sở", coachDailyLimit: 30,
      testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3,
      levelUp: { days: 14, lessons: 90, firstTry: 75, submission: 80, coach: 4, coachTurns: 6, wrong: 30, minParts: 4 },
      backgroundMusic: { enabled: true, url: "", volume: 22 },
      baseWebhookUrl: "", baseWebhookTemplate: "{\"base_content\":\"{message}\"}"
    };
    const result = await this.pool.query<{ reminder_inactive_days: number; weekly_report_enabled: boolean; configuration: Partial<Omit<ManagerSettingsView, "organizationName">> }>(
      "select reminder_inactive_days, weekly_report_enabled, configuration from organization_settings where organization_id = $1",
      [organizationId]
    );
    const settings = result.rows[0];
    const base = settings
      ? { ...defaults, ...settings.configuration, reminderInactiveDays: settings.reminder_inactive_days, weeklyReportEnabled: settings.weekly_report_enabled,
          programName: activeProgram?.name ?? defaults.programName,
          pilotStartDate: activeProgram?.start_date ?? defaults.pilotStartDate,
          pilotWeeks: activeProgram?.week_count ?? defaults.pilotWeeks,
          weekOverride: 0,
          testTimes: { ...defaults.testTimes, ...settings.configuration?.testTimes },
          levelUp: { ...defaults.levelUp, ...settings.configuration?.levelUp },
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
      credential: decryptProviderSecret(row)
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
           (select count(*) from progress_records pr where pr.learner_id = u.id and pr.status = 'completed')::text as completed_lessons,
           (select count(*)
            from lessons l
            join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
            join lesson_sets ls on ls.id = lsv.lesson_set_id
            join program_weeks pw on pw.id = ls.program_week_id
            where pw.program_id = $2 and pw.week_number = $3
              and ls.cefr = (select e.cefr from enrollments e where e.learner_id = u.id and e.program_id = $2 limit 1))::text as total_lessons_this_week,
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
           (select array_agg(earned.label order by earned.label)
            from (select distinct b.label
                  from reward_events re join badges b on b.id = re.badge_id
                  where re.learner_id = u.id) earned) as earned_badges,
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
              where re.learner_id = u.id
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

  async operations(staffId: string): Promise<ManagerOperationsView | null> {
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
    const operators = await Promise.all(operatorResult.rows.map(async (operator) => {
      const [byWeekResult, totalsResult, approvalResult, evidenceResult, reviewResult] = await Promise.all([
        this.pool.query<{ week_number: number; sets: string; lessons: string; approved: string }>(
          `select pw.week_number,
             count(distinct ls.id)::text as sets,
             count(distinct l.id)::text as lessons,
             count(distinct ls.id) filter (where lsv.status = 'published')::text as approved
           from programs p join program_weeks pw on pw.program_id = p.id
           left join lesson_sets ls on ls.program_week_id = pw.id
           left join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and (lsv.created_by = $2 or lsv.approved_by = $2)
           left join lessons l on l.lesson_set_version_id = lsv.id
           where p.organization_id = $1
           group by pw.week_number order by pw.week_number`, [organization.id, operator.id]
        ),
        this.pool.query<{ sets: string; lessons: string; published: string; full_lessons: string; edited_lessons: string; completions: string; average_score: string | null }>(
          `with owned_versions as (
             select distinct lsv.id, lsv.lesson_set_id, lsv.status from lesson_set_versions lsv
             join lesson_sets ls on ls.id = lsv.lesson_set_id join program_weeks pw on pw.id = ls.program_week_id
             join programs p on p.id = pw.program_id
             where p.organization_id = $1 and (lsv.created_by = $2 or lsv.approved_by = $2)
           ), owned_lessons as (select distinct l.id from lessons l join owned_versions ov on ov.id = l.lesson_set_version_id),
           lesson_shape as (
             select ol.id, latest.content,
                    (select count(*) from lesson_versions lv2 where lv2.lesson_id = ol.id) as version_count
             from owned_lessons ol
             left join lateral (select lv.content from lesson_versions lv where lv.lesson_id = ol.id order by lv.version desc limit 1) latest on true
           )
           select (select count(distinct lesson_set_id) from owned_versions)::text as sets,
             (select count(*) from owned_lessons)::text as lessons,
             (select count(distinct lesson_set_id) from owned_versions where status = 'published')::text as published,
             (select count(*) from lesson_shape s where
                jsonb_array_length(coalesce(s.content->'parts', '[]'::jsonb)) >= 7
                and exists (select 1 from jsonb_array_elements(coalesce(s.content->'parts','[]'::jsonb)) p where p->>'code' = 'vocabulary')
                and exists (select 1 from jsonb_array_elements(coalesce(s.content->'parts','[]'::jsonb)) p where p->>'code' = 'pronunciation')
                and (select count(*) from jsonb_array_elements(coalesce(s.content->'parts','[]'::jsonb)) p where p->>'code' in ('listening','reading','writing','speaking')) = 4)::text as full_lessons,
             (select count(*) from lesson_shape where version_count > 1)::text as edited_lessons,
             (select count(*) from progress_records pr
                join owned_lessons ol on ol.id = pr.lesson_id
                join users learner on learner.id = pr.learner_id and learner.organization_id = $1 and learner.role = 'learner' and learner.status = 'active'
               where pr.status = 'completed')::text as completions,
             (select round(avg(pr.score), 1)::text from progress_records pr
                join owned_lessons ol on ol.id = pr.lesson_id
                join users learner on learner.id = pr.learner_id and learner.organization_id = $1 and learner.role = 'learner' and learner.status = 'active'
               where pr.status = 'completed' and pr.score is not null) as average_score`,
          [organization.id, operator.id]
        ),
        this.pool.query<{ approvals: string; average_approval_hours: string | null }>(
          `select count(*)::text as approvals,
             round(avg(extract(epoch from (ad.decided_at - aa.submitted_at)) / 3600), 1)::text as average_approval_hours
           from assessment_decisions ad join assessment_attempts aa on aa.id = ad.attempt_id
           join users u on u.id = aa.learner_id and u.role = 'learner' and u.status = 'active'
           where u.organization_id = $1 and ad.decided_by = $2 and ad.decided_at is not null and aa.submitted_at is not null`,
          [organization.id, operator.id]
        ),
        this.pool.query<{ parts: string; first_try: string; failed: string; attempts: string }>(
          `with owned_lessons as (
             select distinct l.id from lesson_set_versions lsv
             join lesson_sets ls on ls.id = lsv.lesson_set_id join program_weeks pw on pw.id = ls.program_week_id
             join programs p on p.id = pw.program_id join lessons l on l.lesson_set_version_id = lsv.id
             where p.organization_id = $1 and (lsv.created_by = $2 or lsv.approved_by = $2)
           ), part_results as (
             select value as result from progress_records pr
             join owned_lessons ol on ol.id = pr.lesson_id
             join users learner on learner.id = pr.learner_id and learner.organization_id = $1 and learner.role = 'learner' and learner.status = 'active'
             cross join lateral jsonb_each(case when jsonb_typeof(pr.evidence->'evidence') = 'object' then pr.evidence->'evidence' else pr.evidence end)
             where jsonb_typeof(value) = 'object' and value ? 'attempts'
           ) select count(*)::text as parts,
             count(*) filter (where (result->>'attempts')::int = 1 and coalesce((result->>'score')::numeric, 100) >= 80)::text as first_try,
             count(*) filter (where (result->>'attempts')::int >= 3 and coalesce((result->>'score')::numeric, 0) < 80)::text as failed,
             coalesce(sum((result->>'attempts')::int),0)::text as attempts from part_results`, [organization.id, operator.id]
        ),
        this.pool.query<{ submissions: string; coach: string }>(
          `select
             (select count(*) from practice_submissions ps join users learner on learner.id = ps.learner_id and learner.role = 'learner' and learner.status = 'active' where learner.organization_id = $1 and ps.checked_by = $2)::text as submissions,
             (select count(*) from coach_turns ct join coach_sessions cs on cs.id = ct.session_id join users learner on learner.id = cs.learner_id and learner.role = 'learner' and learner.status = 'active' where learner.organization_id = $1 and ct.feedback->>'checkedBy' = $2::text)::text as coach`, [organization.id, operator.id]
        )
      ]);
      const totals = totalsResult.rows[0] ?? { sets: "0", lessons: "0", published: "0", full_lessons: "0", edited_lessons: "0", completions: "0", average_score: null };
      const approval = approvalResult.rows[0] ?? { approvals: "0", average_approval_hours: null };
      const evidence = evidenceResult.rows[0] ?? { parts: "0", first_try: "0", failed: "0", attempts: "0" };
      const reviews = reviewResult.rows[0] ?? { submissions: "0", coach: "0" };
      const partCount = Number(evidence.parts);
      return {
        operatorId: operator.id, operatorName: operator.display_name,
        byWeek: byWeekResult.rows.map((row) => ({ week: row.week_number, sets: Number(row.sets), lessons: Number(row.lessons), approved: Number(row.approved) })),
        sets: Number(totals.sets), lessons: Number(totals.lessons), published: Number(totals.published),
        fullLessons: Number(totals.full_lessons), editedLessons: Number(totals.edited_lessons), completions: Number(totals.completions),
        averageScore: totals.average_score === null ? null : Number(totals.average_score),
        firstTryPercent: partCount ? Math.round(Number(evidence.first_try) / partCount * 100) : null,
        failedPercent: partCount ? Math.round(Number(evidence.failed) / partCount * 100) : null,
        averageAttempts: partCount ? Math.round(Number(evidence.attempts) / partCount * 10) / 10 : null,
        approvals: Number(approval.approvals), averageApprovalHours: approval.average_approval_hours === null ? null : Number(approval.average_approval_hours),
        reviewedSubmissions: Number(reviews.submissions), reviewedCoachTurns: Number(reviews.coach)
      };
    }));
    return {
      organizationName: organization.name,
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
      levelUp: settings.levelUp,
      accounts: directory.accounts
    };
  }

  async reminders(staffId: string): Promise<ManagerRemindersView | null> {
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;
    const settings = await this.settingsForOrganization(organization.id);
    const candidates = await this.eligibleReminderLearners(this.pool, organization.id);
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
      `select r.id as reminder_id, r.learner_id, u.display_name as learner_name, nullif(trim(u.email), '') as recipient,
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
       left join lateral (
         select a.action, a.payload
         from audit_events a
         where a.organization_id = $1 and a.action in ('reminder.queued', 'reminder.dismissed', 'reminder.copied')
           and a.payload->>'reminderId' = r.id::text
         order by a.created_at desc limit 1
       ) ae on true
       where u.organization_id = $1
       order by r.created_at desc
       limit 30`,
      [organization.id]
    );
    return {
      organizationName: organization.name,
      inactiveDays: settings.reminderInactiveDays,
      webhookConfigured: settings.baseWebhookUrl.trim().length > 0,
      candidates: candidates.map((candidate) => ({
        learnerId: candidate.learner_id,
        learnerName: candidate.learner_name,
        learnerEmail: candidate.learner_email,
        cefr: candidate.cefr,
        lastActivityAt: candidate.last_activity_at?.toISOString() ?? null,
        missedDays: candidate.missed_days
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
      const settingsResult = await client.query<{ configuration: Record<string, unknown> | null }>(
        "select configuration from organization_settings where organization_id = $1",
        [organizationId]
      );
      const configuration = settingsResult.rows[0]?.configuration;
      const webhookUrl = typeof configuration?.baseWebhookUrl === "string" ? configuration.baseWebhookUrl.trim() : "";
      if (channel === "email" && !learner.learner_email) throw new Error("MANAGER_REMINDER_EMAIL_MISSING");
      if (channel === "base" && !webhookUrl) throw new Error("MANAGER_REMINDER_BASE_WEBHOOK_MISSING");
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
         and learner.id = $2 and learner.role = 'learner' and learner.status = 'active'
       left join lateral (
         select e.cefr
         from enrollments e join programs p on p.id = e.program_id and p.status = 'active'
         where e.learner_id = learner.id
         order by e.enrolled_at desc limit 1
       ) enrollment on true
       left join learner_profiles lp on lp.user_id = learner.id
       where manager.id = $1`,
      [managerId, learnerId]
    );
    const learner = learnerResult.rows[0];
    if (!learner) return null;
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

  async deleteRequests(managerId: string): Promise<ManagerDeleteRequestsView | null> {
    const organization = await this.organizationFor(managerId);
    if (!organization) return null;
    const result = await this.pool.query<{
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
       order by ae.created_at desc`,
      [organization.id]
    );
    return {
      requests: result.rows.map((request) => ({
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
      }))
    };
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
        `update appeals set reason = 'Nội dung đã được xoá khi ẩn danh tài khoản.', resolution = null
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
      await client.query("update micro_lessons set content = '{}'::jsonb, progress = '{}'::jsonb where learner_id = $1", [accountId]);
      await client.query("update topic_strikes set topic = 'Đã ẩn danh', reason = 'Nội dung đã được xoá.' where learner_id = $1", [accountId]);
      await client.query("update topic_reports set topic = 'Đã ẩn danh', reason = 'Nội dung đã được xoá.' where learner_id = $1", [accountId]);
      await client.query("update lesson_part_attempts set answer = null, feedback = null, artifact_key = null where learner_id = $1", [accountId]);
      await client.query("update lesson_part_appeals set reason = 'Nội dung đã được xoá.' where learner_id = $1", [accountId]);
      await client.query("update practice_appeals set reason = 'Nội dung đã được xoá.', resolution = null where learner_id = $1", [accountId]);
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
        `select id, start_date::text, week_count, name, current_date::text as today
         from programs
         where organization_id = $1 and status = 'active'
         order by start_date desc
         limit 1
         for update`,
        [organization.id]
      );
      const currentProgram = activeProgram.rows[0];
      const pilotAction = input.pilotCycleAction === "save";
      const { pilotCycleAction: _pilotCycleAction, ...cleanInput } = input;
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
      const savedInput = { ...cleanInput, pilotStartDate: effectiveStartDate, pilotWeeks: effectiveWeeks, weekOverride: 0 };
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
        [randomUUID(), organization.id, managerId, JSON.stringify(savedInput), randomUUID()]
      );
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
    await this.saveSettings(managerId, { ...settings, backgroundMusic });
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
    const due = await client.query<{
      id: string; assessment_attempt_id: string; from_cefr: CefrLevel; to_cefr: CefrLevel;
      approved_by: string; reason: string | null; evidence: Record<string, unknown>; organization_id: string;
    }>(
      `select change.id, change.assessment_attempt_id, change.from_cefr, change.to_cefr,
              change.approved_by, change.reason, change.evidence, learner.organization_id
       from scheduled_level_changes change
       join users learner on learner.id = change.learner_id
       where change.learner_id = $1 and change.status = 'scheduled' and change.effective_at <= now()
       order by change.effective_at for update of change`,
      [learnerId]
    );
    for (const change of due.rows) {
      await client.query(
        "update enrollments set cefr = $2, cefr_approved = true where learner_id = $1",
        [learnerId, change.to_cefr]
      );
      await client.query(
        "update scheduled_level_changes set status = 'applied', applied_at = now() where id = $1 and status = 'scheduled'",
        [change.id]
      );
      await client.query(
        `insert into audit_events
           (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'assessment.level-up.applied', 'assessment_attempt', $4, $5::jsonb, $6)`,
        [randomUUID(), change.organization_id, change.approved_by, change.assessment_attempt_id,
          JSON.stringify({ from: change.from_cefr, to: change.to_cefr, reason: change.reason, evidence: change.evidence }), randomUUID()]
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

async function syncLearnerRewards(db: Pool | PoolClient, learnerId: string): Promise<void> {
  await db.query(
    `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
     select gen_random_uuid(), a.learner_id, null,
       case a.activity_type when 'lesson' then 10 when 'micro_lesson' then 5
         when 'coach' then 2 when 'weekly_practice' then 15 when 'game' then 5 when 'assessment' then 10 else 0 end,
       'activity_points', a.id
     from activities a
     where a.learner_id = $1
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
         and re.source_type = 'activity_points' and re.source_id = a.id and re.badge_id is null)`,
    [learnerId]
  );

  const [lessons, completeWeek, coach, words, firstTry, activityDays] = await Promise.all([
    db.query<{ count: string }>("select count(*)::text as count from progress_records where learner_id = $1 and status = 'completed'", [learnerId]),
    db.query(`select 1 from program_weeks pw join enrollments e on e.program_id = pw.program_id and e.learner_id = $1
      join lesson_sets ls on ls.program_week_id = pw.id and ls.cefr = e.cefr
      join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
      join lessons l on l.lesson_set_version_id = lsv.id
      left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = $1 and pr.status = 'completed'
      group by pw.id having count(l.id) >= 5 and count(pr.id) = count(l.id) limit 1`, [learnerId]),
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
    db.query<{ day: string }>(
      "select distinct occurred_at::date::text as day from activities where learner_id = $1 order by day", [learnerId]
    )
  ]);
  await db.query(
    `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
     select gen_random_uuid(), $1, null, 20, 'full_week_bonus', completed.program_week_id
     from (
       select pw.id as program_week_id
       from program_weeks pw
       join enrollments e on e.program_id = pw.program_id and e.learner_id = $1
       join lesson_sets ls on ls.program_week_id = pw.id and ls.cefr = e.cefr
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
       join lessons l on l.lesson_set_version_id = lsv.id
       left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = $1 and pr.status = 'completed'
       group by pw.id
       having count(l.id) >= 5 and count(pr.id) = count(l.id)
     ) completed
     on conflict (learner_id, source_type, source_id) where badge_id is null do nothing`,
    [learnerId]
  );
  const earned = new Set<string>();
  if (Number(lessons.rows[0]?.count ?? 0) >= 1) earned.add("starter");
  if (completeWeek.rowCount) earned.add("week_complete");
  if (Number(coach.rows[0]?.count ?? 0) >= 10) earned.add("coach_friend");
  if (Number(words.rows[0]?.count ?? 0) >= 15) earned.add("wordsmith");
  if (firstTry.rows.some((row) => isFirstTryLesson(row.evidence))) earned.add("first_try");
  const longest = longestBusinessDayStreak(activityDays.rows.map((row) => row.day));
  if (longest >= 3) earned.add("streak3");
  if (longest >= 5) earned.add("streak5");

  for (const badgeKey of earned) {
    await db.query(
      `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
       select gen_random_uuid(), $1, b.id, 0, 'achievement', $1
       from users u join badges b on b.organization_id = u.organization_id and b.badge_key = $2
       where u.id = $1
       on conflict (learner_id, badge_id) where badge_id is not null do nothing`,
      [learnerId, badgeKey]
    );
  }
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

function longestBusinessDayStreak(days: string[]): number {
  let longest = 0;
  let current = 0;
  let previous: Date | undefined;
  for (const day of days) {
    const date = new Date(`${day}T00:00:00Z`);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const expected = previous ? nextBusinessDay(previous) : undefined;
    current = !previous || expected?.toISOString().slice(0, 10) === day ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

function nextBusinessDay(date: Date): Date {
  const next = new Date(date);
  do next.setUTCDate(next.getUTCDate() + 1); while (next.getUTCDay() === 0 || next.getUTCDay() === 6);
  return next;
}

export function createRepositories(pool: Pool) {
  return {
    identity: new IdentityRepository(pool),
    learning: new LearningRepository(pool),
    assessments: new AssessmentRepository(pool),
    coach: new CoachRepository(pool),
    content: new ContentRepository(pool),
    engagement: new EngagementRepository(pool),
    notifications: new NotificationRepository(pool),
    files: new FileRepository(pool),
    aiRuns: new AiRunRepository(pool),
    jobs: new JobRepository(pool),
    manager: new ManagerRepository(pool)
  };
}

export type DatabaseRepositories = ReturnType<typeof createRepositories>;
