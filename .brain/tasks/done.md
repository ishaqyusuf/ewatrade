# Done

### Adaptive New Order Product Picker

- Priority: Medium
- Description: Replaced the catalog-first Create Sale Items screen with an
  empty order canvas, safe-area-aware FAB, adaptive compact/full-screen
  sellable-item picker, staged avatar selection, bottom search, and editable
  selected order lines.
- Related Feature: Adaptive New Order Product Picker
- Status: Done
- Plan Status: Done
- Plan File: .brain/plans/2026-07-23-feature-adaptive-new-order-product-picker.md
- Completed Date: 2026-07-24
- Checks Run: focused picker/checkout/pagination tests; mobile TypeScript;
  Create Sale, pagination, keyboard, NativeWind, and theme guards; diff
  hygiene; authenticated Android empty-canvas/FAB visual QA.

### Mobile Infinite-Query Direction Contract

- Priority: High
- Description: Fixed strict API validation for Orders, Catalog, and Service Job
  cursor pages by accepting the optional forward/backward pagination direction
  metadata added by the tRPC TanStack infinite-query integration.
- Related Feature: Mobile List Pagination And Search Density
- Status: Done
- Completed Date: 2026-07-23
- Checks Run: focused API schema regression tests and scoped diff validation.

### Mobile Query Pull-To-Refresh

- Priority: Medium
- Description: Added one theme-aware native pull-to-refresh control for active
  query data across Home, Orders, Catalog/Products, Customers, Reports,
  Service Jobs, Sync Status, business switching, subscription, and Commercial
  Order detail while leaving transactional form-first workflows unchanged.
- Related Feature: Mobile Retail Ops MVP
- Status: Done
- Completed Date: 2026-07-23
- Checks Run: mobile TypeScript, two-axis standards/spec review, diff
  validation, and Android emulator swipe checks on Home, Orders,
  Catalog/Products, and Customers. Emulator QA caught and corrected an Android
  layout collapse by forwarding the native `ScrollView` props injected into
  the shared refresh control. Published corrected Android preview OTA
  `2026.07.23.04`, update group
  `fcae3af0-0030-468c-8470-cd62b8384947`. EAS found no compatible Android
  build for fingerprint `4218af36e17744f428446a5f2dec068b1f71cd9b`,
  so a matching preview binary is required before devices can install it.

### Mobile List Pagination And Search Density

- Priority: High
- Description: Added stable cursor loading and server-side search for Orders,
  Catalog, Customer Book, Create Sale item/customer pickers, and Service Jobs;
  added incremental local loading for business selection; removed the Staff
  six-row cap; and standardized bottom-search visibility to totals greater
  than 10. Offline list search now filters the cached base page, and Customer
  overview marks partial history until remaining pages finish loading.
- Related Feature: Retail Ops mobile design system and IA
- Status: Done
- Completed Date: 2026-07-23
- Checks Run: focused schema/list-helper tests; mobile and database TypeScript;
  list-pagination, commerce, create-sale, Service Jobs, keyboard, admin-tabs,
  NativeWind, and theme-color guards; Android app-launch/accessibility review.

### Mobile Bottom Search And Operational UI Corrections

- Priority: High
- Description: Aligned no-tab searches and fixed actions to one compact safe-area footer; removed repeated Product/Service form badges; moved quick-setup replacement confirmation into a floating sheet; protected dock label fit; split Home Product and Service actions; redesigned Record Stock; restored Customer overview tabs with truthful contract-backed content; and repaired Subscription plan text composition.
- Related Feature: Retail Ops mobile design system and IA
- Status: Done
- Completed Date: 2026-07-22
- Checks Run: mobile TypeScript; keyboard coverage; dashboard redesign; commerce operations; admin tabs; subscription flow; NativeWind style; Android accessibility/bounds QA for bottom Catalog search, quantity-focus Total/Proceed footer, Add Staff action, Product form, Subscription plan rows and final action, and Record Stock layout.

- Refined the mobile bottom-search pattern to match the GND Expo customer
  selector: Create Sale item/customer search and Catalog quick setup now use an
  inset muted search field without a hard footer divider. Focusing any Create
  Sale quantity hides the Product/Service search while the total and Proceed
  action remain keyboard-sticky, then restores search when quantity entry ends.
  Completed Date: 2026-07-22. Checks Run: mobile TypeScript; create-sale-flow,
  keyboard-coverage, NativeWind-style, theme-color, targeted Biome, and diff
  guards. UI testing was skipped at the owner's request.
- Redesigned mobile Create Sale as a staged Items, Customer, and Review workflow.
  The Items stage now has a virtualized flat catalog, keyboard-sticky bottom
  search, compact right-aligned quantity entry, per-line totals, and a floating
  overall total/Proceed footer. Customer selection now starts with Create
  customer and Skip/guest, filters recent order-derived contacts, and provides a
  focused bottom-sheet contact form. Review now captures Cash, Transfer, or POS,
  accepts the amount received, previews paid/balance values, and records an
  idempotent partial or full payment after order creation. Added exact checkout
  arithmetic tests and strengthened create-sale/keyboard mobile guards.
  Completed Date: 2026-07-22. Checks Run: mobile TypeScript; checkout model
  tests; create-sale-flow, keyboard-coverage, NativeWind-style, theme-color, and
  Android-ready guards; authenticated Android production-app render.
