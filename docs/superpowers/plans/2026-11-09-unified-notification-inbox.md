# E4S · Kế hoạch chuông thông báo chung

> **Trạng thái 09/11/2026** · Bản đầu đã chạy tại e4s.gfts.vn. Hộp thư theo tài khoản có số chưa đọc, bộ lọc, phân trang và đánh dấu đọc. Đã nối các lần nộp chờ duyệt và chốt kết quả của bốn loại đề, khiếu nại, kháng nghị, mở lại bài/tài nguyên, báo cáo bảo mật và nhắc học đã gửi. Các điểm này dùng trigger trên chuyển trạng thái để ghi tin trong cùng giao dịch. Bản đầu nhập việc còn chờ thuộc nhóm khiếu nại, bài thi, mở lại và bảo mật.
>
> Phần tiếp theo gồm phát hành/mở quyền thi, thử thách và hiệu lực lên mức, giao bài luyện tuần, xóa tài khoản, phạm vi phát hành học liệu, Mini game và cách giao xác nhận chứng chỉ sau khi tài khoản bị khóa. Bảng bên dưới ghi phạm vi đầy đủ và các tình huống cần kiểm thử.

**Mục tiêu** · Người học, Người vận hành và Quản lý dùng cùng biểu tượng chuông để biết việc nào cần mình xử lý, kết quả nào đã có và mở đúng màn hình để xem tiếp.

**Kiến trúc đề xuất** · Một hộp thư nội bộ theo tài khoản, ghi từ các chuyển trạng thái đã lưu. Các màn nghiệp vụ tiếp tục giữ quyền, dữ liệu gốc và nút xử lý. Email, Base.vn và OTP tiếp tục theo luồng hiện có.

**Nền tảng** · PostgreSQL, Fastify, hợp đồng TypeScript dùng chung, React Router, Vitest và Chromium. Yêu cầu gốc là gom các thông báo giữa tài khoản và các vai trò vào chuông chung.

**Tóm tắt để duyệt** · Bốn đề chính thức đều có luồng riêng trong ma trận. Chuông ưu tiên việc cần người khác xử lý và kết quả đã chốt, dùng mẫu nội dung theo từng sự kiện. Hai điểm cần quyết định riêng là cách giao xác nhận chứng chỉ sau khi tài khoản bị khóa và luồng mở lại đề tháng đã phát hành, hiện chưa có endpoint xác nhận.

## Hiện trạng đã đối chiếu

| Nhóm | Hiện có | Khoảng thiếu |
| --- | --- | --- |
| Chuông | `AppShell` đã import icon `Bell`, nhưng chỉ khai báo trong danh sách icon, chưa gắn nút trong khu vực cạnh điều khiển âm thanh. Giao diện dùng chung phục vụ ba vai trò. | Thiếu nút, số chưa đọc, danh sách, liên kết và trạng thái đã đọc cho cả ba vai trò. |
| Thông báo học viên | `GET /api/v1/notifications` chỉ cho learner, đọc bảng `reminders` ghép `notification_deliveries`; Trang chủ gọi riêng và hiện tối đa 5 tin. API trả cả lịch sử gửi và không lọc trạng thái nháp/hủy. | Thiếu API inbox theo tài khoản và lọc người nhận. Lịch sử giao nhận có ý nghĩa khác trạng thái đọc. |
| Nhắc học | Quản lý bấm gửi email qua Resend hoặc gửi Base.vn đã cấu hình theo học viên. Base.vn có job/retry, email có chống gửi trùng. Copy/đã nhắc qua kênh khác chỉ ghi lịch sử. Trang chủ còn có nhắc nghỉ học tính từ số ngày. | Không có một tin nội bộ ổn định cho cùng đợt nhắc. Gộp theo người nhận và ngày hệ thống; số lần gửi và kết quả từng kênh vẫn ở lịch sử Quản lý. |
| Học liệu và mở khóa | Sửa bài đã phát hành, duyệt mở lại bài hoặc tài nguyên đã ảnh hưởng bài học, và rút tài nguyên có ghi `reminders` cho mọi learner đang hoạt động trong tổ chức. Duyệt bài mới ghi audit, chưa tạo tin. Quản lý có nhóm yêu cầu mở khóa, lịch sử và lưu trữ. | Thiếu báo cho đúng Quản lý khi có yêu cầu và đúng người gửi khi có quyết định. Tin học liệu cần giới hạn theo chương trình/mức và phạm vi bị ảnh hưởng. Hai nhóm tài khoản/đề thi trong màn Mở khóa chưa có nguồn yêu cầu tương ứng ở API. |
| Chấm, duyệt mức và khiếu nại | Lượt thi và kháng nghị đi vào hàng chờ Vận hành; khiếu nại tài khoản/điều kiện thi đi vào hàng chờ Quản lý. Kết quả đọc ở màn nghiệp vụ. Kháng nghị bài thi tự duyệt theo lịch hiện có. Khiếu nại điều kiện thi quá 24 giờ hiện có ba điểm cập nhật trong các lệnh đọc nghiệp vụ. | Thiếu tin giao việc và tin trả kết quả. Mọi nhánh nộp, quyết định và tự duyệt cần đi qua đúng một điểm phát sự kiện cho mỗi chuyển trạng thái. |
| Bảo mật | Quên mật khẩu nhân sự tạo `manager_pin_reports` cho operator đang hoạt động. Đổi PIN qua email cũng tạo báo cáo bảo mật. Quản lý xem danh sách ở Cài đặt. Tài khoản learner bị khóa mở màn riêng; phiên và OTP có luồng riêng. | Gắn báo cáo cần xử lý vào chuông Quản lý. Thông báo sau thay đổi thành công chỉ hiển thị nội dung tối thiểu cho tài khoản liên quan. |
| Phát hành và hoạt động phụ | Đề tháng có bản phát hành riêng và một cổng điều kiện thi theo từng học viên. Đề lên mức phụ thuộc mức đích và mức sẵn sàng. Bài luyện tuần, báo cáo chủ đề mini game và thách đấu có đối tượng riêng. | Có thể bổ sung tin theo các chuyển trạng thái đã xác định. Một bản đề được phát hành chưa đồng nghĩa người học đã mở được đề. |

