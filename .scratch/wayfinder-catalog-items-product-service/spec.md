# Spec: Product And Service Catalog Items

Status: implemented
Implemented: 2026-07-18
Source map: [Wayfinder: Product And Service Catalog Items](map.md)

## Problem Statement

EwaTrade currently models product sales and dry-cleaning services as separate store-level operating modes. Product sales use relational products, variants, inventory, stock movements, orders, share links, cashier sessions, closeout, reports, and offline sync. Dry-cleaning services use a separate metadata-backed catalog and service-order workflow whose types, API procedures, UI text, navigation, public links, reports, and authorization checks are named specifically for dry cleaning.

This separation does not match how merchants operate. A dry cleaner creates priced service items such as Shirt Cleaning for NGN 500, Trouser Cleaning for NGN 500, or Jalabia Cleaning for NGN 400. Those items have prices and quantities on a customer order, but they do not have stock balances. Another merchant may sell physical products and provide services from the same store. Classifying the whole business as Product or Service forces an unnecessary choice and makes mixed businesses difficult.

The current mobile experience exposes the mismatch. The existing Set up Item flow is product-oriented and requires units and opening stock. The sale picker assumes every sellable item has an available stock balance. Service-item creation is embedded inside a separate dry-cleaning order screen. Dashboard actions expose both stock and dry-cleaning operations without one coherent catalog model.

EwaTrade needs one neutral catalog. Every sellable item must be classified when it is created as either a Product or a Service. Both kinds have prices. Products participate in inventory; services never participate in inventory. Industry examples such as dry cleaning may inform sample data and onboarding copy, but must not become runtime business types, schema names, API namespaces, authorization gates, or navigation branches.

## Solution

Replace store-level business-template behavior with an item-level catalog model.

Every store remains neutral and can contain product items, service items, or both. A shared Catalog Item owns common sellable information such as name, description, category, currency, base price, status, images, and variants. Each Catalog Item has an immutable kind:

- Product: a physical, stock-managed item. Product variants can have SKUs, units, opening stock, inventory balances, reservations, stock movements, stock-wallet balances, reorder settings, and unit conversions.
- Service: a priced activity or work item. Service variants can have independent prices and optional turnaround information, but never have inventory balances or stock movements.

The existing commercial Order becomes capable of containing product lines, service lines, or both. Each line snapshots its item kind, name, variant, quantity, unit price, and total. Finalizing an order deducts or reserves stock for product lines and creates generic service work for service lines. Payment belongs to the commercial order; work progress belongs to a Service Job.

Generic Service Jobs replace dry-cleaning-specific service orders. A Service Job groups the service lines from an order and tracks customer, due date, status, notes, evidence, assignments, delay events, and history. The minimum tracked lifecycle is Received, In Progress, Ready, Completed, or Cancelled. Immediate services may be completed immediately. Delay is an auditable event with an optional revised due date, not a permanent primary status.

Mobile and dashboard use one Add Item flow. The first choice is Product or Service. Shared fields remain the same; product selection reveals stock fields, while service selection reveals optional turnaround and service instructions. Existing product records migrate automatically as Product. Existing dry-cleaning service items migrate automatically as Service. Inventory surfaces contain only products. Service Jobs contains only service work. The sale flow can select both kinds without requiring separate checkout.

Existing public service requests, opaque tracking, evidence, notification intents, and reports are retained under generic service terminology. Product offline behavior remains unchanged during the first migration release; generic service operations remain online-only until a separate offline service event model is approved.

## User Stories

