# Retail Ops Design System And IA

## Purpose

Define the reusable product structure, screen ownership, and UI patterns for the Retail Ops MVP across mobile, POS/rep workflows, and admin dashboards.

This document is the working design contract for sales, inventory, rep sessions, closeout, reports, share links, subscriptions, and offline sync. It keeps future implementation slices aligned with the simple, minimal, operational product described in `.brain/features/mobile-retail-ops-mvp-spec.md`.

## Design Position

Retail Ops is a work tool for owners and attendants who need to sell quickly, avoid stock mistakes, and reconcile the day with confidence. The UI should feel calm, compact, and direct.

- Prioritize doing work over explaining the product.
- Keep forms short and staged so setup never feels bulky.
- Use dense but readable operational cards for daily totals, stock, sync, and variance.
- Put the next action close to the related data: create sale near session status, restock near inventory, closeout near payment totals.
- Make offline and pending sync states visible without blocking selling.
- Prefer plain language labels over accounting-heavy terminology.
- Use reusable NativeWind-first mobile primitives for inputs, sheets, pressables, quantity controls, and status rows.

## Primary Roles

### Owner/Admin

Owns the business workspace, inventory setup, staff invites, product links, subscription plan, reports, and closeout review.

Admin surfaces must show:
- business switcher
- sales and payment totals
- active staff and rep sessions
- inventory and stock movement health
- product share-link analytics
- generated order requests
- pending sync and exceptions
- subscription state and upgrade path

### Manager

Acts like an admin for day-to-day operations but may not own billing or final destructive settings.

Manager surfaces should reuse admin dashboards but hide subscription ownership and sensitive tenant settings where permissions require it.

### Sales Rep/Attendant

Records sales and manages only the work needed for the current day.

Rep surfaces must show:
- clock-in and opening inventory confirmation
- assigned or available inventory
- create-sale action
- customer lookup
- recent own sales
- sync/offline state
- closeout or handover state when allowed

### Platform Admin

Supports tenant-level oversight, billing support, and operational troubleshooting.

Platform admin is not part of the first mobile MVP UI, but the IA should keep tenant boundaries clear so this role can be added without changing merchant workflows.

## Surface Ownership

### Mobile App

The mobile app is the primary MVP surface.

- Owner login and sign-up
- OTP verification
- first business and first product setup
- dashboard summary
- create sale
- customer book
- staff invite
- share product link
- offline sync status
- stock intake and unit conversion
- rep clock-in and opening inventory
- end-of-day closeout
- subscription plan status

Mobile screens should stay thin. Domain logic belongs in stores for the local bridge and later in typed tRPC hooks, services, and repositories.

### Dashboard App

The dashboard app becomes the owner/admin reporting and operations surface after production APIs are available.

- tenant and business management
- staff and role permissions
- stock wallet assignment
- closeout approval
- reporting filters and tables
- link analytics
- billing and entitlement management

Dashboard UI should be dense, predictable, and table-friendly.

### POS App

The POS app owns fixed-location cashier and barcode-heavy workflows when those become necessary.

- cashier sessions
- receipt printing
- barcode scanning
- scan price-resolution queue handoff
- store terminal selling
- cash drawer flow

The POS app should share session, sale, inventory, and receipt concepts with mobile but optimize for counter workflows.
Missing-price, unknown-product, and unavailable-item scan states are defined in `.brain/features/retail-ops-scan-price-resolution.md`.

### Storefront/Web Share Links

The share-link web surface is the MVP customer-facing bridge before the customer app.

- server-rendered product metadata
- product detail page
- variant and quantity selection
- customer register/login
- pending order request
- invalid/deactivated link state

This web surface must stay small and separate from future full storefront browsing.

## Screen Map

### Auth And Onboarding

- Splash
- Login with bold sign-up action
- Sign up with Google/Gmail or name, email, business name
- OTP verification
- Active business resolution
- First product setup
- Optional first stock confirmation

Primary states:
- empty account
- OTP sent
- invalid OTP
- resend cooldown
- existing business
- no inventory
- keyboard-visible forms

### Owner/Admin Mobile Dashboard

- Business header and switcher
- Offline/sync banner
- First product setup prompt
- Rep sessions status
- Today metrics
- Inventory summary
- Quick actions
- Day closeout summary
- Staff section
- Product links section
- Stock movements section
- Customer book section
- Recent sales
- Plan/subscription card

