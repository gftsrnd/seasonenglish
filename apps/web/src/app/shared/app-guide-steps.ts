export type GuideRole = "learner" | "operator" | "manager";
export type GuideStep = readonly [selector: string, title: string, text: string, prioritize?: true];

// Viết bước theo docs/guide-writing-rules.md:
// - Mỗi bước trỏ vào đúng vùng đang nói: thẻ, bảng, cột, bộ lọc, khối form hoặc ô thao tác của hàng đầu tiên.
// - Nội dung 1–2 câu ngắn, khoảng 20 tiếng (≤ 130 ký tự), một ý mỗi bước; đậm 1–2 chữ chính bằng **...**.
// - Mỗi màn khoảng 3–7 bước ở mỗi trạng thái; chi tiết từng trường để cho gợi ý dưới trường hoặc nút ⓘ.
// - Engine tự sắp bước theo thứ tự trên màn và bỏ thẻ đang bị ẩn; trạng thái khác nhau dùng bộ chọn khác nhau.
// - Nội dung chữ do PO duyệt: bản để duyệt nằm ở HUONG-DAN-SU-DUNG-NOI-DUNG.md (cạnh thư mục repo).

// Trang chủ trong tháng học thử: thẻ tiến độ có data-trial.
const HOME_TRIAL = ".home-page:has(.monthly-home-metrics[data-trial])";
const HOME_COUNTED = ".home-page:not(:has(.monthly-home-metrics[data-trial]))";

