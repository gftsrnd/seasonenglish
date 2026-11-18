import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { AssessmentBankScope, AssessmentLevelFormTarget } from "@e4s/contracts";
import { assessmentBankGroupOutput, type AiTaskRunner } from "@e4s/ai";
import {
  AssessmentBankError,
  bankFormIssues,
  changeBankFormStatus,
  deleteBankForm,
  passCourseFormADefinition,
  placementDefinition,
  readAssessmentBank,
  readBankForm,
  saveBankPolicy,
  writeBankDraft,
  type StoredAssessmentDefinition,
} from "@e4s/database";
import { createRoleGuard } from "../identity/policy.js";
import { withBlueprintListeningAudio, type ListeningAudioService } from "./listening-audio.js";
import { LevelFormQualityError } from "./level-form-quality.js";

const scopeParam = z.object({ scope: z.enum(["placement", "retake", "pass_course", "A2", "B1", "B2", "C1"]) });
const formParam = scopeParam.extend({ id: z.uuid() });
const small = z.string().max(2_000);
const text = z.string().max(30_000);
const key = z.string().trim().min(1).max(100);
const task = z.object({
  key,
  title: small.optional(),
  prompt: text,
  responseType: z.enum(["single_choice", "long_text", "speaking_evidence"]),
  maxScore: z.number().nonnegative().max(100),
  options: z
    .array(z.object({ value: key, label: small }))
    .max(10)
    .optional(),
  correctAnswer: small.optional(),
  minWords: z.number().int().nonnegative().optional(),
  maxWords: z.number().int().positive().optional(),
  hint: text.optional(),
  interaction: z
    .object({
      mode: z.literal("roleplay"),
      openingMessage: text,
      maxLearnerTurns: z.number().int().positive(),
      durationSeconds: z.number().int().positive(),
      endConditions: z.array(z.enum(["time_limit", "turn_limit", "customer_accepted"])),
      fallback: z.literal("one_way_manual_review"),
    })
    .optional(),
});
const stimulus = z.object({
  type: z.enum(["audio_script", "passage", "message", "table"]),
  audioSrc: small.optional(),
  text: text.optional(),
  audioSynthesis: z
    .object({
      status: z.enum(["generated", "failed"]),
      code: small.optional(),
      scriptHash: small.optional(),
      at: small.optional(),
      engine: small.optional(),
      voicePolicy: small.optional(),
    })
    .optional(),
  lines: z
    .array(z.object({ speaker: small, text }))
    .max(80)
    .optional(),
  headers: z.array(small).max(40).optional(),
  rows: z.array(z.array(small).max(40)).max(100).optional(),
});
const formInput = z.object({
  key,
  kind: z.enum(["placement", "pass-course", "level-up"]),
  title: key.or(z.string().trim().min(1).max(300)),
  version: z.number().int().positive(),
  totalMinutes: z.number().int().positive(),
  totalScore: z.number().positive(),
  targetLevel: z.enum(["A1", "A2", "B1", "B2", "C1"]).optional(),
  placementRetakeSource: z.enum(["manual", "ai"]).optional(),
  sections: z
    .array(
      z.object({
        code: z.enum(["listening", "reading", "writing", "speaking"]),
        title: small,
        durationMinutes: z.number().int().positive().max(180),
        maxScore: z.number().positive().max(100),
        instructions: z.array(small).max(40),
        groups: z
          .array(
            z.object({
              key,
              title: small,
              instruction: text,
              stimulus: stimulus.optional(),
              maxPlays: z.number().int().min(1).max(10).optional(),
              tasks: z.array(task).min(1).max(100),
            }),
          )
          .min(1)
          .max(80),
      }),
    )
    .length(4),
});
function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AssessmentBankError(
      "ASSESSMENT_BANK_INVALID_INPUT",
      400,
      result.error.issues.map((i) => i.path.join(".") + " " + i.message),
    );
  return result.data;
}
type FormGroup = StoredAssessmentDefinition["sections"][number]["groups"][number];
function blankGroup(group: FormGroup): FormGroup {
  const stim = group.stimulus;
  return {
    ...group,
    instruction: "",
    ...(stim
      ? {
          stimulus:
            stim.type === "audio_script"
              ? { type: stim.type, lines: [{ speaker: "Narrator", text: "" }] }
              : stim.type === "table"
                ? { type: stim.type, headers: [""], rows: [[""]] }
                : { type: stim.type, text: "" },
        }
      : {}),
    tasks: group.tasks.map(({ correctAnswer: _answer, hint: _hint, ...t }) => ({
      ...t,
      prompt: "",
      ...(t.options ? { options: t.options.map((o) => ({ ...o, label: "" })) } : {}),
    })),
  };
}
function canonicalFrame(scope: "placement" | "pass_course") {
  const source = scope === "placement" ? placementDefinition : passCourseFormADefinition;
  return {
    ...source,
    title: scope === "placement" ? "Đề đầu vào mới" : "Đề Pass Course mới",
    sections: source.sections.map((s) => ({ ...s, groups: s.groups.map(blankGroup) })),
  };
}

