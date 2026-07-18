# Retail Ops Stock To Closeout Flow

## Purpose

Document the end-to-end operating workflow for Retail Ops: receive stock, define units, convert stock, assign or make stock available to reps, clock in, sell, close out, reconcile, and sync.

## Flow Overview

1. Receive or create stock.
2. Define product units and variants.
3. Convert or rebag stock when needed.
4. Invite and prepare attendants.
5. Rep clocks in and confirms opening inventory.
6. Rep records sales.
7. Customer details are captured or reused.
8. Offline events queue when connectivity is poor.
9. Rep or owner closes the day.
10. Admin reviews variance and reconciles.
11. Synced production records feed reports and subscription usage.

## 1. Receive Or Create Stock

The owner creates the first product or records later stock intake.

Required product setup:

- product name
- primary unit name
- primary unit price
- optional sub-units or variants
- variant prices
- starting stock

Expected system behavior:

- Starting stock creates an auditable inventory movement.
- Product and stock records are scoped to the active business.
- Product creation respects subscription limits.
- Offline creation queues a sync event after the user has logged in once.

Production API phase 1:

- `retailOps.createProduct` creates product/unit records and opening inventory balances.
- Product setup writes durable opening-stock movement rows and durable price-history rows when the migration is available, with metadata fallback for rollout compatibility.
- `retailOps.recordStockIntake` increments current inventory for an existing product variant/unit.
- `retailOps.recordUnitConversion` moves stock from one unit balance to another unit balance on the same product.
- Stock intake remains a balance update bridge. Stock adjustment and unit conversion write durable movement rows when the stock-ledger migration and replay keys are available, while undeployed environments keep metadata fallback.

## 2. Define Units And Variants

Products can be sold in a primary unit or in variants/sub-units.

Examples:

- Bag
- Half bag
- Quarter bag
- Kilogram
- Carton
- Piece

Rules:

- Product is the parent entity.
- Each sellable unit has its own inventory balance.
- Convertible units require a positive ratio to the product base unit.
- Standard feed presets provide Bag, Half bag, Quarter bag, and Kilogram ratios
  for 25 kg and 50 kg sealed bags.
- A product with variants can show the parent row as a label/header.
- Variant rows are selectable sale units.
- Products without variants can sell through the primary unit.
- Sales snapshot unit name and price at sale time.
- Historical reports must not recalculate old sales from current product price.

## 3. Convert Or Rebag Stock

A business may convert primary stock into variants or smaller units.

Example:

- 1 bag can become 2 half bags.
- 1 bag can become 4 quarter bags.
- 1 feed bag can become 25 or 50 kilograms according to its selected preset.
- 50 bags can become 100 half bags.

Expected system behavior:

- Conversion records a stock movement out of the source unit.
- Conversion records a paired stock movement into the target unit.
- Conversion validates available stock.
- The client enters only a whole source quantity; the server derives the whole
  target quantity from configured ratios.
- Missing ratios, fractional target outputs, cross-product conversions, and
  same-unit conversions are rejected before either balance changes.
- Online and offline conversion retries carry an external id and return the
  original result instead of applying the movement twice.
- Conversion is visible in movement history and reports.
- Production conversion should be transactional and ledger-backed.

## 4. Invite And Prepare Attendants

Owners invite attendants by email.

Expected system behavior:

- Invite is scoped to the business.
- Invite respects subscription staff limits.
- Attendant receives setup/download instructions.
- Attendant should only access permitted business data.
- Production membership and permission checks must happen server-side.

Production API phase 1:

- `retailOps.staff` lists active, invited, or suspended Retail Ops staff memberships for owner/admin/manager review.
- `retailOps.inviteStaff` invites or re-invites a staff member into the selected tenant membership.
- Owner, admin, and manager roles can invite cashier, operator, or manager users.
- Active existing memberships are blocked as duplicates.
- Staff invites enforce tenant staff limits, generate one-time acceptance tokens, store only token hashes, revoke prior active invite tokens, and enqueue shared notification delivery after membership persistence.
- Public invite-token resolution returns bounded business/email/role context without exposing the token, while authenticated OTP onboarding activates the invited membership.
- Staff stock wallets and custody assignment/return exist as a metadata-backed first bridge. Durable stock wallet tables, ledger-backed custody movements, return approval, and broader reconciliation remain future hardening.

## 5. Clock In And Confirm Opening Inventory

A rep starts the sales day by clocking in.

Opening inventory confirmation captures:

- attendant
- business
- session timestamp
- product/unit
- expected quantity
- confirmed quantity
- variance
- optional note

Rules:

- Normal sales should be blocked until the current attendant has an open session.
- Duplicate open sessions should be prevented unless an admin resolves the old session.
- Opening variance must be visible to admin.
- Production sync must be idempotent so offline clock-in does not duplicate sessions.

Production API phase 1:

- `retailOps.openSession` opens an authenticated user's store session with an opening cash float.
- Duplicate open sessions for the same user and store are blocked.
- Opening inventory declarations are accepted on session open and persisted through the session metadata bridge, with durable declaration rows available when the migration is wired.

## 6. Record Sales

The rep creates a sale from available inventory.

Sale capture includes:

- attendant
- active session
- customer name
- product
- unit or variant
- quantity
- unit price snapshot
- total
- payment method
- sync status

Current MVP payment methods:

- cash
- transfer

Rules:

- Quantity must not exceed available local stock.
- Sale deducts stock from the selected unit bucket.
- Sale creates a stock movement.
- Sale upserts the customer book entry when a customer name is provided.
- Production sales should deduct from rep stock wallet or custody balance, not unrelated central stock.

Production API phase 1:

