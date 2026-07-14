# Module: User Management (Quản lý người dùng)

## Mục đích

Quản trị viên thêm, sửa, xoá tài khoản nhân viên.

## Entity chính

- **User** — `data/users.json`

## Business rule

- Admin mới có quyền CRUD user
- Không thể xoá chính mình
- Username unique
- Password tối thiểu 4 ký tự
- Khi sửa user, để trống password nghĩa là không đổi

## API liên quan

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/users` | Yes | Danh sách user |
| POST | `/api/users` | Admin | Thêm user |
| PUT | `/api/users/:id` | Admin | Sửa user |
| DELETE | `/api/users/:id` | Admin | Xoá user |

## File code quan trọng

- `server.js:94-135` — User routes
- `public/index.html:582-646` — User management UI
- `public/index.html:412-448` — User modals HTML

## Module phụ thuộc

- **Auth** module — Cần login, phân quyền admin
