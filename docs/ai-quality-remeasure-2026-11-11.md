# Đo lại chất lượng nội dung AI sau WP1–WP10 · 11/11/2026

Nguồn đối chiếu: [báo cáo gốc](ai-quality-report-2026-11-11.md) (mốc "trước") và [kế hoạch sửa](ai-quality-fix-plan-2026-11-11.md), mục (d) và mục "Quyết định của người dùng".

## 0. Kết luận nhanh

- **Không ô nào đủ điều kiện ghi đè ngay** ngoài bài ngày A1 và A2. Hai ô này cũng chỉ GO có điều kiện: A2 phải sửa IPA giả `/ˈX.X/` ở bước R2 trước.
- Các chỉ số **đạt** mục tiêu:
  - Bài ngày đạt trong 3 lần: 83%.
  - B1 bài ngày qua gate: 6/6.
  - Vị trí đáp án: bài ngày, bài ôn và đề lên cấp đều cân bằng sau khi xáo.
  - Rò thẻ XML: 0.
  - Tiền tố "That's clear:": 0.
  - Câu hỏi bị nhân đôi: 0.
  - Câu trộn tiếng Việt được tính lượt: 0.
  - Coach sửa lỗi chính xác 94%.
- Các chỉ số **trượt** mục tiêu:
  - Bài ngày đạt ngay lần đầu: 3,3%, mục tiêu ≥ 60%.
  - Bài ôn đạt: 35%, mục tiêu ≥ 80%.
  - Đề tháng: route chỉ chấp nhận 1/10 lần sinh.
  - Đề lên cấp: gate chỉ cho qua 1/12 đề. Ngay đề qua gate, người đọc vẫn thấy 2 đáp án sai.
  - Season rơi về câu mẫu: 12,9%, mục tiêu ≤ 5%.
- **Luật "lựa chọn dài nhất ≤ 35%" của đề lên cấp làm gate trượt rất thường xuyên.** Luật này xuất hiện trong 9/12 đề. Có 6/12 đề trượt **chỉ** vì luật này. Model gốc đặt đáp án đúng là lựa chọn dài nhất ở 30–70% số câu Đọc. Xáo vị trí không thay đổi được độ dài lựa chọn.

## 1. Cách đo

- **Harness:** `.artifacts/ai-quality-remeasure-2026-11-11/run.mjs` (mở rộng từ bản gốc) và `analyze.mjs` (xuất mọi chỉ số ở mục (d)).
  - Harness chạy trong `e4s-local-api-1` từ `/tmp/aiqr`, thư mục này đã xóa sau khi chạy.
  - Model `claude-haiku-5-5` lấy theo env, không đổi.
  - Không ghi DB, không duyệt và không phát hành gì. Không sửa code trong repo hay container.
- **Hàm thật của bản build mới:**
  - `generateMonthlyDayWithAi` / `generateMonthlyReviewWithAi`, gồm D1 `applyMonthlyLockedPlanFields` và `shuffleMonthlyAnswerOrder`.
  - `generateMonthlyFinalListening`, `generateMonthlyFinalProductive`, `assembleMonthlyFinalFromAi`.
  - `assembleLevelFormFromAi`, gồm xáo đáp án và gate WP5.
  - Season và Coach: `runCoachWithPersonaRepair`, `coachPracticeTurnGateReason`, `coachPracticeTurnPolicy`, `coachInsufficientFollowUp`, `repeatCurrentQuestionForOffTopic`, `normalizeCoachVocabularyUnlocks` và `logRoleplayDiagnostics` (log có cấu trúc được thu lại).
- **Hai đoạn vẫn phải sao lại từ route vì chưa được export:**
  - Lát Reading của đề tháng (`monthly-final-routes.ts:111-162`, dùng đúng lời prompt WP10 hiện tại).
  - Ba lượt gọi lát và `completeLevelFormReading` của đề lên cấp (`assessment/routes.ts:556-562`, `:1102`).
