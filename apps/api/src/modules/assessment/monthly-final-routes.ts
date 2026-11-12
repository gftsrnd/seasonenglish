import type { MonthlyFinalDraftView, MonthlyFinalExamMeta, MonthlyFinalGenCode } from "@e4s/contracts";
import type { AiTaskRunner, MonthlyFinalProductiveOutput, MonthlyFinalReceptiveOutput } from "@e4s/ai";
import { createRepositories, type StoredAssessmentDefinition } from "@e4s/database";
import { monthlyFinalReleaseReadiness } from "@e4s/domain/assessment";
import { monthlyScopeHash, validateMonthlyCurriculum, type MonthlyCurriculumContract } from "@e4s/domain/monthly";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import {
  MonthlyFinalInputError, assembleMonthlyFinalFromAi, buildManualMonthlyFinalDraft, buildMonthlyFinalGenerationInput,
  withEvaluation, type MonthlyFinalFrameworkRef
} from "./monthly-final-builder.js";
import { MONTHLY_FINAL_MANUAL_RULES } from "./monthly-final-checks.js";
import { safeGenerationDiagnosticIssues } from "../content/generation-errors.js";
import {generateMonthlyFinalProductive} from "./monthly-final-productive-generation.js";
import {generateMonthlyFinalListening} from "./monthly-final-listening-generation.js";
import {generateMonthlyFinalReading, repairMonthlyFinalReadingItems} from "./monthly-final-reading-generation.js";
import { verifyMonthlyFinalAnswers } from "./monthly-final-answer-verification.js";
import { blueprintListeningAudioIndex, withBlueprintListeningAudio, type ListeningAudioService } from "./listening-audio.js";

const frameworkParam = z.object({ frameworkId: z.uuid() });
const versionParam = z.object({ versionId: z.uuid() });

const taskInput = z.object({
  key: z.string().trim().min(1).max(80), prompt: z.string().max(20_000),
  options: z.array(z.object({ value: z.string().trim().min(1).max(80), label: z.string().max(2_000) })).max(10).optional(),
  correctAnswer: z.string().trim().min(1).max(80).nullable().optional()
}).passthrough();
const stimulusInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("passage"), text: z.string().max(30_000) }).passthrough(),
  z.object({ type: z.literal("audio_script"), audioSrc: z.string().max(2_000).optional(), lines: z.array(z.object({ speaker: z.string().trim().min(1).max(200), text: z.string().max(10_000) })).min(1).max(50) }).passthrough()
]);
const genCode = z.string().regex(/^GEN(0[1-9]|1\d|2[0-3])$/u);
export const monthlyFinalUpdateInput = z.object({
  title: z.string().trim().min(3).max(300),
  sections: z.array(z.object({
    code: z.enum(["listening", "reading", "writing", "speaking"]),
    groups: z.array(z.object({ key: z.string().trim().min(1).max(80), stimulus: stimulusInput.optional(), tasks: z.array(taskInput).min(1).max(60) }).passthrough()).min(1).max(20)
  }).passthrough()).length(4),
  review: z.object({
    grammar: z.array(z.object({
      code: z.enum(["GA", "GB"]), mainStepId: z.string().min(1), secondaryStepId: z.string().min(1),
      mainPatterns: z.array(z.string().trim().min(1).max(200)).min(1).max(8).optional(),
      secondaryPatterns: z.array(z.string().trim().min(1).max(200)).min(1).max(8).optional()
    })).max(2).optional(),
    listeningEvidence: z.array(z.object({ groupKey: z.string().min(1), gaSentence: z.string().max(400), gbSentence: z.string().max(400) })).max(2).optional(),
    items: z.record(z.string(), z.object({ explanation: z.string().max(600), evidence: z.string().max(400).optional() })).optional(),
    audioReviewed: z.boolean().optional(),
    manualConfirmations: z.array(genCode).max(23).optional()
  }).optional()
});
export type MonthlyFinalUpdateBody = z.infer<typeof monthlyFinalUpdateInput>;

interface FrameworkContext {
  organizationId: string;
  month: string;
  examDate: string;
  today: string;
  status: string;
  contract: MonthlyCurriculumContract;
  framework: MonthlyFinalFrameworkRef;
}

/** Before 00:00 of the exam date the exam can be generated, edited and approved; from then on it is frozen (VH-R64, VH-R70). */
export function monthlyFinalWindowOpen(today: string, examDate: string): boolean {
  return today < examDate;
}

