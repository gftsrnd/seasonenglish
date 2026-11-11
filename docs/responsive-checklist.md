# Checklist responsive E4S

Mốc tổng hợp ngày 11/11/2026. Một dòng là một màn hoặc một luồng giao diện. Các tab con, popup và trạng thái có điều kiện được ghi trong cùng dòng khi thuộc một luồng. Các URL tương đương chỉ đếm một lần. Đây là phạm vi rà giao diện, còn kết quả kiểm thử nghiệp vụ được theo dõi riêng.

| Khu vực | Tổng | Đã rà | Rà một phần | Chưa rà |
| --- | ---: | ---: | ---: | ---: |
| Đăng nhập và tài khoản | 7 | 5 | 0 | 2 |
| Người học | 17 | 4 | 12 | 1 |
| Vận hành | 10 | 0 | 9 | 1 |
| Quản lý | 12 | 0 | 10 | 2 |
| Dùng chung | 5 | 0 | 5 | 0 |
| **Tổng** | **51** | **9** | **36** | **6** |

- **Đã rà** có bằng chứng trên điện thoại và tablet cho phạm vi ghi trong dòng. Bỏ qua khi chọn lượt tiếp theo. Chỉ mở lại phần bị ảnh hưởng khi có lỗi mới hoặc khi thành phần dùng chung vừa đổi.
- **Rà một phần** có ảnh, phản hồi hoặc phép đo trước đó. Chỉ chạy trạng thái còn thiếu trong dòng.
- **Chưa rà** chưa có bằng chứng responsive đủ rõ. Bắt đầu bằng dữ liệu thật của E4S hoặc dữ liệu kiểm thử do hệ thống tạo trong môi trường cách ly. Với đề thi, đối chiếu tên và phiên bản trước khi mở ca kiểm.
- Khi hoàn tất một lượt, cập nhật dòng với ngày, bản chạy, thiết bị, thao tác thực hiện, kết quả và ảnh hoặc phép đo. Đối chiếu thứ tự với desktop, kiểm nội dung và nút quan trọng trong vùng nhìn thấy, chữ tràn/đè, cuộn ngang và khả năng bấm. Với màn có hướng dẫn, mở hướng dẫn trong cùng lượt rà và kiểm cả vị trí khung, vùng làm nổi bật, nút điều hướng và các bước chỉ xuất hiện khi mở form hoặc chi tiết. Nếu nội dung dài, ghi lại phần nào cần ưu tiên và phần nào có thể mở thêm.

**Lượt rà sau khi đổi header trên bản cách ly 4298** HV-11 → VH-06 → HV-01 → HV-04 → HV-07 → VH-02 → QL-04 → QL-08. Kết quả Responsively và hướng dẫn dùng chung mã ở bảng này. Kiểm hướng dẫn từ đầu đến nút Đã hiểu bằng chính các nút của hướng dẫn.

**Bằng chứng** [Ảnh Responsively ngày 11/11](<C:/Users/TT5.01 AI UD/AppData/Local/E4S/captures/2026-11-11-responsively-mcp>) · [Audit theo kích thước](../.artifacts/expanded-role-audit/responsive-contrast-coverage.md). Audit trước ghi 30 giao diện × 5 độ rộng. Bảng bên dưới mở rộng phạm vi theo vai trò và trạng thái cần kiểm, nên số đếm dùng đơn vị của checklist này.

## Tiếp tục rà bằng Responsively

1. Mở bản local chính tại `http://127.0.0.1:4175` để xem giao diện hiện có. Dùng bản cách ly và tài khoản QA cho ca cần thay đổi dữ liệu, đổi ngày thi hoặc tạo trạng thái đặc biệt. Cổng 4296 và 4298 là các bản đã dùng cho lượt kiểm trước.
2. Trong phiên có MCP Responsively, dùng `list_devices` và `set_active_devices` để mở iPhone 12 Pro (390 × 844), iPad (768 × 1024) và MacBook Pro (1440 × 900). Thêm 320 × 568 cho các ca hẹp. Cấu hình Codex trên máy này trỏ tới `http://127.0.0.1:12720/mcp`. Bản mã nguồn Responsively nằm dưới `%LOCALAPPDATA%\E4S\Tools\responsively-app`.
3. Dùng `navigate`, `read_page`, `click` và `type_text` để mở và thao tác đúng trạng thái. Chụp bằng `screenshot` sau bước cần chứng minh. Khi rà cùng người dùng, giữ cửa sổ mở và hiển thị trực tiếp thao tác trên từng màn. Dùng Playwright để đo lại các điểm như tràn ngang, vùng chạm và vị trí phần bị che.
4. Ghi cả kết quả giao diện và hướng dẫn vào cùng mã. Với màn có Guide, mở từ dấu hỏi và đi bằng **Trước / Tiếp theo / Đã hiểu**. Kiểm đúng đối tượng, thứ tự thao tác, khả năng đọc và các form hoặc popup chỉ hiện có điều kiện. Luồng làm bài thi chỉ kiểm giao diện và thao tác của bài thi.

