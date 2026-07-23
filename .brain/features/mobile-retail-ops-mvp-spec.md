# Mobile Retail Ops MVP Spec

## Problem Statement

Small business owners need a simple mobile app that helps them start selling and tracking inventory immediately, without a bulky setup process or a confusing dashboard. A new owner should be able to open the app, sign up with Google or email, verify with an OTP, add the first product, define units and variants such as bag, half bag, or quarter bag, enter starting stock, and begin recording sales.

Owners also need to add attendants or sales reps, see sales and stock activity from an admin dashboard, and keep using the app when internet access is unreliable. Attendants need a focused sales dashboard that works online and offline, records the customer and payment method, and syncs safely when the device reconnects.

Owners and attendants also need a lightweight way to sell from a product link before the platform has a full customer app. They should be able to share a product link from the mobile app, send it through WhatsApp or any other channel, and let a customer view the product, select a variant and quantity, register or log in, and submit an order request that the business can follow up on.

The implementation must stay aligned with the Midday-inspired architecture already accepted by the project Brain: typed tRPC APIs, clear service and repository boundaries, Prisma-owned schema, shared reusable UI primitives, and no bulky monolithic feature components. The mobile UI must stay minimal, keyboard-safe, NativeWind-first, and reusable, borrowing proven mobile primitives from the GND Expo app where useful.

Dark mode should follow the user-provided mobile UI reference: a matte black canvas, soft charcoal cards and pill-like controls, crisp white primary text, muted gray secondary copy, and restrained orange/green accents for brand actions and success/online states. It should not drift back to a navy/slate-heavy palette, and the same semantic theme tokens must drive shared screens, sheets, buttons, inputs, banners, and dashboard cards.

Onboarding should use a flat mobile UI direction rather than stacked card-heavy layouts: strong whitespace, clear hierarchy, one expressive hero mark, lightweight progress, and direct action controls. Cards should be reserved for real grouped content later in the flow, not used as decorative wrappers on the first welcome/setup screens.

## Solution

Build the mobile Retail Ops MVP as an Expo app backed by the existing Hono/tRPC API and Prisma database package. The app opens through the splash screen, lands on a clean login page with an obvious sign-up path, supports Google/Gmail sign-up and email OTP sign-up, then guides a new owner through first product setup.

Installed mobile builds use EAS Update for JavaScript and asset-only releases. The native Expo config keeps `checkAutomatically: "NEVER"` so the app owns the update moment: a launch/foreground hook checks the matching channel and runtime, downloads available updates, shows a full-screen update progress modal while the app prepares and restarts, and leaves manual check/download/restart controls on the authenticated App updates screen. Preview OTA publishing uses the root `eas-update:preview` script, which follows the GND/Al-Ghurobaa account-runner pattern, delegates to the mobile `update:preview` script, bumps `UPDATE_VERSION`, and publishes to the `preview` channel/environment; native changes, dependency changes, and runtime-version changes still require a new EAS build.

After login, a user can turn on a device-local App lock from mobile Settings. The lock stores only local secure-state on the phone, uses a 6-digit PIN, can optionally call the phone's fingerprint/biometric prompt, and appears whenever the authenticated app is reopened or returns from background. This is not a replacement for account login; forgotten PIN recovery signs the user out, clears the local app lock for that user/device, and requires normal login again.

For new owner accounts, the dashboard reads the shared progressive feature
availability contract. Role-authorized bottom tabs remain stable: owners,
admins, and managers retain Home, Orders, a non-route Add action, the stable
catalog route, and More, while attendants retain their existing Home, New
Order, and Work navigation. The catalog tab label is Products for Product-only
workspaces, Services for Service-only workspaces, and Catalog for mixed or
empty workspaces. Progressive revealing instead controls dashboard metrics,
Recent Orders, contextual actions, filters, setup guidance, and capability
rows within More.
A flat setup launchpad first offers Product or Service creation, then the first
Order once a live sellable Offering exists, plus optional Staff invitation.
Pending offline work is merged into the authoritative contract until replay
completes. See
`.brain/features/progressive-feature-revealing.md`.

The four admin root screens share one floating dock. Home, Orders, and Catalog
hide it on downward scroll and reveal it on upward scroll; More keeps it fixed
to match the approved Menu reference. Create and More drill-down workflows are
full-screen routes outside the tab group, so their completion or back action
returns to the originating root tab. The More tab is titled Menu and owns
production access to workspace switching, Inventory,
Analytics, Team, Customers, conditional Service work, permission-gated Plan &
billing, App theme, App lock, Sync & offline, App updates, and confirmed Sign
out. App theme persists System, Light, or Dark through the shared device theme
preference.

Attendants are invited by the owner through email. Each attendant receives an invitation to download the app, completes a short profile setup, verifies access, and lands on an attendant dashboard. Their main workflow is creating sales from assigned inventory.

Sales creation is optimized for speed: tap the plus/create-sale action, see all sellable inventory items and variants in a compact list, select a variant or base unit, set quantity with plus/minus and numeric entry, see total immediately, choose cash or transfer, capture or select the customer name, and complete the transaction. The sale records the attendant, customer, item, variant/unit, quantity, price snapshot, payment method, and sync status.

Product sharing is web-first in the MVP. From the admin or sales-rep app, a user can open a product action and generate a public share link. The link renders a web product page with rich metadata for WhatsApp and social previews, including the product name, image, description, and tenant/business context. A customer who opens the link can view the product and variants, choose quantity, and submit an order request. First-time customers register with name, email, and password; returning customers can log in with email and password. The customer account is platform-level so the same customer can later return to any participating business without entering the same basic details again.