- **Prompt:**
  - Dùng `system_rules` + prompt của task theo `prototypePromptDefaults` trong bản build.
  - Không prompt active nào trong DB do manager phát hành. Vì vậy lần gọi route thật kế tiếp sẽ tự đồng bộ sang đúng các nội dung này, kể cả `level_form_generation` mới.
- **Đầu vào:** đọc `curriculum_contract` của 5 khung tháng 11 trong `e4s-local-postgres-1`, chỉ đọc.
  - **A1:** dùng plan v2 đã duyệt.
  - **B1, C1:** bể nháp, dùng `planMonthlyResourcePool` để lập plan v2 trong bộ nhớ.
  - **A2:** plan v1 đã duyệt.
    - Bể A2 không lập lại được, vì thiếu quan hệ umbrella/synonym và `backfillMonthlyCurriculumPlan` từ chối.
    - Phạm vi bài ôn được suy ra trong bộ nhớ.
    - Chạy y nguyên plan đã duyệt thì bài ôn tuần 1 vẫn lỗi `unresolved grammar or pronunciation scope`.
  - **B2:** bể nháp cũ, không lập plan được.
    - Lịch ngày v1 được dựng trong bộ nhớ bằng cách chuyển vị lịch A2 sang (`a2-*` → `b2-*`).
    - Kết quả B2 chỉ phản ánh khả năng sinh trên dữ liệu cũ.
- **Mẫu:** mỗi level có:
  - 6 bài ngày (N1, N2, N7, N8, N13, N16);
  - 4 bài ôn (tuần 1–4);
  - 2 đề tháng;
  - 3 đề lên cấp (A2–C1), nhiều hơn 2 để ước lượng tỉ lệ trượt;
  - 12 lượt Season đơn: 6 loại tình huống × Formal/Informal;
  - 1 hội thoại 6 lượt.

  Tổng 1 396 lượt gọi provider.
- **Lần chạy 1** cho 5 level song song và bị `AI_PROVIDER_RATE_LIMIT`: đề tháng, đề lên cấp và Season gần như hỏng hết. Kết quả đó lưu ở `run1-ratelimited/` và không tính. Phần đó đã chạy lại tuần tự (lần chạy 2, không có lỗi rate-limit).
  - Bài ngày và bài ôn giữ kết quả lần 1. Chỉ 5 lượt gọi dính rate-limit, và đều đã được retry thành công.
- Kết quả thô nằm ở `.artifacts/ai-quality-remeasure-2026-11-11/out/*.json`. Chỉ số tổng hợp ở `metrics-summary.txt` và `metrics.json`.

## 2. Ma trận level × loại nội dung

Ký hiệu: Đ = đạt tiêu chí ở mục (d), T = trượt. Rubric là điểm /10 trên thang R1–R9 của báo cáo gốc.

| Loại | A1 | A2 | B1 | B2 | C1 |
|---|---|---|---|---|---|
| Bài ngày (gate trong 3 lần / rubric) | **Đ** 6/6 · 7,0 | **Đ** 6/6 · 7,0 | **T** 6/6 nhưng objective tiếng Việt · 6,0 | **T** 3/6 · 5,0 | **T** 4/6 · 6,0 |
| Bài ôn thứ Sáu | **T** 1/4 · 5,0 | **T** 2/4 · 5,5 | **T** 1/4 (1 lỗi parse) · 4,5 | **T** 1/4 (1 lỗi parse) · 4,5 | **T** 2/4 (1 lỗi parse) · 5,0 |
| Đề tháng (route chấp nhận) | **T** 1/2 · 6,0 | **T** 0/2 · 5,5 | **T** 0/2 · 5,5 | **T** 0/2 · 5,5 | **T** 0/2 · 5,5 |
| Đề lên cấp (gate WP5 + người đọc) | — | **T** 1/3, đề qua gate có 2 key sai | **T** 0/3 | **T** 0/3 (1 lỗi schema) | **T** 0/3, đọc 1 đề thấy 2 key sai |
| Season (rơi về câu mẫu ≤ 5%) | **T** 28,6% | **T** 21,4% | **T** 7,1% | **Đ** 0% | **T** 7,1% |
| Coach (trộn Việt được tính = 0, bản dịch lệch = 0, sửa đúng ≥ 85%) | **Đ** | **Đ** | **Đ** | **Đ** | **Đ** (7% lượt mất nhận xét vì bị cắt) |

