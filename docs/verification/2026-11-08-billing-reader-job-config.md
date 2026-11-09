# Billing reader jobs configuration — 8 November 2026

## Current checkpoint — 9 November 2026

The owner subsequently approved this exact Dashboard/jobs scope. CLI access and
selected-file credentials were restored; configuration and normal Preview →
matching smoke → Production completed at529a44998. Hosted settings and shared-reader
reconstruction pass; actual reviewer SSR/task-local reads remain open. Mobile is
excluded, Apple2/6 unchanged. See the
[runtime activation receipt](2026-11-09-billing-reader-runtime-activation.md).
The audit/proposal and source-only checkpoints below are historical.

## Hosted Dashboard audit — 9 November 2026

Read-only inspection of the `ewatrade-dashboard` Vercel project found **No Results
Found** for `BILLING` under both Project and Shared environment-variable tabs,
with All Environments selected. No variable value was revealed, added or changed.
This establishes missing listed Dashboard billing configuration; it does not prove
the effective environment of an already-built deployment. CLI authentication is
currently unavailable, so a fresh provider deployment identity and effective
runtime parity are not claimed. The last accepted web/API candidate remains
`e047ed676fff074a4ec8e0627ddc3e579b9a7448`; jobs remain `6a4948c8`.

Source explains the resulting risk: `ownerBillingRuntime` refuses owner billing
without `OWNER_BILLING_ENABLED=true` and a valid `STORE_BILLING_ENVIRONMENT`.
The reviewer exception additionally requires its exact production profile,
store switch and approved immutable owner allowlist. API settings alone cannot
satisfy those conditions in Dashboard or jobs. The shared-env mapping does not
supply these settings. Existing enrolled Starter data must not be changed to
compensate for a reader configuration gap.

### Concrete next runtime scope, pending authorization

| Runtime | Proposed configuration / verification |
| --- | --- |
| Dashboard Production | `OWNER_BILLING_ENABLED=true`, `STORE_BILLING_ENABLED=true`, `STORE_BILLING_ENVIRONMENT=production`, `APP_STORE_REVIEW_SANDBOX_ENABLED=true`; copy the existing approved single-owner `APP_STORE_REVIEW_OWNER_IDS` privately. Confirm `APP_ENV=production` and `DEV_PROFILE=production` (or supported `prod`). |
| Dashboard Preview | Preserve Preview isolation and its reviewed selected profile; do not copy the Production reviewer exception or Production DB into Preview. |
| Jobs | Use the existing selected-file wrapper and its five-setting allowlist/profile derivation; inspect the exact resulting targets before normal Preview/Production deployment. Paid-reminder eligibility may change when readers recognize existing coverage. Do not execute or send a reminder to test it. |
| Acceptance | Pin a clean candidate in the current checkout, reuse relevant valid source checks, run the normal Preview path and matching existing-data smoke, then Production. Verify same-scope existing paid/Free reads from the actual runtimes without creating a purchase, releasing coverage or granting an entitlement. Source-only resolver tests do not accept hosted parity. |

This expands the previous API-only activation to Dashboard/jobs and therefore
requires separate owner authorization before hosted writes or deployment. Normal
Vercel CLI authentication also needs restoration before using the release path.
No mobile build/upload/OTA, web checkout, WEB reconciliation switch, Paystack
subscription credential, public native checkout, provider setup or wider reviewer
allowlist is included. Do not use browser redeploy to bypass the normal release
checks. This audit is documentation-only; existing focused source evidence below
is reused. `git diff --check` and local documentation links are the new checks.

Brain impact updated locally in `.brain/BRAIN.md`, `.brain/tasks/in-progress.md`
and `.brain/features/owner-wide-billing.md`. Apple remains **2/6 (33.3%)**;
the installed TestFlight enrollment/Restore proof remains valid and distinct from
this open cross-runtime check.

Status: source correction only. No deployment, hosted environment write, payment,
provider activation or new entitlement grant. Paystack web checkout/receiver remain
independently disabled. The public paid-launch objective remains 2/4 accepted.

## Cause and scope

