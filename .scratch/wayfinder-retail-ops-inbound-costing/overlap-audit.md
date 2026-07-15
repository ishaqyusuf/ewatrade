# Existing Feature Overlap Audit

Date: 2026-07-13

This audit checks the user's requested features against existing Brain and scratch artifacts so the new effort does not duplicate prior work.

## Existing work to reuse

- Multi-business account support already exists as an active Retail Ops direction. Relevant docs:
  - `.brain/plans/2026-07-06-feature-multi-business-signup-and-onboarding.md`
  - `.brain/modules/merchant-system.md`
  - `.brain/features/retail-ops-sales-product.md`
- Current dashboard behavior already includes first-phase tenant switching and store switching:
  - `getActiveTenant` exposes active tenant memberships.
  - `/api/tenants/active` validates and persists active tenant selection for local/dev contexts.
  - `/api/stores/active` persists selected store inside a tenant.
  - The sidebar exposes tenant and store selectors when multiple options exist.
- Current mobile/local Retail Ops behavior already has a business switch/create bridge:
  - `.scratch/mobile-retail-ops-mvp/issues/01-owner-signup-otp-and-business-entry.md`
  - `.scratch/mobile-retail-ops-mvp/issues/12-subscription-plan-surface-and-upgrade-handoff.md`
- Per-business subscription packaging already exists as an in-progress tenant-level billing direction. Relevant docs:
  - `.brain/plans/2026-07-06-feature-saas-subscription-packaging.md`
  - `.brain/features/retail-ops-subscription-packaging.md`
  - `.brain/database/schema.md`
  - `.brain/api/endpoints.md`
  - `.brain/api/contracts.md`
  - `.brain/api/permissions.md`
- Current billing foundations already model subscription plans, tenant subscriptions, checkout sessions, invoices, and provider events. Existing open work is provider selection, payable checkout, app-store purchase validation, and live validation.
- Stock intake and unit conversion are already implemented as first-phase Retail Ops operations. Relevant docs:
  - `.brain/plans/2026-07-06-feature-stock-intake-and-unit-conversion-ledger.md`
  - `.brain/modules/merchant-system.md`
  - `.brain/database/schema.md`
  - `.brain/api/contracts.md`
- Current stock ledger foundations already include `StockDelivery`, `StockDeliveryLine`, and `InventoryMovement`, plus `retailOps.recordStockIntake`, `retailOps.recordStockAdjustment`, and `retailOps.recordUnitConversion`.

## New or unresolved feature area

The requested inbound management system is not a duplicate of current stock intake. Current stock intake records one balance increase for an existing product unit. The new feature needs a richer costing workspace before stock is posted.

New scope to define:

- A multi-line inbound record for supplier purchases, such as bags and shoes ordered from China or another supplier.
- Additional costs at header or line level, such as shipping, waybill, clearing, transport, packaging, and other landed-cost charges.
- Landed unit cost calculation after allocating extra costs across received products.
- Optional markup or profit percentage to suggest or set selling prices from landed costs.
- A production or batch-costing mode, such as rabbit feed production, where the user starts with expected output quantity and enters raw material, transport, manufacturing, labor, and other production costs below.
- Unit cost calculation for produced output where there is no per-item supplier price yet.
- Posting final received or produced quantities into the existing stock ledger only when the inbound is received/approved.

## Important non-duplicate distinction

- Existing `recordStockIntake` is a stock mutation.
- The new inbound workspace is a planning, costing, approval, and stock-posting workflow.
- Existing price history stores sell prices.
- The new feature likely needs cost history or landed-cost snapshots, and should not silently rewrite historical sale margins.
- Existing subscription is already tenant/business scoped, and the user's latest direction confirms that each business should be billed separately. Future cross-business discounts are deliberately deferred.

## Scratch guidance

Use `.scratch/wayfinder-retail-ops-inbound-costing/` for this effort. Do not use any draft folder for this planning work.