- Promoted the approved Design 01 commerce direction into the production mobile
  app. Admin Orders now uses live commercial orders plus pending offline rows,
  truthful bounded metrics, search/date/status filters, and reusable
  theme-compatible commerce primitives. Customer Book now derives safe customer
  summaries and overview history from captured order contacts without inventing
  unsupported profile fields. Added a protected live Order overview with real
  `orders.get`, payment recording, eligible Product-line fulfilment, totals,
  customer navigation, and activity. Service fulfilment remains in Service
  jobs. Completed Date: 2026-07-22. Checks Run: mobile TypeScript; focused
  commerce model tests; commerce, admin-tab, app-shell, keyboard, NativeWind,
  theme-color, and diff guards; Android production-route review.
- Added the internal Design 01 commerce approval flow for Orders, Customers,
  Customer overview, and Order overview. The reusable theme-compatible mobile
  surfaces use static Nigerian sample data, searchable/filterable virtualized
  lists, typed detail routes, semantic status treatments, linked customer/order
  navigation, source-board actions, hide-on-scroll review controls, and
  local-only payment and fulfilment demonstrations. Landscape source boards
  open on a review-scale horizontal canvas, hide controls while panned, and
  return to the relevant preview. Registered the five owner-provided boards and
  Android light/dark/scroll/action evidence under the repository-root `.design/`
  folder. Completed Date: 2026-07-22. Checks Run:
  mobile TypeScript; Design 01 playground, NativeWind style, theme-color, and
  theme-variable guards; Android Expo export; Pixel 3a route, theme, scroll,
  and order-action review; `git diff --check`.
- Redesigned the mobile owner/admin and attendant Home surface from the approved
  commerce reference. The production screen now uses a greeting/business
  header, sync attention and profile actions, paired workspace metrics, a
  primary recent-revenue panel, role-aware flat shortcuts, and bounded recent
  orders with real status badges and an actionable empty state. Unsupported net
  profit and trend values were intentionally replaced with truthful live
  Catalog, inventory, service-work, order, and bounded revenue data. Completed
  Date: 2026-07-22. Checks Run: mobile TypeScript; dashboard, NativeWind,
  theme-variable, theme-color, admin-tab, and app-shell guards; `git diff
--check`; Android Pixel 3a debug-build screenshot review for the empty owner
  workspace and scroll/dock composition.
- Added Store-scoped Business Profile personalization across marketing signup,
  mobile OTP/Google signup, dashboard first-Store setup, tenant context, and
  Catalog quick-setup recommendations. The shared versioned library launches
  with 15 searchable categories and captures operating model, order channels,
  team size, and conditional Other/Mixed detail without introducing runtime
  industry branches. Completed Date: 2026-07-21. Verification was limited at
  the user's request; focused tests and package/mobile typechecks completed
  earlier in the implementation, while final broad checks were intentionally
  skipped.
- Fixed persisted mobile App theme restoration after OTA/JS reloads. A small
  observable runtime now makes explicit Light/Dark preferences authoritative
  without waiting for React Native to emit an appearance event, while System
  continues following the device. Theme storage hydrates before the splash
  closes, and More plus the development toggle share the runtime selection.
  Completed Date: 2026-07-21. Checks Run: 3 focused runtime tests, theme-color,
  NativeWind theme-variable, and admin-tab guards, plus scoped diff checks.
  Mobile TypeScript reached three pre-existing `business-profiles.ts` unknown
  type errors. Android QA was attempted twice; the first launch exposed a dead
  Metro transport and the restarted emulator later detached from ADB before
  the persistence interaction could be completed.
- Replaced the admin mobile shell with protected Home, Orders, non-route `+`,
  stable dynamic Catalog, and More tabs; added reference-led Menu, persisted
  App theme selection, root Orders/Catalog states, shared Create actions,
  production capability rows, and root-only dock ownership. Home, Orders, and
  Catalog now hide/reveal the dock with scroll direction while Menu keeps it
  fixed. Registered the supplied Menu reference and archived 143 non-runtime
  raster artifacts from `.scratch/` under ignored root `.designs/` paths.
  Completed Date: 2026-07-21. Checks Run: focused admin navigation tests;
  admin-tab, design-system, app-shell, dashboard, NativeWind, theme, reports,
  subscription, offline, Service Work, commercial-order, App lock, and theme
  variable guards; mobile TypeScript before the final scroll-behavior override;
  scoped diff checks. The existing keyboard guard remains stale against two
  untouched Catalog files, and final Android capture was interrupted before
  evidence collection.
- Allowed Products to save with blank base, option-unit, and opening-stock
  values without coercing missing prices to zero. Incomplete Offerings remain
  visible in sale selection but are disabled with `Price not set` and/or `Out
of stock` across mobile and dashboard; fixed-price order payloads still
  require a real price, and mobile sale stock snapshots are active-Store
  scoped. Updated the online and offline contracts together.
  Completed Date: 2026-07-21. Checks Run: 13 focused
  catalog/pricing/availability tests, workspace typecheck,
  mobile TypeScript, NativeWind/theme/create-sale guards, and diff validation.