Shared-link orders notify the customer, the admin, and the sales rep by email. The order is recorded as a pending request so the business can discuss pickup, fulfillment, and payment with the customer. The mobile/admin experience includes a generated-links page where users can review each link, see views and order counts, review pending order requests, choose the follow-up payment method and pickup/delivery outcome, complete or cancel the request, and deactivate links that should no longer be valid.

Offline mode is a first-class MVP behavior after the user has logged in once. When offline, the app shows a top banner: "You are currently offline. Changes will sync when you reconnect." Sales and supported inventory actions, including stock intake, unit conversion, and manual stock adjustment for correction, damage, loss, or found stock, are saved to a local durable queue with idempotency keys. Reconnection syncs events to production through tRPC without duplicate sales or double stock deductions. The sync surface also shows recent server sync history and, for manager roles, unreviewed server-recorded sync conflicts that can be acknowledged from the mobile sheet. The admin Reports dashboard also surfaces tenant-level unreviewed server conflicts with sync-device filtering, CSV export, and review acknowledgement.

Subscription support is included as a plan and entitlement foundation with three tiers, plus in-app plan surfaces. Exact pricing, final plan limits, and App Store/Play Store billing mechanics can be finalized later without changing the tenant entitlement model.

## User Stories

1. As a new owner, I want to see the splash screen on app launch, so that the app feels intentional and branded before showing auth.
2. As a new owner, I want the login page to show a bold sign-up action, so that I do not miss the path for creating my business account.
3. As a new owner, I want to sign up with my Google/Gmail account, so that I can start without typing many details.
4. As a new owner, I want to sign up with only my name, email address, and business name, so that the form feels light.
5. As a new owner, I want no password requirement during first sign-up, so that OTP verification feels faster and simpler.
6. As a new owner, I want to receive an OTP by email, so that I can verify that I own the email address.
7. As a new owner, I want a polished OTP screen with separated input cells, paste support, and resend state, so that verification feels easy.
8. As a new owner, I want the OTP screen to auto-submit when the code is complete, so that I can get started quickly.
9. As a returning owner, I want to log in with Google or email OTP, so that I can access the business without remembering a password.
10. As a user with multiple businesses, I want the app to resolve my active business safely, so that data never leaks across businesses.
11. As a new owner, I want the app to detect that I have no inventory yet, so that it can guide me to add the first product.
12. As a new owner, I want a first-product modal or pop-up, so that setup feels guided without becoming a long onboarding form.
13. As a new owner, I want to enter the first item name, so that the product can appear in my inventory.
14. As a new owner, I want to enter the product's main unit name, such as bag or kilogram, so that the app matches how I sell.
15. As a new owner, I want to enter the price for each main unit, so that sales totals can be calculated immediately.
16. As a new owner, I want to add sub-units or variants such as half bag and quarter bag, so that I can sell common smaller portions.
17. As a new owner, I want every sub-unit or variant to have its own price, so that the app does not force conversion-based pricing when my real prices differ.
18. As a new owner, I want to skip variants if I do not need them, so that simple businesses remain simple.
19. As a new owner, I want to enter starting stock after product and units are defined, so that inventory begins with a known quantity.
20. As a new owner, I want to finish setup and reach the dashboard immediately, so that I can start using the product.
21. As an owner, I want to add more products later, so that my inventory can grow after the first setup.
22. As an owner, I want products and variants to be reusable across sales and inventory screens, so that data entry is not repeated.
23. As an owner, I want prices to be snapshotted on sales, so that old reports are not changed when prices change later.
24. As an owner, I want a dashboard summary of today's sales, inventory status, low stock, staff activity, and sync state, so that I can see what is happening at a glance.
25. As an owner, I want to view sales by attendant, so that I know who recorded each transaction.
26. As an owner, I want to view stock by product and unit, so that I can understand what is available.
27. As an owner, I want to see cash and transfer totals separately, so that reconciliation is easier.
28. As an owner, I want to see pending offline sync events, so that I know whether the dashboard is fully up to date.
29. As an owner, I want to invite attendants by email, so that my staff can join without sharing my account.
30. As an owner, I want invited attendants to receive a clear email with download/get-started instructions, so that they know why they were invited.
31. As an invited attendant, I want to open the app and complete a short setup form, so that I can start selling quickly.
32. As an invited attendant, I want my dashboard to show only the tools I need, so that I am not distracted by admin settings.
33. As an attendant, I want to tap a plus or create-sale button, so that I can begin a transaction quickly.
34. As an attendant, I want the create-sale screen to list inventory items in a clear way, so that I can choose the right product.
35. As an attendant, I want products with variants to show their variants directly in the list, so that I do not need extra taps.
36. As an attendant, I want product parent rows with variants to be display-only, so that I do not accidentally sell an unspecified unit.
37. As an attendant, I want products without variants to be selectable directly, so that simple products are still fast.
38. As an attendant, I want each selectable row to show product name, unit or variant name, price, and stock availability, so that I can make the right choice.
39. As an attendant, I want a quantity control with plus, minus, and numeric keyboard input, so that I can enter quantities quickly and accurately.
40. As an attendant, I want the sale total to update on the same screen as quantity, so that I can confirm the amount before checkout.
41. As an attendant, I want to choose cash or transfer at checkout, so that payment method is recorded.
42. As an attendant, I want to enter a customer name during checkout, so that the sale can be traced to a customer.
43. As an attendant, I want to select a customer from the customer book, so that repeat customers are faster to record.
44. As an attendant, I want new customer names to be saved to the customer book, so that I can find them later.
45. As an attendant, I want to complete the transaction with one clear action, so that the sale is recorded without confusion.
46. As an attendant, I want completed sales to show locally immediately, so that I can keep working even before sync finishes.
47. As an attendant, I want the app to work after I have logged in once, even if the internet goes off, so that sales do not stop.
48. As an attendant, I want a visible offline banner at the top of the app, so that I understand the current sync state.
49. As an attendant, I want offline sales to be queued safely, so that no transaction is lost.
50. As an attendant, I want queued sales to sync automatically when internet returns, so that I do not need to manually re-enter them.
51. As an attendant, I want duplicate taps or retries not to create duplicate sales, so that stock and revenue stay correct.
52. As an owner, I want offline sales to appear in the admin dashboard after sync, so that I have a complete record.
53. As an owner, I want sync failures to be visible, so that I can resolve conflicts instead of silently losing data.
54. As a business, I want plan tiers to exist in the app, so that subscription packaging is ready for paid rollout.
55. As a business, I want subscription state to be tied to the business, so that attendants inherit access from the owner business.
56. As an owner, I want to see the current plan and upgrade path, so that I understand what features are available.
57. As a developer, I want mobile screens to be broken into reusable primitives and feature components, so that the codebase does not become monolithic.
58. As a developer, I want tRPC contracts for every production mobile workflow, so that the mobile app and API stay typed end to end.
59. As a developer, I want query and mutation logic in service/repository layers, so that UI components do not contain business logic.
60. As a developer, I want NativeWind class names used consistently, so that styling remains predictable across light and dark mode.
61. As a developer, I want no unnecessary className plus style mixing on the same React Native component, so that NativeWind does not break.
62. As a developer, I want shared button, pressable, input, OTP, quantity, modal, list, and banner primitives, so that future screens reuse the same behavior.
63. As a developer, I want keyboard-aware screen and bottom-sheet primitives, so that inputs never hide behind the keyboard.
64. As a developer, I want long product and customer lists to use virtualized lists, so that the app stays smooth with real business data.
65. As a developer, I want haptics and press feedback handled once in shared pressables/buttons, so that every button feels consistent.
66. As a developer, I want local offline events to carry idempotency keys, device identity, and dependency ordering, so that sync can be retried safely.
67. As a developer, I want tenant and role checks at the API boundary, so that owners and attendants only access permitted data.
68. As a developer, I want Brain docs updated when schema or API contracts change, so that future agents do not drift from the product direction.
69. As an owner, I want to generate a share link from a product, so that I can send customers directly to that product.
70. As an attendant, I want to generate a share link for a product I am allowed to sell, so that I can promote products without needing admin access.
71. As an owner or attendant, I want the share action to copy the link clearly, so that I can paste it into WhatsApp or any other channel.
72. As a customer, I want the shared link preview to show product image, product name, description, and business context, so that I understand the product before opening it.
73. As a customer, I want a shared product link to open a clean web product page, so that I can view the product without installing the app.
74. As a customer, I want to see the product's variants or units on the web page, so that I can choose the exact item I want.
75. As a customer, I want to choose quantity on the web product page, so that I can request the number of items I want to buy.
76. As a customer, I want to see the order total before submitting, so that I can confirm the expected amount.
77. As a first-time customer, I want to register with name, email, and password during checkout, so that I can submit my order request.
78. As a returning customer, I want an "I already registered" login path with email and password, so that I do not enter my details again.
79. As a customer, I want my account to work across businesses using the platform, so that future orders are faster.
80. As a customer, I want to receive an email with my order information, so that I have a record of what I requested.
81. As an owner, I want to receive an email when an order is created from a share link, so that I can follow up quickly.
82. As an attendant, I want to receive an email or app notification when my share link generates an order, so that I can continue the conversation with the customer.
83. As an owner or attendant, I want shared-link orders to appear as pending requests, so that payment and pickup can be discussed before completion.
84. As an owner, I want to see all generated product links, so that I can manage what my team is sharing.
85. As an owner or attendant, I want to see view counts for each generated link, so that I know which links are being opened.
86. As an owner or attendant, I want to see order counts for each generated link, so that I know which links are converting.
87. As an owner, I want to deactivate a generated link, so that customers can no longer order from an expired or incorrect link.
88. As a developer, I want shared-link web ordering to stay separate from the future customer app storefront, so that the MVP can ship without overbuilding customer commerce.

