import { randomUUID } from "node:crypto";
import { MONTH_FRAMEWORK_PROMPT, MONTH_FRAMEWORK_TASK_KEY, MONTHLY_EXAM_PROMPT, MONTHLY_EXAM_TASK_KEY, monthFrameworkOutputJsonSchema, monthFrameworkOutputSchema, monthlyExamOutputJsonSchema, monthlyExamOutputSchema } from "@e4s/ai";
import type { MonthlyContentRepository } from "@e4s/database";
import { applyAiMonthlyExamContent, buildMonthlyCalendar, buildMonthlyExamBlueprint, buildSampleFramework, validateMonthFramework, type MonthFramework, type MonthlyExamBlueprint } from "@e4s/domain";
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
      const settings = organization?.settings ?? { vocabularyCount: 60, grammarTopicCount: 3, soundCount: 4, examDurationMinutes: 30 };
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
        const monthFramework: MonthFramework = { cefr: framework.cefr, vocabulary: framework.vocabulary, grammarTopics: framework.grammarTopics, sounds: framework.sounds };
        const template = buildMonthlyExamBlueprint({
          framework: monthFramework,
          month: framework.month,
          examDate: calendar.examDate,
          durationMinutes: organization?.settings.examDurationMinutes ?? 30,
          lessonCount: calendar.lessonCount
        });
        // AI điền nội dung tự nhiên vào cấu hình đã khoá; không đạt kiểm tra GEN thì giữ bản template.
        const enriched = input.ai ? await generateExamWithAi(input.ai, input.monthly, framework.organizationId, monthFramework, template) : null;
        await input.monthly.storeGeneratedExam(frameworkId, (enriched ?? template) as unknown as Record<string, unknown> & { title: string });
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

async function generateExamWithAi(
  ai: WorkerAiProvider,
  monthly: MonthlyContentRepository,
  organizationId: string,
  framework: MonthFramework,
  template: MonthlyExamBlueprint
): Promise<MonthlyExamBlueprint | null> {
  const prompt = (await monthly.activePrompt(organizationId, MONTHLY_EXAM_TASK_KEY)) ?? MONTHLY_EXAM_PROMPT;
  const ids = framework.vocabulary.map((item, index) => ({ id: `V${String(index + 1).padStart(2, "0")}`, ...item }));
  const { listening, reading, writing, speaking } = template.config.allocation;
  const assignments = {
    listening: ids.slice(0, listening),
    reading: ids.slice(listening, listening + reading),
    writing: ids.slice(listening + reading, listening + reading + writing),
    speaking: ids.slice(listening + reading + writing, listening + reading + writing + speaking)
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const raw = await ai.complete({
      taskId: MONTHLY_EXAM_TASK_KEY,
      systemPrompt: prompt,
      input: {
        month: template.month, cefr: framework.cefr, examDate: template.examDate,
        config: template.config, assignments,
        grammarTopics: framework.grammarTopics,
        sounds: framework.sounds.map((sound) => ({ ipa: sound.ipa, label: sound.label, samples: sound.examples.slice(0, template.config.samplesPerSound) })),
        listeningBlocks: template.config.listeningBlocks
      },
      outputJsonSchema: monthlyExamOutputJsonSchema as unknown as Record<string, unknown>,
      signal: controller.signal,
      traceId: randomUUID()
    });
    const parsed = monthlyExamOutputSchema.safeParse(raw);
    if (!parsed.success) return null;
    return applyAiMonthlyExamContent(template, parsed.data, framework);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
