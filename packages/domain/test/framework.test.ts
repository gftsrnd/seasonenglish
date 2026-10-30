import { describe, expect, it } from "vitest";
import { buildLessonFromDayPlan, buildSampleFramework, distributeFramework, validateMonthFramework } from "../src/calendar/framework.js";
import { DEFAULT_MONTH_FRAMEWORK_SETTINGS, buildMonthlyCalendar } from "../src/calendar/index.js";
import { validateLessonDraft, validateLessonPublication } from "../src/content/index.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;

describe("khung mẫu khi không có AI", () => {
  it.each(LEVELS)("level %s có đúng N=60, Y=3, Z=4 và hợp lệ cho tháng 11/2026", (cefr) => {
    const framework = buildSampleFramework(cefr);
    expect(framework.vocabulary).toHaveLength(60);
    expect(framework.grammarTopics).toHaveLength(3);
    expect(framework.sounds).toHaveLength(4);
    expect(validateMonthFramework(framework, DEFAULT_MONTH_FRAMEWORK_SETTINGS, 20)).toEqual([]);
  });

  it("báo lỗi khi số từ hoặc ví dụ âm không đủ", () => {
    const framework = buildSampleFramework("A1");
    expect(validateMonthFramework({ ...framework, vocabulary: framework.vocabulary.slice(0, 59) }, DEFAULT_MONTH_FRAMEWORK_SETTINGS, 20)).toHaveLength(1);
    const thinSound = { ...framework.sounds[0]!, examples: framework.sounds[0]!.examples.slice(0, 5) };
    expect(validateMonthFramework({ ...framework, sounds: [thinSound, ...framework.sounds.slice(1)] }, DEFAULT_MONTH_FRAMEWORK_SETTINGS, 20).some((error) => error.includes("ví dụ"))).toBe(true);
  });
});

describe("chia khung thành bài ngày (tháng 11/2026, 20 bài)", () => {
  const framework = buildSampleFramework("A2");
  const plan = distributeFramework(framework, buildMonthlyCalendar("2026-11").lessonCount);

  it("mỗi ngày 3 từ theo thứ tự; từ bài 21 trở đi mới ôn (N=60 vừa đủ 20 bài)", () => {
    expect(plan.days).toHaveLength(20);
    expect(plan.days[0]!.vocabulary.map((slot) => slot.index)).toEqual([0, 1, 2]);
    expect(plan.days[19]!.vocabulary.map((slot) => slot.index)).toEqual([57, 58, 59]);
    expect(plan.days.every((day) => day.vocabulary.every((slot) => !slot.review))).toBe(true);
    expect(plan.firstReviewLesson).toBeNull();
  });

  it("tháng 12/2026 (22 bài): bài 21, 22 ôn các từ học lâu nhất", () => {
    const december = distributeFramework(framework, buildMonthlyCalendar("2026-12").lessonCount);
    expect(december.firstReviewLesson).toBe(21);
    expect(december.days[20]!.vocabulary).toEqual([{ index: 0, review: true }, { index: 1, review: true }, { index: 2, review: true }]);
    expect(december.days[21]!.vocabulary).toEqual([{ index: 3, review: true }, { index: 4, review: true }, { index: 5, review: true }]);
  });

  it("ngữ pháp: 3 chủ điểm chia thành 3 đoạn, bước scaffolding tăng dần trong mỗi đoạn", () => {
    const sequence = plan.days.map((day) => `${day.grammar.topicIndex}.${day.grammar.stepIndex}`);
    expect(sequence.slice(0, 7).every((value) => value.startsWith("0."))).toBe(true);
    expect(sequence.slice(7, 14).every((value) => value.startsWith("1."))).toBe(true);
    expect(sequence.slice(14).every((value) => value.startsWith("2."))).toBe(true);
    for (let index = 1; index < plan.days.length; index += 1) {
      const previous = plan.days[index - 1]!.grammar;
      const current = plan.days[index]!.grammar;
      if (current.topicIndex === previous.topicIndex) expect(current.stepIndex).toBeGreaterThanOrEqual(previous.stepIndex);
    }
    expect(plan.days[6]!.grammar.stepIndex).toBe(2);
  });

  it("phát âm: 4 âm xoay vòng, không ví dụ nào lặp lại trong tháng", () => {
    expect(plan.days.map((day) => day.pronunciation.soundIndex).slice(0, 8)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    const used = new Set<string>();
    for (const day of plan.days) {
      expect(day.pronunciation.exampleIndices).toHaveLength(3);
      for (const exampleIndex of day.pronunciation.exampleIndices) {
        const key = `${day.pronunciation.soundIndex}:${exampleIndex}`;
        expect(used.has(key)).toBe(false);
        used.add(key);
      }
    }
  });
});

describe("dựng bài ngày từ kế hoạch", () => {
  it.each(LEVELS)("bài mẫu %s qua được kiểm tra nháp và kiểm tra xuất bản", (cefr) => {
    const framework = buildSampleFramework(cefr);
    const plan = distributeFramework(framework, 20);
    const lessons = plan.days.map((day) => buildLessonFromDayPlan(framework, day));
    expect(validateLessonDraft(lessons)).toEqual({ valid: true, issues: [] });
    const publication = validateLessonPublication(lessons, undefined, cefr);
    expect(publication.issues).toEqual([]);
  });

  it("từ trừu tượng được đánh dấu để ẩn khung ảnh", () => {
    const framework = buildSampleFramework("A1");
    const lesson = buildLessonFromDayPlan(framework, distributeFramework(framework, 20).days[0]!);
    const vocabulary = lesson.parts.find((part) => part.code === "vocabulary")!.content as { items: Array<{ word: string; abstract?: boolean }> };
    expect(vocabulary.items.find((item) => item.word === "deadline")?.abstract).toBe(true);
    expect(vocabulary.items.find((item) => item.word === "colleague")?.abstract).toBeUndefined();
  });
});
