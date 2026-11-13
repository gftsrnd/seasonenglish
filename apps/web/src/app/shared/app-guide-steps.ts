export type GuideRole = "learner" | "operator" | "manager";
export type GuideStep = readonly [selector: string, title: string, text: string, prioritize?: true];

// Viết bước theo docs/guide-writing-rules.md:
// - Mỗi bước trỏ vào một thẻ hoặc khu vực (thẻ, bảng, danh sách, khối form), không trỏ vào từng nút.
// - Nội dung là 1–2 câu liền mạch, khoảng 30 tiếng; tên nút, trường và điều kiện quan trọng viết đậm bằng **...**.
// - Engine tự sắp bước theo thứ tự trên màn và bỏ thẻ đang bị ẩn.

const learnerSteps: Record<string, readonly GuideStep[]> = {
  "/home": [
    // Trang chủ trước khi có trình độ: một bước cho mỗi thẻ theo thứ tự trên màn (đầu khối, thẻ 1, 2, 3), rồi thẻ hỗ trợ.
    // Mỗi thẻ trỏ đúng thẻ của nó qua data-onboarding-step, theo trạng thái đã xong / đang làm / sắp tới.
    // Đầu khối trỏ vào tiêu đề, không trỏ cả khối: cả khối bắt đầu từ thẻ 1 nên bước kế tiếp sẽ như quay lại thẻ 1.
    [".onboarding-steps > h2", "Ba bước bắt đầu", "Làm lần lượt **Hồ sơ cá nhân**, **Test đầu vào**, rồi chờ **Vận hành duyệt mức**. Nhãn mỗi bước cho biết bước nào **đã xong** và bạn **đang ở** đâu."],
    ['.onboarding-steps [data-onboarding-step="1"].done', "Hồ sơ đã lưu", "Hồ sơ đã xong. Bấm **Xem / sửa hồ sơ** nếu cần đổi công việc, mục tiêu hay cách học."],
    ['.onboarding-steps [data-onboarding-step="1"].cur', "Điền hồ sơ", "Bấm **Điền hồ sơ**, khoảng **2 phút**, để bài học sát công việc của bạn. Đã lưu nháp thì bấm **Tiếp tục phần đã lưu**."],
    ['.onboarding-steps [data-onboarding-step="2"].todo', "Test đầu vào", "Lưu hồ sơ xong, bước này mở nút **Bắt đầu test**: **4 phần** Nghe, Đọc, Viết, Nói, tối đa **75 phút**. Không cần ôn trước."],
    ['.onboarding-steps [data-onboarding-step="2"].cur', "Làm test đầu vào", "Bài có **4 phần** Nghe, Đọc, Viết, Nói, tối đa **75 phút**. Chuẩn bị **tai nghe** và **micro**, rồi bấm **Bắt đầu test**; không cần ôn trước."],
    ['.onboarding-steps [data-onboarding-step="2"].done', "Đã nộp test", "Bài test đầu vào đã nộp, bạn không cần làm lại. Điểm bài test là căn cứ để **Vận hành** xếp mức cho bạn."],
    ['.onboarding-steps [data-onboarding-step="3"].todo', "Vận hành duyệt mức", "Nộp test xong, **Vận hành** xem điểm để xếp mức. Bạn không cần làm gì thêm; bài học **tự mở** khi có mức."],
    ['.onboarding-steps [data-onboarding-step="3"].cur', "Chờ duyệt mức", "Bài test đã gửi, **Vận hành** đang xem điểm để xếp mức. Bạn không cần làm gì thêm; bài học **tự mở** khi có mức."],
    ['[data-home-block="primary"]:has(a[href^="/lesson/"])', "Bài học hôm nay", "Bấm bài được đề xuất để học hoặc học tiếp. **Bài học bù** hay **bài ôn** cần làm trước cũng hiện ở đây."],
    ['[data-home-block="primary"]:has(a[href^="/support"]):not(:has(a[href^="/lesson/"]))', "Bài học đang khóa", "Bạn đã bỏ lỡ bài thi tháng trước. Bấm **Gửi đơn xin mở** và nêu lý do để Quản lý xem xét."],
    ['.home-page[data-monthly-preparation="true"] [data-home-block="primary"]:not(:has(a[href^="/lesson/"], a[href^="/support"]))', "Lộ trình đang chuẩn bị", "Vận hành đang chuẩn bị và duyệt bộ bài tháng cho trình độ của bạn. Trong lúc chờ, bạn vẫn luyện được với Season."],
    ['[data-home-block="month-path"]', "Lịch học tháng", "Mỗi ô là **bài học**, **ôn tập**, ngày nghỉ hoặc **bài thi tháng**, kèm trạng thái. Bấm bài đã mở để học hoặc ôn lại."],
    ['.home-page[data-monthly-preparation="true"] [data-home-block="activities"]', "Luyện trong lúc chờ", "Mở **Season AI Coach** để luyện hội thoại theo trình độ đã duyệt, hoặc **Bài tháng** để xem trạng thái bộ bài."],
    ['.home-page:not([data-monthly-preparation="true"]) [data-home-block="activities"]', "Season và bài tháng", "Mở **Season AI Coach** để luyện hội thoại; số lượt hôm nay hiện trên thẻ. **Bài tháng** cho biết ngày thi và điều kiện dự thi."],
    // One step per card (testers found per-metric steps too detailed).
    ['[data-home-block="metrics"]', "Tiến độ học tập", "Vòng tròn cho biết **bài đã học**, **bài ôn**, **ngày đi học** và **điểm huy hiệu**; dòng **Vắng** là số ngày vắng so với mức cho phép."],
    ['.home-readiness', "Đường lên mức", "Mỗi dòng là một **điều kiện để thi lên mức**. Đủ tất cả các dòng thì bạn được **thi lên mức** tiếp theo."],
    [".learner-summary-card--profile", "Hồ sơ và đầu vào", "Bấm **Hồ sơ học tập & đầu vào** để xem thông tin cá nhân, kết quả đầu vào và trình độ đã duyệt."],
  ],
  "/monthly": [
    [".monthly-assessment-header", "Lịch thi tháng", "Xem **ngày thi** và nhãn trạng thái đề, từ **chưa phát hành**, **đã phát hành** đến **đã hoàn thành** hoặc **đã hết giờ vào thi**."],
    [".monthly-assessment-form-state:has(a.btn)", "Vào bài thi", "Đề đã mở: bấm **Vào bài thi** hoặc **Tiếp tục bài thi**. Chuẩn bị **tai nghe** và **micro** trước khi bắt đầu."],
    [".monthly-assessment-form-state:not(:has(a.btn))", "Trạng thái đề", "Cho biết bước tiếp theo, ví dụ chờ **đề phát hành**, chờ **giờ mở đề** hoặc **gửi khiếu nại**. Nút vào bài hiện ở đây khi đề mở."],
    [".monthly-eligibility-metrics", "Điều kiện dự thi", "**Điểm danh** quyết định quyền vào thi, vắng quá giới hạn thì cần khiếu nại. **Lịch học** và **lượt Season hợp lệ** chỉ để theo dõi tiến độ."],
    [".monthly-complaint-form", "Khiếu nại điều kiện", "Vắng quá giới hạn thì gửi khiếu nại kèm lý do. Quản lý phản hồi trong **24 giờ**; quá hạn đơn được **tự duyệt**.", true],
  ],
  "/coach": [
    [".coach-header", "Phong cách trò chuyện", "Chọn **Informal** để luyện nói thân mật hoặc **Formal** cho tình huống công việc. **Xoá chat** bắt đầu một hội thoại mới."],
    [".coach-limit-row", "Lượt luyện và phản hồi", "**Hôm nay** và **Tháng** đếm lượt hợp lệ. Bật **Nhận xét** hoặc **Giải thích** để tự mở điểm và gợi ý sau mỗi lượt."],
    [".coach-page .chat", "Cuộc trò chuyện", "Season trả lời và chấm từng lượt về ý nghĩa, từ vựng, ngữ pháp. Bấm **Nghe** để nghe câu tiếng Anh của Season."],
    [".chat-compose:has(textarea:enabled)", "Trả lời Season", "Gõ câu tiếng Anh rồi bấm **Gửi**. Bấm **micro** để nói trực tiếp, hoặc **tải tệp** ghi âm có sẵn."],
    [".coach-vocabulary", "Từ bí mật", "Các ô từ của tháng mở dần khi bạn luyện. Bấm từ **đã mở** để nghe phát âm."],
  ],
  "/games": [
    [".game-vocabulary-tools:not([open]) > summary", "Bộ từ đang chơi", "Mở để xem các từ đang dùng, tạo bộ từ theo chủ đề mới hoặc lấy **từ đã học trong tháng**."],
    [".games-topic-card:has(.topic-create input:enabled)", "Tạo bộ từ", "Nhập **1–3 từ tiếng Anh**, ví dụ coffee shop, rồi bấm **Tạo bộ từ**. Hoặc lấy **từ đã học trong tháng** làm bộ từ."],
    [".games-topic-card:not(:has(.topic-create input:enabled)):has([data-game-source-learned])", "Chọn bộ từ", "Bấm **Dùng từ đã học trong tháng** để chơi với từ đã học. Đang dùng bộ này thì bấm **Cập nhật bộ từ đã học** để thêm từ mới."],
    ['.games-topic-card:has(a[href="/home"])', "Chưa có bộ từ", "Khi bài tháng mở, học phần từ vựng rồi quay lại chọn **Dùng từ đã học trong tháng**. Có bộ từ thì trò chơi mới mở."],
    [".games-word-set-card:has(.word-chip)", "Ôn từ trước khi chơi", "Các từ trong bộ đang chơi, **nghĩa tiếng Việt** nằm cạnh mỗi từ. Bấm một từ để **nghe phát âm**."],
    ['[aria-labelledby="games-picker-title"]:has(a.game-tile)', "Chọn trò chơi", "Bấm một trò **đang sẵn sàng** để chơi với bộ từ hiện tại. Trò chưa sẵn sàng ghi rõ điều kiện còn thiếu."],
  ],
  "/games/*": [
    ["#gm-board:has(.game-tutorial-actions)", "Cách chơi", "Đọc mục tiêu, các bước và cách tính điểm, rồi bấm **Bắt đầu chơi**."],
    ["#gm-board:has(.game-result.is-error)", "Chưa lưu kết quả", "Kết quả lượt này chưa được lưu. Kiểm tra kết nối rồi bấm **Thử gửi lại** để giữ lượt chơi."],
    ["#gm-board:has(.game-result.is-complete)", "Kết quả lượt chơi", "Xem điểm của lượt vừa chơi. Bấm **Chơi lại** để bắt đầu lượt mới với cùng bộ từ."],
  ],
  // Một bước cho mỗi thẻ bài học, theo thứ tự trên màn. Hướng dẫn chỉ đi qua tab đang mở (Học hoặc Luyện tập):
  // thẻ của tab kia không có trong trang nên bước của nó tự bị bỏ; engine không tự đổi tab.
  // Kiểm tra trên bài thật dựng từ dữ liệu mẫu: apps/web/src/app/learner/Learning.guide.test.tsx.
  "/lesson/*": [
    [".app-learner-page > div.card:has(.eyebrow)", "Bài chưa mở", "Bài chưa đến ngày hoặc cần xong **bài trước**; dòng chữ ghi lý do và ngày mở. Bấm nút chính để làm bài đang chặn hoặc **Luyện với Season**."],
    [".lesson-heading", "Đầu bài học", "Tên bài, **chủ đề tuần** và **trạng thái** học. Bài có hai bước: **Học** trước, **Luyện tập** mở khi bạn học xong."],
    [".lesson-part--objective", "Mục tiêu bài", "Những việc bạn **làm được** sau bài này. Đọc trước để biết cần chú ý gì khi học và làm bài tập."],
    [".lesson-part--instruction", "Hướng dẫn", "Các bước nên làm **theo thứ tự** cho tab đang mở; nội dung đổi theo tab **Học** hay **Luyện tập**."],
    [".lesson-part--vocabulary:not(:has(.vocabulary-card-phrases .lesson-example-wrap--phrase))", "Từ vựng", "Mỗi thẻ từ có **phiên âm**, **nghĩa** và ảnh minh hoạ. Bấm **loa** để nghe từ, bấm từng **cụm từ hay dùng** để nghe cả cụm."],
    [".lesson-part--vocabulary:has(.vocabulary-card-phrases .lesson-example-wrap--phrase)", "Từ vựng", "Mỗi thẻ từ có **phiên âm**, **nghĩa** và ảnh minh hoạ. Bấm **loa** hoặc **cụm từ hay dùng** để nghe; chạm **biểu tượng dịch** cạnh cụm từ để xem **nghĩa**."],
    [".lesson-vocabulary-group", "Nhóm từ bao trùm", "Các từ cùng nhóm nghĩa xếp dưới một **từ bao trùm** chung. Học cả nhóm để nhớ từ theo ngữ cảnh và phân biệt sắc thái."],
    [".lesson-part--vocabulary:not(:has(.vocabulary-card-relations .lesson-example-wrap--chip)) .vocabulary-card-relations", "Từ liên quan", "Chip **Từ bao trùm**, **Họ từ** mở nhóm từ; **=** là đồng nghĩa, **≠** là trái nghĩa, **Khẩu ngữ**, **Văn chương** là sắc thái. Bấm chip để nghe hoặc xem thêm."],
    [".lesson-part--vocabulary .vocabulary-card-relations:has(.lesson-example-wrap--chip)", "Từ liên quan", "Chip **Từ bao trùm**, **Họ từ** mở nhóm từ; **=** là đồng nghĩa, **≠** là trái nghĩa. Bấm chip để nghe, chạm **biểu tượng dịch** cuối chip để xem **nghĩa**."],
    [".lesson-part--grammar:not(:has(.lesson-example-wrap))", "Ngữ pháp", "**Công thức** của cấu trúc, cách dùng và câu ví dụ. Bấm từng **câu ví dụ** để nghe cách nói."],
    [".lesson-part--grammar:has(.lesson-example-wrap)", "Ngữ pháp", "**Công thức** của cấu trúc, cách dùng và câu ví dụ. Bấm **câu ví dụ** để nghe, chạm **biểu tượng dịch** để xem **nghĩa tiếng Việt**."],
    [".lesson-part--pronunciation", "Phát âm", "Âm mục tiêu kèm **khẩu hình** và các **từ mẫu**. Bấm loa nghe hết từng từ mẫu, vì phần **Nói** chỉ mở khi đã nghe đủ."],
    [".lesson-study-cta", "Xong phần Học", "Học hết các thẻ phía trên rồi bấm **Đã học xong → Làm bài tập** để mở **Luyện tập**. Thẻ ghi luôn **số phần bài tập** cần làm."],
    [".lesson-part--listening", "Nghe", "Bấm **loa** hoặc trình phát để nghe đoạn audio, nghe lại nếu cần, rồi chọn đáp án đúng."],
    // Vùng trả lời của bài tập đầu tiên; nút báo lỗi chỉ có sau khi học xong và khi câu chưa bị báo lỗi.
    [".lesson-parts:has(.lesson-answer > button[aria-expanded]) .lesson-answer", "Trả lời và nộp", "Chọn hoặc viết câu trả lời rồi bấm **Nộp bài**; sai thì **làm lại** kèm gợi ý. Câu sai đề thì bấm **Báo lỗi câu này** để Vận hành xem lại."],
    [".lesson-parts:not(:has(.lesson-answer > button[aria-expanded])) .lesson-answer", "Trả lời và nộp", "Chọn hoặc viết câu trả lời rồi bấm **Nộp bài**. Sai thì được **làm lại** kèm gợi ý; hết lượt thì **đáp án đúng** hiện ra."],
    ['[data-testid="lesson-exercise-translation"]', "Bản dịch câu hỏi", "Làm đúng hoặc hết lượt thì **bản dịch** câu hỏi và đáp án hiện ra để bạn kiểm tra lại nghĩa."],
    [".lesson-part--reading", "Đọc", "Đọc đoạn văn ngắn rồi trả lời câu hỏi bên dưới theo **nội dung bài đọc**."],
    [".lesson-part--writing", "Viết", "Điền hoặc viết câu theo yêu cầu, dùng **từ** và **cấu trúc** vừa học ở tab Học."],
    [".lesson-part--word_class", "Từ loại", "Chọn **dạng từ** đúng, như danh từ, động từ hay tính từ, cho chỗ trống trong câu."],
    [".lesson-part--word_use", "Dùng từ", "Chọn từ đi đúng với cụm cho sẵn, tức **cách dùng từ** tự nhiên trong câu tiếng Anh."],
    [".lesson-part--speaking:has(.lesson-speaking-gate)", "Mở phần Nói", "Phần Nói đang khóa: nghe lần lượt các **từ mẫu** ở thẻ **Phát âm** bên tab Học. Dòng **Đã nghe** cho biết còn thiếu từ nào."],
    [".lesson-part--speaking:not(:has(.lesson-speaking-gate))", "Nói", "Nghe **câu mẫu**, rồi ghi âm câu của bạn và đổi một chi tiết cho hợp với bạn. Ghi xong thì bấm **Kiểm tra nói**."],
    [".lesson-appeal-form", "Báo lỗi phần bài", "Ghi rõ câu hoặc nội dung bạn cho là sai, đính kèm ảnh nếu có, rồi gửi để **Vận hành** xem lại.", true],
    [".lesson-completion", "Hoàn thành bài", "Dòng chữ ghi **số phần đã xong**; đủ phần thì bấm **Hoàn thành bài** để lưu và mở bài tiếp. **Luyện với Season** mở trò chuyện luyện nói."],
    ['.app-learner-page > .row:has(> .lesson-back)', "Bài ôn thứ Sáu", "Bài ôn lại **từ** và **cấu trúc** đã học trong tuần. Làm lần lượt từng phần cho tới hết bài."],
    [".weekly-review-sections", "Các phần bài ôn", "Bài ôn cuối tuần đi lần lượt từng phần. Mỗi dòng ghi **số câu đúng** trên tổng số câu của phần đó."],
    ["section.card:has(button.card.flat[aria-pressed])", "Khởi động lật thẻ", "Bấm từng thẻ để lật xem nghĩa. Phần này **không chấm điểm**, bỏ qua hoặc bắt đầu phần 1 khi sẵn sàng."],
    ['.app-learner-page:has(> .weekly-review-sections, .weekly-review-sections) section.card.stack:has([role="group"], textarea, .weekly-review-read-aloud)', "Câu đang làm", "Chọn đáp án, viết hoặc ghi âm theo yêu cầu của câu. Câu sai sẽ được **hỏi lại**; bấm biểu tượng loa để nghe."],
    ['[data-testid="review-exercise-translation"]', "Bản dịch câu vừa làm", "Sau mỗi câu, **bản dịch** câu hỏi và đáp án hiện ở đây để bạn đối chiếu nghĩa trước khi sang câu tiếp."],
    ['section.card:is([aria-label="Đã xong bài ôn"], [aria-label="Review complete"])', "Đã xong bài ôn", "Kết quả bài ôn đã được lưu. **Bài đầu tuần sau** mở đúng ngày của nó; bấm nút trong thẻ để về Trang chủ."],
  ],
  "/onboard": [
    [".profile-edit-sections", "Các mục hồ sơ", "Chuyển giữa **Cá nhân**, **Tiếng Anh**, **Cách học** và **Trình độ** để điền từng phần."],
    ['.profile-form > section.card:not([id]):not([hidden])', "Thông tin và mục tiêu", "**Họ tên** và **Email** là bắt buộc. Thêm phòng ban, tên Base và các việc bạn dùng tiếng Anh để Season đưa ví dụ sát hơn."],
    ["#profile-edit-learning", "Phong cách học", "Chọn **cách học** hiệu quả, thời lượng và thiết bị thường dùng."],
    ["#profile-edit-level", "Trình độ tự đánh giá", "Chọn trình độ bạn tự thấy. Có thể thêm **chứng chỉ** và điều muốn Season giúp."],
    [".onboard-actions", "Lưu hồ sơ", "Bấm **Lưu nháp** để điền tiếp sau. Điền đủ các mục có **dấu sao** rồi bấm nút lưu chính; hồ sơ mới sẽ chuyển sang **test đầu vào**."],
  ],
  "/profile": [
    [".profile-identity-card", "Hồ sơ cá nhân", "Bấm **Đổi avatar** để chọn biểu tượng và màu. **Xem hồ sơ** mở thông tin đã lưu, kèm nút **Cập nhật hồ sơ**."],
    [".app-learner-page:not(.profile-page) :has(> a[href=\"/onboard\"])", "Hồ sơ chưa đủ", "Bấm **Điền hồ sơ** để E4S chọn nội dung hợp với công việc và cách học của bạn."],
    [".learner-support-entry", "Hỗ trợ học tập", "Gửi **khiếu nại**, **kháng nghị**, trả lời **khảo sát tháng** và xem phản hồi đã nhận."],
    ['[aria-label="Mùa học"]', "Mùa học và huy hiệu", "Đủ **điểm** và **huy hiệu** của cấp thì lên mùa tiếp theo. **Xem tất cả huy hiệu** cho biết điều kiện; **Xem trước chứng nhận** mở mẫu chứng nhận."],
    [".profile-assessment-section", "Kết quả đánh giá", "Điểm **đầu vào** và các bài đánh giá theo từng kỹ năng nghe, đọc, viết, nói."],
  ],
  "/support": [
    // Thẻ Tất cả chỉ có bảng lịch sử: thêm hàng mục để người học biết gửi khiếu nại, kháng nghị ở đâu.
    // Trước khi trình độ được duyệt, mục Kháng nghị và Khảo sát tháng bị ẩn, khiếu nại chỉ có loại Tài khoản.
    ['.learner-support-page:has(.request-tabs a[aria-current="page"]:not([href*="type="])):has(.request-tabs a[href*="type=appeals"]) .request-tabs', "Các mục hỗ trợ", "Mở **Khiếu nại** để báo lỗi điểm danh, bài học hay tài khoản, **Kháng nghị** để xin chấm lại bài thi, **Khảo sát tháng** để góp ý."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"]:not([href*="type="])):not(:has(.request-tabs a[href*="type=appeals"])) .request-tabs', "Các mục hỗ trợ", "Mở **Khiếu nại** để báo vấn đề về **tài khoản**. Các mục học tập khác mở khi bạn bắt đầu học."],
    ['[aria-labelledby="learner-complaint-title"]', "Khiếu nại mới", "Chọn **loại khiếu nại**, ghi ngày hoặc màn hình xảy ra, nêu **lý do** và đính kèm ảnh nếu có, rồi bấm **Gửi cho Quản lý**.", true],
    [".learner-support-action:has(.assessment-appeal-status)", "Bài có thể kháng nghị", "Bấm **Gửi kháng nghị** ở bài còn hạn, nêu lý do từ **10 ký tự**, chọn trình độ đề xuất nếu được hỏi, rồi gửi cho Vận hành."],
    [".card:has(> .monthly-survey-form), .monthly-survey-form", "Khảo sát tháng", "Trả lời các câu có **dấu sao** rồi bấm **Gửi phản hồi**. Có nhiều tháng đang mở thì chọn tháng ở đầu thẻ."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=complaints"]):has(.request-tabs a[href*="type=appeals"]) .request-card', "Khiếu nại đã gửi", "Mỗi hàng có **trạng thái** và ngày gửi; bấm **Chi tiết** để đọc phản hồi. **Gửi khiếu nại** báo vấn đề về điểm danh, bài học hoặc tài khoản."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=complaints"]):not(:has(.request-tabs a[href*="type=appeals"])) .request-card', "Khiếu nại đã gửi", "Mỗi hàng có **trạng thái** và ngày gửi; bấm **Chi tiết** để đọc phản hồi. **Gửi khiếu nại** báo vấn đề về tài khoản."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=appeals"]) .request-card', "Kháng nghị đã gửi", "Mỗi hàng có **trạng thái** và ngày gửi. Bấm **Chi tiết** để đọc phản hồi của Vận hành."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=feedback"]) .request-card', "Khảo sát đã gửi", "Các khảo sát bạn đã trả lời. Bấm **Chi tiết** để xem lại câu trả lời của tháng đó."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"]:not([href*="type="])):has(.request-tabs a[href*="type=appeals"]) .request-card', "Lịch sử hỗ trợ", "Khiếu nại, kháng nghị và khảo sát đã gửi, kèm **trạng thái**. Bấm **Chi tiết** để đọc nội dung và phản hồi."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"]:not([href*="type="])):not(:has(.request-tabs a[href*="type=appeals"])) .request-card', "Lịch sử hỗ trợ", "Khiếu nại đã gửi, kèm **trạng thái**. Bấm **Chi tiết** để đọc nội dung và phản hồi."],
  ],
};

