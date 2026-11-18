# Nghiệm thu UI và kho đề — 4300, ngày 18/11/2026

## Phạm vi đã triển khai

Chỉ cập nhật `e4s-dev` tại 4300/4301. Không cập nhật 4175, không đồng bộ dữ liệu và không push GitHub trong đợt này. Đấu trường tiếp tục để sau.

- Avatar: bảy ảnh nhân vật Thư cung cấp, lựa chọn được lưu, hiển thị chung ở header/Hồ sơ. Sửa tràn nhãn và khung xem trước bị kéo thành elip.
- Đề dài, Writing, popup, Crossword, thẻ Chờ duyệt: sửa thành phần chung và các màn liên quan. Bỏ hai form yêu cầu đổi đề dành cho phát triển; giữ lịch sử cũ. Bổ sung hướng dẫn các tab phản hồi/yêu cầu và kho đề.
- Nút hướng dẫn popup nằm ngay trái nút đóng; hướng dẫn toàn trang nằm ở header. Tách header avatar khỏi quy tắc giãn tiêu đề popup.
- Chứng nhận đầy đủ và bản in dùng lại mẫu Manager: bốn ô thông tin, huy hiệu bốn hàng/hai cột, chữ ký. Bản chưa cấp hiển thị tiến độ thực, nhãn Bản xem trước và Chưa cấp. Điện thoại có bản tóm tắt và nút mở giao diện in/PDF của trình duyệt.
- Kho đề đầu vào, thi lại, lên mức và đầu ra: tạo tay/AI, sửa bản nháp, kiểm tra, duyệt, lưu trữ. Ba bộ là mục tiêu ban đầu, không phải giới hạn. Đề legacy thay được. Đề tháng giữ một bộ, không trộn/xáo.
- Popup giao đề chọn một bộ hoặc chọn số lượng và những bộ tương thích để trộn; xác nhận chỉ áp dụng cho lượt thi mới. Không dùng công tắc random.
- Lượt thi lưu nguồn phiên bản bất biến và thứ tự đã giao. Audio nguồn và bản ghi được giữ theo tham chiếu; lưu trữ đề không phá kết quả. Không đặt hạn lưu hai năm. Giữ thứ tự khi câu/đáp án có phụ thuộc vị trí; từ chối trộn tham chiếu chéo phần không bảo đảm.
- Audio: nhận diện người nói, giữ giọng nhất quán theo lượt, tránh dùng lại cache hội thoại một giọng. Chia đoạn dài thành các phần tối đa 500 ký tự, ghép đúng thứ tự và giữ giọng để tránh hết thời gian Edge TTS.

## Bằng chứng kiểm tra

- `pnpm typecheck` và `pnpm build`: đạt sau thay đổi cuối cùng.
- Đợt kiểm thử tập trung trước nghiệm thu: **184/184** đạt. Đợt cuối sau sửa avatar, chứng nhận và an toàn trộn: **89/89** đạt. Kiểm thử audio/chia đoạn riêng: **16/16** đạt.
- Không tuyên bố toàn bộ test dự án xanh. Full suite có các lỗi cũ tái hiện tại baseline `971fa49`: baseline 180 lỗi; lượt sửa 178 lỗi. Ba tên test mới từng khác baseline đã được sửa. Hai test Manager PIN trong lần chạy rộng cuối cũng lỗi tại baseline, không liên quan mẫu chứng nhận.
- Trình duyệt thực trên 4300: popup trộn ở 375/440/768/1440px không tràn ngang, cách mép tối thiểu 16px trên điện thoại, nút hướng dẫn ngay trái Đóng. Header hướng dẫn ở trang review được kiểm tra.
- Avatar tái hiện trước sửa: desktop rộng 201.55px, cao 64px (`flex: 1 1 auto`). Sau sửa: 1440px = 64×64, 375/440px = 40×40, 768px = 48×48; không tràn ngang.
- Chứng nhận từ tài khoản QA thật: bản desktop và điện thoại, nút gọi `window.print`, PDF dùng CSS in có bốn hàng/hai cột huy hiệu. Kiểm thử fixture riêng của learner/Manager xác nhận mỗi bản một trang A4 ngang.
- Luồng kho đề thật: tạo hai bộ QA, duyệt, chọn trộn, bắt đầu đồng thời/tiếp tục giữ nguyên đề, không lộ đáp án; làm 55 câu khách quan, lưu Writing và bốn bản WAV kiểm thử Speaking, nộp và mở review. Listening 20/20, Reading 40/40. WAV là dữ liệu kiểm thử, không phải ghi âm người thật.
- Sinh AI thật: tạo đủ Listening/Reading/Writing/Speaking và đúng số câu. Đoạn LA dài bị timeout được tái hiện ở lời gọi Edge 65 giây; một đoạn ngắn cùng giọng thành công. Sau chia đoạn, API sinh lại trả **200**, lưu audio thành công và kiểm tra đề trả **0 lỗi**. Bộ QA được lưu trữ, chính sách giao đề gốc được khôi phục.
- Backup riêng 4300 gồm PostgreSQL và object storage, có SHA256. Phục hồi DB vào DB kiểm thử riêng đạt; object archive kiểm tra giải nén danh mục đạt (1400 mục). Chưa thực hiện một lần phục hồi MinIO qua API đầy đủ.
- 4175 vẫn đúng container IDs/thời điểm khởi động trước đợt sửa: web `2f6fc7c747a1`, API `6d2bec05d432`, cùng bắt đầu lúc `2026-11-18T06:06:16Z`.

