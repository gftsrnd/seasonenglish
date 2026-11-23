# GĐ1: Lịch khoá học (chỉ máy chủ) — kế hoạch chi tiết

> **Cập nhật mới nhất, 23/11/2026. Các điểm dưới đây thay cho mọi chỗ khác trong file:**
> - **Lên mức chỉ còn 3 điều kiện**, xét ở cuối khoá:
>   - hoàn thành ≥ 90% bài;
>   - điểm thực hành tuần trung bình ≥ 75;
>   - bài cuối kỳ ≥ 80.
>
>   Hạ mức không tự động. Khi học viên trượt bài cuối kỳ 2 khoá liền, hệ thống gợi ý để Vận hành xem xét. Cài đặt chỉ còn 4 số: `lessonsPct = 90`, `practiceAvg = 75`, `finalScore = 80`, `demoteFailedFinals = 2`. Bỏ 7 ngưỡng cũ.
> - **Khoá đang chạy** chỉ được kéo dài từ 2 lên 4 tuần, không được rút ngắn.
> - **Không có tuần nghỉ.** Khoá sau luôn bắt đầu vào thứ Hai ngay sau khoá trước. Nhân sự không dời được ngày bắt đầu, chỉ đổi được số tuần và chủ đề lớn của khoá sau. Bỏ trạng thái `awaiting_next_cycle`.
> - **Giao diện đã chốt:**
>   - **Sinh bài:** trên cùng là bộ chọn khoá (Khoá trước, Khoá này, Khoá sau), giống tab tháng hiện tại. Bên dưới là tab theo tuần. Mỗi tuần có thẻ chủ đề sửa tại chỗ, kèm ma trận cột mức × dòng T2–T6. Không lồng thêm tab nào khác.
>   - **Trang chủ học viên:** lộ trình 5 dòng dọc. 4 ô số liệu: Bài tuần này, Chuỗi ngày, Điểm thực hành tuần, Điểm & huy hiệu.
>   - **Bài tuần:** gộp vào 1 trang gồm thực hành tuần này, bài cuối kỳ và các tuần trước.
>   - **Cài đặt:** thẻ Khoá học chia 2 cột (Khoá đang học, Khoá tiếp theo).
>   - **Theo dõi:** có bộ chọn khoá.
> - **4175:** để sau, làm xong trên 4300 trước. Kế hoạch dành cho người dùng duyệt nằm ở `E4S/KE-HOACH-KHOA-HOC-THEO-TUAN.md`.

> **Dành cho agent thực thi:** BẮT BUỘC dùng superpowers:subagent-driven-development hoặc superpowers:executing-plans. Các bước dùng checkbox (`- [ ]`).

**Goal:** máy chủ biết một khoá học đang ở tuần nào và đang ở trạng thái nào. Máy chủ tự tạo khoá kế tiếp, báo cho nhân sự trước khi khoá cũ kết thúc 1 tuần, rồi tự chuyển sang khoá mới đúng hạn. Giai đoạn này không đổi giao diện.

**Architecture:**
- **Dùng lại bảng `programs` đang có**, không tạo bảng mới. Bảng này đã có `start_date`, `week_count`, `status` (draft/active/completed). Ghi danh học viên đi qua `enrollments.program_id`; chủ đề tuần nằm ở `program_weeks`. Từ nay một dòng `programs` là một **Khoá học**.
- **Luật lịch là hàm thuần** trong `packages/domain/src/course/`.
- **Việc theo ngày** (tạo khoá nháp, gửi thông báo, chuyển khoá) chạy trong vòng quét nửa đêm có sẵn ở `apps/api/src/server.ts`. Hàm này cũng chạy mỗi khi đổi "Ngày thử".

**Tech Stack:** TypeScript, Vitest, PostgreSQL (migration SQL), Fastify, zod.

**Spec:** `docs/superpowers/plans/2026-11-23-weekly-prototype-revert.md`, mục GĐ1 và các quyết định D1, D2, D2b, D2c, D2d, D2e, D2f.

## Global Constraints

