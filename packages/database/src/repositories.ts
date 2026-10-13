import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  AccountRole,
  AssessmentEvidenceType,
  AssessmentKind,
  AssessmentSectionCode,
  AssessmentSnapshot,
  BadgeRoadmapItem,
  CefrLevel,
  ContentLessonDraftInput,
  ContentLessonMatrixView,
  ContentLessonSetVersionView,
  ContentPromptKey,
  ContentPromptSettingsView,
  ContentReviewView,
  ContentWeekFrameView,
  ContentWeekInput,
  CoachFeedbackView,
  CoachPersona,
  CoachView,
  LearnerProfileData,
  LearnerProgressView,
  LevelReadinessMetric,
  LevelReadinessView,
  LessonContent,
  LessonProgressView,
  MicroLessonView
} from "@e4s/contracts";
import type { StoredAssessmentDefinition } from "./assessment-blueprints.js";

export interface UserIdentity {
  id: string;
  displayName: string;
  email: string | null;
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
  weekId: string;
  weekNumber: number;
  topic: string;
  description: string;
  objectives: string[];
  cefr: string | null;
}

export interface LearnerProfileRecord {
  profile: Partial<LearnerProfileData>;
  version: number;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface LearnerLessonRecord {
  id: string;
  title: string;
  dayNumber: number;
  cefr: CefrLevel;
  content: LessonContent & { durationMinutes?: number };
  progress: LessonProgressView;
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

export interface PublishedAssessmentRecord {
  definitionId: string;
  versionId: string;
  assessmentKey: string;
  kind: "placement" | "final" | "level_up";
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
  startedAt: Date;
  submittedAt: Date | null;
  updatedAt: Date;
  responses: AssessmentResponseRecord[];
  scores: Partial<Record<AssessmentSectionCode, number>>;
  audioPlayCounts: Record<string, number>;
  suggestedLevel: CefrLevel | null;
}

export interface AssessmentReviewQueueRecord {
  attemptId: string;
  learnerId: string;
  learnerName: string;
  kind: AssessmentKind;
  title: string;
  submittedAt: Date;
  sectionScores: Partial<Record<AssessmentSectionCode, number>>;
  suggestedLevel: CefrLevel | null;
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
}

class IdentityRepository {
  constructor(private readonly pool: Pool) {}

  async findUserByEmail(email: string): Promise<UserIdentity | null> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      email: string | null;
      role: AccountRole;
      status: string;
    }>(
      `select id, display_name, email, role, status
       from users
       where lower(email) = lower($1)
       limit 1`,
      [email]
    );
    const row = result.rows[0];
    return row
      ? { id: row.id, displayName: row.display_name, email: row.email, role: row.role, status: row.status }
      : null;
  }

  async findCredentialByEmail(email: string): Promise<UserCredentialRecord | null> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      email: string | null;
      role: AccountRole;
      status: string;
      credential_hash: string;
    }>(
      `select u.id, u.display_name, u.email, u.role, u.status, c.credential_hash
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
          role: row.role,
          status: row.status,
          credentialHash: row.credential_hash
        }
      : null;
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
      role: AccountRole;
      status: string;
    }>(
      `select s.id as session_id, s.expires_at, u.id, u.display_name, u.email, u.role, u.status
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
          role: row.role,
          status: row.status
        }
      : null;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.pool.query(
      `update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`,
      [tokenHash]
    );
  }
}

class LearningRepository {
  constructor(private readonly pool: Pool) {}

