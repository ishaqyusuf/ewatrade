# In Progress

- Generate and apply the Prisma migration for Commercial Order delivery
  scheduling and reminders once local PostgreSQL/Docker is available, then run
  the required local, remote-development, and production push workflow under
  the existing database safety gates. Source implementation, focused tests,
  and package/mobile typechecks are complete. Started Date: 2026-07-25.

- Implement managed domain purchasing and storefront connection using GO54 for
  `.com.ng`, Openprovider for global domains, Paystack checkout, and Vercel
  hosting/attachment. The implementation follows
  `.brain/plans/2026-07-24-managed-domain-midday-migration-contract.md` across
  database, provider adapters, API/jobs, dashboard, mobile, verified
  bring-your-own-domain, signup cleanup, QA, and Brain documentation.
  Source implementation is complete across Prisma schema, provider package,
  API/jobs, dashboard, mobile and signup cleanup. Remaining blockers are
  shared-database deployment, authenticated dashboard/Android runtime QA,
  credentials, commercial/legal acceptance and two owner-approved live
  canaries. Checks
  completed: Prisma format/generate, generated/applied local migration
  `20260724174525_managed_domains`, local push/deploy verification; 41 focused
  domain/provider/query/job/API
  tests and 251 repository-wide passing tests (four unrelated existing Retail
  Ops fixture failures); DB/domains/jobs/API/dashboard/marketing/mobile
  TypeScript; targeted Biome; mobile domain,
  NativeWind and keyboard guards; desktop/mobile signup browser QA. Started
  Date: 2026-07-24.

- Complete the mobile Sentry production handoff. The React Native SDK, Expo
  config plugin, Metro source-map integration, DSN/environment configuration,
  privacy-safe defaults, and OTA-reload flushing are implemented. The public
  Sentry variables are configured in EAS, while storing the private
  `SENTRY_AUTH_TOKEN` in EAS requires explicit owner authorization. After that
  secret is configured, run a native preview/production build and send one
  deliberate test exception to verify symbolicated JavaScript and native
  events in `cipron-concepts/ewatrade-mobile`. Checks Run: Sentry config guard,
  mobile TypeScript, Expo env attachment, app-launch config, Expo prebuild
  config resolution, Android Expo export, and diff hygiene. Started Date:
  2026-07-23.

- Reconcile the production Prisma migration baseline before releasing the
  current Catalog option-detail API. Production reports
  `20260711120000_retail_ops_stock_ledger_foundation` as pending even though its
  legacy `Product` relation is already absent (`P3018`, PostgreSQL `42P01`).
  Once reconciled through an owner-approved production migration operation,
  release the matching API and verify a phone-authenticated Product save with
  option description and opening stock. The production schema itself was
  synchronized successfully with guarded `db:push` on 2026-07-21. Started Date:
  2026-07-20.
