# Retail Ops Scan Price Resolution

## Problem Statement

Customers and cashiers can be blocked during in-store shopping when a product is scanned but the product price is missing, the barcode is unknown, or the product record is incomplete. Today, that kind of exception would force a cashier or attendant to leave the sales flow, contact an admin manually, or tell the customer to wait without a clear state.

This is painful for busy stores because the customer may still be shopping, the cashier queue may keep moving, and the admin may not immediately know which product needs attention. It also creates a lost-sales risk: if the admin cannot confirm the price quickly, the customer needs a clear answer that the product cannot be ordered yet instead of an indefinite loading state.

## Solution

Add a Retail Ops scan price-resolution workflow for self-service checkout, POS cashier scanning, and admin resolution.

When a scanned product is known but has no active price, the customer or POS line enters a price-loading state. The customer sees that the price will be updated shortly and can keep shopping. The cashier sees that the item is pending admin resolution and can continue scanning other items without walking to the admin office.

When the product is unknown or has incomplete catalog data, the system prompts the scanner to capture a product photo and optional note. That evidence is sent to an admin resolution queue with the barcode, store, scan source, session or cart context, and any matched product data. The admin can set the price, create or link the product, add missing catalog fields, or mark the item unavailable.

If the admin still does not have the correct price, the item moves to `UNAVAILABLE_FOR_ORDER`. The customer-facing message is: "Sorry, this product cannot be ordered yet because the price is not resolved." The cashier-facing message is: "Price not resolved. Remove this item or ask the customer to choose another item." The item remains auditable in scan history but cannot be included in checkout.

## User Stories

1. As a customer, I want a scanned product with no price to show that its price is loading, so that I know the app has not failed.
2. As a customer, I want to keep shopping while a missing price is being resolved, so that one product does not block my whole shopping trip.
3. As a customer, I want the cart to update automatically when the price is resolved, so that I do not need to rescan the product.
4. As a customer, I want a clear message when a product cannot be ordered because the price is unresolved, so that I can decide whether to remove it or choose another item.
5. As a customer, I want checkout to block only unresolved items, so that I can still buy the products that are ready.
6. As a customer, I want to remove an unresolved item from my cart, so that I can continue checkout without waiting.
7. As a customer, I want to be prompted for a product photo only when the product is unknown or incomplete, so that I am not asked for unnecessary work.
8. As a customer, I want captured product photos to help the store resolve products faster, so that I may still be able to buy the item during the same trip.
9. As a customer, I want unavailable products to stay visibly unavailable, so that I do not accidentally expect them to be part of my order.
10. As a customer, I want the unresolved-price message to be polite and plain, so that I understand the store is still working on the product.
11. As a cashier, I want a scan with a missing price to create an admin request automatically, so that I do not need to leave the checkout counter.
12. As a cashier, I want the POS line to show `PRICE_PENDING`, so that I know the item is waiting for admin pricing.
13. As a cashier, I want to keep scanning other items after a missing-price scan, so that the customer queue keeps moving.
14. As a cashier, I want an unknown barcode to prompt product photo capture, so that admin receives enough information to identify the item.
15. As a cashier, I want to add an optional note to a scan-resolution request, so that admin can understand packaging size, shelf label, or customer context.
16. As a cashier, I want the item to update when admin resolves the price, so that I can finish the transaction without re-entering the product.
17. As a cashier, I want the POS to block checkout for unresolved items, so that we do not sell products at an unknown price.
18. As a cashier, I want the POS to tell me when admin marks the item unavailable, so that I can ask the customer to remove or replace it.
19. As a cashier, I want duplicate scans of the same unresolved barcode to reuse the open request, so that admin is not flooded with duplicate tickets.
20. As a cashier, I want scan-resolution state to be tied to my cashier session, so that the store can audit what happened during checkout.
21. As an attendant, I want mobile scan exceptions to follow the same states as POS scan exceptions, so that the store team has one shared language.
22. As an attendant, I want offline scan requests to queue locally when needed, so that scan evidence is not lost when the network is poor.
23. As an owner, I want missing-price scans to notify admin users automatically, so that price issues are handled before customers finish shopping when possible.
24. As an owner, I want a dashboard queue of unresolved scan requests, so that I can quickly see which products need pricing or catalog work.
25. As an owner, I want the queue grouped by store, source, status, and age, so that urgent in-store requests rise to the top.
26. As an owner, I want to see the barcode and product photo on a request, so that I can identify the item without asking the cashier to bring it to me.
27. As an owner, I want to see whether the request came from customer self-checkout or POS, so that I understand the customer impact.
28. As an owner, I want to see scan count and latest scan time, so that I can tell whether many customers are hitting the same issue.
29. As an owner, I want to set a missing price from the resolution queue, so that the product becomes sellable immediately.
30. As an owner, I want to create a product from an unknown barcode request, so that future scans recognize the product.
31. As an owner, I want to link an unknown barcode request to an existing product, so that duplicate catalog records are avoided.
32. As an owner, I want to add missing product name, image, unit, and price from the same request, so that the item becomes complete enough to sell.
33. As an owner, I want price updates from scan resolution to write price history, so that historical sales remain explainable.
34. As an owner, I want resolved cart or POS lines to snapshot the resolved price, so that the sale record is stable.
35. As an owner, I want to mark a product unavailable when I still do not have the price, so that customers stop waiting indefinitely.
36. As an owner, I want to record why a product was marked unavailable, so that staff can review unresolved catalog issues later.
37. As an owner, I want unavailable scan decisions to be auditable, so that I know who made the decision and when.
38. As an admin, I want automatic notifications for missing-price requests, so that I can react quickly without monitoring the queue constantly.
39. As an admin, I want notification attempts to be tracked, so that failures do not silently hide urgent pricing requests.
40. As an admin, I want duplicate open requests to be merged or reused, so that I handle one actionable request per barcode/session context.
41. As an admin, I want to cancel duplicate or invalid requests, so that the queue stays clean.
42. As a manager, I want permission to resolve store-level scan requests, so that day-to-day store operations do not depend only on the owner.
43. As a manager, I want all scan requests scoped to my tenant and store access, so that store data does not leak across businesses.
44. As a developer, I want raw barcode scans separated from scan-resolution workflow records, so that immutable scan history and mutable resolution state do not get mixed.
45. As a developer, I want scan-resolution APIs to reuse Retail Ops tenant, store, role, session, and product-unit concepts, so that the feature fits the existing architecture.
46. As a developer, I want scan-resolution states to be explicit, so that mobile, POS, dashboard, and API behavior stay consistent.
47. As a developer, I want scan-resolution requests to be idempotent for repeated scans, so that retries and duplicate scans do not create noisy data.
48. As a developer, I want product photo access scoped to authorized store users, so that customer-captured evidence is not publicly exposed.
49. As a developer, I want unresolved scan items excluded from checkout totals, so that the system never charges an unknown price.
50. As a developer, I want analytics for unresolved scans and unavailable products, so that the business can identify catalog quality problems later.