const learnerSteps: Record<string, readonly GuideStep[]> = {
  "/home": [
    // Trang chủ trước khi có trình độ: một bước cho mỗi thẻ theo thứ tự trên màn (đầu khối, thẻ 1, 2, 3).
    // Đầu khối trỏ vào tiêu đề, không trỏ cả khối: cả khối bắt đầu từ thẻ 1 nên bước kế tiếp sẽ như quay lại thẻ 1.
    [".onboarding-steps > h2", "Ba bước bắt đầu", "Làm lần lượt **hồ sơ**, **test đầu vào**, rồi chờ duyệt mức. Nhãn cho biết bạn đang ở bước nào."],
    ['.onboarding-steps [data-onboarding-step="1"].done', "Hồ sơ đã lưu", "Hồ sơ đã xong. Bấm **Xem / sửa hồ sơ** khi cần đổi thông tin."],
    ['.onboarding-steps [data-onboarding-step="1"].cur', "Điền hồ sơ", "Bấm **Điền hồ sơ**, khoảng 2 phút, để bài học sát công việc của bạn."],
    ['.onboarding-steps [data-onboarding-step="2"].todo', "Test đầu vào", "Mở sau khi lưu hồ sơ: **4 phần**, tối đa 75 phút, không cần ôn trước."],
    ['.onboarding-steps [data-onboarding-step="2"].cur:has(.onboarding-test-note)', "Làm test đầu vào", "Chuẩn bị **tai nghe** và micro, rồi bấm **Bắt đầu test**. Không cần ôn trước."],
    ['.onboarding-steps [data-onboarding-step="2"].cur:not(:has(.onboarding-test-note))', "Làm tiếp bài test", "Bấm **Tiếp tục bài test** để làm tiếp; câu đã trả lời vẫn được giữ."],
    ['.onboarding-steps [data-onboarding-step="2"].done', "Đã nộp test", "Bài test đã nộp. Điểm này giúp Vận hành **xếp mức** cho bạn."],
    ['.onboarding-steps [data-onboarding-step="3"].todo', "Vận hành duyệt mức", "Sau khi bạn nộp test, Vận hành xếp mức. Bài học **tự mở** khi có mức."],
    ['.onboarding-steps [data-onboarding-step="3"].cur', "Chờ duyệt mức", "Vận hành đang xếp mức cho bạn. Bạn không cần làm gì; bài học **tự mở**."],
    // Lượt thi lại đầu vào được duyệt: trang chủ chỉ còn thẻ thi lại.
    ['section[aria-label="Bài thi lại đầu vào"]', "Bài thi lại đầu vào", "Bạn có **một lượt thi lại**. Nộp xong, Vận hành chốt mức theo bài thi lại."],
    // Thẻ chính: một bước cho mỗi dạng thẻ.
    [`${HOME_COUNTED} .home-primary-lesson:not(.home-primary-lesson--catch-up)`, "Bài học hôm nay", "Bài nên học hôm nay. Bấm **Học ngay**, hoặc **Học tiếp** nếu đang dở."],
    [".home-primary-lesson--catch-up", "Bài học bù", "Còn một bài ngày trước chưa học. **Học bù** bài này trước bài hôm nay."],
    [`${HOME_TRIAL} .home-primary-lesson`, "Bài học thử", "Tháng này là **tháng học thử**: học để làm quen, chưa tính điểm danh hay bài thi."],
    ['.home-page [data-home-block="primary"].hero:not(.home-primary-lesson):has(a, button)', "Bài đang bị chặn", "Bài tiếp theo chỉ mở khi bạn xong **bài đang chặn**. Bấm nút trên thẻ để làm ngay."],
    ['.home-page [data-home-block="primary"].hero:not(.home-primary-lesson):not(:has(a, button))', "Chưa có bài mới", "Thẻ ghi **ngày mở** bài tiếp theo. Trong lúc chờ, ôn lại bài đã học trong lịch."],
    ['[data-home-block="primary"]:has(a[href^="/support"]):not(:has(a[href^="/lesson/"]))', "Bài học đang khóa", "Bài khóa vì bạn **bỏ lỡ bài thi** tháng trước. Bấm **Gửi đơn xin mở** để Quản lý xem xét."],
    ['.home-page[data-monthly-preparation="true"] [data-home-block="primary"]:not(:has(a[href^="/lesson/"], a[href^="/support"]))', "Lộ trình đang chuẩn bị", "Bộ bài tháng **đang được soạn**. Trong lúc chờ, bạn vẫn luyện được với Season."],
    ['.home-page:not([data-monthly-preparation="true"]) section.card[data-home-block="primary"]:not(:has(a))', "Chưa có bài mới", "Thẻ cho biết vì sao chưa có bài, ví dụ **ngày bắt đầu học** hoặc đã học hết bài đang mở."],
    [".pass-course-home-card", "Bài thi đầu ra", "Ở mức C1, thẻ cho biết bạn thi **Pass Course** được chưa và mở bài thi khi đủ điều kiện."],
    [`${HOME_COUNTED} [data-home-block="metrics"]`, "Tiến độ học tập", "Bài, bài ôn, **điểm danh** và điểm huy hiệu của tháng. Dòng **Vắng** so với số ngày cho phép."],
    [`${HOME_TRIAL} [data-home-block="metrics"]`, "Tiến độ học thử", "Chỉ đếm bài đã học. Điểm danh và bài thi **tính từ ngày** ghi trên thẻ."],
    [`${HOME_COUNTED} [data-home-block="month-path"]`, "Lịch học tháng", "Mỗi ô là một bài, bài ôn, ngày nghỉ hoặc **bài thi tháng**. Bấm bài đã mở để học."],
    [`${HOME_TRIAL} [data-home-block="month-path"]`, "Lịch học thử", "Mỗi ô là một bài hoặc ngày nghỉ. Ngày thi ghi **Miễn thi** vì tháng thử không có bài thi."],
    ['.home-page[data-monthly-preparation="true"] [data-home-block="activities"]', "Luyện trong lúc chờ", "Mở **Season AI Coach** để luyện nói; **Bài tháng** cho biết bộ bài đã chuẩn bị đến đâu."],
    [`${HOME_COUNTED}:not([data-monthly-preparation="true"]) [data-home-block="activities"]`, "Season và bài tháng", "**Season AI Coach** để luyện nói. **Bài tháng** mở lịch thi và điều kiện dự thi."],
    [`${HOME_TRIAL}:not([data-monthly-preparation="true"]) [data-home-block="activities"]`, "Season và bài tháng", "**Season AI Coach** để luyện nói. Tháng học thử **không có bài thi**."],
    [".home-readiness:has(a[href^=\"/test/level-up\"])", "Sẵn sàng thi lên mức", "Bạn đủ **4 điều kiện**. Bấm **Thi lên mức** khi đã có tai nghe và micro."],
    [".home-readiness:not(:has(a[href^=\"/test/level-up\"]))", "Đường lên mức", "Bốn **điều kiện để thi lên mức**. Đủ cả bốn thì nút thi hiện ở đây."],
    ['[data-home-block="monthly-exam"]', "Bài thi tháng", "Trạng thái **bài thi cuối tháng**. Bấm để xem lịch thi và điều kiện dự thi."],
    [".learner-summary-card--profile", "Hồ sơ và đầu vào", "Xem hồ sơ, **điểm đầu vào** và trình độ đã duyệt."],
  ],
  "/monthly": [
    // Tháng học thử: trang chỉ có một dòng, không có lịch thi hay điều kiện dự thi.
    [".monthly-assessment-landing .monthly-assessment-form-state:not([aria-label])", "Tháng học thử", "Tháng học thử **không có bài thi** và không xét điều kiện dự thi."],
    [".monthly-assessment-header", "Lịch thi tháng", "**Ngày thi** và trạng thái đề: chưa phát hành, đã phát hành, đang làm hoặc đã xong."],
    [".monthly-assessment-form-state[aria-label]:has(a.btn)", "Vào bài thi", "Đề đã mở. Chuẩn bị tai nghe, micro rồi bấm **Vào bài thi**."],
    [".monthly-assessment-form-state[aria-label]:not(:has(a.btn))", "Trạng thái đề", "Cho biết **bước tiếp theo**, ví dụ chờ phát hành đề hoặc chờ giờ mở đề."],
    [".monthly-eligibility-metrics", "Điều kiện dự thi", "Chỉ **điểm danh** quyết định quyền vào thi. Hai chỉ số còn lại để theo dõi."],
    [".monthly-complaint-form", "Khiếu nại điều kiện", "Vắng quá giới hạn: nêu lý do rồi **Gửi khiếu nại**. Quản lý trả lời trong 24 giờ.", true],
  ],
  "/coach": [
    [".coach-header", "Phong cách trò chuyện", "Chọn giọng **Informal** hay **Formal**. Xoá chat để bắt đầu chủ đề mới."],
    [".coach-limit-row", "Lượt luyện và phản hồi", "Số **lượt hợp lệ** hôm nay và tháng. Bật Nhận xét, Giải thích để tự mở sau mỗi lượt."],
    [".coach-page .chat", "Cuộc trò chuyện", "Season trả lời và **chấm từng lượt**. Bấm **Nghe** để nghe câu của Season."],
    [".chat-compose:has(textarea:enabled)", "Trả lời Season", "Gõ câu tiếng Anh rồi **Gửi**, hoặc bấm **Nói** để ghi âm."],
    [".coach-vocabulary", "Từ bí mật", "Các **từ bí mật** mở dần khi bạn luyện. Bấm từ đã mở để nghe."],
  ],
  "/games": [
    [".games-page:not(:has(.games-topic-card)) > section.card", "Mini game chưa mở", "Mini game mở khi có **bài học tháng** đã phát hành."],
    [".game-vocabulary-tools:not([open]) > summary", "Bộ từ đang chơi", "Chủ đề và số từ đang chơi. Bấm để mở, xem từ hoặc **đổi bộ từ**."],
    [".games-topic-card:has(.topic-create input:enabled)", "Tạo bộ từ", "Nhập **1–3 từ tiếng Anh** rồi **Tạo bộ từ**, hoặc dùng từ đã học trong tháng."],
    [".games-topic-card:not(:has(.topic-create input:enabled)):has([data-game-source-learned])", "Chọn bộ từ", "Bấm **Dùng từ đã học trong tháng** để chơi với từ bạn đã học."],
    ['.games-topic-card:has(a[href="/home"])', "Chưa có bộ từ", "Học phần **từ vựng** của bài tháng trước, rồi quay lại chơi."],
    [".games-word-set-card:has(.word-chip)", "Ôn từ trước khi chơi", "Các từ đang chơi, kèm **nghĩa tiếng Việt**."],
    ['[aria-labelledby="games-picker-title"]:has(a.game-tile)', "Chọn trò chơi", "Bấm một trò **Sẵn sàng chơi**. Trò chưa mở ghi rõ điều kiện còn thiếu."],
    [".arena-entry", "Đấu trường", "Từ **B1**: thách đấu bạn cùng cấp bằng bộ từ đang chơi và xem bảng xếp hạng mùa."],
  ],
  "/arena": [
    [".arena-tabs", "Hai mục", "**Thi đấu** để đăng và nhận trận. **Bảng xếp hạng** để xem thứ hạng trong mùa."],
    [".arena-set", "Bộ từ đang dùng", "Thách đấu dùng bộ này. **Xem từ** để ôn, **Đổi bộ** để đổi ngay tại đây."],
    ['[aria-labelledby="arena-start-title"]', "Đăng thách đấu", "Chọn trò rồi bấm **Đăng thách đấu**. Tối đa **3 trận** xếp hạng đang mở."],
    ['[aria-labelledby="arena-mine-title"]', "Trận của bạn", "Bấm **Chơi** khi tới lượt. Chưa ai nhận thì **Huỷ** được; bỏ trận sẽ tính thua."],
    ["#arena-open-title", "Thách đấu đang mở", "Xem từ để ôn trước rồi **Nhận**. Đã nhận phải chơi trong **24 giờ**."],
    [".arena-board", "Bảng xếp hạng", "Chọn **Cấp, Trò và Mùa** để xem bảng. Bằng điểm thì ai đạt trước xếp trên."],
  ],
  "/arena/*": [
    [".arena-match-countdown", "Thời gian còn lại", "Đồng hồ đếm tới hạn hoàn thành của trận. Quay về Đấu trường trước khi chơi không làm mất lượt."],
    ['.arena-state[data-arena-state="ready"]', "Sẵn sàng đấu", "Ôn các từ bên dưới rồi bấm **Bắt đầu**. Thoát giữa ván tính thua."],
    [".arena-result", "Kết quả trận", "So **điểm ván** hai bên; bằng điểm thì ai nhanh hơn thắng. Ô dưới là điểm xếp hạng được cộng hoặc trừ."],
  ],
  "/games/*": [
    ["#gm-board:has(.game-tutorial-actions)", "Cách chơi", "Đọc mục tiêu và cách tính điểm, rồi bấm **Bắt đầu chơi**."],
    ["#gm-board:has(.game-result.is-error)", "Chưa lưu kết quả", "Kết quả chưa lưu. Kiểm tra mạng rồi bấm **Thử gửi lại**."],
    ["#gm-board:has(.game-result.is-complete)", "Kết quả lượt chơi", "Điểm lượt vừa chơi. Bấm **Chơi lại** hoặc **Chọn trò khác**."],
  ],
  // Một bước cho mỗi thẻ chính, theo thứ tự trên màn; chỉ đi qua tab đang mở (Học hoặc Bài tập).
  // Kiểm tra trên bài thật dựng từ dữ liệu mẫu: apps/web/src/app/learner/Learning.guide.test.tsx.
  "/lesson/*": [
    [".app-learner-page > div.card:has(.eyebrow)", "Bài chưa mở", "Bài chưa đến ngày hoặc cần xong **bài trước**. Bấm nút chính để làm bài đang chặn."],
    [".lesson-heading", "Đầu bài học", "Tên bài và trạng thái. Học tab **1. Học** trước, tab **2. Bài tập** mở sau đó."],
    [".lesson-study-steps", "Học từng bước", "Phần Học chia **từng bước**. Học xong bước này thì bấm **Tiếp** ở cuối trang."],
    [".lesson-part--vocabulary", "Từ vựng", "Mỗi thẻ có phiên âm, nghĩa, ảnh. Bấm **loa** hoặc cụm từ để nghe."],
    [".lesson-part--grammar", "Ngữ pháp", "**Công thức** và câu ví dụ. Bấm câu ví dụ để nghe cách nói."],
    [".lesson-part--pronunciation", "Phát âm", "Nghe hết các **từ mẫu**: phần Nói chỉ mở khi đã nghe đủ."],
    [".lesson-study-cta", "Xong phần Học", "Học xong thì bấm **Đã học xong → Làm bài tập** để mở tab Bài tập."],
    // Vùng trả lời của bài tập đầu tiên; nút báo lỗi chỉ có sau khi học xong và khi câu chưa bị báo lỗi.
    [".lesson-parts:has(.lesson-answer > button[aria-expanded]) .lesson-answer", "Trả lời và nộp", "Trả lời rồi bấm **Nộp bài**; sai thì làm lại. Đề sai thì bấm **Báo lỗi câu này**."],
    [".lesson-parts:not(:has(.lesson-answer > button[aria-expanded])) .lesson-answer", "Trả lời và nộp", "Trả lời rồi bấm **Nộp bài**. Sai thì làm lại kèm gợi ý."],
    [".lesson-part--speaking:has(.lesson-speaking-gate)", "Mở phần Nói", "Phần Nói đang khóa: nghe hết **từ mẫu** ở thẻ Phát âm trước."],
    [".lesson-part--speaking:not(:has(.lesson-speaking-gate))", "Nói", "Nghe câu mẫu, **ghi âm** câu của bạn rồi bấm **Kiểm tra nói**."],
    [".lesson-appeal-form", "Báo lỗi phần bài", "Ghi rõ **chỗ sai**, thêm ảnh nếu có, rồi gửi để Vận hành xem lại.", true],
    [".lesson-completion", "Hoàn thành bài", "Đủ phần thì bấm **Hoàn thành bài** để lưu và mở bài tiếp theo."],
    ['.app-learner-page > .row:has(> .lesson-back)', "Bài ôn thứ Sáu", "Ôn lại **từ và cấu trúc** của tuần, làm lần lượt từng phần."],
    [".weekly-review-sections", "Các phần bài ôn", "Mỗi dòng ghi **số câu đúng** của một phần."],
    ["section.card:has(button.card.flat[aria-pressed])", "Khởi động lật thẻ", "Bấm thẻ để lật xem **từ tiếng Anh**. Phần này không chấm điểm."],
    ['.app-learner-page:has(> .weekly-review-sections, .weekly-review-sections) section.card.stack:has([role="group"], textarea, .weekly-review-read-aloud)', "Câu đang làm", "Trả lời rồi bấm **Kiểm tra**. Câu sai sẽ **quay lại** ở cuối phần."],
    ['section.card:is([aria-label="Đã xong bài ôn"], [aria-label="Review complete"])', "Đã xong bài ôn", "Kết quả đã lưu. **Bài đầu tuần sau** mở đúng ngày của nó."],
  ],
  "/onboard": [
    [".profile-edit-sections", "Các mục hồ sơ", "Hồ sơ chia **4 mục**. Điền xong mục này rồi bấm **Tiếp** ở cuối trang."],
    ['.profile-form > section.card:not([id]):not([hidden])', "Thông tin và mục tiêu", "Điền **họ tên, email** và 4 câu về việc bạn dùng tiếng Anh; các mục có dấu sao là bắt buộc."],
    ["#profile-edit-learning", "Phong cách học", "Chọn **cách học** hợp với bạn, thời lượng và thiết bị hay dùng."],
    ["#profile-edit-level", "Trình độ tự đánh giá", "Chọn **trình độ** bạn tự thấy và chứng chỉ nếu có."],
    [".onboard-actions", "Lưu hồ sơ", "**Lưu nháp** để điền tiếp sau. Lưu đủ hồ sơ thì chuyển sang **test đầu vào**."],
  ],
  "/profile": [
    [".profile-identity-card", "Hồ sơ cá nhân", "**Đổi avatar**, hoặc **Xem hồ sơ** để xem và cập nhật thông tin."],
    ['.app-learner-page:not(.profile-page):has(> a[href="/onboard"])', "Hồ sơ chưa đủ", "Bấm **Điền hồ sơ** để bài học hợp với công việc của bạn."],
    [".learner-support-entry", "Hỗ trợ học tập", "Gửi **khiếu nại, kháng nghị**, khảo sát và xem phản hồi đã nhận."],
    [".profile-progress-section:has(.profile-completion-heading)", "Đã hoàn thành khóa", "Bấm **Xem chứng nhận** để mở chứng nhận hoàn thành khóa."],
    ['[aria-label="Mùa học"]', "Mùa học và huy hiệu", "Đủ **điểm và huy hiệu** thì lên mùa tiếp theo. Bấm để xem điều kiện từng huy hiệu."],
    [".profile-assessment-section:not(:has(.profile-assessment-result))", "Kết quả đánh giá", "Điểm **đầu vào** từng kỹ năng. Bấm **Xem lại bài làm** để xem từng câu."],
    [".profile-assessment-section:has(.profile-assessment-result)", "Kết quả đánh giá", "Điểm đầu vào và đầu ra. Bấm **Chi tiết điểm đầu ra** để xem từng kỹ năng."],
  ],
  "/support": [
    // Thẻ Tất cả chỉ có bảng lịch sử: thêm hàng mục để người học biết gửi khiếu nại, kháng nghị ở đâu.
    // Trước khi trình độ được duyệt, mục Kháng nghị và Khảo sát tháng bị ẩn, khiếu nại chỉ có loại Tài khoản.
    [".learner-support-shortcuts", "Bạn cần hỗ trợ gì?", "Mỗi ô là một loại yêu cầu, kèm **số mục đang chờ**. Bấm nút trong ô để gửi hoặc xem."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"]:not([href*="type="])):has(.request-tabs a[href*="type=appeals"]) .request-tabs', "Các mục hỗ trợ", "**Khiếu nại** báo lỗi điểm danh, bài, tài khoản. **Kháng nghị** xin xem lại kết quả hoặc thi lại."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"]:not([href*="type="])):not(:has(.request-tabs a[href*="type=appeals"])) .request-tabs', "Các mục hỗ trợ", "Mở **Khiếu nại** để báo vấn đề tài khoản. Mục khác mở khi bạn có mức."],
    ['[aria-labelledby="learner-complaint-title"]', "Khiếu nại mới", "Chọn **loại**, nêu lý do, thêm ảnh nếu có, rồi **Gửi cho Quản lý**.", true],
    [".learner-support-action:has(.placement-retake-heading)", "Xin thi lại đầu vào", "Bạn được xin **thi lại một lần**. Ghi lý do rồi gửi cho Vận hành."],
    [".learner-support-action:has(.assessment-appeal-status)", "Bài có thể kháng nghị", "Bấm **Gửi kháng nghị** ở bài còn hạn và nêu lý do."],
    [".card:has(> .monthly-survey-form), .monthly-survey-form", "Khảo sát tháng", "Trả lời các câu có dấu sao rồi **Gửi phản hồi**."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=complaints"]) .request-card', "Khiếu nại đã gửi", "Mỗi hàng có **trạng thái**. Bấm **Chi tiết** để đọc phản hồi."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=appeals"]) .request-card', "Kháng nghị đã gửi", "Mỗi hàng có **trạng thái**. Bấm **Chi tiết** để đọc phản hồi của Vận hành."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"][href*="type=feedback"]) .request-card', "Khảo sát đã gửi", "Bấm **Chi tiết** để xem lại câu trả lời của tháng đó."],
    ['.learner-support-page:has(.request-tabs a[aria-current="page"]:not([href*="type="])) .request-card', "Lịch sử hỗ trợ", "Mọi yêu cầu đã gửi kèm **trạng thái**. Bấm **Chi tiết** để đọc phản hồi."],
  ],
};

