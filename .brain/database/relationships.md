# Database Relationships

## Catalog To Inventory

`Tenant -> CatalogItem -> CatalogProduct|CatalogService`

`CatalogItem -> SellableVariant -> SellableOffering -> ProductUnitOffering|ServiceOffering`

`CatalogProduct -> UnitConfigurationVersion -> InventoryUnit`

`Store + SellableOffering -> StoreOfferingAvailability`

`Store + CatalogProduct + SellableVariant + InventoryUnit + Custody -> StockBalanceSource`

Every Product Unit Offering points to one Inventory Unit from the Product's
Current configuration. A Service Offering has no inventory relation.
When Product creation provides per-variant opening quantities, each non-zero
quantity creates its own Canonical Shared `StockBalanceSource` and opening
movement for that Sellable Variant.

## Inventory Ledger

`StockOperation -> StockMovement -> StockBalanceSource`

Reservations, counts, transfers, transformations, custody moves, closeouts,
fulfillment, returns and corrections all resolve to explicit Balance Sources
and immutable movements. Configuration/version/unit snapshots prevent later
catalog edits from changing historical meaning.

## Commerce And Work

`Tenant -> Customer`

`Tenant.lastCommercialOrderSequence -> CommercialOrder.orderNumber`

`CommercialOrder -> CommercialOrderLine -> OfferingSnapshot`

Product lines may link to reservations, fulfillments and returns. Tracked
Service lines may allocate into one or more `ServiceJobLine` records. Job Lines
belong to `ServiceJob`; charge-only Service lines allocate no work.

`CommercialOrder -> CommercialOrderPayment`

`CommercialOrder -> CommercialOrderFulfillmentCommand`

`Store -> CommercialOrderReminderSettings`

`CommercialOrder -> CommercialOrderReminderDelivery`

`CommercialOrder.createdByUserId -> User`

`CommercialOrderPayment.recordedByUserId -> User`

`Store -> ServiceStoreSettings`

`Tenant + Store -> ServiceCommerceStoreProfile -> ServiceCommerceStoreAuditEvent`

`Tenant + Store -> CommerceInquiry -> CommerceInquiryLine|CommerceInquiryAuditEvent`

`CommerceInquiry -> CommerceQuote -> CommerceQuoteVersion -> CommercialOrder`

`CommerceQuoteVersion -> CommerceQuoteReplayAccessToken`

Payment/refund facts derive the Order balance. Store Service settings are read
and snapshotted during Intake; later setting changes do not rewrite existing
Order charges.
Bulk Product fulfillment commands retain their payload hash, fulfilled-line
count, resulting Order status, and actor so retries cannot repeat inventory
effects or reuse one identity for a different Order.
Order reminder deliveries also point to Tenant and Store. Their unique
Order/timing/recipient-email identity prevents duplicate daily email delivery.

The Service Commerce profile is Store-unique but carries Tenant explicitly.
Every repository read/write predicates both ids; audit events retain the same
Tenant/Store pair and the profile relation so cross-Store or cross-Tenant
configuration cannot be inferred from a global profile id.

Commerce Inquiry is a separate Commerce-owned Product uncertainty aggregate.
It has no polymorphic relation to ServiceRequest or PrescriptionRequest and no
universal CustomerRequest parent. Quote issuance moves only a ready Inquiry to
quoted; accepted Quote Order creation moves only that scoped quoted Inquiry to
converted in the same bounded transaction.
The optional replay-token child contains only a rotatable digest and explicit
Tenant/Store scope; both original and current replay tokens resolve to the same
current Quote Version.

`Tenant + Store -> ServiceCommercePolicyDecision -> ServiceCommercePolicyAuditEvent`

Each decision is unique by Tenant, Store, vertical, jurisdiction, channel and
subject. Policy evaluation still predicates Tenant plus Store before matching
the Store's current country code. Audit events retain their own Tenant/Store
scope and may outlive a revoked decision revision; evidence contents remain on
the protected decision and never enter public/source projections.

New Order numbers are allocated once across the Tenant rather than per Store.
The counter increment and Order creation share one database transaction, so a
failed creation rolls the increment back and concurrent Stores cannot receive
the same reference.

