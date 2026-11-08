# Web billing handoff verification — 8 November 2026

Run ID: `2026-11-08-web-billing-handoff`. Local `main` checkout; no worktree.
Window: 14:01–14:13 WAT (13:01–13:13 UTC), including investigation and focused checks.
Base at verification completion: `035e2c9ff5800e3c473c05418e1d452d2a7968b6` (concurrent Android documentation commits
advanced HEAD during the task; owned code paths below were reviewed separately).
The following changes are dirty at verification; the commit containing this receipt
owns their final committed source. No push/deployment/provider/account changes.

## Outcome and limits

The rendered /contact paid-plan bug is fixed. Dashboard billing navigation,
valid-URL handoff, shared pending guard and persistent errors are repaired.
Full source inventory, local behavior, remaining owner inputs and provider/lifecycle
implementation gaps: [audit](../billing/web-payment-readiness-2026-11-08.md).
Zero working website subscription integrations are claimed. No processor transaction
or paid owner entitlement was created. Native billing and QA boundaries are intact.

## Executed verification

- Initial rendered pricing regression: 0 pass / 2 fail on /contact; fixed.
- Final focused tests (explicit paths): 59 pass / 198 assertions across seven files.
  Files: marketing-offers, pricing-plans, subscription-checkout-navigation,
  payments/index, retail-ops-subscriptions, launch-v4/marketing-tracking and
  API qa-provider-operation. All provider HTTP in these tests is mocked.
- `bun run qa:doctor --offline`: pass; local profile isolation verified offline.
- `NODE_EXTRA_CA_CERTS=$HOME/.portless/ca.pem bun run qa:doctor --services api,dashboard,marketing`:
  pass. The first attempt lacked the trusted Portless CA; no service was restarted.
- `bun --cwd apps/marketing typecheck`: pass after keeping the new pricing CTA
  union scoped to pricing rather than widening all signup CTA consumers.
- `NODE_OPTIONS=--max-old-space-size=12000 bun --cwd apps/dashboard typecheck`:
  pass after the final UI edit. Initial default-heap run exhausted 4 GB.
- `bun --cwd packages/payments typecheck`: fails on four existing fetch fixture
  casts in paystack-banking.test.ts (56,75,130,153); added contract test has no
  diagnostic. No unrelated fixture was changed or test skipped.
- `bun run test:quick --plan --files <owned source paths>`: zero unmapped paths.
- `bun run test:quick --files <owned source paths, impact record, audit>`:
  284 pass / 1,813 assertions across 56 files; QA tooling TypeScript and changed-file
  Biome pass. Explicit scope excludes concurrent Android documentation work.
- `APP_ENV=local bun --cwd apps/api assistant:coverage`: H01 pass; no output diff.
- `bun assistant:impact`: H02 pass; one reviewed record covers client/domain,
  no capability or procedure rows changed.
- `git diff --check`: pass.

## Actual browser evidence

Existing-data local web smoke command:
`NODE_EXTRA_CA_CERTS=$HOME/.portless/ca.pem bun run qa:smoke --target local --surface web --config .scratch/qa-release/smoke-local.json`.
First sandboxed launch failed before creating check artifacts; retry through the
same command with browser process permissions passed. Existing local runtime was
reused. Receipt `smoke-035e2c9ff5800e3c473c05418e1d452d2a7968b6-local-web.json`
is dirty local, `runtimeVerified: false`; not target release acceptance.

CUA desktop browser: visible Choose Growth link points to canonical local billing;
click reaches login?next=/settings/billing, existing Jawdah QA OWNER sign-in reaches
Plan and billing. Upgrade displays pending then a persistent generic refusal
(`This information changed. Refresh and try again.`); Growth remains active.
The source's QA provider boundary classifies this exact mutation as subscription
and refuses live provider work. It was not bypassed. This proves failure UI,
not Paystack delivery or the provider-unconfigured response on a real account.
Final sign-out observed. No sale/payment or new test fixture was submitted.

Production API environment-name inventory is read-only: 70 project entries, zero
matching payment-provider names. No secret values exported; no account/API-key
validity or separately managed secret-store claim.

## Relevant SHA-256 hashes

- `apps/dashboard/src/components/dashboard/retail-ops-subscription-settings.tsx`: `bd75d9245669b9e9abf322b47fcd695174c792b8098ecf54cb2d3fda46b87fd8`
- `apps/dashboard/src/lib/subscription-checkout-navigation.ts`: `f5fdcb2e6980c32705f39a7c14a58c8cd554a5426140627b8476225e9d9b8d1d`
- `apps/dashboard/src/lib/subscription-checkout-navigation.test.ts`: `7740c29b0d4e6cfc153ea948763f72204a0b1059e176355bbe812ab4c68de621`
- `apps/marketing/src/lib/marketing-offers.ts`: `f944c1edb063ff0f2ec951ae4bc24a7bcb31cd3756d1cdba1831905f5a76d43c`
- `apps/marketing/src/lib/marketing-offers.test.tsx`: `811a8a8feb177e99166d26af3a6f3b3f71df18e70b3758c1758f31a784b561d2`
- `apps/marketing/src/lib/pricing-plans.ts`: `be8d4a1160b30878195acf6edd7593da6640528852dd3a39349c2b4922c5014b`
- `apps/marketing/src/lib/pricing-plans.test.ts`: `ff45f398b387b0467ba598020cee5b9b31f73695868244f203275a332e9141cb`
- `apps/marketing/src/components/marketing/experiences/launch-v4/page-sections.tsx`: `5f49d270c13aaec3db8fdfeeef0a1202960cbefc5e82a92e376beb260b868787`
- `apps/marketing/src/components/marketing/experiences/launch-v4/pricing-v15.tsx`: `91a3a37112944195029636ef1debda1d413b8d822fea8eb5eee16eb0aa57b16a`
- `packages/db/src/queries/retail-ops-subscriptions.ts`: `3575e2e57eb7388ed6c105bc8be8dff4d679d23d20690ba80e2bb11519083be7`
- `packages/db/src/queries/retail-ops-subscriptions.test.ts`: `55cb54a51ae7f048c49c63378efb2d45bfec3580b18a7676761b268d3be05f27`
- `packages/payments/src/index.test.ts`: `ab753526e85b1fceba117d859a590ca0066e79ce00907ce5b26a085491c30fac`
- `packages/assistant/impact/2026-11-08-web-billing-handoff.json`: `d436d5164667bf32321c4025c7233102a6e84aedf7d19f5ebd3c268eb27482a3`
- `bun.lock`: `79b1b1edf1ef209e4e14cedc96798955afb0c8d10bf42cd2c6ec79a52f79913c`
