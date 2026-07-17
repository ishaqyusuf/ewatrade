# Retail Ops Design System And IA

## Purpose

Define the reusable product structure, screen ownership, and UI patterns for the Retail Ops MVP across mobile, POS/rep workflows, and admin dashboards.

This document is the working design contract for sales, inventory, rep sessions, closeout, reports, share links, subscriptions, and offline sync. It keeps future implementation slices aligned with the simple, minimal, operational product described in `.brain/features/mobile-retail-ops-mvp-spec.md`.

## Mobile Design System Playground

Planning is active through `.scratch/wayfinder-mobile-design-system-playground/map.md`.

A ready-for-agent design-system playground spec has been published at `.scratch/wayfinder-mobile-design-system-playground/spec.md`.

Ready-for-agent implementation tickets have been published under `.scratch/mobile-design-system-playground-implementation/issues/`.

Implementation is now moving through a reference-led approval flow. The Expo app has an internal `/design-system` review route backed by static sample data, shared mobile primitives, and saved local mobile design reference images. The entry screen is intentionally narrow: the provided reference image appears inside the Reference Decisions list as the visual trigger, and each approved reference opens its own full-screen implemented route instead of a modal.

The first reference implementation has been promoted into a functional design app path: `Design 01`, available at `/design-system/design-01`. Its reference hub is `/design-system/design-01/reference`, its source image route is `/design-system/design-01/image`, and starter feature routes now live beside it under `/design-system/design-01/orders`, `/design-system/design-01/stock`, `/design-system/design-01/messages`, and `/design-system/design-01/profile`. Only the Design 01 home screen should reveal the bottom tab dock; starter child routes use the same shell and floating actions without bottom tabs unless the project owner explicitly asks for tabs on a specific child route. The old `/design-system/references/home-shell` and `/design-system/references/home-shell/image` paths are compatibility redirects only. Each implemented reference/design screen must carry two floating actions: a theme toggle and a source-image/design toggle. The source-image toggle must open a full-screen route, not a modal. The next reference image must not be implemented until the project owner approves the current reference screen.

Reference screens that use a colored top hero should use an immersive reference shell: the hero color must blend into the Android status bar at rest, content should remain padded below unsafe status-bar content, and the status bar should switch to the active theme card surface as soon as the user starts scrolling down, with dark icons in light mode and light icons in dark mode. Android edge-to-edge status bars need an explicit opaque backing view behind the status icons so scrolled content cannot bleed under the time/battery area. Bottom navigation previews should use the shared `MobileBottomTabs` primitive as floating safe-area tab docks, not scroll-content previews, with minimum 44pt tab targets, a clear active tab pill, compact spacing below the dock, optional haptics, optional labels or active-only labels, horizontal/vertical label stacking, `href` navigation, `disabled` handling, component-level `onTabPress`, safe-area and hide-on-scroll controls, and per-tab `render({ active })` support for raised center actions such as an Add plus-FAB that sits above the dock top edge. Five-tab reference docks must keep each tab in an equal fixed-width lane and center the tab content inside that lane so active-only labels expand the active pill without shifting neighboring icon positions; three-tab docks use equal lanes with first/start, middle/center, and last/end alignment. Floating footer content, including tab docks and FAB stacks, must hide together on scroll unless an explicit code comment documents a user-approved exception. FAB stacks should use standard footer stacking: normal bottom placement without a tab dock, and a compact lift just above the tab dock when one is present. Reference-specific tab geometry and end-of-screen approval/status text must still use semantic theme surfaces and foregrounds so light and dark mode both have a proper background and readable contrast. Do not use NativeWind slash-opacity classes such as `border-success/30` or `bg-success/10` in reference UI; use solid semantic tokens or explicit computed colors verified on the Android emulator.

NativeWind mobile primitives in this design-system flow should follow the proven `gnd` and `al-ghurobaa` mobile shape: `Text`, `View`, and `Pressable` forward `className` to the native primitive and do not inject inline color styles that can override Tailwind utilities. Semantic surfaces such as service category tiles should use solid tokens (`bg-muted`, `bg-card`, `text-foreground`) on the actual visual surface. When a tile is pressable, let `Pressable` own touch, haptics, and navigation while an inner `View` owns the background token.

