# Kiến trúc ứng dụng E4S

## Ứng dụng đang chạy

- `apps/web/src/app` là ứng dụng Web chính được mount bởi `apps/web/src/main.tsx` và là nguồn hành vi của bản local cổng 4175.
- Các nhóm giao diện được tách theo vai trò: `learner`, `operator`, `manager`, `settings` và `games`.
- API client nằm trong `apps/web/src/api`; mỗi client tự khai báo contract theo vai trò và dùng chung transport ở `api/runtime.ts`.
- Contract dùng chung cho đăng nhập và trải nghiệm trình duyệt nằm trong `apps/web/src/features`, không phụ thuộc vào màn hình của một vai trò cụ thể.

## HTML prototype

HTML prototype gốc là tài liệu tham khảo nằm ngoài runtime và không được version cùng mã ứng dụng hiện tại. Runtime không được import mã, CSS hoặc asset từ prototype, và refactor không dùng prototype làm tiêu chuẩn bắt buộc cho giao diện.

## Dữ liệu local và kiểm thử

- Seed `local` chỉ tạo ba tài khoản: Manager, Operator và Learner.
- Seed `test` giữ thêm Checker và fixture phụ để bảo vệ các integration test nhiều vai trò.
- `scripts/prepare-local.ts` luôn dùng seed `local`.
- `scripts/cleanup-local-test-users.ts` mặc định chỉ dry-run, chỉ chấp nhận PostgreSQL loopback và cần `--apply` để xóa. Nội dung dùng chung được chuyển về Manager/Operator trước khi dữ liệu riêng và tài khoản test bị xóa.
- Evidence mới mặc định được ghi vào `.tmp/evidence`, đã bị Git ignore.
