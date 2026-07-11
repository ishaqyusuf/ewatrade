
# POS and Walk-in Cashier

Supports physical store sales.

Features:

- barcode scanning
- walk-in orders
- cashier sessions
- receipt generation
- stock deduction

Missing-price and unknown-product scans should create a scan-resolution request
instead of forcing the cashier to leave the counter to ask an admin. Cashiers
can capture a product photo when catalog details are missing, admins are
notified automatically, and unresolved items remain blocked from checkout until
priced, removed, or marked unavailable.

See `brain/features/retail-ops-scan-price-resolution.md` for the shared
customer, cashier, and admin workflow.

## Surface Split

- Mobile owns the early attendant sales flow: clock in, confirm opening inventory, create sale, capture customer and payment method, see sync state, and close the day.
- POS owns future fixed-location cashier workflows: terminal sessions, receipt printing, barcode scanning, and counter selling.
- Dashboard owns admin review: rep sessions, closeout approval, stock variances, reports, and exceptions.

Use `brain/features/retail-ops-design-system-and-ia.md` as the IA and state-language contract for shared POS, mobile, and dashboard concepts.

The end-to-end stock-to-closeout workflow is documented in `brain/workflows/retail-ops-stock-to-closeout-flow.md`.

## Mobile Rep Session Bridge

The mobile MVP currently keeps rep clock-in locally while production POS session APIs are pending.

- Reps/owners must clock in before normal local sale creation.
- Clock-in captures an opening inventory snapshot by product, unit, and variant.
- Each opening line stores expected quantity, confirmed quantity, and variance.
- The dashboard shows currently open rep sessions and opening variance counts.
- Local sale records link to the active rep session for the current attendant.
- Submitting a local closeout closes that attendant's open local session.

## Production Offline Sync History Phase 1

The API now records first-phase server sync history for mobile offline replay.

Current behavior:

- `retailOps.syncEvents` records a bounded sync-run summary after each replay batch
- sync runs and per-event replay summaries now write to durable `RetailOpsSyncRun` and `RetailOpsSyncEvent` rows when the sync migration is available, with tenant-metadata fallback for environments that have not applied the migration yet
- each run includes actor id, optional offline device id, completed timestamp, aggregate counts, aggregate status, and per-event status/error summaries
- `retailOps.syncHistory` returns recent runs for POS-capable tenant members
- owner/admin/manager users can review tenant-level sync history, while cashier/operator users are limited to their own runs
- `retailOps.syncConflicts` returns unreviewed server-recorded sync conflicts for owner/admin/manager users, and `retailOps.reviewSyncConflict` marks a conflict reviewed
- the mobile sync status sheet shows the current device's server sync history and manager-available server conflicts, with an acknowledgement action for each returned conflict
- the dashboard Reports screen shows tenant-level unreviewed server conflicts, includes them in the Sync issues metric, supports sync-device filtering and CSV export, and lets owner/admin/manager users acknowledge each returned conflict
- `retailOps.registerOfflineDevice`, `retailOps.offlineDevices`, `retailOps.revokedOfflineDevices`, `retailOps.revokeOfflineDevice`, and `retailOps.restoreOfflineDevice` now use durable `OfflineDevice` and `OfflineDeviceRevocation` rows when the sync migration is available
- offline-device subscription usage merges durable active devices with legacy metadata devices during the transition and excludes durable-revoked device ids from the active count

The Prisma source schema, migration folder, and generated client now include the durable sync foundation: `OfflineDevice`, `OfflineDeviceRevocation`, `RetailOpsSyncRun`, and `RetailOpsSyncEvent`, with enums for device platform/status and sync run/event status. Offline device registration/revocation and sync history keep metadata fallback behavior for environments that have not applied the durable sync migration yet.

This phase does not yet provide conflict assignment queues, guided conflict resolution actions, background retry scheduling, durable admin resolution workflows beyond acknowledgement, production migration application, or live durable replay validation.

## Production Sale API Phase 1

The API now exposes `retailOps.createSale` as the first production sale-recording mutation.

Current behavior:

- resolves the authenticated tenant and selected store
- requires a POS-capable role: owner, admin, manager, cashier, or operator
- validates an active product variant in that store
- checks stock availability for the selected unit
- deducts assigned staff wallet stock when the acting user has a wallet balance for the unit; otherwise atomically decrements central store inventory
- creates a completed order with an order item that snapshots product name, unit name, quantity, unit price, and total
- stores actor, optional cashier session, payment method, payment state, stock source, and optional external id in order metadata
- treats `externalId` as a first-phase idempotency key so duplicate sale replay returns the original sale without another stock deduction
- creates a receipt for cash, transfer, and card sales
- records credit sales as completed sales with pending payment and no receipt

The mobile Create sale sheet now uses this production mutation when online and the selected product unit plus open rep session already have production ids. Successful production sales are inserted into local sales, customer, and stock-movement state as synced with the returned order id, while offline sales or sales waiting on unsynced product/session dependencies continue through the local queued `sale_created` and `customer_upsert` path.

Offline replay for queued `sale_created` events now extracts the returned production order id from the sync result and stores it on the local sale as `remoteId` when marking the event synced. This keeps replayed sales aligned with direct online sales for later dashboards, closeout review, duplicate replay handling, and customer history work.

## Production Recent Sales API Phase 1

The API now exposes `retailOps.recentSales` as the first production recent-sale list bridge for mobile and admin dashboards.

Current behavior:

- resolves the authenticated tenant and selected store context
- reads recent non-cancelled orders whose metadata source is `retail_ops_sale`
- excludes pending shared-link order requests from the in-person sale list
- returns order, customer, line item, unit, payment, receipt, actor, and cashier-session summary data
- supports optional date bounds and a bounded result limit

This phase does not yet provide sales by rep display names, customer account linkage, offline replay status beyond external-id duplicate detection, pagination cursors, or ledger-backed stock movement details.

## Production Credit Sales API Phase 1

The API now exposes `retailOps.creditSales` as the first production outstanding-credit list bridge.

Current behavior:

- resolves the authenticated tenant and selected store context
- reads pending in-person Retail Ops credit sale orders for the selected date range
- excludes shared-link order requests
- returns amount due, paid amount, due date, terms note, aging bucket, overdue days, last payment time, repayment events, customer details, actor display data, payment state, sale lines, and order metadata
- records cash, transfer, or card repayments through `retailOps.recordCreditPayment`
- rejects overpayment, writes a receipt for the collected amount, and marks credit sales partially paid or paid
- supports offline replay through `credit_payment_recorded` using the event id or explicit external id

This phase does not yet track customer account balances, credit limits, credit approval workflows, automated reminders, or durable aging reports.

## Production Sales By Rep API Phase 1

The API now exposes `retailOps.salesByRep` as the first production attendant sales summary bridge.

Current behavior:

- resolves the authenticated tenant and selected store context
- reads in-person Retail Ops sale orders for the selected date range
- groups sales by order metadata actor id
- joins known users for display name and email
- returns sale count, total quantity, gross total, cash, transfer, card, credit, linked cashier session ids, and last sale timestamp

Owner/admin/manager users can review selected-store sales by rep. Cashier/operator users are scoped to their own actor activity. This phase does not yet include stock wallet balances, closeout approval status, offline replay state, or durable sales-rep profile records.

## Production Customer Book API Phase 1

The API now exposes `retailOps.customerBook` as the first production customer lookup bridge for repeat sales.

Current behavior:

- resolves the authenticated tenant and selected store context
- reads durable customer-book profiles first when the migration is available
- merges recent non-cancelled orders that have customer name, email, or phone as historical rollout fallback
- groups customers by email first, then phone, then normalized name
- supports a small search string and bounded result limit for mobile customer pickers
- returns customer display data, order count, total spend, first/last seen timestamps, and last order summary
- records offline `customer_upsert` replay into durable customer, identity, order-link, and event rows when the migration is available
- records shared-link order requests into durable customer, platform-account identity, order-link, and `ORDER_REQUESTED` event rows when the migration is available
- powers the mobile Customer book sheet when online, with a local saved-customer fallback for offline or unavailable production sessions

Owner/admin/manager users can review selected-store customer activity. Cashier/operator users only receive customers from their own durable customer events plus order-derived fallback activity. The live API does not yet support manual customer upsert without a sale/order, merge duplicate customer identities, expose customer balances/credit limits, or expose cross-business customer accounts.

