# Báo cáo chất lượng nội dung AI của E4S · 11/11/2026

Người thực hiện: agent AI-QUALITY. Phạm vi: bài học ngày theo tháng, bài ôn thứ Sáu, đề thi tháng, đề thi lên cấp, pass course, luyện với Season và phần nhận xét của Coach.

## 0. Tóm tắt

| Loại nội dung | Gate tự động | Chất lượng sư phạm (thang 10) | Nhận xét |
| --- | --- | --- | --- |
| Bài học ngày (`monthly_lesson_day`, bài mới) | Đạt 6/20 lượt sinh (30%). Không lượt nào đạt ngay ở lần gọi đầu. B1 đạt 0/6, ngày K1 đạt 0/4 | **5,0** | Bám đúng phạm vi khóa và có bối cảnh công sở tốt. Nhưng A1–A2 có phần lớn đề bằng tiếng Anh, đáp án lệch vị trí và đáp án nhiễu yếu. Phần Word form thực chất là hỏi từ loại |
| Bài ôn thứ Sáu (`monthly_lesson_day`, kind review) | Đạt 3/7 | **4,0** | Đủ 6 phần và đủ số câu. Nhưng 86% đáp án nằm ở vị trí A. Cặp tối thiểu thường không phải cặp tối thiểu, có một cặp phản cảm. Câu đọc thành tiếng vô nghĩa |
| Đề thi tháng (`monthly_final_*`) | A1 đạt 0/2 lượt mới, lịch sử DB đạt 5/51. B1 đạt 1/1 | **5,0** | Bộ kiểm tra GEN01–GEN23 tốt nhất trong app, có cân bằng vị trí đáp án. Nhưng GEN22 kiểm sai nên đề B1 có đề bài tiếng Việt vẫn qua. Câu Reading chỉ là ghép định nghĩa. Đáp án nhiễu ngớ ngẩn |
| Đề thi lên cấp (`level_form_*`) | Không có gate nội dung, chỉ kiểm schema | **4,5** | Tiếng Anh công sở tự nhiên, đúng tầm B1. Nhưng có **3 đáp án sai đã xác nhận**, đáp án dồn vào B (32/40 ở bản B1 trong DB), không xáo đáp án và bối cảnh lặp lại |
| Pass course Form A | Không do AI sinh (blueprint tĩnh) | không chấm | Chỉ ghi nhận: đáp án Reading lệch B (24/40) từ tài liệu nguồn |
| Luyện với Season (lượt hội thoại) | Có bộ kiểm persona và fallback | **4,0** | Khi lượt AI được nhận, lời thoại đúng vai và đúng văn phong. Nhưng 30% lượt bị thay bằng câu mẫu vô nghĩa, có tiền tố "That's clear:" chèn vào và câu hỏi bị lặp. Season không được truyền từ vựng hay ngữ pháp của tháng |
| Nhận xét của Coach (`coach_dialogue`) | Kiểm schema và kiểm lỗi thiếu hệ từ | **5,5** | Chấm điểm và sửa lỗi phần lớn hợp lý, giải thích bằng tiếng Việt. Nhưng bản dịch không khớp lời Season đang hiện, rò rỉ thẻ XML vào bản dịch (6/23 lượt) và câu trộn tiếng Việt vẫn được tính lượt hợp lệ |

**Kết luận chung:** khi gate tự động báo đạt, nội dung chỉ mới đúng hình thức. Nhiều lỗi sư phạm nằm ngoài tầm của gate: ngôn ngữ đề A1–A2, đáp án nhiễu, vị trí đáp án, câu vô nghĩa, cặp âm sai và đáp án sai ở đề lên cấp. Ngược lại, phần lớn lượt gate trượt là do lỗi chép trường kỹ thuật mà code có thể tự điền. Nội dung của các lượt trượt không hề kém hơn.

## 1. Phương pháp và môi trường

### 1.1 Nguồn rubric đã dùng

| Mã | Nguồn | Dùng cho |
| --- | --- | --- |
| R1 | `apps/api/src/modules/content/monthly-quality.ts` (gate bài ngày: phạm vi từ, ngữ pháp, âm, 3–5 câu ngữ pháp, recall N8, 8 vị trí đọc) | Bài ngày, bài ôn |
| R2 | `apps/api/src/modules/content/monthly-review-quality.ts` cùng spec `e4s_cau_truc_bai_on_cuoi_tuan` (VH-R51, VH-R52): 6 phần, 12 câu nghe, word use 4–5, word form 3–4, đọc 60–120 từ, 2 cặp tối thiểu, câu đọc to, câu trả lời tự do | Bài ôn |
| R3 | `packages/domain/src/content/index.ts` `validateLessonPublication` (đủ phần, đáp án nằm trong lựa chọn, B1+ toàn tiếng Anh, IPA chứa âm đích) | Bài ngày |
| R4 | Spec final 13/11 (`.tmp-e4s-spec-final.txt`): VH-R41–R45 và HV-R41–R49. Gồm: A1–A2 giải thích tiếng Việt, B1–C1 tiếng Anh; Word form không ghi từ loại và không dùng "-----"; không ép syn/anto | Bài ngày, bài ôn |
| R5 | "Cấu trúc bài thi cuối tháng & quy tắc AI v2.0": GEN01–GEN23 và hồ sơ level (`.tmp/canonical-five-docs.txt`). Kiểm tra tự động trong `apps/api/src/modules/assessment/monthly-final-checks.ts` | Đề thi tháng |
| R6 | "Luyện với Season & Đường lên mức": 5 điều kiện lượt hợp lệ, số từ tối thiểu theo level, rubric Ý 0–2 / Từ 0–1,5 / Ngữ pháp 0–1,5, không lặp câu hỏi, văn phong Formal/Informal | Season, Coach |
| R7 | `docs/superpowers/specs/2026-10-30-lesson-generation-quality-design.md`: lỗi chặn gồm đáp án sai hoặc mơ hồ, lệch nguồn/câu/đáp án, vi phạm CEFR hoặc ngôn ngữ | Mọi loại |
| R8 | Prompt `system_rules` đang active: ngôn ngữ theo CEFR, A1/A2 giải thích tiếng Việt, nội dung công sở | Mọi loại |
| R9 | Đánh giá sư phạm riêng của agent. Gồm: CEFR fit, liên quan công việc, tiếng Anh đúng, tiếng Việt tự nhiên, đáp án đúng, đáp án nhiễu hợp lý, không trùng lặp, đề rõ ràng, đa dạng dạng bài | Mọi loại |

