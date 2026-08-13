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
- Channel-neutral attribution adds nullable consent version and provider event
  identity plus contact opt-in. Public/provider-created Inquiries keep
  `createdByUserId = null`; staff preserves its authenticated user.
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
- `CommerceQuoteOption` stores one immutable, mutually exclusive commercial
  choice inside a Quote Version, including its customer-safe label, exact
  monetary components, availability and fulfilment facts. Every new Quote
  Version now persists at least one option. Existing immutable Versions are not
  rewritten: the runtime safely projects their directly attached lines and
  Version totals as one synthetic default Option.
- `CommerceQuoteOptionSelection` stores at most one idempotent customer choice
  per Quote Version. The server verifies the selected Option belongs to that
  Version inside the selection transaction. Selection is not acceptance and
  cannot itself create an Order, reservation or payment.
- `CommerceQuoteLine.quoteOptionId` additively associates a line with its
  owning Option. It remains nullable only for existing-version compatibility
  during expand-contract migration.
- `CatalogSourceLineLink` binds one Tenant/Store-scoped Service Request,
  Prescription Request or Commerce Inquiry line to an existing Offering using
  a content fingerprint and idempotent command payload hash. Generic Service/
  Inquiry provenance is an unverified source snapshot; Prescription provenance
  is human-verified. The stored label is the operator-confirmed Catalog alias,
  never an automatically trusted copy of customer wording.
- `CatalogVerifiedAlias` stores Store-scoped, human-attributed ranking aliases.
  Identical aliases may point to competing Offerings and never auto-merge them.
- `CatalogAvailabilityAttestation` records tracked configured inventory,
  expiring manual procure-to-order or unavailable evidence. It may reference an
  existing Unit Configuration and Stock Balance revision but never creates
  either while reading or quoting. Available attestations own a committed
  maximum quantity enforced again during Quote preparation.
- `CatalogPricePromotion` attributes the explicit promotion of one immutable
  Quote line price to the reusable Tenant-wide Offering price, its appended
  `CatalogPriceChange`, affected Stores, actor and reason.
- `SellableOffering.revision` is the optimistic concurrency boundary for
  managed graduation, reusable-price changes and later publication.
- Product graduation completes the existing Offering with a Product Unit
  Offering, Unit Configuration Version, Store Balance Source and explicit
  `OPENING_STOCK` operation/movement. Service graduation instead completes its
  Service Offering with duration plus typed work/booking policy and never
  creates inventory records.
- Service Commerce Catalog audit events distinguish `CATALOG_GRADUATED` from
  the later `CATALOG_PUBLISHED` command so completion never implies public
  availability.
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
- `ServiceRequest` now records typed `WEB | STAFF | WHATSAPP` origin, nullable
  staff creator, consent/contact opt-in and provider event identity.
  `PrescriptionRequest` adds contact opt-in and provider event identity while
  retaining its own source, consent, role, safety and clinical lifecycle.
  Tenant/provider-event unique constraints make webhook replay additive and
  fail closed across Stores.

## Customer Channels And Generic Request Media

- `ServiceCommerceStoreTeamAssignment` grants a Store-scoped `ATTENDANT` or
  `QUOTE_APPROVER` capability only to an accepted active Tenant
  Membership. Suspension/revocation and append-only audit never grant a Tenant
  role or Pharmacy credential.
- `ServiceCommerceQuoteReleasePolicy` stores one revisioned Store policy with
  exact `ATTENDANT_CAN_RELEASE | APPROVAL_REQUIRED` mode, selected active
  approver Membership ids, actor and reason. Existing Stores without a row use
  the typed attendant-release compatibility default during expansion; any
  persisted mode requires an active Store attendant assignment.
- `ServiceCommerceQuoteReleaseCommandReceipt` binds a Tenant client operation
  identity to its payload hash and resulting policy revision.
  `ServiceCommerceQuoteReleasePolicyAuditEvent` preserves every mode/approver
  transition without customer or bearer-capability content.
