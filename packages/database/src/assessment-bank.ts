import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  AssessmentBankFormDetail,
  AssessmentBankPolicy,
  AssessmentBankScope,
  AssessmentBankView,
} from "@e4s/contracts";
import {
  passCourseFormADefinition,
  placementDefinition,
  type StoredAssessmentDefinition,
} from "./assessment-blueprints.js";
import {
  AssessmentBankError,
  assembleBankBlueprint,
  buildBankManifest,
  retakeCopyIssues,
  type BankManifest,
} from "./assessment-bank-manifest.js";
import { findPlacementRetakeGrant, placementRetakeStructureIssues, placementStructureOf } from "./placement-retake.js";
import type { PublishedAssessmentRecord } from "./repositories.js";

type Db = Pool | PoolClient;
type Version = PublishedAssessmentRecord & {
  status: "draft" | "published" | "retired";
  legacy: boolean;
  used: boolean;
  configured: boolean;
  rubricVersionId: string | null;
};
const scopeSql = `case when ad.kind='placement' and ad.assessment_key='placement-retake' then 'retake'
  when ad.kind='placement' then 'placement' when ad.kind='pass_course' then 'pass_course'
  when ad.kind='level_up' then av.blueprint->>'targetLevel' end`;
const columns = `ad.id as "definitionId", av.id as "versionId", ad.assessment_key as "assessmentKey", ad.kind,
  av.blueprint->>'title' as title, av.version, av.blueprint, av.status, av.rubric_version_id as "rubricVersionId",
  (not av.bank_managed and ad.assessment_key in ('placement-a','pass-course-form-a')) as legacy,
  assessment_bank_version_used(av.id) as used,
  exists(select 1 from assessment_bank_policy_sources s where s.version_id=av.id) as configured`;

async function versions(
  db: Db,
  actor: string,
  scope: AssessmentBankScope,
  id?: string,
  lock = false,
): Promise<Version[]> {
  return (
    await db.query<Version>(
      `select ${columns} from assessment_versions av
    join assessment_definitions ad on ad.id=av.definition_id
    join users u on u.id=$1 and u.organization_id=ad.organization_id
    where (${scopeSql})=$2 and ($3::uuid is null or av.id=$3)
      and (av.status <> 'retired' or av.bank_managed or av.bank_archived or $3 is not null)
    order by av.bank_managed, case when av.bank_managed then av.version end asc, av.published_at desc nulls last, av.version desc, av.id
    ${lock ? "for update of av" : ""}`,
      [actor, scope, id ?? null],
    )
  ).rows;
}
function detail(scope: AssessmentBankScope, v: Version): AssessmentBankFormDetail & { scope: AssessmentBankScope } {
  const listening = v.blueprint.sections.find((s) => s.code === "listening");
  const deleteReason = v.used ? "Đã có lượt thi; giữ đề, audio và lịch sử kết quả."
    : v.configured ? "Bộ đang được chọn để giao đề. Hãy đổi cấu hình trước khi xoá."
      : v.status !== "retired" ? "Hãy lưu trữ bộ đề trước khi xoá." : null;
  return {
    scope,
    versionId: v.versionId,
    title: v.title,
    version: v.version,
    status: v.status === "retired" ? "archived" : v.status,
    legacy: v.legacy,
    used: v.used,
    canDelete: deleteReason === null,
    deleteReason,
    audioConfigured: Boolean(listening?.groups.length && listening.groups.every((g) => g.stimulus?.audioSrc?.trim())),
    sectionCount: v.blueprint.sections.length,
    totalMinutes: v.blueprint.totalMinutes,
    totalScore: v.blueprint.totalScore,
    blueprint: v.blueprint,
  };
}
async function policy(
  db: Db,
  actor: string,
  scope: AssessmentBankScope,
  rows: Version[],
): Promise<AssessmentBankPolicy> {
  const result = await db.query<{ mode: "single" | "mixed"; ids: string[] }>(
    `select p.mode,
    array(select s.version_id from assessment_bank_policy_sources s where (s.organization_id,s.scope)=(p.organization_id,p.scope) order by position) ids
    from assessment_bank_policies p join users u on u.organization_id=p.organization_id where u.id=$1 and p.scope=$2`,
    [actor, scope],
  );
  const p = result.rows[0];
  const defaultForm = rows.find((v) => v.status === "published");
  return p
    ? { mode: p.mode, sourceCount: p.ids.length, versionIds: p.ids }
    : { mode: "single", sourceCount: 1, versionIds: defaultForm ? [defaultForm.versionId] : [] };
}
async function inScope<T>(
  pool: Pool,
  actor: string,
  scope: AssessmentBankScope,
  operation: (db: PoolClient, org: string) => Promise<T>,
) {
  const db = await pool.connect();
  try {
    await db.query("begin");
    const org = (
      await db.query<{ organization_id: string }>("select organization_id from users where id=$1 and status='active'", [
        actor,
      ])
    ).rows[0]?.organization_id;
    if (!org) throw new AssessmentBankError("ASSESSMENT_BANK_ACTOR_UNKNOWN", 404);
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [org + "/assessment-bank/" + scope]);
    const result = await operation(db, org);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}