Các ca ưu tiên tiếp theo gồm lịch B1 bị trùng số bài, ô nhập ngày nghỉ bị cắt năm ở 320 px và form soạn tay B1 với kế hoạch cũ. Sau đó mở các ca chưa rà và bổ sung bằng chứng cho các trạng thái còn thiếu trong từng dòng. Ảnh và log dẫn tới `.artifacts` nằm trên máy kiểm thử. Xem [cách chạy kiểm thử đa trình duyệt](../scripts/browser-smoke/README.md) để kiểm màn đăng nhập trên Chrome, Edge, Firefox và WebKit.

### Kiểm thử khi bàn giao

- `pnpm typecheck` và `pnpm build` đạt. Bộ kiểm đăng nhập trên bản 4175 đạt 12/12 ca ở 390, 768 và 1440 px. Kết quả WebKit là từ Playwright trên Windows.
- Bộ kiểm web theo phạm vi thay đổi đạt 250/265. Guide đạt 19/19. Còn 12 ca ở điều hướng Vận hành, 2 ca ở Review và 1 ca ở bố cục tablet Vận hành. Cần chạy lại trên mốc trước thay đổi để xác định ca nào là hồi quy.
- Bốn bộ tích hợp cho chấm bài, học khi tắt AI và Season đạt 27/27 trên PostgreSQL Docker cách ly. Trình chạy PostgreSQL nhúng của workspace thiếu gói Windows.

## Lượt kiểm trên bản cách ly 4296

Responsively App ngày 11/11 trên iPhone 12 Pro 390×844, iPad 768×1024 và MacBook Pro 1440×900. Thao tác trực tiếp bằng tài khoản QA A2. Tiền tố ảnh trong thư mục bằng chứng ở trên khớp tên màn bên dưới.

| Mã | Thao tác và kết quả | Ảnh |
| --- | --- | --- |
| HV-01 | Trang chủ khi lộ trình chưa công bố. Mở và hoàn tất cả ba bước hướng dẫn đến Season, Bài tháng và Hồ sơ. | qa-home-guide |
| HV-03 | Season khi AI chưa khả dụng. Mở và hoàn tất sáu bước, kiểm đúng vùng chọn phong cách, tự mở nhận xét, giới hạn, phát lại và nhập. Còn chat dài và chấm thực tế. | qa-coach-guide |
| HV-04 | Mini game khi chưa có bộ từ và AI chưa khả dụng. Nút Về Trang chủ được làm nổi bật. Đã báo nội dung hướng dẫn cần dựa trên việc đã có bài công bố hay chưa. | qa-games-guide |
| HV-06 | Mở và hoàn tất năm bước hướng dẫn Hồ sơ, từ xem hồ sơ đến chứng nhận huy hiệu. | qa-profile-guide |
| HV-12 | Trên iPhone, nút cuộn nhanh từng che góc nút Gửi phản hồi. Đã đưa nút cuộn xuống vùng riêng và thử bấm cuộn cuối rồi cuộn đầu. | qa-survey-docked-bottom |
| CH-01, CH-03 | Thanh công cụ Trang chủ đã đối chiếu trên cả ba thiết bị. Đóng hộp thông báo trên iPhone giữ nguyên tab Khảo sát và mở lại được hướng dẫn. | qa-toolbar-final, qa-survey-inbox-updated |

### Trang chủ B1 và Mini game có từ đã học

| Mã | Thao tác và kết quả | Ảnh |
| --- | --- | --- |
| HV-01 | B1 có lộ trình tháng. Hoàn tất hướng dẫn 5 bước trên cả ba cỡ. Đã kiểm Điểm huy hiệu và dòng Vắng 7/6. Trên iPhone, nút cuộn nhanh ở góc phải và hai mũi tên đổi tuần nằm hai bên ngày, bấm được tuần kế tiếp. Cuộn đến cuối trên iPhone và iPad vẫn thấy đầy đủ thẻ Hồ sơ rồi quay lại đầu. | qa-b1-home-guide, qa-b1-home-full-height-top, qa-b1-home-final-bottom |
| HV-04 | Bộ từ đã học có 8 từ và 6 trò sẵn sàng. Mở đủ 3 bước hướng dẫn và tìm thấy nút Cập nhật bộ từ đã học trên cả ba cỡ. | qa-b1-games-guide, qa-b1-learned-update |
| CH-04 | Thanh theo mùa desktop liền với hàng thương hiệu. Hai phần cùng cao 62 px, đã đo tại 961, 1280, 1440 và 1920 px. Chuông, trợ giúp và avatar nằm bên phải, bỏ khung trắng. Mở menu avatar trên cả ba cỡ, thấy tên cùng mức B1, âm thanh và nhạc ở hàng tiếp theo, rồi đến Đăng xuất. Desktop có thêm nút Đăng xuất cuối sidebar. | qa-b1-header-no-boxes, qa-b1-header-no-boxes-menu-macbook-pro, qa-b1-slim-avatar-menu |