1. As a merchant, I want my store to remain neutral, so that the platform does not force my whole business into a Product or Service category.
2. As a merchant, I want to create both products and services in one store, so that mixed businesses do not need separate accounts or workspaces.
3. As a merchant, I want to choose Product or Service when creating an item, so that the item receives the correct operational behavior.
4. As a merchant, I want every product and service to have a selling price, so that both can be added to customer orders.
5. As a merchant, I want item prices stored in my store currency, so that products and services use the same money rules.
6. As a merchant, I want to organize both kinds with names, descriptions, categories, images, and statuses, so that I can maintain one coherent catalog.
7. As a merchant, I want item variants to inherit the parent item kind, so that a service variant cannot accidentally become stock-managed.
8. As a merchant, I want variants to have their own prices, so that sizes, packages, service levels, or turnaround options can cost different amounts.
9. As a merchant, I want archived items to remain visible in historical orders, so that catalog cleanup does not rewrite history.
10. As a merchant, I want an item kind to be protected after operational use, so that existing stock and work records cannot be reinterpreted accidentally.
11. As a merchant who selected the wrong kind for a used item, I want to archive and recreate it safely, so that historical records remain correct.
12. As a merchant, I want existing products migrated automatically, so that I do not have to classify or re-enter them.
13. As a service merchant, I want existing service items migrated automatically, so that I do not lose prices or order history.
14. As a merchant with both existing products and service records, I want both preserved, so that migration does not disable part of my business.
15. As a support user, I want to see an item's explicit kind, so that I can understand its behavior without inferring from the merchant's industry.
16. As a product seller, I want Product creation to keep the existing unit and variant behavior, so that current inventory workflows remain familiar.
17. As a product seller, I want to enter opening stock while creating a product, so that it becomes immediately sellable.
18. As a product seller, I want product variants to have SKUs and stock balances, so that I can manage distinct sellable units.
19. As a product seller, I want product variants to support unit conversion, so that bag, half-bag, piece, carton, and similar workflows continue to work.
20. As a product seller, I want stock intake to accept Product items only, so that inventory cannot be created for services.
21. As a product seller, I want stock adjustments to accept Product items only, so that corrections remain meaningful.
22. As a product seller, I want stock reservations to accept Product items only, so that pending sales cannot reserve a service.
23. As a product seller, I want product sales to deduct the selected product variant's stock, so that inventory stays accurate.
24. As a manager, I want staff stock wallets to contain Product items only, so that staff are never assigned nonexistent service stock.
25. As a cashier, I want opening-inventory confirmation to list Product items only, so that service prices are not mistaken for stock counts.
26. As a manager, I want closeout inventory reconciliation to list Product items only, so that service work does not create false variances.
27. As a merchant, I want low-stock alerts calculated from Product items only, so that services never appear as out of stock.
28. As a merchant, I want direct or replayed stock requests for Service items rejected, so that a hidden UI path cannot corrupt inventory.
29. As a service merchant, I want to create a Service item with a name and price, so that I can sell work such as Shirt Cleaning for NGN 500.
30. As a service merchant, I want to create separate Service items such as Shirt Cleaning, Trouser Cleaning, and Jalabia Cleaning, so that quantities and reports remain accurate.
31. As a service merchant, I want to create a combined package as one Service item when appropriate, so that bundled services can have one price.
32. As a service merchant, I want Service items to support priced variants, so that Standard, Express, Small, Large, Child, Adult, or other safe options can cost differently.
33. As a service merchant, I want to set an optional estimated turnaround, so that staff and customers can understand the expected work time.
34. As a service merchant, I want to add optional service instructions, so that staff know how the work should be performed.
35. As a service merchant, I want Service creation to hide SKU and stock fields, so that the form does not imply inventory exists.
36. As a service merchant, I want Service items to remain sellable without an available-stock balance, so that service sales are never blocked by zero stock.
37. As service staff, I want selling a tracked service to create a Service Job, so that work can be managed after payment or intake.
38. As service staff, I want immediate services to be completed immediately when appropriate, so that simple work does not create unnecessary follow-up.
39. As service staff, I want a Service Job to contain all service lines from the same order, so that one customer visit is managed coherently.
40. As service staff, I want a Service Job to show the customer and due date, so that I know who the work belongs to and when it is expected.
41. As service staff, I want to move work from Received to In Progress to Ready to Completed, so that progress is visible.
42. As service staff, I want to cancel unfinished work with an audit event, so that cancellation remains explainable.
43. As service staff, I want to record a delay and revised due date, so that the job remains in the correct work state while the delay is visible.
44. As service staff, I want to attach notes and private evidence, so that item condition and special instructions are available internally.
45. As a customer, I want my private evidence and internal notes hidden from public tracking, so that sensitive information is protected.
46. As a cashier, I want one sale flow for products and services, so that I do not need separate checkouts.
47. As a cashier, I want to add a Product line and a Service line to one order, so that a mixed purchase produces one total.
48. As a cashier, I want each line to show its current price, so that the customer can review the charge.
49. As a cashier, I want quantity controls for both kinds, so that I can record two shirts for cleaning or three physical items.
50. As a cashier, I want product rows to show available stock, so that I know whether the requested quantity can be sold.
51. As a cashier, I want service rows not to show stock availability, so that customers are not told a service is “out of stock.”
52. As a cashier, I want out-of-stock Product variants disabled, so that I cannot oversell without an approved override.
53. As a cashier, I want Service variants selectable without stock checks, so that non-stock work remains available.
54. As a merchant, I want order lines to snapshot kind, name, variant, quantity, and price, so that later catalog edits do not rewrite old orders.
55. As a merchant, I want one payment state for the commercial order, so that payment is not fragmented between product and service subsystems.
56. As service staff, I want Service Job progress independent from payment state, so that paid work can still be in progress and completed work can still have an amount due.
57. As a merchant, I want product stock mutation and service-job creation committed atomically, so that a mixed sale cannot be half-recorded.
58. As a merchant, I want sale retries to be idempotent, so that a poor connection does not deduct stock twice or create duplicate Service Jobs.
59. As a merchant, I want cancelling a product line to reverse eligible stock effects, so that returned stock is auditable.
60. As a merchant, I want cancelling a service line to cancel unfinished service work, so that job queues remain accurate.
61. As a merchant, I want refunds recorded as payment events, so that financial history is not hidden inside work-status changes.
62. As a mobile merchant, I want Add Item to ask Product or Service first, so that the form displays only relevant fields.
63. As a mobile product seller, I want the current product setup controls preserved under Product, so that the migration does not make product creation harder.
64. As a mobile service seller, I want a short Service form with name, price, variants, optional turnaround, and instructions, so that setup is fast.
65. As a mobile merchant, I want one Items list with Product and Service badges, so that I can manage my full catalog together.
66. As a mobile merchant, I want existing products labeled Product automatically, so that migration requires no manual cleanup.
67. As a mobile service merchant, I want existing dry-cleaning items labeled Service automatically, so that they appear in the shared catalog.
68. As a mobile cashier, I want the sale picker to show both kinds, so that mixed sales work from the current checkout surface.
69. As a mobile cashier, I want Product rows to show available quantities, so that existing stock awareness is preserved.
70. As a mobile cashier, I want Service rows to show price and optional turnaround, so that irrelevant availability text disappears.
71. As mobile service staff, I want Service Jobs to focus on customer work, due dates, evidence, notes, and status, so that catalog setup is not mixed into daily processing.
72. As a mobile merchant, I want Inventory to contain Product items only, so that stock operations remain understandable.
73. As a mobile merchant, I want Service Jobs available when Service items exist, so that service operations are discoverable without a business-type gate.
74. As a mixed mobile merchant, I want both Inventory and Service Jobs available, so that one store can operate both sides.
75. As a mobile merchant with no items, I want onboarding to ask what I would like to add first, so that I reach the correct form without classifying my whole business.
76. As a mobile merchant, I want to add the other kind later from Catalog, so that my first-item choice never limits the store.
77. As a mobile attendant, I want opening inventory and closeout to ignore services, so that service items do not block clock-in or reconciliation.
78. As a merchant, I want dashboard product counts and low-stock metrics calculated from Product items, so that retail metrics remain correct.
79. As a merchant, I want service due-work and completion metrics calculated from Service Jobs, so that operational work is visible.
80. As a merchant, I want shared revenue totals to include both item kinds, so that sales reporting reflects the whole store.
81. As a service merchant, I want to create an opaque public service-request link, so that customers can request work without receiving internal identifiers.
82. As a customer, I want to select priced services and quantities from a public request page, so that I understand the estimated total.
83. As service staff, I want to review a public request before conversion, so that customer input does not silently become accepted work.
84. As service staff, I want request conversion to create or link the commercial order and Service Job idempotently, so that the request enters the normal operating flow.
85. As a customer, I want an opaque tracking link, so that I can view safe work status without signing in.
86. As a customer, I want tracking to show business name, reference, status, due expectation, and safe payment summary, so that I know what is happening.
87. As a customer, I want tracking to exclude evidence, internal notes, staff-only events, and raw database identifiers, so that private data remains private.
88. As service staff, I want Ready and Delay events to create notification intents, so that customer communication can be prepared consistently.
89. As service staff, I want manual copy/share notification text, so that the workflow works without a live SMS or WhatsApp provider.
90. As a service owner, I want reports for received, in-progress, ready, completed, cancelled, delayed, overdue, and popular services, so that I can manage work.
91. As a service owner, I want revenue and payment reporting derived from commercial orders, so that Service Job status does not become an accounting system.
92. As a tenant owner, I want item and service operations scoped to my tenant and store, so that another business cannot read or mutate my catalog.
93. As a tenant owner, I want membership roles to control catalog, stock, sales, and service-work actions, so that item kind does not replace authorization.
94. As a tenant owner, I want both product and service items to count toward the business's catalog-item entitlement, so that plan limits cannot be bypassed by choosing Service.
95. As a developer, I want item-kind checks inside service and repository transactions, so that every API and client receives the same invariant.
96. As a developer, I want stable kind-mismatch errors, so that clients can display clear messages without parsing text.
97. As a developer, I want compatibility resolution for active legacy public links, so that customer URLs do not break during migration.
98. As a developer, I want migration scripts to be idempotent and resumable, so that rollout can recover safely.
99. As a developer, I want privacy-safe migration reports, so that parity can be reviewed without logging customer contacts, tokens, evidence, or notes.
100. As a QA reviewer, I want API-level Product, Service, and mixed-sale tests, so that the core behavior is proven through externally observable outcomes.
101. As a QA reviewer, I want direct stock attempts against Service items tested, so that UI hiding is not mistaken for enforcement.
102. As a QA reviewer, I want migration parity tests for items, prices, totals, statuses, tokens, and history, so that existing service operations survive cutover.
103. As a QA reviewer, I want mobile Add Item and sale-flow coverage, so that conditional fields and stock behavior are visible to users.
104. As a QA reviewer, I want public request and tracking privacy coverage, so that customer-facing endpoints expose only approved data.
105. As a product owner, I want dry cleaning treated only as a sample service category, so that the platform can support other service businesses without new hard-coded templates.

