# Database Schema

## Purpose
Track the conceptual schema and schema ownership rules for the platform.

## How To Use
- Update when entities, ownership rules, or schema tooling changes.

## Schema Ownership
- `Prisma` is the source of truth for schema definitions.
- Prisma schema changes should generate and track migrations.
- `Drizzle` should not become a competing schema definition layer.
- The canonical Prisma provider is `postgresql`.
- Prisma schema is organized as a file-based schema under `packages/db/prisma/` with domain-specific `.prisma` files.

## Core Entity Groups
- Tenant: merchant tenant, dispatch tenant, and tenant-owned hostname records for each application surface
- Platform growth: marketing lead capture for early access and waitlist interest
- Identity: user, session, account, membership
- Commerce: store, product, product variant, inventory item, stock delivery, inventory movement, cart, order, order item
- Fulfillment: delivery request, dispatch provider, bid, assignment, tracking event
- Storefront: site, page, section, theme, template
- POS: cashier session, receipt, barcode event, planned scan resolution request
- Messaging: conversation, message, automation event
- Billing: subscription plan, tenant subscription, entitlement limits snapshot, billing provider customer/subscription ids

## Planned POS Session Extensions
- Rep/cashier sessions need opening inventory snapshots for each product, unit, and variant confirmed at clock-in.
- Opening inventory lines should store expected quantity, confirmed quantity, variance, optional variance note, and sync/idempotency metadata.
- Sale records should link back to the active rep/cashier session so closeout and admin review can reconcile by attendant.
- Offline mobile clock-in events must sync into the production schema without duplicating open sessions.

## Planned Scan Resolution Mapping
- `BarcodeEvent` remains the immutable scan log for tenant, store, code, source user, cashier session, payload, and timestamp.
- Missing-price, unknown-product, and incomplete-catalog scans need a durable scan-resolution request workflow linked to tenant, store, source cart/session, barcode, optional product/product variant, captured image evidence, status, resolver, and resolution timestamps.
- Resolution statuses should distinguish price pending, catalog pending, price resolved, unavailable for order, cancelled, and expired.
- Admin notifications should be auditable so a scan can be traced from customer or cashier capture through final pricing, product creation/linking, or unavailable-item decision.
- See `.brain/features/retail-ops-scan-price-resolution.md` for the product behavior and expected API/UI surfaces.

## Current Retail Ops Onboarding Mapping
- Marketing signup stores tenant-level business context on `Tenant` using country/currency columns plus first-phase metadata for industry and business size.
- Marketing and mobile owner signup write the selected supported currency to
  both `Tenant.currencyCode` and the first `Store.currencyCode`. Mobile OTP
  verification preserves the selection in the short-lived verification JSON.
- `Store.currencyCode` is the commerce source of truth. New stores inherit
  tenant currency when the caller omits it, then fall back to NGN for legacy
  contexts. Existing stored values are not converted.
- Mobile offline state stores product, sale, and closeout money as integer
  `*Minor` values. Zustand persist version 1 performs a client-only one-time
  conversion from legacy local major-unit fields; it does not change database
  rows.
- Dashboard first-store setup and protected tRPC `tenant.createStore` accept a compact onboarding payload for the effective business template, country code, product/service/offering category, sales/operating model, team size, support contact, and Other-business demand details.
- `createTenantStore` persists cleaned first-store setup values under `Store.metadata.retailOps.onboarding` with source, captured timestamp, currency code, and the selected template snapshot.
- `Store.metadata.retailOps.businessTemplate` stores the effective v1 template key and label. Existing stores without explicit template metadata resolve to Product Sales.
- Dry Cleaning / Laundry stores receive a `Store.metadata.retailOps.dryCleaning` workspace for metadata-backed settings, service items, service orders, service request links, service requests, and notification intents.
- Dry-cleaning settings currently store express surcharge percentage in metadata; service orders snapshot express line pricing and evidence metadata so later setting or catalog edits do not rewrite historical orders.
- Other business submissions store unsupported-demand metadata under `Store.metadata.retailOps.unsupportedBusinessDemand`, while completed `OnboardingSession.formData.onboarding` preserves the raw answers for internal ranking.
- The shared store helper writes a completed `OnboardingSession` for onboarding submissions with tenant id, actor user id, completed status, expiry, created store snapshot, source, captured timestamp, currency, template, and setup answers. Multi-step setup state, onboarding analytics, normalized onboarding field tables, and dedicated dry-cleaning Prisma tables remain planned.
- No Prisma schema or migration is required for operating currency because the
  tenant, store, product, order, and billing currency/minor-unit columns already
  exist.