## Implementation Decisions

- The mobile MVP remains an Expo app and uses the existing tRPC client/provider wiring for production data access.
- The API remains Hono plus tRPC. New workflow surfaces should be added as focused routers for auth/onboarding, catalog, inventory, staff, customers, sales, sync, reporting, and billing rather than one bulky retail router.
- Retail Ops router extraction has started for focused workflow groups. Product setup, unit templates, effective price reads, price history, and price updates live in `apps/api/src/trpc/routers/retail-ops-products.ts`; sale creation, recent sales, credit sales, and credit payment live in `apps/api/src/trpc/routers/retail-ops-sales.ts`; session listing, payment reconciliation, live session opening, live closeout submission, and closeout review live in `apps/api/src/trpc/routers/retail-ops-sessions.ts`; stock movement reads, stock intake, manual stock adjustment, and unit conversion live in `apps/api/src/trpc/routers/retail-ops-stock.ts`; staff invite, staff listing/status updates, staff stock wallets, staff stock assignment/return, public invite resolution, and authenticated staff onboarding live in `apps/api/src/trpc/routers/retail-ops-staff.ts`; subscription snapshot reads and provider-neutral checkout intent creation live in `apps/api/src/trpc/routers/retail-ops-subscriptions.ts`; product link management, generated-link analytics, shared-link order follow-up, and delivery follow-up live in `apps/api/src/trpc/routers/retail-ops-share-links.ts`. These focused routers are merged into the existing `retailOps.*` namespace so mobile procedure names remain stable while the API boundary becomes less monolithic.
- Prisma remains the schema source of truth. Repository/query modules hide Prisma specifics from services and routers.
- The domain flow remains client to tRPC router to service to repository/query module to database.
- UI components must not contain domain rules such as price lookup, inventory deduction, idempotency, or permission checks.
- Mobile screens should stay thin. Feature folders should own form schemas, hooks, small screen sections, and reusable components for the workflow.
- Shared mobile primitives should include at minimum: app pressable, app button/action button, form field, OTP input, quantity stepper, offline banner, payment selector, product/variant row, customer picker, secondary operational row/header, report metric/record/section primitives, share-link metric/record/action rows, sync reliability panel/row/stat/toggle/action primitives, session reconciliation row/stat/source primitives, first-product wizard, staff invite form, and keyboard-safe screen/sheet wrappers.
- `FormField` is the canonical mobile input surface. It should preserve the approved login/signup shell, active/error borders, helper/error copy, optional leading/trailing icons, and an embedded `Input` mode so bottom-sheet text inputs do not draw a second nested border/background. `QuantityStepper` should use the same embedded input behavior for numeric entry. `ActionButton` and compact action primitives should expose explicit `isLoading` and `loadingLabel` props rather than swapping button text locally.
- The existing GND Expo pressable pattern should be adapted so shared pressables can provide haptic feedback, Android ripple, active press feedback, disabled handling, and optional route navigation from one place.
- The existing GND keyboard-aware floating bottom sheet pattern should be adapted for modal forms and product/sale sheets that contain inputs. Feature sheets should route through the shared detached `Modal` primitive, keep platform bottom inset, side inset, rounded theme-aware surfaces, close-on-backdrop/pan-down behavior, Android resize, keyboard restore, and interactive keyboard behavior instead of rendering raw bottom-sheet modals directly.
- Existing theme, color, and icon helpers from the current mobile app and GND reference should be used or adapted so dark mode remains consistent.
- NativeWind is the default styling approach. A component should use className only where possible. When dynamic runtime style is required, the affected component should be structured so the same native element does not unnecessarily mix className and style.
- Tailwind/NativeWind classes should be preferred over inline styles for spacing, layout, color, typography, borders, and state variants.
- All auth and onboarding forms must be keyboard-safe. Inputs must remain visible above the keyboard on common phone sizes.
- Signup supports two methods: Google/Gmail and email OTP.
- Email signup collects name, email address, business name, and required
  operating currency in the first form. Google and OTP sign-up carry the
  selected currency into tenant and first-store creation.