- Fixed option-only Product pricing so setting the counted-in price for one
  option no longer fills its blank additional-unit listings. Display,
  validation, and Offering payload construction now share one resolver; blank
  option × unit rows show `Price not set` and remain unset until explicitly
  priced. Completed Date: 2026-07-21. Checks Run: focused regression test,
  mobile TypeScript, NativeWind and theme-color guards, and diff validation.
- Added Product `Multiple Price Options` setup directly after the name field.
  Enabling it disables the Product base price and selling-unit default prices,
  reveals Options, and routes pricing through enabled option combinations. The
  generated Product listings now sit below Unit setup in a dedicated `Product
stock & pricing` section, expand every option across its counted-in and
  additional selling units, use flat Unit-style summaries, open Edit from the
  row itself, and retain the menu for Edit and Disable/Enable. Completed Date:
  2026-07-21. Checks Run: automated and UI testing skipped by owner request;
  formatting and final diff inspection only. Published as Android preview OTA
  `2026.07.21.01`, update group
  `96c276c5-12a7-449e-a52a-9c00290f1b27`. EAS reported no compatible build for
  Android fingerprint `68ccac3689caebcdd7b2691602ae9e4fb6e65487`, so a
  matching preview binary is required before devices can install the update.
- Published Android preview OTA update `2026.07.21` to the EAS `preview`
  branch from commit `144e9dd`, update group
  `dff32bcd-0763-4a7f-b7aa-0cdef70b25b7`. EAS reported no compatible build for
  Android fingerprint `c8911e6c9aab878f575195a76e071bfba8a22d0d`, so a matching
  preview binary is required before devices can install this update. Completed
  Date: 2026-07-21.
- Completed the source implementation for mobile Product/Service choices as
  flat Options name/value lists
  and list-only combination summaries with counted-in unit, stock/type, price,
  and description. Combination menus provide Edit and Disable/Enable; Edit
  progresses from a compact quantity/price/description sheet to a full-screen
  image, SKU/barcode, unit-price, quote, and Store editor with a keyboard-sticky
  rounded check action. Flattened the Unit section, improved Counted in and
  Unit-name examples, placed Counted in before Price in two columns, and added
  label-side removal for Opening stock and Description. Extended strict Catalog
  variant contracts and persistence with optional image URLs and retained the
  description/opening-stock regression payload. Local and production schemas
  are synchronized; the matching production API rollout remains tracked
  separately because production migration history must be reconciled first.
  Completed Date: 2026-07-20.
- Transposed Product selling-unit setup to default to merchant-facing counts
  such as `50 Kilograms in 1 Bag`, while retaining an explicit opposite
  direction for larger units. Dashboard creation, mobile creation, and the
  dashboard unit-version editor now share exact reciprocal conversion logic,
  preserve the existing persisted factor contract, transpose populated values
  when possible, and reject relationships that would require rounding.
  Completed Date: 2026-07-20. Checks Run: 22 focused utility/helper tests;
  utility and dashboard TypeScript; mobile keyboard, NativeWind, and theme
  guards; targeted Biome and `git diff --check`; Android default/opposite
  relationship visual QA. The full Bun suite passed 163 tests and exposed nine
  unrelated database mock failures where subscription snapshot tests do not
  provide `catalogItem.count`; mobile TypeScript was blocked by an unrelated
  invalid `onActionPress` prop in `catalog-variant-manager.tsx`; dashboard
  browser QA was blocked by the existing Portless login redirect to raw
  `localhost:3092`.
- Corrected mobile progressive feature revealing so record history no longer
  removes role-authorized bottom tabs. Owners/managers retain Home, Catalog,
  Add, Work, and Reports; attendants retain Home, New Order, and Work.
  Progressive availability still controls dashboard content, filters,
  metrics, setup guidance, and contextual actions, while the approved
  hide-on-scroll behavior remains unchanged. Completed Date: 2026-07-20.
  Checks Run: focused mobile availability tests; app-shell, dashboard, Service
  Jobs, and Reports QA guards; mobile TypeScript; targeted Biome and diff
  checks; Android owner-dashboard visual verification. The full Bun suite
  passed 162 tests and exposed nine unrelated database mock failures where
  subscription snapshot tests do not provide `catalogItem.count`.
- Fixed the mobile Catalog quick-setup picker bottom search so it follows the
  open keyboard using the same keyboard-sticky pattern as the GND customer
  selector, preserves interactive keyboard dismissal, and leaves enough list
  space for the final setup rows. Removed the visible search title while
  retaining its accessibility label. Completed Date: 2026-07-20. Checks Run:
  mobile keyboard coverage, mobile TypeScript, targeted Biome,
  `git diff --check`, and Android closed/keyboard-open/filtering visual QA.