## Rà lại giao diện trên bản cách ly 4298

Chrome độc lập ở 390×844, 768×1024 và 1440×900. Các ca có thêm 320×568 ghi rõ trong từng dòng. Mỗi dòng đối chiếu cùng mã với bảng Hướng dẫn ở cuối. **Đã rà lại 14 màn hoặc luồng**. Còn lỗi hiển thị số bài trong HV-01 và ô nhập ngày ở 320 px trong QL-06.

| Mã | Trạng thái và kết quả giao diện | Bằng chứng |
| --- | --- | --- |
| HV-11 | Đạt với kháng nghị còn hạn. Mở form, chọn B1, nhập lý do đủ dài và hủy, không gửi. Hai nút luôn cùng hàng, cao 44 px trên điện thoại và 40 px trên tablet/desktop. Không cuộn ngang trang. Hướng dẫn đúng hai bước, kết thúc rồi hủy được. Còn trạng thái đã gửi và đã phản hồi. | [390 px](../.artifacts/responsive-live-audit/HV-11-eligible-390.png) · [768 px](../.artifacts/responsive-live-audit/HV-11-eligible-768.png) · [1440 px](../.artifacts/responsive-live-audit/HV-11-eligible-1440.png) |
| VH-06 | Đạt với yêu cầu mở lại tài nguyên đang chờ. Tên, lý do, trạng thái và thời gian đều hiện. Bốn tab Vận hành cùng một hàng và chuyển đủ bốn mục ở 320/390/768/1440 px. Điện thoại dùng nhãn gọn và nút 44 px; tablet và desktop hiện nhãn đầy đủ. Còn kiểm mục đã xử lý. | [320 px](../.artifacts/responsive-live-audit/compact-operator-320.png) · [390 px](../.artifacts/responsive-live-audit/compact-operator-390.png) · [768 px](../.artifacts/responsive-live-audit/compact-operator-768.png) · [1440 px](../.artifacts/responsive-live-audit/compact-operator-1440.png) |
| VH-07 | Đạt về bố cục trạng thái rỗng ở 320/390/768/1440 px. Thông báo nêu rõ chưa có câu sai cả hai lượt và không có cuộn ngang. Bản cách ly chưa có lượt sai đủ điều kiện, nên chưa kiểm được chi tiết hay thao tác hiệu chỉnh câu. | [320 px](../.artifacts/responsive-live-audit/VH-07-attempts-320.png) · [390 px](../.artifacts/responsive-live-audit/VH-07-attempts-390.png) · [768 px](../.artifacts/responsive-live-audit/VH-07-attempts-768.png) · [1440 px](../.artifacts/responsive-live-audit/VH-07-attempts-1440.png) |
| HV-01 | Đạt về bố cục và nút đổi tuần. Lịch tuần ở 390 px và lịch tháng ở 768/1440 px, không có cuộn ngang. Điểm huy hiệu và Vắng 7/6 có mặt ở cả ba cỡ. **Lỗi số bài với kế hoạch cũ/thiếu dữ liệu** Ngày 09 và 10 cùng hiện Bài 2, dù dữ liệu ghi bài 1 và 2. | [Ảnh tuần kế tiếp](../.artifacts/responsive-live-audit/HV-01-B1-calendar-390.png) |
| HV-04 | Đạt với bộ từ B1 đã lưu. Điện thoại và tablet mở mục Bộ từ đang chơi, thấy nút Cập nhật bộ từ đã học cao 44 px. Desktop hiện nút sẵn. Cả ba cỡ đều có sáu trò, không cuộn ngang. | [390 px](../.artifacts/responsive-live-audit/HV-04-B1-expanded-390.png) · [768 px](../.artifacts/responsive-live-audit/HV-04-B1-expanded-768.png) · [1440 px](../.artifacts/responsive-live-audit/HV-04-B1-expanded-1440.png) |
| HV-05 | Bắt đầu cả sáu trò với bộ từ B1 ở 320/390/768/1440 px. Ô chữ từng bị cắt thanh điều khiển và lưới trên điện thoại. Đã thử lại sau sửa, chọn gợi ý dọc và nhập một chữ vào ô tương ứng trên bốn cỡ. Lưới rộng bằng vùng hiển thị, không cần vuốt ngang. Ở 320 px, ô lưới khoảng 18 px trong bộ kiểm, nên người dùng có thể bấm hàng gợi ý cao tối thiểu 44 px để vào đúng từ. Gợi ý Ngang/Dọc dùng chung một khung, số thứ tự và số chữ thẳng hàng, chỉ tô màu hàng đang chọn. Đã đo vùng chạm tối thiểu 44 px và thử bấm gợi ý, nhập chữ trên bốn cỡ. [Ảnh danh sách ở 390 px](../.artifacts/responsive-live-audit/HV-05-goi-y-390.png). Còn kiểm kết thúc, lưu kết quả và bàn phím thật trên iOS. | [320 px](../.artifacts/responsive-live-audit/HV-05-ô-chữ-320.png) · [390 px](../.artifacts/responsive-live-audit/HV-05-ô-chữ-390.png) · [768 px](../.artifacts/responsive-live-audit/HV-05-ô-chữ-768.png) · [1440 px](../.artifacts/responsive-live-audit/HV-05-ô-chữ-1440.png) |
| HV-07 | Đạt khi mở Đổi avatar từ thẻ hồ sơ. Hộp thoại trên màn 320/390 px là 300×400 và 350×392 px, trên tablet và desktop là 420×433 và 520×495 px. Các ô chọn ít nhất 44×44 px. Chọn biểu tượng, xem trạng thái chọn rồi hủy ở cả bốn cỡ. | [320 px](../.artifacts/responsive-live-audit/compact-avatar-320.png) · [390 px](../.artifacts/responsive-live-audit/compact-avatar-390.png) · [768 px](../.artifacts/responsive-live-audit/compact-avatar-768.png) · [1440 px](../.artifacts/responsive-live-audit/compact-avatar-1440.png) |
| VH-02 | Đạt khi chuyển A1 → B1 và mở/đóng bảng Từ cốt lõi trên ba cỡ. Lịch không kéo ngang. Dữ liệu B1 dùng để kiểm giao diện lịch, tài nguyên trong ca này chưa có từ cốt lõi. Còn kiểm tài nguyên nhiều mục, sinh đang chạy và lỗi. | [390 px](../.artifacts/responsive-live-audit/VH-02-B1-calendar-390.png) · [768 px](../.artifacts/responsive-live-audit/VH-02-B1-calendar-768.png) · [1440 px](../.artifacts/responsive-live-audit/VH-02-B1-calendar-1440.png) |
| QL-04 | Đạt với khảo sát tháng 11 đã công bố. Bấm mở/đóng xem trước và mở trình sửa từ Tạo phiên bản mới, không lưu. Trường Tiêu đề cao 44 px ở cả ba cỡ và trang không kéo ngang. Còn kiểm sửa nhiều câu, phát hành và lịch sử. | [390 px](../.artifacts/responsive-live-audit/QL-04-editor-390.png) · [768 px](../.artifacts/responsive-live-audit/QL-04-editor-768.png) · [1440 px](../.artifacts/responsive-live-audit/QL-04-editor-1440.png) |
| QL-06 | 13 ngày lễ trong một danh sách cuộn ở 320/390/768/1440 px. Đã cuộn đến mục cuối và chuyển bộ lọc về đầu danh sách. Không có cuộn ngang. Ở 320 px, ô ngày cắt phần năm của định dạng nhập mặc định của Chrome. Chưa kiểm xác nhận xóa vì bản cách ly chưa có ngày nghỉ công ty. | [Ô ngày ở 320 px](../.artifacts/responsive-live-audit/QL-06-holidays-top-320.png) · [Cuối danh sách ở 320 px](../.artifacts/responsive-live-audit/QL-06-holidays-scroll-320.png) · [390 px](../.artifacts/responsive-live-audit/QL-06-holidays-scroll-390.png) · [768 px](../.artifacts/responsive-live-audit/QL-06-holidays-scroll-768.png) · [1440 px](../.artifacts/responsive-live-audit/QL-06-holidays-scroll-1440.png) |
| QL-08 | Đạt với yêu cầu mở lại tài nguyên B1 đang chờ. Hộp nêu số bài đã có nội dung, tổng bài bị xóa khỏi lịch và tài nguyên về bản nháp. Ở 390 px, chiều cao từ 329 xuống 308 px. Bấm Hủy ở 320/390/768/1440 px, yêu cầu vẫn chờ. Còn kiểm lịch sử nhiều dòng và lưu trữ. | [320 px](../.artifacts/responsive-live-audit/QL-08-reopen-confirm-320.png) · [390 px](../.artifacts/responsive-live-audit/QL-08-reopen-confirm-390.png) · [768 px](../.artifacts/responsive-live-audit/QL-08-reopen-confirm-768.png) · [1440 px](../.artifacts/responsive-live-audit/QL-08-reopen-confirm-1440.png) |
| HV-08 | Đạt với sửa hồ sơ B1 hiện có. Điện thoại và tablet mở bốn nhóm thông tin, desktop hiện các mục theo bố cục rộng. Nhập email sai rồi rời ô, thấy báo lỗi ở cả ba cỡ. Còn hồ sơ mới và lưu bản hợp lệ. | [390 px](../.artifacts/responsive-live-audit/HV-08-invalid-email-390.png) · [768 px](../.artifacts/responsive-live-audit/HV-08-invalid-email-768.png) · [1440 px](../.artifacts/responsive-live-audit/HV-08-invalid-email-1440.png) |
| HV-09 | Đã mở bài B1 số 1 và số 2. Hoàn thành hướng dẫn phần Học và bấm sang Luyện tập của bài 1 ở 320/390/768/1440 px. Hai tab trước đây tràn 11 px ở cỡ 320 px, nay chiều rộng nội dung và vùng hiển thị đều là 266 px. Hai tab rộng 128 px mỗi nút. Còn trạng thái chưa hoàn thành bài tập và báo lỗi trong bài. | [320 px](../.artifacts/responsive-live-audit/HV-09-practice-320.png) · [390 px](../.artifacts/responsive-live-audit/HV-09-practice-390.png) · [768 px](../.artifacts/responsive-live-audit/HV-09-practice-768.png) · [1440 px](../.artifacts/responsive-live-audit/HV-09-practice-1440.png) |
| VH-03 | Đã vào chi tiết bài B1 đã duyệt từ lịch. Mở được nội dung và danh sách từ. Đã mở và đóng hộp yêu cầu mở lại ở 320/390/768/1440 px, không gửi yêu cầu và không tràn ngang trang. Đã mở và đóng màn soạn tay bài 8 B1 trên bốn cỡ, không tràn ngang. Bản kế hoạch cũ thiếu phân bổ bài tập đã có kiểm thử hồi quy. Form 88 ô nhập, dài 4.727 px ở 1440 px và 7.024 px ở 390 px. Cần rà cách điền và lưu trên màn nhỏ, cùng màn soạn bài ôn. | [320 px](../.artifacts/responsive-live-audit/VH-03-B1-reopen-320.png) · [390 px](../.artifacts/responsive-live-audit/VH-03-B1-reopen-390.png) · [768 px](../.artifacts/responsive-live-audit/VH-03-B1-reopen-768.png) · [1440 px](../.artifacts/responsive-live-audit/VH-03-B1-reopen-1440.png) |

