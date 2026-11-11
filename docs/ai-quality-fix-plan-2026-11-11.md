# Kế hoạch sửa chất lượng nội dung AI · 11/11/2026

Nguồn: [báo cáo đánh giá](ai-quality-report-2026-11-11.md). Mỗi nguyên nhân trong báo cáo đã được kiểm lại trên code của worktree.

Chỉ thị của người dùng:
1. **Giữ nguyên cách sinh AI.** Không đổi tác vụ, cách chia lượt gọi, model (Haiku), cấu trúc prompt và contract, hay vòng sửa. Chỉ được làm các việc sau:
   - đổi lời trong prompt hoặc contract đang có;
   - thêm hoặc sửa gate;
   - thêm bước xử lý sau khi sinh mà không đổi điều AI được yêu cầu sinh;
   - sửa bug;
   - sửa dữ liệu.

   Việc nào đổi cách sinh thì xếp vào mục (c) để người dùng quyết.
2. **Được ghi đè và sinh lại nội dung cho mọi level.** Phải có backup và đường rollback. Mọi ô level × loại nội dung phải được kiểm theo rubric và spec.

## (a) Kết quả kiểm nguyên nhân gốc

| # | Vấn đề | Vị trí | Kết luận |
|---|---|---|---|
| 1 | B1 đạt 0/6 | `monthly-quality.ts:138` bắt chép nguyên văn `grammar.objective`, trong khi `packages/domain/src/content/index.ts:152-158` cấm tiếng Việt ở B1+. `daily-progression.ts:19` lấy `dailyObjectives` (tiếng Việt) của bể tài nguyên. Prompt ngữ pháp (`monthly-resource-generation.ts:544`) không quy định ngôn ngữ cho `dailyObjectives`. | Đúng. Lỗi do dữ liệu cộng với hai gate xung đột. |
| 2 | Model diễn đạt lại công thức | `monthly-quality.ts:107` so khớp chuỗi con chính xác. Thông điệp sửa chung chung (`monthly-day-generation.ts:73`). | Đúng |
| 3 | Pronunciation thiếu `stage`/`objective` | `schemas.ts:1553-1564` ghi "Use exactly these keys" và chỉ liệt kê `{focus, words}`, trong khi `monthlyDailyTeachingContract` đòi thêm trường. Hai contract trong cùng prompt mâu thuẫn nhau. | Đúng, kèm một nguyên nhân mới |
| 4 | Đáp án dồn một vị trí | Chỉ đề tháng xáo đáp án (`monthly-final-builder.ts:137`). Bài ngày, bài ôn và đề lên cấp (`assessment/routes.ts:1131-1137`) không xáo. | Đúng về cơ chế |
| 5 | Đáp án nhiễu là từ bịa | Không gate nào kiểm. | Đúng là thiếu kiểm |
| 6 | Word form hỏi từ loại (HV-R49) | Contract bài ngày (`schemas.ts:1562`) không có luật. Gate bài ôn chỉ kiểm dấu "---" (`monthly-review-quality.ts:86`). | Đúng |
| 7 | Đề lên cấp không có gate nội dung, prompt không có trong DB | `routes.ts:536-578` chỉ kiểm schema. Map ở `repositories.ts:142` thiếu `level_form_generation`, nên luôn dùng DEFAULT. | Đúng |
| 7c | Đáp án sai, câu có hai đáp án đúng | Lỗi nội dung | Cần người đọc lại |
| 8 | 30% lượt Season rơi về câu mẫu | `coach/routes.ts:689-734`: vi phạm là rơi về câu mẫu ngay. `enforceReplySentenceCount` (`:921`) và `inspectCoachOutput` (`:799`) là code chết. Không ghi log lý do. | Đúng, kèm nguyên nhân mới |
| 9 | Tiền tố "That's clear:" | `routes.ts:935` | Đúng |
| 10 | Bản dịch lệch | `mergeAcceptedRoleplay` (`:736-745`) giữ bản dịch của lượt feedback. Khi rơi về câu mẫu, bản dịch của câu mẫu bị bỏ (`:724-733`). | Đúng, kèm nguyên nhân mới |
| 11 | Rò thẻ XML | `anthropic.ts:118` lấy `tool_use.input` mà không làm sạch. | Đúng |
| 12 | Câu trộn tiếng Việt vẫn tính lượt | `coachPracticeTurnGateReason` (`:354-362`) chỉ kiểm câu lặp và số từ. | Đúng |
| 13 | `priorQuestions` bị bỏ | `coachInputSchema` không có trường này, nên zod loại bỏ. | Đúng, là bug |
| 14 | Season không biết nội dung tháng | `aiInput` (`routes.ts:101-112`) chỉ truyền `scenario`. | Đúng |
| 15 | Câu hỏi bị nhân đôi khi lạc đề | `repeatCurrentQuestionForOffTopic` (`:462-471`) | Đúng |
| 16 | Đề A1–A2 viết bằng tiếng Anh | Chỉ có luật ngôn ngữ cho B1+ (`content/index.ts:152`). | Đúng là thiếu gate |
| 17 | GEN22 bỏ qua đề Writing/Speaking | `monthly-final-checks.ts:416-431` | Đúng |
| 18 | IPA giả, bể âm sai | Dữ liệu đúng như báo cáo, thêm job và deliver. Bộ sinh hiện tại đã có lọc; lỗ hổng nằm ở sửa tay (`monthly-resource-manual-edit.ts:211-228`), ở `approveFramework` và nhánh "X" cũ trong matcher. | Dữ liệu đúng, nguyên nhân đúng một phần |
| 19 | sheet/shit, câu đọc to vô nghĩa | `monthly-review-quality.ts:104-112` không kiểm. | Đúng là thiếu kiểm |
| 20 | Từ vựng C1 thực chất là B1 | Repo không có danh sách CEFR. | Chưa kiểm được |
| 21 | A2 ôn tuần 1 không sinh được | `monthly-day-generation.ts:206`, `monthly-content-repository.ts:578` | Đúng về cơ chế |
| 22 | Reading đề tháng chỉ ghép định nghĩa | Prompt hướng model tới "meaning paraphrase". | Đúng một phần |