export async function readAssessmentBank(
  db: Db,
  actor: string,
  scope: AssessmentBankScope,
): Promise<AssessmentBankView> {
  const rows = await versions(db, actor, scope);
  return {
    scope,
    desiredCount: 3,
    policy: await policy(db, actor, scope, rows),
    forms: rows.map((row) => {
      const { blueprint: _b, scope: _s, ...summary } = detail(scope, row);
      return summary;
    }),
  };
}
function selected(rows: Version[], p: AssessmentBankPolicy, scope: AssessmentBankScope) {
  if (p.sourceCount !== p.versionIds.length || !p.sourceCount)
    throw new AssessmentBankError("ASSESSMENT_BANK_SOURCE_COUNT");
  return p.versionIds.map((id) => {
    const found = rows.find((v) => v.versionId === id && v.status === "published");
    if (!found) throw new AssessmentBankError("ASSESSMENT_BANK_SOURCE_UNAVAILABLE");
    const target = identity(scope);
    if (found.blueprint.kind !== target.kind || found.blueprint.targetLevel !== target.targetLevel)
      throw new AssessmentBankError("ASSESSMENT_BANK_WRONG_SCOPE");
    return found;
  });
}
export async function saveBankPolicy(
  pool: Pool,
  actor: string,
  scope: AssessmentBankScope,
  value: AssessmentBankPolicy,
) {
  return inScope(pool, actor, scope, async (db, org) => {
    const rows = await versions(db, actor, scope, undefined, true);
    buildBankManifest(selected(rows, value, scope), value.mode);
    await db.query(
      `insert into assessment_bank_policies (organization_id,scope,mode) values ($1,$2,$3)
      on conflict (organization_id,scope) do update set mode=excluded.mode`,
      [org, scope, value.mode],
    );
    await db.query("delete from assessment_bank_policy_sources where organization_id=$1 and scope=$2", [org, scope]);
    await db.query(
      `insert into assessment_bank_policy_sources (organization_id,scope,version_id,position)
      select $1,$2,version_id,ord from unnest($3::uuid[]) with ordinality source(version_id,ord)`,
      [org, scope, value.versionIds],
    );
    return readAssessmentBank(db, actor, scope);
  });
}
async function requestedVersion(db: Db, actor: string, scope: AssessmentBankScope, id: string, lock = false) {
  const row = (await versions(db, actor, scope, id, lock))[0];
  if (!row) throw new AssessmentBankError("ASSESSMENT_BANK_FORM_NOT_FOUND", 404);
  return row;
}
export async function readBankForm(db: Db, actor: string, scope: AssessmentBankScope, id: string) {
  return detail(scope, await requestedVersion(db, actor, scope, id));
}

