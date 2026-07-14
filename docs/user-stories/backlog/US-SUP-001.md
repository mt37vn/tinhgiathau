# User Story

## ID
US-SUP-001

## Title
Đánh giá nhà cung cấp dựa trên lịch sử báo giá, giá nhập, giá trúng thầu và tỷ lệ thắng

## Actor
Nhân viên kinh doanh (employee), Quản trị viên (admin)

## User Story
**Là** nhân viên kinh doanh,
**tôi muốn** hệ thống tự động tổng hợp và đánh giá hiệu quả của từng nhà cung cấp dựa trên lịch sử báo giá, giá nhập thực tế, giá trúng thầu và tỷ lệ thắng của các gói thầu có sử dụng nhà cung cấp đó,
**để** tôi có thể chọn được nhà cung cấp tốt nhất (giá cạnh tranh, tỷ lệ trúng thầu cao) khi lập đề xuất giá cho dự án mới.

---

# Business Value

| Giá trị | Mô tả |
|---------|-------|
| **Tăng tỷ lệ trúng thầu** | Chọn nhà cung cấp có giá nhập tốt giúp đưa ra giá chào cạnh tranh hơn |
| **Tiết kiệm thời gian** | Nhân viên không cần tra cứu thủ công lịch sử báo giá qua nhiều dự án |
| **Chuẩn hóa quyết định** | Dựa trên dữ liệu lịch sử thay vì cảm tính hoặc quan hệ cá nhân |
| **Đàm phán tốt hơn** | Có dữ liệu giá nhập lịch sử để làm cơ sở đàm phán với nhà cung cấp |
| **Minh bạch chi phí** | Ban lãnh đạo thấy được bức tranh tổng thể về hiệu quả của từng nhà cung cấp |

---

# Scope

Tính năng bao gồm:

1. **Gom nhóm nhà cung cấp** — Tự động chuẩn hóa tên nhà cung cấp từ các dự án đã có, gom nhóm các biến thể tên (VD: "Cty A", "Công ty A", "CTY TNHH A" → "Công ty A")
2. **Tổng hợp lịch sử** — Với mỗi nhà cung cấp, hiển thị:
   - Danh sách các dự án đã hợp tác (có trạng thái: trúng/trượt/chờ)
   - Giá nhập trung bình, cao nhất, thấp nhất theo từng mặt hàng
   - Giá chào của dự án khi sử dụng nhà cung cấp đó
   - Giá trúng thầu (nếu dự án đã trúng)
   - Tỷ lệ thắng (số dự án trúng / tổng số dự án đã tham gia có sử dụng nhà cung cấp)
3. **Xếp hạng nhà cung cấp** — Sắp xếp theo tỷ lệ thắng, giá nhập trung bình, hoặc điểm đánh giá tổng hợp
4. **Gợi ý nhà cung cấp** — Khi nhập hàng hóa mới, hệ thống gợi ý nhà cung cấp đã từng cung cấp mặt hàng tương tự với giá tốt nhất

---

# Functional Requirements

### FR-01: Gom nhóm và chuẩn hóa nhà cung cấp

| # | Mô tả |
|---|-------|
| FR-01.1 | Hệ thống quét tất cả `items[].nhaCungCap` trong toàn bộ dự án, tách thành danh sách nhà cung cấp duy nhất |
| FR-01.2 | Áp dụng chuẩn hóa tên: loại bỏ dấu câu thừa, viết hoa chuẩn, loại bỏ các từ viết tắt phổ biến (CTY→Công ty, TNHH→Trách nhiệm hữu hạn, etc.) để gom nhóm |
| FR-01.3 | Cho phép admin gộp/thủ công hợp nhất các nhà cung cấp trùng nhau |
| FR-01.4 | Mỗi nhà cung cấp có một ID duy nhất trong hệ thống (không còn là free-text thuần túy) |

### FR-02: Trang danh sách nhà cung cấp (Supplier Dashboard)

| # | Mô tả |
|---|-------|
| FR-02.1 | Hiển thị danh sách tất cả nhà cung cấp dạng bảng/card |
| FR-02.2 | Mỗi nhà cung cấp hiển thị: tên, số dự án đã hợp tác, tỷ lệ thắng (%), giá nhập trung bình, xếp hạng sao |
| FR-02.3 | Cho phép tìm kiếm, lọc theo tên nhà cung cấp |
| FR-02.4 | Cho phép sắp xếp theo: tên, tỷ lệ thắng, giá nhập TB, số dự án |

### FR-03: Trang chi tiết nhà cung cấp (Supplier Detail)