- OTP verification creates or resumes the owner account, creates the initial business/tenant context, and opens the app session.
- OTP entry should feel like a compact reference-led PIN verification surface: a minimal off-white/light or matte dark canvas, circular back action, centered headline/copy, separated display cells, in-screen rounded numeric keypad with phone-letter hints, clipboard paste/delete support, resend state, and auto-submit when the six-digit code is complete.
- OTP emails should use the shared email/notification/job packages rather than screen-local fetch logic. For exact `@test.com` submitted emails, outbound OTP delivery routes to `TEST_EMAILS` or the legacy `TEST_EMAIL` fallback while preserving the submitted account email for verification.
- Development and preview mobile login use the same email-code form as production; there is no fixed-code OTP or local auth bypass.
- Returning login should support Google/Gmail and email OTP. Password login is not required for this MVP unless existing auth infrastructure forces it.
- Returning login OTP requests must verify that the submitted email belongs to an existing account with available business context before creating a verification row or sending email. Missing-account and no-business login attempts should stay on the login screen with a clear error, not route into the local fallback OTP flow.
- The first production mobile auth bridge now exposes email OTP plus Google identity verification. `auth.requestMobileOwnerOtp` and `auth.verifyMobileOwnerOtp` persist OTPs in the shared `Verification` table after login preflight passes, send codes through the shared email package, create bearer sessions for the Expo app, and resolve owner tenant/business context. `auth.verifyMobileGoogle` verifies Google ID tokens against configured client-id audiences, links the Google account, and issues the same mobile session shape. Live Google sign-in still depends on adding the Google Cloud client IDs to the mobile/API environment and running provider QA. Credential setup details live in `.brain/features/mobile-google-oauth-setup.md`.
- After first authenticated entry, the app checks whether the active business has at least one sellable product/inventory setup.
- If the business has no sellable product/inventory setup, the app shows a first-product modal/wizard before normal dashboard use.
- The mobile dashboard now auto-opens the first-product setup sheet once per active empty business, using production summary inventory counts when online and local empty-inventory state as the offline or production-unavailable fallback.
- The first-product wizard is intentionally short: item name, media, then either a primary unit with price/current stock or variant rows with their own price/current stock.
- The first-product wizard should use a flat guided setup treatment with progress, line-style inputs, manual unit entry, optional variant divider rows, and compact stock summary rows rather than decorative nested cards.
- The mobile first-product wizard should create the product through `retailOps.createProduct` when online, persist returned product/unit ids into local state as synced, and use the local queued product setup path only while offline.
- The first-product wizard no longer shows unit-template choices or sends `unitTemplateKey`; owners enter the primary unit manually only when there are no variants, and add optional manual variants/sub-units with their own prices, stock, and conversion multipliers.
- Once at least one variant exists, primary-unit fields are hidden and no longer required in the mobile UI; product creation still sends an internal non-conflicting parent unit with zero stock to satisfy the current backend product setup contract.
- When the primary unit field is focused, the mobile wizard shows a horizontal keyboard accessory of quick unit suggestions, filtered by typed text and falling back to the full suggestion list when empty or unmatched.
- Add variant now defaults to an inline keyboard-sticky composer: it first shows filtered variant-label chips above a chat-style input, then stays open to collect values for the selected label. Existing values appear first as removable chips, common values are mapped from the selected label, and value entry shows a checkmark action that commits any unfinished value and closes the composer. The checkmark remains available after selecting a suggestion. A comma commits each completed value without appearing in the input; keyboard Done commits any remaining text and closes the composer. Functional duplicate detection keeps rapid typing and pasted comma-separated values idempotent. The composer also closes when the keyboard is otherwise dismissed or the user taps back into the form, and the older modal label/value sheets remain in code as a rollback path while the inline composer is tested.
- Once more than one variant value exists, setup hides the introductory Variants title and description and replaces the section with `Variants` and `Stocks` tabs. The Variants tab groups values under their variant label, supports adding values inline, opens compact bottom actions for renaming/removing labels and editing/removing/enabling/disabling individual values, and ends with an active `Add variant` action. The validation-aware final `Add item` action appears in Stocks, where the required sellable-row prices and stock are visible.
- Variant-label and value edits reuse the keyboard-sticky composer with a check action; submitting from the check action or keyboard saves and closes the composer, and value-edit mode strips commas so it can update only one value.
- The Stocks tab keeps the existing generated sellable rows and their price, stock, and optional media fields. Variant inventory entry uses the explicit `Current stock` label and placeholder instead of the ambiguous `Qty`; the row action offers Enable/Disable instead of delete. Disabled stock rows and rows inheriting a disabled variant value sort after active rows without losing their own stock-level enabled state.
- `retailOps.unitTemplates` remains part of the product-unit API for reusable template infrastructure outside this first-product mobile setup surface.
- Product is the parent entity. A sellable unit or variant is the selectable sale entity.
- If a product has variants, the product parent row appears as a label/header and is not directly selectable in create-sale.
- If a product has no variants, the default primary unit row is selectable in create-sale.
- Product/unit price changes must preserve historical sale snapshots. Do not compute historical sales from the latest product price.
- Mobile persisted product prices, sale unit prices/totals, and closeout payment
  amounts use explicit integer `*Minor` fields. Persist version 1 migrates the
  legacy local major-unit fields once by multiplying by 100; it does not rewrite
  server-side prices.
