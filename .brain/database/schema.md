# Database Schema

## Ownership

Prisma's file-based PostgreSQL schema under `packages/db/prisma/` is the schema
authority. Generated Prisma types and query modules are the current runtime
persistence boundary. Clients never access the database directly.

## Core Groups

- Identity/tenancy: `Tenant`, `TenantHostname`, `User`, `Account`, `Session`,
  `Verification`, `Membership`, onboarding and lead capture.
- Storefront: `Store`, `Site`, `Page`, `PageSection`, `Theme`, `Template`.
- `Store.metadata.retailOps.onboarding` holds bounded descriptive setup context,
  including the versioned Business Profile key, Products/Services/Both answer,
  order channels, team size, capture source/time, and optional Other/Mixed
  description. This JSON does not control authorization or runtime domains.
- Staff/billing/messaging: Retail Ops staff profiles and invite audit, plans,
  subscriptions/provider facts, conversations/messages/automation.
- Managed domains: encrypted `DomainRegistrantProfile`, expiring
  `DomainQuote`, Paystack-backed `DomainOrder`, registrar-owned
  `ManagedDomain`, independently verified `DomainConnection`, append-only
  `DomainEvent`, and idempotent `DomainOperationAttempt`.

## Catalog And Offerings

- `CatalogItem` is permanently `PRODUCT` or `SERVICE` and owns exactly one
  `CatalogProduct` or `CatalogService` subtype.
- Customer choices are `VariantOptionGroup`, `VariantOptionValue`,
  `SellableVariant` and selections. A Sellable Variant may carry its own
  optional description and image URL.
- `SellableOffering` owns pricing and is exactly one `ProductUnitOffering` or
  `ServiceOffering` by transactional invariant. Its nullable fixed price
  represents an incomplete Product Offering; no zero-value placeholder is
  written and the Offering cannot be sold until priced.
- `StoreOfferingAvailability` is separate from the business Catalog.
- `CatalogPriceChange` and `CatalogCommandReceipt` preserve price history and
  tenant-scoped idempotency.

## Product Units And Inventory

- `UnitDefinition` is reusable vocabulary only.
- Each `CatalogProduct` has immutable `UnitConfigurationVersion` records and a
  pointer to one Current version.
- `InventoryUnit.factor` is `DECIMAL(38,12)`; one Canonical Shared unit has
  factor 1. Alternate Transaction units share its balance. Packaged Stock units
  have independent balances.
- `StockBalanceSource` identifies Store, Product, variant, unit and custody.
- Product creation may seed separate Canonical Shared opening balances for each
  variant through exact per-variant opening quantities. Blank quantities create
  no opening movement or available stock.
- `StockReservation`, `StockOperation`, `StockMovement`, `StockCount`,
  `StockTransfer`, `InventoryCloseout` and their lines/entries form the exact
  inventory ledger.

## Commerce

- `Customer` is a tenant-scoped saved contact with a required name, optional
  phone/email, and unique normalized phone/email identities per Tenant.
- `Tenant.lastCommercialOrderSequence` is the atomic business-wide allocator
  for new human-facing Order numbers. Existing legacy references remain
  unchanged; new Orders use `ORD-001` with minimum three-digit padding.
- `CommercialOrder` and `CommercialOrderLine` hold monetary/order state.
  `CommercialOrder.createdByUserId` preserves the account that took the Order.
- `CommercialOrder.deliveryDueAt` is nullable for historical rollout; new
  Order commands default it to now.
- `CommercialOrderReminderSettings` stores Store-scoped enablement plus
  day-before and same-day policy. `CommercialOrderReminderDelivery` records
  idempotent recipient-level Pending, Sent, or Failed reminder attempts.
- `CommercialOrderPayment` is the append-only payment/refund ledger.
  `recordedByUserId` preserves the account that received or recorded each
  payment fact. Orders retain service charge and paid-total projections for
  efficient balance reads.
- `OfferingSnapshot` is immutable and retains item, variant, Offering, pricing,
  exact quantity, unit, factor, configuration and balance meaning.
- `ProductFulfillment` links fulfillment to reservation and Stock Operation.
- `CommercialOrderFulfillmentCommand` binds each tenant-scoped bulk
  fulfillment identity to its payload hash and original result.
- `ProductReturn` records disposition and optional restock operation.

## Service Operations And Customer Access

