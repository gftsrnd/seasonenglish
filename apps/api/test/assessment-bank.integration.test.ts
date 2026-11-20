import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assessmentGradingInputSchema } from "@e4s/ai";
import type { AssessmentBankFormDetail, AssessmentView } from "@e4s/contracts";
import {
  bankDefinitionForAttempt,
  bankPreparation,
  startBankAttempt,
  createRepositories,
  DEMO_IDS,
  migrateDatabase,
  placementDefinition,
  resetPublicSchema,
  seedDemo,
  type BankManifest,
} from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { buildApi } from "../src/app.js";

describe("assessment bank API lifecycle and immutable grading", () => {
  const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test",
  });
  const removedObjects: string[] = [];
  const app = buildApi({
    pool,
    allowDemoLogin: true,
    secureCookies: false,
    storage: {
      ready: async () => {},
      putObject: async () => {},
      presignGetObject: async () => ({ url: "https://example.invalid/audio", expiresAt: new Date() }),
      deleteObject: async (_bucket, key) => {
        removedObjects.push(key);
      },
    },
  });
  let op = "",
    student = "",
    manager = "";
  const learnerId = randomUUID(),
    otherOrg = randomUUID(),
    foreignId = randomUUID();
  const base = "/api/v1/assessment-banks/placement";
  const request = (method: "GET" | "PUT" | "POST" | "DELETE", url: string, cookie: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into organizations(id,slug,name) values($1,'elsewhere','Elsewhere')", [otherOrg]);
      await client.query(
        "insert into assessment_definitions(id,organization_id,assessment_key,kind,title) values($1,$2,'placement-a','placement','Foreign')",
        [foreignId, otherOrg],
      );
      await client.query(
        "insert into assessment_versions(id,definition_id,version,status,blueprint,published_at) values($1,$1,1,'published',$2,now())",
        [foreignId, placementDefinition],
      );
      await client.query(
        "insert into users(id,organization_id,role,display_name,email) values($1,$2,'learner','Bank test','bank@e4s.local')",
        [learnerId, DEMO_IDS.organization],
      );
      await client.query(
        "insert into learner_profiles(user_id,profile,completed_at) select $1,profile,now() from learner_profiles where user_id=$2",
        [learnerId, DEMO_IDS.learner],
      );
      await client.query("insert into user_credentials(user_id,credential_hash) values ($1,$2),($3,$4),($5,$6)", [
        DEMO_IDS.operator,
        await createCredentialHash("operator-pass"),
        learnerId,
        await createPinHash("987654"),
        DEMO_IDS.manager,
        await createCredentialHash("test-manager-pw"),
      ]);
    } finally {
      client.release();
    }
    const login = async (url: string, payload: object) => {
      const r = await request("POST", url, "", payload);
      expect(r.statusCode, r.body).toBe(200);
      return String(r.headers["set-cookie"]).split(";")[0]!;
    };
    op = await login("/api/auth/staff/login", { email: "thu.ha.tran@e4s.local", password: "operator-pass" });
    manager = await login("/api/auth/staff/login", { email: "quoc.bao.le@e4s.local", password: "test-manager-pw" });
    student = await login("/api/auth/learner/login", { email: "bank@e4s.local", pin: "987654" });
  }, 30_000);
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("scopes sources and authors, refuses incomplete drafts, creates beyond three, and excludes monthly", async () => {
    expect((await request("GET", base, op)).json()).toMatchObject({
      desiredCount: 3,
      forms: [{ legacy: true, status: "published", sectionCount: 4, totalMinutes: 75, totalScore: 100 }],
      policy: { mode: "single", versionIds: [DEMO_IDS.placementVersion] },
    });
    expect((await request("GET", "/api/v1/assessment-banks/pass_course", op)).json().forms[0]).toMatchObject({ sectionCount: 4, totalMinutes: 90, totalScore: 100 });
    expect((await request("GET", base, student)).statusCode).toBe(403);
    expect((await request("GET", base, manager)).statusCode).toBe(200);
    expect((await request("POST", base + "/forms", manager, { method: "manual" })).statusCode).toBe(403);
    expect((await request("GET", base + "/forms/" + foreignId, op)).statusCode).toBe(404);
    expect((await request("GET", "/api/v1/assessment-banks/final", op)).statusCode).toBe(400);
    expect((await request("POST", base + "/forms", op, { method: "ai" })).statusCode).toBe(503);
    for (let i = 0; i < 4; i++) {
      const response = await request("POST", base + "/forms", op, { method: "manual", title: "Đề " + i });
      expect(response.statusCode, response.body).toBe(201);
      const id = response.json().versionId;
      expect((await request("POST", base + "/forms/" + id + "/validate", op, {})).json().issues.length).toBeGreaterThan(
        0,
      );
      expect(
        (await request("POST", base + "/forms/" + id + "/publish", op, { answersReviewed: true })).statusCode,
      ).toBe(422);
      expect(
        (await request("PUT", base + "/policy", op, { mode: "single", sourceCount: 1, versionIds: [id] })).statusCode,
      ).toBe(409);
    }
    for (const id of [foreignId, DEMO_IDS.passCourseVersion]) {
      expect(
        (
          await request("PUT", base + "/policy", op, {
            mode: "mixed",
            sourceCount: 2,
            versionIds: [DEMO_IDS.placementVersion, id],
          })
        ).statusCode,
      ).toBe(409);
    }
    expect((await request("GET", base, op)).json().forms).toHaveLength(5);
  });

  it("mixes selected whole groups once across concurrent starts, keeps answer keys server-side, and scores and reviews after archive", async () => {
    const original = await request("GET", base + "/forms/" + DEMO_IDS.placementVersion, op);
    const blueprint = original.json<AssessmentBankFormDetail>().blueprint;
    blueprint.title = "Alternate placement";
    for (const section of blueprint.sections)
      for (const group of section.groups) {
        group.title += " alternate";
        for (const task of group.tasks) {
          task.prompt += " (Alternate workplace scenario.)";
          if (task.correctAnswer) task.correctAnswer = task.options!.find((o) => o.value !== task.correctAnswer)!.value;
        }
      }
    const draft = await request("PUT", base + "/forms/" + DEMO_IDS.placementVersion, op, { blueprint });
    expect(draft.statusCode, draft.body).toBe(200);
    const alternate = draft.json().versionId;
    expect(alternate).not.toBe(DEMO_IDS.placementVersion);
    expect((await request("POST", base + "/forms/" + alternate + "/validate", op, {})).json()).toEqual({ issues: [] });
    const published = await request("POST", base + "/forms/" + alternate + "/publish", op, { answersReviewed: true });
    expect(published.statusCode, published.body).toBe(200);
    const saved = await request("PUT", base + "/policy", op, {
      mode: "mixed",
      sourceCount: 2,
      versionIds: [DEMO_IDS.placementVersion, alternate],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await request("POST", base + "/forms/" + alternate + "/archive", op, {})).statusCode).toBe(409);
    const attempts = await Promise.all(
      [1, 2, 3].map(() => request("POST", "/api/v1/assessments/placement/start", student, {})),
    );
    for (const r of attempts) expect(r.statusCode, r.body).toBe(201);
    const view = attempts[0]!.json<AssessmentView>();
    const id = view.attempt!.id;
    for (const r of attempts) {
      expect(r.json().attempt.id).toBe(id);
      expect(r.json().definition).toEqual(view.definition);
    }
    // A later start (reload / second click) resumes the same mixed form, never the published default.
    const resumedLater = await request("POST", "/api/v1/assessments/placement/start", student, {});
    expect(resumedLater.statusCode, resumedLater.body).toBe(201);
    expect(resumedLater.json().definition).toEqual(view.definition);
    expect(JSON.stringify(view)).not.toContain("correctAnswer");
    const result = await pool.query<{ manifest: BankManifest }>(
      "select manifest from assessment_bank_attempts where attempt_id=$1",
      [id],
    );
    expect(new Set(result.rows[0]!.manifest.groups.map((g) => g.versionId))).toEqual(
      new Set([DEMO_IDS.placementVersion, alternate]),
    );
    expect(JSON.stringify(result.rows[0]!.manifest)).not.toContain("prompt");
    const switchPolicy = await request("PUT", base + "/policy", op, {
      mode: "single",
      sourceCount: 1,
      versionIds: [alternate],
    });
    expect(switchPolicy.statusCode, switchPolicy.body).toBe(200);
    const archived = await request("POST", base + "/forms/" + DEMO_IDS.placementVersion + "/archive", op, {});
    expect(archived.statusCode, archived.body).toBe(200);
    await expect(
      pool.query("update assessment_versions set blueprint='{}'::jsonb where id=$1", [alternate]),
    ).rejects.toThrow("ASSESSMENT_BANK_VERSION_IN_USE");
    const refresh = await request("GET", "/api/v1/assessments/placement", student);
    expect(refresh.json().definition).toEqual(view.definition);
    const actual = (await bankDefinitionForAttempt(pool, id))!.blueprint;
    for (const section of actual.sections.filter((s) => s.code === "listening" || s.code === "reading")) {
      for (const group of section.groups)
        for (const t of group.tasks) {
          const res = await request(
            "PUT",
            "/api/v1/assessment-attempts/" + id + "/responses/" + section.code + "/" + t.key,
            student,
            { value: t.correctAnswer, evidenceType: "choice" },
          );
          expect(res.statusCode, res.body).toBe(200);
        }
      const advance = await request(
        "POST",
        "/api/v1/assessment-attempts/" + id + "/sections/" + section.code + "/complete",
        student,
        {},
      );
      expect(advance.statusCode, advance.body).toBe(200);
    }
    expect(
      (await request("POST", "/api/v1/assessment-attempts/" + id + "/sections/writing/complete", student, {}))
        .statusCode,
    ).toBe(200);
    const recordingId = randomUUID(),
      artifactKey = "assessment-audio/" + learnerId + "/" + recordingId + ".webm";
    await pool.query(
      "insert into files(id,organization_id,owner_user_id,purpose,bucket,object_key,mime_type,size_bytes,sha256) values($1,$2,$3,'assessment_audio','e4s-evidence',$4,'audio/webm',4,'test')",
      [recordingId, DEMO_IDS.organization, learnerId, artifactKey],
    );
    const token = await request(
      "POST",
      "/api/v1/files/assessment-audio/" + recordingId + "/delete-confirmation",
      op,
      {},
    );
    expect(token.statusCode, token.body).toBe(200);
    const savedAudio = await request("PUT", "/api/v1/assessment-attempts/" + id + "/responses/speaking/S1", student, {
      value: "recorded",
      evidenceType: "audio",
      artifactKey,
    });
    expect(savedAudio.statusCode, savedAudio.body).toBe(200);
    const deletion = await app.inject({
      method: "DELETE",
      url: "/api/v1/files/assessment-audio/" + recordingId,
      headers: { cookie: op },
      payload: { confirmationToken: token.json().confirmationToken },
    });
    expect(deletion.statusCode, deletion.body).toBe(409);
    expect(deletion.json().code).toBe("ASSESSMENT_AUDIO_RETAINED");
    expect(removedObjects).toEqual([]);
    expect(
      (await pool.query("select deleted_at,retention_until from files where id=$1", [recordingId])).rows[0],
    ).toEqual({ deleted_at: null, retention_until: null });
    for (const key of ["S2", "S3", "S4"]) {
      const otherFile = randomUUID(),
        objectKey = "assessment-audio/" + learnerId + "/" + otherFile + ".webm";
      await pool.query(
        "insert into files(id,organization_id,owner_user_id,purpose,bucket,object_key,mime_type,size_bytes,sha256) values($1,$2,$3,'assessment_audio','e4s-evidence',$4,'audio/webm',4,'test')",
        [otherFile, DEMO_IDS.organization, learnerId, objectKey],
      );
      expect(
        (
          await request("PUT", "/api/v1/assessment-attempts/" + id + "/responses/speaking/" + key, student, {
            value: "recorded",
            evidenceType: "audio",
            artifactKey: objectKey,
          })
        ).statusCode,
      ).toBe(200);
    }
    const submit = await request("POST", "/api/v1/assessment-attempts/" + id + "/submit", student, {});
    expect(submit.statusCode, submit.body).toBe(200);
    const repo = createRepositories(pool).assessments;
    const review = await repo.getRescoreContext(DEMO_IDS.operator, id);
    expect(review?.definition).toEqual(actual);
    expect(review?.attempt.scores).toMatchObject({ listening: 20, reading: 40 });
    const operatorReview = await request("GET", "/api/v1/assessment-reviews/attempts/" + id, op);
    expect(operatorReview.statusCode, operatorReview.body).toBe(200);
    const reviewed = operatorReview
      .json()
      .sections.find((section: { section: string }) => section.section === "listening").groups[0].tasks[0];
    expect(reviewed.prompt).toBe(actual.sections[0]!.groups[0]!.tasks[0]!.prompt);
    expect(reviewed.correctAnswer).toBe(actual.sections[0]!.groups[0]!.tasks[0]!.correctAnswer);
    expect(operatorReview.json().delivery.sourceVersionIds.sort()).toEqual([DEMO_IDS.placementVersion,alternate].sort());
    await pool.query("update files set transcript='My authenticated speaking transcript.' where id=$1",[recordingId]);
    let captured: unknown;
    const scorer=buildApi({pool,secureCookies:false,aiRunner:{runTask:async(taskId,input)=>{
      captured=input;
      return {output:{writingScore:9,speakingScore:12,suggestedLevel:"B1",rationale:"Reason",monthlyGoal:"Practice"},
        metadata:{traceId:"score-test",taskId,provider:"fixture",model:"fixture",attempts:1,latencyMs:1,inputHash:"a".repeat(64),schemaValid:true,usage:{}}};
    }}});
    try {
      const rescore=await scorer.inject({method:"POST",url:"/api/v1/assessment-reviews/"+id+"/rescore",headers:{cookie:op},payload:{requestId:"bank-retry-after-archive"}});
      expect(rescore.statusCode,rescore.body).toBe(200);
      const input=assessmentGradingInputSchema.parse(captured);
      expect(input.writing[0]!.prompt).toContain(actual.sections.find(s=>s.code==="writing")!.groups[0]!.stimulus!.text);
      expect(input.speaking[1]!.prompt).toContain(actual.sections.find(s=>s.code==="speaking")!.groups[1]!.stimulus!.rows![0]!.join(" | "));
      expect(input.speaking[0]!.answer).toBe("My authenticated speaking transcript.");
      expect(input.speaking[1]!.answer).toBe("");
      expect(rescore.json().scores.find((s:{section:string})=>s.section==="speaking")).toBeUndefined();
    } finally {await scorer.close();}
    const graded = await request("POST", "/api/v1/assessment-reviews/" + id + "/manual-score", op, {
      writingTasks: ["W1", "W2"].map((taskKey) => ({
        taskKey,
        criteria: { taskCompletion: 3, organization: 3, vocabulary: 2, grammar: 4, workplaceRegister: 3 },
      })),
      speakingTasks: ["S1", "S2", "S3", "S4"].map((taskKey) => ({
        taskKey,
        evidenceType: "audio",
        criteria: {
          taskCompletionRelevance: 3,
          grammarVocabulary: 4,
          coherenceClarity: 3,
          interactionProfessionalRegister: 2,
        },
      })),
      comment: "Reviewed actual delivered tasks.",
    });
    expect(graded.statusCode, graded.body).toBe(200);
  }, 45_000);
  it("rejects a retake copied from the learner's original and leaves the one-use grant unconsumed", async () => {
    const learner = DEMO_IDS.learner,
      formId = randomUUID(),
      versionId = randomUUID();
    await pool.query(
      "insert into assessment_definitions(id,organization_id,assessment_key,kind,title) values($1,$2,'placement-retake','placement','Retake')",
      [formId, DEMO_IDS.organization],
    );
    const copied = { ...placementDefinition, key: "placement-retake" };
    await pool.query(
      "insert into assessment_versions(id,definition_id,version,status,blueprint,published_at) values($1,$2,1,'published',$3,now())",
      [versionId, formId, copied],
    );
    await pool.query(
      "insert into assessment_retake_grants(id,organization_id,learner_id,source_attempt_id,kind,reason,granted_by) values($1,$2,$3,$4,'placement','Retry',$5)",
      [randomUUID(), DEMO_IDS.organization, learner, DEMO_IDS.placementAttempt, DEMO_IDS.operator],
    );
    await expect(startBankAttempt(pool, learner, "retake", 3, null)).rejects.toMatchObject({
      code: "PLACEMENT_RETAKE_COPY",
    });
    const grant = await pool.query(
      "select used_at,retake_attempt_id from assessment_retake_grants where learner_id=$1",
      [learner],
    );
    expect(grant.rows[0]).toEqual({ used_at: null, retake_attempt_id: null });
  });
  it("starts a new eligible attempt at the same promotion level and resumes it on a repeated start", async () => {
    const formId = randomUUID(),
      versionId = randomUUID(),
      previousId = randomUUID();
    const blueprint = { ...placementDefinition, key: "level-up-b2", kind: "level-up", targetLevel: "B2" };
    await pool.query(
      "insert into assessment_definitions(id,organization_id,assessment_key,kind,title) values($1,$2,'level-up-b2','level_up','Retry')",
      [formId, DEMO_IDS.organization],
    );
    await pool.query(
      "insert into assessment_versions(id,definition_id,version,status,blueprint,published_at) values($1,$2,1,'published',$3,now())",
      [versionId, formId, blueprint],
    );
    await pool.query(
      "insert into assessment_attempts(id,learner_id,assessment_version_id,status) values($1,$2,$3,'needs_retry')",
      [previousId, learnerId, versionId],
    );
    await pool.query(
      "insert into level_up_retry_plans(id,assessment_attempt_id,learner_id,eligible_at,weakest_skill,readiness_snapshot) values($1,$2,$3,now()-interval '1 day','reading','{}')",
      [randomUUID(), previousId, learnerId],
    );
    expect((await bankPreparation(pool, learnerId, "B2"))?.versionId).toBe(versionId);
    const [first, again] = await Promise.all([1, 2].map(() => startBankAttempt(pool, learnerId, "B2", 3, null)));
    expect(first).not.toBe(previousId);
    expect(first).toBe(again);
  });
  it("generates a complete Pass Course draft using exact rubric slots and keeps missing synthesis visible", async () => {
    const generationCounts = new Map<string,number>();
    const appWithRunner = buildApi({
      pool,
      allowDemoLogin: true,
      secureCookies: false,
      aiRunner: {
        runTask: async (taskId, raw) => {
          expect(taskId).toBe("assessment_bank_group_generation");
          const input = raw as {
            group: string;
            contextType: string;
            taskSlots: Array<{ key: string; response: string }>;
          };
          const call = (generationCounts.get(input.group) ?? 0) + 1;
          generationCounts.set(input.group,call);
          const slots = input.taskSlots[0]!.key === "L1" && call === 1 ? input.taskSlots.slice(1) : input.taskSlots;
          return {
            metadata: {
              traceId: "bank-test",
              taskId,
              provider: "fixture",
              model: "fixture",
              attempts: 1,
              latencyMs: 1,
              inputHash: "a".repeat(64),
              schemaValid: true,
              usage: {},
            },
            output: {
              title: input.group,
              instruction: "Complete this workplace scenario.",
              text: "Use the revised quarterly schedule.",
              lines: [
                { speaker: "Mina", text: "Can we start at ten?" },
                { speaker: "Omar", text: "Yes, the room is booked." },
              ],
              headers: ["Quarter", "Sales"],
              rows: [["Q1", "34"]],
              tasks: slots.map((t,i) => ({
                key: "Q" + (i+1),
                prompt: "Respond to scenario " + t.key + ".",
                options: t.response === "single_choice" ? ["Alpha", "Bravo", "Charlie", "Delta"] : [],
                correctIndex: t.response === "single_choice" ? 1 : -1,
              })),
            },
          };
        },
      },
    });
    try {
      const response = await appWithRunner.inject({
        method: "POST",
        url: "/api/v1/assessment-banks/pass_course/forms",
        headers: { cookie: op },
        payload: { method: "ai" },
      });
      expect(response.statusCode, response.body).toBe(201);
      const form = response.json<AssessmentBankFormDetail>();
      expect(form).toMatchObject({
        status: "draft",
        audioConfigured: false,
        blueprint: { kind: "pass-course", totalMinutes: 90, totalScore: 100 },
      });
      expect(form.blueprint.sections.map((s) => s.groups.reduce((n, g) => n + g.tasks.length, 0))).toEqual([
        15, 40, 2, 4,
      ]);
      expect([...generationCounts.values()].filter(count=>count===2)).toHaveLength(1);
      expect(form.blueprint.sections[0]!.groups[0]!.tasks.map(t=>t.key)).toEqual(["L1","L2","L3","L4","L5"]);
      expect(form.blueprint.sections[0]!.groups[0]!.stimulus?.audioSynthesis?.status).toBe("failed");
      const validation = await request(
        "POST",
        "/api/v1/assessment-banks/pass_course/forms/" + form.versionId + "/validate",
        op,
        {},
      );
      expect(validation.json().issues).toHaveLength(3);
    } finally {
      await appWithRunner.close();
    }
  });
  it("retains the exact uploaded source after archive and refuses aliases or deleted files",async()=>{
    const mediaId=randomUUID(), objectKey="content-media/"+DEMO_IDS.operator+"/"+mediaId+".mp3";
    const url="/api/v1/files/content-media/read?artifactKey="+encodeURIComponent(objectKey);
    await pool.query("insert into files(id,organization_id,owner_user_id,purpose,bucket,object_key,mime_type,size_bytes,sha256) values($1,$2,$3,'content_media','e4s-evidence',$4,'audio/mpeg',123,'fixture')",[mediaId,DEMO_IDS.organization,DEMO_IDS.operator,objectKey]);
    const original=(await request("GET",base+"/forms/"+DEMO_IDS.placementVersion,op)).json<AssessmentBankFormDetail>();
    const b=original.blueprint;
    b.sections[0]!.groups[0]!.stimulus!.audioSrc=url+"&v=1";
    const fork=await request("PUT",base+"/forms/"+original.versionId,op,{blueprint:b});
    expect(fork.statusCode,fork.body).toBe(200);
    const path=base+"/forms/"+fork.json().versionId;
    expect((await request("POST",path+"/publish",op,{answersReviewed:true})).statusCode).toBe(422);
    b.sections[0]!.groups[0]!.stimulus!.audioSrc=url;
    expect((await request("PUT",path,op,{blueprint:b})).statusCode).toBe(200);
    await pool.query("update files set deleted_at=now() where id=$1",[mediaId]);
    expect((await request("POST",path+"/publish",op,{answersReviewed:true})).statusCode).toBe(422);
    await pool.query("update files set deleted_at=null where id=$1",[mediaId]);
    expect((await request("POST",path+"/publish",op,{answersReviewed:true})).statusCode).toBe(200);
    expect((await request("POST",path+"/archive",op,{})).statusCode).toBe(200);
    await expect(pool.query("update files set deleted_at=now() where id=$1",[mediaId])).rejects.toThrow("ASSESSMENT_AUDIO_RETAINED");
    await expect(pool.query("delete from files where id=$1",[mediaId])).rejects.toMatchObject({code:"23503"});
  });

  it("deletes only explicitly archived unused forms, keeps files, and rejects manager and foreign mutations", async () => {
    const mediaId = randomUUID(), objectKey = "content-media/" + DEMO_IDS.operator + "/" + mediaId + ".mp3";
    await pool.query("insert into files(id,organization_id,owner_user_id,purpose,bucket,object_key,mime_type,size_bytes,sha256) values($1,$2,$3,'content_media','e4s-evidence',$4,'audio/mpeg',123,'fixture')", [mediaId, DEMO_IDS.organization, DEMO_IDS.operator, objectKey]);
    const blueprint = structuredClone(placementDefinition);
    blueprint.sections[0]!.groups[0]!.stimulus!.audioSrc = "/api/v1/files/content-media/read?artifactKey=" + encodeURIComponent(objectKey);
    const created = await request("PUT", base + "/forms/" + DEMO_IDS.placementVersion, op, { blueprint });
    const id = created.json().versionId, path = base + "/forms/" + id;
    expect((await request("DELETE", path, op)).statusCode).toBe(409);
    expect((await request("POST", path + "/publish", op, { answersReviewed: true })).statusCode).toBe(200);
    expect((await pool.query("select 1 from assessment_version_audio where version_id=$1 and file_id=$2", [id, mediaId])).rowCount).toBe(1);
    await expect(pool.query("update assessment_versions set blueprint='{}' where id=$1", [id])).rejects.toThrow("ASSESSMENT_BANK_VERSION_IN_USE");
    expect((await request("POST", path + "/archive", op, {})).statusCode).toBe(200);
    expect((await request("GET", path, op)).json()).toMatchObject({ canDelete: true, deleteReason: null });
    expect((await request("DELETE", path, manager)).statusCode).toBe(403);
    expect((await request("DELETE", base + "/forms/" + foreignId, op)).statusCode).toBe(404);
    const filesBefore = (await pool.query("select id,deleted_at from files order by id")).rows;
    expect((await request("DELETE", path, op)).json()).toEqual({ deleted: true, versionId: id });
    expect((await request("GET", path, op)).statusCode).toBe(404);
    expect((await pool.query("select 1 from assessment_version_audio where version_id=$1", [id])).rowCount).toBe(0);
    expect((await pool.query("select id,deleted_at from files order by id")).rows).toEqual(filesBefore);
    expect((await pool.query("select action from audit_events where entity_id=$1", [id])).rows).toEqual([{ action: "assessment.bank-form.deleted" }]);
    expect(removedObjects).toEqual([]);
  });

  it("protects direct attempts, normalized sources, manifest-only provenance and configured policy without changing history", async () => {
    for (const reference of ["direct", "source", "manifest", "anchor", "policy"] as const) {
      const created = await request("PUT", base + "/forms/" + DEMO_IDS.placementVersion, op, { blueprint: placementDefinition });
      const id = created.json().versionId, path = base + "/forms/" + id;
      expect((await request("POST", path + "/publish", op, { answersReviewed: true })).statusCode).toBe(200);
      expect((await request("POST", path + "/archive", op, {})).statusCode).toBe(200);
      const attempt = randomUUID();
      if (reference === "policy") {
        await pool.query("insert into assessment_bank_policy_sources(organization_id,scope,position,version_id) values($1,'placement',99,$2)", [DEMO_IDS.organization, id]);
      } else {
        await pool.query("insert into assessment_attempts(id,assessment_version_id,learner_id,status) values($1,$2,$3,'approved')", [attempt, reference === "direct" ? id : DEMO_IDS.placementVersion, learnerId]);
        await pool.query("insert into assessment_scores(id,attempt_id,section,score,criteria,source) values($1,$2,'reading',40,'{}','deterministic')", [randomUUID(), attempt]);
        if (reference !== "direct") {
          await pool.query("insert into assessment_bank_attempts(attempt_id,scope,manifest) values($1,'placement',$2)", [attempt, { format: 1, anchor: reference === "anchor" ? id : DEMO_IDS.placementVersion, groups: reference === "anchor" ? [] : [{ versionId: id, section: 0, group: 0 }] }]);
          if (reference === "source") await pool.query("insert into assessment_bank_attempt_sources values($1,$2)", [attempt, id]);
        }
      }
      const before = (await pool.query("select * from assessment_bank_attempts order by attempt_id")).rows;
      const form = (await request("GET", path, op)).json();
      expect(form).toMatchObject({ canDelete: false });
      expect(form.deleteReason).toBeTruthy();
      const denied = await request("DELETE", path, op);
      expect(denied.statusCode, denied.body).toBe(409);
      expect(denied.json().code).toBe(reference === "policy" ? "ASSESSMENT_BANK_SOURCE_CONFIGURED" : "ASSESSMENT_BANK_FORM_USED");
      await expect(pool.query("delete from assessment_versions where id=$1", [id])).rejects.toThrow("ASSESSMENT_BANK_VERSION_IN_USE");
      expect((await request("GET", path, op)).json().blueprint).toEqual(placementDefinition);
      expect((await pool.query("select * from assessment_bank_attempts order by attempt_id")).rows).toEqual(before);
      if (reference !== "policy") {
        expect((await pool.query("select status from assessment_attempts where id=$1", [attempt])).rows).toEqual([{ status: "approved" }]);
        expect((await pool.query("select section,score from assessment_scores where attempt_id=$1", [attempt])).rows).toEqual([{ section: "reading", score: "40.00" }]);
      }
    }
  });
});