- Implemented progressive feature revealing across the shared database/API read
  model, dashboard, and mobile app. Active-store record history now reveals
  Catalog, Inventory, Sales, Service Jobs, Customers, and Reports
  independently; Staff presence remains business-wide and historical records
  keep revelation sticky. Added dashboard and mobile setup launchpads,
  conditional metrics/sections, hidden-navigation versus creation-route
  policies, URL-owned Staff invitation, command-search first-record actions,
  mutation/replay invalidation, offline provisional merging, and cache reset on
  business switching. No database migration was required. Completed Date:
  2026-07-20. Checks Run: 27 focused database/dashboard/mobile tests; DB, API,
  dashboard, and native mobile TypeScript checks; mobile app-shell, dashboard,
  create-sale, Service Jobs, and Reports QA guards. Live browser progression
  was blocked by the stopped local login service; Android visual QA was blocked
  after the running emulator disconnected from ADB.

## Purpose

Completed work with durable value to the project.

## Items

- Added shared Catalog quick-setup helpers for dashboard and mobile Product and
  Service creation. A full-width top-of-form action opens a full-screen
  searchable Setup/Example list with titles, descriptions, and tags; selecting
  a helper prefills editable units, stock behavior, options, work policies, and
  hidden precision without prices, stock, IDs, or automatic saving. The
  library includes explicit prepared-stock feed examples and independently
  priceable dry-cleaning combinations. Completed Date: 2026-07-20. Checks Run:
  8 focused helper tests with 207 assertions, utility/dashboard/mobile
  TypeScript, four mobile UI guards, targeted Biome, `git diff --check`, and
  Android Product-form/full-screen-picker verification.
- Added an explicit checkmark completion action to mobile variant-value entry.
  It commits unfinished text, remains available after suggestion selection,
  closes the composer, and dismisses the keyboard. Variant inventory entry now
  uses `Current stock` instead of the ambiguous `Qty`. Completed Date:
  2026-07-20. Checks Run: mobile keyboard coverage, mobile TypeScript,
  NativeWind/theme guards, targeted Biome, and `git diff --check`; final
  emulator interaction testing was stopped at the owner's request.
- Completed the generic Service commerce loop for garment care and other
  tracked services. Concrete garment/service/size Offerings retain independent
  prices; Intake supports express surcharge, optional assignment, pickup
  promise, deposit and customer channel; Commerce records payment/refund facts
  and balance; managers can batch start/ready/delay and notify; operators can
  collect a final balance and perform an explicit handoff; SMS/WhatsApp intents
  support immediate or scheduled provider-neutral webhook delivery. Completed
  Date: 2026-07-20. Checks Run: 16 focused tests, full workspace and mobile
  TypeScript, six mobile source/style guards, Prisma migrate plus local/remote/
  production push, remote migration compatibility checks, `git diff --check`,
  Android rendered Work/Intake/payment/customer-channel QA, and two fixed-point
  code reviews with no remaining findings.
- Completed the mobile Product variant-by-unit price matrix. Every generated
  variant now exposes an independent override for each additional selling unit,
  with unit defaults and counted-unit prices retained as fallbacks. New units
  default to two-decimal quantities, the quantity-precision picker is hidden,
  and simple Product creation uses the same precision default. Completed Date:
  2026-07-19. Checks Run: API/DB/mobile TypeScript, Catalog schema tests,
  keyboard coverage, NativeWind/theme guards, targeted Biome,
  `git diff --check`, and Android variant-unit price/keyboard QA.
- Simplified Product variant lists to compact stock-style rows with required
  Price/Qty and a More disclosure for optional description, SKU, barcode,
  status, and stores. Extended Catalog creation and inventory opening movements
  so exact Qty is persisted per variant, and added nullable Sellable Variant
  descriptions through generated migration
  `20260719180212_add_sellable_variant_description`. Completed Date:
  2026-07-19. Checks Run: Catalog schema tests, API/DB/mobile TypeScript,
  keyboard, dashboard/app-shell, NativeWind, theme and targeted Biome guards,
  Prisma migrate/push, and `git diff --check`.
- Converted Product selling-unit setup to an always-visible Unit section and a
  detached keyboard-aware add/edit bottom sheet. Saved units use flat divider
  rows with accessible edit/delete actions; modal fields provide concrete Bag,
  Carton, Piece, and conversion-factor examples. Completed Date: 2026-07-19.
  Checks Run: mobile TypeScript, keyboard coverage, NativeWind and theme guards,
  targeted Biome, and `git diff --check`.
- Restored `Order` as a permanent owner/admin Add-sheet row. It is actionable
  when an active fixed-price Product or Service offering is store-available;
  otherwise it remains visible, disabled, and directs the owner to create the
  first Product/Service. Completed Date: 2026-07-19. Checks Run: dashboard
  source guard, mobile TypeScript, NativeWind and theme guards, and
  `git diff --check`.
- Restored the approved Product `Add variant` keyboard composer on top of the
  clean generic Catalog model. Variant names use filtered suggestions or custom
  input; values use contextual suggestions, selected removable pills,
  duplicate-safe comma entry, and keyboard Done. Service retains generic
  Options terminology. Completed Date: 2026-07-19. Checks Run: mobile
  TypeScript, keyboard coverage, NativeWind and theme guards, and
  `git diff --check`; emulator/UI testing skipped by explicit owner request.
