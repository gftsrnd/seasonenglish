import { randomUUID } from "node:crypto";
import {
  buildMonthlyCalendar,
  monthlyScopeHash,
  recommendedPendingBatch,
  validateMonthlyCurriculum,
  type MonthlyCurriculumContract,
  type MonthlyDaySpec
} from "@e4s/domain";
import type {
  MonthlyOperatorOverviewView,
  MonthFrameworkView,
  SharedMonthBriefView
} from "@e4s/contracts";
import type { Client, Pool } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<Client, "query">;

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
  status: MonthFrameworkView["status"];
  scope_hash: string;
  curriculum_contract: MonthlyCurriculumContract;
  quality_acknowledgement: MonthFrameworkView["quality"]["acknowledged"] | null;
}
interface MonthLessonRow {
  lesson_number: number;
  lesson_date: string;
  status: "pending" | "generating" | "draft" | "approved" | "failed";
  scope_hash: string;
  correction_count: string;
}

/**
 * Persistence boundary for the monthly flow. Weekly repositories intentionally do
 * not own this data: a monthly framework is a locked curriculum contract, not a
 * collection of independently generated weekly plans.
 */
export class MonthlyContentRepository {
  constructor(private readonly database: Queryable) {}

  async saveBrief(actorId: string, input: SaveMonthlyBriefInput): Promise<SharedMonthBriefView> {
    const actor = await this.requireOperator(actorId);
    const calendar = buildMonthlyCalendar(input.month);
    const current = await this.database.query<BriefRow>(
      `select id, month, theme_title, theme_brief, theme_context, communication_goal, brief_version, brief_status
       from program_months where organization_id = $1 and month = $2`,
      [actor.organization_id, input.month]
    );
    const existing = current.rows[0];
    if (existing) {
      const approved = await this.database.query<{ id: string }>(
        `select mf.id
         from month_frameworks mf
         where mf.program_month_id = $1 and mf.status = 'approved'
         limit 1`,
        [existing.id]
      );
      if (approved.rowCount) throw new Error("Cannot change a brief after a framework is approved");
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

  async saveFramework(actorId: string, contract: MonthlyCurriculumContract): Promise<Pick<MonthFrameworkView, "id" | "cefr" | "version" | "status" | "scopeHash">> {
    const actor = await this.requireOperator(actorId);
    const validationErrors = validateMonthlyCurriculum(contract);
    if (validationErrors.length) throw new Error(`Invalid monthly curriculum: ${validationErrors.join("; ")}`);
    const brief = await this.database.query<BriefRow>(
      `select id, month, theme_title, theme_brief, theme_context, communication_goal, brief_version, brief_status
       from program_months where organization_id = $1 and month = $2`,
      [actor.organization_id, contract.month]
    );
    const month = brief.rows[0];
    if (!month) throw new Error("Monthly brief must exist before a framework is saved");
    if (!sameBrief(month, contract)) throw new Error("Monthly curriculum must use the current shared brief version");

    const existingResult = await this.database.query<FrameworkRow>(
      `select id, cefr, version, status, scope_hash, curriculum_contract, quality_acknowledgement
       from month_frameworks where program_month_id = $1 and cefr = $2`,
      [month.id, contract.cefr]
    );
    const existing = existingResult.rows[0];
    if (existing?.status === "approved") throw new Error("Cannot replace an approved framework; create an authorized correction instead");
    const scopeHash = monthlyScopeHash(contract);
    const version = (existing?.version ?? 0) + 1;
    const frameworkId = existing?.id ?? randomUUID();
    if (existing) {
      await this.database.query(
        `update month_frameworks
         set version = $2, status = 'draft', curriculum_contract = $3::jsonb, scope_hash = $4,
             quality_acknowledgement = null, source = 'manual', generation_error = null,
             approved_by = null, approved_at = null, updated_at = now()
         where id = $1`,
        [frameworkId, version, JSON.stringify(contract), scopeHash]
      );
      await this.database.query("delete from month_lessons where framework_id = $1", [frameworkId]);
    } else {
      await this.database.query(
        `insert into month_frameworks (id, program_month_id, cefr, version, curriculum_contract, scope_hash, created_by)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [frameworkId, month.id, contract.cefr, version, JSON.stringify(contract), scopeHash, actorId]
      );
    }
    for (const day of contract.daySpecs) {
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

  async approveFramework(actorId: string, frameworkId: string): Promise<void> {
    const actor = await this.requireOperator(actorId);
    const result = await this.database.query<{ id: string }>(
      `update month_frameworks mf
       set status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
       from program_months pm
       where mf.id = $1 and mf.program_month_id = pm.id and pm.organization_id = $3 and mf.status = 'draft'
       returning mf.id`,
      [frameworkId, actorId, actor.organization_id]
    );
    if (!result.rowCount) throw new Error("Only a draft framework in this organization can be approved");
    await this.audit(actor, "monthly.framework_approved", frameworkId, {});
  }

  async getOverview(actorId: string, month: string): Promise<MonthlyOperatorOverviewView> {
    const actor = await this.requireOperator(actorId);
    const briefResult = await this.database.query<BriefRow>(
      `select id, month, theme_title, theme_brief, theme_context, communication_goal, brief_version, brief_status
       from program_months where organization_id = $1 and month = $2`,
      [actor.organization_id, month]
    );
    const brief = briefResult.rows[0];
    if (!brief) return { brief: null, frameworks: [] };
    const frameworkResult = await this.database.query<FrameworkRow>(
      `select id, cefr, version, status, scope_hash, curriculum_contract, quality_acknowledgement
       from month_frameworks where program_month_id = $1 order by cefr`,
      [brief.id]
    );
    const frameworks = await Promise.all(frameworkResult.rows.map(async (framework) => ({
      ...toFrameworkHeader(framework),
      lessons: await this.lessonsForFramework(framework, brief.id)
    })));
    return { brief: toBriefView(brief), frameworks };
  }

  async recommendedBatch(actorId: string, frameworkId: string): Promise<number[]> {
    const actor = await this.requireOperator(actorId);
    const frameworkResult = await this.database.query<FrameworkRow>(
      `select mf.id, mf.cefr, mf.version, mf.status, mf.scope_hash, mf.curriculum_contract, mf.quality_acknowledgement
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where mf.id = $1 and pm.organization_id = $2`,
      [frameworkId, actor.organization_id]
    );
    const framework = frameworkResult.rows[0];
    if (!framework) throw new Error("Monthly framework was not found");
    const lessons = await this.lessonsForFramework(framework);
    return recommendedPendingBatch(framework.curriculum_contract.daySpecs, new Map(lessons.map((lesson) => [lesson.lessonNumber, lesson.status])));
  }

  private async lessonsForFramework(framework: FrameworkRow, _programMonthId?: string): Promise<MonthFrameworkView["lessons"]> {
    const result = await this.database.query<MonthLessonRow>(
      `select ml.lesson_number, ml.lesson_date::text, ml.status, ml.scope_hash,
              (select count(*) from month_lesson_corrections mlc where mlc.month_lesson_id = ml.id)::text as correction_count
       from month_lessons ml where ml.framework_id = $1 order by ml.lesson_number`,
      [framework.id]
    );
    const specs = new Map(framework.curriculum_contract.daySpecs.map((spec) => [spec.lessonNumber, spec]));
    return result.rows.map((lesson) => ({
      lessonNumber: lesson.lesson_number,
      lessonDate: lesson.lesson_date,
      kind: dayKind(specs.get(lesson.lesson_number)),
      status: lesson.status,
      scopeHash: lesson.scope_hash,
      locked: lesson.status === "approved",
      correctionCount: Number(lesson.correction_count)
    }));
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

  private async audit(actor: ActorRow, action: string, entityId: string, payload: Record<string, unknown>): Promise<void> {
    await this.database.query(
      `insert into audit_events (id, organization_id, action, entity_type, entity_id, payload, trace_id)
       values ($1, $2, $3, 'monthly_framework', $4, $5::jsonb, $6)`,
      [randomUUID(), actor.organization_id, action, entityId, JSON.stringify(payload), randomUUID()]
    );
  }
}

function sameBrief(brief: BriefRow, contract: MonthlyCurriculumContract): boolean {
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
    status: row.status,
    scopeHash: row.scope_hash,
    quality
  };
}

function dayKind(spec: MonthlyDaySpec | undefined): "new" | "review" {
  if (!spec) throw new Error("Stored monthly lesson has no curriculum day specification");
  return spec.kind;
}
