import type { Pool } from "pg";
import type { AccountRole } from "@e4s/contracts";

export interface UserIdentity {
  id: string;
  displayName: string;
  email: string | null;
  role: AccountRole;
  status: string;
}

export interface ActiveLearningContext {
  programId: string;
  programName: string;
  weekId: string;
  weekNumber: number;
  topic: string;
  cefr: string | null;
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
      cefr: string | null;
    }>(
      `select p.id as program_id, p.name as program_name,
              pw.id as week_id, pw.week_number, pw.topic, e.cefr
       from enrollments e
       join programs p on p.id = e.program_id and p.status = 'active'
       join program_weeks pw on pw.program_id = p.id
       where e.learner_id = $1
       order by pw.week_number
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
          cefr: row.cefr
        }
      : null;
  }
}

class ContentRepository {
  constructor(private readonly pool: Pool) {}

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

class AssessmentRepository {
  constructor(private readonly pool: Pool) {}

  async listPending(): Promise<unknown[]> {
    const result = await this.pool.query(
      `select aa.id, aa.learner_id, aa.submitted_at, ad.kind, ad.title
       from assessment_attempts aa
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id
       where aa.status = 'pending_review'
       order by aa.submitted_at nulls last, aa.started_at`
    );
    return result.rows;
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