## Current Self-Service Store Detection Mapping
- Store-level self-service geolocation detection uses `Store.metadata.retailOps.selfServiceDetection` in the v1 bridge instead of a schema migration.
- Supported metadata fields are `enabled`, `latitude`, `longitude`, and `radiusMeters`.
- `packages/db/src/queries/self-service-store-detection.ts` reads active stores with active tenants, extracts enabled geofence metadata, computes distance and confidence, and returns ranked candidates to the public API.
- The legacy-compatible metadata path `Store.metadata.selfServiceStoreDetection` is also read during rollout.
- Durable location-resolution event logging, geofence polygons, floor/branch metadata, and admin store-location management remain planned extensions.

## Current Retail Ops Product Mapping
- First-phase production product setup uses existing `Product`, `ProductVariant`, and `InventoryItem` records.
- The primary unit is represented as the default `ProductVariant`.
- Optional sub-units or variants are represented as additional `ProductVariant` records with independent prices.
- The standard mobile item form remains metadata-backed in this phase: product public image links are stored under `Product.metadata.retailOps.imageLinks`/`imagesUrl`, variant public image links and enabled state are stored under `ProductVariant.metadata.retailOps`, and local camera/gallery URIs are not persisted until durable upload storage is selected.
- One mobile variant label maps directly to additional `ProductVariant` rows. Multiple mobile variant labels generate sellable combination row names such as `Color Red, Size SM`; those rows still persist as `ProductVariant` records with combined `variantLabel` metadata rather than a new option/value/combo schema.
- Opening stock creates an `InventoryItem` balance for each created variant and, when durable stock-ledger tables are available, mirrors positive starting quantities into `InventoryMovement(OPENING_STOCK)` rows with `PRODUCT_SETUP` source, before/after on-hand snapshots, actor, setup reference metadata, and product/variant/inventory links.
- `Product.metadata.retailOps.externalId` is the first-phase product setup idempotency key for offline or poor-network replay; repeated setup submissions return the existing product and unit ids without creating duplicate products.
- Conversion multipliers, opening stock quantities, setup source metadata, and first-phase price-history entries remain in variant/product metadata for fallback while live repositories move piece by piece to durable unit template, conversion ratio, and price history entities. Product setup now also writes positive conversion multipliers into `ProductVariant.conversionRatioNumerator` and `ProductVariant.conversionRatioDenominator` when the generated client exposes those fields.
- `ProductVariant.metadata.retailOps.priceHistory` stores fallback entries with id, actor user id, previous price, new price, effective timestamp, optional reason, and source. `retailOps.updateProductUnitPrice` appends to this array and updates `ProductVariant.priceMinor`; if the default unit changes price, `Product.listPriceMinor` is kept aligned.
- The Prisma source schema and migration folder now declare durable `ProductUnitTemplate`, `ProductUnitTemplateUnit`, and `ProductUnitPriceHistory` tables. `Product` and `ProductVariant` can point at a unit template, `ProductVariant` can store explicit conversion ratio numerator/denominator values, and price-history rows can store previous/new price, effective timestamp, actor, reason, source, and replay id.
- `retailOps.unitTemplates` reads active durable system and tenant `ProductUnitTemplate` rows with ordered `ProductUnitTemplateUnit` ratios when available, then merges fallback bag-fraction and kilogram-fraction presets so setup assistance works before seeds or migrations are deployed.
- `retailOps.createProduct` accepts an optional `unitTemplateKey`; when it matches an active durable template, new product and matching variant rows store `unitTemplateId`/`unitTemplateUnitId` links and use matched template-unit ratios as durable conversion ratio values. When the key only matches a fallback preset, setup applies fallback ratios to matching units without writing relational template ids.
- The generated Prisma client and live price-history repositories now use `ProductUnitPriceHistory` rows first when the migration is available. Product setup and unit price updates still write metadata fallback entries, then mirror those entries into durable price-history rows. `retailOps.priceHistory` merges durable rows with legacy metadata rows by id during rollout and falls back to metadata only when durable tables are undeployed. Product setup reads return conversion multipliers from metadata first and from durable `ProductVariant` ratio fields second, so idempotent product setup replays can survive the metadata-to-ratio rollout.
- `retailOps.createSale` resolves sale-time unit price for `soldAt` from durable `ProductUnitPriceHistory` first, metadata price history second, and current `ProductVariant.priceMinor` last. The resolved price is then snapshotted on the order item and receipt totals.
- `retailOps.productUnitPriceAt` exposes the same durable-first effective-price resolution for POS-capable callers that need to preview a unit price before recording a sale.
- Future-dated price changes are rejected in the first live bridge. Dedicated effective-price preview UI and broader service contracts remain planned service extensions.

