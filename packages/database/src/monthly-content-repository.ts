import { randomUUID } from "node:crypto";
import { monthlyResourceApprovalIssues } from "./monthly-resource-approval-checks.js";
import {
  carryoverReviewContract,
  buildMonthlyCalendar,
  buildMonthlyTeachingCalendar,
  monthlyNewLessonOrdinal,
  monthlyScopeHash,
  monthlyResourcePoolHash,
  recommendedPendingBatch,
  planMonthlyResourcePool,
  backfillMonthlyCurriculumPlan,
  validateMonthlyCurriculum,
  validateMonthlyGrammarObjectives,
  monthlyGatedLightFindings,
  type MonthlyResourcePoolContract,
  type MonthlyResourcePoolCoreTerm,
  type MonthlyResourcePoolSupportTerm,
  type MonthlyCurriculumContract,
  type MonthlyDaySpec
} from "@e4s/domain";
import type {
  CefrLevel,
  MonthlyPublicationPreviewView,
  MonthlyRepublicationPreviewView,
  MonthlyRepublicationResultView,
  MonthlyOperatorOverviewView,
  MonthFrameworkView,
  SharedMonthBriefView,
  MonthlyQualityFindingView,
  MonthFrameworkReopenRequestView,
  OperatorAcknowledgementView,
  ReopenRequestView
} from "@e4s/contracts";
import { monthlyLearnerWindow } from "@e4s/domain/progression";
import type { Client, Pool, PoolClient } from "pg";
import { learnerLevelStartedOnSql } from "./learner-level-start.js";
import { FROZEN_MONTHLY_ILLUSTRATIONS_SQL, withFrozenMonthlyIllustrations, type FrozenMonthlyIllustration } from "./monthly-illustration-projection.js";

type Queryable = Pool | Client;

export interface SaveMonthlyBriefInput {
  month: string;
  title: string;
  brief: string;
  context: string;
  communicationGoal: string;
}

interface ActorRow { organization_id: string; role: string; }
interface BriefRow {
  id: string;
  month: string;
  theme_title: string;
  theme_brief: string;
  theme_context: string;
  communication_goal: string;
  brief_version: number;
  brief_status: "draft" | "approved";
}
interface FrameworkRow {
  id: string;
  cefr: MonthFrameworkView["cefr"];
  version: number;
  status: MonthFrameworkView["status"] | "retired";
  scope_hash: string;
  curriculum_contract: MonthlyCurriculumContract | MonthlyResourcePoolContract;
  quality_acknowledgement: MonthFrameworkView["quality"]["acknowledged"] | null;
  frozen_illustrations?: FrozenMonthlyIllustration[];
  published_on?: string | null;
  publication_ready?: boolean;
}
interface ReopenRequestRow {
  id: string;
  target: "daily_lesson" | "weekly_review";
  target_id: string;
  requested_by: string;
  reason: string;
  status: "requested" | "authorized" | "published" | "rejected";
  decision_reason: string | null;
  created_at: Date;
  decided_at: Date | null;
  archived_at?: Date | null;
}

interface FrameworkReopenRequestRow {
  id: string;
  framework_id: string;
  framework_version: number;
  requested_by: string;
  reason: string;
  status: "requested" | "authorized" | "rejected";
  decision_reason: string | null;
  removed_lesson_count: number | null;
  created_at: Date;
  decided_at: Date | null;
}

interface FrameworkReopenListRow extends FrameworkReopenRequestRow {
  archived_at?: Date | null;
  month: string;
  cefr: MonthFrameworkView["cefr"];
  lesson_count: string;
  lessons_with_content: string;
}

/** Error with an HTTP status Fastify answers directly instead of a 500. */
function httpError(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } {
  return Object.assign(new Error(message), { statusCode, code });
}

interface RepublicationFacts {
  month: string; cefr: CefrLevel; today: string; publishedOn: string; ready: boolean; inWindow: boolean;
  missingDays: Array<{ lessonNumber: number; date: string }>;
}

/**
 * The published framework, today's system date and the readiness of the publication window. `ready`
 * is `monthly_framework_ready_for_publication` itself; `missingDays` lists the window days it rejects
 * (the same three upcoming lessons, or the last three once the month is over).
 */
async function republicationFacts(db: Queryable, organizationId: string, frameworkId: string, lock: boolean): Promise<RepublicationFacts> {
  const { rows: [row] } = await db.query<{ month: string; cefr: CefrLevel; status: string; today: string; published_on: string | null; ready: boolean; in_window: boolean }>(
    `select pm.month, mf.cefr, mf.status, organization_system_date(pm.organization_id)::text as today, mf.published_on::text,
            monthly_framework_ready_for_publication(mf.id) as ready,
            pm.month between to_char(organization_system_date(pm.organization_id), 'YYYY-MM')
                         and to_char(organization_system_date(pm.organization_id) + interval '1 month', 'YYYY-MM') as in_window
     from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
     where mf.id = $1 and pm.organization_id = $2 and mf.status <> 'retired'${lock ? " for update of mf" : ""}`,
    [frameworkId, organizationId]
  );
  if (!row) throw httpError(404, "MONTHLY_FRAMEWORK_NOT_FOUND", "Không tìm thấy khung tháng.");
  if (row.status !== "approved" || !row.published_on) throw httpError(409, "MONTHLY_REPUBLICATION_NOT_PUBLISHED", "Chỉ công bố lại tháng đã được công bố.");
  const { rows: windowRows } = await db.query<{ lesson_number: number; lesson_date: string; ready: boolean }>(
    `with framework as (
       select mf.id, mf.scope_hash, mf.curriculum_contract, organization_system_date(pm.organization_id) as today
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id where mf.id = $1
     ),
     upcoming as (
       select ml.* from month_lessons ml, framework f
       where ml.framework_id = f.id and ml.lesson_date >= f.today order by ml.lesson_number limit 3
     ),
     window_lessons as (
       select * from upcoming
       union all
       select * from (
         select ml.* from month_lessons ml, framework f
         where ml.framework_id = f.id and not exists (select from upcoming) order by ml.lesson_number desc limit 3
       ) tail
     )
     select wl.lesson_number, wl.lesson_date::text,
            (wl.status = 'approved' and wl.scope_hash = f.scope_hash
             and exists (
               select from lessons l join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
               where l.id = wl.lesson_id and exists (select from lesson_versions lv where lv.lesson_id = l.id and lv.status = 'published'))
             and f.curriculum_contract->'daySpecs' @> jsonb_build_array(jsonb_build_object('lessonNumber', wl.lesson_number, 'date', wl.lesson_date::text))
            ) as ready
     from window_lessons wl, framework f order by wl.lesson_number`,
    [frameworkId]
  );
  return {
    month: row.month, cefr: row.cefr, today: row.today, publishedOn: row.published_on, ready: Boolean(row.ready), inWindow: Boolean(row.in_window),
    missingDays: windowRows.filter((day) => !day.ready).map((day) => ({ lessonNumber: day.lesson_number, date: day.lesson_date }))
  };
}

/** Active learners whose current approved level is `cefr`; `shifted` when their level start lies after `today`. */
async function republicationLearners(db: Queryable, organizationId: string, cefr: CefrLevel, today: string) {
  const { rows } = await db.query<{ enrollment_id: string; learner_id: string; level_started_on: string | null }>(
    `select e.id as enrollment_id, e.learner_id, ${learnerLevelStartedOnSql("e", "e.learner_id")}::text as level_started_on
     from enrollments e
     join programs p on p.id = e.program_id and p.status = 'active'
     join users learner on learner.id = e.learner_id and learner.role = 'learner' and learner.status = 'active' and learner.organization_id = $1
     where e.cefr_approved and e.cefr = $2
       and not exists (
         select from enrollments newer join programs np on np.id = newer.program_id and np.status = 'active'
         where newer.learner_id = e.learner_id and newer.cefr_approved and newer.cefr is not null and newer.enrolled_at > e.enrolled_at
       )`,
    [organizationId, cefr]
  );
  return rows.map((row) => ({ enrollmentId: row.enrollment_id, learnerId: row.learner_id, shifted: row.level_started_on !== null && row.level_started_on > today }));
}

/** "06/11 (Bài 4), 07/11 (Bài 5)": the exact days blocking a republication. */
export function republicationIncompleteMessage(missingDays: Array<{ lessonNumber: number; date: string }>): string {
  if (!missingDays.length) return "Chưa công bố lại được: tài nguyên, chủ đề hoặc lịch bài của tháng chưa đủ điều kiện công bố.";
  const days = missingDays.map((day) => `${day.date.slice(8, 10)}/${day.date.slice(5, 7)} (Bài ${day.lessonNumber})`).join(", ");
  return `Chưa công bố lại được: cần duyệt 3 bài liên tiếp tính từ hôm nay; còn thiếu ${days}.`;
}

interface MonthLessonRow {
  lesson_number: number;
  lesson_date: string;
  status: "pending" | "generating" | "draft" | "approved" | "failed";
  scope_hash: string;
  correction_count: string;
  quality_report: { severe: MonthlyQualityFindingView[]; light: MonthlyQualityFindingView[]; contractVersion: number };
  quality_acknowledgement: OperatorAcknowledgementView | null;
  content?: { title?: string; parts?: Array<{ code?: string; title?: string; content?: Record<string, unknown> }> };
  lesson_title?: string | null;
  generation_error?: unknown;
}

interface StoredGenerationFailure {
  kind: "ai_generation_failed";
  failedAt: string;
  attempts: number;
  report: { severe: MonthlyQualityFindingView[]; light: MonthlyQualityFindingView[] };
  candidate: { title?: string; parts?: Array<{ code?: string; title?: string; content?: Record<string, unknown> }> } | null;
}

/**
 * Finding codes the gate no longer raises (MONTHLY_ANSWER_LONGEST_OPTION, removed 13/11: an answer that is
 * simply the longest option is not a defect). Reports stored before the removal still carry them, so they are
 * dropped on read: they never show, count against the two-light cap or need an acknowledgement.
 */
const RETIRED_MONTHLY_FINDING_CODES = new Set(["MONTHLY_ANSWER_LONGEST_OPTION"]);
function activeQualityReport<T extends { severe: MonthlyQualityFindingView[]; light: MonthlyQualityFindingView[] }>(report: T): T {
  const keep = (findings: MonthlyQualityFindingView[]) => findings.filter((finding) => !RETIRED_MONTHLY_FINDING_CODES.has(finding.code));
  return report && Array.isArray(report.light) && Array.isArray(report.severe) ? { ...report, severe: keep(report.severe), light: keep(report.light) } : report;
}

/** generation_error also holds a manual save's severe report; only an AI failure payload is shown as a failed generation. */
function isGenerationFailure(value: unknown): value is StoredGenerationFailure {
  return Boolean(value && typeof value === "object" && (value as { kind?: unknown }).kind === "ai_generation_failed"
    && Array.isArray((value as StoredGenerationFailure).report?.severe) && Array.isArray((value as StoredGenerationFailure).report?.light));
}

interface SystemDateWindowRow {
  system_date: string;
  previous_month: string;
  current_month: string;
  next_month: string;
}

export interface MonthlyResourceGenerationCheckpoint {
  id: string;
  generationId: string;
  briefVersion: number;
  version: number;
  categories: Record<string, unknown>;
  sourceLineage: Record<string, unknown>;
  updatedAt: string;
}

export interface SaveMonthlyResourceGenerationCheckpointInput {
  month: string;
  cefr: MonthFrameworkView["cefr"];
  briefVersion: number;
  generationId: string;
  categories: Record<string, unknown>;
  sourceLineage: Record<string, unknown>;
}

export interface MonthlyResourceDraftForEdit {
  id: string;
  month: string;
  cefr: MonthFrameworkView["cefr"];
  version: number;
  status: MonthFrameworkView["status"] | "retired";
  writable: boolean;
  pool: MonthlyResourcePoolContract;
}

export interface MonthlyLessonDraftInput {
  title: string;
  parts: Array<{ code: string; title?: string | undefined; content: Record<string, unknown> }>;
}

export interface MonthlyQualityReportInput {
  severe: MonthlyQualityFindingView[];
  light: MonthlyQualityFindingView[];
  contractVersion: number;
}

/**
 * Persistence boundary for the monthly flow. Weekly repositories intentionally do
 * not own this data: a monthly framework is a locked curriculum contract, not a
 * collection of independently generated weekly plans.
 */
export class MonthlyContentRepository {
  constructor(private readonly database: Queryable) {}

  async saveBrief(actorId: string, input: SaveMonthlyBriefInput): Promise<SharedMonthBriefView> {
    const actor = await this.requireContentOperator(actorId);
    await this.requireWritableMonth(actor.organization_id, input.month);
    const calendar = buildMonthlyCalendar(input.month);
    const current = await this.database.query<BriefRow>(
      `select id, month, theme_title, theme_brief, theme_context, communication_goal, brief_version, brief_status
       from program_months where organization_id = $1 and month = $2`,
      [actor.organization_id, input.month]
    );
    const existing = current.rows[0];
    if (existing) {
      const retired = await this.database.query<{ id: string }>(
        `select id from month_frameworks where program_month_id = $1 and status = 'retired' limit 1`,
        [existing.id]
      );
      const approved = await this.database.query<{ id: string }>(
        `select mf.id
         from month_frameworks mf
         where mf.program_month_id = $1 and mf.status = 'approved'
         limit 1`,
        [existing.id]
      );
      if (existing.brief_status === "approved" && !retired.rowCount) {
        throw new Error("An approved monthly brief is locked until its framework is retired by a Manager.");
      }
      // A retired framework is immutable history. It has been explicitly
      // removed from discovery, so a new brief can start a fresh framework.
      if (approved.rowCount) {
        throw new Error("Approved monthly resources are locked. A Manager must retire the invalid framework before this brief can change.");
      }
      const version = existing.brief_version + 1;
      const result = await this.database.query<BriefRow>(
        `update program_months
         set theme_title = $2, theme_brief = $3, theme_context = $4, communication_goal = $5,
             brief_version = $6, brief_status = 'draft', updated_at = now()
         where id = $1
         returning id, month, theme_title, theme_brief, theme_context, communication_goal, brief_version, brief_status`,
        [existing.id, input.title, input.brief, input.context, input.communicationGoal, version]
      );
      await this.audit(actor, "monthly.brief_updated", existing.id, { month: input.month, version });
      return toBriefView(result.rows[0]!);
    }

    const id = randomUUID();
    const result = await this.database.query<BriefRow>(
      `insert into program_months
         (id, organization_id, month, exam_date, lesson_count, theme_title, theme_brief, theme_context, communication_goal)
       values ($1, $2, $3, $4::date, $5, $6, $7, $8, $9)
       returning id, month, theme_title, theme_brief, theme_context, communication_goal, brief_version, brief_status`,
      [id, actor.organization_id, input.month, calendar.examDate, calendar.lessonCount, input.title, input.brief, input.context, input.communicationGoal]
    );
    await this.audit(actor, "monthly.brief_created", id, { month: input.month, version: 1 });
    return toBriefView(result.rows[0]!);
  }

  async approveBrief(actorId: string, month: string): Promise<void> {
    const actor = await this.requireContentOperator(actorId);
    await this.requireWritableMonth(actor.organization_id, month);
    const result = await this.database.query<{ id: string }>(
      `update program_months set brief_status = 'approved', updated_at = now()
       where organization_id = $1 and month = $2 and brief_status = 'draft' and theme_title <> ''
       returning id`,
      [actor.organization_id, month]
    );
    const row = result.rows[0];
    if (!row) throw new Error("A complete monthly brief draft is required before it can be locked");
    await this.audit(actor, "monthly.brief_approved", row.id, { month });
  }

