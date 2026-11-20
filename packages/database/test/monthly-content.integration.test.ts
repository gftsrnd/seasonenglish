import { buildMonthlyCalendar, buildMonthlyCurriculum, type MonthlyCurriculumInput } from "@e4s/domain";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { MonthlyContentRepository } from "../src/monthly-content-repository.js";
import { createRepositories } from "../src/repositories.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const month = "2026-11";

describe("monthly content persistence", () => {
  const client = new Client({ connectionString: databaseUrl });
  // Production builds the repository on a Pool; its transactions check out their own connection.
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new MonthlyContentRepository(pool);

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client);
  }, 30_000);

  afterAll(async () => { await client.end(); await pool.end(); });

  it("persists one shared brief, materializes immutable day specs, and leaves the first ten days pending", async () => {
    const brief = await repository.saveBrief(DEMO_IDS.operator, {
      month,
      title: "Preparing a quarterly budget review",
      brief: "Teams prepare and explain a quarterly budget review.",
      context: "Finance team planning meeting",
      communicationGoal: "Explain costs and request approval"
    });
    expect(brief).toMatchObject({ month, version: 1, status: "draft" });
    await repository.approveBrief(DEMO_IDS.operator, month);
    await expect(repository.saveBrief(DEMO_IDS.operator, { month, title: "Changed", brief: "Changed", context: "Changed", communicationGoal: "Changed" })).rejects.toThrow(/approved/i);

    const framework = await repository.saveFramework(DEMO_IDS.operator, buildContract());
    expect(framework).toMatchObject({ cefr: "A1", version: 1, status: "draft" });

    const overview = await repository.getOverview(DEMO_IDS.operator, month);
    expect(overview.brief).toMatchObject({ title: "Preparing a quarterly budget review", version: 1 });
    expect(overview.frameworks[0]?.lessons).toHaveLength(buildMonthlyCalendar(month).lessonCount);
    expect(overview.frameworks[0]?.lessons.slice(0, 10).map((lesson) => lesson.status)).toEqual(Array(10).fill("pending"));
    expect(await repository.recommendedBatch(DEMO_IDS.operator, framework.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("durably merges validated resource category checkpoints without creating a framework", async () => {
    await repository.saveBrief(DEMO_IDS.operator, {
      month,
      title: "Preparing a quarterly budget review",
      brief: "Teams prepare and explain a quarterly budget review.",
      context: "Finance team planning meeting",
      communicationGoal: "Explain costs and request approval"
    }).catch(() => undefined);
    const checkpointInput = {
      month,
      cefr: "A2" as const,
      briefVersion: 1,
      generationId: "f2910ee2-e2bc-49a9-a611-bbb5cafbdb62",
      sourceLineage: { coreTerms: { schemaVersion: "monthly-resource-category-v1", promptKey: "monthly_resource_generation" } }
    };
    const first = await repository.saveResourceGenerationCheckpoint(DEMO_IDS.operator, {
      ...checkpointInput,
      categories: { coreTerms: [{ id: "a2-core-1", word: "budget" }] }
    });
    const second = await repository.saveResourceGenerationCheckpoint(DEMO_IDS.operator, {
      ...checkpointInput,
      categories: { expandedTerms: [{ id: "a2-expanded-1", word: "forecast", relatesToCoreId: "a2-core-1" }] },
      sourceLineage: { expandedTerms: { schemaVersion: "monthly-resource-category-v1", promptKey: "monthly_resource_generation" } }
    });

    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
    expect(second.categories).toEqual({
      coreTerms: [{ id: "a2-core-1", word: "budget" }],
      expandedTerms: [{ id: "a2-expanded-1", word: "forecast", relatesToCoreId: "a2-core-1" }]
    });
    expect(await repository.getResourceGenerationCheckpoint(DEMO_IDS.operator, month, "A2")).toMatchObject({ generationId: checkpointInput.generationId, version: 2 });
    const framework = await client.query("select id from month_frameworks where cefr = 'A2'");
    expect(framework.rows).toHaveLength(0);
  });

  it("allows game sets to belong to a monthly learning cycle", async () => {
    const column = await client.query(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'game_sets' and column_name = 'program_month_id'"
    );
    expect(column.rows).toHaveLength(1);
  });

  it("rejects framework replacement after approval and records the approval", async () => {
    const framework = (await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]!;
    await repository.approveFramework(DEMO_IDS.operator, framework.id);
    await expect(repository.saveFramework(DEMO_IDS.operator, buildContract())).rejects.toThrow(/approved framework/i);

    const audit = await client.query<{ action: string; entity_id: string }>(
      "select action, entity_id from audit_events where entity_id = $1 order by created_at",
      [framework.id]
    );
    expect(audit.rows).toEqual(expect.arrayContaining([
      { action: "monthly.framework_approved", entity_id: framework.id }
    ]));
  });

  it("requires acknowledgement for each light finding and keeps approved day versions immutable", async () => {
    const framework = (await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]!;
    const report = {
      contractVersion: framework.version,
      severe: [],
      light: [{ severity: "light" as const, code: "MONTHLY_SYNONYM_OR_ANTONYM_MISSING", message: "Missing a lexical relation", dayNumber: 1, component: "vocabulary" }]
    };
    await repository.saveMonthlyDayDraft(DEMO_IDS.operator, framework.id, 1, { title: "Budget words", parts: [] }, report);
    await expect(repository.approveMonthlyDay(DEMO_IDS.operator, framework.id, 1)).rejects.toThrow(/xác nhận từng cảnh báo/i);
    await repository.acknowledgeMonthlyDayQuality(DEMO_IDS.operator, framework.id, 1, ["MONTHLY_SYNONYM_OR_ANTONYM_MISSING:1:vocabulary"]);
    await repository.approveMonthlyDay(DEMO_IDS.operator, framework.id, 1);

    await expect(repository.saveMonthlyDayDraft(DEMO_IDS.operator, framework.id, 1, { title: "Replacement", parts: [] }, report)).rejects.toThrow(/đã được duyệt nên đang khoá/i);
    const correctionId = await repository.createMonthlyCorrection(DEMO_IDS.operator, framework.id, 1, "Fix an approved example");
    await repository.decideReopenRequest(DEMO_IDS.manager, correctionId, "approved", "The correction is required and learners will be notified.");
    await repository.saveMonthlyCorrection(DEMO_IDS.operator, correctionId, { title: "Corrected budget words", parts: [] }, { severe: [], light: [], contractVersion: framework.version });
    await repository.approveMonthlyCorrection(DEMO_IDS.operator, correctionId);
    const correction = await client.query<{ status: string; original_lesson_version_id: string; correction_lesson_version_id: string }>(
      "select status, original_lesson_version_id, correction_lesson_version_id from month_lesson_corrections where id = $1",
      [correctionId]
    );
    expect(correction.rows[0]).toMatchObject({ status: "published" });
    expect(correction.rows[0]?.correction_lesson_version_id).not.toBe(correction.rows[0]?.original_lesson_version_id);
    const overview = await repository.getOverview(DEMO_IDS.operator, month);
    expect(overview.frameworks[0]?.lessons[0]).toMatchObject({ status: "approved", locked: true, correctionCount: 1 });
  });

  it("caps light findings per lesson, not summed over the month", async () => {
    const framework = (await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]!;
    const light = (dayNumber: number, count: number) => Array.from({ length: count }, (_, index) => ({
      severity: "light" as const, code: `MONTHLY_TEST_LIGHT_${index}`, message: `Light finding ${index}`, dayNumber, component: "reading"
    }));
    // Days 2 and 3 carry two light findings each: four for the month, still approvable one lesson at a time.
    for (const dayNumber of [2, 3]) {
      await repository.saveMonthlyDayDraft(DEMO_IDS.operator, framework.id, dayNumber, { title: `Day ${dayNumber}`, parts: [] },
        { contractVersion: framework.version, severe: [], light: light(dayNumber, 2) });
      await repository.acknowledgeMonthlyDayQuality(DEMO_IDS.operator, framework.id, dayNumber, [0, 1].map((index) => `MONTHLY_TEST_LIGHT_${index}:${dayNumber}:reading`));
      await repository.approveMonthlyDay(DEMO_IDS.operator, framework.id, dayNumber);
    }
    // A lesson with three light findings is still blocked.
    await repository.saveMonthlyDayDraft(DEMO_IDS.operator, framework.id, 4, { title: "Day 4", parts: [] },
      { contractVersion: framework.version, severe: [], light: light(4, 3) });
    const keys = [0, 1, 2].map((index) => `MONTHLY_TEST_LIGHT_${index}:4:reading`);
    await expect(repository.acknowledgeMonthlyDayQuality(DEMO_IDS.operator, framework.id, 4, keys)).rejects.toThrow(/two-light/i);
    await expect(repository.approveMonthlyDay(DEMO_IDS.operator, framework.id, 4)).rejects.toThrow(/quá hai cảnh báo/i);
    const overview = await repository.getOverview(DEMO_IDS.operator, month);
    expect(overview.frameworks[0]?.lessons.filter((lesson) => [2, 3].includes(lesson.lessonNumber)).map((lesson) => lesson.status)).toEqual(["approved", "approved"]);
  });

  it("makes only approved monthly lessons at the learner's CEFR available to the learner", async () => {
    await client.query("update enrollments set cefr = 'A1' where learner_id = $1", [DEMO_IDS.learner]);
    // Learners only see a published month, and publication needs the three lessons from "today" approved.
    const framework = (await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]!;
    await client.query(
      `insert into organization_settings (organization_id, configuration) values ($1, jsonb_build_object('simulatedSystemDate', $2::text))
       on conflict (organization_id) do update set configuration = organization_settings.configuration || excluded.configuration`,
      [DEMO_IDS.organization, framework.lessons[0]!.lessonDate]
    );
    await repository.publishMonth(DEMO_IDS.operator, framework.id);
    const lessons = await createRepositories(client as unknown as Pool).learning.listMonthlyLessons(DEMO_IDS.learner, month);

    // Days 1–3 are approved; day 4 is still blocked by its light findings.
    expect(lessons.map((lesson) => lesson.dayNumber)).toEqual([1, 2, 3]);
    expect(lessons[0]).toMatchObject({ dayNumber: 1, weekNumber: 0, cefr: "A1", weekTopic: "Preparing a quarterly budget review" });
  });

  it("retires invalid released resources without deleting immutable lesson history, then permits a new draft", async () => {
    const original = (await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]!;
    await repository.retireFramework(DEMO_IDS.manager, original.id, "The released local fixture contains placeholder vocabulary and must not reach learners.");

    const hidden = await repository.getOverview(DEMO_IDS.operator, month);
    expect(hidden.frameworks).toEqual([]);
    expect(await createRepositories(client as unknown as Pool).learning.listMonthlyLessons(DEMO_IDS.learner, month)).toEqual([]);

    const immutableHistory = await client.query<{ status: string }>(
      `select lsv.status from lesson_set_versions lsv
       join lesson_sets ls on ls.id = lsv.lesson_set_id
       where ls.month_framework_id = $1 and lsv.status = 'published'`,
      [original.id]
    );
    expect(immutableHistory.rows.length).toBeGreaterThan(0);

    const nextBrief = await repository.saveBrief(DEMO_IDS.operator, {
      month,
      title: "Preparing a quarterly budget review, revised",
      brief: "Teams prepare and explain a quarterly budget review with verified resources.",
      context: "Finance team planning meeting",
      communicationGoal: "Explain costs and request approval"
    });
    expect(nextBrief).toMatchObject({ status: "draft", version: 2 });
    await repository.approveBrief(DEMO_IDS.operator, month);
    const replacement = await repository.saveFramework(DEMO_IDS.operator, {
      ...buildContract(),
      theme: { ...buildContract().theme, version: 2, title: nextBrief.title, brief: nextBrief.brief }
    });
    expect(replacement.id).not.toBe(original.id);

    const audit = await client.query<{ action: string }>("select action from audit_events where entity_id = $1", [original.id]);
    expect(audit.rows).toContainEqual({ action: "monthly.framework_retired" });
  });

  it("lets a Manager reopen approved monthly resources on an Operator request and the Operator re-approve them", async () => {
    const draft = (await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]!;
    await repository.approveFramework(DEMO_IDS.operator, draft.id);
    const approved = (await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]!;
    expect(approved).toMatchObject({ status: "approved", reopenRequest: null });
    const lessonCount = approved.lessons.length;
    expect(lessonCount).toBeGreaterThan(0);

    // Only one open request per framework.
    const first = await repository.requestFrameworkReopen(DEMO_IDS.operator, approved.id, "The allocation needs new skill exercises.");
    expect(first).toMatchObject({ status: "pending", frameworkVersion: approved.version });
    await expect(repository.requestFrameworkReopen(DEMO_IDS.operator, approved.id, "Second request")).rejects.toMatchObject({ statusCode: 409, code: "MONTHLY_RESOURCE_REOPEN_PENDING" });
    expect((await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]?.reopenRequest).toMatchObject({ id: first.id, status: "pending" });

    const queue = await repository.listReopenRequests(DEMO_IDS.manager);
    expect(queue).toContainEqual(expect.objectContaining({
      id: first.id, target: "monthly_resources", targetId: approved.id, status: "pending",
      monthlyResources: expect.objectContaining({ month, cefr: "A1", frameworkVersion: approved.version, lessonCount, lessonsWithContent: 0, removedLessonCount: null })
    }));
    // Existing daily-lesson requests are still listed next to the new target.
    expect(queue.some((request) => request.target === "daily_lesson")).toBe(true);
    expect(await repository.isFrameworkReopenRequest(DEMO_IDS.manager, first.id)).toBe(true);
    expect(await repository.isFrameworkReopenRequest(DEMO_IDS.manager, "00000000-0000-4000-8000-000000000000")).toBe(false);

    // Rejection keeps the resources locked and allows a new request.
    const rejected = await repository.decideFrameworkReopenRequest(DEMO_IDS.manager, first.id, "rejected", "Keep the current plan.");
    expect(rejected).toMatchObject({ status: "rejected", decisionReason: "Keep the current plan." });
    expect((await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]).toMatchObject({ status: "approved", version: approved.version });
    await expect(repository.decideFrameworkReopenRequest(DEMO_IDS.manager, first.id, "approved", "Too late")).rejects.toMatchObject({ statusCode: 409, code: "REOPEN_REQUEST_NOT_PENDING" });

    const second = await repository.requestFrameworkReopen(DEMO_IDS.operator, approved.id, "The allocation still needs skill exercises.");
    const reopened = await repository.decideFrameworkReopenRequest(DEMO_IDS.manager, second.id, "approved", "Reopen to re-plan the month.");
    expect(reopened).toMatchObject({ status: "approved", monthlyResources: expect.objectContaining({ removedLessonCount: lessonCount, lessonCount: 0 }) });

    const stored = await client.query<{ status: string; version: number; approved_by: string | null; approved_at: Date | null; curriculum_contract: Record<string, unknown>; scope_hash: string }>(
      "select status, version, approved_by, approved_at, curriculum_contract, scope_hash from month_frameworks where id = $1", [approved.id]
    );
    expect(stored.rows[0]).toMatchObject({ status: "draft", version: approved.version + 1, approved_by: null, approved_at: null });
    expect(stored.rows[0]?.curriculum_contract).not.toHaveProperty("daySpecs");
    expect(stored.rows[0]?.curriculum_contract).toMatchObject({ version: approved.version + 1 });
    expect((stored.rows[0]?.curriculum_contract.coreTerms as unknown[]).length).toBe(approved.resources!.coreTerms.length);
    expect((stored.rows[0]?.curriculum_contract.supportTerms as unknown[]).length).toBe(approved.resources!.supportTerms.length);
    expect(stored.rows[0]?.scope_hash).toMatch(/^monthly-pool-/u);
    const lessons = await client.query("select id from month_lessons where framework_id = $1", [approved.id]);
    expect(lessons.rows).toHaveLength(0);
    const audit = await client.query<{ action: string }>("select action from audit_events where entity_id = $1", [approved.id]);
    expect(audit.rows).toEqual(expect.arrayContaining([
      { action: "monthly.framework_reopen_requested" }, { action: "monthly.framework_reopen_rejected" }, { action: "monthly.framework_reopened" }
    ]));

    // The normal approval flow re-plans the pool and materializes fresh lesson rows.
    await repository.approveFramework(DEMO_IDS.operator, approved.id);
    const reapproved = (await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]!;
    expect(reapproved).toMatchObject({ status: "approved", version: approved.version + 1, reopenRequest: expect.objectContaining({ id: second.id, status: "approved" }) });
    expect(reapproved.lessons).toHaveLength(lessonCount);
    expect(reapproved.lessons.every((lesson) => lesson.status === "pending")).toBe(true);
  });
});

// Real standalone headwords, real example IPA that contains each target cluster and two
// explicit daily objectives per grammar step: what the current curriculum and approval rules require.
const CORE_WORDS = [
  "deadline", "draft", "client", "feedback", "budget", "delay", "supplier", "delivery", "progress", "priority", "reschedule", "available",
  "confirm", "agenda", "colleague", "online", "allocate", "attach", "book", "cancel", "clarify", "collect", "compare", "complete",
  "contact", "discuss", "estimate", "explain", "prepare", "print", "reduce", "remind", "repair", "replace", "request", "share",
  "accurate", "brief", "update", "report", "data", "missing", "extend", "approval", "propose", "alternative", "suitable", "confirmation"
];
const SOUNDS: Array<{ ipa: string; examples: Array<[string, string]> }> = [
  { ipa: "/nt/", examples: [["client", "/ˈklaɪənt/"], ["rent", "/rent/"], ["want", "/wɒnt/"], ["paint", "/peɪnt/"], ["sent", "/sent/"], ["tent", "/tent/"], ["point", "/pɔɪnt/"], ["count", "/kaʊnt/"], ["print", "/prɪnt/"]] },
  { ipa: "/ks/", examples: [["tasks", "/tɑːsks/"], ["desks", "/desks/"], ["risks", "/rɪsks/"], ["asks", "/ɑːsks/"], ["masks", "/mɑːsks/"], ["disks", "/dɪsks/"], ["kiosks", "/ˈkiːɒsks/"], ["flasks", "/flɑːsks/"], ["husks", "/hʌsks/"]] },
  { ipa: "/st/", examples: [["list", "/lɪst/"], ["cost", "/kɒst/"], ["last", "/lɑːst/"], ["first", "/fɜːst/"], ["most", "/məʊst/"], ["past", "/pɑːst/"], ["test", "/test/"], ["rest", "/rest/"], ["best", "/best/"]] },
  { ipa: "/ld/", examples: [["hold", "/həʊld/"], ["old", "/əʊld/"], ["told", "/təʊld/"], ["cold", "/kəʊld/"], ["fold", "/fəʊld/"], ["gold", "/gəʊld/"], ["sold", "/səʊld/"], ["bold", "/bəʊld/"], ["mild", "/maɪld/"]] }
];
const GRAMMAR_STEPS = [
  [["Polite requests", "Could you (please) + V?", ["Could you send it?", "Could you check it?", "Could you call me?"]],
    ["Obligation with have to", "have to / need to + V", ["I have to wait.", "We need to check.", "You have to sign."]],
    ["Advice with should", "should + V", ["You should ask.", "We should start.", "They should wait."]]],
  [["Real conditions", "If + present simple, will + V", ["If it rains, we will stay.", "If you call, I will answer.", "If they agree, we will start."]],
    ["Unreal conditions", "If + past simple, would + V", ["If I had time, I would help.", "If we knew, we would say.", "If she came, we would meet."]],
    ["Wishes about now", "I wish + past simple", ["I wish I had more time.", "I wish it was ready.", "I wish we knew."]]]
] as const;

function buildContract() {
  const letters = "abcdef";
  const input: MonthlyCurriculumInput = {
    month,
    cefr: "A1",
    theme: { version: 1, title: "Preparing a quarterly budget review", brief: "Teams prepare and explain a quarterly budget review.", context: "Finance team planning meeting", communicationGoal: "Explain costs and request approval" },
    coreTerms: CORE_WORDS.map((word, index) => ({ id: `core-${index}`, word, meaning: `nghĩa ${word}`, type: "noun", ipa: "/x/" })),
    supportTerms: CORE_WORDS.flatMap((word, coreIndex) => Array.from({ length: 6 }, (_, index) => ({
      id: `support-${coreIndex}-${index}`, word: `${word}${letters[index]}`, meaning: "nghĩa mở rộng", type: "noun",
      relation: (["umbrella", "synonym", "word_family"] as const)[index % 3]!, source: "family" as const, dayNumber: 1, relatedCoreTermId: `core-${coreIndex}`
    }))),
    grammarTopics: GRAMMAR_STEPS.map((steps, topicIndex) => ({
      id: `grammar-${topicIndex + 1}`, title: `Grammar ${topicIndex + 1}`,
      steps: steps.map(([focus, formula, examples], stepIndex) => ({
        id: `grammar-${topicIndex + 1}-step-${stepIndex + 1}`, focus, formula, usage: `Use ${focus.toLowerCase()} at work.`, examples: [...examples],
        dailyObjectives: [`Recognise ${focus.toLowerCase()} in a short message.`, `Use ${focus.toLowerCase()} in one work sentence.`]
      }))
    })),
    sounds: SOUNDS.map((sound, index) => ({ id: `sound-${index + 1}`, ipa: sound.ipa, label: `Final cluster ${index + 1}`, examples: sound.examples.map(([word, ipa], example) => ({ id: `sound-${index + 1}-ex-${example}`, word, ipa })) }))
  };
  const contract = buildMonthlyCurriculum(input);
  const dayByCore = new Map(contract.coreTerms.map((term) => [term.id, term.dayNumber]));
  return { ...contract, supportTerms: contract.supportTerms.map((term) => ({ ...term, dayNumber: dayByCore.get(term.relatedCoreTermId)! })) };
}
