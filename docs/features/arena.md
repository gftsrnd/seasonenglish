# Đấu trường từ vựng — thiết kế và yêu cầu giao diện

Gộp từ hai file làm việc ngày 18–19/11/2026. Phần 1 là yêu cầu giao diện mới nhất; phần 2 là thiết kế đợt 1–2 (luật điểm, ghép trận).

---

## Phần 1 — Yêu cầu giao diện (19/11)


- **Mini game › mục 4. Đấu trường**, dùng bộ từ ở mục 2. Mục này có ô chọn trò, nút **Đấu xếp hạng** (hiện xác nhận trước) và nút **Mời giao hữu** (ô tìm tên mở ngay trong mục, không dùng popup). **Trận của bạn** tối đa 3 dòng, trận huỷ hoặc hết hạn tự biến mất. Dưới B1 chỉ ghi "Mở từ B1".
- Có thách đấu đang chờ thì vào chơi ngay. Không có thì đăng thách đấu và ở lại trang, có người nhận sẽ báo ở chuông. Không có màn chờ.
- **Màn Bảng xếp hạng** (`/arena`): link về Mini game, "Xếp hạng B1" kèm ⓘ, chip lọc theo trò, danh sách có nút **Mời** từng dòng (chọn trò ngay trong dòng). Không có bục. Huy chương chỉ cho người giữ riêng hạng 1–3. Khi chưa ai có kết quả thì chỉ hiện 1 dòng thông báo.

---

# Đấu trường – thiết kế đã chốt (18/11): 2 màn

**Chốt cuối cùng của owner, thay cho phần 4 màn ở dưới (phần dưới chỉ để tham khảo dữ liệu và trạng thái).**

1. **Vào đấu trường từ một card riêng ở cuối trang Mini game** (owner sửa 19/11; không gắn nút "Đấu" vào các thẻ game cá nhân):
   - dưới B1: card mờ, ghi "Mở từ B1. Bạn đang ở mức A2.";
   - từ B1: bấm card thì vào màn Đấu trường.
   Trong màn Đấu trường, phần **"Chọn trò để đấu"** có 6 nút trò. Bấm một trò:
   - nếu có thách đấu cùng trò, cùng cấp đang chờ thì vào trận đó;
   - nếu không thì tự đăng thách đấu.
   Bộ từ là bộ đang chọn ở Mini game.
2. **Màn 1 – Game:**
   - màn chơi có sẵn, thêm dòng nhỏ "Xếp hạng · đối thủ ẩn";
   - chơi xong hiện **thẻ kết quả** ngay trên màn game:
     - đối thủ chưa chơi: "Chờ đối thủ, có kết quả sẽ báo ở chuông";
     - đã có kết quả: thắng / thua / hoà, tên đối thủ, hai điểm ván, chip "+50 điểm xếp hạng", một dòng giải thích, nút "Đấu tiếp".
3. **Màn 2 – Đấu trường** (sửa 19/11: bố cục giống trang Mini game – link "Về Mini game", tiêu đề trang, các card đánh số 1. Chọn trò để đấu · 2. Trận của bạn · 3. Bảng xếp hạng · 4. Giao hữu; bấm trò thì hiện hộp xác nhận; được Huỷ thách đấu chưa ai nhận và Bỏ trận đã nhận (tính thua)):
   - trên cùng: "Đấu trường B1 · ⓘ luật" (**không hiện "Hạng x/y"**); "Chọn trò để đấu"; "Trận của bạn" (tối đa 3 dòng, trận tới lượt có nút Chơi);
   - **3 hạng đầu có số hạng đặc biệt:** huy hiệu SVG mới vẽ theo đúng style app (vàng / bạc / đồng, hợp 7 mùa); hạng 4 trở đi là số thường;
   - chip Tổng / 6 trò; danh sách hạng có phân trang;
   - link "Mời bạn giao hữu".
4. Bấm thông báo chuông "Trận đã có kết quả" thì mở thẻ kết quả.
5. Màu và linh vật theo giao diện mùa đang dùng (7 mùa).

---

# Đấu trường – yêu cầu tài nguyên giao diện (đợt 3)