export function registerMonthlyFinalRoutes(
  app: FastifyInstance, pool: Pool, guard: preHandlerHookHandler, runnerFor: (actorId: string) => Promise<AiTaskRunner | undefined>,
  listeningAudio?: ListeningAudioService
): void {
  const repositories = createRepositories(pool);
  const readers = createRoleGuard(pool, ["operator", "manager"]);

  app.get("/api/v1/month-frameworks/:frameworkId/monthly-final", { preHandler: readers }, async (request, reply) => {
    const params = frameworkParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "MONTHLY_FINAL_FRAMEWORK_INVALID" });
    const actorId = request.e4sSession!.user.id;
    const context = await frameworkContext(pool, actorId, params.data.frameworkId, false, true);
    if (!context) return reply.code(404).send({ code: "MONTHLY_FINAL_FRAMEWORK_NOT_FOUND" });
    const current = await currentMonthlyFinal(pool, context);
    return current ?? reply.code(404).send({ code: "MONTHLY_FINAL_NOT_FOUND" });
  });

  app.post("/api/v1/month-frameworks/:frameworkId/monthly-final", {
    preHandler: guard, config: { rateLimit: { max: 4, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const params = frameworkParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "MONTHLY_FINAL_FRAMEWORK_INVALID" });
    const actorId = request.e4sSession!.user.id;
    const context = await frameworkContext(pool, actorId, params.data.frameworkId, true);
    if (!context) return reply.code(404).send({ code: "MONTHLY_FINAL_FRAMEWORK_NOT_APPROVED" });
    if (!monthlyFinalWindowOpen(context.today, context.examDate)) return reply.code(409).send({ code: "MONTHLY_FINAL_EXAM_DATE_LOCKED", examDate: context.examDate, today: context.today });
    const planIssues = validateMonthlyCurriculum(context.contract);
    if (planIssues.length) return reply.code(409).send({ code: "MONTHLY_FRAMEWORK_PLAN_INVALID", issues: planIssues });
    let input;
    try { input = buildMonthlyFinalGenerationInput(context.contract, context.framework); }
    catch (error) {
      if (error instanceof MonthlyFinalInputError) return reply.code(422).send({ code: "MONTHLY_FINAL_INPUT_ERROR", status: "INPUT_ERROR", missing: error.missing });
      throw error;
    }
    if (await hasPublishedMonthlyFinal(pool, context)) return reply.code(409).send({ code: "MONTHLY_FINAL_ALREADY_PUBLISHED" });
    const runner = await runnerFor(actorId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const task = await repositories.aiRuns.activeTaskPrompt(actorId, "monthly_final_generation");
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    let receptive: { output: MonthlyFinalReceptiveOutput; metadata: Awaited<ReturnType<AiTaskRunner["runTask"]>>["metadata"] }; let productive;
    try {
      // Same slicing as the level-up form: one call producing both listening
      // and reading left the reading section empty, so they are separate calls,
      // and reading questions still missing are requested again for those terms.
      const [listening, reading, productiveResult] = await Promise.all([
        generateMonthlyFinalListening(runner,input,task.prompt),
        generateMonthlyFinalReading(runner, input, task.prompt),
        generateMonthlyFinalProductive(runner, input, `${task.prompt}\nGenerate ONLY the productive part now: title, GA/GB main and secondary components (when a grammar topic has lockedMainStepId/lockedSecondaryStepId, use exactly those step IDs), the Writing task, Speaking A read-aloud with its 8 positions, and Speaking B voice note, with sample answers. First choose two different taught words per P1–P4, then write a natural passage containing ALL eight selected words within levelProfile.speakingA.maxWords. Check every selected word is present in the passage. Grammar evidence fields are exact quotes from the actual corresponding sample, without commentary or instructions to add a sentence later. Writing and Speaking B samples must use all their own assigned target words naturally. Keep Writing sample within the levelProfile writing word range. Write learner facts as short notes in the instruction language. Paraphrase those notes in the model answers. The learner task and facts must not copy taught grammar examples.`)
      ]);
      receptive = {
        output: { listening: (listening.output as Pick<MonthlyFinalReceptiveOutput, "listening">).listening, reading },
        metadata: listening.metadata
      };
      productive = productiveResult;
    } catch (error) {
      if (error && typeof error === "object" && (error as { code?: unknown }).code === "AI_OUTPUT_INVALID") {
        const issues=safeGenerationDiagnosticIssues(error);
        await repositories.aiRuns.recordFailed({userId:actorId,requestId:`monthly-final:${context.framework.id}:${Date.now()}`,taskId:task.taskId,promptVersionId:task.promptVersionId,errorCode:"AI_OUTPUT_INVALID",diagnostic:{issues,invalidOutput:(error as {details?:{invalidOutput?:string}}).details?.invalidOutput}});
        return reply.code(422).send({ code: "AI_OUTPUT_INVALID", issues });
      }
      request.log.warn({ error }, "Monthly final generation failed");
      return reply.code(502).send({ code: "MONTHLY_FINAL_GENERATION_FAILED" });
    }
    const blueprint = assembleMonthlyFinalFromAi(context.contract, context.framework, receptive.output as MonthlyFinalReceptiveOutput, productive.output as MonthlyFinalProductiveOutput);
    const failures = blueprint.monthlyExam!.checks.filter(check=>check.status === "fail");
    if (failures.length) {
      // Never retire/replace a usable draft with an AI result that fails a
      // check the program can already prove. Keep the rejected attempt only as diagnostics.
      await repositories.aiRuns.recordFailed({
        userId: actorId, requestId: `monthly-final:${context.framework.id}:${Date.now()}`, taskId: task.taskId, promptVersionId: task.promptVersionId,
        errorCode: "MONTHLY_FINAL_GENERATION_QUALITY_FAILED", diagnostic: { checks: failures, receptive: receptive.output, productive: productive.output }, metadata: receptive.metadata
      });
      return reply.code(422).send({code:"MONTHLY_FINAL_GENERATION_QUALITY_FAILED",report:{checks:failures}});
    }
    // December 2026: independent answer check, one call per form (b8e3c20 approach). Disputed Reading
    // items get one targeted repair and one re-check of those items only; anything left is a quality failure.
    let verifiedBlueprint = blueprint;
    let disputes = await verifyMonthlyFinalAnswers(runner, context.contract.cefr, blueprint);
    const readingDisputes = disputes.filter((finding) => finding.section === "reading");
    if (readingDisputes.length) {
      const termOf = new Map(blueprint.monthlyExam!.mapping.filter((row) => row.skill === "reading").map((row) => [row.taskKey, row.termId] as const));
      try {
        const repairedReading = await repairMonthlyFinalReadingItems(runner, input, receptive.output.reading, readingDisputes.flatMap((finding) => termOf.has(finding.taskKey) ? [{ termId: termOf.get(finding.taskKey)!, message: finding.hint }] : []));
        const repairedOutput = { ...receptive.output, reading: repairedReading };
        const candidate = assembleMonthlyFinalFromAi(context.contract, context.framework, repairedOutput, productive.output as MonthlyFinalProductiveOutput);
        if (!candidate.monthlyExam!.checks.some((check) => check.status === "fail")) {
          const rechecked = await verifyMonthlyFinalAnswers(runner, context.contract.cefr, candidate, new Set(readingDisputes.map((finding) => finding.taskKey)));
          verifiedBlueprint = candidate;
          receptive = { ...receptive, output: repairedOutput };
          disputes = [...disputes.filter((finding) => finding.section !== "reading"), ...rechecked];
        }
      } catch (error) {
        request.log.warn({ error }, "Monthly final reading repair after the answer check failed");
      }
    }
    if (disputes.length) {
      const checks = (["GEN05", "GEN12"] as const).flatMap((code) => {
        const found = disputes.filter((finding) => finding.code === code);
        return found.length ? [{ code, title: code === "GEN05" ? "Câu khách quan có một đáp án đúng duy nhất" : "Không ép nhồi từ thiếu tự nhiên", mode: "manual" as const, status: "fail" as const, detail: found.map((finding) => finding.message).join(" · ") }] : [];
      });
      await repositories.aiRuns.recordFailed({
        userId: actorId, requestId: `monthly-final:${context.framework.id}:${Date.now()}`, taskId: task.taskId, promptVersionId: task.promptVersionId,
        errorCode: "MONTHLY_FINAL_GENERATION_QUALITY_FAILED", diagnostic: { checks, disputes, receptive: receptive.output, productive: productive.output }, metadata: receptive.metadata
      });
      return reply.code(422).send({ code: "MONTHLY_FINAL_GENERATION_QUALITY_FAILED", report: { checks } });
    }
    await repositories.aiRuns.recordSucceeded({
      userId: actorId, requestId: `monthly-final:${context.framework.id}:${Date.now()}`, taskId: task.taskId, promptVersionId: task.promptVersionId,
      output: { receptive: receptive.output, productive: productive.output }, metadata: receptive.metadata
    });
    // Both listening messages get Edge TTS audio now; audio.status stays SCRIPT_ONLY until the Operator has listened (GEN20).
    // A message whose script is unchanged keeps the audio of the draft being replaced (no new synthesis).
    const previous = blueprintListeningAudioIndex((await currentMonthlyFinal(pool, context).catch(() => null))?.blueprint);
    const withAudio = await withBlueprintListeningAudio(verifiedBlueprint, listeningAudio, actorId, { previous });
    if (withAudio.failed) request.log.warn({ failed: withAudio.failed }, "Monthly final listening audio synthesis failed");
    try {
      await saveNewDraft(pool, context, withEvaluation(withAudio.blueprint, context.contract), true);
    } catch (error) {
      return reply.code(409).send({ code: errorCode(error, "MONTHLY_FINAL_CREATE_FAILED") });
    }
    return reply.code(201).send(await currentMonthlyFinal(pool, context));
  });

  app.post("/api/v1/month-frameworks/:frameworkId/monthly-final/manual", { preHandler: guard }, async (request, reply) => {
    const params = frameworkParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "MONTHLY_FINAL_FRAMEWORK_INVALID" });
    const actorId = request.e4sSession!.user.id;
    const context = await frameworkContext(pool, actorId, params.data.frameworkId, true);
    if (!context) return reply.code(404).send({ code: "MONTHLY_FINAL_FRAMEWORK_NOT_APPROVED" });
    if (!monthlyFinalWindowOpen(context.today, context.examDate)) return reply.code(409).send({ code: "MONTHLY_FINAL_EXAM_DATE_LOCKED", examDate: context.examDate, today: context.today });
    const planIssues = validateMonthlyCurriculum(context.contract);
    if (planIssues.length) return reply.code(409).send({ code: "MONTHLY_FRAMEWORK_PLAN_INVALID", issues: planIssues });
    let blueprint;
    try { blueprint = buildManualMonthlyFinalDraft(context.contract, context.framework); }
    catch (error) {
      if (error instanceof MonthlyFinalInputError) return reply.code(422).send({ code: "MONTHLY_FINAL_INPUT_ERROR", status: "INPUT_ERROR", missing: error.missing });
      throw error;
    }
    try {
      // A repeated "Soạn tay" re-opens the existing reviewable draft.
      await saveNewDraft(pool, context, blueprint, false);
    } catch (error) {
      return reply.code(409).send({ code: errorCode(error, "MONTHLY_FINAL_CREATE_FAILED") });
    }
    return reply.code(201).send(await currentMonthlyFinal(pool, context));
  });

  app.put("/api/v1/monthly-final-forms/:versionId", { preHandler: guard }, async (request, reply) => {
    const params = versionParam.safeParse(request.params);
    const body = monthlyFinalUpdateInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "MONTHLY_FINAL_FORM_INVALID" });
    const actorId = request.e4sSession!.user.id;
    const version = await draftVersion(pool, actorId, params.data.versionId);
    if (!version) return reply.code(409).send({ code: "MONTHLY_FINAL_NOT_EDITABLE" });
    const exam = version.blueprint.monthlyExam;
    if (!exam) return reply.code(409).send({ code: "MONTHLY_FINAL_REGENERATE_REQUIRED" });
    const context = await frameworkContext(pool, actorId, exam.framework.id, false);
    if (!context) return reply.code(409).send({ code: "MONTHLY_FINAL_FRAMEWORK_NOT_FOUND" });
    if (!monthlyFinalWindowOpen(context.today, context.examDate)) return reply.code(409).send({ code: "MONTHLY_FINAL_EXAM_DATE_LOCKED", examDate: context.examDate, today: context.today });
    let blueprint;
    try { blueprint = applyMonthlyFinalUpdate(version.blueprint, body.data, actorId, new Date()); }
    catch (error) { return reply.code(400).send({ code: errorCode(error, "MONTHLY_FINAL_FORM_INVALID") }); }
    const evaluated = withEvaluation(blueprint, context.contract);
    await pool.query("update assessment_definitions set title = $1 where id = $2", [evaluated.title, version.definitionId]);
    await pool.query("update assessment_versions set blueprint = $1::jsonb where id = $2 and status = 'draft'", [JSON.stringify(evaluated), params.data.versionId]);
    return currentMonthlyFinal(pool, context);
  });

  app.post("/api/v1/monthly-final-forms/:versionId/publication", { preHandler: guard }, async (request, reply) => {
    const params = versionParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "MONTHLY_FINAL_VERSION_INVALID" });
    const actorId = request.e4sSession!.user.id;
    const client = await pool.connect();
    try {
      await client.query("begin");
      const version = await draftVersion(client, actorId, params.data.versionId, true);
      if (!version) { await client.query("rollback"); return reply.code(404).send({ code: "MONTHLY_FINAL_NOT_FOUND" }); }
      const exam = version.blueprint.monthlyExam;
      const context = exam ? await frameworkContext(client, actorId, exam.framework.id, false) : null;
      if (!exam || !context) { await client.query("rollback"); return reply.code(409).send({ code: "MONTHLY_FINAL_REGENERATE_REQUIRED" }); }
      if (!monthlyFinalWindowOpen(context.today, context.examDate)) { await client.query("rollback"); return reply.code(409).send({ code: "MONTHLY_FINAL_EXAM_DATE_LOCKED", examDate: context.examDate, today: context.today }); }
      if (context.status !== "approved" || isStale(exam, context)) { await client.query("rollback"); return reply.code(409).send({ code: "MONTHLY_FINAL_SCOPE_STALE" }); }
      // Re-check against the current approved plan; never trust the stored status.
      const evaluated = withEvaluation(version.blueprint, context.contract);
      const status = evaluated.monthlyExam!.status;
      const blocking = evaluated.monthlyExam!.checks.filter((check) => check.status !== "pass").map((check) => check.code);
      if (evaluated.monthlyExam!.audio.status !== "REVIEWED") { await client.query("rollback"); return reply.code(409).send({ code: "MONTHLY_FINAL_AUDIO_NOT_REVIEWED", status, issues: blocking }); }
      if (status !== "READY") { await client.query("rollback"); return reply.code(409).send({ code: "MONTHLY_FINAL_NOT_READY", status, issues: blocking }); }
      const issues: string[] = monthlyFinalReleaseReadiness(evaluated);
      if (!await hasPersistedMonthlyAudio(client, actorId, evaluated)) issues.push("LISTENING_AUDIO_SOURCE_MISSING");
      if (issues.length) { await client.query("rollback"); return reply.code(409).send({ code: "MONTHLY_FINAL_NOT_PUBLISHABLE", issues }); }
      await client.query("update assessment_versions set status = 'retired' where definition_id = $1 and status = 'published'", [version.definitionId]);
      const published = await client.query<{ published_at: Date }>(
        "update assessment_versions set status = 'published', published_at = now(), blueprint = $2::jsonb where id = $1 returning published_at",
        [params.data.versionId, JSON.stringify(evaluated)]
      );
      await client.query("commit");
      return { versionId: params.data.versionId, publishedAt: published.rows[0]!.published_at.toISOString() };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  });
}