  async saveFramework(actorId: string, contract: MonthlyCurriculumContract): Promise<Pick<MonthFrameworkView, "id" | "cefr" | "version" | "status" | "scopeHash">> {
    const actor = await this.requireContentOperator(actorId);
    await this.requireWritableMonth(actor.organization_id, contract.month);
    const validationErrors = validateMonthlyCurriculum(contract);
    if (validationErrors.length) throw new Error(`Invalid monthly curriculum: ${validationErrors.join("; ")}`);
    const brief = await this.database.query<BriefRow>(
      `select id, month, theme_title, theme_brief, theme_context, communication_goal, brief_version, brief_status
       from program_months where organization_id = $1 and month = $2`,
      [actor.organization_id, contract.month]
    );
    const month = brief.rows[0];
    if (!month) throw new Error("Monthly brief must exist before a framework is saved");
    if (month.brief_status !== "approved") throw new Error("Monthly brief must be locked before resources are authored");
    if (!sameBrief(month, contract)) throw new Error("Monthly curriculum must use the current shared brief version");

    const existingResult = await this.database.query<FrameworkRow>(
      `select id, cefr, version, status, scope_hash, curriculum_contract, quality_acknowledgement
       from month_frameworks where program_month_id = $1 and cefr = $2 and status <> 'retired'`,
      [month.id, contract.cefr]
    );
    const existing = existingResult.rows[0];
    if (existing?.status === "approved") {
      throw new Error("An approved framework is immutable. A Manager must retire the invalid resources before a replacement is created.");
    }
    const version = (existing?.version ?? 0) + 1;
    // The stored contract and framework row are one revision. Keeping their
    // versions aligned prevents a newly generated day from being rejected as
    // stale immediately after a resource regeneration.
    const versionedContract = { ...contract, version };
    const scopeHash = monthlyScopeHash(versionedContract);
    const frameworkId = existing?.id ?? randomUUID();
    if (existing) {
      await this.database.query(
        `update month_frameworks
         set version = $2, status = 'draft', curriculum_contract = $3::jsonb, scope_hash = $4,
             quality_acknowledgement = null, source = 'manual', generation_error = null,
             approved_by = null, approved_at = null, updated_at = now()
         where id = $1`,
        [frameworkId, version, JSON.stringify(versionedContract), scopeHash]
      );
      await this.database.query("delete from month_lessons where framework_id = $1", [frameworkId]);
    } else {
      await this.database.query(
        `insert into month_frameworks (id, program_month_id, cefr, version, curriculum_contract, scope_hash, created_by)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [frameworkId, month.id, contract.cefr, version, JSON.stringify(versionedContract), scopeHash, actorId]
      );
    }
    for (const day of versionedContract.daySpecs) {
      await this.database.query(
        `insert into month_lessons (id, framework_id, lesson_number, lesson_date, scope_hash)
         values ($1, $2, $3, $4::date, $5)`,
        [randomUUID(), frameworkId, day.lessonNumber, day.date, scopeHash]
      );
    }
    await this.audit(actor, existing ? "monthly.framework_replaced" : "monthly.framework_created", frameworkId, {
      month: contract.month, cefr: contract.cefr, version, scopeHash
    });
    return { id: frameworkId, cefr: contract.cefr, version, status: "draft", scopeHash };
  }

  async saveResourceDraft(actorId: string, pool: MonthlyResourcePoolContract, source: "ai" | "manual" = "ai"): Promise<Pick<MonthFrameworkView, "id" | "cefr" | "version" | "status" | "scopeHash">> {
    const actor = await this.requireContentOperator(actorId);
    await this.requireWritableMonth(actor.organization_id, pool.month);
    // Validate the complete draft against the exact approval-time allocation
    // rules, but persist only the unassigned pool.
    planMonthlyResourcePool(pool);
    const briefResult = await this.database.query<BriefRow>(
      `select id, month, theme_title, theme_brief, theme_context, communication_goal, brief_version, brief_status
       from program_months where organization_id = $1 and month = $2`, [actor.organization_id, pool.month]
    );
    const month = briefResult.rows[0];
    if (!month || month.brief_status !== "approved") throw new Error("Monthly brief must be locked before resources are authored");
    if (!sameBrief(month, pool)) throw new Error("Monthly resource pool must use the current shared brief version");
    const pooledClient = "connect" in this.database;
    const client = pooledClient ? await this.database.connect() : this.database;
    let result: { frameworkId: string; version: number; scopeHash: string; replaced: boolean };
    try {
    await client.query("begin");
    const lockedBrief = await client.query(
      "select 1 from program_months where id = $1 and brief_version = $2 and brief_status = 'approved' for update",
      [month.id, month.brief_version]
    );
    if (!lockedBrief.rowCount) throw httpError(409, "MONTHLY_BRIEF_VERSION_CONFLICT", "Chủ đề tháng đã thay đổi.");
    const existingResult = await client.query<FrameworkRow>(
      `select id, cefr, version, status, scope_hash, curriculum_contract, quality_acknowledgement
       from month_frameworks where program_month_id = $1 and cefr = $2 and status <> 'retired' for update`, [month.id, pool.cefr]
    );
    const existing = existingResult.rows[0];
    if (existing && source === "manual") throw httpError(409, "MONTHLY_FRAMEWORK_VERSION_CONFLICT", "Đã có bản nháp. Hãy mở bản nháp để tiếp tục soạn.");
    if (existing?.status === "approved") throw new Error("An approved framework is immutable. A Manager must retire the invalid resources before a replacement is created.");
    const version = (existing?.version ?? 0) + 1;
    const versionedPool = { ...pool, version };
    const scopeHash = monthlyResourcePoolHash(versionedPool);
    const frameworkId = existing?.id ?? randomUUID();
    if (existing) {
      await client.query(
        `update month_frameworks set version = $2, status = 'draft', curriculum_contract = $3::jsonb, scope_hash = $4,
          quality_acknowledgement = null, source = 'ai', generation_error = null, approved_by = null, approved_at = null, updated_at = now()
         where id = $1`, [frameworkId, version, JSON.stringify(versionedPool), scopeHash]
      );
      await client.query("delete from month_lessons where framework_id = $1", [frameworkId]);
    } else {
      await client.query(
        `insert into month_frameworks (id, program_month_id, cefr, version, curriculum_contract, scope_hash, created_by, source)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
        [frameworkId, month.id, pool.cefr, version, JSON.stringify(versionedPool), scopeHash, actorId, source]
      );
    }
    if (source === "ai") await client.query("delete from monthly_resource_generation_checkpoints where program_month_id = $1 and cefr = $2", [month.id, pool.cefr]);
    result = { frameworkId, version, scopeHash, replaced: Boolean(existing) };
    await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      if (pooledClient) (client as import("pg").PoolClient).release();
    }
    await this.audit(actor, result.replaced ? "monthly.framework_replaced" : "monthly.framework_created", result.frameworkId, {
      month: pool.month, cefr: pool.cefr, version: result.version, scopeHash: result.scopeHash, resourcePool: true
    });
    return { id: result.frameworkId, cefr: pool.cefr, version: result.version, status: "draft", scopeHash: result.scopeHash };
  }

  /**
   * Loads one framework's resource pool for manual editing (VH-R30/VH-R35).
   * Returns null when the framework is not in the Operator's organization.
   */
  async getResourceDraftForEdit(actorId: string, frameworkId: string): Promise<MonthlyResourceDraftForEdit | null> {
    const actor = await this.requireContentOperator(actorId);
    const result = await this.database.query<FrameworkRow & { month: string }>(
      `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement, pm.month
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2`, [frameworkId, actor.organization_id]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id, month: row.month, cefr: row.cefr, version: row.version, status: row.status,
      writable: await this.isWritableMonth(actor.organization_id, row.month),
      pool: toMonthlyResourcePool(row.curriculum_contract, row.version)
    };
  }

  /**
   * Saves an Operator-edited resource pool over the current draft (VH-R30/VH-R35).
   * Approved and retired frameworks stay locked; reopening goes through a Manager.
   * The pool must already pass the approval-time allocation rules.
   */
  async saveEditedResourceDraft(actorId: string, frameworkId: string, expectedVersion: number, pool: MonthlyResourcePoolContract): Promise<Pick<MonthFrameworkView, "id" | "cefr" | "version" | "status" | "scopeHash">> {
    const actor = await this.requireContentOperator(actorId);
    planMonthlyResourcePool(pool);
    const pooledClient = "connect" in this.database;
    const client = pooledClient ? await (this.database as Pool).connect() : this.database;
    let saved: { version: number; scopeHash: string; cefr: MonthFrameworkView["cefr"]; month: string };
    try {
      await client.query("begin");
      const locked = await client.query<FrameworkRow & { month: string }>(
        `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement, pm.month
         from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
         where mf.id = $1 and pm.organization_id = $2 for update of mf`, [frameworkId, actor.organization_id]
      );
      const row = locked.rows[0];
      if (!row) throw httpError(404, "MONTHLY_FRAMEWORK_NOT_FOUND", "Monthly framework was not found");
      if (row.status !== "draft") throw httpError(409, "MONTHLY_FRAMEWORK_IMMUTABLE", "Only draft monthly resources can be edited; ask a Manager to reopen approved resources");
      if (!await this.isWritableMonth(actor.organization_id, row.month)) throw httpError(409, "MONTHLY_CONTENT_READ_ONLY", "Monthly content is read-only outside the current and next month");
      if (row.version !== expectedVersion) throw httpError(409, "MONTHLY_FRAMEWORK_VERSION_CONFLICT", "Monthly resources changed since they were opened; reload and edit again");
      if (pool.month !== row.month || pool.cefr !== row.cefr) throw httpError(409, "MONTH_CONTRACT_MISMATCH", "Edited resources belong to a different month or level");
      const version = row.version + 1;
      const versionedPool = { ...pool, version };
      const scopeHash = monthlyResourcePoolHash(versionedPool);
      await client.query(
        `update month_frameworks set version = $2, status = 'draft', curriculum_contract = $3::jsonb, scope_hash = $4,
           quality_acknowledgement = null, source = 'manual', generation_error = null, approved_by = null, approved_at = null, updated_at = now()
         where id = $1`, [frameworkId, version, JSON.stringify(versionedPool), scopeHash]
      );
      // A draft never owns lesson slots; legacy allocated drafts lose theirs like a reopen does.
      await client.query("delete from month_lessons where framework_id = $1", [frameworkId]);
      saved = { version, scopeHash, cefr: row.cefr, month: row.month };
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      if (pooledClient) (client as PoolClient).release();
    }
    await this.audit(actor, "monthly.framework_resources_edited", frameworkId, {
      month: saved.month, cefr: saved.cefr, previousVersion: expectedVersion, version: saved.version, scopeHash: saved.scopeHash, resourcePool: true
    });
    return { id: frameworkId, cefr: saved.cefr, version: saved.version, status: "draft", scopeHash: saved.scopeHash };
  }

  /**
   * L-042 register-only regeneration of a DRAFT pool: replaces ONLY
   * coreTerms[].registerTerms (keyed by core id; a core missing from the map
   * loses its alternatives). Every other core field, the supports, grammar and
   * sounds are kept byte-for-byte. Approved and retired frameworks stay locked.
   */
  async replaceDraftRegisterTerms(actorId: string, frameworkId: string, expectedVersion: number, registerTermsByCoreId: Readonly<Record<string, NonNullable<MonthlyResourcePoolCoreTerm["registerTerms"]>>>): Promise<Pick<MonthFrameworkView, "id" | "cefr" | "version" | "status" | "scopeHash">> {
    const actor = await this.requireContentOperator(actorId);
    const pooledClient = "connect" in this.database;
    const client = pooledClient ? await (this.database as Pool).connect() : this.database;
    let saved: { version: number; scopeHash: string; cefr: MonthFrameworkView["cefr"]; month: string; cores: number };
    try {
      await client.query("begin");
      const locked = await client.query<FrameworkRow & { month: string }>(
        `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement, pm.month
         from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
         where mf.id = $1 and pm.organization_id = $2 for update of mf`, [frameworkId, actor.organization_id]
      );
      const row = locked.rows[0];
      if (!row) throw httpError(404, "MONTHLY_FRAMEWORK_NOT_FOUND", "Monthly framework was not found");
      if (row.status !== "draft") throw httpError(409, "MONTHLY_FRAMEWORK_IMMUTABLE", "Only draft monthly resources can be changed; ask a Manager to reopen approved resources");
      if (!await this.isWritableMonth(actor.organization_id, row.month)) throw httpError(409, "MONTHLY_CONTENT_READ_ONLY", "Monthly content is read-only outside the current and next month");
      if (row.version !== expectedVersion) throw httpError(409, "MONTHLY_FRAMEWORK_VERSION_CONFLICT", "Monthly resources changed since they were opened; reload and try again");
      const pool = toMonthlyResourcePool(row.curriculum_contract, row.version);
      const coreTerms = pool.coreTerms.map((core) => {
        const { registerTerms: _previous, ...rest } = core;
        const next = registerTermsByCoreId[core.id];
        return next?.length ? { ...rest, registerTerms: next } : rest;
      });
      const version = row.version + 1;
      const versionedPool = { ...pool, coreTerms, version };
      planMonthlyResourcePool(versionedPool);
      const scopeHash = monthlyResourcePoolHash(versionedPool);
      await client.query(
        `update month_frameworks set version = $2, curriculum_contract = $3::jsonb, scope_hash = $4, quality_acknowledgement = null, updated_at = now()
         where id = $1`, [frameworkId, version, JSON.stringify(versionedPool), scopeHash]
      );
      // A draft never owns lesson slots (same as saveEditedResourceDraft).
      await client.query("delete from month_lessons where framework_id = $1", [frameworkId]);
      saved = { version, scopeHash, cefr: row.cefr, month: row.month, cores: coreTerms.filter((core) => "registerTerms" in core).length };
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      if (pooledClient) (client as PoolClient).release();
    }
    await this.audit(actor, "monthly.framework_register_terms_regenerated", frameworkId, {
      month: saved.month, cefr: saved.cefr, previousVersion: expectedVersion, version: saved.version, scopeHash: saved.scopeHash, coresWithRegisterTerms: saved.cores
    });
    return { id: frameworkId, cefr: saved.cefr, version: saved.version, status: "draft", scopeHash: saved.scopeHash };
  }

  /**
   * Pronunciation targets of the same level in the months before `beforeMonth`
   * (at most `windowMonths`), from the latest non-retired framework of each
   * month, draft or approved: the memory used to pick the next roadmap items.
   */
  async listPronunciationHistory(actorId: string, cefr: MonthFrameworkView["cefr"], beforeMonth: string, windowMonths = 12): Promise<Array<{ month: string; sounds: Array<{ ipa: string; label: string; catalogId?: string }> }>> {
    const actor = await this.requireContentOperator(actorId);
    const [year, monthNumber] = beforeMonth.split("-").map(Number) as [number, number];
    const startIndex = year * 12 + (monthNumber - 1) - windowMonths;
    const fromMonth = `${Math.floor(startIndex / 12)}-${String((startIndex % 12) + 1).padStart(2, "0")}`;
    const result = await this.database.query<{ month: string; sounds: unknown }>(
      `select distinct on (pm.month) pm.month, mf.curriculum_contract->'sounds' as sounds
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where pm.organization_id = $1 and mf.cefr = $2 and pm.month >= $3 and pm.month < $4 and mf.status <> 'retired'
       order by pm.month, mf.version desc`,
      [actor.organization_id, cefr, fromMonth, beforeMonth]
    );
    return result.rows.map((row) => ({
      month: row.month,
      sounds: (Array.isArray(row.sounds) ? row.sounds : []).flatMap((sound: unknown) => {
        if (!sound || typeof sound !== "object") return [];
        const value = sound as { ipa?: unknown; label?: unknown; catalogId?: unknown };
        if (typeof value.ipa !== "string") return [];
        return [{ ipa: value.ipa, label: typeof value.label === "string" ? value.label : "", ...(typeof value.catalogId === "string" ? { catalogId: value.catalogId } : {}) }];
      })
    }));
  }

  /**
   * Grammar topics of the same level in the months before `beforeMonth` (at
   * most `windowMonths`), from the latest non-retired framework of each month,
   * draft or approved: the memory used to pick the next roadmap pair.
   */
  async listGrammarHistory(actorId: string, cefr: MonthFrameworkView["cefr"], beforeMonth: string, windowMonths = 12): Promise<Array<{ month: string; topics: Array<{ title: string; catalogId?: string }> }>> {
    const actor = await this.requireContentOperator(actorId);
    const [year, monthNumber] = beforeMonth.split("-").map(Number) as [number, number];
    const startIndex = year * 12 + (monthNumber - 1) - windowMonths;
    const fromMonth = `${Math.floor(startIndex / 12)}-${String((startIndex % 12) + 1).padStart(2, "0")}`;
    const result = await this.database.query<{ month: string; topics: unknown }>(
      `select distinct on (pm.month) pm.month, mf.curriculum_contract->'grammarTopics' as topics
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where pm.organization_id = $1 and mf.cefr = $2 and pm.month >= $3 and pm.month < $4 and mf.status <> 'retired'
       order by pm.month, mf.version desc`,
      [actor.organization_id, cefr, fromMonth, beforeMonth]
    );
    return result.rows.map((row) => ({
      month: row.month,
      topics: (Array.isArray(row.topics) ? row.topics : []).flatMap((topic: unknown) => {
        if (!topic || typeof topic !== "object") return [];
        const value = topic as { title?: unknown; catalogId?: unknown };
        return [{ title: typeof value.title === "string" ? value.title : "", ...(typeof value.catalogId === "string" ? { catalogId: value.catalogId } : {}) }];
      })
    }));
  }

  async getResourceGenerationCheckpoint(actorId: string, month: string, cefr: MonthFrameworkView["cefr"]): Promise<MonthlyResourceGenerationCheckpoint | null> {
    const actor = await this.requireContentOperator(actorId);
    await this.requireWritableMonth(actor.organization_id, month);
    const result = await this.database.query<{
      id: string; generation_id: string; brief_version: number; version: number; categories: Record<string, unknown>;
      source_lineage: Record<string, unknown>; updated_at: Date;
    }>(
      `select checkpoint.id, checkpoint.generation_id, checkpoint.brief_version, checkpoint.version,
              checkpoint.categories, checkpoint.source_lineage, checkpoint.updated_at
       from monthly_resource_generation_checkpoints checkpoint
       join program_months pm on pm.id = checkpoint.program_month_id
       where pm.organization_id = $1 and pm.month = $2 and checkpoint.cefr = $3
         and pm.brief_status = 'approved' and pm.brief_version = checkpoint.brief_version`,
      [actor.organization_id, month, cefr]
    );
    const row = result.rows[0];
    return row ? {
      id: row.id, generationId: row.generation_id, briefVersion: row.brief_version, version: row.version,
      categories: row.categories, sourceLineage: row.source_lineage, updatedAt: row.updated_at.toISOString()
    } : null;
  }

  async saveResourceGenerationCheckpoint(actorId: string, input: SaveMonthlyResourceGenerationCheckpointInput): Promise<MonthlyResourceGenerationCheckpoint> {
    const actor = await this.requireContentOperator(actorId);
    await this.requireWritableMonth(actor.organization_id, input.month);
    const monthResult = await this.database.query<BriefRow & { id: string }>(
      `select id, month, theme_title, theme_brief, theme_context, communication_goal, brief_version, brief_status
       from program_months where organization_id = $1 and month = $2`, [actor.organization_id, input.month]
    );
    const month = monthResult.rows[0];
    if (!month || month.brief_status !== "approved" || month.brief_version !== input.briefVersion) {
      throw new Error("Monthly resource checkpoint requires the current approved brief version");
    }
    const approved = await this.database.query<{ id: string }>(
      `select id from month_frameworks where program_month_id = $1 and cefr = $2 and status = 'approved' limit 1`, [month.id, input.cefr]
    );
    if (approved.rowCount) throw new Error("Approved monthly resources are immutable");
    const insertedId = randomUUID();
    const result = await this.database.query<{
      id: string; generation_id: string; brief_version: number; version: number; categories: Record<string, unknown>;
      source_lineage: Record<string, unknown>; updated_at: Date;
    }>(
      `insert into monthly_resource_generation_checkpoints
         (id, program_month_id, cefr, brief_version, generation_id, version, categories, source_lineage, created_by)
       values ($1, $2, $3, $4, $5, 1, $6::jsonb, $7::jsonb, $8)
       on conflict (program_month_id, cefr) do update set
         generation_id = excluded.generation_id,
         brief_version = excluded.brief_version,
         version = monthly_resource_generation_checkpoints.version + 1,
         categories = case when monthly_resource_generation_checkpoints.generation_id = excluded.generation_id
                              and monthly_resource_generation_checkpoints.brief_version = excluded.brief_version
                           then monthly_resource_generation_checkpoints.categories || excluded.categories
                           else excluded.categories end,
         source_lineage = case when monthly_resource_generation_checkpoints.generation_id = excluded.generation_id
                                  and monthly_resource_generation_checkpoints.brief_version = excluded.brief_version
                               then monthly_resource_generation_checkpoints.source_lineage || excluded.source_lineage
                               else excluded.source_lineage end,
         updated_at = now()
       returning id, generation_id, brief_version, version, categories, source_lineage, updated_at`,
      [insertedId, month.id, input.cefr, input.briefVersion, input.generationId, JSON.stringify(input.categories), JSON.stringify(input.sourceLineage), actorId]
    );
    const row = result.rows[0]!;
    return {
      id: row.id, generationId: row.generation_id, briefVersion: row.brief_version, version: row.version,
      categories: row.categories, sourceLineage: row.source_lineage, updatedAt: row.updated_at.toISOString()
    };
  }

  async approveFramework(actorId: string, frameworkId: string): Promise<void> {
    const actor = await this.requireContentOperator(actorId);
    const frameworkMonth = await this.monthForFramework(frameworkId, actor.organization_id);
    if (!frameworkMonth) throw new Error("Monthly framework was not found");
    await this.requireWritableMonth(actor.organization_id, frameworkMonth);
    const pooledClient = "connect" in this.database;
    const client = pooledClient ? await this.database.connect() : this.database;
    try {
      await client.query("begin");
      const locked = await client.query<FrameworkRow>(
        `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement
         from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
         where mf.id = $1 and pm.organization_id = $2 for update of mf`, [frameworkId, actor.organization_id]
      );
      const row = locked.rows[0];
      if (!row || row.status !== "draft") throw new Error("Only a draft framework in this organization can be approved");
      let contract: MonthlyCurriculumContract;
      if ("daySpecs" in row.curriculum_contract) contract = row.curriculum_contract;
      else {
        // Freeze the ready illustrations into the core terms: images cannot change after approval.
        const images = await client.query<{ word: string; artifact_key: string }>(
          "select word, artifact_key from month_framework_images where framework_id = $1 and status = 'ready' and artifact_key is not null", [frameworkId]
        );
        const imageByWord = new Map(images.rows.map((image) => [image.word, monthlyIllustrationUrl(image.artifact_key)]));
        // The working rows are the draft's pictures: a URL frozen by an earlier approval is
        // replaced (or dropped when the Operator removed the picture) before freezing again.
        const pool = { ...row.curriculum_contract, coreTerms: row.curriculum_contract.coreTerms.map(({ imageUrl: _previous, ...term }) => {
          const imageUrl = imageByWord.get(normalizeIllustrationWord(term.word));
          return imageUrl ? { ...term, imageUrl } : term;
        }) };
        // Stamp the framework row version so quality reports saved later match it.
        contract = { ...planMonthlyResourcePool(pool), version: row.version };
        const scopeHash = monthlyScopeHash(contract);
        await client.query("update month_frameworks set curriculum_contract = $2::jsonb, scope_hash = $3, updated_at = now() where id = $1",
          [frameworkId, JSON.stringify(contract), scopeHash]);
        for (const day of contract.daySpecs) {
          await client.query("insert into month_lessons (id, framework_id, lesson_number, lesson_date, scope_hash) values ($1, $2, $3, $4::date, $5)",
            [randomUUID(), frameworkId, day.lessonNumber, day.date, scopeHash]);
        }
      }
      // WP9: re-run the resource gates (example IPA, objective language, B1/C1
      // core overlap) so data that skipped them cannot be approved.
      const otherLevels = await client.query<{ cefr: CefrLevel; core_words: string[] | null }>(
        `select other.cefr, array(select jsonb_array_elements(other.curriculum_contract->'coreTerms')->>'word') as core_words
         from month_frameworks other join month_frameworks mf on mf.program_month_id = other.program_month_id
         where mf.id = $1 and other.id <> $1 and other.status <> 'retired'`, [frameworkId]
      );
      const planErrors = [
        ...validateMonthlyCurriculum(contract),
        ...(contract.planSchemaVersion === 2 ? validateMonthlyGrammarObjectives(contract.grammarTopics) : []),
        ...monthlyResourceApprovalIssues(contract, otherLevels.rows.map((level) => ({ cefr: level.cefr, coreWords: level.core_words ?? [] })))
      ];
      if (planErrors.length) throw Object.assign(new Error("MONTHLY_RESOURCE_PLAN_INVALID"), { code: "MONTHLY_RESOURCE_PLAN_INVALID", issues: planErrors });
      const result = await client.query<{ id: string }>(
      `update month_frameworks mf
       set status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
       from program_months pm
       where mf.id = $1 and mf.program_month_id = pm.id and pm.organization_id = $3 and mf.status = 'draft'
       returning mf.id`,
      [frameworkId, actorId, actor.organization_id]
      );
      if (!result.rowCount) throw new Error("Only a draft framework in this organization can be approved");
      await client.query("commit");
      await this.audit(actor, "monthly.framework_approved", frameworkId, { allocated: true });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      if (pooledClient) (client as import("pg").PoolClient).release();
    }
  }

  /** Safe one-time repair for an approved plan migration; refuses any authored lesson content. */
  async backfillApprovedFrameworkPlan(actorId: string, frameworkId: string, expectedMonth: string, expectedCefr: MonthFrameworkView["cefr"]): Promise<{ frameworkId: string; scopeHash: string; changed: boolean; daySpecs: number }> {
    const actor = await this.requireContentOperator(actorId);
    const pooledClient = "connect" in this.database;
    const client = pooledClient ? await (this.database as Pool).connect() : this.database;
    try {
      await client.query("begin");
      const result = await client.query<FrameworkRow & { month: string }>(
        `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement, pm.month
         from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
         where mf.id = $1 and pm.organization_id = $2 for update of mf`, [frameworkId, actor.organization_id]
      );
      const row = result.rows[0];
      if (!row || row.status !== "approved" || row.month !== expectedMonth || row.cefr !== expectedCefr) throw new Error("Approved framework does not match the explicitly requested month and CEFR");
      const lessonRows = await client.query<{ authored: string }>(
        `select count(*) filter (where ml.status <> 'pending' or ml.lesson_id is not null)::text as authored
         from month_lessons ml where ml.framework_id = $1`, [frameworkId]
      );
      if (Number(lessonRows.rows[0]?.authored ?? "0") !== 0) throw new Error("Plan backfill refuses a framework with authored lesson content");
      if (!("daySpecs" in row.curriculum_contract)) throw new Error("Approved framework has no allocated plan to repair");
      const repaired = backfillMonthlyCurriculumPlan(row.curriculum_contract);
      const validationErrors = validateMonthlyCurriculum(repaired);
      if (validationErrors.length) throw new Error(`Backfilled monthly plan is invalid: ${validationErrors.join("; ")}`);
      const scopeHash = monthlyScopeHash(repaired);
      const changed = JSON.stringify(row.curriculum_contract) !== JSON.stringify(repaired) || row.scope_hash !== scopeHash;
      if (changed) {
        await client.query("update month_frameworks set curriculum_contract = $2::jsonb, scope_hash = $3, updated_at = now() where id = $1", [frameworkId, JSON.stringify(repaired), scopeHash]);
        await client.query("update month_lessons set scope_hash = $2, updated_at = now() where framework_id = $1 and status = 'pending' and lesson_id is null", [frameworkId, scopeHash]);
        await client.query(
          `insert into audit_events (id, organization_id, action, entity_type, entity_id, payload, trace_id)
           values ($1, $2, 'monthly.framework_plan_backfilled', 'monthly_framework', $3, $4::jsonb, $5)`,
          [randomUUID(), actor.organization_id, frameworkId, JSON.stringify({ month: expectedMonth, cefr: expectedCefr, daySpecs: repaired.daySpecs.length, scopeHash }), randomUUID()]
        );
      }
      await client.query("commit");
      return { frameworkId, scopeHash, changed, daySpecs: repaired.daySpecs.length };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      if (pooledClient) (client as PoolClient).release();
    }
  }

  /**
   * Retirement is an audited Manager action for an invalid released resource
   * set. It preserves the frozen contract and every published lesson version;
   * the set simply stops being discoverable for future learning.
   */
  async retireFramework(managerId: string, frameworkId: string, reason: string): Promise<void> {
    const manager = await this.requireManager(managerId);
    const result = await this.database.query<{ id: string; month: string; cefr: string }>(
      `update month_frameworks mf
       set status = 'retired', updated_at = now()
       from program_months pm
       where mf.id = $1 and mf.program_month_id = pm.id and pm.organization_id = $2
         and mf.status in ('draft', 'generating', 'approved', 'failed')
       returning mf.id, pm.month, mf.cefr`,
      [frameworkId, manager.organization_id]
    );
    const framework = result.rows[0];
    if (!framework) throw new Error("Monthly framework was not found or is already retired");
    await this.audit(manager, "monthly.framework_retired", framework.id, {
      month: framework.month, cefr: framework.cefr, reason: reason.trim()
    });
    // Learners of this level hear about it in the bell (audit trigger, kind lesson_availability_changed).
  }

  /**
   * Cheap preconditions for AI generation of one monthly day, checked before
   * any model call (December 2026 N1: an approved day used to be generated in
   * full and only rejected at save time with a 500). Throws a 4xx httpError.
   */
  async assertMonthlyDayGenerationAllowed(actorId: string, frameworkId: string, dayNumber: number): Promise<void> {
    const actor = await this.requireContentOperator(actorId);
    const result = await this.database.query<{ framework_status: string; lesson_status: string | null; writable: boolean }>(
      `select mf.status as framework_status, ml.status as lesson_status,
              (pm.month = to_char(organization_system_date(pm.organization_id), 'YYYY-MM')
               or pm.month = to_char((organization_system_date(pm.organization_id) + interval '1 month')::date, 'YYYY-MM')) as writable
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       left join month_lessons ml on ml.framework_id = mf.id and ml.lesson_number = $3
       where mf.id = $1 and pm.organization_id = $2`,
      [frameworkId, actor.organization_id, dayNumber]
    );
    const row = result.rows[0];
    if (!row || row.framework_status === "retired") throw httpError(404, "MONTHLY_FRAMEWORK_NOT_FOUND", "Không tìm thấy khung tháng.");
    if (row.framework_status !== "approved") throw httpError(409, "MONTHLY_RESOURCES_NOT_LOCKED", "Tài nguyên tháng chưa được duyệt. Hãy duyệt tài nguyên trước khi sinh bài.");
    if (!row.writable) throw httpError(409, "MONTHLY_CONTENT_READ_ONLY", "Tháng này chỉ còn xem, không sinh lại bài được.");
    if (!row.lesson_status) throw httpError(409, "MONTHLY_DAY_NOT_MATERIALIZED", "Ngày này không có trong lịch bài của tháng.");
    if (row.lesson_status === "approved") {
      throw httpError(409, "MONTHLY_DAY_ALREADY_APPROVED", "Bài này đã được duyệt nên đang khoá. Hãy bấm \"Yêu cầu mở lại\" để Quản lý mở lại bài trước khi sinh lại.");
    }
  }

  /**
   * Keeps the final failing AI candidate of a day for diagnosis (December 2026
   * N3). It is stored only in month_lessons.generation_error: the day's draft,
   * status and quality report are untouched, so a failed candidate never
   * replaces a good draft and can never be approved. The next saved draft
   * clears it.
   */
  async saveMonthlyDayGenerationFailure(
    actorId: string,
    frameworkId: string,
    dayNumber: number,
    failure: { candidate: MonthlyLessonDraftInput | null; report: MonthlyQualityReportInput; attempts: number }
  ): Promise<void> {
    const actor = await this.requireContentOperator(actorId);
    const payload = {
      kind: "ai_generation_failed",
      failedAt: new Date().toISOString(),
      attempts: failure.attempts,
      report: { severe: failure.report.severe, light: failure.report.light, contractVersion: failure.report.contractVersion },
      candidate: failure.candidate ? { title: failure.candidate.title, parts: failure.candidate.parts } : null
    };
    const updated = await this.database.query<{ id: string }>(
      `update month_lessons ml set generation_error = $4::jsonb, updated_at = now()
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where ml.framework_id = mf.id and mf.id = $1 and ml.lesson_number = $2 and pm.organization_id = $3 and ml.status <> 'approved'
       returning ml.id`,
      [frameworkId, dayNumber, actor.organization_id, JSON.stringify(payload)]
    );
    const id = updated.rows[0]?.id;
    if (id) await this.audit(actor, "monthly.day_generation_failed", id, { frameworkId, dayNumber, attempts: failure.attempts, severe: failure.report.severe.length, light: failure.report.light.length });
  }

  async saveMonthlyDayDraft(
    actorId: string,
    frameworkId: string,
    dayNumber: number,
    lesson: MonthlyLessonDraftInput,
    report: MonthlyQualityReportInput
  ): Promise<void> {
    const actor = await this.requireContentOperator(actorId);
    const framework = await this.database.query<FrameworkRow>(
      `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2`,
      [frameworkId, actor.organization_id]
    );
    const row = framework.rows[0];
    if (!row) throw new Error("Monthly framework was not found");
    await this.requireWritableMonth(actor.organization_id, row.curriculum_contract.month);
    if (row.status !== "approved") throw new Error("Monthly resources must be locked before authoring a day");
    if (!("daySpecs" in row.curriculum_contract)) throw new Error("Monthly resources must be allocated before authoring a day");
    const spec = row.curriculum_contract.daySpecs.find((day) => day.lessonNumber === dayNumber);
    if (!spec) throw new Error("Monthly day is not in the locked DaySpec");
    if (report.contractVersion !== row.curriculum_contract.version) throw new Error("Monthly quality report uses a stale contract version");
    const cell = await this.database.query<{ id: string; status: string }>(
      "select id, status from month_lessons where framework_id = $1 and lesson_number = $2",
      [frameworkId, dayNumber]
    );
    const monthLesson = cell.rows[0];
    if (!monthLesson) throw new Error("Monthly DaySpec was not materialized");
    if (monthLesson.status === "approved") throw httpError(409, "MONTHLY_DAY_ALREADY_APPROVED", "Bài này đã được duyệt nên đang khoá. Hãy bấm \"Yêu cầu mở lại\" để Quản lý mở lại bài trước khi sửa.");

    const set = await this.database.query<{ id: string }>(
      `insert into lesson_sets (id, program_week_id, month_framework_id, cefr)
       values ($1, null, $2, $3)
       on conflict (month_framework_id) where month_framework_id is not null do update set month_framework_id = excluded.month_framework_id
       returning id`,
      [randomUUID(), frameworkId, row.cefr]
    );
    const lessonSetId = set.rows[0]!.id;
    const nextVersion = await this.database.query<{ version: number }>(
      "select coalesce(max(version), 0) + 1 as version from lesson_set_versions where lesson_set_id = $1",
      [lessonSetId]
    );
    const lessonSetVersionId = randomUUID();
    await this.database.query(
      `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by)
       values ($1, $2, $3, 'draft', $4::jsonb, $5)`,
      [lessonSetVersionId, lessonSetId, nextVersion.rows[0]?.version ?? 1, JSON.stringify({ source: "monthly", month: row.curriculum_contract.month, dayNumber }), actorId]
    );
    const lessonId = randomUUID();
    await this.database.query(
      "insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, $4)",
      [lessonId, lessonSetVersionId, dayNumber, lesson.title.trim()]
    );
    const contentVersionId = randomUUID();
    await this.database.query(
      `insert into lesson_versions (id, lesson_id, version, status, content)
       values ($1, $2, 1, 'draft', $3::jsonb)`,
      [contentVersionId, lessonId, JSON.stringify({ durationMinutes: 15, parts: lesson.parts })]
    );
    await this.database.query(
      `update month_lessons
       set lesson_id = $2, status = $3, quality_report = $4::jsonb, quality_acknowledgement = null,
           generation_error = case when $3 = 'failed' then $4::jsonb else null end, updated_at = now()
       where id = $1`,
      [monthLesson.id, lessonId, report.severe.length ? "failed" : "draft", JSON.stringify(report)]
    );
    await this.audit(actor, "monthly.day_draft_saved", monthLesson.id, { frameworkId, dayNumber, contentVersionId, scopeHash: row.scope_hash, severe: report.severe.length, light: report.light.length });
  }

  async acknowledgeMonthlyDayQuality(actorId: string, frameworkId: string, dayNumber: number, findingKeys: string[]): Promise<void> {
    const actor = await this.requireContentOperator(actorId);
    const frameworkMonth = await this.monthForFramework(frameworkId, actor.organization_id);
    if (!frameworkMonth) throw new Error("Monthly framework was not found");
    await this.requireWritableMonth(actor.organization_id, frameworkMonth);
    const result = await this.database.query<MonthLessonRow & { id: string }>(
      `select ml.id, ml.lesson_number, ml.lesson_date::text, ml.status, ml.scope_hash, ml.quality_report, ml.quality_acknowledgement,
              (select count(*) from month_lesson_corrections mlc where mlc.month_lesson_id = ml.id)::text as correction_count
       from month_lessons ml join month_frameworks mf on mf.id = ml.framework_id join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and ml.lesson_number = $2 and pm.organization_id = $3 and mf.status = 'approved'`,
      [frameworkId, dayNumber, actor.organization_id]
    );
    const day = result.rows[0];
    if (!day) throw new Error("Locked monthly day was not found");
    day.quality_report = activeQualityReport(day.quality_report);
    if (day.quality_report.severe.length) throw new Error("Severe monthly quality findings block acknowledgement");
    if (day.quality_report.light.length > 0 && !acknowledgementCoversLightFindings(day.quality_report.light, findingKeys)) {
      throw new Error("Operator must acknowledge every light finding individually");
    }
    // The light-finding cap is per lesson (one or two light issues may be
    // acknowledged); a month of 20+ lessons is never summed against it.
    // Advisory findings (grammar formula vs examples) never count toward it.
    const currentDayLightCount = monthlyGatedLightFindings(day.quality_report.light).length;
    if (currentDayLightCount > 2) throw new Error("Monthly lesson exceeds the two-light-finding limit");
    const acknowledgement: OperatorAcknowledgementView = { actorId, acknowledgedAt: new Date().toISOString(), findingCodes: findingKeys };
    await this.database.query("update month_lessons set quality_acknowledgement = $2::jsonb where id = $1", [day.id, JSON.stringify(acknowledgement)]);
    await this.audit(actor, "monthly.day_quality_acknowledged", day.id, { frameworkId, dayNumber, findingKeys, currentDayLightCount });
  }

  /**
   * Approves a saved day draft. `acknowledgeSevereFindings` (13/11, "Vẫn duyệt")
   * lets the Operator approve while severe findings remain: every remaining
   * finding is accepted at once and the override is recorded on the day
   * (quality_acknowledgement) and in audit_events. `integrityIssues` checks the
   * stored lesson can still render and play; any issue keeps the day blocked.
   */
  async approveMonthlyDay(actorId: string, frameworkId: string, dayNumber: number, options: MonthlyDayApprovalOptions = {}): Promise<void> {
    const actor = await this.requireContentOperator(actorId);
    const frameworkMonth = await this.monthForFramework(frameworkId, actor.organization_id);
    if (!frameworkMonth) throw new Error("Monthly framework was not found");
    await this.requireWritableMonth(actor.organization_id, frameworkMonth);
    const result = await this.database.query<MonthLessonRow & { id: string; lesson_id: string | null }>(
      `select ml.id, ml.lesson_id, ml.lesson_number, ml.lesson_date::text, ml.status, ml.scope_hash, ml.quality_report, ml.quality_acknowledgement,
              (select count(*) from month_lesson_corrections mlc where mlc.month_lesson_id = ml.id)::text as correction_count
       from month_lessons ml join month_frameworks mf on mf.id = ml.framework_id join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and ml.lesson_number = $2 and pm.organization_id = $3 and mf.status = 'approved'`,
      [frameworkId, dayNumber, actor.organization_id]
    );
    const day = result.rows[0];
    if (day) day.quality_report = activeQualityReport(day.quality_report);
    const decision = monthlyDayApprovalDecision(day ?? null, options.acknowledgeSevereFindings === true);
    if (!decision.ok) throw httpError(decision.status, decision.code, decision.message);
    const lessonId = day!.lesson_id!;
    const override = decision.override;
    if (override) {
      // Never past a broken lesson: the stored draft must still render and play.
      const stored = await this.database.query<{ content: { parts?: Array<{ code: string; content: unknown }> } }>(
        "select content from lesson_versions where lesson_id = $1 order by version desc limit 1",
        [lessonId]
      );
      const issues = options.integrityIssues?.(stored.rows[0]?.content?.parts ?? []) ?? [];
      if (issues.length) throw httpError(409, "MONTHLY_DAY_INTEGRITY_BLOCKED", `Không thể duyệt: bài đang hỏng cấu trúc nên học viên không mở hoặc không làm được. Hãy sửa trước: ${issues.join("; ")}.`);
    }
    await this.database.query("update lesson_versions set status = 'published' where lesson_id in (select id from lessons where id = $1) and status = 'draft'", [lessonId]);
    await this.database.query("update lesson_set_versions set status = 'published', published_at = now() where id = (select lesson_set_version_id from lessons where id = $1)", [lessonId]);
    const approvedAt = new Date().toISOString();
    if (override) {
      const acknowledgement: OperatorAcknowledgementView = { actorId, acknowledgedAt: approvedAt, findingCodes: override.findingKeys, severeOverride: true, severeFindingCodes: override.severeCodes };
      await this.database.query(
        "update month_lessons set status = 'approved', approved_by = $2, approved_at = $3::timestamptz, quality_acknowledgement = $4::jsonb, updated_at = now() where id = $1",
        [day!.id, actorId, approvedAt, JSON.stringify(acknowledgement)]
      );
      await this.database.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'monthly.day_approved_with_severe_findings', 'monthly_framework', $4, $5::jsonb, $6)`,
        [randomUUID(), actor.organization_id, actorId, day!.id, JSON.stringify({
          frameworkId, dayNumber, scopeHash: day!.scope_hash, approvedBy: actorId, approvedAt,
          severeFindingCodes: override.severeCodes,
          severeFindings: day!.quality_report.severe.map((finding) => ({ code: finding.code, component: finding.component ?? null })),
          lightFindingCodes: day!.quality_report.light.map((finding) => finding.code)
        }), randomUUID()]
      );
    } else {
      await this.database.query(
        "update month_lessons set status = 'approved', approved_by = $2, approved_at = now(), updated_at = now() where id = $1",
        [day!.id, actorId]
      );
    }
    await this.audit(actor, "monthly.day_approved", day!.id, { frameworkId, dayNumber, scopeHash: day!.scope_hash, ...(override ? { severeOverride: true, approvedBy: actorId, severeFindingCodes: override.severeCodes } : {}) });
  }

  async createMonthlyCorrection(actorId: string, frameworkId: string, dayNumber: number, reason: string): Promise<string> {
    const actor = await this.requireContentOperator(actorId);
    const current = await this.database.query<{ id: string; lesson_id: string; version_id: string; status: string }>(
      `select ml.id, ml.lesson_id, lv.id as version_id, ml.status
       from month_lessons ml join month_frameworks mf on mf.id = ml.framework_id
       join program_months pm on pm.id = mf.program_month_id
       join lessons l on l.id = ml.lesson_id
       join lesson_versions lv on lv.lesson_id = l.id and lv.status = 'published'
       where mf.id = $1 and ml.lesson_number = $2 and pm.organization_id = $3
       order by lv.version desc limit 1`,
      [frameworkId, dayNumber, actor.organization_id]
    );
    const day = current.rows[0];
    if (!day || day.status !== "approved") throw new Error("Only an approved monthly day can receive a correction revision");
    const correctionId = randomUUID();
    await this.database.query(
      `insert into month_lesson_corrections
         (id, month_lesson_id, original_lesson_version_id, requested_by, reason, status)
       values ($1, $2, $3, $4, $5, 'requested')`,
      [correctionId, day.id, day.version_id, actorId, reason.trim()]
    );
    await this.audit(actor, "monthly.correction_requested", correctionId, { frameworkId, dayNumber, reason: reason.trim(), originalLessonId: day.lesson_id });
    return correctionId;
  }

  async saveMonthlyCorrection(actorId: string, correctionId: string, lesson: MonthlyLessonDraftInput, report: MonthlyQualityReportInput): Promise<void> {
    const actor = await this.requireContentOperator(actorId);
    const result = await this.database.query<{ correction_id: string; month_lesson_id: string; day_number: number; framework_id: string; cefr: MonthFrameworkView["cefr"]; month: string; status: string; version: number; contract_version: number }>(
      `select mlc.id as correction_id, ml.id as month_lesson_id, ml.lesson_number as day_number, mf.id as framework_id,
              mf.cefr, pm.month, mlc.status, mf.version, (mf.curriculum_contract->>'version')::int as contract_version
       from month_lesson_corrections mlc join month_lessons ml on ml.id = mlc.month_lesson_id
       join month_frameworks mf on mf.id = ml.framework_id join program_months pm on pm.id = mf.program_month_id
       where mlc.id = $1 and pm.organization_id = $2`,
      [correctionId, actor.organization_id]
    );
    const row = result.rows[0];
    if (!row || row.status !== "authorized") throw new Error("Authorized monthly correction was not found");
    if (report.contractVersion !== row.contract_version) throw new Error("Monthly correction quality report uses a stale contract version");
    const set = await this.database.query<{ id: string }>("select id from lesson_sets where month_framework_id = $1", [row.framework_id]);
    const lessonSetId = set.rows[0]?.id;
    if (!lessonSetId) throw new Error("Monthly lesson set was not found");
    const nextVersion = await this.database.query<{ version: number }>("select coalesce(max(version), 0) + 1 as version from lesson_set_versions where lesson_set_id = $1", [lessonSetId]);
    const lessonSetVersionId = randomUUID();
    await this.database.query(
      `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by)
       values ($1, $2, $3, 'draft', $4::jsonb, $5)`,
      [lessonSetVersionId, lessonSetId, nextVersion.rows[0]?.version ?? 1, JSON.stringify({ source: "monthly_correction", month: row.month, dayNumber: row.day_number, correctionId }), actorId]
    );
    const lessonId = randomUUID();
    await this.database.query("insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, $4)", [lessonId, lessonSetVersionId, row.day_number, lesson.title.trim()]);
    const lessonVersionId = randomUUID();
    await this.database.query(
      "insert into lesson_versions (id, lesson_id, version, status, content) values ($1, $2, 1, 'draft', $3::jsonb)",
      [lessonVersionId, lessonId, JSON.stringify({ durationMinutes: 15, parts: lesson.parts })]
    );
    await this.database.query(
      "update month_lesson_corrections set correction_lesson_version_id = $2, quality_report = $3::jsonb, quality_acknowledgement = null where id = $1",
      [correctionId, lessonVersionId, JSON.stringify(report)]
    );
    await this.audit(actor, "monthly.correction_draft_saved", correctionId, { dayNumber: row.day_number, lessonVersionId, severe: report.severe.length, light: report.light.length });
  }

  async acknowledgeMonthlyCorrectionQuality(actorId: string, correctionId: string, findingKeys: string[]): Promise<void> {
    const actor = await this.requireContentOperator(actorId);
    const result = await this.database.query<{ id: string; status: string; quality_report: MonthlyQualityReportInput }>(
      `select mlc.id, mlc.status, mlc.quality_report from month_lesson_corrections mlc
       join month_lessons ml on ml.id = mlc.month_lesson_id join month_frameworks mf on mf.id = ml.framework_id
       join program_months pm on pm.id = mf.program_month_id where mlc.id = $1 and pm.organization_id = $2`,
      [correctionId, actor.organization_id]
    );
    const correction = result.rows[0];
    if (!correction || correction.status !== "authorized") throw new Error("Authorized monthly correction was not found");
    correction.quality_report = activeQualityReport(correction.quality_report);
    if (correction.quality_report.severe.length) throw new Error("Severe monthly correction findings block acknowledgement");
    if (!acknowledgementCoversLightFindings(correction.quality_report.light, findingKeys)) throw new Error("Operator must acknowledge every correction finding individually");
    const acknowledgement: OperatorAcknowledgementView = { actorId, acknowledgedAt: new Date().toISOString(), findingCodes: findingKeys };
    await this.database.query("update month_lesson_corrections set quality_acknowledgement = $2::jsonb where id = $1", [correctionId, JSON.stringify(acknowledgement)]);
    await this.audit(actor, "monthly.correction_quality_acknowledged", correctionId, { findingKeys });
  }

  async approveMonthlyCorrection(actorId: string, correctionId: string): Promise<void> {
    const actor = await this.requireContentOperator(actorId);
    const result = await this.database.query<{
      id: string; month_lesson_id: string; correction_lesson_version_id: string | null; status: string;
      quality_report: MonthlyQualityReportInput; quality_acknowledgement: OperatorAcknowledgementView | null;
      target: "daily_lesson" | "weekly_review";
    }>(
      `select mlc.id, mlc.month_lesson_id, mlc.correction_lesson_version_id, mlc.status, mlc.quality_report, mlc.quality_acknowledgement,
              case when (mf.curriculum_contract->'daySpecs' @> jsonb_build_array(jsonb_build_object('lessonNumber', ml.lesson_number, 'kind', 'review'))) then 'weekly_review' else 'daily_lesson' end as target
       from month_lesson_corrections mlc join month_lessons ml on ml.id = mlc.month_lesson_id
       join month_frameworks mf on mf.id = ml.framework_id join program_months pm on pm.id = mf.program_month_id
       where mlc.id = $1 and pm.organization_id = $2`,
      [correctionId, actor.organization_id]
    );
    const correction = result.rows[0];
    if (!correction || correction.status !== "authorized" || !correction.correction_lesson_version_id) throw new Error("Monthly correction draft was not found");
    correction.quality_report = activeQualityReport(correction.quality_report);
    if (correction.quality_report.severe.length) throw new Error("Severe monthly correction findings block approval");
    const acknowledged = new Set(correction.quality_acknowledgement?.findingCodes ?? []);
    if (monthlyGatedLightFindings(correction.quality_report.light).map(qualityFindingKey).some((key) => !acknowledged.has(key))) throw new Error("Operator must acknowledge every correction finding before approval");
    const lesson = await this.database.query<{ lesson_id: string }>("select lesson_id from lesson_versions where id = $1", [correction.correction_lesson_version_id]);
    const lessonId = lesson.rows[0]?.lesson_id;
    if (!lessonId) throw new Error("Monthly correction content version was not found");
    await this.database.query("update lesson_versions set status = 'published' where id = $1 and status = 'draft'", [correction.correction_lesson_version_id]);
    await this.database.query("update lesson_set_versions set status = 'published', published_at = now() where id = (select l.lesson_set_version_id from lesson_versions lv join lessons l on l.id = lv.lesson_id where lv.id = $1)", [correction.correction_lesson_version_id]);
    await this.database.query("update month_lesson_corrections set status = 'published', published_at = now() where id = $1", [correctionId]);
    await this.database.query("update month_lessons set lesson_id = $2, updated_at = now() where id = $1", [correction.month_lesson_id, lessonId]);
    await this.audit(actor, "monthly.correction_published", correctionId, { monthLessonId: correction.month_lesson_id, lessonId });
    // Publishing the correction notifies the level cohort in the bell (trigger, kind lesson_published).
  }

  async listReopenRequests(managerId: string): Promise<ReopenRequestView[]> {
    const manager = await this.requireManager(managerId);
    return this.listOrganizationReopenRequests(manager.organization_id);
  }

  async listOwnReopenRequests(actorId: string): Promise<ReopenRequestView[]> {
    const actor = await this.requireContentOperator(actorId);
    return this.listOrganizationReopenRequests(actor.organization_id, actorId);
  }

  private async listOrganizationReopenRequests(organizationId: string, requestedBy: string | null = null): Promise<ReopenRequestView[]> {
    const result = await this.database.query<ReopenRequestRow & { lesson_date: string; cefr: CefrLevel; lesson_number: number; new_lesson_ordinal: number }>(
      `select mlc.id, ml.lesson_date::text as lesson_date, mf.cefr, ml.lesson_number,
              (select count(*)::int from jsonb_array_elements(mf.curriculum_contract->'daySpecs') as ordinal_spec(item) where ordinal_spec.item->>'kind' = 'new' and (ordinal_spec.item->>'lessonNumber')::int <= ml.lesson_number) as new_lesson_ordinal,
              case when (mf.curriculum_contract->'daySpecs' @> jsonb_build_array(jsonb_build_object('lessonNumber', ml.lesson_number, 'kind', 'review'))) then 'weekly_review' else 'daily_lesson' end as target,
              ml.id as target_id, mlc.requested_by, mlc.reason, mlc.status, mlc.decision_reason, mlc.created_at, mlc.decided_at, mlc.archived_at
       from month_lesson_corrections mlc
       join month_lessons ml on ml.id = mlc.month_lesson_id
       join month_frameworks mf on mf.id = ml.framework_id
       join program_months pm on pm.id = mf.program_month_id
       where pm.organization_id = $1
         and (($2::uuid is null and mlc.staff_deleted_at is null) or mlc.requested_by = $2)
       order by mlc.created_at desc`, [organizationId, requestedBy]
    );
    const lessonRequests: ReopenRequestView[] = result.rows.map((row) => ({
      id: row.id, target: row.target, targetId: row.target_id, requestedBy: row.requested_by, reason: row.reason,
      status: row.status === "requested" ? "pending" : row.status === "rejected" ? "rejected" : "approved",
      decisionReason: row.decision_reason, createdAt: row.created_at.toISOString(), decidedAt: row.decided_at?.toISOString() ?? null,
      archivedAt: row.archived_at?.toISOString() ?? null,
      lesson: { date: row.lesson_date, cefr: row.cefr, number: row.lesson_number, ...(row.target === "daily_lesson" && row.new_lesson_ordinal ? { newLessonNumber: row.new_lesson_ordinal } : {}) }
    }));
    const frameworkRequests = await this.listFrameworkReopenRequests(organizationId, requestedBy);
    return [...lessonRequests, ...frameworkRequests].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async decideReopenRequest(managerId: string, correctionId: string, decision: "approved" | "rejected", reason: string): Promise<{
    id: string; target: "daily_lesson" | "weekly_review"; targetId: string; requestedBy: string; reason: string;
    status: "approved" | "rejected"; decisionReason: string; createdAt: string; decidedAt: string;
  }> {
    const manager = await this.requireManager(managerId);
    const result = await this.database.query<ReopenRequestRow>(
      `update month_lesson_corrections mlc set status = $3::text, authorized_by = case when $3 = 'authorized' then $2::uuid else null end,
          authorized_at = case when $3 = 'authorized' then now() else null end, decided_by = $2::uuid, decided_at = now(), decision_reason = $4
       from month_lessons ml join month_frameworks mf on mf.id = ml.framework_id join program_months pm on pm.id = mf.program_month_id
       where mlc.id = $1 and mlc.month_lesson_id = ml.id and pm.organization_id = $5 and mlc.status = 'requested'
       returning mlc.id,
                 case when (mf.curriculum_contract->'daySpecs' @> jsonb_build_array(jsonb_build_object('lessonNumber', ml.lesson_number, 'kind', 'review'))) then 'weekly_review' else 'daily_lesson' end as target,
                 ml.id as target_id, mlc.requested_by, mlc.reason, mlc.status, mlc.decision_reason, mlc.created_at, mlc.decided_at`,
      [correctionId, managerId, decision === "approved" ? "authorized" : "rejected", reason.trim(), manager.organization_id]
    );
    const row = result.rows[0];
    if (!row) throw httpError(409, "REOPEN_REQUEST_NOT_PENDING", "Yêu cầu mở lại đã được xử lý hoặc không còn hiệu lực.");
    await this.audit(manager, `monthly.reopen_${decision}`, correctionId, { target: row.target, targetId: row.target_id, reason: reason.trim() });
    if (decision === "approved") {
      await this.notifyLessonReopened(manager.organization_id, correctionId, row.target_id);
    }
    return { id: row.id, target: row.target, targetId: row.target_id, requestedBy: row.requested_by, reason: row.reason,
      status: decision, decisionReason: row.decision_reason ?? reason.trim(), createdAt: row.created_at.toISOString(), decidedAt: row.decided_at!.toISOString() };
  }
  /**
   * Operator asks a Manager to reopen an approved monthly resource set. Only an
   * approved framework of a writable month qualifies, with at most one open
   * request per framework (409 when one is already pending).
   */
  async requestFrameworkReopen(actorId: string, frameworkId: string, reason: string): Promise<MonthFrameworkReopenRequestView> {
    const actor = await this.requireContentOperator(actorId);
    const framework = await this.database.query<{ id: string; version: number; status: string; month: string; cefr: string }>(
      `select mf.id, mf.version, mf.status, pm.month, mf.cefr
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2`, [frameworkId, actor.organization_id]
    );
    const row = framework.rows[0];
    if (!row) throw httpError(404, "MONTHLY_FRAMEWORK_NOT_FOUND", "Monthly framework was not found");
    if (row.status !== "approved") throw httpError(409, "MONTHLY_FRAMEWORK_NOT_APPROVED", "Only approved monthly resources can be reopened");
    if (!await this.isWritableMonth(actor.organization_id, row.month)) throw httpError(409, "MONTHLY_CONTENT_READ_ONLY", "Monthly content is read-only outside the current and next month");
    const pending = await this.database.query("select 1 from month_framework_reopen_requests where framework_id = $1 and status = 'requested' limit 1", [frameworkId]);
    if (pending.rowCount) throw httpError(409, "MONTHLY_RESOURCE_REOPEN_PENDING", "A reopen request for these monthly resources is already waiting for a Manager");
    let inserted;
    try {
      inserted = await this.database.query<FrameworkReopenRequestRow>(
        `insert into month_framework_reopen_requests (id, framework_id, framework_version, requested_by, reason, status)
         values ($1, $2, $3, $4, $5, 'requested')
         returning id, framework_id, framework_version, requested_by, reason, status, decision_reason, removed_lesson_count, created_at, decided_at`,
        [randomUUID(), frameworkId, row.version, actorId, reason.trim()]
      );
    } catch (error) {
      // The partial unique index closes the race between two concurrent requests.
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        throw httpError(409, "MONTHLY_RESOURCE_REOPEN_PENDING", "A reopen request for these monthly resources is already waiting for a Manager");
      }
      throw error;
    }
    const request = inserted.rows[0]!;
    await this.audit(actor, "monthly.framework_reopen_requested", frameworkId, { requestId: request.id, month: row.month, cefr: row.cefr, version: row.version, reason: reason.trim() });
    return toFrameworkReopenView(request);
  }

  /** True when the id names a monthly-resource reopen request in the Manager's organization. */
  async isFrameworkReopenRequest(managerId: string, requestId: string): Promise<boolean> {
    const manager = await this.requireManager(managerId);
    const result = await this.database.query(
      `select 1 from month_framework_reopen_requests r
       join month_frameworks mf on mf.id = r.framework_id join program_months pm on pm.id = mf.program_month_id
       where r.id = $1 and pm.organization_id = $2`, [requestId, manager.organization_id]
    );
    return Boolean(result.rowCount);
  }

  /**
   * Manager decision on a monthly-resource reopen request. Approval runs in one
   * transaction: the framework returns to a draft resource pool (all resources
   * kept, DaySpecs stripped, approval cleared, version bumped so anything tied to
   * the old plan, such as monthly-final drafts, becomes stale), its
   * month_lessons rows are deleted, and the decision is audited.
   */
  async decideFrameworkReopenRequest(managerId: string, requestId: string, decision: "approved" | "rejected", reason: string): Promise<ReopenRequestView> {
    const manager = await this.requireManager(managerId);
    const pooledClient = "connect" in this.database;
    const client = pooledClient ? await (this.database as Pool).connect() : this.database;
    let decided: FrameworkReopenRequestRow;
    let approvedLessonCount = 0;
    try {
      await client.query("begin");
      const locked = await client.query<FrameworkReopenRequestRow & { month: string }>(
        `select r.id, r.framework_id, r.framework_version, r.requested_by, r.reason, r.status, r.decision_reason, r.removed_lesson_count,
                r.created_at, r.decided_at, pm.month
         from month_framework_reopen_requests r
         join month_frameworks mf on mf.id = r.framework_id join program_months pm on pm.id = mf.program_month_id
         where r.id = $1 and pm.organization_id = $2 for update of r`, [requestId, manager.organization_id]
      );
      const request = locked.rows[0];
      if (!request) throw httpError(404, "REOPEN_REQUEST_NOT_FOUND", "Không tìm thấy yêu cầu mở lại.");
      if (request.status !== "requested") throw httpError(409, "REOPEN_REQUEST_NOT_PENDING", "Yêu cầu mở lại đã được xử lý hoặc không còn hiệu lực.");
      let removedLessonCount: number | null = null;
      let reopened: Record<string, unknown> = {};
      if (decision === "approved") {
        const writable = await client.query<{ writable: boolean }>(
          `select ($2 = to_char(organization_system_date($1), 'YYYY-MM')
                   or $2 = to_char((organization_system_date($1) + interval '1 month')::date, 'YYYY-MM')) as writable`,
          [manager.organization_id, request.month]
        );
        if (!writable.rows[0]?.writable) throw httpError(409, "MONTHLY_CONTENT_READ_ONLY", "Monthly content is read-only outside the current and next month");
        const frameworkResult = await client.query<FrameworkRow>(
          `select id, cefr, version, status, scope_hash, curriculum_contract, quality_acknowledgement
           from month_frameworks where id = $1 for update`, [request.framework_id]
        );
        const framework = frameworkResult.rows[0];
        if (!framework || framework.status !== "approved") throw httpError(409, "MONTHLY_FRAMEWORK_NOT_APPROVED", "Only approved monthly resources can be reopened");
        const counts = await client.query<{ total: string; approved: string; with_content: string }>(
          `select count(*)::text as total,
                  count(*) filter (where status = 'approved')::text as approved,
                  count(*) filter (where status <> 'pending' or lesson_id is not null)::text as with_content
           from month_lessons where framework_id = $1`, [framework.id]
        );
        removedLessonCount = Number(counts.rows[0]?.total ?? "0");
        approvedLessonCount = Number(counts.rows[0]?.approved ?? "0");
        const version = framework.version + 1;
        const pool = toMonthlyResourcePool(framework.curriculum_contract, version);
        const scopeHash = monthlyResourcePoolHash(pool);
        await client.query(
          `update month_frameworks
           set status = 'draft', version = $2, curriculum_contract = $3::jsonb, scope_hash = $4,
               quality_acknowledgement = null, approved_by = null, approved_at = null,
               published_at = null, published_on = null, updated_at = now()
           where id = $1`, [framework.id, version, JSON.stringify(pool), scopeHash]
        );
        await client.query("delete from month_lessons where framework_id = $1", [framework.id]);
        reopened = {
          month: request.month, cefr: framework.cefr, previousVersion: framework.version, version, scopeHash,
          removedLessonCount, lessonsWithContent: Number(counts.rows[0]?.with_content ?? "0"), approvedLessonCount
        };
      }
      const updated = await client.query<FrameworkReopenRequestRow>(
        `update month_framework_reopen_requests
         set status = $2, decided_by = $3, decided_at = now(), decision_reason = $4, removed_lesson_count = $5
         where id = $1
         returning id, framework_id, framework_version, requested_by, reason, status, decision_reason, removed_lesson_count, created_at, decided_at`,
        [requestId, decision === "approved" ? "authorized" : "rejected", managerId, reason.trim(), removedLessonCount]
      );
      decided = updated.rows[0]!;
      await client.query(
        `insert into audit_events (id, organization_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'monthly_framework', $4, $5::jsonb, $6)`,
        [randomUUID(), manager.organization_id, decision === "approved" ? "monthly.framework_reopened" : "monthly.framework_reopen_rejected",
          request.framework_id, JSON.stringify({ requestId, reason: reason.trim(), ...reopened }), randomUUID()]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      if (pooledClient) (client as PoolClient).release();
    }
    // An approved reopen with approved lessons reaches the level cohort once, in the bell, through the
    // monthly.framework_reopened audit trigger (kind lesson_availability_changed).
    const detail = await this.frameworkReopenDetail(decided.framework_id);
    return toFrameworkReopenRequestView({ ...decided, ...detail });
  }

  private async frameworkReopenDetail(frameworkId: string): Promise<Pick<FrameworkReopenListRow, "month" | "cefr" | "lesson_count" | "lessons_with_content">> {
    const result = await this.database.query<Pick<FrameworkReopenListRow, "month" | "cefr" | "lesson_count" | "lessons_with_content">>(
      `select pm.month, mf.cefr,
              (select count(*) from month_lessons ml where ml.framework_id = mf.id)::text as lesson_count,
              (select count(*) from month_lessons ml where ml.framework_id = mf.id and (ml.status <> 'pending' or ml.lesson_id is not null))::text as lessons_with_content
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id where mf.id = $1`, [frameworkId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Monthly framework was not found");
    return row;
  }

  private async listFrameworkReopenRequests(organizationId: string, requestedBy: string | null): Promise<ReopenRequestView[]> {
    const result = await this.database.query<FrameworkReopenListRow>(
      `select r.id, r.framework_id, r.framework_version, r.requested_by, r.reason, r.status, r.decision_reason, r.removed_lesson_count,
              r.created_at, r.decided_at, r.archived_at, pm.month, mf.cefr,
              (select count(*) from month_lessons ml where ml.framework_id = mf.id)::text as lesson_count,
              (select count(*) from month_lessons ml where ml.framework_id = mf.id and (ml.status <> 'pending' or ml.lesson_id is not null))::text as lessons_with_content
       from month_framework_reopen_requests r
       join month_frameworks mf on mf.id = r.framework_id
       join program_months pm on pm.id = mf.program_month_id
       where pm.organization_id = $1
         and (($2::uuid is null and r.staff_deleted_at is null) or r.requested_by = $2)
       order by r.created_at desc`, [organizationId, requestedBy]
    );
    return result.rows.map(toFrameworkReopenRequestView);
  }

  private async latestFrameworkReopenRequests(frameworkIds: string[]): Promise<Map<string, MonthFrameworkReopenRequestView>> {
    if (!frameworkIds.length) return new Map();
    const result = await this.database.query<FrameworkReopenRequestRow>(
      `select distinct on (framework_id) id, framework_id, framework_version, requested_by, reason, status, decision_reason, removed_lesson_count, created_at, decided_at
       from month_framework_reopen_requests where framework_id = any($1::uuid[])
       order by framework_id, created_at desc`, [frameworkIds]
    );
    return new Map(result.rows.map((row) => [row.framework_id, toFrameworkReopenView(row)]));
  }

  async previewMonthPublication(actorId: string, frameworkId: string): Promise<MonthlyPublicationPreviewView> {
    const actor = await this.requireContentOperator(actorId);
    const result = await this.database.query<{ month: string; exam_date: string; today: string; next_month: string; affected: number }>(
      `select pm.month, pm.exam_date::text, organization_system_date(pm.organization_id)::text as today,
              to_char((pm.month || '-01')::date + interval '1 month', 'YYYY-MM') as next_month,
              (select count(distinct e.learner_id)::int from enrollments e
               join programs p on p.id = e.program_id and p.status = 'active'
               join users learner on learner.id = e.learner_id and learner.status = 'active'
               where learner.organization_id = pm.organization_id and learner.role = 'learner'
                 and p.organization_id = pm.organization_id and e.cefr_approved and e.cefr = mf.cefr) as affected
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2 and mf.status <> 'retired'`,
      [frameworkId, actor.organization_id]
    );
    const row = result.rows[0];
    if (!row) throw httpError(404, "MONTHLY_FRAMEWORK_NOT_FOUND", "Không tìm thấy khung tháng.");
    await this.requireWritableMonth(actor.organization_id, row.month);
    const late = row.today > `${row.month}-01`;
    const affectedLearners = late ? row.affected : 0;
    const waitingNextMonth = late && !monthlyLearnerWindow(row.month, row.exam_date, row.today).canStudy ? affectedLearners : 0;
    return { publishOn: row.today, affectedLearners, waitingNextMonth, nextMonth: row.next_month };
  }

  async planExpiredContentRetention(managerId: string) {
    const manager = await this.requireManager(managerId);
    const { rows } = await this.database.query<{
      month: string; frameworks: number; lessons: number; exam_versions: number;
      pending_lesson_appeals: number; pending_exam_appeals: number;
    }>(
      `select pm.month,
              (select count(*)::int from month_frameworks mf where mf.program_month_id = pm.id) as frameworks,
              (select count(*)::int from month_lessons ml join month_frameworks mf on mf.id = ml.framework_id
               where mf.program_month_id = pm.id) as lessons,
              (select count(*)::int from assessment_versions av join assessment_definitions ad on ad.id = av.definition_id
               where ad.organization_id = pm.organization_id and ad.kind = 'final'
                 and ad.assessment_key ~ ('^monthly-final-' || pm.month || '-(a1|a2|b1|b2|c1)$')) as exam_versions,
              (select count(*)::int from lesson_part_appeals a join lessons l on l.id = a.lesson_id
               join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id
               join lesson_sets ls on ls.id = lsv.lesson_set_id
               join month_frameworks mf on mf.id = ls.month_framework_id
               where mf.program_month_id = pm.id and a.status = 'pending') as pending_lesson_appeals,
              (select count(*)::int from appeals a join assessment_attempts aa on aa.id = a.attempt_id
               join assessment_versions av on av.id = aa.assessment_version_id join assessment_definitions ad on ad.id = av.definition_id
               where ad.organization_id = pm.organization_id and ad.kind = 'final'
                 and ad.assessment_key ~ ('^monthly-final-' || pm.month || '-(a1|a2|b1|b2|c1)$')
                 and a.status = 'pending') as pending_exam_appeals
       from program_months pm where pm.organization_id = $1
         and pm.month < to_char(organization_system_date(pm.organization_id) - interval '1 month', 'YYYY-MM')
       order by pm.month`,
      [manager.organization_id]
    );
    return { months: rows.map(row => ({
      month: row.month, frameworks: row.frameworks, lessons: row.lessons, examVersions: row.exam_versions,
      pendingLessonAppeals: row.pending_lesson_appeals, pendingExamAppeals: row.pending_exam_appeals
    })) };
  }

  async publishMonth(actorId: string, frameworkId: string, confirmedOn?: string): Promise<{ publishedOn: string }> {
    const actor = await this.requireContentOperator(actorId);
    const pooledClient = "connect" in this.database;
    const client = pooledClient ? await this.database.connect() : this.database;
    try {
      await client.query("begin");
      const result = await client.query<{ month: string; cefr: CefrLevel; today: string; published_on: string | null }>(
        `select pm.month, mf.cefr, organization_system_date(pm.organization_id)::text as today, mf.published_on::text
         from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
         where mf.id = $1 and pm.organization_id = $2 and mf.status <> 'retired' for update of mf`,
        [frameworkId, actor.organization_id]
      );
      const row = result.rows[0];
      if (!row) throw httpError(404, "MONTHLY_FRAMEWORK_NOT_FOUND", "Không tìm thấy khung tháng.");
      if (row.published_on) {
        await client.query("commit");
        return { publishedOn: row.published_on };
      }
      if (confirmedOn && confirmedOn !== row.today) throw httpError(409, "MONTHLY_PUBLICATION_DATE_CHANGED", "Ngày hệ thống đã đổi. Hãy kiểm tra lại ảnh hưởng trước khi công bố.");
      const published = await client.query(
        `update month_frameworks mf set published_at = now(), published_on = $2::date, updated_at = now()
         from program_months pm
         where mf.id = $1 and pm.id = mf.program_month_id
           and pm.month between to_char($2::date, 'YYYY-MM') and to_char($2::date + interval '1 month', 'YYYY-MM')
           and monthly_framework_ready_for_publication(mf.id)`,
        [frameworkId, row.today]
      );
      if (!published.rowCount) throw httpError(409, "MONTHLY_PUBLICATION_INCOMPLETE", "Chỉ công bố tháng khi đã duyệt tài nguyên và 3 bài liên tiếp tính từ hôm nay.");
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'monthly.framework_published', 'monthly_framework', $4, $5::jsonb, $6)`,
        [randomUUID(), actor.organization_id, actorId, frameworkId, JSON.stringify({ month: row.month, cefr: row.cefr, publishedOn: row.today }), randomUUID()]
      );
      await client.query("commit");
      return { publishedOn: row.today };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      if (pooledClient) (client as PoolClient).release();
    }
  }

  /**
   * "Công bố lại" preview: what moving a published month back to today's system date would do. Same
   * readiness rule as the first publication; read-only, for Operators and Managers.
   */
  async previewMonthRepublication(actorId: string, frameworkId: string): Promise<MonthlyRepublicationPreviewView> {
    const actor = await this.requireOperator(actorId);
    const facts = await republicationFacts(this.database, actor.organization_id, frameworkId, false);
    const learners = await republicationLearners(this.database, actor.organization_id, facts.cefr, facts.today);
    return {
      publishedOn: facts.publishedOn, republishOn: facts.today, needed: facts.publishedOn > facts.today,
      ready: facts.ready, missingDays: facts.missingDays,
      affectedLearners: learners.length, shiftedLearners: learners.filter((learner) => learner.shifted).length
    };
  }

  /**
   * "Công bố lại" (13/11): a month stamped with a later system date (published 13/11, test date moved
   * back to 06/11) is moved to the current system date in one transaction: `published_on`, the level
   * start of learners of this level that lies after it, and lesson-unlock dates of this month after it.
   * `published_at` keeps the real moment of the publication; the audit event records the republication.
   * Idempotent: when the dates already match nothing is written.
   */
  async republishMonth(actorId: string, frameworkId: string, confirmedOn: string): Promise<MonthlyRepublicationResultView> {
    const actor = await this.requireOperator(actorId);
    const pooledClient = "connect" in this.database;
    const client = pooledClient ? await this.database.connect() : this.database;
    try {
      await client.query("begin");
      const facts = await republicationFacts(client, actor.organization_id, frameworkId, true);
      if (facts.publishedOn === facts.today) {
        await client.query("commit");
        return { previousPublishedOn: facts.publishedOn, publishedOn: facts.publishedOn, changed: false, shiftedLearners: 0 };
      }
      if (facts.publishedOn < facts.today) throw httpError(409, "MONTHLY_REPUBLICATION_NOT_NEEDED", "Ngày công bố đã trước ngày hệ thống; học viên đang học bình thường, không cần công bố lại.");
      if (confirmedOn !== facts.today) throw httpError(409, "MONTHLY_PUBLICATION_DATE_CHANGED", "Ngày hệ thống đã đổi. Hãy kiểm tra lại ảnh hưởng trước khi công bố lại.");
      if (!facts.inWindow) throw httpError(409, "MONTHLY_REPUBLICATION_OUTSIDE_WINDOW", "Ngày hệ thống quá xa tháng này; chỉ công bố lại trong tháng hiện tại hoặc tháng trước đó.");
      if (!facts.ready) throw httpError(409, "MONTHLY_REPUBLICATION_INCOMPLETE", republicationIncompleteMessage(facts.missingDays));
      const learners = await republicationLearners(client, actor.organization_id, facts.cefr, facts.today);
      const shifted = learners.filter((learner) => learner.shifted);
      if (shifted.length) {
        await client.query("update enrollments set cefr_started_on = $2::date where id = any($1::uuid[])", [shifted.map((learner) => learner.enrollmentId), facts.today]);
      }
      // An approved lesson unlock of this month dated after the new date would otherwise keep moving the
      // learner's first counted day forward with the system date.
      const unlocks = learners.length ? await client.query<{ id: string }>(
        `update learner_complaints complaint
         set related_data = jsonb_set(coalesce(complaint.related_data, '{}'::jsonb), '{resolvedOn}', to_jsonb($2::text))
         where complaint.learner_id = any($1::uuid[]) and complaint.kind = 'lesson_unlock' and complaint.status = 'approved'
           and complaint.related_data->>'month' = $3
           and coalesce(nullif(complaint.related_data->>'resolvedOn', '')::date, (complaint.resolved_at at time zone 'Asia/Ho_Chi_Minh')::date) > $2::date
         returning complaint.id`,
        [learners.map((learner) => learner.learnerId), facts.today, facts.month]
      ) : { rows: [] };
      await client.query("update month_frameworks set published_on = $2::date, updated_at = now() where id = $1", [frameworkId, facts.today]);
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'monthly.framework_republished', 'monthly_framework', $4, $5::jsonb, $6)`,
        [randomUUID(), actor.organization_id, actorId, frameworkId, JSON.stringify({
          month: facts.month, cefr: facts.cefr, actorRole: actor.role, previousPublishedOn: facts.publishedOn, publishedOn: facts.today,
          studyLearnerCount: learners.length, shiftedLearnerCount: shifted.length, shiftedLearnerIds: shifted.map((learner) => learner.learnerId),
          unlockComplaintIds: unlocks.rows.map((row) => row.id)
        }), randomUUID()]
      );
      await client.query("commit");
      return { previousPublishedOn: facts.publishedOn, publishedOn: facts.today, changed: true, shiftedLearners: shifted.length };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      if (pooledClient) (client as PoolClient).release();
    }
  }

  async getOverview(actorId: string, requestedMonth?: string): Promise<MonthlyOperatorOverviewView> {
    const actor = await this.requireOperator(actorId);
    const systemDateResult = await this.database.query<SystemDateWindowRow>(
      `select organization_system_date($1)::text as system_date,
              to_char((organization_system_date($1) - interval '1 month')::date, 'YYYY-MM') as previous_month,
              to_char(organization_system_date($1), 'YYYY-MM') as current_month,
              to_char((organization_system_date($1) + interval '1 month')::date, 'YYYY-MM') as next_month`,
      [actor.organization_id]
    );
    const systemDate = systemDateResult.rows[0];
    if (!systemDate) throw new Error("Organization system date was not found");
    const month = requestedMonth ?? systemDate.current_month;
    if (month < systemDate.previous_month || month > systemDate.next_month) {
      throw httpError(404, "MONTHLY_CONTENT_OUTSIDE_WINDOW", "Tháng nằm ngoài cửa sổ nội dung ba tháng.");
    }
    const overviewWindow = {
      previous: systemDate.previous_month,
      current: systemDate.current_month,
      next: systemDate.next_month,
      writable: month === systemDate.current_month || month === systemDate.next_month
    };
    const briefResult = await this.database.query<BriefRow>(
      `select id, month, theme_title, theme_brief, theme_context, communication_goal, brief_version, brief_status
       from program_months where organization_id = $1 and month = $2`,
      [actor.organization_id, month]
    );
    const brief = briefResult.rows[0];
    const holidays = await this.database.query<{ date: string }>("select holiday_date::text as date from organization_holidays where organization_id = $1 and to_char(holiday_date, 'YYYY-MM') = $2", [actor.organization_id, month]);
    const calendar = buildMonthlyTeachingCalendar(month, holidays.rows);
    if (!brief) return { systemDate: systemDate.system_date, monthWindow: overviewWindow, calendar, brief: null, frameworks: [] };
    const frameworkResult = await this.database.query<FrameworkRow>(
      `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement,
              ${FROZEN_MONTHLY_ILLUSTRATIONS_SQL} as frozen_illustrations,
              mf.published_on::text, monthly_framework_ready_for_publication(mf.id) as publication_ready
       from month_frameworks mf where mf.program_month_id = $1 and mf.status <> 'retired' order by mf.cefr`,
      [brief.id]
    );
    const reopenRequests = await this.latestFrameworkReopenRequests(frameworkResult.rows.map((framework) => framework.id));
    const frameworks = await Promise.all(frameworkResult.rows.map(async (framework) => {
      const view: MonthFrameworkView = {...toFrameworkHeader(framework), lessons:await this.lessonsForFramework(framework,brief.id),reopenRequest:reopenRequests.get(framework.id) ?? null,
        publication: { ready: Boolean(framework.publication_ready), publishedOn: framework.published_on ?? null } };
      if (view.resources && "daySpecs" in framework.curriculum_contract) for (const day of framework.curriculum_contract.daySpecs.filter(day => day.reviewFromPreviousMonth)) {
        try {
          const scope = await this.getReviewTeachingContract(actorId,framework.id,day.lessonNumber);
          const planned = monthlyResourceRoadmap(scope).days[0];
          if (planned) (view.resources.carryoverReviews ??= []).push({lessonNumber:day.lessonNumber,day:planned,coreTerms:scope.coreTerms,supportTerms:scope.supportTerms,grammarTopics:scope.grammarTopics,sounds:scope.sounds});
        } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "MONTHLY_PREVIOUS_REVIEW_SCOPE_REQUIRED")) throw error; }
      }
      return view;
    }));
    return { systemDate: systemDate.system_date, monthWindow: overviewWindow, calendar, brief: toBriefView(brief), frameworks };
  }

  async recommendedBatch(actorId: string, frameworkId: string): Promise<number[]> {
    const actor = await this.requireOperator(actorId);
    const frameworkResult = await this.database.query<FrameworkRow>(
      `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2 and mf.status <> 'retired'`,
      [frameworkId, actor.organization_id]
    );
    const framework = frameworkResult.rows[0];
    if (!framework) throw new Error("Monthly framework was not found");
    if (!("daySpecs" in framework.curriculum_contract)) return [];
    const lessons = await this.lessonsForFramework(framework);
    return recommendedPendingBatch(framework.curriculum_contract.daySpecs, new Map(lessons.map((lesson) => [lesson.lessonNumber, lesson.status])));
  }

  async getReviewTeachingContract(actorId: string, frameworkId: string, lessonNumber: number): Promise<MonthlyCurriculumContract> {
    const current = await this.getFrameworkContract(actorId,frameworkId);
    const day = current.daySpecs.find(day => day.lessonNumber === lessonNumber);
    if (!day?.reviewFromPreviousMonth) return current;
    const source = await this.database.query<{curriculum_contract:MonthlyCurriculumContract}>(
      "select previous.curriculum_contract from month_frameworks own join program_months current_pm on current_pm.id = own.program_month_id join program_months previous_pm on previous_pm.organization_id = current_pm.organization_id and previous_pm.month = to_char((current_pm.month || '-01')::date - interval '1 month','YYYY-MM') join month_frameworks previous on previous.program_month_id = previous_pm.id and previous.cefr = own.cefr and previous.status = 'approved' where own.id = $1",[frameworkId]);
    if (!source.rows[0]?.curriculum_contract.daySpecs) throw Object.assign(new Error("Previous month review resources are not ready"),{code:"MONTHLY_PREVIOUS_REVIEW_SCOPE_REQUIRED"});
    try { return carryoverReviewContract(current,source.rows[0].curriculum_contract,lessonNumber); }
    catch (cause) { throw Object.assign(new Error("Previous month review scope is incomplete",{cause}),{code:"MONTHLY_PREVIOUS_REVIEW_SCOPE_REQUIRED"}); }
  }

  async getFrameworkContract(actorId: string, frameworkId: string): Promise<MonthlyCurriculumContract> {
    const actor = await this.requireOperator(actorId);
    await this.requireReadableFramework(actor.organization_id, frameworkId);
    const result = await this.database.query<FrameworkRow>(
      `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2 and mf.status <> 'retired'`,
      [frameworkId, actor.organization_id]
    );
    const framework = result.rows[0];
    if (!framework) throw new Error("Monthly framework was not found or has been retired");
    if (!("daySpecs" in framework.curriculum_contract)) throw new Error("Monthly resource pool is still a draft and has no lesson allocation");
    const planErrors = validateMonthlyCurriculum(framework.curriculum_contract);
    if (planErrors.length) throw Object.assign(new Error("MONTHLY_FRAMEWORK_PLAN_INVALID"), { code: "MONTHLY_FRAMEWORK_PLAN_INVALID", issues: planErrors });
    return framework.curriculum_contract;
  }

  private async lessonsForFramework(framework: FrameworkRow, _programMonthId?: string): Promise<MonthFrameworkView["lessons"]> {
    const result = await this.database.query<MonthLessonRow>(
      `select ml.lesson_number, ml.lesson_date::text, ml.status, ml.scope_hash, ml.quality_report, ml.quality_acknowledgement, ml.generation_error,
              (select lv.content from lesson_versions lv where lv.lesson_id = ml.lesson_id order by lv.version desc limit 1) as content,
              (select l.title from lessons l where l.id = ml.lesson_id) as lesson_title,
              (select count(*) from month_lesson_corrections mlc where mlc.month_lesson_id = ml.id)::text as correction_count
       from month_lessons ml where ml.framework_id = $1 order by ml.lesson_number`,
      [framework.id]
    );
    const specs = new Map(("daySpecs" in framework.curriculum_contract ? framework.curriculum_contract.daySpecs : []).map((spec) => [spec.lessonNumber, spec]));
    return result.rows.map((lesson) => ({
      lessonNumber: lesson.lesson_number,
      lessonDate: lesson.lesson_date,
      kind: dayKind(specs.get(lesson.lesson_number)),
      status: lesson.status,
      scopeHash: lesson.scope_hash,
      locked: lesson.status === "approved",
      correctionCount: Number(lesson.correction_count),
      // The saved title lives on lessons.title, not in the version content: without it the editor reopens with the
      // calendar default title and a later save reverts the Operator's title fix.
      ...(lesson.content ? { content: { ...lesson.content, ...(!lesson.content.title && lesson.lesson_title ? { title: lesson.lesson_title } : {}) } } : {}),
      quality: { ...activeQualityReport(lesson.quality_report), ...(lesson.quality_acknowledgement ? { acknowledged: lesson.quality_acknowledgement } : {}) },
      ...(lesson.status !== "approved" && isGenerationFailure(lesson.generation_error) ? { generationFailure: {
        failedAt: lesson.generation_error.failedAt, attempts: lesson.generation_error.attempts,
        report: activeQualityReport({ severe: lesson.generation_error.report.severe, light: lesson.generation_error.report.light }),
        candidate: lesson.generation_error.candidate
      } } : {})
    }));
  }

  /**
   * One bell notification per reopened lesson for the learners of that lesson's level (the old
   * reminder rows went to every learner of the organisation and showed as a list on Home).
   */
  private async notifyLessonReopened(organizationId: string, correctionId: string, monthLessonId: string): Promise<void> {
    await this.database.query(
      `select notify_level_cohort($1, mf.cefr, $2, 'lesson_reopened', pm.month)
       from month_lessons ml
       join month_frameworks mf on mf.id = ml.framework_id
       join program_months pm on pm.id = mf.program_month_id and pm.organization_id = $1
       where ml.id = $3`,
      [organizationId, `lesson-reopen:${correctionId}`, monthLessonId]
    );
  }

  private async requireManager(actorId: string): Promise<ActorRow> {
    const actor = await this.database.query<ActorRow>("select organization_id, role from users where id = $1 and status = 'active'", [actorId]);
    const row = actor.rows[0];
    if (!row || row.role !== "manager") throw new Error("Monthly reopen decisions require an active Manager");
    return row;
  }
  /**
   * Core words, theme and lock state needed to generate or edit illustrations (Operators only).
   * `locked` = the framework is no longer a draft. An approved framework still accepts pictures
   * for the words that have none (see saveFrameworkIllustration); a retired one accepts nothing.
   */
  async frameworkIllustrationContext(actorId: string, frameworkId: string): Promise<MonthlyIllustrationContext> {
    const actor = await this.requireContentOperator(actorId);
    const result = await this.database.query<FrameworkRow & { month: string }>(
      `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement, pm.month
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2`, [frameworkId, actor.organization_id]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Monthly framework was not found");
    const contract = row.curriculum_contract;
    return {
      frameworkId, month: row.month, cefr: row.cefr, locked: row.status !== "draft", status: row.status,
      theme: { title: contract.theme.title, context: contract.theme.context },
      coreTerms: contract.coreTerms.map((term) => ({ id: term.id, word: term.word, meaning: term.meaning, type: term.type }))
    };
  }

  /** One row per core word in plan order; words without a row are reported as missing. */
  async listFrameworkIllustrations(actorId: string, frameworkId: string): Promise<MonthlyIllustrationView[]> {
    const actor = await this.requireOperator(actorId);
    await this.requireReadableFramework(actor.organization_id, frameworkId);
    const result = await this.database.query<FrameworkRow>(
      `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2`, [frameworkId, actor.organization_id]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Monthly framework was not found");
    const images = await this.database.query<{ word: string; status: "pending" | "generating" | "ready" | "failed"; source: "ai" | "upload"; artifact_key: string | null; error: string | null; updated_at: Date }>(
      "select word, status, source, artifact_key, error, updated_at from month_framework_images where framework_id = $1", [frameworkId]
    );
    const byWord = new Map(images.rows.map((image) => [image.word, image]));
    const coreTerms = row.curriculum_contract.coreTerms as Array<{ id: string; word: string; meaning: string; imageUrl?: string }>;
    return coreTerms.map((term) => {
      const image = byWord.get(normalizeIllustrationWord(term.word));
      // Approved contracts carry the frozen URL even if the working row changed.
      // A draft (also one reopened by a Manager) is edited through its working rows, so a
      // stale frozen URL left in the pool must not hide an upload, a redraw or a removal.
      const working = image?.status === "ready" && image.artifact_key ? monthlyIllustrationUrl(image.artifact_key) : undefined;
      const url = row.status === "draft" ? working : term.imageUrl ?? working;
      return {
        coreTermId: term.id, word: term.word, meaning: term.meaning,
        status: url ? "ready" as const : image?.status ?? "missing" as const,
        ...(image?.source ? { source: image.source } : {}),
        ...(url ? { url } : {}),
        ...(image?.error && !url ? { error: image.error } : {}),
        ...(image && !url ? { updatedAt: image.updated_at.toISOString() } : {}),
        frameworkLocked: row.status !== "draft",
        // Approval locks only the words that already have a picture; the others stay fillable.
        locked: row.status !== "draft" && (row.status !== "approved" || Boolean(url))
      };
    });
  }

  /**
   * Status writes for the illustration job and manual uploads. A draft accepts every write.
   * An approved framework accepts writes only for a word without a picture: no URL frozen in
   * its contract and no ready working row (a ready picture is locked with the resources).
   * Retired frameworks accept nothing. Returns false when the write was refused.
   */
  async saveFrameworkIllustration(input: { frameworkId: string; word: string; status: "pending" | "generating" | "ready" | "failed"; source?: "ai" | "upload"; artifactKey?: string | null; mimeType?: string | null; hint?: string | null; error?: string | null; actorId?: string }): Promise<boolean> {
    const result = await this.database.query(
      `insert into month_framework_images (framework_id, word, status, source, artifact_key, mime_type, prompt_hint, error, updated_by, updated_at)
       select $1, $2, $3, $4, $5, $6, $7, $8, $9, now()
       where exists (
         select 1 from month_frameworks mf
         where mf.id = $1 and (mf.status = 'draft' or (mf.status = 'approved' and not exists (
           select 1 from jsonb_array_elements(coalesce(mf.curriculum_contract->'coreTerms', '[]'::jsonb)) as core(item)
           where lower(btrim(core.item->>'word')) = $2 and coalesce(core.item->>'imageUrl', '') <> ''
         )))
       )
       on conflict (framework_id, word) do update set status = excluded.status, source = excluded.source,
         artifact_key = case when excluded.status = 'ready' then excluded.artifact_key else month_framework_images.artifact_key end,
         mime_type = case when excluded.status = 'ready' then excluded.mime_type else month_framework_images.mime_type end,
         prompt_hint = coalesce(excluded.prompt_hint, month_framework_images.prompt_hint),
         error = excluded.error, updated_by = coalesce(excluded.updated_by, month_framework_images.updated_by), updated_at = now()
       where month_framework_images.status <> 'ready'
          or exists (select 1 from month_frameworks draft where draft.id = excluded.framework_id and draft.status = 'draft')`,
      [input.frameworkId, normalizeIllustrationWord(input.word), input.status, input.source ?? "ai", input.artifactKey ?? null, input.mimeType ?? null, input.hint ?? null, input.error ?? null, input.actorId ?? null]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Removes one word's working picture (manual edit, draft only); approval then freezes the word without an image. */
  async removeFrameworkIllustration(input: { frameworkId: string; word: string }): Promise<boolean> {
    const result = await this.database.query(
      `delete from month_framework_images
       where framework_id = $1 and word = $2
         and exists (select 1 from month_frameworks where id = $1 and status = 'draft')`,
      [input.frameworkId, normalizeIllustrationWord(input.word)]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async requireOperator(actorId: string): Promise<ActorRow> {
    const actor = await this.database.query<ActorRow>(
      "select organization_id, role from users where id = $1 and status = 'active'",
      [actorId]
    );
    const row = actor.rows[0];
    if (!row || (row.role !== "operator" && row.role !== "manager")) throw new Error("Monthly content requires an active Operator or Manager");
    return row;
  }

  private async requireContentOperator(actorId: string): Promise<ActorRow> {
    const actor = await this.requireOperator(actorId);
    if (actor.role !== "operator") throw new Error("Monthly content requires an active Operator");
    return actor;
  }

  private async isWritableMonth(organizationId: string, month: string): Promise<boolean> {
    const result = await this.database.query<{ writable: boolean }>(
      `select ($2 = to_char(organization_system_date($1), 'YYYY-MM')
               or $2 = to_char((organization_system_date($1) + interval '1 month')::date, 'YYYY-MM')) as writable`,
      [organizationId, month]
    );
    return Boolean(result.rows[0]?.writable);
  }

  private async requireWritableMonth(organizationId: string, month: string): Promise<void> {
    const result = await this.database.query<{ writable: boolean }>(
      `select ($2 = to_char(organization_system_date($1), 'YYYY-MM')
               or $2 = to_char((organization_system_date($1) + interval '1 month')::date, 'YYYY-MM')) as writable`,
      [organizationId, month]
    );
    if (!result.rows[0]?.writable) throw new Error("Monthly content is read-only outside the current and next month");
  }

  private async requireReadableFramework(organizationId: string, frameworkId: string): Promise<void> {
    const result = await this.database.query(
      `select 1 from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2 and mf.status <> 'retired'
         and pm.month between to_char(organization_system_date(pm.organization_id) - interval '1 month', 'YYYY-MM')
                          and to_char(organization_system_date(pm.organization_id) + interval '1 month', 'YYYY-MM')`,
      [frameworkId, organizationId]
    );
    if (!result.rowCount) throw httpError(404, "MONTHLY_FRAMEWORK_NOT_FOUND", "Không tìm thấy khung trong cửa sổ nội dung ba tháng.");
  }

  private async monthForFramework(frameworkId: string, organizationId: string): Promise<string | null> {
    const result = await this.database.query<{ month: string }>(
      `select pm.month from month_frameworks mf
       join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2`,
      [frameworkId, organizationId]
    );
    return result.rows[0]?.month ?? null;
  }

  private async audit(actor: ActorRow, action: string, entityId: string, payload: Record<string, unknown>): Promise<void> {
    await this.database.query(
      `insert into audit_events (id, organization_id, action, entity_type, entity_id, payload, trace_id)
       values ($1, $2, $3, 'monthly_framework', $4, $5::jsonb, $6)`,
      [randomUUID(), actor.organization_id, action, entityId, JSON.stringify(payload), randomUUID()]
    );
  }
}

function reopenStatus(status: FrameworkReopenRequestRow["status"]): "pending" | "approved" | "rejected" {
  return status === "requested" ? "pending" : status === "authorized" ? "approved" : "rejected";
}

function toFrameworkReopenView(row: FrameworkReopenRequestRow): MonthFrameworkReopenRequestView {
  return {
    id: row.id, frameworkVersion: row.framework_version, reason: row.reason, status: reopenStatus(row.status),
    decisionReason: row.decision_reason, createdAt: row.created_at.toISOString(), decidedAt: row.decided_at?.toISOString() ?? null
  };
}

function toFrameworkReopenRequestView(row: FrameworkReopenListRow): ReopenRequestView {
  return {
    id: row.id, target: "monthly_resources", targetId: row.framework_id, requestedBy: row.requested_by, reason: row.reason,
    status: reopenStatus(row.status), decisionReason: row.decision_reason,
    createdAt: row.created_at.toISOString(), decidedAt: row.decided_at?.toISOString() ?? null,
    archivedAt: row.archived_at?.toISOString() ?? null,
    monthlyResources: {
      frameworkId: row.framework_id, month: row.month, cefr: row.cefr, frameworkVersion: row.framework_version,
      lessonCount: Number(row.lesson_count), lessonsWithContent: Number(row.lessons_with_content),
      removedLessonCount: row.removed_lesson_count
    }
  };
}

/**
 * Turns a stored contract (allocated plan or pool) back into an unallocated
 * resource pool. Every resource is kept; only the lesson allocation (DaySpecs
 * and per-term day numbers) is dropped so the next approval re-plans it.
 */
export function toMonthlyResourcePool(contract: MonthlyCurriculumContract | MonthlyResourcePoolContract, version: number): MonthlyResourcePoolContract {
  const coreTerms = (contract.coreTerms as Array<MonthlyResourcePoolCoreTerm & { dayNumber?: number }>).map(({ dayNumber: _dayNumber, ...term }) => term);
  const supportTerms = (contract.supportTerms as Array<MonthlyResourcePoolSupportTerm & { dayNumber?: number }>).map(({ dayNumber: _dayNumber, ...term }) => term);
  return {
    month: contract.month, cefr: contract.cefr, theme: contract.theme, version,
    coreTerms, supportTerms, grammarTopics: contract.grammarTopics, sounds: contract.sounds
  };
}

function sameBrief(brief: BriefRow, contract: Pick<MonthlyCurriculumContract, "theme"> | Pick<MonthlyResourcePoolContract, "theme">): boolean {
  return brief.brief_version === contract.theme.version
    && brief.theme_title === contract.theme.title
    && brief.theme_brief === contract.theme.brief
    && brief.theme_context === contract.theme.context
    && brief.communication_goal === contract.theme.communicationGoal;
}

function toBriefView(row: BriefRow): SharedMonthBriefView {
  return { month: row.month, title: row.theme_title, brief: row.theme_brief, context: row.theme_context, communicationGoal: row.communication_goal, version: row.brief_version, status: row.brief_status };
}

function toFrameworkHeader(row: FrameworkRow): Omit<MonthFrameworkView, "lessons"> {
  const quality = row.quality_acknowledgement
    ? { severe: [], light: [], acknowledged: row.quality_acknowledgement }
    : { severe: [], light: [] };
  return {
    id: row.id,
    cefr: row.cefr,
    version: row.version,
    // Every caller filters retired frameworks before producing a public view.
    // `retired` exists only in persistence so frozen history can be retained.
    status: row.status as MonthFrameworkView["status"],
    scopeHash: row.scope_hash,
    resources: {
      coreTerms: withFrozenMonthlyIllustrations(row.curriculum_contract.coreTerms, row.frozen_illustrations),
      supportTerms: row.curriculum_contract.supportTerms,
      grammarTopics: row.curriculum_contract.grammarTopics,
      sounds: row.curriculum_contract.sounds,
      roadmap: monthlyResourceRoadmap(row.curriculum_contract)
    },
    quality
  };
}

function monthlyResourceRoadmap(contract: MonthlyCurriculumContract | MonthlyResourcePoolContract): NonNullable<NonNullable<MonthFrameworkView["resources"]>["roadmap"]> {
  if (!("daySpecs" in contract)) return { allocated: false, grammarSteps: [], sounds: [], days: [] };
  const grammarStepIds = contract.grammarTopics.flatMap((topic) => topic.steps.map((step) => step.id));
  return {
    allocated: true,
    grammarSteps: grammarStepIds.map((stepId) => ({
      stepId,
      lessonNumbers: contract.daySpecs.filter((day) => day.kind === "new" && (day.grammarStepIds ?? [day.grammarStepId]).includes(stepId)).map((day) => day.newLessonNumber ?? (monthlyNewLessonOrdinal(day.lessonNumber, buildMonthlyCalendar(contract.month)) ?? day.lessonNumber))
    })),
    sounds: contract.sounds.map((sound) => ({
      soundId: sound.id,
      lessonNumbers: contract.daySpecs.filter((day) => day.kind === "new" && (day.pronunciationPlan?.targetIds.includes(sound.id) ?? day.soundId === sound.id)).map((day) => day.newLessonNumber ?? (monthlyNewLessonOrdinal(day.lessonNumber, buildMonthlyCalendar(contract.month)) ?? day.lessonNumber)),
      slots: contract.daySpecs.filter((day) => day.soundId === sound.id).flatMap((day) => day.pronunciationSlot ? [day.pronunciationSlot] : [])
    })),
    days: contract.daySpecs.map((day) => ({
      lessonNumber: day.lessonNumber, ...(day.newLessonNumber ? { newLessonNumber: day.newLessonNumber } : {}), ...(day.reviewWeekNumber ? { reviewWeekNumber: day.reviewWeekNumber } : {}), ...(day.grammarPlan ? { grammarPlan: day.grammarPlan } : {}), ...(day.pronunciationPlan ? { pronunciationPlan: day.pronunciationPlan } : {}),
      date: day.date,
      kind: day.kind,
      coreTermIds: day.coreTermIds,
      expandedTermIds: day.expandedTermIds,
      reviewTermIds: day.reviewTermIds,
      reviewExpandedTermIds: day.reviewExpandedTermIds,
      reviewWeekKey: day.reviewWeekKey ?? null,
      reviewFromPreviousMonth: day.reviewFromPreviousMonth ?? false,
      reviewGatesNextWeek: day.reviewGatesNextWeek ?? false,
      reviewPrerequisiteLessonNumbers: day.reviewPrerequisiteLessonNumbers ?? [],
      reviewGrammarStepIds: day.reviewGrammarStepIds ?? [],
      reviewSoundIds: day.reviewSoundIds ?? [],
      reviewPronunciationExampleIds: day.reviewPronunciationExampleIds ?? [],
      skillExercises: day.skillExercises,
      grammarStepIds: day.grammarStepIds ?? [day.grammarStepId],
      soundId: day.soundId,
      ...(day.pronunciationSlot ? { pronunciationSlot: day.pronunciationSlot } : {}),
      pronunciationExampleIds: day.pronunciationExampleIds
    }))
  };
}
function dayKind(spec: MonthlyDaySpec | undefined): "new" | "review" {
  if (!spec) throw new Error("Stored monthly lesson has no curriculum day specification");
  return spec.kind;
}

/**
 * An acknowledgement names every counted light finding and nothing else; advisory
 * findings (monthlyGatedLightFindings) may be named but are not required.
 */
function acknowledgementCoversLightFindings(light: readonly MonthlyQualityFindingView[], findingKeys: readonly string[]): boolean {
  const allowed = new Set(light.map(qualityFindingKey));
  return monthlyGatedLightFindings(light).map(qualityFindingKey).every((key) => findingKeys.includes(key)) && findingKeys.every((key) => allowed.has(key));
}

function qualityFindingKey(finding: MonthlyQualityFindingView): string {
  return `${finding.code}:${finding.dayNumber ?? 0}:${finding.component ?? ""}`;
}

export interface MonthlyDayApprovalOptions {
  /** 13/11 "Vẫn duyệt": approve although severe findings remain (Operator only, recorded). */
  acknowledgeSevereFindings?: boolean;
  /** Structural problems of the stored draft parts that would break the learner lesson; never overridable. */
  integrityIssues?: (parts: ReadonlyArray<{ code: string; content: unknown }>) => string[];
}

export type MonthlyDayApprovalDecision =
  | { ok: true; override: { severeCodes: string[]; findingKeys: string[] } | null }
  | { ok: false; status: 404 | 409; code: string; message: string };

/**
 * Whether a saved day draft may be approved. Without the override the gate is
 * unchanged: a draft with no severe finding, at most two light ones, each
 * acknowledged. With `acknowledgeSevereFindings` and severe findings present,
 * the saved draft (status draft, or failed because of those findings) is
 * approved with every remaining finding accepted at once.
 */
export function monthlyDayApprovalDecision(
  day: { lesson_id: string | null; status: MonthLessonRow["status"]; quality_report: MonthLessonRow["quality_report"]; quality_acknowledgement: OperatorAcknowledgementView | null } | null,
  acknowledgeSevereFindings: boolean
): MonthlyDayApprovalDecision {
  if (!day || !day.lesson_id) return { ok: false, status: 404, code: "MONTHLY_DAY_DRAFT_NOT_FOUND", message: "Không tìm thấy bản nháp bài học." };
  const severe = day.quality_report?.severe ?? [];
  const allLight = day.quality_report?.light ?? [];
  // Advisory light findings (grammar formula vs examples) are shown but neither counted nor required to be acknowledged.
  const light = monthlyGatedLightFindings(allLight);
  if (acknowledgeSevereFindings && severe.length && (day.status === "draft" || day.status === "failed")) {
    return { ok: true, override: { severeCodes: [...new Set(severe.map((finding) => finding.code))], findingKeys: [...severe, ...allLight].map(qualityFindingKey) } };
  }
  if (day.status !== "draft" || severe.length) return { ok: false, status: 409, code: "MONTHLY_DAY_QUALITY_BLOCKED", message: "Bài chưa thể duyệt. Hãy mở bản nháp và sửa các mục chất lượng trước khi duyệt lại." };
  if (light.length > 2) return { ok: false, status: 409, code: "MONTHLY_DAY_QUALITY_BLOCKED", message: "Bài có quá hai cảnh báo. Hãy sửa bớt cảnh báo trước khi duyệt bài." };
  const acknowledged = new Set(day.quality_acknowledgement?.findingCodes ?? []);
  if (light.map(qualityFindingKey).some((key) => !acknowledged.has(key))) return { ok: false, status: 409, code: "MONTHLY_DAY_QUALITY_ACK_REQUIRED", message: "Hãy kiểm tra và xác nhận từng cảnh báo trước khi duyệt." };
  return { ok: true, override: null };
}

export interface MonthlyIllustrationContext {
  frameworkId: string;
  month: string;
  cefr: string;
  locked: boolean;
  /** Framework status; optional for callers that build a context by hand. */
  status?: string;
  theme: { title: string; context: string };
  coreTerms: Array<{ id: string; word: string; meaning: string; type: string }>;
}

export interface MonthlyIllustrationView {
  coreTermId: string;
  word: string;
  meaning: string;
  status: "missing" | "pending" | "generating" | "ready" | "failed";
  source?: "ai" | "upload";
  url?: string;
  error?: string;
  /** Last status write of a word without a picture (lets the API spot rows left pending by a dead job). */
  updatedAt?: string;
  /** True when this word's picture can no longer change (approved with a picture, or retired). */
  locked: boolean;
  /** The resources are approved (or retired): existing pictures are frozen. */
  frameworkLocked?: boolean;
}

export function normalizeIllustrationWord(word: string): string {
  return word.trim().toLocaleLowerCase("en-US");
}

export function monthlyIllustrationUrl(artifactKey: string): string {
  return `/api/v1/files/content-media/read?artifactKey=${encodeURIComponent(artifactKey)}`;
}
