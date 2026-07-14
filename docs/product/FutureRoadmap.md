# Future Roadmap — Lộ trình tương lai

> ⚠️ **Lưu ý:** Đây là tài liệu ghi nhận ý tưởng, **không phải kế hoạch triển khai**. Các mục dưới đây chưa có cam kết thời gian hoặc nguồn lực. Mục đích là để tham khảo khi có cơ hội phát triển.

---

## 1. Mở rộng quy trình nghiệp vụ

### 1.1 Phê duyệt đa cấp (Multi-level Approval)

Bổ sung cấp phê duyệt trung gian: Trưởng phòng kinh doanh duyệt cấp 1, CEO duyệt cấp 2.

```
Employee → Pending (Cấp 1) → Approved (L1) → Pending (Cấp 2) → Approved (L2)
```

- Mỗi cấp có thể từ chối, trả về employee
- Cấu hình số cấp duyệt linh hoạt theo từng dự án hoặc theo ngưỡng giá trị

### 1.2 Quản lý danh mục nhà cung cấp (Supplier Management)

- Lưu danh sách nhà cung cấp, lịch sử báo giá
- So sánh giá nhập giữa các nhà cung cấp cho cùng một mặt hàng
- Đánh giá nhà cung cấp (giá, chất lượng, thời gian giao hàng)

### 1.3 Quản lý hợp đồng sau thầu (Post-bid Contract Management)

- Sau khi dự án được duyệt và trúng thầu, chuyển sang giai đoạn hợp đồng
- Theo dõi tiến độ thực hiện, nghiệm thu, thanh toán
- Lưu trữ hồ sơ hoàn công

### 1.4 Quản lý bảo hành (Warranty Tracking)

- Tự động tính thời gian bảo hành từng mặt hàng
- Gửi nhắc nhở khi sắp hết hạn bảo hành
- Lịch sử bảo hành, sửa chữa

---

## 2. Tính năng nâng cao

### 2.1 Dashboard phân tích (Analytics Dashboard)

- Thống kê số lượng dự án theo tháng, quý, năm
- Tỉ lệ duyệt / từ chối
- Giá trị trúng thầu, doanh thu ước tính
- Top nhân viên có nhiều đề xuất nhất
- Biểu đồ xu hướng giá chào so với giá dự toán

### 2.2 So sánh và tối ưu giá (Price Optimization)

- Tính toán nhiều kịch bản (what-if) với các tỉ lệ LNG khác nhau
- So sánh giá chào của các dự án tương tự trong quá khứ
- Gợi ý giá chào tối ưu dựa trên:
  - Tỉ lệ trúng thầu lịch sử
  - Giá dự toán của bên mời thầu
  - Số lượng đối thủ cạnh tranh (nếu có dữ liệu)

### 2.3 Kho hàng và tồn kho (Inventory)

- Quản lý hàng tồn kho thực tế
- Tự động đề xuất giá nhập dựa trên giá tồn kho
- Cảnh báo khi báo giá thấp hơn giá nhập thực tế
- Tích hợp xuất/nhập kho khi dự án được phê duyệt

### 2.4 Quản lý tài liệu đính kèm (Document Attachment)

- Đính kèm file PDF/Excel/Word vào dự án
- Upload hồ sơ năng lực, hồ sơ thầu
- Preview file ngay trong giao diện

---

## 3. Hạ tầng & Kỹ thuật

### 3.1 Chuyển đổi cơ sở dữ liệu

- Từ JSON file → PostgreSQL hoặc SQLite
- Lý do: concurrent write, transactional, backup, query phức tạp

### 3.2 API công khai (Public API)

- RESTful API cho bên thứ ba tích hợp
- API key management
- Rate limiting, usage tracking
- Webhook khi trạng thái dự án thay đổi

### 3.3 Single Sign-On (SSO)

- Đăng nhập qua Google Workspace / Microsoft 365
- LDAP / Active Directory integration
- Quản lý phân quyền tập trung

### 3.4 Hỗ trợ đa ngôn ngữ (i18n)

- Tiếng Việt (hiện tại)
- Tiếng Anh
- Giao diện có thể chuyển đổi ngôn ngữ

### 3.5 Mobile / Responsive nâng cao

- Ứng dụng mobile (React Native / Flutter)
- Tính năng chính: duyệt dự án, xem thông báo, xem dashboard
- Push notification

---

## 4. Mở rộng thị trường

### 4.1 Multi-tenant (Nhiều công ty)

- Một instance phục vụ nhiều công ty khác nhau
- Mỗi công ty có dữ liệu riêng, user riêng, không nhìn thấy nhau
- White-label: mỗi công ty có logo + brand riêng

### 4.2 Tích hợp cổng đấu thầu khác

- Ngoài muasamcong.mpi.gov.vn, tích hợp thêm:
  - dauthauonline.vn
  - vnmart.vn
  - Các cổng đấu thầu quốc tế (UNGM, World Bank)
- API chung cho việc tra cứu, tự động điền form

### 4.3 Báo giá tự động (Auto Quotation)

- Dựa trên danh mục hàng hóa và lịch sử giá, tự động sinh báo giá
- Gửi báo giá qua email cho khách hàng

---

## 5. Machine Learning & AI

### 5.1 Dự đoán trúng thầu (Win Rate Prediction)

- Phân tích lịch sử dự án đã trúng / trượt
- Feature: giá chào, giá dự toán, đối thủ, lĩnh vực, địa điểm
- Output: tỉ lệ % dự đoán trúng thầu

### 5.2 Đề xuất giá thông minh (Smart Pricing)

- Học từ các dự án đã trúng thầu
- Đề xuất tỉ lệ LNG tối ưu cho từng dự án
- Tự động điều chỉnh giá chào dựa trên tham số thị trường

### 5.3 OCR cho hồ sơ thầu

- Scan / upload file PDF hồ sơ thầu
- OCR tự động trích xuất: tên dự án, mã IB, bên mời thầu, hạng mục
- Điền tự động vào form

---

## 6. Ghi chép ý tưởng khác (Idea Backlog)

| Ý tưởng | Mô tả ngắn |
|---------|------------|
| Chat nội bộ | Trao đổi trực tiếp giữa employee và admin trong từng dự án |
| Nhắc nhở deadline | Gửi thông báo trước khi đóng thầu N ngày |
| Lịch sử giá nguyên liệu | Theo dõi biến động giá thị trường, đề xuất thời điểm mua |
| Quản lý mục tiêu doanh số | Giao chỉ tiêu cho từng nhân viên, theo dõi đạt được |
| Tích hợp kế toán | Xuất dữ liệu sang phần mềm kế toán (MISA, Fast) |
| Chữ ký số | Ký duyệt điện tử qua chữ ký số (Viettel CA, VNPT CA) |
| Chatbot hỗ trợ | Hỏi đáp tự động về quy trình, cách tính giá |
| Template dự án | Lưu mẫu dự án có sẵn để tạo nhanh |
| Báo giá gửi khách hàng | Gửi báo giá qua email trực tiếp từ hệ thống, tracking đã xem chưa |
| Đấu thầu ngược | Theo dõi các gói thầu đang mời, tự động đề xuất tham gia |
