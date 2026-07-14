# API Permissions

## Purpose
Define authorization and visibility rules for APIs.

## How To Use
- Update when auth roles, tenant checks, or public/private boundaries change.

## Baseline Rules
- Authenticated users may only access data for tenants they belong to.
- Dispatch providers may only manage delivery data tied to their tenant scope.
- Public marketplace and storefront endpoints expose only explicitly published data.
- Internal tooling permissions remain separate from Retail Ops tenant roles.

## Tenant Store Mutation Rules
- `tenant.createStore` is a protected tRPC procedure.
- The dashboard `POST /api/stores` route is an authenticated store-creation bridge for the dashboard app.
- Store creation requires owner/admin tenant-management permission.
- Store creation must pass the tenant business/store entitlement before writing.
- Created stores must belong to the active tenant context.

## Dashboard Shell And Workspace Rules

- Dashboard middleware performs only a presence check for Better Auth session cookies; server components and route handlers remain responsible for validating the actual session.
- Unauthenticated dashboard page requests redirect to the marketing login page with the requested path preserved as `next`.
- Dashboard middleware passes tenant slug and pathname context through request headers for server-side tenant resolution and known-route role gating.
- `POST /api/auth/logout`, `POST /api/tenants/active`, and `POST /api/stores/active` are retained dashboard migration bridges until equivalent typed shell APIs replace them.
- Active tenant switching can only select tenants from active memberships for the authenticated user.
- Active store switching can only select stores from the active tenant context.
- Dashboard shell navigation is role-aware: owner/admin users see the full dashboard surface, managers see operational administration without owner-only settings, cashier/operator users see permitted work surfaces, and support/member users are limited to overview.
- Known dashboard routes are gated by the same centralized role policy used by navigation visibility. API/service permission checks remain the source of truth for data access.

## Retail Ops Read Rules
- `retailOps.summary`, `retailOps.inventory`, `retailOps.salesByProduct`, `retailOps.salesByRep`, `retailOps.customerBook`, `retailOps.recentSales`, `retailOps.creditSales`, `retailOps.sessions`, and `retailOps.paymentReconciliation` are protected tRPC procedures.
- Dashboard bridge routes `GET /api/sales` and `GET /api/customers` are authenticated dashboard-only read endpoints for the first web proof slice.
- The procedure must resolve tenant membership before reading data.
- Dashboard sales and customer bridge routes must resolve the active tenant and selected or active store before reading sales, sessions, reconciliation, or customer-book rows.
- A requested `storeId` must belong to the active tenant context.
- If no `storeId` is supplied, the active tenant store should be used before falling back to the first available tenant store.
- Customer-book reads only return customers derived from orders in the selected tenant/store.
- Recent-sales reads only return Retail Ops sale orders in the selected tenant/store.
- Credit-sales reads only return pending Retail Ops credit sale orders in the selected tenant/store.
- Credit-payment writes require a POS-capable tenant role and only apply to in-person Retail Ops credit sale orders in the selected tenant/store.
- Sales-by-rep reads only aggregate Retail Ops sale orders in the selected tenant/store.
- Session-list reads only return cashier sessions in the selected tenant/store.
- Payment-reconciliation reads only return closed cashier sessions in the selected tenant/store.
- Protected date-range report reads must pass the tenant report-history entitlement when a `from` date is supplied.
- Owner/admin/manager roles can read selected-store operational reports for `retailOps.salesByProduct`, `retailOps.salesByRep`, `retailOps.customerBook`, `retailOps.recentSales`, `retailOps.creditSales`, `retailOps.sessions`, and `retailOps.paymentReconciliation`.
- Cashier/operator roles are actor-scoped on those operational reads: sales and customer-book reports only include in-person sales attributed to the current actor or shared-link order requests attributed to links they created, and session/reconciliation reports only include the current user's cashier sessions.
- Dashboard sales and customer bridge reads must preserve the same role-aware selected-store versus actor/user scoping.
- First-phase `retailOps.summary` and `retailOps.inventory` remain selected-store reads because they describe store-level stock and dashboard state rather than actor-owned activity.

