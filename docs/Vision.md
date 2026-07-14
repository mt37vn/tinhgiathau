# Vision

## Mục tiêu phần mềm

**Phần mềm Tính Giá Chào Thầu (Bidding Price Calculation Software)** — Xây dựng cho **Công ty Cổ phần Thông tin Hapro (HAPRO)**.

Mục tiêu: Hỗ trợ nhân viên kinh doanh tính toán, lập đề xuất giá dự thầu một cách nhanh chóng, chính xác; quản lý quy trình phê duyệt nội bộ trước khi nộp hồ sơ thầu.

## Đối tượng sử dụng

| Vai trò | Mô tả | Quyền |
|---------|-------|-------|
| **Nhân viên (employee)** | Nhân viên kinh doanh lập đề xuất giá | Tạo/sửa dự án (draft), trình duyệt, xem |
| **Quản trị (admin)** | Quản lý / CEO phê duyệt | Toàn quyền: duyệt/từ chối, quản lý người dùng, sửa/xoá mọi dự án |

## Các nghiệp vụ chính

1. **Quản lý dự thầu** — CRUD dự án, mỗi dự án gồm thông tin chung, danh mục hàng hóa, thông số tài chính
2. **Tra cứu thông tin đấu thầu tự động** — Nhập mã IB, hệ thống tự truy cập cổng `muasamcong.mpi.gov.vn` để lấy thông tin dự án
3. **Tính toán giá chào** — Tự động tính:
   - Giá nhập, giá chào tối thiểu dựa trên tỉ lệ LNG
   - Phân bổ giá chào theo trọng số từng mặt hàng
   - Lợi nhuận gộp, chi phí (dự thầu, bảo hành, bán hàng, công tác)
   - Hoa hồng kinh doanh, lợi nhuận ròng, tỉ lệ LNR/Vốn
4. **Quy trình phê duyệt** — Draft → Pending (Trình duyệt) → Approved / Rejected
5. **In/Chia sẻ** — Tạo trang in HTML công khai (đường dẫn `/share/:id`)
6. **Quản lý người dùng** — Admin thêm/sửa/xoá tài khoản nhân viên
7. **Import Excel** — Script nhập dữ liệu từ file `.xlsx` qua API