The Prisma source schema and migration folder now declare durable `RetailOpsCustomer`, `RetailOpsCustomerIdentity`, and `RetailOpsCustomerEvent` tables plus optional `Order.retailOpsCustomerId` linkage. The generated Prisma client and first live repository bridge now use those tables for offline customer replay, shared-link order-request customer capture, and customer-book reads, with order-derived fallback kept during rollout.

Offline replay for queued `customer_upsert` events now extracts the returned production customer-book id from the sync result and stores it on the local customer as `remoteId` when marking the event synced. The mobile customer book uses that id to label offline fallback rows that have already synced with production.

## Production Staff List API Phase 1

The API now exposes `retailOps.staff` as the first production staff list bridge for owner/admin/manager review.

Current behavior:

- resolves the authenticated tenant and selected store context
- allows owner, admin, and manager roles to list Retail Ops staff
- returns active, invited, or suspended owner/admin/manager/cashier/operator memberships
- supports bounded search plus role and status filters
- returns membership status, role, invite/accept timestamps, inviter id, and user display data
- lets authenticated invited staff complete account-based onboarding through `retailOps.completeStaffOnboarding`
- lets owner/admin/manager users suspend or reactivate cashier/operator/manager staff through `retailOps.updateStaffStatus`

The API also exposes `retailOps.staffStockWallets`, `retailOps.assignStaffStock`, and `retailOps.returnStaffStock` as the first production stock-wallet bridge. Owner/admin/manager-style users can assign unassigned store stock to active sales staff, return assigned stock to central inventory, and review metadata-backed custody balances by staff/product unit. `retailOps.createSale` consumes those assigned balances for the acting staff member before falling back to central store stock.

The Prisma source schema and migration folder now declare durable `RetailOpsStaffProfile`, `RetailOpsStaffInviteToken`, `RetailOpsStaffLifecycleEvent`, and `StaffStockWallet` records. Staff profile/audit tables cover membership-linked attendant profiles, hashed invite tokens, token lifecycle timestamps, role/status snapshots, default stores, and lifecycle audit events; staff wallet tables cover custody balances and optional `InventoryMovement` wallet links with before/after wallet quantity snapshots. Generated-client updates, repository writes/reads, ledger-backed assignment/return/sale-deduction writes, stock return approval workflow, wallet reconciliation, and subscription staff limits remain pending.

This phase does not yet wire live staff APIs to the durable staff profile/invite-token/lifecycle tables, configure a real email provider, add stock return approval workflow, complete wallet reconciliation, or enforce subscription staff limits from durable snapshots.

## Production Staff Invite API Phase 1

The API now exposes `retailOps.inviteStaff` as the first production bridge from admin staff management to tenant membership access.

Current behavior:

- resolves the authenticated tenant and selected store context
- allows owner, admin, and manager roles to invite staff
- supports cashier, operator, and manager invite roles
- creates or reuses a user by normalized email
- creates or refreshes an invited tenant membership
- rejects already-active staff with a conflict response
- sends the first attendant invitation email through the shared notification dispatch job
- lets authenticated invited staff activate their own cashier/operator/manager membership and record `acceptedAt`

This phase does not yet accept secure invite tokens from the durable table, configure a real email provider, or write dedicated staff profile records from live invite/onboarding mutations.

The mobile Staff invite sheet now uses `retailOps.staff` to show production attendant memberships when online and submits online attendant invites through `retailOps.inviteStaff` so the shared invite email job runs. It keeps the local staff invite queue available while offline and falls back to local staff rows if the production staff read is unavailable.

## Production Session API Phase 1

The API now exposes `retailOps.openSession` and `retailOps.closeSession` as the first production session lifecycle bridge.

Current behavior:

- opens a `CashierSession` for the authenticated user in the selected tenant/store
- requires a POS-capable role for opening and closing sessions
- prevents a duplicate open session for the same user and store
- closes only the acting user's open session
- records opening float, closing cash drawer amount, and first-phase declared transfer/card/credit amounts
- records first-phase opening inventory counts by product unit when submitted
- records first-phase closing inventory counts by product unit when submitted
- calculates receipt totals for cash, transfer, card, gross, and receipt count, plus pending credit sale totals linked to the session
- calculates cash, transfer, card, and credit variances from declared amounts against expected totals
- calculates opening and closing inventory variance from counted quantity against assigned staff wallet stock when available, otherwise central store inventory

