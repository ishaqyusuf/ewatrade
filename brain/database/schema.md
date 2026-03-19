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
  - Fields: `name`, `type`, `slug`, `status` (active | pending_verification | suspended), `country`, `state`, `city`, `address`, `phone`, `email`, `registrationNumber`, `taxId`, `verifiedAt`
- `User` — platform-wide user identity (global, not per-tenant)
  - Fields: `fullName`, `email`, `phone`, `passwordHash`, `role` (customer | platform_admin), `dateOfBirth`, `profilePhoto`, `defaultDeliveryAddress`, `notificationPreferences`
- `Session` — user session (managed by Better Auth)
- `Account` — auth provider link per user (social login: Google, Apple)
- `Membership` — link between a user and a tenant (with role)
  - Fields: `userId`, `tenantId`, `role` (merchant_owner | merchant_staff | logistics_owner | driver), `status` (active | invited | suspended)

### Onboarding & Verification
- `OnboardingProgress` — tracks completion of multi-step onboarding per user/tenant
  - Fields: `userId`, `tenantId`, `step`, `completedSteps`, `status` (in_progress | complete)
- `VerificationDocument` — uploaded document for identity/business verification
  - Fields: `tenantId`, `userId`, `type` (gov_id | business_reg | drivers_license | vehicle_reg | vehicle_insurance | proof_of_residence), `fileUrl`, `status` (pending | approved | rejected), `reviewedAt`, `reviewNote`
- `BankAccount` — payout details for a tenant or driver
  - Fields: `tenantId`, `bankName`, `accountNumber`, `accountHolderName`, `accountType` (savings | current), `isDefault`
- `DriverProfile` — individual driver/rider details under a logistics tenant
  - Fields: `userId`, `tenantId`, `dateOfBirth`, `homeAddress`, `emergencyContactName`, `emergencyContactPhone`, `govIdType`, `govIdNumber`, `govIdExpiry`, `status` (pending_verification | verified | rejected | suspended)
- `DriverVehicle` — vehicle associated with a driver
  - Fields: `driverProfileId`, `type` (bicycle | motorcycle | car | van | truck), `make`, `model`, `year`, `plateNumber`, `color`
- `ServiceZone` — delivery zones declared by a logistics tenant or driver
  - Fields: `tenantId`, `driverProfileId` (optional), `city`, `region`, `intercityEnabled`

### Business Types
- `BusinessCategory` — broad business grouping (food_beverage, retail_goods, services, hospitality, health, logistics)
  - Fields: `slug`, `label`, `icon`, `order`
- `StoreKind` — specific business type (restaurant, pharmacy, fashion_wears, etc.)
  - Fields: `slug`, `label`, `categoryId`, `templateHints` (string[]), `featureFlags` (json), `icon`

### Customer Identity
- `TenantCustomer` — relationship between a global User and a specific Tenant
  - Fields: `userId` (nullable), `tenantId`, `customerCode`, `notes`, `tags`, `loyaltyPoints`, `totalOrders`, `totalSpend`, `firstSeenAt`, `lastSeenAt`, `isWalkIn`, `walkinName`, `walkinPhone`

### Legal
- `LegalAcceptance` — records user agreement to platform ToC/Privacy Policy
  - Fields: `userId`, `tenantId` (nullable), `documentType` (terms_of_service | privacy_policy | acceptable_use), `documentVersion`, `acceptedAt`, `ipAddress`

### Payment
- `PaymentGatewayAccount` — merchant's payment subaccount with a gateway provider
  - Fields: `tenantId`, `provider` (paystack | flutterwave), `subaccountCode`, `businessName`, `settlementBank`, `accountNumber`, `percentageCharge`, `isActive`

### Commerce
- `Store` — a merchant's store (belongs to merchant tenant)
  - Added: `storeKindId` FK → StoreKind
- `Product` — a product in a store
- `ProductVariant` — variant of a product (size, color, etc.)
- `InventoryItem` — stock tracking per variant per location
- `Cart` — customer cart (per store, per user)
- `MainSiteCart` — temporary cart scoped to main site session (items carry tenantId/storeId)
  - Fields: `userId` (nullable), `sessionId`, `items` (JSON), `expiresAt`
- `Order` — placed order
  - Added: `source` (storefront | main_site | whatsapp | pos | manual | walkin), `fulfillmentMethod` (delivery | pickup | own_delivery), `paymentMethod` (online | cash_on_delivery | bank_transfer | pos_terminal), `staffNotes`, `parentOrderId` (for split orders)
- `OrderItem` — line item on an order
- `OrderStatusEvent` — audit log of order status transitions
  - Fields: `orderId`, `fromStatus`, `toStatus`, `actorId`, `note`, `occurredAt`

### Fulfillment
- `DeliveryRequest` — order fulfillment request to dispatch network
- `DispatchProvider` — a logistics tenant's dispatch entity
- `Bid` — dispatch provider bid on a delivery request
- `Assignment` — confirmed assignment of a bid
- `TrackingEvent` — location/status event for an active delivery

### Storefront / Website Builder
- `TenantSite` — the generated website for a tenant (merchant, logistics, or rider)
  - Fields: `tenantId`, `type` (merchant | logistics | rider), `subdomain`, `customDomain`, `published`, `themeConfig`
- `Page` — a page within a tenant site
- `Section` — a content section within a page (type, config, order)
- `Theme` — theme token set (fonts, colors, spacing, buttons)
- `Template` — reusable section/page layout template
  - Added: `compatibleKinds` (StoreKind slug array — empty = all kinds)

### WhatsApp
- `WhatsAppChannel` — WhatsApp Business API connection per tenant
  - Fields: `tenantId` (nullable for platform bot), `phoneNumberId`, `wabaId`, `isActive`, `webhookSecret`

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
  - Fields: `tenantId`, `cashierId`, `openingFloat`, `closingFloat`, `status`, `startedAt`, `endedAt`
- `SelfServiceSession` — customer QR self-scan session
  - Fields: `tenantId`, `userId`, `qrCode`, `status` (scanning | ready_for_scan | cashier_review | approved | payment_pending | paid | completed | cancelled), `cartItems` (JSON), `tipAmount`, `expiresAt`
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
- Confirmed: `Tenant` uses a shared table with `type` discriminator (merchant | logistics).
- Define retention/cleanup strategy for `ActivityEvent` records.
- Resolve: embedded address fields vs a separate `Address` entity (consider reuse across User, Tenant, Store, DriverProfile).
- Choose file storage provider for `VerificationDocument.fileUrl` (Cloudinary recommended for image docs; S3 for PDF).
- Seed `BusinessCategory` and `StoreKind` lookup data as part of database migrations.
- Decide: `Tenant.storeKindId` nullable? (nullable for logistics tenants; required for merchant tenants).