// Vận hành › Phản hồi & yêu cầu (mục 19a): mỗi tab có bước riêng; bước đầu luôn giới thiệu 4 tab.
const APPEALS = '[data-operator-review-tab="appeals"]';
const APPEAL_TABLE = `${APPEALS} .request-table[aria-label="Danh sách kháng nghị"]`;
const FIRST_APPEAL = `${APPEAL_TABLE} .request-record:first-of-type`;
const operatorReviewSteps: readonly GuideStep[] = [
  [".operator-review-navigation", "Bốn mục của trang", "Bốn tab: nhận xét Season, **kháng nghị** của học viên, **yêu cầu** gửi Quản lý, cảnh báo câu sai hai lượt."],
  // Kháng nghị học viên
  [`${APPEALS} .request-filters`, "Lọc theo trạng thái", "Chọn **Chờ xử lý** để thấy việc còn mở, **Đã xử lý** để xem lại quyết định."],
  [`${FIRST_APPEAL} .request-kind`, "Cột Loại", "**Kháng nghị**: xin xem lại kết quả bài. **Yêu cầu thi lại**: xin thi lại bài đầu vào."],
  [`${FIRST_APPEAL} .request-state`, "Ba trạng thái", "**Chờ xử lý** là chưa quyết định; đã quyết định thì ghi **Đã chấp nhận** hoặc Đã từ chối."],
  [`${APPEAL_TABLE} .request-record:not(:has(.request-delete)) .request-commands`, "Nút Xử lý", "Bấm **Xử lý**: đọc lý do, minh chứng, rồi chấp nhận hoặc từ chối kèm **lời giải thích**."],
  [`${APPEAL_TABLE} .request-record:has(.request-delete) .request-commands`, "Chi tiết và Xóa", "**Chi tiết** xem lại quyết định. **Xóa** chỉ ẩn khỏi danh sách; học viên vẫn thấy kết quả."],
  [`${APPEAL_TABLE}:not(:has(.request-record))`, "Danh sách kháng nghị", "Chưa có mục nào theo bộ lọc này. Mục mới sẽ hiện ở đây kèm **loại** và **trạng thái**."],
  [`${APPEALS} .operator-request-expanded:has(.operator-review-appeal-pending:not([aria-label^="Yêu cầu thi lại"]))`, "Xử lý kháng nghị", "Đọc lý do và bài làm, chọn **Chấp nhận** hoặc **Giữ nguyên kết quả**, rồi giải thích cho học viên.", true],
  [`${APPEALS} .operator-request-expanded:has(.operator-review-appeal-pending[aria-label^="Yêu cầu thi lại"])`, "Xử lý thi lại", "Chọn **Duyệt cho thi lại** hoặc Từ chối. Cần **phát hành đề thi lại** trước khi duyệt.", true],
  [`${APPEALS} .operator-request-expanded:has(.operator-review-appeal:not(.operator-review-appeal-pending))`, "Xem quyết định", "Lý do, minh chứng và **phản hồi đã gửi**. Quyết định đã lưu không sửa được.", true],
  // Phản hồi Season
  ['[data-operator-review-tab="coach"] .operator-review-panel', "Phản hồi Season", "Mở từng học viên để đọc nhận xét AI, rồi bấm **Đánh dấu đã kiểm**."],
  ['[data-operator-review-tab="coach"] > .empty', "Phản hồi Season", "Chưa có lượt luyện. Lượt luyện với **Season** sẽ hiện ở đây để bạn kiểm tra."],
  // Yêu cầu đã gửi
  ['[data-operator-review-tab="sent"] .request-card', "Yêu cầu đã gửi", "Yêu cầu **mở lại** hoặc **xóa tài khoản** bạn gửi Quản lý, kèm trạng thái và phản hồi."],
  // Cảnh báo bài tập
  ['[data-operator-review-tab="attempts"] .operator-review-card-list > article', "Câu sai cả hai lượt", "Mở câu hỏi để kiểm tra. Đề sai thì **Hiệu chỉnh câu**, đề đúng thì **Không lỗi**."],
  ['[data-operator-review-tab="attempts"] .empty', "Cảnh báo bài tập", "Chưa có câu nào học viên **sai cả hai lượt**."],
];