## (b) Gói việc theo ưu tiên

Lỗi test có sẵn từ trước, không tính là hồi quy:
- 12 lỗi trong `OperatorRouteController.test.tsx`;
- 6 lỗi trong `Months.test.tsx`;
- fixture cũ của `monthly-content.integration.test.ts`.

### WP1 · P0 · S–M · Bài ngày và bài ôn đạt gate ngay lần đầu

**Việc làm:**
- **1a:** Khi kiểm tiếng Việt, bỏ qua `grammar.objective` và `dailyCode` nếu chúng trùng giá trị khóa của plan. Hai trường này vẫn được kiểm riêng ở `:138`. Bật qua tham số, mặc định tắt cho bài tuần.
- **1b:** Thông điệp sửa nêu đúng chuỗi mong đợi. Áp cho các mã:
  - `MONTHLY_GRAMMAR_SCOPE_MISMATCH`
  - `MONTHLY_DAILY_GRAMMAR_OBJECTIVE`
  - `MONTHLY_DAILY_PRONUNCIATION_STAGE`
  - `MONTHLY_SOUND_SCOPE_MISMATCH`
  - `MONTHLY_COMBINED_PRONUNCIATION_POSITIONS`
- **1c:** Chuẩn hóa công thức trước khi so: khoảng trắng, dấu "…", nháy cong và thẳng, chữ hoa thường.
- **1d:** Trong `MONTHLY_LESSON_PART_CONTENT_CONTRACT`, đổi "exactly these keys" thành "at least these keys". Nêu rõ các trường thêm khi có `dailyTeachingPlan`.

**Test:**
- `monthly-quality.test.ts`
- `monthly-day-generation.test.ts`: kiểm prompt của vòng sửa có chuỗi mong đợi.
- Test domain.

### WP2 · P0 · M · Xáo vị trí đáp án (xử lý sau, có seed)

**Việc làm:**
- Tách `rebalanceAnswerPositions` và `seededRandom` thành module chung `apps/api/src/modules/shared/answer-order.ts`, hỗ trợ cả hai dạng: đáp án chuỗi và `correctIndex`.
- Bài ngày và bài ôn: xáo sau khi đạt gate, trong `generateMonthlyDay`. Áp cho:
  - mọi câu trắc nghiệm;
  - `grammar.items`;
  - `items` và `variants` của bài ôn;
  - cặp tối thiểu.

  Seed là `scopeHash:day:part:itemId`.