## Implementation Decisions

### Domain model

- The store is a neutral operating workspace and is not assigned a Product, Service, Dry Cleaning, or hybrid business type.
- A store may contain Product items, Service items, or both without changing store configuration.
- `CatalogItem` is the canonical domain term for a sellable catalog record.
- `CatalogItemKind` has exactly two initial values: Product and Service.
- Both kinds share name, description, category, currency, base price, active/archive status, images, and audit timestamps.
- Both kinds may have variants with independent names and prices.
- A variant always inherits its parent item's kind; variants cannot override kind.
- Item kind is editable only while the item is an unused draft with no operational references. After inventory, order, request, link, or service-job use, the item must be archived and recreated to correct its kind.
- Dry cleaning, laundry, tailoring, repairs, and similar industries may appear as categories, presets, examples, or sample copy, but never as runtime item kinds or authorization keys.
- The two-kind model deliberately treats Product as stock-managed. A future digital or non-stock goods model requires a separate product decision rather than weakening the Service invariant.

### Durable data model

- The existing Product-centered catalog should evolve into the canonical catalog while preserving existing physical tables through mapping or safe rename operations where practical.
- Existing Product records backfill to Product kind.
- Existing Product Variant records become shared catalog variants and inherit Product kind through the parent.
- A Service item may have a service-specific profile containing optional estimated turnaround and service instructions. Product items cannot have a service profile.
- Inventory Item remains a current-stock record attached only to Product variants.
- Order Item references the canonical catalog item and optional variant, and snapshots item kind, name, SKU where applicable, quantity, unit price, and total.
- Generic relational service records replace bounded arrays in store metadata.
- Service Job stores tenant, store, originating order, customer, status, due date, completion/cancellation timestamps, and audit timestamps.
- Service Job Line references the Service Job and originating service Order Item so commercial and operational histories stay connected.
- Service Job Event stores status transitions, delays, revised due dates, notes, actor, and timestamp.
- Service Job Evidence stores private attachment metadata and actor/timestamp. Public tracking never returns it.
- Service Request Link, Service Request, Service Request Line, and notification-intent records use generic service terminology and opaque public tokens.
- Legacy identifiers or a dedicated migration map are retained until parity verification and rollback windows close.
- Historical price snapshots remain immutable even when a catalog price changes.