## Đăng nhập và tài khoản

| Mã | Màn hoặc luồng | Trạng thái | Đã thấy hoặc còn cần kiểm |
| --- | --- | --- | --- |
| TK-01 | Đăng nhập Người học | Đã rà | Trang chính thật, form sáu ô PIN và nút hiện mã. |
| TK-02 | Đăng nhập Nhân sự | Đã rà | Đường dẫn riêng `/season-english/staff` đã kiểm. Giữ mốc này cho giao diện form. |
| TK-03 | Đăng ký Người học | Đã rà | Form thật trên iPhone và iPad. |
| TK-04 | Quên PIN Người học | Đã rà | Form nhập email thật. Màn nhập mã và đặt PIN mới theo TK-06. |
| TK-05 | Quên mật khẩu Nhân sự | Đã rà | Form thật trên đường dẫn Nhân sự. Xử lý yêu cầu phía Quản lý theo QL-11. |
| TK-06 | Xác minh và đặt PIN mới | Chưa rà | Mã hợp lệ, hết hạn, gửi lại, thông báo lỗi. |
| TK-07 | Tài khoản bị khóa | Chưa rà | Màn khóa và luồng gửi yêu cầu hỗ trợ. Audit cũ thiếu tài khoản phù hợp. |

## Người học

| Mã | Màn hoặc luồng | Trạng thái | Đã thấy hoặc còn cần kiểm |
| --- | --- | --- | --- |
| HV-01 | Trang chủ và lịch học | Đã rà | Lịch tuần trên iPhone, lịch tháng trên iPad, các chỉ số trang chủ. |
| HV-02 | Bài tháng | Rà một phần | Audit trước đã mở trang. Còn bài đã công bố, ôn tập và các trạng thái khóa. |
| HV-03 | Luyện với Season | Rà một phần | Audit trước đã mở màn và hộp xóa chat. Còn chat dài và phần nhận xét đang mở trên bản hiện tại. |
| HV-04 | Danh sách Mini game | Rà một phần | Audit trước đã mở màn. Còn kiểm theo trạng thái có bộ từ và chưa có bộ từ. |
| HV-05 | Đang chơi Mini game | Rà một phần | Có ảnh Word scramble. Còn các trò khác, bàn phím và kết quả. |
| HV-06 | Tiến độ, hồ sơ và huy hiệu | Đã rà | Hồ sơ thật, danh sách thông tin mở rộng và thứ tự trường đã kiểm. |
| HV-07 | Đổi avatar | Đã rà | Popup, bảng màu cố định và xem trước trên iPhone/iPad. Lượt kiểm giao diện. |
| HV-08 | Nhập và sửa hồ sơ | Rà một phần | Audit trước đã mở form. Còn nhánh hồ sơ mới và lỗi xác thực trên bố cục hiện tại. |
| HV-09 | Bài học ngày | Rà một phần | Audit trước đã mở. Còn bài đã mở đủ nội dung và thao tác học. |
| HV-10 | Bài ôn | Rà một phần | Audit trước thấy bài khóa theo ngày. Còn bài ôn đã mở và các phần thực hành. |
| HV-11 | Hỗ trợ học tập | Rà một phần | 11/11, bản 4181. Đã xem tab Khiếu nại trên iPhone, iPad và MacBook trong Responsively. Đo Chromium ở 390, 768 và 1440 px, nút mở cùng hàng với tiêu đề và cặp nút cuối form cùng hàng. Mở/hủy thành công bằng tài khoản demo. Bản cách ly 4296: đã mở khiếu nại duyệt có phản hồi và ảnh trên iPhone, iPad và MacBook trong Responsively. Chromium ở 320/390/768/1440 px đã kiểm mở, thu gọn, mở từ liên kết chi tiết và tải ảnh 200. Đã kiểm hướng dẫn khiếu nại ở 320/390/768/1440 px: đi từ thông tin và ảnh đến lý do và gửi. Khung đứng yên, dùng màu theo mùa, kết thúc ở nút Đã hiểu. Phản hồi đang mở không được tính là bước. Còn kiểm kháng nghị có dữ liệu. Đã đưa bốn mục trên điện thoại về một hàng (98 → 50 px tại 320/390 px), mỗi mục cao 44 px. Đã chuyển qua đủ bốn mục và kiểm nút Quay lại của trình duyệt tại 320/390/600/768/1440 px. Ảnh Responsively support-one-row cho iPhone, iPad và MacBook. |
| HV-12 | Khảo sát tháng | Đã rà | Bản cách ly 4296, khảo sát công bố qua API của Quản lý. Chromium 320/390/768/1440 px đã kiểm 5 sao căn giữa, kéo chuột hoặc chạm, phím mũi tên, báo thiếu câu và nút gửi căn phải. Responsively iPhone, iPad và MacBook đã mở và thu câu trả lời đã lưu ở hàng riêng dưới hàng tóm tắt. |
| HV-13 | Thi đầu vào | Rà một phần | Audit trước có màn chuẩn bị và đang thi. Chỉ dùng đúng đề thật đã xác nhận trên bản hiện tại. Còn bốn kỹ năng, nộp và kết quả. |
| HV-14 | Thi tháng | Rà một phần | Màn điều kiện thật đã xem ở trạng thái chưa có đề phát hành. Còn đề mở, đang thi và kết quả. |
| HV-15 | Thi lên mức | Chưa rà | Đủ/chưa đủ điều kiện, đang làm và kết quả. |
| HV-16 | Thi đầu ra | Rà một phần | Audit cũ thấy cửa thi. Kiểm thử nghiệp vụ của agent là bằng chứng riêng. Còn bố cục khi làm thật và kết quả trên hai cỡ. |
| HV-17 | Chứng nhận huy hiệu và tốt nghiệp | Rà một phần | Có phản hồi giao diện trước đó. Còn xem, tải/in và quay lại trên thiết bị nhỏ. |

