# Lộ trình ngữ pháp A1–C1 (chuẩn sản phẩm, tài liệu ngày 03/11/2026)

Nguồn: tài liệu "Lộ trình ngữ pháp A1–C1 chia chủ điểm theo tháng & bài theo ngày" của chủ sản phẩm, lưu lại ngày 12/11/2026 làm chuẩn cho bộ sinh tài nguyên và bài học. Lưu ý sản phẩm (cùng quyết định với lộ trình phát âm): **không dùng số tháng trong tài liệu**. Bảng ghép cặp chỉ là danh mục theo thứ tự: mỗi tháng, bộ sinh lấy **cặp tiếp theo chưa dạy** của level (A1 hàng 1→6, A2 hàng 7→12, …), nhớ các cặp level đó đã dạy trong 12 tháng trước, và chỉ quay lại từ đầu khi đã phủ đủ 6 cặp. Level chưa có lịch sử bắt đầu từ cặp đầu tiên. Code chọn cặp, hai chủ điểm và danh sách "Nội dung" làm trường khóa; AI chỉ viết giải thích, ví dụ và bài tập trong phạm vi đó (xem `packages/domain/src/monthly/grammar-catalog.ts`).

## Nguyên tắc
- Mỗi tháng học đúng 2 chủ điểm ngữ pháp: chủ điểm A trước, chủ điểm B sau, cuối tháng luyện kết hợp A+B rồi thi.
- Mỗi level gồm 12 chủ điểm (6 cặp).
- Người học: nhân viên công ty 20–35 tuổi. Ví dụ và ngữ cảnh lấy từ công sở: email, họp, báo cáo, deadline, khách hàng, đồng nghiệp.
- Một bài học ≈ 10 phút: 3 từ vựng cốt lõi + 1 bước ngữ pháp + 1 âm IPA + bài tập. Phần ngữ pháp khoảng 3–4 phút, mỗi ngày chỉ dạy một ý nhỏ của chủ điểm.
- Lịch học theo quy định từ vựng: học mới T2–T5, ôn T6, nghỉ T7–CN, thi vào ngày học cuối tháng. Một tháng có 15–18 ngày học mới.
- Ngữ pháp không bị ràng buộc số lượng như từ vựng, nhưng 2 chủ điểm của tháng phải học xong trong tháng đó. Ôn T6 và bài thi cuối tháng đều có phần ngữ pháp.
- Giải thích bằng tiếng Việt ở A1–A2, bằng tiếng Anh đơn giản từ B1.
- "Level" là lộ trình ngữ pháp của app, bám theo khung CEFR; không tương đương chứng chỉ CEFR.

## Mục tiêu "can-do" theo level

| Level | Mục tiêu "can-do" ngữ pháp nơi công sở |
|---|---|
| A1 | Giới thiệu bản thân, công việc, văn phòng; hỏi – đáp đơn giản; kể việc đã làm hôm qua |
| A2 | Kể sự cố, nói kế hoạch, nêu quy định; viết tin nhắn/email ngắn có liên kết câu |
| B1 | Cập nhật tiến độ, dự đoán, đề xuất giải pháp, thuật lại nội dung họp, so sánh phương án |
| B2 | Nhìn lại dự án, viết báo cáo trang trọng, lập luận có liên kết, dùng phrasal verbs tự nhiên |
| C1 | Viết và trình bày mạch lạc, nhấn mạnh đúng ý, điều chỉnh sắc thái trang trọng/lịch sự |

## Ngữ pháp trong bài thi tháng
Bài thi tháng gồm 4 kỹ năng Nghe – Đọc – Viết – Nói, mỗi kỹ năng 25 điểm. Ngữ pháp không có phần thi riêng mà được chấm bên trong Writing (W3) và Speaking B (S4), tổng 10 điểm bằng chứng, báo cáo riêng theo từng chủ điểm.

Khi lập khung tháng, mỗi chủ điểm chọn 2 thành phần bằng chứng từ cột "Nội dung": **thành phần chính** là cấu trúc cốt lõi; **thành phần phụ** là một biến thể hoặc cách dùng khác.

| Vị trí | Chủ điểm A | Chủ điểm B | Tổng |
|---|---|---|---|
| Writing – W3 | chính 2 + phụ 1 = 3 | chính 2 + phụ 1 = 3 | 6 |
| Speaking B – S4 | chính 2 | chính 2 | 4 |
| Báo cáo | % A = điểm ÷ 5 | % B = điểm ÷ 5 | 10 |