- Restored the mobile owner/admin center-plus action as a compact detached
  floating sheet. The headerless, divider-based chooser uses one plus icon per
  row and concise Product, Service, Customer, Order, contextual Stock Entry,
  and Staff labels; Product and Service open the generic item flow with the
  correct kind preselected, while attendants retain direct order access.
  Completed Date: 2026-07-19. Checks Run: mobile dashboard, keyboard,
  NativeWind, and theme guards; mobile TypeScript; `git diff --check`; Android
  emulator sheet, Product form, Service form, keyboard, safe-area, and status
  bar verification.
- Completed five-model mobile and website behavioral QA for the clean generic
  Catalog, Inventory and Service Operations cutover. Verified packaged bulk
  transformations, shared-stock apparel, garment-care Intake/work, mixed
  electronics Orders and quote-based professional services; fixed
  tenant-scoped dashboard/mobile caches, active-tenant tRPC propagation,
  shared-dashboard onboarding, public storefront routing, quote/tracking label
  duplication, tenant-timezone promise rendering, keyboard-safe mobile forms,
  status-bar treatment, flat dividers and responsive padding. Completed Date:
  2026-07-19.
- Changed registration, login, and business switching to use one shared dashboard host while reserving each chosen business subdomain for its future storefront. New tenants no longer receive internal/custom dashboard hostname rows or tenant dashboard domain provisioning. Completed Date: 2026-07-18.
- Implemented ratio-backed feed inventory conversions across database, API, dashboard, and mobile. Added 25 kg/50 kg feed presets, server-derived whole target quantities, required online idempotency keys, paired transactional ledger movements, offline preset replay, read-only client previews, and base-equivalent dashboard reporting without raw mixed-unit totals. Completed Date: 2026-07-18. Checks Run: 50 focused tests; DB/API/dashboard/marketing/mobile typechecks; mobile first-product, service-job, and inventory-operation QA guards; `git diff --check`.
- Implemented the item-level Product and Service catalog. Stores are neutral; both item kinds are priced; only Product has stock. Product-only, Service-only, and mixed orders use one commercial order/payment model, while Service lines create generic relational Service Jobs. Removed runtime business-template/dry-cleaning contracts, added idempotent legacy migration, cancellation/refund/reversal history, opaque public request/tracking, item-driven dashboard/mobile Sales and Services gates, Service-only mobile checkout, and production-only owner OTP email dispatch. Completed Date: 2026-07-18. Checks Run: 190 focused tests; full workspace typecheck; five mobile QA guards; Prisma migrate/push; legacy migration dry-run/apply; dashboard browser QA; Android QA; changed-file Biome; `git diff --check`.
- Implemented store-scoped operating currency and formatted money input across
  marketing, dashboard, mobile, public service-request pages, and offline Retail
  Ops state. Signup supports NGN, USD, GHS, KES, ZAR, and EGP; web/mobile money
  fields render real prefixes and live grouping; auth/session contracts carry
  active-store currency; local persisted money now uses explicit minor units
  with a one-time migration. No Prisma migration was needed. Completed Date:
  2026-07-17.
