import { randomUUID } from "node:crypto";
import { MONTH_FRAMEWORK_PROMPT, MONTH_FRAMEWORK_TASK_KEY, monthFrameworkOutputJsonSchema, monthFrameworkOutputSchema } from "@e4s/ai";
import type { MonthlyContentRepository } from "@e4s/database";
import { buildMonthlyCalendar, buildMonthlyExamBlueprint, buildSampleFramework, validateMonthFramework, type MonthFramework } from "@e4s/domain";
import type { WorkerAiProvider } from "./handlers.js";
import type { JobHandler } from "./worker.js";

/**
 * Job nền cho cơ chế tháng. Giữ graceful degradation: không có AI (hoặc AI lỗi) thì dùng khung mẫu
 * cố định theo level, ghi rõ source = 'sample' để Vận hành biết.
 */
export function createMonthlyHandlers(input: { monthly: MonthlyContentRepository; ai?: WorkerAiProvider }): Record<string, JobHandler> {
  return {
    "monthly.framework.generate": async (job) => {
      const { frameworkId } = payloadOf(job.payload);
      const framework = await input.monthly.frameworkById(frameworkId);
      if (!framework) return;
      const organization = await input.monthly.organizationFor(await actorFor(input.monthly, frameworkId, job.payload));
      const settings = organization?.settings ?? { vocabularyCount: 60, grammarTopicCount: 3, soundCount: 4, examDurationMinutes: 60 };
      const calendar = buildMonthlyCalendar(framework.month);
      try {
        const generated = input.ai
          ? await generateWithAi(input.ai, input.monthly, framework, settings, calendar.lessonCount)
          : null;
        if (generated) {
          await input.monthly.storeGeneratedFramework(frameworkId, generated, "ai");
          return;
        }
        const sample = buildSampleFramework(framework.cefr, settings);
        const errors = validateMonthFramework(sample, settings, calendar.lessonCount);
        if (errors.length) throw new Error(errors.join(" "));
        await input.monthly.storeGeneratedFramework(frameworkId, sample, "sample");
      } catch (error) {
        await input.monthly.failFrameworkGeneration(frameworkId, error instanceof Error ? error.message : String(error));
        throw error;
      }
    },
    "monthly.lessons.distribute": async (job) => {
      const { frameworkId, actorId } = payloadOf(job.payload);
      await input.monthly.distributeLessons(frameworkId, actorId ?? null);
    },
    "monthly.exam.generate": async (job) => {
      const { frameworkId } = payloadOf(job.payload);
      const framework = await input.monthly.frameworkById(frameworkId);
      if (!framework) return;
      try {
        const organization = await input.monthly.organizationFor(await actorFor(input.monthly, frameworkId, job.payload));
        const calendar = buildMonthlyCalendar(framework.month);
        const blueprint = buildMonthlyExamBlueprint({
          framework: { cefr: framework.cefr, vocabulary: framework.vocabulary, grammarTopics: framework.grammarTopics, sounds: framework.sounds },
          month: framework.month,
          examDate: calendar.examDate,
          durationMinutes: organization?.settings.examDurationMinutes ?? 60,
          lessonCount: calendar.lessonCount
        });
        await input.monthly.storeGeneratedExam(frameworkId, blueprint as unknown as Record<string, unknown> & { title: string });
      } catch (error) {
        await input.monthly.failExamGeneration(frameworkId, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
  };
}

async function generateWithAi(
  ai: WorkerAiProvider,
  monthly: MonthlyContentRepository,
  framework: NonNullable<Awaited<ReturnType<MonthlyContentRepository["frameworkById"]>>>,
  settings: { vocabularyCount: number; grammarTopicCount: number; soundCount: number },
  lessonCount: number
): Promise<MonthFramework | null> {
  const prompt = (await monthly.activePrompt(framework.organizationId, MONTH_FRAMEWORK_TASK_KEY)) ?? MONTH_FRAMEWORK_PROMPT;
  const excludedVocabulary = (await monthly.usedFrameworkVocabulary(framework.organizationId, framework.id)).slice(0, 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const raw = await ai.complete({
      taskId: MONTH_FRAMEWORK_TASK_KEY,
      systemPrompt: prompt,
      input: {
        cefr: framework.cefr, month: framework.month, lessonCount,
        vocabularyCount: settings.vocabularyCount, grammarTopicCount: settings.grammarTopicCount, soundCount: settings.soundCount,
        examplesPerSound: Math.ceil(lessonCount / settings.soundCount) * 3,
        excludedVocabulary, theme: "Tiếng Anh giao tiếp công sở"
      },
      outputJsonSchema: monthFrameworkOutputJsonSchema as unknown as Record<string, unknown>,
      signal: controller.signal,
      traceId: randomUUID()
    });
    const parsed = monthFrameworkOutputSchema.safeParse(raw);
    if (!parsed.success) return null;
    const candidate: MonthFramework = { cefr: framework.cefr, ...parsed.data };
    return validateMonthFramework(candidate, settings, lessonCount).length === 0 ? candidate : null;
  } catch {
    // AI lỗi → rơi về khung mẫu (graceful degradation).
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function actorFor(_monthly: MonthlyContentRepository, _frameworkId: string, payload: unknown): Promise<string> {
  return payloadOf(payload).actorId ?? "";
}

function payloadOf(payload: unknown): { frameworkId: string; actorId?: string } {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const frameworkId = typeof record.frameworkId === "string" ? record.frameworkId : "";
  if (!frameworkId) throw new Error("MONTHLY_JOB_PAYLOAD_INVALID");
  return { frameworkId, ...(typeof record.actorId === "string" ? { actorId: record.actorId } : {}) };
}
