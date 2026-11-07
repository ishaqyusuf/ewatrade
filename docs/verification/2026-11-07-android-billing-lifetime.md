# Android billing lifetime verification — 7 November 2026

Scope: dormant native purchase orchestration and local reconciliation helpers.
The owner confirmed paid owner subscriptions from day one; this change does not
enable checkout, relink the SDK, configure products or accept an Android release.

## Change and source evidence

Every asynchronous purchase/restore operation captures its session, cache,
owner and business lifetime. A retired operation stops before verification,
store acknowledgement or refreshing the next session. Checkout refreshes the
server catalog and checks current availability, mapped product and account
binding before requesting the disclosed store offer. Recovery also refreshes
the catalog before reading store history. Receipt ownership verification stays
server-authoritative; a receipt left unfinished can be recovered in a valid
session. No API, schema or entitlement policy changed.

## Validation

- Offline QA doctor passed. No runtime services, provider calls or database
  fixtures were needed.
- Four new helper regressions failed before the fix. All 10 helper tests now
  pass (20 assertions), covering retirement before verification, after
  verification, during catalog refresh and between restored receipts, plus
  existing verify-before-finish and error behavior.
- Two isolated provider wrappers pass (4 assertions). Their child fixtures
  exercise seven real-controller checkout/callback/restore cases and the
  purchase-disabled provider's inert behavior. React server rendering does not
  mount effects: this does not establish foreground recovery or device behavior.
- An earlier combined wrapper/helper run observed empty child stderr despite
  exit zero, failing its required test-count assertion. Separate reruns pass;
  the assertion was retained. No test result was accepted from the empty output.
- `node apps/mobile/scripts/check-subscription-flow.mjs` passed.
- Mobile TypeScript passed with `NODE_OPTIONS=--max-old-space-size=8192`.
  The first attempt exhausted the default heap; it was not a successful check.
- Owned-path fast smoke passed: 259 tests, 1,679 assertions, zero unknown paths;
  QA tooling types and changed-file Biome passed. The first smoke attempt found
  missing hook dependencies; stable callbacks and complete effect dependencies
  corrected them before this successful run. Foreign staged explainer files and
  `AGENT_CHAT.md` are excluded from this change's scope.
- H01 passed with the documented `APP_ENV=local` environment; the initial run
  without it omitted QA routes and failed snapshot comparison. The generated
  snapshot was not changed. H02 passed (one client impact record; zero capability
  or procedure rows changed). Final mobile TypeScript passed after the hook fix.

No new visual UI was introduced. Existing free-plan UI evidence only covers its
unchanged disabled state. Real Play account/business switching, unmount and
foreground recovery, purchase/restore/replacement, renewal/refund and signed
candidate acceptance remain required before activation. No destructive privacy
test, sale/payment submission, deployment, store declaration or release occurred.

See [the paid launch checklist](../billing/android-paid-launch-2026-11-07.md).
