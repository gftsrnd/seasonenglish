# Quy tắc viết App Guide

Áp dụng cho mọi bước trong `apps/web/src/app/shared/app-guide-steps.ts` (Người học, Vận hành, Quản lý). Mỗi bước gồm bộ chọn phần tử, tiêu đề và nội dung.

## 1. Một bước là một thẻ

- Mỗi bước trỏ vào **một thẻ hoặc khu vực**: thẻ (`.card`), panel, khối form, bảng, danh sách hoặc một mục cài đặt. Không trỏ vào từng nút hay ô nhập.
- Nút và trường quan trọng của thẻ được nhắc ngay trong bước của thẻ đó, không tách thành bước riêng.
- Bỏ qua thao tác hiển nhiên: Đóng, Hủy, Thu gọn, mũi tên quay lại, phân trang, đổi tab, điều hướng chung.
- Trên màn hẹp vẫn trỏ cùng thẻ. Thẻ đang thu gọn vẫn dùng được vì phần đầu thẻ luôn hiện. Khi thẻ có hai dạng theo cỡ màn (ví dụ `<details>` ở điện thoại, `fieldset` ở desktop), khai báo cả hai bộ chọn cách nhau bởi dấu phẩy; engine chọn dạng đang hiện.

## 2. Cách viết

- **Tiêu đề** tối đa 5 tiếng, là tên thẻ hoặc việc chính của thẻ.
- **Nội dung** là đoạn văn ngắn 1–2 câu liền mạch, khoảng 30 tiếng. Không dùng gạch đầu dòng hay dạng "Tên nút: việc".
- Câu đầu nói thẻ dùng để làm gì; nút và trường chính nằm trong câu, tên viết đậm.
- Viết đậm bằng `**...**` cho thông tin cốt lõi: tên nút, tên trường, con số và điều kiện quan trọng. Khung hướng dẫn hiển thị phần này bằng chữ đậm.
- Tiếng Việt đơn giản, không lặp lại nhãn nút mà nói kết quả của nó.

Ví dụ: "Mỗi ô là ngày học, ngày ôn hoặc bài thi. Bấm **AI** để sinh bài nháp, **bút chì** để soạn tay, **Xem** để mở bài đã có."

## 3. Thứ tự và số bước

- Thứ tự bước theo thứ tự thẻ trên màn, từ trên xuống. Engine tự sắp theo vị trí phần tử trong trang của bố cục hiện tại, nên không cần sắp tay theo từng cỡ màn.
- Engine bỏ thẻ đang bị ẩn. Thẻ chỉ có ở một trạng thái (form vừa mở, chi tiết vừa mở) dùng bộ chọn theo trạng thái; thẻ mới xuất hiện sau thao tác đánh dấu ưu tiên để hướng dẫn nhảy tới.
- Mỗi màn thường 2–6 bước, tối đa 8.
- Thẻ cao hơn khoảng trống phía trên khung hướng dẫn được cuộn sao cho đầu thẻ nằm trên cùng.
- Khi hướng dẫn mở, trang bị khóa: không di chuột, bấm, lăn chuột, vuốt hay phím cuộn nào tác động tới trang; chỉ engine cuộn để đưa thẻ kế tiếp vào khung nhìn. Chỉ các nút **Trước / Tiếp theo / Đã hiểu**, nút đóng và phím Esc hoạt động. Vì vậy nội dung không được bảo người dùng "di chuột" hay "bấm thử" trong lúc xem hướng dẫn.
- Ưu tiên bộ chọn ổn định: lớp của thẻ, `aria-label`, `id`. Có thể thêm `data-guide="..."` vào thẻ; không đổi bố cục chỉ để phục vụ hướng dẫn.

## 4. Kiểm tra trước khi giao

1. Mở hướng dẫn ở 390, 768 và 1440 px (thêm 320 px nếu màn có form), đi bằng **Trước / Tiếp theo** đến **Đã hiểu**.
2. Mỗi bước làm nổi bật đúng thẻ, đầu thẻ nhìn thấy được, chữ không bị cắt, phần chữ đậm hiển thị đúng.
3. Nội dung chỉ nhắc nút và trường có trong thẻ đang nổi bật.
4. Kiểm cả trạng thái có điều kiện (form đã mở, chi tiết đã mở, chưa có dữ liệu).
5. `npx vitest run apps/web/src/app/shared/AppGuide.test.tsx` phải đạt. Bài kiểm tra quy tắc chặn tiêu đề quá 5 tiếng, nội dung quá 32 tiếng hoặc 2 câu, danh sách gạch đầu dòng, dấu `**` thiếu cặp và bộ chọn trỏ thẳng vào nút hay ô nhập.
6. Rà tự động trên bản chạy: `npx tsx .artifacts/guide-qa/granularity-audit.mjs`, rồi `node .artifacts/guide-qa/summarize.mjs .artifacts/guide-qa/granularity/audit.json`.
