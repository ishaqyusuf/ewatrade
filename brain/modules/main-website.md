# EwaTrade Main Website

The EwaTrade main website (`ewatrade.com`) is the platform's public face. It is **not** a conventional ecommerce site. It is a hybrid of three zones: advertisement, storefront discovery, and live operation activity.

## Purpose

- Attract merchants, logistics companies, and drivers to join the platform
- Surface participating tenants and their products/services
- Show the platform is alive through real-time activity
- Funnel visitors to register — not to log in

## Three Core Zones

### 1. Advertisement Zone

Paid or curated featured listings for:
- **Featured Stores** — merchant storefronts promoted on the main page
- **Featured Logistics Providers** — dispatch companies with capacity or special offers
- **Featured Drivers** — individual drivers or small fleets seeking orders

Featured listings link out to the respective tenant's own website or profile.

### 2. Storefront Discovery Zone

A browsable feed of products and store offers, sourced from:
- Stores with active **promotions**
- Stores with active **subscriptions** (paid visibility on main site)
- Curated or top-rated store products

Rules:
- Only publicly-listed products are shown
- Product cards link to the tenant's storefront (not a checkout on main site)
- Merchant name and storefront link always visible

### 3. Operation Activity Feed

A live/near-live stream of platform events showing the platform is active and growing. Events include:

| Event Type | Display Example |
|---|---|
| `order.placed` | "New order placed at Kemi's Boutique" |
| `user.registered` | "A new store owner joined EwaTrade" |
| `product.registered` | "12 new products added by Lagos Wears" |
| `dispatch.started` | "Dispatch started for order #4821" |
| `dispatch.completed` | "Order delivered in Lekki · 38 min" |
| `product.viewed` | "ProductName viewed 240 times today" |
| `product.saved` | "ProductName saved by 15 shoppers" |

Activity is anonymized or summarized — no customer PII exposed.
Activity can be real-time (WebSocket/SSE) or batched (polling interval).

## Entry Points on Main Site

- **Register** — the only auth action on the main site ("Get on board")
- No login form on the main site
- Login is tenant-based: customers/merchants log in via their specific tenant site or a tenant-scoped login URL

## Registration Flow

```
Visitor → "Register to Get Onboard" →
  Select role: Store Owner | Logistics Provider | Driver →
  Complete onboarding → Tenant provisioned → Redirected to tenant dashboard
```

## What the Main Site Does NOT Do

- No direct product checkout or cart
- No login (login is tenant-based)
- No customer account management
- No order management

## Tech Notes

- Main site is a Next.js app (part of the monorepo)
- Activity feed powered by Trigger.dev events pushed to a feed service
- Featured listings managed via an admin/self-serve promotion system
- Product discovery zone reads from a public read model (marketplace index)