App-wide NativeWind CSS variables must be provided through the NativeWind `VariableContextProvider` at the mobile root. Do not rely on `vars()` as a `style` entry on a plain React Native wrapper for root theme tokens, because child text and background utilities such as `text-primary-foreground` can compile correctly but resolve as missing variables at runtime. The root variable map must also include RN-safe Tailwind stock palette variables such as `--color-red-500`; classes like `bg-red-500`, `text-red-500`, and their slash-opacity variants compile through Tailwind palette variables and are invisible on native if those variables are absent.

The active design-system code is organized as a thin-route, feature-folder structure under `apps/mobile/src/components/mobile/design-system/`, with reference decisions, shared reference screen shell/FABs, the reusable `apps/mobile/src/components/mobile/bottom-tabs.tsx` primitive, thin reference tab adapters, and functional design families under `apps/mobile/src/components/mobile/design-system/designs/design-01/`. Avoid returning this flow to a monolithic playground component. Future reference images that belong to the same approved visual direction should be added to the matching design family's data registry and screens instead of creating disconnected screenshot-only routes.

In development/preview app variants, the login screen exposes an icon-only shortcut to `/design-system` so the project owner can open the approval surface directly during emulator review. This shortcut must remain hidden outside internal dev/preview modes.

Review and QA notes are recorded under `.scratch/wayfinder-mobile-design-system-playground/reviews/`:
- Android emulator validation: `.scratch/wayfinder-mobile-design-system-playground/reviews/android-emulator-validation.md`
- Design/reference sources: `.scratch/wayfinder-mobile-design-system-playground/reviews/design-reference-sources.md`
- Gemini CLI review blocker: `.scratch/wayfinder-mobile-design-system-playground/reviews/gemini-review.md`
- Gravity discovery result: `.scratch/wayfinder-mobile-design-system-playground/reviews/gravity-discovery.md`

The first approved deliverable is mobile-only: an EwaTrade Expo design-system playground screen that catalogs the primitives and patterns to use before existing mobile screens are refactored. The playground should include light/dark mode review, header variants, buttons, inputs, selectors, lists, status states, modals, bottom sheets, bottom footer/action patterns, navigation into pattern/detail screens, analytics cards, and bar-chart/report examples.

Existing mobile screens should not be globally refactored to the new design system until the playground has been implemented and approved. Gemini and Gravity may be used as advisory design reviewers during this process, but project-owner approval remains the final gate.

## Design Position

Retail Ops is a work tool for owners and attendants who need to sell quickly, avoid stock mistakes, and reconcile the day with confidence. The UI should feel calm, compact, and direct.

- Prioritize doing work over explaining the product.
- Keep forms short and staged so setup never feels bulky.
- Use dense but readable operational cards for daily totals, stock, sync, and variance.
- Put the next action close to the related data: create sale near session status, restock near inventory, closeout near payment totals.
- Treat low-stock level alerts as an operational pattern, not only a badge: show affected product/unit, available stock, threshold source, severity, age, and role-safe next actions.
- Make offline and pending sync states visible without blocking selling.
- Prefer plain language labels over accounting-heavy terminology.
- Use reusable NativeWind-first mobile primitives for inputs, sheets, pressables, quantity controls, and status rows.

## Mobile Navigation And Home Standard

Implementation source: `.scratch/mobile-navigation-home-system-implementation/issues/`.

The mobile Retail Ops dashboard now uses role-specific route surfaces instead of showing every role the same owner dashboard. `/admin-home` and `/sales-rep-home` render the shared Retail Ops dashboard surface in role-specific modes, `/dashboard` is a compatibility redirect to the right role surface, Expo Router protects the role routes, and long workflow routes are guarded from the wrong roles.