Cách các ngày học dẫn tới bài thi:
- Bước 1–4 (nhận diện, cấu trúc, biến thể, cách dùng) giúp hiểu câu trong Listening và Reading. Mỗi bản nghe có ít nhất 1 câu dùng A và 1 câu dùng B, nhưng không chấm riêng.
- Bước 5–6 và K1–K3 luyện đúng dạng sản phẩm được chấm: K2 giống phần viết email, K3 giống Writing và voice note, tình huống cần cả A và B.
- Ôn thứ Sáu có ít nhất 1 câu yêu cầu tự viết hoặc tự nói bằng thành phần chính của chủ điểm đang học.
- M3 (thi thử) dùng cùng cấu trúc 4 kỹ năng nhưng rút gọn và khác nội dung đề thật.

## Khung chia bài cho một tháng bất kỳ
Ngày ngữ pháp đánh số theo ngày học mới thứ n (N1, N2, …), không theo ngày dương lịch. Mọi tháng có ít nhất 15 ngày học mới, nên N1–N15 là phần lõi bắt buộc; N16–N18 chỉ có khi tháng dài hơn.

| Khối | Ngày học mới | Nội dung | Bắt buộc? |
|---|---|---|---|
| Chủ điểm A | N1–N6 | 6 bước scaffolding của A | Có |
| Chủ điểm B | N7–N12 | 6 bước scaffolding của B; mỗi bài có 1 câu tái hiện A | Có |
| Kết hợp A+B | N13–N15 | K1 phân biệt/nối A–B · K2 luyện trộn trong đoạn văn · K3 task công sở | Có |
| Mở rộng | N16–N18 | M1 sửa lỗi hay gặp · M2 ngữ cảnh dài hơn (hội thoại/email) · M3 làm thử đề thi (cùng cấu trúc, khác nội dung đề thật) | Chỉ khi tháng có 16–18 ngày |

Tháng 16 ngày học mới dùng M1; 17 ngày dùng M1–M2; 18 ngày dùng M1–M3. M3 luôn là ngày học mới cuối cùng trước ngày thi. Tháng chỉ có 15 ngày học mới thì dừng ở N15 (K3) rồi thi.

### 6 bước scaffolding cho mỗi chủ điểm
Mỗi bước chiếm một ngày. Độ hỗ trợ giảm dần: đầu tiên chỉ cần nhận ra, sau đó điền theo mẫu, cuối cùng tự tạo câu.

| Bước | Ngày (A / B) | Mục tiêu | Dạng bài tập gợi ý | Mức hỗ trợ |
|---|---|---|---|---|
| 1. Nhận diện | N1 / N7 | Thấy cấu trúc trong ngữ cảnh công sở thật | Đọc tin nhắn/đoạn hội thoại ngắn, chọn câu chứa cấu trúc | Cao: có highlight, có giải thích (tiếng Việt ở A1–A2, tiếng Anh đơn giản từ B1) |
| 2. Cấu trúc cơ bản | N2 / N8 | Nắm công thức dạng chính (thường là khẳng định) | Chọn đáp án đúng, điền dạng từ | Cao: có công thức mẫu trên màn hình |
| 3. Biến thể | N3 / N9 | Phủ định, câu hỏi, dạng rút gọn hoặc biến thể chính | Chuyển đổi câu, sắp xếp từ | Trung bình |
| 4. Ý nghĩa & cách dùng | N4 / N10 | Biết khi nào dùng, dấu hiệu nhận biết | Chọn câu phù hợp tình huống, nối tình huống – câu | Trung bình |
| 5. Lỗi hay gặp | N5 / N11 | Tránh lỗi điển hình của người Việt | Tìm và sửa lỗi, đúng/sai | Thấp: gợi ý khi sai |
| 6. Vận dụng | N6 / N12 | Tự tạo câu về công việc của mình | Hoàn thành câu mở, viết 1–2 câu, dùng từ vựng của ngày nếu tự nhiên | Thấp: chỉ có câu mẫu tham khảo |

Với chủ điểm không có phủ định/câu hỏi (vd: mạo từ, giới từ), bước 3 dùng cho biến thể chính thứ hai của chủ điểm (vd: in/on/at chỉ nơi chốn sau khi đã học chỉ thời gian).

**Ánh xạ trong app:** mỗi chủ điểm lưu 3 mốc (step), mỗi mốc có 2 mục tiêu ngày (`dailyObjectives`): mốc 1 = bước 1 Nhận diện + bước 2 Cấu trúc cơ bản; mốc 2 = bước 3 Biến thể + bước 4 Ý nghĩa & cách dùng; mốc 3 = bước 5 Lỗi hay gặp + bước 6 Vận dụng. Mã ngày giữ dạng A1–A6, B1–B6, K1–K3, M1–M3.