### Product inventory invariants

- Inventory operations must resolve the canonical item inside the same transaction and require Product kind before writing.
- Creating a Product item creates or initializes inventory for its sellable variants according to the existing product setup rules.
- Creating a Service item never creates Inventory Item, Inventory Movement, stock reservation, staff wallet, stock declaration, or closeout inventory records.
- Stock intake, adjustment, conversion, assignment, return, reservation, sale deduction, closeout, and offline replay reject Service items with `ITEM_NOT_STOCKABLE`.
- Unit conversion keeps both variants under the same Product item.
- Product stock validation remains tenant- and store-scoped.
- UI filtering is supplementary. Server-side enforcement remains authoritative for direct calls and replayed events.
- Product offline sync behavior and existing event idempotency remain unchanged during the first service migration release.

### Service items and Service Jobs

- Service items always have a base price or at least one active priced variant.
- Optional variants represent legitimate pricing choices such as size, complexity, package, service level, or turnaround.
- Service quantity means the number of service units ordered. It never represents available stock.
- Tracked service lines create one Service Job per finalized commercial order, grouping the order's service lines.
- Immediate services still receive an auditable service-work outcome and may be created directly as completed when the chosen service fulfillment mode permits it.
- The minimum tracked lifecycle is Received, In Progress, Ready, Completed, and Cancelled.
- Completed and Cancelled are terminal states.
- Delay is an event with a reason and optional revised due date. It does not replace the primary work state.
- Due date, customer contact, notes, instructions, evidence, and assignment are optional unless a higher-level workflow requires them.
- The order owns money and payment state. Service Job owns operational progress.
- Service Job transitions validate tenant/store scope, actor permission, current state, and transition legality.
- Evidence remains private by default and must not be placed into public tracking payloads.

