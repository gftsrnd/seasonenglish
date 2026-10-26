import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";
import type { ContentMediaService } from "../src/modules/media/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("learner profile, home, lesson and progress API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const mediaService: ContentMediaService = {
    resolveForUser: vi.fn().mockResolvedValue({ status: "unavailable" }),
    diagnoseForUser: vi.fn().mockResolvedValue({ image: { status: "unavailable" }, provider: null, cached: false }),
    clearForUser: vi.fn().mockResolvedValue({ cleared: 0 })
  };
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, mediaService });
  let cookie = "";
  let operatorCookie = "";
  let managerCookie = "";

  async function loginStaff(email: string, password: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      payload: { email, password }
    });
    return String(response.headers["set-cookie"]).split(";")[0] ?? "";
  }

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6)",
        [
          DEMO_IDS.learner, await createPinHash("123456"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass")
        ]
      );
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
    });
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    operatorCookie = await loginStaff("thu.ha.tran@e4s.local", "operator-pass");
    managerCookie = await loginStaff("quoc.bao.le@e4s.local", "manager-pass");
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
    expect(current.json()).toMatchObject({ completed: true, version: 1, profile: { fullName: "Nguyễn Minh Anh" } });

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

  it("persists a changed profile email in the canonical user record and reloads it", async () => {
    const current = await app.inject({ method: "GET", url: "/api/v1/learner/profile", headers: { cookie } });
    const email = "minh.anh.profile-updated@e4s.local";
    const updated = await app.inject({
      method: "PUT",
      url: "/api/v1/learner/profile",
      headers: { cookie },
      payload: { ...current.json().profile, email: email.toUpperCase(), version: current.json().version }
    });

    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({ profile: { email } });
    await expect(pool.query("select email from users where id = $1", [DEMO_IDS.learner]))
      .resolves.toMatchObject({ rows: [{ email }] });

    const reloaded = await app.inject({ method: "GET", url: "/api/v1/learner/profile", headers: { cookie } });
    expect(reloaded.statusCode, reloaded.body).toBe(200);
    expect(reloaded.json()).toMatchObject({ profile: { email }, version: updated.json().version });
  });

  it("rejects a profile email already used by another account without changing canonical data", async () => {
    const current = await app.inject({ method: "GET", url: "/api/v1/learner/profile", headers: { cookie } });
    const originalEmail = current.json().profile.email as string;
    const duplicate = await app.inject({
      method: "PUT",
      url: "/api/v1/learner/profile",
      headers: { cookie },
      payload: { ...current.json().profile, email: "THU.HA.TRAN@E4S.LOCAL", version: current.json().version }
    });

    expect(duplicate.statusCode, duplicate.body).toBe(409);
    expect(duplicate.json()).toEqual({ code: "LEARNER_PROFILE_EMAIL_EXISTS" });
    const reloaded = await app.inject({ method: "GET", url: "/api/v1/learner/profile", headers: { cookie } });
    expect(reloaded.json()).toMatchObject({ profile: { email: originalEmail }, version: current.json().version });
  });

  it("prefills a new learner profile from the authenticated account identity", async () => {
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/learner/register",
      payload: {
        displayName: "Nguyễn Học Viên",
        email: "PREFILL@E4S.LOCAL",
        pin: "654321"
      }
    });
    expect(registration.statusCode, registration.body).toBe(201);
    const newLearnerCookie = String(registration.headers["set-cookie"]).split(";")[0] ?? "";

    const profile = await app.inject({
      method: "GET",
      url: "/api/v1/learner/profile",
      headers: { cookie: newLearnerCookie }
    });

    expect(profile.statusCode, profile.body).toBe(200);
    expect(profile.json()).toMatchObject({
      completed: false,
      profile: {
        fullName: "Nguyễn Học Viên",
        email: "prefill@e4s.local"
      }
    });
  });

  it("restores an incomplete profile draft after logout and a new login", async () => {
    const email = "draft-profile@e4s.local";
    const pin = "654321";
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/learner/register",
      payload: { displayName: "Học viên lưu nháp", email, pin }
    });
    expect(registration.statusCode, registration.body).toBe(201);
    const registrationCookie = String(registration.headers["set-cookie"]).split(";")[0] ?? "";

    const initial = await app.inject({ method: "GET", url: "/api/v1/learner/profile", headers: { cookie: registrationCookie } });
    const saved = await app.inject({
      method: "PUT",
      url: "/api/v1/learner/profile/draft",
      headers: { cookie: registrationCookie },
      payload: {
        ...initial.json().profile,
        version: initial.json().version,
        goals: ["meeting"],
        environmentUse: "",
        familyUse: "",
        habits: [],
        learningStyles: [],
        explanationLanguage: "auto",
        persona: "informal",
        durationMinutes: 10,
        device: "both",
        selfLevel: "unknown",
        certificates: [],
        situations: "Họp với khách hàng Singapore"
      }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ completed: false, draftAvailable: true });

    await app.inject({ method: "POST", url: "/api/logout", headers: { cookie: registrationCookie } });
    const login = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email, pin } });
    const loginCookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    const restored = await app.inject({ method: "GET", url: "/api/v1/learner/profile", headers: { cookie: loginCookie } });

    expect(restored.statusCode, restored.body).toBe(200);
    expect(restored.json()).toMatchObject({
      completed: false,
      draftAvailable: true,
      profile: { goals: ["meeting"], situations: "Họp với khách hàng Singapore" }
    });

    const completed = await app.inject({
      method: "PUT",
      url: "/api/v1/learner/profile",
      headers: { cookie: loginCookie },
      payload: {
        ...restored.json().profile,
        version: restored.json().version,
        environmentUse: "weekly",
        familyUse: "never",
        habits: ["reading"],
        learningStyles: ["speaking"]
      }
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toMatchObject({ completed: true, draftAvailable: false });

    const editDraft = await app.inject({
      method: "PUT",
      url: "/api/v1/learner/profile/draft",
      headers: { cookie: loginCookie },
      payload: { ...completed.json().profile, version: completed.json().version, learningStyles: [] }
    });
    expect(editDraft.statusCode, editDraft.body).toBe(200);
    expect(editDraft.json()).toMatchObject({ completed: true, draftAvailable: true, profile: { learningStyles: [] } });
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
      await pool.query(
        "update activities set occurred_at = '2026-10-12T09:00:00.000Z' where id = $1",
        [DEMO_IDS.activity]
      );
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
        levelReadiness: { targetLevel: "B1", windowDays: 14, eligible: false, examAvailable: true }
      });
      expect(response.json()).not.toHaveProperty("finalAssessment");
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

  it("resolves an accessible vocabulary item only after lesson access succeeds", async () => {
    vi.mocked(mediaService.resolveForUser).mockResolvedValueOnce({
      status: "available",
      imageUrl: "https://storage.test/colleague.jpg",
      alt: "colleague",
      attribution: {
        creator: "Fixture creator",
        licence: "CC BY",
        licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Colleague.jpg"
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/lessons/${DEMO_IDS.lessons[0]}/vocabulary/0/image`,
      headers: { cookie }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ status: "available", alt: "colleague" });
    expect(mediaService.resolveForUser).toHaveBeenLastCalledWith(DEMO_IDS.learner, expect.objectContaining({
      term: "colleague",
      partOfSpeech: "noun"
    }));
  });

  it("enables provider fallback for non-noun lesson vocabulary", async () => {
    vi.mocked(mediaService.resolveForUser).mockClear().mockResolvedValueOnce({ status: "unavailable" });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/lessons/${DEMO_IDS.lessons[1]}/vocabulary/0/image`,
      headers: { cookie }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ status: "unavailable" });
    expect(mediaService.resolveForUser).toHaveBeenCalledWith(DEMO_IDS.learner, {
      term: "new",
      partOfSpeech: "adjective",
      allowProviderFallback: true
    });
  });

  it("does not resolve media for an invalid or inaccessible lesson item", async () => {
    vi.mocked(mediaService.resolveForUser).mockClear();
    const invalidIndex = await app.inject({
      method: "GET",
      url: `/api/v1/lessons/${DEMO_IDS.lessons[0]}/vocabulary/99/image`,
      headers: { cookie }
    });
    const inaccessible = await app.inject({
      method: "GET",
      url: "/api/v1/lessons/99999999-9999-4999-8999-999999999999/vocabulary/0/image",
      headers: { cookie }
    });

    expect(invalidIndex.statusCode).toBe(404);
    expect(inaccessible.statusCode).toBe(404);
    expect(mediaService.resolveForUser).not.toHaveBeenCalled();
  });

  it("denies Operator and Manager access to learner vocabulary media", async () => {
    vi.mocked(mediaService.resolveForUser).mockClear();
    for (const staffCookie of [operatorCookie, managerCookie]) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/lessons/${DEMO_IDS.lessons[0]}/vocabulary/0/image`,
        headers: { cookie: staffCookie }
      });
      expect(response.statusCode).toBe(403);
    }
    expect(mediaService.resolveForUser).not.toHaveBeenCalled();
  });

  it("degrades resolver failures to an unavailable image", async () => {
    vi.mocked(mediaService.resolveForUser).mockRejectedValueOnce(new Error("storage unavailable"));
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/lessons/${DEMO_IDS.lessons[0]}/vocabulary/0/image`,
      headers: { cookie }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "unavailable" });
  });

  it("returns progress evidence for the profile screen without exposing another learner", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/learner/progress", headers: { cookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ learner: { id: DEMO_IDS.learner }, points: 20 });
    expect(response.json().weeks[0]).toMatchObject({ weekNumber: 1, completedLessons: 1, totalLessons: 5 });
  });

  it("marks profile days from real deadlines instead of colouring incomplete future days red", async () => {
    const previousProgram = await pool.query<{ start_date: string }>(
      "select start_date::text from programs where id = $1",
      [DEMO_IDS.program]
    );
    const previousProgress = await pool.query<{ completed_at: Date | null }>(
      "select completed_at from progress_records where learner_id = $1 and lesson_id = $2",
      [DEMO_IDS.learner, DEMO_IDS.lessons[0]]
    );
    await pool.query("update programs set start_date = current_date where id = $1", [DEMO_IDS.program]);
    await pool.query(
      "update progress_records set status = 'completed', completed_at = now() where learner_id = $1 and lesson_id = $2",
      [DEMO_IDS.learner, DEMO_IDS.lessons[0]]
    );

    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/learner/progress", headers: { cookie } });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().weeks[0].days).toEqual([
        { label: "T2", status: "on_time" },
        { label: "T3", status: "upcoming" },
        { label: "T4", status: "upcoming" },
        { label: "T5", status: "upcoming" },
        { label: "T6", status: "upcoming" }
      ]);
    } finally {
      await pool.query("update programs set start_date = $2::date where id = $1", [DEMO_IDS.program, previousProgram.rows[0]!.start_date]);
      await pool.query(
        "update progress_records set completed_at = $3 where learner_id = $1 and lesson_id = $2",
        [DEMO_IDS.learner, DEMO_IDS.lessons[0], previousProgress.rows[0]?.completed_at ?? null]
      );
    }
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
        }
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

  it("rejects a one-word self-writing answer before grading or persistence", async () => {
    const lessonId = "10000000-0000-4000-8000-000000000123";
    await pool.query(
      `insert into micro_lessons (id, learner_id, program_week_id, cefr, topic, content, source)
       values ($1, $2, $3, 'A2', 'Short writing',
         '{"durationMinutes":5,"theory":"Write one complete workplace sentence.","vocabulary":["confirm","meeting","time"],"practice":{"prompt":"Confirm the meeting.","type":"write","answer":"I confirm the meeting."}}'::jsonb,
         'seed')`,
      [lessonId, DEMO_IDS.learner, DEMO_IDS.week]
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/micro-lessons/${lessonId}/attempts`,
      headers: { cookie },
      payload: { answer: "Okay" }
    });

    expect(response.statusCode, response.body).toBe(422);
    expect(response.json()).toEqual({ code: "MICRO_ANSWER_TOO_SHORT", minimumWords: 2 });
    const stored = await pool.query<{ progress: Record<string, unknown> }>("select progress from micro_lessons where id = $1", [lessonId]);
    expect(stored.rows[0]?.progress).toEqual({});
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
