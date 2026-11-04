import { buildMonthlyCalendar, buildMonthlyExamScope, monthlyDayKind, type MonthlyCurriculumContract } from "@e4s/domain";
import { monthlyResourcePlanOutputSchema, monthlyTopicSuggestionOutputSchema, type AiTaskRunner } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import { evaluateMonthlyLessonQuality } from "./monthly-quality.js";
import { generateMonthlyDayWithAi, MONTHLY_DAY_COMPONENTS } from "./monthly-day-generation.js";
import { buildMonthlyResourcesFromAiPlan, isSingleHeadword, MonthlyResourceCriteriaError, MonthlyResourcePlanError, selectMonthlyPronunciationCandidates, selectMonthlySupportCandidates } from "./monthly-resource-generation.js";
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
const supportTerm = z.object({ id: z.string().min(1), word: z.string().min(1), meaning: z.string(), type: z.string().min(1), source: z.enum(["example", "family", "synonym", "antonym", "group", "manual"]), component: z.literal("expanded"), dayNumber: z.int().positive() });
const frameworkInput = z.object({
  contract: z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u), cefr: z.enum(["A1", "A2", "B1", "B2", "C1"]), version: z.int().positive(),
    theme: z.object({ version: z.int().positive(), title: z.string(), brief: z.string(), context: z.string(), communicationGoal: z.string() }),
    coreTerms: z.array(coreTerm), supportTerms: z.array(supportTerm),
    grammarTopics: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), steps: z.array(z.object({ id: z.string().min(1), focus: z.string(), formula: z.string().min(1), usage: z.string(), examples: z.array(z.string()) })).min(1) })),
    sounds: z.array(z.object({ id: z.string().min(1), ipa: z.string().min(1), label: z.string().min(1), examples: z.array(z.object({ id: z.string().min(1), word: z.string().min(1), ipa: z.string().min(1) })) })),
    daySpecs: z.array(z.object({ lessonNumber: z.int().positive(), date: z.string().date(), kind: z.enum(["new", "review"]), coreTermIds: z.array(z.string()), reviewTermIds: z.array(z.string()), grammarStepId: z.string().min(1), grammarStepIds: z.array(z.string()).optional(), soundId: z.string().min(1), pronunciationSlot: z.string().optional(), pronunciationExampleIds: z.array(z.string()) }))
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
      const theme = {
        version: brief.version,
        title: brief.title,
        brief: brief.brief,
        context: brief.context,
        communicationGoal: brief.communicationGoal
      };
      const calendar = buildMonthlyCalendar(month.month);
      const newLessonDays = calendar.effectiveDays.flatMap((_date, index) => monthlyDayKind(index + 1, calendar.lessonCount) === "new" ? [index + 1] : []);
      // One operator action generates category-specific AI phases in memory.
      // Nothing is persisted until the complete monthly contract validates.
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
      const coreTerms: z.infer<typeof monthlyResourcePlanOutputSchema>["coreTerms"] = [];
      const coreWords = new Set<string>();
      for (let batchIndex = 0; batchIndex < newLessonCount; batchIndex += 1) {
        let accepted: z.infer<typeof monthlyResourcePlanOutputSchema>["coreTerms"] | undefined;
        let issue = "";
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const prompt = `PHASE 1 — CORE VOCABULARY ONLY. Return exactly three unique coreTerms and no other category: expandedTerms, grammarTopics and pronunciationTargets must be empty arrays. Every core term must be one standalone English lexical headword: no spaces, slash alternatives, phrases, or inflected variants of another selected core. Match the level, month theme and practical communication goal. Use these already generated core terms as forbidden words: ${[...coreWords].join("; ") || "none"}. This is an unordered month pool; do not assign calendar days. ${issue ? `The previous response was rejected: ${issue}. Replace the named terms with different, authentic ${criteria.cefr} workplace English.` : ""}`;
          const result = await runPhase(prompt, [], { vocabularyCount: 3, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 0 });
          const candidate = result.coreTerms;
          const words = candidate.map((term) => normalizeMonthlyResourceWord(term.word));
          const duplicates = words.filter((word, index) => coreWords.has(word) || words.indexOf(word) !== index);
          const nonHeadwords = candidate.filter((term) => !isSingleHeadword(term.word)).map((term) => term.word);
          if (candidate.length === 3 && result.expandedTerms.length === 0 && result.grammarTopics.length === 0 && result.pronunciationTargets.length === 0 && duplicates.length === 0 && nonHeadwords.length === 0) {
            accepted = candidate.map((term, index) => ({ ...term, id: `${criteria.cefr.toLowerCase()}-core-${batchIndex * 3 + index + 1}` }));
            break;
          }
          issue = `batch ${batchIndex + 1} needs exactly 3 core terms only; received ${candidate.length}, with conflicts ${duplicates.join(", ") || "none"}; non-headwords ${nonHeadwords.join(", ") || "none"}`;
        }
        if (!accepted) throw new MonthlyResourcePlanError([`Core vocabulary generation failed: ${issue}.`]);
        coreTerms.push(...accepted);
        accepted.forEach((term) => coreWords.add(normalizeMonthlyResourceWord(term.word)));
      }

      const expandedTerms: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] = [];
      const coreWordsList = coreTerms.map((term) => `${term.id}: ${term.word} (${term.meaning})`);
      const maxExpandedRepeats = Math.floor(criteria.expandedVocabularyCount * 0.2);
      const maxExpandedPhrases = Math.floor(criteria.expandedVocabularyCount * 0.25);
      for (let coreIndex = 0; coreIndex < coreTerms.length; coreIndex += 1) {
        const coreTerm = coreTerms[coreIndex]!;
        const coreBatch = [coreTerm];
        const acceptedForCore: z.infer<typeof monthlyResourcePlanOutputSchema>["expandedTerms"] = [];
        let issue = "";
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const previousTerms = [...expandedTerms.map((term) => term.word), ...acceptedForCore.map((term) => term.word)];
          const needed = 3 - acceptedForCore.length;
          const prompt = `PHASE 2 — ORDERED SUPPORT CANDIDATES FOR ONE CORE. Return exactly six candidate expandedTerms and no other category: coreTerms, grammarTopics and pronunciationTargets must be empty arrays. This is an unordered month resource pool; do not assign calendar days. For this exact core, return semantically distinct supports. Prefer standalone English words strongly: at least two of the three accepted supports for each core must be single lexical words, and single words must remain at least 75% of the whole month. One special natural two-to-four-word workplace phrase is allowed per core when it teaches a real expression; any relation may use it. Never make a family of shallow variants around the core (for example workflow management, streamline the workflow, workflow tool). Use each relation at most once for this core. Every relatesToCoreId must equal ${coreTerm.id}. Never return any word from the complete finalized core vocabulary (forbidden): ${coreWordsList.join("; ")}. Support words may repeat across different cores up to 20% of total placements. Month-wide support ledger (including already accepted candidates for this core): ${previousTerms.join("; ") || "none"}. Prefer candidates that are distinct from the ledger. Return a diverse ordered candidate list so the first three valid items satisfy the target, while remaining authentic for ${criteria.cefr} and the approved theme. ${issue ? `The prior candidate set had fewer than ${needed} valid items. These were the rejected candidates (raw -> normalized, with reason): ${issue}. Return a new set of six alternatives; do not repeat the listed invalid lexical forms or normalized variants.` : ""}`;
          const result = await runPhase(prompt, coreBatch, { vocabularyCount: 0, expandedVocabularyCount: 6, grammarTopicCount: 0, pronunciationSoundCount: 0 });
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
            existingSupportWords: previousTerms,
            maxRepeatedPlacements: maxExpandedRepeats,
            maxPhrasePlacements: maxExpandedPhrases,
            needed
          });
          acceptedForCore.push(...selection.selected);
          if (acceptedForCore.length === 3) break;
          issue = selection.rejected.join("; ") || `only ${candidate.length} candidates were returned; need six ordered candidates`;
        }
        if (acceptedForCore.length !== 3) throw new MonthlyResourcePlanError([`Expanded vocabulary generation failed for core ${coreTerm.id}: ${issue}.`]);
        const accepted = acceptedForCore.map((term, index) => ({ ...term, id: `${criteria.cefr.toLowerCase()}-expanded-${expandedTerms.length + index + 1}` }));
        expandedTerms.push(...accepted);
      }

      const monthlyVocabularyForPronunciation = [...coreTerms, ...expandedTerms].map((term) => `${term.word} (${term.meaning})`).join("; ");
      const grammarResult = await runPhase(
        `PHASE 3 — GRAMMAR ONLY. Return exactly two genuine grammarTopics and leave coreTerms, expandedTerms and pronunciationTargets empty. This is the reusable month pool; do not assign calendar days. Each grammar topic must have exactly three ordered progressive steps that build in complexity; use a distinct focus and teaching point at each step, with precise formula, concise Vietnamese usage, and three to six authentic workplace examples. Topic A steps are the progression for N1–N2, N3–N4, N5–N6. Topic B steps are the progression for N7–N8, N9–N10, N11–N12. N13–N15 combine the third step of both topics.`,
        [],
        { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 2, pronunciationSoundCount: 0 }
      );
      if (grammarResult.coreTerms.length || grammarResult.expandedTerms.length || grammarResult.grammarTopics.length !== 2 || grammarResult.pronunciationTargets.length) {
        throw new MonthlyResourcePlanError(["Grammar phase must return exactly two grammar topics and no vocabulary or pronunciation resources."]);
      }
      const pronunciationTargets: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"] = [];
      const usedPronunciationWords = new Set<string>();
      const pronunciationSlots = ["P1 (N1–N3)", "P2 (N4–N6)", "P3 (N7–N9)", "P4 (N10–N12)"];
      for (let soundIndex = 0; soundIndex < 4; soundIndex += 1) {
        let acceptedTarget: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"][number] | undefined;
        let targetTemplate: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"][number] | undefined;
        const acceptedTargetWords: z.infer<typeof monthlyResourcePlanOutputSchema>["pronunciationTargets"][number]["words"] = [];
        let issue = "";
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const forbiddenForTarget = new Set([...usedPronunciationWords, ...acceptedTargetWords.map((word) => normalizeMonthlyResourceWord(word.word))]);
          const neededExamples = 9 - acceptedTargetWords.length;
          const previousSoundTargets = pronunciationTargets.map((target) => `${target.ipa} (${target.label})`);
          const prompt = `PHASE 4 — ONE PRONUNCIATION TARGET ONLY. Return exactly one genuine English pronunciationTargets object and leave coreTerms, expandedTerms and grammarTopics empty. Generate a real, precise phoneme or stress target for ${pronunciationSlots[soundIndex]}; its IPA, label and explanation must describe that target accurately and be distinct from prior targets: ${previousSoundTargets.join("; ") || "none"}. This is an unassigned month pool; do not output calendar day fields. Return at least ${Math.max(18, neededExamples * 2)} ordered candidate example words so the application can select ${neededExamples}. Every candidate must be a real word, no more than three syllables, and actually illustrate the target sound or stress pattern. Avoid all words already accepted for earlier targets: ${[...usedPronunciationWords].join("; ") || "none"}. For this same target, retain these already accepted examples and do not repeat them: ${acceptedTargetWords.map((word) => word.word).join("; ") || "none"}. Prefer authentic terms from this monthly vocabulary pool: ${monthlyVocabularyForPronunciation}. Use neutral workplace words; never invent cultural, historical or identity-based framing. ${issue ? `The previous candidate set did not contain enough usable words. These named candidates were rejected: ${issue}. Do not repeat them; provide a fresh ordered set of AI-generated examples for the same target.` : ""}`;
          const result = await runPhase(prompt, coreTerms, { vocabularyCount: 0, expandedVocabularyCount: 0, grammarTopicCount: 0, pronunciationSoundCount: 1 });
          if (result.coreTerms.length || result.expandedTerms.length || result.grammarTopics.length || result.pronunciationTargets.length !== 1) {
            issue = "response must contain one pronunciation target only";
            continue;
          }
          const candidate = result.pronunciationTargets[0]!;
          if (pronunciationTargets.some((target) => normalizeMonthlyResourceWord(target.ipa) === normalizeMonthlyResourceWord(candidate.ipa))) {
            issue = `target IPA ${candidate.ipa} duplicates an earlier pronunciation target`;
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

  app.get("/api/v1/content/month-frameworks/:id/exam-scope", { preHandler: operator }, async (request) => {
    const input = frameworkParams.parse(request.params);
    const contract = await repositories.monthlyContent.getFrameworkContract(request.e4sSession!.user.id, input.id);
    return buildMonthlyExamScope(contract);
  });

  app.put("/api/v1/content/month-frameworks/:id/days/:dayNumber", { preHandler: contentOperator }, async (request) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    const input = lessonInput.parse(request.body);
    const contract = await repositories.monthlyContent.getFrameworkContract(request.e4sSession!.user.id, id);
    const report = evaluateMonthlyLessonQuality(contract, dayNumber, input);
    await repositories.monthlyContent.saveMonthlyDayDraft(request.e4sSession!.user.id, id, dayNumber, input, report);
    return report;
  });

  app.post("/api/v1/content/month-frameworks/:id/reviews/:dayNumber/generate", { preHandler: contentOperator }, async (request, reply) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    const actorId = request.e4sSession!.user.id;
    const runner = await aiRunnerFactory?.(actorId) ?? aiRunner;
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const [contract, task] = await Promise.all([
      repositories.monthlyContent.getFrameworkContract(actorId, id),
      repositories.aiRuns.activeTaskPrompt(actorId, "monthly_lessons")
    ]);
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
    const [contract, task] = await Promise.all([
      repositories.monthlyContent.getFrameworkContract(actorId, id),
      repositories.aiRuns.activeTaskPrompt(actorId, "monthly_lessons")
    ]);
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

  app.put("/api/v1/content/month-frameworks/:id/days/:dayNumber/corrections/:correctionId", { preHandler: contentOperator }, async (request) => {
    const { id, dayNumber } = dayParams.parse(request.params);
    const { correctionId } = correctionParams.parse(request.params);
    const input = lessonInput.parse(request.body);
    const contract = await repositories.monthlyContent.getFrameworkContract(request.e4sSession!.user.id, id);
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
