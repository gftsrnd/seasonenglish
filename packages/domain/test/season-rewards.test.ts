import { describe, expect, it } from "vitest";
import {
  longestScheduledLessonStreak, nextRewardSeasonPoints, REWARD_BADGE_THRESHOLDS, REWARD_SEASONS, rewardBadgeDescription,
  rewardBadgeThreshold, rewardSeasonFor, rewardSeasonLabel
} from "../src/engagement/index.js";

const ALL = new Set(REWARD_SEASONS.flatMap((season) => season.badges));

describe("Season ladder per CEFR level", () => {
  it("has the same four Seasons at 0 / 500 / 2 000 / 5 000 points in the level", () => {
    expect(REWARD_SEASONS.map((season) => [season.key, season.pointsRequired, season.badges])).toEqual([
      ["spring", 0, []],
      ["summer", 500, ["starter", "streak"]],
      ["autumn", 2000, ["week_complete", "friday", "coach_friend"]],
      ["winter", 5000, ["first_try", "monthly_final_score", "wordsmith"]]
    ]);
    expect([0, 499, 500, 1999, 2000, 4999, 5000, 9000].map((points) => rewardSeasonFor(points, ALL).level))
      .toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect([0, 499, 500, 2000, 5000].map((points) => nextRewardSeasonPoints(points, ALL))).toEqual([500, 500, 2000, 5000, null]);
  });

  it("climbs strictly in order: Đông badges never skip a missing Hạ badge", () => {
    expect(rewardSeasonFor(9000, new Set(["starter", "week_complete", "friday", "coach_friend", "first_try", "monthly_final_score", "wordsmith"])).level).toBe(1);
    expect(rewardSeasonFor(9000, new Set(["starter", "streak", "first_try", "monthly_final_score", "wordsmith"])).level).toBe(2);
    expect(rewardSeasonLabel(rewardSeasonFor(2500, ALL), "B1")).toBe("Mùa thu · B1");
  });

  it("uses the thresholds of the learner's level", () => {
    expect((["A1", "A2", "B1", "B2", "C1"] as const).map((level) => [
      rewardBadgeThreshold("streak", level), rewardBadgeThreshold("week_complete", level), rewardBadgeThreshold("friday", level),
      rewardBadgeThreshold("coach_friend", level), rewardBadgeThreshold("wordsmith", level), rewardBadgeThreshold("first_try", level),
      rewardBadgeThreshold("monthly_final_score", level)
    ])).toEqual([
      [10, 3, 4, 20, 15, 1, "passed"],
      [10, 3, 4, 30, 20, 2, 75],
      [5, 2, 3, 50, 30, 3, 80],
      [5, 2, 3, 70, 40, 5, 85],
      [5, 2, 3, 100, 50, 5, 90]
    ]);
    expect(Object.values(REWARD_BADGE_THRESHOLDS.starter)).toEqual([1, 1, 1, 1, 1]);
    expect(rewardBadgeThreshold("coach_friend", null)).toBe(20);
    expect(rewardBadgeDescription("streak", "B1")).toMatch(/^Học 5 ngày liên tiếp$/);
    expect(rewardBadgeDescription("monthly_final_score", "A1")).toBe("Đạt một bài thi tháng");
    expect(rewardBadgeDescription("monthly_final_score", "C1")).toBe("Thi tháng đạt từ 90 điểm");
  });
});

describe("learning-day streak", () => {
  const day = (date: string, completedOnTime = true) => ({ date, completedOnTime });

  it("counts only scheduled lesson days completed on their day; weekends and empty days do not break it", () => {
    // Thu 05/11, Fri 06/11 (review), weekend, Mon 09/11 … no lesson on Wed 11/11, Thu 12/11.
    expect(longestScheduledLessonStreak([
      day("2026-11-05"), day("2026-11-06"), day("2026-11-09"), day("2026-11-10"), day("2026-11-12")
    ])).toBe(5);
  });

  it("breaks the run on a scheduled day whose lesson was not completed that day", () => {
    expect(longestScheduledLessonStreak([
      day("2026-11-02"), day("2026-11-03"), day("2026-11-04", false), day("2026-11-05"), day("2026-11-06")
    ])).toBe(2);
  });

  it("skips holidays, and does not judge today or later days yet", () => {
    const days = [day("2026-11-02"), day("2026-11-03", false), day("2026-11-04"), day("2026-11-05", false)];
    expect(longestScheduledLessonStreak(days)).toBe(1);
    expect(longestScheduledLessonStreak(days, { holidays: ["2026-11-03"] })).toBe(2);
    expect(longestScheduledLessonStreak(days, { holidays: ["2026-11-03"], today: "2026-11-05" })).toBe(2);
    expect(longestScheduledLessonStreak([day("2026-11-07"), day("2026-11-08")])).toBe(0);
  });

  it("counts a date once when two calendars schedule it (either completed on time is enough)", () => {
    expect(longestScheduledLessonStreak([day("2026-11-02", false), day("2026-11-02"), day("2026-11-03")])).toBe(2);
  });
});