/** Give manual authors the same group slots as the generated promotion and retake forms. */
function groupedManualFrame(
  target: AssessmentLevelFormTarget,
  manual: (target: AssessmentLevelFormTarget) => StoredAssessmentDefinition,
) {
  const frame = manual(target);
  const reading = frame.sections.find((s) => s.code === "reading")!;
  if (target === "placement-retake") {
    reading.groups[0]!.stimulus = { type: "passage", text: "" };
    return frame;
  }
  for (const section of frame.sections) {
    const blank = section.groups[0]!;
    if (section.code === "writing") {
      section.groups = blank.tasks.map((t) => ({ ...blank, key: t.key, title: t.key, tasks: [t] }));
    } else if (section.code === "listening" || section.code === "reading") {
      const listen = section.code === "listening",
        count = listen ? 5 : 4,
        width = listen ? 4 : 10;
      section.groups = Array.from({ length: count }, (_, i) => {
        const key = (listen ? "L" : "R") + (i + 1);
        const { stimulus, ...base } = blank;
        return {
          ...base,
          key,
          title: "Part " + String.fromCharCode(65 + i),
          ...((listen || i === 0) && stimulus ? { stimulus: structuredClone(stimulus) } : {}),
          tasks: blank.tasks.slice(i * width, (i + 1) * width).map((t, j) => ({ ...t, key: key + "_" + (j + 1) })),
        };
      });
    }
  }
  return frame;
}