- **Số tuần:** khoá chỉ dài **2 hoặc 4 tuần**. Ngày bắt đầu luôn là **thứ Hai**.
- **Ngày "hôm nay"** luôn lấy từ `organization_system_date(org)`, tức đã tính "Ngày thử". **Không dùng `current_date`.**
  - Code hiện tại dùng `current_date` ở `repositories.ts`, trong `saveSettings` (dòng `date_trunc('week', current_date)`). Đây là lỗi, sửa trong Task 1.4.
- **Bỏ "Ép tuần"** (D1): tuần hiện tại chỉ tính từ ngày.
  - Cột `programs.current_week_override` vẫn giữ trong bảng, nhưng không còn được đọc.
  - Trường `weekOverride` gửi lên vẫn được nhận để client cũ không lỗi, nhưng bị bỏ qua.
- **Tên trường API giữ nguyên** (`pilotStartDate`, `pilotWeeks`, `pilotCycle`…) để không phải sửa dây chuyền. Chữ "Khoá học" chỉ đổi trên giao diện ở GĐ9.
- **Không xoá cột, không xoá bảng.** Mọi ràng buộc mới đều thêm với `not valid`, để dữ liệu cũ (ví dụ khoá 3 tuần) không làm migration lỗi.
- **Chỉ làm trên 4300.** Commit với `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

Những chỗ dễ sai nhất. Mỗi dòng đều có test riêng ở task tương ứng.

1. **Ngày thử nhảy lùi về trước khi khoá bắt đầu.** Trạng thái phải là `not_started`, tuần trả về 0, không gửi thông báo, không tạo khoá nháp. (Task 1.1, 1.5)
2. **Vòng quét chạy hai lần trong một ngày, hoặc chạy lại sau khi đổi Ngày thử.** Thông báo "sắp hết khoá" chỉ được gửi đúng 1 lần, khoá nháp chỉ được tạo đúng 1 lần. (Task 1.5)
3. **Ngày thử nhảy vọt qua nhiều khoá**, ví dụ từ tuần 1 sang 10 tuần sau. Vòng quét phải chuyển khoá lần lượt cho tới khoá chứa "hôm nay". Không được để lại hai khoá cùng ở trạng thái `active`. (Task 1.5)
4. **Quản lý dời ngày bắt đầu của khoá nháp ra xa hơn**, tạo ra tuần nghỉ giữa hai khoá. Trong những ngày nghỉ đó, trạng thái là `awaiting_next_cycle` và không có tuần học nào. (Task 1.5, 1.6)
5. **Khoá bắt đầu sát cuối quý**, ví dụ 30/3. Quý của khoá là quý chứa ngày bắt đầu, nên cả 4 tuần thuộc Q1. (Task 1.1)

---

### Task 1.1: Hàm lịch khoá học

**Files:**
- Create: `packages/domain/src/course/calendar.ts`, `packages/domain/src/course/index.ts`
- Modify: `packages/domain/src/index.ts`, thêm `export * from "./course/index.js";`
- Test: `packages/domain/test/course-calendar.test.ts`

**Interfaces (Produces):**
```ts
export type CourseWeeks = 2 | 4;
export type CourseStatus = "not_started" | "in_progress" | "last_week" | "ended";
export function isCourseWeeks(value: number): value is CourseWeeks;
export function courseEndDate(startDate: string, weeks: CourseWeeks): string;          // Sunday of the last week
export function nextCourseStartDate(startDate: string, weeks: CourseWeeks): string;    // Monday after the end
export function courseWeek(startDate: string, weeks: CourseWeeks, today: string): number; // 0 before start, 1..weeks, weeks + 1 after
export function courseStatus(startDate: string, weeks: CourseWeeks, today: string): CourseStatus;
export function courseWeekStart(startDate: string, week: number): string;              // Monday of week N (powers "Jump to week N")
export function courseLessonDate(startDate: string, week: number, day: 1 | 2 | 3 | 4 | 5): string; // day 1 = Monday
export function courseEndingNoticeDate(startDate: string, weeks: CourseWeeks): string; // Monday of the last week
export function courseQuarter(startDate: string): string;                              // "2026-Q1"
export function courseBlocks(weeks: CourseWeeks): Array<{ block: number; weeks: [number, number] }>;
```
Mọi ngày đều là chuỗi `YYYY-MM-DD`, tính theo UTC, không có giờ.

- [ ] **Step 1: Viết test (FAIL)**
  ```ts
  describe("course calendar", () => {
    const start = "2026-12-07"; // Monday
    it("rejects lengths other than 2 and 4", () => { expect(isCourseWeeks(3)).toBe(false); expect(isCourseWeeks(4)).toBe(true); });
    it("computes the end, the next start and the ending notice", () => {
      expect(courseEndDate(start, 2)).toBe("2026-12-20");
      expect(nextCourseStartDate(start, 2)).toBe("2026-12-21");
      expect(courseEndingNoticeDate(start, 2)).toBe("2026-12-14");
      expect(courseEndingNoticeDate(start, 4)).toBe("2026-12-28");
    });
    it("numbers weeks and reports status around the edges", () => {
      expect(courseWeek(start, 2, "2026-12-06")).toBe(0);
      expect(courseStatus(start, 2, "2026-12-06")).toBe("not_started");
      expect(courseWeek(start, 2, "2026-12-07")).toBe(1);
      expect(courseStatus(start, 2, "2026-12-13")).toBe("in_progress");
      expect(courseStatus(start, 2, "2026-12-14")).toBe("last_week");
      expect(courseStatus(start, 2, "2026-12-20")).toBe("last_week");
      expect(courseWeek(start, 2, "2026-12-21")).toBe(3);
      expect(courseStatus(start, 2, "2026-12-21")).toBe("ended");
    });
    it("gives Monday of a week and the date of a lesson day", () => {
      expect(courseWeekStart(start, 3)).toBe("2026-12-21");
      expect(courseLessonDate(start, 2, 5)).toBe("2026-12-18");
    });
    it("puts a course that crosses a quarter boundary in the quarter of its start", () => {
      expect(courseQuarter("2026-03-30")).toBe("2026-Q1");
      expect(courseQuarter("2026-04-06")).toBe("2026-Q2");
    });
    it("splits a course into two-week blocks", () => {
      expect(courseBlocks(2)).toEqual([{ block: 1, weeks: [1, 2] }]);
      expect(courseBlocks(4)).toEqual([{ block: 1, weeks: [1, 2] }, { block: 2, weeks: [3, 4] }]);
    });
  });
  ```
- [ ] **Step 2:** `pnpm exec vitest run packages/domain/test/course-calendar.test.ts` → kỳ vọng FAIL, vì module chưa tồn tại.
- [ ] **Step 3: Viết các hàm.** Cộng ngày bằng `Date.UTC`. Không dùng thư viện ngày tháng.
- [ ] **Step 4:** chạy lại → kỳ vọng PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/domain/src/course packages/domain/src/index.ts packages/domain/test/course-calendar.test.ts
  git commit -m "Course calendar: weeks, status, end, next start, ending notice, quarter, blocks"
  ```

