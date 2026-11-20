import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { AI_TASKS, createAiService, createAnthropicProvider } from "@e4s/ai";
import type { ContentWeekInput } from "@e4s/contracts";
import {
  generateWeeklyLessonDayPipeline,
  prepareWeeklyLessonRetryState,
  validateWeeklyLessonCrossLevelSet,
  WEEKLY_LESSON_PIPELINE_VERSION,
  type WeeklyLessonPipelineCheckpoint
} from "../src/modules/content/weekly-generation.js";

try {
  loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // Explicit process environment remains authoritative.
}

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--") && value) args.set(key.slice(2), value);
}
const level = args.get("level");
const inputPath = args.get("input");
const outputRoot = args.get("output-root");
const fromDay = Number(args.get("from-day") ?? "1");
if (!level || !outputRoot) {
  throw new Error("Usage: --level A1 --output-root <directory> [--input <week-json>] [--from-day 1]");
}
if (!process.env.ANTHROPIC_API_KEY || process.env.AI_PROVIDER !== "anthropic") {
  throw new Error("ANTHROPIC_AI_NOT_CONFIGURED");
}

const week = inputPath
  ? JSON.parse(await readFile(resolve(inputPath), "utf8")) as ContentWeekInput
  : await reconstructWeekInput(resolve(outputRoot));
const plan = week.plan?.[level as keyof NonNullable<ContentWeekInput["plan"]>];
if (!plan || plan.length !== 5) throw new Error(`CONTENT_WEEK_PLAN_REQUIRED:${level}`);
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

