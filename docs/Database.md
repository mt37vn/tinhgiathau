# Database

## Kiến trúc lưu trữ

File-based JSON storage (không có database server). Dữ liệu được đọc/ghi đồng bộ (**fs.readFileSync / fs.writeFileSync**).

- Đường dẫn: `./data/`
- Gitignored: `data/` trong `.gitignore`

## Danh sách "bảng"

### 1. `data/users.json` — Người dùng

```json
{
  "users": [
    {
      "id": "uuid-string",
      "username": "tuanbm",
      "password": "$2b$10$...hashed...",
      "fullName": "Tên đầy đủ",
      "role": "admin | employee",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**Business meaning:** Tài khoản đăng nhập hệ thống.

**Important fields:**
| Field | Type | Ý nghĩa |
|-------|------|---------|
| id | string (UUID) | Khóa chính |
| username | string | Tên đăng nhập, unique |
| password | string | Bcrypt hash (10 rounds) |
| fullName | string | Tên hiển thị, dùng trong `projectInfo.nguoiLap` |
| role | enum | `admin` (quản trị) / `employee` (nhân viên) |
| createdAt | ISO string | Thời gian tạo |

**Default users (tạo khi server chạy lần đầu):**
| Username | Password | FullName | Role |
|----------|----------|----------|------|
| admin | admin123 | CEO Admin | admin |
| nhanvien | nv123 | Nhân viên | employee |

### 2. `data/projects.json` — Dự án thầu

```json
{
  "projects": [
    {
      "id": "uuid-string",
      "name": "Tên dự án",
      "createdAt": "ISO timestamp",
      "updatedAt": "ISO timestamp",
      "status": "draft | pending | approved | rejected",
      "createdBy": "user-id-uuid",
      "approvedBy": "Full name",
      "approvedById": "user-id-uuid",
      "approvedAt": "ISO timestamp",
      "projectInfo": { ... },
      "items": [ ... ],
      "params": { ... }
    }
  ]
}
```

**Business meaning:** Một hồ sơ đề xuất giá dự thầu. Gồm thông tin chung, danh sách hàng hóa, và các tham số tính giá.

**Important fields:**
| Field | Type | Ý nghĩa |
|-------|------|---------|
| id | string (UUID) | Khóa chính |
| name | string | Tên hiển thị (mặc định = mã IB khi tạo) |
| createdAt | ISO string | Thời gian tạo |
| updatedAt | ISO string | Thời gian cập nhật cuối |
| status | enum | `draft`(dự thảo) → `pending`(chờ duyệt) → `approved`(đã duyệt)/`rejected`(không duyệt) |
| createdBy | string (UUID) | FK → users.id (người tạo) |
| approvedBy | string | Tên người duyệt (fullName) |
| approvedById | string (UUID) | FK → users.id (người duyệt) |
| approvedAt | ISO string | Thời gian duyệt |

#### projectInfo — Thông tin chung dự án

| Field | Type | Ý nghĩa |
|-------|------|---------|
| tenCongTrinh | string | Tên công trình / dự án |
| maDauThau | string | Mã đấu thầu (IB) — unique check |
| benMoiThau | string | Bên mời thầu |
| noiDungTrinh | string | Nội dung trình duyệt (văn bản) |
| diaDiem | string | Địa điểm thi công |
| thoiGianThucHien | number | Thời gian thực hiện (ngày) — legacy |
| nguoiLap | string | Người lập đề xuất (fullName) |
| ngayLap | date (YYYY-MM-DD) | Ngày lập |
| thoiGianDongThau | ISO datetime | Thời gian đóng thầu |
| nguoiDuyet | string | Người duyệt — set khi approve |
| ngayDuyet | date | Ngày duyệt — set khi approve |
| nguoiPhuTrach | string | Người phụ trách — legacy/unused |

#### items[] — Danh mục hàng hóa

| Field | Type | Ý nghĩa |
|-------|------|---------|
| id | string (UUID) | Khóa chính (item) |
| stt | number | Số thứ tự |
| tenHangHoa | string | Tên hàng hóa/dịch vụ |
| ghiChu | string | Thông số kỹ thuật / ghi chú |
| donViTinh | string | Đơn vị tính (mặc định "Gói") |
| soLuong | number | Số lượng |
| donGiaNhap | number | Đơn giá nhập (VNĐ) |
| giaNhap | number | Thành tiền nhập = soLuong * donGiaNhap (readonly, computed) |
| nhaCungCap | string | Nhà cung cấp |
| donGiaChao | number | Đơn giá chào (readonly, computed) |
| trongSo | number | Trọng số phân bổ giá chào (readonly, computed) |

#### params — Tham số tính giá

| Field | Type | Ý nghĩa |
|-------|------|---------|
| tiLeLNG | number (%) | Tỉ lệ lợi nhuận gộp dự kiến (VD: 30 = 30%) |
| phiDuThau | number (VNĐ) | Chi phí dự thầu cố định |
| phiBaoHanh | number (%) | Chi phí bảo hành (tỉ lệ % trên giá chào) |
| phiBanHang | number (%) | Chi phí bán hàng (tỉ lệ % trên giá chào) |
| phiCongTac | number (VNĐ) | Chi phí công tác/khác cố định |
| hoaHongKD | number (%) | Hoa hồng kinh doanh (% trên lợi nhuận gộp KD) |
| giaDuToan | number (VNĐ) | Giá dự toán (do bên mời thầu công bố) |

## Quan hệ

```
User (1) ────< creates >──── (N) Project  (createdBy)
User (1) ────< approves >─── (N) Project  (approvedById)
Project (1) ────< contains >──── (N) Item  (items[])
Project (1) ────< has >──── (1) Params     (params)
Project (1) ────< has >──── (1) ProjectInfo (projectInfo)
```

## Business rules (ràng buộc dữ liệu)

1. `maDauThau` phải là unique trong toàn bộ projects
2. Chỉ dự án ở trạng thái `draft` hoặc `rejected` mới cho phép sửa/xoá (employee)
3. Khi approve, tự động ghi `approvedBy`, `approvedById`, `approvedAt`, `nguoiDuyet`, `ngayDuyet`
4. Khi unapprove, xoá thông tin duyệt, chuyển về `rejected`
5. Mỗi project phải có ít nhất 1 item
6. Không thể xoá user đang đăng nhập
