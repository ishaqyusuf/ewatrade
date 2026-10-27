# Payment-report notification plan controls

27 October 2026. Local implementation; no deployment or live delivery.
Oversight direction **01 v3** selected by the owner:
`c48516ad-f623-4eaa-b814-cf5cf95ab3d9` at
https://workshop.localhost/oversight/plans/payment-notifications.
Owning chat `01a17da9-5333-74b2-b9c2-181c2ec4cd20` owns policy/quota/schema and
Oversight UI. Banking chat `01a17856-d3d7-7301-9205-4d041e5117eb` owns bank
recipients, report submission, transport/jobs and bank UI integration.

## Configuration authority

Existing tiers are Free, Starter, Growth and Pro. Each has independent Email and
WhatsApp enabled flags and monthly caps. The default is disabled/0 for every
channel/tier. Missing, invalid or unavailable policy never grants sending.
Explicit `null` is unlimited; zero blocks even when enabled. Values must be
nonnegative safe integers. No prices or broader notification features are added.

EwaTrade `SystemConfiguration` key `payment-report-notifications:v1` owns the
revisioned whole-tier policy. Existing plan/subscription resolution owns effective
plan, lifetime and launch/manual grants; owner-wide billing remains independently
staged. No client-supplied plan, Tenant or usage grants authority.

Oversight requires a current active owner assigned EwaTrade. A shared-locked
employee check binds an audited command to actor, reason, expected revision and
canonical digest before remote I/O. The unchanged command ID recovers the original
result after an unknown HTTP outcome. Stale revision conflicts require review.
EwaTrade atomically saves policy, durable audit command and ordered change job.

Existing service configuration is reused without enabling/changing credentials:
Oversight `EWATRADE_OPS_URL`, `EWATRADE_OPS_READ_KEY`, `EWATRADE_OPS_WRITE_KEY`,
`EWATRADE_OPS_ENABLED`; product `OVERSIGHT_READ_KEY` and independent
`OVERSIGHT_WRITE_KEY`. Writes require a distinct key and the main API's explicit
write opt-in. The standalone read-only Oversight service rejects PUT. Pointing at
a read-only service yields an unavailable write, never a false successful save.

## Source and endpoints

- `packages/utils/src/payment-report-notification-policy.ts` exports strict
  policy/write schemas, UTC periods and `PaymentReportNotificationEligibility`
  through `@ewatrade/utils/payment-report-notification-policy`.
- `@ewatrade/db/payment-report-notifications` exports policy, eligibility,
  reservation/outcome, ordered fanout and authorized notice primitives.
- `packages/oversight/src/payment-notifications.ts` serves GET/PUT
  `/api/oversight/v1/payment-notifications`, GET `/businesses` and
  `/usage/:tenantId`. GET uses the read credential; PUT uses the write credential.
- Sibling Oversight `office.paymentNotificationPolicy`,
  `savePaymentNotificationPolicy`, `paymentNotificationBusinesses` and
  `paymentNotificationUsage` call the service through owner-gated operations.
  Selected UI lives at `/payment-notifications?project=ewatrade` and reuses
  standard table, modal, forms, tRPC and loading/error components.
- Parent banking integration owns `businessBanking.notificationEligibility`,
  settings, notices and retry routes. Their acceptance is recorded in that chat.

The eligibility response has `schemaVersion:1`, `scope:'payment_report'`, server
`policyRevision`, current `planId`, UTC `startsAt/resetsAt` and per-channel
`available/enabled`, discriminated budget (`limited`, `unlimited`, `unknown`),
nullable `used/reserved/remaining` and reason (`available`, `policy_missing`,
`policy_invalid`, `plan_disabled`, `quota_exhausted`, `unavailable`). Null usage is
unknown, never zero. Null remaining is unlimited only with an available explicit
unlimited budget. UI must require `available === true` and fail closed while
loading or unavailable. Save and dispatch repeat authority and quota checks.

## Atomic admission and recovery

Caps apply per Business (Tenant), channel and UTC calendar month. Each recipient
delivery consumes one unit. A three-person report reserves three units together;
insufficient capacity never silently picks staff. Tier/cap changes retain usage
and reservations. Lower caps block new admission/start while preserving history.

The unique logical intent is Tenant/report/recipient, excluding channel. The
first reservation binds channel and original recipient identities; report replay
and later settings edits cannot add another send or switch an existing intent.
Reserve only during the initial report submission. Blocked reports remain in-app;
there is no later scan that retroactively sends old reports after plan activation.

