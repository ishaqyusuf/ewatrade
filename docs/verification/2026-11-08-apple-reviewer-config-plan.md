# Production Apple reviewer configuration plan — 8 November 2026

Status: metadata-only preparation. No environment value was decrypted, no setting
was applied, and no deployment or provider notification URL changed. The rollback
section below corrects the earlier assumption that existing values could be backed
up: all three existing rows are literally Vercel `sensitive`, which are unreadable
after creation. The candidate
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
3. Confirm the proposed closed configuration baseline below with the release
   coordinator before any mutation. Exact old-value backups cannot be retrieved
   from the three literal `sensitive` rows. Do not attempt decryption or add runtime
   disclosure to recover them. Preserve storage type/Production scoping and record
   metadata plus each new row ID; compare with known installation receipts where
   available, never infer equality from names or metadata.
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

For configuration rollback, use this explicitly proposed closed baseline only
once the coordinator confirms it as acceptable for the prelaunch state:

| Existing Production row | Proposed rollback value | Provenance |
| --- | --- | --- |
| STORE_BILLING_ENABLED | false | Deliberate closed baseline; original value remains unknown |
| STORE_BILLING_ENVIRONMENT | production | Earlier explicit installation receipt |
| STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED | false | Earlier explicit installation receipt |

The two installation facts are recorded in
[the Apple launch packet](../billing/apple-paid-launch-2026-11-07.md). They do not
prove the unknown STORE_BILLING_ENABLED value. Vercel's
[Secret-type documentation](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types)
confirms existing Sensitive values remain write-only; runtime code can use them,
but project members cannot retrieve them after saving. No before-images exist.
This procedure restores a known closed state, not exact prior bytes.

If an Apple Sandbox callback URL was changed, restore and verify its recorded
prior Preview destination first, while the working forwarding path remains
available. Then remove only the four rows actually created by this change, by
recorded IDs, and update the three existing rows to the confirmed closed baseline,
retaining IDs, sensitive type and Production targets. Never delete/recreate an
existing row or alter shared/Preview settings. Recheck metadata revisions before
each operation and stop on drift. Retain the accepted deployment as immediate
runtime recovery; canonical redeployment must subsequently verify the closed
configuration for future deploys. The baseline's global receiver shutdown and
removal of the owner adapter are intentional rollback consequences and require
checking the prior notification route and unrelated closed paths.

No mutation is authorized by this plan itself. Execution remains held for the
coordinator's confirmation of this concrete baseline and the clean candidate
checks. Exact recovery of the original STORE_BILLING_ENABLED value is unavailable.

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