### Task 1.2: Migration khoá học

**Files:**
- Create: `packages/database/migrations/0131_course_cycle.sql`
- Test: `packages/database/test/course-cycle.integration.test.ts` (tạo file mới; Task 1.5 viết tiếp vào cùng file)

**Interfaces (Produces):**
- Cột `programs.ending_notice_sent_at timestamptz`, giá trị null nghĩa là chưa báo.
- Ràng buộc `programs_course_weeks_two_or_four check (week_count in (2, 4)) not valid`.
- Ràng buộc `programs_course_starts_monday check (extract(isodow from start_date) = 1) not valid`.
- Unique index một phần `programs_one_draft_per_org on programs (organization_id) where status = 'draft'`.
- Unique index một phần `programs_one_active_per_org on programs (organization_id) where status = 'active'`.
  - Trước khi tạo index này, migration chuyển các khoá `active` thừa sang `completed`, chỉ giữ lại khoá có `start_date` mới nhất.

- [ ] **Step 1: Viết test (FAIL)**
  ```ts
  it("rejects a new course of three weeks or one that starts on a Tuesday", async () => {
    await expect(insertProgram({ weeks: 3, start: "2026-12-07" })).rejects.toThrow(/programs_course_weeks_two_or_four/);
    await expect(insertProgram({ weeks: 2, start: "2026-12-08" })).rejects.toThrow(/programs_course_starts_monday/);
  });
  it("allows one active and one draft course per organisation", async () => {
    await insertProgram({ weeks: 2, start: "2026-12-07", status: "active" });
    await expect(insertProgram({ weeks: 2, start: "2026-12-21", status: "active" })).rejects.toThrow(/programs_one_active_per_org/);
    await insertProgram({ weeks: 2, start: "2026-12-21", status: "draft" });
    await expect(insertProgram({ weeks: 4, start: "2027-01-04", status: "draft" })).rejects.toThrow(/programs_one_draft_per_org/);
  });
  ```
  `insertProgram` là helper trong test, insert vào `programs` của tổ chức test.