const operatorSteps: Record<string, readonly GuideStep[]> = {
  "/op": [
    ['[data-guide="op-pending"]', "Hồ sơ chờ duyệt", "Mở từng học viên để xem **điểm 4 kỹ năng**, chọn mức rồi bấm **Duyệt mức**."],
    ['[data-guide="op-signals"]', "Tín hiệu đổi mức", "Người đủ điều kiện **thi lên mức**, và người sai nhiều hai tuần liền cần xem **hạ mức**."],
    [".operator-approved-panel", "Học viên đã duyệt", "Mức hiện tại của từng người. **Đổi level**, mở **Thi lên mức** hoặc đặt mục tiêu tháng."],
    ['[data-guide="op-in-progress"]', "Đang làm test", "Đã bắt đầu bài đầu vào nhưng **chưa nộp**."],
    ['[data-guide="op-retry"]', "Cần làm lại", "Cần làm lại bài đầu vào. Bấm **Cho thi lại** để cấp lượt thi lại."],
    ['[data-guide="op-unassessed"]', "Chưa làm test", "Có tài khoản nhưng **chưa bắt đầu** bài đầu vào."],
  ],
  "/op/months": [
    [".monthly-month-card", "Chu kỳ tháng", "Chọn tháng cần soạn. Tháng đã qua chỉ **xem**, không sửa."],
    [".monthly-topic-card", "Chủ đề tháng", "Soạn hoặc **Gợi ý AI** chủ đề chung, rồi **Chốt chủ đề**. Hàng cuối để chọn mức."],
    [".monthly-resources", "Tài nguyên tháng", "**Sinh** hoặc soạn tay từ vựng, ngữ pháp, phát âm cho mức này, rồi **Duyệt tài nguyên**."],
    [".monthly-publication", "Công bố tháng", "Cho biết còn thiếu gì. Đủ điều kiện thì bấm **Công bố tháng**."],
    ["#monthly-teaching-calendar", "Lịch soạn bài", "**AI** sinh bài, **bút chì** soạn tay, Xem mở bài. Chỉ bật sau khi duyệt tài nguyên."],
  ],
  "/op/review": operatorReviewSteps,
};

