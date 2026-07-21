# Done

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