- [ ] **Step 2:** chạy test với `TEST_DATABASE_URL` của Postgres test → kỳ vọng FAIL.
- [ ] **Step 3:** viết migration.
- [ ] **Step 4:** chạy lại → kỳ vọng PASS. Chạy thêm `pnpm exec vitest run packages/database` để chắc test cũ không hỏng.
- [ ] **Step 5: Commit** — `"Course cycle migration: 2 or 4 weeks, Monday start, one active and one draft, ending notice flag"`.

### Task 1.3: Ngưỡng lên và hạ mức trong cài đặt

**Files:**
- Modify: `apps/api/src/modules/manager/routes.ts` (`managerSettingsInput`)
- Modify: `packages/contracts/src/manager-contract.ts` (`ManagerSettingsView`)
- Modify: `packages/database/src/repositories.ts` (mặc định ~12067, phần đọc ~12088, `saveSettings` 14185)
- Test: `apps/api/test/manager-settings-level-up.integration.test.ts`

**Interfaces (Produces):**
```ts
export interface LevelUpThresholds {
  readonly lessons: number;    // % lessons done, default 90
  readonly firstTry: number;   // % parts right first time, default 75
  readonly submission: number; // latest weekly practice /100, default 80
  readonly coach: number;      // Season rubric average /5, default 4
  readonly coachTurns: number; // minimum chat turns, default 6
  readonly wrong: number;      // demotion: % wrong parts above, default 30
  readonly minParts: number;   // demotion: minimum parts per week, default 4
}
// ManagerSettingsView gains: readonly levelUp: LevelUpThresholds;
```

**Kiểm tra đầu vào (zod):**
- `lessons`, `firstTry`, `wrong`: số nguyên 0–100.
- `submission`: số nguyên 0–100.
- `coach`: số 0–5, bước 0.5.
- `coachTurns`: số nguyên 1–50.
- `minParts`: số nguyên 1–30.
- `levelUp` là trường tuỳ chọn khi gửi lên: thiếu thì giữ giá trị đã lưu.
- Lưu vào `organization_settings.configuration.levelUp`.
- Bỏ dòng ghi chú cũ "levelUp … is no longer accepted".

- [ ] **Step 1: Viết test (FAIL).** Kiểm 3 điều:
  - GET `/api/v1/manager/settings` trả về `levelUp` bằng giá trị mặc định ở trên;
  - PUT với `levelUp.lessons = 85` thì GET lại thấy `85`;
  - PUT với `levelUp.coach = 6` thì trả về 400 `MANAGER_SETTINGS_INVALID`. Nếu route đang dùng mã lỗi khác, viết test theo đúng mã lỗi đang có.
- [ ] **Step 2:** chạy → kỳ vọng FAIL.
- [ ] **Step 3:** viết code.
- [ ] **Step 4:** chạy lại → kỳ vọng PASS.
- [ ] **Step 5: Commit** — `"Settings: level-up and demotion thresholds, manager-editable"`.