- Added the mobile Dry Cleaning / Laundry service-order workflow. The mobile app now registers `/service-orders-modal`, surfaces Services on owner/admin and sales-rep homes, uses production `retailOps` tRPC contracts for service catalog setup, express surcharge settings, service-order intake, due-work review, and status advancement, and supports native photo/video intake evidence through Expo image picker. Added dev/preview-gated real-session QA so owner and activated staff bearer sessions can be created through production auth/staff tRPC, switched to Dry Cleaning / Laundry, optionally seeded with the requested case-study services/orders, and opened on Android. Service-order offline replay and cloud media storage remain follow-up scope. Completed Date: 2026-07-15. Checks Run: `bun --cwd apps/mobile qa:service-orders-flow`; `bun --cwd apps/mobile qa:mobile-real-session-guard`; `bun --cwd apps/mobile qa:navigation-home-system`; `bun --cwd apps/mobile qa:nativewind-style`; `bun --cwd apps/mobile qa:google-oauth-ready`; `bun --cwd apps/mobile qa:mvp-typechecks`; Android emulator authenticated Services smoke plus camera permission and camera activity launch; real local API owner/staff service-order imports; seeded owner/staff Android runs with Shirt and trouser, Agbada, Jalabia, Iro and Buba services, SM/LG variants, 25% express setting, six mixed-payment/status orders, and visible emulator intake/order rows.
- Hardened the marketing onboarding E2E proof path. Marketing lead email dispatch now records bounded delivery receipts on `LeadCapture.metadata`, the shared email package has a local JSONL capture transport for smoke tests, the browser-facing notification package no longer re-exports the server email service, and `bun run qa:marketing-onboarding-e2e` validates early access, waitlist, one-time signup, dry-cleaning store setup, services/orders/public request links, staff invite email capture, staff onboarding, and dashboard `/services`. Completed Date: 2026-07-15. Checks Run: `CONFIRM_MARKETING_ONBOARDING_E2E=1 MARKETING_E2E_BASE_URL=http://127.0.0.1:3092 DASHBOARD_E2E_BASE_URL=http://127.0.0.1:3094 PUBLIC_E2E_BASE_URL=http://127.0.0.1:3092 bun run qa:marketing-onboarding-e2e`; `bun test packages/email/src/index.test.ts packages/notifications/src/services/email-service.test.ts packages/jobs/src/handlers/notification-dispatch.test.ts`; `bun --filter @ewatrade/email typecheck`; `bun --filter @ewatrade/notifications typecheck`; `bun --filter @ewatrade/jobs typecheck`; `bun --filter @ewatrade/marketing typecheck`; `bun --filter @ewatrade/dashboard typecheck`.
- Implemented the Dry Cleaning / Laundry dashboard service workspace and customer request-link route. The dashboard `/services` route now supports service catalog management, express surcharge settings, service-order intake with evidence, status transitions, due-work review, public request review/conversion, and request-link visibility for dry-cleaning stores. Public service-request links are served on both marketing and storefront apps with Open Graph/Twitter metadata during the early marketing-hosted production phase. Completed Date: 2026-07-15. Checks Run: `bun --filter @ewatrade/db typecheck`; `bun --filter @ewatrade/api typecheck`; `bun --filter @ewatrade/dashboard typecheck`; `bun --filter @ewatrade/storefront typecheck`; `bun --filter @ewatrade/marketing typecheck`; `bun test packages/db/src/queries/business-templates.test.ts apps/dashboard/src/lib/navigation.test.ts`; authenticated local HTTP validation for `http://ewatrade-dashboard.localhost/services`; public request-link validation for `http://ewatrade.localhost/service-request/<token>` with OG/Twitter metadata; seeded dry-cleaning fixture with 7 orders, 2 completed orders, 1 delayed order, 1 converted request, and 100% request conversion.
- Implemented self-service store detection v1 for the POS/self-service launch flow. Added a package-owned coordinate resolver that reads enabled store geofences from store metadata, a public Hono API endpoint at `POST /api/self-service/store-detection/resolve`, a customer-facing POS launch panel with explicit confirmation and manual store-code fallback, focused resolver tests, API/DB/POS typechecks, and mobile/desktop browser screenshot QA. Completed Date: 2026-07-15. Checks Run: `bun test packages/db/src/queries/self-service-store-detection.test.ts`; `bun --filter @ewatrade/db typecheck`; `bun --filter @ewatrade/api typecheck`; `bun --filter @ewatrade/pos typecheck`; Playwright screenshots for `http://ewatrade-pos.localhost` at mobile and desktop widths.
- Closed the stale open Retail Ops implementation tickets after verifying their core acceptance criteria were already implemented across API, DB repositories, dashboard/mobile surfaces, validation scripts, and Brain feature docs. Remaining live-provider, owner-approval, production-migration, and enhancement work is documented as follow-up product/ops scope rather than open implementation tickets. Completed Date: 2026-07-15. Checks Run: targeted Brain/task review and code reference checks.
- Cleared stale in-progress task tracking for the mobile design-system approval flow, Retail Ops production release proof gates, and initial monorepo expansion. Implementation work is complete; owner approval and live production proof values remain external product/ops gates rather than active code tickets. Completed Date: 2026-07-15.
- Added the Al-Ghurobaa-style mobile EAS Update experience to EwaTrade. Installed builds now check for matching-channel OTA updates on launch and foreground return, show a full-screen progress/restart modal while applying updates, expose an authenticated App updates screen from Settings for manual check/download/restart and build diagnostics, and provide `bun --cwd apps/mobile update:preview` to bump `UPDATE_VERSION` and publish Android preview updates to the `preview` channel/environment. Completed Date: 2026-07-15. Checks Run: `bun --cwd apps/mobile update:preview -- --dry-run`; `bun --cwd apps/mobile qa:expo-env-attachment`; `bun --cwd apps/mobile qa:nativewind-style`; `bun --cwd apps/mobile tsc -p tsconfig.json --noEmit`; scoped `git diff --check` for changed EAS Update files and Brain docs; Android emulator `/updates` route screenshot check.
- Implemented the approved mobile navigation and home-screen cleanup source changes. The mobile root now gates `/admin-home`, `/sales-rep-home`, and long workflow routes through protected stack boundaries; `/dashboard` redirects to the correct role home; admin home uses the shared Design 01-style bottom-tab primitive with `Home`, `Sales`, `+`, `Stocks`, `More` plus a Design 01-style primary hero; More contains Sales Reps, Customers, Settings, and Theme with dedicated Settings and Theme sheets; the center `+` opens a compact Create sheet for admin users; admin Home is a compact overview instead of a long operational list; sales-rep Home is task-first with assigned stock, session, sale, customers, recent sales, sync, and closeout; Sales Reps, business switching, create sale, customer book, rep clock-in, closeout, first product setup, stock intake, product links, reports, subscription, sync status, and unit conversion now use full-screen stack modal routes while retaining compatibility wrappers where useful; local fallback auth supports owner/sales-rep role fixtures for QA; and touched forms reuse `FormField`/`input-2` with reduced wrapper density. Completed Date: 2026-07-14. Checks Run: `bun --cwd apps/mobile qa:navigation-home-system`; `bun --cwd apps/mobile qa:staff-flow`; `bun --cwd apps/mobile qa:mvp-typechecks`; Android emulator hierarchy/screenshot QA for admin home light/dark/compact, sales-rep home, Create, More, Settings, Theme, Sales Reps modal, first-product setup, stock-intake, create sale, customer book, sync status, product links, unit conversion, business switching, and Sales Reps keyboard-open sticky CTA.
- Dashboard standard system implementation reached implementation-complete status for the reference audit, HalalVest-aligned auth/dashboard shell, product catalog, inventory operations, staff management, sales/sessions/customers, generated links, reports, command search, settings/subscription/payroll planning, desktop wrapper, and final QA handoff. Completed Date: 2026-07-14. Checks Run: `bun test apps/dashboard/src/lib/product-catalog.test.ts apps/dashboard/src/lib/inventory-operations.test.ts apps/dashboard/src/lib/staff-management.test.ts apps/dashboard/src/lib/sales-operations.test.ts apps/dashboard/src/lib/share-links-operations.test.ts apps/dashboard/src/lib/dashboard-search.test.ts apps/dashboard/src/lib/navigation.test.ts`; `bun --filter @ewatrade/dashboard typecheck`; `bun --filter @ewatrade/desktop smoke`; authenticated HTTP route checks for `/`, `/products`, `/inventory`, `/staff`, `/sales`, `/customers`, `/links`, `/analytics`, and `/settings`; logged-out redirect checks for protected dashboard routes; dashboard API smoke checks for `/api/products` and `/api/search`; ticket 02 local QA fixture checks for Better Auth login, authenticated shell load, owner navigation rendering, active business switching, active store switching, and sign-out redirect. Fixture-dependent browser QA follow-ups for non-empty sales/session/customer datasets and shared-link order/delivery follow-up were moved to backlog.
- Implemented metadata-backed business type onboarding templates and the Dry Cleaning / Laundry v1 surface. Product Sales is the default effective template for existing stores; dashboard setup now submits Product Sales, Dry Cleaning / Laundry, or Other business onboarding answers; protected tRPC procedures expose template reads/guarded updates, dry-cleaning service catalog, service orders, request links, request review/conversion, and reports; public tRPC procedures expose opaque service-request submission and customer tracking; Other onboarding demand can be ranked through an internal procedure. Completed Date: 2026-07-13. Checks Run: `bun test packages/db/src/queries/business-templates.test.ts packages/db/src/queries/stores.test.ts`; `bun --filter @ewatrade/db typecheck`; `bun --filter @ewatrade/api typecheck`; `bunx biome check <changed source/test files>`.
- Added a standard Project Brain skeleton around the pre-existing product, module, and architecture notes.
- Updated Brain architecture guidance to reflect Prisma-managed schema plus Drizzle runtime querying.
- Documented that Supabase is not part of the current architecture.
- Added ADR-0001 to make the Prisma/Drizzle ownership split explicit.
- Resolved the `.scratch` Wayfinder decision tickets for Ewatrade Dispatch and Product Image Marketplace/Storefront Publishing, including Brain feature docs and ADRs for the durable product/package boundaries.
- Scaffolded the repository as a `midday`-style monorepo foundation that later expanded into storefront, marketing, POS, and dashboard app surfaces.
- Standardized the frontend foundation on Next.js 16 and Tailwind CSS 4 using a shared styling setup informed by the `gnd` project.