/**
 * Merges an Operator edit into the stored draft. The exam frame (task keys,
 * scores, mapping, durations) is locked to the generated v2.0 structure; only
 * learner-facing text, keys, scripts, audio and the review fields change.
 */
export function applyMonthlyFinalUpdate(stored: StoredAssessmentDefinition, input: MonthlyFinalUpdateBody, actorId: string, now: Date): StoredAssessmentDefinition {
  const exam = stored.monthlyExam!;
  const sections = stored.sections.map((section) => {
    const posted = input.sections.find((item) => item.code === section.code);
    if (!posted) throw new Error("MONTHLY_FINAL_STRUCTURE_LOCKED");
    const storedKeys = section.groups.flatMap((group) => group.tasks.map((task) => task.key)).join("|");
    const postedKeys = posted.groups.flatMap((group) => group.tasks.map((task) => task.key)).join("|");
    if (storedKeys !== postedKeys || posted.groups.map((group) => group.key).join("|") !== section.groups.map((group) => group.key).join("|")) throw new Error("MONTHLY_FINAL_STRUCTURE_LOCKED");
    return {
      ...section,
      groups: section.groups.map((group, groupIndex) => {
        const postedGroup = posted.groups[groupIndex]!;
        const stimulus = section.code === "listening" && postedGroup.stimulus?.type === "audio_script"
          ? { type: "audio_script" as const, lines: postedGroup.stimulus.lines, ...(postedGroup.stimulus.audioSrc?.trim() ? { audioSrc: postedGroup.stimulus.audioSrc.trim() } : {}) }
          : section.code === "reading" && postedGroup.stimulus?.type === "passage" && postedGroup.stimulus.text.trim()
            ? { type: "passage" as const, text: postedGroup.stimulus.text }
            : section.code === "reading" ? undefined : group.stimulus;
        const { stimulus: _previous, ...rest } = group;
        return {
          ...rest,
          ...(stimulus ? { stimulus } : {}),
          tasks: group.tasks.map((task, taskIndex) => {
            const postedTask = postedGroup.tasks[taskIndex]!;
            if (task.responseType !== "single_choice") return { ...task, prompt: postedTask.prompt };
            const options = (task.options ?? []).map((option, optionIndex) => ({ value: option.value, label: postedTask.options?.[optionIndex]?.label ?? option.label }));
            const correct = postedTask.correctAnswer && options.some((option) => option.value === postedTask.correctAnswer) ? postedTask.correctAnswer : task.correctAnswer;
            return { ...task, prompt: postedTask.prompt, options, ...(correct ? { correctAnswer: correct } : {}) };
          })
        };
      })
    };
  }) as StoredAssessmentDefinition["sections"];

  const review = input.review ?? {};
  const grammar = exam.grammar.map((target) => {
    const choice = review.grammar?.find((item) => item.code === target.code);
    if (!choice) return target;
    const taught = new Map(target.taughtSteps.map((step) => [step.stepId, step]));
    const main = taught.get(choice.mainStepId);
    const secondary = taught.get(choice.secondaryStepId);
    if (!main || !secondary || main.stepId === secondary.stepId) throw new Error("MONTHLY_FINAL_GRAMMAR_COMPONENT_INVALID");
    // Grammar roadmap months: the operator may edit labels and patterns, never which steps are main/secondary.
    if (target.roadmapLocked && (main.stepId !== target.main.stepId || secondary.stepId !== target.secondary.stepId)) throw new Error("MONTHLY_FINAL_GRAMMAR_COMPONENT_LOCKED");
    return {
      ...target,
      main: { stepId: main.stepId, label: main.stepId === target.main.stepId ? target.main.label : main.focus, acceptedPatterns: choice.mainPatterns ?? (main.stepId === target.main.stepId ? target.main.acceptedPatterns : [main.formula]) },
      secondary: { stepId: secondary.stepId, label: secondary.stepId === target.secondary.stepId ? target.secondary.label : secondary.focus, acceptedPatterns: choice.secondaryPatterns ?? (secondary.stepId === target.secondary.stepId ? target.secondary.acceptedPatterns : [secondary.formula]) }
    };
  });
  const listeningEvidence = exam.grader.listening.map((item) => {
    const posted = review.listeningEvidence?.find((candidate) => candidate.groupKey === item.groupKey);
    return posted ? { groupKey: item.groupKey, gaSentence: posted.gaSentence.trim(), gbSentence: posted.gbSentence.trim() } : item;
  });
  const items = Object.fromEntries(Object.entries(exam.grader.items).map(([key, item]) => {
    const posted = review.items?.[key];
    return [key, posted ? { explanation: posted.explanation.trim(), ...(posted.evidence?.trim() ? { evidence: posted.evidence.trim() } : {}) } : item];
  }));

  // Audio must be re-heard whenever the script or the audio file changes.
  const audioSignature = (definition: Pick<StoredAssessmentDefinition, "sections">) => JSON.stringify(definition.sections.find((section) => section.code === "listening")?.groups.map((group) => [
    group.stimulus?.audioSrc ?? "", (group.stimulus?.lines ?? []).map((line) => `${line.speaker}: ${line.text.trim()}`).join("\n")
  ]) ?? []);
  const audioChanged = audioSignature(stored) !== audioSignature({ sections });
  const listeningGroups = sections.find((section) => section.code === "listening")?.groups ?? [];
  const allAudio = listeningGroups.length > 0 && listeningGroups.every((group) => group.stimulus?.type === "audio_script" && Boolean(group.stimulus.audioSrc));
  const reviewed = !audioChanged && allAudio && (review.audioReviewed ?? exam.audio.status === "REVIEWED");
  const audio: MonthlyFinalExamMeta["audio"] = reviewed
    ? (exam.audio.status === "REVIEWED" ? exam.audio : { status: "REVIEWED", reviewedAt: now.toISOString(), reviewedBy: actorId })
    : { status: "SCRIPT_ONLY", reviewedAt: null, reviewedBy: null };
  const manualConfirmations = [...new Set((review.manualConfirmations ?? exam.manualConfirmations)
    .filter((code): code is MonthlyFinalGenCode => MONTHLY_FINAL_MANUAL_RULES.includes(code as MonthlyFinalGenCode)))];
  // Record who ticked each confirmation and when; an unticked code leaves the log.
  const previousLog = exam.manualConfirmationLog ?? [];
  const manualConfirmationLog = manualConfirmations.map((code) => previousLog.find((entry) => entry.code === code)
    ?? (exam.manualConfirmations.includes(code) ? { code, confirmedBy: "unknown", confirmedAt: exam.generatedAt } : { code, confirmedBy: actorId, confirmedAt: now.toISOString() }));

  return {
    ...stored,
    title: input.title,
    sections,
    monthlyExam: { ...exam, grammar, grader: { ...exam.grader, listening: listeningEvidence, items }, audio, manualConfirmations, manualConfirmationLog }
  };
}

