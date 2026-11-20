# Nội dung Hướng dẫn sử dụng (nút "?") — bản để PO duyệt

Sinh từ `apps/web/src/app/shared/app-guide-steps.ts` ngày 18/11/2026 (nhánh codex/ui-feedback-1118). Chữ **đậm** hiện đậm trong khung hướng dẫn.

Cách đọc: mỗi màn liệt kê **mọi bước có thể có**. Khi mở, hướng dẫn chỉ hiện những bước mà vùng đích đang có trên màn, theo thứ tự từ trên xuống; cột **Điều kiện** cho biết bước đó hiện khi nào. Mọi màn mở lại được bằng nút **?** trên thanh đầu trang (popup: nút **?** cạnh nút đóng), luôn bắt đầu từ bước 1; nút **Trước / Tiếp theo / Đã hiểu** để đi qua các bước.

Riêng **Vận hành › Phản hồi & yêu cầu** tự mở hướng dẫn ở lần đầu vào **mỗi tab** (nhớ theo trình duyệt).

## Người học

### Trang chủ `/home`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Tiêu đề khối 3 bước | Ba bước bắt đầu | Làm lần lượt **hồ sơ**, **test đầu vào**, rồi chờ duyệt mức. Nhãn cho biết bạn đang ở bước nào. |
| 2 | bước đã xong | Thẻ bước 1 | Hồ sơ đã lưu | Hồ sơ đã xong. Bấm **Xem / sửa hồ sơ** khi cần đổi thông tin. |
| 3 | bước đang làm | Thẻ bước 1 | Điền hồ sơ | Bấm **Điền hồ sơ**, khoảng 2 phút, để bài học sát công việc của bạn. |
| 4 | bước sắp tới | Thẻ bước 2 | Test đầu vào | Mở sau khi lưu hồ sơ: **4 phần**, tối đa 75 phút, không cần ôn trước. |
| 5 | bước đang làm; chưa bắt đầu bài test | Thẻ bước 2 | Làm test đầu vào | Chuẩn bị **tai nghe** và micro, rồi bấm **Bắt đầu test**. Không cần ôn trước. |
| 6 | bước đang làm; đang làm dở bài test | Thẻ bước 2 | Làm tiếp bài test | Bấm **Tiếp tục bài test** để làm tiếp; câu đã trả lời vẫn được giữ. |
| 7 | bước đã xong | Thẻ bước 2 | Đã nộp test | Bài test đã nộp. Điểm này giúp Vận hành **xếp mức** cho bạn. |
| 8 | bước sắp tới | Thẻ bước 3 | Vận hành duyệt mức | Sau khi bạn nộp test, Vận hành xếp mức. Bài học **tự mở** khi có mức. |
| 9 | bước đang làm | Thẻ bước 3 | Chờ duyệt mức | Vận hành đang xếp mức cho bạn. Bạn không cần làm gì; bài học **tự mở**. |
| 10 | được duyệt thi lại đầu vào | Thẻ bài thi lại đầu vào | Bài thi lại đầu vào | Bạn có **một lượt thi lại**. Nộp xong, Vận hành chốt mức theo bài thi lại. |
| 11 | tháng chính thức; có bài học bù | Thẻ bài chính đầu trang | Bài học hôm nay | Bài nên học hôm nay. Bấm **Học ngay**, hoặc **Học tiếp** nếu đang dở. |
| 12 | có bài học bù | Thẻ bài chính đầu trang | Bài học bù | Còn một bài ngày trước chưa học. **Học bù** bài này trước bài hôm nay. |
| 13 | tháng học thử | Thẻ bài chính đầu trang | Bài học thử | Tháng này là **tháng học thử**: học để làm quen, chưa tính điểm danh hay bài thi. |
| 14 | bài tiếp theo bị chặn bởi bài ôn / bài trước | Thẻ bài chính đầu trang | Bài đang bị chặn | Bài tiếp theo chỉ mở khi bạn xong **bài đang chặn**. Bấm nút trên thẻ để làm ngay. |
| 15 | bài chưa đến ngày, hoặc đã xong hết bài | Thẻ bài chính đầu trang | Chưa có bài mới | Thẻ ghi **ngày mở** bài tiếp theo. Trong lúc chờ, ôn lại bài đã học trong lịch. |
| 16 | bài học tháng bị khóa (bỏ lỡ bài thi) | Thẻ bài chính đầu trang | Bài học đang khóa | Bài khóa vì bạn **bỏ lỡ bài thi** tháng trước. Bấm **Gửi đơn xin mở** để Quản lý xem xét. |
| 17 | lộ trình tháng chưa công bố; bài học tháng bị khóa (bỏ lỡ bài thi) | Thẻ bài chính đầu trang | Lộ trình đang chuẩn bị | Bộ bài tháng **đang được soạn**. Trong lúc chờ, bạn vẫn luyện được với Season. |
| 18 | chưa đến ngày bắt đầu / đã học hết bài đang mở | Thẻ bài chính đầu trang | Chưa có bài mới | Thẻ cho biết vì sao chưa có bài, ví dụ **ngày bắt đầu học** hoặc đã học hết bài đang mở. |
| 19 | mức C1 | Thẻ Bài thi đầu ra | Bài thi đầu ra | Ở mức C1, thẻ cho biết bạn thi **Pass Course** được chưa và mở bài thi khi đủ điều kiện. |
| 20 | tháng chính thức | Thẻ tiến độ | Tiến độ học tập | Bài, bài ôn, **điểm danh** và điểm huy hiệu của tháng. Dòng **Vắng** so với số ngày cho phép. |
| 21 | tháng học thử | Thẻ tiến độ | Tiến độ học thử | Chỉ đếm bài đã học. Điểm danh và bài thi **tính từ ngày** ghi trên thẻ. |
| 22 | tháng chính thức | Lịch học tháng | Lịch học tháng | Mỗi ô là một bài, bài ôn, ngày nghỉ hoặc **bài thi tháng**. Bấm bài đã mở để học. |
| 23 | tháng học thử | Lịch học tháng | Lịch học thử | Mỗi ô là một bài hoặc ngày nghỉ. Ngày thi ghi **Miễn thi** vì tháng thử không có bài thi. |
| 24 | lộ trình tháng chưa công bố | Hai ô Season và Bài tháng | Luyện trong lúc chờ | Mở **Season AI Coach** để luyện nói; **Bài tháng** cho biết bộ bài đã chuẩn bị đến đâu. |
| 25 | tháng chính thức | Hai ô Season và Bài tháng | Season và bài tháng | **Season AI Coach** để luyện nói. **Bài tháng** mở lịch thi và điều kiện dự thi. |
| 26 | tháng học thử | Hai ô Season và Bài tháng | Season và bài tháng | **Season AI Coach** để luyện nói. Tháng học thử **không có bài thi**. |
| 27 | đủ điều kiện thi lên mức | Thẻ Đường lên mức | Sẵn sàng thi lên mức | Bạn đủ **4 điều kiện**. Bấm **Thi lên mức** khi đã có tai nghe và micro. |
| 28 | chưa đủ điều kiện lên mức | Thẻ Đường lên mức | Đường lên mức | Bốn **điều kiện để thi lên mức**. Đủ cả bốn thì nút thi hiện ở đây. |
| 29 | luôn có khi vùng này hiện | Thẻ Bài thi tháng | Bài thi tháng | Trạng thái **bài thi cuối tháng**. Bấm để xem lịch thi và điều kiện dự thi. |
| 30 | luôn có khi vùng này hiện | Thẻ Hồ sơ và đầu vào | Hồ sơ và đầu vào | Xem hồ sơ, **điểm đầu vào** và trình độ đã duyệt. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.onboarding-steps > h2`
2. `.onboarding-steps [data-onboarding-step="1"].done`
3. `.onboarding-steps [data-onboarding-step="1"].cur`
4. `.onboarding-steps [data-onboarding-step="2"].todo`
5. `.onboarding-steps [data-onboarding-step="2"].cur:has(.onboarding-test-note)`
6. `.onboarding-steps [data-onboarding-step="2"].cur:not(:has(.onboarding-test-note))`
7. `.onboarding-steps [data-onboarding-step="2"].done`
8. `.onboarding-steps [data-onboarding-step="3"].todo`
9. `.onboarding-steps [data-onboarding-step="3"].cur`
10. `section[aria-label="Bài thi lại đầu vào"]`
11. `.home-page:not(:has(.monthly-home-metrics[data-trial])) .home-primary-lesson:not(.home-primary-lesson--catch-up)`
12. `.home-primary-lesson--catch-up`
13. `.home-page:has(.monthly-home-metrics[data-trial]) .home-primary-lesson`
14. `.home-page [data-home-block="primary"].hero:not(.home-primary-lesson):has(a, button)`
15. `.home-page [data-home-block="primary"].hero:not(.home-primary-lesson):not(:has(a, button))`
16. `[data-home-block="primary"]:has(a[href^="/support"]):not(:has(a[href^="/lesson/"]))`
17. `.home-page[data-monthly-preparation="true"] [data-home-block="primary"]:not(:has(a[href^="/lesson/"], a[href^="/support"]))`
18. `.home-page:not([data-monthly-preparation="true"]) section.card[data-home-block="primary"]:not(:has(a))`
19. `.pass-course-home-card`
20. `.home-page:not(:has(.monthly-home-metrics[data-trial])) [data-home-block="metrics"]`
21. `.home-page:has(.monthly-home-metrics[data-trial]) [data-home-block="metrics"]`
22. `.home-page:not(:has(.monthly-home-metrics[data-trial])) [data-home-block="month-path"]`
23. `.home-page:has(.monthly-home-metrics[data-trial]) [data-home-block="month-path"]`
24. `.home-page[data-monthly-preparation="true"] [data-home-block="activities"]`
25. `.home-page:not(:has(.monthly-home-metrics[data-trial])):not([data-monthly-preparation="true"]) [data-home-block="activities"]`
26. `.home-page:has(.monthly-home-metrics[data-trial]):not([data-monthly-preparation="true"]) [data-home-block="activities"]`
27. `.home-readiness:has(a[href^="/test/level-up"])`
28. `.home-readiness:not(:has(a[href^="/test/level-up"]))`
29. `[data-home-block="monthly-exam"]`
30. `.learner-summary-card--profile`

</details>

### Bài tháng (bài thi tháng) `/monthly`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | tháng học thử | Khối trạng thái đề | Tháng học thử | Tháng học thử **không có bài thi** và không xét điều kiện dự thi. |
| 2 | luôn có khi vùng này hiện | Đầu thẻ lịch thi | Lịch thi tháng | **Ngày thi** và trạng thái đề: chưa phát hành, đã phát hành, đang làm hoặc đã xong. |
| 3 | đề đang mở | Khối trạng thái đề | Vào bài thi | Đề đã mở. Chuẩn bị tai nghe, micro rồi bấm **Vào bài thi**. |
| 4 | đề chưa mở | Khối trạng thái đề | Trạng thái đề | Cho biết **bước tiếp theo**, ví dụ chờ phát hành đề hoặc chờ giờ mở đề. |
| 5 | luôn có khi vùng này hiện | Ba chỉ số điều kiện dự thi | Điều kiện dự thi | Chỉ **điểm danh** quyết định quyền vào thi. Hai chỉ số còn lại để theo dõi. |
| 6 | vắng quá giới hạn | Form khiếu nại điều kiện | Khiếu nại điều kiện | Vắng quá giới hạn: nêu lý do rồi **Gửi khiếu nại**. Quản lý trả lời trong 24 giờ. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.monthly-assessment-landing .monthly-assessment-form-state:not([aria-label])`
2. `.monthly-assessment-header`
3. `.monthly-assessment-form-state[aria-label]:has(a.btn)`
4. `.monthly-assessment-form-state[aria-label]:not(:has(a.btn))`
5. `.monthly-eligibility-metrics`
6. `.monthly-complaint-form`