async function generateCanonical(
  runner: AiTaskRunner,
  scope: "placement" | "pass_course",
  actor: string,
  audio: ListeningAudioService | undefined,
) {
  const blueprint = canonicalFrame(scope);
  const reference = scope === "placement" ? placementDefinition : passCourseFormADefinition;
  for (const [si, section] of blueprint.sections.entries()) {
    const groups = await Promise.all(
      section.groups.map(async (group, gi) => {
        const template = reference.sections[si]!.groups[gi]!;
        const input = {
          scope,
          level: scope === "placement" ? "A1 to C1, easier to harder across the paper" : "C1 exit examination",
          section: section.code,
          group: template.title,
          contextType: template.stimulus?.type ?? "none",
          scenarioType: template.instruction,
          taskSlots: group.tasks.map((t) => ({
            key: t.key,
            response: t.responseType,
            marks: t.maxScore,
            minWords: t.minWords,
            maxWords: t.maxWords,
          })),
        };
        const systemPrompt = "Author a new workplace English exam group with its own coherent scenario. Match the specified task slots, difficulty, score, genre and word limits exactly. Return only the structured group. Preserve every task key in the order supplied. For each single-choice task provide four distinct options and a zero-based correctIndex, varying the answer position. Productive tasks use an empty options array and correctIndex -1. Supply separately labelled turns in order with stable speaker names (Narrator for monologue, distinct named speakers for dialogue) for audio_script, text for passage/message, headers and rows for table. For contextType none, embed any necessary context in each question. Use empty strings or arrays for unused context fields. Every question must be answerable independently using only this group. Never refer to other numbered questions or other groups. Keep instructions and task labels concise.";
        const expected = group.tasks.length;
        const requestGroup = async (feedback?: string) => {
          const result = await runner.runTask("assessment_bank_group_generation",{ ...input, expectedTaskCount:expected,
            ...(feedback ? {correction:feedback} : {}) },{maxOutputTokens:6500,systemPrompt});
          return assessmentBankGroupOutput.parse(result.output);
        };
        let out = await requestGroup();
        if (out.tasks.length !== expected) {
          const feedback = "Return this whole group again with exactly "+expected+" task objects in the requested order, one for each listed slot. The previous response returned "+out.tasks.length+".";
          out = await requestGroup(feedback);
          if(out.tasks.length!==expected) throw new AssessmentBankError("ASSESSMENT_BANK_GENERATION_SHAPE",502,
            [section.code+"/"+group.key+": cần "+expected+" câu, AI trả về "+out.tasks.length+" câu sau khi thử lại."]);
        }
        // A provider may use display numbering (Q1, Q2, …). Slot keys belong to the
        // stored template. Respect an exact set of returned keys even if reordered.
        const byKey = new Map(out.tasks.map(t=>[t.key,t]));
        const orderedAnswers = group.tasks.every(t=>byKey.has(t.key)) ? group.tasks.map(t=>byKey.get(t.key)!) : out.tasks;
        const type = group.stimulus?.type;
        if (
          (type === "audio_script" && !out.lines.length) ||
          ((type === "passage" || type === "message") && !out.text.trim()) ||
          (type === "table" &&
            (!out.headers.length || !out.rows.length || out.rows.some((r) => r.length !== out.headers.length)))
        )
          throw new AssessmentBankError("ASSESSMENT_BANK_GENERATION_STIMULUS", 502);
        const generated: FormGroup = {
          ...group,
          title: out.title,
          instruction: out.instruction,
          ...(type
            ? {
                stimulus:
                  type === "audio_script"
                    ? { type, lines: out.lines }
                    : type === "table"
                      ? { type, headers: out.headers, rows: out.rows }
                      : { type, text: out.text },
              }
            : {}),
          tasks: group.tasks.map((t, i) => {
            const answer = orderedAnswers[i]!;
            if (t.responseType !== "single_choice") return { ...t, prompt: answer.prompt };
            if (
              answer.options.length !== 4 ||
              answer.correctIndex < 0 ||
              new Set(answer.options.map((o) => o.toLowerCase())).size !== 4
            )
              throw new AssessmentBankError("ASSESSMENT_BANK_GENERATION_ANSWERS", 502);
            const options = answer.options.map((label, j) => ({ value: String.fromCharCode(65 + j), label }));
            return { ...t, prompt: answer.prompt, options, correctAnswer: options[answer.correctIndex]!.value };
          }),
        };
        return generated;
      }),
    );
    section.groups = groups;
  }
  return (await withBlueprintListeningAudio(blueprint, audio, actor)).blueprint;
}

