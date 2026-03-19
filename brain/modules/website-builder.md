# Website Builder

## Overview
Every tenant on the platform (store owner, logistics company, or individual rider) gets their own generated website. Sites are independent, branded, and powered by a shared builder engine.

---

## Tenant Types That Can Have Websites

| Tenant Type | Website Purpose |
|---|---|
| **Merchant (store)** | Product catalog, promotions, store info, contact, order |
| **Logistics / Dispatch company** | Service zones, fleet info, request delivery, driver onboarding |
| **Individual rider** | Rider profile, coverage zones, ratings, contact |

---

## Template Selection — Driven by Business Kind

Templates are not generic. They are **filtered by the tenant's `storeKind`** (set during onboarding).

```
Tenant.storeKind = "restaurant"
  → templates show: menu, food gallery, table booking, order CTA, opening hours

Tenant.storeKind = "hotel_booking"
  → templates show: room listings, booking calendar, amenities, location map

Tenant.storeKind = "fashion_wears"
  → templates show: lookbook, product grid, size guide, promotions

Tenant type = "logistics"
  → templates show: service zones map, fleet info, delivery request form

Tenant type = "rider" (driver with own site)
  → templates show: rider profile, coverage area, ratings, contact
```

Template compatibility: stored on `Template.compatibleKinds` (array of `StoreKind` slugs). A template with an empty `compatibleKinds` is shown to all.

---

## Site Structure

```
TenantSite
  └── Pages
        └── Sections
              └── Section Config (content, layout, visibility)
        └── Theme Tokens (fonts, colors, spacing, button styles)
  └── Domain (subdomain or custom domain)
  └── Published status
  └── storeKind / tenantType (determines template set)
```

---

## Theme System

Themes control:
- Font family (from approved Google Fonts list)
- Primary / accent / surface colors
- Button border radius
- Spacing scale

Tenants override a subset of tokens; the rest fall back to platform defaults.
Stored in `TenantSite.themeConfig` as JSON.

---

## Section Types

### Store (merchant) sections
| Section | Description |
|---|---|
| Hero / Banner | Full-width banner with CTA |
| Product grid | Catalog browsing |
| Featured products | Curated product highlight |
| Promotion strip | Sale banners, countdown timers |
| Menu (food) | Food menu with categories and prices |
| About / Brand story | Store narrative |
| Contact / Location | Address, map, phone, hours |
| Reviews / testimonials | Customer reviews |
| CTA | Call-to-action block |

### Logistics / Dispatch sections
| Section | Description |
|---|---|
| Service zone map | Delivery coverage areas |
| Fleet showcase | Vehicle types and capacity |
| Request delivery CTA | Form or WhatsApp link |
| Driver onboarding CTA | Join the fleet |
| Stats / proof | Orders completed, areas covered |

### Rider sections
| Section | Description |
|---|---|
| Rider profile | Photo, name, rating, bio |
| Coverage zones | Operating cities |
| Vehicle info | Type, capacity |
| Contact / hire | WhatsApp, phone |

---

## Domain Strategy

- Default: `{tenantSlug}.ewatrade.com`
- Custom domain support: tenant sets a CNAME → EwaTrade issues TLS via Let's Encrypt
- Both subdomain and custom domain can be active simultaneously

---

## Rules

- Each tenant controls only their own site
- Sites must be explicitly published before going live
- Theme and content changes are draft-saved until published
- Storefront products/services only shown if marked public by the tenant
- Template choice can be changed post-launch (content is preserved; layout re-maps)