### Ba ngày kết hợp (N13–N15)
- **K1 – Nối / phân biệt A–B:** cặp đối lập thì chọn A hay B; cặp bổ trợ hoặc mở rộng thì ghép A và B vào một câu.
- **K2 – Luyện trộn:** một đoạn email/tin nhắn 4–6 câu có chỗ trống cần cả A và B.
- **K3 – Task công sở:** cho một tình huống (vd: báo sếp về tiến độ). Người học viết 2–3 câu dùng cả A và B, kèm đáp án mẫu để tự so.

### Ôn thứ Sáu
- Ôn 4–5 câu: khoảng 3 câu từ các bước đã học trong tuần, 1–2 câu từ các tuần trước (lặp lại ngắt quãng).
- Tuần chưa có bước mới nào (vd: tháng bắt đầu vào thứ Sáu) → ôn cặp chủ điểm của tháng trước.
- Người học có chủ điểm điểm thấp ở tháng trước → thay 1–2 câu bằng gói ôn của chủ điểm đó.
- Thứ Sáu là ngày thi → không ôn, làm bài thi.

### Phần ngữ pháp trong bài thi cuối tháng
Chấm trong Writing (W3: A 3 điểm, B 3 điểm) và Speaking B (S4: A 2 điểm, B 2 điểm). Điểm tách riêng cho A và B để biết chủ điểm nào còn yếu. AI chấm tự động theo rubric W3/S4: đầy đủ / một phần / không có bằng chứng phù hợp, kèm trích đoạn, 1 dòng nhận xét và câu sửa mẫu.

### Nghỉ lễ / nghỉ phát sinh
Nghỉ lễ không làm mất ngày học mới và không đổi N (chốt 03/11): bài của ngày lễ giữ nguyên, Vận hành xuất bài ra file doc gửi học viên, học viên tự được điểm danh. Chỉ khi có ngày nghỉ phát sinh khác làm mất ngày học mới thì bỏ ngày theo thứ tự ưu tiên: M3 → M2 → M1 → K2 (gộp vào K3). Nếu vẫn thiếu, gộp bước 5 vào bước 6 của chủ điểm B. Tuyệt đối không bỏ các bước 1–4.

## Bảng ghép cặp chủ điểm (danh mục theo thứ tự)
Mỗi tháng ghép 2 chủ điểm có liên hệ, theo một trong ba kiểu:
- **Đối lập:** dễ nhầm, cần phân biệt.
- **Mở rộng:** B xây trên A.
- **Bổ trợ:** A và B cùng phục vụ một tình huống công sở.

Kiểu cặp quyết định cách làm ngày K1. Cột "Nội dung" là danh sách điểm ngữ pháp AI phải phủ trong 6 bước của chủ điểm. Cột "Cặp" là thứ tự trong danh mục (số tháng của tài liệu gốc trong ngoặc, chỉ để tham chiếu).

### A1

| Cặp | Chủ điểm A – nội dung | Chủ điểm B – nội dung | Kiểu cặp · tình huống |
|---|---|---|---|
| 1 (T1) | Động từ to be: am/is/are; phủ định isn't/aren't; câu hỏi Are you…? Is he…?; trả lời ngắn Yes, I am | Đại từ & sở hữu: I/me/my/mine; he/him/his; they/them/their; sở hữu cách 's (Anna's desk); Whose…? | Bổ trợ · giới thiệu bản thân và đồng nghiệp |
| 2 (T2) | Hiện tại đơn: V/V-s, quy tắc thêm -s/-es; don't/doesn't; Do/Does…?; trạng từ tần suất always/usually/often/never và vị trí | Hiện tại tiếp diễn: am/is/are + V-ing; quy tắc thêm -ing; phủ định, câu hỏi; now/at the moment; phân biệt với hiện tại đơn | Đối lập · thói quen công việc vs việc đang làm |
| 3 (T3) | Danh từ & mạo từ cơ bản: số ít/số nhiều (-s/-es, bất quy tắc people/men); đếm được/không đếm được; a/an; the khi đã biết đối tượng; a bottle of / a cup of | Từ chỉ định & lượng từ: this/that/these/those; one/ones; some/any; much/many/a lot of; How much/How many…? | Bổ trợ · văn phòng phẩm, đặt đồ ăn trưa |
| 4 (T4) | There is/are & have got: there is/are, there was/were; Is there…?; have/has got; have (sở hữu) | Giới từ thời gian & nơi chốn: at/on/in + giờ/ngày/tháng; in/at/on + nơi chốn; next to, between, under, behind, opposite | Bổ trợ · mô tả văn phòng, lịch họp |
| 5 (T5) | Quá khứ đơn: was/were; V-ed (quy tắc chính tả); 20–30 động từ bất quy tắc thông dụng; didn't; Did you…?; yesterday/last week/ago | Câu hỏi Wh- & Yes/No: trật tự từ trong câu hỏi; What/Where/When/Who/Why/How; Which vs What; How long/How often/How far | Mở rộng · hỏi về cuối tuần, chuyến công tác |
| 6 (T6) | can, would like & mệnh lệnh: can/can't, could (quá khứ); Can I…?/Can you…?; I'd like / Would you like…?; câu mệnh lệnh Do/Don't; Let's | Tính từ, trạng từ & so sánh: vị trí tính từ; trạng từ -ly (quick → quickly), good → well; so sánh hơn -er/more; than; so sánh nhất the -est/most; not as…as | Bổ trợ · nhờ vả, đề nghị, so sánh lựa chọn |