**Điểm đọc chính** · `apps/web/src/app/shared/AppShell.tsx:60,158`, `apps/web/src/app/learner/LearnerRouteController.tsx:201`, `apps/web/src/app/learner/Home.tsx:35`, `apps/api/src/modules/notifications/routes.ts:7`, `packages/database/src/repositories.ts:9315`, `packages/database/migrations/0001_initial.sql:344`.

## Phương án và quyết định đề xuất

- **Gom các hàng đợi khi đọc** giúp dựng nhanh bản tổng hợp. Mỗi lần mở chuông phải tính lại trạng thái từ nhiều bảng, xử lý mốc thời gian và ngoại lệ đọc riêng cho mỗi vai trò.
- **Ghi tin nội bộ khi nghiệp vụ đổi trạng thái** dùng một bảng theo người nhận và một API. Dữ liệu gửi và đọc tách bạch, tải danh sách rẻ, chống trùng có thể kiểm tra ở DB. Chi phí chính là gắn đúng các điểm ghi và bảo toàn giao dịch. Chọn phương án này.
- Chuông đặt cạnh nút âm thanh trong `AppShell` cho ba vai trò, gồm cả người học đang chờ duyệt mức. Mở danh sách mới nhất, mặc định 20 tin, tải thêm theo con trỏ. Có bộ lọc **Tất cả / Chưa đọc**, badge 99+, bấm tin để đánh dấu và mở màn liên quan, cùng **Đánh dấu tất cả đã đọc**. Đọc tin chỉ thay đổi hộp thư cá nhân; trạng thái xử lý và lưu trữ nằm ở màn nghiệp vụ.
- Khi có phiên, tải số chưa đọc ngay, tải lại khi mở chuông và khi tab hiện lại, kiểm tra mỗi 30 giây khi tab hiện. Dùng bộ đếm và polling trước; chỉ đánh giá kết nối đẩy nếu có nhu cầu nhanh hơn hoặc tải thực tế cao.
- Vị trí, polling, ngưỡng 20 tin và đề xuất lịch sử 30 ngày là quyết định của kế hoạch. Nội dung được đề xuất theo ma trận dưới đây để chốt trước khi viết mã.

## Ma trận sự kiện và người nhận

| Ưu tiên | Sự kiện thực sự đã lưu | Người nhận | Mở màn |
| --- | --- | --- | --- |
| 1 | Nộp thi và lượt nộp tự động thực sự chuyển sang chờ chấm/duyệt; quyết định được công bố, duyệt mức hoặc đổi mức | Lúc nộp → Operator có quyền chấm trong tổ chức. Lúc có kết quả → đúng học viên. Gộp điểm, duyệt mức và kháng nghị nếu cùng một quyết định xử lý cả ba | Operator `/op` cho hàng chờ duyệt, `/op/tests` cho kết quả. Học viên `/profile` hoặc màn bài thi cùng loại nếu còn truy cập được |
| 1 | Kháng nghị điểm thi, phần bài học hoặc bài luyện tuần; quyết định thường hoặc tự duyệt quá hạn | Lúc gửi → Operator đúng tổ chức. Lúc chốt → đúng học viên đã gửi | `/op/review` hoặc `/op/tests`; học viên mở kết quả/điểm cùng loại |
| 1 | Khiếu nại điều kiện thi, mở khóa bài, mở khóa tài khoản, điểm danh, số bài học hoặc tài khoản. Quyết định duyệt, từ chối và tự duyệt khiếu nại điều kiện thi sau 24 giờ | Lúc gửi → Quản lý đúng tổ chức. Lúc chốt → đúng học viên | `/mgr/requests?kind=complaint`. Học viên `/monthly` hoặc `/profile` theo loại |
| 1 | Vận hành gửi yêu cầu mở lại bài ngày, ôn tuần hoặc tài nguyên tháng; Quản lý quyết định | Lúc gửi → Quản lý đúng tổ chức. Lúc chốt → Operator gửi yêu cầu | `/mgr/requests?kind=reopen`, `/op/months`. Việc lưu trữ hoặc khôi phục lịch sử không tạo tin mới |
| 1 | Vận hành yêu cầu xóa tài khoản và Quản lý quyết định | Lúc gửi → Quản lý đúng tổ chức. Lúc chốt → Operator gửi yêu cầu, kể cả khi học viên đã bị xóa quyền truy cập | Quản lý `/mgr`, Operator `/op` |
| 1 | Báo quên mật khẩu hoặc báo cáo bảo mật đủ điều kiện xử lý, xác nhận đổi PIN/mật khẩu hoặc mở lại tài khoản thành công | Báo cáo → Quản lý đúng tổ chức. Xác nhận thay đổi → chính chủ. Báo quên mật khẩu đã có một bản ghi mở thì chỉ hiện một tin | `/settings`; chính chủ `/profile` hoặc `/settings` theo vai trò |
| 1 | Quản lý thực hiện nhắc học qua email hoặc Base.vn | Đúng học viên, một tin trên ngày nghiệp vụ. Lịch sử kênh và lần thử gửi giữ riêng. Gửi lại theo kênh thứ hai, copy và ghi nhận nhắc qua kênh khác không tăng badge | `/home` |
| 1 | Giao bài luyện tuần, bài nộp thực sự cần chấm và kết quả đã công bố | Giao bài và kết quả → đúng học viên. Chờ chấm → Operator có quyền xử lý | `/practice`, `/op/review` |
| 2 | Bài mới được phát hành hoặc bài đã học được cập nhật; tài nguyên tháng bị mở lại/rút có bài thực sự bị ảnh hưởng | Học viên đang hoạt động cùng tổ chức và mức bị ảnh hưởng. Nội dung mới lấy mốc thực sự truy cập được. Bản sửa lịch sử chỉ gửi trong phạm vi người học có thể truy cập hoặc đã làm bài bị ảnh hưởng | `/monthly` hoặc `/lesson/:id` nếu còn đọc được. Các bài cùng mức phát hành hàng loạt có một tin tổng hợp theo ngày |
| 2 | Đề tháng/đề lên mức được phát hành hoặc cổng thi thực sự mở | Học viên đúng mức và chương trình. Tin phát hành chỉ nói **Đã có đề** và mở trang điều kiện. **Có thể vào thi** chỉ xuất hiện khi đã xác nhận điều kiện từng người | `/monthly`, `/profile` |
| 2 | Báo cáo chủ đề mini game đi vào hàng xử lý, giải quyết báo cáo; gửi lời mời hoặc có kết quả thách đấu | Báo cáo → Operator đúng tổ chức, kết quả → người báo. Thách đấu → đối thủ hoặc hai người tham gia khi trạng thái đã chốt | `/op` cho báo cáo, `/games` cho học viên |

