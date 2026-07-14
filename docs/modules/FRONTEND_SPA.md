# Module: Frontend SPA (Giao diện người dùng)

## Mục đích

Single-page application cung cấp giao diện người dùng cho toàn bộ hệ thống.

## Công nghệ

- **HTML5** + **CSS3** + **Vanilla JavaScript ES6+**
- **Không framework** — DOM manipulation trực tiếp
- **Single file** — `public/index.html` (1365 dòng)
- **State:** Global variables (`currentProject`, `projects`, `currentUser`, `users`)

## Cấu trúc giao diện

```
┌─────────────────────────────────────────────────────────┐
│ Topbar: Logo + Auth bar (user info, đổi mk, admin btn)  │
├─────────────────────────────────────────────────────────┤
│ Container                                                │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │ Project Sidebar      │  │ Project Info Form        │  │
│  │ - Search + datalist  │  │ - IB code + Fetch btn   │  │
│  │ - Draft list         │  │ - Tên CT, Bên mời thầu  │  │
│  │ - Pending list       │  │ - TG đóng thầu (selects)│  │
│  │ - Rejected list      │  │ - Giá dự toán           │  │
│  │ - Approved list      │  │ - Địa điểm, người lập   │  │
│  │ - Closed list        │  │ - Ngày duyệt (readonly) │  │
│  │ [+ Mới] [Xóa]       │  │                          │  │
│  └─────────────────────┘  └──────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Items Table (hàng hóa)                             │  │
│  │ STT | Tên | Thông số | ĐVT | SL | ĐG nhập |       │  │
│  │ Giá nhập | NCC | Giá chào | Trọng số | [X]        │  │
│  │ [+ Thêm dòng] [− Xóa dòng cuối]                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │ Parameters           │  │ Results (Hiệu quả)       │  │
│  │ - LNG %              │  │ - Giá dự toán            │  │
│  │ - Phí dự thầu        │  │ - Tỉ lệ giảm giá        │  │
│  │ - Phí bảo hành %    │  │ - Giá chào tối thiểu    │  │
│  │ - Phí bán hàng %    │  │ - Tổng giá nhập          │  │
│  │ - Phí công tác       │  │ - LNG + %                │  │
│  │ - Hoa hồng KD %     │  │ - Chi phí (dự thầu, BH,  │  │
│  │ - Nội dung trình    │  │   BH, công tác)          │  │
│  │                      │  │ - LNG KD                 │  │
│  │                      │  │ - Hoa hồng KD            │  │
│  │                      │  │ - Lợi nhuận ròng         │  │
│  │                      │  │ - LNR/Vốn                │  │
│  └─────────────────────┘  └──────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│ Bottom Bar: Tên dự án | Lưu | Huỷ | Duyệt/Không duyệt  │
│            Trình duyệt | In                              │
└─────────────────────────────────────────────────────────┘
```

## Modals

1. **Login overlay** — Form đăng nhập (fullscreen)
2. **Change password modal** — Đổi mật khẩu
3. **User management modal** — Danh sách + thêm/sửa user
4. **User edit modal** — Form thêm/sửa user

## Key features

- **Auto-save:** 30 giây sau khi ngừng nhập, tự động lưu qua API
- **Real-time calculation:** Tính toán lại ngay khi user thay đổi bất kỳ input nào
- **Keyboard shortcut:** Ctrl+S = Lưu
- **Dynamic permission UI:** Ẩn/hiện nút dựa trên role và trạng thái
- **Duplicate IB check:** Cảnh báo khi nhập mã IB đã tồn tại
- **IB auto-fetch:** Nút Tìm lấy thông tin từ cổng đấu thầu
- **Project sidebar groups:** Dự thảo / Chờ duyệt / Không duyệt / Đã duyệt / Đã đóng thầu

## File code

- `public/index.html` — Toàn bộ frontend

## Module phụ thuộc

- **Auth** module — Login/logout UI
- **User Management** — User CRUD modals
- **Project** — Project CRUD + sidebar
- **Item Management** — Items table (embedded in same file)
- **Price Calculation** — `calculate()` function
- **IB Scraping** — Fetch button + result fill
- **Share/Print** — `printProject()` trigger