Phần chạy bên dưới (đợt 1 + 2) đã xong trên nhánh `codex/arena-scoring` (commit e154a7b7). Tài liệu này mô tả những gì giao diện cần vẽ: màn, trạng thái, dữ liệu có sẵn và chữ hiển thị. Bố cục tham khảo: bản phác thảo trong `outputs/E4S-dau-truong-phac-thao`. Chỉ dành cho học viên B1, B2, C1.

## Luật cần nhớ khi vẽ

- **Xếp hạng chỉ có thách đấu mở.** Danh sách thách đấu **không hiện tên người đăng**. Tên đối thủ chỉ hiện khi trận đã chốt.
- **Không hiện trước số điểm +/−,** chỉ có nhãn "Ngang sức / Đối thủ mạnh hơn / Đối thủ yếu hơn".
- **Giao hữu:** mời đích danh một người, không tính XH. Không có đấu máy.
- **Điểm ván** 0–100. **Điểm XH:** mỗi trò bắt đầu 1.000. **Tổng** = cộng 6 trò.
- **Giới hạn:** mỗi người tối đa 3 trận xếp hạng đang mở. Hết hạn nhận 24 giờ, hết hạn chơi 24 giờ.

## 4 màn

### M1 – Đấu trường (trang chính)

**Dữ liệu có sẵn:**
- cấp;
- mùa (ngày bắt đầu, ngày kết thúc);
- điểm XH 6 trò và tổng;
- hạng "x/y";
- số trận xếp hạng đang mở (tối đa 3);
- danh sách trận của mình: đang mở / đang chơi / đã xong.

**Khu vực:**
1. **Đầu trang:** "Đấu trường B1" kèm ⓘ luật; Hạng x/y; Tổng XH; Mùa · còn N ngày.
2. **Hai nút chuyển:** Xếp hạng | Giao hữu.
3. **Xếp hạng:**
   - khung **Đăng thách đấu**: chọn trò (6 trò); chọn bộ từ ("Bộ đang học" hoặc "Bộ của bạn: <chủ đề>" kèm nút Đổi bộ); nút Đăng.
   - danh sách **Thách đấu đang mở**: mỗi dòng có trò, chủ đề bộ từ, thời gian còn lại, nút Nhận. Có phân trang.
4. **Giao hữu:** chọn trò, chọn người (có thể khác cấp), chọn bộ, nút Mời.
5. **Trận của bạn:** mỗi dòng có trò · chế độ · trạng thái · nút. Phân trang.
6. **Bảng xếp hạng thu nhỏ:** top 3 và dòng của mình, cùng link "Xem bảng xếp hạng".

**Trạng thái dòng "Trận của bạn":**

| Trạng thái | Chữ | Nút |
|---|---|---|
| Đang chờ người nhận (mình đăng) | "Chờ người nhận · còn 18 giờ" | — |
| Đã có người nhận, tới lượt mình | "Tới lượt bạn · còn 20 giờ" | Vào đấu |
| Mình đã chơi, chờ đối thủ | "Chờ đối thủ · còn 12 giờ" | Xem |
| Lời mời giao hữu tới mình | "<Tên> mời bạn giao hữu · <trò>" | Nhận / Từ chối |
| Đã chốt | "Thắng / Thua / Hoà · 73–64 · +50" | Kết quả |
| Hết hạn / huỷ / từ chối | "Hết hạn" / "Đã huỷ" / "Đã từ chối" | — |

**Trạng thái trống và lỗi cần vẽ:**
- Chưa có thách đấu nào.
- Đã đủ 3 trận đang mở (nút Đăng bị khoá, ghi lý do).
- Bộ từ chưa đủ từ.
- Dưới B1: chưa mở đấu trường.
- Chưa có mùa.

### M2 – Trận đấu (đang chơi)

- **Đầu trang:** "Xếp hạng B1 · <trò> · <chủ đề bộ>". Bên phải là khung Trận đấu: "Bạn · Đang chơi", "Đối thủ · Đã chơi / Chưa chơi" (xếp hạng thì chưa hiện tên).
- **Màn chơi** của 6 game, với thanh HUD đã có: tiến độ, điểm, combo, thời gian, mạng.
- **Nút Thoát** mở hộp xác nhận: "Thoát bây giờ sẽ tính thua trận xếp hạng." Hai nút: Tiếp tục chơi / Thoát và chịu thua.
- **Mất mạng:** vào lại thì chơi tiếp (trong hạn).
- **Trên điện thoại:** khung Trận đấu chuyển xuống dưới, thu gọn.