## Vận hành

| Mã | Màn hoặc luồng | Trạng thái | Đã thấy hoặc còn cần kiểm |
| --- | --- | --- | --- |
| VH-01 | Duyệt mức | Rà một phần | Audit trước đã mở. Còn chi tiết hồ sơ, xác nhận và trạng thái sau duyệt. |
| VH-02 | Sinh bài, chủ đề và lịch tháng | Rà một phần | Chu kỳ tháng và lịch đã đo lại. Còn hộp tiến độ sinh, soạn tay và lỗi sinh. |
| VH-03 | Duyệt, xem và sửa bài ngày/bài ôn | Rà một phần | Đã xem bài đã duyệt và mở/hủy yêu cầu mở lại. Còn bản nháp bài ngày/bài ôn đủ dữ liệu. |
| VH-04 | Phản hồi Season | Rà một phần | Audit trước đã mở khu vực. Còn mở hồ sơ có nhiều lượt và kiểm bố cục chi tiết. |
| VH-05 | Kháng nghị học viên | Chưa rà | Danh sách, xem bằng chứng, xử lý và phản hồi. |
| VH-06 | Yêu cầu đã gửi | Rà một phần | Đã mở yêu cầu đang chờ ở 320/390/768/1440 px. Còn yêu cầu đã xử lý và đọc phản hồi. |
| VH-07 | Cảnh báo bài tập | Rà một phần | Đã kiểm trạng thái rỗng bốn cỡ. Còn mở chi tiết và hiệu chỉnh câu khi có lượt sai đủ điều kiện. |
| VH-08 | Kết quả bài thi | Rà một phần | Đã đo bảng và mở kết quả đầu vào/tháng trong audit trước. Còn các loại đề khác và chi tiết điểm. |
| VH-09 | Xem và sửa đề | Rà một phần | Đã mở popup xem trong audit trước. Còn popup sửa, sticky khi cuộn và trạng thái theo từng loại đề. |
| VH-10 | Cài đặt Vận hành | Rà một phần | Audit trước và ảnh người dùng đã chỉ ra bố cục Người dùng. Còn kiểm phần mở rộng thực tế trên iPhone/iPad. |

