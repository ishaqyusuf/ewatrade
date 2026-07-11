
# Merchant System

Capabilities:

- merchant onboarding
- store creation
- product catalog
- inventory tracking
- order management
- store analytics

Merchants may operate multiple stores.

## Retail Ops Ownership

The merchant system owns the owner/admin view of Retail Ops:

- business onboarding and active business selection
- first product setup and product/unit management
- staff invites and role-aware access
- stock visibility and stock movement history
- product share-link management and analytics
- daily sales and payment summaries
- operational reporting for sales, stock, payments, sync, and variances
- closeout review and variance monitoring
- subscription plan and entitlement state

The mobile app is the first MVP surface for these workflows. The dashboard app becomes the denser reporting and administration surface as production APIs mature.

The dashboard now supports first-phase active store switching for tenants with multiple stores. The sidebar exposes a store selector, `/api/stores/active` persists the selected store id in an http-only cookie, and `getActiveTenant` prefers that store when resolving dashboard context.

The dashboard also supports first-phase tenant switching for users with active memberships in multiple tenant businesses. `getActiveTenant` returns the user's active tenant list, `/api/tenants/active` validates and persists a selected tenant for local/dev contexts, hosted switches can redirect to the selected tenant's dashboard domain, and the sidebar exposes a tenant selector when more than one tenant is available.

The dashboard first-store setup now captures a compact Retail Ops onboarding profile before the business starts adding inventory. The setup form records business type, country/currency, main product category, sales method, and team size, then `POST /api/stores` and tRPC `tenant.createStore` persist those fields through the shared store helper in `Store.metadata.retailOps.onboarding` and a completed tenant/user `OnboardingSession`.

## Retail Ops Product Wedge

See `brain/features/retail-ops-sales-product.md` for the A-to-Z Retail Ops/Sales product direction. Feed and grain examples are setup templates for flexible-unit inventory and reconciliation, not the whole product identity.

## Retail Ops Reporting

See `brain/features/retail-ops-reporting.md` for report definitions and query boundaries. Mobile currently provides compact local snapshots, while the dashboard app owns the denser production report surface for store/date-range review, exportable tables, and deeper exception review.

Current production read bridges include summary, inventory, sales by product/unit, sales by rep, durable-first price history with metadata fallback, metadata-backed stock movements, derived customer book, recent in-person sales, credit sales, session list, payment reconciliation, and sync history. Durable closeout write mirrors now persist close-session and review audit rows when the closeout migration is available, while dashboard closeout reads still use the first-phase session/metadata bridge. Sync-conflict reads now include server-derived resolution actions/details, and the dashboard/mobile conflict surfaces show those actions before manager acknowledgement. The dashboard `/analytics` Reports screen now uses these reads for summary cards, sales/stock/payment/credit/variance/sync tables, price-history and stock-movement reporting, store/date filters, table filters, payment-method reporting, movement-type reporting, CSV exports, and a browser print-to-PDF report action. These are still first-phase views until durable stock movement ledgers, durable closeout read cutover, durable credit account-balance workflows, deeper exception filters, full conflict resolution workflows, and server-generated packaged exports are added.

The mobile Dashboard now uses `retailOps.summary` and `retailOps.recentSales` when online for headline sales, pending-order, low-stock, active-rep, stock-unit, report-summary, and recent-sale surfaces. Offline or production-unavailable sessions continue to use local state, and the old static recent-sale starter rows have been removed from the live dashboard path.

The Prisma source schema now includes the first durable stock-ledger foundation: `StockDelivery`, `StockDeliveryLine`, and `InventoryMovement`, with enums for delivery status/source and movement direction/type/source. A matching migration file exists, but the active reporting and mutation bridges are still metadata-backed until the migration is applied, the generated Prisma client is updated, and repository writes are added.

## Production Subscription Snapshot API Phase 1

The API now exposes `retailOps.subscription` for the first production plan and entitlement snapshot.

Current behavior:

- allows owner/admin users to view Retail Ops billing state
- returns Starter, Growth, and Pro plan definitions from the backend
- resolves a tenant metadata-backed subscription when available
- falls back to a default Starter trial snapshot when no production subscription exists yet
- returns current usage counts for stores/businesses, products, and staff
- returns entitlement counters for businesses, products, staff, offline devices, and report history
- blocks owner/admin store creation when the tenant is at the current business/store limit
- blocks product creation and new/restored staff invites when the tenant is at the current plan limit
- blocks new offline device registration when the tenant is at the current offline-device limit
- blocks protected date-range report reads when the requested history exceeds the current plan limit
- powers a dashboard `/settings` billing and plan screen that shows current plan, status, usage, limits, available tiers, and provider-neutral upgrade intent responses
- powers the mobile Subscription sheet when online, including production plan source state, server usage, backend plan tiers, and provider-neutral mobile checkout intent responses

The Prisma source schema now includes the durable subscription and provider-boundary foundation: `SubscriptionPlan`, `TenantSubscription`, `BillingCheckoutSession`, `BillingInvoice`, and `BillingProviderEvent`, with enums for billing provider, subscription status, checkout status, invoice status, and provider-event status. The generated client and repository layer now use durable subscription rows, checkout sessions, and normalized provider events first when billing tables are available, with metadata/default fallback for undeployed subscription reads.

`POST /api/billing/provider-events` is the first internal webhook bridge. It accepts normalized checkout, subscription, and invoice events from future provider adapters, stores idempotent `BillingProviderEvent` rows, skips already-processed events, updates matching checkout sessions, upserts tenant subscriptions, and upserts billing invoices. This phase does not yet create payable checkout sessions, verify provider-native signatures, support app-store purchase validation, collect payments directly, or expose provider-specific fields to mobile/dashboard UI. The current upgrade handoff still returns `provider: "none"` and `checkoutUrl: null` until a provider is selected.

## Production Product Setup Phase 1

The API now exposes `retailOps.unitTemplates` for reusable unit setup suggestions and `retailOps.createProduct` for the first production first-item flow.

Current behavior:

- requires owner/admin/manager-style sales-management permission
- creates an active product in the selected tenant/store
- creates a default variant for the primary unit
- creates optional variant/sub-unit rows with independent prices
- creates an inventory item for each unit/variant with opening stock
- links the product and matching units to a durable unit template when `unitTemplateKey` matches an active system or tenant template, or applies fallback template ratios without relational ids when only fallback presets are available
- stores actor, primary unit, conversion multiplier metadata fallback, durable conversion ratio numerator/denominator values, initial price-history metadata fallback, and durable price-history rows when the migration is available

The API also exposes `retailOps.productUnitPriceAt` for POS-capable effective-price previews and `retailOps.updateProductUnitPrice` for manager-level price changes. Price updates change the current `ProductVariant.priceMinor`, append metadata-backed price history with actor/previous/new price/effective time/reason, mirror the entry into `ProductUnitPriceHistory` when available, reject future-dated prices in this first phase, and keep default-unit `Product.listPriceMinor` aligned. `retailOps.createSale` now resolves the unit price for `soldAt` from durable price history first, metadata price history second, and current variant price last before snapshotting order item and receipt totals.

`retailOps.unitTemplates` reads active durable system and tenant unit templates when available and merges fallback bag-fraction and kilogram-fraction presets while seeds or migrations are unavailable. When product setup supplies a matching durable `unitTemplateKey`, the created product stores the template id, matching variants store template-unit ids, and matched template-unit ratios drive durable conversion ratio values. When the key matches a fallback preset only, setup applies the preset ratios to matching units without relational ids. Template editing, seed management UI, mobile picker UI, and conversion-ledger enforcement remain separate slices.

The mobile first-product wizard now uses `retailOps.createProduct` when online and stores returned product/default-unit/variant ids in local state as synced. Offline setup keeps using the local queued `product_setup` event so first product creation remains available without a connection and can replay later.

The Prisma source schema and migration folder now declare durable `ProductUnitTemplate`, `ProductUnitTemplateUnit`, and `ProductUnitPriceHistory` tables. Product and variant rows can point at reusable templates, variant rows can carry explicit conversion ratio numerator/denominator values, and price-history rows can store previous/new price, actor, reason, source, effective timestamp, and replay id. Live product setup now writes durable `ProductVariant` ratio fields from positive conversion multipliers and resolves returned conversion multipliers from metadata first, then durable ratio fields during rollout.

