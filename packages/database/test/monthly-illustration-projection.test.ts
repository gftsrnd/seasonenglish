import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createRepositories } from "../src/repositories.js";
import { withFrozenMonthlyIllustrations } from "../src/monthly-illustration-projection.js";

describe("frozen monthly illustrations", () => {
  it.each(["new", "review"] as const)("returns frozen media in both the learner list and opened %s lesson, even for old saved content", async (kind) => {
    const row = {
      id: "lesson-1", title: "Lesson", day_number: kind === "new" ? 1 : 5, week_number: 0, week_topic: "Office", cefr: "A1",
      monthly_kind: kind, monthly_month: "2026-11", lesson_date: kind === "new" ? "2026-11-02" : "2026-11-06", system_date: "2026-11-06", organization_id: "org-1",
      content: { parts: [{ code: "vocabulary", title: "Từ vựng", content: { items: [{ word: "client" }] } }] },
      monthly_core_terms: [{ id: "core-1", word: "client" }], frozen_illustrations: [{ word: "client", artifactKey: "content-media/client.png" }],
      progress_status: null, progress_score: null, progress_evidence: null, progress_updated_at: null
    };
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("monthly_core_terms") ? [row] : [], rowCount: sql.includes("monthly_core_terms") ? 1 : 0 }));
    const learning = createRepositories({ query } as unknown as Pool).learning;
    const list = await learning.listMonthlyLessons("learner-1", "2026-11");
    const opened = await learning.findLesson("learner-1", "lesson-1");
    for (const lesson of [list[0], opened]) {
      const items = lesson!.content.parts[0]!.content.items as Array<Record<string, unknown>>;
      expect(items[0]).toMatchObject({ imageUrl: "/api/v1/files/content-media/read?artifactKey=content-media%2Fclient.png", imageAttribution: { licence: "Nội dung nội bộ" } });
    }
    expect(row.content.parts[0]!.content.items[0]).not.toHaveProperty("imageUrl");
  });

  it("restores legacy media by exact normalized word without modifying the locked core terms", () => {
    const cores = [{ id: "c1", word: "Client" }, { id: "c2", word: "report" }];
    const images = [{ word: "client", artifactKey: "content-media/x y+z.png" }, { word: "time", artifactKey: "unrelated.png" }];
    expect(withFrozenMonthlyIllustrations(cores, images)).toEqual([
      { id: "c1", word: "Client", imageUrl: "/api/v1/files/content-media/read?artifactKey=content-media%2Fx%20y%2Bz.png" },
      { id: "c2", word: "report" }
    ]);
    expect(cores[0]).not.toHaveProperty("imageUrl");
  });

  it("keeps the contract's frozen image even when another working image is available", () => {
    const cores = [{ word: "client", imageUrl: "/frozen.png" }];
    expect(withFrozenMonthlyIllustrations(cores, [{ word: "client", artifactKey: "working.png" }])[0]!.imageUrl).toBe("/frozen.png");
    expect(withFrozenMonthlyIllustrations(cores)[0]!.imageUrl).toBe("/frozen.png");
  });
});
