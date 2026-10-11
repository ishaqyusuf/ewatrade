# Purchase read tools — 11 October 2026

Evidence: deterministic schema/projection tests and scoped compilation. No model run.

Planned dashboard Owner/Admin finance.purchases.read/readPurchaseBills and
finance.purchase.read/readPurchaseBill delegate through financeRouter to canonical
purchases/purchase. Book scope and authority remain canonical; list is all Stores,
fixed10 rows, optional supplier/status and opaque cursor. No model-supplied actor,
tenant, Store or page-size override.

List answer separates matching count/totals from current page, labels settlement
(including advances) rather than new cash, and excludes unrecognized registrations.
Detail preserves authoritative exact cash/allocated/released/outstanding totals,
recognitionId, receipt/valuation coverage and reversal metadata. Payment, supplier
entry, allocation and per-allocation release histories are limited to10 with flags
combining canonical truncation and assistant truncation. Never infer physical
receipt from a separate recognition source or invent an omitted mutation target.

3 focused tests/19 assertions pass. Scoped API TypeScript exits0. Current coverage
catalog regenerates successfully. Fixture PR01–07 retained.

Actual-tool database, full web and live-model acceptance remain pending. No UI,
mobile, database/schema write, rollout activation or deployment. E05 incomplete.
