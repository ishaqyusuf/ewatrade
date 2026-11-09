# Bounded Preview billing-readiness read plan — 9 November 2026

Status: **prepared for root review; no connected audit executed**. This read-only
readiness work is already within authorized Apple acceptance. The review below
is the coordinator's technical review required before execution, not a request
for another owner approval. No phone question or store action is needed now.

The [offline reuse assessment](2026-11-09-preview-sandbox-lifecycle-reuse-assessment.md)
identifies candidate evidence and gaps. Original store-account restoration is
owner-confirmed; account inspection is closed. Preserve signed10 and the original
reviewer purchase/coverage. I03 remains accepted; no I05 credit follows from this
readiness audit, even if every permitted read succeeds.

## Prepared executable and immutable case

Private mode0600 files:

- `/private/tmp/ewatrade-preview-readiness-audit-2026-11-09.mjs`
- `/private/tmp/ewatrade-preview-readiness-audit-2026-11-09.test.mjs`
- `/private/tmp/ewatrade-preview-readiness-case-template-2026-11-09.private.json`

The template has reviewApproved=false, null review/expiry times, and both exact-
scope/artifact review fields false. It refuses before provider/DB imports. Root
reviews the complete executable, exact named-scope query and output boundaries
before a copy is marked reviewed. The case binds the script's SHA256 and nonce;
review timestamps must be actual UTC observations, with a maximum30minute window
and at least60seconds remaining before each part. No arbitrary project, owner,
business, environment, artifact ID, SQL or URL can be passed on the command line.

There is one audit case with four bounded parts, separating the two providers in
the hosted-metadata category. Each part has an exclusive private intent and a
sanitized receipt; a part already attempted is not automatically run again.
CLI runtime is capped50seconds per part. Normal Vercel CLI child reads time out
at4.5seconds, exact EAS metadata reads at8seconds; children are stopped at the
deadline. SDK HTTP retry is1attempt. No login/rotation/reset command, interactive
stdin, automatic retry or new authentication prompt is permitted. Existing
normal authentication must work; failure records incomplete/unverified.

Only **after root review**, using a separate reviewed private case file:

```sh
bun --env-file=/dev/null /private/tmp/ewatrade-preview-readiness-audit-2026-11-09.mjs --execute-reviewed-read /private/tmp/ewatrade-preview-readiness-case-reviewed-2026-11-09.private.json web
bun --env-file=/dev/null /private/tmp/ewatrade-preview-readiness-audit-2026-11-09.mjs --execute-reviewed-read /private/tmp/ewatrade-preview-readiness-case-reviewed-2026-11-09.private.json jobs
bun --env-file=/dev/null /private/tmp/ewatrade-preview-readiness-audit-2026-11-09.mjs --execute-reviewed-read /private/tmp/ewatrade-preview-readiness-case-reviewed-2026-11-09.private.json database
bun --env-file=/dev/null /private/tmp/ewatrade-preview-readiness-audit-2026-11-09.mjs --execute-reviewed-read /private/tmp/ewatrade-preview-readiness-case-reviewed-2026-11-09.private.json artifacts
```

These are prepared commands, not a report that they ran. The artifacts part is
optional and needs its separate coordinator-review field. Failures do not prompt
the owner or authorize a second attempt. Other independent completed evidence
keeps its actual scope; unknown values stay unknown.

## 1. Actual hosted metadata, without secret output

**Web part:** existing global Vercel CLI resolution and JSON parsing from the
normal [release tooling](../../release.config.ts). Read only the two canonical
Preview aliases and their known API/Dashboard project names in the existing team.
Require project/owner match, READY, target=preview and a finite source SHA.

Use GET project/deployment/env metadata and the existing GET single-project-env
route only for an allowlist of nonsecret billing/profile flags, registered bundle,
public origin classes and product-mapping shape. Select Preview target entries
with exact deployment-branch precedence; ambiguous entries are not guessed.
There are at most36 Vercel metadata requests, no pagination/retry. Custody fields
are presence/names only: no Apple private key, issuer/key ID, database URL,
reviewer IDs, auth token or other secret is decrypted, emitted or persisted.

One bounded team-shared metadata page is filtered to the two projects and Preview
target, retaining only allowed origin/database names and link metadata. No shared
value is fetched. Pagination makes the shared inventory incomplete rather than
proving absence. Plain values win over supported shared aliases per
[shared-env mapping](../../packages/utils/src/shared-env.ts); unresolved shared
origin values stay unverified. Billing flags are not automatically supplied by
that alias list. Raw provider rows and unexpected values are not saved.

Important output limits: current project settings and a READY deployment do not
independently measure the promoted process's flags. Unknown/unreadable entries
and post-deployment setting changes remain visible. No hosted DB secret is read,
so equality between a hosted DB target and the selected local Preview profile is
explicitly unverified. No health/catalog/task probe is smuggled into metadata.

**Jobs part:** use only the selected `.env.preview` and existing Trigger secret
through [normal profile tooling](../../scripts/trigger-deploy-profile.mjs), pinned
to the explicit mapped Preview project/provider environment. First read APP_ENV
through that exact project URI; a non-Preview result stops before implicit
current-deployment lookup. Read current metadata once and only selected nonsecret
profile/reader/origin settings with HTTP maxAttempts1. No list of secret values,
task trigger, schedule or reminder is used. If the deployment differs from the
last accepted Preview deployment, report its binding as needing review; do not
force reuse or label the old disabled result current plan evidence.