### Task 1.4: Lưu cài đặt khoá học theo luật mới

**Files:**
- Modify: `apps/api/src/modules/manager/routes.ts`
  - `pilotWeeks` chỉ nhận `2 | 4`;
  - `weekOverride` vẫn nhận nhưng bị bỏ qua.
- Modify: `packages/database/src/repositories.ts`, hàm `saveSettings` (14185–14260).
- Test: `apps/api/test/manager-settings-course.integration.test.ts`

**Luật:**
- **Khoá đang chạy** (đã tới `start_date`): không đổi được số tuần, cả tăng lẫn giảm. Trả lỗi `409 COURSE_WEEKS_LOCKED`.
  - Thay luật cũ `PILOT_WEEKS_CANNOT_DECREASE` và bỏ nhánh cho phép kéo dài thêm tuần.
- **Khoá nháp kế tiếp** (`status = 'draft'`): sửa được `pilotWeeks`, `courseTheme` và `pilotStartDate`.
  - `pilotStartDate` phải là thứ Hai và không sớm hơn `nextCourseStartDate` của khoá đang chạy. Sai thì trả `400 COURSE_START_INVALID`.
- **Khoá chưa bắt đầu và chưa có bộ bài nào được duyệt:** sửa được số tuần và ngày bắt đầu.
  - Nếu đã có bộ bài được duyệt thì trả `409 COURSE_WEEKS_LOCKED`.
- **Bỏ nhánh "tạo chu kỳ mới khi bấm Lưu"** (`pilotCycleAction`). Việc tạo khoá mới chuyển sang Task 1.5.
  - Trường `pilotCycleAction` vẫn nhận nhưng bị bỏ qua.
- **Mọi chỗ cần "hôm nay"** đều dùng `organization_system_date`. Không dùng `current_date`.
- **Không còn ghi** `current_week_override`.

**Interfaces (Produces):** `ManagerSettingsView.pilotCycle` có thêm các trường sau:
```ts
readonly status: CourseStatus | "awaiting_next_cycle";
readonly weekStarts: readonly string[];           // Monday of each week, for "Jump to week N"
readonly next?: { readonly startDate: string; readonly weeks: CourseWeeks; readonly theme: string };
```

- [ ] **Step 1: Viết test (FAIL), gồm 5 tình huống:**
  - khoá đang chạy, đổi tuần 2 → 4 thì trả 409 `COURSE_WEEKS_LOCKED`;
  - đã có khoá nháp, đổi tuần của khoá nháp từ 2 → 4 thì thành công, và khoá đang chạy vẫn giữ 2 tuần;
  - đặt ngày bắt đầu khoá nháp vào thứ Ba thì trả 400 `COURSE_START_INVALID`;
  - `pilotWeeks = 3` thì trả 400;
  - gửi `weekOverride = 2` thì tuần hiện tại vẫn tính theo ngày.
- [ ] **Step 2:** chạy → kỳ vọng FAIL.
- [ ] **Step 3:** viết code. Dùng `courseStatus`, `nextCourseStartDate` và `courseWeekStart` ở Task 1.1.
- [ ] **Step 4:** chạy lại → kỳ vọng PASS. Chạy cả `apps/api/test/manager*.test.ts` để chắc không vỡ test cũ. Test nào cũ khẳng định luật kéo dài khoá thì cập nhật theo luật mới và ghi lý do vào commit.
- [ ] **Step 5: Commit** — `"Course settings: locked weeks once started, editable next course, system date everywhere"`.

### Task 1.5: Vòng quét chuyển khoá và thông báo trước 1 tuần

**Files:**
- Create: `packages/database/src/course-cycle.ts`
- Modify: `packages/database/src/index.ts` (export)
- Modify: `apps/api/src/server.ts`: gọi trong `scheduleInactivitySweep` và trong lần chạy lúc khởi động.
- Modify: chỗ đang gọi `syncStaffDateNotices` sau khi lưu Ngày thử: gọi thêm `rolloverCourses`.
- Test: `packages/database/test/course-cycle.integration.test.ts`

