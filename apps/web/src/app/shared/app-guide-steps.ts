export type GuideRole = "learner" | "operator" | "manager";
export type GuideStep = readonly [selector: string, title: string, text: string, prioritize?: true];

const learnerSteps: Record<string, readonly GuideStep[]> = {
  "/home": [
    ['.onboarding-steps .cur a[href="/onboard"]', "Hoàn thiện hồ sơ", "Điền công việc và cách bạn muốn học để E4S chọn ví dụ sát với bạn. Có thể mở lại bản đã lưu."],
    ['.onboarding-steps .cur a[href="/test/placement"]', "Làm bài đầu vào", "Bấm để xem yêu cầu và làm bài đầu vào. Người vận hành duyệt kết quả để xếp trình độ học."],
    ['[data-home-block="primary"] a[href^="/support"]', "Xin mở lại bài học", "Bấm Gửi đơn xin mở, nêu lý do bạn bỏ lỡ bài thi tháng trước để Quản lý xem xét."],
    ['[data-home-block="primary"] a[href^="/lesson/"]', "Học bài tiếp theo", "Bấm vào bài được đề xuất để bắt đầu hoặc tiếp tục. Nếu có bài học bù hoặc bài ôn cần làm trước, hoàn thành bài đó để mở bài kế tiếp."],
    ['[data-home-block="month-path"] .monthly-learner-calendar-week button:enabled', "Xem lịch theo tuần", "Dùng hai mũi tên để đổi tuần. Trong lịch, bấm bài học hoặc bài ôn đã mở để học hay ôn lại."],
    ['[data-home-block="month-path"]:not(:has(.monthly-learner-calendar-week)) a[href^="/lesson/"]', "Chọn bài trên lịch", "Bấm bài học hoặc bài ôn đã mở để học hay ôn lại. Ô lịch cho biết bài nào đã học và bài nào chưa mở."],
    ['.home-page[data-monthly-preparation="true"] [data-home-block="activities"] a[href="/coach"]', "Luyện với Season trong lúc chờ", "Mở Season AI Coach để luyện hội thoại tiếng Anh theo trình độ đã duyệt trong khi bộ bài tháng đang chuẩn bị."],
    ['.home-page[data-monthly-preparation="false"] [data-home-block="activities"] a[href="/coach"]', "Luyện với Season", "Mở Season AI Coach để luyện hội thoại theo chủ đề. Số lượt hợp lệ hôm nay hiển thị ngay trên thẻ."],
    ['.home-page[data-monthly-preparation="true"] [data-home-block="activities"] a[href="/monthly"]', "Theo dõi bài tháng", "Người vận hành đang chuẩn bị và duyệt bộ bài cho trình độ của bạn. Mở Bài tháng để theo dõi trạng thái và xem thông tin bài thi."],
    ['.home-page[data-monthly-preparation="false"] [data-home-block="activities"] a[href="/monthly"]', "Xem điều kiện thi tháng", "Mở Bài tháng để xem ngày thi, giờ vào đề và giới hạn số ngày vắng. Số bài đã học và lượt Season dùng để theo dõi tiến độ."],
    ['.learner-summary-card--profile a[href="/profile"]', "Hồ sơ và điểm đầu vào", "Mở Hồ sơ học tập & đầu vào để xem lại thông tin, kết quả đầu vào nếu đã có và trình độ đã duyệt."],
  ],
  "/coach": [
    [".coach-persona-toggle:enabled", "Chọn cách trò chuyện", "Chọn Informal để luyện cách nói thân mật hoặc Formal để luyện cách nói lịch sự trong công việc."],
    [".coach-feedback-toggles button", "Chọn phản hồi tự mở", "Bật Nhận xét để tự mở điểm, Giải thích để tự mở gợi ý và bản dịch khi có. Bạn vẫn mở được từng mục trong chat."],
    [".coach-limit-details > summary", "Xem lượt luyện", "Mở để biết lượt còn lại hôm nay, cách tính lượt hợp lệ và tiến độ so với chỉ tiêu tháng."],
    [".chat .coach-turn-audio", "Nghe Season nói", "Bấm Nghe để phát câu trả lời tiếng Anh của Season trong lượt đó."],
    [".chat-compose textarea:enabled", "Trả lời bằng tiếng Anh", "Đọc câu hỏi, nhập câu trả lời tiếng Anh rồi bấm Gửi. Season có thể chấm ý nghĩa, từ vựng và ngữ pháp."],
    ['.chat-compose button[aria-label="Nói"]:enabled', "Luyện nói", "Bấm nút micro để nói, rồi dừng ghi âm. Kiểm tra nội dung và bấm Gửi. Bạn cũng có thể tải tệp ghi âm có sẵn."],
    ['.chat-compose:not(:has(button[aria-label="Nói"])) .audio-capture-toolbar:has(input[type="file"]:enabled) label.coach-compose-icon', "Tải bản ghi âm", "Bấm biểu tượng tải tệp để chọn bản ghi âm tiếng Anh, sau đó bấm Gửi."],
  ],
  "/games": [
    [".game-vocabulary-tools:not([open]) > summary", "Bộ từ đang chơi", "Mở để xem từ đang dùng hoặc đổi sang chủ đề khác hay từ đã học."],
    [".game-vocabulary-tools[open] .games-word-set-card .word-chip", "Ôn từ trước khi chơi", "Bấm một từ để nghe phát âm. Nghĩa tiếng Việt nằm cạnh từ đó."],
    [".games-topic-card .topic-create input:enabled", "Tạo bộ từ theo chủ đề", "Nhập 1–3 từ tiếng Anh, ví dụ coffee shop, rồi bấm Tạo bộ từ. Có bộ từ thì mới mở được trò chơi phù hợp."],
    [".games-topic-card [data-game-source-learned]:enabled", "Dùng từ đã học", "Bấm để lấy từ đã học trong tháng làm bộ từ chơi. Đây cũng là cách vào chơi khi chưa thể tạo chủ đề mới."],
    ['.games-topic-card a[href="/home"]', "Chưa có bộ từ để chơi", "Khi bài tháng mở, hãy học phần từ vựng rồi quay lại và chọn Dùng từ đã học trong tháng. Có bộ từ phù hợp thì mới mở được trò chơi."],
    [".games-page:not(:has(.game-vocabulary-tools)) .games-word-set-card .word-chip", "Ôn từ trước khi chơi", "Bấm một từ để nghe phát âm. Nghĩa tiếng Việt nằm cạnh từ đó."],
    ['[aria-labelledby="games-picker-title"] a.game-tile', "Chọn trò chơi", "Bấm một trò đang sẵn sàng để luyện bộ từ hiện tại. Trò chưa sẵn sàng ghi rõ điều kiện cần bổ sung."],
  ],
  "/games/*": [
    [".game-tutorial-actions button", "Bắt đầu chơi", "Đọc mục tiêu và cách chơi ở trên, sau đó bấm Bắt đầu chơi."],
    [".game-result.is-error .game-result__actions button:enabled", "Gửi lại lượt chơi", "Nếu chưa lưu được kết quả, kiểm tra kết nối rồi bấm Thử gửi lại."],
    [".game-result.is-complete .game-result__actions button:enabled", "Chơi lại", "Bấm Chơi lại để bắt đầu một lượt mới với bộ từ hiện tại, hoặc chọn trò khác."],
  ],
  "/lesson/*": [
    [".lesson-appeal-form textarea", "Kháng nghị phần bài học", "Ghi rõ câu hoặc nội dung cần xem lại. Thêm ảnh minh chứng nếu có rồi gửi cho Vận hành.", true],
    [".lesson-study-cta button:enabled", "Học và luyện tập", "Học từ vựng, ngữ pháp và phát âm ở trên rồi dùng nút cuối phần Học để chuyển sang Luyện tập."],
    [".lesson-answer :is(textarea, input, select, button):enabled", "Làm phần luyện tập", "Làm lần lượt các phần và dùng nút Kiểm tra để lưu kết quả từng phần. Làm xong các phần bắt buộc thì nút Hoàn thành sẽ mở."],
    [".lesson-completion button:enabled", "Hoàn thành bài", "Bấm nút cuối bài để lưu tiến độ học hoặc lượt ôn lại của bạn."],
  ],
  "/onboard": [
    ['.profile-edit-sections button[aria-pressed="true"]', "Chuyển phần hồ sơ", "Chọn một mục để điền thông tin cá nhân, cách dùng tiếng Anh, sở thích học và trình độ tự đánh giá."],
    ['#profile-edit-personal input[name="fullName"]', "Thông tin cá nhân", "Họ tên và email là bắt buộc. Có thể thêm phòng ban, vị trí và tên Base để nhận nhắc học."],
    ['#profile-edit-usage label:has(input[name="goals"])', "Mục tiêu dùng tiếng Anh", "Chọn các mục đích thực tế trong công việc và cách bạn dùng tiếng Anh để Season đưa ví dụ sát hơn."],
    ['#profile-edit-learning label:has(input[name="learningStyles"])', "Cách học phù hợp", "Chọn cách bạn học hiệu quả, phong cách trò chuyện với Season, thời lượng và thiết bị thường dùng."],
    ['#profile-edit-level label:has(input[name="selfLevel"])', "Kinh nghiệm tiếng Anh", "Chọn trình độ bạn tự đánh giá. Có thể bổ sung chứng chỉ, kinh nghiệm học và điều muốn Season giúp."],
    ['.profile-form button[type="submit"]', "Lưu hồ sơ", "Điền các mục bắt buộc rồi lưu. Nếu cần làm tiếp sau, dùng Lưu nháp."],
  ],
  "/profile": [
    ['.profile-identity-actions button[aria-expanded="false"]', "Xem hồ sơ", "Bấm Xem hồ sơ để kiểm tra thông tin cá nhân và thông tin học tập đã lưu."],
    ['.profile-identity-details a[href="/onboard"]', "Cập nhật hồ sơ", "Mở Cập nhật hồ sơ để sửa công việc, mục tiêu hoặc sở thích học."],
    ['.profile-identity-actions button.btn-primary', "Đổi avatar", "Chọn biểu tượng, màu nét và màu nền của avatar."],
    ['.app-learner-page:not(.profile-page) a[href="/onboard"]', "Điền hồ sơ", "Bổ sung hồ sơ cá nhân để E4S chọn nội dung phù hợp với công việc và cách học của bạn."],
    [".learner-support-entry", "Hỗ trợ học tập", "Mở để gửi khiếu nại, kháng nghị, trả lời khảo sát tháng hoặc xem phản hồi đã nhận."],
    ['[aria-label="Mùa học"] button[aria-expanded="false"]', "Xem huy hiệu", "Mở danh sách để xem huy hiệu đã có và điều kiện cần hoàn thành ở từng cấp."],
    ['a[href="/reward/done"], a[href="/reward/preview"]', "Chứng nhận huy hiệu", "Xem mẫu chứng nhận hoặc mở chứng nhận của bạn khi đạt cấp cao nhất."],
  ],
  "/support": [
    ['[aria-labelledby="learner-complaint-title"] .request-evidence-picker .btn', "Thông tin và minh chứng", "Chọn loại khiếu nại, ghi màn hình hoặc ngày xảy ra. Đính kèm ảnh nếu có.", true],
    ['[aria-labelledby="learner-complaint-title"] .learner-support-form textarea', "Lý do khiếu nại", "Ghi rõ điều bạn muốn kiểm tra rồi bấm Gửi cho Quản lý."],
    [".assessment-appeal-status .learner-support-form select:enabled", "Trình độ đề xuất", "Chọn mức bạn cho là phù hợp. Vận hành sẽ xem lại bài và lý do của bạn.", true],
    [".assessment-appeal-status .learner-support-form textarea", "Soạn kháng nghị", "Nêu câu hoặc phần cần xem lại và lý do. Thêm ảnh nếu có rồi bấm Gửi cho Vận hành.", true],
    [".monthly-survey-heading select:enabled", "Chọn tháng khảo sát", "Chọn tháng cần trả lời nếu có nhiều khảo sát đang mở."],
    [".monthly-survey-form :is(.monthly-survey-stars:has(input:enabled), textarea:enabled, select:enabled)", "Trả lời khảo sát tháng", "Điền các câu bắt buộc rồi bấm Gửi phản hồi. Bạn có thể xem lại câu trả lời trong lịch sử."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=feedback"]) .request-card [id^="support-feedback-"] button[aria-expanded="false"]', "Mở phản hồi đã gửi", "Bấm Chi tiết ở khảo sát cần xem để mở lại câu trả lời của tháng đó."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=complaints"]) .learner-support-history-header button', "Gửi khiếu nại", "Bấm để báo vấn đề về điểm danh, số bài học hoặc tài khoản cho Quản lý."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=complaints"]):not(:has(.learner-support-request-detail)) .request-card button[aria-expanded="false"]', "Khiếu nại đã gửi", "Bấm Chi tiết để đọc nội dung đã gửi và phản hồi của Quản lý."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=appeals"]) .learner-support-action .assessment-appeal-status button[aria-expanded="false"]', "Bài có thể kháng nghị", "Chọn Gửi kháng nghị ở bài còn thời hạn để yêu cầu xem lại kết quả."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=appeals"]):not(:has(.learner-support-request-detail)) .request-card button[aria-expanded="false"]', "Kháng nghị đã gửi", "Bấm Chi tiết để đọc phản hồi cho kháng nghị."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"]:not([href*="type="])):not(:has(.learner-support-request-detail)) .request-card button[aria-expanded="false"]', "Lịch sử hỗ trợ", "Xem trạng thái rồi bấm Chi tiết để đọc lại nội dung và phản hồi."],
  ],
};

