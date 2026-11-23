# Kế hoạch chuyển cơ chế học từ tháng sang "khoá học theo tuần"

> **Cập nhật mới nhất, 23/11/2026. Các điểm dưới đây thay cho mọi chỗ khác trong file:**
> - **Lên mức chỉ còn 3 điều kiện**, xét ở cuối khoá:
>   - hoàn thành ≥ 90% bài;
>   - điểm thực hành tuần trung bình ≥ 75;
>   - bài cuối kỳ ≥ 80.
>
>   Hạ mức không tự động. Khi học viên trượt bài cuối kỳ 2 khoá liền, hệ thống gợi ý để Vận hành xem xét. Cài đặt chỉ còn 4 số: `lessonsPct = 90`, `practiceAvg = 75`, `finalScore = 80`, `demoteFailedFinals = 2`. Bỏ 7 ngưỡng cũ.
> - **Khoá đang chạy** chỉ được kéo dài từ 2 lên 4 tuần, không được rút ngắn.
> - **Không có tuần nghỉ.** Khoá sau luôn bắt đầu vào thứ Hai ngay sau khoá trước. Nhân sự không dời được ngày bắt đầu, chỉ đổi được số tuần và chủ đề lớn của khoá sau. Bỏ trạng thái `awaiting_next_cycle`.
> - **Giao diện đã chốt:**
>   - **Sinh bài:** trên cùng là bộ chọn khoá (Khoá trước, Khoá này, Khoá sau), giống tab tháng hiện tại. Bên dưới là tab theo tuần. Mỗi tuần có thẻ chủ đề sửa tại chỗ, kèm ma trận cột mức × dòng T2–T6. Không lồng thêm tab nào khác.
>   - **Trang chủ học viên:** lộ trình 5 dòng dọc. 4 ô số liệu: Bài tuần này, Chuỗi ngày, Điểm thực hành tuần, Điểm & huy hiệu.
>   - **Bài tuần:** gộp vào 1 trang gồm thực hành tuần này, bài cuối kỳ và các tuần trước.
>   - **Cài đặt:** thẻ Khoá học chia 2 cột (Khoá đang học, Khoá tiếp theo).
>   - **Theo dõi:** có bộ chọn khoá.
> - **4175:** để sau, làm xong trên 4300 trước. Kế hoạch dành cho người dùng duyệt nằm ở `E4S/KE-HOACH-KHOA-HOC-THEO-TUAN.md`.

> **Dành cho agent thực thi:** BẮT BUỘC dùng superpowers:subagent-driven-development hoặc superpowers:executing-plans để làm từng task. Các bước dùng checkbox (`- [ ]`).

Cập nhật: 23/11/2026. Còn 1 điểm chờ người dùng: D6 (số điểm, huy hiệu; chốt ở GĐ8). Một đề xuất phụ trong D2d sẽ hỏi ở GĐ7.

**Mục tiêu:** chuyển cơ chế học của E4S từ chu kỳ tháng sang **khoá học theo tuần**. Luật lấy theo prototype đã được CEO duyệt (Spec v1.0) và các điều chỉnh đã chốt ở bảng quyết định bên dưới.

**Không clone giao diện prototype.** Giữ giao diện hiện tại. Chỉ đổi những tính năng gắn với tháng, và sửa ngay trên màn hiện có theo phong cách hiện có. Prototype chỉ dùng làm nguồn luật.

**Kiến trúc:**
- Cơ chế tháng được giữ làm legacy theo ba cách:
  - một tag và một nhánh git;
  - không xoá bảng dữ liệu tháng;
  - file chỉ phục vụ tháng được cất vào `legacy/monthly-cycle/` khi phần tuần đã thay thế xong.
- Logic dùng chung vẫn chạy và được nối sang tuần: lộ trình ngữ pháp và phát âm, bộ kiểm chất lượng, kiểm từ vựng, bộ sinh đề thi.

**Công nghệ:** monorepo pnpm, web React (Vite), API Fastify, PostgreSQL với migration SQL, Vitest, Playwright. Triển khai bằng `scripts/ops/e4s.ps1`.

