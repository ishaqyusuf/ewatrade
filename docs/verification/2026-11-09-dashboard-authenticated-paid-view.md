# Authenticated Dashboard paid view — 9 November 2026

Status: correct reviewer/workspace and API-backed Starter display accepted.
Independent Dashboard SSR canonical paid-reader proof remains open. This does not
close Apple lifecycle/native gates or change Apple2/6. Mobile release excluded.

The owner completed sign-in directly. The retained login tab was still on login;
the signed-in Dashboard was in a separate existing Chrome tab. No duplicate
sign-in, password reset, credential entry or authentication change was performed.

The account menu identified the existing licensed reviewer email and Owner role.
The workspace was EwaTrade Review / Main store. During the connected read-only
window ending13:50Z, Overview showed Starter, and Plan and billing showed:

- Starter, Active, ₦5,000/month; renews9Nov2026.
- Stores1of1; catalog items0of100; staff0of2.
- Offline devices0of1; report history30days; orders0/no limit.

These are observed Dashboard facts, not a new direct database or Apple read.
They do not establish the current exact Apple period end or renewal outcome.
The original purchase, coverage and Restore evidence and actual hosted jobs
result are retained in the [hosted reader receipt](2026-11-09-billing-reader-job-check.md).
No purchase, Restore, business release, provider control, fixture, reminder,
grant, deployment or mobile build was performed in this check.

Canonical Dashboard metadata independently checked13:50:22.432Z was owned,
READY/Production, deployment `dpl_4EMAUhJWUAeGL8cw2PiZE3qnCWU8`, exact candidate
`e1626301dd3aef0925ac9cda3b2140c9cfc04012`. Private mode0600 metadata evidence:
`/private/tmp/ewatrade-dashboard-signed-in-identity-2026-11-09.evidence.json`.

## Why SSR remains open

Source review of that deployed candidate found no distinguishing visible
postcondition for a successful SSR paid-plan read:

- Shell `apps/dashboard/src/app/(shell)/layout.tsx` reads canonical plan features,
  but catches failure as undefined. Settings layout likewise catches its
  `getRetailOpsTenantPlan` read as undefined.
- `apps/dashboard/src/lib/navigation.ts` deliberately permits gated navigation
  when planFeatures is undefined. Starter includes all features used by those
  navigation gates, so the observed links also fit the error fallback.
- `apps/dashboard/src/components/dashboard/owner-signup-home.tsx` loads the
  Overview plan strip using client `retailOps.subscription`.
- `apps/dashboard/src/components/dashboard/retail-ops-subscription-settings.tsx`
  likewise loads the billing snapshot through client TRPC. Its paid plan card
  establishes the API-backed view, not the Dashboard server reader.

The six relevant source files, including the shared plan catalogue, have no
diff from deployed e162 to the inspected local HEAD. Visible navigation or an
API-backed plan card cannot be promoted to independent SSR acceptance. No
instrumentation or new deployment is inferred from sign-in authorization.

Next native case remains the source-audited, read-only Manage subscriptions
inspection in the [build10 sequence](2026-11-09-build10-finish-and-lifecycle-sequence.md),
under the existing coordinator's device handoff. Do not buy again or repeat
Restore to compensate for the SSR evidence gap. Native transaction finishing,
renewal, failure/recovery, expiry and refund cases remain separate.

Validation: offline doctor passed; one-owned-document quick smoke passed51tests/
254assertions and QA tooling types. This is narrower than whole-checkout
verification. Source comparison above and documentation links reviewed;
this documentation-only change requires no repeat device,
provider or release testing. Brain impact recorded locally in
`.brain/features/native-store-billing.md` and `.brain/tasks/in-progress.md`.
