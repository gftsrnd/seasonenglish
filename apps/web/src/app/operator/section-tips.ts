/**
 * ⓘ guidance next to operator section titles (rendered with <SectionTip>).
 * Every text is existing app copy: either the description that phones/tablets
 * no longer show as a paragraph, or the matching in-app guide step
 * (shared/app-guide-steps.ts). Keep the two in sync when the copy changes.
 */
export const OPERATOR_TIPS = {
  // Duyệt trình độ
  pending: "Mở từng hồ sơ để xem điểm 4 kỹ năng và thông tin người học, chọn Mức duyệt rồi xác nhận để xếp trình độ. Hồ sơ không có nhận xét AI: xem bài làm để quyết định.",
  signals: "Người học đủ điều kiện thi lên mức theo kết quả các tháng, hoặc sai nhiều hai tuần liền nên cần xem xét hạ mức (tính trong 14 ngày gần nhất). Bấm Hạ mức để chuyển xuống.",
  signalsReady: "Người học đủ cả 4 tín hiệu để thi lên mức. Chưa có ai đủ cả 4 tín hiệu thì danh sách trống.",
  signalsWeak: "Người học sai quá ngưỡng hai tuần liền nên cần xem xét hạ mức. Không ai sai quá ngưỡng thì danh sách trống.",
  approved: "Mức hiện tại và điểm đầu vào của từng người. Bấm Đổi level để chuyển mức, Mục tiêu để đặt mục tiêu tháng, Hồ sơ để xem chi tiết.",
  inProgress: "Người học đã bắt đầu bài đầu vào nhưng chưa nộp. Bấm Hồ sơ để xem thông tin đã điền.",
  unassessed: "Người học chưa bắt đầu bài đầu vào. Bấm Hồ sơ để xem thông tin trước khi nhắc họ làm bài.",
  retry: "Bài test cần làm lại. Học viên có thể dùng đề thi lại đã phát hành nếu Vận hành duyệt.",
  // Bài học (tháng)
  monthsPage: "Thiết kế chủ đề, tài nguyên và lịch học theo tháng.",
  cycle: "Chọn tháng cần soạn. Tháng đã qua ghi Chỉ xem và không sửa được.",
  topic: "Chủ đề chung cho mọi mức. Bấm Gợi ý AI để có bản nháp, Chốt chủ đề khi đã đúng; hàng dưới cùng để chọn mức.",
  resources: "AI chuẩn bị một bộ tài nguyên thống nhất cho cả tháng. Tạo rồi duyệt bộ từ vựng, ngữ pháp, phát âm cho mức đang chọn. Bấm từng ô để xem; Phân bổ cho biết ngày nào học gì.",
  core: "Headword đơn: mỗi mục là một từ độc lập; dùng làm từ trọng tâm của tháng.",
  sounds: "4 mục tiêu phát âm: mỗi thẻ có âm trọng tâm và các từ ví dụ ngắn để luyện tập.",
  plan: "Kế hoạch đã chốt. Đây là sơ đồ phân bổ; nội dung bài học chưa được sinh.",
  images: "Ảnh vuông 256px, không chứa chữ, theo chủ đề tháng. Sau khi chốt tài nguyên, ảnh đã có sẽ không đổi được; từ chưa có ảnh vẫn sinh hoặc tải lên được.",
  publication: "Cho biết số bài còn cần duyệt. Đủ điều kiện thì bấm Công bố tháng để học viên thấy bài theo lịch.",
  calendar: "Mỗi ô là ngày học, ngày ôn hoặc bài thi. Bấm AI để sinh bài nháp, bút chì để soạn tay, Xem để mở bài đã có.",
  lesson: "Toàn bộ phần học và bài tập của ngày. Đọc lại từng phần trước khi duyệt. Bấm Sửa tay để chỉnh, Duyệt bài khi nội dung đã đúng. Bài đã duyệt bị khóa; cần sửa thì Yêu cầu mở lại.",
  // Phản hồi
  coach: "Đọc mẫu phản hồi AI coach; kiểm tra lệch mức, lỗi hoặc khen quá tay rồi sửa prompt nếu cần. Mỗi hàng là một người học: mở hàng để đọc lượt chat và điểm Season chấm, rồi đánh dấu đã kiểm cho lượt đã xem.",
  appeals: "Xem và xử lý kháng nghị của học viên. Lọc theo trạng thái ở đầu thẻ; bấm Xử lý để đọc lý do, minh chứng và trả lời kháng nghị.",
  sent: "Theo dõi yêu cầu gửi Quản lý. Yêu cầu bạn gửi để mở lại bài, đề, tài nguyên hoặc xoá học viên; xem trạng thái và phản hồi của Quản lý ngay dưới nội dung.",
  attempts: "Theo dõi các lượt làm cần kiểm tra. Mỗi kỹ năng có tối đa 2 lượt; học viên làm sai hết lượt ở một kỹ năng sẽ hiện ở đây. Mở từng người học để xem kỹ năng đã làm đúng hoặc đã hết lượt.",
  // Kết quả bài thi
  testsPage: "Xem đề và kết quả đầu vào, bài thi tháng, đề lên mức và đề đầu ra. Các lượt làm bài kèm tổng điểm; bấm Xem để mở bài làm và chấm.",
  savedForms: "Các phiên bản đề của tab đang chọn kèm trạng thái, số kỹ năng và tổng điểm. Bấm Xem để mở trước đề như học viên thấy.",
  retake: "Một đề thi lại duy nhất, cùng cấu trúc và cách tính điểm với đề đầu vào gốc (Nghe 15 câu · Đọc 40 · Viết 2 · Nói 4); độ khó trộn A1–C1, không lặp câu của đề gốc. Học viên chỉ làm khi Vận hành duyệt thi lại.",
  levelForms: "Mỗi mức đích có một đề lên mức. Soạn tay hoặc sinh bằng AI để tạo đề theo cấu trúc 4 kỹ năng, 75 phút, 100 điểm; chỉ bản nháp hoàn chỉnh mới phát hành được.",
} as const;