**Interfaces (Produces):**
```ts
export interface CourseRolloverResult { readonly organizationId: string; readonly noticesSent: number; readonly draftsCreated: number; readonly activated: number; readonly completed: number }
export async function rolloverCourses(db: Pool | PoolClient, scope?: { organizationId?: string }): Promise<CourseRolloverResult[]>;
```

**Luật cho mỗi tổ chức** (chạy trong 1 transaction, khoá `for update` các dòng `programs` của tổ chức):
1. Gọi `today = organization_system_date(org)`. Gọi khoá `active` là `A`.
2. Nếu `today ≥ courseEndingNoticeDate(A)` và `A.ending_notice_sent_at is null`:
   - Nếu chưa có khoá nháp, tạo khoá `draft` với `start_date = nextCourseStartDate(A)`, `week_count = A.week_count`, `name = A.name`. Chủ đề lớn được sao chép trong cài đặt.
   - Gửi thông báo cho vai trò `manager` và `operator` qua `notify_inbox(org, role, null, 'course-ending:' || A.id, 'course_ending', A.id)`, nội dung có ngày kết thúc và ngày bắt đầu khoá sau.
   - Đặt `A.ending_notice_sent_at = now()`.
3. Nếu `today > courseEndDate(A)`: chuyển `A` sang `completed`.
   - Nếu có khoá nháp `D` và `D.start_date ≤ today`: chuyển `D` sang `active`.
     - Sao chép `enrollments` và `content_lesson_level_settings` từ `A` sang `D`, như nhánh cũ trong `saveSettings`.
     - Ghi audit `course.started`.
   - Nếu `D` chưa tới ngày bắt đầu: không có khoá `active`. Trạng thái tổ chức là `awaiting_next_cycle`.
4. Nếu không có khoá `active` mà khoá nháp đã tới ngày, kích hoạt khoá nháp như bước 3.
5. Lặp lại bước 1–4 cho tới khi không còn gì thay đổi, tối đa 60 vòng. Mục đích là xử lý trường hợp Ngày thử nhảy vọt qua nhiều khoá.
   - Những khoá được tạo tự động trong lúc nhảy vọt vẫn đi đủ chu trình: thành nháp, rồi active, rồi completed.

- [ ] **Step 1: Viết test (FAIL), gồm 6 tình huống:**
  - **Trước ngày báo:** chạy với ngày thử `2026-12-13` (khoá 2 tuần, bắt đầu 07/12). Kết quả: không có thông báo, không có khoá nháp.
  - **Đúng ngày báo:** chạy với ngày thử `2026-12-14`, mỗi vai trò nhận 1 thông báo `course_ending`, có 1 khoá nháp bắt đầu `2026-12-21`. Chạy thêm lần nữa trong cùng ngày thì vẫn chỉ có 1 thông báo và 1 khoá nháp.
  - **Chuyển khoá:** chạy với ngày thử `2026-12-21`. Khoá cũ thành `completed`, khoá nháp thành `active`, học viên đã được sao sang khoá mới, và chỉ có 1 khoá `active`.
  - **Có tuần nghỉ:** dời ngày bắt đầu khoá nháp sang `2027-01-04` rồi chạy với `2026-12-21`. Không có khoá `active`, trạng thái là `awaiting_next_cycle`. Chạy với `2027-01-04` thì khoá nháp thành `active`.
  - **Nhảy vọt:** từ khoá bắt đầu 07/12, chạy với `2027-02-15`. Chỉ có đúng 1 khoá `active`, và khoá đó chứa ngày `2027-02-15`.
  - **Lùi ngày:** đặt ngày thử về trước `start_date`. Không tạo gì mới, không gửi thông báo.
- [ ] **Step 2:** chạy → kỳ vọng FAIL.
- [ ] **Step 3:** viết code. Logic tính ngày dùng các hàm ở Task 1.1; SQL chỉ đọc và ghi.
- [ ] **Step 4:** chạy lại → kỳ vọng PASS.
- [ ] **Step 5: Commit** — `"Course rollover: draft the next course, notify staff a week before the end, start it on time"`.

