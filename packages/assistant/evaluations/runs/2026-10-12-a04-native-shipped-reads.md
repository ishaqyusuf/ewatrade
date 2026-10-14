# A04 native shipped reads — source packet 3 handoff

12 October 2026. Implementation-agent packet, **ready for coordinator review**.
Not native acceptance. Overall 13/45 unchanged.

## Before / after

Before: 28 shipped (`source`/`enabled`) read capabilities were dashboard-only, so
a mobile user asking "how much rice is left", "who owes us", "show today's stock
operations" or "what do we owe this supplier" got no tool and a refusal.

After: all 28 declare `dashboard, mobile`. Native coverage: **38/73 reads,
12/65 writes**. The only reads still dashboard-only are `planned` ones (quotes,
bookings, service work, business reports, cash counts, staff), whose answers carry
dashboard-only Open targets.

Why safe: these tools answer with plain cards (`title/value/scope/asOf/detail`)
and no `target`; the native thread already renders them, and none of their
descriptions refers to dashboard sheets. Client declaration is compatibility
only — server role ceilings, canonical domain checks, scoped Store grants and
finance entitlement (`assertFinanceAccess`) are unchanged.

Capabilities: catalog.history.read, catalog.count, catalog.page, stores.count,
customers.receivables.read, customers.count, customers.page, sales.orders.summary,
sales.order_contacts.count, sales.orders.lookup, inventory.totals.read,
inventory.balances.read, inventory.low_stock.read, inventory.count.read,
inventory.operations.history, inventory.operations.read, inventory.closeout.list,
inventory.closeout.read, inventory.transfer.list, inventory.transfer.read,
finance.purchase_registrations.read, finance.purchase_recognition.read,
finance.purchases.read, finance.purchase.read, finance.suppliers.read,
finance.supplier_statement.read, finance.expense_categories.read,
finance.money_accounts.read.

Guard: `native-parity.test.ts` now fails if any shipped read is not declared for
mobile.

Fix included: `packages/assistant/src/general/order-amendment.test.ts` still
expected order cancel/details to be dashboard-only after packet 2 (committed in
`677293e1`); it now expects `dashboard, mobile` for those two and `dashboard` for
replacement.

## Owned paths

- `packages/assistant/src/capabilities/manifest.ts` (28 `clients` values)
- `packages/assistant/src/capabilities/COVERAGE.md` (regenerated)
- `apps/mobile/src/components/mobile/assistant/native-parity.test.ts` (guard)
- `packages/assistant/src/general/order-amendment.test.ts` (expectation)
- `packages/assistant/impact/2026-10-12-a04-native-shipped-reads.json`

## Checks run

`bun test apps/mobile/src/components/mobile/assistant packages/assistant/src/general/order-amendment.test.ts`
17 pass; `bun test packages/assistant/src/capabilities` passes; coverage
regenerated; impact gate passes. `bun test packages/assistant/src` shows 6
pre-existing failures in unmodified `setup/` tests (copy changed on main; not this
packet).

## Native acceptance steps

Owner, then Manager, then Cashier on a device build:
1. "How many products do we have?" / "Show low stock" / "How much Rice 50kg is in
   stock?" → plain cards with scope and as-of time.
2. "Who owes us money?" → receivables card; Cashier refused per existing policy.
3. "Show stock operations today" → list card; ask to continue → next page.
4. Owner: "What do we owe Musa Supplies?" → supplier statement card; Manager
   refused by finance entitlement.
5. Offline: saved cards render; asking is disabled.