### Retail Ops Design System And IA

- Priority: High
- Description: Track plan in `.brain/plans/2026-07-06-ux-ui-retail-ops-design-system-and-ia.md`.
- Related Feature: Retail Ops design system
- Status: Done
- Plan Status: Done
- Plan File: .brain/plans/2026-07-06-ux-ui-retail-ops-design-system-and-ia.md
- Intake File: .brain/intake/2026-07-06-sales-management-saas-mvp.md
- Created Date: 2026-07-06
- Completed Date: 2026-07-10
- Checks Run: `rg -n "Retail Ops Design System And IA|Surface Ownership|Screen Map|Reusable Components|State Language|Acceptance Review Checklist|Retail Ops Product Direction|Retail Ops Ownership|Surface Split" .brain/features/retail-ops-design-system-and-ia.md .brain/features/README.md .brain/product/vision.md .brain/modules/merchant-system.md .brain/modules/pos-cashier.md .brain/plans/2026-07-06-ux-ui-retail-ops-design-system-and-ia.md .brain/tasks/roadmap.md .brain/tasks/done.md`; `rg -n "[[:blank:]]$" .brain/features/retail-ops-design-system-and-ia.md .brain/features/README.md .brain/product/vision.md .brain/modules/merchant-system.md .brain/modules/pos-cashier.md .brain/plans/2026-07-06-ux-ui-retail-ops-design-system-and-ia.md .brain/tasks/roadmap.md .brain/tasks/done.md .brain/progress.md`; `git diff --check -- .brain/features/README.md .brain/product/vision.md .brain/modules/merchant-system.md .brain/modules/pos-cashier.md .brain/plans/2026-07-06-ux-ui-retail-ops-design-system-and-ia.md .brain/tasks/roadmap.md .brain/tasks/done.md`.

### Retail Sales Product Documentation

