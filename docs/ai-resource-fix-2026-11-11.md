# Sửa tài nguyên tháng (R0 + R2) · 11/11/2026

Nguồn:
- [kế hoạch sửa](ai-quality-fix-plan-2026-11-11.md), mục R và mục "Quyết định của người dùng" (D7: ghi đè cả tháng 11/2026);
- [báo cáo đo lại](ai-quality-remeasure-2026-11-11.md).

Stack: 4175, compose project `e4s-local`, DB trong `e4s-local-postgres-1`.

## 0. Kết quả nhanh

- **R0 xong.** Đã có backup toàn bộ DB, manifest và lệnh rollback. Trước khi đụng vào dữ liệu đã kiểm khóa ngoại.
- **R2 xong cho tháng 2026-11, cả 5 level.**
  - Cả 5 framework đã được **duyệt lại qua luồng của app** và có plan v2 (`planSchemaVersion=2`) với 20 DaySpec (16 bài mới, 4 bài ôn).
  - Mỗi framework có 20 `month_lessons` đang `pending`. Chưa bài nào có nội dung.
  - IPA sai: 0.
  - `dailyObjectives` tiếng Việt ở B1–C1: 0.
  - C1 không còn từ cốt lõi nào trùng B1.
  - `skillExercises.focus` đã là bản mới, đúng level:
    - B1–C1 bằng tiếng Anh;
    - A1–A2 bằng tiếng Việt;
    - không còn câu "Nhận diện từ loại".
- **Tháng 2026-12 không làm.** Tháng này chưa có chủ đề tháng và chưa có framework nào (không có dòng `program_months`), nên không có dữ liệu để sửa. Muốn có tháng 12 thì phải tạo và duyệt chủ đề mới, mà việc đó là quyết định nội dung, nằm ngoài R2.
- Không sinh bài ngày, bài ôn hay đề. Không phát hành tháng nào. Không sửa code. Không ghi DB bằng SQL: mọi thay đổi đi qua API trên `http://127.0.0.1:4175/api`, bằng tài khoản `operator-review` và `manager-review`.

## 1. Backup và rollback (R0)

Thư mục: `.artifacts/regen-backup-2026-11-11/`

| File | Nội dung |
|---|---|
| `full.dump` | `pg_dump -Fc` toàn bộ DB `e4s`. sha256 `cd2787c4…1191` |
| `monthly-tables.dump` | Bản dump riêng các bảng tháng, bài, tiến độ, game và audit. sha256 `e1d4e969…894d` |
| `manifest.json` | Mọi framework (id, tháng, CEFR, status, version, `scope_hash`), số `month_lessons`, số bài đã duyệt, số bài có nội dung, ảnh. Kèm phân tích khóa ngoại và tác động của việc mở lại |
| `contracts-before/<id>.json` | `curriculum_contract` của 5 framework trước khi sửa |
| `contracts-after/<CEFR>.json`, `verify-<CEFR>.txt` | Contract sau khi sửa và kết quả đọc lại |
| `ROLLBACK.md` | Lệnh khôi phục |

Rollback (chi tiết trong `ROLLBACK.md`):

```bash
docker compose -p e4s-local stop api worker
MSYS_NO_PATHCONV=1 docker cp .artifacts/regen-backup-2026-11-11/full.dump e4s-local-postgres-1:/tmp/full.dump
docker exec e4s-local-postgres-1 pg_restore -U e4s -d e4s --clean --if-exists --no-owner --single-transaction /tmp/full.dump
docker compose -p e4s-local start api worker
```

Ảnh minh họa nằm trong MinIO, không nằm trong dump. R2 không xóa ảnh nào.

## 2. Khóa ngoại và dữ liệu học viên bị ảnh hưởng

**Khóa ngoại** (kiểm trước khi làm):
- Không bảng nào của học viên trỏ thẳng tới `month_lessons` hay `month_frameworks`.
- Khi xóa `month_lessons`, chỉ có `month_lesson_corrections` bị xóa theo (lúc đó có 0 dòng).
- `month_lessons.lesson_id → lessons` là `ON DELETE SET NULL` từ phía `month_lessons`. Vì vậy xóa `month_lessons` không xóa `lessons`.
- Các bảng tiến độ đều trỏ tới `lessons`, không trỏ tới `month_lessons`: `progress_records`, `lesson_part_attempts`, `lesson_part_appeals`, `learner_review_sessions`.

**Dữ liệu thực tế bị tác động.** Chỉ hai framework đã duyệt (A1, A2) phải mở lại. Tác động đúng như manifest, không vượt quá:

**A1** (v12, 20 `month_lessons`):
- **Đã xóa** 20 `month_lessons`:
  - N1 đã duyệt (bài `3435c485`);
  - 3 bản nháp có nội dung: N2, N3, N5.
- **Không xóa:**
  - Các dòng `lessons` và `lesson_versions` vẫn còn, nhưng không còn gắn vào plan.
  - Còn đúng 1 `progress_records` của học viên `minh.anh.nguyen@e4s.local`, ở trạng thái `not_started`, chưa có điểm. Tổng `progress_records` là 25 trước và 25 sau.
  - `game_sets` `monthly_vocabulary` A1 2026-11 không đổi.
  - `lesson_set` đề tháng (19 version, 1 published) vẫn còn, nhưng đã cũ so với scope mới.
- **Tác dụng phụ:** vì có 1 bài đã duyệt, app gửi 18 `reminders` "daily_lesson_reopened", mỗi học viên active của tổ chức nhận 1.

**A2** (v1, 20 `month_lessons`): đã xóa 20 slot trống. Không có nội dung, không có dữ liệu học viên, không gửi reminder.