- Đề lên cấp:
  - Xáo trước `levelFormBlueprint` và ánh xạ lại `correctIndex`.
  - Tách hàm `assembleLevelFormFromAi` để harness gọi đúng code thật.

**Test:**
- Cùng seed cho cùng kết quả.
- Đáp án đúng vẫn trỏ đúng sau khi xáo.
- Với ≥ 8 câu, mỗi vị trí chiếm ≤ 35%.
- `monthly-final-builder.test.ts` vẫn đạt.

### WP3 · P0 · M · Gate đáp án nhiễu và Word form (HV-R49)

**Lỗi severe:**
- Đề Word form nhắc tới word class, part of speech hoặc từ loại.
- Cả bốn lựa chọn đều là nhãn từ loại.
- Đáp án trùng từ gợi ý.
- Dạng động từ bịa (sended, maked…).
- Hậu tố vô nghĩa (feedbacked…).

**Lỗi light:**
- Trong một phần, hơn 50% câu có đáp án đúng là lựa chọn dài nhất duy nhất.

**Đổi lời contract:**
- Dòng `word_class` ở `schemas.ts:1562`.
- `monthlyReviewExerciseContract`.

**Test:** mỗi luật có một ca đạt và một ca trượt, lấy từ mẫu thật.

### WP4 · P0 · M · Sửa bug Season và Coach

**Việc làm:**
- **a:** Bỏ "That's clear:". Lỗi văn phong (dạng viết tắt, emoji) chuyển thành cảnh báo. Chỉ rơi về câu mẫu khi có lỗi chặn: tiếng Việt, lời người dạy, câu hỏi neo, câu hỏi lặp.
- **b:** Gọi `enforceReplySentenceCount` và luôn giữ câu hỏi cuối.
- **c:** Câu mẫu đi kèm đúng bản dịch của nó. Bản dịch không khớp lời đang hiện thì để trống. Sửa lời phần "FEEDBACK ONLY".
- **d:** Thêm `stripLeakedToolMarkup` trong `packages/ai`, chạy trên `toolInput` trước khi parse.
- **e:** Câu trộn tiếng Việt thì ép `insufficient` và không tính lượt. Số từ đếm bằng code.
- **f:** Không nhân đôi câu hỏi khi học viên lạc đề.
- **g:** Thêm `priorQuestions` vào `coachInputSchema`.
- **h:** Ghi log lý do mỗi lần rơi về câu mẫu.
- **i (P2):** Đưa từ vựng của tháng vào lời prompt.

**Test:** `coach-persona.test.ts`, `coach-prompt.test.ts` và test trong `packages/ai`.

### WP5 · P0 · M · Gate và prompt đề lên cấp

**Gate mới `level-form-quality.ts`:**
- Bốn lựa chọn khác nhau.
- Đủ Part 1–5.
- Câu NOT có đúng một lựa chọn vắng mặt trong bài, và lựa chọn đó là đáp án.
- Câu "how many" khớp số trong bài (warning).
- Không có câu trùng nhau.
- Lựa chọn dài nhất chiếm ≤ 35%.

**Prompt:**
- Thêm `prototypePromptDefaults.levelForm` và đăng ký `level_form_generation` trong map.
- Nội dung: đa dạng bối cảnh; câu NOT và câu đếm đúng luật; mỗi câu chỉ một đáp án.

**Test:** dùng 3 lỗi đã xác nhận làm fixture. Bài integration kiểm rằng gate trượt thì trả 502 và không lưu đề.

### WP6 · P1 · S · GEN22 kiểm thêm đề Writing/Speaking

- B1–C1: không được có tiếng Việt.
- A1–A2: lời đề phải có tiếng Việt.

### WP7 · P1 · M · Luật ngôn ngữ A1–A2 và chặn thuật ngữ nội bộ

- Ở A1–A2, `prompt` và `instruction` của bài tháng phải có tiếng Việt.
- Chặn các chuỗi "người học", "core term", "expanded term" và `communicationGoal` bị dán nguyên vào nội dung.
- Ra phiên bản prompt mới qua `prompt-sync`.

### WP8 · P1 · M · Gate phát âm cho bài ôn