### Orders, sales, and payments

- One Order model accepts Product-only, Service-only, and mixed lines.
- One order total, currency, customer, discounts, taxes, receipts, and payment status apply across both kinds.
- Each line snapshots item kind so historical behavior does not depend on the item's current catalog state.
- Finalization validates every line before committing any effects.
- Product effects and Service Job creation occur atomically.
- The existing external/client event identifier remains the idempotency boundary; a retry returns the original Order and Service Job outcome.
- Product cancellation or return creates the appropriate inventory reversal rather than deleting history.
- Service cancellation records an auditable job/line cancellation when work is unfinished.
- Refunds and payment corrections remain explicit payment or receipt events.
- Overall order fulfilment may be derived from its product fulfilment and Service Job states, but must not overwrite payment state.

### API, authorization, and errors

- Generic API families replace business-template and dry-cleaning-specific families: Catalog Items, Catalog Item Variants, Service Jobs, Service Requests, Service Request Links, Service Tracking, and Service Operations Reports.
- Business-template listing, update, mismatch, and capability checks are removed from runtime authorization after migration.
- Authorization continues to require tenant membership, selected store scope, role permission, and relevant subscription entitlement.
- Item kind determines whether an operation is valid; it does not grant a user permission.
- Stable domain errors include item not found, item kind mismatch, item not stockable, service item required, invalid Service Job transition, request link unavailable, Service Job not found, and replay conflict.
- Public endpoints return generic unavailable/not-found responses where distinction could leak another tenant's data.
- Repository-owned dashboard, mobile, storefront, marketing, and API clients migrate together to generic procedures.
- Temporary compatibility reads may resolve active legacy public tokens and deployed client responses during the migration window.
- New code must not add dry-cleaning names to schemas, procedure names, permissions, routes, navigation configuration, or reports.