## Quản lý

| Mã | Màn hoặc luồng | Trạng thái | Đã thấy hoặc còn cần kiểm |
| --- | --- | --- | --- |
| QL-01 | Tiến độ nhóm | Rà một phần | Bảng và hàng mở rộng đã đo lại. Có phản hồi sau đó về dồn chữ. Còn kiểm khu vực bị ảnh hưởng. |
| QL-02 | Nhắc học | Rà một phần | Audit trước đã mở. Còn thẻ nhiều nút, lịch sử và màn cấu hình Base.vn. |
| QL-03 | Báo cáo tháng | Rà một phần | Audit trước đã mở. Có phản hồi sau đó về phần tổng báo cáo và bảng học viên. |
| QL-04 | Khảo sát tháng | Rà một phần | Đã mở bản xem trước và trình sửa phiên bản mới trên điện thoại, tablet và desktop. Còn sửa nhiều câu, phát hành và đọc phản hồi. |
| QL-05 | Hiệu suất vận hành | Rà một phần | Audit trước đã mở. Có phản hồi về phần chi tiết dài hơn một màn hình. |
| QL-06 | Ngày nghỉ lễ | Rà một phần | Danh sách cuộn đến cuối và lọc được ở bốn cỡ. Ô ngày 320 px bị cắt phần năm. Còn xác nhận xóa ngày nghỉ công ty. |
| QL-07 | Các màn Vận hành chỉ xem | Chưa rà | Kiểm theo quyền Quản lý và giữ cùng thứ tự điều hướng desktop. |
| QL-08 | Yêu cầu mở khóa | Rà một phần | Bảng đã đo lại trong audit trước. Còn xác nhận, lưu trữ và mục có lịch sử dài. |
| QL-09 | Khiếu nại | Rà một phần | Bảng đã đo lại trong audit trước. Còn ảnh bằng chứng và phản hồi trong popup. |
| QL-10 | Cài đặt và Người dùng | Rà một phần | Có phản hồi về các mục bung ra, form tạo tài khoản và ba nút thao tác. |
| QL-11 | Khôi phục tài khoản | Chưa rà | Yêu cầu chờ xử lý, xác nhận và đặt lại mật khẩu. |
| QL-12 | Giả lập phần thưởng | Rà một phần | Đã có nhiều lượt xem thiết bị nhỏ. Còn đối chiếu trạng thái mở rộng và bản xem chứng nhận. |

