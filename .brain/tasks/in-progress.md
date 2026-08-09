# In Progress

- Complete the Prescription Commerce production rollout after the 01-20 source
  implementation and final review fixes. Explicit sheet modes, queue facets,
  header readiness, confirmed clinical actions, executable audit/commercial
  retention, sensitive-access/break-glass controls, and Tenant reporting are
  source-complete. Remaining gates: explicitly approved shared-Neon migration,
  Service Quote backfill/reconciliation and legacy contraction, live private
  media/OCR providers, pharmacy-owned Meta WABA/number and template approvals,
  Paystack canary, legal/privacy/retention sign-off, delivery SOP approval,
  authenticated desktop/mobile browser QA, load/concurrency/security testing,
  and one monitored test-pharmacy canary. No live provider or production schema
  change is claimed. Started Date: 2026-08-09.

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
  Sentry variables are configured in EAS. With explicit owner authorization,
  the private `SENTRY_AUTH_TOKEN` is configured as a project-scoped,
  Production-and-Preview EAS secret on the currently selected
  `@startups-2/ewatrade-2` project. The complete 16-value mobile production
  configuration is also project-scoped in both environments, with metadata
  verification passing on 2026-07-26. Preview build
  `246bf5c6-46f1-4fbd-b964-31461a0a4c44` reached and passed Metro on
  2026-07-26, then failed in the Sentry Gradle upload task because that secret
  was absent. Replacement build `0d20383d-ad6d-4425-888b-2d073718cf6c`
  completed successfully as Android versionCode 4 and uploaded the Sentry
  source-map artifact for release `com.ewatrade.app@1.0.0+4`. Remaining:
  Preview build `39b3766f-6dba-4ef3-8e0f-a46723b4894a` exposed that the
  production-file Sentry token lacks project permission (HTTP 403). The
  known-working local token was restored to Preview only, and replacement
  build `74b14a10-2097-40c6-9f98-2708c36b81c6` completed successfully as
  Android versionCode 7 with its Sentry artifact uploaded. Replace the
  Production EAS token with one authorized for the mobile Sentry project,
  install the Preview APK, and send one deliberate test exception to verify
  symbolicated JavaScript and native events in
  `cipron-concepts/ewatrade-mobile`. Checks Run: Sentry config guard, mobile
  TypeScript, Expo env attachment, app-launch config, Expo prebuild config
  resolution, Android Expo export, EAS upload inspection, successful native
  Preview build, and diff hygiene. Started Date: 2026-07-23.

- Reconcile the production Prisma migration baseline before releasing the
  current Catalog option-detail API. Production reports
  `20260711120000_retail_ops_stock_ledger_foundation` as pending even though its
  legacy `Product` relation is already absent (`P3018`, PostgreSQL `42P01`).
  Once reconciled through an owner-approved production migration operation,
  release the matching API and verify a phone-authenticated Product save with
  option description and opening stock. The production schema itself was
  synchronized successfully with guarded `db:push` on 2026-07-21. Started Date:
  2026-07-20.
# Cross-product QA email and cleanup

- Product implementation is integrated. Schema rollout, secure route
  propagation, canary delivery, and first operator-reviewed purge remain
  deployment work.
