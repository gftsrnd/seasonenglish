import { monthlyScopeHash, type CoreTerm, type GrammarStep, type MonthlyCurriculumContract, type MonthlyDaySpec, type PronunciationSound } from "@e4s/domain";
import type { AiTaskRunner } from "@e4s/ai";
import { evaluateMonthlyLessonQuality, type MonthlyLessonCandidate, type MonthlyQualityReport } from "./monthly-quality.js";

export const MONTHLY_DAY_COMPONENTS = [
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
] as const;
export type MonthlyDayComponent = (typeof MONTHLY_DAY_COMPONENTS)[number];

export async function generateMonthlyDayWithAi(contract: MonthlyCurriculumContract, dayNumber: number, runner: AiTaskRunner, systemPrompt: string): Promise<MonthlyDayGenerationResult> {
  const generated = await generateMonthlyDay({
    contract,
    dayNumber,
    maxAttempts: 3,
    generate: async ({ daySpec, coreTerms, grammarStep, grammarSteps, sound, components, priorParts }) => {
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
            theme: contract.theme,
            supportTerms: contract.supportTerms.filter((term) => term.dayNumber === dayNumber)
          },
          priorParts
        }, {
          systemPrompt,
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
  generate: (input: MonthlyDayGenerationInput) => Promise<MonthlyLessonCandidate>;
  maxAttempts?: number;
}): Promise<MonthlyDayGenerationResult> {
  const daySpec = input.contract.daySpecs.find((day) => day.lessonNumber === input.dayNumber);
  if (!daySpec) throw new Error(`Monthly DaySpec ${input.dayNumber} was not found`);
  const grammarSteps = (daySpec.grammarStepIds ?? [daySpec.grammarStepId]).map((id) => input.contract.grammarTopics.flatMap((topic) => topic.steps).find((step) => step.id === id)).filter((step): step is GrammarStep => Boolean(step));
  const grammarStep = grammarSteps[0];
  const sound = input.contract.sounds.find((candidate) => candidate.id === daySpec.soundId);
  if (!grammarStep || grammarSteps.length !== (daySpec.grammarStepIds?.length ?? 1) || !sound) throw new Error(`Monthly DaySpec ${input.dayNumber} has unresolved grammar or pronunciation scope`);
  const coreTerms = (daySpec.kind === "new" ? daySpec.coreTermIds : daySpec.reviewTermIds).map((id) => input.contract.coreTerms.find((term) => term.id === id)).filter((term): term is CoreTerm => Boolean(term));
  const maxAttempts = input.maxAttempts ?? 3;
  const scopeHash = monthlyScopeHash(input.contract);
  let parts: MonthlyLessonCandidate["parts"] = [];
  let title = "";
  let requestedComponents: MonthlyDayComponent[] = [...MONTHLY_DAY_COMPONENTS];
  let report: MonthlyQualityReport = { severe: [], light: [], contractVersion: input.contract.version };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const generated = await input.generate({ contract: input.contract, dayNumber: input.dayNumber, components: requestedComponents, daySpec, coreTerms, grammarStep, grammarSteps, sound, priorParts: parts });
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