### 1.2 Cách sinh mẫu mới an toàn

- **Không ghi vào DB nào.** Script `.artifacts/ai-quality-2026-11-11/run.mjs` chạy bên trong container `e4s-auth-preview-api`. Container này dùng đúng bản code đã build: md5 của `monthly-day-generation.js` và `monthly-quality.js` trùng với `e4s-local-api-1`. Script cũng dùng đúng credential môi trường và model hiện hành **`claude-haiku-5-5`**. Script gọi trực tiếp các hàm sinh bài (`generateMonthlyDayWithAi`, `generateMonthlyReviewWithAi`, `generateMonthlyFinalListening`, `generateMonthlyFinalProductive`, `assembleMonthlyFinalFromAi`, `runCoachWithPersonaRepair`). Phần sinh đề lên cấp và Reading của đề tháng là bản sao từng dòng của logic trong route, chỉ bỏ bước lưu DB.
- Đầu vào lấy bằng truy vấn chỉ đọc từ DB 4175 (`e4s-local-postgres-1`): `curriculum_contract` của 5 khung tháng 11/2026 và prompt active gồm `system_rules` cùng `monthly_lessons`, `monthly_final_generation`, `coach_dialogue`. Bể tài nguyên B1 và C1 chưa có lịch nên được chia ngày trong bộ nhớ bằng `planMonthlyResourcePool`, giống lúc Vận hành chốt cốt lõi.
- Không duyệt, không sửa khung nào, không đổi model và không sinh lại ảnh minh họa. Thư mục tạm `/tmp/aiq` trong container đã xóa sau khi lấy kết quả về.
- Các instance cách ly 4296/4298 (API 4295/4297 trên `e4s-support-responsive-db`) **không cấu hình AI** (`buildApi` không có `aiRunner`) và chỉ có dữ liệu fixture. Vì vậy chúng không dùng được để sinh nội dung.
- Kết quả thô nằm ở `.artifacts/ai-quality-2026-11-11/out/*.json`. Ứng viên đã ghép phần nằm ở `cand/*.json`, kết quả heuristic ở `lesson-heuristics.txt` và mốc ban đầu ở `baseline/*.json`.

### 1.3 Mẫu đã xem

- **Mốc ban đầu (DB 4175, chỉ đọc):**
  - Khung A1 `710d035d-b73e-42fe-809a-75445d27163c` gồm N1 đã duyệt (`month_lessons f48b1df6…`, lesson `3435c485…`), N2 (`5cb68009…`), N3 (`c4d3a819…`) và bài ôn tuần 1 (`1f2b1580…`, lesson `ba1ea361…`).
  - Đề `monthly-final-2026-11-a1` v5 (draft), `level-up-a2` v6, `level-up-b1` v1, `pass-course-form-a` v1 và `placement-a` v1.
  - 24 `ai_runs` coach_dialogue (4–6/11) và 8 `coach_turns`.
  - 51 `ai_runs` monthly_final_generation.
- **Mẫu mới:**
  - 28 lượt sinh bài: 20 bài mới và 8 bài ôn. Phân bố: A1 ×11, A2 ×4, B1 ×9, C1 ×5. Một lượt A2 ôn bị lỗi đầu vào.
  - 3 lượt đề thi tháng (A1 ×2, B1 ×1) và 3 đề lên cấp (B1 ×2, A2 ×1).
  - 23 lượt Season: 11 lượt đơn lẻ trải A1–C1, Formal/Informal và các ca lạc đề, trộn tiếng Việt, sai ngữ pháp, sai văn phong; thêm 2 hội thoại 6 lượt ở A2 Informal và B1 Formal.
  - Tổng 272 lượt gọi provider.

## 2. Độ trễ, lần thử và tỉ lệ trượt

