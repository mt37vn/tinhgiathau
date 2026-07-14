# User Role — Vai trò và phân quyền

## Danh sách Role

| Role | Mã hệ thống | Mô tả |
|------|-------------|-------|
| Nhân viên kinh doanh | `employee` | Người lập đề xuất giá, nhập dữ liệu dự thầu |
| Quản trị viên | `admin` | Quản lý / CEO, phê duyệt đề xuất, quản trị hệ thống |

---

## 1. Nhân viên kinh doanh (employee)

### Mô tả
Nhân viên phòng kinh doanh, người trực tiếp lập hồ sơ đề xuất giá dự thầu.

### Quyền hạn

| Hành động | Dự án của mình | Dự án của người khác |
|-----------|----------------|----------------------|
| Xem danh sách dự án | ✓ | ✓ (tất cả) |
| Xem chi tiết dự án | ✓ | ✓ (tất cả) |
| Tạo dự án mới | ✓ | — |
| Sửa dự án (draft/rejected) | ✓ | ✗ |
| Sửa dự án (pending/approved) | ✗ | ✗ |
| Xoá dự án (draft/rejected) | ✓ | ✗ |
| Xoá dự án (pending/approved) | ✗ | ✗ |
| Trình duyệt | ✓ | ✗ |
| Phê duyệt / Từ chối | ✗ | ✗ |
| Tra cứu mã IB | ✓ | ✓ |
| In / Chia sẻ | ✓ | ✓ |

### Chức năng được phép

| Chức năng | Mô tả |
|-----------|-------|
| Dashboard | Xem danh sách tất cả dự án, phân loại theo trạng thái |
| Tạo dự án | Tạo project mới, nhập thông tin chung |
| Nhập hàng hóa | Thêm/sửa/xoá dòng hàng hóa trong bảng items |
| Nhập tham số | Điều chỉnh các tham số tính giá (LNG, phí, hoa hồng,...) |
| Xem kết quả | Xem real-time các chỉ số tài chính |
| Lưu / Tự động lưu | Lưu dự án (thủ công hoặc auto-save 30s) |
| Trình duyệt | Gửi dự án lên admin để phê duyệt |
| Tra cứu IB | Nhập mã IB, nhấn nút để tự động lấy thông tin |
| In ấn | Mở trang in HTML
| Đổi mật khẩu | Thay đổi mật khẩu cá nhân |

---

## 2. Quản trị viên (admin)

### Mô tả
Quản lý / CEO hoặc người được uỷ quyền phê duyệt. Có toàn quyền trên hệ thống.

### Quyền hạn

| Hành động | Dự án bất kỳ |
|-----------|--------------|
| Xem danh sách dự án | ✓ |
| Xem chi tiết dự án | ✓ |
| Tạo dự án mới | ✓ |
| Sửa dự án (mọi trạng thái) | ✓ |
| Xoá dự án (mọi trạng thái) | ✓ |
| Trình duyệt | ✓ |
| Phê duyệt (pending → approved) | ✓ |
| Từ chối (pending → rejected) | ✓ |
| Huỷ duyệt (approved → rejected) | ✓ |
| Tra cứu mã IB | ✓ |
| In / Chia sẻ | ✓ |

**Quản lý người dùng:**

| Hành động | Quyền |
|-----------|-------|
| Xem danh sách user | ✓ |
| Thêm user mới | ✓ |
| Sửa thông tin user | ✓ |
| Đặt lại mật khẩu user | ✓ |
| Xoá user | ✓ (không thể xoá chính mình) |

### Chức năng được phép

| Chức năng | Mô tả |
|-----------|-------|
| Toàn bộ chức năng của Employee | Như trên |
| Phê duyệt dự án | Duyệt hoặc từ chối đề xuất đang chờ |
| Huỷ duyệt | Rút lại phê duyệt đã cấp |
| Quản lý người dùng | Thêm/sửa/xoá tài khoản (modal riêng) |
| Xem user list | Xem danh sách tất cả tài khoản |
| Phân quyền | Gán role employee/admin cho user |

---

## 3. Người xem ngoài (không cần tài khoản)

### Mô tả
Đối tác, khách hàng, hoặc bất kỳ ai được chia sẻ link dự án.

### Quyền hạn

| Hành động | Quyền |
|-----------|-------|
| Xem trang in HTML | ✓ (qua /share/:id) |
| Tương tác / Sửa đổi | ✗ |
| Yêu cầu auth | Không |

### Chức năng được phép

| Chức năng | Mô tả |
|-----------|-------|
| Xem thông tin dự án | Tên, mã IB, thông tin chung |
| Xem bảng hàng hóa | Danh mục, số lượng, giá cả |
| Xem chỉ số tài chính | Giá chào, lợi nhuận, các chi phí |
| Xem thông tin ký duyệt | Người lập, người duyệt, ngày tháng |
| In trang | Nhấn nút In để in hoặc xuất PDF |

---

## 4. Ma trận phân quyền chi tiết (CRUD + Status)

| Tính năng | employee | admin | Khách (public) |
|-----------|----------|-------|----------------|
| Đăng nhập | ✓ | ✓ | ✗ |
| Đổi mật khẩu | ✓ | ✓ | ✗ |
| Xem project list | ✓ | ✓ | ✗ |
| Xem project detail | ✓ | ✓ | ✗ |
| Tạo project | ✓ | ✓ | ✗ |
| Sửa project (draft/rejected) | ✓* | ✓ | ✗ |
| Sửa project (pending/approved) | ✗ | ✓ | ✗ |
| Xoá project | ✓* | ✓ | ✗ |
| Trình duyệt | ✓* | ✓ | ✗ |
| Duyệt | ✗ | ✓ | ✗ |
| Từ chối | ✗ | ✓ | ✗ |
| Huỷ duyệt | ✗ | ✓ | ✗ |
| Tra cứu IB | ✓ | ✓ | ✗ |
| Xem trang in | ✓ | ✓ | ✓ |
| Quản lý user | ✗ | ✓ | ✗ |

> *employee: chỉ thao tác được trên dự án do mình tạo (`createdBy` hoặc `nguoiLap` = user hiện tại)