export async function deleteBankForm(pool: Pool, actor: string, scope: AssessmentBankScope, id: string) {
  return inScope(pool, actor, scope, async (db, org) => {
    const operator = await db.query("select 1 from users where id=$1 and role='operator' and status='active'", [actor]);
    if (!operator.rowCount) throw new AssessmentBankError("FORBIDDEN", 403);
    const row = await requestedVersion(db, actor, scope, id, true);
    const reason = detail(scope, row).deleteReason;
    if (reason) throw new AssessmentBankError(row.used ? "ASSESSMENT_BANK_FORM_USED"
      : row.configured ? "ASSESSMENT_BANK_SOURCE_CONFIGURED" : "ASSESSMENT_BANK_ARCHIVE_REQUIRED", 409, [reason]);
    try {
      // Keep the shared definition, all attempts, and every physical audio file.
      await db.query("delete from assessment_versions where id=$1 and status='retired'", [id]);
    } catch (error) {
      if (["23503", "23514"].includes((error as { code?: string }).code ?? ""))
        throw new AssessmentBankError("ASSESSMENT_BANK_FORM_USED", 409, ["Bộ đề có dữ liệu liên quan cần giữ lại; không thể xoá."]);
      throw error;
    }
    await db.query(`insert into audit_events(id,organization_id,actor_user_id,action,entity_type,entity_id,payload,trace_id)
      values($1,$2,$3,'assessment.bank-form.deleted','assessment_version',$4,$5::jsonb,$6)`,
      [randomUUID(), org, actor, id, JSON.stringify({ scope, title: row.title, version: row.version }), randomUUID()]);
    return { deleted: true as const, versionId: id };
  });
}

function identity(scope: AssessmentBankScope) {
  if (scope === "placement") return { key: "placement-a", kind: "placement", dbKind: "placement" } as const;
  if (scope === "retake") return { key: "placement-retake", kind: "placement", dbKind: "placement" } as const;
  if (scope === "pass_course")
    return { key: "pass-course-form-a", kind: "pass-course", dbKind: "pass_course", targetLevel: "C1" } as const;
  return { key: "level-up-" + scope.toLowerCase(), kind: "level-up", dbKind: "level_up", targetLevel: scope } as const;
}

export async function writeBankDraft(
  pool: Pool,
  actor: string,
  scope: AssessmentBankScope,
  input: StoredAssessmentDefinition,
  id?: string,
) {
  return inScope(pool, actor, scope, async (db, org) => {
    const previous = id ? await requestedVersion(db, actor, scope, id, true) : null;
    const target = identity(scope);
    if (input.kind !== target.kind || input.key !== target.key || input.targetLevel !== target.targetLevel)
      throw new AssessmentBankError("ASSESSMENT_BANK_WRONG_SCOPE", 400);
    let versionId = previous?.versionId;
    if (previous?.status === "draft") {
      await db.query("update assessment_versions set blueprint=$2::jsonb where id=$1", [
        versionId,
        JSON.stringify(input),
      ]);
    } else {
      const definitionId = (
        await db.query<{ id: string }>(
          `insert into assessment_definitions(id,organization_id,assessment_key,kind,title)
        values ($1,$2,$3,$4,$5) on conflict (organization_id,assessment_key) do update set assessment_key=excluded.assessment_key returning id`,
          [randomUUID(), org, target.key, target.dbKind, input.title],
        )
      ).rows[0]!.id;
      versionId = randomUUID();
      await db.query(
        `insert into assessment_versions(id,definition_id,version,status,blueprint,bank_managed,rubric_version_id)
        select $1,$2,coalesce(max(version),0)+1,'draft',$3::jsonb,true,$4 from assessment_versions where definition_id=$2`,
        [versionId, definitionId, JSON.stringify(input), previous?.rubricVersionId ?? null],
      );
    }
    return readBankForm(db, actor, scope, versionId!);
  });
}