**B1, B2, C1:** đang là bản nháp nên không cần mở lại. Không có `month_lessons` nào.

## 3. Từng framework (tháng 2026-11)

Đọc lại bằng `verify.sh` từ DB, chỉ đọc. Kết quả lưu ở `contracts-after/verify-*.txt`.

### A1 · `710d035d` · approved v12 → approved v14

Luồng đã chạy:
1. Operator gửi yêu cầu mở lại, Manager duyệt.
2. Sửa tay (`PUT …/resources`).
3. Duyệt.

| Hạng mục | Trước | Sau |
|---|---|---|
| /ɜː/ | `problem /ˈprɒbləm/`, `project /ˈprɒdʒekt/` (không có /ɜː/) | `turn /tɜːn/`, `word /wɜːd/` |
| /æ/ | `ot /ɒt/` (không phải từ), `job /dʒɒb/` | `chat /tʃæt/`, `laptop /ˈlæptɒp/` |
| IPA sai | 4 | 0 |
| Focus `word_class` | "Nhận diện từ loại của các từ cốt lõi ngày học." | "Chọn dạng đúng của từ ngày học để điền vào chỗ trống trong câu công việc." |

- Không đổi: 48 từ cốt lõi, 171 từ mở rộng, ngữ pháp.
- `dailyObjectives` tiếng Việt vẫn hợp lệ ở A1.
- Ảnh: 48/48 từ cốt lõi giữ ảnh cũ, đã được đóng băng lại khi duyệt.

### A2 · `fe0d51d3` · approved v1 (bể cũ, không lập lại plan được) → approved v4

Luồng đã chạy:
1. Mở lại.
2. Sinh lại bể bằng AI (`POST /content/months/2026-11/resources/generate`; 48 từ cốt lõi, mục tiêu 432 từ mở rộng, 2 chủ điểm, 4 âm).
3. Sửa tay IPA.
4. Duyệt. Plan lập được, approval qua.

**Âm trước khi sinh lại:**
- /iː/ chứa deliver, present, issue, listen, clarify (không có /iː/).
- Mục tiêu giả `/ˈX.X/`.
- `/θ/ and /ð/` gộp hai âm vào một mục tiêu.

**Âm sau khi sinh lại:** /θ/, /ɪ/, /s/, /æ/.

Bộ sinh vẫn để lọt 7 ví dụ sai. Đã sửa tay cả 7:

| Âm | Ví dụ sai | Thay bằng |
|---|---|---|
| /s/ | zoom, easy, busy, noise (đều là /z/) | service, sales, cost, test |
| /ɪ/ | clear /klɪər/ | visit |
| /ɪ/ | meeting (nguyên âm nhấn là /iː/) | finish |
| /ɪ/ | min (viết tắt) | bill |

Các thay đổi khác:
- Từ cốt lõi: bộ 48 từ mới. Từ mở rộng 236, đủ quan hệ bắt buộc.
- Ngữ pháp:
  - Present Simple/Continuous;
  - Modal verbs.

  `dailyObjectives` bằng tiếng Việt, hợp lệ ở A2.
- Focus mới bằng tiếng Việt, không còn "từ loại".
- IPA sai: 0.
- **Ảnh:** 14/48 từ cốt lõi có ảnh.
  - Lúc 13:37, có người đăng nhập bằng trình duyệt Chrome trên 4175 (không phải tôi) bấm sinh ảnh cho bản nháp A2 cũ. 48 ảnh được tạo cho bộ từ cũ.
  - Sau khi sinh lại bể, chỉ 14 từ trùng tên còn dùng được ảnh.
  - 34 từ mới chưa có ảnh. Luồng sinh ảnh không tự chạy (chỉ có nút `POST …/illustrations/generate`), nên tôi không sinh thêm.

### B1 · `4e39e071` · draft v2 → approved v3

Luồng đã chạy: sửa tay, rồi duyệt. Không sinh lại, để giữ 48 ảnh và bộ từ B1.

| Hạng mục | Trước | Sau |
|---|---|---|
| `dailyObjectives` | 12/12 tiếng Việt, ví dụ "Nhận biết cấu trúc could/would + you + V1…" | 12/12 tiếng Anh đơn giản, cùng nghĩa, ví dụ "Recognise could/would + you + base verb and how polite it is compared with can/will." |
| /ˈ/ (nhấn âm đầu) | `supplier /səˈplaɪər/` (nhấn âm 2), `present /ˈprez.ənt/` (trùng động từ cốt lõi present /prɪˈzent/) | `office /ˈɒfɪs/`, `budget /ˈbʌdʒɪt/`. Nhãn đổi thành "Primary stress on the first syllable of workplace nouns", vì document và manager có 3 âm tiết |
| /ks/ | `tracks /trædks/` (IPA bịa) | `tasks /tɑːsks/` |
| Focus | tiếng Việt, có "Nhận diện từ loại…" | tiếng Anh, ví dụ "Choose the correct form of today's words to complete a workplace sentence." |
| `grammarPlan.objective` N1 | tiếng Việt | "Recognise have/has + past participle and tell it apart from the past simple in progress reports." |

Ảnh: 48/48 giữ nguyên, không sinh lại ảnh nào.

### B2 · `cdf2ace1` · draft v1 (bể cũ, không lập plan được, không có `dailyObjectives`) → approved v3

Luồng đã chạy: sinh lại bể bằng AI, sửa tay 1 IPA, rồi duyệt.

**Trước khi sinh lại:**
- /ɪ/ chứa `feedback /ˈfiːdbæk/` và `sequence /ˈsiːkwəns/` (không có /ɪ/).
- Không có `dailyObjectives`.
- Không lập plan được.

