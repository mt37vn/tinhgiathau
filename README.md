# Phần Mềm Tính Giá Chào Thầu

Ứng dụng web nội bộ hỗ trợ lập và quản lý giá chào thầu: quản lý dự án, nhà cung cấp, tham số chi phí, đồng bộ Trello, nhận dữ liệu thầu tự động và sao lưu dữ liệu.

## Tính năng

- Đăng nhập nhiều người dùng, phân quyền `admin` / `employee`, đổi mật khẩu.
- Quản lý dự án và lịch sử dự án; tính giá theo các nhóm chi phí: Bán hàng/Triển khai, Chi phí vốn, Chi phí bảo lãnh.
- Quản lý nhà cung cấp, gợi ý nhà cung cấp theo tên hàng hóa.
- Nhập/xuất bảng tính Excel (`xlsx`), xử lý file ZIP (`adm-zip`).
- Đồng bộ thẻ Trello theo trạng thái: chuẩn bị, đã duyệt, từ chối, thắng, thua; hỗ trợ webhook Butler.
- API tiếp nhận thầu tự động (`POST /api/receive-bid`) để bot/tiện ích bên ngoài đẩy dữ liệu vào.
- Thu thập dữ liệu bằng Playwright (Chromium headless).
- Thông báo đẩy trên trình duyệt qua Web Push (VAPID) và PWA/service worker.
- Sao lưu định kỳ ra thư mục local và/hoặc git repository.

## Công nghệ

Node.js 22 · Express 4 · express-session · bcryptjs · Playwright · xlsx · adm-zip · web-push · Docker

## Chạy nhanh

```bash
npm install
npx playwright install chromium
npm start
```

Mặc định ứng dụng chạy tại <http://localhost:3456>.

Lần chạy đầu tiên, hệ thống tạo sẵn hai tài khoản trong `data/users.json`:

| Tài khoản | Mật khẩu | Vai trò |
| --- | --- | --- |
| `admin` | `admin123` | Quản trị |
| `nhanvien` | `nv123` | Nhân viên |

> Đổi mật khẩu ngay sau khi triển khai.

## Biến môi trường

Tạo file `.env` ở thư mục gốc (hoặc khai báo trong `docker-compose.yml`):

| Biến | Mô tả |
| --- | --- |
| `PORT` | Cổng HTTP, mặc định `3456` |
| `APP_VERSION` | Phiên bản hiển thị trên giao diện |
| `TRELLO_API_KEY`, `TRELLO_TOKEN` | Thông tin xác thực Trello |
| `TRELLO_LIST_PREPARING`, `TRELLO_LIST_APPROVED`, `TRELLO_LIST_REJECTED`, `TRELLO_LIST_WIN`, `TRELLO_LIST_LOSE` | ID các danh sách Trello tương ứng trạng thái |
| `SYNC_TOKEN` | Token cho API đồng bộ |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Cấu hình Web Push |
| `BACKUP_ENABLED`, `BACKUP_DIR`, `BACKUP_KEEP_LOCAL` | Cấu hình sao lưu local |
| `BACKUP_GIT_REPO`, `BACKUP_GIT_TOKEN` | Sao lưu lên git repository |

## Docker

```bash
docker compose up -d --build
```

Dữ liệu được lưu trong `./data`, bản sao lưu trong `./backup`. Workflow `.github/workflows/deploy.yml` tự động deploy qua SSH khi push lên nhánh `master`.

## API chính

Các endpoint dưới đây (trừ login và webhook) yêu cầu session đăng nhập:

- `POST /api/login`, `POST /api/logout`, `GET /api/me`
- `GET/POST /api/projects`, `GET /api/projects/:id`, `GET /api/projects/:id/history`
- `GET /api/suppliers`, `GET /api/suppliers/:id`, `GET /api/suppliers/suggest/:itemName`
- `POST /api/trello/sync`, `POST /api/trello/butler-webhook`
- `POST /api/receive-bid`
- `GET /api/version`, `GET/POST /api/push/subscribe`

## Cấu trúc

```
server.js              # Express server và toàn bộ API
public/                # Giao diện SPA, service worker
scripts/
  trello-sync.js       # Đồng bộ Trello
  backup.js            # Sao lưu dữ liệu
  gh-fetch.js          # Tải dữ liệu từ GitHub
  extract-zip.py       # Giải nén file ZIP
data/                  # Dữ liệu JSON, file TBMT
bot_thau.py            # Bot thu thập dữ liệu thầu
```