| Task | Số lượt gọi | p50 | p90 | max | Token ra p50 |
| --- | --- | --- | --- | --- | --- |
| `monthly_lesson_day` | 82 | 6,9 s | 19,5 s | 27,5 s | 2 011 |
| `monthly_final_reading_generation` | 4 | 13,4 s | 14,4 s | 14,4 s | 3 111 |
| `monthly_final_productive_generation` | 4 | 8,2 s | 10,4 s | 10,4 s | 2 539 |
| `monthly_final_listening_message_generation` | 9 | 5,0 s | 6,9 s | 6,9 s | 1 462 |
| `monthly_final_grammar_evidence_review` | 88 | 1,3 s | 1,5 s | 2,2 s | 112 |
| `monthly_final_*_repair` (gộp) | 49 | ~1,5 s | ~2,7 s | 3,2 s | ~100–500 |
| `level_form_reading_generation` | 4 | 8,9 s | 12,8 s | 12,8 s | 2 613 |
| `level_form_listening_generation` | 3 | 7,4 s | 12,9 s | 12,9 s | 2 172 |
| `coach_roleplay_turn` | 11+ | 1,4 s | 1,8 s | 1,8 s | 183 |
| `coach_dialogue` (feedback) | 12+ | 4,2 s | 4,5 s | 6,0 s | 1 046 |

- Không có lỗi provider (0/272) và không có timeout. Với Haiku, AI **không chậm**: mỗi bài mất 12–61 giây, trung vị 19 giây cho bài mới và 33 giây cho bài ôn. Một đề tháng mất 27–60 giây nhưng cần **31–102 lượt gọi**, phần lớn là repair và review bằng chứng ngữ pháp. Một lượt Season mất 5–11 giây vì gồm hai lượt gọi nối tiếp.
- **Bài ngày và bài ôn:**
  - 9/27 lượt có đầu vào hợp lệ đạt gate (33%): 8 lượt đạt ở lần sửa thứ 2, 1 lượt ở lần thứ 3. Không lượt nào đạt ở lần đầu. 18 lượt trượt sau đủ 3 lần.
  - Nguyên nhân trượt: B1+ có tiếng Việt trong grammar hoặc objective (7 lượt); pronunciation thiếu `stage`/`objective` (4); công thức K1 không khớp (4); phạm vi âm của bài ôn hoặc K1 không khớp (4); cặp tối thiểu sai (3); IPA giả `/ˈX.X/` (1).
  - 1 lượt A2 ôn không sinh được (`unresolved grammar or pronunciation scope`). Khung A2 **đã duyệt** dùng plan cũ nên bài ôn không dựng được phạm vi.
- **Đề thi tháng:** lịch sử DB 4175 có 51 lượt, 5 thành công (9,8%): 43 `AI_OUTPUT_INVALID` và 3 `MONTHLY_FINAL_GENERATION_QUALITY_FAILED`. Lỗi tập trung ở `candidates` của phần đọc thành tiếng (74 issue), `listening` (34) và `writing.gaMain` (14). Lượt mới: A1 trượt 2/2 ở `writing.gaMain` với lý do "Grammar evidence does not apply the selected taught component". B1 đạt 1/1.
- **Season:** 7/23 lượt (30%) bị thay bằng câu mẫu dự phòng và 1/23 lượt mất nhận xét AI. Mốc cũ trong DB có 7/24 lượt `feedbackStatus: unavailable`.

## 3. Bài học ngày theo tháng (`monthly_lesson_day`, bài mới)

**Cách sinh:** route `POST /api/v1/content/month-frameworks/:id/days/:n/generate` gọi `generateMonthlyDayWithAi` trong `apps/api/src/modules/content/monthly-day-generation.ts`, chạy tối đa 3 vòng sinh rồi sửa theo `report.severe`. Prompt gồm `system_rules` + `monthly_lessons` (DB `prompt_versions`), `MONTHLY_LESSON_PART_CONTENT_CONTRACT` (`packages/ai`) và `monthlyDailyTeachingContract`. Tham số: model `claude-haiku-5-5`, temperature 0,2, 8 000 token ra. Gate là R1 và R3.

**Mẫu:** mốc cũ A1 N1–N3. Mẫu mới A1 N2, N4 ×2, N5, N8, N13 ×2; A2 N1, N2, N5; B1 N1 ×2, N2, N8 ×2, N13; C1 N1 ×2, N8, N13.

