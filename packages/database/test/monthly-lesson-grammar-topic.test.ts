import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createRepositories } from "../src/repositories.js";

// Published A1 lessons store no grammar topic; the opened lesson gets it from the approved day plan.
const grammarTopics = [
  { id: "g1", title: "Động từ to be", catalogId: "a1-p1-a", steps: [{ id: "g1-s1" }, { id: "g1-s2" }, { id: "g1-s3" }] },
  { id: "g2", title: "Đại từ & sở hữu", catalogId: "a1-p1-b", steps: [{ id: "g2-s1" }, { id: "g2-s2" }, { id: "g2-s3" }] }
];

function lessonRow(cefr: "A1" | "B1", topics: unknown) {
  return {
    id: "lesson-1", title: "Bài 1", day_number: 1, week_number: 0, week_topic: "Office", cefr,
    monthly_kind: "new", monthly_month: "2026-11", lesson_date: "2026-11-02", system_date: "2026-11-02", organization_id: "org-1",
    monthly_new_ordinal: 1, monthly_review_ordinal: 0,
    monthly_day_spec: { lessonNumber: 1, kind: "new", newLessonNumber: 1, grammarStepId: "g1-s1", grammarStepIds: ["g1-s1"], grammarPlan: { code: "A1", mode: "recognize", objective: "x", milestoneIds: ["g1-s1"], recallMilestoneIds: [] } },
    monthly_grammar_topics: topics,
    content: { parts: [
      { code: "grammar", title: "Ngữ pháp", content: { formula: "I am / He is / She is / We are / They are + danh từ hoặc tính từ", examples: ["I am the staff member."] } },
      { code: "vocabulary", title: "Từ vựng", content: { items: [] } }
    ] },
    progress_status: null, progress_score: null, progress_evidence: null, progress_updated_at: null
  };
}

async function openLesson(row: ReturnType<typeof lessonRow>) {
  const access = { system_date: "2026-11-02", month: "2026-11", cefr: row.cefr, level_started_on: "2026-11-01", exam_date: "2026-11-30", published_on: "2026-11-01", reset_on: null, unlocked_on: null, graduated: false };
  const sqls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    sqls.push(sql);
    const rows = sql.includes("attendance_reset_on") ? [access] : sql.includes("monthly_core_terms") || sql.includes("monthly_new_ordinal") ? [row] : [];
    return { rows, rowCount: rows.length };
  });
  const lesson = await createRepositories({ query } as unknown as Pool).learning.findLesson("learner-1", "lesson-1");
  return { lesson, sqls };
}

describe("opened monthly lesson: grammar topic name from the day plan", () => {
  it("attaches topicTitle and (A1–A2) topicTitleVi to the grammar part, read from the framework's grammarTopics", async () => {
    const { lesson, sqls } = await openLesson(lessonRow("A1", grammarTopics));
    expect(sqls.some((sql) => sql.includes("curriculum_contract->'grammarTopics' as monthly_grammar_topics"))).toBe(true);
    const grammar = lesson!.content.parts.find((part) => part.code === "grammar")!;
    expect(grammar.content).toMatchObject({ topicTitle: "The verb to be", topicTitleVi: "Động từ to be" });
    expect(lesson!.content.parts.find((part) => part.code === "vocabulary")!.content).not.toHaveProperty("topicTitle");
  });

  it("gives B1+ the English name only and leaves lessons without a plan untouched", async () => {
    const b1Topics = [{ title: "Present simple vs present continuous", catalogId: "b1-p1-a", steps: [{ id: "g1-s1" }] }];
    const { lesson } = await openLesson(lessonRow("B1", b1Topics));
    const grammar = lesson!.content.parts.find((part) => part.code === "grammar")!;
    expect(grammar.content.topicTitle).toBe("Present simple vs present continuous");
    expect(grammar.content).not.toHaveProperty("topicTitleVi");
    const { lesson: without } = await openLesson(lessonRow("A1", null));
    expect(without!.content.parts.find((part) => part.code === "grammar")!.content).not.toHaveProperty("topicTitle");
  });
});
