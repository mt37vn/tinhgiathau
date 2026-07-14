# Feature List — Danh sách tính năng

## 1. Tính năng đã có (Implemented)

### 1.1 Xác thực & Bảo mật
| # | Tính năng | Mô tả |
|---|-----------|-------|
| F01 | Đăng nhập | Xác thực username/password, session-based |
| F02 | Remember me | Session kéo dài 30 ngày nếu chọn |
| F03 | Đăng xuất | Huỷ session |
| F04 | Kiểm tra session | API `/api/me` kiểm tra trạng thái đăng nhập |
| F05 | Đổi mật khẩu | Yêu cầu mật khẩu cũ + mới (min 4 ký tự) |
| F06 | Bcrypt hash | Mật khẩu được hash với 10 rounds |

### 1.2 Quản lý người dùng (Admin)
| # | Tính năng | Mô tả |
|---|-----------|-------|
| F07 | Danh sách user | Xem tất cả tài khoản |
| F08 | Thêm user | Tạo tài khoản mới với role |
| F09 | Sửa user | Cập nhật thông tin, đặt lại mật khẩu |
| F10 | Xoá user | Xoá tài khoản (không thể xoá chính mình) |
| F11 | Tài khoản mặc định | Tự động tạo admin + employee khi chạy lần đầu |

### 1.3 Quản lý dự thầu
| # | Tính năng | Mô tả |
|---|-----------|-------|
| F12 | Tạo dự án | Tạo project mới, mặc định 1 item + params chuẩn |
| F13 | Xem danh sách | Sidebar phân loại: Dự thảo / Chờ duyệt / Không duyệt / Đã duyệt / Đã đóng thầu |
| F14 | Xem chi tiết | Load toàn bộ thông tin dự án lên form |
| F15 | Sửa dự án | Cập nhật thông tin chung, items, params |
| F16 | Xoá dự án | Xoá project (có ràng buộc theo role + status) |
| F17 | Tìm kiếm dự án | Search box + datalist gợi ý |

### 1.4 Quy trình phê duyệt
| # | Tính năng | Mô tả |
|---|-----------|-------|
| F18 | Trình duyệt | Chuyển draft → pending |
| F19 | Phê duyệt | Admin duyệt: pending → approved (ghi người duyệt, ngày) |
| F20 | Từ chối | Admin từ chối: pending → rejected |
| F21 | Huỷ duyệt | Admin huỷ: approved → rejected (xoá thông tin duyệt) |
| F22 | Validate trước submit | Kiểm tra field bắt buộc trước khi chuyển pending |

### 1.5 Danh mục hàng hóa
| # | Tính năng | Mô tả |
|---|-----------|-------|
| F23 | Thêm dòng | Thêm item mới vào bảng hàng hóa |
| F24 | Xoá dòng | Xoá item cuối |
| F25 | Tính giá nhập | Tự động: SL × ĐG nhập (readonly) |
| F26 | Tính trọng số | Tự động: Giá nhập / firstGiaNhap |

### 1.6 Tính giá tự động
| # | Tính năng | Mô tả |
|---|-----------|-------|
| F27 | Real-time calculation | Tính lại ngay khi user thay đổi input |
| F28 | Giá chào tối thiểu | Tính dựa trên tỉ lệ LNG |
| F29 | Phân bổ trọng số | Chia giá chào theo tỉ trọng từng item |
| F30 | Lợi nhuận gộp | Giá chào - Giá nhập |
| F31 | Chi phí dự thầu | Phí cố định |
| F32 | Chi phí bảo hành | % trên giá chào |
| F33 | Chi phí bán hàng | % trên giá chào |
| F34 | Chi phí công tác | Phí cố định |
| F35 | Lợi nhuận gộp KD | LNG - Tổng chi phí |
| F36 | Hoa hồng KD | % trên LNG KD (nếu dương) |
| F37 | Lợi nhuận ròng | LNG KD - Hoa hồng KD |
| F38 | Tỉ lệ LNR/Vốn | % hiệu suất sinh lời |
| F39 | Tỉ lệ giảm giá | % so với giá dự toán |

### 1.7 Tra cứu mã đấu thầu
| # | Tính năng | Mô tả |
|---|-----------|-------|
| F40 | Tra cứu IB tự động | Nhập mã IB, scrape từ muasamcong.mpi.gov.vn |
| F41 | Tự động điền form | Điền tên CT, bên mời thầu, TG đóng thầu, giá dự toán, địa điểm |
| F42 | Fetch detail | Lấy thêm địa điểm từ trang detail (nếu có ID) |

### 1.8 In / Chia sẻ
| # | Tính năng | Mô tả |
|---|-----------|-------|
| F43 | Trang in HTML | Server-render, đầy đủ thông tin + kết quả |
| F44 | Public link | /share/:id, không cần auth |
| F45 | Nút In | Gọi window.print() |
| F46 | Responsive layout | CSS print-friendly |

### 1.9 Giao diện & UX
| # | Tính năng | Mô tả |
|---|-----------|-------|
| F47 | Auto-save | Tự động lưu sau 30 giây không thao tác |
| F48 | Keyboard shortcut | Ctrl+S để lưu |
| F49 | Dynamic permission | Ẩn/hiện nút theo role + status |
| F50 | Toast notification | Thông báo thành công/lỗi |
| F51 | Loading / disabled | Trạng thái disable button khi đang xử lý |
| F52 | Duplicate IB check | Cảnh báo khi mã IB đã tồn tại |
| F53 | Dark/Light theme | Mặc định theo hệ thống (CSS prefers-color-scheme) |