## 2. Exact existing QA owner, PostgreSQL READ ONLY

Root must review `exactNamedScopeValidationReviewed` before this part can run.
The prepared query validates **only the existing approved Jawdah Poultry QA
OWNER**, using its exact saved QA profile email, exact business name, QA data
classification and current ACTIVE OWNER/active-tenant predicates. The private
script pins that label and rejects drift in the existing smoke configuration.
Known source fixtures with Development-only UUIDs are deliberately not reused
as Preview IDs. The query resolves the named scope's IDs internally; it does not
enumerate or choose other users/tenants. LIMIT2 rejects zero or ambiguous matches
before billing reads. This exact resolution boundary is part of root's review;
keep its field false if prior opaque IDs are required instead.

Use the existing selected-Preview [database-isolation guard](../../scripts/database-profile.mjs),
including comparison against the private Production URL without connecting to
Production or printing either URL. In one bounded RepeatableRead transaction:

1. First execute `SET TRANSACTION READ ONLY`, then set local statement timeout5s.
2. Read transaction_read_only and transaction timestamp; require PostgreSQL reports
   on. Transaction timeout20s, maxWait5s. This is not a write-then-rollback scheme.
3. Validate the exact current QA OWNER scope above. No fallback identity lookup,
   all-user/tenant list or customer record is read.
4. Read only explicit Tenant billing JSON paths, the scoped owner's billing
   account/current subscription and purchase count, target/owner active coverage
   counts, and this tenant's legacy subscription/store-purchase presence/count.
   No full tenant metadata, receipt body/token, customer, order, item, staff list,
   content or cross-tenant business identity is selected.
5. Reuse canonical subscription mapping/purchase-slot policy for conflict facts.
   Report cohort/grant/default-plan masking and wrong environment as gaps, not
   something to repair. A missing account is reported, never created.

The normal catalog GET is excluded: [catalog source](../../apps/api/src/trpc/routers/store-subscriptions.ts)
can call getOrCreateOwnerBillingAccount. No catalog, mutation, grant/cohort edit,
fixture, account creation, lock-for-write or schema command is invoked.

Private result fields include scopeVerified/readOnly, snapshot time, finite
provider/plan/status/period facts, account/coverage presence and billing counts,
cohort/independent-grant/default-risk booleans and explicit gaps. Opaque user,
tenant, account and purchase IDs are omitted; only a scope-binding digest is
retained. Data describes the selected isolated Preview DB snapshot, **not a
hosted process read or an independently matched hosted DB target**. The audit
never automatically selects or declares a purchase target ready.

## 3. Optional exact artifact metadata, existing authentication only

Use normal existing global EAS CLI authentication with stdin ignored and CI mode.
Request only the two already-known EAS IDs for historical iOS6 and iOS7; no list,
new artifact discovery, login, download, selection, upload, install, build or OTA.
Require returned ID, project, iOS platform, store distribution and Preview profile/
channel match. Preserve returned status/source/runtime/build and URL-presence
only; never persist signed artifact URLs or account/auth details.

EAS metadata is not fresh Apple TestFlight availability, installed acceptance or
ABI compatibility. No verified exact-ID Apple metadata read route is added here;
that remains unverified rather than using a web session/key by guesswork. Do not
force build6/7 reuse or infer a new-build/public-publishing requirement.

## Output, stop conditions and verification

Stdout contains only part status and private receipt path. Each JSON receipt is
mode0600, with actual start/end times, sanitized metadata/facts or incomplete
reason. Private artifacts omit raw provider errors, credentials, signed payloads,
query parameters containing identities, customer records and artifact URLs.
Vercel auth failure, wrong target, ambiguous scope, failed READ ONLY, missing
schema, expired review window or CLI timeout stops the affected part. No repair,
fallback environment, login prompt, write or automatic repeat follows.

The four independent parts are one bounded readiness case, not a deployment or
life-cycle test. I03/Apple3of6 stays unchanged. All original Free phase/intent/
handle/result, timing correction and restored signed10 evidence remain intact.
Preparation checks: 32 offline fake-port cases passed, including case/hash/time
refusal, Preview branch precedence, secret/ID redaction, wrong target/profile,
READ ONLY before scope reads, and ambiguous/inactive/non-QA scope refusal before
billing reads. The real unreviewed template refused before connected imports;
no intent/result exists for that case. SQL/GET-only/no-domain-mutation, private
modes/hashes, 6 local links and diff checks pass. Core mapping has zero unknown
paths; unchanged prior51tests/254assertions plus QA tooling evidence is reused.
Private mode0600 preparation receipt:
`/private/tmp/ewatrade-preview-readiness-audit-preparation-2026-11-09.evidence.json`.
These are operator-preparation checks, not connected readiness acceptance.

Brain impact: local `.brain/features/native-store-billing.md`,
`.brain/features/owner-wide-billing.md` and `.brain/tasks/in-progress.md`.
Only this read plan is tracked; operator files stay private outside the repository.