operatorSteps["/op/tests"] = [
  ['.operator-review-tabs[aria-label="Loại bài kiểm tra"]', "Loại đề", "Chọn **loại đề**; kho đề và kết quả bên dưới đổi theo tab."],
  ['.tabs[aria-label="Mức đích"]', "Mức đích", "Chọn **mức học viên sẽ lên** để xem kho đề của mức đó."],
  [".operator-monthly-bank-tabs", "Tháng của đề", "Chọn **tháng** để xem đề thi tháng đó."],
  ['.assessment-bank:not([aria-label="Kho đề thi lại đầu vào"]) > .assessment-bank-toolbar', "Công cụ đề", "**Soạn tay** hoặc Sinh bằng AI để thêm nháp. **Cách giao đề** chọn bộ cho lượt thi mới."],
  ['.assessment-bank:not([aria-label="Kho đề thi lại đầu vào"]) > .assessment-bank-list:has(.assessment-bank-row)', "Các phiên bản", "Nhãn cho biết **Đang dùng**, Đã duyệt hay Bản nháp. Bấm **Xem** để đọc, Sửa bản nháp."],
  ['.assessment-bank[aria-label="Kho đề thi lại đầu vào"]', "Kho đề thi lại", "Kho riêng cho **thi lại đầu vào**, dùng khi Vận hành cho học viên thi lại."],
  ['[data-assessment-kind="final"]', "Đề thi tháng", "Mỗi **tháng và mức** một đề. Bấm **Xem** để đọc, Sửa đề khi còn sửa được."],
  ['.operator-assessment-form-list:not([data-assessment-kind="final"]):not(.assessment-bank)', "Phiên bản đề đã lưu", "Các phiên bản đề kèm **trạng thái**. Bấm **Xem** để mở trước đề."],
  [".card:has(.operator-results-table)", "Kết quả bài thi", "Bài học viên đã nộp của loại đề này. Bấm **Xem** để mở bài làm và **chấm**."],
  ["main .empty", "Kết quả bài thi", "Chưa có **bài nộp** của loại đề này."],
];
operatorSteps["/op/levelforms"] = operatorSteps["/op/tests"]!;