- Priority: Medium
- Description: Track plan in `.brain/plans/2026-07-06-docs-retail-sales-product-documentation.md`.
- Related Feature: Product documentation
- Status: Done
- Plan Status: Done
- Plan File: .brain/plans/2026-07-06-docs-retail-sales-product-documentation.md
- Intake File: .brain/intake/2026-07-06-sales-management-saas-mvp.md
- Created Date: 2026-07-06
- Completed Date: 2026-07-10
- Checks Run: `rg -n "Retail Ops Sales Product|Starter Template|Core Entities|Workflow Summary|Retail Ops Stock To Closeout Flow|Reconciliation Invariants|Product Wedge|Retail Ops MVP Entity Map|feed.*starter|starter templates" .brain/features/retail-ops-sales-product.md .brain/workflows/retail-ops-stock-to-closeout-flow.md .brain/features/README.md .brain/product/vision.md .brain/product/roadmap.md .brain/modules/merchant-system.md .brain/modules/pos-cashier.md .brain/database/schema.md .brain/plans/2026-07-06-docs-retail-sales-product-documentation.md .brain/tasks/roadmap.md .brain/tasks/done.md`; `rg -n "[[:blank:]]$" .brain/features/retail-ops-sales-product.md .brain/workflows/retail-ops-stock-to-closeout-flow.md .brain/features/README.md .brain/product/vision.md .brain/product/roadmap.md .brain/modules/merchant-system.md .brain/modules/pos-cashier.md .brain/database/schema.md .brain/plans/2026-07-06-docs-retail-sales-product-documentation.md .brain/tasks/roadmap.md .brain/tasks/done.md .brain/progress.md`; `git diff --check -- .brain/features/README.md .brain/product/vision.md .brain/product/roadmap.md .brain/modules/merchant-system.md .brain/modules/pos-cashier.md .brain/database/schema.md .brain/plans/2026-07-06-docs-retail-sales-product-documentation.md .brain/tasks/roadmap.md .brain/tasks/done.md`.

### Mobile Expo Starter Baseline Cleanup

- Priority: High
- Description: Track plan in `.brain/plans/2026-07-07-cleanup-mobile-expo-starter-baseline.md`.
- Related Feature: Mobile Expo starter
- Status: Done
- Plan Status: Done
- Plan File: .brain/plans/2026-07-07-cleanup-mobile-expo-starter-baseline.md
- Intake File: .brain/intake/2026-07-07-mobile-expo-starter.md
- Created Date: 2026-07-07
- Completed Date: 2026-07-07
- Checks Run: `rg -n "@gnd|GND|gnd|prodesk|pcruz|www-mobile|static-router|static-trpc|app-auto-update-modal" apps/mobile`; `rg -n "expo-updates|expo-dev-client|@supabase|lottie-react-native|react-native-nitro-modules|update:preview|run:android|run:ios" apps/mobile/package.json apps/mobile/src apps/mobile/scripts apps/mobile/app.config.ts`; `bun install --lockfile-only --offline`; `bun --cwd apps/mobile -e '<Expo config identity check>'`; `git diff --check` scoped to changed mobile and Brain files.

### Mobile API And tRPC Env Scaffold

- Priority: High
- Description: Track plan in `.brain/plans/2026-07-07-feature-mobile-api-trpc-env-scaffold.md`.
- Related Feature: Mobile API scaffold
- Status: Done
- Plan Status: Done
- Plan File: .brain/plans/2026-07-07-feature-mobile-api-trpc-env-scaffold.md
- Intake File: .brain/intake/2026-07-07-mobile-expo-starter.md
- Created Date: 2026-07-07
- Completed Date: 2026-07-07
- Checks Run: `rg -n "www-mobile|@api/trpc|EXPO_PUBLIC_BASE_URL|EXPO_PUBLIC_API_URL|@ewatrade/api|superjson|x-trpc-source" apps/mobile`; `rg -n '"@api/\*"|@api/' apps/mobile/tsconfig.json apps/mobile/src`; `bun install --lockfile-only --offline`; `git diff --check` scoped to changed mobile and Brain files.

### Mobile Local Session And Routing Shell

- Priority: High
- Description: Track plan in `.brain/plans/2026-07-07-refactor-mobile-local-session-routing-shell.md`.
- Related Feature: Mobile app shell
- Status: Done
- Plan Status: Done
- Plan File: .brain/plans/2026-07-07-refactor-mobile-local-session-routing-shell.md
- Intake File: .brain/intake/2026-07-07-mobile-expo-starter.md
- Created Date: 2026-07-07
- Completed Date: 2026-07-07
- Checks Run: `rg -n "\\(drivers\\)|\\(sales\\)|\\(job\\)|installer|dispatch|hrm|documents|notifications|StaticRouter|StaticTrpc|AppAutoUpdateModal|currentSection|SectionKey|mobileSession|mobileSignOut|sign-in" apps/mobile/src`; `rg -n "onboarding|login|sign-up|dashboard|hasCompletedOnboarding|signInLocal|signUpLocal|signOutLocal" apps/mobile/src/app apps/mobile/src/hooks apps/mobile/src/store apps/mobile/src/lib`; `rg --files apps/mobile/src/app`; `git diff --check` scoped to changed mobile and Brain files.
