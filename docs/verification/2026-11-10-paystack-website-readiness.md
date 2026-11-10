# Paystack website readiness — 10 November 2026

Status: source/readiness work; no deployment, hosted setting, Paystack financial
setting, charge, subscription, refund, paid grant or coverage was created here.
Normal QA login creates its existing authentication/audit state; it is not a new
business fixture. Company compliance and accepted hosted checkout remain open.
Overall website-payment acceptance remains 2/4 (50%); Apple's separate 3/6 ledger
and its later paid/Free SSR/jobs evidence are retained, not reclassified.

## Fresh observations

- Paystack browser: selected EwaTrade2096714, Test Mode, Starter Business,
  0 of 5 compliance sections complete. No compliance, banking, agreement or
  international capability was submitted. Screenshot saved privately:
  /private/tmp/ewatrade-paystack-compliance-2026-11-10.png.
- Existing local test key/catalog parsed through the canonical loader: six mappings,
  checkout/receiver/USD/international off, no reviewed owner-country binding.
  Six bounded real saved-plan GETs all match merchant2096714, test domain, NGN,
  monthly interval, approved amounts and invoice_limit0. Zero provider writes.
- The old Vercel CLI token was invalid. The owner personally completed its normal
  device/email authorization. The CLI exited0. Read-only API project inventories:
  Preview74 entries and Production74 entries; no Paystack subscription/WEB_BILLING
  names in either project list. No value reads, shared/effective environment
  equality assertion, hosted setting changes or deployment were made.
- Public pricing renders Choose Starter/Growth/Pro with approved NGN prices and
  links to /settings/billing; the existing Production reviewer session reaches
  Plan and billing and renders its current plan. No upgrade was attempted there.
  Private screenshot /private/tmp/ewatrade-website-billing-2026-11-10.png.
- Initial supplied email was absent in both selected profile databases under two
  narrowly scoped RepeatableRead/SQL-first READ ONLY lookups. This is selected-data
  evidence, not proof of hosted database equality. The owner then directed creation
  of a test account and later superseded that with use of an existing QA account.
  Preview signup was prepared; the owner requested its code, but the agent did not
  verify it or create a User/business. No OTP/password was read or stored.
- Normal existing managed-domain QA chooser successfully signed in Bola Pilot,
  OWNER of Bola Laundry Pilot on Preview. Existing billing/plan renders. One
  Upgrade to Growth intent was refused; no checkout page/payment was submitted.
  The visible generic refresh message matches the global PRECONDITION_FAILED to
  CONFLICT formatter. Current QA middleware identifies provider operations as live
  and refuses them before the controller. Screenshot:
  /private/tmp/ewatrade-preview-qa-billing-2026-11-10.png.

A final bounded Preview READ ONLY lookup confirms the selected QA identity is
verified, has current ACTIVE OWNER membership in an active QA Tenant, and has no
OwnerBillingAccount or native owner subscription. Its visible Starter display is
not evidence of a paid owner purchase. No account/territory ID was invented.

## Source corrections

1. The webhook route checked receiver readiness but the exported status/initial
   reconciliation/event functions did not. A fresh disabled-entrypoint regression
   failed four sandbox/Production cases before the fix; two configured cases passed.
   Every entrypoint now checks existing isWebReconciliationConfigured before DB or
   provider work, and the status function propagates its explicit server environment.
   Turning off new checkout alone preserves explicitly enabled reconciliation.
2. Registered QA Paystack Test Mode adapter: exact three retailOps web checkout,
   status and management procedures only; existing validated QA session scope,
   explicit matching local/Preview profile, independent receiver, sandbox mode,
   scoped sk_test_ credential and an independent default-off adapter flag required.
   Production, ordinary non-QA sessions, native verification, refunds, unlisted
   paths and other providers retain denial. The generic QA provider policy and
   normal OWNER/age/legal/tenant/admission rules are unchanged. No request/body
   value can choose the adapter. Existing raw signatures/verified provider domains
   and amounts remain mandatory.
