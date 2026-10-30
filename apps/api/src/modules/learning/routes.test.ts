import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { LearnerLessonRecord } from "@e4s/database";
import {
  buildMicroLessonSystemPrompt,
  calculateInactiveDays,
  learnerLessonDisplayTitle,
  learnerLessonView,
  registerLearningRoutes,
  resolveExplanationLanguage
} from "./routes.js";

describe("calculateInactiveDays", () => {
  it("does not count inactive days from before the learner program started", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T12:00:00.000Z"));
    try {
      expect(calculateInactiveDays(["2026-10-07T09:00:00.000Z"], "2026-10-13")).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

function lesson(title: string, example: string): LearnerLessonRecord {
  return {
    id: "lesson-1",
    title,
    dayNumber: 1,
    weekNumber: 1,
    weekTopic: "Introducing yourself & your job",
    cefr: "A1",
    content: {
      parts: [{ code: "grammar", title: "Ngữ pháp", content: { formula: title, examples: [example] } }]
    },
    progress: { status: "not_started", completedPartCodes: [], evidence: {} },
    lock: null
  } as LearnerLessonRecord;
}

function lessonWithoutGrammar(title: string): LearnerLessonRecord {
  return {
    id: "lesson-no-grammar",
    title,
    dayNumber: 1,
    weekNumber: 1,
    weekTopic: "Reporting a safety incident",
    cefr: "A1",
    content: {
      parts: [
        { code: "objective", title: "Mục tiêu", content: { items: [{ type: "content", text: "Nói về một sự cố." }] } },
        { code: "grammar", title: "Ngữ pháp", content: { status: "unavailable", hidden: true } }
      ]
    },
    progress: { status: "not_started", completedPartCodes: [], evidence: {} },
    lock: null
  } as LearnerLessonRecord;
}

describe("learnerLessonDisplayTitle", () => {
  it("replaces a persisted generic grammar placeholder with the lesson's concrete example", () => {
    expect(learnerLessonDisplayTitle(lesson("S + V + O", "I check the report."))).toBe("I check the report");
  });

  it("keeps only the English sentence when a generic title falls back to a bilingual example", () => {
    expect(learnerLessonDisplayTitle(lesson("S + V + O", "Maybe you could add a chart to the report. (Có lẽ bạn có thể thêm biểu đồ.)"))).toBe(
      "Maybe you could add a chart to the report"
    );
  });

  it("keeps an already specific sentence frame", () => {
    expect(learnerLessonDisplayTitle(lesson("It is + adjective", "It is good."))).toBe("It is + adjective");
  });

  it("uses the content topic instead of a grammar-shaped title when grammar is unavailable", () => {
    expect(learnerLessonDisplayTitle(lessonWithoutGrammar("Say what happened: 'A man fell down'"))).toBe(
      "Reporting a safety incident"
    );
  });
});

describe("learnerLessonView pronunciation assets", () => {
  it("keeps IPA text but does not backfill target-phoneme audio", () => {
    const olderLesson = {
      ...lesson("I have attached the receipt", "I have attached the receipt."),
      cefr: "B1",
      content: {
        parts: [{
          code: "pronunciation",
          title: "Pronunciation",
          content: {
            focus: "/ɪ/",
            words: [
              { word: "business", ipa: "/ˈbɪznəs/" },
              { word: "if", ipa: "/ɪf/" },
              { word: "receipt", ipa: "/rɪˈsiːt/" }
            ]
          }
        }]
      }
    } as LearnerLessonRecord;

    const view = learnerLessonView(olderLesson);
    const pronunciation = view.content.parts.find((part) => part.code === "pronunciation")?.content;

    expect(pronunciation).toMatchObject({ focus: "/ɪ/" });
    expect(pronunciation).not.toHaveProperty("phonemeAudioId");
    expect(pronunciation).not.toHaveProperty("phonemeAudioUrl");
  });

  it("removes legacy target-phoneme fields while preserving pronunciation words", () => {
    const olderLesson = {
      ...lesson("I have attached the receipt", "I have attached the receipt."),
      content: {
        parts: [{
          code: "pronunciation",
          title: "Pronunciation",
          content: { focus: "/aɪ/", words: ["I", "nice", "time"], phonemeAudioId: "legacy", phonemeAudioUrl: "/media/audio/phonemes/ai.ogg" }
        }]
      }
    } as LearnerLessonRecord;

    const view = learnerLessonView(olderLesson);
    const pronunciation = view.content.parts.find((part) => part.code === "pronunciation")?.content;

    expect(pronunciation).toMatchObject({ focus: "/aɪ/", words: ["I", "nice", "time"] });
    expect(pronunciation).not.toHaveProperty("phonemeAudioId");
    expect(pronunciation).not.toHaveProperty("phonemeAudioUrl");
  });

  it("does not substitute a different phoneme for an unregistered composite focus", () => {
    const compositeLesson = {
      ...lesson("I work in AI", "I work in AI."),
      content: {
        parts: [{
          code: "pronunciation",
          title: "Pronunciation",
          content: { focus: "/wɜː/", words: ["work", "worker", "working"] }
        }]
      }
    } as LearnerLessonRecord;

    const view = learnerLessonView(compositeLesson);
    const pronunciation = view.content.parts.find((part) => part.code === "pronunciation")?.content;

    expect(pronunciation).not.toHaveProperty("phonemeAudioUrl");
  });
});

describe("micro-lesson generation language policy", () => {
  it("resolves auto or undefined explanationLanguage deterministically from CEFR", () => {
    expect(resolveExplanationLanguage("A1", "auto")).toBe("vi");
    expect(resolveExplanationLanguage("A2", undefined)).toBe("vi");
    expect(resolveExplanationLanguage("B1", "auto")).toBe("en");
    expect(resolveExplanationLanguage("B2", undefined)).toBe("en");
    expect(resolveExplanationLanguage("C1", "auto")).toBe("en");
    expect(resolveExplanationLanguage("B2", "vi")).toBe("vi");
    expect(resolveExplanationLanguage("A1", "en")).toBe("en");
  });

  it("appends explicit CEFR language policy instructions to the micro-lesson systemPrompt", () => {
    const a2Prompt = buildMicroLessonSystemPrompt("Base micro prompt.", "A2", "vi");
    expect(a2Prompt).toContain("Base micro prompt.");
    expect(a2Prompt).toContain("A1-A2 must use Vietnamese explanations/instructions");
    expect(a2Prompt).toContain("B1-C1 must use English-only explanations/instructions except Vietnamese vocabulary meanings");
    expect(a2Prompt).toContain("Active CEFR A2 (explanationLanguage=vi)");

    const b2Prompt = buildMicroLessonSystemPrompt("Base micro prompt.", "B2", "en");
    expect(b2Prompt).toContain("Active CEFR B2 (explanationLanguage=en): Use English-only explanations and instructions, except Vietnamese vocabulary meanings.");
  });

  it("passes resolved explanationLanguage and CEFR language policy systemPrompt to micro_lesson_generation", async () => {
    const handlers = new Map<string, (request: unknown, reply: unknown) => Promise<unknown>>();
    const app = {
      get: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      post: vi.fn((path: string, _opts: unknown, handler: (request: unknown, reply: unknown) => Promise<unknown>) => {
        handlers.set(path, handler);
      })
    } as unknown as FastifyInstance;

    let currentCefr = "A2";
    let currentExplanationLanguage: "auto" | "vi" | "en" | undefined = "auto";
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from learner_profiles lp")) {
          return {
            rows: [{
              profile: {
                goals: ["Write clear updates"],
                position: "QA Engineer",
                department: "Engineering",
                environmentUse: "Daily standups",
                learningStyles: ["examples"],
                explanationLanguage: currentExplanationLanguage,
                durationMinutes: 10
              },
              draft_profile: null,
              display_name: "Learner",
              email: "learner@e4s.local",
              version: 1,
              completed_at: new Date(),
              updated_at: new Date()
            }]
          };
        }
        if (sql.includes("from enrollments e")) {
          return {
            rows: [{
              program_id: "00000000-0000-4000-8000-000000000201",
              program_name: "Season English",
              cycle_number: "1",
              start_date: "2026-10-01",
              week_count: 12,
              week_id: "00000000-0000-4000-8000-000000000301",
              week_number: 1,
              topic: "Giving project updates",
              description: "Share concise status updates.",
              objectives: ["Give a status update"],
              cefr: currentCefr
            }]
          };
        }
        if (sql.includes("join ai_tasks at")) {
          return {
            rows: [{
              task_id: "00000000-0000-4000-8000-000000001009",
              prompt_version_id: "00000000-0000-4000-8000-000000002009",
              prompt: "Canonical micro lesson prompt."
            }]
          };
        }
        if (sql.includes("from micro_lessons where id = $1")) {
          return {
            rows: [{
              id: "00000000-0000-4000-8000-000000000841",
              topic: "Project status",
              cefr: currentCefr,
              content: {
                durationMinutes: 10,
                theory: "Use 'I am working on...' to share your current task clearly.",
                vocabulary: ["status", "blocker", "milestone"],
                practice: {
                  prompt: "Write a short status update.",
                  type: "write",
                  answer: "I am working on the release checklist."
                }
              },
              progress: {},
              completed_at: null
            }]
          };
        }
        return { rowCount: 1, rows: [] };
      }),
      connect: vi.fn(async () => ({
        query: vi.fn(async () => ({ rowCount: 1, rows: [] })),
        release: vi.fn()
      }))
    } as unknown as Pool;

    const runTask = vi.fn(async () => ({
      output: {
        topic: "Project status",
        durationMinutes: 10 as const,
        theory: "Use 'I am working on...' to share your current task clearly.",
        vocabulary: ["status", "blocker", "milestone"],
        practice: {
          prompt: "Write a short status update.",
          type: "write" as const,
          answer: "I am working on the release checklist."
        }
      },
      metadata: {
        traceId: "trace-micro-1",
        taskId: "micro_lesson_generation",
        provider: "fixture",
        model: "fixture-model",
        attempts: 1,
        latencyMs: 5,
        inputHash: "a".repeat(64),
        schemaValid: true as const,
        usage: {}
      }
    }));

    registerLearningRoutes(app, pool, { runTask });
    const handler = handlers.get("/api/v1/micro-lessons");
    expect(handler).toBeTypeOf("function");

    const makeReply = () => {
      const reply = {
        statusCode: 200,
        payload: undefined as unknown,
        code(status: number) {
          this.statusCode = status;
          return this;
        },
        send(payload: unknown) {
          this.payload = payload;
          return payload;
        }
      };
      return reply;
    };

    const replyA2 = makeReply();
    await handler!(
      {
        body: { requestId: "10000000-0000-4000-8000-000000000001", regenerate: true },
        e4sSession: { user: { id: "00000000-0000-4000-8000-000000000101", role: "learner" } },
        log: { warn: vi.fn() }
      },
      replyA2
    );

    expect(replyA2.statusCode).toBe(201);
    expect(runTask).toHaveBeenCalledWith(
      "micro_lesson_generation",
      expect.objectContaining({
        cefr: "A2",
        explanationLanguage: "vi"
      }),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("A1-A2 must use Vietnamese explanations/instructions")
      })
    );

    currentCefr = "B2";
    currentExplanationLanguage = undefined;
    const replyB2 = makeReply();
    await handler!(
      {
        body: { requestId: "10000000-0000-4000-8000-000000000002", regenerate: true },
        e4sSession: { user: { id: "00000000-0000-4000-8000-000000000101", role: "learner" } },
        log: { warn: vi.fn() }
      },
      replyB2
    );

    expect(replyB2.statusCode).toBe(201);
    expect(runTask).toHaveBeenLastCalledWith(
      "micro_lesson_generation",
      expect.objectContaining({
        cefr: "B2",
        explanationLanguage: "en"
      }),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("B1-C1 must use English-only explanations/instructions except Vietnamese vocabulary meanings")
      })
    );
  });
});