## Current Retail Ops Stock Intake Mapping
- First-phase production stock intake increments existing `InventoryItem.onHandQuantity` for a scoped `ProductVariant`.
- If a scoped variant does not yet have an `InventoryItem`, stock intake creates one with the received quantity.
- First-phase production stock adjustment increases or decreases an existing scoped `ProductVariant` inventory balance with reason metadata for correction, damage, loss, or found stock. Damage and loss must decrease stock, while found-stock adjustments must increase stock.
- Increasing stock adjustment can create a missing `InventoryItem` for the scoped variant; decreasing stock adjustment requires enough unreserved current stock.
- First-phase production unit conversion decrements one scoped variant inventory item and increments or creates another scoped variant inventory item on the same product. Source stock checks use unreserved quantity so pending shared-link requests are not converted away. When both units expose conversion multipliers or durable ratio fields, conversion requests must preserve the same base-unit quantity before any stock is mutated. When the stock-ledger migration is available and the request has an `externalId`, the production bridge mirrors the conversion into paired durable `InventoryMovement` rows: `CONVERSION_OUT` for the source unit and `CONVERSION_IN` for the target unit, both with `UNIT_CONVERSION` source, before/after on-hand snapshots, related variant references, actor, note, happened-at timestamp, and a shared `movementGroupId`.
- Intake metadata such as source, note, external id, and received timestamp is returned by the API and, when durable stock-ledger tables are available, mirrored into durable `StockDelivery`, `StockDeliveryLine`, and `InventoryMovement` rows for external-id-backed requests. Stock intake delivery headers use the external id as the reference number with received-by, received-at, source, source name, note, and metadata snapshots. Stock intake movement rows use `STOCK_INTAKE` type with `STOCK_DELIVERY` source, inbound direction, before/after on-hand snapshots, actor, note, source metadata, happened-at timestamp, a `stock_intake:<externalId>` movement group id, and links back to the delivery header and line. Metadata fallback remains the active replay source in undeployed environments and for intake requests without external ids.
- Adjustment metadata such as reason, direction, source, note, external id, and adjusted timestamp is returned by the API and, when durable stock-ledger tables are available, mirrored into one durable `InventoryMovement` row for external-id-backed requests. Damage and loss use dedicated durable `DAMAGE`/`LOSS` movement types; correction and found-stock use `STOCK_ADJUSTMENT`. Metadata fallback remains the active replay source in undeployed environments and for adjustment requests without external ids.
- Conversion metadata such as note, external id, source quantity, target quantity, and converted timestamp is returned by the API and, when durable stock-ledger tables are available, mirrored into conversion movement rows for external-id-backed requests. Metadata fallback remains the active replay source in undeployed environments and for conversion requests without external ids.
- `Store.metadata.retailOps.stockOperations` stores first-phase idempotency responses for stock intake, stock adjustment, and unit conversion keyed by operation type and external id, so offline or poor-network replays can return the original response without mutating balances again.
- The Prisma source schema now declares durable `StockDelivery`, `StockDeliveryLine`, and `InventoryMovement` models plus delivery/movement enums. These tables cover delivery headers and lines, product/unit movement rows, inbound/outbound direction, movement type, source, before/after balance snapshots, source references, external replay ids, conversion group ids, related variants, order/session links, and optional actor/staff ids.
- A matching Prisma migration file now creates the durable stock-ledger enums and tables. The generated Prisma client exposes those models, and production stock intake, unit conversion, external-id-backed stock adjustment/damage/loss, sale deduction, staff-wallet assignment/return, and approved closeout adjustment writes now mirror into durable movement rows when the migration is available. External-id-backed stock intake now also mirrors into durable delivery headers and lines linked from the intake movement. `retailOps.stockMovements` now reads durable `InventoryMovement` rows first for stock intake, adjustment/damage/loss, conversion, sale, staff assignment/return, opening stock, sync correction, and closeout adjustment history, then merges legacy metadata/order/session fallbacks during rollout. Migration application and live DB validation still need follow-up repository slices.