### A2

| Cặp | Chủ điểm A – nội dung | Chủ điểm B – nội dung | Kiểu cặp · tình huống |
|---|---|---|---|
| 1 (T7) | Quá khứ tiếp diễn & used to: was/were + V-ing; hành động đang xảy ra thì hành động khác xen vào; used to + V (thói quen cũ) | Liên từ & mệnh đề thời gian: and/but/or/so/because; when/while/before/after; dấu phẩy khi mệnh đề phụ đứng đầu | Bổ trợ · kể lại một sự cố ở công ty |
| 2 (T8) | Hiện tại hoàn thành 1: have/has + V3; just/already/yet; ever/never; Have you ever…?; been vs gone | Hiện tại hoàn thành 2: for/since; How long have you…?; ago; phân biệt HTHT với quá khứ đơn (có mốc thời gian xác định) | Mở rộng · cập nhật công việc, kinh nghiệm làm việc |
| 3 (T9) | Tương lai: hiện tại tiếp diễn cho lịch đã hẹn; be going to (dự định); will (quyết định tức thì, dự đoán, hứa); Shall I/we…?; might (có thể) | Modal nghĩa vụ & lời khuyên: must/mustn't; have to/don't have to; don't need to; should/shouldn't | Bổ trợ · kế hoạch dự án và quy định công ty |
| 4 (T10) | Câu hỏi nâng cao & trợ động từ: câu hỏi chủ ngữ vs tân ngữ (Who called you? / Who did you call?); giới từ cuối câu hỏi (Who are you talking to?); What…like?; câu hỏi gián tiếp Do you know where…?; trả lời ngắn; So do I / Neither do I | Đại từ bất định & lượng từ: somebody/anything/nobody/nowhere; no/none; every/all; both/either/neither; (a) few / (a) little; myself/yourself (đại từ phản thân) | Bổ trợ · hỏi – đáp trong cuộc họp, nhờ hỗ trợ |
| 5 (T11) | V-ing & to-V cơ bản: động từ + V-ing (enjoy, finish, mind); động từ + to-V (want, decide, plan); want/ask somebody to do; to-V chỉ mục đích (I called to ask…) | Câu tường thuật cơ bản: said (that)… / told me (that)…; lùi thì cơ bản (is → was, will → would); say vs tell; told me to / asked me to | Mở rộng · chuyển lời sếp, lời khách hàng |
| 6 (T12) | Câu điều kiện loại 1 & 2: If + hiện tại, will…; If + quá khứ, would…; If I were you…; phân biệt if và when | Mệnh đề quan hệ cơ bản: who/which/that; lược bỏ đại từ khi làm tân ngữ (the client we met); giới từ cuối mệnh đề (the hotel you stayed at) | Bổ trợ · đưa phương án, mô tả người/sản phẩm |

### B1