Primary states:
- no business
- no inventory
- offline
- pending sync
- open rep sessions
- opening variance
- low stock
- closeout pending review
- plan limit warning

### Rep/Attendant Sales Flow

- Clock in
- Opening inventory confirmation
- Product/unit picker
- Quantity stepper
- Payment selector
- Customer picker/input
- Sale confirmation
- Recent sales
- Offline sync queue

Primary states:
- not clocked in
- opening inventory incomplete
- insufficient stock
- out-of-stock unit
- customer selected
- customer typed
- pending sync
- sync failed
- closed session

### Inventory And Units

- Product list
- Product detail
- Unit/variant list
- Add product
- Add/edit variant
- Price snapshot/history view
- Stock intake
- Unit conversion/rebagging
- Stock movement ledger

Primary states:
- primary unit only
- variants available
- conversion available
- conversion blocked by stock
- stock intake pending sync
- low stock
- negative variance

### Staff And Stock Wallets

- Staff invite
- Staff list
- Staff profile
- Stock wallet assignment
- Rep session detail
- Rep sales today
- Rep inventory responsibility

Primary states:
- invite pending
- active
- suspended
- no assigned stock
- wallet variance
- session open
- session closed

### Closeout And Reconciliation

- Close day sheet
- Payment declaration
- Closing stock confirmation
- Variance note
- Admin closeout review
- Closeout history

Primary states:
- no sales to close
- open sales
- pending review
- approved
- flagged
- payment variance
- stock variance
- pending sync

### Reports

- Today overview
- Date range report
- Sales by rep
- Sales by product/unit
- Stock balances
- Cash expected versus declared
- Credit sales
- Shortage/variance report
- Price history
- Stock delivery/conversion history
- Sync exceptions

Primary filters:
- business/store
- date range
- rep
- product
- unit/variant
- payment method
- sync status
- closeout status

### Subscription

- Plan status card
- Three-tier plan comparison
- Upgrade path
- Usage/limit warning
- Billing unavailable state
- Store billing handoff

Primary states:
- trial/free
- active paid plan
- grace period
- expired
- upgrade available
- limit reached

## Reusable Components

### Mobile Primitives

- `MobileScreen`: safe area, keyboard-aware body, consistent page spacing.
- `ActionButton`: haptic primary/outline/destructive actions.
- `Pressable`: haptics, active feedback, disabled behavior, optional navigation.
- `FormField`: label, helper/error, NativeWind-first input styling.
- `OtpInput`: separated cells, paste support, auto-submit.
- `QuantityStepper`: minus, numeric input, plus, stock helper.
- `Modal` plus `BottomSheetKeyboardAwareScrollView`: all input-heavy mobile sheets.

### Operational Components

- `SyncBanner`: offline, pending, syncing, synced, failed, conflict.
- `BusinessSwitcher`: active business, create business, switch business.
- `MetricCard`: today totals and small operational counters.
- `InventorySummaryCard`: stock, units, variants, restock, convert, share.
- `ProductUnitRow`: product header plus selectable unit/variant rows.
- `PaymentSelector`: cash, transfer, later POS/card and credit.
- `CustomerPicker`: recent customers, search, manual entry.
- `RepSessionCard`: open sessions, opening variance, current attendant state.
- `StockMovementRow`: intake, sale, conversion, adjustment, opening stock.
- `CloseoutSummaryCard`: open sales, expected payments, review status.
- `PlanCard`: current plan, limits, upgrade action.

### Dashboard Components

- `ReportFilterBar`: date range, rep, product, status, payment method.
- `SummaryStatGrid`: totals and variance cards.
- `OperationalTable`: compact, sortable, export-ready rows.
- `VarianceBadge`: balanced, positive, negative, needs review.
- `EmptyState`: short, action-oriented, no marketing copy.
- `ExceptionList`: sync failures, conflicts, stock shortages, flagged closeouts.

## State Language

Use consistent labels across surfaces:

- Offline: "You are currently offline. Changes will sync when you reconnect."
- Pending sync: "Pending sync"
- Synced: "Synced"
- Sync failed: "Needs retry"
- Conflict: "Needs review"
- Opening variance: "Opening variance"
- Stock balanced: "Stock balanced"
- Low stock: "Low"
- Closeout pending: "Pending review"
- Link active: "Active"
- Link inactive: "Inactive"
- Invite pending: "Invite pending"
- Plan limit: "Limit reached"