**Sau khi sinh lại:**
- Âm: /st/, /ˈ/, /nd/, /kt/.
- Bộ sinh để lọt `client /ˈklaɪ.ənt/` trong /st/. Đã đổi thành `suggest /səˈdʒest/`.
- 12 `dailyObjectives` tiếng Anh.
- Ngữ pháp:
  - Present Perfect / Past Simple;
  - Modals, Reported speech, Conditionals.
- 231 từ mở rộng.
- Focus tiếng Anh.
- IPA sai: 0.

Ảnh: 4/48 từ cốt lõi có ảnh, là các từ trùng tên với ảnh cũ. Còn 6 dòng `generating` và 30 dòng `pending` treo từ 06/11, có từ trước R2.

### C1 · `387e07d4` · draft v2 → approved v4

Luồng đã chạy: sinh lại bể bằng AI, sửa tay từ vựng và âm, rồi duyệt.

**Bể trước khi sửa:**
- Gần như cùng bộ từ với B1 (client, present, problem, confirm, schedule…).
- Có ví dụ `count /krʌnt/`, `ax`.
- `/nd/` chứa point, agent, event…

**Bản sinh lại (v3):**
- Ngữ pháp và `dailyObjectives` tốt: tiếng Anh, mức C1 (hedging, inverted conditionals, reported passive).
- Từ cốt lõi vẫn ở mức B1. **20 từ trùng B1** (present, document, problem, confirm, request, accurate, supplier, feedback, change, complete, progress, solution, consultant, propose, partner, developer, adjust, upload, evaluate, improve), cộng nhiều từ A1–B1 khác (video, message, accept, available, version…).
- Kết quả là approval C1 lẫn B1 đều sẽ bị chặn, vì B1 và C1 không được chung từ cốt lõi.

**Sửa tay (v4):**
- Thay **32/48 từ cốt lõi** bằng từ C1 thật, giữ đúng id slot. Mỗi từ có 3–4 từ mở rộng do tôi soạn (nghĩa tiếng Việt, CEFR B2/C1), đủ quan hệ bắt buộc theo từ loại:
  - danh từ: umbrella + synonym;
  - động từ, tính từ, trạng từ: synonym + word_family.
- 32 từ mới: articulate, deliverable, discrepancy, endorse, amendment, meticulous, procurement, critique, concession, comprehensive, momentum, workaround, feasible, liaison, advocate, counterpart, specification, recalibrate, acknowledge, credible, bottleneck, escalation, correspondence, scrutinise, disseminate, appraise, iteration, consensus, briefing, provisional, shortfall, streamline.
- Giữ 16 từ đã ở mức B2–C1 và không trùng B1: satisfactory, revise, promptly, clarify, postpone, thoroughly, sponsor, implement, reschedule, punctual, constructive, founder, contingency, efficiently, clarity, auditor.
- Âm /st/:
  - `est /est/` (không phải từ) đổi thành `forecast`;
  - `extend` đổi thành `suggest`;
  - nhãn "/st/ and /nd/" đổi thành "Final consonant cluster /st/…".
- Nhãn /ˈ/ bỏ chữ "two-syllable".

**Sau khi sửa:**
- Trùng B1: 0.
- Từ mở rộng: 189.
- IPA sai: 0.
- Focus tiếng Anh.
- Ảnh: 6/48 từ cốt lõi có ảnh (các từ cũ trùng tên). 42 từ mới chưa có ảnh, vì luồng sinh ảnh không tự chạy.

### Tổng kết sau R2

| Level | Status | Version | `scope_hash` | DaySpec | `month_lessons` | IPA sai | `dailyObjectives` tiếng Việt (B1+) | Focus |
|---|---|---|---|---|---|---|---|---|
| A1 | approved | 14 | `monthly-4bbb670b` | 20 | 20 pending | 0 | — | VI, mới |
| A2 | approved | 4 | `monthly-f816ad18` | 20 | 20 pending | 0 | — | VI, mới |
| B1 | approved | 3 | `monthly-b06f0e10` | 20 | 20 pending | 0 | 0/12 | EN |
| B2 | approved | 3 | `monthly-d8d13e7e` | 20 | 20 pending | 0 | 0/12 | EN |
| C1 | approved | 4 | `monthly-1fb0bbf` | 20 | 20 pending | 0 | 0/12 | EN |

Không framework nào được phát hành (`published_at` trống). `monthly_resource_generation_checkpoints` còn 0 dòng.

## 4. Chưa làm, kèm lý do

1. **Tháng 2026-12:** chưa có chủ đề hay framework nào để sửa (xem mục 0).
2. **Ảnh cho từ mới:** chưa có ảnh cho 34 từ A2, 44 từ B2 và 42 từ C1. Luồng ảnh chỉ chạy khi bấm nút, nên tôi không tự chạy. Ảnh chỉ được đóng băng lúc duyệt và framework nay đã duyệt, nên muốn thêm ảnh phải mở lại hoặc làm theo luồng của Vận hành.
3. **Từ vựng B2 vẫn lẫn nhiều từ A1–A2** (client, team, tool, project, cancel, offer, helpful…). Bộ sinh không bảo đảm độ khó theo CEFR (xem D5). Ngoài lỗi IPA, tôi không sửa tay từ vựng B2, vì yêu cầu của R2 chỉ nêu đích danh C1. Nên xem lại trước R3.
4. **Từ vựng A2 trùng nhiều với A1 và B1:** chỉ là cảnh báo, không chặn. A2 nhận một bộ từ mới do bộ sinh chọn.
5. **Bộ sinh vẫn để lọt ví dụ phát âm sai:** 7 ví dụ ở A2, 1 ở B2, và 1 từ bịa `est` ở C1. Gate lúc duyệt (WP9) đã bắt được, và tôi sửa tay từng ví dụ. Nhưng mỗi lần sinh lại sẽ cần sửa tay tiếp.
   - Gate chỉ so chuỗi con nên còn chấp nhận các ví dụ kiểu `extend` trong /st/.
   - A2 vẫn còn `that /ðæt/`, `have /hæv/` (dạng mạnh) trong /æ/.