</details>

### Season AI Coach `/coach`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Phong cách trò chuyện" | Phong cách trò chuyện | Chọn giọng **Informal** hay **Formal**. Xoá chat để bắt đầu chủ đề mới. |
| 2 | luôn có khi vùng này hiện | Vùng "Lượt luyện và phản hồi" | Lượt luyện và phản hồi | Số **lượt hợp lệ** hôm nay và tháng. Bật Nhận xét, Giải thích để tự mở sau mỗi lượt. |
| 3 | luôn có khi vùng này hiện | Vùng "Cuộc trò chuyện" | Cuộc trò chuyện | Season trả lời và **chấm từng lượt**. Bấm **Nghe** để nghe câu của Season. |
| 4 | Season đang mở | Vùng "Trả lời Season" | Trả lời Season | Gõ câu tiếng Anh rồi **Gửi**, hoặc bấm **Nói** để ghi âm. |
| 5 | luôn có khi vùng này hiện | Vùng "Từ bí mật" | Từ bí mật | Các **từ bí mật** mở dần khi bạn luyện. Bấm từ đã mở để nghe. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.coach-header`
2. `.coach-limit-row`
3. `.coach-page .chat`
4. `.chat-compose:has(textarea:enabled)`
5. `.coach-vocabulary`

</details>

### Mini game `/games`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | mini game chưa mở | Vùng "Mini game chưa mở" | Mini game chưa mở | Mini game mở khi có **bài học tháng** đã phát hành. |
| 2 | màn hẹp, đang thu gọn | Vùng "Bộ từ đang chơi" | Bộ từ đang chơi | Chủ đề và số từ đang chơi. Bấm để mở, xem từ hoặc **đổi bộ từ**. |
| 3 | tạo bộ từ được | Vùng "Tạo bộ từ" | Tạo bộ từ | Nhập **1–3 từ tiếng Anh** rồi **Tạo bộ từ**, hoặc dùng từ đã học trong tháng. |
| 4 | tạo bộ từ được | Vùng "Chọn bộ từ" | Chọn bộ từ | Bấm **Dùng từ đã học trong tháng** để chơi với từ bạn đã học. |
| 5 | chưa có bộ từ | Vùng "Chưa có bộ từ" | Chưa có bộ từ | Học phần **từ vựng** của bài tháng trước, rồi quay lại chơi. |
| 6 | luôn có khi vùng này hiện | Vùng "Ôn từ trước khi chơi" | Ôn từ trước khi chơi | Các từ đang chơi, kèm **nghĩa tiếng Việt**. |
| 7 | luôn có khi vùng này hiện | Vùng "Chọn trò chơi" | Chọn trò chơi | Bấm một trò **Sẵn sàng chơi**. Trò chưa mở ghi rõ điều kiện còn thiếu. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.games-page:not(:has(.games-topic-card)) > section.card`
2. `.game-vocabulary-tools:not([open]) > summary`
3. `.games-topic-card:has(.topic-create input:enabled)`
4. `.games-topic-card:not(:has(.topic-create input:enabled)):has([data-game-source-learned])`
5. `.games-topic-card:has(a[href="/home"])`
6. `.games-word-set-card:has(.word-chip)`
7. `[aria-labelledby="games-picker-title"]:has(a.game-tile)`

