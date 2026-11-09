# Original reviewer post-period stored-state observation

Status: **one bounded read prepared; no connected execution**. Root reviews the
exact private runner and case before any query. This is fresh post-period
observation, not another coverage, purchase or Restore test. Mobile release
remains excluded; Apple stays3/6 with I05 open.

## Existing scope and baseline

The existing reviewed Restore snapshot and protected original purchase custody
are available locally. No alternative actor or receipt discovery is necessary.
The [accepted Restore](2026-11-08-apple-purchase-verification.md) snapshot at
08:39:19.318UTC on9November had exactly one original purchase, ACTIVE APP_STORE
Sandbox Starter, verified08:37:17.056UTC, paid end19:26:34UTC and renewal on.
That paid end is historical evidence, not proof of renewal or expiry behavior.

Private files and immutable SHA256 values:

| Existing custody | SHA256 |
| --- | --- |
| /private/tmp/ewatrade-apple-reviewer-readiness.private.json |6335e6b88b2dc35006059c916eb58243250dc860c45f85dacee2f3e3d254c4a6 |
| /private/tmp/ewatrade-reviewer-apple-purchase-capture.private.json | d92d07bfe07aa2c874fc544354350b2af274cdd69f50df07bf63466b515ae359 |
| /private/tmp/ewatrade-reviewer-after-restore-2026-11-09.evidence.json |58a7d9e8df68362ce16b4692adfb5f2b752ab568eab87538d342943188112723 |

The private purchase capture contains exactly one accepted original transaction
binding. Its reference, app account token, signed material and raw IDs are not
copied into this document, a manifest or output. Hashes here bind existing local
custody; they are not a fresh signature verification.

## Prepared reader reuse

The new private copy reuses the existing exact-reviewer Production READ ONLY
snapshot query pattern, private scope and canonical storePurchaseDigest:
/private/tmp/ewatrade-reviewer-natural-renewal-read-2026-11-09.mjs,
SHA256f2482c98f0d569435a329fab4009df77695f38682da2b64ac5145846e3443050.
The review diff against the original Restore snapshot is the same stem with
.review.diff. Both are protected mode0600. No new infrastructure or task is used.

The earliest permitted snapshot is19:31:34UTC9November (20:31:34Lagos), five
minutes after the historically recorded paid end. Both operator time and actual
SQL transaction time must meet this boundary. A new case needs exact source and
custody hashes, reviewed scope, nonce, review time and short expiry. The template
/private/tmp/ewatrade-reviewer-natural-renewal-template-2026-11-09.private.json
remains reviewApproved=false with no executable nonce/window.

Before importing the database client or issuing a query, the runner verifies
private nonsymlink custody, historical baseline and the exact reviewed case,
then creates an exclusive private intent. Any existing intent/result refuses
another attempt. The configured Production profile and existing single-reviewer
policy must match; neither is modified.

Within one RepeatableRead transaction, SET TRANSACTION READ ONLY is first;
statement timeout is5seconds, followed by actual transaction_read_only=on and
transaction_timestamp confirmation. Current membership is rechecked against the
captured owner/business IDs AND exact reviewer email/business name, requiring
one ACTIVE OWNER, active tenant and verified email. Scope refusal stops before
billing reads. Only that owner's existing billing account/current subscription,
the original-digest-filtered purchase (take2 maximum) and business coverage
counts/binding are read. Transaction timeout30seconds, maxWait10seconds and
whole-run deadline50seconds are retained as bounded safeguards. Failures preserve
safe stage/code only, without raw database errors or another attempt.

## Observation and interpretation

Output contains SQL snapshot time, current stored status/period/verified/update
times, baseline times, counts and scope/purchase/coverage match booleans.
Subscription details are omitted if the current subscription is not the same
original APP_STORE Sandbox binding. No raw IDs, digest, product reference, token,
credential, JWS or customer record is emitted.

Stored period advancement requires the original purchase and current subscription
to match each other and have a later paid end than the baseline. A separate
boolean records whether that matching period is ACTIVE and beyond snapshot time.
Fresh verification alone, an ACTIVE label, application courtesy/grace or an
assumed daily schedule cannot produce a positive period-advance result.

This reader does not observe DID_RENEW or callback delivery directly, attribute
which job/notification updated a projection, reopen the app, contact Apple,
reconcile a purchase, trigger a task/reminder, change a store control or write
billing data. No advancement means only that advancement was not stored at that
snapshot; it does not diagnose Apple's renewal state or authorize polling.
Root must classify the actual result within the
[existing lifecycle sequence](2026-11-09-build10-finish-and-lifecycle-sequence.md).

## Verification and Brain impact

Forty offline checks passed with fake database ports and zero connections or
provider calls. They cover custody/baseline, review/time bounds, READ ONLY before
scope, current exact membership, no billing read on scope refusal, original
binding, period comparison, stale ACTIVE/fresh-verification false positives and
output elision. Companion .test.mjs replays read-only by default; optional receipt
writing requires a new explicit private path and never overwrites evidence.
The initial pass receipt is
/private/tmp/ewatrade-reviewer-natural-renewal-offline-2026-11-09.evidence.json.
Documentation links, identities, mapping and diff are checked; unchanged prior
offline doctor/core51tests254assertions/QA-tooling types are reused for their
actual scope. No natural renewal is accepted by preparation.

Brain impact: local .brain/features/native-store-billing.md,
.brain/features/owner-wide-billing.md and .brain/tasks/in-progress.md.