| # | Mô tả |
|---|-------|
| FR-03.1 | Hiển thị thông tin tổng quan: tên, tổng số dự án, số dự án trúng/trượt/chờ, tỷ lệ thắng |
| FR-03.2 | Biểu đồ xu hướng giá nhập theo thời gian (line chart) |
| FR-03.3 | Biểu đồ tỷ lệ thắng theo từng loại mặt hàng / lĩnh vực |
| FR-03.4 | Danh sách chi tiết các dự án đã hợp tác (project name, mã IB, giá nhập, giá chào, giá trúng thầu, trạng thái) |
| FR-03.5 | Thống kê giá nhập theo từng mặt hàng: giá TB, min, max, số lần cung cấp |

### FR-04: Gợi ý nhà cung cấp khi nhập hàng

| # | Mô tả |
|---|-------|
| FR-04.1 | Khi người dùng nhập tên hàng hóa (`tenHangHoa`), hệ thống tra cứu lịch sử nhà cung cấp đã từng cung cấp mặt hàng tương tự |
| FR-04.2 | Hiển thị dropdown gợi ý: tên nhà cung cấp, giá nhập trung bình gần nhất, tỷ lệ thắng |
| FR-04.3 | Tự động điền `donGiaNhap` nếu người dùng chọn nhà cung cấp từ gợi ý (có thể sửa lại) |

### FR-05: Đánh giá & xếp hạng

| # | Mô tả |
|---|-------|
| FR-05.1 | Hệ thống tự động tính **điểm tổng hợp** cho mỗi nhà cung cấp dựa trên công thức: `Score = w1 * WinRate + w2 * (1 - AvgPrice/IndustryAvg) + w3 * NumProjects` |
| FR-05.2 | Cho phép admin cấu hình trọng số (w1, w2, w3) |
| FR-05.3 | Xếp hạng sao (1-5) dựa trên điểm tổng hợp |

---

# Acceptance Criteria

### AC-01: Gom nhóm nhà cung cấp
- [ ] **AC-01.1** Khi có 3 dự án với `nhaCungCap` = "CTY TNHH A", "Công ty TNHH A", "Cty A", hệ thống tự động gom thành 1 nhà cung cấp "Công ty TNHH A"
- [ ] **AC-01.2** Admin có thể xem danh sách các biến thể tên đã gom và chỉnh sửa thủ công nếu cần

### AC-02: Danh sách nhà cung cấp
- [ ] **AC-02.1** Hiển thị đúng số lượng nhà cung cấp duy nhất sau khi gom nhóm
- [ ] **AC-02.2** Tỷ lệ thắng tính đúng: (số dự án trúng có sử dụng NCC) / (tổng số dự án đã có kết quả có sử dụng NCC) * 100
- [ ] **AC-02.3** Tìm kiếm theo tên NCC trả về đúng kết quả

### AC-03: Chi tiết nhà cung cấp
- [ ] **AC-03.1** Danh sách dự án hiển thị đúng các dự án có chứa nhà cung cấp được chọn
- [ ] **AC-03.2** Giá nhập trung bình tính đúng: `SUM(items[].giaNhap where nhaCungCap=X) / COUNT(items where nhaCungCap=X)`
- [ ] **AC-03.3** Khi click vào một dự án trong danh sách, chuyển đến trang chi tiết dự án đó

### AC-04: Gợi ý nhà cung cấp
- [ ] **AC-04.1** Khi gõ "Máy tính" vào `tenHangHoa`, dropdown gợi ý hiện các NCC từng cung cấp "Máy tính" cùng giá nhập gần nhất
- [ ] **AC-04.2** Chọn NCC từ dropdown tự động điền `donGiaNhap` với giá nhập gần nhất
- [ ] **AC-04.3** Nếu không có lịch sử cho mặt hàng đó, không hiện gợi ý (không gây phiền)

### AC-05: Phân quyền
- [ ] **AC-05.1** Employee xem được danh sách NCC và chi tiết
- [ ] **AC-05.2** Admin mới có quyền gộp nhóm NCC thủ công và cấu hình trọng số đánh giá

---

# Data Requirements

### Dữ liệu hiện có (không cần thêm)

| Nguồn | Field | Mô tả |
|-------|-------|-------|
| `projects.json.items[].nhaCungCap` | string | Tên nhà cung cấp (free-text hiện tại) |
| `projects.json.items[].donGiaNhap` | number | Đơn giá nhập |
| `projects.json.items[].giaNhap` | number | Thành tiền nhập |
| `projects.json.items[].tenHangHoa` | string | Tên hàng hóa |
| `projects.json.items[].soLuong` | number | Số lượng |
| `projects.json.status` | enum | Trạng thái dự án (để xác định trúng/trượt) |

