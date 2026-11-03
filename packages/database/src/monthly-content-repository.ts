import { randomUUID } from "node:crypto";
import {
  buildMonthlyCalendar,
  monthlyScopeHash,
  monthlyResourcePoolHash,
  recommendedPendingBatch,
  planMonthlyResourcePool,
  validateMonthlyCurriculum,
  type MonthlyResourcePoolContract,
  type MonthlyCurriculumContract,
  type MonthlyDaySpec
} from "@e4s/domain";
import type {
  MonthlyOperatorOverviewView,
  MonthFrameworkView,
  SharedMonthBriefView,
  MonthlyQualityFindingView,
  OperatorAcknowledgementView
} from "@e4s/contracts";
import type { Client, Pool } from "pg";

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
}

interface SystemDateWindowRow {
  system_date: string;
  previous_month: string;
  current_month: string;
  next_month: string;
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

  async saveResourceDraft(actorId: string, pool: MonthlyResourcePoolContract): Promise<Pick<MonthFrameworkView, "id" | "cefr" | "version" | "status" | "scopeHash">> {
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
    const existingResult = await client.query<FrameworkRow>(
      `select id, cefr, version, status, scope_hash, curriculum_contract, quality_acknowledgement
       from month_frameworks where program_month_id = $1 and cefr = $2 and status <> 'retired'`, [month.id, pool.cefr]
    );
    const existing = existingResult.rows[0];
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
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, 'ai')`,
        [frameworkId, month.id, pool.cefr, version, JSON.stringify(versionedPool), scopeHash, actorId]
      );
    }
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
        contract = planMonthlyResourcePool(row.curriculum_contract);
        const scopeHash = monthlyScopeHash(contract);
        await client.query("update month_frameworks set curriculum_contract = $2::jsonb, scope_hash = $3, updated_at = now() where id = $1",
          [frameworkId, JSON.stringify(contract), scopeHash]);
        for (const day of contract.daySpecs) {
          await client.query("insert into month_lessons (id, framework_id, lesson_number, lesson_date, scope_hash) values ($1, $2, $3, $4::date, $5)",
            [randomUUID(), frameworkId, day.lessonNumber, day.date, scopeHash]);
        }
      }
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
    await this.notifyAffectedLearners(
      manager.organization_id,
      "daily_lesson",
      "Tài nguyên tháng đã được rút khỏi phát hành để kiểm tra. Bài mới sẽ được thông báo khi phát hành lại."
    );
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
    if (report.contractVersion !== row.version) throw new Error("Monthly quality report uses a stale contract version");
    const cell = await this.database.query<{ id: string; status: string }>(
      "select id, status from month_lessons where framework_id = $1 and lesson_number = $2",
      [frameworkId, dayNumber]
    );
    const monthLesson = cell.rows[0];
    if (!monthLesson) throw new Error("Monthly DaySpec was not materialized");
    if (monthLesson.status === "approved") throw new Error("Approved monthly day is immutable; request a Manager reopen first");

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
    if (day.quality_report.severe.length) throw new Error("Severe monthly quality findings block acknowledgement");
    const expected = day.quality_report.light.map(qualityFindingKey);
    if (expected.length > 0 && (expected.length !== findingKeys.length || expected.some((key) => !findingKeys.includes(key)))) {
      throw new Error("Operator must acknowledge every light finding individually");
    }
    const count = await this.database.query<{ light_count: string }>(
      `select coalesce(sum(jsonb_array_length(ml.quality_report->'light')), 0)::text as light_count
       from month_lessons ml where ml.framework_id = $1`,
      [frameworkId]
    );
    const currentDayLightCount = day.quality_report.light.length;
    const totalLightCount = Number(count.rows[0]?.light_count ?? 0);
    if (totalLightCount > 2) throw new Error("Monthly framework exceeds the two-light-finding limit");
    const acknowledgement: OperatorAcknowledgementView = { actorId, acknowledgedAt: new Date().toISOString(), findingCodes: findingKeys };
    await this.database.query("update month_lessons set quality_acknowledgement = $2::jsonb where id = $1", [day.id, JSON.stringify(acknowledgement)]);
    await this.audit(actor, "monthly.day_quality_acknowledged", day.id, { frameworkId, dayNumber, findingKeys, currentDayLightCount });
  }

  async approveMonthlyDay(actorId: string, frameworkId: string, dayNumber: number): Promise<void> {
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
    if (!day || !day.lesson_id) throw new Error("Monthly day draft was not found");
    if (day.status !== "draft" || day.quality_report.severe.length) throw new Error("Severe findings or failed quality block monthly day approval");
    const count = await this.database.query<{ light_count: string }>(
      `select coalesce(sum(jsonb_array_length(ml.quality_report->'light')), 0)::text as light_count
       from month_lessons ml where ml.framework_id = $1`,
      [frameworkId]
    );
    if (Number(count.rows[0]?.light_count ?? 0) > 2) throw new Error("Monthly framework exceeds the two-light-finding limit");
    const expectedKeys = day.quality_report.light.map(qualityFindingKey);
    const acknowledged = new Set(day.quality_acknowledgement?.findingCodes ?? []);
    if (expectedKeys.some((key) => !acknowledged.has(key))) throw new Error("Operator must acknowledge every light finding before approval");
    await this.database.query("update lesson_versions set status = 'published' where lesson_id in (select id from lessons where id = $1) and status = 'draft'", [day.lesson_id]);
    await this.database.query("update lesson_set_versions set status = 'published', published_at = now() where id = (select lesson_set_version_id from lessons where id = $1)", [day.lesson_id]);
    await this.database.query(
      "update month_lessons set status = 'approved', approved_by = $2, approved_at = now(), updated_at = now() where id = $1",
      [day.id, actorId]
    );
    await this.audit(actor, "monthly.day_approved", day.id, { frameworkId, dayNumber, scopeHash: day.scope_hash });
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
    const result = await this.database.query<{ correction_id: string; month_lesson_id: string; day_number: number; framework_id: string; cefr: MonthFrameworkView["cefr"]; month: string; status: string; version: number }>(
      `select mlc.id as correction_id, ml.id as month_lesson_id, ml.lesson_number as day_number, mf.id as framework_id,
              mf.cefr, pm.month, mlc.status, mf.version
       from month_lesson_corrections mlc join month_lessons ml on ml.id = mlc.month_lesson_id
       join month_frameworks mf on mf.id = ml.framework_id join program_months pm on pm.id = mf.program_month_id
       where mlc.id = $1 and pm.organization_id = $2`,
      [correctionId, actor.organization_id]
    );
    const row = result.rows[0];
    if (!row || row.status !== "authorized") throw new Error("Authorized monthly correction was not found");
    if (report.contractVersion !== row.version) throw new Error("Monthly correction quality report uses a stale contract version");
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
    if (correction.quality_report.severe.length) throw new Error("Severe monthly correction findings block acknowledgement");
    const expected = correction.quality_report.light.map(qualityFindingKey);
    if (expected.length !== findingKeys.length || expected.some((key) => !findingKeys.includes(key))) throw new Error("Operator must acknowledge every correction finding individually");
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
    if (correction.quality_report.severe.length) throw new Error("Severe monthly correction findings block approval");
    const acknowledged = new Set(correction.quality_acknowledgement?.findingCodes ?? []);
    if (correction.quality_report.light.map(qualityFindingKey).some((key) => !acknowledged.has(key))) throw new Error("Operator must acknowledge every correction finding before approval");
    const lesson = await this.database.query<{ lesson_id: string }>("select lesson_id from lesson_versions where id = $1", [correction.correction_lesson_version_id]);
    const lessonId = lesson.rows[0]?.lesson_id;
    if (!lessonId) throw new Error("Monthly correction content version was not found");
    await this.database.query("update lesson_versions set status = 'published' where id = $1 and status = 'draft'", [correction.correction_lesson_version_id]);
    await this.database.query("update lesson_set_versions set status = 'published', published_at = now() where id = (select l.lesson_set_version_id from lesson_versions lv join lessons l on l.id = lv.lesson_id where lv.id = $1)", [correction.correction_lesson_version_id]);
    await this.database.query("update month_lesson_corrections set status = 'published', published_at = now() where id = $1", [correctionId]);
    await this.database.query("update month_lessons set lesson_id = $2, updated_at = now() where id = $1", [correction.month_lesson_id, lessonId]);
    await this.audit(actor, "monthly.correction_published", correctionId, { monthLessonId: correction.month_lesson_id, lessonId });
    await this.notifyAffectedLearners(actor.organization_id, correction.target, "Nội dung bài học đã được cập nhật. Kết quả đã hoàn thành của bạn vẫn được giữ nguyên.");
  }

  async listReopenRequests(managerId: string): Promise<Array<{
    id: string; target: "daily_lesson" | "weekly_review"; targetId: string; requestedBy: string; reason: string;
    status: "pending" | "approved" | "rejected"; decisionReason: string | null; createdAt: string; decidedAt: string | null;
  }>> {
    const manager = await this.requireManager(managerId);
    const result = await this.database.query<ReopenRequestRow>(
      `select mlc.id,
              case when (mf.curriculum_contract->'daySpecs' @> jsonb_build_array(jsonb_build_object('lessonNumber', ml.lesson_number, 'kind', 'review'))) then 'weekly_review' else 'daily_lesson' end as target,
              ml.id as target_id, mlc.requested_by, mlc.reason, mlc.status, mlc.decision_reason, mlc.created_at, mlc.decided_at
       from month_lesson_corrections mlc
       join month_lessons ml on ml.id = mlc.month_lesson_id
       join month_frameworks mf on mf.id = ml.framework_id
       join program_months pm on pm.id = mf.program_month_id
       where pm.organization_id = $1 and mlc.status in ('requested', 'authorized', 'rejected')
       order by mlc.created_at desc`, [manager.organization_id]
    );
    return result.rows.map((row) => ({
      id: row.id, target: row.target, targetId: row.target_id, requestedBy: row.requested_by, reason: row.reason,
      status: row.status === "requested" ? "pending" : row.status === "authorized" ? "approved" : "rejected",
      decisionReason: row.decision_reason, createdAt: row.created_at.toISOString(), decidedAt: row.decided_at?.toISOString() ?? null
    }));
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
    if (!row) throw new Error("Pending reopen request was not found");
    await this.audit(manager, `monthly.reopen_${decision}`, correctionId, { target: row.target, targetId: row.target_id, reason: reason.trim() });
    if (decision === "approved") {
      await this.notifyAffectedLearners(manager.organization_id, row.target, "Nội dung bài học đã được mở lại để cập nhật. Kết quả đã hoàn thành của bạn vẫn được giữ nguyên.");
    }
    return { id: row.id, target: row.target, targetId: row.target_id, requestedBy: row.requested_by, reason: row.reason,
      status: decision, decisionReason: row.decision_reason ?? reason.trim(), createdAt: row.created_at.toISOString(), decidedAt: row.decided_at!.toISOString() };
  }
  async getOverview(actorId: string, month: string): Promise<MonthlyOperatorOverviewView> {
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
    if (!brief) return { systemDate: systemDate.system_date, monthWindow: overviewWindow, brief: null, frameworks: [] };
    const frameworkResult = await this.database.query<FrameworkRow>(
      `select id, cefr, version, status, scope_hash, curriculum_contract, quality_acknowledgement
       from month_frameworks where program_month_id = $1 and status <> 'retired' order by cefr`,
      [brief.id]
    );
    const frameworks = await Promise.all(frameworkResult.rows.map(async (framework) => ({
      ...toFrameworkHeader(framework),
      lessons: await this.lessonsForFramework(framework, brief.id)
    })));
    return { systemDate: systemDate.system_date, monthWindow: overviewWindow, brief: toBriefView(brief), frameworks };
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

  async getFrameworkContract(actorId: string, frameworkId: string): Promise<MonthlyCurriculumContract> {
    const actor = await this.requireOperator(actorId);
    const result = await this.database.query<FrameworkRow>(
      `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2 and mf.status <> 'retired'`,
      [frameworkId, actor.organization_id]
    );
    const framework = result.rows[0];
    if (!framework) throw new Error("Monthly framework was not found or has been retired");
    if (!("daySpecs" in framework.curriculum_contract)) throw new Error("Monthly resource pool is still a draft and has no lesson allocation");
    return framework.curriculum_contract;
  }

  private async lessonsForFramework(framework: FrameworkRow, _programMonthId?: string): Promise<MonthFrameworkView["lessons"]> {
    const result = await this.database.query<MonthLessonRow>(
      `select ml.lesson_number, ml.lesson_date::text, ml.status, ml.scope_hash, ml.quality_report, ml.quality_acknowledgement,
              (select lv.content from lesson_versions lv where lv.lesson_id = ml.lesson_id order by lv.version desc limit 1) as content,
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
      ...(lesson.content ? { content: lesson.content } : {}),
      quality: { ...lesson.quality_report, ...(lesson.quality_acknowledgement ? { acknowledged: lesson.quality_acknowledgement } : {}) }
    }));
  }

  private async notifyAffectedLearners(organizationId: string, target: "daily_lesson" | "weekly_review", message: string): Promise<void> {
    const learners = await this.database.query<{ id: string }>("select id from users where organization_id = $1 and role = 'learner' and status = 'active'", [organizationId]);
    for (const learner of learners.rows) {
      await this.database.query(
        `insert into reminders (id, learner_id, reason, message, status)
         values ($1, $2, $3, $4, 'sent')`,
        [randomUUID(), learner.id, target === "weekly_review" ? "weekly_review_reopened" : "daily_lesson_reopened", message]
      );
    }
  }

  private async requireManager(actorId: string): Promise<ActorRow> {
    const actor = await this.database.query<ActorRow>("select organization_id, role from users where id = $1 and status = 'active'", [actorId]);
    const row = actor.rows[0];
    if (!row || row.role !== "manager") throw new Error("Monthly reopen decisions require an active Manager");
    return row;
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

  private async requireWritableMonth(organizationId: string, month: string): Promise<void> {
    const result = await this.database.query<{ writable: boolean }>(
      `select ($2 = to_char(organization_system_date($1), 'YYYY-MM')
               or $2 = to_char((organization_system_date($1) + interval '1 month')::date, 'YYYY-MM')) as writable`,
      [organizationId, month]
    );
    if (!result.rows[0]?.writable) throw new Error("Monthly content is read-only outside the current and next month");
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
      coreTerms: row.curriculum_contract.coreTerms,
      supportTerms: row.curriculum_contract.supportTerms,
      grammarTopics: row.curriculum_contract.grammarTopics,
      sounds: row.curriculum_contract.sounds,
      roadmap: monthlyResourceRoadmap(row.curriculum_contract)
    },
    quality
  };
}