## Implementation Decisions

- Build this as a separate Retail Ops scan price-resolution feature rather than merging it into product price history. The workflow touches customer self-checkout, POS cashier, admin dashboard, notifications, barcode scan logging, catalog completion, and price setting.
- Keep `BarcodeEvent` as the immutable raw scan log. Add a separate durable scan-resolution workflow entity for missing price, unknown product, incomplete catalog, resolved price, unavailable, cancelled, and expired states.
- Use explicit statuses: `PRICE_PENDING`, `CATALOG_PENDING`, `PRICE_RESOLVED`, `UNAVAILABLE_FOR_ORDER`, `CANCELLED`, and `EXPIRED`.
- Treat a known product with no active price as `PRICE_PENDING`. The customer-safe message is: "Price loading. We will update this shortly. You can keep shopping."
- Treat an unknown barcode or product missing required catalog data as `CATALOG_PENDING`. The scanner may be asked to capture a product photo and optional note.
- Treat admin inability to confirm a price as `UNAVAILABLE_FOR_ORDER`. The customer-safe message is: "Sorry, this product cannot be ordered yet because the price is not resolved."
- Do not let `UNAVAILABLE_FOR_ORDER` items participate in checkout. The item may remain visible in cart, POS, or scan history for audit and removal.
- Add a scan-resolution request model that stores tenant, store, source surface, actor, cart or session reference, barcode, raw payload, optional matched product, optional matched product unit, status, messages, captured image references, resolver, resolved price, unavailable reason, and timestamps.
- Add scan-resolution attachment support for product photos and supporting evidence. Attachment access must remain tenant/store scoped.
- Add scan-resolution notification audit records or reuse the notification package in a way that preserves delivery attempts, target users, status, timestamps, and failure reason.
- Add APIs to record scans, create or reuse an open resolution request, attach evidence, list pending requests, resolve by setting price/product data, mark unavailable, cancel duplicate requests, and refresh affected cart/POS lines.
- Reuse existing Retail Ops product and product-unit price history behavior when admin sets a price during resolution.
- Reuse existing tenant, store, membership, and POS-capable role checks. Customers can only create requests for their active in-store shopping session. Cashiers/operators can create and attach evidence for their current store/session. Owner/admin/manager users can resolve, price, link, create, mark unavailable, cancel, and review requests.
- Customer self-service should show pending price lines inline, allow continued scanning, block checkout while unresolved items remain, and allow unresolved items to be removed.
- POS cashier should show pending and unavailable lines inline in the scan list, allow continued scanning, support photo capture where hardware allows, and block unresolved items from checkout until resolved or removed.
- Admin dashboard should provide a resolution queue with filters for status, store, source, age, and barcode search. Each request should show photo evidence, barcode, scan count, customer/cashier context, matched product if any, and resolution actions.
- Duplicate scans of the same barcode in the same active store/session/cart context should reuse an open request and update scan count/latest scan metadata instead of creating noisy duplicate requests.
- If a price is resolved after a customer removed the item, keep the resolution for future scans but do not automatically re-add it to the cart.
- If a device is offline, queue the scan request and evidence locally with idempotency metadata and sync when the connection returns.
- Keep realtime updates as an implementation option. The first implementation can use polling or focused refetch of affected cart/POS lines; realtime push can come later.

