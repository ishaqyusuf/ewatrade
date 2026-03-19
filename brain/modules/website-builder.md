# Website Builder

Every tenant on the platform (store owner or logistics/dispatch company) can generate their own website. Tenant websites are independent, branded storefronts or service pages powered by the same builder engine.

## Tenant Types That Can Have Websites

- **Store (Merchant) websites** — product catalog, promotions, store info, contact, order
- **Logistics / Dispatch websites** — service zones, fleet info, request delivery, partner onboarding

## Site Structure

```
TenantSite
  └── Pages
        └── Sections
              └── Section Config (content, layout, visibility)
        └── Theme Tokens (fonts, colors, spacing, button styles)
  └── Domain (subdomain or custom domain)
  └── Published status
```

## Themes

Themes control:
- fonts
- colors
- spacing
- button styles

## Templates

Templates combine sections into full site layouts. Merchant templates differ from dispatch/logistics templates.

## Section Types (planned)

- Hero / Banner
- Product grid / featured products
- Promotion strip
- About / Brand story
- Contact / Location
- Delivery zones (logistics)
- Fleet showcase (logistics)
- Reviews / testimonials
- CTA (call-to-action)

## Domain Strategy

- Default: `{tenantSlug}.ewatrade.com`
- Custom domain support planned

## Rules

- Each tenant controls only their own site
- Sites must be explicitly published before going live
- Theme and content changes are draft-saved until published
- Storefront products / services shown only if marked public by the tenant
