# Module: Price Calculation (Tính giá chào thầu)

## Mục đích

Tính toán tự động giá chào tối thiểu, phân bổ chi phí, lợi nhuận dựa trên tham số đầu vào.

## Công thức tính toán

### Đầu vào
| Variable | Nguồn | Ý nghĩa |
|----------|-------|---------|
| `items[].soLuong * donGiaNhap` | User nhập | Giá nhập từng mặt hàng |
| `tiLeLNG` | User nhập (%) | Tỉ lệ lợi nhuận gộp mong muốn |
| `phiDuThau` | User nhập (VNĐ) | Chi phí dự thầu cố định |
| `phiBaoHanh` | User nhập (%) | Chi phí bảo hành (% trên giá chào) |
| `phiBanHang` | User nhập (%) | Chi phí bán hàng (% trên giá chào) |
| `phiCongTac` | User nhập (VNĐ) | Chi phí công tác cố định |
| `hoaHongKD` | User nhập (%) | Hoa hồng kinh doanh (% trên LNG KD) |
| `giaDuToan` | User nhập (VNĐ) | Giá dự toán từ bên mời thầu |

### Tính toán

```
tongGiaNhap = Σ(items[].soLuong * items[].donGiaNhap)

// Giá chào tối thiểu:
giaChaoToiThieu = (tiLeLNG >= 100)   → 0
                 = (tiLeLNG > 0)      → round(tongGiaNhap / (1 - tiLeLNG/100))
                 = (tiLeLNG == 0)     → tongGiaNhap

// Phân bổ trọng số:
firstGiaNhap = items[0].soLuong * items[0].donGiaNhap
item.trongSo = firstGiaNhap > 0 ? item.giaNhap / firstGiaNhap : 0
tongTrongSo = Σ item.trongSo
item.donGiaChao = tongTrongSo > 0 && item.trongSo > 0
                  ? round(giaChaoToiThieu * item.trongSo / tongTrongSo)
                  : 0

// Lợi nhuận:
loiNhuanGop         = giaChaoToiThieu - tongGiaNhap
cpDuThau            = phiDuThau
cpBaoHanh           = round(giaChaoToiThieu * phiBaoHanh / 100)
cpBanHang           = round(giaChaoToiThieu * phiBanHang / 100)
cpCongTac           = phiCongTac
loiNhuanGopKD       = loiNhuanGop - cpDuThau - cpBaoHanh - cpBanHang - cpCongTac
hoaHongKD           = loiNhuanGopKD > 0 ? round(loiNhuanGopKD * hoaHongKD / 100) : 0
loiNhuanRong        = loiNhuanGopKD - hhKD
tiLeLNRVon          = tongGiaNhap > 0 ? loiNhuanRong / tongGiaNhap * 100 : 0
tiLeGiamGia         = giaDuToan > 0 ? (giaDuToan - giaChaoToiThieu) / giaDuToan * 100 : 0
```

## Hiển thị kết quả

| Chỉ số | Hiển thị | Ý nghĩa |
|--------|----------|---------|
| Giá chào tối thiểu | VNĐ (highlight) | Giá đề xuất thấp nhất |
| Tổng giá nhập | VNĐ (cost) | Tổng vốn hàng |
| Lợi nhuận gộp (LNG) | VNĐ + % | Lợi nhuận trước chi phí |
| Phí dự thầu | VNĐ | Cố định |
| Phí bảo hành | VNĐ + % | Trên giá chào |
| Phí bán hàng | VNĐ + % | Trên giá chào |
| Phí công tác | VNĐ | Cố định |
| Lợi nhuận gộp KD | VNĐ | Sau trừ các chi phí |
| Hoa hồng KD | VNĐ + % | Trên LNG KD (nếu dương) |
| Lợi nhuận ròng (LNR) | VNĐ (highlight) | Kết quả cuối cùng |
| Tỷ lệ LNR/Vốn | % | Hiệu suất sinh lời |
| Tỉ lệ giảm giá | % | So với giá dự toán |

## File code quan trọng

- `public/index.html:1026-1114` — `calculate()` (client-side, real-time)
- `server.js:443-457` — Calculation logic trong `/share/:id` (server-side)
- `public/index.html:1064-1067` — Tổng cộng row (dynamic)
- `public/index.html:1180-1186` — manualSave triggers validation + save

## Module phụ thuộc

- **Project** module — Cần project + items + params
- **Item Management** module — Items input