6. **Route sinh tài nguyên trả 504 sau 300 giây** (nginx timeout ở cổng web). Server vẫn chạy tiếp và lưu kết quả, nên phải theo dõi bằng `GET …/resources/checkpoint`. Đây là vấn đề UX của Vận hành, không làm mất dữ liệu.
7. Bài cũ của A1 (N1 đã duyệt, N2, N3, N5 nháp) và đề tháng A1 cũ vẫn còn trong DB nhưng không còn gắn vào plan mới. R3–R5 sẽ sinh lại.

## 5. Ghi chú vận hành

- **Tài khoản:** `operator-review` và `manager-review` (scenario accounts). Mật khẩu đọc từ `scripts/local-scenario-accounts.ts` bên trong script, không in ra.
- **Đăng nhập:** việc đăng nhập không thu hồi session của user trên DB khác. Logout chỉ thu hồi đúng token của phiên đó, nên không ảnh hưởng agent đang chạy ở 4296.
- **Có hoạt động song song trên 4175 trong lúc chạy:**
  - Một trình duyệt Chrome và HeadlessChrome đăng nhập staff/learner.
  - Từ trình duyệt đó, một người dùng (không phải tôi) bấm sinh ảnh cho A2 lúc 13:37.
  - Hoạt động này không làm hỏng bước nào.
- **Audit:** đầy đủ trong `audit_events`, gồm các sự kiện `monthly.framework_reopen_requested`, `reopened`, `replaced`, `resources_edited`, `approved`, từ 13:35 đến 13:47 UTC.

## 6. Đợt xử lý tồn đọng (11/11, 13:52–14:05 UTC) · đã dừng theo lệnh người dùng

**Backup trước đợt:** `.artifacts/regen-backup-2026-11-11/before-images.dump`, sha256 `03b3c7ac…bc5fc`. Đã ghi vào `ROLLBACK.md`.

**Đã làm:**
- **Mở lại B2, A2 và C1** theo luồng thường: Operator gửi yêu cầu, Manager duyệt. Không gửi reminder nào, vì không có bài đã duyệt.
- **B2: sinh lại bằng AI** (`POST …/resources/generate`), không sửa tay. Bản sửa tay từ vựng B2 chỉ chạy thử, chưa ghi gì.
  - Kết quả v5 **vẫn chưa đạt mức B2**. Còn từ A1–A2, ví dụ client, team, manager, problem, message, cancel, change, comment, head, colleague, review.
  - Trùng **22 từ cốt lõi B1**: client, present, manager, schedule, accurate, confirm, progress, problem, request, propose, consultant, change, complete, developer, solution, team, adjust, spreadsheet, extend, inform, upload, improve.
  - Trùng **6 từ cốt lõi C1**: revise, deliverable, postpone, efficiently, clarify, implement.
  - IPA sai: 0. `dailyObjectives` bằng tiếng Anh.
  - **Để nguyên bản nháp, không duyệt.** Main cần sửa prompt hoặc gate CEFR của bộ sinh tài nguyên rồi sinh lại.
- **Ảnh minh họa:** sinh qua `POST …/illustrations/generate` (sinh các từ còn thiếu), rồi poll đến khi xong.
  - A2: 34 ảnh. Nay đủ 48/48 từ cốt lõi có ảnh `ready`.
  - C1: 42 ảnh. Nay đủ 48/48.
  - Không ảnh nào lỗi.
  - Ảnh cũ của các từ A2 cũ vẫn nằm trong `month_framework_images`. App không có API xóa, và các ảnh này không được dùng vì không khớp từ nào.
- **Chi phí:** 76 dòng `[illustration-usage]` (model `gpt-6-luna`, 1024×1024, quality low). Tổng 158 877 input token và 16 652 output token.
- **Chưa duyệt lại A2 và C1.** Người dùng ra lệnh dừng: không duyệt, không mở lại thêm. Ảnh do người dùng tự kiểm trong UI Vận hành trước khi duyệt.

**Trạng thái hiện tại:**

| Level | Status | Version | `month_lessons` |
|---|---|---|---|
| A1 | approved | v14 | 20 |
| B1 | approved | v3 | 20 |
| A2 | **draft** | v5 | 0 |
| B2 | **draft** | v5 | 0 |
| C1 | **draft** | v5 | 0 |

A2 và C1 đã đủ ảnh. B2 chờ sửa bộ sinh.

### Danh sách mọi lần sửa tay (cả hai đợt), để main làm lại qua bộ sinh