3. Safe fixed billing/QA rule text now uses the existing RULE_REJECTED AppError
   cause instead of being replaced by generic stale-record guidance. No provider
   response, secret, card/authorization data or arbitrary exception text is exposed.

Exact QA procedures: retailOps.createSubscriptionCheckoutIntent,
retailOps.checkWebSubscriptionPayment, retailOps.manageWebSubscription.
Flag: PAYSTACK_QA_SUBSCRIPTIONS_TEST_ADAPTER_ENABLED. It is not forwarded to jobs
or the browser and cannot admit Production even if set there.

## Verification

- Offline QA doctor passes; no runtime certification implied.
- Initial receiver regression: four fail / two pass before the fix. Final exact-file
  focused suite:52 tests/230 assertions pass across receiver entrypoints, actual Hono
  signature route, QA adapter/provider policy, safe public errors and QA session scope.
- Full actual API TypeScript check passes after the release coordinator separately
  committed its three ExactDecimalString shipment fixture corrections at d8b40b2af.
  Those foreign errors were initially reported, preserved and not suppressed here.
- Scoped fast plan/run uses exactly the ten owned paths in the source manifest:
  285 tests/1820 assertions, QA tooling types and changed-file Biome pass. The first
  fast attempt stopped on two import-order diagnostics; those were fixed and the
  same scoped command passed. No unrelated mobile files were included.
- H02 impact gate passes. H01 remains a shared candidate blocker: the committed
  catalog.findByCode, stores.publicListing and stores.updatePublicListing procedures
  are not classified. These are outside this slice, which adds no RPC. The failure
  was relayed to the release coordinator and is not waived or represented as green.
- git diff --check passes. No new dependency/lockfile/schema or DB migration.

Exact-file focused tests use an unusable loopback DB sentinel, overridden Prisma
ports and fixture keys; no provider/SQL call. They are distinct from the six real
saved-plan GETs, two initial scoped identity reads, final QA read and observed UI.
No schema, database migration, new RPC or assistant capability was introduced.
No further ordinary viewport/theme/native matrix is appropriate to this source fix.

## Open gates and owner actions

See [the concrete go-live plan](../billing/paystack-go-live-2026-11-10.md). Source
commit is not hosted payment acceptance. A coherent candidate must clear shared
release gates, then receive matched Preview code/configuration, canonical QA owner
billing-country binding and signed test/lifecycle verification. The owner handles
company/bank/BVN/agreement activation and the test-payment submission. Production
provider/live approval and international capability remain separate.

## Brain impact

Local-only ignored Brain files updated:

- .brain/BRAIN.md
- .brain/tasks/in-progress.md
- .brain/features/owner-wide-billing.md
- .brain/features/mobile-dev-preview-qa-accelerator.md
- .brain/api/contracts.md
- .brain/api/permissions.md
- .brain/decisions/2026-11-08-web-paystack-only.md

No database/schema documentation change is needed: no schema or financial data
write occurred. Existing later Apple3/6 and paid/Free SSR/jobs receipts are reused
only for their accepted scope. No new native acceptance is claimed.

Verified owned runtime/test source SHA-256:


- `apps/api/src/billing/web-subscriptions.ts`: `89fe53bf3712151410d69c8109a86da202e4ad8a1332f332f7d43dc749fdee94`.

- `apps/api/src/billing/web-subscriptions-activation.test.ts`: `d6136f3a97a32aa7a6121e047286fdffdafc123438fc61673a3415254a423d2b`.

- `apps/api/src/utils/qa-provider-operation.ts`: `75c28f835fd27c4b7503deca14c8d62fe7aca806f2aa39e3dfd909ce7ec2279a`.

- `apps/api/src/utils/qa-provider-operation.test.ts`: `2b8367334e50a422f42578f29aa58db6e3e5154298623e19d8beab7c145587ea`.

- `apps/api/src/trpc/init.ts`: `0ea580d682a7bc4ffeb73c7184ad642c1361fdfeb63f021c008fed7b577d08bb`.

- `apps/api/src/trpc/routers/retail-ops-subscriptions.ts`: `0fe61ba5eec1848ca93aef1917930d423b9890e73498dd5b211192c89ab68508`.