### M3 – Kết quả trận

**Dữ liệu có sẵn:**
- thắng / thua / hoà;
- cách quyết định: điểm / thời gian / bỏ trận / quá hạn;
- điểm ván hai bên;
- thời gian;
- điểm XH trước → sau;
- mức gốc;
- lần gặp trong ngày;
- tỷ lệ;
- số điểm chuyển;
- tên đối thủ (lúc này mới hiện).

**Khu vực:**
1. **Kết quả:** "Bạn thắng!" / "Bạn thua" / "Hoà", kèm linh vật hai bên.
2. **Điểm ván:** hai số lớn, ví dụ **73** và **64**, kèm "8/11 câu đúng".
3. **Lý do,** một trong các câu:
   - "Điểm ván của bạn cao hơn."
   - "Hai bên bằng điểm; bạn hoàn thành nhanh hơn."
   - "Đối thủ bỏ trận."
   - "Đối thủ không chơi trong 24 giờ."
4. **Điểm XH:** chip "+50 điểm xếp hạng" và một dòng giải thích ngắn: "Ngang sức · lần gặp 1 · Season-rio 1.000 → 1.050 · Tổng 6.000 → 6.050".
   - Giao hữu thay bằng dòng "Giao hữu không tính điểm xếp hạng".
5. **Xem lại từ trong trận:** các từ bạn làm sai.
6. **Nút:** Về đấu trường; Đăng thách đấu mới.

### M4 – Bảng xếp hạng

- **Bộ lọc:** cấp (B1 / B2 / C1), trò (Tổng / 6 trò), mùa.
- **Máy tính:** bảng gồm cột Hạng, Tên, 6 cột trò, Tổng.
- **Điện thoại:** chỉ Hạng · Tên · Tổng; bấm vào một dòng thì mở 6 trò.
- **Dòng của mình** được tô nền, kèm "Hạng x/y". Bằng điểm thì đồng hạng.
- **Trạng thái trống:** chưa ai đấu trong mùa này.

## Popup và chữ cố định

- **ⓘ Luật đấu trường,** 5 ý:
  1. Thắng thua so điểm ván; bằng điểm thì ai nhanh hơn thắng.
  2. Mỗi trò bắt đầu 1.000 điểm. Thắng người mạnh hơn được nhiều hơn; thua người yếu hơn mất nhiều hơn (bảng 5 mức).
  3. Gặp lại cùng người trong ngày: lần 2 tính 50%, lần 3 tính 25%, từ lần 4 không tính.
  4. Thách đấu mở: không biết trước đối thủ; đã nhận phải đấu; 24 giờ để chơi; quá hạn tính thua; tối đa 3 trận đang mở.
  5. Mỗi mùa 3 tháng.
- **Hộp xác nhận khi bấm Nhận:** "Nhận thách đấu <trò> · <chủ đề>? Đã nhận thì phải đấu trong 24 giờ." Hai nút: Huỷ / Nhận.
- **Thông báo chuông** (đã có sẵn): "Tới lượt bạn chơi", "Trận đã có kết quả".
- **Ván đấu trường** được tính như một lượt mini game cho điểm rèn luyện (50/100 thì +5, chung hạn mức 3 lượt mỗi ngày).

## Bên Quản lý

- **Cài đặt › Mùa xếp hạng:** chọn ngày bắt đầu mùa đầu tiên; mỗi mùa 3 tháng.
- **Đổi ngày khi đã có trận:** phải xác nhận, và chỉ áp dụng từ mùa sau.
- **Trạng thái:** đã có API, chưa có ô trên giao diện.

## Tham khảo kích thước

- Theo luật giao diện điện thoại của dự án.
- Tablet dùng bố cục máy tính.


---

## Phần 2 — Thiết kế đợt 1–2 (18/11)


Ngày 18/11/2026. Dựa trên `RULE-DAU-TRUONG.md` và các quyết định owner đã chốt. Làm trên nhánh `codex/deploy-web-fallback`, chạy thử ở 4300, chưa đụng 4175. **Nguyên tắc: làm đơn giản, chỉ những gì có trong luật và đã chốt.**

## 0. Quyết định đã chốt