Admin/owner home rules:
- Bottom navigation is `Home`, `Sales`, center `+`, `Stocks`, and `More`.
- The app shell uses the shared `MobileBottomTabs` primitive in the Design 01/reference tab style with a raised center `+`.
- Home surfaces with the primary colored hero use the same immersive shell behavior as the approved Design 01 reference: the hero owns the status-bar background at rest, critical hero content is padded below the unsafe status area, the status bar switches back to the active theme card surface on scroll, and the floating bottom tabs hide on scroll down and return on scroll up.
- Admin Home uses a Design 01-style primary hero with business selection, workspace search, daily snapshot, reports CTA, service categories, and current-operation summaries. Detailed staff, stock, customer, share-link, report, and subscription lists should stay behind their explicit navigation/actions instead of filling the first screen.
- The center `+` opens a compact Create sheet for deliberate actions instead of crowding the first screen with every CTA.
- `More` opens a short icon list for `Sales Reps`, `Customers`, `Settings`, and `Theme`; Settings opens a dedicated settings navigation sheet, and Theme opens an explicit theme picker.
- Settings includes App lock, which opens a full-screen post-login PIN setup/manage flow for device-local protection after normal account login.
- Long owner workflows use full-screen stack modal routes: Sales Reps (`/staff-invite-modal`), business switching (`/business-switch-modal`), first product setup (`/first-product-setup-modal`), stock intake (`/stock-intake-modal`), product links (`/product-share-modal`), reports (`/reports-modal`), subscription (`/subscription-modal`), and unit conversion (`/unit-conversion-modal`).
- Long shared operational workflows use full-screen stack modal routes with sales-rep access where appropriate: create sale (`/create-sale-modal`), customer book (`/customer-book-modal`), service orders (`/service-orders-modal`), rep clock-in (`/rep-clock-in-modal`), closeout (`/closeout-modal`), and sync status (`/sync-status-modal`).
- The compact floating theme FAB is only for development UI testing variants; preview and production builds omit it, and production theme access is through More.

Sales-rep home rules:
- Sales reps get a separate home composition focused on session status, quick sale, assigned stock, customer lookup, recent sales, sync status, and closeout queue.
- Admin-only tools such as Sales Reps management, business settings, reports, broad stock movement controls, product links, and subscription cards stay out of sales-rep navigation.
- Sales reps keep the fastest center action for creating a sale.

Form and modal rules:
- Canonical mobile inputs flow through `FormField`, which reuses the stable `Input` from `@/components/ui/input-2`.
- Service-order setup and intake should reuse the canonical `FormField`, `ActionButton`, `QuantityStepper`, `SecondaryOperationalRow`, `StatusBanner`, and keyboard-safe full-screen modal primitives rather than introducing local input or button treatments.
- App-lock PIN screens follow the provided dark wallet-style reference: compact top title, optional close control in setup/manage, segmented 6-digit choice treatment, circular PIN cells, sparse numeric keypad, fingerprint action in the bottom-left keypad slot when available, and delete in the bottom-right slot.
- Bottom sheets are for short, focused choices and quick actions.
- Workflows that are over half-screen, multi-section, or keyboard-heavy should use full-screen stack modal routes with `MobileScreen` keyboard-safe layout and sticky primary CTA placement where the form is long.
- Full-screen stack workflow routes must use `WorkflowModalScreen` so authentication/role redirects, close-header geometry, compact horizontal padding, status-bar background, and light/dark status-bar icon style stay consistent across item setup, stock, staff, sales, reports, links, and settings flows. The shell should show the workflow title directly without an extra decorative eyebrow, and reused sheet bodies should use tighter screen-mode horizontal padding than bottom-sheet mode.
- Keyboard-sticky inline composers should sit as accessory surfaces directly above the keyboard only while activated, with horizontal suggestion chips above the input, a single right action only when the mode needs explicit submit, and removable selected chips for already-added values. Delimiter-driven value modes may omit the right action: commas commit completed values, and keyboard Done commits remaining text before dismissing. They should close when the keyboard is dismissed or the user taps back into the form. Development-only floating controls should hide while the keyboard is visible so they do not cover composer pills or inputs.
- Touched forms should prefer spacing, labels, helper text, status banners, and operational rows over repeated nested card/border wrappers.

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
- low-stock alert summary, empty state, and role-safe warning/action surfaces
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

## Shared Form Inputs And Actions

Mobile form controls should reuse the auth/onboarding input and button feel across operational screens instead of maintaining separate dashboard, sheet, and auth styles.

- `FormField` is the shared field wrapper for auth, dashboard, and bottom-sheet forms. It keeps the auth-style rounded card shell, active/error border treatment, semantic helper/error text, optional leading and trailing icons, multiline support, and accessibility labels.
- `MoneyField` composes `FormField` for monetary input. It uses a non-editable
  text prefix from the active store currency, live comma grouping, decimal
  keyboard entry, and normalized decimal-string output; money fields must not
  use a generic dollar icon.
