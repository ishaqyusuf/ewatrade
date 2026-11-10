# Dormant Paystack Preview configuration — 10 November 2026

Status: the exact owner-approved configuration save is complete. No deployment,
checkout/receiver/QA-adapter activation, Production setting, webhook, company
compliance, financial event, grant or business coverage was performed.
Website-payment acceptance remains2/4 (50%); this is configuration preparation.

## Authorization and target

Automatic approval review originally rejected the hosted write before execution
because the general payment task did not specifically authorize transmitting the
existing test secret to Vercel. The owner then explicitly approved copying the
existing EwaTrade Paystack TEST secret and six-plan test configuration into the
EwaTrade API project, restricted to Preview branch preview, with every payment
switch disabled, no deployment and no Production changes. That bounded approval
was used; no alternate credential/export or workaround was attempted.

Pinned target: ewatrade-api / prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh,
team_BV5rgKHJH4fMyFL1YfscZIZK, target preview, gitBranch preview.
The existing selected project binding was checked before private requests were
prepared. Fresh project inventory refused create if any planned name existed.

| Created setting | Storage / submitted value |
| --- | --- |
| PAYSTACK_SUBSCRIPTION_SECRET_KEY | Sensitive; existing sk_test_ credential, never printed |
| WEB_BILLING_PRODUCTS | Encrypted; existing six reviewed NGN monthly test mappings |
| WEB_BILLING_ENVIRONMENT | sandbox |
| WEB_BILLING_RETURN_URL | https://preview-dashboard.ewatrade.com/settings/billing |
| WEB_BILLING_ENABLED | false |
| WEB_BILLING_RECONCILIATION_ENABLED | false |
| WEB_BILLING_RELEASE_APPROVED | false |
| PAYSTACK_USD_ENABLED | false |
| PAYSTACK_INTERNATIONAL_ENABLED | false |
| PAYSTACK_QA_SUBSCRIPTIONS_TEST_ADAPTER_ENABLED | false |

OWNER/STORE/reviewer modes, native catalog, Apple credentials and existing
settings were unchanged. No owner-country mapping was invented: selected existing
QA owner Bola Pilot has no OwnerBillingAccount yet. Its canonical bootstrap and
reviewed NG binding remain part of subsequent normal Preview test setup.

## Execution and verification

- Ten individual object-body API creates, without upsert. A private mode0600
  journal records dispatch before each POST, then its confirmed ID/key/type/target/
  branch. Private request bodies use the existing key and catalog; no secret is in
  command arguments, repository files, logs or this receipt. No key was rotated.
- All ten create responses confirmed the requested names, types and Preview branch
  scope. No unknown POST was retried and no extra settings were created.
- A fresh CLI inventory contains84 metadata rows, up from74. Each new setting has
  one unique key with target preview, gitBranch preview and the requested type.
  The CLI JSON omits variable IDs, so the initial finalizer's ID-match assumption
  stopped verification after all writes had completed. The real unique key/scope/
  type metadata was then checked without repeating any POST. Creation IDs remain
  in the private journal. This was a metadata-contract correction, not a write retry.
- The false activation values and sandbox/return/catalog were validated in the
  submitted request bodies before dispatch. No sensitive value was decrypted or
  read back; secret/catalog value equality and deployed-process access remain
  unclaimed. Metadata verification does not certify an effective hosted runtime.
- No deploy command was issued. Existing Preview deployments do not qualify as
  payment acceptance from this settings save. Later rollout/activation requires
  its own exact candidate, matching existing-data smoke and approved scope.

Private journal: /private/tmp/ewatrade-paystack-preview-preparation-2026-11-10/journal.json.
It contains exact approval scope, safe metadata and protected body-file references;
no private body or provider response is published in Git.

## Source and remaining acceptance

Source safeguards/QA adapter: b05c21281, focused52/230, full API types and scoped
fast285/1820. Reuse that unchanged evidence. Root separately repaired the historical
H01 omissions in e706c8241; its actual H01 and focused evidence pass. That resolves
this source gate and does not approve a payment rollout or certify foreign work.

Next: coordinated matching Preview rollout; canonical QA owner/country binding;
receiver plus strict QA adapter/new-checkout activation; matching Test webhook;
owner-submitted test checkout; verified signed receipt, coverage and lifecycle/
concurrency acceptance. Company compliance and live/international approval stay
with the owner. No Production or live USD use is authorized by this save.

Final three-owned-document quick plan/run passes51 tests/254 assertions, QA
tooling types and diff/link checks; zero unknown mappings. Runtime/type/payment
source checks are reused from unchanged b05 evidence; no redundant feature suite
was run for documentation. Brain impact:
local .brain/BRAIN.md, .brain/tasks/in-progress.md,
.brain/features/owner-wide-billing.md, .brain/features/mobile-dev-preview-qa-accelerator.md,
.brain/api/contracts.md, .brain/api/permissions.md and
.brain/decisions/2026-11-08-web-paystack-only.md. No schema/RPC/permission change.