- Money entry uses the shared `MoneyField`, which renders the active-store
  currency as non-editable text, groups digits while typing, preserves empty and
  trailing-decimal states, and emits a normalized major-unit decimal string.
  Domain validation remains at the feature boundary.
- When online and a sale timestamp can differ from now, create-sale total previews should use `retailOps.productUnitPriceAt` before recording the sale.
- Inventory balance changes should be ledger-backed where possible: starting stock, stock intake, sale, adjustment, assignment, return, and sync correction.
- Inventory stock-operation UI should use reusable flat inventory primitives for product rows, unit choices, restock/adjust toggles, and movement history instead of local card-heavy widgets.
- The mobile Stock intake sheet should call `retailOps.recordStockIntake` or `retailOps.recordStockAdjustment` when online and the selected unit has a production id; otherwise it should keep using the local queued stock movement path so product/unit dependencies sync first.
- The mobile Unit conversion sheet should call `retailOps.recordUnitConversion` when online and both the source primary unit and target variant have production ids; otherwise it should keep using the local queued conversion path so product/unit dependencies sync first.
- Starting stock from onboarding should create an auditable inventory movement, not only mutate a balance field.
- Staff/attendant invites use membership and role concepts. Owners/admins can invite attendants; attendants cannot invite staff or manage subscription settings.
- Staff invite emails should be sent through the shared notification/email flow and include app download/get-started instructions.
- The mobile Staff invite sheet should read production attendant memberships when online, send online invites through `retailOps.inviteStaff`, and fall back to the local queued invite path when the device is offline.
- Staff, customer, business switching, and subscription management sheets should use shared secondary operational headers and divider/selectable rows for compact names, metadata, source state, status badges, plan usage, workspace selection, and order/staff counts instead of local card-heavy list rows.
- Attendant onboarding should collect only minimal profile details required to accept the invitation and create a usable session, using the same shared secondary header, divider row, status badge, and status banner treatment as staff management rather than card-heavy invite summaries.
- The first mobile attendant acceptance path is account-owned email OTP plus `retailOps.completeStaffOnboarding`: invited cashier/operator/manager memberships can authenticate into an invited session, complete a short name/display-name setup screen, activate their own membership, and then land on the focused attendant dashboard without using owner credentials.
- The admin dashboard should show sales totals, inventory status, low-stock signals, staff activity, customer book entry points, sync state, tenant-level server sync conflicts, and subscription status.
- Dashboard summary metrics, quick actions, summary panels, stat tiles, inline statuses, and preview records should stay reusable and flat: divider-based rows, clear icons, semantic primary/success/warn/destructive states, and no decorative card-heavy local widgets.
- The mobile Dashboard should read `retailOps.summary` and `retailOps.recentSales` when online for headline sales, pending-order, low-stock, active-rep, stock-unit, report-summary, and recent-sale surfaces, while keeping local state as the offline or production-unavailable fallback.
- The mobile Dashboard should also read production subscription and staff
  contracts when online, preserve the production business id in local state,
  and use the authenticated membership role to hide owner-only management
  surfaces from cashier/operator dashboards. Until a dedicated Customer entity
  and router exist, customer previews must be derived from commercial orders
  and pending offline order commands instead of calling a nonexistent customer
  contract.