type Queryable = Pool | PoolClient;

async function frameworkContext(db: Queryable, actorId: string, frameworkId: string, requireApproved: boolean, readOnly = false): Promise<FrameworkContext | null> {
  const result = await db.query<{ organization_id: string; month: string; exam_date: string; today: string; status: string; version: number; scope_hash: string; curriculum_contract: unknown }>(
    `select operator.organization_id, pm.month, pm.exam_date::text, organization_system_date(operator.organization_id)::text as today,
            mf.status, mf.version, mf.scope_hash, mf.curriculum_contract
     from users operator join month_frameworks mf on mf.id = $2
     join program_months pm on pm.id = mf.program_month_id and pm.organization_id = operator.organization_id
     where operator.id = $1 and operator.status = 'active' and (operator.role = 'operator' or ($3 and operator.role = 'manager'))
       and mf.status <> 'retired'${requireApproved ? " and mf.status = 'approved'" : ""}
       and pm.month between to_char(organization_system_date(operator.organization_id) - case when $3 then interval '1 month' else interval '0 months' end, 'YYYY-MM')
                        and to_char(organization_system_date(operator.organization_id) + interval '1 month', 'YYYY-MM')`, [actorId, frameworkId, readOnly]);
  const row = result.rows[0];
  if (!row) return null;
  const contract = row.curriculum_contract as MonthlyCurriculumContract;
  return {
    organizationId: row.organization_id, month: row.month, examDate: row.exam_date, today: row.today, status: row.status, contract,
    framework: { id: frameworkId, version: row.version, scopeHash: row.scope_hash || monthlyScopeHash(contract), examDate: row.exam_date }
  };
}