The API Production billing settings do not configure other processes. Dashboard
shell/settings use shared DB plan readers, and commercial-order-reminder jobs call
getRetailOpsOwnerPlanIds. Those readers require ownerBillingRuntime and, for the
explicit Apple reviewer exception, appStoreReviewOwnerIds in their own process.
The jobs sync allowlist omitted every owner/store/reviewer setting and DEV_PROFILE,
so a deploy could discard configuration required to see an existing paid owner.

The existing selected-profile jobs wrapper now forwards only five additional
server settings: OWNER_BILLING_ENABLED, STORE_BILLING_ENABLED,
STORE_BILLING_ENVIRONMENT, APP_STORE_REVIEW_SANDBOX_ENABLED and
APP_STORE_REVIEW_OWNER_IDS. Its existing selected-file isolation removes shell/base
fallbacks. DEV_PROFILE is derived from the already-verified APP_ENV rather than
sourcing an arbitrary selector. Omitted boolean flags explicitly become false;
omitted store environment becomes empty, and absent/disabled reviewer IDs become
[]. A later sync therefore revokes previously deployed opt-ins.

No Paystack subscription credential or WEB_BILLING flag is added to the jobs
allowlist. Existing generic gateway configuration is unchanged. Actual entitlement,
provider/environment matching, owner coverage, consent and API authorization
continue through the existing shared policy. The change does not enable jobs or
any payment provider merely by being committed.

## Verification

A new real-resolver regression failed before the fix because the selected owner
flag was dropped. Focused jobs deployment-wrapper and owner review-policy tests
pass after the fix. They cover selected Production reviewer Apple→Sandbox only,
ordinary/Google/Paystack preservation, Preview isolation, shell inheritance refusal,
revocation of missing flags/IDs, and omission of web/scoped credentials. The wrapper
suite uses a local fake CLI, no Trigger deployment or provider request.

Final focused/scoped/source gates are recorded at the checkpoint below. No frontend
source changed; ordinary browser smoke is not repeated for this jobs-only change.
No schema/API/procedure changed and no database command is needed.

## Open acceptance

Deploying this source is separate authorization. The jobs runtime configuration
must be inspected against the reviewed selected file and tested using existing data
without sending a reminder. Dashboard server-only owner/store/reviewer settings
must likewise be reviewed in its own hosted project, preserving default-off web
checkout/receiver/public native checkout. API-only flags are not cross-runtime
acceptance. Actual paid coverage/retained Free semantics across API, Dashboard and
jobs, hosted web checkout/signed receipts, company compliance and international
capability remain open.

## Checkpoint and Brain impact

- Offline QA doctor passes (no runtime probe).
- New regression:18 pass/1 fail before the source fix. Final focused suite:
  21 tests/239 assertions pass, including the actual selected-file CLI boundary
  and shared reviewer resolver.
- Scoped fast plan/run used exactly four owned paths: scripts/trigger-deploy-profile.mjs,
  scripts/trigger-deploy-profile.test.ts, this receipt, and
  packages/assistant/impact/2026-11-08-billing-reader-job-config.json.
  Fast284 tests/1813 assertions, QA tooling types and changed-file Biome pass.
- H01 coverage snapshot current; H02 impact gate passes. No capability/procedure
  row or shared snapshot was changed.
- Installed Trigger syncEnvVars implementation retains string values including
  empty resets and DEV_PROFILE in its override layer; neither name is stripped.
  This is source-boundary inspection, not a hosted deployment receipt.
- git diff --check passes. Existing application/payment type and policy evidence
  is reused; none of those implementations or signatures changed in this slice.

Brain impact checked and updated locally (ignored):
.brain/BRAIN.md, .brain/tasks/in-progress.md,
.brain/features/owner-wide-billing.md and
.brain/decisions/2026-11-08-web-paystack-only.md. No schema/API/permission changes.
No new provider actions, deployment approval or cross-runtime acceptance implied.

Verified source byte identity:


- `scripts/trigger-deploy-profile.mjs`: SHA-256 `0914c1da35910ffb7fa9a60e43f3dda1c1329899170ac151eb5b7943659670b9`.

- `scripts/trigger-deploy-profile.test.ts`: SHA-256 `61a34e66dc6d55c7bcf5110f7899eb7649e15476ac22fde422eace6b1764f826`.
