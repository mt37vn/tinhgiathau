# Fix: Bid Result Not Found — Search Result Contains Winning Data

## Root Cause

The `GET /api/fetch-bid-result/:ibCode` endpoint only checks the `lcnt_tbmt_ttc_ldt` detail endpoint for bid result data. But when results are published, the **search response JSON** (`/o/egp-portal-contractor-selection-v2/services/smart/search`) already contains the winning data directly.

## Discovery

Exploration of IB2600347683 (known winning price 80,220,400₫) revealed the search result includes:

```json
{
  "bidWinningPrice": [80220400],
  "contractorName": ["CÔNG TY TNHH BẰNG TRUNG DŨNG"],
  "winningCode": ["vn5200868219"],
  "stepCode": "notify-contractor-step-4-kqlcnt",
  "decisionDate": "2026-07-14T11:13:53",
  "publicDateKqlcnt": "2026-07-14T11:17:47"
}
```

For the previous IB2600343600 (no published result), these fields were absent and `stepCode` was `reoffer-price-step-1`.

The `lcnt_tbmt_ttc_ldt` detail endpoint always returns null for result-related fields regardless of whether results exist — the result data is only in the search response.

## Changes

### File: `server.js`

**1. `GET /api/fetch-bid-result/:ibCode`** — Add early check for search result fields:

After `searchResult` is found (line ~856), before navigating to the detail page:
- Check if `searchResult.bidWinningPrice` exists and is a non-empty array
- Extract `giaTrungThau` from `bidWinningPrice[0]`
- Extract `nhaThauTrung` from `contractorName[0]` if available
- Also record `decisionDate` and `publicDateKqlcnt` if needed
- If found, return immediately: `{ giaTrungThau, nhaThauTrung, found: true, source: 'searchResult' }`
- If not found, fall through to existing detail page navigation logic

**2. `GET /api/fetch-bidding-info/:ibCode`** (optional enhancement) — Also extract `bidWinningPrice` and `contractorName` from the search result in this endpoint, so the project info fetch can optionally return bid result data when available.

## Data Flow (fixed)

```
Search portal for IB code
  → Parse JSON response
  → Check searchResult.bidWinningPrice (NEW)
    → If present: return giaTrungThau + nhaThauTrung immediately
    → If absent: navigate to detail page (existing logic, fallback)
```

## Validation

1. `GET /api/fetch-bid-result/IB2600347683` → returns `giaTrungThau: 80220400`, `nhaThauTrung: "CÔNG TY TNHH BẰNG TRUNG DŨNG"`
2. `POST /api/projects/:id/fetch-bid-result` for project with IB2600347683 → auto-fills win + price
3. `GET /api/fetch-bid-result/IB2600343600` → still returns "not found" (no regression, no published result)
4. `GET /api/fetch-bid-result/IB2600342361` → still returns "not found" (no regression)

## Files Changed

| File | Change |
|------|--------|
| `server.js` | Add search-result bid-winning check before detail page navigation |

## Risks

- **No risk**: The new check runs before the existing detail page logic; the old logic is a fallback. If `bidWinningPrice` doesn't exist in the search result, the behavior is unchanged.
- **Data is array**: The winning price is inside an array. Use `extractPrice()` (already exists) or direct access with `Array.isArray` guard.