### Task 1.6: Học viên biết mình đang ở khoá nào, tuần nào

**Files:**
- Modify: `packages/database/src/repositories.ts`, câu truy vấn ngữ cảnh tuần (~870–900):
  - bỏ `current_week_override`;
  - trả thêm `endDate`, `status`, `quarter`.
- Modify: `packages/contracts/src/learning-contract.ts`: thêm `course?: LearnerCourseView` vào view trang chủ. Giữ `pilotPhase` đến GĐ4, khi đó mới xoá.
- Modify: `apps/api/src/modules/learning/routes.ts` (handler trang chủ): điền `course`.
- Test: `apps/api/test/learner-course-view.integration.test.ts`

**Interfaces (Produces):**
```ts
export interface LearnerCourseView {
  readonly number: number;       // course cycle number
  readonly week: number;         // 1..weeks while running
  readonly weeks: CourseWeeks;
  readonly status: CourseStatus | "awaiting_next_cycle";
  readonly startDate: string; readonly endDate: string; readonly weekStart: string;
  readonly isLastWeek: boolean;
  readonly theme: string;        // course big theme from settings
  readonly weekTopic: string;    // program_weeks.topic of the current week, "" if missing
}
```

- [ ] **Step 1: Viết test (FAIL), gồm 4 tình huống:**
  - Học viên đã duyệt mức, ngày thử là `2026-12-15`, khoá 2 tuần bắt đầu 07/12: `course.week = 2`, `isLastWeek = true`, `status = "last_week"`.
  - Có `current_week_override = 1` trong DB: vẫn trả `week = 2`.
  - Đang ở tuần nghỉ giữa hai khoá: `status = "awaiting_next_cycle"` và không có `weekStart`.
  - Học viên chưa duyệt mức: không có trường `course`.
- [ ] **Step 2:** chạy → kỳ vọng FAIL.
- [ ] **Step 3:** viết code.
- [ ] **Step 4:** chạy lại → kỳ vọng PASS. Chạy toàn bộ:
  ```
  pnpm exec tsc -b
  pnpm exec vitest run
  ```
- [ ] **Step 5: Commit** — `"Learner home: current course, week, status and week topic"`.

### Task 1.7: Đẩy code, chờ CI, deploy 4300

- [ ] `git push origin HEAD:codex/integrate-1118 HEAD:codex/deploy-web-fallback`.
- [ ] Theo dõi CI bằng `gh run list -L 2`, sau đó `gh run watch <id> --exit-status` cho cả 2 run. Kỳ vọng cả 2 đều `success`.
- [ ] Deploy 4300:
  ```powershell
  scripts/ops/e4s.ps1 -EnvFile ..\deploy-web-fallback-worktree\.env -Env sandbox -Action deploy -SkipBackup -Yes
  ```
- [ ] **Kiểm thử bằng API trên 4300, không đổi giao diện:**
  1. Đặt Ngày thử vào thứ Hai tuần cuối của khoá đang chạy.
  2. Kiểm chuông của tài khoản Quản lý có 1 thông báo "sắp hết khoá".
  3. Đặt Ngày thử sang ngày sau khi khoá kết thúc.
  4. Kiểm khoá mới đã thành `active`.
  5. Trả Ngày thử về để trống.
- [ ] Báo lại người dùng: những gì đã chạy, những gì chưa kiểm.

## Ngoài phạm vi GĐ1 (để giai đoạn sau)

- Giao diện thẻ "Khoá học" và nút "Nhảy tới tuần N" ở Cài đặt (GĐ9, cần duyệt giao diện).
- Bỏ `testTimed` và `testTimes` khỏi cài đặt (GĐ9).
- Bỏ khoá tài khoản do vắng: `lockInactiveLearners` vẫn chạy cho tới GĐ4.
- Nội dung tuần, khối ngữ pháp và phát âm, từ cấm theo quý (GĐ2).