### 1.10 Import / Utility
| # | Tính năng | Mô tả |
|---|-----------|-------|
| F54 | Import Excel | Script standalone import từ file .xlsx |

---

## 2. Tính năng đang thiếu (Missing / Gaps)

### 2.1 Vận hành & Hạ tầng
| # | Tính năng | Lý do thiếu | Mức độ ưu tiên |
|---|-----------|-------------|----------------|
| G01 | Không có test | Chưa viết test tự động | Cao |
| G02 | Không có error boundary | try/catch chưa đầy đủ | Cao |
| G03 | Không có logging | Không có log hệ thống, debug khó | Trung bình |
| G04 | Session lưu trong memory | Không scale được, mất session khi restart | Trung bình |
| G05 | Không có env config | PORT, secret, data path hardcode | Trung bình |
| G06 | Không có HTTPS | Plain HTTP, không an toàn cho production | Trung bình |
| G07 | JSON file storage | Không transactional, không concurrent-safe | Thấp (hiện tại đủ) |

### 2.2 Nghiệp vụ
| # | Tính năng | Lý do thiếu | Mức độ ưu tiên |
|---|-----------|-------------|----------------|
| G08 | Phân quyền chi tiết hơn | Chỉ có 2 role đơn giản | Trung bình |
| G09 | Audit log / Lịch sử thay đổi | Không ghi lại ai sửa gì, lúc nào | Trung bình |
| G10 | Validation nâng cao | Không validate số điện thoại, email, mã số thuế, etc. | Thấp |
| G11 | Không có dashboard thống kê | Không biểu đồ, không tổng quan | Thấp |
| G12 | Không có export PDF | Chỉ có in HTML qua trình duyệt | Thấp |
| G13 | Không có chức năng sao chép dự án | Mỗi lần tạo tương tự phải nhập lại từ đầu | Thấp |
| G14 | Không có gửi email thông báo | Admin không nhận thông báo khi có trình duyệt | Trung bình |
| G15 | Không có phân trang | Danh sách dự án tải toàn bộ 1 lần | Thấp |

### 2.3 Kỹ thuật
| # | Tính năng | Lý do thiếu | Mức độ ưu tiên |
|---|-----------|-------------|----------------|
| G16 | Frontend code không module | Tất cả trong 1 file index.html, global scope | Trung bình |
| G17 | Công thức tính duplicate | Client + Server đều có calculate(), dễ lệch | Trung bình |
| G18 | Không có API versioning | Tất cả /api/*, khó backward compatible | Thấp |

---

## 3. Đề xuất tương lai (Future Proposals)

### 3.1 Ngắn hạn (3-6 tháng)
| # | Tính năng | Mô tả | Giá trị |
|---|-----------|-------|---------|
| P01 | Database chính thức | Chuyển từ JSON sang SQLite hoặc PostgreSQL | An toàn dữ liệu, concurrent, transactional |
| P02 | Audit log | Ghi lại mọi thay đổi trên project: ai sửa field gì, lúc nào | Truy xuất trách nhiệm |
| P03 | Email notification | Gửi email cho admin khi có trình duyệt, cho employee khi được duyệt/từ chối | Tăng tốc quy trình |
| P04 | Unit test cho calculate() | Test coverage cho công thức tính giá | Đảm bảo chính xác |
| P05 | Module hóa frontend | Tách index.html thành nhiều file JS module | Maintainable |

### 3.2 Trung hạn (6-12 tháng)
| # | Tính năng | Mô tả | Giá trị |
|---|-----------|-------|---------|
| P06 | Dashboard & BI | Biểu đồ doanh thu, số lượng dự án, tỉ lệ trúng thầu | Hỗ trợ quyết định |
| P07 | So sánh giá | Xem lịch sử giá chào, so sánh giữa các dự án | Tối ưu chiến lược |
| P08 | Multi-company | Hỗ trợ nhiều công ty trong 1 hệ thống | Mở rộng thị trường |
| P09 | Phân quyền nâng cao | Thêm role: trưởng phòng (approve cấp 1), giám đốc (approve cấp 2) | Quy trình phê duyệt đa cấp |
| P10 | Export Excel/PDF chuyên nghiệp | Dùng thư viện chuyên dụng thay vì in HTML | Chất lượng tài liệu |

### 3.3 Dài hạn (12+ tháng)
| # | Tính năng | Mô tả | Giá trị |
|---|-----------|-------|---------|
| P11 | Mobile app | Ứng dụng di động cho duyệt dự án, thông báo | Tiện lợi |
| P12 | API public | REST API cho bên thứ 3 tích hợp | Hệ sinh thái |
| P13 | Machine learning | Dự đoán tỉ lệ trúng thầu dựa trên lịch sử | Chiến lược thông minh |
| P14 | Quản lý hợp đồng | Sau khi trúng thầu, quản lý hợp đồng + tiến độ | Mở rộng chuỗi giá trị |
| P15 | Kho hàng (Inventory) | Quản lý tồn kho, tự động đề xuất giá nhập | Tích hợp end-to-end |
