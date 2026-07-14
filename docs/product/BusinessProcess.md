# Business Process — Quy trình nghiệp vụ

## 1. Quy trình tổng quan: Lập đề xuất giá dự thầu

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NHÂN VIÊN KINH DOANH                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │  Bước 1: Khởi tạo dự án       │
                    │  - Tạo project mới             │
                    │  - Nhập mã IB (hoặc để trống)  │
                    │  - Điền thông tin chung        │
                    └───────────┬───────────────────┘
                                │
                    ┌───────────▼───────────────────┐
                    │  Bước 1a (Tùy chọn):           │
                    │  Tra cứu mã IB tự động         │
                    │  - Click "Tìm IB"              │
                    │  - Hệ thống scrape từ           │
                    │    muasamcong.mpi.gov.vn        │
                    │  - Tự động điền form           │
                    └───────────┬───────────────────┘
                                │
                                ▼
                    ┌───────────────────────────────┐
                    │  Bước 2: Nhập danh mục hàng    │
                    │  - Thêm dòng hàng hóa          │
                    │  - Nhập tên, số lượng,         │
                    │    đơn giá nhập, nhà cung cấp  │
                    │  - Hệ thống tự tính:           │
                    │    • Giá nhập = SL * ĐG nhập   │
                    └───────────┬───────────────────┘
                                │
                                ▼
                    ┌───────────────────────────────┐
                    │  Bước 3: Nhập tham số tính giá │
                    │  - Tỉ lệ LNG (lợi nhuận gộp)   │
                    │  - Phí dự thầu (cố định)       │
                    │  - Phí bảo hành (% giá chào)   │
                    │  - Phí bán hàng (% giá chào)   │
                    │  - Phí công tác (cố định)      │
                    │  - Hoa hồng KD (% LNG KD)      │
                    └───────────┬───────────────────┘
                                │
                                ▼
                    ┌───────────────────────────────┐
                    │  Bước 4: Xem kết quả tính toán │
                    │  (Real-time, tự động cập nhật) │
                    │  - Giá chào tối thiểu          │
                    │  - Lợi nhuận gộp, các chi phí  │
                    │  - Lợi nhuận ròng, LNR/Vốn     │
                    │  - Tỉ lệ giảm giá so với       │
                    │    giá dự toán                 │
                    └───────────┬───────────────────┘
                                │
                                ▼
                    ┌───────────────────────────────┐
                    │  Bước 5: Lưu & Kiểm tra       │
                    │  - Tự động lưu sau 30 giây    │
                    │  - Hoặc click Lưu (Ctrl+S)    │
                    │  - Validate các trường bắt    │
                    │    buộc                       │
                    └───────────┬───────────────────┘
                                │
                                ▼
                    ┌───────────────────────────────┐
                    │  Bước 6: Trình duyệt           │
                    │  (draft → pending)             │
                    │  - Click "Trình duyệt"         │
                    │  - Hệ thống validate toàn bộ   │
                    │  - Chuyển trạng thái chờ duyệt │
                    └───────────┬───────────────────┘
                                │
                                ▼
              ┌──────────────────────────────────────┐
              │                                      │
              ▼                                      ▼
┌───────────────────────┐          ┌───────────────────────────┐
│  Bước 7a: Phê duyệt   │          │  Bước 7b: Từ chối          │
│  (Admin)               │          │  (Admin)                   │
│  - Click "Duyệt"      │          │  - Click "Không duyệt"    │
│  - Ghi nhận người     │          │  - Dự án về rejected       │
│    duyệt, ngày duyệt   │          │  - Nhân viên có thể sửa   │
│  - Dự án approved      │          │    và trình lại            │
└───────────┬───────────┘          └───────────┬───────────────┘
            │                                  │
            ▼                                  ▼
   ┌────────────────┐               ┌──────────────────┐
   │  Đã duyệt       │               │  Không duyệt     │
   │  (approved)     │               │  (rejected)      │
   └────────────────┘               └──────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│  Bước 8: In / Chia sẻ             │