## Current Retail Ops Sale Mapping
- First-phase production sale creation uses existing `Order`, `OrderItem`, `InventoryItem`, and `Receipt` records.
- The sale mutation first checks whether the acting user has a metadata-backed staff wallet balance for the sold `ProductVariant`.
- Staff wallet sales decrement `Store.metadata.retailOps.staffStockWallets`, append a bounded event to `Store.metadata.retailOps.staffStockWalletSales`, and leave central `InventoryItem.onHandQuantity` unchanged because assignment already moved that stock out of central inventory.
- Store-stock sales continue to decrement `InventoryItem.onHandQuantity` for the sold `ProductVariant`, but only from unreserved stock.
- When durable stock-ledger tables are available, `retailOps.createSale` mirrors each completed sale line into a `SALE_DEDUCTION` `InventoryMovement` row with `SALE` source, order/order-item/session references, actor, source reference, movement group, and stock-source metadata. Store-stock sale rows snapshot previous/current `InventoryItem.onHandQuantity`; staff-wallet sale rows snapshot previous/current staff wallet quantity while leaving central on-hand snapshots null.
- `OrderItem` snapshots product name, variant/unit name in metadata, quantity, unit price, and total.
- `Order.metadata.retailOps.stockSource` records `staff_wallet` or `store` for first-phase stock-source attribution.
- Paid sales use `Order.paymentStatus = PAID` and create a `Receipt`.
- Credit sales use `Order.paymentStatus = PENDING`, mark metadata payment state as `credit_pending`, may store `creditDueAt` and `creditTermsNote`, and do not create a `Receipt`.
- First-phase credit repayments create `Receipt` rows for the collected cash/transfer/card amount, append bounded repayment events to `Order.metadata.retailOps.creditPayments`, and update `Order.metadata.retailOps.paymentState` to `credit_partially_paid` or `credit_paid`.
- First-phase credit-sales reads use `Order.paymentStatus = PENDING` plus `Order.metadata.retailOps.source = retail_ops_sale`, optional credit terms, and credit payment metadata to return paid amount, remaining balance, due date, aging bucket, last payment time, and repayment events.
- Production customer-book reads use durable `RetailOpsCustomer` rows first when the customer-book migration is available, then merge recent non-cancelled `Order` customer fields (`customerName`, `customerEmail`, `customerPhone`) as rollout fallback so historical order-derived customers remain visible.
- Offline `customer_upsert` replay validates a referenced Retail Ops sale external id, then writes or updates a durable `RetailOpsCustomer`, inserts primary identity rows, links the source `Order.retailOpsCustomerId`, and appends a `RetailOpsCustomerEvent` when the migration is available. Undeployed environments still return the derived customer-book identity without writing a customer row.
- The Prisma source schema and migration folder now declare durable `RetailOpsCustomer`, `RetailOpsCustomerIdentity`, and `RetailOpsCustomerEvent` tables. These store tenant/store customer profiles, email/phone/name/platform-account identities, order counts, spend totals, first/last seen timestamps, optional platform customer account ids, merge links, customer event history, and optional `Order.retailOpsCustomerId` linkage.
- Shared-link order requests now also feed the durable customer book when the customer-book migration is available: the order request creates or updates the scoped customer, stores platform account id as an additional identity when available, links `Order.retailOpsCustomerId`, and records an `ORDER_REQUESTED` customer event.
- Manual customer upsert without a sale/order, identity merge flows, customer balances/credit limits, and cross-business customer accounts remain planned extensions.
- First-phase recent-sale reads filter `Order.metadata.retailOps.source = retail_ops_sale` in application code so product-link order requests remain separate.
- First-phase shared-link order request reads use `Order` rows with `Order.metadata.retailOps.source = retail_ops_share_link_order_request` and share-link attribution fields.
- Storefront-submitted shared-link order requests now store `customerAccountId`, `customerAuthMode`, and `customerIdentityScope = platform` in `Order.metadata.retailOps` after Better Auth register/login succeeds; raw passwords are never stored on the order. When durable customer tables are available, the same order request links to the tenant/store customer profile and records the platform account id as a customer identity.
- First-phase shared-link request follow-up marks those `Order` rows as `COMPLETED` or `CANCELLED`, stores follow-up actor, timestamp, status, payment method, receipt summary, payment-state metadata, and optional fulfillment outcome metadata, and consumes or releases the existing inventory reservation. When completion includes cash, transfer, or card payment, it creates a linked `Receipt` and marks the order paid. Fulfillment outcome metadata can record pickup/delivery status, method, note, actor, and fulfilled timestamp. The first delivery-request bridge now creates, lists, and status-updates order-linked `DeliveryRequest` rows when the fulfillment tables are available, records `TrackingEvent` rows for state changes, upserts a first self-delivery `DeliveryAssignment` summary for assigned/picked-up/delivered states, and stores `Order.metadata.retailOps.deliveryRequest` as fallback; provider bidding/selection and richer tracking UI remain separate workflow slices.
- First-phase sales-by-rep reads group `Order.metadata.retailOps.actorUserId` and join `User` for display name/email when available.
- First-phase session-list reads use existing `CashierSession` rows, linked `Receipt` rows, and `User` display fields to show open/closed session status and cash variance context.
- First-phase payment reconciliation reads use existing `CashierSession` rows, linked `Receipt` rows, and `CashierSession.closingFloatMinor` to compute expected cash and cash variance.
- First-phase opening inventory declarations are stored under `Store.metadata.retailOps.openingInventoryDeclarations` and linked back to `CashierSession.id`; each line stores counted quantity, expected quantity, variance, stock source, product snapshot, unit snapshot, and optional note.
- `Order.metadata.retailOps.externalId` is the first-phase sale idempotency key for offline or poor-network replay; repeated `retailOps.createSale` calls with the same tenant/store external id return the original sale without another stock decrement.
- Actor, optional cashier session, payment method, and optional external id currently live in order metadata until dedicated Retail Ops sale/session/offline models are added.

