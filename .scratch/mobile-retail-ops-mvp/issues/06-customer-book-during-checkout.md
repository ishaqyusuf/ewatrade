# 06 — Customer Book During Checkout

**What to build:** checkout can capture a new customer or select an existing one from the customer book, and customer identity is preserved across local/offline and production flows. New customers should become searchable for future sales without slowing the transaction.

**Blocked by:** 05 — Create Sale With Product Variants And Quantity Stepper.

**Status:** implementation-complete

- [x] Checkout supports entering a customer name while completing a sale.
- [x] Checkout supports searching and selecting an existing customer from the business customer book.
- [x] New customer names are saved locally immediately and sent to production when possible.
- [x] Offline customer upserts reconcile returned production customer ids into local records after sync.
- [x] Customer book reads durable production customers online and local/order-derived fallback customers offline.
- [x] Customer capture remains keyboard-safe and does not hide submit actions behind the keyboard.

## Implementation Notes

- `apps/mobile/src/components/mobile/create-sale-sheet.tsx` now searches `retailOps.customerBook` from checkout while online and merges those production customers with local saved customers.
- The customer field remains a free-entry field for new names, and selecting a saved customer stores the selected row so production email/phone identity stays stable through query refreshes.
- Production sale submission now sends selected customer `email` and `phone` when available, along with the selected or typed customer name.
- Local sale creation already saves new customer names immediately and queues `customer_upsert` events when needed.
- Existing sync reconciliation maps applied `customer_upsert` results back to local customer `remoteId` values after production replay.
- The full customer book sheet already reads production customers online and falls back to local customers while offline or when production reads fail.
- The checkout remains inside the bottom-sheet virtualized flow with the customer field and submit action in the list footer, preserving keyboard-aware bottom-sheet behavior.
- Added focused DB query coverage for customer book/upsert behavior. `packages/db/src/queries/retail-ops-customers.test.ts` proves customer book reads merge durable customer rows with order-derived fallback customers while respecting actor scope, checkout customer upserts normalize identity data from a synced sale source, create durable customer/identity/event rows, link the source order back to the customer, and shared-link checkout customer capture records platform account identity plus `ORDER_REQUESTED` audit context for future cross-business customer reuse.
- Added API schema coverage for customer contact email normalization. Customer upsert and sale checkout payloads now trim and lowercase optional customer emails before validation while still rejecting invalid email formats.
- Added API schema coverage for optional customer phone normalization. Customer upsert and sale checkout payloads now trim phone input, treat blank phone values as absent, and reject oversized phone values.
- Scoped static checks passed. Live production customer search, live sale submission, sync replay, and hands-on mobile keyboard QA were not run in this slice.