Căn cứ điểm phát · `apps/api/src/modules/assessment/routes.ts:422,442,452,584,633,645,849`, `packages/database/src/repositories.ts:4127,5438,6177,6313,10317,11324,11664`, `apps/api/src/modules/manager/holiday-complaint-routes.ts:48,61,81,100,115`, `apps/api/src/modules/learning/routes.ts:497,958`, `apps/api/src/modules/engagement/routes.ts:120,182,301,320`, `packages/database/src/monthly-content-repository.ts:599,723,756,836,889,918,969,1200`, `apps/api/src/modules/assessment/monthly-final-routes.ts:228`, `apps/api/src/modules/identity/routes.ts:102,169`, `packages/database/src/repositories.ts:693`.

Các việc vốn xử lý tại chỗ tiếp tục dùng toast hoặc dòng trạng thái, gồm lưu nháp, lỗi nhập liệu, tạo tài nguyên, bật/tắt âm thanh, nhắc nghỉ học tự tính và tiến độ thi từng phần. OTP, PIN/mật khẩu, nội dung khiếu nại, khóa đáp án, webhook, log AI và ID giao nhận ngoài hệ thống nằm ngoài payload chuông. Chưa đưa thông báo hàng loạt thủ công hoặc gửi email/Base.vn tự động cho sự kiện mới vào phạm vi.

## Kiểm kê từng loại bài thi và chấm bài

Bốn loại đề dưới đây là toàn bộ loại đề chính thức hiện được route `/api/v1/assessments/:kind` hỗ trợ. Alias `monthly/final`, `levelup/level-up` và `passcourse/pass-course` phải quy về cùng mã để khử trùng. Bảng ghi **luồng có trong hệ thống** và **tin đề xuất bổ sung**. Tin của bốn loại đề hiện chưa có trong hộp thư chung.