| Cặp | Chủ điểm A – nội dung | Chủ điểm B – nội dung | Kiểu cặp · tình huống |
|---|---|---|---|
| 1 (T13) | Hiện tại đơn vs tiếp diễn: sự thật vs tạm thời; động từ trạng thái (know, need, belong) không dùng tiếp diễn; think/have/see đổi nghĩa; always + tiếp diễn (phàn nàn) | Quá khứ đơn vs tiếp diễn & thói quen quá khứ: chuỗi hành động vs bối cảnh; when vs while; used to vs would (thói quen); have vs have got | Đối lập · mô tả công việc hiện tại và trước đây |
| 2 (T14) | Hiện tại hoàn thành đơn & tiếp diễn: have been + V-ing; nhấn kết quả vs nhấn quá trình; How long…? với for/since; It's the first time I've… | HTHT vs quá khứ đơn & quá khứ hoàn thành: thời gian chưa kết thúc (today, this week) vs đã kết thúc; had + V3; had been + V-ing; quá khứ hoàn thành trong kể chuyện | Mở rộng · báo cáo tiến độ, kể lại diễn biến dự án |
| 3 (T15) | Tương lai toàn diện: hiện tại đơn cho lịch trình (The meeting starts at 9); will vs going to; will be doing; will have done; when/as soon as/until + hiện tại (when I finish / when I've finished) | Modal khả năng & suy luận: can/could/be able to; must/can't (suy luận chắc chắn); may/might/could (có thể); may/might not | Bổ trợ · lập kế hoạch và dự đoán rủi ro |
| 4 (T16) | Modal nghĩa vụ, lời khuyên & lời đề nghị lịch sự: have to vs must; mustn't vs don't have to/needn't; should/ought to; had better; It's time…; Could you…? / Would you mind -ing? / May I…? | Câu điều kiện 1–2 & wish hiện tại: phân biệt loại 1 và 2 (khả năng thật vs giả định); unless; I wish + quá khứ đơn; wish + could | Bổ trợ · đề xuất giải pháp, nhờ vả lịch sự |
| 5 (T17) | Bị động 1–2: be + V3 ở các thì (is done, was done, has been done, is being done, will be done); by + tác nhân; bị động với modal (must be sent) | Tường thuật, câu hỏi gián tiếp & câu hỏi đuôi: lùi thì và khi không cần lùi; đổi trạng từ thời gian; asked if/whether; asked where… (không đảo ngữ); I think so / I hope not; câu hỏi đuôi (isn't it? didn't you?) | Bổ trợ · viết biên bản họp, báo cáo quy trình |
| 6 (T18) | Mạo từ & danh từ: a/an vs the; không mạo từ khi nói chung (Coffee is…); go to work / at school / the school; danh từ đếm được/không đếm được hay sai (information, advice, equipment); noun + noun (a project manager); 's vs of | Tính từ, trạng từ & so sánh: -ing vs -ed (boring/bored); trật tự tính từ; so vs such; enough vs too; quite/rather/pretty; much/far/a bit + so sánh hơn; as…as; the + so sánh nhất + HTHT (the best I've ever…) | Bổ trợ · mô tả và so sánh sản phẩm, số liệu |

### B2

| Cặp | Chủ điểm A – nội dung | Chủ điểm B – nội dung | Kiểu cặp · tình huống |
|---|---|---|---|
| 1 (T19) | Modal + have V3: must have / can't have (suy luận quá khứ); may/might/could have; should have / shouldn't have (tiếc nuối, phê bình); could have (đã có thể); would (thói quen quá khứ, tình huống giả định) | Câu điều kiện loại 3, hỗn hợp & wish quá khứ: If + had V3, would have V3; hỗn hợp (If I had…, I would be…); I wish I had…; If only…; wish + would (phàn nàn) | Bổ trợ · họp rút kinh nghiệm sau dự án |
| 2 (T20) | V-ing / to-V 1: động từ + V-ing; động từ + to-V; động từ + tân ngữ + to-V; make/let + V nguyên mẫu; đổi nghĩa: remember/forget/regret/stop/try/need; like/would like; prefer/would rather | V-ing / to-V 2: giới từ + V-ing (interested in, instead of); be/get used to + V-ing vs used to V; động từ + giới từ + V-ing (insist on, succeed in); it's worth / there's no point in / have difficulty -ing; to / in order to / so that; tính từ + to-V; see/hear sb do vs doing; mệnh đề -ing | Mở rộng · viết email đề nghị, trình bày ý kiến |
| 3 (T21) | Bị động nâng cao: bị động với 2 tân ngữ (I was given…); being done / to be done / having been done; It is said/reported that…; He is said/expected to…; be supposed to; have/get something done | Mệnh đề quan hệ đầy đủ: xác định vs không xác định (dấu phẩy, không dùng that); whose/whom/where/when; which thay cả mệnh đề; most of whom / some of which; rút gọn bằng V-ing/V3 (the person responsible, the report sent yesterday) | Bổ trợ · văn phong báo cáo, thông báo trang trọng |
| 4 (T22) | Liên từ & mệnh đề trạng ngữ: although/though/even though vs in spite of/despite; in case; unless/as long as/provided (that); as (khi, vì); like vs as; as if/as though; during/for/while; by vs until; by the time | Trật tự từ & trạng từ: động từ + tân ngữ không tách rời; nơi chốn trước thời gian; vị trí trạng từ với động từ (also, always, probably, even); still / yet / already / any more | Bổ trợ · viết email mạch lạc, nêu điều kiện hợp đồng |
| 5 (T23) | Đại từ, lượng từ & mạo từ nâng cao: a friend of mine, on my own / by myself; each other; there vs it; all/all of, most/most of, none of; both/either/neither of; all vs every vs whole; each vs every; the + danh từ chỉ loại (the smartphone), the + tính từ (the unemployed); the với tên riêng (công ty, tổ chức, địa danh) | Giới từ nâng cao & kết hợp từ: on time vs in time, at the end vs in the end; in/on/at mở rộng; by (phương tiện, tác nhân); danh từ + giới từ (reason for, increase in, demand for); tính từ + giới từ (responsible for, aware of); động từ + giới từ (apply for, depend on, consist of) | Bổ trợ · viết cụm danh từ chính xác trong báo cáo |
| 6 (T24) | Phrasal verbs 1: cấu trúc có thể tách/không tách (turn it off, look after it); nhóm in/out (fill in, find out, point out, run out of); nhóm on/off (carry on, put off, call off, take on) | Phrasal verbs 2: nhóm up/down (set up, follow up, bring up, turn down, cut down on); nhóm away/back (get back to, put back, give away); động từ 3 thành phần (come up with, catch up on) | Mở rộng · hội thoại công sở tự nhiên |