- `ServiceCommerceQuoteApproval` owns one exact Quote-Version decision with
  `PENDING | APPROVED | REJECTED | SUPERSEDED`, requester/decider Memberships,
  policy revision, stable decision identity and timestamps. Quote Version is
  unique so a decision cannot float to another revision, total, Option or
  Store. `ServiceCommerceQuoteApprovalAuditEvent` is append-only transition
  evidence. Serializable decisions retry one conflict; direct reads/commands
  and the pending queue atomically supersede stale pending records without
  rewriting approved or rejected history.
- `CustomerEntryPoint` owns one stable opaque public capability per Store.
  Publish/revoke uses optimistic revisions and append-only audit; current
  channel and policy choices resolve at visit time, so sender rotation does not
  change the public URL or QR code.
- Existing `WhatsAppConnection` and `WhatsAppStoreBinding` tables remain the
  physical compatibility models during expand-contract. Business-neutral
  Customer Channels exports own new callers without a risky table rename.
- `ServiceCommerceMediaAsset` owns private object, provider retrieval,
  signature/type/size, safety, retry and retention facts. Provider connection,
  provider media and object references remain server-private.
- `ServiceCommerceSourceAttachment` binds an asset to a typed current Service,
  Prescription or Commerce Inquiry source/version. Revisioned
  `ServiceCommerceVerifiedObservation` records attributable human meaning;
  `CatalogSourceLineLink.verifiedObservationId` preserves that provenance.
- `ServiceCommerceMediaAuditEvent` is append-only for reference, storage,
  retrieval, safety, viewing, observation, retention and deletion decisions.
  Pharmacy may link the generic asset from `PrescriptionMedia` while retaining
  stricter clinical controls.
- Store profiles add disabled-by-default `attachmentsEnabled` and server-owned
  `attachmentsProviderReady`. `WhatsAppInboundEvent.routeVertical` records the
  resolved vertical without making Communications own domain routing.

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

## Store Conversations

- `StoreConversationGuestIdentity` is an opaque device identity, not a User or
  verified person. Purpose-bound `StoreConversationGuestCredential` rows store
  only SHA-256 bearer digests, status, expiry and last-use time.
- `StoreConversationGuestAccess` is the additive participant authorization for
  a Guest Identity and one exact conversation. It preserves the original owner
  while allowing an independently revocable mobile participant.
- `StoreConversationTransfer` is a ten-minute, digest-only web-to-app handoff.
  It snapshots Tenant/Store/conversation/source credential, payload hash,
  claimed installation digest and redeemed Guest/credential references. Raw
  transfer, installation and target credential values are never persisted.
- `StoreConversation` is immutably Tenant/Store/Guest scoped and uniquely
  allows one conversation per Store and Guest Identity. It stores lifecycle,
  moderation, current assignee/revision and the latest append-only sequence.
- `StoreConversationMessage` is an append-only customer/store/system timeline
  row with an exact channel, bounded body, deterministic per-conversation
  sequence and authoritative occurrence time.
- `StoreConversationRequestLink` associates a message/conversation with one
  typed authoritative Commerce Inquiry, Service Request or Prescription
  Request plus the accepted source revision. An unlinked customer message is a
  private staged message, not a universal Request. The link does not duplicate
  source lifecycle or sensitive vertical content.
- `StoreConversationCommandReceipt` binds a conversation/client-operation id to
  a payload hash and original message/source/assignment result, making customer
  send, claim, release, handoff, reassignment and Store reply replay-safe.
- `StoreConversationAssignmentEvent` and `StoreConversationAuditEvent` retain
  append-only actor/time/from/to assignment and lifecycle evidence. Assignment
  actor is nullable only for system release after current Store-attendant
  eligibility is revoked.
- `StoreConversationEscalationEvent` is an append-only, Tenant/Store-scoped
  operational fact for unclaimed, overdue, abandoned, failed-response and
  unavailable-membership recovery. Open/resolved lifecycle uses bounded
  kinds/reasons and never stores customer message content.
- `StoreConversation` snapshots customer/reply occurrence and `responseDueAt`
  for deterministic SLA projection while authoritative messages remain the
  append-only timeline.