## Business Template And Dry Cleaning Rules
- `retailOps.businessTemplates` and `retailOps.storeBusinessTemplate` are protected tRPC procedures.
- Store template reads must resolve tenant membership and store scope before returning the effective template.
- Stores without explicit template metadata resolve to Product Sales.
- `retailOps.updateBusinessTemplate` is a protected mutation for owner/admin tenant-management roles.
- Template changes are audited in store metadata and are blocked by default when Product Sales products/orders or dry-cleaning service records already exist.
- `retailOps.unsupportedBusinessDemand` is an internal-only procedure protected by the internal API key boundary.
- Dry-cleaning service catalog mutations require owner/admin/manager-style sales-management permission.
- Dry-cleaning service order creation, request review/conversion, and status updates require POS-capable roles: owner, admin, manager, cashier, or operator.
- Dry-cleaning protected reads and writes must resolve the selected store from the active tenant context and reject stores outside that tenant.
- Dry-cleaning operations are only available when the selected store resolves to the Dry Cleaning / Laundry template.
- Public dry-cleaning service-request and tracking procedures must use opaque tokens and must not expose raw database ids or private evidence metadata.

## Retail Ops Sale Mutation Rules
- `retailOps.createSale` is a protected tRPC procedure.
- The procedure must resolve tenant membership and store scope before writing.
- The product variant must belong to the selected tenant/store and must be active.
- A supplied cashier session must be open in the selected tenant/store and belong to the acting user.
- Sale creation requires a POS-capable role: owner, admin, manager, cashier, or operator.
- Stock deduction must be atomic with order and receipt creation.
- Insufficient stock should return a conflict response, not a generic server error.

## Retail Ops Session Rules
- `retailOps.openSession` and `retailOps.closeSession` are protected tRPC procedures.
- Session procedures must resolve tenant membership and store scope before writing.
- Session open/close requires a POS-capable role: owner, admin, manager, cashier, or operator.
- A user cannot open a second open session in the same store.
- A user can only close their own open session in the selected tenant/store.

## Retail Ops Staff Rules
- `retailOps.staff` and `retailOps.inviteStaff` are protected tRPC procedures.
- Dashboard bridge routes `GET /api/staff` and `POST /api/staff` are authenticated dashboard-only staff management endpoints for the first web proof slice.
- The procedures must resolve tenant membership and store scope before reading or writing.
- Dashboard staff bridge routes must resolve the active tenant and selected or active store before reading staff, inviting staff, or updating staff status.
- Only owner, admin, and manager roles can list, invite, re-invite, suspend, or reactivate Retail Ops staff.
- Staff list reads only return non-removed owner, admin, manager, cashier, or operator memberships in the active tenant.
- Invites can target cashier, operator, or manager roles.
- Existing active memberships should return a conflict instead of creating duplicate staff access.
- New or restored staff invites must pass the tenant staff entitlement check before creating a counted membership.
- First-phase staff invites enqueue the invitation email after membership persistence succeeds.
- `retailOps.completeStaffOnboarding` is an authenticated procedure that does not require an active tenant context yet; it can only activate the current user's own invited cashier/operator/manager membership.
- Staff onboarding completion can use the request tenant slug or explicit `tenantSlug` to choose the invite; without a slug it prioritizes the current user's invited Retail Ops staff memberships.
- Staff status updates can target cashier, operator, or manager memberships only; owner/admin status changes stay outside the Retail Ops attendant lifecycle.
- Staff status updates prevent actors from changing their own membership status.
- `retailOps.staffStockWallets`, `retailOps.assignStaffStock`, and `retailOps.returnStaffStock` require owner/admin/manager-style sales-management permission.
- Cashier/operator users cannot assign, return, or view all staff custody balances through these admin procedures.
- Stock assignment can target active cashier/operator/manager staff memberships only.
- First-phase staff management uses one-time hashed invite tokens, public bounded invite resolution, authenticated OTP-based staff onboarding, shared invitation notification dispatch, and durable staff profile/audit rows when the migration is available. Live email-provider configuration, durable stock wallet tables, ledger-backed assignment/return movements, stock return approval workflow, and broader reconciliation remain future hardening.

