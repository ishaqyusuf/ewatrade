# Shared storefront feature extraction

Owner-authorized local implementation in the current main checkout, 28 October
2026. No push, application deployment, Production publication or provider activation.
The [execution contract](../plans/shared-storefront-features-extraction.md) tracks
27 work packages. All27 work packages are complete locally; final source/Workshop evidence commits
are recorded below.

## Result and ownership

Contracts own commerce/customer/receipt views and feature policy. Runtime owns the
persistent bag, host navigation, inert preview, account/recovery/history, receipts,
checkout, purchase controls and service requests. Templates inject semantic tokens
and shells. Apps own routes, cookies and action adapters; existing domain commands
retain current Host/Site/release/Store/tenant, entitlement and revision checks.
The generated component SDK receives no customer identity or commerce authority.

Older canvas draft conversion also retains explicit feature config and leaves its
old pin/input untouched (13 migration/canvas tests/276 assertions pass).

Current and legacy template families use the same customer-feature implementation.
Legacy storefront layouts and exact template pins remain available. Schema2 card
selection routes into shared product/service detail; the live host uses soft
navigation and previews use local state with inert effects. Compatibility exports
are forwarding aliases, rather than duplicate implementations. Removed143 obsolete
Commerce Studio feature CSS rules and the retired ordering-template allowlist.

## Migration and compatibility

- Manifest schema1/runtime1 stay unchanged. Composition schema2 separately carries
  feature config v1: account login, order intake/fulfilment and low-stock privacy.
- Legacy normalization reads effective existing policy without writing. An existing
  disabled-all-fulfilment merchant stays disabled. Other legacy templates acquire
  historical read access without being granted new login/order intake.
- Studio Features requires explicit **Use shared settings**. It creates an unsaved
  migrated draft. The normal Save/CAS, dirty-exit, Undo, review/consent and publication
  flow stays authoritative. Section fulfilment/privacy aliases mirror the canonical
  config. Guest ordering remains independent of customer login.
- Template replacement preserves feature config. New AI briefs freeze it; proposals
  and acceptance recheck it. Older unaccepted proposals may require regeneration.
  Already accepted-run replay remains idempotent. No model/provider call was made.
- Session cookies, verified identity, opaque receipt links and request references
  remain scoped to their business across template changes and disabled intake.
  Current new-login effects lock and re-read the Site before creating authority.
- Bag/draft storage formats and stable submission IDs remain unchanged. No Prisma
  schema change or SQL migration is needed; no historical release JSON is rewritten.
- Separately authorized rollout must release compatible readers before schema2
  writers. Site rollback moves the immutable release pointer. A schema1-only binary
  cannot read schema2 drafts/releases; preserve a compatible reader or restore a
  compatible release before binary rollback. Never edit archived JSON to downgrade.

## Validation

Commands and private local logs are under `/tmp/ewatrade-shared-storefront-p8-*`.
These are local source/QA checks, not hosted or production release evidence.

| Check | Result |
| --- | --- |
| Offline doctor and selected API/Dashboard/Storefront/QA services | Pass; trusted Portless CA used |
| Owned-path fast source smoke | 223 tests /1214 assertions pass; concurrent changes excluded from path selection |
| Feature source and explicit TSX/unit/scope/connected-test graph | Owned candidate0 diagnostics; final integrated Storefront types pass |
| Storefront production Turbopack build | Next16.4.3 compilation, strict types and prerender pass |
| Dashboard full TypeScript | Pass |
| Full API TypeScript | Five existing test-fixture errors in general-customer-allocations, product-share and customer-ledger; no changed storefront-source diagnostic |
| Assistant H01 | APP_ENV=local snapshot current |
| Assistant H02 | Record updated for extraction and policy; final owned commit gate checked separately |
| All-template account matrix | Every selectable exact pin renders shared account under legacy and migrated composition |
| Connected domain/security suite | All11 cases covered:8 pass in initial run,3/49 pass in focused corrected run; both isolated fixtures disposed |
| Canonical existing-data web smoke | Pass; local runtime identity unverified, clean=false; no release acceptance inferred |

