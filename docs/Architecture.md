# Architecture

## Kiến trúc tổng thể

Monolithic architecture — **Single-server Node.js Express** serving both REST API and static frontend.

```
┌──────────────────────────────────────────────────────────────┐
│                      Client (Browser)                         │
│         Vanilla JS SPA — public/index.html (1365 dòng)        │
│         Không framework, không build tool                     │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP (localhost:3456)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              Express.js Server (server.js)                    │
│                                                               │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Auth MW  │  │ Static File  │  │ Session Management     │   │
│  │ (session)│  │ (express     │  │ (express-session)      │   │
│  │          │  │  .static)    │  │                       │   │
│  └──────────┘  └──────────────┘  └───────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              REST API Routes                             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │ Auth     │ │ Users    │ │ Projects │ │ Scraping │   │  │
│  │  │ /api/*   │ │ /api/    │ │ /api/    │ │ /api/    │   │  │
│  │  │          │ │ users/*  │ │ projects │ │ fetch-   │   │  │
│  │  │          │ │          │ │ /*       │ │ bidding- │   │  │
│  │  │          │ │          │ │          │ │ info/:ib │   │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Share/Print Route                                       │  │
│  │  GET /share/:id → HTML trang in (server-rendered)        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Data Layer                                  │  │
│  │  JSON File Storage (synchronous read/write)              │  │
│  │  ├── data/projects.json   → Project + Items + Params     │  │
│  │  └── data/users.json      → User accounts (hashed pw)   │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Component diagram (text)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Auth Component  │────▶│  Session Guard   │────▶│  Role Guard     │
│  (login/logout)  │     │  (auth MW)       │     │  (adminOnly MW) │
└─────────────────┘     └──────────────────┘     └─────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Project Component                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ CRUD Routes  │  │ Status       │  │ Validation            │  │
│  │ (create/read │  │ Workflow     │  │ (duplicate IB,        │  │
│  │  /update/    │  │ (submit/     │  │  required fields)     │  │
│  │  delete)     │  │  approve/    │  │                       │  │
│  │              │  │  reject/     │  │                       │  │
│  │              │  │  unapprove)  │  │                       │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  Item Sub-component                                      │   │
│  │  (embedded trong Project, không có API riêng)            │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  Price Calculation Engine                                │   │
│  │  (server: share route + client: calculate())             │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────┐    ┌──────────────────────────────────────┐
│  Scraping Component  │    │  Share/Print Component               │
│  (Playwright         │    │  (Server-rendered HTML)              │
│   Chromium)          │    │                                      │
└─────────────────────┘    └──────────────────────────────────────┘

┌─────────────────────┐
│  User Component     │
│  (Admin only:       │
│   CRUD users)       │
└─────────────────────┘
```

## Luồng dữ liệu chính

### 1. Luồng tạo dự án và tính giá

```
User → [Frontend] → collectFormData() → PUT /api/projects/:id
                                          ↓
                                  server.js → update project JSON
                                          ↓
                                  Response → [Frontend] → calculate()
                                          ↓
                                  Hiển thị kết quả (giá chào, lợi nhuận...)
```

### 2. Luồng tra cứu mã IB

```
User nhập IB → [Frontend] → GET /api/fetch-bidding-info/:ibCode
                              ↓
                      server.js → chromium.launch()
                              ↓
                      Playwright → muasamcong.mpi.gov.vn
                              ↓
                      Parse JSON response → extract fields
                              ↓
                      Response → [Frontend] → fill form fields
```

### 3. Luồng phê duyệt

```
Employee: POST /api/projects → draft
          PUT /api/projects/:id → sửa
          PATCH /api/projects/:id/submit → pending

Admin:    PATCH /api/projects/:id/approve → approved
          PATCH /api/projects/:id/reject → rejected
          PATCH /api/projects/:id/unapprove → approved→rejected
```

### 4. Luồng in/chia sẻ

```
User → [Frontend] → window.open(/share/:id)
                      ↓
              server.js → read project JSON
                      ↓
              Server-render HTML (tính toán giá server-side)
                      ↓
              Browser → Print dialog
```

## Dependency giữa module

| Module | Phụ thuộc vào | Ghi chú |
|--------|--------------|---------|
| Auth | — | express-session, bcryptjs |
| User Management | Auth | Admin-only routes |
| Project CRUD | Auth, User | Cần user để xác định owner |
| Item Management | Project CRUD | Items được lưu inline trong project |
| Price Calculation | Item, Project Params | Tính toán xảy ra cả client và server |
| IB Scraping | Auth | Playwright Chromium |
| Share/Print | Project CRUD | Server-render HTML |
| Excel Import | API (HTTP client) | Standalone script |
| Frontend SPA | Tất cả API | index.html duy nhất |
