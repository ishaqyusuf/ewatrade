# Database Relationships

## Catalog To Inventory

`Tenant -> CatalogItem -> CatalogProduct|CatalogService`

`CatalogItem -> SellableVariant -> SellableOffering -> ProductUnitOffering|ServiceOffering`

`CatalogProduct -> UnitConfigurationVersion -> InventoryUnit`

`Store + SellableOffering -> StoreOfferingAvailability`

`Store + CatalogProduct + SellableVariant + InventoryUnit + Custody -> StockBalanceSource`

Every Product Unit Offering points to one Inventory Unit from the Product's
Current configuration. A Service Offering has no inventory relation.

## Inventory Ledger

`StockOperation -> StockMovement -> StockBalanceSource`

Reservations, counts, transfers, transformations, custody moves, closeouts,
fulfillment, returns and corrections all resolve to explicit Balance Sources
and immutable movements. Configuration/version/unit snapshots prevent later
catalog edits from changing historical meaning.

## Commerce And Work

`CommercialOrder -> CommercialOrderLine -> OfferingSnapshot`

Product lines may link to reservations, fulfillments and returns. Tracked
Service lines may allocate into one or more `ServiceJobLine` records. Job Lines
belong to `ServiceJob`; charge-only Service lines allocate no work.

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
never mutates work or payment state.

## Tenancy

Every owned aggregate is tenant-scoped. Store-scoped records carry Store ids;
public access uses opaque tokens and repository-projected allowlists. Business
hostnames are storefront-only; the authenticated dashboard is a shared host.
