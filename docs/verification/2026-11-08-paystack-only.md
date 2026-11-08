# Paystack-only source verification — 8 November 2026

Current main checkout, no branch/worktree change. Owner selected Paystack-only and
explicitly deferred Zenith USD financial setup. Completed source remains behind
existing owner/environment gates, a new Production release-acceptance gate, and
separate international/USD approval flags. No settings, provider product, account,
credential, charge, flags, schema, deployment, push or merge were performed.

[Implementation, setup and open acceptance](../billing/paystack-only-2026-11-08.md).

## Executed focused evidence

- Offline doctor passes; no connection in that check.
- Initial local doctor could not reach services without the existing Portless CA.
  With NODE_EXTRA_CA_CERTS pointing at that CA, API database readiness, Dashboard
  and existing QA capability all pass. This does not establish served source identity.
- Full payments:78 tests/505 assertions pass across11 files; all HTTP is stubbed.
- Focused DB owner/native-policy, existing Retail Ops, raw webhook endpoint,
  checkout legal, QA provider and Dashboard navigation:88 tests/330 assertions
  pass across12 files (runner output includes repeated imported fixtures).
- Owner journal delegate fixture independently passes5 tests/31 assertions after
  the closure/deletion fix. It serializes the fixture transaction and records the
  real repository lock call; it does not execute PostgreSQL or prove real locking.
- Full payments types pass. Full API/DB/Dashboard final types and fast smoke pass as recorded below.
- H01 regenerated coverage: only2 form-only merchant procedures added; no assistant
  tool/capability/rollout change. H02 records API and permission decisions locally.

The initial full API/DB Node type checks hit the default4GB heap limit; the
repository-sized checks use NODE_OPTIONS=--max-old-space-size=12000. No compiler
options, assertions or checks were disabled.

## Browser evidence and limits

The first ordinary local smoke could not launch the browser in the filesystem
sandbox and produced no screenshot/checks. The normal runner was retried with
permission to launch Chromium. Its journey finished but a changed source/status
invalidated that receipt; it is not accepted. The final unchanged-source ordinary
existing-data smoke is recorded below. The runner blocks business writes and
submits no payment or fixture. Local receipts remain runtimeVerified:false;
none qualifies Preview/Production or hosted payment/coverage acceptance.

## Remaining acceptance

Secure Paystack test configuration, actual saved plan mappings, reviewed country
binding and international approval are still required. Sandbox hosted return,
initial/renewal/refund/card-update event shapes/order, explicit business coverage,
real money/permission/concurrency and native conflict checks remain unaccepted.
Disputes, failure courtesy, partial-refund/manual review, uncertain-outcome recovery
and any shared merchant webhook routing remain paid-launch gates; the Production
release flag must remain closed. USD additionally waits for Zenith/Paystack and
approved actual USD prices. No request to repeat previously approved price policy.

Brain impact: owner/subscription features, API contracts/permissions, schema storage
notes, in-progress/BRAIN pointers and Paystack-only ADR updated locally. Brain is
ignored/local-only and is not force-added. No Prisma schema/migration change.
Assistant stays form-only and provider QA refusal is preserved.

## Final checks

- Full payments, DB, API and Dashboard TypeScript: exit0. API/DB/Dashboard used
  `NODE_OPTIONS=--max-old-space-size=12000` and incremental=false. No schema generation
  or database command was required because the Prisma schema is unchanged.
- Scoped `test:quick --plan --files <32 owned paths>`: zero unmapped paths.
- Scoped `test:quick --files <32 owned paths>`:284 tests/1813 assertions across56
  files, QA tooling types and changed-file Biome pass. The scope excludes9 concurrent
  Apple/native paths. A prior attempt failed only impact-record JSON formatting;
  corrected through Biome, then the same scoped command passed.
- Final full payments78/505 additionally covers exact international NGN and approved
  USD initialization. Only fixture prices are used; no real USD quote is approved.
  Payment types and changed-file Biome pass after those extra fixture cases. The
  broad source smoke is reused because no application code changed afterward.
- H01 `APP_ENV=local bun --cwd apps/api assistant:coverage --check`: pass/current.
- H02 `bun assistant:impact`: pass;2 local records cover concurrent work, zero new
  assistant capabilities and2 new form-only procedure rows. This is not acceptance
  of the other chat's native/Production work.
