# Sellgo PRD Assessment Report

## Context
Sellgo was a PRD drafted prior to the ewatrade platform. The two are the same product under different names.
This report captures the gap analysis between the Sellgo PRD and the current Brain documentation.
Kept for future reference — no implementation action taken yet.

---

## 1. ⚠️ Naming Conflict (Resolved)
Sellgo = ewatrade. Same product, old name. Brain remains authoritative.

| PRD Name | Brain Equivalent |
|---|---|
| Sellgo Core | Merchant System |
| Sellgo Market | Marketplace |
| Sellgo Dispatch | Dispatch Network |
| Sellgo POS | POS Cashier |

---

## 2. ✅ Strong Alignments (PRD ↔ Brain)

| PRD Feature | Brain Equivalent | Match Quality |
|---|---|---|
| Sellgo Core (backoffice) | Merchant System module | ✅ Strong |
| Sellgo Market (marketplace) | Marketplace module | ✅ Strong — merchant visibility rules match |
| Sellgo Dispatch (logistics) | Dispatch Network module | ✅ Partial — PRD simplifies Brain's model |
| Sellgo POS | POS Cashier module | ✅ Strong — barcode, receipt, cashier sessions all match |
| Shared design system | `packages/ui` shared styling layer | ✅ Architecture supports it |
| Multi-tenant merchants | Brain's multi-tenant boundary | ✅ Aligned |
| Tech stack (Next.js, Expo) | Brain's tech-stack.md | ✅ Aligned |

---

## 3. 🔴 In Brain — Entirely Missing from PRD

These Brain modules have zero presence in the Sellgo PRD.

### Website Builder
Brain defines a full section-based storefront/page builder with themes, templates, and token system. PRD makes no mention of merchant storefronts or website generation.

### WhatsApp Commerce
Brain defines WhatsApp as a core commerce channel: order updates, chat-to-order conversion, AI reply assistant, customer history. PRD omits this completely.

### Self-Service Checkout
Brain defines a distinct self-service flow (customer scans → cashier verifies → payment) with a 5-state machine, separate from the POS cashier. PRD collapses or ignores this.

### Dispatch Bidding & Reputation
Brain's dispatch module includes: delivery bidding, reputation scoring, service zones, and verification. PRD only covers: provider management, order assignment, and delivery status tracking.

### Multi-Store Merchants
Brain explicitly states merchants can operate multiple stores. PRD has no mention of this.

---

## 4. 🟡 PRD Additions Not Yet in Brain

Good specifics from the PRD that should be written into Brain when actioned.

### Sellgo Core Specifics
- Order status lifecycle: `Pending → Paid → Processing → Dispatched → Completed`
- Orders assignable to channels: POS, Marketplace, Dispatch
- Inline price & stock editing (admin-only)
- Dashboard KPIs + inventory alerts
- Light & dark mode requirement
- SKU/barcode part of product management

### POS Specifics
- Two-column layout: left = product grid, right = cart/payment
- Payment methods: Cash, Transfer, Card (abstracted)
- Offline tolerance
- Receipt spec: business name, item list, prices, total, payment method, date/time
- Target sectors: pharmacies, 3PL counters, retail outlets
- UX: large tap targets, keyboard + barcode-scanner friendly

### Marketplace Specifics
- Seller can publish products from Core into Market (cross-app publishing flow)
- Seller can manage marketplace visibility per product
- Sellers can view marketplace orders from Market app
- Mobile-first explicit requirement

### Shared Design System
- Consistent color system + typography
- Role-based permissions at design system level
- Real-time sync across all apps

---

## 5. 🟠 Partial Conflicts / Model Divergence

| Area | PRD Model | Brain Model | Issue |
|---|---|---|---|
| Dispatch providers | General "providers" and "dispatchers" | Riders, courier companies, fleet operators, 3PL providers | PRD is less typed |
| Dispatch assignment | Manual assignment from Core | Bidding system with zone awareness | PRD drops bidding |
| POS role | Cashier operates system | Brain has cashier-operated + self-service paths | PRD collapses to cashier-only |
| Order model | Orders assigned to channels | No cross-channel order assignment model in Brain | PRD is more advanced here |

---

## 6. Architecture Gaps Introduced by PRD

| Gap | Impact |
|---|---|
| Real-time sync across 4 apps | Brain has no WebSocket or event-streaming plan |
| POS offline tolerance | No offline-first / sync-on-reconnect strategy in Brain |
| Cross-app order channel assignment | Requires shared order model that knows its source channel |
| Mobile apps for Market and Dispatch | Brain's PROJECT_INDEX only lists `apps/web` — no mobile scaffold yet |

---

## 7. Summary Verdict

| Category | Count |
|---|---|
| ✅ Strongly aligned domains | 4 |
| 🔴 Brain modules absent from PRD | 5 (Website Builder, WhatsApp, Self-Service Checkout, Bidding, Multi-store) |
| 🟡 PRD additions not in Brain | ~14 specific features |
| 🟠 Model conflicts | 4 |

---

## Pending Decisions (for future review)
- Which Brain-only modules are in scope for ewatrade v1: Website Builder, WhatsApp Commerce, Self-Service Checkout?
- Keep Brain's dispatch bidding model or simplify to PRD's manual-assignment model?
- Document real-time sync strategy.
- Document offline-first strategy for POS.
- Add `apps/mobile` to PROJECT_INDEX once mobile scaffold begins.