- Dry-cleaning stores should expose a mobile Services workflow from owner/admin and sales-rep homes. The first production-backed mobile service-order route uses `retailOps.dryCleaningServiceItems`, `retailOps.dryCleaningSettings`, `retailOps.dryCleaningServiceOrders`, `retailOps.createDryCleaningServiceItem`, `retailOps.updateDryCleaningSettings`, `retailOps.createDryCleaningServiceOrder`, and `retailOps.updateDryCleaningServiceOrderStatus` so mobile service setup and intake reuse the same contracts as the dashboard.
- The mobile Services workflow should keep setup and intake lightweight: owner/admin users can create service items with SM/LG variants and manage express surcharge, while owner/admin and sales-rep users can select a service variant, set quantity with the shared quantity stepper, capture customer details, set payment status, due timing, native photo/video intake evidence or a manual evidence link, and notes, then review and advance due service orders.
- Native mobile intake evidence uses `expo-image-picker` camera capture with configured camera, microphone, and photo permission copy. Captured asset URIs and manual evidence links are sent through the existing dry-cleaning evidence metadata contract; cloud upload and cross-device media hosting remain a later storage slice.
- Mobile emulator QA for this workflow uses a dev/preview-only real-session import route plus `qa:mobile-real-session`. The runner creates local API-backed owner or activated staff sessions through `auth.requestMobileOwnerOtp`, `auth.verifyMobileOwnerOtp`, `retailOps.inviteStaff`, and `retailOps.completeStaffOnboarding`, switches the fresh store to `dry_cleaning_laundry`, can seed the requested Shirt and trouser, Agbada, Jalabia, and Iro and Buba case-study services with SM/LG variants plus mixed paid/after-service/delivery orders, and then opens `/service-orders-modal` on Android. This keeps runtime proof on production tRPC contracts while keeping the QA import route out of production builds.
- Dry-cleaning service orders are not yet part of the offline replay queue. The mobile Services workflow must show a clear online-required/offline-warning state until service-order events have durable offline envelopes, idempotent replay, and conflict handling.
- The attendant dashboard should prioritize create sale, recent sales, assigned/available inventory, customer lookup, and sync status.
- The mobile clock-in sheet should call `retailOps.openSession` when online and every opening inventory unit has a production id; otherwise it should keep using the local queued session path so product/unit dependencies sync first.
- The mobile Closeout sheet should call `retailOps.closeSession` when online, the open rep session has a production id, no local changes are pending sync, and every closing inventory unit has a production id; otherwise it should keep using the local queued closeout path so sales, customers, stock, and product/session dependencies sync first.
- Mobile clock-in and closeout sheets should use shared session reconciliation primitives for source state, opening/closing stock declaration rows, payment variance rows, summary stats, empty states, and submit errors. These surfaces should stay flat, keyboard-safe, semantic-token based, and operational rather than using local card-heavy session widgets.
- Create-sale is a staged full-screen workflow: select Items first, choose or
  skip a Customer second, and Review payment plus totals before confirmation.
- The Items stage uses a virtualized flat divider list for the real catalog.
  Every sellable offering shows its product/service context, unit or variant,
  price, and truthful availability; tapping it reveals a compact right-aligned
  numeric quantity field and strong line total. A keyboard-sticky bottom search
  remains visible, with a floating overall total and full-width Proceed action
  above it after at least one item is selected. While any quantity field is
  focused, the search field hides so the total and Proceed action become the
  only keyboard-sticky footer controls; the search returns when quantity entry
  ends.
- The Customer stage uses the same keyboard-sticky bottom-search pattern. Create
  customer and Skip/guest are the first actions, followed by filtered recent
  customer suggestions derived from commercial orders. Create customer opens a
  focused bottom-sheet contact form; the contact is attached to the commercial
  order because a standalone Customer write contract does not yet exist.
- The Review stage shows the selected lines, customer or guest state, overall
  total, payment-method choices, and an amount-received money field. It computes
  received and balance-due values before confirmation and supports unpaid,
  partial, and fully paid outcomes. Online confirmation creates the idempotent
  commercial order, then records any non-zero payment through the idempotent
  payment contract. Offline orders may still queue, but payment entry remains
  disabled until the order has synced.
- Checkout offers Cash, Transfer, and POS payment choices for in-person sales.
- Customer Book and Customer overview currently derive stable customer
  identities from customer name, email, and phone captured on the latest 100
  production commercial orders, then merge pending offline commercial-order
  commands. Values remain grouped by currency, pending rows are never labelled
  as synced, and unsupported profile fields are omitted rather than inferred.