- Cặp tối thiểu có một từ khóa của tuần và không chứa từ phản cảm.
- Câu đọc to có ≥ 2 từ ví dụ.
- `requiredWords` sai thì tính là lỗi severe.
- Sửa lời contract.

### WP9 · P1 · M · Gate tài nguyên tháng

- `dailyObjectives` ở B1–C1 phải bằng tiếng Anh.
- Sửa tay phải kiểm IPA của từ ví dụ, ngôn ngữ, và từ cốt lõi trùng giữa các level.
- `approveFramework` chạy lại các kiểm này.
- Bỏ nhánh "X" trong matcher.

### WP10 · P2 · M · Reading đề tháng

- Từ đích phải nằm trong câu ngữ cảnh.
- Đa dạng dạng câu hỏi.

### WP0 · P0 · S · Harness đo lại

- Mở rộng `run.mjs` cho đủ A1–C1 và đủ 6 loại nội dung.
- Phần đề lên cấp gọi hàm thật.
- Xuất các chỉ số dùng ở mục (d).

## (R) Sinh lại và ghi đè cho mọi level

Chỉ làm sau khi WP0–WP9 đã merge, deploy và có md5 khớp.

- **R0 · Backup:**
  - `pg_dump -Fc` toàn bộ DB, kèm bản xuất riêng của các bảng tháng, đề, prompt và audit, cùng `manifest.json`.
  - **Kiểm khóa ngoại** từ bảng tiến độ học viên tới `month_lessons` trước khi làm. Việc này chưa kiểm.
- **R1 · Prompt:** ra version mới qua `prompt-sync`.
- **R2 · Tài nguyên A1–C1 tháng 11 và 12:**
  - Đi qua luồng mở lại và duyệt sẵn có. Không ghi đè bằng SQL vì sẽ phá `scope_hash`, version và DaySpec.
  - Sửa IPA, `dailyObjectives` và từ vựng C1.
- **R3 · Bài ngày và bài ôn:**
  - Script gọi API cho N1→N18, tuần tự trong mỗi level, song song giữa các level. Không thêm nút trên UI (giữ VH-R44).
  - Chỉ duyệt khi ô ma trận tương ứng đạt.
- **R4 · Đề tháng:** chạy sau R3.
- **R5 · Đề lên cấp A2–C1:** bản cũ đang có người dùng thì giữ làm lịch sử.
- **R6 · Season và Coach:** không có dữ liệu lưu cần sinh lại; không sửa `coach_turns` cũ.
- **R7 · Phát hành:** chỉ phát hành khi mọi ô của level đó đạt.

## (c) Việc người dùng cần quyết (các việc này đổi cách sinh)

1. **D1 · Code tự điền các trường khóa sau khi AI trả về.** Đây là mức tăng lớn nhất: từ 33% lên trên 70%. Không làm D1 thì WP1 chỉ đạt được một phần.
2. **D2 · Thử lại lượt roleplay một lần trước khi rơi về câu mẫu.** Thêm khoảng 1,5 giây cho mỗi lượt lỗi.
3. **D3 · Thêm lượt AI giải lại để kiểm đáp án đề lên cấp.** Tốn 40–60 lượt gọi mỗi đề. Không làm D3 thì bắt buộc có người đọc lại trước khi publish.
4. **D4 · Gộp lượt kiểm ngữ pháp của đề tháng theo khối.** Hiện tới 102 lượt gọi mỗi đề.
5. **D5 · Dùng danh sách từ theo CEFR và từ điển** để gate độ khó và từ bịa chắc chắn hơn. Cần chọn nguồn và kiểm giấy phép.
6. **D6 · Thêm lượt dịch riêng cho lời Season**, nếu WP4c chưa đủ.
7. **D7 · Có ghi đè tháng 11/2026 đang chạy không.** Mở lại framework sẽ xóa `month_lessons`, có thể mất tiến độ của học viên. Phương án khác: chỉ sửa tháng 12 và retire tháng 11.

## (d) Ma trận kiểm thử và mục tiêu

Chạy `run.mjs` trong `e4s-auth-preview-api`, không ghi DB, model `claude-haiku-5-5`. Mỗi loại nội dung kiểm cho từng level A1, A2, B1, B2, C1. Đề lên cấp không có A1.