## Current Retail Ops Session Mapping
- First-phase production session lifecycle uses existing `CashierSession` and `Receipt` records.
- Opening a session creates a `CashierSession` with `status = OPEN`, opening float, open timestamp, user, tenant, and store.
- Closing a session updates the same `CashierSession` with `status = CLOSED`, close timestamp, closing float, and notes.
- First-phase close totals are derived from receipts linked by `cashierSessionId`; pending credit sales linked through order metadata are included as the credit bucket.
- First-phase offline open-session and close-session replay stores applied session results under `Store.metadata.retailOps.sessionOperations` keyed by client `externalId` because `CashierSession` has no metadata column.
- First-phase non-cash closeout declarations are stored under `Store.metadata.retailOps.closeoutDeclarations` keyed by `cashierSessionId`, with declared cash, transfer, card, and credit amounts.
- First-phase closing inventory declarations are stored under `Store.metadata.retailOps.closeoutInventoryDeclarations` keyed by `cashierSessionId`, with product/unit snapshots, expected quantity, counted quantity, variance quantity, stock source, and optional note.
- Closing inventory expected quantity uses `Store.metadata.retailOps.staffStockWallets` for the acting staff/product unit when a wallet balance exists, otherwise it uses central `InventoryItem.onHandQuantity`.
- First-phase admin closeout review stores bounded review records under `Store.metadata.retailOps.closeoutReviews` keyed by `cashierSessionId`, with approved/rejected status, reviewer user id, review timestamp, and optional note.
- The Prisma source schema and migration folder now declare durable `RetailOpsCloseout`, `RetailOpsPaymentDeclaration`, `RetailOpsStockDeclaration`, and `RetailOpsCloseoutReview` tables. These store session-level closeout status, expected/declared/variance totals, payment declarations by method, opening and closing stock declarations by product unit and stock source, damage/loss quantities, offline replay ids, review state, and approval/rejection/correction review history.
- The generated Prisma client and live session repositories now mirror closed sessions into durable closeout, payment declaration, and closing stock declaration rows when the migration is available. `retailOps.reviewCloseoutSession` also updates durable closeout review status, appends durable closeout review history, and posts approved non-zero closing-stock variances into `InventoryMovement(CLOSEOUT_ADJUSTMENT)` rows with central-stock or staff-wallet snapshots when available. `retailOps.openSession`, `retailOps.sessions`, and `retailOps.paymentReconciliation` still read from `CashierSession`, `Receipt`, and store metadata in this phase.
- Correction workflows and admin conflict review after late offline sync remain planned implementation slices.