`reservePaymentNotificationGroupInTransaction(tx,{tenantId,reportId,now?})`
derives settings, recipients and channel; returns reserved/existing/blocked plus
intent IDs. Missing/invalid policy returns blocked before writes. The root wrapper
is `reservePaymentNotificationGroup`. Current verified contacts and ordinary
Store/order creator visibility are required for the whole selected group.

`startPaymentNotificationDispatch(db,{tenantId,intentId,claimId,
expectedDestination,now?})` repeats policy, scope, saved channel and contact checks.
A destination mismatch cancels before I/O and releases its reservation. Only a
fresh RESERVED→SENDING transition returns `maySend:true`. Existing SENDING,
UNKNOWN or finished intents never restart. Provider I/O stays outside transactions.

Before start, all unstarted siblings crossing a UTC month reserve the new month
as one group or none. Their old reservations move atomically. After start,
settlement always uses that admission bucket, even if the provider responds later.
Accepted moves reserved→used once; definitive rejection releases once. Unknown or
crashed started sends retain capacity and require reconciliation. Contradictory
outcomes refuse. `markStalePaymentNotificationsUnknown` cannot free/resend.

`cancelPaymentNotificationReservation` affects RESERVED only.
`retryPaymentNotificationDispatch` accepts only definitive REJECTED, binds the
same intent/channel, reserves current capacity and requires fresh Owner/Admin
`actorUserId` under a shared membership lock. No UNKNOWN retry or channel fallback.

## Policy notices and bank choices

Durable revision jobs process in order, with resumable claims/cursors. Notice
insertion and cursor progress share a transaction; one notice is unique per
Business/revision, with per-membership read receipts. Generic Activity stays
unreleased. Parent jobs must process in-app policy work independently of the
external-delivery activation flag; providers remain separately gated.

Only active Businesses already using configured bank alerts are affected:
settings `createdAt <= change.createdAt`. Compare old/new effective current-plan
entitlements, including enabled flags and caps. `selectedPolicyRevision` records
the policy a person explicitly reviewed; an older job cannot overwrite a later
human choice. Automatic `updatedAt` is not a human-review marker.

Policy-disabled WhatsApp can derive Email only for eligible new intents when
Email is enabled, the complete group has verified email and sufficient capacity
can be reserved. Saved preference remains WhatsApp. Quota exhaustion alone never
switches channels. Disabling Email pauses effective Email without a WhatsApp
fallback. A paused effective channel remains null until explicit review; enabling
a plan never automatically reactivates it or switches it back to WhatsApp.

New WhatsApp availability invites configuration. Notices report actual enabled
and cap changes without promising delivery before eligibility. They reach current
Owner/Admin or selected staff whose current bank-linked report/order scope permits
reading. Cashier/operator creator filters apply. Return only authorized account
IDs and a `bookId` when unambiguous. Revoked/foreign members are refused; alert
selection grants neither payment-review nor Finance administration permission.

## Verification and remaining acceptance

- [x] Source-backed discovery and checkout/file ownership.
- [x] Three canonical directions published/reviewed; old history retained.
- [x] Exact owner selection and API/schema split recorded.
- [x] Policy, quota, fanout and selected Oversight UI implemented.
- [ ] Finish authenticated UI acceptance and final verification record.
- [ ] Commit owned changes and link completed implementation evidence.

Current evidence: pure policy6/35; service credential/auth3/8; Oversight owner and
audit2/16; UI helpers6/27; strict owned graph and all7 Oversight workspace types;
154 scoped fast tests/741 assertions; H01/H02 pass. Real SQL2-session quota suite
1/45 and late-policy fence suite1/11 pass with exact fixture cleanup/rollback.
Actual global policy remains unchanged. Narrow fast scope excludes unrelated
working changes; it is not release/full-feature acceptance.

Prisma generated `20261027151308_payment_report_notifications` and
`20261027153554_payment_alert_policy_selection`. An initial migrate/push overlap
caused CREATE-existing failure, disclosed and recovered after zero schema diff
using official resolve, then successful sequential canonical migrate/push. No
reset, handwritten migration or old157SQL changes. Only the verified local Neon
target was used. Product auth redirects correctly to local Oversight login;
authenticated modal/save/usage acceptance awaits the owner's sign-in. No live
configuration, real transport, deployment, push or merchant payment mutation.

Initial design used the authorized Codex fallback after a separate Claude request
returned no output in ten minutes. Selected UI implementation was delegated to a
new verified Claude Opus5.5/high session `96cd5af8-1255-4317-b769-c330989d2a67`.
It staged new files only; root reviewed/applied them without bank UI overlap.
Office policy is excluded from merchant assistant tools; bank setup remains
form-only. H02 impact record preserves that classification.
