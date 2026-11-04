import { buildMonthlyCalendar, buildMonthlyExamScope, monthlyDayKind, type MonthlyCurriculumContract } from "@e4s/domain";
import { monthlyResourcePlanOutputSchema, monthlyTopicSuggestionOutputSchema, type AiTaskRunner } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import { evaluateMonthlyLessonQuality } from "./monthly-quality.js";
import { generateMonthlyDayWithAi, MONTHLY_DAY_COMPONENTS } from "./monthly-day-generation.js";
import { buildMonthlyCoreCandidatesPrompt, buildMonthlyPronunciationDistinctnessConstraint, buildMonthlyPronunciationSchemaRepairIssue, buildMonthlyResourcesFromAiPlan, getMonthlyGrammarPhaseIssues, getMonthlyPronunciationTargetIssue, isSingleHeadword, MonthlyResourceCriteriaError, MonthlyResourcePlanError, runMonthlyGrammarPhaseWithRetry, selectMonthlyCoreCandidates, selectMonthlyPronunciationCandidates, selectMonthlySupportCandidates } from "./monthly-resource-generation.js";
import { isValidMonthlyPronunciationIpaTarget } from "./monthly-resource-plan-spec.js";
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
    const newLessonCount = calendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, calendar.lessonCount) === "new").length;
      const counts = { coreTerms: newLessonCount * 3, expandedTerms: newLessonCount * 27, grammarTopics: 2, pronunciationTargets: 4 };
    const categories = Object.fromEntries(Object.entries(counts).map(([key, target]) => {
      const value = checkpoint?.categories[key];
      const count = Array.isArray(value) ? value.length : 0;
      return [key, { state: count === target ? "complete" : "missing", count, target }];
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
    const runner = await aiRunnerFactory?.(actorId) ?? aiRunner;
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const [overview, task] = await Promise.all([
      repositories.monthlyContent.getOverview(actorId, month.month),
      repositories.aiRuns.activeTaskPrompt(actorId, "monthly_resource_generation")
    ]);
    const brief = overview.brief;
    if (!brief || brief.status !== "approved") return reply.code(409).send({ code: "MONTHLY_TOPIC_NOT_APPROVED" });
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const checkpointSchemaVersion = "monthly-resource-category-v1";
      let checkpoint = await repositories.monthlyContent.getResourceGenerationCheckpoint(actorId, month.month, criteria.cefr);
      const generationId = checkpoint?.generationId ?? randomUUID();
      const readCheckpointCategory = <T>(key: string, schema: z.ZodType<T>): T | undefined => {
        const source = checkpoint?.sourceLineage[key];
        if (!source || typeof source !== "object" || !("schemaVersion" in source) || source.schemaVersion !== checkpointSchemaVersion) return undefined;
        const parsed = schema.safeParse(checkpoint?.categories[key]);
        return parsed.success ? parsed.data : undefined;
      };
      const saveCheckpointCategory = async (key: string, value: unknown) => {
        checkpoint = await repositories.monthlyContent.saveResourceGenerationCheckpoint(actorId, {
          month: month.month, cefr: criteria.cefr, briefVersion: brief.version, generationId,
          categories: { [key]: value },
          sourceLineage: { [key]: { schemaVersion: checkpointSchemaVersion, briefVersion: brief.version, promptKey: "monthly_resource_generation", status: "draft_checkpoint", generatedAt: new Date().toISOString() } }
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
      const newLessonDays = calendar.effectiveDays.flatMap((_date, index) => monthlyDayKind(index + 1, calendar.lessonCount) === "new" ? [index + 1] : []);
      // Each completed resource category is checkpointed as an unpublished draft.
      // Only saveResourceDraft creates the editable month framework after all
      // categories pass whole-pool validation.
      const newLessonCount = newLessonDays.length;
      const phaseInput = (coreTermBatch: Array<{ id: string; word: string; meaning: string; type: string; ipa: string }>, targets: { vocabularyCount: number; expandedVocabularyCount: number; grammarTopicCount: number; pronunciationSoundCount: number }) => ({
        month: month.month,
        cefr: criteria.cefr,
        theme: { title: theme.title, brief: theme.brief, context: theme.context, communicationGoal: theme.communicationGoal },
        newLessonCount,
        coreTermBatch,
        targets
      });
      const runPhase = async (phasePrompt: string, coreTermBatch: Array<{ id: string; word: string; meaning: string; type: string; ipa: string }>, targets: { vocabularyCount: number; expandedVocabularyCount: number; grammarTopicCount: number; pronunciationSoundCount: number }) => {
        const generated = await runner.runTask("monthly_resource_generation", phaseInput(coreTermBatch, targets), {
          systemPrompt: `${task.prompt}\n\n${phasePrompt}`,
          maxOutputTokens: 6_000,
          temperature: 0.15,
          maxAttempts: 2
        });
        return monthlyResourcePlanOutputSchema.parse(generated.output);
      };
      const coreTerms: z.infer<typeof monthlyResourcePlanOutputSchema>["coreTerms"] = readCheckpointCategory("coreTerms", monthlyResourcePlanOutputSchema.shape.coreTerms) ?? [];
      const coreWords = new Set<string>();
      const cachedCoreValid = coreTerms.length === criteria.vocabularyCount
        && coreTerms.every((term) => isSingleHeadword(term.word))
        && new Set(coreTerms.map((term) => normalizeMonthlyResourceWord(term.word))).size === coreTerms.length;
      if (!cachedCoreValid) coreTerms.length = 0;
      for (const term of coreTerms) coreWords.add(normalizeMonthlyResourceWord(term.word));
      for (let batchIndex = coreTerms.length / 3; batchIndex < newLessonCount; batchIndex += 1) {
        let accepted: z.infer<typeof monthlyResourcePlanOutputSchema>["coreTerms"] | undefined;
        let issue = "";
        let rejectedCoreWords: string[] = [];
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const prompt = buildMonthlyCoreCandidatesPrompt({
            cefr: criteria.cefr,
            theme: theme.title,
            communicationGoal: theme.communicationGoal,
            existingCoreWords: [...coreWords],
            batchNumber: batchIndex + 1,
            rejectedWords: rejectedCoreWords,
            previousIssue: issue
          });
          const result = await runPhase(prompt, [], { vocabularyCount: 6, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 0 });
          const candidate = result.coreTerms;
          if (result.expandedTerms.length || result.grammarTopics.length || result.pronunciationTargets.length) {
            issue = "response included non-core categories";
            continue;
          }
          const selection = selectMonthlyCoreCandidates({ candidates: candidate, existingCoreWords: coreWords, needed: 3 });
          if (candidate.length === 6 && selection.selected.length === 3) {
            accepted = selection.selected.map((term, index) => ({ ...term, id: `${criteria.cefr.toLowerCase()}-core-${batchIndex * 3 + index + 1}` }));
            break;
          }
          issue = `batch ${batchIndex + 1} needs exactly six candidates and at least three unique standalone headwords; received ${candidate.length}. Rejected candidates: ${selection.rejected.join("; ") || "fewer than three candidates passed selection"}`;
          rejectedCoreWords = selection.rejected.map((rejected) => rejected.split(" -> ")[0] ?? "").filter(Boolean);
        }
        if (!accepted) throw new MonthlyResourcePlanError([`Core vocabulary generation failed: ${issue}.`]);
        coreTerms.push(...accepted);
        accepted.forEach((term) => coreWords.add(normalizeMonthlyResourceWord(term.word)));
      }
      if (!cachedCoreValid) await saveCheckpointCategory("coreTerms", coreTerms);

      const cachedExpanded = readCheckpointCategory("expandedTerms", monthlyResourcePlanOutputSchema.shape.expandedTerms) ?? [];
      const expandedTerms: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] = cachedExpanded.length === criteria.expandedVocabularyCount ? cachedExpanded : [];
      const coreWordsList = coreTerms.map((term) => `${term.id}: ${term.word} (${term.meaning})`);
      const maxExpandedRepeats = Math.floor(criteria.expandedVocabularyCount * 0.2);
      const maxExpandedPhrases = Math.floor(criteria.expandedVocabularyCount * 0.25);
      for (let coreIndex = expandedTerms.length / 9; coreIndex < coreTerms.length; coreIndex += 1) {
        const coreTerm = coreTerms[coreIndex]!;
        const coreBatch = [coreTerm];
        const acceptedForCore: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] = [];
        let issue = "";
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const previousTerms = [...expandedTerms.map((term) => term.word), ...acceptedForCore.map((term) => term.word)];
          const needed = 9 - acceptedForCore.length;
          const acceptedRelations = new Set(acceptedForCore.map((term) => term.relation));
          const prompt = `PHASE 2 — ORDERED SUPPORT CANDIDATES FOR ONE CORE. Return exactly 18 candidate expandedTerms and no other category: coreTerms, grammarTopics and pronunciationTargets must be empty arrays. This is an unordered month resource pool; do not assign calendar days. For this exact core, return nine semantically distinct supports. The selected nine must cover all five relation groups: umbrella/hypernym, synonym, antonym, word_family, and collocation. Use one or two items per group, never more than two; this gives a balanced semantic spread rather than nine items assigned to one repeated group. Each relation must be linguistically real in context. Do not invent an antonym; if there is no natural antonym, use a genuine contrasting concept. Avoid shallow workflow-style variants. At least eight of nine selected terms must be standalone English words; allow at most one natural two-to-four-word phrase per core and at most 25% phrases in the complete pool. Every relatesToCoreId must equal ${coreTerm.id}. Never return any word from the complete finalized core vocabulary (forbidden): ${coreWordsList.join("; ")}. Support words may repeat across different cores only while total repeated placements remain <=20%. Month-wide support ledger (including accepted candidates for this core): ${previousTerms.join("; ") || "none"}. Already covered relations for this core: ${[...acceptedRelations].join(", ") || "none"}. Return 18 ordered candidates so the application can select nine valid items with balanced coverage across all five groups. Keep candidates authentic for ${criteria.cefr} and the approved theme. ${issue ? `Previous candidates rejected or lacked required relations: ${issue}. Return a new set of 18 alternatives; do not repeat the named invalid lexical forms or normalized variants.` : ""}`;
          const result = await runPhase(prompt, coreBatch, { vocabularyCount: 0, expandedVocabularyCount: 18, grammarTopicCount: 0, pronunciationSoundCount: 0 });
          const candidate = result.expandedTerms;
          if (result.coreTerms.length || result.grammarTopics.length || result.pronunciationTargets.length) {
            issue = "response included non-support categories";
            continue;
          }
          const selection = selectMonthlySupportCandidates({
            candidates: candidate,
            coreId: coreTerm.id,
            coreWords,
            sameCoreWords: new Set(acceptedForCore.map((term) => normalizeMonthlyResourceWord(term.word))),
            sameCoreRelations: new Set(acceptedForCore.map((term) => term.relation)),
            sameCoreRelationCounts: new Map([...new Set(acceptedForCore.map((term) => term.relation))].map((relation) => [relation, acceptedForCore.filter((term) => term.relation === relation).length])),
            existingSupportWords: previousTerms,
            maxRepeatedPlacements: maxExpandedRepeats,
            maxPhrasePlacements: maxExpandedPhrases,
            needed
          });
          acceptedForCore.push(...selection.selected);
          const selectedRelations = new Set(acceptedForCore.map((term) => term.relation));
          const missingRelations = (["umbrella", "synonym", "antonym", "word_family", "collocation"] as const).filter((relation) => !selectedRelations.has(relation));
          if (acceptedForCore.length === 9 && missingRelations.length === 0) break;
          if (acceptedForCore.length === 9) acceptedForCore.length = 0;
          issue = missingRelations.length
            ? `${selection.rejected.join("; ")} ${selection.rejected.length ? "; " : ""}missing required relations: ${missingRelations.join(", ")}`
            : selection.rejected.join("; ") || `only ${acceptedForCore.length} valid supports were accepted; need nine`;
        }
        if (acceptedForCore.length !== 9) throw new MonthlyResourcePlanError([`Expanded vocabulary generation failed for core ${coreTerm.id}: ${issue}.`]);
        const accepted = acceptedForCore.map((term, index) => ({ ...term, id: `${criteria.cefr.toLowerCase()}-expanded-${expandedTerms.length + index + 1}` }));
        expandedTerms.push(...accepted);
      }
      if (expandedTerms.length === criteria.expandedVocabularyCount && expandedTerms !== cachedExpanded) await saveCheckpointCategory("expandedTerms", expandedTerms);

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
      const cachedPronunciationTargetsValid = cachedPronunciationTargets.length === 4 && cachedPronunciationTargets.every((target) => isValidMonthlyPronunciationIpaTarget(target.ipa));
      const pronunciationTargets: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"] = cachedPronunciationTargetsValid ? cachedPronunciationTargets : [];
      const usedPronunciationWords = new Set<string>();
      for (const target of pronunciationTargets) for (const word of target.words) usedPronunciationWords.add(normalizeMonthlyResourceWord(word.word));
      const pronunciationSlots = ["P1 (N1–N3)", "P2 (N4–N6)", "P3 (N7–N9)", "P4 (N10–N12)"];
      for (let soundIndex = pronunciationTargets.length; soundIndex < 4; soundIndex += 1) {
        let acceptedTarget: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"][number] | undefined;
        let targetTemplate: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"][number] | undefined;
        const acceptedTargetWords: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"][number]["words"] = [];
        let issue = "";
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const forbiddenForTarget = new Set([...usedPronunciationWords, ...acceptedTargetWords.map((word) => normalizeMonthlyResourceWord(word.word))]);
          const neededExamples = 9 - acceptedTargetWords.length;
          const targetDistinctness = buildMonthlyPronunciationDistinctnessConstraint(pronunciationTargets, issue);
          const prompt = `PHASE 4 — ONE PRONUNCIATION TARGET ONLY. Return exactly one genuine English pronunciationTargets object and leave coreTerms, expandedTerms and grammarTopics empty. Generate a real, precise phoneme or stress target for roadmap slot ${pronunciationSlots[soundIndex]}; its IPA, label and explanation must describe that target accurately. Format ipa as exactly one slash-delimited IPA form with no spaces, second transcription, label or prose (for example /ɪ/, /ˈiː/, or /ˈ/ when teaching primary stress itself). Never combine forms such as "/θ/ and /ð/" in the ipa field. ${targetDistinctness} The roadmap requires four clearly distinct target categories across P1–P4; do not return a contrast-pair variant of an accepted target as a separate roadmap target. This is an unassigned month pool; do not output calendar day fields. Return at least ${Math.max(18, neededExamples * 2)} ordered candidate example words so the application can select ${neededExamples}. Every candidate must be a real word, no more than three syllables, and actually illustrate the target sound or stress pattern. Avoid all words already accepted for earlier targets: ${[...usedPronunciationWords].join("; ") || "none"}. For this same target, retain these already accepted examples and do not repeat them: ${acceptedTargetWords.map((word) => word.word).join("; ") || "none"}. Prefer authentic terms from this monthly vocabulary pool: ${monthlyVocabularyForPronunciation}. Use neutral workplace words; never invent cultural, historical or identity-based framing.`;
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
          const targetIssue = getMonthlyPronunciationTargetIssue(candidate, pronunciationTargets);
          if (targetIssue) {
            issue = targetIssue;
            continue;
          }
          targetTemplate ??= candidate;
          const selection = selectMonthlyPronunciationCandidates({ candidates: candidate.words, forbiddenWords: forbiddenForTarget, needed: neededExamples });
          acceptedTargetWords.push(...selection.selected);
          if (acceptedTargetWords.length === 9) {
            acceptedTarget = { ...targetTemplate, words: acceptedTargetWords };
            break;
          }
          issue = selection.rejected.join("; ") || `only ${acceptedTargetWords.length} of 9 usable examples have been returned`;
        }
        if (!acceptedTarget) throw new MonthlyResourcePlanError([`Pronunciation generation failed for ${pronunciationSlots[soundIndex]}: ${issue}.`]);
        pronunciationTargets.push(acceptedTarget);
        for (const word of acceptedTarget.words) usedPronunciationWords.add(normalizeMonthlyResourceWord(word.word));
      }
      if (pronunciationTargets.length === 4 && !cachedPronunciationTargetsValid) await saveCheckpointCategory("pronunciationTargets", pronunciationTargets);
      const plan = monthlyResourcePlanOutputSchema.parse({
        coreTerms,
        expandedTerms,
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
