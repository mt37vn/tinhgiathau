# Coding Rule

## Pattern hiện tại

| Pattern | Chi tiết |
|---------|----------|
| **Kiến trúc** | Monolithic, single-file server (`server.js`), single-file SPA (`public/index.html`) |
| **Module system** | CommonJS (`require` / `module.exports` không dùng — tất cả export implicit) |
| **Routing** | Express route handlers inline trong `server.js` |
| **Middleware** | Custom `auth()` + `adminOnly()` cho authorization |
| **Data access** | Synchronous JSON: `readData(file)` / `writeData(file, data)` |
| **Frontend** | Vanilla JS ES6+ (không module bundler, không framework) |
| **State management** | Global variables: `currentProject`, `projects`, `currentUser`, `users` |
| **API client** | Custom `api(method, url, body)` function (fetch wrapper) |
| **DOM manipulation** | Direct DOM queries (`document.getElementById`, `querySelector`) |

## Cách tổ chức code

### Server (`server.js`)

```
1. Imports + init (Express, session, Playwright)
2. Data helpers (readData, writeData)
3. Middleware (auth, adminOnly)
4. Auth routes    (/api/login, logout, me, change-password)
5. User routes    (/api/users CRUD)
6. Project routes (/api/projects CRUD + status transitions)
7. IB scraping    (/api/fetch-bidding-info/:ibCode)
8. Share/Print    (/share/:id with HTML template string + calculation)
9. Server start
```

### Frontend (`public/index.html`)

Single file: CSS inline trong `<style>`, HTML trong `<body>`, JS trong `<script>` cuối.

```
JS organization (top-down):
1. Global state variables
2. Utility functions (formatNumber, parseNumber, toVND, api...)
3. Auth functions (checkAuth, doLogin, doLogout...)
4. Password change
5. User management CRUD
6. Project list rendering
7. Project CRUD (create, select, delete, switch)
8. Form load/clear/collect (loadProjectToForm, clearForm, collectFormData)
9. Items table (renderItems, addRowToTable, getItemsFromTable)
10. Calculation engine (calculate)
11. Auto-save / manual save
12. Permission UI (applyPermissions)
13. Validation (validateProjectInfo, validateFull)
14. IB fetch
15. DOM event listeners
```

## Quy tắc đặt tên

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| **Variables** | camelCase | `currentProject`, `formDirty` |
| **Functions** | camelCase | `loadProjectList()`, `calculate()` |
| **API routes** | kebab-case (URL path) | `/api/fetch-bidding-info/:ibCode` |
| **JSON fields** | camelCase (projectInfo: Vietnamese) | `tenCongTrinh`, `maDauThau`, `tiLeLNG` |
| **HTML IDs** | camelCase | `tenCongTrinh`, `itemsBody`, `btnSave` |
| **CSS classes** | kebab-case | `status-badge`, `status-draft`, `form-group` |
| **File names** | kebab-case | `server.js`, `import-excel.js` |
| **Middleware** | descriptive | `auth`, `adminOnly` |
| **Constants** | UPPER_SNAKE | Các config hardcode như `DATA_DIR`, `PROJ_FILE` |

## Quy tắc ngôn ngữ

- **UI text:** Tiếng Việt (có dấu)
- **Code identifiers:** Tiếng Anh (trừ fields nghiệp vụ như `tenCongTrinh`, `maDauThau`)
- **Error messages:** Tiếng Việt
- **Comments:** Tiếng Việt (có dấu)

## Quy tắc tạo module mới

1. **Server-side route mới:**
   - Thêm route handler vào `server.js` (hoặc tách file riêng và require)
   - Nếu cần auth: dùng `auth` middleware
   - Nếu chỉ admin: dùng `auth, adminOnly`
   - Validate input trước khi ghi data
   - Dùng `readData`/`writeData` để đọc/ghi JSON

2. **Frontend feature mới:**
   - Thêm HTML elements vào `public/index.html` (trong `<body>`)
   - Thêm CSS vào `<style>` (chung, không module)
   - Thêm JS functions vào `<script>` (global scope)
   - UI text bằng tiếng Việt

3. **Kết nối mới:**
   - Server route trả JSON
   - Client gọi bằng `api(method, url, body)`
   - Không có validation schema (tự validate thủ công)

## Security patterns hiện tại

| Pattern | Implementation |
|---------|---------------|
| Password hashing | bcryptjs, 10 rounds |
| Session management | express-session (memory store) |
| Authorization | `auth()` middleware: kiểm tra `req.session.user` |
| Role-based access | `adminOnly()` middleware: kiểm tra `role === 'admin'` |
| Input validation | Thủ công ở từng route (không có schema validator) |
| No SQL injection | Không dùng SQL |
| No XSS protection | `esc()` / `escHtml()` function (thủ công) cho output |

## Technical debt / Lưu ý

- **Không có database transaction** — JSON write là synchronous, không atomic
- **Không có error boundary** — try/catch ở từng route, một số chỗ catch rỗng
- **Frontend không module** — tất cả global scope, dễ xung đột
- **Không có environment variables** — session secret, port, data path hardcoded
- **Không có HTTPs** — plain HTTP
- **Session store mặc định** — MemoryStore, không dùng cho production với multi-instance
- **Client-side calculation** — Công thức tính giá duplicate giữa client (`calculate()`) và server (`/share/:id`)
- **Không có API versioning** — All routes `/api/*`