- `variant="auth"`, `variant="filled"`, and `variant="line"` remain accepted for compatibility, but they should render through the same base field shell so first-product setup, staff invite, customer, stock, and checkout forms do not drift from login/sign-up.
- `QuantityStepper` is the special numeric input exception for POS and inventory quantities, but its center input should still use the same rounded card shell and active border behavior as `FormField`.
- `ActionButton` is the shared full-width CTA for mobile forms. It keeps auth-style sizing, haptic Button behavior, disabled treatment, optional leading/trailing icons, and a first-class loading state through `isLoading` and `loadingLabel`.
- Auth-only wrappers such as `AuthActionButton` should delegate to `ActionButton` rather than reimplementing button visuals.
- `qa:auth-redesign` and `qa:action-primitives` protect the shared field/action contract, including icon support, active borders, loading state, and shared haptic primitives.

## Mobile App Shell

Dashboard-class mobile screens should use `MobileAppShell` for the shared header, active business context, non-blocking sync banner slot, safe-area keyboard-aware content, and floating bottom navigation.

- The shell uses a GND-inspired floating bottom nav with a central create-sale action.
- Owner and attendant navigation is filtered from the same shell API; owner-only nav items are not rendered for attendants.
- Dynamic safe-area placement is handled inside the shell while visual styling remains NativeWind-first.
- Screen logic should pass actions into the shell rather than reimplementing tab bars or fixed footers in individual screens.
- `qa:app-shell` is part of mobile source QA and verifies the reusable shell, role filtering, floating nav selectors, and dashboard integration.

## Mobile Auth Redesign

Splash, login, sign-up, and OTP verification use shared auth primitives so the entry flow feels minimal and consistent.

- `AuthHeader` owns the icon, title, supporting copy, and optional badge treatment for simple auth/onboarding screens; richer one-off verification screens can use their own thin shell when a reference-driven layout requires it.
- `AuthMethodButton` owns haptic third-party auth choices such as Google sign-up/sign-in.
- Owner sign-up remains intentionally short: business name, full name, and email address for email OTP, with Google available after business name entry.
- Login keeps the new-user CTA visually stronger than a plain text link.
- OTP verification follows the approved reference-led PIN pattern: off-white/light or matte dark screen canvas, a small circular back action, centered headline and delivery copy, six separated display cells, an in-screen rounded numeric keypad with phone-letter hints, clipboard paste, delete, resend/loading/error feedback, and a compact local fallback note for dev/test paths.
- The OTP route should keep logic thin by using shared `OtpInput` and `OtpKeypad` primitives instead of local keypad/cell implementations. The reference variant may suppress the system keyboard while preserving the older numeric TextInput OTP behavior for other flows.
- `qa:auth-redesign` is part of mobile source QA and protects prompt-style placeholders instead of sample email examples.

## First Product Setup Redesign

The first-product setup sheet is the empty-business bridge after auth/business entry.

- The setup remains a single guided form: item details, media, and either primary-unit price/stock or variant price/stock rows.
- Guided setup sheets should use reusable setup-flow primitives for the progress rail, section framing, selectable pills, inline notices, and compact summary rows instead of rebuilding one-off card stacks.
- First-product setup uses flat line-style fields, manual unit entry with a focused keyboard suggestion bar, divider-based variant rows, and inline stock fields so the flow stays lightweight while remaining operationally clear.
- Setup source, product-limit, and submission error states use shared status banners, but normal online/production-ready paths should not show redundant confirmation copy.
- Current stock is captured inline beside the primary price when there are no variants, or inside each variant row when variants exist.
- Manual sub-units and variants stay optional; the first-product setup surface does not show reusable unit-template choices. Primary-unit suggestions appear only as compact keyboard-time chips that write into the manual field.
- Variant entry should default to an inline keyboard-sticky composer rather than a modal: a horizontal pill rail sits above a chat-style input with one right-side submit action. The composer starts in variant-label mode with filtered known labels, then stays open in value-entry mode with selected removable chips first and mapped common-value suggestions after them. The older compact value sheet can remain in code as a rollback path during testing.
- After a second variant value is added, replace the introductory variant section with a compact `Variants` / `Stocks` segmented control. The Variants view should use flat grouped rows with a label action, value pills, a trailing per-group add pill, and an active bottom `Add variant` action. The Stocks view should preserve editable price/stock rows, use one options icon instead of destructive row controls, and own the validation-aware final `Add item` action.
- Variant group, value, and stock actions should use a content-sized bottom action sheet with title and Active/Inactive subtitle. Label/value edits return to the keyboard composer with a check action and close on save; disabled values and stock rows use muted treatment and sort after active content.
- Empty variant copy must make it clear that users can skip variants and continue with only the primary unit.
- Production product creation, local/offline fallback, opening-stock movement, and sync queue behavior stay unchanged.