Ticket 03 adds `REQUEST_SELECTED`/`REQUEST_LINKED` enum facts and integer
`revision @default(1)` fields to `CommerceInquiry` and `ServiceRequest`.
Established lifecycle/Quote commands increment those versions; Prescription
retains `currentMediaRevision`. Ticket 04 adds the assignment/SLA/escalation
fields and events without contracting those sources. The migration ledger
reports all 50 artifacts applied on verified development Neon. No production
schema claim is made.

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
- Generic Service Commerce customer-notification attempts retain an immutable
  provider Connection id beside the provider operation id. Webhook callbacks
  append tenant/store-scoped delivered/read/failed receipt rows without
  reopening current Store binding selection.
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

## Service Commerce Reporting And Truth Snapshots

- `ServiceCommerceUsageEvent` is an immutable external usage/cost fact scoped
  by Tenant, Store, source and a Tenant-unique deduplication key. Optional
  Connection, recipient market, message category and billing-owner snapshots
  support aggregate attribution. Each cost amount is nullable: null is unknown,
  while zero is a recorded zero. Reconciliation status/source/time support one
  guarded pending-to-reconciled transition without rewriting identity.
- `ServiceCommerceReportReadAuditEvent` is append-only evidence for aggregate
  report and drill-down access. It stores actor, Tenant, validated optional
  Store, fixed purpose/source domain, allowlisted section, half-open report
  window, authorization result/reason and occurrence time. It deliberately has
  no report payload, customer/request/media/provider identifiers or raw error.
  A validated optional Store reference uses restrictive deletion so scoped
  history cannot be rewritten; Tenant-wide reads retain a null Store. Denial
  reasons include `RATE_LIMITED`, recorded when the actor/Tenant rolling-minute
  read budget is exhausted.
- `CatalogSourceLineLink.resolutionCapturedAt` marks when
  `createdAsPrivateDraft` became an authoritative resolution snapshot.
  Pre-marker rows remain null and report as unknown; current mutable Offering
  status is never used to reconstruct them.
- `CommerceQuoteLine.catalogPriceEvaluationAt` marks when suggestion/effective
  price facts were captured. Suggested amount/source/scope/effective time and
  the override boolean remain immutable with the Quote line. Pre-marker lines
  contribute to an explicit unknown bucket.
- `CommercialOrder.completedAt` is the immutable completion occurrence for new
  Product, pickup, delivery, Service-handoff and booking-completion writes. A
  completed legacy Order without this marker remains retained and is counted as
  unavailable legacy sale evidence rather than being assigned a mutable
  `updatedAt` timestamp.

## Service Commerce Booking

- `ServiceBookingStoreSettings` owns Store timezone, reminder defaults and a
  revision. `ServiceBookingOfferingConfig` owns Store + Offering duration,
  lead/hold/horizon, capacity and immutable policy revision sources.
- `ServiceBookingResource`, `ServiceBookingOfferingResource`,
  `ServiceBookingAvailabilityRule` and
  `ServiceBookingAvailabilityException` model selectable Store resources and
  their recurring/exception availability without inventory semantics.
- `ServiceBookingHold` is expiring capacity, not a booking. `ServiceBooking`
  owns the confirmed operational lifecycle plus Request/Quote/Order/Service Job
  links and immutable timezone/payment/cancellation/refund snapshots.
- `ServiceBookingAccessCapability` stores only an opaque-token digest with
  purpose, status, expiry and state revision. `ServiceBookingEvent` and
  `ServiceBookingConfigurationEvent` preserve typed history;
  `ServiceBookingNotificationIntent` is the durable provider-neutral outbox.

## Service Commerce Customer Actions

- `ServiceCommerceCustomerActionCapability` stores the exhaustive action,
  channel, source/version, exact target/version/Option, label/consequence,
  confirmation rule, expiry, payload identity and only the opaque-token digest.
- `ServiceCommerceCustomerActionExecution` binds one client operation id and
  payload hash to the capability's completed or recovery result so replay
  cannot repeat or change the command.
- `ServiceCommerceCustomerNotificationIntent` stores a protected recipient,
  message/template/service-window facts and bounded retry state.
  `ServiceCommerceCustomerNotificationAttempt` and
  `ServiceCommerceCustomerNotificationReceipt` retain provider-neutral
  delivery evidence without raw capabilities or customer content.

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