const operatorSteps: Record<string, readonly GuideStep[]> = {
  "/op": [
    ['[data-guide="op-pending"]', "Hồ sơ chờ duyệt", "Mở từng hồ sơ để xem điểm 4 kỹ năng và thông tin người học, chọn **Mức duyệt** rồi xác nhận để xếp trình độ."],
    ['[data-guide="op-signals"]', "Tín hiệu đổi mức", "Người học đủ điều kiện **thi lên mức** theo kết quả các tháng, hoặc sai nhiều **hai tuần liền** nên cần xem xét hạ mức. Bấm **Hạ mức** để chuyển xuống."],
    [".operator-approved-panel", "Học viên đã duyệt", "Mức hiện tại và điểm đầu vào của từng người. Bấm **Đổi level** để chuyển mức, **Mục tiêu** để đặt mục tiêu tháng, **Hồ sơ** để xem chi tiết."],
    ['[data-guide="op-in-progress"]', "Đang làm test", "Người học đã bắt đầu bài đầu vào nhưng chưa nộp. Bấm **Hồ sơ** để xem thông tin đã điền."],
    ['[data-guide="op-unassessed"]', "Chưa làm test", "Người học chưa bắt đầu bài đầu vào. Bấm **Hồ sơ** để xem thông tin trước khi nhắc họ làm bài."],
  ],
  "/op/months": [
    [".monthly-month-card", "Chu kỳ tháng", "Chọn tháng cần soạn. Tháng đã qua ghi **Chỉ xem** và không sửa được."],
    [".monthly-topic-card", "Chủ đề tháng", "Chủ đề chung cho mọi mức. Bấm **Gợi ý AI** để có bản nháp, **Chốt chủ đề** khi đã đúng; hàng dưới cùng để **chọn mức**."],
    [".monthly-resources", "Tài nguyên tháng", "Tạo rồi **duyệt** bộ từ vựng, ngữ pháp, phát âm cho mức đang chọn. Bấm từng ô để xem; **Phân bổ** cho biết ngày nào học gì."],
    [".monthly-publication", "Công bố tháng", "Cho biết số bài **còn cần duyệt**. Đủ điều kiện thì bấm **Công bố tháng** để học viên thấy bài theo lịch."],
    ["#monthly-teaching-calendar", "Lịch soạn bài", "Mỗi ô là ngày học, ngày ôn hoặc bài thi. Bấm **AI** để sinh bài nháp, **bút chì** để soạn tay, **Xem** để mở bài đã có."],
  ],
  "/op/review": [
    [".operator-review-panel", "Phản hồi Season", "Mỗi hàng là một người học. Mở hàng để đọc lượt chat và điểm Season chấm, rồi đánh dấu **đã kiểm** cho lượt đã xem."],
    [".card:has(> .operator-status-legend)", "Cảnh báo bài tập", "Mỗi hàng là một người học có cảnh báo. Mở để xem kỹ năng đã làm đúng hoặc đã **hết lượt**."],
    ['main:has(.request-tabs a[aria-current="page"][href*="tab=attempts"]) .empty', "Cảnh báo bài tập", "Học viên làm sai hết lượt ở một kỹ năng sẽ hiện ở đây. Mỗi kỹ năng có tối đa **2 lượt**; hiện chưa có ai cần chú ý."],
    ['main:has(.request-tabs a[aria-current="page"][href*="tab=attempts"]) .operator-review-card-list', "Câu sai cả hai lượt", "Mỗi thẻ là một câu học viên trả lời sai **cả hai lượt**. Bấm **Mở câu hỏi** để xem đề, **Hiệu chỉnh câu** nếu đề sai, **Không lỗi** nếu đề đúng."],
    [".operator-requests .request-card:has(.request-filters)", "Kháng nghị học viên", "Lọc theo **trạng thái** ở đầu thẻ. Bấm **Xử lý** để đọc lý do, minh chứng và trả lời kháng nghị."],
    [".operator-request-expanded", "Xử lý kháng nghị", "Đọc lý do và minh chứng, rồi **chấp nhận** để sửa kết quả hoặc **giữ nguyên** kèm lý do cho người học.", true],
    ['main:has(.request-tabs a[aria-current="page"][href*="tab=sent"]) .operator-requests .request-card', "Yêu cầu đã gửi", "Yêu cầu bạn gửi Quản lý để **mở lại** bài, đề, tài nguyên hoặc **xoá học viên**. Xem **trạng thái** và phản hồi của Quản lý ngay dưới nội dung."],
  ],
};