│  - Click "In" → Trang in HTML    │
│  - Gửi link /share/:id cho       │
│    đối tác / khách hàng           │
│  - Không cần đăng nhập            │
└───────────────────────────────────┘
```

## 2. Quy trình quản lý người dùng (Admin)

```
┌──────────────┐
│   ADMIN      │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────┐
│  Mở modal Quản lý người dùng │
└──────────┬───────────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌──────────┐ ┌──────────┐
│ Thêm     │ │ Sửa/Xoá │
│ user     │ │ user có  │
│ mới      │ │ sẵn      │
└──────────┘ └──────────┘
    │             │
    ▼             ▼
┌──────────────────────┐
│  Nhập username,      │
│  password, fullName, │
│  role (admin/emp)    │
└──────────────────────┘
```

## 3. Quy trình tra cứu mã IB tự động

```
┌────────────────────────────────────────────────────┐
│  User nhập mã IB (VD: 20250123456)                 │
│  Click "Tìm IB"                                     │
└─────────────────────┬──────────────────────────────┘
                      ▼
┌────────────────────────────────────────────────────┐
│  Server: Playwright Chromium headless               │
│  1. Mở muasamcong.mpi.gov.vn                        │
│  2. Điền keyword = mã IB                            │
│  3. Gửi Enter, bắt response JSON                    │
│  4. Parse: bidName, investorName, bidCloseDate,... │
│  5. Fetch detail page → lấy địa điểm (nếu có)      │
└─────────────────────┬──────────────────────────────┘
                      ▼
┌────────────────────────────────────────────────────┐
│  Trả kết quả → Frontend tự động điền form           │
│  - Tên công trình (tenCongTrinh)                    │
│  - Bên mời thầu (benMoiThau)                        │
│  - Thời gian đóng thầu (thoiGianDongThau)           │
│  - Giá dự toán (giaDuToan)                          │
│  - Địa điểm (diaDiem)                               │
└────────────────────────────────────────────────────┘
```

## 4. Quy trình trạng thái dự án (State Machine)

```
                  ┌──────────┐
                  │  DRAFT   │ ◄── Tạo mới
                  └────┬─────┘
                       │
                  Trình duyệt
                       │
                       ▼
                  ┌──────────┐
         ┌───────│ PENDING  │────────┐
         │       └────┬─────┘        │
         │            │              │
         │      ┌─────┴─────┐       │
         │      │           │       │
         ▼      ▼           ▼       ▼
   ┌─────────┐         ┌──────────┐
   │APPROVED │         │ REJECTED │──┐
   └─────────┘         └──────────┘  │
         │                     ▲      │
         │      Huỷ duyệt      │      │ Sửa lại
         └─────────────────────┘      │
                    │                 │
                    └─────────────────┘
                         Trình lại

  Quyền thực hiện:
  ┌──────────────┬───────────┬────────┐
  │ Hành động    │ Employee  │ Admin  │
  ├──────────────┼───────────┼────────┤
  │ Tạo (POST)   │ ✓         │ ✓      │
  │ Sửa (PUT)    │ ✓*        │ ✓      │
  │ Xoá (DEL)    │ ✓*        │ ✓      │
  │ Trình duyệt  │ ✓         │ ✓      │
  │ Duyệt        │           │ ✓      │
  │ Từ chối      │           │ ✓      │
  │ Huỷ duyệt    │           │ ✓      │
  └──────────────┴───────────┴────────┘
  * Employee chỉ sửa/xoá khi draft hoặc rejected
```

## 5. Luồng dữ liệu giữa các module

```
┌──────────────┐    ┌─────────────────┐    ┌────────────────┐
│  Input Layer │───▶│  Process Layer  │───▶│  Output Layer  │
│  (Form +     │    │  (Server)       │    │  (Kết quả)     │
│   Items)     │    │                 │    │                │
├──────────────┤    ├─────────────────┤    ├────────────────┤
│ - Project    │    │ - Auth          │    │ - Giá chào     │
│   Info       │    │ - Validation    │    │ - Lợi nhuận   │
│ - Items      │    │ - Price Calc    │    │ - Các chỉ số  │
│ - Params     │    │ - Scraping      │    │ - Trang in    │
│ - IB Code    │    │ - Share/Print   │    │ - Link chia sẻ│
└──────────────┘    └─────────────────┘    └────────────────┘
```