## Retail Ops Share-Link Rules
- `retailOps.sharedProduct` and `retailOps.createSharedProductOrderRequest` are public tRPC procedures.
- Public shared-product procedures must validate tenant slug, store slug, product slug, and active opaque share token before exposing product or accepting an order request.
- Public order requests only create pending orders for business follow-up; they must not deduct stock, create receipts, or mark payment complete.
- `retailOps.productShareLinks`, `retailOps.sharedLinkOrderRequests`, `retailOps.updateSharedLinkOrderRequestStatus`, `retailOps.deliveryRequests`, `retailOps.createDeliveryRequest`, `retailOps.updateDeliveryRequestStatus`, `retailOps.createProductShareLink`, and `retailOps.deactivateProductShareLink` are protected tRPC procedures.
- Dashboard bridge route `GET /api/links` and `POST /api/links` are authenticated dashboard-only generated-link and shared-link follow-up endpoints for the first web proof slice.
- The procedures must resolve tenant membership and store scope before reading or writing product link data.
- Dashboard links bridge reads and writes must resolve the active tenant and selected or active store before reading links/orders/deliveries/products or writing link/order follow-up changes.
- Owner, admin, manager, cashier, and operator roles can list and generate product share links.
- Shared-link order request reads must return all selected-store requests to owner/admin/manager users and only creator-attributed requests to cashier/operator users.
- Shared-link order request status updates must use the same scope: owner/admin/manager users can complete or cancel selected-store requests, while cashier/operator users can only update requests attributed to their generated links.
- Shared-link delivery request creation, reads, and status updates use the same scope: owner/admin/manager users can manage selected-store delivery requests, while cashier/operator users can only manage delivery requests attributed to their generated links.
- Shared-link order request reads must pass the tenant report-history entitlement when a `from` date is supplied.
- A product selected for sharing must belong to the selected tenant/store and must not be archived.
- Cashier/operator users can deactivate links they created.
- Owner/admin/manager users can deactivate links created by any user in the tenant/store.
- The MVP web checkout requires first-time customer registration and returning-customer login before order request submission. The storefront server action resolves those customer accounts through Better Auth and forwards the platform customer account id into the pending order request; raw passwords must never be stored in order data or metadata.
- First-phase share-link APIs reserve selected stock for pending requests, audit customer/account identity into the customer book, enqueue and audit customer/merchant notification dispatch, and support protected follow-up completion or cancellation with payment and pickup/delivery outcome capture. Live email-provider configuration, provider-native payment capture, provider bidding/selection, richer customer account onboarding, and subscription campaign limits remain future hardening.

## Retail Ops Product Mutation Rules
- `retailOps.createProduct` and `retailOps.updateProductUnitPrice` are protected tRPC procedures.
- Dashboard bridge routes `GET /api/products`, `POST /api/products`, and `PATCH /api/products/[productId]` are authenticated dashboard-only product catalog endpoints for the first web proof slice.
- The procedure must resolve tenant membership and store scope before writing.
- Dashboard product bridge routes must resolve the active tenant and selected or active store before reading or writing products.
- Unit names must be unique within the product request.
- Product, variant, and inventory creation must happen atomically.
- When an `externalId` is supplied, product setup must treat tenant/store external id as a replay key and return the original product/unit ids without creating a duplicate product.
- Product creation must pass the tenant product entitlement check before writing.
- Product listing, creation, product edits, and product unit price changes require owner/admin/manager-style sales-management permission; cashier/operator users cannot manage the catalog.

## Retail Ops Closeout Review Rules
- `retailOps.reviewCloseoutSession` is a protected tRPC procedure.
- Closeout review requires owner/admin/manager-style sales-management permission.
- Cashier/operator users can open and close their own sessions but cannot approve or reject closeouts.
- Reviews can only be recorded for closed sessions in the selected tenant/store.

## Retail Ops Stock Mutation Rules
- `retailOps.recordStockIntake` is a protected tRPC procedure.
- `retailOps.recordStockAdjustment` is a protected tRPC procedure.
- `retailOps.recordUnitConversion` is a protected tRPC procedure.
- Dashboard bridge routes `GET /api/inventory` and `POST /api/inventory` are authenticated dashboard-only inventory endpoints for the first web proof slice.
- The procedure must resolve tenant membership and store scope before writing.
- Dashboard inventory bridge routes must resolve the active tenant and selected or active store before reading inventory, reading stock movement history, or writing stock operations.
- Stock intake, stock adjustment, and unit conversion require a POS-capable role: owner, admin, manager, cashier, or operator.
- The product variant must belong to the selected tenant/store and must be active.
- Unit conversions must keep source and target variants within the same product.
- Stock increments must be transactional and must not create inventory for variants outside the selected tenant/store.
- Stock adjustments can increase stock for correction/found-stock cases or decrease stock for correction/damage/loss cases.
- Decreasing adjustments must fail when the selected unit does not have enough available stock.
- Unit conversions must decrement source stock only when enough source quantity is available.
- When an `externalId` is supplied, stock intake, stock adjustment, and unit conversion mutations must treat tenant/store/type external id as a replay key and return the original response without applying the balance mutation again.
- The first stock phase records balance changes only; ledger/audit rows remain required before stock history is production-complete.

