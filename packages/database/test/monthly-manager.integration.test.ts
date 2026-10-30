import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { DEMO_IDS, LearnerMonthlyRepository, MonthlyManagerRepository, migrateDatabase, resetPublicSchema, seedDemo } from "../src/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const vn = (date: string, time = "09:00") => new Date(`${date}T${time}:00+07:00`);

describe("monthly manager repository (khoá vắng, bỏ thi, khiếu nại)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const manager = new MonthlyManagerRepository(pool);
  const learner = new LearnerMonthlyRepository(pool);

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("update enrollments set cefr = 'A2', cefr_approved = true where learner_id = $1", [DEMO_IDS.learner]);
    } finally {
      client.release();
    }
  }, 60_000);

  afterAll(async () => {
    await pool.end();
  });

  it("kịch bản 6: vắng 5 ngày học liên tiếp thì khoá tài khoản; Quản lý mở lại", async () => {
    // Ghi danh tháng 11 từ 02/11 (duyệt mức 02/11 → 100%).
    await learner.placeLearner(DEMO_IDS.learner, "A2", vn("2026-11-02"), "placement");
    // Học 02/11 rồi vắng 03, 04, 05, 06, 09 → tại 10/11 chuỗi = 5.
    await pool.query("insert into learner_attendance_days (learner_id, attendance_date) values ($1, '2026-11-02')", [DEMO_IDS.learner]);
    const atFourAbsences = await manager.runDailyMaintenance(vn("2026-11-09"));
    expect(atFourAbsences.lockedForAbsence).toBe(0);
    const atFive = await manager.runDailyMaintenance(vn("2026-11-10"));
    expect(atFive.lockedForAbsence).toBe(1);
    const user = await pool.query<{ status: string }>("select status from users where id = $1", [DEMO_IDS.learner]);
    expect(user.rows[0]?.status).toBe("disabled");
    const view = await manager.managerView(DEMO_IDS.manager, vn("2026-11-10"));
    expect(view?.lockedAccounts).toHaveLength(1);
    expect(view?.lockedAccounts[0]).toMatchObject({ learnerId: DEMO_IDS.learner, reason: "consecutive_absence", unlockedAt: null });
    // Chạy lại không khoá trùng.
    expect((await manager.runDailyMaintenance(vn("2026-11-10"))).lockedForAbsence).toBe(0);

    await manager.unlockAccount(DEMO_IDS.manager, view!.lockedAccounts[0]!.id, "Đã trao đổi với học viên", vn("2026-11-10", "10:00"));
    const reopened = await pool.query<{ status: string }>("select status from users where id = $1", [DEMO_IDS.learner]);
    expect(reopened.rows[0]?.status).toBe("active");
    const audits = await pool.query<{ action: string }>("select action from audit_events where entity_id = $1 and action in ('account.locked', 'account.unlocked') order by created_at", [DEMO_IDS.learner]);
    expect(audits.rows.map((row) => row.action)).toEqual(["account.locked", "account.unlocked"]);
  });

  it("kịch bản 7: bỏ thi tháng 11 → khoá tháng 12; xin mở; Quản lý mở thì vào thẳng tháng 12, không tính xét lên mức", async () => {
    // Đề thi tháng 11 A2 đã duyệt (để việc bỏ thi có nghĩa).
    const organization = DEMO_IDS.organization;
    const programMonth = await pool.query<{ id: string }>("select id from program_months where organization_id = $1 and month = '2026-11'", [organization]);
    const monthId = programMonth.rows[0]!.id;
    const definitionId = randomUUID(); const versionId = randomUUID();
    await pool.query("insert into assessment_definitions (id, organization_id, assessment_key, kind, title) values ($1, $2, 'monthly-exam-2026-11-a2', 'monthly_exam', 'Bài thi tháng 11')", [definitionId, organization]);
    await pool.query("insert into assessment_versions (id, definition_id, version, status, blueprint, published_at) values ($1, $2, 1, 'published', '{}'::jsonb, now())", [versionId, definitionId]);
    await pool.query(
      `insert into month_frameworks (id, program_month_id, cefr, status, exam_assessment_version_id, exam_status) values ($1, $2, 'A2', 'approved', $3, 'approved')`,
      [randomUUID(), monthId, versionId]
    );

    // Trước ngày thi: chưa khoá gì.
    expect((await manager.runDailyMaintenance(vn("2026-11-27"))).lockedMissedExam).toBe(0);
    // 01/12 (sau ngày thi 30/11), không có lượt thi → khoá tháng 12.
    const result = await manager.runDailyMaintenance(vn("2026-12-01"));
    expect(result.lockedMissedExam).toBe(1);
    const december = await learner.monthView(DEMO_IDS.learner, vn("2026-12-01"));
    expect(december?.enrollment?.mode).toBe("locked_missed_exam");
    expect(december?.seasonOnly).toBe(true);
    expect(december?.seasonOnlyReason).toBe("locked_missed_exam");
    expect(december?.lessons).toHaveLength(0);

    await manager.createUnlockRequest(DEMO_IDS.learner, "Em đi công tác đột xuất tuần cuối tháng.", vn("2026-12-01", "10:00"));
    await expect(manager.createUnlockRequest(DEMO_IDS.learner, "lặp lại", vn("2026-12-01", "10:05"))).rejects.toThrow("MONTHLY_UNLOCK_EXISTS");
    let view = await manager.managerView(DEMO_IDS.manager, vn("2026-12-01", "11:00"));
    expect(view?.unlockRequests[0]).toMatchObject({ learnerId: DEMO_IDS.learner, status: "pending", missedMonth: "2026-11" });
    expect(view?.lockedMonthLearners.map((item) => item.learnerId)).toEqual([DEMO_IDS.learner]);

    await manager.decideUnlockRequest(DEMO_IDS.manager, view!.unlockRequests[0]!.id, "approved", "Đồng ý", vn("2026-12-02", "09:00"));
    const reopened = await learner.monthView(DEMO_IDS.learner, vn("2026-12-02", "09:30"));
    expect(reopened?.enrollment).toMatchObject({ mode: "unlocked_by_manager", countsForLevelUp: false, startsOn: "2026-12-02" });
    // Ngày hiệu lực còn lại từ 02/12 đến 30/12 (trừ ngày thi 31/12): 22 bài − 1 ngày đã qua = 21.
    expect(reopened?.enrollment?.effectiveDayCount).toBe(21);
    view = await manager.managerView(DEMO_IDS.manager, vn("2026-12-02", "10:00"));
    expect(view?.lockedMonthLearners).toHaveLength(0);
  });

  it("khiếu nại thi tháng quá 24 giờ được tự duyệt bởi job hằng ngày", async () => {
    const programMonth = await pool.query<{ id: string }>("select id from program_months where organization_id = $1 and month = '2026-11'", [DEMO_IDS.organization]);
    await pool.query(
      "insert into monthly_exam_appeals (id, learner_id, program_month_id, reason, status, deadline_at, created_at) values ($1, $2, $3, 'Nghỉ ốm có giấy', 'pending', $4, $5)",
      [randomUUID(), DEMO_IDS.learner, programMonth.rows[0]!.id, vn("2026-11-30", "09:00"), vn("2026-11-29", "09:00")]
    );
    expect((await manager.runDailyMaintenance(vn("2026-11-30", "08:00"))).autoApprovedAppeals).toBe(0);
    expect((await manager.runDailyMaintenance(vn("2026-11-30", "09:00"))).autoApprovedAppeals).toBe(1);
    const view = await manager.managerView(DEMO_IDS.manager, vn("2026-11-30", "09:30"));
    expect(view?.examAppeals[0]?.status).toBe("auto_approved");
  });
});