const operatorSteps: Record<string, readonly GuideStep[]> = {
  "/op": [
    [".operator-pending-review:not([open]) > summary", "Duyệt trình độ", "Mở một hồ sơ chờ duyệt để xem điểm từng kỹ năng và chọn mức cho người học."],
    ['.operator-pending-review[open] select[aria-label^="Mức duyệt"]:enabled', "Chọn trình độ", "Đối chiếu điểm và hồ sơ rồi chọn mức. Kiểm tra lần cuối trước khi xác nhận duyệt.", true],
  ],
  "/op/months": [
    ['.monthly-brief-summary button[aria-expanded="false"]', "Xem hoặc sửa chủ đề", "Mở biểu mẫu để xem chi tiết chủ đề đã chốt."],
    ["#monthly-brief-fields:not([hidden]) .monthly-topic-grid input", "Chủ đề tháng", "Điền tiêu đề, bối cảnh và mục tiêu giao tiếp rồi chốt chủ đề chung."],
    [".monthly-resources .monthly-resource-main-action:enabled", "Tài nguyên tháng", "Tạo và duyệt từ vựng, ngữ pháp, phát âm cho mức đang chọn để mở các thao tác soạn bài theo ngày."],
    [".monthly-resources .monthly-resource-cards button", "Kiểm tra tài nguyên", "Mở từng mục để kiểm tra từ vựng, ngữ pháp, phát âm và ảnh minh họa trước khi dùng trong bài."],
    [".monthly-plan-open-button", "Xem phân bổ tài nguyên", "Mở kế hoạch để xem từ vựng, ngữ pháp và phát âm được giao cho từng ngày học hoặc ngày ôn."],
    ["#monthly-teaching-calendar .monthly-day-cell:is(.lesson, .review) .monthly-day-action:enabled", "Lịch soạn bài", "Chọn ngày học hoặc ngày ôn để xem, soạn tay hoặc sinh nội dung."],
  ],
  "/op/review": [
    [".operator-coach-list .operator-review-learner-group:not([open]) > summary", "Phản hồi Season", "Mở từng người học để kiểm tra phản hồi và điểm chấm của Season."],
    [".operator-coach-list .operator-review-learner-group[open] .operator-review-item-heading button:enabled", "Đánh dấu đã kiểm", "Đọc câu trả lời và nhận xét, rồi đánh dấu lượt đã kiểm tra.", true],
    [".operator-attempt-learner-list .operator-review-learner-group:not([open]) > summary", "Cảnh báo bài tập", "Mở từng người học để xem kỹ năng đã đúng hoặc đã hết lượt làm."],
    [".operator-requests .request-filters select", "Lọc kháng nghị", "Chọn trạng thái để xem các kháng nghị đang chờ hoặc đã xử lý."],
    ['.operator-requests .request-card:has(.request-filters) a[aria-expanded="false"]', "Mở kháng nghị", "Bấm Xử lý hoặc Chi tiết ở hàng cần xem để đọc lý do và minh chứng."],
    [".operator-request-expanded .operator-review-action-footer button:enabled", "Xử lý kháng nghị", "Đọc lý do và minh chứng. Chọn chấp nhận hoặc giữ nguyên kết quả.", true],
  ],
};

