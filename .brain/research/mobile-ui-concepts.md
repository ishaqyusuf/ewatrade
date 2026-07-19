# Mobile UI Concept Shortlist for EwaTrade

Date: 2026-07-18

## Outcome

Seven complete or demonstrably multi-flow mobile design concepts were shortlisted for EwaTrade. No single concept covers EwaTrade's merchant operations, POS, marketplace/storefront, checkout, dispatch, tracking, and WhatsApp-assisted commerce boundaries well enough by itself.

The recommended direction is a deliberate blend:

1. Use **E-Commerce Mobile App & Admin Dashboard** as the paired customer/merchant ecosystem reference.
2. Use **Smart Sales & Order Management** and **POS App** for the merchant, attendant, inventory, order, and reporting language.
3. Use **QuickShop** and **Grabby** for customer discovery, product detail, checkout, account, and order-management depth.
4. Use **Droply** and **Courier Delivery App** for customer tracking, delivery management, and the separate EwaTrade Dispatch experience.

These are references, not licensed EwaTrade source assets. Layouts, interaction ideas, and information architecture can be studied, but design files, artwork, illustrations, icons, and brand assets should not be copied unless their license explicitly permits it.

## Selection Method

A concept qualified when its primary project page met at least three conditions:

- a named creator or studio;
- more than an isolated hero shot;
- explicit evidence of multiple screens, a full design process, an end-to-end flow, a design system, or a reusable UI kit;
- direct relevance to at least one EwaTrade surface;
- a clean, contemporary visual direction that could be translated into EwaTrade's light/dark semantic-token system.

“Complete” below means complete within the concept's stated domain. It does not mean the concept already contains every EwaTrade role, edge state, tenant boundary, offline state, or WhatsApp interaction.

## Ranked Shortlist