const componentFile: Record<WeeklyLessonPipelineCheckpoint["component"], string> = {
  grammarClassification: "01-grammar-classification.json",
  objectives: "02-objectives.json",
  foundation: "03-foundation.json",
  vocabulary: "04-vocabulary.json",
  "skills.comprehension": "05-comprehension.json",
  "skills.languagePractice": "06-language-practice.json",
  "skills.speaking": "07-speaking.json",
  "skills.reviewer": "08-reviewer.json",
  assemble: "09-assemble.json"
};
const generatedLessons: unknown[] = [];
const dayFailures: unknown[] = [];
const usedVocabulary = new Set<string>();
const rememberLessonVocabulary = (lesson: unknown) => {
  if (!lesson || typeof lesson !== "object") return;
  const parts = (lesson as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return;
  const vocabulary = parts.find((part) => part && typeof part === "object" && (part as { code?: unknown }).code === "vocabulary") as { content?: { items?: unknown[] } } | undefined;
  for (const item of vocabulary?.content?.items ?? []) {
    const word = typeof item === "string" ? item : item && typeof item === "object" && "word" in item ? String(item.word) : "";
    if (word.trim()) usedVocabulary.add(word.trim().toLocaleLowerCase("en-US"));
  }
};
// CEFR levels are independent batch lanes. Sharing the same weekly vocabulary
// across levels is valid; the internal language complexity is what differs.
// Do not serialize A2-C1 behind A1 or import another level's vocabulary as a
// ban list. Cross-level duplication is validated only after all five lanes end.
for (let priorDay = 1; priorDay < fromDay; priorDay += 1) {
  try {
    const stored = JSON.parse(await readFile(resolve(outputRoot, level, `day${priorDay}`, "09-assemble.json"), "utf8")) as {
      output?: unknown;
      state?: { lesson?: unknown };
    };
    const raw = stored.output ?? stored.state?.lesson;
    const lesson = raw && typeof raw === "object" && "lesson" in raw ? (raw as { lesson: unknown }).lesson : raw;
    if (lesson) {
      generatedLessons.push(lesson);
      rememberLessonVocabulary(lesson);
    }
  } catch {
    throw new Error(`PRIOR_DAY_CHECKPOINT_REQUIRED:${level}:day${priorDay}`);
  }
}
for (let dayNumber = fromDay; dayNumber <= 5; dayNumber += 1) {
  const dayDirectory = resolve(outputRoot, level, `day${dayNumber}`);
  await mkdir(dayDirectory, { recursive: true });
  const input = {
    weekNumber: week.weekNumber,
    topic: week.topic,
    description: week.description,
    objectives: week.objectives,
    keyVocabHint: week.keyVocabHint,
    cefr: level,
    dayNumber,
    lessonFocus: plan[dayNumber - 1]!,
    allLessonFocuses: plan
  };
  await writeFile(resolve(dayDirectory, "input.json"), `${JSON.stringify(input, null, 2)}\n`, "utf8");
  let resumeState: WeeklyLessonPipelineCheckpoint["state"] | undefined;
  let resumedFrom: WeeklyLessonPipelineCheckpoint["component"] | undefined;
  const resumeCandidates: Array<{
    component: WeeklyLessonPipelineCheckpoint["component"];
    state: WeeklyLessonPipelineCheckpoint["state"];
    savedAt: number;
  }> = [];
  for (const [component, filename] of Object.entries(componentFile) as Array<[WeeklyLessonPipelineCheckpoint["component"], string]>) {
    try {
      const stored = JSON.parse(await readFile(resolve(dayDirectory, filename), "utf8")) as WeeklyLessonPipelineCheckpoint & {
        status?: string;
        pipelineVersion?: string;
        savedAt?: string;
        input?: { cefr?: string; dayNumber?: number; lessonFocus?: string };
      };
      if (stored.status === "validated"
        && stored.pipelineVersion === WEEKLY_LESSON_PIPELINE_VERSION
        && stored.input?.cefr === level
        && stored.input.dayNumber === dayNumber
        && stored.input.lessonFocus === input.lessonFocus) {
        resumeCandidates.push({
          component,
          state: stored.state,
          savedAt: stored.savedAt ? Date.parse(stored.savedAt) : 0
        });
      }
    } catch {
      // Ignore missing or invalid checkpoint files.
    }
  }
  const latestResume = resumeCandidates.sort((left, right) => right.savedAt - left.savedAt)[0];
  if (latestResume) {
    resumeState = prepareWeeklyLessonRetryState(latestResume.state);
    resumedFrom = latestResume.component;
  }
  process.stdout.write(`${JSON.stringify({ level, dayNumber, status: "started" })}\n`);
  if (resumedFrom) process.stdout.write(`${JSON.stringify({ level, dayNumber, status: "resumed", component: resumedFrom })}\n`);
  try {
    const generated = await generateWeeklyLessonDayPipeline(input, "Generate one complete CEFR-appropriate lesson component from the approved weekly plan.", runner, {
      excludedVocabulary: [...usedVocabulary],
      qualityProfile: "strict",
      ...(resumeState ? { resumeState } : {}),
      onProgress: (event) => process.stdout.write(`${JSON.stringify({ level, ...event })}\n`),
      onCheckpoint: async (checkpoint) => {
        const payload = { status: "validated", pipelineVersion: WEEKLY_LESSON_PIPELINE_VERSION, savedAt: new Date().toISOString(), input, ...checkpoint };
        await writeFile(resolve(dayDirectory, componentFile[checkpoint.component]), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      }
    });
    generatedLessons.push(generated.lesson);
    await rm(resolve(dayDirectory, "failure.json"), { force: true });
    rememberLessonVocabulary(generated.lesson);
    const vocabulary = generated.checkpoints.findLast((checkpoint) => checkpoint.component === "vocabulary")?.output as {
      word1?: { word?: string }; word2?: { word?: string }; word3?: { word?: string };
    } | undefined;
    for (const word of [vocabulary?.word1?.word, vocabulary?.word2?.word, vocabulary?.word3?.word]) {
      if (word?.trim()) usedVocabulary.add(word.trim().toLocaleLowerCase("en-US"));
    }
    process.stdout.write(`${JSON.stringify({ level, dayNumber, status: "completed" })}\n`);
  } catch (error) {
    const candidate = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; issues?: unknown; details?: unknown } : {};
    const failure = {
      level,
      dayNumber,
      status: "failed",
      failedAt: new Date().toISOString(),
      error: {
        code: typeof candidate.code === "string" ? candidate.code : "AI_COMPONENT_FAILED",
        message: typeof candidate.message === "string" ? candidate.message : "AI component failed",
        issues: Array.isArray(candidate.issues) ? candidate.issues : [],
        details: candidate.details ?? {}
      }
    };
    await writeFile(resolve(dayDirectory, "failure.json"), `${JSON.stringify(failure, null, 2)}\n`, "utf8");
    process.stderr.write(`${JSON.stringify(failure)}\n`);
    dayFailures.push(failure);
  }
}
await writeFile(resolve(outputRoot, level, "level-result.json"), `${JSON.stringify({
  level,
  lessons: generatedLessons,
  failures: dayFailures
}, null, 2)}\n`, "utf8");
if (dayFailures.length > 0) process.exitCode = 2;

const allLevels = ["A1", "A2", "B1", "B2", "C1"];
const lessonsByLevel: Record<string, unknown[]> = {};
for (const candidate of allLevels) {
  try {
    const stored = JSON.parse(await readFile(resolve(outputRoot, candidate, "level-result.json"), "utf8")) as { lessons?: unknown[] };
    if (stored.lessons) lessonsByLevel[candidate] = stored.lessons;
  } catch {
    // Cross-level validation starts automatically once every level result exists.
  }
}
if (Object.keys(lessonsByLevel).length === allLevels.length) {
  const validation = validateWeeklyLessonCrossLevelSet(lessonsByLevel as never);
  await writeFile(resolve(outputRoot, "cross-level-validation.json"), `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  if (!validation.valid) process.exitCode = 2;
}

async function reconstructWeekInput(root: string): Promise<ContentWeekInput> {
  const levelInputs = await Promise.all(["A1", "A2", "B1", "B2", "C1"].map(async (cefr) => {
    const input = JSON.parse(await readFile(resolve(root, cefr, "day1", "input.json"), "utf8")) as {
      weekNumber: number; topic: string; description: string; objectives: string; keyVocabHint: string;
      allLessonFocuses: string[];
    };
    return [cefr, input] as const;
  }));
  const first = levelInputs[0]![1];
  return {
    weekNumber: first.weekNumber,
    topic: first.topic,
    description: first.description,
    objectives: first.objectives,
    keyVocabHint: first.keyVocabHint,
    plan: Object.fromEntries(levelInputs.map(([cefr, input]) => [cefr, input.allLessonFocuses]))
  };
}
