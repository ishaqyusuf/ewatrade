# Dashboard/jobs billing-reader activation — 9 November 2026

## Final task-local checkpoint — 9 November 2026

The follow-up diagnostic is now deployed in clean e1626301d after normal Preview,
matching existing-data smoke and Production health. All public web/API aliases are
exacte162; both jobs projects promoted20261109.2. Preview returned disabled without
Production identity input. Actual Production READ ONLY execution returned current
reviewer Starter/owner_subscription and owner-plan Starter, with fresh owner scope.
See the [hosted check receipt](2026-11-09-billing-reader-job-check.md).
Actual signed-in Dashboard SSR/Free/native lifecycle remain open; Apple2/6 and
mobile exclusion unchanged. Earlier activation evidence below keeps its scope.

Status: owner-approved configuration and normal Preview → matching smoke →
Production rollout complete. Hosted configuration and shared-reader reconstruction
pass. Actual reviewer Dashboard SSR and task-local jobs reads remain separate
open acceptance. Apple remains **2/6 (33.3%)**. No mobile release.

## Approved scope and configuration

The owner explicitly approved the concrete scope in the
[reader configuration audit](2026-11-08-billing-reader-job-config.md), using the
existing single immutable reviewer owner. No new purchase, manual grant,
business release, reminder invocation, provider setup, public checkout, WEB
reconciliation switch or Paystack subscription credential was included.

Vercel CLI normal sign-in was restored. The Dashboard project inventory confirmed
only its existing APP_ENV among the seven required names. Six Production-only
entries were added: DEV_PROFILE, OWNER_BILLING_ENABLED, STORE_BILLING_ENABLED,
STORE_BILLING_ENVIRONMENT, APP_STORE_REVIEW_SANDBOX_ENABLED and
APP_STORE_REVIEW_OWNER_IDS. All seven exact values/targets were privately verified;
reviewer count1 matches the approved capture. Preview was not changed.

Two batch requests failed400 Invalid JSON and added no entries. Inspection of
installed CLI54.4.1 showed its API request wrapper serializes objects but passes
arrays through to fetch. The same six approved entries were submitted individually
through the object path; no CLI patch or permission bypass was used. This uses
the documented [Vercel environment API](https://vercel.com/docs/rest-api/projects/create-one-or-more-environment-variables).

The selected local Production Trigger key was invalid. The existing CLI login
retrieved the current key from the exact mapped project/environment after checking
organization ownership. It successfully read the existing promoted6a deployment,
then replaced only the stale selected-file assignment. No key was created or
rotated, no other assignment changed, and no hosted key write was made. Before
rollout, both promoted6a jobs environments lacked all reader flags and DEV_PROFILE.

## Candidate and release evidence

Clean current checkout candidate: `529a4499879995383273113ef99d01e8192d209f`.
No worktree or branch change. Other chats held repository edits. The only jobs
source difference from6a is the existing25-line reader-settings sync correction;
task implementations and schedule definitions are unchanged. Normal main push
also includes Marketing for the four committed signup tint updates. Mobile source
is present in Git but no build, upload or OTA was executed.

- Offline QA doctor passed; no runtime probe implied.
- Existing focused sync/policy21tests/239assertions and H01/H02 evidence is reused
  for unchanged relevant source. Full candidate source smoke passed284tests/
  1813assertions, plus its tooling types and changed-file lint.
- `bun run release --preview --only dashboard,marketing,api,jobs --mobile skip --yes`
  completed0. Marketing waited for a Vercel concurrent build slot, then built;
  no additional deployment was issued to retry smoke.
- Matching existing-data web smoke passed at09:06:08.863Z, clean/runtimeVerified,
  bound to529a44998. Receipt
  `.scratch/qa-release/smoke-529a4499879995383273113ef99d01e8192d209f-preview-web.json`;
  runtime IDs `dpl_GpVBCX19bgHHPiqvaK3e9HHF3Jzk` and
  `dpl_9qcFDkhuNGvNHq2m2a8REeKMWDAu`.
- The matching Production command completed0 and SQL-backed API health passed.
  No database schema change or migration was performed.

Canonical Production identity checked09:12:27.872Z:

| Surface | Deployment | Source |
| --- | --- | --- |
| Dashboard | `dpl_88jn7tUbSRw1CXpu3Ry8tVWFGkEs` | exact529a44998 |
| Marketing | `dpl_BbwhnjHi4fZ8u9KgAocpWzP6jG5v` | exact529a44998 |
| API | `dpl_B7AtaDiHhKMJhqG5hHJYNAe7o4iY` | retainede047ed676; no component-source difference from529 |

All are owned/READY/Production on their canonical public hosts. An initial
all-components-exact-SHA assertion refused the retained API deployment. The release
plan correctly classified API up to date; the normal `qa:smoke` component-source
equivalence assertion then passed with zero API closure differences. Changed
Dashboard/Marketing still required exact529. No stale/wrong source was waived.

## Jobs configuration and existing-data reconstruction

Both isolated jobs projects promoted exact clean529, version20261109.1:

| Profile | Deployment | Verified settings |
| --- | --- | --- |
| Preview | `deployment_ts4f26tzmzwz79h7emi4u` | APP_ENV/DEV_PROFILE preview; owner/store/reviewer false; no store environment/reviewer; no automatic Preview timers |
| Production | `deployment_kd42igjkfvanr3gzwsgr1` | APP_ENV/DEV_PROFILE production; owner/store/reviewer true; store environment production; exact approved reviewer1; prelaunch schedule mode retained |

Hosted SDK reads verified these settings after promotion. Neither project has WEB
billing flags or a Paystack subscription credential in this reader sync. No task
was manually triggered, and the reminder task was not used as a diagnostic because
it can write/send.

At09:12:01.163Z, one bounded Production READ ONLY transaction rechecked current
ACTIVE OWNER membership and called both actual shared readers for the existing
reviewer business under (a) the hosted-verified Dashboard settings and (b) the
promoted jobs environment settings. Both returned canonical Starter from
owner_subscription and owner-plan Starter. Reviewer binding passed; no purchase,
coverage or other business write occurred.

This is an **operator reconstruction**, not execution inside a Dashboard render
or hosted task. The existing Chrome Dashboard session was signed out. Its original
login tab is retained for the owner to use the existing reviewer password directly;
the source chat owns that single handoff. No duplicate question, reset, OTP/email
send, new credential collection or forged browser session was initiated. A task-local
paid/Free read and actual reviewer SSR remain open; configuration/source presence
does not close those checks. Native StoreKit finish, scope/switching, renewal,
failure/grace, refund/revocation, retained-record limits and review/legal gates also
remain open. Existing enrollment/Restore proof remains unchanged.

## Evidence and Brain impact

Private, mode0600 evidence under `/private/tmp/`:

- `ewatrade-billing-readers-config-applied.evidence.json`
- `ewatrade-trigger-existing-key-refresh.evidence.json`
- `ewatrade-billing-readers-trigger-{preview,production}-{before,after}.evidence.json`
- `ewatrade-billing-readers-production-identity.evidence.json`
- `ewatrade-billing-readers-config-reconstruction.evidence.json`
- `ewatrade-billing-readers-529a44998-{preview,production}-release.log`

Signed receipts, credentials, immutable owner IDs and transaction references remain
private. Documentation links, saved evidence assertions and `git diff --check`
pass. No application source changed in this activation slice. Brain impact updated
locally in `.brain/BRAIN.md`, `.brain/tasks/in-progress.md`,
`.brain/features/owner-wide-billing.md` and `.brain/features/native-store-billing.md`.
No schema, API contract, permission or assistant capability changed.