## Dùng chung

| Mã | Màn hoặc luồng | Trạng thái | Đã thấy hoặc còn cần kiểm |
| --- | --- | --- | --- |
| CH-01 | Chuông thông báo | Rà một phần | Audit trước kiểm hộp thoại cả ba vai trò. Responsively đã bấm mở chuông trên desktop. Chromium đo hai nút chuông và hướng dẫn 44 × 44 px, nền trắng và icon tối ở cả 7 giao diện theo mùa/lễ. Còn danh sách dài, rỗng và vị trí nút đóng. |
| CH-02 | Toast và xác nhận thao tác | Rà một phần | Có ảnh các loại toast và trạng thái xếp chồng. Còn trạng thái dài và thao tác nguy hiểm theo mùa. |
| CH-03 | Hướng dẫn sử dụng | Rà một phần | Luồng Hồ sơ đã xem trên iPhone/iPad. Luồng Khiếu nại có kiểm riêng khi form và phản hồi cùng mở. Còn rà hướng dẫn theo trạng thái cho Kháng nghị, Vận hành và Quản lý. Khảo sát đã kiểm trực tiếp ở HV-12. |
| CH-04 | Điều hướng, menu và nút cuộn | Rà một phần | Có bằng chứng từ nhiều màn. Còn màn thi đang làm và popup cuộn cần kiểm theo đúng ngữ cảnh. |
| CH-05 | Không có quyền / đường dẫn sai | Rà một phần | Audit trước kiểm đường dẫn sai phía Vận hành. Còn màn tương ứng theo các vai trò khác. |

### Đối chiếu hướng dẫn trên bản cách ly 4298

Chromium độc lập ở 390×844, 768×1024 và 1440×900. [Lượt rà tổng quát sau đổi header](../.artifacts/guide-qa/full-audit-rerun.ndjson) ghi 186 lượt màn và 380 bước. [Lượt chạy lại sau sửa](../.artifacts/guide-qa/full-audit-final.ndjson) ghi 120 lượt, 119 lượt đọc được và 256 bước, không phát hiện mục tiêu sai, chữ bị cắt hoặc khung di chuyển trong các bước đã đo. Lượt form hồ sơ iPad còn lại đã được mở và đo riêng ở HV-08. Số lượt gồm nhiều kích thước của cùng màn.