  async getActiveContext(learnerId: string): Promise<ActiveLearningContext | null> {
    const result = await this.pool.query<{
      program_id: string;
      program_name: string;
      week_id: string;
      week_number: number;
      topic: string;
      description: string;
      objectives: string[];
      cefr: string | null;
    }>(
      `select p.id as program_id, p.name as program_name,
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
      version: number;
      completed_at: Date | null;
      updated_at: Date;
    }>(
      `select lp.profile, lp.version, lp.completed_at, lp.updated_at
       from learner_profiles lp
       join users u on u.id = lp.user_id and u.role = 'learner' and u.status = 'active'
       where lp.user_id = $1`,
      [learnerId]
    );
    const row = result.rows[0];
    return row ? {
      profile: row.profile,
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
    const result = await this.pool.query<{
      profile: LearnerProfileData;
      version: number;
      completed_at: Date | null;
      updated_at: Date;
    }>(
      `insert into learner_profiles (user_id, profile, version, completed_at)
       values ($1, $2::jsonb, 1, case when $4 then now() else null end)
       on conflict (user_id) do update
       set profile = excluded.profile,
           version = learner_profiles.version + 1,
           completed_at = case when $4 then coalesce(learner_profiles.completed_at, now()) else null end,
           updated_at = now()
       where learner_profiles.version = $3
       returning profile, version, completed_at, updated_at`,
      [input.learnerId, JSON.stringify(input.profile), input.expectedVersion, input.complete]
    );
    const row = result.rows[0];
    return row ? {
      profile: row.profile,
      version: row.version,
      completedAt: row.completed_at,
      updatedAt: row.updated_at
    } : null;
  }

  async listLessons(learnerId: string, weekId: string): Promise<LearnerLessonRecord[]> {
    const result = await this.pool.query<{
      id: string;
      title: string;
      day_number: number;
      cefr: CefrLevel;
      content: LessonContent & { durationMinutes?: number };
      progress_status: LessonProgressView["status"] | null;
      progress_score: string | null;
      progress_evidence: Record<string, unknown> | null;
      progress_updated_at: Date | null;
    }>(
      `select l.id, l.title, l.day_number, ls.cefr, lv.content,
              pr.status as progress_status, pr.score::text as progress_score,
              pr.evidence as progress_evidence, pr.updated_at as progress_updated_at
       from enrollments e
       join lesson_sets ls on ls.program_week_id = $2 and ls.cefr = e.cefr
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
       join lessons l on l.lesson_set_version_id = lsv.id
       join lateral (
         select content from lesson_versions
         where lesson_id = l.id and status = 'published'
         order by version desc limit 1
       ) lv on true
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
      cefr: CefrLevel;
      content: LessonContent & { durationMinutes?: number };
      progress_status: LessonProgressView["status"] | null;
      progress_score: string | null;
      progress_evidence: Record<string, unknown> | null;
      progress_updated_at: Date | null;
    }>(
      `select l.id, l.title, l.day_number, ls.cefr, lv.content,
              pr.status as progress_status, pr.score::text as progress_score,
              pr.evidence as progress_evidence, pr.updated_at as progress_updated_at
       from lessons l
       join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
       join lesson_sets ls on ls.id = lsv.lesson_set_id
       join program_weeks pw on pw.id = ls.program_week_id
       join enrollments e on e.program_id = pw.program_id and e.cefr = ls.cefr and e.learner_id = $1
       join lateral (
         select content from lesson_versions
         where lesson_id = l.id and status = 'published'
         order by version desc limit 1
       ) lv on true
       left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = e.learner_id
       where l.id = $2
       limit 1`,
      [learnerId, lessonId]
    );
    return result.rows[0] ? mapLessonRow(result.rows[0]) : null;
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
    return mapProgress(row.status, row.score, row.evidence, row.updated_at);
  }