- `retailOps.createSale` accepts product variant, quantity, customer details, payment method, optional cashier session, optional external id, optional note, and optional sold timestamp.
- It maps the sale to `Order`, `OrderItem`, `InventoryItem`, and `Receipt`.
- It atomically deducts current variant stock with the order and receipt write.
- Paid cash, transfer, and card sales create receipts.
- Credit sales are recorded as completed sales with pending payment and no receipt.
- `retailOps.creditSales` lists pending in-person credit sales for owner/admin follow-up.
- Sale replay uses external ids for idempotency, and mobile offline replay reconciles returned production order ids into local sale records.
- Customer-book persistence exists for synced in-person sale customer upserts and shared-link checkout identities.
- Stock-wallet sale deduction, richer sale ledger movement history, and full closeout approval-table cutover remain future production hardening.

## 7. Capture Customers

Customers can enter the system through in-person sales or product share links.

In-person flow:

- Rep types a customer name or selects from the customer book.
- New names are stored in the local customer book.

Shared-link flow:

- Owner or attendant generates a product link.
- Customer opens a web page with product metadata.
- Customer selects variant/unit and quantity.
- First-time customer registers with name, email, and password.
- Returning customer logs in.
- Pending order request notifies customer, admin, and responsible rep.

Production API phase 1:

- `retailOps.sharedProduct` resolves an active product share token and returns web product-page data.
- `retailOps.createSharedProductOrderRequest` creates a pending order request from a shared product link.
- Shared-link order requests enqueue first-phase customer and merchant email notifications through the shared notification dispatch job.
- `retailOps.productShareLinks` lists generated product links for the selected tenant/store.
- `retailOps.sharedLinkOrderRequests` lists pending or historical order requests for follow-up, with creator-only filtering for cashier/operator users.
- `retailOps.createProductShareLink` creates an opaque web-first product URL for an existing product, preferring the tenant storefront hostname and falling back to the configured storefront base URL.
- `retailOps.deactivateProductShareLink` marks an existing generated link inactive.
- The storefront route `/p/[tenantSlug]/[storeSlug]/[productSlug]?share=...` renders the first public product page, link-preview metadata, generated preview image, variant selection, quantity field, customer fields, and pending order-request submission.
- The storefront server action resolves first-time customer registration and returning login through Better Auth before creating the pending order request; raw passwords are not stored in order metadata.
- Durable `ProductShareLink` rows, view/order events, order requests, stock reservations, notification audit, delivery requests, and daily analytics rollups are used first when available, with product/order metadata fallback while migrations roll out.
- Pending shared-link orders reserve selected stock, feed platform customer identity into the customer book, enqueue and audit customer/merchant notifications, and can be completed or cancelled through protected follow-up with payment plus pickup/delivery outcome capture.
- Live email-provider configuration, provider-native payment capture, provider bidding/selection, richer customer onboarding beyond direct shared-link checkout, and richer tracking UX remain future production hardening.

## 8. Queue Offline Events

Offline work is allowed after the user has logged in once.

Event types include:

- product setup
- stock intake
- unit conversion
- rep session opened
- sale created
- customer upsert
- staff invited
- share link created/deactivated
- closeout created

Sync envelope requirements:

- client event id
- tenant/business id
- actor user id
- device id
- event type
- payload
- created timestamp
- dependency ids
- retry state

Production sync must be idempotent and must surface failed/conflict states.

## 9. Close Day

Closeout compares expected values against declarations.

Closeout captures:

- open sales since latest closeout
- expected cash
- expected transfer
- declared cash
- declared transfer
- cash variance
- transfer variance
- closing stock by product/unit
- stock variance
- note
- approval status

Expected behavior:

- Closeout creates a pending review record.
- Closeout closes the local attendant session.
- Admin can review flagged payment or stock variance.
- Production closeout should support approval, rejection, and correction workflows.

Production API phase 1:

- `retailOps.closeSession` closes the acting user's open cashier session.
- Close computes receipt totals for cash, transfer, card, gross, and receipt count.
- Cash variance compares declared closing cash to opening float plus cash receipts.
- `retailOps.sessions` lists open, closed, or all cashier sessions with receipt totals, expected cash, and available variance summary.
- `retailOps.paymentReconciliation` lists closed sessions with the same receipt totals, expected cash, declared closing cash, and cash variance for admin review.
- Source schema and migration coverage now exists for durable closeout summaries, opening/closing stock declarations, payment method declarations, and review history.
- Live closeout, reconciliation, and admin review still use the first-phase `CashierSession`, `Receipt`, and store-metadata bridge until repository wiring moves to the durable tables.

## 10. Reconcile And Report

Admin reports should show:

- daily sales
- sales by attendant
- sales by product/unit
- stock balances
- payment reconciliation
- credit sales
- opening and closing variances
- stock movement history
- share-link activity
- pending sync and sync failures

Production reports should be query-backed and tenant-scoped.

## 11. Subscription And Limits

Subscription state controls operating limits.

Initial gated actions:

- business/store creation
- product creation
- staff invitation
- offline device registration
- report history range

UI may disable blocked actions locally, but production APIs must enforce entitlements.

## Reconciliation Invariants

- Every stock increase or decrease should be explainable by a movement.
- Every sale should snapshot product, unit, price, rep, customer, and payment method.
- Every normal sale should belong to an open rep session.
- Every closeout should compare expected against declared payments and stock.
- Offline replay must not duplicate sales, stock movements, sessions, or closeouts.
- Reports must use sale-time snapshots for historical sales.

## Open Questions

- Does clock-in require GPS, device id, both, or neither for MVP?
- Do credit sales enter the first release or a later paid tier?
- Are stock wallets required before production launch or immediately after?
- Which report exports are required first: CSV, PDF, both, or none?
- Which industries should ship as setup templates beyond feed/grain examples?