- Existing-data web smoke passes at checkout base
  `7b92075e94a36e5e28a79cbb1c8d3613ff475a7d` on8November2026, private receipt
  `.scratch/qa-release/smoke-7b92075e94a36e5e28a79cbb1c8d3613ff475a7d-local-web.json`.
  Dirty local checkout / runtimeVerified:false is retained. The journey exercises
  existing QA login, Catalog, draft total and Cancel, with business writes blocked;
  it does not exercise an enabled Paystack checkout or payment/coverage UI.
- Application-source byte hashes remain unchanged after that passing browser run;
  only impact JSON whitespace and extra provider fixture tests changed afterward.
- `git diff --check`: pass. No push, merge, deployment or provider setting change.

## Brain documents updated

All remain ignored/local-only; none is force-added:

- `.brain/BRAIN.md`
- `.brain/features/retail-ops-subscription-packaging.md`
- `.brain/features/owner-wide-billing.md`
- `.brain/api/contracts.md`
- `.brain/api/permissions.md`
- `.brain/database/schema.md`
- `.brain/tasks/in-progress.md`
- `.brain/decisions/2026-11-08-web-paystack-only.md`
- `.brain/decisions/2026-11-08-web-paystack-polar-pricing.md` (supersession pointer)

The stable task denominator remains audit, accepted direct checkout, focused
verification and provider acceptance:2/4 accepted (50%). Source preparation is
substantial progress but is not hosted checkout or live acceptance.


## Source SHA-256

- `apps/api/src/billing/paystack-subscription-webhook.ts`: `446940b394c26c1bd941644934f0e168f8a26e54a183de1a68682866691242c4`
- `apps/api/src/billing/web-subscriptions.ts`: `4de0eab296d3cd8f8a1fa175fe8952417e49dcf9742419eb720db2c08ac6bf82`
- `apps/api/src/index.ts`: `5368248d727f675b83ac4d47b821d2118c7aade49946e53ab72317b99fb94eb4`
- `apps/api/src/trpc/routers/retail-ops-subscriptions.ts`: `c66ba1d86988373a6c2a061b4bb5f7976ebb4944059d305c3218a5371256815a`
- `apps/api/src/trpc/routers/store-subscriptions.ts`: `e7a032278a459ee93607eba0ed43e4e7e0311c66f9789e649d1d3b1156fe927c`
- `apps/api/src/utils/qa-provider-operation.ts`: `b921285b5e32499ad7e4f47f5c26a0f67de48cd7ed5fce19e62115f74a98702e`
- `apps/dashboard/src/components/dashboard/retail-ops-subscription-settings.tsx`: `3d95888eb02add5a3b43d916a25fe6c3c9531c8bdcedbdee9430a7e367a8a367`
- `packages/assistant/src/capabilities/inventory.ts`: `bf393a27fc83e49f3dedb64c9e4b87166d3b7187cb356a0547f36a4478429570`
- `packages/db/src/queries/owner-billing/index.ts`: `c78407149d1475a63d186872f5d72622eb03581691435961e066a7eebdc90a89`
- `packages/db/src/queries/owner-billing/policy.ts`: `4bad8b3b7b08563250722fcd17fec311e83f018f01ce8d0d979af291f5a933a1`
- `packages/db/src/queries/owner-billing/prisma-repository.ts`: `1fc3276ab26a04323b251f9941a21246e0e95cb72ed5894ad2b1b7899bcc4cc1`
- `packages/db/src/queries/owner-billing/purchases.ts`: `987dd99c7a89f32e078002f70198bbd2c7c4c0b5d609fdc63bfbd109ec4ae772`
- `packages/db/src/queries/owner-billing/web-checkout-journal.ts`: `dcab837811d725fa3f89836bcc783b92e751432ad2525eef165a729991413b41`
- `packages/db/src/queries/owner-billing/web-checkout.ts`: `27afbcd411aba78e6c3680dd4995f99c83dba0036f6541b50b7840e8027ac8c2`
- `packages/payments/src/web-subscriptions/config.ts`: `0c90e545ae705ff835bba5b428ff32d7aeed71c45c023e1bf0ea0b1dfca35df7`
- `packages/payments/src/web-subscriptions/index.ts`: `736189b65e78135d9d5f190536bbbc7749a640d151160ae10a2cee116eee58ee`
- `packages/payments/src/web-subscriptions/paystack-receipts.ts`: `8c409d04816cedb884bd8fa7f32e14c36d851d95e2cbf0cbc023f8cddeced135`
- `packages/payments/src/web-subscriptions/providers.ts`: `13b55361e1e4bd86052a1da5776ba23323f6b17f55a8384f1915d780860bfa52`