## Current Retail Ops Staff Mapping
- First-phase production staff invites use existing `User` and `Membership` records.
- New staff emails create a platform `User` placeholder with Retail Ops invite metadata.
- Tenant membership stores the invited role, `status = INVITED`, `invitedById`, and `invitedAt`.
- Re-inviting suspended, removed, or pending members refreshes the same tenant/user membership back to `INVITED`.
- Active memberships are treated as already-accepted staff and are not duplicated.
- First-phase offline invite replay stores applied invite results under `Tenant.metadata.retailOps.staffInvites` keyed by client `externalId` so retries do not refresh membership state or resend invitation email.
- The Prisma source schema and migration folder now declare durable `RetailOpsStaffProfile`, `RetailOpsStaffInviteToken`, and `RetailOpsStaffLifecycleEvent` tables. These store tenant/user staff profiles, membership links, default store, role/status snapshots, hashed invite tokens, token lifecycle timestamps, invite replay ids, and auditable invite/onboarding/suspension/reactivation/removal/role-change events.
- The generated Prisma client and live staff write repositories now mirror `retailOps.inviteStaff`, `retailOps.updateStaffStatus`, and `retailOps.completeStaffOnboarding` into `RetailOpsStaffProfile`, `RetailOpsStaffInviteToken`, and `RetailOpsStaffLifecycleEvent` rows when the migration is available. Undeployed environments still use the existing `User`, `Membership`, and bounded tenant metadata behavior.
- `retailOps.staff` now reads durable `RetailOpsStaffProfile` rows first when the migration is available, then merges legacy `Membership`/`User` rows as rollout fallback so owner/admin rows and pre-cutover staff remain visible. Secure invite-token acceptance, real email provider configuration, durable staff usage snapshots, return approvals, and wallet reconciliation remain planned service extensions.
- First-phase stock wallet balances are stored under `Store.metadata.retailOps.staffStockWallets`, assignment events are stored under `Store.metadata.retailOps.staffStockAssignments`, and return events are stored under `Store.metadata.retailOps.staffStockReturns`, each keyed by optional client `externalId` where applicable.
- `retailOps.assignStaffStock` only assigns unreserved central stock; it moves that quantity from `InventoryItem.onHandQuantity` into the metadata-backed staff wallet balance.
- `retailOps.returnStaffStock` decrements the metadata-backed staff wallet balance for the staff/product unit and increments central `InventoryItem.onHandQuantity`.
- Staff wallet sale deductions are recorded under `Store.metadata.retailOps.staffStockWalletSales`.
- The Prisma source schema and migration folder now declare durable `StaffStockWallet` balances for tenant/store/staff/product-unit custody. `InventoryMovement` now has optional `staffStockWalletId`, `previousStaffWalletQuantity`, and `staffWalletQuantity` fields so assignment, return, sale deduction, and closeout adjustment rows can point at the wallet balance they changed.
- When the durable staff-wallet and stock-ledger tables are available, `retailOps.assignStaffStock` and `retailOps.returnStaffStock` also upsert the scoped `StaffStockWallet` balance and write `InventoryMovement(STAFF_ASSIGNMENT)` or `InventoryMovement(STAFF_RETURN)` rows with central-stock and staff-wallet before/after snapshots. Wallet-aware `retailOps.createSale` also updates the durable `StaffStockWallet` balance and links its `SALE_DEDUCTION` movement to that wallet.
- `retailOps.staffStockWallets` now reads positive `StaffStockWallet` balances first when the migration is available, then merges legacy store-metadata balances as rollout fallback. Subscription staff usage snapshots, return approvals, and wallet reconciliation remain planned schema/service extensions.

## Current Retail Ops Share-Link Mapping
- First-phase production product links use existing `Product.metadata` for generated link records.
- Each link metadata entry stores opaque token, public URL, creator user id, active state, optional label, optional create/deactivation external ids, created/deactivated timestamps, last activity timestamp, and first counters.
- Public URLs use tenant slug, store slug, product slug, and an opaque share token rather than database ids.
- Public shared-product order requests use existing `Order` and `OrderItem` records with `status = PENDING`, `paymentStatus = PENDING`, customer details, price snapshots, and share-link attribution metadata.
- Pending shared-product order requests now reserve stock through existing `InventoryItem.reservedQuantity` and reservation metadata on the order. Completing the follow-up consumes the reservation by decrementing reserved and on-hand quantity; cancelling releases the reservation.
- MVP shared-link checkout requires platform-level customer registration/login with name, email, and password for first-time customers and email/password login for returning customers. Current pending-order metadata carries explicit customer details plus storefront-authenticated customer account id/auth mode, and durable customer-book environments link the order request back to a scoped `RetailOpsCustomer`.
- Shared-link order notifications target the customer, business owner/admin recipients, and the responsible sales rep or link creator. First-phase notification dispatch status is recorded on order metadata as `sharedLinkNotification` with queued/sent/failed status, attempt count, timestamps, delivery result snapshots, failure reason, max attempts, and next retry timestamp so enqueue or provider failure does not turn an already-created order request into a customer-facing checkout failure.
- Deactivation updates the metadata entry to inactive and keeps the historical record.
- The Prisma source schema and migration folder now declare durable `ProductShareLink`, `ProductShareLinkEvent`, `ProductShareLinkView`, `ProductShareLinkOrderRequest`, `ProductShareLinkReservation`, `ProductShareLinkNotification`, and `ProductShareLinkAnalyticsDaily` tables. These store opaque tokens, public URLs, active/inactive state, creator/deactivation ids, replay ids, counters, event rows, view rows, customer account/auth metadata, order attribution, stock reservations, notification delivery audit, and daily analytics rollups.
- The generated Prisma client and live share-link repositories now use durable `ProductShareLink` rows first for `retailOps.createProductShareLink`, `retailOps.deactivateProductShareLink`, `retailOps.productShareLinks`, and public shared-product lookup when the migration is available. Created/deactivated link state is mirrored into product metadata for rollout fallback, public lookup records durable view rows and events, and shared-link order requests increment durable link order counters/events when a durable row exists.
- Live shared-link order requests still use existing `Order` and `OrderItem` rows for pending request persistence and reserve stock through the existing inventory balance bridge, but migrated environments now mirror checkout into durable `ProductShareLinkOrderRequest` and `ProductShareLinkReservation` audit rows. Completing or cancelling a follow-up updates the durable order-request status and reservation consumed/released state; completing with a payment method creates a linked `Receipt`, marks the order paid, and exposes that receipt summary in shared-link order request reads. Shared-link order request reads now also expose fulfillment metadata from `Order.metadata.retailOps.fulfillment` so pickup/delivery outcome is visible. The first protected delivery bridge creates, lists, and status-updates order-linked `DeliveryRequest` rows for shared-link orders when the fulfillment tables are available, with tracking-event rows, first self-delivery assignment summaries, and `Order.metadata.retailOps.deliveryRequest` fallback for undeployed environments. Notification enqueue writes per-recipient customer and merchant `ProductShareLinkNotification(PENDING)` audit rows for the dispatch payload, and background email dispatch updates those rows with sent/failed status, provider message id, subject, failure reason, attempt, max attempts, and next retry metadata. `retailOps.sharedLinkOrderRequests` now reads durable `ProductShareLinkOrderRequest` rows first with order/item snapshots and durable reservation/notification audit details, then merges legacy order-metadata rows as rollout fallback. Public views, pending order requests, completed/cancelled follow-up, reserved/released/consumed quantities, and completed revenue are mirrored into `ProductShareLinkAnalyticsDaily` day buckets when the analytics table is available; `retailOps.productShareLinks` now uses those daily rollups for generated-link view/order counters when present, with row counters and metadata counters as fallback. `retailOps.productShareLinkAnalytics` now reads those daily buckets into summary, per-link, and daily reporting totals, falling back to link counters when the rollup table is not deployed.