| Level | Sửa tay |
|---|---|
| A1 | Sound /ɜː/: problem → `turn /tɜːn/`, project → `word /wɜːd/`. Sound /æ/: ot → `chat /tʃæt/`, job → `laptop /ˈlæptɒp/` |
| A2 (sau khi sinh lại) | /s/: zoom → `service /ˈsɜːvɪs/`, easy → `sales /seɪlz/`, busy → `cost /kɒst/`, noise → `test /test/`. /ɪ/: clear → `visit /ˈvɪzɪt/`, meeting → `finish /ˈfɪnɪʃ/`, min → `bill /bɪl/` |
| B1 | 12 `dailyObjectives` dịch từ tiếng Việt sang tiếng Anh (6 bước ngữ pháp). /ˈ/: supplier → `office /ˈɒfɪs/`, present → `budget /ˈbʌdʒɪt/`, đổi nhãn thành "Primary stress on the first syllable of workplace nouns". /ks/: `tracks /trædks/` → `tasks /tɑːsks/` |
| B2 (bản v3 cũ, nay đã bị bản sinh lại v5 thay) | /st/: client → `suggest /səˈdʒest/` |
| C1 (nằm trong bản v5 hiện tại) | Thay 32 từ cốt lõi ở các slot 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 19, 23, 27, 28, 30, 32, 33, 34, 36, 37, 39, 40, 41, 43, 44, 47, 48. Từ mới: articulate, deliverable, discrepancy, endorse, amendment, meticulous, procurement, critique, concession, comprehensive, momentum, workaround, feasible, liaison, advocate, counterpart, specification, recalibrate, acknowledge, credible, bottleneck, escalation, correspondence, scrutinise, disseminate, appraise, iteration, consensus, briefing, provisional, shortfall, streamline. Thêm 115 từ mở rộng tự soạn, id `c1-manual-*`, thay cho từ mở rộng của các slot đó. /st/: `est` → `forecast /ˈfɔːkɑːst/`, `extend` → `suggest /səˈdʒest/`, đổi nhãn thành "Final consonant cluster /st/ in workplace words". /ˈ/: đổi nhãn thành "Primary stress on the first syllable of workplace nouns" |

## 7. Quy tắc CEFR mới và sinh lại tài nguyên 2026-11 (11/11, 14:24–14:46 UTC) · dừng theo lệnh

**Quy tắc mới (người dùng):** từ cốt lõi của một cấp được ở **đúng cấp hoặc thấp hơn một cấp**, để học viên ôn lại.
- Băng cho phép: B1 = A2–B1, B2 = B1–B2, C1 = B2–C1.
- Danh sách từ cơ bản (gồm từ A1–B1) chỉ còn bị chặn ở C1.

**Code:**
- `buildMonthlyCoreCefrGuidance` nay ghi "target level or ONE level below".
  - Ở B2, câu "quá dễ" chỉ nói về từ A1–A2. Ở B1 chỉ nói về từ A1.
  - Ở C1 vẫn giữ danh sách ví dụ từ quá dễ.
- Giữ nguyên luật loại trừ trùng từ giữa các cấp.
- Sửa 6 test trong `monthly-resource-quality-gates.test.ts`:
  - B2 chấp nhận từ gắn nhãn B1, từ chối từ gắn nhãn A1/A2.
  - C1 vẫn từ chối từ trong danh sách cơ bản.
- Kết quả: `vitest src/modules/content` qua 696/696 test. `tsc --noEmit` sạch. Đã build lại dist của `apps/api`.
- Image `api` và `worker` đã build lại và chạy bằng `up -d --no-deps`, không chạy migrate. Đã grep thấy code gate mới trong container.

**Backup:** `.artifacts/regen-backup-2026-11-11/before-full-regen.dump`, sha256 `b6b42739…a42d2c`. Đã ghi vào `ROLLBACK.md`.

**Mở lại A1 và B1:** Operator gửi yêu cầu, Manager duyệt.
- A1: v14 approved → v15 draft. B1: v3 approved → v4 draft.
- Mỗi framework bị xóa 20 `month_lessons`. Không bài nào có nội dung.
- Lý do mở lại ban đầu bị lưu sai mã hóa, vì curl trên Windows không gửi UTF-8. Đã sửa lại đúng văn bản tiếng Việt ở 6 chỗ:
  - Cột `reason` và `decision_reason` của 2 dòng `month_framework_reopen_requests`: `89931ba5…`, `91384b88…`.
  - Trường `payload.reason` của 4 dòng `audit_events`: `cfea2059…`, `136edaef…`, `b26d855a…`, `39d495f3…`.
  - Đã đọc lại để kiểm tra. Không còn chuỗi lỗi nào khác trong DB.

**Lệnh sinh:** `POST /content/months/2026-11/resources/generate`.
- Tham số: `vocabularyCount` 48. `expandedVocabularyCount` lấy theo số từ mở rộng hiện có, giống UI: B2 245, C1 189, B1 233.

### B2 · `cdf2ace1` · draft v5 → **draft v6** (đạt)

**Số lần sinh:** 3.
- Lần 1: nginx trả 504 sau 311 s. Server báo lỗi ở P3 vì ví dụ /st/ trùng với ví dụ đã dùng, và "budget" không chứa /st/.
- Lần 2: báo 422 ở P3, các ví dụ /nd/ không chứa /nd/.
- Lần 3: đạt, nhờ dùng tiếp checkpoint. Từ cốt lõi, từ mở rộng, ngữ pháp và P1–P2 giữ từ lần 1.

**Kết quả kiểm tra:**
- Gate cấp độ: 0 lỗi.
- Không còn từ cốt lõi trùng với cấp nào khác. Bản v5 từng trùng 22 từ với B1 và 6 từ với C1.
- Gate âm vị: 36/36 ví dụ qua.
- `dailyObjectives` bằng tiếng Anh.
- Chạy thử kiểm tra khi duyệt, không duyệt thật: `planMonthlyResourcePool`, `validateMonthlyCurriculum`, `validateMonthlyGrammarObjectives` và `monthlyResourceApprovalIssues` đều trả 0 lỗi.

**Số lượng:** 48 từ cốt lõi, 201 từ mở rộng, 2 chủ điểm ngữ pháp, 4 âm.

**Từ cốt lõi:** highlight, effective, supervisor, justify, consistent, prioritise, reliable, representative, contractor, revision, outcome, timeline, flexible, proposal, track, concise, complaint, memorandum, postponement, notification, visualization, backlog, demonstrate, gathering, assess, compromise, drawback, authorise, criterion, allocate, capacity, efficiency, overview, disappointing, matrix, verification, anticipate, durable, approximately, collaborate, dramatic, participant, challenge, bulletin, interim, minor, appraisal, handle.