**Nguồn luật:**
- `C:\Users\TT5.01 AI UD\Downloads\SEASON ENGLISH - SPEC DOC.docx`: Spec v1.0, ngày 10/10/2026.
- Code prototype `C:\Users\TT5.01 AI UD\Documents\ChatGPT\E4S\research\seasonenglish\`, commit `1364f5a`. Đọc bằng `git show HEAD:core.js`.
- `C:\Users\TT5.01 AI UD\Downloads\E4S · So sánh bản PO chốt với CEO main và bản dev hiện tại.docx`.
- `E4S/SO-SANH-PROTOTYPE-TUAN-VS-APP-THANG.md`.

---

## Bức tranh sau khi xong

| Thứ | Bây giờ (tháng) | Sau khi xong (khoá học theo tuần) |
|---|---|---|
| Đơn vị | Tháng | **Khoá học** dài 2 hoặc 4 tuần. Hết khoá thì khoá mới tự mở ngay tuần sau. |
| Chủ đề | 1 chủ đề tháng cho mọi mức | **Mỗi tuần 1 chủ đề riêng**, không trùng (luật D2c). |
| Lịch học | T2–T5 học bài mới, T6 ôn tuần | **T2–T6 đều là bài mới.** |
| Ngữ pháp, phát âm | Mỗi tháng 2 chủ điểm và 4 âm | **Mỗi 2 tuần (1 khối)** học 1 chủ điểm và 2 âm, theo thứ tự lộ trình. |
| Từ vựng | Mỗi bài 3 từ cốt lõi; chỉ chống trùng trong tháng | Mỗi bài 3 từ cốt lõi; chống trùng theo quý và với khoá liền trước (D2c). |
| Cuối tuần | Bài ôn thứ Sáu | **Bài thực hành cuối tuần**, AI chấm. |
| Cuối chu kỳ | Thi tháng 30 phút | **Bài cuối kỳ** ở tuần cuối khoá: 30 phút với khoá 2 tuần, 60 phút với khoá 4 tuần. |
| Tốt nghiệp | Pass Course C1 kèm chứng nhận | **Giữ nguyên.** Điều kiện mới: đang ở C1 và đã đạt ít nhất 1 bài cuối kỳ ở C1. |
| Lên mức | Xét qua 6 tháng hợp lệ | **Xét ở cuối khoá** theo 7 ngưỡng, sau đó thi lên mức, Vận hành duyệt. |
| Vắng học | Cảnh báo, khoá tài khoản, giới hạn vắng 30% | **Bỏ khoá tài khoản và bỏ giới hạn 30%.** Chỉ thông báo qua chuông. Hệ thống nhắc học giữ nguyên. |
| Chứng nhận | Chứng nhận tốt nghiệp C1 | Chỉ còn chứng nhận tốt nghiệp C1. Popup lên mùa và lên mức giữ nguyên. |
| Khảo sát | Khảo sát tháng | **Khảo sát cuối khoá**, hiện sau bài cuối kỳ. |

---

## Ràng buộc chung

- **🟡 GATE-UI: hỏi trước mọi thay đổi giao diện.**
  - Gửi ảnh màn hiện tại cùng bản dự kiến, liệt kê từng chỗ đổi. Người dùng đồng ý rồi mới code.
  - Không tự đổi màn hình không dính tới tháng.
- **Môi trường:**
  - Chỉ làm và thử trên 4300.
  - Mọi việc trên 4175 phải được người dùng đồng ý rõ ràng, và phải sao lưu trước.
  - Push lên `origin codex/integrate-1118` và `origin codex/deploy-web-fallback`.
- **Nội dung học:**
  - Không sửa tay. Chỉ sinh qua AI của app.
  - Khi thử chỉ sinh 1 tuần × 1 mức. Hỏi trước khi sinh nhiều hơn.
- **Bảo mật:** không đưa mật khẩu hoặc PIN thật vào git hay chat. Test dùng `test-manager-pw`, `test-staff-pw`, `test-review-pw` và PIN `135790`.
- **Responsive:**
  - Trên điện thoại, mỗi trang chỉ cần lướt 1–2 lần, cỡ chữ hợp điện thoại.
  - Chụp ảnh trước và sau ở các độ rộng 390, 768, 1024, 1440.
- **Dữ liệu tháng:** không xoá. Migration chỉ được thêm.
- **Mỗi giai đoạn kết thúc ở trạng thái xanh:**
  - `pnpm exec tsc -b` và `pnpm exec vitest run` chạy qua;
  - CI xanh trên cả 2 nhánh;
  - deploy 4300 bằng `scripts/ops/e4s.ps1 -EnvFile ..\deploy-web-fallback-worktree\.env -Env sandbox -Action deploy -SkipBackup -Yes`.
- **Ngôn ngữ:**
  - Giao diện bằng tiếng Việt, dùng chữ "Khoá học". **Không dùng chữ "pilot".**
  - Nội dung học bằng tiếng Anh.
  - Giải thích bằng tiếng Việt cho A1–A2, bằng tiếng Anh từ B1 trở lên.

## Điểm dễ hỏng cần soi kỹ (Review Focus)

1. **Học viên được duyệt mức giữa khoá:**
   - học ngay tuần hiện tại và học bù được các bài trước trong khoá;
   - không bị tính vắng trước ngày được duyệt;
   - bài cuối kỳ chỉ hỏi phần học viên đã có bài.

   Test ở GĐ4.
2. **Tới ngày học mà bộ bài của tuần chưa được duyệt, hoặc hôm đó là ngày lễ:** học viên không bị khoá vĩnh viễn, ngày đó không bị tính vắng, luật ngày lễ hiện có vẫn áp dụng. Test ở GĐ4.
3. **Chuyển khoá:**
   - khoá mới tự mở và học tiếp khối kế tiếp;
   - bài cuối kỳ của khoá cũ không mở lại;
   - từ cốt lõi không trùng với khoá liền trước, kể cả khi khoá mới thuộc quý khác.

   Test ở GĐ1 và GĐ2.
4. **Đổi mức:** áp dụng từ khoá kế tiếp. Khoá đang học giữ bộ bài của mức cũ. Test ở GĐ7.
5. **Học viên thật trên 4175:** khi chuyển sang khoá học, không mất điểm, huy hiệu hay lịch sử. Test ở GĐ11.

---

## Bảng quyết định

| Mã | Trạng thái | Quyết định |
|---|---|---|
| D1 | Đã chốt | Gộp "Ngày hệ thống thử" và "Ép tuần" thành **một công cụ "Ngày thử"**, có nút "Nhảy tới tuần N" (đặt về thứ Hai của tuần đó). Đổi chữ "pilot" thành **"Khoá học"**. |
| D2 | Đã chốt | **Khoá dài 2 hoặc 4 tuần.** Mỗi 2 tuần là **một khối** gồm 10 bài.<br>**Ngữ pháp:** 1 chủ điểm kế tiếp của mức. N1–N6 học 6 bước: nhận diện, cấu trúc, biến thể, cách dùng, lỗi hay gặp, vận dụng. N7–N10 luyện riêng chủ điểm đó.<br>**Phát âm:** 2 âm kế tiếp. P1 học N1–N3, P2 học N4–N6. N7–N10 dùng để phân biệt 2 âm, đọc thành tiếng, voice note, nói nhại.<br>Khoá 4 tuần gồm 2 khối. Khoá sau học tiếp khối kế tiếp.<br>Các ngày K "kết hợp A+B" được thay bằng luyện sâu 1 chủ điểm; **phải báo chủ sản phẩm**. |
| D2b | Đã chốt | "Số tuần" chỉ sửa được trước khi khoá bắt đầu và khi chưa có bài nào được duyệt. Khi khoá đã chạy, ô này bị khoá và có dòng giải thích. |
| D2c | Đã chốt | Từ cốt lõi của từng mức không trùng theo **2 luật cùng lúc**:<br>**(1) Trong quý cố định.** Quý gồm T1–T3, T4–T6, T7–T9, T10–T12. **Cả khoá tính vào quý chứa ngày bắt đầu khoá**, nên một khoá không bao giờ bị cắt đôi giữa hai quý.<br>**(2) Không trùng với khoá liền trước**, kể cả khi khoá đó thuộc quý cũ.<br>Kết quả: không bao giờ trùng trong cùng một khoá, cũng không trùng giữa hai khoá liền nhau.<br>Các luật đi kèm:<br>• Từ đã học vẫn được làm từ mở rộng, vào ví dụ, vào bài tập.<br>• A1 dùng luật mềm: thiếu từ thì được dùng lại từ đã dạy lâu nhất, kèm cảnh báo cho Vận hành.<br>• Lên mức thì danh sách cấm bắt đầu trống.<br>• Chủ đề tuần theo cùng 2 luật này. |
| D2d | Đã chốt; còn một đề xuất hỏi ở GĐ7 | Xét lên và hạ mức **ở cuối khoá**, khoảng xét là cả khoá. Có 7 ngưỡng trong Cài đặt, chỉ Quản lý được sửa:<br>• hoàn thành bài ≥ 90%;<br>• đúng ngay lần đầu ≥ 75%;<br>• bài thực hành tuần gần nhất ≥ 80;<br>• rubric Season ≥ 4/5;<br>• ít nhất 6 lượt chat;<br>• hạ mức khi tỉ lệ sai > 30%;<br>• chỉ tính tuần có ít nhất 4 phần bài.<br>Mức mới áp dụng từ khoá kế tiếp.<br>Đề xuất hỏi ở GĐ7: thêm điều kiện "phải đạt bài cuối kỳ". |
| D2e | Đã chốt | Hết khoá thì khoá mới **tự mở ngay tuần sau**, giữ số tuần cũ. **Trước khi khoá kết thúc 1 tuần**, chuông thông báo gửi cho Quản lý và Vận hành để kịp đổi số tuần, ngày bắt đầu hoặc chủ đề lớn. |
| D2f | Đã chốt | **Cài đặt — không đưa lại:** thẻ Ảnh minh hoạ, số phút từng phần, nút "Bật tính giờ", khoá AI, xuất/nhập JSON, xem PIN.<br>**Cài đặt — có:**<br>• thẻ Khoá học: ngày bắt đầu, số tuần 2 hoặc 4, chủ đề lớn, phút học khuyến nghị mỗi ngày, giới hạn chat Season mỗi ngày;<br>• ô "Số lần cảnh báo khi rời màn thi";<br>• 7 ngưỡng lên và hạ mức. |
| D4 | Đã chốt | **Bỏ khoá tài khoản do vắng, bỏ giới hạn vắng 30%.** Không có banner, chỉ thông báo qua chuông. Hệ thống nhắc học hiện có giữ nguyên. |
| D5 | Đã chốt | **Bỏ thử thách 6 lượt với Season.** Lên mức gồm: đủ ngưỡng ở cuối khoá, thi lên mức, Vận hành duyệt. |
| D6 | Chờ (GĐ8) | Điểm và huy hiệu suy ra từ bản tháng, thu nhỏ theo độ dài khoá. Không dùng số của prototype (60/180/360) vì quá dễ đạt. Mục tiêu: học viên chăm chỉ đạt Mùa Đông sau khoảng 2–3 khoá. |
| D7 | Đã chốt | Giữ đấu trường hiện tại. |
| D8 | Đã chốt | Khảo sát tháng đổi thành **khảo sát cuối khoá**, hiện ngay sau khi nộp bài cuối kỳ. Quản lý vẫn tự soạn câu hỏi. |
| D9 | Đã chốt | Bài cuối kỳ dài **30 phút** với khoá 2 tuần, **60 phút** với khoá 4 tuần. Chỉ hỏi những gì đã học trong khoá. |
| D9b | Đã chốt | **Bỏ chứng nhận theo mức**, vì người học có thể cày điểm và ở lì một mức. Giữ popup lên mùa và lên mức. Chỉ còn **chứng nhận tốt nghiệp C1**. |
| D9c | Đã chốt | **Giữ Pass Course** (đề đầu ra C1, 90 phút) làm bài thi tốt nghiệp. Điều kiện vào thi: đang ở C1 và đã đạt ít nhất 1 bài cuối kỳ ở C1. Đạt thì nhận chứng nhận tốt nghiệp (trang A4 hiện có). |
| D10 | Đã chốt | Bài cuối kỳ **đạt** khi tổng ≥ 70 và mỗi kỹ năng ≥ 50%. **Kết luận của người chấm (Vận hành) là cuối cùng**: được chỉnh điểm hoặc kết quả, kèm lý do và lưu vết. Đạt thì được tính "Có tiến bộ". |

**Giữ nguyên, không đổi:**
- đăng nhập email + PIN, OTP;
- hồ sơ;
- đề đầu vào và thi lại đầu vào;
- cấu trúc bài học 2 bước, 6 phần;
- nút "Báo lỗi câu này";
- chuông thông báo, màn Hỗ trợ, ngày lễ, hệ thống nhắc học;
- Coach (chỉ đổi những con số đang tính theo tháng);
- Mini game (chỉ đổi bộ từ);
- Hồ sơ;
- luật mở lại nội dung đã duyệt;
- đấu trường.

---

## Giai đoạn 0: Cất cơ chế tháng làm legacy (không đổi gì trên app)

### Task 0.1: Tag và nhánh

- [ ] **Bước 1:** trong `integrate-worktree`, chạy `git status --short` và `git log --oneline -1`. Kỳ vọng: không còn thay đổi chưa commit, HEAD là commit mới nhất đã xanh CI.
- [ ] **Bước 2:**
  ```bash
  git tag -a legacy-monthly-cycle-2026-11-23 -m "Snapshot of the monthly learning cycle before the weekly course switch"
  git branch legacy/monthly-cycle legacy-monthly-cycle-2026-11-23
  ```
- [ ] **Bước 3:** **hỏi người dùng trước khi push**, vì repo đang công khai. Khi được đồng ý mới chạy `git push origin legacy-monthly-cycle-2026-11-23 legacy/monthly-cycle`. Kiểm tra bằng `gh api repos/gftsrnd/seasonenglish/git/refs/tags/legacy-monthly-cycle-2026-11-23`.

### Task 0.2: Sao lưu

- [ ] **Bước 1:** sao lưu 4300.
  ```powershell
  scripts/ops/e4s.ps1 -EnvFile ..\deploy-web-fallback-worktree\.env -Env sandbox -Action backup -BackupDir ..\backups -Yes
  ```
  Kỳ vọng: có tệp `.dump` mới, dung lượng lớn hơn 0.
- [ ] **Bước 2:** sao lưu 4175, **chỉ khi người dùng đồng ý**.
  ```powershell
  scripts/ops/e4s.ps1 -EnvFile ..\deploy-web-fallback-worktree\.env -Env live -Action backup -ConfirmLive -Yes -BackupDir ..\backups
  ```
  Ghi tên tệp vào README ở Task 0.3.

### Task 0.3: Sổ kiểm kê cơ chế tháng

**Files:**
- Tạo mới: `legacy/monthly-cycle/README.md`, `scripts/legacy-monthly-inventory.test.ts`.
- Sửa: `legacy/README.md`.

**Interfaces:** bảng trong README có 4 cột: `path` | `live`/`legacy` | Dùng lại cho tuần (có/không) | Thay bằng. Các giai đoạn sau cập nhật bảng này mỗi khi cất file.

- [ ] **Bước 1: Viết test.**
  ```ts
  it("every file listed as live in the monthly inventory exists", () => {
    for (const row of parseInventory("legacy/monthly-cycle/README.md").filter(r => r.status === "live"))
      expect(existsSync(row.path), row.path).toBe(true);
  });
  it("every file listed as legacy is stored under legacy/monthly-cycle with a .txt suffix", () => {
    for (const row of parseInventory("legacy/monthly-cycle/README.md").filter(r => r.status === "legacy"))
      expect(existsSync(`legacy/monthly-cycle/${row.path}.txt`), row.path).toBe(true);
  });
  ```
  `parseInventory(path): { path: string; status: "live" | "legacy" }[]` đọc các dòng bảng có dạng `` | `path` | live | … | ``.
- [ ] **Bước 2:** chạy `pnpm exec vitest run scripts/legacy-monthly-inventory.test.ts`. Kỳ vọng: FAIL.
- [ ] **Bước 3: Viết README.** Ghi tất cả các file dưới đây với trạng thái `live`.
  - **Web, phía Vận hành** (`apps/web/src/app/operator/`):
    - `Months.tsx`, `months.css`;
    - `MonthlyFinalReview.tsx`, `MonthlyFindingsPanel.tsx`, `MonthlyIllustrationPanel.tsx`, `MonthlyResourceEditor.tsx`, `MonthlyResourceProgress.tsx`, `MonthlyReviewPractice.tsx`;
    - `monthly-day-grammar-steps.ts`, `monthly-failure-findings.ts`, `monthly-generation-message.ts`, `monthly-generation-progress.ts`, `monthly-manual-seed.ts`.
  - **Web, phía học viên:** `learner/WeeklyReview.tsx`, `LevelReadiness.tsx`, `MonthlySurveys.tsx`, `CertificateDocument.tsx`.
  - **Web, phía Quản lý:** `manager/MonthlyOverview.tsx`, `MonthlySurveys.tsx`, `Holidays.tsx`.
  - **Web, dùng chung:** `shared/LockedLearnerSupport.tsx`, `MonthlySurveyFields.tsx`, `monthly-uncounted.ts`, `monthly-surveys.css`.
  - **API:**
    - `apps/api/src/modules/content/monthly-*.ts`;
    - `assessment/monthly-final-*.ts`;
    - `learning/weekly-review-routes.ts`;
    - `manager/holiday-complaint-routes.ts`;
    - `monthly-surveys/routes.ts`;
    - `scripts/monthly-register-trial.ts`.
  - **Domain:** `packages/domain/src/monthly/*`, `progression/monthly-eligibility.ts`, `engagement/season-rewards.ts`.
  - **Database:** `packages/database/src/monthly-*.ts`.
  - **Migration:** từ `0081_monthly_learning_cycle.sql` trở đi. Ghi tên các bảng `program_months`, `month_frameworks`, `month_lessons`, `month_lesson_corrections` và các bảng thi tháng.

  Ghi "Dùng lại: có" cho các nhóm sau:
  - catalog ngữ pháp và phát âm, `pronunciation-rules`, `pronunciation-ipa`, `lesson-vocabulary`, `register-terms`;
  - `monthly-word-verification`, `monthly-british-ipa`, `monthly-quality`, `monthly-answer-checks`, `monthly-resource-quality-gates`, `monthly-illustrations`;
  - `monthly-final-builder`, `monthly-final-scope`, `monthly-final-*-generation`, `monthly-final-answer-verification`, `monthly-final-checks`;
  - `Holidays.tsx`, `CertificateDocument.tsx`.

  Thêm mục "Cách khôi phục": `git checkout legacy/monthly-cycle`, hoặc chép file `.txt` về và bỏ đuôi; đăng ký lại route; dùng tệp sao lưu ở Task 0.2.
- [ ] **Bước 4:** chạy lại test. Kỳ vọng: PASS.
- [ ] **Bước 5:** commit.
  ```bash
  git add legacy/monthly-cycle/README.md legacy/README.md scripts/legacy-monthly-inventory.test.ts
  git commit -m "Inventory the monthly learning cycle before the weekly course switch"
  ```

**Luật cất file (áp dụng cho mọi giai đoạn sau):**
- Chỉ cất file chỉ phục vụ tháng, và chỉ **sau khi** phần tuần thay nó đã xanh.
- Chuyển file sang `legacy/monthly-cycle/<đường dẫn cũ>.txt`. Test của file đó cũng chuyển theo.
- Cập nhật README.
- Giữ API chỉ đọc nếu lịch sử tháng cũ còn cần xem.
- Không cất file được đánh dấu "Dùng lại: có".

---

## Giai đoạn 1: Lịch khoá học (chỉ máy chủ)

**Luật:**
- **Khoá học** gồm: ngày bắt đầu (thứ Hai tuần 1), số tuần (2 hoặc 4), chủ đề lớn.
- **Tuần hiện tại** tính theo ngày bắt đầu và theo "Ngày thử" (D1).
- **Trạng thái khoá:** chưa bắt đầu, đang học, tuần cuối, đã kết thúc.
- **Khoá kế tiếp:** tự tạo, bắt đầu thứ Hai ngay sau khoá cũ, cùng số tuần (D2e).
- **Báo trước khi hết khoá:** trước 1 tuần, thông báo qua chuông cho Quản lý và Vận hành (D2e).
- **Khoá số tuần** theo D2b.
- **Quý của khoá** là quý chứa ngày bắt đầu khoá (D2c).
- **Ngày mở bài:** bài 1 mở T2, …, bài 5 mở T6.
- **Chuỗi ngày** chỉ tính T2–T6. Thứ Bảy và Chủ nhật không cộng, cũng không làm đứt chuỗi.
- **Số ngày bỏ học** được tính để phục vụ hệ thống nhắc học hiện có.
- **"Ngày thử"** có thêm nút "Nhảy tới tuần N".

**Cài đặt máy chủ (D2f):**
- `courseStartDate`, `courseWeeks` (2 | 4), `courseTheme`;
- `minMinutesPerDay` (5–60);
- `coachDailyLimit` (1–200);
- `testWarnLimit` (1–10, mặc định 3);
- `levelUp`, mặc định:

  | Trường | Mặc định |
  |---|---|
  | `lessons` | 90 |
  | `firstTry` | 75 |
  | `submission` | 80 |
  | `coach` | 4 |
  | `coachTurns` | 6 |
  | `wrong` | 30 |
  | `minParts` | 4 |

**Files:**
- Tạo mới: `packages/domain/src/course/{calendar,streak,index}.ts` cùng test.
- Migration: `0131_course_cycle.sql`. **Dùng lại bảng `programs` có sẵn làm Khoá học** (không tạo bảng mới). Kế hoạch chi tiết: `2026-11-23-phase1-course-calendar.md`.
- Sửa: `apps/api/src/modules/manager/routes.ts`, `packages/contracts/src/learning-contract.ts`.
- API trang chủ trả thêm `course { week, weeks, status, weekStart, isLastWeek, theme }`.

**Nghiệm thu:**
- Có test cho các trường hợp:
  - tuần 1, tuần giữa, tuần cuối;
  - sang khoá mới;
  - khoá bắt đầu sát cuối quý, cả khoá vẫn thuộc quý cũ;
  - Ngày thử và nút Nhảy tới tuần N;
  - chuỗi ngày đi qua cuối tuần;
  - khoá số tuần;
  - thông báo trước 1 tuần chỉ gửi 1 lần.
- Không đổi giao diện.

## Giai đoạn 2: Nội dung theo tuần (máy chủ, AI)

**Luật:**
- **Chủ đề tuần:**
  - gồm chủ đề, mô tả, mục tiêu, gợi ý từ khoá;
  - AI gợi ý tối đa 3 phương án, mỗi phương án có kế hoạch 5 ngày cho từng mức;
  - không trùng theo D2c;
  - sửa tay chủ đề thì kế hoạch 5 ngày bị bỏ.
- **Phân khối (D2):** tuần 1–2 là khối 1, tuần 3–4 là khối 2. Mỗi khối lấy 1 chủ điểm và 2 âm kế tiếp, dùng bộ nhớ lộ trình đang có.
- **Tài nguyên tuần:** tự sinh khi bấm Sinh, không có bước chốt riêng. Gồm 15 từ cốt lõi theo D2c, cộng từ mở rộng theo luật hiện tại.
- **Sinh 5 bài T2–T6:** dùng lại pipeline `monthly-day-generation.ts` và các bộ kiểm, cộng thêm luật Spec 3.15:
  - độ dài câu: A1 ≤ 9 từ, A2 ≤ 13, B1 ≤ 18, B2 ≤ 25, C1 ≤ 35;
  - lý thuyết ≥ 25 từ;
  - đủ 6 phần;
  - phát âm có 3 từ, IPA chứa âm mục tiêu.
- **Duyệt:** duyệt theo bộ (1 tuần × 1 mức).
  - Lỗi nặng chặn duyệt. Lỗi nhẹ phải bấm xác nhận.
  - Nội dung đã duyệt chỉ sửa được qua yêu cầu mở lại.

**Files:**
- Tạo mới: `apps/api/src/modules/content/weekly-*.ts`, `packages/domain/src/weekly/*`.
- Dùng lại `program_weeks`, `lesson_sets`. Thêm bảng ghi từ cốt lõi đã dùng theo mức, quý và khoá.
- Lấy lại phần gợi ý chủ đề từ `legacy/weekly-content/api/week-suggestion-generation.ts.txt`.

**Nghiệm thu:**
- Có test cho các trường hợp:
  - không trùng trong quý;
  - không trùng với khoá liền trước khi sang quý mới;
  - luật mềm cho A1;
  - danh sách cấm làm lại khi lên mức;
  - phân khối khoá 2 tuần và 4 tuần;
  - khoá sau tiếp đúng khối kế tiếp.
- Sinh thật trên 4300 đúng 1 tuần × 1 mức, hỏi người dùng trước.

## Giai đoạn 3: Màn Sinh bài của Vận hành — 🟡 GATE-UI

Sửa trên màn `/op/months` hiện có:
- **Chủ đề:** khối "Chủ đề tháng" thành danh sách tuần của khoá. Mỗi tuần là một thẻ chủ đề có nút Gợi ý AI.
- **Tài nguyên:** "Tài nguyên tháng" thành tài nguyên của tuần đang chọn, kèm ngữ pháp và phát âm của khối.
- **Lịch:** lịch tháng thành lưới tuần × 5 mức. Mỗi tuần có 5 ô T2–T6 với các nút Sinh, Soạn tay, Duyệt bộ bài.

Cất các panel chỉ phục vụ tháng.

## Giai đoạn 4: Luồng học viên — 🟡 GATE-UI

**Trang chủ (sửa trên màn hiện có):**
- Lịch tháng thành lộ trình tuần T2–T6.
- Thêm dòng "Khoá học · Tuần N/N · chủ đề tuần".
- Chỉ số tháng thành chỉ số tuần.
- Bỏ "Vắng x/y", thẻ học thử, màn khoá do vắng.
- Thẻ thi tháng thành thẻ bài thực hành tuần và thẻ bài cuối kỳ.

**Luật mở bài:** bài chỉ mở khi đủ 4 điều kiện:
- bộ bài đã duyệt;
- đúng mức của học viên;
- bài trước trong tuần đã xong;
- đã tới ngày học.

T6 là bài mới.

**Vào giữa khoá:** học viên học ngay tuần hiện tại và học bù các bài trước trong khoá. Bỏ luật "học thử".

**Menu:** "Bài tháng" đổi thành **"Bài tuần"**.

**Cất legacy:** `WeeklyReview.tsx`, `LockedLearnerSupport.tsx`, `monthly-uncounted.ts`, và `LevelReadiness` bản tháng.

## Giai đoạn 5: Bài thực hành cuối tuần — 🟡 GATE-UI

**Luật (Spec 3.7):**
- **Đề theo mức:**
  - A1–A2: 3–5 câu, dùng ít nhất 3 từ của tuần;
  - B1: 80–120 từ, có 1 vấn đề và 1 đề xuất;
  - B2 trở lên: hội thoại 8–12 dòng hoặc bài 120–180 từ.
- **Nộp bài:** khoá cho tới khi học xong 5 bài. Mỗi tuần nộp 1 lần. Tối thiểu 8 từ.
- **Chấm:** Ý 40%, Từ vựng 30%, Ngữ pháp 30%. Bài lạc đề thì Ý ≤ 1 và tổng ≤ 30.
- **Kháng nghị và chấm tay:**
  - kháng nghị được 1 lần;
  - bài đã chấm tay thì không kháng nghị nữa;
  - không có AI thì chấm tay theo công thức (Ý×0,4 + Từ×0,3 + NP×0,3)×20.

**Màn hình:**
- Học viên: mục "Bài tuần" (route `/monthly` cũ).
- Vận hành: tab "Bài nộp" trong màn Phản hồi và yêu cầu.
- API `/engagement/practice` đã có sẵn.

## Giai đoạn 6: Bài cuối kỳ, Pass Course, khảo sát — 🟡 GATE-UI

**Bài cuối kỳ (D9, D10):**
- **Sinh đề:** dùng lại bộ sinh đề tháng, đổi phạm vi thành các tuần của khoá.
- **Đề:** 4 kỹ năng, 100 điểm, theo mức của học viên. Mỗi mức có 1 đề cho mỗi khoá. Vận hành duyệt rồi mới phát hành.
- **Thời lượng:** 30 hoặc 60 phút.
- **Thời gian làm:** mở suốt tuần cuối khoá, mỗi người làm 1 lần.
- **Đạt:** tổng ≥ 70 và mỗi kỹ năng ≥ 50%. Vận hành có kết luận cuối, kèm lý do và lưu vết.
- **Kết quả dùng cho:** "Có tiến bộ" và xét lên mức. Không có chứng nhận.

**Pass Course (D9c):** giữ đề và thời lượng 90 phút. Điều kiện vào thi: đang ở C1 và đã đạt ít nhất 1 bài cuối kỳ ở C1. Đạt thì nhận chứng nhận tốt nghiệp.

**Khảo sát cuối khoá (D8):** hiện sau khi nộp bài cuối kỳ.

**Đổi tên và cất legacy:**
- Tab "Bài thi tháng" đổi tên thành "Bài cuối kỳ".
- Cất: điều kiện dự thi tháng, khiếu nại vắng, giờ đóng đề 23:25.

## Giai đoạn 7: Lên và hạ mức ở cuối khoá — 🟡 GATE-UI

**Luật (D2d, D5):**
- Xét ở cuối khoá, khoảng xét là cả khoá, dùng 7 ngưỡng trong Cài đặt.
- **Hỏi người dùng:** có thêm điều kiện "phải đạt bài cuối kỳ" không.
- **Lên mức:** đủ ngưỡng thì học viên thi đề lên mức (`/op/levelforms`), sau đó Vận hành duyệt.
- **Hạ mức:** tỉ lệ sai > 30%, chỉ tính tuần có ít nhất 4 phần. Không xét A1. Vận hành quyết định.
- **Áp dụng:** mức mới áp dụng từ khoá kế tiếp, có lưu lịch sử.
- **Trượt:** được xét lại ở cuối khoá sau.

**Màn hình:**
- Sửa khối "Đường lên mức".
- Sửa màn Duyệt mức, đổi tiêu đề cũ "Tín hiệu đổi mức (14 ngày gần nhất)".

**Cất legacy:** `progression/monthly-eligibility.ts`.

## Giai đoạn 8: Điểm, huy hiệu, mùa — 🟡 GATE-UI

**Bước đầu: gửi người dùng duyệt bảng số D6.**
- Lấy luật của bản tháng, thu nhỏ theo độ dài khoá.
- Giả lập 3 kiểu học viên: chăm chỉ, trung bình, thất thường. Cho biết mỗi kiểu mất bao nhiêu tuần để lên từng mùa.

**Sau khi được duyệt:**
- Sửa `season-rewards.ts`, cất bản tháng.
- Màn giả lập phần thưởng dùng số mới.
- Tính lại điểm cho học viên thật ở GĐ11.

**Giao diện:** giữ thẻ phần thưởng và popup hiện có, chỉ đổi số và danh sách huy hiệu.

## Giai đoạn 9: Quản lý, Coach, Mini game, Cài đặt, thông báo — 🟡 GATE-UI

**Quản lý:**
- **4 chỉ số của khoá:**

  | Chỉ số | Cách tính | Ngưỡng đạt |
  |---|---|---|
  | Học đều | Tỉ lệ học viên có ≥ 3 buổi mỗi tuần | ≥ 70% |
  | Học đến cuối | Tỉ lệ học viên học tới cuối khoá | ≥ 60% |
  | Có tiến bộ | Tỉ lệ học viên đạt bài cuối kỳ | ≥ 70% |
  | Hài lòng | Điểm khảo sát trung bình | ≥ 4/5 |

- Cột tiến độ chuyển sang theo tuần.
- Báo cáo đổi thành báo cáo khoá học.
- Cất `MonthlyOverview.tsx`.

**Coach:**
- Chủ đề lấy theo chủ đề tuần.
- Giới hạn chat mỗi ngày lấy từ Cài đặt.
- "Tháng x/100" đổi thành mục tiêu tuần. Con số chốt cùng D6.

**Mini game:** "Dùng từ vựng tuần này".

**Cài đặt:** các thẻ theo D2f.

**Thông báo:**
- Thêm thông báo trước khi hết khoá 1 tuần.
- Bỏ các thông báo về vắng học và khoá tài khoản.

## Giai đoạn 10: Rà toàn bộ

- Mọi màn đã đổi × mọi vai trò × các độ rộng 390, 768, 1024, 1440.
- Tìm các chữ "tháng" và "pilot" còn sót.
- Chạy test, typecheck, CI.
- Gửi ảnh trước và sau.

## Giai đoạn 11: Chuyển dữ liệu và triển khai

- **Script chuyển học viên thật:**
  - giữ lịch sử, điểm, huy hiệu, mức;
  - tạo khoá đầu tiên;
  - ghi từ cốt lõi đã dạy trong quý hiện tại vào danh sách cấm;
  - tính lại điểm theo D6.
- **Chạy thử** trên bản sao dữ liệu 4175 đặt ở 4300.
- **Triển khai 4175:** chỉ khi người dùng nói "Sync 4175", và phải sao lưu ngay trước đó.

---

## Thứ tự làm

1. GĐ0, rồi GĐ1.
2. Hai nhánh chạy song song:
   - nội dung: GĐ2 → GĐ3 → GĐ4 → GĐ5 → GĐ6;
   - luật: GĐ7 → GĐ8.
3. Hai nhánh gặp nhau ở GĐ9.
4. GĐ10, rồi GĐ11.

Mỗi giai đoạn từ GĐ1 trở đi sẽ có kế hoạch chi tiết riêng (TDD, từng bước) trong `docs/superpowers/plans/`, viết ngay trước khi làm.

**Việc ngoài code:** báo chủ sản phẩm 2 điều. Thứ nhất, nhịp lộ trình đổi thành 1 chủ điểm và 2 âm cho mỗi 2 tuần. Thứ hai, các ngày "kết hợp A+B" được thay bằng ngày luyện sâu 1 chủ điểm.