operatorSteps["/op/tests"] = [
  [".operator-assessment-form-list", "Phiên bản đề đã lưu", "Các phiên bản đề của tab đang chọn kèm **trạng thái**, số kỹ năng và tổng điểm. Bấm **Xem** để mở trước đề như học viên thấy."],
  [".card:has(.operator-results-table)", "Kết quả bài thi", "Các lượt làm bài **đầu vào**, **lên mức**, **thi tháng** và **đề đầu ra** kèm tổng điểm. Bấm **Xem** để mở bài làm và chấm."],
  ["main .empty", "Kết quả bài thi", "Bài thi học viên đã nộp sẽ hiện ở đây kèm tổng điểm. Bấm **Xem** ở mỗi hàng để mở bài làm và chấm."],
];
operatorSteps["/op/levelforms"] = [
  [".operator-level-forms-embedded", "Đề lên mức", "Mỗi **mức đích** có một đề lên mức. Bấm **Soạn tay** hoặc **Sinh đề bằng AI** để tạo bản nháp; chỉ bản nháp hoàn chỉnh mới phát hành được."],
  ...operatorSteps["/op/tests"]!.slice(1),
];

const managerSteps: Record<string, readonly GuideStep[]> = {
  "/mgr": [
    [".manager-kpi-grid", "Ba chỉ số chính", "Tỷ lệ **duy trì nhịp học**, **hoàn thành lộ trình** và mức **hài lòng** của nhóm, so với ngưỡng mục tiêu."],
    [".manager-progress-card", "Danh sách đang học", "Người học đã có mức, xếp theo **rủi ro bỏ học**. Bấm **Hồ sơ** ở mỗi hàng để xem chi tiết người học."],
    [".manager-progress-card-actions", "Thao tác nhanh", "**Cần nhắc** mở trang Nhắc học, **Xuất CSV** tải tiến độ tháng, **Giả lập phần thưởng** xem trước điểm và huy hiệu người học nhận."],
    [".manager-progress-submitted", "Chờ duyệt mức", "Người học đã nộp **test đầu vào**, đang chờ **Vận hành duyệt mức**. Bấm **Hồ sơ** để xem điểm và thông tin người học."],
    [".manager-progress-testing", "Đang làm test", "Người học đã mở **test đầu vào** nhưng chưa nộp nên chưa có điểm. Bấm **Hồ sơ** để xem chi tiết."],
    [".manager-progress-not-tested", "Chưa làm test", "Người học đã có tài khoản nhưng **chưa làm test đầu vào**. Bấm **Hồ sơ** để xem hồ sơ và hoạt động gần nhất."],
  ],
  "/mgr/ops": [
    [".manager-operators-section", "Hiệu suất vận hành", "Mỗi hàng là một người vận hành. Mở hàng để xem số bài **đã soạn**, **đã duyệt** và chi tiết chất lượng."],
  ],
  "/mgr/holidays": [
    [".manager-holiday-form", "Thêm ngày nghỉ", "Chọn ngày nghỉ riêng của tổ chức rồi bấm **Thêm ngày nghỉ**. Ngày lễ Việt Nam đã có sẵn."],
    [".manager-holiday-calendar", "Lịch nghỉ lễ", "Ngày lễ Việt Nam và ngày nghỉ của tổ chức. Lọc loại ngày ở góc thẻ; ngày của tổ chức xóa được bằng **Xóa**."],
  ],
  "/mgr/reminders": [
    [".manager-reminder-toolbar", "Người cần nhắc", "Số người học vắng lâu cần được nhắc hôm nay. Từng người hiện ở các thẻ bên dưới."],
    [".manager-reminder-queue", "Danh sách cần nhắc", "Mỗi thẻ là một người học vắng lâu, kèm tin nhắn soạn sẵn. Danh sách dài thì **cuộn trong khung**."],
    [".manager-reminder-card", "Lời nhắc", "**Copy tin nhắn**, **Gửi email** hoặc **Gửi Base.vn** sau khi **Cấu hình Base.vn**. Đã nhắc ngoài app thì bấm **Đã nhắc qua kênh khác**."],
    [".manager-reminder-history", "Lịch sử nhắc", "Mỗi lần nhắc ghi ngày, người học, nơi nhận, kênh và **kết quả**. Bảng dài thì **cuộn trong khung**."],
  ],
  "/mgr/report": [
    [".report > .rhead", "Báo cáo tháng", "Chọn **Tháng** và **Mức** để lọc cả báo cáo. Bấm **In / Lưu PDF**, **Copy bản chữ** hoặc tải **.txt** để gửi đi."],
    ['[aria-label="Ba chỉ số của tháng"]', "Ba chỉ số", "Kết quả từng chỉ số so với **ngưỡng** và đánh giá đạt hay chưa."],
    [".manager-report-learner-table-wrap, .manager-monthly-learner-list", "Từng học viên", "Điểm danh, bài học, lượt Season, **bài thi tháng** và số khiếu nại của từng người."],
    [".manager-report-next-actions", "Việc cần làm tiếp", "Gợi ý **việc nên làm** từ số liệu tháng, kèm **tên người học** liên quan."],
  ],
  "/mgr/surveys": [
    [".monthly-survey-month-filter", "Tháng khảo sát", "Chọn tháng rồi bấm **Xem tháng** để mở biểu mẫu và kết quả của tháng đó."],
    ['[aria-labelledby="manager-monthly-survey-editor"]', "Biểu mẫu khảo sát", "Bấm **Tạo bản nháp** để soạn câu hỏi. **Lưu** bản nháp, **xem trước** như người học thấy rồi mới **công bố**."],
    ['[aria-labelledby="manager-monthly-survey-results"]', "Kết quả khảo sát", "**Số phản hồi** và câu trả lời của người học trong **tháng đang xem**."],
  ],
  "/mgr/ops/months": [
    [".monthly-topic-card", "Chủ đề tháng", "Chủ đề chung do Vận hành soạn; Quản lý chỉ xem. Hàng dưới cùng để **chọn mức** cần kiểm tra."],
    [".monthly-resources", "Tài nguyên tháng", "Từ vựng, ngữ pháp, phát âm và ảnh minh họa của mức đang chọn. Bấm từng ô để xem chi tiết."],
    ["#monthly-teaching-calendar", "Lịch học", "Mỗi ô là ngày học, ngày ôn hoặc bài thi. Bấm **Xem** để mở bài đã soạn."],
  ],
  "/mgr/requests": [
    [".manager-requests-card", "Danh sách yêu cầu", "Mục **chờ xử lý** nằm đầu danh sách. Bấm **Duyệt** hoặc **Từ chối** kèm lý do; **Lưu trữ** ẩn mục đã xử lý."],
  ],
  "/mgr/rewards": [
    [".manager-reward-controls", "Tình huống giả lập", "Chọn một **tình huống mẫu**, hoặc mở **Tùy chỉnh điểm và huy hiệu** để nhập điểm và bật từng huy hiệu."],
    [".manager-reward-result-pane", "Học viên sẽ thấy", "Thẻ Mùa học với điểm và huy hiệu đang chọn. Bấm **Xem lên cấp** để xem màn chúc mừng người học nhận."],
  ],
};
managerSteps["/mgr/reopen-requests"] = managerSteps["/mgr/requests"]!;
managerSteps["/mgr/complaints"] = managerSteps["/mgr/requests"]!;
managerSteps["/mgr/ops/tests"] = [
  [".operator-assessment-form-list", "Phiên bản đề đã lưu", "Các phiên bản đề của tab đang chọn kèm **trạng thái** và tổng điểm. Bấm **Xem** để mở trước đề; Quản lý **chỉ xem**."],
  [".card:has(.operator-results-table)", "Kết quả bài thi", "Các lượt làm bài đầu vào, lên mức, thi tháng và đề đầu ra kèm tổng điểm. Bấm **Xem** để mở bài làm; Quản lý **chỉ xem**."],
  ["main .empty", "Kết quả bài thi", "Bài thi học viên đã nộp sẽ hiện ở đây kèm tổng điểm để theo dõi."],
];
managerSteps["/mgr/ops/levels"] = [
  ['[data-guide="op-pending"]', "Hồ sơ chờ duyệt", "Mở hồ sơ để xem **điểm từng kỹ năng** và thông tin xét trình độ. **Vận hành** là người chọn mức."],
  ['[data-guide="op-signals"]', "Tín hiệu đổi mức", "Người học đủ tín hiệu để **thi lên mức** hoặc cần **xem xét hạ mức** trong 14 ngày gần nhất."],
  [".operator-approved-panel", "Học viên đã duyệt", "Mức hiện tại và điểm đầu vào của từng người; Quản lý **chỉ xem**."],
];
managerSteps["/mgr/ops/review"] = [
  [".operator-review-panel", "Phản hồi Season", "Mỗi hàng là một người học. Mở hàng để đọc lượt chat và điểm Season đã chấm."],
  [".card:has(> .operator-status-legend)", "Cảnh báo bài tập", "Mở từng người học để xem kỹ năng đã làm đúng hoặc đã **hết lượt**."],
  ['main:has(.request-tabs a[aria-current="page"][href*="tab=attempts"]) .empty', "Cảnh báo bài tập", "Học viên làm sai hết lượt ở một kỹ năng sẽ hiện ở đây. Hiện chưa có ai cần chú ý."],
  ['main:has(.request-tabs a[aria-current="page"][href*="tab=attempts"]) .operator-review-card-list', "Câu sai cả hai lượt", "Mỗi thẻ là một câu học viên trả lời sai **cả hai lượt**, kèm hai câu trả lời. Quản lý **chỉ xem**; Vận hành hiệu chỉnh câu."],
  [".operator-review-card-list", "Kháng nghị", "Mở từng người học để đọc lý do, minh chứng và **trạng thái**. Quản lý **chỉ xem**; Vận hành xử lý kháng nghị."],
];