## Data And Architecture Boundaries

- UI components display state and submit intent.
- Local mobile stores are temporary bridges for MVP interaction work.
- Production workflows must use typed tRPC routers.
- tRPC routers call service functions.
- Services call repository/query modules.
- Prisma remains the schema source of truth.
- Tenant, business, role, and subscription checks belong at API/service boundaries.
- Mobile and dashboard screens must never infer permissions only from hidden buttons.
- Query keys, sync envelopes, and idempotency keys must include tenant/business context.

## Implementation Constraints

- Use NativeWind class names for styling whenever possible.
- Avoid unnecessary `className` and `style` mixing on the same React Native element.
- All input forms must be keyboard-safe on common phone sizes.
- Use virtualized lists for large product, customer, sale, staff, and report lists.
- Keep cards at modest radius and avoid nested card layouts.
- Use icon buttons for obvious tool actions and text buttons for clear commands.
- Keep page sections full-width or unframed; reserve cards for actual data items and modals.
- Avoid decorative gradients/orbs and one-note palettes.
- Dark mode must use shared color/icon primitives, not one-off screen colors.

## Mobile Redesign Foundation

The first mobile redesign implementation slice established a reusable foundation in `apps/mobile/src/lib/design-foundation.ts` and the shared mobile component barrel.

- Mobile light mode uses a calm operational green/teal primary system for action and brand emphasis.
- Mobile dark mode follows the dark sample direction with a near-black canvas, compact dark cards, and teal action accents instead of the retired orange primary action color.
- Amber remains the warning and attention color for money, pending, and stock-risk states.
- Reusable mobile primitives now include `StatusBadge`, `StatusBanner`, `EmptyState`, and `TimelineRow`, alongside the existing haptic action buttons, pressables, floating sheets, and keyboard-aware layouts.
- `qa:design-foundation` is part of the mobile source QA path so later screen tickets must preserve the shared tokens, primitives, NativeWind discipline, and documented dark/light foundation.

## Mobile App Shell

Dashboard-class mobile screens should use `MobileAppShell` for the shared header, active business context, non-blocking sync banner slot, safe-area keyboard-aware content, and floating bottom navigation.

- The shell uses a GND-inspired floating bottom nav with a central create-sale action.
- Owner and attendant navigation is filtered from the same shell API; owner-only nav items are not rendered for attendants.
- Dynamic safe-area placement is handled inside the shell while visual styling remains NativeWind-first.
- Screen logic should pass actions into the shell rather than reimplementing tab bars or fixed footers in individual screens.
- `qa:app-shell` is part of mobile source QA and verifies the reusable shell, role filtering, floating nav selectors, and dashboard integration.

## Mobile Auth Redesign

Splash, login, sign-up, and OTP verification use shared auth primitives so the entry flow feels minimal and consistent.

- `AuthHeader` owns the icon, title, supporting copy, and optional badge treatment for auth/onboarding screens.
- `AuthMethodButton` owns haptic third-party auth choices such as Google sign-up/sign-in.
- Owner sign-up remains intentionally short: business name, full name, and email address for email OTP, with Google available after business name entry.
- Login keeps the new-user CTA visually stronger than a plain text link.
- OTP uses the shared segmented `OtpInput` with status badge/banner feedback for local fallback, resend, loading, and error states.
- `qa:auth-redesign` is part of mobile source QA and protects prompt-style placeholders instead of sample email examples.

## First Product Setup Redesign

The first-product setup sheet is the empty-business bridge after auth/business entry.

- The setup remains a staged bottom sheet: item details first, starting stock second.
- Setup source, product-limit, and submission error states use shared status banners.
- Current stock uses the shared `QuantityStepper` so users get plus, minus, and numeric keyboard entry.
- Unit templates remain available for common sub-units, while manual variants stay optional.
- Empty variant copy must make it clear that users can skip variants and continue with only the primary unit.
- Production product creation, local/offline fallback, opening-stock movement, and sync queue behavior stay unchanged.

## Mobile Dashboard Redesign