### C1

| Cặp | Chủ điểm A – nội dung | Chủ điểm B – nội dung | Kiểu cặp · tình huống |
|---|---|---|---|
| 1 (T25) | Thì & sắc thái: động từ trạng thái dùng tiếp diễn để nhấn mạnh (I'm loving…); hiện tại đơn khi kể chuyện/tóm tắt; tiếp diễn để lịch sự hơn (I was wondering if…); HTHT tiếp diễn chỉ dấu vết còn lại; quá khứ hoàn thành vs quá khứ đơn khi không bắt buộc | Tương lai nâng cao: be to (lịch chính thức); be about to / be on the point of; be due to; be bound/likely to; tương lai trong quá khứ (was going to, was to have, would) | Mở rộng · thông báo kế hoạch, cập nhật lịch trình |
| 2 (T26) | Modal nâng cao: will/would cho thói quen và đặc tính; needn't have vs didn't need to; be supposed to / be meant to; may well / might as well; mức độ chắc chắn (will → should → may → might) | Câu điều kiện nâng cao: If + should / were to; đảo ngữ Should you… / Were we to… / Had I known…; even if; provided/providing; but for / otherwise; if it weren't for / if it hadn't been for | Bổ trợ · đàm phán, đưa điều khoản |
| 3 (T27) | Bị động & cấu trúc tường thuật nâng cao: get-passive; bị động với động từ tường thuật (is thought to have…); động từ tường thuật đa dạng (admit, deny, claim, urge, recommend) và cấu trúc đi kèm; tường thuật câu hỏi, đề nghị, lời khuyên | Bổ ngữ động từ & giả định cách: động từ + that-clause; giả định cách (recommend that he be…, it is essential that…); should trong that-clause; động từ + tân ngữ + bổ ngữ (consider it important, find him reliable); động từ nối (seem, appear, prove, turn out) | Bổ trợ · văn bản chính thức, khuyến nghị, biên bản |
| 4 (T28) | Danh từ, mạo từ & hòa hợp chủ – vị: danh từ tập hợp (the team is/are); a number of vs the number of; danh từ trừu tượng có/không có mạo từ; danh từ ghép và cụm danh từ dài; chủ ngữ dài, chủ ngữ là mệnh đề | Mệnh đề quan hệ & mệnh đề phân từ nâng cao: giới từ + whom/which (to whom, in which); whereby, whereas; mệnh đề phân từ chỉ lý do/thời gian/kết quả (Having checked the data, …); lỗi phân từ treo; with + O + V-ing | Bổ trợ · viết báo cáo phân tích, câu dài mà vẫn rõ |
| 5 (T29) | Tính từ & trạng từ nâng cao: tính từ phân cấp vs không phân cấp (very good / absolutely essential); tính từ + that-clause / to-V; trạng từ bình luận, quan điểm (surprisingly, financially, admittedly); trạng từ mức độ (barely, considerably, slightly); so sánh kép (the more…, the more…) | Liên từ & lập luận: lý do (as, since, given that, due to); mục đích (so as to, with a view to); kết quả (consequently, hence, thus); nhượng bộ (while, whereas, nevertheless, albeit); trạng từ liên kết và dấu câu đi kèm | Bổ trợ · thuyết trình, viết đề xuất có lập luận |
| 6 (T30) | Thay thế & tỉnh lược: so/not (I think so, I hope not); do so / do it / do that; one/ones; tỉnh lược sau trợ động từ (I haven't yet, but I will); tỉnh lược to-V (I'd like to); tỉnh lược sau liên từ (if necessary, when possible) | Tổ chức thông tin & nhấn mạnh: câu chẻ It is/was… that; What we need is…; đảo ngữ sau trạng từ phủ định (Never have we…, Not only… but also, Only when…); đưa thành phần lên đầu câu; there/it giới thiệu; danh từ hóa (decide → make a decision) | Bổ trợ · viết và nói mạch lạc, nhấn mạnh đúng ý |

Một vài điểm nhỏ được lồng vào chủ điểm gần nhất thay vì đứng riêng: các cụm go/get/do/make/have đưa sang mảng từ vựng; enough/too và vị trí trạng từ được học ở B1–B2.

## Tháng mẫu: A2 – cặp 2 (Hiện tại hoàn thành 1 + 2)
Tháng 31 ngày bắt đầu vào thứ Hai, có 18 ngày học mới (N1–N18), thi vào thứ Tư ngày 31. Kiểu cặp mở rộng. Tình huống: cập nhật tiến độ công việc và nói về kinh nghiệm làm việc.

| Ngày lịch | Ngày học | Bước | Trọng tâm (1 ý/ngày) | Ví dụ công sở | Bài tập (3–5 câu) |
|---|---|---|---|---|---|
| T2 1 | N1 | A1 Nhận diện | HTHT xuất hiện trong tin nhắn cập nhật công việc | I've sent the file. / She has finished the slides. | Chọn câu nói về kết quả ở hiện tại |
| T3 2 | N2 | A2 Cấu trúc | have/has + V3; V3 có quy tắc và 10 V3 bất quy tắc hay dùng (sent, done, written, made…) | We have booked the room. | Điền have/has + V3 |
| T4 3 | N3 | A3 Biến thể | Phủ định haven't/hasn't; câu hỏi Have you…?; trả lời ngắn | Have you replied to the client? – Not yet, I haven't. | Chuyển sang phủ định / câu hỏi |
| T5 4 | N4 | A4 Ý nghĩa & cách dùng | just / already / yet và vị trí trong câu; ever / never cho kinh nghiệm | I've just joined the call. / Have you ever worked remotely? | Chọn just/already/yet/ever theo tình huống |
| T6 5 | – | Ôn | 3 câu N1–N4 + 1 câu chủ điểm tháng trước (quá khứ tiếp diễn) | – | Trộn |
| T2 8 | N5 | A5 Lỗi hay gặp | Dùng V2 thay V3 (I have went); thiếu have; yet trong câu khẳng định; been vs gone | He has gone to Da Nang twice → He has been to Da Nang twice. | Tìm và sửa lỗi |
| T3 9 | N6 | A6 Vận dụng | Viết 2 câu báo cáo việc đã xong / chưa xong hôm nay | I've already checked the budget, but I haven't sent it yet. | Viết 2 câu tự do, có câu mẫu |
| T4 10 | N7 | B1 Nhận diện | HTHT + for/since nói về khoảng thời gian kéo dài đến nay | I've worked here for three years. | Chọn câu nói về việc vẫn còn tiếp diễn; +1 câu tái hiện A |
| T5 11 | N8 | B2 Cấu trúc | for + khoảng thời gian; since + mốc thời gian | since 2023 / since Monday / for two weeks | Điền for/since; +1 câu A |
| T6 12 | – | Ôn | 3 câu N5–N8 + 1 câu N1–N4 | – | Trộn |
| T2 15 | N9 | B3 Biến thể | How long have you…?; It's … since… | How long have you been in this team? | Đặt câu hỏi cho câu trả lời; +1 câu A |
| T3 16 | N10 | B4 Ý nghĩa & cách dùng | HTHT vs quá khứ đơn: có mốc thời gian đã qua (yesterday, last week, ago) thì dùng quá khứ đơn | I've met him. / I met him last Monday. | Chọn thì theo dấu hiệu; +1 câu A |
| T4 17 | N11 | B5 Lỗi hay gặp | HTHT đi với ago/yesterday; since + khoảng thời gian; I work here since… | I have sent it yesterday → I sent it yesterday. | Tìm và sửa lỗi |
| T5 18 | N12 | B6 Vận dụng | Viết 2 câu giới thiệu kinh nghiệm làm việc | I've worked in sales since 2022. Before that, I worked at a bank. | Viết 2 câu tự do |
| T6 19 | – | Ôn | 3 câu N9–N12 + 1 câu phần A | – | Trộn |
| T2 22 | N13 | K1 Phân biệt/nối | Kết hợp yet/already với for/since và quá khứ đơn trong một câu trả lời | I've been on this project since May and I've already finished two reports. | Ghép hai nửa câu |
| T3 23 | N14 | K2 Luyện trộn | Email cập nhật tiến độ 5 câu, có chỗ trống cần cả A và B | – | Điền 5 chỗ trống |
| T4 24 | N15 | K3 Task công sở | Sếp hỏi "Where are we with the launch?" → trả lời 3 câu | – | Viết 3 câu, so với đáp án mẫu |
| T5 25 | N16 | M1 Sửa lỗi | Tổng hợp lỗi A + B hay gặp nhất | – | 5 câu đúng/sai |
| T6 26 | – | Ôn | 4 câu trộn toàn tháng | – | Trộn |
| T2 29 | N17 | M2 Ngữ cảnh dài | Đoạn hội thoại phỏng vấn nội bộ / onboarding, 6–8 lượt | – | Trả lời câu hỏi đọc hiểu + chọn thì |
| T3 30 | N18 | M3 Thi thử | 5 câu theo đúng cấu trúc đề thi | – | Thi thử |
| T4 31 | – | Thi | Thi 4 kỹ năng; ngữ pháp chấm trong Writing (A 3 · B 3) và Speaking B (A 2 · B 2) | – | – |

Nếu tháng chỉ có 15 ngày học mới thì dừng ở N15 (K3) rồi thi. Các câu ôn thứ Sáu vẫn lấy từ những bước đã học trong tuần.

## Hướng dẫn cho AI khi sinh nội dung
**Đầu vào mỗi lần sinh:** level, tháng, chủ điểm A/B (lấy từ bảng ghép cặp), số ngày học mới của tháng (15–18), ngày đầu tháng, 3 từ vựng của từng ngày nếu đã có.

**Đầu ra mỗi ngày học mới:**

| Trường | Yêu cầu |
|---|---|
| Mã ngày | Vd: A2-T8-N4 |
| Bước | Một trong A1–A6, B1–B6, K1–K3, M1–M3 |
| Trọng tâm | Một ý duy nhất, lấy từ cột "Nội dung" của chủ điểm |
| Giải thích | ≤ 60 từ, kèm công thức nếu có. A1–A2: tiếng Việt. B1–C1: tiếng Anh đơn giản, câu ngắn, từ vựng thấp hơn level hiện tại một bậc; thuật ngữ ngữ pháp dùng tên tiếng Anh phổ biến (present perfect, passive…) |
| Ví dụ | 2 câu tiếng Anh ngữ cảnh công sở. Ưu tiên dùng 3 từ vựng cốt lõi của chính bài học đó. A1–A2 có bản dịch tiếng Việt; B1+ không cần dịch |
| Bài tập | 3–5 câu theo dạng bài của bước. Mỗi câu có đáp án + giải thích 1 dòng (cùng ngôn ngữ với phần giải thích). Đưa từ vựng cốt lõi của bài vào ít nhất 1 câu |
| Tái hiện | Từ N8 trở đi, 1 câu dùng lại chủ điểm A (quyết định sản phẩm 12/11: app áp dụng cho mọi ngày của chủ điểm B, N7–N12, khớp bảng khung tháng) |
| Thời lượng | Làm xong trong 3–4 phút |

**Quy tắc chất lượng:**
- Không dạy điểm ngữ pháp nằm ngoài chủ điểm đang học hoặc các chủ điểm đã học trước đó.
- Câu ví dụ và bài tập chỉ dùng từ vựng phù hợp level hiện tại.
- Từ vựng cốt lõi của bài là lựa chọn đầu tiên khi đặt ví dụ. Chỉ thay bằng từ khác khi từ đó không thể đi tự nhiên với cấu trúc đang học.
- Giải thích bằng tiếng Anh (B1+) không được dùng cấu trúc khó hơn cấu trúc đang dạy.
- Bước 5 ưu tiên lỗi do ảnh hưởng tiếng Việt: thiếu động từ to be, thiếu -s/-ed, dùng sai thì vì tiếng Việt không chia thì, mạo từ, giới từ.
- Tình huống đa dạng ngành: văn phòng, sales, IT, marketing, nhân sự, tài chính. Tên người và công ty đều là hư cấu.
- Ôn thứ Sáu và đề thi không lặp nguyên câu đã có trong bài học; chỉ đổi ngữ cảnh, giữ điểm ngữ pháp.
- Đề thi tháng gắn nhãn từng câu theo chủ điểm A / B / kết hợp để chấm riêng.
- Khi chấm task viết (thi tháng và thi lên level), AI dùng rubric W3 (Writing) và S4 (Speaking) của bài thi tháng. Nhận xét viết cùng ngôn ngữ với phần giải thích của level.