</details>

### Một trò chơi `/games/*`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | trước khi chơi | Vùng "Cách chơi" | Cách chơi | Đọc mục tiêu và cách tính điểm, rồi bấm **Bắt đầu chơi**. |
| 2 | gửi kết quả lỗi | Vùng "Chưa lưu kết quả" | Chưa lưu kết quả | Kết quả chưa lưu. Kiểm tra mạng rồi bấm **Thử gửi lại**. |
| 3 | đã chơi xong | Vùng "Kết quả lượt chơi" | Kết quả lượt chơi | Điểm lượt vừa chơi. Bấm **Chơi lại** hoặc **Chọn trò khác**. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `#gm-board:has(.game-tutorial-actions)`
2. `#gm-board:has(.game-result.is-error)`
3. `#gm-board:has(.game-result.is-complete)`

</details>

### Bài học / bài ôn `/lesson/*`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | bài chưa mở | Vùng "Bài chưa mở" | Bài chưa mở | Bài chưa đến ngày hoặc cần xong **bài trước**. Bấm nút chính để làm bài đang chặn. |
| 2 | luôn có khi vùng này hiện | Vùng "Đầu bài học" | Đầu bài học | Tên bài và trạng thái. Học tab **1. Học** trước, tab **2. Bài tập** mở sau đó. |
| 3 | điện thoại, tab Học | Vùng "Học từng bước" | Học từng bước | Phần Học chia **từng bước**. Học xong bước này thì bấm **Tiếp** ở cuối trang. |
| 4 | luôn có khi vùng này hiện | Thẻ vocabulary | Từ vựng | Mỗi thẻ có phiên âm, nghĩa, ảnh. Bấm **loa** hoặc cụm từ để nghe. |
| 5 | luôn có khi vùng này hiện | Thẻ grammar | Ngữ pháp | **Công thức** và câu ví dụ. Bấm câu ví dụ để nghe cách nói. |
| 6 | luôn có khi vùng này hiện | Thẻ pronunciation | Phát âm | Nghe hết các **từ mẫu**: phần Nói chỉ mở khi đã nghe đủ. |
| 7 | luôn có khi vùng này hiện | Vùng "Xong phần Học" | Xong phần Học | Học xong thì bấm **Đã học xong → Làm bài tập** để mở tab Bài tập. |
| 8 | có nút báo lỗi | Vùng "Trả lời và nộp" | Trả lời và nộp | Trả lời rồi bấm **Nộp bài**; sai thì làm lại. Đề sai thì bấm **Báo lỗi câu này**. |
| 9 | chưa có nút báo lỗi | Vùng "Trả lời và nộp" | Trả lời và nộp | Trả lời rồi bấm **Nộp bài**. Sai thì làm lại kèm gợi ý. |
| 10 | chưa nghe đủ từ mẫu | Thẻ speaking | Mở phần Nói | Phần Nói đang khóa: nghe hết **từ mẫu** ở thẻ Phát âm trước. |
| 11 | đã nghe đủ từ mẫu | Thẻ speaking | Nói | Nghe câu mẫu, **ghi âm** câu của bạn rồi bấm **Kiểm tra nói**. |
| 12 | đang mở form báo lỗi | Vùng "Báo lỗi phần bài" | Báo lỗi phần bài | Ghi rõ **chỗ sai**, thêm ảnh nếu có, rồi gửi để Vận hành xem lại. |
| 13 | luôn có khi vùng này hiện | Vùng "Hoàn thành bài" | Hoàn thành bài | Đủ phần thì bấm **Hoàn thành bài** để lưu và mở bài tiếp theo. |
| 14 | bài ôn thứ Sáu | Vùng "Bài ôn thứ Sáu" | Bài ôn thứ Sáu | Ôn lại **từ và cấu trúc** của tuần, làm lần lượt từng phần. |
| 15 | bài ôn thứ Sáu | Vùng "Các phần bài ôn" | Các phần bài ôn | Mỗi dòng ghi **số câu đúng** của một phần. |
| 16 | bài ôn thứ Sáu | Vùng "Khởi động lật thẻ" | Khởi động lật thẻ | Bấm thẻ để lật xem **từ tiếng Anh**. Phần này không chấm điểm. |
| 17 | bài ôn thứ Sáu | Vùng "Câu đang làm" | Câu đang làm | Trả lời rồi bấm **Kiểm tra**. Câu sai sẽ **quay lại** ở cuối phần. |
| 18 | bài ôn thứ Sáu | Vùng "Đã xong bài ôn" | Đã xong bài ôn | Kết quả đã lưu. **Bài đầu tuần sau** mở đúng ngày của nó. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.app-learner-page > div.card:has(.eyebrow)`
2. `.lesson-heading`
3. `.lesson-study-steps`
4. `.lesson-part--vocabulary`
5. `.lesson-part--grammar`
6. `.lesson-part--pronunciation`
7. `.lesson-study-cta`
8. `.lesson-parts:has(.lesson-answer > button[aria-expanded]) .lesson-answer`
9. `.lesson-parts:not(:has(.lesson-answer > button[aria-expanded])) .lesson-answer`
10. `.lesson-part--speaking:has(.lesson-speaking-gate)`
11. `.lesson-part--speaking:not(:has(.lesson-speaking-gate))`
12. `.lesson-appeal-form`
13. `.lesson-completion`
14. `.app-learner-page > .row:has(> .lesson-back)`
15. `.weekly-review-sections`
16. `section.card:has(button.card.flat[aria-pressed])`
17. `.app-learner-page:has(> .weekly-review-sections, .weekly-review-sections) section.card.stack:has([role="group"], textarea, .weekly-review-read-aloud)`
18. `section.card:is([aria-label="Đã xong bài ôn"], [aria-label="Review complete"])`

</details>

### Điền / sửa hồ sơ `/onboard`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | sửa hồ sơ, màn hẹp | Vùng "Các mục hồ sơ" | Các mục hồ sơ | Hồ sơ chia **4 mục**. Điền xong mục này rồi bấm **Tiếp** ở cuối trang. |
| 2 | luôn có khi vùng này hiện | Vùng "Thông tin và mục tiêu" | Thông tin và mục tiêu | Điền **họ tên, email** và 4 câu về việc bạn dùng tiếng Anh; các mục có dấu sao là bắt buộc. |
| 3 | luôn có khi vùng này hiện | Vùng "Phong cách học" | Phong cách học | Chọn **cách học** hợp với bạn, thời lượng và thiết bị hay dùng. |
| 4 | luôn có khi vùng này hiện | Vùng "Trình độ tự đánh giá" | Trình độ tự đánh giá | Chọn **trình độ** bạn tự thấy và chứng chỉ nếu có. |
| 5 | luôn có khi vùng này hiện | Vùng "Lưu hồ sơ" | Lưu hồ sơ | **Lưu nháp** để điền tiếp sau. Lưu đủ hồ sơ thì chuyển sang **test đầu vào**. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.profile-edit-sections`
2. `.profile-form > section.card:not([id]):not([hidden])`
3. `#profile-edit-learning`
4. `#profile-edit-level`
5. `.onboard-actions`

