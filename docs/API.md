# API

**Base URL:** `http://localhost:3456`  
**Auth:** Session-based (cookie `connect.sid`)

---

## Authentication

### POST /api/login

Đăng nhập hệ thống.

**Input:**
```json
{
  "username": "string (required)",
  "password": "string (required)",
  "remember": "boolean (optional) — nếu true, session 30 ngày, mặc định 24h"
}
```

**Output (200):**
```json
{
  "user": { "id": "uuid", "username": "string", "fullName": "string", "role": "admin|employee" }
}
```

### POST /api/logout

Đăng xuất, huỷ session.

**Output (200):** `{ "ok": true }`

### GET /api/me

Lấy thông tin user hiện tại.

**Output (200):**
```json
{ "user": { "id": "uuid", "username": "string", "fullName": "string", "role": "admin|employee" } }
```
hoặc `{ "user": null }` nếu chưa đăng nhập.

### POST /api/change-password

Đổi mật khẩu (yêu cầu auth).

**Input:**
```json
{ "oldPassword": "string", "newPassword": "string (min 4 ký tự)" }
```

**Output (200):** `{ "ok": true }`

---

## User Management (Admin only for mutations)

### GET /api/users

Danh sách tất cả người dùng.

**Auth:** required  
**Output (200):**
```json
[
  { "id": "uuid", "username": "string", "fullName": "string", "role": "admin|employee", "createdAt": "ISO string" }
]
```

### POST /api/users

Tạo user mới.

**Auth:** admin  
**Input:**
```json
{ "username": "string", "password": "string (min 4)", "fullName": "string", "role": "admin|employee" }
```
**Output (201):** user object (không password)

### PUT /api/users/:id

Cập nhật user. Chỉ gửi field cần thay đổi.

**Auth:** admin  
**Input:**
```json
{ "username": "string (optional)", "fullName": "string (optional)", "role": "string (optional)", "password": "string (optional)" }
```
**Output (200):** user object

### DELETE /api/users/:id

Xoá user.

**Auth:** admin  
**Constraints:** Không thể xoá chính mình  
**Output (200):** `{ "ok": true }`

---

## Projects

### GET /api/projects

Danh sách tất cả dự án (dạng tóm tắt).

**Auth:** required  
**Output (200):**
```json
[
  {
    "id": "uuid",
    "name": "string",
    "createdAt": "ISO string",
    "updatedAt": "ISO string",
    "status": "draft|pending|approved|rejected",
    "approvedBy": "string|null",
    "approvedAt": "ISO string|null",
    "createdBy": "uuid|null",
    "maDauThau": "string|null",
    "benMoiThau": "string|null",
    "thoiGianDongThau": "ISO string|null"
  }
]
```

### GET /api/projects/:id

Chi tiết dự án (đầy đủ).

**Auth:** required  
**Output (200):** Full project object (projectInfo, items, params)

### POST /api/projects

Tạo dự án mới.

**Auth:** required  
**Input:**
```json
{
  "name": "string (optional, default: 'Dự án mới')",
  "projectInfo": {
    "tenCongTrinh": "string",
    "maDauThau": "string (unique check)",
    "benMoiThau": "string",
    "noiDungTrinh": "string",
    "diaDiem": "string",
    "nguoiPhuTrach": "string",
    "nguoiLap": "string (default: currentUser.fullName)",
    "ngayLap": "YYYY-MM-DD (default: today)",
    "thoiGianDongThau": "ISO string"
  }
}
```
**Output (201):** Full project object (với items mặc định 1 dòng trống, params mặc định)

### PUT /api/projects/:id

Cập nhật dự án. Merge shallow.

**Auth:** required (owner/admin, chỉ sửa khi draft/rejected)  
**Input:** Partial project object  
**Output (200):** Full project object sau khi cập nhật

### DELETE /api/projects/:id

Xoá dự án.

**Auth:** required (owner/admin, employee chỉ xoá draft/rejected)  
**Output (200):** `{ "ok": true }`

### PATCH /api/projects/:id/submit

Trình duyệt (draft → pending).

**Auth:** required (owner)  
**Constraints:** Chỉ khi status là draft hoặc rejected  
**Output (200):** Project object

### PATCH /api/projects/:id/approve

Duyệt dự án (pending → approved).

**Auth:** admin  
**Side effects:** Ghi approvedBy, approvedById, approvedAt, nguoiDuyet, ngayDuyet  
**Output (200):** Project object

### PATCH /api/projects/:id/reject

Từ chối dự án (pending → rejected).

**Auth:** admin  
**Output (200):** Project object

### PATCH /api/projects/:id/unapprove

Huỷ duyệt (approved → rejected).

**Auth:** admin  
**Side effects:** Xoá thông tin người duyệt  
**Output (200):** Project object

---

## IB Scraping

### GET /api/fetch-bidding-info/:ibCode

Tra cứu thông tin đấu thầu từ cổng muasamcong.mpi.gov.vn.

**Auth:** required  
**Output (200):**
```json
{
  "tenCongTrinh": "string (bidName)",
  "benMoiThau": "string (investorName)",
  "thoiGianDongThau": "ISO string (bidCloseDate)",
  "giaDuToan": "number (bidPrice|bidEstimatePrice|planItemPrice) | null",
  "bidNo": "string (notifyNo|bidNo)",
  "diaDiem": "string (location)"
}
```

**Mechanics:** Dùng Playwright Chromium headless → search keyword → parse JSON response → fetch detail nếu có.

---

## Share / Print

### GET /share/:id

Trang in HTML công khai (không cần auth).

**Output (200):** HTML document chứa đầy đủ thông tin dự án + bảng tính giá, có nút in.

---