const guideSteps = { learner: learnerSteps, operator: operatorSteps, manager: managerSteps };

// Mỗi mục cài đặt là một bước: trên màn hẹp trỏ cả khối mục (kể cả khi đang thu gọn), trên desktop trỏ thẻ của mục.
// (.settings-panel và .settings-panel-content dùng display: contents trên desktop nên không có khung để làm nổi bật.)
function settingsStep(panel: string, title: string, text: string): GuideStep {
  return [`.settings-panel:has(> #setting-${panel}), #setting-${panel} > .card`, title, text];
}

const themeGuide = settingsStep("theme", "Giao diện theo mùa", "Chọn giao diện **theo mùa**, **theo lễ** hoặc **Tự động** đổi theo ngày, rồi bấm **Lưu** để áp dụng cho cả tổ chức.");
const musicGuide = settingsStep("music", "Nhạc nền", "Bật nhạc nền, chọn bản nhạc hoặc dán liên kết, chỉnh âm lượng. Bấm **Nghe thử** trước khi **Lưu nhạc nền**.");
const learningGuide = settingsStep("monthly", "Học theo tháng", "Thời lượng học khuyến nghị mỗi ngày và **giới hạn lượt chat** với Season. Bấm **Lưu** để áp dụng.");

const managerSettings: readonly GuideStep[] = [
  settingsStep("test-date", "Ngày hệ thống thử", "Ngày giả lập điều khiển **lịch học**, quyền vào bài, điểm danh và thông báo của **cả tổ chức**."),
  learningGuide,
  themeGuide,
  musicGuide,
  settingsStep("policy", "Nhắc học và báo cáo", "Số **ngày không hoạt động** thì cần nhắc học, và có gửi **báo cáo tháng** hay không."),
  settingsStep("accounts", "Người dùng", "Vai trò và trạng thái từng tài khoản. Mỗi hàng có **Khoá**, **Đặt lại** mật khẩu hoặc PIN và **Xoá**; cuối thẻ để thêm người dùng."),
];
const operatorSettings: readonly GuideStep[] = [
  themeGuide,
  musicGuide,
  learningGuide,
  settingsStep("exam-requests", "Yêu cầu đổi đề", "Nhập **email đội phát triển** và mô tả phần cần đổi, rồi gửi yêu cầu cho **đề đầu vào** hoặc **đề đầu ra**."),
  settingsStep("accounts", "Người dùng", "Vai trò, mức học và trạng thái đăng nhập của từng người. Vận hành **chỉ xem**."),
];