const canonicalAudio = new Set(
  [placementDefinition, passCourseFormADefinition].flatMap((b) =>
    b.sections.flatMap((s) => s.groups.flatMap((g) => (g.stimulus?.audioSrc ? [g.stimulus.audioSrc] : []))),
  ),
);
async function audioIssues(db: Db, actor: string, blueprint: StoredAssessmentDefinition, lock: boolean) {
  const issues: string[] = [];
  for (const group of blueprint.sections.find((s) => s.code === "listening")?.groups ?? []) {
    const src = group.stimulus?.audioSrc ?? "";
    if (canonicalAudio.has(src)) continue;
    if (src.startsWith("/api/v1/files/content-media/read?")) {
      const key = new URL(src, "http://localhost").searchParams.get("artifactKey");
      if (!key || src !== "/api/v1/files/content-media/read?artifactKey=" + encodeURIComponent(key) ||
        encodeURIComponent(key) !== key.replaceAll("/", "%2F")) {
        issues.push(group.key + ": đường dẫn âm thanh không hợp lệ.");
        continue;
      }
      const found = await db.query(
        `select 1 from files f join users owner on owner.id=f.owner_user_id
        join users actor on actor.id=$1 and actor.organization_id=owner.organization_id
        where f.object_key=$2 and f.purpose='content_media' and f.deleted_at is null and f.organization_id=actor.organization_id
          and f.mime_type like 'audio/%' and f.size_bytes>0 ${lock ? 'for share of f' : ''}`,
        [actor, key],
      );
      if (found.rowCount) continue;
    }
    issues.push(group.key + ": cần tệp âm thanh hợp lệ.");
  }
  return issues;
}

export async function bankFormIssues(db: Db, actor: string, scope: AssessmentBankScope, b: StoredAssessmentDefinition, lockAudio = false) {
  const issues: string[] = [];
  const target = identity(scope);
  if (b.kind !== target.kind || b.targetLevel !== target.targetLevel || b.key !== target.key)
    issues.push("Sai loại đề hoặc trình độ.");
  if (scope === "placement" || scope === "retake" || scope === "pass_course") {
    const frame = scope === "pass_course" ? passCourseFormADefinition : placementDefinition;
    issues.push(...placementRetakeStructureIssues(b, placementStructureOf(frame)));
    for (const section of b.sections.filter((s) => s.code === "writing" || s.code === "speaking")) {
      const expected = frame.sections
        .find((s) => s.code === section.code)!
        .groups.flatMap((g) => g.tasks.map((t) => t.key));
      if (section.groups.flatMap((g) => g.tasks.map((t) => t.key)).join() !== expected.join())
        issues.push(section.code + ": mã câu không khớp rubric.");
    }
  } else {
    const plan = [
      ["listening", 15, 20, 20],
      ["reading", 25, 40, 40],
      ["writing", 20, 20, 2],
      ["speaking", 15, 20, 4],
    ] as const;
    if (b.totalMinutes !== 75 || b.totalScore !== 100 || b.sections.length !== 4)
      issues.push("Đề lên mức phải đủ bốn phần, 75 phút và 100 điểm.");
    plan.forEach(([code, duration, marks, count], i) => {
      const s = b.sections[i];
      const tasks = s?.groups.flatMap((g) => g.tasks) ?? [];
      if (
        s?.code !== code ||
        s.durationMinutes !== duration ||
        s.maxScore !== marks ||
        tasks.length !== count ||
        tasks.reduce((sum, t) => sum + t.maxScore, 0) !== marks ||
        tasks.some((t, j) =>
          code === "writing"
            ? t.key !== "W" + (j + 1) || t.maxScore !== [7, 13][j] || t.responseType !== "long_text"
            : code === "speaking"
              ? t.key !== "S" + (j + 1) || t.maxScore !== 5 || t.responseType !== "speaking_evidence"
              : t.responseType !== "single_choice" || t.maxScore !== 1,
        )
      )
        issues.push(code + ": sai cấu trúc câu hỏi, thời gian hoặc thang điểm.");
    });
  }
  const keys = new Set<string>();
  for (const s of b.sections) {
    const groupKeys = new Set<string>();
    for (const g of s.groups) {
      if (groupKeys.has(g.key)) issues.push(g.key + ": trùng mã nhóm.");
      groupKeys.add(g.key);
      if (
        s.code === "listening" &&
        (g.stimulus?.type !== "audio_script" ||
          !g.stimulus.lines?.length ||
          g.stimulus.lines.some((l) => !l.text.trim() || !l.speaker.trim()))
      )
        issues.push(g.key + ": thiếu lời thoại.");
      if (g.stimulus?.type === "passage" || g.stimulus?.type === "message") {
        if (!g.stimulus.text?.trim()) issues.push(g.key + ": thiếu nội dung ngữ liệu.");
      }
      if (
        g.stimulus?.type === "table" &&
        (!g.stimulus.headers?.length ||
          !g.stimulus.rows?.length ||
          g.stimulus.rows.some((r) => r.length !== g.stimulus!.headers!.length || r.some((c) => !c.trim())))
      )
        issues.push(g.key + ": bảng chưa hoàn chỉnh.");
      for (const t of g.tasks) {
        if (keys.has(t.key)) issues.push(t.key + ": trùng mã câu hỏi.");
        keys.add(t.key);
        if (!t.prompt.trim()) issues.push(t.key + ": thiếu nội dung câu hỏi.");
        if (t.responseType === "single_choice") {
          const options = t.options ?? [];
          if (
            options.length !== 4 ||
            options.some((o) => !o.label.trim()) ||
            new Set(options.map((o) => o.value)).size !== 4 ||
            new Set(options.map((o) => o.label.trim().toLowerCase())).size !== 4 ||
            !options.some((o) => o.value === t.correctAnswer)
          )
            issues.push(t.key + ": cần bốn lựa chọn khác nhau và đáp án đúng.");
        }
      }
    }
  }
  if (scope === "retake") issues.push(...retakeCopyIssues(placementDefinition, b));
  issues.push(...(await audioIssues(db, actor, b, lockAudio)));
  return issues;
}

