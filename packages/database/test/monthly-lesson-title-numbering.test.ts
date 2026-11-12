import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createRepositories } from "../src/repositories.js";

describe("monthly learner lesson titles", () => {
  it.each([
    { kind: "new" as const, slot: 6, date: "2026-11-09", stored: "Bài 6", expected: "Bài 5", label: "Bài 5" },
    { kind: "new" as const, slot: 6, date: "2026-11-09", stored: "Bài 6: Can you check it?", expected: "Bài 5: Can you check it?", label: "Bài 5" },
    { kind: "review" as const, slot: 5, date: "2026-11-06", stored: "Bài 5", expected: "Ôn tuần 1", label: "Ôn tuần 1" },
    { kind: "new" as const, slot: 6, date: "2026-11-09", stored: "Can you check it?", expected: "Can you check it?", label: "Bài 5" }
  ])("shows stored $kind title '$stored' as '$expected' in the list and the opened lesson", async ({ kind, slot, date, stored, expected, label }) => {
    const row = {
      id: "lesson-1", title: stored, day_number: slot, week_number: 0, week_topic: "Office", cefr: "A1",
      monthly_kind: kind, monthly_month: "2026-11", lesson_date: date, system_date: "2026-11-09", organization_id: "org-1",
      // Same ordinal SQL aliases as the learner calendar (ordinal_spec): new lessons exclude Friday reviews.
      monthly_new_ordinal: kind === "new" ? slot - 1 : 4, monthly_review_ordinal: 1,
      content: { parts: [{ code: "instruction", title: "Hướng dẫn", content: {} }] },
      progress_status: null, progress_score: null, progress_evidence: null, progress_updated_at: null
    };
    const access = { system_date: "2026-11-09", month: "2026-11", cefr: "A1", level_started_on: "2026-11-01", exam_date: "2026-11-30", published_on: "2026-11-01", reset_on: null, unlocked_on: null, graduated: false };
    const query = vi.fn(async (sql: string) => {
      const rows = sql.includes("attendance_reset_on") ? [access] : sql.includes("monthly_core_terms") || sql.includes("monthly_new_ordinal") ? [row] : [];
      return { rows, rowCount: rows.length };
    });
    const learning = createRepositories({ query } as unknown as Pool).learning;
    const list = await learning.listMonthlyLessons("learner-1", "2026-11");
    const opened = await learning.findLesson("learner-1", "lesson-1");
    for (const lesson of [list[0], opened]) {
      expect(lesson!.title).toBe(expected);
      expect(lesson!.teachingLabel).toBe(label);
    }
    expect(row.title).toBe(stored);
  });
});

describe("monthly learner lock blocker label", () => {
  it("names the blocking lesson by its new-lesson number (Bài 5 for slot 6 after the Friday review), not the raw slot", async () => {
    const base = { week_number: 0, week_topic: "Office", cefr: "A1", monthly_kind: "new", monthly_month: "2026-11", system_date: "2026-11-10", organization_id: "org-1", monthly_review_ordinal: 1, content: { parts: [{ code: "instruction", title: "Hướng dẫn", content: {} }] }, progress_score: null, progress_evidence: null, progress_updated_at: null };
    const rows = [
      { ...base, id: "review-1", title: "Ôn tập", day_number: 5, lesson_date: "2026-11-06", monthly_kind: "review", monthly_new_ordinal: 4, progress_status: "completed" },
      { ...base, id: "lesson-6", title: "Bài 6", day_number: 6, lesson_date: "2026-11-09", monthly_new_ordinal: 5, progress_status: null },
      { ...base, id: "lesson-7", title: "Bài 7", day_number: 7, lesson_date: "2026-11-10", monthly_new_ordinal: 6, progress_status: null }
    ];
    const access = { system_date: "2026-11-10", month: "2026-11", cefr: "A1", level_started_on: "2026-11-06", exam_date: "2026-11-30", published_on: "2026-11-01", reset_on: null, unlocked_on: null, graduated: false };
    const query = vi.fn(async (sql: string) => {
      const result = sql.includes("attendance_reset_on") ? [access] : sql.includes("monthly_core_terms") ? rows : [];
      return { rows: result, rowCount: result.length };
    });
    const list = await createRepositories({ query } as unknown as Pool).learning.listMonthlyLessons("learner-1", "2026-11");
    const locked = list.find((lesson) => lesson.id === "lesson-7")!;
    expect(locked.lock).toMatchObject({ reason: "prior", blocker: { id: "lesson-6", label: "Bài 5", title: "Bài 5" } });
    expect(locked.lock!.message).toContain("bài 5 · Bài 5");
    expect(locked.lock!.message).not.toContain("bài 6");
  });
});