function monthlyResourceRoadmap(contract: MonthlyCurriculumContract | MonthlyResourcePoolContract): NonNullable<NonNullable<MonthFrameworkView["resources"]>["roadmap"]> {
  if (!("daySpecs" in contract)) return { allocated: false, grammarSteps: [], sounds: [] };
  const grammarStepIds = contract.grammarTopics.flatMap((topic) => topic.steps.map((step) => step.id));
  return {
    allocated: true,
    grammarSteps: grammarStepIds.map((stepId) => ({
      stepId,
      lessonNumbers: contract.daySpecs.filter((day) => (day.grammarStepIds ?? [day.grammarStepId]).includes(stepId)).map((day) => day.lessonNumber)
    })),
    sounds: contract.sounds.map((sound) => ({
      soundId: sound.id,
      lessonNumbers: contract.daySpecs.filter((day) => day.soundId === sound.id).map((day) => day.lessonNumber),
      slots: contract.daySpecs.filter((day) => day.soundId === sound.id).flatMap((day) => day.pronunciationSlot ? [day.pronunciationSlot] : [])
    }))
  };
}
function dayKind(spec: MonthlyDaySpec | undefined): "new" | "review" {
  if (!spec) throw new Error("Stored monthly lesson has no curriculum day specification");
  return spec.kind;
}

function qualityFindingKey(finding: MonthlyQualityFindingView): string {
  return `${finding.code}:${finding.dayNumber ?? 0}:${finding.component ?? ""}`;
}
