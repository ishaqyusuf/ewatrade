# Design System

## Status
**Not yet defined.** This document captures the intended direction and requirements.

---

## Purpose
A shared design system ensures visual consistency across:
- EwaTrade main website (`ewatrade.com`)
- Tenant storefronts (merchant websites)
- Merchant dashboard
- POS software (Tauri desktop)
- Mobile app (Expo / React Native)
- Logistics / dispatch tenant websites

---

## Recommended Approach

### Component Library: shadcn/ui
- Built on Radix UI primitives + Tailwind CSS
- Copy-paste components (no runtime dependency lock-in)
- Fully customisable — aligns well with multi-theme tenant requirements
- Works across Next.js, React Native (via NativeWind), and Tauri

### Token System: CSS Custom Properties via Tailwind
Design tokens defined as CSS variables, consumed by Tailwind classes.

#### Core Token Categories
| Category | Examples |
|---|---|
| **Color** | `--color-primary`, `--color-surface`, `--color-text`, `--color-border` |
| **Typography** | `--font-sans`, `--font-heading`, `--font-mono` |
| **Spacing** | Uses Tailwind's default scale |
| **Radius** | `--radius-sm`, `--radius-md`, `--radius-lg` |
| **Shadow** | `--shadow-sm`, `--shadow-card` |

---

## Token Layers

### Layer 1 — Platform Design System (EwaTrade brand)
Tokens for the main site, admin, and platform UI. Fixed — not customisable by tenants.

### Layer 2 — Tenant Theme Tokens
Each tenant can customise their storefront website by overriding a subset of tokens:
- Primary brand color
- Font family (from approved font list)
- Button radius
- Surface color

These are stored in `TenantSite.themeConfig` and injected at runtime on the tenant site.

---

## Component Inventory (Planned)

### Shared (platform + tenant)
- Button (primary, secondary, ghost, destructive)
- Input, Textarea, Select, Checkbox, Radio, Switch
- Badge, Tag, Chip
- Card, CardHeader, CardBody, CardFooter
- Modal / Dialog
- Drawer / Sheet
- Toast / Notification
- Spinner / Skeleton loader
- Avatar
- Pagination
- Table / DataTable
- Empty state
- Error boundary UI

### Platform-only (dashboard, admin)
- Sidebar navigation
- Stat card / KPI card
- Chart wrappers (recharts or tremor)
- Data filters / search bar
- Status indicator
- Timeline / audit log

### Tenant Storefront
- Product card
- Product grid
- Hero / banner section
- Promotion strip
- Delivery zone map
- Order status tracker
- Review / rating display

### POS (Tauri)
- POS product tile (large touch target)
- Cart line item
- Numpad
- Payment method selector
- Customer QR scanner view
- Dual-screen layout primitives

---

## Mobile (Expo / React Native)
- Use NativeWind to apply Tailwind tokens
- Shared token values keep mobile visually consistent with web
- shadcn/ui components are web-only; native equivalents are built manually using the same token system

---

## Typography Scale

| Role | Token | Default |
|---|---|---|
| Display | `--font-display` | 36–60px, bold |
| Heading 1–3 | via Tailwind `text-2xl/3xl/4xl` | |
| Body | `--font-body` | 16px, regular |
| Caption | `--font-caption` | 12px, muted |
| Mono | `--font-mono` | Code, prices |

---

## TODO
- Finalize component library choice (shadcn/ui recommended)
- Set up `packages/ui` in monorepo as the shared component package
- Define EwaTrade brand color palette and token values
- Define approved tenant font list (Google Fonts subset)
- Audit all existing screens against token system once first components are built
