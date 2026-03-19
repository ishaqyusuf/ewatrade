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
- `User` (customer) → many `Cart` (one per store/tenant they shop at)
- `User` (customer) → many `Order` across tenants

### Commerce
- `Store` → many `Product`
- `Product` → many `ProductVariant`
- `ProductVariant` → many `InventoryItem` (per location)
- `Order` → many `OrderItem`
- `Order` → zero or one `DeliveryRequest`

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

## Tenant Rules
- Merchant data and dispatch data must be scoped through tenant-aware joins and filters.
- Shared/public read models should be derived from explicitly public entities only.
- `User` identity is global; all commerce data (cart, orders) is tenant/store-scoped.
- `ActivityEvent` payloads must be anonymized before persistence.

## TODO
- Replace conceptual relationships with schema-backed references once Prisma models are defined.
- Confirm `TenantSite` cardinality (one per tenant, or allow multiple sites per tenant in future).
- Define how `PromotedProduct` interacts with existing `Marketplace` public read model.