</details>

### Tiến độ & hồ sơ `/profile`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Hồ sơ cá nhân" | Hồ sơ cá nhân | **Đổi avatar**, hoặc **Xem hồ sơ** để xem và cập nhật thông tin. |
| 2 | chưa có hồ sơ | Vùng "Hồ sơ chưa đủ" | Hồ sơ chưa đủ | Bấm **Điền hồ sơ** để bài học hợp với công việc của bạn. |
| 3 | luôn có khi vùng này hiện | Vùng "Hỗ trợ học tập" | Hỗ trợ học tập | Gửi **khiếu nại, kháng nghị**, khảo sát và xem phản hồi đã nhận. |
| 4 | đã hoàn thành khóa | Vùng "Đã hoàn thành khóa" | Đã hoàn thành khóa | Bấm **Xem chứng nhận** để mở chứng nhận hoàn thành khóa. |
| 5 | luôn có khi vùng này hiện | Vùng "Mùa học và huy hiệu" | Mùa học và huy hiệu | Đủ **điểm và huy hiệu** thì lên mùa tiếp theo. Bấm để xem điều kiện từng huy hiệu. |
| 6 | luôn có khi vùng này hiện | Vùng "Kết quả đánh giá" | Kết quả đánh giá | Điểm **đầu vào** từng kỹ năng. Bấm **Xem lại bài làm** để xem từng câu. |
| 7 | luôn có khi vùng này hiện | Vùng "Kết quả đánh giá" | Kết quả đánh giá | Điểm đầu vào và đầu ra. Bấm **Chi tiết điểm đầu ra** để xem từng kỹ năng. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.profile-identity-card`
2. `.app-learner-page:not(.profile-page):has(> a[href="/onboard"])`
3. `.learner-support-entry`
4. `.profile-progress-section:has(.profile-completion-heading)`
5. `[aria-label="Mùa học"]`
6. `.profile-assessment-section:not(:has(.profile-assessment-result))`
7. `.profile-assessment-section:has(.profile-assessment-result)`

</details>

### Hỗ trợ học tập `/support`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Bạn cần hỗ trợ gì?" | Bạn cần hỗ trợ gì? | Mỗi ô là một loại yêu cầu, kèm **số mục đang chờ**. Bấm nút trong ô để gửi hoặc xem. |
| 2 | tab Tất cả; đã có mức | Hàng tab | Các mục hỗ trợ | **Khiếu nại** báo lỗi điểm danh, bài, tài khoản. **Kháng nghị** xin xem lại kết quả hoặc thi lại. |
| 3 | tab Tất cả; chưa có mức | Hàng tab | Các mục hỗ trợ | Mở **Khiếu nại** để báo vấn đề tài khoản. Mục khác mở khi bạn có mức. |
| 4 | đang mở form khiếu nại | Vùng "Khiếu nại mới" | Khiếu nại mới | Chọn **loại**, nêu lý do, thêm ảnh nếu có, rồi **Gửi cho Quản lý**. |
| 5 | luôn có khi vùng này hiện | Vùng "Xin thi lại đầu vào" | Xin thi lại đầu vào | Bạn được xin **thi lại một lần**. Ghi lý do rồi gửi cho Vận hành. |
| 6 | luôn có khi vùng này hiện | Vùng "Bài có thể kháng nghị" | Bài có thể kháng nghị | Bấm **Gửi kháng nghị** ở bài còn hạn và nêu lý do. |
| 7 | luôn có khi vùng này hiện | Vùng "Khảo sát tháng" | Khảo sát tháng | Trả lời các câu có dấu sao rồi **Gửi phản hồi**. |
| 8 | tab Khiếu nại | Bảng danh sách | Khiếu nại đã gửi | Mỗi hàng có **trạng thái**. Bấm **Chi tiết** để đọc phản hồi. |
| 9 | tab Kháng nghị | Bảng danh sách | Kháng nghị đã gửi | Mỗi hàng có **trạng thái**. Bấm **Chi tiết** để đọc phản hồi của Vận hành. |
| 10 | tab Khảo sát | Bảng danh sách | Khảo sát đã gửi | Bấm **Chi tiết** để xem lại câu trả lời của tháng đó. |
| 11 | tab Tất cả | Bảng danh sách | Lịch sử hỗ trợ | Mọi yêu cầu đã gửi kèm **trạng thái**. Bấm **Chi tiết** để đọc phản hồi. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.learner-support-shortcuts`
2. `.learner-support-page:has(.request-tabs a[aria-current="page"]:not([href*="type="])):has(.request-tabs a[href*="type=appeals"]) .request-tabs`
3. `.learner-support-page:has(.request-tabs a[aria-current="page"]:not([href*="type="])):not(:has(.request-tabs a[href*="type=appeals"])) .request-tabs`
4. `[aria-labelledby="learner-complaint-title"]`
5. `.learner-support-action:has(.placement-retake-heading)`
6. `.learner-support-action:has(.assessment-appeal-status)`
7. `.card:has(> .monthly-survey-form), .monthly-survey-form`
8. `.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=complaints"]) .request-card`
9. `.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=appeals"]) .request-card`
10. `.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=feedback"]) .request-card`
11. `.learner-support-page:has(.request-tabs a[aria-current="page"]:not([href*="type="])) .request-card`

</details>

## Vận hành

### Duyệt trình độ `/op`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | khi danh sách có người | Khối pending | Hồ sơ chờ duyệt | Mở từng học viên để xem **điểm 4 kỹ năng**, chọn mức rồi bấm **Duyệt mức**. |
| 2 | khi danh sách có người | Khối signals | Tín hiệu đổi mức | Người đủ điều kiện **thi lên mức**, và người sai nhiều hai tuần liền cần xem **hạ mức**. |
| 3 | luôn có khi vùng này hiện | Vùng "Học viên đã duyệt" | Học viên đã duyệt | Mức hiện tại của từng người. **Đổi level**, mở **Thi lên mức** hoặc đặt mục tiêu tháng. |
| 4 | khi danh sách có người | Khối in-progress | Đang làm test | Đã bắt đầu bài đầu vào nhưng **chưa nộp**. |
| 5 | khi danh sách có người | Khối retry | Cần làm lại | Cần làm lại bài đầu vào. Bấm **Cho thi lại** để cấp lượt thi lại. |
| 6 | khi danh sách có người | Khối unassessed | Chưa làm test | Có tài khoản nhưng **chưa bắt đầu** bài đầu vào. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `[data-guide="op-pending"]`
2. `[data-guide="op-signals"]`
3. `.operator-approved-panel`
4. `[data-guide="op-in-progress"]`
5. `[data-guide="op-retry"]`
6. `[data-guide="op-unassessed"]`

</details>