export async function changeBankFormStatus(
  pool: Pool,
  actor: string,
  scope: AssessmentBankScope,
  id: string,
  publish: boolean,
) {
  return inScope(pool, actor, scope, async (db) => {
    const row = await requestedVersion(db, actor, scope, id, true);
    if (publish) {
      if (row.status !== "draft") throw new AssessmentBankError("ASSESSMENT_BANK_DRAFT_REQUIRED");
      const issues = await bankFormIssues(db, actor, scope, row.blueprint,true);
      if (issues.length) throw new AssessmentBankError("ASSESSMENT_BANK_VALIDATION_FAILED", 422, issues);
      await db.query("update assessment_versions set status='published',published_at=now() where id=$1", [id]);
    } else {
      if ((await db.query("select 1 from assessment_bank_policy_sources where version_id=$1", [id])).rowCount)
        throw new AssessmentBankError("ASSESSMENT_BANK_SOURCE_CONFIGURED", 409, [
          "Hãy chọn nguồn phát đề khác trước khi lưu trữ.",
        ]);
      await db.query("update assessment_versions set status='retired',bank_archived=true where id=$1", [id]);
    }
    return readBankForm(db, actor, scope, id);
  });
}

export async function bankDefinitionForAttempt(db: Db, attemptId: string): Promise<PublishedAssessmentRecord | null> {
  const result = await db.query<Version & { manifest: BankManifest | null }>(
    `select ${columns}, bank.manifest
    from assessment_attempts a join assessment_versions av on av.id=a.assessment_version_id
    join assessment_definitions ad on ad.id=av.definition_id join users u on u.id=a.learner_id and u.organization_id=ad.organization_id
    left join assessment_bank_attempts bank on bank.attempt_id=a.id where a.id=$1`,
    [attemptId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const { manifest, ...definition } = row;
  if (!manifest) return definition;
  const sources = await db.query<Version>(
    `select ${columns} from assessment_bank_attempt_sources s
    join assessment_versions av on av.id=s.version_id join assessment_definitions ad on ad.id=av.definition_id where s.attempt_id=$1`,
    [attemptId],
  );
  return { ...definition, blueprint: assembleBankBlueprint(sources.rows, manifest) };
}

export async function bankAttemptId(db: Db, learner: string, scope: AssessmentBankScope) {
  const row = await db.query<{ id: string }>(
    `select a.id from assessment_attempts a join assessment_versions av on av.id=a.assessment_version_id
    join assessment_definitions ad on ad.id=av.definition_id join users u on u.id=a.learner_id and u.organization_id=ad.organization_id
    where a.learner_id=$1 and (${scopeSql})=$2 and ($2 in ('retake','placement') or a.status <> 'needs_retry')
    order by a.started_at desc limit 1`,
    [learner, scope],
  );
  return row.rows[0]?.id ?? null;
}
export async function bankPreparation(db: Db, learner: string, scope: AssessmentBankScope) {
  const rows = await versions(db, learner, scope);
  const p = await policy(db, learner, scope, rows);
  if (!p.versionIds.length) return null;
  return selected(rows, p, scope)[0]!;
}

export async function startBankAttempt(
  pool: Pool,
  learner: string,
  scope: AssessmentBankScope,
  violationLimit: number,
  owner: string | null,
) {
  return inScope(pool, learner, scope, async (db) => {
    const grant = scope === "retake" ? await findPlacementRetakeGrant(db, learner, { forUpdate: true }) : null;
    if (scope === "retake" && !grant?.sourceAttemptId) throw new AssessmentBankError("PLACEMENT_RETAKE_NOT_AVAILABLE");
    if (grant?.retakeAttemptId) return grant.retakeAttemptId;
    if (grant?.usedAt) throw new AssessmentBankError("PLACEMENT_RETAKE_NOT_AVAILABLE");
    const prior = grant ? null : await bankAttemptId(db, learner, scope);
    if (prior) return prior;
    const rows = await versions(db, learner, scope, undefined, true);
    const p = await policy(db, learner, scope, rows);
    const sources = selected(rows, p, scope);
    const manifest = buildBankManifest(sources, p.mode);
    const blueprint = assembleBankBlueprint(sources, manifest);
    if (grant) {
      const original = await bankDefinitionForAttempt(db, grant.sourceAttemptId!);
      if (!original || original.kind !== "placement" || original.assessmentKey === "placement-retake" ||
        !(await db.query("select 1 from assessment_attempts where id=$1 and learner_id=$2",[grant.sourceAttemptId,learner])).rowCount) {
        throw new AssessmentBankError("PLACEMENT_RETAKE_ORIGINAL_UNAVAILABLE");
      }
      const issues = retakeCopyIssues(original.blueprint, blueprint);
      if (issues.length) throw new AssessmentBankError("PLACEMENT_RETAKE_COPY", 409, issues);
    }
    const first = blueprint.sections[0];
    if (!first) throw new AssessmentBankError("ASSESSMENT_BLUEPRINT_EMPTY");
    const started = new Date();
    const timing = {
      sections: {
        [first.code]: {
          startedAt: started.toISOString(),
          endsAt: new Date(started.getTime() + first.durationMinutes * 60_000).toISOString(),
        },
      },
    };
    const id = randomUUID();
    await db.query(
      `insert into assessment_attempts(id,assessment_version_id,learner_id,status,current_section,timing_state,violation_limit,started_at,updated_at,owner_session_id)
      values ($1,$2,$3,'in_progress',$4,$5::jsonb,$6,$7,$7,$8)`,
      [id, manifest.anchor, learner, first.code, JSON.stringify(timing), violationLimit, started, owner],
    );
    await db.query("insert into assessment_bank_attempts(attempt_id,scope,manifest) values ($1,$2,$3::jsonb)", [
      id,
      scope,
      JSON.stringify(manifest),
    ]);
    await db.query("insert into assessment_bank_attempt_sources(attempt_id,version_id) select $1,unnest($2::uuid[])", [
      id,
      p.versionIds,
    ]);
    if (grant)
      await db.query("update assessment_retake_grants set retake_attempt_id=$2,used_at=$3 where id=$1", [
        grant.id,
        id,
        started,
      ]);
    return id;
  });
}