## Ảnh và nhật ký nội bộ

Ảnh thực tế (trong thư mục `.tmp` riêng, không đưa vào giao diện sản phẩm):

- `.tmp/nov18-avatar-shape/avatar-{375,440,768,1440}.png`
- `.tmp/nov18-avatar-shape/result.json`
- `.tmp/nov18-live-ui/certificate-{375,440,1440}.png`
- `.tmp/certificate-manager-template-live/learner-native-preview.pdf`
- `.tmp/nov18-live-ui/mix-help-{375,440,768,1440}.png`
- `.tmp/nov18-live-4300/evidence.json`
- `.tmp/nov18-ai-audio-recovery.json`

Các ảnh đối chiếu learner/Manager trong `.tmp/certificate-manager-template-after/` dùng fixture kiểm thử, phân biệt với ảnh thực tế 4300 ở trên. Bản backup chứa dữ liệu riêng tư, không đưa lên GitHub.

## Bổ sung nghiệm thu giao diện kho đề

- Danh sách đề đầu vào, thi lại, lên mức và đầu ra dùng cùng bố cục phiên bản đã lưu như thi tháng. Nút nhỏ hiện trực tiếp; Cách giao đề nằm trong thanh công cụ. Màn Xem dùng chung thành phần tổng quan/cấu trúc/quy tắc/bốn phần thi với thi tháng; màn soạn vẫn tách riêng.
- Tháng lấy từ metadata chuẩn, tăng dần theo tháng/năm. Kháng nghị gom trong một thẻ; các thanh tab chia đều chiều rộng ở ba vai trò. Sửa grid của backdrop gây modal desktop co như điện thoại.
- Migration 0127 cho phép xoá đề đã lưu trữ chưa sử dụng, có xác nhận. Đề được lượt thi hoặc chính sách tham chiếu vẫn được bảo vệ. Kiểm thử thực tạo riêng bản QA, huỷ xoá giữ nguyên và xác nhận xoá trả 404 khi đọc lại; không xoá nguồn đã có lịch sử.
- Đợt tập trung trước nhãn trạng thái: 73/73 UI, 8/8 API. Sau nhãn trạng thái: 20/20 AssessmentBank; kiểm tra cả bộ đã duyệt chưa chọn và hai nguồn đang trộn sau khi lưu chính sách. Typecheck và build đạt.
- Nhãn đặt cạnh tên: Đang dùng xanh, Bản nháp vàng nhạt, Đã lưu trữ xám, Đã duyệt xanh lam nhạt. Chỉ trạng thái published và có trong policy.versionIds mới được gắn Đang dùng; không đổi nền cả thẻ.
- Đối chiếu trình duyệt danh sách với thi tháng: 8 trường hợp ở 1440/375px đạt; nền thẻ, nền hàng và bo góc trùng mẫu. Bằng chứng: `.tmp/nov18-monthly-bank-style/evidence.json`. Kiểm tra độc lập trước đó ở ba vai trò: 54 trường hợp đạt; B2/C1 không có nguồn được ghi rõ bỏ qua.
- Nhật ký mới: `.tmp/nov18-bank-state-green.log`, `.tmp/nov18-bank-state-typecheck.log`, `.tmp/nov18-bank-state-build.log`, `.tmp/nov18-bank-state-deploy.log`. Chỉ rebuild/recreate web của e4s-dev cho thay đổi nhãn cuối; container web/API 4175 vẫn nguyên ID và thời điểm khởi động đã ghi ở trên.
- Agent kiểm tra nhãn trực tiếp 4300: 10 trường hợp đạt ở 1440/375px, khớp API và cấu hình giao đề, không tràn ngang. Nguồn đã duyệt chưa chọn không có dữ liệu thực nên được kiểm tra bằng unit test. Ảnh thật: `.tmp/nov18-bank-badges-final/placement-archives-{1440,375}.png` và `promotion-draft-375.png`. Không sửa dữ liệu trong lần chụp này.
- Theo yêu cầu xác minh lại, chạy thật hai tài khoản học viên mới với hai bộ QA có dấu nguồn khác nhau trong nội dung từng câu. Cả hai lượt nhận nội dung từ đủ hai nguồn và khớp manifest lưu trong DB; hai manifest khác nhau. Gọi start lại và tải lại trình duyệt giữ nguyên toàn bộ definition, không lộ correctAnswer. Khôi phục chính sách gốc ngay sau khi bắt đầu hai lượt; lưu trữ hai nguồn QA vẫn giữ nguyên cả hai đề đang làm. Bằng chứng `.tmp/nov18-mix-recheck/evidence.json`, log `.tmp/nov18-mix-recheck.log`. Chỉ 4300; không đổi mã ứng dụng trong lần kiểm tra này.
- Trước commit/push theo yêu cầu: chạy mới 13 file kiểm thử liên quan, **169/169 đạt**, cùng typecheck/build đạt; nhật ký riêng `.tmp/nov18-handoff-focused.log`, `.tmp/nov18-handoff-typecheck.log`, `.tmp/nov18-handoff-build.log`. Bảng bàn giao tóm gọn ở `docs/qa/2026-11-18-handoff.md`.
