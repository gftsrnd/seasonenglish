import { describe, expect, it } from "vitest";
import { allocateExamItems, buildMonthlyExamBlueprint, defaultMonthlyExamConfig, studentPackageOf, validateMonthlyExamBlueprint } from "../src/calendar/exam.js";
import { buildSampleFramework } from "../src/calendar/framework.js";

describe("bài thi tháng theo cấu trúc PO (v1.1 · 31/10/2026)", () => {
  const framework = buildSampleFramework("B1");
  const blueprint = buildMonthlyExamBlueprint({ framework, month: "2026-11", examDate: "2026-11-30", lessonCount: 20 });

  it("N=60 chia 20–30–6–4; 30 phút chia 8–8–8–6", () => {
    expect(allocateExamItems(60)).toEqual({ listening: 20, reading: 30, writing: 6, speaking: 4 });
    expect(allocateExamItems(45)).toEqual({ listening: 15, reading: 23, writing: 4, speaking: 3 });
    expect(defaultMonthlyExamConfig(60).minutes).toEqual({ listening: 8, reading: 8, writing: 8, speaking: 6 });
    expect(defaultMonthlyExamConfig(60, 60).minutes).toEqual({ listening: 16, reading: 16, writing: 16, speaking: 12 });
  });

  it("4 kỹ năng × 25 điểm = 100; tổng 30 phút; 20 câu L, 30 câu R, 1 W, Read Aloud + voice note", () => {
    expect(blueprint.totalScore).toBe(100);
    expect(blueprint.totalMinutes).toBe(30);
    expect(blueprint.sections.map((section) => [section.code, section.maxScore, section.durationMinutes])).toEqual([["listening", 25, 8], ["reading", 25, 8], ["writing", 25, 8], ["speaking", 25, 6]]);
    const tasks = blueprint.sections.flatMap((section) => section.groups.flatMap((group) => group.tasks));
    expect(tasks.filter((task) => task.key.startsWith("L"))).toHaveLength(20);
    expect(tasks.filter((task) => task.key.startsWith("R"))).toHaveLength(30);
    expect(tasks.filter((task) => task.key === "W1")).toHaveLength(1);
    expect(tasks.filter((task) => task.key === "S1" || task.key === "S2")).toHaveLength(2);
    expect(blueprint.sections[0]!.groups).toHaveLength(2);
    expect(blueprint.sections[0]!.groups.every((group) => group.maxPlays === 2 && group.stimulus?.type === "audio_script")).toBe(true);
  });

  it("mỗi mục từ có đúng một vị trí đánh giá; 3 chủ điểm ngữ pháp ở Writing và Speaking; 4 âm × 2 vị trí", () => {
    const checks = Object.fromEntries(blueprint.checks.map((check) => [check.code, check.passed]));
    expect(checks).toMatchObject({ GEN02: true, GEN03: true, GEN10: true, GEN11: true, GEN13: true, GEN16: true, GEN17: true, GEN20: false });
    expect(blueprint.audioStatus).toBe("SCRIPT_ONLY");
    expect(blueprint.status).toBe("DRAFT");
    expect(blueprint.mapping.filter((row) => row.kind === "vocabulary")).toHaveLength(60);
    expect(blueprint.mapping.filter((row) => row.kind === "pronunciation")).toHaveLength(8);
  });

  it("câu khách quan có 3 lựa chọn A/B/C, đáp án không dồn một vị trí", () => {
    const choices = blueprint.sections.flatMap((section) => section.groups.flatMap((group) => group.tasks)).filter((task) => task.responseType === "single_choice");
    expect(choices.every((task) => task.options?.length === 3)).toBe(true);
    const positions = new Set(choices.map((task) => task.correctAnswer));
    expect(positions.size).toBe(3);
  });

  it("gói học viên không chứa key, mã bằng chứng hay script", () => {
    const student = studentPackageOf(blueprint);
    const serialized = JSON.stringify(student);
    expect(serialized).not.toContain("correctAnswer");
    expect(serialized).not.toContain("evidenceCodes");
    expect(serialized).not.toContain("graderPackage");
    expect(blueprint.graderPackage.keys).toHaveLength(50);
    expect(blueprint.graderPackage.scripts).toHaveLength(2);
  });

  it("A2 dùng hướng dẫn tiếng Việt, B1+ dùng tiếng Anh", () => {
    const a2 = buildMonthlyExamBlueprint({ framework: buildSampleFramework("A2"), month: "2026-11", examDate: "2026-11-30", lessonCount: 20 });
    expect(a2.sections[0]!.title).toBe("Nghe");
    expect(blueprint.sections[0]!.title).toBe("Listening");
    expect(validateMonthlyExamBlueprint(a2, buildSampleFramework("A2")).filter((check) => check.code !== "GEN20").every((check) => check.passed)).toBe(true);
  });
});
