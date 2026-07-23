# In Progress

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
