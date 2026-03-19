# API Permissions

## Purpose
Define authorization and visibility rules for APIs.

## How To Use
- Update when auth roles, tenant checks, or public/private boundaries change.

## Baseline Rules
- Authenticated users may only access data for tenants they belong to.
- Dispatch providers may only manage delivery data tied to their tenant scope.
- Public marketplace and storefront endpoints expose only explicitly published data.
- Admin or internal tooling permissions are TODO until roles are formalized.

## Auth Architecture

### Tenant-Based Login
- Login is not available on the main EwaTrade website.
- Login endpoints are tenant-scoped (e.g., `POST /auth/login` with a `tenantSlug` parameter, or per-tenant subdomains).
- Merchants, staff, and drivers authenticate into their specific tenant context.
- Tokens/sessions must carry `tenantId` and `role` claims.

### Cross-Tenant Customer Auth (SSO)
- Customers use a single set of credentials valid across all EwaTrade tenant sites.
- Customer sessions are issued globally and recognized by any tenant site.
- Customer data (cart, orders, saved products) is scoped per tenant/store, but the identity credential is shared.
- Implemented via Better Auth with a global user identity + tenant-context resolution on each request.

### Registration
- Main site (`ewatrade.com`) exposes a public registration endpoint only.
- Registration creates either a tenant (merchant/logistics onboarding) or a global customer account.
- No login from the main site — after registration, users are directed to their tenant context.

## Role-Based Access

| Role | Scope | Can Access |
|---|---|---|
| `customer` | Global | Own cart/orders across stores; public storefronts |
| `merchant_owner` | Tenant | Full merchant tenant data |
| `merchant_staff` | Tenant | Store ops (orders, inventory, POS) |
| `logistics_owner` | Tenant | Full logistics tenant data |
| `driver` | Tenant | Assigned deliveries only |
| `platform_admin` | Global | All tenants (internal only) |

## Endpoint Visibility

| Endpoint Category | Auth | Notes |
|---|---|---|
| Main site activity feed | Public | Anonymized/summarized only |
| Featured listings | Public | Read only |
| Storefront discovery (products) | Public | Published data only |
| Tenant storefront (browse) | Public | Published products only |
| Tenant storefront (checkout) | Customer auth | Cross-tenant session valid |
| Merchant dashboard | Tenant auth | `merchant_owner` or `merchant_staff` |
| Logistics dashboard | Tenant auth | `logistics_owner` or `driver` |
| Platform admin | Internal auth | `platform_admin` only |
| Registration | Public | Main site only |
| Login | Tenant-scoped | Not on main site |