const managerSteps: Record<string, readonly GuideStep[]> = {
  "/mgr": [
    [".manager-operational-card--delete", "Yêu cầu xoá tài khoản", "Vận hành xin xoá tài khoản học viên. Bấm **Duyệt xoá** để quyết định."],
    [".manager-kpi-grid", "Ba chỉ số chính", "**Duy trì nhịp học**, hoàn thành lộ trình và hài lòng, so với ngưỡng mục tiêu."],
    [".manager-progress-card", "Danh sách đang học", "Người học xếp theo **rủi ro bỏ học**. Bấm **Hồ sơ** để xem chi tiết."],
    [".manager-progress-card-actions", "Thao tác nhanh", "**Cần nhắc** mở trang Nhắc học, **Xuất CSV** tải tiến độ tháng."],
    [".manager-progress-waiting", "Chờ xếp mức", "Người chưa có mức: **đã nộp**, đang làm hoặc chưa làm test đầu vào."],
    [".manager-progress-submitted", "Chờ duyệt mức", "Đã nộp test, chờ **Vận hành duyệt mức**."],
    [".manager-progress-testing", "Đang làm test", "Đã mở test đầu vào nhưng **chưa nộp**."],
    [".manager-progress-not-tested", "Chưa làm test", "Có tài khoản nhưng **chưa làm** test đầu vào."],
  ],
  "/mgr/ops": [
    [".manager-operators-section", "Hiệu suất vận hành", "Chọn **Tháng**. Mỗi hàng là một người vận hành; bấm **Chi tiết** để xem bài đã soạn, đã duyệt."],
  ],
  "/mgr/holidays": [
    [".manager-holiday-form", "Thêm ngày nghỉ", "Chọn ngày nghỉ riêng của tổ chức rồi bấm **Thêm ngày nghỉ**."],
    [".manager-holiday-calendar", "Lịch nghỉ lễ", "Ngày lễ Việt Nam có sẵn. Ngày nghỉ của tổ chức **xóa được**."],
  ],
  "/mgr/reminders": [
    [".manager-reminder-toolbar", "Người cần nhắc", "Số người cần nhắc hôm nay. **Gửi tất cả qua email** hoặc nhắc từng người."],
    [".manager-reminder-empty-state", "Không ai cần nhắc", "Hôm nay **không ai** vắng quá số ngày quy định."],
    [".manager-reminder-queue", "Danh sách cần nhắc", "Mỗi thẻ là một người vắng lâu, kèm **tin nhắn soạn sẵn**."],
    [".manager-reminder-card", "Lời nhắc", "**Copy tin nhắn**, gửi email hoặc Base.vn. Đã nhắc nơi khác thì bấm **Đã nhắc qua kênh khác**."],
    [".manager-reminder-history", "Lịch sử nhắc", "Mỗi lần nhắc: ngày, người học, kênh và **kết quả** gửi."],
  ],
  "/mgr/report": [
    [".report > .rhead", "Báo cáo tháng", "Bấm **In / Lưu PDF** hoặc **Copy bản chữ** để gửi báo cáo."],
    [".manager-monthly-filters", "Lọc báo cáo", "Chọn **Tháng** và **Mức** để lọc cả báo cáo."],
    ['[aria-label="Ba chỉ số của tháng"]', "Ba chỉ số", "Kết quả từng chỉ số so với **ngưỡng**: đạt hay chưa."],
    [".manager-report-learner-table-wrap, .manager-monthly-learner-list", "Từng học viên", "Điểm danh, bài học, Season và **bài thi tháng** của từng người."],
    [".manager-report-next-actions", "Việc cần làm tiếp", "Gợi ý **việc nên làm** từ số liệu tháng."],
  ],
  "/mgr/surveys": [
    [".monthly-survey-month-filter", "Tháng khảo sát", "Chọn tháng rồi bấm **Xem tháng**."],
    ['[aria-labelledby="manager-monthly-survey-editor"]', "Biểu mẫu khảo sát", "Soạn **bản nháp**, xem trước như người học thấy, rồi **Công bố khảo sát**."],
    ['[aria-labelledby="manager-monthly-survey-results"]', "Kết quả khảo sát", "**Số phản hồi** và câu trả lời của tháng đang xem."],
  ],
  "/mgr/ops/months": [
    [".monthly-month-card", "Chu kỳ tháng", "Chọn tháng cần xem. Quản lý **chỉ xem**."],
    [".monthly-topic-card", "Chủ đề tháng", "Chủ đề do Vận hành soạn, Quản lý chỉ xem. Hàng cuối để **chọn mức**."],
    [".monthly-resources", "Tài nguyên tháng", "Từ vựng, ngữ pháp, phát âm của mức này. Bấm **từng ô** để xem."],
    [".monthly-publication", "Công bố tháng", "Mức này **đã công bố** chưa, hay còn thiếu gì."],
    ["#monthly-teaching-calendar", "Lịch học", "Mỗi ô là một ngày. Bấm **Xem** để mở bài đã soạn."],
  ],
  "/mgr/requests": [
    ['nav.request-tabs[aria-label="Loại yêu cầu"]', "Loại yêu cầu", "**Yêu cầu mở khóa** từ Vận hành, **Khiếu nại** từ học viên."],
    [".manager-requests-filters", "Mục đã lưu trữ", "Bật để xem lại các mục **đã lưu trữ**."],
    [".manager-requests-card .request-table", "Danh sách yêu cầu", "Mục chờ nằm đầu. **Duyệt** hoặc **Từ chối** kèm lý do; mục xong có thể lưu trữ."],
  ],
  "/mgr/rewards": [
    [".manager-reward-controls", "Tình huống giả lập", "Chọn **Trình độ** và **Tình huống mẫu**, hoặc tùy chỉnh điểm và huy hiệu."],
    [".manager-reward-result-pane", "Học viên sẽ thấy", "Thẻ Mùa học đúng như học viên thấy. Bấm **Xem lên cấp** để xem màn chúc mừng."],
  ],
};
managerSteps["/mgr/ops/tests"] = [
  ['.operator-review-tabs[aria-label="Loại bài kiểm tra"]', "Loại đề", "Chọn **loại đề**. Quản lý chỉ xem đề và kết quả."],
  ['.tabs[aria-label="Mức đích"]', "Mức đích", "Chọn **mức học viên sẽ lên**."],
  [".assessment-bank", "Kho đề đang dùng", "Các phiên bản đề kèm **trạng thái**. Bấm **Xem** để mở."],
  ['[data-assessment-kind="final"]', "Đề thi tháng", "Mỗi **tháng và mức** một đề. Bấm **Xem** để đọc."],
  ['.operator-assessment-form-list:not([data-assessment-kind="final"]):not(.assessment-bank)', "Phiên bản đề đã lưu", "Các phiên bản đề kèm **trạng thái**. Bấm **Xem** để mở."],
  [".card:has(.operator-results-table)", "Kết quả bài thi", "Bài đã nộp kèm **tổng điểm**. Bấm **Xem** để mở bài làm."],
  ["main .empty", "Kết quả bài thi", "Chưa có **bài nộp** của loại đề này."],
];
managerSteps["/mgr/ops/level-forms"] = managerSteps["/mgr/ops/tests"]!;
managerSteps["/mgr/ops/levels"] = [
  ['[data-guide="op-pending"]', "Hồ sơ chờ duyệt", "Xem **điểm từng kỹ năng**. Vận hành là người chọn mức."],
  ['[data-guide="op-signals"]', "Tín hiệu đổi mức", "Người đủ điều kiện **thi lên mức** hoặc cần xem **hạ mức**."],
  [".operator-approved-panel", "Học viên đã duyệt", "Mức hiện tại của từng người. Bấm **Hồ sơ** để xem chi tiết."],
  ['[data-guide="op-in-progress"]', "Đang làm test", "Đã bắt đầu bài đầu vào nhưng **chưa nộp**."],
  ['[data-guide="op-retry"]', "Cần làm lại", "Cần **làm lại** bài đầu vào; Vận hành xử lý."],
  ['[data-guide="op-unassessed"]', "Chưa làm test", "Có tài khoản nhưng **chưa làm** bài đầu vào."],
];
// Quản lý › Chấm & Kháng nghị: tab là nút (không đổi URL), nên chọn theo tab đang chọn.
const MGR_TAB = (n: number) => `main:has([aria-label="Nhóm nội dung cần kiểm tra"] > [role="tab"]:nth-child(${n})[aria-selected="true"])`;
managerSteps["/mgr/ops/review"] = [
  ['[aria-label="Nhóm nội dung cần kiểm tra"]', "Ba nhóm nội dung", "Season, kháng nghị và cảnh báo bài tập. **Quản lý chỉ xem**, Vận hành xử lý."],
  [".operator-review-panel:not(:has(.operator-appeals-list))", "Phản hồi Season", "Mở từng người học để đọc **nhận xét AI**."],
  [".operator-appeals-list", "Kháng nghị", "Mở từng người học để xem lý do và **trạng thái** kháng nghị."],
  [`${MGR_TAB(3)} .operator-review-card-list`, "Câu sai cả hai lượt", "Câu học viên **sai cả hai lượt**. Bấm **Mở câu hỏi** để xem đề."],
  [`${MGR_TAB(1)} .empty, ${MGR_TAB(2)} .empty, ${MGR_TAB(3)} .empty`, "Chưa có dữ liệu", "Nhóm này **chưa có mục** nào."],
];