Owner and attendant dashboard surfaces should share the same shell and operational component vocabulary.

- Dashboard status chips should use `StatusBadge` for sync, payment, staff, customer, product-link, stock, and movement states.
- Empty dashboard sections should use `EmptyState` rather than hand-built dashed panels.
- Owner-only subscription, staff, closeout, reports, and inventory management actions remain hidden from attendants.
- Attendant views prioritize sale creation, current session, recent sales, customers, assigned/available stock, and sync state.
- Production snapshot reads, local fallback rows, offline banner behavior, and first-product prompting remain guarded by source QA.
- `qa:dashboard-redesign` is part of mobile source QA and protects the shared shell, role gating, compact sections, shared badges, and shared empty states.

## Create Sale Checkout Redesign

The create-sale workflow is the core mobile POS path and should stay optimized for quick one-handed checkout.

- Product and variant selection remains virtualized with `BottomSheetSectionList`; product parents with variants stay display-only while primary units and variant rows are selectable.
- Sale source, rep session, insufficient stock, submit error, and empty-product states use shared `StatusBanner` and `EmptyState` primitives.
- Stock, selected-customer, and customer-source labels use `StatusBadge` so operational status treatment is consistent with dashboards and setup sheets.
- Checkout keeps the shared `QuantityStepper`, nearby total preview, cash/transfer selector, customer book lookup, and typed new-customer fallback together in the same keyboard-safe sheet.
- Production sale creation, local/offline fallback recording, rep session validation, and sync queue behavior must remain unchanged when the visual layer is updated.
- `qa:create-sale-flow` continues to protect the sale list, quantity, payment, customer, offline/local fallback, and source status coverage.

## Product And Inventory Management Redesign

Inventory management surfaces should reuse one compact product-row vocabulary across stock intake, unit conversion, dashboard inventory previews, and future product detail screens.

- `InventoryProductCard` is the shared no-image product/variant row for inventory lists; it provides icon placeholders, selected state, stock badges, and optional price or conversion labels.
- Product rows should identify the parent item, primary unit, variant count, and stock status without making parent rows look like hidden variants.
- Variant/sub-unit rows should read as sellable or convertible units with their own stock and price/conversion labels.
- Stock intake and unit conversion sheets use shared `StatusBanner` and `EmptyState` for online/local source, shortage, empty inventory, empty search, and submit error states.
- Low and empty stock states should use warning/destructive status tones; healthy stock should use success treatment.
- Production stock intake, stock adjustment, unit conversion, local/offline fallback, and stock movement ledger behavior must stay unchanged while the visual layer evolves.
- `qa:inventory-operations-flow` protects the reusable card, source states, bounded product/unit/variant lists, stock shortages, tRPC mutations, and local queue behavior.

## Secondary Operational Screen Redesign

Staff, customer, subscription, and business settings surfaces should feel like compact operations panels, not marketing or admin sprawl.

- Staff invite stays short: attendant name, email address, cashier role submission, clear email invite guidance, and source/limit/error states through `StatusBanner`.
- Staff onboarding uses shared status treatment for invite lookup, wrong-account handling, role label, and setup errors while keeping only the required name/display-name fields.
- Customer book remains virtualized and uses shared badges for order count, synced customer, and pending sync states.
- Customer book source, empty search, and offline/local fallback states use shared banners and empty states.
- Subscription plan management shows current plan, usage, tier comparison, and provider-neutral upgrade handoff with operational cards and status badges instead of landing-page copy.
- Business switching groups current businesses, search, active status, business creation, and plan-limit warnings in the same calm sheet vocabulary.
- `qa:customer-book-flow`, `qa:staff-flow`, and `qa:subscription-flow` protect these shared primitives, production/local fallbacks, bounded rows, and role/billing boundaries.

## Acceptance Review Checklist

Every Retail Ops implementation slice should answer:

- Which role owns this screen?
- Which surface owns this workflow?
- Is the empty state useful?
- Are offline, pending sync, failed sync, and conflict states represented where relevant?
- Are shortage, credit, variance, and permission states represented where relevant?
- Does the flow stay keyboard-safe?
- Does it reuse shared primitives instead of one-off controls?
- Does it keep domain logic out of screen components?
- Does it preserve tenant/business scoping?
- Does Brain record schema, API, IA, or behavior changes made by the slice?