const monthlyLessonOperatorSteps: readonly GuideStep[] = [
  [".operator-page-title-actions", "Thao tác bài", "Bấm **Sửa tay** để chỉnh, **Duyệt bài** khi nội dung đã đúng. Bài đã duyệt bị khóa; cần sửa thì **Yêu cầu mở lại**."],
  [".operator-monthly-lesson", "Nội dung bài", "Toàn bộ phần học và bài tập của ngày. Đọc lại từng phần trước khi duyệt."],
];

// Trình soạn tay: ≤ 900 px mỗi mục là <details data-section>, desktop là fieldset; chọn dạng đang hiện.
const lessonEditorSteps: readonly GuideStep[] = [
  ['.operator-editor-collapsible[data-section="general"], .operator-editor-section:has(input[aria-label="Tiêu đề bài"])', "Thông tin chung", "Đặt **tiêu đề** ngắn bằng tiếng Anh và mục tiêu bài để học viên biết sẽ làm được gì."],
  ['.operator-editor-collapsible[data-section="vocabulary"], .operator-editor-section:has(.operator-vocabulary-base)', "Từ vựng của ngày", "Từ lấy theo **kế hoạch** của ngày này; bài ôn dùng lại từ đã học trong tuần. Kiểm tra nghĩa, ví dụ và audio."],
  ['.operator-editor-collapsible[data-section="listening"], .operator-editor-section:has(textarea[aria-label="Nội dung nghe"])', "Các phần bài tập", "Từ **Nghe** trở xuống là bài tập: nhập nội dung, câu hỏi và đáp án; audio tải lên phải khớp lời nghe."],
  [".operator-editor-actions", "Kiểm tra và lưu", "Bấm **Kiểm tra & lưu** để lưu bản nháp. Mục còn thiếu sẽ tự mở và gắn nhãn **Cần bổ sung**."],
];