function definitionKey(context: FrameworkContext): string {
  return `monthly-final-${context.contract.month}-${context.contract.cefr.toLowerCase()}`;
}

function isStale(exam: MonthlyFinalExamMeta, context: FrameworkContext): boolean {
  return exam.framework.id !== context.framework.id || exam.framework.version !== context.framework.version || exam.framework.scopeHash !== context.framework.scopeHash;
}

async function hasPublishedMonthlyFinal(pool: Pool, context: FrameworkContext): Promise<boolean> {
  const result = await pool.query(
    `select 1 from assessment_definitions ad join assessment_versions av on av.definition_id = ad.id and av.status = 'published'
     where ad.organization_id = $1 and ad.assessment_key = $2 limit 1`, [context.organizationId, definitionKey(context)]);
  return Boolean(result.rowCount);
}

/** replaceDraft = AI regeneration: the previous draft becomes "Đã thay" (retired) and the new one starts as DRAFT. */
async function saveNewDraft(pool: Pool, context: FrameworkContext, blueprint: StoredAssessmentDefinition, replaceDraft: boolean): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query<{ id: string }>(
      "select id from assessment_definitions where organization_id = $1 and assessment_key = $2 for update", [context.organizationId, blueprint.key]);
    const definitionId = existing.rows[0]?.id ?? randomUUID();
    if (existing.rowCount) {
      const published = await client.query("select 1 from assessment_versions where definition_id = $1 and status = 'published' limit 1", [definitionId]);
      // A published monthly final is immutable; corrections go through the Manager reopen workflow.
      if (published.rowCount) throw new Error("MONTHLY_FINAL_ALREADY_PUBLISHED");
      const draft = await client.query<{ id: string }>("select id from assessment_versions where definition_id = $1 and status = 'draft' for update", [definitionId]);
      if (draft.rowCount && !replaceDraft) { await client.query("commit"); return; }
      if (draft.rowCount) await client.query("update assessment_versions set status = 'retired' where definition_id = $1 and status = 'draft'", [definitionId]);
      await client.query("update assessment_definitions set title = $1 where id = $2", [blueprint.title, definitionId]);
    } else {
      await client.query(
        "insert into assessment_definitions (id, organization_id, assessment_key, kind, title) values ($1, $2, $3, 'final', $4)",
        [definitionId, context.organizationId, blueprint.key, blueprint.title]);
    }
    const next = await client.query<{ version: number }>("select coalesce(max(version), 0) + 1 as version from assessment_versions where definition_id = $1", [definitionId]);
    const version = next.rows[0]?.version ?? 1;
    await client.query(
      "insert into assessment_versions (id, definition_id, version, status, blueprint) values ($1, $2, $3, 'draft', $4::jsonb)",
      [randomUUID(), definitionId, version, JSON.stringify({ ...blueprint, version })]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}

