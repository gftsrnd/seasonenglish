import { monthlyPronunciationCatalog, MONTHLY_PRONUNCIATION_MEMORY_MONTHS, selectMonthlyPronunciationItems, MONTHLY_GRAMMAR_MEMORY_MONTHS, selectMonthlyGrammarPair, buildMonthlyCalendar, buildMonthlyExamScope, maxMonthlyPhrasePlacements, maxMonthlySupportRepeats, monthlyDayKind, monthlyScopeHash, MONTHLY_MAX_SUPPORTS_PER_CORE, MONTHLY_MIN_SUPPORTS_PER_CORE, hasRequiredMonthlySupportRelations, requiredSupportRelationsFor, type MonthlyCurriculumContract } from "@e4s/domain";
import { monthlyResourcePlanOutputSchema, monthlyTopicSuggestionOutputSchema, type AiTaskRunner } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import { MonthlyResourceProgressStore } from "./monthly-resource-progress.js";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import { evaluateMonthlyLessonQuality } from "./monthly-quality.js";
import { withLessonListeningAudio, type ListeningAudioService } from "../assessment/listening-audio.js";
import { generateMonthlyDayWithAi, generateMonthlyReviewWithAi, MONTHLY_DAY_COMPONENTS } from "./monthly-day-generation.js";
import { buildMonthlyCatalogPronunciationPrompt, getMonthlyPronunciationTextIssues, buildMonthlyOptionalSupportPrompt, buildMonthlyPronunciationSchemaRepairIssue, buildMonthlyResourcesFromAiPlan, buildMonthlySupportRelationAuditPrompt, buildMonthlySupportRelationCandidatePrompt, CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS, getMonthlyGrammarPhaseIssues, hasSingleCoreSense, isCurrentMonthlyResourceCheckpointCategory, isGenuineWordFamily, isSingleHeadword, keepExactMonthlySupportRelationCandidates, keepSemanticallyAuditedSupportCandidates, MonthlyResourceCriteriaError, MonthlyResourcePlanError, parseMonthlyResourceAiOutput, prefilterMonthlySupportCandidatesForAudit, runMonthlyGrammarPhaseWithRetry, screenCachedMonthlyCoreSupports, selectMonthlyPronunciationCandidates, selectMonthlySupportCandidates } from "./monthly-resource-generation.js";
import { MonthlyCorePhaseShortfallError, runMonthlyCorePhase } from "./monthly-core-phase.js";
import { runMonthlyEnrichmentWithRefill, type MonthlyCoreEnrichmentOutcome } from "./monthly-enrichment-phase.js";
import { buildMonthlyCrossLevelCoreExclusions, getMonthlyCoreLevelIssue } from "./monthly-resource-quality-gates.js";
import { safeGenerationDiagnosticIssues } from "./generation-errors.js";
import { monthlyGenerationFailure } from "./monthly-generation-errors.js";
import { repairMonthlyCoreIpa } from "./monthly-british-ipa.js";
import { verifyMonthlyWords } from "./monthly-word-verification.js";
import { applyMonthlyResourceEdit, blankMonthlyResourcePool, monthlyResourceEditInputSchema } from "./monthly-resource-manual-edit.js";

const params = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) });
const frameworkParams = z.object({ id: z.uuid() });
const dayParams = z.object({ id: z.uuid(), dayNumber: z.coerce.number().int().positive().max(31) });
const correctionParams = z.object({ correctionId: z.uuid() });
const briefInput = z.object({
  title: z.string().trim().min(1).max(200),
  brief: z.string().trim().min(1).max(4_000),
  context: z.string().trim().min(1).max(2_000),
  communicationGoal: z.string().trim().min(1).max(2_000)
});
const coreTerm = z.object({ id: z.string().min(1), word: z.string().min(1), meaning: z.string(), type: z.string().min(1), ipa: z.string().min(1), source: z.literal("core_registry"), component: z.literal("core"), dayNumber: z.int().positive() });
const supportTerm = z.object({ id: z.string().min(1), word: z.string().min(1), meaning: z.string(), type: z.string().min(1), relation: z.enum(["umbrella", "synonym", "antonym", "word_family", "collocation"]), source: z.enum(["example", "family", "synonym", "antonym", "group", "manual"]), component: z.literal("expanded"), dayNumber: z.int().positive(), relatedCoreTermId: z.string().min(1), cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]).optional(), definition: z.string().max(200).optional() });
export const frameworkInput = z.object({
  contract: z.object({
    planSchemaVersion: z.literal(2).optional(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u), cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]), version: z.int().positive(),
    theme: z.object({ version: z.int().positive(), title: z.string(), brief: z.string(), context: z.string(), communicationGoal: z.string() }),
    coreTerms: z.array(coreTerm), supportTerms: z.array(supportTerm),
    grammarTopics: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), steps: z.array(z.object({ id: z.string().min(1), focus: z.string(), formula: z.string().min(1), usage: z.string(), examples: z.array(z.string()), dailyObjectives: z.array(z.string()).length(2).optional() })).min(1), catalogId: z.string().min(1).optional() })),
    sounds: z.array(z.object({ id: z.string().min(1), ipa: z.string().min(1), label: z.string().min(1), examples: z.array(z.object({ id: z.string().min(1), word: z.string().min(1), ipa: z.string().min(1) })), catalogId: z.string().min(1).optional() })),
    daySpecs: z.array(z.object({ lessonNumber: z.int().positive(), date: z.string().date(), kind: z.enum(["new", "review"]), coreTermIds: z.array(z.string()), expandedTermIds: z.array(z.string()), reviewTermIds: z.array(z.string()), reviewExpandedTermIds: z.array(z.string()), skillExercises: z.array(z.object({ exerciseCode: z.enum(["listening", "reading", "writing", "word_class", "word_use", "speaking"]), focus: z.string().min(1), resourceIds: z.array(z.string()).min(1) })).length(6), grammarStepId: z.string().min(1), grammarStepIds: z.array(z.string()).optional(), soundId: z.string().min(1), pronunciationSlot: z.string().optional(), pronunciationExampleIds: z.array(z.string()) }).passthrough())
  })
});
const resourceCriteriaInput = z.object({
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  vocabularyCount: z.coerce.number().int().min(0).max(89),
  // Expanded vocabulary can carry several relationships for each core term.
  // A full weekday month at C1 stays below this upper bound.
  expandedVocabularyCount: z.coerce.number().int().min(0).max(500),
  grammarTopicCount: z.coerce.number().int().min(1).max(12),
  pronunciationSoundCount: z.coerce.number().int().min(1).max(12)
});
const resourceCheckpointQuery = z.object({ cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]) });
const lessonInput = z.object({
  title: z.string().trim().min(1).max(200),
  parts: z.array(z.object({ code: z.enum(MONTHLY_DAY_COMPONENTS), title: z.string().optional(), content: z.record(z.string(), z.unknown()) }))
});
const qualityAcknowledgementInput = z.object({ findingKeys: z.array(z.string().min(1)).max(2) });
const correctionInput = z.object({ reason: z.string().trim().min(5).max(1000) });
const retireFrameworkInput = z.object({ reason: z.string().trim().min(10).max(1000) });
const reopenDecisionInput = z.object({ reason: z.string().trim().min(5).max(1000) });

