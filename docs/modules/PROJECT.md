# Module: Project (Quản lý dự thầu)

## Mục đích

Quản lý vòng đời dự thầu: tạo, sửa, xoá, trình duyệt, phê duyệt.

## Entity chính

- **Project** — `data/projects.json`
- **ProjectInfo** — Embedded trong project
- **Item** — Embedded (items[])
- **Params** — Embedded (params)

## Business rule

1. **Status workflow:** `draft` → `pending` → `approved` | `rejected`
2. **Unique IB:** Mã đấu thầu (maDauThau) không trùng
3. **Owner-based access:**
   - Employee: chỉ sửa/xoá dự án do mình tạo (theo `createdBy` hoặc `nguoiLap`)
   - Employee: chỉ sửa khi status là `draft` hoặc `rejected`
   - Admin: sửa/xoá mọi dự án, mọi trạng thái
4. **Submit:** Chỉ owner mới trình duyệt được
5. **Approve/Reject:** Chỉ admin
6. **Unapprove:** Admin huỷ duyệt (approved → rejected)
7. **Mỗi project cần ít nhất 1 item**
8. **Validation khi submit:** Tất cả field bắt buộc phải có

## API liên quan

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/projects` | Yes | Danh sách (summary) |
| GET | `/api/projects/:id` | Yes | Chi tiết |
| POST | `/api/projects` | Yes | Tạo mới |
| PUT | `/api/projects/:id` | Yes | Cập nhật |
| DELETE | `/api/projects/:id` | Yes | Xoá |
| PATCH | `/api/projects/:id/submit` | Yes | Trình duyệt |
| PATCH | `/api/projects/:id/approve` | Admin | Duyệt |
| PATCH | `/api/projects/:id/reject` | Admin | Từ chối |
| PATCH | `/api/projects/:id/unapprove` | Admin | Huỷ duyệt |

## File code quan trọng

- `server.js:137-285` — Project routes (CRUD + status transitions)
- `public/index.html:648-838` — Project CRUD UI
- `public/index.html:791-802` — switchProject / loadProjectToForm
- `public/index.html:1195-1222` — collectFormData
- `public/index.html:1224-1252` — applyPermissions (phân quyền UI động)

## Module phụ thuộc

- **Auth** module — Session và phân quyền
- **User Management** — Lấy danh sách employee cho dropdown `nguoiLap`
- **Item Management** — Module con (items embedded trong project)