**Lỗi gate không bắt được:**
- `should /ʃʊld/` ở âm /ld/ sai IPA. Đúng là /ʃʊd/, chữ l câm. Gate chỉ đối chiếu chữ cái nên không phát hiện.
- "scold" và "mantle" không hợp ngữ cảnh công sở.

### C1 · `387e07d4` · vẫn là **draft v5** cũ (không đạt sau 3 lần, đã dừng)

Cả 3 lần đều qua phần từ cốt lõi, từ mở rộng và ngữ pháp, nhưng hỏng ở phần phát âm:
1. P2: "budget" không chứa /st/. Các ví dụ contrast, request, interest, forecast, test, list, cost, first trùng với ví dụ đã dùng.
2. P4: AI trả target `/ɪ/`. Gate từ chối vì đây là âm vị đơn, không phải hiện tượng nâng cao.
3. P4: target `/ˈɪ/`. Gate từ chối cả 9 ví dụ, gồm document, finance, apple, missile, origin, meeting, topic, puzzle, district.
   - Trong đó finance /ˈfɪnəns/, missile /ˈmɪsəl/ và district /ˈdɪstrɪkt/ thật ra có /ɪ/ mang trọng âm, nên có thể gate từ chối nhầm.

**Từ cốt lõi mới nằm trong checkpoint, chưa lưu thành bản nháp:** mitigate, postpone, thorough, consortium, deliverable, counterpart, elaborate, subcontractor, specification, timeframe, sponsor, reiterate, amendment, contingency, constructive, incorporate, accommodate, reassess, substantiate, documentation, resolve, satisfactory, scope, accelerate, acceptance, tangible, advocate, prioritize, feasible, rationale, transcript, evident, implement, tabulate, tentative, deliberate, nomenclature, unambiguous, candid, dependable, hierarchy, exemplary, forum, appendix, gradual, lucidity, walkthrough, buffer.

**Chưa sửa tay gì.** Bản v5 hiện tại vẫn chứa 32 từ sửa tay của đợt trước. Checkpoint C1 vẫn còn trong DB, có 48 từ cốt lõi và 3/4 âm. Lần sinh sau sẽ dùng tiếp checkpoint này.

### B1 · `4e39e071` · **draft v4**, tài nguyên vẫn là bản v3 cũ (lần 1 lỗi, dừng theo lệnh)

- Lần 1: báo 422 ở P2. AI trả `explanation` dài hơn 360 ký tự, nên không khớp schema.
- Checkpoint còn trong DB, có 48 từ cốt lõi và 1/4 âm.
- **Từ cốt lõi mới trong checkpoint:** confirm, document, deadline, problem, accurate, schedule, clear, request, propose, feedback, change, complete, developer, progress, solution, efficient, partner, successful, discuss, milestone, adjust, positive, reasonable, presentation, director, agree, extend, satisfied, cancel, facilitator, upload, approve, improve, minutes, pace, adequate, gatekeeper, mockup, budget, noticeboard, available, helpdesk, newsletter, review, outline, report, requirement, client.
  - Nhiều từ ở mức A2, được phép theo quy tắc mới.
  - Có vài từ lạ: gatekeeper, noticeboard, mockup.

### A2 và A1 · chưa sinh lại (dừng theo lệnh)

- Điều phối yêu cầu dừng, vì đặc tả phát âm mới trong `docs/pronunciation-roadmap.md` sẽ đổi bộ sinh trước.
- A1 là draft v15, nội dung là bản v14 cũ được mở lại.
- A2 là draft v5 cũ. Kiểm tra khi duyệt báo 2 lỗi: ví dụ "that /ðæt/" và "have /hæv/" bị coi là không chứa /æ/. Có thể bộ so khớp IPA lúc duyệt đánh giá sai.

### Nhãn CEFR

- AI có gắn nhãn `cefr` cho từ cốt lõi, và gate đã dùng nhãn đó lúc chọn từ.
- Nhưng `monthly-core-phase.ts` (dòng 269) bỏ nhãn trước khi lưu checkpoint và bản nháp, nên không đọc lại được nhãn từng từ.
- Mọi từ đã lưu đều qua gate lúc chọn: nhãn không thấp hơn băng cho phép, hoặc không có nhãn.
- Nếu cần lưu nhãn để kiểm tra lại, phải sửa code.

### Trạng thái cuối

| Level | Status | Version | Tài nguyên |
|---|---|---|---|
| A1 | draft | v15 | bản v14 cũ, mở lại |
| A2 | draft | v5 | bản cũ |
| B1 | draft | v4 | bản v3 cũ, có checkpoint mới chưa xong |
| B2 | draft | **v6** | **mới, sinh theo quy tắc mới, đạt mọi kiểm tra** |
| C1 | draft | v5 | bản cũ, có checkpoint mới chưa xong |

Không duyệt, không sinh ảnh, không xuất bản, không sinh bài.

## 8. Lộ trình phát âm trong bộ sinh tài nguyên tháng và sinh lại 2026-11 (11/11, 15:12–15:58 UTC)

**Quyết định của người dùng:** theo `docs/pronunciation-roadmap.md`, bỏ qua số tháng. Mỗi tháng lấy 4 mục kế tiếp theo **thứ tự lộ trình** (hàng trên xuống, P1→P4 trong hàng), bỏ các mục level đó đã dạy trong 12 tháng trước. Hết catalog thì bắt đầu lại vòng mới từ đầu. A1–A2 có hàng "Ôn" (4 cặp dễ nhầm) là hàng cuối. Không chọn ngẫu nhiên, không có lựa chọn "dễ hơn".

