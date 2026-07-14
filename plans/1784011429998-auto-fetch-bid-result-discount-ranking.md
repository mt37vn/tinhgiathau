# Plan: Auto-fetch Bid Result + Discount-based Supplier Ranking

## Background

PO requests:
1. Auto-fetch bid results from `muasamcong.mpi.gov.vn` for simplified packages (e.g. IB2600343600 → winning price 256.880.000₫)
2. Change supplier ranking from win-rate → `discount rate = (WinningPrice - SupplierCost) / WinningPrice * 100%`
3. Reason: win rate is misleading because lost bids are often due to employee pricing errors, not supplier quality

## Decisions (resolved with PO)

| Decision | Choice |
|----------|--------|
| Discount formula | `(WinningPrice - SupplierItemCost) / WinningPrice * 100%` (A) |
| Multi-supplier allocation | Proportional by `trongSo` / bid price ratio |
| Auto-fetch | Yes, with manual fallback |
| Trigger point | Manual button + background daily check |
| Win rate | Still computed but not used for ranking |

## Tasks

### 1. Explore portal bid result URL

- Run Playwright headless to determine the correct URL/API pattern for bid results on `muasamcong.mpi.gov.vn`
- Try patterns: `step=result`, `step=hsdt`, `type=es-result-contractor`, etc.
- Identify JSON response fields containing `winningPrice`, `winningBidder`, etc.
- **File**: `server.js` (exploratory code in the existing fetch endpoint)

### 2. Add bid result scraping endpoint

- New API: `GET /api/fetch-bid-result/:ibCode`
- After bid close date, navigate to the bid result page
- Extract: `giaTrungThau` (winning price), `nhaThauTrung` (winning contractor name)
- Return structured result or error if not available yet
- **File**: `server.js` — new route after `GET /api/fetch-bidding-info/:ibCode`

### 3. Store auto-fetch metadata in project

Add fields to `projects.json`:

```json
{
  "giaTrungThau": 256880000,
  "ketQuaTrungThau": "win" | "lose" | null,
  "nhaThauTrung": "Tên nhà thầu trúng",
  "bidResultFetchedAt": "ISO timestamp",
  "bidResultFetchError": null | "error message"
}
```

**File**: `server.js` — modify `PATCH /api/projects/:id/bid-result`

### 4. Add auto-fetch button API

- New API: `POST /api/projects/:id/fetch-bid-result`
- Triggers scraping for that specific project's IB code
- Auto-fills `giaTrungThau`, `ketQuaTrungThau` if found
- Returns updated project
- **File**: `server.js`

### 5. Compute per-item discount rate

Modify `computeSupplierStats()`:

- For each project with `ketQuaTrungThau === "win"` and `giaTrungThau`
- For each item referencing this supplier:
  - `itemWinningPrice = giaTrungThau * (item.giaChao / totalGiaChao)` — proportional by bid price
  - `discountRate = (itemWinningPrice - item.giaNhap) / itemWinningPrice * 100`
- Aggregate per supplier:
  - `avgDiscountRate` = mean of all discountRate values
  - `minDiscountRate`, `maxDiscountRate`
  - `weightedDiscountRate` = weighted by item value
- Remove `winRate` from primary ranking (keep as secondary info)
- **File**: `server.js` — `computeSupplierStats()` function

### 6. Update supplier scoring formula

Change `FR-05.1` scoring:

```
Score = w1 * DiscountRate + w2 * (1 - AvgPrice/IndustryAvg) + w3 * NumProjects
```

Default weights: w1=0.6, w2=0.2, w3=0.2 (admin-configurable)
Star rating (1-5) based on score percentile.

**File**: `server.js` — scoring in `computeSupplierStats()`

### 7. Update frontend supplier list/detail

- **Supplier list**: Replace "Tỉ lệ thắng" column with "Chiết khấu TB (%)"
- **Supplier detail**: Replace win-rate cards with discount-rate cards
  - Discount rate TB, min, max
  - Weighted by project value
  - Still show win/lose counts as secondary info
- **Item stats**: Add discount rate per item
- **Files**: `public/index.html`

### 8. Add auto-fetch button to bid result section

- In `bidResultGroup`, add button "🔍 Lấy kết quả tự động"
- Calls `POST /api/projects/:id/fetch-bid-result`
- On success, fills `giaTrungThau` and updates `ketQuaTrungThau`
- On fail, shows error toast, allows manual entry as fallback
- **File**: `public/index.html`

### 9. Background daily check (optional stretch)

- Add `/api/cron/check-bid-results` endpoint (no auth or internal)
- Iterates all approved projects past close date without bid result
- Calls fetch for each, logs results
- Can be triggered by cron job or manually
- **File**: `server.js`

### 10. Update US-SUP-001.md

- Modify scoring formula (FR-05.1)
- Update Open Questions with new decisions
- Move to `docs/user-stories/approved/` (already there)
- **File**: `docs/user-stories/approved/US-SUP-001.md`

## Data Flow

```
User clicks "Lấy kết quả tự động"
  → POST /api/projects/:id/fetch-bid-result
    → server.js: Playwright → muasamcong kết quả thầu page
    → Parse JSON → extract giaTrungThau, nhaThauTrung
    → Update project fields
    → Return updated project
  → Frontend fills form fields
  → computeSupplierStats() next time it runs will use new data
```

## Discount Rate Calculation Example

Given:
- IB2600343600, `giaTrungThau = 256.880.000`
- Item A: NCC "Long Vân", `giaNhap = 50.000.000`, `giaChao = 80.000.000`
- Item B: NCC "Long Vân", `giaNhap = 95.400.000`, `giaChao = 120.000.000`

Compute:
- `totalGiaChao = 80.000.000 + 120.000.000 = 200.000.000`
- Item A winning price = `256.880.000 * (80M / 200M) = 102.752.000`
- Item A discount = `(102.752.000 - 50.000.000) / 102.752.000 * 100 = 51.33%`
- Item B winning price = `256.880.000 * (120M / 200M) = 154.128.000`
- Item B discount = `(154.128.000 - 95.400.000) / 154.128.000 * 100 = 38.10%`
- NCC "Long Vân" avg discount = `(51.33 + 38.10) / 2 = 44.72%`

## Affected files

| File | Change |
|------|--------|
| `server.js` | +bid result scraping, +discount rate computation, +auto-fetch endpoint, +scoring formula |
| `public/index.html` | +auto-fetch button, +discount rate display in supplier list/detail |
| `docs/user-stories/approved/US-SUP-001.md` | Update FR-05.1, Open Questions |
| `data/projects.json` | Existing data schema changes (no migration needed, new fields optional) |

## Validation

1. Run `GET /api/fetch-bid-result/IB2600343600` → returns winning price
2. Run `POST /api/projects/:id/fetch-bid-result` → auto-fills project
3. Check `GET /api/suppliers` → supplier ranked by discount rate
4. Check supplier detail → shows discount rate per item
5. Manual entry fallback works when scraping returns error
6. Win rate still visible as secondary info but not primary ranking
