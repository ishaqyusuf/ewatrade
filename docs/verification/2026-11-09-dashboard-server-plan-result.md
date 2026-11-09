# Dashboard server plan result — 9 November 2026

Status: source preparation only; not deployed and no new live probe performed.
Actual Dashboard SSR acceptance remains open until the reviewed candidate passes
normal Preview, matching existing-data smoke and Production, followed by the
existing authenticated reviewer check. Mobile release excluded. Apple2/6 remains.

## Evidence gap and alternatives

The [authenticated paid view](2026-11-09-dashboard-authenticated-paid-view.md)
accepted the correct reviewer/workspace and API-backed Starter display. Existing
navigation cannot distinguish resolved paid features from its intentional
undefined-feature fallback. Both visible plan cards load through client TRPC.

Before preparing source, the saved e162 Preview/Production release logs,
candidate-bound Preview smoke receipt and current Dashboard deployment metadata
were inspected without printing payloads or identity. None records a Dashboard
canonical plan result. The hosted jobs result proves another process only.
The server layouts catch plan failures locally; no existing billing-result event
or span is emitted there. Existing request/transport timing traces carry numeric
phase/count metrics, not the result. External diagnostics use tracesSampleRate0
and disable logs; caught errors do not reach onRequestError. No tracing settings,
provider logs, credentials or global instrumentation were changed or activated.

The lowest-impact alternative is retaining the explicit SSR gap and reusing
API/jobs evidence. That adds no source but cannot establish the actual SSR result.
Adding logging or an endpoint would introduce a larger data/operational surface;
changing the optimized shell reader would add unnecessary risk. The existing
Settings server layout already awaits the complete canonical result, making it
the smallest place to retain an observable result without another read.

## Prepared change

Owned runtime path: `apps/dashboard/src/app/(shell)/settings/layout.tsx`.
It retains the result of the existing authenticated, server-scoped
getRetailOpsTenantPlan call and annotates its existing outer div:

| State | data-billing-plan-read | data-billing-plan-id | data-billing-plan-source |
| --- | --- | --- | --- |
| Canonical result | resolved | Actual plan.id: free/starter/growth/pro | Actual finite subscription.source |
| Caught read failure | unavailable | Absent | Absent |
| No session/workspace context | Absent | Absent | Absent |

Source distinguishes real owner coverage from launch_default Starter; a Starter
label alone must not qualify owner-subscription acceptance. A resolved Free result
is legitimate current state, never a reason to force a paid marker or grant.
The marker is a render-time observation, not a native-finish, renewal or authority
receipt. The authenticated shell still owns admission; no public endpoint, header,
client cache input, request parameter or bypass is added.

This has durable diagnostic value: it distinguishes a real server result from a
degraded navigation fallback when investigating client/server disagreement. Only
existing catalogue/source enums are rendered; no owner/business/transaction IDs,
dates, receipts, credentials, exception text or account details are added. Existing
query count, request scope, awaited timing, navigation features and error fallback
are preserved. No style, copy, product flow, money or permission rule changes.
No telemetry sink, persistent record or new dependency is introduced.

Focused test path:
`apps/dashboard/src/app/(shell)/settings/settings-plan-loading.test.tsx`.
It invokes the actual async layout and inspects its resulting element/navigation:
all four canonical plan IDs with their unchanged gates, one read per current
workspace, failed fresh read after success with no stale ID/source/error,
no-context refusal to read, and launch_default distinct from owner coverage.
It does not substitute a result marker for the canonical reader in runtime code.

## Proposed normal rollout and actual-result check

Do not execute an unreviewed candidate. After coordinator review, pin the exact
coherent clean candidate in the current checkout; preserve other chats' changes
and do not use worktrees. Dashboard is the only changed deployable component.
API/jobs/Marketing retain their verified candidates; no provider/config changes
or repeated jobs diagnostic are needed for this source change.

1. `bun run release --preview --only dashboard --mobile skip --yes`.
2. `bun run qa:smoke --target preview --surface web --config .scratch/qa-release/smoke-preview.json`.
   Require clean, passed, runtimeVerified receipt matching the exact candidate
   and owned Ready Preview deployment. No sale/payment/fixture. Retry a failed
   smoke with qa:smoke; do not deploy merely to retry a test.
3. `bun run release --production --only dashboard --mobile skip --yes`.
   Its shared executor retains clean-copy verification and matching-smoke gates.
4. Independently verify canonical Dashboard ownership/Ready/Production/source.
   Reuse the current signed-in reviewer session. Fully reload the existing
   /settings/billing page once so a retained client layout cannot supply an older
   marker, then read the existing wrapper's DOM attributes. Record observation
   time, route, deployment/candidate and the finite server result. Verify the
   reviewer/workspace through normal visible UI without exposing identifiers.

Expected paid acceptance requires resolved/starter/owner_subscription for the
original still-covered licensed reviewer. If the genuine period has advanced,
record the actual result and reconcile it with current policy; do not force
Starter. Unavailable, absent, launch_default, wrong scope/runtime or a stale render
does not close the paid SSR subcase. A legitimate resolved Free state can close a
separately identified current Free-read observation, not the historical paid one.
This marker proves the Settings canonical server read only; it does not independently
prove the shell's optimized/joined navigation projection, native queue finishing
or the remaining lifecycle/retained-data cases.

The single next device request remains with the coordinating chat: in installed10
on the original owner/business, tap Manage store subscriptions once, inspect which
Apple screen and original Starter subscription appear, record product/period/
renewal state, then return. Stop if absent/ambiguous. No cancel, refund, purchase,
Restore, release or Apple-account/tester switch. Owner handles system authentication
directly. See the [build10 sequence](2026-11-09-build10-finish-and-lifecycle-sequence.md).

## Source verification

- Offline doctor passed without runtime/device/database/provider probes.
- Actual async layout boundary:4tests/39assertions pass, covering all four plans,
  source distinction, current scope/read count, failure and absent context.
- Dashboard typecheck passed; changed-file Biome and git diff --check passed.
- Four-owned-path quick smoke passed284tests/1813assertions plus QA tooling types.
  The impact-record mapping selects all existing source-smoke groups; this is
  scoped evidence, not whole-checkout, native/UI or release acceptance.
- H01 with canonical APP_ENV=local reports the coverage snapshot current. H02
  passes one client impact record with zero capability/procedure row changes.
  Local source-check auth-secret quality warnings were retained; no secret or
  environment setting was changed.

Private local logs use `/private/tmp/ewatrade-settings-plan-read-` with types,
quick and h01 dated2026-11-09 suffixes. These checks do not replace the proposed
candidate-bound Preview and actual authenticated Production read. Brain impact:
local `.brain/features/owner-wide-billing.md`, `.brain/features/native-store-billing.md`
and `.brain/tasks/in-progress.md`. No schema/API/domain contract changes.
