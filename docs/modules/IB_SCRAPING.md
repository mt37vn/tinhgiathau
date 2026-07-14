# Module: IB Scraping (Tra cứu mã đấu thầu)

## Mục đích

Tự động tra cứu thông tin dự án từ cổng đấu thầu quốc gia (muasamcong.mpi.gov.vn) bằng mã IB.

## Cơ chế

Sử dụng **Playwright Chromium headless** để:
1. Mở trang tìm kiếm `muasamcong.mpi.gov.vn`
2. Điền mã IB vào ô `input[name="keyword"]`
3. Bắt JSON response từ API của trang
4. Parse kết quả, lấy các field: `bidName`, `investorName`, `bidCloseDate`, `bidPrice`
5. Fetch thêm trang detail nếu có ID ($tbmtId) để lấy địa điểm (`diaDiem`)

## API liên quan

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/fetch-bidding-info/:ibCode` | Yes | Tra cứu IB code |

## Output fields

| Field | Nguồn | Ghi chú |
|-------|-------|---------|
| tenCongTrinh | `responseData.bidName` | |
| benMoiThau | `responseData.investorName` | |
| thoiGianDongThau | `responseData.bidCloseDate` | ISO string |
| giaDuToan | `bidPrice` hoặc `bidEstimatePrice` hoặc `planItemPrice` | parseFloat, loại bỏ ký tự |
| bidNo | `notifyNo` hoặc `bidNo` | |
| diaDiem | Detail page -> `bidpBidLocationList[0]` | wardName, districtName, provName |

## Xử lý lỗi

- Nếu không tìm thấy IB → 404
- Nếu lỗi kết nối Playwright → 500
- Nếu không fetch được detail → vẫn trả về search result
- Timeout: 30s mỗi page load

## File code quan trọng

- `server.js:288-422` — `app.get('/api/fetch-bidding-info/:ibCode')`
- `public/index.html:1271-1294` — `fetchBiddingInfo()` UI + gọi API

## Module phụ thuộc

- **Auth** module — Cần login
- **Playwright** (`npm package`) — Chromium automation
