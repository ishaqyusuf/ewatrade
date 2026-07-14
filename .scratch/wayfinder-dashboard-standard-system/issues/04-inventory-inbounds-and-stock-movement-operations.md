# 04 - Inventory, Inbounds, And Stock Movement Operations

**What to build:** managers can review stock by product and unit, record inbound stock intake, record stock adjustments, perform unit conversions, and inspect stock movement history through the dashboard.

**Blocked by:** 03 - Products Proof Slice With Table, Sheet, And Form Foundations.

**Status:** implementation-complete

- [x] Inventory table shows product/unit stock, low-stock or out-of-stock state, and relevant filters.
- [x] Stock intake can be recorded from the dashboard with clear validation and permission handling.
- [x] Stock adjustments can be recorded with reason, direction, and optional notes where supported by the API.
- [x] Unit conversion or rebagging can be recorded between supported product units.
- [x] Stock movement history is visible with date, product/unit, movement type, actor, and source context where available.
- [x] Browser/HTTP QA covers inventory viewing, stock intake, stock adjustment, unit conversion, stock movement filtering, and role-gated access.
- [x] API and Brain docs are updated if new dashboard-facing stock contracts or behavior are added.

## Implementation Notes

- Added `/inventory` as a shell route with a Midday-style table/filter surface, summary cards, movement history, and right-side sheets for stock intake, stock adjustment, and unit conversion.
- Added `GET /api/inventory` and `POST /api/inventory` dashboard bridge routes. The routes resolve the authenticated dashboard session, active tenant, and selected or active store before returning inventory/movement data or recording stock operations through the existing Retail Ops stock query helpers.
- Added shared inventory helpers for POS-capable permission checks, stock-state calculation, inventory row mapping, movement labels, and signed movement quantities.
- QA evidence:
  - Authenticated `/inventory` returned `200`.
  - Logged-out `/inventory` redirected to marketing login with `next=/inventory`.
  - `GET /api/inventory` returned the QA store inventory and movement history.
  - `POST /api/inventory` rejected zero quantity with `400`.
  - `POST /api/inventory` accepted stock intake, stock adjustment, and unit conversion requests and refreshed movement history with the new entries.