| Loại | Điều kiện và luồng đang có | Sự kiện chuông đề xuất | Làm lại / mở lại |
| --- | --- | --- | --- |
| Đầu vào | Dùng mẫu cố định đã công bố. Học viên bắt đầu hoặc tiếp tục lượt cũ nếu còn tương thích. Operator duyệt mức, có thể trả trạng thái cần thi lại. | Khi có lượt chờ xử lý → Operator. Khi duyệt A1–C1 hoặc trả yêu cầu thi lại → học viên. Link vào Hồ sơ hoặc Đầu vào đúng trạng thái. | Đề cũ không tương thích có lỗi yêu cầu bắt đầu lại khi tiếp tục, hiển thị ngay ở màn thi. Trạng thái cần thi lại do Operator lưu là tin riêng. |
| Thi tháng | Operator phát hành theo tháng và mức. Người học chỉ vào thi đúng ngày và đủ điều kiện hiện hành. Khiếu nại điều kiện thi do Quản lý xử lý, khác kháng nghị điểm thi. | Tin theo mức **Đã phát hành đề thi tháng** mở trang điều kiện. Tin riêng **Đã mở bài thi tháng của bạn** chỉ phát khi cổng thực sự mở. Nộp/chốt điểm và kháng nghị theo luồng chung, quyết định về điều kiện thi theo luồng Quản lý. | Bản đã phát hành bị chặn sửa/sinh lại. Có kiểu `monthly_exam` trong contract nhưng chưa tìm thấy endpoint yêu cầu/mở lại đề đã phát hành. Trạng thái cần thi lại không tự mở lịch thi hoặc cấp lượt mới. |
| Lên mức | Phát hành theo mức đích. Người học phải đạt điều kiện lộ trình, không có lượt đang xử lý hoặc lịch đổi mức đang chờ. Qua bài thi mới sang thử thách Season. Khi qua thử thách, Operator duyệt, mức mới áp dụng từ thứ Hai hiệu lực. | Đã có đề đúng mức đích và đủ điều kiện của riêng người học là hai tin khác nhau. Qua bài thi → học viên **Mở thử thách**. Hoàn thành thử thách đủ điều kiện → Operator **Duyệt mức**. Chốt duyệt → học viên thấy mức và ngày hiệu lực. Mức áp dụng thật → học viên thấy **Mức mới đã có hiệu lực**. Nếu cùng lúc C1 mở Pass Course thì gộp CTA. | Có kế hoạch luyện lại và ngày sớm nhất nếu hệ thống đã tạo sau khi chưa qua bài thi. Chưa qua thử thách có hướng dẫn luyện lại; ghi ngày thi lại chỉ khi có mốc trong dữ liệu và điều kiện hiện tại cho phép. |
| Pass Course · Form A | Dùng Form A cố định. Đủ C1 và cờ sẵn sàng mới được thi. Operator duyệt đạt khi đủ 4 phần và ít nhất 85/100; lưu chứng chỉ và khóa tài khoản. Nếu yêu cầu thi lại, hệ thống đặt lại cờ sẵn sàng. | Khi mở quyền thi → học viên. Khi nộp chờ duyệt → Operator. Chưa đạt → học viên **Xem kết quả**, không hứa ngày thi lại. Cấp chứng chỉ → Operator thấy việc đã hoàn tất, người học nhận xác nhận qua phương án bảo mật cần duyệt ở dưới. | Không tìm thấy luồng tự mở lại sau khi đặt lại cờ sẵn sàng. Vẫn giữ cổng C1 và trạng thái khóa sau cấp chứng chỉ. |
| Bài ngày, ôn tuần và bài luyện tuần | Bài ngày có chấm/nhận xét tại phần học và kháng nghị. Ôn tuần dùng phiên luyện đến khi đúng, tách khỏi luồng bài ngày và cảnh báo bài tập. Bài luyện tuần có giao bài, nộp, chấm AI/chấm tay và kháng nghị. | Bài ngày báo Operator khi có kháng nghị hoặc cảnh báo thực sự cần xử lý, báo học viên khi có quyết định/điểm đã công bố. Ôn tuần báo khi lịch hoặc nội dung khả dụng thay đổi; điểm luyện hiện tại chỗ. Bài luyện tuần báo đúng người được giao, chờ chấm cần người xử lý, kết quả và quyết định kháng nghị. | Thử lại bài ngày và luyện lại trong phiên ôn là thao tác của người học, có phản hồi tại chỗ. Yêu cầu mở lại học liệu đi qua nhóm Quản lý quyết định riêng. |

**Các mốc chung của bốn đề chính thức**

- Mở trang chuẩn bị, bắt đầu, tiếp tục, lưu câu trả lời và qua từng phần dùng trạng thái tại màn thi. Khi lượt thi thực sự vào hàng xử lý, phát một tin cho Operator theo `attemptId`. Khi hết giờ hoặc đủ số vi phạm và lượt được tự nộp, người học có thêm tin xác nhận trung tính; chi tiết hiển thị trong lượt thi. Hết giờ trong một phần chưa phải tự nộp toàn bài.
- Điểm khách quan, đề xuất AI, chấm tay và chấm lại AI trước quyết định là dữ liệu nghiệp vụ của Operator. Chỉ dùng **Có kết quả** khi dữ liệu đã được phép công bố cho học viên. Nếu chấm lại thành công và hệ thống thực sự cho công bố bản mới, phát **Kết quả đã cập nhật** theo phiên bản đó; lỗi chấm hoặc điểm nháp không hiện ở chuông học viên.
- Kháng nghị điểm của cả bốn đề dùng trạng thái và điều kiện của API hiện có. Nộp → Operator; chốt riêng, chốt đồng thời với quyết định bài thi hoặc tự duyệt hết hạn → đúng học viên. Gộp cùng giao dịch quyết định bài thi. Tự duyệt kháng nghị không tự động cấp lượt thi hay thay điểm.
- Tin chứng chỉ cần chọn cách giao. Đề xuất hiển thị xác nhận tối thiểu cho đúng chủ phiên trên màn khóa hiện có, dùng đường đọc riêng chỉ thấy chứng chỉ của chính mình; nếu quyết định giữ màn khóa nguyên dạng, chọn kênh bảo mật đã được duyệt. Chuông trong `AppShell` không tiếp cận được sau khi khóa, nên phải chốt phương án này trước khi nghiệm thu Pass Course. Tuyến xử lý chứng chỉ không cấp lại quyền học hoặc thi.

Căn cứ · `apps/api/src/modules/assessment/routes.ts:44,331,345,584,633,645,659,684,849,1090,1197`, `apps/api/src/modules/assessment/monthly-final-routes.ts:253,416`, `apps/api/src/modules/coach/routes.ts:160`, `packages/database/src/repositories.ts:4749,4875,5326,5788,7017,7898,10317,12914`, `apps/api/src/modules/learning/routes.ts:442,497`, `apps/api/src/modules/learning/weekly-review-routes.ts:89`, `apps/api/src/modules/content/routes.ts:1526,1596,1604`, `apps/web/src/app/App.tsx:154`.

## Rà các luồng giữa tài khoản ngoài bài thi

Phạm vi rà là điểm ghi làm phát sinh việc của **người khác** hoặc thay đổi quyền, lịch, bài được giao hay kết quả của họ trong E4S. Mỗi nhóm dưới đây được phân loại. Nếu bổ sung tính năng nghiệp vụ sau này, thêm loại sự kiện và người nhận trước khi nối vào chuông.