## 3. Chỉ số trước → sau, so với mục tiêu

| Chỉ số | Trước | Sau | Mục tiêu | Kết quả |
|---|---|---|---|---|
| Bài ngày đạt ngay lần đầu | 0% | **3,3%** (1/30) | ≥ 60% (vì đã làm D1) | T |
| Bài ngày đạt trong 3 lần | 33% | **83%** (25/30) | ≥ 80% | Đ |
| B1 bài ngày | 0/6 | **6/6** | ≥ 5/6 | Đ về gate, xem lưu ý B1 ở mục 4.1 |
| Bài ôn đạt | 3/7 | **7/20 = 35%** | ≥ 80% | T |
| Vị trí A ở bài ôn | 86% | **28,7%** (A/B/C/D = 58/56/54/34) | ≤ 30% | Đ |
| Vị trí đáp án bài ngày | A 51, B 44, C 16, D 1 | **25,8 / 25,8 / 25,8 / 22,6%** | mỗi vị trí ≤ 35%, D ≥ 15% | Đ (D thấp nhất 20%, ở A1) |
| Vị trí D ở bài ôn | 0% | 16,8% tổng; B1 14,8%, B2 14,3% | (bài ngày: D ≥ 15%) | sát ngưỡng |
| Đáp án đúng là lựa chọn dài nhất duy nhất | — | bài ngày 32,7%, bài ôn 38,1%, Đọc đề lên cấp 42–70% | đề lên cấp ≤ 35% | T ở đề lên cấp |
| Vị trí B ở đề lên cấp B1 | 32/40 | **10/40** sau xáo (bản thô 23, 30, 17/40) | ≤ 12/40 | Đ |
| Vị trí đề lên cấp (mọi level) | — | đúng 25% mỗi vị trí | 20–30% | Đ |
| Đề tháng: route chấp nhận | 5/51 (DB) | **1/10** | (GEN01–23 không có fail) | T |
| Season rơi về câu mẫu | 30% | **12,9%** (9/70) | ≤ 5% | T |
| Rò thẻ XML | 6/23 | **0/70** | 0 | Đ |
| Tiền tố "That's clear:" | 5/23 | 0 | 0 | Đ |
| Câu hỏi bị nhân đôi khi lạc đề | có | 0 | 0 | Đ |
| Câu trộn tiếng Việt được tính lượt | có | 0 (10/10 bị gate code chặn) | 0 | Đ |
| Bản dịch lệch lời đang hiện | phổ biến | 0 trong các lượt đã đọc, nhưng **24% lời Season không có bản dịch** (17/70) | 0 lệch | Đ, kèm hồi quy UX |
| Đề A1–A2 viết bằng tiếng Anh (bài ngày và bài ôn đã qua gate) | 127 | **0** | 0 | Đ |
| Vi phạm HV-R49 (đã qua gate) | 15/22 bài | **0** | 0 | Đ |
| Dạng từ bịa trong bài đã qua gate | nhiều | 1 ("feedbacks" ở A1 ôn tuần 1), còn lọt "videoly" ở A1 N8 | 0 | gần đạt |
| Sửa lỗi chính xác (Coach) | ~6/10 | **17/18 = 94%** | ≥ 85% | Đ |

**Fallback Season theo vi phạm** (lấy từ `roleplay.fallbackViolations` và log `SEASON_ROLEPLAY_FALLBACK`):

| Vi phạm | Số lượt |
|---|---|
| "Season repeated a question already asked in this month's topic." | 8 |
| "Next question must be an in-character anchor…" | 1 |

