# API Endpoints

## Purpose
Track current and planned API surface areas.

## How To Use
- Update when routes or procedure groups are added or changed.

## Current State
- `apps/marketing` exposes public POST routes for marketing lead capture:
  - `POST /api/early-access`
  - `POST /api/waitlist`
- `apps/marketing` exposes public early-access link verification:
  - `GET /api/early-access/session?token=...` validates a one-time early access onboarding token and returns safe prefill context for the signup page.
- `apps/marketing` exposes public owner signup:
  - `POST /api/auth/signup` creates the owner, tenant, first store, membership,
    and hostnames using one of the six supported operating currencies. When
    `accessToken` is present, it validates expiry/email, consumes the matching
    `OnboardingSession` exactly once, and links it to the new tenant/user.
- `apps/dashboard` exposes retained migration bridge routes for dashboard shell behavior:
  - `POST /api/auth/logout` signs out the Better Auth session for the dashboard surface.
  - `POST /api/tenants/active` stores the active tenant slug after verifying the user belongs to the requested tenant. It keeps the user on the shared dashboard host.
  - `POST /api/stores/active` stores the active store id after verifying the store belongs to the active tenant context.
  - `POST /api/stores` creates the first or next tenant store from the dashboard onboarding/setup flow.
- `apps/dashboard` exposes temporary inventory bridge routes for the dashboard proof slice:
  - `GET /api/inventory` lists selected-store product/unit inventory rows with on-hand, reserved, available, reorder, low/out state, and recent stock movement history. It accepts optional `storeId` and `productVariantId` query parameters.
  - `POST /api/inventory` records selected-store stock intake, stock adjustment, or unit conversion operations through the existing Retail Ops stock helpers. It generates dashboard external ids when callers do not provide replay keys.
- `apps/dashboard` exposes temporary staff bridge routes for the dashboard proof slice:
  - `GET /api/staff` lists active, invited, and suspended Retail Ops staff memberships with optional `storeId`, `search`, `role`, and `status` filters.
  - `POST /api/staff` invites cashier/operator/manager staff or updates cashier/operator/manager staff status through the existing Retail Ops staff helpers. Invite responses hide the acceptance token and enqueue the existing staff invitation notification.
- `apps/dashboard` exposes temporary sales and customer bridge routes for the dashboard proof slice:
  - `GET /api/sales` returns selected-store recent sales, credit sales, cashier sessions, and payment reconciliation rows. It accepts optional `storeId` and `sessionStatus` query parameters.
  - `GET /api/customers` returns the selected-store customer book with optional `storeId` and `search` query parameters.
- `apps/dashboard` exposes a temporary generated-links bridge route for the dashboard proof slice:
  - `GET /api/links` returns selected-store generated product links, shared-link order requests, delivery requests, and active products for link creation. It accepts optional `storeId` and `orderStatus` query parameters.
  - `POST /api/links` creates generated product links, deactivates generated product links, or completes/cancels shared-link order requests through the existing Retail Ops helpers.
- `apps/dashboard` exposes a temporary search bridge route for the dashboard command surface:
  - `GET /api/search` returns active tenant/store and role-scoped dashboard search records for products, customers, staff, sales, and generated links. It accepts optional `q` and `storeId` query parameters.
- Both marketing lead routes persist a `LeadCapture` record and enqueue a shared notification dispatch job through `@ewatrade/jobs`.
- Marketing lead notification dispatch now mirrors email delivery receipts back to the related `LeadCapture.metadata` record so smoke tests and support review can distinguish sent, failed, and skipped delivery states after route success.
- `apps/api` exposes the authenticated tRPC app router.
- `apps/api` exposes public self-service store detection:
  - `POST /api/self-service/store-detection/resolve` accepts device coordinates and optional accuracy, resolves enabled store geofences from store metadata, and returns ranked candidates plus a `confirmed`, `needs_confirmation`, or `manual_required` status for the POS/self-service launch flow.