> **Lưu ý:** Hiện tại hệ thống KHÔNG lưu thông tin dự án có "trúng thầu" hay không sau khi duyệt. Chỉ biết dự án ở trạng thái `approved`.

### Dữ liệu mới cần bổ sung

| Dữ liệu | Loại | Mục đích |
|---------|------|----------|
| `suppliers.json` | File mới | Danh sách nhà cung cấp chuẩn hóa (ID, name, aliases, createdAt) |
| `projects[].ketQuaTrungThau` | `"win"` / `"lose"` / `null` (chưa biết) | Xác định dự án trúng/trượt để tính tỷ lệ thắng |
| `projects[].giaTrungThau` | number (VNĐ) | Giá trúng thầu thực tế (nếu có) |
| `supplier_score_weights` | config file | Trọng số w1, w2, w3 cho điểm đánh giá |

---

# Affected Modules

| Module | Mức độ ảnh hưởng | Lý do |
|--------|-------------------|-------|
| **Project CRUD** | Cao | Cần thêm field `ketQuaTrungThau`, `giaTrungThau` vào project |
| **Item Management** | Cao | `nhaCungCap` từ free-text chuyển thành FK → Supplier; cần gợi ý khi nhập |
| **Frontend SPA** | Cao | Thêm 2 trang mới (Supplier list, Supplier detail); sửa item input (gợi ý NCC) |
| **Price Calculation** | Thấp | Có thể tham chiếu giá nhập lịch sử để gợi ý, nhưng không ảnh hưởng công thức tính |
| **Data Layer** | Cao | Cần file `suppliers.json` mới; thay đổi cấu trúc `projects.json` |
| **Share/Print** | Thấp | Có thể hiển thị thêm thông tin NCC trên trang in (tùy chọn) |

---

# Dependencies

| Phụ thuộc | Mô tả |
|-----------|-------|
| **Xác định trạng thái trúng thầu** | Cần quy trình nhập kết quả trúng/trượt thầu. Hiện tại không có chức năng này. |
| **Chuẩn hóa tên NCC** | Cần thư viện hoặc rule-based string normalization cho tiếng Việt |

---

# Out of Scope

1. **Quản lý hợp đồng với NCC** — Chỉ đánh giá, không quản lý hợp đồng, thanh toán, công nợ
2. **Quản lý chất lượng NCC** — Không đánh giá chất lượng hàng hóa, thời gian giao hàng
3. **Tự động gửi RFQ** — Không gửi yêu cầu báo giá tự động cho NCC
4. **Tích hợp hệ thống mua hàng bên ngoài** — Chỉ sử dụng dữ liệu nội bộ
5. **Machine Learning dự đoán** — Dùng công thức đơn giản, không dùng ML
6. **Import danh sách NCC từ Excel** — Chỉ dùng dữ liệu đã có trong hệ thống
7. **Dashboard tổng quan BI** — Chỉ biểu đồ trong trang chi tiết NCC

---

# Open Questions

### Q1: Xác định trạng thái trúng/trượt thầu
**Quyết định (PO, 14/07/2026):** Thêm trường `ketQuaTrungThau: "win" | "lose" | null` vào project, admin nhập thủ công sau khi có kết quả thầu.

### Q2: Mức độ tự động gom nhóm tên NCC
**Quyết định (PO, 14/07/2026):** Gợi ý gom nhóm dựa trên string similarity > 80%, admin xác nhận thủ công trước khi áp dụng.

### Q3: Tỷ lệ thắng tính theo cấp độ nào?
**Quyết định (PO, 14/07/2026):** Cấp dự án — tất cả NCC có item trong dự án trúng đều ghi nhận win. Ghi chú rõ trong UI.

### Q4: Giá trúng thầu lấy từ đâu?
**Quyết định (PO, 14/07/2026):** Tự động tra cứu kết quả từ cổng đấu thầu (mở rộng scraping module) nếu có. Nếu không lấy được, cho phép admin nhập thủ công `giaTrungThau`.

### Q5: Khi nào tạo supplier record?
**Quyết định (PO, 14/07/2026):** Tự động tạo supplier record realtime khi người dùng nhập tên NCC mới trong item.

### Q6: Tác động hiệu năng với JSON file storage
**Quyết định (PO, 14/07/2026):** Chấp nhận rủi ro hiệu năng. Dùng cache in-memory với TTL, tính toán realtime khi cache miss.

### Q7: Công nghệ biểu đồ cho frontend Vanilla JS?
**Quyết định (PO, 14/07/2026):** Dùng Chart.js (CDN) — biểu đồ đường cho xu hướng giá, biểu đồ cột cho tỷ lệ thắng theo mặt hàng.