This phase does not yet provide template creation/editing, seed management UI, mobile picker UI wiring for the effective-price preview query, validate the migration against a live database, enforce conversion ledger rules from ratios, or add product limit override workflows.

## Production Stock Intake Phase 1

The API now exposes `retailOps.recordStockIntake`, `retailOps.recordStockAdjustment`, and `retailOps.recordUnitConversion` for the first production restock, correction/loss, and rebagging flows.

Current behavior:

- requires a POS-capable role: owner, admin, manager, cashier, or operator
- validates the selected product variant within the active tenant/store
- increments the variant inventory balance transactionally
- creates a missing inventory item for an existing scoped variant when needed
- records manual stock adjustments with increase/decrease direction, reason, optional note/source, before/after balance, and unreserved-stock protection for decreases
- requires damage/loss adjustments to decrease stock and found-stock adjustments to increase stock
- mirrors external-id-backed stock adjustment, damage, and loss mutations into durable `InventoryMovement` rows when the stock-ledger migration is available, with metadata fallback for undeployed environments
- converts stock between two variants on the same product by decrementing the source unit and incrementing the target unit
- enforces matching source/target base-unit quantity when both units have conversion multipliers or durable ratio fields
- mirrors external-id-backed unit conversions into paired durable `InventoryMovement` rows when the stock-ledger migration is available, with metadata fallback for undeployed environments
- blocks conversion when unreserved source stock is insufficient
- treats `externalId` as a first-phase replay key for stock intake, stock adjustment, and unit conversion so duplicate offline sync submissions return the original response without applying a second balance mutation
- returns intake metadata and before/after stock quantity
- exposes `retailOps.stockMovements` as a bounded report read for metadata-backed opening stock, stock intake, manual stock adjustment, conversion, assignment, return, closeout stock adjustment rows, and order-derived sale deductions
- stores before/after stock movement snapshots on newly recorded sale order items so sale deductions can appear in stock audit views before durable movement tables exist

The mobile Stock intake sheet now uses `retailOps.recordStockIntake` and `retailOps.recordStockAdjustment` when online and the selected product unit has a production id. Successful production stock changes are inserted into local product and stock-movement state as synced without adding duplicate offline sync events, while offline changes or changes waiting on unsynced product/unit ids continue through the local queued stock movement path.

The mobile Unit conversion sheet now uses `retailOps.recordUnitConversion` when online and both the source primary unit and target variant have production ids. Successful production conversions update local primary and target stock from the production before/after result, insert paired conversion movements as synced, and avoid duplicate offline sync events, while offline conversions or conversions waiting on unsynced product/unit ids continue through the local queued `unit_conversion_recorded` path.

This phase now has source-schema and migration definitions for supplier/production delivery records, delivery lines, inventory movement rows, adjustment/loss movement types, conversion pairs, source references, and external replay ids. It does not yet generate the Prisma client, apply the migration, switch stock mutations to write those tables, expose durable stock audit filters, or add the replay uniqueness constraint to a running database.

## Production Staff Management Phase 1

The API now exposes `retailOps.staff` and `retailOps.inviteStaff` for the first production attendant management bridge.

Current behavior:

- lists active, invited, or suspended Retail Ops staff memberships for the active tenant
- supports role, status, search, and limit filters for admin review
- accepts a staff email, optional name, and cashier/operator/manager role
- requires owner, admin, or manager permission in the active tenant
- creates a user placeholder when the email is new
- creates or refreshes the tenant membership as invited
- checks the tenant staff entitlement before creating a new or restored counted membership
- blocks duplicate active memberships
- suspends or reactivates cashier/operator/manager staff memberships through `retailOps.updateStaffStatus`
- prevents staff status self-updates
- sends the first invitation email through the shared notification dispatch job
- lets authenticated invited staff activate their own cashier/operator/manager membership through `retailOps.completeStaffOnboarding`