| Tiêu chí | Điểm /10 | Bằng chứng |
| --- | --- | --- |
| Đúng phạm vi khóa (R1) | 8 | Khi đạt gate, từ, bước ngữ pháp và âm đúng khung. Gate R1 chặn tốt việc thêm từ hay đổi âm |
| Độ tin cậy khi sinh | 3 | Đạt 6/20. **B1 đạt 0/6** vì khung B1 có `grammarPlan.objective` bằng tiếng Việt (vd "Nhận biết cấu trúc have/has + V3…"), mà gate vừa bắt chép y nguyên objective (`MONTHLY_DAILY_GRAMMAR_OBJECTIVE`) vừa cấm tiếng Việt ở B1+. Hai luật mâu thuẫn nên không bao giờ đạt. Ngày K1 đạt 0/4 vì model diễn đạt lại công thức: "Last week / Yesterday…" thay cho "Last + time / Yesterday / Now…", và yêu cầu sửa không cho biết chuỗi đúng nên model lặp y hệt 3 lần |
| CEFR fit | 5 | A1 nhìn chung vừa sức. C1 N1 dạy client/present/problem cùng thì hiện tại hoàn thành và tiếp diễn, đây là mức A2–B1. Bể từ C1 trùng 17 từ với B1. Bài đọc A1 có câu trung bình 13 từ (3 lượt) |
| Liên quan công việc | 8 | Bối cảnh GFT, họp phản hồi khách hàng, demo, deadline đều nhất quán |
| Tiếng Anh đúng, tự nhiên | 6 | Lỗi gặp: "Minh is the project learner on the team" (ép từ *learn*), "Could you send me the new timeline quick, please?" (trong đề tháng A1), "The client has a new ___ about the design" với lựa chọn *easy*/*sheet*. Antonym ép: update ↔ delay |
| Ngôn ngữ hướng dẫn (R4, R8) | 3 | Có **127 đề hoặc câu A1–A2 viết bằng tiếng Anh**: grammar 35, word use 30, reading 28, word form 27, listening 7. Ví dụ "Which sentence uses 'learn' correctly in a workplace meeting?" (A1 N8). Bài A2 N2 có instruction hoàn toàn bằng tiếng Anh. Gate R3 chỉ ép B1+ toàn tiếng Anh, không ép A1–A2 có tiếng Việt |
| Đáp án đúng | 7 | Ở bài ngày hiếm gặp đáp án sai. Câu "recall" N8 không ôn chủ điểm A mà vẫn là *Can…?* (gắn `milestoneId` recall nên vẫn qua gate) |
| Đáp án nhiễu, vị trí đáp án | 3 | Ở 112 câu 4 lựa chọn của bài ngày, đáp án nằm ở A 51, B 44, C 16, **D 1**. A1 N8 có 8/8 câu đáp án ở A. Runtime học viên không xáo thứ tự (`apps/web` không có shuffle cho bài học). Có lựa chọn vô nghĩa như "She schedule very quick.", "file the send", "The movie director" và từ bịa "sended/maked/haves" |
| Rõ ràng của đề | 5 | Word form trong 15/22 bài hỏi "What is the word class of 'video'…?". Spec yêu cầu chọn hoặc điền dạng đúng và không nêu từ loại (HV-R49). Grammar ghi "Choose the correct sentence:" nhưng thực tế là bài điền chỗ trống. Có bài đẩy thuật ngữ nội bộ ra học viên: "one core term… one expanded term" và dán nguyên `communicationGoal` tiếng Việt vào đề Speaking (A2 N2) |
| Đa dạng | 5 | Mỗi kỹ năng chỉ có 1 câu và cùng một khuôn dạng giữa các ngày |
| **Tổng** | **5,0** | |

**Ví dụ tốt:**
- Câu nghe C1 N1 "What is the status of the login problem?" có đáp án "It is being fixed now." Câu này buộc người học phân biệt hiện tại hoàn thành với tiếp diễn.
- Giải thích ngữ pháp A1 bằng tiếng Việt rõ ràng: "Chủ ngữ 'the client' là số ít, nên ta dùng 'sends'…"

**Ví dụ xấu:**
- B1 N1 trượt 3/3 lượt chỉ vì objective tiếng Việt do chính khung tạo ra.
- A2 N2, đề Speaking: "Give a 30–45 second spoken update about 'Trong tháng 11, người học có thể…'".

## 4. Bài ôn thứ Sáu

**Cách sinh:** `generateMonthlyReviewWithAi` tách hai lượt gọi song song: tab học (10 000 token) và phần bài tập (14 000 token) theo `monthlyReviewExerciseContract`. Gate là R2 cùng R1.

**Mẫu:** mốc cũ A1 ôn tuần 1. Mẫu mới A1 tuần 2 ×2 và tuần 4; B1 tuần 1 ×2 và tuần 4; C1 tuần 1. A2 tuần 1 bị lỗi đầu vào.

| Tiêu chí | Điểm /10 | Bằng chứng |
| --- | --- | --- |
| Cấu trúc 6 phần, số câu (R2) | 8 | Đủ 12 câu nghe, word use 4–5, word form 3–4, đọc 1 bài 3 câu. Gate đếm tốt |
| Độ tin cậy khi sinh | 4 | Đạt 3/7. Trượt ở phạm vi âm (`reviewTargets`), cặp tối thiểu có 4 lựa chọn và objective tiếng Việt ở B1 |
| Phát âm (cặp tối thiểu, đọc to) | 2 | Mốc A1 ôn tuần 1 có cặp **"sheet/shit"** (phản cảm), "team/tim", "wake/work". Mẫu mới có "cost/caused", "list/request", "client/clientele/clean/climate", "round/rain/ground/row". Câu đọc to vô nghĩa: "Both of the staff think the project problem is three weeks early, so we will learn the first verb in the meeting." (A1); "The project manager will learn the work problem." (mốc cũ) |
| Đáp án, vị trí | 3 | Ở 205 câu bài ôn, đáp án nằm ở A **177 (86%)**, B 23, C 5, D 0. Riêng phần nghe, đáp án hay là nghĩa dài nhất. Word form thường có đáp án chính là từ cho sẵn trong ngoặc, ví dụ "(document)" → "document" |
| Đáp án đúng | 6 | "Please ____ your answer in the email." → *clear* là sai nghĩa. "We need to ____ the schedule" → *clear* được giải thích là "làm rõ", lệch nghĩa đã dạy (*clear* adj = rõ ràng). A1 tuần 2 hỏi word form với *send* và *person*, không phải từ tuần |
| Từ bịa làm đáp án nhiễu | 3 | feedbacked, sendded, gived, colleagueship, colleagued, revisely, accurating, "schedules well", "managing well" |
| Ngôn ngữ | 5 | A1 vẫn có "Read the message and choose the best answer.", "Describe a time you helped a client…". Câu trả lời tự do yêu cầu 4–6 từ, trong khi spec yêu cầu ≥2 từ tuần, và `requiredWords` lẫn từ không thuộc tuần như *could*, *effective*, *already* |
| Bài đọc | 7 | 60–120 từ, có đủ từ tuần, câu hỏi hiểu ổn. B1 tuần 1 là email tự nhiên. Một số câu hỏi vòng vo kiểu "Why has the client not confirmed…?" → lặp lại câu trong bài |
| Biến thể làm lại (VH-R52) | 5 | Nhiều câu thiếu `variants` (chỉ cảnh báo nhẹ, có bài 19 cảnh báo). Có biến thể kiểm một từ khác với câu gốc |
| **Tổng** | **4,0** | |

## 5. Đề thi tháng (v2.0)

**Cách sinh:** `POST /api/v1/month-frameworks/:id/monthly-final` (`monthly-final-routes.ts`) chạy 3 nhánh song song:
- Listening: `monthly-final-listening-generation.ts`, mỗi tin nhắn một lượt gọi.
- Reading: chia lát và sửa đáp án dài nhất.
- Productive: `monthly-final-productive-generation.ts`, có repair đọc to, mẫu Writing và review bằng chứng ngữ pháp từng câu.

Sau đó `assembleMonthlyFinalFromAi` ráp đề và `monthly-final-checks.ts` chạy GEN01–GEN23. Prompt nằm ở `monthly_final_generation`.

**Mẫu:** mốc cũ `monthly-final-2026-11-a1` v5. Mẫu mới A1 ×2 (trượt) và B1 ×1 (đạt toàn bộ kiểm tra tự động, 11 mục `needs_review`).

| Tiêu chí (GEN) | Điểm /10 | Bằng chứng |
| --- | --- | --- |
| GEN01–03, 11, 13–15, 17–19 (tự động) | 9 | Đúng N = 48, L16/R22/W6/S4 (B1), 8 vị trí phát âm. Đáp án được cân bằng (Nghe A6/B5/C5, Đọc A8/B7/C7) |
| Độ tin cậy khi sinh | 2 | Lịch sử 5/51, mới A1 0/2. Mỗi lượt sinh cần 31–102 lượt gọi |
| GEN22 ngôn ngữ theo level | 3 | **Đề B1 có Writing và Speaking B bằng tiếng Việt** ("Viết một email ngắn (80–100 từ)…", "Facts: - Đã hoàn thành…") mà GEN22 vẫn báo *pass*. `gen22()` (`monthly-final-checks.ts:416-431`) chỉ kiểm `section.instructions` và `group.instruction`, bỏ qua `task.prompt` |
| GEN05/07 Reading cần hiểu nghĩa | 4 | 22/22 câu B1 có dạng "… Which word is closest in meaning to 'X'?" và ghép định nghĩa. 5/22 câu không chứa từ đích trong ngữ cảnh, ví dụ "Our team found a new way to fix the login error. Which word is closest in meaning to 'solution'?". Với đề A1 v5, các câu R01–R10 chỉ là một câu không có câu hỏi và không chỉ từ nào cần giải nghĩa |
| GEN16 đáp án nhiễu | 3 | B1: "The office cleaner", "So it prints in colour", "started but not yet begun to work". A1 v5: câu "Who is working hard?" có đáp án nhiễu "The client file" và "The schedule date"; "How are the changes to make?" sai ngữ pháp |
| GEN12 không nhồi từ | 4 | Câu đọc to B1 "…We will fix the risks, check the books, and found a second bond." vô nghĩa và sai ngữ pháp. Câu A1 v5 "We need to read the feedback sheet first, sir." gượng. Writing B1 bắt dùng upload, define, improve, notice, pace, useful trong khi các dữ kiện không gợi ra những từ này |
| GEN06/15/21 nghe | 7 | Script B1 130 và 124 từ, đúng hồ sơ 110–130. Có câu GA và GB. Câu hỏi bám script nhưng thiên về dò chữ |
| Tiếng Anh trong script | 6 | A1 v5 có "Could you send me the new timeline quick, please?" và "the company sent me a short phone call summary" |
| **Tổng** | **5,0** | Khung kiểm tra mạnh, nhưng nội dung ở các mục `needs_review` yếu và một mục tự động báo đạt sai |

## 6. Đề thi lên cấp (`level_form_*`)

**Cách sinh:** `POST /api/v1/assessment-level-forms/:targetLevel/generate` (`apps/api/src/modules/assessment/routes.ts:536-578`) gọi song song 3 lát listening, reading và production, rồi `completeLevelFormReading` bù cho đủ 40 câu. Prompt `level_form_generation` không có trong `prompt_versions` nên luôn dùng `DEFAULT_LEVEL_FORM_PROMPT` (routes.ts:170), không kèm `system_rules`. **Không có gate nội dung**, chỉ kiểm schema.

**Mẫu:** DB `level-up-a2` v6 và `level-up-b1` v1. Mẫu mới B1 ×2 và A2 ×1, mỗi đề 20–26 giây.

| Tiêu chí | Điểm /10 | Bằng chứng |
| --- | --- | --- |
| Đáp án đúng | 3 | **3 đáp án sai đã xác nhận** trong khoảng 80 câu Reading đã kiểm:<br>(1) "How many training sessions are listed per day?" có key "Three times", trong khi bài viết "7:30 a.m. and 2:30 p.m." nên phải là Twice.<br>(2) "Which item is NOT listed as something the app will show?" có key "Damaged items", trong khi bài có liệt kê mục này; đáp án đúng là "Customer complaints".<br>(3) "Which statement about photographs is correct?" có key "Supervisors will not check any photos", trái hẳn với bài.<br>Ngoài ra có câu hai đáp án đúng: "Which day is NOT listed…" với Monday và Wednesday; "Who benefits…" với "The morning team" và "The next team on shift" |
| Vị trí, độ dài đáp án | 2 | DB `level-up-b1` v1 có đáp án Reading B **32/40** và đáp án đúng là lựa chọn dài nhất 25/40. `level-up-a2` v6 có B 23/40, không câu nào D. Mẫu mới có Reading [A0, B23, C17, D0] và [9, 19, 9, 3]. Không có bước xáo đáp án như `rebalanceAnswerPositions` của đề tháng |
| CEFR fit, tiếng Anh | 8 | Bài đọc dạng memo 300–330 từ và script 520–780 từ, tự nhiên, đúng tầm B1 |
| Liên quan công việc | 6 | Hai đề B1 đều là memo kho vận ở "Riverside depot", lặp bối cảnh và xa môi trường văn phòng/IT của GFT |
| Cấu trúc | 5 | Câu nghe không theo thứ tự Part 1–5 (4 câu mỗi phần) như prompt yêu cầu. Tiêu đề đề thi lấy từ lát nghe: "B1 Workplace English Promotion Test – Listening Section" |
| **Tổng** | **4,5** | |

**Pass course Form A** là blueprint tĩnh (`packages/database/src/assessment-blueprints.ts`, script `scripts/refresh-pass-course-form-a.ts`), không do AI sinh nên không chấm. Ghi nhận: đáp án Reading lệch B (24/40) và đáp án đúng dài nhất 11/15 ở phần Nghe. Placement cân bằng (A10/B10/C10/D10).

## 7. Luyện với Season (lượt hội thoại)

**Cách sinh:** `runCoachWithPersonaRepair` (`apps/api/src/modules/coach/routes.ts:656`) gọi `coach_roleplay_turn` (700 token, temperature 0), kiểm bằng `validateCoachPersonaOutput`, ép persona bằng `enforceEnglishRoleplayTurn`, và cuối cùng dùng `coachInsufficientFollowUp` làm câu mẫu dự phòng. Sau đó gọi `coach_dialogue` để chấm (mục 8).

| Tiêu chí (R6) | Điểm /10 | Bằng chứng |
| --- | --- | --- |
| Đúng vai, đúng văn phong | 7 | Khi lượt AI được nhận, lời thoại đúng vai. Formal không có emoji hay viết tắt, ví dụ B1: "A weekly demo would help the client follow our progress more closely. However…" |
| Duy trì hội thoại | 2 | **7/23 lượt (30%) bị thay bằng câu mẫu** "I hear you mention “nhé.” What is the next step for “nhé”?", "…“afternoon”…", "…“changes”…". Câu mẫu thay cả câu trả lời C1 rất tốt. Hội thoại A2 rơi vào vòng lặp "next step for 'afternoon'" ở 3/6 lượt. Nguyên nhân là `validateCoachPersonaOutput` quá cứng: Informal bắt có viết tắt và đúng 1 emoji, Formal cấm dấu "!", câu trả lời phải 2–4 câu. Khi vi phạm, code rơi về câu mẫu vốn dành cho lượt thiếu ý |
| Câu chữ chèn thêm | 3 | 5/23 lượt bắt đầu bằng **"That's clear:"**, do `routes.ts:935` tự chèn khi lời Informal thiếu dạng viết tắt. Bản dịch theo đó thành "Vậy là rõ rồi: …" |
| Không lặp câu hỏi | 4 | B1 Formal hỏi lại gần như y hệt "what you can offer the client next, and when they can expect the revised schedule?" 3 lượt liền, vi phạm luật "tối đa 3 lượt cùng một ý" và "không hỏi lại câu đã hỏi". Câu hỏi hai vế khiến câu trả lời tốt chỉ được 1–2 điểm Ý |
| Lạc đề | 5 | `repeatCurrentQuestionForOffTopic` nối thêm câu hỏi cũ nên câu hỏi bị nhân đôi: "…Could you please tell me when the new design will be ready? Good morning, Lan. Could you tell me when the new design will be ready?" |
| Dùng nội dung tháng | 3 | Input AI chỉ có `scenario` = tiêu đề chủ đề. Season không nhận từ cốt lõi hay bước ngữ pháp đã học, nên không thể "ưu tiên câu hỏi gợi ra chủ điểm ngữ pháp" hay tạo cơ hội mở ô chữ như spec. Trường `priorQuestions` bị zod loại khỏi input (`coachInputSchema` không có trường này), chỉ còn trong prompt |
| **Tổng** | **4,0** | |

## 8. Nhận xét của Coach (`coach_dialogue`)

| Tiêu chí (R6) | Điểm /10 | Bằng chứng |
| --- | --- | --- |
| Rubric, thang điểm | 8 | AI chấm 0–5, UI quy đổi về Ý 2 / Từ 1,5 / NP 1,5 (`CoachPractice.tsx:125-129`), khớp spec. Chấm A2 tốt [5,4,5] và câu sai ngữ pháp [4,4,2] hợp lý |
| Sửa lỗi chính xác | 6 | Sửa tốt: "the report it late… my team have problem" → "the report is late… my team has a problem"; B2: "If the client will reject it" → present simple. Sửa sai: B1 sửa câu đã đúng "I would ask the client which part…" thành một câu khác; B1-inf nhắc "dùng 'the QA team' thay vì 'the QA'" trong khi học viên đã viết "the QA team"; A2 có correction mà `original` trùng `corrected` |
| Xét lượt hợp lệ | 4 | "The design ready vào thứ Sáu, em gửi anh nhé." được `countsTowardGoal: true`, trái điều kiện "tiếng Anh hoàn toàn", trong khi chính `noteVi` lại viết "Chưa đủ điều kiện tính điểm". B1-partial ghi "câu chỉ có 10 từ và chưa đủ điều kiện" nhưng vẫn được tính, và thực tế câu có 12 từ. Câu "gimme the file… lol" bị nhãn `off_topic` thay vì đúng chủ đề nhưng sai văn phong (spec: trừ điểm Ý và gợi ý câu lịch sự) |
| Bản dịch, gợi ý | 2 | **Bản dịch không khớp lời đang hiện.** `mergeAcceptedRoleplay` giữ `seasonReplyTranslation` và `suggestedAnswer.translation` của lượt feedback (dịch câu feedback tự viết) trong khi `seasonReply` và `suggestedAnswer.text` lấy từ lượt roleplay. Ví dụ B2: lời Season hỏi "how you would present this option" nhưng bản dịch hỏi về "lịch trình cho phần phạm vi còn lại". **6/23 bản dịch rò rỉ thẻ XML** "</seasonReplyTranslation>\n<parameter name=\"nextQuestion\">…". 7/23 gợi ý là câu chung chung "I will share one update about the project and explain the next step." |
| Mất nhận xét | 6 | 1/23 lượt mới bị local fallback ("Nhận xét AI tạm thời không khả dụng") vì `validateRequiredSubjectCopulaFeedback` loại output (ca "I a project manager…"). Học viên mất lượt (`countsTowardGoal: false`). Mốc cũ trong DB có 7/24 lượt như vậy |
| **Tổng** | **5,5** | |

## 9. Nguyên nhân gốc ở tài nguyên tháng (`monthly_resource_generation`)

Các khung đã duyệt hoặc đang soạn trong DB 4175 có lỗi sinh ra từ bước tài nguyên và lan sang mọi bài:

- **Bể âm sai:**
  - A1 /ɜː/ có *problem* và *project* (không chứa /ɜː/).
  - A1 /æ/ có "ot" (không phải từ).
  - C1 "/nd/" có point, agent, extent, segment, event, count (đều là /nt/).
  - Khung A2 **đã duyệt** có âm `/ˈX.X/` (IPA giả). Mọi bài dùng âm này trượt R3 ("Âm mục tiêu /ˈX.X/ không thuộc inventory").
  - Loại âm C1 là cụm phụ âm cuối (loại B1), không phải "trọng âm nâng cao, nhấn mạnh, ngữ điệu thái độ" như hồ sơ level.
- **CEFR từ vựng:**
  - C1 có client, present, problem, confirm, schedule, manager, change, complete và trùng 17 từ với B1.
  - A1 có method, exact, sample, gap, lead, notice (mức B1).
  - A2 có stakeholder, milestone, requirement, scope.
- **Ngôn ngữ của objective ngữ pháp B1 là tiếng Việt.** Đây là nguyên nhân làm B1 đạt 0/6.

## 10. Đề xuất ưu tiên

| # | Ưu tiên | Thay đổi | Tệp |
| --- | --- | --- | --- |
| 1 | P0 | **Điền cố định các trường khóa thay vì bắt AI chép**: `grammar.dailyCode`, `grammar.objective`, `grammar.formula`/`steps[].formula`, `pronunciation.stage`, `pronunciation.objective`, `focus`, `words`, `reviewTargets`. Làm giống `withMonthlyExpandedTerms`. Nếu còn repair thì đưa chuỗi mong đợi vào thông điệp, ví dụ "formula must contain exactly: …". Dự kiến tỉ lệ đạt tăng từ 33% lên trên 70% | `apps/api/src/modules/content/monthly-day-generation.ts`, `monthly-quality.ts` |
| 2 | P0 | Sửa mâu thuẫn B1+: sinh `grammarPlan.objective` bằng tiếng Anh cho B1–C1 (tham số `language` của daily-progression) **hoặc** loại `objective` khỏi kiểm tra tiếng Việt khi đó là giá trị khóa | `packages/domain/src/monthly/daily-progression.ts`, `packages/database` (backfill khung B1), `packages/domain/src/content/index.ts` |
| 3 | P0 | **Xáo vị trí đáp án bằng code** cho bài ngày, bài ôn (cả `variants`) và đề lên cấp. Tái dùng `rebalanceAnswerPositions` của đề tháng. Thêm gate R3: không lựa chọn bịa (từ điển), đáp án đúng không được dài nhất duy nhất, các lựa chọn cùng dạng ngữ pháp | `monthly-day-generation.ts`, `apps/api/src/modules/assessment/routes.ts` (`levelFormBlueprint`), `monthly-final-builder.ts` |
| 4 | P0 | **Gate cho đề lên cấp:** thêm lượt "answer-key verifier". AI giải lại từng câu chỉ từ passage hoặc script, so với `correctIndex`; câu lệch hoặc có hai đáp án thì sinh lại câu đó. Kiểm câu NOT, how many. Ép thứ tự Part 1–5. Đổi tiêu đề. Tạo `prompt_versions` `level_form_generation` có `system_rules` và đa dạng bối cảnh văn phòng/IT | `apps/api/src/modules/assessment/routes.ts:536-578`, `packages/database/src/prototype-prompts.ts` |
| 5 | P0 | **Coach:**<br>(a) `mergeAcceptedRoleplay` phải xóa bản dịch của lượt feedback và dịch lại đúng `seasonReply` (hoặc bắt lượt roleplay trả kèm bản dịch).<br>(b) Bỏ chèn "That's clear:" và nới luật Informal: viết tắt hoặc emoji nên là cảnh báo, không phải lỗi.<br>(c) Khi lượt roleplay vi phạm, retry có thông điệp vi phạm trước khi rơi về câu mẫu. Không dùng câu mẫu "next step for “X”" cho lượt hợp lệ.<br>(d) Lọc thẻ `</…>`/`<parameter` khỏi chuỗi trả về.<br>(e) Cổng "toàn tiếng Anh" bằng code trước khi tin `countsTowardGoal` | `apps/api/src/modules/coach/routes.ts` (dòng ~656–760, 935), `packages/ai/src/providers/anthropic.ts` (parse tool output) |
| 6 | P1 | Ép ngôn ngữ A1–A2: thêm vào R3 luật "đề/prompt/explanation của bài tập A1–A2 phải có tiếng Việt" (đối xứng với luật B1+). Bổ sung prompt `monthly_lessons` chỉ rõ trường nào bằng tiếng Việt | `packages/domain/src/content/index.ts`, prompt `monthly_lessons` (DB và `prototype-prompts.ts`) |
| 7 | P1 | Sửa GEN22: kiểm cả `task.prompt`, facts và requirements của Writing/Speaking theo `instructionLanguage` | `apps/api/src/modules/assessment/monthly-final-checks.ts:416-431` |
| 8 | P1 | Word form theo đúng HV-R49: đổi hợp đồng `word_class` thành "chọn hoặc điền dạng đúng của từ tuần trong câu", cấm hỏi "word class" và cấm đáp án trùng từ gợi ý trong ngoặc. Thêm heuristic vào gate | `packages/ai` (`MONTHLY_LESSON_PART_CONTENT_CONTRACT`), `monthly-quality.ts`, `monthly-review-quality.ts` |
| 9 | P1 | Phát âm bài ôn: kiểm cặp tối thiểu bằng IPA (khác đúng 1 âm vị), cấm từ nhạy cảm (danh sách chặn), bắt câu đọc to chứa ≥2 từ ví dụ mỗi mục và có kiểm tra tính hợp lý | `monthly-review-quality.ts`, `monthlyReviewExerciseContract` |
| 10 | P1 | Gate tài nguyên tháng: IPA của mỗi từ ví dụ phải chứa âm đích (dùng `ipaContainsPronunciationFocus`), cấm IPA giả `/ˈX.X/`, kiểm từ có trong từ điển, kiểm CEFR từ cốt lõi theo level (C1 không nhận từ A1–A2) và chống trùng giữa các level. Rà lại khung A1/A2 đã duyệt | `apps/api/src/modules/content/monthly-resource-generation.ts` |
| 11 | P2 | Season: truyền danh sách từ cốt lõi đã học và bước ngữ pháp hiện tại vào input (`coachInputSchema`), thêm `priorQuestions` vào schema, luật "không hỏi lại cùng một ý quá 3 lượt" bằng so khớp tương đồng | `packages/ai/src/schemas.ts`, `apps/api/src/modules/coach/routes.ts` |
| 12 | P2 | Đề tháng Reading: bắt từ đích xuất hiện trong câu ngữ cảnh (kiểm bằng code), đa dạng dạng câu (gap, hành động, ý chính) thay vì 100% "closest in meaning". Giảm số lượt repair: hiện tới 102 lượt gọi, nên gộp review bằng chứng ngữ pháp theo khối | `monthly-final-routes.ts`, `monthly-final-checks.ts` (gen04/gen07 precheck), `monthly-final-productive-generation.ts` |
| 13 | P2 | Khung A2 đã duyệt dùng plan cũ khiến bài ôn tuần 1 không sinh được. Cần backfill plan v2 hoặc báo rõ cho Vận hành | `backfillApprovedFrameworkPlan` trong `packages/database/src/monthly-content-repository.ts` |

## 11. Giới hạn của lần đánh giá

- Mẫu nhỏ: 28 lượt bài, 3 đề tháng, 3 đề lên cấp, 23 lượt Season. Tỉ lệ đạt có sai số lớn nhưng xu hướng nhất quán giữa các vòng.
- Chưa chấm phần chấm điểm bài nộp: `assessment_scoring`, `productive_assessment_scoring`, `weekly_practice_grading`, `micro_grading`. Chưa chấm minigame `vocabulary_generation`.
- Chưa nghe audio TTS và chưa xem hình minh họa.
- Mẫu B1/C1 chạy trên bể tài nguyên **chưa duyệt**, được chia ngày trong bộ nhớ.
- Đề A1 v5 trong DB là draft; chưa có bản đề tháng nào được phát hành để đối chiếu.