/** Monthly routes deliberately live outside routes.ts: monthly contracts are not weeks. */
export function registerMonthlyContentRoutes(app: FastifyInstance, pool: Pool, aiRunner?: AiTaskRunner, aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>, listeningAudio?: ListeningAudioService): void {
  const repositories = createRepositories(pool);
  const runnerFor = (actorId: string) => aiRunnerFactory ? aiRunnerFactory(actorId) : Promise.resolve(aiRunner);
  const resourceProgress = new MonthlyResourceProgressStore();
  const readers = createRoleGuard(pool, ["operator", "manager"]);
  const contentOperator = createRoleGuard(pool, ["operator"]);
  const manager = createRoleGuard(pool, ["manager"]);

  app.get("/api/v1/manager/reopen-requests", { preHandler: manager }, async (request) => {
    return { requests: await repositories.monthlyContent.listReopenRequests(request.e4sSession!.user.id) };
  });
  app.get("/api/v1/manager/content-retention-plan", { preHandler: manager }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    return repositories.monthlyContent.planExpiredContentRetention(request.e4sSession!.user.id);
  });

  // One decision endpoint pair for every monthly reopen request: a request id
  // names either a lesson correction or a monthly-resources reopen request.
  const decideReopen = async (managerId: string, requestId: string, decision: "approved" | "rejected", reason: string) => {
    if (await repositories.monthlyContent.isFrameworkReopenRequest(managerId, requestId)) {
      return repositories.monthlyContent.decideFrameworkReopenRequest(managerId, requestId, decision, reason);
    }
    return repositories.monthlyContent.decideReopenRequest(managerId, requestId, decision, reason);
  };

  app.post("/api/v1/manager/reopen-requests/:correctionId/approve", { preHandler: manager }, async (request) => {
    const { correctionId } = correctionParams.parse(request.params);
    const input = reopenDecisionInput.parse(request.body);
    return decideReopen(request.e4sSession!.user.id, correctionId, "approved", input.reason);
  });

  app.post("/api/v1/manager/reopen-requests/:correctionId/reject", { preHandler: manager }, async (request) => {
    const { correctionId } = correctionParams.parse(request.params);
    const input = reopenDecisionInput.parse(request.body);
    return decideReopen(request.e4sSession!.user.id, correctionId, "rejected", input.reason);
  });

  app.get("/api/v1/content/reopen-requests", { preHandler: contentOperator }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    return { requests: await repositories.monthlyContent.listOwnReopenRequests(request.e4sSession!.user.id) };
  });

  app.post("/api/v1/content/month-frameworks/:id/reopen-requests", { preHandler: contentOperator }, async (request, reply) => {
    const { id } = frameworkParams.parse(request.params);
    const input = correctionInput.parse(request.body);
    const created = await repositories.monthlyContent.requestFrameworkReopen(request.e4sSession!.user.id, id, input.reason);
    return reply.code(201).send(created);
  });
  app.post("/api/v1/manager/month-frameworks/:id/retire", { preHandler: manager }, async (request, reply) => {
    const { id } = frameworkParams.parse(request.params);
    const { reason } = retireFrameworkInput.parse(request.body);
    await repositories.monthlyContent.retireFramework(request.e4sSession!.user.id, id, reason);
    return reply.code(204).send();
  });
  app.get("/api/v1/content/months", { preHandler: readers }, async (request) => {
    return repositories.monthlyContent.getOverview(request.e4sSession!.user.id);
  });
  app.get("/api/v1/content/months/:month", { preHandler: readers }, async (request) => {
    const input = params.parse(request.params);
    return repositories.monthlyContent.getOverview(request.e4sSession!.user.id, input.month);
  });
  app.get("/api/v1/content/month-frameworks/:id/publication-preview", { preHandler: contentOperator }, async (request) => {
    const { id } = frameworkParams.parse(request.params);
    return repositories.monthlyContent.previewMonthPublication(request.e4sSession!.user.id, id);
  });
  app.post("/api/v1/content/month-frameworks/:id/publication", { preHandler: contentOperator }, async (request) => {
    const { id } = frameworkParams.parse(request.params);
    const { confirmedOn } = z.object({ confirmedOn: z.iso.date() }).parse(request.body);
    return repositories.monthlyContent.publishMonth(request.e4sSession!.user.id, id, confirmedOn);
  });

  app.put("/api/v1/content/months/:month/brief", { preHandler: contentOperator }, async (request) => {
    const month = params.parse(request.params);
    const input = briefInput.parse(request.body);
    return repositories.monthlyContent.saveBrief(request.e4sSession!.user.id, { month: month.month, ...input });
  });

  app.post("/api/v1/content/months/:month/brief/suggest", { preHandler: contentOperator }, async (request, reply) => {
    const month = params.parse(request.params);
    const actorId = request.e4sSession!.user.id;
    const runner = await runnerFor(actorId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const [overview, task] = await Promise.all([
      repositories.monthlyContent.getOverview(actorId, month.month),
      repositories.aiRuns.activeTaskPrompt(actorId, "monthly_topic_suggestion")
    ]);
    // A suggestion that can never be saved would only spend tokens.
    if (!overview.monthWindow.writable) return reply.code(409).send({ code: "MONTHLY_CONTENT_READ_ONLY" });
    if (overview.frameworks.some((framework) => framework.status === "approved")) return reply.code(409).send({ code: "MONTHLY_FRAMEWORK_IMMUTABLE" });
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const generated = await runner.runTask("monthly_topic_suggestion", {
        month: month.month,
        ...(overview.brief?.title ? { previousTitle: overview.brief.title } : {})
      }, { systemPrompt: task.prompt, maxOutputTokens: 1_200 });
      const suggestion = monthlyTopicSuggestionOutputSchema.parse(generated.output);
      return await repositories.monthlyContent.saveBrief(actorId, { month: month.month, ...suggestion });
    } catch (error) {
      if (error instanceof Error && error.message.includes("read-only")) return reply.code(409).send({ code: "MONTHLY_CONTENT_READ_ONLY" });
      throw error;
    }
  });

  app.post("/api/v1/content/months/:month/brief/approve", { preHandler: contentOperator }, async (request, reply) => {
    const input = params.parse(request.params);
    await repositories.monthlyContent.approveBrief(request.e4sSession!.user.id, input.month);
    return reply.code(204).send();
  });

  // This is the explicit manual save path. The AI-assisted framework endpoint
  // will produce this same contract and must pass this exact validator.
  app.post("/api/v1/content/months/:month/frameworks/generate", { preHandler: contentOperator }, async (request, reply) => {
    const month = params.parse(request.params);
    const input = frameworkInput.parse(request.body);
    if (input.contract.month !== month.month) return reply.code(409).send({ code: "MONTH_CONTRACT_MISMATCH" });
    return repositories.monthlyContent.saveFramework(request.e4sSession!.user.id, input.contract as MonthlyCurriculumContract);
  });

  app.get("/api/v1/content/months/:month/resources/checkpoint", { preHandler: contentOperator }, async (request) => {
    const month = params.parse(request.params);
    const query = resourceCheckpointQuery.parse(request.query);
    const checkpoint = await repositories.monthlyContent.getResourceGenerationCheckpoint(request.e4sSession!.user.id, month.month, query.cefr);
    const calendar = buildMonthlyCalendar(month.month);
    const newLessonCount = calendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, calendar) === "new").length;
    const pronunciationExampleCount = 9;
    const counts = { coreTerms: newLessonCount * 3, expandedTerms: newLessonCount * 27, grammarTopics: 2, pronunciationTargets: 4 };
    const checkpointCoreTerms = isCurrentMonthlyResourceCheckpointCategory("coreTerms", checkpoint?.sourceLineage.coreTerms)
      ? monthlyResourcePlanOutputSchema.shape.coreTerms.safeParse(checkpoint?.categories.coreTerms).data ?? []
      : [];
    const checkpointExpandedTerms = isCurrentMonthlyResourceCheckpointCategory("expandedTerms", checkpoint?.sourceLineage.expandedTerms)
      ? monthlyResourcePlanOutputSchema.shape.expandedTerms.safeParse(checkpoint?.categories.expandedTerms).data ?? []
      : [];
    const expandedPoolComplete = checkpointCoreTerms.length === counts.coreTerms
      && checkpointExpandedTerms.length >= newLessonCount * 3 * MONTHLY_MIN_SUPPORTS_PER_CORE
      && checkpointExpandedTerms.length <= counts.expandedTerms
      && checkpointCoreTerms.every((core) => {
        const supports = checkpointExpandedTerms.filter((term) => term.relatesToCoreId === core.id);
        return supports.length >= MONTHLY_MIN_SUPPORTS_PER_CORE && supports.length <= MONTHLY_MAX_SUPPORTS_PER_CORE && hasRequiredMonthlySupportRelations(core.type, supports);
      });
    const categories = Object.fromEntries(Object.entries(counts).map(([key, target]) => {
      const categoryCurrent = isCurrentMonthlyResourceCheckpointCategory(key, checkpoint?.sourceLineage[key]);
      const value = checkpoint?.categories[key];
      const count = Array.isArray(value) ? value.length : 0;
      const pronunciationPoolComplete = key === "pronunciationTargets" && count === target
        && Array.isArray(value) && value.every((entry, index) => entry && typeof entry === "object" && Array.isArray((entry as { words?: unknown }).words)
          && ((entry as { words: unknown[] }).words.length >= pronunciationExampleCount));
      const categoryComplete = categoryCurrent && (key === "expandedTerms" ? expandedPoolComplete : key === "pronunciationTargets" ? pronunciationPoolComplete : count === target);
      return [key, { state: categoryComplete ? "complete" : "missing", count, target }];
    }));
    return {
      progress: resourceProgress.read(request.e4sSession!.user.id + ":" + month.month + ":" + query.cefr),
      state: checkpoint ? "draft_checkpoint" : "not_started",
      draftOnly: true,
      publishable: false,
      retryOnlyMissing: true,
      generationId: checkpoint?.generationId ?? null,
      version: checkpoint?.version ?? null,
      briefVersion: checkpoint?.briefVersion ?? null,
      updatedAt: checkpoint?.updatedAt ?? null,
      categories
    };
  });

  app.post("/api/v1/content/months/:month/resources/generate", { preHandler: contentOperator }, async (request, reply) => {
    const month = params.parse(request.params);
    const actorId = request.e4sSession!.user.id;
    const criteria = resourceCriteriaInput.parse(request.body);
    const overview = await repositories.monthlyContent.getOverview(actorId, month.month);
    if (!overview.monthWindow.writable) return reply.code(409).send({ code: "MONTHLY_CONTENT_READ_ONLY" });
    const brief = overview.brief;
    if (!brief || brief.status !== "approved") return reply.code(409).send({ code: "MONTHLY_TOPIC_NOT_APPROVED" });
    if (overview.frameworks.some((framework) => framework.cefr === criteria.cefr && framework.status === "approved")) {
      return reply.code(409).send({ code: "MONTHLY_FRAMEWORK_IMMUTABLE" });
    }
    // The other levels' current (draft or approved) core words of this month are
    // an exclusion list for the core phase: prompt context plus a selection gate.
    const otherLevelCoreWords = buildMonthlyCrossLevelCoreExclusions(criteria.cefr, overview.frameworks
      .filter((framework) => framework.cefr !== criteria.cefr && framework.resources)
      .map((framework) => ({ cefr: framework.cefr, words: framework.resources!.coreTerms.map((term) => term.word) })));
    const calendar = buildMonthlyCalendar(month.month);
    const newLessonCount = calendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, calendar) === "new").length;
    const requiredVocabularyCount = newLessonCount * 3;
    const minimumExpandedVocabularyCount = newLessonCount * 3 * MONTHLY_MIN_SUPPORTS_PER_CORE;
    const maximumExpandedVocabularyCount = newLessonCount * 3 * MONTHLY_MAX_SUPPORTS_PER_CORE;
    if (criteria.vocabularyCount !== requiredVocabularyCount) {
      return reply.code(422).send({ code: "VOCABULARY_COUNT_MISMATCH", requiredVocabularyCount });
    }
    if (criteria.expandedVocabularyCount < minimumExpandedVocabularyCount || criteria.expandedVocabularyCount > maximumExpandedVocabularyCount) {
      return reply.code(422).send({ code: "EXPANDED_VOCABULARY_COUNT_MISMATCH", minimumExpandedVocabularyCount, maximumExpandedVocabularyCount });
    }
    if (criteria.grammarTopicCount !== 2 || criteria.pronunciationSoundCount !== 4) {
      return reply.code(422).send({ code: "MONTHLY_RESOURCE_CRITERIA_MISMATCH", requiredGrammarTopicCount: 2, requiredPronunciationSoundCount: 4 });
    }
    const [task, baseRunner] = await Promise.all([
      repositories.aiRuns.activeTaskPrompt(actorId, "monthly_resource_generation"),
      runnerFor(actorId)
    ]);
    if (!baseRunner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    const progressKey = actorId + ":" + month.month + ":" + criteria.cefr;
    const progressRun = resourceProgress.start(progressKey);
    const updateProgress = (patch: Parameters<MonthlyResourceProgressStore["update"]>[2]) => resourceProgress.update(progressKey,progressRun.runId,patch);
    // Token usage for this whole generation request, logged once at the end.
    const usageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, startedAt: Date.now() };
    const runner = {
      ...baseRunner,
      runTask: async (...args: Parameters<AiTaskRunner["runTask"]>) => {
        const result = await baseRunner.runTask(...args);
        usageTotals.calls += 1;
        usageTotals.inputTokens += result.metadata.usage?.inputTokens ?? 0;
        usageTotals.outputTokens += result.metadata.usage?.outputTokens ?? 0;
        usageTotals.cacheReadInputTokens += result.metadata.usage?.cacheReadInputTokens ?? 0;
        usageTotals.cacheCreationInputTokens += result.metadata.usage?.cacheCreationInputTokens ?? 0;
        return result;
      }
    } as AiTaskRunner;
    const logUsage = (outcome: string) => console.info("[monthly-resource-usage]", JSON.stringify({ month: month.month, cefr: criteria.cefr, outcome, ...usageTotals, elapsedMs: Date.now() - usageTotals.startedAt }));
    try {
      updateProgress({phase:"coreTerms"});
      let checkpoint = await repositories.monthlyContent.getResourceGenerationCheckpoint(actorId, month.month, criteria.cefr);
      const generationId = checkpoint?.generationId ?? randomUUID();
      const readCheckpointCategory = <T>(key: string, schema: z.ZodType<T>): T | undefined => {
        const source = checkpoint?.sourceLineage[key];
        if (!isCurrentMonthlyResourceCheckpointCategory(key, source)) return undefined;
        const parsed = schema.safeParse(checkpoint?.categories[key]);
        return parsed.success ? parsed.data : undefined;
      };
      const saveCheckpointCategory = async (key: string, value: unknown) => {
        if (Array.isArray(value)) updateProgress({counts:{[key]:value.length}});
        const schemaVersion = CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS[key as keyof typeof CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS];
        if (!schemaVersion) throw new Error(`Unknown monthly resource checkpoint category: ${key}`);
        checkpoint = await repositories.monthlyContent.saveResourceGenerationCheckpoint(actorId, {
          month: month.month, cefr: criteria.cefr, briefVersion: brief.version, generationId,
          categories: { [key]: value },
          sourceLineage: { [key]: { schemaVersion, briefVersion: brief.version, promptKey: "monthly_resource_generation", status: "draft_checkpoint", generatedAt: new Date().toISOString() } }
        });
      };
      const theme = {
        version: brief.version,
        title: brief.title,
        brief: brief.brief,
        context: brief.context,
        communicationGoal: brief.communicationGoal
      };
      const calendar = buildMonthlyCalendar(month.month);
      const newLessonDays = calendar.effectiveDays.flatMap((_date, index) => monthlyDayKind(index + 1, calendar) === "new" ? [index + 1] : []);
      // Each completed resource category is checkpointed as an unpublished draft.
      // Only saveResourceDraft creates the editable month framework after all
      // categories pass whole-pool validation.
      const newLessonCount = newLessonDays.length;
      const pronunciationExampleCount = 9;
      const phaseInput = (coreTermBatch: Array<{ id: string; word: string; meaning: string; type: string; ipa: string }>, targets: { vocabularyCount: number; expandedVocabularyCount: number; grammarTopicCount: number; pronunciationSoundCount: number }) => ({
        month: month.month,
        cefr: criteria.cefr,
        theme: { title: theme.title, brief: theme.brief, context: theme.context, communicationGoal: theme.communicationGoal },
        newLessonCount,
        // Stored cores may carry their own CEFR label; the AI task input schema is strict.
        coreTermBatch: coreTermBatch.map(({ id, word, meaning, type, ipa }) => ({ id, word, meaning, type, ipa })),
        targets
      });
      const runPhase = async (phasePrompt: string, coreTermBatch: Array<{ id: string; word: string; meaning: string; type: string; ipa: string }>, targets: { vocabularyCount: number; expandedVocabularyCount: number; grammarTopicCount: number; pronunciationSoundCount: number }, options: { temperature?: number; maxOutputTokens?: number } = {}) => {
        const generated = await runner.runTask("monthly_resource_generation", phaseInput(coreTermBatch, targets), {
          systemPrompt: `${task.prompt}\n\n${phasePrompt}`,
          maxOutputTokens: options.maxOutputTokens ?? 6_000,
          temperature: options.temperature ?? 0.15,
          maxAttempts: 2
        });
        return parseMonthlyResourceAiOutput(generated.output);
      };
      const runSupportAudit = async (core: { id: string; word: string; meaning: string; type: string; ipa: string }, candidates: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"]) => {
        const audited = await runner.runTask("monthly_resource_generation", phaseInput([core], { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 0 }), {
          systemPrompt: buildMonthlySupportRelationAuditPrompt({ core, candidates }),
          maxOutputTokens: 3_500,
          temperature: 0,
          maxAttempts: 2
        });
        return parseMonthlyResourceAiOutput(audited.output);
      };
      const coreTerms: z.infer<typeof monthlyResourcePlanOutputSchema>["coreTerms"] = readCheckpointCategory("coreTerms", monthlyResourcePlanOutputSchema.shape.coreTerms) ?? [];
      const coreWords = new Set<string>();
      const preflightSupportTerms: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] = [];
      // One repeated-support ceiling (35%) shared with the domain validator.
      // Multi-word expressions may fill up to 35% of the pool (umbrella group phrases included).
      const maxExpandedRepeats = maxMonthlySupportRepeats(criteria.expandedVocabularyCount);
      const maxExpandedPhrases = maxMonthlyPhrasePlacements(criteria.expandedVocabularyCount);
      // Checkpointed cores must still pass the level gate (too easy for B2/C1,
      // another level's core this month, non-word); failing ones are dropped
      // and the core phase asks the AI for replacements.
      const levelValidCores = coreTerms.filter((term) => !getMonthlyCoreLevelIssue(term, criteria.cefr, otherLevelCoreWords));
      const cachedCoreValid = coreTerms.length === criteria.vocabularyCount
        && levelValidCores.length === coreTerms.length
        && coreTerms.every((term) => isSingleHeadword(term.word))
        && coreTerms.every((term) => hasSingleCoreSense(term.type, term.meaning))
        && new Set(coreTerms.map((term) => normalizeMonthlyResourceWord(term.word))).size === coreTerms.length;
      // A shorter, otherwise valid core list is progress saved by an earlier run
      // that ended short; the core phase continues from it instead of restarting.
      const partialCores = !cachedCoreValid
        && levelValidCores.length > 0 && levelValidCores.length < criteria.vocabularyCount
        && levelValidCores.every((term) => isSingleHeadword(term.word))
        && new Set(levelValidCores.map((term) => normalizeMonthlyResourceWord(term.word))).size === levelValidCores.length
        ? [...levelValidCores]
        : [];
      const partialSupports = partialCores.length
        ? (readCheckpointCategory("expandedTerms", monthlyResourcePlanOutputSchema.shape.expandedTerms) ?? []).filter((term) => partialCores.some((core) => core.id === term.relatesToCoreId))
        : [];
      if (!cachedCoreValid) coreTerms.length = 0;
      for (const term of coreTerms) coreWords.add(normalizeMonthlyResourceWord(term.word));
      const preflightSupportTarget = Math.min(MONTHLY_MAX_SUPPORTS_PER_CORE, Math.max(3, Math.floor(criteria.expandedVocabularyCount / (newLessonCount * 3))));
      // Month-wide core selection: parallel generation, concurrent audit and
      // gap-fill, then deterministic sequential selection (see monthly-core-phase.ts).
      // Also used by enrichment to refill the slots of dropped cores.
      const runCorePhase = (initial?: { coreTerms: typeof coreTerms; supportTerms: typeof preflightSupportTerms }, avoidWords: readonly string[] = []) => runMonthlyCorePhase({
        cefr: criteria.cefr,
        theme: { title: theme.title, communicationGoal: theme.communicationGoal },
        neededCount: criteria.vocabularyCount,
        maxRepeatedPlacements: maxExpandedRepeats,
        maxPhrasePlacements: maxExpandedPhrases,
        supportTargetPerCore: preflightSupportTarget,
        generate: runPhase,
        audit: runSupportAudit,
        ...(otherLevelCoreWords.size ? { otherLevelCoreWords } : {}),
        ...(initial?.coreTerms.length ? { initial } : {}),
        ...(avoidWords.length ? { avoidWords } : {})
      });
      if (!cachedCoreValid) {
        let corePhase: Awaited<ReturnType<typeof runMonthlyCorePhase>>;
        try {
          corePhase = await runCorePhase(partialCores.length ? { coreTerms: partialCores, supportTerms: partialSupports } : undefined);
        } catch (error) {
          if (error instanceof MonthlyCorePhaseShortfallError && error.partial.coreTerms.length) {
            await saveCheckpointCategory("coreTerms", error.partial.coreTerms);
            await saveCheckpointCategory("expandedTerms", error.partial.supportTerms);
          }
          throw error;
        }
        coreTerms.push(...corePhase.coreTerms);
        corePhase.coreTerms.forEach((term) => coreWords.add(normalizeMonthlyResourceWord(term.word)));
        preflightSupportTerms.push(...corePhase.supportTerms);
        request.log.info({ month: month.month, cefr: criteria.cefr, phase: "core", cores: corePhase.coreTerms.length, preflightSupports: corePhase.supportTerms.length, ...corePhase.stats }, "Monthly resource core phase finished");
      }
      if (!cachedCoreValid) await saveCheckpointCategory("coreTerms", coreTerms);
      // December 2026: core IPA must be British RP; the generator corrects rejected transcriptions (words are kept).
      const ipaRepair = await repairMonthlyCoreIpa(coreTerms, (prompt, batch) => runPhase(prompt, batch, { vocabularyCount: batch.length, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 0 }, { temperature: 0 }));
      if (ipaRepair.changed) await saveCheckpointCategory("coreTerms", coreTerms);
      if (ipaRepair.remaining.length) throw new MonthlyResourcePlanError([`Core IPA is not British RP after repair: ${ipaRepair.remaining.map((entry) => `${entry.word} ${entry.ipa} (${entry.issue})`).join("; ")}`]);
      if (preflightSupportTerms.length) await saveCheckpointCategory("expandedTerms", preflightSupportTerms);

      updateProgress({phase:"expandedTerms",counts:{coreTerms:coreTerms.length}});
      const cachedExpandedBeforeCoreExclusion = readCheckpointCategory("expandedTerms", monthlyResourcePlanOutputSchema.shape.expandedTerms) ?? [];
      const cachedExpanded = cachedExpandedBeforeCoreExclusion.filter((term) => !coreWords.has(normalizeMonthlyResourceWord(term.word)));
      if (cachedExpanded.length !== cachedExpandedBeforeCoreExclusion.length) await saveCheckpointCategory("expandedTerms", cachedExpanded);
      const cachedSupportsByCore = new Map(coreTerms.map((core) => [core.id, cachedExpanded.filter((term) => term.relatesToCoreId === core.id)]));
      const expandedTerms: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] = [];
      for (const core of coreTerms) {
        // Quality rules A and C also apply to resumed supports: drop topic-only
        // collocations, inflection-only duplicates and inflection-only word-family
        // items (smaller for small, sending for send), plus umbrellas that are
        // generic placeholders or the wrong part of speech for the core (a verb's
        // umbrella is now a verb), then refill them below. The screen uses only
        // rules the core phase also applies, and drops offending supports one by
        // one, so a support the core phase accepted is never lost here.
        expandedTerms.push(...screenCachedMonthlyCoreSupports(core, cachedSupportsByCore.get(core.id) ?? [], coreWords));
      }
      if (expandedTerms.length !== cachedExpanded.length) await saveCheckpointCategory("expandedTerms", expandedTerms);
      const supportLimitFor = (coreIndex: number) => Math.min(
        MONTHLY_MAX_SUPPORTS_PER_CORE,
        Math.floor(criteria.expandedVocabularyCount / coreTerms.length) + (coreIndex < criteria.expandedVocabularyCount % coreTerms.length ? 1 : 0)
      );
      // A core is "complete" for resume purposes once it holds its requested
      // support target. The hard floor is three supports covering the relations
      // its part of speech requires, so an incomplete core is enriched again but
      // never fails for lacking extras.
      // Roadmap grammar (docs/grammar-roadmap.md): the month's pair is picked
      // deterministically from the level catalog with a 12-month memory of the
      // same level; the AI only writes the steps inside the locked topics.
      const grammarHistory = typeof repositories.monthlyContent.listGrammarHistory === "function"
        ? await repositories.monthlyContent.listGrammarHistory(actorId, criteria.cefr, month.month, MONTHLY_GRAMMAR_MEMORY_MONTHS)
        : [];
      const grammarSelection = selectMonthlyGrammarPair({ cefr: criteria.cefr, month: month.month, history: grammarHistory });
      const grammarPair = grammarSelection.pair;
      request.log.info({ month: month.month, cefr: criteria.cefr, phase: "grammar-selection", pair: grammarPair.id, taught: grammarSelection.taughtPairIds, newCycle: grammarSelection.newCycle }, "Monthly grammar pair selected");
      const cachedGrammarTopics = readCheckpointCategory("grammarTopics", monthlyResourcePlanOutputSchema.shape.grammarTopics) ?? [];
      const cachedGrammarResult = { coreTerms: [], expandedTerms: [], grammarTopics: cachedGrammarTopics, pronunciationTargets: [] } as z.infer<typeof monthlyResourcePlanOutputSchema>;
      const resumingAfterEnrichment = cachedCoreValid && getMonthlyGrammarPhaseIssues(cachedGrammarResult, criteria.cefr, grammarPair).length === 0;
      const isCompleteCoreSupportSet = (core: typeof coreTerms[number], coreIndex: number) => {
        const supports = expandedTerms.filter((term) => term.relatesToCoreId === core.id);
        const familyRequired = requiredSupportRelationsFor(core.type).includes("word_family");
        const requiredCount = resumingAfterEnrichment ? MONTHLY_MIN_SUPPORTS_PER_CORE : supportLimitFor(coreIndex);
        return supports.length >= Math.max(MONTHLY_MIN_SUPPORTS_PER_CORE, requiredCount) && supports.length <= MONTHLY_MAX_SUPPORTS_PER_CORE
          && hasRequiredMonthlySupportRelations(core.type, supports)
          && (!familyRequired || supports.some((term) => term.relation === "word_family" && isGenuineWordFamily(core.word, term.word)));
      };
      // Enrichment per core is mostly independent AI work, so cores run
      // concurrently in a small pool. Each core reads the shared pool as it
      // stands; the repeat ceiling is re-enforced after all cores finish.
      const firstIncompleteCore = coreTerms.findIndex((core, index) => !isCompleteCoreSupportSet(core, index));
      const enrichmentStartedAt = Date.now();
      const enrichmentStats = { generationCalls: 0, gapFillCalls: 0, auditCalls: 0, auditsSkippedByPrefilter: 0 };
      // Required relations were already found in the core phase, so enrichment
      // only retries a missing one briefly; a core that still lacks one is
      // dropped and its slot refilled by the core phase (see
      // runMonthlyEnrichmentWithRefill) instead of failing the whole request.
      const ENRICHMENT_SUPPORT_PASSES = 2;
      const ENRICHMENT_REQUIRED_RELATION_ATTEMPTS = 2;
      const isInvalidAiOutputError = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && ["AI_OUTPUT_INVALID", "AI_OUTPUT_TRUNCATED"].includes(String((error as { code?: unknown }).code)));
      const enrichCore = async (coreIndex: number): Promise<MonthlyCoreEnrichmentOutcome> => {
        const coreTerm = coreTerms[coreIndex]!;
        const cachedTermsForCore = expandedTerms.filter((term) => term.relatesToCoreId === coreTerm.id);
        for (let index = expandedTerms.length - 1; index >= 0; index -= 1) {
          if (expandedTerms[index]!.relatesToCoreId === coreTerm.id) expandedTerms.splice(index, 1);
        }
        const supportLimitForCore = supportLimitFor(coreIndex);
        let acceptedForCore: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] | undefined;
        let lastIssue = "";
        const candidatesForCore = [...cachedTermsForCore];
        {
          // Required relations follow the core's part of speech (noun: umbrella +
          // synonym; verb/adjective/adverb: synonym + word family).
          const requiredRelations = requiredSupportRelationsFor(coreTerm.type);
          const rejectedCandidatesByRelation = new Map<(typeof requiredRelations)[number], Set<string>>();
          const rejectedOptionalCandidates = new Set<string>();
          let optionalPreviousIssue = "";
          for (let supportPassAttempt = 0; supportPassAttempt < ENRICHMENT_SUPPORT_PASSES && !acceptedForCore; supportPassAttempt += 1) {
          let issue = "";
          for (const relation of requiredRelations) {
            if (candidatesForCore.some((term) => term.relation === relation)) continue;
            let relationAccepted = false;
            let relationIssue = "";
            const rejectedCandidateWords = rejectedCandidatesByRelation.get(relation) ?? new Set<string>();
            rejectedCandidatesByRelation.set(relation, rejectedCandidateWords);
            for (let attempt = 0; attempt < ENRICHMENT_REQUIRED_RELATION_ATTEMPTS && !relationAccepted; attempt += 1) {
              const previousTerms = [...expandedTerms.map((term) => term.word), ...candidatesForCore.map((term) => term.word)];
              const prompt = buildMonthlySupportRelationCandidatePrompt({
                cefr: criteria.cefr,
                core: coreTerm,
                relation,
                theme: theme.title,
                forbiddenCoreWords: coreTerms.map((term) => term.word),
                existingSupportWords: expandedTerms.map((term) => term.word),
                sameCoreSupportWords: candidatesForCore.map((term) => term.word),
                rejectedCandidateWords: [...rejectedCandidateWords],
                previousIssue: relationIssue,
                candidateCount: 12
              });
              enrichmentStats.gapFillCalls += 1;
              let result: z.infer<typeof monthlyResourcePlanOutputSchema>;
              try {
                result = await runPhase(prompt, [coreTerm], { vocabularyCount: 0, expandedVocabularyCount: 12, grammarTopicCount: 0, pronunciationSoundCount: 0 }, { temperature: 0.35 });
              } catch (error) {
                if (!isInvalidAiOutputError(error)) throw error;
                relationIssue = `the ${relation} candidate request returned invalid output`;
                continue;
              }
              const exactRelationCandidates = keepExactMonthlySupportRelationCandidates(result.expandedTerms, relation, coreTerm.id);
              // Cheap deterministic screen (word family, collocation) before paying for an audit.
              const prefiltered = prefilterMonthlySupportCandidatesForAudit(coreTerm, exactRelationCandidates);
              exactRelationCandidates.filter((term) => !prefiltered.kept.includes(term)).forEach((term) => rejectedCandidateWords.add(term.word));
              const relationCandidates = prefiltered.kept;
              const mislabeledCandidates = result.expandedTerms.filter((term) => !exactRelationCandidates.includes(term));
              mislabeledCandidates.forEach((term) => rejectedCandidateWords.add(term.word));
              if (!exactRelationCandidates.length && result.expandedTerms.length) {
                relationIssue = `the model generated ${result.expandedTerms.length} support candidates, but none had exact relation ${relation} linked to ${coreTerm.id}; rejected labels: ${mislabeledCandidates.slice(0, 4).map((term) => `${term.word} (${term.relation} → ${term.relatesToCoreId})`).join(", ")}`;
                continue;
              }
              if (!relationCandidates.length) {
                if (exactRelationCandidates.length) enrichmentStats.auditsSkippedByPrefilter += 1;
                relationIssue = exactRelationCandidates.length
                  ? `every ${relation} candidate failed the deterministic check: ${prefiltered.rejected.slice(0, 4).join(", ")}`
                  : `the model returned no candidates for relation ${relation}`;
                continue;
              }
              if (result.coreTerms.length || result.grammarTopics.length || result.pronunciationTargets.length) {
                request.log.warn({ month: month.month, cefr: criteria.cefr, coreId: coreTerm.id, relation }, "Monthly relation phase returned non-support categories; ignoring them");
              }
              const auditPrompt = buildMonthlySupportRelationAuditPrompt({ core: coreTerm, candidates: relationCandidates });
              let auditResult: z.infer<typeof monthlyResourcePlanOutputSchema>;
              try {
                enrichmentStats.auditCalls += 1;
                const audited = await runner.runTask("monthly_resource_generation", phaseInput([coreTerm], { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 0 }), {
                  systemPrompt: auditPrompt,
                  maxOutputTokens: 3_500,
                  temperature: 0,
                  maxAttempts: 2
                });
                auditResult = parseMonthlyResourceAiOutput(audited.output);
              } catch (error) {
                if (isInvalidAiOutputError(error)) {
                  result.expandedTerms.forEach((term) => rejectedCandidateWords.add(term.word));
                  relationIssue = `the independent semantic audit did not return a valid ${relation} review`;
                  continue;
                }
                throw error;
              }
              if (auditResult.coreTerms.length || auditResult.grammarTopics.length || auditResult.pronunciationTargets.length) {
                result.expandedTerms.forEach((term) => rejectedCandidateWords.add(term.word));
                relationIssue = `the independent semantic audit returned non-support categories for ${relation}`;
                continue;
              }
              const auditedCandidates = keepSemanticallyAuditedSupportCandidates(relationCandidates, auditResult.expandedTerms);
              if (!auditedCandidates.length && relationCandidates.length) {
                request.log.warn({
                  month: month.month,
                  cefr: criteria.cefr,
                  coreId: coreTerm.id,
                  coreWord: coreTerm.word,
                  relation,
                  generatedCandidates: relationCandidates.map(({ word, meaning, type }) => ({ word, meaning, type }))
                }, "Monthly support relation audit rejected every generated candidate");
              }
              const selection = selectMonthlySupportCandidates({
                candidates: auditedCandidates,
                coreId: coreTerm.id,
                coreWord: coreTerm.word,
                coreType: coreTerm.type,
                coreWords,
                sameCoreWords: new Set(candidatesForCore.map((term) => normalizeMonthlyResourceWord(term.word))),
                sameCoreRelations: new Set(candidatesForCore.map((term) => term.relation)),
                sameCoreRelationCounts: new Map(candidatesForCore.map((term) => [term.relation, candidatesForCore.filter((candidate) => candidate.relation === term.relation).length])),
                existingSupportWords: previousTerms,
                maxRepeatedPlacements: maxExpandedRepeats,
                maxPhrasePlacements: maxExpandedPhrases,
                cefr: criteria.cefr,
                needed: 1
              });
              const chosen = selection.selected.find((term) => term.relation === relation);
              if (chosen) {
                candidatesForCore.push(chosen);
                relationAccepted = true;
              } else {
                result.expandedTerms.forEach((term) => rejectedCandidateWords.add(term.word));
                const candidateSummary = relationCandidates.slice(0, 4).map((term) => `${term.word} (${term.type}: ${term.meaning})`).join(", ");
                relationIssue = `no audited candidate passed selection for ${relation} (generated ${relationCandidates.length}, audit retained ${auditedCandidates.length}${candidateSummary ? `; candidates: ${candidateSummary}` : ""}): ${selection.rejected.join("; ")}`;
              }
            }
            if (!relationAccepted) issue = `${issue}${issue ? "; " : ""}${relationIssue || `missing required ${relation}`}`;
          }

          // Required semantic relations are requested and audited separately so
          // the model cannot satisfy one relation by returning a synonym-heavy pool.
          // Optional terms (including the optional structural relation for this
          // part of speech) are generated only after the required slots pass.
          if (requiredRelations.every((relation) => candidatesForCore.some((term) => term.relation === relation))) {
            for (let optionalAttempt = 0; optionalAttempt < 3 && candidatesForCore.length < supportLimitForCore && candidatesForCore.length < 9; optionalAttempt += 1) {
              const optionalCount = Math.min(supportLimitForCore - candidatesForCore.length, 9 - candidatesForCore.length);
              if (optionalCount <= 0) break;
              const previousTerms = [...expandedTerms.map((term) => term.word), ...candidatesForCore.map((term) => term.word)];
              const optionalPrompt = buildMonthlyOptionalSupportPrompt({
                cefr: criteria.cefr,
                core: coreTerm,
                theme: theme.title,
                requestedCount: optionalCount,
                forbiddenCoreWords: coreTerms.map((term) => term.word),
                existingSupportWords: expandedTerms.map((term) => term.word),
                sameCoreSupportWords: candidatesForCore.map((term) => term.word),
                rejectedCandidateWords: [...rejectedOptionalCandidates],
                previousIssue: optionalPreviousIssue,
                candidateCount: 12
              });
              enrichmentStats.generationCalls += 1;
              let result: z.infer<typeof monthlyResourcePlanOutputSchema>;
              try {
                result = await runPhase(optionalPrompt, [coreTerm], { vocabularyCount: 0, expandedVocabularyCount: optionalCount, grammarTopicCount: 0, pronunciationSoundCount: 0 });
              } catch (error) {
                if (!isInvalidAiOutputError(error)) throw error;
                issue = "optional support generation returned invalid output";
                optionalPreviousIssue = issue;
                continue;
              }
              if (result.coreTerms.length || result.grammarTopics.length || result.pronunciationTargets.length) {
                issue = "optional support generation returned non-support categories";
                continue;
              }
              const optionalPrefiltered = prefilterMonthlySupportCandidatesForAudit(coreTerm, result.expandedTerms);
              result.expandedTerms.filter((term) => !optionalPrefiltered.kept.includes(term)).forEach((term) => rejectedOptionalCandidates.add(term.word));
              if (!optionalPrefiltered.kept.length) {
                if (result.expandedTerms.length) enrichmentStats.auditsSkippedByPrefilter += 1;
                issue = optionalPrefiltered.rejected.length ? `every optional candidate failed the deterministic check: ${optionalPrefiltered.rejected.slice(0, 4).join(", ")}` : "optional support generation returned no candidates";
                optionalPreviousIssue = issue;
                continue;
              }
              const auditPrompt = buildMonthlySupportRelationAuditPrompt({ core: coreTerm, candidates: optionalPrefiltered.kept });
              let auditResult: z.infer<typeof monthlyResourcePlanOutputSchema>;
              try {
                enrichmentStats.auditCalls += 1;
                const audited = await runner.runTask("monthly_resource_generation", phaseInput([coreTerm], { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 0 }), {
                  systemPrompt: auditPrompt,
                  maxOutputTokens: 3_500,
                  temperature: 0,
                  maxAttempts: 2
                });
                auditResult = parseMonthlyResourceAiOutput(audited.output);
              } catch (error) {
                if (isInvalidAiOutputError(error)) {
                  issue = "optional support audit did not return a valid review";
                  optionalPreviousIssue = issue;
                  result.expandedTerms.forEach((term) => rejectedOptionalCandidates.add(term.word));
                  continue;
                }
                throw error;
              }
              if (auditResult.coreTerms.length || auditResult.grammarTopics.length || auditResult.pronunciationTargets.length) {
                issue = "optional support audit returned non-support categories";
                continue;
              }
              const auditedCandidates = keepSemanticallyAuditedSupportCandidates(optionalPrefiltered.kept, auditResult.expandedTerms);
              const selection = selectMonthlySupportCandidates({
                candidates: auditedCandidates,
                coreId: coreTerm.id,
                coreWord: coreTerm.word,
                coreType: coreTerm.type,
                coreWords,
                sameCoreWords: new Set(candidatesForCore.map((term) => normalizeMonthlyResourceWord(term.word))),
                sameCoreRelations: new Set(candidatesForCore.map((term) => term.relation)),
                sameCoreRelationCounts: new Map(candidatesForCore.map((term) => [term.relation, candidatesForCore.filter((candidate) => candidate.relation === term.relation).length])),
                existingSupportWords: previousTerms,
                maxRepeatedPlacements: maxExpandedRepeats,
                maxPhrasePlacements: maxExpandedPhrases,
                cefr: criteria.cefr,
                needed: optionalCount
              });
              candidatesForCore.push(...selection.selected);
              const selectedCandidateKeys = new Set(selection.selected.map((term) => `${normalizeMonthlyResourceWord(term.word)}\u0000${term.relation}`));
              result.expandedTerms.filter((term) => !selectedCandidateKeys.has(`${normalizeMonthlyResourceWord(term.word)}\u0000${term.relation}`)).forEach((term) => rejectedOptionalCandidates.add(term.word));
              const selectionIssues = selection.rejected.filter((entry) => !entry.includes("missing required"));
              issue = selection.selected.length < optionalCount
                ? `needed ${optionalCount} additional authentic supports, accepted ${selection.selected.length}${selectionIssues.length ? `; ${selectionIssues.join("; ")}` : ""}`
                : selectionIssues.join("; ");
              optionalPreviousIssue = issue || "some candidates were rejected by semantic audit or support-pool constraints";
            }
          }
          const coreHasMinimumRelations = hasRequiredMonthlySupportRelations(coreTerm.type, candidatesForCore);
          // Extra supports are attempted above but never forced: three supports
          // covering the relations required for the core's part of speech are
          // the per-core minimum (VH-R33).
          if (candidatesForCore.length >= MONTHLY_MIN_SUPPORTS_PER_CORE && coreHasMinimumRelations) {
            acceptedForCore = candidatesForCore;
            break;
          }
          lastIssue = `Expanded vocabulary generation failed for core ${coreTerm.id} (${coreTerm.word}): ${issue || "required relation coverage was incomplete"}.`;
          await saveCheckpointCategory("expandedTerms", [...expandedTerms, ...candidatesForCore]);
          }
        }
        if (!acceptedForCore) return { ok: false, issue: lastIssue || `Expanded vocabulary generation failed for core ${coreTerm.id} (${coreTerm.word}): required relation coverage was incomplete.` };
        const accepted = acceptedForCore.map((term, index) => ({ ...term, id: `${criteria.cefr.toLowerCase()}-expanded-${expandedTerms.length + index + 1}` }));
        expandedTerms.push(...accepted);
        await saveCheckpointCategory("expandedTerms", expandedTerms);
        return { ok: true };
      };
      let enrichmentRefill: Awaited<ReturnType<typeof runMonthlyEnrichmentWithRefill>> | undefined;
      if (firstIncompleteCore >= 0) {
        // Enrich concurrently; a core that cannot keep its required relations is
        // dropped and its slot refilled by the core phase (bounded cycles). When
        // cores are still missing, the accepted cores and supports are saved and
        // a shortfall error asks the Operator to run generation again.
        enrichmentRefill = await runMonthlyEnrichmentWithRefill({
          cefr: criteria.cefr,
          neededCount: criteria.vocabularyCount,
          coreTerms,
          expandedTerms,
          firstPendingIndex: firstIncompleteCore,
          enrichCore,
          refill: (initial, avoidWords) => runCorePhase(initial, avoidWords),
          save: async (state) => {
            await saveCheckpointCategory("coreTerms", state.coreTerms);
            await saveCheckpointCategory("expandedTerms", state.supportTerms);
          },
          onCoresChanged: () => {
            coreWords.clear();
            for (const term of coreTerms) coreWords.add(normalizeMonthlyResourceWord(term.word));
          },
          concurrency: 6,
          maxRefillCycles: 3
        });
        // Concurrent cores can each pick the same optional word. Drop surplus
        // optional repeats (never a core's only support of a required relation,
        // never below three supports) until the 35% ceiling holds again.
        const repeatedPlacements = () => expandedTerms.length - new Set(expandedTerms.map((term) => normalizeMonthlyResourceWord(term.word))).size;
        for (let index = expandedTerms.length - 1; index >= 0 && repeatedPlacements() > maxExpandedRepeats; index -= 1) {
          const term = expandedTerms[index]!;
          const word = normalizeMonthlyResourceWord(term.word);
          if (expandedTerms.filter((other) => normalizeMonthlyResourceWord(other.word) === word).length < 2) continue;
          const sameCore = expandedTerms.filter((other) => other.relatesToCoreId === term.relatesToCoreId);
          const sameRelation = sameCore.filter((other) => other.relation === term.relation);
          const termCore = coreTerms.find((core) => core.id === term.relatesToCoreId);
          const isRequired = (requiredSupportRelationsFor(termCore?.type) as readonly string[]).includes(term.relation);
          if (sameCore.length <= MONTHLY_MIN_SUPPORTS_PER_CORE || (isRequired && sameRelation.length < 2)) continue;
          expandedTerms.splice(index, 1);
        }
        await saveCheckpointCategory("expandedTerms", expandedTerms);
      }
      request.log.info({ month: month.month, cefr: criteria.cefr, phase: "enrichment", enrichedCores: firstIncompleteCore >= 0 ? coreTerms.length - firstIncompleteCore : 0, supports: expandedTerms.length, ...enrichmentStats, refillCycles: enrichmentRefill?.refillCycles ?? 0, refilledCores: enrichmentRefill?.refilledCores ?? 0, droppedCores: enrichmentRefill?.droppedCores ?? [], elapsedMs: Date.now() - enrichmentStartedAt }, "Monthly resource enrichment phase finished");

      const monthlyVocabularyForPronunciation = [...coreTerms, ...expandedTerms].map((term) => `${term.word} (${term.meaning})`).join("; ");
      updateProgress({phase:"grammarTopics",counts:{coreTerms:coreTerms.length,expandedTerms:expandedTerms.length}});
      let grammarResult = getMonthlyGrammarPhaseIssues(cachedGrammarResult, criteria.cefr, grammarPair).length === 0 ? cachedGrammarResult : undefined;
      if (!grammarResult) {
        grammarResult = await runMonthlyGrammarPhaseWithRetry((prompt) => runPhase(
          prompt,
          [],
          { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 2, pronunciationSoundCount: 0 }
        ), criteria.cefr, grammarPair);
        await saveCheckpointCategory("grammarTopics", grammarResult.grammarTopics);
      }
      updateProgress({phase:"pronunciationTargets",counts:{grammarTopics:grammarResult.grammarTopics.length}});
      // Roadmap pronunciation (11/11): the four items are picked deterministically
      // from the level catalog with a 12-month memory of the same level; the AI
      // only writes each item's label, explanation and examples.
      const pronunciationHistory = typeof repositories.monthlyContent.listPronunciationHistory === "function"
        ? await repositories.monthlyContent.listPronunciationHistory(actorId, criteria.cefr, month.month, MONTHLY_PRONUNCIATION_MEMORY_MONTHS)
        : [];
      const pronunciationSelection = selectMonthlyPronunciationItems({ cefr: criteria.cefr, month: month.month, history: pronunciationHistory });
      const pronunciationItems = pronunciationSelection.items;
      const pronunciationCatalog = monthlyPronunciationCatalog(criteria.cefr);
      request.log.info({ month: month.month, cefr: criteria.cefr, phase: "pronunciation-selection", items: pronunciationItems.map((item) => item.id), taught: pronunciationSelection.taughtIds, newCycle: pronunciationSelection.newCycle }, "Monthly pronunciation items selected");
      const coreWordList = coreTerms.map((term) => term.word);
      const cachedPronunciationTargets = readCheckpointCategory("pronunciationTargets", monthlyResourcePlanOutputSchema.shape.pronunciationTargets) ?? [];
      // A checkpointed target is reused only when it is the selected item for its slot and every gate still passes.
      const cachedPrefix: typeof cachedPronunciationTargets = [];
      for (const [index, target] of cachedPronunciationTargets.entries()) {
        const item = pronunciationItems[index];
        if (!item || target.ipa !== item.notation || target.words.length < pronunciationExampleCount || getMonthlyPronunciationTextIssues(criteria.cefr, target).length) break;
        const recheck = selectMonthlyPronunciationCandidates({ candidates: target.words, forbiddenWords: new Set(cachedPrefix.flatMap((prior) => prior.words.map((word) => normalizeMonthlyResourceWord(word.word)))), needed: target.words.length, catalogItem: item, coreTerms, totalForTarget: target.words.length });
        if (recheck.selected.length !== target.words.length) break;
        cachedPrefix.push(target);
      }
      const pronunciationTargets: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"] = cachedPrefix;
      const usedPronunciationWords = new Set<string>();
      for (const target of pronunciationTargets) for (const word of target.words) usedPronunciationWords.add(normalizeMonthlyResourceWord(word.word));
      const pronunciationSlots = ["P1 (N1–N3)", "P2 (N4–N6)", "P3 (N7–N9)", "P4 (N10–N12)"];
      updateProgress({counts:{pronunciationTargets:pronunciationTargets.length}});
      for (let soundIndex = pronunciationTargets.length; soundIndex < 4; soundIndex += 1) {
        updateProgress({current:soundIndex+1,total:4,counts:{pronunciationTargets:pronunciationTargets.length}});
        const item = pronunciationItems[soundIndex]!;
        const acceptedTargetWords: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"][number]["words"] = [];
        let acceptedText: { id: string; label: string; explanation: string } | undefined;
        let issue = "";
        // The item is fixed; a retry keeps accepted examples and text and only
        // repairs what the gates rejected (examples, explanation length, schema).
        let exampleRejections: string[] = [];
        let textIssues: string[] = [];
        let schemaIssue = "";
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const forbiddenForTarget = new Set([...usedPronunciationWords, ...acceptedTargetWords.map((word) => normalizeMonthlyResourceWord(word.word))]);
          const neededExamples = pronunciationExampleCount - acceptedTargetWords.length;
          const prompt = buildMonthlyCatalogPronunciationPrompt({
            cefr: criteria.cefr,
            slot: pronunciationSlots[soundIndex]!,
            item,
            monthItems: pronunciationItems,
            catalog: pronunciationCatalog,
            taughtIds: pronunciationSelection.taughtIds,
            neededExamples: Math.max(1, neededExamples),
            usedWords: [...usedPronunciationWords],
            acceptedWords: acceptedTargetWords.map((word) => word.word),
            coreWords: coreWordList,
            vocabulary: monthlyVocabularyForPronunciation,
            exampleRejections,
            textIssues,
            schemaIssue
          });
          let result: z.infer<typeof monthlyResourcePlanOutputSchema>;
          try {
            result = await runPhase(prompt, coreTerms, { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 1 });
          } catch (error) {
            if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID") {
              issue = buildMonthlyPronunciationSchemaRepairIssue(safeGenerationDiagnosticIssues(error));
              schemaIssue = issue;
              continue;
            }
            if (error instanceof z.ZodError) {
              // The output parsed as JSON but broke a field limit (e.g. explanation > 360 characters): repair it.
              issue = buildMonthlyPronunciationSchemaRepairIssue(error.issues.map((entry) => ({ path: entry.path.join("."), message: entry.message })));
              schemaIssue = issue;
              continue;
            }
            throw error;
          }
          schemaIssue = "";
          if (result.coreTerms.length || result.expandedTerms.length || result.grammarTopics.length || result.pronunciationTargets.length !== 1) {
            issue = "response must contain one pronunciation target only";
            schemaIssue = issue;
            continue;
          }
          const candidate = result.pronunciationTargets[0]!;
          if (!acceptedText) {
            textIssues = getMonthlyPronunciationTextIssues(criteria.cefr, candidate);
            if (!textIssues.length) acceptedText = { id: candidate.id, label: candidate.label.trim(), explanation: candidate.explanation.trim() };
          }
          // Examples are always checked against the fixed catalog item, whatever ipa the response used.
          if (acceptedTargetWords.length < pronunciationExampleCount) {
            const selection = selectMonthlyPronunciationCandidates({ candidates: candidate.words, forbiddenWords: forbiddenForTarget, needed: neededExamples, catalogItem: item, coreTerms, acceptedForTarget: acceptedTargetWords, totalForTarget: pronunciationExampleCount });
            // December 2026 ("ackle"): an independent real-word / British IPA check before an example is kept.
            const verified = await verifyMonthlyWords(runner, criteria.cefr, selection.selected.map((word) => ({ word: word.word, ipa: word.ipa, role: `pronunciation example of ${item.notation} (${item.labelEn})` })));
            for (const [index, reason] of verified) selection.rejected.push(`${selection.selected[index]!.word} (${reason})`);
            selection.selected = selection.selected.filter((_word, index) => !verified.has(index));
            acceptedTargetWords.push(...selection.selected);
            exampleRejections = acceptedTargetWords.length === pronunciationExampleCount ? [] : selection.rejected.length ? selection.rejected : [`only ${acceptedTargetWords.length} of ${pronunciationExampleCount} usable examples have been returned`];
          }
          if (acceptedText && acceptedTargetWords.length === pronunciationExampleCount) break;
          issue = [...textIssues, ...exampleRejections].join("; ");
        }
        if (!acceptedText || acceptedTargetWords.length !== pronunciationExampleCount) {
          throw new MonthlyResourcePlanError([`Pronunciation generation failed for ${pronunciationSlots[soundIndex]} (${item.id} ${item.notation}): ${issue || "incomplete target"}.`]);
        }
        const acceptedTarget = { id: acceptedText.id, ipa: item.notation, label: acceptedText.label, explanation: acceptedText.explanation, words: acceptedTargetWords };
        pronunciationTargets.push(acceptedTarget);
        for (const word of acceptedTarget.words) usedPronunciationWords.add(normalizeMonthlyResourceWord(word.word));
        await saveCheckpointCategory("pronunciationTargets", pronunciationTargets);
      }
      const normalizedExpandedTerms = expandedTerms.map((term, index) => ({ ...term, id: `${criteria.cefr.toLocaleLowerCase("en-US")}-expanded-${index + 1}` }));
      if (normalizedExpandedTerms.some((term, index) => term.id !== expandedTerms[index]?.id)) {
        await saveCheckpointCategory("expandedTerms", normalizedExpandedTerms);
      }
      updateProgress({phase:"saving",counts:{coreTerms:coreTerms.length,expandedTerms:normalizedExpandedTerms.length,grammarTopics:grammarResult.grammarTopics.length,pronunciationTargets:pronunciationTargets.length}});
      const plan = monthlyResourcePlanOutputSchema.parse({
        coreTerms,
        expandedTerms: normalizedExpandedTerms,
        grammarTopics: grammarResult.grammarTopics,
        pronunciationTargets
      });
      const pool = buildMonthlyResourcesFromAiPlan(month.month, criteria.cefr, theme, criteria, plan, pronunciationItems.map((item) => item.id), [grammarPair.topicA.id, grammarPair.topicB.id]);
      updateProgress({phase:"saving",counts:{coreTerms:pool.coreTerms.length,expandedTerms:pool.supportTerms.length,grammarTopics:pool.grammarTopics.length,pronunciationTargets:pool.sounds.length}});
      const framework = await repositories.monthlyContent.saveResourceDraft(actorId, pool);
      updateProgress({status:"completed"});
      logUsage("saved");
      return framework;
    } catch (error) {
      updateProgress({status:"failed"});
      logUsage(error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : error instanceof Error ? error.name : "failed");
      if (error instanceof MonthlyResourceCriteriaError) {
        return reply.code(422).send({ code: error.code, requiredVocabularyCount: error.requiredVocabularyCount });
      }
      if (error instanceof MonthlyResourcePlanError) {
        console.error("Monthly resource plan rejected", { issues: error.errors, month: month.month, cefr: criteria.cefr });
        request.log.warn({ issues: error.errors, month: month.month, cefr: criteria.cefr }, "Monthly resource plan rejected");
        return reply.code(422).send({ code: "MONTHLY_RESOURCE_PLAN_INVALID", issues: error.errors });
      }
      if (error instanceof RangeError) {
        request.log.warn({ message: error.message, month: month.month, cefr: criteria.cefr }, "Monthly resource pool rejected");
        return reply.code(422).send({ code: "MONTHLY_RESOURCE_PLAN_INVALID", issues: [error.message] });
      }
      if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID") {
        return reply.code(422).send({ code: "AI_OUTPUT_INVALID", issues: safeGenerationDiagnosticIssues(error) });
      }
      if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_TRUNCATED") {
        return reply.code(422).send({ code: "AI_OUTPUT_TRUNCATED", message: "A resource slice exceeded the AI output limit; no monthly resources were saved. Retry generation." });
      }
      throw error;
    }
  });

  // Core words already used by the other CEFR levels of the same month (WP9).
  const otherLevelCoreTerms = async (actorId: string, month: string, cefr: string) =>
    (await repositories.monthlyContent.getOverview(actorId, month)).frameworks
      .filter((framework) => framework.cefr !== cefr && framework.resources)
      .map((framework) => ({ cefr: framework.cefr, words: framework.resources!.coreTerms.map((term) => term.word) }));
  const manualResourcePool = async (actorId: string, month: string, cefr: z.infer<typeof resourceCheckpointQuery>["cefr"]) => {
    const overview = await repositories.monthlyContent.getOverview(actorId, month);
    if (!overview.monthWindow.writable) return { code: "MONTHLY_CONTENT_READ_ONLY" } as const;
    if (overview.brief?.status !== "approved") return { code: "MONTHLY_TOPIC_NOT_APPROVED" } as const;
    if (overview.frameworks.some(item => item.cefr === cefr)) return { code: "MONTHLY_FRAMEWORK_VERSION_CONFLICT" } as const;
    return blankMonthlyResourcePool(overview.brief, cefr);
  };
  app.get("/api/v1/content/months/:month/resources/manual", { preHandler: contentOperator }, async (request, reply) => {
    const { month } = params.parse(request.params);
    const { cefr } = resourceCheckpointQuery.parse(request.query);
    const pool = await manualResourcePool(request.e4sSession!.user.id, month, cefr);
    return "code" in pool ? reply.code(409).send(pool) : pool;
  });
  app.put("/api/v1/content/months/:month/resources/manual", { preHandler: contentOperator }, async (request, reply) => {
    const { month } = params.parse(request.params);
    const { cefr } = resourceCheckpointQuery.parse(request.query);
    const input = monthlyResourceEditInputSchema.parse(request.body);
    const actorId = request.e4sSession!.user.id;
    const pool = await manualResourcePool(actorId, month, cefr);
    if ("code" in pool) return reply.code(409).send(pool);
    if (input.expectedVersion !== pool.theme.version) return reply.code(409).send({ code: "MONTHLY_FRAMEWORK_VERSION_CONFLICT" });
    const edited = applyMonthlyResourceEdit(pool, input, { otherLevelCoreTerms: await otherLevelCoreTerms(actorId, month, cefr) });
    if (!edited.ok) return reply.code(422).send({ code: "MONTHLY_RESOURCE_EDIT_INVALID", issues: edited.issues, warnings: edited.warnings });
    const saved = await repositories.monthlyContent.saveResourceDraft(actorId, edited.pool, "manual");
    return edited.warnings.length ? { ...saved, warnings: edited.warnings } : saved;
  });

  app.post("/api/v1/content/month-frameworks/:id/approve", { preHandler: contentOperator }, async (request, reply) => {
    const input = frameworkParams.parse(request.params);
    try { await repositories.monthlyContent.approveFramework(request.e4sSession!.user.id, input.id); }
    catch (error) {
      // A reopened pool that cannot be re-planned is an Operator-fixable
      // resource problem (regenerate resources), not a server failure.
      if (error && typeof error === "object" && "code" in error && error.code === "MONTHLY_RESOURCE_PLAN_INVALID") {
        const issues = "issues" in error && Array.isArray(error.issues) ? error.issues : [];
        return reply.code(409).send({ code: "MONTHLY_RESOURCE_PLAN_INVALID", issues });
      }
      if (error instanceof RangeError) return reply.code(409).send({ code: "MONTHLY_RESOURCE_PLAN_INVALID", issues: [error.message] });
      throw error;
    }
    return reply.code(204).send();
  });

  // VH-R30/VH-R35: the Operator hand-edits a DRAFT resource pool. Approved
  // resources stay locked; reopening them goes through a Manager request.
  app.put("/api/v1/content/month-frameworks/:id/resources", { preHandler: contentOperator }, async (request, reply) => {
    const { id } = frameworkParams.parse(request.params);
    const actorId = request.e4sSession!.user.id;
    const parsed = monthlyResourceEditInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        code: "MONTHLY_RESOURCE_EDIT_INVALID",
        issues: parsed.error.issues.map((issue) => ({ section: "pool", message: `${issue.path.join(".")}: ${issue.message}` }))
      });
    }
    const draft = await repositories.monthlyContent.getResourceDraftForEdit(actorId, id);
    if (!draft || draft.status === "retired") return reply.code(404).send({ code: "MONTHLY_FRAMEWORK_NOT_FOUND" });
    if (draft.status !== "draft") return reply.code(409).send({ code: "MONTHLY_FRAMEWORK_IMMUTABLE" });
    if (!draft.writable) return reply.code(409).send({ code: "MONTHLY_CONTENT_READ_ONLY" });
    if (draft.version !== parsed.data.expectedVersion) return reply.code(409).send({ code: "MONTHLY_FRAMEWORK_VERSION_CONFLICT", currentVersion: draft.version });
    const edited = applyMonthlyResourceEdit(draft.pool, parsed.data, { otherLevelCoreTerms: await otherLevelCoreTerms(actorId, draft.month, draft.cefr) });
    if (!edited.ok) return reply.code(422).send({ code: "MONTHLY_RESOURCE_EDIT_INVALID", issues: edited.issues, warnings: edited.warnings });
    try {
      const saved = await repositories.monthlyContent.saveEditedResourceDraft(actorId, id, parsed.data.expectedVersion, edited.pool);
      return edited.warnings.length ? { ...saved, warnings: edited.warnings } : saved;
    } catch (error) {
      if (error instanceof RangeError) return reply.code(422).send({ code: "MONTHLY_RESOURCE_EDIT_INVALID", issues: [{ section: "pool", message: error.message }] });
      throw error;
    }
  });

  app.get("/api/v1/content/month-frameworks/:id/exam-scope", { preHandler: readers }, async (request, reply) => {
    const input = frameworkParams.parse(request.params);
    let contract;
    try { contract = await repositories.monthlyContent.getFrameworkContract(request.e4sSession!.user.id, input.id); }
    catch (error) { const response = invalidMonthlyPlanReply(reply, error); if (response) return response; throw error; }
    return buildMonthlyExamScope(contract);
  });

  app.put("/api/v1/content/month-frameworks/:id/days/:dayNumber", { preHandler: contentOperator }, async (request, reply) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    const input = lessonInput.parse(request.body);
    let contract;
    try { contract = await repositories.monthlyContent.getFrameworkContract(request.e4sSession!.user.id, id); }
    catch (error) { const response = invalidMonthlyPlanReply(reply, error); if (response) return response; throw error; }
    const teachingContract = contract.daySpecs.find(day => day.lessonNumber === dayNumber)?.reviewFromPreviousMonth ? await repositories.monthlyContent.getReviewTeachingContract(request.e4sSession!.user.id,id,dayNumber) : contract;
    const report = evaluateMonthlyLessonQuality(teachingContract, dayNumber, input, await priorMonthlyGrammarExamples(pool, id, contract, dayNumber));
    await repositories.monthlyContent.saveMonthlyDayDraft(request.e4sSession!.user.id, id, dayNumber, input, report);
    return report;
  });

  app.post("/api/v1/content/month-frameworks/:id/reviews/:dayNumber/generate", { preHandler: contentOperator }, async (request, reply) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    const actorId = request.e4sSession!.user.id;
    // Lock, window and resource checks come before any model call (December 2026 N1).
    await repositories.monthlyContent.assertMonthlyDayGenerationAllowed(actorId, id, dayNumber);
    const runner = await runnerFor(actorId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    let contract;
    let task;
    try {
      [contract, task] = await Promise.all([
        repositories.monthlyContent.getFrameworkContract(actorId, id),
        repositories.aiRuns.activeTaskPrompt(actorId, "monthly_lessons")
      ]);
    } catch (error) { const response = invalidMonthlyPlanReply(reply, error); if (response) return response; throw error; }
    const day = contract.daySpecs.find((candidate) => candidate.lessonNumber === dayNumber);
    if (!day || day.kind !== "review") return reply.code(409).send({ code: "NOT_A_FRIDAY_REVIEW" });
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    let result;
    try {
      const teachingContract = await repositories.monthlyContent.getReviewTeachingContract(actorId,id,dayNumber);
      result = await generateMonthlyReviewWithAi(teachingContract, dayNumber, runner, task.prompt, { verifyAnswers: true });
      result.scopeHash = monthlyScopeHash(contract);
    } catch (error) {
      const response = invalidMonthlyPlanReply(reply,error); if (response) return response;
      const failure = monthlyGenerationFailure(error);
      if (failure) {
        console.warn("[monthly-lesson-generation-failed]", JSON.stringify({ frameworkId: id, dayNumber, ...failure.body }));
        return reply.code(failure.status).send(failure.body);
      }
      throw error;
    }
    if (result.status !== "ready" || !result.lesson) {
      // Keep the final failing candidate beside (never over) the current draft so the Operator can see why (N3).
      await repositories.monthlyContent.saveMonthlyDayGenerationFailure(actorId, id, dayNumber, { candidate: result.candidate ?? null, report: result.report, attempts: result.attempts });
      return reply.code(422).send({ code: "MONTHLY_GENERATION_QUALITY_FAILED", report: result.report, attempts: result.attempts, candidate: result.candidate ?? null });
    }
    // Listening audio (Edge TTS) right after generation; a failure is marked on the part and the lesson is still saved.
    result.lesson = (await withLessonListeningAudio(result.lesson, listeningAudio, actorId)).lesson;
    await repositories.monthlyContent.saveMonthlyDayDraft(actorId, id, dayNumber, result.lesson, result.report);
    return result;
  });
  app.post("/api/v1/content/month-frameworks/:id/days/:dayNumber/generate", { preHandler: contentOperator }, async (request, reply) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    const actorId = request.e4sSession!.user.id;
    // Lock, window and resource checks come before any model call (December 2026 N1).
    await repositories.monthlyContent.assertMonthlyDayGenerationAllowed(actorId, id, dayNumber);
    const runner = await runnerFor(actorId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    let contract;
    let task;
    try {
      [contract, task] = await Promise.all([
        repositories.monthlyContent.getFrameworkContract(actorId, id),
        repositories.aiRuns.activeTaskPrompt(actorId, "monthly_lessons")
      ]);
    } catch (error) { const response = invalidMonthlyPlanReply(reply, error); if (response) return response; throw error; }
    const day = contract.daySpecs.find((candidate) => candidate.lessonNumber === dayNumber);
    if (!day || day.kind !== "new") return reply.code(409).send({ code: "NOT_A_NEW_MONTHLY_DAY" });
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    let result;
    try {
      result = await generateMonthlyDayWithAi(contract, dayNumber, runner, task.prompt, await priorMonthlyGrammarExamples(pool, id, contract, dayNumber), { verifyAnswers: true });
    } catch (error) {
      const failure = monthlyGenerationFailure(error);
      if (failure) {
        console.warn("[monthly-lesson-generation-failed]", JSON.stringify({ frameworkId: id, dayNumber, ...failure.body }));
        return reply.code(failure.status).send(failure.body);
      }
      throw error;
    }
    if (result.status !== "ready" || !result.lesson) {
      // Keep the final failing candidate beside (never over) the current draft so the Operator can see why (N3).
      await repositories.monthlyContent.saveMonthlyDayGenerationFailure(actorId, id, dayNumber, { candidate: result.candidate ?? null, report: result.report, attempts: result.attempts });
      return reply.code(422).send({ code: "MONTHLY_GENERATION_QUALITY_FAILED", report: result.report, attempts: result.attempts, candidate: result.candidate ?? null });
    }
    // Listening audio (Edge TTS) right after generation; a failure is marked on the part and the lesson is still saved.
    result.lesson = (await withLessonListeningAudio(result.lesson, listeningAudio, actorId)).lesson;
    await repositories.monthlyContent.saveMonthlyDayDraft(actorId, id, dayNumber, result.lesson, result.report);
    return result;
  });

  app.post("/api/v1/content/month-frameworks/:id/days/:dayNumber/quality-acknowledgement", { preHandler: contentOperator }, async (request, reply) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    const input = qualityAcknowledgementInput.parse(request.body);
    await repositories.monthlyContent.acknowledgeMonthlyDayQuality(request.e4sSession!.user.id, id, dayNumber, input.findingKeys);
    return reply.code(204).send();
  });

  app.post("/api/v1/content/month-frameworks/:id/days/:dayNumber/approve", { preHandler: contentOperator }, async (request, reply) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    await repositories.monthlyContent.approveMonthlyDay(request.e4sSession!.user.id, id, dayNumber);
    return reply.code(204).send();
  });

  app.post("/api/v1/content/month-frameworks/:id/days/:dayNumber/corrections", { preHandler: contentOperator }, async (request) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    const input = correctionInput.parse(request.body);
    const correctionId = await repositories.monthlyContent.createMonthlyCorrection(request.e4sSession!.user.id, id, dayNumber, input.reason);
    return { id: correctionId, status: "requested" as const };
  });

  app.put("/api/v1/content/month-frameworks/:id/days/:dayNumber/corrections/:correctionId", { preHandler: contentOperator }, async (request, reply) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    const { correctionId } = correctionParams.parse(request.params);
    const input = lessonInput.parse(request.body);
    let contract;
    try { contract = await repositories.monthlyContent.getFrameworkContract(request.e4sSession!.user.id, id); }
    catch (error) { const response = invalidMonthlyPlanReply(reply, error); if (response) return response; throw error; }
    const report = evaluateMonthlyLessonQuality(contract, dayNumber, input);
    await repositories.monthlyContent.saveMonthlyCorrection(request.e4sSession!.user.id, correctionId, input, report);
    return report;
  });

  app.post("/api/v1/content/monthly-corrections/:correctionId/quality-acknowledgement", { preHandler: contentOperator }, async (request, reply) => {
    const { correctionId } = correctionParams.parse(request.params);
    const input = qualityAcknowledgementInput.parse(request.body);
    await repositories.monthlyContent.acknowledgeMonthlyCorrectionQuality(request.e4sSession!.user.id, correctionId, input.findingKeys);
    return reply.code(204).send();
  });

  app.post("/api/v1/content/monthly-corrections/:correctionId/approve", { preHandler: contentOperator }, async (request, reply) => {
    const { correctionId } = correctionParams.parse(request.params);
    await repositories.monthlyContent.approveMonthlyCorrection(request.e4sSession!.user.id, correctionId);
    return reply.code(204).send();
  });
}