- Shared-link web checkout should also feed the durable customer book for the business, including platform customer account identity when the customer registered or logged in on the web order page.
- Offline replay of queued `customer_upsert` events should reconcile the returned production customer-book id into the local customer record, so offline fallback views can distinguish device-only customers from customers already seen by production.
- Sale creation snapshots product name, unit/variant name, quantity, unit price, total, payment method, attendant, customer, tenant, store, and client idempotency key.
- The mobile Create sale sheet should call `retailOps.createSale` when online and the selected product unit plus rep session already have production ids; otherwise it should keep using the local queued sale path so product/session dependencies sync first.
- Offline replay of queued `sale_created` events should reconcile the returned production order id into the local sale record, so later dashboard, customer, closeout, and duplicate-replay flows can refer to the durable sale.
- Mobile quantity inputs that map to production `quantity`, `sourceQuantity`, `targetQuantity`, `countedQuantity`, or `openingStockQuantity` fields should normalize to whole numbers before submit so the app does not send decimal values to integer tRPC contracts.
- Product share links are part of the MVP as a web-first ordering surface generated from product actions in the mobile/admin experience.
- Product share-link management UI should use reusable share-link primitives for analytics panels, generated-link metric tiles, link record rows, follow-up option pills, native share/copy actions, careful deactivation, shared-link order follow-up, and delivery status actions instead of local card-heavy link widgets.
- A generated share link must map to the tenant/business, product, creator, and optional campaign/link record through an opaque slug or token rather than exposing predictable database ids.
- A generated share link should use the business storefront hostname when available, including the tenant subdomain, while keeping the tenant/store/product path and opaque share token for lookup and analytics.
- The mobile Product links sheet now supports production link creation, local queued fallback creation, native share-sheet presentation, active/inactive management, production deactivation, local queued deactivation, and link rows that show product, creator, creation time, status, views, orders, and last activity.
- The public product page must render server-side metadata for link previews, including title, description, image, and canonical URL, so WhatsApp and similar clients can display a useful preview.
- Shared-product metadata should use the actual request host, including the business subdomain or verified storefront domain, for canonical and preview-image URLs so shared links preview against the same storefront URL customers open.
- The shared product page supports product viewing, variant or unit selection, quantity entry, total preview, and order-request submission.
- The storefront shared-product order form now keeps the direct product-link flow but renders the order controls in a small client component so selected unit/variant and quantity update the total before the server-action submit.
- Share-link checkout supports first-time customer registration with name, email, and password, plus returning customer login with email and password.
- Customer identity for shared-link checkout is platform-level. Tenant-specific customer history and order relationships remain scoped by business to avoid leaking tenant data.
- Shared-link order submission creates a pending order request rather than an immediately paid sale. The pending request reserves the selected unit quantity until the business completes or cancels follow-up; the business still follows up with the customer for pickup, fulfillment, and payment. During follow-up, the business can complete the request with cash, transfer, or card payment so the order is marked paid and a receipt is created, can capture the pickup/delivery fulfillment outcome, and can create and status-update an order-linked delivery request with pickup/dropoff details when delivery is needed.
- Shared-link order requests should notify the customer, admin, and responsible sales rep through the shared email/notification/job packages. A notification enqueue failure after order creation must not make the customer think the order failed; the order request should remain visible with dispatch status for follow-up. Enqueued shared-link notifications are recorded as queued first, then the background email dispatch writes per-recipient provider delivery receipts, failure reasons, provider message ids, and retry metadata.
- Generated links have an owner-visible management surface with active/inactive state, creator, product, creation time, view count, order count, last activity, pending-order reservation status, notification dispatch status, and compact follow-up controls for payment method plus pickup/delivery outcome.
- The mobile Product links sheet now lets permitted users create delivery requests for shared-link orders marked for delivery and status-update existing delivery requests as assigned, picked up, delivered, or cancelled without leaving the generated-link management surface.
- Deactivated links must return a clear invalid or unavailable state and must not accept new order requests.
- Link view and order analytics should be event-backed so counts can be recomputed or audited later.
- Durable share-link schema and migration foundations now exist for links, events, views, order-request attribution, stock reservation, notification audit, and daily analytics rollups. Live APIs now use durable `ProductShareLink` rows first for create/list/deactivate/public lookup, record durable view/order events when available, mirror shared-link checkout into durable order-request/reservation/per-recipient notification audit rows, read shared-link order requests from durable rows first, write daily analytics rollups for views/order requests/follow-up outcomes when available, use those rollups for generated-link view/order counters, expose a protected `retailOps.productShareLinkAnalytics` read surface for summary/per-link/daily reporting, record queued/background provider notification delivery outcomes with retry metadata, support paid completion with receipt creation and fulfillment outcome capture for follow-up, expose first protected delivery-request create/list/status APIs for shared-link orders, and keep product/order metadata as rollout fallback. The mobile Product links sheet now sends compact payment and fulfillment follow-up selections when completing a pending request. Pending stock reservations still use the existing inventory balance bridge, and richer mobile/web analytics UI remains a separate follow-up.
- Full customer app browsing and checkout is a later extension. The MVP should keep the product-link web flow small, direct, and compatible with that future path.
- Offline mode is available only after a successful login has established session and tenant context.
- Session tokens stay in secure storage. General preferences can stay in lightweight async storage. Offline sales and sync queues should use a durable local persistence layer suitable for ordered transactional events.
- Mobile App lock is a post-login, per-user, per-device protection layer. Its PIN hash, salt, biometric preference, failed-attempt counters, and unlock timestamps stay in `expo-secure-store`; no lock code, biometric state, or recovery event is synced to production APIs.
- Offline events use a sync envelope containing client event id, tenant id, store id, actor user id, device id, event type, payload, created at, dependency ids, and retry state.
- The mobile local sync queue now stores event envelopes with business/tenant id, optional store id, actor name when known, offline device id, event type, entity id, dependency metadata, retry status/count, and created/updated timestamps. Typed tRPC payloads are derived from the persisted local product, customer, sale, session, staff, share-link, and stock records at replay time so remote ids from earlier dependency events are used before later events sync.
- Sync mutations must be idempotent. Replaying the same client event must not duplicate sales, customers, or inventory movements.
- Offline rep-session and closeout replay should include opening and closing inventory declarations once the related product/unit ids have synced, rather than replaying only the session lifecycle shell.
- The offline banner is always visible when offline and should not block the primary sale flow.
- Sync status should distinguish offline, pending, syncing, synced, failed, and conflict.
- The mobile Sync status sheet now separates local device queue failures from server-recorded conflicts, shows current-device sync history, shows current-device and business-wide unreviewed conflict counts, explains business impact plus recommended actions on failed/conflict rows, and lets manager-capable users acknowledge server conflicts without clearing unresolved local device failures.
- The mobile Sync status sheet uses shared `SyncReliabilityPanel`, `SyncReliabilityRow`, `SyncReliabilityStat`, `SyncReliabilityToggle`, and `SyncReliabilityAction` primitives for mode state, offline toggle, device identity, device management, last sync summary, server sync history, queue totals, server conflict counts, local queue events, dependency-blocked rows, retry/review controls, and conflict/failed detail states so reliability UI stays flat, semantic-token based, haptic, and consistent with the broader mobile redesign.
- The mobile Reports sheet now includes tenant-level unreviewed server conflict counts plus an all-devices/current-device conflict filter, so admins can inspect production sync conflict exposure without leaving the operational report surface.
- Mobile report surfaces should use shared `ReportMetricTile`, `ReportRecordRow`, and `ReportSection` primitives for sales, inventory, credit, variance, movement, source, and conflict rows so reports stay bounded, flat, semantic-token based, CSV-aligned, and readable in light and dark mode.
- Conflict handling should be explicit for duplicate sale, unavailable product, insufficient stock, stale assignment, closed session, and permission failure.
- Subscription architecture should introduce business/tenant entitlements and three plan tiers while leaving final pricing and store billing setup configurable.
- In-app subscription surfaces should show plan state and upgrade path, but hard billing provider coupling should stay behind a service boundary.
- The mobile Subscription sheet should read `retailOps.subscription` when online, request upgrades through `retailOps.createSubscriptionCheckoutIntent`, and keep local plan state only as the offline or production-unavailable fallback.
- The mobile Subscription sheet now shows production subscription state, backend-owned Starter/Growth/Pro tier definitions, current plan status, usage against limits, and provider-neutral checkout responses; offline or production-unavailable fallback is read-only and does not claim a completed upgrade.
- React Native performance decisions follow the provided best-practices guide: measure before speculative optimization, use virtualized lists for long lists, avoid expensive broad re-renders, and avoid premature memoization without evidence.
- The first implementation should remove copied sample commerce data and copied GND language from mobile user-facing screens.
- Form placeholders should use direct prompt copy, such as `Enter your email address`, not sample people, businesses, emails, products, addresses, or numeric expected values.