| Loại | Mẫu cho mỗi level | Gate | Rubric |
|---|---|---|---|
| Bài ngày | 6 mẫu (N1, N2, N7, N8, N13, N16); sau R3 kiểm đủ 18 | Không còn lỗi severe. Đề A1–A2 không viết bằng tiếng Anh. Không vi phạm HV-R49. Mỗi vị trí đáp án ≤ 35%, vị trí D ≥ 15% | ≥ 7/10 |
| Bài ôn thứ Sáu | 4 mẫu | Đúng spec bài ôn: đủ 6 phần, đủ số câu, bài đọc 60–120 từ, 2 cặp tối thiểu hợp lệ, câu đọc to có ≥ 2 từ. Đạt WP8 | ≥ 7/10 |
| Đề tháng | 2 mẫu | GEN01–GEN23, GEN22 mới, đúng `MONTHLY_FINAL_LEVEL_PROFILES` | ≥ 6,5/10, 0 đáp án sai |
| Đề lên cấp (A2–C1) | 2 mẫu | WP5 không còn severe. Mỗi vị trí 20–30% | Người đọc cả 60 câu: 0 câu sai |
| Season | 12 lượt đơn và 1 hội thoại 6 lượt | Rơi về câu mẫu ≤ 5%. Tiền tố, rò thẻ, câu hỏi nhân đôi đều = 0 | ≥ 7/10 |
| Coach | Cùng các lượt của Season | Câu trộn tiếng Việt được tính lượt = 0. Bản dịch lệch = 0 | Sửa lỗi chính xác ≥ 85% |

**Mục tiêu:**

| Chỉ số | Hiện tại | Mục tiêu |
|---|---|---|
| Bài ngày đạt ngay lần đầu | 0% | ≥ 40% (≥ 60% nếu làm D1) |
| Bài ngày đạt trong 3 lần | 33% | ≥ 80% |
| B1 | 0/6 | ≥ 5/6 |
| Bài ôn đạt | 3/7 | ≥ 80% |
| Vị trí A ở bài ôn | 86% | ≤ 30% |
| Vị trí B ở đề lên cấp B1 | 32/40 | ≤ 12/40 |
| Season rơi về câu mẫu | 30% | ≤ 5% |
| Rò thẻ XML | 6/23 | 0 |

**Chặn rollout:**
- Ô nào (level × loại) trượt thì chặn duyệt và phát hành ô đó.
- Season hoặc Coach trượt ở bất kỳ level nào thì không deploy WP4.
- Mọi lỗi chặn phát hiện trong rubric review phải có test hồi quy trước khi chạy lại.

## (e) Các luồng chạy song song

| Luồng | Gói việc | Ghi chú |
|---|---|---|
| A | WP1 → WP3 → WP7 → WP8 (tuần tự) | Cùng đụng file quality và domain |
| B | WP2 + WP5 | Chỉ sửa phần cuối `generateMonthlyDay`; merge sau luồng A |
| C | WP4 | Coach, `anthropic.ts`, phần đầu `schemas.ts` |
| D | WP6 → WP10 | |
| E | WP9 | |
| — | WP0 | Chạy song song với mọi luồng |

- `prototype-prompts.ts` bị WP5 và WP7 cùng sửa; merge WP5 trước.
- R0–R7 chỉ bắt đầu khi ma trận chạy bằng harness đã đạt.

## Quyết định của người dùng (11/11/2026) · kế hoạch đã duyệt

- **D1 · Đồng ý.** Sau khi AI trả về và trước khi chạy gate, code tự điền các trường khóa lấy từ plan:
  - `grammar.dailyCode`, `grammar.objective`, các `formula` của bước;
  - `pronunciation.stage`, `objective`, `focus`, `words`, `reviewTargets`, `targetPositions`.

  Việc này thuộc WP1, luồng A. Gate vẫn kiểm các trường này để bắt lỗi của chính bước điền.
- **D3 · Không thêm lượt AI kiểm đáp án.** Đề lên cấp phải có người đọc lại trước khi publish. Màn publish bắt buộc Vận hành xác nhận đã đọc lại đáp án từng câu (luồng B).
- **D7 · Ghi đè cả tháng 11/2026.** Tháng này đang chạy thử nên chấp nhận mất dữ liệu. R2–R7 áp cho cả tháng 11 và tháng 12.
- D2, D4, D5, D6: chưa làm.