Actor ids are immutable audit references. Tenant-scoped read projections
resolve names, emails, and membership roles when available without replacing
or weakening those stored ids.

Customer directory records are merged with Order customer snapshots at the
application projection boundary. Orders do not point to mutable Customer rows;
their captured customer facts remain immutable historical context. Named Order
creation, including offline replay, creates or reuses the matching directory
record inside the Order transaction without adding a mutable Order relation.

## Requests, Quotes And Tracking

## Prescription Commerce Relationships

`Tenant + Store -> PrescriptionStoreSettings -> PrescriptionStoreRole`

`PrescriptionChannel -> PrescriptionRequest -> PrescriptionMedia -> PrescriptionTranscription -> PrescriptionTranscriptionLine -> PrescriptionLineMapping`

`PrescriptionRequest -> PrescriptionPharmacistReview -> CommerceQuote -> CommerceQuoteVersion -> CommerceQuoteLine -> CommercialOrder`

`CommercialOrder -> PrescriptionPaymentIntent|PrescriptionPickupFulfillment|PrescriptionDeliveryAddress -> PrescriptionDeliveryAssignment`

`Tenant -> WhatsAppConnection -> WhatsAppStoreBinding -> Store`

`WhatsAppConnection + Store + external customer + bounded context -> WhatsAppInboundEvent -> PrescriptionRequest`

Connections may bind multiple Stores. Active routing resolves the recipient
connection first, then exactly one active Store binding. Pending replacement
bindings coexist with the old active binding until readiness promotion. Quick
actions and public capabilities point to one operation through digests; they do
not form a global customer identity.

Privacy and retention records point to Tenant/Store and affected requests.
Privacy verification evidence and verifier identity remain on the privacy
request. Retention claims carry Tenant and Store together through every
candidate read and redaction write.
Erasure removes provider media first, then redacts mutable sensitive records;
legal holds and active incident freezes block destructive completion.

`Tenant + Store + actor -> PrescriptionSensitiveAccessEvent -> PrescriptionRequest?|PrescriptionIncidentControl?`

Break-glass grants belong to one actor, Tenant, and Store, expire within one
hour, and link grant/use/review evidence without broadening ordinary roles.

## Requests, Quotes And Tracking

`ServiceRequestForm -> allowed SellableOffering`

`ServiceRequest -> ServiceRequestLine`

`ServiceQuote -> ServiceQuoteVersion -> ServiceQuoteLine`

Accepting the current Quote version creates the Commercial Order/work graph
once. `CustomerTrackingAccess` points to a Job and exposes an allowlisted public
projection; it does not expose internal notes, staff identities, private media
or raw storage identifiers.

## Evidence And Communication

Evidence belongs to a Job and optionally a Job Line. Audit events preserve
capture, upload, publication and revocation decisions. Notification Intent,
Manual Share and Delivery Attempt are separate records so provider delivery
never mutates work or payment state. Scheduled reminders point to the Job and
are cancelled/replaced when a promise changes or becomes obsolete.

## Tenancy

Every owned aggregate is tenant-scoped. Store-scoped records carry Store ids;
public access uses opaque tokens and repository-projected allowlists. Business
hostnames are storefront-only; the authenticated dashboard is a shared host.

`User -> Membership -> Tenant` is many-to-many. Creating another owned
business writes a new merchant Tenant, active OWNER Membership, and first Store
in one transaction; it never reuses the active Tenant's Store or operational
records.

## Managed Domains

`Tenant -> DomainRegistrantProfile`

`Tenant + Store -> DomainQuote -> DomainOrder`

`DomainOrder -> ManagedDomain -> DomainConnection`

`DomainOrder|ManagedDomain|DomainConnection -> DomainEvent|DomainOperationAttempt`

The Order owns payment and registration intent. The Managed Domain owns
registrar lifecycle. The Connection owns TXT verification and Vercel/DNS/SSL
state. Only an active Connection projects to the Tenant's primary Storefront
Hostname, so a registrar or hosting failure cannot silently replace the free
storefront address.
# QA purge boundary

- The QA marker lives on the tenant aggregate root and covers stores,
  memberships, operational data, and owned resources.
- `QaPurgeRun` is intentionally non-tenant so its counts-only receipt survives
  tenant deletion.