## Mobile Dashboard Redesign

Owner and attendant dashboard surfaces should share the same shell and operational component vocabulary.

- Dashboard status chips should use `StatusBadge` for sync, payment, staff, customer, product-link, stock, and movement states.
- Dashboard metrics, quick actions, summary panels, stat tiles, and inline statuses should use reusable dashboard-kit primitives with flat divider-based rows and semantic primary/success/warn/destructive tokens rather than local card-heavy widgets.
- Dashboard preview records, including recent sales, staff, product links, customers, and stock movements, should use `DashboardRecordRow` so dense activity lists share one flat row language instead of local card wrappers.
- Empty dashboard sections should use `EmptyState` rather than hand-built dashed panels.
- Owner-only subscription, staff, closeout, reports, and inventory management actions remain hidden from attendants.
- Attendant views prioritize sale creation, current session, recent sales, customers, assigned/available stock, and sync state.
- Production snapshot reads, local fallback rows, offline banner behavior, and first-product prompting remain guarded by source QA.
- `qa:dashboard-redesign` is part of mobile source QA and protects the shared shell, role gating, compact sections, shared badges, shared empty states, reusable dashboard panels, stat tiles, inline statuses, and record rows.

## Session Reconciliation Redesign

Clock-in and closeout are daily operational checkpoints, so they should feel like focused reconciliation tools rather than form-heavy admin cards.

- `SessionSourcePanel`, `SessionStatTile`, `SessionInventoryLine`, `SessionVarianceRow`, and `SessionSectionHeader` are the shared primitives for opening sessions, closing sessions, stock declarations, payment variance, and session source state.
- Opening and closing stock rows should use flat divider treatment, compact expected-stock badges, keyboard-safe quantity inputs, and semantic success/destructive variance text.
- Payment totals and cash/transfer variance rows should use the same divider-based summary and variance primitives instead of local metric cards.
- Pending-sync, no-sales, degraded/local source, submit-error, empty-inventory, and empty-search states should use shared `StatusBanner` or `EmptyState` primitives with semantic warning/destructive/success tokens. Normal online/production-ready source states should stay quiet unless the user needs to act.
- Production open-session, production close-session, local/offline fallback, pending-sync protection, and bounded opening/closing inventory rows must remain unchanged while the visual layer evolves.
- `qa:inventory-operations-flow` protects session reconciliation primitives, production/local session behavior, bounded rows, and semantic shared UI usage.

## Create Sale Checkout Redesign

The create-sale workflow is the core mobile POS path and should stay optimized for quick one-handed checkout.

- Product and variant selection remains virtualized with `BottomSheetSectionList`; product parents with variants stay display-only while primary units and variant rows are selectable.
- Item rows, payment choices, customer options, and total preview use reusable sale-flow primitives for selectable rows, segmented choices, and ticket-like total summaries instead of local card-heavy widgets.
- The visual rhythm should stay flat and fast: divider-based sellable rows, rounded selected indicators, semantic stock/payment/customer status, and a prominent total before payment/customer confirmation.
- Sale sync-required/offline, rep session, insufficient stock, submit error, and empty-product states use shared `StatusBanner` and `EmptyState` primitives.
- Stock, selected-customer, and customer-source labels use `StatusBadge` so operational status treatment is consistent with dashboards and setup sheets.
- Checkout keeps the shared `QuantityStepper`, nearby total preview, cash/transfer selector, customer book lookup, and typed new-customer fallback together in the same keyboard-safe sheet.
- Production sale creation, local/offline fallback recording, rep session validation, and sync queue behavior must remain unchanged when the visual layer is updated.
- `qa:create-sale-flow` continues to protect the sale list, quantity, payment, customer, offline/local fallback, and sync-required status coverage.

## Product And Inventory Management Redesign

Inventory management surfaces should reuse one compact flat product-row vocabulary across stock intake, unit conversion, dashboard inventory previews, and future product detail screens.