The initial connected run retains three failures as diagnostic evidence: delivery
was already optional in the current contract, and dated service requests now need
explicit book-ahead policy. The disposable service fixture now opts in through
`setCatalogStorefrontPolicy`; production policy was not relaxed. The affected
cases passed on explicit rerun (3 tests/49 assertions). The isolated fixture is separate from existing-data UI
smoke; it sends no messages or provider/payment effects and is disposed afterward.

A concurrent performance change committed as5c8d39b3f during finalization. Its
request-context loader changes are preserved. A temporary owned-candidate
CompilerHost overlay excludes unrelated dirty source only in memory; it reports
zero diagnostics including explicit unit/TSX and connected-test files. An earlier
working-graph probe saw transient nullability errors while that other change was
in progress; it is not hidden as a clean checkout result. Final integrated
Storefront types pass after4b61b3e28, and the lock-race rerun passes1 test/10
assertions against the committed loader; its isolated fixture was disposed.

The queued OTP test obtains a real exclusive Site lock, observes a verifying query
waiting on its shared lock through pg_stat_activity, then commits an already
validated immutable disabled-login release pointer inside its disposable fixture.
Verification returns UNAVAILABLE; existing session/history/receipt reads continue,
foreign-host reads fail and revoked sessions fail. This tests real database lock
behavior, not only isolated resolver mocks.

## Browser evidence

One browser session exercised the actual Studio and representative commerce/service
families. Studio migration and independent login/order toggles worked; Undo restored
the original saved QA revision4. Base UI controls explicitly stay disabled before
migration. No draft save or merchant publication was performed in the browser.

Product→bag→checkout retains item/quantity/subtotal, completes price checking and
supports removing the item. Mobile checkout has no horizontal overflow. No order
request/payment was submitted; the test bag was cleared and viewport restored.
The existing service-concierge legacy account route uses shared framing and refuses
new login; anonymous customers do not get a signed-in account label. Captured
storefront console errors:0.

Private screenshots (not committed):
- `/private/tmp/ewatrade-shared-storefront-actual-settings.jpg`
- `/private/tmp/ewatrade-shared-storefront-mobile-checkout.jpg`
- `/private/tmp/ewatrade-shared-storefront-service-account.jpg`

Approved exact Workshop revision:
[shared-customer-features62577dd1-4da0-4737-bb71-f885f3846f3c](https://workshop.localhost/ewatrade/storefront/template-library/directions/shared-customer-features).
Earlier template revisions/history remain intact. Final source implementation
receipt is recorded in the same catalog after the owned commit.

## Conformance audit

Apps orchestrate; reusable customer interactions live in runtime; serializable
contracts remain neutral; templates provide presentation. Runtime feature source
imports no template/DB/app modules or provider credentials and contains no CS font
or class ownership. Public feature config cannot grant server authority. Existing
shadcn wrappers, focus-managed sheet/dialog shells and Midday layering references
are retained. No new workspace, backend service, protected assistant procedure,
auth table, payment writer or deployment path was introduced.

## Commits and final status

| Phase | Owned local commit |
| --- | --- |
| 0 | d01f6b3d8 |
| 1 | 5ac2e3995 |
| 2 | 00d0648de |
| 3 | 50069fc0c |
| 4 | 86558cadc |
| 5 | b8289e6b0 |
| 6 | 67c70385b |
| 7 | 4aa915004 |

Phase8 source commit and exact Workshop implementation receipt follow after commit.
Concurrent template-update, notification, performance and owner documentation
changes remain outside this task's staged source. No release/deployment readiness
claim follows from local clean=false/runtime-unverified smoke.

## Brain documentation

Local ignored Brain updates (never force-added):
- `.brain/features/shared-storefront-features.md`
- `.brain/decisions/2026-10-28-shared-storefront-features.md`
- `.brain/api/contracts.md`
- `.brain/api/permissions.md`
- `.brain/tasks/in-progress.md`
- `.brain/tasks/done.md`
- `.brain/BRAIN.md`
