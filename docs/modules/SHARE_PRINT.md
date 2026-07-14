# Module: Share / Print (In và chia sẻ)

## Mục đích

Tạo trang HTML công khai để in ấn hoặc chia sẻ thông tin dự án (không cần đăng nhập).

## Cơ chế

- **GET /share/:id** — Server-rendered HTML
- Đọc project từ JSON
- Tính toán giá (server-side, duplicate với client-side `calculate()`)
- Render HTML string với inline CSS
- Có nút `window.print()` kích hoạt hộp thoại in trình duyệt

## API liên quan

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/share/:id` | No | Xem/in dự án (public) |

## UI trên trang in

1. Header: CÔNG TY CỔ PHẦN THÔNG TIN HAPRO — ĐỀ XUẤT GIÁ DỰ THẦU
2. Thông tin chung (I)
3. Danh mục hàng hóa (II) — bảng đầy đủ
4. Hiệu quả dự án (III) — chi tiết các chỉ số tài chính
5. Nội dung trình (IV) — nếu có
6. Thông tin ký duyệt (V) — người lập, người duyệt
7. Status badge
8. Nút In

## File code quan trọng

- `server.js:424-542` — `app.get('/share/:id')` (+ helper functions `esc()`, `fmt()`, `toDateStr()`, `toDateTimeStr()`)
- `public/index.html:691-695` — `printProject()` trigger

## Module phụ thuộc

- **Project** module — Đọc project data
- **Price Calculation** — Tính toán giá server-side