Vi phạm văn phong (viết tắt, emoji…) nay chỉ còn là cảnh báo: 37/70 lượt có vi phạm của model, nhưng không còn rơi về câu mẫu.

## 4. Lỗi còn lại, kèm trích dẫn và vị trí code

### 4.1 Bài ngày

**1. Gần như không bài nào đạt ngay lần đầu (1/30).** Nguyên nhân theo lượt:
- **A1–A2:** `MONTHLY_A1A2_INSTRUCTION_LANGUAGE` (12 lượt). Đề word form và grammar vẫn viết bằng tiếng Anh ở lượt đầu.
- **B1+:** `MONTHLY_CONTENT_INVALID` (B1+ phải toàn tiếng Anh) ở `instruction`, `objective`, `writing`… (khoảng 70 phát hiện), do chính input tiếng Việt:
  - `daySpec.skillExercises[].focus` luôn bằng tiếng Việt ở mọi level (`packages/domain/src/monthly/curriculum.ts:820-830`). Dòng `word_class` còn ghi "Nhận diện từ loại của các từ cốt lõi ngày học.", trái HV-R49.
  - `grammarPlan.objective` của B1 bằng tiếng Việt (dữ liệu `dailyObjectives` của bể).
  - `monthlyDailyTeachingContract` (`monthly-day-generation.ts:13`) dán nguyên objective này vào prompt.
- Ngoài ra còn `MONTHLY_DAILY_GRAMMAR_EXAMPLES` và `MONTHLY_DAILY_GRAMMAR_WORDS` (mỗi mã 6 lượt).

**2. B1 hiện objective ngữ pháp bằng tiếng Việt cho học viên** (4/6 bài, ví dụ N7: "Nhận biết cấu trúc could/would + you + V1 và mức độ lịch sự so với can/will.").
- D1 khóa `grammar.objective` bằng giá trị của plan, và WP1a cho trường này bỏ qua kiểm tiếng Việt. Vì vậy gate qua nhưng vẫn vi phạm R3/R4.
- Cách sửa: bước R2 sinh lại bể B1 có `dailyObjectives` tiếng Anh (gate WP9). Chưa làm thì ô B1 là NO-GO.

**3. B2:** 3/6 bài trượt vì dữ liệu.
- Âm `/ɪ/` có từ ví dụ `feedback /ˈfiːdbæk/`: "feedback không chứa âm mục tiêu /ɪ/ trong IPA".
- Có lỗi `MONTHLY_INTERNAL_TERM_EXPOSED`.
- Bể B2 cũ cần sinh lại ở R2.

**4. C1:** 2/6 bài trượt.
- Lỗi lặp lại ở C1 N1 là "Bài điền cần có đúng một chỗ trống ___." (writing).
- Lỗi lặp lại ở C1 N2 là vocabulary B1+ có tiếng Việt.
- CEFR không hợp: C1 N8 dạy will/can/could (mức A2–B1) và âm /θ/. Đây là dữ liệu bể.

**5. Còn lọt qua gate:**
- A1 N8 word form có hai đáp án đúng: "Please send me the meeting ____ after the call." với note/notes (key là "notes"). Đề còn ghi "từ trong ngoặc" nhưng câu không có ngoặc.
- A1 N8 word use có từ bịa "watch the videoly". `inventedWordForms` không bắt hậu tố `-ly` gắn vào danh từ.
- B1 N7 word form: "Our senior ____ confirmed…" chấp nhận cả engineer lẫn engineers.

### 4.2 Bài ôn thứ Sáu (7/20)

**1. Word form buộc phải có 4 dạng thật của cùng một họ từ.**
- Contract nằm ở `monthly-day-generation.ts`, hàm `monthlyReviewExerciseContract`, dòng `word_class.items`.
- Với danh từ không có họ từ (feedback, deadline, colleague), model bịa từ, gate WP3 chặn đúng, rồi model lặp lại 3 lần: `MONTHLY_INVENTED_WORD_FORM` 22 lượt.
- Ví dụ: "feedbacking, feedbacked", "deadlined, deadlining", "colleagued, colleagueship", "revisely".
- Cần chọn từ có quan hệ `word_family`, hoặc cho phép dạng số nhiều/thì.