| Mục | Chốt |
|---|---|
| Đối tượng | Chỉ B1, B2, C1. Mỗi cấp một bảng xếp hạng riêng |
| Điểm ván | 0–100, số nguyên. Đúng ngay +10; từ câu thứ 3 liên tiếp +15; gợi ý hoặc thử lại +5; sai, bỏ qua, hết giờ 0 |
| Thắng thua | Điểm ván cao hơn thắng. Bằng điểm thì ai chơi nhanh hơn thắng (cùng đề). Vẫn bằng thì hoà |
| Điểm XH | Mỗi trò, mỗi cấp, mỗi mùa bắt đầu 1.000. Cộng trừ theo bảng 5 mức. Gặp lại trong ngày giảm 100/50/25/0%. Không âm (sàn 0). Lên cấp thì bắt đầu lại 1.000 |
| Xếp hạng | **Chỉ thách đấu mở.** Đăng trận, ai cùng cấp nhận trước thì đấu, lúc nhận chưa biết đối thủ. Đã nhận thì phải đấu. Không hiện trước số +/− |
| Giao hữu | Mời đích danh (khác cấp được), người được mời có thể từ chối. Không tính XH. **Không có đấu máy** |
| Bộ từ | "Bộ đang học" (mặc định) hoặc bộ Mini game của người đăng. Ô "Đổi nguồn từ" dùng lại ngay trong màn tạo trận. Người nhận thấy trò và chủ đề bộ từ |
| Thời hạn | Chưa ai nhận: hết hạn sau 24 giờ. Đã nhận: mỗi bên có 24 giờ để chơi. Một bên quá hạn thì bên đó thua; cả hai quá hạn thì huỷ. Mất mạng không tính thua, vào lại chơi tiếp |
| Chụp điểm | Điểm XH và lần gặp trong ngày được chụp lúc nhận trận |
| Giới hạn | Mỗi cặp 1 trận xếp hạng đang mở. Mỗi người tối đa 3 trận xếp hạng đang mở (tính cả trận đăng và trận nhận) |
| Ngày, mùa | Giờ Việt Nam, theo ngày hệ thống của tổ chức. Mùa 3 tháng; Quản lý đặt ngày bắt đầu trong Cài đặt |
| Hứng từ | Hứng sai hoặc để rơi: 0 điểm và mất 1 mạng |
| Điểm rèn luyện | Mỗi ván đấu trường là một lượt mini game: điểm ván từ 50/100 thì +5, chung hạn mức 3 lượt mỗi ngày với chơi thường. XH không cộng vào điểm rèn luyện hay huy hiệu |
| Kỷ lục | Chuyển sang /100. **Làm mới từ ngày đổi luật**; dữ liệu cũ vẫn lưu nhưng không hiện làm kỷ lục |
| Thông báo chuông | Chỉ 2 loại: "Tới lượt bạn chơi" (có người nhận thách đấu của bạn, hoặc bạn được mời giao hữu) và "Trận đã có kết quả" |
| Không làm | Đấu máy, đấu bóng ma, thử thách tuần, huy hiệu hay quà cho đấu trường, chống gian lận phức tạp, màn duyệt nhiều bộ từ |

---

## ĐỢT 1: Luật điểm chung cho 6 game

Chơi lẻ hay chơi trong đấu trường đều tính điểm ván 0–100 theo cùng một luật. Server tự chấm từ dữ liệu từng câu, như hiện nay.

### 1.1 Hàm chấm chung (packages/domain)

- `scoreRound(units, answers)` trả về `{ raw, rawMax, score }`.
- **Đầu vào:**
  - `units`: N đơn vị đã giao **từ đầu ván**, cố định.
  - `answers`: kết quả của từng đơn vị, một trong `first_try` | `assisted` | `wrong` | `skipped` | `timeout` | `unanswered`.
- **Cộng điểm:**
  - `first_try`: +10 nếu là câu 1–2 của chuỗi, +15 từ câu 3 liên tiếp trở đi.
  - `assisted`: +5, ngắt chuỗi.
  - Còn lại: 0, ngắt chuỗi.
- **Quy đổi:**
  - `rawMax = N==1 ? 10 : 20 + 15·(N−2)`;
  - `score = làm tròn nửa lên(100·raw/rawMax)`.