| Rank | Concept | Source | Best EwaTrade use | Flow evidence | Fit |
| ---: | --- | --- | --- | --- | ---: |
| 1 | [E-Commerce Mobile App & Admin Dashboard](https://www.behance.net/gallery/244632319/E-Commerce-Mobile-App-Admin-Dashboard) | Behance | Shared customer + merchant design language | Creator describes a complete mobile-first solution containing both a shopping app and mobile admin dashboard | 5/5 |
| 2 | [POS App](https://www.behance.net/gallery/234475365/POS-App) | Behance | Retail Ops, inventory, sales, receipts, customers, staff | Creator explicitly describes a full set of POS screens built through research, wireframing, and testing | 5/5 |
| 3 | [Smart Sales & Order Management Mobile App](https://dribbble.com/shots/27067100-Smart-Sales-Order-Management-Mobile-App) | Dribbble | Owner/admin home, orders, analytics, alerts, settings | Project lists onboarding, sales tracking, analytics, order status, notifications, profile, and settings | 4.5/5 |
| 4 | [QuickShop — Ecommerce Mobile App UI/UX Design](https://www.behance.net/gallery/218075907/Ecommerce-Mobile-App-UIUX-Design) | Behance | Storefront/customer app and shared-link checkout | 150+ screens, reusable components, research, prototype, testing, checkout, payments, tracking, and reviews | 5/5 |
| 5 | [Grabby E-commerce Solution Case Study](https://www.behance.net/gallery/143059343/Grabby-E-commerce-Solution-Case-Study-%282022%29) | Behance | Marketplace, multi-merchant discovery, checkout, tracking, support | Documents auth prototypes plus buying, payment, tracking, account, return, messaging, and review flows | 5/5 |
| 6 | [Droply — Parcel App UI Kit](https://craftwork.design/product/droply-parcel-app-ui-kit) | Craftwork | Delivery request, tracking, confirmation, history, support | Commercial Figma kit with 100+ screens covering an explicitly end-to-end delivery experience | 5/5 |
| 7 | [Courier Delivery App UI UX](https://www.behance.net/gallery/241374019/Courier-Delivery-App-UI-UX-Mobile-App) | Behance | EwaTrade Dispatch rider/customer tracking language | Covers businesses, riders, and customers from onboarding and pickup through tracking, ETA, history, wallet, and profile | 4.5/5 |

Fit scores are EwaTrade-specific judgments, not ratings published by the source platforms.

## Detailed Findings

### 1. E-Commerce Mobile App & Admin Dashboard

**Creator:** Esraa Emad  
**Platform:** Behance  
**Primary source:** [project page](https://www.behance.net/gallery/244632319/E-Commerce-Mobile-App-Admin-Dashboard)

**Coverage and completeness evidence**

- The creator describes it as a “complete mobile-first e-commerce solution” containing both a customer shopping app and a mobile admin dashboard in one connected commerce ecosystem. The project page contains six visual presentation modules. [Source](https://www.behance.net/gallery/244632319/E-Commerce-Mobile-App-Admin-Dashboard)

**What EwaTrade should reuse**

- The strongest top-level reference for giving the customer and merchant apps a shared visual grammar without making them identical.
- Use its paired-surface idea for consistent product cards, order status, customer identity, totals, and action hierarchy across storefront and Retail Ops.
- It is a useful starting point for EwaTrade's future customer app because the merchant/admin companion is already part of the concept.

**Caveats**

- The source describes the ecosystem but does not enumerate every individual screen or state.
- It does not prove coverage for offline sync, tenant/business switching, attendants, stock custody, closeout, or dispatch operations.
- Treat it as the ecosystem and visual-language reference, not the sole implementation blueprint.

### 2. POS App

**Creator:** Christopher Adeleke  
**Platform:** Behance  
**Primary source:** [project page](https://www.behance.net/gallery/234475365/POS-App)

**Coverage and completeness evidence**

- The creator says the minimal mobile POS system was developed through research, wireframing, and iterative testing and includes a full set of screens for adding/managing products, tracking inventory, processing sales, generating receipts, and managing customers and staff. [Source](https://www.behance.net/gallery/234475365/POS-App)

**What EwaTrade should reuse**

- The best direct reference for the Retail Ops core: catalog, stock, create sale, receipt, customer book, and staff.
- Its minimal retail-focused composition is suitable for owner and attendant workflows that need fast scanning and large touch targets.
- The lime plus soft gray-blue palette is not the EwaTrade palette, but its restrained use of accent color is a useful model for EwaTrade's semantic success/action states.

**Caveats**

- The published presentation has limited visible modules despite the “full set of screens” claim.
- EwaTrade still needs tenant switching, cashier/rep sessions, stock wallets, offline queues, sync conflicts, closeout, credit sales, and role-safe navigation.

### 3. Smart Sales & Order Management Mobile App

**Creator:** Sujon Hossain  
**Platform:** Dribbble  
**Primary source:** [project page](https://dribbble.com/shots/27067100-Smart-Sales-Order-Management-Mobile-App)

**Coverage and completeness evidence**

- The project explicitly lists real-time sales tracking, analytics, order management with detailed status updates, onboarding, profile/settings, and notifications. Its page exposes multiple project images rather than only one unnamed screen. [Source](https://dribbble.com/shots/27067100-Smart-Sales-Order-Management-Mobile-App)

**What EwaTrade should reuse**

- The clearest reference for the owner/admin mobile home: daily performance, order status, growth snapshots, alerts, and profile/settings.
- Use its hierarchy to keep analytics compact and actionable instead of turning the mobile home into a dashboard wall.
- Its order-status and notification language can bridge Retail Ops, shared-link requests, and delivery exceptions.

**Caveats**

- It is a presentation concept, not a downloadable full UI kit.
- Inventory, POS checkout, payment reconciliation, tenant switching, staff custody, and offline behavior are not claimed.
- Use it primarily for shell, hierarchy, and analytics composition.

### 4. QuickShop — Ecommerce Mobile App UI/UX Design

**Creator:** Clyro UI/UX Design Agency  
**Platform:** Behance  
**Primary source:** [project page](https://www.behance.net/gallery/218075907/Ecommerce-Mobile-App-UIUX-Design)

**Coverage and completeness evidence**

- The project claims 150+ mobile screens and reusable components, built through research, prototyping, and testing. Its presentation visibly labels registration, categories, search, product listings, product detail, wishlist, checkout, payment, confirmation, order history, reviews, privacy, and real-time tracking. [Source](https://www.behance.net/gallery/218075907/Ecommerce-Mobile-App-UIUX-Design)

**What EwaTrade should reuse**

- The most complete customer-commerce screen inventory in the shortlist.
- Use its progressive purchase flow for storefront discovery and a future customer app: search/filter, product detail, cart, checkout, confirmation, tracking, history, and review.
- Its reusable component approach is a useful benchmark when mapping the same product, order, and status primitives into Expo and storefront web surfaces.

**Caveats**

- It is consumer-commerce focused and does not address merchant, POS, or rider operations.
- EwaTrade's MVP shared-product flow should stay smaller than this kit; do not import the entire customer-app scope into the web-first share-link checkout.
- Payment, address, privacy, and account patterns must be localized and validated rather than copied.

### 5. Grabby E-commerce Solution Case Study

**Creators:** Nelson Gold and Abayomi Samuel Amao  
**Platform:** Behance  
**Primary source:** [project page](https://www.behance.net/gallery/143059343/Grabby-E-commerce-Solution-Case-Study-%282022%29)

**Coverage and completeness evidence**

- Grabby is described as a SaaS aggregation marketplace where users find merchants by product category, browse inventories, order, pay, track, and review. The case study links registration prototypes and documents full order tracking, delivery-agent contact/routes, reviews, account/address/wallet/card/wishlist/settings, payment options, support chat, returns, in-app messages, filters, recommendations, and promotions. [Source](https://www.behance.net/gallery/143059343/Grabby-E-commerce-Solution-Case-Study-%282022%29)

**What EwaTrade should reuse**

- The closest conceptual match to EwaTrade's optional multi-merchant marketplace.
- Strong reference for keeping merchant identity visible while letting customers search products and stores.
- Its order-to-delivery, support, and post-purchase coverage can help connect marketplace, customer account, and delivery tracking.
- It is also a useful reminder that WhatsApp-assisted commerce still needs a continuation path into in-app order detail, support, and tracking.

**Caveats**

- The visual language is older than several other concepts in the shortlist; reuse the information architecture, not the styling wholesale.
- It is broader than EwaTrade's current web-first shared-link MVP.
- Crypto and some promotional/account features are not current EwaTrade priorities.

### 6. Droply — Parcel App UI Kit

**Creator:** Rabka UI  
**Platform:** Craftwork  
**Primary source:** [product page](https://craftwork.design/product/droply-parcel-app-ui-kit)

**Coverage and completeness evidence**

- Droply is a commercial Figma kit with 100+ screens. The source explicitly calls it an end-to-end delivery experience and enumerates package booking, courier matching, tracking, pickup scheduling, order summary, confirmation, invoices/history, support, auth, profile, notifications, payment, location selection, and settings. It also includes a design system, auto layout, components, and interactive variants. [Source](https://craftwork.design/product/droply-parcel-app-ui-kit)

**What EwaTrade should reuse**

- The most exhaustive dispatch/customer-delivery flow reference.
- Useful for delivery-request creation, address capture, assignment/matching concepts, map tracking, proof/confirmation, invoice/history, and support states.
- Its design-system packaging makes it suitable as an audit checklist for the future `apps/dispatch-mobile` flow.

**Caveats**

- It is a paid asset starting at the price shown on the source page; purchase does not automatically mean its brand or UI should become EwaTrade's design language. [Source](https://craftwork.design/product/droply-parcel-app-ui-kit)
- The listed flow is sender/customer heavy. EwaTrade still needs internal rider availability, assigned-job acknowledgement, pickup proof, failed-delivery reporting, incidents, and operations-controlled assignment.

### 7. Courier Delivery App UI UX

**Creators:** Md Rafiun Rouf, Radwoan Islam Rafi, and Pixelverse Creative  
**Platform:** Behance  
**Primary source:** [project page](https://www.behance.net/gallery/241374019/Courier-Delivery-App-UI-UX-Mobile-App)

**Coverage and completeness evidence**

- The project explicitly targets businesses, riders, and customers and follows delivery from pickup to drop-off. It lists onboarding, delivery flow, order management, live map tracking, status, ETA, trip history, wallet, profile, and delivery management, plus a scalable Figma design system. Nine presentation modules are exposed on the project page. [Source](https://www.behance.net/gallery/241374019/Courier-Delivery-App-UI-UX-Mobile-App)

**What EwaTrade should reuse**

- The best clean, modern rider-facing visual direction in the shortlist.
- Use the map-centric home, next-job prominence, status/ETA language, and compact trip history for EwaTrade Dispatch.
- Its multi-role framing is useful when checking that merchant, rider, and customer status language remains connected without putting rider navigation inside the merchant app.

**Caveats**

- Role boundaries are described at a high level rather than documented as three complete separate applications.
- Wallet behavior may not match EwaTrade's internal-first rider v1.
- Incident, proof, failed-delivery, operations escalation, and offline behavior still require original EwaTrade flows.

## Pinterest and Other Source Checks

Pinterest was checked both through current search and the existing local study at [`.scratch/wayfinder-mobile-ui-redesign/reference-study.md`](../../.scratch/wayfinder-mobile-ui-redesign/reference-study.md). The most useful pins remain:

- [service-app home composition](https://www.pinterest.com/pin/286893438761033937/);
- [furniture commerce/product-detail composition](https://www.pinterest.com/pin/286893438761033936/);
- [delivery tracking/detail composition](https://www.pinterest.com/pin/286893438761033935/);
- [shipping list/status composition](https://www.pinterest.com/pin/286893438761033934/);
- [shopping checkout flow](https://www.pinterest.com/pin/shopping-checkout-flow-ui-screen-xd--807551776928894497/).

These pins are useful for visual motifs—colored hero zones, search, product grids, sticky calls to action, tracking timelines, pill filters, and floating navigation—but were not promoted into the seven concepts because isolated pins do not reliably prove end-to-end flow coverage, original authorship, or design-file licensing.

Mobbin was also considered as a source for shipped-product patterns. Its official product describes a library of real product screens and e-commerce flows, but direct app-flow access is account-gated, so no Mobbin item was scored as a verifiable concept in this note. [Source](https://mobbin.com/mcp)

## Recommended EwaTrade Design Blend

### Design family A: Merchant Retail Ops

Start with the ecosystem framing from **E-Commerce Mobile App & Admin Dashboard**, the operational home hierarchy from **Smart Sales & Order Management**, and the concrete task coverage from **POS App**.

This family should cover:

- auth, business selection, and owner/attendant role resolution;
- owner home and attendant home;
- product and unit setup;
- inventory and stock movement;
- clock-in, create sale, customer, payment, receipt, and closeout;
- orders, shared-link requests, customers, staff, reports, and sync state.

### Design family B: Storefront and marketplace

Use **QuickShop** for the detailed customer-commerce component inventory and **Grabby** for multi-merchant marketplace information architecture.

Keep the current MVP narrower:

- shared product page;
- variant/unit and quantity;
- customer registration/login;
- pending order request;
- native share/copy path for WhatsApp;
- merchant follow-up;
- customer-safe delivery status.

Only expand toward the full QuickShop/Grabby account, cart, wishlist, wallet, review, and promotion surface when the customer app or marketplace phase is approved.

### Design family C: EwaTrade Dispatch

Use **Courier Delivery App** for the clean rider-facing shell and **Droply** as the end-to-end delivery state checklist.

EwaTrade-specific screens still needed:

- approved-rider login and availability;
- assigned job queue;
- acknowledgement;
- pickup and proof;
- in-transit/drop-off update;
- delivery confirmation;
- failure and incident reporting;
- operations escalation;
- offline/retry state;
- customer-safe tracking timeline.

## Gaps No Reference Solves

The project should design these as original EwaTrade patterns:

- multi-tenant business switching and tenant-safe role changes;
- owner versus attendant navigation and permissions;
- device-local offline queue, syncing, conflicts, and retry;
- stock wallets and rep-session opening/closeout reconciliation;
- units, sub-units, conversions, and price snapshots;
- WhatsApp share, preview, conversation handoff, and pending-order follow-up;
- service-business templates such as laundry/dry cleaning;
- Nigerian address, transfer, cash, receipt, connectivity, and low-end-device realities;
- light/dark semantic-token parity;
- keyboard-safe full-screen workflow modals and compact-phone behavior.

## Decision Recommendation

Promote three concepts into the internal reference-led approval flow, one at a time:

1. **Merchant reference:** E-Commerce Mobile App & Admin Dashboard, enriched with Smart Sales and POS App task coverage.
2. **Customer reference:** QuickShop, constrained to EwaTrade's shared-product and checkout MVP.
3. **Dispatch reference:** Courier Delivery App, validated against Droply's complete delivery-state inventory.

For each promoted reference, rebuild only EwaTrade-owned screens and components. Do not import a third-party kit directly into production or allow a reference's domain model to override the accepted EwaTrade Brain contracts.