### Mobile and dashboard experience

- Mandatory business-type selection is removed from store creation.
- First-store onboarding may ask which kind the merchant wants to add first, but the answer only chooses the initial form and is not persisted as store authority.
- The mobile Set up Item experience becomes Add Item.
- Add Item starts with a clear Product/Service selector describing Product as stock-managed and Service as priced work without stock.
- Shared fields are rendered once. Product selection reveals SKU, unit, opening stock, reorder, conversion, and product-image controls. Service selection reveals optional turnaround and service instructions.
- Existing Product form composition, validation, money fields, variants, images, and keyboard-safe behavior are reused for the Product branch.
- Service creation uses the same form patterns and price controls without stock inputs.
- The Items/Catalog list displays both kinds with visible Product or Service badges and kind-aware secondary information.
- The sale picker displays Product stock availability and disables unavailable Product variants.
- The sale picker displays Service price and optional turnaround without availability copy.
- Product and Service lines share the current quantity, customer, payment, and total composition.
- Service-item creation is removed from Service Jobs. Service Jobs focuses on intake, customer, due date, evidence, notes, status, and due-work review.
- Inventory, stock entry, low-stock, opening inventory, stock assignments, and closeout operate on Product items only.
- Service Jobs is available when the store has Service items.
- Mixed stores can access Inventory and Service Jobs simultaneously.
- Shared sales and revenue metrics include both kinds. Stock metrics include Product only. Work-status metrics use Service Jobs only.
- Mobile's local item cache must store the canonical server item kind. Local state cannot infer kind from screen or business labels.
- Service mutations remain online-only in the first release and must show a clear offline-unavailable state.

### Public service flows and reporting

- Existing service-request links remain distinct from product share-link checkout because their customer intent and fields differ.
- Shared infrastructure may be reused for opaque token generation, expiry/disable behavior, tenant lookup, and safe public responses.
- Public service requests snapshot selected service name, variant, quantity, and price estimate.
- Staff confirmation/conversion creates or links the commercial Order and Service Job idempotently.
- Public tracking exposes only business-safe reference, work status, due expectation, safe payment summary, and pickup/delivery guidance.
- Public tracking excludes private evidence, internal notes, actor identifiers, raw database identifiers, and cross-tenant diagnostics.
- Ready and Delay events create generic notification intents with manual copy/share fallback.
- Provider-native SMS and WhatsApp delivery remain behind notification adapters and are not required for the migration.
- Service operational reports cover job counts by state, due and overdue work, delay events, completion time, popular service items, request conversion, and staff activity where permitted.
- Revenue, paid amount, and amount due derive from Orders, receipts, and payment state rather than Service Job state.

### Subscription behavior

- The tenant/business remains the subscription and billing boundary.
- Existing product-count packaging should become a catalog-item count covering Product and Service items so Service cannot bypass plan limits.
- Inventory-only usage remains calculated from Product records.
- Service Jobs, public requests, media, notifications, or history may receive explicit plan limits later; no Product limit is implicitly reused for those operational records.
- Attendants inherit business access but cannot manage billing.

