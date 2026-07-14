# Module: Excel Import (Nhập từ Excel)

## Mục đích

Script độc lập (`import-excel.js`) để nhập dữ liệu dự thầu từ file Excel `.xlsx` vào hệ thống qua API.

## Cơ chế

- Sử dụng thư viện `xlsx` (SheetJS) đọc file Excel
- Parse sheet "De xuat gia du thau"
- Login vào API → tạo project → PUT full data
- Chạy standalone (không phải web route)

## Input

File Excel cố định: `PA-SQL-SawacoGiaDinh.xlsx` (hardcoded path)

Cấu trúc sheet mong đợi:
- Row 4: Label
- Row 5: Địa điểm (column C)
- Row 6: Thời gian thực hiện (column C)
- Row 8: Người lập (column G)
- Row 9: Ngày lập (column L)
- Rows 12+: Danh mục hàng hóa
  - Column A: STT (number)
  - Column B: Tên hàng hóa
  - Column H: Đơn vị tính
  - Column I: Số lượng
  - Column J: Đơn giá nhập
- Row chứa label "Tỉ lệ LNG" → column N: tỉ lệ, column O: giá dự toán
- Row chứa label "Chi phí bảo hành" → column O: tỉ lệ %
- Row chứa label "Chi phí bán hàng" → column O: tỉ lệ %
- Row chứa label "Chi phí công tác" → column N: giá trị
- Row chứa label "Hoa hồng KD" → column O: tỉ lệ %

## API liên quan

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/login` | Login (hardcoded user: tuanbm) |
| POST | `/api/projects` | Tạo project rỗng |
| PUT | `/api/projects/:id` | Update với full data |

## File code

- `import-excel.js` — Standalone script (126 dòng)

## Module phụ thuộc

- **xlsx** (npm) — Excel parsing
- **Project API** — Tạo và cập nhật project