### Code

- **Catalog** `packages/domain/src/monthly/pronunciation-catalog.ts`:
  - A1–A2: 44 âm vị theo thứ tự lộ trình + 4 cặp (`/ɪ/–/iː/`, `/e/–/æ/`, `/s/–/ʃ/`, `/θ/–/t/ & /ð/–/d/`) = 48 mục.
  - B1, B2, C1: mỗi level 24 hiện tượng.
  - Mỗi mục có: `id`, thứ tự, loại (`phoneme` | `pair` | `phenomenon`), ký hiệu mục tiêu (ví dụ `/-s=s/`, `/C‿V/`, `/↘ Wh-/`), nhãn Việt/Anh, luật hình thức của ví dụ và hướng dẫn cho AI.
- **Chọn mục:** `selectMonthlyPronunciationItems` (tất định).
  - Đọc 12 tháng trước của cùng level qua `listPronunciationHistory` (repository mới). Lấy framework mới nhất của mỗi tháng, không `retired`, nháp hoặc đã duyệt.
  - Nhận diện mục đã dạy qua `catalogId`, ký hiệu, hoặc alias cũ (B1 `/st/`, `/nd/`…).
  - Đi tiếp sau mục đã dạy cuối cùng và bỏ mục đã dạy trong cửa sổ. Hết catalog thì quay lại đầu.
  - Sound lưu thêm `catalogId`.
- **Pha phát âm** (`monthly-routes.ts`): giữ nguyên cách sinh (mỗi mục một lệnh gọi, tối đa 3 lần sửa).
  - Mục đã được chọn sẵn; `ipa` luôn là ký hiệu của catalog. AI chỉ viết nhãn, giải thích và ví dụ.
  - Prompt gửi kèm catalog, danh sách đã dạy và 4 mục của tháng. Prompt nói rõ giới hạn giải thích (≤ 50 từ, ≤ 300 ký tự) và ngôn ngữ (Việt cho A1–A2, Anh đơn giản cho B1–C1). Gate kiểm tra lại cả hai điều này.
  - Lỗi schema/Zod (ví dụ giải thích > 360 ký tự) nay đi vào vòng sửa, không còn trả 422 ngay.
  - Checkpoint phát âm có schema mới `monthly-resource-pronunciation-v18-roadmap-catalog`, nên checkpoint phát âm cũ tự bị bỏ qua. Mục đã lưu trong checkpoint chỉ được dùng lại nếu đúng mục của slot và vẫn qua mọi gate.
- **Gate theo loại mục:**
  - Âm vị và cặp: giữ kiểm tra theo token âm vị.
    - Dạng yếu chỉ bị loại khi đích là /ə/ hoặc IPA là dạng yếu. Vì vậy `that /ðæt/` và `have /hæv/` nay qua cho /æ/.
    - Đích có dấu nhấn (`/ˈɪ/`) được so với nguyên âm của âm tiết mang trọng âm, nên finance, missile, district qua, còn meeting, document bị loại.
    - Cặp: mỗi bên ít nhất 3 ví dụ.
  - Hiện tượng: kiểm tra hình thức.
    - Đuôi -s/-ed theo âm cuối.
    - Cụm phụ âm đầu/cuối.
    - Trọng âm: số âm tiết và vị trí ˈ; giới hạn ≤ 3 âm tiết chỉ áp cho mục trọng âm từ.
    - Cụm từ, câu ngắn: 2–12 từ, IPA phải phiên đủ các từ và không chứa chính tả tiếng Anh.
    - Dấu hiệu bắt buộc theo mục: ‿, dạng yếu có /ə/, âm bị nuốt trong ngoặc, mũi tên ↘/↗, dấu ngắt |, CHỮ HOA cho từ được nhấn.
  - Gate dùng chung cho sinh, sửa tay và duyệt: `monthlyPronunciationExampleIssue` trong `monthly-resource-approval-checks.ts`.
  - `isValidMonthlyPronunciationIpaTarget`, `isPronunciationTargetAllowedForLevel` và luật số âm tiết trong `validateMonthlyResourcePlanShape` chấp nhận ký hiệu catalog theo level.
- **CEFR từ cốt lõi:**
  - `monthly-core-phase.ts` không còn bỏ nhãn `cefr`. `phaseInput` bỏ nhãn này khỏi `coreTermBatch` gửi AI, vì schema strict.
  - `buildMonthlyResourcesFromAiPlan`, `planMonthlyResourcePool`, kiểu `CoreTerm` (domain) và `MonthFrameworkView` (contracts) giữ `cefr` tùy chọn. Duyệt không bị ảnh hưởng.
  - Sửa tay giữ nhãn khi từ không đổi.
- **Test:**
  - `packages/domain/test/monthly-pronunciation-catalog.test.ts`: catalog; chọn mục có nhớ, gồm bỏ mục đã dạy, đúng thứ tự, quay lại khoảng trống, hết catalog thì vòng mới, A1–A2 phủ 48 mục trong 12 tháng; gate theo loại với mẫu lỗi thật của mục 7 và của lần sinh B2 đầu.
  - `apps/api/src/modules/content/monthly-pronunciation-roadmap.test.ts`.
  - Test IPA, test duyệt và test lưu CEFR/`catalogId`.
  - Kết quả:
    - `vitest src/modules/content`: 710/710 test qua. Ba file `dist/…weekly*` lỗi nạp `vi.mock`, có từ trước.
    - Domain: 390/390.
    - DB: `monthly-resource-approval-checks` 6/6. `monthly-illustration-projection` 2 lỗi, nằm ở repository learning, không liên quan.
    - `tsc --noEmit` sạch cho api, domain, database, contracts và ai. Đã build lại dist.
