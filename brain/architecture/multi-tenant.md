# Multi-Tenant Model

Each merchant and dispatch/logistics company is a tenant.

All business data must contain:
```
tenantId
```

Examples:
```
Store       → merchant tenant
Product     → store → merchant tenant
DeliveryBid → dispatch tenant
TenantSite  → merchant or logistics tenant
```

---

## Tenant Types

- **Merchant tenant** — owns stores, products, orders, cashier sessions
- **Logistics / Dispatch tenant** — owns dispatch providers, bids, drivers, assignments
- Both tenant types can generate their own website via the Website Builder

---

## Data Isolation Rules

- Tenants cannot access other tenant data
- Marketplace browsing and storefront discovery remain public
- Public reads must be limited to explicitly published data
- Tenant-owned entities require `tenantId` on every record

---

## Tenant Websites

Every tenant can publish their own website:
- Merchant tenants get a store website (catalog, promotions, orders)
- Logistics tenants get a service website (zones, fleet, delivery requests)
- Individual riders get a personal dispatch profile site
- Default URL: `{tenantSlug}.ewatrade.com`
- Custom domain support is planned
- Templates are selected based on `storeKind` (see `brain/modules/business-types.md`)

---

## Authentication Architecture

### Main Site Has Sign In and Sign Up

The main EwaTrade website (`ewatrade.com`) supports:
- **Sign up** — for new customers (and registration entry point for merchants/riders)
- **Sign in** — for returning customers to access their cross-tenant dashboard, orders, and the main site multi-store cart

This means the main site is a legitimate commerce surface for customers, not just a showcase.

### Tenant-Based Login (Staff & Owners)

- Merchants, cashiers, and logistics staff authenticate into their specific tenant
- Login entry: `{tenant}.ewatrade.com/login` or `login.ewatrade.com?tenant={slug}`
- Staff do NOT log in via the main site — they use their tenant URL

### Shared Customer Credentials (Cross-Tenant SSO)

- Customers use **one set of credentials** across all EwaTrade surfaces (main site + all tenant storefronts)
- A customer authenticated on `store-a.ewatrade.com` is also authenticated on `store-b.ewatrade.com` and on `ewatrade.com`
- Shared session/identity layer managed by Better Auth
- Customer identity is global; customer commerce data (cart, orders) is per-tenant/store
- `TenantCustomer` record is auto-created per tenant on first interaction

### Role Breakdown

| Actor | Auth Scope |
|---|---|
| Merchant owner/staff | Tenant-scoped (own tenant only) |
| Logistics staff/driver | Tenant-scoped (own tenant only) |
| Customer | Cross-tenant (shared credential, per-store data) |
| Platform admin | Global (internal only) |

---

## Registration

- Customer registration starts from: main site, any tenant storefront, or the mobile app
- Merchant/logistics/rider onboarding starts from: main EwaTrade website (ewatrade.com/register)
- Merchant and logistics onboarding provisions a new tenant
- After registration, users are redirected to their appropriate context

---

## Public vs Private Surfaces

| Surface | Auth Required |
|---|---|
| Main site (ewatrade.com) — browse | No |
| Main site (ewatrade.com) — sign in/up | Auth |
| Main site — multi-store cart & checkout | Customer auth |
| Tenant storefront (browsing) | No |
| Tenant storefront (checkout/order) | Customer auth |
| Tenant dashboard | Tenant-scoped auth |
| Platform admin | Internal auth |

---

## Central Customer Database

`User` is the global identity (one per person). `TenantCustomer` links a user to a specific tenant with store-specific context (notes, loyalty points, order history within that store). See `brain/modules/customer-identity.md`.
