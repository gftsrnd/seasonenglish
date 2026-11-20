import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { AI_TASKS, createAiService, createAnthropicProvider, curatedPronunciationPlan } from "@e4s/ai";
import {
  assembleAndValidateWeeklyLesson,
  generateWeeklyLessonGrammarClassification,
  generateWeeklyLessonFoundation,
  generateWeeklyLessonObjectives,
  generateWeeklyLessonSkillGroup,
  generateWeeklyLessonVocabulary,
  reviewWeeklyLessonSkills,
  weeklyLessonSkillsGenerationConstraints,
  type WeeklyLessonComponentInput
} from "../src/modules/content/weekly-generation.js";

try {
  loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // Process environment remains authoritative when the local file is absent.
}

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--") && value) args.set(key.slice(2), value);
}

const component = args.get("component") ?? "grammarClassification";
if (!(["grammarClassification", "objectives", "foundation", "vocabulary", "skills.comprehension", "skills.languagePractice", "skills.speaking", "skills.reviewer", "assemble"] as const).includes(component as "grammarClassification" | "objectives" | "foundation" | "vocabulary" | "skills.comprehension" | "skills.languagePractice" | "skills.speaking" | "skills.reviewer" | "assemble")) {
  throw new Error(`COMPONENT_NOT_IMPLEMENTED:${component}`);
}
const inputPath = args.get("input");
const outputPath = args.get("output");
if (!inputPath || !outputPath) {
  throw new Error("Usage: --component grammarClassification --input <json> --output <checkpoint-json>");
}
const absoluteOutput = resolve(outputPath);
process.on("uncaughtException", async (error) => {
  const candidate = error && typeof error === "object" ? error as { code?: unknown; issues?: unknown; details?: unknown; message?: unknown } : {};
  const failure = {
    component,
    status: "failed",
    failedAt: new Date().toISOString(),
    error: {
      code: typeof candidate.code === "string" ? candidate.code : "AI_COMPONENT_FAILED",
      message: typeof candidate.message === "string" ? candidate.message : "AI component failed",
      issues: Array.isArray(candidate.issues) ? candidate.issues : [],
      details: candidate.details && typeof candidate.details === "object" ? candidate.details : {}
    }
  };
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(failure, null, 2)}\n`, "utf8");
  process.stderr.write(`${JSON.stringify({ component, status: "failed_checkpoint_saved", path: absoluteOutput, error: failure.error })}\n`);
  process.exit(1);
});
if (process.env.AI_PROVIDER !== "anthropic" || !process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_AI_NOT_CONFIGURED");
}

const input = JSON.parse(await readFile(resolve(inputPath), "utf8")) as WeeklyLessonComponentInput;
const configuredTimeout = Number(process.env.AI_TIMEOUT_MS ?? 120_000);
const runner = createAiService({
  registry: AI_TASKS,
  provider: createAnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...(process.env.ANTHROPIC_MODEL ? { model: process.env.ANTHROPIC_MODEL } : {})
  }),
  timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 120_000,
  maxAttempts: 1,
  loadPrompt: async () => ""
});

const startedAt = new Date().toISOString();
const progress = (event: Parameters<NonNullable<Parameters<typeof generateWeeklyLessonGrammarClassification>[2]["onProgress"]>>[0]) => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};
type CheckpointState = { grammarClassification?: unknown; objectives?: unknown; foundation?: unknown; vocabulary?: unknown; skills?: Record<string, unknown>; reviewer?: unknown; lesson?: unknown };
type StoredCheckpoint = { status?: string; component?: string; output?: unknown; state?: CheckpointState };
const readCheckpoint = async (path: string) => JSON.parse(await readFile(resolve(path), "utf8")) as StoredCheckpoint;
let priorState: CheckpointState = {};
let generated: Awaited<ReturnType<typeof generateWeeklyLessonGrammarClassification>> | Awaited<ReturnType<typeof generateWeeklyLessonObjectives>> | Awaited<ReturnType<typeof generateWeeklyLessonFoundation>> | Awaited<ReturnType<typeof generateWeeklyLessonVocabulary>> | Awaited<ReturnType<typeof generateWeeklyLessonSkillGroup>> | (Awaited<ReturnType<typeof reviewWeeklyLessonSkills>> & { attempts: number }) | { output: { lesson: unknown }; attempts: 0 };
if (component === "grammarClassification") {
  generated = await generateWeeklyLessonGrammarClassification(input, runner, { qualityReview: true, onProgress: progress });
} else {
  const previousPath = args.get("previous");
  if (!previousPath) throw new Error("PREVIOUS_CHECKPOINT_REQUIRED");
  const previous = await readCheckpoint(previousPath);
  if (previous.status !== "validated") throw new Error("PREVIOUS_CHECKPOINT_INVALID");
  priorState = previous.state ?? {};
  if (previous.component === "grammarClassification") priorState.grammarClassification = previous.output;
  if (previous.component === "objectives") priorState.objectives = previous.output;
  if (previous.component === "foundation") priorState.foundation = previous.output;
  if (previous.component === "vocabulary") priorState.vocabulary = previous.output;
  if (previous.component?.startsWith("skills.") && previous.component !== "skills.reviewer" && previous.output && typeof previous.output === "object") {
    priorState.skills = { ...(priorState.skills ?? {}), ...(previous.output as Record<string, unknown>) };
  }
  if (previous.component === "skills.reviewer") priorState.reviewer = previous.output;
  if (!priorState.grammarClassification) {
    const grammarPath = args.get("grammar");
    if (!grammarPath) throw new Error("GRAMMAR_CHECKPOINT_REQUIRED");
    const grammar = await readCheckpoint(grammarPath);
    if (grammar.status !== "validated" || grammar.component !== "grammarClassification") throw new Error("GRAMMAR_CHECKPOINT_INVALID");
    priorState.grammarClassification = grammar.output;
  }
  const componentInput = {
    ...input,
    grammarClassification: priorState.grammarClassification as never,
    pronunciationPlan: curatedPronunciationPlan(input.cefr, input.dayNumber)
  };
  generated = component === "objectives"
    ? await generateWeeklyLessonObjectives(componentInput, "Generate one complete CEFR-appropriate lesson component from the approved weekly plan.", runner, { onProgress: progress })
    : component === "foundation" ? await (async () => {
        if (previous.component !== "objectives" || !priorState.objectives) throw new Error("OBJECTIVES_CHECKPOINT_REQUIRED");
        return generateWeeklyLessonFoundation(componentInput, "Generate one complete CEFR-appropriate lesson component from the approved weekly plan.", runner, { qualityProfile: "strict", onProgress: progress });
      })()
      : component === "vocabulary" ? await (async () => {
          if (previous.component !== "foundation" || !priorState.foundation) throw new Error("FOUNDATION_CHECKPOINT_REQUIRED");
          const foundation = priorState.foundation as { grammar?: { formula?: string; example1?: string; example2?: string } | null };
          return generateWeeklyLessonVocabulary({
            ...input,
            grammarFormula: foundation.grammar?.formula ?? null,
            grammarExamples: foundation.grammar?.example1 && foundation.grammar?.example2
              ? [foundation.grammar.example1, foundation.grammar.example2]
              : null,
            excludedVocabulary: []
          }, runner, { onProgress: progress });
        })()
        : component !== "skills.reviewer" && component !== "assemble" ? await (async () => {
            const expectedPrevious = component === "skills.comprehension"
              ? "vocabulary"
              : component === "skills.languagePractice"
                ? "skills.comprehension"
                : "skills.languagePractice";
            if (previous.component !== expectedPrevious || !priorState.foundation || !priorState.vocabulary) {
              throw new Error(`PREVIOUS_CHECKPOINT_REQUIRED:${expectedPrevious}`);
            }
            const foundation = priorState.foundation as { grammar?: { formula?: string; example1?: string; example2?: string } | null };
            const vocabulary = priorState.vocabulary as { word1?: { word?: string }; word2?: { word?: string }; word3?: { word?: string } };
            const vocabularyWords = [vocabulary.word1?.word, vocabulary.word2?.word, vocabulary.word3?.word].filter((word): word is string => Boolean(word));
            if (vocabularyWords.length !== 3) throw new Error("VOCABULARY_CHECKPOINT_INVALID");
            return generateWeeklyLessonSkillGroup(component as "skills.comprehension" | "skills.languagePractice" | "skills.speaking", {
              ...input,
              grammarFormula: foundation.grammar?.formula ?? null,
              grammarExamples: foundation.grammar?.example1 && foundation.grammar?.example2
                ? [foundation.grammar.example1, foundation.grammar.example2]
                : null,
              vocabularyWords,
              generationConstraints: weeklyLessonSkillsGenerationConstraints(input.cefr)
            }, runner, { onProgress: progress });
          })()
          : component === "skills.reviewer" ? await (async () => {
              if (previous.component !== "skills.speaking" || !priorState.foundation || !priorState.vocabulary || !priorState.skills) {
                throw new Error("PREVIOUS_CHECKPOINT_REQUIRED:skills.speaking");
              }
              const foundation = priorState.foundation as { grammar?: { formula?: string; example1?: string; example2?: string } | null };
              const vocabulary = priorState.vocabulary as { word1?: { word?: string }; word2?: { word?: string }; word3?: { word?: string } };
              const vocabularyWords = [vocabulary.word1?.word, vocabulary.word2?.word, vocabulary.word3?.word].filter((word): word is string => Boolean(word));
              if (vocabularyWords.length !== 3) throw new Error("VOCABULARY_CHECKPOINT_INVALID");
              const skillsInput = {
                ...input,
                grammarFormula: foundation.grammar?.formula ?? null,
                grammarExamples: foundation.grammar?.example1 && foundation.grammar?.example2 ? [foundation.grammar.example1, foundation.grammar.example2] : null,
                vocabularyWords,
                generationConstraints: weeklyLessonSkillsGenerationConstraints(input.cefr)
              };
              let reviewed = await reviewWeeklyLessonSkills(runner, skillsInput, priorState.skills as never);
              if (reviewed.findings.length > 0) {
                process.stdout.write(`${JSON.stringify({ component: "skills.reviewer", status: "targeted_repair_required", findings: reviewed.output.findings })}\n`);
                const grouped = new Map<"skills.comprehension" | "skills.languagePractice" | "skills.speaking", Array<{ path: PropertyKey[]; message: string }>>();
                for (const finding of reviewed.findings) {
                  const code = String(finding.path[0] ?? "");
                  const group = code === "listening" || code === "reading"
                    ? "skills.comprehension"
                    : code === "writing" || code === "wordClass" || code === "wordUse"
                      ? "skills.languagePractice"
                      : code === "speaking"
                        ? "skills.speaking"
                        : undefined;
                  if (!group) throw Object.assign(new Error("AI_REVIEW_FINDING_UNROUTABLE"), { code: "AI_OUTPUT_INVALID", issues: [finding] });
                  grouped.set(group, [...(grouped.get(group) ?? []), finding]);
                }
                for (const [group, findings] of grouped) {
                  const repaired = await generateWeeklyLessonSkillGroup(group, skillsInput, runner, {
                    maxAttempts: 1,
                    reviewerFindings: findings,
                    onProgress: progress
                  });
                  priorState.skills = { ...(priorState.skills ?? {}), ...(repaired.output as Record<string, unknown>) };
                }
                reviewed = await reviewWeeklyLessonSkills(runner, skillsInput, priorState.skills as never);
              }
              if (reviewed.findings.length > 0 || reviewed.output.status !== "approved") {
                throw Object.assign(new Error("AI_REVIEW_FAILED_AFTER_TARGETED_REPAIR"), {
                  code: "AI_OUTPUT_INVALID",
                  issues: reviewed.findings,
                  details: { reviewerOutput: reviewed.output }
                });
              }
              return { ...reviewed, attempts: 1 };
            })()
            : await (async () => {
                if (previous.component !== "skills.reviewer" || !priorState.grammarClassification || !priorState.objectives || !priorState.foundation || !priorState.vocabulary || !priorState.skills || !priorState.reviewer) {
                  throw new Error("PREVIOUS_CHECKPOINT_REQUIRED:skills.reviewer");
                }
                const lesson = assembleAndValidateWeeklyLesson({
                  componentInput: input,
                  grammarClassification: priorState.grammarClassification as never,
                  objectives: priorState.objectives as never,
                  foundation: priorState.foundation as never,
                  vocabulary: priorState.vocabulary as never,
                  skills: priorState.skills as never,
                  reviewer: priorState.reviewer as never
                });
                return { output: { lesson }, attempts: 0 as const };
              })();
}
const state: CheckpointState = component === "grammarClassification"
  ? { grammarClassification: generated.output }
  : component === "objectives"
    ? { ...priorState, objectives: generated.output }
    : component === "foundation"
      ? { ...priorState, foundation: generated.output }
      : component === "vocabulary"
        ? { ...priorState, vocabulary: generated.output }
        : component === "skills.reviewer"
          ? { ...priorState, reviewer: generated.output }
          : component === "assemble"
            ? { ...priorState, lesson: generated.output }
            : { ...priorState, skills: { ...(priorState.skills ?? {}), ...(generated.output as Record<string, unknown>) } };
const checkpoint = {
  component,
  status: "validated",
  startedAt,
  completedAt: new Date().toISOString(),
  input,
  attempts: generated.attempts,
  output: generated.output,
  state,
  ...("result" in generated ? { metadata: {
    provider: generated.result.metadata.provider,
    model: generated.result.metadata.model,
    latencyMs: generated.result.metadata.latencyMs,
    usage: generated.result.metadata.usage
  } } : { metadata: { source: "deterministic-final-validation" } })
};
await mkdir(dirname(absoluteOutput), { recursive: true });
await writeFile(absoluteOutput, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ component, status: "checkpoint_saved", path: absoluteOutput, attempts: generated.attempts })}\n`);