**2. Lượt sinh phần bài tập (14 000 token) thường trả thiếu mục.**
- `MONTHLY_REVIEW_COUNT` 22 lần, ví dụ "Listening needs one word-recognition item per core word (12); it has 1".
- Ngoài ra còn `READ_ALOUD_MISSING`, `MINIMAL_PAIRS`, `FREE_RESPONSE_MISSING`.

**3. 3/20 lần chết với `AI_OUTPUT_INVALID`** ("lesson.parts: expected array, received string"), cả 3 ở lượt bài tập.
- Code chỉ parse lại chuỗi JSON hợp lệ (`packages/ai/src/schemas.ts:700-715`, `parseModelJson`). Chuỗi hỏng thì làm hỏng cả bài.

**4. B1+ có đề tiếng Việt mà gate không bắt.**
- Ví dụ "Nghe và chọn nghĩa đúng" ở B1 (12 câu), C1 (13 câu), B2 (4 câu). B2 W3 có "Chọn dạng đúng của từ để điền vào chỗ trống…".
- Contract ghi tiếng Việt trước, phần cho B1+ để trong ngoặc: `"Nghe và chọn nghĩa đúng" (B1+: "Listen and choose the meaning")`.
- `evaluateMonthlyReviewSections` không kiểm ngôn ngữ của đề.

**5. Phát âm:**
- Gate WP8 qua nhưng nhiều cặp vẫn không phải cặp tối thiểu: "event/segment", "correct/count", "bat/box", "sheet/shift", "bomb/bond".
- Câu đọc to bị nhồi từ: "Our team will check the tracks and fix the links before we talk to the client about the books and looks of the new report." (B1 tuần 3).
- Câu sai ngữ pháp: "…confirm the extend date with the client today." (C1 tuần 2).

**6. Dữ liệu:**
- A2 tuần 2 trượt vì IPA giả: "Âm mục tiêu /ˈX.X/ không thuộc inventory".
- B2 tuần 2 có âm "/ˈ/".
- Bài đọc B1 tuần 3 dài 130 từ, vượt 120 (gate chỉ cảnh báo).
- B1 tuần 3 thiếu `variants` ở 22 câu.

### 4.3 Đề thi tháng (1/10 được route chấp nhận)

**1. Lỗi `AI_OUTPUT_INVALID` sau khi đã repair (4/10):**
- Câu đọc to: "The passage has 17 words; use at most 14." (B1), "P2 has point in this passage…" (C1).
- Bằng chứng ngữ pháp: "Grammar evidence does not apply the selected taught component" (A1, B2).
- Mỗi đề tốn 12–92 lượt gọi.

**2. GEN07 trượt ở 5/6 đề ráp được.**
- Câu Reading không có câu hỏi, ví dụ B1 R03: "Our supplier sent the wrong files, so we must contact the supplier today…" (không có "?" hay chỗ trống).
- Có câu mà từ đích không nằm trong câu ngữ cảnh ("tolerance", "clarify" chỉ có ở câu hỏi).
- Prompt WP10 (`monthly-final-routes.ts:118-122`) chưa đủ. Cần một bước sửa riêng cho GEN07, tương tự repair lựa chọn dài nhất.

**3. GEN22 mới:** đạt ở cả 6 đề ráp được.
- A1–A2: đề Writing/Speaking bằng tiếng Việt.
- B1–C1: đề bằng tiếng Anh.

**4. Rubric:** không thấy đáp án sai trong 2 đề đã đọc (A1-1, B1-2). Vẫn còn:
- Lỗi script cũ "we will reply to the client quick" (A1).
- Câu đọc to vô nghĩa: "We check the books and extend the second round after talks." (B1), "Both teams thank the manager for the back-up plan." (A1).
- Tiêu đề sai "– Productive Part".
- Reading A1 vẫn 24/24 câu là "What does X mean?".