- `ServiceIntake`/Line records direct staff intake before confirmation.
- `ServiceStoreSettings` owns express surcharge/turnaround and automatic
  customer-notification defaults. Intake snapshots the selected service level,
  service charge, initial payment and customer channel.
- `ServiceJob` contains exact `ServiceJobLine` allocations. Line work state is
  authoritative; assignments, due commitments, notes, exceptions, rework and
  work events retain history. Customer handoff is separately timestamped and
  attributed.
- `ServiceEvidence` and audit events retain purpose, media type, local/queued/
  uploading/available/failed/revoked state and private/published/revoked
  visibility. Public availability requires trusted asset/safety fields.
- `ServiceRequestForm`, `ServiceRequest`/Line, `ServiceQuote`, immutable Quote
  Versions/Lines and `CustomerTrackingAccess` implement public intent,
  quotation, acceptance and safe tracking.
- Notification Intents carry a required channel and optional scheduled time;
  Manual Shares and Delivery Attempts remain separate from Service work state.

## Service Commerce Capability Profile

- `ServiceCommerceStoreProfile` is one optional, disabled-by-default profile
  per Store and always carries both Tenant and Store identity.
- Its explicit capability flags cover intake, Quote, booking, payment, pickup,
  delivery, service completion, web, staff, WhatsApp and Progressive Catalog.
  `catalogAdoptionMode` is `PROGRESSIVE` or `INVENTORY_MANAGED`; reusable
  procure-to-order policy is independent.
- Status/revision and attributed activation/deactivation fields support
  fail-closed readiness plus optimistic concurrency.
- `policyRestrictedCapabilities` is a server-owned, restriction-only
  compatibility input. Setup cannot write it and it cannot grant permission;
  current `ServiceCommercePolicyDecision` records are authoritative.
- `ServiceCommerceStoreAuditEvent` appends actor, reason, event type and
  previous/current JSON snapshots for every profile create, settings update,
  activation and deactivation.
- `CommerceInquiry` is a narrow Product pre-order aggregate, not a universal
  Customer Request. It carries Tenant/Store, idempotent client identity and
  payload hash, channel, bounded customer contact, demand reason, summary and
  the explicit received-to-converted/terminal lifecycle.
- `CommerceInquiryLine` stores one ordered bounded Product description and an
  optional exact requested quantity under the same Tenant/Store/Inquiry scope.
  It has no automatic Catalog publication, stock or Order side effect.
- `CommerceInquiryAuditEvent` appends actor, scoped lifecycle transition,
  optional reason and Quote/conversion attribution. It contains no provider
  payload or private Prescription data.
- `CommerceQuoteSourceType.COMMERCE_INQUIRY` lets immutable Quote versions
  reference the Inquiry without replacing Service or Prescription source
  identity.
- `CommerceQuoteReplayAccessToken` stores at most one rotatable digest per
  Quote Version under Tenant/Store scope. It recovers an idempotent Inquiry
  issuance response without storing raw bearer tokens or invalidating the
  version's original access token.
- `ServiceCommercePolicyDecision` stores one revisioned current decision for
  Tenant, Store, vertical, Store jurisdiction, channel and typed subject. It
  keeps private evidence/licence/approval references, reviewer, effective and
  expiry timestamps, reason, outcome and revocation state. Store deletion is
  restricted until these governed facts are removed deliberately.
- `ServiceCommercePolicyAuditEvent` is append-only safe evidence of policy
  reads, create/update/revoke commands and denied overrides. It records scope,
  actor, purpose, observed outcome and decision revision, never raw evidence or
  customer content.
- `CommerceInquiry.vertical` binds each Inquiry to the policy vertical used by
  its source projection, Quote command and public acceptance. It does not merge
  Service and Pharmacy aggregate lifecycles.

## Offline

- `Tenant.metadata.offlineOperationsEnabled` controls offline access and
  `Tenant.metadata.offlineApprovalRequired` controls staff staging; absent
  values preserve enabled and approval-off behavior respectively.
- `OfflineDevice`, `OfflineDeviceRevocation`, `OfflineCommand` and
  `OfflineConflictReview` are the only durable offline records.
- Commands retain client id, type, schema version, payload hash, dependencies,
  attempted/authoritative state and typed conflict/review outcomes.
- Server persistence enriches a staged command payload with the authenticated
  staff actor id so later approval retains original Order/payment attribution.
- Historical command enum values remain in storage, but current API writes and
  replay accept only `COMMERCIAL_ORDER`.

