# Module: Auth (Xác thực)

## Mục đích

Xác thực người dùng, quản lý session đăng nhập, đổi mật khẩu.

## Entity chính

- **User** — `data/users.json` (xem [Database.md](../Database.md))

## Business rule

- Username unique
- Password tối thiểu 4 ký tự
- Session mặc định 24h, nếu "remember me" thì 30 ngày
- Có thể kiểm tra session bằng `GET /api/me`
- Không logout thì session tự hết hạn

## API liên quan

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/api/login` | No | Đăng nhập |
| POST | `/api/logout` | No | Đăng xuất |
| GET | `/api/me` | No | Kiểm tra session |
| POST | `/api/change-password` | Yes | Đổi mật khẩu |

## File code quan trọng

- `server.js:17-22` — Session config
- `server.js:42-51` — Middleware `auth()`, `adminOnly()`
- `server.js:54-91` — Auth routes
- `public/index.html:495-533` — Login/logout UI
- `public/index.html:560-580` — Change password UI

## Module phụ thuộc

- **express-session** — Session management
- **bcryptjs** — Password hashing
