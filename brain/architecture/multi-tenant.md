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

## Tenant Types

- **Merchant tenant** — owns stores, products, orders, cashier sessions
- **Logistics / Dispatch tenant** — owns dispatch providers, bids, drivers, assignments
- Both tenant types can generate their own website via the Website Builder

## Data Isolation Rules

- Tenants cannot access other tenant data
- Marketplace browsing and storefront discovery remain public
- Public reads must be limited to explicitly published data
- Tenant-owned entities require `tenantId` on every record

## Tenant Websites

Every tenant can publish their own website:
- Merchant tenants get a store website (catalog, promotions, orders)
- Logistics tenants get a service website (zones, fleet, delivery requests)
- Default URL: `{tenantSlug}.ewatrade.com`
- Custom domain support is planned

## Authentication Architecture

### Login is Tenant-Based

- There is no login on the main EwaTrade website
- Login entry points live on tenant sites or a tenant-scoped URL (e.g., `{tenant}.ewatrade.com/login` or `login.ewatrade.com?tenant={slug}`)
- Merchants, cashiers, and logistics staff authenticate into their specific tenant

### Shared Customer Credentials (Cross-Tenant SSO)

- Customers use **one set of credentials** across all EwaTrade tenant sites
- A customer authenticated on `store-a.ewatrade.com` is also authenticated on `store-b.ewatrade.com`
- The shared session/identity layer is managed by Better Auth
- Customer identity is global; customer data (cart, orders) is per-tenant/store
- Customers do not need to register separately on each tenant site

### Role Breakdown

| Actor | Auth Scope |
|---|---|
| Merchant owner/staff | Tenant-scoped (own tenant only) |
| Logistics staff/driver | Tenant-scoped (own tenant only) |
| Customer | Cross-tenant (shared credential, per-store data) |
| Platform admin | Global (internal only) |

## Registration

- All registration starts from the main EwaTrade website
- Merchant and logistics onboarding provisions a new tenant
- Customer registration can happen from any tenant site or the main site
- After registration, users are redirected to their appropriate tenant context

## Public vs Private Surfaces

| Surface | Auth Required |
|---|---|
| Main site (ewatrade.com) | No |
| Tenant storefront (browsing) | No |
| Tenant storefront (checkout/order) | Customer auth |
| Tenant dashboard | Tenant-scoped auth |
| Platform admin | Internal auth |