- Current tRPC procedure groups:
  - `auth.requestMobileOwnerOtp` creates a six-digit owner login/sign-up OTP and preserves supported sign-up currency in the verification payload. Production dispatches email; development and test return `devCode` without sending email.
  - `auth.verifyMobileOwnerOtp` verifies the mobile OTP and returns a bearer
    session plus active business/store currency context.
  - `auth.verifyMobileGoogle` verifies Google identity and applies the same
    sign-up currency and session contract.
  - `tenant.current` returns the authenticated user's active tenant context.
  - `tenant.stores` returns stores available to the active tenant membership.
  - `tenant.createStore` creates a store/business under the active tenant for owner/admin users when the tenant is within the current business/store entitlement.
  - `retailOps.catalogItems`, `retailOps.createCatalogItem`, and `retailOps.updateCatalogItem` manage the neutral Product/Service catalog. Both kinds are priced; only Product accepts stock/unit-conversion fields.
  - `retailOps.serviceJobs`, `retailOps.updateServiceJobStatus`, `retailOps.assignServiceJob`, `retailOps.delayServiceJob`, and `retailOps.addServiceJobEvidence` manage generic service work.
  - `retailOps.serviceRequestLinks`, `retailOps.createServiceRequestLink`, `retailOps.disableServiceRequestLink`, `retailOps.serviceRequests`, `retailOps.updateServiceRequestStatus`, and `retailOps.convertServiceRequest` manage protected generic public-service intake.
  - `retailOps.serviceOperationsReport` returns Service Job state, due/overdue, delay, request conversion, popularity, and commercial-order net revenue metrics.
  - `retailOps.publicServiceRequestLink`, `retailOps.createPublicServiceRequest`, and `retailOps.publicServiceTracking` are public opaque-token procedures with privacy-safe responses.
  - `retailOps.cancelOrderLine` records auditable line cancellation, reverses eligible Product stock, cancels unfinished Service work, and records refund/payment events when supplied.
  - `retailOps.sharedProduct` publicly returns an active shared product link payload for a tenant/store/product slug and share token.
  - `retailOps.createSharedProductOrderRequest` publicly creates a pending order request from an active shared product link, reserves the requested unit quantity through the first-phase inventory balance bridge, and records notification dispatch status without failing checkout when enqueue fails after order creation.
  - `retailOps.summary` returns the first tenant-scoped Retail Ops dashboard summary.
  - `retailOps.inventory` returns the current product/unit stock snapshot.
  - `retailOps.salesByProduct` returns sales grouped by product and unit.
  - `retailOps.salesByRep` returns sales grouped by attendant/actor for the selected range.
  - `retailOps.subscription` returns the tenant's Retail Ops plan definitions, current subscription state, usage, and entitlement counters.
  - `retailOps.createSubscriptionCheckoutIntent` creates a provider-neutral upgrade handoff for owner/admin users and currently returns a provider-pending intent with no checkout URL until billing is wired.
  - `POST /api/billing/provider-events` accepts normalized internal billing provider events protected by `x-internal-key`; it records idempotent provider events and applies checkout, subscription, and invoice state changes when durable billing tables are available.
  - `retailOps.offlineDevices` returns current tenant offline-device registrations for sales-operations managers.
  - `retailOps.revokedOfflineDevices` returns currently blocked offline-device registrations for sales-operations managers.
  - `retailOps.registerOfflineDevice` registers or refreshes the current offline-capable device for POS users and enforces the tenant offline-device entitlement.
  - `retailOps.revokeOfflineDevice` revokes a registered offline device for sales-operations managers, using durable device rows when available and metadata fallback while the migration rolls out.
  - `retailOps.restoreOfflineDevice` restores a revoked offline device so it can sync again, using durable revocation rows when available and metadata fallback while the migration rolls out.
  - `retailOps.syncEvents` replays a bounded batch of offline Retail Ops closeout, credit payment, customer upsert, product setup, rep session open, sale, share-link, staff invite, stock adjustment, stock intake, and unit conversion events and returns per-event applied, failed, or skipped status.
  - `retailOps.syncHistory` returns recent server-recorded Retail Ops sync runs for POS-capable users, including counts, status, device id, and per-event result/error summaries.
  - `retailOps.syncConflicts` returns unreviewed server-recorded sync conflicts for owner/admin/manager review.
  - `retailOps.reviewSyncConflict` marks a server-recorded sync conflict reviewed for owner/admin/manager users.
  - `retailOps.customerBook` returns a searchable, tenant/store-scoped customer book derived from recent non-cancelled orders.
  - `retailOps.recentSales` returns recent tenant/store Retail Ops sales with line, customer, payment, session, and receipt summary data.
  - `retailOps.creditSales` returns pending credit Retail Ops sale orders with customer, actor, due date, aging bucket, amount due, paid amount, repayment events, and line details.
  - `retailOps.recordCreditPayment` records a cash, transfer, or card repayment against an in-person credit sale, creates a receipt, updates the remaining balance, and supports optional external-id replay protection.
  - `retailOps.sessions` returns open, closed, or all cashier sessions with rep identity, opening inventory, receipt totals, expected cash, and variance summary.
  - `retailOps.paymentReconciliation` returns closed-session receipt totals, expected cash, declared closing cash, and cash variance.
  - `retailOps.openSession` opens a rep/cashier session for the active user and store with optional opening inventory counts and external-id replay protection.
  - `retailOps.closeSession` closes the active user's open rep/cashier session with cash, transfer, card, credit, and closing-inventory declarations, payment/stock variances, and optional external-id replay protection.
  - `retailOps.staff` lists active, invited, or suspended Retail Ops staff memberships for admin review.
  - `retailOps.inviteStaff` invites or re-invites a cashier/operator/manager into the active tenant membership with optional external-id replay protection.
  - `retailOps.completeStaffOnboarding` lets an authenticated invited staff user activate their own cashier/operator/manager membership and save lightweight display details.
  - `retailOps.updateStaffStatus` suspends or reactivates cashier/operator/manager staff memberships.
  - `retailOps.productShareLinks` lists generated product links for the selected store.
  - `retailOps.sharedLinkOrderRequests` lists pending or historical order requests created through generated product links, including first-phase reservation and notification dispatch status.
  - `retailOps.updateSharedLinkOrderRequestStatus` marks a pending shared-link order request completed or cancelled after business follow-up, consuming or releasing the first-phase inventory reservation.
  - `retailOps.deliveryRequests` lists first-phase shared-link delivery requests with pickup/dropoff, assignment, bid-count, and tracking-count summaries.
  - `retailOps.createDeliveryRequest` creates an order-linked delivery request for a shared-link order, using durable fulfillment rows when available and order metadata fallback otherwise.
  - `retailOps.updateDeliveryRequestStatus` marks a shared-link delivery request assigned, picked up, delivered, or cancelled while recording first-phase tracking and assignment state.
  - `retailOps.createProductShareLink` creates an opaque web-first product link for a tenant/store product with optional external-id replay protection.
  - `retailOps.deactivateProductShareLink` deactivates a generated product link with optional external-id replay protection.
  - `retailOps.unitTemplates` lists active durable system/tenant product-unit templates, with fallback presets while migrations or seeds are unavailable.
  - `retailOps.createProduct` remains a compatibility Product-only setup procedure; new generic clients use `retailOps.createCatalogItem`.
  - `retailOps.productUnitPriceAt` resolves the effective product-unit price for a selected timestamp using durable price history, metadata fallback, or current variant price.
  - `retailOps.updateProductUnitPrice` changes a product unit price and appends metadata-backed price history.
  - `retailOps.recordStockIntake` increments current stock for an existing product variant/unit.
  - `retailOps.recordStockAdjustment` increases or decreases current stock for an existing product variant/unit with a reason, direction, optional note/source, and external-id replay protection.
  - `retailOps.recordUnitConversion` moves stock from one product variant/unit balance to another variant/unit balance on the same product.
  - `retailOps.createSale` records a product-variant sale, deducts stock, creates an order/order item, and creates a receipt for paid methods.
  - `retailOps.reviewCloseoutSession` marks a closed cashier session approved or rejected for first-phase admin review.
  - `retailOps.staffStockWallets` lists first-phase staff stock custody balances for a store.
  - `retailOps.assignStaffStock` assigns unassigned store stock to active sales staff and records a metadata-backed wallet balance.
  - `retailOps.returnStaffStock` returns assigned staff stock to central store inventory and records a metadata-backed return event.

## Current Web Routes
- `apps/dashboard` exposes `/catalog` for the shared Product/Service catalog, `/sales` only when the selected store has Product items, and `/services` only when it has Service items. Server routes enforce the same item-driven gates as navigation.
- `apps/marketing` and `apps/storefront` expose `GET /service-request/[token]` for public generic service requests. `apps/marketing` also exposes `GET /service-tracking/[token]` for opaque customer-safe tracking.

## Planned Domains
- Live Google/Gmail OAuth provider QA with a fresh short-lived ID token and approved API/database target
- Tenant and membership mutations
- Remaining store and catalog mutations
- Retail Ops stock-wallet sale deduction and returns, full closeout approval tables, remaining sync event types, richer customer account onboarding beyond shared-link checkout, and provider-native payment/delivery extensions
- Orders and checkout
- Delivery requests and dispatch bids
- Websites, pages, and themes
- Marketplace discovery
- Messaging and notifications

## TODO
- Replace remaining planned domains with concrete Hono routes and/or tRPC routers once created.