### Migration and rollout

- Record baseline test results and aggregate counts before schema or behavior changes.
- Add the new kind and relational service schema through an expand migration without immediately deleting legacy metadata.
- Backfill existing products to Product kind idempotently.
- Backfill service items, jobs/orders, events, evidence, requests, links, tracking tokens, and notification intents from legacy metadata into generic relational records.
- Preserve legacy IDs through explicit mapping and preserve public tokens exactly where active customer links depend on them.
- Use bounded, resumable, tenant/store-scoped migration batches with dry-run and aggregate-report modes.
- Migration logs must omit or hash customer contacts, public tokens, evidence URLs, private notes, and other sensitive values.
- During transition, generic service reads use durable-first resolution with controlled legacy fallback. Writes either dual-write or use an explicit per-store cutover marker; the implementation plan must choose one consistent strategy.
- Parity checks compare record counts, line counts, prices, totals, statuses, due dates, event counts, request conversions, and token resolvability.
- Product stores must retain unchanged inventory and sale outcomes throughout the migration.
- Mixed-data stores retain both product and service operations and require no owner classification.
- Client cutover occurs before removal of legacy procedure names or metadata fallback.
- Legacy cleanup requires zero unexplained parity differences, completed rollback evidence, and no active repository-owned client usage of legacy contracts.
- After cleanup, item kind becomes required and business-template metadata ceases to be authoritative.

## Testing Decisions

- Tests should assert externally observable behavior and persisted outcomes rather than helper implementation.
- The primary seam is the authenticated API catalog-and-sale flow because it proves item creation, pricing, order finalization, stock mutation, service-work creation, authorization, and idempotency together.
- A Product integration test creates a Product with stock, sells it, and verifies one Order, correct line snapshots, correct receipt/payment state, and one correct inventory deduction.
- A Service integration test creates a priced Service, sells a quantity, and verifies one Order, correct line snapshots, one Service Job, and no inventory, reservation, wallet, or stock movement.
- A mixed-sale integration test sells Product and Service lines together and verifies one total, one payment state, correct Product stock deduction, and one Service Job containing only the service lines.
- Failure tests prove that an invalid service line, insufficient product stock, or invalid variant causes the entire finalization transaction to fail without partial effects.
- Retry tests prove that the same external/client event identifier cannot duplicate an Order, stock deduction, Service Job, request conversion, receipt, or notification intent.
- Direct inventory tests attempt intake, adjustment, conversion, reservation, staff assignment, return, closeout, and offline replay with a Service item and expect `ITEM_NOT_STOCKABLE`.
- Kind immutability tests prove that an unused draft may be corrected while an operationally referenced item cannot change kind.
- Service lifecycle tests cover Received, In Progress, Ready, Completed, Cancelled, delay events, revised due dates, terminal-state rejection, notes, evidence, and actor history.
- Payment-versus-work tests prove that paid work may remain in progress and completed work may retain an amount due.
- Public request tests cover active and disabled links, price snapshots, tenant/store isolation, confirmation/conversion, idempotency, and safe rejection.
- Public tracking tests prove opaque-token resolution and explicitly assert that evidence, internal notes, actor IDs, raw IDs, and private contacts are absent.
- Report tests separate shared revenue from Product stock metrics and Service Job operational metrics.
- Subscription tests prove that Product and Service items both count toward the catalog-item limit.
- Migration tests use representative product-only, service-only, mixed, empty, archived, and malformed legacy stores.
- Migration tests prove idempotent reruns, resumable batches, stable legacy mapping, price/total parity, status/event parity, token preservation, and privacy-safe summaries.
- Product regression coverage must include product setup, unit variants, inventory, stock wallets, cashier sessions, closeout, share links, product public orders, reporting, and offline replay.
- Mobile tests cover the Product/Service selector, conditional fields, required price, hidden service stock fields, kind badges, kind-aware sale rows, mixed cart totals, Product-only inventory, and Service Jobs navigation.
- Mobile offline tests prove Product behavior remains available and Service mutations display a deterministic online-required state.
- Dashboard tests cover shared Catalog, Product-only inventory, Service Jobs, mixed navigation, and kind-aware metrics.
- Authorization tests cover owner/admin/manager catalog operations, attendant sale/work permissions, forbidden catalog/stock management, and cross-tenant isolation.
- Tests must mock media and notification adapters and must not send provider messages or upload real customer evidence.
- Release acceptance requires the focused integration suites, typechecks for affected packages/apps, migration dry-run evidence, parity evidence, mobile/dashboard flow checks, and Brain documentation review.