- `InventoryProductCard` is the shared no-image product/variant row for inventory lists; it uses divider treatment, round icon placeholders, selected state, stock badges, and optional price or conversion labels without decorative card containers.
- `InventorySegmentOption`, `InventoryUnitOption`, and `InventoryMovementRow` are the shared stock-operation primitives for restock/adjust toggles, unit choices, and stock movement history rows.
- Product rows should identify the parent item, primary unit, variant count, and stock status without making parent rows look like hidden variants.
- Variant/sub-unit rows should read as sellable or convertible units with their own stock and price/conversion labels.
- Stock intake uses the same flat segmented controls for restock/adjust and adjustment direction/reason choices so inventory operations feel like one focused tool.
- Stock intake and unit conversion sheets use shared `StatusBanner` and `EmptyState` for offline/sync-required source states, shortage, empty inventory, empty search, and submit error states.
- Low and empty stock states should use warning/destructive status tones; healthy stock should use success treatment.
- Production stock intake, stock adjustment, unit conversion, local/offline fallback, and stock movement ledger behavior must stay unchanged while the visual layer evolves.
- `qa:inventory-operations-flow` protects the reusable flat inventory primitives, source states, bounded product/unit/variant lists, stock shortages, tRPC mutations, and local queue behavior.

## Secondary Operational Screen Redesign

Staff, customer, subscription, and business settings surfaces should feel like compact operations panels, not marketing or admin sprawl.

- `SecondarySheetHeader` and `SecondaryOperationalRow` are the shared primitives for secondary mobile sheets that need a compact header plus staff, customer, business, subscription, or settings rows.
- Secondary rows should use flat divider treatment, round muted icons, strong primary labels, compact metadata, and semantic badges instead of local card-heavy row widgets.
- Selectable secondary rows support haptic press feedback, selected border treatment, disabled opacity, and active background feedback so business and plan choices do not need local pressable card implementations.
- Staff invite stays short: attendant name, email address, cashier role submission, clear email invite guidance, and degraded source/limit/error states through `StatusBanner`.
- Staff list rows use `SecondaryOperationalRow` for name, email, role/invite metadata, production/local source, and active/pending status.
- Staff onboarding uses `SecondarySheetHeader`, `SecondaryOperationalRow`, shared status badges, and status banners for invite lookup, wrong-account handling, role label, account context, and setup errors while keeping only the required name/display-name fields.
- `qa:staff-flow` must continue to protect the staff onboarding screen from reverting to local card-heavy invite summaries.
- Customer book remains virtualized and uses `SecondaryOperationalRow` plus shared badges for order count, synced customer, and pending sync states.
- Customer book degraded source, empty search, and offline/local fallback states use shared banners and empty states.
- Subscription plan management shows current plan, usage, tier comparison, and provider-neutral upgrade handoff with `SecondaryOperationalRow` and status badges instead of landing-page copy or local plan cards.
- Business switching groups current businesses, search, active status, business creation, and plan-limit warnings in the same calm sheet vocabulary, using selectable secondary rows for business workspaces.
- `qa:customer-book-flow`, `qa:staff-flow`, and `qa:subscription-flow` protect these shared primitives, production/local fallbacks, bounded rows, and role/billing boundaries.

## Reports Redesign

Reports should read like a compact operational ledger, not a separate analytics product or a wall of cards.

- `ReportMetricTile`, `ReportRecordRow`, and `ReportSection` are the shared primitives for report summary metrics, bounded report rows, empty report sections, source rows, variance rows, credit rows, movement history, and sync conflict review rows.
- Report metric tiles use flat divider treatment and semantic success/warning/destructive/default text tokens instead of local card-heavy metric widgets or fixed emerald/amber text.
- Report rows should keep strong labels, compact detail copy, right-aligned values, bounded visible rows, and CSV-aligned ordering so the on-screen report matches export expectations.
- Empty report sections and CSV scope copy should use shared `EmptyState` or `StatusBanner` primitives.
- Production report reads, local fallback source messaging, CSV export, device conflict filters, and tenant-level conflict visibility must remain unchanged while the visual layer evolves.
- `qa:reports-flow` protects shared report primitives, production/local report reads, bounded sections, CSV export, and sync conflict reporting.

## Product Share Link Redesign

Product share workflows should make generated links, analytics, and follow-up actions feel like part of the mobile POS rather than a separate marketing tool.

