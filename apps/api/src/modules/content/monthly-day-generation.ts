import { monthlyScopeHash, type CoreTerm, type GrammarStep, type MonthlyCurriculumContract, type MonthlyDaySpec, type PronunciationSound } from "@e4s/domain";
import type { AiTaskRunner } from "@e4s/ai";
import { evaluateMonthlyLessonQuality, type MonthlyLessonCandidate, type MonthlyQualityReport } from "./monthly-quality.js";

export const MONTHLY_DAY_COMPONENTS = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
] as const;
export type MonthlyDayComponent = (typeof MONTHLY_DAY_COMPONENTS)[number];

export async function generateMonthlyDayWithAi(contract: MonthlyCurriculumContract, dayNumber: number, runner: AiTaskRunner, systemPrompt: string): Promise<MonthlyDayGenerationResult> {
  return generateMonthlyContentWithAi("new", contract, dayNumber, runner, systemPrompt);
}

/** Review generation has a separate entry point so ordinary-day callers cannot silently generate a review DaySpec. */
export async function generateMonthlyReviewWithAi(contract: MonthlyCurriculumContract, dayNumber: number, runner: AiTaskRunner, systemPrompt: string): Promise<MonthlyDayGenerationResult> {
  return generateMonthlyContentWithAi("review", contract, dayNumber, runner, systemPrompt);
}

async function generateMonthlyContentWithAi(kind: "new" | "review", contract: MonthlyCurriculumContract, dayNumber: number, runner: AiTaskRunner, systemPrompt: string): Promise<MonthlyDayGenerationResult> {
  const generated = await generateMonthlyDay({
    contract,
    dayNumber,
    kind,
    maxAttempts: 3,
    generate: async ({ daySpec, coreTerms, grammarStep, grammarSteps, sound, sounds, pronunciationExamples, components, priorParts }) => {
      const result = await runner.runTask("monthly_lesson_day", {
          month: contract.month,
          cefr: contract.cefr,
          daySpec,
          components,
          lockedScope: {
            coreTerms,
            grammarStep,
            grammarSteps,
            sound,
            sounds,
            pronunciationExamples,
            theme: contract.theme,
            supportTerms: contract.supportTerms.filter((term) => (daySpec.kind === "new" ? daySpec.expandedTermIds : daySpec.reviewExpandedTermIds).includes(term.id))
          },
          priorParts
        }, {
          systemPrompt: kind === "review" ? `${systemPrompt}\n\nReview pronunciation output contract: Keep pronunciation.focus equal to the first locked review sound IPA and pronunciation.words equal to exactly that sound's three locked examples, so it remains compatible with the standard lesson format. Also include pronunciation.reviewTargets as an array in lockedScope.sounds order; each item must have { soundId, focus, words }, and words must contain every locked pronunciation example for that sound with its exact word and IPA. Include every allocated review sound and example exactly once. Do not use the review calendar day's ordinary sound/examples.` : systemPrompt,
          maxOutputTokens: 8_000,
          temperature: 0.2,
          maxAttempts: 1
      });
      const lesson = (result.output as { lesson?: { title?: string; parts?: Array<{ code: string; title?: string; content: Record<string, unknown> }> } }).lesson;
      if (!lesson || !Array.isArray(lesson.parts)) throw new Error("Monthly lesson AI returned no lesson parts");
      return { title: lesson.title ?? "", parts: lesson.parts.map((part) => ({ code: part.code, ...(part.title ? { title: part.title } : {}), content: part.content })) };
    }
  });
  return generated;
}

export interface MonthlyDayGenerationInput {
  contract: MonthlyCurriculumContract;
  dayNumber: number;
  components: readonly MonthlyDayComponent[];
  daySpec: MonthlyDaySpec;
  coreTerms: readonly CoreTerm[];
  grammarStep: GrammarStep;
  grammarSteps: readonly GrammarStep[];
  sound: PronunciationSound;
  sounds: readonly PronunciationSound[];
  pronunciationExamples: readonly { id: string; word: string; ipa: string }[];
  priorParts: readonly MonthlyLessonCandidate["parts"][number][];
}

export interface MonthlyDayGenerationResult {
  status: "ready" | "failed";
  lesson: MonthlyLessonCandidate | null;
  report: MonthlyQualityReport;
  scopeHash: string;
  attempts: number;
}