| Nhóm | Luồng đang có | Thiết kế chuông |
| --- | --- | --- |
| Học viên ↔ Operator | Duyệt và thay đổi mức trực tiếp, theo lịch hoặc đề xuất hạ mức. Cập nhật mục tiêu tháng. Giao bài luyện từ Operator hoặc Quản lý. Chấm bài, xử lý kháng nghị, báo cáo chủ đề và cảnh báo bài tập. | Đúng học viên nhận mục tiêu mới, bài được giao và thay đổi mức đã quyết định. Nếu chỉ đề xuất thì ghi **Có đề xuất thay đổi mức**. Nếu theo lịch thì ghi ngày hiệu lực và chỉ báo đã áp dụng khi giao dịch áp dụng hoàn tất. Cảnh báo bài tập chỉ lên chuông khi đi vào hàng xử lý mới. |
| Học viên ↔ Quản lý | Sáu loại khiếu nại trong ma trận, gồm tài khoản, mở khóa tài khoản và bài, điều kiện thi, điểm danh, số bài. Gửi nhắc học qua email/Base.vn. | Quản lý nhận việc mới, học viên nhận quyết định cá nhân. Nhắc học đã được hệ thống tiếp nhận có một tin, dù lịch sử từng kênh ở trạng thái chờ hay thất bại. Luồng copy hoặc ghi nhận đã nhắc nằm ở lịch sử. |
| Operator ↔ Quản lý | Yêu cầu mở lại bài ngày, ôn tuần, tài nguyên tháng. Yêu cầu xóa người học. Báo quên mật khẩu nhân sự. Quyết định, đánh dấu đã xử lý, lưu trữ. | Người có quyền giải quyết nhận việc, tài khoản gửi nhận kết quả. Đọc hoặc lưu trữ hàng đợi không gửi tin. Nếu đích đã được người khác giải quyết, hiện trạng thái đã xử lý, CTA mở lịch sử. |
| Quản lý → tài khoản đích | Tạo tài khoản, đổi vai trò, khóa/mở, đặt lại thông tin đăng nhập, khôi phục hoặc xóa/ẩn danh; báo cáo PIN và quên mật khẩu nằm trong bảo mật. | Tin cho chủ tài khoản khi vai trò mới hoặc mở lại/khôi phục thực sự có hiệu lực, hay khi đổi PIN/mật khẩu hoàn tất. Khi vừa khóa/ẩn danh, giữ màn khóa và lịch sử quản trị; không dựa vào chuông để giao tin cần đọc ngay. Tạo tài khoản hiện là thao tác quản trị; nếu cần mời người chưa có phiên, phải dùng luồng mời được duyệt. |
| Học liệu và lịch chung → nhóm đúng phạm vi | Duyệt bài, phát hành/sửa/rút hoặc mở lại tài nguyên, thêm hoặc bỏ ngày nghỉ tổ chức, thay đổi lịch. | Chỉ gửi cho học viên đúng chương trình/mức và nhóm vận hành thật sự bị đổi lịch. Gom một tin trên lần phát hành theo lô. Ngày nghỉ tự động đã có trong lịch, tránh gửi lại từ mỗi lần mở trang. |
| Học viên ↔ học viên | Mời thách đấu và ghi kết quả mini game. | Mời → đối thủ. Kết quả chốt → hai người tham gia. Điểm trò chơi cá nhân, badge và phản hồi Season hiện trong trải nghiệm hiện tại; nhóm tự phát sinh này không thuộc ưu tiên giao việc giữa tài khoản. |
| Kênh ngoài E4S | Yêu cầu đổi mẫu đầu vào/đầu ra gửi email đến địa chỉ nhà phát triển, có audit; OTP qua email; cấu hình nhà cung cấp hoặc webhook. | Tiếp tục dùng trạng thái gửi ở màn thao tác và audit. Địa chỉ ngoài chưa được ánh xạ sang tài khoản E4S. OTP và dữ liệu bí mật ở kênh xác thực, không sao chép vào inbox. |
| Tác vụ quản trị hoặc thao tác cá nhân | Sửa hồ sơ/avatar, đổi chủ đề, cài âm thanh, lưu nháp, chạy thử cấu hình, kiểm tra kỹ thuật, tải báo cáo, xóa audio, khảo sát và các trạng thái thao tác. | Toast, trạng thái màn, lịch sử hoặc audit là nguồn phù hợp. Chỉ xét tin riêng khi có người nhận cụ thể và tác động nghiệp vụ đã được chốt; tránh phát mọi sự kiện kỹ thuật. |

Căn cứ thêm · `apps/api/src/modules/manager/routes.ts:125,134,219,432,452,472,514,556,665,679`, `apps/api/src/modules/manager/holiday-complaint-routes.ts:8,157,186`, `apps/api/src/modules/identity/routes.ts:102,127,169`, `apps/api/src/modules/assessment/routes.ts:298,422,434,442,452`, `apps/api/src/modules/engagement/routes.ts:301,320,357`.

## Nội dung và cách hiển thị