| Mã | Trạng thái đã mở và đối chiếu hướng dẫn | Còn kiểm |
| --- | --- | --- |
| HV-11, VH-06 | Kháng nghị đủ hạn đã mở và điền đến khi nút Gửi bật. Yêu cầu mở lại do Vận hành gửi đã có lý do và trạng thái trực tiếp trong bảng. Đã bỏ bước trỏ tới nút Chi tiết cũ. [6 lượt trên ba cỡ](../.artifacts/guide-qa/remaining.ndjson) | Kháng nghị đã gửi, có phản hồi, và yêu cầu đã xử lý. |
| HV-01, HV-06, HV-11, CH-03 | Trang chủ có bài, đang chờ bài và chưa làm đầu vào. Đã mở Hồ sơ, khiếu nại đang soạn và thử bấm vùng nổi bật. Guide giữ nguyên màn và dữ liệu form. Trước, Tiếp theo, Đã hiểu hoạt động trên cả ba cỡ. [6 lượt kiểm điều hướng](../.artifacts/guide-qa/full-audit-guide-only.ndjson) | Nhánh cần hoàn thiện hồ sơ, khóa vì bỏ thi và mở lại. |
| HV-03, HV-04, HV-05 | Season đủ sáu bước ở trạng thái đã có trao đổi. Mini game chưa có từ, có từ đã học, mục từ đóng/mở và sáu màn hướng dẫn chơi, có Season Catch. Đã sửa nút từ đã học bị tính khi mục từ còn đóng trên điện thoại/tablet. Đã bắt đầu Word scramble để đối chiếu màn đang chơi. | Audio thật, phản hồi sau gửi và kết quả lưu lỗi. |
| HV-07, HV-08, HV-09, HV-10 | Avatar mở qua Hồ sơ, đã bấm hai bước, kiểm Tab và Esc trên cả ba cỡ. Đã mở lại nhóm Trình độ trong form hồ sơ và hoàn tất Guide trên cả ba cỡ. [Hai bài B1](../.artifacts/guide-qa/full-audit-lesson.ndjson) có mục tiêu là nút thật của phần Học, Hoàn thành hoặc Lưu lượt ôn. Đã mở Luyện tập của bài đã học. | Còn bài ôn mới, luyện tập có câu chưa làm và form báo lỗi bài học đủ điều kiện. |
| HV-12, HV-13–17, VH-08–09 | Khảo sát đang mở, xem lịch sử và đóng chuông rồi mở lại hướng dẫn. Đã mở các trang cửa thi/kết quả và chứng nhận có thể truy cập để kiểm việc hiện nút. Hướng dẫn ứng dụng không chạy trong luồng thi. | Những cửa thi bị chặn bởi dữ liệu hoặc ngày thi, tải chứng nhận. |
| VH-01, VH-02, VH-04, VH-05, VH-07, VH-10 | Duyệt mức đang chờ và mở hồ sơ, chủ đề tháng mở/đóng, Season mở/đóng, xử lý kháng nghị đang chờ, cảnh báo bài tập rỗng, các mục Cài đặt. Đã mở B1 trên ba cỡ và kiểm lịch làm nổi nút thao tác của ngày học, mở Phân bổ tài nguyên và hộp từ cốt lõi. | Còn cảnh báo có dữ liệu và lỗi sinh thực tế. |
| VH-03 | [Bài đã duyệt và popup xin mở lại](../.artifacts/guide-qa/full-audit-reopen.ndjson) có 6 lượt trên ba cỡ, trỏ đúng nút và ô lý do. Từ lịch đã mở hai nút soạn tay bài mới/bài ôn trên [điện thoại và tablet](../.artifacts/guide-qa/full-audit-manual-editor.ndjson) và [desktop](../.artifacts/guide-qa/full-audit-manual-editor-desktop.ndjson). Hoàn thành 24 bước. Guide chừa khoảng cuộn trong popup khi mở nên nút lưu không bị che. | Cần thử bản nháp bài ngày/bài ôn đủ dữ liệu. Trên B1 QA, `Soạn tay bài 1` báo lỗi ở `day.skillExercises.find`; một ngày ôn thiếu phân bổ mở nhầm tiêu đề soạn bài ngày. Đã báo lỗi luồng soạn cho người phụ trách. |
| QL-01, QL-03, QL-05, QL-06, QL-07 | Tiến độ và popup hồ sơ, bộ lọc báo cáo, chi tiết hiệu suất, thêm/lọc ngày nghỉ, các màn chỉ xem có thể mở. | Cấu hình đủ dữ liệu B1 ở Nội dung tháng, kháng nghị/cảnh báo chỉ xem có dữ liệu. |
| QL-02, QL-04, QL-08, QL-09, QL-10, QL-11, QL-12 | Nhắc học đang rỗng. Đã mở khảo sát công bố, bản xem trước và biểu mẫu tạo phiên bản mới, đi qua hai bước soạn và xem trước trên cả ba cỡ. Đã mở/hủy popup duyệt yêu cầu chờ, lọc khiếu nại, mở từng mục Cài đặt, xem danh sách khôi phục rỗng và mở tùy chỉnh giả lập phần thưởng. | Cần ứng viên nhắc học, cấu hình Base.vn, khiếu nại đang chờ, tài khoản cần khôi phục và dữ liệu lỗi phù hợp. |
