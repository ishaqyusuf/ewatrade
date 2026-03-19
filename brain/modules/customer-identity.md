# Customer Identity

## Core Model

**One login works everywhere on EwaTrade.**

A customer registers once (from any EwaTrade surface — main site, tenant storefront, or app). That single identity (`User`) is shared across all tenant stores. When a customer interacts with a new tenant for the first time, a `TenantCustomer` record is automatically created to represent that customer within that tenant's context.

---

## Entity Design

### `User` (global identity)
- Created once per person
- Shared across all tenants
- Fields: `fullName`, `email`, `phone`, `passwordHash`, `profilePhoto`, `defaultDeliveryAddress`, `dateOfBirth`, `notificationPreferences`
- Auth managed by Better Auth (supports password + social: Google, Apple)

### `TenantCustomer` (per-tenant relationship)
- Created automatically when a customer first places an order, adds to cart, or is looked up within a tenant
- Links `User ↔ Tenant`
- Stores tenant-specific customer data

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `userId` | FK → User | global identity |
| `tenantId` | FK → Tenant | |
| `customerCode` | string | tenant-specific ref (e.g. `#C-0042`) |
| `notes` | string | merchant's internal notes about this customer |
| `tags` | string[] | e.g. `["vip", "wholesale"]` |
| `loyaltyPoints` | int | optional future loyalty program |
| `totalOrders` | int | cached count |
| `totalSpend` | decimal | cached sum in store currency |
| `firstSeenAt` | datetime | |
| `lastSeenAt` | datetime | |
| `isWalkIn` | boolean | true if created from POS walkin (may have no User link initially) |
| `walkinName` | string | for walk-in customers without an account |
| `walkinPhone` | string | |

**Walk-in with no account:** `isWalkIn = true`, `userId = null`, `walkinName`, `walkinPhone` captured. If the customer later registers, `userId` can be linked.

---

## Flow: Customer First Interaction With a Tenant

```
Customer visits store-a.ewatrade.com for first time
  └── Already logged in (global session from Better Auth)
  └── No TenantCustomer record exists for this tenant
  └── Customer adds to cart
  └── System auto-creates TenantCustomer { userId, tenantId }
  └── All future orders at this store reference this TenantCustomer
```

---

## Multi-Store Checkout (Main Site)

1. Customer shops on `ewatrade.com`, adds products from multiple stores
2. Cart is logically partitioned by `tenantId`
3. At checkout, the cart is split: one `Order` per merchant
4. For each merchant, if no `TenantCustomer` exists → auto-created at checkout
5. Separate payment transactions per merchant (see `payment-integration.md`)
6. Customer sees all sub-orders in a unified "My Orders" view on main site

### `MainSiteCart`
Temporary cart scoped to the main site session (not tenant-scoped).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `userId` | FK → User | null for guest |
| `sessionId` | string | for guests |
| `items` | JSON / CartItem[] | each item carries `tenantId`, `storeId`, `productId`, `variantId`, `qty` |
| `expiresAt` | datetime | auto-cleared after 7 days of inactivity |

---

## Customer-Facing Surfaces

| Surface | Auth Required | What Customer Sees |
|---|---|---|
| Main site browse | No | Products, stores, marketplace |
| Main site checkout | Yes (prompt to login if guest) | Multi-store cart, split payment |
| Tenant storefront | No | Store catalog |
| Tenant checkout | Yes | Single-store cart, payment |
| "My Orders" (main site) | Yes | All orders across all stores |
| "My Orders" (tenant site) | Yes | Orders at this store only |
| WhatsApp | Phone number / OTP | Order status, chat ordering |

---

## Sign In / Sign Up on Main Site

The main EwaTrade website now supports:
- **Sign up** — new customer registration
- **Sign in** — returns customer to their cross-tenant session
- Social login: Google, Apple
- After sign-in, customer is returned to their previous context (cart, page)

This replaces the earlier decision that the main site had no login.

---

## Walk-In Customer Feature

A walk-in customer without an EwaTrade account can still use the POS self-service flow. See `brain/modules/pos-cashier.md` for the full walk-in QR checkout flow.

Walk-in customers can optionally be prompted to register after their purchase, linking future orders to a `User` account.

---

## Privacy Rules
- `User` PII is never included in `ActivityEvent` records (main site feed)
- `TenantCustomer` data is only accessible by the tenant it belongs to
- Cross-tenant customer data is never shared between merchants
- Customer can request deletion of their data per NDPR / GDPR requirements