- Mỗi tin có **nhóm**, **tiêu đề** ngắn, **một câu mô tả**, **thời điểm**, **trạng thái** và **một CTA**. Tiêu đề tối đa khoảng 70 ký tự và mô tả khoảng 150 ký tự. Dùng tiếng Việt nhất quán, tên tháng/mức thật và mốc hiệu lực khi có. Màn chuông hiện “5 phút trước” hoặc ngày giờ theo múi giờ của E4S, với giờ đầy đủ khi đọc chi tiết.
- Chấm chưa đọc tách khỏi trạng thái nghiệp vụ. Chỉ dùng trạng thái có ý nghĩa như **Cần xử lý**, **Chờ duyệt**, **Đã giải quyết**, **Có kết quả** hoặc **Đã lên lịch**. Nhãn đang hiển thị phản ánh nguồn hiện hành; tên sự kiện lịch sử vẫn giữ nghĩa gốc. Đọc tin chỉ đổi trạng thái cá nhân.
- Khi mở chuông, tải tin mới nhất và vẫn giữ hàng cũ trong **Tất cả**. Mục **Chưa đọc** rỗng hiện “Bạn đã đọc hết thông báo”. Hộp thư chưa từng có tin hiện “Chưa có thông báo”. Lỗi mạng giữ nội dung đang có và hiện **Thử lại**. Đích đã lưu trữ mở đúng tab lịch sử nếu người nhận còn quyền; đích bị xóa hoặc hết quyền thì hiện trạng thái không khả dụng.
- Gộp hai kênh nhắc học trên cùng người/ngày, nhiều bài trong cùng lô phát hành, và một quyết định đồng thời chốt điểm/mức/kháng nghị. Các quyết định sau đó hoặc tin của hai người khác nhau giữ riêng. Mở chuông chỉ tính badge theo số tin thực tế của tài khoản, không tính số email hoặc số lần AI chấm.
- Nội dung xuất phát từ mẫu theo loại sự kiện với tham số tối thiểu. Tên hiển thị của học viên chỉ dùng trong tin người xử lý có quyền. Điểm chi tiết, lý do khiếu nại, nội dung trả lời, mật khẩu, OTP và chứng cứ nằm ở màn riêng đã phân quyền. Không đưa URL tự do hay dữ liệu nhạy cảm vào tooltip, thông báo ngoài app hoặc màn hình khóa.

| Người nhận | Tiêu đề mẫu | Mô tả mẫu | Trạng thái · CTA |
| --- | --- | --- | --- |
| Operator | Có bài đầu vào chờ duyệt | Một lượt đã nộp và đang chờ bạn kiểm tra. | Cần xử lý · Mở hàng duyệt |
| Học viên | Đã duyệt mức đầu vào B1 | Mức B1 đã được lưu vào hồ sơ học tập của bạn. | Có kết quả · Xem hồ sơ |
| Học viên | Đã phát hành đề thi tháng 11 | Đề A1 đã có. Mở Bài tháng để xem lịch và điều kiện thi. | Đã phát hành · Xem điều kiện |
| Học viên | Bài thi tháng của bạn đã mở | Bạn có thể bắt đầu trong thời gian thi của tháng 11. | Có thể vào thi · Mở bài thi |
| Học viên | Hệ thống đã nộp bài thi tháng | Lượt thi đã được ghi nhận và đang chờ xử lý. | Chờ duyệt · Xem lượt thi |
| Học viên | Đã qua bài thi lên mức B2 | Bạn có thể làm thử thách Season để hoàn tất bước tiếp theo. | Cần thực hiện · Mở thử thách |
| Học viên | Mức B2 sẽ áp dụng từ 16/11 | Yêu cầu lên mức đã được duyệt. Bạn vẫn học theo mức hiện tại đến ngày hiệu lực. | Đã lên lịch · Xem hồ sơ |
| Học viên | Bạn đã đủ điều kiện thi Pass Course | Mở trang thi để xem hướng dẫn và kiểm tra thiết bị. | Có thể vào thi · Mở Pass Course |
| Học viên chưa đạt | Có kết quả Pass Course | Lượt thi này chưa đạt. Xem kết quả và hướng dẫn tiếp theo. | Có kết quả · Xem kết quả |
| Quản lý | Có khiếu nại điều kiện thi mới | Một học viên đang chờ quyết định. Hạn xử lý hiện trong hồ sơ. | Cần xử lý · Mở khiếu nại |
| Học viên | Khiếu nại điều kiện thi đã được duyệt | Mở Bài tháng để kiểm tra điều kiện cập nhật. | Đã giải quyết · Xem điều kiện |
| Operator | Yêu cầu mở lại bài ôn đã được duyệt | Bạn có thể mở bài ôn để tiếp tục cập nhật theo quyền đã cấp. | Đã giải quyết · Mở bài ôn |
| Học viên | Bạn có bài luyện tuần mới | Bài luyện đã được giao cho tài khoản của bạn. | Được giao · Mở bài luyện |
| Quản lý | Có yêu cầu hỗ trợ đăng nhập | Một tài khoản nhân sự đang chờ Quản lý hỗ trợ. | Cần xử lý · Mở Cài đặt |
| Học viên | Nhắc bạn tiếp tục học | Quản lý đã nhắc bạn quay lại mục tiêu tuần. | Nhắc học · Về Trang chủ |

## Hợp đồng và nguyên tắc kỹ thuật