const managerSteps: Record<string, readonly GuideStep[]> = {
  "/mgr": [
    [".manager-progress-card-actions button", "Xuất tiến độ nhóm", "Tải dữ liệu tiến độ người học dưới dạng CSV."],
    [".manager-progress-compact-details details:not([open]) > summary", "Chi tiết tiến độ", "Mở chi tiết trên hàng của học viên để xem lượt Season, tình trạng thi tháng và hoạt động gần nhất."],
    [".manager-progress-profile button:enabled", "Hồ sơ người học", "Mở hồ sơ để xem thông tin và kết quả của người học."],
  ],
  "/mgr/ops": [
    [".manager-operator-row:not([open]) > summary", "Hiệu suất vận hành", "Mở từng người vận hành để xem số bài đã soạn, đã duyệt và kết quả học viên."],
    [".manager-operator-row[open] .manager-operator-breakdown:not([open]) > summary", "Chi tiết chất lượng", "Mở để xem tỷ lệ làm đúng, lượt làm trung bình và các việc duyệt đã ghi nhận.", true],
  ],
  "/mgr/holidays": [
    ['.manager-holiday-form input[type="date"]', "Thêm ngày nghỉ", "Chọn ngày nghỉ của tổ chức rồi bấm Thêm ngày nghỉ."],
    [".manager-holiday-calendar select", "Lịch nghỉ lễ", "Lọc để xem ngày lễ Việt Nam hoặc ngày nghỉ của tổ chức."],
  ],
  "/mgr/reminders": [
    ['.manager-reminder-toggle[aria-expanded="false"]', "Xem lời nhắc", "Mở từng học viên để kiểm tra nội dung và kênh nhận."],
    [".manager-reminder-actions button:enabled", "Chọn kênh nhắc học", "Kiểm tra người nhận và nội dung rồi chọn email hoặc Base.vn nếu đã cấu hình. Có thể sao chép để gửi qua kênh khác.", true],
  ],
  "/mgr/report": [
    [".manager-monthly-filters input", "Chọn phạm vi báo cáo", "Chọn tháng và trình độ. Chỉ số, kết quả thi và phản hồi khảo sát sẽ dùng cùng bộ lọc."],
    [".manager-monthly-report-actions button:enabled", "Tải báo cáo", "In, lưu PDF hoặc lấy bản chữ cho tháng và trình độ đang xem."],
  ],
  "/mgr/surveys": [
    ['.monthly-survey-month-filter input[type="month"]', "Chọn tháng khảo sát", "Chọn tháng cần soạn hoặc xem phản hồi, rồi bấm Xem tháng."],
    [".monthly-survey-editor input", "Soạn biểu mẫu", "Đặt tiêu đề, thêm câu hỏi và chọn loại câu trả lời. Lưu bản nháp trước khi công bố.", true],
    ['[aria-labelledby="manager-monthly-survey-editor"]:not(:has(.monthly-survey-editor)) > .row:not(.monthly-survey-actions) > button:first-child', "Khảo sát tháng", "Mở bản nháp để soạn câu hỏi. Có thể xem trước rồi công bố cho người học."],
    ['button[aria-controls="manager-monthly-survey-preview"][aria-expanded="false"]', "Xem trước khảo sát", "Đọc lại biểu mẫu như người học sẽ thấy trước khi công bố."],
  ],
  "/mgr/ops/months": [
    ['.monthly-level-tabs button[aria-selected="true"]', "Nội dung tháng", "Bạn có thể xem chủ đề và chuyển mức để kiểm tra nội dung đã chuẩn bị."],
    [".monthly-resource-cards button", "Tài nguyên tháng", "Chọn một mục để xem từ vựng, ngữ pháp, phát âm hoặc ảnh minh họa."],
  ],
  "/mgr/requests": [
    ['.request-workspace:has(.request-tabs a[aria-current="page"]:not([href*="kind=complaint"])) .manager-requests-filters input', "Xử lý yêu cầu", "Đọc yêu cầu trước khi duyệt hoặc từ chối. Bật bộ lọc để xem mục đã lưu trữ."],
    ['.request-workspace:has(.request-tabs a[aria-current="page"][href*="kind=complaint"]) .manager-requests-filters input', "Khiếu nại học viên", "Đọc lý do và ảnh minh chứng trước khi duyệt hoặc từ chối. Bật bộ lọc để xem mục đã lưu trữ."],
    ['.manager-requests-card .request-actions button.btn-primary:enabled', "Phản hồi mục đang chờ", "Đọc nội dung rồi chọn Duyệt hoặc Từ chối. Ghi lý do trước khi xác nhận để người gửi xem lại."],
  ],
  "/mgr/rewards": [
    [".manager-reward-controls select", "Chọn tình huống giả lập", "Chọn tình huống để xem điểm và huy hiệu tương ứng."],
    ['.manager-reward-custom-toggle[aria-expanded="false"]', "Tùy chỉnh điểm và huy hiệu", "Mở tùy chỉnh để nhập điểm và bật từng huy hiệu. Kết quả bên dưới sẽ đổi ngay."],
    [".manager-reward-custom input", "Thử điểm và huy hiệu", "Nhập số điểm, rồi bấm từng huy hiệu để bật hoặc tắt và xem tiến độ cập nhật.", true],
    [".manager-reward-result-pane header button", "Xem thông báo lên cấp", "Mở bản xem trước thông báo người học sẽ nhận khi đủ điều kiện."],
  ],
};
managerSteps["/mgr/reopen-requests"] = managerSteps["/mgr/requests"]!;
managerSteps["/mgr/complaints"] = managerSteps["/mgr/requests"]!;
managerSteps["/mgr/ops/levels"] = [
  [".operator-pending-review > summary", "Theo dõi duyệt mức", "Mở hồ sơ đang chờ để đối chiếu điểm và thông tin xét trình độ."],
];
managerSteps["/mgr/ops/review"] = [
  [".operator-coach-list .operator-review-learner-group:not([open]) > summary", "Theo dõi phản hồi", "Mở từng người học để kiểm tra phản hồi của Season."],
  [".operator-attempt-learner-list .operator-review-learner-group:not([open]) > summary", "Theo dõi cảnh báo bài tập", "Mở từng người học để xem kết quả từng kỹ năng."],
  [".operator-review-card-list .operator-review-learner-group:not([open]) > summary", "Theo dõi kháng nghị", "Mở từng người học để đọc lý do, minh chứng và trạng thái xử lý."],
];

