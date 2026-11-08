# Production Apple reviewer configuration plan — 8 November 2026

Status: metadata-only preparation. No environment value was decrypted, no setting
was applied, and no deployment or provider notification URL changed. The candidate
is not yet pinned; shared source gates remain required before execution.

## Target and precedence

At 15:08:48 WAT, the existing authenticated Vercel API inventory resolved
`ewatrade-api`, project `prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh`, Production only.
Project and all paginated linked shared metadata were inspected without accessing
value fields. All seven proposed settings have no linked exact-name or
`EWATRADE_`-prefixed shared entry. APP_ENV and DEV_PROFILE exist as sensitive
Production project rows; their values were not read. Preview, Dashboard, Marketing
and shared settings are outside this proposed mutation scope.

The runtime shared-env helper fills only its explicit allowlist and gives plain
names priority. These billing/reviewer flags are not on that mapping allowlist.
Use plain API project keys; do not introduce prefixed shared billing flags.

| Plain Production API key | Proposed value | Current metadata / operation |
| --- | --- | --- |
| STORE_BILLING_ENABLED | true | Existing sensitive row; bounded update if needed |
| OWNER_BILLING_ENABLED | true | Absent; create sensitive Production-only row |
| STORE_BILLING_ENVIRONMENT | production | Existing sensitive row; bounded update if needed |
| APP_STORE_REVIEW_SANDBOX_ENABLED | true | Absent; create sensitive Production-only row |
| APP_STORE_REVIEW_OWNER_IDS | One verified immutable User ID in JSON array | Absent; create sensitive Production-only row |
| STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED | false | Existing sensitive row; bounded update if needed |
| APP_STORE_SANDBOX_FORWARD_ENABLED | true | Absent; create sensitive Production-only row |

The exact reviewer ID is drawn from the top-level `id` in the existing private
reviewer capture, with `emailVerified=true`, never from an email or client input.
It appears only in the mode-0600 private plan. This table describes desired values;
metadata presence does not establish any current scalar value or rollout state.

## Execution ordering and prerequisites

1. The release coordinator must finish combined source/assistant/type checks,
   review the payment-policy interaction and pin a clean committed candidate in
   the current checkout. No worktree or dirty-candidate bypass.
2. Re-read the target metadata and compare row IDs, target, type and modification
   revisions with this inventory. Stop on drift or unexpected shared/own entries.
3. Immediately before an authorized apply, securely capture the three existing
   values as protected rollback before-images. They were deliberately not read
   in this metadata-only task. Preserve sensitive storage and target scoping.
   Record each newly created row ID. Skip writes if desired values already match.
4. Confirm actual Production identity, bounded reviewer count/identity, Apple
   verifier/products and unchanged public-checkout closure. Apply only the exact
   intended server scope through the canonical release/configuration process;
   the client profile must not carry reviewer authorization.
5. Explicitly enable and verify ordinary Sandbox forwarding before changing any
   Apple Sandbox notification gateway URL. Preserve the prior Preview receiver's
   valid evidence and existing callback destination for rollback. Any provider
   URL transition belongs to its separate authorized provider action.
6. Deploy the pinned candidate and accept only exact runtime evidence: reviewer
   checkout permitted; unrelated owner/Play/public checkout denied; Apple Sandbox
   transaction and persisted entitlement remain Sandbox. Build, internal upload,
   device money/lifecycle acceptance and public submission remain distinct steps.

OWNER_BILLING_ENABLED changes the global durable adapter boundary; the reviewer
allowlist must not be treated as proof that all other owner-billing or concurrent
web-provider behavior is unaffected. Recheck those paths on the settled candidate.
Do not enable Paystack/public checkout as part of this Apple reviewer plan.

## Rollback

The current canonical Production API alias resolves to Ready deployment
`dpl_7A7vegqRxaiUVanBUsw9RPNcLmHg`, previously accepted source `dafec2e01`.
Retain this exact deployment and its source/runtime evidence before applying.

For immediate runtime recovery, use the existing authorized deployment rollback
path to the retained accepted deployment, then verify canonical health and closed
reviewer/public checkout. This does not itself revert project environment settings
for future deployments.

For configuration rollback, remove only the four rows actually created by this
change, by their recorded IDs, and restore only the three existing rows from the
protected before-images, retaining sensitivity and Production target. Never delete
or replace a previously existing row or alter linked shared settings. Verify IDs
and revisions before each operation; stop on concurrent drift. If an existing row
was a no-op, leave it untouched. Redeploy through the canonical process if needed
and verify the resulting runtime, not metadata alone. Any provider callback change
must be restored using its separately recorded previous destination.

Exact value restoration is a prerequisite of apply, not a completed capability:
the protected before-images do not exist yet because this task is metadata-only.

## Evidence and Brain

Private plan: `/private/tmp/ewatrade-reviewer-config-plan.private.json` (0600),
including exact immutable reviewer ID and metadata row IDs/revisions. Sanitized
names-only output: `/private/tmp/ewatrade-reviewer-config-metadata.safe.log`.
No secret values, reviewer ID or customer data are committed in this receipt.

Validation: complete metadata pagination, exact project, verified private reviewer
capture, source precedence and current API alias inspection pass. Documentation
whitespace/scope review passes. No source/UI tests repeated for this read-only
configuration preparation. The local iOS signing Brain packet links this handoff;
the Apple owner retains billing/candidate acceptance documentation ownership.
