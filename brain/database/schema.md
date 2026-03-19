# Database Schema

## Purpose
Track the conceptual schema and schema ownership rules for the platform.

## How To Use
- Update when entities, ownership rules, or schema tooling changes.

## Schema Ownership
- `Prisma` is the source of truth for schema definitions.
- Prisma schema changes should generate and track migrations.
- `Drizzle` should not become a competing schema definition layer.

## Core Entity Groups

### Tenant & Identity
- `Tenant` — merchant or logistics/dispatch organization (type field: `merchant` | `logistics`)
- `User` — platform-wide user identity (global, not per-tenant)
- `Session` — user session (managed by Better Auth)
- `Account` — auth provider link per user
- `Membership` — link between a user and a tenant (with role)

### Commerce
- `Store` — a merchant's store (belongs to merchant tenant)
- `Product` — a product in a store
- `ProductVariant` — variant of a product (size, color, etc.)
- `InventoryItem` — stock tracking per variant per location
- `Cart` — customer cart (per store)
- `Order` — placed order
- `OrderItem` — line item on an order

### Fulfillment
- `DeliveryRequest` — order fulfillment request to dispatch network
- `DispatchProvider` — a logistics tenant's dispatch entity
- `Bid` — dispatch provider bid on a delivery request
- `Assignment` — confirmed assignment of a bid
- `TrackingEvent` — location/status event for an active delivery

### Storefront / Website Builder
- `TenantSite` — the generated website for a tenant (merchant or logistics)
  - Fields: `tenantId`, `type` (merchant | logistics), `subdomain`, `customDomain`, `published`, `themeConfig`
- `Page` — a page within a tenant site
- `Section` — a content section within a page (type, config, order)
- `Theme` — theme token set (fonts, colors, spacing, buttons)
- `Template` — reusable section/page layout template

### Main Site — Advertisement & Discovery
- `FeaturedListing` — a paid or curated featured entry on the main site
  - Fields: `tenantId`, `listingType` (store | logistics | driver), `priority`, `activeFrom`, `activeTo`, `metadata`
- `PromotedProduct` — a product surfaced in the main site's storefront discovery zone
  - Fields: `productId`, `tenantId`, `source` (promotion | subscription), `activeFrom`, `activeTo`

### Main Site — Activity Feed
- `ActivityEvent` — a platform-level event for the main site activity feed
  - Fields: `type` (see below), `payload` (anonymized/summarized), `tenantId` (optional), `occurredAt`
  - Event types: `order.placed`, `user.registered`, `product.registered`, `dispatch.started`, `dispatch.completed`, `product.viewed`, `product.saved`
  - No customer PII stored in payload

### POS
- `CashierSession` — a cashier's active POS session
- `Receipt` — receipt for a POS transaction
- `BarcodeEvent` — barcode scan event during a session

### Messaging
- `Conversation` — a messaging thread
- `Message` — a message in a conversation
- `AutomationEvent` — a triggered automation (e.g., WhatsApp order update)

## Cross-Cutting Rules
- Tenant-owned records require `tenantId`.
- Public marketplace and storefront data must be explicitly flagged for exposure (`isPublic`, `publishedAt`, etc.).
- Activity feed payloads must never contain customer PII.
- Audit fields (`createdAt`, `updatedAt`) should exist on operational entities.
- Customer identity (`User`) is global; customer commerce data (cart, orders) is per-tenant/store.

## TODO
- Define exact table names and field sets once the Prisma schema is created.
- Confirm whether merchant and dispatch organizations share one `Tenant` table with a type discriminator or use separate tables.
- Define retention/cleanup strategy for `ActivityEvent` records.