- **Test** theo mục D của luật:
  - ví dụ 8 câu cho 85/110 = 77;
  - N=1 có mẫu số 10;
  - hết mạng sớm vẫn giữ nguyên mẫu số;
  - sai rồi đúng chỉ +5;
  - sau khi đứt chuỗi là +10, +10 rồi mới +15.

### 1.2 Sửa cách chấm từng game

| Game | Đơn vị | Sửa |
|---|---|---|
| Xếp chữ | 1 từ, N ≤ 8 | Chuyển sang hàm chung (đã có dữ liệu số lần thử và gợi ý) |
| Ô chữ | 1 từ trong lưới | N = số từ thực sự xếp vào lưới, server chốt khi tạo ván. Ghi riêng từng từ (đúng ngay / có gợi ý / sai rồi sửa); gợi ý tính theo từ |
| Hứng từ | 1 lượt hứng | Để rơi = 0 điểm và mất mạng |
| Season-rio | 8 cổng + 3 câu boss | Boss sai rồi đúng chỉ +5. Không lặp từ của cổng; thiếu từ thì dùng N thực tế |
| Phân loại từ | 1 từ, N ≤ 12 | Bỏ combo riêng, dùng hàm chung |
| Đua gõ từ | 1 từ, N ≤ 10 | Bỏ combo ×1–×5 và mốc 400. Gõ sai rồi đúng trong giờ: +5 |

### 1.3 Thời gian chơi

- Client gửi thời gian thao tác của từng câu, không tính lúc tải, đếm ngược hay chuyển cảnh.
- Server cộng lại và kiểm tra hợp lý. Số không hợp lệ thì vẫn lưu ván, nhưng không dùng để phân thắng thua.
- Thời gian **chỉ dùng khi hai bên bằng điểm** và cùng đề.

### 1.4 Hiển thị (chỉ phần luật bắt buộc)

- **Màn chơi:** tiến độ, điểm thô, combo, thời gian, mạng (nếu game có). Theo luật M04.
- **Dòng "Điểm" trong màn Hướng dẫn chơi:** đổi thành câu chung cho 6 game: "Đúng ngay +10, từ câu thứ 3 liên tiếp +15; gợi ý hoặc thử lại +5; sai 0. Điểm ván tối đa 100." Riêng Hứng từ thêm "Hứng sai hoặc để rơi: mất 1 mạng".
- **Kỷ lục và kết quả chơi lẻ:** hiện điểm ván /100.
- **Điểm rèn luyện:** đổi "đạt 50% điểm tối đa" thành "đạt 50/100" ở chỗ ghi luật.
- **Rà mọi chỗ** đang hiện điểm game (kể cả bên Quản lý) và đổi sang /100.

### 1.5 Dữ liệu (migration 0128)

- `game_results`: thêm `arena_score`, `raw_score`, `raw_max`, `gameplay_ms`, `units_assigned`, `rules_version`.
- `game_sets`: lưu danh sách đơn vị đã giao khi tạo ván.
- Kỷ lục mới chỉ tính các ván có `rules_version` mới.

### 1.6 Kiểm tra

- Unit test hàm chấm và từng game.
- Test gửi lại kết quả không bị chấm hai lần.
- Chơi thật 6 game trên 4300, ở điện thoại và máy tính, chụp ảnh trước/sau.

---

## ĐỢT 2: Điểm XH, thách đấu mở, giao hữu, sổ trận

### 2.1 Dữ liệu mới (migration 0129)

- **`arena_seasons`:** tổ chức, ngày bắt đầu, ngày kết thúc, trạng thái. Ngày bắt đầu mùa đầu tiên lấy từ Cài đặt của Quản lý.
- **`arena_ratings`:** học viên × trò × cấp × mùa, `rating ≥ 0` (mặc định 1.000).
- **`arena_matches`** (sổ trận):

  | Nhóm cột | Nội dung |
  |---|---|
  | Chung | chế độ (ranked/friendly), trò, cấp, mùa |
  | Người chơi | người đăng hoặc mời, người nhận |
  | Đề | bộ từ đã chụp và danh sách đơn vị; loại bộ (đang học / cá nhân) và chủ đề |
  | Trạng thái | mở → đã nhận → đã chốt / hết hạn / huỷ / từ chối (giao hữu) |
  | Thời gian | giờ đăng, giờ hết hạn nhận, giờ nhận, hạn chơi |
  | Điểm chụp | điểm XH hai bên lúc nhận, lần gặp trong ngày |
  | Kết quả | kết quả của hai bên, thắng/thua/hoà và cách quyết định (điểm / thời gian / bỏ trận / quá hạn) |
  | Cộng trừ | mức gốc, tỷ lệ, số điểm chuyển, điểm trước và sau của hai bên |