export function registerAssessmentBankRoutes(
  app: FastifyInstance,
  pool: Pool,
  runnerFor: (id: string) => Promise<AiTaskRunner | undefined>,
  audio: ListeningAudioService | undefined,
  manual: (target: AssessmentLevelFormTarget) => StoredAssessmentDefinition,
  generateLevel: (actor: string, target: AssessmentLevelFormTarget) => Promise<StoredAssessmentDefinition>,
) {
  const view = { preHandler: createRoleGuard(pool, ["operator", "manager"]) };
  const edit = { preHandler: createRoleGuard(pool, ["operator"]) };
  const base = "/api/v1/assessment-banks/:scope";
  const form = base + "/forms/:id";
  app.get(base, view, async (req) =>
    readAssessmentBank(pool, req.e4sSession!.user.id, parse(scopeParam, req.params).scope),
  );
  app.put(base + "/policy", edit, async (req) =>
    saveBankPolicy(
      pool,
      req.e4sSession!.user.id,
      parse(scopeParam, req.params).scope,
      parse(
        z.object({
          mode: z.enum(["single", "mixed"]),
          sourceCount: z.number().int().positive(),
          versionIds: z.array(z.uuid()).min(1),
        }),
        req.body,
      ),
    ),
  );
  app.get(form, view, async (req) => {
    const { scope, id } = parse(formParam, req.params);
    return readBankForm(pool, req.e4sSession!.user.id, scope, id);
  });
  app.post(
    base + "/forms",
    { ...edit, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const scope: AssessmentBankScope = parse(scopeParam, req.params).scope;
      const { method, title } = parse(
        z.object({ method: z.enum(["manual", "ai"]), title: z.string().trim().min(1).max(300).optional() }),
        req.body,
      );
      const actor = req.e4sSession!.user.id;
      let blueprint: StoredAssessmentDefinition;
      try {
        if (scope === "placement" || scope === "pass_course") {
          if (method === "manual") blueprint = canonicalFrame(scope);
          else {
            const runner = await runnerFor(actor);
            if (!runner) throw new AssessmentBankError("AI_UNAVAILABLE", 503);
            blueprint = await generateCanonical(runner, scope, actor, audio);
          }
        } else {
          const target = scope === "retake" ? "placement-retake" : scope;
          blueprint = method === "manual" ? groupedManualFrame(target, manual) : await generateLevel(actor, target);
          if (scope === "retake") blueprint = { ...blueprint, placementRetakeSource: method };
        }
      } catch (error) {
        if(error instanceof AssessmentBankError) {
          if(error.issues.length) return reply.code(error.statusCode).send({code:error.code,message:error.issues[0],issues:error.issues});
          throw error;
        }
        if (error instanceof LevelFormQualityError)
          return reply
            .code(502)
            .send({ code: "ASSESSMENT_BANK_GENERATION_FAILED", issues: error.issues.map((i) => i.message) });
        req.log.warn({ error }, "Assessment bank generation failed");
        throw new AssessmentBankError("ASSESSMENT_BANK_GENERATION_FAILED", 502);
      }
      return reply
        .code(201)
        .send(await writeBankDraft(pool, actor, scope, title ? { ...blueprint, title } : blueprint));
    },
  );
  app.put(form, edit, async (req) => {
    const { scope, id } = parse(formParam, req.params);
    const { blueprint } = parse(z.object({ blueprint: formInput }), req.body);
    return writeBankDraft(pool, req.e4sSession!.user.id, scope, blueprint as StoredAssessmentDefinition, id);
  });
  app.post(form + "/validate", view, async (req) => {
    const { scope, id } = parse(formParam, req.params),
      actor = req.e4sSession!.user.id;
    const found = await readBankForm(pool, actor, scope, id);
    return { issues: await bankFormIssues(pool, actor, scope, found.blueprint) };
  });
  app.post(form + "/publish", edit, async (req) => {
    const { scope, id } = parse(formParam, req.params);
    parse(z.object({ answersReviewed: z.literal(true) }), req.body);
    return changeBankFormStatus(pool, req.e4sSession!.user.id, scope, id, true);
  });
  app.post(form + "/archive", edit, async (req) => {
    const { scope, id } = parse(formParam, req.params);
    return changeBankFormStatus(pool, req.e4sSession!.user.id, scope, id, false);
  });
  app.delete(form, edit, async (req) => {
    const { scope, id } = parse(formParam, req.params);
    return deleteBankForm(pool, req.e4sSession!.user.id, scope, id);
  });
}
