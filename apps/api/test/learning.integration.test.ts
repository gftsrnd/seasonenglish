import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("learner profile, home, lesson and progress API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let cookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2)",
        [DEMO_IDS.learner, await createCredentialHash("learner-pass")]
      );
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "learner@e4s.local", password: "learner-pass" }
    });
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("protects every learner endpoint with the server-derived learner role", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/learner/home" });
    expect(response.statusCode).toBe(401);
  });

  it("returns and version-updates the existing one-screen profile", async () => {
    const current = await app.inject({ method: "GET", url: "/api/v1/learner/profile", headers: { cookie } });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ completed: true, version: 1, profile: { fullName: "Học viên Demo" } });

    const updated = await app.inject({
      method: "PUT",
      url: "/api/v1/learner/profile",
      headers: { cookie },
      payload: { ...current.json().profile, concerns: "Muốn nói rõ hơn", version: 1 }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ completed: true, version: 2, profile: { concerns: "Muốn nói rõ hơn" } });

    const avatar = { color: "rose", acc: "flower", bg: 3 } as const;
    const avatarUpdated = await app.inject({
      method: "PUT",
      url: "/api/v1/learner/profile",
      headers: { cookie },
      payload: { ...updated.json().profile, avatar, version: 2 }
    });
    expect(avatarUpdated.statusCode).toBe(200);
    expect(avatarUpdated.json()).toMatchObject({ version: 3, profile: { avatar } });

    const reloaded = await app.inject({ method: "GET", url: "/api/v1/learner/profile", headers: { cookie } });
    expect(reloaded.json()).toMatchObject({ version: 3, profile: { avatar } });
  });

  it("returns the current week, five ordered lessons and the next resumable lesson", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/learner/home", headers: { cookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      onboardingRequired: false,
      week: { weekNumber: 1 },
      metrics: { completedLessons: 1, totalLessons: 5 }
    });
    expect(response.json().lessons).toHaveLength(5);
    expect(response.json().nextLesson).toMatchObject({ dayNumber: 2 });
    expect(response.json().lessons[2]).toMatchObject({
      dayNumber: 3,
      lock: {
        reason: "prior",
        blocker: { id: DEMO_IDS.lessons[1], dayNumber: 2, title: "Past simple: I joined…" },
        totalLessons: 5
      }
    });
  });

  it("returns the existing home capabilities instead of reducing home to a lesson list", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T12:00:00.000Z"));
    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/learner/home", headers: { cookie } });

      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({
        program: { name: "E4S Pilot", weekCount: 2 },
        schedule: {
          daysPerWeek: 5,
          lessonMinutes: 10,
          days: [
            { label: "T2", status: "attended" },
            { label: "T3", status: "today" },
            { label: "T4", status: "upcoming" },
            { label: "T5", status: "upcoming" },
            { label: "T6", status: "upcoming" }
          ]
        },
        coach: { turnsThisWeek: 2, targetTurns: 2, href: "/coach" },
        practice: { status: "reviewed", href: "/practice" },
        levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: true },
        finalAssessment: { available: true, href: "/test/final" }
      });
      expect(response.json().levelReadiness.criteria).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves lesson content order and resumes server-side progress evidence", async () => {
    const home = await app.inject({ method: "GET", url: "/api/v1/learner/home", headers: { cookie } });
    const lessonId = home.json().nextLesson.id as string;

    const lesson = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie } });
    expect(lesson.statusCode).toBe(200);
    expect(lesson.json().content.parts.map((part: { code: string }) => part.code)).toEqual([
      "objective", "instruction", "vocabulary", "grammar", "pronunciation",
      "listening", "reading", "writing", "word_class", "word_use", "speaking"
    ]);

    const saved = await app.inject({
      method: "PUT",
      url: `/api/v1/lessons/${lessonId}/progress`,
      headers: { cookie },
      payload: {
        completedPartCodes: ["listening", "reading"],
        evidence: {
          listening: { attempts: 1, answer: "A" },
          reading: { attempts: 1, answer: "B" }
        }
      }
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ status: "in_progress", completedPartCodes: ["listening", "reading"] });

    const resumed = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie } });
    expect(resumed.json().progress).toMatchObject({
      status: "in_progress",
      evidence: { listening: { answer: "A" }, reading: { answer: "B" } }
    });
  });

  it("returns the enriched vocabulary relations used by the learner detail modals", async () => {
    const response = await app.inject({ method: "GET", url: `/api/v1/lessons/${DEMO_IDS.lessons[0]}`, headers: { cookie } });
    expect(response.statusCode, response.body).toBe(200);
    const vocabulary = response.json().content.parts.find((part: { code: string }) => part.code === "vocabulary");
    expect(vocabulary).toMatchObject({
      content: {
        items: expect.arrayContaining([
          expect.objectContaining({
            word: "colleague",
            family: expect.arrayContaining([expect.objectContaining({ word: "collegial" })]),
            synonyms: expect.arrayContaining([expect.objectContaining({ word: "coworker", level: "A2" })]),
            umbrella: expect.objectContaining({ word: "people at work" }),
            lexicalDetails: expect.arrayContaining([
              expect.objectContaining({ kind: "synonym", word: "coworker" }),
              expect.objectContaining({ kind: "antonym", word: "competitor" }),
              expect.objectContaining({ kind: "slang", word: "workmate" }),
              expect.objectContaining({ kind: "poetic", word: "fellow worker" })
            ])
          })
        ])
      }
    });
  });

  it("returns progress evidence for the profile screen without exposing another learner", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/learner/progress", headers: { cookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ learner: { id: DEMO_IDS.learner }, points: 20 });
    expect(response.json().weeks[0]).toMatchObject({ weekNumber: 1, completedLessons: 1, totalLessons: 5 });
  });

  it("returns season, badge roadmap, readiness and assessment evidence for the existing profile screen", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/learner/progress", headers: { cookie } });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      season: {
        current: { key: "spring", level: 1 },
        next: { key: "summer", level: 2, pointsRequired: 60 },
        earnedBadgeCount: 1,
        requiredBadgeCount: 2
      },
      stats: { completedLessons: 1, coachTurns: 2, studyDays: 1 },
      levelReadiness: { targetLevel: "B1", eligible: false },
      assessments: {
        placement: {
          totalScore: 55,
          approvedLevel: "A2",
          sections: { listening: 14, reading: 16, writing: 13, speaking: 12 }
        },
        final: null
      }
    });
    expect(response.json().badgeRoadmap).toHaveLength(8);
    expect(response.json().badgeRoadmap.find((badge: { key: string }) => badge.key === "starter")).toMatchObject({ earned: true });
  });

  it("persists a micro-practice attempt and completion on the same screen", async () => {
    const attempt = await app.inject({
      method: "POST",
      url: `/api/v1/micro-lessons/${DEMO_IDS.microLesson}/attempts`,
      headers: { cookie },
      payload: { answer: "Could we reschedule to 3 PM?" }
    });
    expect(attempt.statusCode).toBe(200);
    expect(attempt.json()).toMatchObject({
      id: DEMO_IDS.microLesson,
      attempt: { answer: "Could we reschedule to 3 PM?", attempts: 1, correct: true },
      feedback: { status: "ready" }
    });

    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/micro-lessons/${DEMO_IDS.microLesson}/complete`,
      headers: { cookie },
      payload: {}
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().completedAt).toEqual(expect.any(String));

    const resumed = await app.inject({
      method: "GET",
      url: `/api/v1/micro-lessons/${DEMO_IDS.microLesson}`,
      headers: { cookie }
    });
    expect(resumed.json()).toMatchObject({
      attempt: { answer: "Could we reschedule to 3 PM?", attempts: 1, correct: true },
      feedback: { status: "ready" }
    });
    expect(resumed.json().completedAt).toEqual(expect.any(String));
  });

  it("exposes server-owned micro regeneration availability and refuses generation without AI", async () => {
    const current = await app.inject({
      method: "GET",
      url: `/api/v1/micro-lessons/${DEMO_IDS.microLesson}`,
      headers: { cookie }
    });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ id: DEMO_IDS.microLesson, regenerateAvailable: false });

    const generated = await app.inject({
      method: "POST",
      url: "/api/v1/micro-lessons",
      headers: { cookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000009", regenerate: true }
    });
    expect(generated.statusCode).toBe(503);
    expect(generated.json()).toEqual({ code: "AI_UNAVAILABLE" });
  });
});
