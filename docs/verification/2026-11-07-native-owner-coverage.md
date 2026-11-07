# Native owner coverage source verification — 7 November 2026

The paid-at-launch continuation now connects the native billing panel to existing
owner enrollment/release commands. All activation and release gates remain closed.

- Catalog adds server-derived `billingScope`, `coverageAvailable` and saved
  `ownerCoverage.enrolled`. Enrollment is distinct from active paid access, so
  expired enrollment can still be explicitly released. No schema, permission,
  ownership or entitlement policy changed; no additional database query is added.
- Native panel shows current-business coverage and slots, explains staff access,
  offers enrollment when capacity is available, and requires confirmation before
  release. Release keeps data and does not stop store renewal. Other businesses
  are managed after switching through the existing business switcher.
- Commands refresh the catalog, require the current owner scope/runtime, and
  stop across session/business/cache changes. Duplicate taps serialize; coverage
  started during checkout refresh prevents competing store launch. Completion
  after session retirement cannot refresh the next account's cache.
- API plus existing owner-policy/transaction-port tests: 36 passed, 149
  assertions. Native wrappers: 3 passed, 6 assertions; children exercise 14
  controller cases, 4 control/confirmation render cases and the inert disabled
  provider. Subscription source guard passed. These mocks make no provider or
  database calls and do not prove real database concurrency or device layout.
- API and mobile TypeScript passed with an 8 GB heap. Owned-path fast smoke
  passed 259 tests / 1,679 assertions, QA tooling types and changed-file Biome;
  zero unknown paths. The first attempt caught a missing button type in the
  HTML render mock; adding `type="button"` resolved it. H01 (documented local
  environment) and H02 passed. The scope excludes foreign staged explainer
  files and `AGENT_CHAT.md`.

The current release scope keeps this paid screen inactive, and native IAP
linkage is still disabled in source. No flag was enabled merely for a passing
UI test. Native layout, accessibility, confirmation, foreground recovery and signed
owner purchase/coverage flows remain acceptance work for the reviewed paid build.
Plan-limit/signup cutover, five-day failed-renewal handling, retained-surplus
rules, provider configuration, legal/privacy and Data safety are still open.
No push, deploy, financial setup, provider activation or store submission occurred.