## Managed Domains

- `DomainRegistrantProfile` is one encrypted legal-owner payload per Tenant.
  Only display name, masked email, country and consent facts are plaintext.
- `DomainQuote` snapshots registrar wholesale cost/currency, retail NGN price,
  optional exchange rate and renewal indication until expiry or consumption.
- `DomainOrder` separates Paystack state from registrar state and retains the
  exact quote, accepted terms, payment reference and tenant idempotency key.
- `ManagedDomain` is registrar lifecycle state. `DomainConnection` is
  ownership/DNS/Vercel state; registration success does not imply connection
  success.
- `DomainEvent` is append-only audit. `DomainOperationAttempt` protects
  provider writes and retains uncertain outcomes for reconciliation.
- `TenantHostname` remains the storefront routing projection and is written
  only after a Domain Connection becomes active.

## Removed Prototype Schema

## Prescription Commerce

- `PrescriptionStoreSettings`, `PrescriptionStoreRole`, and Store audit/channel
  records own activation, policy, verified professional assignments, and public
  intake readiness.
- `PrescriptionRequest` owns source/contact facts, privacy restriction,
  revisioned private media, OCR transcription/lines, catalogue mappings,
  pharmacist decisions, and append-only audit history.
- Attendant corrections create a new `PrescriptionTranscription` revision and
  supersede, but never overwrite, the prior OCR/reviewer-visible revision.
- `CommerceQuote`, immutable `CommerceQuoteVersion`, and
  `CommerceQuoteLine` are the shared source-typed Quote aggregate used by both
  Service and Prescription flows. A Quote has exactly one typed source.
- Payment intent/provider/refund records and pickup/delivery aggregates retain
  idempotent operational history without storing card data. Delivery addresses
  and retrievable pickup codes are encrypted; digests remain for comparisons.
- Successful hosted refunds also append a `CommercialOrderPayment` refund fact
  and update the derived Order balance in the same scoped transaction.
- `PrescriptionPaymentRefund.providerDispatchState` and
  `providerDispatchClaimedAt` form a durable provider-attempt seam. New work is
  `READY`, a claimed/indeterminate attempt is `OUTCOME_UNKNOWN`, a repeated
  uncertain attempt is `NEEDS_REVIEW`, and a matched provider result is
  `CONFIRMED`; `providerDispatchCount` bounds automated requeue.
- WhatsApp Connection, Store binding, inbound event, redacted routing alert,
  connection audit, Embedded Signup session, communication intent/attempt, and
  quick-action records implement dynamic pharmacy-owned direct Meta routing.
- Communication attempts retain normalized sent/delivered/read/failed receipt
  state and timestamps matched by Connection and provider message id.
- Retention policies independently cover raw media, transcripts, messages,
  tokens, addresses, audit evidence, and commercial records. Expiry preserves
  immutable lifecycle/accounting facts while redacting mutable content and
  customer identity.
- `PrescriptionSensitiveAccessEvent` records Store-scoped transcript,
  customer-data, pharmacist-decision, credential, and break-glass access.
  `PrescriptionIncidentControl` supplies personal, time-bounded break-glass
  grants and their required post-use reviews.
- `PrescriptionPrivacyRequest` retains the verifying user, verification time,
  and bounded identity-verification evidence reference.
- Usage events provide de-identified Store and Tenant reporting with platform,
  Meta, payment-provider, delivery, tax, and pharmacy-revenue amounts kept in
  separate nullable fields.

## Removed Prototype Schema

The current Prisma schema no longer declares old Product/ProductVariant,
InventoryItem, unit-template/price-history, stock delivery/movement, staff
wallet, cart/order/POS session, Product share-link, legacy customer bridge, delivery
bridge, legacy Service or generic sync-run/event models. There are no runtime
fallbacks or dual writes.

Historical migration files still describe those past tables. The cutover
migration `20260719092903_clean_generic_operations_cutover` was generated by
Prisma and applied after the approved destructive local development reset.
The local schema is in sync and neutral Unit Definitions are seeded. Production
rollout remains guarded by the migration-history repair described in
`.brain/database/migrations.md`.
# QA tenant lifecycle

- `Tenant` stores classification, source QA domain, marked time, and purge-start
  time.
- Global `QaPurgeRun` stores actor, timestamps, status, aggregate deletion
  counts, and error category without deleted tenant identities or contents.