### 4.4 Đề lên cấp (gate cho qua 1/12)

**1. Luật lựa chọn dài nhất ≤ 35%** (`level-form-quality.ts:62`, severe) xuất hiện ở 9/12 đề. 6/12 đề trượt **chỉ** vì luật này.
- Tỉ lệ thô ở phần Đọc: 17–28/40.
- Tỉ lệ thô ở phần Nghe: 8–12/20.
- Câu bù của `completeLevelFormReading` còn kéo tỉ lệ lên, vì lựa chọn đúng của chúng dài hẳn, ví dụ C1-2 R37–R40.
- Gate chạy trên mẫu cũ cũng cho kết quả tương tự: 2/3 đề cũ trượt luật này (`_levelup-baseline-gate.json`).
- **Kết luận:** chỉ thêm lời vào prompt (WP5) là không đủ. Ở tỉ lệ trượt này, Vận hành gần như không sinh được đề. Cần một trong ba hướng, và cả ba đều phải đưa người dùng quyết vì đổi cách sinh:
  - một lượt AI sửa lựa chọn, giống repair Reading của đề tháng;
  - hạ luật xuống light;
  - cho thử lại lát Đọc.

**2. Gate bắt đúng 3 câu NOT có key sai:**
- "đáp án “Cold food” có trong bài, còn “Gloves” không có" (A2-2).
- Pallets (B1-2).
- "The loading dock" (B1-3).

**3. Người đọc** (đã đọc trọn 3 đề, 180 câu: A2-1, B1-1, C1-2):
- **A2-1** (đề duy nhất qua gate) có 2 key sai:
  - R37 "What happens if you forget to tell Ms. Thu…? → *You must tell her before 8:30 a.m.*" (key không trả lời câu hỏi).
  - R40 "Why… before 8:30? → *So she can prepare the meeting room*" (bài không nói).
  - Ngoài ra R32 "Room 201 is likely to be… on the second floor" là suy diễn.
- **C1-2:**
  - R20 "Which statement about the contract is correct? → *It has already been signed*". Bài viết rằng hội đồng sẽ quyết có gia hạn hay không.
  - R29 "*Mandatory in Hanoi after three weeks*". Bài chỉ nói "partial extension".
  - Câu vòng vo: L5, L10.
  - R2 dùng chữ "most" trong khi bài nói "roughly a third".
- **B1-1:** không có key sai rõ. L1 diễn đạt mập mờ.
- **Mọi đề:** có 6–10 cặp câu hỏi trùng sự kiện, ví dụ C1-2 R2/R23/R39/R40. Gate chỉ bắt đề bài trùng nguyên văn.
- Tiêu đề vẫn là "… – Listening Section".
- A2 có đề Writing bằng tiếng Việt nhưng đề Speaking bằng tiếng Anh.

**4. Lỗi khác:**
- 1 lần `LEVEL_FORM_READING_REPAIR_DUPLICATE`.
- 1 lần `AI_OUTPUT_INVALID` (B2-2).

### 4.5 Season

**1. Còn rơi về câu mẫu** "I hear you mention “button.” What is the next step for “button”?". Gần như tất cả do "Season repeated a question…", nặng nhất ở hội thoại A1 và A2 (3/6 lượt).
- Câu mẫu sau đó thành `nextQuestion` và lan sang lượt sau, ví dụ câu hỏi hiện tại thành "” What is the next step for “button”?" (dư dấu ngoặc).
- Vị trí:
  - so khớp "repeated question" trong `inspectRoleplayTurn` / `ROLEPLAY_REPEATED_QUESTION` (`coach/routes.ts:755-770`);
  - câu mẫu `coachInsufficientFollowUp` (`:416`).
- D2 (thử lại một lần trước khi rơi về câu mẫu) chưa được duyệt.

**2. Câu sai văn phong (tiếng lóng trong hội thoại Formal) bị gắn `off_topic` và không được tính lượt** ở B1, B2 và C1. Ví dụ "Hey, gimme the file and we just do it faster lol" có `status=off_topic`. Spec yêu cầu coi là đúng chủ đề, chỉ trừ điểm Ý.

