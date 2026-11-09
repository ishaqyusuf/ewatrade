# Original reviewer stored-period advance — 9 November 2026

Status: **same original purchase's stored paid period advanced by24hours and is
active after the historical period end**. This is a bounded stored-state pass,
not renewal-event delivery, a new native plan read or full I05 acceptance.

Root reviewed the [post-period read plan](2026-11-09-original-reviewer-post-period-read-plan.md)
and exact runner SHA256
`f2482c98f0d569435a329fab4009df77695f38682da2b64ac5145846e3443050`,
then independently passed40 offline guards. A fresh coordinator-reviewed case
used the existing protected scope, original signed-purchase capture and accepted
Restore baseline, with all three private-file hashes checked. Technical review
did not authorize a purchase or store control.

Root executed one PostgreSQL READ ONLY RepeatableRead snapshot after the required
19:31:34UTC boundary. SQL snapshot time was **19:54:56.024UTC**; the command
completed19:54:58.238UTC. Current exact captured reviewer IDs, known email/business,
ACTIVE OWNER membership, active tenant and verified email were checked before
billing reads. No alternate target, task, provider API or app reopening was used.

| Fact | Accepted baseline | Actual post-period snapshot |
| --- | --- | --- |
| Original purchase binding | Original captured transaction matches | Same original digest matches subscription and one stored purchase |
| Owner purchase count |1 |1 |
| Paid period end |9November2026,19:26:34UTC |10November2026,19:26:34UTC |
| Stored subscription | ACTIVE | ACTIVE, cancelAtPeriodEnd false |
| Subscription/purchase verifiedAt |9November08:37:17.056UTC |9November19:26:00.254UTC |
| Subscription updatedAt | Not used for this comparison |9November19:26:00.821UTC |
| Active business coverage | Existing covered reviewer business | One active row, correct owner; two historical rows after the previously accepted Release/Cover sequence |

The exact advance is86,400seconds. Both stored period ends agree and exceed the
snapshot time. Verification advanced, but the latest verifiedAt is **before** the
historical19:26:34 period end. Therefore verifiedAfterHistoricalPaidEnd is false;
do not claim this was a new verification performed after expiry.

This confirms the durable projection for the same original purchase. It does not
identify a DID_RENEW event, delivery route, triggering client or every signed
provider fact. Native/API/Dashboard/jobs current plan views were not re-read.
No invoice, new subscription, Restore, failure/grace/cancellation/refund control,
reconciliation write, manual grant, schema change or deployment was performed.
No coordinator app reopen occurred; actual process absence was not re-audited.

Private mode0600 intent/result:
`/private/tmp/ewatrade-natural-renewal-20261109-063ba2a961401e4b-intent.private.json`
and `/private/tmp/ewatrade-natural-renewal-20261109-063ba2a961401e4b.evidence.json`.
They omit raw identity/transaction references,
JWS and credentials. The historical paid end, baseline and original signed
capture remain immutable. The new end is an observation, not a guarantee of
future renewals or permission to buy another chain on this owner.

## Validation and Brain impact

One reviewed command exited0. Actual SQL read-only/current-scope/original-binding,
unchanged count, matching periods, exact24-hour difference and clock-order checks
pass. Forty offline operator checks passed independently without network/DB calls.
Documentation mapping/link/diff checks and unchanged prior core51tests/
254assertions plus QA-tooling types are reused only for their bounded scope.
Apple remains3/6; controlled lifecycle, privacy, declarations and review remain open.
Brain impact: local `.brain/tasks/apple-billing-workshop-handoff-2026-11-08.md`.
