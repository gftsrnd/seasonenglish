import { describe, expect, it } from "vitest";
import {
  buildAttendanceReport,
  buildExamWindow,
  buildMonthlyCalendar,
  consecutiveAbsentStudyDays,
  createFixedClock,
  createOffsetClock,
  examAccessAt,
  examAppealAutoApproved,
  fakeClockAllowed,
  isLessonLearnable,
  isMonthOutsideRetention,
  lessonDate,
  maxAbsencesFor,
  nextLearnableLesson,
  operatorVisibleMonths,
  placeNewcomer,
  shouldLockForAbsence,
  validateMonthFrameworkSettings
} from "../src/calendar/index.js";

// Thời điểm theo giờ Việt Nam (UTC+7).
const vn = (date: string, time = "10:00") => new Date(`${date}T${time}:00+07:00`);

describe("monthly calendar", () => {
  it("tháng 10/2026 thi Thứ Sáu 30/10", () => {
    expect(buildMonthlyCalendar("2026-10").examDate).toBe("2026-10-30");
  });

  it("tháng 11/2026: 21 ngày học, thi 30/11, 20 bài, vắng tối đa 6", () => {
    const calendar = buildMonthlyCalendar("2026-11");
    expect(calendar.studyDays).toHaveLength(21);
    expect(calendar.examDate).toBe("2026-11-30");
    expect(calendar.lessonCount).toBe(20);
    expect(calendar.effectiveDayCount).toBe(20);
    expect(calendar.maxAbsences).toBe(6);
    expect(calendar.studyDays.every((day) => ![0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay()))).toBe(true);
    expect(lessonDate(calendar, 1)).toBe("2026-11-02");
    expect(lessonDate(calendar, 20)).toBe("2026-11-27");
    expect(lessonDate(calendar, 21)).toBeNull();
  });

  it("tháng 12/2026: 23 ngày học, thi 31/12, 22 bài, vắng tối đa 6", () => {
    const calendar = buildMonthlyCalendar("2026-12");
    expect(calendar.studyDays).toHaveLength(23);
    expect(calendar.examDate).toBe("2026-12-31");
    expect(calendar.lessonCount).toBe(22);
    expect(calendar.maxAbsences).toBe(6);
  });

  it("vắng tối đa làm tròn xuống", () => {
    expect(maxAbsencesFor(20)).toBe(6);
    expect(maxAbsencesFor(22)).toBe(6);
    expect(maxAbsencesFor(25)).toBe(7);
    expect(maxAbsencesFor(15)).toBe(4);
  });
});

describe("học tuần tự và mở bài theo ngày", () => {
  const calendar = buildMonthlyCalendar("2026-11");
  it("bài k chỉ mở từ ngày học thứ k và phải học bài trước", () => {
    expect(isLessonLearnable(calendar, 2, new Set(), "2026-11-03")).toBe(false);
    expect(isLessonLearnable(calendar, 2, new Set([1]), "2026-11-02")).toBe(false);
    expect(isLessonLearnable(calendar, 2, new Set([1]), "2026-11-03")).toBe(true);
    expect(nextLearnableLesson(calendar, new Set(), "2026-11-05")).toBe(1);
    expect(nextLearnableLesson(calendar, new Set([1, 2, 3]), "2026-11-04")).toBeNull();
  });
});

describe("điểm danh", () => {
  const calendar = buildMonthlyCalendar("2026-11");

  it("học bù 3 bài trong cùng một ngày vẫn là 1 ngày điểm danh", () => {
    const report = buildAttendanceReport({
      learnerEffectiveDays: calendar.effectiveDays,
      completedAt: [vn("2026-11-02", "08:00"), vn("2026-11-02", "09:00"), vn("2026-11-02", "10:00")],
      today: "2026-11-30"
    });
    expect(report.attendedDays).toBe(1);
    expect(report.absentDays).toBe(19);
    expect(report.eligible).toBe(false);
  });

  it("vắng đúng bằng vắng tối đa vẫn đủ điều kiện; hơn 1 ngày thì không", () => {
    const present = (count: number) => calendar.effectiveDays.slice(0, count).map((day) => vn(day));
    expect(buildAttendanceReport({ learnerEffectiveDays: calendar.effectiveDays, completedAt: present(14), today: "2026-11-30" }))
      .toMatchObject({ absentDays: 6, maxAbsences: 6, eligible: true });
    expect(buildAttendanceReport({ learnerEffectiveDays: calendar.effectiveDays, completedAt: present(13), today: "2026-11-30" }))
      .toMatchObject({ absentDays: 7, eligible: false });
  });

  it("ngày chưa qua không tính là vắng", () => {
    expect(buildAttendanceReport({ learnerEffectiveDays: calendar.effectiveDays, completedAt: [], today: "2026-11-02" }).absentDays).toBe(0);
  });

  it("5 ngày học liên tiếp vắng thì khoá, bỏ qua T7/CN", () => {
    const base = { attendedDates: new Set<string>(["2026-11-02"]), countFrom: "2026-11-02" };
    // Học 02/11; vắng 03–06/11 (4 ngày); tại 09/11 chuỗi là 4, tại 10/11 là 5 (có T2 09/11).
    expect(consecutiveAbsentStudyDays({ ...base, today: "2026-11-09" })).toBe(4);
    expect(shouldLockForAbsence(4)).toBe(false);
    expect(consecutiveAbsentStudyDays({ ...base, today: "2026-11-10" })).toBe(5);
    expect(shouldLockForAbsence(5)).toBe(true);
  });

  it("ngày thi không tính vào chuỗi vắng", () => {
    // Có mặt 24/11; vắng 25, 26, 27/11; 30/11 là ngày thi (bỏ qua); 01/12 vắng → tại 02/12 là 4.
    expect(consecutiveAbsentStudyDays({ today: "2026-12-02", attendedDates: new Set(["2026-11-24"]), countFrom: "2026-11-02" })).toBe(4);
  });
});