async function currentMonthlyFinal(pool: Pool, context: FrameworkContext): Promise<MonthlyFinalDraftView | null> {
  const result = await pool.query<{ definition_id: string; version_id: string; version: number; status: "draft" | "published"; blueprint: StoredAssessmentDefinition }>(
    `select ad.id as definition_id, av.id as version_id, av.version, av.status, av.blueprint
     from assessment_definitions ad join assessment_versions av on av.definition_id = ad.id and av.status in ('draft', 'published')
     where ad.organization_id = $1 and ad.assessment_key = $2
     order by case av.status when 'draft' then 0 else 1 end, av.version desc limit 1`, [context.organizationId, definitionKey(context)]);
  const row = result.rows[0];
  if (!row) return null;
  // Always present checks against the current approved plan.
  const blueprint = row.blueprint.monthlyExam ? withEvaluation(row.blueprint, context.contract) : row.blueprint;
  return monthlyFinalDraftView(row, blueprint, context);
}

export function monthlyFinalDraftView(
  row: { definition_id: string; version_id: string; version: number; status: "draft" | "published" },
  blueprint: StoredAssessmentDefinition,
  context: Pick<FrameworkContext, "examDate" | "today" | "framework">
): MonthlyFinalDraftView {
  const exam = blueprint.monthlyExam ?? null;
  return {
    definitionId: row.definition_id, versionId: row.version_id, version: row.version, status: row.status,
    blueprint: {
      title: blueprint.title,
      sections: blueprint.sections.map((section) => ({
        ...section,
        groups: section.groups.map((group) => ({ ...group, tasks: group.tasks.map((task) => ({ ...task, correctAnswer: task.correctAnswer ?? null })) }))
      }))
    },
    exam,
    examDate: context.examDate,
    editable: row.status === "draft" && Boolean(exam) && monthlyFinalWindowOpen(context.today, context.examDate),
    stale: exam ? exam.framework.id !== context.framework.id || exam.framework.version !== context.framework.version || exam.framework.scopeHash !== context.framework.scopeHash : true
  };
}

