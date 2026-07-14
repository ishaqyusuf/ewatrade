# Done

## Purpose
Completed work with durable value to the project.

## Items
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