  async getProgressDashboard(learnerId: string): Promise<LearnerProgressView | null> {
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

    const [reward, weeks, study, activity, badgeRoadmap, coach, practice, assessments, availability, firstTry] = await Promise.all([
      this.pool.query<{ points: string; badges: Array<{ key: string; label: string }> }>(
        `select coalesce(sum(re.points), 0)::text as points,
                coalesce(jsonb_agg(distinct jsonb_build_object('key', b.badge_key, 'label', b.label))
                  filter (where b.id is not null), '[]'::jsonb) as badges
         from reward_events re left join badges b on b.id = re.badge_id
         where re.learner_id = $1`, [learnerId]
      ),
      this.pool.query<{ week_number: number; topic: string; completed_lessons: string; total_lessons: string }>(
        `select pw.week_number, pw.topic,
                count(pr.id) filter (where pr.status = 'completed')::text as completed_lessons,
                count(l.id)::text as total_lessons
         from enrollments e
         join program_weeks pw on pw.program_id = e.program_id
         left join lesson_sets ls on ls.program_week_id = pw.id and ls.cefr = e.cefr
         left join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
         left join lessons l on l.lesson_set_version_id = lsv.id
         left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = e.learner_id
         where e.learner_id = $1
         group by pw.id order by pw.week_number`, [learnerId]
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
      this.pool.query<{ turns_this_week: string; turns_14_days: string; rubric_average: string | null }>(
        `select
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= date_trunc('week', now()))::text as turns_this_week,
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= now() - interval '14 days')::text as turns_14_days,
           avg((ct.feedback->>'rubricScore')::numeric) filter (
             where ct.speaker = 'learner' and ct.created_at >= now() - interval '14 days'
               and ct.feedback ? 'rubricScore'
           )::text as rubric_average
         from coach_sessions cs left join coach_turns ct on ct.session_id = cs.id
         where cs.learner_id = $1`, [learnerId]
      ),
      this.pool.query<{ status: string; total: string | null }>(
        `select ps.status, ps.score->>'total' as total
         from practice_submissions ps where ps.learner_id = $1
         order by coalesce(ps.reviewed_at, ps.submitted_at, ps.updated_at) desc limit 1`, [learnerId]
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
         where aa.learner_id = $1 and aa.status in ('submitted', 'pending_review', 'approved')
         order by aa.submitted_at desc nulls last`, [learnerId]
      ),
      this.pool.query<{ final_available: boolean; levelup_available: boolean }>(
        `select
           exists(select 1 from assessment_versions av join assessment_definitions ad on ad.id = av.definition_id
             where av.status = 'published' and ad.kind = 'final') as final_available,
           exists(select 1 from assessment_versions av join assessment_definitions ad on ad.id = av.definition_id
             where av.status = 'published' and ad.kind = 'level_up'
               and av.blueprint->>'targetLevel' = $1) as levelup_available`,
        [nextCefr(row.cefr)]
      ),
      this.pool.query<{ evidence: { evidence?: Record<string, { attempts?: number; score?: number }> } }>(
        `select evidence from progress_records
         where learner_id = $1 and updated_at >= now() - interval '14 days'`, [learnerId]
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
    const coachSummary = coach.rows[0] ?? { turns_this_week: "0", turns_14_days: "0", rubric_average: null };
    const latestPractice = practice.rows[0];
    const totalLessons = weeks.rows.reduce((sum, week) => sum + Number(week.total_lessons), 0);
    const completedLessons = weeks.rows.reduce((sum, week) => sum + Number(week.completed_lessons), 0);
    const lessonCompletion = totalLessons ? completedLessons / totalLessons * 100 : 0;
    const firstTryParts = firstTry.rows.flatMap((item) => Object.values(item.evidence.evidence ?? {}));
    const firstTryCorrect = firstTryParts.filter((item) => item.attempts === 1 && (item.score === undefined || item.score >= 80)).length;
    const firstTryAccuracy = firstTryParts.length ? firstTryCorrect / firstTryParts.length * 100 : 0;
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
      examAvailable: Boolean(availability.rows[0]?.levelup_available)
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
        totalLessons: Number(week.total_lessons)
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
        studyDays: Number(study.rows[0]?.count ?? 0)
      },
      assessments: assessmentViews,
      finalAssessmentAvailable: Boolean(availability.rows[0]?.final_available)
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
    return micro ? {
      id: micro.id,
      topic: micro.topic,
      cefr: micro.cefr,
      ...micro.content,
      ...(micro.progress.attempt ? { attempt: micro.progress.attempt } : {}),
      ...(micro.progress.feedback ? { feedback: micro.progress.feedback } : {}),
      ...(micro.completed_at ? { completedAt: micro.completed_at.toISOString() } : {})
    } : null;
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
    return updated.rowCount ? this.findMicroLesson(learnerId, microLessonId) : null;
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

function buildLevelReadiness(input: {
  cefr: CefrLevel | null;
  lessonCompletion: number; completedLessons: number; totalLessons: number;
  firstTryAccuracy: number; firstTryCorrect: number; firstTryTotal: number;
  weeklyPractice: number; coachRubric: number; coachTurns: number; examAvailable: boolean;
}): LevelReadinessView {
  const criteria: LevelReadinessMetric[] = [
    { key: "lessonCompletion", label: "Bài học hoàn thành", current: round(input.lessonCompletion), target: 90,
      display: `${input.completedLessons}/${input.totalLessons} bài`, met: input.lessonCompletion >= 90 },
    { key: "firstTryAccuracy", label: "Phần bài đúng ngay lần đầu", current: round(input.firstTryAccuracy), target: 75,
      display: `${input.firstTryCorrect}/${input.firstTryTotal} phần`, met: input.firstTryAccuracy >= 75 },
    { key: "weeklyPractice", label: "Bài thực hành tuần gần nhất", current: input.weeklyPractice, target: 80,
      display: input.weeklyPractice ? `${input.weeklyPractice}/100` : "Chưa có bài được chấm", met: input.weeklyPractice >= 80 },
    { key: "coachRubric", label: "Rubric khi luyện với Season", current: round(input.coachRubric), target: 4,
      display: `${round(input.coachRubric)}/5 · ${input.coachTurns} lượt`, met: input.coachRubric >= 4 && input.coachTurns >= 6 }
  ];
  return {
    targetLevel: nextCefr(input.cefr),
    windowDays: 14,
    eligible: criteria.every((criterion) => criterion.met),
    examAvailable: input.examAvailable,
    criteria
  };
}

function buildAssessmentSnapshots(rows: Array<{
  kind: string; total_score: string; approved_level: CefrLevel | null;
  section: "listening" | "reading" | "writing" | "speaking"; section_score: string;
}>): { placement: AssessmentSnapshot | null; final: AssessmentSnapshot | null } {
  const build = (kind: string): AssessmentSnapshot | null => {
    const selected = rows.filter((row) => row.kind === kind);
    if (!selected.length) return null;
    return {
      totalScore: Number(selected[0]?.total_score ?? 0),
      approvedLevel: selected[0]?.approved_level ?? null,
      sections: Object.fromEntries(selected.map((row) => [row.section, Number(row.section_score)]))
    };
  };
  return { placement: build("placement"), final: build("final") };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function mapLessonRow(row: {
  id: string;
  title: string;
  day_number: number;
  cefr: CefrLevel;
  content: LessonContent & { durationMinutes?: number };
  progress_status: LessonProgressView["status"] | null;
  progress_score: string | null;
  progress_evidence: Record<string, unknown> | null;
  progress_updated_at: Date | null;
}): LearnerLessonRecord {
  return {
    id: row.id,
    title: row.title,
    dayNumber: row.day_number,
    cefr: row.cefr,
    content: row.content,
    progress: mapProgress(
      row.progress_status ?? "not_started",
      row.progress_score,
      row.progress_evidence ?? {},
      row.progress_updated_at
    )
  };
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

class ContentRepository {
  constructor(private readonly pool: Pool) {}

  async listWeeks(staffId: string): Promise<ContentWeekFrameView | null> {
    const result = await this.pool.query<{
      program_id: string;
      start_date: string;
      week_count: number;
      current_week_override: number | null;
      id: string | null;
      week_number: number | null;
      topic: string | null;
      description: string | null;
      objectives: unknown;
      key_vocab_hint: string | null;
    }>(
      `select p.id as program_id, p.start_date::text, p.week_count, p.current_week_override,
              pw.id, pw.week_number, pw.topic, pw.description, pw.objectives, pw.key_vocab_hint
       from users staff
       join programs p on p.organization_id = staff.organization_id and p.status = 'active'
       left join program_weeks pw on pw.program_id = p.id
       where staff.id = $1
       order by pw.week_number`,
      [staffId]
    );
    const first = result.rows[0];
    if (!first) return null;
    const start = new Date(`${first.start_date}T00:00:00.000Z`);
    const today = new Date();
    const dateText = (value: Date) => value.toISOString().slice(0, 10);
    return {
      pilot: { startDate: first.start_date, weekCount: first.week_count },
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
          keyVocabHint: row.key_vocab_hint ?? ""
        }];
      })
    };
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
        await client.query(
          `insert into program_weeks
             (id, program_id, week_number, topic, description, objectives, key_vocab_hint)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7)
           on conflict (program_id, week_number) do update set
             topic = excluded.topic, description = excluded.description,
             objectives = excluded.objectives, key_vocab_hint = excluded.key_vocab_hint`,
          [randomUUID(), row.id, week.weekNumber, week.topic.trim(), week.description.trim(),
            JSON.stringify(week.objectives.trim() ? [week.objectives.trim()] : []), week.keyVocabHint.trim()]
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

  async lessonMatrix(staffId: string): Promise<ContentLessonMatrixView | null> {
    const program = await this.pool.query<{ id: string }>(
      `select p.id from users staff
       join programs p on p.organization_id = staff.organization_id and p.status = 'active'
       where staff.id = $1 limit 1`,
      [staffId]
    );
    const programId = program.rows[0]?.id;
    if (!programId) return null;
    const levelsResult = await this.pool.query<{ cefr: CefrLevel; learner_count: string }>(
      `with supported(cefr, sort_order) as (
         values ('A1', 1), ('A2', 2), ('B1', 3), ('B2', 4)
       ), learner_counts as (
         select cefr, count(*)::integer as learner_count from enrollments
         where program_id = $1 and cefr is not null group by cefr
       )
       select supported.cefr, coalesce(learner_counts.learner_count, 0)::text as learner_count
       from supported left join learner_counts using (cefr)
       order by supported.sort_order`,
      [programId]
    );
    const levels = levelsResult.rows.map((row) => ({ cefr: row.cefr, learnerCount: Number(row.learner_count) }));
    const weeksResult = await this.pool.query<{ week_number: number; topic: string }>(
      "select week_number, topic from program_weeks where program_id = $1 order by week_number",
      [programId]
    );
    const weeks: ContentLessonMatrixView["weeks"] = [];
    for (const week of weeksResult.rows) {
      const cells: ContentLessonMatrixView["weeks"][number]["cells"] = [];
      for (const level of levels) {
        const version = await this.pool.query<{
          version_id: string;
          version: number;
          status: Exclude<ContentLessonSetVersionView["status"], "retired"> | "retired";
          created_at: Date;
          lessons: Array<{ dayNumber: number; title: string }>;
        }>(
          `select lsv.id as version_id, lsv.version, lsv.status, lsv.created_at,
                  coalesce(json_agg(json_build_object('dayNumber', l.day_number, 'title', l.title)
                    order by l.day_number) filter (where l.id is not null), '[]') as lessons
           from lesson_sets ls
           join program_weeks pw on pw.id = ls.program_week_id
           join lesson_set_versions lsv on lsv.lesson_set_id = ls.id
           left join lessons l on l.lesson_set_version_id = lsv.id
           where pw.program_id = $1 and pw.week_number = $2 and ls.cefr = $3
           group by lsv.id
           order by lsv.version desc limit 1`,
          [programId, week.week_number, level.cefr]
        );
        const row = version.rows[0];
        cells.push(row ? {
          cefr: level.cefr,
          status: row.status,
          versionId: row.version_id,
          version: row.version,
          updatedAt: row.created_at.toISOString(),
          lessons: row.lessons
        } : {
          cefr: level.cefr, status: "missing", versionId: null, version: null, updatedAt: null, lessons: []
        });
      }
      weeks.push({ weekNumber: week.week_number, topic: week.topic, cells });
    }
    return { levels, weeks };
  }

  async saveLessonDraft(
    actorId: string,
    weekNumber: number,
    cefr: CefrLevel,
    lessonDrafts: readonly ContentLessonDraftInput[]
  ): Promise<ContentLessonSetVersionView> {
    const client = await this.pool.connect();
    let versionId = "";
    try {
      await client.query("begin");
      const context = await client.query<{ organization_id: string; week_id: string }>(
        `select p.organization_id, pw.id as week_id
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
          JSON.stringify({ source: "manual", lessonCount: lessonDrafts.length }), actorId]
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
    }>(
      `select ls.id as lesson_set_id, lsv.id as version_id, lsv.version, lsv.status,
              pw.week_number, pw.topic, ls.cefr, lsv.created_by, lsv.approved_by,
              lsv.created_at, lsv.published_at
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
      lessons: lessons.rows.map((lesson) => ({
        id: lesson.id,
        dayNumber: lesson.day_number,
        title: lesson.title,
        durationMinutes: lesson.content.durationMinutes ?? 10,
        parts: lesson.content.parts ?? [],
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
       where staff.id = $1 order by lsv.version desc limit 1`,
      [staffId, weekNumber, cefr]
    );
    const id = result.rows[0]?.id;
    return id ? this.lessonSetVersion(staffId, id) : null;
  }

  async submitVersionForReview(actorId: string, versionId: string): Promise<ContentLessonSetVersionView | null> {
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
      if (row.created_by === checkerId) throw new Error("CONTENT_MAKER_CANNOT_APPROVE");
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
        (select count(*) from practice_submissions ps join users u on u.id = ps.learner_id where u.organization_id = $1)::text as submissions,
        (select count(*) from coach_turns ct join coach_sessions cs on cs.id = ct.session_id join users u on u.id = cs.learner_id where u.organization_id = $1 and ct.speaker = 'learner')::text as coach,
        (select count(*) from micro_lessons ml join users u on u.id = ml.learner_id where u.organization_id = $1)::text as micro,
        (select count(*) from appeals a join assessment_attempts aa on aa.id = a.attempt_id join users u on u.id = aa.learner_id where u.organization_id = $1)::text as appeals,
        (select count(*) from assessment_attempts aa join users u on u.id = aa.learner_id where u.organization_id = $1)::text as attempts,
        (select count(*) from assessment_versions av join assessment_definitions ad on ad.id = av.definition_id where ad.organization_id = $1)::text as assessments`,
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
       join users u on u.id = cs.learner_id and u.organization_id = $1
       left join enrollments e on e.learner_id = u.id
       left join programs p on p.id = e.program_id
       left join program_weeks pw on pw.program_id = p.id
         and pw.week_number = greatest(1, least(p.week_count, ((ct.created_at::date - p.start_date) / 7) + 1))
       where ct.speaker = 'learner'
       order by ct.created_at desc limit 50`,
      [organizationId]
    );
    return {
      tabs: [
        { key: "submissions", label: "Bài nộp", count: Number(count.submissions), unreadCount: 0 },
        { key: "coach", label: "Phản hồi coach", count: Number(count.coach) },
        { key: "micro", label: "Bài siêu ngắn", count: Number(count.micro) },
        { key: "appeals", label: "Kháng nghị", count: Number(count.appeals) },
        { key: "attempts", label: "Số lần làm bài", count: Number(count.attempts) },
        { key: "assessments", label: "Bài test", count: Number(count.assessments) }
      ],
      coachSamples: coach.rows.map((row) => {
        const feedback = row.feedback ?? {};
        const rubric = feedback.rubric && typeof feedback.rubric === "object" ? feedback.rubric as Record<string, unknown> : {};
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
            meaning: numberOrNull(rubric.meaning),
            vocabulary: numberOrNull(rubric.vocabulary),
            grammar: numberOrNull(rubric.grammar)
          },
          suggestions: Array.isArray(feedback.suggestions)
            ? feedback.suggestions.flatMap((value) => {
                if (typeof value === "string") return [value];
                if (!value || typeof value !== "object" || Array.isArray(value)) return [];
                const suggestion = value as Record<string, unknown>;
                if (typeof suggestion.original !== "string" || typeof suggestion.corrected !== "string") return [];
                const explanation = typeof suggestion.explanation === "string" ? ` — ${suggestion.explanation}` : "";
                return [`${suggestion.original} → ${suggestion.corrected}${explanation}`];
              }) : []
        };
      })
    };
  }

  async promptSettings(staffId: string): Promise<Omit<ContentPromptSettingsView["groups"][number], "label">[]> {
    const organization = await this.pool.query<{ organization_id: string }>(
      "select organization_id from users where id = $1", [staffId]
    );
    const organizationId = organization.rows[0]?.organization_id;
    if (!organizationId) return [];
    const result = await this.pool.query<{
      task_key: ContentPromptKey; version: number; content: string; status: "draft" | "active" | "retired"; default_content: string;
    }>(
      `select distinct on (latest.task_key) latest.task_key, latest.version, latest.content, latest.status,
              first_value(latest.content) over (partition by latest.task_key order by latest.version) as default_content
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
                  coalesce((array_agg(content order by version))[1], '') as default_content
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

function practiceLabel(parts: readonly { code: string; content: Record<string, unknown> }[]): string {
  const writing = parts.find((part) => part.code === "writing")?.content;
  const type = writing && typeof writing.type === "string" ? writing.type : "bài tập";
  const answer = writing && typeof writing.answer === "string" ? writing.answer : "";
  return answer ? `${type} · đáp án: ${answer}` : type;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

class AssessmentRepository {
  constructor(private readonly pool: Pool) {}

  async findPublished(kind: AssessmentKind): Promise<PublishedAssessmentRecord | null> {
    const databaseKind = kind === "level-up" ? "level_up" : kind;
    const result = await this.pool.query<{
      definition_id: string;
      version_id: string;
      assessment_key: string;
      kind: "placement" | "final" | "level_up";
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
         and status in ('in_progress', 'submitted', 'pending_review')
       order by started_at desc limit 1`,
      [learnerId, assessmentVersionId]
    );
    const id = result.rows[0]?.id;
    return id ? this.findAttempt(learnerId, id) : null;
  }

  async findAttempt(learnerId: string, attemptId: string): Promise<AssessmentAttemptRecord | null> {
    const result = await this.pool.query<{
      id: string;
      assessment_version_id: string;
      learner_id: string;
      status: AssessmentAttemptRecord["status"];
      current_section: AssessmentSectionCode | null;
      timing_state: AssessmentAttemptRecord["timingState"];
      started_at: Date;
      submitted_at: Date | null;
      updated_at: Date;
      suggested_level: CefrLevel | null;
    }>(
      `select aa.id, aa.assessment_version_id, aa.learner_id, aa.status, aa.current_section,
              aa.timing_state, aa.started_at, aa.submitted_at, aa.updated_at, dec.suggested_level
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
    return {
      id: row.id,
      assessmentVersionId: row.assessment_version_id,
      learnerId: row.learner_id,
      status: row.status,
      currentSection: row.current_section,
      timingState: row.timing_state ?? {},
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

  async startAttempt(input: {
    learnerId: string;
    assessmentVersionId: string;
    firstSection: AssessmentSectionCode;
    durationMinutes: number;
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
           (id, assessment_version_id, learner_id, status, current_section, timing_state, started_at, updated_at)
         values ($1, $2, $3, 'in_progress', $4, $5::jsonb, $6, $6)`,
        [id, input.assessmentVersionId, input.learnerId, input.firstSection, JSON.stringify(timingState), startedAt]
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

  async submitAttempt(learnerId: string, attemptId: string): Promise<AssessmentAttemptRecord | null> {
    const result = await this.pool.query(
      `update assessment_attempts
       set status = 'pending_review', current_section = null, submitted_at = now(), updated_at = now()
       where id = $1 and learner_id = $2 and status = 'in_progress' and current_section = 'speaking'
       returning id`,
      [attemptId, learnerId]
    );
    return result.rowCount ? this.findAttempt(learnerId, attemptId) : null;
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
       where aa.id = $2 and aa.learner_id = $3 and aa.status = 'in_progress'
       on conflict (attempt_id, section)
       do update set score = excluded.score, criteria = excluded.criteria, source = excluded.source,
                     created_at = now()
       returning id`,
      [randomUUID(), input.attemptId, input.learnerId, input.section, input.score, JSON.stringify(input.criteria), input.source]
    );
    return Boolean(result.rowCount);
  }

  async listPending(reviewerId: string): Promise<AssessmentReviewQueueRecord[]> {
    const result = await this.pool.query<{
      attempt_id: string;
      learner_id: string;
      learner_name: string;
      kind: "placement" | "final" | "level_up";
      title: string;
      submitted_at: Date;
      section_scores: Partial<Record<AssessmentSectionCode, number>> | null;
      suggested_level: CefrLevel | null;
    }>(
      `select aa.id as attempt_id, aa.learner_id, learner.display_name as learner_name,
              ad.kind, ad.title, aa.submitted_at,
              coalesce(jsonb_object_agg(sc.section, sc.score) filter (where sc.section is not null), '{}'::jsonb) as section_scores,
              decision.suggested_level
       from assessment_attempts aa
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id
       join users learner on learner.id = aa.learner_id
       join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
       left join assessment_scores sc on sc.attempt_id = aa.id
       left join assessment_decisions decision on decision.attempt_id = aa.id
       where aa.status = 'pending_review'
       group by aa.id, learner.display_name, ad.kind, ad.title, decision.suggested_level
       order by aa.submitted_at nulls last, aa.started_at`,
      [reviewerId]
    );
    return result.rows.map((row) => ({
      attemptId: row.attempt_id,
      learnerId: row.learner_id,
      learnerName: row.learner_name,
      kind: row.kind === "level_up" ? "level-up" : row.kind,
      title: row.title,
      submittedAt: row.submitted_at,
      sectionScores: Object.fromEntries(Object.entries(row.section_scores ?? {}).map(([section, score]) => [section, Number(score)])),
      suggestedLevel: row.suggested_level
    }));
  }

  async getReviewOverview(reviewerId: string): Promise<{
    pending: AssessmentReviewQueueRecord[];
    approvedLearners: AssessmentApprovedLearnerRecord[];
    unassessedLearners: AssessmentUnassessedLearnerRecord[];
  }> {
    const [pending, approved, unassessed] = await Promise.all([
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
                null::text as monthly_goal
         from users learner
         join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
         join enrollments e on e.learner_id = learner.id and e.cefr_approved = true
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
         where learner.role = 'learner'
         order by learner.display_name`,
        [reviewerId]
      ),
      this.pool.query<{
        learner_id: string;
        learner_name: string;
        profile_complete: boolean;
      }>(
        `select learner.id as learner_id, learner.display_name as learner_name,
                (lp.completed_at is not null) as profile_complete
         from users learner
         join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
         left join learner_profiles lp on lp.user_id = learner.id
         where learner.role = 'learner'
           and not exists (
             select 1 from assessment_attempts aa
             join assessment_versions av on av.id = aa.assessment_version_id
             join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'placement'
             where aa.learner_id = learner.id and aa.status = 'approved'
           )
         order by learner.display_name`,
        [reviewerId]
      )
    ]);
    return {
      pending,
      approvedLearners: approved.rows.map((row) => ({
        learnerId: row.learner_id,
        learnerName: row.learner_name,
        currentLevel: row.current_level,
        placementScore: row.placement_score === null ? null : Number(row.placement_score),
        monthlyGoal: row.monthly_goal
      })),
      unassessedLearners: unassessed.rows.map((row) => ({
        learnerId: row.learner_id,
        learnerName: row.learner_name,
        profileComplete: row.profile_complete
      }))
    };
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
       join assessment_versions av on av.definition_id = ad.id and av.status = 'published'
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
      }];
    });
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
      }>(
        `select aa.learner_id, learner.organization_id, aa.status
         from assessment_attempts aa
         join users learner on learner.id = aa.learner_id
         join users reviewer on reviewer.id = $2
           and reviewer.organization_id = learner.organization_id
           and reviewer.role = 'operator'
         where aa.id = $1
         for update of aa`,
        [input.attemptId, input.reviewerId]
      );
      const attempt = locked.rows[0];
      if (!attempt || !["pending_review", "approved", "needs_retry"].includes(attempt.status)) {
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
      if (input.status === "approved" && input.approvedLevel) {
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
          JSON.stringify({ status: input.status, approvedLevel: input.approvedLevel, reason: input.reason }), randomUUID()]
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
      session_id: string | null;
    }>(
      `select u.display_name, e.cefr, pw.topic, cs.id as session_id, cs.scenario
       from users u
       join enrollments e on e.learner_id = u.id
       join programs p on p.id = e.program_id and p.status = 'active'
       join program_weeks pw on pw.program_id = p.id
         and pw.week_number = coalesce(p.current_week_override,
           greatest(1, least(p.week_count, ((current_date - p.start_date) / 7) + 1)))
       left join lateral (
         select id, scenario from coach_sessions
         where learner_id = u.id and status = 'active'
         order by started_at desc limit 1
       ) cs on true
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
    const [turns, counters, vocabularyRows] = await Promise.all([
      this.pool.query<{
        id: string; speaker: string; content: Record<string, unknown>;
        feedback: Record<string, unknown> | null; created_at: Date;
      }>(
        `select id, speaker, content, feedback, created_at from coach_turns
         where session_id = $1 order by turn_number, created_at`, [sessionId]
      ),
      this.pool.query<{ daily_used: string; weekly_turns: string }>(
        `select
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= current_date)::text as daily_used,
           count(*) filter (where ct.speaker = 'learner' and ct.created_at >= date_trunc('week', now()))::text as weekly_turns
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
      )
    ]);
    const messages: CoachView["messages"] = [];
    const openedWords = new Set<string>();
    for (const turn of turns.rows) {
      const text = typeof turn.content.text === "string" ? turn.content.text : "";
      const feedback = coachFeedback(turn.feedback);
      const feedbackRecord = turn.feedback ?? {};
      if (Array.isArray(feedbackRecord.usedWords)) {
        for (const word of feedbackRecord.usedWords) if (typeof word === "string") openedWords.add(word.toLowerCase());
      }
      if (turn.speaker === "coach") {
        if (text) messages.push({ id: turn.id, speaker: "coach", text, createdAt: turn.created_at.toISOString() });
        continue;
      }
      if (text) messages.push({ id: turn.id, speaker: "learner", text, createdAt: turn.created_at.toISOString() });
      const coachText = typeof feedbackRecord.coachText === "string" ? feedbackRecord.coachText : "";
      if (coachText) messages.push({
        id: `${turn.id}:coach`, speaker: "coach", text: coachText,
        createdAt: turn.created_at.toISOString(), ...(feedback ? { feedback } : {})
      });
    }
    if (!messages.some((message) => message.speaker === "coach")) {
      const firstName = row.display_name.trim().split(/\s+/).at(-1) ?? row.display_name;
      messages.unshift({
        id: "welcome", speaker: "coach", text: `Hi ${firstName}! I'm Season. What do you do at work?`,
        createdAt: new Date(0).toISOString()
      });
    }
    const vocabulary = vocabularyRows.rows.flatMap(({ content }) => {
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
        const word = typeof value.word === "string" ? value.word : "";
        if (!word) return [];
        return [{ word, meaning: typeof value.meaning === "string" ? value.meaning : "", opened: openedWords.has(word.toLowerCase()) }];
      });
    }).slice(0, 15);
    const count = counters.rows[0] ?? { daily_used: "0", weekly_turns: "0" };
    return {
      sessionId, topic: row.topic, cefr: row.cefr,
      persona: scenario.persona === "formal" ? "formal" : "informal",
      aiAvailable, daily: { used: Number(count.daily_used), limit: 20 },
      weekly: { turns: Number(count.weekly_turns), target: 2 }, messages, vocabulary
    };
  }

  async saveAiTurn(input: {
    learnerId: string;
    sessionId: string;
    requestId: string;
    message: string;
    taskId: string;
    promptVersionId: string;
    output: {
      relevant: boolean; relevanceNote: string; reply: string;
      rubric: { meaning: number; vocabulary: number; grammar: number };
      suggestions: Array<{ original: string; corrected: string; explanation: string }>;
      correctedText: string; usedWords: string[];
    };
    metadata: {
      traceId: string; provider: string; model: string; inputHash: string;
      usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; latencyMs: number;
    };
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const locked = await client.query(
        "select id from coach_sessions where id = $1 and learner_id = $2 and status = 'active' for update",
        [input.sessionId, input.learnerId]
      );
      if (!locked.rowCount) throw new Error("COACH_SESSION_NOT_FOUND");
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
      await client.query(
        `insert into coach_turns (id, session_id, turn_number, speaker, content, feedback, ai_run_id)
         values ($1, $2, $3, 'learner', $4::jsonb, $5::jsonb, $6)`,
        [randomUUID(), input.sessionId, Number(next.rows[0]?.number ?? 1),
          JSON.stringify({ text: input.message, requestId: input.requestId }),
          JSON.stringify({
            coachText: input.output.reply, relevant: input.output.relevant,
            relevanceNote: input.output.relevanceNote, rubric: input.output.rubric,
            suggestions: input.output.suggestions, correctedText: input.output.correctedText,
            usedWords: input.output.usedWords, checked: false
          }), runId]
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async setPersona(learnerId: string, persona: CoachPersona): Promise<void> {
    await this.pool.query(
      `update coach_sessions set scenario = jsonb_set(scenario, '{persona}', to_jsonb($2::text), true)
       where id = (select id from coach_sessions where learner_id = $1 and status = 'active' order by started_at desc limit 1)`,
      [learnerId, persona]
    );
  }

  async archiveCurrent(learnerId: string): Promise<void> {
    await this.pool.query(
      `update coach_sessions set status = 'completed', completed_at = now()
       where id = (select id from coach_sessions where learner_id = $1 and status = 'active' order by started_at desc limit 1)`,
      [learnerId]
    );
  }
}

function coachFeedback(value: Record<string, unknown> | null): CoachFeedbackView | null {
  if (!value || !value.rubric || typeof value.rubric !== "object" || Array.isArray(value.rubric)) return null;
  const rubric = value.rubric as Record<string, unknown>;
  const suggestions = Array.isArray(value.suggestions) ? value.suggestions.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.original !== "string" || typeof entry.corrected !== "string" || typeof entry.explanation !== "string") return [];
    return [{ original: entry.original, corrected: entry.corrected, explanation: entry.explanation }];
  }) : [];
  return {
    relevant: value.relevant !== false,
    relevanceNote: typeof value.relevanceNote === "string" ? value.relevanceNote : "",
    rubric: {
      meaning: Number(rubric.meaning ?? 0), vocabulary: Number(rubric.vocabulary ?? 0), grammar: Number(rubric.grammar ?? 0)
    },
    suggestions,
    correctedText: typeof value.correctedText === "string" ? value.correctedText : ""
  };
}

class EngagementRepository {
  constructor(private readonly pool: Pool) {}

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

class NotificationRepository {
  constructor(private readonly pool: Pool) {}

  async listForLearner(learnerId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `select r.id, r.reason, r.message, r.status, r.created_at,
              coalesce(jsonb_agg(jsonb_build_object('provider', nd.provider, 'status', nd.status))
                filter (where nd.id is not null), '[]'::jsonb) as deliveries
       from reminders r
       left join notification_deliveries nd on nd.reminder_id = r.id
       where r.learner_id = $1
       group by r.id
       order by r.created_at desc`,
      [learnerId]
    );
    return result.rows;
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

  async activeTaskPrompt(userId: string, taskKey: string): Promise<{
    taskId: string; promptVersionId: string; prompt: string;
  } | null> {
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
         where state = 'queued' and run_at <= now() and attempts < max_attempts
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
    jobs: new JobRepository(pool)
  };
}

export type DatabaseRepositories = ReturnType<typeof createRepositories>;
