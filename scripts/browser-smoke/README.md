# Kiểm thử đa trình duyệt E4S

Bài kiểm tra mở màn đăng nhập công khai, kiểm tra 6 ô PIN, bật/tắt hiện PIN, mở trang quên PIN rồi quay lại. Bài kiểm tra dùng PIN mẫu và dừng trước bước gửi biểu mẫu. Báo cáo ghi chiều rộng nội dung, thời gian phản hồi đầu tiên và thời gian DOM sẵn sàng của từng lượt.

## Chạy trên máy

Từ thư mục gốc E4S, khi bản local đang chạy ở cổng 4175:

```powershell
npm --prefix scripts/browser-smoke install --no-package-lock
npm --prefix scripts/browser-smoke exec -- playwright install firefox webkit
npm --prefix scripts/browser-smoke test
```

Chrome và Edge dùng bản đã có trên máy. Firefox và WebKit lấy từ Playwright. Kiểm tra ở 390, 768 và 1440 px. WebKit local là phép kiểm tra engine, Safari thật chạy qua BrowserStack.

Muốn xem từng bước trong cửa sổ trình duyệt, dùng Playwright Inspector:

```powershell
npm --prefix scripts/browser-smoke test -- --debug --project Chrome-390
```

## Chạy trên BrowserStack Automate

Cần tài khoản có quyền chạy Automate và một URL HTTPS công khai đã được duyệt cho bài kiểm tra này. Cấu hình mặc định chạy Chrome, Edge và Firefox trên Windows 11, Safari trên macOS và Safari trên iPhone 15 Pro Max và iPad Pro 12.9. BrowserStack Local, video và thu thập log mạng được tắt trong cấu hình. Bộ test dùng Playwright 1.63 theo danh sách phiên bản BrowserStack hỗ trợ.

Đặt thông tin tài khoản trong biến môi trường của PowerShell hoặc trong kho bí mật của CI. Các lệnh dưới đây dùng PowerShell 7:

```powershell
$env:BROWSERSTACK_USERNAME = Read-Host 'BrowserStack username'
$env:BROWSERSTACK_ACCESS_KEY = Read-Host 'BrowserStack access key' -MaskInput
$env:E4S_BROWSERSTACK_URL = Read-Host 'URL HTTPS đã duyệt'
npm --prefix scripts/browser-smoke run test:browserstack
```

[Phiên bản và trình duyệt được hỗ trợ](https://www.browserstack.com/docs/automate/playwright/browsers-and-os) · [Safari trên iPhone thật](https://www.browserstack.com/docs/automate/playwright/playwright-ios/nodejs)