### 4.6 Coach

**1. 24% lời Season không có bản dịch** (17/70). Ngoài ra 19/70 câu gợi ý và 26/70 `nextQuestionTranslation` cũng không có bản dịch.
- WP4c xóa bản dịch khi không khớp. Không còn bản dịch sai, nhưng học viên mất bản dịch.
- Gốc ở `mergeAcceptedRoleplay`: lượt feedback không chép đúng nguyên văn. Hướng xử lý là D6.

**2. `coach_dialogue` bị cắt** (`AI_OUTPUT_TRUNCATED`) ở 5/70 lượt (C1 4/14), vì `maxOutputTokens: 1_400` (`coach/routes.ts:932`). Lượt vẫn được tính nhưng không có nhận xét.

**3. `noteVi` mâu thuẫn với `countsTowardGoal`** ở 2 lượt:
- B1 grammar có note "Câu trả lời chưa đạt điều kiện đếm…" nhưng vẫn có `countsTowardGoal=true`.
- A1 hội thoại lượt 5 cũng vậy.

**4. Sửa lỗi:** có 1 lần sửa sai, "I am sorry." → "I'm sorry." (câu gốc không có lỗi). Có 1 lỗi bị bỏ sót: "If the client will reject it" ở B2.

## 5. GO / NO-GO cho giai đoạn ghi đè (R2–R7)

| Ô | Quyết định | Điều kiện hoặc lý do |
|---|---|---|
| R2 tài nguyên A1–C1 | **GO, bắt buộc làm trước** | Lỗi dữ liệu là gốc của phần lớn các ô trượt: IPA giả A2/B2, objective tiếng Việt B1, bể A2/B2 cũ không lập plan được, CEFR C1. Sau R2 phải đo lại ma trận |
| Bài ngày A1 | **GO** | Gate 6/6, vị trí cân bằng, không còn đề tiếng Anh |
| Bài ngày A2 | **GO có điều kiện** | Chỉ sau khi R2 sửa âm `/ˈX.X/` và có plan v2 |
| Bài ngày B1 | **NO-GO** | Objective tiếng Việt hiện ra cho học viên. Cần R2 với `dailyObjectives` tiếng Anh |
| Bài ngày B2 | **NO-GO** | Dữ liệu B2 cũ, 3/6 bài trượt |
| Bài ngày C1 | **NO-GO** | 4/6 bài, CEFR không hợp |
| Bài ôn mọi level (R3) | **NO-GO** | 35% đạt. Cần sửa contract word form, xử lý `lesson.parts` dạng chuỗi và kiểm ngôn ngữ B1+ trong gate bài ôn |
| Đề tháng mọi level (R4) | **NO-GO** | Route chấp nhận 1/10. GEN07 và câu đọc to trượt thường xuyên |
| Đề lên cấp A2–C1 (R5) | **NO-GO** | Gate cho qua 1/12. Đề qua gate vẫn có 2 key sai. Luật lựa chọn dài nhất cần người dùng quyết |
| Season / Coach (R6, WP4) | **NO-GO theo luật chặn rollout** | Season trượt ở A1, A2, B1 và C1. Theo luật, Season trượt ở bất kỳ level nào thì không deploy WP4. Riêng Coach đạt tiêu chí |
| Phát hành (R7) | **NO-GO cho mọi level** | Chưa level nào có mọi ô đạt |

**Hồi quy cần có test trước khi chạy lại:**
- Word form của danh từ không có họ từ.
- `lesson.parts` dạng chuỗi hỏng.
- Đề tiếng Việt trong bài ôn B1+.
- Từ bịa "videoly".
- Hai đáp án ở word form (note/notes).
- Câu lóng bị gắn `off_topic`.
- Câu mẫu lan sang `nextQuestion`.
- `noteVi` mâu thuẫn với `countsTowardGoal`.