const guideSteps = { learner: learnerSteps, operator: operatorSteps, manager: managerSteps };
function settingsStep(panel: string, control: string, title: string, text: string): GuideStep {
  return [`#setting-${panel} ${control}, button[aria-controls="setting-${panel}"][aria-expanded="false"]`, title, text];
}

const themeGuide = settingsStep("theme", ".settings-theme-choice.active", "Giao diện theo mùa", "Chọn mùa hoặc để tự động theo ngày. Lưu để áp dụng cho tổ chức.");
const musicGuide = settingsStep("music", ".settings-volume-range", "Nhạc nền của Season", "Chọn bản nhạc và âm lượng, nghe thử rồi lưu cấu hình.");
const learningGuide = settingsStep("monthly", ".settings-monthly-fields input", "Học theo tháng", "Kiểm tra thời lượng học và giới hạn lượt luyện với Season. Các mục có quyền sửa sẽ lưu cùng nhau.");
const levelsGuide = settingsStep("levels", "input:enabled", "Ngưỡng lên và hạ mức", "Xem tiêu chí dùng để xét trình độ. Kiểm tra các ngưỡng trước khi lưu thay đổi.");

const managerSettings: readonly GuideStep[] = [
  settingsStep("ai", ".settings-ai-provider select:enabled", "Kết nối AI", "Chọn nhà cung cấp và kiểm tra kết nối trước khi lưu."),
  settingsStep("test-date", 'input[type="date"]', "Ngày hệ thống thử", "Chọn ngày giả lập để kiểm tra lịch, quyền học và thông báo. Ngày này áp dụng cho cả tổ chức."),
  learningGuide,
  settingsStep("images", "select:enabled", "Ảnh từ vựng", "Chọn nguồn ảnh minh họa. Dùng nút thử để kiểm tra ảnh trước khi lưu."),
  levelsGuide,
  themeGuide,
  musicGuide,
  settingsStep("policy", "input:enabled", "Nhắc học và báo cáo", "Chọn số ngày không hoạt động cần nhắc và bật báo cáo tháng nếu cần."),
  settingsStep("data", "button:enabled", "Xuất dữ liệu", "Dùng JSON để sao lưu hoặc CSV để xem tiến độ. Kiểm tra đúng tệp trước khi nhập dữ liệu."),
  settingsStep("accounts", "table tbody select:enabled", "Quản lý người dùng", "Kiểm tra vai trò và trạng thái. Dùng nút trong hàng của tài khoản để mở khóa hoặc đặt lại thông tin đăng nhập."),
];
const operatorSettings: readonly GuideStep[] = [
  themeGuide,
  musicGuide,
  learningGuide,
  levelsGuide,
  settingsStep("exam-requests", 'input[type="email"]', "Đề nghị cập nhật đề", "Nhập email đội phát triển và mô tả phần cần cập nhật trước khi gửi yêu cầu."),
  ['button[aria-controls="setting-accounts"][aria-expanded="false"]', "Danh sách người dùng", "Mở để xem vai trò, mức học và trạng thái đăng nhập của từng người."],
];