describe("cơ chế người mới (tháng 11/2026, 20 ngày hiệu lực)", () => {
  it("duyệt 02/11: 100% → học tháng 11, vắng tối đa 6", () => {
    expect(placeNewcomer(vn("2026-11-02"))).toMatchObject({ mode: "join_current_month", ratioPercent: 100, maxAbsences: 6, startLesson: 1 });
  });

  it("duyệt 09/11: 75% → học từ bài 1, vắng tối đa 4", () => {
    const placement = placeNewcomer(vn("2026-11-09"));
    expect(placement).toMatchObject({ mode: "join_current_month", ratioPercent: 75, maxAbsences: 4 });
    expect(placement.mode === "join_current_month" && placement.effectiveDays).toHaveLength(15);
  });

  it("duyệt 10/11: 70% → khoá tới tháng 12", () => {
    expect(placeNewcomer(vn("2026-11-10"))).toMatchObject({ mode: "wait_next_month", ratioPercent: 70, startsOn: "2026-12-01" });
  });

  it("duyệt 16/11: 50% → khoá tới tháng 12", () => {
    expect(placeNewcomer(vn("2026-11-16"))).toMatchObject({ mode: "wait_next_month", ratioPercent: 50, startsOn: "2026-12-01" });
  });

  it("duyệt Thứ Bảy 07/11 tính từ Thứ Hai 09/11 → 75% → học tháng 11", () => {
    expect(placeNewcomer(vn("2026-11-07"))).toMatchObject({ mode: "join_current_month", ratioPercent: 75 });
  });

  it("duyệt đúng ngày thi thì chờ tháng sau; duyệt cuối tuần trước đầu tháng tính theo tháng mới", () => {
    expect(placeNewcomer(vn("2026-11-30")).mode).toBe("wait_next_month");
    expect(placeNewcomer(vn("2026-10-31"))).toMatchObject({ mode: "join_current_month", month: "2026-11", ratioPercent: 100 });
  });

  it("dùng ngày theo giờ Việt Nam, không theo UTC", () => {
    // 20:00 UTC Chủ Nhật 08/11 = 03:00 Thứ Hai 09/11 giờ VN.
    expect(placeNewcomer(new Date("2026-11-08T20:00:00Z"))).toMatchObject({ mode: "join_current_month", ratioPercent: 75 });
  });
});

describe("bài thi tháng", () => {
  it("thời lượng 60 phút → mở 00:00, khoá 22:55", () => {
    const window = buildExamWindow("2026-11-30", 60);
    expect(window.opensAt.toISOString()).toBe("2026-11-29T17:00:00.000Z");
    expect(window.locksAt.toISOString()).toBe("2026-11-30T15:55:00.000Z");
    expect(examAccessAt(window, vn("2026-11-29", "23:59"))).toBe("not_open_yet");
    expect(examAccessAt(window, vn("2026-11-30", "00:00"))).toBe("open");
    expect(examAccessAt(window, vn("2026-11-30", "22:55"))).toBe("open");
    expect(examAccessAt(window, vn("2026-11-30", "22:56"))).toBe("locked");
  });

  it("khiếu nại tự cho thi sau 24 giờ", () => {
    const submitted = vn("2026-11-30", "09:00");
    expect(examAppealAutoApproved(submitted, vn("2026-12-01", "08:59"))).toBe(false);
    expect(examAppealAutoApproved(submitted, vn("2026-12-01", "09:00"))).toBe(true);
  });
});

describe("khung tháng và phạm vi 3 tháng", () => {
  it("N=60, Y=3, Z=4 hợp lệ cho tháng 11 (20 bài)", () => {
    expect(validateMonthFrameworkSettings({ vocabularyCount: 60, grammarTopicCount: 3, soundCount: 4 }, 20)).toEqual([]);
  });

  it("N phải < 90 và ≤ 3 × số bài", () => {
    expect(validateMonthFrameworkSettings({ vocabularyCount: 90, grammarTopicCount: 3, soundCount: 4 }, 30)).toHaveLength(1);
    expect(validateMonthFrameworkSettings({ vocabularyCount: 61, grammarTopicCount: 3, soundCount: 4 }, 20)).toHaveLength(1);
  });

  it("Vận hành thấy tháng trước, tháng này, tháng sau", () => {
    expect(operatorVisibleMonths("2026-12-15")).toEqual({ previous: "2026-11", current: "2026-12", next: "2027-01", editable: ["2026-12", "2027-01"] });
    expect(isMonthOutsideRetention("2026-09", "2026-11-10")).toBe(true);
    expect(isMonthOutsideRetention("2026-10", "2026-11-10")).toBe(false);
    expect(isMonthOutsideRetention("2027-01", "2026-12-31")).toBe(false);
    expect(isMonthOutsideRetention("2027-02", "2026-12-31")).toBe(true);
  });
});

describe("clock", () => {
  it("giờ cố định và giờ giả lập chạy tiếp", () => {
    expect(createFixedClock("2026-11-09T00:00:00Z").now().toISOString()).toBe("2026-11-09T00:00:00.000Z");
    const base = createFixedClock("2026-01-01T00:00:00Z");
    expect(createOffsetClock("2026-11-09T00:00:00Z", base).now().toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  it("giờ giả không bật được trên production nếu thiếu cờ", () => {
    expect(fakeClockAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(fakeClockAllowed({ NODE_ENV: "production", E4S_ALLOW_FAKE_CLOCK: "1" })).toBe(true);
    expect(fakeClockAllowed({ NODE_ENV: "development" })).toBe(true);
  });
});