The Prisma source schema and migration folder now declare durable `RetailOpsStaffProfile`, `RetailOpsStaffInviteToken`, and `RetailOpsStaffLifecycleEvent` tables for membership-linked attendant profiles, hashed invite tokens, token lifecycle timestamps, role/status snapshots, default stores, and auditable invite/onboarding/suspension/reactivation/removal/role-change events.

The mobile Staff invite sheet now consumes this first-phase staff bridge: online reads use `retailOps.staff` for cashier/attendant memberships, online submissions use `retailOps.inviteStaff` so the shared invitation email is enqueued, and offline submissions continue to use the local queued invite path for later sync.

This phase does not yet wire live staff APIs to the durable staff profile/invite-token/lifecycle tables, accept secure invitation tokens from those records, configure a real email provider, or derive subscription staff usage from durable snapshots.

## Production Product Share-Link Phase 1

The API now exposes product share-link management procedures for the first production mobile/admin sharing bridge.

Current behavior:

- publicly resolves an active generated product link by tenant, store, product slug, and opaque token
- renders the first storefront product-link page at `/p/[tenantSlug]/[storeSlug]/[productSlug]?share=...`
- emits product and business metadata plus a generated preview image URL for messaging/social link previews
- returns product, variant/unit, price, and available quantity data for a web product page
- creates pending shared-link order requests with customer details and share-link attribution
- reserves the requested unit quantity through first-phase `InventoryItem.reservedQuantity` while the shared-link order request is pending, reducing visible, assignable, convertible, and manually-decreasable stock
- documents the required next checkout contract: first-time customer registration with name, email, and password, plus returning-customer login with email and password before order request submission
- sends first-phase email dispatches to the customer, owner/admin recipients, and responsible sales rep/link creator through the shared notifications/jobs/email packages
- records first-phase notification dispatch status on order metadata and keeps checkout successful when a notification enqueue fails after the order request has already been created
- lists metadata-backed product links for the selected tenant/store
- lists pending or historical shared-link order requests for owner/admin/manager review, while cashier/operator users only see requests from links they created
- creates, lists, and status-updates first-phase shared-link delivery requests with pickup/dropoff details, using durable `DeliveryRequest` rows, first tracking events, self-delivery assignment summaries, and order metadata fallback otherwise
- shows reservation and notification dispatch status in the mobile product-link management sheet so reps can see when stock is held and when direct customer follow-up is needed
- lets permitted users mark pending shared-link order requests completed or cancelled after customer follow-up, consuming or releasing the first-phase stock reservation, creating a receipt when a payment method is captured, and recording pickup/delivery fulfillment outcome metadata
- creates an opaque token and public URL for a product
- stores link records on product metadata with creator, active state, timestamps, and first counters
- lets cashiers/operators deactivate their own links
- lets owners/admins/managers deactivate any link in the selected store

The Prisma source schema and migration folder now include the durable share-link foundation: `ProductShareLink`, `ProductShareLinkEvent`, `ProductShareLinkView`, `ProductShareLinkOrderRequest`, `ProductShareLinkReservation`, `ProductShareLinkNotification`, and `ProductShareLinkAnalyticsDaily`, with enums for link status, event type, order-request status, reservation status, notification channel/status/recipient, and daily analytics rollups. The live API bridge uses durable rows first when the migration is available, keeps product/order metadata as rollout fallback, and still uses `InventoryItem.reservedQuantity` for the first stock-reservation bridge until the full stock-ledger/dispatch flow is expanded.

This phase does not yet configure a real email provider, ingest provider-native webhooks, collect provider-native online payment from share links, wire mobile delivery-request forms, or run provider bidding/selection, driver assignment UI, and richer tracking views. The first public link surface remains web-based; native customer browsing and checkout are a later extension.

## Operational Workflow

See `brain/workflows/retail-ops-stock-to-closeout-flow.md` for the receive stock -> convert units -> invite/assign reps -> clock in -> sell -> closeout -> reconcile flow.

## Design And IA Contract

See `brain/features/retail-ops-design-system-and-ia.md` for the Retail Ops screen map, component vocabulary, role split, and required operational states.