- Thêm migration kế tiếp sau khi kiểm tra số phiên bản. Bảng `inbox_notifications` có `id`, `organization_id`, `recipient_id`, `recipient_role`, `event_key`, `kind`, `target_type`, `target_id`, `created_at`, `read_at`. Dùng unique `(organization_id, recipient_id, event_key)`, index phân trang `(organization_id, recipient_id, created_at desc, id desc)` và index cùng phạm vi cho hàng chưa đọc. Nội dung hiển thị dùng mẫu theo `kind`; chỉ lưu trường tham chiếu hoặc tham số được cho phép. Khi ẩn danh/xóa tài khoản, xử lý hàng hộp thư của chính tài khoản cùng thao tác hiện có; giữ lịch sử cần thiết theo chính sách lưu dữ liệu.
- Tạo `packages/database/src/inbox-notification-repository.ts`. Các producer gọi `appendInboxEvent(client, event)` trong giao dịch chứa chuyển trạng thái, lấy danh sách người nhận từ DB với điều kiện tổ chức, vai trò, quyền hiện có và đối tượng nghiệp vụ. Khi đã có giao dịch thì dùng lại client. Với lệnh hiện ghi ngoài giao dịch, ghép mutation và insert vào giao dịch hoặc một CTE có `RETURNING` từ chuyển trạng thái. Ghi theo lô bằng `INSERT … SELECT … ON CONFLICT DO NOTHING` khi phát cho nhóm. Sự kiện không sinh sau lệnh thất bại, mở lại trang, retry cùng sự kiện hoặc replay job.
- `event_key` dùng ID nghiệp vụ và mốc, chẳng hạn `complaint:<id>:submitted`, `complaint:<id>:resolved`, `assessment:<attemptId>:submitted`, `lesson-correction:<id>:published`, `reminder:<learnerId>:<ngày nghiệp vụ>`. Kết quả cập nhật nhiều lần cần khóa phiên bản quyết định đã lưu. Tự duyệt và duyệt tay dùng cùng mốc `resolved` để chỉ một nhánh thắng.
- Tin đủ điều kiện thi dùng phép kiểm tra đúng người ở cổng nghiệp vụ hiện có. Với điều kiện tính động chưa có sự kiện lưu, lần làm mới hộp thư của người học có thể ghi một tin khi cổng lần đầu mở, dùng khóa người nhận + kỳ thi/mức đích + cửa thi để các lần polling sau không tạo lại. Phần kiểm tra chỉ đọc điều kiện, không gọi endpoint bắt đầu lượt thi. Khi mở CTA, kiểm tra cổng lại vì ngày hoặc quyền có thể đã đổi.
- Mở `GET /api/v1/me/notifications?limit=20&cursor=…&unreadOnly=true` cho cả ba vai trò. `limit=0` chỉ trả số chưa đọc, giới hạn danh sách tối đa 50, trả `items`, `unreadCount`, `nextCursor`. `PATCH /api/v1/me/notifications/read` nhận `{ ids: string[] }` tối đa 50 ID hoặc `{ all: true }`, trả số còn chưa đọc. Thao tác `all` đánh dấu các hàng nhìn thấy tại thời điểm lệnh cập nhật; tin đến sau còn chưa đọc. Gọi lặp không đổi `readAt` cũ.
- Session xác định chủ tài khoản. Mọi truy vấn lọc cả người nhận, tổ chức và vai trò hiện tại. Hàng của vai trò cũ không xuất hiện sau khi đổi quyền, kể cả khi đã có URL cũ. Tin bị thu hồi quyền xử lý hoặc bị xóa đích dẫn về trang được phép hoặc hiện **Mục này không còn khả dụng**. URL từ danh sách tuyến nội bộ, API đích vẫn kiểm tra quyền độc lập. Cache phía giao diện gắn theo phiên/tài khoản, hủy tải và xóa khi logout hoặc đổi người dùng. Màn khóa tài khoản vẫn áp dụng, kể cả trường hợp cấp chứng chỉ Pass Course làm khóa tài khoản ngay khi duyệt.
- Duy trì `GET /api/v1/notifications` cho phiên bản web cũ trong đợt chuyển tiếp. Khi chuông được bật, thay khối 5 tin cũ ở Trang chủ bằng đường dẫn mở inbox chung. Ưu tiên đưa vào các yêu cầu vẫn chờ xử lý để giao việc ngay. Nếu nhập lịch sử, chỉ nhập tin cũ xác định đã gửi trong 30 ngày với `readAt` đã có giá trị, giữ nguyên nguồn và khử trùng với producer mới. Tin cũ thiếu liên kết ngữ cảnh chỉ được mở trang tổng hợp. Bỏ qua nhắc nháp, hủy, lịch sử copy, báo cáo đã xử lý và thông tin nhạy cảm.

## Trình tự triển khai và tiêu chí qua từng bước

### 1. Hộp thư và quyền

**Tệp** · Migration mới, `packages/database/src/inbox-notification-repository.ts`, `packages/database/src/index.ts`, `packages/contracts/src/notification-contract.ts`, `apps/api/src/modules/notifications/routes.ts`, test mới `apps/api/test/inbox-notifications.integration.test.ts`.

- [ ] Viết ca test một người cho mỗi vai trò, hai người cùng tổ chức, một tổ chức khác, không có phiên và tài khoản đổi vai trò. Khẳng định không xem/đánh dấu hàng ngoài phạm vi. Kiểm tra trùng event, phân trang không bỏ sót hàng cùng timestamp, count-only, đọc lặp và tin mới đến sau thao tác đánh dấu tất cả.
- [ ] Chạy `pnpm test:db apps/api/test/inbox-notifications.integration.test.ts` trên DB cô lập để thấy các ca inbox thất bại trước triển khai.
- [ ] Tạo kho lưu và hai API với hợp đồng trên. Kiểm tra lỗi cursor/ID và cache riêng tư. Giữ kiểm thử API nhắc học cũ.
- [ ] Chạy `pnpm test:db apps/api/test/inbox-notifications.integration.test.ts apps/api/test/notifications.integration.test.ts` và `pnpm typecheck`. Cần tất cả ca liên quan đạt.

### 2. Gắn nguồn ưu tiên 1

**Tệp** · `packages/database/src/repositories.ts`, `packages/database/src/monthly-content-repository.ts`, `apps/api/src/modules/manager/holiday-complaint-routes.ts`, `apps/api/src/modules/learning/routes.ts`, `apps/api/src/modules/identity/routes.ts`. API assessment, learning và engagement chỉ sửa điểm trực tiếp nếu mutation còn nằm tại route.