## Retail Ops Sync Rules
- `retailOps.syncEvents` is a protected tRPC procedure for POS-capable tenant members.
- `retailOps.syncHistory` is a protected tRPC procedure for POS-capable tenant members.
- `retailOps.syncConflicts` and `retailOps.reviewSyncConflict` are protected tRPC procedures for owner/admin/manager-style sales-management review.
- The procedure must resolve tenant membership before replaying events.
- Each supported event payload must resolve store scope before writing and must reference products, variants, sessions, or inventory within the selected tenant/store.
- Supported replay events use client `eventId` as the fallback `externalId`; retries must not duplicate product setup, share links, staff invites, sales, credit payments, or stock mutations.
- `credit_payment_recorded` replay must resolve the selected store and treat the event id as the payment replay key before creating a receipt or increasing the paid amount.
- `closeout_created` replay must resolve the selected store, require a production `cashierSessionId`, and treat the event id as a close-session replay key before open-session validation.
- `customer_upsert` replay must resolve the selected store and validate the referenced sale external id before acknowledging the derived customer-book entry.
- `rep_session_opened` replay must resolve the selected store and treat the event id as an open-session replay key before duplicate-open validation.
- `share_link_created` and `share_link_deactivated` replay must pass POS-capable share-link permission; deactivation must still enforce creator ownership unless the actor has manager/admin-level sales operations permission.
- `staff_invited` replay must pass owner/admin/manager staff-management permission before inviting staff or sending the first invitation email.
- Unsupported event types should return a skipped per-event result until their idempotency and conflict contracts are implemented.
- A failed event must not hide other per-event results from the same batch.
- Sync history reads must restrict cashier/operator users to their own actor sync runs, while owner/admin/manager users may review tenant-level sync history.
- Sync conflict reads and reviews must only expose tenant-scoped unreviewed conflict events to owner/admin/manager users.

## Retail Ops Entitlement Rules
- `retailOps.subscription` is a protected tRPC procedure for owner/admin plan review.
- `retailOps.createSubscriptionCheckoutIntent` is a protected tRPC mutation for owner/admin billing handoff requests.
- `POST /api/billing/provider-events` is not a user-facing tRPC procedure; it is an internal billing bridge guarded by `x-internal-key`/`INTERNAL_API_KEY` so provider adapters can submit normalized checkout, subscription, and invoice events without exposing provider-specific webhook payloads to app clients.
- `retailOps.registerOfflineDevice` is a protected tRPC procedure for POS-capable tenant members.
- `retailOps.offlineDevices` is a protected tRPC procedure for owner/admin/manager sales-operations review.
- `retailOps.revokeOfflineDevice` is a protected tRPC procedure for owner/admin/manager sales-operations management.
- `retailOps.revokedOfflineDevices` is a protected tRPC procedure for owner/admin/manager sales-operations review.
- `retailOps.restoreOfflineDevice` is a protected tRPC procedure for owner/admin/manager sales-operations management.
- The first subscription read resolves plan definitions, tenant metadata subscription state, default trial fallback, and usage counters; store creation, product creation, new/restored staff invites, offline device registration, and protected date-range report reads use those entitlements for first-phase limit enforcement.
- Offline device revocation marks the current durable registration revoked when the migration is available, with metadata fallback while the migration rolls out.
- A revoked device id must be rejected during offline-device registration and sync replay.
- Offline device restore removes the active durable revocation and reactivates the device when the migration is available, with metadata fallback while the migration rolls out.
- Plan-limited Retail Ops mutations must resolve the tenant/business subscription before writing.
- Plan-limited Retail Ops report reads must resolve the tenant/business subscription before returning history beyond the active plan window.
- Remaining entitlement checks should move metadata-backed limits into durable subscription and device tables.
- UI affordances may hide or disable blocked actions, but API/service checks remain required.
- Billing provider state should be normalized into platform statuses before permission checks run: trialing, active, past_due, cancelled.
- Owners/admins can view plan state and initiate provider-neutral upgrade/billing handoff. Attendants inherit business access and cannot manage billing.
