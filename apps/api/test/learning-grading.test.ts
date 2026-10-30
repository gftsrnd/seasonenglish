import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import {
  buildMicroGradingSystemPrompt,
  gradeMicroAttempt,
  registerLearningRoutes,
  resolveExplanationLanguage
} from "../src/modules/learning/routes.js";

describe("micro lesson grading policy", () => {
  it("rejects a one-word self-writing answer before AI grading", () => {
    expect(gradeMicroAttempt({ type: "write", answer: "Okay", expected: "I confirm the meeting.", aiAvailable: true }))
      .toEqual({ status: "invalid", correct: false, reason: "minimum_two_words" });
  });

  it("normalizes punctuation for closed answers and queues open answers when AI is unavailable", () => {
    expect(gradeMicroAttempt({ type: "fill", answer: "  YES, please! ", expected: "Yes please", aiAvailable: false }))
      .toEqual({ status: "correct", correct: true });
    expect(gradeMicroAttempt({ type: "write", answer: "I can join Friday.", expected: "I can join on Friday.", aiAvailable: false }))
      .toEqual({ status: "manual_review", correct: null });
  });

  it("appends TESOL grading instructions and resolved explanationLanguage to the micro grading systemPrompt", () => {
    const a1Lang = resolveExplanationLanguage("A1", "auto");
    expect(a1Lang).toBe("vi");
    const a1Prompt = buildMicroGradingSystemPrompt("Base grading prompt.", "A1", a1Lang);
    expect(a1Prompt).toContain("Base grading prompt.");
    expect(a1Prompt).toContain("explanationLanguage=vi");
    expect(a1Prompt).toContain("Accept alternative grammatical answers that fit the taught pattern and context");
    expect(a1Prompt).toContain("Distinguish target-language errors from minor non-target slips");
    expect(a1Prompt).toContain("Ignore minor capitalization, punctuation, and ASR filler noise");

    const b1Lang = resolveExplanationLanguage("B1", "auto");
    expect(b1Lang).toBe("en");
    const b1Prompt = buildMicroGradingSystemPrompt("Base grading prompt.", "B1", b1Lang);
    expect(b1Prompt).toContain("explanationLanguage=en");
  });

  it("passes resolved explanationLanguage and TESOL grading systemPrompt to runner.runTask('micro_grading')", async () => {
    const handlers = new Map<string, (request: unknown, reply: unknown) => Promise<unknown>>();
    const app = {
      get: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      post: vi.fn((path: string, handleOrOpts: unknown, maybeHandler?: unknown) => {
        const handler = (typeof handleOrOpts === "function" ? handleOrOpts : maybeHandler) as (
          request: unknown,
          reply: unknown
        ) => Promise<unknown>;
        handlers.set(path, handler);
      })
    } as unknown as FastifyInstance;

    let currentCefr = "A2";
    let currentExplanationLanguage: "auto" | "vi" | "en" | undefined = "auto";
    const microLessonId = "00000000-0000-4000-8000-000000000841";

    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("select cefr, content from micro_lessons")) {
          return {
            rows: [{
              cefr: currentCefr,
              content: {
                theory: "Use 'Could we reschedule to...' to propose a new meeting time.",
                vocabulary: ["reschedule", "meeting", "available"],
                practice: {
                  prompt: "Write a polite sentence to move the meeting to 3 PM.",
                  type: "write",
                  answer: "Could we reschedule the meeting to 3 PM?"
                }
              }
            }]
          };
        }
        if (sql.includes("from learner_profiles lp")) {
          return {
            rows: [{
              profile: { explanationLanguage: currentExplanationLanguage },
              draft_profile: null,
              display_name: "Learner",
              email: "learner@e4s.local",
              version: 1,
              completed_at: new Date(),
              updated_at: new Date()
            }]
          };
        }
        if (sql.includes("join ai_tasks at")) {
          return {
            rows: [{
              task_id: "00000000-0000-4000-8000-000000001005",
              prompt_version_id: "00000000-0000-4000-8000-000000002005",
              prompt: "Canonical micro grading prompt."
            }]
          };
        }
        if (sql.includes("from micro_lessons where id = $1")) {
          return {
            rows: [{
              id: microLessonId,
              topic: "Rescheduling meetings",
              cefr: currentCefr,
              content: {
                durationMinutes: 5,
                theory: "Use 'Could we reschedule to...' to propose a new meeting time.",
                vocabulary: ["reschedule", "meeting", "available"],
                practice: {
                  prompt: "Write a polite sentence to move the meeting to 3 PM.",
                  type: "write",
                  answer: "Could we reschedule the meeting to 3 PM?"
                }
              },
              progress: {
                attempt: { answer: "Could we reschedule to 3 PM?", attempts: 1, correct: true, score: 10 },
                feedback: { status: "ready", message: "Good job." }
              },
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
        correct: true,
        score: 10,
        feedback: "Bạn đã dùng đúng mẫu câu lịch sự.",
        citedError: null
      },
      metadata: {
        traceId: "trace-grade-1",
        taskId: "micro_grading",
        provider: "fixture",
        model: "fixture-model",
        attempts: 1,
        latencyMs: 5,
        inputHash: "b".repeat(64),
        schemaValid: true as const,
        usage: {}
      }
    }));

    registerLearningRoutes(app, pool, { runTask });
    const handler = handlers.get("/api/v1/micro-lessons/:microLessonId/attempts");
    expect(handler).toBeTypeOf("function");

    const reply = {
      statusCode: 200,
      code(status: number) {
        this.statusCode = status;
        return this;
      },
      send(payload: unknown) {
        return payload;
      }
    };

    await handler!(
      {
        params: { microLessonId },
        body: { answer: "Could we reschedule to 3 PM?" },
        e4sSession: { user: { id: "00000000-0000-4000-8000-000000000101", role: "learner" } },
        log: { warn: vi.fn() }
      },
      reply
    );

    expect(runTask).toHaveBeenCalledWith(
      "micro_grading",
      expect.objectContaining({
        cefr: "A2",
        explanationLanguage: "vi",
        learnerAnswer: "Could we reschedule to 3 PM?"
      }),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("Accept alternative grammatical answers that fit the taught pattern and context")
      })
    );

    currentCefr = "B1";
    currentExplanationLanguage = "auto";
    await handler!(
      {
        params: { microLessonId },
        body: { answer: "Could we reschedule to 3 PM?" },
        e4sSession: { user: { id: "00000000-0000-4000-8000-000000000101", role: "learner" } },
        log: { warn: vi.fn() }
      },
      reply
    );

    expect(runTask).toHaveBeenLastCalledWith(
      "micro_grading",
      expect.objectContaining({
        cefr: "B1",
        explanationLanguage: "en",
        learnerAnswer: "Could we reschedule to 3 PM?"
      }),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("explanationLanguage=en")
      })
    );
  });
});