const guideSteps = { learner: learnerSteps, operator: operatorSteps, manager: managerSteps };

// Mỗi mục cài đặt là một bước: trên màn hẹp trỏ cả khối mục (kể cả khi đang thu gọn), trên desktop trỏ thẻ của mục.
// (.settings-panel và .settings-panel-content dùng display: contents trên desktop nên không có khung để làm nổi bật.)
function settingsStep(panel: string, title: string, text: string): GuideStep {
  return [`.settings-panel:has(> #setting-${panel}), #setting-${panel} > .card`, title, text];
}

const themeGuide = settingsStep("theme", "Giao diện theo mùa", "Chọn giao diện **theo mùa, theo lễ** hoặc Tự động, rồi **Lưu** cho cả tổ chức.");
const musicGuide = settingsStep("music", "Nhạc nền", "Bật nhạc nền, chọn bài và âm lượng. **Nghe thử** trước khi **Lưu**.");

const managerSettings: readonly GuideStep[] = [
  settingsStep("test-date", "Ngày hệ thống thử", "Ngày giả lập cho **lịch học** và điểm danh của cả tổ chức."),
  settingsStep("monthly", "Học theo tháng", "**Giới hạn chat** Season mỗi ngày; áp dụng từ tháng kế tiếp."),
  themeGuide,
  musicGuide,
  settingsStep("policy", "Nhắc học và báo cáo", "Số **ngày vắng** thì cần nhắc học, và có bật báo cáo tháng không."),
  settingsStep("arena-season", "Mùa xếp hạng", "Chọn **ngày bắt đầu** mùa xếp hạng đấu trường; mỗi mùa kéo dài 3 tháng."),
  settingsStep("accounts", "Người dùng", "Đổi **vai trò**, khoá, đặt lại hoặc xoá tài khoản; thêm người dùng ở cuối thẻ."),
];
const operatorSettings: readonly GuideStep[] = [
  themeGuide,
  musicGuide,
  settingsStep("monthly", "Học theo tháng", "**Giới hạn chat** Season mỗi ngày. Vận hành chỉ xem."),
  settingsStep("accounts", "Người dùng", "Vai trò, mức và **trạng thái** tài khoản. Vận hành chỉ xem."),
];