- [ ] Viết ca test từ màn gửi tới đúng inbox, sau đó chốt kết quả và mở ngược về đúng tài khoản. Chạy nộp tay, hết giờ, vi phạm, chấm AI/chấm tay/chấm lại và chốt quyết định trên cả bốn loại đề. Kiểm tra đầu vào không tương thích chỉ hiện hướng dẫn tại chỗ. Kiểm tra kháng nghị chốt riêng/chốt cùng quyết định/tự duyệt, mở khóa đồng thời, xóa tài khoản, quên mật khẩu lặp và một ngày nhắc hai kênh. Thêm ca rollback, enqueue Base.vn lỗi hoặc email lỗi, dấu đã đọc không ảnh hưởng quyết định và archive.
- [ ] Chạy các ca trước tích hợp, xác nhận dữ liệu nghiệp vụ đã có nhưng inbox còn thiếu.
- [ ] Gắn các điểm ghi ưu tiên 1 theo ma trận. Gom ba lệnh tự duyệt khiếu nại điều kiện thi thành cùng một hàm, dùng ở đường đọc nghiệp vụ hiện tại và một lượt kiểm tra riêng mỗi phút theo mẫu lịch bảo trì của `apps/api/src/server.ts:71`. Lịch bảo trì chung hiện chạy mỗi 6 giờ. Lệnh cập nhật chỉ chọn hàng `pending` thực sự hết hạn, hai tiến trình chạy cùng lúc vẫn chỉ chốt một lần.
- [ ] Dùng môi trường DB tách riêng, fake sender và fake clock cho ca 24 giờ; kiểm tra log/audit không trộn với feed. Chạy lại toàn bộ ca và xác nhận hàng đợi cũ vẫn làm việc.

### 3. Chuông chung và chuyển đổi

**Tệp** · `apps/web/src/app/shared/AppShell.tsx`, `apps/web/src/app/shared/NotificationBell.tsx` mới, CSS shared, `apps/web/src/api/notifications.ts` mới, `apps/web/src/app/learner/LearnerRouteController.tsx`, `apps/web/src/app/learner/Home.tsx`, test `apps/web/src/app/shared/NotificationBell.test.tsx`.

- [ ] Viết ca test mở bằng bàn phím, Esc trả focus, màn 390 px, badge cập nhật giữa hai tab, thao tác đã đọc thất bại có thể thử lại, tin thiếu đích và đổi phiên không thấy dữ liệu cũ. Kiểm tra nội dung và CTA từ bảng mẫu, hai trạng thái trống, giờ địa phương và tin đã xử lý mở đúng lịch sử. Trong lúc thi không hiển thị pop-up tự động hoặc phát âm thanh. Nếu bấm liên kết rời bài thi, dùng cơ chế cảnh báo/rời bài đang có.
- [ ] Gắn nút và hộp thư, cập nhật count theo polling, dùng mẫu đường dẫn cho từng vai trò. Nếu màn đích chưa hỗ trợ mở đúng hàng, thêm selector/URL nội bộ cho đúng bản ghi; dùng trang tổng hợp nếu bản ghi hết quyền. Kiểm tra bằng Playwright trong Chromium cho cả desktop và mobile.
- [ ] Chạy `pnpm --filter @e4s/web test src/app/shared/NotificationBell.test.tsx`, typecheck và một kịch bản end-to-end mỗi vai trò. Kiểm tra không gửi email/Base.vn thật.
- [ ] Triển khai schema và API trước, kiểm tra theo tài khoản thử, rồi bật chuông và chuyển khối Trang chủ. Nếu cần quay lui giao diện, dùng lại Trang chủ cũ; migration bổ sung vẫn giữ được dữ liệu inbox.

### 4. Mở rộng theo phạm vi học và vận hành

**Tệp** · `packages/database/src/monthly-content-repository.ts`, `packages/database/src/repositories.ts`, `apps/api/src/modules/assessment/monthly-final-routes.ts`, `apps/api/src/modules/engagement/routes.ts`.

- [ ] Viết và chạy ca hai mức trong cùng tổ chức, tổ chức khác, bản phát hành tương lai, thi tháng có đề nhưng chưa đến ngày, lên mức chưa qua Season, duyệt mức nhưng chưa tới ngày hiệu lực, ngày thi lại chưa tới và chứng chỉ Pass Course đã khóa tài khoản. Kiểm tra sửa bài đã hoàn thành, phát hành theo lô, đổi lịch/ngày nghỉ và lời mời thách đấu. Khẳng định tiêu đề/CTA không hứa quyền chưa có, không gửi lặp khi refresh và cách giao chứng chỉ đã duyệt chỉ thấy dữ liệu của chính chủ.
- [ ] Áp dụng ma trận ưu tiên 2. Dùng điều kiện khả dụng đang có để chọn đúng người và mốc phát, cập nhật các nhắc học liệu cũ trong cùng lần cắt chuyển để tránh phát lặp.
- [ ] Kiểm tra báo cáo số lượng mỗi loại sự kiện, thử retry/khôi phục và đo tải truy vấn. Trường hợp thấy feed dày, điều chỉnh nhóm tin phát hành thay vì bỏ các quyết định cá nhân.

## Điểm cần duyệt trước khi triển khai

- Thứ tự ưu tiên đề xuất là luồng giao việc và trả kết quả giữa ba vai trò trước, học liệu và hoạt động bổ sung sau.
- Mặc định đưa việc còn chờ vào chuông, lịch sử gửi cũ chỉ nhập nếu cần tra cứu. Luồng nhắc học gộp một tin theo người học/ngày và giữ từng kênh trong lịch sử Quản lý.
- Chốt cách báo chứng chỉ Pass Course cho người đã bị khóa theo nghiệp vụ. Nhóm mở lại đề tháng chỉ nối khi có luồng nghiệp vụ thật.
- Phạm vi ban đầu là inbox trong app. Thay đổi quy tắc khóa tài khoản, điều kiện thi, luồng OTP, cấu hình nhà cung cấp và cách phát hành ngoài app cần quyết định nghiệp vụ riêng.
