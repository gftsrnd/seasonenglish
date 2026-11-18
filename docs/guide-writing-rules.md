# Quy tắc viết App Guide

Áp dụng cho mọi bước trong `apps/web/src/app/shared/app-guide-steps.ts` (Người học, Vận hành, Quản lý). Mỗi bước gồm bộ chọn phần tử, tiêu đề và nội dung.

## 1. Một bước là một thẻ

- Mỗi bước trỏ vào **đúng vùng đang nói**: thẻ (`.card`), panel, khối form, bảng, danh sách, một mục cài đặt, hoặc khi cần giải thích riêng (ví dụ cột **Loại**, bộ lọc, ô thao tác) thì trỏ vào ô đó của hàng đầu tiên. Không trỏ thẳng vào thẻ `button`, `input`, `select`, `a`.
- Nút và trường quan trọng của thẻ được nhắc ngay trong bước của thẻ đó, không tách thành bước riêng.
- Bỏ qua thao tác hiển nhiên: Đóng, Hủy, Thu gọn, mũi tên quay lại, phân trang, đổi tab, điều hướng chung.
- Trên màn hẹp vẫn trỏ cùng thẻ. Thẻ đang thu gọn vẫn dùng được vì phần đầu thẻ luôn hiện. Khi thẻ có hai dạng theo cỡ màn (ví dụ `<details>` ở điện thoại, `fieldset` ở desktop), khai báo cả hai bộ chọn cách nhau bởi dấu phẩy; engine chọn dạng đang hiện.

## 2. Cách viết

- **Tiêu đề** tối đa 6 tiếng, là tên thẻ hoặc việc chính của thẻ.
- **Nội dung** 1–2 câu ngắn, khoảng 20 tiếng, tối đa 120 ký tự; một ý mỗi bước. Trạng thái có điều kiện (tháng học thử, chưa công bố, bị khóa, chỉ xem…) có bước riêng với chữ hợp trạng thái. Chi tiết từng trường để cho gợi ý dưới trường hoặc nút ⓘ. Không dùng gạch đầu dòng.
- Câu đầu nói thẻ dùng để làm gì; nút và trường chính nằm trong câu, tên viết đậm.
- Chỉ đậm 1–2 chữ chính bằng `**...**` (tên nút hoặc điều kiện quan trọng).
- Tiếng Việt đơn giản, không lặp lại nhãn nút mà nói kết quả của nó.

Ví dụ: "Mỗi ô là ngày học, ngày ôn hoặc bài thi. Bấm **AI** để sinh bài nháp, **bút chì** để soạn tay, **Xem** để mở bài đã có."

## 3. Thứ tự và số bước

- Thứ tự bước theo thứ tự thẻ trên màn, từ trên xuống. Engine tự sắp theo vị trí phần tử trong trang của bố cục hiện tại, nên không cần sắp tay theo từng cỡ màn.
- Engine bỏ thẻ đang bị ẩn. Thẻ chỉ có ở một trạng thái (form vừa mở, chi tiết vừa mở) dùng bộ chọn theo trạng thái; thẻ mới xuất hiện sau thao tác đánh dấu ưu tiên để hướng dẫn nhảy tới.
- Mỗi màn khoảng 3–7 bước ở mỗi trạng thái. Không giải quyết độ dài bằng cách thêm bước; gộp hoặc bỏ bước ít giá trị.
- Thẻ cao hơn khoảng trống phía trên khung hướng dẫn được cuộn sao cho đầu thẻ nằm trên cùng.
- Khi hướng dẫn mở, trang bị khóa: không di chuột, bấm, lăn chuột, vuốt hay phím cuộn nào tác động tới trang; chỉ engine cuộn để đưa thẻ kế tiếp vào khung nhìn. Chỉ các nút **Trước / Tiếp theo / Đã hiểu**, nút đóng và phím Esc hoạt động. Vì vậy nội dung không được bảo người dùng "di chuột" hay "bấm thử" trong lúc xem hướng dẫn.
- Ưu tiên bộ chọn ổn định: lớp của thẻ, `aria-label`, `id`. Có thể thêm `data-guide="..."` vào thẻ; không đổi bố cục chỉ để phục vụ hướng dẫn.

## Tự mở ở lần đầu

- Màn khai báo trong `guideAutoOpenKey` tự mở hướng dẫn một lần cho mỗi tab (nhớ trong trình duyệt, khoá `e4s:guide-seen`). Hiện chỉ có Vận hành › Phản hồi & yêu cầu. Đóng rồi mở lại bằng nút **?** luôn bắt đầu từ bước 1.
- Nội dung chữ để PO duyệt nằm ở `HUONG-DAN-SU-DUNG-NOI-DUNG.md`.

## 4. Kiểm tra trước khi giao

1. Mở hướng dẫn ở 390, 768 và 1440 px (thêm 320 px nếu màn có form), đi bằng **Trước / Tiếp theo** đến **Đã hiểu**.
2. Mỗi bước làm nổi bật đúng thẻ, đầu thẻ nhìn thấy được, chữ không bị cắt, phần chữ đậm hiển thị đúng.
3. Nội dung chỉ nhắc nút và trường có trong thẻ đang nổi bật.
4. Kiểm cả trạng thái có điều kiện (form đã mở, chi tiết đã mở, chưa có dữ liệu).
5. `npx vitest run apps/web/src/app/shared/AppGuide.test.tsx` phải đạt. Bài kiểm tra quy tắc chặn tiêu đề quá 6 tiếng, nội dung quá 22 tiếng, 2 câu hoặc 120 ký tự, đậm quá 2 cụm, danh sách gạch đầu dòng, dấu `**` thiếu cặp và bộ chọn trỏ thẳng vào nút hay ô nhập.
6. Rà tự động trên bản chạy: `npx tsx .artifacts/guide-qa/granularity-audit.mjs`, rồi `node .artifacts/guide-qa/summarize.mjs .artifacts/guide-qa/granularity/audit.json`.