The mobile clock-in sheet now uses `retailOps.openSession` when online and all opening inventory lines resolve to production product-unit ids. Successful production clock-ins are inserted into local rep-session state as synced with the returned cashier session id, while offline clock-ins or sessions waiting on unsynced product/unit ids continue through the local queued `rep_session_opened` path.

The mobile Closeout sheet now uses `retailOps.closeSession` when online, the open local rep session has a production cashier-session id, no local changes are pending sync, and all closing inventory lines resolve to production product-unit ids. Successful production closeouts are inserted into local closeout and rep-session state as synced without adding duplicate offline sync events, while offline closeouts, closeouts waiting on queued local changes, or closeouts waiting on unsynced product/session dependencies continue through the local queued `closeout_created` path.

Offline replay for queued `rep_session_opened` and `closeout_created` events now includes opening and closing inventory declarations when every local declaration line can resolve to a production product-unit id. Replay payload building waits on product/unit mappings and, for closeouts, the linked production cashier-session id before sending the event to production.

The API also exposes `retailOps.reviewCloseoutSession` as the first admin closeout review bridge. Owner/admin/manager-style users can mark a closed session approved or rejected with an optional note. Live review records are still stored under `Store.metadata.retailOps.closeoutReviews` until the session repository moves to the durable closeout tables.

The Prisma source schema and migration folder now declare durable `RetailOpsCloseout`, `RetailOpsPaymentDeclaration`, `RetailOpsStockDeclaration`, and `RetailOpsCloseoutReview` tables for closeout summaries, payment method declarations, opening/closing stock declarations, stock variance, damage/loss quantities, replay ids, status, and review history. Generated-client updates, repository writes/reads, sync/device/location context, posting approved stock adjustments into the ledger, and correction workflows remain pending.

## Production Session List API Phase 1

The API now exposes `retailOps.sessions` as the first production open/closed session list bridge for mobile and admin review.

Current behavior:

- resolves the authenticated tenant and selected store context
- lists open, closed, or all cashier sessions for the selected date range
- limits results to a bounded page for mobile-friendly dashboard use
- totals linked receipts by cash, transfer, card, gross, and count, plus pending credit sales linked to the session
- computes expected cash as opening float plus cash receipts
- returns rep display data, session timestamps, opening/closing float, payment declarations, closing inventory declarations, expected cash, payment and stock variances when available, and first-phase closeout review status when present

This phase does not yet include admin reassignment, forced close, repository-backed durable closeout reads, shift notes search, pagination cursors, or offline replay conflict review.

## Production Payment Reconciliation API Phase 1

The API now exposes `retailOps.paymentReconciliation` as the first production closed-session payment variance report.

Current behavior:

- resolves the authenticated tenant and selected store context
- lists closed cashier sessions for the selected date range
- totals linked receipts by cash, transfer, card, gross, and count, plus pending credit sales linked to the session
- computes expected cash as opening float plus cash receipts
- compares expected cash, transfer receipts, card receipts, and credit sales against declared closeout amounts
- returns rep display data, session timestamps, opening/closing float, receipt/credit totals, payment declarations, closing inventory declarations, expected cash, payment and stock variances, and first-phase closeout review status when present

This phase now has source schema and migration coverage for durable closeout summaries, payment declarations, stock declarations, and approval/rejection/correction review history. The live payment reconciliation read still resolves from `CashierSession`, `Receipt`, and store metadata until generated-client and repository wiring move it to those durable records.

## Production Session Requirements

- Persist cashier/rep sessions in `packages/db/prisma/models/pos.prisma`.
- Wire the durable closeout tables into session open/close, reconciliation reads, and admin review writes.
- Include device/context fields once GPS and device requirements are confirmed.
- Enforce one open session per rep/business unless an admin resolves the prior session.
- Sync offline clock-in and sale events idempotently so duplicate sessions are not created.