## Current Retail Ops Sync Mapping
- Production sync replay writes recent sync runs and replayed event summaries to durable `RetailOpsSyncRun` and `RetailOpsSyncEvent` rows when the sync migration is available.
- The sync repository keeps a tenant-metadata fallback for environments that have not applied the durable sync migration yet.
- Each sync run stores a generated run id, actor user id, optional offline device id, completed timestamp, aggregate applied/failed/skipped/total counts, aggregate status, and bounded per-event status/error summaries.
- Sync history reads are tenant-scoped. Owner/admin/manager users can review tenant-level history, while cashier/operator users are limited to their own actor runs.
- The Prisma source schema and migration folder now declare durable `OfflineDevice`, `OfflineDeviceRevocation`, `RetailOpsSyncRun`, and `RetailOpsSyncEvent` tables. These store tenant/store device identity, platform/app version, device status, revocation/restore audit, sync run counts/status, per-event payload/result/error state, dependency-wait reasons, retry timestamps, conflict review timestamps, actor ids, and tenant-scoped event idempotency keys.
- The generated Prisma client now exposes those durable sync/device models. `retailOps.syncEvents` and `retailOps.syncHistory` use durable sync-run/event rows first. `retailOps.registerOfflineDevice`, `retailOps.offlineDevices`, `retailOps.revokedOfflineDevices`, `retailOps.revokeOfflineDevice`, `retailOps.restoreOfflineDevice`, and sync device eligibility checks now use durable device/revocation rows first, with tenant-metadata fallback for undeployed environments.
- `retailOps.syncConflicts` and `retailOps.reviewSyncConflict` use durable `RetailOpsSyncEvent` rows first, filtering unreviewed failed events whose error code is `CONFLICT` and recording `reviewedAt` plus `reviewedByUserId`. Undeployed environments fall back to metadata sync-run summaries plus a bounded metadata reviewed-event-id list.

