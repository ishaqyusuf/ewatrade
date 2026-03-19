# Database Relationships

## Purpose
Capture high-level relationships between major entity groups.

## How To Use
- Update when entity relationships, cardinality, or tenant boundaries change.

## Core Relationships

### Tenant & Identity
- `Tenant` → many `Store` (merchant tenant)
- `Tenant` → many `DispatchProvider` (logistics tenant)
- `Tenant` → many `User` through `Membership`
- `Tenant` → zero or one `TenantSite` (generated website)
- `Tenant` → zero or one `StoreKind` (merchant tenant only)
- `Tenant` → zero or one `PaymentGatewayAccount` (payment subaccount)
- `User` (customer) → many `Cart` (one per store/tenant they shop at)
- `User` (customer) → many `Order` across tenants
- `User` (customer) → many `TenantCustomer` (one per tenant they've interacted with)
- `TenantCustomer` → one `User` (nullable for walk-in customers without an account)
- `TenantCustomer` → one `Tenant`

### Business Types
- `StoreKind` → one `BusinessCategory`
- `Template` → many `StoreKind` (via `compatibleKinds` array)

### Commerce
- `Store` → one `StoreKind`
- `Store` → many `Product`
- `Product` → many `ProductVariant`
- `ProductVariant` → many `InventoryItem` (per location)
- `Order` → many `OrderItem`
- `Order` → zero or one `DeliveryRequest`
- `Order` → zero or one parent `Order` (for split orders from main site cart)
- `Order` → many `OrderStatusEvent`
- `MainSiteCart` → one `User` (nullable for guests)

### Fulfillment
- `DeliveryRequest` → many `Bid`
- `DispatchProvider` → many `Bid`
- `Bid` → zero or one `Assignment`
- `Assignment` → many `TrackingEvent`

### Storefront / Website Builder
- `TenantSite` → many `Page`
- `Page` → many `Section`
- `TenantSite` → one `Theme`
- `Template` → many `Section` (reusable layout)

### Main Site — Advertisement & Discovery
- `FeaturedListing` → one `Tenant` (the featured entity)
- `PromotedProduct` → one `Product` + one `Tenant`

### Main Site — Activity Feed
- `ActivityEvent` → optional `Tenant` (some events are platform-wide)
- `ActivityEvent` does not link to individual `User` records (no PII)

### POS & Self-Service
- `CashierSession` → one `Tenant` + one `User` (cashier)
- `SelfServiceSession` → one `Tenant` + one `User` (customer)
- `SelfServiceSession` → zero or one `Order` (created on cashier approval)

### Legal
- `LegalAcceptance` → one `User`
- `LegalAcceptance` → zero or one `Tenant` (null for customer-only acceptances)

### WhatsApp
- `WhatsAppChannel` → zero or one `Tenant` (null for platform-level bot)
- `Conversation` → one `Tenant` + zero or one `User` + zero or one `Order` (active order session)

## Tenant Rules
- Merchant data and dispatch data must be scoped through tenant-aware joins and filters.
- Shared/public read models should be derived from explicitly public entities only.
- `User` identity is global; all commerce data (cart, orders, TenantCustomer) is tenant/store-scoped.
- `ActivityEvent` payloads must be anonymized before persistence.
- `TenantCustomer` data is only visible to the tenant it belongs to — no cross-tenant sharing.

## TODO
- Replace conceptual relationships with schema-backed references once Prisma models are defined.
- Confirm `TenantSite` cardinality (one per tenant confirmed for now; multiple sites may be a future feature).
- Define how `PromotedProduct` interacts with existing `Marketplace` public read model.
- Decide: does a walk-in `TenantCustomer` (no userId) auto-link to a `User` if they register with the same phone number later?