export async function generateMonthlyDay(input: {
  contract: MonthlyCurriculumContract;
  dayNumber: number;
  /** Defaults to `new` for backwards-compatible ordinary generation. */
  kind?: "new" | "review";
  generate: (input: MonthlyDayGenerationInput) => Promise<MonthlyLessonCandidate>;
  maxAttempts?: number;
}): Promise<MonthlyDayGenerationResult> {
  const daySpec = input.contract.daySpecs.find((day) => day.lessonNumber === input.dayNumber);
  if (!daySpec) throw new Error(`Monthly DaySpec ${input.dayNumber} was not found`);
  const kind = input.kind ?? "new";
  if (daySpec.kind !== kind) throw new Error(kind === "new" ? "MONTHLY_DAY_KIND_MISMATCH: ordinary generation requires a new DaySpec" : "MONTHLY_DAY_KIND_MISMATCH: review generation requires a review DaySpec");
  const grammarIds = kind === "review" ? daySpec.reviewGrammarStepIds ?? [] : daySpec.grammarStepIds ?? [daySpec.grammarStepId];
  const soundIds = kind === "review" ? daySpec.reviewSoundIds ?? [] : [daySpec.soundId];
  const pronunciationExampleIds = kind === "review" ? daySpec.reviewPronunciationExampleIds ?? [] : daySpec.pronunciationExampleIds;
  const grammarSteps = grammarIds.map((id) => input.contract.grammarTopics.flatMap((topic) => topic.steps).find((step) => step.id === id)).filter((step): step is GrammarStep => Boolean(step));
  const grammarStep = grammarSteps[0];
  const sounds = soundIds.map((id) => input.contract.sounds.find((candidate) => candidate.id === id)).filter((sound): sound is PronunciationSound => Boolean(sound));
  const examplesById = new Map(sounds.flatMap((candidate) => candidate.examples.map((example) => [example.id, example] as const)));
  const pronunciationExamples = pronunciationExampleIds.map((id) => examplesById.get(id)).filter((example): example is NonNullable<typeof example> => Boolean(example));
  if (!grammarStep || grammarSteps.length !== grammarIds.length || !sounds.length || sounds.length !== soundIds.length || !pronunciationExampleIds.length || pronunciationExamples.length !== pronunciationExampleIds.length) {
    throw new Error(`Monthly DaySpec ${input.dayNumber} has unresolved grammar or pronunciation scope`);
  }
  const sound = sounds[0]!;
  const coreTerms = (daySpec.kind === "new" ? daySpec.coreTermIds : daySpec.reviewTermIds).map((id) => input.contract.coreTerms.find((term) => term.id === id)).filter((term): term is CoreTerm => Boolean(term));
  const maxAttempts = input.maxAttempts ?? 3;
  const scopeHash = monthlyScopeHash(input.contract);
  let parts: MonthlyLessonCandidate["parts"] = [];
  let title = "";
  let requestedComponents: MonthlyDayComponent[] = [...MONTHLY_DAY_COMPONENTS];
  let report: MonthlyQualityReport = { severe: [], light: [], contractVersion: input.contract.version };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const generated = await input.generate({ contract: input.contract, dayNumber: input.dayNumber, components: requestedComponents, daySpec, coreTerms, grammarStep, grammarSteps, sound, sounds, pronunciationExamples, priorParts: parts });
    title = generated.title || title;
    parts = mergeParts(parts, generated.parts);
    const candidate = { title, parts };
    report = evaluateMonthlyLessonQuality(input.contract, input.dayNumber, candidate);
    if (report.severe.length === 0) return { status: "ready", lesson: candidate, report, scopeHash, attempts: attempt };
    requestedComponents = componentsToRepair(report);
  }
  return { status: "failed", lesson: null, report, scopeHash, attempts: maxAttempts };
}

export function monthlyCheckpointKey(scopeHash: string, dayNumber: number, component: MonthlyDayComponent): string {
  return `monthly-lessons-checkpoint:${scopeHash}:day${dayNumber}:${component}`;
}

function mergeParts(
  prior: MonthlyLessonCandidate["parts"],
  generated: MonthlyLessonCandidate["parts"]
): MonthlyLessonCandidate["parts"] {
  const byCode = new Map(prior.map((part) => [part.code, part]));
  for (const part of generated) byCode.set(part.code, part);
  return MONTHLY_DAY_COMPONENTS.flatMap((code) => byCode.get(code) ?? []);
}

function componentsToRepair(report: MonthlyQualityReport): MonthlyDayComponent[] {
  const mapped = report.severe.map((finding) => finding.component).filter((component): component is MonthlyDayComponent => MONTHLY_DAY_COMPONENTS.includes(component as MonthlyDayComponent));
  return mapped.length ? [...new Set(mapped)] : [...MONTHLY_DAY_COMPONENTS];
}