## Testing Decisions

- Tests should verify external behavior and domain outcomes, not internal component structure.
- The preferred highest seam is a mobile workflow seam that covers auth/OTP, first product setup, sale creation, offline queueing, reconnect sync, and dashboard visibility.
- API tests should use tRPC caller-level tests for workflow contracts such as sign-up/verify, create product setup, invite staff, create sale, upsert customer, queue sync, and resolve dashboard summaries.
- Domain tests should cover price snapshotting, unit/variant selection rules, starting stock movements, sale inventory deduction, customer creation, permission checks, and subscription entitlement checks.
- Shared-link tests should cover link creation, opaque token lookup, active/inactive behavior, product metadata rendering, product/variant selection, customer register/login, pending order creation, and email notification dispatch.
- Analytics tests should cover view counting, order counting, and deactivated links not accepting orders.
- Sync tests should cover duplicate event replay, out-of-order dependencies, retry after failure, and conflict states.
- Mobile interaction tests should cover keyboard behavior on signup, OTP, first-product setup, quantity entry, customer entry, and checkout.
- Web interaction tests should cover shared product page rendering, rich-preview metadata, variant/quantity order flow, first-time registration, returning login, and customer/order email states.
- Long-list behavior should be tested or manually verified with enough products/customers to force virtualization.
- Visual QA should verify light and dark mode, safe areas, compact phones, OTP field fit, quantity control fit, offline banner placement, and modal/sheet keyboard behavior.
- App-lock QA should verify PIN setup/confirmation, lock on app reopen/foreground, wrong-code lockout feedback, fingerprint bottom-left keypad action when available, code fallback when biometrics are unavailable, and forgotten-PIN sign-out reset.
- The final device smoke pass should use `bun run --cwd apps/mobile qa:mvp-hands-on-checklist` so launch/auth, first product, dashboard, staff/session, sale/customer book, offline sync, inventory/reports/subscription, and shared-link checkout evidence is gathered consistently without printing secrets.
- Installed preview/release build QA should verify EAS Update behavior from the App updates screen and the launch/foreground auto-update modal after publishing an OTA update to the matching channel/runtime.
- Prior art should be taken from Midday's API tRPC tests and database query tests, plus the GND mobile invoice-form keyboard and haptic patterns.
- Required checks for implementation work should include typecheck, lint/format where available, targeted API/domain tests, and mobile smoke testing through Expo.
- Brain docs must be updated in the same change when schema, API contracts, or product behavior changes.

## Out of Scope

- Detailed final subscription prices and exact tier limits.
- Final App Store and Play Store billing implementation details, unless chosen before implementation begins.
- Full end-of-day closeout and cash reconciliation beyond recording cash/transfer totals and sales by attendant.
- Credit limits, approval workflows, automated reminders, durable aging reports, and durable customer account-balance management beyond first-phase repayment and due-date aging.
- Barcode scanning.
- Delivery/logistics workflows.
- Full marketplace/storefront browsing beyond direct shared product pages.
- Native app-based customer browsing and checkout.
- Direct online payment collection from shared product links, unless a payment provider is selected before implementation begins.
- Advanced analytics exports.
- Multi-location inventory transfer workflows beyond the first store/business setup.
- Native performance profiling unless a measured performance issue appears.

## Further Notes

- This spec consolidates and sharpens the existing Brain plans for mobile onboarding, mobile dashboard, flexible product units, sales recording, staff management, offline sync, reports, and subscription packaging.
- The implementation should not drift from the accepted Midday-inspired monorepo structure and should continue to use GND as a reference for mobile UI primitives, not as copied product language.
- The first implementation can be split into smaller execution issues, but the user-facing MVP should preserve the complete flow: sign up, verify, add first product, enter stock, invite staff, create sale, capture customer/payment, sync offline work, and review dashboard activity.