- **Deploy:** `build api worker` rồi `up -d --no-deps`, không chạy migrate. Đã grep thấy code mới trong container. Deploy lại 2 lần sau khi sửa prompt và gate (xem B2).
- **Backup:** `.artifacts/regen-backup-2026-11-11/before-pron-regen.dump`, sha256 `60854067…50d1dd68`. Đã ghi vào `ROLLBACK.md`.

### Kết quả sinh lại

Mọi lần sinh đều qua `POST …/resources/generate`, body UTF-8 gửi bằng Node. Không sửa tay, không duyệt, không sinh ảnh.

DB không có tháng nào trước 2026-11, nên cửa sổ nhớ trống. Mọi level lấy 4 mục đầu catalog, không trùng tháng trước. Script đọc lại chạy trong container, kiểm tra:
- Gate cấp độ từ cốt lõi.
- Gate phát âm theo loại.
- Mục khớp `selectMonthlyPronunciationItems`.
- `planMonthlyResourcePool` + `validateMonthlyCurriculum` + `validateMonthlyGrammarObjectives` + `monthlyResourceApprovalIssues` (chạy thử duyệt, không duyệt thật).

| Level | Version | Số lần sinh | P1–P4 | Nhãn CEFR | Kiểm tra |
|---|---|---|---|---|---|
| A1 | draft v15 → **v16** | 1 (504 sau 300 s là timeout giả; poll thấy `completed`) | /m/, /n/, /l/, /h/ | 48/48 (A1 48) | 0 lỗi |
| A2 | draft v5 → **v6** | 1 | /m/, /n/, /l/, /h/ | 48/48 (A2 41, A1 7) | 0 lỗi |
| B1 | draft v4 → **v5** | 1 (dùng tiếp checkpoint từ vựng/ngữ pháp) | -s = /s/, -s = /z/, -s/-es = /ɪz/, 's rút gọn | 4/48 (B1 3, A2 1) | 0 lỗi |
| B2 | draft v6 → **v7** | 2 (lần 1 hỏng ở P3) | dạng yếu: mạo từ, giới từ, trợ động từ, từ nối | 48/48 (B2 45, B1 3) | 0 lỗi |
| C1 | draft v5 → **v6** | 1 (dùng tiếp checkpoint) | trọng âm từ: dịch theo hậu tố, từ ghép vs tính từ + danh từ, danh từ ghép nhiều phần, cụm động từ danh từ vs động từ | 6/48 (C1 6) | 0 lỗi |

**Ví dụ từ cốt lõi kèm nhãn:**
- A1: client (A1), document (A1), schedule (A1), noon (A1).
- A2: deadline (A2), solution (A2), team (A1), decision (A2).
- B1: invoice (B1), minor (B1), inform (A2), spreadsheet (B1).
- B2: dispute (B2), mitigate (B2), summary (B1), stakeholder (B2).
- C1: obstruction (C1), impediment (C1), liaison (C1), meticulous (C1).

**Ví dụ phát âm:**
- A1 /h/: happy, hear, home, head.
- B1 /-s=z/: calls /kɔːlz/, plans, files.
- B2 trợ động từ: "we can start soon /wi kən stɑːt suːn/", "it was late /ɪt wəz leɪt/".
- C1 cụm động từ: "setup (noun) /ˈsetʌp/", "set up (verb) /ˌset ˈʌp/".

### Ghi chú và việc còn tồn

1. **B2 lần 1** hỏng ở P3 (trợ động từ). AI trả từ đơn (can, have, was…) thay vì cụm từ, nên gate từ chối cả 3 lần sửa.
   - Đã thêm vào prompt câu "đặt cả cụm vào trường word".
   - Đã thêm gate IPA cụm từ: phải phiên đủ từ, không có chính tả. Gate này bắt được "a form for the team /ˈfɔːm ðə ˈteam/" của P2 trong checkpoint, và P2 được sinh lại.
   - Lần 2 đạt.
   - **Lỗi do prompt của tôi:** câu mẫu trong prompt lần 2 bị AI chép lại. B2 v7 còn 2 ví dụ sai ngữ pháp: "we to start soon" (P2) và "we and start soon" (P4).
   - Đã sửa prompt trước khi sinh C1, B1, A2, A1, nhưng B2 đã hết 2 lần sinh nên chưa sinh lại. Cần một lần sinh nữa nếu người dùng cho phép.
2. **Nhãn CEFR của B1 và C1:**
   - B1 và C1 dùng tiếp từ cốt lõi trong checkpoint cũ, lưu trước khi sửa code nên không có nhãn. Chỉ các từ được bổ sung trong lần này có nhãn (B1 4, C1 6).
   - Muốn đủ nhãn thì phải sinh lại phần từ cốt lõi.
3. **A1 và A2 cùng nhận /m/, /n/, /l/, /h/.** Mỗi level có bộ nhớ riêng, và đây là 4 mục đầu lộ trình.
4. **Lỗi nhỏ gate không bắt được:**
   - A1 `manager /ˈmæn.ɪ.dʒɚ/` dùng ký hiệu Mỹ ɚ.
   - C1 có từ lạc chủ đề `magician`.
   - B2 `an update /ən ʌpˈdeɪt/`: danh từ update nhấn âm đầu.
5. **Giải thích không được lưu.** `explanation` của mục phát âm không nằm trong pool nháp: contract `sounds` không có trường này, có từ trước.

**Trạng thái cuối:**
- A1 v16, A2 v6, B1 v5, B2 v7, C1 v6 đều là **draft**.
- Không duyệt, không sinh ảnh, không xuất bản, không sinh bài.
