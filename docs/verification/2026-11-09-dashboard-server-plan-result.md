# Dashboard server plan result — 9 November 2026

Status: deployed and actual authenticated Settings server paid-read accepted at
14:21:03.995Z (15:21:03.995 Africa/Lagos), exact candidate
`b0e29c66dc663e781a46989c3415beecd94c2694`. Normal Preview/matching existing-data
smoke/Production and API health passed. Mobile release excluded. Apple2/6 remains;
this closes only the licensed reviewer's Settings canonical server-read subcase.

## Later actual Free read —9 November,18:09 Africa/Lagos

After the owner's separately reviewed Release, the same existing authenticated
EwaTrade Review/Main store tab was fully reloaded once. Actual observation
17:09:55.010–17:09:55.124Z found one wrapper read=resolved, planId=free,
source=owner_billing_free. The fresh API-backed retailOps.subscription client
card independently displayed Free/Active, stores1of1, catalog0of10, staff0of0 and
orders0of50. This is a normal client API-read observation, not a copied raw HTTP
response or current ownerCatalog period measurement. Stores1of1 is retained
Store usage, not occupied owner-coverage slots; root saw coverage0of1 on native.

The [coverage receipt](2026-11-09-coverage-release-free-reenroll.md) records the
separate actual hosted jobs Free/null read and original phase/run artifacts.
Root later corrected its Release confirmation timestamp from an estimate to a
clock interval. The two-minute operator baseline precondition is inconclusive;
these actual Free reader facts do not repair that timing gap. No retry, new
Release, database write, purchase or deployment. Restoration is still pending.
The owner subsequently prioritized DeviceHub diagnosis; no restoration read or
further billing action follows without root's later handoff and current-state review.
Screenshot and actual DOM marker/identity context are saved privately at
`/private/tmp/ewatrade-coverage-settings-free-2026-11-09.png` and adjacent
`.evidence.json`. The earlier paid read below remains historical evidence.

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

## Reviewed rollout and actual-result check

Coordinator reviewed exact clean b0. The existing normal Production dry plan
revealed that a Git push rebuilds API and Marketing despite --only dashboard.
Their existing normalized component closures differed from e162 only in four
assistant impact metadata JSONs, with no executable source, config, manifest or
lockfile change. Dashboard is the only runtime-code change. Coordinator reconciled
the unavoidable API/Marketing rebuilds within the owner's existing normal rollout
scope. Because metadata is inside the strict source closure, both were included
in Preview qualification as well; no equivalence gate or provider Git setting was
bypassed. Jobs/mobile stayed skipped, database up to date. No new provider/config
change or repeated jobs diagnostic was needed.

1. `bun run qa:candidate` passed284/1813 for exact clean b0; the release hook
   legitimately reused that fresh source receipt.
2. `bun run release --preview --only dashboard,marketing,api --mobile skip --yes`
   completed0. Its existing executor ran the matching existing-data web smoke
   once with `.scratch/qa-release/smoke-preview.json`; no redundant rerun.
3. `bun run release --production --only dashboard,marketing,api --mobile skip --yes`
   accepted that matching receipt, completed0 and passed Production API health.
4. Canonical alias metadata independently verified all three owned/READY/
   Production/exactb0 at14:20:24.442Z. The existing reviewer session was fully
   reloaded once at /settings/billing, then its actual DOM result was read.

Actual result at14:21:03.995Z: one server wrapper, read=resolved, planId=starter,
source=owner_subscription. Fresh visible account menu matched the original
reviewer email/Owner role and EwaTrade Review/Main store. The client card also
showed Starter Active, ₦5,000/month, stores1of1. No duplicate login/reset, credential
handling, direct database/Apple read, purchase, Restore, coverage write, grant or
reminder occurred. Current signed-in user tab was preserved on billing.

This accepts the current licensed paid Settings canonical server read, rather
than inferring it from API cards/navigation. It does not independently prove the
shell's optimized/joined projection, native finishing, renewal, Free fallback or
retained-data cases. Future unavailable/absent/launch_default/wrong-scope/stale
results must not qualify; a legitimate later Free result must never be forced to
Starter. The actual hosted jobs e162 proof remains valid unchanged runtime source
and was not repeated.

The coordinator's single Manage request was answered during rollout: Apple screen
opens, original product absent; later owner reported no Sandbox entry found.
Only link opening is accepted. Original subscription management/control provenance
and native finish remain open; no account/tester/control change or duplicate phone
request was made. See the [build10 observations](2026-11-09-build10-finish-and-lifecycle-sequence.md).

## Exact connected evidence

Preview smoke receipt:
`.scratch/qa-release/smoke-b0e29c66dc663e781a46989c3415beecd94c2694-preview-web.json`.
Passed14:10:32.782Z, clean/runtimeVerified, exactb0; QA login/account selection,
populated catalog and sale draft/item/total passed, cancelled without submission.
No sale, payment or fixture was created. Its runtime IDs are Dashboard and API
in the table below. Marketing was independently Ready in the normal release.

| Component | Ready Preview | Canonical Ready Production |
| --- | --- | --- |
| Dashboard | dpl_DXny5xjhbNT4JErB35NW5LMyMARq | dpl_97WwGQfoLsbFseFqt3YoQM1hkFhN |
| Marketing | dpl_3gtchwcCLtJ6jqvxzRWpxMCZV9Sk | dpl_HkLpusDKrPiPdbFbBv62dN9iiZi8 |
| API | dpl_64HsnXVaA5a5cHFnY6BqHUq7sta4 | dpl_ePJLRPxehAWYZJ6wEKxtSKm7U3ue |

All bind exactb0. Preview API held the shared build slot after install/Prisma/
bundling; Marketing queued then built normally. No failed smoke, retry deployment,
manual promotion, rollback, checkout/worktree switch or candidate drift occurred.
Both environment-name audits reported no missing settings; no value was changed.
The existing clean-copy executor and normal Preview/main Git pushes were retained.

Private mode0600 evidence uses `/private/tmp/ewatrade-server-plan-b0e29c66d-`:
`production-identity.evidence.json`, `ssr.evidence.json`, both release logs,
Production dry plan and the bounded Preview API build-log capture. The SSR record
contains only finite result/display facts and scope-match booleans, no identity,
cookie, signed receipt or credential. Source remained clean/pinned until final
evidence documentation; temporary tracked-source hold closes after that commit.

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
quick and h01 dated2026-11-09 suffixes. Candidate-bound release/runtime evidence
above supplements, rather than expands, the source-check scope. Final evidence-only
edits received link and diff checks; no repeat source/device/provider matrix.
Brain impact:
local `.brain/features/owner-wide-billing.md`, `.brain/features/native-store-billing.md`
and `.brain/tasks/in-progress.md`. No schema/API/domain contract changes.