- Shareable product selection uses `InventoryProductCard` for no-image placeholders, selected state, price, and unit/variant context.
- Generated link rows use `ShareLinkRecordRow` for product, URL, creator, active/inactive status, views, orders, last activity, native share, copy feedback, and careful deactivation.
- Link analytics use `ShareLinkPanel`, `ShareLinkMetricTile`, `ShareLinkRecordRow`, and shared status badges for source, top links, reserved, consumed, released, and cancelled quantities.
- Payment, fulfillment, and delivery-method follow-up choices use `ShareLinkOptionPill` so selected states, haptics, and semantic token treatment stay consistent.
- Share, copy, and deactivate controls use `ShareLinkActionButton` so native share handoff, clipboard feedback, and destructive deactivation share one haptic action treatment.
- Incoming shared-link orders use `ShareLinkRecordRow` and `ShareLinkActionButton` for customer, order number, product/unit, quantity, total, reservation status, notification status, payment choice, fulfillment status, fulfillment method, and complete/cancel actions.
- Delivery follow-up uses `ShareLinkRecordRow` and `ShareLinkActionButton` so route details, delivery status, and status update actions stay close to each delivery request without local card-heavy rows.
- Offline, loading, empty, inactive-link, notification-failure, analytics-error, order-error, delivery-error, and mutation-error states should use shared `StatusBanner` or `EmptyState` primitives.
- `qa:product-share-management` protects native sharing, clipboard copy feedback, production and local link handling, reusable share-link primitives, analytics, order follow-up, delivery follow-up, and the shared UI primitives.

## Offline Sync And Conflict Review Redesign

Offline and sync states should be persistent, compact, and actionable without blocking sales work.

- Dashboard keeps a non-blocking sync banner for offline, pending, failed, conflict, and synced states.
- `SyncStatusSheet` is the detailed reliability surface for offline toggle, device identity, pending queue, retries, conflicts, server history, server conflict review, and blocked dependencies.
- `SyncReliabilityPanel`, `SyncReliabilityStat`, and `SyncReliabilityToggle` are the shared primitives for online/offline mode state, device identity, device management, last sync summary, server sync history, queue totals, server conflict counts, and offline toggle behavior.
- Local sync event rows and dependency-blocked rows use shared `SyncReliabilityRow` plus `StatusBadge` treatment for pending, synced, failed, blocked, and conflict states while preserving impact and action copy.
- Retry, review, revoke, and restore controls use `SyncReliabilityAction` so reliability actions keep haptic feedback, stable sizing, and semantic primary/destructive/muted token styling instead of local card buttons.
- Failed and conflict summaries use `StatusBanner` so retry/review work is visually distinct and not color-only.
- Failed and conflict detail panels should stay flat with semantic `warn` or `destructive` tokens rather than fixed amber/red classes, so light/dark theme behavior remains predictable.
- Queue totals, mode cards, device rows, server history rows, server conflict counts, and review actions should use semantic `success`, `warning`, `destructive`, `primary`, and `muted` tokens rather than fixed emerald/amber classes.
- Empty queues, loading/server unavailable states, blocked dependencies, device registration failures, and sync mutation failures use shared `EmptyState` or `StatusBanner` primitives.
- Manager/server conflict review must keep business-impact copy, recommended resolution, review action, and permission-aware API boundaries.
- `qa:offline-sync-flow` and `qa:offline-visuals` protect sync mechanics, dashboard banner coverage, stable QA selectors, bounded rows, manager conflict review, and shared reliability primitives.

## Mobile Redesign Acceptance Gate

The mobile redesign is complete only when source QA and hands-on evidence prompts cover the full screen set and the visual/accessibility risks called out in the redesign spec.

- `qa:mobile-redesign-acceptance` verifies the final redesign gate is exposed in package scripts and included in `qa:mvp-source`.
- The gate ensures source QA still runs the auth, first-product, dashboard, create-sale, inventory, staff, customer, subscription, product-share, offline/sync, keyboard, NativeWind, prompt-placeholder, theme, app-shell, design-foundation, and surface-structure checks.
- The hands-on evidence template must request light/dark screenshots, compact-phone overlap proof, keyboard-open states, floating bottom sheets, owner/attendant variants, offline/sync failure/conflict states, tap targets, contrast, status copy, text fit, and NativeWind discipline.
- The gate protects floating navigation tap-target/accessibility markers, shared floating bottom-sheet defaults, dashboard role/sync markers, and evidence validation hooks.
- Static acceptance does not replace device screenshots; it keeps the screenshot evidence requirements visible and validated in the normal MVP evidence workflow.

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