## Current Billing And Subscription Mapping
- The Prisma source schema and migration folder now declare durable `SubscriptionPlan`, `TenantSubscription`, `BillingCheckoutSession`, `BillingInvoice`, and `BillingProviderEvent` tables. These store plan keys, names, price labels, active state, entitlement limits JSON, tenant plan id, billing status, provider name, billing customer/subscription ids, trial dates, current period dates, cancellation state, limits snapshots, provider-neutral checkout sessions, invoice status/amounts, and idempotent provider event payloads.
- The generated Prisma client and live subscription resolver now use durable billing rows first when the migration is available. `retailOps.subscription` reads active `SubscriptionPlan` rows for plan definitions, resolves `TenantSubscription` rows for tenant plan/status/period/trial state, applies `limitsSnapshot` to current entitlement checks, and falls back to backend constants plus `Tenant.metadata.retailOps.subscription` or default trial state for undeployed environments.
- `retailOps.createSubscriptionCheckoutIntent` now writes provider-neutral `BillingCheckoutSession` rows for non-current plan requests when durable billing tables are available, while preserving `provider: "none"` and `checkoutUrl: null` until a payable provider is selected.
- `POST /api/billing/provider-events` now records normalized internal provider events in `BillingProviderEvent` rows, skips already-processed provider/event id pairs, updates matching `BillingCheckoutSession` rows, upserts `TenantSubscription` rows, and upserts `BillingInvoice` rows when durable billing tables are available. Provider-native webhook signatures, payable checkout creation, and app-store purchase validation remain provider-adapter work behind this boundary.
- Offline device registration, listing, revocation, restoration, sync eligibility checks, and subscription usage counts now use durable `OfflineDevice` and `OfflineDeviceRevocation` rows first when the sync migration is available.
- Legacy `Tenant.metadata.retailOps.offlineDevices` and `Tenant.metadata.retailOps.revokedOfflineDevices` records remain as the fallback path for undeployed environments and as transition data merged into device lists and usage counts.
- Durable revocation creates an active revocation row, marks the device `REVOKED`, and blocks registration/sync for that device id; restore marks the active revocation restored and returns the durable device to `ACTIVE`.
- Offline-device subscription usage merges durable active devices with legacy metadata devices during the transition and excludes device ids with active durable revocations.
- Checkout intent is provider-neutral and writes checkout sessions when available, while normalized provider events can now create or update subscription and invoice state after an external adapter submits a verified event.
- Subscription records store a limits snapshot so historical entitlement decisions remain explainable after plan definitions change.
- First-phase entitlement checks gate business/store creation, product creation, staff invites, offline device registration, and report history range.
- Dedicated offline-device and sync telemetry tables now have durable-first repository wiring for device lifecycle, sync history, first conflict review acknowledgement, and server-derived resolution guidance, but production migration application, live validation, automatic resolution mutations, and full admin conflict workflows remain pending.
- Billing provider webhook events must continue to be processed idempotently and should not leak provider-specific fields into UI code.

## Retail Ops MVP Entity Map
- Business/tenant owns products, staff, customers, stock movements, sales, sessions, closeouts, share links, reports, and subscriptions.
- First-phase production staff management uses tenant `Membership` rows and linked `User` identity fields for invited/active/suspended staff lists.
- Product owns a primary unit and optional sellable variants/sub-units.
- Sale records should snapshot product name, unit name, unit price, quantity, payment method, customer, attendant, and session.
- Inventory movement records should explain starting stock, stock intake, sale deduction, conversion in/out, adjustment, assignment, return, staff-wallet custody changes, and sync correction.
- Rep/cashier session records should own opening inventory lines and link to sales and closeouts.
- Closeout records should own payment declarations, expected totals, inventory declarations, variances, notes, and approval status.
- Product share links should use opaque tokens/slugs and link to tenant, product, creator, active state, views, and pending order requests.

See `.brain/features/retail-ops-sales-product.md` and `.brain/workflows/retail-ops-stock-to-closeout-flow.md` for the product and workflow context behind these entities.

## Implemented Schema Modules
- `packages/db/prisma/models/base.prisma` - tenants, users, sessions, accounts, memberships, marketing lead capture
- `packages/db/prisma/models/base.prisma` also owns `TenantHostname` records for storefront, POS, and dashboard hostname mapping
- `packages/db/prisma/models/commerce.prisma` - stores, products, variants, inventory, staff stock wallets, stock deliveries, inventory movements, carts, orders
- `packages/db/prisma/models/billing.prisma` - subscription plans and tenant subscription records
- `packages/db/prisma/models/customers.prisma` - Retail Ops customer profiles, identities, and customer event history
- `packages/db/prisma/models/sync.prisma` - offline device registrations, revocation audit, sync runs, and sync event telemetry
- `packages/db/prisma/models/share-links.prisma` - product share links, link events, view analytics, and order request attribution
- `packages/db/prisma/models/staff.prisma` - Retail Ops staff profiles, invite tokens, and lifecycle audit events
- `packages/db/prisma/models/fulfillment.prisma` - delivery requests, bids, assignments, tracking
- `packages/db/prisma/models/storefront.prisma` - sites, pages, sections, themes, templates
- `packages/db/prisma/models/pos.prisma` - cashier sessions, receipts, barcode events, Retail Ops closeouts, payment declarations, stock declarations, and closeout review history
- `packages/db/prisma/models/messaging.prisma` - conversations, messages, automation events
- `packages/db/prisma/models/enums.prisma` - shared enum definitions

## Cross-Cutting Rules
- Tenant-owned records require `tenantId`.
- Tenant hostname resolution is modeled through `TenantHostname` records instead of a single pair of domain fields on `Tenant`.
- Public marketplace data must be explicitly flagged for exposure.
- Audit fields should exist on operational entities.

## TODO
- Confirm whether merchant and dispatch organizations share one tenant table or use role-specific tables.
- Refine auth tables once Better Auth integration is selected at implementation time.
- Add migrations once a local PostgreSQL instance is available and the first migration is generated.
- Confirm whether rep clock-in requires GPS/location and device fingerprint fields.
- Confirm whether subscription billing is per tenant/business or per owner account.
