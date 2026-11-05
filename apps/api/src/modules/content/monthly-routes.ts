import { buildMonthlyCalendar, buildMonthlyExamScope, monthlyDayKind, type MonthlyCurriculumContract } from "@e4s/domain";
import { monthlyResourcePlanOutputSchema, monthlyTopicSuggestionOutputSchema, type AiTaskRunner } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import { evaluateMonthlyLessonQuality } from "./monthly-quality.js";
import { generateMonthlyDayWithAi, generateMonthlyReviewWithAi, MONTHLY_DAY_COMPONENTS } from "./monthly-day-generation.js";
import { buildMonthlyCoreCandidatesPrompt, buildMonthlyOptionalSupportPrompt, buildMonthlyPronunciationDistinctnessConstraint, buildMonthlyPronunciationSchemaRepairIssue, buildMonthlyResourcesFromAiPlan, buildMonthlySupportRelationAuditPrompt, buildMonthlySupportRelationCandidatePrompt, CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS, doesMonthlyPronunciationExampleMatch, getMonthlyGrammarPhaseIssues, getMonthlyPronunciationTargetIssue, hasSingleCoreSense, isCurrentMonthlyResourceCheckpointCategory, isGenuineWordFamily, isSingleHeadword, keepExactMonthlySupportRelationCandidates, keepSemanticallyAuditedSupportCandidates, MonthlyResourceCriteriaError, MonthlyResourcePlanError, parseMonthlyResourceAiOutput, runMonthlyGrammarPhaseWithRetry, selectMonthlyCoreCandidates, selectMonthlyPronunciationCandidates, selectMonthlySupportCandidates } from "./monthly-resource-generation.js";
import { isPronunciationTargetAllowedForLevel, isValidMonthlyPronunciationIpaTarget } from "./monthly-resource-plan-spec.js";
import { safeGenerationDiagnosticIssues } from "./generation-errors.js";

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
const supportTerm = z.object({ id: z.string().min(1), word: z.string().min(1), meaning: z.string(), type: z.string().min(1), relation: z.enum(["umbrella", "synonym", "antonym", "word_family", "collocation"]), source: z.enum(["example", "family", "synonym", "antonym", "group", "manual"]), component: z.literal("expanded"), dayNumber: z.int().positive(), relatedCoreTermId: z.string().min(1) });
const frameworkInput = z.object({
  contract: z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u), cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]), version: z.int().positive(),
    theme: z.object({ version: z.int().positive(), title: z.string(), brief: z.string(), context: z.string(), communicationGoal: z.string() }),
    coreTerms: z.array(coreTerm), supportTerms: z.array(supportTerm),
    grammarTopics: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), steps: z.array(z.object({ id: z.string().min(1), focus: z.string(), formula: z.string().min(1), usage: z.string(), examples: z.array(z.string()) })).min(1) })),
    sounds: z.array(z.object({ id: z.string().min(1), ipa: z.string().min(1), label: z.string().min(1), examples: z.array(z.object({ id: z.string().min(1), word: z.string().min(1), ipa: z.string().min(1) })) })),
    daySpecs: z.array(z.object({ lessonNumber: z.int().positive(), date: z.string().date(), kind: z.enum(["new", "review"]), coreTermIds: z.array(z.string()), expandedTermIds: z.array(z.string()), reviewTermIds: z.array(z.string()), reviewExpandedTermIds: z.array(z.string()), skillExercises: z.array(z.object({ exerciseCode: z.enum(["listening", "reading", "writing", "word_class", "word_use", "speaking"]), focus: z.string().min(1), resourceIds: z.array(z.string()).min(1) })).length(6), grammarStepId: z.string().min(1), grammarStepIds: z.array(z.string()).optional(), soundId: z.string().min(1), pronunciationSlot: z.string().optional(), pronunciationExampleIds: z.array(z.string()) }))
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
export function registerMonthlyContentRoutes(app: FastifyInstance, pool: Pool, aiRunner?: AiTaskRunner, aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>): void {
  const repositories = createRepositories(pool);
  const operator = createRoleGuard(pool, ["operator"]);
  const contentOperator = createRoleGuard(pool, ["operator"]);
  const manager = createRoleGuard(pool, ["manager"]);

  app.get("/api/v1/manager/reopen-requests", { preHandler: manager }, async (request) => {
    return { requests: await repositories.monthlyContent.listReopenRequests(request.e4sSession!.user.id) };
  });

  app.post("/api/v1/manager/reopen-requests/:correctionId/approve", { preHandler: manager }, async (request) => {
    const { correctionId } = correctionParams.parse(request.params);
    const input = reopenDecisionInput.parse(request.body);
    return repositories.monthlyContent.decideReopenRequest(request.e4sSession!.user.id, correctionId, "approved", input.reason);
  });

  app.post("/api/v1/manager/reopen-requests/:correctionId/reject", { preHandler: manager }, async (request) => {
    const { correctionId } = correctionParams.parse(request.params);
    const input = reopenDecisionInput.parse(request.body);
    return repositories.monthlyContent.decideReopenRequest(request.e4sSession!.user.id, correctionId, "rejected", input.reason);
  });
  app.post("/api/v1/manager/month-frameworks/:id/retire", { preHandler: manager }, async (request, reply) => {
    const { id } = frameworkParams.parse(request.params);
    const { reason } = retireFrameworkInput.parse(request.body);
    await repositories.monthlyContent.retireFramework(request.e4sSession!.user.id, id, reason);
    return reply.code(204).send();
  });
  app.get("/api/v1/content/months/:month", { preHandler: operator }, async (request) => {
    const input = params.parse(request.params);
    return repositories.monthlyContent.getOverview(request.e4sSession!.user.id, input.month);
  });

  app.put("/api/v1/content/months/:month/brief", { preHandler: contentOperator }, async (request) => {
    const month = params.parse(request.params);
    const input = briefInput.parse(request.body);
    return repositories.monthlyContent.saveBrief(request.e4sSession!.user.id, { month: month.month, ...input });
  });

  app.post("/api/v1/content/months/:month/brief/suggest", { preHandler: contentOperator }, async (request, reply) => {
    const month = params.parse(request.params);
    const actorId = request.e4sSession!.user.id;
    const runner = await aiRunnerFactory?.(actorId) ?? aiRunner;
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const [overview, task] = await Promise.all([
      repositories.monthlyContent.getOverview(actorId, month.month),
      repositories.aiRuns.activeTaskPrompt(actorId, "monthly_topic_suggestion")
    ]);
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
      && checkpointExpandedTerms.length >= newLessonCount * 3 * 6
      && checkpointExpandedTerms.length <= counts.expandedTerms
      && checkpointCoreTerms.every((core) => {
        const supports = checkpointExpandedTerms.filter((term) => term.relatesToCoreId === core.id);
        const relations = new Set(supports.map((term) => term.relation));
        return supports.length >= 6 && supports.length <= 9 && ["umbrella", "synonym", "word_family"].every((relation) => relations.has(relation as typeof supports[number]["relation"]));
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
    const brief = overview.brief;
    if (!brief || brief.status !== "approved") return reply.code(409).send({ code: "MONTHLY_TOPIC_NOT_APPROVED" });
    if (overview.frameworks.some((framework) => framework.cefr === criteria.cefr && framework.status === "approved")) {
      return reply.code(409).send({ code: "MONTHLY_FRAMEWORK_IMMUTABLE" });
    }
    const calendar = buildMonthlyCalendar(month.month);
    const newLessonCount = calendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, calendar) === "new").length;
    const requiredVocabularyCount = newLessonCount * 3;
    const minimumExpandedVocabularyCount = newLessonCount * 3 * 6;
    const maximumExpandedVocabularyCount = newLessonCount * 27;
    if (criteria.vocabularyCount !== requiredVocabularyCount) {
      return reply.code(422).send({ code: "VOCABULARY_COUNT_MISMATCH", requiredVocabularyCount });
    }
    if (criteria.expandedVocabularyCount < minimumExpandedVocabularyCount || criteria.expandedVocabularyCount > maximumExpandedVocabularyCount) {
      return reply.code(422).send({ code: "EXPANDED_VOCABULARY_COUNT_MISMATCH", minimumExpandedVocabularyCount, maximumExpandedVocabularyCount });
    }
    if (criteria.grammarTopicCount !== 2 || criteria.pronunciationSoundCount !== 4) {
      return reply.code(422).send({ code: "MONTHLY_RESOURCE_CRITERIA_MISMATCH", requiredGrammarTopicCount: 2, requiredPronunciationSoundCount: 4 });
    }
    const [task, configuredRunner] = await Promise.all([
      repositories.aiRuns.activeTaskPrompt(actorId, "monthly_resource_generation"),
      aiRunnerFactory ? aiRunnerFactory(actorId) : Promise.resolve(aiRunner)
    ]);
    const runner = configuredRunner ?? aiRunner;
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      let checkpoint = await repositories.monthlyContent.getResourceGenerationCheckpoint(actorId, month.month, criteria.cefr);
      const generationId = checkpoint?.generationId ?? randomUUID();
      const readCheckpointCategory = <T>(key: string, schema: z.ZodType<T>): T | undefined => {
        const source = checkpoint?.sourceLineage[key];
        if (!isCurrentMonthlyResourceCheckpointCategory(key, source)) return undefined;
        const parsed = schema.safeParse(checkpoint?.categories[key]);
        return parsed.success ? parsed.data : undefined;
      };
      const saveCheckpointCategory = async (key: string, value: unknown) => {
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
        coreTermBatch,
        targets
      });
      const runPhase = async (phasePrompt: string, coreTermBatch: Array<{ id: string; word: string; meaning: string; type: string; ipa: string }>, targets: { vocabularyCount: number; expandedVocabularyCount: number; grammarTopicCount: number; pronunciationSoundCount: number }, options: { temperature?: number } = {}) => {
        const generated = await runner.runTask("monthly_resource_generation", phaseInput(coreTermBatch, targets), {
          systemPrompt: `${task.prompt}\n\n${phasePrompt}`,
          maxOutputTokens: 6_000,
          temperature: options.temperature ?? 0.15,
          maxAttempts: 2
        });
        return parseMonthlyResourceAiOutput(generated.output);
      };
      const coreTerms: z.infer<typeof monthlyResourcePlanOutputSchema>["coreTerms"] = readCheckpointCategory("coreTerms", monthlyResourcePlanOutputSchema.shape.coreTerms) ?? [];
      const coreWords = new Set<string>();
      const preflightSupportTerms: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] = [];
      const maxExpandedRepeats = Math.floor(criteria.expandedVocabularyCount * 0.25);
      const maxExpandedPhrases = Math.floor(criteria.expandedVocabularyCount * 0.25);
      const cachedCoreValid = coreTerms.length === criteria.vocabularyCount
        && coreTerms.every((term) => isSingleHeadword(term.word))
        && coreTerms.every((term) => hasSingleCoreSense(term.type, term.meaning))
        && new Set(coreTerms.map((term) => normalizeMonthlyResourceWord(term.word))).size === coreTerms.length;
      if (!cachedCoreValid) coreTerms.length = 0;
      for (const term of coreTerms) coreWords.add(normalizeMonthlyResourceWord(term.word));
      for (let batchIndex = coreTerms.length / 3; batchIndex < newLessonCount; batchIndex += 1) {
        let accepted: z.infer<typeof monthlyResourcePlanOutputSchema>["coreTerms"] | undefined;
        let acceptedSupports: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] = [];
        let issue = "";
        let rejectedCoreWords: string[] = [];
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const candidateCount = attempt === 0 ? 6 : 12;
          const prompt = buildMonthlyCoreCandidatesPrompt({
            cefr: criteria.cefr,
            theme: theme.title,
            communicationGoal: theme.communicationGoal,
            existingCoreWords: [...coreWords, ...rejectedCoreWords],
            batchNumber: batchIndex + 1,
            candidateCount,
            preflightRelations: true,
            rejectedWords: rejectedCoreWords,
            previousIssue: issue
          });
          const result = await runPhase(prompt, [], { vocabularyCount: candidateCount, expandedVocabularyCount: candidateCount * 3, grammarTopicCount: 0, pronunciationSoundCount: 0 });
          if (result.grammarTopics.length || result.pronunciationTargets.length) {
            issue = "core suitability batch included unrelated grammar or pronunciation categories";
            continue;
          }
          const batchCoreWords = new Set(result.coreTerms.map((term) => normalizeMonthlyResourceWord(term.word)));
          const batchIds = new Set(result.coreTerms.map((term) => term.id));
          if (result.coreTerms.length !== candidateCount || batchIds.size !== result.coreTerms.length) {
            issue = `core suitability batch needs ${candidateCount} candidates with unique IDs; received ${result.coreTerms.length}`;
            rejectedCoreWords = [...new Set([...rejectedCoreWords, ...result.coreTerms.map((term) => term.word)])];
            continue;
          }
          const selectedCores: z.infer<typeof monthlyResourcePlanOutputSchema>["coreTerms"] = [];
          const selectedSupportEdges: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] = [];
          const candidateFailures: string[] = [];
          for (const candidate of result.coreTerms) {
            const eligibleCore = selectMonthlyCoreCandidates({
              candidates: [candidate],
              existingCoreWords: new Set([...coreWords, ...selectedCores.map((term) => normalizeMonthlyResourceWord(term.word))]),
              needed: 1
            }).selected[0];
            if (!eligibleCore) {
              candidateFailures.push(`${candidate.word}: duplicate, mixed-sense, or overlapping core`);
              continue;
            }
            const candidateEdges = result.expandedTerms.filter((term) => term.relatesToCoreId === candidate.id);
            const auditPrompt = buildMonthlySupportRelationAuditPrompt({ core: candidate, candidates: candidateEdges });
            let auditedOutput: z.infer<typeof monthlyResourcePlanOutputSchema>;
            try {
              const audited = await runner.runTask("monthly_resource_generation", phaseInput([candidate], { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 0 }), {
                systemPrompt: auditPrompt,
                maxOutputTokens: 3_500,
                temperature: 0,
                maxAttempts: 2
              });
              auditedOutput = parseMonthlyResourceAiOutput(audited.output);
            } catch (error) {
              if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID") {
                candidateFailures.push(`${candidate.word}: relation audit output was invalid`);
                continue;
              }
              throw error;
            }
            const auditedEdges = keepSemanticallyAuditedSupportCandidates(candidateEdges, auditedOutput.expandedTerms);
            const candidateCoreForbidden = new Set([...coreWords, ...batchCoreWords]);
            const selectedEdges = selectMonthlySupportCandidates({
              candidates: auditedEdges,
              coreId: candidate.id,
              coreWord: candidate.word,
              coreType: candidate.type,
              coreWords: candidateCoreForbidden,
              sameCoreWords: new Set(),
              sameCoreRelations: new Set(),
              existingSupportWords: [...preflightSupportTerms, ...selectedSupportEdges].map((term) => term.word),
              maxRepeatedPlacements: maxExpandedRepeats,
              maxPhrasePlacements: maxExpandedPhrases,
              needed: 3
            }).selected;
            const selectedRelations = new Set(selectedEdges.map((term) => term.relation));
            if (selectedEdges.length !== 3 || !["umbrella", "synonym", "word_family"].every((relation) => selectedRelations.has(relation as typeof selectedEdges[number]["relation"]))) {
              const relationSummary = (terms: typeof candidateEdges) => ["umbrella", "synonym", "word_family"].map((relation) => {
                const words = terms.filter((term) => term.relation === relation).map((term) => term.word).slice(0, 3);
                return `${relation}=${words.join("/") || "∅"}`;
              }).join(", ");
              candidateFailures.push(`${candidate.word}: generated [${relationSummary(candidateEdges)}], audit kept [${relationSummary(auditedEdges)}], selected [${relationSummary(selectedEdges)}]`);
              continue;
            }
            const finalId = `${criteria.cefr.toLowerCase()}-core-${batchIndex * 3 + selectedCores.length + 1}`;
            selectedCores.push({ ...eligibleCore, id: finalId });
            selectedSupportEdges.push(...selectedEdges.map((term) => ({ ...term, relatesToCoreId: finalId })));
            if (selectedCores.length === 3) break;
          }
          if (selectedCores.length === 3) {
            accepted = selectedCores;
            acceptedSupports = selectedSupportEdges;
            break;
          }
          issue = `batch ${batchIndex + 1} preflight found only ${selectedCores.length} of 3 usable core candidates. ${candidateFailures.join("; ") || "No candidate passed the required umbrella, synonym, and word-family checks."}`;
          rejectedCoreWords = [...new Set([...rejectedCoreWords, ...result.coreTerms.map((term) => term.word)])];
        }
        if (!accepted) throw new MonthlyResourcePlanError([`Core vocabulary generation failed: ${issue}.`]);
        coreTerms.push(...accepted);
        accepted.forEach((term) => coreWords.add(normalizeMonthlyResourceWord(term.word)));
        preflightSupportTerms.push(...acceptedSupports);
      }
      if (!cachedCoreValid) await saveCheckpointCategory("coreTerms", coreTerms);
      if (preflightSupportTerms.length) await saveCheckpointCategory("expandedTerms", preflightSupportTerms);

      const cachedExpandedBeforeCoreExclusion = readCheckpointCategory("expandedTerms", monthlyResourcePlanOutputSchema.shape.expandedTerms) ?? [];
      const cachedExpanded = cachedExpandedBeforeCoreExclusion.filter((term) => !coreWords.has(normalizeMonthlyResourceWord(term.word)));
      if (cachedExpanded.length !== cachedExpandedBeforeCoreExclusion.length) await saveCheckpointCategory("expandedTerms", cachedExpanded);
      const cachedSupportsByCore = new Map(coreTerms.map((core) => [core.id, cachedExpanded.filter((term) => term.relatesToCoreId === core.id)]));
      const expandedTerms: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] = [];
      for (const core of coreTerms) {
        const supports = cachedSupportsByCore.get(core.id) ?? [];
        const uniqueWords = new Set(supports.map((term) => normalizeMonthlyResourceWord(term.word)));
        const validPartialSupports = supports.length <= 9
          && uniqueWords.size === supports.length
          && supports.every((term) => term.relatesToCoreId === core.id
            && !coreWords.has(normalizeMonthlyResourceWord(term.word))
            && (term.relation !== "word_family" || isGenuineWordFamily(core.word, term.word)));
        if (validPartialSupports) expandedTerms.push(...supports);
      }
      if (expandedTerms.length !== cachedExpanded.length) await saveCheckpointCategory("expandedTerms", expandedTerms);
      const isCompleteCoreSupportSet = (core: typeof coreTerms[number]) => {
        const supports = expandedTerms.filter((term) => term.relatesToCoreId === core.id);
        const relations = new Set(supports.map((term) => term.relation));
        return supports.length >= 6 && supports.length <= 9
          && ["umbrella", "synonym", "word_family"].every((relation) => relations.has(relation as typeof supports[number]["relation"]))
          && supports.some((term) => term.relation === "word_family" && isGenuineWordFamily(core.word, term.word));
      };
      for (let coreIndex = coreTerms.findIndex((core) => !isCompleteCoreSupportSet(core)); coreIndex >= 0 && coreIndex < coreTerms.length; coreIndex += 1) {
        let coreTerm = coreTerms[coreIndex]!;
        const cachedTermsForCore = expandedTerms.filter((term) => term.relatesToCoreId === coreTerm.id);
        for (let index = expandedTerms.length - 1; index >= 0; index -= 1) {
          if (expandedTerms[index]!.relatesToCoreId === coreTerm.id) expandedTerms.splice(index, 1);
        }
        const baseSupportLimit = Math.floor(criteria.expandedVocabularyCount / coreTerms.length);
        const extraSupportSlots = criteria.expandedVocabularyCount % coreTerms.length;
        const supportLimitForCore = baseSupportLimit + (coreIndex < extraSupportSlots ? 1 : 0);
        let acceptedForCore: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] | undefined;
        let lastIssue = "";
        let replacementAttempt = 0;
        let candidatesForCore = [...cachedTermsForCore];
        while (!acceptedForCore) {
          const requiredRelations = ["umbrella", "synonym", "word_family"] as const;
          const rejectedCandidatesByRelation = new Map<(typeof requiredRelations)[number], Set<string>>();
          const rejectedOptionalCandidates = new Set<string>();
          let optionalPreviousIssue = "";
          for (let supportPassAttempt = 0; supportPassAttempt < 5 && !acceptedForCore; supportPassAttempt += 1) {
          let issue = "";
          for (const relation of requiredRelations) {
            if (candidatesForCore.some((term) => term.relation === relation)) continue;
            let relationAccepted = false;
            let relationIssue = "";
            const rejectedCandidateWords = rejectedCandidatesByRelation.get(relation) ?? new Set<string>();
            rejectedCandidatesByRelation.set(relation, rejectedCandidateWords);
            for (let attempt = 0; attempt < 3 && !relationAccepted; attempt += 1) {
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
              const result = await runPhase(prompt, [coreTerm], { vocabularyCount: 0, expandedVocabularyCount: 12, grammarTopicCount: 0, pronunciationSoundCount: 0 }, { temperature: 0.35 });
              const relationCandidates = keepExactMonthlySupportRelationCandidates(result.expandedTerms, relation, coreTerm.id);
              const mislabeledCandidates = result.expandedTerms.filter((term) => !relationCandidates.includes(term));
              mislabeledCandidates.forEach((term) => rejectedCandidateWords.add(term.word));
              if (!relationCandidates.length && result.expandedTerms.length) {
                relationIssue = `the model generated ${result.expandedTerms.length} support candidates, but none had exact relation ${relation} linked to ${coreTerm.id}; rejected labels: ${mislabeledCandidates.slice(0, 4).map((term) => `${term.word} (${term.relation} → ${term.relatesToCoreId})`).join(", ")}`;
                continue;
              }
              if (!relationCandidates.length) {
                relationIssue = `the model returned no candidates for relation ${relation}`;
                continue;
              }
              if (result.coreTerms.length || result.grammarTopics.length || result.pronunciationTargets.length) {
                request.log.warn({ month: month.month, cefr: criteria.cefr, coreId: coreTerm.id, relation }, "Monthly relation phase returned non-support categories; ignoring them");
              }
              const auditPrompt = buildMonthlySupportRelationAuditPrompt({ core: coreTerm, candidates: relationCandidates });
              let auditResult: z.infer<typeof monthlyResourcePlanOutputSchema>;
              try {
                const audited = await runner.runTask("monthly_resource_generation", phaseInput([coreTerm], { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 0 }), {
                  systemPrompt: auditPrompt,
                  maxOutputTokens: 3_500,
                  temperature: 0,
                  maxAttempts: 2
                });
                auditResult = parseMonthlyResourceAiOutput(audited.output);
              } catch (error) {
                if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID") {
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
          // Optional terms are generated only after the three required slots pass.
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
              const result = await runPhase(optionalPrompt, [coreTerm], { vocabularyCount: 0, expandedVocabularyCount: optionalCount, grammarTopicCount: 0, pronunciationSoundCount: 0 });
              if (result.coreTerms.length || result.grammarTopics.length || result.pronunciationTargets.length) {
                issue = "optional support generation returned non-support categories";
                continue;
              }
              const auditPrompt = buildMonthlySupportRelationAuditPrompt({ core: coreTerm, candidates: result.expandedTerms });
              let auditResult: z.infer<typeof monthlyResourcePlanOutputSchema>;
              try {
                const audited = await runner.runTask("monthly_resource_generation", phaseInput([coreTerm], { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 0 }), {
                  systemPrompt: auditPrompt,
                  maxOutputTokens: 3_500,
                  temperature: 0,
                  maxAttempts: 2
                });
                auditResult = parseMonthlyResourceAiOutput(audited.output);
              } catch (error) {
                if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID") {
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
              const auditedCandidates = keepSemanticallyAuditedSupportCandidates(result.expandedTerms, auditResult.expandedTerms);
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
          const finalRelations = new Set(candidatesForCore.map((term) => term.relation));
          const coreHasMinimumRelations = ["umbrella", "synonym", "word_family"].every((relation) => finalRelations.has(relation as typeof candidatesForCore[number]["relation"]));
          if (candidatesForCore.length >= 6 && coreHasMinimumRelations) {
            acceptedForCore = candidatesForCore;
            break;
          }
          lastIssue = `Expanded vocabulary generation failed for core ${coreTerm.id} (${coreTerm.word}): ${issue || "required relation coverage was incomplete"}.`;
          await saveCheckpointCategory("expandedTerms", [...expandedTerms, ...candidatesForCore]);
          }
          if (acceptedForCore || replacementAttempt >= 1) break;

          // A core is replaced only after five distinct support passes have
          // exhausted candidates for its exact meaning. Keep this to one
          // evidence-backed replacement so a weak candidate prompt cannot
          // silently churn through a succession of core words.
          const oldCoreWord = normalizeMonthlyResourceWord(coreTerm.word);
          const existingOtherCoreWords = new Set([
            ...coreTerms.filter((_term, index) => index !== coreIndex).map((term) => normalizeMonthlyResourceWord(term.word)),
            oldCoreWord,
            ...expandedTerms.map((term) => normalizeMonthlyResourceWord(term.word))
          ]);
          const replacementPrompt = buildMonthlyCoreCandidatesPrompt({
            cefr: criteria.cefr,
            theme: theme.title,
            communicationGoal: theme.communicationGoal,
            existingCoreWords: [...existingOtherCoreWords],
            batchNumber: coreIndex + 1,
            neededCount: 1,
            candidateCount: 12,
            rejectedWords: [coreTerm.word],
            previousIssue: `${lastIssue} Replace this core only with a distinct single-sense headword whose family form retains the exact meaning and whose umbrella and synonym have clear common examples.`
          });
          const replacementResult = await runPhase(replacementPrompt, [], { vocabularyCount: 12, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 0 });
          const replacementSelection = selectMonthlyCoreCandidates({ candidates: replacementResult.coreTerms, existingCoreWords: existingOtherCoreWords, needed: 1 });
          if (replacementResult.expandedTerms.length || replacementResult.grammarTopics.length || replacementResult.pronunciationTargets.length || replacementSelection.selected.length !== 1) {
            lastIssue += " A single replacement core candidate also failed validation.";
            break;
          }
          const replacement = { ...replacementSelection.selected[0]!, id: coreTerm.id };
          coreWords.delete(oldCoreWord);
          coreWords.add(normalizeMonthlyResourceWord(replacement.word));
          coreTerms[coreIndex] = replacement;
          coreTerm = replacement;
          candidatesForCore = [];
          await saveCheckpointCategory("expandedTerms", expandedTerms);
          await saveCheckpointCategory("coreTerms", coreTerms);
          replacementAttempt += 1;
        }
        if (!acceptedForCore) throw new MonthlyResourcePlanError([lastIssue]);
        const accepted = acceptedForCore.map((term, index) => ({ ...term, id: `${criteria.cefr.toLowerCase()}-expanded-${expandedTerms.length + index + 1}` }));
        expandedTerms.push(...accepted);
        await saveCheckpointCategory("expandedTerms", expandedTerms);
      }

      const monthlyVocabularyForPronunciation = [...coreTerms, ...expandedTerms].map((term) => `${term.word} (${term.meaning})`).join("; ");
      const cachedGrammarTopics = readCheckpointCategory("grammarTopics", monthlyResourcePlanOutputSchema.shape.grammarTopics) ?? [];
      const cachedGrammarResult = { coreTerms: [], expandedTerms: [], grammarTopics: cachedGrammarTopics, pronunciationTargets: [] } as z.infer<typeof monthlyResourcePlanOutputSchema>;
      let grammarResult = getMonthlyGrammarPhaseIssues(cachedGrammarResult).length === 0 ? cachedGrammarResult : undefined;
      if (!grammarResult) {
        grammarResult = await runMonthlyGrammarPhaseWithRetry((prompt) => runPhase(
          prompt,
          [],
          { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 2, pronunciationSoundCount: 0 }
        ));
        await saveCheckpointCategory("grammarTopics", grammarResult.grammarTopics);
      }
      const cachedPronunciationTargets = readCheckpointCategory("pronunciationTargets", monthlyResourcePlanOutputSchema.shape.pronunciationTargets) ?? [];
      const cachedPronunciationTargetsValid = cachedPronunciationTargets.length === 4 && cachedPronunciationTargets.every((target) => target.words.length >= pronunciationExampleCount && isValidMonthlyPronunciationIpaTarget(target.ipa) && isPronunciationTargetAllowedForLevel(criteria.cefr, target.ipa) && target.words.every((word) => doesMonthlyPronunciationExampleMatch(target.ipa, word.ipa)));
      const pronunciationTargets: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"] = cachedPronunciationTargetsValid ? cachedPronunciationTargets : [];
      const usedPronunciationWords = new Set<string>();
      for (const target of pronunciationTargets) for (const word of target.words) usedPronunciationWords.add(normalizeMonthlyResourceWord(word.word));
      const pronunciationSlots = ["P1 (N1–N3)", "P2 (N4–N6)", "P3 (N7–N9)", "P4 (N10–N12)"];
      const pronunciationLevelConstraint = criteria.cefr === "A1" || criteria.cefr === "A2"
        ? "LEVEL TRACK: A1–A2 only. Choose a foundational English phoneme from the standard British English 44-sound inventory (monophthong, diphthong, or consonant). Do not use advanced connected-speech, intonation, or multi-syllable stress phenomena as the target."
        : "LEVEL TRACK: B1–C1 only. Choose an advanced pronunciation phenomenon appropriate to this level, such as final consonants or clusters, word/sentence stress, weak forms, linking, assimilation, rhythm, or intonation. Do not make this a beginner isolated-phoneme lesson from the 44-sound inventory.";
      for (let soundIndex = pronunciationTargets.length; soundIndex < 4; soundIndex += 1) {
        let acceptedTarget: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"][number] | undefined;
        let targetTemplate: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"][number] | undefined;
        const acceptedTargetWords: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"][number]["words"] = [];
        let issue = "";
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const forbiddenForTarget = new Set([...usedPronunciationWords, ...acceptedTargetWords.map((word) => normalizeMonthlyResourceWord(word.word))]);
          const requiredExampleCount = pronunciationExampleCount;
          const neededExamples = requiredExampleCount - acceptedTargetWords.length;
          const targetDistinctness = buildMonthlyPronunciationDistinctnessConstraint(pronunciationTargets, issue);
          const prompt = `PHASE 4 — ONE PRONUNCIATION TARGET ONLY. Return exactly one genuine English pronunciationTargets object and leave coreTerms, expandedTerms and grammarTopics empty. ${pronunciationLevelConstraint} Generate a real, precise target for roadmap slot ${pronunciationSlots[soundIndex]}; its IPA, label and explanation must describe that target accurately. Format ipa as exactly one slash-delimited IPA form with no spaces, second transcription, label or prose (for example /ɪ/, /ˈiː/, or /ˈ/ when teaching primary stress itself). Never combine forms such as "/θ/ and /ð/" in the ipa field. ${targetDistinctness} The roadmap requires four clearly distinct target categories across P1–P4; do not return a contrast-pair variant of an accepted target as a separate roadmap target. This is an unassigned month pool; do not output calendar day fields. Return at least ${Math.max(18, neededExamples * 2)} ordered candidate example words so the application can select ${neededExamples}. Every candidate must be a real word, no more than three syllables, and actually illustrate the target sound or stress pattern. Avoid all words already accepted for earlier targets: ${[...usedPronunciationWords].join("; ") || "none"}. For this same target, retain these already accepted examples and do not repeat them: ${acceptedTargetWords.map((word) => word.word).join("; ") || "none"}. Prefer authentic terms from this monthly vocabulary pool: ${monthlyVocabularyForPronunciation}. Use neutral workplace words; never invent cultural, historical or identity-based framing.`;
          let result: z.infer<typeof monthlyResourcePlanOutputSchema>;
          try {
            result = await runPhase(prompt, coreTerms, { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 1 });
          } catch (error) {
            if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID") {
              issue = buildMonthlyPronunciationSchemaRepairIssue(safeGenerationDiagnosticIssues(error));
              continue;
            }
            throw error;
          }
          if (result.coreTerms.length || result.expandedTerms.length || result.grammarTopics.length || result.pronunciationTargets.length !== 1) {
            issue = "response must contain one pronunciation target only";
            continue;
          }
          const candidate = result.pronunciationTargets[0]!;
          if (!isValidMonthlyPronunciationIpaTarget(candidate.ipa)) {
            issue = `target IPA must be one slash-delimited IPA form with no spaces or prose; rejected "${candidate.ipa}"`;
            continue;
          }
          if (!isPronunciationTargetAllowedForLevel(criteria.cefr, candidate.ipa)) {
            issue = `target IPA ${candidate.ipa} is outside the A1-A2 British English 44-phoneme inventory; return one of the permitted foundational phonemes`;
            continue;
          }
          const targetIssue = getMonthlyPronunciationTargetIssue(candidate, pronunciationTargets);
          if (targetIssue) {
            issue = targetIssue;
            continue;
          }
          targetTemplate ??= candidate;
          const selection = selectMonthlyPronunciationCandidates({ candidates: candidate.words, forbiddenWords: forbiddenForTarget, needed: neededExamples, targetIpa: candidate.ipa });
          acceptedTargetWords.push(...selection.selected);
          if (acceptedTargetWords.length === requiredExampleCount) {
            acceptedTarget = { ...targetTemplate, words: acceptedTargetWords };
            break;
          }
          issue = selection.rejected.join("; ") || `only ${acceptedTargetWords.length} of ${requiredExampleCount} usable examples have been returned`;
        }
        if (!acceptedTarget) throw new MonthlyResourcePlanError([`Pronunciation generation failed for ${pronunciationSlots[soundIndex]}: ${issue}.`]);
        pronunciationTargets.push(acceptedTarget);
        for (const word of acceptedTarget.words) usedPronunciationWords.add(normalizeMonthlyResourceWord(word.word));
      }
      if (pronunciationTargets.length === 4 && !cachedPronunciationTargetsValid) await saveCheckpointCategory("pronunciationTargets", pronunciationTargets);
      const normalizedExpandedTerms = expandedTerms.map((term, index) => ({ ...term, id: `${criteria.cefr.toLocaleLowerCase("en-US")}-expanded-${index + 1}` }));
      if (normalizedExpandedTerms.some((term, index) => term.id !== expandedTerms[index]?.id)) {
        await saveCheckpointCategory("expandedTerms", normalizedExpandedTerms);
      }
      const plan = monthlyResourcePlanOutputSchema.parse({
        coreTerms,
        expandedTerms: normalizedExpandedTerms,
        grammarTopics: grammarResult.grammarTopics,
        pronunciationTargets
      });
      const pool = buildMonthlyResourcesFromAiPlan(month.month, criteria.cefr, theme, criteria, plan);
      const framework = await repositories.monthlyContent.saveResourceDraft(actorId, pool);
      return framework;
    } catch (error) {
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

  app.post("/api/v1/content/month-frameworks/:id/approve", { preHandler: contentOperator }, async (request, reply) => {
    const input = frameworkParams.parse(request.params);
    await repositories.monthlyContent.approveFramework(request.e4sSession!.user.id, input.id);
    return reply.code(204).send();
  });

  app.get("/api/v1/content/month-frameworks/:id/exam-scope", { preHandler: operator }, async (request, reply) => {
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
    const report = evaluateMonthlyLessonQuality(contract, dayNumber, input);
    await repositories.monthlyContent.saveMonthlyDayDraft(request.e4sSession!.user.id, id, dayNumber, input, report);
    return report;
  });

  app.post("/api/v1/content/month-frameworks/:id/reviews/:dayNumber/generate", { preHandler: contentOperator }, async (request, reply) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    const actorId = request.e4sSession!.user.id;
    const runner = await aiRunnerFactory?.(actorId) ?? aiRunner;
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
      result = await generateMonthlyReviewWithAi(contract, dayNumber, runner, task.prompt);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID") {
        return reply.code(422).send({ code: "AI_OUTPUT_INVALID", issues: safeGenerationDiagnosticIssues(error) });
      }
      throw error;
    }
    if (result.status !== "ready" || !result.lesson) {
      return reply.code(422).send({ code: "MONTHLY_GENERATION_QUALITY_FAILED", report: result.report, attempts: result.attempts });
    }
    await repositories.monthlyContent.saveMonthlyDayDraft(actorId, id, dayNumber, result.lesson, result.report);
    return result;
  });
  app.post("/api/v1/content/month-frameworks/:id/days/:dayNumber/generate", { preHandler: contentOperator }, async (request, reply) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    const actorId = request.e4sSession!.user.id;
    const runner = await aiRunnerFactory?.(actorId) ?? aiRunner;
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
      result = await generateMonthlyDayWithAi(contract, dayNumber, runner, task.prompt);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID") {
        return reply.code(422).send({ code: "AI_OUTPUT_INVALID", issues: safeGenerationDiagnosticIssues(error) });
      }
      throw error;
    }
    if (result.status !== "ready" || !result.lesson) {
      return reply.code(422).send({ code: "MONTHLY_GENERATION_QUALITY_FAILED", report: result.report, attempts: result.attempts });
    }
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
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "MONTHLY_FRAMEWORK_PLAN_INVALID") return undefined;
  const issues = "issues" in error && Array.isArray(error.issues) ? error.issues : [];
  return reply.code(409).send({ code: "MONTHLY_FRAMEWORK_PLAN_INVALID", issues });
}