const monthlyLessonOperatorSteps: readonly GuideStep[] = [
  [".operator-page-title-actions", "Thao tác bài", "**Sửa tay** để chỉnh, **Duyệt bài** khi đã đúng. Bài đã duyệt cần yêu cầu mở lại để sửa."],
  [".operator-monthly-findings-dock", "Lỗi cần sửa", "Lỗi kiểm tra tự động tìm thấy. Bấm **Sửa** để mở đúng trường cần sửa."],
  [".operator-monthly-lesson", "Nội dung bài", "Bài đúng như học viên sẽ thấy. **Đọc lại** trước khi duyệt."],
];

// Trình soạn tay: ≤ 900 px mỗi mục là <details data-section>, desktop là khối data-section bọc fieldset; [data-section] khớp cả hai.
// Chỉ các mục chính; chi tiết từng trường nằm ở gợi ý dưới trường.
const lessonEditorSteps: readonly GuideStep[] = [
  ['[data-section="general"]', "Phần Chung", "**Tiêu đề** học viên sẽ thấy. **Mục tiêu**: mỗi dòng một việc học viên làm được."],
  ['[data-section="vocabulary"]', "Từ vựng của ngày", "Từ lấy theo **kế hoạch tháng**. Kiểm tra nghĩa, phiên âm và cụm từ của từng từ."],
  ['[data-section="grammar"]', "Ngữ pháp", "Giải thích, **công thức** và câu ví dụ. Công thức theo kế hoạch tháng không sửa ở đây."],
  ['[data-section="listening"]', "Các phần bài tập", "Từ **Nghe** trở xuống là bài tập: câu hỏi, lựa chọn và **đáp án đúng**."],
  ['[data-section^="review-"]', "Các phần bài ôn", "Mỗi phần là một nhóm câu. **Bản làm lại** là câu hỏi lại khi học viên sai."],
  [".operator-editor-actions", "Kiểm tra và lưu", "Bấm **Kiểm tra & lưu**. Mục còn thiếu sẽ được liệt kê để bổ sung."],
];

export function guideDefinitions(role: GuideRole, path: string) {
  if (path === "/settings" && role !== "learner") return role === "manager" ? managerSettings : operatorSettings;
  if (role === "operator" && path.startsWith("/op/months/lesson/")) return monthlyLessonOperatorSteps;
  const routes = guideSteps[role];
  return routes[path] ?? routes[`/${path.split("/")[1]}/*`];
}

/**
 * Màn tự mở hướng dẫn ở lần đầu vào (mỗi tab một lần, nhớ trong trình duyệt).
 * Trả về khoá của màn đang hiện, hoặc undefined nếu màn không tự mở.
 */
/** No screen opens its guide by itself (owner 19/11: Phản hồi & yêu cầu popped it on every visit);
 *  the guide opens only from the "?" button. */
export function guideAutoOpenKey(_role: GuideRole, _path: string, _scope: ParentNode = document): string | undefined {
  return undefined;
}

const deliveryPolicySteps: readonly GuideStep[] = [
  ["fieldset:first-of-type", "Chọn cách giao", "**Dùng nguyên một bộ**, hoặc **Trộn các bộ** (cần ít nhất hai bộ đã duyệt)."],
  ["fieldset:last-of-type", "Chọn bộ đề", "Chọn đúng **số bộ** đã chỉ định; bộ chưa duyệt không chọn được."],
  [".assessment-bank-confirm", "Áp dụng cấu hình", "Bấm **Xác nhận áp dụng**. Chỉ áp dụng cho **lượt thi mới**."],
];

export function guidePopupDefinitions(role: GuideRole, path: string, popup: HTMLElement): readonly GuideStep[] | undefined {
  if (role === "operator" && (path === "/op/tests" || path === "/op/levelforms") && popup.matches(".assessment-delivery-dialog")) return deliveryPolicySteps;
  // Chỉ popup có quy trình nhiều bước mới có hướng dẫn. Hộp thoại nhỏ, tự giải thích (mở lại bài, avatar,
  // phân bổ theo ngày, sửa tay tài nguyên tháng) không có hướng dẫn nên nút "?" không hiện trong đó.
  if (role === "operator" && (path === "/op/months" || path.startsWith("/op/months/lesson/")) && popup.matches(".operator-lesson-editor")) return lessonEditorSteps;
  return undefined;
}

/** Mọi bước đã khai báo, dùng cho kiểm tra quy tắc độ dài và cho bản PO duyệt. */
export const allGuideSteps: readonly (readonly [route: string, steps: readonly GuideStep[]])[] = [
  ...Object.entries(guideSteps).flatMap(([role, routes]) => Object.entries(routes).map(([route, steps]) => [`${role} ${route}`, steps] as const)),
  ["manager /settings", managerSettings],
  ["operator /settings", operatorSettings],
  ["operator /op/months/lesson/*", monthlyLessonOperatorSteps],
  ["operator popup lesson editor", lessonEditorSteps],
  ["operator popup assessment delivery", deliveryPolicySteps],
];