- **Ràng buộc:** 1 trận xếp hạng đang mở mỗi cặp; tối đa 3 trận đang mở mỗi người. Cả hai kiểm tra trong transaction có khoá.

### 2.2 Luật tính (packages/domain)

- **Bảng 5 mức** theo chênh lệch điểm chụp lúc nhận:
  - dưới 200: ±50;
  - 200–499: +75 / −25 hoặc +25 / −75;
  - từ 500: +90 / −10 hoặc +10 / −90.
- **Giảm khi gặp lại:** lần 1 = 100%, lần 2 = 50%, lần 3 = 25%, từ lần 4 = 0%.
- **Số điểm chuyển** = làm tròn(mức gốc × tỷ lệ), không vượt số điểm bên thua đang có (sàn 0). Bên thắng cộng đúng số bên thua mất.
- **Tổng** = cộng 6 trò của mùa và cấp đó; trò chưa chơi tính 1.000.
- **Test:**
  - các mốc 199/200 và 499/500;
  - chuỗi 50 → 50, 25, 13, 0;
  - sàn 0, hoà, thắng nhờ thời gian.

### 2.3 Chức năng (API)

| Việc | Ghi chú |
|---|---|
| Xem đấu trường | Điểm 6 trò và tổng, hạng, trận của mình (đang mở / chờ / đã xong) |
| Danh sách thách đấu mở | Cùng cấp; chỉ hiện trò, chủ đề bộ, giờ hết hạn; không hiện tên |
| Đăng thách đấu | Kiểm tra B1+, đủ từ, chưa quá 3 trận |
| Nhận thách đấu | Hai người bấm cùng lúc thì chỉ một người được. Chụp điểm và lần gặp |
| Mời giao hữu / nhận / từ chối | Mời đích danh, hết hạn 24 giờ |
| Bắt đầu chơi / nộp kết quả | Dùng lại đường chấm của đợt 1, không chấm hai lần. Đủ hai bên thì chốt trận |
| Bỏ trận | Bấm Thoát sau khi đã bắt đầu, có xác nhận: tính thua |
| Bảng xếp hạng | Theo cấp, trò hoặc tổng, mùa; có "Hạng x/y" |

- **Job định kỳ:** chuyển thách đấu quá hạn sang hết hạn; xử thua hoặc huỷ các trận quá hạn chơi. Mỗi trận chỉ chốt một lần.
- **Đổi cấp:** huỷ các trận đang mở của người đó, không cộng trừ.
- **Chuông:** 2 loại như mục 0.
- **Cài đặt mùa** (Quản lý): chọn ngày bắt đầu. Đổi ngày khi đã có trận thì phải xác nhận, và chỉ áp dụng từ mùa sau.

### 2.4 Kiểm tra

- Unit test luật tính.
- **Integration:**
  - hai người cùng nhận một thách đấu;
  - giới hạn 3 trận;
  - 1 trận mỗi cặp;
  - quá hạn;
  - gửi lại kết quả;
  - đổi cấp;
  - giao hữu không đổi XH;
  - ván đấu trường dùng chung hạn mức 3 lượt điểm rèn luyện.
- Chạy thật trên 4300 với 2 tài khoản QA B1.

---

## Các đợt sau (chỉ ghi để biết, chưa làm)

- **Đợt 3, màn hình:** **4 màn** theo bố cục bản phác thảo của owner (chờ owner duyệt): Đấu trường, Trận đấu, Kết quả, Bảng xếp hạng.
  - Phòng chờ thành hộp xác nhận khi nhận trận.
  - Chờ kết quả và lịch sử nằm trong danh sách "Trận của bạn".
  - Luật đấu trường đặt trong ⓘ cạnh tiêu đề (theo luật H01), gồm 5 ý ngắn.
  - Kết quả có một dòng giải thích điểm XH (theo luật H04).
- **Đợt 4:** đóng và mở mùa, reset theo từng đoạn, lưu bảng xếp hạng cuối mùa.
