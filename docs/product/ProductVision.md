# Product Vision — Phần Mềm Tính Giá Chào Thầu

## 1. Vấn đề cần giải quyết

Hiện tại, nhân viên kinh doanh của HAPRO thực hiện tính giá chào thầu thủ công qua Excel, dẫn đến các vấn đề:

- **Mất thời gian:** Nhập liệu và tính toán thủ công, dễ sai sót khi copy-paste công thức
- **Thiếu chuẩn hóa:** Mỗi nhân viên dùng file Excel khác nhau, không thống nhất cấu trúc và công thức
- **Khó kiểm soát phê duyệt:** Quy trình trình duyệt diễn ra qua email/Zalo, không có hệ thống theo dõi trạng thái
- **Không có lưu vết:** Không biết ai đã sửa gì, duyệt lúc nào, không có lịch sử tập trung
- **Tra cứu thủ công:** Phải tự lên cổng đấu thầu quốc gia để gõ mã IB, copy thông tin về
- **Chia sẻ phiền phức:** Gửi file Excel qua email, người nhận phải có Excel mới xem được

## 2. Người dùng chính

| Nhóm người dùng | Mô tả | Số lượng ước tính |
|-----------------|-------|-------------------|
| Nhân viên kinh doanh | Lập đề xuất giá, nhập hàng hóa, tham số, trình duyệt | 10–50 người |
| Quản lý / CEO (Admin) | Phê duyệt / từ chối đề xuất, quản lý tài khoản | 1–3 người |
| Đối tác / Khách hàng (xem) | Xem thông tin dự án qua link chia sẻ, không cần tài khoản | Không giới hạn |

## 3. Giá trị tạo ra

| Giá trị | Mô tả |
|---------|-------|
| **Tốc độ** | Tạo đề xuất giá trong vài phút thay vì hàng giờ trên Excel |
| **Chính xác** | Công thức tính giá được chuẩn hóa, loại bỏ sai sót thủ công |
| **Minh bạch** | Toàn bộ quy trình từ tạo → trình → duyệt được ghi lại đầy đủ |
| **Kiểm soát** | Admin biết chính xác dự án nào đang ở đâu, ai đang xử lý |
| **Tiết kiệm** | Giảm chi phí hành chính, in ấn, đi lại cho việc trình ký |
| **Tự động hóa** | Tra cứu thông tin đấu thầu từ cổng quốc gia chỉ bằng một nút bấm |
| **Chia sẻ dễ dàng** | Link public HTML, xem được trên mọi thiết bị, không cần cài đặt |

## 4. Mục tiêu sản phẩm

**Tầm nhìn:** Trở thành công cụ tính giá chào thầu chuẩn cho HAPRO, sau đó mở rộng ra các doanh nghiệp đấu thầu khác.

**Mục tiêu giai đoạn 1 (MVP):**
- [x] Tạo và quản lý dự thầu cơ bản
- [x] Tính toán giá tự động theo công thức chuẩn
- [x] Quy trình phê duyệt nội bộ (draft → pending → approved/rejected)
- [x] Tra cứu mã IB từ cổng đấu thầu quốc gia
- [x] Trang in/chia sẻ public
- [x] Quản lý người dùng cơ bản