### Bài học (soạn tháng) `/op/months`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Chu kỳ tháng" | Chu kỳ tháng | Chọn tháng cần soạn. Tháng đã qua chỉ **xem**, không sửa. |
| 2 | luôn có khi vùng này hiện | Vùng "Chủ đề tháng" | Chủ đề tháng | Soạn hoặc **Gợi ý AI** chủ đề chung, rồi **Chốt chủ đề**. Hàng cuối để chọn mức. |
| 3 | luôn có khi vùng này hiện | Vùng "Tài nguyên tháng" | Tài nguyên tháng | **Sinh** hoặc soạn tay từ vựng, ngữ pháp, phát âm cho mức này, rồi **Duyệt tài nguyên**. |
| 4 | luôn có khi vùng này hiện | Vùng "Công bố tháng" | Công bố tháng | Cho biết còn thiếu gì. Đủ điều kiện thì bấm **Công bố tháng**. |
| 5 | luôn có khi vùng này hiện | Vùng "Lịch soạn bài" | Lịch soạn bài | **AI** sinh bài, **bút chì** soạn tay, Xem mở bài. Chỉ bật sau khi duyệt tài nguyên. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.monthly-month-card`
2. `.monthly-topic-card`
3. `.monthly-resources`
4. `.monthly-publication`
5. `#monthly-teaching-calendar`

</details>

### Phản hồi & yêu cầu `/op/review`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Hàng 4 tab | Bốn mục của trang | Bốn tab: nhận xét Season, **kháng nghị** của học viên, **yêu cầu** gửi Quản lý, cảnh báo câu sai hai lượt. |
| 2 | tab Kháng nghị học viên | Bộ lọc Trạng thái | Lọc theo trạng thái | Chọn **Chờ xử lý** để thấy việc còn mở, **Đã xử lý** để xem lại quyết định. |
| 3 | tab Kháng nghị học viên | Ô Loại của hàng đầu tiên | Cột Loại | **Kháng nghị**: xin xem lại kết quả bài. **Yêu cầu thi lại**: xin thi lại bài đầu vào. |
| 4 | tab Kháng nghị học viên | Ô Trạng thái của hàng đầu tiên | Ba trạng thái | **Chờ xử lý** là chưa quyết định; đã quyết định thì ghi **Đã chấp nhận** hoặc Đã từ chối. |
| 5 | tab Kháng nghị học viên; có mục đang chờ | Ô thao tác (nút Xử lý) của mục đang chờ đầu tiên | Nút Xử lý | Bấm **Xử lý**: đọc lý do, minh chứng, rồi chấp nhận hoặc từ chối kèm **lời giải thích**. |
| 6 | tab Kháng nghị học viên; có mục đã xử lý | Ô thao tác (Chi tiết, Xóa) của mục đã xử lý đầu tiên | Chi tiết và Xóa | **Chi tiết** xem lại quyết định. **Xóa** chỉ ẩn khỏi danh sách; học viên vẫn thấy kết quả. |
| 7 | tab Kháng nghị học viên; danh sách trống | Bảng kháng nghị (trống) | Danh sách kháng nghị | Chưa có mục nào theo bộ lọc này. Mục mới sẽ hiện ở đây kèm **loại** và **trạng thái**. |
| 8 | tab Kháng nghị học viên; đang mở kháng nghị chờ xử lý | Khung chi tiết mục đang mở | Xử lý kháng nghị | Đọc lý do và bài làm, chọn **Chấp nhận** hoặc **Giữ nguyên kết quả**, rồi giải thích cho học viên. |
| 9 | tab Kháng nghị học viên; đang mở yêu cầu thi lại chờ xử lý | Khung chi tiết mục đang mở | Xử lý thi lại | Chọn **Duyệt cho thi lại** hoặc Từ chối. Cần **phát hành đề thi lại** trước khi duyệt. |
| 10 | tab Kháng nghị học viên; đang mở một mục đã xử lý | Khung chi tiết mục đang mở | Xem quyết định | Lý do, minh chứng và **phản hồi đã gửi**. Quyết định đã lưu không sửa được. |
| 11 | tab Phản hồi Season | Vùng "Phản hồi Season" | Phản hồi Season | Mở từng học viên để đọc nhận xét AI, rồi bấm **Đánh dấu đã kiểm**. |
| 12 | tab Phản hồi Season; chưa có dữ liệu | Dòng trống của danh sách | Phản hồi Season | Chưa có lượt luyện. Lượt luyện với **Season** sẽ hiện ở đây để bạn kiểm tra. |
| 13 | tab Yêu cầu đã gửi | Bảng danh sách | Yêu cầu đã gửi | Yêu cầu **mở lại** hoặc **xóa tài khoản** bạn gửi Quản lý, kèm trạng thái và phản hồi. |
| 14 | tab Cảnh báo bài tập | Vùng "Câu sai cả hai lượt" | Câu sai cả hai lượt | Mở câu hỏi để kiểm tra. Đề sai thì **Hiệu chỉnh câu**, đề đúng thì **Không lỗi**. |
| 15 | tab Cảnh báo bài tập; chưa có dữ liệu | Dòng trống của danh sách | Cảnh báo bài tập | Chưa có câu nào học viên **sai cả hai lượt**. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.operator-review-navigation`
2. `[data-operator-review-tab="appeals"] .request-filters`
3. `[data-operator-review-tab="appeals"] .request-table[aria-label="Danh sách kháng nghị"] .request-record:first-of-type .request-kind`
4. `[data-operator-review-tab="appeals"] .request-table[aria-label="Danh sách kháng nghị"] .request-record:first-of-type .request-state`
5. `[data-operator-review-tab="appeals"] .request-table[aria-label="Danh sách kháng nghị"] .request-record:not(:has(.request-delete)) .request-commands`
6. `[data-operator-review-tab="appeals"] .request-table[aria-label="Danh sách kháng nghị"] .request-record:has(.request-delete) .request-commands`
7. `[data-operator-review-tab="appeals"] .request-table[aria-label="Danh sách kháng nghị"]:not(:has(.request-record))`
8. `[data-operator-review-tab="appeals"] .operator-request-expanded:has(.operator-review-appeal-pending:not([aria-label^="Yêu cầu thi lại"]))`
9. `[data-operator-review-tab="appeals"] .operator-request-expanded:has(.operator-review-appeal-pending[aria-label^="Yêu cầu thi lại"])`
10. `[data-operator-review-tab="appeals"] .operator-request-expanded:has(.operator-review-appeal:not(.operator-review-appeal-pending))`
11. `[data-operator-review-tab="coach"] .operator-review-panel`
12. `[data-operator-review-tab="coach"] > .empty`
13. `[data-operator-review-tab="sent"] .request-card`
14. `[data-operator-review-tab="attempts"] .operator-review-card-list > article`
15. `[data-operator-review-tab="attempts"] .empty`

</details>

### Kết quả bài thi / kho đề `/op/tests`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Loại đề" | Loại đề | Chọn **loại đề**; kho đề và kết quả bên dưới đổi theo tab. |
| 2 | tab Đề lên mức | Vùng "Mức đích" | Mức đích | Chọn **mức học viên sẽ lên** để xem kho đề của mức đó. |
| 3 | tab Bài thi tháng | Vùng "Tháng của đề" | Tháng của đề | Chọn **tháng** để xem đề thi tháng đó. |
| 4 | luôn có khi vùng này hiện | Vùng "Công cụ đề" | Công cụ đề | **Soạn tay** hoặc Sinh bằng AI để thêm nháp. **Cách giao đề** chọn bộ cho lượt thi mới. |
| 5 | luôn có khi vùng này hiện | Vùng "Các phiên bản" | Các phiên bản | Nhãn cho biết **Đang dùng**, Đã duyệt hay Bản nháp. Bấm **Xem** để đọc, Sửa bản nháp. |
| 6 | tab Đề đầu vào | Vùng "Kho đề thi lại" | Kho đề thi lại | Kho riêng cho **thi lại đầu vào**, dùng khi Vận hành cho học viên thi lại. |
| 7 | tab Bài thi tháng | Vùng "Đề thi tháng" | Đề thi tháng | Mỗi **tháng và mức** một đề. Bấm **Xem** để đọc, Sửa đề khi còn sửa được. |
| 8 | tab Bài thi tháng | Vùng "Phiên bản đề đã lưu" | Phiên bản đề đã lưu | Các phiên bản đề kèm **trạng thái**. Bấm **Xem** để mở trước đề. |
| 9 | luôn có khi vùng này hiện | Vùng "Kết quả bài thi" | Kết quả bài thi | Bài học viên đã nộp của loại đề này. Bấm **Xem** để mở bài làm và **chấm**. |
| 10 | chưa có bài nộp | Dòng trống của danh sách | Kết quả bài thi | Chưa có **bài nộp** của loại đề này. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.operator-review-tabs[aria-label="Loại bài kiểm tra"]`
2. `.tabs[aria-label="Mức đích"]`
3. `.operator-monthly-bank-tabs`
4. `.assessment-bank:not([aria-label="Kho đề thi lại đầu vào"]) > .assessment-bank-toolbar`
5. `.assessment-bank:not([aria-label="Kho đề thi lại đầu vào"]) > .assessment-bank-list:has(.assessment-bank-row)`
6. `.assessment-bank[aria-label="Kho đề thi lại đầu vào"]`
7. `[data-assessment-kind="final"]`
8. `.operator-assessment-form-list:not([data-assessment-kind="final"]):not(.assessment-bank)`
9. `.card:has(.operator-results-table)`
10. `main .empty`