## Out of Scope

- Store-level Product, Service, Dry Cleaning, Other, or Hybrid business types.
- A store capability matrix controlling product versus service workflows.
- Dry-cleaning-, laundry-, tailoring-, salon-, repair-, restaurant-, logistics-, or other industry-specific runtime models.
- Digital goods, licenses, downloads, or a third catalog-item kind.
- Non-stock physical products in the first two-kind model.
- Appointment calendars, staff availability, resource booking, time-slot capacity, recurring appointments, or service subscriptions.
- Arbitrary merchant-defined Service Job state machines.
- Full manufacturing, ERP, accounting, payroll, or cost-allocation behavior.
- Rebuilding the stock ledger, membership system, customer identity system, or billing-provider integrations.
- Provider-native SMS or WhatsApp delivery as a requirement for the migration.
- Durable cloud media upload and processing as a requirement for the migration.
- Offline Service Job creation, status transitions, request conversion, media sync, or service conflict resolution.
- Merging product share-link checkout and service-request intake into one customer form.
- Advanced refunds, partial fulfilment accounting, or returns policy beyond the audit-safe line cancellation/reversal boundary required by mixed orders.
- Changing store currency after transactional history.

## Further Notes

- This specification is based on all nine approved Wayfinder proposed-answer comments.
- No Wayfinder ticket lacked an approved pipeline comment; all nine were drafted, approved together, and posted before synthesis.
- The previous business-template and dry-cleaning specification remains useful as an implementation-history record but is superseded as future product architecture.
- The previous capability-matrix plan is also superseded. Runtime behavior now follows the canonical item kind, while tenant/store scope, membership roles, and subscription entitlements remain separate authorization concerns.
- “Shirt and Trouser” may be one bundled Service item if the merchant sells it as one package. When the merchant needs independent quantities and reporting, Shirt Cleaning and Trouser Cleaning should be separate Service items.

## Implementation Outcome

- All 105 user stories were audited against the delivered schema, repositories, API, dashboard, mobile, public flows, migration tooling, and focused tests.
- The canonical persisted catalog record remains the existing `Product` table for compatibility, with required `CatalogItemKind` behavior exposed through generic Catalog Item contracts.
- Product and Service items are both priced. Only Product items can create or mutate inventory, stock wallets, opening/closing stock, conversions, reservations, or offline inventory events.
- Product-only, Service-only, and mixed commercial orders share one total and payment state. Service lines create relational Service Jobs; line cancellation, Product stock reversal, and refund/payment events preserve audit history.
- Dashboard and mobile surfaces derive Sales visibility from the presence of Product items and Services visibility from the presence of Service items. Catalog remains available for an empty store, and direct dashboard routes enforce the same item-driven gates.
- Legacy metadata-backed service operations migrate through an idempotent, privacy-safe CLI. Runtime business-template and dry-cleaning-specific APIs, authorization gates, navigation, and UI were removed.
- Development and test owner OTP requests still create a short-lived code and expose `devCode`, but outbound OTP email dispatch is production-only.
- Product offline behavior remains supported. Service mutations remain intentionally online-only as specified.
- Verification passed with 190 focused tests, the full workspace typecheck, five mobile flow guards, Prisma migrate/push checks, legacy migration dry-run/apply, dashboard browser QA, Android service-order QA, and clean changed-file formatting/diff checks.
