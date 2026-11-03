import { describe, expect, it } from "vitest";
import { assessmentAudioReadiness, monthlyFinalReleaseReadiness, passCourseReadiness } from "../src/assessment/exam-spec.js";

const validMonthly = {
  key: "monthly-final-2026-11-a1",
  kind: "final" as const,
  title: "Bài thi tháng 11/2026",
  version: 1,
  totalMinutes: 30,
  totalScore: 100,
  sections: [
    { code: "listening" as const, title: "Nghe", durationMinutes: 8, maxScore: 25, instructions: ["Nghe"], groups: [{ key: "L", title: "Nghe", instruction: "Nghe", maxPlays: 2, stimulus: { type: "audio_script" as const, audioSrc: "/audio/month.mp3", lines: [{ speaker: "A", text: "Hello" }] }, tasks: [] }] },
    { code: "reading" as const, title: "Đọc", durationMinutes: 8, maxScore: 25, instructions: ["Đọc"], groups: [{ key: "R", title: "Đọc", instruction: "Đọc", tasks: [] }] },
    { code: "writing" as const, title: "Viết", durationMinutes: 7, maxScore: 25, instructions: ["Viết"], groups: [{ key: "W", title: "Viết", instruction: "Viết", tasks: [] }] },
    { code: "speaking" as const, title: "Nói", durationMinutes: 7, maxScore: 25, instructions: ["Nói"], groups: [{ key: "S", title: "Nói", instruction: "Nói", tasks: [] }] }
  ]
};

describe("assessment release specifications", () => {
  it("accepts the fixed 30-minute / 100-point monthly final only when every skill is worth 25", () => {
    expect(monthlyFinalReleaseReadiness(validMonthly)).toEqual([]);
    expect(monthlyFinalReleaseReadiness({ ...validMonthly, totalMinutes: 75 })).toContain("MONTHLY_FINAL_DURATION_INVALID");
    expect(monthlyFinalReleaseReadiness({ ...validMonthly, sections: validMonthly.sections.map((section, index) => index === 0 ? { ...section, maxScore: 20 } : section) })).toContain("MONTHLY_FINAL_SECTION_SCORE_INVALID");
  });

  it("requires a listening script and a stored/playable audio source before release", () => {
    const missingSource = structuredClone(validMonthly);
    delete ((missingSource.sections[0]!.groups[0]! as { stimulus?: { audioSrc?: string } }).stimulus as { audioSrc?: string }).audioSrc;
    expect(assessmentAudioReadiness(missingSource)).toEqual(["LISTENING_AUDIO_SOURCE_MISSING"]);

    const missingScript = structuredClone(validMonthly);
    ((missingScript.sections[0]!.groups[0]! as { stimulus?: { lines?: unknown[] } }).stimulus as { lines?: unknown[] }).lines = [];
    expect(assessmentAudioReadiness(missingScript)).toEqual(["LISTENING_AUDIO_SCRIPT_MISSING"]);
  });

  it("defines Pass Course Form A as a C1-only 90-minute four-skill 100-point exam", () => {
    expect(passCourseReadiness({ eligibleCefr: "C1", totalMinutes: 90, totalScore: 100, sections: 4 })).toEqual([]);
    expect(passCourseReadiness({ eligibleCefr: "B2", totalMinutes: 90, totalScore: 100, sections: 4 })).toContain("PASS_COURSE_C1_REQUIRED");
    expect(passCourseReadiness({ eligibleCefr: "C1", totalMinutes: 60, totalScore: 80, sections: 3 })).toEqual(expect.arrayContaining(["PASS_COURSE_DURATION_INVALID", "PASS_COURSE_SCORE_INVALID", "PASS_COURSE_FOUR_SKILLS_REQUIRED"]));
  });
});