</details>

### Đề lên mức (cùng hướng dẫn với Kết quả bài thi) `/op/levelforms`

Dùng chung hướng dẫn với **Kết quả bài thi / kho đề**.

### Cài đặt `/settings`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Mục cài đặt theme | Giao diện theo mùa | Chọn giao diện **theo mùa, theo lễ** hoặc Tự động, rồi **Lưu** cho cả tổ chức. |
| 2 | luôn có khi vùng này hiện | Mục cài đặt music | Nhạc nền | Bật nhạc nền, chọn bài và âm lượng. **Nghe thử** trước khi **Lưu**. |
| 3 | luôn có khi vùng này hiện | Mục cài đặt monthly | Học theo tháng | **Giới hạn chat** Season mỗi ngày. Vận hành chỉ xem. |
| 4 | luôn có khi vùng này hiện | Mục cài đặt accounts | Người dùng | Vai trò, mức và **trạng thái** tài khoản. Vận hành chỉ xem. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.settings-panel:has(> #setting-theme), #setting-theme > .card`
2. `.settings-panel:has(> #setting-music), #setting-music > .card`
3. `.settings-panel:has(> #setting-monthly), #setting-monthly > .card`
4. `.settings-panel:has(> #setting-accounts), #setting-accounts > .card`

</details>

### Trang một bài tháng `/op/months/lesson/*`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Thao tác bài" | Thao tác bài | **Sửa tay** để chỉnh, **Duyệt bài** khi đã đúng. Bài đã duyệt cần yêu cầu mở lại để sửa. |
| 2 | bản nháp có lỗi kiểm tra | Vùng "Lỗi cần sửa" | Lỗi cần sửa | Lỗi kiểm tra tự động tìm thấy. Bấm **Sửa** để mở đúng trường cần sửa. |
| 3 | luôn có khi vùng này hiện | Vùng "Nội dung bài" | Nội dung bài | Bài đúng như học viên sẽ thấy. **Đọc lại** trước khi duyệt. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.operator-page-title-actions`
2. `.operator-monthly-findings-dock`
3. `.operator-monthly-lesson`

</details>

### Popup Soạn tay bài (Bài học › bút chì) `popup lesson editor`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Mục general của trình soạn | Phần Chung | **Tiêu đề** học viên sẽ thấy. **Mục tiêu**: mỗi dòng một việc học viên làm được. |
| 2 | luôn có khi vùng này hiện | Mục vocabulary của trình soạn | Từ vựng của ngày | Từ lấy theo **kế hoạch tháng**. Kiểm tra nghĩa, phiên âm và cụm từ của từng từ. |
| 3 | luôn có khi vùng này hiện | Mục grammar của trình soạn | Ngữ pháp | Giải thích, **công thức** và câu ví dụ. Công thức theo kế hoạch tháng không sửa ở đây. |
| 4 | luôn có khi vùng này hiện | Mục listening của trình soạn | Các phần bài tập | Từ **Nghe** trở xuống là bài tập: câu hỏi, lựa chọn và **đáp án đúng**. |
| 5 | bài ôn | Các mục Phần N của bài ôn | Các phần bài ôn | Mỗi phần là một nhóm câu. **Bản làm lại** là câu hỏi lại khi học viên sai. |
| 6 | luôn có khi vùng này hiện | Hàng nút cuối popup | Kiểm tra và lưu | Bấm **Kiểm tra & lưu**. Mục còn thiếu sẽ được liệt kê để bổ sung. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `[data-section="general"]`
2. `[data-section="vocabulary"]`
3. `[data-section="grammar"]`
4. `[data-section="listening"]`
5. `[data-section^="review-"]`
6. `.operator-editor-actions`

</details>

### Popup Cách giao đề `popup assessment delivery`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Chọn cách giao" | Chọn cách giao | **Dùng nguyên một bộ**, hoặc **Trộn các bộ** (cần ít nhất hai bộ đã duyệt). |
| 2 | luôn có khi vùng này hiện | Vùng "Chọn bộ đề" | Chọn bộ đề | Chọn đúng **số bộ** đã chỉ định; bộ chưa duyệt không chọn được. |
| 3 | luôn có khi vùng này hiện | Vùng "Áp dụng cấu hình" | Áp dụng cấu hình | Bấm **Xác nhận áp dụng**. Chỉ áp dụng cho **lượt thi mới**. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `fieldset:first-of-type`
2. `fieldset:last-of-type`
3. `.assessment-bank-confirm`

</details>

## Quản lý

### Tiến độ nhóm `/mgr`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | có yêu cầu xoá tài khoản | Vùng "Yêu cầu xoá tài khoản" | Yêu cầu xoá tài khoản | Vận hành xin xoá tài khoản học viên. Bấm **Duyệt xoá** để quyết định. |
| 2 | luôn có khi vùng này hiện | Vùng "Ba chỉ số chính" | Ba chỉ số chính | **Duy trì nhịp học**, hoàn thành lộ trình và hài lòng, so với ngưỡng mục tiêu. |
| 3 | luôn có khi vùng này hiện | Vùng "Danh sách đang học" | Danh sách đang học | Người học xếp theo **rủi ro bỏ học**. Bấm **Hồ sơ** để xem chi tiết. |
| 4 | luôn có khi vùng này hiện | Vùng "Thao tác nhanh" | Thao tác nhanh | **Cần nhắc** mở trang Nhắc học, **Xuất CSV** tải tiến độ tháng. |
| 5 | màn ≤ 1024px | Vùng "Chờ xếp mức" | Chờ xếp mức | Người chưa có mức: **đã nộp**, đang làm hoặc chưa làm test đầu vào. |
| 6 | màn > 1024px | Vùng "Chờ duyệt mức" | Chờ duyệt mức | Đã nộp test, chờ **Vận hành duyệt mức**. |
| 7 | màn > 1024px | Vùng "Đang làm test" | Đang làm test | Đã mở test đầu vào nhưng **chưa nộp**. |
| 8 | màn > 1024px | Vùng "Chưa làm test" | Chưa làm test | Có tài khoản nhưng **chưa làm** test đầu vào. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.manager-operational-card--delete`
2. `.manager-kpi-grid`
3. `.manager-progress-card`
4. `.manager-progress-card-actions`
5. `.manager-progress-waiting`
6. `.manager-progress-submitted`
7. `.manager-progress-testing`
8. `.manager-progress-not-tested`

</details>

### Hiệu suất vận hành `/mgr/ops`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Hiệu suất vận hành" | Hiệu suất vận hành | Chọn **Tháng**. Mỗi hàng là một người vận hành; bấm **Chi tiết** để xem bài đã soạn, đã duyệt. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.manager-operators-section`

</details>

### Ngày nghỉ lễ `/mgr/holidays`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Thêm ngày nghỉ" | Thêm ngày nghỉ | Chọn ngày nghỉ riêng của tổ chức rồi bấm **Thêm ngày nghỉ**. |
| 2 | luôn có khi vùng này hiện | Vùng "Lịch nghỉ lễ" | Lịch nghỉ lễ | Ngày lễ Việt Nam có sẵn. Ngày nghỉ của tổ chức **xóa được**. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.manager-holiday-form`
2. `.manager-holiday-calendar`

</details>

### Nhắc học viên `/mgr/reminders`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | có người cần nhắc | Vùng "Người cần nhắc" | Người cần nhắc | Số người cần nhắc hôm nay. **Gửi tất cả qua email** hoặc nhắc từng người. |
| 2 | không ai cần nhắc | Vùng "Không ai cần nhắc" | Không ai cần nhắc | Hôm nay **không ai** vắng quá số ngày quy định. |
| 3 | có người cần nhắc | Vùng "Danh sách cần nhắc" | Danh sách cần nhắc | Mỗi thẻ là một người vắng lâu, kèm **tin nhắn soạn sẵn**. |
| 4 | có người cần nhắc | Vùng "Lời nhắc" | Lời nhắc | **Copy tin nhắn**, gửi email hoặc Base.vn. Đã nhắc nơi khác thì bấm **Đã nhắc qua kênh khác**. |
| 5 | luôn có khi vùng này hiện | Vùng "Lịch sử nhắc" | Lịch sử nhắc | Mỗi lần nhắc: ngày, người học, kênh và **kết quả** gửi. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.manager-reminder-toolbar`
2. `.manager-reminder-empty-state`
3. `.manager-reminder-queue`
4. `.manager-reminder-card`
5. `.manager-reminder-history`

</details>

### Báo cáo tổng kết `/mgr/report`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Báo cáo tháng" | Báo cáo tháng | Bấm **In / Lưu PDF** hoặc **Copy bản chữ** để gửi báo cáo. |
| 2 | luôn có khi vùng này hiện | Vùng "Lọc báo cáo" | Lọc báo cáo | Chọn **Tháng** và **Mức** để lọc cả báo cáo. |
| 3 | luôn có khi vùng này hiện | Vùng "Ba chỉ số" | Ba chỉ số | Kết quả từng chỉ số so với **ngưỡng**: đạt hay chưa. |
| 4 | luôn có khi vùng này hiện | Vùng "Từng học viên" | Từng học viên | Điểm danh, bài học, Season và **bài thi tháng** của từng người. |
| 5 | luôn có khi vùng này hiện | Vùng "Việc cần làm tiếp" | Việc cần làm tiếp | Gợi ý **việc nên làm** từ số liệu tháng. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.report > .rhead`
2. `.manager-monthly-filters`
3. `[aria-label="Ba chỉ số của tháng"]`
4. `.manager-report-learner-table-wrap, .manager-monthly-learner-list`
5. `.manager-report-next-actions`

</details>

### Khảo sát tháng `/mgr/surveys`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Tháng khảo sát" | Tháng khảo sát | Chọn tháng rồi bấm **Xem tháng**. |
| 2 | luôn có khi vùng này hiện | Vùng "Biểu mẫu khảo sát" | Biểu mẫu khảo sát | Soạn **bản nháp**, xem trước như người học thấy, rồi **Công bố khảo sát**. |
| 3 | luôn có khi vùng này hiện | Vùng "Kết quả khảo sát" | Kết quả khảo sát | **Số phản hồi** và câu trả lời của tháng đang xem. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.monthly-survey-month-filter`
2. `[aria-labelledby="manager-monthly-survey-editor"]`
3. `[aria-labelledby="manager-monthly-survey-results"]`

</details>

### Nội dung tháng (chỉ xem) `/mgr/ops/months`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Chu kỳ tháng" | Chu kỳ tháng | Chọn tháng cần xem. Quản lý **chỉ xem**. |
| 2 | luôn có khi vùng này hiện | Vùng "Chủ đề tháng" | Chủ đề tháng | Chủ đề do Vận hành soạn, Quản lý chỉ xem. Hàng cuối để **chọn mức**. |
| 3 | luôn có khi vùng này hiện | Vùng "Tài nguyên tháng" | Tài nguyên tháng | Từ vựng, ngữ pháp, phát âm của mức này. Bấm **từng ô** để xem. |
| 4 | luôn có khi vùng này hiện | Vùng "Công bố tháng" | Công bố tháng | Mức này **đã công bố** chưa, hay còn thiếu gì. |
| 5 | luôn có khi vùng này hiện | Vùng "Lịch học" | Lịch học | Mỗi ô là một ngày. Bấm **Xem** để mở bài đã soạn. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.monthly-month-card`
2. `.monthly-topic-card`
3. `.monthly-resources`
4. `.monthly-publication`
5. `#monthly-teaching-calendar`

</details>

### Yêu cầu / Khiếu nại `/mgr/requests`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Hàng tab | Loại yêu cầu | **Yêu cầu mở khóa** từ Vận hành, **Khiếu nại** từ học viên. |
| 2 | luôn có khi vùng này hiện | Vùng "Mục đã lưu trữ" | Mục đã lưu trữ | Bật để xem lại các mục **đã lưu trữ**. |
| 3 | luôn có khi vùng này hiện | Bảng danh sách | Danh sách yêu cầu | Mục chờ nằm đầu. **Duyệt** hoặc **Từ chối** kèm lý do; mục xong có thể lưu trữ. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `nav.request-tabs[aria-label="Loại yêu cầu"]`
2. `.manager-requests-filters`
3. `.manager-requests-card .request-table`

</details>

### Giả lập phần thưởng `/mgr/rewards`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Tình huống giả lập" | Tình huống giả lập | Chọn **Trình độ** và **Tình huống mẫu**, hoặc tùy chỉnh điểm và huy hiệu. |
| 2 | luôn có khi vùng này hiện | Vùng "Học viên sẽ thấy" | Học viên sẽ thấy | Thẻ Mùa học đúng như học viên thấy. Bấm **Xem lên cấp** để xem màn chúc mừng. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.manager-reward-controls`
2. `.manager-reward-result-pane`

</details>

### Kết quả bài thi (chỉ xem) `/mgr/ops/tests`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Loại đề" | Loại đề | Chọn **loại đề**. Quản lý chỉ xem đề và kết quả. |
| 2 | tab Đề lên mức | Vùng "Mức đích" | Mức đích | Chọn **mức học viên sẽ lên**. |
| 3 | luôn có khi vùng này hiện | Vùng "Kho đề đang dùng" | Kho đề đang dùng | Các phiên bản đề kèm **trạng thái**. Bấm **Xem** để mở. |
| 4 | tab Bài thi tháng | Vùng "Đề thi tháng" | Đề thi tháng | Mỗi **tháng và mức** một đề. Bấm **Xem** để đọc. |
| 5 | tab Bài thi tháng | Vùng "Phiên bản đề đã lưu" | Phiên bản đề đã lưu | Các phiên bản đề kèm **trạng thái**. Bấm **Xem** để mở. |
| 6 | luôn có khi vùng này hiện | Vùng "Kết quả bài thi" | Kết quả bài thi | Bài đã nộp kèm **tổng điểm**. Bấm **Xem** để mở bài làm. |
| 7 | chưa có bài nộp | Dòng trống của danh sách | Kết quả bài thi | Chưa có **bài nộp** của loại đề này. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.operator-review-tabs[aria-label="Loại bài kiểm tra"]`
2. `.tabs[aria-label="Mức đích"]`
3. `.assessment-bank`
4. `[data-assessment-kind="final"]`
5. `.operator-assessment-form-list:not([data-assessment-kind="final"]):not(.assessment-bank)`
6. `.card:has(.operator-results-table)`
7. `main .empty`

</details>

### Đề lên mức (chỉ xem, cùng hướng dẫn) `/mgr/ops/level-forms`

Dùng chung hướng dẫn với **Kết quả bài thi (chỉ xem)**.

### Duyệt trình độ (chỉ xem) `/mgr/ops/levels`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | khi danh sách có người | Khối pending | Hồ sơ chờ duyệt | Xem **điểm từng kỹ năng**. Vận hành là người chọn mức. |
| 2 | khi danh sách có người | Khối signals | Tín hiệu đổi mức | Người đủ điều kiện **thi lên mức** hoặc cần xem **hạ mức**. |
| 3 | luôn có khi vùng này hiện | Vùng "Học viên đã duyệt" | Học viên đã duyệt | Mức hiện tại của từng người. Bấm **Hồ sơ** để xem chi tiết. |
| 4 | khi danh sách có người | Khối in-progress | Đang làm test | Đã bắt đầu bài đầu vào nhưng **chưa nộp**. |
| 5 | khi danh sách có người | Khối retry | Cần làm lại | Cần **làm lại** bài đầu vào; Vận hành xử lý. |
| 6 | khi danh sách có người | Khối unassessed | Chưa làm test | Có tài khoản nhưng **chưa làm** bài đầu vào. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `[data-guide="op-pending"]`
2. `[data-guide="op-signals"]`
3. `.operator-approved-panel`
4. `[data-guide="op-in-progress"]`
5. `[data-guide="op-retry"]`
6. `[data-guide="op-unassessed"]`

</details>

### Chấm & Kháng nghị (chỉ xem) `/mgr/ops/review`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Vùng "Ba nhóm nội dung" | Ba nhóm nội dung | Season, kháng nghị và cảnh báo bài tập. **Quản lý chỉ xem**, Vận hành xử lý. |
| 2 | luôn có khi vùng này hiện | Vùng "Phản hồi Season" | Phản hồi Season | Mở từng người học để đọc **nhận xét AI**. |
| 3 | luôn có khi vùng này hiện | Vùng "Kháng nghị" | Kháng nghị | Mở từng người học để xem lý do và **trạng thái** kháng nghị. |
| 4 | tab đang chọn chưa có dữ liệu | Vùng "Câu sai cả hai lượt" | Câu sai cả hai lượt | Câu học viên **sai cả hai lượt**. Bấm **Mở câu hỏi** để xem đề. |
| 5 | tab đang chọn chưa có dữ liệu | Dòng trống của danh sách | Chưa có dữ liệu | Nhóm này **chưa có mục** nào. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `[aria-label="Nhóm nội dung cần kiểm tra"]`
2. `.operator-review-panel:not(:has(.operator-appeals-list))`
3. `.operator-appeals-list`
4. `main:has([aria-label="Nhóm nội dung cần kiểm tra"] > [role="tab"]:nth-child(3)[aria-selected="true"]) .operator-review-card-list`
5. `main:has([aria-label="Nhóm nội dung cần kiểm tra"] > [role="tab"]:nth-child(1)[aria-selected="true"]) .empty, main:has([aria-label="Nhóm nội dung cần kiểm tra"] > [role="tab"]:nth-child(2)[aria-selected="true"]) .empty, main:has([aria-label="Nhóm nội dung cần kiểm tra"] > [role="tab"]:nth-child(3)[aria-selected="true"]) .empty`

</details>

### Cài đặt `/settings`

| # | Điều kiện | Vùng được trỏ | Tiêu đề | Nội dung |
|---|---|---|---|---|
| 1 | luôn có khi vùng này hiện | Mục cài đặt test-date | Ngày hệ thống thử | Ngày giả lập cho **lịch học** và điểm danh của cả tổ chức. |
| 2 | luôn có khi vùng này hiện | Mục cài đặt monthly | Học theo tháng | **Giới hạn chat** Season mỗi ngày; áp dụng từ tháng kế tiếp. |
| 3 | luôn có khi vùng này hiện | Mục cài đặt theme | Giao diện theo mùa | Chọn giao diện **theo mùa, theo lễ** hoặc Tự động, rồi **Lưu** cho cả tổ chức. |
| 4 | luôn có khi vùng này hiện | Mục cài đặt music | Nhạc nền | Bật nhạc nền, chọn bài và âm lượng. **Nghe thử** trước khi **Lưu**. |
| 5 | luôn có khi vùng này hiện | Mục cài đặt policy | Nhắc học và báo cáo | Số **ngày vắng** thì cần nhắc học, và có bật báo cáo tháng không. |
| 6 | luôn có khi vùng này hiện | Mục cài đặt accounts | Người dùng | Đổi **vai trò**, khoá, đặt lại hoặc xoá tài khoản; thêm người dùng ở cuối thẻ. |

<details><summary>Bộ chọn kỹ thuật (cho dev)</summary>

1. `.settings-panel:has(> #setting-test-date), #setting-test-date > .card`
2. `.settings-panel:has(> #setting-monthly), #setting-monthly > .card`
3. `.settings-panel:has(> #setting-theme), #setting-theme > .card`
4. `.settings-panel:has(> #setting-music), #setting-music > .card`
5. `.settings-panel:has(> #setting-policy), #setting-policy > .card`
6. `.settings-panel:has(> #setting-accounts), #setting-accounts > .card`

</details>