function normalizeMonthlyResourceWord(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[\s\p{P}]+/gu, " ").trim();
}

function invalidMonthlyPlanReply(reply: FastifyReply, error: unknown): FastifyReply | undefined {
  if (error && typeof error === "object" && "code" in error && error.code === "MONTHLY_PREVIOUS_REVIEW_SCOPE_REQUIRED") return reply.code(409).send({code:error.code,message:"Cần tài nguyên đã chốt của tháng trước để tạo bài ôn chuyển tháng."});
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "MONTHLY_FRAMEWORK_PLAN_INVALID") return undefined;
  const issues = "issues" in error && Array.isArray(error.issues) ? error.issues : [];
  return reply.code(409).send({ code: "MONTHLY_FRAMEWORK_PLAN_INVALID", issues });
}

async function priorMonthlyGrammarExamples(pool: Pool, frameworkId: string, contract: MonthlyCurriculumContract, dayNumber: number): Promise<string[]> {
  if (contract.planSchemaVersion !== 2) return [];
  const earlier = contract.daySpecs.filter(day => day.kind === "new" && day.lessonNumber < dayNumber).map(day => day.lessonNumber);
  if (!earlier.length) return [];
  const result = await pool.query<{content: {parts?: Array<{code: string; content: {examples?: unknown}}>}}>(`select lv.content from month_lessons ml join lateral (select content from lesson_versions where lesson_id = ml.lesson_id order by version desc limit 1) lv on true where ml.framework_id = $1 and ml.scope_hash = $2 and ml.lesson_number = any($3::int[]) and ml.status in ('draft','approved')`, [frameworkId, (await pool.query<{scope_hash:string}>("select scope_hash from month_frameworks where id = $1",[frameworkId])).rows[0]?.scope_hash, earlier]);
  return result.rows.flatMap(row => row.content.parts?.filter(part => part.code === "grammar").flatMap(part => Array.isArray(part.content.examples) ? part.content.examples.filter((value): value is string => typeof value === "string") : []) ?? []);
}