## Testing Decisions

- The preferred testing seam is one high-level Retail Ops scan-resolution workflow seam that exercises the API/service contract from scan input through request creation, admin resolution or unavailable decision, and returned cart/POS line state. This should avoid over-testing internal repository details.
- Tests should verify external behavior and domain outcomes: a known product with no price becomes `PRICE_PENDING`, an unknown barcode becomes `CATALOG_PENDING`, admin resolution makes the item sellable with a price snapshot, admin unavailable blocks checkout, and duplicate scans reuse the open request.
- API/caller-level tests should cover tenant/store scoping, role permissions, idempotent request creation, attachment authorization, resolve actions, unavailable actions, and cart/POS line refresh behavior.
- Domain tests should cover the state machine, especially invalid transitions such as resolving a cancelled request, selling an unavailable item, or making an old pending cart line orderable after an unavailable decision.
- Integration tests should cover price-history interaction when a price is set from the resolution queue.
- Notification tests should verify that admin notification is attempted for pending requests and that notification failures do not make scan request creation fail for the customer or cashier.
- Offline sync tests should cover queued scan requests, repeated replay, evidence attachment replay, and dependency ordering when product creation or price resolution happens later.
- UI tests or manual QA should cover customer self-checkout pending/unavailable messages, POS cashier pending/unavailable rows, photo capture entry point, admin queue filtering, and resolving a request from the dashboard.
- Prior art should come from existing Retail Ops tRPC workflow tests and sync/idempotency patterns used for product setup, sales creation, shared-link order requests, and offline replay.
- Tests should avoid asserting implementation details such as database delegate names, internal helper calls, or exact component tree structure.

## Out of Scope

- Full native customer browsing and checkout beyond the in-store self-service scan flow.
- Online payment collection for customer self-checkout.
- Computer-vision product recognition from captured photos.
- Automatic price suggestion from supplier invoices, stock intake, or historical prices.
- SLA escalation, advanced queue routing, or manager assignment rules beyond basic admin notification and queue visibility.
- Receipt printing behavior beyond blocking unresolved items from checkout.
- Multi-store barcode deduplication beyond tenant/store-scoped request handling.
- Public exposure of captured product photos.
- Fully realtime push updates if polling or refetch can support the first implementation.

## Further Notes

- This spec intentionally links to, but remains separate from, flexible product units and price history. Price history owns durable price changes; scan price resolution owns the operational exception workflow that discovers a missing price during shopping or checkout.
- The current schema already has `BarcodeEvent`, but that model is only a scan log. A durable resolution request is still needed to track status, evidence, notifications, and admin decisions.
- The customer copy should stay short and calm. The unresolved-price loading state should not imply the item is guaranteed to become available, and the unavailable state should not leave the customer waiting.
- The workflow should be available to both customer self-service checkout and POS cashier scanning, using the same core state language so store teams do not learn two exception systems.