const monthlyLessonOperatorSteps: readonly GuideStep[] = [
  [".operator-lesson-edit-button:enabled", "Sửa bản nháp", "Kiểm tra nội dung từng phần. Nếu cần chỉnh, bấm Sửa tay rồi lưu trước khi duyệt."],
  [".operator-lesson-approve-button:enabled", "Duyệt bài", "Khi nội dung đã đúng, bấm Duyệt bài và xác nhận để khóa bản này."],
  [".operator-lesson-reopen-button:enabled", "Yêu cầu mở lại bài", "Bài đã duyệt được khóa chỉnh sửa. Nếu cần sửa, gửi lý do để Quản lý xem xét mở lại."],
];

export function guideDefinitions(role: GuideRole, path: string) {
  if (path === "/settings" && role !== "learner") return role === "manager" ? managerSettings : operatorSettings;
  if (role === "operator" && path.startsWith("/op/months/lesson/")) return monthlyLessonOperatorSteps;
  const routes = guideSteps[role];
  return routes[path] ?? routes[`/${path.split("/")[1]}/*`];
}

export function guidePopupDefinitions(role: GuideRole, path: string, popup: HTMLElement): readonly GuideStep[] | undefined {
  if (role === "operator" && (path === "/op/months" || path.startsWith("/op/months/lesson/"))) {
    if (popup.matches(".operator-lesson-editor")) return [
      ['input[aria-label="Tiêu đề bài"]:enabled', "Đặt mục tiêu bài", "Đặt tiêu đề ngắn bằng tiếng Anh. Ghi mục tiêu và các bước học để học viên biết cần làm gì."],
      [".operator-vocabulary-base input:enabled", "Dùng tài nguyên đã phân bổ", "Đối chiếu từ vựng, ngữ pháp và phát âm với kế hoạch của ngày này. Bài ôn dùng lại nội dung đã học trong tuần."],
      ['textarea[aria-label="Nội dung nghe"]:enabled', "Chuẩn bị bài tập và audio", "Nhập nội dung nghe và tải audio để học viên phát được. Kiểm tra câu hỏi và đáp án ở từng phần bài tập."],
      [".operator-lesson-save-button:enabled", "Kiểm tra và lưu bản nháp", "Bấm Kiểm tra & lưu. Nếu còn mục thiếu, bổ sung trước khi duyệt hoặc lưu tạm để làm tiếp."],
    ];
    if (popup.matches(".monthly-reopen-dialog")) return [
      [".monthly-reopen-dialog textarea:enabled", "Nêu lý do mở lại", "Ghi phần cần sửa và lý do, rồi gửi yêu cầu cho Quản lý. Kết quả đã ghi nhận của học viên được giữ lại."],
    ];
  }
  if (role === "learner" && popup.matches(".avatar-dialog")) return [
    [".avatar-symbol-options button", "Chọn biểu tượng", "Chọn biểu tượng hoặc chữ cái đầu. Bản xem thử đổi ngay theo lựa chọn."],
    [".avatar-swatch-options button", "Chọn màu avatar", "Chọn màu nét và màu nền. Xem thử ở đầu hộp rồi bấm Lưu avatar."],
  ];
  if ((role === "operator" || role === "manager") && path.endsWith("/months") && popup.matches(".monthly-resource-panel")) return [
    [".monthly-plan-day > summary", "Phân bổ theo ngày", "Mở từng ngày để đối chiếu từ vựng, ngữ pháp và phát âm được giao."],
  ];
  if (role === "operator" && path === "/op/months" && popup.matches(".monthly-resource-editor")) return [
    [".monthly-resource-editor-section > summary", "Sửa tài nguyên tháng", "Mở mục cần sửa. Kiểm tra các lỗi được báo rồi lưu bản nháp."],
    [".monthly-resource-editor-supports select", "Từ mở rộng", "Kiểm tra quan hệ của từ mở rộng với từ cốt lõi đang mở.", true],
  ];
  return undefined;
}