async function draftVersion(db: Queryable, actorId: string, versionId: string, lock = false): Promise<{ definitionId: string; blueprint: StoredAssessmentDefinition } | null> {
  const result = await db.query<{ definition_id: string; blueprint: StoredAssessmentDefinition }>(
    `select av.definition_id, av.blueprint from assessment_versions av
     join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'final'
     join users operator on operator.id = $1 and operator.organization_id = ad.organization_id and operator.role = 'operator'
     where av.id = $2 and av.status = 'draft'${lock ? " for update of av" : ""}`, [actorId, versionId]);
  const row = result.rows[0];
  return row ? { definitionId: row.definition_id, blueprint: row.blueprint } : null;
}

/** Every listening message must point at an audio file persisted in this organization's content media. */
async function hasPersistedMonthlyAudio(client: PoolClient, actorId: string, blueprint: StoredAssessmentDefinition): Promise<boolean> {
  const groups = blueprint.sections.find((section) => section.code === "listening")?.groups ?? [];
  if (!groups.length) return false;
  for (const group of groups) {
    const audioSrc = group.stimulus?.type === "audio_script" ? group.stimulus.audioSrc : undefined;
    if (!audioSrc) return false;
    let artifactKey: string | null = null;
    try {
      const url = new URL(audioSrc, "http://e4s.local");
      if (url.pathname !== "/api/v1/files/content-media/read") return false;
      artifactKey = url.searchParams.get("artifactKey");
    } catch { return false; }
    if (!artifactKey?.startsWith("content-media/")) return false;
    const persisted = await client.query(
      `select 1 from files f join users owner on owner.id = f.owner_user_id join users operator on operator.id = $1
       where f.purpose = 'content_media' and f.object_key = $2 and f.mime_type like 'audio/%' and owner.organization_id = operator.organization_id limit 1`,
      [actorId, artifactKey]);
    if (persisted.rowCount !== 1) return false;
  }
  return true;
}

function errorCode(error: unknown, fallback: string): string {
  return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : fallback;
}
