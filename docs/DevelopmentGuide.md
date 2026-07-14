# Development Guide

## Công nghệ

- **Node.js** runtime (không cần build tool)
- **Express.js** 4.x web framework
- **Vanilla JS** frontend (ES6+)
- **Playwright** Chromium cho scraping
- **File-based JSON** storage

## Yêu cầu hệ thống

- Node.js ≥ 18 (Playwright yêu cầu)
- npm

## Cách chạy project

```bash
# 1. Clone và cd vào project
cd /path/to/dauthau

# 2. Cài dependencies
npm install

# 3. Cài Playwright Chromium browser
npx playwright install chromium

# 4. Chạy server
npm start
# hoặc
npm run dev
```

Server chạy tại: `http://localhost:3456`

**Lần chạy đầu tiên:**
- Tự động tạo `data/` directory
- Tạo `data/users.json` với 2 tài khoản mặc định (admin/admin123, nhanvien/nv123)
- Tạo `data/projects.json` rỗng

## Tài khoản mặc định

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Admin |
| nhanvien | nv123 | Employee |

## Cách test

**Hiện tại không có test framework / test files.** (npm scripts không có test command)

Nếu cần test thủ công:
1. Đăng nhập với các vai trò khác nhau
2. Tạo dự án, thêm hàng hóa, nhập tham số
3. Trình duyệt → Duyệt/Từ chối
4. Dùng tính năng Tìm IB
5. Kiểm tra trang in `/share/:id`

## Cách deploy

### Development
```bash
npm start
# hoặc
node server.js
```

### Production considerations (chưa implement)

1. **Session store:** Chuyển từ MemoryStore sang Redis hoặc database store
2. **Environment variables:** Dùng `.env` cho PORT, SESSION_SECRET, DATA_DIR
3. **HTTPS:** Thêm reverse proxy (Nginx/Caddy) với SSL
4. **Process manager:** Dùng PM2 hoặc systemd
5. **Database:** Cân nhắc chuyển từ JSON sang SQLite/PostgreSQL
6. **Playwright production:** Cần Chromium binary trên server
7. **Concurrency:** JSON file không an toàn với concurrent writes, cần file lock hoặc database

## Quy trình phát triển tính năng mới

### 1. Thêm API endpoint mới

```javascript
// server.js

// a. Add route handler
app.get('/api/new-feature', auth, async (req, res) => {
  try {
    const data = readData(PROJ_FILE);
    // logic...
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 2. Thêm UI cho tính năng mới

```html
<!-- public/index.html -->

<!-- a. Add HTML (trong <body>) -->
<div class="card" id="newFeatureCard">
  <h2>Tính năng mới</h2>
  ...form elements...
</div>

<!-- b. Add CSS (trong <style>) -->
<style>
  /* styles ở đây */
</style>

<!-- c. Add JS functions (trong <script>) -->
<script>
  async function newFeature() {
    const data = await api('GET', '/api/new-feature');
    // update DOM...
  }
</script>
```

### 3. Template cho module mới

```javascript
// server.js — new-module structure
// ========== NEW MODULE ==========
// Imports (nếu cần)
const someLib = require('some-lib');

// Middleware (nếu cần)
function moduleGuard(req, res, next) { ... }

// Routes
app.get('/api/module', auth, async (req, res) => { ... });
app.post('/api/module', auth, async (req, res) => { ... });
// ==================================
```

## Cấu trúc thư mục

```
dauthau/
├── server.js              # Express server (tất cả routes)
├── import-excel.js        # Utility script
├── package.json
├── public/
│   └── index.html         # Frontend SPA
├── data/                  # JSON storage (gitignored)
│   ├── projects.json
│   └── users.json
├── docs/                  # Tài liệu
│   ├── Vision.md
│   ├── Architecture.md
│   ├── Database.md
│   ├── API.md
│   ├── CodingRule.md
│   ├── DevelopmentGuide.md
│   └── modules/
│       └── ...
├── node_modules/
└── .gitignore
```

## Lưu ý khi phát triển

1. **Synchronous JSON I/O:** `readFileSync`/`writeFileSync` block event loop — tránh gọi nhiều trong một request
2. **Global state frontend:** Biến global (`currentProject`, `projects`) dễ tracking state, nhưng khó mở rộng
3. **Duplicate calculation logic:** Công thức tính giá có ở cả `calculate()` (client) và `/share/:id` (server) — cần maintain cả hai
4. **Playwright:** Dùng headless Chromium, timeout 30s mỗi request — cần xử lý timeout hợp lý
5. **Tiếng Việt:** Tất cả UI/error messages bằng tiếng Việt, giữ consistent