export function guideDefinitions(role: GuideRole, path: string) {
  if (path === "/settings" && role !== "learner") return role === "manager" ? managerSettings : operatorSettings;
  if (role === "operator" && path.startsWith("/op/months/lesson/")) return monthlyLessonOperatorSteps;
  const routes = guideSteps[role];
  return routes[path] ?? routes[`/${path.split("/")[1]}/*`];
}

export function guidePopupDefinitions(role: GuideRole, path: string, popup: HTMLElement): readonly GuideStep[] | undefined {
  // Chỉ popup có quy trình nhiều bước mới có hướng dẫn. Hộp thoại nhỏ, tự giải thích (mở lại bài, avatar,
  // phân bổ theo ngày, sửa tay tài nguyên tháng) không có hướng dẫn nên nút "?" không hiện trong đó.
  if (role === "operator" && (path === "/op/months" || path.startsWith("/op/months/lesson/")) && popup.matches(".operator-lesson-editor")) return lessonEditorSteps;
  return undefined;
}

/** Mọi bước đã khai báo, dùng cho kiểm tra quy tắc độ dài. */
export const allGuideSteps: readonly (readonly [route: string, steps: readonly GuideStep[]])[] = [
  ...Object.entries(guideSteps).flatMap(([role, routes]) => Object.entries(routes).map(([route, steps]) => [`${role} ${route}`, steps] as const)),
  ["manager /settings", managerSettings],
  ["operator /settings", operatorSettings],
  ["operator /op/months/lesson/*", monthlyLessonOperatorSteps],
  ["operator popup lesson editor", lessonEditorSteps],
];
